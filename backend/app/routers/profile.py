from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import update

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..schemas.creator import ProfileResponse, ProfileUpdate

router = APIRouter(prefix='/profile', tags=['profile'])


@router.get('', response_model=ProfileResponse)
async def get_profile(user: User = Depends(get_current_user)):
    return {'encrypted_profile': user.encrypted_profile, 'version': user.profile_version}


@router.put('', response_model=ProfileResponse)
async def save_profile(body: ProfileUpdate, user: User = Depends(get_current_user), db=Depends(get_db)):
    result = await db.execute(update(User).where(User.id == user.id, User.profile_version == body.expected_version).values(
        encrypted_profile=body.encrypted_profile.model_dump() if body.encrypted_profile else None,
        profile_version=User.profile_version + 1,
    ).returning(User))
    saved = result.scalar_one_or_none()
    if saved is None:
        raise HTTPException(409, 'Creator profile changed; reload before saving')
    await db.commit()
    return {'encrypted_profile': saved.encrypted_profile, 'version': saved.profile_version}
