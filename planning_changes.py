"""Bounded, owner-bound destructive proposals and exact-successor restoration.

Only the currently implemented entities participate. New dependent tables must
extend effects/removal/restoration here before their feature is exposed.
"""
import json
from datetime import datetime, timedelta

from app import db
from planning_models import (PrivatePlan, PrivateMeal, PrivateEvent, PrivateEventLink,
                             PrivatePreparationTask, PlanningPreview, PlanningUndo)
from planning_item_models import PrivatePlannedItem
from planning_shopping_models import PrivateShoppingScope
from planning_template_models import PrivatePlanningTemplate

OPERATIONS = {"preview.confirm", "undo.apply", "meal.move", "meal.copy"}
DESTRUCTIVE = {"plan.delete", "plan.resize", "meal.delete", "event.delete", "task.delete", "event.unlink", "item.delete", "meal.move", "template.delete", "shopping.personal.delete", "shopping.scope.delete"}
MAX_INVERSE_BYTES = 256 * 1024
# A valid saved scope can exceed the general multi-record inverse limit. Keep
# individual cleanup and coverage reversible without evicting saved selections.
MAX_SCOPE_INVERSE_BYTES = 2 * 1024 * 1024
TTL = timedelta(minutes=10)
MODELS = {"plans": PrivatePlan, "meals": PrivateMeal, "events": PrivateEvent,
          "links": PrivateEventLink, "tasks": PrivatePreparationTask, "items": PrivatePlannedItem,
          "shopping_scopes": PrivateShoppingScope, "templates": PrivatePlanningTemplate}


def validate(operation, payload):
    from routes.planning import keys, uuid, day
    if operation == "preview.confirm":
        keys(payload, ("preview_id",))
        uuid(payload["preview_id"])
    elif operation == "undo.apply":
        keys(payload, ("undo_id",))
        uuid(payload["undo_id"])
    else:
        keys(payload, ("meal_id", "plan_id", "date"))
        uuid(payload["meal_id"])
        uuid(payload["plan_id"])
        day(payload["date"])


def capture(owner, operation, payload):
    from routes.planning import keys, owned, day, invalid
    if not isinstance(operation, str) or operation not in DESTRUCTIVE:
        invalid("Unsupported preview operation")
    rows = {name: [] for name in MODELS}
    if operation == "shopping.scope.delete":
        keys(payload, ("scope_id",))
        row = owned(PrivateShoppingScope, payload["scope_id"], owner)
        rows["shopping_scopes"] = [row]
        row = None
    elif operation == "shopping.personal.delete":
        from planning_shopping import validate as validate_shopping, validate_personal_delete
        validate_shopping(operation, payload)
        validate_personal_delete(owner, payload)
        row = None
    elif operation == "meal.move":
        validate(operation, payload)
        row = owned(PrivateMeal, payload["meal_id"], owner)
        target = owned(PrivatePlan, payload["plan_id"], owner)
        if not target.start_date <= day(payload["date"]) <= target.end_date:
            invalid("Meal date must be inside the plan range")
        rows["meals"] = [row]
        row = None
    else:
        field, model = {"plan.delete": ("plan_id", PrivatePlan), "plan.resize": ("plan_id", PrivatePlan),
                    "meal.delete": ("meal_id", PrivateMeal), "event.delete": ("event_id", PrivateEvent),
                    "task.delete": ("task_id", PrivatePreparationTask), "event.unlink": ("link_id", PrivateEventLink),
                    "item.delete": ("item_id", PrivatePlannedItem),
                    "template.delete": ("template_id", PrivatePlanningTemplate)}[operation]
        keys(payload, (field, "start_date", "end_date") if operation == "plan.resize" else (field,))
        row = owned(model, payload[field], owner)
    if isinstance(row, PrivatePlan):
        rows["plans"] = [row]
        query = PrivateMeal.query.filter_by(workspace_id=owner.id, plan_id=row.id)
        if operation == "plan.resize":
            start, end = day(payload["start_date"]), day(payload["end_date"])
            if not 0 <= (end - start).days < 730:
                invalid("Plan range must contain 1 to 730 days")
            query = query.filter(db.or_(PrivateMeal.date < start, PrivateMeal.date > end))
        else:
            rows["links"] = PrivateEventLink.query.filter_by(workspace_id=owner.id, plan_id=row.id).all()
        rows["meals"] = query.all()
    elif isinstance(row, PrivateEvent):
        rows["events"] = [row]
        rows["links"] = PrivateEventLink.query.filter_by(workspace_id=owner.id, event_id=row.id).all()
        rows["tasks"] = PrivatePreparationTask.query.filter_by(workspace_id=owner.id, event_id=row.id).all()
    elif row is not None:
        rows[next(key for key, cls in MODELS.items() if isinstance(row, cls))] = [row]
    if operation != "meal.move" and (rows["meals"] or rows["events"]):
        rows["items"] = PrivatePlannedItem.query.filter(PrivatePlannedItem.workspace_id == owner.id,
            db.or_(PrivatePlannedItem.meal_id.in_([m.id for m in rows["meals"]]),
                   PrivatePlannedItem.event_id.in_([e.id for e in rows["events"]]))).all()
    # Capture only scopes whose demand/identity can change. An unrelated large
    # shopping selection must not prevent deleting a reminder or a template.
    # Include both ends of a move and every plan referencing an affected event.
    plan_ids = {record.id for record in rows["plans"]}
    plan_ids.update(record.plan_id for record in rows["meals"])
    plan_ids.update(record.plan_id for record in rows["links"])
    event_ids = {record.id for record in rows["events"]}
    event_ids.update(record.event_id for record in rows["items"] if record.event_id)
    meal_ids = {record.meal_id for record in rows["items"] if record.meal_id}
    if meal_ids:
        plan_ids.update(record.plan_id for record in PrivateMeal.query.filter(
            PrivateMeal.workspace_id == owner.id, PrivateMeal.id.in_(meal_ids)).all())
    if event_ids:
        plan_ids.update(record.plan_id for record in PrivateEventLink.query.filter(
            PrivateEventLink.workspace_id == owner.id, PrivateEventLink.event_id.in_(event_ids)).all())
    if operation == "meal.move":
        plan_ids.add(payload["plan_id"])
    scopes = PrivateShoppingScope.query.filter_by(workspace_id=owner.id)
    if operation in {"shopping.personal.delete", "shopping.scope.delete"}:
        rows["shopping_scopes"] = scopes.filter_by(id=payload["scope_id"]).all()
    elif plan_ids or event_ids:
        rows["shopping_scopes"] = scopes.filter(db.or_(
            PrivateShoppingScope.plan_id.in_(plan_ids), PrivateShoppingScope.event_id.in_(event_ids))).all()
    snapshot = {name: [r.to_dict() for r in sorted(values, key=lambda v: v.id)] for name, values in rows.items()}
    single_scope = operation in {"shopping.personal.delete", "shopping.scope.delete"}
    limit = MAX_SCOPE_INVERSE_BYTES if single_scope else MAX_INVERSE_BYTES
    if len(json.dumps(snapshot, ensure_ascii=not single_scope).encode('utf-8')) > limit:
        from routes.planning import PlanningError
        raise PlanningError("limit_reached", "Too many affected records; remove smaller groups first", 409)
    return snapshot


def effects_for(owner, operation, payload):
    snapshot = capture(owner, operation, payload)
    # Effects are exact record identities, not optimistic client-supplied summaries.
    effects = {"affected": snapshot, "events_preserved": operation in {"plan.delete", "plan.resize", "event.unlink"}}
    removed_meals = {row["id"] for row in snapshot["meals"]} if operation != "meal.move" else set()
    removed_events = {row["id"] for row in snapshot["events"]}
    removed_plans = {row["id"] for row in snapshot["plans"]} if operation == "plan.delete" else set()
    removed_links = {(row["plan_id"], row["event_id"]) for row in snapshot["links"]}
    effects["removed_shopping_selections"] = []
    for scope in snapshot["shopping_scopes"]:
        invalid_scope = operation == "shopping.scope.delete" or scope["plan_id"] in removed_plans or scope["event_id"] in removed_events
        if scope["mode"] == "dates" and operation == "plan.resize" and scope["plan_id"] == payload["plan_id"]:
            invalid_scope = not payload["start_date"] <= scope["start_date"] <= scope["end_date"] <= payload["end_date"]
        if scope["mode"] == "meals":
            for reference in scope["selection"]:
                kind, identity = reference.split(":", 1)
                invalid_scope |= (kind == "meal" and identity in removed_meals) or (kind == "event" and (identity in removed_events or (scope["plan_id"], identity) in removed_links))
                invalid_scope |= (operation == "meal.move" and kind == "meal" and identity == payload["meal_id"] and scope["plan_id"] != payload["plan_id"])
        if invalid_scope:
            model, identity = (PrivatePlan, scope["plan_id"]) if scope["plan_id"] else (PrivateEvent, scope["event_id"])
            parent = model.query.filter_by(workspace_id=owner.id, id=identity).first()
            state = scope["state"]
            effects["removed_shopping_selections"].append({"id": scope["id"], "name": parent.name if parent else identity,
                "mode": scope["mode"], "selection": scope["selection"], "start_date": scope["start_date"], "end_date": scope["end_date"],
                "coverage_count": sum(len(row["sources"]) for row in state["rows"].values()),
                "extra_count": sum(1 for row in state["rows"].values() if row["extra"] not in ("0", "0.000")),
                "personal_count": len(state["personal"])})
    if operation == "plan.resize":
        start, end = payload["start_date"], payload["end_date"]
        links = PrivateEventLink.query.filter_by(workspace_id=owner.id, plan_id=payload["plan_id"]).all()
        effects["linked_events_outside_range"] = [e.to_dict() for e in PrivateEvent.query.filter(
            PrivateEvent.workspace_id == owner.id, PrivateEvent.id.in_([link.event_id for link in links])).order_by(PrivateEvent.id).all()
            if not start <= e.date.isoformat() <= end]
    return effects


def create_preview(owner, operation, payload):
    from routes.planning import PlanningError
    effects = effects_for(owner, operation, payload)
    now = datetime.utcnow()
    PlanningPreview.query.filter(PlanningPreview.workspace_id == owner.id, PlanningPreview.expires_at <= now).delete(synchronize_session=False)
    if PlanningPreview.query.filter_by(workspace_id=owner.id).count() >= 20:
        raise PlanningError("limit_reached", "Close a previous confirmation or wait for it to expire", 409)
    preview = PlanningPreview(workspace_id=owner.id, revision=owner.revision, operation=operation,
                              payload=payload, effects=effects, expires_at=now + TTL)
    db.session.add(preview)
    db.session.flush()
    return preview.to_dict()


def apply(owner, operation, payload):
    from routes.planning import owned, day, invalid, PlanningError, MAX_MEALS, MAX_DAY_MEALS, MAX_WORKSPACE_MEALS
    if operation in {"meal.move", "meal.copy"}:
        row = owned(PrivateMeal, payload["meal_id"], owner)
        target = owned(PrivatePlan, payload["plan_id"], owner)
        target_day = day(payload["date"])
        if not target.start_date <= target_day <= target.end_date:
            invalid("Meal date must be inside the plan range")
        moving = operation == "meal.move"
        if moving and row.plan_id == target.id and row.date == target_day:
            return {"meal": row.to_dict()}, 200
        query = PrivateMeal.query.filter_by(workspace_id=owner.id, plan_id=target.id)
        if (query.filter_by(date=target_day).count() >= MAX_DAY_MEALS or
            ((not moving or row.plan_id != target.id) and query.count() >= MAX_MEALS) or
            (not moving and PrivateMeal.query.filter_by(workspace_id=owner.id).count() >= MAX_WORKSPACE_MEALS)):
            raise PlanningError("limit_reached", "Meal limit reached", 409)
        position = query.filter_by(date=target_day).with_entities(db.func.max(PrivateMeal.position)).scalar()
        if not moving:
            original_id = row.id
            row = PrivateMeal(workspace_id=owner.id, name=row.name, time=row.time)
            db.session.add(row)
        row.plan_id, row.date, row.position = target.id, target_day, 0 if position is None else position + 1
        db.session.flush()
        if not moving:
            from planning_items import copy_items
            copy_items(owner, PrivatePlannedItem.query.filter_by(workspace_id=owner.id, meal_id=original_id).order_by(PrivatePlannedItem.position).all(), meal_id=row.id)
        return {"meal": row.to_dict()}, 200 if moving else 201
    if operation == "undo.apply":
        token = owned(PlanningUndo, payload["undo_id"], owner)
        if token.revision != owner.revision or token.expires_at <= datetime.utcnow():
            raise PlanningError("undo_expired", "Undo is no longer available after another change or ten minutes", 409)
        inverse = token.inverse
        # Parent rows first, then dependent rows; never replace the workspace.
        for name in ("plans", "events", "meals", "links", "tasks", "items", "templates", "shopping_scopes"):
            if name == "shopping_scopes" and name in inverse["snapshot"]:
                scopes = PrivateShoppingScope.query.filter_by(workspace_id=owner.id)
                if "replace_scope_ids" in inverse:
                    scopes = scopes.filter(PrivateShoppingScope.id.in_(inverse["replace_scope_ids"]))
                scopes.delete(synchronize_session=False)
                db.session.flush()
            for record in inverse["snapshot"].get(name, []):
                values = dict(record)
                for key in ("date", "start_date", "end_date"):
                    if key in values and values[key] is not None:
                        values[key] = day(values[key])
                if "created_at" in values:
                    values["created_at"] = datetime.fromisoformat(values["created_at"])
                if inverse["operation"] == "plan.resize" and name == "plans":
                    row = owned(PrivatePlan, values["id"], owner)
                    row.start_date, row.end_date = values["start_date"], values["end_date"]
                elif inverse["operation"] == "meal.move" and name == "meals":
                    row = owned(PrivateMeal, values["id"], owner)
                    row.plan_id, row.date, row.position = values["plan_id"], values["date"], values["position"]
                else:
                    if name == "templates":
                        from planning_templates import validate_template_access
                        with db.session.no_autoflush:
                            validate_template_access(owner, values["blueprint"], values["kind"])
                    if name == "items" and values["kind"] == "dish":
                        from planning_items import resolve_item
                        with db.session.no_autoflush:
                            resolve_item(PrivatePlannedItem(**values), owner)
                    db.session.add(MODELS[name](workspace_id=owner.id, **values))
            db.session.flush()
        db.session.delete(token)
        return {"restored": True}, 200
    preview = owned(PlanningPreview, payload["preview_id"], owner)
    if preview.revision != owner.revision or preview.expires_at <= datetime.utcnow():
        raise PlanningError("preview_expired", "Planning changed or confirmation expired; review again", 409)
    effects = effects_for(owner, preview.operation, preview.payload)
    if effects != preview.effects:
        raise PlanningError("preview_expired", "Affected records changed; review again", 409)
    snapshot = effects["affected"]
    if preview.operation == "meal.move":
        apply(owner, "meal.move", preview.payload)
    elif preview.operation in {"shopping.personal.delete", "shopping.scope.delete"}:
        from planning_shopping import apply as apply_shopping
        apply_shopping(owner, preview.operation, preview.payload)
    for name in (() if preview.operation in {"meal.move", "shopping.personal.delete", "shopping.scope.delete"} else ("items", "tasks", "links", "meals", "events", "plans", "templates")):
        if name == "plans" and preview.operation == "plan.resize":
            row = owned(PrivatePlan, preview.payload["plan_id"], owner)
            row.start_date, row.end_date = day(preview.payload["start_date"]), day(preview.payload["end_date"])
        else:
            ids = [record["id"] for record in snapshot[name]]
            if ids:
                MODELS[name].query.filter(MODELS[name].workspace_id == owner.id, MODELS[name].id.in_(ids)).delete(synchronize_session=False)
    PlanningUndo.query.filter_by(workspace_id=owner.id).delete(synchronize_session=False)
    inverse = PlanningUndo(workspace_id=owner.id, revision=owner.revision + 1,
                           inverse={"operation": preview.operation, "snapshot": snapshot,
                                    "replace_scope_ids": [scope["id"] for scope in snapshot["shopping_scopes"]]},
                           expires_at=datetime.utcnow() + TTL)
    db.session.add(inverse)
    db.session.delete(preview)
    db.session.flush()
    return {"applied": True, "undo_id": inverse.id, "undo_expires_at": inverse.expires_at.isoformat() + "Z"}, 200
