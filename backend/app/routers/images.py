from __future__ import annotations
from uuid import UUID, uuid4
from botocore.exceptions import ClientError, BotoCoreError
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text

from ..config import settings
from ..database import get_db
from ..dependencies import get_current_user
from ..models.image import Image
from ..models.draft import Draft
from ..models.user import User
from ..schemas.image import (
    ImageConfirmRequest, MAX_IMAGE_BYTES,
    ImageListResponse,
    ImageResponse,
    ImageUploadUrlRequest,
    ImageUploadUrlResponse,
)
from ..services.r2_service import R2Service

router = APIRouter(prefix="/images", tags=["images"])


@router.post("/upload-url", response_model=ImageUploadUrlResponse)
async def get_upload_url(body: ImageUploadUrlRequest, user: User = Depends(get_current_user)):
    r2_key = f"users/{user.id}/{uuid4()}/{body.filename}"
    try:
        upload_url = await R2Service().generate_presigned_upload_url(r2_key, body.mime_type, body.file_size)
    except (BotoCoreError, ClientError, ValueError, asyncio.TimeoutError) as exc:
        raise storage_error(exc) from exc
    return ImageUploadUrlResponse(upload_url=upload_url, r2_key=r2_key, expires_in=900)


@router.post("/confirm", response_model=ImageResponse, status_code=201)
async def confirm_upload(body: ImageConfirmRequest, user: User = Depends(get_current_user), db=Depends(get_db)):
    if not body.r2_key.startswith(f'users/{user.id}/') or any(part in ('.', '..') for part in body.r2_key.split('/')):
        raise HTTPException(403, 'Image key does not belong to this account')
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": body.r2_key})
    existing = await db.scalar(select(Image).where(Image.r2_key == body.r2_key))
    if existing:
        if existing.user_id != user.id:
            raise HTTPException(403, 'Image key does not belong to this account')
        return existing
    try:
        r2 = R2Service()
        metadata = await r2.head_object(body.r2_key)
    except (BotoCoreError, ClientError, ValueError, asyncio.TimeoutError) as exc:
        raise storage_error(exc) from exc
    size = metadata.get('ContentLength', 0)
    mime = metadata.get('ContentType', '').split(';', 1)[0].strip().lower()
    if not 0 < size <= MAX_IMAGE_BYTES or mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'):
        raise HTTPException(422, 'Uploaded object has an unsupported size or image content type')
    image = Image(
        user_id=user.id, r2_key=body.r2_key, r2_url=r2.get_public_url(body.r2_key),
        original_filename=body.r2_key.rsplit('/',1)[-1], mime_type=mime,
        file_size_bytes=size, width=body.width, height=body.height,
    )
    db.add(image)
    await db.commit()
    await db.refresh(image)
    return image


@router.get("", response_model=ImageListResponse)
async def list_images(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    offset = (page - 1) * limit
    total = (await db.execute(select(func.count(Image.id)).where(Image.user_id == user.id))).scalar()
    items = (await db.execute(
        select(Image).where(Image.user_id == user.id).order_by(Image.created_at.desc()).offset(offset).limit(limit)
    )).scalars().all()
    return ImageListResponse(items=list(items), total=total, page=page)


@router.delete("/{image_id}")
async def delete_image(image_id: UUID, user: User = Depends(get_current_user), db=Depends(get_db)):
    # Reference writers take shared image locks before touching draft rows.
    result = await db.execute(select(Image).where(Image.id == image_id, Image.user_id == user.id).with_for_update())
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        await R2Service().delete_object(image.r2_key)
    except (BotoCoreError, ClientError, ValueError, asyncio.TimeoutError) as exc:
        raise storage_error(exc) from exc
    # Lock affected drafts in a stable order, using their current versions after
    # any concurrent save. No database mutation occurs until storage succeeds.
    affected = (await db.execute(select(Draft).where(
        Draft.user_id == user.id, Draft.image_ids.any(str(image_id)),
    ).order_by(Draft.id).with_for_update())).scalars().all()
    for draft in affected:
        draft.image_ids = [value for value in draft.image_ids if value != str(image_id)]
        draft.version += 1
    await db.delete(image)
    await db.commit()
    return {"ok": True}


def storage_error(exc):
    if isinstance(exc, ValueError):
        return HTTPException(503, 'R2 storage is not configured')
    if isinstance(exc, ClientError) and exc.response.get('Error', {}).get('Code') in ('404', 'NoSuchKey', 'NotFound'):
        return HTTPException(422, 'Upload is missing in object storage; upload again before confirming')
    return HTTPException(502, 'Object storage request failed; please retry')


@router.get('/{image_id}/download-url')
async def get_download_url(image_id: UUID, user: User = Depends(get_current_user), db=Depends(get_db)):
    image = await db.scalar(select(Image).where(Image.id == image_id, Image.user_id == user.id))
    if not image:
        raise HTTPException(404, 'Image not found')
    try:
        url = await R2Service().generate_presigned_download_url(image.r2_key)
    except (BotoCoreError, ClientError, ValueError, asyncio.TimeoutError) as exc:
        raise storage_error(exc) from exc
    return {'download_url': url, 'expires_in': 3600}
