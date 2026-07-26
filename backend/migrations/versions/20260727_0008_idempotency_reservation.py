"""Reserve idempotency keys before executing the request.

Revision ID: 20260727_0008
Revises: 20260727_0007
Create Date: 2026-07-27

原先是"先查再执行再写"：两个并发的同键请求会同时查不到、同时进入处理函数，副作用做了
两遍——幂等键恰恰在它最该起作用的重试场景下失效。改成先插占位行（由唯一约束裁决谁执行），
因此需要一个 state 列，且响应字段在占位阶段还是空的。
"""

from alembic import op
import sqlalchemy as sa


revision = "20260727_0008"
down_revision = "20260727_0007"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "idempotency_records" not in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    if "state" in _columns("idempotency_records"):
        return
    with op.batch_alter_table("idempotency_records") as batch_op:
        batch_op.add_column(
            sa.Column(
                "state", sa.String(length=20), nullable=False, server_default="completed"
            )
        )
        # 占位阶段这些字段还没有值，必须放开非空约束。
        batch_op.alter_column("response_status", existing_type=sa.Integer(), nullable=True)
        batch_op.alter_column("response_body", existing_type=sa.Text(), nullable=True)
    # 存量记录都是已完成的响应，显式标注一次。
    op.execute(sa.text("UPDATE idempotency_records SET state = 'completed'"))


def downgrade() -> None:
    if "idempotency_records" not in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    if "state" not in _columns("idempotency_records"):
        return
    # 未完成的占位行没有响应体，回滚前必须清掉，否则非空约束加不回去。
    op.execute(sa.text("DELETE FROM idempotency_records WHERE state <> 'completed'"))
    with op.batch_alter_table("idempotency_records") as batch_op:
        batch_op.alter_column("response_status", existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column("response_body", existing_type=sa.Text(), nullable=False)
        batch_op.drop_column("state")
