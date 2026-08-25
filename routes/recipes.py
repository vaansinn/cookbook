"""
routes/recipes.py — Read-only dish/recipe endpoints.

Recipe content is public: browsing and Basic never require a token.
Intermediate needs an account, Advanced needs a premium account (P6
paywall, see access.py) -- get_dish uses an optional JWT to figure out
who's asking and returns the teaser shape (models.RecipeTier.to_dict
with full=False) for any tier the caller can't fully access yet.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import Dish, RecipeTier, User
from access import tier_access

recipes_bp = Blueprint("recipes", __name__)


@recipes_bp.route("/dishes", methods=["GET"])
def list_dishes():
    lang = request.args.get("lang", "en")
    q = (request.args.get("q") or "").strip().lower()
    cuisine = request.args.get("cuisine")
    meal_type = request.args.get("meal_type")
    method = request.args.get("method")
    diet = request.args.get("diet")
    max_kcal = request.args.get("max_kcal", type=int)

    dishes = Dish.query.all()
    out = []
    for dish in dishes:
        d = dish.to_dict(lang=lang)
        if d["summary"] is None:
            continue  # no content in this language yet
        if cuisine and (dish.cuisine or "").lower() != cuisine.lower():
            continue
        if meal_type and (dish.meal_type or "").lower() != meal_type.lower():
            continue
        if method and method not in (dish.methods or []):
            continue
        if max_kcal and d["summary"]["kcal"] and d["summary"]["kcal"] > max_kcal:
            continue
        if diet:
            tier_for_check = next((t for t in dish.tiers if t.lang == lang), None)
            if not tier_for_check or diet not in (tier_for_check.diet_flags or []):
                continue
        if q:
            haystack = f"{d['summary']['title']} {dish.cuisine or ''}".lower()
            ing_text = " ".join(
                i.get("text", "") for t in dish.tiers if t.lang == lang for i in (t.ingredients or [])
            ).lower()
            if q not in haystack and q not in ing_text:
                continue
        out.append(d)

    out.sort(key=lambda d: d["summary"]["title"])
    return jsonify(out)


@recipes_bp.route("/dishes/<slug>", methods=["GET"])
@jwt_required(optional=True)
def get_dish(slug):
    lang = request.args.get("lang", "en")
    dish = Dish.query.filter_by(slug=slug).first()
    if not dish:
        return jsonify({"error": "Dish not found"}), 404

    user_id = get_jwt_identity()
    user = User.query.get(int(user_id)) if user_id else None

    tiers = {}
    for t in dish.tiers:
        if t.lang != lang:
            continue
        allowed, reason = tier_access(t.level, user)
        d = t.to_dict(full=allowed)
        if not allowed:
            d["locked"] = True
            d["unlock_reason"] = reason
        tiers[t.level] = d
    if not tiers:
        return jsonify({"error": "No content for this language yet"}), 404

    return jsonify({
        "slug": dish.slug,
        "cuisine": dish.cuisine,
        "meal_type": dish.meal_type,
        "methods": dish.methods or [],
        "tiers": tiers,
    })


@recipes_bp.route("/filters", methods=["GET"])
def get_filters():
    """Distinct cuisines/meal types/methods currently in the DB, for filter chips."""
    lang = request.args.get("lang", "en")
    dishes = [d for d in Dish.query.all() if any(t.lang == lang for t in d.tiers)]
    cuisines = sorted({d.cuisine for d in dishes if d.cuisine})
    meal_types = sorted({d.meal_type for d in dishes if d.meal_type})
    methods = sorted({m for d in dishes for m in (d.methods or [])})
    return jsonify({"cuisines": cuisines, "meal_types": meal_types, "methods": methods})
