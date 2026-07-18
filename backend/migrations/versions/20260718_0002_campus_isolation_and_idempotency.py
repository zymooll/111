"""Add campus isolation and persistent idempotency records.

Revision ID: 20260718_0002
Revises: 20260718_0001
Create Date: 2026-07-18
"""

from alembic import op
import sqlalchemy as sa


revision = "20260718_0002"
down_revision = "20260718_0001"
branch_labels = None
depends_on = None


BUSINESS_TABLES = {
    "categories": "SELECT id FROM campuses ORDER BY created_at LIMIT 1",
    "tags": "SELECT id FROM campuses ORDER BY created_at LIMIT 1",
    "menu_items": "SELECT campus_id FROM merchants WHERE merchants.id = menu_items.merchant_id",
    "favorites": "SELECT campus_id FROM merchants WHERE merchants.id = favorites.merchant_id",
    "reviews": "SELECT campus_id FROM menu_items WHERE menu_items.id = reviews.menu_item_id",
    "review_views": "SELECT campus_id FROM reviews WHERE reviews.id = review_views.review_id",
    "interaction_events": (
        "COALESCE("
        "(SELECT campus_id FROM menu_items WHERE menu_items.id = interaction_events.menu_item_id),"
        "(SELECT campus_id FROM merchants WHERE merchants.id = interaction_events.merchant_id),"
        "(SELECT id FROM campuses ORDER BY created_at LIMIT 1)"
        ")"
    ),
    "admin_audit_logs": "SELECT id FROM campuses ORDER BY created_at LIMIT 1",
    "import_jobs": "SELECT id FROM campuses ORDER BY created_at LIMIT 1",
}


def _columns(table: str) -> set[str]:
    return {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns(table)
    }


def _foreign_key_names(table: str) -> set[str]:
    return {
        str(value["name"])
        for value in sa.inspect(op.get_bind()).get_foreign_keys(table)
        if value.get("name")
    }


def _ensure_campus_column(table: str, expression: str) -> None:
    if "campus_id" in _columns(table):
        return
    op.add_column(table, sa.Column("campus_id", sa.String(length=36), nullable=True))
    op.execute(sa.text(f"UPDATE {table} SET campus_id = ({expression}) WHERE campus_id IS NULL"))
    constraint_name = f"fk_{table}_campus_id"
    with op.batch_alter_table(table) as batch_op:
        batch_op.alter_column("campus_id", existing_type=sa.String(length=36), nullable=False)
        if constraint_name not in _foreign_key_names(table):
            batch_op.create_foreign_key(
                constraint_name,
                "campuses",
                ["campus_id"],
                ["id"],
                ondelete="CASCADE",
            )
        batch_op.create_index(f"ix_{table}_campus_id", ["campus_id"], unique=False)


def upgrade() -> None:
    for table, expression in BUSINESS_TABLES.items():
        _ensure_campus_column(table, expression)

    inspector = sa.inspect(op.get_bind())
    if "idempotency_records" not in inspector.get_table_names():
        op.create_table(
            "idempotency_records",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("scope", sa.String(length=160), nullable=False),
            sa.Column("idempotency_key", sa.String(length=120), nullable=False),
            sa.Column("request_hash", sa.String(length=64), nullable=False),
            sa.Column("response_status", sa.Integer(), nullable=False),
            sa.Column("response_body", sa.Text(), nullable=False),
            sa.Column("content_type", sa.String(length=120), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "scope", "idempotency_key", name="uq_idempotency_scope_key"
            ),
        )
        op.create_index(
            "ix_idempotency_created_at",
            "idempotency_records",
            ["created_at"],
            unique=False,
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "idempotency_records" in inspector.get_table_names():
        op.drop_table("idempotency_records")
    for table in reversed(list(BUSINESS_TABLES)):
        if "campus_id" not in _columns(table):
            continue
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column("campus_id")
