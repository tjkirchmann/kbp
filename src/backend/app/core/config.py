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
