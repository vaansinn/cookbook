"""Private planning workspaces, plans, meals and successful mutation receipts."""
from alembic import op
import sqlalchemy as sa

revision = "a631b209ef40"
down_revision = "f027a841d110"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("planning_workspaces",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("revision >= 0", name="ck_planning_revision"))
    op.create_table("private_plans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("id", "workspace_id", name="uq_private_plan_workspace"),
        sa.CheckConstraint("end_date >= start_date", name="ck_private_plan_dates"))
    op.create_index("ix_private_plans_workspace_id", "private_plans", ["workspace_id"])
    op.create_table("private_meals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", sa.String(36), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(160)),
        sa.Column("time", sa.String(5)),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["plan_id", "workspace_id"], ["private_plans.id", "private_plans.workspace_id"],
                                ondelete="CASCADE", name="fk_private_meal_plan_workspace"),
        sa.UniqueConstraint("plan_id", "date", "position", name="uq_private_meal_position"),
        sa.CheckConstraint("position >= 0", name="ck_private_meal_position"))
    op.create_index("ix_private_meals_workspace_id", "private_meals", ["workspace_id"])
    op.create_table("planning_mutations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mutation_id", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("workspace_id", "mutation_id", name="uq_planning_mutation"))
    op.create_index("ix_planning_mutations_workspace_id", "planning_mutations", ["workspace_id"])


def downgrade():
    # A rollback must not silently erase newly saved private data. Use a forward
    # fix or a separately reviewed export/restore path once any workspace exists.
    if op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM planning_workspaces)")).scalar():
        raise RuntimeError("Private planning data exists; destructive downgrade refused")
    for name in ("planning_mutations", "private_meals", "private_plans", "planning_workspaces"):
        op.drop_table(name)
