"""Bind recommendation snapshots to the request filters that produced them.

Revision ID: 20260727_0005
Revises: 20260727_0004
Create Date: 2026-07-27

游标只校验校园与归属是不够的：翻页途中改了品类/区域/搜索/价格却仍带旧游标时，
旧快照里的条目根本不满足新筛选条件。这里补一列只覆盖显式筛选的指纹用于校验。
"""

from alembic import op
import sqlalchemy as sa


revision = "20260727_0005"
down_revision = "20260727_0004"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "recommendation_snapshots" not in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    if "query_fingerprint" in _columns("recommendation_snapshots"):
        return
    with op.batch_alter_table("recommendation_snapshots") as batch_op:
        batch_op.add_column(
            sa.Column(
                "query_fingerprint",
                sa.String(length=64),
                nullable=False,
                server_default="",
            )
        )
    # 存量快照的指纹未知，直接作废：它们最多只活一个 TTL，重建成本可以忽略。
    op.execute(sa.text("DELETE FROM recommendation_snapshots"))


def downgrade() -> None:
    if "recommendation_snapshots" not in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    if "query_fingerprint" not in _columns("recommendation_snapshots"):
        return
    with op.batch_alter_table("recommendation_snapshots") as batch_op:
        batch_op.drop_column("query_fingerprint")
