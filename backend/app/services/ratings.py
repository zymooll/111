from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import MenuItem, Merchant, Review, ReviewStatus


def lock_menu_item(db: Session, menu_item_id: str) -> MenuItem | None:
    """Serialise concurrent recalculations of one item's aggregates.

    必须显式发查询而不是 db.get()：后者命中身份映射时根本不发 SQL，锁也就不存在。
    populate_existing 保证拿到的是加锁后的最新值。SQLite 不支持 FOR UPDATE，
    SQLAlchemy 会把它编译成空——那里写入本来就被全局写锁串行化，语义一致。
    """
    return db.execute(
        select(MenuItem)
        .where(MenuItem.id == menu_item_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalars().first()


def recalculate_item_rating(db: Session, menu_item_id: str) -> None:
    # 先取行锁再统计：两者顺序颠倒的话，两个并发事务会各自读到对方提交前的计数，
    # 然后互相覆盖，其中一条评价就被永久漏计了。
    item = lock_menu_item(db, menu_item_id)
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


@dataclass(frozen=True)
class MerchantStats:
    """Aggregates for a whole page of merchants, fetched in two queries instead of 2N."""

    ratings: dict[str, float]
    review_counts: dict[str, int]


def merchant_stats(db: Session, merchant_ids: Sequence[str]) -> MerchantStats:
    ids = list(dict.fromkeys(merchant_ids))
    return MerchantStats(
        ratings=merchant_scores(db, ids),
        review_counts=merchant_review_counts(db, ids),
    )


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


def merchant_review_counts(db: Session, merchant_ids: list[str]) -> dict[str, int]:
    if not merchant_ids:
        return {}
    rows = db.execute(
        select(MenuItem.merchant_id, func.count(Review.id))
        .join(Review, Review.menu_item_id == MenuItem.id)
        .where(
            MenuItem.merchant_id.in_(merchant_ids),
            MenuItem.is_active.is_(True),
            Review.status == ReviewStatus.PUBLISHED,
            Review.deleted_at.is_(None),
        )
        .group_by(MenuItem.merchant_id)
    ).all()
    return {merchant_id: int(count or 0) for merchant_id, count in rows}
