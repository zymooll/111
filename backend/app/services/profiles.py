from __future__ import annotations

from collections import Counter
from typing import Any

from sqlalchemy import String, cast, or_, select
from sqlalchemy.orm import Session

from app.models import GuestSession, InteractionEvent, MenuItem, Merchant, UserProfile


EVENT_WEIGHTS = {
    "click": 3,
    "favorite": 4,
    "view": 2,
}


def recommendation_profile(
    db: Session,
    principal: object | None,
    *,
    campus_id: str,
    event_limit: int = 120,
) -> dict[str, Any]:
    """Build a de-identified profile from explicit preferences and recent behavior.

    Impressions are intentionally excluded from preference inference so the system does
    not reinforce items merely because it displayed them. The resulting dictionary is
    safe to send to the optional DeepSeek reranker: it contains tags, campus area IDs,
    budget and aggregate signal counts, but no account identifiers or raw review text.
    """

    explicit = _explicit_preferences(db, principal, campus_id)
    if principal is None:
        return explicit

    kind = str(getattr(principal, "kind", ""))
    actor_id = str(getattr(principal, "id", ""))
    if not kind or not actor_id:
        return explicit

    events = list(
        db.scalars(
            select(InteractionEvent)
            .where(
                InteractionEvent.actor_type == kind,
                InteractionEvent.actor_id == actor_id,
                InteractionEvent.campus_id == campus_id,
            )
            .order_by(InteractionEvent.occurred_at.desc())
            .limit(event_limit)
        ).all()
    )
    if not events:
        return explicit

    item_ids = {event.menu_item_id for event in events if event.menu_item_id}
    merchant_ids = {event.merchant_id for event in events if event.merchant_id}
    item_context: dict[str, tuple[list[str], str | None]] = {}
    if item_ids:
        rows = db.execute(
            select(MenuItem.id, MenuItem.tags, Merchant.area_id)
            .join(Merchant, Merchant.id == MenuItem.merchant_id)
            .where(MenuItem.id.in_(item_ids))
            .where(MenuItem.campus_id == campus_id)
        ).all()
        item_context = {
            str(item_id): ([str(tag) for tag in (tags or [])], area_id)
            for item_id, tags, area_id in rows
        }

    merchant_areas: dict[str, str | None] = {}
    if merchant_ids:
        merchant_areas = {
            str(merchant_id): area_id
            for merchant_id, area_id in db.execute(
                select(Merchant.id, Merchant.area_id).where(Merchant.id.in_(merchant_ids))
                .where(Merchant.campus_id == campus_id)
            ).all()
        }

    tag_scores: Counter[str] = Counter()
    area_scores: Counter[str] = Counter()
    search_queries: list[str] = []
    weighted_signals = 0
    for event in events:
        weight = EVENT_WEIGHTS.get(event.event_type, 0)
        if weight:
            weighted_signals += 1
            tags, item_area = item_context.get(str(event.menu_item_id), ([], None))
            tag_scores.update({tag: weight for tag in tags})
            area_id = item_area or merchant_areas.get(str(event.merchant_id))
            if area_id:
                area_scores[str(area_id)] += weight
        if event.event_type == "search" and len(search_queries) < 5:
            raw_query = (event.metadata_json or {}).get("query")
            if isinstance(raw_query, str) and raw_query.strip():
                search_queries.append(raw_query.strip()[:40])

    for search_query in _deduplicate(search_queries):
        escaped_query = (
            search_query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        matched_items = db.scalars(
            select(MenuItem)
            .where(
                MenuItem.is_active.is_(True),
                MenuItem.campus_id == campus_id,
                or_(
                    MenuItem.name.like(f"%{escaped_query}%", escape="\\"),
                    cast(MenuItem.tags, String).like(f"%{escaped_query}%", escape="\\"),
                ),
            )
            .limit(5)
        ).all()
        for item in matched_items:
            tag_scores.update({str(tag): 2 for tag in (item.tags or [])})

    avoid = {
        str(value)
        for value in explicit.get("avoid", [])
        if isinstance(value, (str, int, float))
    }
    explicit_tastes = _string_list(explicit.get("tastes"))
    inferred_tastes = [tag for tag, _score in tag_scores.most_common(6) if tag not in avoid]
    explicit_areas = _string_list(explicit.get("frequent_area_ids"))
    inferred_areas = [area_id for area_id, _score in area_scores.most_common(4)]

    profile = dict(explicit)
    profile["tastes"] = _deduplicate([*explicit_tastes, *inferred_tastes])[:12]
    profile["frequent_area_ids"] = _deduplicate([*explicit_areas, *inferred_areas])[:10]
    profile["behavior_profile"] = {
        "signal_count": weighted_signals,
        "inferred_tastes": inferred_tastes,
        "search_signal_count": len(_deduplicate(search_queries)),
    }
    return profile


def _explicit_preferences(
    db: Session, principal: object | None, campus_id: str
) -> dict[str, Any]:
    if principal and getattr(principal, "is_user", False):
        profile = db.scalar(
            select(UserProfile).where(UserProfile.user_id == getattr(principal, "id", ""))
        )
        preferences = dict(profile.preferences or {}) if profile else {}
        return preferences if preferences.get("campus_id") == campus_id else {}
    if principal and getattr(principal, "is_guest", False):
        guest = db.get(GuestSession, getattr(principal, "id", ""))
        preferences = dict(guest.preferences or {}) if guest else {}
        return preferences if preferences.get("campus_id") == campus_id else {}
    return {}


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, (str, int, float))]


def _deduplicate(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))
