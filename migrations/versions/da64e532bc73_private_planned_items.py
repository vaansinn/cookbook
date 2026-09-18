"""Independent configured dish, personal item and note records."""
from alembic import op
import sqlalchemy as sa

revision = "da64e532bc73"
down_revision = "c953d421ab62"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("private_meals") as batch:
        batch.create_unique_constraint("uq_private_meal_workspace", ["id", "workspace_id"])
    op.create_table("private_planned_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("meal_id", sa.String(36)), sa.Column("event_id", sa.String(36)),
        sa.Column("position", sa.Integer(), nullable=False), sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("title", sa.String(160)), sa.Column("group", sa.String(160)), sa.Column("contribution", sa.String(160)),
        sa.Column("quantity", sa.Numeric(12, 3)), sa.Column("unit", sa.String(16)),
        sa.Column("entry_id", sa.String(80)), sa.Column("catalog_revision", sa.Integer()),
        sa.Column("language", sa.String(2)), sa.Column("options", sa.JSON()), sa.Column("servings", sa.Numeric(7, 3)),
        sa.Column("follows_guests", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["meal_id", "workspace_id"], ["private_meals.id", "private_meals.workspace_id"], ondelete="CASCADE", name="fk_private_item_meal"),
        sa.ForeignKeyConstraint(["event_id", "workspace_id"], ["private_events.id", "private_events.workspace_id"], ondelete="CASCADE", name="fk_private_item_event"),
        sa.ForeignKeyConstraint(["entry_id", "catalog_revision"], ["planning_catalog_entries.entry_id", "planning_catalog_entries.revision"], name="fk_private_item_catalog"),
        sa.CheckConstraint("(meal_id IS NULL) <> (event_id IS NULL)", name="ck_private_item_parent"),
        sa.CheckConstraint("kind IN ('dish','personal','note')", name="ck_private_item_kind"),
        sa.CheckConstraint("position >= 0", name="ck_private_item_position"),
        sa.CheckConstraint("(kind = 'dish' AND entry_id IS NOT NULL AND catalog_revision IS NOT NULL AND language IS NOT NULL AND options IS NOT NULL AND servings > 0 AND servings <= 1000 AND quantity IS NULL AND unit IS NULL) OR (kind <> 'dish' AND entry_id IS NULL AND catalog_revision IS NULL AND language IS NULL AND options IS NULL AND servings IS NULL AND follows_guests = false AND title IS NOT NULL)", name="ck_private_item_content"),
        sa.CheckConstraint("(quantity IS NULL AND unit IS NULL) OR (kind = 'personal' AND quantity > 0 AND quantity <= 1000000 AND unit IS NOT NULL)", name="ck_private_item_quantity"),
        sa.CheckConstraint("follows_guests = false OR event_id IS NOT NULL", name="ck_private_item_guest_follow"),
        sa.UniqueConstraint("meal_id", "position", name="uq_private_meal_item_position"),
        sa.UniqueConstraint("event_id", "position", name="uq_private_event_item_position"))
    op.create_index("ix_private_planned_items_workspace_id", "private_planned_items", ["workspace_id"])


def downgrade():
    if op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM planning_workspaces)")).scalar():
        raise RuntimeError("Private planning data exists; destructive downgrade refused")
    op.drop_table("private_planned_items")
    with op.batch_alter_table("private_meals") as batch:
        batch.drop_constraint("uq_private_meal_workspace", type_="unique")
