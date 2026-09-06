"""
routes/reflections.py — Cook reflection + current-skill-confidence endpoints.

docs/contracts/pilot-fixtures.md §3/§10/§12/§13. Signed-in only — guests never
call these (§5/§8: a guest cook is entirely client-side, no server round-trip
for reflection at all).

POST /api/reflections is a single create-or-update endpoint (one row per
(user_id, cook_log_id), enforced by CookReflection's unique constraint) that
has to tell apart two situations arriving at the same URL (§10):
  - a mechanical retry of an already-saved reflection (network hiccup,
    double-tap) — must produce exactly one row (§13) and must NOT re-fire the
    current-confidence side effect with a stale value, and
  - a genuinely new/edited field — must persist it and, for `confidence`
    specifically, also update the user's current-skill-confidence row (§10).
The two are told apart by comparing each *present* field in the request
against what's already stored: if nothing actually changed, it's a replay.
Fields simply absent from the request body are left untouched (partial edit,
§13) — this is why every field is read with a sentinel rather than `.get(k)`
defaulting to None, so "not sent" and "sent as null" stay distinguishable.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError
from app import db
from models import CookLog, CookReflection, Skill, SkillConfidence

reflections_bp = Blueprint("reflections", __name__)

_UNSET = object()  # distinguishes "field absent from payload" from "field sent as null"

REFLECTION_FIELDS = ("outcome", "practiced_skill_confirmed", "confidence")


def _reflection_dict(row):
    return row.to_dict()


def _apply_current_confidence(user_id, skill_slug, confidence):
    """§10: writes/updates the user's *current* confidence for skill_slug.
    Silently a no-op if skill_slug doesn't resolve to a real Skill — a dish
    with no attached lesson has no skill to speak of, and the reflection row
    itself still saved fine regardless."""
    if not skill_slug or not confidence:
        return
    skill = Skill.query.filter_by(slug=skill_slug).first()
    if not skill:
        return
    row = SkillConfidence.query.filter_by(user_id=user_id, skill_id=skill.id).first()
    if row:
        row.confidence = confidence
    else:
        row = SkillConfidence(user_id=user_id, skill_id=skill.id, confidence=confidence)
        db.session.add(row)
    try:
        db.session.commit()
    except IntegrityError:
        # Lost a race to a concurrent write for the same (user, skill) - the
        # unique constraint is what actually closes this. Re-read and apply
        # this value on top (last-write-wins for a single user's own two
        # concurrent requests is fine here; there's no cross-user contention).
        db.session.rollback()
        row = SkillConfidence.query.filter_by(user_id=user_id, skill_id=skill.id).first()
        if row:
            row.confidence = confidence
            db.session.commit()


@reflections_bp.route("/reflections", methods=["POST"])
@jwt_required()
def submit_reflection():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    cook_log_id = data.get("cook_log_id")
    if not cook_log_id:
        return jsonify({"error": "cook_log_id is required"}), 400

    cook_log = CookLog.query.get(cook_log_id)
    if not cook_log or cook_log.user_id != user_id:
        return jsonify({"error": "Cook log not found"}), 404

    skill_slug = data.get("skill_slug")  # the skill *as pinned* for this cook (§9/§10) — client-supplied
    incoming = {f: (data[f] if f in data else _UNSET) for f in REFLECTION_FIELDS}

    existing = CookReflection.query.filter_by(user_id=user_id, cook_log_id=cook_log_id).first()

    if existing is None:
        row = CookReflection(
            user_id=user_id,
            cook_log_id=cook_log_id,
            skill_slug=skill_slug,
            outcome=None if incoming["outcome"] is _UNSET else incoming["outcome"],
            practiced_skill_confirmed=None if incoming["practiced_skill_confirmed"] is _UNSET else incoming["practiced_skill_confirmed"],
            confidence=None if incoming["confidence"] is _UNSET else incoming["confidence"],
        )
        db.session.add(row)
        try:
            db.session.commit()
        except IntegrityError:
            # Lost the race to a concurrent identical submission - re-read
            # and fall through to the update path below, same pattern as
            # log_cook / capture_or_reuse_snapshot elsewhere in this codebase.
            db.session.rollback()
            existing = CookReflection.query.filter_by(user_id=user_id, cook_log_id=cook_log_id).first()
            if not existing:
                raise
        else:
            # Fresh row: a genuinely new submission, never a replay - the
            # confidence side effect always fires here if confidence was sent.
            if incoming["confidence"] not in (_UNSET, None):
                _apply_current_confidence(user_id, skill_slug, incoming["confidence"])
            return jsonify({"status": "created", "reflection": _reflection_dict(row)}), 201

    # Update path: existing row (found originally, or via the race above).
    # Only fields actually present in this request are compared/touched -
    # an absent field leaves the stored value alone (§13 partial edit rule).
    changed = {}
    for field, incoming_value in incoming.items():
        if incoming_value is _UNSET:
            continue
        if getattr(existing, field) != incoming_value:
            changed[field] = incoming_value
        setattr(existing, field, incoming_value)
    if skill_slug and existing.skill_slug != skill_slug:
        existing.skill_slug = skill_slug  # keep the pin in sync with what this submission names

    if not changed:
        # Pure replay of an already-saved reflection (§10/§13) - nothing to
        # persist, and critically, no confidence side effect re-fire.
        return jsonify({"status": "already_saved", "reflection": _reflection_dict(existing)}), 200

    db.session.commit()
    if "confidence" in changed:
        _apply_current_confidence(user_id, skill_slug or existing.skill_slug, changed["confidence"])
    return jsonify({"status": "updated", "reflection": _reflection_dict(existing)}), 200


@reflections_bp.route("/cook-log/<int:cook_log_id>/reflection", methods=["GET"])
@jwt_required()
def get_reflection(cook_log_id):
    """Lets a refresh resume 'reflection still offered/resumable against the
    right cook' (§13) without guessing whether one was already submitted."""
    user_id = int(get_jwt_identity())
    cook_log = CookLog.query.get(cook_log_id)
    if not cook_log or cook_log.user_id != user_id:
        return jsonify({"error": "Cook log not found"}), 404
    row = CookReflection.query.filter_by(user_id=user_id, cook_log_id=cook_log_id).first()
    if not row:
        return jsonify({"error": "No reflection yet"}), 404
    return jsonify(_reflection_dict(row)), 200


@reflections_bp.route("/me/skills/<slug>", methods=["GET"])
@jwt_required()
def get_skill_confidence(slug):
    user_id = int(get_jwt_identity())
    skill = Skill.query.filter_by(slug=slug).first()
    if not skill:
        return jsonify({"error": "Skill not found"}), 404
    row = SkillConfidence.query.filter_by(user_id=user_id, skill_id=skill.id).first()
    return jsonify(row.to_dict() if row else {"skill": slug, "confidence": None, "updated_at": None})


@reflections_bp.route("/me/skills/<slug>", methods=["PUT"])
@jwt_required()
def put_skill_confidence(slug):
    """A later, separate direct edit (§10) — updates ONLY this current-
    confidence row, never any past CookReflection."""
    user_id = int(get_jwt_identity())
    skill = Skill.query.filter_by(slug=slug).first()
    if not skill:
        return jsonify({"error": "Skill not found"}), 404
    data = request.get_json() or {}
    confidence = data.get("confidence")
    if not confidence:
        return jsonify({"error": "confidence is required"}), 400

    row = SkillConfidence.query.filter_by(user_id=user_id, skill_id=skill.id).first()
    if row:
        row.confidence = confidence
    else:
        row = SkillConfidence(user_id=user_id, skill_id=skill.id, confidence=confidence)
        db.session.add(row)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        row = SkillConfidence.query.filter_by(user_id=user_id, skill_id=skill.id).first()
        row.confidence = confidence
        db.session.commit()
    return jsonify(row.to_dict()), 200
