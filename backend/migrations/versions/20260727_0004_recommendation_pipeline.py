"""Materialised actor affinity and recommendation snapshots.

Revision ID: 20260727_0004
Revises: 20260727_0003
Create Date: 2026-07-27
"""

from alembic import op
import sqlalchemy as sa


revision = "20260727_0004"
down_revision = "20260727_0003"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()

    if "actor_affinities" not in tables:
        op.create_table(
            "actor_affinities",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("campus_id", sa.String(length=36), nullable=False),
            sa.Column("actor_type", sa.String(length=20), nullable=False),
            sa.Column("actor_id", sa.String(length=36), nullable=False),
            sa.Column("tag_scores", sa.JSON(), nullable=False),
            sa.Column("area_scores", sa.JSON(), nullable=False),
            sa.Column("signal_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("search_signals", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("decayed_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["campus_id"], ["campuses.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "campus_id", "actor_type", "actor_id", name="uq_affinity_campus_actor"
            ),
        )
        op.create_index(
            "ix_actor_affinities_campus_id", "actor_affinities", ["campus_id"], unique=False
        )

    if "recommendation_snapshots" not in tables:
        op.create_table(
            "recommendation_snapshots",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("campus_id", sa.String(length=36), nullable=False),
            sa.Column("actor_type", sa.String(length=20), nullable=False),
            sa.Column("actor_id", sa.String(length=36), nullable=False),
            sa.Column("filter_fingerprint", sa.String(length=64), nullable=False),
            sa.Column("ranked_item_ids", sa.JSON(), nullable=False),
            sa.Column("reasons", sa.JSON(), nullable=False),
            sa.Column("source", sa.String(length=20), nullable=False, server_default="deterministic"),
            sa.Column("profile_revision", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("built_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["campus_id"], ["campuses.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_recommendation_snapshots_campus_id",
            "recommendation_snapshots",
            ["campus_id"],
            unique=False,
        )
        op.create_index(
            "ix_snapshot_lookup",
            "recommendation_snapshots",
            ["campus_id", "actor_type", "actor_id", "filter_fingerprint", "built_at"],
            unique=False,
        )
        op.create_index(
            "ix_snapshot_expires_at", "recommendation_snapshots", ["expires_at"], unique=False
        )


def downgrade() -> None:
    tables = _tables()
    if "recommendation_snapshots" in tables:
        op.drop_table("recommendation_snapshots")
    if "actor_affinities" in tables:
        op.drop_table("actor_affinities")
