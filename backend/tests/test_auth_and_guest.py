from __future__ import annotations

from tests.conftest import bearer


def test_guest_preferences_favorite_and_login_merge(client, demo_ids):
    guest = client.post("/api/v1/auth/guest")
    assert guest.status_code == 201
    guest_token = guest.json()["access_token"]
    headers = bearer(guest_token)

    preferences = {
        "tastes": ["清淡", "高蛋白"],
        "avoid": ["花生"],
        "budget_max_cents": 2500,
        "frequent_area_ids": [demo_ids["area_north"]],
    }
    assert client.put("/api/v1/me/preferences", json=preferences, headers=headers).status_code == 200
    assert (
        client.put(
            f"/api/v1/favorites/merchants/{demo_ids['merchant_one']}", headers=headers
        ).status_code
        == 200
    )

    login_response = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": "demo",
            "password": "Demo123!",
            "guest_token": guest_token,
        },
    )
    assert login_response.status_code == 200, login_response.text
    user_headers = bearer(login_response.json()["access_token"])
    favorites = client.get("/api/v1/me/favorites", headers=user_headers).json()
    assert [item["merchant"]["id"] for item in favorites] == [demo_ids["merchant_one"]]
    assert client.get("/api/v1/me/preferences", headers=user_headers).json()["tastes"] == [
        "清淡",
        "高蛋白",
    ]

    stale_guest = client.get("/api/v1/me/preferences", headers=headers)
    assert stale_guest.status_code == 401


def test_register_refresh_rotation_and_logout(client):
    registered = client.post(
        "/api/v1/auth/register",
        json={
            "username": "new_student",
            "email": "student@example.com",
            "password": "StrongPass123!",
        },
    )
    assert registered.status_code == 201, registered.text
    pair = registered.json()
    assert client.get("/api/v1/auth/me", headers=bearer(pair["access_token"])).status_code == 200

    refreshed = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]}
    )
    assert refreshed.status_code == 200
    rotated = refreshed.json()
    assert rotated["refresh_token"] != pair["refresh_token"]
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/logout", json={"refresh_token": rotated["refresh_token"]}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": rotated["refresh_token"]}
        ).status_code
        == 401
    )


def test_guest_cannot_review(client, demo_ids):
    guest_token = client.post("/api/v1/auth/guest").json()["access_token"]
    response = client.post(
        f"/api/v1/menu-items/{demo_ids['item_one']}/reviews",
        json={"rating": 5, "text": "很好吃", "images": []},
        headers=bearer(guest_token),
    )
    assert response.status_code == 401


def test_email_verification_and_password_reset(client, demo_ids):
    registered = client.post(
        "/api/v1/auth/register",
        json={
            "username": "verified_student",
            "email": "verified@example.com",
            "password": "StrongPass123!",
        },
    )
    assert registered.status_code == 201, registered.text
    pair = registered.json()
    headers = bearer(pair["access_token"])

    blocked = client.post(
        f"/api/v1/menu-items/{demo_ids['item_one']}/reviews",
        json={"rating": 5, "text": "邮箱还没验证", "images": []},
        headers=headers,
    )
    assert blocked.status_code == 403

    issued = client.post("/api/v1/auth/email-verification/request", headers=headers)
    assert issued.status_code == 200
    verification_token = issued.json()["debug_token"]
    assert verification_token
    verified = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": verification_token},
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["email_verified"] is True
    assert (
        client.post(
            "/api/v1/auth/email-verification/confirm",
            json={"token": verification_token},
        ).status_code
        == 400
    )
    already_verified = client.post(
        "/api/v1/auth/email-verification/request", headers=headers
    )
    assert already_verified.status_code == 200
    assert already_verified.json()["debug_token"] is None

    unknown = client.post(
        "/api/v1/auth/password/forgot",
        json={"email": "unknown@example.com"},
    )
    assert unknown.status_code == 200
    assert unknown.json()["debug_token"] is None

    forgot = client.post(
        "/api/v1/auth/password/forgot",
        json={"email": "verified@example.com"},
    )
    assert forgot.status_code == 200
    assert forgot.json()["message"] == unknown.json()["message"]
    reset_token = forgot.json()["debug_token"]
    assert reset_token
    reset = client.post(
        "/api/v1/auth/password/reset",
        json={"token": reset_token, "new_password": "NewStrongPass456!"},
    )
    assert reset.status_code == 200, reset.text
    assert (
        client.post(
            "/api/v1/auth/password/reset",
            json={"token": reset_token, "new_password": "AnotherStrongPass789!"},
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]}
        ).status_code
        == 401
    )

    assert (
        client.post(
            "/api/v1/auth/login",
            json={"identifier": "verified_student", "password": "StrongPass123!"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"identifier": "verified_student", "password": "NewStrongPass456!"},
        ).status_code
        == 200
    )
