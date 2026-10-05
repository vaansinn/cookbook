"""Add revocable sessions, recovery credentials, and bounded auth throttles."""
from alembic import op
import sqlalchemy as sa

revision = "0d97b865efa6"
down_revision = "fc86a754de95"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("legacy_tokens_valid_after", sa.BigInteger()))
    op.create_table("auth_sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("transport", sa.String(8), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime()),
        sa.CheckConstraint("transport IN ('browser','native')", name="ck_auth_session_transport"))
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_table("auth_refresh_tokens",
        sa.Column("digest", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.String(64), sa.ForeignKey("auth_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("used_at", sa.DateTime()))
    op.create_index("ix_auth_refresh_tokens_session_id", "auth_refresh_tokens", ["session_id"])
    op.create_table("auth_action_tokens",
        sa.Column("digest", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", sa.String(12), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime()),
        sa.CheckConstraint("purpose IN ('reset','verify')", name="ck_auth_action_purpose"))
    op.create_index("ix_auth_action_tokens_user_id", "auth_action_tokens", ["user_id"])
    op.create_table("auth_throttles",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("window", sa.BigInteger(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False))


def downgrade():
    # Removing revocation state can resurrect copied credentials. A compatible
    # recovery build is required even if active sessions have been cleared.
    raise RuntimeError("Authentication revocation state must be preserved; destructive downgrade refused")
