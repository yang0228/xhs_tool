from __future__ import annotations
from datetime import datetime, timedelta, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select
from ..database import get_db
from ..dependencies import get_current_user
from ..models.post_analytics import PostAnalytics
from ..models.published_post import PublishedPost
from ..models.user import User
from ..schemas.analytics import AnalyticsResponse, PostAnalyticsCreate, PostAnalyticsItem, PostAnalyticsSummary

router = APIRouter(prefix='/analytics', tags=['analytics'])


@router.get('/posts', response_model=AnalyticsResponse)
async def get_posts_analytics(days: int = Query(30, ge=1, le=365), user: User = Depends(get_current_user), db=Depends(get_db)):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    posts = (await db.execute(select(PublishedPost).where(PublishedPost.user_id == user.id).order_by(PublishedPost.published_at.desc()))).scalars().all()
    summaries = []
    for post in posts:
        history = (await db.execute(select(PostAnalytics).where(PostAnalytics.published_post_id == post.id, PostAnalytics.collected_at >= cutoff).order_by(PostAnalytics.collected_at.desc()))).scalars().all()
        items = [PostAnalyticsItem.model_validate(h) for h in history]
        summaries.append(PostAnalyticsSummary(post_id=post.id, title_hash=None, xhs_post_url=post.xhs_post_url, published_at=post.published_at, latest=items[0] if items else None, history=items))
    return AnalyticsResponse(posts=summaries)


@router.post('/posts/{post_id}', response_model=PostAnalyticsItem, status_code=201)
async def record_metrics(post_id: UUID, body: PostAnalyticsCreate, user: User = Depends(get_current_user), db=Depends(get_db)):
    post = await db.scalar(select(PublishedPost.id).where(PublishedPost.id == post_id, PublishedPost.user_id == user.id))
    if not post:
        raise HTTPException(404, 'Published post not found')
    metrics = PostAnalytics(published_post_id=post_id, **body.model_dump())
    db.add(metrics)
    await db.commit()
    await db.refresh(metrics)
    return metrics


@router.post('/refresh')
async def refresh_analytics(user: User = Depends(get_current_user)):
    raise HTTPException(501, 'Automatic analytics collection is not supported. Enter metrics manually.')
