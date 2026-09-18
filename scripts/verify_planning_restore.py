"""Opt-in local recovery rehearsal. Never reset/drop a database or write to fresh.

fresh -> empty recovery_source clone -> synthetic fixture -> empty restored.
Only stdlib imports until the exact targets and explicit confirmation are checked.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DATABASES = ("cookbook_test_fresh", "cookbook_test_recovery_source", "cookbook_test_restored")
URL_KEYS = ("COOKBOOK_TEST_DATABASE_URL", "COOKBOOK_TEST_RECOVERY_SOURCE_URL", "COOKBOOK_TEST_RESTORED_URL")
CONFIRM_KEY = "COOKBOOK_TEST_RESTORE_CONFIRM"
CONFIRM_VALUE = "verifier-finished-synthetic-clone-and-restore"
RESUME_KEY = "COOKBOOK_TEST_RESTORE_RESUME"
RESUME_VALUE = "verified-pristine-clone"
OS_KEYS = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"}
RUNTIME = ROOT / ".local/postgres-runtime/pgsql/bin"
PATTERN = re.compile(r"postgresql(?:\+psycopg2)?://(?P<user>(?:[A-Za-z0-9_.~-]|%[0-9A-Fa-f]{2})+)"
                     r":(?P<password>(?:[A-Za-z0-9_.~-]|%[0-9A-Fa-f]{2})+)"
                     r"@localhost:55432/(?P<database>cookbook_test_(?:fresh|recovery_source|restored))")


class Refused(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Refused(message)


def validate_targets(env):
    require(env.get(CONFIRM_KEY) == CONFIRM_VALUE, "Explicit finished-verifier/synthetic-recovery confirmation required")
    require(env.get(RESUME_KEY) in (None, RESUME_VALUE), "Unknown recovery resume mode")
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
    if env.get(RESUME_KEY) == RESUME_VALUE:
        clean[RESUME_KEY] = RESUME_VALUE
    clean.update({CONFIRM_KEY: CONFIRM_VALUE, "FLASK_ENV": "development", "FLASK_SKIP_DOTENV": "1",
                  "PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8",
                  "JWT_SECRET_KEY": "synthetic-restore-rehearsal-only-not-real-accounts"})
    return clean


def pg_env(env, urls, url, *, readonly=False):
    require(url in urls, "Unknown subprocess database")
    parts = urlsplit(url)
    clean = isolated_env(env, urls)
    # No URL/password in argv; remove every inherited libpq option/passfile.
    clean.update(PGHOST="localhost", PGHOSTADDR="127.0.0.1", PGPORT="55432",
                 PGDATABASE=parts.path[1:], PGUSER=unquote(parts.username), PGPASSWORD=unquote(parts.password),
                 PGPASSFILE=os.devnull, PGSERVICEFILE=os.devnull, PGCONNECT_TIMEOUT="5",
                 PGOPTIONS="-c statement_timeout=60000 -c lock_timeout=5000 -c search_path=public"
                           + (" -c default_transaction_read_only=on" if readonly else ""))
    return clean


def run_process(command, env, *, stage, timeout=120):
    try:
        result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True,
                                text=True, encoding="utf-8", errors="replace", timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise Refused(f"{stage} unavailable/timed out; retain targets for inspection") from None
    # SQL/connection errors may contain private rows or credentials. Never echo them.
    if result.returncode and stage == "Recovery worker":
        # Our worker prints only controlled stage summaries. Still redact every
        # configured raw/decoded credential before forwarding its diagnostics.
        output = result.stdout
        for key in URL_KEYS:
            url = env[key]
            parts = urlsplit(url)
            for secret in (url, parts.username, parts.password, unquote(parts.username), unquote(parts.password)):
                output = output.replace(secret, "[REDACTED]")
        print(output, end="")
    require(result.returncode == 0, f"{stage} failed; retain targets for inspection")
    return result.stdout


def discover_runtime(env):
    binaries = {name: RUNTIME / (name + (".exe" if os.name == "nt" else "")) for name in ("pg_dump", "pg_restore")}
    for name, path in binaries.items():
        require(path.is_file() and path.resolve().parent == RUNTIME.resolve(), "Bundled PostgreSQL client binary missing")
        version = run_process([str(path), "--version"], env, stage="PostgreSQL client version")
        require(re.search(r"\(PostgreSQL\) 16\.", version) is not None, "PostgreSQL 16 client binaries required")
    return binaries


def load_database_tools():
    # This helper is stdlib-only on import; reuse the existing pinned SQL URL builder.
    sys.path.insert(0, str(ROOT / "scripts"))
    from verify_postgres import load_database_tools as load, engine_url
    return load(), engine_url


def identity(sa, connection, name):
    row = connection.execute(sa.text("SELECT current_database(), host(inet_server_addr()), inet_server_port(), current_setting('server_version_num')::int")).one()
    require(row[0] == name and row[1] == "127.0.0.1" and row[2] == 55432 and 160000 <= row[3] < 170000,
            "Unexpected PostgreSQL database/server identity")


def inspect_empty(sa, engine, name):
    with engine.connect() as connection:
        connection.execute(sa.text("SET TRANSACTION READ ONLY"))
        identity(sa, connection, name)
        occupied = connection.execute(sa.text("""
            SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%')
            OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname NOT IN ('pg_catalog','information_schema'))
            OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','pg_catalog','information_schema')
                AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp_%')
            OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public')
        """)).scalar_one()
        require(not occupied, f"{name} must be empty; no reset is provided")


def preflight(sa, engines):
    """Read-only barrier across ALL existing targets before creation or restore."""
    with engines[0].connect() as connection:
        connection.execute(sa.text("SET TRANSACTION READ ONLY"))
        identity(sa, connection, DATABASES[0])
        names = set(connection.execute(sa.text("SELECT datname FROM pg_database")).scalars())
        users = connection.execute(sa.text("SELECT email, password_hash FROM users ORDER BY id")).all()
        require(users == [("private-planning-1@example.test", "synthetic-not-a-login")],
                "Source must be the completed synthetic planning verifier fixture")
        require(connection.execute(sa.text("SELECT count(*) FROM planning_workspaces")).scalar_one() == 1,
                "Unexpected source workspace count")
        require(connection.execute(sa.text("SELECT count(*) FROM planning_mutations")).scalar_one() == 3,
                "Unexpected source receipts")
    missing = []
    for engine, name in zip(engines[1:], DATABASES[1:]):
        if name == DATABASES[1] and os.environ.get(RESUME_KEY) == RESUME_VALUE:
            require(name in names, "Pristine clone resume requires an existing clone")
            # Its complete snapshot must match fresh before ANY creation or write.
            continue
        if name in names:
            inspect_empty(sa, engine, name)
        else:
            missing.append(name)
    return missing


def canonical_constraint(definition):
    # PostgreSQL 16 pg_dump/reparse distributes an array's varchar->text cast
    # onto its literal elements. Normalize ONLY that exact equivalent form;
    # retain every column, operator, literal, bound, validation flag and FK.
    pattern = r"\(\(ARRAY\[((?:'[^']*'::character varying)(?:, '[^']*'::character varying)*)\]\)::text\[\]\)"
    return re.sub(pattern, lambda match: "(ARRAY[" + ", ".join("(" + item + ")::text" for item in match[1].split(", ")) + "])", definition)


def create_missing(sa, source, names):
    require(set(names) <= set(DATABASES[1:]), "Database creation target refused")
    for name in names:
        # Fixed allowlist; never interpolate caller-supplied SQL identifiers.
        with source.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            identity(sa, connection, DATABASES[0])
            connection.execute(sa.text(f'CREATE DATABASE "{name}" TEMPLATE template0'))
        print(f"Created empty {name} on 127.0.0.1:55432", flush=True)


def snapshot(sa, engine):
    """Exact public-table values plus constraints/indexes/columns and sequence state.

    No row contents leave memory or appear in logs. Sequence reads don't call nextval.
    """
    with engine.connect().execution_options(isolation_level="REPEATABLE READ") as connection:
        connection.execute(sa.text("SET TRANSACTION READ ONLY"))
        tables = sa.inspect(connection).get_table_names(schema="public")
        quote = connection.dialect.identifier_preparer.quote_identifier
        rows, columns = {}, {}
        for table in sorted(tables):
            values = connection.execute(sa.text(f'SELECT to_jsonb(t) FROM public.{quote(table)} AS t')).scalars()
            rows[table] = sorted(json.dumps(value, sort_keys=True, separators=(",", ":")) for value in values)
            columns[table] = [tuple(row) for row in connection.execute(sa.text("""
                SELECT column_name, data_type, is_nullable, column_default, numeric_precision, numeric_scale
                FROM information_schema.columns WHERE table_schema='public' AND table_name=:name ORDER BY ordinal_position
            """), {"name": table})]
        constraints = [(row[0], row[1], canonical_constraint(row[2])) for row in connection.execute(sa.text("""
            SELECT c.relname, k.conname, pg_get_constraintdef(k.oid) FROM pg_constraint k
            JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' ORDER BY c.relname,k.conname
        """))]
        indexes = [tuple(row) for row in connection.execute(sa.text("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname"))]
        sequences = {}
        for row in connection.execute(sa.text("SELECT sequencename,start_value,min_value,max_value,increment_by,cycle,cache_size FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")):
            state = connection.execute(sa.text(f'SELECT last_value,is_called FROM public.{quote(row[0])}')).one()
            sequences[row[0]] = (*tuple(row[1:]), *tuple(state))
        return {"rows": rows, "columns": columns, "constraints": constraints, "indexes": indexes, "sequences": sequences}


def same_snapshot(expected, actual, stage):
    require(expected == actual, f"{stage}: rows/schema/sequences differ")


def archive_roundtrip(sa, engines, urls, binaries, source_index, target_index, archive):
    require((source_index, target_index) in {(0, 1), (1, 2)}, "Restore direction refused")
    before = snapshot(sa, engines[source_index])
    run_process([str(binaries["pg_dump"]), "--format=custom", "--no-owner", "--no-privileges", "--file", str(archive)],
                pg_env(os.environ, urls, urls[source_index], readonly=True), stage="pg_dump")
    same_snapshot(before, snapshot(sa, engines[source_index]), "Source changed during dump")
    # Recheck immediately before restore; no --clean, --create or schema-only copy.
    inspect_empty(sa, engines[target_index], DATABASES[target_index])
    run_process([str(binaries["pg_restore"]), "--dbname", DATABASES[target_index], "--no-owner", "--no-privileges",
                 "--exit-on-error", "--single-transaction", str(archive)],
                pg_env(os.environ, urls, urls[target_index]), stage="pg_restore")
    same_snapshot(before, snapshot(sa, engines[target_index]), "Restored snapshot")
    return before


def load_app(sa, engine_url, url, urls):
    require(url in urls[1:], "Application writes may only target the clone or restore")
    os.environ["DATABASE_URL"] = engine_url(sa, url).render_as_string(hide_password=False)
    sys.path.insert(0, str(ROOT))
    import dotenv
    dotenv.load_dotenv = lambda *args, **kwargs: False
    from app import create_app, db
    app = create_app()
    app.config["TESTING"] = True
    with app.app_context():
        identity(sa, db.session.connection(), urlsplit(url).path[1:])
        db.session.rollback()
    return app, db


def seed_fixture(sa, engine_url, urls):
    """Only seed the disposable clone, never the completed verifier source."""
    from datetime import datetime
    from uuid import uuid4
    app, db = load_app(sa, engine_url, urls[1], urls)
    from models import User
    from planning_catalog import sync_catalog
    from planning_models import PlanningPreview, PlanningUndo
    from flask_jwt_extended import create_access_token
    expired = datetime(2000, 1, 1, 0, 0, 0)
    with app.app_context():
        user = User(email="planning-recovery@example.test", password_hash="synthetic-not-a-login")
        db.session.add(user)
        sync_catalog([{"entry_id": "restore-fixture", "revision": 1, "kind": "recipe", "availability": "published",
            "content": {"schema_version": 2, "recipe": {"dish_slug": "lentil-bolognese", "level": "basic"},
                "variants": [{"id": "test", "base_servings": 2, "languages": {"en": {
                    "title": "Synthetic restore fixture", "ingredients": [
                        {"ingredient_id": "synthetic", "form": "dry", "unit": "g", "amount": "12.500", "label": "Synthetic ingredient", "category": "cupboard", "purchase_mode": "measured"},
                        {"ingredient_id": "synthetic-seasoning", "form": "dry", "unit": "taste", "amount": None, "label": "Synthetic seasoning", "category": "herbs", "purchase_mode": "check_cupboard"}],
                    "method": ["Synthetic test only."], "equipment": [], "time_min": 1}}}]}}])
        db.session.commit()
        user_id = user.id
        headers = {"Authorization": "Bearer " + create_access_token(identity=str(user_id))}
    revision, first, receipt, shopping_receipt = 0, None, None, None
    with app.test_client() as client:
        def command(operation, payload):
            nonlocal revision, first, receipt, shopping_receipt
            body = {"mutation_id": str(uuid4()), "expected_workspace_revision": revision, "operation": operation, "payload": payload}
            response = client.post("/api/planning/v1/commands", json=body, headers=headers)
            require(response.status_code in (200, 201), "Synthetic fixture command failed")
            revision = response.json["revision"]
            if first is None:
                first, receipt = body, (response.status_code, response.json)
            if operation == "shopping.cover":
                shopping_receipt = (body, response.status_code, response.json)
            return response.json
        plan = command("plan.create", {"name": "Synthetic restore plan", "start_date": "2026-09-13", "end_date": "2026-09-20"})["plan"]
        meal = command("meal.create", {"plan_id": plan["id"], "date": "2026-09-13"})["meal"]
        event = command("event.create", {"name": "Synthetic restore event", "date": "2026-09-14", "guests": 4})["event"]
        command("event.link", {"plan_id": plan["id"], "event_id": event["id"]})
        command("task.create", {"event_id": event["id"], "bucket": "earlier", "text": "Synthetic restore task"})
        item = command("item.create", {"parent_type": "event", "parent_id": event["id"], "kind": "dish", "entry_id": "restore-fixture",
                                      "catalog_revision": 1, "language": "en", "options": {"variant_id": "test"}})["item"]
        copied = command("item.copy", {"item_id": item["id"], "parent_type": "meal", "parent_id": meal["id"]})["item"]
        command("item.create", {"parent_type": "event", "parent_id": event["id"], "kind": "personal", "title": "Synthetic bread", "quantity": "2.125", "unit": "loaf"})
        scope = command("shopping.scope", {"owner_type": "plan", "owner_id": plan["id"], "mode": "all"})["scope_id"]
        command("shopping.scope", {"owner_type": "event", "owner_id": event["id"], "mode": "all"})
        projected = client.get(f"/api/planning/v1/shopping/scopes/{scope}", headers=headers)
        require(projected.status_code == 200, "Synthetic shopping projection failed")
        ingredient = next(row for row in projected.json["rows"] if row["ingredient_id"] == "synthetic")
        command("shopping.extra", {"scope_id": scope, "row_key": ingredient["key"], "amount": "7.500"})
        command("shopping.cover", {"scope_id": scope, "row_key": ingredient["key"], "source_ids": [s["id"] for s in ingredient["sources"] if s["item_id"] == copied["id"]], "include_extra": True, "status": "have"})
        command("shopping.personal.create", {"scope_id": scope, "title": "Synthetic personal addition", "amount": "2", "unit": "loaf"})
        template = command("template.save", {"parent_type": "meal", "parent_id": meal["id"], "name": "Synthetic meal template"})["template_id"]
        command("preferences.update", {"expected_revision": 0, "changes": {"shopping_scope_id": scope, "shopping_layout": "dish", "language": "de", "dark_mode": True}})
        response = client.post("/api/planning/v1/previews", json={"expected_workspace_revision": revision, "operation": "event.delete", "payload": {"event_id": event["id"]}}, headers=headers)
        require(response.status_code == 201, "Synthetic deletion preview failed")
        deleted = command("preview.confirm", {"preview_id": response.json["preview"]["id"]})
        response = client.post("/api/planning/v1/previews", json={"expected_workspace_revision": revision, "operation": "plan.delete", "payload": {"plan_id": plan["id"]}}, headers=headers)
        require(response.status_code == 201, "Synthetic retained preview failed")
        preview_id = response.json["preview"]["id"]
        with app.app_context():
            db.session.get(PlanningPreview, preview_id).expires_at = expired
            db.session.get(PlanningUndo, deleted["undo_id"]).expires_at = expired
            db.session.commit()
        exported = client.get("/api/auth/me/export", headers=headers)
        require(exported.status_code == 200, "Fixture export failed")
    return {"user_id": user_id, "first": first, "receipt": receipt, "revision": revision, "plan_id": plan["id"],
            "item_id": copied["id"], "undo_id": deleted["undo_id"], "preview_id": preview_id,
            "scope_id": scope, "template_id": template, "meal_id": meal["id"], "shopping_receipt": shopping_receipt,
            "export": exported.json["private_planning"]}


def exercise_restore(sa, engine_url, urls, engine, fixture):
    from uuid import uuid4
    app, db = load_app(sa, engine_url, urls[2], urls)
    from flask_jwt_extended import create_access_token
    with app.app_context():
        headers = {"Authorization": "Bearer " + create_access_token(identity=str(fixture["user_id"]))}
    before = snapshot(sa, engine)
    with app.test_client() as client:
        response = client.post("/api/planning/v1/commands", json=fixture["first"], headers=headers)
        require((response.status_code, response.json) == fixture["receipt"], "Old receipt exact retry failed")
        body, status, result = fixture["shopping_receipt"]
        response = client.post("/api/planning/v1/commands", json=body, headers=headers)
        require((response.status_code, response.json) == (status, result), "Shopping receipt retry lost its original acknowledgement")
        for operation, field in (("undo.apply", "undo_id"), ("preview.confirm", "preview_id")):
            response = client.post("/api/planning/v1/commands", json={"mutation_id": str(uuid4()), "operation": operation,
                "expected_workspace_revision": fixture["revision"], "payload": {field: fixture[field]}}, headers=headers)
            require(response.status_code == 409 and response.json["code"] == ("undo_expired" if operation == "undo.apply" else "preview_expired"), "Restore revived an expired token")
        exported = client.get("/api/auth/me/export", headers=headers)
        require(exported.status_code == 200 and exported.json["private_planning"] == fixture["export"], "Restored account export differs")
        projection = client.get(f'/api/planning/v1/items/{fixture["item_id"]}/preview', headers=headers)
        require(projection.status_code == 200 and projection.json["preview"]["ingredients"][0]["amount"] == "25.000", "Restored configured item cannot resolve")
        require(projection.json["preview"]["schema_version"] == 2 and projection.json["preview"]["ingredients"][1]["amount"] is None, "Restored catalog v2 qualitative content changed")
        shopping = client.get(f'/api/planning/v1/shopping/scopes/{fixture["scope_id"]}', headers=headers)
        require(shopping.status_code == 200, "Restored shopping is unavailable")
        ingredient = next(row for row in shopping.json["rows"] if row["ingredient_id"] == "synthetic")
        require(ingredient["required"] == "25.000" and ingredient["extra"] == "7.500" and ingredient["remaining"] == "0.000", "Restored source coverage/extra changed")
        preferences = client.get("/api/planning/v1/preferences", headers=headers)
        require(preferences.status_code == 200 and preferences.json["preferences"]["shopping_layout"] == "dish" and preferences.json["preferences"]["dark_mode"] is True, "Restored SQL preferences changed")
        inherited = [json.loads(raw)["id"] for raw in before["rows"]["private_plans"] if json.loads(raw)["id"] != fixture["plan_id"]]
        require(len(inherited) == 1, "Expected one inherited foreign plan")
        inherited_plan = inherited[0]
        require(client.get(f"/api/planning/v1/plans/{inherited_plan}", headers=headers).status_code == 404, "Restored ownership isolation failed")
        same_snapshot(before, snapshot(sa, engine), "Read/retry/expired rejection mutated restored state")
        body = {"mutation_id": str(uuid4()), "expected_workspace_revision": fixture["revision"], "operation": "plan.rename",
                "payload": {"plan_id": fixture["plan_id"], "name": "Synthetic post-restore write"}}
        response = client.post("/api/planning/v1/commands", json=body, headers=headers)
        require(response.status_code == 200 and response.json["revision"] == fixture["revision"] + 1, "New restored write failed")
        require(client.post("/api/planning/v1/commands", json=body, headers=headers).json == response.json, "New receipt replay failed")
        exported = client.get("/api/auth/me/export", headers=headers)
        require(exported.status_code == 200 and exported.json["private_planning"]["workspace"]["revision"] == fixture["revision"] + 1, "Post-write export failed")
        body = {"mutation_id": str(uuid4()), "expected_workspace_revision": response.json["revision"], "operation": "template.apply",
                "payload": {"template_id": fixture["template_id"], "parent_type": "meal", "parent_id": fixture["meal_id"]}}
        applied = client.post("/api/planning/v1/commands", json=body, headers=headers)
        require(applied.status_code in (200, 201), "Restored template cannot create independent items")
        shopping = client.get(f'/api/planning/v1/shopping/scopes/{fixture["scope_id"]}', headers=headers)
        ingredient = next(row for row in shopping.json["rows"] if row["ingredient_id"] == "synthetic")
        require(ingredient["required"] == "50.000" and ingredient["remaining"] == "25.000", "Restored write did not reconcile new demand independently")
        require(client.post("/api/planning/v1/commands", json=body, headers=headers).json == applied.json, "Restored template receipt duplicated application")
    print("PASS: old/shopping receipt retry, expired undo/preview rejection, catalog-v2 resolution, SQL coverage/extras/preferences, ownership, export and template write/retry", flush=True)


def worker():
    urls = validate_targets(os.environ)
    clean = isolated_env(os.environ, urls)
    os.environ.clear()
    os.environ.update(clean)
    binaries = discover_runtime(clean)
    sa, engine_url = load_database_tools()
    engines = []
    try:
        for url in urls:
            engines.append(sa.create_engine(engine_url(sa, url), poolclass=sa.pool.NullPool))
        missing = preflight(sa, engines)
        # Read head from migration files; no app import or writes at this point.
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        config = Config()
        config.set_main_option("script_location", str(ROOT / "migrations"))
        baseline = snapshot(sa, engines[0])
        versions = {json.loads(row)["version_num"] for row in baseline["rows"]["alembic_version"]}
        require(versions == set(ScriptDirectory.from_config(config).get_heads()), "Source is not at current migration head")
        resume = os.environ.get(RESUME_KEY) == RESUME_VALUE
        if resume:
            with engines[1].connect() as connection:
                connection.execute(sa.text("SET TRANSACTION READ ONLY"))
                identity(sa, connection, DATABASES[1])
            same_snapshot(baseline, snapshot(sa, engines[1]), "Resume requires a pristine clone identical to fresh")
        create_missing(sa, engines[0], missing)
        for engine, name in zip(engines[1:], DATABASES[1:]):
            if not (resume and name == DATABASES[1]):
                inspect_empty(sa, engine, name)
        with tempfile.TemporaryDirectory(prefix="cookbook-synthetic-restore-") as directory:
            archive = Path(directory) / "synthetic.dump"
            if resume:
                print("Resuming verified pristine clone; final restore target is empty", flush=True)
            else:
                archive_roundtrip(sa, engines, urls, binaries, 0, 1, archive)
            fixture = seed_fixture(sa, engine_url, urls)
            retained = archive_roundtrip(sa, engines, urls, binaries, 1, 2, archive)
            print(f"PASS: complete snapshot equality: {len(retained['rows'])} tables, {len(retained['sequences'])} sequences; rows/IDs/receipts/catalog digests/token timestamps preserved", flush=True)
            exercise_restore(sa, engine_url, urls, engines[2], fixture)
            same_snapshot(retained, snapshot(sa, engines[1]), "Recovery clone changed during restore exercise")
        same_snapshot(baseline, snapshot(sa, engines[0]), "Original fresh source changed")
        print("PASS: fresh source unchanged; recovery_source and restored retained. No migration downgrade/production recovery claim.", flush=True)
        return 0
    finally:
        for engine in engines:
            engine.dispose()


def main(env=None):
    env = os.environ if env is None else env
    try:
        urls = validate_targets(env)
    except Refused as error:
        print("REFUSED: " + str(error))
        return 2
    bootstrap = "import runpy,sys; sys.exit(runpy.run_path(sys.argv[1])['safe_worker']())"
    try:
        output = run_process([sys.executable, "-I", "-B", "-X", "utf8", "-c", bootstrap, str(Path(__file__).resolve())],
                             isolated_env(env, urls), stage="Recovery worker", timeout=600)
        print(output, end="")
        return 0
    except Refused as error:
        print("FAILED: " + str(error))
        return 1


def safe_worker():
    try:
        return worker()
    except Refused as error:
        print("REFUSED: " + str(error), flush=True)
        return 2
    except Exception as error:
        # Never echo driver exceptions, SQL, fixture values or credentials.
        print("FAILED: recovery stage failed; targets retained; no reset attempted", flush=True)
        import traceback
        for frame in traceback.extract_tb(error.__traceback__)[-3:]:
            print(f"  at {Path(frame.filename).name}:{frame.lineno} ({frame.name})", flush=True)
        return 1




if __name__ == "__main__":
    if sys.argv[1:]:
        print("Usage: verify_planning_restore.py (no target/command overrides)")
        sys.exit(2)
    sys.exit(main())
