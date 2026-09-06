"""
routes/snapshots.py — recipe content snapshot capture + read.

docs/contracts/pilot-fixtures.md §1 / §5. Both routes accept an unauthenticated
request (optional JWT) — Basic-tier snapshots are readable by guests exactly
like Basic recipe viewing already is (routes/recipes.py's get_dish); every
other tier still needs the requester's *current* access, re-checked on every
read, not just at capture time.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import User, RecipeContentSnapshot
from snapshots import capture_or_reuse_snapshot, check_snapshot_access
from access import tier_access

snapshots_bp = Blueprint("snapshots", __name__)

TIER_ORDER = ["basic", "intermediate", "advanced"]


def _current_user():
    user_id = get_jwt_identity()
    return User.query.get(int(user_id)) if user_id else None


def _snapshot_dict(row):
    return {
        "snapshot_id": row.id,
        "dish_slug": row.dish_slug,
        "level": row.level,
        "lang": row.lang,
        "content": row.content,
    }


@snapshots_bp.route("/recipe-snapshot", methods=["POST"])
@jwt_required(optional=True)
def start_recipe_snapshot():
    """Capture-or-reuse (contract §1) for the start of a cook session — called
    for a signed-in visitor or a guest alike. Guests can only ever reach this
    successfully for level=basic, same as Basic recipe viewing (access.py)."""
    data = request.get_json() or {}
    dish_slug, level, lang = data.get("dish_slug"), data.get("level"), data.get("lang")
    if not dish_slug or level not in TIER_ORDER or lang not in ("en", "de"):
        return jsonify({"error": "dish_slug, a valid level, and lang are required"}), 400

    allowed, reason = tier_access(level, _current_user())
    if not allowed:
        return jsonify({"error": "This tier needs an upgrade", "code": f"needs_{reason}"}), 403

    snapshot, error = capture_or_reuse_snapshot(dish_slug, level, lang)
    if error == "dish_not_found":
        return jsonify({"error": "Dish not found"}), 404
    if error == "tier_not_found":
        return jsonify({"error": "No content for this level/language yet"}), 404

    return jsonify(_snapshot_dict(snapshot)), 200


@snapshots_bp.route("/recipe-snapshot/<int:snapshot_id>", methods=["GET"])
@jwt_required(optional=True)
def read_recipe_snapshot(snapshot_id):
    """The one legitimate re-fetch: a page reload re-requesting the *same*
    snapshot_id it already has (contract §1). The caller must also pass the
    dish_slug/level/lang it believes this snapshot is — a mismatch against
    what's actually stored is rejected, not silently served, so a client
    can't be tricked (or trick itself) into displaying/authorizing the wrong
    recipe's content under a guessed id. Access is re-checked against the
    requester's *current* tier, every time — see check_snapshot_access."""
    row = RecipeContentSnapshot.query.get(snapshot_id)
    if not row:
        return jsonify({"error": "Snapshot not found"}), 404

    dish_slug, level, lang = request.args.get("dish_slug"), request.args.get("level"), request.args.get("lang")
    if (dish_slug, level, lang) != (row.dish_slug, row.level, row.lang):
        return jsonify({"error": "dish_slug/level/lang do not match this snapshot"}), 400

    user = _current_user()
    allowed, reason = check_snapshot_access(row, user)
    if not allowed:
        return jsonify({"error": "This tier needs an upgrade", "code": f"needs_{reason}"}), 403

    return jsonify(_snapshot_dict(row)), 200
