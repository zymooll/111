from __future__ import annotations

from sqlalchemy import func, select
from fastapi.testclient import TestClient

from app.api.catalog import router as catalog_router
from app.api.discovery import router as discovery_router
from app.config import Settings
from app.database import sqlite_memory_database
from app.main import create_app
from app.models import (
    Campus,
    Category,
    Favorite,
    InteractionEvent,
    MenuItem,
    Merchant,
    Review,
    ReviewStatus,
    ReviewView,
    Tag,
    User,
)
from app.seed import seed_demo_data
from app.seed_catalog import EXTENDED_ITEM_COUNT
from tests.conftest import bearer, login


def test_public_catalog_route_boundaries():
    discovery_paths = {route.path for route in discovery_router.routes}
    catalog_paths = {route.path for route in catalog_router.routes}

    assert discovery_paths == {
        "/recommendations/feed",
        "/search",
        "/search/suggestions",
    }
    assert catalog_paths == {
        "/areas",
        "/campuses",
        "/categories",
        "/menu-items/{menu_item_id}",
        "/menu-items/{menu_item_id}/reviews",
        "/merchants",
        "/merchants/{merchant_id}",
        "/merchants/{merchant_id}/menu",
        "/tags",
    }
    assert discovery_paths.isdisjoint(catalog_paths)


def test_health_openapi_and_seeded_catalog(client, demo_ids):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok", "environment": "test"}
    assert health.headers["x-request-id"]

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    paths = openapi.json()["paths"]
    assert "/api/v1/recommendations/feed" in paths
    assert "/admin/api/v1/reviews/{review_id}/moderate" in paths
    assert client.get("/api/v1/auth/providers").json() == []

    campuses = client.get("/api/v1/campuses").json()
    assert campuses[0]["id"] == demo_ids["campus"]
    assert campuses[0]["name"] == "中南林业科技大学"

    categories = client.get(
        "/api/v1/categories", params={"campus_id": demo_ids["campus"]}
    ).json()
    chinese = next(node for node in categories if node["id"] == demo_ids["cat_chinese"])
    assert {node["id"] for node in chinese["children"]} >= {
        demo_ids["cat_rice"],
        demo_ids["cat_noodle"],
    }

    feed = client.get(
        "/api/v1/recommendations/feed", params={"campus_id": demo_ids["campus"]}
    )
    assert feed.status_code == 200, feed.text
    payload = feed.json()
    assert len(payload["items"]) == 20
    assert payload["has_more"] is True
    assert payload["next_cursor"]
    assert all(item["recommendation_reason"] for item in payload["items"])
    assert {item["item_type"] for item in payload["items"]} <= {"dish", "combo"}

    parent_filtered = client.get(
        "/api/v1/recommendations/feed",
        params={
            "campus_id": demo_ids["campus"],
            "category_id": demo_ids["cat_chinese"],
        },
    ).json()
    assert {item["id"] for item in parent_filtered["items"]} >= {
        demo_ids["item_one"],
        demo_ids["item_three"],
    }

    suggestions = client.get(
        "/api/v1/search/suggestions", params={"q": "番茄", "campus_id": demo_ids["campus"]}
    )
    assert suggestions.status_code == 200
    assert suggestions.json()[0]["id"] == demo_ids["item_one"]

    detail = client.get(
        f"/api/v1/menu-items/{demo_ids['item_one']}",
        params={"campus_id": demo_ids["campus"]},
    )
    assert detail.status_code == 200
    assert set(detail.json()["rating_distribution"]) == {"1", "2", "3", "4", "5"}
    assert detail.json()["recommendation_reason"]


def test_seeded_ratings_are_backed_by_published_reviews(client, demo_ids):
    database = client.app.state.database
    item_ids = [
        demo_ids["item_one"],
        demo_ids["item_two"],
        demo_ids["item_three"],
        demo_ids["item_four"],
    ]

    with database.session_factory() as db:
        demo_user_id = db.scalar(select(User.id).where(User.username == "demo"))
        seeded_reviews = db.scalars(select(Review)).all()
        assert seeded_reviews
        assert all(review.user_id != demo_user_id for review in seeded_reviews)
        assert all(review.status == ReviewStatus.PUBLISHED for review in seeded_reviews)

        campus_average = db.scalar(
            select(func.avg(Review.rating))
            .join(MenuItem, MenuItem.id == Review.menu_item_id)
            .join(Merchant, Merchant.id == MenuItem.merchant_id)
            .where(
                Merchant.campus_id == demo_ids["campus"],
                Review.status == ReviewStatus.PUBLISHED,
                Review.deleted_at.is_(None),
            )
        )
        assert campus_average is not None

        for item_id in item_ids:
            item = db.get(MenuItem, item_id)
            assert item is not None
            average, count = db.execute(
                select(func.avg(Review.rating), func.count(Review.id)).where(
                    Review.menu_item_id == item_id,
                    Review.status == ReviewStatus.PUBLISHED,
                    Review.deleted_at.is_(None),
                )
            ).one()
            assert average is not None
            assert count > 0
            expected_rating = round(
                (count / (count + 5)) * float(average)
                + (5 / (count + 5)) * float(campus_average),
                2,
            )
            assert item.review_count == count
            assert item.rating_avg == expected_rating

    for item_id in item_ids:
        detail = client.get(
            f"/api/v1/menu-items/{item_id}",
            params={"campus_id": demo_ids["campus"]},
        )
        reviews = client.get(
            f"/api/v1/menu-items/{item_id}/reviews",
            params={"campus_id": demo_ids["campus"]},
        )
        assert detail.status_code == 200
        assert reviews.status_code == 200
        assert reviews.json()["total"] == detail.json()["review_count"]
        assert sum(detail.json()["rating_distribution"].values()) == reviews.json()["total"]


def test_seeded_catalog_scales_to_csuft_demo_96_items(client, demo_ids):
    database = client.app.state.database
    original_item_ids = {
        demo_ids["item_one"],
        demo_ids["item_two"],
        demo_ids["item_three"],
        demo_ids["item_four"],
    }

    with database.session_factory() as db:
        items = db.scalars(
            select(MenuItem)
            .where(MenuItem.campus_id == demo_ids["campus"])
            .order_by(MenuItem.name)
        ).all()
        expanded_items = [item for item in items if item.id not in original_item_ids]
        merchants = db.scalars(
            select(Merchant).where(Merchant.campus_id == demo_ids["campus"])
        ).all()

        assert len(items) == 4 + EXTENDED_ITEM_COUNT == 96
        assert len(expanded_items) == 92
        assert len({item.name for item in items}) == len(items)
        assert len(merchants) == 11
        assert all("演示生成" in item.description for item in expanded_items)
        assert all(300 <= item.price_cents <= 3500 for item in expanded_items)
        assert all(item.image_url.startswith("/dishes/") for item in expanded_items)
        assert all(item.review_count == 1 for item in expanded_items)
        assert {item.name for item in expanded_items} >= {
            "新奥尔良鸡扒饭",
            "林冠骨汤麻辣烫",
            "五食堂番茄鸡蛋面",
            "匠心卤双拼饭",
            "瑞幸经典拿铁",
            "库迪经典美式",
            "原味螺蛳粉",
            "原味过桥米线",
        }
        assert {merchant.name for merchant in merchants} >= {
            "中南林业科技大学林海餐厅",
            "林语餐厅",
            "中南林业科技大学林苑餐厅",
            "林涛餐厅",
            "林冠餐厅",
            "中南林业科技大学学生五食堂",
        }

        campus = db.get(Campus, demo_ids["campus"])
        lin_tao = next(merchant for merchant in merchants if merchant.name == "林涛餐厅")
        generated_item = next(
            item for item in expanded_items if item.name == "新奥尔良鸡扒饭"
        )
        assert campus is not None
        campus.name = "示范大学"
        lin_tao.name = "旧演示商家"
        generated_item.name = "旧演示菜品"
        db.commit()

        seed_demo_data(db)
        assert db.scalar(
            select(func.count(MenuItem.id)).where(
                MenuItem.campus_id == demo_ids["campus"]
            )
        ) == 96
        assert db.get(Campus, demo_ids["campus"]).name == "中南林业科技大学"
        assert db.get(Merchant, lin_tao.id).name == "林涛餐厅"
        assert db.get(MenuItem, generated_item.id).name == "新奥尔良鸡扒饭"


def test_problem_details_and_cursor_validation(client, demo_ids):
    response = client.get(
        "/api/v1/recommendations/feed",
        params={"campus_id": demo_ids["campus"], "cursor": "bad"},
    )
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["request_id"]

    missing = client.get(
        "/api/v1/menu-items/not-found",
        params={"campus_id": demo_ids["campus"]},
    )
    assert missing.status_code == 404
    assert missing.json()["title"] == "资源不存在"

    method_not_allowed = client.post("/health")
    assert method_not_allowed.status_code == 405
    assert method_not_allowed.headers["content-type"].startswith(
        "application/problem+json"
    )


def test_recent_behavior_builds_guest_profile_and_changes_fallback_ranking(client, demo_ids):
    guest = client.post("/api/v1/auth/guest").json()
    headers = {"Authorization": f"Bearer {guest['access_token']}"}

    recorded = client.post(
        "/api/v1/interactions",
        headers=headers,
        json={
            "campus_id": demo_ids["campus"],
            "events": [
                {
                    "event_id": "behavior-click-item-three",
                    "event_type": "click",
                    "menu_item_id": demo_ids["item_three"],
                    "metadata": {"source": "home_feed"},
                }
            ]
        },
    )
    assert recorded.status_code == 200, recorded.text

    feed = client.get(
        "/api/v1/recommendations/feed",
        headers=headers,
        params={"campus_id": demo_ids["campus"]},
    )
    assert feed.status_code == 200, feed.text
    first = feed.json()["items"][0]
    assert first["id"] == demo_ids["item_three"]
    assert "清淡" in first["recommendation_reason"]


def test_deepseek_profile_excludes_raw_search_text(client, demo_ids, monkeypatch):
    captured: dict[str, object] = {}

    async def capture_profile(_adapter, _candidates, preferences):
        captured.update(preferences)
        return None

    monkeypatch.setattr("app.api.discovery.DeepSeekClient.rerank", capture_profile)
    guest = client.post("/api/v1/auth/guest").json()
    headers = {"Authorization": f"Bearer {guest['access_token']}"}
    raw_search = "student-private@example.com"
    client.post(
        "/api/v1/interactions",
        headers=headers,
        json={
            "campus_id": demo_ids["campus"],
            "events": [
                {
                    "event_id": "private-search-event-0001",
                    "event_type": "search",
                    "metadata": {"query": raw_search},
                }
            ]
        },
    )

    response = client.get(
        "/api/v1/recommendations/feed",
        headers=headers,
        params={"campus_id": demo_ids["campus"]},
    )

    assert response.status_code == 200
    assert raw_search not in str(captured)
    assert captured["behavior_profile"]["search_signal_count"] == 1


def test_campus_isolation_is_required_and_enforced(client, demo_ids):
    database = client.app.state.database
    second_campus_id = "10000000-0000-0000-0000-000000000001"
    second_category_id = "10000000-0000-0000-0000-000000000021"
    second_merchant_id = "10000000-0000-0000-0000-000000000031"
    second_item_id = "10000000-0000-0000-0000-000000000041"
    with database.session_factory() as db:
        second_campus = Campus(
            id=second_campus_id,
            name="第二示范大学",
            center_latitude=30.0,
            center_longitude=120.0,
        )
        db.add(second_campus)
        db.flush()
        db.add(
            Category(
                id=second_category_id,
                campus_id=second_campus_id,
                name="第二校园品类",
            )
        )
        db.add(
            Merchant(
                id=second_merchant_id,
                campus_id=second_campus_id,
                category_id=second_category_id,
                name="第二校园商家",
                description="隔离测试",
                address="第二校园 1 号",
                latitude=30.0,
                longitude=120.0,
                gcj02_latitude=30.0,
                gcj02_longitude=120.0,
                price_level=2,
            )
        )
        db.flush()
        db.add(
            MenuItem(
                id=second_item_id,
                campus_id=second_campus_id,
                merchant_id=second_merchant_id,
                category_id=second_category_id,
                name="第二校园套餐",
                item_type="combo",
                price_cents=1200,
                image_url="/dishes/rice-bowl.svg",
            )
        )
        db.commit()

        for model in (
            Category,
            Tag,
            MenuItem,
            Favorite,
            Review,
            ReviewView,
            InteractionEvent,
        ):
            assert db.scalar(select(func.count(model.id)).where(model.campus_id.is_(None))) == 0

    assert client.get("/api/v1/categories").status_code == 422
    wrong_campus = client.get(
        f"/api/v1/menu-items/{second_item_id}",
        params={"campus_id": demo_ids["campus"]},
    )
    assert wrong_campus.status_code == 404

    second_categories = client.get(
        "/api/v1/categories", params={"campus_id": second_campus_id}
    ).json()
    assert [entry["id"] for entry in second_categories] == [second_category_id]

    guest = client.post("/api/v1/auth/guest").json()
    cross_event = client.post(
        "/api/v1/interactions",
        headers=bearer(guest["access_token"]),
        json={
            "campus_id": demo_ids["campus"],
            "events": [
                {
                    "event_id": "cross-campus-item-event",
                    "event_type": "click",
                    "menu_item_id": second_item_id,
                }
            ],
        },
    )
    assert cross_event.status_code == 404


def test_idempotency_key_replays_write_and_rejects_payload_change(client, demo_ids):
    headers = bearer(login(client)["access_token"])
    headers["Idempotency-Key"] = "review-create-idempotency-0001"
    url = f"/api/v1/menu-items/{demo_ids['item_one']}/reviews"
    params = {"campus_id": demo_ids["campus"]}
    payload = {"rating": 5, "text": "幂等提交测试", "images": []}

    first = client.post(url, params=params, json=payload, headers=headers)
    assert first.status_code == 201, first.text
    replay = client.post(url, params=params, json=payload, headers=headers)
    assert replay.status_code == 201, replay.text
    assert replay.headers["idempotency-replayed"] == "true"
    assert replay.json()["id"] == first.json()["id"]

    conflict = client.post(
        url,
        params=params,
        json={**payload, "rating": 4},
        headers=headers,
    )
    assert conflict.status_code == 409
    assert conflict.headers["content-type"].startswith("application/problem+json")

    with client.app.state.database.session_factory() as db:
        assert (
            db.scalar(
                select(func.count(Review.id)).where(
                    Review.user_id == first.json()["user_id"],
                    Review.menu_item_id == demo_ids["item_one"],
                    Review.deleted_at.is_(None),
                )
            )
            == 1
        )


def test_review_cursor_pages_do_not_overlap(client, demo_ids):
    first = client.get(
        f"/api/v1/menu-items/{demo_ids['item_one']}/reviews",
        params={"campus_id": demo_ids["campus"], "limit": 2},
    )
    assert first.status_code == 200
    first_page = first.json()
    assert first_page["has_more"] is True
    assert first_page["next_cursor"]
    second = client.get(
        f"/api/v1/menu-items/{demo_ids['item_one']}/reviews",
        params={
            "campus_id": demo_ids["campus"],
            "limit": 2,
            "cursor": first_page["next_cursor"],
        },
    )
    assert second.status_code == 200
    first_ids = {entry["id"] for entry in first_page["items"]}
    second_ids = {entry["id"] for entry in second.json()["items"]}
    assert first_ids.isdisjoint(second_ids)


def test_unhandled_exception_is_problem_details(tmp_path):
    settings = Settings(
        environment="test",
        database_url="sqlite://",
        secret_key="test-secret-key-with-enough-randomness",
        auto_seed=False,
        upload_dir=tmp_path / "uploads",
        cors_origins=["http://testserver"],
    )
    app = create_app(settings=settings, database=sqlite_memory_database())

    @app.get("/_tests/unhandled")
    def unhandled():
        raise RuntimeError("sensitive internal message")

    with TestClient(app, raise_server_exceptions=False) as safe_client:
        response = safe_client.get("/_tests/unhandled")
    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["detail"] == "服务器内部错误"
    assert "sensitive" not in response.text
