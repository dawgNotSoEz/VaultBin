from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis
from fastapi import HTTPException, status
import secrets
import bcrypt

async def create_document(db, redis, ciphertext, iv, expiry_hours, burn_after_reading,
                         password=None, wrapped_key=None, password_salt=None):
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
    if password:
        password = password.strip()
        # Server stores bcrypt hash (cost 12)
        salt = bcrypt.gensalt(rounds=12)
        doc["password_hash"] = bcrypt.hashpw(password.encode(), salt).decode()
        doc["wrapped_key"] = wrapped_key
        doc["password_salt"] = password_salt
    await db.documents.insert_one(doc)
    if burn_after_reading and not password:
        await redis.set(f"burn:{doc['_id']}", "0", ex=expiry_hours * 3600)
    return doc["_id"]

async def get_document(db: AsyncIOMotorDatabase, redis: Redis, doc_id: str) -> dict:
    doc = await db.documents.find_one({"_id": doc_id})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found or expired")

    if doc.get("burn_after_reading"):
        # If password is also set, do NOT delete yet.
        # Deletion will happen after password verification.
        if not doc.get("password_hash"):
            # No password: immediate burn on first read
            old_value = await redis.set(f"burn:{doc_id}", "1", get=True)
            if old_value is None or old_value == "1":
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document already burned")
            await db.documents.delete_one({"_id": doc_id})
            await redis.delete(f"burn:{doc_id}")

    has_password = "password_hash" in doc
    return {
        "doc_id": doc["_id"],
        "ciphertext": doc["ciphertext"],
        "iv": doc["iv"],
        "created_at": doc["created_at"],
        "expires_at": doc["expires_at"],
        "burn_after_reading": doc.get("burn_after_reading", False),
        "version": doc["version"],
        "has_password": has_password,
        "password_salt": doc.get("password_salt")
    }

async def verify_password(db, redis, doc_id, password):
    password = password.strip()
    doc = await db.documents.find_one({"_id": doc_id})
    if not doc or "password_hash" not in doc:
        raise HTTPException(404, detail="No password set or document not found")
    if not bcrypt.checkpw(password.encode(), doc["password_hash"].encode()):
        raise HTTPException(403, detail="Wrong password")

    if doc.get("burn_after_reading"):
        remaining = max(1, int((doc["expires_at"] - datetime.utcnow()).total_seconds()))
        was_set = await redis.set(f"burn:{doc_id}", "1", nx=True, ex=remaining)
        if not was_set:
            raise HTTPException(404, detail="Document already burned")
        await db.documents.delete_one({"_id": doc_id})
        await redis.delete(f"burn:{doc_id}")

    return {"wrapped_key": doc["wrapped_key"]}

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
