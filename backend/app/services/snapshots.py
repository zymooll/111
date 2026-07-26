"""Recommendation snapshots: the boundary between the slow AI path and the fast read path.

请求路径只做两件事：按键取一份已排好序的快照，然后按游标切片。排序、LLM 重排、画像合成
全部发生在快照构建时，而构建要么发生在后台，要么发生在冷启动的那一次同步调用里。

三条不变量：
1. 游标携带快照 id，因此同一轮浏览始终读同一份排序——后台期间写入 AI 增强版也不串页。
2. 快照行不可变。AI 增强写的是新行，旧行留到过期被清理，在途游标不会失效。
3. 没有 Redis 时完全等价（只是少一层内存缓存），没有 DeepSeek 时永远停在 deterministic。
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import RecommendationSnapshot

logger = logging.getLogger(__name__)

SHARED_ACTOR_TYPE = "shared"
SHARED_ACTOR_ID = "-"

SOURCE_DETERMINISTIC = "deterministic"
SOURCE_AI = "ai"


@dataclass(frozen=True)
class SnapshotKey:
    campus_id: str
    actor_type: str
    actor_id: str
    filter_fingerprint: str

    def cache_key(self) -> str:
        return f"recptr:{self.campus_id}:{self.actor_type}:{self.actor_id}:{self.filter_fingerprint}"


@dataclass(frozen=True)
class Snapshot:
    id: str
    key: SnapshotKey
    ranked_item_ids: list[str]
    reasons: dict[str, str]
    source: str
    profile_revision: int
    built_at: datetime
    expires_at: datetime

    def is_fresh(self, now: datetime) -> bool:
        return self.expires_at > now

    def slice(self, offset: int, limit: int) -> list[str]:
        return self.ranked_item_ids[offset : offset + limit]

    def to_payload(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "campus_id": self.key.campus_id,
            "actor_type": self.key.actor_type,
            "actor_id": self.key.actor_id,
            "filter_fingerprint": self.key.filter_fingerprint,
            "ranked_item_ids": self.ranked_item_ids,
            "reasons": self.reasons,
            "source": self.source,
            "profile_revision": self.profile_revision,
            "built_at": self.built_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
        }

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> Snapshot:
        return cls(
            id=str(payload["id"]),
            key=SnapshotKey(
                campus_id=str(payload["campus_id"]),
                actor_type=str(payload["actor_type"]),
                actor_id=str(payload["actor_id"]),
                filter_fingerprint=str(payload["filter_fingerprint"]),
            ),
            ranked_item_ids=[str(value) for value in payload["ranked_item_ids"]],
            reasons={str(k): str(v) for k, v in (payload.get("reasons") or {}).items()},
            source=str(payload.get("source", SOURCE_DETERMINISTIC)),
            profile_revision=int(payload.get("profile_revision", 0)),
            built_at=datetime.fromisoformat(str(payload["built_at"])),
            expires_at=datetime.fromisoformat(str(payload["expires_at"])),
        )

    @classmethod
    def from_row(cls, row: RecommendationSnapshot) -> Snapshot:
        return cls(
            id=row.id,
            key=SnapshotKey(
                campus_id=row.campus_id,
                actor_type=row.actor_type,
                actor_id=row.actor_id,
                filter_fingerprint=row.filter_fingerprint,
            ),
            ranked_item_ids=[str(value) for value in (row.ranked_item_ids or [])],
            reasons={str(k): str(v) for k, v in (row.reasons or {}).items()},
            source=row.source,
            profile_revision=row.profile_revision,
            built_at=_aware(row.built_at),
            expires_at=_aware(row.expires_at),
        )


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def fingerprint(parts: dict[str, Any]) -> str:
    """Stable hash of everything that changes the ordering.

    画像修订号也算在内：用户口味变了就是另一份候选排序，不能复用旧快照。
    """
    normalized = json.dumps(parts, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def encode_cursor(snapshot_id: str, offset: int) -> str:
    raw = f"{snapshot_id}:{offset}".encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def decode_cursor(cursor: str | None) -> tuple[str | None, int]:
    if not cursor:
        return None, 0
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode()
        snapshot_id, _, offset = raw.rpartition(":")
        return (snapshot_id or None), max(0, int(offset))
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None, -1


class SnapshotCache:
    """Optional Redis front cache. Every method degrades to a miss instead of raising."""

    def __init__(self, redis_url: str | None = None) -> None:
        self._client = None
        if not redis_url:
            return
        try:
            import redis

            client = redis.Redis.from_url(redis_url, decode_responses=True)
            client.ping()
            self._client = client
        except Exception:  # noqa: BLE001 - 缓存不可用不应影响推荐可用性
            logger.warning("REDIS_URL set but unreachable; snapshots read from the database only", exc_info=True)

    @property
    def enabled(self) -> bool:
        return self._client is not None

    def get_by_key(self, key: SnapshotKey) -> Snapshot | None:
        return self._read(key.cache_key())

    def get_by_id(self, snapshot_id: str) -> Snapshot | None:
        return self._read(f"rec:{snapshot_id}")

    def put(self, snapshot: Snapshot, ttl_seconds: int) -> None:
        if self._client is None:
            return
        try:
            payload = json.dumps(snapshot.to_payload(), ensure_ascii=False)
            ttl = max(1, ttl_seconds)
            self._client.setex(f"rec:{snapshot.id}", ttl, payload)
            self._client.setex(snapshot.key.cache_key(), ttl, payload)
        except Exception:  # noqa: BLE001
            logger.warning("Snapshot cache write failed", exc_info=True)

    def _read(self, key: str) -> Snapshot | None:
        if self._client is None:
            return None
        try:
            raw = self._client.get(key)
            return Snapshot.from_payload(json.loads(raw)) if raw else None
        except Exception:  # noqa: BLE001
            logger.warning("Snapshot cache read failed", exc_info=True)
            return None


class SnapshotStore:
    """Database is the source of truth; Redis only shortens the read path."""

    def __init__(self, cache: SnapshotCache | None = None) -> None:
        self.cache = cache or SnapshotCache()

    def latest(self, db: Session, key: SnapshotKey) -> Snapshot | None:
        cached = self.cache.get_by_key(key)
        if cached is not None:
            return cached
        row = db.scalars(
            select(RecommendationSnapshot)
            .where(
                RecommendationSnapshot.campus_id == key.campus_id,
                RecommendationSnapshot.actor_type == key.actor_type,
                RecommendationSnapshot.actor_id == key.actor_id,
                RecommendationSnapshot.filter_fingerprint == key.filter_fingerprint,
            )
            .order_by(RecommendationSnapshot.built_at.desc(), RecommendationSnapshot.id.desc())
            .limit(1)
        ).first()
        return Snapshot.from_row(row) if row is not None else None

    def by_id(self, db: Session, snapshot_id: str) -> Snapshot | None:
        cached = self.cache.get_by_id(snapshot_id)
        if cached is not None:
            return cached
        row = db.get(RecommendationSnapshot, snapshot_id)
        return Snapshot.from_row(row) if row is not None else None

    def save(
        self,
        db: Session,
        *,
        key: SnapshotKey,
        ranked_item_ids: list[str],
        reasons: dict[str, str],
        source: str,
        profile_revision: int,
        ttl_seconds: int,
        now: datetime | None = None,
    ) -> Snapshot:
        now = now or datetime.now(UTC)
        row = RecommendationSnapshot(
            campus_id=key.campus_id,
            actor_type=key.actor_type,
            actor_id=key.actor_id,
            filter_fingerprint=key.filter_fingerprint,
            ranked_item_ids=ranked_item_ids,
            reasons=reasons,
            source=source,
            profile_revision=profile_revision,
            built_at=now,
            expires_at=now + timedelta(seconds=ttl_seconds),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        snapshot = Snapshot.from_row(row)
        # 缓存留得比快照本身久一点，好让在途游标在过期后仍能读到同一份排序继续翻页。
        self.cache.put(snapshot, ttl_seconds * 2)
        return snapshot

    def purge_expired(self, db: Session, *, grace_seconds: int, now: datetime | None = None) -> int:
        """Keep expired snapshots for a grace period so in-flight cursors still resolve."""
        now = now or datetime.now(UTC)
        removed = db.execute(
            delete(RecommendationSnapshot).where(
                RecommendationSnapshot.expires_at < now - timedelta(seconds=grace_seconds)
            )
        ).rowcount or 0
        db.commit()
        return removed
