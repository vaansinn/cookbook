"""Pure sidecar safety tests: stdlib only, no app, driver or PostgreSQL connection."""
import contextlib
from copy import deepcopy
import importlib.util
import io
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, Mock, patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("shopping_pg_sidecar", ROOT / "scripts" / "planning_shopping_postgres_checks.py")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)
import verify_postgres as support


def configured():
    return {runner.CONFIRM_KEY: runner.CONFIRM_VALUE,
            runner.URL_KEY: "postgresql://test_user:test_password@localhost:55432/cookbook_test_fresh"}


def identity():
    return {"database": "cookbook_test_fresh", "address": "127.0.0.1", "port": 55432, "version": "160015"}


def table_names():
    names = ["users", "alembic_version", "planning_workspaces", "planning_catalog_entries", "private_planned_items",
             "private_shopping_scopes", "private_planning_templates", "private_planning_preferences",
             "planning_mutations", "planning_undo", "planning_previews"]
    return names + ["synthetic_table_" + str(index) for index in range(36 - len(names))]


class ShoppingPostgresSafetyTest(unittest.TestCase):
    def x1b_evidence(self):
        schema = {"tables": sorted(runner.X1B_TABLES),
                  "columns": [(name, 1, "id", "integer", True, None, "", "") for name in sorted(runner.X1B_TABLES)],
                  "constraints": [("private_planned_items", "ck_private_item_content", "CHECK synthetic", True, False, False)],
                  "indexes": [("users", "users_pkey", "CREATE UNIQUE INDEX synthetic", True, True)],
                  "sequences": [("users_id_seq", "integer", 1, 1, 2147483647, 1, False, 1)]}
        rows = {"public." + name: (1 if name == "alembic_version" else 0, "empty-hash") for name in runner.X1B_TABLES}
        return schema, rows

    def test_resume_requires_independent_fingerprint_and_explicit_mode(self):
        env = self.upgrade_env()
        for value in (None, "", "a" * 63, "A" * 64, "a" * 65, "not-a-hash"):
            self.refused({**env, runner.X1B_SCHEMA_HASH_KEY: value}, ["--resume-empty-x1b"])
        env[runner.X1B_SCHEMA_HASH_KEY] = "a" * 64
        with patch.object(runner, "captured_run", return_value=0) as process:
            self.assertEqual(runner.main(env, ["--resume-empty-x1b"]), 0)
        argv, clean, _ = process.call_args.args
        self.assertIn("resume=True", argv[-2])
        self.assertEqual(clean[runner.X1B_SCHEMA_HASH_KEY], "a" * 64)
        self.assertNotIn(runner.URL_KEY, clean)
        with patch.object(runner, "captured_run", return_value=0) as process:
            runner.main(env, ["--check-populated-upgrade"])
        self.assertNotIn("resume=True", process.call_args.args[0][-2])

    def test_resume_refuses_any_populated_old_table_wrong_head_or_wrong_table_set(self):
        schema, rows = self.x1b_evidence()
        self.assertEqual(len(runner.X1B_TABLES), 33)
        digest = runner.x1b_schema_hash(schema)
        runner.validate_empty_x1b([runner.PRE_SHOPPING_HEAD], schema, rows, digest)
        for name in runner.X1B_TABLES:
            changed = dict(rows)
            changed["public." + name] = (2 if name == "alembic_version" else 1, "populated-hash")
            with self.subTest(table=name), self.assertRaises(RuntimeError):
                runner.validate_empty_x1b([runner.PRE_SHOPPING_HEAD], schema, changed, digest)
        for heads in ([], [runner.EXPECTED_HEAD], [runner.PRE_SHOPPING_HEAD, "other"]):
            with self.assertRaises(RuntimeError):
                runner.validate_empty_x1b(heads, schema, rows, digest)
        for names in (schema["tables"][:-1], schema["tables"] + ["unexpected"]):
            with self.assertRaises(RuntimeError):
                runner.validate_empty_x1b([runner.PRE_SHOPPING_HEAD], {**schema, "tables": names}, rows, digest)
        with self.assertRaises(RuntimeError):
            runner.validate_empty_x1b([runner.PRE_SHOPPING_HEAD], schema, {}, digest)

    def test_resume_schema_comparison_covers_columns_constraints_indexes_sequences(self):
        schema, rows = self.x1b_evidence()
        digest = runner.x1b_schema_hash(schema)
        for key in ("columns", "constraints", "indexes", "sequences"):
            changed = deepcopy(schema)
            changed[key] = []
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                runner.validate_empty_x1b([runner.PRE_SHOPPING_HEAD], changed, rows, digest)
        changed = deepcopy(schema)
        changed["columns"][0] = (*changed["columns"][0][:3], "varchar(1)", *changed["columns"][0][4:])
        self.assertNotEqual(runner.x1b_schema_hash(changed), digest)

    def test_verified_fc86_old_table_subset_matches_x1b_schema_fingerprint(self):
        schema, _ = self.x1b_evidence()
        new = deepcopy(schema)
        new["tables"] += sorted(runner.SHOPPING_TABLES)
        for key in ("columns", "constraints", "indexes"):
            new[key] += [(name, "new-table-only") for name in sorted(runner.SHOPPING_TABLES)]
        self.assertEqual(runner.x1b_schema_hash(new), runner.x1b_schema_hash(schema))

    def test_resume_worker_checks_fingerprint_before_driver_import(self):
        with patch.object(support, "load_database_tools") as database:
            with self.assertRaises(runner.Refused):
                runner.upgrade_worker(self.upgrade_env(), resume=True)
            database.assert_not_called()

    def test_resume_refusal_prevents_all_migrations_and_seeding(self):
        app, db, upgrade = MagicMock(), Mock(), Mock()
        with patch.dict(sys.modules, {"alembic.config": SimpleNamespace(Config=Mock()),
                "alembic.script": SimpleNamespace(ScriptDirectory=Mock()), "flask_migrate": SimpleNamespace(upgrade=upgrade),
                "flask_jwt_extended": SimpleNamespace(create_access_token=Mock())}), \
                patch.object(runner, "resume_preflight", side_effect=RuntimeError("populated")), \
                patch.object(runner, "upgrade_preflight") as fresh, patch.object(runner, "seed_x1b") as seed:
            with self.assertRaises(RuntimeError):
                runner.exercise_upgrade(Mock(), app, db, resume=True, expected_hash="a" * 64)
            fresh.assert_not_called()
            upgrade.assert_not_called()
            seed.assert_not_called()

    def test_resume_read_only_preflight_rejects_population_before_seed(self):
        schema, _ = self.x1b_evidence()
        for populated in (False, True):
            sa, engine = Mock(), MagicMock()
            engine.dialect.name = "postgresql"
            sa.text.side_effect = lambda text: text
            connection = engine.connect.return_value.execution_options.return_value.__enter__.return_value
            connection.dialect.identifier_preparer.quote_identifier.side_effect = lambda name: '"' + name + '"'
            facts = {**identity(), "database": runner.UPGRADE_DATABASE}
            counts = [Mock(scalar_one=lambda count=(1 if name == "alembic_version" or populated and name == "users" else 0): count)
                      for name in sorted(runner.X1B_TABLES)]
            connection.execute.side_effect = [Mock(), Mock(mappings=lambda: Mock(one=lambda: facts)),
                Mock(scalar_one=lambda: False), Mock(scalars=lambda: [runner.PRE_SHOPPING_HEAD]), *counts]
            with patch.object(runner, "read_x1b_schema", return_value=schema), contextlib.redirect_stdout(io.StringIO()):
                if populated:
                    with self.assertRaises(RuntimeError):
                        runner.resume_preflight(sa, engine, runner.x1b_schema_hash(schema))
                else:
                    runner.resume_preflight(sa, engine, runner.x1b_schema_hash(schema))
            self.assertEqual(connection.execute.call_args_list[0].args, ("SET TRANSACTION READ ONLY",))
            connection.commit.assert_not_called()

    def test_full_seed_accepts_name_fields_without_table_argument_collision(self):
        # Execute the entire fixture builder with recorded SQL objects, no driver.
        writes = []
        class Statement:
            def __init__(self, table): self.table = table
            def values(self, **values):
                writes.append((self.table.name, values))
                return self
            def returning(self, *_args): return self
            def where(self, *_args): return self
        sa, engine = Mock(), MagicMock()
        tables = [SimpleNamespace(name=name, c=SimpleNamespace(id=Mock())) for name in runner.X1B_TABLES]
        sa.insert.side_effect = Statement
        sa.update.side_effect = Statement
        connection = engine.begin.return_value.__enter__.return_value
        connection.execute.return_value.scalar_one.return_value = 1
        catalog = SimpleNamespace(validate_record=lambda record: {**record, "content_digest": "a" * 64})
        with patch.dict(sys.modules, {"planning_catalog": catalog}):
            result = runner.seed_x1b(sa, engine, tables)
        self.assertEqual(len(result["receipts"]), 2)
        self.assertEqual(next(values["name"] for table, values in writes if table == "private_plans"), "Retained X1b plan")
        self.assertEqual(next(values["name"] for table, values in writes if table == "private_events"), "Retained event")
        self.assertEqual(sum(table == "private_planned_items" for table, _ in writes), 3)
        self.assertTrue(any(table == "planning_undo" for table, _ in writes))

    def upgrade_env(self):
        return {runner.CONFIRM_KEY: runner.CONFIRM_VALUE, runner.UPGRADE_CONFIRM_KEY: runner.UPGRADE_CONFIRM_VALUE,
                runner.UPGRADE_URL_KEY: "postgresql://test_user:test_password@localhost:55432/cookbook_test_shopping_upgrade"}

    def test_upgrade_mode_requires_separate_target_and_both_confirmations(self):
        env = self.upgrade_env()
        self.assertEqual(runner.upgrade_guard(env), (env[runner.UPGRADE_URL_KEY],))
        for key in (runner.CONFIRM_KEY, runner.UPGRADE_CONFIRM_KEY, runner.UPGRADE_URL_KEY):
            invalid = dict(env)
            invalid.pop(key)
            self.refused(invalid, ["--check-populated-upgrade"])
        for target in ("cookbook_test_fresh", "cookbook_test_history", "cookbook_dev", "cookbook_test_restored",
                       "cookbook_test_recovery_source", "cookbook_test_shopping_upgrade_backup"):
            invalid = {**env, runner.UPGRADE_URL_KEY: env[runner.UPGRADE_URL_KEY].replace(runner.UPGRADE_DATABASE, target)}
            self.refused(invalid, ["--check-populated-upgrade"])
        for value in (env[runner.UPGRADE_URL_KEY].replace("55432", "55433"),
                      env[runner.UPGRADE_URL_KEY].replace("localhost", "127.0.0.1"),
                      env[runner.UPGRADE_URL_KEY] + "?host=remote", env[runner.UPGRADE_URL_KEY] + "\n"):
            self.refused({**env, runner.UPGRADE_URL_KEY: value}, ["--check-populated-upgrade"])

    def test_upgrade_child_cannot_inherit_existing_database_targets(self):
        env = {**configured(), **self.upgrade_env(), "COOKBOOK_TEST_HISTORY_URL": "history",
               "COOKBOOK_TEST_RESTORED_URL": "restored", "DATABASE_URL": "production", "PGHOST": "remote"}
        with patch.object(runner, "captured_run", return_value=0) as process:
            self.assertEqual(runner.main(env, ["--check-populated-upgrade"]), 0)
        argv, clean, urls = process.call_args.args
        self.assertEqual(urls, (env[runner.UPGRADE_URL_KEY],))
        self.assertIn("upgrade_worker", argv[-2])
        self.assertNotIn("test_password", str(argv))
        self.assertEqual(clean[runner.UPGRADE_URL_KEY], urls[0])
        for key in (runner.URL_KEY, "COOKBOOK_TEST_HISTORY_URL", "COOKBOOK_TEST_RESTORED_URL", "DATABASE_URL", "PGHOST"):
            self.assertNotIn(key, clean)

    def test_upgrade_worker_invalid_target_never_loads_driver(self):
        with patch.object(support, "load_database_tools") as database, patch.object(runner, "exercise_upgrade") as exercise:
            with self.assertRaises(runner.Refused):
                runner.upgrade_worker(configured())
            database.assert_not_called()
            exercise.assert_not_called()

    def test_upgrade_preflight_rejects_any_non_system_relation_read_only(self):
        for occupied in (True, False):
            sa, engine = Mock(), MagicMock()
            engine.dialect.name = "postgresql"
            sa.text.side_effect = lambda text: text
            connection = engine.connect.return_value.__enter__.return_value
            facts = {**identity(), "database": runner.UPGRADE_DATABASE}
            connection.execute.side_effect = [Mock(), Mock(mappings=lambda: Mock(one=lambda: facts)), Mock(),
                Mock(scalar_one=lambda: runner.UPGRADE_DATABASE), Mock(scalar_one=lambda: occupied)]
            if occupied:
                with self.assertRaises(runner.Refused):
                    runner.upgrade_preflight(sa, engine)
            else:
                runner.upgrade_preflight(sa, engine)
            queries = [call.args[0] for call in connection.execute.call_args_list]
            self.assertEqual(queries[0], "SET TRANSACTION READ ONLY")
            self.assertEqual(queries[2], "SET TRANSACTION READ ONLY")
            self.assertIn("pg_catalog.pg_class", queries[-1])
            self.assertNotIn("n.nspname = 'public'", queries[-1])
            connection.commit.assert_not_called()

    def test_upgrade_occupied_target_prevents_migration_and_fixture_writes(self):
        app, db, upgrade = MagicMock(), Mock(), Mock()
        with patch.dict(sys.modules, {"alembic.config": SimpleNamespace(Config=Mock()),
                "alembic.script": SimpleNamespace(ScriptDirectory=Mock()),
                "flask_migrate": SimpleNamespace(upgrade=upgrade),
                "flask_jwt_extended": SimpleNamespace(create_access_token=Mock())}), \
                patch.object(runner, "upgrade_preflight", side_effect=runner.Refused("occupied")), \
                patch.object(runner, "seed_x1b") as seed:
            with self.assertRaises(runner.Refused):
                runner.exercise_upgrade(Mock(), app, db)
            upgrade.assert_not_called()
            seed.assert_not_called()
            db.engine.dispose.assert_called_once()

    def refused(self, env, argv=None):
        with patch.object(runner, "captured_run") as process, patch.object(support, "load_database_tools") as database, \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(runner.main(env, [] if argv is None else argv), 2)
            process.assert_not_called()
            database.assert_not_called()
        self.assertNotIn("test_password", output.getvalue())

    def test_module_and_guard_do_not_import_database_or_application(self):
        self.assertFalse({"app", "sqlalchemy", "psycopg2", "flask"}.intersection(sys.modules))
        self.assertEqual(runner.guard(configured()), (configured()[runner.URL_KEY],))
        self.assertFalse({"app", "sqlalchemy", "psycopg2", "flask"}.intersection(sys.modules))

    def test_single_fresh_target_requires_no_history_and_ignores_generic_urls(self):
        env = configured()
        env.update(COOKBOOK_TEST_HISTORY_URL="postgresql://do-not-connect", DATABASE_URL="postgresql://production")
        self.assertEqual(runner.guard(env), (configured()[runner.URL_KEY],))
        clean = runner.isolated_env(env, runner.guard(env))
        self.assertNotIn("COOKBOOK_TEST_HISTORY_URL", clean)
        self.assertNotIn("DATABASE_URL", clean)
        env.pop(runner.URL_KEY)
        self.refused(env)

    def test_confirmation_must_match_exactly(self):
        for value in (None, False, "", "yes", "true", runner.CONFIRM_VALUE + " "):
            with self.subTest(value=value):
                self.refused({**configured(), runner.CONFIRM_KEY: value})

    def test_wrong_host_port_database_and_ambiguous_url_refused_before_io(self):
        original = configured()[runner.URL_KEY]
        invalid = [original.replace("localhost", host) for host in
                   ("127.0.0.1", "[::1]", "LOCALHOST", "localhost.", "localhost.evil.test", "%6cocalhost", "remote")]
        invalid += [original.replace(":55432", port) for port in ("", ":5432", ":55433", ":055432", ":0")]
        invalid += [original.replace("cookbook_test_fresh", name) for name in
                    ("cookbook_test_history", "cookbook_dev", "cookbook", "postgres", "cookbook_test_restored",
                     "cookbook_test_recovery_source", "cookbook_test_fresh_backup", "%63ookbook_test_fresh", "")]
        invalid += [original + suffix for suffix in ("?", "#", "?host=remote", "?service=prod", "/", "\n", "#fragment")]
        invalid += [" " + original, original.replace("postgresql", "sqlite"), original.replace("postgresql", "postgres"),
                    original.replace("postgresql", "postgresql+asyncpg"), None, 1, [], {}]
        for value in invalid:
            with self.subTest(value=value):
                self.refused({**configured(), runner.URL_KEY: value})

    def test_invalid_credentials_are_rejected_without_echoing_them(self):
        original = configured()[runner.URL_KEY]
        for value in ("", "p%00ss", "p%0ass", "p%7fss", "p%FFss", "p%xxss", "p@remote", "p:ss", "p/ss"):
            self.refused({**configured(), runner.URL_KEY: original.replace("test_password", value)})
        self.refused({**configured(), runner.URL_KEY: original.replace("test_user:test_password@", "")})

    def test_psycopg2_encoded_credentials_are_supported(self):
        value = configured()[runner.URL_KEY].replace("postgresql://", "postgresql+psycopg2://").replace("test_password", "p%40ss%3Aword")
        self.assertEqual(runner.guard({**configured(), runner.URL_KEY: value}), (value,))

    def test_cli_has_no_execution_override_or_reset_mode(self):
        for argv in (["--reset"], ["--create"], ["--database", "other"], ["--worker"], ["--check-guards", "--run"]):
            self.refused(configured(), argv)

    def test_child_is_isolated_no_credentials_in_argv_and_no_history(self):
        env = {**configured(), "DATABASE_URL": "production", "PGHOST": "remote", "PGHOSTADDR": "8.8.8.8",
               "PGSERVICE": "production", "PGSERVICEFILE": "secret", "PGPASSFILE": "secret", "PGOPTIONS": "unsafe",
               "PYTHONPATH": "external", "PYTHONSTARTUP": "external.py", "FLASK_APP": "external",
               "JWT_SECRET_KEY": "real-secret", "COOKBOOK_TEST_HISTORY_URL": "remote", "PATH": "runtime"}
        with patch.object(runner, "captured_run", return_value=0) as process:
            self.assertEqual(runner.main(env, []), 0)
        argv, clean, urls = process.call_args.args
        self.assertEqual(urls, (configured()[runner.URL_KEY],))
        self.assertEqual(argv[:5], [sys.executable, "-I", "-B", "-X", "utf8"])
        self.assertNotIn("test_password", str(argv))
        self.assertNotIn("shell", process.call_args.kwargs)
        self.assertEqual(process.call_args.kwargs["timeout"], 240)
        self.assertNotEqual(clean["JWT_SECRET_KEY"], "real-secret")
        for key in ("DATABASE_URL", "PGHOST", "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE",
                    "PGOPTIONS", "PYTHONPATH", "PYTHONSTARTUP", "FLASK_APP", "COOKBOOK_TEST_HISTORY_URL"):
            self.assertNotIn(key, clean)
        self.assertEqual(clean["FLASK_SKIP_DOTENV"], "1")
        self.assertEqual(clean["PATH"], "runtime")

    def test_worker_revalidates_before_driver_load(self):
        with patch.object(support, "load_database_tools") as database, patch.object(runner, "exercise") as exercise:
            with self.assertRaises(runner.Refused):
                runner.worker({})
            database.assert_not_called()
            exercise.assert_not_called()

    def test_worker_failure_suppresses_sql_and_private_error_values(self):
        with patch.dict(os.environ, {}, clear=True), \
                patch.object(support, "load_database_tools", side_effect=RuntimeError("test_password private-row SQL")), \
                patch.object(runner, "exercise") as exercise, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(runner.worker(configured()), 1)
            exercise.assert_not_called()
        self.assertNotIn("test_password", output.getvalue())
        self.assertNotIn("private-row", output.getvalue())

    def test_check_guards_mode_is_pure_and_never_launches_worker(self):
        with patch.object(runner, "captured_run") as process, patch.object(support, "load_database_tools") as database, \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runner.main({}, ["--check-guards"]), 0)
            process.assert_not_called()
            database.assert_not_called()

    def test_server_identity_and_exact_schema_head_gate(self):
        runner.validate_identity(identity(), [runner.EXPECTED_HEAD], table_names(), [runner.EXPECTED_HEAD])
        for key, value in (("database", "cookbook_dev"), ("address", "::1"), ("address", "8.8.8.8"),
                           ("port", 55433), ("version", "170000")):
            with self.assertRaises(RuntimeError):
                runner.validate_identity({**identity(), key: value}, [runner.EXPECTED_HEAD], table_names(), [runner.EXPECTED_HEAD])
        for actual, code in (([], [runner.EXPECTED_HEAD]), (["old"], [runner.EXPECTED_HEAD]),
                             ([runner.EXPECTED_HEAD], ["future"]), ([runner.EXPECTED_HEAD, "other"], [runner.EXPECTED_HEAD])):
            with self.assertRaises(RuntimeError):
                runner.validate_identity(identity(), actual, table_names(), code)
        for names in (table_names()[:-1], table_names() + ["extra"], ["unrelated"] * 36):
            with self.assertRaises(RuntimeError):
                runner.validate_identity(identity(), [runner.EXPECTED_HEAD], names, [runner.EXPECTED_HEAD])

    def test_preflight_checks_before_reflecting_and_uses_read_only_connection(self):
        sa, engine = Mock(), MagicMock()
        engine.dialect.name = "postgresql"
        connection = engine.connect.return_value.__enter__.return_value
        sa.text.side_effect = lambda text: text
        connection.execute.side_effect = [Mock(), Mock(mappings=lambda: Mock(one=lambda: identity())),
                                          Mock(scalars=lambda: [runner.EXPECTED_HEAD])]
        sa.inspect.return_value.get_table_names.return_value = table_names()
        sa.MetaData.return_value.tables = {}
        scripts = Mock()
        scripts.ScriptDirectory.from_config.return_value.get_heads.return_value = [runner.EXPECTED_HEAD]
        with patch.dict(sys.modules, {"alembic.config": SimpleNamespace(Config=Mock()), "alembic.script": scripts}):
            self.assertEqual(runner.preflight(sa, engine), [])
        self.assertEqual(connection.execute.call_args_list[0].args, ("SET TRANSACTION READ ONLY",))
        self.assertIn("host(inet_server_addr())", connection.execute.call_args_list[1].args[0])
        sa.MetaData.return_value.reflect.assert_called_once_with(bind=connection, schema="public", views=False)

    def test_missing_schema_preflight_never_reflects_or_writes(self):
        sa, engine = Mock(), MagicMock()
        engine.dialect.name = "postgresql"
        connection = engine.connect.return_value.__enter__.return_value
        connection.execute.side_effect = [Mock(), Mock(mappings=lambda: Mock(one=lambda: identity())),
                                          Mock(scalars=lambda: ["old"])]
        sa.inspect.return_value.get_table_names.return_value = table_names()
        scripts = Mock()
        scripts.ScriptDirectory.from_config.return_value.get_heads.return_value = [runner.EXPECTED_HEAD]
        with patch.dict(sys.modules, {"alembic.config": SimpleNamespace(Config=Mock()), "alembic.script": scripts}):
            with self.assertRaises(RuntimeError):
                runner.preflight(sa, engine)
        sa.MetaData.assert_not_called()
        connection.commit.assert_not_called()

    def test_scope_template_and_preference_export_contract(self):
        data = {"shopping_scopes": [{"id": "scope", "state": {"rows": {}, "personal": [], "unavailable": False}}],
                "templates": [{"id": "template", "blueprint": {"schema_version": 1, "items": [
                    {"kind": "dish", "entry_id": "synthetic-reference", "catalog_revision": 1}]}}],
                "preferences": [{"revision": 1, "values": {"shopping_layout": "dish"}}], "mutations": []}
        runner.assert_private_export(data, "scope", "template")
        for key in ("shopping_scopes", "templates", "preferences", "mutations"):
            invalid = deepcopy(data)
            invalid.pop(key)
            with self.assertRaises(RuntimeError):
                runner.assert_private_export(invalid, "scope", "template")
        for field in ("ingredients", "method", "equipment", "content_digest", "dish_title"):
            invalid = deepcopy(data)
            invalid["templates"][0]["blueprint"]["items"][0][field] = "Forbidden projection"
            with self.assertRaises(RuntimeError):
                runner.assert_private_export(invalid, "scope", "template")

    def catalog_adapter(self, changes=None, missing=False):
        # Record expression predicates without importing SQLAlchemy or opening SQL.
        class Column:
            def __init__(self, name): self.name = name
            def __eq__(self, value): return (self.name, value)
        table = SimpleNamespace(name="planning_catalog_entries", c=SimpleNamespace(
            **{name: Column(name) for name in ("id", "entry_id", "revision", "content_digest", "kind")}))
        sa, connection = Mock(), Mock()
        entry, digest = "shopping-pg-" + "a" * 32, "b" * 64
        row = {"id": 42, "entry_id": entry, "revision": 1, "content_digest": digest, "kind": "planning_example", **(changes or {})}
        connection.execute.side_effect = [Mock(mappings=lambda: Mock(one_or_none=lambda: None if missing else row)), Mock(rowcount=1)]
        return sa, connection, table, entry, digest

    def test_catalog_cleanup_requires_captured_id_entry_revision_digest_and_kind(self):
        sa, connection, table, entry, digest = self.catalog_adapter()
        runner.delete_catalog_fixture(sa, connection, table, 42, entry, digest)
        sa.select.return_value.where.assert_called_once_with(("id", 42))
        sa.delete.return_value.where.assert_called_once_with(("id", 42), ("entry_id", entry),
                                                            ("revision", 1), ("content_digest", digest), ("kind", "planning_example"))
        self.assertEqual(connection.execute.call_count, 2)
        connection.commit.assert_not_called()

    def test_catalog_cleanup_never_deletes_mismatched_or_missing_row(self):
        for field, value in (("entry_id", "sql-fixture"), ("revision", 2), ("content_digest", "c" * 64), ("kind", "recipe")):
            sa, connection, table, entry, digest = self.catalog_adapter({field: value})
            with self.assertRaises(RuntimeError):
                runner.delete_catalog_fixture(sa, connection, table, 42, entry, digest)
            sa.delete.assert_not_called()
            self.assertEqual(connection.execute.call_count, 1)
        sa, connection, table, entry, digest = self.catalog_adapter(missing=True)
        runner.delete_catalog_fixture(sa, connection, table, 42, entry, digest)
        sa.delete.assert_not_called()

    def test_catalog_cleanup_invalid_capture_refused_before_sql(self):
        for identity, entry, digest in ((None, "shopping-pg-" + "a" * 32, "b" * 64),
                                       (True, "shopping-pg-" + "a" * 32, "b" * 64),
                                       (42, "sql-fixture", "b" * 64), (42, "shopping-pg-" + "a" * 32, "")):
            sa, connection, table, _, _ = self.catalog_adapter()
            with self.assertRaises(RuntimeError):
                runner.delete_catalog_fixture(sa, connection, table, identity, entry, digest)
            connection.execute.assert_not_called()

    def test_downgrade_guard_always_rolls_back_and_requires_expected_refusal(self):
        for error in (RuntimeError("Saved shopping/templates/preferences exist; destructive downgrade refused"),
                      RuntimeError("unexpected error"), None):
            with self.subTest(error=error):
                sa, engine = Mock(), MagicMock()
                sa.text.side_effect = lambda text: text
                connection = engine.connect.return_value.__enter__.return_value
                connection.execute.return_value.scalars.return_value = [runner.EXPECTED_HEAD]
                migration = SimpleNamespace(revision=runner.EXPECTED_HEAD, downgrade=Mock(side_effect=error))
                operations = SimpleNamespace(Operations=SimpleNamespace(context=lambda _context: contextlib.nullcontext()))
                context = SimpleNamespace(MigrationContext=Mock())
                with patch.object(runner.importlib.util, "module_from_spec", return_value=migration), \
                        patch.object(runner.importlib.util, "spec_from_file_location", return_value=Mock()), \
                        patch.dict(sys.modules, {"alembic.migration": context, "alembic.operations": operations}):
                    if error and str(error).startswith("Saved shopping/"):
                        runner.downgrade_refusal(sa, engine)
                    else:
                        with self.assertRaises(RuntimeError):
                            runner.downgrade_refusal(sa, engine)
                connection.begin.return_value.rollback.assert_called_once()
                connection.commit.assert_not_called()
                self.assertEqual(connection.execute.call_args_list[0].args, ("SET TRANSACTION READ ONLY",))


if __name__ == "__main__":
    unittest.main()
