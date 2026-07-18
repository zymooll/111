from __future__ import annotations

import base64
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import and_, or_, select

from app.api.presenters import favorite_merchant_ids, present_item, present_merchant
from app.dependencies import DbSession, OptionalPrincipal
from app.models import MenuItem, Merchant
from app.schemas import CursorPage, SearchResults, SearchSuggestion
from app.services.campuses import (
    require_area,
    require_campus,
    require_category,
)
from app.services.deepseek import DeepSeekClient
from app.services.hierarchy import area_with_descendants, category_with_descendants
from app.services.profiles import recommendation_profile
from app.services.recommendations import deterministic_rank, fallback_reason


router = APIRouter(tags=["发现与搜索"])


def _actor(principal: object | None) -> tuple[str | None, str | None]:
    if principal is None:
        return None, None
    return principal.kind, principal.id


def _decode_cursor(value: str | None) -> int:
    if not value:
        return 0
    try:
        return max(0, int(base64.urlsafe_b64decode(value + "==").decode()))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=422, detail="游标无效")


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).rstrip(b"=").decode()


@router.get("/recommendations/feed", response_model=CursorPage)
async def recommendation_feed(
    request: Request,
    db: DbSession,
    principal: OptionalPrincipal,
    campus_id: str,
    category_id: str | None = None,
    area_id: str | None = None,
    search: str | None = Query(default=None, max_length=100),
    max_price_cents: int | None = Query(default=None, ge=0),
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> CursorPage:
    require_campus(db, campus_id)
    offset = _decode_cursor(cursor)
    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(
        db, kind=kind, actor_id=actor_id, campus_id=campus_id
    )
    preferences = recommendation_profile(db, principal, campus_id=campus_id)

    conditions = [
        MenuItem.is_active.is_(True),
        Merchant.is_active.is_(True),
        Merchant.campus_id == campus_id,
        MenuItem.campus_id == campus_id,
    ]
    if category_id:
        require_category(db, campus_id, category_id)
        category_ids = category_with_descendants(db, category_id, campus_id)
        conditions.append(
            or_(
                MenuItem.category_id.in_(category_ids),
                Merchant.category_id.in_(category_ids),
            )
        )
    if area_id:
        require_area(db, campus_id, area_id)
        conditions.append(
            Merchant.area_id.in_(area_with_descendants(db, area_id, campus_id))
        )
    preference_budget = preferences.get("budget_max_cents")
    effective_max_price = max_price_cents
    if effective_max_price is None and isinstance(preference_budget, int):
        effective_max_price = preference_budget
    if effective_max_price is not None:
        conditions.append(MenuItem.price_cents <= effective_max_price)
    if search:
        keyword = f"%{search.strip()}%"
        conditions.append(or_(MenuItem.name.like(keyword), Merchant.name.like(keyword)))

    pairs = list(
        db.execute(
            select(MenuItem, Merchant)
            .join(Merchant, Merchant.id == MenuItem.merchant_id)
            .where(and_(*conditions))
            .order_by(
                MenuItem.rating_avg.desc(),
                MenuItem.review_count.desc(),
                MenuItem.id,
            )
        ).all()
    )
    raw_avoided = preferences.get("avoid", [])
    avoided = (
        {str(value) for value in raw_avoided}
        if isinstance(raw_avoided, list)
        else set()
    )
    if avoided:
        pairs = [pair for pair in pairs if not avoided.intersection(pair[0].tags)]
    pairs = deterministic_rank(pairs, preferences, favorites)

    candidates = [
        {
            "id": item.id,
            "name": item.name,
            "price_cents": item.price_cents,
            "rating": item.rating_avg,
            "tags": item.tags,
            "merchant": merchant.name,
        }
        for item, merchant in pairs[:30]
    ]
    ai_reasons = await DeepSeekClient(request.app.state.settings).rerank(
        candidates, preferences
    )
    if ai_reasons:
        order = {item_id: index for index, item_id in enumerate(ai_reasons)}
        pairs.sort(key=lambda pair: order.get(pair[0].id, len(order)))

    selected = pairs[offset : offset + limit]
    items = [
        present_item(
            item,
            merchant,
            favorites=favorites,
            reason=(ai_reasons or {}).get(item.id)
            or fallback_reason(item, preferences),
        )
        for item, merchant in selected
    ]
    next_offset = offset + len(selected)
    has_more = next_offset < len(pairs)
    return CursorPage(
        items=items,
        next_cursor=_encode_cursor(next_offset) if has_more else None,
        has_more=has_more,
    )


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
        merchants=[
            present_merchant(db, merchant, favorites=favorites)
            for merchant in merchants
        ],
    )
