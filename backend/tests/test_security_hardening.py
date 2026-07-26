"""Negative-path regressions for the abuse, authorization and configuration boundaries."""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.config import InsecureProductionSettings, Settings
from app.models import Merchant, User, UserRole
from app.security import create_token
from app.services.geo import wgs84_to_gcj02
from tests.conftest import admin_login, bearer, build_client, login

PRODUCTION_BASE = {
    "environment": "production",
    "secret_key": "a" * 48,
    "auto_seed": False,
    "expose_debug_tokens": False,
    "cors_origins": ["https://foodie.example.com"],
    "smtp_host": "smtp.example.com",
}


@pytest.mark.parametrize(
    ("override", "expected"),
    [
        ({"secret_key": "development-only-change-me-please"}, "SECRET_KEY"),
        ({"secret_key": "change-this-before-production"}, "SECRET_KEY"),
        ({"secret_key": "short"}, "SECRET_KEY"),
        ({"auto_seed": True}, "AUTO_SEED"),
        ({"expose_debug_tokens": True}, "EXPOSE_DEBUG_TOKENS"),
        ({"rate_limit_enabled": False}, "RATE_LIMIT_ENABLED"),
        ({"cors_origins": []}, "CORS_ORIGINS"),
        ({"cors_origins": ["*"]}, "CORS_ORIGINS"),
        ({"smtp_host": None}, "SMTP_HOST"),
    ],
)
def test_production_refuses_unsafe_configuration(override, expected):
    with pytest.raises(InsecureProductionSettings) as excinfo:
        Settings(**{**PRODUCTION_BASE, **override})
    assert expected in str(excinfo.value)


def test_production_accepts_a_hardened_configuration():
    settings = Settings(**PRODUCTION_BASE)
    assert settings.production
    assert not settings.auto_seed


def test_debug_token_is_withheld_unless_explicitly_enabled(tmp_path):
    with build_client(tmp_path, expose_debug_tokens=False) as client:
        response = client.post(
            "/api/v1/auth/password/forgot", json={"email": "demo@example.com"}
        )
        assert response.status_code == 200
        assert response.json()["debug_token"] is None


def test_login_is_rate_limited_and_locks_out_after_repeated_failures(tmp_path):
    with build_client(tmp_path, rate_limit_enabled=True) as client:
        statuses = [
            client.post(
                "/api/v1/auth/login",
                json={"identifier": "demo", "password": "wrong-password"},
            ).status_code
            for _ in range(12)
        ]
        assert statuses[0] == 401
        assert 429 in statuses, statuses
        # 锁定后即便密码正确也拒绝，避免爆破者用正确口令确认命中。
        blocked = client.post(
            "/api/v1/auth/login", json={"identifier": "demo", "password": "Demo123!"}
        )
        assert blocked.status_code == 429
        assert blocked.headers.get("Retry-After")


def test_successful_login_clears_the_failure_counter(tmp_path):
    with build_client(tmp_path, rate_limit_enabled=True) as client:
        for _ in range(3):
            client.post(
                "/api/v1/auth/login",
                json={"identifier": "demo", "password": "wrong-password"},
            )
        assert (
            client.post(
                "/api/v1/auth/login", json={"identifier": "demo", "password": "Demo123!"}
            ).status_code
            == 200
        )
        for _ in range(3):
            client.post(
                "/api/v1/auth/login",
                json={"identifier": "demo", "password": "wrong-password"},
            )
        assert (
            client.post(
                "/api/v1/auth/login", json={"identifier": "demo", "password": "Demo123!"}
            ).status_code
            == 200
        )


def _make_scoped_admin(client, *, campus_id: str | None, role: str) -> dict[str, str]:
    database = client.app.state.database
    with database.session_factory() as db:
        from app.security import hash_password

        admin = User(
            username=f"scoped-{role}-{campus_id or 'none'}",
            email=f"scoped-{role}-{campus_id or 'none'}@example.com",
            password_hash=hash_password("Scoped123!"),
            role=role,
            managed_campus_id=campus_id,
            is_active=True,
            email_verified=True,
        )
        db.add(admin)
        db.commit()
        username = admin.username
    pair = client.post(
        "/admin/api/v1/auth/login",
        json={"identifier": username, "password": "Scoped123!"},
    )
    assert pair.status_code == 200, pair.text
    return bearer(pair.json()["access_token"])


def _make_second_campus(client) -> str:
    from app.models import Campus

    campus_id = "00000000-0000-0000-0000-0000000000ff"
    with client.app.state.database.session_factory() as db:
        db.add(
            Campus(
                id=campus_id,
                name="另一所学校",
                center_latitude=30.0,
                center_longitude=114.0,
            )
        )
        db.commit()
    return campus_id


def test_campus_admin_cannot_reach_another_campus(client, demo_ids):
    other_campus = _make_second_campus(client)
    headers = _make_scoped_admin(
        client, campus_id=other_campus, role=UserRole.CAMPUS_ADMIN
    )
    # 自己的校园可以进
    assert (
        client.get(
            "/admin/api/v1/merchants",
            params={"campus_id": other_campus},
            headers=headers,
        ).status_code
        == 200
    )
    # 换一个 campus_id 就必须被服务端挡下
    denied = client.get(
        "/admin/api/v1/merchants",
        params={"campus_id": demo_ids["campus"]},
        headers=headers,
    )
    assert denied.status_code == 403
    for path in ("/admin/api/v1/dashboard", "/admin/api/v1/reviews", "/admin/api/v1/audit-logs"):
        assert (
            client.get(path, params={"campus_id": demo_ids["campus"]}, headers=headers).status_code
            == 403
        ), path


def test_admin_without_campus_grant_is_denied(client, demo_ids):
    headers = _make_scoped_admin(client, campus_id=None, role=UserRole.CAMPUS_ADMIN)
    denied = client.get(
        "/admin/api/v1/merchants",
        params={"campus_id": demo_ids["campus"]},
        headers=headers,
    )
    assert denied.status_code == 403
    assert "校园" in denied.json()["detail"]


def test_campus_admin_cannot_see_or_touch_admin_accounts(client, demo_ids):
    headers = _make_scoped_admin(
        client, campus_id=demo_ids["campus"], role=UserRole.CAMPUS_ADMIN
    )
    listing = client.get(
        "/admin/api/v1/users",
        params={"campus_id": demo_ids["campus"], "limit": 100},
        headers=headers,
    )
    assert listing.status_code == 200, listing.text
    roles = {item["role"] for item in listing.json()["items"]}
    assert roles <= {UserRole.USER.value}

    database = client.app.state.database
    with database.session_factory() as db:
        super_admin_id = db.query(User).filter(User.username == "admin").one().id
    escalation = client.patch(
        f"/admin/api/v1/users/{super_admin_id}",
        params={"campus_id": demo_ids["campus"]},
        json={"is_active": False},
        headers=headers,
    )
    assert escalation.status_code == 403
    reset = client.post(
        f"/admin/api/v1/users/{super_admin_id}/password-reset",
        params={"campus_id": demo_ids["campus"]},
        headers=headers,
    )
    assert reset.status_code == 403


def test_forged_and_cross_audience_tokens_are_rejected(client, demo_ids):
    settings = client.app.state.settings
    forged = create_token(
        subject="00000000-0000-0000-0000-000000000000",
        secret_key="a-different-secret-key-entirely",
        audience="campus-food-admin",
        token_type="access",
        expires_delta=timedelta(hours=1),
    )
    assert client.get("/admin/api/v1/dashboard", params={"campus_id": demo_ids["campus"]},
                      headers=bearer(forged)).status_code == 401

    user_pair = login(client)
    # 用户令牌的 audience 是 campus-food-user，拿去打管理端必须被拒。
    assert client.get(
        "/admin/api/v1/dashboard",
        params={"campus_id": demo_ids["campus"]},
        headers=bearer(user_pair["access_token"]),
    ).status_code == 401

    guest_as_access = create_token(
        subject="00000000-0000-0000-0000-000000000000",
        secret_key=settings.secret_key,
        audience="campus-food-admin",
        token_type="guest",
        expires_delta=timedelta(hours=1),
    )
    expired = create_token(
        subject="00000000-0000-0000-0000-000000000000",
        secret_key=settings.secret_key,
        audience="campus-food-admin",
        token_type="access",
        expires_delta=timedelta(seconds=-30),
    )
    assert client.get(
        "/admin/api/v1/dashboard",
        params={"campus_id": demo_ids["campus"]},
        headers=bearer(expired),
    ).status_code == 401
    assert client.get(
        "/admin/api/v1/dashboard",
        params={"campus_id": demo_ids["campus"]},
        headers=bearer(guest_as_access),
    ).status_code == 401


def _publish_own_review(client, demo_ids, headers) -> str:
    created = client.post(
        f"/api/v1/menu-items/{demo_ids['item_two']}/reviews",
        params={"campus_id": demo_ids["campus"]},
        json={"rating": 4, "text": "分量足，出餐也快", "images": []},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def test_other_users_cannot_edit_or_delete_a_review(client, demo_ids):
    owner = bearer(login(client)["access_token"])
    review_id = _publish_own_review(client, demo_ids, owner)

    registered = client.post(
        "/api/v1/auth/register",
        json={
            "username": "intruder",
            "email": "intruder@example.com",
            "password": "Intruder123!",
        },
    )
    assert registered.status_code == 201, registered.text
    intruder = bearer(registered.json()["access_token"])

    patched = client.patch(
        f"/api/v1/reviews/{review_id}",
        params={"campus_id": demo_ids["campus"]},
        json={"rating": 1, "text": "恶意改写他人评价内容", "images": []},
        headers=intruder,
    )
    assert patched.status_code in {403, 404}
    deleted = client.delete(
        f"/api/v1/reviews/{review_id}",
        params={"campus_id": demo_ids["campus"]},
        headers=intruder,
    )
    assert deleted.status_code in {403, 404}

    still_there = client.get(
        f"/api/v1/reviews/{review_id}", params={"campus_id": demo_ids["campus"]}
    )
    if still_there.status_code == 200:
        assert still_there.json()["text"] != "恶意改写他人评价内容"


def test_author_edit_cannot_undo_an_admin_hide(client, demo_ids):
    owner = bearer(login(client)["access_token"])
    review_id = _publish_own_review(client, demo_ids, owner)

    admin_headers = bearer(admin_login(client)["access_token"])
    published = client.post(
        f"/admin/api/v1/reviews/{review_id}/moderate",
        params={"campus_id": demo_ids["campus"]},
        json={"action": "publish", "reason": ""},
        headers=admin_headers,
    )
    assert published.status_code == 200, published.text
    hidden = client.post(
        f"/admin/api/v1/reviews/{review_id}/moderate",
        params={"campus_id": demo_ids["campus"]},
        json={"action": "hide", "reason": "与菜品无关"},
        headers=admin_headers,
    )
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["status"] == "hidden"

    edited = client.patch(
        f"/api/v1/reviews/{review_id}",
        params={"campus_id": demo_ids["campus"]},
        json={"rating": 5, "text": "换个说法再发一次，内容本身没有风险词", "images": []},
        headers=owner,
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["status"] == "pending_manual"


def test_admin_moderation_rejects_illegal_transitions(client, demo_ids):
    owner = bearer(login(client)["access_token"])
    review_id = _publish_own_review(client, demo_ids, owner)
    admin_headers = bearer(admin_login(client)["access_token"])

    rejected = client.post(
        f"/admin/api/v1/reviews/{review_id}/moderate",
        params={"campus_id": demo_ids["campus"]},
        json={"action": "reject", "reason": "内容不实"},
        headers=admin_headers,
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"

    # restore 只用于撤销下架，被驳回的评价不能一步回到已发布。
    restored = client.post(
        f"/admin/api/v1/reviews/{review_id}/moderate",
        params={"campus_id": demo_ids["campus"]},
        json={"action": "restore", "reason": ""},
        headers=admin_headers,
    )
    assert restored.status_code == 409


def test_idempotent_replay_keeps_cors_headers(client, demo_ids):
    headers = {
        **bearer(login(client)["access_token"]),
        "Idempotency-Key": "replay-cors-check-0001",
        "Origin": "http://testserver",
    }
    params = {"campus_id": demo_ids["campus"]}
    first = client.put(
        f"/api/v1/favorites/merchants/{demo_ids['merchant_one']}", params=params, headers=headers
    )
    assert first.status_code in {200, 201}, first.text
    assert first.headers.get("access-control-allow-origin") == "http://testserver"

    replay = client.put(
        f"/api/v1/favorites/merchants/{demo_ids['merchant_one']}", params=params, headers=headers
    )
    assert replay.headers.get("Idempotency-Replayed") == "true"
    assert replay.headers.get("access-control-allow-origin") == "http://testserver"

    # 同一个幂等键用于不同请求必须冲突，且该短路响应同样要带 CORS 头。
    conflict = client.put(
        f"/api/v1/favorites/merchants/{demo_ids['merchant_one']}",
        params={**params, "source": "map"},
        headers=headers,
    )
    assert conflict.status_code == 409
    assert conflict.headers.get("access-control-allow-origin") == "http://testserver"


def test_chinese_tags_round_trip_and_drive_the_taste_filter(client, demo_ids):
    admin_headers = bearer(admin_login(client)["access_token"])
    params = {"campus_id": demo_ids["campus"]}
    updated = client.patch(
        f"/admin/api/v1/menu-items/{demo_ids['item_one']}",
        params=params,
        json={"tags": ["微辣"]},
        headers=admin_headers,
    )
    assert updated.status_code == 200, updated.text

    database = client.app.state.database
    with database.session_factory() as db:
        raw = db.execute(
            __import__("sqlalchemy").text(
                "SELECT tags FROM menu_items WHERE id = :id"
            ),
            {"id": demo_ids["item_one"]},
        ).scalar_one()
    assert "\\u" not in raw, f"JSON 列仍以 ensure_ascii 落库: {raw}"
    assert "微辣" in raw

    filtered = client.get(
        "/api/v1/map/merchants", params={**params, "taste": "微辣"}
    )
    assert filtered.status_code == 200, filtered.text
    assert filtered.json(), "中文口味筛选不应返回空结果"


def test_merchant_move_recomputes_gcj02(client, demo_ids):
    admin_headers = bearer(admin_login(client)["access_token"])
    latitude, longitude = 28.2000, 112.9000
    response = client.patch(
        f"/admin/api/v1/merchants/{demo_ids['merchant_one']}",
        params={"campus_id": demo_ids["campus"]},
        json={"latitude": latitude, "longitude": longitude},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text

    database = client.app.state.database
    with database.session_factory() as db:
        merchant = db.get(Merchant, demo_ids["merchant_one"])
        expected_lat, expected_lng = wgs84_to_gcj02(latitude, longitude)
        assert merchant.gcj02_latitude == pytest.approx(expected_lat)
        assert merchant.gcj02_longitude == pytest.approx(expected_lng)
        # 长沙一带的偏移量在数百米量级，绝不应等于原始 WGS-84 坐标。
        assert merchant.gcj02_latitude != latitude


def test_openapi_and_docs_are_hidden_in_production(tmp_path):
    from fastapi.testclient import TestClient

    from app.database import sqlite_memory_database
    from app.main import create_app

    settings = Settings(
        **PRODUCTION_BASE,
        database_url="sqlite://",
        upload_dir=tmp_path / "uploads",
    )
    app = create_app(settings=settings, database=sqlite_memory_database())
    with TestClient(app) as client:
        assert client.get("/openapi.json").status_code == 404
        assert client.get("/docs").status_code == 404
        assert client.get("/health").status_code == 200


def test_retention_sweep_removes_only_dead_bookkeeping_rows(client, demo_ids):
    from datetime import UTC, datetime, timedelta

    from app.models import AccountActionToken, IdempotencyRecord, RefreshSession
    from app.services.retention import purge_expired

    pair = login(client)
    factory = client.app.state.database.session_factory
    now = datetime.now(UTC)
    with factory() as db:
        db.add(
            IdempotencyRecord(
                scope="stale",
                idempotency_key="stale-key-0001",
                request_hash="x" * 64,
                response_status=200,
                response_body="{}",
                content_type="application/json",
                created_at=now - timedelta(hours=72),
            )
        )
        db.add(
            IdempotencyRecord(
                scope="fresh",
                idempotency_key="fresh-key-0001",
                request_hash="y" * 64,
                response_status=200,
                response_body="{}",
                content_type="application/json",
                created_at=now,
            )
        )
        db.commit()
        live_sessions = db.query(RefreshSession).count()
        live_tokens = db.query(AccountActionToken).count()

    removed = purge_expired(factory, idempotency_retention_hours=48)
    assert removed["idempotency_records"] == 1

    with factory() as db:
        keys = {row.idempotency_key for row in db.query(IdempotencyRecord).all()}
        assert keys == {"fresh-key-0001"}
        # 仍然有效的会话与令牌不能被清理掉。
        assert db.query(RefreshSession).count() == live_sessions
        assert db.query(AccountActionToken).count() == live_tokens

    # 清理之后刷新令牌依然可用
    refreshed = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]}
    )
    assert refreshed.status_code == 200, refreshed.text


def _import_areas(client, demo_ids, headers, csv_content: bytes):
    return client.post(
        "/admin/api/v1/imports",
        data={"type": "areas", "campus_id": demo_ids["campus"]},
        files={"file": ("areas.csv", csv_content, "text/csv")},
        headers=headers,
    )


def _import_report(client, demo_ids, headers, job_id: str) -> dict:
    detail = client.get(
        f"/admin/api/v1/imports/{job_id}",
        params={"campus_id": demo_ids["campus"]},
        headers=headers,
    )
    assert detail.status_code == 200, detail.text
    return detail.json()


def test_import_rejects_duplicates_within_the_file_and_against_the_database(client, demo_ids):
    headers = bearer(admin_login(client)["access_token"])
    campus = demo_ids["campus"]
    duplicated = (
        "campus_id,name,level,sort_order\n"
        f"{campus},重复导入区域,1,10\n"
        f"{campus},重复导入区域,1,11\n"
        f"{campus},唯一导入区域,1,12\n"
    ).encode()

    first = _import_areas(client, demo_ids, headers, duplicated)
    assert first.status_code == 201, first.text
    body = first.json()
    # 文件内重复的第二行被挡下，另外两行正常写入。
    assert body["success"] == 2
    assert body["failed"] == 1
    report = _import_report(client, demo_ids, headers, body["id"])
    assert any("文件中重复" in error["message"] for error in report["errors"])

    # 再导一次同一份文件：全部命中库中已存在，不应产生任何重复记录。
    second = _import_areas(client, demo_ids, headers, duplicated)
    assert second.status_code == 201, second.text
    again = second.json()
    assert again["success"] == 0
    again_report = _import_report(client, demo_ids, headers, again["id"])
    assert any("库中已存在" in error["message"] for error in again_report["errors"])

    from app.models import CampusArea

    with client.app.state.database.session_factory() as db:
        names = [
            row.name
            for row in db.query(CampusArea).filter(CampusArea.campus_id == campus).all()
            if row.name in {"重复导入区域", "唯一导入区域"}
        ]
    assert sorted(names) == ["唯一导入区域", "重复导入区域"]


def test_import_keeps_per_row_errors_instead_of_collapsing_the_batch(client, demo_ids):
    headers = bearer(admin_login(client)["access_token"])
    campus = demo_ids["campus"]
    mixed = (
        "campus_id,name,level,sort_order\n"
        f"{campus},合法区域甲,1,1\n"
        f"{campus},,1,2\n"
        f"{campus},合法区域乙,not-a-number,3\n"
    ).encode()
    response = _import_areas(client, demo_ids, headers, mixed)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["success"] == 1
    # 每个坏行都保留自己的行号与字段，而不是被一条"数据库写入失败"覆盖。
    report = _import_report(client, demo_ids, headers, body["id"])
    rows = {error["row"] for error in report["errors"]}
    fields = {error["field"] for error in report["errors"]}
    assert rows == {3, 4}
    assert "name" in fields and "level" in fields


def test_import_cannot_target_another_campus(client, demo_ids):
    other_campus = _make_second_campus(client)
    headers = _make_scoped_admin(client, campus_id=other_campus, role=UserRole.CAMPUS_ADMIN)
    denied = client.post(
        "/admin/api/v1/imports",
        data={"type": "areas", "campus_id": demo_ids["campus"]},
        files={"file": ("areas.csv", b"campus_id,name\n", "text/csv")},
        headers=headers,
    )
    assert denied.status_code == 403
