from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    clerk_secret_key: str = ""
    openai_api_key: str = ""
    cfbd_api_key: str = ""
    allowed_origins: str = "http://localhost:5173"
    discord_webhook_url: str = ""

    # OpenRouter (OpenAI-compatible). Empty key falls back to admin_config DB value.
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # Object storage (S3 API). s3_endpoint_url empty → real AWS S3; set to the
    # MinIO URL locally. Same code both sides — only endpoint/creds differ.
    s3_endpoint_url: str = ""
    s3_region: str = "us-east-1"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_bucket: str = "documents"

    class Config:
        env_file = ".env"

settings = Settings()
