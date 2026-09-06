"""Owner-scoped, revision-checked reflection writes with durable retry receipts."""
import hashlib
import json
from uuid import UUID

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from models import CookLog, CookReflection, Skill, SkillConfidence, ReflectionMutation, User

reflections_bp = Blueprint("reflections", __name__)
FIELDS = ("outcome", "practiced_skill_confirmed", "confidence")
CONFIDENCES = ("unknown", "wants_guidance", "comfortable")
OUTCOMES = ("happy", "mixed", "need_help")


def _skill(cook):
    content = cook.snapshot.content if cook.snapshot else {}
    if content.get("schema_version", 0) < 2:
        return None
    skills = {lesson.get("skill") for lesson in content.get("lessons", {}).values() if lesson.get("skill")}
    return next(iter(skills)) if len(skills) == 1 else None


def _context(cook, row):
    data = row.to_dict() if row else {"cook_log_id": cook.id, "revision": 0,
        "outcome": None, "practiced_skill_confirmed": None, "confidence": None}
    data["focus_skill"] = _skill(cook)
    if not row:
        data["skill_slug"] = data["focus_skill"]
    return data


def _lock_user(user_id):
    # Portable write lock before reads: PostgreSQL row lock; SQLite writer lock.
    # All confidence/reflection writes take this lock in the same order.
    return db.session.execute(db.update(User).where(User.id == user_id).values(id=User.id)).rowcount


def _set_confidence(user_id, slug, value):
    skill = Skill.query.filter_by(slug=slug).first()
    if not skill:
        raise ValueError("Captured skill is no longer available")
    row = SkillConfidence.query.filter_by(user_id=user_id, skill_id=skill.id).first()
    if row is None:
        row = SkillConfidence(user_id=user_id, skill_id=skill.id)
        db.session.add(row)
    row.confidence = value
    return row


def _error(message, status=400):
    db.session.rollback()
    return jsonify({"error": message}), status


@reflections_bp.route("/reflections", methods=["POST"])
@jwt_required()
def submit_reflection():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or set(data) - {*FIELDS, "cook_log_id", "skill_slug", "mutation_id", "expected_revision"}:
        return _error("A JSON object with supported reflection fields is required")
    cook_id = data.get("cook_log_id")
    if type(cook_id) is not int or not 0 < cook_id <= 2147483647:
        return _error("Positive cook_log_id required")
    for key, allowed in (("outcome", OUTCOMES), ("confidence", CONFIDENCES)):
        value = data.get(key)
        if value is not None and (not isinstance(value, str) or value not in allowed):
            return _error(f"Invalid {key}")
    if data.get("practiced_skill_confirmed") is not None and type(data["practiced_skill_confirmed"]) is not bool:
        return _error("practiced_skill_confirmed must be boolean or null")
    supplied_skill = data.get("skill_slug")
    if supplied_skill is not None and (not isinstance(supplied_skill, str) or not 0 < len(supplied_skill) <= 80):
        return _error("Invalid skill_slug")
    mutation = data.get("mutation_id")
    versioned = "mutation_id" in data or "expected_revision" in data
    if versioned:
        try:
            if not isinstance(mutation, str) or str(UUID(mutation)) != mutation:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            return _error("Canonical UUID mutation_id required")
        if type(data.get("expected_revision")) is not int or not 0 <= data["expected_revision"] < 2147483647:
            return _error("Nonnegative expected_revision required")
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    if not _lock_user(user_id):
        return _error("Account not found", 404)
    cook = CookLog.query.filter_by(id=cook_id, user_id=user_id).with_for_update().first()
    if not cook:
        return _error("Cook log not found", 404)
    if mutation:
        receipt = ReflectionMutation.query.filter_by(user_id=user_id, mutation_id=mutation).first()
        if receipt:
            if receipt.request_digest != digest:
                return _error("mutation_id already used with different content", 409)
            result = receipt.result
            db.session.rollback()
            return jsonify(result), 200
    row = CookReflection.query.filter_by(user_id=user_id, cook_log_id=cook_id).first()
    current = _context(cook, row)
    incoming = {key: data[key] for key in FIELDS if key in data}
    if (versioned and data["expected_revision"] != current["revision"]) or (
        not versioned and row and any(getattr(row, k) != v for k, v in incoming.items())
    ):
        db.session.rollback()
        return jsonify({"error": "Reflection changed; review the current values", "current_reflection": current}), 409
    focus = current["focus_skill"]
    if supplied_skill is not None and supplied_skill != focus:
        return _error("Skill does not match this cook's retained teaching content")
    if not focus and any(incoming.get(k) is not None for k in ("confidence", "practiced_skill_confirmed")):
        return _error("No retained teaching identity; only outcome is available")
    created = row is None
    changed = row is None or any(getattr(row, k) != v for k, v in incoming.items())
    if row is None and not any(v is not None for v in incoming.values()):
        result = {"status": "skipped", "reflection": current}
    else:
        if row is None:
            row = CookReflection(user_id=user_id, cook_log_id=cook_id, skill_slug=focus, revision=0)
            db.session.add(row)
        for key, value in incoming.items():
            setattr(row, key, value)
        if changed or versioned:
            row.revision += 1
            if incoming.get("confidence") is not None:
                try:
                    _set_confidence(user_id, focus, incoming["confidence"])
                except ValueError as error:
                    return _error(str(error), 409)
        db.session.flush()
        result = {"status": "created" if created else "updated" if changed or versioned else "already_saved",
                  "reflection": _context(cook, row)}
    if mutation:
        db.session.add(ReflectionMutation(user_id=user_id, mutation_id=mutation, cook_log_id=cook_id,
                                         request_digest=digest, result=result))
    db.session.commit()
    return jsonify(result), 201 if created and result["status"] == "created" else 200


@reflections_bp.route("/cook-log/<int:cook_log_id>/reflection", methods=["GET"])
@jwt_required()
def get_reflection(cook_log_id):
    user_id = int(get_jwt_identity())
    cook = CookLog.query.filter_by(id=cook_log_id, user_id=user_id).first()
    if not cook:
        return jsonify({"error": "Cook log not found"}), 404
    row = CookReflection.query.filter_by(user_id=user_id, cook_log_id=cook_log_id).first()
    return jsonify(_context(cook, row)), 200


@reflections_bp.route("/me/skills", methods=["GET"])
@jwt_required()
def list_confidences():
    rows = SkillConfidence.query.filter_by(user_id=int(get_jwt_identity())).all()
    states = {r.skill.slug: r.to_dict() for r in rows}
    if "simmering" not in states and Skill.query.filter_by(slug="simmering").first():
        states["simmering"] = {"skill": "simmering", "confidence": None, "updated_at": None}
    return jsonify(list(states.values()))


@reflections_bp.route("/me/skills/<slug>", methods=["GET", "PUT"])
@jwt_required()
def skill_confidence(slug):
    user_id = int(get_jwt_identity())
    if request.method == "PUT":
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or set(data) != {"confidence"} or data.get("confidence") not in CONFIDENCES:
            return _error("Valid confidence required")
        if not _lock_user(user_id):
            return _error("Account not found", 404)
    skill = Skill.query.filter_by(slug=slug).first()
    if not skill:
        return _error("Skill not found", 404)
    if request.method == "PUT":
        row = _set_confidence(user_id, slug, data["confidence"])
        db.session.commit()
    else:
        row = SkillConfidence.query.filter_by(user_id=user_id, skill_id=skill.id).first()
    return jsonify(row.to_dict() if row else {"skill": slug, "confidence": None, "updated_at": None})
