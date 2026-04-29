"""
Application configuration using Pydantic Settings.
Reads from .env file and environment variables.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application Settings"""

    # App
    app_env: str = "development"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Database
    database_url: str = "postgresql+asyncpg://brainsync:brainsync_pass@localhost:5432/brainsync"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Vector DB
    qdrant_url: str = "http://localhost:6333"

    # AI
    gemini_api_key: str = ""

    # File Storage
    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 20
    allowed_extensions: str = "pdf"

    # CORS
    frontend_url: str = "http://localhost:3000"

    # Celery
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # Rate Limiting
    rate_limit_enabled: bool = True
    redis_rate_limit_url: str = "redis://localhost:6379/3"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
