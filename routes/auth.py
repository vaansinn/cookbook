"""
routes/auth.py — Authentication endpoints.

Register / login / me. Password-reset and email-verification flows are
deferred to the P5 hardening pass (see PIPELINE.md) — not needed to prove
the Phase 1 gate (register, log in, switch language/theme).
"""

import sqlite3

from flask import Blueprint, current_app, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from werkzeug.exceptions import BadRequest
from app import db, bcrypt
from planning_models import consistent_planning_read
from models import (
    User, CookLog, BadgeAward, HouseholdMember, Household, GroceryList, GroceryItem, PlanEntry,
    CookReflection, SkillConfidence, ReflectionMutation,
    Favorite, MealPlan,
)

auth_bp = Blueprint("auth", __name__)

MIN_PASSWORD_LENGTH = 8
# Transport/resource bounds, not a new credential policy. The request bound is
# local to these two endpoints; the application's body limit is configured elsewhere.
MAX_AUTH_JSON_BYTES = 64 * 1024
MAX_AUTH_FIELD_BYTES = 4096


def _auth_input(*, registering=False):
    if not request.is_json:
        return None, (jsonify({"error": "JSON object required"}), 400)
    try:
        raw = request.stream.read(MAX_AUTH_JSON_BYTES + 1)
        if len(raw) > MAX_AUTH_JSON_BYTES:
            return None, (jsonify({"error": "Authentication payload too large"}), 400)
        data = current_app.json.loads(raw)
    except (BadRequest, ValueError, RecursionError):
        return None, (jsonify({"error": "Invalid JSON object"}), 400)
    if not isinstance(data, dict):
        return None, (jsonify({"error": "JSON object required"}), 400)
    if not data.get("email") or not data.get("password"):
        return None, (jsonify({"error": "email and password required"}), 400)

    for field in ("email", "password", "display_name"):
        value = data.get(field)
        if field == "display_name" and value is None:
            continue
        if not isinstance(value, str) or (field != "display_name" and not value):
            return None, (jsonify({"error": f"{field} must be a non-empty string"}), 400)
        # Check characters before allocating encoded bytes; reject lone JSON
        # surrogates before either the database driver or bcrypt encodes them.
        try:
            too_large = len(value) > MAX_AUTH_FIELD_BYTES or len(value.encode("utf-8")) > MAX_AUTH_FIELD_BYTES
        except UnicodeError:
            return None, (jsonify({"error": f"Invalid {field}"}), 400)
        if too_large:
            return None, (jsonify({"error": f"{field} too long"}), 400)
        if field != "password" and "\x00" in value:
            return None, (jsonify({"error": f"Invalid {field}"}), 400)

    data["email"] = data["email"].strip().lower()
    data["display_name"] = (data.get("display_name") or "").strip() or None
    if not data["email"]:
        return None, (jsonify({"error": "email and password required"}), 400)
    if registering:
        # Match existing storage sizes, without imposing email syntax rules.
        for field in ("email", "display_name"):
            if len(data[field] or "") > User.__table__.c[field].type.length:
                return None, (jsonify({"error": f"{field} too long"}), 400)
    return data, None


def _bcrypt_password(password):
    # bcrypt < 5 ignored bytes after 72, even in the middle of a UTF-8 character.
    # Preserve those hashes with bcrypt 5 too; never trim/normalize passwords or
    # enable Flask-Bcrypt's incompatible long-password prehash as a side effect.
    # Registration keeps the SAME legacy semantics, including collisions for
    # shared 72-byte prefixes. Changing that requires a separate password policy.
    encoded = password.encode("utf-8")
    return encoded if bcrypt._handle_long_passwords else encoded[:72]


def _email_conflict(error):
    original = error.orig
    if isinstance(original, sqlite3.IntegrityError):
        return (
            getattr(original, "sqlite_errorcode", None) == sqlite3.SQLITE_CONSTRAINT_UNIQUE
            and str(original) == "UNIQUE constraint failed: users.email"
        )
    diagnostic = getattr(original, "diag", None)
    # The existing unnamed email unique constraint uses this PostgreSQL name.
    # Unknown constraints must remain backend errors, not misleading conflicts.
    return (
        getattr(original, "pgcode", None) == "23505"
        and getattr(diagnostic, "table_name", None) == "users"
        and getattr(diagnostic, "constraint_name", None) == "users_email_key"
    )


def _backend_error():
    db.session.rollback()
    # Exception messages/SQL parameters can contain credentials or connection secrets.
    current_app.logger.error("Authentication backend operation failed")
    return jsonify({"error": "Authentication temporarily unavailable"}), 503


@auth_bp.errorhandler(SQLAlchemyError)
def auth_database_error(_error):
    return _backend_error()


def _password_backend_error(password):
    # Some bcrypt versions reject embedded NULs. Preserve passwords on versions
    # that accept them, but return a controlled input error when they are rejected.
    if "\x00" in password:
        db.session.rollback()
        return jsonify({"error": "Invalid password"}), 400
    return _backend_error()


def _password_error(password):
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    return None


@auth_bp.route("/register", methods=["POST"])
def register():
    if not current_app.config.get("AUTH_ALLOW_LEGACY_TOKENS", True):
        return jsonify({"error": "Use the session authentication API", "code": "upgrade_required"}), 410
    data, error = _auth_input(registering=True)
    if error is not None:
        return error

    pw_error = _password_error(data["password"])
    if pw_error:
        return jsonify({"error": pw_error, "code": "password_too_short", "min": MIN_PASSWORD_LENGTH}), 400

    try:
        if User.query.filter(db.func.lower(User.email) == data["email"]).first():
            return jsonify({"error": "Email already registered", "code": "email_taken"}), 409

        try:
            hashed = bcrypt.generate_password_hash(_bcrypt_password(data["password"])).decode("utf-8")
        except ValueError:
            return _password_backend_error(data["password"])
        user = User(email=data["email"], password_hash=hashed, display_name=data["display_name"])
        db.session.add(user)
        db.session.commit()

        token = create_access_token(identity=str(user.id))
        return jsonify({"token": token, "user": user.to_dict()}), 201
    except IntegrityError as error:
        if _email_conflict(error):
            db.session.rollback()
            return jsonify({"error": "Email already registered", "code": "email_taken"}), 409
        return _backend_error()
    except (SQLAlchemyError, ValueError, RuntimeError):
        return _backend_error()


@auth_bp.route("/login", methods=["POST"])
def login():
    if not current_app.config.get("AUTH_ALLOW_LEGACY_TOKENS", True):
        return jsonify({"error": "Use the session authentication API", "code": "upgrade_required"}), 410
    data, error = _auth_input()
    if error is not None:
        return error

    try:
        user = User.query.filter(db.func.lower(User.email) == data["email"]).first()
        try:
            valid = user is not None and bcrypt.check_password_hash(user.password_hash, _bcrypt_password(data["password"]))
        except ValueError:
            return _password_backend_error(data["password"])
        if not valid:
            return jsonify({"error": "Invalid credentials", "code": "invalid_credentials"}), 401

        token = create_access_token(identity=str(user.id))
        return jsonify({"token": token, "user": user.to_dict()})
    except (SQLAlchemyError, ValueError, RuntimeError):
        return _backend_error()


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user.to_dict())


# ── GDPR: export & delete ────────────────────────────────────────────────────

@auth_bp.route("/me/export", methods=["GET"])
@jwt_required()
@consistent_planning_read
def export_account():
    """Everything the app holds about the requesting user, as one JSON blob."""
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    logs = CookLog.query.filter_by(user_id=user_id).all()
    badges = BadgeAward.query.filter_by(user_id=user_id).all()
    reflections = CookReflection.query.filter_by(user_id=user_id).all()
    skill_confidences = SkillConfidence.query.filter_by(user_id=user_id).all()
    membership = HouseholdMember.query.filter_by(user_id=user_id).first()

    plan_entries, grocery_items = [], []
    if membership:
        plan_entries = PlanEntry.query.filter_by(household_id=membership.household_id, added_by=user_id).all()
        lst = GroceryList.query.filter_by(household_id=membership.household_id).first()
        if lst:
            grocery_items = GroceryItem.query.filter_by(list_id=lst.id, added_by=user_id).all()

    from planning_models import export_private_planning
    return jsonify({
        "private_planning": export_private_planning(user_id),
        "favorites": [{"dish_slug": f.dish_slug, "created_at": f.created_at.isoformat() if f.created_at else None}
                      for f in Favorite.query.filter_by(user_id=user_id).all()],
        "legacy_meal_plans": [p.to_dict() for p in MealPlan.query.filter_by(user_id=user_id).all()],
        "profile": user.to_dict(),
        "cook_logs": [
            {"id": l.id, "session_id": l.session_id, "lang": l.lang, "snapshot_id": l.snapshot_id,
             "dish_slug": l.dish.slug if l.dish else None, "level": l.level, "cooked_at": l.cooked_at.isoformat()}
            for l in logs
        ],
        "badges": [{"slug": b.badge_slug, "earned_at": b.earned_at.isoformat()} for b in badges],
        "cook_reflections": [r.to_dict() for r in reflections],
        "skill_confidences": [c.to_dict() for c in skill_confidences],
        "household": membership.household.to_dict() if membership else None,
        "plan_entries_added": [e.to_dict() for e in plan_entries],
        "grocery_items_added": [i.to_dict() for i in grocery_items],
    })


@auth_bp.route("/me", methods=["DELETE"])
@jwt_required()
def delete_account():
    """
    Deletes the user's own personal data unconditionally (login, cook history,
    badges, reflections/confidence). Shared household data (grocery list, plan) is only deleted if
    this was the household's last member — otherwise it's left intact for
    the remaining member(s), since it isn't solely this user's data.
    """
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    from planning_models import delete_private_planning
    # Same lock order as private planning/reflection commands; dependent deletes
    # and account removal remain one transaction, never a partially deleted user.
    if not db.session.execute(db.update(User).where(User.id == user_id).values(id=User.id)).rowcount:
        return jsonify({"error": "User not found"}), 404
    delete_private_planning(user_id)
    Favorite.query.filter_by(user_id=user_id).delete()
    for plan in MealPlan.query.filter_by(user_id=user_id).all():
        db.session.delete(plan)  # existing relationship cascades its own items
    # Keep shared rows under the existing retention contract, but remove this
    # account's nullable attribution; never assign it to another household member.
    GroceryItem.query.filter_by(added_by=user_id).update({"added_by": None}, synchronize_session=False)
    PlanEntry.query.filter_by(added_by=user_id).update({"added_by": None}, synchronize_session=False)
    ReflectionMutation.query.filter_by(user_id=user_id).delete()
    CookReflection.query.filter_by(user_id=user_id).delete()
    SkillConfidence.query.filter_by(user_id=user_id).delete()
    CookLog.query.filter_by(user_id=user_id).delete()
    BadgeAward.query.filter_by(user_id=user_id).delete()

    membership = HouseholdMember.query.filter_by(user_id=user_id).first()
    if membership:
        household_id = membership.household_id
        db.session.delete(membership)
        db.session.flush()
        if HouseholdMember.query.filter_by(household_id=household_id).count() == 0:
            household = db.session.get(Household, household_id)
            if household:
                db.session.delete(household)  # cascades to its list/items/plan entries

    db.session.delete(user)
    db.session.commit()
    response = jsonify({"message": "Account deleted"})
    from flask_jwt_extended import get_jwt_request_location
    from auth_sessions import clear_cookies
    return clear_cookies(response) if get_jwt_request_location() == "cookies" else response
