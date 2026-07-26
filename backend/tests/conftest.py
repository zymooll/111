from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.database import Database, sqlite_memory_database
from app.main import create_app

#: 设置该变量即让整套用例跑在真实 PostgreSQL 上，用于暴露 SQLite 掩盖的方言差异。
TEST_DATABASE_URL_ENV = "CI_DATABASE_URL"


def build_settings(tmp_path, **overrides) -> Settings:
    defaults = {
        "environment": "test",
        "database_url": os.environ.get(TEST_DATABASE_URL_ENV, "sqlite://"),
        "secret_key": "test-secret-key-with-enough-randomness",
        "auto_seed": True,
        "expose_debug_tokens": True,
        # 业务用例会在同一秒内反复登录，配额单独在限流用例里打开。
        "rate_limit_enabled": False,
        "upload_dir": tmp_path / "uploads",
        "cors_origins": ["http://testserver"],
        "deepseek_api_key": None,
    }
    defaults.update(overrides)
    return Settings(**defaults)


def build_database() -> Database:
    url = os.environ.get(TEST_DATABASE_URL_ENV)
    if not url:
        return sqlite_memory_database()
    database = Database(url)
    database.drop_all()
    return database


def build_client(tmp_path, **overrides) -> TestClient:
    app = create_app(settings=build_settings(tmp_path, **overrides), database=build_database())
    return TestClient(app)


@pytest.fixture
def client(tmp_path):
    with build_client(tmp_path) as test_client:
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
