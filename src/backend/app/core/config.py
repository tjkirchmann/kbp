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
    s3_endpoint_url: str = ""          # server-side ops (head/delete); empty → real AWS
    s3_public_endpoint_url: str = ""   # browser-facing presigning; empty → real AWS
    library_max_upload_bytes: int = 1_073_741_824  # 1 GB

    # Temporal. Local self-host defaults; for Temporal Cloud set temporal_api_key
    # (+ leave temporal_tls implied) and point temporal_address/namespace at the
    # Cloud endpoint — no code changes needed (see app/core/temporal.py).
    temporal_address: str = "temporal:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "kbp-default"
    temporal_tls: bool = False
    temporal_api_key: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
