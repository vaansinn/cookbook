"""Account-private preferences, with a revision independent of planning edits.

Import before migration metadata discovery. JSON validation is enforced by the
ORM/service; privileged raw SQL is not a supported preferences authoring API.
"""
from uuid import UUID

from sqlalchemy.orm import validates

from app import db
from planning_models import new_id

MAX_REVISION = 2147483647
FIELDS = frozenset({"language", "dark_mode", "shopping_layout", "shopping_scope_id"})


def default_values():
    return {"language": "en", "dark_mode": False,
            "shopping_layout": "category", "shopping_scope_id": None}


def validate_values(values, *, partial=False):
    """Return detached, closed-schema JSON; never coerce user input."""
    if type(values) is not dict or not values or set(values) - FIELDS:
        raise ValueError("Invalid preference fields")
    if not partial and set(values) != FIELDS:
        raise ValueError("Incomplete preferences")
    for key, value in values.items():
        if key == "language":
            valid = type(value) is str and value in {"en", "de"}
        elif key == "dark_mode":
            valid = type(value) is bool
        elif key == "shopping_layout":
            valid = type(value) is str and value in {"category", "alphabetical", "dish", "amount"}
        else:
            valid = value is None
            if type(value) is str and len(value) == 36:
                try:
                    valid = str(UUID(value)) == value
                except ValueError:
                    valid = False
        if not valid:
            raise ValueError("Invalid preference value")
    return dict(values)


class PrivatePlanningPreferences(db.Model):
    __tablename__ = "private_planning_preferences"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    workspace_id = db.Column(db.String(36), db.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False, unique=True)
    revision = db.Column(db.Integer, nullable=False, default=0)
    values = db.Column(db.JSON(none_as_null=True), nullable=False, default=default_values)
    __table_args__ = (
        db.CheckConstraint("revision >= 0 AND revision <= 2147483647 AND revision = CAST(revision AS INTEGER)", name="ck_private_preferences_revision"),
    )

    @validates("values")
    def _values(self, _key, value):
        return validate_values(value)

    @validates("revision")
    def _revision(self, _key, value):
        if type(value) is not int or not 0 <= value <= MAX_REVISION:
            raise ValueError("Invalid preference revision")
        return value

    def to_dict(self):
        # Export gets a detached copy, not a mutable reference to ORM JSON.
        return {"id": self.id, "revision": self.revision, "values": validate_values(self.values)}
