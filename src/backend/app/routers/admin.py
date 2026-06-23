from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import _clerk, require_admin
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
    get_espn_rate_limit,
    set_config,
)
from app.services.notify_config import get_notify_config, set_notify_config

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


class AdminConfigSchema(BaseModel):
    espn_rate_limit_per_minute: int
    espn_alert_channel: str  # notification_channels.name; "" = none channel (silence)
    # Discord bot runtime config (token/guild are env-only and not exposed here).
    discord_bot_enabled: bool
    discord_bot_listen_channels: str  # comma-separated channel ids
    discord_bot_command_channel: str  # default reply / notify channel id


class AdminConfigUpdate(BaseModel):
    espn_rate_limit_per_minute: int | None = None
    espn_alert_channel: str | None = None  # "" clears (→ none channel, silence)
    discord_bot_enabled: bool | None = None
    discord_bot_listen_channels: str | None = None
    discord_bot_command_channel: str | None = None


async def _admin_config_payload(db: AsyncSession) -> "AdminConfigSchema":
    return AdminConfigSchema(
        espn_rate_limit_per_minute=await get_espn_rate_limit(db),
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

    if body.espn_rate_limit_per_minute is not None:
        await set_config(
            db, "espn_rate_limit_per_minute", str(body.espn_rate_limit_per_minute)
        )
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

    from app.core.config import settings
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


class SyncRun(BaseModel):
    id: int
    status: str
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: float | None = None


class SyncNotify(BaseModel):
    start: bool
    success: bool
    failure: bool
    strategy: str
    channel: str | None = None  # named channel for all this task's events
    run_catchup: bool = False  # fire last missed cron slot on worker restart
    run_on_startup: bool = False  # defer this task once when the app boots
    startup_stale_seconds: int | None = (
        None  # skip startup defer if succeeded within window
    )
    hide_in_history: bool = False  # exclude runs from the side History rail


# Tasks that are only ever deferred explicitly (never on a schedule). Their cron
# is always null and must not be presented as an editable/pausable schedule.
_RUN_ONLY_TASKS = {"espn_seed", "cfbd_plays"}


class SyncJobStatus(BaseModel):
    task_name: str
    description: str | None = None
    cron: str | None = None  # None for run-only or paused tasks
    schedulable: bool = True  # False for run-only tasks (cron not editable)
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    runs: list[SyncRun]
    notify: SyncNotify


def _to_sync_notify(cfg) -> "SyncNotify":
    return SyncNotify(
        start=cfg.notify_on_start,
        success=cfg.notify_on_success,
        failure=cfg.notify_on_failure,
        strategy=cfg.strategy,
        channel=cfg.channel_name,
        run_catchup=cfg.run_catchup,
        run_on_startup=cfg.run_on_startup,
        startup_stale_seconds=cfg.startup_stale_seconds,
        hide_in_history=cfg.hide_in_history,
    )


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

# Run-history time windows for the task-detail charts. Maps a selector key to the
# lookback interval; runs whose latest event falls within it are returned.
_RUN_WINDOWS: dict[str, timedelta] = {
    "3h": timedelta(hours=3),
    "1d": timedelta(days=1),
    "3d": timedelta(days=3),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}

# Like _RUNS_SQL but bounded by time (any event in-window) instead of a fixed
# count. A generous LIMIT caps a pathological high-frequency task; ordered newest
# first so the cap drops the oldest runs in the window, not the newest.
_RUNS_WINDOW_SQL = text(
    """
    SELECT j.id, j.status,
           min(e.at) FILTER (WHERE e.type = 'started') AS started_at,
           max(e.at) FILTER (WHERE e.type IN ('succeeded','failed','aborted','cancelled')) AS ended_at
    FROM procrastinate_jobs j
    LEFT JOIN procrastinate_events e ON e.job_id = j.id
    WHERE j.task_name = :task
    GROUP BY j.id, j.status
    HAVING max(e.at) >= :since
    ORDER BY j.id DESC
    LIMIT 2000
    """
)


def _registered_tasks() -> dict:
    """All app-defined tasks by name (excludes Procrastinate builtins)."""
    from app.core.procrastinate import procrastinate_app

    procrastinate_app.perform_import_paths()
    return {
        name: task
        for name, task in procrastinate_app.tasks.items()
        if not name.startswith(("builtin:", "procrastinate."))
    }


async def _cron_by_task(db: AsyncSession) -> dict[str, str]:
    """task_name -> cron, from the DB (sole schedule source).

    Only non-blank, valid crons are returned; a paused/cleared task is absent.
    """
    from app.core.periodic_sync import load_crons

    return await load_crons(db)


async def _hidden_task_names(db: AsyncSession) -> list[str]:
    """Tasks flagged hide_in_history — excluded from the global rail endpoints."""
    from app.models.admin_notify_config import AdminNotifyConfig

    rows = await db.execute(
        select(AdminNotifyConfig.task_name).where(
            AdminNotifyConfig.hide_in_history.is_(True)
        )
    )
    return list(rows.scalars().all())


@router.get("/sync/status", response_model=list[SyncJobStatus])
async def get_sync_status(db: AsyncSession = Depends(get_db)):
    """Status for every registered task: cron (if periodic), next/last run, last 50 runs.

    Driven entirely by the Procrastinate task registry, so a newly-registered task
    appears here automatically with no edits to this endpoint or the frontend.
    """
    from croniter import croniter

    tasks = _registered_tasks()
    crons = await _cron_by_task(db)
    now = datetime.now(UTC)

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
        last_run_at: datetime | None = None
        for r in rows:
            started, ended = r["started_at"], r["ended_at"]
            duration = (ended - started).total_seconds() if started and ended else None
            runs.append(
                SyncRun(
                    id=r["id"],
                    status=r["status"],
                    started_at=started,
                    ended_at=ended,
                    duration_seconds=duration,
                )
            )
            if last_run_at is None and r["status"] in _TERMINAL_STATUSES and ended:
                last_run_at = ended

        notify = _to_sync_notify(await get_notify_config(db, task_name))

        description = (getattr(task.func, "__doc__", None) or "").strip().split("\n")[
            0
        ] or None
        out.append(
            SyncJobStatus(
                task_name=task_name,
                description=description,
                cron=cron,
                schedulable=task_name not in _RUN_ONLY_TASKS,
                last_run_at=last_run_at,
                next_run_at=next_run_at,
                runs=runs,
                notify=notify,
            )
        )

    out.sort(key=lambda j: j.task_name)
    return out


class GlobalRun(BaseModel):
    id: int
    task_name: str
    status: str
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: float | None = None


# Runs across all tasks, newest first, with start/end timestamps from the events table.
# :before_id NULL = first page; otherwise keyset-paginate into the past (j.id is bigserial).
_GLOBAL_RUNS_SQL = text(
    """
    SELECT j.id, j.task_name, j.status,
           min(e.at) FILTER (WHERE e.type = 'started') AS started_at,
           max(e.at) FILTER (WHERE e.type IN ('succeeded','failed','aborted','cancelled')) AS ended_at
    FROM procrastinate_jobs j
    LEFT JOIN procrastinate_events e ON e.job_id = j.id
    WHERE (CAST(:before_id AS bigint) IS NULL OR j.id < :before_id)
      AND j.task_name <> ALL(:hidden)
    GROUP BY j.id, j.task_name, j.status
    ORDER BY j.id DESC
    LIMIT :limit
    """
)


@router.get("/sync/recent", response_model=list[GlobalRun])
async def get_recent_runs(
    db: AsyncSession = Depends(get_db),
    before_id: int | None = Query(None, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Runs across every task, newest first. Pass before_id to page into the past."""
    hidden = await _hidden_task_names(db)
    rows = (
        (
            await db.execute(
                _GLOBAL_RUNS_SQL,
                {"before_id": before_id, "limit": limit, "hidden": hidden},
            )
        )
        .mappings()
        .all()
    )
    out: list[GlobalRun] = []
    for r in rows:
        started, ended = r["started_at"], r["ended_at"]
        duration = (ended - started).total_seconds() if started and ended else None
        out.append(
            GlobalRun(
                id=r["id"],
                task_name=r["task_name"],
                status=r["status"],
                started_at=started,
                ended_at=ended,
                duration_seconds=duration,
            )
        )
    return out


class UpcomingRun(BaseModel):
    task_name: str
    cron: str
    next_run_at: datetime


@router.get("/sync/upcoming", response_model=list[UpcomingRun])
async def get_upcoming_runs(
    after: datetime | None = Query(None),
    limit: int = Query(5, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Scheduled runs across all periodic tasks, soonest first.

    Pass `after` (ISO timestamp) to page further into the future. croniter's
    get_next is exclusive of the base instant, so after=<last fire> continues
    with no per-task overlap.
    """
    from croniter import croniter

    hidden = set(await _hidden_task_names(db))
    crons = {t: c for t, c in (await _cron_by_task(db)).items() if t not in hidden}
    base = after if after is not None else datetime.now(UTC)
    if base.tzinfo is None:
        base = base.replace(tzinfo=UTC)

    fires: list[UpcomingRun] = []
    for task_name, cron in crons.items():
        try:
            it = croniter(cron, base)
        except Exception:
            continue
        # Over-generate per task; the global sort+slice picks the true next `limit`.
        for _ in range(limit):
            fires.append(
                UpcomingRun(
                    task_name=task_name,
                    cron=cron,
                    next_run_at=it.get_next(datetime),
                )
            )

    fires.sort(key=lambda f: (f.next_run_at, f.task_name))
    if after is not None:
        # Drop any fire co-timed with the cursor (cross-task ties) to avoid repeats.
        fires = [f for f in fires if f.next_run_at > after]
    return fires[:limit]


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


# --- Run detail ---------------------------------------------------------------


class RunEvent(BaseModel):
    type: str
    at: datetime | None = None


class RunDetail(BaseModel):
    id: int
    task_name: str
    status: str
    queue_name: str
    priority: int
    attempts: int
    lock: str | None = None
    queueing_lock: str | None = None
    scheduled_at: datetime | None = None
    abort_requested: bool
    worker_id: int | None = None
    args: dict
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: float | None = None
    events: list[RunEvent]


_JOB_SQL = text(
    """
    SELECT id, task_name, status, queue_name, priority, attempts,
           lock, queueing_lock, scheduled_at, abort_requested, worker_id, args
    FROM procrastinate_jobs
    WHERE id = :job_id
    """
)

_JOB_EVENTS_SQL = text(
    "SELECT type, at FROM procrastinate_events WHERE job_id = :job_id ORDER BY at, id"
)


@router.get("/sync/runs/{job_id}", response_model=RunDetail)
async def get_run_detail(job_id: int, db: AsyncSession = Depends(get_db)):
    """Full metadata + event timeline for one job. Tracebacks are not stored by
    Procrastinate (logged only), so failures surface as status + attempts."""
    from fastapi import HTTPException

    job = (await db.execute(_JOB_SQL, {"job_id": job_id})).mappings().first()
    if job is None:
        raise HTTPException(status_code=404, detail=f"Unknown job {job_id}")

    rows = (await db.execute(_JOB_EVENTS_SQL, {"job_id": job_id})).mappings().all()
    events = [RunEvent(type=r["type"], at=r["at"]) for r in rows]

    def _first(*types):
        for e in events:
            if e.type in types:
                return e.at
        return None

    def _last(*types):
        for e in reversed(events):
            if e.type in types:
                return e.at
        return None

    started = _first("started")
    ended = _last("succeeded", "failed", "aborted", "cancelled")
    duration = (ended - started).total_seconds() if started and ended else None

    return RunDetail(
        id=job["id"],
        task_name=job["task_name"],
        status=job["status"],
        queue_name=job["queue_name"],
        priority=job["priority"],
        attempts=job["attempts"],
        lock=job["lock"],
        queueing_lock=job["queueing_lock"],
        scheduled_at=job["scheduled_at"],
        abort_requested=job["abort_requested"],
        worker_id=job["worker_id"],
        args=job["args"] or {},
        started_at=started,
        ended_at=ended,
        duration_seconds=duration,
        events=events,
    )


# --- Run actions (via Procrastinate JobManager, its own psycopg connector) ----


@router.post("/sync/runs/{job_id}/cancel")
async def cancel_run(job_id: int):
    """Cancel a queued (todo) job. Returns ok=False if not in a cancellable state."""
    from app.core.procrastinate import procrastinate_app

    ok = await procrastinate_app.job_manager.cancel_job_by_id_async(job_id)
    return {"ok": ok}


@router.post("/sync/runs/{job_id}/abort")
async def abort_run(job_id: int):
    """Request abort of a running (doing) job."""
    from app.core.procrastinate import procrastinate_app

    ok = await procrastinate_app.job_manager.cancel_job_by_id_async(job_id, abort=True)
    return {"ok": ok}


@router.post("/sync/runs/{job_id}/retry")
async def retry_run(job_id: int):
    """Retry a failed/aborted job immediately (status -> todo, attempts += 1)."""
    from app.core.procrastinate import procrastinate_app

    await procrastinate_app.job_manager.retry_job_by_id_async(
        job_id, retry_at=datetime.now(UTC)
    )
    return {"ok": True}


# --- Task detail --------------------------------------------------------------


class TaskStats(BaseModel):
    total: int
    succeeded: int
    failed: int
    success_rate: float | None = None
    avg_duration_seconds: float | None = None
    p95_duration_seconds: float | None = None


class TaskDetail(BaseModel):
    task_name: str
    description: str | None = None
    cron: str | None = None
    schedulable: bool = True  # False for run-only tasks (cron not editable)
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    upcoming: list[datetime]
    runs: list[SyncRun]
    stats: TaskStats
    notify: SyncNotify


@router.get("/sync/tasks/{task_name}", response_model=TaskDetail)
async def get_task_detail(task_name: str, db: AsyncSession = Depends(get_db)):
    """Schedule, config, run history (last 50), and aggregate stats for one task."""
    from croniter import croniter
    from fastapi import HTTPException

    tasks = _registered_tasks()
    task = tasks.get(task_name)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Unknown task {task_name!r}")

    cron = (await _cron_by_task(db)).get(task_name)
    now = datetime.now(UTC)
    next_run_at: datetime | None = None
    upcoming: list[datetime] = []
    if cron:
        try:
            it = croniter(cron, now)
            upcoming = [it.get_next(datetime) for _ in range(5)]
            next_run_at = upcoming[0]
        except Exception:
            upcoming = []

    rows = (await db.execute(_RUNS_SQL, {"task": task_name})).mappings().all()
    runs: list[SyncRun] = []
    last_run_at: datetime | None = None
    durations: list[float] = []
    succeeded = failed = terminal = 0
    for r in rows:
        started, ended = r["started_at"], r["ended_at"]
        duration = (ended - started).total_seconds() if started and ended else None
        runs.append(
            SyncRun(
                id=r["id"],
                status=r["status"],
                started_at=started,
                ended_at=ended,
                duration_seconds=duration,
            )
        )
        if duration is not None:
            durations.append(duration)
        if r["status"] in _TERMINAL_STATUSES:
            terminal += 1
            if r["status"] == "succeeded":
                succeeded += 1
            elif r["status"] == "failed":
                failed += 1
            if last_run_at is None and ended:
                last_run_at = ended

    avg_d = sum(durations) / len(durations) if durations else None
    p95_d = None
    if durations:
        ordered = sorted(durations)
        idx = min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1))))
        p95_d = ordered[idx]

    stats = TaskStats(
        total=len(rows),
        succeeded=succeeded,
        failed=failed,
        success_rate=(succeeded / terminal) if terminal else None,
        avg_duration_seconds=avg_d,
        p95_duration_seconds=p95_d,
    )

    description = (getattr(task.func, "__doc__", None) or "").strip().split("\n")[
        0
    ] or None
    return TaskDetail(
        task_name=task_name,
        description=description,
        cron=cron,
        schedulable=task_name not in _RUN_ONLY_TASKS,
        last_run_at=last_run_at,
        next_run_at=next_run_at,
        upcoming=upcoming,
        runs=runs,
        stats=stats,
        notify=_to_sync_notify(await get_notify_config(db, task_name)),
    )


@router.get("/sync/tasks/{task_name}/runs", response_model=list[SyncRun])
async def get_task_runs(
    task_name: str,
    window: str = Query("7d"),
    db: AsyncSession = Depends(get_db),
):
    """Runs for one task within a time window (for the detail-page charts).

    Unlike the 50-run cap on the main detail endpoint, this returns every run
    whose latest event falls within `window` (3h/1d/3d/7d/30d), up to a safety cap.
    """
    from fastapi import HTTPException

    if task_name not in _registered_tasks():
        raise HTTPException(status_code=404, detail=f"Unknown task {task_name!r}")
    interval = _RUN_WINDOWS.get(window)
    if interval is None:
        raise HTTPException(status_code=400, detail=f"Unknown window {window!r}")

    since = datetime.now(UTC) - interval
    rows = (
        (await db.execute(_RUNS_WINDOW_SQL, {"task": task_name, "since": since}))
        .mappings()
        .all()
    )
    runs: list[SyncRun] = []
    for r in rows:
        started, ended = r["started_at"], r["ended_at"]
        duration = (ended - started).total_seconds() if started and ended else None
        runs.append(
            SyncRun(
                id=r["id"],
                status=r["status"],
                started_at=started,
                ended_at=ended,
                duration_seconds=duration,
            )
        )
    return runs


class NotifyConfigUpdate(BaseModel):
    notify_on_start: bool | None = None
    notify_on_success: bool | None = None
    notify_on_failure: bool | None = None
    strategy: str | None = None
    channel_name: str | None = None  # "" clears the channel selection
    run_catchup: bool | None = None
    run_on_startup: bool | None = None
    startup_stale_seconds: int | None = None  # -1 clears to null ("Always")
    hide_in_history: bool | None = None  # exclude runs from the History rail


@router.put("/sync/notify/{task_name}", response_model=SyncNotify)
async def update_notify_config(
    task_name: str, body: NotifyConfigUpdate, db: AsyncSession = Depends(get_db)
):
    """Upsert per-task notification settings. Only provided fields change."""
    from fastapi import HTTPException

    if task_name not in _registered_tasks():
        raise HTTPException(status_code=404, detail=f"Unknown task {task_name!r}")

    fields = body.model_dump(exclude_none=True)
    # -1 is the sentinel for "Always" (no staleness window) — store null.
    if body.startup_stale_seconds == -1:
        fields["startup_stale_seconds"] = None
    if body.channel_name == "":
        fields["channel_name"] = None
    elif body.channel_name:
        exists = (
            await db.execute(
                select(NotificationChannel.name).where(
                    NotificationChannel.name == body.channel_name
                )
            )
        ).scalar_one_or_none()
        if exists is None:
            raise HTTPException(
                status_code=400, detail=f"Unknown channel {body.channel_name!r}"
            )

    if fields:
        await set_notify_config(db, task_name, **fields)

    return _to_sync_notify(await get_notify_config(db, task_name))


class CronUpdate(BaseModel):
    cron: str | None = None  # null or blank => pause (task won't fire)


class CronResult(BaseModel):
    task_name: str
    cron: str | None = None
    next_run_at: datetime | None = None


@router.put("/sync/cron/{task_name}", response_model=CronResult)
async def update_cron(
    task_name: str, body: CronUpdate, db: AsyncSession = Depends(get_db)
):
    """Set (or clear) a task's cron. Blank/null pauses it. Validates via croniter.

    Persists to admin_notify_config and fires NOTIFY cron_changed so the worker
    re-syncs its schedule immediately (a poll fallback covers a missed notify).
    """
    from croniter import croniter
    from fastapi import HTTPException

    from app.core.periodic_sync import CRON_CHANNEL

    if task_name not in _registered_tasks():
        raise HTTPException(status_code=404, detail=f"Unknown task {task_name!r}")

    cron = (body.cron or "").strip() or None
    if cron is not None:
        try:
            croniter(cron)
        except Exception:
            raise HTTPException(
                status_code=400, detail=f"Invalid cron expression: {cron!r}"
            )

    await set_notify_config(db, task_name, cron=cron)
    await db.execute(text(f"NOTIFY {CRON_CHANNEL}"))
    await db.commit()

    next_run_at: datetime | None = None
    if cron is not None:
        try:
            next_run_at = croniter(cron, datetime.now(UTC)).get_next(datetime)
        except Exception:
            next_run_at = None
    return CronResult(task_name=task_name, cron=cron, next_run_at=next_run_at)


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
    await _clerk.users.ban_async(user_id=user.clerk_id)
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
