from __future__ import annotations
import asyncio
from urllib.parse import quote

import boto3
from botocore.config import Config
from ..config import settings


class R2Service:
    def __init__(self):
        if not all((settings.r2_endpoint, settings.r2_access_key, settings.r2_secret_key)):
            raise ValueError('R2 storage is not configured')
        self.client = boto3.client(
            's3', endpoint_url=settings.r2_endpoint,
            aws_access_key_id=settings.r2_access_key,
            aws_secret_access_key=settings.r2_secret_key,
            config=Config(signature_version='s3v4', connect_timeout=5, read_timeout=15, retries={'max_attempts': 1}),
        )
        self.bucket = settings.r2_bucket

    async def _call(self, method, **kwargs):
        return await asyncio.wait_for(asyncio.to_thread(method, **kwargs), timeout=30)

    async def generate_presigned_upload_url(self, key: str, content_type: str, file_size: int, expires: int = 900) -> str:
        return await self._call(self.client.generate_presigned_url, ClientMethod='put_object', Params={'Bucket':self.bucket, 'Key':key, 'ContentType':content_type, 'ContentLength':file_size}, ExpiresIn=expires)

    async def head_object(self, key: str) -> dict:
        return await self._call(self.client.head_object, Bucket=self.bucket, Key=key)

    def get_public_url(self, key: str) -> str:
        if settings.r2_public_url:
            return f"{settings.r2_public_url.rstrip('/')}/{quote(key, safe='/')}"
        return f"{settings.r2_endpoint.rstrip('/')}/{settings.r2_bucket}/{quote(key, safe='/')}"

    async def delete_object(self, key: str) -> None:
        await self._call(self.client.delete_object, Bucket=self.bucket, Key=key)

    async def generate_presigned_download_url(self, key: str, expires: int = 3600) -> str:
        return await self._call(self.client.generate_presigned_url, ClientMethod='get_object', Params={'Bucket':self.bucket,'Key':key}, ExpiresIn=expires)
