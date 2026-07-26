"""Incremental taste/area affinity maintained at write time.

原先每次推荐请求都要扫最近 120 条原始事件、再为每个搜索词各发一次 LIKE 查询。这里把
这份开销挪到行为事件写入的那一刻摊还：一批事件只解析一次菜品标签与区域，折算进物化
的亲和度分数。读路径因此退化为一次主键查询。

衰减用"懒惰指数衰减"：分数不定时全表重算，而是在每次写入时按 decayed_at 到现在的间隔
一次性折算。等价于连续衰减，但不需要任何定时扫描。
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import ActorAffinity, InteractionEvent, MenuItem, MenuItemTag, Merchant

logger = logging.getLogger(__name__)

#: 曝光(impression)刻意不计权：系统不该因为"自己展示过"就强化某个菜品。
EVENT_WEIGHTS: dict[str, float] = {
    "click": 3.0,
    "favorite": 4.0,
    "view": 2.0,
}
SEARCH_MATCH_WEIGHT = 2.0
SEARCH_MATCH_LIMIT = 5

HALF_LIFE_DAYS = 14.0
#: 低于该值的分数直接丢弃，避免字典无限增长。
SCORE_EPSILON = 0.05
MAX_TAGS = 40
MAX_AREAS = 20


def decay_multiplier(elapsed: timedelta) -> float:
    seconds = max(0.0, elapsed.total_seconds())
    half_life_seconds = HALF_LIFE_DAYS * 86400
    return 0.5 ** (seconds / half_life_seconds)


def _prune(scores: dict[str, float], limit: int) -> dict[str, float]:
    kept = [(key, value) for key, value in scores.items() if value >= SCORE_EPSILON]
    kept.sort(key=lambda pair: pair[1], reverse=True)
    return {key: round(value, 4) for key, value in kept[:limit]}


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _resolve_context(
    db: Session, campus_id: str, events: list[InteractionEvent]
) -> tuple[dict[str, tuple[list[str], str | None]], dict[str, str | None]]:
    """One query per batch for item tags/areas, one for merchant areas."""
    item_ids = {event.menu_item_id for event in events if event.menu_item_id}
    merchant_ids = {event.merchant_id for event in events if event.merchant_id}

    item_context: dict[str, tuple[list[str], str | None]] = {}
    if item_ids:
        rows = db.execute(
            select(MenuItem.id, MenuItem.tags, Merchant.area_id)
            .join(Merchant, Merchant.id == MenuItem.merchant_id)
            .where(MenuItem.id.in_(item_ids), MenuItem.campus_id == campus_id)
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
                select(Merchant.id, Merchant.area_id).where(
                    Merchant.id.in_(merchant_ids), Merchant.campus_id == campus_id
                )
            ).all()
        }
    return item_context, merchant_areas


def _search_tags(db: Session, campus_id: str, queries: list[str]) -> dict[str, float]:
    """Resolve搜索词 → 标签一次，写入时摊还，读路径不再为此发查询。"""
    gained: dict[str, float] = defaultdict(float)
    for raw in dict.fromkeys(queries):
        escaped = _escape_like(raw)
        matched = db.scalars(
            select(MenuItem)
            .where(
                MenuItem.is_active.is_(True),
                MenuItem.campus_id == campus_id,
                or_(
                    MenuItem.name.like(f"%{escaped}%", escape="\\"),
                    # 标签匹配走归一化表：LIKE 落在短字符串列上而不是整个 JSON 文本。
                    select(MenuItemTag.menu_item_id)
                    .where(
                        MenuItemTag.menu_item_id == MenuItem.id,
                        MenuItemTag.tag.like(f"%{escaped}%", escape="\\"),
                    )
                    .exists(),
                ),
            )
            .limit(SEARCH_MATCH_LIMIT)
        ).all()
        for item in matched:
            for tag in item.tags or []:
                gained[str(tag)] += SEARCH_MATCH_WEIGHT
    return dict(gained)


def load_affinity(
    db: Session, *, campus_id: str, actor_type: str, actor_id: str
) -> ActorAffinity | None:
    return db.scalar(
        select(ActorAffinity).where(
            ActorAffinity.campus_id == campus_id,
            ActorAffinity.actor_type == actor_type,
            ActorAffinity.actor_id == actor_id,
        )
    )


def _get_or_create(
    db: Session, *, campus_id: str, actor_type: str, actor_id: str
) -> ActorAffinity:
    existing = load_affinity(db, campus_id=campus_id, actor_type=actor_type, actor_id=actor_id)
    if existing is not None:
        return existing
    created = ActorAffinity(
        campus_id=campus_id,
        actor_type=actor_type,
        actor_id=actor_id,
        tag_scores={},
        area_scores={},
    )
    db.add(created)
    try:
        db.flush()
    except IntegrityError:
        # 并发批量上报可能同时建行，唯一约束兜底后改读已存在的那一行。
        db.rollback()
        found = load_affinity(
            db, campus_id=campus_id, actor_type=actor_type, actor_id=actor_id
        )
        if found is None:
            raise
        return found
    return created


def apply_events(
    db: Session,
    *,
    campus_id: str,
    actor_type: str,
    actor_id: str,
    events: list[InteractionEvent],
    now: datetime | None = None,
) -> ActorAffinity | None:
    """Fold a freshly ingested batch into the actor's materialised affinity."""
    if not events:
        return None
    now = now or datetime.now(UTC)

    item_context, merchant_areas = _resolve_context(db, campus_id, events)
    tag_gain: dict[str, float] = defaultdict(float)
    area_gain: dict[str, float] = defaultdict(float)
    searches: list[str] = []
    weighted_signals = 0

    for event in events:
        weight = EVENT_WEIGHTS.get(event.event_type, 0.0)
        if weight:
            weighted_signals += 1
            tags, item_area = item_context.get(str(event.menu_item_id), ([], None))
            for tag in tags:
                tag_gain[tag] += weight
            area_id = item_area or merchant_areas.get(str(event.merchant_id))
            if area_id:
                area_gain[str(area_id)] += weight
        elif event.event_type == "search" and len(searches) < SEARCH_MATCH_LIMIT:
            raw_query = (event.metadata_json or {}).get("query")
            if isinstance(raw_query, str) and raw_query.strip():
                searches.append(raw_query.strip()[:40])

    if searches:
        for tag, value in _search_tags(db, campus_id, searches).items():
            tag_gain[tag] += value

    if not tag_gain and not area_gain and not searches:
        return None

    affinity = _get_or_create(
        db, campus_id=campus_id, actor_type=actor_type, actor_id=actor_id
    )
    decayed_at = affinity.decayed_at
    if decayed_at.tzinfo is None:
        decayed_at = decayed_at.replace(tzinfo=UTC)
    factor = decay_multiplier(now - decayed_at)

    tags = {key: float(value) * factor for key, value in (affinity.tag_scores or {}).items()}
    areas = {key: float(value) * factor for key, value in (affinity.area_scores or {}).items()}
    for key, value in tag_gain.items():
        tags[key] = tags.get(key, 0.0) + value
    for key, value in area_gain.items():
        areas[key] = areas.get(key, 0.0) + value

    affinity.tag_scores = _prune(tags, MAX_TAGS)
    affinity.area_scores = _prune(areas, MAX_AREAS)
    affinity.signal_count = affinity.signal_count + weighted_signals
    affinity.search_signals = affinity.search_signals + len(dict.fromkeys(searches))
    affinity.revision = affinity.revision + 1
    affinity.decayed_at = now
    return affinity


def affinity_signals(
    affinity: ActorAffinity | None, *, now: datetime | None = None
) -> dict[str, Any]:
    """Read-side view: decayed ordering of the materialised scores."""
    if affinity is None:
        return {
            "tastes": [],
            "areas": [],
            "signal_count": 0,
            "search_signal_count": 0,
            "revision": 0,
        }
    now = now or datetime.now(UTC)
    decayed_at = affinity.decayed_at
    if decayed_at.tzinfo is None:
        decayed_at = decayed_at.replace(tzinfo=UTC)
    factor = decay_multiplier(now - decayed_at)
    tags = sorted(
        ((key, float(value) * factor) for key, value in (affinity.tag_scores or {}).items()),
        key=lambda pair: pair[1],
        reverse=True,
    )
    areas = sorted(
        ((key, float(value) * factor) for key, value in (affinity.area_scores or {}).items()),
        key=lambda pair: pair[1],
        reverse=True,
    )
    return {
        "tastes": [key for key, value in tags if value >= SCORE_EPSILON],
        "areas": [key for key, value in areas if value >= SCORE_EPSILON],
        "signal_count": affinity.signal_count,
        "search_signal_count": affinity.search_signals,
        "revision": affinity.revision,
    }
