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
    Tag,
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
    CursorPage,
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
    TagCreate,
    TagRead,
    TagUpdate,
    UserAdminUpdate,
    UserRead,
    UserStatusCompat,
)
from app.services.ratings import recalculate_item_rating
from app.services.accounts import RESET_PASSWORD, issue_account_token, reset_link, send_account_email
from app.services.campuses import (
    require_area,
    require_campus,
    require_category,
    require_menu_item,
    require_merchant,
    require_review,
    require_tag,
)
from app.services.hierarchy import area_with_descendants, category_with_descendants
from app.services.pagination import before_cursor, page_metadata


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
    campus_id: str,
    detail: dict | None = None,
) -> None:
    db.add(
        AdminAuditLog(
            campus_id=campus_id,
            admin_user_id=admin.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail or {},
        )
    )


def _present_admin_user(db, user: User, campus_id: str) -> AdminUserRead:
    review_count, impact_views = db.execute(
        select(func.count(Review.id), func.coalesce(func.sum(Review.view_count), 0)).where(
            Review.user_id == user.id,
            Review.campus_id == campus_id,
            Review.deleted_at.is_(None),
        )
    ).one()
    favorite_count = db.scalar(
        select(func.count(Favorite.id)).where(
            Favorite.user_id == user.id, Favorite.campus_id == campus_id
        )
    ) or 0
    last_active = db.scalar(
        select(func.max(InteractionEvent.occurred_at)).where(
            InteractionEvent.actor_type == "user",
            InteractionEvent.actor_id == user.id,
            InteractionEvent.campus_id == campus_id,
        )
    )
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    preferences = profile.preferences if profile else {}
    if preferences.get("campus_id") != campus_id:
        preferences = {}
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


def _validate_menu_item_tags(db, campus_id: str, tags: list[str] | None) -> None:
    if tags is None:
        return
    normalized = {value.strip() for value in tags if value.strip()}
    known = set(
        db.scalars(
            select(Tag.name).where(
                Tag.campus_id == campus_id,
                Tag.name.in_(normalized),
            )
        ).all()
    )
    unknown = sorted(normalized - known)
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"标签不属于当前校园字典：{'、'.join(unknown)}",
        )


@router.get("/dashboard")
def dashboard(db: DbSession, admin: CurrentAdmin, campus_id: str) -> dict[str, int]:
    require_campus(db, campus_id)
    return {
        "users": int(db.scalar(select(func.count(User.id))) or 0),
        "active_merchants": int(
            db.scalar(
                select(func.count(Merchant.id)).where(
                    Merchant.campus_id == campus_id, Merchant.is_active.is_(True)
                )
            )
            or 0
        ),
        "active_menu_items": int(
            db.scalar(
                select(func.count(MenuItem.id)).where(
                    MenuItem.campus_id == campus_id, MenuItem.is_active.is_(True)
                )
            )
            or 0
        ),
        "pending_reviews": int(
            db.scalar(
                select(func.count(Review.id)).where(
                    Review.status.in_(
                        [ReviewStatus.PENDING_MACHINE, ReviewStatus.PENDING_MANUAL]
                    ),
                    Review.campus_id == campus_id,
                    Review.deleted_at.is_(None),
                )
            )
            or 0
        ),
    }


@router.get("/users", response_model=CursorPage[AdminUserRead])
def list_users(
    db: DbSession,
    admin: Manager,
    campus_id: str,
    search: str | None = Query(default=None, max_length=100),
    active: bool | None = None,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> CursorPage[AdminUserRead]:
    require_campus(db, campus_id)
    query = select(User)
    if search:
        keyword = f"%{search}%"
        query = query.where(or_(User.username.like(keyword), User.email.like(keyword)))
    if active is not None:
        query = query.where(User.is_active == active)
    cursor_condition = before_cursor(User.created_at, User.id, cursor)
    if cursor_condition is not None:
        query = query.where(cursor_condition)
    rows = list(
        db.scalars(
            query.order_by(User.created_at.desc(), User.id.desc()).limit(limit + 1)
        ).all()
    )
    visible, next_cursor, has_more = page_metadata(rows, limit)
    return CursorPage(
        items=[_present_admin_user(db, row, campus_id) for row in visible],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.patch("/users/{user_id}", response_model=AdminUserRead)
def update_user(
    user_id: str,
    payload: UserAdminUpdate,
    db: DbSession,
    admin: Manager,
    campus_id: str,
) -> AdminUserRead:
    require_campus(db, campus_id)
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
        campus_id=campus_id,
    )
    db.commit()
    db.refresh(user)
    return _present_admin_user(db, user, campus_id)


@router.patch("/users/{user_id}/status", response_model=AdminUserRead)
def update_user_status_compat(
    user_id: str,
    payload: UserStatusCompat,
    db: DbSession,
    admin: Manager,
    campus_id: str,
) -> AdminUserRead:
    require_campus(db, campus_id)
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
        campus_id=campus_id,
    )
    db.commit()
    db.refresh(user)
    return _present_admin_user(db, user, campus_id)


@router.post("/users/{user_id}/password-reset", response_model=Message, status_code=202)
def trigger_password_reset(
    user_id: str,
    request: Request,
    db: DbSession,
    admin: Manager,
    campus_id: str,
) -> Message:
    require_campus(db, campus_id)
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
        campus_id=campus_id,
        detail={"email": user.email, "email_sent": sent},
    )
    db.commit()
    return Message(message="密码重置邮件已发送" if sent else "密码重置请求已记录")


@router.get("/merchants", response_model=CursorPage[AdminMerchantRead])
def list_merchants(
    db: DbSession,
    admin: Manager,
    campus_id: str,
    search: str | None = Query(default=None, max_length=100),
    active: bool | None = None,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> CursorPage[AdminMerchantRead]:
    require_campus(db, campus_id)
    query = select(Merchant).where(Merchant.campus_id == campus_id)
    if search:
        query = query.where(Merchant.name.like(f"%{search}%"))
    if active is not None:
        query = query.where(Merchant.is_active == active)
    cursor_condition = before_cursor(Merchant.created_at, Merchant.id, cursor)
    if cursor_condition is not None:
        query = query.where(cursor_condition)
    rows = list(
        db.scalars(
            query.order_by(Merchant.created_at.desc(), Merchant.id.desc()).limit(limit + 1)
        ).all()
    )
    visible, next_cursor, has_more = page_metadata(rows, limit)
    return CursorPage(
        items=[_present_admin_merchant(db, row) for row in visible],
        next_cursor=next_cursor,
        has_more=has_more,
    )


def _validate_merchant_refs(db, payload: MerchantCreate | MerchantUpdate, merchant: Merchant | None = None) -> None:
    campus_id = getattr(payload, "campus_id", None) or (merchant.campus_id if merchant else None)
    if not campus_id:
        raise HTTPException(status_code=422, detail="campus_id 不能为空")
    require_campus(db, campus_id)
    area_id = payload.area_id
    if area_id is not None:
        require_area(db, campus_id, area_id)
    category_id = payload.category_id
    if category_id is not None:
        require_category(db, campus_id, category_id)


@router.get("/categories")
def admin_categories(db: DbSession, admin: Manager, campus_id: str) -> list[dict]:
    require_campus(db, campus_id)
    rows = db.scalars(
        select(Category)
        .where(Category.campus_id == campus_id)
        .order_by(Category.sort_order, Category.name)
    ).all()
    return [
        {
            "id": row.id,
            "campus_id": row.campus_id,
            "parent_id": row.parent_id,
            "name": row.name,
            "icon": row.icon,
            "sort_order": row.sort_order,
        }
        for row in rows
    ]


@router.post("/categories", status_code=201)
def create_category(payload: CategoryCreate, db: DbSession, admin: Manager) -> dict:
    require_campus(db, payload.campus_id)
    require_category(db, payload.campus_id, payload.parent_id)
    category = Category(**payload.model_dump())
    db.add(category)
    db.flush()
    _audit(
        db,
        admin,
        action="category.create",
        target_type="category",
        target_id=category.id,
        campus_id=category.campus_id,
    )
    db.commit()
    return {
        "id": category.id,
        "campus_id": category.campus_id,
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
    campus_id: str,
) -> dict:
    require_campus(db, campus_id)
    category = require_category(db, campus_id, category_id)
    changes = payload.model_dump(exclude_unset=True)
    parent_id = changes.get("parent_id")
    if parent_id in category_with_descendants(db, category.id, campus_id):
        raise HTTPException(status_code=422, detail="上级品类不能是自身或其下级")
    require_category(db, campus_id, parent_id)
    for key, value in changes.items():
        setattr(category, key, value)
    _audit(
        db,
        admin,
        action="category.update",
        target_type="category",
        target_id=category.id,
        campus_id=campus_id,
    )
    db.commit()
    return {
        "id": category.id,
        "campus_id": category.campus_id,
        "parent_id": category.parent_id,
        "name": category.name,
        "icon": category.icon,
        "sort_order": category.sort_order,
    }


@router.delete("/categories/{category_id}", response_model=Message)
def delete_category(
    category_id: str, db: DbSession, admin: Manager, campus_id: str
) -> Message:
    require_campus(db, campus_id)
    category = require_category(db, campus_id, category_id)
    in_use = any(
        [
            db.scalar(select(func.count(Category.id)).where(Category.parent_id == category_id)),
            db.scalar(select(func.count(Merchant.id)).where(Merchant.category_id == category_id)),
            db.scalar(select(func.count(MenuItem.id)).where(MenuItem.category_id == category_id)),
        ]
    )
    if in_use:
        raise HTTPException(status_code=409, detail="品类存在下级或业务引用，不能删除")
    _audit(
        db,
        admin,
        action="category.delete",
        target_type="category",
        target_id=category.id,
        campus_id=campus_id,
    )
    db.delete(category)
    db.commit()
    return Message(message="品类已删除")


@router.get("/tags", response_model=list[TagRead])
def admin_tags(
    db: DbSession, admin: Manager, campus_id: str, kind: str | None = None
) -> list[TagRead]:
    require_campus(db, campus_id)
    query = select(Tag).where(Tag.campus_id == campus_id)
    if kind:
        query = query.where(Tag.kind == kind)
    return [
        TagRead.model_validate(row)
        for row in db.scalars(query.order_by(Tag.kind, Tag.name)).all()
    ]


@router.post("/tags", response_model=TagRead, status_code=201)
def create_tag(payload: TagCreate, db: DbSession, admin: Manager) -> TagRead:
    require_campus(db, payload.campus_id)
    duplicate = db.scalar(
        select(Tag.id).where(
            Tag.campus_id == payload.campus_id,
            Tag.kind == payload.kind,
            Tag.name == payload.name,
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="同类标签名称已存在")
    tag = Tag(**payload.model_dump())
    db.add(tag)
    db.flush()
    _audit(
        db,
        admin,
        action="tag.create",
        target_type="tag",
        target_id=tag.id,
        campus_id=tag.campus_id,
    )
    db.commit()
    db.refresh(tag)
    return TagRead.model_validate(tag)


@router.patch("/tags/{tag_id}", response_model=TagRead)
def update_tag(
    tag_id: str,
    payload: TagUpdate,
    db: DbSession,
    admin: Manager,
    campus_id: str,
) -> TagRead:
    require_campus(db, campus_id)
    tag = require_tag(db, campus_id, tag_id)
    changes = payload.model_dump(exclude_unset=True)
    old_name = tag.name
    next_name = changes.get("name", tag.name)
    next_kind = changes.get("kind", tag.kind)
    duplicate = db.scalar(
        select(Tag.id).where(
            Tag.campus_id == campus_id,
            Tag.kind == next_kind,
            Tag.name == next_name,
            Tag.id != tag.id,
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="同类标签名称已存在")
    for key, value in changes.items():
        setattr(tag, key, value)
    if tag.name != old_name:
        for item in db.scalars(
            select(MenuItem).where(MenuItem.campus_id == campus_id)
        ).all():
            if old_name in (item.tags or []):
                item.tags = [tag.name if value == old_name else value for value in item.tags]
    _audit(
        db,
        admin,
        action="tag.update",
        target_type="tag",
        target_id=tag.id,
        campus_id=campus_id,
        detail={"fields": sorted(changes)},
    )
    db.commit()
    db.refresh(tag)
    return TagRead.model_validate(tag)


@router.delete("/tags/{tag_id}", response_model=Message)
def delete_tag(
    tag_id: str, db: DbSession, admin: Manager, campus_id: str
) -> Message:
    require_campus(db, campus_id)
    tag = require_tag(db, campus_id, tag_id)
    referenced = any(
        tag.name in (item.tags or [])
        for item in db.scalars(
            select(MenuItem).where(MenuItem.campus_id == campus_id)
        ).all()
    )
    if referenced:
        raise HTTPException(status_code=409, detail="标签已被菜品引用，不能删除")
    _audit(
        db,
        admin,
        action="tag.delete",
        target_type="tag",
        target_id=tag.id,
        campus_id=campus_id,
    )
    db.delete(tag)
    db.commit()
    return Message(message="标签已删除")


@router.get("/areas")
def admin_areas(
    db: DbSession,
    admin: Manager,
    campus_id: str,
) -> list[dict]:
    require_campus(db, campus_id)
    query = select(CampusArea).where(CampusArea.campus_id == campus_id)
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
    require_campus(db, payload.campus_id)
    require_area(db, payload.campus_id, payload.parent_id)
    area = CampusArea(**payload.model_dump())
    db.add(area)
    db.flush()
    _audit(
        db,
        admin,
        action="area.create",
        target_type="area",
        target_id=area.id,
        campus_id=area.campus_id,
    )
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
    campus_id: str,
) -> dict:
    require_campus(db, campus_id)
    area = db.get(CampusArea, area_id)
    if area is None or area.campus_id != campus_id:
        raise HTTPException(status_code=404, detail="校园地点不存在")
    changes = payload.model_dump(exclude_unset=True)
    parent_id = changes.get("parent_id")
    if parent_id in area_with_descendants(db, area.id, campus_id):
        raise HTTPException(status_code=422, detail="上级地点不能是自身或其下级")
    if parent_id:
        parent = db.get(CampusArea, parent_id)
        if parent is None or parent.campus_id != area.campus_id:
            raise HTTPException(status_code=422, detail="上级地点不存在或不属于该校园")
    for key, value in changes.items():
        setattr(area, key, value)
    _audit(
        db,
        admin,
        action="area.update",
        target_type="area",
        target_id=area.id,
        campus_id=campus_id,
    )
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
def delete_area(
    area_id: str, db: DbSession, admin: Manager, campus_id: str
) -> Message:
    require_campus(db, campus_id)
    area = db.get(CampusArea, area_id)
    if area is None or area.campus_id != campus_id:
        raise HTTPException(status_code=404, detail="校园地点不存在")
    in_use = any(
        [
            db.scalar(select(func.count(CampusArea.id)).where(CampusArea.parent_id == area_id)),
            db.scalar(select(func.count(Merchant.id)).where(Merchant.area_id == area_id)),
        ]
    )
    if in_use:
        raise HTTPException(status_code=409, detail="地点存在下级或商家引用，不能删除")
    _audit(
        db,
        admin,
        action="area.delete",
        target_type="area",
        target_id=area.id,
        campus_id=campus_id,
    )
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
    _audit(
        db,
        admin,
        action="merchant.create",
        target_type="merchant",
        target_id=merchant.id,
        campus_id=merchant.campus_id,
    )
    db.commit()
    db.refresh(merchant)
    return _present_admin_merchant(db, merchant)


@router.patch("/merchants/{merchant_id}", response_model=AdminMerchantRead)
def update_merchant(
    merchant_id: str,
    payload: MerchantUpdate,
    db: DbSession,
    admin: Manager,
    campus_id: str,
) -> AdminMerchantRead:
    require_campus(db, campus_id)
    merchant = require_merchant(db, campus_id, merchant_id)
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
        campus_id=campus_id,
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
    campus_id: str,
) -> AdminMerchantRead:
    require_campus(db, campus_id)
    merchant = require_merchant(db, campus_id, merchant_id)
    requested_status = payload.status or ("online" if payload.is_active else "offline")
    merchant.is_active = requested_status == "online"
    _audit(
        db,
        admin,
        action=f"merchant.status.{requested_status}",
        target_type="merchant",
        target_id=merchant.id,
        campus_id=campus_id,
    )
    db.commit()
    db.refresh(merchant)
    return _present_admin_merchant(db, merchant)


@router.delete("/merchants/{merchant_id}", response_model=Message)
def deactivate_merchant(
    merchant_id: str, db: DbSession, admin: Manager, campus_id: str
) -> Message:
    require_campus(db, campus_id)
    merchant = require_merchant(db, campus_id, merchant_id)
    merchant.is_active = False
    _audit(
        db,
        admin,
        action="merchant.deactivate",
        target_type="merchant",
        target_id=merchant.id,
        campus_id=campus_id,
    )
    db.commit()
    return Message(message="商家已下架")


@router.get("/menu-items", response_model=CursorPage[AdminMenuItemRead])
def list_menu_items(
    db: DbSession,
    admin: Manager,
    campus_id: str,
    merchant_id: str | None = None,
    active: bool | None = None,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> CursorPage[AdminMenuItemRead]:
    require_campus(db, campus_id)
    query = (
        select(MenuItem, Merchant)
        .join(Merchant, Merchant.id == MenuItem.merchant_id)
        .where(MenuItem.campus_id == campus_id, Merchant.campus_id == campus_id)
    )
    if merchant_id:
        query = query.where(MenuItem.merchant_id == merchant_id)
    if active is not None:
        query = query.where(MenuItem.is_active == active)
    cursor_condition = before_cursor(MenuItem.created_at, MenuItem.id, cursor)
    if cursor_condition is not None:
        query = query.where(cursor_condition)
    rows = list(
        db.execute(
            query.order_by(MenuItem.created_at.desc(), MenuItem.id.desc()).limit(limit + 1)
        ).all()
    )
    has_more = len(rows) > limit
    visible = rows[:limit]
    next_cursor = None
    if has_more and visible:
        from app.services.pagination import encode_cursor

        next_cursor = encode_cursor(visible[-1][0].created_at, visible[-1][0].id)
    return CursorPage(
        items=[_present_admin_item(db, item, merchant) for item, merchant in visible],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.post("/menu-items", response_model=AdminMenuItemRead, status_code=201)
def create_menu_item(
    payload: MenuItemCreate,
    db: DbSession,
    admin: Manager,
) -> AdminMenuItemRead:
    require_campus(db, payload.campus_id)
    merchant = require_merchant(db, payload.campus_id, payload.merchant_id)
    require_category(db, payload.campus_id, payload.category_id)
    _validate_menu_item_tags(db, payload.campus_id, payload.tags)
    item = MenuItem(**payload.model_dump())
    db.add(item)
    db.flush()
    _audit(
        db,
        admin,
        action="menu_item.create",
        target_type="menu_item",
        target_id=item.id,
        campus_id=item.campus_id,
    )
    db.commit()
    db.refresh(item)
    return _present_admin_item(db, item, merchant)


@router.patch("/menu-items/{menu_item_id}", response_model=AdminMenuItemRead)
def update_menu_item(
    menu_item_id: str,
    payload: MenuItemUpdate,
    db: DbSession,
    admin: Manager,
    campus_id: str,
) -> AdminMenuItemRead:
    require_campus(db, campus_id)
    item = require_menu_item(db, campus_id, menu_item_id)
    require_category(db, campus_id, payload.category_id)
    _validate_menu_item_tags(db, campus_id, payload.tags)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(item, key, value)
    _audit(
        db,
        admin,
        action="menu_item.update",
        target_type="menu_item",
        target_id=item.id,
        campus_id=campus_id,
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
    campus_id: str,
) -> AdminMenuItemRead:
    require_campus(db, campus_id)
    item = require_menu_item(db, campus_id, menu_item_id)
    requested_status = payload.status or ("online" if payload.is_active else "offline")
    item.is_active = requested_status == "online"
    _audit(
        db,
        admin,
        action=f"menu_item.status.{requested_status}",
        target_type="menu_item",
        target_id=item.id,
        campus_id=campus_id,
    )
    db.commit()
    db.refresh(item)
    merchant = db.get(Merchant, item.merchant_id)
    return _present_admin_item(db, item, merchant)


@router.delete("/menu-items/{menu_item_id}", response_model=Message)
def deactivate_menu_item(
    menu_item_id: str, db: DbSession, admin: Manager, campus_id: str
) -> Message:
    require_campus(db, campus_id)
    item = require_menu_item(db, campus_id, menu_item_id)
    item.is_active = False
    _audit(
        db,
        admin,
        action="menu_item.deactivate",
        target_type="menu_item",
        target_id=item.id,
        campus_id=campus_id,
    )
    db.commit()
    return Message(message="菜品已下架")


@router.get("/reviews", response_model=AdminReviewPage)
def list_reviews(
    db: DbSession,
    admin: CurrentAdmin,
    campus_id: str,
    review_status: str | None = Query(default=None, alias="status"),
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> AdminReviewPage:
    require_campus(db, campus_id)
    query = select(Review).where(
        Review.campus_id == campus_id, Review.deleted_at.is_(None)
    )
    count_query = select(func.count(Review.id)).where(
        Review.campus_id == campus_id, Review.deleted_at.is_(None)
    )
    if review_status:
        query = query.where(Review.status == review_status)
        count_query = count_query.where(Review.status == review_status)
    total = int(db.scalar(count_query) or 0)
    cursor_condition = before_cursor(Review.created_at, Review.id, cursor)
    if cursor_condition is not None:
        query = query.where(cursor_condition)
    rows = list(
        db.scalars(
            query.order_by(Review.created_at.desc(), Review.id.desc()).limit(limit + 1)
        ).all()
    )
    visible, next_cursor, has_more = page_metadata(rows, limit)
    return AdminReviewPage(
        items=[_present_admin_review(db, row) for row in visible],
        total=total,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.post("/reviews/{review_id}/moderate", response_model=AdminReviewRead)
def moderate_review(
    review_id: str,
    payload: ModerationRequest,
    db: DbSession,
    admin: CurrentAdmin,
    campus_id: str,
) -> AdminReviewRead:
    require_campus(db, campus_id)
    review = require_review(db, campus_id, review_id)
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
        campus_id=campus_id,
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
    campus_id: str,
) -> AdminReviewRead:
    actions = {
        "published": "publish",
        "rejected": "reject",
        "hidden": "hide",
    }
    if payload.status == "pending_manual":
        require_campus(db, campus_id)
        review = require_review(db, campus_id, review_id)
        review.status = ReviewStatus.PENDING_MANUAL
        review.moderation_reason = payload.reason or None
        _audit(
            db,
            admin,
            action="review.pending_manual",
            target_type="review",
            target_id=review.id,
            campus_id=campus_id,
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
        campus_id,
    )


@router.get("/audit-logs", response_model=CursorPage[AuditLogRead])
def audit_logs(
    db: DbSession,
    admin: Manager,
    campus_id: str,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> CursorPage[AuditLogRead]:
    require_campus(db, campus_id)
    query = select(AdminAuditLog).where(AdminAuditLog.campus_id == campus_id)
    cursor_condition = before_cursor(AdminAuditLog.created_at, AdminAuditLog.id, cursor)
    if cursor_condition is not None:
        query = query.where(cursor_condition)
    rows = list(
        db.scalars(
            query.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).limit(
                limit + 1
            )
        ).all()
    )
    visible, next_cursor, has_more = page_metadata(rows, limit)
    return CursorPage(
        items=[AuditLogRead.model_validate(row) for row in visible],
        next_cursor=next_cursor,
        has_more=has_more,
    )
