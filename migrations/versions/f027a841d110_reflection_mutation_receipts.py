"""Add reflection revisions and transactional mutation receipts."""
from alembic import op
import sqlalchemy as sa

revision = "f027a841d110"
down_revision = "ee06718de8cd"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("cook_reflections") as batch:
        batch.add_column(sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    op.create_table("reflection_mutations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("mutation_id", sa.String(36), nullable=False),
        sa.Column("cook_log_id", sa.Integer(), sa.ForeignKey("cook_logs.id"), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "mutation_id", name="uq_reflection_mutation"))


def downgrade():
    op.drop_table("reflection_mutations")
    with op.batch_alter_table("cook_reflections") as batch:
        batch.drop_column("revision")
