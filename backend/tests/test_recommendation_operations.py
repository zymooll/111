"""Tag normalisation, the durable job queue, and the operational read-out."""

from __future__ import annotations

from app.models import MenuItem, MenuItemTag, RecommendationJob
from app.services import item_tags, jobs
from tests.conftest import admin_login, bearer, drain_recommendations, login


def feed(client, demo_ids, **params):
    response = client.get(
        "/api/v1/recommendations/feed",
        params={"campus_id": demo_ids["campus"], **params},
    )
    assert response.status_code == 200, response.text
    return response


# --------------------------------------------------------------------------- tags


def test_tag_rows_mirror_the_json_column_after_seeding(client):
    """种子数据完全没走归一化的写路径，同步靠 flush 事件兜住。"""
    with client.app.state.database.session_factory() as db:
        assert db.query(MenuItemTag).count() > 0
        assert item_tags.reconcile(db, repair=False) == 0


def test_admin_edits_keep_the_tag_index_in_step(client, demo_ids):
    headers = bearer(admin_login(client)["access_token"])
    params = {"campus_id": demo_ids["campus"]}

    updated = client.patch(
        f"/admin/api/v1/menu-items/{demo_ids['item_one']}",
        params=params,
        json={"tags": ["微辣", "清淡"]},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text

    with client.app.state.database.session_factory() as db:
        rows = {
            row.tag
            for row in db.query(MenuItemTag)
            .filter(MenuItemTag.menu_item_id == demo_ids["item_one"])
            .all()
        }
        assert rows == {"微辣", "清淡"}
        assert item_tags.reconcile(db, repair=False) == 0

    # 再改一次，旧标签必须消失而不是累积
    client.patch(
        f"/admin/api/v1/menu-items/{demo_ids['item_one']}",
        params=params,
        json={"tags": ["清淡"]},
        headers=headers,
    )
    with client.app.state.database.session_factory() as db:
        rows = {
            row.tag
            for row in db.query(MenuItemTag)
            .filter(MenuItemTag.menu_item_id == demo_ids["item_one"])
            .all()
        }
        assert rows == {"清淡"}


def test_renaming_a_tag_rewrites_both_sides(client, demo_ids):
    headers = bearer(admin_login(client)["access_token"])
    params = {"campus_id": demo_ids["campus"]}

    tags = client.get("/admin/api/v1/tags", params=params, headers=headers).json()
    spicy = next(tag for tag in tags if tag["name"] == "微辣")

    renamed = client.patch(
        f"/admin/api/v1/tags/{spicy['id']}",
        params=params,
        json={"name": "小辣"},
        headers=headers,
    )
    assert renamed.status_code == 200, renamed.text

    with client.app.state.database.session_factory() as db:
        assert db.query(MenuItemTag).filter(MenuItemTag.tag == "微辣").count() == 0
        assert db.query(MenuItemTag).filter(MenuItemTag.tag == "小辣").count() > 0
        assert item_tags.reconcile(db, repair=False) == 0
        # JSON 读模型也必须跟着改，否则打分和送给 LLM 的还是旧名字
        stale = [
            item.id
            for item in db.query(MenuItem).all()
            if "微辣" in (item.tags or [])
        ]
        assert stale == []


def test_taste_filter_matches_exactly_not_by_substring(client, demo_ids):
    headers = bearer(admin_login(client)["access_token"])
    params = {"campus_id": demo_ids["campus"]}
    client.patch(
        f"/admin/api/v1/menu-items/{demo_ids['item_one']}",
        params=params,
        json={"tags": ["微辣"]},
        headers=headers,
    )

    # 旧的 JSON 子串匹配下，"辣" 会命中 "微辣"；归一化后是精确匹配。
    loose = client.get("/api/v1/map/merchants", params={**params, "taste": "辣"})
    assert loose.status_code == 200
    assert loose.json()["features"] == []

    exact = client.get("/api/v1/map/merchants", params={**params, "taste": "微辣"})
    assert exact.status_code == 200
    assert exact.json()["features"], "精确标签应当能筛出商家"


def test_reconcile_detects_and_repairs_drift(client, demo_ids):
    with client.app.state.database.session_factory() as db:
        # 绕过 ORM 直接改表，模拟历史数据或外部写入造成的偏离
        db.query(MenuItemTag).filter(
            MenuItemTag.menu_item_id == demo_ids["item_one"]
        ).delete()
        db.commit()
        assert item_tags.reconcile(db, repair=False) >= 1
        assert item_tags.reconcile(db, repair=True) >= 1
        assert item_tags.reconcile(db, repair=False) == 0


# ---------------------------------------------------------------------- job queue


def test_enrichment_jobs_survive_in_the_database(client, demo_ids, monkeypatch):
    monkeypatch.setattr(client.app.state.settings, "deepseek_api_key", "test-key")
    feed(client, demo_ids, limit=5)

    with client.app.state.database.session_factory() as db:
        pending = db.query(RecommendationJob).all()
        assert len(pending) == 1
        assert pending[0].kind == "enrich"
        assert pending[0].state == "pending"
        assert jobs.backlog(db) == {"pending": 1, "running": 0}


def test_duplicate_jobs_are_rejected_by_the_unique_constraint(client, demo_ids, monkeypatch):
    monkeypatch.setattr(client.app.state.settings, "deepseek_api_key", "test-key")
    for _ in range(5):
        feed(client, demo_ids, limit=5)
    with client.app.state.database.session_factory() as db:
        assert db.query(RecommendationJob).count() == 1


def test_finished_jobs_leave_the_queue(client, demo_ids, monkeypatch):
    async def rerank(_adapter, candidates, _preferences):
        return {item["id"]: "AI 理由" for item in candidates}

    monkeypatch.setattr("app.services.feed.DeepSeekClient.rerank", rerank)
    monkeypatch.setattr(client.app.state.settings, "deepseek_api_key", "test-key")

    feed(client, demo_ids, limit=5)
    assert drain_recommendations(client) == 1
    with client.app.state.database.session_factory() as db:
        assert db.query(RecommendationJob).count() == 0


def test_a_failing_job_is_retried_then_dropped(client, demo_ids, monkeypatch):
    attempts = []

    async def exploding(_adapter, _candidates, _preferences):
        attempts.append(1)
        raise RuntimeError("rerank exploded")

    monkeypatch.setattr("app.services.feed.DeepSeekClient.rerank", exploding)
    monkeypatch.setattr(client.app.state.settings, "deepseek_api_key", "test-key")

    feed(client, demo_ids, limit=5)
    # 失败的作业会被放回待办，所以同一次 drain 就会重试它；这里只关心边界行为。
    for _ in range(10):
        drain_recommendations(client)
        with client.app.state.database.session_factory() as db:
            if db.query(RecommendationJob).count() == 0:
                break

    assert len(attempts) == jobs.MAX_ATTEMPTS, "重试次数必须有上限"
    with client.app.state.database.session_factory() as db:
        assert db.query(RecommendationJob).count() == 0, "耗尽重试后应当出队而不是永久堆积"


def test_a_dead_worker_releases_its_claim(client, demo_ids, monkeypatch):
    from datetime import UTC, datetime, timedelta

    monkeypatch.setattr(client.app.state.settings, "deepseek_api_key", "test-key")
    feed(client, demo_ids, limit=5)

    with client.app.state.database.session_factory() as db:
        claimed = jobs.claim(db)
        assert claimed is not None
        assert jobs.backlog(db) == {"pending": 0, "running": 1}

        # 模拟 worker 在处理途中死亡
        row = db.get(RecommendationJob, claimed.id)
        row.claimed_at = datetime.now(UTC) - timedelta(seconds=jobs.STALE_CLAIM_SECONDS + 10)
        db.commit()

        assert jobs.release_stale(db) == 1
        assert jobs.backlog(db) == {"pending": 1, "running": 0}


# -------------------------------------------------------------------- operations


def test_health_endpoint_reports_the_pipeline_state(client, demo_ids, monkeypatch):
    async def rerank(_adapter, candidates, _preferences):
        return {item["id"]: "AI 理由" for item in candidates}

    monkeypatch.setattr("app.services.feed.DeepSeekClient.rerank", rerank)
    monkeypatch.setattr(client.app.state.settings, "deepseek_api_key", "test-key")
    headers = bearer(admin_login(client)["access_token"])

    feed(client, demo_ids, limit=5)
    feed(client, demo_ids, limit=5)
    drain_recommendations(client)

    response = client.get(
        "/admin/api/v1/recommendations/health",
        params={"campus_id": demo_ids["campus"]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["ai_configured"] is True
    assert body["breaker_open"] is False
    assert body["cache"]["miss"] == 1
    assert body["cache"]["hit"] == 1
    assert body["cache_hit_ratio"] == 0.5
    assert body["backlog"] == {"pending": 0, "running": 0}
    assert body["snapshots"]["deterministic"] == 1
    assert body["snapshots"]["ai"] == 1
    assert body["ai_snapshot_share"] == 0.5


def test_health_endpoint_breaks_out_failure_reasons(client, demo_ids, monkeypatch):
    async def failing(_adapter, _candidates, _preferences):
        return None

    monkeypatch.setattr("app.services.feed.DeepSeekClient.rerank", failing)
    monkeypatch.setattr(client.app.state.settings, "deepseek_api_key", "test-key")
    headers = bearer(admin_login(client)["access_token"])

    feed(client, demo_ids, limit=5)
    drain_recommendations(client)

    body = client.get(
        "/admin/api/v1/recommendations/health",
        params={"campus_id": demo_ids["campus"]},
        headers=headers,
    ).json()
    # 只有一个总数时运维分不清是模型超时还是熔断打开。
    assert body["enrich_failed"] == {"no_usable_ordering": 1}


def test_health_endpoint_requires_admin(client, demo_ids):
    anonymous = client.get(
        "/admin/api/v1/recommendations/health",
        params={"campus_id": demo_ids["campus"]},
    )
    assert anonymous.status_code == 401

    user = bearer(login(client)["access_token"])
    assert (
        client.get(
            "/admin/api/v1/recommendations/health",
            params={"campus_id": demo_ids["campus"]},
            headers=user,
        ).status_code
        == 401
    )
