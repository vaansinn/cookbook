"""Additive account-owned session, recovery, and bounded abuse-control records."""
from app import db


class AuthSession(db.Model):
    __tablename__ = "auth_sessions"
    id = db.Column(db.String(64), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    transport = db.Column(db.String(8), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    revoked_at = db.Column(db.DateTime)
    __table_args__ = (db.CheckConstraint("transport IN ('browser','native')", name="ck_auth_session_transport"),)


class AuthRefreshToken(db.Model):
    __tablename__ = "auth_refresh_tokens"
    digest = db.Column(db.String(64), primary_key=True)
    session_id = db.Column(db.String(64), db.ForeignKey("auth_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    used_at = db.Column(db.DateTime)


class AuthActionToken(db.Model):
    __tablename__ = "auth_action_tokens"
    digest = db.Column(db.String(64), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    purpose = db.Column(db.String(12), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime)
    __table_args__ = (db.CheckConstraint("purpose IN ('reset','verify')", name="ck_auth_action_purpose"),)


class AuthThrottle(db.Model):
    """Fixed hash slots bound storage even with adversarial identities/IPs.

    Collisions share a budget conservatively; they never grant extra attempts.
    No raw email, IP, password, or recovery credential is retained here.
    """
    __tablename__ = "auth_throttles"
    key = db.Column(db.String(64), primary_key=True)
    window = db.Column(db.BigInteger, nullable=False)
    attempts = db.Column(db.Integer, nullable=False)
