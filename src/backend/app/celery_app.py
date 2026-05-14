from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "kbp",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.cfbd_teams", "app.tasks.espn_poller"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/New_York",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)

celery_app.conf.beat_schedule = {
    "sync-cfbd-teams-nightly": {
        "task": "app.tasks.cfbd_teams.sync_cfbd_teams",
        "schedule": crontab(hour=3, minute=0),  # 3 AM US/Eastern daily
    },
    "poll-live-espn-games": {
        "task": "app.tasks.espn_poller.poll_live_espn_games",
        "schedule": 30.0,  # every 30s; task enforces per-game intervals internally
    },
}
