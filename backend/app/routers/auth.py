from __future__ import annotations
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User

router = APIRouter(tags=["auth"])


@router.post("/auth/register")
async def register(db=Depends(get_db)):
    """Generate a new API key. Returns the key once — store it securely."""
    await db.execute(text("SELECT pg_advisory_xact_lock(780341925)"))
    if await db.scalar(select(User.id).limit(1)):
        raise HTTPException(409, 'This personal instance is already initialized. Use your saved API key.')
    api_key = "xhs_" + secrets.token_urlsafe(32)
    api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    api_key_prefix = api_key[:12]

    user = User(api_key_hash=api_key_hash, api_key_prefix=api_key_prefix)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {"api_key": api_key, "user_id": str(user.id), "prefix": api_key_prefix}


@router.post("/auth/verify")
async def verify(user: User = Depends(get_current_user)):
    """Verify the current API key is valid."""
    return {"valid": True, "user_id": str(user.id)}
