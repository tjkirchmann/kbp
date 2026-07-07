from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import _clerk, require_admin
from app.core.config import settings
from app.core.database import get_db
from app.models import User
from app.models.espn import EspnGame
from app.models.event_log import EventLog
from app.models.notification_channel import NotificationChannel
from app.schemas.user import SetAdminBody, UserSchema
from app.services import tags as tag_svc
from app.services.admin_config import (
    get_bot_command_channel,
    get_bot_enabled,
    get_bot_listen_channels,
    get_espn_alert_channel,
    set_config,
)

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


class AdminConfigSchema(BaseModel):
    # Read-only: the ESPN request budget is now enforced by Temporal as a task-queue
    # activity rate limit, set at worker boot from settings.espn_rate_limit_per_minute
    # (see app/temporal/worker.py). It is no longer stored in or editable via the DB.
    espn_rate_limit_per_minute: int
    espn_alert_channel: str  # notification_channels.name; "" = none channel (silence)
    # Discord bot runtime config (token/guild are env-only and not exposed here).
    discord_bot_enabled: bool
    discord_bot_listen_channels: str  # comma-separated channel ids
    discord_bot_command_channel: str  # default reply / notify channel id


class AdminConfigUpdate(BaseModel):
    # espn_rate_limit_per_minute is intentionally NOT updatable — it's a boot-time
    # setting now (see AdminConfigSchema). The field is omitted so the API doesn't
    # silently accept a write that has no effect.
    espn_alert_channel: str | None = None  # "" clears (→ none channel, silence)
    discord_bot_enabled: bool | None = None
    discord_bot_listen_channels: str | None = None
    discord_bot_command_channel: str | None = None


async def _admin_config_payload(db: AsyncSession) -> "AdminConfigSchema":
    return AdminConfigSchema(
        # The actual enforced limit (boot-time settings), not the dead DB value.
        espn_rate_limit_per_minute=settings.espn_rate_limit_per_minute,
        espn_alert_channel=await get_espn_alert_channel(db),
        discord_bot_enabled=await get_bot_enabled(db),
        discord_bot_listen_channels=",".join(sorted(await get_bot_listen_channels(db))),
        discord_bot_command_channel=await get_bot_command_channel(db),
    )


@router.get("/config", response_model=AdminConfigSchema)
async def get_admin_config(db: AsyncSession = Depends(get_db)):
    return await _admin_config_payload(db)


@router.put("/config", response_model=AdminConfigSchema)
async def update_admin_config(
    body: AdminConfigUpdate, db: AsyncSession = Depends(get_db)
):
    from fastapi import HTTPException

    if body.espn_alert_channel is not None:
        name = body.espn_alert_channel.strip()
        if name:
            exists = (
                await db.execute(
                    select(NotificationChannel.name).where(
                        NotificationChannel.name == name
                    )
                )
            ).scalar_one_or_none()
            if exists is None:
                raise HTTPException(status_code=400, detail=f"Unknown channel {name!r}")
        await set_config(db, "espn_alert_channel", name)
    if body.discord_bot_enabled is not None:
        await set_config(
            db, "discord_bot_enabled", "true" if body.discord_bot_enabled else "false"
        )
    if body.discord_bot_listen_channels is not None:
        await set_config(
            db, "discord_bot_listen_channels", body.discord_bot_listen_channels
        )
    if body.discord_bot_command_channel is not None:
        await set_config(
            db, "discord_bot_command_channel", body.discord_bot_command_channel
        )
    return await _admin_config_payload(db)


@router.post("/config/test-bot")
async def test_discord_bot(db: AsyncSession = Depends(get_db)):
    """Post a test message to the bot's command channel via REST (Bot token auth)."""
    from fastapi import HTTPException

    from app.services.discord import send_bot_message

    if not settings.discord_bot_token:
        raise HTTPException(
            status_code=400, detail="DISCORD_BOT_TOKEN is not configured"
        )
    channel_id = await get_bot_command_channel(db)
    if not channel_id:
        raise HTTPException(status_code=400, detail="No bot command channel configured")
    await send_bot_message(
        settings.discord_bot_token,
        channel_id,
        "Test message from KBP admin panel (via bot).",
    )
    return {"ok": True}


@router.get("/ping")
async def ping():
    return {"ok": True}


# ---- Notification channels (named, reusable destinations) ----


class ChannelSchema(BaseModel):
    name: str
    strategy: str
    config: dict[str, Any]


class ChannelUpsert(BaseModel):
    strategy: str = "discord"
    config: dict[str, Any] = {}


@router.get("/notify/channels", response_model=list[ChannelSchema])
async def list_channels(db: AsyncSession = Depends(get_db)):
    rows = (
        (
            await db.execute(
                select(NotificationChannel).order_by(NotificationChannel.name)
            )
        )
        .scalars()
        .all()
    )
    return [
        ChannelSchema(name=c.name, strategy=c.strategy, config=c.config or {})
        for c in rows
    ]


@router.put("/notify/channels/{name}", response_model=ChannelSchema)
async def upsert_channel(
    name: str, body: ChannelUpsert, db: AsyncSession = Depends(get_db)
):
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    stmt = (
        pg_insert(NotificationChannel)
        .values(name=name, strategy=body.strategy, config=body.config)
        .on_conflict_do_update(
            index_elements=["name"],
            set_={"strategy": body.strategy, "config": body.config},
        )
    )
    await db.execute(stmt)
    await db.commit()
    return ChannelSchema(name=name, strategy=body.strategy, config=body.config)


@router.delete("/notify/channels/{name}")
async def delete_channel(name: str, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    from sqlalchemy import delete

    from app.services.notify_config import NONE_CHANNEL_NAME

    if name == NONE_CHANNEL_NAME:
        raise HTTPException(
            status_code=400, detail="The built-in 'none' channel cannot be deleted."
        )
    await db.execute(
        delete(NotificationChannel).where(NotificationChannel.name == name)
    )
    await db.commit()
    return {"ok": True}


@router.post("/notify/channels/{name}/test")
async def test_channel(name: str, db: AsyncSession = Depends(get_db)):
    """Send a test notification through a channel."""
    from fastapi import HTTPException

    from app.services.notifications import notification_service

    chan = (
        await db.execute(
            select(NotificationChannel).where(NotificationChannel.name == name)
        )
    ).scalar_one_or_none()
    if chan is None:
        raise HTTPException(status_code=404, detail=f"Unknown channel {name!r}")
    await notification_service.notify(
        strategy=chan.strategy,
        config=chan.config or {},
        event="success",
        payload={"task_name": f"channel:{name}", "result": {"test": "ok"}},
    )
    return {"ok": True}


@router.get("/users", response_model=list[UserSchema])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.deleted_at.is_(None)).order_by(User.created_at)
    )
    return result.scalars().all()


@router.post("/users/{user_id}/ban")
async def ban_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="User not found")
    await _clerk.users.ban_async(user_id=user.clerk_id)  # type: ignore[union-attr]
    await db.execute(update(User).where(User.id == user_id).values(is_banned=True))
    await db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/set-admin")
async def set_admin(
    user_id: int, body: SetAdminBody, db: AsyncSession = Depends(get_db)
):
    await db.execute(
        update(User).where(User.id == user_id).values(is_admin=body.is_admin)
    )
    await db.commit()
    return {"ok": True}


class EventBucket(BaseModel):
    minute: str
    count: int
    events: list[dict[str, Any]]


@router.get("/events", response_model=list[EventBucket])
async def get_events(
    source: str | None = Query(None),
    minutes: int = Query(30, ge=1, le=1440),
    db: AsyncSession = Depends(get_db),
):
    cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=minutes)
    stmt = select(EventLog).where(EventLog.at >= cutoff)
    if source:
        stmt = stmt.where(EventLog.source == source)
    stmt = stmt.order_by(EventLog.at)
    rows = (await db.execute(stmt)).scalars().all()

    buckets: dict[str, list[dict]] = {}
    for row in rows:
        minute_key = row.at.strftime("%Y-%m-%dT%H:%M:00")
        buckets.setdefault(minute_key, []).append(
            {"event": row.event, "source": row.source, "payload": row.payload}
        )

    result = []
    for minute_key in sorted(buckets):
        evts = buckets[minute_key]
        result.append(EventBucket(minute=minute_key, count=len(evts), events=evts))
    return result


class EspnStatusSchema(BaseModel):
    live_games: int
    # Per-game live polling cadence (fixed; see EspnGameWorkflow). No longer the old
    # shared-budget "rate ÷ games" interval — Temporal's queue limit paces requests
    # in aggregate, so each game polls on its own fixed schedule.
    effective_interval_seconds: float
    # The enforced global ESPN request budget (boot-time settings, not the DB).
    rate_limit_per_minute: int


# Mirror EspnGameWorkflow._LIVE_INTERVAL so the panel shows the real live cadence.
_ESPN_LIVE_INTERVAL_SECONDS = 20.0


@router.get("/espn/status", response_model=EspnStatusSchema)
async def get_espn_status(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EspnGame).where(
            (EspnGame.status_state == "in") | EspnGame.status_state.is_(None)
        )
    )
    live_games = len(result.scalars().all())
    return EspnStatusSchema(
        live_games=live_games,
        effective_interval_seconds=_ESPN_LIVE_INTERVAL_SECONDS if live_games else 0,
        rate_limit_per_minute=settings.espn_rate_limit_per_minute,
    )


# ---- Tags (generic, polymorphic by entity_type/entity_id) ----


class TagOut(BaseModel):
    name: str
    color: str  # one of the .tag-* CSS classes, derived from name


class TagCreate(BaseModel):
    name: str


def _serialize_tag(name: str) -> TagOut:
    return TagOut(name=name, color=tag_svc.tag_color(name))


@router.get("/tags/{entity_type}/{entity_id}", response_model=list[TagOut])
async def list_entity_tags(
    entity_type: str, entity_id: str, db: AsyncSession = Depends(get_db)
):
    from fastapi import HTTPException

    try:
        tag_svc.validate_entity_type(entity_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    rows = await tag_svc.list_tags(db, entity_type, entity_id)
    return [_serialize_tag(r.name) for r in rows]


@router.post("/tags/{entity_type}/{entity_id}", response_model=TagOut)
async def add_entity_tag(
    entity_type: str,
    entity_id: str,
    body: TagCreate,
    db: AsyncSession = Depends(get_db),
):
    from fastapi import HTTPException

    try:
        tag_svc.validate_entity_type(entity_type)
        name = tag_svc.normalize_tag_name(body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await tag_svc.add_tag(db, entity_type, entity_id, name)
    return _serialize_tag(name)


@router.delete("/tags/{entity_type}/{entity_id}")
async def delete_entity_tag(
    entity_type: str,
    entity_id: str,
    name: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    from fastapi import HTTPException

    try:
        tag_svc.validate_entity_type(entity_type)
        name = tag_svc.normalize_tag_name(name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await tag_svc.remove_tag(db, entity_type, entity_id, name)
    return {"ok": True}


@router.get("/tags/{entity_type}/{entity_id}/suggestions", response_model=list[str])
async def suggest_entity_tags(
    entity_type: str, entity_id: str, db: AsyncSession = Depends(get_db)
):
    from fastapi import HTTPException

    try:
        tag_svc.validate_entity_type(entity_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await tag_svc.suggest_tags(db, entity_type, entity_id)
