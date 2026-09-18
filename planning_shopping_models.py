"""Scope-owned shopping state. Caller owns authorization, locks and commit."""
from copy import deepcopy
from sqlalchemy import event
from app import db
from planning_models import new_id


def empty_state():
    return {"rows": {}, "personal": [], "unavailable": False}


def json_size_expression(column):
    """Bytes of persisted JSON text, including its escaping and whitespace.

    Compute in SQL so rejecting an oversized workspace does not deserialize all
    scope JSON in Python. PostgreSQL JSON (not JSONB) and SQLite are supported.
    """
    if db.session.get_bind().dialect.name == "postgresql":
        return db.func.octet_length(db.cast(column, db.Text))
    return db.func.length(db.cast(column, db.LargeBinary))


def state_size_expression():
    return json_size_expression(PrivateShoppingScope.state)


class PrivateShoppingScope(db.Model):
    __tablename__ = "private_shopping_scopes"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    workspace_id = db.Column(db.String(36), db.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id = db.Column(db.String(36))
    event_id = db.Column(db.String(36))
    mode = db.Column(db.String(8), nullable=False)
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    selection = db.Column(db.JSON, nullable=False, default=list)
    selection_digest = db.Column(db.String(64), nullable=False)
    state = db.Column(db.JSON, nullable=False, default=empty_state)
    __table_args__ = (
        db.ForeignKeyConstraint(["plan_id", "workspace_id"], ["private_plans.id", "private_plans.workspace_id"], ondelete="CASCADE", name="fk_shopping_scope_plan"),
        db.ForeignKeyConstraint(["event_id", "workspace_id"], ["private_events.id", "private_events.workspace_id"], ondelete="CASCADE", name="fk_shopping_scope_event"),
        db.UniqueConstraint("workspace_id", "selection_digest", name="uq_shopping_scope_selection"),
        db.UniqueConstraint("id", "workspace_id", name="uq_shopping_scope_workspace"),
        db.CheckConstraint("(plan_id IS NULL) <> (event_id IS NULL)", name="ck_shopping_scope_owner"),
        db.CheckConstraint("mode IN ('all','dates','meals') AND (event_id IS NULL OR mode = 'all')", name="ck_shopping_scope_mode"),
        db.CheckConstraint("(mode = 'dates' AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date) OR (mode <> 'dates' AND start_date IS NULL AND end_date IS NULL)", name="ck_shopping_scope_dates"),
        db.CheckConstraint("length(selection_digest) = 64", name="ck_shopping_scope_digest"),
    )

    def descriptor(self):
        return {"id": self.id, "owner_type": "plan" if self.plan_id else "event",
                "owner_id": self.plan_id or self.event_id, "mode": self.mode,
                "selection": deepcopy(self.selection),
                "start_date": self.start_date.isoformat() if self.start_date else None,
                "end_date": self.end_date.isoformat() if self.end_date else None}

    def to_dict(self):
        # Restoration uses these model fields, not the public descriptor shape.
        return {"id": self.id, "plan_id": self.plan_id, "event_id": self.event_id,
                "mode": self.mode, "start_date": self.start_date.isoformat() if self.start_date else None,
                "end_date": self.end_date.isoformat() if self.end_date else None,
                "selection": deepcopy(self.selection), "selection_digest": self.selection_digest,
                "state": deepcopy(self.state)}


@event.listens_for(PrivateShoppingScope, "before_insert")
@event.listens_for(PrivateShoppingScope, "before_update")
def validate_scope_record(_mapper, _connection, target):
    from planning_shopping import check_record
    check_record(target)
