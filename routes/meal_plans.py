"""
routes/meal_plans.py — Named, shareable bundles of recipes.

Create/edit/delete are JWT-scoped to the owning user (see security.md).
GET /meal-plans/shared/<slug> is the one intentionally public, unauthenticated
route in the app — reachable only via an unguessable share_slug, never by
enumerating an id. It returns dish title/cuisine/level only; the actual
recipe content (steps, nutrition) is still served by the existing /dishes/<slug>
route, which enforces tier access per the viewer's own auth state — so this
doesn't open a second door around the paywall.
"""

from datetime import datetime, timedelta
import random

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from models import MealPlan, MealPlanItem, Dish, RecipeTier, User, PlanEntry, CookLog
from access import tier_access
from routes.groceries import _get_membership, _get_or_create_list, _merge_recipe_into_list

meal_plans_bp = Blueprint("meal_plans", __name__)

LEVELS = ["basic", "intermediate", "advanced"]


def _current_user_id():
    return int(get_jwt_identity())


def _dish_summary(dish_slug, level, lang):
    dish = Dish.query.filter_by(slug=dish_slug).first()
    if not dish:
        return {"dish_slug": dish_slug, "level": level, "title": dish_slug, "cuisine": None}
    tier = RecipeTier.query.filter_by(dish_id=dish.id, level=level, lang=lang).first()
    return {
        "dish_slug": dish_slug,
        "level": level,
        "title": tier.title if tier else dish_slug,
        "cuisine": dish.cuisine,
    }


def _validate_items(items, user):
    """Returns (clean_items, error_response_or_None)."""
    clean = []
    for raw in items or []:
        dish_slug, level = raw.get("dish_slug"), raw.get("level")
        if not dish_slug or not level:
            return None, (jsonify({"error": "dish_slug and level required for every item"}), 400)
        dish = Dish.query.filter_by(slug=dish_slug).first()
        if not dish or not RecipeTier.query.filter_by(dish_id=dish.id, level=level).first():
            return None, (jsonify({"error": f"Unknown dish/level: {dish_slug}/{level}"}), 404)
        allowed, reason = tier_access(level, user)
        if not allowed:
            return None, (jsonify({"error": "This tier needs an upgrade", "code": f"needs_{reason}"}), 403)
        clean.append({"dish_slug": dish_slug, "level": level})
    return clean, None


@meal_plans_bp.route("/meal-plans", methods=["GET"])
@jwt_required()
def list_meal_plans():
    plans = MealPlan.query.filter_by(user_id=_current_user_id()).order_by(MealPlan.created_at.desc()).all()
    return jsonify({"plans": [p.to_dict() for p in plans]})


@meal_plans_bp.route("/meal-plans", methods=["POST"])
@jwt_required()
def create_meal_plan():
    user = User.query.get(_current_user_id())
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    items, err = _validate_items(data.get("items"), user)
    if err:
        return err
    plan = MealPlan(user_id=user.id, name=name)
    db.session.add(plan)
    db.session.flush()
    for item in items:
        db.session.add(MealPlanItem(meal_plan_id=plan.id, **item))
    db.session.commit()
    return jsonify({"plan": plan.to_dict()}), 201


@meal_plans_bp.route("/meal-plans/<int:plan_id>", methods=["PATCH"])
@jwt_required()
def update_meal_plan(plan_id):
    user = User.query.get(_current_user_id())
    plan = MealPlan.query.get(plan_id)
    if not plan or plan.user_id != user.id:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json() or {}
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"error": "name required"}), 400
        plan.name = name
    if "items" in data:
        items, err = _validate_items(data["items"], user)
        if err:
            return err
        MealPlanItem.query.filter_by(meal_plan_id=plan.id).delete()
        for item in items:
            db.session.add(MealPlanItem(meal_plan_id=plan.id, **item))
    db.session.commit()
    return jsonify({"plan": plan.to_dict()})


@meal_plans_bp.route("/meal-plans/<int:plan_id>", methods=["DELETE"])
@jwt_required()
def delete_meal_plan(plan_id):
    plan = MealPlan.query.get(plan_id)
    if not plan or plan.user_id != _current_user_id():
        return jsonify({"error": "Not found"}), 404
    db.session.delete(plan)
    db.session.commit()
    return jsonify({"message": "Deleted"})


@meal_plans_bp.route("/meal-plans/<int:plan_id>/grocery-list", methods=["POST"])
@jwt_required()
def add_plan_to_grocery_list(plan_id):
    """Merges every recipe in the plan into the household grocery list, same
    merge path as the week planner's build-list. Tier access was enforced when
    the items were added to the plan (same contract as /plan + /plan/build-list).
    Uses each tier's default serves (plan items don't carry serves yet)."""
    plan = MealPlan.query.get(plan_id)
    if not plan or plan.user_id != _current_user_id():
        return jsonify({"error": "Not found"}), 404
    m = _get_membership()
    if not m:
        return jsonify({"error": "Join or create a household first", "code": "no_household"}), 404
    lang = (request.get_json() or {}).get("lang", "en")
    lst = _get_or_create_list(m.household_id)
    added = 0
    for item in plan.items:
        dish = Dish.query.filter_by(slug=item.dish_slug).first()
        tier = RecipeTier.query.filter_by(dish_id=dish.id if dish else -1, level=item.level, lang=lang).first()
        if not dish or not tier:
            continue
        _merge_recipe_into_list(lst, dish, tier, 1.0, lang)
        added += 1
    db.session.commit()
    return jsonify({"added_recipes": added})


@meal_plans_bp.route("/meal-plans/<int:plan_id>/apply-week", methods=["POST"])
@jwt_required()
def apply_plan_to_week(plan_id):
    """Assigns the plan's dishes to consecutive dates in the household week
    planner, starting at start_date — a meal plan acting as a reusable
    template for the dated planner."""
    plan = MealPlan.query.get(plan_id)
    if not plan or plan.user_id != _current_user_id():
        return jsonify({"error": "Not found"}), 404
    m = _get_membership()
    if not m:
        return jsonify({"error": "Join or create a household first", "code": "no_household"}), 404
    try:
        start = datetime.strptime((request.get_json() or {}).get("start_date", ""), "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "start_date must be YYYY-MM-DD"}), 400
    user = User.query.get(_current_user_id())
    entries = []
    for i, item in enumerate(plan.items):
        allowed, reason = tier_access(item.level, user)
        if not allowed:
            return jsonify({"error": "This tier needs an upgrade", "code": f"needs_{reason}"}), 403
        entries.append(PlanEntry(
            household_id=m.household_id, date=(start + timedelta(days=i)).isoformat(),
            dish_slug=item.dish_slug, level=item.level, serves=2, added_by=user.id,
        ))
    db.session.add_all(entries)
    db.session.commit()
    return jsonify({"entries": [e.to_dict() for e in entries]})


@meal_plans_bp.route("/meal-plans/generate", methods=["POST"])
@jwt_required()
def generate_meal_plan():
    """Accessible plan generation: each dish is generated at the highest tier
    the user has actually cooked *that specific dish* at (defaulting to
    'basic' for a dish never cooked), clamped to what the user's account can
    actually access — so a free account never gets an advanced item generated
    into its plan regardless of cook history. Dishes are picked for cuisine +
    meal-type variety. This replaced a global two-cooks-as-proven-tier
    escalation (#32) that tallied cook history across every dish and applied
    one level to the whole plan; there is no next-tier "level up" push here
    any more — that nudge concept still lives in the Progress page's nudge
    cards (_compute_nudges in routes/progress.py), unaffected by this fix."""
    user = User.query.get(_current_user_id())
    data = request.get_json() or {}
    name = (data.get("name") or "").strip() or "Chef's picks"
    try:
        count = min(max(int(data.get("count") or 3), 2), 7)
    except (TypeError, ValueError):
        return jsonify({"error": "count must be a number"}), 400

    cooked_by_dish = {}
    for log in CookLog.query.filter_by(user_id=user.id).all():
        cooked_by_dish.setdefault(log.dish_id, set()).add(log.level)

    def target_level(dish):
        levels = cooked_by_dish.get(dish.id)
        return max(levels, key=LEVELS.index) if levels else "basic"

    def clamp(level, dish):
        idx = LEVELS.index(level)
        while idx > 0 and not (
            tier_access(LEVELS[idx], user)[0]
            and RecipeTier.query.filter_by(dish_id=dish.id, level=LEVELS[idx]).first()
        ):
            idx -= 1
        return LEVELS[idx]

    pool = Dish.query.all()
    if not pool:
        return jsonify({"error": "No dishes available"}), 404
    random.shuffle(pool)
    picked = []
    for d in pool:  # first pass: require a cuisine AND meal type not yet in the plan
        if len(picked) == count:
            break
        if all(d.cuisine != p.cuisine and d.meal_type != p.meal_type for p in picked):
            picked.append(d)
    for d in pool:  # fill whatever variety couldn't
        if len(picked) == count:
            break
        if d not in picked:
            picked.append(d)

    plan = MealPlan(user_id=user.id, name=name)
    db.session.add(plan)
    db.session.flush()
    for d in picked:
        db.session.add(MealPlanItem(meal_plan_id=plan.id, dish_slug=d.slug, level=clamp(target_level(d), d)))
    db.session.commit()
    return jsonify({"plan": plan.to_dict()}), 201


@meal_plans_bp.route("/meal-plans/shared/<slug>", methods=["GET"])
def get_shared_meal_plan(slug):
    """Public, unauthenticated — the one deliberately open route in the app."""
    plan = MealPlan.query.filter_by(share_slug=slug).first()
    if not plan:
        return jsonify({"error": "Not found"}), 404
    lang = request.args.get("lang", "en")
    return jsonify({
        "name": plan.name,
        "owner_name": plan.user.display_name,
        "items": [_dish_summary(i.dish_slug, i.level, lang) for i in plan.items],
    })
