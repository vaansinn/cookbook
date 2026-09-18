"""Private event commands inside the caller's locked planning transaction.

The command route owns workspace creation, revision, receipts and commit/rollback.
Links reference a live event, even outside a linked plan's calendar range.
Removal/undo belong to planning_changes; event copying is not exposed here.
"""

OPERATIONS = {
    "event.create", "event.update", "event.link",
    "task.create", "task.update",
}
MAX_EVENTS = 500
MAX_LINKS = 2000
MAX_EVENT_TASKS = 500
MAX_WORKSPACE_TASKS = 10000
BUCKETS = ("earlier", "day", "serving")


def validate(operation, payload):
    """Validate the complete payload without database access or mutation."""
    from routes.planning import keys, uuid, text, day, meal_time, invalid

    if not isinstance(operation, str) or operation not in OPERATIONS:
        invalid("Unsupported planning operation")

    if operation in ("event.create", "event.update"):
        if operation == "event.create":
            keys(payload, ("name", "date"), ("time", "guests"))
        else:
            keys(payload, ("event_id",), ("name", "date", "time", "guests"))
            uuid(payload["event_id"])
            if not {"name", "date", "time", "guests"} & set(payload):
                invalid("An event field is required")
        if "name" in payload:
            text(payload["name"])
        if "date" in payload:
            day(payload["date"])
        if "time" in payload:
            meal_time(payload["time"])
        if "guests" in payload:
            if type(payload["guests"]) is not int or not 1 <= payload["guests"] <= 1000:
                invalid("Guests must be an integer from 1 to 1000")
    elif operation == "event.link":
        keys(payload, ("plan_id", "event_id"))
        uuid(payload["plan_id"])
        uuid(payload["event_id"])
    else:
        if operation == "task.create":
            keys(payload, ("event_id", "bucket", "text"))
            uuid(payload["event_id"])
        else:
            keys(payload, ("task_id",), ("bucket", "text", "done"))
            uuid(payload["task_id"])
            if not {"bucket", "text", "done"} & set(payload):
                invalid("A task field is required")
        if "bucket" in payload:
            if not isinstance(payload["bucket"], str) or payload["bucket"] not in BUCKETS:
                invalid("Task bucket must be earlier, day or serving")
        if "text" in payload:
            text(payload["text"])
        if "done" in payload and type(payload["done"]) is not bool:
            invalid("Task done must be a boolean")


def apply(owner, operation, payload):
    """Apply one validated command; return its result/status without committing.

    The caller must already hold the account/workspace locks and roll back on
    failure. Revalidate before assigning fields so direct callers cannot partially
    mutate an object with an invalid multi-field edit.
    """
    validate(operation, payload)
    from app import db
    from planning_models import PrivateEvent, PrivateEventLink, PrivatePlan, PrivatePreparationTask
    from routes.planning import text, day, meal_time, owned, PlanningError

    if operation == "event.create":
        if PrivateEvent.query.filter_by(workspace_id=owner.id).count() >= MAX_EVENTS:
            raise PlanningError("limit_reached", "Event limit reached for this workspace", 409)
        row = PrivateEvent(
            workspace_id=owner.id, name=text(payload["name"]), date=day(payload["date"]),
            time=meal_time(payload.get("time")), guests=payload.get("guests", 2),
        )
        db.session.add(row)
        kind, status = "event", 201
    elif operation == "event.update":
        row = owned(PrivateEvent, payload["event_id"], owner)
        if "name" in payload:
            row.name = text(payload["name"])
        if "date" in payload:
            row.date = day(payload["date"])
        if "time" in payload:
            row.time = meal_time(payload["time"])
        if "guests" in payload:
            row.guests = payload["guests"]
            from planning_item_models import PrivatePlannedItem
            # Only followers change; historic cook/recipe content is untouched.
            from planning_items import resolve_item
            with db.session.no_autoflush:
                for item in PrivatePlannedItem.query.filter_by(workspace_id=owner.id, event_id=row.id, follows_guests=True):
                    item.servings = row.guests
                    resolve_item(item, owner)
        kind, status = "event", 200
    elif operation == "event.link":
        plan = owned(PrivatePlan, payload["plan_id"], owner)
        event = owned(PrivateEvent, payload["event_id"], owner)
        query = PrivateEventLink.query.filter_by(workspace_id=owner.id)
        row = query.filter_by(plan_id=plan.id, event_id=event.id).first()
        # An existing pair remains an accepted command at the link quota. The
        # caller advances revision normally for this fresh mutation, unlike replay.
        if row is not None:
            return {"link": row.to_dict()}, 200
        if query.count() >= MAX_LINKS:
            raise PlanningError("limit_reached", "Event link limit reached for this workspace", 409)
        row = PrivateEventLink(workspace_id=owner.id, plan_id=plan.id, event_id=event.id)
        db.session.add(row)
        kind, status = "link", 201
    elif operation == "task.create":
        event = owned(PrivateEvent, payload["event_id"], owner)
        query = PrivatePreparationTask.query.filter_by(workspace_id=owner.id)
        event_tasks = query.filter_by(event_id=event.id)
        if query.count() >= MAX_WORKSPACE_TASKS or event_tasks.count() >= MAX_EVENT_TASKS:
            raise PlanningError("limit_reached", "Preparation task limit reached for this event or workspace", 409)
        last = event_tasks.with_entities(db.func.max(PrivatePreparationTask.position)).scalar()
        row = PrivatePreparationTask(
            workspace_id=owner.id, event_id=event.id, bucket=payload["bucket"],
            text=text(payload["text"]), done=False, position=0 if last is None else last + 1,
        )
        db.session.add(row)
        kind, status = "task", 201
    else:  # task.update; validate rejects every unsupported operation above.
        row = owned(PrivatePreparationTask, payload["task_id"], owner)
        if "bucket" in payload:
            row.bucket = payload["bucket"]
        if "text" in payload:
            row.text = text(payload["text"])
        if "done" in payload:
            row.done = payload["done"]
        kind, status = "task", 200
    db.session.flush()
    return {kind: row.to_dict()}, status
