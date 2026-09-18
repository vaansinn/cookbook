"""Preference leaf service; caller owns authentication, locks and transaction.

preferences.update runs inside the existing user/workspace lock and receipt
transaction. The integrator must check the envelope's workspace baseline but
skip domain revision increments and undo invalidation for this operation.
These helpers never commit, create workspaces, import browser state or register
routes. GET adds the domain revision at the route boundary.
"""
from app import db
from planning_preference_models import (
    MAX_REVISION, PrivatePlanningPreferences, default_values, validate_values,
)

OPERATIONS = {"preferences.update"}


def validate(operation, payload):
    from routes.planning import invalid, keys
    if type(operation) is not str or operation not in OPERATIONS:
        invalid("Unsupported preference operation")
    keys(payload, ("expected_revision", "changes"))
    if type(payload["expected_revision"]) is not int or not 0 <= payload["expected_revision"] <= MAX_REVISION:
        invalid("Nonnegative preference revision required")
    try:
        validate_values(payload["changes"], partial=True)
    except ValueError:
        invalid("Invalid preference changes")


def _row(owner):
    if owner is None:
        return None
    # Do not flush unrelated pending state during reads. Refresh cached ORM
    # state so stale sessions cannot reuse an earlier preference revision.
    with db.session.no_autoflush:
        return PrivatePlanningPreferences.query.filter_by(workspace_id=owner.id).populate_existing().first()


def _stored_values(row):
    from routes.planning import PlanningError
    if row is None:
        return default_values()
    try:
        if type(row.revision) is not int or not 0 <= row.revision <= MAX_REVISION:
            raise ValueError()
        return validate_values(row.values)
    except ValueError:
        raise PlanningError("preferences_integrity_error", "Preferences are temporarily unavailable", 503) from None


def _owned_scope(owner, identity):
    # Shopping is independently integrated; never resolve by global ID alone.
    from planning_shopping_models import PrivateShoppingScope
    with db.session.no_autoflush:
        return PrivateShoppingScope.query.filter_by(id=identity, workspace_id=owner.id).first()


def get_preferences(owner):
    row = _row(owner)
    values = _stored_values(row)
    if values["shopping_scope_id"] is not None and _owned_scope(owner, values["shopping_scope_id"]) is None:
        # A stale or foreign reference is neither an access grant nor a GET write.
        values["shopping_scope_id"] = None
    return {"preferences": values, "preference_revision": row.revision if row else 0}


def apply(owner, operation, payload):
    from routes.planning import PlanningError
    validate(operation, payload)
    if owner is None:
        raise PlanningError("invalid_session", "Authentication required", 401)
    row = _row(owner)
    values = _stored_values(row)
    revision = row.revision if row else 0
    if payload["expected_revision"] != revision:
        raise PlanningError("preference_revision_conflict", "Preferences changed; reload and review", 409,
                            current_preference_revision=revision)
    if revision == MAX_REVISION:
        raise PlanningError("limit_reached", "Preference revision limit reached", 409)
    changes = validate_values(payload["changes"], partial=True)
    scope_id = changes.get("shopping_scope_id")
    if scope_id is not None and _owned_scope(owner, scope_id) is None:
        raise PlanningError("not_found", "Planning record not found", 404)
    values.update(changes)
    if row is None:
        row = PrivatePlanningPreferences(workspace_id=owner.id, revision=revision + 1, values=values)
        db.session.add(row)
    else:
        row.values = values
        row.revision = revision + 1
    db.session.flush()
    # Exact receipts deliberately contain no personal values or projections.
    return {"preference_revision": row.revision}, 200
