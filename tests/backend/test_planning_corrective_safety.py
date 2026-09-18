"""Pure standard-library checks: no driver, application, or database connection."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("corrective_runner", ROOT / "scripts/verify_planning_corrective.py")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


def configured():
    return {runner.CONFIRM_KEY: runner.CONFIRM_VALUE, **{
        key: f"postgresql://synthetic_user:synthetic_password@localhost:55432/{name}"
        for key, name in zip(runner.URL_KEYS, runner.DATABASES)}}


class CorrectiveSafetyTest(unittest.TestCase):
    def refused_without_io(self, env):
        with patch.object(runner.subprocess, "run") as process, patch.object(runner, "load_tools") as load, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(runner.main(env), 2)
            process.assert_not_called()
            load.assert_not_called()
            self.assertNotIn("synthetic_password", output.getvalue())

    def test_exact_triple_and_encoded_credentials(self):
        env = configured()
        self.assertEqual(runner.validate_targets(env), tuple(env[key] for key in runner.URL_KEYS))
        env[runner.URL_KEYS[0]] = env[runner.URL_KEYS[0]].replace("postgresql://synthetic_user:synthetic_password", "postgresql+psycopg2://synthetic_user:p%40ss%3Aword")
        self.assertEqual(len(runner.validate_targets(env)), 3)

    def test_confirmation_and_each_target_required_before_io(self):
        for key in (runner.CONFIRM_KEY, *runner.URL_KEYS):
            env = configured()
            env.pop(key)
            self.refused_without_io(env)
        for value in ("yes", "", None, runner.CONFIRM_VALUE + " "):
            self.refused_without_io({**configured(), runner.CONFIRM_KEY: value})

    def test_unsafe_or_ambiguous_targets_refused_in_every_slot(self):
        for key in runner.URL_KEYS:
            base = configured()[key]
            replacements = [("localhost", host) for host in ("127.0.0.1", "LOCALHOST", "localhost.evil", "remote", "[::1]", "%6cocalhost")]
            replacements += [("55432", port) for port in ("55433", "5432", "055432")]
            replacements += [(base.split("/")[-1], name) for name in ("postgres", "cookbook_dev", "cookbook_test_fresh", "cookbook_test_history", "cookbook_test_restored", "cookbook_test_recovery_source")]
            replacements += [("synthetic_password", value) for value in ("", "p%00", "p%0A", "p%FF", "p%xx")]
            values = [base.replace(old, new) for old, new in replacements]
            values += [base + suffix for suffix in ("?host=remote", "?", "#", "\n", "/")]
            values += [" " + base, None, base.replace("postgresql", "sqlite")]
            for value in values:
                with self.subTest(key=key, value=value):
                    self.refused_without_io({**configured(), key: value})

    def test_swapped_and_duplicate_targets_refused(self):
        env = configured()
        env[runner.URL_KEYS[1]] = env[runner.URL_KEYS[0]]
        self.refused_without_io(env)
        env = configured()
        env[runner.URL_KEYS[0]], env[runner.URL_KEYS[2]] = env[runner.URL_KEYS[2]], env[runner.URL_KEYS[0]]
        self.refused_without_io(env)

    def test_environment_cannot_inherit_other_databases_or_secrets(self):
        env = {**configured(), "COOKBOOK_TEST_DATABASE_URL": "fresh", "COOKBOOK_TEST_RECOVERY_SOURCE_URL": "restore",
               "DATABASE_URL": "dev", "PGHOST": "remote", "PGHOSTADDR": "8.8.8.8", "PGSERVICE": "production",
               "PGPASSFILE": "private", "PGOPTIONS": "unsafe", "PYTHONPATH": "outside", "JWT_SECRET_KEY": "real-secret",
               "SMTP_PASSWORD": "private", "PATH": "runtime-path", "PYTHONOPTIMIZE": "1"}
        clean = runner.isolated_env(env, runner.validate_targets(env))
        for key in ("COOKBOOK_TEST_DATABASE_URL", "COOKBOOK_TEST_RECOVERY_SOURCE_URL", "DATABASE_URL", "PGHOST", "PGHOSTADDR", "PGSERVICE", "PGPASSFILE", "PGOPTIONS", "PYTHONPATH", "SMTP_PASSWORD", "PYTHONOPTIMIZE"):
            self.assertNotIn(key, clean)
        self.assertNotEqual(clean["JWT_SECRET_KEY"], "real-secret")
        self.assertEqual(clean["FLASK_SKIP_DOTENV"], "1")
        self.assertEqual(clean["PATH"], "runtime-path")

    def test_worker_revalidates_before_driver_or_application(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(runner, "load_tools") as load:
            with self.assertRaises(runner.Refused):
                runner.worker()
            load.assert_not_called()

    def test_preflight_refuses_any_existing_target_even_if_empty(self):
        sa, admin = Mock(), MagicMock()
        sa.text.side_effect = lambda value: value
        connection = admin.connect.return_value.__enter__.return_value
        for name in runner.DATABASES:
            connection.execute.return_value.scalars.return_value = ["postgres", name]
            with patch.object(runner, "identity"), self.assertRaises(runner.Refused):
                runner.preflight(sa, admin)
        self.assertEqual(connection.execute.call_args_list[0].args[0], "SET TRANSACTION READ ONLY")
        connection.execute.return_value.scalars.return_value = ["postgres", "cookbook_test_fresh"]
        with patch.object(runner, "identity"):
            runner.preflight(sa, admin)

    def test_preflight_failure_precedes_creation_migration_and_seed(self):
        sa, build_url, snapshot = Mock(), Mock(), Mock()
        admin = Mock()
        sa.create_engine.return_value = admin
        with patch.dict(os.environ, configured(), clear=True), patch.object(runner, "load_tools", return_value=(sa, build_url, snapshot)), \
                patch.object(runner, "preflight", side_effect=runner.Refused("exists")), patch.object(runner, "create_targets") as create, \
                patch.object(runner, "migrate") as migrate, patch.object(runner, "seed_da64") as seed:
            with self.assertRaises(runner.Refused):
                runner.worker()
            create.assert_not_called()
            migrate.assert_not_called()
            seed.assert_not_called()
            snapshot.assert_not_called()
        admin.dispose.assert_called_once()
        build_url.return_value.set.assert_called_once_with(database="postgres")

    def test_creation_requires_complete_fixed_triple(self):
        for names in (("postgres",), ("cookbook_test_fresh",), runner.DATABASES[:2], tuple(reversed(runner.DATABASES)), ("cookbook_dev",)):
            admin = Mock()
            with self.assertRaises(runner.Refused):
                runner.create_targets(Mock(), admin, names)
            admin.connect.assert_not_called()
        sa, admin = Mock(), MagicMock()
        sa.text.side_effect = lambda value: value
        connection = admin.connect.return_value.execution_options.return_value.__enter__.return_value
        with patch.object(runner, "identity"), contextlib.redirect_stdout(io.StringIO()):
            runner.create_targets(sa, admin, runner.DATABASES)
        self.assertEqual([call.args[0] for call in connection.execute.call_args_list],
                         [f'CREATE DATABASE "{name}" TEMPLATE template0' for name in runner.DATABASES])

    def test_database_identity_rejects_wrong_name_host_port_or_major(self):
        connection = Mock()
        good = (runner.DATABASES[0], "127.0.0.1", 55432, 160015)
        for index, value in enumerate(("cookbook_dev", "10.0.0.1", 55433, 170000)):
            row = list(good)
            row[index] = value
            connection.execute.return_value.one.return_value = row
            with self.assertRaises(runner.Refused):
                runner.identity(Mock(), connection, runner.DATABASES[0])

    def test_migration_arguments_are_closed_and_population_downgrade_is_not_allowed(self):
        urls = runner.validate_targets(configured())
        with patch.object(runner.subprocess, "run") as process:
            for args in ((3, "upgrade", runner.OLD, None), (False, "upgrade", runner.OLD, None), (1, "downgrade", "base", None),
                         (2, "stamp", runner.NEW, None), (0, "downgrade", runner.OLD, None)):
                with self.assertRaises(runner.Refused):
                    runner.migrate(Mock(), Mock(), urls, *args)
            process.assert_not_called()

    def test_migration_bootstrap_isolated_no_urls_in_argv_and_failure_cause_required(self):
        urls = runner.validate_targets(configured())
        build = Mock()
        build.return_value.render_as_string.return_value = "internal-pinned-url"
        for expected, stderr in (("check", "psycopg2.errors.CheckViolation: ck_private_item_content"), ("populated", "weaker-constraint downgrade refused")):
            action, revision = ("upgrade", runner.NEW) if expected == "check" else ("downgrade", runner.OLD)
            with patch.object(runner.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", stderr)) as process:
                runner.migrate(Mock(), build, urls, 0, action, revision, expected)
                command = process.call_args.args[0]
                self.assertNotIn("synthetic_password", " ".join(command))
                self.assertIn("-I", command)
                self.assertIn("-B", command)
                self.assertIn("dotenv.load_dotenv=lambda", " ".join(command))
                self.assertEqual(process.call_args.kwargs["env"]["DATABASE_URL"], "internal-pinned-url")
            for error in ("connection refused", "private-row", "unexpected migration error"):
                with patch.object(runner.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", error)), self.assertRaises(runner.Refused):
                    runner.migrate(Mock(), build, urls, 0, action, revision, expected)

    def test_migration_timeout_hides_credentials_and_sql(self):
        urls = runner.validate_targets(configured())
        with patch.object(runner.subprocess, "run", side_effect=subprocess.TimeoutExpired([], 1, "private-row synthetic_password")):
            with self.assertRaises(runner.Refused) as error:
                runner.migrate(Mock(), Mock(), urls, 0, "upgrade", runner.OLD)
            self.assertNotIn("private-row", str(error.exception))
            self.assertNotIn("synthetic_password", str(error.exception))

    def test_comparison_retains_rows_receipts_sequences_and_unrelated_constraints(self):
        before = {"rows": {"alembic_version": ["old"], "private_planned_items": ["quantity"], "planning_mutations": ["receipt"]},
                  "constraints": [("private_planned_items", "ck_private_item_content", "old"), ("private_planned_items", "owner_fk", "keep")],
                  "sequences": {"users_id_seq": (4, True)}}
        after = runner.without_corrective_changes(before)
        self.assertNotIn("alembic_version", after["rows"])
        self.assertEqual(after["rows"]["planning_mutations"], ["receipt"])
        self.assertEqual(after["rows"]["private_planned_items"], ["quantity"])
        self.assertEqual(after["constraints"], [("private_planned_items", "owner_fk", "keep")])
        self.assertEqual(after["sequences"], before["sequences"])
        self.assertIn("alembic_version", before["rows"])
        after["sequences"]["users_id_seq"] = (4, False)
        with self.assertRaises(runner.Refused):
            runner.same_snapshot(runner.without_corrective_changes(before), after, "changed sequence")

    def test_empty_and_revision_checks_reject_false_success(self):
        value = {"rows": {"alembic_version": ['{"version_num":"da64e532bc73"}'], "users": []}}
        runner.at_revision(value, runner.OLD)
        runner.no_user_rows(value)
        with self.assertRaises(runner.Refused):
            runner.at_revision(value, runner.NEW)
        value["rows"]["users"] = ["synthetic"]
        with self.assertRaises(runner.Refused):
            runner.no_user_rows(value)

    def test_old_schema_fixture_accepts_plan_name_and_reaches_receipt(self):
        # Regression: insert(name, **values) collided with the plan's name field
        # after the user sequence had advanced, rolling back all fixture rows.
        for invalid in (False, True):
            with self.subTest(invalid=invalid):
                tables = {}
                sa, engine = Mock(), MagicMock()
                def reflect(name, *args, **kwargs):
                    tables[name] = Mock()
                    return tables[name]
                sa.Table.side_effect = reflect
                connection = engine.begin.return_value.__enter__.return_value
                connection.execute.return_value.scalar_one.return_value = "synthetic-id"
                runner.seed_da64(sa, engine, invalid=invalid)
                plan = tables["private_plans"].insert.return_value.values.call_args.kwargs
                self.assertEqual(plan["name"], "Synthetic corrective plan")
                receipt = tables["planning_mutations"].insert.return_value.values.call_args.kwargs
                self.assertEqual(receipt["result"]["synthetic_migration_fixture"], "synthetic-id")
                items = tables["private_planned_items"].insert.return_value.values.call_args_list
                self.assertEqual(len(items), 3 if invalid else 2)
                self.assertEqual(items[0].kwargs["unit"], "loaf")
                self.assertEqual(items[0].kwargs["quantity"] is None, invalid)
                if invalid:
                    self.assertIsNone(items[1].kwargs["servings"])
                    self.assertEqual(str(items[2].kwargs["servings"]), "1.5")


if __name__ == "__main__":
    unittest.main()
