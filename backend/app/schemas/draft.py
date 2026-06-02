from __future__ import annotations
from datetime import datetime
from uuid import UUID

from typing import Optional

from pydantic import BaseModel


class DraftCreate(BaseModel):
    encrypted_title: str
    encrypted_content: str
    encryption_iv: str
    encryption_salt: str
    title_hash: Optional[str] = None
    material_id: Optional[UUID] = None
    status: str = "draft"


class DraftUpdate(BaseModel):
    encrypted_title: Optional[str] = None
    encrypted_content: Optional[str] = None
    encryption_iv: Optional[str] = None
    encryption_salt: Optional[str] = None
    status: Optional[str] = None


class DraftResponse(BaseModel):
    id: UUID
    user_id: UUID
    material_id: Optional[UUID]
    encrypted_title: str
    encrypted_content: str
    encryption_iv: str
    encryption_salt: str
    title_hash: Optional[str]
    status: str
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DraftListResponse(BaseModel):
    items: list[DraftResponse]
    total: int
    page: int
