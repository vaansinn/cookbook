"""Opt-in shopping/template/preference API checks on the completed PG09 fresh DB.

Coordinator only: run AFTER all migration/sync/restore workers release fresh.
Required: COOKBOOK_TEST_DATABASE_URL naming cookbook_test_fresh at exact
localhost:55432, explicit credentials, and COOKBOOK_TEST_POSTGRES_CONFIRM=
disposable-local-test-databases. No history URL is required or connected. The
worker clears inherited application/libpq settings and pins hostaddr=127.0.0.1.
Run: python -I -B scripts/planning_shopping_postgres_checks.py
Pure checks: python -I -B scripts/planning_shopping_postgres_checks.py --check-guards

Default mode: no DB creation, migration upgrade, sync, service control, HTTP or reset.
Requires PostgreSQL 16, fc86a754de95 and exactly 36 public tables. Uses Flask's
actual in-process API with separate concurrent clients and real PostgreSQL locks.
Creates two unique synthetic accounts and one v2 planning_example (no recipes or
cooking), then removes ONLY captured run-owned IDs. Catalog cleanup deliberately
uses exact-ID Core DELETE, bypassing normal retained-catalog ORM deletion guards
only for this run's synthetic example. Existing sql-fixture is never altered.
All public table rows (including head) must match their original hashes. Sequence
allocation is not reset or claimed unchanged. No existing row values/tokens/SQL
are printed. A timeout/crash may leave fixtures: there is NO broad cleanup mode.

The populated downgrade check invokes the current migration's refusal guard in a
READ ONLY transaction, always rolled back; it is not an administrative migration
or an old-build/backup/restore rehearsal. Exact receipt roundtrips are checked in
this process, fixtures are not retained. A later restore verifier must create its
own new-format fixtures; do not reuse occupied restore destinations blindly.

OPTIONAL populated-X1b upgrade mode: --check-populated-upgrade. Main must supply a
NEW, already-created, completely empty cookbook_test_shopping_upgrade database at
localhost:55432 in COOKBOOK_TEST_SHOPPING_UPGRADE_URL, the ordinary disposable
confirmation above AND COOKBOOK_TEST_SHOPPING_UPGRADE_CONFIRM=
new-empty-pre-fc86-fixture-upgrade. No existing fresh/history/restore URL is used.
This mode refuses any existing user relation in any non-system schema; it does
not create/drop databases, reset, or clean up. It upgrades the empty DB to
eb75f643cd84, inserts synthetic X1b records through reflected OLD tables, then
upgrades to fc86 and compares every old table's rows (except the changed head).
It checks old receipt replay, current reads/export and a new shopping write/retry.
The resulting populated target stays for inspection and cannot be reused. This
proves migration preservation only when run, not execution of an old binary or
old-backend rollback compatibility. No engine is used by the pure safety tests.

Narrow recovery from a rolled-back seed failure: --resume-empty-x1b. Same exact
upgrade URL and both confirmations, plus COOKBOOK_TEST_X1B_SCHEMA_SHA256 from an
INDEPENDENTLY VERIFIED eb75 schema (or old-table subset of verified fc86). Main
can calculate it with x1b_schema_hash(read_x1b_schema(sa, read_only_connection));
do not self-approve the failed target by using its own hash as the reference.
Resume verifies exact eb75/33 tables, no unexpected user relations, zero rows in
every old table except the single version row, and matching columns (full types),
constraints/validation flags, indexes and sequence definitions. It prints only
schema/empty-row hashes, skips the already-applied eb75 migration, and seeds anew.
Sequence last_value/is_called are deliberately excluded: rolled-back inserts may
have consumed IDs. No sequence reset is performed. Coordinator must serialize
access to this dedicated target throughout the check. Populated targets refuse.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import unquote
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_postgres import (CONFIRM_KEY, CONFIRM_VALUE, URL_PATTERN, Refused,
                             isolated_env, captured_run, require)
from planning_repeat_postgres_checks import fingerprint

EXPECTED_HEAD = "fc86a754de95"
EXPECTED_TABLE_COUNT = 36
URL_KEY = "COOKBOOK_TEST_DATABASE_URL"
UPGRADE_DATABASE = "cookbook_test_shopping_upgrade"
UPGRADE_URL_KEY = "COOKBOOK_TEST_SHOPPING_UPGRADE_URL"
UPGRADE_CONFIRM_KEY = "COOKBOOK_TEST_SHOPPING_UPGRADE_CONFIRM"
UPGRADE_CONFIRM_VALUE = "new-empty-pre-fc86-fixture-upgrade"
PRE_SHOPPING_HEAD = "eb75f643cd84"
X1B_SCHEMA_HASH_KEY = "COOKBOOK_TEST_X1B_SCHEMA_SHA256"
X1B_TABLES = frozenset("""alembic_version users dishes recipe_tiers food_items favorites
households household_members grocery_lists grocery_items plan_entries meal_plans
meal_plan_items recipe_content_snapshots cook_logs badge_awards glossary_entries
skills lessons cook_reflections reflection_mutations skill_confidences
planning_workspaces private_plans private_meals planning_mutations private_events
private_event_links private_preparation_tasks planning_previews planning_undo
planning_catalog_entries private_planned_items""".split())
SHOPPING_TABLES = frozenset({"private_shopping_scopes", "private_planning_templates", "private_planning_preferences"})


def guard(env):
    """Pure single-target allowlist, before any driver/application import."""
    if env.get(CONFIRM_KEY) != CONFIRM_VALUE:
        raise Refused("Explicit disposable PostgreSQL confirmation is required")
    value = env.get(URL_KEY)
    match = URL_PATTERN.fullmatch(value) if isinstance(value, str) else None
    if not match or match["database"] != "cookbook_test_fresh":
        raise Refused("Shopping checks require exact cookbook_test_fresh on localhost:55432; no query/fragment")
    for field in ("user", "password"):
        try:
            decoded = unquote(match[field], errors="strict")
        except UnicodeError:
            raise Refused("Invalid credential encoding") from None
        if any(ord(char) < 32 or ord(char) == 127 for char in decoded):
            raise Refused("Control characters in credentials")
    return (value,)


def upgrade_guard(env):
    """Independent opt-in; never accept a previously used verifier target."""
    if env.get(UPGRADE_CONFIRM_KEY) != UPGRADE_CONFIRM_VALUE:
        raise Refused("Explicit new-empty populated-X1b upgrade confirmation is required")
    value = env.get(UPGRADE_URL_KEY)
    if not isinstance(value, str) or not value.endswith("/" + UPGRADE_DATABASE):
        raise Refused("Upgrade requires exact cookbook_test_shopping_upgrade on localhost:55432")
    # Reuse the exact syntax/credential guard, replacing ONLY the verified final
    # database segment for validation, never to construct a connected target.
    suffix = "/" + UPGRADE_DATABASE
    candidate = value[:-len(suffix)] + "/cookbook_test_fresh"
    guard({CONFIRM_KEY: env.get(CONFIRM_KEY), URL_KEY: candidate})
    return (value,)


def upgrade_environment(env, urls):
    clean = isolated_env(env, ())
    clean.update({UPGRADE_URL_KEY: urls[0], UPGRADE_CONFIRM_KEY: UPGRADE_CONFIRM_VALUE})
    if X1B_SCHEMA_HASH_KEY in env:
        clean[X1B_SCHEMA_HASH_KEY] = env[X1B_SCHEMA_HASH_KEY]
    return clean


def resume_guard(env):
    urls = upgrade_guard(env)
    value = env.get(X1B_SCHEMA_HASH_KEY)
    if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
        raise Refused("Resume requires an independently verified X1b schema SHA-256")
    return urls


def read_x1b_schema(sa, connection):
    """Read schema facts only; caller must open a read-only transaction."""
    schema = {"tables": sorted(sa.inspect(connection).get_table_names(schema="public"))}
    queries = {
        "columns": """SELECT c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),
            a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated
            FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
            WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
            ORDER BY c.relname,a.attnum""",
        "constraints": """SELECT c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred
            FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' ORDER BY c.relname,k.conname""",
        "indexes": """SELECT t.relname,i.relname,pg_get_indexdef(i.oid),x.indisvalid,x.indisready
            FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid
            JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,i.relname""",
        "sequences": """SELECT sequencename,data_type,start_value,min_value,max_value,increment_by,cycle,cache_size
            FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename""",
    }
    for key, query in queries.items():
        schema[key] = [tuple(row) for row in connection.execute(sa.text(query))]
    return schema


def x1b_schema_hash(schema):
    """Same fingerprint for eb75 and the unchanged old-table portion of fc86."""
    names = set(schema["tables"])
    require(names in (X1B_TABLES, X1B_TABLES | SHOPPING_TABLES), "Unexpected reference schema table set")
    selected = {"tables": sorted(X1B_TABLES), "sequences": sorted(schema["sequences"])}
    for key in ("columns", "constraints", "indexes"):
        selected[key] = sorted(tuple(row) for row in schema[key] if row[0] in X1B_TABLES)
    return hashlib.sha256(json.dumps(selected, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()


def validate_empty_x1b(heads, schema, row_fingerprints, expected_hash):
    """Pure resume verdict: empty means zero rows, not merely matching counts."""
    require(set(heads) == {PRE_SHOPPING_HEAD}, "Resume requires exact eb75 migration head")
    require(set(schema["tables"]) == X1B_TABLES, "Resume requires exact 33-table X1b schema")
    require(x1b_schema_hash(schema) == expected_hash, "Resume schema differs from independently verified X1b reference")
    require(set(row_fingerprints) == {"public." + name for name in X1B_TABLES}, "Resume row snapshot omits or adds tables")
    for name, (count, _digest) in row_fingerprints.items():
        require(count == (1 if name == "public.alembic_version" else 0), "Resume refuses populated or invalid X1b tables")


def resume_preflight(sa, engine, expected_hash):
    require(engine.dialect.name == "postgresql", "PostgreSQL required")
    with engine.connect().execution_options(isolation_level="REPEATABLE READ") as connection:
        connection.execute(sa.text("SET TRANSACTION READ ONLY"))
        identity = connection.execute(sa.text("SELECT current_database() AS database, host(inet_server_addr()) AS address, "
            "inet_server_port() AS port, current_setting('server_version_num') AS version")).mappings().one()
        require(identity["database"] == UPGRADE_DATABASE and identity["address"] == "127.0.0.1"
                and identity["port"] == 55432 and int(identity["version"]) // 10000 == 16, "Unexpected resume server identity")
        unexpected = connection.execute(sa.text("""SELECT EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
            AND (n.nspname <> 'public' OR c.relkind NOT IN ('r','i','S')))""")).scalar_one()
        require(not unexpected, "Resume refuses unexpected user relations")
        heads = list(connection.execute(sa.text("SELECT version_num FROM public.alembic_version")).scalars())
        schema = read_x1b_schema(sa, connection)
        require(set(schema["tables"]) == X1B_TABLES, "Resume requires exact X1b tables")
        row_fingerprints = {}
        quote = connection.dialect.identifier_preparer.quote_identifier
        for name in sorted(X1B_TABLES):
            count = connection.execute(sa.text(f'SELECT count(*) FROM public.{quote(name)}')).scalar_one()
            require(count == (1 if name == "alembic_version" else 0), "Resume refuses populated X1b table")
            row_fingerprints["public." + name] = (count, hashlib.sha256(json.dumps(heads if name == "alembic_version" else []).encode()).hexdigest())
        validate_empty_x1b(heads, schema, row_fingerprints, expected_hash)
        print("PASS resume read-only guard: eb75/33 tables, verified schema SHA-256 " + expected_hash)
        print("Empty-X1b row fingerprint: " + hashlib.sha256(json.dumps(row_fingerprints, sort_keys=True).encode()).hexdigest())


def upgrade_preflight(sa, engine):
    """Read-only barrier before any migration or fixture; no DB creation."""
    from verify_postgres import inspect_empty
    require(engine.dialect.name == "postgresql", "PostgreSQL required")
    with engine.connect() as connection:
        connection.execute(sa.text("SET TRANSACTION READ ONLY"))
        row = connection.execute(sa.text("SELECT current_database() AS database, host(inet_server_addr()) AS address, "
            "inet_server_port() AS port, current_setting('server_version_num') AS version")).mappings().one()
        require(row["database"] == UPGRADE_DATABASE and row["address"] == "127.0.0.1" and row["port"] == 55432
                and int(row["version"]) // 10000 == 16, "Unexpected upgrade server identity")
    inspect_empty(sa, engine, UPGRADE_DATABASE)


def seed_x1b(sa, engine, tables):
    """Representative old-schema fixture; no current ORM writes or old-app claim."""
    from datetime import date, datetime
    from decimal import Decimal
    from uuid import uuid4
    from planning_catalog import validate_record
    table = {row.name: row for row in tables}
    tag, workspace, plan, meal, occasion = [str(uuid4()) for _ in range(5)]
    entry = "x1b-upgrade-" + tag
    now = datetime(2026, 9, 13, 12)
    record = validate_record({"entry_id": entry, "revision": 1, "kind": "planning_example", "availability": "published",
        "content": {"schema_version": 1, "recipe": None, "variants": [{"id": "plain", "base_servings": 2,
            "languages": {"en": {"title": "Synthetic retained X1b example", "ingredients": [
                {"ingredient_id": "synthetic-x1b-food", "form": "dry", "unit": "g", "amount": "25.000"}]}}}]}})
    receipts = []
    with engine.begin() as connection:
        def insert(table_name, **values):
            return connection.execute(sa.insert(table[table_name]).values(**values).returning(table[table_name].c.id)).scalar_one()
        def receipt(operation, payload, result):
            revision = len(receipts)
            envelope = {"mutation_id": str(uuid4()), "expected_workspace_revision": revision,
                        "operation": operation, "payload": payload}
            saved = {**result, "revision": revision + 1}
            digest = hashlib.sha256(json.dumps(envelope, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()
            insert("planning_mutations", workspace_id=workspace, mutation_id=envelope["mutation_id"],
                   request_digest=digest, result=saved, status_code=201, created_at=now)
            receipts.append((envelope, saved))
        user = insert("users", email=f"x1b-upgrade-{tag}@example.test", password_hash="synthetic-not-a-login", plan="free", created_at=now)
        insert("planning_workspaces", id=workspace, user_id=user, revision=0, created_at=now)
        insert("planning_catalog_entries", **record, created_at=now)
        insert("private_plans", id=plan, workspace_id=workspace, name="Retained X1b plan",
               start_date=date(2026, 9, 13), end_date=date(2026, 9, 19), created_at=now)
        receipt("plan.create", {"name": "Retained X1b plan", "start_date": "2026-09-13", "end_date": "2026-09-19"},
                {"plan": {"id": plan, "name": "Retained X1b plan", "start_date": "2026-09-13", "end_date": "2026-09-19", "created_at": now.isoformat()}})
        insert("private_meals", id=meal, workspace_id=workspace, plan_id=plan, date=date(2026, 9, 13), name="Retained meal", time=None, position=0)
        receipt("meal.create", {"plan_id": plan, "date": "2026-09-13", "name": "Retained meal"},
                {"meal": {"id": meal, "plan_id": plan, "date": "2026-09-13", "name": "Retained meal", "time": None, "position": 0}})
        insert("private_events", id=occasion, workspace_id=workspace, name="Retained event", date=date(2026, 9, 14), time="18:00", guests=6, created_at=now)
        insert("private_event_links", id=str(uuid4()), workspace_id=workspace, plan_id=plan, event_id=occasion)
        insert("private_preparation_tasks", id=str(uuid4()), workspace_id=workspace, event_id=occasion,
               bucket="earlier", text="Retained checked reminder", done=True, position=0)
        dish = str(uuid4())
        insert("private_planned_items", id=dish, workspace_id=workspace, meal_id=meal, event_id=None, position=0, kind="dish",
               title=None, group="Retained group", contribution=None, quantity=None, unit=None,
               entry_id=entry, catalog_revision=1, language="en", options={"variant_id": "plain"}, servings=Decimal("2"), follows_guests=False)
        for index, (kind, title, quantity, unit) in enumerate((("personal", "Retained bread", Decimal("1.125"), "loaf"),
                                                              ("note", "Retained note", None, None))):
            insert("private_planned_items", id=str(uuid4()), workspace_id=workspace, meal_id=None, event_id=occasion,
                   position=index, kind=kind, title=title, group=None, contribution="Synthetic guest" if kind == "personal" else None,
                   quantity=quantity, unit=unit, entry_id=None, catalog_revision=None, language=None,
                   options=sa.null(), servings=None, follows_guests=False)
        # Expired old-format recovery JSON must survive unchanged; usability is
        # not inferred from its retention. No new-schema keys are introduced.
        snapshot = {key: [] for key in ("plans", "meals", "events", "links", "tasks", "items")}
        insert("planning_previews", id=str(uuid4()), workspace_id=workspace, revision=2, operation="meal.delete",
               payload={"meal_id": meal}, effects={"affected": snapshot, "events_preserved": False}, expires_at=now)
        insert("planning_undo", id=str(uuid4()), workspace_id=workspace, revision=2,
               inverse={"operation": "meal.delete", "snapshot": snapshot}, expires_at=now)
        connection.execute(sa.update(table["planning_workspaces"]).where(table["planning_workspaces"].c.id == workspace).values(revision=2))
    return {"user_id": user, "workspace_id": workspace, "plan_id": plan, "meal_id": meal,
            "dish_id": dish, "entry_id": entry, "receipts": receipts}


def exercise_upgrade(sa, app, db, *, resume=False, expected_hash=None):
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from flask_migrate import upgrade
    from flask_jwt_extended import create_access_token
    app.config["TESTING"] = True
    with app.app_context():
        engine = db.engine
        try:
            if resume:
                resume_preflight(sa, engine, expected_hash)
            else:
                upgrade_preflight(sa, engine)
            config = Config()
            config.set_main_option("script_location", str(ROOT / "migrations"))
            scripts = ScriptDirectory.from_config(config)
            require(set(scripts.get_heads()) == {EXPECTED_HEAD} and scripts.get_revision(EXPECTED_HEAD).down_revision == PRE_SHOPPING_HEAD,
                    "Unexpected migration chain; refusing fixture writes")
            if not resume:
                upgrade(directory=str(ROOT / "migrations"), revision=PRE_SHOPPING_HEAD)
            def reflect():
                with engine.connect() as connection:
                    connection.execute(sa.text("SET TRANSACTION READ ONLY"))
                    metadata = sa.MetaData()
                    metadata.reflect(bind=connection, schema="public", views=False)
                    head = set(connection.execute(sa.text("SELECT version_num FROM public.alembic_version")).scalars())
                return sorted(metadata.tables.values(), key=lambda table: table.fullname), head
            old_tables, old_head = reflect()
            require(old_head == {PRE_SHOPPING_HEAD} and len(old_tables) == 33, "Expected exact X1b schema before seeding")
            with engine.connect() as connection:
                connection.execute(sa.text("SET TRANSACTION READ ONLY"))
                print("Pre-seed X1b schema SHA-256: " + x1b_schema_hash(read_x1b_schema(sa, connection)))
            fixture = seed_x1b(sa, engine, old_tables)
            before = fingerprint(sa, engine, old_tables)
            upgrade(directory=str(ROOT / "migrations"), revision=EXPECTED_HEAD)
            new_tables, new_head = reflect()
            require(new_head == {EXPECTED_HEAD} and len(new_tables) == 36, "Expected shopping head after upgrade")
            after = fingerprint(sa, engine, new_tables)
            require(all(after.get(name) == value for name, value in before.items() if name != "public.alembic_version"),
                    "Upgrade changed retained X1b rows")
            added = set(after) - set(before)
            require(added == {"public.private_shopping_scopes", "public.private_planning_templates", "public.private_planning_preferences"}
                    and all(after[name][0] == 0 for name in added), "Upgrade unexpectedly seeded new private tables")
            headers = {"Authorization": "Bearer " + create_access_token(identity=str(fixture["user_id"]))}
            with app.test_client() as client:
                def api(method, path, envelope=None):
                    # The enclosing app context spans the rehearsal. End each
                    # request session explicitly, including read-only snapshots.
                    db.session.remove()
                    try:
                        return client.open(path, method=method, json=envelope, headers=headers)
                    finally:
                        db.session.remove()
                for envelope, result in fixture["receipts"]:
                    response = api("POST", "/api/planning/v1/commands", envelope)
                    require(response.status_code == 201 and response.json == result, "Retained X1b receipt did not replay exactly")
                require(fingerprint(sa, engine, new_tables) == after, "Old receipt replay mutated upgraded rows")
                preview = api("GET", f'/api/planning/v1/items/{fixture["dish_id"]}/preview')
                require(preview.status_code == 200 and preview.json["preview"]["ingredients"][0]["amount"] == "25.000",
                        "Retained v1 catalog/item no longer resolves")
                exported = api("GET", "/api/auth/me/export")
                require(exported.status_code == 200, "Upgraded private export failed")
                personal = exported.json["private_planning"]
                require(len(personal["plans"]) == len(personal["meals"]) == len(personal["events"]) == 1
                        and len(personal["items"]) == 3 and personal["preparation_tasks"][0]["done"] is True
                        and len(personal["previews"]) == len(personal["undo"]) == 1, "Upgraded export lost X1b graph/recovery state")
                require(personal["templates"] == personal["shopping_scopes"] == personal["preferences"] == [], "Upgrade invented saved data")
                from uuid import uuid4
                command = {"mutation_id": str(uuid4()), "expected_workspace_revision": 2, "operation": "shopping.scope",
                           "payload": {"owner_type": "plan", "owner_id": fixture["plan_id"], "mode": "all"}}
                response = api("POST", "/api/planning/v1/commands", command)
                require(response.status_code == 201 and response.json["revision"] == 3, "New shopping write failed after upgrade")
                projection = api("GET", '/api/planning/v1/shopping/scopes/' + response.json["scope_id"])
                require(projection.status_code == 200 and len(projection.json["rows"]) == 1
                        and projection.json["rows"][0]["required"] == "25.000" and projection.json["rows"][0]["state"] == "needed",
                        "New projection lost old demand or invented coverage")
                before_retry = fingerprint(sa, engine, new_tables)
                replay = api("POST", "/api/planning/v1/commands", command)
                require(replay.status_code == 201 and replay.json == response.json
                        and fingerprint(sa, engine, new_tables) == before_retry, "New receipt retry reapplied changes")
            print("PASS: populated eb75 X1b -> fc86 preserved all old table rows, catalog, receipts and recovery JSON")
            print("PASS: old receipt replay, v1 resolution/export and new shopping write/retry; upgrade target retained occupied")
            print("LIMIT: synthetic reflected-old-schema fixture, not old-binary execution or recovery compatibility")
        finally:
            db.session.remove()
            engine.dispose()


def upgrade_worker(env=None, *, resume=False):
    from verify_postgres import engine_url, load_database_tools
    source = os.environ if env is None else env
    urls = resume_guard(source) if resume else upgrade_guard(source)
    clean = upgrade_environment(source, urls)
    os.environ.clear()
    os.environ.update(clean)
    try:
        require("app" not in sys.modules, "Upgrade worker requires a fresh process")
        sa = load_database_tools()
        os.environ["DATABASE_URL"] = engine_url(sa, urls[0]).render_as_string(hide_password=False)
        sys.path.insert(0, str(ROOT))
        import dotenv
        dotenv.load_dotenv = lambda *args, **kwargs: False
        from app import app, db
        exercise_upgrade(sa, app, db, resume=resume, expected_hash=clean.get(X1B_SCHEMA_HASH_KEY))
        return 0
    except Exception as error:
        print("FAILED: populated X1b upgrade (" + type(error).__name__ + "); target retained, no reset attempted")
        import traceback
        for frame in traceback.extract_tb(error.__traceback__)[-4:]:
            print(f"  at {Path(frame.filename).name}:{frame.lineno} ({frame.name})")
        return 1


def validate_identity(identity, heads, table_names, code_heads):
    """Pure interpretation of read-only server preflight facts."""
    require(identity["database"] == "cookbook_test_fresh", "Connected database differs from exact fresh target")
    require(identity["address"] == "127.0.0.1" and identity["port"] == 55432, "Connected server is not the approved loopback port")
    require(int(identity["version"]) // 10000 == 16, "PostgreSQL 16 required")
    require(set(heads) == {EXPECTED_HEAD} == set(code_heads), "Schema/code head differs; no migration will be run")
    required = {"users", "alembic_version", "planning_workspaces", "planning_catalog_entries",
                "private_planned_items", "private_shopping_scopes", "private_planning_templates",
                "private_planning_preferences", "planning_mutations", "planning_undo", "planning_previews"}
    require(len(table_names) == EXPECTED_TABLE_COUNT and required <= set(table_names),
            "Expected migrated 36-table shopping schema is missing or changed")


def assert_private_export(data, scope_id, template_id):
    """Export must retain owned new records, not resolved catalog content."""
    require({"shopping_scopes", "templates", "preferences", "mutations"} <= data.keys(), "Export omits new private entities")
    require(any(row["id"] == scope_id and "state" in row for row in data["shopping_scopes"]), "Export omits saved scope allocations")
    template = next((row for row in data["templates"] if row["id"] == template_id), None)
    require(template is not None and template["blueprint"]["schema_version"] == 1, "Export omits template blueprint")
    require(bool(template["blueprint"]["items"]) and bool(data["preferences"]), "Export lost template items/preferences")
    forbidden = {"ingredients", "method", "equipment", "content_digest", "dish_title"}
    require(all(not forbidden.intersection(item) for item in template["blueprint"]["items"]), "Template retained resolved catalog data")


def delete_catalog_fixture(sa, connection, table, identity, entry_id, digest):
    """Exact captured identity deletion only; never commit, infer IDs or scan prefixes."""
    require(table.name == "planning_catalog_entries" and type(identity) is int and identity > 0,
            "Invalid captured catalog cleanup identity")
    require(isinstance(entry_id, str) and re.fullmatch(r"shopping-pg-[0-9a-f]{32}", entry_id)
            and isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest), "Invalid captured fixture metadata")
    row = connection.execute(sa.select(table).where(table.c.id == identity)).mappings().one_or_none()
    if row is None:
        return
    require(row["entry_id"] == entry_id and row["revision"] == 1 and row["content_digest"] == digest
            and row["kind"] == "planning_example", "Catalog cleanup ownership mismatch")
    deleted = connection.execute(sa.delete(table).where(table.c.id == identity, table.c.entry_id == entry_id,
        table.c.revision == 1, table.c.content_digest == digest, table.c.kind == "planning_example"))
    require(deleted.rowcount == 1, "Catalog fixture deletion did not match exactly one captured ID")


def preflight(sa, engine):
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    require(engine.dialect.name == "postgresql", "PostgreSQL required; no fallback")
    with engine.connect() as connection:
        connection.execute(sa.text("SET TRANSACTION READ ONLY"))
        identity = connection.execute(sa.text("SELECT current_database() AS database, host(inet_server_addr()) AS address, "
            "inet_server_port() AS port, current_setting('server_version_num') AS version")).mappings().one()
        heads = list(connection.execute(sa.text("SELECT version_num FROM public.alembic_version")).scalars())
        names = sa.inspect(connection).get_table_names(schema="public")
        config = Config()
        config.set_main_option("script_location", str(ROOT / "migrations"))
        validate_identity(identity, heads, names, ScriptDirectory.from_config(config).get_heads())
        metadata = sa.MetaData()
        metadata.reflect(bind=connection, schema="public", views=False)
    return sorted(metadata.tables.values(), key=lambda table: table.fullname)


def downgrade_refusal(sa, engine):
    """Exercise actual populated guard; transaction is read-only and never committed."""
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = ROOT / "migrations" / "versions" / (EXPECTED_HEAD + "_private_shopping_templates_preferences.py")
    spec = importlib.util.spec_from_file_location("shopping_downgrade_guard", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    require(migration.revision == EXPECTED_HEAD, "Unexpected downgrade module")
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(sa.text("SET TRANSACTION READ ONLY"))
            with Operations.context(MigrationContext.configure(connection)):
                try:
                    migration.downgrade()
                except RuntimeError as error:
                    require(str(error) == "Saved shopping/templates/preferences exist; destructive downgrade refused",
                            "Downgrade failed for an unexpected reason")
                else:
                    raise RuntimeError("Populated downgrade did not refuse")
        finally:
            transaction.rollback()
    with engine.connect() as connection:
        connection.execute(sa.text("SET TRANSACTION READ ONLY"))
        require(set(connection.execute(sa.text("SELECT version_num FROM public.alembic_version")).scalars()) == {EXPECTED_HEAD},
                "Downgrade guard changed the migration head")


def exercise(sa, app, db):
    from concurrent.futures import ThreadPoolExecutor
    from decimal import Decimal
    from threading import Barrier
    from uuid import uuid4
    from flask_jwt_extended import create_access_token
    from models import User
    from planning_catalog import sync_catalog
    from planning_catalog_models import PlanningCatalogEntry
    from planning_models import PlanningWorkspace, delete_private_planning

    app.config["TESTING"] = True
    with app.app_context():
        engine = db.engine
        tables = preflight(sa, engine)
        baseline = fingerprint(sa, engine, tables)
    tag = uuid4().hex
    entry_id = "shopping-pg-" + tag
    users, catalog_ids, headers, acknowledgements = [], [], [], []
    base = "/api/planning/v1"

    def request(method, path, body=None, account=0, statuses=(200,)):
        with app.test_client() as client:
            response = client.open(path, method=method, json=body, headers=headers[account])
            require(response.status_code in statuses, "Unexpected API status at " + path.rsplit("/", 1)[-1])
            require("no-store" in response.headers.get("Cache-Control", ""), "Private API response lacks no-store")
            return response.status_code, response.get_json()

    def get(path, account=0):
        return request("GET", base + path, account=account)[1]

    def body(operation, payload):
        return {"operation": operation, "payload": payload, "mutation_id": str(uuid4()),
                "expected_workspace_revision": get("/workspace")["revision"]}

    def command(operation, payload, account=0):
        envelope = body(operation, payload)
        if account:
            envelope["expected_workspace_revision"] = get("/workspace", account)["revision"]
        status, result = request("POST", base + "/commands", envelope, account, (200, 201))
        require(result["revision"] == envelope["expected_workspace_revision"] + (operation != "preferences.update"),
                "Incorrect revision advancement")
        if operation.startswith(("shopping.", "template.", "preferences.")):
            acknowledgements.append((account, envelope, status, result))
        return result

    def export(account=0):
        return request("GET", "/api/auth/me/export", account=account)[1]["private_planning"]

    def race(envelopes):
        gate = Barrier(2)
        def send(envelope):
            gate.wait(timeout=10)
            return request("POST", base + "/commands", envelope, statuses=(200, 409))
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(send, envelope) for envelope in envelopes]
            return [future.result(timeout=40) for future in futures]

    def rows(scope):
        return get("/shopping/scopes/" + scope)["rows"]

    def pasta(scope):
        selected = [row for row in rows(scope) if row.get("ingredient_id") == "synthetic-pasta"]
        require(len(selected) == 1, "Expected one pasta aggregate")
        return selected[0]

    def coverage(scope, row, item_id, state="bought"):
        sources = [source["id"] for source in row["sources"] if source["item_id"] == item_id]
        require(len(sources) == 1, "Expected one source allocation")
        return {"scope_id": scope, "row_key": row["key"], "source_ids": sources,
                "status": state, "include_extra": False}

    def cleanup():
        failures = []
        for account, (identity, email) in enumerate(users):
            try:
                with app.app_context():
                    db.session.rollback()
                    row = db.session.get(User, identity)
                    if row is None:
                        continue
                    require(row.email == email, "Cleanup identity does not belong to this run")
                    db.session.rollback()
                try:
                    request("DELETE", "/api/auth/me", account=account)
                except Exception:
                    with app.app_context():
                        db.session.rollback()
                        row = db.session.get(User, identity)
                        require(row is not None and row.email == email, "Fallback cleanup ownership mismatch")
                        delete_private_planning(identity)
                        db.session.delete(row)
                        db.session.commit()
                    failures.append("Account API deletion failed; captured fixture ID cleaned via lifecycle helper")
            except Exception:
                failures.append("Captured synthetic account cleanup failed; no broader deletion attempted")
        with app.app_context():
            db.session.rollback()
            # Exact IDs + entry/revision/digest, never prefixes or whole-table deletion.
            table = PlanningCatalogEntry.__table__
            for identity, digest in catalog_ids:
                try:
                    delete_catalog_fixture(sa, db.session, table, identity, entry_id, digest)
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                    failures.append("Captured synthetic catalog cleanup failed; no broader deletion attempted")
        return failures

    try:
        with app.app_context():
            require(not PlanningCatalogEntry.query.filter_by(entry_id=entry_id).count(), "Synthetic catalog ID collision")
            accounts = [User(email=f"shopping-pg-{tag}-{index}@example.test", password_hash="synthetic-not-a-login") for index in range(2)]
            db.session.add_all(accounts)
            db.session.flush()
            users.extend((user.id, user.email) for user in accounts)
            headers.extend({"Authorization": "Bearer " + create_access_token(identity=str(identity))} for identity, _ in users)
            variants = []
            for variant, amount in (("small", "110.000"), ("large", "100.000")):
                variants.append({"id": variant, "base_servings": 1, "languages": {"en": {
                    "title": "Synthetic shopping example, not culinary guidance", "ingredients": [
                        {"ingredient_id": "synthetic-pasta", "form": "dry", "unit": "g", "amount": amount,
                         "label": "Synthetic pasta", "category": "cupboard", "purchase_mode": "measured"},
                        {"ingredient_id": "synthetic-salt", "form": "dry", "unit": "taste", "amount": None,
                         "label": "Synthetic salt", "category": "herbs", "purchase_mode": "check_cupboard"}]}}})
            sync_catalog([{"entry_id": entry_id, "revision": 1, "kind": "planning_example", "availability": "published",
                           "content": {"schema_version": 2, "recipe": None, "variants": variants}}])
            db.session.flush()
            fixture = PlanningCatalogEntry.query.filter_by(entry_id=entry_id, revision=1).one()
            catalog_ids.append((fixture.id, fixture.content_digest))
            db.session.commit()

        plan_payload = {"name": "Synthetic complete shopping", "start_date": "2026-09-13", "end_date": "2026-09-22"}
        plan = command("plan.create", plan_payload)["plan"]
        command("plan.create", plan_payload, account=1)
        foreign_before = export(1)
        meal = command("meal.create", {"plan_id": plan["id"], "date": "2026-09-13"})["meal"]
        destination = command("meal.create", {"plan_id": plan["id"], "date": "2026-09-22"})["meal"]
        occasion = command("event.create", {"name": "Synthetic distant occasion", "date": "2026-09-18", "guests": 6})["event"]
        selection = {"kind": "dish", "entry_id": entry_id, "catalog_revision": 1, "language": "en", "options": {"variant_id": "small"}}
        first = command("item.create", {**selection, "parent_type": "meal", "parent_id": meal["id"], "servings": 2})["item"]
        second = command("item.create", {**selection, "options": {"variant_id": "large"}, "parent_type": "event", "parent_id": occasion["id"]})["item"]
        command("event.link", {"plan_id": plan["id"], "event_id": occasion["id"]})
        scope = command("shopping.scope", {"owner_type": "plan", "owner_id": plan["id"], "mode": "all"})["scope_id"]
        row = pasta(scope)
        require(Decimal(row["required"]) == 820, "Complete projection must include 220 + distant-event 600")
        command("shopping.cover", coverage(scope, row, first["id"]))
        require(Decimal(pasta(scope)["remaining"]) == 600, "Dish check covered another source")
        command("shopping.extra", {"scope_id": scope, "row_key": row["key"], "amount": "100.000"})
        require(Decimal(pasta(scope)["total"]) == 920, "Intentional extra is not separate")
        command("shopping.cover", coverage(scope, row, second["id"], "have"))
        require(Decimal(pasta(scope)["remaining"]) == 100, "Extra was implicitly covered")
        salt = next(r for r in rows(scope) if r.get("ingredient_id") == "synthetic-salt")
        require(salt["required"] is None and salt["state"] == "unchecked", "Cupboard demand must remain qualitative")
        command("shopping.cover", coverage(scope, salt, first["id"], "have"))
        command("shopping.personal.create", {"scope_id": scope, "title": "Synthetic bag", "amount": "1.000", "unit": "piece"})
        dated = command("shopping.scope", {"owner_type": "plan", "owner_id": plan["id"], "mode": "dates",
            "start_date": "2026-09-13", "end_date": "2026-09-13"})["scope_id"]
        empty = command("shopping.scope", {"owner_type": "plan", "owner_id": plan["id"], "mode": "meals", "selection": []})["scope_id"]
        require(Decimal(pasta(dated)["remaining"]) == 220 and rows(empty) == [], "Scopes shared checks or empty expanded")
        chosen = command("shopping.scope", {"owner_type": "plan", "owner_id": plan["id"], "mode": "meals",
            "selection": ["meal:" + meal["id"], "event:" + occasion["id"]]})["scope_id"]
        require(Decimal(pasta(chosen)["remaining"]) == 820, "Explicit selection is incomplete or shares coverage")
        event_scope = command("shopping.scope", {"owner_type": "event", "owner_id": occasion["id"], "mode": "all"})["scope_id"]
        require(Decimal(pasta(event_scope)["remaining"]) == 600, "Standalone event scope shares coverage")
        template = command("template.save", {"parent_type": "meal", "parent_id": meal["id"], "name": "Synthetic template"})["template_id"]
        summaries = get("/templates")["templates"]
        require(any(t["id"] == template for t in summaries) and all("blueprint" not in t for t in summaries), "Template list leaked blueprint")
        applied = command("template.apply", {"template_id": template, "parent_type": "meal", "parent_id": destination["id"]})
        require(len(applied["created_item_ids"]) == 1 and first["id"] not in applied["created_item_ids"], "Template reused source identity")
        pref = get("/preferences")
        command("preferences.update", {"expected_revision": pref["preference_revision"],
            "changes": {"shopping_layout": "dish", "shopping_scope_id": scope}})
        saved_pref = get("/preferences")
        require(saved_pref["preference_revision"] == pref["preference_revision"] + 1
                and saved_pref["revision"] == pref["revision"] and saved_pref["preferences"]["shopping_layout"] == "dish"
                and saved_pref["preferences"]["shopping_scope_id"] == scope, "Preference save/read or revision isolation failed")
        assert_private_export(export(), scope, template)

        # Restore a covered baseline before increase/decrease; do not read between writes.
        command("shopping.cover", coverage(scope, pasta(scope), first["id"]))
        command("item.update", {"item_id": first["id"], "servings": 4})
        command("item.update", {"item_id": first["id"], "servings": 2})
        require(pasta(scope)["state"] == "review", "Review was not persisted through increase/decrease")

        # Distinct commands at one baseline: exactly one wins, the loser changes nothing.
        left = body("shopping.extra", {"scope_id": scope, "row_key": row["key"], "amount": "110.000"})
        right = {**left, "mutation_id": str(uuid4()), "payload": {**left["payload"], "amount": "120.000"}}
        before = export()
        competed = race([left, right])
        require(sorted(status for status, _ in competed) == [200, 409], "Distinct revision competitors must produce one success and one conflict")
        winner = next(index for index, (status, _) in enumerate(competed) if status == 200)
        require(pasta(scope)["extra"] == [left, right][winner]["payload"]["amount"], "Losing command overwrote winner")
        require(len(export()["mutations"]) == len(before["mutations"]) + 1, "Race retained more than one receipt")
        request("GET", base + "/mutations/" + [left, right][1-winner]["mutation_id"], statuses=(404,))
        replay = body("shopping.extra", {"scope_id": scope, "row_key": row["key"], "amount": "130.000"})
        before = export()
        repeated = race([replay, replay])
        require(repeated[0][0] == repeated[1][0] == 200 and repeated[0] == repeated[1], "Exact concurrent retry differs")
        after = export()
        require(after["workspace"]["revision"] == before["workspace"]["revision"] + 1
                and len(after["mutations"]) == len(before["mutations"]) + 1, "Exact retry wrote twice")

        # Source edit versus check: losing intent requires an explicit fresh submission.
        command("shopping.cover", coverage(scope, pasta(scope), first["id"], "needed"))
        change = body("item.update", {"item_id": first["id"], "servings": 3})
        check = {**change, "mutation_id": str(uuid4()), "operation": "shopping.cover",
                 "payload": coverage(scope, pasta(scope), first["id"])}
        competed = race([change, check])
        require(sorted(status for status, _ in competed) == [200, 409], "Source/check race did not reject stale baseline")
        current = next(source for source in pasta(scope)["sources"] if source["item_id"] == first["id"])
        if competed[0][0] == 200:
            require(Decimal(current["amount"]) == 330 and current["state"] == "needed", "Stale check covered changed demand")
        else:
            require(Decimal(current["amount"]) == 220 and current["state"] == "bought", "Stale source edit overwrote purchase")
            command("item.update", change["payload"])
            require(pasta(scope)["state"] == "review", "Rebased source increase lost coverage review")

        # Fail after the command's final flush, including reconciliation and receipt.
        def fail_commit(session):
            session.flush()
            raise sa.exc.OperationalError("synthetic-postflush", {}, Exception("synthetic-private-detail"))
        for operation, payload, success in (("item.update", {"item_id": first["id"], "servings": 4}, 200),
                ("shopping.scope", {"owner_type": "plan", "owner_id": plan["id"], "mode": "dates",
                                    "start_date": "2026-09-19", "end_date": "2026-09-19"}, 201)):
            failure_body = body(operation, payload)
            before_failure = export()
            with patch("sqlalchemy.orm.Session.commit", new=fail_commit):
                _, failure = request("POST", base + "/commands", failure_body, statuses=(503,))
            require(failure["code"] == "planning_unavailable" and "synthetic-private-detail" not in str(failure), "Failure was not sanitized")
            require(export() == before_failure, "Failure left source/scope/revision/receipt residue")
            request("GET", base + "/mutations/" + failure_body["mutation_id"], statuses=(404,))
            request("POST", base + "/commands", failure_body, statuses=(success,))

        # Raw SQL must reject foreign-workspace owners, independently of ORM hooks.
        with app.app_context():
            other_workspace = PlanningWorkspace.query.filter_by(user_id=users[1][0]).one().id
            scope_table = next(table for table in tables if table.name == "private_shopping_scopes")
            db.session.rollback()
            for identity in (scope, event_scope):
                original = db.session.execute(sa.select(scope_table).where(scope_table.c.id == identity)).mappings().one()
                values = {**original, "id": str(uuid4()), "workspace_id": other_workspace,
                          "selection_digest": hashlib.sha256(uuid4().bytes).hexdigest()}
                try:
                    db.session.execute(sa.insert(scope_table).values(**values))
                    db.session.flush()
                except sa.exc.IntegrityError as error:
                    require(getattr(error.orig, "pgcode", None) == "23503", "Expected PostgreSQL composite FK violation")
                else:
                    raise RuntimeError("SQL accepted a scope attached to another workspace's owner")
                finally:
                    db.session.rollback()
            before_downgrade = fingerprint(sa, engine, tables)
            downgrade_refusal(sa, engine)
            require(fingerprint(sa, engine, tables) == before_downgrade, "Downgrade refusal changed table rows")

        for account, envelope, status, saved in acknowledgements:
            current_before = export(account)
            require(request("POST", base + "/commands", envelope, account, (status,))[1] == saved, "Historical acknowledgement replay changed")
            require(export(account) == current_before, "Acknowledgement replay reapplied changes")
            receipt = get("/mutations/" + envelope["mutation_id"], account)
            require(receipt["result"] == saved and receipt["status_code"] == status, "Receipt lookup differs from replay")
            require(not {"rows", "blueprint", "ingredients", "method"}.intersection(saved), "Receipt retained projection")
        require(export(1) == foreign_before, "Foreign fixture account changed")
        assert_private_export(export(), scope, template)
    finally:
        try:
            cleanup_failures = cleanup()
        finally:
            with app.app_context():
                db.session.remove()
                try:
                    require(fingerprint(sa, engine, tables) == baseline, "Public table row hashes differ after exact fixture cleanup")
                finally:
                    engine.dispose()
        require(not cleanup_failures, "; ".join(cleanup_failures))
    print("PASS: PostgreSQL shopping/template/preference API, complete demand, isolation, races, exact retry, atomic rollback and composite FK")
    print("PASS: populated downgrade refused; all 36 public table row hashes/head match baseline after scoped cleanup")
    print("LIMIT: no backup/restore, old-backend recovery, sequence restoration or physical-device claim")


def worker(env=None):
    from verify_postgres import engine_url, load_database_tools
    urls = guard(os.environ if env is None else env)
    clean = isolated_env(os.environ if env is None else env, urls)
    os.environ.clear()
    os.environ.update(clean)
    try:
        require("app" not in sys.modules, "Worker requires a fresh process before app import")
        sa = load_database_tools()
        os.environ["DATABASE_URL"] = engine_url(sa, urls[0]).render_as_string(hide_password=False)
        sys.path.insert(0, str(ROOT))
        import dotenv
        dotenv.load_dotenv = lambda *args, **kwargs: False
        from app import app, db
        exercise(sa, app, db)
        return 0
    except Exception as error:
        # Errors from SQLAlchemy can embed existing row values; never print them.
        print("FAILED: shopping PostgreSQL checks (" + type(error).__name__ + "); no raw SQL or private values logged")
        import traceback
        for frame in traceback.extract_tb(error.__traceback__)[-4:]:
            print(f"  at {Path(frame.filename).name}:{frame.lineno} ({frame.name})")
        return 1


def main(env=None, argv=None):
    env = os.environ if env is None else env
    argv = sys.argv[1:] if argv is None else argv
    if argv in (["--check-populated-upgrade"], ["--resume-empty-x1b"]):
        resume = argv == ["--resume-empty-x1b"]
        try:
            urls = resume_guard(env) if resume else upgrade_guard(env)
        except Refused as error:
            print("REFUSED: " + str(error))
            return 2
        bootstrap = "import runpy,sys; sys.exit(runpy.run_path(sys.argv[1])['upgrade_worker'](" + ("resume=True" if resume else "") + "))"
        return captured_run([sys.executable, "-I", "-B", "-X", "utf8", "-c", bootstrap, str(Path(__file__).resolve())],
                            upgrade_environment(env, urls), urls, timeout=240)
    if argv == ["--check-guards"]:
        valid = {CONFIRM_KEY: CONFIRM_VALUE, URL_KEY: "postgresql://synthetic:synthetic@localhost:55432/cookbook_test_fresh"}
        guard(valid)
        for invalid in ({}, {**valid, CONFIRM_KEY: "yes"}, {**valid, URL_KEY: valid[URL_KEY].replace("55432", "55433")}):
            try:
                guard(invalid)
            except Refused:
                continue
            raise RuntimeError("Unsafe target accepted")
        require(not {"app", "sqlalchemy", "psycopg2"}.intersection(sys.modules), "Pure guard imported database/application code")
        print("PASS: pure shopping target guards; no database imports/connections")
        return 0
    if argv:
        print("REFUSED: no target overrides or execution flags supported")
        return 2
    try:
        urls = guard(env)
    except Refused as error:
        print("REFUSED: " + str(error))
        return 2
    bootstrap = "import runpy,sys; sys.exit(runpy.run_path(sys.argv[1])['worker']())"
    return captured_run([sys.executable, "-I", "-B", "-X", "utf8", "-c", bootstrap, str(Path(__file__).resolve())],
                        isolated_env(env, urls), urls, timeout=240)


if __name__ == "__main__":
    sys.exit(main())
