from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis
from fastapi import HTTPException, status
import secrets

async def create_document(
    db: AsyncIOMotorDatabase,
    redis: Redis,
    ciphertext: str,
    iv: str,
    expiry_hours: int,
    burn_after_reading: bool
) -> str:
    now = datetime.utcnow()
    doc = {
        "_id": secrets.token_urlsafe(16),
        "ciphertext": ciphertext,
        "iv": iv,
        "created_at": now,
        "expires_at": now + timedelta(hours=expiry_hours),
        "burn_after_reading": burn_after_reading,
        "version": 1
    }
    await db.documents.insert_one(doc)
    if burn_after_reading:
        # Mark as unread (0)
        await redis.set(f"burn:{doc['_id']}", "0", ex=expiry_hours * 3600)
    return doc["_id"]


async def get_document(db: AsyncIOMotorDatabase, redis: Redis, doc_id: str) -> dict:
    doc = await db.documents.find_one({"_id": doc_id})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found or expired")

    if doc.get("burn_after_reading"):
        # Atomically get the old value and set the key to "1"
        old_value = await redis.set(f"burn:{doc_id}", "1", get=True)
        if old_value is None:
            # Key doesn't exist (expired or never set) → treat as already burned
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document already burned")
        if old_value == "1":
            # Already read
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document already burned")
        # old_value == "0" → first read
        # Delete the document immediately
        await db.documents.delete_one({"_id": doc_id})
        # Clean up the Redis key (optional, TTL would delete it anyway)
        await redis.delete(f"burn:{doc_id}")

    return {
        "doc_id": doc["_id"],
        "ciphertext": doc["ciphertext"],
        "iv": doc["iv"],
        "created_at": doc["created_at"],
        "expires_at": doc["expires_at"],
        "burn_after_reading": doc.get("burn_after_reading", False),
        "version": doc["version"]
    }


async def update_document(db: AsyncIOMotorDatabase, redis: Redis, doc_id: str,
                          ciphertext: str, iv: str, version: int) -> int:
    result = await db.documents.find_one_and_update(
        {"_id": doc_id, "version": version},
        {"$set": {"ciphertext": ciphertext, "iv": iv}, "$inc": {"version": 1}},
        return_document=True
    )
    if not result:
        existing = await db.documents.find_one({"_id": doc_id})
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        else:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail="Document modified by another session. Refresh and retry.")
    return result["version"]


async def delete_document(db: AsyncIOMotorDatabase, redis: Redis, doc_id: str):
    result = await db.documents.delete_one({"_id": doc_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await redis.delete(f"burn:{doc_id}")