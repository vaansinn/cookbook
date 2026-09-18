"""Private events, same-owner links, reminders and bounded confirmation/undo."""
from alembic import op
import sqlalchemy as sa

revision = "b842c310fa51"
down_revision = "a631b209ef40"
branch_labels = None
depends_on = None


def owner():
    return sa.Column("workspace_id", sa.String(36), sa.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False)


def upgrade():
    op.create_table("private_events", sa.Column("id", sa.String(36), primary_key=True), owner(),
                    sa.Column("name", sa.String(160), nullable=False), sa.Column("date", sa.Date(), nullable=False),
                    sa.Column("time", sa.String(5)), sa.Column("guests", sa.Integer(), nullable=False),
                    sa.Column("created_at", sa.DateTime(), nullable=False),
                    sa.UniqueConstraint("id", "workspace_id", name="uq_private_event_workspace"),
                    sa.CheckConstraint("guests BETWEEN 1 AND 1000", name="ck_private_event_guests"))
    op.create_table("private_event_links", sa.Column("id", sa.String(36), primary_key=True), owner(),
                    sa.Column("plan_id", sa.String(36), nullable=False), sa.Column("event_id", sa.String(36), nullable=False),
                    sa.ForeignKeyConstraint(["plan_id", "workspace_id"], ["private_plans.id", "private_plans.workspace_id"], ondelete="CASCADE", name="fk_private_link_plan"),
                    sa.ForeignKeyConstraint(["event_id", "workspace_id"], ["private_events.id", "private_events.workspace_id"], ondelete="CASCADE", name="fk_private_link_event"),
                    sa.UniqueConstraint("plan_id", "event_id", name="uq_private_event_link"))
    op.create_table("private_preparation_tasks", sa.Column("id", sa.String(36), primary_key=True), owner(),
                    sa.Column("event_id", sa.String(36), nullable=False), sa.Column("bucket", sa.String(12), nullable=False),
                    sa.Column("text", sa.String(160), nullable=False), sa.Column("done", sa.Boolean(), nullable=False),
                    sa.Column("position", sa.Integer(), nullable=False),
                    sa.ForeignKeyConstraint(["event_id", "workspace_id"], ["private_events.id", "private_events.workspace_id"], ondelete="CASCADE", name="fk_private_task_event"),
                    sa.CheckConstraint("bucket IN ('earlier','day','serving')", name="ck_private_task_bucket"),
                    sa.CheckConstraint("position >= 0", name="ck_private_task_position"),
                    sa.UniqueConstraint("event_id", "position", name="uq_private_task_position"))
    op.create_table("planning_previews", sa.Column("id", sa.String(36), primary_key=True), owner(),
                    sa.Column("revision", sa.Integer(), nullable=False), sa.Column("operation", sa.String(40), nullable=False),
                    sa.Column("payload", sa.JSON(), nullable=False), sa.Column("effects", sa.JSON(), nullable=False),
                    sa.Column("expires_at", sa.DateTime(), nullable=False))
    op.create_table("planning_undo", sa.Column("id", sa.String(36), primary_key=True), owner(),
                    sa.Column("revision", sa.Integer(), nullable=False), sa.Column("inverse", sa.JSON(), nullable=False),
                    sa.Column("expires_at", sa.DateTime(), nullable=False), sa.UniqueConstraint("workspace_id", name="uq_planning_undo_workspace"))
    for table in ("private_events", "private_event_links", "private_preparation_tasks", "planning_previews"):
        op.create_index("ix_" + table + "_workspace_id", table, ["workspace_id"])


def downgrade():
    # Even an empty event table is not proof old binaries can interpret newer receipts.
    if op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM planning_workspaces)")).scalar():
        raise RuntimeError("Private planning data exists; destructive downgrade refused")
    for table in ("planning_undo", "planning_previews", "private_preparation_tasks", "private_event_links", "private_events"):
        op.drop_table(table)
