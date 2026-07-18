from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select

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
    MenuItem,
    Merchant,
    Review,
    ReviewStatus,
    Tag,
)
from app.schemas import (
    CampusRead,
    CursorPage,
    MenuItemDetail,
    MenuItemSummary,
    MerchantRead,
    ReviewPage,
    TagRead,
    TreeNode,
)
from app.services.campuses import (
    require_area,
    require_campus,
    require_category,
    require_menu_item,
    require_merchant,
)
from app.services.hierarchy import area_with_descendants, category_with_descendants
from app.services.pagination import before_cursor, page_metadata
from app.services.profiles import recommendation_profile
from app.services.recommendations import fallback_reason


router = APIRouter(tags=["校园目录"])


def _tree(rows: list[object], *, category: bool = False) -> list[TreeNode]:
    nodes: dict[str, TreeNode] = {}
    for row in rows:
        nodes[row.id] = TreeNode(
            id=row.id,
            campus_id=row.campus_id,
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


def _preferences_for(
    db, principal: object | None, campus_id: str
) -> dict[str, object]:
    return recommendation_profile(db, principal, campus_id=campus_id)


@router.get("/campuses", response_model=list[CampusRead])
def campuses(db: DbSession) -> list[CampusRead]:
    rows = db.scalars(
        select(Campus).where(Campus.is_active.is_(True)).order_by(Campus.name)
    ).all()
    return [CampusRead.model_validate(row) for row in rows]


@router.get("/areas", response_model=list[TreeNode])
def areas(db: DbSession, campus_id: str) -> list[TreeNode]:
    require_campus(db, campus_id)
    query = select(CampusArea).where(CampusArea.campus_id == campus_id)
    rows = list(db.scalars(query.order_by(CampusArea.sort_order, CampusArea.name)).all())
    return _tree(rows)


@router.get("/categories", response_model=list[TreeNode])
def categories(db: DbSession, campus_id: str) -> list[TreeNode]:
    require_campus(db, campus_id)
    rows = list(
        db.scalars(
            select(Category)
            .where(Category.campus_id == campus_id)
            .order_by(Category.sort_order, Category.name)
        ).all()
    )
    return _tree(rows, category=True)


@router.get("/tags", response_model=list[TagRead])
def tags(db: DbSession, campus_id: str, kind: str | None = None) -> list[TagRead]:
    require_campus(db, campus_id)
    query = select(Tag).where(Tag.campus_id == campus_id)
    if kind:
        query = query.where(Tag.kind == kind)
    return [TagRead.model_validate(row) for row in db.scalars(query.order_by(Tag.name)).all()]


@router.get("/merchants", response_model=CursorPage[MerchantRead])
def merchants(
    db: DbSession,
    principal: OptionalPrincipal,
    campus_id: str,
    area_id: str | None = None,
    category_id: str | None = None,
    search: str | None = Query(default=None, max_length=100),
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> CursorPage[MerchantRead]:
    require_campus(db, campus_id)
    query = select(Merchant).where(
        Merchant.is_active.is_(True), Merchant.campus_id == campus_id
    )
    if area_id:
        require_area(db, campus_id, area_id)
        query = query.where(
            Merchant.area_id.in_(area_with_descendants(db, area_id, campus_id))
        )
    if category_id:
        require_category(db, campus_id, category_id)
        query = query.where(
            Merchant.category_id.in_(
                category_with_descendants(db, category_id, campus_id)
            )
        )
    if search:
        keyword = f"%{search.strip()}%"
        query = query.where(or_(Merchant.name.like(keyword), Merchant.address.like(keyword)))
    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(
        db, kind=kind, actor_id=actor_id, campus_id=campus_id
    )
    cursor_condition = before_cursor(Merchant.created_at, Merchant.id, cursor)
    if cursor_condition is not None:
        query = query.where(cursor_condition)
    rows = list(
        db.scalars(
            query.order_by(Merchant.created_at.desc(), Merchant.id.desc()).limit(limit + 1)
        ).all()
    )
    visible, next_cursor, has_more = page_metadata(rows, limit)
    return CursorPage(
        items=[present_merchant(db, merchant, favorites=favorites) for merchant in visible],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/menu-items/{menu_item_id}", response_model=MenuItemDetail)
def menu_item_detail(
    menu_item_id: str,
    db: DbSession,
    principal: OptionalPrincipal,
    campus_id: str,
) -> MenuItemDetail:
    require_campus(db, campus_id)
    item = require_menu_item(db, campus_id, menu_item_id, active=True)
    merchant = require_merchant(db, campus_id, item.merchant_id, active=True)
    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(
        db, kind=kind, actor_id=actor_id, campus_id=campus_id
    )
    preferences = _preferences_for(db, principal, campus_id)
    summary = present_item(
        item,
        merchant,
        favorites=favorites,
        reason=fallback_reason(item, preferences),
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
    campus_id: str,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> ReviewPage:
    require_campus(db, campus_id)
    require_menu_item(db, campus_id, menu_item_id, active=True)
    conditions = (
        Review.campus_id == campus_id,
        Review.menu_item_id == menu_item_id,
        Review.status == ReviewStatus.PUBLISHED,
        Review.deleted_at.is_(None),
    )
    total = db.scalar(select(func.count(Review.id)).where(*conditions)) or 0
    query = select(Review).where(*conditions)
    cursor_condition = before_cursor(Review.created_at, Review.id, cursor)
    if cursor_condition is not None:
        query = query.where(cursor_condition)
    rows = list(
        db.scalars(
            query.order_by(Review.created_at.desc(), Review.id.desc()).limit(limit + 1)
        ).all()
    )
    visible, next_cursor, has_more = page_metadata(rows, limit)
    return ReviewPage(
        items=[present_review(db, row) for row in visible],
        total=total,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/merchants/{merchant_id}", response_model=MerchantRead)
def merchant_detail(
    merchant_id: str,
    db: DbSession,
    principal: OptionalPrincipal,
    campus_id: str,
) -> MerchantRead:
    require_campus(db, campus_id)
    merchant = require_merchant(db, campus_id, merchant_id, active=True)
    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(
        db, kind=kind, actor_id=actor_id, campus_id=campus_id
    )
    return present_merchant(db, merchant, favorites=favorites)


@router.get("/merchants/{merchant_id}/menu", response_model=CursorPage[MenuItemSummary])
def merchant_menu(
    merchant_id: str,
    db: DbSession,
    principal: OptionalPrincipal,
    campus_id: str,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> CursorPage[MenuItemSummary]:
    require_campus(db, campus_id)
    merchant = require_merchant(db, campus_id, merchant_id, active=True)
    kind, actor_id = _actor(principal)
    favorites = favorite_merchant_ids(
        db, kind=kind, actor_id=actor_id, campus_id=campus_id
    )
    query = select(MenuItem).where(
        MenuItem.campus_id == campus_id,
        MenuItem.merchant_id == merchant_id,
        MenuItem.is_active.is_(True),
    )
    cursor_condition = before_cursor(MenuItem.created_at, MenuItem.id, cursor)
    if cursor_condition is not None:
        query = query.where(cursor_condition)
    rows = list(
        db.scalars(
            query.order_by(MenuItem.created_at.desc(), MenuItem.id.desc()).limit(limit + 1)
        ).all()
    )
    visible, next_cursor, has_more = page_metadata(rows, limit)
    return CursorPage(
        items=[present_item(item, merchant, favorites=favorites) for item in visible],
        next_cursor=next_cursor,
        has_more=has_more,
    )
