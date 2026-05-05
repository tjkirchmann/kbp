from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    clerk_secret_key: str
    openai_api_key: str
    allowed_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"

settings = Settings()
