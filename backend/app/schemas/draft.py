from __future__ import annotations
from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator
from .creator import EncryptedEnvelope
from .material import MaterialCreate


class DraftEnvelope(BaseModel):
    encrypted_title: str = Field(min_length=1)
    encrypted_content: str = Field(min_length=1)
    encryption_iv: str = Field(min_length=1, max_length=64)
    content_iv: str = Field(min_length=1, max_length=64)
    encryption_salt: str = Field(min_length=1, max_length=64)
    encryption_version: Literal[2] = 2
    title_hash: Optional[str] = Field(None, max_length=64)
    material_id: Optional[UUID] = None
    image_ids: list[str] = Field(default_factory=list, max_length=100)
    status: Literal['idea', 'draft', 'ready', 'published'] = 'draft'
    planned_date: Optional[date] = None
    topic_tags: list[str] = Field(default_factory=list, max_length=50)
    encrypted_context: Optional[EncryptedEnvelope] = None

    @field_validator('topic_tags')
    @classmethod
    def valid_tags(cls, values):
        return MaterialCreate.validate_tags(values)

    @field_validator('image_ids')
    @classmethod
    def validate_images(cls, values):
        ids = [str(UUID(value)) for value in values]
        if len(ids) != len(set(ids)):
            raise ValueError('Image IDs must be unique')
        return ids

    @model_validator(mode='after')
    def independent_ivs(self):
        if self.content_iv == self.encryption_iv:
            raise ValueError('Title and content require independent IVs')
        return self


class DraftCreate(DraftEnvelope):
    client_id: Optional[UUID] = None


class DraftUpdate(DraftEnvelope):
    expected_version: int = Field(ge=1)


class DraftResponse(BaseModel):
    id: UUID
    user_id: UUID
    material_id: Optional[UUID]
    encrypted_title: str
    encrypted_content: str
    encryption_iv: str
    content_iv: Optional[str] = None
    encryption_version: int = 1
    image_ids: list[str] = Field(default_factory=list)
    encryption_salt: str
    title_hash: Optional[str]
    status: str
    planned_date: Optional[date] = None
    topic_tags: list[str] = Field(default_factory=list)
    encrypted_context: Optional[EncryptedEnvelope] = None
    version: int
    created_at: datetime
    updated_at: datetime
    model_config = {'from_attributes': True}


class DraftListResponse(BaseModel):
    items: list[DraftResponse]
    total: int
    page: int
