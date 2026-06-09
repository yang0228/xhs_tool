"""Owner-scoped encrypted record snapshots and non-destructive transactional import.

Image rows contain object-storage references; object bytes are not copied. Client
master keys are deliberately absent from this API's accepted schema.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import DateTime, Integer, String, select, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID as UUIDColumn
from sqlalchemy.exc import IntegrityError, DataError

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.material import Material
from ..models.image import Image
from ..models.draft import Draft
from ..models.published_post import PublishedPost
from ..models.post_analytics import PostAnalytics

router = APIRouter(prefix="/backup", tags=["backup"])
MODELS = {"materials": Material, "images": Image, "drafts": Draft,
          "published_posts": PublishedPost, "post_analytics": PostAnalytics}


class Snapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1]
    user_id: UUID
    materials: list[dict[str, Any]] = Field(max_length=100000)
    images: list[dict[str, Any]] = Field(max_length=100000)
    drafts: list[dict[str, Any]] = Field(max_length=100000)
    published_posts: list[dict[str, Any]] = Field(max_length=100000)
    post_analytics: list[dict[str, Any]] = Field(max_length=100000)


def invalid(message: str):
    raise HTTPException(status_code=422, detail=message)


def parse_value(value, column):
    if value is None:
        if not column.nullable:
            invalid(f"{column.name} cannot be null")
        return None
    kind = column.type
    try:
        if isinstance(kind, UUIDColumn):
            return UUID(str(value))
        if isinstance(kind, DateTime):
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                invalid(f"{column.name} must include a timezone")
            return parsed
        if isinstance(kind, ARRAY):
            if not isinstance(value, list) or any(not isinstance(v, str) or (kind.item_type.length and len(v) > kind.item_type.length) for v in value):
                invalid(f"Invalid {column.name} array")
            return value
        if isinstance(kind, Integer):
            if type(value) is not int or value < 0 or value > 2**63 - 1:
                invalid(f"Invalid nonnegative integer {column.name}")
            return value
        if isinstance(kind, String):
            if not isinstance(value, str) or (kind.length and len(value) > kind.length):
                invalid(f"Invalid text {column.name}")
            return value
    except (ValueError, TypeError, AttributeError):
        invalid(f"Invalid {column.name}")
    invalid(f"Unsupported field {column.name}")


def validate_records(snapshot: Snapshot, user_id: UUID):
    if snapshot.user_id != user_id:
        invalid("Backup belongs to a different account")
    parsed = {}
    for table, model in MODELS.items():
        columns = {column.name: column for column in model.__table__.columns}
        seen = set()
        parsed[table] = []
        for record in getattr(snapshot, table):
            if set(record) - set(columns):
                invalid(f"Unexpected fields in {table}")
            missing = [name for name, column in columns.items() if name not in record and not column.nullable and column.default is None]
            if missing:
                invalid(f"Missing fields in {table}: {', '.join(missing)}")
            values = {name: parse_value(value, columns[name]) for name, value in record.items()}
            if values.get("id") is None or values["id"] in seen:
                invalid(f"Missing or duplicate id in {table}")
            seen.add(values["id"])
            if "user_id" in columns and values.get("user_id") != user_id:
                invalid(f"Foreign owner in {table}")
            if table == "images":
                # R2/S3 keys are raw object names, not URL paths. Never unquote
                # percent escapes: signing/public URL generation quotes those
                # literal bytes. The owner namespace itself must be canonical.
                key = values["r2_key"]
                if (not key.startswith(f"users/{user_id}/")
                        or any(part in ("", ".", "..") for part in key.split("/"))
                        or "\\" in key or any(ord(char) < 32 or ord(char) == 127 for char in key)):
                    invalid("Image storage key must belong to this account's canonical namespace")
            if table == "drafts":
                if values.get("version", 1) < 1 or values.get("encryption_version", 1) not in (1, 2):
                    invalid("Invalid draft version")
                if values.get("encryption_version") == 2 and not values.get("content_iv"):
                    invalid("Encrypted draft body IV is required")
                try:
                    values["image_ids"] = [str(UUID(value)) for value in values.get("image_ids", [])]
                except (ValueError, TypeError):
                    invalid("Invalid draft image id")
            parsed[table].append(values)
    return parsed


@router.get("")
async def export_backup(db=Depends(get_db), user: User = Depends(get_current_user)):
    output = {"version": 1, "user_id": str(user.id)}
    # A single statement per table in the current request; every row is scoped.
    for table, model in MODELS.items():
        statement = select(model)
        if model is PostAnalytics:
            statement = statement.join(PublishedPost).where(PublishedPost.user_id == user.id)
        else:
            statement = statement.where(model.user_id == user.id)
        rows = (await db.execute(statement.order_by(model.id))).scalars().all()
        output[table] = [{column.name: getattr(row, column.name) for column in model.__table__.columns} for row in rows]
    return jsonable_encoder(output)


@router.post("/restore")
async def restore_backup(snapshot: Snapshot, db=Depends(get_db), user: User = Depends(get_current_user)):
    records = validate_records(snapshot, user.id)
    id_map = {table: {} for table in MODELS}
    pending = {table: [] for table in MODELS}

    async def owned(model, record_id):
        row = await db.get(model, record_id)
        if row is None:
            return None
        if model is PostAnalytics:
            post = await db.get(PublishedPost, row.published_post_id)
            owner = post.user_id if post else None
        else:
            owner = row.user_id
        if owner != user.id:
            raise HTTPException(409, "Backup ID collides with a record owned by another account")
        return row

    async def link(table, value):
        if value is None:
            return None
        record_id = UUID(str(value))
        mapped = id_map[table].get(str(record_id))
        if mapped is not None:
            return UUID(mapped)
        try:
            existing = await owned(MODELS[table], record_id)
        except HTTPException:
            invalid(f"Invalid owned reference in {table}")
        if existing is None:
            invalid(f"Missing linked record in {table}")
        return existing.id

    try:
        # Match normal create-route locks so restore cannot introduce duplicates
        # while a collection/upload/draft request is committing. Sorted acquisition
        # also keeps concurrent overlapping backups free of lock-order deadlocks.
        locks = {f"backup:{user.id}"}
        locks.update(f"{user.id}:{item['content_hash']}" for item in records["materials"])
        locks.update(item["r2_key"] for item in records["images"])
        locks.update(str(item["id"]) for item in records["drafts"])
        for key in sorted(locks):
            await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": key})
        # Keep existing referenced objects alive through draft insertion. Deletion
        # locks images before drafts; using the same order avoids dangling ARRAY
        # references, which do not have a database foreign-key constraint.
        image_ids = {item["id"] for item in records["images"]}
        image_ids.update(UUID(image_id) for item in records["drafts"] for image_id in item.get("image_ids", []))
        if image_ids:
            await db.execute(select(Image.id).where(Image.id.in_(image_ids), Image.user_id == user.id).order_by(Image.id).with_for_update(read=True))
        # Preflight every owner/collision/reference before creating any rows.
        with db.no_autoflush:
            for table, model in MODELS.items():
                hashes = {}
                for values in records[table]:
                    source_id = str(values["id"])
                    existing = await owned(model, values["id"])
                    if existing is None and model is Material:
                        content_hash = values["content_hash"]
                        existing = hashes.get(content_hash)
                        if existing is None:
                            existing = (await db.execute(select(Material).where(Material.user_id == user.id, Material.content_hash == content_hash))).scalars().first()
                    if existing is None and model is Image:
                        existing = (await db.execute(select(Image).where(Image.r2_key == values["r2_key"]))).scalar_one_or_none()
                        if existing is not None and existing.user_id != user.id:
                            raise HTTPException(409, "Image storage key belongs to another account")
                    if model is Draft:
                        values["material_id"] = await link("materials", values.get("material_id"))
                        values["image_ids"] = [str(await link("images", value)) for value in values.get("image_ids", [])]
                    elif model is PublishedPost:
                        values["draft_id"] = await link("drafts", values.get("draft_id"))
                    elif model is PostAnalytics:
                        values["published_post_id"] = await link("published_posts", values["published_post_id"])
                    target = existing if existing is not None else model(**values)
                    id_map[table][source_id] = str(target.id)
                    if model is Material:
                        hashes[values["content_hash"]] = target
                    if existing is None:
                        pending[table].append(target)
            for table in MODELS:
                db.add_all(pending[table])
                await db.flush()
        await db.commit()
    except (IntegrityError, DataError):
        await db.rollback()
        raise HTTPException(409, "Backup conflicts with current records; nothing was imported")
    except Exception:
        await db.rollback()
        raise
    return {"version": 1, "imported": {table: len(rows) for table, rows in pending.items()}, "id_map": id_map}
