from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone

import boto3
from botocore.config import Config

from ..config import settings

logger = logging.getLogger(__name__)


class R2Service:
    def __init__(self):
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint,
            aws_access_key_id=settings.r2_access_key,
            aws_secret_access_key=settings.r2_secret_key,
            config=Config(signature_version="s3v4"),
        )
        self.bucket = settings.r2_bucket

    async def generate_presigned_upload_url(self, key: str, content_type: str, expires: int = 900) -> str:
        url = self.client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=expires,
        )
        return url

    def get_public_url(self, key: str) -> str:
        if settings.r2_public_url:
            return f"{settings.r2_public_url.rstrip('/')}/{key}"
        return f"{settings.r2_endpoint}/{self.bucket}/{key}"

    async def delete_object(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)
        logger.info(f"Deleted R2 object: {key}")

    async def generate_presigned_download_url(self, key: str, expires: int = 3600) -> str:
        url = self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires,
        )
        return url
