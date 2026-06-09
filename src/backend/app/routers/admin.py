from datetime import datetime, timedelta, timezone
from typing import Optional, Any
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, update
from app.core.auth import require_admin, _clerk
from app.core.database import get_db
from app.models import User
from app.models.espn import EspnGame
from app.models.event_log import EventLog
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


class SyncRun(BaseModel):
    id: int
    status: str
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None


class SyncJobStatus(BaseModel):
    task_name: str
    description: Optional[str] = None
    cron: Optional[str] = None          # None for run-only (non-periodic) tasks
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    runs: list[SyncRun]


# Newest 50 runs for a task, with start/end timestamps from the events table.
_RUNS_SQL = text(
    """
    SELECT j.id, j.status,
           min(e.at) FILTER (WHERE e.type = 'started') AS started_at,
           max(e.at) FILTER (WHERE e.type IN ('succeeded','failed','aborted','cancelled')) AS ended_at
    FROM procrastinate_jobs j
    LEFT JOIN procrastinate_events e ON e.job_id = j.id
    WHERE j.task_name = :task
    GROUP BY j.id, j.status
    ORDER BY j.id DESC
    LIMIT 50
    """
)

_TERMINAL_STATUSES = {"succeeded", "failed", "aborted", "cancelled"}


def _registered_tasks() -> dict:
    """All app-defined tasks by name (excludes Procrastinate builtins)."""
    from app.core.procrastinate import procrastinate_app
    procrastinate_app.perform_import_paths()
    return {
        name: task
        for name, task in procrastinate_app.tasks.items()
        if not name.startswith(("builtin:", "procrastinate."))
    }


def _cron_by_task() -> dict[str, str]:
    """task_name -> cron, for the subset of tasks registered as periodic."""
    from app.core.procrastinate import procrastinate_app
    return {
        pt.task.name: pt.cron
        for pt in procrastinate_app.periodic_registry.periodic_tasks.values()
    }


@router.get("/sync/status", response_model=list[SyncJobStatus])
async def get_sync_status(db: AsyncSession = Depends(get_db)):
    """Status for every registered task: cron (if periodic), next/last run, last 50 runs.

    Driven entirely by the Procrastinate task registry, so a newly-registered task
    appears here automatically with no edits to this endpoint or the frontend.
    """
    from croniter import croniter

    tasks = _registered_tasks()
    crons = _cron_by_task()
    now = datetime.now(timezone.utc)

    out: list[SyncJobStatus] = []
    for task_name, task in tasks.items():
        cron = crons.get(task_name)
        next_run_at = None
        if cron:
            try:
                next_run_at = croniter(cron, now).get_next(datetime)
            except Exception:
                next_run_at = None

        rows = (await db.execute(_RUNS_SQL, {"task": task_name})).mappings().all()
        runs: list[SyncRun] = []
        last_run_at: Optional[datetime] = None
        for r in rows:
            started, ended = r["started_at"], r["ended_at"]
            duration = (ended - started).total_seconds() if started and ended else None
            runs.append(SyncRun(
                id=r["id"], status=r["status"],
                started_at=started, ended_at=ended, duration_seconds=duration,
            ))
            if last_run_at is None and r["status"] in _TERMINAL_STATUSES and ended:
                last_run_at = ended

        description = (getattr(task.func, "__doc__", None) or "").strip().split("\n")[0] or None
        out.append(SyncJobStatus(
            task_name=task_name, description=description, cron=cron,
            last_run_at=last_run_at, next_run_at=next_run_at, runs=runs,
        ))

    out.sort(key=lambda j: j.task_name)
    return out


@router.post("/sync/run/{task_name}")
async def run_sync_task(task_name: str):
    """Defer any registered task by name. queueing_lock dedupes if one is pending."""
    from fastapi import HTTPException
    from procrastinate.exceptions import AlreadyEnqueued

    task = _registered_tasks().get(task_name)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Unknown task {task_name!r}")
    try:
        job_id = await task.defer_async()
        return {"deferred": True, "job_id": job_id}
    except AlreadyEnqueued:
        return {"deferred": False, "already_queued": True}


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
    db: AsyncSession = Depends(get_db),
):
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)
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
