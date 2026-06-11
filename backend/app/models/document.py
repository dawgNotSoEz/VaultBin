from pydantic import BaseModel, Field, field_validator
from datetime import datetime
import base64

class DocumentCreate(BaseModel):
    ciphertext: str = Field(..., min_length=1)
    iv: str = Field(..., min_length=1)
    expiry_hours: int = Field(default=24, ge=1, le=168)
    burn_after_reading: bool = False

    @field_validator("ciphertext", "iv")
    @classmethod
    def must_be_base64(cls, v: str) -> str:
        try:
            base64.urlsafe_b64decode(v + "==")  # pad for correct decoding
        except Exception:
            raise ValueError("Must be a valid base64 string")
        return v

class DocumentUpdate(BaseModel):
    ciphertext: str = Field(..., min_length=1)
    iv: str = Field(..., min_length=1)
    version: int = Field(..., ge=1)

    @field_validator("ciphertext", "iv")
    @classmethod
    def must_be_base64(cls, v: str) -> str:
        try:
            base64.urlsafe_b64decode(v + "==")
        except Exception:
            raise ValueError("Must be a valid base64 string")
        return v

class DocumentResponse(BaseModel):
    doc_id: str
    ciphertext: str
    iv: str
    created_at: datetime
    expires_at: datetime
    burn_after_reading: bool
    version: int