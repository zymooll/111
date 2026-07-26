from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Favorite, MenuItem, Merchant, Review, User
from app.schemas import MenuItemSummary, MerchantRead, ReviewRead
from app.services.ratings import (
    MerchantStats,
    merchant_scores,
    merchant_stats,
)


def favorite_merchant_ids(
    db: Session,
    *,
    kind: str | None,
    actor_id: str | None,
    campus_id: str | None = None,
) -> set[str]:
    if not kind or not actor_id:
        return set()
    column = Favorite.user_id if kind == "user" else Favorite.guest_id
    query = select(Favorite.merchant_id).where(column == actor_id)
    if campus_id:
        query = query.where(Favorite.campus_id == campus_id)
    return set(db.scalars(query).all())


def merchant_rating(db: Session, merchant_id: str) -> float:
    return merchant_scores(db, [merchant_id]).get(merchant_id, 0)


def present_merchant(
    db: Session,
    merchant: Merchant,
    *,
    favorites: set[str] | None = None,
    stats: MerchantStats | None = None,
) -> MerchantRead:
    payload = MerchantRead.model_validate(merchant)
    payload.is_favorite = merchant.id in (favorites or set())
    if stats is None:
        stats = merchant_stats(db, [merchant.id])
    payload.rating_avg = stats.ratings.get(merchant.id, 0)
    payload.review_count = stats.review_counts.get(merchant.id, 0)
    return payload


def present_merchants(
    db: Session,
    merchants: Sequence[Merchant],
    *,
    favorites: set[str] | None = None,
) -> list[MerchantRead]:
    """Render a list with two aggregate queries总计，而不是每行两条。"""
    stats = merchant_stats(db, [merchant.id for merchant in merchants])
    return [
        present_merchant(db, merchant, favorites=favorites, stats=stats)
        for merchant in merchants
    ]


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


def present_review(
    db: Session,
    review: Review,
    *,
    names: ReviewNames | None = None,
) -> ReviewRead:
    payload = ReviewRead.model_validate(review)
    if names is None:
        names = review_names(db, [review])
    payload.username = names.usernames.get(review.user_id, "已注销用户")
    payload.menu_item_name = names.item_names.get(review.menu_item_id, "已下架菜品")
    return payload


def present_reviews(db: Session, reviews: Sequence[Review]) -> list[ReviewRead]:
    names = review_names(db, reviews)
    return [present_review(db, review, names=names) for review in reviews]


class ReviewNames:
    """Author and dish names for a page of reviews, resolved in two queries."""

    __slots__ = ("item_names", "usernames")

    def __init__(self, usernames: dict[str, str], item_names: dict[str, str]) -> None:
        self.usernames = usernames
        self.item_names = item_names


def review_names(db: Session, reviews: Sequence[Review]) -> ReviewNames:
    user_ids = {review.user_id for review in reviews}
    item_ids = {review.menu_item_id for review in reviews}
    usernames = (
        dict(db.execute(select(User.id, User.username).where(User.id.in_(user_ids))).all())
        if user_ids
        else {}
    )
    item_names = (
        dict(db.execute(select(MenuItem.id, MenuItem.name).where(MenuItem.id.in_(item_ids))).all())
        if item_ids
        else {}
    )
    return ReviewNames(usernames, item_names)
