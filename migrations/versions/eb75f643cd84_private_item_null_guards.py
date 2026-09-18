"""Close SQL UNKNOWN holes in item quantity/serving constraints."""
from alembic import op
import sqlalchemy as sa

revision = "eb75f643cd84"
down_revision = "da64e532bc73"
branch_labels = None
depends_on = None

OLD_CONTENT = "(kind = 'dish' AND entry_id IS NOT NULL AND catalog_revision IS NOT NULL AND language IS NOT NULL AND options IS NOT NULL AND servings > 0 AND servings <= 1000 AND quantity IS NULL AND unit IS NULL) OR (kind <> 'dish' AND entry_id IS NULL AND catalog_revision IS NULL AND language IS NULL AND options IS NULL AND servings IS NULL AND follows_guests = false AND title IS NOT NULL)"
OLD_QUANTITY = "(quantity IS NULL AND unit IS NULL) OR (kind = 'personal' AND quantity > 0 AND quantity <= 1000000 AND unit IS NOT NULL)"
CONTENT = OLD_CONTENT.replace("AND servings > 0", "AND servings IS NOT NULL AND servings = CAST(servings AS INTEGER) AND servings > 0")
QUANTITY = OLD_QUANTITY.replace("AND quantity > 0", "AND quantity IS NOT NULL AND quantity > 0")


def replace(content, quantity):
    with op.batch_alter_table("private_planned_items") as batch:
        batch.drop_constraint("ck_private_item_content", type_="check")
        batch.drop_constraint("ck_private_item_quantity", type_="check")
        batch.create_check_constraint("ck_private_item_content", content)
        batch.create_check_constraint("ck_private_item_quantity", quantity)


def upgrade():
    # Existing invalid rows cause a transactional migration failure; never repair
    # private quantities by guessing a serving count or deleting the records.
    replace(CONTENT, QUANTITY)


def downgrade():
    if op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM planning_workspaces)")).scalar():
        raise RuntimeError("Private planning data exists; weaker-constraint downgrade refused")
    replace(OLD_CONTENT, OLD_QUANTITY)
