"""Called only by the guarded verifier, against its dedicated fresh database."""
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from threading import Barrier, get_ident
from unittest.mock import patch
from uuid import uuid4


def run():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from verify_postgres import validate_targets, engine_url, require
    import sqlalchemy as sa
    targets = validate_targets(os.environ)
    expected = engine_url(sa, targets[0]).render_as_string(hide_password=False)
    require(os.environ.get("DATABASE_URL") == expected, "Private planning checks require the exact verified fresh target")
    import dotenv
    dotenv.load_dotenv = lambda *a, **k: False
    from app import app, db
    from models import User, Favorite, MealPlan, MealPlanItem, Household, HouseholdMember, GroceryList, GroceryItem, PlanEntry
    from planning_models import (PlanningWorkspace, PrivatePlan, PrivateMeal, PlanningMutation,
                                 PrivateEvent, PrivateEventLink, PrivatePreparationTask, PlanningPreview, PlanningUndo)
    from planning_item_models import PrivatePlannedItem
    from flask_jwt_extended import create_access_token
    from routes import planning

    app.config["TESTING"] = True
    with app.app_context():
        require(db.engine.dialect.name == "postgresql", "PostgreSQL required")
        require(db.session.execute(sa.text("SELECT current_database()")).scalar_one() == "cookbook_test_fresh", "Unexpected database")
        require(PlanningWorkspace.query.count() == 0 and User.query.count() == 0, "Fresh planning fixture must be empty")
        users = [User(email=f"private-planning-{i}@example.test", password_hash="synthetic-not-a-login") for i in range(2)]
        db.session.add_all(users)
        db.session.commit()
        ids = [u.id for u in users]
        headers = [{"Authorization": "Bearer " + create_access_token(identity=str(i))} for i in ids]

    def body(operation, payload, revision, mutation=None):
        return {"mutation_id": mutation or str(uuid4()), "expected_workspace_revision": revision,
                "operation": operation, "payload": payload}

    def post(command, account=0):
        with app.test_client() as client:
            response = client.post("/api/planning/v1/commands", json=command, headers=headers[account])
            return response.status_code, response.get_json()

    plan_payload = {"name": "Local SQL test", "start_date": "2026-09-13", "end_date": "2026-09-22"}

    def race(commands):
        gate = Barrier(2)
        def send(command):
            gate.wait(timeout=10)
            return post(command)
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(send, c) for c in commands]
            return [f.result(timeout=15) for f in futures]

    # First write races exercise lazy workspace creation as well as receipt lock.
    first = body("plan.create", plan_payload, 0)
    results = race([first, first])
    require(results[0] == results[1] and results[0][0] == 201, "Concurrent retry did not return one recorded result")
    plan_id = results[0][1]["plan"]["id"]
    with app.app_context():
        require(PlanningWorkspace.query.count() == PrivatePlan.query.count() == PlanningMutation.query.count() == 1,
                "Concurrent initial command duplicated records")
    concurrent = [body("plan.rename", {"plan_id": plan_id, "name": name}, 1) for name in ("First", "Second")]
    changed = race(concurrent)
    require(sorted(status for status, _ in changed) == [200, 409], "Concurrent edits did not conflict")
    require(post(first) == results[0], "Stale successful retry changed its saved response")

    original_apply = planning.apply_command
    def fail_after_changes(*args):
        original_apply(*args)
        raise sa.exc.OperationalError("synthetic-private-sql", {}, Exception("synthetic-secret"))
    failed = body("meal.create", {"plan_id": plan_id, "date": "2026-09-13"}, 2)
    with patch.object(planning, "apply_command", side_effect=fail_after_changes):
        status, result = post(failed)
    require(status == 503 and "synthetic-secret" not in str(result), "Failure was not sanitized")
    with app.app_context():
        require(PrivateMeal.query.count() == 0 and PlanningMutation.query.count() == 2
                and PlanningWorkspace.query.one().revision == 2, "Failed transaction left changes")
    status, meal_result = post(failed)
    require(status == 201 and meal_result["revision"] == 3, "Retry after rollback failed")

    other_status, other_result = post(body("plan.create", plan_payload, 0), account=1)
    require(other_status == 201, "Second account did not get independent revision")
    other_id = other_result["plan"]["id"]
    original_workspace = planning.workspace
    def interleaved_workspace():
        owner = original_workspace()
        with ThreadPoolExecutor(max_workers=1) as executor:
            outcome = executor.submit(post, body("plan.rename", {"plan_id": other_id, "name": "After read snapshot"}, 1), 1).result(timeout=10)
        require(outcome[0] == 200, "Interleaving write failed")
        return owner
    with patch.object(planning, "workspace", side_effect=interleaved_workspace), app.test_client() as client:
        snapshot = client.get("/api/planning/v1/plans", headers=headers[1])
        require(snapshot.status_code == 200 and snapshot.json["revision"] == 1
                and snapshot.json["plans"][0]["name"] == plan_payload["name"], "Read mixed old revision with new data")
    with app.test_client() as client:
        latest = client.get("/api/planning/v1/plans", headers=headers[1])
        require(latest.json["revision"] == 2 and latest.json["plans"][0]["name"] == "After read snapshot",
                "Next read did not observe committed data")

    # Export uses the same transaction snapshot, including its receipt list.
    main_thread, interleaved = get_ident(), []
    def during_export(_conn, _cursor, statement, _params, _context, _many):
        if get_ident() == main_thread and not interleaved and "FROM planning_workspaces" in statement:
            interleaved.append(True)
            with ThreadPoolExecutor(max_workers=1) as executor:
                result = executor.submit(post, body("plan.rename", {"plan_id": other_id, "name": "After export snapshot"}, 2), 1).result(timeout=10)
            require(result[0] == 200, "Export interleaving write failed")
    with app.app_context():
        engine = db.engine
    sa.event.listen(engine, "after_cursor_execute", during_export)
    try:
        with app.test_client() as client:
            response = client.get("/api/auth/me/export", headers=headers[1])
            exported_snapshot = response.json["private_planning"]
            require(response.status_code == 200 and interleaved and exported_snapshot["workspace"]["revision"] == 2
                    and exported_snapshot["plans"][0]["name"] == "After read snapshot"
                    and len(exported_snapshot["mutations"]) == 2, "Export mixed concurrent states")
    finally:
        sa.event.remove(engine, "after_cursor_execute", during_export)
    with app.test_client() as client:
        require(client.get(f"/api/planning/v1/plans/{plan_id}", headers=headers[1]).status_code == 404,
                "Cross-account plan disclosure")
    # X1b event/link/item deletion is one transaction, including the undo token.
    status, occasion = post(body("event.create", {"name": "SQL dinner", "date": "2026-09-14", "guests": 4}, 3))
    require(status == 201, "Event creation failed")
    event_id = occasion["event"]["id"]
    require(post(body("event.link", {"plan_id": plan_id, "event_id": event_id}, 4))[0] == 201, "Event link failed")
    require(post(body("task.create", {"event_id": event_id, "bucket": "earlier", "text": "Lay the table"}, 5))[0] == 201, "Task creation failed")
    status, personal = post(body("item.create", {"parent_type": "event", "parent_id": event_id,
                                                "kind": "personal", "title": "Bread", "quantity": "2", "unit": "loaf"}, 6))
    require(status == 201, "Personal item failed")
    # Test-only authored fixture; never published by normal development startup.
    from planning_catalog import sync_catalog
    with app.app_context():
        sync_catalog([{"entry_id": "sql-fixture", "revision": 1, "kind": "recipe", "availability": "published",
            "content": {"schema_version": 1, "recipe": {"dish_slug": "lentil-bolognese", "level": "basic"},
              "variants": [{"id": "test", "base_servings": 2, "languages": {"en": {
                "title": "Synthetic SQL fixture", "ingredients": [{"ingredient_id": "synthetic-lentils", "form": "dry", "unit": "g", "amount": "100"}],
                "method": ["Synthetic test, not cooking instructions."], "equipment": ["Synthetic"], "time_min": 1}}}]}}])
        db.session.commit()
    status, configured = post(body("item.create", {"parent_type": "event", "parent_id": event_id,
        "kind": "dish", "entry_id": "sql-fixture", "catalog_revision": 1, "language": "en", "options": {"variant_id": "test"}}, 7))
    require(status == 201 and configured["item"]["follows_guests"], "Configured event dish failed")
    require(post(body("item.copy", {"item_id": configured["item"]["id"], "parent_type": "meal", "parent_id": meal_result["meal"]["id"]}, 8))[0] == 201,
            "Configured dish copy failed")
    require(post(body("event.update", {"event_id": event_id, "guests": 6}, 9))[0] == 200, "Configured guest update failed")
    with app.test_client() as client:
        projection = client.get(f'/api/planning/v1/items/{configured["item"]["id"]}/preview', headers=headers[0])
        require(projection.status_code == 200 and projection.json["preview"]["ingredients"][0]["amount"] == "300.000",
                "Configured serving projection failed")
    with app.test_client() as client:
        proposal = client.post("/api/planning/v1/previews", headers=headers[0], json={
            "expected_workspace_revision": 10, "operation": "event.delete", "payload": {"event_id": event_id}})
        require(proposal.status_code == 201 and len(proposal.json["preview"]["effects"]["affected"]["items"]) == 2,
                "Preview omitted menu dependencies")
        preview_id = proposal.json["preview"]["id"]
    confirmation = body("preview.confirm", {"preview_id": preview_id}, 10)
    with patch.object(planning, "apply_command", side_effect=fail_after_changes):
        require(post(confirmation)[0] == 503, "Injected removal failure did not fail")
    with app.app_context():
        require(PrivateEvent.query.count() == PrivateEventLink.query.count() == PrivatePreparationTask.query.count() == 1 and PrivatePlannedItem.query.count() == 3
                and PlanningUndo.query.count() == 0 and PlanningPreview.query.count() == 1,
                "Removal failure left partial dependency/inverse changes")
    confirmations = race([confirmation, confirmation])
    require(confirmations[0] == confirmations[1] and confirmations[0][0] == 200, "Concurrent confirmations duplicated effects")
    with app.app_context():
        require(PrivateEvent.query.count() == PrivateEventLink.query.count() == PrivatePreparationTask.query.count() == 0 and PrivatePlannedItem.query.count() == 1,
                "Confirmed deletion retained event dependencies")
    status, restored = post(body("undo.apply", {"undo_id": confirmations[0][1]["undo_id"]}, 11))
    require(status == 200 and restored["revision"] == 12, "Exact-successor event undo failed")
    require(post(confirmation) == confirmations[0], "Old confirmation replay repeated deletion after undo")
    with app.app_context():
        require(PrivateEvent.query.count() == PrivateEventLink.query.count() == PrivatePreparationTask.query.count() == 1 and PrivatePlannedItem.query.count() == 3,
                "Undo did not restore exact event dependency records")
    with app.app_context():
        owner = PlanningWorkspace.query.filter_by(user_id=ids[0]).one()
        other = PlanningWorkspace.query.filter_by(user_id=ids[1]).one()
        owner_id, other_workspace = owner.id, other.id
        invalid_records = [
            (PrivateEventLink, dict(workspace_id=other_workspace, plan_id=other_id, event_id=event_id)),
            (PrivatePreparationTask, dict(workspace_id=other_workspace, event_id=event_id, bucket="day", text="Invalid FK", done=False, position=20)),
            (PrivatePlannedItem, dict(workspace_id=other_workspace, meal_id=meal_result["meal"]["id"], kind="note", title="Invalid FK", position=20, follows_guests=False)),
            (PrivatePlannedItem, dict(workspace_id=owner_id, event_id=event_id, kind="personal", title="Invalid null quantity", unit="g", quantity=None, position=20, follows_guests=False)),
        ]
        for value in (None, "1.500"):
            invalid_records.append((PrivatePlannedItem, dict(workspace_id=owner_id, event_id=event_id, kind="dish", entry_id="sql-fixture", catalog_revision=1,
                language="en", options={"variant_id": "test"}, servings=value, position=20, follows_guests=False)))
        for model, fields in invalid_records:
            db.session.add(model(**fields))
            try:
                db.session.flush()
            except sa.exc.IntegrityError:
                db.session.rollback()
            else:
                raise RuntimeError("Migrated PostgreSQL accepted an invalid item/link/task constraint")
        # PostgreSQL itself rejects a correctly formed but cross-owner meal FK.
        db.session.add(PrivateMeal(workspace_id=other.id, plan_id=plan_id, date=date(2026,9,13), position=50))
        try:
            db.session.flush()
        except sa.exc.IntegrityError:
            db.session.rollback()
        else:
            raise RuntimeError("Composite owner FK accepted a foreign plan")
        db.session.add(Favorite(user_id=ids[0], dish_slug="lentil-bolognese"))
        legacy = MealPlan(user_id=ids[0], name="Legacy retained until account deletion")
        legacy.items.append(MealPlanItem(dish_slug="lentil-bolognese", level="basic"))
        household = Household(name="Synthetic shared household")
        db.session.add_all([legacy, household])
        db.session.flush()
        db.session.add_all([HouseholdMember(household_id=household.id, user_id=i) for i in ids])
        shopping = GroceryList(household_id=household.id)
        db.session.add(shopping)
        db.session.flush()
        shared = GroceryItem(list_id=shopping.id, text="Keep shared bread", added_by=ids[0])
        entry = PlanEntry(household_id=household.id, date="2026-09-13", dish_slug="lentil-bolognese", level="basic", added_by=ids[0])
        db.session.add_all([shared, entry])
        db.session.commit()
        shared_id, entry_id = shared.id, entry.id
    with app.test_client() as client:
        exported = client.get("/api/auth/me/export", headers=headers[0])
        require(exported.status_code == 200 and len(exported.json["private_planning"]["meals"]) == 1,
                "Private planning export missing")
        require(client.delete("/api/auth/me", headers=headers[0]).status_code == 200, "Account deletion failed")
        require(client.get("/api/planning/v1/workspace", headers=headers[0]).status_code == 401, "Deleted account still authorized")
    with app.app_context():
        require(PlanningWorkspace.query.count() == PrivatePlan.query.count() == 1 and PlanningMutation.query.count() == 3,
                "Deletion left private data or removed the other account")
        require(PrivateMeal.query.count() == Favorite.query.count() == MealPlan.query.count() == 0,
                "Deletion left personal records")
        require(all(model.query.count() == 0 for model in (PrivateEvent, PrivateEventLink, PrivatePreparationTask,
                    PrivatePlannedItem, PlanningUndo, PlanningPreview)), "Deletion left private event/confirmation data")
        require(db.session.get(GroceryItem, shared_id).text == "Keep shared bread"
                and db.session.get(GroceryItem, shared_id).added_by is None
                and db.session.get(PlanEntry, entry_id).added_by is None, "Shared content/attribution handling failed")
    print("PASS: PostgreSQL planning retry/revision races, consistent reads/export, atomic removal/undo, events/items, ownership FK, deletion and legacy coexistence")


if __name__ == "__main__":
    run()
