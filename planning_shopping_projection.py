"""Complete, read-only source projection, never derived from an agenda window.

build(..., tolerate_unavailable=True) is private reconciliation infrastructure:
its partial rows MUST NOT be returned as a shopping list. project always raises
when any current source cannot be resolved. No saved recipe text is consulted.
"""
from decimal import Decimal
import json
from collections import defaultdict
from sqlalchemy import tuple_

from app import db
from planning_models import PrivatePlan, PrivateMeal, PrivateEvent, PrivateEventLink
from planning_item_models import PrivatePlannedItem
from planning_items import resolve_item, quantity
from planning_catalog import CatalogError, validate_selection, scale_amount

MAX_ALLOCATIONS = 4000
MAX_AGGREGATE = Decimal("1000000000000")


def variant_key(item):
    """Identical key for admission and invocation-local authorized resolution."""
    return (item.entry_id, item.catalog_revision, item.language,
            json.dumps(item.options, sort_keys=True, separators=(",", ":"), ensure_ascii=True))


class _ResolutionMemo:
    """Authorized demand only, owned by one project/reconcile invocation.

    Never attach this to a session, owner, global cache or ORM identity map.
    Internal consumers must not edit cached demand. Each first resolution uses
    resolve_item's persisted-account/catalog/recipe access checks. Permission
    failures are memoized too, but never database/integrity/session failures.
    """
    def __init__(self, owner):
        self._owner = (owner.id, owner.user_id)
        self._session = db.session()
        self._transaction = self._session.get_transaction()
        self._variants = {}
        self._scaled = {}

    def resolve(self, item, owner):
        if ((owner.id, owner.user_id) != self._owner or db.session() is not self._session
                or self._session.get_transaction() is not self._transaction):
            raise RuntimeError("Shopping resolution memo cannot cross owners or transactions")
        # Match resolve_item's validation even on a cache hit. A valid authored
        # variant is not permission to accept fractional/out-of-range servings.
        servings = quantity(item.servings if isinstance(item.servings, (str, int)) else str(item.servings), 1000)
        if servings != servings.to_integral_value():
            from routes.planning import invalid
            invalid("Servings must be a whole number")
        servings = int(servings)
        validate_selection(item.entry_id, item.catalog_revision, item.language, item.options, servings)
        key = variant_key(item)
        if key not in self._variants:
            try:
                content = resolve_item(item, owner)
            except CatalogError as error:
                if (error.code != "catalog_unavailable" or error.status != 409
                        or error.body.get("reason") == "quantity_out_of_range"):
                    # Quantity errors depend on servings, not variant access.
                    # Database/integrity/session errors must never be memoized.
                    raise
                # Store data rather than an exception retaining stack frames.
                self._variants[key] = (None, (error.code, error.status, dict(error.body)))
            else:
                # Retain verified authored source amounts/base, not an inferred
                # yield from the first item's rounded quantities. Never retain
                # methods/equipment/time that demand does not use.
                self._variants[key] = ({"title": content["title"], "ingredients": content["ingredients"],
                                        "base_servings": content["base_servings"]}, None)
                self._scaled[key, servings] = {"title": content["title"], "ingredients": content["ingredients"]}
        content, error = self._variants[key]
        if error:
            code, status, body = error
            raise CatalogError(code, body["error"], status,
                               **{key: value for key, value in body.items() if key not in {"code", "error"}})
        if (key, servings) not in self._scaled:
            self._scaled[key, servings] = {"title": content["title"], "ingredients": [
                {**ingredient, "amount": (None if ingredient["source_amount"] is None else
                    scale_amount(ingredient["source_amount"], content["base_servings"], servings))}
                for ingredient in content["ingredients"]]}
        return self._scaled[key, servings]


def fail(code, message, status=409, **details):
    from routes.planning import PlanningError
    raise PlanningError(code, message, status, **details)


def token(*parts):
    return json.dumps(parts, separators=(",", ":"), ensure_ascii=True)


def amount(value):
    if value is None:
        return None
    value = Decimal(str(value))
    if not value.is_finite() or value < 0 or value > MAX_AGGREGATE:
        fail("limit_reached", "Shopping quantity exceeds the aggregate limit")
    return format(value, ".3f")


def owned_scope(owner, scope):
    from planning_shopping_models import PrivateShoppingScope
    identity = scope.id if isinstance(scope, PrivateShoppingScope) else scope
    result = PrivateShoppingScope.query.filter_by(id=identity, workspace_id=owner.id).first()
    if result is None:
        fail("not_found", "Shopping selection not found", 404)
    return result


def _capacity_error(dimension, used, limit, **details):
    fail("shopping_capacity_exceeded", "Shopping capacity exceeded; remove a saved selection before adding more demand",
         422, dimension=dimension, used=used, limit=limit, **details)


def aggregate_state_bytes(owner):
    from planning_shopping_models import PrivateShoppingScope, state_size_expression
    return int(db.session.query(db.func.coalesce(db.func.sum(state_size_expression()), 0))
               .filter(PrivateShoppingScope.workspace_id == owner.id).scalar())


def catalog_work_bytes(entries):
    """Measure all distinct referenced revisions before materializing ANY content.

    Chunk only SQL parameters, never fetch JSON in the sizing pass. Count stored
    bytes even for unavailable entries; full live authorization/integrity checks
    still follow admission. Deduplication is invocation-local, not a cache.
    """
    from planning_shopping import MAX_CATALOG_WORK_BYTES
    from planning_shopping_models import json_size_expression
    from planning_catalog_models import PlanningCatalogEntry as Catalog
    entries = sorted(set(entries))
    size = 0
    for offset in range(0, len(entries), 400):
        size += int(db.session.query(db.func.coalesce(db.func.sum(json_size_expression(Catalog.content)), 0))
            .filter(tuple_(Catalog.entry_id, Catalog.revision).in_(entries[offset:offset + 400])).scalar())
    if size > MAX_CATALOG_WORK_BYTES:
        _capacity_error("catalog_bytes", size, MAX_CATALOG_WORK_BYTES)
    return size


def capacity_preflight(owner, *, allow_invalidated=False, scope_ids=None, enforce_aggregate=True):
    """Cheap admission only, NOT authorization/content-integrity evidence.

    Flush the proposed transaction, read bounded owner graph metadata, and count
    unchecked/repeated source occurrences from retained ingredient identities.
    Never call resolve_item, scale quantities, or deserialize coverage state.
    Full authorized resolution remains mandatory after admission. Single-scope
    reads/recovery may disable aggregate demand/state limits, never individual
    allocation caps, distinct-variant fanout or the catalog materialization budget.
    """
    from planning_shopping import MAX_WORKSPACE_ALLOCATIONS, MAX_WORKSPACE_STATE_BYTES, MAX_WORKSPACE_VARIANTS
    from planning_shopping_models import PrivateShoppingScope as Scope, state_size_expression
    from planning_catalog_models import PlanningCatalogEntry as Catalog
    db.session.flush()
    query = db.session.query(Scope.id, Scope.plan_id, Scope.event_id, Scope.mode,
        Scope.start_date, Scope.end_date, Scope.selection, state_size_expression().label("state_bytes"))
    query = query.filter(Scope.workspace_id == owner.id)
    if scope_ids is not None:
        query = query.filter(Scope.id.in_(scope_ids))
    scopes = query.all()
    if scope_ids is not None and {s.id for s in scopes} != set(scope_ids):
        fail("not_found", "Shopping selection not found", 404)
    if not scopes:
        return {"scope_count": 0, "demand_allocations": 0, "state_bytes": 0, "catalog_bytes": 0, "variant_resolutions": 0, "invalid_scope_ids": []}
    plans = {p.id: p for p in db.session.query(PrivatePlan.id, PrivatePlan.start_date, PrivatePlan.end_date)
             .filter(PrivatePlan.workspace_id == owner.id)}
    meals = defaultdict(list)
    for meal in db.session.query(PrivateMeal.id, PrivateMeal.plan_id, PrivateMeal.date).filter(PrivateMeal.workspace_id == owner.id):
        meals[meal.plan_id].append(meal)
    events = {e.id: e for e in db.session.query(PrivateEvent.id, PrivateEvent.date).filter(PrivateEvent.workspace_id == owner.id)}
    links = defaultdict(set)
    for link in db.session.query(PrivateEventLink.plan_id, PrivateEventLink.event_id).filter(PrivateEventLink.workspace_id == owner.id):
        links[link.plan_id].add(link.event_id)
    selected, invalid = {}, []
    for scope in scopes:
        if scope.event_id:
            if scope.event_id not in events or scope.mode != "all":
                invalid.append(scope.id)
            else:
                selected[scope.id] = [("event", scope.event_id)]
            continue
        plan = plans.get(scope.plan_id)
        plan_meals = meals[scope.plan_id]
        linked_ids = links[scope.plan_id]
        if plan is None or not linked_ids <= events.keys():
            invalid.append(scope.id)
            continue
        valid_refs = {"meal:" + m.id for m in plan_meals} | {"event:" + e for e in linked_ids}
        if scope.mode == "dates":
            valid = (scope.start_date is not None and scope.end_date is not None
                     and plan.start_date <= scope.start_date <= scope.end_date <= plan.end_date)
        elif scope.mode == "meals":
            valid = isinstance(scope.selection, list) and all(isinstance(ref, str) and ref in valid_refs for ref in scope.selection)
        else:
            valid = scope.mode == "all"
        if not valid:
            invalid.append(scope.id)
            continue
        selection = set(scope.selection)
        def included(row, kind):
            return scope.mode == "all" or (scope.mode == "dates" and scope.start_date <= row.date <= scope.end_date) or (scope.mode == "meals" and kind + ":" + row.id in selection)
        selected[scope.id] = [("meal", m.id) for m in plan_meals if included(m, "meal")]
        selected[scope.id] += [("event", e) for e in linked_ids
            if plan.start_date <= events[e].date <= plan.end_date and included(events[e], "event")]
    if invalid and not allow_invalidated:
        fail("shopping_preview_required", "Review removal of saved shopping selections before continuing",
             scope_ids=sorted(invalid))
    state_bytes = sum(s.state_bytes or 0 for s in scopes if s.id in selected)
    if enforce_aggregate and state_bytes > MAX_WORKSPACE_STATE_BYTES:
        _capacity_error("state_bytes", state_bytes, MAX_WORKSPACE_STATE_BYTES)
    if not selected:
        return {"scope_count": 0, "demand_allocations": 0, "state_bytes": 0, "catalog_bytes": 0, "variant_resolutions": 0, "invalid_scope_ids": sorted(invalid)}
    # Read only personal additions, not potentially thousands of coverage bases.
    personal = {}
    for identity, values in db.session.query(Scope.id, Scope.state["personal"]).filter(
            Scope.workspace_id == owner.id, Scope.id.in_(selected)):
        if not isinstance(values, list):
            fail("invalid_request", "Invalid personal shopping state", 400)
        personal[identity] = len(values)
    wanted_parents = {parent for parents in selected.values() for parent in parents}
    parent_items = defaultdict(list)
    for item in db.session.query(PrivatePlannedItem.id, PrivatePlannedItem.meal_id, PrivatePlannedItem.event_id,
            PrivatePlannedItem.kind, PrivatePlannedItem.contribution, PrivatePlannedItem.entry_id,
            PrivatePlannedItem.catalog_revision, PrivatePlannedItem.language, PrivatePlannedItem.options
            ).filter(PrivatePlannedItem.workspace_id == owner.id):
        parent = ("meal", item.meal_id) if item.meal_id else ("event", item.event_id)
        if parent in wanted_parents and item.kind != "note" and not (item.contribution or "").strip():
            parent_items[parent].append(item)
    # Every valid dish contains at least one ingredient; reject obvious fanout
    # before even loading catalog JSON. The response identifies this lower bound.
    minimums = {identity: personal[identity] + sum(len(parent_items[parent]) for parent in parents)
                for identity, parents in selected.items()}
    for identity, count in minimums.items():
        if count > MAX_ALLOCATIONS:
            _capacity_error("scope_allocations", count, MAX_ALLOCATIONS, scope_id=identity, lower_bound=True)
    if enforce_aggregate and sum(minimums.values()) > MAX_WORKSPACE_ALLOCATIONS:
        _capacity_error("demand_allocations", sum(minimums.values()), MAX_WORKSPACE_ALLOCATIONS, lower_bound=True)
    # Count only selected sources, once across the union of selected parents.
    # Repeated scopes/items/servings do not authorize a new variant resolution.
    # This is metadata-only: reject fanout before even catalog sizing queries.
    variants = {variant_key(item) for items in parent_items.values() for item in items if item.kind == "dish"}
    if len(variants) > MAX_WORKSPACE_VARIANTS:
        _capacity_error("variant_resolutions", len(variants), MAX_WORKSPACE_VARIANTS)
    entries = {(key[0], key[1]) for key in variants}
    # A demand cap does not bound retained content: every one-ingredient demand
    # may reference an otherwise large authored revision. Complete the cheap SQL
    # sizing pass before any batch of full Catalog.content enters Python.
    catalog_bytes = catalog_work_bytes(entries)
    catalog = {}
    entries = sorted(entries)
    for offset in range(0, len(entries), 400):
        for entry_id, revision, content in db.session.query(Catalog.entry_id, Catalog.revision, Catalog.content).filter(
                tuple_(Catalog.entry_id, Catalog.revision).in_(entries[offset:offset + 400])):
            catalog[entry_id, revision] = content
    variant_counts = {}
    def item_count(item):
        if item.kind != "dish":
            return 1
        key = variant_key(item)
        if key not in variant_counts:
            try:
                content = catalog[item.entry_id, item.catalog_revision]
                variant = next(v for v in content["variants"] if v["id"] == item.options["variant_id"])
                ingredients = variant["languages"][item.language]["ingredients"]
                if not isinstance(ingredients, list) or not 1 <= len(ingredients) <= 200:
                    raise ValueError("Invalid retained ingredients")
                variant_counts[key] = len({(i["ingredient_id"], i["form"],
                    "cupboard" if i.get("purchase_mode") == "check_cupboard" else {"kg": "g", "l": "ml"}.get(i["unit"], i["unit"]),
                    i["unit"] if i.get("purchase_mode") == "check_cupboard" else {"kg": "g", "l": "ml"}.get(i["unit"], i["unit"]))
                    for i in ingredients})
            except (KeyError, TypeError, ValueError, StopIteration):
                raise CatalogError("catalog_integrity_error", "Cannot count retained shopping requirements", 503)
        return variant_counts[key]
    parent_counts = {parent: sum(item_count(item) for item in items) for parent, items in parent_items.items()}
    counts = {identity: personal[identity] + sum(parent_counts.get(parent, 0) for parent in parents)
              for identity, parents in selected.items()}
    for identity, count in counts.items():
        if count > MAX_ALLOCATIONS:
            _capacity_error("scope_allocations", count, MAX_ALLOCATIONS, scope_id=identity)
    if enforce_aggregate and sum(counts.values()) > MAX_WORKSPACE_ALLOCATIONS:
        _capacity_error("demand_allocations", sum(counts.values()), MAX_WORKSPACE_ALLOCATIONS)
    return {"scope_count": len(selected), "demand_allocations": sum(counts.values()),
            "state_bytes": state_bytes, "catalog_bytes": catalog_bytes,
            "variant_resolutions": len(variants), "invalid_scope_ids": sorted(invalid)}


def selection_items(owner, scope):
    """Validate the entire scope before extracting any sources (including empty)."""
    invalid = lambda: fail("shopping_scope_invalid", "Shopping selection no longer resolves", scope_ids=[scope.id])
    if scope.workspace_id != owner.id:
        fail("not_found", "Shopping selection not found", 404)
    if scope.event_id:
        root = PrivateEvent.query.filter_by(id=scope.event_id, workspace_id=owner.id).first()
        if root is None or scope.mode != "all":
            invalid()
        meals, events = [], [root]
    else:
        root = PrivatePlan.query.filter_by(id=scope.plan_id, workspace_id=owner.id).first()
        if root is None:
            invalid()
        meals = PrivateMeal.query.filter_by(plan_id=root.id, workspace_id=owner.id).order_by(PrivateMeal.id).all()
        events = (PrivateEvent.query.join(PrivateEventLink, PrivateEventLink.event_id == PrivateEvent.id)
                  .filter(PrivateEventLink.plan_id == root.id, PrivateEventLink.workspace_id == owner.id,
                          PrivateEvent.workspace_id == owner.id).order_by(PrivateEvent.id).all())
        if scope.mode == "dates":
            if not root.start_date <= scope.start_date <= scope.end_date <= root.end_date:
                invalid()
        elif scope.mode == "meals":
            valid = {"meal:" + row.id for row in meals} | {"event:" + row.id for row in events}
            if not set(scope.selection) <= valid:
                invalid()
        elif scope.mode != "all":
            invalid()
        def selected(row, kind):
            return scope.mode == "all" or (scope.mode == "dates" and scope.start_date <= row.date <= scope.end_date) or (scope.mode == "meals" and kind + ":" + row.id in scope.selection)
        meals = [row for row in meals if selected(row, "meal")]
        events = [row for row in events if root.start_date <= row.date <= root.end_date and selected(row, "event")]
    parents = {row.id: row for row in meals + events}
    if not parents:
        return []
    items = PrivatePlannedItem.query.filter(PrivatePlannedItem.workspace_id == owner.id,
        db.or_(PrivatePlannedItem.meal_id.in_([row.id for row in meals]),
               PrivatePlannedItem.event_id.in_([row.id for row in events]))).order_by(PrivatePlannedItem.id).all()
    return [(item, parents[item.meal_id or item.event_id]) for item in items
            if item.kind != "note" and not (item.contribution or "").strip()]


def coverage(saved, current):
    if not saved:
        return "needed", False
    state, basis = saved["state"], saved["amount"]
    increased = (current is None) != (basis is None) or (current is not None and basis is not None and Decimal(current) > Decimal(basis))
    return state, state != "needed" and (saved["review"] or increased)


def row_shell(key, ingredient, form, unit, label, category, mode):
    return {"key": key, "label": label, "ingredient_id": ingredient, "form": form,
            "unit": unit, "category": category, "purchase_mode": mode,
            "required": "0.000" if unit is not None and mode == "measured" else None,
            "extra": "0.000", "total": None, "sources": [],
            "extra_state": "needed", "extra_review": False}


def build(owner, scope, *, tolerate_unavailable=False, _resolution_memo=None):
    from planning_shopping import check_state
    check_state(scope.state)
    rows, unavailable = {}, set()
    first_error = None
    allocations = 0
    items = selection_items(owner, scope)
    memo = _resolution_memo if _resolution_memo is not None else _ResolutionMemo(owner)
    source_index = {}
    for item, parent in items:
        if item.kind == "dish":
            try:
                content = memo.resolve(item, owner)
            except CatalogError as error:
                if error.code != "catalog_unavailable" or error.status != 409 or not tolerate_unavailable:
                    raise
                first_error = first_error or error
                unavailable.add(item.id)
                continue
            ingredients = content["ingredients"]
            title = content["title"]
            group = token(item.entry_id, item.options["variant_id"], item.language)
        else:
            ingredients = [{"ingredient_id": "personal:" + item.id, "form": "personal",
                            "unit": item.unit, "amount": amount(item.quantity), "label": item.title,
                            "category": "other", "purchase_mode": "measured"}]
            title, group = item.title, item.id
        for ingredient in ingredients:
            identity, form = ingredient["ingredient_id"], ingredient["form"]
            mode = ingredient.get("purchase_mode", "measured")
            raw_unit, raw_amount = ingredient["unit"], ingredient["amount"]
            cupboard = mode == "check_cupboard"
            unit = None if cupboard else {"kg": "g", "l": "ml"}.get(raw_unit, raw_unit)
            value = None if raw_amount is None else Decimal(str(raw_amount)) * (1000 if not cupboard and raw_unit in {"kg", "l"} else 1)
            key = token(identity, form, "cupboard" if cupboard else unit)
            source_id = token(item.id, identity, form, raw_unit if cupboard else unit)
            row = rows.setdefault(key, row_shell(key, identity, form, unit,
                ingredient.get("label", identity), ingredient.get("category", "other"), mode))
            source = source_index.get((key, source_id))
            if source:
                source["amount"] = amount(Decimal(source["amount"]) + value) if value is not None else None
            else:
                allocations += 1
                if allocations > MAX_ALLOCATIONS:
                    fail("limit_reached", "Shopping selection exceeds 4000 source allocations")
                source = {"id": source_id, "item_id": item.id, "group_id": group,
                          "dish_title": title, "meal_title": parent.name, "date": parent.date.isoformat(),
                          "amount": amount(value), "unit": raw_unit if cupboard else unit}
                row["sources"].append(source)
                source_index[key, source_id] = source
            if not cupboard and value is not None:
                row["required"] = amount(Decimal(row["required"] or "0") + value)
    for key, saved in scope.state["rows"].items():
        if Decimal(saved["extra"]) > 0 and key not in rows:
            ingredient, form, unit = json.loads(key)
            rows[key] = row_shell(key, ingredient, form, unit, ingredient, "other", "measured")
            rows[key]["orphan"] = True
    for key, row in rows.items():
        saved = scope.state["rows"].get(key, {})
        row["extra"] = saved.get("extra", "0.000")
        row["total"] = amount(Decimal(row["required"]) + Decimal(row["extra"])) if row["required"] is not None else None
        row["extra_state"], row["extra_review"] = coverage(saved.get("extra_coverage"), row["extra"])
        for source in row["sources"]:
            basis = saved.get("sources", {}).get(source["id"])
            source["state"], source["review"] = coverage(basis, source["amount"])
            source["confirmed"] = basis is not None
        summarize(row)
    for personal in scope.state["personal"]:
        allocations += 1
        if allocations > MAX_ALLOCATIONS:
            fail("limit_reached", "Shopping selection exceeds 4000 source allocations")
        row = row_shell(token("personal-addition", personal["id"]), None, None, personal["unit"], personal["title"], "other", "measured")
        row.update(personal_id=personal["id"], required=personal["amount"], total=personal["amount"])
        row["extra_state"], row["extra_review"] = coverage(personal["coverage"], personal["amount"])
        summarize(row)
        rows[row["key"]] = row
    return {"scope": scope.descriptor(), "rows": [rows[key] for key in sorted(rows)], "revision": owner.revision}, unavailable, first_error


def summarize(row):
    parts = [(s["state"], s["review"]) for s in row["sources"]]
    if row.get("personal_id") or Decimal(row["extra"]) > 0:
        parts.append((row["extra_state"], row["extra_review"]))
    covered = [state for state, review in parts if state != "needed" and not review]
    row["review"] = any(review for _, review in parts)
    row["state"] = "review" if row["review"] else (covered[0] if covered and len(covered) == len(parts) and len(set(covered)) == 1 else "covered" if covered and len(covered) == len(parts) else "partial" if covered else "needed")
    if row["purchase_mode"] == "check_cupboard" and not any(s["confirmed"] for s in row["sources"]):
        row["state"] = "unchecked"
    if row["total"] is None:
        row["remaining"] = None
    elif row.get("personal_id"):
        row["remaining"] = "0.000" if covered else row["total"]
    else:
        covered_amount = sum((Decimal(s["amount"] or "0") for s in row["sources"] if s["state"] != "needed" and not s["review"]), Decimal(0))
        if row["extra_state"] != "needed" and not row["extra_review"]:
            covered_amount += Decimal(row["extra"])
        row["remaining"] = amount(max(Decimal(0), Decimal(row["total"]) - covered_amount))


def project(owner, scope):
    scope = owned_scope(owner, scope)
    # Existing over-budget workspaces must remain readable for explicit cleanup.
    capacity_preflight(owner, scope_ids=[scope.id], enforce_aggregate=False)
    return build(owner, scope)[0]
