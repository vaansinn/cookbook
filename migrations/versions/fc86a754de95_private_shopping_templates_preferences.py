"""Add private shopping scopes, independent templates and preferences.

No content seed or personal-data conversion. Recovery builds must understand
source reconciliation; an old application is not a safe rollback target.
"""
from alembic import op
import sqlalchemy as sa

revision = "fc86a754de95"
down_revision = "eb75f643cd84"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("private_shopping_scopes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", sa.String(36)), sa.Column("event_id", sa.String(36)),
        sa.Column("mode", sa.String(8), nullable=False),
        sa.Column("start_date", sa.Date()), sa.Column("end_date", sa.Date()),
        sa.Column("selection", sa.JSON(), nullable=False),
        sa.Column("selection_digest", sa.String(64), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["plan_id", "workspace_id"], ["private_plans.id", "private_plans.workspace_id"], ondelete="CASCADE", name="fk_shopping_scope_plan"),
        sa.ForeignKeyConstraint(["event_id", "workspace_id"], ["private_events.id", "private_events.workspace_id"], ondelete="CASCADE", name="fk_shopping_scope_event"),
        sa.UniqueConstraint("workspace_id", "selection_digest", name="uq_shopping_scope_selection"),
        sa.UniqueConstraint("id", "workspace_id", name="uq_shopping_scope_workspace"),
        sa.CheckConstraint("(plan_id IS NULL) <> (event_id IS NULL)", name="ck_shopping_scope_owner"),
        sa.CheckConstraint("mode IN ('all','dates','meals') AND (event_id IS NULL OR mode = 'all')", name="ck_shopping_scope_mode"),
        sa.CheckConstraint("(mode = 'dates' AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date) OR (mode <> 'dates' AND start_date IS NULL AND end_date IS NULL)", name="ck_shopping_scope_dates"),
        sa.CheckConstraint("length(selection_digest) = 64", name="ck_shopping_scope_digest"))
    op.create_index("ix_private_shopping_scopes_workspace_id", "private_shopping_scopes", ["workspace_id"])
    op.create_table("private_planning_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("blueprint", sa.JSON(none_as_null=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("kind IN ('meal','menu')", name="ck_private_template_kind"),
        sa.UniqueConstraint("id", "workspace_id", name="uq_private_template_workspace"))
    op.create_index("ix_private_planning_templates_workspace_id", "private_planning_templates", ["workspace_id"])
    op.create_table("private_planning_preferences",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("values", sa.JSON(none_as_null=True), nullable=False),
        sa.CheckConstraint("revision >= 0 AND revision <= 2147483647 AND revision = CAST(revision AS INTEGER)", name="ck_private_preferences_revision"))


def downgrade():
    connection = op.get_bind()
    for table in ("private_shopping_scopes", "private_planning_templates", "private_planning_preferences"):
        if connection.execute(sa.text(f"SELECT EXISTS (SELECT 1 FROM {table})")).scalar():
            raise RuntimeError("Saved shopping/templates/preferences exist; destructive downgrade refused")
    # Even an empty new table does not prove an older writer safe after new
    # commands: retained receipts/inverses may refer to this schema.
    for table in ("planning_mutations", "planning_undo", "planning_previews"):
        if connection.execute(sa.text(f"SELECT EXISTS (SELECT 1 FROM {table})")).scalar():
            raise RuntimeError("Planning recovery records exist; downgrade requires a compatible recovery build")
    op.drop_table("private_planning_preferences")
    op.drop_table("private_planning_templates")
    op.drop_table("private_shopping_scopes")
