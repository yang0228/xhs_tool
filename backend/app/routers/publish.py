from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func

from ..database import get_db
from ..dependencies import get_current_user
from ..models.draft import Draft
from ..models.published_post import PublishedPost
from ..models.user import User
from ..schemas.publish import PublicationRecordCreate, PublishedPostResponse, PublishedPostListResponse

router = APIRouter(prefix='/publish', tags=['publish'])


@router.get('/posts', response_model=PublishedPostListResponse)
async def list_posts(page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100), user: User = Depends(get_current_user), db=Depends(get_db)):
    where = PublishedPost.user_id == user.id
    total = await db.scalar(select(func.count(PublishedPost.id)).where(where))
    posts = (await db.execute(select(PublishedPost).where(where).order_by(PublishedPost.published_at.desc(), PublishedPost.id).offset((page-1)*limit).limit(limit))).scalars().all()
    return PublishedPostListResponse(items=list(posts), total=total, page=page)


@router.post('/records', response_model=PublishedPostResponse, status_code=201)
async def record_publication(body: PublicationRecordCreate, user: User = Depends(get_current_user), db=Depends(get_db)):
    draft = await db.scalar(select(Draft).where(Draft.id == body.draft_id, Draft.user_id == user.id).with_for_update())
    if not draft:
        raise HTTPException(404, 'Draft not found')
    existing = await db.scalar(select(PublishedPost).where(PublishedPost.user_id == user.id, PublishedPost.draft_id == draft.id, PublishedPost.xhs_post_url == body.xhs_post_url).limit(1))
    if existing:
        return existing
    post = PublishedPost(user_id=user.id, draft_id=draft.id, xhs_post_url=body.xhs_post_url, publish_status='published')
    db.add(post)
    draft.status = 'published'
    draft.version += 1
    await db.commit()
    await db.refresh(post)
    return post


@router.post('')
async def publish(user: User = Depends(get_current_user)):
    raise HTTPException(501, 'Automatic publishing is not supported. Publish in Xiaohongshu and record the URL.')


@router.get('/status/{job_id}')
async def get_status(job_id: str, user: User = Depends(get_current_user)):
    raise HTTPException(501, 'Automatic publishing is not supported.')


@router.post('/xhs/credentials')
async def save_credentials(user: User = Depends(get_current_user)):
    raise HTTPException(501, 'Xiaohongshu credential storage is not supported.')
