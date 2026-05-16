from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.core.auth import require_admin, _clerk
from app.core.database import get_db
from app.models import User
from app.schemas.user import UserSchema, SetAdminBody
from app.services.admin_config import (
    get_espn_rate_limit,
    get_discord_webhook_url,
    set_config,
)

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


class AdminConfigSchema(BaseModel):
    espn_rate_limit_per_minute: int
    discord_webhook_url: str


class AdminConfigUpdate(BaseModel):
    espn_rate_limit_per_minute: Optional[int] = None
    discord_webhook_url: Optional[str] = None


@router.get("/config", response_model=AdminConfigSchema)
async def get_admin_config(db: AsyncSession = Depends(get_db)):
    return AdminConfigSchema(
        espn_rate_limit_per_minute=await get_espn_rate_limit(db),
        discord_webhook_url=await get_discord_webhook_url(db),
    )


@router.put("/config", response_model=AdminConfigSchema)
async def update_admin_config(body: AdminConfigUpdate, db: AsyncSession = Depends(get_db)):
    if body.espn_rate_limit_per_minute is not None:
        await set_config(db, "espn_rate_limit_per_minute", str(body.espn_rate_limit_per_minute))
    if body.discord_webhook_url is not None:
        await set_config(db, "discord_webhook_url", body.discord_webhook_url)
    return AdminConfigSchema(
        espn_rate_limit_per_minute=await get_espn_rate_limit(db),
        discord_webhook_url=await get_discord_webhook_url(db),
    )


@router.post("/config/test-webhook")
async def test_discord_webhook(db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    from app.services.discord import send_discord_alert
    url = await get_discord_webhook_url(db)
    if not url:
        raise HTTPException(status_code=400, detail="No Discord webhook URL configured")
    await send_discord_alert(url, "Test message from KBP admin panel.")
    return {"ok": True}


@router.get("/ping")
async def ping():
    return {"ok": True}


@router.get("/users", response_model=list[UserSchema])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.deleted_at.is_(None)).order_by(User.created_at))
    return result.scalars().all()


@router.post("/users/{user_id}/ban")
async def ban_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    await _clerk.users.ban_async(user_id=user.clerk_id)
    await db.execute(update(User).where(User.id == user_id).values(is_banned=True))
    await db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/set-admin")
async def set_admin(user_id: int, body: SetAdminBody, db: AsyncSession = Depends(get_db)):
    await db.execute(update(User).where(User.id == user_id).values(is_admin=body.is_admin))
    await db.commit()
    return {"ok": True}
