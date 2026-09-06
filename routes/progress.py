"""
routes/progress.py — Cook logging, streaks, XP, badges, and progression nudges.

Nothing here is stored directly except the raw cook_logs rows — streak, XP,
level, and badge-earned status are all recomputed from that table on every
request. Slower than caching, but it can never drift out of sync with
reality, which matters more at this scale (see .claude/rules/architecture.md
philosophy: derive, don't duplicate).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from sqlalchemy.exc import IntegrityError
from app import db
from models import CookLog, BadgeAward, Dish, RecipeTier, User
from access import tier_access

progress_bp = Blueprint("progress", __name__)

XP_PER_LEVEL = {"basic": 10, "intermediate": 20, "advanced": 35}
TIER_ORDER = ["basic", "intermediate", "advanced"]

# (xp_threshold, level_name) — level_name is shown once total XP reaches threshold
LEVEL_TITLES = [
    (0, "Kitchen Newbie"),
    (100, "Home Cook"),
    (300, "Confident Cook"),
    (600, "Kitchen Pro"),
    (1000, "Head Chef"),
    (1600, "Master of the Pass"),
]

BADGE_SLUGS = ["first_dish", "first_advanced", "five_cuisines", "week_streak"]


def _compute_streak(logs):
    dates = sorted({log.cooked_at.date() for log in logs}, reverse=True)
    if not dates:
        return 0
    today = datetime.utcnow().date()
    if dates[0] not in (today, today - timedelta(days=1)):
        return 0
    cursor = dates[0]
    date_set = set(dates)
    streak = 0
    while cursor in date_set:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _compute_level(total_xp):
    level_number, level_name, next_threshold = 1, LEVEL_TITLES[0][1], LEVEL_TITLES[1][0]
    for i, (threshold, name) in enumerate(LEVEL_TITLES):
        if total_xp >= threshold:
            level_number, level_name = i + 1, name
            next_threshold = LEVEL_TITLES[i + 1][0] if i + 1 < len(LEVEL_TITLES) else None
    return level_number, level_name, next_threshold


def _check_badges(user_id, logs):
    """Awards any badge whose condition is newly met. Returns the slugs newly earned."""
    already = {b.badge_slug for b in BadgeAward.query.filter_by(user_id=user_id).all()}
    cuisines = {log.dish.cuisine for log in logs if log.dish and log.dish.cuisine}
    streak = _compute_streak(logs)

    earned_now = set()
    if logs:
        earned_now.add("first_dish")
    if any(log.level == "advanced" for log in logs):
        earned_now.add("first_advanced")
    if len(cuisines) >= 5:
        earned_now.add("five_cuisines")
    if streak >= 7:
        earned_now.add("week_streak")

    new_slugs = earned_now - already
    for slug in new_slugs:
        db.session.add(BadgeAward(user_id=user_id, badge_slug=slug))
    if new_slugs:
        db.session.commit()
    return new_slugs


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
    if not dish_slug or level not in XP_PER_LEVEL:
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

    new_badges = _check_badges(user_id, CookLog.query.filter_by(user_id=user_id).all())
    return jsonify({
        "status": "created",
        "cook_log": _cook_log_dict(log),
        "logged": True,
        "new_badges": sorted(new_badges),
    }), 201


@progress_bp.route("/progress", methods=["GET"])
@jwt_required()
def get_progress():
    user_id = int(get_jwt_identity())
    lang = request.args.get("lang", "en")
    logs = CookLog.query.filter_by(user_id=user_id).all()

    total_xp = sum(XP_PER_LEVEL[l.level] for l in logs)
    level_number, level_name, next_threshold = _compute_level(total_xp)
    streak = _compute_streak(logs)
    earned = {b.badge_slug for b in BadgeAward.query.filter_by(user_id=user_id).all()}

    return jsonify({
        "streak_days": streak,
        "xp": total_xp,
        "level_number": level_number,
        "level_name": level_name,
        "next_level_xp": next_threshold,
        "dishes_cooked": len({l.dish_id for l in logs}),
        "badges": [{"slug": s, "earned": s in earned} for s in BADGE_SLUGS],
        "nudges": _compute_nudges(logs, lang),
    })
