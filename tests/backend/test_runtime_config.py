"""Offline runtime boundary tests; dotenv is disabled before any app import."""

import os
from pathlib import Path
import sys
import unittest
import tempfile
from unittest.mock import MagicMock, patch

os.environ["FLASK_SKIP_DOTENV"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from flask import Response, jsonify, request

# The existing WSGI module creates an app on import. Isolate that app as well.
with patch.dict(os.environ, {"FLASK_ENV": "testing", "FLASK_SKIP_DOTENV": "1"}, clear=True):
    with patch("dotenv.load_dotenv", side_effect=AssertionError("dotenv must not load")):
        with patch.object(Engine, "connect", side_effect=AssertionError("import must not connect")):
            import app as app_module

from runtime_config import PROXY_HEADERS, TEST_SECRET, build_runtime_config


PRODUCTION = {
    "DATABASE_URL": "postgresql://fixture:synthetic-password@db.invalid/fixture",
    "JWT_SECRET_KEY": "synthetic-production-secret-for-validation-only",
}


class RuntimeTestCase(unittest.TestCase):
    def factory(self, settings=None, *, environment=None, mock_db=False):
        with patch.dict(os.environ, {"FLASK_SKIP_DOTENV": "1", **(settings or {})}, clear=True):
            if mock_db:
                # psycopg2 is not installed locally; this verifies config/wiring,
                # not a PostgreSQL engine or connection.
                with patch.object(app_module.db, "init_app") as init_db:
                    application = app_module.create_app(environment=environment)
                    init_db.assert_called_once_with(application)
            else:
                application = app_module.create_app(environment=environment)
                self.addCleanup(self.dispose, application)
        return application

    @staticmethod
    def dispose(application):
        with application.app_context():
            app_module.db.session.remove()
            app_module.db.engine.dispose()


class ConfigurationTests(RuntimeTestCase):
    def setUp(self):
        guard = patch.object(Engine, "connect", side_effect=AssertionError("validation must not connect"))
        self.connection = guard.start()
        self.addCleanup(guard.stop)

    def test_default_production_requires_database_and_secret_before_init(self):
        cases = [
            {},
            {"JWT_SECRET_KEY": PRODUCTION["JWT_SECRET_KEY"]},
            {"DATABASE_URL": PRODUCTION["DATABASE_URL"]},
            {**PRODUCTION, "DATABASE_URL": "sqlite:///:memory:"},
            {**PRODUCTION, "DATABASE_URL": "mysql://fixture:password@db.invalid/fixture"},
            {**PRODUCTION, "DATABASE_URL": "postgresql://db.invalid/"},
            {**PRODUCTION, "DATABASE_URL": "postgresql+unknown://db.invalid/fixture"},
            {**PRODUCTION, "DATABASE_URL": "not-a-url-synthetic-password"},
            {**PRODUCTION, "DATABASE_URL": "postgresql://fixture:synthetic-password@db.invalid:bad/fixture"},
            {**PRODUCTION, "DATABASE_URL": " "},
            {**PRODUCTION, "JWT_SECRET_KEY": " "},
            {**PRODUCTION, "JWT_SECRET_KEY": "dev-secret"},
            {**PRODUCTION, "JWT_SECRET_KEY": TEST_SECRET},
            {**PRODUCTION, "FLASK_ENV": "staging"},
            {**PRODUCTION, "FLASK_ENV": ""},
        ]
        for index, settings in enumerate(cases):
            with self.subTest(case=index):
                with patch.dict(os.environ, {"FLASK_SKIP_DOTENV": "1", **settings}, clear=True):
                    with patch.object(app_module.db, "init_app") as init_db:
                        with self.assertRaises(RuntimeError) as raised:
                            app_module.create_app()
                        init_db.assert_not_called()
                        message = str(raised.exception)
                        self.assertNotIn("synthetic-password", message)
                        self.assertNotIn(PRODUCTION["JWT_SECRET_KEY"], message)
                        self.assertNotIn("db.invalid", message)
        self.connection.assert_not_called()

    def test_valid_production_and_legacy_postgres_scheme_without_driver(self):
        for scheme in ("postgres", "postgresql", "postgresql+psycopg2"):
            with self.subTest(scheme=scheme):
                application = self.factory({**PRODUCTION, "DATABASE_URL": f"{scheme}://fixture:password@db.invalid/fixture"}, mock_db=True)
                self.assertEqual(application.config["RUNTIME_ENV"], "production")
                self.assertTrue(application.config["SQLALCHEMY_DATABASE_URI"].startswith("postgresql"))
                self.assertFalse(application.testing)
                self.assertFalse(application.debug)
                self.assertEqual(application.config["API_CORS_ORIGINS"], ())
                self.assertEqual(application.config["JWT_ACCESS_TOKEN_EXPIRES"].days, 30)
                self.assertEqual(tuple(application.config["JWT_TOKEN_LOCATION"]), ("headers",))
        self.connection.assert_not_called()

    def test_development_defaults_and_existing_sqlite_flow(self):
        config = build_runtime_config({"FLASK_ENV": "development"})
        self.assertEqual(config["SQLALCHEMY_DATABASE_URI"], "sqlite:///cookbook.db")
        self.assertEqual(config["JWT_SECRET_KEY"], "dev-secret")
        self.assertEqual(config["API_CORS_ORIGINS"], ("http://localhost:5173",))
        application = self.factory({"FLASK_ENV": "development", "DATABASE_URL": "sqlite:///:memory:"})
        self.assertEqual(application.config["RUNTIME_ENV"], "development")
        self.connection.assert_not_called()

    def test_testing_isolated_from_every_deployment_setting(self):
        settings = {
            **PRODUCTION,
            "FLASK_ENV": "testing",
            "CORS_ORIGINS": "*",
            "FRONTEND_URL": "https://production.invalid",
            "MAX_CONTENT_LENGTH": "invalid",
            **{f"PROXY_FIX_X_{header.upper()}": "7" for header in PROXY_HEADERS},
        }
        for explicit in (False, True):
            with self.subTest(explicit=explicit):
                application = self.factory(
                    {**settings, "FLASK_ENV": "production" if explicit else "testing"},
                    environment="testing" if explicit else None,
                )
                self.assertTrue(application.testing)
                self.assertEqual(application.config["SQLALCHEMY_DATABASE_URI"], "sqlite:///:memory:")
                self.assertEqual(application.config["JWT_SECRET_KEY"], TEST_SECRET)
                self.assertEqual(application.config["API_CORS_ORIGINS"], ())
                self.assertEqual(application.config["MAX_CONTENT_LENGTH"], 1024 * 1024)
                for header in PROXY_HEADERS:
                    self.assertEqual(application.config[f"PROXY_FIX_X_{header.upper()}"], 0)

    def test_dotenv_skip_and_mode_gating(self):
        with patch.object(app_module, "load_dotenv") as dotenv:
            self.factory({"FLASK_ENV": "development", "DATABASE_URL": "sqlite:///:memory:"})
            self.factory({**PRODUCTION, "FLASK_SKIP_DOTENV": "0"}, mock_db=True)
            self.factory({"FLASK_ENV": "testing", "FLASK_SKIP_DOTENV": "0"})
            dotenv.assert_not_called()
            self.factory({"FLASK_ENV": "development", "DATABASE_URL": "sqlite:///:memory:", "FLASK_SKIP_DOTENV": "0"})
            dotenv.assert_called_once_with()

    def test_invalid_limits_proxy_counts_and_origins_fail_before_init(self):
        invalid = [("MAX_CONTENT_LENGTH", value) for value in ("0", "-1", "", "1.5", "none")]
        invalid += [(f"PROXY_FIX_X_{header.upper()}", value) for header in PROXY_HEADERS for value in ("-1", "1.5", "", "true")]
        invalid += [("CORS_ORIGINS", value) for value in (
            "*", "https://*.example.test", "null", "https://example.test/path", "https://example.test/",
            "https://user:password@example.test", "https://example.test?query", "https://example.test#fragment",
            "https://example.test,", "https://example.test:bad", "https://example.test:0", "https://example.test:",
            "https://example.test?", "https://exam\tple.test", "https://example.test$",
        )]
        for name, value in invalid:
            with self.subTest(setting=name, value=value):
                with patch.dict(os.environ, {"FLASK_SKIP_DOTENV": "1", **PRODUCTION, name: value}, clear=True):
                    with patch.object(app_module.db, "init_app") as init_db:
                        with self.assertRaises(RuntimeError):
                            app_module.create_app()
                        init_db.assert_not_called()


class HttpBoundaryTests(RuntimeTestCase):
    def test_api_misses_errors_and_spa_boundary(self):
        application = self.factory(environment="testing")
        client = application.test_client()
        with patch.object(app_module, "send_from_directory", return_value=Response("SPA fixture")) as static:
            for path in ("/api", "/api/", "/api/not-a-route", "/api/not-a-route/nested"):
                response = client.get(path)
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.get_json(), {"error": "Not Found"})
                self.assertEqual(response.headers["Cache-Control"], "no-store")
            static.assert_not_called()
            response = client.get("/learn")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, b"SPA fixture")
        response = client.post("/api/not-a-route")
        self.assertEqual(response.status_code, 405)
        self.assertTrue(response.is_json)
        self.assertIn("GET", response.headers["Allow"])
        self.assertEqual(client.head("/api/not-a-route").status_code, 404)

    def test_api_success_auth_error_and_preflight_have_defensive_headers(self):
        application = self.factory(environment="testing")

        @application.get("/api/runtime-fixture")
        def fixture():
            return jsonify(ok=True), 200, {"Cache-Control": "public, max-age=300"}

        client = application.test_client()
        responses = [client.get("/api/runtime-fixture"), client.get("/api/auth/me"), client.options("/api/runtime-fixture")]
        self.assertEqual(responses[1].status_code, 401)
        for response in responses:
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
            self.assertEqual(response.headers["Referrer-Policy"], "no-referrer")

    def test_production_cors_default_denies_and_allowlist_matches_exactly(self):
        application = self.factory(PRODUCTION, mock_db=True)
        response = application.test_client().get("/api/missing", headers={"Origin": "http://localhost:5173"})
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)
        application = self.factory({**PRODUCTION, "CORS_ORIGINS": "https://ui.example.test, https://other.example.test"}, mock_db=True)
        client = application.test_client()
        for origin in ("https://ui.example.test", "https://other.example.test"):
            response = client.get("/api/missing", headers={"Origin": origin})
            self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), origin)
        for origin in ("http://localhost:5173", "https://uiXexample.test", "https://ui.example.test.evil.invalid", "null"):
            response = client.get("/api/missing", headers={"Origin": origin})
            self.assertNotIn("Access-Control-Allow-Origin", response.headers)
        response = client.options("/api/auth/login", headers={
            "Origin": "https://ui.example.test", "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        })
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "https://ui.example.test")
        self.assertIn("Authorization", response.headers["Access-Control-Allow-Headers"])
        self.assertNotIn("Access-Control-Allow-Credentials", response.headers)
        self.assertNotIn("Access-Control-Allow-Origin", client.get("/api/missing").headers)

    def test_frontend_url_fallback_and_explicit_cors_disable(self):
        config = build_runtime_config({**PRODUCTION, "FRONTEND_URL": "https://ui.example.test"})
        self.assertEqual(config["API_CORS_ORIGINS"], ("https://ui.example.test",))
        config = build_runtime_config({**PRODUCTION, "FRONTEND_URL": "https://ui.example.test", "CORS_ORIGINS": ""})
        self.assertEqual(config["API_CORS_ORIGINS"], ())
        application = self.factory({"FLASK_ENV": "development", "DATABASE_URL": "sqlite:///:memory:"})
        response = application.test_client().get("/api/missing", headers={"Origin": "http://localhost:5173"})
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "http://localhost:5173")

    def test_proxy_headers_ignored_by_default_and_configured_independently(self):
        def probe(settings):
            application = self.factory({"FLASK_ENV": "development", "DATABASE_URL": "sqlite:///:memory:", **settings})

            @application.get("/api/runtime-proxy")
            def proxy_fixture():
                return jsonify(ip=request.remote_addr, scheme=request.scheme, host=request.host, prefix=request.script_root)

            return application.test_client().get("/api/runtime-proxy", headers={
                "X-Forwarded-For": "192.0.2.1, 192.0.2.2", "X-Forwarded-Proto": "https",
                "X-Forwarded-Host": "forwarded.invalid", "X-Forwarded-Port": "8443", "X-Forwarded-Prefix": "/edge",
            }).get_json()

        self.assertEqual(probe({}), {"ip": "127.0.0.1", "scheme": "http", "host": "localhost", "prefix": ""})
        self.assertEqual(probe({"PROXY_FIX_X_FOR": "1", "PROXY_FIX_X_PROTO": "1"}),
                         {"ip": "192.0.2.2", "scheme": "https", "host": "localhost", "prefix": ""})
        self.assertEqual(probe({f"PROXY_FIX_X_{header.upper()}": "1" for header in PROXY_HEADERS}),
                         {"ip": "192.0.2.2", "scheme": "https", "host": "forwarded.invalid:8443", "prefix": "/edge"})
        self.assertEqual(probe({"PROXY_FIX_X_FOR": "2"})["ip"], "192.0.2.1")

    def test_finite_body_limit_known_and_streamed_lengths(self):
        application = self.factory({"FLASK_ENV": "development", "DATABASE_URL": "sqlite:///:memory:", "MAX_CONTENT_LENGTH": "16"})

        @application.post("/api/runtime-body")
        def body_fixture():
            return jsonify(length=len(request.get_data()))

        client = application.test_client()
        self.assertEqual(client.post("/api/runtime-body", data=b"a" * 16).get_json(), {"length": 16})
        for path in ("/api/runtime-body", "/api/auth/login", "/api/unknown"):
            response = client.post(path, data=b"a" * 17)
            self.assertEqual(response.status_code, 413)
            self.assertTrue(response.is_json)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
        response = client.post("/api/runtime-body", data=b"a" * 17, environ_overrides={"CONTENT_LENGTH": "", "wsgi.input_terminated": True})
        # Werkzeug can return the capped prefix for an unknown-length stream;
        # the application must never read more than the configured byte limit.
        self.assertEqual(response.get_json(), {"length": 16})


class HealthTests(RuntimeTestCase):
    def test_real_public_shell_headers_match_worker_contract(self):
        application = self.factory(environment="testing")
        with tempfile.TemporaryDirectory(prefix="cookbook-shell-") as folder:
            directory = Path(folder)
            (directory / "assets").mkdir()
            (directory / "fonts").mkdir()
            (directory / "fonts" / "plus-jakarta-sans-variable.ttf").write_bytes(b"\x00\x01\x00\x00" + b"font fixture" * 200)
            (directory / "index.html").write_text("<html>" + "public shell " * 200 + "</html>", encoding="utf-8")
            (directory / "assets" / "index-Abcd1234.js").write_text("// public build\n" * 200, encoding="utf-8")
            application.static_folder = folder
            client = application.test_client()
            for path, age in (("/", 60), ("/index.html", 60), ("/assets/index-Abcd1234.js", 31536000), ("/fonts/plus-jakarta-sans-variable.ttf", 60)):
                with client.get(path, headers={"Accept-Encoding": "gzip"}) as response:
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.cache_control.max_age, age)
                    self.assertTrue(response.cache_control.public)
                    self.assertFalse(response.cache_control.no_cache)
                    self.assertEqual({v.lower() for v in response.vary}, {"accept-encoding"})
            with client.get("/settings") as response:
                self.assertTrue(response.cache_control.no_cache)
            with client.get("/api/missing") as response:
                self.assertEqual(response.cache_control.to_header(), "no-store")

    def test_liveness_never_connects(self):
        application = self.factory(environment="testing")
        with patch.object(Engine, "connect", side_effect=AssertionError("liveness must not connect")):
            response = application.test_client().get("/health/live")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_readiness_runs_only_select_one_without_schema(self):
        application = self.factory(environment="testing")
        statements = []
        with application.app_context():
            engine = app_module.db.engine
            event.listen(engine, "before_cursor_execute", lambda conn, cursor, statement, parameters, context, many: statements.append(statement))
        response = application.test_client().get("/health/ready")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})
        self.assertEqual(statements, ["SELECT 1"])
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_readiness_sanitizes_connect_execute_and_cleanup_failures(self):
        application = self.factory(environment="testing")
        error = OperationalError("SELECT secret", {}, Exception("synthetic-password postgres://fixture:secret@db.invalid/fixture"))
        for stage in ("connect", "execute", "close", "unexpected-result"):
            with self.subTest(stage=stage):
                connection = MagicMock()
                connection.execute.return_value.scalar_one.return_value = 0 if stage == "unexpected-result" else 1
                manager = MagicMock()
                manager.__enter__.return_value = connection
                if stage == "execute":
                    connection.execute.side_effect = error
                if stage == "close":
                    manager.__exit__.side_effect = error
                with patch.object(Engine, "connect", return_value=manager, side_effect=error if stage == "connect" else None):
                    with patch.object(application.logger, "error") as log_error, patch.object(application.logger, "exception") as log_exception:
                        response = application.test_client().get("/health/ready")
                        log_error.assert_not_called()
                        log_exception.assert_not_called()
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.get_json(), {"status": "unavailable"})
                self.assertNotIn("secret", response.get_data(as_text=True))
                self.assertNotIn("db.invalid", str(response.headers))
                self.assertEqual(response.headers["Cache-Control"], "no-store")
                if stage != "connect":
                    manager.__exit__.assert_called_once()


if __name__ == "__main__":
    unittest.main()
