from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from ..database import get_db
from ..dependencies import get_current_user
from ..models.material import Material
from ..models.user import User
from ..schemas.material import MaterialCreate, MaterialListResponse, MaterialResponse

router = APIRouter(prefix="/materials", tags=["materials"])

@router.post("", response_model=MaterialResponse, status_code=201)
async def create_material(body: MaterialCreate, user: User = Depends(get_current_user), db=Depends(get_db)):
    material = Material(user_id=user.id, **body.model_dump())
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return material

@router.get("", response_model=MaterialListResponse)
async def list_materials(page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100), user: User = Depends(get_current_user), db=Depends(get_db)):
    offset = (page - 1) * limit
    total = (await db.execute(select(func.count(Material.id)).where(Material.user_id == user.id))).scalar()
    items = (await db.execute(select(Material).where(Material.user_id == user.id).order_by(Material.created_at.desc()).offset(offset).limit(limit))).scalars().all()
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
