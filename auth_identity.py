"""Resolve signed JWT subjects before any protected route accesses user data.

Both protected and optional-auth routes validate registry sessions here.
"""
import re

from flask import abort, jsonify, make_response
from sqlalchemy.exc import SQLAlchemyError


def install_identity_checks(jwt):
    @jwt.user_lookup_loader
    def lookup_user(_header, payload):
        from app import db
        from models import User

        subject = payload.get("sub")
        if not isinstance(subject, str) or not re.fullmatch(r"[1-9][0-9]{0,9}", subject):
            return None
        user_id = int(subject)
        if user_id > 2147483647:
            return None
        try:
            from auth_sessions import validate_identity, AuthError, error_response
            user = db.session.get(User, user_id)
            if user is None:
                return None
            try:
                return user if validate_identity(user, payload) else None
            except AuthError as error:
                abort(make_response(*error_response(error)))
        except SQLAlchemyError:
            db.session.rollback()
            # A database outage is not evidence of invalid credentials. Keep it
            # distinct from 401 so clients can retry without discarding a login.
            abort(make_response(jsonify({"error": "Authentication temporarily unavailable", "code": "auth_unavailable"}), 503))

    @jwt.user_lookup_error_loader
    def unavailable_user(_header, _payload):
        # Do not echo the credential's subject or distinguish deleted accounts.
        return jsonify({"error": "Authentication required", "code": "invalid_session"}), 401

    @jwt.unauthorized_loader
    def missing_token(_reason):
        return unavailable_user(None, None)

    @jwt.invalid_token_loader
    def malformed_token(_reason):
        return unavailable_user(None, None)

    @jwt.expired_token_loader
    def expired_token(_header, _payload):
        return unavailable_user(None, None)

    @jwt.revoked_token_loader
    def revoked_token(_header, _payload):
        return unavailable_user(None, None)
