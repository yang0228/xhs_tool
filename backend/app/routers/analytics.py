from __future__ import annotations
import csv
import io
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy import select, text, tuple_
from ..database import get_db
from ..dependencies import get_current_user
from ..models.post_analytics import PostAnalytics
from ..models.published_post import PublishedPost
from ..models.user import User
from ..schemas.analytics import (
    AnalyticsImportError, AnalyticsImportRequest, AnalyticsImportResponse, AnalyticsImportRow,
    AnalyticsInsightGroup, AnalyticsInsightsResponse, AnalyticsResponse,
    AnalyticsReviewIdea, AnalyticsReviewResponse, PostAnalyticsCreate,
    PostAnalyticsItem, PostAnalyticsSummary,
)

router = APIRouter(prefix='/analytics', tags=['analytics'])
COUNT_FIELDS = ('view_count', 'like_count', 'comment_count', 'share_count', 'collect_count')


async def lock_posts(db, post_ids):
    # All metric writers take these locks in order, including CSV confirmation.
    for post_id in sorted(set(post_ids), key=str):
        await db.execute(text('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))'),
                         {'key': 'analytics:' + str(post_id)})


def metric_counts(value):
    return tuple(getattr(value, field) for field in COUNT_FIELDS)


def observation_error(collected_at, published_at, now):
    if collected_at < published_at:
        return 'Observation time cannot precede publication'
    if collected_at > now:
        return 'Observation time cannot be in the future'
    return None


@router.get('/posts', response_model=AnalyticsResponse)
async def get_posts_analytics(days: int = Query(30, ge=1, le=365), user: User = Depends(get_current_user), db=Depends(get_db)):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    posts = (await db.execute(select(PublishedPost).where(PublishedPost.user_id == user.id).order_by(PublishedPost.published_at.desc()))).scalars().all()
    summaries = []
    for post in posts:
        history = (await db.execute(select(PostAnalytics).where(PostAnalytics.published_post_id == post.id, PostAnalytics.collected_at >= cutoff).order_by(PostAnalytics.collected_at.desc()))).scalars().all()
        items = [PostAnalyticsItem.model_validate(h) for h in history]
        summaries.append(PostAnalyticsSummary(post_id=post.id, title_hash=None, xhs_post_url=post.xhs_post_url, published_at=post.published_at, latest=items[0] if items else None, history=items, topic_tags=post.topic_tags, template_id=post.template_id))
    return AnalyticsResponse(posts=summaries)


@router.post('/posts/{post_id}', response_model=PostAnalyticsItem, status_code=201)
async def record_metrics(post_id: UUID, body: PostAnalyticsCreate, user: User = Depends(get_current_user), db=Depends(get_db)):
    post = await db.scalar(select(PublishedPost).where(PublishedPost.id == post_id, PublishedPost.user_id == user.id))
    if not post:
        raise HTTPException(404, 'Published post not found')
    now = datetime.now(timezone.utc)
    collected_at = (body.collected_at or now).astimezone(timezone.utc)
    error = observation_error(collected_at, post.published_at, now)
    if error:
        raise HTTPException(422, error)
    await lock_posts(db, [post_id])
    existing = (await db.execute(select(PostAnalytics).where(PostAnalytics.published_post_id == post_id, PostAnalytics.collected_at == collected_at).order_by(PostAnalytics.id))).scalars().all()
    if existing:
        if any(metric_counts(sample) != metric_counts(body) for sample in existing):
            raise HTTPException(409, 'Different metrics already exist at this observation time')
        await db.commit()
        return existing[0]
    metrics = PostAnalytics(published_post_id=post_id, collected_at=collected_at, **body.model_dump(exclude={'collected_at'}))
    db.add(metrics)
    await db.commit()
    await db.refresh(metrics)
    return metrics


def parse_import(csv_text, posts):
    rows, errors = [], []
    by_id = {post.id: post for post in posts}
    by_url = defaultdict(list)
    for post in posts:
        if post.xhs_post_url:
            by_url[post.xhs_post_url].append(post)
    reader = csv.reader(io.StringIO(csv_text.lstrip('\ufeff'), newline=''), strict=True)
    required = {'collected_at', *COUNT_FIELDS}
    allowed = required | {'post_id', 'xhs_post_url'}
    now = datetime.now(timezone.utc)
    try:
        header = [value.strip() for value in next(reader, [])]
        if (not required.issubset(header) or not set(header) & {'post_id', 'xhs_post_url'}
                or len(set(header)) != len(header) or not set(header).issubset(allowed)):
            return [], [AnalyticsImportError(row=1, message='CSV requires post_id or xhs_post_url, collected_at and all five count columns')]
        for number, values in enumerate(reader, start=2):
            if number > 501:
                errors.append(AnalyticsImportError(row=number, message='CSV supports at most 500 rows'))
                break
            try:
                if len(values) != len(header):
                    raise ValueError('Row does not match CSV columns')
                value = dict(zip(header, (item.strip() for item in values)))
                post_id, url = value.get('post_id'), value.get('xhs_post_url')
                if post_id:
                    post = by_id.get(UUID(post_id))
                    if post is None or (url and post.xhs_post_url != url):
                        raise ValueError('Published post not found or URL does not match')
                else:
                    matches = by_url.get(url, [])
                    if len(matches) != 1:
                        raise ValueError('Published post URL is unknown or ambiguous')
                    post = matches[0]
                if not all(re.fullmatch(r'[0-9]+', value[field]) for field in COUNT_FIELDS):
                    raise ValueError('All counts must be nonnegative integers')
                collected_at = datetime.fromisoformat(value['collected_at'].replace('Z', '+00:00'))
                metrics = PostAnalyticsCreate(collected_at=collected_at, **{field: int(value[field]) for field in COUNT_FIELDS})
                error = observation_error(metrics.collected_at, post.published_at, now)
                if error:
                    raise ValueError(error)
                rows.append(AnalyticsImportRow(row=number, post_id=post.id, xhs_post_url=post.xhs_post_url,
                                               **metrics.model_dump(exclude={'collected_at'}), collected_at=metrics.collected_at.astimezone(timezone.utc)))
            except (ValueError, OverflowError) as exc:
                message = str(exc)
                if isinstance(exc, ValidationError):
                    issue = exc.errors()[0]
                    message = str(issue['loc'][0]) + ': ' + issue['msg']
                errors.append(AnalyticsImportError(row=number, message=message))
    except csv.Error as exc:
        errors.append(AnalyticsImportError(row=max(reader.line_num, 1), message='Invalid CSV: ' + str(exc)))
    return rows, errors


@router.post('/import', response_model=AnalyticsImportResponse)
async def import_metrics(body: AnalyticsImportRequest, user: User = Depends(get_current_user), db=Depends(get_db)):
    posts = (await db.execute(select(PublishedPost).where(PublishedPost.user_id == user.id))).scalars().all()
    rows, errors = parse_import(body.csv_text, posts)
    result = AnalyticsImportResponse(rows=rows, errors=errors)
    if body.confirm and not errors:
        await lock_posts(db, [row.post_id for row in rows])
    keys = {(row.post_id, row.collected_at) for row in rows}
    history = defaultdict(list)
    if keys:
        samples = (await db.execute(select(PostAnalytics).where(tuple_(PostAnalytics.published_post_id, PostAnalytics.collected_at).in_(keys)))).scalars().all()
        for sample in samples:
            history[(sample.published_post_id, sample.collected_at)].append(sample)
    pending = {}
    for row in rows:
        key = (row.post_id, row.collected_at)
        previous = history[key] + ([pending[key]] if key in pending else [])
        if any(metric_counts(sample) != metric_counts(row) for sample in previous):
            result.errors.append(AnalyticsImportError(row=row.row, message='Different metrics already exist at this observation time'))
        elif previous:
            result.skipped += 1
        else:
            pending[key] = row
    if body.confirm:
        if result.errors:
            raise HTTPException(422, jsonable_encoder(result))
        db.add_all([PostAnalytics(published_post_id=row.post_id, **row.model_dump(exclude={'row', 'post_id', 'xhs_post_url'})) for row in pending.values()])
        await db.commit()
        result.imported = len(pending)
    return result


async def build_insights(db, user_id, window_hours):
    if window_hours not in (24, 72):
        raise HTTPException(422, 'window_hours must be 24 or 72')
    posts = (await db.execute(select(PublishedPost).where(PublishedPost.user_id == user_id).order_by(PublishedPost.id))).scalars().all()
    samples = (await db.execute(select(PostAnalytics, PublishedPost.published_at).join(PublishedPost, PostAnalytics.published_post_id == PublishedPost.id).where(
        PublishedPost.user_id == user_id,
        PostAnalytics.collected_at >= PublishedPost.published_at + timedelta(hours=window_hours - 3),
        PostAnalytics.collected_at <= PublishedPost.published_at + timedelta(hours=window_hours + 3),
    ))).all()
    nearest = {}
    for sample, published_at in samples:
        age = (sample.collected_at - published_at).total_seconds() / 3600
        rank = (abs(age - window_hours), sample.collected_at, str(sample.id))
        previous = nearest.get(sample.published_post_id)
        if previous is None or rank < previous[0]:
            nearest[sample.published_post_id] = (rank, sample, age)
    groups = defaultdict(list)
    for post in posts:
        for tag in set(post.topic_tags):
            groups[('topic', tag)].append(post)
        groups[('template', post.template_id or 'none')].append(post)
    result = []
    for (kind, name), members in sorted(groups.items()):
        observed = [nearest[post.id] for post in members if post.id in nearest]
        count = len(observed)
        views = sum(sample.view_count for _, sample, _ in observed)
        interactions = sum(sum(metric_counts(sample)[1:]) for _, sample, _ in observed)
        result.append(AnalyticsInsightGroup(kind=kind, name=name, sample_count=count, total_posts=len(members), missing_count=len(members) - count,
                                           average_views=views / count if count else None,
                                           average_interactions=interactions / count if count else None,
                                           interaction_rate=interactions / views if views else None,
                                           post_ids=[sample.published_post_id for _, sample, _ in observed],
                                           observation_ages_hours=[age for _, _, age in observed]))
    return AnalyticsInsightsResponse(window_hours=window_hours, groups=result)


@router.get('/insights', response_model=AnalyticsInsightsResponse)
async def get_insights(window_hours: int = Query(24), user: User = Depends(get_current_user), db=Depends(get_db)):
    return await build_insights(db, user.id, window_hours)


@router.get('/review', response_model=AnalyticsReviewResponse)
async def review_metrics(window_hours: int = Query(24), user: User = Depends(get_current_user), db=Depends(get_db)):
    insights = await build_insights(db, user.id, window_hours)
    observations, ideas = [], []
    for group in insights.groups:
        label = ('主题' if group.kind == 'topic' else '模板') + '「' + group.name + '」'
        if not group.sample_count:
            observations.append(f'{label}有 {group.total_posts} 篇内容，缺少 {window_hours}±3 小时的观察数据。')
            continue
        observations.append(f'{label}有 {group.sample_count}/{group.total_posts} 篇可比较样本，平均浏览 {group.average_views:g}，平均互动 {group.average_interactions:g}。')
        ideas.append(AnalyticsReviewIdea(title=f'继续尝试{label}', reason=f'已有 {group.sample_count} 篇在 {window_hours}±3 小时窗口的观察记录，可再做一篇并在相近时点记录指标，检验是否重复出现相似表现。', post_ids=group.post_ids))
    limitations = ['这些观察不能说明主题或模板导致指标变化，不作因果归因。', '同一内容可以属于多个主题，主题组的样本数不能直接相加。', '仅比较指定时点前后 3 小时内的累计数据；缺数据不等于零表现。']
    if any(group.sample_count < 3 for group in insights.groups) or not insights.groups:
        limitations.append('样本不足：至少一个分组少于 3 篇可比较内容，建议只作为下一步尝试的线索。')
    return AnalyticsReviewResponse(observations=observations, ideas=ideas, limitations=limitations)


@router.post('/refresh')
async def refresh_analytics(user: User = Depends(get_current_user)):
    raise HTTPException(501, 'Automatic analytics collection is not supported. Enter metrics manually.')
