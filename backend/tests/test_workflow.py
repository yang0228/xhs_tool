import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from unittest.mock import patch

from sqlalchemy import select

from app.main import app
from app.models.draft import Draft
from app.models.image import Image
from app.models.post_analytics import PostAnalytics
from tests.support import DatabaseTestCase, draft_payload


class OpenApiTests(unittest.TestCase):
    def test_openapi_documents_draft_routes(self):
        self.assertIn('/api/drafts', app.openapi()['paths'])


class WorkflowTests(DatabaseTestCase):
    async def test_draft_roundtrip_and_atomic_conflict(self):
        response = await self.client.post('/drafts', json=draft_payload())
        self.assertEqual(response.status_code, 201, response.text)
        draft = response.json()
        self.assertEqual(draft['content_iv'], 'body-iv')
        self.assertEqual(draft['encryption_version'], 2)
        updates = await asyncio.gather(*[self.client.put('/drafts/' + draft['id'], json={**draft_payload(), 'expected_version':1}) for _ in range(2)])
        self.assertEqual(sorted(r.status_code for r in updates), [200,409])
        saved = (await self.client.get('/drafts/' + draft['id'])).json()
        self.assertEqual(saved['version'], 2)
        self.assertEqual(saved['encrypted_content'], 'body-cipher')

    async def test_legacy_read_preserves_ciphertext_and_rejects_incomplete_writes(self):
        async with self.sessions() as session:
            d = Draft(user_id=self.user_id, encrypted_title='old-title', encrypted_content='legacy-body', encryption_iv='old-iv', encryption_salt='salt')
            session.add(d)
            await session.commit()
            ident = str(d.id)
        result = (await self.client.get('/drafts/' + ident)).json()
        self.assertIsNone(result['content_iv'])
        self.assertEqual(result['encryption_version'],1)
        self.assertEqual(result['encrypted_content'],'legacy-body')
        self.assertEqual((await self.client.put('/drafts/' + ident,json={'expected_version':1,'encrypted_content':'replacement'})).status_code,422)
        self.assertEqual((await self.client.put('/drafts/' + ident,json={**draft_payload(),'expected_version':1})).status_code,200)

    async def test_draft_references_must_belong_to_owner(self):
        async with self.sessions() as session:
            image = Image(user_id=self.other_id,r2_key='other-image',r2_url='https://example.test/x',mime_type='image/png')
            session.add(image)
            await session.commit()
            image_id = str(image.id)
        p = draft_payload(); p['image_ids']=[image_id]
        self.assertEqual((await self.client.post('/drafts',json=p)).status_code,422)
        p['image_ids']=[];p['material_id']=str(uuid4())
        self.assertEqual((await self.client.post('/drafts',json=p)).status_code,422)

    async def test_material_deduplication_is_owner_scoped_and_searchable(self):
        p=dict(encrypted_content='x'*20000,encryption_iv='iv',encryption_salt='salt',content_hash='same',source_title='Long research',tags=['work'])
        results=await asyncio.gather(*[self.client.post('/materials',json=p) for _ in range(2)])
        self.assertEqual(results[0].json()['id'],results[1].json()['id'])
        other=await self.client.post('/materials',json=p,headers={'Authorization':'Bearer other-key'})
        self.assertNotEqual(results[0].json()['id'],other.json()['id'])
        result=(await self.client.get('/materials?tag=work&q=research&limit=1')).json()
        self.assertEqual(result['total'],1)
        self.assertEqual(result['items'][0]['encrypted_content'],'x'*20000)
        self.assertEqual((await self.client.get('/materials?tag=absent')).json()['total'],0)
        self.assertEqual((await self.client.get('/materials?page=2&limit=1')).json()['items'],[])

    async def test_manual_publication_url_ownership_and_metrics(self):
        d=(await self.client.post('/drafts',json=draft_payload())).json()
        for url in ['http://www.xiaohongshu.com/explore/a','https://xiaohongshu.com.evil.test/a','https://user@www.xiaohongshu.com/a']:
            self.assertEqual((await self.client.post('/publish/records',json={'draft_id':d['id'],'xhs_post_url':url})).status_code,422)
        p=await self.client.post('/publish/records',json={'draft_id':d['id'],'xhs_post_url':'https://www.xiaohongshu.com/explore/abc'})
        self.assertEqual(p.status_code,201,p.text)
        post_id=p.json()['id']
        self.assertEqual((await self.client.get('/publish/posts')).json()['total'],1)
        self.assertEqual((await self.client.post('/analytics/posts/'+post_id,json={'view_count':-1})).status_code,422)
        self.assertEqual((await self.client.post('/analytics/posts/'+post_id,json={'view_count':1.5})).status_code,422)
        self.assertEqual((await self.client.post('/analytics/posts/'+post_id,json={'view_count':10,'like_count':3})).status_code,201)
        self.assertEqual((await self.client.post('/analytics/posts/'+post_id,json={},headers={'Authorization':'Bearer other-key'})).status_code,404)
        async with self.sessions() as session:
            session.add(PostAnalytics(published_post_id=post_id,view_count=1,collected_at=datetime.now(timezone.utc)-timedelta(days=60)))
            await session.commit()
        summary=(await self.client.get('/analytics/posts?days=30')).json()['posts'][0]
        self.assertEqual(len(summary['history']),1)
        self.assertEqual(summary['latest']['view_count'],10)
        self.assertEqual((await self.client.get('/drafts/'+d['id'])).json()['status'],'published')

    async def test_stubs_fail_truthfully_and_registration_is_single_user(self):
        for path,payload in [('/publish',{'draft_id':str(uuid4()),'encrypted_cookies':'x','encryption_iv':'iv','encryption_salt':'s'}),('/publish/xhs/credentials',{'encrypted_cookies':'x','encryption_iv':'iv','encryption_salt':'s'}),('/analytics/refresh',{})]:
            self.assertEqual((await self.client.post(path,json=payload)).status_code,501)
        self.assertEqual((await self.client.post('/auth/register')).status_code,409)

    async def test_confirm_image_checks_owner_existence_and_actual_metadata(self):
        self.assertEqual((await self.client.post('/images/confirm',json={'r2_key':f'users/{self.other_id}/id/a.png'})).status_code,403)
        key=f'users/{self.user_id}/id/a.jpg'
        async def head(_self,key):
            return {'ContentLength':1234,'ContentType':'image/jpeg'}
        with patch('app.services.r2_service.R2Service.__init__',return_value=None), patch('app.services.r2_service.R2Service.head_object',head,create=True):
            r=await self.client.post('/images/confirm',json={'r2_key':key,'width':800,'height':600})
            self.assertEqual(r.status_code,201,r.text)
            self.assertEqual(r.json()['mime_type'],'image/jpeg')
            self.assertEqual(r.json()['file_size_bytes'],1234)
            self.assertEqual(r.json()['width'],800)
        async def missing(_self,key):
            from botocore.exceptions import ClientError
            raise ClientError({'Error':{'Code':'404','Message':'Not Found'}},'HeadObject')
        with patch('app.services.r2_service.R2Service.__init__',return_value=None), patch('app.services.r2_service.R2Service.head_object',missing,create=True):
            self.assertEqual((await self.client.post('/images/confirm',json={'r2_key':key+'2'})).status_code,422)
        self.assertEqual((await self.client.get('/images')).json()['total'],1)

    async def test_creation_retry_does_not_duplicate_or_overwrite(self):
        payload = {**draft_payload(), 'client_id':str(uuid4())}
        results = await asyncio.gather(*[self.client.post('/drafts',json=payload) for _ in range(2)])
        self.assertEqual([r.status_code for r in results],[201,201])
        self.assertEqual(results[0].json()['id'],payload['client_id'])
        self.assertEqual(results[1].json()['id'],payload['client_id'])
        payload['encrypted_content']='new-cipher'
        retry=await self.client.post('/drafts',json=payload)
        self.assertEqual(retry.json()['encrypted_content'],'body-cipher')
        self.assertEqual((await self.client.post('/drafts',json=payload,headers={'Authorization':'Bearer other-key'})).status_code,409)
        record={'draft_id':payload['client_id'],'xhs_post_url':'https://xhslink.com/a/123'}
        a,b=await asyncio.gather(self.client.post('/publish/records',json=record),self.client.post('/publish/records',json=record))
        self.assertEqual(a.json()['id'],b.json()['id'])
        self.assertEqual((await self.client.get('/publish/posts')).json()['total'],1)

    async def test_extension_cors_preflight_works(self):
        origin='chrome-extension://'+'a'*32
        response=await self.client.options('/drafts',headers={'Origin':origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.headers.get('access-control-allow-origin'),origin)

    async def test_image_validation_failure_and_delete_failure_preserve_database(self):
        for body in [{'filename':'x.exe','mime_type':'application/x-msdownload','file_size':1},{'filename':'../x.png','mime_type':'image/png','file_size':1},{'filename':'x.png','mime_type':'image/png','file_size':0}]:
            self.assertEqual((await self.client.post('/images/upload-url',json=body)).status_code,422)
        async def failed(_self, key):
            raise asyncio.TimeoutError()
        async with self.sessions() as session:
            image=Image(user_id=self.user_id,r2_key=f'users/{self.user_id}/image/a.png',r2_url='https://example.test/a.png',mime_type='image/png')
            session.add(image);await session.commit();ident=str(image.id)
        with patch('app.services.r2_service.R2Service.__init__',return_value=None),patch('app.services.r2_service.R2Service.delete_object',failed):
            self.assertEqual((await self.client.delete('/images/'+ident)).status_code,502)
        self.assertEqual((await self.client.get('/images')).json()['total'],1)

    async def test_material_rejects_overlong_tags_before_database(self):
        body=dict(encrypted_content='cipher',encryption_iv='iv',encryption_salt='salt',content_hash='h',tags=['x'*65])
        self.assertEqual((await self.client.post('/materials',json=body)).status_code,422)

    async def test_image_confirmation_retry_is_idempotent(self):
        key=f'users/{self.user_id}/upload/a.png'
        async def head(_self,key):
            await asyncio.sleep(0.01)
            return {'ContentLength':15,'ContentType':'image/png'}
        with patch('app.services.r2_service.R2Service.__init__',return_value=None),patch('app.services.r2_service.R2Service.head_object',head):
            first,second=await asyncio.gather(*[self.client.post('/images/confirm',json={'r2_key':key}) for _ in range(2)])
        self.assertEqual(first.json()['id'],second.json()['id'])

    async def test_empty_instance_registers_only_once_under_concurrency(self):
        from sqlalchemy import delete
        from app.models.user import User
        async with self.sessions() as session:
            await session.execute(delete(User));await session.commit()
        results=await asyncio.gather(self.client.post('/auth/register'),self.client.post('/auth/register'))
        self.assertEqual(sorted(r.status_code for r in results),[200,409])
        success=next(r.json() for r in results if r.status_code==200)
        self.assertEqual((await self.client.post('/auth/verify',headers={'Authorization':'Bearer '+success['api_key']})).json()['user_id'],success['user_id'])

    async def test_private_image_download_url_is_owned_and_signed(self):
        async with self.sessions() as session:
            image=Image(user_id=self.user_id,r2_key=f'users/{self.user_id}/file/a.png',r2_url='https://private.test/a.png',mime_type='image/png')
            session.add(image);await session.commit();ident=str(image.id)
        async def signed(_self,key,expires=3600):
            return 'https://r2.test/signed-image?signature=one'
        with patch('app.services.r2_service.R2Service.__init__',return_value=None),patch('app.services.r2_service.R2Service.generate_presigned_download_url',signed):
            response=await self.client.get('/images/'+ident+'/download-url')
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json(),{'download_url':'https://r2.test/signed-image?signature=one','expires_in':3600})
            self.assertEqual((await self.client.get('/images/'+ident+'/download-url',headers={'Authorization':'Bearer other-key'})).status_code,404)

    async def test_delete_used_image_unlinks_drafts_preserves_order_and_backup(self):
        async with self.sessions() as db:
            images = [Image(user_id=self.user_id, r2_key=f'users/{self.user_id}/{uuid4()}/a.png', r2_url='https://images.test/a.png', mime_type='image/png') for _ in range(3)]
            db.add_all(images); await db.flush()
            ids = [str(image.id) for image in images]
            draft = Draft(user_id=self.user_id, **{**draft_payload(), 'image_ids':ids})
            untouched = Draft(user_id=self.other_id, **draft_payload())
            db.add_all([draft, untouched]); await db.commit()
            draft_id, untouched_id = draft.id, untouched.id
        async def deleted(_self, key):
            pass
        with patch('app.services.r2_service.R2Service.__init__',return_value=None),patch('app.services.r2_service.R2Service.delete_object',deleted):
            response = await self.client.delete('/images/'+ids[1])
        self.assertEqual(response.status_code,200,response.text)
        saved = (await self.client.get('/drafts/'+str(draft_id))).json()
        self.assertEqual(saved['image_ids'], [ids[0],ids[2]])
        self.assertEqual(saved['version'],2)
        self.assertEqual(saved['encrypted_content'],'body-cipher')
        stale = await self.client.put('/drafts/'+str(draft_id),json={**draft_payload(),'image_ids':ids,'expected_version':1})
        self.assertEqual(stale.status_code,409)
        backup = (await self.client.get('/backup')).json()
        self.assertEqual((await self.client.post('/backup/restore',json=backup)).status_code,200)
        async with self.sessions() as db:
            self.assertEqual((await db.get(Draft, untouched_id)).version,1)

    async def test_failed_storage_delete_does_not_unlink_or_bump_draft(self):
        async with self.sessions() as db:
            image = Image(user_id=self.user_id,r2_key=f'users/{self.user_id}/x/a.png',r2_url='https://images.test/a.png',mime_type='image/png')
            db.add(image);await db.flush()
            draft = Draft(user_id=self.user_id, **{**draft_payload(),'image_ids':[str(image.id)]})
            db.add(draft);await db.commit(); ident, draft_id=image.id,draft.id
        async def failed(_self,key):
            raise asyncio.TimeoutError()
        with patch('app.services.r2_service.R2Service.__init__',return_value=None),patch('app.services.r2_service.R2Service.delete_object',failed):
            self.assertEqual((await self.client.delete('/images/'+str(ident))).status_code,502)
        saved = (await self.client.get('/drafts/'+str(draft_id))).json()
        self.assertEqual(saved['image_ids'],[str(ident)])
        self.assertEqual(saved['version'],1)

    async def test_concurrent_draft_creation_cannot_reference_deleted_image(self):
        async with self.sessions() as db:
            image=Image(user_id=self.user_id,r2_key=f'users/{self.user_id}/race/a.png',r2_url='https://images.test/a.png',mime_type='image/png')
            db.add(image);await db.commit();ident=str(image.id)
        entered, release = asyncio.Event(), asyncio.Event()
        async def paused_delete(_self,key):
            entered.set();await release.wait()
        with patch('app.services.r2_service.R2Service.__init__',return_value=None),patch('app.services.r2_service.R2Service.delete_object',paused_delete):
            deleting=asyncio.create_task(self.client.delete('/images/'+ident))
            await asyncio.wait_for(entered.wait(),1)
            creating=asyncio.create_task(self.client.post('/drafts',json={**draft_payload(),'image_ids':[ident]}))
            await asyncio.sleep(0.05)
            release.set()
            delete_response, create_response=await asyncio.gather(deleting,creating)
        self.assertEqual(delete_response.status_code,200)
        self.assertEqual(create_response.status_code,422)
