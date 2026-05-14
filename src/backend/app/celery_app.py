from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "kbp",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.cfbd_teams"],
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
}
