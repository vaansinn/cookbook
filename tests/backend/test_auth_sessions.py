"""Session contract tests on isolated synthetic SQLite only; PostgreSQL is separate."""
import os
from pathlib import Path
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

PREFIX = "/api/auth/session"
ORIGIN = {"Origin": "http://localhost:5173"}
NATIVE = {"X-Cookbook-Client": "native"}


class SessionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = patch.dict(os.environ, {"FLASK_ENV": "testing", "FLASK_SKIP_DOTENV": "1"})
        cls.env.start()
        cls.addClassCleanup(cls.env.stop)
        from app import create_app, db, bcrypt
        cls.create_app, cls.db, cls.bcrypt = staticmethod(create_app), db, bcrypt

    def setUp(self):
        self.app = self.create_app(environment="testing")
        self.app.config.update(AUTH_ALLOW_LEGACY_TOKENS=False, AUTH_COOKIE_SECURE=False)
        self.context = self.app.app_context()
        self.context.push()
        self.db.create_all()
        self.client = self.app.test_client()
        self.rounds = patch.object(self.bcrypt, "_log_rounds", 4)
        self.rounds.start()
        self.mail = []
        self.app.config["AUTH_MAIL_DELIVERY"] = lambda **message: self.mail.append(message)

    def tearDown(self):
        self.rounds.stop()
        self.db.session.remove()
        self.db.engine.dispose()
        self.context.pop()

    def register(self, native=False, client=None, email="cook@example.test", password="password123"):
        response = (client or self.client).post(PREFIX + "/register", json={"email": email,
            "password": password, "display_name": "Cook", "transport": "native" if native else "browser"},
            headers=NATIVE if native else ORIGIN)
        self.assertEqual(response.status_code, 201, response.get_json())
        return response

    def browser_headers(self, response):
        return {**ORIGIN, "X-CSRF-TOKEN": response.get_json()["csrf_token"],
                "X-Cookbook-Session": response.get_json()["session_id"]}

    def native_headers(self, response):
        return {**NATIVE, "Authorization": "Bearer " + response.get_json()["token"]}

    def legacy(self, uid):
        from flask_jwt_extended import create_access_token
        return {"Authorization": "Bearer " + create_access_token(identity=str(uid))}

    def test_browser_contract_cookie_flags_metadata_and_refresh_without_access(self):
        self.app.config["AUTH_COOKIE_SECURE"] = True
        response = self.register()
        body = response.get_json()
        self.assertEqual(set(body), {"user", "session_id", "expires_at", "session_expires_at", "csrf_token"})
        self.assertFalse(body["user"]["email_verified"])
        self.assertTrue(body["expires_at"].endswith("Z"))
        cookies = response.headers.getlist("Set-Cookie")
        self.assertTrue(all("Secure" in cookie and "SameSite=Lax" in cookie for cookie in cookies))
        self.assertTrue(any("csrf_refresh_token=" in cookie and "Path=/;" in cookie and "HttpOnly" not in cookie for cookie in cookies))
        from flask_jwt_extended import decode_token
        access = self.client.get_cookie("access_token_cookie", path="/api").value
        payload = decode_token(access)
        self.assertEqual(payload["exp"] - payload["iat"], 900)
        self.assertEqual(payload["sid"], body["session_id"])
        self.assertEqual(datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00")).timestamp(), payload["exp"])
        absolute = datetime.fromisoformat(body["session_expires_at"].replace("Z", "+00:00"))
        self.assertAlmostEqual((absolute - datetime.now(timezone.utc)).total_seconds(), 30 * 86400, delta=3)
        self.assertEqual(self.client.get(PREFIX + "/me").get_json(), body)
        self.client.delete_cookie("access_token_cookie", path="/api")
        refreshed = self.client.post(PREFIX + "/refresh", json={}, headers=self.browser_headers(response))
        self.assertEqual(refreshed.status_code, 200, refreshed.get_json())
        self.assertEqual(refreshed.get_json()["session_expires_at"], body["session_expires_at"])
        self.assertEqual(refreshed.get_json()["csrf_token"], body["csrf_token"])

    def test_origin_on_every_browser_write_and_no_host_trust(self):
        for endpoint in ("login", "register", "refresh", "logout", "logout-all", "forgot-password", "reset-password", "verification/request", "verification/confirm"):
            for headers in ({}, {"Origin": "https://evil.test"}, {"Host": "evil.test", "Origin": "http://evil.test"}):
                response = self.client.post(PREFIX + "/" + endpoint, json={}, headers=headers)
                self.assertEqual(response.status_code, 403, (endpoint, response.get_json()))

    def test_expired_access_can_refresh_but_cannot_read_optional_or_protected_routes(self):
        response = self.register()
        from flask_jwt_extended import create_access_token
        body = response.get_json()
        expired = create_access_token(identity=str(body["user"]["id"]), expires_delta=timedelta(seconds=-1),
            additional_claims={"sid": body["session_id"], "csrf": body["csrf_token"]})
        self.client.set_cookie("access_token_cookie", expired, path="/api")
        for path in (PREFIX + "/me", "/api/favorites", "/api/dishes/missing"):
            result = self.client.get(path)
            self.assertEqual(result.status_code, 401)
            self.assertEqual(result.get_json()["code"], "invalid_session")
        result = self.client.post(PREFIX + "/refresh", json={}, headers=self.browser_headers(response))
        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.client.get(PREFIX + "/me").get_json(), result.get_json())

    def test_config_defaults_and_explicit_cutover_without_database_connections(self):
        from auth_sessions import configure_sessions
        from flask import Flask

        def configured(mode, settings):
            app = Flask("config-test")
            app.config["RUNTIME_ENV"] = mode
            with patch.dict(os.environ, settings, clear=True):
                configure_sessions(app)
            return app

        production = configured("production", {})
        self.assertFalse(production.config["AUTH_ALLOW_LEGACY_TOKENS"])
        self.assertTrue(production.config["AUTH_COOKIE_SECURE"])
        self.assertEqual(production.config["AUTH_TRUSTED_ORIGINS"], ())
        development = configured("development", {})
        self.assertTrue(development.config["AUTH_ALLOW_LEGACY_TOKENS"])
        self.assertIn("http://127.0.0.1:5100", development.config["AUTH_TRUSTED_ORIGINS"])
        self.assertFalse(configured("development", {"AUTH_ALLOW_LEGACY_TOKENS": "False"}).config["AUTH_ALLOW_LEGACY_TOKENS"])
        for settings in ({"AUTH_COOKIE_SECURE": "False"}, {"AUTH_TRUSTED_ORIGINS": "https://*.test"},
                         {"AUTH_TRUSTED_ORIGINS": "https://example.test/path"}, {"AUTH_ALLOW_LEGACY_TOKENS": "maybe"}):
            with self.assertRaises(RuntimeError):
                configured("production", settings)

    def test_csrf_on_existing_routes_and_refresh(self):
        response = self.register()
        for path in ("/api/favorites/missing", PREFIX + "/refresh", PREFIX + "/logout", PREFIX + "/logout-all"):
            rejected = self.client.post(path, json={}, headers=ORIGIN)
            self.assertIn(rejected.status_code, (401, 403), (path, rejected.get_json()))
        # Pass authentication to the old route's own payload validator.
        result = self.client.post("/api/favorites/missing", json={}, headers=self.browser_headers(response))
        self.assertEqual(result.status_code, 404, result.get_json())

    def test_native_contract_mixed_rejected_and_no_cookie_fallback(self):
        native = self.register(native=True)
        self.assertIn("refresh_token", native.get_json())
        self.assertEqual(native.headers.getlist("Set-Cookie"), [])
        headers = self.native_headers(native)
        self.assertEqual(self.client.get(PREFIX + "/me", headers=headers).status_code, 200)
        self.assertEqual(self.client.get(PREFIX + "/me", headers={"Authorization": headers["Authorization"]}).status_code, 401)
        browser = self.app.test_client()
        self.register(client=browser, email="browser@example.test")
        self.assertEqual(browser.get("/api/favorites", headers=headers).status_code, 401)
        self.assertEqual(browser.get("/api/favorites", headers=NATIVE).status_code, 401)
        self.assertEqual(browser.post(PREFIX + "/refresh", json={}, headers=NATIVE).status_code, 401)
        self.assertEqual(self.client.post(PREFIX + "/refresh", json={"refresh_token": native.get_json()["refresh_token"]}, headers=ORIGIN).status_code, 401)

    def test_refresh_rotation_replay_revokes_family_and_optional_auth(self):
        response = self.register(native=True)
        old = response.get_json()["refresh_token"]
        refreshed = self.client.post(PREFIX + "/refresh", json={"refresh_token": old}, headers=NATIVE)
        self.assertEqual(refreshed.status_code, 200)
        self.assertNotEqual(refreshed.get_json()["refresh_token"], old)
        replay = self.client.post(PREFIX + "/refresh", json={"refresh_token": old}, headers=NATIVE)
        self.assertEqual(replay.status_code, 401)
        for path in (PREFIX + "/me", "/api/favorites", "/api/dishes/missing"):
            self.assertEqual(self.client.get(path, headers=self.native_headers(refreshed)).status_code, 401)
        from auth_session_models import AuthRefreshToken
        self.assertEqual(AuthRefreshToken.query.count(), 2)
        self.assertNotIn(old, [row.digest for row in AuthRefreshToken.query.all()])

    def test_absolute_expiry_and_missing_sid_strict_cutover(self):
        response = self.register(native=True)
        legacy = self.legacy(response.get_json()["user"]["id"])
        self.assertEqual(self.client.get("/api/favorites", headers=legacy).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login", json={}).status_code, 410)
        self.app.config["AUTH_ALLOW_LEGACY_TOKENS"] = True
        self.assertEqual(self.client.get("/api/favorites", headers=legacy).status_code, 200)
        from auth_session_models import AuthSession
        from auth_sessions import now
        session = AuthSession.query.one()
        session.expires_at = now() - timedelta(seconds=1)
        self.db.session.commit()
        self.assertEqual(self.client.get(PREFIX + "/me", headers=self.native_headers(response)).status_code, 401)
        self.assertEqual(self.client.post(PREFIX + "/refresh", json={"refresh_token": response.get_json()["refresh_token"]}, headers=NATIVE).status_code, 401)

    def test_logout_and_logout_all_revoke_copied_credentials_without_deleting_user(self):
        response = self.register(native=True)
        headers = self.native_headers(response)
        other = self.client.post(PREFIX + "/login", headers=NATIVE, json={"email": "cook@example.test", "password": "password123", "transport": "native"})
        self.assertEqual(self.client.post(PREFIX + "/logout", headers=NATIVE, json={"refresh_token": response.get_json()["refresh_token"]}).status_code, 200)
        self.assertEqual(self.client.get(PREFIX + "/me", headers=headers).status_code, 401)
        self.assertEqual(self.client.get(PREFIX + "/me", headers=self.native_headers(other)).status_code, 200)
        self.app.config["AUTH_ALLOW_LEGACY_TOKENS"] = True
        legacy = self.legacy(response.get_json()["user"]["id"])
        self.assertEqual(self.client.post(PREFIX + "/logout-all", headers=self.native_headers(other)).status_code, 200)
        self.assertEqual(self.client.get("/api/favorites", headers=legacy).status_code, 401)
        self.assertEqual(self.client.get(PREFIX + "/me", headers=self.native_headers(other)).status_code, 401)
        from models import User
        self.assertEqual(User.query.count(), 1)

    def test_recovery_generic_hashed_single_use_and_revoke_legacy(self):
        response = self.register(native=True)
        self.app.config["AUTH_ALLOW_LEGACY_TOKENS"] = True
        legacy = self.legacy(response.get_json()["user"]["id"])
        known = self.client.post(PREFIX + "/forgot-password", json={"email": "cook@example.test"}, headers=ORIGIN)
        unknown = self.client.post(PREFIX + "/forgot-password", json={"email": "missing@example.test"}, headers=ORIGIN)
        self.assertEqual(known.get_json(), unknown.get_json())
        token = self.mail[-1]["token"]
        from auth_session_models import AuthActionToken
        self.assertNotEqual(AuthActionToken.query.one().digest, token)
        self.assertNotIn(token, known.get_data(as_text=True))
        reset = self.client.post(PREFIX + "/reset-password", json={"token": token, "password": "changed123"}, headers=ORIGIN)
        self.assertEqual(reset.status_code, 200, reset.get_json())
        self.assertEqual(self.client.post(PREFIX + "/reset-password", json={"token": token, "password": "again1234"}, headers=ORIGIN).status_code, 400)
        self.assertEqual(self.client.get("/api/favorites", headers=legacy).status_code, 401)
        self.assertEqual(self.client.get("/api/favorites", headers=self.native_headers(response)).status_code, 401)
        login = self.client.post(PREFIX + "/login", json={"email": "cook@example.test", "password": "changed123", "transport": "native"}, headers=NATIVE)
        self.assertEqual(login.status_code, 200)

    def test_verification_expiry_purpose_single_use_and_mail_unavailable(self):
        response = self.register(native=True)
        headers = self.native_headers(response)
        self.assertEqual(self.client.post(PREFIX + "/verification/request", headers=headers).status_code, 200)
        token = self.mail[-1]["token"]
        self.assertEqual(self.client.post(PREFIX + "/reset-password", json={"token": token, "password": "changed123"}, headers=ORIGIN).status_code, 400)
        self.assertEqual(self.client.post(PREFIX + "/verification/confirm", json={"token": token}, headers=ORIGIN).status_code, 200)
        self.assertTrue(self.client.get(PREFIX + "/me", headers=headers).get_json()["user"]["email_verified"])
        self.assertEqual(self.client.post(PREFIX + "/verification/confirm", json={"token": token}, headers=ORIGIN).status_code, 400)
        self.app.config["AUTH_MAIL_DELIVERY"] = None
        for email in ("cook@example.test", "unknown@example.test"):
            self.assertEqual(self.client.post(PREFIX + "/forgot-password", json={"email": email}, headers=ORIGIN).status_code, 503)

    def test_expired_recovery_and_throttling(self):
        self.register(native=True)
        self.client.post(PREFIX + "/forgot-password", json={"email": "cook@example.test"}, headers=ORIGIN)
        from auth_session_models import AuthActionToken, AuthThrottle
        from auth_sessions import now
        AuthActionToken.query.one().expires_at = now() - timedelta(seconds=1)
        self.db.session.commit()
        self.assertEqual(self.client.post(PREFIX + "/reset-password", json={"token": self.mail[-1]["token"], "password": "changed123"}, headers=ORIGIN).status_code, 400)
        results = [self.client.post(PREFIX + "/forgot-password", json={"email": "bounded@example.test"}, headers=ORIGIN).status_code for _ in range(11)]
        self.assertEqual(results, [200] * 10 + [429])
        self.assertTrue(all(len(row.key) == 64 for row in AuthThrottle.query.all()))

    def test_outage_and_refresh_rollback(self):
        response = self.register(native=True)
        from sqlalchemy.exc import OperationalError
        from auth_session_models import AuthRefreshToken, AuthSession
        failure = OperationalError("secret SQL", {}, Exception("private connection"))
        with patch.object(self.db.session, "commit", side_effect=failure):
            rejected = self.client.post(PREFIX + "/refresh", json={"refresh_token": response.get_json()["refresh_token"]}, headers=NATIVE)
        self.assertEqual(rejected.status_code, 503)
        self.assertNotIn("secret", rejected.get_data(as_text=True))
        self.assertEqual(AuthRefreshToken.query.count(), 1)
        self.assertIsNone(AuthRefreshToken.query.one().used_at)
        self.assertIsNone(AuthSession.query.one().revoked_at)
        with patch.object(self.db.session, "get", side_effect=failure):
            self.assertEqual(self.client.get("/api/favorites", headers=self.native_headers(response)).status_code, 503)

    def test_reset_commit_failure_rolls_back_password_token_and_sessions(self):
        response = self.register(native=True)
        self.client.post(PREFIX + "/forgot-password", json={"email": "cook@example.test"}, headers=ORIGIN)
        from models import User
        from auth_session_models import AuthActionToken, AuthSession
        from sqlalchemy.exc import OperationalError
        original_hash = User.query.one().password_hash
        real_commit = self.db.session.commit
        calls = 0

        def fail_final_commit():
            nonlocal calls
            calls += 1
            if calls == 1:  # Persist abuse-control counter, not credential state.
                return real_commit()
            self.db.session.flush()
            raise OperationalError("private", {}, Exception("private"))

        with patch.object(self.db.session, "commit", side_effect=fail_final_commit):
            result = self.client.post(PREFIX + "/reset-password", json={"token": self.mail[-1]["token"], "password": "changed123"}, headers=ORIGIN)
        self.assertEqual(result.status_code, 503)
        self.assertEqual(User.query.one().password_hash, original_hash)
        self.assertIsNone(User.query.one().legacy_tokens_valid_after)
        self.assertIsNone(AuthActionToken.query.one().used_at)
        self.assertIsNone(AuthSession.query.one().revoked_at)

    def test_bcrypt_legacy_prefix_and_invalid_inputs(self):
        self.register(native=True, password="a" * 71 + "é-one")
        response = self.client.post(PREFIX + "/login", json={"email": "cook@example.test", "password": "a" * 71 + "ê-two", "transport": "native"}, headers=NATIVE)
        self.assertEqual(response.status_code, 200)
        for data in ([], None, {"email": 2}, {"email": "\ud800"}):
            self.assertEqual(self.client.post(PREFIX + "/forgot-password", json=data, headers=ORIGIN).status_code, 400)

    def test_delivery_failure_does_not_enumerate_or_leave_action_token(self):
        self.register(native=True)

        def fail(**_message):
            raise RuntimeError("private mail credential")

        self.app.config["AUTH_MAIL_DELIVERY"] = fail
        known = self.client.post(PREFIX + "/forgot-password", json={"email": "cook@example.test"}, headers=ORIGIN)
        unknown = self.client.post(PREFIX + "/forgot-password", json={"email": "missing@example.test"}, headers=ORIGIN)
        self.assertEqual(known.status_code, 200)
        self.assertEqual(known.get_json(), unknown.get_json())
        from auth_session_models import AuthActionToken
        self.assertEqual(AuthActionToken.query.count(), 0)
        self.assertNotIn("private", known.get_data(as_text=True))

    def test_csrf_is_bound_to_session_and_empty_credentials_do_not_become_guest(self):
        first = self.register()
        other = self.app.test_client()
        second = self.register(client=other, email="other@test")
        self.assertNotEqual(first.get_json()["csrf_token"], second.get_json()["csrf_token"])
        result = other.post(PREFIX + "/refresh", json={}, headers=self.browser_headers(first))
        self.assertEqual(result.status_code, 401)
        result = other.post("/api/favorites/missing", json={}, headers=self.browser_headers(first))
        self.assertEqual(result.status_code, 401)
        other.set_cookie("access_token_cookie", "", path="/api")
        self.assertEqual(other.get("/api/dishes/missing").status_code, 401)
        for authorization in ("", "Basic abc", "Bearer", "Bearer one two"):
            self.assertEqual(self.app.test_client().get("/api/dishes/missing", headers={"Authorization": authorization}).status_code, 401)

    def test_old_tab_session_fence_rejects_new_account_cookie_before_read_or_write(self):
        old = self.register()
        new = self.register(email="new-account@test")
        # Cookie and readable CSRF already switched, but the tab still has its
        # old account state. Correct new CSRF alone must not authorize its write.
        headers = {**self.browser_headers(new), "X-Cookbook-Session": old.get_json()["session_id"]}
        from models import Dish, Favorite
        self.db.session.add(Dish(slug="fenced-dish"))
        self.db.session.commit()
        for path in ("/api/favorites", PREFIX + "/me", "/api/dishes/fenced-dish"):
            result = self.client.get(path, headers=headers)
            self.assertEqual(result.status_code, 401, (path, result.get_json()))
        for path in ("/api/favorites/fenced-dish", PREFIX + "/logout-all", PREFIX + "/refresh", PREFIX + "/logout"):
            result = self.client.post(path, json={}, headers=headers)
            self.assertEqual(result.status_code, 401, (path, result.get_json()))
            self.assertEqual(result.get_json()["code"], "invalid_session")
        self.assertEqual(Favorite.query.count(), 0)
        # Bootstrap can discover the newly authenticated account without a hint.
        self.assertEqual(self.client.get(PREFIX + "/me").get_json()["session_id"], new.get_json()["session_id"])
        missing = {**ORIGIN, "X-CSRF-TOKEN": new.get_json()["csrf_token"]}
        self.assertEqual(self.client.post("/api/favorites/fenced-dish", json={}, headers=missing).status_code, 401)
        self.assertEqual(self.client.post("/api/favorites/fenced-dish", json={}, headers=self.browser_headers(new)).status_code, 201)
        self.assertEqual(Favorite.query.one().user_id, new.get_json()["user"]["id"])

    def test_supplied_native_session_fence_must_also_match(self):
        response = self.register(native=True)
        headers = {**self.native_headers(response), "X-Cookbook-Session": "wrong-session"}
        self.assertEqual(self.client.get(PREFIX + "/me", headers=headers).status_code, 401)
        self.assertEqual(self.client.post(PREFIX + "/refresh", json={"refresh_token": response.get_json()["refresh_token"]},
                         headers={**NATIVE, "X-Cookbook-Session": "wrong-session"}).status_code, 401)

    def test_logout_repeats_for_expired_revoked_and_consumed_family_credentials(self):
        from auth_session_models import AuthSession
        from auth_sessions import now
        response = self.register(native=True)
        body = {"refresh_token": response.get_json()["refresh_token"], "transport": "native"}
        self.assertEqual(self.client.post(PREFIX + "/refresh", json=body, headers=NATIVE).status_code, 200)
        AuthSession.query.one().expires_at = now() - timedelta(seconds=1)
        self.db.session.commit()
        headers = {**NATIVE, "X-Cookbook-Session": response.get_json()["session_id"]}
        for _ in range(2):
            result = self.client.post(PREFIX + "/logout", json=body, headers=headers)
            self.assertEqual(result.status_code, 200, result.get_json())
            self.assertEqual(result.get_json(), {"ok": True})
        self.assertIsNotNone(AuthSession.query.one().revoked_at)
        self.assertEqual(self.client.post(PREFIX + "/refresh", json=body, headers=NATIVE).status_code, 401)
        self.assertEqual(self.client.get(PREFIX + "/me", headers=self.native_headers(response)).status_code, 401)

    def test_revoked_browser_logout_still_requires_matching_fence_csrf_and_origin(self):
        from auth_session_models import AuthSession
        from auth_sessions import now
        response = self.register()
        AuthSession.query.one().revoked_at = now()
        self.db.session.commit()
        headers = self.browser_headers(response)
        for changed, expected in (({"X-Cookbook-Session": "wrong"}, 401),
                                  ({"X-CSRF-TOKEN": "wrong"}, 403),
                                  ({"Origin": "https://untrusted.example"}, 403)):
            result = self.client.post(PREFIX + "/logout", json={}, headers={**headers, **changed})
            self.assertEqual(result.status_code, expected)
            self.assertIsNotNone(self.client.get_cookie("refresh_token_cookie", path="/api/auth/session"))
        result = self.client.post(PREFIX + "/logout", json={}, headers=headers)
        self.assertEqual(result.status_code, 200)
        self.assertIsNone(self.client.get_cookie("access_token_cookie", path="/api"))
        self.assertIsNone(self.client.get_cookie("refresh_token_cookie", path="/api/auth/session"))
        self.assertIsNone(self.client.get_cookie("csrf_refresh_token"))

    def test_successful_browser_account_deletion_clears_all_session_cookies(self):
        response = self.register()
        result = self.client.delete("/api/auth/me", headers=self.browser_headers(response))
        self.assertEqual(result.status_code, 200, result.get_json())
        for name, path in (("access_token_cookie", "/api"),
                           ("refresh_token_cookie", "/api/auth/session"),
                           ("csrf_refresh_token", "/")):
            self.assertIsNone(self.client.get_cookie(name, path=path))
        self.assertEqual(self.client.get(PREFIX + "/me").status_code, 401)

    def test_registration_and_rotation_commit_failures_do_not_leave_partial_state(self):
        from sqlalchemy.exc import OperationalError
        from auth_session_models import AuthSession, AuthRefreshToken
        from models import User
        real_commit = self.db.session.commit

        def fail_final():
            # Auth throttles commit before the transactional credential work.
            if self.db.session.new or self.db.session.dirty:
                self.db.session.flush()
                raise OperationalError("secret", {}, Exception("secret"))
            return real_commit()

        with patch.object(self.db.session, "commit", side_effect=fail_final):
            failed = self.client.post(PREFIX + "/register", headers=NATIVE, json={"email": "failed@test", "password": "password123", "transport": "native"})
        self.assertEqual(failed.status_code, 503)
        self.assertEqual(User.query.count(), 0)
        self.assertEqual(AuthSession.query.count(), 0)
        response = self.register(native=True)
        with patch.object(self.db.session, "commit", side_effect=fail_final):
            failed = self.client.post(PREFIX + "/refresh", headers=NATIVE, json={"refresh_token": response.get_json()["refresh_token"]})
        self.assertEqual(failed.status_code, 503)
        self.assertEqual(AuthRefreshToken.query.count(), 1)
        self.assertIsNone(AuthRefreshToken.query.one().used_at)


class MigrationTest(unittest.TestCase):
    def test_additive_migration_preserves_user_and_cascades_owned_security_records(self):
        import importlib.util
        import sqlalchemy as sa
        from alembic.migration import MigrationContext
        from alembic.operations import Operations
        file = Path(__file__).resolve().parents[2] / "migrations/versions/0d97b865efa6_auth_sessions.py"
        spec = importlib.util.spec_from_file_location("session_migration", file)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        engine = sa.create_engine("sqlite:///:memory:")
        with engine.begin() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            old = sa.Table("users", sa.MetaData(), sa.Column("id", sa.Integer(), primary_key=True), sa.Column("email", sa.String(120)))
            old.create(connection)
            connection.execute(old.insert().values(id=1, email="preserved@test"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            reflected = sa.MetaData()
            reflected.reflect(connection)
            users = reflected.tables["users"]
            row = connection.execute(sa.select(users)).mappings().one()
            self.assertEqual(row["email"], "preserved@test")
            self.assertFalse(row["email_verified"])
            self.assertIsNone(row["legacy_tokens_valid_after"])
            from datetime import datetime
            sessions = reflected.tables["auth_sessions"]
            refresh = reflected.tables["auth_refresh_tokens"]
            action = reflected.tables["auth_action_tokens"]
            connection.execute(sessions.insert().values(id="s" * 64, user_id=1, transport="browser", created_at=datetime.now(), expires_at=datetime.now()))
            connection.execute(refresh.insert().values(digest="r" * 64, session_id="s" * 64))
            connection.execute(action.insert().values(digest="a" * 64, user_id=1, purpose="reset", expires_at=datetime.now()))
            connection.execute(users.delete().where(users.c.id == 1))
            for table in (sessions, refresh, action):
                self.assertEqual(connection.execute(sa.select(sa.func.count()).select_from(table)).scalar(), 0)
            with self.assertRaisesRegex(RuntimeError, "destructive downgrade refused"):
                migration.downgrade()
        engine.dispose()


class ConcurrencyTest(unittest.TestCase):
    def test_simultaneous_refresh_and_recovery_single_winner(self):
        # Separate clients/connections and a disposable file are necessary:
        # SQLite in-memory StaticPool shares one connection across threads.
        with tempfile.TemporaryDirectory(prefix="auth-concurrency-") as folder:
            with patch.dict(os.environ, {"FLASK_ENV": "development", "FLASK_SKIP_DOTENV": "1",
                "DATABASE_URL": "sqlite:///" + (Path(folder) / "synthetic.db").as_posix(),
                "JWT_SECRET_KEY": "synthetic-concurrency-secret-long-enough"}):
                from app import create_app, db, bcrypt
                app = create_app()
            app.config.update(TESTING=True, AUTH_ALLOW_LEGACY_TOKENS=False)
            mail = []
            app.config["AUTH_MAIL_DELIVERY"] = lambda **value: mail.append(value)
            with app.app_context(), patch.object(bcrypt, "_log_rounds", 4):
                db.create_all()
                client = app.test_client()
                registered = client.post(PREFIX + "/register", headers=NATIVE, json={"email": "race@test", "password": "password123", "transport": "native"}).get_json()

                def race(path, payload):
                    barrier = Barrier(2)

                    def run(_):
                        with app.test_client() as worker:
                            barrier.wait(timeout=10)
                            response = worker.post(PREFIX + path, json=payload, headers=NATIVE)
                            return response.status_code

                    with ThreadPoolExecutor(max_workers=2) as pool:
                        return sorted(pool.map(run, range(2)))

                self.assertEqual(race("/refresh", {"refresh_token": registered["refresh_token"]}), [200, 401])
                from auth_session_models import AuthSession
                db.session.expire_all()
                self.assertIsNotNone(AuthSession.query.one().revoked_at)
                client.post(PREFIX + "/forgot-password", json={"email": "race@test"}, headers=NATIVE)
                self.assertEqual(race("/reset-password", {"token": mail[-1]["token"], "password": "changed123"}), [200, 400])
                db.session.remove()
                db.engine.dispose()


if __name__ == "__main__":
    unittest.main()
