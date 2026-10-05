"""Versioned session/recovery API; browser credentials never enter JSON."""
import time

from flask import Blueprint, current_app, request, jsonify, g
from flask_jwt_extended import jwt_required, current_user, get_jwt
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from werkzeug.exceptions import BadRequest

from app import db, bcrypt
from models import User
from routes.auth import _auth_input, _bcrypt_password, _password_error, _email_conflict
from auth_sessions import (
    AuthError, error_response, transport, throttle, lock_user, new_session,
    session_response, metadata, refresh_session, new_refresh, now, revoke_all,
    clear_cookies, issue_action, consume_action,
)

auth_sessions_bp = Blueprint("auth_sessions", __name__)
# Public dummy hash, not an account credential. Missing accounts still pay the
# default bcrypt work factor rather than returning before any password check.
_DUMMY_PASSWORD_HASH = "$2b$12$wmgNfD/DdT3d3tOGJKaHc.GciQ4V2k13J0e7UlTwFvJowxysIypaC"


@auth_sessions_bp.errorhandler(AuthError)
def auth_error(error):
    db.session.rollback()
    return error_response(error)


@auth_sessions_bp.errorhandler(SQLAlchemyError)
@auth_sessions_bp.errorhandler(ValueError)
@auth_sessions_bp.errorhandler(RuntimeError)
def backend_error(_error):
    db.session.rollback()
    # Never log exceptions: driver/bcrypt/callable messages can contain secrets.
    return jsonify(error="Authentication temporarily unavailable", code="auth_unavailable"), 503


def json_input():
    if not request.is_json:
        raise AuthError("invalid_input", 400, "JSON object required")
    try:
        raw = request.stream.read(65537)
        if len(raw) > 65536:
            raise ValueError()
        data = current_app.json.loads(raw)
    except (BadRequest, ValueError, RecursionError):
        raise AuthError("invalid_input", 400, "Invalid JSON object") from None
    if not isinstance(data, dict):
        raise AuthError("invalid_input", 400, "JSON object required")
    return data


def field(data, name, maximum=4096):
    value = data.get(name)
    try:
        valid = isinstance(value, str) and 0 < len(value) <= maximum and len(value.encode("utf-8")) <= maximum
    except UnicodeError:
        valid = False
    if not valid or (name != "password" and "\x00" in value):
        raise AuthError("invalid_input", 400, f"Invalid {name}")
    return value


def password_hash(password):
    error = _password_error(password)
    if error:
        raise AuthError("password_too_short", 400, error)
    try:
        return bcrypt.generate_password_hash(_bcrypt_password(password)).decode("utf-8")
    except ValueError:
        if "\x00" in password:
            raise AuthError("invalid_input", 400, "Invalid password") from None
        raise


def authenticated_session():
    session = getattr(g, "auth_session", None)
    if session is None:
        raise AuthError()
    return session


@auth_sessions_bp.post("/register")
@auth_sessions_bp.post("/login")
def credentials():
    registering = request.path.endswith("/register")
    data, error = _auth_input(registering=registering)
    if error is not None:
        return error
    if not isinstance(data.get("transport"), str) or data["transport"] not in {"browser", "native"}:
        raise AuthError("invalid_transport", 400, "transport is required")
    selected = transport(data)
    throttle("register" if registering else "login", data["email"])
    user = User.query.filter(db.func.lower(User.email) == data["email"]).first()
    if registering:
        if user:
            raise AuthError("email_taken", 409, "Email already registered")
        user = User(email=data["email"], display_name=data["display_name"], password_hash=password_hash(data["password"]))
        db.session.add(user)
        try:
            db.session.flush()
        except IntegrityError as error:
            if _email_conflict(error):
                raise AuthError("email_taken", 409, "Email already registered") from None
            raise
    else:
        if user:
            user = lock_user(user.id)
        try:
            matches = bcrypt.check_password_hash(user.password_hash if user else _DUMMY_PASSWORD_HASH,
                                                 _bcrypt_password(data["password"]))
            valid = user is not None and matches
        except ValueError:
            if "\x00" in data["password"]:
                raise AuthError("invalid_input", 400, "Invalid password") from None
            raise
        if not valid:
            raise AuthError("invalid_credentials", 401, "Invalid credentials")
    session, refresh = new_session(user, selected)
    # Build/encode before commit so signing errors cannot leave a partial login.
    response = session_response(user, session, refresh, 201 if registering else 200)
    db.session.commit()
    return response


@auth_sessions_bp.get("/me")
@jwt_required()
def me():
    return jsonify(metadata(current_user, authenticated_session(), get_jwt()["exp"]))


@auth_sessions_bp.post("/refresh")
def refresh():
    data = json_input()
    user, session, token = refresh_session(data, rotating=True)
    token.used_at = now()
    response = session_response(user, session, new_refresh(session))
    db.session.commit()
    return response


@auth_sessions_bp.post("/logout")
def logout():
    _user, session, _token = refresh_session(json_input(), revoking=True)
    session.revoked_at = session.revoked_at or now()
    db.session.commit()
    response = jsonify(ok=True)
    return clear_cookies(response) if session.transport == "browser" else response


@auth_sessions_bp.post("/logout-all")
@jwt_required()
def logout_all():
    session = authenticated_session()
    user = lock_user(current_user.id)
    revoke_all(user)
    db.session.commit()
    response = jsonify(ok=True)
    return clear_cookies(response) if session.transport == "browser" else response


@auth_sessions_bp.post("/forgot-password")
def forgot_password():
    data = json_input()
    transport(data)
    email = field(data, "email").strip().lower()
    if not email:
        raise AuthError("invalid_input", 400, "Invalid email")
    throttle("forgot", email)
    started = time.monotonic()
    try:
        # Availability is independent of whether this address names an account.
        if not callable(current_app.config.get("AUTH_MAIL_DELIVERY")):
            raise AuthError("mail_unavailable", 503, "Email delivery is unavailable")
        user = User.query.filter(db.func.lower(User.email) == email).first()
        try:
            issue_action(user, "reset")
        except AuthError as error:
            if error.code != "mail_unavailable":
                raise
            # A recipient-specific delivery failure must not expose existence.
            # The token and replacement of earlier links are both rolled back.
            db.session.rollback()
        return jsonify(ok=True, message="If an account matches, recovery delivery will be attempted.")
    finally:
        # Equalize the ordinary local-delivery path, including unknown addresses.
        # A synchronous callable can still exceed this floor; don't claim fully
        # constant-time delivery for slow transports (use an outbox for those).
        time.sleep(max(0, 0.2 - (time.monotonic() - started)))


@auth_sessions_bp.post("/reset-password")
def reset_password():
    data = json_input()
    transport(data)
    token, password = field(data, "token", 256), field(data, "password")
    throttle("reset", token)
    hashed = password_hash(password)
    user = consume_action(token, "reset")
    user.password_hash = hashed
    revoke_all(user)
    # Any previously issued reset link is now invalid, even if unredeemed.
    from auth_session_models import AuthActionToken
    db.session.execute(db.update(AuthActionToken).where(AuthActionToken.user_id == user.id,
        AuthActionToken.purpose == "reset", AuthActionToken.used_at.is_(None)).values(used_at=now()))
    db.session.commit()
    response = jsonify(ok=True)
    return clear_cookies(response) if transport(data) == "browser" else response


@auth_sessions_bp.post("/verification/request")
@jwt_required()
def verification_request():
    authenticated_session()
    throttle("verify-request", str(current_user.id))
    issue_action(current_user, "verify")
    return jsonify(ok=True)


@auth_sessions_bp.post("/verification/confirm")
def verification_confirm():
    data = json_input()
    transport(data)
    token = field(data, "token", 256)
    throttle("verify-confirm", token)
    user = consume_action(token, "verify")
    user.email_verified = True
    db.session.commit()
    return jsonify(ok=True)
