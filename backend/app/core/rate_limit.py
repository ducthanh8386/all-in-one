from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.config import settings

# Initialize rate limiter with Redis backend
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_rate_limit_url
)
