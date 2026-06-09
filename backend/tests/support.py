"""Real PostgreSQL integration fixture: isolated schema in a separate database.

TEST_DATABASE_URL defaults to the maintenance database, never xhs_tool. Every
case creates/drops only a random test schema and overrides the application DB.
"""
import hashlib
import os
import unittest
from uuid import uuid4

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models.user import User
from app import models


class DatabaseTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = os.getenv('TEST_DATABASE_URL', 'postgresql+asyncpg://xhs:xhs_dev@localhost:5432/postgres')
        if url.rsplit('/', 1)[-1].split('?')[0] == 'xhs_tool':
            raise RuntimeError('Tests refuse to use the application database xhs_tool')
        self.schema = 'test_creator_' + uuid4().hex
        self.admin = create_async_engine(url)
        async with self.admin.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA {self.schema}'))
        self.addAsyncCleanup(self.cleanup_database)
        self.engine = create_async_engine(url, connect_args={'server_settings': {'search_path': self.schema}})
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async def override_db():
            async with self.sessions() as session:
                yield session
        app.dependency_overrides[get_db] = override_db
        self.user_id, self.other_id = uuid4(), uuid4()
        async with self.sessions() as session:
            session.add_all([User(id=self.user_id, api_key_hash=hashlib.sha256(b'test-key').hexdigest(), api_key_prefix='test'), User(id=self.other_id, api_key_hash=hashlib.sha256(b'other-key').hexdigest(), api_key_prefix='other')])
            await session.commit()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test/api', headers={'Authorization':'Bearer test-key'})

    async def cleanup_database(self):
        if hasattr(self, "client"):
            await self.client.aclose()
        app.dependency_overrides.clear()
        if hasattr(self, "engine"):
            await self.engine.dispose()
        async with self.admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA {self.schema} CASCADE'))
        await self.admin.dispose()


def draft_payload(**changes):
    return dict(encrypted_title='title-cipher', encrypted_content='body-cipher', encryption_iv='title-iv', content_iv='body-iv', encryption_salt='salt', encryption_version=2, image_ids=[], **changes)
