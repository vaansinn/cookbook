"""Individual private menu entries; no relation to personal recipe authoring."""
from app import db
from planning_models import new_id
import planning_catalog_models  # register catalog FK metadata


class PrivatePlannedItem(db.Model):
    __tablename__ = "private_planned_items"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    workspace_id = db.Column(db.String(36), db.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    meal_id = db.Column(db.String(36))
    event_id = db.Column(db.String(36))
    position = db.Column(db.Integer, nullable=False)
    kind = db.Column(db.String(16), nullable=False)
    title = db.Column(db.String(160))
    group = db.Column(db.String(160))
    contribution = db.Column(db.String(160))
    quantity = db.Column(db.Numeric(12, 3))
    unit = db.Column(db.String(16))
    entry_id = db.Column(db.String(80))
    catalog_revision = db.Column(db.Integer)
    language = db.Column(db.String(2))
    options = db.Column(db.JSON(none_as_null=True))
    servings = db.Column(db.Numeric(7, 3))
    follows_guests = db.Column(db.Boolean, nullable=False, default=False)
    __table_args__ = (
        db.ForeignKeyConstraint(["meal_id", "workspace_id"], ["private_meals.id", "private_meals.workspace_id"], ondelete="CASCADE", name="fk_private_item_meal"),
        db.ForeignKeyConstraint(["event_id", "workspace_id"], ["private_events.id", "private_events.workspace_id"], ondelete="CASCADE", name="fk_private_item_event"),
        db.ForeignKeyConstraint(["entry_id", "catalog_revision"], ["planning_catalog_entries.entry_id", "planning_catalog_entries.revision"], name="fk_private_item_catalog"),
        db.CheckConstraint("(meal_id IS NULL) <> (event_id IS NULL)", name="ck_private_item_parent"),
        db.CheckConstraint("kind IN ('dish','personal','note')", name="ck_private_item_kind"),
        db.CheckConstraint("position >= 0", name="ck_private_item_position"),
        db.CheckConstraint("(kind = 'dish' AND entry_id IS NOT NULL AND catalog_revision IS NOT NULL AND language IS NOT NULL AND options IS NOT NULL AND servings IS NOT NULL AND servings > 0 AND servings <= 1000 AND servings = CAST(servings AS INTEGER) AND quantity IS NULL AND unit IS NULL) OR (kind <> 'dish' AND entry_id IS NULL AND catalog_revision IS NULL AND language IS NULL AND options IS NULL AND servings IS NULL AND follows_guests = false AND title IS NOT NULL)", name="ck_private_item_content"),
        db.CheckConstraint("(quantity IS NULL AND unit IS NULL) OR (kind = 'personal' AND quantity IS NOT NULL AND quantity > 0 AND quantity <= 1000000 AND unit IS NOT NULL)", name="ck_private_item_quantity"),
        db.CheckConstraint("follows_guests = false OR event_id IS NOT NULL", name="ck_private_item_guest_follow"),
        db.UniqueConstraint("meal_id", "position", name="uq_private_meal_item_position"),
        db.UniqueConstraint("event_id", "position", name="uq_private_event_item_position"),
    )

    def to_dict(self):
        return {"id": self.id, "meal_id": self.meal_id, "event_id": self.event_id, "position": self.position,
                "kind": self.kind, "title": self.title, "group": self.group, "contribution": self.contribution,
                "quantity": str(self.quantity) if self.quantity is not None else None, "unit": self.unit,
                "entry_id": self.entry_id, "catalog_revision": self.catalog_revision, "language": self.language,
                "options": self.options, "servings": str(self.servings) if self.servings is not None else None,
                "follows_guests": self.follows_guests}
