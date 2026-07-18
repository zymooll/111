from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Campus, CampusArea, Category, MenuItem, Merchant, Review, Tag


def require_campus(db: Session, campus_id: str) -> Campus:
    campus = db.get(Campus, campus_id)
    if campus is None or not campus.is_active:
        raise HTTPException(status_code=404, detail="校园不存在或已停用")
    return campus


def require_area(db: Session, campus_id: str, area_id: str | None) -> CampusArea | None:
    if not area_id:
        return None
    area = db.get(CampusArea, area_id)
    if area is None or area.campus_id != campus_id:
        raise HTTPException(status_code=422, detail="校园地点不存在或不属于该校园")
    return area


def require_category(
    db: Session, campus_id: str, category_id: str | None
) -> Category | None:
    if not category_id:
        return None
    category = db.get(Category, category_id)
    if category is None or category.campus_id != campus_id:
        raise HTTPException(status_code=422, detail="品类不存在或不属于该校园")
    return category


def require_tag(db: Session, campus_id: str, tag_id: str) -> Tag:
    tag = db.get(Tag, tag_id)
    if tag is None or tag.campus_id != campus_id:
        raise HTTPException(status_code=404, detail="标签不存在或不属于该校园")
    return tag


def require_merchant(
    db: Session,
    campus_id: str,
    merchant_id: str,
    *,
    active: bool | None = None,
) -> Merchant:
    merchant = db.get(Merchant, merchant_id)
    if merchant is None or merchant.campus_id != campus_id:
        raise HTTPException(status_code=404, detail="商家不存在或不属于该校园")
    if active is True and not merchant.is_active:
        raise HTTPException(status_code=404, detail="商家不存在或已下架")
    return merchant


def require_menu_item(
    db: Session,
    campus_id: str,
    menu_item_id: str,
    *,
    active: bool | None = None,
) -> MenuItem:
    item = db.get(MenuItem, menu_item_id)
    if item is None or item.campus_id != campus_id:
        raise HTTPException(status_code=404, detail="菜品不存在或不属于该校园")
    if active is True and not item.is_active:
        raise HTTPException(status_code=404, detail="菜品不存在或已下架")
    return item


def require_review(db: Session, campus_id: str, review_id: str) -> Review:
    review = db.get(Review, review_id)
    if review is None or review.campus_id != campus_id or review.deleted_at is not None:
        raise HTTPException(status_code=404, detail="评价不存在或不属于该校园")
    return review
