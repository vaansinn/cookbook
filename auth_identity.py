"""Resolve signed JWT subjects before any protected route accesses user data.

This preserves the existing bearer-token contract. It is not token revocation
or a replacement for the forthcoming session/logout policy.
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
            return db.session.get(User, user_id)
        except SQLAlchemyError:
            db.session.rollback()
            # A database outage is not evidence of invalid credentials. Keep it
            # distinct from 401 so clients can retry without discarding a login.
            abort(make_response(jsonify({"error": "Authentication temporarily unavailable"}), 503))

    @jwt.user_lookup_error_loader
    def unavailable_user(_header, _payload):
        # Do not echo the credential's subject or distinguish deleted accounts.
        return jsonify({"error": "Authentication required", "code": "invalid_session"}), 401
