from __future__ import annotations

import json
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError

from app.config import Settings
from app.services.moderation import ModerationResult


class RankedItem(BaseModel):
    item_id: str
    rank: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=100)


class RankedPayload(BaseModel):
    items: list[RankedItem]


class ModerationPayload(BaseModel):
    safe: bool
    uncertain: bool = False
    reason: str = Field(default="", max_length=300)


class DeepSeekClient:
    """Small, optional DeepSeek adapter; every public method fails closed to a fallback."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return bool(self.settings.deepseek_api_key)

    async def rerank(
        self,
        candidates: list[dict[str, Any]],
        preferences: dict[str, Any],
    ) -> dict[str, str] | None:
        if not self.enabled or not candidates:
            return None
        candidate_ids = {str(item["id"]) for item in candidates}
        prompt = {
            "task": "只对候选校园菜品排序并生成简短中文推荐理由，不得创造新 ID",
            "preferences": preferences,
            "candidates": candidates,
            "output_schema": {"items": [{"item_id": "string", "rank": 1, "reason": "string"}]},
        }
        raw = await self._chat(json.dumps(prompt, ensure_ascii=False))
        if raw is None:
            return None
        try:
            parsed = RankedPayload.model_validate_json(_strip_code_fence(raw))
        except ValidationError:
            return None
        ids = [item.item_id for item in parsed.items]
        if len(ids) != len(set(ids)) or not set(ids).issubset(candidate_ids):
            return None
        return {item.item_id: item.reason for item in sorted(parsed.items, key=lambda value: value.rank)}

    async def moderate(self, text: str) -> ModerationResult | None:
        if not self.enabled or not text.strip():
            return None
        prompt = {
            "task": "判断校园餐饮评价文本是否安全。仅输出 JSON。",
            "text": text,
            "output_schema": {"safe": True, "uncertain": False, "reason": ""},
        }
        raw = await self._chat(json.dumps(prompt, ensure_ascii=False))
        if raw is None:
            return None
        try:
            payload = ModerationPayload.model_validate_json(_strip_code_fence(raw))
        except ValidationError:
            return None
        from app.models import ReviewStatus

        if payload.safe and not payload.uncertain:
            return ModerationResult(ReviewStatus.PUBLISHED)
        return ModerationResult(
            ReviewStatus.PENDING_MANUAL,
            payload.reason or "模型判断需要人工审核",
        )

    async def _chat(self, content: str) -> str | None:
        headers = {
            "Authorization": f"Bearer {self.settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.settings.deepseek_model,
            "messages": [
                {"role": "system", "content": "你是校园餐饮推荐系统中的结构化 JSON 助手。"},
                {"role": "user", "content": content},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }
        try:
            async with httpx.AsyncClient(
                timeout=self.settings.deepseek_timeout_seconds
            ) as client:
                response = await client.post(
                    f"{self.settings.deepseek_base_url.rstrip('/')}/chat/completions",
                    headers=headers,
                    json=body,
                )
                response.raise_for_status()
                return str(response.json()["choices"][0]["message"]["content"])
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            return None


def _strip_code_fence(value: str) -> str:
    value = value.strip()
    if value.startswith("```"):
        value = value.removeprefix("```json").removeprefix("```")
        value = value.removesuffix("```")
    return value.strip()
