"""Session/recovery races on the guarded disposable PostgreSQL target only."""
import os
from pathlib import Path
import sys
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4


def run():
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root))
    sys.path.insert(0, str(root / "scripts"))
    from verify_postgres import validate_targets, engine_url, isolated_env, require
    targets = validate_targets(os.environ)
    clean = isolated_env(os.environ, targets)
    os.environ.clear()
    os.environ.update(clean)
    import sqlalchemy as sa
    os.environ["DATABASE_URL"] = engine_url(sa, targets[0]).render_as_string(hide_password=False)
    import dotenv
    dotenv.load_dotenv = lambda *args, **kwargs: False
    from app import app, db, bcrypt
    from models import User
    from auth_session_models import AuthSession, AuthRefreshToken, AuthActionToken
    app.config.update(TESTING=True, AUTH_ALLOW_LEGACY_TOKENS=False)
    mail = []
    app.config["AUTH_MAIL_DELIVERY"] = lambda **message: mail.append(message)
    with app.app_context():
        require(db.engine.dialect.name == "postgresql", "PostgreSQL required")
        require(db.session.execute(sa.text("SELECT current_database()")).scalar_one()
                == "cookbook_test_fresh", "Unexpected database")
    prefix = "/api/auth/session"
    native = {"X-Cookbook-Client": "native"}
    email = "auth-race-" + uuid4().hex + "@example.test"
    password = "synthetic-local-test-password"

    def post(path, data, headers=None):
        with app.test_client() as client:
            return client.post(prefix + path, json=data, headers=headers or native)

    def race(path, data):
        gate = Barrier(2)
        def send(_):
            gate.wait(timeout=10)
            response = post(path, data)
            return response.status_code, response.get_json()
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(send, n) for n in range(2)]
            return [future.result(timeout=20) for future in futures]

    with patch.object(bcrypt, "_log_rounds", 4):
        registered = post("/register", {"email": email, "password": password, "transport": "native"})
        require(registered.status_code == 201, "Native registration failed")
        original = registered.get_json()
        user_id = original["user"]["id"]
        results = race("/refresh", {"refresh_token": original["refresh_token"], "transport": "native"})
        require(sorted(status for status, _ in results) == [200, 401], "Refresh race did not have one winner")
        winner = next(data for status, data in results if status == 200)
        with app.test_client() as client:
            require(client.get(prefix + "/me", headers={**native, "Authorization": "Bearer " + winner["token"]}).status_code == 401,
                    "Replay did not revoke the winning session family")
        require(post("/forgot-password", {"email": email}).status_code == 200, "Recovery request failed")
        token = mail[-1]["token"]
        results = race("/reset-password", {"token": token, "password": "changed-test-password"})
        require(sorted(status for status, _ in results) == [200, 400], "Reset token was not single-use under contention")
        login = post("/login", {"email": email, "password": "changed-test-password", "transport": "native"})
        require(login.status_code == 200, "Reset password was not saved")
        credentials = login.get_json()
        headers = {**native, "Authorization": "Bearer " + credentials["token"]}
        require(post("/verification/request", {}, headers).status_code == 200, "Verification request failed")
        verification = mail[-1]["token"]
        require(post("/verification/confirm", {"token": verification}).status_code == 200, "Verification failed")
        with app.test_client() as client:
            require(client.get(prefix + "/me", headers=headers).get_json()["user"]["email_verified"] is True,
                    "Verification state was not persisted")
            exported = client.get("/api/auth/me/export", headers=headers)
            require(exported.status_code == 200, "Session-authenticated export failed")
            body = exported.get_data(as_text=True)
            require(all(secret not in body for secret in (credentials["token"], credentials["refresh_token"], token, verification)),
                    "Export exposed credentials")
            require(client.delete("/api/auth/me", headers=headers).status_code == 200, "Synthetic account deletion failed")
            require(client.get(prefix + "/me", headers=headers).status_code == 401, "Deleted account still authenticated")
        with app.app_context():
            require(db.session.get(User, user_id) is None, "Synthetic user not deleted")
            require(AuthSession.query.filter_by(user_id=user_id).count() == 0, "Session records survived deletion")
            require(AuthActionToken.query.filter_by(user_id=user_id).count() == 0, "Recovery records survived deletion")
            for sid in (original["session_id"], credentials["session_id"]):
                require(AuthRefreshToken.query.filter_by(session_id=sid).count() == 0, "Refresh records survived deletion")
    print("PASS: PostgreSQL concurrent rotation/replay, reset single use, verification, export redaction and account-deletion cascade")


if __name__ == "__main__":
    run()
