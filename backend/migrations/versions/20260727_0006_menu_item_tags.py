"""Normalise menu item tags into an indexable table.

Revision ID: 20260727_0006
Revises: 20260727_0005
Create Date: 2026-07-27

MenuItem.tags 这个 JSON 列继续作为读模型，但它无法建索引：cast(tags, String).like('%麻辣%')
永远全表扫，而且子串匹配还不精确。这张表提供精确且可索引的谓词，回填自现有 JSON 数据。
"""

import json

from alembic import op
import sqlalchemy as sa


revision = "20260727_0006"
down_revision = "20260727_0005"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _backfill() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, campus_id, tags FROM menu_items")
    ).mappings().all()

    payload = []
    for row in rows:
        raw = row["tags"]
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except (TypeError, ValueError):
                raw = []
        if not isinstance(raw, list):
            continue
        for tag in sorted({str(value).strip() for value in raw if str(value).strip()}):
            payload.append(
                {"menu_item_id": row["id"], "tag": tag, "campus_id": row["campus_id"]}
            )

    if payload:
        bind.execute(
            sa.text(
                "INSERT INTO menu_item_tags (menu_item_id, tag, campus_id) "
                "VALUES (:menu_item_id, :tag, :campus_id)"
            ),
            payload,
        )


def upgrade() -> None:
    if "menu_item_tags" in _tables():
        return
    op.create_table(
        "menu_item_tags",
        sa.Column("menu_item_id", sa.String(length=36), nullable=False),
        sa.Column("tag", sa.String(length=60), nullable=False),
        sa.Column("campus_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["menu_item_id"], ["menu_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["campus_id"], ["campuses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("menu_item_id", "tag"),
    )
    op.create_index(
        "ix_menu_item_tag_lookup", "menu_item_tags", ["campus_id", "tag"], unique=False
    )
    if "menu_items" in _tables():
        _backfill()


def downgrade() -> None:
    if "menu_item_tags" in _tables():
        op.drop_table("menu_item_tags")
