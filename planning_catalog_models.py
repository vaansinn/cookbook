"""Retained authored planning revisions; application wiring belongs to main."""
from datetime import datetime

from sqlalchemy import event, inspect, select

from app import db


class PlanningCatalogEntry(db.Model):
    __tablename__ = "planning_catalog_entries"

    id = db.Column(db.Integer, primary_key=True)
    entry_id = db.Column(db.String(80), nullable=False)
    revision = db.Column(db.Integer, nullable=False)
    kind = db.Column(db.String(20), nullable=False)
    availability = db.Column(db.String(12), nullable=False, default="draft", server_default="draft")
    content = db.Column(db.JSON, nullable=False)
    content_digest = db.Column(db.String(64), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("entry_id", "revision", name="uq_planning_catalog_entry_revision"),
        db.CheckConstraint("revision BETWEEN 1 AND 2147483647", name="ck_planning_catalog_revision"),
        db.CheckConstraint("length(entry_id) BETWEEN 1 AND 80", name="ck_planning_catalog_entry_id"),
        db.CheckConstraint("kind IN ('recipe','planning_example')", name="ck_planning_catalog_kind"),
        db.CheckConstraint("availability IN ('draft','published','revoked')", name="ck_planning_catalog_availability"),
        db.CheckConstraint("length(content_digest) = 64", name="ck_planning_catalog_digest"),
    )


@event.listens_for(PlanningCatalogEntry, "before_insert")
def _validate_insert(_mapper, connection, target):
    from planning_catalog import CatalogError, validate_record

    record = {"entry_id": target.entry_id, "revision": target.revision,
              "kind": target.kind, "content": target.content,
              "availability": "draft" if target.availability is None else target.availability}
    if target.content_digest is not None:
        record["content_digest"] = target.content_digest
    validated = validate_record(record)
    table = PlanningCatalogEntry.__table__
    existing = connection.execute(select(table.c.kind, table.c.revision).where(
        table.c.entry_id == target.entry_id)).all()
    if any(row.kind != target.kind or row.revision >= target.revision for row in existing):
        raise CatalogError("catalog_revision_conflict", "Entry kind and prior revisions are retained", 409)
    target.content = validated["content"]
    target.content_digest = validated["content_digest"]
    target.availability = validated["availability"]


@event.listens_for(PlanningCatalogEntry, "before_update")
def _retain_revision(_mapper, connection, target):
    from planning_catalog import CatalogError, validate_record, validate_transition

    table = PlanningCatalogEntry.__table__
    old = connection.execute(select(table).where(table.c.id == inspect(target).identity[0])).mappings().one()
    immutable = ("id", "entry_id", "revision", "kind", "content", "content_digest", "created_at")
    if any(getattr(target, field) != old[field] for field in immutable):
        raise CatalogError("catalog_revision_conflict", "Authored revisions cannot be overwritten", 409)
    validate_record({key: getattr(target, key) for key in (
        "entry_id", "revision", "kind", "availability", "content", "content_digest")})
    validate_transition(old["availability"], target.availability)


@event.listens_for(PlanningCatalogEntry, "before_delete")
def _retain_deleted_revision(_mapper, _connection, _target):
    from planning_catalog import CatalogError

    raise CatalogError("catalog_revision_conflict", "Revoke retained revisions instead of deleting them", 409)
