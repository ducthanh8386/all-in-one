from pydantic_settings import BaseSettings
from pydantic import ConfigDict

class Settings(BaseSettings):
    model_config = ConfigDict(env_file=(".env", "/app/.env"), case_sensitive=False, extra='ignore')

    app_env: str = "development"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    database_url: str = "postgresql+asyncpg://brainsync:brainsync_pass@postgres:5432/brainsync"
    redis_url: str = "redis://redis:6379/0"
    qdrant_url: str = "http://qdrant:6333"
    gemini_api_key: str = ""
    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 20
    allowed_extensions: str = "pdf"
    frontend_url: str = "http://localhost:3000"
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/2"
    rate_limit_enabled: bool = True
    redis_rate_limit_url: str = "redis://redis:6379/3"

settings = Settings()
