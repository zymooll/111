from __future__ import annotations

import base64
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import and_, func, or_, select

from app.api.presenters import (
    favorite_merchant_ids,
    present_item,
    present_merchant,
    present_review,
)
from app.dependencies import DbSession, OptionalPrincipal
from app.models import (
    Campus,
    CampusArea,
    Category,
    Favorite,
    MenuItem,
    Merchant,
    Review,
    ReviewStatus,
    Tag,
    UserProfile,
)
from app.schemas import (
    CampusRead,
    CursorPage,
    MenuItemDetail,
    MenuItemSummary,
    MerchantRead,
    ReviewPage,
    SearchResults,
    SearchSuggestion,
    TagRead,
    TreeNode,
)
from app.services.deepseek import DeepSeekClient
from app.services.hierarchy import area_with_descendants, category_with_descendants


router = APIRouter(tags=["发现与餐饮"])


def _tree(rows: list[object], *, category: bool = False) -> list[TreeNode]:
    nodes: dict[str, TreeNode] = {}
    for row in rows:
        nodes[row.id] = TreeNode(
            id=row.id,
            name=row.name,
            parent_id=row.parent_id,
            level=None if category else row.level,
            icon=getattr(row, "icon", None),
        )
    roots: list[TreeNode] = []
    for row in rows:
        node = nodes[row.id]
        if row.parent_id and row.parent_id in nodes:
            nodes[row.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


def _actor(principal: object | None) -> tuple[str | None, str | None]:
    if principal is None:
        return None, None
    return principal.kind, principal.id


def _preferences_for(db, principal: object | None) -> dict[str, object]:
    if principal and principal.is_user:
        profile = db.scalar(select(UserProfile).where(UserProfile.user_id == principal.id))
        return dict(profile.preferences or {}) if profile else {}
    if principal and principal.is_guest:
        from app.models import GuestSession

        guest = db.get(GuestSession, principal.id)
        return dict(guest.preferences or {}) if guest else {}
    return {}


def _decode_cursor(value: str | None) -> int:
    if not value:
        return 0
    try:
        return max(0, int(base64.urlsafe_b64decode(value + "==").decode()))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=422, detail="游标无效")


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).rstrip(b"=").decode()


def _fallback_reason(item: MenuItem, preferences: dict[str, object]) -> str:
    raw_tastes = preferences.get("tastes", [])
    tastes = [str(value) for value in raw_tastes] if isinstance(raw_tastes, list) else []
    matched = [tag for tag in item.tags if tag in tastes]
    if matched:
        return f"符合你偏爱的{'、'.join(matched[:2])}口味"
    if item.rating_avg >= 4.8:
        return "校园高分口碑菜品，值得一试"
    if item.review_count >= 20:
        return "近期同学评价较多，口碑稳定"
    return "结合价格、评分与校园热度为你推荐"


def _deterministic_rank(
    pairs: list[tuple[MenuItem, Merchant]],
    preferences: dict[str, object],
    favorites: set[str],
) -> list[tuple[MenuItem, Merchant]]:
    raw_tastes = preferences.get("tastes", [])
    raw_areas = preferences.get("frequent_area_ids", [])
    tastes = {str(value) for value in raw_tastes} if isinstance(raw_tastes, list) else set()
    frequent_areas = (
        {str(value) for value in raw_areas} if isinstance(raw_areas, list) else set()
    )

    def score(pair: tuple[MenuItem, Merchant]) -> float:
        item, merchant = pair
        taste_matches = len(tastes.intersection(item.tags))
        return (
            item.rating_avg * 10
            + min(item.review_count, 50) * 0.08
            + taste_matches * 5
            + (2 if merchant.area_id in frequent_areas else 0)
            + (1 if merchant.id in favorites else 0)
        )

    remaining = sorted(pairs, key=score, reverse=True)
    ranked: list[tuple[MenuItem, Merchant]] = []
    merchant_uses: dict[str, int] = {}
    while remaining:
        best_index = max(
            range(len(remaining)),
            key=lambda index: score(remaining[index])
            - merchant_uses.get(remaining[index][1].id, 0) * 3,
        )
        selected = remaining.pop(best_index)
        ranked.append(selected)
        merchant_uses[selected[1].id] = merchant_uses.get(selected[1].id, 0) + 1
    return ranked


@router.get("/campuses", response_model=list[CampusRead])
def campuses(db: DbSession) -> list[CampusRead]:
    rows = db.scalars(
        select(Campus).where(Campus.is_active.is_(True)).order_by(Campus.name)
    ).all()
    return [CampusRead.model_validate(row) for row in rows]


@router.get("/areas", response_model=list[TreeNode])
def areas(db: DbSession, campus_id: str | None = None) -> list[TreeNode]:
    query = select(CampusArea)
    if campus_id:
        query = query.where(CampusArea.campus_id == campus_id)
    rows = list(db.scalars(query.order_by(CampusArea.sort_order, CampusArea.name)).all())
    return _tree(rows)


@router.get("/categories", response_model=list[TreeNode])
def categories(db: DbSession) -> list[TreeNode]:
    rows = list(db.scalars(select(Category).order_by(Category.sort_order, Category.name)).all())
    return _tree(rows, category=True)


@router.get("/tags", response_model=list[TagRead])
def tags(db: DbSession, kind: str | None = None) -> list[TagRead]:
    query = select(Tag)
    if kind:
        query = query.where(Tag.kind == kind)
    return [TagRead.model_validate(row) for row in db.scalars(query.order_by(Tag.name)).all()]


@router.get("/recommendations/feed", response_model=CursorPage)
async def recommendation_feed(
    request: Request,
    db: DbSession,
    principal: OptionalPrincipal,
    campus_id: str | None = None,
    category_id: str | None = None,
    area_id: str | None = None,
    search: str | None = Query(default=None, max_length=100),
    max_price_cents: int | None = Query(default=None, ge=0),
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> CursorPage:
    offset = _decode_cursor(cursor)
    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(db, kind=kind, actor_id=actor_id)
    preferences = _preferences_for(db, principal)

    conditions = [MenuItem.is_active.is_(True), Merchant.is_active.is_(True)]
    if campus_id:
        conditions.append(Merchant.campus_id == campus_id)
    if category_id:
        category_ids = category_with_descendants(db, category_id)
        conditions.append(
            or_(MenuItem.category_id.in_(category_ids), Merchant.category_id.in_(category_ids))
        )
    if area_id:
        conditions.append(Merchant.area_id.in_(area_with_descendants(db, area_id)))
    preference_budget = preferences.get("budget_max_cents")
    effective_max_price = max_price_cents
    if effective_max_price is None and isinstance(preference_budget, int):
        effective_max_price = preference_budget
    if effective_max_price is not None:
        conditions.append(MenuItem.price_cents <= effective_max_price)
    if search:
        keyword = f"%{search.strip()}%"
        conditions.append(or_(MenuItem.name.like(keyword), Merchant.name.like(keyword)))

    pairs = list(db.execute(
        select(MenuItem, Merchant)
        .join(Merchant, Merchant.id == MenuItem.merchant_id)
        .where(and_(*conditions))
        .order_by(MenuItem.rating_avg.desc(), MenuItem.review_count.desc(), MenuItem.id)
    ).all())
    raw_avoided = preferences.get("avoid", [])
    avoided = {str(value) for value in raw_avoided} if isinstance(raw_avoided, list) else set()
    if avoided:
        pairs = [pair for pair in pairs if not avoided.intersection(pair[0].tags)]
    pairs = _deterministic_rank(pairs, preferences, favorites)

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
    ai_reasons = await DeepSeekClient(request.app.state.settings).rerank(candidates, preferences)
    if ai_reasons:
        order = {item_id: index for index, item_id in enumerate(ai_reasons)}
        pairs.sort(key=lambda pair: order.get(pair[0].id, len(order)))

    selected = pairs[offset : offset + limit]
    items = [
        present_item(
            item,
            merchant,
            favorites=favorites,
            reason=(ai_reasons or {}).get(item.id) or _fallback_reason(item, preferences),
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
    campus_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
) -> list[SearchSuggestion]:
    keyword = f"%{q.strip()}%"
    item_query = (
        select(MenuItem, Merchant)
        .join(Merchant, Merchant.id == MenuItem.merchant_id)
        .where(
            MenuItem.is_active.is_(True),
            Merchant.is_active.is_(True),
            or_(MenuItem.name.like(keyword), Merchant.name.like(keyword)),
        )
    )
    merchant_query = select(Merchant).where(
        Merchant.is_active.is_(True),
        or_(Merchant.name.like(keyword), Merchant.address.like(keyword)),
    )
    if campus_id:
        item_query = item_query.where(Merchant.campus_id == campus_id)
        merchant_query = merchant_query.where(Merchant.campus_id == campus_id)
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
    campus_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> SearchResults:
    keyword = f"%{q.strip()}%"
    item_query = (
        select(MenuItem, Merchant)
        .join(Merchant, Merchant.id == MenuItem.merchant_id)
        .where(
            MenuItem.is_active.is_(True),
            Merchant.is_active.is_(True),
            or_(MenuItem.name.like(keyword), MenuItem.description.like(keyword)),
        )
    )
    merchant_query = select(Merchant).where(
        Merchant.is_active.is_(True),
        or_(Merchant.name.like(keyword), Merchant.address.like(keyword)),
    )
    if campus_id:
        item_query = item_query.where(Merchant.campus_id == campus_id)
        merchant_query = merchant_query.where(Merchant.campus_id == campus_id)
    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(db, kind=kind, actor_id=actor_id)
    item_rows = db.execute(
        item_query.order_by(MenuItem.rating_avg.desc()).limit(limit)
    ).all()
    merchants = db.scalars(merchant_query.order_by(Merchant.name).limit(limit)).all()
    return SearchResults(
        menu_items=[present_item(item, merchant, favorites=favorites) for item, merchant in item_rows],
        merchants=[present_merchant(db, merchant, favorites=favorites) for merchant in merchants],
    )


@router.get("/merchants", response_model=list[MerchantRead])
def merchants(
    db: DbSession,
    principal: OptionalPrincipal,
    campus_id: str | None = None,
    area_id: str | None = None,
    category_id: str | None = None,
    search: str | None = Query(default=None, max_length=100),
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[MerchantRead]:
    query = select(Merchant).where(Merchant.is_active.is_(True))
    if campus_id:
        query = query.where(Merchant.campus_id == campus_id)
    if area_id:
        query = query.where(Merchant.area_id.in_(area_with_descendants(db, area_id)))
    if category_id:
        query = query.where(Merchant.category_id.in_(category_with_descendants(db, category_id)))
    if search:
        keyword = f"%{search.strip()}%"
        query = query.where(or_(Merchant.name.like(keyword), Merchant.address.like(keyword)))
    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(db, kind=kind, actor_id=actor_id)
    rows = db.scalars(query.order_by(Merchant.name).limit(limit)).all()
    return [present_merchant(db, merchant, favorites=favorites) for merchant in rows]


@router.get("/menu-items/{menu_item_id}", response_model=MenuItemDetail)
def menu_item_detail(
    menu_item_id: str,
    db: DbSession,
    principal: OptionalPrincipal,
) -> MenuItemDetail:
    item = db.get(MenuItem, menu_item_id)
    if item is None or not item.is_active:
        raise HTTPException(status_code=404, detail="菜品不存在或已下架")
    merchant = db.get(Merchant, item.merchant_id)
    if merchant is None or not merchant.is_active:
        raise HTTPException(status_code=404, detail="商家不存在或已下架")
    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(db, kind=kind, actor_id=actor_id)
    preferences = _preferences_for(db, principal)
    summary = present_item(
        item,
        merchant,
        favorites=favorites,
        reason=_fallback_reason(item, preferences),
    )
    counts = dict(
        db.execute(
            select(Review.rating, func.count(Review.id))
            .where(
                Review.menu_item_id == item.id,
                Review.status == ReviewStatus.PUBLISHED,
                Review.deleted_at.is_(None),
            )
            .group_by(Review.rating)
        ).all()
    )
    distribution = {str(rating): int(counts.get(rating, 0)) for rating in range(1, 6)}
    return MenuItemDetail(
        **summary.model_dump(),
        merchant=present_merchant(db, merchant, favorites=favorites),
        rating_distribution=distribution,
    )


@router.get("/menu-items/{menu_item_id}/reviews", response_model=ReviewPage)
def menu_item_reviews(
    menu_item_id: str,
    db: DbSession,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> ReviewPage:
    conditions = (
        Review.menu_item_id == menu_item_id,
        Review.status == ReviewStatus.PUBLISHED,
        Review.deleted_at.is_(None),
    )
    total = db.scalar(select(func.count(Review.id)).where(*conditions)) or 0
    rows = db.scalars(
        select(Review)
        .where(*conditions)
        .order_by(Review.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return ReviewPage(items=[present_review(db, row) for row in rows], total=total)


@router.get("/merchants/{merchant_id}", response_model=MerchantRead)
def merchant_detail(
    merchant_id: str,
    db: DbSession,
    principal: OptionalPrincipal,
) -> MerchantRead:
    merchant = db.get(Merchant, merchant_id)
    if merchant is None or not merchant.is_active:
        raise HTTPException(status_code=404, detail="商家不存在或已下架")
    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(db, kind=kind, actor_id=actor_id)
    return present_merchant(db, merchant, favorites=favorites)


@router.get("/merchants/{merchant_id}/menu", response_model=list[MenuItemSummary])
def merchant_menu(
    merchant_id: str,
    db: DbSession,
    principal: OptionalPrincipal,
) -> list[MenuItemSummary]:
    merchant = db.get(Merchant, merchant_id)
    if merchant is None or not merchant.is_active:
        raise HTTPException(status_code=404, detail="商家不存在或已下架")
    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(db, kind=kind, actor_id=actor_id)
    rows = db.scalars(
        select(MenuItem)
        .where(MenuItem.merchant_id == merchant_id, MenuItem.is_active.is_(True))
        .order_by(MenuItem.rating_avg.desc())
    ).all()
    return [present_item(item, merchant, favorites=favorites) for item in rows]
