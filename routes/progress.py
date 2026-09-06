"""
routes/progress.py — Cook logging, cook history, and progression nudges.

Nothing here is stored directly except the raw cook_logs rows — dishes_cooked,
history, and nudges are all recomputed from that table on every request.
Slower than caching, but it can never drift out of sync with reality, which
matters more at this scale (see .claude/rules/architecture.md philosophy:
derive, don't duplicate).

XP, streaks, and badges were retired in #32 (see IMPLEMENTATION_PLAN.md) —
this route now surfaces plain cook history instead of reward mechanics.
BadgeAward rows are left alone (routes/auth.py still reads them for GDPR
export/delete) but nothing here writes new ones any more.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError
from app import db
from models import CookLog, Dish, RecipeTier, User
from access import tier_access

progress_bp = Blueprint("progress", __name__)

TIER_ORDER = ["basic", "intermediate", "advanced"]


def _compute_nudges(logs, lang):
    """A dish cooked >=2x at its highest-tried level, with a next tier that
    exists but hasn't been cooked yet, becomes a nudge to try that next tier."""
    by_dish = {}
    for log in logs:
        by_dish.setdefault(log.dish_id, []).append(log)

    nudges = []
    for dish_id, dish_logs in by_dish.items():
        levels_cooked = {l.level for l in dish_logs}
        highest = max(levels_cooked, key=TIER_ORDER.index)
        idx = TIER_ORDER.index(highest)
        if idx >= len(TIER_ORDER) - 1:
            continue  # already at advanced, nothing further to nudge toward
        next_level = TIER_ORDER[idx + 1]
        if next_level in levels_cooked:
            continue
        count_at_highest = sum(1 for l in dish_logs if l.level == highest)
        if count_at_highest < 2:
            continue
        dish = dish_logs[0].dish
        tier = RecipeTier.query.filter_by(dish_id=dish_id, level=next_level, lang=lang).first()
        if not tier:
            continue  # next tier doesn't exist in this language yet
        nudges.append({
            "dish_slug": dish.slug, "dish_title": tier.title,
            "from_level": highest, "to_level": next_level,
            "last_cooked": max(l.cooked_at for l in dish_logs).isoformat(),
        })
    nudges.sort(key=lambda n: n["last_cooked"], reverse=True)
    return nudges[:3]


def _cook_log_dict(log):
    return {
        "id": log.id,
        "session_id": log.session_id,
        "dish_slug": log.dish.slug,
        "level": log.level,
        "cooked_at": log.cooked_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def _replay_response(existing):
    """200 idempotent-replay body for a request matching an already-saved row."""
    return jsonify({
        "status": "already_saved",
        "cook_log": _cook_log_dict(existing),
        "logged": True,
        "new_badges": [],
    }), 200


def _conflict_response(existing):
    """409 body: session_id reused with a different dish/level than saved."""
    return jsonify({
        "status": "conflict",
        "error": "session_id already logged with different parameters",
        "existing_cook_log": _cook_log_dict(existing),
    }), 409


@progress_bp.route("/cook-log", methods=["POST"])
@jwt_required()
def log_cook():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    dish_slug, level = data.get("dish_slug"), data.get("level")
    session_id = data.get("session_id")
    if not dish_slug or level not in TIER_ORDER:
        return jsonify({"error": "dish_slug and a valid level required"}), 400

    dish = Dish.query.filter_by(slug=dish_slug).first()
    if not dish:
        return jsonify({"error": "Dish not found"}), 404

    allowed, reason = tier_access(level, User.query.get(user_id))
    if not allowed:
        return jsonify({"error": "This tier needs an upgrade", "code": f"needs_{reason}"}), 403

    # Idempotency key path (#48). A request with no session_id at all keeps
    # today's behavior - a plain insert, no replay/conflict bookkeeping -
    # since older/other clients may not send one yet.
    if session_id:
        existing = CookLog.query.filter_by(user_id=user_id, session_id=session_id).first()
        if existing:
            if existing.dish_id == dish.id and existing.level == level:
                return _replay_response(existing)
            return _conflict_response(existing)

    log = CookLog(user_id=user_id, dish_id=dish.id, level=level, session_id=session_id)
    db.session.add(log)
    try:
        db.session.commit()
    except IntegrityError:
        # Lost the race to a concurrent identical request - the unique
        # constraint on (user_id, session_id) is what actually closes this,
        # not the pre-check above. Re-read and resolve as replay/conflict
        # instead of letting the 500 through.
        db.session.rollback()
        existing = session_id and CookLog.query.filter_by(user_id=user_id, session_id=session_id).first()
        if not existing:
            raise
        if existing.dish_id == dish.id and existing.level == level:
            return _replay_response(existing)
        return _conflict_response(existing)

    return jsonify({
        "status": "created",
        "cook_log": _cook_log_dict(log),
        "logged": True,
    }), 201


@progress_bp.route("/progress", methods=["GET"])
@jwt_required()
def get_progress():
    user_id = int(get_jwt_identity())
    lang = request.args.get("lang", "en")
    logs = CookLog.query.filter_by(user_id=user_id).order_by(CookLog.cooked_at.desc()).all()

    return jsonify({
        "dishes_cooked": len({l.dish_id for l in logs}),
        "history": [_cook_log_dict(l) for l in logs],
        "nudges": _compute_nudges(logs, lang),
    })
