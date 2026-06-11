import redis.asyncio as aioredis
from app.config import settings

_redis: aioredis.Redis | None = None

async def connect_to_redis():
    global _redis
    _redis = aioredis.from_url(settings.redis_uri, encoding="utf-8", decode_responses=True)

async def close_redis_connection():
    global _redis
    if _redis:
        await _redis.close()

def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis not initialized. Call connect_to_redis() first.")
    return _redis