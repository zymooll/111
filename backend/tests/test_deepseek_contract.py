from __future__ import annotations

import asyncio

import pytest

from app.config import Settings
from app.services.deepseek import DeepSeekClient


CANDIDATES = [
    {"id": "dish-1", "name": "番茄牛腩饭"},
    {"id": "dish-2", "name": "菌菇鸡汤面"},
]


def client() -> DeepSeekClient:
    return DeepSeekClient(Settings(deepseek_api_key="test-key", auto_seed=False))


def test_deepseek_accepts_only_candidate_ids_and_preserves_rank_order(monkeypatch):
    adapter = client()

    async def response(_content: str) -> str:
        return (
            '{"items":['
            '{"item_id":"dish-2","rank":1,"reason":"偏好清淡汤面"},'
            '{"item_id":"dish-1","rank":2,"reason":"高分套餐"}'
            "]}"
        )

    monkeypatch.setattr(adapter, "_chat", response)
    result = asyncio.run(adapter.rerank(CANDIDATES, {"tastes": ["清淡"]}))

    assert list(result or {}) == ["dish-2", "dish-1"]


@pytest.mark.parametrize(
    "raw",
    [
        "not-json",
        '{"items":[{"item_id":"invented","rank":1,"reason":"虚构候选"}]}',
        (
            '{"items":['
            '{"item_id":"dish-1","rank":1,"reason":"第一"},'
            '{"item_id":"dish-1","rank":2,"reason":"重复"}'
            "]}"
        ),
    ],
)
def test_deepseek_bad_output_returns_deterministic_fallback_signal(monkeypatch, raw):
    adapter = client()

    async def response(_content: str) -> str:
        return raw

    monkeypatch.setattr(adapter, "_chat", response)

    assert asyncio.run(adapter.rerank(CANDIDATES, {})) is None


def test_deepseek_disabled_skips_network(monkeypatch):
    adapter = DeepSeekClient(Settings(deepseek_api_key=None, auto_seed=False))

    async def unexpected(_content: str) -> str:
        raise AssertionError("disabled adapter must not call DeepSeek")

    monkeypatch.setattr(adapter, "_chat", unexpected)

    assert asyncio.run(adapter.rerank(CANDIDATES, {})) is None
