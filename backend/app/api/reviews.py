from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.api.presenters import present_review
from app.api.review_support import (
    moderate_review,
    require_image_review,
    validate_review_images,
)
from app.dependencies import CurrentUser, DbSession, OptionalPrincipal
from app.models import Review, ReviewStatus, ReviewView, utcnow
from app.schemas import Message, ReviewCreate, ReviewRead, ReviewUpdate, ReviewViewRequest
from app.services.campuses import (
    require_campus,
    require_menu_item,
    require_merchant,
    require_review,
)
from app.services.moderation import AUTHOR_LOCKED_STATUSES
from app.services.rate_limit import REVIEW_VIEW_RULE, rate_limit
from app.services.ratings import recalculate_item_rating

router = APIRouter(tags=["评价"])


@router.post("/menu-items/{menu_item_id}/reviews", response_model=ReviewRead, status_code=201)
async def create_review(
    menu_item_id: str,
    payload: ReviewCreate,
    request: Request,
    db: DbSession,
    user: CurrentUser,
    campus_id: str,
) -> ReviewRead:
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="验证邮箱后才能发表评价")
    require_campus(db, campus_id)
    item = require_menu_item(db, campus_id, menu_item_id, active=True)
    require_merchant(db, campus_id, item.merchant_id, active=True)
    validate_review_images(request, user.id, payload.images)
    existing = db.scalar(
        select(Review).where(
            Review.user_id == user.id,
            Review.menu_item_id == menu_item_id,
        )
    )
    if existing is not None and existing.deleted_at is None:
        raise HTTPException(status_code=409, detail="你已经评价过该菜品，可编辑原评价")
    result = require_image_review(
        await moderate_review(request, payload.text), payload.images
    )
    if existing is not None:
        review = existing
        review.deleted_at = None
        review.rating = payload.rating
        review.text = payload.text
        review.images = payload.images
        review.status = result.status
        review.moderation_reason = result.reason
    else:
        review = Review(
            campus_id=campus_id,
            user_id=user.id,
            menu_item_id=menu_item_id,
            rating=payload.rating,
            text=payload.text,
            images=payload.images,
            status=result.status,
            moderation_reason=result.reason,
        )
        db.add(review)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="你已经评价过该菜品") from exc
    recalculate_item_rating(db, menu_item_id)
    db.commit()
    db.refresh(review)
    return present_review(db, review)


@router.patch("/reviews/{review_id}", response_model=ReviewRead)
async def update_review(
    review_id: str,
    payload: ReviewUpdate,
    request: Request,
    db: DbSession,
    user: CurrentUser,
    campus_id: str,
) -> ReviewRead:
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="验证邮箱后才能编辑评价")
    require_campus(db, campus_id)
    review = require_review(db, campus_id, review_id)
    if review.user_id != user.id:
        raise HTTPException(status_code=403, detail="只能编辑自己的评价")
    validate_review_images(request, user.id, payload.images)
    result = require_image_review(
        await moderate_review(request, payload.text), payload.images
    )
    was_locked = review.status in AUTHOR_LOCKED_STATUSES
    review.rating = payload.rating
    review.text = payload.text
    review.images = payload.images
    if was_locked:
        # 编辑不能撤销管理员的处置：机审即使判通过，也只能回到人工队列。
        review.status = ReviewStatus.PENDING_MANUAL
        review.moderation_reason = "内容已修改，等待管理员复核"
    else:
        review.status = result.status
        review.moderation_reason = result.reason
    db.flush()
    recalculate_item_rating(db, review.menu_item_id)
    db.commit()
    db.refresh(review)
    return present_review(db, review)


@router.delete("/reviews/{review_id}", response_model=Message)
def delete_review(
    review_id: str, db: DbSession, user: CurrentUser, campus_id: str
) -> Message:
    require_campus(db, campus_id)
    review = require_review(db, campus_id, review_id)
    if review.user_id != user.id:
        raise HTTPException(status_code=403, detail="只能删除自己的评价")
    review.deleted_at = utcnow()
    db.flush()
    recalculate_item_rating(db, review.menu_item_id)
    db.commit()
    return Message(message="评价已删除")


@router.post(
    "/reviews/{review_id}/view",
    response_model=Message,
    dependencies=[rate_limit(REVIEW_VIEW_RULE)],
)
def record_review_view(
    review_id: str,
    payload: ReviewViewRequest,
    db: DbSession,
    principal: OptionalPrincipal,
) -> Message:
    require_campus(db, payload.campus_id)
    review = require_review(db, payload.campus_id, review_id)
    if review.status != ReviewStatus.PUBLISHED:
        raise HTTPException(status_code=404, detail="评价不存在")
    if principal and principal.is_user and principal.id == review.user_id:
        return Message(message="作者浏览不计入阅读量")
    bump_review_view(
        db,
        review_id=review.id,
        campus_id=payload.campus_id,
        event_id=payload.event_id,
        viewer_user_id=principal.id if principal and principal.is_user else None,
        viewer_guest_id=principal.id if principal and principal.is_guest else None,
    )
    db.commit()
    return Message(message="已记录")


def bump_review_view(
    db,
    *,
    review_id: str,
    campus_id: str,
    event_id: str,
    viewer_user_id: str | None,
    viewer_guest_id: str | None,
) -> bool:
    """Record one view. Returns whether it counted (False when the event repeats)."""
    # 去重不靠"先查再插"——两个并发请求会同时查不到再同时插入。让 event_id 上的唯一约束
    # 来裁决：抢到的那个才计数，撞上的那个静默返回。
    try:
        with db.begin_nested():
            db.add(
                ReviewView(
                    campus_id=campus_id,
                    event_id=event_id,
                    review_id=review_id,
                    viewer_user_id=viewer_user_id,
                    viewer_guest_id=viewer_guest_id,
                )
            )
    except IntegrityError:
        return False

    # 自增交给数据库：Python 侧的 += 1 是读-改-写，并发下必然丢更新。
    db.execute(
        update(Review)
        .where(Review.id == review_id)
        .values(view_count=Review.view_count + 1)
    )
    return True
