from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import GuestSession, UserProfile
from app.services.affinity import affinity_signals, load_affinity


def recommendation_profile(
    db: Session,
    principal: object | None,
    *,
    campus_id: str,
) -> dict[str, Any]:
    """Combine explicit preferences with the materialised behaviour affinity.

    行为信号来自 actor_affinities（写入时增量维护），读路径只有一次主键查询——不再扫描
    最近 N 条原始事件，也不再为每个历史搜索词各发一次 LIKE。

    返回值可以安全地交给可选的 DeepSeek 重排：只含标签、校园区域 ID、预算与聚合信号数，
    不含账号标识，也不含原始搜索词或评价文本。
    """
    explicit = _explicit_preferences(db, principal, campus_id)
    if principal is None:
        return explicit

    kind = str(getattr(principal, "kind", ""))
    actor_id = str(getattr(principal, "id", ""))
    if not kind or not actor_id:
        return explicit

    signals = affinity_signals(
        load_affinity(db, campus_id=campus_id, actor_type=kind, actor_id=actor_id)
    )
    if not signals["signal_count"] and not signals["search_signal_count"]:
        profile = dict(explicit)
        profile["profile_revision"] = signals["revision"]
        return profile

    avoid = {
        str(value)
        for value in explicit.get("avoid", [])
        if isinstance(value, (str, int, float))
    }
    inferred_tastes = [tag for tag in signals["tastes"][:6] if tag not in avoid]

    profile = dict(explicit)
    profile["tastes"] = _deduplicate([*_string_list(explicit.get("tastes")), *inferred_tastes])[:12]
    profile["frequent_area_ids"] = _deduplicate(
        [*_string_list(explicit.get("frequent_area_ids")), *signals["areas"][:4]]
    )[:10]
    profile["behavior_profile"] = {
        "signal_count": signals["signal_count"],
        "inferred_tastes": inferred_tastes,
        "search_signal_count": signals["search_signal_count"],
    }
    profile["profile_revision"] = signals["revision"]
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
