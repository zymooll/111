"""Scope admin accounts to a campus, index the interaction hot path, and repair JSON encoding.

Revision ID: 20260727_0003
Revises: 20260718_0002
Create Date: 2026-07-27
"""

import json

from alembic import op
import sqlalchemy as sa


revision = "20260727_0003"
down_revision = "20260718_0002"
branch_labels = None
depends_on = None


#: 历史数据以 ensure_ascii=True 落库，需回写为原文，否则中文标签的 LIKE 匹配永远落空。
JSON_COLUMNS = {
    "menu_items": ["tags"],
    "reviews": ["images"],
    "user_profiles": ["preferences"],
    "guest_sessions": ["preferences"],
    "auth_identities": ["profile"],
    "interaction_events": ["metadata_json"],
    "admin_audit_logs": ["detail"],
    "import_jobs": ["errors"],
}


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _index_names(table: str) -> set[str]:
    return {str(index["name"]) for index in sa.inspect(op.get_bind()).get_indexes(table)}


def _rewrite_json_columns() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    for table, columns in JSON_COLUMNS.items():
        if table not in tables:
            continue
        present = [column for column in columns if column in _columns(table)]
        if not present:
            continue
        key_column = "id"
        selected = ", ".join([key_column, *present])
        rows = bind.execute(sa.text(f"SELECT {selected} FROM {table}")).mappings().all()
        for row in rows:
            updates = {}
            for column in present:
                raw = row[column]
                if not isinstance(raw, str) or "\\u" not in raw:
                    continue
                try:
                    decoded = json.loads(raw)
                except (TypeError, ValueError):
                    continue
                updates[column] = json.dumps(decoded, ensure_ascii=False)
            if not updates:
                continue
            assignments = ", ".join(f"{column} = :{column}" for column in updates)
            bind.execute(
                sa.text(f"UPDATE {table} SET {assignments} WHERE {key_column} = :key"),
                {**updates, "key": row[key_column]},
            )


def upgrade() -> None:
    if "managed_campus_id" not in _columns("users"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(
                sa.Column("managed_campus_id", sa.String(length=36), nullable=True)
            )
            batch_op.create_foreign_key(
                "fk_users_managed_campus_id",
                "campuses",
                ["managed_campus_id"],
                ["id"],
                ondelete="SET NULL",
            )
            batch_op.create_index(
                "ix_users_managed_campus_id", ["managed_campus_id"], unique=False
            )

    if "ix_interaction_actor_recent" not in _index_names("interaction_events"):
        op.create_index(
            "ix_interaction_actor_recent",
            "interaction_events",
            ["actor_type", "actor_id", "campus_id", "occurred_at"],
            unique=False,
        )

    _rewrite_json_columns()


def downgrade() -> None:
    if "ix_interaction_actor_recent" in _index_names("interaction_events"):
        op.drop_index("ix_interaction_actor_recent", table_name="interaction_events")
    if "managed_campus_id" in _columns("users"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_index("ix_users_managed_campus_id")
            batch_op.drop_column("managed_campus_id")
