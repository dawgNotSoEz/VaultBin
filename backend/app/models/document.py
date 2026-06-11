from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional
import base64

class DocumentCreate(BaseModel):
    ciphertext: str = Field(..., min_length=1)
    iv: str = Field(..., min_length=1)
    expiry_hours: int = Field(default=24, ge=1, le=168)
    burn_after_reading: bool = False
    # Password fields (all optional)
    password: Optional[str] = None
    wrapped_key: Optional[str] = None       # AES key wrapped with password-derived key
    password_salt: Optional[str] = None     # salt for Argon2id

    @field_validator("ciphertext", "iv", "wrapped_key", "password_salt")
    @classmethod
    def must_be_base64_if_present(cls, v, info):
        if v is None:
            return v
        try:
            # Pads the string and tries to decode – if it fails, it's invalid
            base64.urlsafe_b64decode(v + "==")
        except Exception:
            raise ValueError(f"{info.field_name} must be a valid base64 string")
        return v

class PasswordVerifyRequest(BaseModel):
    password: str


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
    has_password: bool = False   # tells frontend to prompt
    password_salt: Optional[str] = None   # needed for key derivation