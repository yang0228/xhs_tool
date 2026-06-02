from __future__ import annotations
from datetime import datetime
from uuid import UUID

from typing import Optional

from pydantic import BaseModel


class ImageUploadUrlRequest(BaseModel):
    filename: str
    mime_type: str
    file_size: int


class ImageUploadUrlResponse(BaseModel):
    upload_url: str
    r2_key: str
    expires_in: int


class ImageConfirmRequest(BaseModel):
    r2_key: str
    width: Optional[int] = None
    height: Optional[int] = None


class ImageResponse(BaseModel):
    id: UUID
    user_id: UUID
    r2_key: str
    r2_url: str
    original_filename: Optional[str]
    mime_type: str
    file_size_bytes: Optional[int]
    width: Optional[int]
    height: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


class ImageListResponse(BaseModel):
    items: list[ImageResponse]
    total: int
    page: int
