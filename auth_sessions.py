"""Session primitives. Mutations serialize on the account before session/token rows.

No migration or database connection is performed during configuration/import.
Refresh history is retained for the family's absolute lifetime to detect replay.
"""
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
import secrets
from urllib.parse import urlsplit

from flask import current_app, request, jsonify, g
from flask_jwt_extended import create_access_token, decode_token, get_jwt_request_location
from sqlalchemy import case

from app import db
from auth_session_models import AuthSession, AuthRefreshToken, AuthActionToken, AuthThrottle

ACCESS_COOKIE = "access_token_cookie"
REFRESH_COOKIE = "refresh_token_cookie"
CSRF_COOKIE = "csrf_refresh_token"
WRITES = {"POST", "PUT", "PATCH", "DELETE"}


class AuthError(Exception):
    def __init__(self, code="invalid_session", status=401, message="Authentication required"):
        self.code, self.status, self.message = code, status, message


def error_response(error):
    return jsonify(error=error.message, code=error.code), error.status


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def configure_sessions(app):
    settings = {} if app.config["RUNTIME_ENV"] == "testing" else os.environ

    def boolean(name, default):
        value = settings.get(name, str(default)).lower()
        if value not in {"true", "false"}:
            raise RuntimeError(f"{name} must be True or False")
        return value == "true"

    secure = boolean("AUTH_COOKIE_SECURE", True)
    if not secure and app.config["RUNTIME_ENV"] == "production":
        raise RuntimeError("AUTH_COOKIE_SECURE may only be disabled for local development/testing")
    default = ",".join(f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in (5173, 5100)) if app.config["RUNTIME_ENV"] != "production" else ""
    origins = tuple(x.strip() for x in settings.get("AUTH_TRUSTED_ORIGINS", default).split(",") if x.strip())
    for origin in origins:
        try:
            parsed = urlsplit(origin)
            valid = (parsed.scheme in {"http", "https"} and parsed.hostname and not parsed.path
                     and not parsed.query and not parsed.fragment and not parsed.username
                     and not parsed.password and (parsed.port is None or parsed.port > 0)
                     and not any(c.isspace() or c in "*\\" for c in origin)
                     and not parsed.netloc.endswith(":"))
        except ValueError:
            valid = False
        if not valid:
            raise RuntimeError("AUTH_TRUSTED_ORIGINS must contain exact HTTP(S) origins")
    app.config.update(
        AUTH_ALLOW_LEGACY_TOKENS=boolean("AUTH_ALLOW_LEGACY_TOKENS", app.config["RUNTIME_ENV"] != "production"),
        AUTH_TRUSTED_ORIGINS=origins, AUTH_COOKIE_SECURE=secure,
        AUTH_MAIL_DELIVERY=None,
        JWT_TOKEN_LOCATION=["headers", "cookies"], JWT_COOKIE_SECURE=secure,
        JWT_ACCESS_COOKIE_NAME=ACCESS_COOKIE, JWT_ACCESS_COOKIE_PATH="/api",
        JWT_COOKIE_CSRF_PROTECT=True, JWT_CSRF_IN_COOKIES=False,
        JWT_COOKIE_SAMESITE="Lax",
    )

    @app.before_request
    def auth_transport_guard():
        if not request.path.startswith("/api/"):
            return None
        try:
            native = request.headers.get("X-Cookbook-Client") == "native"
            cookies = ACCESS_COOKIE in request.cookies or REFRESH_COOKIE in request.cookies
            authorization = request.headers.get("Authorization")
            if ((ACCESS_COOKIE in request.cookies and not request.cookies[ACCESS_COOKIE])
                    or (authorization is not None and (len(authorization.split()) != 2
                        or authorization.split()[0] != "Bearer"))):
                raise AuthError()
            if cookies and (native or "Authorization" in request.headers):
                raise AuthError()
            session_route = request.path.startswith("/api/auth/session/")
            if request.method in WRITES and not native and (cookies or session_route):
                require_origin()
            # A supplied refresh credential without access must not become guest
            # access on an optional-auth route; only refresh/logout can use it.
            if REFRESH_COOKIE in request.cookies and ACCESS_COOKIE not in request.cookies and not session_route:
                raise AuthError()
        except AuthError as error:
            return error_response(error)


def require_origin():
    origins = current_app.config["AUTH_TRUSTED_ORIGINS"]
    if isinstance(origins, str):
        origins = tuple(x.strip() for x in origins.split(","))
    if request.headers.get("Origin") not in origins:
        raise AuthError("untrusted_origin", 403, "Trusted origin required")


def transport(data=None):
    selected = "native" if request.headers.get("X-Cookbook-Client") == "native" else "browser"
    if data is not None and data.get("transport", selected) != selected:
        raise AuthError("invalid_transport", 400, "Transport does not match client header")
    if selected == "browser" and "Authorization" in request.headers:
        raise AuthError()
    return selected


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def csrf(session):
    secret = current_app.config["JWT_SECRET_KEY"].encode("utf-8")
    return hmac.new(secret, ("session-csrf:" + session.id).encode(), hashlib.sha256).hexdigest()


def check_csrf(session):
    value = request.headers.get("X-CSRF-TOKEN", "")
    if not hmac.compare_digest(value.encode(), csrf(session).encode()):
        raise AuthError("csrf_failed", 403, "CSRF token required")


def check_session_fence(session, *, required=False):
    """Bind the caller's loaded account state to the cookie/bearer identity.

    A session ID is public metadata, not a replacement for authentication/CSRF.
    This prevents an old tab from operating on a newly logged-in account while
    its account-change notification is still in flight.
    """
    expected = request.headers.get("X-Cookbook-Session")
    if expected is None and not required:
        return
    if expected is None or not hmac.compare_digest(expected.encode(), session.id.encode()):
        raise AuthError()


def lock_user(user_id):
    from models import User
    # UPDATE also obtains a write lock on SQLite; FOR UPDATE alone does not.
    if not db.session.execute(db.update(User).where(User.id == user_id).values(id=User.id)).rowcount:
        raise AuthError()
    return db.session.get(User, user_id, populate_existing=True)


def validate_identity(user, payload):
    sid = payload.get("sid")
    if "sid" not in payload:
        cutoff = user.legacy_tokens_valid_after
        issued = payload.get("iat")
        return (current_app.config.get("AUTH_ALLOW_LEGACY_TOKENS", True)
                and "Authorization" in request.headers
                and "X-Cookbook-Session" not in request.headers
                and (cutoff is None or (isinstance(issued, int) and issued > cutoff)))
    if not isinstance(sid, str) or len(sid) != 64:
        return False
    session = db.session.get(AuthSession, sid)
    if not session or session.user_id != user.id or session.revoked_at or session.expires_at <= now():
        return False
    location = get_jwt_request_location()
    # During user_lookup, flask-jwt-extended has not installed request location
    # on g yet; the actual credential source is unambiguous after the guard.
    if location is None:
        location = "headers" if "Authorization" in request.headers else "cookies"
    native = request.headers.get("X-Cookbook-Client") == "native"
    if session.transport == "native" and (not native or location != "headers"):
        return False
    if session.transport == "browser" and (native or location != "cookies"):
        return False
    check_session_fence(session, required=(session.transport == "browser"
                        and request.path != "/api/auth/session/me"))
    if session.transport == "browser" and request.method in WRITES:
        check_csrf(session)
    g.auth_session = session
    return True


def new_refresh(session):
    value = secrets.token_urlsafe(48)
    db.session.add(AuthRefreshToken(digest=digest(value), session_id=session.id))
    return value


def new_session(user, selected):
    instant = now()
    session = AuthSession(id=secrets.token_hex(32), user_id=user.id, transport=selected,
                          created_at=instant, expires_at=instant + timedelta(days=30))
    db.session.add(session)
    db.session.flush()
    return session, new_refresh(session)


def metadata(user, session, access_exp):
    return dict(user={**user.to_dict(), "email_verified": user.email_verified}, session_id=session.id,
                expires_at=datetime.fromtimestamp(access_exp, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                session_expires_at=session.expires_at.isoformat(timespec="seconds") + "Z", csrf_token=csrf(session))


def session_response(user, session, refresh, status=200):
    token = create_access_token(identity=str(user.id), expires_delta=timedelta(minutes=15),
                                additional_claims={"sid": session.id, "csrf": csrf(session)})
    data = metadata(user, session, decode_token(token)["exp"])
    if session.transport == "native":
        data.update(token=token, refresh_token=refresh)
    response = jsonify(data)
    response.status_code = status
    if session.transport == "browser":
        seconds = max(0, int((session.expires_at - now()).total_seconds()))
        options = dict(secure=current_app.config["AUTH_COOKIE_SECURE"], samesite="Lax")
        response.set_cookie(ACCESS_COOKIE, token, httponly=True, path="/api", max_age=900, **options)
        response.set_cookie(REFRESH_COOKIE, refresh, httponly=True, path="/api/auth/session", max_age=seconds, **options)
        response.set_cookie(CSRF_COOKIE, csrf(session), httponly=False, path="/", max_age=seconds, **options)
    return response


def clear_cookies(response):
    for name, path in ((ACCESS_COOKIE, "/api"), (REFRESH_COOKIE, "/api/auth/session"), (CSRF_COOKIE, "/")):
        response.delete_cookie(name, path=path, secure=current_app.config["AUTH_COOKIE_SECURE"], samesite="Lax")
    return response


def refresh_session(data, *, rotating=False, revoking=False):
    selected = transport(data)
    if selected == "browser" and "refresh_token" in data:
        raise AuthError()
    value = data.get("refresh_token") if selected == "native" else request.cookies.get(REFRESH_COOKIE)
    if not isinstance(value, str) or not 32 <= len(value) <= 256 or not value.isascii():
        raise AuthError()
    token = db.session.get(AuthRefreshToken, digest(value))
    session = db.session.get(AuthSession, token.session_id) if token else None
    if not session:
        raise AuthError()
    check_session_fence(session)
    if rotating:
        throttle("refresh", session.id)
    user = lock_user(session.user_id)
    db.session.refresh(session)
    db.session.refresh(token)
    if session.transport != selected:
        raise AuthError()
    if selected == "browser":
        check_csrf(session)
    # Revocation is safe to repeat with a known family credential. Validate its
    # transport, expected session and CSRF first; it can only end that family,
    # never obtain access or operate on the account after expiry/revocation.
    if revoking:
        return user, session, token
    if session.revoked_at or session.expires_at <= now():
        raise AuthError()
    if token.used_at:
        session.revoked_at = now()
        db.session.commit()  # Revocation must survive the rejected replay.
        raise AuthError()
    return user, session, token


def revoke_all(user):
    instant = now()
    db.session.execute(db.update(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None)).values(revoked_at=instant))
    # JWT iat has whole-second precision: reject equality as well as older iat.
    user.legacy_tokens_valid_after = int(instant.replace(tzinfo=timezone.utc).timestamp())


def throttle(scope, identity=""):
    """Atomic fixed-window counters; max 4096 slots per scope/dimension.

    Limit global traffic as well as account and remote-address attempts. Never
    trust forwarded IP headers here (ProxyFix is explicitly configured by app).
    Counts are committed separately so failed credentials still consume budget.
    """
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    insert = pg_insert if db.engine.dialect.name == "postgresql" else sqlite_insert
    window = int(now().replace(tzinfo=timezone.utc).timestamp()) // 900
    secret = current_app.config["JWT_SECRET_KEY"].encode()
    allowed = True
    for dimension, value, limit in (("global", "all", 1000), ("address", request.remote_addr or "unknown", 100), ("identity", identity, 30 if scope == "refresh" else 10)):
        hashed = hmac.new(secret, value.encode(), hashlib.sha256).hexdigest()[:3]
        key = digest(f"{scope}:{dimension}:{hashed}")
        stmt = insert(AuthThrottle).values(key=key, window=window, attempts=1)
        stmt = stmt.on_conflict_do_update(index_elements=[AuthThrottle.key], set_={
            "window": window, "attempts": case((AuthThrottle.window != window, 1), else_=AuthThrottle.attempts + 1),
        }, where=(AuthThrottle.window != window) | (AuthThrottle.attempts < limit))
        if not db.session.execute(stmt).rowcount:
            allowed = False
    db.session.commit()
    if not allowed:
        raise AuthError("rate_limited", 429, "Too many attempts; try again later")


def issue_action(user, purpose):
    sender = current_app.config.get("AUTH_MAIL_DELIVERY")
    if not callable(sender):
        raise AuthError("mail_unavailable", 503, "Email delivery is unavailable")
    if user is None:
        return
    lock_user(user.id)
    instant = now()
    db.session.execute(db.update(AuthActionToken).where(AuthActionToken.user_id == user.id,
        AuthActionToken.purpose == purpose, AuthActionToken.used_at.is_(None)).values(used_at=instant))
    value = secrets.token_urlsafe(48)
    db.session.add(AuthActionToken(digest=digest(value), user_id=user.id, purpose=purpose,
                                  expires_at=instant + timedelta(minutes=30 if purpose == "reset" else 1440)))
    db.session.flush()
    try:
        # Trusted callable owns delivery only; it must not log/HTTP-return value.
        sender(to=user.email, purpose=purpose, token=value)
    except Exception:
        raise AuthError("mail_unavailable", 503, "Email delivery is unavailable") from None
    db.session.commit()


def consume_action(value, purpose):
    token = db.session.get(AuthActionToken, digest(value))
    if not token or token.purpose != purpose:
        raise AuthError("invalid_token", 400, "Invalid or expired token")
    user = lock_user(token.user_id)
    db.session.refresh(token)
    if token.used_at or token.expires_at <= now():
        raise AuthError("invalid_token", 400, "Invalid or expired token")
    token.used_at = now()
    return user
