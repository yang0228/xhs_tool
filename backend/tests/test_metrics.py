import asyncio
import csv
import io
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import func, select

from app.models.post_analytics import PostAnalytics
from app.models.published_post import PublishedPost
from tests.support import DatabaseTestCase


class MetricsTests(DatabaseTestCase):
    async def post(self, *, owner=None, url=None, tags=None, template=None):
        async with self.sessions() as db:
            post = PublishedPost(user_id=owner or self.user_id,
                                 xhs_post_url=url or 'https://xhslink.com/a/' + uuid4().hex,
                                 published_at=datetime.now(timezone.utc) - timedelta(days=10),
                                 topic_tags=tags or [], template_id=template)
            db.add(post)
            await db.commit()
            return post

    def csv_text(self, rows, locator='post_id'):
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([locator, 'collected_at', 'view_count', 'like_count', 'comment_count', 'share_count', 'collect_count'])
        writer.writerows(rows)
        return output.getvalue()

    async def count(self):
        async with self.sessions() as db:
            return await db.scalar(select(func.count(PostAnalytics.id)))

    async def test_manual_observation_time_is_validated_and_legacy_default_is_now(self):
        post = await self.post()
        path = '/analytics/posts/' + str(post.id)
        invalid = [
            {'collected_at': post.published_at.replace(tzinfo=None).isoformat()},
            {'collected_at': (post.published_at - timedelta(seconds=1)).isoformat()},
            {'collected_at': (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()},
            {'view_count': -1}, {'like_count': 1.5}, {'collect_count': True},
        ]
        for body in invalid:
            response = await self.client.post(path, json=body)
            self.assertEqual(response.status_code, 422, response.text)
        before = datetime.now(timezone.utc)
        saved = await self.client.post(path, json={'view_count': 3})
        self.assertEqual(saved.status_code, 201, saved.text)
        self.assertGreaterEqual(datetime.fromisoformat(saved.json()['collected_at'].replace('Z', '+00:00')), before)
        other = await self.client.post(path, json={}, headers={'Authorization': 'Bearer other-key'})
        self.assertEqual(other.status_code, 404)
        self.assertEqual(await self.count(), 1)

    async def test_concurrent_manual_retries_are_idempotent_and_conflicting_values_return_409(self):
        post = await self.post()
        path = '/analytics/posts/' + str(post.id)
        payload = {'collected_at': (post.published_at + timedelta(hours=24)).isoformat(), 'view_count': 10}
        results = await asyncio.gather(*[self.client.post(path, json=payload) for _ in range(3)])
        self.assertEqual([r.status_code for r in results], [201, 201, 201])
        self.assertEqual(len({r.json()['id'] for r in results}), 1)
        conflict = await self.client.post(path, json={**payload, 'view_count': 11})
        self.assertEqual(conflict.status_code, 409, conflict.text)
        self.assertEqual(await self.count(), 1)

    async def test_concurrent_conflicting_manual_samples_have_one_winner(self):
        post = await self.post()
        path = '/analytics/posts/' + str(post.id)
        observed = (post.published_at + timedelta(hours=24)).isoformat()
        responses = await asyncio.gather(*[self.client.post(path, json={'collected_at': observed, 'view_count': views}) for views in [10, 20]])
        self.assertEqual(sorted(r.status_code for r in responses), [201, 409])
        self.assertEqual(await self.count(), 1)

    async def test_csv_preview_confirmation_retry_and_timezone_normalization(self):
        post = await self.post()
        observed = post.published_at + timedelta(hours=24)
        text = self.csv_text([[post.xhs_post_url, observed.astimezone(timezone(timedelta(hours=8))).isoformat(), 100, 2, 3, 4, 5]], 'xhs_post_url')
        preview = await self.client.post('/analytics/import', json={'csv_text': text})
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual(preview.json()['imported'], 0)
        self.assertEqual(preview.json()['errors'], [])
        self.assertEqual(preview.json()['rows'][0]['post_id'], str(post.id))
        self.assertEqual(preview.json()['rows'][0]['row'], 2)
        self.assertEqual(await self.count(), 0)
        responses = await asyncio.gather(*[self.client.post('/analytics/import', json={'csv_text': text, 'confirm': True}) for _ in range(2)])
        self.assertEqual([r.status_code for r in responses], [200, 200])
        self.assertEqual(sorted((r.json()['imported'], r.json()['skipped']) for r in responses), [(0, 1), (1, 0)])
        duplicate = await self.client.post('/analytics/posts/' + str(post.id), json={'collected_at': observed.isoformat(), 'view_count': 100, 'like_count': 2, 'comment_count': 3, 'share_count': 4, 'collect_count': 5})
        self.assertEqual(duplicate.status_code, 201, duplicate.text)
        self.assertEqual(await self.count(), 1)

    async def test_csv_errors_prevent_all_writes_and_report_row_numbers(self):
        post, foreign = await self.post(), await self.post(owner=self.other_id)
        observed = (post.published_at + timedelta(hours=24)).isoformat()
        text = self.csv_text([[str(post.id), observed, 1, 0, 0, 0, 0],
                              [str(foreign.id), observed, 2, 0, 0, 0, 0],
                              [str(uuid4()), observed, 2, 0, 0, 0, 0],
                              [str(post.id), observed, -1, 0, 0, 0, 0]])
        preview = await self.client.post('/analytics/import', json={'csv_text': text})
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual([error['row'] for error in preview.json()['errors']], [3, 4, 5])
        confirmed = await self.client.post('/analytics/import', json={'csv_text': text, 'confirm': True})
        self.assertEqual(confirmed.status_code, 422, confirmed.text)
        self.assertEqual(confirmed.json()['detail']['imported'], 0)
        self.assertEqual(await self.count(), 0)

    async def test_csv_rejects_ambiguous_urls_bad_times_headers_and_over_limit(self):
        post = await self.post()
        await self.post(url=post.xhs_post_url)
        observed = post.published_at + timedelta(hours=24)
        cases = [
            self.csv_text([[post.xhs_post_url, observed.isoformat(), 1, 0, 0, 0, 0]], 'xhs_post_url'),
            self.csv_text([[str(post.id), observed.replace(tzinfo=None).isoformat(), 1, 0, 0, 0, 0]]),
            self.csv_text([[str(post.id), (post.published_at - timedelta(seconds=1)).isoformat(), 1, 0, 0, 0, 0]]),
            self.csv_text([[str(post.id), (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(), 1, 0, 0, 0, 0]]),
            self.csv_text([[str(post.id), observed.isoformat(), '1.5', 0, 0, 0, 0]]),
            self.csv_text([[str(post.id), observed.isoformat(), 2147483648, 0, 0, 0, 0]]),
            'post_id,collected_at,view_count\n',
            'post_id,collected_at,view_count,like_count,comment_count,share_count,collect_count\n"unterminated',
            self.csv_text([[str(post.id), observed.isoformat(), 1, 0, 0, 0, 0]] * 501),
        ]
        for text in cases:
            response = await self.client.post('/analytics/import', json={'csv_text': text, 'confirm': True})
            self.assertEqual(response.status_code, 422, response.text)
            self.assertTrue(response.json()['detail']['errors'])
        self.assertEqual(await self.count(), 0)

    async def test_csv_confirmation_revalidates_history_after_preview(self):
        post = await self.post()
        observed = (post.published_at + timedelta(hours=24)).isoformat()
        text = self.csv_text([[str(post.id), observed, 10, 0, 0, 0, 0]])
        preview = await self.client.post('/analytics/import', json={'csv_text': text})
        self.assertEqual(preview.json()['errors'], [])
        manual = await self.client.post('/analytics/posts/' + str(post.id), json={'collected_at': observed, 'view_count': 20})
        self.assertEqual(manual.status_code, 201, manual.text)
        confirmed = await self.client.post('/analytics/import', json={'csv_text': text, 'confirm': True})
        self.assertEqual(confirmed.status_code, 422, confirmed.text)
        self.assertEqual(confirmed.json()['detail']['errors'][0]['row'], 2)
        self.assertEqual(await self.count(), 1)

    async def test_csv_and_manual_conflicting_writes_share_one_transaction_lock(self):
        post = await self.post()
        observed = (post.published_at + timedelta(hours=24)).isoformat()
        text = self.csv_text([[str(post.id), observed, 10, 0, 0, 0, 0]])
        imported, manual = await asyncio.gather(
            self.client.post('/analytics/import', json={'csv_text': text, 'confirm': True}),
            self.client.post('/analytics/posts/' + str(post.id), json={'collected_at': observed, 'view_count': 20}),
        )
        self.assertIn((imported.status_code, manual.status_code), [(200, 409), (422, 201)])
        self.assertEqual(await self.count(), 1)

    async def test_csv_accepts_exactly_500_rows_and_skips_identical_rows(self):
        post = await self.post()
        row = [str(post.id), (post.published_at + timedelta(hours=24)).isoformat(), 10, 0, 0, 0, 0]
        response = await self.client.post('/analytics/import', json={'csv_text': self.csv_text([row] * 500), 'confirm': True})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()['imported'], response.json()['skipped']), (1, 499))
        self.assertEqual(await self.count(), 1)

    async def test_csv_duplicate_conflicts_are_atomic_both_within_batch_and_with_history(self):
        post = await self.post()
        observed = (post.published_at + timedelta(hours=24)).isoformat()
        row = [str(post.id), observed, 10, 0, 0, 0, 0]
        duplicate = await self.client.post('/analytics/import', json={'csv_text': self.csv_text([row, row]), 'confirm': True})
        self.assertEqual(duplicate.status_code, 200, duplicate.text)
        self.assertEqual((duplicate.json()['imported'], duplicate.json()['skipped']), (1, 1))
        fresh = [str(post.id), (post.published_at + timedelta(hours=72)).isoformat(), 30, 0, 0, 0, 0]
        conflicting = [str(post.id), observed, 99, 0, 0, 0, 0]
        for rows in [[fresh, conflicting], [fresh, [*fresh[:2], 31, *fresh[3:]]]]:
            response = await self.client.post('/analytics/import', json={'csv_text': self.csv_text(rows), 'confirm': True})
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(await self.count(), 1)

    async def test_legacy_duplicate_history_is_preserved_and_conflicts_are_explicit(self):
        post = await self.post()
        observed = post.published_at + timedelta(hours=24)
        async with self.sessions() as db:
            db.add_all([PostAnalytics(published_post_id=post.id, collected_at=observed, view_count=10),
                        PostAnalytics(published_post_id=post.id, collected_at=observed, view_count=11)])
            await db.commit()
        response = await self.client.post('/analytics/posts/' + str(post.id), json={'collected_at': observed.isoformat(), 'view_count': 10})
        self.assertEqual(response.status_code, 409, response.text)
        history = await self.client.get('/analytics/posts')
        self.assertEqual(len(history.json()['posts'][0]['history']), 2)
        self.assertEqual(await self.count(), 2)

    async def test_insights_use_nearest_window_sample_and_mark_missing_and_zero_views(self):
        a = await self.post(tags=['生活', '教程'], template='checklist')
        b = await self.post(tags=['生活'], template='steps')
        c = await self.post(tags=['空样本'])
        foreign = await self.post(owner=self.other_id, tags=['私有'])
        async with self.sessions() as db:
            db.add_all([
                PostAnalytics(published_post_id=a.id, collected_at=a.published_at + timedelta(hours=22), view_count=50, like_count=5),
                PostAnalytics(published_post_id=a.id, collected_at=a.published_at + timedelta(hours=25), view_count=100, like_count=10, comment_count=5, share_count=3, collect_count=2),
                PostAnalytics(published_post_id=a.id, collected_at=a.published_at + timedelta(hours=72), view_count=1000, like_count=100),
                PostAnalytics(published_post_id=b.id, collected_at=b.published_at + timedelta(hours=21), view_count=0, like_count=2),
                PostAnalytics(published_post_id=c.id, collected_at=c.published_at + timedelta(hours=80), view_count=9999),
                PostAnalytics(published_post_id=foreign.id, collected_at=foreign.published_at + timedelta(hours=24), view_count=100000),
            ])
            await db.commit()
        response = await self.client.get('/analytics/insights?window_hours=24')
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result['window_tolerance_hours'], 3)
        groups = {(g['kind'], g['name']): g for g in result['groups']}
        living = groups[('topic', '生活')]
        self.assertEqual((living['sample_count'], living['total_posts'], living['missing_count']), (2, 2, 0))
        self.assertEqual(living['average_views'], 50)
        self.assertEqual(living['average_interactions'], 11)
        self.assertAlmostEqual(living['interaction_rate'], .22)
        self.assertEqual(sorted(living['observation_ages_hours']), [21, 25])
        self.assertEqual(set(living['post_ids']), {str(a.id), str(b.id)})
        self.assertIsNone(groups[('template', 'steps')]['interaction_rate'])
        missing = groups[('topic', '空样本')]
        self.assertEqual((missing['sample_count'], missing['missing_count']), (0, 1))
        self.assertIsNone(missing['average_views'])
        self.assertIsNone(missing['average_interactions'])
        self.assertIsNone(missing['interaction_rate'])
        self.assertEqual(missing['observation_ages_hours'], [])
        self.assertIn(('template', 'none'), groups)
        self.assertNotIn(('topic', '私有'), groups)
        later = (await self.client.get('/analytics/insights?window_hours=72')).json()
        self.assertEqual(next(g for g in later['groups'] if g['kind'] == 'topic' and g['name'] == '生活')['average_views'], 1000)
        self.assertEqual((await self.client.get('/analytics/insights?window_hours=48')).status_code, 422)

    async def test_review_is_grounded_in_owned_groups_and_discloses_small_samples(self):
        post = await self.post(tags=['生活'], template='checklist')
        async with self.sessions() as db:
            db.add(PostAnalytics(published_post_id=post.id, collected_at=post.published_at + timedelta(hours=24), view_count=100, like_count=4))
            await db.commit()
        response = await self.client.get('/analytics/review?window_hours=24')
        self.assertEqual(response.status_code, 200, response.text)
        review = response.json()
        self.assertTrue(review['observations'])
        self.assertTrue(review['ideas'])
        self.assertTrue(any('样本' in value for value in review['limitations']))
        self.assertTrue(any('因果' in value for value in review['limitations']))
        self.assertEqual(review['ideas'][0]['post_ids'], [str(post.id)])
        self.assertIn('生活', str(review))
        empty = (await self.client.get('/analytics/review', headers={'Authorization': 'Bearer other-key'})).json()
        self.assertEqual(empty['ideas'], [])
