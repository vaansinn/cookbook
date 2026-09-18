"""Independent repeat occasions inside the caller's locked command transaction.

Preflight the complete source graph, shifted dates, quotas and catalog selections
before adding any copy. Only domain records are cloned; revisions, receipts,
previews and undo remain the command coordinator's responsibility.

plan.copy preserves the inclusive range length, relative meal/event dates,
positions and meal names/times. Each distinct linked event becomes one new
occasion, including links outside the range; new links belong only to the copy.
event.copy preserves time and guests, takes the requested name/date and creates
no links. Both copy full item selections/options, serving overrides/following,
groups, contributions and personal quantities. Task text/bucket/position survive,
but every copied task starts done=False. All children receive independent IDs;
no source record, recipe content, receipt, preview or undo record is copied over.
"""
from collections import Counter
from copy import deepcopy
from datetime import timedelta


OPERATIONS = {"plan.copy", "event.copy"}


def validate(operation, payload):
    """Validate the closed request shape without database access."""
    from routes.planning import keys, uuid, text, day, invalid
    if not isinstance(operation, str) or operation not in OPERATIONS:
        invalid("Unsupported planning operation")
    identity, date_field = ("plan_id", "start_date") if operation == "plan.copy" else ("event_id", "date")
    keys(payload, (identity, "name", date_field))
    uuid(payload[identity])
    text(payload["name"])
    day(payload[date_field])


def _shift(value, offset):
    from routes.planning import invalid
    try:
        return value + timedelta(days=offset)
    except (OverflowError, ValueError):
        invalid("Copied dates must remain between 0001-01-01 and 9999-12-31")


def _clone(model, owner, source, **changes):
    """Clone native values, including detached JSON; never reuse identity/history."""
    from planning_models import new_id
    values = {column.name: deepcopy(getattr(source, column.name)) for column in model.__table__.columns
              if column.name not in {"id", "workspace_id", "created_at"}}
    return model(id=new_id(), workspace_id=owner.id, **{**values, **changes})


def _check_limits(owner, plan, meals, events, tasks, items):
    from planning_models import PrivatePlan, PrivateMeal, PrivateEvent, PrivateEventLink, PrivatePreparationTask
    from planning_item_models import PrivatePlannedItem
    from routes.planning import MAX_PLANS, MAX_MEALS, MAX_DAY_MEALS, MAX_WORKSPACE_MEALS, PlanningError
    from planning_events import MAX_EVENTS, MAX_LINKS, MAX_EVENT_TASKS, MAX_WORKSPACE_TASKS
    from planning_items import MAX_ITEMS, MAX_PARENT_ITEMS

    counts = {"plans": int(plan is not None), "meals": len(meals), "events": len(events),
              "links": len(events) if plan is not None else 0, "tasks": len(tasks), "items": len(items)}
    capacities = ((PrivatePlan, "plans", MAX_PLANS), (PrivateMeal, "meals", MAX_WORKSPACE_MEALS),
                  (PrivateEvent, "events", MAX_EVENTS), (PrivateEventLink, "links", MAX_LINKS),
                  (PrivatePreparationTask, "tasks", MAX_WORKSPACE_TASKS), (PrivatePlannedItem, "items", MAX_ITEMS))
    for model, key, limit in capacities:
        if counts[key] and model.query.filter_by(workspace_id=owner.id).count() + counts[key] > limit:
            raise PlanningError("limit_reached", "Copy exceeds the workspace " + key + " limit", 409)
    per_day = Counter(row.date for row in meals)
    per_event = Counter(row.event_id for row in tasks)
    per_parent = Counter((row.meal_id, row.event_id) for row in items)
    if (len(meals) > MAX_MEALS or any(count > MAX_DAY_MEALS for count in per_day.values())
            or any(count > MAX_EVENT_TASKS for count in per_event.values())
            or any(count > MAX_PARENT_ITEMS for count in per_parent.values())):
        raise PlanningError("limit_reached", "Copy exceeds a plan, day, event or item-parent limit", 409)
    return counts


def apply(owner, operation, payload):
    """Return a compact 201 result; caller supplies locking and atomic commit."""
    validate(operation, payload)
    from app import db
    from planning_models import PrivatePlan, PrivateMeal, PrivateEvent, PrivateEventLink, PrivatePreparationTask
    from planning_item_models import PrivatePlannedItem
    from planning_items import resolve_item
    from routes.planning import owned, day, text, invalid, PlanningError

    # No query here may flush a partly built graph. All fallible preflight work
    # precedes db.session.add, including revalidation of every pinned recipe.
    with db.session.no_autoflush:
        plan, meals = None, []
        if operation == "plan.copy":
            plan = owned(PrivatePlan, payload["plan_id"], owner)
            if not 0 <= (plan.end_date - plan.start_date).days < 730:
                invalid("Plan range must contain 1 to 730 days")
            start = day(payload["start_date"])
            offset = (start - plan.start_date).days
            end = _shift(plan.end_date, offset)
            meals = PrivateMeal.query.filter_by(workspace_id=owner.id, plan_id=plan.id).order_by(
                PrivateMeal.date, PrivateMeal.position, PrivateMeal.id).all()
            links = PrivateEventLink.query.filter_by(workspace_id=owner.id, plan_id=plan.id).all()
            # The database enforces pair uniqueness; deduplication also makes the
            # one-copy-per-occasion rule explicit without copying unrelated links.
            event_ids = {link.event_id for link in links}
            events = PrivateEvent.query.filter(PrivateEvent.workspace_id == owner.id,
                                               PrivateEvent.id.in_(event_ids)).order_by(PrivateEvent.id).all()
            if {event.id for event in events} != event_ids:
                raise PlanningError("not_found", "Planning record not found", 404)
            if any(not plan.start_date <= meal.date <= plan.end_date for meal in meals):
                invalid("Meal date must be inside the plan range")
        else:
            source = owned(PrivateEvent, payload["event_id"], owner)
            events = [source]
            offset = (day(payload["date"]) - source.date).days
            event_ids = {source.id}
        meal_dates = {meal.id: _shift(meal.date, offset) for meal in meals}
        event_dates = {event.id: _shift(event.date, offset) for event in events}
        tasks = PrivatePreparationTask.query.filter(PrivatePreparationTask.workspace_id == owner.id,
                    PrivatePreparationTask.event_id.in_(event_ids)).order_by(
                        PrivatePreparationTask.event_id, PrivatePreparationTask.position).all()
        items = PrivatePlannedItem.query.filter(PrivatePlannedItem.workspace_id == owner.id,
                    db.or_(PrivatePlannedItem.meal_id.in_([meal.id for meal in meals]),
                           PrivatePlannedItem.event_id.in_(event_ids))).order_by(PrivatePlannedItem.id).all()
        counts = _check_limits(owner, plan, meals, events, tasks, items)
        for item in items:
            if item.kind == "dish":
                resolve_item(item, owner)

    copied_plan = _clone(PrivatePlan, owner, plan, name=text(payload["name"]), start_date=start,
                         end_date=end) if plan is not None else None
    copied_events = {
        event.id: _clone(PrivateEvent, owner, event, date=event_dates[event.id],
                         name=text(payload["name"]) if plan is None else event.name)
        for event in events
    }
    parents = list(copied_events.values()) + ([copied_plan] if copied_plan is not None else [])
    db.session.add_all(parents)
    db.session.flush()
    copied_meals = {
        meal.id: _clone(PrivateMeal, owner, meal, plan_id=copied_plan.id, date=meal_dates[meal.id])
        for meal in meals
    }
    db.session.add_all(list(copied_meals.values()))
    db.session.add_all([
        _clone(PrivatePreparationTask, owner, task, event_id=copied_events[task.event_id].id, done=False)
        for task in tasks
    ])
    if copied_plan is not None:
        db.session.add_all([PrivateEventLink(workspace_id=owner.id, plan_id=copied_plan.id, event_id=event.id)
                            for event in copied_events.values()])
    db.session.flush()
    db.session.add_all([
        _clone(PrivatePlannedItem, owner, item,
               meal_id=copied_meals[item.meal_id].id if item.meal_id is not None else None,
               event_id=copied_events[item.event_id].id if item.event_id is not None else None)
        for item in items
    ])
    db.session.flush()
    if copied_plan is not None:
        return {"plan": copied_plan.to_dict(), "counts": counts}, 201
    return {"event": next(iter(copied_events.values())).to_dict(), "counts": counts}, 201
