"""Guarded disposable auth server on 127.0.0.1:5101; never cookbook_dev.

Requires the same explicit test target pair and confirmation as verify_postgres.
Run only after the migration verifier. Uses the fresh database's synthetic data.
"""
import os
from pathlib import Path
import sys


def run():
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root))
    sys.path.insert(0, str(root / "scripts"))
    from verify_postgres import validate_targets, isolated_env, engine_url, require
    targets = validate_targets(os.environ)
    clean = isolated_env(os.environ, targets)
    os.environ.clear()
    os.environ.update(clean)
    import sqlalchemy as sa
    os.environ["DATABASE_URL"] = engine_url(sa, targets[0]).render_as_string(hide_password=False)
    import dotenv
    dotenv.load_dotenv = lambda *args, **kwargs: False
    from app import app, db
    from auth_mail_sink import local_mail_delivery
    app.config.update(AUTH_ALLOW_LEGACY_TOKENS=False, AUTH_COOKIE_SECURE=False,
        # Cookies ignore ports: use localhost, not the working app's 127.0.0.1
        # hostname, for the browser candidate. The listener remains loopback only.
        AUTH_TRUSTED_ORIGINS=("http://localhost:5180", "http://localhost:5101"),
        AUTH_MAIL_DELIVERY=local_mail_delivery)
    with app.app_context():
        require(db.session.execute(sa.text("SELECT current_database()")).scalar_one()
                == "cookbook_test_fresh", "Unexpected auth candidate database")
        from auth_session_models import AuthSession
        # Schema check only; do not initialize/repair a database while serving.
        db.session.execute(sa.select(AuthSession).limit(0))
        db.session.rollback()
    app.run(host="127.0.0.1", port=5101, debug=False, use_reloader=False)


if __name__ == "__main__":
    run()
