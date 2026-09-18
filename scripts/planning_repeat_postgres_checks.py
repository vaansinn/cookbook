"""Opt-in PostgreSQL repeat evidence on the already migrated disposable fresh DB.

Run ONLY after the coordinator releases the restore worker's fresh snapshot.
Requires verify_postgres's exact fresh/history URLs on localhost:55432 and
COOKBOOK_TEST_POSTGRES_CONFIRM=disposable-local-test-databases. Both URLs are
validated before importing application/database code; only fresh is connected.
No migration, schema creation, catalog publication, service control or reset.

Uses UUID-tagged synthetic accounts and the verifier's existing published
sql-fixture catalog selection read-only. Removes only the captured account IDs,
then compares all public table rows and migration head with the initial snapshot.
Normal PostgreSQL sequence allocation is not reset. stdout never prints secrets,
tokens, raw SQL or existing rows. --check-guards exercises only pure validation.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def guard(env):
    """Pure, fail-closed validation: no app, driver or connection imports."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from verify_postgres import validate_targets
    return validate_targets(env)


def check_guards():
    from verify_postgres import Refused
    valid = {
        "COOKBOOK_TEST_POSTGRES_CONFIRM": "disposable-local-test-databases",
        "COOKBOOK_TEST_DATABASE_URL": "postgresql://synthetic:synthetic@localhost:55432/cookbook_test_fresh",
        "COOKBOOK_TEST_HISTORY_URL": "postgresql://synthetic:synthetic@localhost:55432/cookbook_test_history",
    }
    guard(valid)
    rejected = [dict(valid, COOKBOOK_TEST_POSTGRES_CONFIRM=""),
                {k: v for k, v in valid.items() if k != "COOKBOOK_TEST_HISTORY_URL"}]
    for suffix in ("@127.0.0.1:55432/cookbook_test_fresh", "@localhost:5432/cookbook_test_fresh",
                   "@localhost:55432/cookbook", "@localhost:55432/cookbook_test_fresh?sslmode=disable",
                   "@localhost:55432/cookbook_test_recovery_source"):
        rejected.append(dict(valid, COOKBOOK_TEST_DATABASE_URL="postgresql://synthetic:synthetic" + suffix))
    for env in rejected:
        try:
            guard(env)
        except Refused:
            continue
        raise RuntimeError("Target guard accepted an unsafe or unconfirmed target")
    if "app" in sys.modules or "sqlalchemy" in sys.modules or "psycopg2" in sys.modules:
        raise RuntimeError("Pure target guard imported application/database code")
    print("PASS: pure repeat target guards; no database/application imported or connected")
    return 0


def fingerprint(sa, engine, tables):
    """Read every public table in one snapshot; return only counts and hashes."""
    result = {}
    with engine.connect().execution_options(isolation_level="REPEATABLE READ") as connection:
        connection.execute(sa.text("SET TRANSACTION READ ONLY"))
        for table in tables:
            rows = sorted(json.dumps(dict(row), sort_keys=True, default=str, ensure_ascii=True)
                          for row in connection.execute(sa.select(table)).mappings())
            result[table.fullname] = (len(rows), hashlib.sha256(json.dumps(rows).encode()).hexdigest())
    return result


def exercise(sa, app, db):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from uuid import uuid4
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from flask_jwt_extended import create_access_token
    from models import User
    from planning_models import (PlanningWorkspace, PrivatePlan, PrivateMeal, PrivateEvent,
                                 PrivateEventLink, PrivatePreparationTask, PlanningMutation,
                                 PlanningPreview, PlanningUndo, delete_private_planning)
    from planning_item_models import PrivatePlannedItem
    from planning_catalog_models import PlanningCatalogEntry
    from routes import planning
    from verify_postgres import require

    app.config["TESTING"] = True
    with app.app_context():
        engine = db.engine
        require(engine.dialect.name == "postgresql", "PostgreSQL required; no SQLite fallback")
        with engine.connect() as connection:
            connection.execute(sa.text("SET TRANSACTION READ ONLY"))
            require(connection.execute(sa.text("SELECT current_database()")).scalar_one() == "cookbook_test_fresh",
                    "Connected target differs from the guarded fresh database")
            require(connection.execute(sa.text("SELECT inet_server_port()")).scalar_one() == 55432,
                    "Connected PostgreSQL port is unexpected")
            config = Config()
            config.set_main_option("script_location", str(ROOT / "migrations"))
            expected = set(ScriptDirectory.from_config(config).get_heads())
            actual = set(connection.execute(sa.text("SELECT version_num FROM public.alembic_version")).scalars())
            require(actual == expected, "Fresh schema is not at the current migration head; no migration will be run")
            metadata = sa.MetaData()
            metadata.reflect(bind=connection, schema="public", views=False)
            require("public.private_planned_items" in metadata.tables, "Migrated item table missing")
        fixture = PlanningCatalogEntry.query.filter_by(entry_id="sql-fixture", revision=1).first()
        require(fixture is not None and fixture.availability == "published" and fixture.kind == "recipe",
                "Verifier's existing published synthetic catalog fixture is required")
        require(fixture.content["variants"][0]["languages"]["en"]["title"] == "Synthetic SQL fixture",
                "Existing catalog fixture is not the expected synthetic content")
        db.session.rollback()
        tables = sorted(metadata.tables.values(), key=lambda table: table.fullname)
        baseline = fingerprint(sa, engine, tables)

    base = "/api/planning/v1"
    tag = uuid4().hex
    captured = []
    headers = []
    models = (PlanningWorkspace, PrivatePlan, PrivateMeal, PrivateEvent, PrivateEventLink,
              PrivatePreparationTask, PrivatePlannedItem, PlanningMutation, PlanningPreview, PlanningUndo)

    def request(method, path, *, account=0, body=None, status=200):
        with app.test_client() as client:
            response = client.open(path, method=method, json=body, headers=headers[account])
            require(response.status_code == status, f"Unexpected HTTP status for {method} {path.split('/')[-1]}")
            require("no-store" in response.headers.get("Cache-Control", ""), "Private response lacks no-store")
            return response.get_json()

    def command_body(operation, payload, account=0):
        revision = request("GET", base + "/workspace", account=account)["revision"]
        return {"operation": operation, "payload": payload, "mutation_id": str(uuid4()),
                "expected_workspace_revision": revision}

    def command(operation, payload, account=0, status=201):
        body = command_body(operation, payload, account)
        result = request("POST", base + "/commands", account=account, body=body, status=status)
        require(result["revision"] == body["expected_workspace_revision"] + 1, "Command revision did not advance once")
        return result

    def export(account=0):
        return request("GET", "/api/auth/me/export", account=account)["private_planning"]

    def clean_accounts():
        failures = []
        for account, (identity, email) in enumerate(captured):
            with app.app_context():
                db.session.rollback()
                row = db.session.get(User, identity)
                if row is None:
                    continue
                require(row.email == email, "Cleanup account identity no longer matches this run")
                db.session.rollback()
            try:
                request("DELETE", "/api/auth/me", account=account)
            except Exception:
                # Cleanup of this run's captured IDs remains mandatory even if
                # the account endpoint itself is the failed assertion.
                with app.app_context():
                    db.session.rollback()
                    row = db.session.get(User, identity)
                    if row is not None:
                        require(row.email == email, "Cleanup identity changed")
                        delete_private_planning(identity)
                        db.session.delete(row)
                        db.session.commit()
                failures.append(identity)
        require(not failures, "Account HTTP cleanup failed; exact synthetic IDs were cleaned by lifecycle helper")

    try:
        with app.app_context():
            users = [User(email=f"repeat-pg-{tag}-{index}@example.test", password_hash="synthetic-not-a-login")
                     for index in range(2)]
            db.session.add_all(users)
            db.session.flush()
            captured.extend((user.id, user.email) for user in users)
            headers.extend({"Authorization": "Bearer " + create_access_token(identity=str(identity))}
                           for identity, _ in captured)
            db.session.commit()
        payload = {"name": "Synthetic repeat source", "start_date": "2026-09-13", "end_date": "2026-09-19"}
        source = command("plan.create", payload)["plan"]
        foreign = command("plan.create", payload, account=1)["plan"]
        meals = [command("meal.create", {"plan_id": source["id"], "date": day})["meal"]
                 for day in ("2026-09-13", "2026-09-19")]
        occasion = command("event.create", {"name": "Synthetic outside occasion", "date": "2026-09-24",
                            "guests": 4, "time": "18:00"})["event"]
        command("event.link", {"plan_id": source["id"], "event_id": occasion["id"]})
        task = command("task.create", {"event_id": occasion["id"], "bucket": "earlier", "text": "Synthetic prep"})["task"]
        command("task.update", {"task_id": task["id"], "done": True}, status=200)
        command("item.create", {"parent_type": "meal", "parent_id": meals[0]["id"], "kind": "personal",
                                "title": "Synthetic bread", "quantity": "1.125", "unit": "loaf"})
        command("item.create", {"parent_type": "meal", "parent_id": meals[1]["id"], "kind": "note", "title": "Synthetic note"})
        dish = {"parent_type": "event", "parent_id": occasion["id"], "kind": "dish", "entry_id": "sql-fixture",
                "catalog_revision": 1, "language": "en", "options": {"variant_id": "test"}, "group": "Synthetic group"}
        command("item.create", dish)
        command("item.create", {**dish, "servings": 3, "contribution": "Synthetic guest"})
        command("item.create", {"parent_type": "event", "parent_id": occasion["id"], "kind": "personal",
                                "title": "Synthetic contribution", "quantity": "2", "unit": "piece", "contribution": "Synthetic guest"})
        source_before, foreign_before = export(), export(1)
        repeat = command_body("plan.copy", {"plan_id": source["id"], "name": "Synthetic repeat", "start_date": "2026-09-20"})
        barrier = Barrier(2)
        def concurrent_repeat():
            barrier.wait(timeout=10)
            return request("POST", base + "/commands", body=repeat, status=201)
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(concurrent_repeat) for _ in range(2)]
            results = [future.result(timeout=40) for future in futures]
        require(results[0] == results[1], "Concurrent repeat replay returned different identities/results")
        result = results[0]
        require(result["counts"] == {"plans": 1, "meals": 2, "events": 1, "links": 1, "tasks": 1, "items": 5},
                "Repeat aggregate counts differ")
        copied = result["plan"]
        require(copied["end_date"] == "2026-09-26" and copied["id"] != source["id"], "Plan range/identity not independently shifted")
        links = request("GET", base + f'/plans/{copied["id"]}/events')["links"]
        require(len(links) == 1 and not links[0]["in_range"] and links[0]["event"]["date"] == "2026-10-01"
                and links[0]["event_id"] != occasion["id"], "Outside linked event was moved/reused or shifted incorrectly")
        after = export()
        require(len(after["mutations"]) == len(source_before["mutations"]) + 1, "Repeat race duplicated receipts")
        for key in ("plans", "meals", "events", "event_links", "preparation_tasks", "items"):
            current = {row["id"]: row for row in after[key]}
            require(all(current[row["id"]] == row for row in source_before[key]), "Repeat mutated an original domain record")
        require(all(not row["done"] for row in after["preparation_tasks"] if row["event_id"] == links[0]["event_id"]),
                "Repeat copied completed preparation checks")
        require(export(1) == foreign_before, "Repeat touched the other synthetic account")

        # Real PostgreSQL, not fixture SQLite, rejects cross-workspace children.
        with app.app_context():
            own_workspace = PlanningWorkspace.query.filter_by(user_id=captured[0][0]).one().id
            foreign_workspace = PlanningWorkspace.query.filter_by(user_id=captured[1][0]).one().id
            db.session.rollback()
            invalid = [PrivateEventLink(workspace_id=foreign_workspace, plan_id=foreign["id"], event_id=links[0]["event_id"]),
                       PrivatePlannedItem(workspace_id=foreign_workspace, event_id=links[0]["event_id"],
                                          kind="note", title="Synthetic rejected FK", position=90, follows_guests=False)]
            for row in invalid:
                db.session.add(row)
                try:
                    db.session.flush()
                except sa.exc.IntegrityError as error:
                    require(getattr(error.orig, "pgcode", None) == "23503", "Expected actual PostgreSQL foreign-key violation")
                else:
                    raise RuntimeError("PostgreSQL accepted a cross-workspace child")
                finally:
                    db.session.rollback()
        failed = command_body("plan.copy", {"plan_id": source["id"], "name": "Synthetic rollback", "start_date": "2026-10-01"})
        before_failure = export()
        apply_command = planning.apply_command
        def fail_after_flush(*args):
            apply_command(*args)
            raise sa.exc.OperationalError("synthetic-repeat", {}, Exception("synthetic-private-detail"))
        with patch.object(planning, "apply_command", side_effect=fail_after_flush):
            failure = request("POST", base + "/commands", body=failed, status=503)
        require(failure["code"] == "planning_unavailable" and "synthetic-private-detail" not in str(failure), "Failure not sanitized")
        require(export() == before_failure, "Failed repeat left domain, revision or receipt residue")
        request("GET", base + "/mutations/" + failed["mutation_id"], status=404)
        request("POST", base + "/commands", body=failed, status=201)
        independent = command("event.copy", {"event_id": occasion["id"], "name": "Synthetic standalone repeat", "date": "2027-01-01"})
        copied_event = independent["event"]
        require(independent["counts"] == {"plans": 0, "meals": 0, "events": 1, "links": 0, "tasks": 1, "items": 3},
                "Standalone repeat counts differ")
        event_export = export()
        require(not any(link["event_id"] == copied_event["id"] for link in event_export["event_links"]), "Standalone repeat inherited links")
        originals = sorted((row for row in source_before["items"] if row["event_id"] == occasion["id"]), key=lambda row: row["position"])
        copies = sorted((row for row in event_export["items"] if row["event_id"] == copied_event["id"]), key=lambda row: row["position"])
        require(len(copies) == len(originals), "Standalone repeat lost menu entries")
        for original, cloned in zip(originals, copies):
            require(cloned["id"] != original["id"] and cloned == {**original, "id": cloned["id"], "event_id": copied_event["id"]},
                    "Standalone copy lost options, Decimal servings, contribution or independent identity")
        require(request("POST", base + "/commands", body=repeat, status=201) == result, "Historical repeat replay reapplied changes")
        request("DELETE", "/api/auth/me")
        request("GET", base + "/workspace", status=401)
        with app.app_context():
            require(db.session.get(User, captured[0][0]) is None, "Deleted synthetic account remains")
            for model in models:
                query = model.query.filter_by(id=own_workspace) if model is PlanningWorkspace else model.query.filter_by(workspace_id=own_workspace)
                require(query.count() == 0, "Account deletion retained a repeat dependency")
        require(export(1) == foreign_before, "Account deletion changed the other account")
    finally:
        try:
            clean_accounts()
        finally:
            with app.app_context():
                db.session.remove()
                require(fingerprint(sa, engine, tables) == baseline, "Public table rows differ from pre-run baseline after scoped cleanup")
                engine.dispose()
    print("PASS: migrated PostgreSQL repeat graph, concurrent replay, foreign FK, full rollback, standalone event copy and account deletion")
    print("PASS: all public table rows and migration head restored to baseline; only run-owned synthetic accounts removed")


def worker():
    urls = guard(os.environ)
    from verify_postgres import isolated_env, engine_url, load_database_tools, redact
    clean = isolated_env(os.environ, urls)
    os.environ.clear()
    os.environ.update(clean)
    try:
        if "app" in sys.modules:
            raise RuntimeError("Run in a fresh isolated process before any app import")
        sa = load_database_tools()
        os.environ["DATABASE_URL"] = engine_url(sa, urls[0]).render_as_string(hide_password=False)
        sys.path.insert(0, str(ROOT))
        import dotenv
        dotenv.load_dotenv = lambda *args, **kwargs: False
        from app import app, db
        exercise(sa, app, db)
        return 0
    except Exception as error:
        print("FAILED: " + redact(str(error), urls))
        import traceback
        for frame in traceback.extract_tb(error.__traceback__)[-4:]:
            print(f"  at {Path(frame.filename).name}:{frame.lineno} ({frame.name})")
        return 1


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    if sys.argv[1:] == ["--check-guards"]:
        return check_guards()
    from verify_postgres import Refused, isolated_env, captured_run
    if sys.argv[1:]:
        print("REFUSED: no target overrides or execution flags are supported")
        return 2
    try:
        urls = guard(os.environ)
    except Refused as error:
        print("REFUSED: " + str(error))
        return 2
    bootstrap = "import runpy,sys; sys.exit(runpy.run_path(sys.argv[1])['worker']())"
    return captured_run([sys.executable, "-I", "-B", "-X", "utf8", "-c", bootstrap, str(Path(__file__).resolve())],
                        isolated_env(os.environ, urls), urls, timeout=180)


if __name__ == "__main__":
    sys.exit(main())
