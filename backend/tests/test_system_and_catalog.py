from __future__ import annotations


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


def test_problem_details_and_cursor_validation(client):
    response = client.get("/api/v1/recommendations/feed", params={"cursor": "bad"})
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["request_id"]

    missing = client.get("/api/v1/menu-items/not-found")
    assert missing.status_code == 404
    assert missing.json()["title"] == "资源不存在"
