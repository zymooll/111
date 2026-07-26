from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy import or_, select

from app.api.presenters import favorite_merchant_ids, present_item, present_merchants
from app.dependencies import DbSession, OptionalPrincipal
from app.models import MenuItem, Merchant
from app.schemas import CursorPage, MenuItemSummary, SearchResults, SearchSuggestion
from app.services.campuses import require_campus
from app.services.feed import (
    FeedQuery,
    RecommendationService,
    owns_snapshot,
    query_fingerprint,
    snapshot_key,
)
from app.services.profiles import recommendation_profile
from app.services.recommendations import fallback_reason
from app.services.snapshots import decode_cursor, encode_cursor

logger = logging.getLogger(__name__)

router = APIRouter(tags=["发现与搜索"])


def _actor(principal: object | None) -> tuple[str | None, str | None]:
    if principal is None:
        return None, None
    return principal.kind, principal.id


@router.get("/recommendations/feed", response_model=CursorPage[MenuItemSummary])
def recommendation_feed(
    request: Request,
    response: Response,
    db: DbSession,
    principal: OptionalPrincipal,
    campus_id: str,
    category_id: str | None = None,
    area_id: str | None = None,
    search: str | None = Query(default=None, max_length=100),
    max_price_cents: int | None = Query(default=None, ge=0),
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> CursorPage[MenuItemSummary]:
    """Serve a pre-ranked snapshot. This handler never calls the LLM.

    刻意是同步函数：函数体全是同步 SQLAlchemy 调用，交给 FastAPI 的线程池执行，事件循环
    才能腾出来跑后台增强 worker。写成 async 会让请求与后台任务互相饿死。

    游标携带快照 id，所以同一轮浏览始终读同一份排序；后台可能同时写入 AI 增强版，但只会
    被下一次全新的翻页起点命中，不会让当前这轮漏项或重项。
    """
    require_campus(db, campus_id)
    snapshot_id, offset = decode_cursor(cursor)
    if offset < 0:
        raise HTTPException(status_code=422, detail="游标无效")

    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(db, kind=kind, actor_id=actor_id, campus_id=campus_id)
    preferences = recommendation_profile(db, principal, campus_id=campus_id)

    preference_budget = preferences.get("budget_max_cents")
    effective_max_price = max_price_cents
    if effective_max_price is None and isinstance(preference_budget, int):
        effective_max_price = preference_budget

    query = FeedQuery(
        campus_id=campus_id,
        category_id=category_id,
        area_id=area_id,
        search=search,
        max_price_cents=effective_max_price,
    )
    service: RecommendationService = request.app.state.recommendations

    query_fp = query_fingerprint(query, effective_max_price=effective_max_price)
    snapshot = None
    cache_state = "miss"
    if snapshot_id:
        candidate = service.store.by_id(db, snapshot_id)
        if candidate is not None and owns_snapshot(
            candidate,
            campus_id=campus_id,
            actor_type=kind,
            actor_id=actor_id,
            query_fp=query_fp,
        ):
            snapshot, cache_state = candidate, "cursor"
        else:
            # 快照已被清理、不属于当前调用方、或筛选条件已经变了：一律不采信这个游标。
            # 位置保留下来让无限滚动能继续，但把降级情况写进响应头而不是悄悄发生。
            cache_state = "cursor-rebuilt"
            logger.info("Unusable feed cursor for campus %s; rebuilding", campus_id)

    if snapshot is None:
        key = snapshot_key(
            query,
            preferences,
            actor_type=kind,
            actor_id=actor_id,
            effective_max_price=effective_max_price,
            favorites=favorites,
        )
        outcome = service.acquire_snapshot(
            db, key=key, query=query, preferences=preferences, favorites=favorites
        )
        snapshot = outcome.snapshot
        if cache_state != "cursor-rebuilt":
            cache_state = outcome.cache_state
        service.schedule_enrichment(snapshot, preferences=preferences)

    page_ids = snapshot.slice(offset, limit)
    items = _load_in_order(db, campus_id, page_ids)
    next_offset = offset + len(page_ids)
    has_more = next_offset < len(snapshot.ranked_item_ids)

    # 用响应头暴露命中情况与排序来源：便于运维观察，又不改动响应体契约。
    response.headers["X-Recommendation-Source"] = snapshot.source
    response.headers["X-Recommendation-Cache"] = cache_state

    return CursorPage[MenuItemSummary](
        items=[
            present_item(
                item,
                merchant,
                favorites=favorites,
                reason=snapshot.reasons.get(item.id) or fallback_reason(item, preferences),
            )
            for item, merchant in items
        ],
        next_cursor=encode_cursor(snapshot.id, next_offset) if has_more else None,
        has_more=has_more,
    )


def _load_in_order(
    db: DbSession, campus_id: str, item_ids: list[str]
) -> list[tuple[MenuItem, Merchant]]:
    """Hydrate one page of snapshot ids, dropping anything delisted since it was built."""
    if not item_ids:
        return []
    rows = db.execute(
        select(MenuItem, Merchant)
        .join(Merchant, Merchant.id == MenuItem.merchant_id)
        .where(
            MenuItem.id.in_(item_ids),
            MenuItem.is_active.is_(True),
            Merchant.is_active.is_(True),
            MenuItem.campus_id == campus_id,
        )
    ).all()
    by_id = {item.id: (item, merchant) for item, merchant in rows}
    return [by_id[item_id] for item_id in item_ids if item_id in by_id]


@router.get("/search/suggestions", response_model=list[SearchSuggestion])
def search_suggestions(
    db: DbSession,
    q: Annotated[str, Query(min_length=1, max_length=100)],
    campus_id: str,
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
) -> list[SearchSuggestion]:
    require_campus(db, campus_id)
    keyword = f"%{q.strip()}%"
    item_query = (
        select(MenuItem, Merchant)
        .join(Merchant, Merchant.id == MenuItem.merchant_id)
        .where(
            MenuItem.is_active.is_(True),
            Merchant.is_active.is_(True),
            or_(MenuItem.name.like(keyword), Merchant.name.like(keyword)),
            Merchant.campus_id == campus_id,
            MenuItem.campus_id == campus_id,
        )
    )
    merchant_query = select(Merchant).where(
        Merchant.is_active.is_(True),
        or_(Merchant.name.like(keyword), Merchant.address.like(keyword)),
        Merchant.campus_id == campus_id,
    )
    suggestions = [
        SearchSuggestion(
            id=item.id,
            type="menu_item",
            title=item.name,
            subtitle=merchant.name,
            image_url=item.image_url,
        )
        for item, merchant in db.execute(
            item_query.order_by(MenuItem.rating_avg.desc()).limit(limit)
        ).all()
    ]
    remaining = max(0, limit - len(suggestions))
    if remaining:
        suggestions.extend(
            SearchSuggestion(
                id=merchant.id,
                type="merchant",
                title=merchant.name,
                subtitle=merchant.address,
            )
            for merchant in db.scalars(
                merchant_query.order_by(Merchant.name).limit(remaining)
            ).all()
        )
    return suggestions


@router.get("/search", response_model=SearchResults)
def search(
    db: DbSession,
    principal: OptionalPrincipal,
    q: Annotated[str, Query(min_length=1, max_length=100)],
    campus_id: str,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> SearchResults:
    require_campus(db, campus_id)
    keyword = f"%{q.strip()}%"
    item_query = (
        select(MenuItem, Merchant)
        .join(Merchant, Merchant.id == MenuItem.merchant_id)
        .where(
            MenuItem.is_active.is_(True),
            Merchant.is_active.is_(True),
            or_(MenuItem.name.like(keyword), MenuItem.description.like(keyword)),
            Merchant.campus_id == campus_id,
            MenuItem.campus_id == campus_id,
        )
    )
    merchant_query = select(Merchant).where(
        Merchant.is_active.is_(True),
        or_(Merchant.name.like(keyword), Merchant.address.like(keyword)),
        Merchant.campus_id == campus_id,
    )
    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(
        db, kind=kind, actor_id=actor_id, campus_id=campus_id
    )
    item_rows = db.execute(
        item_query.order_by(MenuItem.rating_avg.desc()).limit(limit)
    ).all()
    merchants = db.scalars(merchant_query.order_by(Merchant.name).limit(limit)).all()
    return SearchResults(
        menu_items=[
            present_item(item, merchant, favorites=favorites)
            for item, merchant in item_rows
        ],
        merchants=present_merchants(db, merchants, favorites=favorites),
    )
