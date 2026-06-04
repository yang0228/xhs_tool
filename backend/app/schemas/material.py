from __future__ import annotations
from datetime import datetime
from uuid import UUID

from typing import Optional

from pydantic import BaseModel, Field, field_validator


class MaterialCreate(BaseModel):
    encrypted_content: str
    encryption_iv: str = Field(min_length=1, max_length=64)
    encryption_salt: str = Field(min_length=1, max_length=64)
    content_hash: str = Field(min_length=1, max_length=64)
    source_url: Optional[str] = None
    source_title: Optional[str] = Field(None, max_length=512)
    content_type: str = Field("article", max_length=32)
    word_count: Optional[int] = Field(None, ge=0)
    tags: list[str] = Field(default_factory=list, max_length=50)


    @field_validator('tags')
    @classmethod
    def validate_tags(cls, values):
        cleaned = list(dict.fromkeys(value.strip() for value in values))
        if any(not value or len(value) > 64 for value in cleaned):
            raise ValueError('Tags must contain 1 to 64 characters')
        return cleaned


class MaterialResponse(BaseModel):
    id: UUID
    user_id: UUID
    encrypted_content: str
    encryption_iv: str
    encryption_salt: str
    content_hash: str
    source_url: Optional[str]
    source_title: Optional[str]
    content_type: str
    word_count: Optional[int]
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MaterialListResponse(BaseModel):
    items: list[MaterialResponse]
    total: int
    page: int
