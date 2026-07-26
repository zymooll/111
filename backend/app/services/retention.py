"""Retention sweeps for the append-only bookkeeping tables.

幂等记录、刷新会话和账号动作令牌都只增不删，长期运行会无限增长。这里按保留期定期清理，
只删除已经失去作用的行，不触碰任何业务数据。
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, or_

from app.models import (
    AccountActionToken,
    IdempotencyRecord,
    RecommendationSnapshot,
    RefreshSession,
)

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_SECONDS = 3600
REVOKED_GRACE_DAYS = 7


def purge_expired(
    session_factory,
    *,
    idempotency_retention_hours: int,
    snapshot_grace_seconds: int = 1800,
) -> dict[str, int]:
    """Delete records that can no longer affect any request. Returns per-table counts."""
    now = datetime.now(UTC)
    removed: dict[str, int] = {}
    with session_factory() as db:
        # 快照过期后再留一段宽限期，让仍在翻页的游标能读到同一份排序。
        removed["recommendation_snapshots"] = db.execute(
            delete(RecommendationSnapshot).where(
                RecommendationSnapshot.expires_at
                < now - timedelta(seconds=snapshot_grace_seconds)
            )
        ).rowcount or 0
        removed["idempotency_records"] = db.execute(
            delete(IdempotencyRecord).where(
                IdempotencyRecord.created_at
                < now - timedelta(hours=idempotency_retention_hours)
            )
        ).rowcount or 0
        # 已撤销的会话保留一段时间，令牌复用检测仍需要看到它们。
        removed["refresh_sessions"] = db.execute(
            delete(RefreshSession).where(
                or_(
                    RefreshSession.expires_at < now,
                    RefreshSession.revoked_at < now - timedelta(days=REVOKED_GRACE_DAYS),
                )
            )
        ).rowcount or 0
        removed["account_action_tokens"] = db.execute(
            delete(AccountActionToken).where(
                or_(
                    AccountActionToken.expires_at < now,
                    AccountActionToken.used_at.is_not(None),
                )
            )
        ).rowcount or 0
        db.commit()
    return removed


async def retention_loop(
    session_factory,
    *,
    idempotency_retention_hours: int,
    snapshot_grace_seconds: int = 1800,
) -> None:
    while True:
        try:
            removed = await asyncio.to_thread(
                purge_expired,
                session_factory,
                idempotency_retention_hours=idempotency_retention_hours,
                snapshot_grace_seconds=snapshot_grace_seconds,
            )
            if any(removed.values()):
                logger.info("Retention sweep removed %s", removed)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("Retention sweep failed; will retry next interval", exc_info=True)
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
