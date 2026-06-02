from __future__ import annotations
from uuid import UUID

from typing import Optional

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
