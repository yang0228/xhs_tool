from __future__ import annotations
from typing import Optional
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
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
    draft_version: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    topic_tags: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list, server_default='{}', nullable=False)
    template_id: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    image_ids: Mapped[list[str]] = mapped_column(ARRAY(String(36)), default=list, server_default='{}', nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    @property
    def snapshot(self):
        if self.encrypted_snapshot_content is None:
            return None
        return {'ciphertext': self.encrypted_snapshot_content, 'iv': self.encryption_iv, 'salt': self.encryption_salt}
