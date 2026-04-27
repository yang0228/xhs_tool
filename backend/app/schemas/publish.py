from __future__ import annotations
from uuid import UUID

from typing import Literal, Optional

from pydantic import BaseModel


class PublishRequest(BaseModel):
    draft_id: UUID
    encrypted_cookies: str
    encryption_iv: str
    encryption_salt: str


class PublishStatusResponse(BaseModel):
    status: str
    xhs_post_id: Optional[str] = None
    xhs_post_url: Optional[str] = None
    error: Optional[str] = None


class XHSCredentialsSave(BaseModel):
    encrypted_cookies: str
    encryption_iv: str
    encryption_salt: str


from datetime import datetime
from urllib.parse import urlsplit
from pydantic import Field, field_validator, model_validator
from .creator import EncryptedEnvelope


class PublicationRecordCreate(BaseModel):
    draft_id: UUID
    xhs_post_url: str
    expected_version: Optional[int] = Field(None, ge=1)
    snapshot: Optional[EncryptedEnvelope] = None
    template_id: Optional[Literal['checklist', 'steps']] = None
    published_at: Optional[datetime] = None

    @field_validator('published_at')
    @classmethod
    def aware_time(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError('Publication time must include a timezone')
        return value

    @model_validator(mode='after')
    def snapshot_version(self):
        if self.snapshot is not None and self.expected_version is None:
            raise ValueError('Snapshot requires the saved draft version')
        return self

    @field_validator('xhs_post_url')
    @classmethod
    def valid_publication_url(cls, value):
        value = value.strip()
        parsed = urlsplit(value)
        host = (parsed.hostname or '').lower()
        allowed = any(host == domain or host.endswith('.' + domain) for domain in ('xiaohongshu.com', 'xhslink.com'))
        if parsed.scheme != 'https' or not allowed or parsed.username or parsed.password or parsed.port not in (None, 443) or not parsed.path.strip('/'):
            raise ValueError('Enter an HTTPS Xiaohongshu publication or xhslink URL')
        return value


class PublishedPostResponse(BaseModel):
    id: UUID
    draft_id: Optional[UUID]
    xhs_post_id: Optional[str]
    xhs_post_url: Optional[str]
    publish_status: str
    published_at: datetime
    snapshot: Optional[EncryptedEnvelope] = None
    draft_version: Optional[int] = None
    topic_tags: list[str] = Field(default_factory=list)
    template_id: Optional[str] = None
    image_ids: list[str] = Field(default_factory=list)
    model_config = {'from_attributes': True}


class PublishedPostListResponse(BaseModel):
    items: list[PublishedPostResponse]
    total: int
    page: int
