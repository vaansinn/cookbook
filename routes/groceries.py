"""
routes/groceries.py — Household, shared grocery list, and week planner endpoints.

All routes require a JWT and act on the caller's household — never a
household_id passed by the client, so one account can never touch another
household's data by guessing an id (see .claude/rules/security.md).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from models import Household, HouseholdMember, GroceryList, GroceryItem, PlanEntry, Dish, RecipeTier, FoodItem, User
from access import tier_access

groceries_bp = Blueprint("groceries", __name__)


def _current_user_id():
    return int(get_jwt_identity())


def _get_membership():
    return HouseholdMember.query.filter_by(user_id=_current_user_id()).first()


def _get_or_create_list(household_id):
    lst = GroceryList.query.filter_by(household_id=household_id).first()
    if not lst:
        lst = GroceryList(household_id=household_id)
        db.session.add(lst)
        db.session.commit()
    return lst


# ── Household ──────────────────────────────────────────────────────────────

@groceries_bp.route("/household", methods=["GET"])
@jwt_required()
def get_household():
    m = _get_membership()
    if not m:
        return jsonify({"household": None})
    return jsonify({"household": m.household.to_dict()})


@groceries_bp.route("/household", methods=["POST"])
@jwt_required()
def create_household():
    if _get_membership():
        return jsonify({"error": "Already in a household"}), 409
    data = request.get_json() or {}
    household = Household(name=data.get("name") or "Our kitchen")
    db.session.add(household)
    db.session.flush()
    db.session.add(HouseholdMember(household_id=household.id, user_id=_current_user_id(), role="owner"))
    db.session.commit()
    return jsonify({"household": household.to_dict()}), 201


@groceries_bp.route("/household/join", methods=["POST"])
@jwt_required()
def join_household():
    if _get_membership():
        return jsonify({"error": "Already in a household"}), 409
    code = (request.get_json() or {}).get("code", "").strip().lower()
    household = Household.query.filter_by(invite_code=code).first()
    if not household:
        return jsonify({"error": "Invalid invite code", "code": "invalid_code"}), 404
    db.session.add(HouseholdMember(household_id=household.id, user_id=_current_user_id(), role="member"))
    db.session.commit()
    return jsonify({"household": household.to_dict()})


@groceries_bp.route("/household/leave", methods=["POST"])
@jwt_required()
def leave_household():
    m = _get_membership()
    if not m:
        return jsonify({"error": "Not in a household"}), 404
    db.session.delete(m)
    db.session.commit()
    return jsonify({"message": "Left household"})


# ── Grocery list ───────────────────────────────────────────────────────────

@groceries_bp.route("/grocery-list", methods=["GET"])
@jwt_required()
def get_grocery_list():
    m = _get_membership()
    if not m:
        return jsonify({"error": "Join or create a household first", "code": "no_household"}), 404
    lst = _get_or_create_list(m.household_id)
    items = GroceryItem.query.filter_by(list_id=lst.id).order_by(GroceryItem.created_at).all()
    return jsonify({"items": [i.to_dict() for i in items]})


@groceries_bp.route("/grocery-list/items", methods=["POST"])
@jwt_required()
def add_grocery_items():
    m = _get_membership()
    if not m:
        return jsonify({"error": "Join or create a household first", "code": "no_household"}), 404
    lst = _get_or_create_list(m.household_id)
    data = request.get_json() or {}
    lang = data.get("lang", "en")

    if data.get("text"):
        item = GroceryItem(list_id=lst.id, text=data["text"].strip(), added_by=_current_user_id())
        db.session.add(item)
        db.session.commit()
        return jsonify({"items": [item.to_dict()]}), 201

    dish_slug = data.get("dish_slug")
    level = data.get("level")
    serves = data.get("serves")
    if not dish_slug or not level:
        return jsonify({"error": "text, or dish_slug+level, required"}), 400

    dish = Dish.query.filter_by(slug=dish_slug).first()
    tier = RecipeTier.query.filter_by(dish_id=dish.id if dish else -1, level=level, lang=lang).first()
    if not dish or not tier:
        return jsonify({"error": "Dish/tier not found"}), 404
    allowed, reason = tier_access(level, User.query.get(_current_user_id()))
    if not allowed:
        return jsonify({"error": "This tier needs an upgrade", "code": f"needs_{reason}"}), 403
    factor = (serves or tier.serves) / tier.serves

    added = _merge_recipe_into_list(lst, dish, tier, factor, lang)
    db.session.commit()
    return jsonify({"items": [i.to_dict() for i in added]}), 201


def _merge_recipe_into_list(lst, dish, tier, factor, lang):
    """Adds tier's ingredients to lst, merging by food_slug (summed in grams)
    with an already-existing unchecked item of the same food. Returns the
    list of GroceryItem rows that were touched (new or updated)."""
    touched = []
    source = {"dish_slug": dish.slug, "dish_title": tier.title}
    for ing in tier.ingredients or []:
        qty_g = (ing.get("qty_g") or 0) * factor
        food_slug = ing.get("food_slug")
        if food_slug:
            food = FoodItem.query.filter_by(slug=food_slug).first()
            display_name = (food.names or {}).get(lang) if food else None
            display_name = display_name or ing["text"]
            existing = GroceryItem.query.filter_by(list_id=lst.id, food_slug=food_slug, checked=False).first()
            if existing:
                existing.qty_g = (existing.qty_g or 0) + qty_g
                sources = list(existing.sources or [])
                if not any(s["dish_slug"] == source["dish_slug"] for s in sources):
                    sources.append(source)
                existing.sources = sources
                touched.append(existing)
                continue
            item = GroceryItem(list_id=lst.id, food_slug=food_slug, text=display_name, qty_g=qty_g, sources=[source])
        else:
            item = GroceryItem(list_id=lst.id, text=ing["text"], sources=[source])
        db.session.add(item)
        touched.append(item)
    return touched


@groceries_bp.route("/grocery-list/items/<int:item_id>", methods=["PATCH"])
@jwt_required()
def update_grocery_item(item_id):
    m = _get_membership()
    item = GroceryItem.query.get(item_id)
    if not m or not item or item.list.household_id != m.household_id:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json() or {}
    if "checked" in data:
        item.checked = bool(data["checked"])
    db.session.commit()
    return jsonify({"item": item.to_dict()})


@groceries_bp.route("/grocery-list/items/<int:item_id>", methods=["DELETE"])
@jwt_required()
def delete_grocery_item(item_id):
    m = _get_membership()
    item = GroceryItem.query.get(item_id)
    if not m or not item or item.list.household_id != m.household_id:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(item)
    db.session.commit()
    return jsonify({"message": "Deleted"})


@groceries_bp.route("/grocery-list/clear-checked", methods=["POST"])
@jwt_required()
def clear_checked():
    m = _get_membership()
    if not m:
        return jsonify({"error": "Join or create a household first", "code": "no_household"}), 404
    lst = _get_or_create_list(m.household_id)
    GroceryItem.query.filter_by(list_id=lst.id, checked=True).delete()
    db.session.commit()
    return jsonify({"message": "Cleared"})


# ── Week planner ───────────────────────────────────────────────────────────

@groceries_bp.route("/plan", methods=["GET"])
@jwt_required()
def get_plan():
    m = _get_membership()
    if not m:
        return jsonify({"entries": []})
    entries = PlanEntry.query.filter_by(household_id=m.household_id).order_by(PlanEntry.date).all()
    return jsonify({"entries": [e.to_dict() for e in entries]})


@groceries_bp.route("/plan", methods=["POST"])
@jwt_required()
def add_plan_entry():
    m = _get_membership()
    if not m:
        return jsonify({"error": "Join or create a household first", "code": "no_household"}), 404
    data = request.get_json() or {}
    for field in ("date", "dish_slug", "level"):
        if not data.get(field):
            return jsonify({"error": f"{field} required"}), 400
    allowed, reason = tier_access(data["level"], User.query.get(_current_user_id()))
    if not allowed:
        return jsonify({"error": "This tier needs an upgrade", "code": f"needs_{reason}"}), 403
    entry = PlanEntry(
        household_id=m.household_id, date=data["date"], dish_slug=data["dish_slug"],
        level=data["level"], serves=data.get("serves", 2), added_by=_current_user_id(),
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify({"entry": entry.to_dict()}), 201


@groceries_bp.route("/plan/<int:entry_id>", methods=["DELETE"])
@jwt_required()
def delete_plan_entry(entry_id):
    m = _get_membership()
    entry = PlanEntry.query.get(entry_id)
    if not m or not entry or entry.household_id != m.household_id:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"message": "Deleted"})


@groceries_bp.route("/plan/build-list", methods=["POST"])
@jwt_required()
def build_list_from_plan():
    """Adds every planned dish's ingredients to the grocery list in one go,
    merging by food_slug same as adding a single recipe."""
    m = _get_membership()
    if not m:
        return jsonify({"error": "Join or create a household first", "code": "no_household"}), 404
    lang = (request.get_json() or {}).get("lang", "en")
    lst = _get_or_create_list(m.household_id)
    entries = PlanEntry.query.filter_by(household_id=m.household_id).all()

    touched_ids = set()
    for entry in entries:
        dish = Dish.query.filter_by(slug=entry.dish_slug).first()
        tier = RecipeTier.query.filter_by(dish_id=dish.id if dish else -1, level=entry.level, lang=lang).first()
        if not dish or not tier:
            continue
        factor = entry.serves / tier.serves
        for item in _merge_recipe_into_list(lst, dish, tier, factor, lang):
            db.session.flush()
            touched_ids.add(item.id)

    db.session.commit()
    items = GroceryItem.query.filter_by(list_id=lst.id).order_by(GroceryItem.created_at).all()
    return jsonify({"items": [i.to_dict() for i in items]})
