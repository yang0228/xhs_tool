from __future__ import annotations
from datetime import datetime
from uuid import UUID
from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator

MAX_IMAGE_BYTES = 20 * 1024 * 1024
ImageMime = Literal['image/jpeg', 'image/png', 'image/webp', 'image/gif']


class ImageUploadUrlRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=256)
    mime_type: ImageMime
    file_size: int = Field(gt=0, le=MAX_IMAGE_BYTES)

    @field_validator('filename')
    @classmethod
    def plain_filename(cls, value):
        if '/' in value or '\\' in value or value in ('.', '..') or any(ord(c) < 32 for c in value):
            raise ValueError('Use a plain filename')
        return value


class ImageUploadUrlResponse(BaseModel):
    upload_url: str
    r2_key: str
    expires_in: int


class ImageConfirmRequest(BaseModel):
    r2_key: str = Field(min_length=1, max_length=512)
    width: Optional[int] = Field(None, gt=0, le=100000)
    height: Optional[int] = Field(None, gt=0, le=100000)


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
    model_config = {'from_attributes': True}


class ImageListResponse(BaseModel):
    items: list[ImageResponse]
    total: int
    page: int
