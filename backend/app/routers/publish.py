from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func

from ..database import get_db
from ..dependencies import get_current_user
from ..models.draft import Draft
from ..models.image import Image
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
    # Image deletion locks images before drafts; every reference writer follows
    # the same order to prevent deadlocks and historical dangling references.
    initial = await db.scalar(select(Draft).where(Draft.id == body.draft_id, Draft.user_id == user.id))
    if not initial:
        raise HTTPException(404, 'Draft not found')
    image_ids = list(initial.image_ids)
    if image_ids:
        from uuid import UUID
        owned = (await db.execute(select(Image.id).where(Image.id.in_([UUID(value) for value in image_ids]), Image.user_id == user.id).order_by(Image.id).with_for_update(read=True))).scalars().all()
        if len(owned) != len(image_ids):
            raise HTTPException(409, 'Draft images changed; reload before recording')
    draft = await db.scalar(select(Draft).where(Draft.id == body.draft_id, Draft.user_id == user.id).with_for_update().execution_options(populate_existing=True))
    if not draft:
        raise HTTPException(404, 'Draft not found')
    existing = await db.scalar(select(PublishedPost).where(PublishedPost.user_id == user.id, PublishedPost.draft_id == draft.id, PublishedPost.xhs_post_url == body.xhs_post_url).limit(1))
    if existing:
        return existing
    if draft.image_ids != image_ids or (body.expected_version is not None and draft.version != body.expected_version):
        raise HTTPException(409, 'Draft changed; reload before recording')
    values = dict(user_id=user.id, draft_id=draft.id, xhs_post_url=body.xhs_post_url, publish_status='published',
                  draft_version=draft.version, topic_tags=list(draft.topic_tags), image_ids=image_ids, template_id=body.template_id)
    if body.published_at is not None:
        values['published_at'] = body.published_at
    if body.snapshot is not None:
        values.update(encrypted_snapshot_content=body.snapshot.ciphertext, encryption_iv=body.snapshot.iv, encryption_salt=body.snapshot.salt)
    post = PublishedPost(**values)
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
