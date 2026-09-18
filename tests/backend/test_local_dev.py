"""Pure stdlib/mocks: never import the app or connect to a database."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import MagicMock, Mock, patch
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("local_dev", ROOT / "scripts/local_dev.py")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class LocalDevTest(unittest.TestCase):
    def setUp(self):
        marker_patch = patch.object(runner, "INIT_MARKER")
        self.marker = marker_patch.start()
        self.marker.exists.return_value = False
        self.addCleanup(marker_patch.stop)
        content_patch = patch.object(runner, "validate_content")
        self.content = content_patch.start()
        self.addCleanup(content_patch.stop)

    def test_environment_allowlist_and_fixed_target(self):
        parent = {"PATH": "runtime", "SystemRoot": "system", "DATABASE_URL": "private",
                  "JWT_SECRET_KEY": "private", "PGHOST": "remote", "PYTHONPATH": "outside",
                  "PYTHONHOME": "outside", "HOME": "outside", "SMTP_PASSWORD": "private"}
        clean = runner.isolated_env(parent)
        self.assertEqual(set(clean), set(runner.SETTINGS) | {"PATH", "SystemRoot"})
        self.assertEqual(clean["SystemRoot"], "system")
        self.assertEqual(clean["FLASK_SKIP_DOTENV"], "1")
        self.assertEqual(clean["FLASK_DEBUG"], "0")
        self.assertNotIn("private", clean.values())
        self.assertGreaterEqual(len(clean["JWT_SECRET_KEY"]), 48)
        self.assertEqual(clean, runner.isolated_env(parent))
        self.assertEqual(parent["DATABASE_URL"], "private")
        target = urlsplit(clean["DATABASE_URL"])
        self.assertEqual((target.scheme, target.hostname, target.port, target.path),
                         ("postgresql+psycopg2", "localhost", 55433, "/cookbook_dev"))
        self.assertEqual(target.username, "cookbook_local")
        self.assertEqual(target.password, "cookbook-local-development-only")
        query = parse_qs(target.query)
        self.assertEqual(query["hostaddr"], ["127.0.0.1"])
        self.assertEqual(query["passfile"], [os.devnull])
        self.assertEqual(query["connect_timeout"], ["5"])

    def test_overrides_refused_before_process_or_import(self):
        keys = ("DATABASE_URL", "database_url", "FLASK_ENV", "FLASK_RUN_HOST", "FLASK_DEBUG",
                "FLASK_SKIP_DOTENV", "PGHOSTADDR", "PGSERVICE", "PGPASSFILE", "PGOPTIONS",
                "SQLALCHEMY_DATABASE_URI", "JWT_SECRET_KEY", "CORS_ORIGINS", "FRONTEND_URL",
                "PROXY_FIX_X_FOR", "MAX_CONTENT_LENGTH", "COOKBOOK_TEST_DATABASE_URL")
        for key in keys:
            with self.subTest(key=key), patch.object(runner.subprocess, "run") as child, \
                    patch.object(runner, "load_database_tools") as imports, \
                    contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(runner.main(["init"], {key: "private-value"}), 2)
                child.assert_not_called()
                imports.assert_not_called()
                self.assertNotIn("private-value", output.getvalue())

    def test_cli_rejects_arbitrary_commands_and_url_arguments_without_echo(self):
        for args in ([], ["reset"], ["db", "downgrade"], ["serve", "--host", "private-value"],
                     ["init", "--database-url", "private-value"], ["--env-file", "private-value"]):
            with self.subTest(args=args), patch.object(runner.subprocess, "run") as child, \
                    contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(runner.main(args, {}), 2)
                child.assert_not_called()
                self.assertNotIn("private-value", output.getvalue())

    def test_child_uses_current_python_isolation_and_no_credential_output(self):
        for action in ("init", "serve"):
            with patch.object(runner.subprocess, "run", return_value=Mock(returncode=0)) as run, \
                    contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(runner.main([action], {"PATH": "runtime"}), 0)
            command = run.call_args.args[0]
            options = run.call_args.kwargs
            self.assertEqual(command[:5], [sys.executable, "-I", "-B", "-u", "-c"])
            self.assertEqual(command[-1], action)
            self.assertEqual(options["cwd"], ROOT)
            self.assertEqual(options["env"], runner.isolated_env({"PATH": "runtime"}))
            self.assertEqual(options["stdout"], subprocess.DEVNULL)
            self.assertEqual(options["stderr"], subprocess.DEVNULL)
            self.assertEqual(options["timeout"], 300 if action == "init" else None)
            for secret in (runner.DATABASE_URL, urlsplit(runner.DATABASE_URL).password,
                           runner.SETTINGS["JWT_SECRET_KEY"]):
                self.assertNotIn(secret, " ".join(command) + output.getvalue())

    def test_worker_guard_precedes_imports(self):
        for changes in ({"DATABASE_URL": "sqlite:///:memory:"},
                        {"DATABASE_URL": runner.DATABASE_URL.replace("55433", "55432")},
                        {"DATABASE_URL": runner.DATABASE_URL.replace("localhost", "remote")},
                        {"FLASK_ENV": "production"}, {"FLASK_SKIP_DOTENV": "0"},
                        {"PGSERVICE": "outside"}, {"PYTHONPATH": "outside"}):
            with self.subTest(changes=changes), \
                    patch.dict(os.environ, {**runner.isolated_env({}), **changes}, clear=True), \
                    patch.object(runner, "load_database_tools") as imports:
                self.assertEqual(runner.worker("init"), 2)
                imports.assert_not_called()

    def test_init_order_and_no_reset_accounts_or_deletions(self):
        app = Mock()
        cli = app.test_cli_runner.return_value
        cli.invoke.return_value.exit_code = 0
        self.assertEqual(runner.initialize(app), 0)
        self.assertEqual([call.kwargs["args"] for call in cli.invoke.call_args_list],
                         [["db", "upgrade", "head"], ["sync-recipes"], ["sync-glossary"],
                          ["sync-skills"], ["sync-lessons"]])
        self.assertEqual(len(app.mock_calls), 6)  # runner + exactly five allowed commands

    def test_init_stops_at_each_failed_command(self):
        for index in range(5):
            app = Mock()
            cli = app.test_cli_runner.return_value
            cli.invoke.side_effect = [Mock(exit_code=0)] * index + [Mock(exit_code=1)]
            self.assertEqual(runner.initialize(app), 10 + index)
            self.assertEqual(cli.invoke.call_count, index + 1)

    def database_mocks(self, database="cookbook_dev", revisions=("head",), populated=True, occupied=False):
        sa, migration, scripts, engine = Mock(), Mock(), Mock(), MagicMock()
        sa.text.side_effect = lambda sql: sql
        connection = engine.connect.return_value.__enter__.return_value
        def result(sql):
            value = database if sql == "SELECT current_database()" else (
                occupied if "pg_catalog.pg_class" in sql else populated)
            return Mock(scalar_one=lambda: value)
        connection.execute.side_effect = result
        migration.configure.return_value.get_current_heads.return_value = revisions
        scripts.walk_revisions.return_value = [Mock(revision="head"), Mock(revision="old")]
        scripts.get_heads.return_value = ["head"]
        sa.inspect.return_value.get_table_names.return_value = []
        return sa, migration, scripts, engine

    def test_identity_migration_and_content_barriers_are_read_only(self):
        mocks = self.database_mocks()
        runner.inspect_database(*mocks, ready=True)
        connection = mocks[3].connect.return_value.__enter__.return_value
        queries = [call.args[0] for call in connection.execute.call_args_list]
        self.assertEqual(queries[:2], ["SET TRANSACTION READ ONLY", "SELECT current_database()"])
        self.assertEqual(len(queries), 8)
        self.assertTrue(all(query.startswith("SELECT EXISTS") for query in queries[2:]))
        for kwargs in ({"database": "production"}, {"revisions": ("unknown",)},
                       {"revisions": ("old",)}, {"revisions": ()}, {"populated": False}):
            with self.subTest(kwargs=kwargs), self.assertRaises(runner.Refused):
                runner.inspect_database(*self.database_mocks(**kwargs), ready=True)

    def test_init_accepts_empty_or_known_old_schema_but_not_unversioned_tables(self):
        for revisions in ((), ("old",)):
            runner.inspect_database(*self.database_mocks(revisions=revisions))
        mocks = self.database_mocks(revisions=(), occupied=True)
        with self.assertRaises(runner.Refused):
            runner.inspect_database(*mocks)

    def test_worker_checks_before_app_import_and_after_init_and_serves_safely(self):
        for action in ("init", "serve"):
            events = []
            sa, migration, scripts, engine = self.database_mocks()
            sa.create_engine.return_value = engine
            app = Mock(config={"SQLALCHEMY_DATABASE_URI": runner.DATABASE_URL})
            with patch.dict(os.environ, runner.isolated_env({}), clear=True), \
                    patch.object(runner, "load_database_tools", return_value=(sa, migration, scripts)), \
                    patch.object(runner, "inspect_database", side_effect=lambda *a, **k: events.append(k["ready"])), \
                    patch.object(runner, "load_app", side_effect=lambda: events.append("app") or app), \
                    patch.object(runner, "initialize", side_effect=lambda a: events.append("init") or 0):
                self.assertEqual(runner.worker(action), 0)
            self.assertEqual(events, [False, "app", "init", True] if action == "init" else [True, "app"])
            engine.dispose.assert_called_once()
            if action == "serve":
                app.run.assert_called_once_with(host="127.0.0.1", port=5100, debug=False,
                                               use_reloader=False, use_debugger=False, load_dotenv=False)
            else:
                app.run.assert_not_called()

    def test_ready_validates_persisted_content_links(self):
        mocks = self.database_mocks()
        self.content.side_effect = RuntimeError("dangling lesson step")
        with self.assertRaisesRegex(RuntimeError, "dangling"):
            runner.inspect_database(*mocks, ready=True)
        self.content.assert_called_once_with(mocks[0], mocks[3])

    def test_interrupted_init_refuses_serve_before_database_import(self):
        self.marker.exists.return_value = True
        with patch.dict(os.environ, runner.isolated_env({}), clear=True), \
                patch.object(runner, "load_database_tools") as imports:
            self.assertEqual(runner.worker("serve"), 4)
            imports.assert_not_called()

    def test_failed_init_keeps_marker_and_reports_command_without_secrets(self):
        sa, migration, scripts, engine = self.database_mocks()
        sa.create_engine.return_value = engine
        app = Mock(config={"SQLALCHEMY_DATABASE_URI": runner.DATABASE_URL})
        with patch.dict(os.environ, runner.isolated_env({}), clear=True), \
                patch.object(runner, "load_database_tools", return_value=(sa, migration, scripts)), \
                patch.object(runner, "inspect_database"), \
                patch.object(runner, "load_app", return_value=app), \
                patch.object(runner, "initialize", return_value=14):
            self.assertEqual(runner.worker("init"), 14)
        self.marker.touch.assert_called_once()
        self.marker.unlink.assert_not_called()
        with patch.object(runner.subprocess, "run", return_value=Mock(returncode=14)), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(runner.main(["init"], {}), 14)
        self.assertIn("sync-lessons", output.getvalue())
        self.assertNotIn(runner.DATABASE_URL, output.getvalue())

    def test_unavailable_dependencies_and_server_prevent_app_import(self):
        for stage in ("load_database_tools", "inspect_database"):
            with patch.dict(os.environ, runner.isolated_env({}), clear=True), \
                    patch.object(runner, "load_database_tools", return_value=(Mock(), Mock(), Mock())), \
                    patch.object(runner, stage, side_effect=ImportError("private-value")), \
                    patch.object(runner, "load_app") as app:
                self.assertEqual(runner.worker("init"), 3)
                app.assert_not_called()

    def test_process_failures_are_controlled_and_never_echo_exceptions(self):
        for error, code in ((OSError("private-value"), 3),
                            (subprocess.TimeoutExpired("private-value", 300, "private-value"), 1)):
            with patch.object(runner.subprocess, "run", side_effect=error), \
                    contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(runner.main(["init"], {}), code)
                self.assertNotIn("private-value", output.getvalue())


if __name__ == "__main__":
    unittest.main()
