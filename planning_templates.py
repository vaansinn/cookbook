"""Bounded independent meal/menu template commands, without routes or commits.

Integration contract
--------------------
Caller authenticates, locks User then PlanningWorkspace, checks revision/receipt,
dispatches validate/apply, reconciles shopping for appended items, and commits the
domain change + revision + receipt together. This module never commits/rolls back.
Main owns metadata registration, migration, reads/routes, export/account deletion,
reviewed deletion/undo and client wiring. Do not expose template.delete as reviewed
until main supplies its preview/inverse integration.

Blueprint is exactly {"schema_version": 1, "items": [...]}, in original item order,
0..100 entries and <=65536 canonical UTF-8 bytes (sorted keys, compact separators,
ensure_ascii=False). Every item has kind/group/contribution. Dish adds entry_id,
catalog_revision, language, options={variant_id}, integer servings, follows_guests.
Personal adds title, quantity (three-place decimal string or null), unit (or null).
Note adds title only. No source IDs, dates, positions, tasks, links, coverage,
catalog prose, ingredient projections or arbitrary fields are retained.

save(parent_type,parent_id,name) returns {template_id}, 201; rename(template_id,
name) and delete(template_id) return {template_id}, 200; apply(template_id,
parent_type,parent_id) returns {template_id,created_item_ids}, 201. No receipt
contains blueprint/prose. List/UI routes always select only id/name/kind, omitting
blueprint even when eligible; these harmless owned summaries remain available on
revocation. They must not call get_template(owner,id), which is a currently
eligible private blueprint read. model.to_dict() is for private export without
entitlement filtering and retains configuration references, never resolved prose.
For undo call validate_template_access(owner, blueprint, kind) before attaching
any restored template. It returns None, checks shape and current dependencies,
does not mutate input or flush, and raises existing PlanningError/CatalogError.
Caller still owns authorization, locks, restoration limits and the transaction.
Every command, including rename/delete, validates current catalog dependencies
before staging writes. Removing unavailable templates requires main to explicitly
revise that policy when integrating reviewed deletion; there is no hidden bypass.

Meal templates apply only to meals; menu templates only to events. Applying copies
all entries with fresh IDs at appended positions. Event followers use destination
guests; explicit servings remain unchanged. Empty templates are valid.

Additive tables do NOT make an old application safe for recovery: it does not know
these records, their export/deletion or dependent shopping effects. A compatible
recovery build and populated restore/replay checks are integration gates.
"""
from copy import deepcopy
from decimal import Decimal
import json

from app import db
from planning_item_models import PrivatePlannedItem
from planning_template_models import PrivatePlanningTemplate
import planning_items

OPERATIONS = {"template.save", "template.rename", "template.apply", "template.delete"}
MAX_TEMPLATES = 100
MAX_BLUEPRINT_ITEMS = 100
MAX_BLUEPRINT_BYTES = 64 * 1024
MAX_POSITION = 2147483647
_COMMON = ("kind", "group", "contribution")
_DISH = ("entry_id", "catalog_revision", "language", "options", "servings", "follows_guests")


def validate(operation, payload):
    from routes.planning import keys, uuid, text, invalid
    if not isinstance(operation, str) or operation not in OPERATIONS:
        invalid("Unsupported template operation")
    required = {
        "template.save": ("parent_type", "parent_id", "name"),
        "template.rename": ("template_id", "name"),
        "template.apply": ("template_id", "parent_type", "parent_id"),
        "template.delete": ("template_id",),
    }[operation]
    keys(payload, required)
    for field in ("parent_id", "template_id"):
        if field in payload:
            uuid(payload[field])
    if "parent_type" in payload:
        if not isinstance(payload["parent_type"], str) or payload["parent_type"] not in {"meal", "event"}:
            invalid("Parent must be meal or event")
    if "name" in payload:
        text(payload["name"])


def validate_blueprint(blueprint, kind):
    """Pure closed-shape validation, shared by commands and ORM write guards."""
    from routes.planning import keys, text, invalid
    from planning_catalog import validate_selection
    if not isinstance(kind, str) or kind not in {"meal", "menu"}:
        invalid("Template kind must be meal or menu")
    keys(blueprint, ("schema_version", "items"))
    if type(blueprint["schema_version"]) is not int or blueprint["schema_version"] != 1:
        invalid("Unsupported template blueprint version")
    items = blueprint["items"]
    if not isinstance(items, list) or len(items) > MAX_BLUEPRINT_ITEMS:
        invalid("Template must contain at most 100 items")
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("kind"), str):
            invalid("Invalid template item")
        item_kind = item["kind"]
        if item_kind == "dish":
            keys(item, (*_COMMON, *_DISH))
            validate_selection(item["entry_id"], item["catalog_revision"], item["language"],
                               item["options"], item["servings"])
            if type(item["follows_guests"]) is not bool or (kind == "meal" and item["follows_guests"]):
                invalid("Only menu dishes can follow guest count")
        elif item_kind in {"personal", "note"}:
            keys(item, (*_COMMON, "title", *(("quantity", "unit") if item_kind == "personal" else ())))
            text(item["title"])
            if item_kind == "personal":
                amount, unit = item["quantity"], item["unit"]
                if (amount is None) != (unit is None):
                    invalid("Provide or clear both quantity and unit")
                if amount is not None:
                    if (not isinstance(amount, str) or not isinstance(unit, str)
                            or unit not in planning_items.UNITS):
                        invalid("Invalid template personal quantity/unit")
                    parsed = planning_items.quantity(amount)
                    if format(parsed, ".3f") != amount:
                        invalid("Template quantity must be a canonical three-place decimal")
        else:
            invalid("Unsupported template item kind")
        for field in ("group", "contribution"):
            text(item[field], optional=True)
    try:
        encoded = json.dumps(blueprint, sort_keys=True, separators=(",", ":"),
                             ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, UnicodeError, RecursionError):
        invalid("Invalid template blueprint JSON")
    if len(encoded) > MAX_BLUEPRINT_BYTES:
        invalid("Template blueprint exceeds 64 KiB")


def _blueprint(rows, kind):
    from routes.planning import invalid
    items = []
    for row in rows:
        item = {key: getattr(row, key) for key in _COMMON}
        if row.kind == "dish":
            item.update({key: deepcopy(getattr(row, key)) for key in _DISH})
            amount = planning_items.quantity(str(row.servings), 1000)
            if amount != amount.to_integral_value():
                invalid("Servings must be a whole number")
            item["servings"] = int(amount)
        elif row.kind == "personal":
            item.update(title=row.title, quantity=format(row.quantity, ".3f") if row.quantity is not None else None,
                        unit=row.unit)
        else:
            item["title"] = row.title
        items.append(item)
    blueprint = {"schema_version": 1, "items": items}
    validate_blueprint(blueprint, kind)
    return blueprint


def _prepared(blueprint, kind, owner, *, guests=None):
    """Resolve every dish before any item/template is attached to the session."""
    validate_blueprint(blueprint, kind)
    values = deepcopy(blueprint["items"])
    for item in values:
        if item["kind"] == "dish":
            if item["follows_guests"] and guests is not None:
                item["servings"] = guests
            planning_items.resolve_item(PrivatePlannedItem(**item), owner)
        else:
            item["follows_guests"] = False
            if item["kind"] == "personal" and item["quantity"] is not None:
                item["quantity"] = Decimal(item["quantity"])
    return values


def validate_template_access(owner, blueprint, kind):
    """Validate a captured blueprint before restore, without writes or projections.

    The caller must bind this blueprint to its owned preview/inverse; the helper
    cannot establish ownership of a plain JSON value. It deliberately suppresses
    autoflush so dependency reads cannot stage other pending restoration writes.
    """
    with db.session.no_autoflush:
        _prepared(blueprint, kind, owner)


def get_template(owner, identity):
    """Owned, eligibility-checked private read; never return resolved catalog prose."""
    from routes.planning import owned
    with db.session.no_autoflush:
        row = owned(PrivatePlanningTemplate, identity, owner)
        validate_template_access(owner, row.blueprint, row.kind)
        return row.to_dict()


def apply(owner, operation, payload):
    from routes.planning import owned, text, invalid, PlanningError
    validate(operation, payload)
    # Even resolver queries must not flush partially prepared domain objects.
    with db.session.no_autoflush:
        if operation == "template.save":
            _, query = planning_items.parent(owner, payload["parent_type"], payload["parent_id"])
            if PrivatePlanningTemplate.query.filter_by(workspace_id=owner.id).count() >= MAX_TEMPLATES:
                raise PlanningError("limit_reached", "Saved template limit reached", 409)
            rows = query.order_by(PrivatePlannedItem.position, PrivatePlannedItem.id).limit(MAX_BLUEPRINT_ITEMS + 1).all()
            kind = "meal" if payload["parent_type"] == "meal" else "menu"
            blueprint = _blueprint(rows, kind)
            validate_template_access(owner, blueprint, kind)
            row = PrivatePlanningTemplate(workspace_id=owner.id, name=text(payload["name"]),
                                          kind=kind, blueprint=blueprint)
        else:
            row = owned(PrivatePlanningTemplate, payload["template_id"], owner)
            if operation == "template.apply":
                expected_parent = "meal" if row.kind == "meal" else "event"
                if payload["parent_type"] != expected_parent:
                    invalid("Template kind does not match destination")
                target, query = planning_items.parent(owner, payload["parent_type"], payload["parent_id"])
                values = _prepared(row.blueprint, row.kind, owner,
                                   guests=target.guests if expected_parent == "event" else None)
                count = len(values)
                if (query.count() + count > planning_items.MAX_PARENT_ITEMS
                        or PrivatePlannedItem.query.filter_by(workspace_id=owner.id).count() + count > planning_items.MAX_ITEMS):
                    raise PlanningError("limit_reached", "Menu item limit reached", 409)
                last = query.with_entities(db.func.max(PrivatePlannedItem.position)).scalar()
                first = 0 if last is None else last + 1
                if count and first + count - 1 > MAX_POSITION:
                    raise PlanningError("limit_reached", "Menu item position limit reached", 409)
                created = [PrivatePlannedItem(workspace_id=owner.id,
                           meal_id=target.id if expected_parent == "meal" else None,
                           event_id=target.id if expected_parent == "event" else None,
                           position=first + index, **item) for index, item in enumerate(values)]
            else:
                validate_template_access(owner, row.blueprint, row.kind)

    if operation == "template.save":
        db.session.add(row)
    elif operation == "template.rename":
        row.name = text(payload["name"])
    elif operation == "template.delete":
        db.session.delete(row)
    else:
        db.session.add_all(created)
    db.session.flush()
    result = {"template_id": row.id}
    if operation == "template.apply":
        result["created_item_ids"] = [item.id for item in created]
    return result, 201 if operation in {"template.save", "template.apply"} else 200
