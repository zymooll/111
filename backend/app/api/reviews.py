from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select
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
    review.rating = payload.rating
    review.text = payload.text
    review.images = payload.images
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


@router.post("/reviews/{review_id}/view", response_model=Message)
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
    if db.scalar(select(ReviewView).where(ReviewView.event_id == payload.event_id)) is not None:
        return Message(message="已记录")
    if principal and principal.is_user and principal.id == review.user_id:
        return Message(message="作者浏览不计入阅读量")
    view = ReviewView(
        campus_id=payload.campus_id,
        event_id=payload.event_id,
        review_id=review.id,
    )
    if principal:
        if principal.is_user:
            view.viewer_user_id = principal.id
        else:
            view.viewer_guest_id = principal.id
    db.add(view)
    review.view_count += 1
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return Message(message="已记录")
