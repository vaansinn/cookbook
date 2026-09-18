"""Pure guard tests: standard library only, no PostgreSQL/driver/connection."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import MagicMock, Mock, patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("verify_postgres", ROOT / "scripts" / "verify_postgres.py")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


def configured():
    return {
        runner.CONFIRM_KEY: runner.CONFIRM_VALUE,
        runner.URL_KEYS[0]: "postgresql://test_user:test_password@localhost:55432/cookbook_test_fresh",
        runner.URL_KEYS[1]: "postgresql://test_user:test_password@localhost:55432/cookbook_test_history",
    }


class PostgresRunnerSafetyTest(unittest.TestCase):
    def assert_refused_without_io(self, env):
        with patch.object(runner, "captured_run") as process, \
                patch.object(runner, "load_database_tools") as database, \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(runner.main(env), 2)
            process.assert_not_called()
            database.assert_not_called()
        self.assertNotIn("test_password", output.getvalue())

    def test_exact_pair_is_accepted_without_driver(self):
        env = configured()
        self.assertEqual(runner.validate_targets(env), tuple(env[key] for key in runner.URL_KEYS))

    def test_psycopg2_scheme_and_encoded_credentials(self):
        env = configured()
        env[runner.URL_KEYS[0]] = env[runner.URL_KEYS[0]].replace("postgresql://test_user:test_password", "postgresql+psycopg2://test_user:p%40ss%3Aword")
        self.assertEqual(len(runner.validate_targets(env)), 2)

    def test_confirmation_is_exact_and_required(self):
        for value in (None, "", "yes", "true", runner.CONFIRM_VALUE + " "):
            with self.subTest(value=value):
                env = configured()
                env[runner.CONFIRM_KEY] = value
                self.assert_refused_without_io(env)

    def test_each_url_is_required_no_generic_fallback(self):
        for key in runner.URL_KEYS:
            with self.subTest(key=key):
                env = configured()
                env["DATABASE_URL"] = env.pop(key)
                self.assert_refused_without_io(env)

    def test_rejects_unsafe_or_ambiguous_targets_in_either_slot(self):
        for key, name in zip(runner.URL_KEYS, runner.DATABASES):
            base = configured()[key]
            invalid = [
                base.replace("localhost", host) for host in
                ("127.0.0.1", "[::1]", "LOCALHOST", "localhost.", "localhost.evil.test",
                 "remote.example.test", "%6cocalhost", "localhost,remote.example.test", "")
            ] + [
                base.replace(":55432", port) for port in ("", ":5432", ":055432", ":0", ":65536")
            ] + [
                base.replace(name, database) for database in
                ("postgres", "cookbook", "cookbook_prod", name + "_backup", "%63" + name[1:], "")
            ] + [
                base + suffix for suffix in
                ("?", "#", "?host=remote.example.test", "?hostaddr=8.8.8.8", "?service=prod",
                 "?options=-csearch_path=private", "?sslmode=disable", "?port=5432", "#fragment", "/", "\n")
            ] + [
                " " + base, base.replace("postgresql", "sqlite"), base.replace("postgresql", "postgres"),
                base.replace("postgresql", "postgresql+asyncpg"),
                base.replace("test_user:test_password@", ""), base.replace("test_password", ""),
                base.replace("test_password", "p%00ss"), base.replace("test_password", "p%0ass"),
                base.replace("test_password", "p%FFss"), base.replace("test_password", "p%xxss"),
                base.replace("test_password", "a@remote:55432/x"), base.replace("localhost", r"localhost\evil"),
            ]
            for value in invalid:
                with self.subTest(key=key, value=value):
                    env = configured()
                    env[key] = value
                    self.assert_refused_without_io(env)

    def test_same_database_or_swapped_pair_is_rejected(self):
        env = configured()
        env[runner.URL_KEYS[1]] = env[runner.URL_KEYS[0]]
        self.assert_refused_without_io(env)
        env = configured()
        env[runner.URL_KEYS[0]], env[runner.URL_KEYS[1]] = env[runner.URL_KEYS[1]], env[runner.URL_KEYS[0]]
        self.assert_refused_without_io(env)

    def test_child_environment_removes_external_configuration(self):
        env = configured()
        env.update(DATABASE_URL="postgresql://production", PGHOST="remote", PGHOSTADDR="8.8.8.8",
                   PGSERVICE="production", PGSERVICEFILE="private.conf", PGPASSFILE="private.pass",
                   PGOPTIONS="unsafe", SQLALCHEMY_DATABASE_URI="production", PYTHONPATH="outside",
                   PYTHONOPTIMIZE="1", FLASK_APP="elsewhere", SMTP_PASSWORD="private",
                   JWT_SECRET_KEY="real-secret", PATH="runtime-path", SYSTEMROOT="system-root")
        clean = runner.isolated_env(env, runner.validate_targets(env))
        for key in ("DATABASE_URL", "PGHOST", "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE",
                    "PGOPTIONS", "SQLALCHEMY_DATABASE_URI", "PYTHONPATH", "PYTHONOPTIMIZE", "FLASK_APP", "SMTP_PASSWORD"):
            self.assertNotIn(key, clean)
        self.assertNotEqual(clean["JWT_SECRET_KEY"], "real-secret")
        self.assertEqual(clean["FLASK_SKIP_DOTENV"], "1")
        self.assertEqual(clean["PATH"], "runtime-path")

    def test_both_emptiness_checks_precede_any_exercise(self):
        env = configured()
        fake_sa = Mock()
        engines = [Mock(), Mock()]
        fake_sa.create_engine.side_effect = engines
        events = []
        with patch.dict(os.environ, env, clear=True), \
                patch.object(runner, "load_database_tools", return_value=fake_sa), \
                patch.object(runner, "engine_url", return_value=Mock()), \
                patch.object(runner, "inspect_empty", side_effect=lambda sa, engine, db: events.append(db)), \
                patch.object(runner, "exercise", side_effect=lambda *a, **k: events.append("write")), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runner.worker(), 0)
        self.assertEqual(events, [*runner.DATABASES, "write", "write"])

    def test_nonempty_either_target_prevents_all_writes(self):
        for index in (0, 1):
            env = configured()
            fake_sa = Mock()
            fake_sa.exc.OperationalError = ConnectionError
            results = [None] * index + [runner.Refused("occupied")]
            with self.subTest(index=index), patch.dict(os.environ, env, clear=True), \
                    patch.object(runner, "load_database_tools", return_value=fake_sa), \
                    patch.object(runner, "engine_url", return_value=Mock()), \
                    patch.object(runner, "inspect_empty", side_effect=results), \
                    patch.object(runner, "exercise") as writes, \
                    contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(runner.worker(), 2)
                writes.assert_not_called()

    def test_catalog_guard_is_read_only_and_rejects_user_relations(self):
        fake_sa = Mock()
        fake_sa.text.side_effect = lambda sql: sql
        engine = MagicMock()
        connection = engine.connect.return_value.__enter__.return_value
        connection.execute.side_effect = [Mock(), Mock(scalar_one=lambda: runner.DATABASES[0]),
                                          Mock(scalar_one=lambda: True)]
        with self.assertRaises(runner.Refused):
            runner.inspect_empty(fake_sa, engine, runner.DATABASES[0])
        queries = [call.args[0] for call in connection.execute.call_args_list]
        self.assertEqual(queries[0], "SET TRANSACTION READ ONLY")
        self.assertIn("pg_catalog.pg_class", queries[2])
        self.assertIn("pg_catalog.pg_namespace", queries[2])
        self.assertNotIn("n.nspname = 'public'", queries[2])
        self.assertNotIn("relkind", queries[2])

    def test_connected_database_identity_must_match(self):
        fake_sa = Mock()
        engine = MagicMock()
        connection = engine.connect.return_value.__enter__.return_value
        connection.execute.side_effect = [Mock(), Mock(scalar_one=lambda: "wrong_database")]
        with self.assertRaises(runner.Refused):
            runner.inspect_empty(fake_sa, engine, runner.DATABASES[0])
        self.assertEqual(connection.execute.call_count, 2)

    def test_missing_driver_is_blocked_without_engine_or_writes(self):
        with patch.dict(os.environ, configured(), clear=True), \
                patch.object(runner, "load_database_tools", side_effect=runner.Blocked("driver unavailable")), \
                patch.object(runner, "preflight") as preflight, \
                patch.object(runner, "exercise") as writes, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runner.worker(), 3)
            preflight.assert_not_called()
            writes.assert_not_called()

    def test_unavailable_server_is_blocked_without_writes(self):
        fake_sa = Mock()
        fake_sa.exc.OperationalError = ConnectionError
        with patch.dict(os.environ, configured(), clear=True), \
                patch.object(runner, "load_database_tools", return_value=fake_sa), \
                patch.object(runner, "engine_url", return_value=Mock()), \
                patch.object(runner, "inspect_empty", side_effect=ConnectionError()), \
                patch.object(runner, "exercise") as writes, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runner.worker(), 3)
            writes.assert_not_called()

    def test_captured_outputs_and_timeout_redact_credentials(self):
        urls = tuple(configured()[key].replace("test_password", "p%40ss%27word") for key in runner.URL_KEYS)
        raw = urls[0] + " p%40ss%27word p@ss'word test_user"
        for result in (subprocess.CompletedProcess([], 1, raw, raw), subprocess.TimeoutExpired([], 1, raw, raw)):
            with self.subTest(result=type(result).__name__), \
                    patch.object(runner.subprocess, "run", side_effect=result if isinstance(result, Exception) else None,
                                 return_value=result), contextlib.redirect_stdout(io.StringIO()) as output:
                try:
                    runner.captured_run([sys.executable], {}, urls)
                except RuntimeError:
                    pass
            for secret in (urls[0], "p%40ss%27word", "p@ss'word", "test_user"):
                self.assertNotIn(secret, output.getvalue())

    def test_flask_bootstrap_disables_dotenv_and_uses_only_validated_adapter(self):
        env = configured()
        urls = runner.validate_targets(env)
        with patch.dict(os.environ, {"DATABASE_URL": "production"}, clear=True), \
                patch.object(runner, "captured_run", return_value=0) as run:
            runner.flask_command(urls[0], urls, "db", "upgrade", "head")
        command, child_env, _ = run.call_args.args
        self.assertIn("-I", command)
        self.assertEqual(command[command.index("-X") + 1], "utf8")
        self.assertIn("dotenv.load_dotenv=lambda *a,**k:False", command[command.index("-c") + 1])
        self.assertNotIn(urls[0], command)
        self.assertEqual(child_env["DATABASE_URL"], urls[0])


if __name__ == "__main__":
    unittest.main()
