"""Pure coordinator/CI safety tests. No DB, driver, Docker, app or network use.

Run: python -I -B tests/backend/test_release_runner_safety.py -v
All execution/preflight tests substitute subprocesses and database tools. Schema
preservation and real client/runtime acceptance remain separate executed gates.
"""
import builtins
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, Mock, patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("release_runner", ROOT / "scripts/verify_release.py")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


def configured():
    return {**runner.CONFIRMATIONS, **{
        key: f"postgresql://synthetic_user:synthetic_password@localhost:55432/{name}"
        for key, name in zip(runner.URL_KEYS, runner.DATABASES)}}


class ReleaseRunnerSafetyTest(unittest.TestCase):
    def refused(self, env, args=None):
        with patch.object(runner.subprocess, "run") as process, \
                patch.object(runner, "preflight") as preflight, \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(runner.main(env, args or ["--run"]), 2)
            process.assert_not_called()
            preflight.assert_not_called()
        self.assertNotIn("synthetic_password", output.getvalue())
        return output.getvalue()

    def test_exact_five_targets_accepted(self):
        env = configured()
        self.assertEqual(runner.validate_targets(env), tuple(env[key] for key in runner.URL_KEYS))

    def test_existing_guards_accept_encoded_credentials(self):
        env = configured()
        for key in runner.URL_KEYS:
            env[key] = env[key].replace("postgresql://", "postgresql+psycopg2://").replace("synthetic_password", "p%40ss%3Aword")
        self.assertEqual(len(runner.validate_targets(env)), 5)

    def test_every_confirmation_required_exactly_before_io(self):
        for key in runner.CONFIRMATIONS:
            for value in (None, "", "yes", runner.CONFIRMATIONS[key] + " "):
                with self.subTest(key=key, value=value):
                    self.refused({**configured(), key: value})

    def test_every_target_required_no_generic_database_fallback(self):
        for key in runner.URL_KEYS:
            env = configured()
            env["DATABASE_URL"] = env.pop(key)
            self.refused(env)
            for value in (None, 12, {}, []):
                self.refused({**configured(), key: value})

    def test_each_target_rejects_unsafe_host_port_name_or_syntax(self):
        for key, database in zip(runner.URL_KEYS, runner.DATABASES):
            base = configured()[key]
            invalid = [base.replace("localhost", host) for host in (
                "127.0.0.1", "LOCALHOST", "localhost.", "[::1]", "remote.example", "localhost,remote", "%6cocalhost")]
            invalid += [base.replace("55432", port) for port in ("5432", "55433", "055432", "0")]
            invalid += [base.replace(database, name) for name in ("postgres", "cookbook_dev", database + "_copy", "%63" + database[1:])]
            invalid += [base + tail for tail in ("?", "#", "/", "\n", "?host=remote", "?options=unsafe", "#fragment")]
            invalid += [" " + base, base.replace("postgresql", "sqlite"), base.replace("postgresql", "postgresql+asyncpg")]
            invalid += [base.replace("synthetic_password", password) for password in ("", "p%00", "p%0A", "p%FF", "p%xx", "a@remote/x")]
            for value in invalid:
                with self.subTest(key=key, value=value):
                    self.refused({**configured(), key: value})

    def test_swapped_duplicate_targets_and_different_principal_refused(self):
        env = configured()
        for key in runner.URL_KEYS[1:]:
            self.refused({**env, key: env[runner.URL_KEYS[0]]})
            self.refused({**env, key: env[key].replace("synthetic_user", "different")})

    def test_resume_inputs_refused_even_empty_or_previously_valid(self):
        for key in ("COOKBOOK_TEST_RESTORE_RESUME", "COOKBOOK_TEST_X1B_SCHEMA_SHA256"):
            for value in ("", "verified-pristine-clone", "a" * 64):
                self.refused({**configured(), key: value})

    def test_cli_defaults_and_overrides_never_dispatch_or_echo_input(self):
        for args in ([], ["--reset"], ["--resume-empty-x1b"], ["--skip-restore"],
                     ["--run", "--check-guards"], ["--run", "--run"],
                     ["--target", configured()[runner.URL_KEYS[0]]], ["--worker"]):
            with patch.object(runner.subprocess, "run") as process, contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(runner.main(configured(), args), 2)
                process.assert_not_called()
                self.assertNotIn("synthetic_password", output.getvalue())

    def test_import_and_pure_guard_never_load_application_or_driver(self):
        original = builtins.__import__

        def forbid(name, *args, **kwargs):
            if name.split(".")[0] in {"app", "models", "dotenv", "sqlalchemy", "psycopg2", "flask", "flask_migrate", "alembic"}:
                raise AssertionError("Invasive import: " + name)
            return original(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=forbid), patch.object(runner.subprocess, "run") as process:
            fresh_module = importlib.util.module_from_spec(SPEC)
            SPEC.loader.exec_module(fresh_module)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(fresh_module.main(configured(), ["--check-guards"]), 0)
            process.assert_not_called()

    def test_pure_guard_does_not_claim_emptiness(self):
        with patch.object(runner, "preflight") as preflight, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(runner.main(configured(), ["--check-guards"]), 0)
            preflight.assert_not_called()
        self.assertIn("no connection/emptiness/runtime evidence", output.getvalue())

    def test_helper_allowlist(self):
        with self.assertRaises(runner.Refused):
            runner.helper("app")

    def test_sanitized_environment_drops_production_and_resume_configuration(self):
        env = {**configured(), "PATH": "runtime-path", "SystemRoot": "windows-root",
               "DATABASE_URL": "production", "PGHOST": "remote", "PGHOSTADDR": "remote",
               "PGSERVICEFILE": "private", "PGPASSFILE": "private", "PGOPTIONS": "unsafe",
               "HOME": "private-home", "PYTHONPATH": "injection", "PYTHONSTARTUP": "injection",
               "LD_PRELOAD": "injection", "JWT_SECRET_KEY": "production-secret", "FLASK_APP": "other",
               "COOKBOOK_TEST_RESTORE_RESUME": "verified-pristine-clone", "COOKBOOK_TEST_X1B_SCHEMA_SHA256": "a" * 64}
        clean = runner.isolated_env(env, runner.validate_targets(configured()))
        self.assertEqual(clean["PATH"], "runtime-path")
        self.assertEqual(clean["SystemRoot"], "windows-root")
        for key in set(env) - set(runner.URL_KEYS) - set(runner.CONFIRMATIONS) - {"PATH", "SystemRoot"}:
            self.assertNotIn(key, clean)
        self.assertEqual(clean["FLASK_SKIP_DOTENV"], "1")

    def test_children_receive_only_their_allowed_targets_and_confirmations(self):
        env = configured()
        urls = runner.validate_targets(env)
        expected = ((0, 1), (0, 1), (0,), (0, 2, 3), (4,))
        for stage, indexes in zip(runner.STAGES, expected):
            clean = runner.stage_env(env, urls, stage)
            self.assertEqual({key for key in clean if key.endswith("_URL")}, {runner.URL_KEYS[index] for index in indexes})
            self.assertNotIn(runner.CONFIRM_KEY, clean)
            if stage[1] == "verify_planning_restore.py":
                self.assertEqual(runner.helper("verify_planning_restore").validate_targets(clean), tuple(urls[i] for i in indexes))
            if stage[1] in ("verify_postgres.py", "planning_repeat_postgres_checks.py"):
                self.assertEqual(runner.helper("verify_postgres").validate_targets(clean), urls[:2])

    def test_outer_worker_uses_isolated_python_without_urls_in_argv(self):
        with patch.object(runner.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")) as process, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runner.main(configured(), ["--run"]), 0)
        args, kwargs = process.call_args
        self.assertEqual(args[0][:5], [sys.executable, "-I", "-B", "-X", "utf8"])
        self.assertFalse(any("postgresql" in arg or "synthetic_password" in arg for arg in args[0]))
        self.assertEqual(kwargs["cwd"], ROOT)
        self.assertNotIn("shell", kwargs)
        self.assertEqual(kwargs["timeout"], 3900)
        self.assertGreater(kwargs["timeout"], sum(stage[3] for stage in runner.STAGES))

    def test_child_output_is_not_forwarded_even_on_success(self):
        for code in (0, 1, 2, 3, -9):
            result = SimpleNamespace(returncode=code, stdout="synthetic_password\nSELECT private;\nPASS: repeat\n", stderr="production SQL secret")
            with patch.object(runner.subprocess, "run", return_value=result), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(runner.main(configured(), ["--run"]), code if code >= 0 else 1)
            self.assertNotIn("synthetic_password", output.getvalue())
            self.assertNotIn("SELECT", output.getvalue())
            self.assertNotIn("production SQL", output.getvalue())
            self.assertIn("PASS: repeat", output.getvalue())

    def test_outer_timeout_and_oserror_are_sanitized_no_retry(self):
        errors = (OSError("synthetic_password"), subprocess.TimeoutExpired("private SQL", 1, output=b"secret", stderr=b"synthetic_password"))
        for error in errors:
            with patch.object(runner.subprocess, "run", side_effect=error) as process, contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(runner.main(configured(), ["--run"]), 1)
            self.assertEqual(process.call_count, 1)
            self.assertNotIn("synthetic_password", output.getvalue())
            self.assertIn("verify child termination", output.getvalue())

    def test_worker_revalidates_before_preflight_or_stage(self):
        with patch.dict(os.environ, {"DATABASE_URL": "production"}, clear=True), \
                patch.object(runner, "preflight") as preflight, patch.object(runner, "run_stage") as stage, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runner.worker(), 2)
            preflight.assert_not_called()
            stage.assert_not_called()

    def test_serial_order_after_complete_preflight(self):
        calls = []
        def before(env, urls):
            self.assertNotIn("DATABASE_URL", os.environ)
            calls.append("preflight")
        def stage(env, urls, value):
            calls.append(value[0])
            return 0
        with patch.dict(os.environ, {**configured(), "DATABASE_URL": "production"}, clear=True), \
                patch.object(runner, "preflight", side_effect=before), patch.object(runner, "run_stage", side_effect=stage), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runner.worker(), 0)
        self.assertEqual(calls, ["preflight", *(stage[0] for stage in runner.STAGES)])

    def test_any_preflight_failure_stops_before_all_writes(self):
        for error in (runner.Refused("occupied"), RuntimeError("driver/private SQL"), OSError("clients missing")):
            with patch.dict(os.environ, configured(), clear=True), patch.object(runner, "preflight", side_effect=error), \
                    patch.object(runner, "run_stage") as stage, contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertNotEqual(runner.worker(), 0)
                stage.assert_not_called()
            self.assertNotIn("driver/private SQL", output.getvalue())

    def test_stage_failure_or_timeout_never_runs_successors_or_retries(self):
        for index in range(len(runner.STAGES)):
            for failure in (1, 2, 3, subprocess.TimeoutExpired("secret", 1)):
                with patch.dict(os.environ, configured(), clear=True), patch.object(runner, "preflight"), \
                        patch.object(runner, "run_stage", side_effect=[0] * index + [failure]) as stage, contextlib.redirect_stdout(io.StringIO()):
                    self.assertNotEqual(runner.worker(), 0)
                    self.assertEqual(stage.call_count, index + 1)

    def test_runtime_checked_and_all_five_strict_empty_guards_run(self):
        base, restore = Mock(), Mock()
        engines = [Mock() for _ in runner.DATABASES]
        sa = base.load_database_tools.return_value
        sa.create_engine.side_effect = engines
        calls = []
        restore.discover_runtime.side_effect = lambda env: calls.append("clients")
        restore.inspect_empty.side_effect = lambda sa, engine, name: calls.append(name)
        with patch.object(runner, "helper", side_effect=[base, restore]):
            runner.preflight({}, tuple("url" + str(i) for i in range(5)))
        self.assertEqual(calls, ["clients", *runner.DATABASES])
        for engine in engines:
            engine.dispose.assert_called_once_with()
        self.assertEqual(base.engine_url.call_count, 5)
        restore.create_missing.assert_not_called()

    def test_occupied_target_disposes_all_engines_and_never_creates(self):
        for index in range(5):
            base, restore = Mock(), Mock()
            engines = [Mock() for _ in range(5)]
            base.load_database_tools.return_value.create_engine.side_effect = engines
            restore.inspect_empty.side_effect = [None] * index + [runner.Refused("occupied")]
            with patch.object(runner, "helper", side_effect=[base, restore]), self.assertRaises(runner.Refused):
                runner.preflight({}, tuple("url" + str(i) for i in range(5)))
            self.assertEqual(restore.inspect_empty.call_count, index + 1)
            restore.create_missing.assert_not_called()
            for engine in engines:
                engine.dispose.assert_called_once_with()

    def test_missing_clients_prevent_database_driver_load(self):
        base, restore = Mock(), Mock()
        restore.discover_runtime.side_effect = runner.Refused("missing runtime")
        with patch.object(runner, "helper", side_effect=[base, restore]), self.assertRaises(runner.Refused):
            runner.preflight({}, ())
        base.load_database_tools.assert_not_called()

    def test_stage_commands_are_exact_and_child_logs_remain_private(self):
        env = configured()
        urls = runner.validate_targets(env)
        for stage in runner.STAGES:
            with patch.object(runner.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="private SQL", stderr="synthetic_password")) as process, contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(runner.run_stage(env, urls, stage), 0)
            args, kwargs = process.call_args
            self.assertEqual(args[0], [sys.executable, "-I", "-B", "-X", "utf8", str(ROOT / "scripts" / stage[1]), *stage[2]])
            self.assertEqual(kwargs["timeout"], stage[3])
            self.assertNotIn("shell", kwargs)
            self.assertNotIn("private SQL", output.getvalue())
            self.assertNotIn("synthetic_password", output.getvalue())

    def test_existing_restore_guard_enforces_server_identity_and_read_only_empty_check(self):
        restore = runner.helper("verify_planning_restore")
        sa, engine = Mock(), MagicMock()
        connection = engine.connect.return_value.__enter__.return_value
        connection.execute.return_value.one.return_value = (runner.DATABASES[4], "127.0.0.1", 55432, 160015)
        connection.execute.return_value.scalar_one.return_value = False
        sa.text.side_effect = lambda sql: sql
        restore.inspect_empty(sa, engine, runner.DATABASES[4])
        self.assertEqual(connection.execute.call_args_list[0].args, ("SET TRANSACTION READ ONLY",))
        for identity in ((runner.DATABASES[4], "172.17.0.2", 55432, 160015), (runner.DATABASES[4], "127.0.0.1", 5432, 160015),
                         (runner.DATABASES[4], "127.0.0.1", 55432, 150000), ("cookbook_dev", "127.0.0.1", 55432, 160015)):
            connection.execute.return_value.one.return_value = identity
            with self.assertRaises(restore.Refused):
                restore.inspect_empty(sa, engine, runner.DATABASES[4])
        connection.execute.return_value.one.return_value = (runner.DATABASES[4], "127.0.0.1", 55432, 160015)
        connection.execute.return_value.scalar_one.return_value = True
        with self.assertRaises(restore.Refused):
            restore.inspect_empty(sa, engine, runner.DATABASES[4])

    def test_ci_contract_uses_new_loopback_cluster_and_all_five_targets(self):
        source = (ROOT / ".github/workflows/verify.yml").read_text(encoding="utf-8")
        self.assertIn("runs-on: ubuntu-24.04", source)
        self.assertIn("docker run --detach --network host", source)
        self.assertIn("postgres:16.15-bookworm postgres -h 127.0.0.1 -p 55432", source)
        self.assertIn("--tmpfs /var/lib/postgresql/data", source)
        self.assertNotIn("55432:5432", source)
        self.assertNotIn("--volume", source)
        self.assertNotIn("dropdb", source)
        self.assertIn("--template=template0", source)
        self.assertIn('[[ "$POSTGRES_CONTAINER" =~ ^[0-9a-f]{64}$ ]]', source)
        self.assertIn('index .Config.Labels "cookbook.verification"', source)
        for key, value in runner.CONFIRMATIONS.items():
            self.assertIn(key + ": " + value, source)
        for key, database in zip(runner.URL_KEYS, runner.DATABASES):
            self.assertIn(key + ": postgresql://cookbook_ci:disposable_ci_only@localhost:55432/" + database, source)
        self.assertIn("python -I -B scripts/verify_release.py --check-guards", source)
        self.assertIn("python -I -B scripts/verify_release.py --run", source)
        self.assertNotIn("--resume", source)
        self.assertIn(".local/postgres-runtime/pgsql/bin/pg_dump", source)
        self.assertIn(".local/postgres-runtime/pgsql/bin/pg_restore", source)
        self.assertIn("contents: read", source)
        self.assertIn("persist-credentials: false", source)


if __name__ == "__main__":
    unittest.main()
