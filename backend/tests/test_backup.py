from uuid import uuid4, UUID
from sqlalchemy import select, func
from app.models.material import Material
from app.models.draft import Draft
from app.models.image import Image
from app.models.published_post import PublishedPost
from app.models.post_analytics import PostAnalytics
from tests.support import DatabaseTestCase, draft_payload


class BackupTests(DatabaseTestCase):
    async def material(self, owner=None):
        async with self.sessions() as db:
            item = Material(user_id=owner or self.user_id, encrypted_content='cipher', encryption_iv='iv', encryption_salt='salt', content_hash=uuid4().hex, tags=['tag'])
            db.add(item); await db.commit()
            return item

    async def snapshot(self):
        response = await self.client.get('/backup')
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def test_export_scopes_records_and_keeps_ciphertext(self):
        own = await self.material(); await self.material(self.other_id)
        data = await self.snapshot()
        self.assertEqual(data['version'], 1)
        self.assertEqual(data['user_id'], str(self.user_id))
        self.assertEqual([i['id'] for i in data['materials']], [str(own.id)])
        self.assertEqual(data['materials'][0]['encrypted_content'], 'cipher')
        self.assertNotIn('api_key_hash', str(data))

    async def test_roundtrip_preserves_links_and_does_not_overwrite_newer(self):
        material = await self.material()
        async with self.sessions() as db:
            image = Image(user_id=self.user_id, r2_key=f'users/{self.user_id}/folder/key', r2_url='https://images.test/img', mime_type='image/png')
            db.add(image); await db.flush()
            draft = Draft(user_id=self.user_id, material_id=material.id, **{**draft_payload(), 'image_ids': [str(image.id)]})
            db.add(draft); await db.flush()
            post = PublishedPost(user_id=self.user_id, draft_id=draft.id, xhs_post_url='https://www.xiaohongshu.com/explore/123')
            db.add(post); await db.flush()
            db.add(PostAnalytics(published_post_id=post.id, view_count=8)); await db.commit()
        backup = await self.snapshot()
        async with self.sessions() as db:
            existing = await db.get(Draft, draft.id); existing.encrypted_content = 'newer-cipher'; existing.version = 5
            await db.commit()
        response = await self.client.post('/backup/restore', json=backup)
        self.assertEqual(response.status_code, 200, response.text)
        async with self.sessions() as db:
            restored = await db.get(Draft, draft.id)
            self.assertEqual(restored.encrypted_content, 'newer-cipher')
            self.assertEqual(restored.image_ids, [str(image.id)])
            self.assertEqual(await db.scalar(select(func.count()).select_from(PostAnalytics)), 1)
        self.assertEqual(response.json()['id_map']['drafts'][str(draft.id)], str(draft.id))

    async def test_import_missing_records_and_maps_duplicate_material(self):
        material = await self.material(); backup = await self.snapshot()
        old_id = backup['materials'][0]['id']; new_id = str(uuid4()); backup['materials'][0]['id'] = new_id
        draft_id = str(uuid4())
        backup['drafts'] = [dict(id=draft_id, user_id=str(self.user_id), material_id=new_id, title_hash=None, status='draft', version=1, created_at=backup['materials'][0]['created_at'], updated_at=backup['materials'][0]['updated_at'], **draft_payload())]
        response = await self.client.post('/backup/restore', json=backup)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['id_map']['materials'][new_id], old_id)
        async with self.sessions() as db:
            self.assertEqual((await db.get(Draft, UUID(draft_id))).material_id, material.id)
            self.assertEqual(await db.scalar(select(func.count()).select_from(Material)), 1)

    async def test_cross_owner_id_collision_rejected_transactionally(self):
        foreign = await self.material(self.other_id); await self.material(); backup = await self.snapshot()
        backup['materials'][0]['id'] = str(foreign.id)
        response = await self.client.post('/backup/restore', json=backup)
        self.assertEqual(response.status_code, 409, response.text)
        async with self.sessions() as db:
            self.assertEqual((await db.get(Material, foreign.id)).user_id, self.other_id)

    async def test_malformed_late_record_cannot_partially_import(self):
        await self.material(); backup = await self.snapshot()
        fresh_id = str(uuid4()); backup['materials'][0]['id'] = fresh_id; backup['materials'][0]['content_hash'] = 'new-hash'
        backup['post_analytics'] = [dict(id=str(uuid4()), published_post_id=str(uuid4()), view_count=-1, like_count=0, comment_count=0, share_count=0, collect_count=0, collected_at=backup['materials'][0]['created_at'])]
        response = await self.client.post('/backup/restore', json=backup)
        self.assertEqual(response.status_code, 422, response.text)
        async with self.sessions() as db:
            self.assertIsNone(await db.get(Material, UUID(fresh_id)))

    async def test_foreign_link_rejected_even_when_absent_from_snapshot(self):
        foreign = await self.material(self.other_id); await self.material(); backup = await self.snapshot()
        backup['drafts'] = [dict(id=str(uuid4()), user_id=str(self.user_id), material_id=str(foreign.id), title_hash=None, status='draft', version=1, created_at=backup['materials'][0]['created_at'], updated_at=backup['materials'][0]['updated_at'], **draft_payload())]
        response = await self.client.post('/backup/restore', json=backup)
        self.assertEqual(response.status_code, 422, response.text)

    async def test_mismatched_account_and_unexpected_key_rejected(self):
        backup = dict(version=1, user_id=str(self.other_id), materials=[], drafts=[], images=[], published_posts=[], post_analytics=[])
        self.assertEqual((await self.client.post('/backup/restore', json=backup)).status_code, 422)
        backup['user_id'] = str(self.user_id); backup['masterKey'] = 'must never reach server'
        self.assertEqual((await self.client.post('/backup/restore', json=backup)).status_code, 422)

    async def test_new_import_preserves_all_links_and_rolls_back_late_database_conflict(self):
        await self.material(); backup = await self.snapshot()
        stamp = backup['materials'][0]['created_at']
        material_id, image_id, draft_id, post_id, metric_id = [str(uuid4()) for _ in range(5)]
        backup['materials'][0].update(id=material_id, content_hash='new-material')
        backup['images'] = [dict(id=image_id, user_id=str(self.user_id), r2_key=f'users/{self.user_id}/folder/new-image', r2_url='https://test/img', mime_type='image/png', created_at=stamp)]
        backup['drafts'] = [dict(id=draft_id, user_id=str(self.user_id), material_id=material_id, title_hash=None, status='draft', version=1, created_at=stamp, updated_at=stamp, **{**draft_payload(), 'image_ids': [image_id]})]
        backup['published_posts'] = [dict(id=post_id, user_id=str(self.user_id), draft_id=draft_id, publish_status='published', published_at=stamp)]
        backup['post_analytics'] = [dict(id=metric_id, published_post_id=post_id, view_count=8, like_count=0, comment_count=0, share_count=0, collect_count=0, collected_at=stamp)]
        # Both images pass preflight but conflict when the second is inserted.
        backup['images'].append({**backup['images'][0], 'id': str(uuid4())})
        response = await self.client.post('/backup/restore', json=backup)
        self.assertEqual(response.status_code, 409, response.text)
        async with self.sessions() as db:
            self.assertIsNone(await db.get(Material, UUID(material_id)))
            self.assertEqual(await db.scalar(select(func.count()).select_from(Image)), 0)
        backup['images'].pop()
        response = await self.client.post('/backup/restore', json=backup)
        self.assertEqual(response.status_code, 200, response.text)
        async with self.sessions() as db:
            self.assertEqual((await db.get(Draft, UUID(draft_id))).material_id, UUID(material_id))
            self.assertEqual((await db.get(Draft, UUID(draft_id))).image_ids, [image_id])
            self.assertEqual((await db.get(PublishedPost, UUID(post_id))).draft_id, UUID(draft_id))
            self.assertEqual((await db.get(PostAnalytics, UUID(metric_id))).published_post_id, UUID(post_id))

    async def test_concurrent_restore_deduplicates_content_hash(self):
        import asyncio
        import copy
        await self.material(); source = await self.snapshot()
        snapshots = []
        for _ in range(8):
            item = copy.deepcopy(source)
            item['materials'][0].update(id=str(uuid4()), content_hash='concurrent-new-hash')
            snapshots.append(item)
        responses = await asyncio.gather(*(self.client.post('/backup/restore', json=snapshot) for snapshot in snapshots))
        self.assertTrue(all(response.status_code == 200 for response in responses))
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Material).where(Material.content_hash == 'concurrent-new-hash')), 1)

    async def test_restore_coordinates_with_collection_hash_lock(self):
        import asyncio
        from sqlalchemy import text
        await self.material(); backup = await self.snapshot()
        backup['materials'][0].update(id=str(uuid4()), content_hash='locked-hash')
        async with self.sessions() as db:
            await db.execute(text('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))'), {'key': f'{self.user_id}:locked-hash'})
            task = asyncio.create_task(self.client.post('/backup/restore', json=backup))
            try:
                await asyncio.sleep(0.1)
                self.assertFalse(task.done(), 'restore must wait for concurrent collection lock')
                db.add(Material(user_id=self.user_id, encrypted_content='live', encryption_iv='iv', encryption_salt='salt', content_hash='locked-hash', tags=[]))
                await db.commit()
            finally:
                await db.rollback()
                await task
        self.assertEqual(task.result().status_code, 200)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Material).where(Material.content_hash == 'locked-hash')), 1)

    async def test_fresh_foreign_object_keys_are_rejected_before_any_import(self):
        await self.material(); backup = await self.snapshot()
        fresh_material = str(uuid4())
        backup['materials'][0].update(id=fresh_material, content_hash='image-ownership-test')
        stamp = backup['materials'][0]['created_at']
        prefix = f'users/{self.user_id}/'
        invalid_keys = [
            f'users/{self.other_id}/pending/a.png',
            f'users/{self.user_id}-suffix/pending/a.png',
            f'users%2F{self.user_id}%2Fpending/a.png',
            f'users/{str(self.user_id).replace("-", "%2D")}/pending/a.png',
            prefix + '../' + str(self.other_id) + '/a.png',
            prefix + 'pending/./a.png', prefix + 'pending//a.png',
            prefix + 'pending/..\\a.png', prefix + 'pending/a\x00.png',
        ]
        for key in invalid_keys:
            with self.subTest(key=key):
                backup['images'] = [dict(id=str(uuid4()), user_id=str(self.user_id), r2_key=key, r2_url='https://test/img', mime_type='image/png', created_at=stamp)]
                response = await self.client.post('/backup/restore', json=backup)
                self.assertEqual(response.status_code, 422, response.text)
                async with self.sessions() as db:
                    self.assertIsNone(await db.get(Material, UUID(fresh_material)))
                    self.assertEqual(await db.scalar(select(func.count()).select_from(Image)), 0)

    async def test_owned_percent_filename_is_literal_storage_key(self):
        await self.material(); backup = await self.snapshot()
        key = f'users/{self.user_id}/pending/100%25-%2e%2e%2f-other.png'
        image_id = str(uuid4())
        backup['images'] = [dict(id=image_id, user_id=str(self.user_id), r2_key=key, r2_url='https://test/img', mime_type='image/png', created_at=backup['materials'][0]['created_at'])]
        response = await self.client.post('/backup/restore', json=backup)
        self.assertEqual(response.status_code, 200, response.text)
        async with self.sessions() as db:
            self.assertEqual((await db.get(Image, UUID(image_id))).r2_key, key)

    async def test_restore_locks_existing_images_before_adding_draft_references(self):
        import asyncio
        await self.material()
        async with self.sessions() as db:
            image = Image(user_id=self.user_id, r2_key=f'users/{self.user_id}/pending/a.png', r2_url='https://test/a.png', mime_type='image/png')
            db.add(image); await db.commit()
        backup = await self.snapshot()
        stamp = backup['materials'][0]['created_at']
        backup['drafts'] = [dict(id=str(uuid4()), user_id=str(self.user_id), material_id=None, title_hash=None, status='draft', version=1, created_at=stamp, updated_at=stamp, **{**draft_payload(), 'image_ids': [str(image.id)]})]
        async with self.sessions() as db:
            await db.execute(select(Image).where(Image.id == image.id).with_for_update())
            task = asyncio.create_task(self.client.post('/backup/restore', json=backup))
            try:
                await asyncio.sleep(0.1)
                self.assertFalse(task.done(), 'restore must wait for image deletion lock')
            finally:
                await db.rollback()
                await task
        self.assertEqual(task.result().status_code, 200)

    async def test_backup_requires_authentication(self):
        self.client.headers.clear()
        self.assertEqual((await self.client.get('/backup')).status_code, 401)
