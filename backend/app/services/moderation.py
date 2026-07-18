from __future__ import annotations

from dataclasses import dataclass

from app.models import ReviewStatus


RISKY_TERMS = {
    "联系方式",
    "加微信",
    "诈骗",
    "辱骂",
    "色情",
    "赌博",
}


@dataclass(frozen=True)
class ModerationResult:
    status: str
    reason: str | None = None


def local_moderate(text: str) -> ModerationResult:
    normalized = text.lower().strip()
    if any(term in normalized for term in RISKY_TERMS):
        return ModerationResult(
            ReviewStatus.PENDING_MANUAL,
            "本地规则检测到可能需要人工确认的内容",
        )
    return ModerationResult(ReviewStatus.PUBLISHED)
