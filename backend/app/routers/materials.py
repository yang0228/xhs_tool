from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text, or_
from ..database import get_db
from ..dependencies import get_current_user
from ..models.material import Material
from ..models.user import User
from ..schemas.material import MaterialCreate, MaterialListResponse, MaterialResponse

router = APIRouter(prefix="/materials", tags=["materials"])

@router.post("", response_model=MaterialResponse, status_code=201)
async def create_material(body: MaterialCreate, user: User = Depends(get_current_user), db=Depends(get_db)):
    # Keep old duplicate records intact; serialize new collection requests per owner/hash.
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {'key': f'{user.id}:{body.content_hash}'})
    existing = await db.scalar(select(Material).where(Material.user_id == user.id, Material.content_hash == body.content_hash).order_by(Material.created_at).limit(1))
    if existing:
        return existing
    material = Material(user_id=user.id, **body.model_dump())
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return material

@router.get("", response_model=MaterialListResponse)
async def list_materials(page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100), tag: str = '', q: str = '', user: User = Depends(get_current_user), db=Depends(get_db)):
    filters = [Material.user_id == user.id]
    if tag:
        filters.append(Material.tags.any(tag))
    if q:
        # Ciphertext stays opaque; full-content search happens after local decryption.
        filters.append(or_(Material.source_title.icontains(q, autoescape=True), Material.source_url.icontains(q, autoescape=True)))
    total = await db.scalar(select(func.count(Material.id)).where(*filters))
    items = (await db.execute(select(Material).where(*filters).order_by(Material.created_at.desc(), Material.id).offset((page - 1) * limit).limit(limit))).scalars().all()
    return MaterialListResponse(items=list(items), total=total, page=page)

@router.get("/{material_id}", response_model=MaterialResponse)
async def get_material(material_id: UUID, user: User = Depends(get_current_user), db=Depends(get_db)):
    result = await db.execute(select(Material).where(Material.id == material_id, Material.user_id == user.id))
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material

@router.delete("/{material_id}")
async def delete_material(material_id: UUID, user: User = Depends(get_current_user), db=Depends(get_db)):
    result = await db.execute(select(Material).where(Material.id == material_id, Material.user_id == user.id))
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    await db.delete(material)
    await db.commit()
    return {"ok": True}
