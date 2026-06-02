from __future__ import annotations
import hashlib
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select

from .database import get_db
from .models.user import User


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db=Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    api_key = authorization.removeprefix("Bearer ")
    api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

    result = await db.execute(select(User).where(User.api_key_hash == api_key_hash))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid API key")

    return user
