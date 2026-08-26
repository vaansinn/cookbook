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

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from models import MealPlan, MealPlanItem, Dish, RecipeTier, User
from access import tier_access

meal_plans_bp = Blueprint("meal_plans", __name__)


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
