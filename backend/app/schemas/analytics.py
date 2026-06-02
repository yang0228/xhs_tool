from __future__ import annotations
from datetime import datetime

from typing import Optional

from pydantic import BaseModel


class PostAnalyticsItem(BaseModel):
    id: str
    view_count: int
    like_count: int
    comment_count: int
    share_count: int
    collect_count: int
    collected_at: datetime


class PostAnalyticsSummary(BaseModel):
    post_id: str
    title_hash: Optional[str]
    xhs_post_url: Optional[str]
    published_at: datetime
    latest: Optional[PostAnalyticsItem]
    history: list[PostAnalyticsItem]


class AnalyticsResponse(BaseModel):
    posts: list[PostAnalyticsSummary]
