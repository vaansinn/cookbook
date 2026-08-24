"""
routes/auth.py — Authentication endpoints.

Register / login / me. Password-reset and email-verification flows are
deferred to the P5 hardening pass (see PIPELINE.md) — not needed to prove
the Phase 1 gate (register, log in, switch language/theme).
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from app import db, bcrypt
from models import User

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
