import base64
from unittest.mock import patch

from app.models.image import Image
from tests.support import DatabaseTestCase, draft_payload


def envelope():
    return {key: base64.b64encode(bytes(size)).decode() for key, size in [('ciphertext', 20), ('iv', 12), ('salt', 32)]}


class WorkbenchTests(DatabaseTestCase):
    async def test_idea_metadata_survives_legacy_update_and_can_be_cleared(self):
        payload = {**draft_payload(), 'status': 'idea', 'planned_date': '2026-10-20',
                   'topic_tags': ['生活'], 'encrypted_context': envelope()}
        result = await self.client.post('/drafts', json=payload)
        self.assertEqual(result.status_code, 201, result.text)
        ident = result.json()['id']
        updated = await self.client.put('/drafts/' + ident, json={**draft_payload(), 'expected_version': 1})
        self.assertEqual(updated.status_code, 200, updated.text)
        for key in ['status', 'planned_date', 'topic_tags', 'encrypted_context']:
            self.assertEqual(updated.json()[key], payload[key])
        cleared = await self.client.put('/drafts/' + ident, json={**draft_payload(), 'expected_version': 2, 'planned_date': None, 'encrypted_context': None, 'topic_tags': []})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()['planned_date'])
        self.assertIsNone(cleared.json()['encrypted_context'])
        self.assertEqual(cleared.json()['topic_tags'], [])

    async def test_profile_is_encrypted_versioned_and_owner_scoped(self):
        initial = await self.client.get('/profile')
        self.assertEqual(initial.status_code, 200, initial.text)
        self.assertEqual(initial.json(), {'encrypted_profile': None, 'version': 0})
        saved = await self.client.put('/profile', json={'encrypted_profile': envelope(), 'expected_version': 0})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()['version'], 1)
        stale = await self.client.put('/profile', json={'encrypted_profile': None, 'expected_version': 0})
        self.assertEqual(stale.status_code, 409)
        other = await self.client.get('/profile', headers={'Authorization': 'Bearer other-key'})
        self.assertIsNone(other.json()['encrypted_profile'])
        bad = {**envelope(), 'iv': 'bad'}
        self.assertEqual((await self.client.put('/profile', json={'encrypted_profile': bad, 'expected_version': 1})).status_code, 422)

    async def test_publication_freezes_version_and_protects_images_after_draft_deleted(self):
        async with self.sessions() as db:
            img = Image(user_id=self.user_id, r2_key=f'users/{self.user_id}/id/a.png', r2_url='https://image.test/a', mime_type='image/png')
            db.add(img)
            await db.commit()
            image_id = str(img.id)
        draft = (await self.client.post('/drafts', json={**draft_payload(), 'image_ids': [image_id], 'topic_tags': ['教程']})).json()
        payload = {'draft_id': draft['id'], 'xhs_post_url': 'https://xhslink.com/a/test',
                   'expected_version': 9, 'snapshot': envelope(), 'template_id': 'steps', 'published_at': '2026-10-17T09:00:00+08:00'}
        self.assertEqual((await self.client.post('/publish/records', json=payload)).status_code, 409)
        payload['expected_version'] = 1
        saved = await self.client.post('/publish/records', json=payload)
        self.assertEqual(saved.status_code, 201, saved.text)
        self.assertEqual(saved.json()['draft_version'], 1)
        self.assertEqual(saved.json()['topic_tags'], ['教程'])
        self.assertEqual(saved.json()['snapshot'], envelope())
        retry = await self.client.post('/publish/records', json=payload)
        self.assertEqual(retry.json()['id'], saved.json()['id'])
        self.assertEqual((await self.client.delete('/drafts/' + draft['id'])).status_code, 200)
        self.assertEqual((await self.client.get('/publish/posts')).json()['items'][0]['snapshot'], envelope())
        with patch('app.services.r2_service.R2Service.delete_object') as deleting:
            rejected = await self.client.delete('/images/' + image_id)
            self.assertEqual(rejected.status_code, 409, rejected.text)
            deleting.assert_not_called()

    async def test_new_envelopes_and_metadata_are_bounded(self):
        for changes in [{'encrypted_context': {'ciphertext': 'x', 'iv': 'bad', 'salt': 'bad'}}, {'topic_tags': ['x' * 65]}, {'status': 'unknown'}]:
            self.assertEqual((await self.client.post('/drafts', json={**draft_payload(), **changes})).status_code, 422)

    async def test_v2_backup_roundtrips_profile_date_context_and_old_snapshot(self):
        await self.client.put('/profile', json={'encrypted_profile': envelope(), 'expected_version': 0})
        draft = (await self.client.post('/drafts', json={**draft_payload(), 'status': 'idea', 'planned_date': '2026-10-20', 'encrypted_context': envelope()})).json()
        backup = (await self.client.get('/backup')).json()
        self.assertEqual(backup['version'], 2)
        self.assertEqual(backup['profile']['encrypted_profile'], envelope())
        self.assertNotIn('api_key_hash', str(backup))
        self.assertEqual((await self.client.delete('/drafts/' + draft['id'])).status_code, 200)
        restored = await self.client.post('/backup/restore', json=backup)
        self.assertEqual(restored.status_code, 200, restored.text)
        saved = (await self.client.get('/drafts/' + draft['id'])).json()
        self.assertEqual(saved['encrypted_context'], envelope())
        self.assertEqual(saved['planned_date'], '2026-10-20')
        legacy = {'version': 1, 'user_id': str(self.user_id), **{name: [] for name in ['materials', 'images', 'drafts', 'published_posts', 'post_analytics']}}
        self.assertEqual((await self.client.post('/backup/restore', json=legacy)).status_code, 200)
