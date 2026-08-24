"""
routes/auth.py — Authentication endpoints.

Register / login / me. Password-reset and email-verification flows are
deferred to the P5 hardening pass (see PIPELINE.md) — not needed to prove
the Phase 1 gate (register, log in, switch language/theme).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from app import db, bcrypt
from models import User, CookLog, BadgeAward, HouseholdMember, Household, GroceryList, GroceryItem, PlanEntry

auth_bp = Blueprint("auth", __name__)

MIN_PASSWORD_LENGTH = 8


def _password_error(password):
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    return None


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    if not data or not data.get("email") or not data.get("password"):
        return jsonify({"error": "email and password required"}), 400

    pw_error = _password_error(data["password"])
    if pw_error:
        return jsonify({"error": pw_error, "code": "password_too_short", "min": MIN_PASSWORD_LENGTH}), 400

    email = data["email"].strip().lower()
    if User.query.filter(db.func.lower(User.email) == email).first():
        return jsonify({"error": "Email already registered", "code": "email_taken"}), 409

    hashed = bcrypt.generate_password_hash(data["password"]).decode("utf-8")
    user = User(
        email=email,
        password_hash=hashed,
        display_name=(data.get("display_name") or "").strip() or None,
    )
    db.session.add(user)
    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": user.to_dict()}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data or not data.get("email") or not data.get("password"):
        return jsonify({"error": "email and password required"}), 400

    email = data["email"].strip().lower()
    user = User.query.filter(db.func.lower(User.email) == email).first()

    if not user or not bcrypt.check_password_hash(user.password_hash, data["password"]):
        return jsonify({"error": "Invalid credentials", "code": "invalid_credentials"}), 401

    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": user.to_dict()})


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
def export_account():
    """Everything the app holds about the requesting user, as one JSON blob."""
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    logs = CookLog.query.filter_by(user_id=user_id).all()
    badges = BadgeAward.query.filter_by(user_id=user_id).all()
    membership = HouseholdMember.query.filter_by(user_id=user_id).first()

    plan_entries, grocery_items = [], []
    if membership:
        plan_entries = PlanEntry.query.filter_by(household_id=membership.household_id, added_by=user_id).all()
        lst = GroceryList.query.filter_by(household_id=membership.household_id).first()
        if lst:
            grocery_items = GroceryItem.query.filter_by(list_id=lst.id, added_by=user_id).all()

    return jsonify({
        "profile": user.to_dict(),
        "cook_logs": [
            {"dish_slug": l.dish.slug if l.dish else None, "level": l.level, "cooked_at": l.cooked_at.isoformat()}
            for l in logs
        ],
        "badges": [{"slug": b.badge_slug, "earned_at": b.earned_at.isoformat()} for b in badges],
        "household": membership.household.to_dict() if membership else None,
        "plan_entries_added": [e.to_dict() for e in plan_entries],
        "grocery_items_added": [i.to_dict() for i in grocery_items],
    })


@auth_bp.route("/me", methods=["DELETE"])
@jwt_required()
def delete_account():
    """
    Deletes the user's own personal data unconditionally (login, cook history,
    badges). Shared household data (grocery list, plan) is only deleted if
    this was the household's last member — otherwise it's left intact for
    the remaining member(s), since it isn't solely this user's data.
    """
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

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
    return jsonify({"message": "Account deleted"})
