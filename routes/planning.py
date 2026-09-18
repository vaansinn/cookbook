"""X1a: private plans/meals with one atomic account-workspace command stream."""
import hashlib
import json
import re
from datetime import date, datetime
from uuid import UUID

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import BadRequest

from app import db
from models import User
from planning_models import PlanningWorkspace, PrivatePlan, PrivateMeal, PlanningMutation, consistent_planning_read
from planning_models import PrivateEvent, PrivateEventLink, PrivatePreparationTask, PlanningPreview, PlanningUndo
from planning_item_models import PrivatePlannedItem
from planning_shopping_models import PrivateShoppingScope
from planning_template_models import PrivatePlanningTemplate
from planning_preference_models import PrivatePlanningPreferences
from planning_catalog import CatalogError
from planning_catalog import catalog_list, catalog_get, catalog_resolve

planning_bp = Blueprint("private_planning", __name__)
# Catalog functions validate authentication and availability themselves. No
# publication endpoint: only reviewed server-authored records can be offered.
planning_bp.add_url_rule("/catalog", view_func=catalog_list, methods=["GET"])
planning_bp.add_url_rule("/catalog/<entry_id>/<int:revision>", view_func=catalog_get, methods=["GET"])
planning_bp.add_url_rule("/catalog/resolve", view_func=catalog_resolve, methods=["POST"])
MAX_BODY = 16 * 1024
MAX_PLANS = 500
MAX_MEALS = 2000
MAX_DAY_MEALS = 100
MAX_WORKSPACE_MEALS = 10000
MAX_MUTATIONS = 10000


class PlanningError(Exception):
    def __init__(self, code, message, status=400, **details):
        self.status = status
        self.body = {"code": code, "error": message, **details}


@planning_bp.errorhandler(PlanningError)
def planning_error(error):
    db.session.rollback()
    return jsonify(error.body), error.status


@planning_bp.errorhandler(CatalogError)
def catalog_error(error):
    db.session.rollback()
    return jsonify(error.body), error.status


@planning_bp.errorhandler(SQLAlchemyError)
def unavailable(_error):
    db.session.rollback()
    current_app.logger.error("Private planning database operation failed")
    return jsonify(code="planning_unavailable", error="Planning is temporarily unavailable; retry the same mutation"), 503


def invalid(message):
    raise PlanningError("invalid_request", message)


def uuid(value):
    if not isinstance(value, str) or len(value) != 36:
        invalid("Canonical UUID required")
    try:
        if str(UUID(value)) != value:
            invalid("Canonical UUID required")
    except ValueError:
        invalid("Canonical UUID required")
    return value


def text(value, *, optional=False):
    if optional and value is None:
        return None
    if not isinstance(value, str) or len(value) > 160:
        invalid("Name must be at most 160 characters")
    if any(ord(c) < 32 or 127 <= ord(c) <= 159 for c in value):
        invalid("Name contains unsupported control characters")
    try:
        value.encode("utf-8")
    except UnicodeError:
        invalid("Invalid Unicode name")
    value = value.strip()
    if not value and not optional:
        invalid("Plan name is required")
    return value or None


def day(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        invalid("Date must be YYYY-MM-DD")
    try:
        return date.fromisoformat(value)
    except ValueError:
        invalid("Invalid date")


def meal_time(value):
    if value is not None and (not isinstance(value, str) or not re.fullmatch(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]", value)):
        invalid("Time must be HH:MM or null")
    return value


def keys(data, required, optional=()):
    if not isinstance(data, dict) or set(data) - set(required) - set(optional) or not set(required) <= set(data):
        invalid("Missing or unsupported fields")


def json_body():
    if not request.is_json:
        invalid("JSON object required")
    try:
        raw = request.stream.read(MAX_BODY + 1)
        if len(raw) > MAX_BODY:
            raise PlanningError("payload_too_large", "Planning command exceeds 16 KiB", 413)
        # Reject duplicate keys rather than letting a last-value parser choose.
        def unique_pairs(pairs):
            result = {}
            for k, v in pairs:
                if k in result:
                    invalid("Duplicate JSON field")
                result[k] = v
            return result
        data = json.loads(raw, object_pairs_hook=unique_pairs)
    except (BadRequest, ValueError, UnicodeError, RecursionError):
        invalid("Malformed JSON object")
    return data


def command_body():
    data = json_body()
    keys(data, ("mutation_id", "expected_workspace_revision", "operation", "payload"))
    uuid(data["mutation_id"])
    revision = data["expected_workspace_revision"]
    if type(revision) is not int or not 0 <= revision < 2147483647:
        invalid("Nonnegative expected_workspace_revision required")
    operation = data["operation"]
    from planning_events import OPERATIONS as event_operations, validate as validate_event
    from planning_changes import OPERATIONS as change_operations, validate as validate_change
    from planning_items import OPERATIONS as item_operations, validate as validate_item
    from planning_repeat import OPERATIONS as repeat_operations, validate as validate_repeat
    if not isinstance(operation, str):
        invalid("Unsupported planning operation")
    payload = data["payload"]
    if operation in {"template.delete", "shopping.personal.delete", "shopping.scope.delete"}:
        invalid("This removal requires a reviewed preview")
    from planning_shopping import OPERATIONS as shopping_operations, validate as validate_shopping
    from planning_templates import OPERATIONS as template_operations, validate as validate_template
    from planning_preferences import validate as validate_preference
    if operation == "preferences.update":
        validate_preference(operation, payload)
        return data
    if operation in shopping_operations:
        validate_shopping(operation, payload)
        return data
    if operation in template_operations:
        validate_template(operation, payload)
        return data
    if operation in repeat_operations:
        validate_repeat(operation, payload)
        return data
    if operation in item_operations:
        validate_item(operation, payload)
        return data
    if operation in event_operations:
        validate_event(operation, payload)
        return data
    if operation in change_operations:
        validate_change(operation, payload)
        return data
    if operation not in ("plan.create", "plan.rename", "meal.create", "meal.update"):
        invalid("Unsupported planning operation")
    if operation == "plan.create":
        keys(payload, ("name", "start_date", "end_date"))
        text(payload["name"])
        start, end = day(payload["start_date"]), day(payload["end_date"])
        if not 0 <= (end - start).days < 730:
            invalid("Plan range must contain 1 to 730 days")
    elif operation == "plan.rename":
        keys(payload, ("plan_id", "name"))
        uuid(payload["plan_id"])
        text(payload["name"])
    else:
        if operation == "meal.create":
            keys(payload, ("plan_id", "date"), ("name", "time"))
            uuid(payload["plan_id"])
            day(payload["date"])
        else:
            keys(payload, ("meal_id",), ("name", "time"))
            uuid(payload["meal_id"])
            if not {"name", "time"} & set(payload):
                invalid("A meal field is required")
        if "name" in payload:
            text(payload["name"], optional=True)
        if "time" in payload:
            meal_time(payload["time"])
    return data


def workspace():
    return PlanningWorkspace.query.filter_by(user_id=int(get_jwt_identity())).first()


def owned(model, identity, owner):
    uuid(identity)
    row = model.query.filter_by(id=identity, workspace_id=owner.id).first() if owner else None
    if row is None:
        raise PlanningError("not_found", "Planning record not found", 404)
    return row


def page(query, model):
    allowed = {"limit", "cursor"}
    if set(request.args) - allowed or any(len(request.args.getlist(k)) != 1 for k in request.args):
        invalid("Unsupported pagination fields")
    limit_text = request.args.get("limit", "50")
    if not re.fullmatch(r"[1-9][0-9]{0,2}", limit_text) or int(limit_text) > 100:
        invalid("Limit must be 1 to 100")
    limit = int(limit_text)
    cursor = request.args.get("cursor")
    if cursor is not None:
        query = query.filter(model.id > uuid(cursor))
    result = query.order_by(model.id).limit(limit + 1).all()
    return [row.to_dict() for row in result[:limit]], result[limit - 1].id if len(result) > limit else None


@planning_bp.get("/workspace")
@jwt_required()
@consistent_planning_read
def get_workspace():
    owner = workspace()
    return jsonify(workspace=owner.to_dict() if owner else None, revision=owner.revision if owner else 0)


@planning_bp.get("/plans")
@jwt_required()
@consistent_planning_read
def plans():
    owner = workspace()
    records, cursor = page(PrivatePlan.query.filter_by(workspace_id=owner.id if owner else ""), PrivatePlan)
    return jsonify(plans=records, next_cursor=cursor, revision=owner.revision if owner else 0)


@planning_bp.get("/plans/<identity>")
@jwt_required()
@consistent_planning_read
def get_plan(identity):
    owner = workspace()
    plan = owned(PrivatePlan, identity, owner)
    return jsonify(plan=plan.to_dict(), revision=owner.revision)


@planning_bp.get("/plans/<identity>/meals")
@jwt_required()
@consistent_planning_read
def meals(identity):
    owner = workspace()
    plan = owned(PrivatePlan, identity, owner)
    records, cursor = page(PrivateMeal.query.filter_by(workspace_id=owner.id, plan_id=plan.id), PrivateMeal)
    return jsonify(meals=records, next_cursor=cursor, revision=owner.revision)


@planning_bp.get("/mutations/<mutation_id>")
@jwt_required()
@consistent_planning_read
def mutation_status(mutation_id):
    uuid(mutation_id)
    owner = workspace()
    receipt = PlanningMutation.query.filter_by(workspace_id=owner.id, mutation_id=mutation_id).first() if owner else None
    if receipt is None:
        raise PlanningError("not_found", "Mutation not found; completion is not established", 404)
    return jsonify(result=receipt.result, status_code=receipt.status_code)


def apply_command(owner, operation, payload):
    from planning_events import OPERATIONS as event_operations, apply as apply_event
    from planning_changes import OPERATIONS as change_operations, apply as apply_change
    from planning_items import OPERATIONS as item_operations, apply as apply_item
    from planning_repeat import OPERATIONS as repeat_operations, apply as apply_repeat
    from planning_shopping import OPERATIONS as shopping_operations, apply as apply_shopping
    from planning_templates import OPERATIONS as template_operations, apply as apply_template
    if operation == "preferences.update":
        from planning_preferences import apply as apply_preference
        return apply_preference(owner, operation, payload)
    if operation in shopping_operations:
        return apply_shopping(owner, operation, payload)
    if operation in template_operations:
        return apply_template(owner, operation, payload)
    if operation in repeat_operations:
        return apply_repeat(owner, operation, payload)
    if operation in item_operations:
        return apply_item(owner, operation, payload)
    if operation in event_operations:
        return apply_event(owner, operation, payload)
    if operation in change_operations:
        return apply_change(owner, operation, payload)
    if operation == "plan.create":
        if PrivatePlan.query.filter_by(workspace_id=owner.id).count() >= MAX_PLANS:
            raise PlanningError("limit_reached", "Maximum 500 saved plans reached", 409)
        row = PrivatePlan(workspace_id=owner.id, name=text(payload["name"]),
                          start_date=day(payload["start_date"]), end_date=day(payload["end_date"]))
        db.session.add(row)
        kind, status = "plan", 201
    elif operation == "plan.rename":
        row = owned(PrivatePlan, payload["plan_id"], owner)
        row.name = text(payload["name"])
        kind, status = "plan", 200
    elif operation == "meal.create":
        plan = owned(PrivatePlan, payload["plan_id"], owner)
        meal_day = day(payload["date"])
        if not plan.start_date <= meal_day <= plan.end_date:
            invalid("Meal date must be inside the plan range")
        query = PrivateMeal.query.filter_by(workspace_id=owner.id, plan_id=plan.id)
        if (PrivateMeal.query.filter_by(workspace_id=owner.id).count() >= MAX_WORKSPACE_MEALS
                or query.count() >= MAX_MEALS or query.filter_by(date=meal_day).count() >= MAX_DAY_MEALS):
            raise PlanningError("limit_reached", "Meal limit reached for this plan or day", 409)
        last = query.filter_by(date=meal_day).with_entities(db.func.max(PrivateMeal.position)).scalar()
        row = PrivateMeal(workspace_id=owner.id, plan_id=plan.id, date=meal_day,
                          name=text(payload.get("name"), optional=True), time=meal_time(payload.get("time")),
                          position=0 if last is None else last + 1)
        db.session.add(row)
        kind, status = "meal", 201
    else:
        row = owned(PrivateMeal, payload["meal_id"], owner)
        if "name" in payload:
            row.name = text(payload["name"], optional=True)
        if "time" in payload:
            row.time = meal_time(payload["time"])
        kind, status = "meal", 200
    db.session.flush()
    return {kind: row.to_dict()}, status


@planning_bp.post("/commands")
@jwt_required()
def command():
    data = command_body()  # before any write/lock/workspace creation
    user_id = int(get_jwt_identity())
    # Same first lock as reflection writes. Also serializes lazy workspace
    # creation and account deletion; there is never a read/insert race on owner.
    if not db.session.execute(db.update(User).where(User.id == user_id).values(id=User.id)).rowcount:
        raise PlanningError("invalid_session", "Authentication required", 401)
    owner = PlanningWorkspace.query.filter_by(user_id=user_id).with_for_update().populate_existing().first()
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")).hexdigest()
    receipt = PlanningMutation.query.filter_by(workspace_id=owner.id, mutation_id=data["mutation_id"]).first() if owner else None
    if receipt:
        if receipt.request_digest != digest:
            raise PlanningError("mutation_conflict", "Mutation ID was already used for different content", 409)
        result, status = receipt.result, receipt.status_code
        db.session.rollback()
        return jsonify(result), status
    revision = owner.revision if owner else 0
    if data["expected_workspace_revision"] != revision:
        raise PlanningError("revision_conflict", "Planning changed; reload and review before retrying", 409, current_revision=revision)
    if owner and PlanningMutation.query.filter_by(workspace_id=owner.id).count() >= MAX_MUTATIONS:
        raise PlanningError("limit_reached", "Planning command storage limit reached; existing retries remain available", 409)
    if owner and data["operation"] in {"preview.confirm", "shopping.cover"} and PlanningMutation.query.filter_by(workspace_id=owner.id).count() >= MAX_MUTATIONS - 1:
        raise PlanningError("limit_reached", "Not enough command storage to retain a removal and its undo", 409)
    if owner is None:
        owner = PlanningWorkspace(user_id=user_id, revision=0)
        db.session.add(owner)
        db.session.flush()
    coverage_before = None
    if data["operation"] == "shopping.cover":
        from planning_changes import MAX_SCOPE_INVERSE_BYTES
        coverage_before = owned(PrivateShoppingScope, data["payload"]["scope_id"], owner).to_dict()
        if len(json.dumps(coverage_before, ensure_ascii=False).encode('utf-8')) > MAX_SCOPE_INVERSE_BYTES:
            raise PlanningError("limit_reached", "This selection is too large to retain checkmark undo; select fewer meals", 409)
    # Selection cleanup changes no remaining recipe demand. It must stay usable
    # even when older saved selections exceed the current aggregate work budget.
    # Only server-owned preview/undo metadata can grant this narrow exception.
    selection_recovery = None
    if data["operation"] == "preview.confirm":
        pending = owned(PlanningPreview, data["payload"]["preview_id"], owner)
        if pending.operation == "shopping.scope.delete":
            selection_recovery = []
    elif data["operation"] == "undo.apply":
        pending = owned(PlanningUndo, data["payload"]["undo_id"], owner)
        if pending.inverse.get("operation") == "shopping.scope.delete":
            selection_recovery = [row["id"] for row in pending.inverse["snapshot"]["shopping_scopes"]]
    result, status = apply_command(owner, data["operation"], data["payload"])
    preference_only = data["operation"] == "preferences.update"
    if not preference_only:
        from planning_shopping import reconcile, reconcile_scope, project, check_record
        if selection_recovery is None:
            reconcile(owner, allow_invalidated=data["operation"] == "preview.confirm")
        else:
            for scope_id in selection_recovery:
                restored = owned(PrivateShoppingScope, scope_id, owner)
                check_record(restored)
                # Restoring previously accepted state is not a content-access
                # grant. Strict projection rejects unavailable current sources.
                project(owner, restored)
                reconcile_scope(owner, restored)
        owner.revision += 1
    if coverage_before is not None:
        from planning_changes import TTL
        PlanningUndo.query.filter_by(workspace_id=owner.id).delete(synchronize_session=False)
        inverse = PlanningUndo(workspace_id=owner.id, revision=owner.revision,
            inverse={"operation": "shopping.cover", "snapshot": {"shopping_scopes": [coverage_before]},
                     "replace_scope_ids": [coverage_before["id"]]}, expires_at=datetime.utcnow() + TTL)
        db.session.add(inverse)
        db.session.flush()
        result.update(undo_id=inverse.id, undo_expires_at=inverse.expires_at.isoformat() + "Z")
    # Only the exact immediately succeeding mutation may be undone. Scrub older
    # inverse contents immediately, including when a normal edit follows removal.
    if not preference_only:
        PlanningUndo.query.filter(PlanningUndo.workspace_id == owner.id,
                                  PlanningUndo.revision != owner.revision).delete(synchronize_session=False)
    result["revision"] = owner.revision
    db.session.add(PlanningMutation(workspace_id=owner.id, mutation_id=data["mutation_id"],
                                    request_digest=digest, result=result, status_code=status))
    db.session.commit()
    return jsonify(result), status


@planning_bp.get("/shopping/scopes")
@jwt_required()
@consistent_planning_read
def shopping_scopes():
    owner = workspace()
    rows, cursor = page(PrivateShoppingScope.query.filter_by(workspace_id=owner.id if owner else ""), PrivateShoppingScope)
    # Allocation state belongs to the checked projection, not this selector.
    return jsonify(scopes=[{**{k: v for k, v in row.items() if k != "state"},
                           "owner_type": "plan" if row["plan_id"] else "event", "owner_id": row["plan_id"] or row["event_id"]} for row in rows],
                   next_cursor=cursor, revision=owner.revision if owner else 0)


@planning_bp.get("/shopping/scopes/<identity>")
@jwt_required()
@consistent_planning_read
def shopping_projection(identity):
    if request.args:
        invalid("Shopping projection accepts no query fields")
    from planning_shopping import project
    owner = workspace()
    scope = owned(PrivateShoppingScope, identity, owner)
    result = project(owner, scope)
    return jsonify({**result, "revision": owner.revision})


@planning_bp.get("/templates")
@jwt_required()
@consistent_planning_read
def templates():
    owner = workspace()
    rows, cursor = page(PrivatePlanningTemplate.query.filter_by(workspace_id=owner.id if owner else ""), PrivatePlanningTemplate)
    # Selectors need the private name/kind only. A blueprint is never a content
    # access grant; application resolves every pinned configuration afresh.
    return jsonify(templates=[{k: v for k, v in row.items() if k != "blueprint"} for row in rows],
                   next_cursor=cursor, revision=owner.revision if owner else 0)


@planning_bp.get("/preferences")
@jwt_required()
@consistent_planning_read
def preferences():
    if request.args:
        invalid("Preferences accept no query fields")
    from planning_preferences import get_preferences
    owner = workspace()
    return jsonify({**get_preferences(owner), "revision": owner.revision if owner else 0})


@planning_bp.get("/events")
@jwt_required()
@consistent_planning_read
def events():
    owner = workspace()
    rows, cursor = page(PrivateEvent.query.filter_by(workspace_id=owner.id if owner else ""), PrivateEvent)
    return jsonify(events=rows, revision=owner.revision if owner else 0, next_cursor=cursor)


@planning_bp.get("/events/<identity>")
@jwt_required()
@consistent_planning_read
def event(identity):
    owner = workspace()
    row = owned(PrivateEvent, identity, owner)
    return jsonify(event=row.to_dict(), revision=owner.revision)


@planning_bp.get("/events/<identity>/tasks")
@jwt_required()
@consistent_planning_read
def tasks(identity):
    owner = workspace()
    row = owned(PrivateEvent, identity, owner)
    rows, cursor = page(PrivatePreparationTask.query.filter_by(workspace_id=owner.id, event_id=row.id), PrivatePreparationTask)
    return jsonify(tasks=rows, revision=owner.revision, next_cursor=cursor)


@planning_bp.get("/plans/<identity>/events")
@jwt_required()
@consistent_planning_read
def plan_events(identity):
    owner = workspace()
    plan = owned(PrivatePlan, identity, owner)
    links, cursor = page(PrivateEventLink.query.filter_by(workspace_id=owner.id, plan_id=plan.id), PrivateEventLink)
    by_id = {e.id: e for e in PrivateEvent.query.filter(PrivateEvent.workspace_id == owner.id,
             PrivateEvent.id.in_([link["event_id"] for link in links])).all()}
    for link in links:
        linked = by_id[link["event_id"]]
        link.update(event=linked.to_dict(), in_range=plan.start_date <= linked.date <= plan.end_date)
    return jsonify(links=links, revision=owner.revision, next_cursor=cursor)


@planning_bp.post("/previews")
@jwt_required()
def preview():
    from planning_changes import create_preview
    data = json_body()
    keys(data, ("operation", "payload", "expected_workspace_revision"))
    revision = data["expected_workspace_revision"]
    if type(revision) is not int or not 0 <= revision < 2147483647:
        invalid("Nonnegative expected_workspace_revision required")
    user_id = int(get_jwt_identity())
    if not db.session.execute(db.update(User).where(User.id == user_id).values(id=User.id)).rowcount:
        raise PlanningError("invalid_session", "Authentication required", 401)
    owner = PlanningWorkspace.query.filter_by(user_id=user_id).with_for_update().populate_existing().first()
    if owner is None:
        raise PlanningError("not_found", "Planning record not found", 404)
    if revision != owner.revision:
        raise PlanningError("revision_conflict", "Planning changed; reload and review", 409, current_revision=owner.revision)
    result = create_preview(owner, data["operation"], data["payload"])
    db.session.commit()
    return jsonify(preview=result, revision=owner.revision), 201


@planning_bp.delete("/previews/<identity>")
@jwt_required()
def cancel_preview(identity):
    # Cancellation discards only a proposal, never changes domain state/revision.
    owner = workspace()
    row = owned(PlanningPreview, identity, owner)
    db.session.delete(row)
    db.session.commit()
    return jsonify(cancelled=True)


@planning_bp.get("/meals/<identity>/items")
@jwt_required()
@consistent_planning_read
def meal_items(identity):
    return item_list("meal", identity)


@planning_bp.get("/events/<identity>/items")
@jwt_required()
@consistent_planning_read
def event_items(identity):
    return item_list("event", identity)


def item_list(kind, identity):
    from planning_items import parent
    owner = workspace()
    _, query = parent(owner, kind, identity)
    rows, cursor = page(query, PrivatePlannedItem)
    return jsonify(items=rows, revision=owner.revision, next_cursor=cursor)


@planning_bp.get("/items/<identity>/preview")
@jwt_required()
@consistent_planning_read
def item_preview(identity):
    from planning_items import resolve_item
    owner = workspace()
    row = owned(PrivatePlannedItem, identity, owner)
    return jsonify(item=row.to_dict(), preview=resolve_item(row, owner) if row.kind == "dish" else None, revision=owner.revision)
