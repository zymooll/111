from __future__ import annotations

import base64

from tests.conftest import admin_login, bearer, login


ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
)
CORRUPT_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII="
)


def test_review_manual_fallback_admin_publish_and_stats(client, demo_ids):
    user_pair = login(client)
    user_headers = bearer(user_pair["access_token"])
    seeded_total = client.get(
        f"/api/v1/menu-items/{demo_ids['item_one']}/reviews"
    ).json()["total"]
    assert seeded_total > 0
    created = client.post(
        f"/api/v1/menu-items/{demo_ids['item_one']}/reviews",
        json={"rating": 5, "text": "牛腩很软，番茄味也很足", "images": []},
        headers=user_headers,
    )
    assert created.status_code == 201, created.text
    review = created.json()
    assert review["status"] == "pending_manual"
    assert "DeepSeek" in review["moderation_reason"]

    public_before = client.get(
        f"/api/v1/menu-items/{demo_ids['item_one']}/reviews"
    ).json()
    assert public_before["total"] == seeded_total

    admin_pair = admin_login(client)
    admin_headers = bearer(admin_pair["access_token"])
    pending = client.get(
        "/admin/api/v1/reviews",
        params={"status": "pending_manual"},
        headers=admin_headers,
    )
    assert pending.status_code == 200
    assert pending.json()["total"] == 1

    moderated = client.post(
        f"/admin/api/v1/reviews/{review['id']}/moderate",
        json={"action": "publish", "reason": "人工审核通过"},
        headers=admin_headers,
    )
    assert moderated.status_code == 200, moderated.text
    assert moderated.json()["status"] == "published"

    public_after = client.get(
        f"/api/v1/menu-items/{demo_ids['item_one']}/reviews"
    ).json()
    assert public_after["total"] == seeded_total + 1

    guest_headers = bearer(client.post("/api/v1/auth/guest").json()["access_token"])
    event = {"event_id": "review-view-event-0001"}
    assert (
        client.post(
            f"/api/v1/reviews/{review['id']}/view", json=event, headers=guest_headers
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/v1/reviews/{review['id']}/view", json=event, headers=guest_headers
        ).status_code
        == 200
    )
    stats = client.get("/api/v1/me/stats", headers=user_headers).json()
    assert stats["published_reviews"] == 1
    assert stats["total_views"] == 1

    audit = client.get("/admin/api/v1/audit-logs", headers=admin_headers)
    assert audit.status_code == 200
    assert audit.json()[0]["action"] == "review.publish"


def test_admin_crud_and_role_separation(client, demo_ids):
    user_pair = login(client)
    user_headers = bearer(user_pair["access_token"])
    assert client.get("/admin/api/v1/dashboard", headers=user_headers).status_code == 401

    admin_pair = admin_login(client)
    admin_headers = bearer(admin_pair["access_token"])
    username_login = client.post(
        "/admin/api/v1/auth/login",
        json={"username": "admin", "password": "Admin123!", "audience": "admin"},
    )
    assert username_login.status_code == 200
    created = client.post(
        "/admin/api/v1/merchants",
        json={
            "campus_id": demo_ids["campus"],
            "area_id": demo_ids["area_south"],
            "category_id": demo_ids["cat_light"],
            "name": "测试果汁吧",
            "description": "测试商家",
            "address": "南区 99 号",
            "latitude": 31.22,
            "longitude": 121.47,
            "gcj02_latitude": 31.218,
            "gcj02_longitude": 121.474,
            "price_level": 2,
            "business_hours": "08:00-20:00",
            "is_active": True,
        },
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    merchant = created.json()

    item = client.post(
        "/admin/api/v1/menu-items",
        json={
            "merchant_id": merchant["id"],
            "category_id": demo_ids["cat_light"],
            "name": "鲜橙汁",
            "description": "现榨",
            "item_type": "dish",
            "price_cents": 900,
            "image_url": "https://example.invalid/orange.jpg",
            "tags": ["清爽"],
            "is_active": True,
        },
        headers=admin_headers,
    )
    assert item.status_code == 201, item.text
    assert item.json()["merchant_name"] == "测试果汁吧"

    updated = client.patch(
        f"/admin/api/v1/merchants/{merchant['id']}",
        json={"name": "测试果汁站"},
        headers=admin_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "测试果汁站"
    offline = client.patch(
        f"/admin/api/v1/merchants/{merchant['id']}/status",
        json={"status": "offline"},
        headers=admin_headers,
    )
    assert offline.status_code == 200
    assert offline.json()["is_active"] is False

    category = client.post(
        "/admin/api/v1/categories",
        json={"name": "测试品类", "icon": "test", "sort_order": 99},
        headers=admin_headers,
    )
    assert category.status_code == 201, category.text
    category_id = category.json()["id"]
    assert (
        client.patch(
            f"/admin/api/v1/categories/{category_id}",
            json={"name": "测试品类已改"},
            headers=admin_headers,
        ).json()["name"]
        == "测试品类已改"
    )
    assert (
        client.delete(
            f"/admin/api/v1/categories/{category_id}", headers=admin_headers
        ).status_code
        == 200
    )


def test_map_cluster_and_favorite_star(client, demo_ids):
    guest = client.post("/api/v1/auth/guest").json()
    headers = bearer(guest["access_token"])
    client.put(
        f"/api/v1/favorites/merchants/{demo_ids['merchant_one']}", headers=headers
    )
    low_zoom = client.get(
        "/api/v1/map/merchants",
        params={"campus_id": demo_ids["campus"], "zoom": 14},
        headers=headers,
    )
    assert low_zoom.status_code == 200, low_zoom.text
    payload = low_zoom.json()
    assert payload["coordinate_system"] == "GCJ-02"
    assert any(
        feature["properties"]["has_favorite"]
        for feature in payload["features"]
        if feature["properties"]["kind"] == "cluster"
    )

    high_zoom = client.get(
        "/api/v1/map/merchants",
        params={"campus_id": demo_ids["campus"], "zoom": 19},
        headers=headers,
    ).json()
    favorite = next(
        feature
        for feature in high_zoom["features"]
        if feature["properties"]["id"] == demo_ids["merchant_one"]
    )
    assert favorite["properties"]["is_favorite"] is True


def test_admin_csv_validation_and_import(client, demo_ids):
    admin_headers = bearer(admin_login(client)["access_token"])
    csv_content = (
        "campus_id,name,level,sort_order\n"
        f"{demo_ids['campus']},测试导入区域,1,90\n"
    ).encode("utf-8")
    files = {"file": ("areas.csv", csv_content, "text/csv")}
    validated = client.post(
        "/admin/api/v1/imports/validate",
        data={"type": "areas"},
        files=files,
        headers=admin_headers,
    )
    assert validated.status_code == 200, validated.text
    assert validated.json() == {"total": 1, "valid": 1, "invalid": 0, "errors": []}

    imported = client.post(
        "/admin/api/v1/imports",
        data={"type": "areas"},
        files={"file": ("areas.csv", csv_content, "text/csv")},
        headers=admin_headers,
    )
    assert imported.status_code == 201, imported.text
    assert imported.json()["status"] == "completed"
    assert imported.json()["success"] == 1
    jobs = client.get("/admin/api/v1/imports", headers=admin_headers)
    assert jobs.status_code == 200
    assert jobs.json()[0]["file_name"] == "areas.csv"


def test_image_upload_and_owned_review_reference(client, demo_ids):
    headers = bearer(login(client)["access_token"])
    rejected = client.post(
        "/api/v1/uploads/images",
        files={"file": ("broken.png", CORRUPT_PNG, "image/png")},
        headers=headers,
    )
    assert rejected.status_code == 422, rejected.text

    uploaded = client.post(
        "/api/v1/uploads/images",
        files={"file": ("dish.png", ONE_PIXEL_PNG, "image/png")},
        headers=headers,
    )
    assert uploaded.status_code == 201, uploaded.text
    image_url = uploaded.json()["url"]
    assert image_url.startswith("/media/")

    review = client.post(
        f"/api/v1/menu-items/{demo_ids['item_two']}/reviews",
        json={"rating": 4, "text": "图片评价", "images": [image_url]},
        headers=headers,
    )
    assert review.status_code == 201, review.text
    assert review.json()["images"] == [image_url]

    invalid = client.post(
        f"/api/v1/menu-items/{demo_ids['item_three']}/reviews",
        json={"rating": 4, "text": "非法外链", "images": ["https://example.com/a.jpg"]},
        headers=headers,
    )
    assert invalid.status_code == 422
