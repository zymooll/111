from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Favorite, MenuItem, Merchant, Review, User
from app.schemas import MenuItemSummary, MerchantRead, ReviewRead
from app.services.ratings import merchant_scores


def favorite_merchant_ids(db: Session, *, kind: str | None, actor_id: str | None) -> set[str]:
    if not kind or not actor_id:
        return set()
    column = Favorite.user_id if kind == "user" else Favorite.guest_id
    return set(db.scalars(select(Favorite.merchant_id).where(column == actor_id)).all())


def merchant_rating(db: Session, merchant_id: str) -> float:
    return merchant_scores(db, [merchant_id]).get(merchant_id, 0)


def present_merchant(
    db: Session,
    merchant: Merchant,
    *,
    favorites: set[str] | None = None,
) -> MerchantRead:
    payload = MerchantRead.model_validate(merchant)
    payload.is_favorite = merchant.id in (favorites or set())
    payload.rating_avg = merchant_rating(db, merchant.id)
    return payload


def present_item(
    item: MenuItem,
    merchant: Merchant,
    *,
    favorites: set[str] | None = None,
    reason: str | None = None,
) -> MenuItemSummary:
    payload = MenuItemSummary.model_validate(item)
    payload.merchant_name = merchant.name
    payload.merchant_address = merchant.address
    payload.recommendation_reason = reason
    payload.is_merchant_favorite = merchant.id in (favorites or set())
    return payload


def present_review(db: Session, review: Review) -> ReviewRead:
    payload = ReviewRead.model_validate(review)
    user = db.get(User, review.user_id)
    item = db.get(MenuItem, review.menu_item_id)
    payload.username = user.username if user else "已注销用户"
    payload.menu_item_name = item.name if item else "已下架菜品"
    return payload
