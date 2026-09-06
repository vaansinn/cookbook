"""
routes/progress.py — Cook logging and cook history.

Nothing here is stored directly except the raw cook_logs rows — dishes_cooked
and history are recomputed from that table on every request. Slower than
caching, but it can never drift out of sync with reality, which matters more
at this scale (see .claude/rules/architecture.md philosophy: derive, don't
duplicate).

XP, streaks, and badges were retired in #32 (see IMPLEMENTATION_PLAN.md).
Count-based auto-progression nudges (the #32-era "cooked this tier twice ->
suggest the next one") were retired in this reconciliation for the same
reason: business.md's agreed direction rules out automatic mastery, not just
XP/streaks/badges. This route now surfaces plain cook history only.
BadgeAward rows are left alone (routes/auth.py still reads them for GDPR
export/delete) but nothing here writes new ones any more.

get_progress still returns "badges": [] and "nudges": [] — permanently empty,
computed from nothing — purely so an already-open browser tab running an
older frontend (pre-#32 badges, or pre-this-fix nudges) doesn't crash reading
progress.badges/progress.nudges as arrays. Don't compute real values into
either key again; that's the whole point of this reconciliation.

log_cook's conflict-check compares the full (dish_slug, level, lang,
snapshot_id) tuple per pilot-fixtures.md §6, not just (dish_id, level) —
lang/snapshot_id are optional request fields so an un-upgraded client (or a
request for a pre-Wave-3 dish with no snapshot concept yet) keeps working
exactly as before, comparing against None on both sides.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError
from app import db
from models import CookLog, Dish, RecipeContentSnapshot, User
from access import tier_access

progress_bp = Blueprint("progress", __name__)

TIER_ORDER = ["basic", "intermediate", "advanced"]


def _cook_log_dict(log):
    return {
        "id": log.id,
        "session_id": log.session_id,
        "dish_slug": log.dish.slug,
        "level": log.level,
        "lang": log.lang,
        "snapshot_id": log.snapshot_id,
        "cooked_at": log.cooked_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def _matches(existing, dish, level, lang, snapshot_id):
    """The full (dish_slug, level, lang, snapshot_id) comparison (contract
    §6) — a session_id reused with this exact payload is a replay; anything
    else is a conflict."""
    return (
        existing.dish_id == dish.id
        and existing.level == level
        and existing.lang == lang
        and existing.snapshot_id == snapshot_id
    )


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
    lang = data.get("lang")  # optional — un-upgraded clients don't send one yet
    snapshot_id = data.get("snapshot_id")  # optional, same reason
    if not dish_slug or level not in TIER_ORDER:
        return jsonify({"error": "dish_slug and a valid level required"}), 400

    dish = Dish.query.filter_by(slug=dish_slug).first()
    if not dish:
        return jsonify({"error": "Dish not found"}), 404

    allowed, reason = tier_access(level, User.query.get(user_id))
    if not allowed:
        return jsonify({"error": "This tier needs an upgrade", "code": f"needs_{reason}"}), 403

    # snapshot_id, when sent at all, must actually be the snapshot for this
    # exact (dish_slug, level, lang) - otherwise a cook could be logged
    # against another tier's frozen content (e.g. a Basic cook-log request
    # pointing at an Advanced snapshot). Legacy callers that send no
    # snapshot_id at all are unaffected - this only validates a value that's
    # actually present, before it's ever attached to a CookLog row below.
    if snapshot_id is not None:
        snapshot = RecipeContentSnapshot.query.get(snapshot_id)
        if not snapshot or (snapshot.dish_slug, snapshot.level, snapshot.lang) != (dish_slug, level, lang):
            return jsonify({"error": "snapshot_id does not match dish_slug/level/lang"}), 400

    # Idempotency key path (#48). A request with no session_id at all keeps
    # today's behavior - a plain insert, no replay/conflict bookkeeping -
    # since older/other clients may not send one yet.
    if session_id:
        existing = CookLog.query.filter_by(user_id=user_id, session_id=session_id).first()
        if existing:
            if _matches(existing, dish, level, lang, snapshot_id):
                return _replay_response(existing)
            return _conflict_response(existing)

    log = CookLog(user_id=user_id, dish_id=dish.id, level=level, session_id=session_id, lang=lang, snapshot_id=snapshot_id)
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
        if _matches(existing, dish, level, lang, snapshot_id):
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
    logs = CookLog.query.filter_by(user_id=user_id).order_by(CookLog.cooked_at.desc()).all()

    return jsonify({
        "dishes_cooked": len({l.dish_id for l in logs}),
        "history": [_cook_log_dict(l) for l in logs],
        # Permanently empty - see module docstring. Never computed again.
        "badges": [],
        "nudges": [],
    })
