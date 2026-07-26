"""Durable job queue for the recommendation background work.

用表当队列而不是进程内 deque，换来三件事：重启不丢作业、积压量可被外部观测、
去重由唯一约束保证而不是内存里的一个集合。

领取用乐观声明（UPDATE ... WHERE state='pending' 再看 rowcount），因此不依赖
SELECT FOR UPDATE SKIP LOCKED，SQLite 与 PostgreSQL 上语义一致。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import RecommendationJob

logger = logging.getLogger(__name__)

STATE_PENDING = "pending"
STATE_RUNNING = "running"

#: 被领取后超过这个时间仍未完成，视为 worker 已死，放回待办。
STALE_CLAIM_SECONDS = 300
MAX_ATTEMPTS = 3


@dataclass(frozen=True)
class Job:
    id: str
    kind: str
    dedupe_key: str
    payload: dict[str, Any]
    attempts: int


def enqueue(db: Session, *, kind: str, dedupe_key: str, payload: dict[str, Any]) -> bool:
    """Insert a job unless an identical one is already outstanding."""
    db.add(
        RecommendationJob(
            kind=kind, dedupe_key=dedupe_key, payload=payload, state=STATE_PENDING
        )
    )
    try:
        db.commit()
    except IntegrityError:
        # 同一份作业已在队列里，唯一约束挡下即可，不必再排一次。
        db.rollback()
        return False
    return True


def release_stale(db: Session, *, now: datetime | None = None) -> int:
    """Return jobs whose worker died back to the pending pool."""
    now = now or datetime.now(UTC)
    cutoff = now - timedelta(seconds=STALE_CLAIM_SECONDS)
    released = db.execute(
        update(RecommendationJob)
        .where(
            RecommendationJob.state == STATE_RUNNING,
            RecommendationJob.claimed_at < cutoff,
        )
        .values(state=STATE_PENDING, claimed_at=None)
    ).rowcount or 0
    db.commit()
    if released:
        logger.warning("Released %s recommendation jobs from a dead worker", released)
    return released


def claim(db: Session, *, now: datetime | None = None) -> Job | None:
    """Atomically take the oldest pending job, or return None."""
    now = now or datetime.now(UTC)
    for _ in range(5):
        row = db.scalars(
            select(RecommendationJob)
            .where(RecommendationJob.state == STATE_PENDING)
            .order_by(RecommendationJob.created_at, RecommendationJob.id)
            .limit(1)
        ).first()
        if row is None:
            return None
        # 先把字段读出来：下面的批量 UPDATE 会让这个 ORM 对象的属性过期，之后再读 attempts
        # 拿到的已经是自增后的值，接着再加一就会让重试次数虚高一倍。
        snapshot = Job(
            id=row.id,
            kind=row.kind,
            dedupe_key=row.dedupe_key,
            payload=dict(row.payload or {}),
            attempts=row.attempts + 1,
        )
        # 乐观声明：只有把 pending 改成 running 的那个调用者真正拿到作业。
        claimed = db.execute(
            update(RecommendationJob)
            .where(
                RecommendationJob.id == snapshot.id,
                RecommendationJob.state == STATE_PENDING,
            )
            .values(state=STATE_RUNNING, claimed_at=now, attempts=snapshot.attempts)
        ).rowcount
        db.commit()
        if claimed:
            return snapshot
    return None


def finish(db: Session, job: Job) -> None:
    db.execute(delete(RecommendationJob).where(RecommendationJob.id == job.id))
    db.commit()


def fail(db: Session, job: Job) -> None:
    """Retry a failed job until it exhausts its attempts, then drop it."""
    if job.attempts >= MAX_ATTEMPTS:
        logger.warning(
            "Dropping recommendation job %s after %s attempts", job.kind, job.attempts
        )
        finish(db, job)
        return
    db.execute(
        update(RecommendationJob)
        .where(RecommendationJob.id == job.id)
        .values(state=STATE_PENDING, claimed_at=None)
    )
    db.commit()


def backlog(db: Session) -> dict[str, int]:
    rows = db.execute(
        select(RecommendationJob.state, func.count(RecommendationJob.id)).group_by(
            RecommendationJob.state
        )
    ).all()
    counts = {str(state): int(total) for state, total in rows}
    return {
        "pending": counts.get(STATE_PENDING, 0),
        "running": counts.get(STATE_RUNNING, 0),
    }
