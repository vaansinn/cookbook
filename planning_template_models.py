"""Private independent template storage; migration/registration belong to main.

Blueprint bounds and its closed shape are enforced by ORM hooks and the service.
Raw SQL bypasses those hooks: integration must not claim database JSON validation.
"""
from copy import deepcopy
from datetime import datetime

from sqlalchemy import event

from app import db
from planning_models import new_id


class PrivatePlanningTemplate(db.Model):
    __tablename__ = "private_planning_templates"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    workspace_id = db.Column(db.String(36), db.ForeignKey("planning_workspaces.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    kind = db.Column(db.String(16), nullable=False)
    blueprint = db.Column(db.JSON(none_as_null=True), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (
        db.CheckConstraint("kind IN ('meal','menu')", name="ck_private_template_kind"),
        db.UniqueConstraint("id", "workspace_id", name="uq_private_template_workspace"),
    )

    def to_dict(self):
        """Private export shape; not proof of present catalog eligibility."""
        return {"id": self.id, "name": self.name, "kind": self.kind,
                "blueprint": deepcopy(self.blueprint),
                "created_at": self.created_at.isoformat() + "Z"}


@event.listens_for(PrivatePlanningTemplate, "before_insert")
@event.listens_for(PrivatePlanningTemplate, "before_update")
def validate_template_record(_mapper, _connection, target):
    from planning_templates import validate_blueprint
    from routes.planning import text
    target.name = text(target.name)
    validate_blueprint(target.blueprint, target.kind)
