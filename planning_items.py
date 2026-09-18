"""Named commands for independent meal/event items; recipe requirements aren't editable shopping totals."""
from decimal import Decimal, InvalidOperation
from copy import deepcopy

from app import db
from planning_models import PrivateMeal, PrivateEvent
from planning_item_models import PrivatePlannedItem

OPERATIONS = {"item.create", "item.update", "item.move", "item.copy"}
UNITS = {"g", "kg", "ml", "l", "piece", "head", "loaf", "bunch", "pack", "tsp", "tbsp"}
MAX_ITEMS = 10000
MAX_PARENT_ITEMS = 100


def quantity(value, maximum=1000000):
    from routes.planning import invalid
    if type(value) not in (str, int) or len(str(value)) > 20:
        invalid("Quantity must be a positive decimal string or integer")
    try:
        result = Decimal(value)
    except (InvalidOperation, ValueError):
        invalid("Invalid quantity")
    if not result.is_finite() or not 0 < result <= maximum or result.as_tuple().exponent < -3:
        invalid("Quantity must be positive, within the limit and have at most three decimal places")
    return result


def validate(operation, payload):
    from routes.planning import keys, uuid, text, invalid
    if operation in {"item.move", "item.copy"}:
        keys(payload, ("item_id", "parent_type", "parent_id"))
        uuid(payload["item_id"])
    elif operation == "item.create":
        keys(payload, ("parent_type", "parent_id", "kind"), ("title", "quantity", "unit", "entry_id", "catalog_revision", "language", "options", "servings", "follows_guests", "group", "contribution"))
        kind = payload["kind"]
        if not isinstance(kind, str) or kind not in {"dish", "personal", "note"}:
            invalid("Unsupported item kind")
        if kind == "dish":
            if not {"entry_id", "catalog_revision", "language", "options"} <= set(payload) or {"title", "quantity", "unit"} & set(payload):
                invalid("Dish requires a catalog selection, not manual ingredients")
            from planning_catalog import validate_selection
            validate_selection(payload["entry_id"], payload["catalog_revision"], payload["language"], payload["options"], payload.get("servings", 2))
        elif {"entry_id", "catalog_revision", "language", "options", "servings", "follows_guests"} & set(payload):
            invalid("Personal items and notes are not recipes")
        else:
            text(payload.get("title"))
            if kind == "note" and {"quantity", "unit"} & set(payload):
                invalid("Notes have no shopping quantity")
    else:
        keys(payload, ("item_id",), ("title", "quantity", "unit", "options", "servings", "follows_guests", "group", "contribution"))
        uuid(payload["item_id"])
        if len(payload) == 1:
            invalid("An item field is required")
    if "parent_type" in payload:
        if not isinstance(payload["parent_type"], str) or payload["parent_type"] not in {"meal", "event"}:
            invalid("Parent must be meal or event")
        uuid(payload["parent_id"])
    for key in ("title", "group", "contribution"):
        if key in payload:
            text(payload[key], optional=key != "title")
    if "quantity" in payload and payload["quantity"] is not None:
        quantity(payload["quantity"])
    if "unit" in payload and payload["unit"] is not None and (not isinstance(payload["unit"], str) or payload["unit"] not in UNITS):
        invalid("Unsupported unit")
    if "servings" in payload:
        if type(payload["servings"]) is not int or not 1 <= payload["servings"] <= 1000:
            invalid("Servings must be an integer from 1 to 1000")
    if "follows_guests" in payload and type(payload["follows_guests"]) is not bool:
        invalid("Guest following must be a boolean")
    if "options" in payload:
        keys(payload["options"], ("variant_id",))
        text(payload["options"]["variant_id"])


def resolve_item(row, owner):
    from planning_catalog import resolve
    from models import User
    from routes.planning import invalid
    # ORM values are Decimal; bounded inverse/copy records serialize them as text.
    servings = quantity(row.servings if isinstance(row.servings, (str, int)) else str(row.servings), 1000)
    if servings != servings.to_integral_value():
        invalid("Servings must be a whole number")
    return resolve(row.entry_id, row.catalog_revision, row.language, row.options,
                   int(servings), db.session.get(User, owner.user_id))


def parent(owner, kind, identity):
    from routes.planning import owned
    row = owned(PrivateMeal if kind == "meal" else PrivateEvent, identity, owner)
    query = PrivatePlannedItem.query.filter_by(workspace_id=owner.id, **{kind + "_id": identity})
    return row, query


def copy_items(owner, rows, *, meal_id=None, event_id=None):
    """Used by repeat/copy services; validates every catalog dependency anew."""
    from routes.planning import PlanningError
    if PrivatePlannedItem.query.filter_by(workspace_id=owner.id).count() + len(rows) > MAX_ITEMS:
        raise PlanningError("limit_reached", "Saved item limit reached", 409)
    result = []
    for row in rows:
        if row.kind == "dish":
            resolve_item(row, owner)
        values = row.to_dict()
        values.pop("id")
        values.update(meal_id=meal_id, event_id=event_id)
        if not event_id:
            values["follows_guests"] = False
        new = PrivatePlannedItem(workspace_id=owner.id, **deepcopy(values))
        db.session.add(new)
        result.append(new)
    db.session.flush()
    return result


def apply(owner, operation, payload):
    from routes.planning import owned, text, invalid, PlanningError
    validate(operation, payload)
    creating = operation == "item.create"
    if creating or operation in {"item.move", "item.copy"}:
        target, query = parent(owner, payload["parent_type"], payload["parent_id"])
        row = None if creating else owned(PrivatePlannedItem, payload["item_id"], owner)
        if row and operation == "item.move" and getattr(row, payload["parent_type"] + "_id") == target.id:
            return {"item": row.to_dict()}, 200
        if query.count() >= MAX_PARENT_ITEMS or ((creating or operation == "item.copy") and PrivatePlannedItem.query.filter_by(workspace_id=owner.id).count() >= MAX_ITEMS):
            raise PlanningError("limit_reached", "Menu item limit reached", 409)
        last = query.with_entities(db.func.max(PrivatePlannedItem.position)).scalar()
        if creating:
            row = PrivatePlannedItem(workspace_id=owner.id, kind=payload["kind"], follows_guests=False)
            db.session.add(row)
        elif operation == "item.copy":
            if row.kind == "dish":
                resolve_item(row, owner)
            values = row.to_dict()
            values.pop("id")
            row = PrivatePlannedItem(workspace_id=owner.id, **deepcopy(values))
            db.session.add(row)
        row.meal_id = target.id if payload["parent_type"] == "meal" else None
        row.event_id = target.id if payload["parent_type"] == "event" else None
        row.position = 0 if last is None else last + 1
    else:
        row = owned(PrivatePlannedItem, payload["item_id"], owner)
    if row.kind == "dish":
        if {"title", "quantity", "unit"} & set(payload):
            invalid("Dish ingredients come from the selected catalog configuration")
        if creating:
            row.entry_id, row.catalog_revision = payload["entry_id"], payload["catalog_revision"]
            row.language, row.options = payload["language"], deepcopy(payload["options"])
            row.servings = quantity(payload.get("servings", 2), 1000)
            row.follows_guests = bool(row.event_id and "servings" not in payload)
        if "options" in payload:
            row.options = deepcopy(payload["options"])
        if "servings" in payload:
            row.servings = quantity(payload["servings"], 1000)
            row.follows_guests = False
        if "follows_guests" in payload:
            if payload["follows_guests"] and not row.event_id:
                invalid("Only event dishes can follow guest count")
            if payload["follows_guests"] and "servings" in payload:
                invalid("Choose guest count or an explicit serving override, not both")
            row.follows_guests = payload["follows_guests"]
        if not row.event_id:
            row.follows_guests = False
        if row.follows_guests:
            row.servings = owned(PrivateEvent, row.event_id, owner).guests
        # Do not autoflush a partially populated new row before validating content.
        with db.session.no_autoflush:
            resolve_item(row, owner)
    else:
        if {"options", "servings", "follows_guests"} & set(payload):
            invalid("Only dishes have recipe options and servings")
        if row.kind == "note" and {"quantity", "unit"} & set(payload):
            invalid("Notes have no shopping quantity")
        if "title" in payload:
            row.title = text(payload["title"])
        if "quantity" in payload:
            row.quantity = quantity(payload["quantity"]) if payload["quantity"] is not None else None
        if "unit" in payload:
            row.unit = payload["unit"]
        if (row.quantity is None) != (row.unit is None):
            invalid("Provide or clear both quantity and unit")
    for key in ("group", "contribution"):
        if key in payload:
            setattr(row, key, text(payload[key], optional=True))
    db.session.flush()
    return {"item": row.to_dict()}, 201 if creating or operation == "item.copy" else 200
