from __future__ import annotations
from datetime import datetime
from uuid import UUID

from typing import Optional

from pydantic import BaseModel


class MaterialCreate(BaseModel):
    encrypted_content: str
    encryption_iv: str
    encryption_salt: str
    content_hash: str
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    content_type: str = "article"
    word_count: Optional[int] = None


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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MaterialListResponse(BaseModel):
    items: list[MaterialResponse]
    total: int
    page: int
