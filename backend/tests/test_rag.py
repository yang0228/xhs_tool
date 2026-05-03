"""Real isolated PostgreSQL, with only RAGFlow/AI network I/O replaced."""
import hashlib
import importlib.util
import json
import re
from functools import partial
from pathlib import Path
from unittest.mock import patch

import httpx
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text

from app.config import settings
from tests.support import DatabaseTestCase


def material_hash(title, content):
    return hashlib.sha256(json.dumps([title.strip(), content.strip()], ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


class RagRemote:
    def __init__(self):
        self.docs = {}
        self.chunks = []
        self.uploads = 0
        self.fail_delete = False
        self.lose_upload_response = False
        self.parse_status = 'DONE'
        self.calls = []
        self.reject_missing_filters = False

    def handle(self, request):
        self.calls.append(request)
        assert request.headers['Authorization'] == 'Bearer server-secret'
        path, method = request.url.path, request.method
        if path == '/api/v1/retrieval':
            body = json.loads(request.content)
            assert body['dataset_ids'] == ['mine']
            assert body['document_ids']  # Empty must never broaden into a dataset search.
            return httpx.Response(200, json={'code': 0, 'data': {'chunks': self.chunks, 'total': len(self.chunks)}})
        dataset = path.split('/')[4]
        if path.endswith('/documents'):
            if method == 'GET':
                docs = [v for (ds, _), v in self.docs.items() if ds == dataset]
                for field in ['id', 'name']:
                    if request.url.params.get(field):
                        docs = [v for v in docs if v[field] == request.url.params[field]]
                if self.reject_missing_filters and not docs and (request.url.params.get('name') or request.url.params.get('id')):
                    return httpx.Response(200, json={'code': 102, 'message': "you don't own the document"})
                total = len(docs)
                page, limit = int(request.url.params.get('page', 1)), int(request.url.params.get('page_size', 100))
                return httpx.Response(200, json={'code': 0, 'data': {'docs': docs[(page - 1) * limit:page * limit], 'total': total}})
            if method == 'POST':
                self.uploads += 1
                name = re.search(rb'filename="([^"]+)"', request.content)[1].decode()
                ident = 'doc-' + str(self.uploads)
                doc = {'id': ident, 'name': name, 'dataset_id': dataset, 'run': 'UNSTART', 'progress': 0}
                self.docs[dataset, ident] = doc
                if self.lose_upload_response:
                    self.lose_upload_response = False
                    raise httpx.ReadTimeout('response lost', request=request)
                return httpx.Response(200, json={'code': 0, 'data': [doc]})
            if method == 'DELETE':
                ids = json.loads(request.content)['ids']
                assert ids and all(ids)
                if self.fail_delete:
                    return httpx.Response(200, json={'code': 102, 'message': 'temporary failure'})
                if any((dataset, ident) not in self.docs for ident in ids):
                    return httpx.Response(200, json={'code': 102, 'message': 'document missing'})
                for ident in ids:
                    self.docs.pop((dataset, ident), None)
                return httpx.Response(200, json={'code': 0})
        if path.endswith('/chunks') and method == 'POST':
            for ident in json.loads(request.content)['document_ids']:
                self.docs[dataset, ident]['run'] = self.parse_status
                self.docs[dataset, ident]['progress'] = 1 if self.parse_status == 'DONE' else -1
            return httpx.Response(200, json={'code': 0})
        raise AssertionError(str(request.url))


class RagTests(DatabaseTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        previous = dict(settings.__dict__)
        settings.__dict__.update(ragflow_url='http://rag.test', ragflow_api_key='server-secret',
                                 ragflow_datasets={str(self.user_id): 'mine', str(self.other_id): 'theirs'},
                                 ragflow_index_revision='rc2-naive-v1')
        self.addCleanup(lambda: (settings.__dict__.clear(), settings.__dict__.update(previous)))
        self.remote = RagRemote()
        real_client = httpx.AsyncClient
        self.network = patch('httpx.AsyncClient', partial(real_client, transport=httpx.MockTransport(self.remote.handle)))
        self.network.start()
        self.addCleanup(self.network.stop)

    async def material(self, title='测试标题', content='本人素材正文', **changes):
        payload = dict(encrypted_content='opaque', encryption_iv='iv', encryption_salt='salt',
                       content_hash=material_hash(title, content), source_title=title, source_url='https://source.test/a')
        payload.update(changes)
        result = await self.client.post('/materials', json=payload)
        self.assertEqual(result.status_code, 201, result.text)
        return result.json(), {'title': title, 'content': content, 'content_hash': payload['content_hash']}

    async def indexed(self, **changes):
        material, body = await self.material(**changes)
        response = await self.client.post('/materials/' + material['id'] + '/rag', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        status = await self.client.get('/materials/' + material['id'] + '/rag')
        self.assertEqual(status.json()['status'], 'ready', status.text)
        doc = next(reversed(self.remote.docs.values()))
        return material, body, doc['id']

    async def test_rc2_missing_name_and_id_lookups_do_not_prevent_first_upload_or_cleanup(self):
        self.remote.reject_missing_filters = True
        material, body, doc = await self.indexed()
        # The remote delete succeeded but its response was lost before local cleanup.
        self.remote.docs.pop(('mine', doc))
        response = await self.client.delete('/materials/' + material['id'] + '/rag')
        self.assertEqual(response.json()['status'], 'removed', response.text)

    async def test_document_lookup_scans_pages_before_reuploading_a_known_name(self):
        from app.services.ragflow_service import RAGFlowService
        for i in range(105):
            self.remote.docs['mine', str(i)] = {'id': str(i), 'name': 'target.txt' if i == 104 else str(i) + '.txt'}
        self.remote.reject_missing_filters = True
        docs = await RAGFlowService().documents('mine', name='target.txt')
        self.assertEqual([doc['id'] for doc in docs], ['104'])
        self.assertTrue(any(call.url.params.get('page') == '2' for call in self.remote.calls))

    async def test_rc2_ingestion_status_is_ready_and_failed_while_legacy_run_remains_supported(self):
        material, _, doc = await self.indexed()
        remote = self.remote.docs['mine', doc]
        remote.pop('run')
        remote['ingestion_status'] = 'COMPLETED'
        self.assertEqual((await self.client.get('/materials/' + material['id'] + '/rag')).json()['status'], 'ready')
        remote['ingestion_status'] = 'FAILED'
        remote['progress'] = 0
        self.assertEqual((await self.client.get('/materials/' + material['id'] + '/rag')).json()['status'], 'failed')

    async def test_disabled_or_unmapped_rag_leaves_ordinary_ai_available(self):
        settings.__dict__['ragflow_api_key'] = ''
        status = await self.client.get('/rag/status')
        self.assertEqual(status.status_code, 200, status.text)
        self.assertFalse(status.json()['configured'])
        self.assertFalse(status.json()['enabled'])
        self.assertEqual((await self.client.post('/rag/retrieve', json={'question': '主题'})).status_code, 503)
        async def stream(*args):
            yield '普通写作'
        with patch('app.services.ai_service.AIService.rewrite_stream', stream):
            ordinary = await self.client.post('/ai/rewrite', json={'content': '正文'})
        self.assertIn('普通写作', ordinary.text.encode().decode('unicode_escape'))
        settings.__dict__['ragflow_api_key'] = 'server-secret'
        settings.__dict__['ragflow_datasets'] = {str(self.user_id): 'mine'}
        status = await self.client.get('/rag/status', headers={'Authorization': 'Bearer other-key'})
        self.assertTrue(status.json()['configured'])
        self.assertFalse(status.json()['enabled'])
        self.assertNotIn('server-secret', status.text)

    async def test_index_is_idempotent_and_lost_upload_is_reconciled(self):
        self.remote.lose_upload_response = True
        material, body, doc = await self.indexed()
        again = await self.client.post('/materials/' + material['id'] + '/rag', json=body)
        self.assertEqual(again.status_code, 200, again.text)
        self.assertEqual(self.remote.uploads, 1)
        self.assertIn(material['id'], self.remote.docs['mine', doc]['name'])
        self.assertIn(body['content_hash'], self.remote.docs['mine', doc]['name'])

    async def test_auto_synced_material_can_be_retrieved_and_used_without_status_polling(self):
        material, body = await self.material()
        synced = await self.client.post('/materials/' + material['id'] + '/rag', json=body)
        self.assertEqual(synced.status_code, 200, synced.text)
        self.assertEqual(synced.json()['status'], 'processing')
        # The user navigates straight from Scrape to Editor; no per-material GET.
        self.remote.chunks = [{'id': 'new-source', 'document_id': 'doc-1', 'dataset_id': 'mine', 'content': '已经解析可用的本人素材'}]
        query = {'question': '写作主题', 'material_ids': [material['id']]}
        retrieved = await self.client.post('/rag/retrieve', json=query)
        self.assertEqual(retrieved.status_code, 200, retrieved.text)
        self.assertEqual([v['id'] for v in retrieved.json()['sources']], ['new-source'])
        prompts = []
        async def stream(service, content, style, instruction):
            prompts.append(content)
            yield '建议[1]'
        with patch('app.services.ai_service.AIService.rewrite_stream', stream):
            generated = await self.client.post('/ai/grounded', json={**query, 'mode': 'body', 'source_ids': ['new-source']})
        self.assertEqual(generated.status_code, 200, generated.text)
        self.assertIn('[DONE]', generated.text)
        self.assertIn('已经解析可用的本人素材', prompts[0])
        async with self.sessions() as db:
            status = await db.scalar(text('SELECT status FROM material_rag_indexes WHERE material_id=:id'), {'id': material['id']})
        self.assertEqual(status, 'processing')
        self.assertFalse(any(call.method == 'GET' and call.url.params.get('id') for call in self.remote.calls))

    async def test_sync_rejects_foreign_material_wrong_hash_and_unbounded_text(self):
        material, body = await self.material()
        path = '/materials/' + material['id'] + '/rag'
        self.assertEqual((await self.client.post(path, json=body, headers={'Authorization': 'Bearer other-key'})).status_code, 404)
        self.assertEqual((await self.client.post(path, json={**body, 'content': '伪造正文'})).status_code, 409)
        self.assertEqual((await self.client.post(path, json={**body, 'content': 'x' * 200001})).status_code, 422)
        self.assertEqual((await self.client.post(path, json={**body, 'dataset_id': 'theirs'})).status_code, 422)
        self.assertEqual(self.remote.uploads, 0)

    async def test_hash_normalization_matches_browser_trim_for_byte_order_marks(self):
        material, body = await self.material()
        response = await self.client.post('/materials/' + material['id'] + '/rag',
            json={**body, 'title': '\ufeff' + body['title'], 'content': '\ufeff' + body['content']})
        self.assertEqual(response.status_code, 200, response.text)

    async def test_legacy_collector_hash_indexes_without_changing_original_material(self):
        title, content = '旧版标题', '标题：旧版标题\n\n旧版正文，包括末尾空白。\n '
        legacy_hash = hashlib.sha256(content.encode()).hexdigest()
        material, body = await self.material(title=title, content=content, content_hash=legacy_hash)
        path = '/materials/' + material['id'] + '/rag'
        # Legacy support must still bind the title, exact plaintext and saved hash.
        for change in ({'content': content.rstrip()}, {'content': content + '篡改'}, {'title': '伪造标题'}, {'content_hash': material_hash(title, content)}):
            self.assertEqual((await self.client.post(path, json={**body, **change})).status_code, 409)
        synced = await self.client.post(path, json=body)
        self.assertEqual(synced.status_code, 200, synced.text)
        self.assertEqual((await self.client.get(path)).json()['status'], 'ready')
        self.assertEqual((await self.client.post(path, json=body)).status_code, 200)
        self.assertEqual(self.remote.uploads, 1)
        original = await self.client.get('/materials/' + material['id'])
        self.assertEqual(original.json(), material)
        self.remote.chunks = [{'id': 'legacy-source', 'document_id': 'doc-1', 'dataset_id': 'mine', 'content': content}]
        retrieved = await self.client.post('/rag/retrieve', json={'question': '旧版正文', 'material_ids': [material['id']]})
        self.assertEqual(retrieved.json()['sources'][0]['content_hash'], legacy_hash)

    async def test_raw_hash_without_legacy_collector_envelope_is_rejected(self):
        content = '不是旧版标题正文格式'
        material, body = await self.material(content=content, content_hash=hashlib.sha256(content.encode()).hexdigest())
        self.assertEqual((await self.client.post('/materials/' + material['id'] + '/rag', json=body)).status_code, 409)
        self.assertEqual(self.remote.uploads, 0)

    async def test_parse_failure_and_network_failure_are_explicit_retryable_states(self):
        self.remote.parse_status = 'FAIL'
        material, body = await self.material()
        path = '/materials/' + material['id'] + '/rag'
        self.assertEqual((await self.client.post(path, json=body)).status_code, 200)
        result = await self.client.get(path)
        self.assertEqual(result.json()['status'], 'failed', result.text)
        self.remote.parse_status = 'DONE'
        self.assertEqual((await self.client.post(path, json=body)).status_code, 200)
        self.assertEqual((await self.client.get(path)).json()['status'], 'ready')
        def offline(request):
            raise httpx.ConnectError('offline', request=request)
        with patch('httpx.AsyncClient', partial(self.client.__class__, transport=httpx.MockTransport(offline))):
            failed = await self.client.get(path)
        self.assertEqual(failed.json()['status'], 'failed', failed.text)
        self.assertNotIn('server-secret', failed.text)

    async def test_binding_is_durable_before_upload_and_interrupted_sync_can_retry(self):
        material, body = await self.material()
        async def durable_upload(request):
            if request.method == 'POST' and request.url.path.endswith('/documents'):
                async with self.sessions() as db:
                    count = await db.scalar(text('SELECT count(*) FROM material_rag_indexes WHERE material_id=:id'), {'id': material['id']})
                self.assertEqual(count, 1, 'Keep the deterministic-name tombstone before sending plaintext')
            return self.remote.handle(request)
        with patch('httpx.AsyncClient', partial(self.client.__class__, transport=httpx.MockTransport(durable_upload))):
            response = await self.client.post('/materials/' + material['id'] + '/rag', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        async with self.sessions() as db:
            await db.execute(text("UPDATE material_rag_indexes SET document_id=NULL,status='processing'"))
            await db.commit()
        status = await self.client.get('/materials/' + material['id'] + '/rag')
        self.assertEqual(status.json()['status'], 'failed', status.text)
        await self.client.post('/materials/' + material['id'] + '/rag', json=body)
        self.assertEqual(self.remote.uploads, 1)

    async def test_lost_delete_response_is_safe_to_retry(self):
        material, _, doc = await self.indexed()
        def lost_response(request):
            response = self.remote.handle(request)
            if request.method == 'DELETE':
                raise httpx.ReadTimeout('response lost', request=request)
            return response
        with patch('httpx.AsyncClient', partial(self.client.__class__, transport=httpx.MockTransport(lost_response))):
            await self.client.delete('/materials/' + material['id'])
        self.assertNotIn(('mine', doc), self.remote.docs)
        retry = await self.client.post('/rag/cleanup')
        self.assertEqual(retry.json()['remaining'], 0, retry.text)

    async def test_cleanup_preserves_all_ids_when_reconciling_duplicate_remote_names(self):
        material, _, doc = await self.indexed()
        self.remote.docs['mine', 'duplicate'] = {**self.remote.docs['mine', doc], 'id': 'duplicate'}
        async with self.sessions() as db:
            await db.execute(text("UPDATE material_rag_indexes SET document_id=NULL,status='failed'"))
            await db.commit()
        self.remote.fail_delete = True
        await self.client.delete('/materials/' + material['id'])
        pending = await self.client.get('/rag/cleanup')
        self.assertEqual(len(pending.json()['items']), 2, pending.text)
        self.remote.fail_delete = False
        await self.client.post('/rag/cleanup')
        self.assertEqual(self.remote.docs, {})

    async def test_malformed_and_http_error_responses_are_explicit_failures(self):
        material, body = await self.material()
        path = '/materials/' + material['id'] + '/rag'
        for remote_response in [httpx.Response(200, json={'code': 0, 'data': {'docs': [None]}}), httpx.Response(502, text='server-secret')]:
            with patch('httpx.AsyncClient', partial(self.client.__class__, transport=httpx.MockTransport(lambda request: remote_response))):
                result = await self.client.post(path, json=body)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()['status'], 'failed')
            self.assertNotIn('server-secret', result.text)

    async def test_malformed_upload_payload_is_an_explicit_failure(self):
        material, body = await self.material()
        def malformed_upload(request):
            if request.method == 'POST' and request.url.path.endswith('/documents'):
                return httpx.Response(200, json={'code': 0, 'data': True})
            return self.remote.handle(request)
        with patch('httpx.AsyncClient', partial(self.client.__class__, transport=httpx.MockTransport(malformed_upload))):
            response = await self.client.post('/materials/' + material['id'] + '/rag', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['status'], 'failed')

    async def test_malformed_remote_chunk_bindings_are_excluded(self):
        await self.indexed()
        self.remote.chunks = [{'id': 'invalid', 'dataset_id': 'mine', 'document_id': [], 'content': 'unmapped'}]
        response = await self.client.post('/rag/retrieve', json={'question': '主题'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['sources'], [])

    async def test_retrieve_filters_remote_foreign_stale_and_unmapped_chunks_and_caps_text(self):
        material, body, doc = await self.indexed()
        self.remote.chunks = [
            {'id': 'foreign', 'document_id': doc, 'dataset_id': 'theirs', 'content': 'secret'},
            {'id': 'unmapped', 'document_id': 'unknown', 'dataset_id': 'mine', 'content': 'secret'},
        ] + [{'id': 'ok-' + str(i), 'document_id': doc, 'dataset_id': 'mine', 'content': '文' * 1500} for i in range(8)]
        response = await self.client.post('/rag/retrieve', json={'question': '主题', 'material_ids': [material['id']]})
        self.assertEqual(response.status_code, 200, response.text)
        sources = response.json()['sources']
        self.assertEqual(len(sources), 6)
        self.assertEqual(sum(len(v['content']) for v in sources), 8000)
        self.assertEqual(sources[0]['id'], 'ok-0')
        self.assertEqual(sources[0]['title'], '测试标题')
        self.assertEqual(sources[0]['content_hash'], body['content_hash'])
        async with self.sessions() as db:
            await db.execute(text("UPDATE materials SET content_hash=:hash WHERE id=:id"), {'hash': '0' * 64, 'id': material['id']})
            await db.commit()
        self.assertEqual((await self.client.post('/rag/retrieve', json={'question': '主题'})).json()['sources'], [])

    async def test_retrieve_validates_selected_ownership_and_never_searches_an_empty_scope(self):
        material, _ = await self.material()
        response = await self.client.post('/rag/retrieve', json={'question': '主题', 'material_ids': [material['id']]}, headers={'Authorization': 'Bearer other-key'})
        self.assertEqual(response.status_code, 404, response.text)
        for body in [{'question': '主题'}, {'question': '主题', 'material_ids': []}]:
            result = await self.client.post('/rag/retrieve', json=body)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()['sources'], [])
        self.assertFalse(self.remote.calls)

    async def test_revision_change_reindexes_and_retains_failed_cleanup_binding(self):
        material, body, first_doc = await self.indexed()
        self.remote.fail_delete = True
        settings.__dict__['ragflow_index_revision'] = 'rc2-naive-v2'
        self.assertEqual((await self.client.get('/materials/' + material['id'] + '/rag')).json()['status'], 'outdated')
        response = await self.client.post('/materials/' + material['id'] + '/rag', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.remote.uploads, 2)
        pending = await self.client.get('/rag/cleanup')
        self.assertEqual(len(pending.json()['items']), 1, pending.text)
        async with self.sessions() as db:
            row = (await db.execute(text("SELECT document_id,status FROM material_rag_indexes WHERE document_id=:doc"), {'doc': first_doc})).one()
        self.assertEqual(row.status, 'cleanup_pending')
        self.assertEqual(row.document_id, first_doc)

    async def test_content_change_reindexes_and_filters_the_previous_document(self):
        material, _, old_doc = await self.indexed()
        body = {'title': '更新标题', 'content': '更新后的素材正文', 'content_hash': material_hash('更新标题', '更新后的素材正文')}
        async with self.sessions() as db:
            await db.execute(text('UPDATE materials SET content_hash=:hash WHERE id=:id'), {'hash': body['content_hash'], 'id': material['id']})
            await db.commit()
        self.remote.fail_delete = True
        response = await self.client.post('/materials/' + material['id'] + '/rag', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        await self.client.get('/materials/' + material['id'] + '/rag')
        self.assertEqual(self.remote.uploads, 2)
        self.remote.chunks = [{'id': 'old', 'document_id': old_doc, 'dataset_id': 'mine', 'content': '旧素材'},
                              {'id': 'new', 'document_id': 'doc-2', 'dataset_id': 'mine', 'content': '更新后的素材正文'}]
        sources = (await self.client.post('/rag/retrieve', json={'question': '主题'})).json()['sources']
        self.assertEqual([v['id'] for v in sources], ['new'])
        self.assertEqual(sources[0]['content_hash'], body['content_hash'])

    async def test_retrieve_rechecks_revocation_after_the_remote_request(self):
        material, _, doc = await self.indexed()
        self.remote.chunks = [{'id': 'stale', 'document_id': doc, 'dataset_id': 'mine', 'content': '已删除的素材'}]
        async def revoked_during_retrieval(request):
            if request.url.path == '/api/v1/retrieval':
                deleted = await self.client.delete('/materials/' + material['id'])
                self.assertEqual(deleted.status_code, 200, deleted.text)
            return self.remote.handle(request)
        with patch('httpx.AsyncClient', partial(self.client.__class__, transport=httpx.MockTransport(revoked_during_retrieval))):
            result = await self.client.post('/rag/retrieve', json={'question': '主题'})
        self.assertEqual(result.json()['sources'], [], result.text)

    async def test_delete_excludes_before_remote_cleanup_and_tombstone_survives_material(self):
        material, _, doc = await self.indexed()
        self.remote.chunks = [{'id': 'old', 'document_id': doc, 'dataset_id': 'mine', 'content': '旧正文'}]
        self.remote.fail_delete = True
        deleted = await self.client.delete('/materials/' + material['id'])
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual((await self.client.post('/rag/retrieve', json={'question': '主题'})).json()['sources'], [])
        pending = await self.client.get('/rag/cleanup')
        self.assertEqual(len(pending.json()['items']), 1, pending.text)
        foreign = await self.client.post('/rag/cleanup', headers={'Authorization': 'Bearer other-key'})
        self.assertEqual(foreign.json()['remaining'], 0)
        self.assertIn(('mine', doc), self.remote.docs)
        self.remote.fail_delete = False
        retried = await self.client.post('/rag/cleanup')
        self.assertEqual(retried.json()['remaining'], 0, retried.text)
        self.assertNotIn(('mine', doc), self.remote.docs)

    async def test_revoke_excludes_immediately_and_reenable_gets_a_fresh_binding(self):
        material, body, doc = await self.indexed()
        self.remote.fail_delete = True
        response = await self.client.delete('/materials/' + material['id'] + '/rag')
        self.assertEqual(response.json()['status'], 'cleanup_pending', response.text)
        self.assertEqual((await self.client.post('/rag/retrieve', json={'question': '主题'})).json()['sources'], [])
        self.remote.fail_delete = False
        await self.client.post('/rag/cleanup')
        response = await self.client.post('/materials/' + material['id'] + '/rag', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.remote.uploads, 2)

    async def test_grounded_reretrieves_authoritative_text_and_rejects_stale_or_foreign_ids(self):
        material, _, doc = await self.indexed()
        self.remote.chunks = [{'id': 'source-1', 'document_id': doc, 'dataset_id': 'mine', 'content': '可核对的素材原文'}]
        response = await self.client.post('/rag/retrieve', json={'question': '主题'})
        self.assertEqual(response.json()['sources'][0]['id'], 'source-1')
        body = {'question': '主题', 'mode': 'outline', 'brief': '读者简报', 'style': '温和', 'source_ids': ['source-1'], 'material_ids': [material['id']]}
        prompts = []
        async def stream(service, content, style, instruction):
            prompts.append((content, style, instruction))
            yield '建议[1]'
        with patch('app.services.ai_service.AIService.rewrite_stream', stream):
            generated = await self.client.post('/ai/grounded', json=body)
            long_style = await self.client.post('/ai/grounded', json={**body, 'style': '风格' * 5500})
        self.assertEqual(generated.status_code, 200, generated.text)
        self.assertEqual(long_style.status_code, 200, long_style.text[:250])
        self.assertIn('[DONE]', generated.text)
        self.assertIn('可核对的素材原文', prompts[0][0])
        self.assertIn('读者简报', prompts[0][0])
        self.assertIn('指令', prompts[0][2])
        self.assertEqual((await self.client.post('/ai/grounded', json={**body, 'sources': [{'content': '伪造'}]})).status_code, 422)
        self.assertEqual((await self.client.post('/ai/grounded', json=body, headers={'Authorization': 'Bearer other-key'})).status_code, 404)
        self.remote.chunks = []
        stale = await self.client.post('/ai/grounded', json=body)
        self.assertEqual(stale.status_code, 409, stale.text)

    async def test_grounded_invalid_citations_or_provider_failure_have_no_success_marker(self):
        material, _, doc = await self.indexed()
        self.remote.chunks = [{'id': 'source-1', 'document_id': doc, 'dataset_id': 'mine', 'content': '来源正文'}]
        body = {'question': '主题', 'mode': 'body', 'source_ids': ['source-1']}
        async def invalid_citation(*args):
            yield '建议['
            yield '2]'
        async def provider_failed(*args):
            yield '尚未完成的建议'
            raise RuntimeError('server-secret')
        for stream in [invalid_citation, provider_failed]:
            with patch('app.services.ai_service.AIService.rewrite_stream', stream):
                response = await self.client.post('/ai/grounded', json=body)
            self.assertIn('"error"', response.text)
            self.assertNotIn('[DONE]', response.text)
            self.assertNotIn('server-secret', response.text)

    async def test_rag_migration_preserves_tombstones_and_can_downgrade(self):
        path = Path(__file__).resolve().parents[1] / 'alembic' / 'versions' / 'e32b476190a8_material_rag_indexes.py'
        self.assertTrue(path.exists(), 'RAG migration is required')
        module_spec = importlib.util.spec_from_file_location('rag_revision', path)
        module = importlib.util.module_from_spec(module_spec)
        module_spec.loader.exec_module(module)
        def run(conn, fn):
            with Operations.context(MigrationContext.configure(conn)):
                fn()
        async with self.engine.begin() as conn:
            await conn.execute(text('DROP TABLE material_rag_indexes'))
            await conn.run_sync(run, module.upgrade)
            await conn.execute(text("INSERT INTO material_rag_indexes(id,user_id,material_id,content_hash,index_revision,dataset_id,document_name,status) VALUES (gen_random_uuid(),:owner,gen_random_uuid(),:hash,'v1','mine','known.txt','cleanup_pending')"), {'owner': self.user_id, 'hash': '0' * 64})
            self.assertEqual((await conn.execute(text('SELECT count(*) FROM material_rag_indexes'))).scalar_one(), 1)
            await conn.run_sync(run, module.downgrade)
            self.assertIsNone((await conn.execute(text("SELECT to_regclass('material_rag_indexes')"))).scalar_one())
