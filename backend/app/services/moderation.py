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


#: 管理端处置的合法状态迁移。restore 只用于撤销下架，驳回后的评价必须重新走审核。
ADMIN_TRANSITIONS: dict[str, tuple[str, frozenset[str]]] = {
    "publish": (
        ReviewStatus.PUBLISHED,
        frozenset({ReviewStatus.PENDING_MANUAL, ReviewStatus.HIDDEN, ReviewStatus.REJECTED}),
    ),
    "reject": (
        ReviewStatus.REJECTED,
        frozenset({ReviewStatus.PENDING_MANUAL, ReviewStatus.PUBLISHED, ReviewStatus.HIDDEN}),
    ),
    "hide": (
        ReviewStatus.HIDDEN,
        frozenset({ReviewStatus.PUBLISHED, ReviewStatus.PENDING_MANUAL}),
    ),
    "restore": (ReviewStatus.PUBLISHED, frozenset({ReviewStatus.HIDDEN})),
}

#: 被管理员处置过的评价，作者编辑后不得自动重新发布，必须回到人工队列。
AUTHOR_LOCKED_STATUSES = frozenset({ReviewStatus.HIDDEN, ReviewStatus.REJECTED})


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
