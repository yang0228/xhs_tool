from __future__ import annotations
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from ..config import settings
from ..database import get_db
from ..dependencies import get_current_user
from ..models.image import Image
from ..models.user import User
from ..schemas.image import (
    ImageConfirmRequest,
    ImageListResponse,
    ImageResponse,
    ImageUploadUrlRequest,
    ImageUploadUrlResponse,
)
from ..services.r2_service import R2Service

router = APIRouter(prefix="/images", tags=["images"])


@router.post("/upload-url", response_model=ImageUploadUrlResponse)
async def get_upload_url(body: ImageUploadUrlRequest, user: User = Depends(get_current_user)):
    r2 = R2Service()
    r2_key = f"users/{user.id}/{uuid4()}/{body.filename}"
    upload_url = await r2.generate_presigned_upload_url(r2_key, body.mime_type)
    return ImageUploadUrlResponse(upload_url=upload_url, r2_key=r2_key, expires_in=900)


@router.post("/confirm", response_model=ImageResponse, status_code=201)
async def confirm_upload(body: ImageConfirmRequest, user: User = Depends(get_current_user), db=Depends(get_db)):
    r2 = R2Service()
    r2_url = r2.get_public_url(body.r2_key)

    image = Image(
        user_id=user.id,
        r2_key=body.r2_key,
        r2_url=r2_url,
        mime_type="image/png",  # Will be overridden from actual upload
        width=body.width,
        height=body.height,
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
    result = await db.execute(select(Image).where(Image.id == image_id, Image.user_id == user.id))
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    r2 = R2Service()
    await r2.delete_object(image.r2_key)
    await db.delete(image)
    await db.commit()
    return {"ok": True}
