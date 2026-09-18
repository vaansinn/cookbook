"""Independent opt-in PostgreSQL corrective-migration rehearsal.

Three NEW databases only; postgres is used solely as the maintenance connection
for existence checks and CREATE DATABASE. No fresh/history/dev/restore connection.
No application/driver import before pure target validation; no reset/resume mode.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DATABASES = ("cookbook_test_corrective_valid", "cookbook_test_corrective_invalid", "cookbook_test_corrective_empty")
URL_KEYS = ("COOKBOOK_TEST_CORRECTIVE_VALID_URL", "COOKBOOK_TEST_CORRECTIVE_INVALID_URL", "COOKBOOK_TEST_CORRECTIVE_EMPTY_URL")
CONFIRM_KEY = "COOKBOOK_TEST_CORRECTIVE_CONFIRM"
CONFIRM_VALUE = "three-new-local-corrective-databases"
OLD = "da64e532bc73"
NEW = "eb75f643cd84"
OS_KEYS = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"}
PATTERN = re.compile(
    r"postgresql(?:\+psycopg2)?://(?P<user>(?:[A-Za-z0-9_.~-]|%[0-9A-Fa-f]{2})+)"
    r":(?P<password>(?:[A-Za-z0-9_.~-]|%[0-9A-Fa-f]{2})+)"
    r"@localhost:55432/(?P<database>cookbook_test_corrective_(?:valid|invalid|empty))"
)


class Refused(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Refused(message)


def validate_targets(env):
    require(env.get(CONFIRM_KEY) == CONFIRM_VALUE, "Explicit three-new-database corrective confirmation required")
    urls = []
    for key, name in zip(URL_KEYS, DATABASES):
        raw = env.get(key, "")
        match = PATTERN.fullmatch(raw) if isinstance(raw, str) else None
        require(match is not None and match["database"] == name, f"{key} must name exact {name} on localhost:55432")
        for field in ("user", "password"):
            try:
                decoded = unquote(match[field], errors="strict")
            except UnicodeError:
                raise Refused("Invalid credential encoding") from None
            require(not any(ord(c) < 32 or ord(c) == 127 for c in decoded), "Invalid credential characters")
        urls.append(raw)
    return tuple(urls)


def isolated_env(env, urls):
    clean = {key: value for key, value in env.items() if key.upper() in OS_KEYS}
    clean.update(zip(URL_KEYS, urls))
    clean.update({CONFIRM_KEY: CONFIRM_VALUE, "FLASK_ENV": "development", "FLASK_SKIP_DOTENV": "1",
                  "PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8",
                  "JWT_SECRET_KEY": "synthetic-corrective-rehearsal-only-not-real-accounts"})
    return clean


def load_tools():
    # Both imported helpers are stdlib-only until load_database_tools is invoked.
    sys.path.insert(0, str(ROOT / "scripts"))
    from verify_postgres import load_database_tools, engine_url
    from verify_planning_restore import snapshot
    return load_database_tools(), engine_url, snapshot


def identity(sa, connection, name):
    row = connection.execute(sa.text("SELECT current_database(), host(inet_server_addr()), inet_server_port(), current_setting('server_version_num')::int")).one()
    require(row[0] == name and row[1] == "127.0.0.1" and row[2] == 55432 and 160000 <= row[3] < 170000,
            "Unexpected PostgreSQL database/server identity")


def preflight(sa, admin):
    """Read-only complete barrier: even an EMPTY pre-existing target is refused."""
    with admin.connect() as connection:
        connection.execute(sa.text("SET TRANSACTION READ ONLY"))
        identity(sa, connection, "postgres")
        names = set(connection.execute(sa.text("SELECT datname FROM pg_database")).scalars())
        require(not set(DATABASES) & names, "A corrective target already exists; all three must be NEW. No reset/resume.")


def create_targets(sa, admin, names):
    require(tuple(names) == DATABASES, "Database creation requires the exact corrective triple")
    for name in names:
        with admin.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            identity(sa, connection, "postgres")
            connection.execute(sa.text(f'CREATE DATABASE "{name}" TEMPLATE template0'))
        print(f"Created {name} on 127.0.0.1:55432", flush=True)


def migrate(sa, engine_url, urls, index, action, revision, expected_error=None):
    allowed = {("upgrade", OLD, None), ("upgrade", NEW, None),
               ("upgrade", NEW, "check"), ("downgrade", OLD, "populated"), ("downgrade", OLD, None)}
    require(type(index) is int and index in (0, 1, 2), "Migration target refused")
    require((action, revision, expected_error) in allowed, "Migration action refused")
    require(action != "downgrade" or expected_error == "populated" or index == 2,
            "Successful downgrade is only allowed in the empty-case database")
    env = isolated_env(os.environ, urls)
    env["DATABASE_URL"] = engine_url(sa, urls[index]).render_as_string(hide_password=False)
    bootstrap = "import sys; sys.path.insert(0,sys.argv.pop(1)); import dotenv; dotenv.load_dotenv=lambda *a,**k:False; from flask.cli import main; main()"
    command = [sys.executable, "-I", "-B", "-X", "utf8", "-c", bootstrap, str(ROOT), "--app", "app", "db", action, revision]
    try:
        result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=120)
    except (OSError, subprocess.TimeoutExpired):
        raise Refused("Migration unavailable/timed out; targets retained") from None
    # Expected failure MUST have the intended cause; never accept a connection or import failure.
    if expected_error == "check":
        require(result.returncode != 0 and "CheckViolation" in result.stderr
                and any(name in result.stderr for name in ("ck_private_item_content", "ck_private_item_quantity")),
                "Invalid populated upgrade did not fail with the expected CHECK violation")
    elif expected_error == "populated":
        require(result.returncode != 0 and "weaker-constraint downgrade refused" in result.stderr,
                "Populated downgrade did not explicitly refuse")
    else:
        require(result.returncode == 0, "Migration failed; targets retained")


def same_snapshot(expected, actual, stage):
    require(expected == actual, f"{stage}: rows/schema/sequences differ")


def at_revision(value, revision):
    require(value["rows"]["alembic_version"] == [json.dumps({"version_num": revision}, separators=(",", ":"))],
            "Unexpected migration revision")


def no_user_rows(value):
    require(all(not rows for table, rows in value["rows"].items() if table != "alembic_version"),
            "Empty rehearsal unexpectedly has user rows")


def seed_da64(sa, engine, *, invalid):
    """Reflect the OLD schema; no current ORM defaults or application imports."""
    from datetime import datetime, date
    from decimal import Decimal
    import hashlib
    from uuid import uuid4
    with engine.begin() as connection:
        metadata = sa.MetaData()
        names = ("users", "planning_workspaces", "private_plans", "private_meals", "private_planned_items", "planning_mutations", "planning_catalog_entries")
        tables = {name: sa.Table(name, metadata, schema="public", autoload_with=connection) for name in names}
        def insert(table_name, **values):
            return connection.execute(tables[table_name].insert().values(**values).returning(tables[table_name].c.id)).scalar_one()
        now = datetime(2026, 9, 13)
        user = insert("users", email="corrective-fixture@example.test", password_hash="synthetic-not-a-login", plan="free", created_at=now)
        workspace = insert("planning_workspaces", id=str(uuid4()), user_id=user, revision=1, created_at=now)
        plan = insert("private_plans", id=str(uuid4()), workspace_id=workspace, name="Synthetic corrective plan", start_date=date(2026,9,13), end_date=date(2026,9,14), created_at=now)
        meal = insert("private_meals", id=str(uuid4()), workspace_id=workspace, plan_id=plan, date=date(2026,9,13), position=0)
        content = {"schema_version": 1, "recipe": None, "variants": [{"id": "test", "base_servings": 2,
            "languages": {"en": {"title": "Synthetic corrective example", "ingredients": [{"ingredient_id": "synthetic", "form": "dry", "unit": "g", "amount": "1.000"}]}}}]}
        digest = hashlib.sha256(json.dumps({"entry_id": "corrective-fixture", "revision": 1, "kind": "planning_example", "content": content}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        insert("planning_catalog_entries", entry_id="corrective-fixture", revision=1, kind="planning_example", availability="draft", content=content, content_digest=digest, created_at=now)
        item = insert("private_planned_items", id=str(uuid4()), workspace_id=workspace, meal_id=meal, position=0, kind="personal", title="Synthetic corrective bread", quantity=None if invalid else Decimal("2.125"), unit="loaf", follows_guests=False)
        for position, servings in enumerate((None, Decimal("1.5")) if invalid else (Decimal("4"),), 1):
            insert("private_planned_items", id=str(uuid4()), workspace_id=workspace, meal_id=meal, position=position, kind="dish",
                   entry_id="corrective-fixture", catalog_revision=1, language="en", options={"variant_id": "test"}, servings=servings, follows_guests=False)
        insert("planning_mutations", workspace_id=workspace, mutation_id=str(uuid4()), request_digest="0" * 64,
               result={"revision": 1, "synthetic_migration_fixture": item}, status_code=201, created_at=now)


def without_corrective_changes(value):
    from copy import deepcopy
    value = deepcopy(value)
    value["rows"].pop("alembic_version")
    value["constraints"] = [row for row in value["constraints"] if row[1] not in ("ck_private_item_content", "ck_private_item_quantity")]
    return value


def probe_constraints(sa, engine):
    """Each newly enforced rule must reject direct SQL; rollback every probe."""
    probes = (
        ("UPDATE private_planned_items SET quantity=NULL WHERE kind='personal'", "ck_private_item_quantity"),
        ("UPDATE private_planned_items SET servings=NULL WHERE kind='dish'", "ck_private_item_content"),
        ("UPDATE private_planned_items SET servings=1.5 WHERE kind='dish'", "ck_private_item_content"),
    )
    for statement, expected in probes:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                result = connection.execute(sa.text(statement))
                require(result.rowcount > 0, "Constraint probe missed fixture")
            except sa.exc.IntegrityError as error:
                require(getattr(getattr(error.orig, "diag", None), "constraint_name", None) == expected,
                        "Constraint probe failed for an unexpected reason")
            else:
                raise Refused("Corrected database accepted a forbidden NULL/fractional value")
            finally:
                transaction.rollback()


def worker():
    urls = validate_targets(os.environ)
    clean = isolated_env(os.environ, urls)
    os.environ.clear()
    os.environ.update(clean)
    sa, engine_url, snapshot = load_tools()
    admin, engines = None, []
    try:
        # Fixed maintenance database, derived credentials only, pinned loopback.
        # No application loads against postgres and no table data is read/written there.
        admin = sa.create_engine(engine_url(sa, urls[0]).set(database="postgres"), poolclass=sa.pool.NullPool)
        preflight(sa, admin)
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        config = Config()
        config.set_main_option("script_location", str(ROOT / "migrations"))
        require(set(ScriptDirectory.from_config(config).get_heads()) == {NEW}, "This bounded rehearsal requires eb75 as current head")
        create_targets(sa, admin, DATABASES)
        for name, url in zip(DATABASES, urls):
            engine = sa.create_engine(engine_url(sa, url), poolclass=sa.pool.NullPool)
            engines.append(engine)
            with engine.connect() as connection:
                connection.execute(sa.text("SET TRANSACTION READ ONLY"))
                identity(sa, connection, name)
        for index in range(3):
            migrate(sa, engine_url, urls, index, "upgrade", OLD)
        seed_da64(sa, engines[0], invalid=False)
        seed_da64(sa, engines[1], invalid=True)
        valid_before, invalid_before, empty_before = (snapshot(sa, engine) for engine in engines)
        for before in (valid_before, invalid_before, empty_before):
            at_revision(before, OLD)
        no_user_rows(empty_before)
        migrate(sa, engine_url, urls, 0, "upgrade", NEW)
        valid_after = snapshot(sa, engines[0])
        at_revision(valid_after, NEW)
        same_snapshot(without_corrective_changes(valid_before), without_corrective_changes(valid_after),
                      "Valid populated upgrade changed unrelated data/schema")
        checks = {row[1]: row[2] for row in valid_after["constraints"]}
        require("servings IS NOT NULL" in checks["ck_private_item_content"]
                and "(servings)::integer" in checks["ck_private_item_content"]
                and "quantity IS NOT NULL" in checks["ck_private_item_quantity"], "Corrective CHECKs missing")
        probe_constraints(sa, engines[0])
        same_snapshot(valid_after, snapshot(sa, engines[0]), "Rolled-back constraint probes changed evidence")
        print("PASS valid: populated da64 -> eb75; all rows/IDs/receipts/catalog digests/sequences preserved; independent NULL quantity/NULL servings/fractional servings SQL probes rejected", flush=True)
        migrate(sa, engine_url, urls, 0, "downgrade", OLD, "populated")
        same_snapshot(valid_after, snapshot(sa, engines[0]), "Populated downgrade refusal changed state")
        print("PASS downgrade refusal: populated eb75 -> da64 explicitly refused; complete snapshot unchanged", flush=True)
        migrate(sa, engine_url, urls, 1, "upgrade", NEW, "check")
        same_snapshot(invalid_before, snapshot(sa, engines[1]), "Invalid populated upgrade failure changed state")
        print("PASS invalid: old-schema NULL quantity/NULL servings/fractional servings retained after expected CHECK failure; rows/revision/old constraints/indexes/sequences unchanged", flush=True)
        migrate(sa, engine_url, urls, 2, "upgrade", NEW)
        empty_head = snapshot(sa, engines[2])
        at_revision(empty_head, NEW)
        no_user_rows(empty_head)
        migrate(sa, engine_url, urls, 2, "downgrade", OLD)
        same_snapshot(empty_before, snapshot(sa, engines[2]), "Empty downgrade differs from old schema")
        migrate(sa, engine_url, urls, 2, "upgrade", NEW)
        same_snapshot(empty_head, snapshot(sa, engines[2]), "Empty re-upgrade differs from head schema")
        print("PASS empty: da64 -> eb75 -> da64 -> eb75; exact old/head snapshots restored, no user rows", flush=True)
        print(f"PASS: {len(valid_after['rows'])} public tables and {len(valid_after['sequences'])} sequences compared; all three corrective databases retained", flush=True)
        print("No fresh/history/restore/recovery-source/dev connections, database resets/drops, or service changes", flush=True)
        return 0
    finally:
        for engine in engines:
            engine.dispose()
        if admin is not None:
            admin.dispose()


def safe_worker():
    try:
        return worker()
    except Refused as error:
        print("REFUSED: " + str(error), flush=True)
        return 2
    except Exception as error:
        import traceback
        print("FAILED: corrective stage failed; all targets retained; no reset attempted", flush=True)
        for frame in traceback.extract_tb(error.__traceback__)[-3:]:
            print(f"  at {Path(frame.filename).name}:{frame.lineno} ({frame.name})", flush=True)
        return 1


def main(env=None):
    env = os.environ if env is None else env
    try:
        urls = validate_targets(env)
    except Refused as error:
        print("REFUSED: " + str(error))
        return 2
    bootstrap = "import runpy,sys; sys.exit(runpy.run_path(sys.argv[1])['safe_worker']())"
    try:
        result = subprocess.run([sys.executable, "-I", "-B", "-X", "utf8", "-c", bootstrap, str(Path(__file__).resolve())],
                                cwd=ROOT, env=isolated_env(env, urls), capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=600)
    except (OSError, subprocess.TimeoutExpired):
        print("FAILED: worker unavailable/timed out; targets retained")
        return 1
    output = result.stdout
    for url in urls:
        parts = urlsplit(url)
        for secret in (url, parts.username, parts.password, unquote(parts.username), unquote(parts.password)):
            output = output.replace(secret, "[REDACTED]")
    print(output, end="")
    return result.returncode


if __name__ == "__main__":
    if sys.argv[1:]:
        print("Usage: verify_planning_corrective.py (no arguments/target overrides)")
        sys.exit(2)
    sys.exit(main())
