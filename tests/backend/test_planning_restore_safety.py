"""Offline standard-library guard tests. No app, database driver or service writes."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("restore_runner", ROOT / "scripts/verify_planning_restore.py")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


def configured():
    return {runner.CONFIRM_KEY: runner.CONFIRM_VALUE, **{
        key: f"postgresql://synthetic_user:synthetic_password@localhost:55432/{name}"
        for key, name in zip(runner.URL_KEYS, runner.DATABASES)}}


class RestoreSafetyTest(unittest.TestCase):
    def refused(self, env):
        with patch.object(runner, "run_process") as process, patch.object(runner, "load_database_tools") as load, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(runner.main(env), 2)
            process.assert_not_called()
            load.assert_not_called()
            self.assertNotIn("synthetic_password", output.getvalue())

    def test_exact_fixed_targets_and_encoded_credentials(self):
        env = configured()
        self.assertEqual(runner.validate_targets(env), tuple(env[key] for key in runner.URL_KEYS))
        env[runner.URL_KEYS[0]] = env[runner.URL_KEYS[0]].replace("synthetic_password", "p%40ss%3Aword")
        self.assertEqual(len(runner.validate_targets(env)), 3)

    def test_confirmation_and_each_target_required_before_io(self):
        for key in (runner.CONFIRM_KEY, *runner.URL_KEYS):
            env = configured()
            env.pop(key)
            self.refused(env)
        for confirmation in ("yes", "", runner.CONFIRM_VALUE + " "):
            self.refused({**configured(), runner.CONFIRM_KEY: confirmation})
        self.refused({**configured(), runner.RESUME_KEY: "yes"})

    def test_constraint_cast_normalization_is_narrow_and_preserves_literals(self):
        old = "CHECK (((kind)::text = ANY ((ARRAY['dish'::character varying, 'note'::character varying])::text[])))"
        new = "CHECK (((kind)::text = ANY (ARRAY[('dish'::character varying)::text, ('note'::character varying)::text])))"
        self.assertEqual(runner.canonical_constraint(old), new)
        self.assertEqual(runner.canonical_constraint(new), new)
        self.assertNotEqual(runner.canonical_constraint(old.replace("note", "other")), new)
        for value in ("CHECK (servings IS NOT NULL)", "CHECK (quantity > 0)", "FOREIGN KEY (meal_id) REFERENCES private_meals(id)"):
            self.assertEqual(runner.canonical_constraint(value), value)

    def test_resume_is_explicit_and_does_not_skip_final_target_emptiness(self):
        sa, engines = Mock(), [MagicMock() for _ in range(3)]
        connection = engines[0].connect.return_value.__enter__.return_value
        connection.execute.return_value.scalars.return_value = list(runner.DATABASES)
        connection.execute.return_value.all.return_value = [("private-planning-1@example.test", "synthetic-not-a-login")]
        connection.execute.return_value.scalar_one.side_effect = [1, 3]
        with patch.dict(os.environ, {runner.RESUME_KEY: runner.RESUME_VALUE}, clear=True), patch.object(runner, "identity"), patch.object(runner, "inspect_empty") as empty:
            self.assertEqual(runner.preflight(sa, engines), [])
        self.assertEqual([call.args[2] for call in empty.call_args_list], [runner.DATABASES[2]])

    def test_unsafe_or_ambiguous_urls_refused_in_every_slot(self):
        for key in runner.URL_KEYS:
            base = configured()[key]
            replacements = [("localhost", host) for host in ("127.0.0.1", "LOCALHOST", "localhost.evil", "remote", "[::1]", "%6cocalhost")]
            replacements += [("55432", port) for port in ("55433", "5432", "055432")]
            replacements += [(base.split("/")[-1], name) for name in ("postgres", "cookbook_dev", "cookbook_test_history")]
            replacements += [("synthetic_password", value) for value in ("", "p%00", "p%0A", "p%FF", "p%xx")]
            values = [base.replace(old, new) for old, new in replacements]
            values += [base + suffix for suffix in ("?host=remote", "?", "#", "\n", "/")]
            values += [" " + base, None, base.replace("postgresql", "sqlite")]
            for value in values:
                with self.subTest(key=key, value=value):
                    self.refused({**configured(), key: value})

    def test_swapped_or_same_targets_refused(self):
        env = configured()
        env[runner.URL_KEYS[2]] = env[runner.URL_KEYS[1]]
        self.refused(env)
        env = configured()
        env[runner.URL_KEYS[0]], env[runner.URL_KEYS[1]] = env[runner.URL_KEYS[1]], env[runner.URL_KEYS[0]]
        self.refused(env)

    def test_environment_removes_external_overrides(self):
        env = {**configured(), "DATABASE_URL": "production", "PGHOST": "remote", "PGHOSTADDR": "8.8.8.8", "PGSERVICE": "production",
               "PGPASSFILE": "private", "PGOPTIONS": "unsafe", "PYTHONPATH": "outside", "JWT_SECRET_KEY": "real-secret",
               "SMTP_PASSWORD": "private", "PATH": "runtime-path", "PYTHONOPTIMIZE": "1"}
        urls = runner.validate_targets(env)
        clean = runner.isolated_env(env, urls)
        for key in ("DATABASE_URL", "PGHOST", "PGHOSTADDR", "PGSERVICE", "PGPASSFILE", "PGOPTIONS", "PYTHONPATH", "SMTP_PASSWORD", "PYTHONOPTIMIZE"):
            self.assertNotIn(key, clean)
        self.assertNotEqual(clean["JWT_SECRET_KEY"], env["JWT_SECRET_KEY"])
        pg = runner.pg_env(env, urls, urls[0], readonly=True)
        self.assertEqual(pg["PGHOSTADDR"], "127.0.0.1")
        self.assertEqual(pg["PGPORT"], "55432")
        self.assertEqual(pg["PGPASSFILE"], os.devnull)
        self.assertIn("default_transaction_read_only=on", pg["PGOPTIONS"])
        self.assertNotIn("PGSERVICE", pg)
        with self.assertRaises(runner.Refused):
            runner.pg_env(env, urls, "postgresql://production")

    def test_worker_revalidates_before_runtime_or_driver(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(runner, "discover_runtime") as runtime, patch.object(runner, "load_database_tools") as load:
            with self.assertRaises(runner.Refused):
                runner.worker()
            runtime.assert_not_called()
            load.assert_not_called()

    def test_database_creation_never_targets_fresh_or_arbitrary_names(self):
        for name in (runner.DATABASES[0], "cookbook_dev", "postgres", 'x"; DROP DATABASE y'):
            source = MagicMock()
            with self.assertRaises(runner.Refused):
                runner.create_missing(Mock(), source, [name])
            source.connect.assert_not_called()

    def test_creation_uses_only_new_allowlisted_databases_no_reset(self):
        sa, source = Mock(), MagicMock()
        sa.text.side_effect = lambda sql: sql
        connection = source.connect.return_value.execution_options.return_value.__enter__.return_value
        with patch.object(runner, "identity"), contextlib.redirect_stdout(io.StringIO()):
            runner.create_missing(sa, source, runner.DATABASES[1:])
        statements = [c.args[0] for c in connection.execute.call_args_list]
        self.assertEqual(statements, [f'CREATE DATABASE "{name}" TEMPLATE template0' for name in runner.DATABASES[1:]])

    def test_preflight_checks_both_existing_targets_before_creation(self):
        sa, engines = Mock(), [MagicMock() for _ in range(3)]
        connection = engines[0].connect.return_value.__enter__.return_value
        connection.execute.return_value.scalars.return_value = list(runner.DATABASES)
        connection.execute.return_value.all.return_value = [("private-planning-1@example.test", "synthetic-not-a-login")]
        connection.execute.return_value.scalar_one.side_effect = [1, 3]
        with patch.object(runner, "identity"), patch.object(runner, "inspect_empty") as empty:
            self.assertEqual(runner.preflight(sa, engines), [])
        self.assertEqual([call.args[2] for call in empty.call_args_list], list(runner.DATABASES[1:]))

    def test_nonempty_target_stops_before_database_creation_or_app_import(self):
        sa, build_url = Mock(), Mock()
        engines = [Mock(), Mock(), Mock()]
        sa.create_engine.side_effect = engines
        with patch.dict(os.environ, configured(), clear=True), patch.object(runner, "discover_runtime"), \
                patch.object(runner, "load_database_tools", return_value=(sa, build_url)), \
                patch.object(runner, "preflight", side_effect=runner.Refused("nonempty")), \
                patch.object(runner, "create_missing") as create, patch.object(runner, "load_app") as app, \
                patch.object(runner, "archive_roundtrip") as archive:
            with self.assertRaises(runner.Refused):
                runner.worker()
            create.assert_not_called()
            app.assert_not_called()
            archive.assert_not_called()
        for engine in engines:
            engine.dispose.assert_called_once()

    def test_database_identity_rejects_wrong_name_port_host_or_major(self):
        good = (runner.DATABASES[0], "127.0.0.1", 55432, 160015)
        connection = Mock()
        for index, value in enumerate(("cookbook_dev", "10.0.0.1", 55433, 170000)):
            row = list(good)
            row[index] = value
            connection.execute.return_value.one.return_value = row
            with self.assertRaises(runner.Refused):
                runner.identity(Mock(), connection, runner.DATABASES[0])

    def test_empty_check_is_read_only_and_refuses_any_occupied_state(self):
        sa, engine = Mock(), MagicMock()
        sa.text.side_effect = lambda sql: sql
        connection = engine.connect.return_value.__enter__.return_value
        connection.execute.return_value.scalar_one.return_value = True
        with patch.object(runner, "identity"), self.assertRaises(runner.Refused):
            runner.inspect_empty(sa, engine, runner.DATABASES[2])
        sql = [call.args[0] for call in connection.execute.call_args_list]
        self.assertEqual(sql[0], "SET TRANSACTION READ ONLY")
        for catalog in ("pg_class", "pg_proc", "pg_namespace", "pg_type"):
            self.assertIn(catalog, sql[1])

    def test_archive_direction_and_immediate_empty_barrier(self):
        urls = runner.validate_targets(configured())
        binaries = {"pg_dump": Path("pg_dump.exe"), "pg_restore": Path("pg_restore.exe")}
        events = []
        with patch.object(runner, "snapshot", return_value={"rows": {}}), \
                patch.object(runner, "inspect_empty", side_effect=lambda *args: events.append("empty")), \
                patch.object(runner, "run_process", side_effect=lambda cmd, env, **kw: events.append((cmd, env))):
            runner.archive_roundtrip(Mock(), [Mock()] * 3, urls, binaries, 0, 1, Path("test.dump"))
        self.assertEqual(events[1], "empty")
        dump, restore = events[0], events[2]
        self.assertIn("default_transaction_read_only=on", dump[1]["PGOPTIONS"])
        self.assertIn("--single-transaction", restore[0])
        self.assertIn("--exit-on-error", restore[0])
        for forbidden in ("--clean", "--create", "--if-exists"):
            self.assertNotIn(forbidden, restore[0])
        self.assertNotIn("synthetic_password", " ".join(restore[0]))
        with patch.object(runner, "snapshot") as read, self.assertRaises(runner.Refused):
            runner.archive_roundtrip(Mock(), [], urls, binaries, 1, 0, Path("test.dump"))
        read.assert_not_called()

    def test_source_change_during_dump_prevents_restore(self):
        urls = runner.validate_targets(configured())
        with patch.object(runner, "snapshot", side_effect=[{"rows": 1}, {"rows": 2}]), \
                patch.object(runner, "run_process") as process, patch.object(runner, "inspect_empty") as empty:
            with self.assertRaises(runner.Refused):
                runner.archive_roundtrip(Mock(), [Mock()] * 3, urls, {"pg_dump": Path("dump")}, 0, 1, Path("test.dump"))
            self.assertEqual(process.call_count, 1)
            empty.assert_not_called()

    def test_app_loader_refuses_original_source_before_import(self):
        urls = runner.validate_targets(configured())
        with self.assertRaises(runner.Refused):
            runner.load_app(Mock(), Mock(), urls[0], urls)

    def test_compare_detects_each_recovery_critical_difference(self):
        before = {"rows": {"planning_mutations": ["receipt"], "planning_catalog_entries": ["digest"], "planning_undo": ["expiry"]}, "sequences": {"users_id_seq": (4, True)}}
        import copy
        for table in before["rows"]:
            after = copy.deepcopy(before)
            after["rows"][table] = ["changed"]
            with self.assertRaises(runner.Refused):
                runner.same_snapshot(before, after, "test")
        after = copy.deepcopy(before)
        after["sequences"]["users_id_seq"] = (4, False)
        with self.assertRaises(runner.Refused):
            runner.same_snapshot(before, after, "test")

    def test_subprocess_failure_and_timeout_never_echo_private_data(self):
        for result in (subprocess.CompletedProcess([], 1, "private-row", "synthetic_password"), subprocess.TimeoutExpired([], 1, "private-row")):
            kwargs = {"side_effect": result} if isinstance(result, Exception) else {"return_value": result}
            with patch.object(runner.subprocess, "run", **kwargs), contextlib.redirect_stdout(io.StringIO()) as output:
                with self.assertRaises(runner.Refused) as caught:
                    runner.run_process(["pg_dump"], {}, stage="pg_dump")
                self.assertNotIn("private-row", str(caught.exception) + output.getvalue())
                self.assertNotIn("synthetic_password", str(caught.exception) + output.getvalue())


if __name__ == "__main__":
    unittest.main()
