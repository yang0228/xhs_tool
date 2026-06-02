from __future__ import annotations
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from ..database import get_db
from ..dependencies import get_current_user
from ..models.post_analytics import PostAnalytics
from ..models.published_post import PublishedPost
from ..models.user import User
from ..schemas.analytics import AnalyticsResponse, PostAnalyticsItem, PostAnalyticsSummary

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/posts", response_model=AnalyticsResponse)
async def get_posts_analytics(days: int = Query(30, ge=1, le=365), user: User = Depends(get_current_user), db=Depends(get_db)):
    result = await db.execute(select(PublishedPost).where(PublishedPost.user_id == user.id).order_by(PublishedPost.published_at.desc()))
    posts = result.scalars().all()
    summaries = []
    for post in posts:
        ar = await db.execute(select(PostAnalytics).where(PostAnalytics.published_post_id == post.id).order_by(PostAnalytics.collected_at.desc()))
        history = ar.scalars().all()
        hi = [PostAnalyticsItem.model_validate(h) for h in history]
        summaries.append(PostAnalyticsSummary(post_id=str(post.id), title_hash=None, xhs_post_url=post.xhs_post_url, published_at=post.published_at, latest=hi[0] if hi else None, history=hi))
    return AnalyticsResponse(posts=summaries)

@router.post("/refresh")
async def refresh_analytics(user: User = Depends(get_current_user)):
    return {"refreshed": 0}
