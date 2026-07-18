from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def new_id() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class UserRole(StrEnum):
    USER = "user"
    REVIEWER = "reviewer"
    CAMPUS_ADMIN = "campus_admin"
    SUPER_ADMIN = "super_admin"


class ItemType(StrEnum):
    DISH = "dish"
    COMBO = "combo"


class ReviewStatus(StrEnum):
    PENDING_MACHINE = "pending_machine"
    PENDING_MANUAL = "pending_manual"
    PUBLISHED = "published"
    REJECTED = "rejected"
    HIDDEN = "hidden"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class Campus(Base, TimestampMixin):
    __tablename__ = "campuses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    center_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    center_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CampusArea(Base, TimestampMixin):
    __tablename__ = "campus_areas"
    __table_args__ = (UniqueConstraint("campus_id", "parent_id", "name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    campus_id: Mapped[str] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("campus_areas.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Category(Base, TimestampMixin):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("campus_id", "parent_id", "name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    campus_id: Mapped[str] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Tag(Base, TimestampMixin):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("campus_id", "kind", "name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    campus_id: Mapped[str] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), default="taste", nullable=False)


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), default=UserRole.USER, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class GuestSession(Base, TimestampMixin):
    __tablename__ = "guest_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    preferences: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class AuthIdentity(Base, TimestampMixin):
    """Reserved link table for future OAuth/OpenID providers."""

    __tablename__ = "auth_identities"
    __table_args__ = (UniqueConstraint("provider", "provider_subject"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    profile: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class UserProfile(Base, TimestampMixin):
    __tablename__ = "user_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    preferences: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class RefreshSession(Base, TimestampMixin):
    __tablename__ = "refresh_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    jti: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    audience: Mapped[str] = mapped_column(String(40), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AccountActionToken(Base, TimestampMixin):
    __tablename__ = "account_action_tokens"
    __table_args__ = (Index("ix_account_action_token_lookup", "purpose", "token_hash"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    purpose: Mapped[str] = mapped_column(String(40), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Merchant(Base, TimestampMixin):
    __tablename__ = "merchants"
    __table_args__ = (
        CheckConstraint("price_level >= 1 AND price_level <= 4", name="merchant_price_level"),
        Index("ix_merchants_campus_position", "campus_id", "latitude", "longitude"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    campus_id: Mapped[str] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    area_id: Mapped[str | None] = mapped_column(
        ForeignKey("campus_areas.id", ondelete="SET NULL"), index=True, nullable=True
    )
    category_id: Mapped[str | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True, nullable=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    gcj02_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    gcj02_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    price_level: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    business_hours: Mapped[str] = mapped_column(String(120), default="07:00-21:00", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class MenuItem(Base, TimestampMixin):
    __tablename__ = "menu_items"
    __table_args__ = (
        CheckConstraint("price_cents >= 0", name="menu_item_nonnegative_price"),
        CheckConstraint("rating_avg >= 0 AND rating_avg <= 5", name="menu_item_rating_range"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    campus_id: Mapped[str] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    merchant_id: Mapped[str] = mapped_column(
        ForeignKey("merchants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    category_id: Mapped[str | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True, nullable=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    item_type: Mapped[str] = mapped_column(String(20), default=ItemType.DISH, nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    rating_avg: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    review_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Favorite(Base, TimestampMixin):
    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "merchant_id", name="uq_user_favorite"),
        UniqueConstraint("guest_id", "merchant_id", name="uq_guest_favorite"),
        CheckConstraint(
            "(user_id IS NOT NULL AND guest_id IS NULL) OR "
            "(user_id IS NULL AND guest_id IS NOT NULL)",
            name="favorite_exactly_one_actor",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    campus_id: Mapped[str] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    guest_id: Mapped[str | None] = mapped_column(
        ForeignKey("guest_sessions.id", ondelete="CASCADE"), index=True, nullable=True
    )
    merchant_id: Mapped[str] = mapped_column(
        ForeignKey("merchants.id", ondelete="CASCADE"), index=True, nullable=False
    )


class Review(Base, TimestampMixin):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("user_id", "menu_item_id", name="uq_user_menu_item_review"),
        CheckConstraint("rating >= 1 AND rating <= 5", name="review_rating_range"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    campus_id: Mapped[str] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    menu_item_id: Mapped[str] = mapped_column(
        ForeignKey("menu_items.id", ondelete="CASCADE"), index=True, nullable=False
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    images: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default=ReviewStatus.PENDING_MACHINE, index=True, nullable=False
    )
    moderation_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ReviewView(Base):
    __tablename__ = "review_views"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    campus_id: Mapped[str] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    review_id: Mapped[str] = mapped_column(
        ForeignKey("reviews.id", ondelete="CASCADE"), index=True, nullable=False
    )
    viewer_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    viewer_guest_id: Mapped[str | None] = mapped_column(
        ForeignKey("guest_sessions.id", ondelete="SET NULL"), nullable=True
    )
    viewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class InteractionEvent(Base):
    __tablename__ = "interaction_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    campus_id: Mapped[str] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    actor_type: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    menu_item_id: Mapped[str | None] = mapped_column(
        ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True
    )
    merchant_id: Mapped[str | None] = mapped_column(
        ForeignKey("merchants.id", ondelete="SET NULL"), nullable=True
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    campus_id: Mapped[str] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    admin_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(String(36), nullable=False)
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    campus_id: Mapped[str] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    import_type: Mapped[str] = mapped_column("type", String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="processing", nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    success: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    errors: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    created_by_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    created_by_name: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (
        UniqueConstraint("scope", "idempotency_key", name="uq_idempotency_scope_key"),
        Index("ix_idempotency_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    scope: Mapped[str] = mapped_column(String(160), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(120), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_status: Mapped[int] = mapped_column(Integer, nullable=False)
    response_body: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(
        String(120), default="application/json", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
