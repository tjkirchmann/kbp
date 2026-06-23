from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_admin
from app.core.database import get_db
from app.models.cfbd import CfbdTeam
from app.services.cfbd import fetch_teams

router = APIRouter(prefix="/admin/teams", dependencies=[Depends(require_admin)])

_UPSERT_COLS = 12
_BATCH_SIZE = 32767 // _UPSERT_COLS


class CfbdTeamSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    school: str
    mascot: str | None
    abbreviation: str | None
    color: str | None
    alt_color: str | None
    logos: list[str] | None
    conference: str | None
    division: str | None
    classification: str | None
    twitter: str | None
    last_synced_at: datetime


def _api_to_row(t: dict) -> dict:
    return {
        "id": t["id"],
        "school": t.get("school") or "",
        "mascot": t.get("mascot") or None,
        "abbreviation": t.get("abbreviation") or None,
        "color": t.get("color") or None,
        "alt_color": t.get("altColor") or None,
        "logos": t.get("logos") or None,
        "conference": t.get("conference") or None,
        "division": t.get("division") or None,
        "classification": t.get("classification") or None,
        "twitter": t.get("twitter") or None,
        "last_synced_at": datetime.now(UTC).replace(tzinfo=None),
    }


async def _upsert_teams(db: AsyncSession, rows: list[dict]) -> None:
    if not rows:
        return
    update_keys = [c for c in rows[0] if c != "id"]
    for i in range(0, len(rows), _BATCH_SIZE):
        batch = rows[i : i + _BATCH_SIZE]
        stmt = pg_insert(CfbdTeam).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={c: stmt.excluded[c] for c in update_keys},
        )
        await db.execute(stmt)


@router.post("/sync")
async def sync_teams(db: AsyncSession = Depends(get_db)):
    try:
        teams = await fetch_teams()
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch teams from CFBD")
    rows = [_api_to_row(t) for t in teams if t.get("id")]
    await _upsert_teams(db, rows)
    await db.commit()
    return {
        "synced": len(rows),
        "last_synced_at": datetime.now(UTC).replace(tzinfo=None).isoformat(),
    }


@router.get("", response_model=list[CfbdTeamSchema])
async def list_teams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CfbdTeam).order_by(CfbdTeam.school))
    return result.scalars().all()
