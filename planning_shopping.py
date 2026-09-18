"""Named private shopping commands; never commit or acquire an independent lock.

Main calls reconcile after EVERY domain mutation, before revision/receipt commit.
For reviewed invalidations main must capture full scope snapshots before changing
parents (including before SQL cascades), then call reconcile(..., True). A rejected
command requires caller rollback. project is read-only and fails on unavailable
content; only reconciliation may use partial internal projections.
"""
from copy import deepcopy
from decimal import Decimal
import hashlib
import json
import re

from app import db
from planning_models import new_id
from planning_shopping_models import PrivateShoppingScope, empty_state
from planning_shopping_projection import (project, build, selection_items, owned_scope,
    fail, amount, token, MAX_ALLOCATIONS, MAX_AGGREGATE)

MAX_SCOPES = 100
MAX_SCOPE_BYTES = 512 * 1024
MAX_WORKSPACE_ALLOCATIONS = 8000
MAX_WORKSPACE_STATE_BYTES = 2 * 1024 * 1024
# Invocation work budget, also enforced for single-scope reads/recovery. This
# bounds retained JSON input, not Python heap size or a response-time guarantee.
MAX_CATALOG_WORK_BYTES = 8 * 1024 * 1024
# Distinct authorized entry/revision/language/options keys, ignoring servings.
# Provisional engineering admission bound, not a response-time guarantee.
MAX_WORKSPACE_VARIANTS = 512
MAX_SELECTIONS = 12000
OPERATIONS = {"shopping.scope", "shopping.scope.delete", "shopping.cover", "shopping.extra",
              "shopping.personal.create", "shopping.personal.update", "shopping.personal.delete"}
STATUSES = {"needed", "have", "bought"}
UNITS = {"g", "kg", "ml", "l", "piece", "head", "loaf", "bunch", "pack", "bottle", "tsp", "tbsp"}
DECIMAL = re.compile(r"(?:0|[1-9][0-9]{0,12})(?:\.[0-9]{1,3})?\Z", re.ASCII)


def canonical(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False)


def preflight(owner, allow_invalidated=False):
    """Admission against proposed SQL state, before full demand resolution.

    Caller holds the user/workspace lock and rolls back any 422 rejection.
    Scope-delete recovery and its verified single-scope undo are handled by main;
    do not call this workspace admission helper from those recovery branches.
    """
    from planning_shopping_projection import capacity_preflight
    return capacity_preflight(owner, allow_invalidated=allow_invalidated)


def _check_final_state_budget(owner):
    from planning_shopping_projection import aggregate_state_bytes, _capacity_error
    size = aggregate_state_bytes(owner)
    if size > MAX_WORKSPACE_STATE_BYTES:
        _capacity_error("state_bytes", size, MAX_WORKSPACE_STATE_BYTES)


def number(value, *, positive=False):
    from routes.planning import invalid
    if type(value) is not str or len(value) > 18 or not DECIMAL.fullmatch(value):
        invalid("Amount must be an unsigned plain decimal string with at most three decimal places")
    result = Decimal(value)
    if result > MAX_AGGREGATE or (positive and result == 0):
        invalid("Amount is outside the shopping quantity limit")
    return amount(result)


def validate(operation, payload):
    from routes.planning import keys, uuid, day, text, invalid
    if type(operation) is not str or operation not in OPERATIONS:
        invalid("Unsupported shopping operation")
    if operation == "shopping.scope":
        keys(payload, ("owner_type", "owner_id", "mode"), ("selection", "start_date", "end_date"))
        if payload["owner_type"] not in ("plan", "event") or payload["mode"] not in ("all", "dates", "meals"):
            invalid("Invalid shopping owner or mode")
        uuid(payload["owner_id"])
        if payload["owner_type"] == "event" and payload["mode"] != "all":
            invalid("Event shopping uses its whole menu")
        if payload["mode"] == "dates":
            if set(payload) != {"owner_type", "owner_id", "mode", "start_date", "end_date"}:
                invalid("Dates selection requires only start_date and end_date")
            if day(payload["start_date"]) > day(payload["end_date"]):
                invalid("Invalid shopping date range")
        elif payload["mode"] == "meals":
            if set(payload) != {"owner_type", "owner_id", "mode", "selection"}:
                invalid("Explicit meal/event selection is required, including an empty selection")
            choices = payload["selection"]
            if type(choices) is not list or len(choices) > MAX_SELECTIONS:
                invalid("Shopping selection exceeds its reference limit")
            for choice in choices:
                if type(choice) is not str or choice.split(":", 1)[0] not in {"meal", "event"} or ":" not in choice:
                    invalid("Selection requires meal/event UUID references")
                uuid(choice.split(":", 1)[1])
        elif set(payload) != {"owner_type", "owner_id", "mode"}:
            invalid("Whole selection has no dates or selected references")
        return
    if operation == "shopping.cover":
        keys(payload, ("scope_id", "row_key", "source_ids", "status", "include_extra"))
        if type(payload["status"]) is not str or payload["status"] not in STATUSES or type(payload["include_extra"]) is not bool:
            invalid("Invalid shopping coverage state")
        ids = payload["source_ids"]
        if type(ids) is not list or len(ids) > MAX_ALLOCATIONS or any(type(s) is not str or len(s) > 400 for s in ids):
            invalid("Invalid source allocation IDs")
        if len(set(ids)) != len(ids) or (not ids and not payload["include_extra"]):
            invalid("Choose distinct source allocations or an extra")
    elif operation == "shopping.extra":
        keys(payload, ("scope_id", "row_key", "amount"))
        number(payload["amount"])
    elif operation == "shopping.scope.delete":
        keys(payload, ("scope_id",))
    elif operation == "shopping.personal.delete":
        keys(payload, ("scope_id", "item_id"))
        uuid(payload["item_id"])
    else:
        required = ("scope_id", "title") + (("item_id",) if operation.endswith("update") else ())
        keys(payload, required, ("amount", "unit"))
        text(payload["title"])
        if "item_id" in payload:
            uuid(payload["item_id"])
        if (payload.get("amount") is None) != (payload.get("unit") is None):
            invalid("Provide or clear both personal amount and unit")
        if payload.get("amount") is not None:
            number(payload["amount"], positive=True)
            if type(payload["unit"]) is not str or payload["unit"] not in UNITS:
                invalid("Unsupported personal shopping unit")
    uuid(payload["scope_id"])
    if "row_key" in payload and (type(payload["row_key"]) is not str or not 1 <= len(payload["row_key"]) <= 300):
        invalid("Invalid shopping row key")


def digest(scope):
    return hashlib.sha256(canonical([scope.plan_id, scope.event_id, scope.mode,
        scope.selection, scope.start_date.isoformat() if scope.start_date else None,
        scope.end_date.isoformat() if scope.end_date else None]).encode()).hexdigest()


def check_state(state):
    """Closed persisted shape; corrupt/future state fails without being rewritten."""
    from routes.planning import keys, uuid, text, invalid
    keys(state, ("rows", "personal", "unavailable"))
    if type(state["rows"]) is not dict or type(state["personal"]) is not list or type(state["unavailable"]) is not bool:
        invalid("Invalid shopping state")
    allocations = len(state["personal"])
    if len(state["rows"]) > MAX_ALLOCATIONS:
        fail("limit_reached", "Shopping row capacity exceeded")
    def covered(value):
        keys(value, ("amount", "state", "review"))
        if value["amount"] is not None:
            number(value["amount"])
        if type(value["state"]) is not str or value["state"] not in STATUSES or type(value["review"]) is not bool:
            invalid("Invalid saved shopping coverage")
        if value["state"] == "needed" and value["review"]:
            invalid("Uncovered demand cannot require coverage review")
    def parsed(value, size):
        if type(value) is not str or len(value) > 400:
            invalid("Invalid saved shopping identity")
        try:
            result = json.loads(value)
        except (ValueError, TypeError):
            invalid("Invalid saved shopping identity")
        if type(result) is not list or len(result) != size or token(*result) != value:
            invalid("Noncanonical shopping identity")
        return result
    for key, row in state["rows"].items():
        identity, form, unit = parsed(key, 3)
        if not all(type(part) is str and 0 < len(part) <= 100 for part in (identity, form)) or (unit is not None and (type(unit) is not str or unit not in UNITS | {"cupboard"})):
            invalid("Invalid saved ingredient identity")
        keys(row, ("extra", "extra_coverage", "sources"))
        number(row["extra"])
        if (unit is None or unit == "cupboard") and Decimal(row["extra"]) != 0:
            invalid("Qualitative requirements cannot have extras")
        covered(row["extra_coverage"])
        if type(row["sources"]) is not dict:
            invalid("Invalid source coverage")
        for source, basis in row["sources"].items():
            item_id, ingredient, source_form, source_unit = parsed(source, 4)
            uuid(item_id)
            if ingredient != identity or source_form != form or (unit != "cupboard" and source_unit != unit) or (unit == "cupboard" and source_unit is not None and (type(source_unit) is not str or source_unit not in UNITS | {"taste"})):
                invalid("Source allocation does not belong to its row")
            covered(basis)
        allocations += len(row["sources"])
    ids = set()
    for personal in state["personal"]:
        keys(personal, ("id", "title", "amount", "unit", "coverage"))
        uuid(personal["id"])
        if personal["id"] in ids:
            invalid("Duplicate personal shopping identity")
        ids.add(personal["id"])
        text(personal["title"])
        if (personal["amount"] is None) != (personal["unit"] is None):
            invalid("Incomplete personal quantity")
        if personal["amount"] is not None:
            number(personal["amount"], positive=True)
            if type(personal["unit"]) is not str or personal["unit"] not in UNITS:
                invalid("Invalid saved personal unit")
        covered(personal["coverage"])
    if allocations > MAX_ALLOCATIONS:
        fail("limit_reached", "Saved shopping allocation capacity exceeded")
    if len(canonical(state).encode("utf-8")) > MAX_SCOPE_BYTES:
        fail("limit_reached", "Shopping scope exceeds 512 KiB")


def check_record(scope):
    from routes.planning import invalid, uuid
    if (scope.plan_id is None) == (scope.event_id is None):
        invalid("Shopping scope requires exactly one owner")
    payload = {"owner_type": "plan" if scope.plan_id else "event", "owner_id": scope.plan_id or scope.event_id, "mode": scope.mode}
    if scope.mode == "dates":
        payload.update(start_date=scope.start_date.isoformat() if scope.start_date else None,
                       end_date=scope.end_date.isoformat() if scope.end_date else None)
    elif scope.start_date is not None or scope.end_date is not None:
        invalid("Only a date scope may retain dates")
    if scope.mode == "meals":
        payload["selection"] = scope.selection
    elif scope.selection != []:
        invalid("Only a meal scope may retain selected references")
    validate("shopping.scope", payload)
    if scope.selection != sorted(set(scope.selection)) or scope.selection_digest != digest(scope):
        invalid("Shopping selection/digest is not canonical")
    uuid(scope.workspace_id)
    check_state(scope.state)
    if len(canonical(scope.to_dict()).encode("utf-8")) > MAX_SCOPE_BYTES:
        fail("limit_reached", "Shopping scope exceeds 512 KiB")


def blank_coverage(value="0.000"):
    return {"amount": value, "state": "needed", "review": False}


def blank_row():
    return {"extra": "0.000", "extra_coverage": blank_coverage(), "sources": {}}


def validate_personal_delete(owner, payload):
    """Preview preflight: owned target existence, without demand resolution/writes."""
    validate("shopping.personal.delete", payload)
    scope = owned_scope(owner, payload["scope_id"])
    check_state(scope.state)
    if not any(item["id"] == payload["item_id"] for item in scope.state["personal"]):
        fail("not_found", "Personal shopping item not found", 404)
    return {"scope_id": scope.id, "item_id": payload["item_id"]}


def validate_scope_delete(owner, payload):
    """Read-only preview preflight; unavailable demand does not prevent cleanup.

    Main retains the full to_dict snapshot in its reviewed bounded inverse.
    This helper checks the stored record, never current source eligibility.
    """
    validate("shopping.scope.delete", payload)
    scope = owned_scope(owner, payload["scope_id"])
    check_record(scope)
    return {"scope_id": scope.id}


def apply(owner, operation, payload):
    from routes.planning import day, text, owned
    validate(operation, payload)
    if operation == "shopping.scope":
        scope = PrivateShoppingScope(id=new_id(), workspace_id=owner.id,
            plan_id=payload["owner_id"] if payload["owner_type"] == "plan" else None,
            event_id=payload["owner_id"] if payload["owner_type"] == "event" else None,
            mode=payload["mode"], selection=sorted(set(payload.get("selection", []))),
            start_date=day(payload["start_date"]) if "start_date" in payload else None,
            end_date=day(payload["end_date"]) if "end_date" in payload else None, state=empty_state())
        scope.selection_digest = digest(scope)
        from planning_models import PrivatePlan, PrivateEvent
        owned(PrivatePlan if scope.plan_id else PrivateEvent, scope.plan_id or scope.event_id, owner)
        existing = PrivateShoppingScope.query.filter_by(workspace_id=owner.id, selection_digest=scope.selection_digest).first()
        if existing:
            # Scope selection is also an availability-checked read of the demand.
            preflight(owner)
            project(owner, existing)
            return {"scope_id": existing.id}, 200
        if PrivateShoppingScope.query.filter_by(workspace_id=owner.id).count() >= MAX_SCOPES:
            fail("limit_reached", "Saved shopping selection limit reached")
        check_record(scope)
        db.session.add(scope)
        db.session.flush()
        preflight(owner)
        build(owner, scope)
        return {"scope_id": scope.id}, 201
    scope = owned_scope(owner, payload["scope_id"])
    if operation == "shopping.scope.delete":
        # Internal leaf only: main must gate exposure through preview/confirm,
        # retain the full prior scope, and skip unrelated shopping reconciliation
        # so an already over-budget workspace can be cleaned without eviction.
        # No catalog access: explicit removal must work for unavailable demand.
        check_record(scope)
        result = {"scope_id": scope.id}
        db.session.delete(scope)
        db.session.flush()
        return result, 200
    preflight(owner)
    # Removing an owned personal addition must remain possible even when an
    # unrelated configured dish is unavailable. Main exposes this via preview.
    if operation == "shopping.personal.delete":
        validate_personal_delete(owner, payload)
        projection = None
    else:
        projection = project(owner, scope)
    state = deepcopy(scope.state)
    personal_id = None
    if operation in {"shopping.cover", "shopping.extra"}:
        row = next((r for r in projection["rows"] if r["key"] == payload["row_key"]), None)
        if row is None:
            fail("not_found", "Shopping row no longer exists", 404)
        if operation == "shopping.extra":
            if row.get("personal_id") or row["required"] is None or row["purchase_mode"] == "check_cupboard":
                fail("invalid_request", "Only measured requirements accept extras", 400)
            saved = state["rows"].setdefault(row["key"], blank_row())
            saved["extra"] = number(payload["amount"])
        else:
            sources = {source["id"]: source for source in row["sources"]}
            if not set(payload["source_ids"]) <= sources.keys():
                fail("invalid_request", "Coverage includes an allocation outside this row and scope", 400)
            if payload["include_extra"] and not row.get("personal_id") and Decimal(row["extra"]) == 0:
                fail("invalid_request", "There is no extra allocation to cover", 400)
            def mark(value):
                return {"amount": value, "state": payload["status"], "review": False}
            if row.get("personal_id"):
                personal_id = row["personal_id"]
                personal = next(p for p in state["personal"] if p["id"] == personal_id)
                personal["coverage"] = mark(personal["amount"])
            else:
                saved = state["rows"].setdefault(row["key"], blank_row())
                for source_id in payload["source_ids"]:
                    saved["sources"][source_id] = mark(sources[source_id]["amount"])
                if payload["include_extra"]:
                    saved["extra_coverage"] = mark(row["extra"])
    else:
        personal_id = payload.get("item_id", new_id())
        personal = next((p for p in state["personal"] if p["id"] == personal_id), None)
        if not operation.endswith("create") and personal is None:
            fail("not_found", "Personal shopping item not found", 404)
        if operation.endswith("delete"):
            state["personal"].remove(personal)
        else:
            title, unit = text(payload["title"]), payload.get("unit")
            value = number(payload["amount"], positive=True) if payload.get("amount") is not None else None
            if personal is None:
                personal = {"id": personal_id, "coverage": blank_coverage(value)}
                state["personal"].append(personal)
            elif personal["title"] != title or personal["unit"] != unit:
                personal["coverage"] = blank_coverage(value)
            personal.update(title=title, amount=value, unit=unit)
    # Assignment rather than in-place JSON edits makes ORM persistence explicit.
    check_state(state)
    scope.state = state
    # Flush/measure the proposed result before resolving it again. Rejection is
    # rolled back with the caller's source mutation/revision/receipt transaction.
    preflight(owner)
    reconcile_scope(owner, scope)
    check_record(scope)
    db.session.flush()
    _check_final_state_budget(owner)
    result = {"scope_id": scope.id}
    if personal_id:
        result["item_id"] = personal_id
    return result, 201 if operation.endswith("create") else 200


def reconcile_scope(owner, scope, *, _resolution_memo=None):
    projection, unavailable, _error = build(owner, scope, tolerate_unavailable=True,
                                          _resolution_memo=_resolution_memo)
    state = deepcopy(scope.state)
    current = {row["key"]: row for row in projection["rows"]}
    for key in list(state["rows"]):
        saved = state["rows"][key]
        row = current.get(key)
        sources = {s["id"]: s for s in row["sources"]} if row else {}
        for source_id in list(saved["sources"]):
            basis = saved["sources"][source_id]
            if json.loads(source_id)[0] in unavailable:
                # An inaccessible source may have changed while hidden. Preserve
                # evidence but require explicit reconfirmation when it returns.
                if basis["state"] != "needed":
                    basis["review"] = True
            elif source_id not in sources:
                del saved["sources"][source_id]
            elif sources[source_id]["review"]:
                basis["review"] = True
        if row and row["extra_review"]:
            saved["extra_coverage"]["review"] = True
        if Decimal(saved["extra"]) == 0:
            saved["extra_coverage"] = blank_coverage()
        if not saved["sources"] and Decimal(saved["extra"]) == 0:
            del state["rows"][key]
    for personal in state["personal"]:
        row = current[token("personal-addition", personal["id"])]
        if row["extra_review"]:
            personal["coverage"]["review"] = True
    state["unavailable"] = bool(unavailable)
    check_state(state)
    scope.state = state
    check_record(scope)


def reconcile(owner, allow_invalidated=False):
    """Reconcile every saved selection, independent of which screen is open.

    Return only IDs for main's integration/invalidations. Never return partial
    demand or retain catalog errors/content in receipts or state.
    """
    from routes.planning import PlanningError
    from planning_shopping_projection import _ResolutionMemo
    preflight(owner, allow_invalidated=allow_invalidated)
    scopes = PrivateShoppingScope.query.filter_by(workspace_id=owner.id).order_by(PrivateShoppingScope.id).all()
    memo = _ResolutionMemo(owner)
    invalid = []
    # Validate all references before changing any saved scope state.
    for scope in scopes:
        check_record(scope)
        try:
            selection_items(owner, scope)
        except PlanningError as error:
            if error.body["code"] != "shopping_scope_invalid":
                raise
            invalid.append(scope.id)
    if invalid and not allow_invalidated:
        fail("shopping_preview_required", "Review removal of saved shopping selections before continuing", scope_ids=invalid)
    unavailable = []
    for scope in scopes:
        if scope.id in invalid:
            db.session.delete(scope)
        else:
            reconcile_scope(owner, scope, _resolution_memo=memo)
            if scope.state["unavailable"]:
                unavailable.append(scope.id)
    db.session.flush()
    _check_final_state_budget(owner)
    return {"removed_scope_ids": invalid, "unavailable_scope_ids": unavailable}
