from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models import User
from app.models.cfbd import CfbdTeam
from app.models.pool import (
    Pool,
    PoolGame,
    PoolQuestion,
    PoolSubmission,
    PoolSubmissionGameItem,
    SubmissionAnswer,
)
from app.schemas.pool import (
    GamePickSchema,
    GamePickUpsert,
    MySubmissionSchema,
    PasswordVerify,
    PoolGameWithTeamsSchema,
    PoolQuestionSchema,
    PublicPoolSchema,
    SubmissionAnswerSchema,
    SubmissionAnswersUpdate,
    SubmissionCreate,
    TeamMetaSchema,
)

router = APIRouter(prefix="/submission")

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _team_meta(team: CfbdTeam | None) -> TeamMetaSchema | None:
    if team is None:
        return None
    return TeamMetaSchema(
        school=team.school,
        mascot=team.mascot,
        color=team.color,
        alt_color=team.alt_color,
        logos=team.logos,
    )


@router.get("/pools", response_model=list[PublicPoolSchema])
async def list_open_pools(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Pool)
        .where(Pool.submissions_open.is_(True), Pool.deleted_at.is_(None))
        .order_by(Pool.season_year.desc(), Pool.created_at.desc())
    )
    pools = result.scalars().all()
    return [PublicPoolSchema.from_pool(p) for p in pools]


@router.get("/pools/{pool_id}/games", response_model=list[PoolGameWithTeamsSchema])
async def get_pool_games(pool_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Pool).where(
            Pool.id == pool_id,
            Pool.deleted_at.is_(None),
            Pool.submissions_open.is_(True),
        )
    )
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

    team_names = {g.cfbd_game.home_team for g in games} | {
        g.cfbd_game.away_team for g in games
    }
    teams_result = await db.execute(
        select(CfbdTeam).where(CfbdTeam.school.in_(team_names))
    )
    team_map: dict[str, CfbdTeam] = {t.school: t for t in teams_result.scalars()}

    out = []
    for g in games:
        base = PoolGameWithTeamsSchema.model_validate(g)
        base.home_team_meta = _team_meta(team_map.get(g.cfbd_game.home_team))
        base.away_team_meta = _team_meta(team_map.get(g.cfbd_game.away_team))
        out.append(base)
    return out


@router.get("/pools/{pool_id}/questions", response_model=list[PoolQuestionSchema])
async def get_pool_questions(pool_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Pool).where(
            Pool.id == pool_id,
            Pool.deleted_at.is_(None),
            Pool.submissions_open.is_(True),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Pool not found")

    questions_result = await db.execute(
        select(PoolQuestion)
        .where(PoolQuestion.pool_id == pool_id, PoolQuestion.deleted_at.is_(None))
        .order_by(PoolQuestion.sort_order)
    )
    return [
        PoolQuestionSchema.model_validate(q) for q in questions_result.scalars().all()
    ]


@router.get("/pools/{pool_id}/my-submissions", response_model=list[MySubmissionSchema])
async def get_my_submissions(
    pool_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PoolSubmission)
        .where(
            PoolSubmission.pool_id == pool_id,
            PoolSubmission.submitted_by_user_id == user.id,
            PoolSubmission.deleted_at.is_(None),
        )
        .order_by(PoolSubmission.created_at.desc())
    )
    return result.scalars().all()


@router.post("/pools/{pool_id}/verify")
async def verify_password(
    pool_id: int,
    body: PasswordVerify,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Pool).where(Pool.id == pool_id, Pool.deleted_at.is_(None))
    )
    pool = result.scalar_one_or_none()
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    if pool.password_hash is None:
        return {"ok": True}
    if not _pwd.verify(body.password, pool.password_hash):
        raise HTTPException(status_code=403, detail="Incorrect password")
    return {"ok": True}


@router.post("/pools/{pool_id}/enter")
async def enter_pool(
    pool_id: int,
    body: SubmissionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Pool).where(Pool.id == pool_id, Pool.deleted_at.is_(None))
    )
    pool = result.scalar_one_or_none()
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    if not pool.submissions_open:
        raise HTTPException(
            status_code=403, detail="Submissions are closed for this pool"
        )

    # Self-submission: return existing if one already exists
    if body.on_behalf_of_name == "":
        existing_result = await db.execute(
            select(PoolSubmission).where(
                PoolSubmission.pool_id == pool_id,
                PoolSubmission.submitted_by_user_id == user.id,
                PoolSubmission.on_behalf_of_name == "",
                PoolSubmission.deleted_at.is_(None),
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            return {"submission_id": existing.id}

    submission = PoolSubmission(
        pool_id=pool_id,
        submitted_by_user_id=user.id,
        on_behalf_of_name=body.on_behalf_of_name,
        on_behalf_of_email=body.on_behalf_of_email,
        is_locked=False,
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return {"submission_id": submission.id}


async def _get_owned_submission(
    submission_id: int, user: User, db: AsyncSession
) -> PoolSubmission:
    result = await db.execute(
        select(PoolSubmission).where(
            PoolSubmission.id == submission_id,
            PoolSubmission.submitted_by_user_id == user.id,
            PoolSubmission.deleted_at.is_(None),
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    return sub


@router.get("/{submission_id}/picks", response_model=list[GamePickSchema])
async def get_picks(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_submission(submission_id, user, db)
    result = await db.execute(
        select(PoolSubmissionGameItem).where(
            PoolSubmissionGameItem.submission_id == submission_id,
            PoolSubmissionGameItem.deleted_at.is_(None),
        )
    )
    return result.scalars().all()


@router.put("/{submission_id}/picks/{pool_game_id}", response_model=GamePickSchema)
async def upsert_pick(
    submission_id: int,
    pool_game_id: int,
    body: GamePickUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = await _get_owned_submission(submission_id, user, db)
    if sub.is_locked:
        raise HTTPException(status_code=403, detail="Submission is locked")
    stmt = (
        pg_insert(PoolSubmissionGameItem)
        .values(
            submission_id=submission_id,
            pool_game_id=pool_game_id,
            picked_winner=body.picked_winner,
            picked_margin=body.picked_margin,
        )
        .on_conflict_do_update(
            constraint="uq_submission_game_items_sub_game",
            set_={
                "picked_winner": body.picked_winner,
                "picked_margin": body.picked_margin,
            },
        )
        .returning(PoolSubmissionGameItem)
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.scalars().one()


@router.get("/{submission_id}/answers", response_model=list[SubmissionAnswerSchema])
async def get_answers(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_submission(submission_id, user, db)
    result = await db.execute(
        select(SubmissionAnswer).where(
            SubmissionAnswer.submission_id == submission_id,
            SubmissionAnswer.deleted_at.is_(None),
        )
    )
    return result.scalars().all()


@router.put("/{submission_id}/answers", response_model=list[SubmissionAnswerSchema])
async def upsert_answers(
    submission_id: int,
    body: SubmissionAnswersUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = await _get_owned_submission(submission_id, user, db)
    if sub.is_locked:
        raise HTTPException(status_code=403, detail="Submission is locked")

    # Validate every question_id belongs to this submission's pool.
    valid_q_result = await db.execute(
        select(PoolQuestion.id).where(
            PoolQuestion.pool_id == sub.pool_id, PoolQuestion.deleted_at.is_(None)
        )
    )
    valid_q_ids = set(valid_q_result.scalars().all())
    for a in body.answers:
        if a.question_id not in valid_q_ids:
            raise HTTPException(
                status_code=400,
                detail=f"question_id {a.question_id} not found in pool",
            )

    for a in body.answers:
        stmt = (
            pg_insert(SubmissionAnswer)
            .values(
                submission_id=submission_id,
                question_id=a.question_id,
                answer_text=a.answer_text,
            )
            .on_conflict_do_update(
                constraint="uq_submission_answers_sub_q",
                set_={"answer_text": a.answer_text, "deleted_at": None},
            )
        )
        await db.execute(stmt)
    await db.commit()

    result = await db.execute(
        select(SubmissionAnswer).where(
            SubmissionAnswer.submission_id == submission_id,
            SubmissionAnswer.deleted_at.is_(None),
        )
    )
    return result.scalars().all()


@router.post("/{submission_id}/submit", response_model=MySubmissionSchema)
async def submit_entry(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = await _get_owned_submission(submission_id, user, db)

    games_result = await db.execute(
        select(PoolGame.id).where(
            PoolGame.pool_id == sub.pool_id, PoolGame.deleted_at.is_(None)
        )
    )
    game_ids = set(games_result.scalars().all())

    picks_result = await db.execute(
        select(PoolSubmissionGameItem.pool_game_id).where(
            PoolSubmissionGameItem.submission_id == submission_id,
            PoolSubmissionGameItem.deleted_at.is_(None),
        )
    )
    picked_ids = set(picks_result.scalars().all())

    if game_ids - picked_ids:
        raise HTTPException(
            status_code=400, detail="All games must be picked before submitting"
        )

    sub.is_locked = True
    sub.submitted_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()
    await db.refresh(sub)
    return sub
