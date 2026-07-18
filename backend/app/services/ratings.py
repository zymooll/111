from __future__ import annotations

import math

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import MenuItem, Merchant, Review, ReviewStatus


def recalculate_item_rating(db: Session, menu_item_id: str) -> None:
    item = db.get(MenuItem, menu_item_id)
    if item is None:
        return
    average, count = db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(
            Review.menu_item_id == menu_item_id,
            Review.status == ReviewStatus.PUBLISHED,
            Review.deleted_at.is_(None),
        )
    ).one()
    review_count = int(count or 0)
    item.review_count = review_count
    if review_count == 0:
        item.rating_avg = 0
        return
    merchant = db.get(Merchant, item.merchant_id)
    campus_average = db.scalar(
        select(func.avg(Review.rating))
        .join(MenuItem, MenuItem.id == Review.menu_item_id)
        .join(Merchant, Merchant.id == MenuItem.merchant_id)
        .where(
            Merchant.campus_id == merchant.campus_id,
            Review.status == ReviewStatus.PUBLISHED,
            Review.deleted_at.is_(None),
        )
    )
    prior = float(campus_average or average or 0)
    confidence = 5
    bayesian = (review_count / (review_count + confidence)) * float(average) + (
        confidence / (review_count + confidence)
    ) * prior
    item.rating_avg = round(bayesian, 2)


def merchant_scores(db: Session, merchant_ids: list[str]) -> dict[str, float]:
    if not merchant_ids:
        return {}
    rows = db.execute(
        select(MenuItem.merchant_id, MenuItem.rating_avg, MenuItem.review_count).where(
            MenuItem.merchant_id.in_(merchant_ids),
            MenuItem.is_active.is_(True),
            MenuItem.review_count > 0,
        )
    ).all()
    weighted: dict[str, tuple[float, float]] = {}
    for merchant_id, rating, count in rows:
        weight = math.sqrt(count)
        total, weights = weighted.get(merchant_id, (0.0, 0.0))
        weighted[merchant_id] = (total + float(rating) * weight, weights + weight)
    return {
        merchant_id: round(total / weights, 2) if weights else 0
        for merchant_id, (total, weights) in weighted.items()
    }
