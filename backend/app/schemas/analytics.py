from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PostAnalyticsCreate(BaseModel):
    view_count: int = Field(default=0, ge=0, le=2147483647, strict=True)
    like_count: int = Field(default=0, ge=0, le=2147483647, strict=True)
    comment_count: int = Field(default=0, ge=0, le=2147483647, strict=True)
    share_count: int = Field(default=0, ge=0, le=2147483647, strict=True)
    collect_count: int = Field(default=0, ge=0, le=2147483647, strict=True)


class PostAnalyticsItem(PostAnalyticsCreate):
    id: UUID
    collected_at: datetime
    model_config = {'from_attributes': True}


class PostAnalyticsSummary(BaseModel):
    post_id: UUID
    title_hash: Optional[str]
    xhs_post_url: Optional[str]
    published_at: datetime
    latest: Optional[PostAnalyticsItem]
    history: list[PostAnalyticsItem]


class AnalyticsResponse(BaseModel):
    posts: list[PostAnalyticsSummary]
