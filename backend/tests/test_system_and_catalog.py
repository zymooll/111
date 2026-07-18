from __future__ import annotations

from sqlalchemy import func, select

from app.models import MenuItem, Merchant, Review, ReviewStatus, User


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

    categories = client.get("/api/v1/categories").json()
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
    assert len(payload["items"]) == 4
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

    detail = client.get(f"/api/v1/menu-items/{demo_ids['item_one']}")
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
        detail = client.get(f"/api/v1/menu-items/{item_id}")
        reviews = client.get(f"/api/v1/menu-items/{item_id}/reviews")
        assert detail.status_code == 200
        assert reviews.status_code == 200
        assert reviews.json()["total"] == detail.json()["review_count"]
        assert sum(detail.json()["rating_distribution"].values()) == reviews.json()["total"]


def test_problem_details_and_cursor_validation(client):
    response = client.get("/api/v1/recommendations/feed", params={"cursor": "bad"})
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["request_id"]

    missing = client.get("/api/v1/menu-items/not-found")
    assert missing.status_code == 404
    assert missing.json()["title"] == "资源不存在"


def test_recent_behavior_builds_guest_profile_and_changes_fallback_ranking(client, demo_ids):
    guest = client.post("/api/v1/auth/guest").json()
    headers = {"Authorization": f"Bearer {guest['access_token']}"}

    recorded = client.post(
        "/api/v1/interactions",
        headers=headers,
        json={
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

    monkeypatch.setattr("app.api.catalog.DeepSeekClient.rerank", capture_profile)
    guest = client.post("/api/v1/auth/guest").json()
    headers = {"Authorization": f"Bearer {guest['access_token']}"}
    raw_search = "student-private@example.com"
    client.post(
        "/api/v1/interactions",
        headers=headers,
        json={
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
