"""Private planning domain, separate from legacy household/meal-plan tables."""
from datetime import datetime
from functools import wraps
from uuid import uuid4

from app import db


def consistent_planning_read(function):
    """Start a PostgreSQL read snapshot after JWT's independent user lookup.

    Used only on read-only endpoints: discard the auth lookup transaction, then
    recheck account existence in the same snapshot as the revision and payload.
    SQLite remains the regression harness, not concurrent-read acceptance.
    """
    @wraps(function)
    def wrapped(*args, **kwargs):
        from flask import jsonify
        from flask_jwt_extended import get_jwt_identity
        from models import User
        db.session.rollback()
        if db.engine.dialect.name == "postgresql":
            db.session.connection(execution_options={"isolation_level": "REPEATABLE READ"})
            db.session.execute(db.text("SET TRANSACTION READ ONLY"))
        if db.session.get(User, int(get_jwt_identity())) is None:
            return jsonify(code="invalid_session", error="Authentication required"), 401
        return function(*args, **kwargs)
    return wrapped


def new_id():
    return str(uuid4())


class PlanningWorkspace(db.Model):
    __tablename__ = "planning_workspaces"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    revision = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (db.CheckConstraint("revision >= 0", name="ck_planning_revision"),)

    def to_dict(self):
        return {"id": self.id, "revision": self.revision, "created_at": self.created_at.isoformat()}


class PrivatePlan(db.Model):
    __tablename__ = "private_plans"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    workspace_id = db.Column(db.String(36), db.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (
        db.UniqueConstraint("id", "workspace_id", name="uq_private_plan_workspace"),
        db.CheckConstraint("end_date >= start_date", name="ck_private_plan_dates"),
    )

    def to_dict(self):
        return {"id": self.id, "name": self.name, "start_date": self.start_date.isoformat(),
                "end_date": self.end_date.isoformat(), "created_at": self.created_at.isoformat()}


class PrivateMeal(db.Model):
    __tablename__ = "private_meals"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    workspace_id = db.Column(db.String(36), db.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id = db.Column(db.String(36), nullable=False)
    date = db.Column(db.Date, nullable=False)
    name = db.Column(db.String(160))
    time = db.Column(db.String(5))
    position = db.Column(db.Integer, nullable=False)
    __table_args__ = (
        db.ForeignKeyConstraint(["plan_id", "workspace_id"], ["private_plans.id", "private_plans.workspace_id"],
                                ondelete="CASCADE", name="fk_private_meal_plan_workspace"),
        db.UniqueConstraint("plan_id", "date", "position", name="uq_private_meal_position"),
        db.CheckConstraint("position >= 0", name="ck_private_meal_position"),
        db.UniqueConstraint("id", "workspace_id", name="uq_private_meal_workspace"),
    )

    def to_dict(self):
        return {"id": self.id, "plan_id": self.plan_id, "date": self.date.isoformat(),
                "name": self.name, "time": self.time, "position": self.position}


class PlanningMutation(db.Model):
    __tablename__ = "planning_mutations"
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.String(36), db.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    mutation_id = db.Column(db.String(36), nullable=False)
    request_digest = db.Column(db.String(64), nullable=False)
    result = db.Column(db.JSON, nullable=False)
    status_code = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint("workspace_id", "mutation_id", name="uq_planning_mutation"),)


class PrivateEvent(db.Model):
    __tablename__ = "private_events"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    workspace_id = db.Column(db.String(36), db.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    date = db.Column(db.Date, nullable=False)
    time = db.Column(db.String(5))
    guests = db.Column(db.Integer, nullable=False, default=2)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint("id", "workspace_id", name="uq_private_event_workspace"),
                     db.CheckConstraint("guests BETWEEN 1 AND 1000", name="ck_private_event_guests"))

    def to_dict(self):
        return {"id": self.id, "name": self.name, "date": self.date.isoformat(), "time": self.time,
                "guests": self.guests, "created_at": self.created_at.isoformat()}


class PrivateEventLink(db.Model):
    __tablename__ = "private_event_links"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    workspace_id = db.Column(db.String(36), db.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id = db.Column(db.String(36), nullable=False)
    event_id = db.Column(db.String(36), nullable=False)
    __table_args__ = (
        db.ForeignKeyConstraint(["plan_id", "workspace_id"], ["private_plans.id", "private_plans.workspace_id"], ondelete="CASCADE", name="fk_private_link_plan"),
        db.ForeignKeyConstraint(["event_id", "workspace_id"], ["private_events.id", "private_events.workspace_id"], ondelete="CASCADE", name="fk_private_link_event"),
        db.UniqueConstraint("plan_id", "event_id", name="uq_private_event_link"),
    )

    def to_dict(self):
        return {"id": self.id, "plan_id": self.plan_id, "event_id": self.event_id}


class PrivatePreparationTask(db.Model):
    __tablename__ = "private_preparation_tasks"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    workspace_id = db.Column(db.String(36), db.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = db.Column(db.String(36), nullable=False)
    bucket = db.Column(db.String(12), nullable=False)
    text = db.Column(db.String(160), nullable=False)
    done = db.Column(db.Boolean, nullable=False, default=False)
    position = db.Column(db.Integer, nullable=False)
    __table_args__ = (
        db.ForeignKeyConstraint(["event_id", "workspace_id"], ["private_events.id", "private_events.workspace_id"], ondelete="CASCADE", name="fk_private_task_event"),
        db.CheckConstraint("bucket IN ('earlier','day','serving')", name="ck_private_task_bucket"),
        db.CheckConstraint("position >= 0", name="ck_private_task_position"),
        db.UniqueConstraint("event_id", "position", name="uq_private_task_position"),
    )

    def to_dict(self):
        return {"id": self.id, "event_id": self.event_id, "bucket": self.bucket,
                "text": self.text, "done": self.done, "position": self.position}


class PlanningPreview(db.Model):
    __tablename__ = "planning_previews"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    workspace_id = db.Column(db.String(36), db.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    revision = db.Column(db.Integer, nullable=False)
    operation = db.Column(db.String(40), nullable=False)
    payload = db.Column(db.JSON, nullable=False)
    effects = db.Column(db.JSON, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)

    def to_dict(self):
        return {"id": self.id, "revision": self.revision, "operation": self.operation,
                "payload": self.payload, "effects": self.effects, "expires_at": self.expires_at.isoformat() + "Z"}


class PlanningUndo(db.Model):
    __tablename__ = "planning_undo"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    workspace_id = db.Column(db.String(36), db.ForeignKey("planning_workspaces.id", ondelete="CASCADE"), nullable=False, unique=True)
    revision = db.Column(db.Integer, nullable=False)
    inverse = db.Column(db.JSON, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)

    def to_dict(self):
        return {"id": self.id, "revision": self.revision, "inverse": self.inverse,
                "expires_at": self.expires_at.isoformat() + "Z"}


def export_private_planning(user_id):
    from planning_item_models import PrivatePlannedItem
    from planning_shopping_models import PrivateShoppingScope
    from planning_template_models import PrivatePlanningTemplate
    from planning_preference_models import PrivatePlanningPreferences
    workspace = PlanningWorkspace.query.filter_by(user_id=user_id).first()
    if workspace is None:
        return {"workspace": None, "plans": [], "meals": [], "mutations": [],
                "events": [], "event_links": [], "preparation_tasks": [], "previews": [], "undo": [], "items": [],
                "shopping_scopes": [], "templates": [], "preferences": []}
    return {
        "workspace": workspace.to_dict(),
        "plans": [p.to_dict() for p in PrivatePlan.query.filter_by(workspace_id=workspace.id).order_by(PrivatePlan.id)],
        "meals": [m.to_dict() for m in PrivateMeal.query.filter_by(workspace_id=workspace.id).order_by(PrivateMeal.id)],
        **{key: [row.to_dict() for row in model.query.filter_by(workspace_id=workspace.id).order_by(model.id)]
           for key, model in (("events", PrivateEvent), ("event_links", PrivateEventLink),
                              ("preparation_tasks", PrivatePreparationTask), ("previews", PlanningPreview), ("undo", PlanningUndo), ("items", PrivatePlannedItem),
                              ("shopping_scopes", PrivateShoppingScope), ("templates", PrivatePlanningTemplate), ("preferences", PrivatePlanningPreferences))},
        "mutations": [{"mutation_id": r.mutation_id, "request_digest": r.request_digest,
                       "result": r.result, "status_code": r.status_code, "created_at": r.created_at.isoformat()}
                      for r in PlanningMutation.query.filter_by(workspace_id=workspace.id).order_by(PlanningMutation.id)],
    }


def delete_private_planning(user_id):
    from planning_item_models import PrivatePlannedItem
    from planning_shopping_models import PrivateShoppingScope
    from planning_template_models import PrivatePlanningTemplate
    from planning_preference_models import PrivatePlanningPreferences
    # Explicit deletes also work with the legacy SQLite harness, whose FK setting
    # is not guaranteed. PostgreSQL additionally enforces ON DELETE CASCADE.
    workspace = PlanningWorkspace.query.filter_by(user_id=user_id).first()
    if workspace:
        for model in (PlanningMutation, PlanningPreview, PlanningUndo, PrivatePlanningPreferences, PrivateShoppingScope,
                      PrivatePlanningTemplate, PrivatePlannedItem, PrivatePreparationTask, PrivateEventLink, PrivateEvent, PrivateMeal, PrivatePlan):
            model.query.filter_by(workspace_id=workspace.id).delete(synchronize_session=False)
        db.session.delete(workspace)
