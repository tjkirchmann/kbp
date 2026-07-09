from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_admin
from app.core.database import get_db
from app.models.cfbd import CfbdTeam
from app.services.cfbd import fetch_teams
from app.services.sync.cfbd_dims_syncers import team_row
from app.services.sync.upsert import batch_upsert

router = APIRouter(prefix="/admin/teams", dependencies=[Depends(require_admin)])

_TEAM_COLS = 12
_BATCH_SIZE = 32767 // _TEAM_COLS


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


@router.post("/sync")
async def sync_teams(db: AsyncSession = Depends(get_db)):
    try:
        teams = await fetch_teams()
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch teams from CFBD")
    rows = [team_row(t) for t in teams if t.get("id")]
    await batch_upsert(db, CfbdTeam, rows, _BATCH_SIZE, index_elements=("id",))
    await db.commit()
    return {
        "synced": len(rows),
        "last_synced_at": datetime.now(UTC).replace(tzinfo=None).isoformat(),
    }


@router.get("", response_model=list[CfbdTeamSchema])
async def list_teams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CfbdTeam).order_by(CfbdTeam.school))
    return result.scalars().all()
