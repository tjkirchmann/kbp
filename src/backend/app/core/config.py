from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    clerk_secret_key: str = ""
    openai_api_key: str = ""
    cfbd_api_key: str = ""
    # Earliest season cfbd_facts backfills. CFBD betting lines begin ~2013.
    cfbd_facts_start_year: int = 2013
    allowed_origins: str = "http://localhost:5173"
    discord_webhook_url: str = ""
    # Discord bot (gateway listener + poster). Bot is disabled when token is empty.
    discord_bot_token: str = ""
    # Dev: per-guild slash-command sync (instant). Empty → global sync (~1h to propagate).
    discord_guild_id: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
