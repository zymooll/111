from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.presenters import present_merchant
from app.dependencies import DbSession, PrincipalRequired
from app.models import Favorite, Merchant
from app.schemas import CursorPage, FavoriteRead, Message
from app.services.campuses import require_campus, require_merchant
from app.services.pagination import before_cursor, encode_cursor


router = APIRouter(tags=["收藏"])


def _favorite_query(principal: object, campus_id: str, merchant_id: str):
    actor_condition = (
        Favorite.user_id == principal.id
        if principal.is_user
        else Favorite.guest_id == principal.id
    )
    return select(Favorite).where(
        actor_condition,
        Favorite.campus_id == campus_id,
        Favorite.merchant_id == merchant_id,
    )


@router.put("/favorites/merchants/{merchant_id}", response_model=Message)
def favorite_merchant(
    merchant_id: str,
    db: DbSession,
    principal: PrincipalRequired,
    campus_id: str,
) -> Message:
    require_campus(db, campus_id)
    require_merchant(db, campus_id, merchant_id, active=True)
    existing = db.scalar(_favorite_query(principal, campus_id, merchant_id))
    if existing is None:
        favorite = Favorite(campus_id=campus_id, merchant_id=merchant_id)
        if principal.is_user:
            favorite.user_id = principal.id
        else:
            favorite.guest_id = principal.id
        db.add(favorite)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    return Message(message="已收藏")


@router.delete("/favorites/merchants/{merchant_id}", response_model=Message)
def unfavorite_merchant(
    merchant_id: str,
    db: DbSession,
    principal: PrincipalRequired,
    campus_id: str,
) -> Message:
    require_campus(db, campus_id)
    favorite = db.scalar(_favorite_query(principal, campus_id, merchant_id))
    if favorite is not None:
        db.delete(favorite)
        db.commit()
    return Message(message="已取消收藏")


@router.get("/me/favorites", response_model=CursorPage[FavoriteRead])
def my_favorites(
    db: DbSession,
    principal: PrincipalRequired,
    campus_id: str,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> CursorPage[FavoriteRead]:
    require_campus(db, campus_id)
    column = Favorite.user_id if principal.is_user else Favorite.guest_id
    query = (
        select(Favorite, Merchant)
        .join(Merchant, Merchant.id == Favorite.merchant_id)
        .where(
            column == principal.id,
            Favorite.campus_id == campus_id,
            Merchant.campus_id == campus_id,
        )
    )
    cursor_condition = before_cursor(Favorite.created_at, Favorite.id, cursor)
    if cursor_condition is not None:
        query = query.where(cursor_condition)
    rows = list(
        db.execute(
            query.order_by(Favorite.created_at.desc(), Favorite.id.desc()).limit(limit + 1)
        ).all()
    )
    has_more = len(rows) > limit
    visible = rows[:limit]
    next_cursor = (
        encode_cursor(visible[-1][0].created_at, visible[-1][0].id)
        if has_more and visible
        else None
    )
    favorite_ids = {merchant.id for _, merchant in visible}
    return CursorPage(
        items=[
            FavoriteRead(
                id=favorite.id,
                campus_id=favorite.campus_id,
                merchant=present_merchant(db, merchant, favorites=favorite_ids),
                created_at=favorite.created_at,
            )
            for favorite, merchant in visible
        ],
        next_cursor=next_cursor,
        has_more=has_more,
    )
