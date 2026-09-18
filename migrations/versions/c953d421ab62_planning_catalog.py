"""Server-authored, retained planning catalog revisions. No seed content."""
from alembic import op
import sqlalchemy as sa

revision = "c953d421ab62"
down_revision = "b842c310fa51"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "planning_catalog_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entry_id", sa.String(80), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("availability", sa.String(12), nullable=False, server_default="draft"),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("content_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("entry_id", "revision", name="uq_planning_catalog_entry_revision"),
        sa.CheckConstraint("revision BETWEEN 1 AND 2147483647", name="ck_planning_catalog_revision"),
        sa.CheckConstraint("length(entry_id) BETWEEN 1 AND 80", name="ck_planning_catalog_entry_id"),
        sa.CheckConstraint("kind IN ('recipe','planning_example')", name="ck_planning_catalog_kind"),
        sa.CheckConstraint("availability IN ('draft','published','revoked')", name="ck_planning_catalog_availability"),
        sa.CheckConstraint("length(content_digest) = 64", name="ck_planning_catalog_digest"),
    )


def downgrade():
    if op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM planning_catalog_entries)")).scalar():
        raise RuntimeError("Retained catalog revisions exist; destructive downgrade refused")
    op.drop_table("planning_catalog_entries")
