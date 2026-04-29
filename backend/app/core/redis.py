"""
Redis async client initialization.
"""

import redis.asyncio as redis
from typing import Optional
from app.core.config import settings

_redis_client: Optional[redis.Redis] = None


async def get_redis_client() -> redis.Redis:
    """
    Get or create async Redis client.
    """
    global _redis_client
    if _redis_client is None:
        _redis_client = await redis.from_url(
            settings.redis_url,
            encoding="utf8",
            decode_responses=True
        )
    return _redis_client


async def close_redis():
    """
    Close Redis connection.
    """
    global _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None


async def health_check() -> bool:
    """
    Check Redis health.
    """
    try:
        client = await get_redis_client()
        await client.ping()
        return True
    except Exception:
        return False
