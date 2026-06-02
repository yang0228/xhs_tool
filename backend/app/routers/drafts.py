from __future__ import annotations
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from ..database import get_db
from ..dependencies import get_current_user
from ..models.draft import Draft
from ..models.user import User
from ..schemas.draft import DraftCreate, DraftListResponse, DraftResponse, DraftUpdate

router = APIRouter(prefix="/drafts", tags=["drafts"])


@router.post("", response_model=DraftResponse, status_code=201)
async def create_draft(body: DraftCreate, user: User = Depends(get_current_user), db=Depends(get_db)):
    draft = Draft(user_id=user.id, **body.model_dump())
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
    result = await db.execute(select(Draft).where(Draft.id == draft_id, Draft.user_id == user.id))
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(draft, key, value)
    draft.version += 1

    await db.commit()
    await db.refresh(draft)
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
