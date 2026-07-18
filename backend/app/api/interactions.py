from __future__ import annotations

from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.presenters import present_merchant, present_review
from app.dependencies import (
    CurrentUser,
    DbSession,
    OptionalPrincipal,
    PrincipalRequired,
)
from app.models import (
    Favorite,
    GuestSession,
    InteractionEvent,
    MenuItem,
    Merchant,
    Review,
    ReviewStatus,
    ReviewView,
    UserProfile,
)
from app.schemas import (
    FavoriteRead,
    InteractionBatch,
    Message,
    MyStats,
    PreferencesRead,
    PreferencesUpdate,
    ReviewCreate,
    ReviewPage,
    ReviewRead,
    ReviewUpdate,
    ReviewViewRequest,
    UploadRead,
)
from app.services.deepseek import DeepSeekClient
from app.services.moderation import local_moderate
from app.services.ratings import recalculate_item_rating


router = APIRouter(tags=["互动与我的"])


def _favorite_query(principal: object, merchant_id: str):
    actor_condition = (
        Favorite.user_id == principal.id
        if principal.is_user
        else Favorite.guest_id == principal.id
    )
    return select(Favorite).where(actor_condition, Favorite.merchant_id == merchant_id)


def _validate_review_images(request: Request, user_id: str, images: list[str]) -> None:
    owner_root = (request.app.state.settings.upload_dir / user_id).resolve()
    expected_prefix = f"/media/{user_id}/"
    for image_url in images:
        if not image_url.startswith(expected_prefix):
            raise HTTPException(status_code=422, detail="评价只能引用本人已上传的图片")
        filename = image_url.removeprefix(expected_prefix)
        if not filename or "/" in filename or "\\" in filename:
            raise HTTPException(status_code=422, detail="图片地址无效")
        target = (owner_root / filename).resolve()
        if target.parent != owner_root or not target.is_file():
            raise HTTPException(status_code=422, detail="图片不存在或尚未上传完成")


@router.put("/favorites/merchants/{merchant_id}", response_model=Message)
def favorite_merchant(
    merchant_id: str,
    db: DbSession,
    principal: PrincipalRequired,
) -> Message:
    merchant = db.get(Merchant, merchant_id)
    if merchant is None or not merchant.is_active:
        raise HTTPException(status_code=404, detail="商家不存在或已下架")
    existing = db.scalar(_favorite_query(principal, merchant_id))
    if existing is None:
        favorite = Favorite(merchant_id=merchant_id)
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
) -> Message:
    favorite = db.scalar(_favorite_query(principal, merchant_id))
    if favorite is not None:
        db.delete(favorite)
        db.commit()
    return Message(message="已取消收藏")


@router.get("/me/favorites", response_model=list[FavoriteRead])
def my_favorites(db: DbSession, principal: PrincipalRequired) -> list[FavoriteRead]:
    column = Favorite.user_id if principal.is_user else Favorite.guest_id
    rows = db.execute(
        select(Favorite, Merchant)
        .join(Merchant, Merchant.id == Favorite.merchant_id)
        .where(column == principal.id)
        .order_by(Favorite.created_at.desc())
    ).all()
    favorite_ids = {merchant.id for _, merchant in rows}
    return [
        FavoriteRead(
            id=favorite.id,
            merchant=present_merchant(db, merchant, favorites=favorite_ids),
            created_at=favorite.created_at,
        )
        for favorite, merchant in rows
    ]


async def _moderate_review(request: Request, text: str):
    local = local_moderate(text)
    if local.status == ReviewStatus.PENDING_MANUAL:
        return local
    client = DeepSeekClient(request.app.state.settings)
    if not client.enabled:
        from app.services.moderation import ModerationResult

        return ModerationResult(
            ReviewStatus.PENDING_MANUAL,
            "DeepSeek 未配置，已转人工审核",
        )
    remote = await client.moderate(text)
    if remote is None:
        from app.services.moderation import ModerationResult

        return ModerationResult(
            ReviewStatus.PENDING_MANUAL,
            "内容审核服务暂不可用，已转人工审核",
        )
    return remote


def _require_image_review(result, images: list[str]):
    if images and result.status == ReviewStatus.PUBLISHED:
        from app.services.moderation import ModerationResult

        return ModerationResult(
            ReviewStatus.PENDING_MANUAL,
            "评价包含图片，需要人工确认图片内容",
        )
    return result


@router.post("/menu-items/{menu_item_id}/reviews", response_model=ReviewRead, status_code=201)
async def create_review(
    menu_item_id: str,
    payload: ReviewCreate,
    request: Request,
    db: DbSession,
    user: CurrentUser,
) -> ReviewRead:
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="验证邮箱后才能发表评价")
    item = db.get(MenuItem, menu_item_id)
    if item is None or not item.is_active:
        raise HTTPException(status_code=404, detail="菜品不存在或已下架")
    _validate_review_images(request, user.id, payload.images)
    existing = db.scalar(
        select(Review).where(
            Review.user_id == user.id,
            Review.menu_item_id == menu_item_id,
        )
    )
    if existing is not None and existing.deleted_at is None:
        raise HTTPException(status_code=409, detail="你已经评价过该菜品，可编辑原评价")
    result = _require_image_review(
        await _moderate_review(request, payload.text), payload.images
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
) -> ReviewRead:
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="验证邮箱后才能编辑评价")
    review = db.get(Review, review_id)
    if review is None or review.deleted_at is not None:
        raise HTTPException(status_code=404, detail="评价不存在")
    if review.user_id != user.id:
        raise HTTPException(status_code=403, detail="只能编辑自己的评价")
    _validate_review_images(request, user.id, payload.images)
    result = _require_image_review(
        await _moderate_review(request, payload.text), payload.images
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
def delete_review(review_id: str, db: DbSession, user: CurrentUser) -> Message:
    review = db.get(Review, review_id)
    if review is None or review.deleted_at is not None:
        raise HTTPException(status_code=404, detail="评价不存在")
    if review.user_id != user.id:
        raise HTTPException(status_code=403, detail="只能删除自己的评价")
    from app.models import utcnow

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
    review = db.get(Review, review_id)
    if review is None or review.status != ReviewStatus.PUBLISHED or review.deleted_at is not None:
        raise HTTPException(status_code=404, detail="评价不存在")
    if db.scalar(select(ReviewView).where(ReviewView.event_id == payload.event_id)) is not None:
        return Message(message="已记录")
    if principal and principal.is_user and principal.id == review.user_id:
        return Message(message="作者浏览不计入阅读量")
    view = ReviewView(event_id=payload.event_id, review_id=review.id)
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


@router.get("/me/reviews", response_model=ReviewPage)
def my_reviews(db: DbSession, user: CurrentUser) -> ReviewPage:
    rows = db.scalars(
        select(Review)
        .where(Review.user_id == user.id, Review.deleted_at.is_(None))
        .order_by(Review.created_at.desc())
    ).all()
    return ReviewPage(items=[present_review(db, row) for row in rows], total=len(rows))


@router.get("/me/stats", response_model=MyStats)
def my_stats(db: DbSession, user: CurrentUser) -> MyStats:
    published, total_views = db.execute(
        select(func.count(Review.id), func.coalesce(func.sum(Review.view_count), 0)).where(
            Review.user_id == user.id,
            Review.status == ReviewStatus.PUBLISHED,
            Review.deleted_at.is_(None),
        )
    ).one()
    favorite_count = db.scalar(
        select(func.count(Favorite.id)).where(Favorite.user_id == user.id)
    ) or 0
    return MyStats(
        published_reviews=int(published or 0),
        total_views=int(total_views or 0),
        favorite_merchants=int(favorite_count),
    )


@router.get("/me/preferences", response_model=PreferencesRead)
def get_preferences(db: DbSession, principal: PrincipalRequired) -> PreferencesRead:
    if principal.is_user:
        profile = db.scalar(select(UserProfile).where(UserProfile.user_id == principal.id))
        raw = profile.preferences if profile else {}
    else:
        guest = db.get(GuestSession, principal.id)
        raw = guest.preferences if guest else {}
    return PreferencesRead.model_validate(raw or {})


@router.put("/me/preferences", response_model=PreferencesRead)
def update_preferences(
    payload: PreferencesUpdate,
    db: DbSession,
    principal: PrincipalRequired,
) -> PreferencesRead:
    data = payload.model_dump()
    if payload.frequent_area_ids:
        from app.models import CampusArea

        known = set(
            db.scalars(
                select(CampusArea.id).where(CampusArea.id.in_(payload.frequent_area_ids))
            ).all()
        )
        if known != set(payload.frequent_area_ids):
            raise HTTPException(status_code=422, detail="常去地点中包含不存在的校园地点")
    if principal.is_user:
        profile = db.scalar(select(UserProfile).where(UserProfile.user_id == principal.id))
        if profile is None:
            profile = UserProfile(user_id=principal.id, preferences=data)
            db.add(profile)
        else:
            profile.preferences = data
    else:
        guest = db.get(GuestSession, principal.id)
        if guest is None:
            raise HTTPException(status_code=401, detail="游客会话已失效")
        guest.preferences = data
    db.commit()
    return PreferencesRead.model_validate(data)


@router.post("/interactions", response_model=Message)
def record_interactions(
    payload: InteractionBatch,
    db: DbSession,
    principal: PrincipalRequired,
) -> Message:
    known = set(
        db.scalars(
            select(InteractionEvent.event_id).where(
                InteractionEvent.event_id.in_([event.event_id for event in payload.events])
            )
        ).all()
    )
    for event in payload.events:
        if event.event_id in known:
            continue
        db.add(
            InteractionEvent(
                event_id=event.event_id,
                actor_type=principal.kind,
                actor_id=principal.id,
                event_type=event.event_type,
                menu_item_id=event.menu_item_id,
                merchant_id=event.merchant_id,
                metadata_json=event.metadata,
            )
        )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return Message(message="行为事件已接收")


@router.post("/uploads/images", response_model=UploadRead, status_code=201)
async def upload_image(
    request: Request,
    user: CurrentUser,
    file: UploadFile = File(...),
) -> UploadRead:
    content = await file.read(request.app.state.settings.max_upload_bytes + 1)
    if len(content) > request.app.state.settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="图片不能超过 10 MB")
    try:
        image = Image.open(BytesIO(content))
        image.verify()
        image = Image.open(BytesIO(content))
        image.load()
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise HTTPException(status_code=422, detail="无法识别图片内容") from exc
    allowed = {"JPEG": ("jpg", "image/jpeg"), "PNG": ("png", "image/png"), "WEBP": ("webp", "image/webp")}
    if image.format not in allowed:
        raise HTTPException(status_code=422, detail="仅支持 JPEG、PNG、WebP")
    if image.width * image.height > 40_000_000:
        raise HTTPException(status_code=422, detail="图片像素尺寸过大")
    extension, content_type = allowed[image.format]
    upload_root: Path = request.app.state.settings.upload_dir / user.id
    upload_root.mkdir(parents=True, exist_ok=True)
    name = f"{uuid4()}.{extension}"
    target = upload_root / name
    save_image = image.convert("RGB") if image.format == "JPEG" else image
    save_image.save(target, format=image.format, optimize=True)
    relative = f"{user.id}/{name}"
    return UploadRead(
        url=f"/media/{relative}",
        content_type=content_type,
        size=target.stat().st_size,
        width=image.width,
        height=image.height,
    )
