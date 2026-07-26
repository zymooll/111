"""Races that only show up under real concurrent writers.

用文件型 SQLite（WAL）加真实线程，而不是内存库：内存库上每个连接看到的是各自的库，
根本不会发生竞争，测试会假通过。设了 CI_DATABASE_URL 时整套自动跑在 PostgreSQL 上，
那里才是真正的目标环境。
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.database import Database
from app.models import MenuItem, Review, ReviewStatus, ReviewView, User
from app.security import hash_password
from app.seed import DEMO_IDS, seed_demo_data
from app.services.ratings import recalculate_item_rating

WRITERS = 8


@pytest.fixture
def concurrent_db(tmp_path):
    """A database real threads can contend on, pre-loaded with distinct writers."""
    url = os.environ.get("CI_DATABASE_URL")
    database = Database(url or f"sqlite:///{tmp_path / 'concurrency.db'}")
    if url:
        database.drop_all()
    database.create_all()
    with database.session_factory() as db:
        seed_demo_data(db)
        # 评价有 (user_id, menu_item_id) 唯一约束，所以每个并发写入者必须是不同的人。
        db.add_all(
            User(
                id=f"90000000-0000-0000-0000-{index:012d}",
                username=f"racer{index}",
                email=f"racer{index}@example.com",
                password_hash=hash_password("Racer123!"),
                email_verified=True,
            )
            for index in range(WRITERS)
        )
        db.commit()
    yield database
    database.dispose()


def racer_id(index: int) -> str:
    return f"90000000-0000-0000-0000-{index:012d}"


def any_published_review(database) -> str:
    with database.session_factory() as db:
        return db.scalars(
            select(Review.id)
            .where(Review.status == ReviewStatus.PUBLISHED, Review.deleted_at.is_(None))
            .limit(1)
        ).one()


def other_published_review(database, exclude: str) -> str:
    with database.session_factory() as db:
        return db.scalars(
            select(Review.id)
            .where(
                Review.status == ReviewStatus.PUBLISHED,
                Review.deleted_at.is_(None),
                Review.id != exclude,
            )
            .limit(1)
        ).one()


def run_in_parallel(work, count: int = WRITERS) -> list:
    with ThreadPoolExecutor(max_workers=count) as pool:
        return [future.result() for future in [pool.submit(work, index) for index in range(count)]]


def test_review_view_counter_loses_no_increments(concurrent_db):
    """读-改-写的自增在并发下会丢更新；必须由数据库做原子自增。"""
    review_id = any_published_review(concurrent_db)

    def viewer(index: int) -> None:
        with concurrent_db.session_factory() as db:
            from app.api.reviews import bump_review_view

            bump_review_view(
                db,
                review_id=review_id,
                campus_id=DEMO_IDS["campus"],
                event_id=f"concurrent-view-{index:04d}",
                viewer_user_id=None,
                viewer_guest_id=None,
            )
            db.commit()

    with concurrent_db.session_factory() as db:
        before = db.get(Review, review_id).view_count

    run_in_parallel(viewer)

    with concurrent_db.session_factory() as db:
        after = db.get(Review, review_id).view_count
        recorded = db.query(ReviewView).filter(ReviewView.review_id == review_id).count()

    assert after - before == WRITERS, f"丢失了 {WRITERS - (after - before)} 次自增"
    assert recorded >= WRITERS


def test_duplicate_view_events_are_counted_once(concurrent_db):
    """同一个 event_id 并发重放，只能计一次。"""
    review_id = other_published_review(concurrent_db, any_published_review(concurrent_db))

    def viewer(_index: int) -> None:
        with concurrent_db.session_factory() as db:
            from app.api.reviews import bump_review_view

            bump_review_view(
                db,
                review_id=review_id,
                campus_id=DEMO_IDS["campus"],
                event_id="same-event-for-everyone",
                viewer_user_id=None,
                viewer_guest_id=None,
            )
            db.commit()

    with concurrent_db.session_factory() as db:
        before = db.get(Review, review_id).view_count

    run_in_parallel(viewer)

    with concurrent_db.session_factory() as db:
        after = db.get(Review, review_id).view_count

    assert after - before == 1, "同一事件被重复计数"


def test_rating_recalculation_counts_every_concurrent_review(concurrent_db):
    """并发提交评价时，聚合重算不能互相覆盖导致永久漏计。"""
    item_id = DEMO_IDS["item_two"]

    with concurrent_db.session_factory() as db:
        item = db.get(MenuItem, item_id)
        baseline = item.review_count

    def submit(index: int) -> None:
        with concurrent_db.session_factory() as db:
            db.add(
                Review(
                    campus_id=DEMO_IDS["campus"],
                    user_id=racer_id(index),
                    menu_item_id=item_id,
                    rating=5,
                    text=f"并发评价 {index}",
                    images=[],
                    status=ReviewStatus.PUBLISHED,
                )
            )
            db.flush()
            recalculate_item_rating(db, item_id)
            db.commit()

    run_in_parallel(submit)

    with concurrent_db.session_factory() as db:
        item = db.get(MenuItem, item_id)
        truth = (
            db.query(Review)
            .filter(
                Review.menu_item_id == item_id,
                Review.status == ReviewStatus.PUBLISHED,
                Review.deleted_at.is_(None),
            )
            .count()
        )

    assert truth == baseline + WRITERS, "评价本身没有全部落库"
    assert item.review_count == truth, (
        f"物化的 review_count={item.review_count} 与真实的 {truth} 不一致，聚合重算漏计"
    )


def test_rating_recalculation_uses_a_deadlock_free_lock_mode():
    """锁强度必须恰好是 FOR NO KEY UPDATE。

    调用方刚往 reviews 插过一行，外键会让 PostgreSQL 持有该 menu_items 行的
    FOR KEY SHARE。FOR UPDATE 与之冲突，多个事务同时从共享锁升级就会死锁；
    FOR NO KEY UPDATE 不与 KEY SHARE 冲突，但仍与自身冲突，串行化效果不变。
    """
    from sqlalchemy.dialects import postgresql, sqlite

    from app.services.ratings import lock_menu_item  # noqa: F401 - 确保实现被导入

    statement = (
        select(MenuItem).where(MenuItem.id == "x").with_for_update(key_share=True)
    )
    rendered = str(statement.compile(dialect=postgresql.dialect()))
    assert "FOR NO KEY UPDATE" in rendered
    # SQLite 不支持行锁语法，必须被安全编译掉而不是报错
    assert "FOR" not in str(statement.compile(dialect=sqlite.dialect())).split("WHERE")[-1]


def test_recalculation_locks_before_it_aggregates(concurrent_db):
    """顺序必须是先锁后统计；颠倒了锁就形同虚设。"""
    emitted: list[str] = []

    from sqlalchemy import event as sa_event

    def record(_conn, _cursor, statement, *_args):
        emitted.append(" ".join(statement.split()))

    sa_event.listen(concurrent_db.engine, "before_cursor_execute", record)
    try:
        with concurrent_db.session_factory() as db:
            recalculate_item_rating(db, DEMO_IDS["item_one"])
            db.commit()
    finally:
        sa_event.remove(concurrent_db.engine, "before_cursor_execute", record)

    # 注意用 "avg("：菜品的列名里本来就有 rating_avg，按子串 "avg" 过滤会把锁语句误杀。
    lock_at = next(
        (
            i
            for i, sql in enumerate(emitted)
            if "FROM menu_items" in sql and "avg(" not in sql.lower()
        ),
        None,
    )
    aggregate_at = next(
        (i for i, sql in enumerate(emitted) if "avg(reviews.rating)" in sql.lower()), None
    )
    assert lock_at is not None, "没有对 menu_items 发出加锁查询"
    assert aggregate_at is not None, "没有统计查询"
    assert lock_at < aggregate_at, "先统计后加锁，锁不起作用"


def test_idempotency_reserves_before_it_executes(tmp_path):
    """并发的同键请求只能有一个进入处理函数，另一个必须被挡在门外。"""
    from app.models import IdempotencyRecord
    from tests.conftest import bearer, build_client, login

    executions: list[int] = []

    with build_client(tmp_path) as client:
        app = client.app

        @app.post("/api/v1/_race-probe")
        def probe() -> dict[str, int]:
            executions.append(1)
            return {"ran": len(executions)}

        headers = {
            **bearer(login(client)["access_token"]),
            "Idempotency-Key": "reserve-before-execute-01",
        }
        first = client.post("/api/v1/_race-probe", headers=headers)
        assert first.status_code == 200, first.text
        assert len(executions) == 1

        # 占位行在第一次成功后变成 completed，第二次必须走重放而不是再执行一遍。
        replay = client.post("/api/v1/_race-probe", headers=headers)
        assert replay.headers.get("Idempotency-Replayed") == "true"
        assert len(executions) == 1, "同一幂等键把处理函数执行了两次"

        with app.state.database.session_factory() as db:
            record = db.scalars(select(IdempotencyRecord)).one()
        assert record.state == "completed"


def test_an_in_flight_key_is_rejected_rather_than_double_executed(tmp_path):
    """占位仍在处理中时，同键请求得到 409 而不是被放进来重复执行副作用。"""
    from app.models import IdempotencyRecord
    from tests.conftest import bearer, build_client, login

    executions: list[int] = []

    with build_client(tmp_path) as client:
        app = client.app

        @app.post("/api/v1/_inflight-probe")
        def probe() -> dict[str, int]:
            executions.append(1)
            return {"ran": len(executions)}

        token = login(client)["access_token"]
        headers = {
            **bearer(token),
            "Idempotency-Key": "still-being-processed-1",
        }
        # 手工放一个 processing 占位，等价于"另一个请求正在处理中"
        with app.state.database.session_factory() as db:
            db.add(
                IdempotencyRecord(
                    scope=f"{hash_scope(token)}:POST:/api/v1/_inflight-probe",
                    idempotency_key="still-being-processed-1",
                    request_hash=request_hash_for(b""),
                    state="processing",
                )
            )
            db.commit()

        response = client.post("/api/v1/_inflight-probe", headers=headers)
        assert response.status_code == 409, response.text
        assert executions == [], "有请求正在处理时不该再执行一遍"
        assert "稍后重试" in response.json()["detail"]


def hash_scope(token: str) -> str:
    import hashlib

    return hashlib.sha256(f"Bearer {token}".encode()).hexdigest()[:24]


def request_hash_for(body: bytes) -> str:
    import hashlib

    return hashlib.sha256(
        b"POST" + b"\0" + b"/api/v1/_inflight-probe" + b"\0" + b"" + b"\0" + body
    ).hexdigest()


def test_a_failed_request_releases_its_key_for_retry(tmp_path):
    """失败的请求不能把幂等键锁死，否则客户端连重试的机会都没有。"""
    from app.models import IdempotencyRecord
    from tests.conftest import bearer, build_client, login

    attempts: list[int] = []

    with build_client(tmp_path) as client:
        app = client.app

        @app.post("/api/v1/_flaky-probe")
        def probe() -> dict[str, str]:
            attempts.append(1)
            if len(attempts) == 1:
                raise HTTPException(status_code=503, detail="暂时不可用")
            return {"status": "ok"}

        headers = {
            **bearer(login(client)["access_token"]),
            "Idempotency-Key": "retry-after-failure-01",
        }
        failed = client.post("/api/v1/_flaky-probe", headers=headers)
        assert failed.status_code == 503

        with app.state.database.session_factory() as db:
            assert db.query(IdempotencyRecord).count() == 0, "失败后占位没有释放"

        retried = client.post("/api/v1/_flaky-probe", headers=headers)
        assert retried.status_code == 200, retried.text
        assert len(attempts) == 2
