from fastapi import APIRouter, Depends, status
from app.models.document import DocumentCreate, DocumentUpdate, DocumentResponse
from app.services.document_service import create_document, get_document, update_document, delete_document
from app.db.mongodb import get_database
from app.db.redis import get_redis
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

router = APIRouter(prefix="/api/documents", tags=["documents"])

@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create(doc: DocumentCreate,
                 db: AsyncIOMotorDatabase = Depends(get_database),
                 redis: Redis = Depends(get_redis)):
    doc_id = await create_document(
        db, redis,
        doc.ciphertext,
        doc.iv,
        doc.expiry_hours,
        doc.burn_after_reading
    )
    return {"doc_id": doc_id}

@router.get("/{doc_id}", response_model=DocumentResponse)
async def get(doc_id: str,
              db: AsyncIOMotorDatabase = Depends(get_database),
              redis: Redis = Depends(get_redis)):
    return await get_document(db, redis, doc_id)

@router.put("/{doc_id}", response_model=dict)
async def update(doc_id: str, update_data: DocumentUpdate,
                 db: AsyncIOMotorDatabase = Depends(get_database),
                 redis: Redis = Depends(get_redis)):
    new_version = await update_document(
        db, redis, doc_id,
        update_data.ciphertext,
        update_data.iv,
        update_data.version
    )
    return {"success": True, "new_version": new_version}

@router.delete("/{doc_id}", response_model=dict)
async def delete(doc_id: str,
                 db: AsyncIOMotorDatabase = Depends(get_database),
                 redis: Redis = Depends(get_redis)):
    await delete_document(db, redis, doc_id)
    return {"success": True}