"""Exercise the actual Alembic revisions against a disposable PostgreSQL schema."""
import importlib.util
import os
import unittest
from pathlib import Path
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


class MigrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_upgrade_preserves_legacy_ciphertext_and_downgrade_rows(self):
        url=os.getenv('TEST_DATABASE_URL','postgresql+asyncpg://xhs:xhs_dev@localhost:5432/postgres')
        if url.rsplit('/',1)[-1].split('?')[0]=='xhs_tool':
            raise RuntimeError('Refusing application database')
        engine=create_async_engine(url)
        schema='test_migration_'+uuid4().hex
        revisions=Path(__file__).resolve().parents[1]/'alembic'/'versions'
        def revision(name):
            spec=importlib.util.spec_from_file_location('revision',revisions/name)
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            return module
        initial=revision('9b4d6380411e_initial.py')
        feature=revision('c42a7d109e81_creator_workflow.py')
        def run(conn,fn):
            with Operations.context(MigrationContext.configure(conn)):
                fn()
        try:
            async with engine.begin() as conn:
                await conn.execute(text(f'CREATE SCHEMA {schema}'))
                await conn.execute(text(f'SET LOCAL search_path TO {schema}'))
                await conn.run_sync(run,initial.upgrade)
                owner,draft=uuid4(),uuid4()
                await conn.execute(text("INSERT INTO users(id,api_key_hash,api_key_prefix) VALUES (:id,'hash','prefix')"),{'id':owner})
                await conn.execute(text("INSERT INTO drafts(id,user_id,encrypted_title,encrypted_content,encryption_iv,encryption_salt,status,version) VALUES (:id,:owner,'title','body','iv','salt','draft',7)"),{'id':draft,'owner':owner})
                await conn.run_sync(run,feature.upgrade)
                row=(await conn.execute(text('SELECT * FROM drafts'))).mappings().one()
                self.assertEqual(row['encrypted_content'],'body')
                self.assertEqual(row['encryption_iv'],'iv')
                self.assertIsNone(row['content_iv'])
                self.assertEqual(row['encryption_version'],1)
                self.assertEqual(row['image_ids'],[])
                self.assertEqual(row['version'],7)
                await conn.execute(text("UPDATE users SET api_key_prefix='longerprefix'"))
                await conn.run_sync(run,feature.downgrade)
                self.assertEqual((await conn.execute(text('SELECT encrypted_content FROM drafts'))).scalar_one(),'body')
                self.assertEqual((await conn.execute(text('SELECT api_key_prefix FROM users'))).scalar_one(),'longerprefix')
        finally:
            async with engine.begin() as conn:
                await conn.execute(text(f'DROP SCHEMA IF EXISTS {schema} CASCADE'))
            await engine.dispose()
