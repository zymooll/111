"""Contracts of the snapshot pipeline: fast reads, stable paging, AI strictly off-path."""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta

import pytest

from app.models import MenuItem, RecommendationSnapshot
from app.services.snapshots import SOURCE_AI, SOURCE_DETERMINISTIC, decode_cursor
from tests.conftest import bearer, build_client, drain_recommendations, login


def feed(client, demo_ids, **params):
    response = client.get(
        "/api/v1/recommendations/feed",
        params={"campus_id": demo_ids["campus"], **params},
    )
    assert response.status_code == 200, response.text
    return response


def page_ids(response) -> list[str]:
    return [item["id"] for item in response.json()["items"]]


def collect_all(client, demo_ids, *, limit=7, **params):
    """Walk the whole feed through the cursor, exactly as the frontend does."""
    ids: list[str] = []
    cursor = None
    for _ in range(60):
        response = feed(client, demo_ids, limit=limit, cursor=cursor, **params)
        payload = response.json()
        ids.extend(item["id"] for item in payload["items"])
        cursor = payload["next_cursor"]
        if not cursor:
            break
    return ids


def test_first_page_builds_a_snapshot_and_reports_a_miss(client, demo_ids):
    response = feed(client, demo_ids)
    assert response.headers["X-Recommendation-Cache"] == "miss"
    assert response.headers["X-Recommendation-Source"] == SOURCE_DETERMINISTIC

    with client.app.state.database.session_factory() as db:
        stored = db.query(RecommendationSnapshot).all()
    assert len(stored) == 1
    assert stored[0].ranked_item_ids


def test_repeat_request_is_served_from_the_snapshot(client, demo_ids):
    first = feed(client, demo_ids)
    second = feed(client, demo_ids)
    assert second.headers["X-Recommendation-Cache"] == "hit"
    assert page_ids(first) == page_ids(second)

    with client.app.state.database.session_factory() as db:
        # 命中缓存不得产生新的快照行。
        assert db.query(RecommendationSnapshot).count() == 1


def test_paging_covers_every_item_exactly_once(client, demo_ids):
    walked = collect_all(client, demo_ids, limit=7)
    assert len(walked) == len(set(walked)), "翻页出现重复项"

    with client.app.state.database.session_factory() as db:
        snapshot = db.query(RecommendationSnapshot).one()
    assert walked == snapshot.ranked_item_ids, "翻页结果应与快照排序逐位一致"


def test_cursor_keeps_reading_the_snapshot_it_started_on(client, demo_ids, monkeypatch):
    """AI 增强在翻页中途落地时，进行中的那一轮不能串页。"""

    async def reverse_rerank(_adapter, candidates, _preferences):
        return {item["id"]: "AI 理由" for item in reversed(candidates)}

    monkeypatch.setattr("app.services.feed.DeepSeekClient.rerank", reverse_rerank)
    monkeypatch.setattr(client.app.state.settings, "deepseek_api_key", "test-key")

    first = feed(client, demo_ids, limit=5)
    first_ids = page_ids(first)
    cursor = first.json()["next_cursor"]
    first_snapshot_id, _ = decode_cursor(cursor)

    # 后台把 AI 版本写进来
    assert drain_recommendations(client) >= 1
    with client.app.state.database.session_factory() as db:
        assert db.query(RecommendationSnapshot).count() == 2

    # 拿旧游标继续翻：仍然读旧快照，与第一页不重叠
    second = feed(client, demo_ids, limit=5, cursor=cursor)
    assert second.headers["X-Recommendation-Cache"] == "cursor"
    assert second.headers["X-Recommendation-Source"] == SOURCE_DETERMINISTIC
    assert decode_cursor(second.json()["next_cursor"])[0] == first_snapshot_id
    assert not set(first_ids) & set(page_ids(second)), "同一轮浏览出现重项"

    # 而全新的一次浏览会命中 AI 版本
    fresh = feed(client, demo_ids, limit=5)
    assert fresh.headers["X-Recommendation-Source"] == SOURCE_AI
    assert all(item["recommendation_reason"] == "AI 理由" for item in fresh.json()["items"])


def test_read_path_never_calls_the_model(client, demo_ids, monkeypatch):
    calls: list[float] = []

    async def slow_rerank(_adapter, candidates, _preferences):
        calls.append(time.perf_counter())
        await asyncio.sleep(0)
        return {item["id"]: "AI 理由" for item in candidates}

    monkeypatch.setattr("app.services.feed.DeepSeekClient.rerank", slow_rerank)
    monkeypatch.setattr(client.app.state.settings, "deepseek_api_key", "test-key")

    for _ in range(3):
        feed(client, demo_ids, limit=5)
    assert calls == [], "读路径不允许触发任何 LLM 调用"

    drain_recommendations(client)
    assert len(calls) == 1, "同一份快照只应增强一次"


def test_enrichment_is_deduplicated_per_snapshot(client, demo_ids, monkeypatch):
    calls = []

    async def counting_rerank(_adapter, candidates, _preferences):
        calls.append(1)
        return {item["id"]: "AI 理由" for item in candidates}

    monkeypatch.setattr("app.services.feed.DeepSeekClient.rerank", counting_rerank)
    monkeypatch.setattr(client.app.state.settings, "deepseek_api_key", "test-key")

    for _ in range(5):
        feed(client, demo_ids, limit=5)
    drain_recommendations(client)
    assert len(calls) == 1


def test_model_failure_leaves_the_deterministic_snapshot_serving(client, demo_ids, monkeypatch):
    async def failing_rerank(_adapter, _candidates, _preferences):
        return None

    monkeypatch.setattr("app.services.feed.DeepSeekClient.rerank", failing_rerank)
    monkeypatch.setattr(client.app.state.settings, "deepseek_api_key", "test-key")

    before = page_ids(feed(client, demo_ids, limit=5))
    drain_recommendations(client)
    after = feed(client, demo_ids, limit=5)

    assert after.headers["X-Recommendation-Source"] == SOURCE_DETERMINISTIC
    assert page_ids(after) == before
    assert client.app.state.recommendations.enrich_failed == {"no_usable_ordering": 1}


def test_breaker_stops_calling_a_dead_model(client, demo_ids, monkeypatch):
    attempts = []

    async def always_failing(_adapter, _candidates, _preferences):
        attempts.append(1)

    monkeypatch.setattr("app.services.feed.DeepSeekClient.rerank", always_failing)
    monkeypatch.setattr(client.app.state.settings, "deepseek_api_key", "test-key")
    service = client.app.state.recommendations

    # 每次换一个筛选条件，产生一份新快照与一次新的增强作业
    for index in range(6):
        feed(client, demo_ids, limit=5, max_price_cents=1000 + index)
        drain_recommendations(client)

    assert len(attempts) == service._breaker.threshold, "熔断后不应再打模型"
    assert service.enrich_skipped.get("breaker_open", 0) >= 1


def test_expired_snapshot_is_served_stale_then_rebuilt(client, demo_ids):
    feed(client, demo_ids, limit=5)
    with client.app.state.database.session_factory() as db:
        row = db.query(RecommendationSnapshot).one()
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
        stale_id = row.id

    stale = feed(client, demo_ids, limit=5)
    assert stale.headers["X-Recommendation-Cache"] == "stale"
    assert decode_cursor(stale.json()["next_cursor"])[0] == stale_id

    assert drain_recommendations(client) >= 1
    rebuilt = feed(client, demo_ids, limit=5)
    assert rebuilt.headers["X-Recommendation-Cache"] == "hit"
    assert decode_cursor(rebuilt.json()["next_cursor"])[0] != stale_id


def test_cold_actors_share_one_baseline_snapshot(client, demo_ids):
    first_guest = client.post("/api/v1/auth/guest").json()
    second_guest = client.post("/api/v1/auth/guest").json()

    for guest in (first_guest, second_guest):
        response = client.get(
            "/api/v1/recommendations/feed",
            params={"campus_id": demo_ids["campus"]},
            headers=bearer(guest["access_token"]),
        )
        assert response.status_code == 200

    with client.app.state.database.session_factory() as db:
        rows = db.query(RecommendationSnapshot).all()
    # 两个毫无行为的游客不该各自占一份快照。
    assert len(rows) == 1
    assert rows[0].actor_type == "shared"


def test_behaviour_gives_an_actor_its_own_snapshot(client, demo_ids):
    guest = client.post("/api/v1/auth/guest").json()
    headers = bearer(guest["access_token"])
    feed(client, demo_ids)

    client.post(
        "/api/v1/interactions",
        headers=headers,
        json={
            "campus_id": demo_ids["campus"],
            "events": [
                {
                    "event_id": "affinity-click-0001",
                    "event_type": "click",
                    "menu_item_id": demo_ids["item_one"],
                }
            ],
        },
    )
    personal = client.get(
        "/api/v1/recommendations/feed",
        params={"campus_id": demo_ids["campus"]},
        headers=headers,
    )
    assert personal.status_code == 200
    assert personal.headers["X-Recommendation-Cache"] == "miss"

    with client.app.state.database.session_factory() as db:
        actor_types = {row.actor_type for row in db.query(RecommendationSnapshot).all()}
    assert actor_types == {"shared", "guest"}


def test_avoided_tags_are_excluded_before_the_candidate_limit(client, demo_ids):
    user = login(client)
    headers = bearer(user["access_token"])
    saved = client.put(
        "/api/v1/me/preferences",
        headers=headers,
        json={"campus_id": demo_ids["campus"], "tastes": [], "avoid": ["微辣"]},
    )
    assert saved.status_code in {200, 201}, saved.text

    response = client.get(
        "/api/v1/recommendations/feed",
        params={"campus_id": demo_ids["campus"], "limit": 50},
        headers=headers,
    )
    assert response.status_code == 200
    returned = [item["id"] for item in response.json()["items"]]
    with client.app.state.database.session_factory() as db:
        spicy = {
            item.id
            for item in db.query(MenuItem).all()
            if "微辣" in (item.tags or [])
        }
    assert spicy, "测试数据里应当有带该标签的菜品"
    assert not spicy & set(returned)


def test_candidate_recall_is_capped(tmp_path, demo_ids):
    with build_client(tmp_path, recommendation_candidate_limit=12) as client:
        response = client.get(
            "/api/v1/recommendations/feed",
            params={"campus_id": demo_ids["campus"], "limit": 50},
        )
        assert response.status_code == 200
        with client.app.state.database.session_factory() as db:
            snapshot = db.query(RecommendationSnapshot).one()
        assert len(snapshot.ranked_item_ids) == 12


def test_invalid_cursor_is_rejected(client, demo_ids):
    response = client.get(
        "/api/v1/recommendations/feed",
        params={"campus_id": demo_ids["campus"], "cursor": "!!!not-base64!!!"},
    )
    assert response.status_code == 422


@pytest.mark.parametrize("purged", [True, False])
def test_purge_respects_the_cursor_grace_period(client, demo_ids, purged):
    from app.services.retention import purge_expired

    feed(client, demo_ids, limit=5)
    grace = 60
    age = timedelta(seconds=grace + 30) if purged else timedelta(seconds=1)
    with client.app.state.database.session_factory() as db:
        row = db.query(RecommendationSnapshot).one()
        row.expires_at = datetime.now(UTC) - age
        db.commit()

    removed = purge_expired(
        client.app.state.database.session_factory,
        idempotency_retention_hours=48,
        snapshot_grace_seconds=grace,
    )
    assert removed["recommendation_snapshots"] == (1 if purged else 0)


def test_a_forged_cursor_cannot_read_another_actors_snapshot(client, demo_ids):
    """快照 id 由客户端携带，服务端必须校验归属——排序本身泄露对方被推断的口味。"""
    victim = client.post("/api/v1/auth/guest").json()
    victim_headers = bearer(victim["access_token"])
    client.post(
        "/api/v1/interactions",
        headers=victim_headers,
        json={
            "campus_id": demo_ids["campus"],
            "events": [
                {
                    "event_id": "victim-click-0001",
                    "event_type": "click",
                    "menu_item_id": demo_ids["item_one"],
                }
            ],
        },
    )
    victim_feed = client.get(
        "/api/v1/recommendations/feed",
        params={"campus_id": demo_ids["campus"], "limit": 3},
        headers=victim_headers,
    )
    assert victim_feed.headers["X-Recommendation-Cache"] == "miss"
    victim_cursor = victim_feed.json()["next_cursor"]
    victim_snapshot_id, _ = decode_cursor(victim_cursor)

    with client.app.state.database.session_factory() as db:
        owner = db.get(RecommendationSnapshot, victim_snapshot_id)
        assert owner is not None and owner.actor_type == "guest"

    attacker = client.post("/api/v1/auth/guest").json()
    stolen = client.get(
        "/api/v1/recommendations/feed",
        params={"campus_id": demo_ids["campus"], "limit": 3, "cursor": victim_cursor},
        headers=bearer(attacker["access_token"]),
    )
    assert stolen.status_code == 200
    assert stolen.headers["X-Recommendation-Cache"] == "cursor-rebuilt"
    assert decode_cursor(stolen.json()["next_cursor"])[0] != victim_snapshot_id


def test_a_cursor_cannot_cross_campuses(client, demo_ids):
    from app.models import Campus

    other_campus = "20000000-0000-0000-0000-000000000001"
    with client.app.state.database.session_factory() as db:
        db.add(
            Campus(
                id=other_campus, name="另一所学校", center_latitude=30.0, center_longitude=114.0
            )
        )
        db.commit()

    cursor = feed(client, demo_ids, limit=3).json()["next_cursor"]
    borrowed = client.get(
        "/api/v1/recommendations/feed",
        params={"campus_id": other_campus, "limit": 3, "cursor": cursor},
    )
    assert borrowed.status_code == 200
    assert borrowed.headers["X-Recommendation-Cache"] == "cursor-rebuilt"


def test_ordinary_browsing_does_not_churn_the_cache(client, demo_ids):
    """每条行为事件都换一把新键会让缓存等于不存在；指纹只跟真正影响排序的输入走。"""
    guest = client.post("/api/v1/auth/guest").json()
    headers = bearer(guest["access_token"])

    states = []
    for index in range(6):
        client.post(
            "/api/v1/interactions",
            headers=headers,
            json={
                "campus_id": demo_ids["campus"],
                "events": [
                    {
                        "event_id": f"churn-click-{index:04d}",
                        "event_type": "click",
                        "menu_item_id": demo_ids["item_one"],
                    }
                ],
            },
        )
        response = client.get(
            "/api/v1/recommendations/feed",
            params={"campus_id": demo_ids["campus"], "limit": 5},
            headers=headers,
        )
        states.append(response.headers["X-Recommendation-Cache"])

    # 第一次点击引入口味信号 → 一次冷启动；此后重复点击同一菜品不应再触发重建。
    assert states.count("miss") <= 2, states
    assert states[-3:] == ["hit", "hit", "hit"], states

    with client.app.state.database.session_factory() as db:
        personal = (
            db.query(RecommendationSnapshot)
            .filter(RecommendationSnapshot.actor_type == "guest")
            .count()
        )
    assert personal <= 2, "同一用户不该被每条事件各生成一份快照"


def test_singleflight_lock_table_stays_bounded(client, demo_ids):
    from app.services.feed import MAX_TRACKED_LOCKS

    service = client.app.state.recommendations
    for index in range(40):
        feed(client, demo_ids, limit=3, max_price_cents=500 + index)
    assert len(service._locks) <= MAX_TRACKED_LOCKS


def test_changing_filters_invalidates_the_cursor(client, demo_ids):
    """带着旧游标切换筛选条件，绝不能把不符合条件的旧快照当成"第二页"返回。"""
    categories = client.get(
        "/api/v1/categories", params={"campus_id": demo_ids["campus"]}
    ).json()
    narrow = categories[0]["children"][0]["id"] if categories[0].get("children") else categories[0]["id"]

    unfiltered = feed(client, demo_ids, limit=5)
    cursor = unfiltered.json()["next_cursor"]

    switched = client.get(
        "/api/v1/recommendations/feed",
        params={
            "campus_id": demo_ids["campus"],
            "limit": 5,
            "category_id": narrow,
            "cursor": cursor,
        },
    )
    assert switched.status_code == 200
    assert switched.headers["X-Recommendation-Cache"] == "cursor-rebuilt"

    legitimate = {
        item["id"]
        for item in feed(client, demo_ids, limit=50, category_id=narrow).json()["items"]
    }
    returned = {item["id"] for item in switched.json()["items"]}
    assert returned <= legitimate, "返回了不属于该筛选条件的菜品"


def test_same_filters_keep_the_cursor_alive(client, demo_ids):
    """筛选没变时游标必须继续有效，否则翻页会退化成每页重建。"""
    first = feed(client, demo_ids, limit=5, max_price_cents=5000)
    cursor = first.json()["next_cursor"]
    second = client.get(
        "/api/v1/recommendations/feed",
        params={
            "campus_id": demo_ids["campus"],
            "limit": 5,
            "max_price_cents": 5000,
            "cursor": cursor,
        },
    )
    assert second.headers["X-Recommendation-Cache"] == "cursor"
    assert not set(page_ids(first)) & set(page_ids(second))


def test_affinity_failure_never_loses_behaviour_events(client, demo_ids, monkeypatch):
    """画像只是派生物；它出错不该把用户真实产生的行为事件一起回滚掉。"""
    from sqlalchemy.exc import OperationalError

    def exploding_apply(*_args, **_kwargs):
        raise OperationalError("boom", {}, Exception("affinity is down"))

    monkeypatch.setattr("app.api.events.apply_events", exploding_apply)
    guest = client.post("/api/v1/auth/guest").json()
    response = client.post(
        "/api/v1/interactions",
        headers=bearer(guest["access_token"]),
        json={
            "campus_id": demo_ids["campus"],
            "events": [
                {
                    "event_id": "resilient-click-0001",
                    "event_type": "click",
                    "menu_item_id": demo_ids["item_one"],
                }
            ],
        },
    )
    assert response.status_code == 200, response.text

    from app.models import InteractionEvent

    with client.app.state.database.session_factory() as db:
        stored = (
            db.query(InteractionEvent)
            .filter(InteractionEvent.event_id == "resilient-click-0001")
            .one_or_none()
        )
    assert stored is not None, "画像失败把已接受的行为事件也回滚了"


def test_build_never_blocks_indefinitely_on_a_held_lock(client, demo_ids, monkeypatch):
    """单飞锁抢不到时必须自己构建，绝不让请求线程为别人的构建排队。"""
    service = client.app.state.recommendations
    monkeypatch.setattr(
        client.app.state.settings, "recommendation_build_wait_seconds", 0.05
    )
    key_lock = None

    original = service._lock_for

    def capture(key):
        nonlocal key_lock
        key_lock = original(key)
        return key_lock

    monkeypatch.setattr(service, "_lock_for", capture)
    feed(client, demo_ids, limit=5)          # 先建一次以拿到那把锁
    assert key_lock is not None
    key_lock.acquire()                        # 模拟另一个线程正在构建
    try:
        started = time.perf_counter()
        response = feed(client, demo_ids, limit=5)
        elapsed = time.perf_counter() - started
    finally:
        key_lock.release()

    assert response.status_code == 200
    assert elapsed < 2.0, f"抢不到锁时阻塞了 {elapsed:.2f}s"
