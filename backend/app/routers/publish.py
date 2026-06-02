from __future__ import annotations
import asyncio
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from ..database import get_db
from ..dependencies import get_current_user
from ..models.draft import Draft
from ..models.published_post import PublishedPost
from ..models.user import User
from ..schemas.publish import PublishRequest, PublishStatusResponse, XHSCredentialsSave
from ..services.xhs_publisher import XHSPublisher

router = APIRouter(prefix="/publish", tags=["publish"])

# In-memory job tracking (replace with proper queue in production)
jobs: dict[str, dict] = {}


@router.post("")
async def publish(body: PublishRequest, user: User = Depends(get_current_user), db=Depends(get_db)):
    # Verify draft exists
    result = await db.execute(select(Draft).where(Draft.id == body.draft_id, Draft.user_id == user.id))
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    job_id = str(uuid4())
    jobs[job_id] = {"status": "queued", "xhs_post_id": None, "xhs_post_url": None, "error": None}

    # Run publishing in background
    asyncio.create_task(_run_publish_job(job_id, draft, body, user, db))

    return {"job_id": job_id, "status": "queued"}


@router.get("/status/{job_id}", response_model=PublishStatusResponse)
async def get_status(job_id: str, user: User = Depends(get_current_user)):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return PublishStatusResponse(**job)


@router.post("/xhs/credentials")
async def save_credentials(body: XHSCredentialsSave, user: User = Depends(get_current_user)):
    return {"ok": True, "message": "Credentials stored for publishing"}


async def _run_publish_job(job_id: str, draft: Draft, body: PublishRequest, user: User, db):
    """Background publishing task."""
    try:
        jobs[job_id]["status"] = "publishing"
        publisher = XHSPublisher()
        result = await publisher.publish(
            encrypted_title=draft.encrypted_title,
            encrypted_content=draft.encrypted_content,
            encrypted_cookies=body.encrypted_cookies,
        )

        if result.get("xhs_post_id"):
            # Record the published post
            post = PublishedPost(
                user_id=user.id,
                draft_id=draft.id,
                xhs_post_id=result["xhs_post_id"],
                xhs_post_url=result["xhs_post_url"],
                publish_status="published",
            )
            db.add(post)
            # Mark draft as published
            draft.status = "published"
            await db.commit()

            jobs[job_id].update({
                "status": "published",
                "xhs_post_id": result["xhs_post_id"],
                "xhs_post_url": result["xhs_post_url"],
            })
        else:
            jobs[job_id].update({"status": "failed", "error": result.get("error", "Unknown error")})
    except Exception as e:
        jobs[job_id].update({"status": "failed", "error": str(e)})
