"""Persist the recommendation background queue.

Revision ID: 20260727_0007
Revises: 20260727_0006
Create Date: 2026-07-27

进程内 deque 在重启或 worker 死亡时会静默丢作业，积压量也只存在于内存里。
落到表上之后：唯一约束天然去重，未完成的作业跨重启存活，积压一条 COUNT(*) 即可观测。
"""

from alembic import op
import sqlalchemy as sa


revision = "20260727_0007"
down_revision = "20260727_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "recommendation_jobs" in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "recommendation_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("dedupe_key", sa.String(length=200), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("state", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedupe_key", name="uq_recommendation_job_dedupe"),
    )
    op.create_index(
        "ix_recommendation_job_claim",
        "recommendation_jobs",
        ["state", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    if "recommendation_jobs" in set(sa.inspect(op.get_bind()).get_table_names()):
        op.drop_table("recommendation_jobs")
