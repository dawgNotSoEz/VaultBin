from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None

async def connect_to_mongo():
    global _client, _db
    _client = AsyncIOMotorClient(settings.mongo_uri)
    _db = _client.get_database("vaulbin")
    # Ensure TTL index on expires_at field
    await _db.documents.create_index("expires_at", expireAfterSeconds=0)

async def close_mongo_connection():
    global _client
    if _client:
        _client.close()

def get_database() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("MongoDB not initialized. Call connect_to_mongo() first.")
    return _db