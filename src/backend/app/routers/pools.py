from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from sqlalchemy.orm import joinedload
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.core.auth import require_admin
from app.core.database import get_db
from app.models.cfbd import CfbdGame
from app.models.pool import Pool, PoolGame, PoolSubmission
from app.schemas.pool import (
    PoolCreate, PoolSchema, PoolDetailSchema, PoolPatch,
    PoolGameAdd, PoolGameSchema, CfbdGameSchema,
    PoolGamesBracketUpdate, PoolGamesMultiplierUpdate,
)
from app.services.cfbd import fetch_games

router = APIRouter(prefix="/admin/pools", dependencies=[Depends(require_admin)])


def _cfbd_api_to_row(g: dict, year: int) -> dict:
    raw_date = g.get("startDate", "")
    try:
        start_date = datetime.fromisoformat(raw_date.replace("Z", "+00:00")).replace(tzinfo=None)
    except (ValueError, AttributeError):
        start_date = datetime.utcnow()
    return {
        "id": g["id"],
        "home_team": g.get("homeTeam", ""),
        "away_team": g.get("awayTeam", ""),
        "start_date": start_date,
        "start_time_tbd": g.get("startTimeTBD", False),
        "week": g.get("week"),
        "bowl_name": g.get("notes") or None,
        "season_type": g.get("seasonType", "regular"),
        "season_year": year,
        "home_classification": g.get("homeClassification") or None,
        "away_classification": g.get("awayClassification") or None,
        "home_conference": g.get("homeConference") or None,
        "away_conference": g.get("awayConference") or None,
        "conference_game": g.get("conferenceGame", False),
        "neutral_site": g.get("neutralSite", False),
        "completed": bool(g.get("completed", False)),
        "home_score": g.get("homePoints"),
        "away_score": g.get("awayPoints"),
        "last_synced_at": datetime.utcnow(),
    }


def _cfbd_api_to_schema(g: dict) -> CfbdGameSchema:
    return CfbdGameSchema(
        id=g["id"],
        home_team=g.get("homeTeam", ""),
        away_team=g.get("awayTeam", ""),
        start_date=g.get("startDate", ""),
        start_time_tbd=g.get("startTimeTBD", False),
        week=g.get("week"),
        bowl_name=g.get("notes") or None,
        season_type=g.get("seasonType", "regular"),
        home_classification=g.get("homeClassification") or None,
        away_classification=g.get("awayClassification") or None,
        home_conference=g.get("homeConference") or None,
        away_conference=g.get("awayConference") or None,
        conference_game=g.get("conferenceGame", False),
        neutral_site=g.get("neutralSite", False),
        completed=bool(g.get("completed", False)),
        home_score=g.get("homePoints"),
        away_score=g.get("awayPoints"),
    )


_UPSERT_COLS = 19  # number of columns in cfbd_games
_BATCH_SIZE = 32767 // _UPSERT_COLS  # max rows per upsert to stay under asyncpg's 32767 param limit


async def _upsert_cfbd_games(db: AsyncSession, rows: list[dict]) -> None:
    if not rows:
        return
    update_keys = [c for c in rows[0] if c != "id"]
    for i in range(0, len(rows), _BATCH_SIZE):
        batch = rows[i:i + _BATCH_SIZE]
        stmt = pg_insert(CfbdGame).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={c: stmt.excluded[c] for c in update_keys},
        )
        await db.execute(stmt)


@router.get("", response_model=list[PoolSchema])
async def list_pools(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Pool, func.count(PoolGame.id).label("game_count"))
        .outerjoin(PoolGame, (PoolGame.pool_id == Pool.id) & (PoolGame.deleted_at.is_(None)))
        .where(Pool.deleted_at.is_(None))
        .group_by(Pool.id)
        .order_by(Pool.season_year.desc(), Pool.created_at.desc())
    )
    rows = result.all()
    pools = []
    for pool, game_count in rows:
        pool.game_count = game_count
        pools.append(pool)
    return pools


@router.post("", response_model=PoolSchema)
async def create_pool(body: PoolCreate, db: AsyncSession = Depends(get_db)):
    pool = Pool(name=body.name, season_year=body.season_year)
    db.add(pool)
    await db.commit()
    await db.refresh(pool)
    pool.game_count = 0
    return pool


@router.get("/cfbd-games/{year}", response_model=list[CfbdGameSchema])
async def get_cfbd_games(year: int, db: AsyncSession = Depends(get_db)):
    try:
        games = await fetch_games(year)
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch games from CFBD")

    await _upsert_cfbd_games(db, [_cfbd_api_to_row(g, year) for g in games])
    await db.commit()

    return [_cfbd_api_to_schema(g) for g in games]


@router.get("/{pool_id}", response_model=PoolDetailSchema)
async def get_pool(pool_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Pool).where(Pool.id == pool_id, Pool.deleted_at.is_(None)))
    pool = result.scalar_one_or_none()
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")

    games_result = await db.execute(
        select(PoolGame)
        .options(joinedload(PoolGame.cfbd_game))
        .where(PoolGame.pool_id == pool_id, PoolGame.deleted_at.is_(None))
        .order_by(PoolGame.sort_order)
    )
    games = list(games_result.scalars().all())

    return PoolDetailSchema(
        id=pool.id,
        name=pool.name,
        season_year=pool.season_year,
        is_featured=pool.is_featured,
        submissions_open=pool.submissions_open,
        submissions_due_at=pool.submissions_due_at,
        game_count=len(games),
        created_at=pool.created_at,
        games=[PoolGameSchema.model_validate(g) for g in games],
    )


@router.patch("/{pool_id}", response_model=PoolSchema)
async def patch_pool(pool_id: int, body: PoolPatch, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Pool).where(Pool.id == pool_id, Pool.deleted_at.is_(None)))
    pool = result.scalar_one_or_none()
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    if body.is_featured is not None:
        pool.is_featured = body.is_featured
    if body.submissions_open is not None:
        pool.submissions_open = body.submissions_open
    await db.commit()
    await db.refresh(pool)
    pool.game_count = 0
    return pool


@router.delete("/{pool_id}")
async def delete_pool(pool_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Pool).where(Pool.id == pool_id, Pool.deleted_at.is_(None)))
    pool = result.scalar_one_or_none()
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    now = datetime.utcnow()
    pool.deleted_at = now
    await db.execute(update(PoolGame).where(PoolGame.pool_id == pool_id).values(deleted_at=now))
    await db.execute(
        update(PoolSubmission).where(PoolSubmission.pool_id == pool_id).values(deleted_at=now)
    )
    await db.commit()
    return {"ok": True}


@router.post("/{pool_id}/games", response_model=list[PoolGameSchema])
async def add_pool_games(pool_id: int, body: PoolGameAdd, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Pool).where(Pool.id == pool_id, Pool.deleted_at.is_(None)))
    pool = result.scalar_one_or_none()
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")

    try:
        all_games = await fetch_games(pool.season_year)
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch games from CFBD")

    game_map = {g["id"]: g for g in all_games}
    valid_ids = [cid for cid in body.cfbd_game_ids if cid in game_map]

    # 1. Upsert cfbd_games rows
    await _upsert_cfbd_games(db, [_cfbd_api_to_row(game_map[cid], pool.season_year) for cid in valid_ids])

    # 2. Insert pool_games linkage (skip duplicates)
    for i, cfbd_id in enumerate(valid_ids):
        link_stmt = (
            pg_insert(PoolGame)
            .values(pool_id=pool_id, cfbd_game_id=cfbd_id, sort_order=i)
            .on_conflict_do_nothing(constraint="uq_pool_games_pool_cfbd")
        )
        await db.execute(link_stmt)

    await db.commit()

    # 3. Return inserted rows with game data
    result = await db.execute(
        select(PoolGame)
        .options(joinedload(PoolGame.cfbd_game))
        .where(
            PoolGame.pool_id == pool_id,
            PoolGame.cfbd_game_id.in_(valid_ids),
            PoolGame.deleted_at.is_(None),
        )
        .order_by(PoolGame.sort_order)
    )
    created = list(result.scalars().all())
    return [PoolGameSchema.model_validate(pg) for pg in created]


@router.delete("/{pool_id}/games/{pool_game_id}")
async def remove_pool_game(pool_id: int, pool_game_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PoolGame).where(
            PoolGame.id == pool_game_id,
            PoolGame.pool_id == pool_id,
            PoolGame.deleted_at.is_(None),
        )
    )
    pool_game = result.scalar_one_or_none()
    if not pool_game:
        raise HTTPException(status_code=404, detail="Pool game not found")
    pool_game.deleted_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


VALID_PLAYOFF_SLOTS = {
    'FR1', 'FR2', 'FR3', 'FR4',
    'QF1', 'QF2', 'QF3', 'QF4',
    'SF1', 'SF2',
    'CH',
}

# Which FR slot must be assigned before each QF slot can be assigned
_QF_REQUIRES_FR = {
    'QF1': 'FR4',
    'QF2': 'FR3',
    'QF3': 'FR2',
    'QF4': 'FR1',
}


@router.patch("/{pool_id}/games/bracket", response_model=list[PoolGameSchema])
async def update_bracket(pool_id: int, body: PoolGamesBracketUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Pool).where(Pool.id == pool_id, Pool.deleted_at.is_(None)))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Pool not found")

    pg_ids = [a.pool_game_id for a in body.assignments]
    pg_result = await db.execute(
        select(PoolGame).where(PoolGame.pool_id == pool_id, PoolGame.id.in_(pg_ids), PoolGame.deleted_at.is_(None))
    )
    pool_games = {pg.id: pg for pg in pg_result.scalars().all()}

    for a in body.assignments:
        if a.pool_game_id not in pool_games:
            raise HTTPException(status_code=400, detail=f"pool_game_id {a.pool_game_id} not found in pool")
        if a.playoff_slot is not None and a.playoff_slot not in VALID_PLAYOFF_SLOTS:
            raise HTTPException(status_code=400, detail=f"Invalid playoff_slot: {a.playoff_slot}")

    # Build the full slot → game_id map for validation
    slot_to_game: dict[str, int] = {}
    for a in body.assignments:
        if a.playoff_slot is not None:
            if a.playoff_slot in slot_to_game:
                raise HTTPException(status_code=400, detail=f"Duplicate slot assignment: {a.playoff_slot}")
            slot_to_game[a.playoff_slot] = a.pool_game_id

    # Validate bracket dependencies
    for qf, required_fr in _QF_REQUIRES_FR.items():
        if qf in slot_to_game and required_fr not in slot_to_game:
            raise HTTPException(status_code=400, detail=f"Must assign {required_fr} before {qf}")

    sf_slots = {'SF1', 'SF2'}
    all_qf = {'QF1', 'QF2', 'QF3', 'QF4'}
    if sf_slots & slot_to_game.keys() and not all_qf <= slot_to_game.keys():
        raise HTTPException(status_code=400, detail="Must assign all Quarterfinal games before assigning Semifinals")

    if 'CH' in slot_to_game and not sf_slots <= slot_to_game.keys():
        raise HTTPException(status_code=400, detail="Must assign both Semifinal games before assigning Championship")

    # Apply updates — first clear all playoff_slot on this pool's games, then set
    await db.execute(
        update(PoolGame).where(PoolGame.pool_id == pool_id, PoolGame.deleted_at.is_(None)).values(playoff_slot=None)
    )
    for a in body.assignments:
        pool_games[a.pool_game_id].playoff_slot = a.playoff_slot

    await db.commit()

    all_games_result = await db.execute(
        select(PoolGame).options(joinedload(PoolGame.cfbd_game))
        .where(PoolGame.pool_id == pool_id, PoolGame.deleted_at.is_(None))
        .order_by(PoolGame.sort_order)
    )
    return [PoolGameSchema.model_validate(pg) for pg in all_games_result.scalars().all()]


@router.patch("/{pool_id}/games/multipliers", response_model=list[PoolGameSchema])
async def update_multipliers(pool_id: int, body: PoolGamesMultiplierUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Pool).where(Pool.id == pool_id, Pool.deleted_at.is_(None)))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Pool not found")

    pg_ids = [m.pool_game_id for m in body.multipliers]
    pg_result = await db.execute(
        select(PoolGame).where(PoolGame.pool_id == pool_id, PoolGame.id.in_(pg_ids), PoolGame.deleted_at.is_(None))
    )
    pool_games = {pg.id: pg for pg in pg_result.scalars().all()}

    for m in body.multipliers:
        if m.pool_game_id not in pool_games:
            raise HTTPException(status_code=400, detail=f"pool_game_id {m.pool_game_id} not found in pool")
        if m.multiplier < 1:
            raise HTTPException(status_code=400, detail="Multiplier must be >= 1")
        pool_games[m.pool_game_id].multiplier = m.multiplier

    await db.commit()

    all_games_result = await db.execute(
        select(PoolGame).options(joinedload(PoolGame.cfbd_game))
        .where(PoolGame.pool_id == pool_id, PoolGame.deleted_at.is_(None))
        .order_by(PoolGame.sort_order)
    )
    return [PoolGameSchema.model_validate(pg) for pg in all_games_result.scalars().all()]
