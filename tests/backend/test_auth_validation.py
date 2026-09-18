"""Isolated auth regressions: python -B tests/backend/test_auth_validation.py -v.

No dotenv reads, external database, network, or file-backed test database.
"""

import io
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Query

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


class AuthValidationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # dotenv 1.0.1 does not honor newer dotenv-disable environment flags.
        # Patch the loader itself BEFORE app.py's module-level app is imported.
        cls.environment = patch.dict(os.environ, {
            "DATABASE_URL": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "synthetic-auth-test-key-only-32-characters",
            "FLASK_ENV": "development",
        })
        cls.environment.start()
        cls.addClassCleanup(cls.environment.stop)
        cls.dotenv = patch("dotenv.load_dotenv", return_value=False)
        cls.dotenv.start()
        cls.addClassCleanup(cls.dotenv.stop)
        from app import create_app, db, bcrypt
        from models import User
        from routes import auth
        cls.create_app = staticmethod(create_app)
        cls.db, cls.bcrypt, cls.User, cls.auth = db, bcrypt, User, auth

    def setUp(self):
        self.app = self.create_app()
        self.app.config["TESTING"] = True
        self.context = self.app.app_context()
        self.context.push()
        self.db.create_all()
        self.client = self.app.test_client()
        self.rounds = patch.object(self.bcrypt, "_log_rounds", 4)
        self.rounds.start()

    def tearDown(self):
        self.rounds.stop()
        self.db.session.remove()
        self.db.engine.dispose()
        self.context.pop()

    def post(self, route="register", **fields):
        return self.client.post("/api/auth/" + route, json={
            "email": "cook@example.test", "password": "password123", **fields,
        })

    def assert_error(self, response, status=400):
        self.assertEqual(response.status_code, status, response.get_data(as_text=True))
        self.assertIsInstance(response.get_json().get("error"), str)
        self.assertNotIn("token", response.get_json())

    def seed(self, password="password123", email="cook@example.test", password_hash=None):
        # Independent old-bcrypt oracle: hashes used the first 72 UTF-8 bytes.
        hashed = password_hash or self.bcrypt.generate_password_hash(password.encode("utf-8")[:72]).decode("utf-8")
        user = self.User(email=email, password_hash=hashed)
        self.db.session.add(user)
        self.db.session.commit()
        return user

    def test_malformed_json_and_non_objects(self):
        bodies = ["", "{", "null", "[]", '[{"email":"cook"}]', '"text"', "1", "false",
                  '{"email": NaN}', '{"email": Infinity}', b'\xff', "[" * 1500 + "]" * 1500]
        for route in ("register", "login"):
            for body in bodies:
                with self.subTest(route=route, body=repr(body)[:60]):
                    self.assert_error(self.client.post("/api/auth/" + route, data=body, content_type="application/json"))
            self.assert_error(self.client.post("/api/auth/" + route, data="email=cook", content_type="text/plain"))
            self.assert_error(self.client.post("/api/auth/" + route))

    def test_field_types_and_missing_credentials_before_backend_access(self):
        with patch.object(Query, "first", side_effect=AssertionError("validation must precede database access")):
            for route in ("register", "login"):
                for field in ("email", "password", "display_name"):
                    for value in ([], ["text"], {}, {"value": "text"}, 1, 1.5, True, False, None):
                        if field == "display_name" and value is None:
                            continue
                        with self.subTest(route=route, field=field, value=value):
                            self.assert_error(self.post(route, **{field: value}))
                for fields in ({}, {"email": "cook"}, {"password": "password123"}):
                    self.assert_error(self.client.post("/api/auth/" + route, json=fields))
                for field in ("email", "password"):
                    self.assert_error(self.post(route, **{field: ""}))
                self.assert_error(self.post(route, email=" \t\n"))

    def test_bad_unicode_and_database_nul_are_controlled(self):
        for route in ("register", "login"):
            for field in ("email", "password", "display_name"):
                for value in ("\ud800", "abcdefgh\udfff"):
                    with self.subTest(route=route, field=field, value=repr(value)):
                        self.assert_error(self.post(route, **{field: value}))
            for field in ("email", "display_name"):
                self.assert_error(self.post(route, **{field: "abc\x00def"}))

    def test_oversized_fields_and_whole_payload_before_backend_access(self):
        with patch.object(Query, "first", side_effect=AssertionError("oversized input reached database")):
            for route in ("register", "login"):
                for field in ("email", "password", "display_name"):
                    for value in ("x" * 4097, "😀" * 1025):
                        self.assert_error(self.post(route, **{field: value}))
                self.assert_error(self.post(route, ignored="x" * self.auth.MAX_AUTH_JSON_BYTES))
            self.assert_error(self.post(email="x" * 121))
            self.assert_error(self.post(display_name="x" * 101))
            # Lowercasing expands U+0130 to two code points; check stored size.
            self.assert_error(self.post(email="İ" * 61))

    def test_body_bound_without_content_length(self):
        for route in ("register", "login"):
            stream = io.BytesIO(b" " * (self.auth.MAX_AUTH_JSON_BYTES + 100))
            response = self.client.open("/api/auth/" + route, method="POST", environ_overrides={
                "CONTENT_TYPE": "application/json", "CONTENT_LENGTH": "",
                "wsgi.input": stream, "wsgi.input_terminated": True,
            })
            self.assert_error(response)
            self.assertEqual(stream.tell(), self.auth.MAX_AUTH_JSON_BYTES + 1)

    def test_register_normalization_and_response_contract(self):
        from flask_jwt_extended import decode_token
        response = self.post(email="  COOK@Example.Test \t", display_name="  Zoë 👩‍🍳  ", ignored={"legacy": True})
        self.assertEqual(response.status_code, 201)
        body = response.get_json()
        self.assertEqual(set(body), {"token", "user"})
        self.assertEqual(body["user"], {"id": 1, "email": "cook@example.test", "display_name": "Zoë 👩‍🍳", "plan": "free"})
        claims = decode_token(body["token"])
        self.assertEqual(claims["sub"], str(body["user"]["id"]))
        self.assertEqual(claims["type"], "access")
        self.assertEqual(claims["exp"] - claims["iat"], 30 * 24 * 60 * 60)
        self.assertFalse(response.headers.getlist("Set-Cookie"))
        self.assertEqual(self.client.get("/api/auth/me", headers={"Authorization": "Bearer " + body["token"]}).get_json(), body["user"])
        user = self.User.query.one()
        self.assertNotEqual(user.password_hash, "password123")
        self.assertTrue(self.bcrypt.check_password_hash(user.password_hash, "password123"))

    def test_optional_display_name_and_permissive_existing_email_rules(self):
        for index, display_name in enumerate((None, "", " \t ")):
            response = self.post(email=f" legacy-name-{index} ", display_name=display_name)
            self.assertEqual(response.status_code, 201)
            self.assertIsNone(response.get_json()["user"]["display_name"])
        response = self.post(email="名" * 120, display_name="😀" * 100)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.post("login", email="名" * 120).status_code, 200)

    def test_password_minimum_still_counts_characters_only_on_registration(self):
        for password in ("a" * 7, "😀" * 7):
            response = self.post(password=password)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.get_json(), {"error": "Password must be at least 8 characters", "code": "password_too_short", "min": 8})
        self.assertEqual(self.post(password="😀" * 8).status_code, 201)
        self.seed(password="old", email="short")
        self.assertEqual(self.post("login", email="short", password="old").status_code, 200)

    def test_existing_login_case_normalization_and_invalid_credentials(self):
        user = self.seed(email="Cook@Example.Test")
        response = self.post("login", email=" COOK@EXAMPLE.TEST ")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["user"], user.to_dict())
        for fields in ({"password": "wrong"}, {"email": "missing"}):
            response = self.post("login", **fields)
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.get_json(), {"error": "Invalid credentials", "code": "invalid_credentials"})
        response = self.post(email=" COOK@example.test ")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json(), {"error": "Email already registered", "code": "email_taken"})

    def test_legacy_bcrypt_bytes_and_passwords_are_not_normalized(self):
        passwords = ["a" * 72 + "old suffix", "a" * 71 + "é-end", "密碼😀" * 30,
                     " spaced password ", "nul\x00password", "x" * 4096, "😀" * 1024]
        for index, password in enumerate(passwords):
            email = f"legacy-{index}"
            self.seed(password=password, email=email)
            self.assertEqual(self.post("login", email=email, password=password).status_code, 200)
            fresh = f"new-{index}"
            self.assertEqual(self.post(email=fresh, password=password).status_code, 201)
            self.assertEqual(self.post("login", email=fresh, password=password).status_code, 200)
        self.assertEqual(self.post("login", email="legacy-0", password="a" * 72 + "changed suffix").status_code, 200)
        self.assertEqual(self.post("login", email="legacy-1", password="a" * 71 + "ê-other").status_code, 200)
        self.assertEqual(self.post("login", email="legacy-3", password="spaced password").status_code, 401)
        self.seed(password="é" * 8, email="unicode")
        self.assertEqual(self.post("login", email="unicode", password="e\u0301" * 8).status_code, 401)

    def test_existing_flask_bcrypt_prehash_mode_is_preserved(self):
        with patch.object(self.bcrypt, "_handle_long_passwords", True):
            password = "a" * 72 + "suffix"
            hashed = self.bcrypt.generate_password_hash(password).decode("utf-8")
            self.seed(password_hash=hashed)
            self.assertEqual(self.post("login", password=password).status_code, 200)
            self.assertEqual(self.post("login", password="a" * 72 + "different").status_code, 401)
            self.assertEqual(self.post(email="new", password=password).status_code, 201)
            self.assertEqual(self.post("login", email="new", password=password).status_code, 200)

    def test_bcrypt_rejecting_embedded_nul_returns_sanitized_400(self):
        password = "private\x00password"
        for route, method in (("register", "generate_password_hash"), ("login", "check_password_hash")):
            if route == "login":
                self.seed()
            with patch.object(self.bcrypt, method, side_effect=ValueError("bcrypt rejected " + password)):
                response = self.post(route, password=password)
                self.assert_error(response)
                self.assertEqual(response.get_json(), {"error": "Invalid password"})
            self.assertTrue(self.db.session.is_active)
            self.assertEqual(self.User.query.count(), 0 if route == "register" else 1)

    def test_registration_retains_legacy_72_byte_prefix_collisions(self):
        # This explicitly records preserved behavior, not a claim that it is a
        # desirable new password policy. Both ASCII and split UTF-8 boundaries.
        for index, (password, equivalent) in enumerate((
            ("a" * 72 + "one", "a" * 72 + "two"),
            ("a" * 71 + "é-one", "a" * 71 + "ê-two"),
        )):
            email = f"prefix-{index}"
            self.assertEqual(self.post(email=email, password=password).status_code, 201)
            self.assertEqual(self.post("login", email=email, password=equivalent).status_code, 200)
            self.assertEqual(self.post("login", email=email, password="b" + password[1:]).status_code, 401)

    def test_non_bcrypt_value_error_is_not_classified_as_bad_password(self):
        for route in ("register", "login"):
            with patch.object(Query, "first", side_effect=ValueError("private backend error")):
                response = self.post(route, password="private\x00password")
                self.assert_error(response, 503)
                self.assertNotIn("private", response.get_data(as_text=True))

    def test_duplicate_race_uses_real_unique_failure_and_rolls_back(self):
        original = self.seed()
        original_hash = original.password_hash
        # Deterministically simulate a stale preflight; the insert actually hits
        # SQLite's email unique constraint, leaving the session failed until rollback.
        with patch.object(Query, "first", return_value=None), patch.object(self.db.session, "rollback", wraps=self.db.session.rollback) as rollback:
            response = self.post(password="different-password")
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.get_json()["code"], "email_taken")
            rollback.assert_called_once()
        self.assertEqual(self.User.query.count(), 1)
        self.assertEqual(self.User.query.one().password_hash, original_hash)
        self.assertTrue(self.db.session.is_active)
        self.assertEqual(self.post(email="after-race").status_code, 201)

    def test_unrelated_integrity_failure_is_not_email_conflict(self):
        self.seed()
        original_add = self.db.session.add

        def invalid_user(user):
            user.password_hash = None  # Real NOT NULL failure, no email conflict.
            original_add(user)

        with patch.object(self.db.session, "add", side_effect=invalid_user), self.assertLogs(self.app.logger, level="ERROR") as logs:
            response = self.post(email="other")
            self.assert_error(response, 503)
        self.assertEqual(response.get_json(), {"error": "Authentication temporarily unavailable"})
        self.assertNotIn("NOT NULL", " ".join(logs.output))
        self.assertNotIn("password123", response.get_data(as_text=True) + " ".join(logs.output))
        self.assertEqual(self.User.query.count(), 1)
        self.assertTrue(self.db.session.is_active)
        self.assertEqual(self.post(email="after-failure").status_code, 201)

    def test_database_failure_after_flush_rolls_back_without_leaking(self):
        secret = "sensitive-password-and-database-url"

        def fail_commit():
            self.db.session.flush()
            raise OperationalError("INSERT secret", {"password": secret}, Exception(secret))

        with patch.object(self.db.session, "commit", side_effect=fail_commit), self.assertLogs(self.app.logger, level="ERROR") as logs:
            response = self.post()
            self.assert_error(response, 503)
        self.assertNotIn(secret, response.get_data(as_text=True) + " ".join(logs.output))
        self.assertEqual(self.User.query.count(), 0)
        self.assertTrue(self.db.session.is_active)
        self.assertEqual(self.post().status_code, 201)

    def test_query_failures_and_corrupt_hash_are_generic(self):
        error = OperationalError("private SQL", {"email": "private"}, Exception("private backend detail"))
        for route in ("register", "login"):
            with patch.object(Query, "first", side_effect=error):
                response = self.post(route)
                self.assert_error(response, 503)
                self.assertNotIn("private", response.get_data(as_text=True))
            self.assertTrue(self.db.session.is_active)
        self.seed(password_hash="broken-private-hash")
        response = self.post("login")
        self.assert_error(response, 503)
        self.assertNotIn("broken-private-hash", response.get_data(as_text=True))

    def test_postgresql_constraint_classification_uses_diagnostics(self):
        # Diagnostic stand-ins only: this is not live PostgreSQL concurrency proof.
        for code, table, constraint, expected in (
            ("23505", "users", "users_email_key", True),
            ("23505", "users", "users_pkey", False),
            ("23505", "other", "users_email_key", False),
            ("23502", "users", "users_email_key", False),
            ("23505", "users", "custom_constraint", False),
        ):
            original = Exception("private database diagnostic")
            original.pgcode = code
            original.diag = SimpleNamespace(table_name=table, constraint_name=constraint)
            error = IntegrityError("private SQL", {}, original)
            self.assertEqual(self.auth._email_conflict(error), expected)
            with patch.object(self.db.session, "commit", side_effect=error):
                response = self.post()
                self.assert_error(response, 409 if expected else 503)
            self.assertEqual(self.User.query.count(), 0)


if __name__ == "__main__":
    unittest.main()
