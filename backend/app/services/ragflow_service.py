"""The optional, concrete RAGFlow HTTP integration (candidate API: v1.0.0-rc2)."""
from __future__ import annotations
from urllib.parse import quote

import httpx
from sqlalchemy import select, text

from ..config import settings
from ..models.material_rag_index import MaterialRagIndex

EXCLUDED = ('cleanup_pending', 'removed')


class RagFlowError(Exception):
    pass


class RAGFlowService:
    async def request(self, method, path, **kwargs):
        if not settings.ragflow_url or not settings.ragflow_api_key:
            raise RagFlowError('RAG 服务尚未配置，远端清理未完成')
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.request(method, settings.ragflow_url.rstrip('/') + '/api/v1' + path,
                    headers={'Authorization': 'Bearer ' + settings.ragflow_api_key}, **kwargs)
                response.raise_for_status()
                body = response.json()
                if not isinstance(body, dict) or body.get('code') != 0:
                    raise RagFlowError('RAGFlow 操作失败，请重试')
                return body.get('data')
        except (httpx.HTTPError, httpx.InvalidURL, ValueError, TypeError) as exc:
            # Never echo URLs, credentials or arbitrary remote error bodies.
            raise RagFlowError('RAGFlow 服务不可用，请检查服务后重试') from exc

    def path(self, dataset):
        return '/datasets/' + quote(dataset, safe='')

    async def documents(self, dataset, **params):
        # rc2 returns code 102 for an absent name/id filter. List the authorized
        # dataset and filter locally so first uploads and lost-delete retries work.
        documents, page, received = [], 1, 0
        while True:
            data = await self.request('GET', self.path(dataset) + '/documents',
                                      params={'page': page, 'page_size': 100})
            if (not isinstance(data, dict) or not isinstance(data.get('docs'), list)
                    or not isinstance(data.get('total'), int) or data['total'] < 0
                    or any(not isinstance(doc, dict) or not isinstance(doc.get('id'), str)
                           or not 0 < len(doc['id']) <= 128 for doc in data['docs'])):
                raise RagFlowError('RAGFlow 文档响应无效，请重试')
            documents.extend(doc for doc in data['docs']
                             if all(doc.get(key) == value for key, value in params.items()))
            received += len(data['docs'])
            if received >= data['total'] or not data['docs']:
                return documents
            page += 1

    async def upload(self, dataset, name, content):
        # Look up the deterministic name before upload and after a lost response.
        docs = await self.documents(dataset, name=name)
        docs = [doc for doc in docs if doc.get('name') == name and doc.get('id')]
        if not docs:
            try:
                docs = await self.request('POST', self.path(dataset) + '/documents',
                    files={'file': (name, content.encode('utf-8'), 'text/plain; charset=utf-8')})
            except RagFlowError:
                docs = await self.documents(dataset, name=name)
            if not isinstance(docs, list):
                raise RagFlowError('RAGFlow 上传响应无效，请重试')
            docs = [doc for doc in docs or [] if isinstance(doc, dict) and doc.get('name') == name and doc.get('id')]
        if len(docs) != 1 or not isinstance(docs[0]['id'], str) or not 0 < len(docs[0]['id']) <= 128:
            raise RagFlowError('RAGFlow 文档绑定不明确，请检查远端同名文档后重试')
        return str(docs[0]['id'])

    async def parse(self, dataset, document):
        if not document:
            raise RagFlowError('文档绑定缺失，请重新同步')
        await self.request('POST', self.path(dataset) + '/chunks', json={'document_ids': [document]})

    async def delete(self, dataset, document):
        if not document:
            raise RagFlowError('文档绑定缺失，远端清理未完成')
        if not any(doc['id'] == document for doc in await self.documents(dataset, id=document)):
            return  # The previous deletion may have succeeded before its response was lost.
        await self.request('DELETE', self.path(dataset) + '/documents', json={'ids': [document]})

    async def retrieve(self, dataset, documents, question):
        if not documents:
            return []
        data = await self.request('POST', '/retrieval', json={'question': question, 'dataset_ids': [dataset],
            'document_ids': documents, 'page': 1, 'page_size': 6, 'highlight': False,
            'include_knowledge_compilation': False})
        if not isinstance(data, dict) or not isinstance(data.get('chunks'), list):
            raise RagFlowError('RAGFlow 检索响应无效，请重试')
        return data['chunks']


async def lock_material(db, user_id, material_id):
    await db.execute(text('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))'),
                     {'key': f'rag:{user_id}:{material_id}'})


async def exclude_material(db, user_id, material_id):
    """Call under the material lock; commit exclusion before any remote delete."""
    indexes = list((await db.scalars(select(MaterialRagIndex).where(MaterialRagIndex.user_id == user_id,
        MaterialRagIndex.material_id == material_id, MaterialRagIndex.status != 'removed'))).all())
    for index in indexes:
        index.status = 'cleanup_pending'
        index.last_error = None
    return indexes


async def cleanup_indexes(db, indexes):
    service = RAGFlowService()
    for index in indexes:
        if index.status != 'cleanup_pending':
            continue
        try:
            if not index.document_id:
                # An upload may have succeeded before its response/DB commit was lost.
                docs = await service.documents(index.dataset_id, name=index.document_name)
                docs = [doc for doc in docs if doc.get('name') == index.document_name and doc.get('id')]
                for doc in docs[1:]:
                    extra = MaterialRagIndex(user_id=index.user_id, material_id=index.material_id,
                        content_hash=index.content_hash, index_revision=index.index_revision,
                        dataset_id=index.dataset_id, document_name=index.document_name,
                        document_id=doc['id'], status='cleanup_pending')
                    db.add(extra)
                    indexes.append(extra)
                index.document_id = docs[0]['id'] if docs else None
                await db.commit()  # Preserve all known IDs before attempting any deletion.
            if index.document_id:
                await service.delete(index.dataset_id, index.document_id)
            index.status, index.last_error = 'removed', None
        except RagFlowError as exc:
            index.last_error = str(exc)
        await db.commit()
