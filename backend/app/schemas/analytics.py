from __future__ import annotations
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field


class PostAnalyticsCreate(BaseModel):
    collected_at: Optional[AwareDatetime] = None
    view_count: int = Field(default=0, ge=0, le=2147483647, strict=True)
    like_count: int = Field(default=0, ge=0, le=2147483647, strict=True)
    comment_count: int = Field(default=0, ge=0, le=2147483647, strict=True)
    share_count: int = Field(default=0, ge=0, le=2147483647, strict=True)
    collect_count: int = Field(default=0, ge=0, le=2147483647, strict=True)


class PostAnalyticsItem(PostAnalyticsCreate):
    id: UUID
    collected_at: AwareDatetime
    model_config = {'from_attributes': True}


class PostAnalyticsSummary(BaseModel):
    post_id: UUID
    title_hash: Optional[str]
    xhs_post_url: Optional[str]
    published_at: datetime
    latest: Optional[PostAnalyticsItem]
    history: list[PostAnalyticsItem]
    topic_tags: list[str] = Field(default_factory=list)
    template_id: Optional[str] = None


class AnalyticsResponse(BaseModel):
    posts: list[PostAnalyticsSummary]


class AnalyticsImportRequest(BaseModel):
    csv_text: str = Field(max_length=1_000_000)
    confirm: bool = False


class AnalyticsImportRow(PostAnalyticsCreate):
    row: int
    post_id: UUID
    xhs_post_url: Optional[str]
    collected_at: AwareDatetime


class AnalyticsImportError(BaseModel):
    row: int
    message: str


class AnalyticsImportResponse(BaseModel):
    rows: list[AnalyticsImportRow]
    errors: list[AnalyticsImportError]
    imported: int = 0
    skipped: int = 0


class AnalyticsInsightGroup(BaseModel):
    kind: Literal['topic', 'template']
    name: str
    sample_count: int
    total_posts: int
    missing_count: int
    average_views: Optional[float]
    average_interactions: Optional[float]
    interaction_rate: Optional[float]
    post_ids: list[UUID]
    observation_ages_hours: list[float]


class AnalyticsInsightsResponse(BaseModel):
    window_hours: Literal[24, 72]
    window_tolerance_hours: int = 3
    groups: list[AnalyticsInsightGroup]


class AnalyticsReviewIdea(BaseModel):
    title: str
    reason: str
    post_ids: list[UUID]


class AnalyticsReviewResponse(BaseModel):
    observations: list[str]
    ideas: list[AnalyticsReviewIdea]
    limitations: list[str]
