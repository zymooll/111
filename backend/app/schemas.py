from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    message: str


class UserRead(ORMModel):
    id: str
    username: str
    email: EmailStr
    role: str
    is_active: bool
    email_verified: bool
    created_at: datetime


class AdminUserRead(UserRead):
    review_count: int = 0
    impact_views: int = 0
    favorite_count: int = 0
    last_active: datetime | None = None
    dietary_tags: list[str] = Field(default_factory=list)


class GuestToken(BaseModel):
    guest_id: str
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserRead


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_\-\u4e00-\u9fff]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    guest_token: str | None = None


class LoginRequest(BaseModel):
    identifier: str = Field(
        min_length=1,
        max_length=254,
        validation_alias=AliasChoices("identifier", "username"),
    )
    password: str = Field(min_length=1, max_length=128)
    guest_token: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class OAuthProviderRead(BaseModel):
    id: str
    authorize_url: str


class AccountActionResponse(BaseModel):
    message: str
    debug_token: str | None = None


class TokenRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class PasswordForgotRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(TokenRequest):
    new_password: str = Field(min_length=8, max_length=128)


class CampusRead(ORMModel):
    id: str
    name: str
    center_latitude: float
    center_longitude: float
    is_active: bool


class TreeNode(BaseModel):
    id: str
    campus_id: str
    name: str
    parent_id: str | None = None
    level: int | None = None
    icon: str | None = None
    children: list["TreeNode"] = Field(default_factory=list)


class TagRead(ORMModel):
    id: str
    campus_id: str
    name: str
    kind: str


class MerchantRead(ORMModel):
    id: str
    campus_id: str
    area_id: str | None
    category_id: str | None
    name: str
    description: str
    address: str
    latitude: float
    longitude: float
    gcj02_latitude: float
    gcj02_longitude: float
    price_level: int
    business_hours: str
    is_active: bool
    is_favorite: bool = False
    rating_avg: float = 0
    review_count: int = 0


class AdminMerchantRead(MerchantRead):
    area_name: str | None = None
    category_name: str | None = None
    dish_count: int = 0
    favorite_count: int = 0
    updated_at: datetime


class MenuItemSummary(ORMModel):
    id: str
    campus_id: str
    merchant_id: str
    category_id: str | None
    name: str
    description: str
    item_type: str
    price_cents: int
    image_url: str
    rating_avg: float
    review_count: int
    tags: list[str]
    is_active: bool
    merchant_name: str | None = None
    merchant_address: str | None = None
    recommendation_reason: str | None = None
    is_merchant_favorite: bool = False


class AdminMenuItemRead(MenuItemSummary):
    category_name: str | None = None
    updated_at: datetime


class MenuItemDetail(MenuItemSummary):
    merchant: MerchantRead
    rating_distribution: dict[str, int] = Field(default_factory=dict)


PageItem = TypeVar("PageItem")


class CursorPage(BaseModel, Generic[PageItem]):
    items: list[PageItem]
    next_cursor: str | None
    has_more: bool


class SearchSuggestion(BaseModel):
    id: str
    type: Literal["menu_item", "merchant"]
    title: str
    subtitle: str | None = None
    image_url: str | None = None


class SearchResults(BaseModel):
    menu_items: list[MenuItemSummary]
    merchants: list[MerchantRead]


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: str = Field(default="", max_length=2000)
    images: list[str] = Field(default_factory=list, max_length=9)

    @field_validator("images")
    @classmethod
    def unique_images(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("图片不能重复")
        return value


class ReviewUpdate(ReviewCreate):
    pass


class ReviewRead(ORMModel):
    id: str
    campus_id: str
    user_id: str
    username: str | None = None
    menu_item_id: str
    menu_item_name: str | None = None
    rating: int
    text: str
    images: list[str]
    status: str
    moderation_reason: str | None
    view_count: int
    created_at: datetime
    updated_at: datetime


class AdminReviewRead(ReviewRead):
    merchant_name: str | None = None
    risk_level: Literal["low", "medium", "high"] = "low"


class ReviewPage(BaseModel):
    items: list[ReviewRead]
    total: int
    next_cursor: str | None = None
    has_more: bool = False


class AdminReviewPage(BaseModel):
    items: list[AdminReviewRead]
    total: int
    next_cursor: str | None = None
    has_more: bool = False


class FavoriteRead(BaseModel):
    id: str
    campus_id: str
    merchant: MerchantRead
    created_at: datetime


class PreferencesUpdate(BaseModel):
    campus_id: str
    tastes: list[str] = Field(default_factory=list, max_length=20)
    avoid: list[str] = Field(default_factory=list, max_length=20)
    budget_max_cents: int | None = Field(default=None, ge=0, le=100_000)
    frequent_area_ids: list[str] = Field(default_factory=list, max_length=10)


class PreferencesRead(PreferencesUpdate):
    pass


class MyStats(BaseModel):
    published_reviews: int
    total_views: int
    favorite_merchants: int


class ReviewViewRequest(BaseModel):
    campus_id: str
    event_id: str = Field(min_length=8, max_length=80)


class InteractionEventIn(BaseModel):
    event_id: str = Field(min_length=8, max_length=80)
    event_type: Literal["impression", "click", "search", "favorite", "view"]
    menu_item_id: str | None = None
    merchant_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class InteractionBatch(BaseModel):
    campus_id: str
    events: list[InteractionEventIn] = Field(min_length=1, max_length=100)


class UploadRead(BaseModel):
    url: str
    content_type: str
    size: int
    width: int
    height: int


class MerchantCreate(BaseModel):
    campus_id: str
    area_id: str | None = None
    category_id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=5000)
    address: str = Field(min_length=1, max_length=255)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    gcj02_latitude: float | None = Field(default=None, ge=-90, le=90)
    gcj02_longitude: float | None = Field(default=None, ge=-180, le=180)
    price_level: int = Field(default=2, ge=1, le=4)
    business_hours: str = Field(default="07:00-21:00", max_length=120)
    is_active: bool = True


class MerchantUpdate(BaseModel):
    area_id: str | None = None
    category_id: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    address: str | None = Field(default=None, min_length=1, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    gcj02_latitude: float | None = Field(default=None, ge=-90, le=90)
    gcj02_longitude: float | None = Field(default=None, ge=-180, le=180)
    price_level: int | None = Field(default=None, ge=1, le=4)
    business_hours: str | None = Field(default=None, max_length=120)
    is_active: bool | None = None


class MenuItemCreate(BaseModel):
    campus_id: str
    merchant_id: str
    category_id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=5000)
    item_type: Literal["dish", "combo"] = "dish"
    price_cents: int = Field(ge=0, le=1_000_000)
    image_url: str = Field(min_length=1, max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=20)
    is_active: bool = True


class MenuItemUpdate(BaseModel):
    category_id: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    item_type: Literal["dish", "combo"] | None = None
    price_cents: int | None = Field(default=None, ge=0, le=1_000_000)
    image_url: str | None = Field(default=None, min_length=1, max_length=500)
    tags: list[str] | None = Field(default=None, max_length=20)
    is_active: bool | None = None


class UserAdminUpdate(BaseModel):
    is_active: bool


class ResourceStatusUpdate(BaseModel):
    is_active: bool


class UserStatusCompat(BaseModel):
    status: Literal["active", "frozen", "unverified"] | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def require_status(self):
        if self.status is None and self.is_active is None:
            raise ValueError("status 或 is_active 至少提供一个")
        return self


class PublishStatusCompat(BaseModel):
    status: Literal["online", "offline", "draft"] | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def require_status(self):
        if self.status is None and self.is_active is None:
            raise ValueError("status 或 is_active 至少提供一个")
        return self


class ReviewModerationCompat(BaseModel):
    status: Literal["pending_manual", "published", "rejected", "hidden"] | None = None
    action: Literal["publish", "reject", "hide", "restore"] | None = None
    reason: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def require_action(self):
        if self.status is None and self.action is None:
            raise ValueError("status 或 action 至少提供一个")
        return self


class ModerationRequest(BaseModel):
    action: Literal["publish", "reject", "hide", "restore"]
    reason: str = Field(default="", max_length=500)


class CategoryCreate(BaseModel):
    campus_id: str
    parent_id: str | None = None
    name: str = Field(min_length=1, max_length=80)
    icon: str | None = Field(default=None, max_length=40)
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    parent_id: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=80)
    icon: str | None = Field(default=None, max_length=40)
    sort_order: int | None = None


class TagCreate(BaseModel):
    campus_id: str
    name: str = Field(min_length=1, max_length=60)
    kind: str = Field(default="taste", min_length=1, max_length=30)


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    kind: str | None = Field(default=None, min_length=1, max_length=30)


class AreaCreate(BaseModel):
    campus_id: str
    parent_id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    level: int = Field(default=1, ge=1, le=10)
    sort_order: int = 0


class AreaUpdate(BaseModel):
    parent_id: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    level: int | None = Field(default=None, ge=1, le=10)
    sort_order: int | None = None


class AuditLogRead(ORMModel):
    id: str
    campus_id: str
    admin_user_id: str
    action: str
    target_type: str
    target_id: str
    detail: dict[str, Any]
    created_at: datetime


class ImportErrorRead(BaseModel):
    row: int
    field: str
    message: str


class ImportValidationRead(BaseModel):
    total: int
    valid: int
    invalid: int
    errors: list[ImportErrorRead]


class ImportJobRead(BaseModel):
    id: str
    campus_id: str
    file_name: str
    type: Literal["areas", "merchants", "menu_items"]
    status: Literal["validating", "processing", "completed", "failed"]
    progress: int
    total: int
    success: int
    failed: int
    created_by: str
    created_at: datetime
