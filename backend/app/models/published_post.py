from __future__ import annotations
from typing import Optional
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class PublishedPost(Base):
    __tablename__ = "published_posts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    draft_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("drafts.id", ondelete="SET NULL"), nullable=True)
    xhs_post_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    xhs_post_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    encrypted_snapshot_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    encryption_iv: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    encryption_salt: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    publish_status: Mapped[str] = mapped_column(String(16), default="published")
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
