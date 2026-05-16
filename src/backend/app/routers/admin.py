import json
from datetime import datetime, timedelta
from typing import Optional, Any
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.core.auth import require_admin, _clerk
from app.core.config import settings
from app.core.database import get_db
from app.core.event_logger import STREAM_KEY
from app.models import User
from app.models.espn import EspnGame
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


class EventBucket(BaseModel):
    minute: str
    count: int
    events: list[dict[str, Any]]


@router.get("/events", response_model=list[EventBucket])
async def get_events(
    source: Optional[str] = Query(None),
    minutes: int = Query(30, ge=1, le=1440),
):
    import redis.asyncio as aioredis
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)
    redis_client = aioredis.from_url(settings.redis_url)
    try:
        entries = await redis_client.xrange(STREAM_KEY)
    finally:
        await redis_client.aclose()

    buckets: dict[str, list[dict]] = {}
    for _id, fields in entries:
        ts_str = fields.get(b"ts", b"").decode()
        try:
            ts = datetime.fromisoformat(ts_str)
        except ValueError:
            continue
        if ts < cutoff:
            continue
        entry_source = fields.get(b"source", b"").decode()
        if source and entry_source != source:
            continue
        minute_key = ts.strftime("%Y-%m-%dT%H:%M:00")
        event = fields.get(b"event", b"").decode()
        try:
            payload = json.loads(fields.get(b"payload", b"{}").decode())
        except (ValueError, json.JSONDecodeError):
            payload = {}
        buckets.setdefault(minute_key, []).append({"event": event, "source": entry_source, "payload": payload})

    result = []
    for minute_key in sorted(buckets):
        evts = buckets[minute_key]
        result.append(EventBucket(minute=minute_key, count=len(evts), events=evts))
    return result


class EspnStatusSchema(BaseModel):
    live_games: int
    effective_interval_seconds: float
    rate_limit_per_minute: int


@router.get("/espn/status", response_model=EspnStatusSchema)
async def get_espn_status(db: AsyncSession = Depends(get_db)):
    rate_limit = await get_espn_rate_limit(db)
    result = await db.execute(
        select(EspnGame).where(
            (EspnGame.status_state == "in") | EspnGame.status_state.is_(None)
        )
    )
    live_games = len(result.scalars().all())
    effective_interval = (live_games / rate_limit) * 60 if live_games else 0
    return EspnStatusSchema(
        live_games=live_games,
        effective_interval_seconds=effective_interval,
        rate_limit_per_minute=rate_limit,
    )
