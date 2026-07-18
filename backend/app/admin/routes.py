from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select

from app.api.presenters import present_item, present_merchant, present_review
from app.dependencies import CurrentAdmin, DbSession
from app.models import (
    AdminAuditLog,
    Campus,
    CampusArea,
    Category,
    Favorite,
    InteractionEvent,
    MenuItem,
    Merchant,
    Review,
    ReviewStatus,
    User,
    UserProfile,
    UserRole,
)
from app.schemas import (
    AdminMenuItemRead,
    AdminMerchantRead,
    AdminReviewPage,
    AdminReviewRead,
    AdminUserRead,
    AuditLogRead,
    AreaCreate,
    AreaUpdate,
    CategoryCreate,
    CategoryUpdate,
    MenuItemCreate,
    MenuItemSummary,
    MenuItemUpdate,
    MerchantCreate,
    MerchantRead,
    MerchantUpdate,
    Message,
    ModerationRequest,
    PublishStatusCompat,
    ReviewModerationCompat,
    ReviewPage,
    ReviewRead,
    UserAdminUpdate,
    UserRead,
    UserStatusCompat,
)
from app.services.ratings import recalculate_item_rating
from app.services.accounts import RESET_PASSWORD, issue_account_token, reset_link, send_account_email
from app.services.hierarchy import area_with_descendants, category_with_descendants


router = APIRouter(tags=["管理后台"])


def _manager(admin: CurrentAdmin) -> User:
    if admin.role not in {UserRole.CAMPUS_ADMIN, UserRole.SUPER_ADMIN}:
        raise HTTPException(status_code=403, detail="该操作需要校园管理员权限")
    return admin


Manager = Annotated[User, Depends(_manager)]


def _audit(
    db,
    admin: User,
    *,
    action: str,
    target_type: str,
    target_id: str,
    detail: dict | None = None,
) -> None:
    db.add(
        AdminAuditLog(
            admin_user_id=admin.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail or {},
        )
    )


def _present_admin_user(db, user: User) -> AdminUserRead:
    review_count, impact_views = db.execute(
        select(func.count(Review.id), func.coalesce(func.sum(Review.view_count), 0)).where(
            Review.user_id == user.id,
            Review.deleted_at.is_(None),
        )
    ).one()
    favorite_count = db.scalar(
        select(func.count(Favorite.id)).where(Favorite.user_id == user.id)
    ) or 0
    last_active = db.scalar(
        select(func.max(InteractionEvent.occurred_at)).where(
            InteractionEvent.actor_type == "user",
            InteractionEvent.actor_id == user.id,
        )
    )
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    preferences = profile.preferences if profile else {}
    tags = [
        str(value)
        for key in ("tastes", "avoid")
        for value in (preferences.get(key, []) if isinstance(preferences.get(key, []), list) else [])
    ]
    return AdminUserRead(
        **UserRead.model_validate(user).model_dump(),
        review_count=int(review_count or 0),
        impact_views=int(impact_views or 0),
        favorite_count=int(favorite_count),
        last_active=last_active or user.updated_at,
        dietary_tags=list(dict.fromkeys(tags)),
    )


def _present_admin_merchant(db, merchant: Merchant) -> AdminMerchantRead:
    base = present_merchant(db, merchant)
    area = db.get(CampusArea, merchant.area_id) if merchant.area_id else None
    category = db.get(Category, merchant.category_id) if merchant.category_id else None
    dish_count = db.scalar(
        select(func.count(MenuItem.id)).where(MenuItem.merchant_id == merchant.id)
    ) or 0
    favorite_count = db.scalar(
        select(func.count(Favorite.id)).where(Favorite.merchant_id == merchant.id)
    ) or 0
    return AdminMerchantRead(
        **base.model_dump(),
        area_name=area.name if area else None,
        category_name=category.name if category else None,
        dish_count=int(dish_count),
        favorite_count=int(favorite_count),
        updated_at=merchant.updated_at,
    )


def _present_admin_item(db, item: MenuItem, merchant: Merchant) -> AdminMenuItemRead:
    base = present_item(item, merchant)
    category = db.get(Category, item.category_id) if item.category_id else None
    return AdminMenuItemRead(
        **base.model_dump(),
        category_name=category.name if category else None,
        updated_at=item.updated_at,
    )


def _present_admin_review(db, review: Review) -> AdminReviewRead:
    base = present_review(db, review)
    item = db.get(MenuItem, review.menu_item_id)
    merchant = db.get(Merchant, item.merchant_id) if item else None
    risk_level = (
        "high"
        if review.status == ReviewStatus.REJECTED
        else "medium"
        if review.status in {ReviewStatus.PENDING_MACHINE, ReviewStatus.PENDING_MANUAL}
        else "low"
    )
    return AdminReviewRead(
        **base.model_dump(),
        merchant_name=merchant.name if merchant else None,
        risk_level=risk_level,
    )


@router.get("/dashboard")
def dashboard(db: DbSession, admin: CurrentAdmin) -> dict[str, int]:
    return {
        "users": int(db.scalar(select(func.count(User.id))) or 0),
        "active_merchants": int(
            db.scalar(select(func.count(Merchant.id)).where(Merchant.is_active.is_(True))) or 0
        ),
        "active_menu_items": int(
            db.scalar(select(func.count(MenuItem.id)).where(MenuItem.is_active.is_(True))) or 0
        ),
        "pending_reviews": int(
            db.scalar(
                select(func.count(Review.id)).where(
                    Review.status.in_(
                        [ReviewStatus.PENDING_MACHINE, ReviewStatus.PENDING_MANUAL]
                    ),
                    Review.deleted_at.is_(None),
                )
            )
            or 0
        ),
    }


@router.get("/users", response_model=list[AdminUserRead])
def list_users(
    db: DbSession,
    admin: Manager,
    search: str | None = Query(default=None, max_length=100),
    active: bool | None = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[AdminUserRead]:
    query = select(User)
    if search:
        keyword = f"%{search}%"
        query = query.where(or_(User.username.like(keyword), User.email.like(keyword)))
    if active is not None:
        query = query.where(User.is_active == active)
    rows = db.scalars(query.order_by(User.created_at.desc()).offset(offset).limit(limit)).all()
    return [_present_admin_user(db, row) for row in rows]


@router.patch("/users/{user_id}", response_model=AdminUserRead)
def update_user(
    user_id: str,
    payload: UserAdminUpdate,
    db: DbSession,
    admin: Manager,
) -> AdminUserRead:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == admin.id and not payload.is_active:
        raise HTTPException(status_code=409, detail="不能停用当前管理员账号")
    user.is_active = payload.is_active
    _audit(
        db,
        admin,
        action="user.activate" if payload.is_active else "user.deactivate",
        target_type="user",
        target_id=user.id,
    )
    db.commit()
    db.refresh(user)
    return _present_admin_user(db, user)


@router.patch("/users/{user_id}/status", response_model=AdminUserRead)
def update_user_status_compat(
    user_id: str,
    payload: UserStatusCompat,
    db: DbSession,
    admin: Manager,
) -> AdminUserRead:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    requested_status = payload.status or ("active" if payload.is_active else "frozen")
    if user.id == admin.id and requested_status == "frozen":
        raise HTTPException(status_code=409, detail="不能冻结当前管理员账号")
    user.is_active = requested_status != "frozen"
    if requested_status == "unverified":
        user.email_verified = False
    _audit(
        db,
        admin,
        action=f"user.status.{requested_status}",
        target_type="user",
        target_id=user.id,
    )
    db.commit()
    db.refresh(user)
    return _present_admin_user(db, user)


@router.post("/users/{user_id}/password-reset", response_model=Message, status_code=202)
def trigger_password_reset(
    user_id: str,
    request: Request,
    db: DbSession,
    admin: Manager,
) -> Message:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    settings = request.app.state.settings
    token = issue_account_token(
        db,
        user,
        purpose=RESET_PASSWORD,
        ttl_minutes=settings.account_token_minutes,
    )
    sent = send_account_email(
        settings,
        recipient=user.email,
        subject="重置你的 Campus Foodie 密码",
        body=f"请在 {settings.account_token_minutes} 分钟内打开以下链接：\n{reset_link(settings, token)}",
    )
    _audit(
        db,
        admin,
        action="user.password_reset_requested",
        target_type="user",
        target_id=user.id,
        detail={"email": user.email, "email_sent": sent},
    )
    db.commit()
    return Message(message="密码重置邮件已发送" if sent else "密码重置请求已记录")


@router.get("/merchants", response_model=list[AdminMerchantRead])
def list_merchants(
    db: DbSession,
    admin: Manager,
    campus_id: str | None = None,
    search: str | None = Query(default=None, max_length=100),
    active: bool | None = None,
) -> list[AdminMerchantRead]:
    query = select(Merchant)
    if campus_id:
        query = query.where(Merchant.campus_id == campus_id)
    if search:
        query = query.where(Merchant.name.like(f"%{search}%"))
    if active is not None:
        query = query.where(Merchant.is_active == active)
    rows = db.scalars(query.order_by(Merchant.created_at.desc())).all()
    return [_present_admin_merchant(db, row) for row in rows]


def _validate_merchant_refs(db, payload: MerchantCreate | MerchantUpdate, merchant: Merchant | None = None) -> None:
    campus_id = getattr(payload, "campus_id", None) or (merchant.campus_id if merchant else None)
    if campus_id and db.get(Campus, campus_id) is None:
        raise HTTPException(status_code=422, detail="校园不存在")
    area_id = payload.area_id
    if area_id is not None:
        area = db.get(CampusArea, area_id)
        if area is None or (campus_id and area.campus_id != campus_id):
            raise HTTPException(status_code=422, detail="校园地点不存在或不属于该校园")
    category_id = payload.category_id
    if category_id is not None and db.get(Category, category_id) is None:
        raise HTTPException(status_code=422, detail="品类不存在")


@router.get("/categories")
def admin_categories(db: DbSession, admin: Manager) -> list[dict]:
    rows = db.scalars(select(Category).order_by(Category.sort_order, Category.name)).all()
    return [
        {
            "id": row.id,
            "parent_id": row.parent_id,
            "name": row.name,
            "icon": row.icon,
            "sort_order": row.sort_order,
        }
        for row in rows
    ]


@router.post("/categories", status_code=201)
def create_category(payload: CategoryCreate, db: DbSession, admin: Manager) -> dict:
    if payload.parent_id and db.get(Category, payload.parent_id) is None:
        raise HTTPException(status_code=422, detail="上级品类不存在")
    category = Category(**payload.model_dump())
    db.add(category)
    db.flush()
    _audit(db, admin, action="category.create", target_type="category", target_id=category.id)
    db.commit()
    return {
        "id": category.id,
        "parent_id": category.parent_id,
        "name": category.name,
        "icon": category.icon,
        "sort_order": category.sort_order,
    }


@router.patch("/categories/{category_id}")
def update_category(
    category_id: str,
    payload: CategoryUpdate,
    db: DbSession,
    admin: Manager,
) -> dict:
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="品类不存在")
    changes = payload.model_dump(exclude_unset=True)
    parent_id = changes.get("parent_id")
    if parent_id in category_with_descendants(db, category.id):
        raise HTTPException(status_code=422, detail="上级品类不能是自身或其下级")
    if parent_id and db.get(Category, parent_id) is None:
        raise HTTPException(status_code=422, detail="上级品类不存在")
    for key, value in changes.items():
        setattr(category, key, value)
    _audit(db, admin, action="category.update", target_type="category", target_id=category.id)
    db.commit()
    return {
        "id": category.id,
        "parent_id": category.parent_id,
        "name": category.name,
        "icon": category.icon,
        "sort_order": category.sort_order,
    }


@router.delete("/categories/{category_id}", response_model=Message)
def delete_category(category_id: str, db: DbSession, admin: Manager) -> Message:
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="品类不存在")
    in_use = any(
        [
            db.scalar(select(func.count(Category.id)).where(Category.parent_id == category_id)),
            db.scalar(select(func.count(Merchant.id)).where(Merchant.category_id == category_id)),
            db.scalar(select(func.count(MenuItem.id)).where(MenuItem.category_id == category_id)),
        ]
    )
    if in_use:
        raise HTTPException(status_code=409, detail="品类存在下级或业务引用，不能删除")
    _audit(db, admin, action="category.delete", target_type="category", target_id=category.id)
    db.delete(category)
    db.commit()
    return Message(message="品类已删除")


@router.get("/areas")
def admin_areas(
    db: DbSession,
    admin: Manager,
    campus_id: str | None = None,
) -> list[dict]:
    query = select(CampusArea)
    if campus_id:
        query = query.where(CampusArea.campus_id == campus_id)
    rows = db.scalars(query.order_by(CampusArea.sort_order, CampusArea.name)).all()
    return [
        {
            "id": row.id,
            "campus_id": row.campus_id,
            "parent_id": row.parent_id,
            "name": row.name,
            "level": row.level,
            "sort_order": row.sort_order,
        }
        for row in rows
    ]


@router.post("/areas", status_code=201)
def create_area(payload: AreaCreate, db: DbSession, admin: Manager) -> dict:
    if db.get(Campus, payload.campus_id) is None:
        raise HTTPException(status_code=422, detail="校园不存在")
    if payload.parent_id:
        parent = db.get(CampusArea, payload.parent_id)
        if parent is None or parent.campus_id != payload.campus_id:
            raise HTTPException(status_code=422, detail="上级地点不存在或不属于该校园")
    area = CampusArea(**payload.model_dump())
    db.add(area)
    db.flush()
    _audit(db, admin, action="area.create", target_type="area", target_id=area.id)
    db.commit()
    return {
        "id": area.id,
        "campus_id": area.campus_id,
        "parent_id": area.parent_id,
        "name": area.name,
        "level": area.level,
        "sort_order": area.sort_order,
    }


@router.patch("/areas/{area_id}")
def update_area(
    area_id: str,
    payload: AreaUpdate,
    db: DbSession,
    admin: Manager,
) -> dict:
    area = db.get(CampusArea, area_id)
    if area is None:
        raise HTTPException(status_code=404, detail="校园地点不存在")
    changes = payload.model_dump(exclude_unset=True)
    parent_id = changes.get("parent_id")
    if parent_id in area_with_descendants(db, area.id):
        raise HTTPException(status_code=422, detail="上级地点不能是自身或其下级")
    if parent_id:
        parent = db.get(CampusArea, parent_id)
        if parent is None or parent.campus_id != area.campus_id:
            raise HTTPException(status_code=422, detail="上级地点不存在或不属于该校园")
    for key, value in changes.items():
        setattr(area, key, value)
    _audit(db, admin, action="area.update", target_type="area", target_id=area.id)
    db.commit()
    return {
        "id": area.id,
        "campus_id": area.campus_id,
        "parent_id": area.parent_id,
        "name": area.name,
        "level": area.level,
        "sort_order": area.sort_order,
    }


@router.delete("/areas/{area_id}", response_model=Message)
def delete_area(area_id: str, db: DbSession, admin: Manager) -> Message:
    area = db.get(CampusArea, area_id)
    if area is None:
        raise HTTPException(status_code=404, detail="校园地点不存在")
    in_use = any(
        [
            db.scalar(select(func.count(CampusArea.id)).where(CampusArea.parent_id == area_id)),
            db.scalar(select(func.count(Merchant.id)).where(Merchant.area_id == area_id)),
        ]
    )
    if in_use:
        raise HTTPException(status_code=409, detail="地点存在下级或商家引用，不能删除")
    _audit(db, admin, action="area.delete", target_type="area", target_id=area.id)
    db.delete(area)
    db.commit()
    return Message(message="校园地点已删除")


@router.post("/merchants", response_model=AdminMerchantRead, status_code=201)
def create_merchant(
    payload: MerchantCreate,
    db: DbSession,
    admin: Manager,
) -> AdminMerchantRead:
    _validate_merchant_refs(db, payload)
    data = payload.model_dump()
    if data["gcj02_latitude"] is None:
        data["gcj02_latitude"] = data["latitude"]
    if data["gcj02_longitude"] is None:
        data["gcj02_longitude"] = data["longitude"]
    merchant = Merchant(**data)
    db.add(merchant)
    db.flush()
    _audit(db, admin, action="merchant.create", target_type="merchant", target_id=merchant.id)
    db.commit()
    db.refresh(merchant)
    return _present_admin_merchant(db, merchant)


@router.patch("/merchants/{merchant_id}", response_model=AdminMerchantRead)
def update_merchant(
    merchant_id: str,
    payload: MerchantUpdate,
    db: DbSession,
    admin: Manager,
) -> AdminMerchantRead:
    merchant = db.get(Merchant, merchant_id)
    if merchant is None:
        raise HTTPException(status_code=404, detail="商家不存在")
    _validate_merchant_refs(db, payload, merchant)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(merchant, key, value)
    _audit(
        db,
        admin,
        action="merchant.update",
        target_type="merchant",
        target_id=merchant.id,
        detail={"fields": sorted(changes)},
    )
    db.commit()
    db.refresh(merchant)
    return _present_admin_merchant(db, merchant)


@router.patch("/merchants/{merchant_id}/status", response_model=AdminMerchantRead)
def update_merchant_status_compat(
    merchant_id: str,
    payload: PublishStatusCompat,
    db: DbSession,
    admin: Manager,
) -> AdminMerchantRead:
    merchant = db.get(Merchant, merchant_id)
    if merchant is None:
        raise HTTPException(status_code=404, detail="商家不存在")
    requested_status = payload.status or ("online" if payload.is_active else "offline")
    merchant.is_active = requested_status == "online"
    _audit(
        db,
        admin,
        action=f"merchant.status.{requested_status}",
        target_type="merchant",
        target_id=merchant.id,
    )
    db.commit()
    db.refresh(merchant)
    return _present_admin_merchant(db, merchant)


@router.delete("/merchants/{merchant_id}", response_model=Message)
def deactivate_merchant(merchant_id: str, db: DbSession, admin: Manager) -> Message:
    merchant = db.get(Merchant, merchant_id)
    if merchant is None:
        raise HTTPException(status_code=404, detail="商家不存在")
    merchant.is_active = False
    _audit(db, admin, action="merchant.deactivate", target_type="merchant", target_id=merchant.id)
    db.commit()
    return Message(message="商家已下架")


@router.get("/menu-items", response_model=list[AdminMenuItemRead])
def list_menu_items(
    db: DbSession,
    admin: Manager,
    merchant_id: str | None = None,
    active: bool | None = None,
) -> list[AdminMenuItemRead]:
    query = select(MenuItem, Merchant).join(Merchant, Merchant.id == MenuItem.merchant_id)
    if merchant_id:
        query = query.where(MenuItem.merchant_id == merchant_id)
    if active is not None:
        query = query.where(MenuItem.is_active == active)
    rows = db.execute(query.order_by(MenuItem.created_at.desc())).all()
    return [_present_admin_item(db, item, merchant) for item, merchant in rows]


@router.post("/menu-items", response_model=AdminMenuItemRead, status_code=201)
def create_menu_item(
    payload: MenuItemCreate,
    db: DbSession,
    admin: Manager,
) -> AdminMenuItemRead:
    merchant = db.get(Merchant, payload.merchant_id)
    if merchant is None:
        raise HTTPException(status_code=422, detail="商家不存在")
    if payload.category_id and db.get(Category, payload.category_id) is None:
        raise HTTPException(status_code=422, detail="品类不存在")
    item = MenuItem(**payload.model_dump())
    db.add(item)
    db.flush()
    _audit(db, admin, action="menu_item.create", target_type="menu_item", target_id=item.id)
    db.commit()
    db.refresh(item)
    return _present_admin_item(db, item, merchant)


@router.patch("/menu-items/{menu_item_id}", response_model=AdminMenuItemRead)
def update_menu_item(
    menu_item_id: str,
    payload: MenuItemUpdate,
    db: DbSession,
    admin: Manager,
) -> AdminMenuItemRead:
    item = db.get(MenuItem, menu_item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="菜品不存在")
    if payload.category_id and db.get(Category, payload.category_id) is None:
        raise HTTPException(status_code=422, detail="品类不存在")
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(item, key, value)
    _audit(
        db,
        admin,
        action="menu_item.update",
        target_type="menu_item",
        target_id=item.id,
        detail={"fields": sorted(changes)},
    )
    db.commit()
    db.refresh(item)
    merchant = db.get(Merchant, item.merchant_id)
    return _present_admin_item(db, item, merchant)


@router.patch("/menu-items/{menu_item_id}/status", response_model=AdminMenuItemRead)
def update_menu_item_status_compat(
    menu_item_id: str,
    payload: PublishStatusCompat,
    db: DbSession,
    admin: Manager,
) -> AdminMenuItemRead:
    item = db.get(MenuItem, menu_item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="菜品不存在")
    requested_status = payload.status or ("online" if payload.is_active else "offline")
    item.is_active = requested_status == "online"
    _audit(
        db,
        admin,
        action=f"menu_item.status.{requested_status}",
        target_type="menu_item",
        target_id=item.id,
    )
    db.commit()
    db.refresh(item)
    merchant = db.get(Merchant, item.merchant_id)
    return _present_admin_item(db, item, merchant)


@router.delete("/menu-items/{menu_item_id}", response_model=Message)
def deactivate_menu_item(menu_item_id: str, db: DbSession, admin: Manager) -> Message:
    item = db.get(MenuItem, menu_item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="菜品不存在")
    item.is_active = False
    _audit(db, admin, action="menu_item.deactivate", target_type="menu_item", target_id=item.id)
    db.commit()
    return Message(message="菜品已下架")


@router.get("/reviews", response_model=AdminReviewPage)
def list_reviews(
    db: DbSession,
    admin: CurrentAdmin,
    review_status: str | None = Query(default=None, alias="status"),
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> AdminReviewPage:
    query = select(Review).where(Review.deleted_at.is_(None))
    count_query = select(func.count(Review.id)).where(Review.deleted_at.is_(None))
    if review_status:
        query = query.where(Review.status == review_status)
        count_query = count_query.where(Review.status == review_status)
    total = int(db.scalar(count_query) or 0)
    rows = db.scalars(
        query.order_by(Review.created_at.desc()).offset(offset).limit(limit)
    ).all()
    return AdminReviewPage(items=[_present_admin_review(db, row) for row in rows], total=total)


@router.post("/reviews/{review_id}/moderate", response_model=AdminReviewRead)
def moderate_review(
    review_id: str,
    payload: ModerationRequest,
    db: DbSession,
    admin: CurrentAdmin,
) -> AdminReviewRead:
    review = db.get(Review, review_id)
    if review is None or review.deleted_at is not None:
        raise HTTPException(status_code=404, detail="评价不存在")
    transitions = {
        "publish": ReviewStatus.PUBLISHED,
        "reject": ReviewStatus.REJECTED,
        "hide": ReviewStatus.HIDDEN,
        "restore": ReviewStatus.PUBLISHED,
    }
    if payload.action in {"reject", "hide"} and not payload.reason.strip():
        raise HTTPException(status_code=422, detail="驳回或下架必须填写原因")
    review.status = transitions[payload.action]
    review.moderation_reason = payload.reason.strip() or None
    _audit(
        db,
        admin,
        action=f"review.{payload.action}",
        target_type="review",
        target_id=review.id,
        detail={"reason": payload.reason},
    )
    db.flush()
    recalculate_item_rating(db, review.menu_item_id)
    db.commit()
    db.refresh(review)
    return _present_admin_review(db, review)


@router.post("/reviews/{review_id}/moderation", response_model=AdminReviewRead)
def moderate_review_compat(
    review_id: str,
    payload: ReviewModerationCompat,
    db: DbSession,
    admin: CurrentAdmin,
) -> AdminReviewRead:
    actions = {
        "published": "publish",
        "rejected": "reject",
        "hidden": "hide",
    }
    if payload.status == "pending_manual":
        review = db.get(Review, review_id)
        if review is None or review.deleted_at is not None:
            raise HTTPException(status_code=404, detail="评价不存在")
        review.status = ReviewStatus.PENDING_MANUAL
        review.moderation_reason = payload.reason or None
        _audit(
            db,
            admin,
            action="review.pending_manual",
            target_type="review",
            target_id=review.id,
            detail={"reason": payload.reason},
        )
        db.flush()
        recalculate_item_rating(db, review.menu_item_id)
        db.commit()
        db.refresh(review)
        return _present_admin_review(db, review)
    requested_action = payload.action or actions[payload.status]
    return moderate_review(
        review_id,
        ModerationRequest(action=requested_action, reason=payload.reason),
        db,
        admin,
    )


@router.get("/audit-logs", response_model=list[AuditLogRead])
def audit_logs(
    db: DbSession,
    admin: Manager,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[AuditLogRead]:
    rows = db.scalars(
        select(AdminAuditLog)
        .order_by(AdminAuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return [AuditLogRead.model_validate(row) for row in rows]
