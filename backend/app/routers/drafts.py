from __future__ import annotations
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update, text

from ..database import get_db
from ..dependencies import get_current_user
from ..models.draft import Draft
from ..models.image import Image
from ..models.material import Material
from ..models.user import User
from ..schemas.draft import DraftCreate, DraftListResponse, DraftResponse, DraftUpdate

router = APIRouter(prefix="/drafts", tags=["drafts"])


@router.post("", response_model=DraftResponse, status_code=201)
async def create_draft(body: DraftCreate, user: User = Depends(get_current_user), db=Depends(get_db)):
    if body.client_id:
        # Serialize retries before checking the primary key, including concurrent POSTs.
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {'key': str(body.client_id)})
        existing = await db.get(Draft, body.client_id)
        if existing:
            if existing.user_id != user.id:
                raise HTTPException(409, 'Draft ID already exists')
            return existing
    await validate_references(body, user, db)
    values = body.model_dump(exclude={'client_id'})
    if body.client_id:
        values['id'] = body.client_id
    draft = Draft(user_id=user.id, **values)
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    return draft


@router.get("", response_model=DraftListResponse)
async def list_drafts(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    offset = (page - 1) * limit
    query = select(Draft).where(Draft.user_id == user.id)
    count_query = select(func.count(Draft.id)).where(Draft.user_id == user.id)
    if status:
        query = query.where(Draft.status == status)
        count_query = count_query.where(Draft.status == status)

    total = (await db.execute(count_query)).scalar()
    items = (await db.execute(
        query.order_by(Draft.updated_at.desc()).offset(offset).limit(limit)
    )).scalars().all()
    return DraftListResponse(items=list(items), total=total, page=page)


@router.get("/{draft_id}", response_model=DraftResponse)
async def get_draft(draft_id: UUID, user: User = Depends(get_current_user), db=Depends(get_db)):
    result = await db.execute(select(Draft).where(Draft.id == draft_id, Draft.user_id == user.id))
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@router.put("/{draft_id}", response_model=DraftResponse)
async def update_draft(draft_id: UUID, body: DraftUpdate, user: User = Depends(get_current_user), db=Depends(get_db)):
    current_version = await db.scalar(select(Draft.version).where(Draft.id == draft_id, Draft.user_id == user.id))
    if current_version is None:
        raise HTTPException(404, 'Draft not found')
    if current_version != body.expected_version:
        raise HTTPException(409, 'Draft changed; reload before saving')
    try:
        await validate_references(body, user, db)
    except HTTPException:
        # Deletion can finish while reference validation waits for an image lock.
        # Preserve the conflict contract when that deletion also bumped this draft.
        current_version = await db.scalar(select(Draft.version).where(Draft.id == draft_id, Draft.user_id == user.id))
        if current_version is not None and current_version != body.expected_version:
            raise HTTPException(409, 'Draft changed; reload before saving')
        raise
    values = body.model_dump(exclude={'expected_version'})
    values.update(version=Draft.version + 1, updated_at=func.now())
    result = await db.execute(update(Draft).where(
        Draft.id == draft_id, Draft.user_id == user.id,
        Draft.version == body.expected_version,
    ).values(**values).returning(Draft))
    draft = result.scalar_one_or_none()
    if draft is None:
        exists = await db.scalar(select(Draft.id).where(Draft.id == draft_id, Draft.user_id == user.id))
        raise HTTPException(409 if exists else 404, 'Draft changed; reload before saving' if exists else 'Draft not found')
    await db.commit()
    return draft


@router.delete("/{draft_id}")
async def delete_draft(draft_id: UUID, user: User = Depends(get_current_user), db=Depends(get_db)):
    result = await db.execute(select(Draft).where(Draft.id == draft_id, Draft.user_id == user.id))
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    await db.delete(draft)
    await db.commit()
    return {"ok": True}


async def validate_references(body, user, db):
    if body.material_id:
        material = await db.scalar(select(Material.id).where(Material.id == body.material_id, Material.user_id == user.id))
        if not material:
            raise HTTPException(422, 'Material does not belong to this account')
    if body.image_ids:
        ids = [UUID(value) for value in body.image_ids]
        owned = (await db.execute(select(Image.id).where(Image.id.in_(ids), Image.user_id == user.id).order_by(Image.id).with_for_update(read=True))).scalars().all()
        if len(owned) != len(ids):
            raise HTTPException(422, 'One or more images do not belong to this account')
