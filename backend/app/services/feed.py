"""Building and serving the recommendation feed.

分工：
- 读路径（recommendation_feed）只做"取快照 + 切片 + 装配响应"，永远不调用 LLM。
- 冷启动时同步构建一份 deterministic 快照：一次带 LIMIT 的 SQL + 一次 O(n log n) 排序。
- AI 重排交给后台队列，完成后写入一份新的 ai 快照，供后续请求命中。
- DeepSeek 连续失败会打开熔断，熔断期内直接跳过增强并记录日志，不影响任何用户请求。
"""

from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models import MenuItem, MenuItemTag, Merchant
from app.services import jobs
from app.services.campuses import require_area, require_category
from app.services.deepseek import DeepSeekClient
from app.services.hierarchy import area_with_descendants, category_with_descendants
from app.services.recommendations import deterministic_rank, fallback_reason
from app.services.snapshots import (
    SHARED_ACTOR_ID,
    SHARED_ACTOR_TYPE,
    SOURCE_AI,
    SOURCE_DETERMINISTIC,
    Snapshot,
    SnapshotCache,
    SnapshotKey,
    SnapshotStore,
    fingerprint,
)

logger = logging.getLogger(__name__)

#: 单飞锁字典的上限；超过后清掉未被持有的条目，避免键空间随筛选组合无限增长。
MAX_TRACKED_LOCKS = 512


@dataclass(frozen=True)
class FeedQuery:
    campus_id: str
    category_id: str | None = None
    area_id: str | None = None
    search: str | None = None
    max_price_cents: int | None = None

    def normalized_search(self) -> str | None:
        return self.search.strip() if self.search and self.search.strip() else None


@dataclass
class BuildOutcome:
    snapshot: Snapshot
    cache_state: str  # hit | miss | stale


@dataclass
class _Breaker:
    """Trip after consecutive failures so a dead LLM cannot slow the queue down."""

    threshold: int = 3
    cooldown_seconds: float = 120.0
    failures: int = 0
    opened_at: float | None = None

    def allow(self, now: float) -> bool:
        if self.opened_at is None:
            return True
        if now - self.opened_at >= self.cooldown_seconds:
            self.opened_at = None
            self.failures = 0
            return True
        return False

    def record(self, *, ok: bool, now: float) -> None:
        if ok:
            self.failures = 0
            self.opened_at = None
            return
        self.failures += 1
        if self.failures >= self.threshold and self.opened_at is None:
            self.opened_at = now
            logger.warning(
                "DeepSeek rerank breaker opened after %s consecutive failures", self.failures
            )


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def recall_candidates(
    db: Session,
    query: FeedQuery,
    preferences: dict[str, Any],
    *,
    limit: int,
) -> list[tuple[MenuItem, Merchant]]:
    """Pre-filter in SQL and cap the candidate set; never load a whole campus into memory."""
    conditions = [
        MenuItem.is_active.is_(True),
        Merchant.is_active.is_(True),
        Merchant.campus_id == query.campus_id,
        MenuItem.campus_id == query.campus_id,
    ]
    if query.category_id:
        require_category(db, query.campus_id, query.category_id)
        category_ids = category_with_descendants(db, query.category_id, query.campus_id)
        conditions.append(
            or_(
                MenuItem.category_id.in_(category_ids),
                Merchant.category_id.in_(category_ids),
            )
        )
    if query.area_id:
        require_area(db, query.campus_id, query.area_id)
        conditions.append(
            Merchant.area_id.in_(area_with_descendants(db, query.area_id, query.campus_id))
        )
    if query.max_price_cents is not None:
        conditions.append(MenuItem.price_cents <= query.max_price_cents)
    search = query.normalized_search()
    if search:
        keyword = f"%{_escape_like(search)}%"
        conditions.append(
            or_(
                MenuItem.name.like(keyword, escape="\\"),
                Merchant.name.like(keyword, escape="\\"),
            )
        )
    # 忌口在 SQL 里排除，否则 LIMIT 之后再过滤会凭空少掉候选。
    # 走归一化表：精确匹配且可用 (campus_id, tag) 索引，不再对 JSON 列做全表 LIKE。
    avoided = _string_list(preferences.get("avoid"))
    if avoided:
        conditions.append(
            ~select(MenuItemTag.menu_item_id)
            .where(
                MenuItemTag.menu_item_id == MenuItem.id,
                MenuItemTag.tag.in_(avoided),
            )
            .exists()
        )

    return list(
        db.execute(
            select(MenuItem, Merchant)
            .join(Merchant, Merchant.id == MenuItem.merchant_id)
            .where(and_(*conditions))
            .order_by(
                MenuItem.rating_avg.desc(),
                MenuItem.review_count.desc(),
                MenuItem.id,
            )
            .limit(limit)
        ).all()
    )


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, (str, int, float))]


def query_fingerprint(query: FeedQuery, *, effective_max_price: int | None) -> str:
    """Fingerprint of the explicit request filters only.

    与快照键分开：键里还含画像信息（口味/忌口/收藏），那些变化时应当继续沿用旧游标以保证
    翻页连续；而筛选条件变化意味着用户要的是另一个集合，旧游标必须作废。
    """
    return fingerprint(
        {
            "category_id": query.category_id,
            "area_id": query.area_id,
            "search": query.normalized_search(),
            "max_price_cents": effective_max_price,
        }
    )


def snapshot_key(
    query: FeedQuery,
    preferences: dict[str, Any],
    *,
    actor_type: str | None,
    actor_id: str | None,
    effective_max_price: int | None,
    favorites: set[str] | None = None,
) -> SnapshotKey:
    """Cold actors share one baseline snapshot; anyone with signals gets their own.

    指纹只包含真正决定排序的输入。刻意**不**包含画像修订号：每条行为事件都会让修订号自增，
    把它算进指纹会让活跃用户每次请求都落到新键上冷启动，缓存等于不存在。口味/区域/忌口的
    实际取值变化才应该让快照失效，而这些本来就在指纹里。
    """
    has_signal = bool(
        preferences.get("tastes")
        or preferences.get("frequent_area_ids")
        or preferences.get("avoid")
        or preferences.get("behavior_profile")
    )
    if has_signal and actor_type and actor_id:
        key_actor_type, key_actor_id = actor_type, actor_id
    else:
        key_actor_type, key_actor_id = SHARED_ACTOR_TYPE, SHARED_ACTOR_ID

    return SnapshotKey(
        campus_id=query.campus_id,
        actor_type=key_actor_type,
        actor_id=key_actor_id,
        filter_fingerprint=fingerprint(
            {
                "category_id": query.category_id,
                "area_id": query.area_id,
                "search": query.normalized_search(),
                "max_price_cents": effective_max_price,
                "tastes": sorted(_string_list(preferences.get("tastes"))),
                "areas": sorted(_string_list(preferences.get("frequent_area_ids"))),
                "avoid": sorted(_string_list(preferences.get("avoid"))),
                # 收藏参与打分，所以必须进指纹；但收藏的变更频率远低于点击，不会造成churn。
                "favorites": sorted(favorites or ()),
            }
        ),
    )


def owns_snapshot(
    snapshot: Snapshot,
    *,
    campus_id: str,
    actor_type: str | None,
    actor_id: str | None,
    query_fp: str,
) -> bool:
    """A cursor may only resume a snapshot that matches both the caller and the query.

    两道校验缺一不可：
    - 归属：快照 id 由客户端携带，不校验就能靠转发游标读到别人的个性化排序，而排序本身
      泄露了对方被推断出的口味。
    - 筛选：翻页途中改了品类/区域/搜索/价格却仍带旧游标时，旧快照里的条目根本不满足新
      筛选条件，必须作废重建而不是把不符合的结果当成"第二页"返回。
    """
    if snapshot.key.campus_id != campus_id:
        return False
    if snapshot.query_fingerprint != query_fp:
        return False
    if snapshot.key.actor_type == SHARED_ACTOR_TYPE:
        return True
    return snapshot.key.actor_type == actor_type and snapshot.key.actor_id == actor_id


@dataclass(frozen=True)
class FeedPage:
    items: list[tuple[MenuItem, Merchant]]
    reasons: dict[str, str]
    next_cursor: str | None
    has_more: bool
    source: str
    cache_state: str


@dataclass
class _Job:
    kind: str  # enrich | rebuild
    dedupe: str
    snapshot_id: str | None = None
    key: SnapshotKey | None = None
    query: FeedQuery | None = None
    preferences: dict[str, Any] = field(default_factory=dict)
    favorites: frozenset[str] = frozenset()

    def to_payload(self) -> dict[str, Any]:
        return {
            "snapshot_id": self.snapshot_id,
            "key": asdict(self.key) if self.key else None,
            "query": asdict(self.query) if self.query else None,
            "preferences": self.preferences,
            "favorites": sorted(self.favorites),
        }

    @classmethod
    def from_record(cls, kind: str, dedupe: str, payload: dict[str, Any]) -> _Job:
        key = payload.get("key")
        query = payload.get("query")
        return cls(
            kind=kind,
            dedupe=dedupe,
            snapshot_id=payload.get("snapshot_id"),
            key=SnapshotKey(**key) if key else None,
            query=FeedQuery(**query) if query else None,
            preferences=dict(payload.get("preferences") or {}),
            favorites=frozenset(payload.get("favorites") or ()),
        )


class RecommendationService:
    """Owns the snapshot lifecycle: build fast, enrich slowly, serve from cache."""

    def __init__(self, settings, database, store: SnapshotStore | None = None) -> None:
        self.settings = settings
        self.database = database
        self.store = store or SnapshotStore(SnapshotCache(settings.redis_url))
        # 读路径是同步的（FastAPI 把它放进线程池），所以锁与队列都必须是线程安全的，
        # 不能用 asyncio 的版本——它们只在事件循环线程内成立。
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()
        self._breaker = _Breaker(
            threshold=settings.recommendation_breaker_threshold,
            cooldown_seconds=settings.recommendation_breaker_cooldown_seconds,
        )
        self.metrics: dict[str, int] = {
            "hit": 0,
            "stale": 0,
            "miss": 0,
            "enriched": 0,
            "build_contended": 0,
        }
        # 失败与跳过按原因分维度：只有一个总数时，运维分不清是模型超时还是熔断打开。
        self.enrich_failed: dict[str, int] = {}
        self.enrich_skipped: dict[str, int] = {}

    @property
    def ai_enabled(self) -> bool:
        return bool(self.settings.deepseek_api_key)

    def breaker_allows_now(self) -> bool:
        """Whether an enrichment attempt would be let through right now."""
        return self._breaker.opened_at is None

    def _lock_for(self, key: str) -> threading.Lock:
        with self._locks_guard:
            lock = self._locks.get(key)
            if lock is None:
                if len(self._locks) >= MAX_TRACKED_LOCKS:
                    # 只保留仍被持有的锁；其余是已完成构建的键，留着就是内存泄漏。
                    self._locks = {
                        existing: value
                        for existing, value in self._locks.items()
                        if value.locked()
                    }
                lock = threading.Lock()
                self._locks[key] = lock
            return lock

    def _count(self, bucket: dict[str, int], reason: str) -> None:
        bucket[reason] = bucket.get(reason, 0) + 1

    def _enqueue(self, job: _Job) -> None:
        """Persist the job. 唯一约束负责去重，重启也不会把待办丢掉。"""
        with self.database.session_factory() as db:
            jobs.enqueue(
                db, kind=job.kind, dedupe_key=job.dedupe, payload=job.to_payload()
            )

    def build_snapshot(
        self,
        db: Session,
        *,
        key: SnapshotKey,
        query: FeedQuery,
        preferences: dict[str, Any],
        favorites: set[str],
    ) -> Snapshot:
        """Deterministic build: one bounded SQL recall plus one O(n log n) ranking."""
        pairs = recall_candidates(
            db, query, preferences, limit=self.settings.recommendation_candidate_limit
        )
        ranked = deterministic_rank(pairs, preferences, favorites)
        return self.store.save(
            db,
            key=key,
            query_fingerprint=query_fingerprint(
                query, effective_max_price=query.max_price_cents
            ),
            ranked_item_ids=[item.id for item, _ in ranked],
            reasons={item.id: fallback_reason(item, preferences) for item, _ in ranked},
            source=SOURCE_DETERMINISTIC,
            profile_revision=int(preferences.get("profile_revision", 0) or 0),
            ttl_seconds=self.settings.recommendation_snapshot_ttl_seconds,
        )

    def acquire_snapshot(
        self,
        db: Session,
        *,
        key: SnapshotKey,
        query: FeedQuery,
        preferences: dict[str, Any],
        favorites: set[str],
        now: datetime | None = None,
    ) -> BuildOutcome:
        now = now or datetime.now(UTC)
        existing = self.store.latest(db, key)
        if existing is not None and existing.is_fresh(now):
            self.metrics["hit"] += 1
            return BuildOutcome(existing, "hit")
        if existing is not None:
            # stale-while-revalidate：先把旧排序返回给用户，重建交给后台。
            self._enqueue(
                _Job(
                    kind="rebuild",
                    dedupe=f"rebuild:{key.cache_key()}",
                    key=key,
                    query=query,
                    preferences=dict(preferences),
                    favorites=frozenset(favorites),
                )
            )
            self.metrics["stale"] += 1
            return BuildOutcome(existing, "stale")

        # 冷启动：同一把键上并发的请求只构建一次，其余复用结果。
        # 但绝不无限期等待——同步端点跑在 anyio 有限大小的线程池里，一次惊群若变成排队，
        # 会把线程全部占满，连不相关的端点都会超时。抢不到锁就自己构建，宁可重复劳动。
        lock = self._lock_for(key.cache_key())
        acquired = lock.acquire(timeout=self.settings.recommendation_build_wait_seconds)
        try:
            rebuilt = self.store.latest(db, key)
            if rebuilt is not None and rebuilt.is_fresh(now):
                self.metrics["hit"] += 1
                return BuildOutcome(rebuilt, "hit")
            if not acquired:
                self.metrics["build_contended"] += 1
                logger.info("Snapshot build lock busy; building without single-flight")
            snapshot = self.build_snapshot(
                db, key=key, query=query, preferences=preferences, favorites=favorites
            )
            self.metrics["miss"] += 1
            return BuildOutcome(snapshot, "miss")
        finally:
            if acquired:
                lock.release()

    def schedule_enrichment(self, snapshot: Snapshot, *, preferences: dict[str, Any]) -> None:
        if not self.ai_enabled or snapshot.source == SOURCE_AI:
            return
        self._enqueue(
            _Job(
                kind="enrich",
                dedupe=f"enrich:{snapshot.id}",
                snapshot_id=snapshot.id,
                key=snapshot.key,
                preferences=dict(preferences),
            )
        )

    async def _enrich(self, job: _Job) -> None:
        loop_now = asyncio.get_running_loop().time()
        if not self._breaker.allow(loop_now):
            self._count(self.enrich_skipped, "breaker_open")
            return
        with self.database.session_factory() as db:
            snapshot = self.store.by_id(db, str(job.snapshot_id))
            if snapshot is None:
                self._count(self.enrich_skipped, "snapshot_gone")
                return
            if snapshot.source == SOURCE_AI:
                self._count(self.enrich_skipped, "already_enriched")
                return
            head = snapshot.ranked_item_ids[: self.settings.recommendation_ai_candidates]
            if not head:
                self._count(self.enrich_skipped, "empty_snapshot")
                return
            rows = db.execute(
                select(MenuItem, Merchant)
                .join(Merchant, Merchant.id == MenuItem.merchant_id)
                .where(MenuItem.id.in_(head))
            ).all()
            by_id = {item.id: (item, merchant) for item, merchant in rows}
            candidates = [
                {
                    "id": item.id,
                    "name": item.name,
                    "price_cents": item.price_cents,
                    "rating": item.rating_avg,
                    "tags": item.tags,
                    "merchant": merchant.name,
                }
                for item, merchant in (by_id[item_id] for item_id in head if item_id in by_id)
            ]
            if not candidates:
                self._count(self.enrich_skipped, "no_live_candidates")
                return

            ai_reasons = await DeepSeekClient(self.settings).rerank(candidates, job.preferences)
            self._breaker.record(ok=ai_reasons is not None, now=loop_now)
            if not ai_reasons:
                self._count(self.enrich_failed, "no_usable_ordering")
                logger.info(
                    "DeepSeek rerank produced no usable ordering for snapshot %s", snapshot.id
                )
                return

            order = {item_id: index for index, item_id in enumerate(ai_reasons)}
            reordered = sorted(head, key=lambda item_id: order.get(item_id, len(order)))
            reasons = dict(snapshot.reasons)
            reasons.update(ai_reasons)
            # 写新行而不是就地更新：仍在翻页的游标指向旧快照，必须保持可读。
            self.store.save(
                db,
                key=snapshot.key,
                query_fingerprint=snapshot.query_fingerprint,
                ranked_item_ids=reordered + snapshot.ranked_item_ids[len(head) :],
                reasons=reasons,
                source=SOURCE_AI,
                profile_revision=snapshot.profile_revision,
                ttl_seconds=self.settings.recommendation_snapshot_ttl_seconds,
            )
            self.metrics["enriched"] += 1

    async def _rebuild(self, job: _Job) -> None:
        assert job.key is not None and job.query is not None
        with self.database.session_factory() as db:
            snapshot = self.build_snapshot(
                db,
                key=job.key,
                query=job.query,
                preferences=job.preferences,
                favorites=set(job.favorites),
            )
        self.schedule_enrichment(snapshot, preferences=job.preferences)

    async def _process(self, record: jobs.Job) -> bool:
        """Run one claimed job. Returns whether it succeeded."""
        job = _Job.from_record(record.kind, record.dedupe_key, record.payload)
        try:
            if job.kind == "enrich":
                await self._enrich(job)
            elif job.kind == "rebuild":
                await self._rebuild(job)
        except Exception:  # noqa: BLE001 - 后台任务不得因单个作业失败而退出
            logger.warning("Recommendation %s job failed", job.kind, exc_info=True)
            return False
        return True

    async def _run_once(self) -> bool:
        """Claim and process a single job; False when the queue is empty."""
        with self.database.session_factory() as db:
            record = jobs.claim(db)
        if record is None:
            return False
        succeeded = await self._process(record)
        with self.database.session_factory() as db:
            jobs.finish(db, record) if succeeded else jobs.fail(db, record)
        return True

    async def drain(self, limit: int = 500) -> int:
        """Process everything queued right now. Tests use this instead of sleeping."""
        processed = 0
        while processed < limit and await self._run_once():
            processed += 1
        return processed

    def backlog(self) -> dict[str, int]:
        with self.database.session_factory() as db:
            return jobs.backlog(db)

    async def run_worker(self, poll_seconds: float = 0.2) -> None:
        """Consume jobs from the durable queue.

        用轮询而不是 asyncio 等待原语：作业由请求线程写进数据库，跨线程唤醒事件循环是
        经典的错误来源。空闲时每轮只有一条带索引的 SELECT，代价可以忽略。
        """
        ticks = 0
        while True:
            # 每一轮都自成一个失败域：一次瞬时数据库错误不该永久杀死后台增强。
            try:
                if ticks % 300 == 0:
                    # 定期把死掉的 worker 领走却没做完的作业放回待办。
                    with self.database.session_factory() as db:
                        jobs.release_stale(db)
                ticks += 1
                if await self._run_once():
                    continue
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                logger.warning("Recommendation worker tick failed; retrying", exc_info=True)
                await asyncio.sleep(max(poll_seconds, 1.0))
                continue
            await asyncio.sleep(poll_seconds)
