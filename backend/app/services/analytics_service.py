from __future__ import annotations
import logging

logger = logging.getLogger(__name__)


class AnalyticsService:
    """Analytics collection and aggregation service."""

    async def refresh_all(self, user_id: str) -> int:
        """Refresh analytics for all user's published posts."""
        logger.info(f"Analytics refresh stub for user {user_id}")
        return 0

    async def refresh_post(self, published_post_id: str) -> dict | None:
        """Refresh analytics for a single post."""
        logger.info(f"Analytics refresh stub for post {published_post_id}")
        return None
