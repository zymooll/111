from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.api.presenters import present_review
from app.dependencies import CurrentUser, DbSession, PrincipalRequired
from app.models import Favorite, GuestSession, Review, ReviewStatus, UserProfile
from app.schemas import MyStats, PreferencesRead, PreferencesUpdate, ReviewPage
from app.services.campuses import require_area, require_campus
from app.services.pagination import before_cursor, page_metadata


router = APIRouter(tags=["个人中心"])


@router.get("/me/reviews", response_model=ReviewPage)
def my_reviews(
    db: DbSession,
    user: CurrentUser,
    campus_id: str,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ReviewPage:
    require_campus(db, campus_id)
    conditions = (
        Review.campus_id == campus_id,
        Review.user_id == user.id,
        Review.deleted_at.is_(None),
    )
    total = int(db.scalar(select(func.count(Review.id)).where(*conditions)) or 0)
    query = select(Review).where(*conditions)
    cursor_condition = before_cursor(Review.created_at, Review.id, cursor)
    if cursor_condition is not None:
        query = query.where(cursor_condition)
    rows = list(
        db.scalars(
            query.order_by(Review.created_at.desc(), Review.id.desc()).limit(limit + 1)
        ).all()
    )
    visible, next_cursor, has_more = page_metadata(rows, limit)
    return ReviewPage(
        items=[present_review(db, row) for row in visible],
        total=total,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/me/stats", response_model=MyStats)
def my_stats(db: DbSession, user: CurrentUser, campus_id: str) -> MyStats:
    require_campus(db, campus_id)
    published, total_views = db.execute(
        select(func.count(Review.id), func.coalesce(func.sum(Review.view_count), 0)).where(
            Review.user_id == user.id,
            Review.campus_id == campus_id,
            Review.status == ReviewStatus.PUBLISHED,
            Review.deleted_at.is_(None),
        )
    ).one()
    favorite_count = db.scalar(
        select(func.count(Favorite.id)).where(
            Favorite.user_id == user.id, Favorite.campus_id == campus_id
        )
    ) or 0
    return MyStats(
        published_reviews=int(published or 0),
        total_views=int(total_views or 0),
        favorite_merchants=int(favorite_count),
    )


@router.get("/me/preferences", response_model=PreferencesRead)
def get_preferences(
    db: DbSession, principal: PrincipalRequired, campus_id: str
) -> PreferencesRead:
    require_campus(db, campus_id)
    if principal.is_user:
        profile = db.scalar(select(UserProfile).where(UserProfile.user_id == principal.id))
        raw = profile.preferences if profile else {}
    else:
        guest = db.get(GuestSession, principal.id)
        raw = guest.preferences if guest else {}
    if not raw or raw.get("campus_id") != campus_id:
        raw = {
            "campus_id": campus_id,
            "tastes": [],
            "avoid": [],
            "frequent_area_ids": [],
        }
    return PreferencesRead.model_validate(raw)


@router.put("/me/preferences", response_model=PreferencesRead)
def update_preferences(
    payload: PreferencesUpdate,
    db: DbSession,
    principal: PrincipalRequired,
) -> PreferencesRead:
    require_campus(db, payload.campus_id)
    data = payload.model_dump()
    for area_id in payload.frequent_area_ids:
        require_area(db, payload.campus_id, area_id)
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
