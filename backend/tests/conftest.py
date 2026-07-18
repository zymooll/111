from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.database import sqlite_memory_database
from app.main import create_app


@pytest.fixture
def client(tmp_path):
    settings = Settings(
        environment="test",
        database_url="sqlite://",
        secret_key="test-secret-key-with-enough-randomness",
        auto_seed=True,
        upload_dir=tmp_path / "uploads",
        cors_origins=["http://testserver"],
        deepseek_api_key=None,
    )
    database = sqlite_memory_database()
    app = create_app(settings=settings, database=database)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def demo_ids():
    from app.seed import DEMO_IDS

    return DEMO_IDS


def login(client: TestClient, identifier: str = "demo", password: str = "Demo123!") -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()


def admin_login(client: TestClient) -> dict:
    response = client.post(
        "/admin/api/v1/auth/login",
        json={"identifier": "admin", "password": "Admin123!"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
