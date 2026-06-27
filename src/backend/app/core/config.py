from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    clerk_secret_key: str = ""
    openai_api_key: str = ""
    cfbd_api_key: str = ""
    # Earliest season cfbd_facts backfills. CFBD betting lines begin ~2013.
    cfbd_facts_start_year: int = 2013
    allowed_origins: str = "http://localhost:5173"
    # Discord bot (gateway listener + poster). Bot is disabled when token is empty.
    discord_bot_token: str = ""
    # Dev: per-guild slash-command sync (instant). Empty → global sync (~1h to propagate).
    discord_guild_id: str = ""
    # S3 file library. Endpoints are empty in prod (→ real AWS); set to MinIO locally.
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    s3_region: str = "us-east-1"
    s3_bucket_name: str = ""
    s3_endpoint_url: str = ""  # server-side ops (head/delete); empty → real AWS
    s3_public_endpoint_url: str = ""  # browser-facing presigning; empty → real AWS
    library_max_upload_bytes: int = 1_073_741_824  # 1 GB
    # SQLAlchemy statement echo. Off by default — when on, every statement (incl.
    # each of the millions of CFBD fact upserts) is logged, which is a real
    # throughput drag. Flip to true only for local SQL debugging.
    sql_echo: bool = False

    # Temporal. Local self-host defaults; for Temporal Cloud set temporal_api_key
    # (+ leave temporal_tls implied) and point temporal_address/namespace at the
    # Cloud endpoint — no code changes needed (see app/core/temporal.py).
    temporal_address: str = "temporal:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "kbp-default"
    temporal_tls: bool = False
    temporal_api_key: str = ""
    # Cron (5-field, UTC) for the CFBD facts Temporal Schedule. Default: daily at
    # 08:00 UTC. See app/temporal/cfbd_facts/schedule.py.
    temporal_cfbd_facts_cron: str = "0 8 * * *"
    # Cron (5-field, UTC) for the CFBD games Temporal Schedule. Default: every 15
    # minutes (games are a fact table — scores change). Ported from the former
    # DB cron (admin_notify_config). See app/temporal/cfbd_games/schedule.py.
    temporal_cfbd_games_cron: str = "*/15 * * * *"
    # Dedicated task queue for ESPN poll activities. Per Temporal's guidance, one
    # rate-limited downstream API gets its own queue so its throughput limit is
    # isolated from the rest of the workers. See app/temporal/espn/.
    temporal_espn_task_queue: str = "kbp-espn"
    # Global ESPN request budget (requests/minute), enforced by Temporal as a
    # task-queue activity rate limit (max_task_queue_activities_per_second =
    # this / 60) across ALL workers on the espn queue — replaces the old DB token
    # bucket (app/core/rate_limiter.py). Code-defined (boot-time), consistent with
    # the schedules-in-code decision; no longer live-editable from the admin panel.
    espn_rate_limit_per_minute: int = 60

    class Config:
        env_file = ".env"


settings = Settings()
