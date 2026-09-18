"""Shopping integration through real Flask routes, with synthetic in-memory SQL.

Run directly with python -B tests/backend/test_planning_shopping_integration.py.
The environment is sanitized before importing the app; dotenv is disabled.
No development database, prototype import, network, or migration is exercised.
Missing route integration is a failure, never a skipped acceptance gate.
"""
import copy
from decimal import Decimal
import json
import os
import sys
import unittest
from unittest.mock import patch
from uuid import uuid4

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(__file__))
from helpers import auth_header, make_tier, make_user

BASE = "/api/planning/v1"
D = Decimal


class ShoppingIntegrationTest(unittest.TestCase):
    def setUp(self):
        allowed = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"}
        env = {k: v for k, v in os.environ.items() if k.upper() in allowed}
        env.update(FLASK_SKIP_DOTENV="1", FLASK_ENV="development", DATABASE_URL="sqlite:///:memory:",
                   JWT_SECRET_KEY="synthetic-shopping-integration-key-123456789")
        self.environment = patch.dict(os.environ, env, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)
        import dotenv
        self.dotenv = patch.object(dotenv, "load_dotenv", return_value=False)
        self.dotenv.start()
        self.addCleanup(self.dotenv.stop)
        from app import create_app, db
        from sqlalchemy import event
        self.app, self.db = create_app(), db
        self.app.config["TESTING"] = True
        with self.app.app_context():
            self.assertEqual(db.engine.url.database, ":memory:")
            event.listen(db.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
            db.create_all()
            self.assertEqual(db.session.execute(db.text("PRAGMA foreign_keys")).scalar(), 1)
            self.uid = make_user(db, email="shopping-integration@example.com").id
            self.other_uid = make_user(db, email="other-shopping-integration@example.com").id
        self.client = self.app.test_client()
        self.headers = auth_header(self.app, self.uid)
        self.other_headers = auth_header(self.app, self.other_uid)
        self.addCleanup(self.close_database)

    def close_database(self):
        with self.app.app_context():
            self.db.session.remove()
            self.db.engine.dispose()

    def response(self, response, status=200):
        self.assertEqual(response.status_code, status, response.get_data(as_text=True))
        self.assertIn("no-store", response.headers.get("Cache-Control", ""))
        return response.get_json()

    def get(self, path, headers=None):
        return self.client.get(BASE + path, headers=self.headers if headers is None else headers)

    def revision(self, headers=None):
        return self.response(self.get("/workspace", headers))["revision"]

    def body(self, operation, payload, headers=None):
        return {"operation": operation, "payload": payload, "mutation_id": str(uuid4()),
                "expected_workspace_revision": self.revision(headers)}

    def post(self, body, headers=None):
        return self.client.post(BASE + "/commands", json=body,
                                headers=self.headers if headers is None else headers)

    def command(self, operation, payload, headers=None):
        body = self.body(operation, payload, headers)
        response = self.post(body, headers)
        self.assertIn(response.status_code, (200, 201), response.get_data(as_text=True))
        result = self.response(response, response.status_code)
        expected = body["expected_workspace_revision"] + (operation != "preferences.update")
        self.assertEqual(result["revision"], expected)
        return result

    def preview(self, operation, payload):
        body = self.body(operation, payload)
        del body["mutation_id"]
        return self.response(self.client.post(BASE + "/previews", json=body, headers=self.headers), 201)["preview"]

    def remove(self, operation, payload):
        preview = self.preview(operation, payload)
        return self.command("preview.confirm", {"preview_id": preview["id"]})

    def snapshot(self):
        with self.app.app_context():
            return {table.name: sorted(json.dumps(dict(row), sort_keys=True, default=str)
                                      for row in self.db.session.execute(table.select()).mappings())
                    for table in self.db.metadata.sorted_tables}

    def reject(self, operation, payload, headers=None, statuses=(400, 404, 409)):
        before = self.snapshot()
        body = self.body(operation, payload, headers)
        response = self.post(body, headers)
        self.assertIn(response.status_code, statuses, response.get_data(as_text=True))
        data = self.response(response, response.status_code)
        self.response(self.get("/mutations/" + body["mutation_id"], headers), 404)
        self.assertEqual(self.snapshot(), before, "rejection must not leave any SQL mutation")
        return data

    def plan(self, headers=None):
        return self.command("plan.create", {"name": "Synthetic ten-day plan", "start_date": "2026-09-13",
                                            "end_date": "2026-09-22"}, headers)["plan"]

    def meal(self, plan, date="2026-09-13", headers=None):
        return self.command("meal.create", {"plan_id": plan["id"], "date": date}, headers)["meal"]

    def occasion(self, date="2026-09-18", guests=6):
        return self.command("event.create", {"name": "Synthetic dinner", "date": date, "guests": guests})["event"]

    @staticmethod
    def ingredient(amount="110.000", unit="g", form="dry", identity="synthetic-pasta", mode="measured"):
        return {"ingredient_id": identity, "form": form, "amount": amount, "unit": unit,
                "label": "Synthetic ingredient", "category": "cupboard", "purchase_mode": mode}

    def publish(self, *, version=2, ingredients=None, level="basic"):
        from planning_catalog import sync_catalog
        entry_id = "synthetic-shopping-" + uuid4().hex
        first = ingredients or [self.ingredient()]
        second = [self.ingredient("100.000")]
        variants = []
        for variant, rows in (("small", first), ("large", second)):
            rows = copy.deepcopy(rows)
            if version == 1:
                rows = [{k: v for k, v in row.items() if k in {"ingredient_id", "form", "unit", "amount"}} for row in rows]
            variants.append({"id": variant, "base_servings": 1, "languages": {"en": {
                "title": "Synthetic QA fixture, not culinary guidance", "ingredients": rows,
                "method": ["Synthetic private method must never appear in command receipts."],
                "equipment": ["Synthetic equipment"], "time_min": 1}}})
        record = {"entry_id": entry_id, "revision": 1, "kind": "recipe", "availability": "published",
                  "content": {"schema_version": version, "recipe": {"dish_slug": entry_id, "level": level}, "variants": variants}}
        with self.app.app_context():
            make_tier(self.db, entry_id, level)
            sync_catalog([record])
            self.db.session.commit()
        return {"kind": "dish", "entry_id": entry_id, "catalog_revision": 1,
                "language": "en", "options": {"variant_id": "small"}}

    def item(self, parent_type, parent, selection, **fields):
        return self.command("item.create", {"parent_type": parent_type, "parent_id": parent["id"],
                                             **selection, **fields})["item"]

    def scope(self, owner, owner_type="plan", mode="all", **fields):
        return self.command("shopping.scope", {"owner_type": owner_type, "owner_id": owner["id"],
                                                "mode": mode, **fields})["scope_id"]

    def projection(self, scope_id):
        return self.response(self.get("/shopping/scopes/" + scope_id))

    def pasta(self, scope_id):
        rows = [row for row in self.projection(scope_id)["rows"]
                if row.get("ingredient_id") == "synthetic-pasta" and row.get("form") == "dry" and row.get("unit") == "g"]
        self.assertEqual(len(rows), 1, rows)
        return rows[0]

    def cover(self, scope_id, row, ids, status="bought", extra=False):
        return self.command("shopping.cover", {"scope_id": scope_id, "row_key": row["key"],
                            "source_ids": self.source_ids(row, ids), "status": status, "include_extra": extra})

    def source_ids(self, row, item_ids):
        # Allocation IDs are opaque transport values, not necessarily item UUIDs.
        sources = [source["id"] for source in row["sources"] if source["item_id"] in item_ids]
        self.assertEqual({source["item_id"] for source in row["sources"] if source["item_id"] in item_ids}, set(item_ids))
        return sources

    def extra(self, scope_id, row, amount="100.000"):
        return self.command("shopping.extra", {"scope_id": scope_id, "row_key": row["key"], "amount": amount})

    def standard(self):
        selection = self.publish()
        plan = self.plan()
        meal = self.meal(plan)
        occasion = self.occasion()
        first = self.item("meal", meal, selection, servings=2)
        second = self.item("event", occasion, {**selection, "options": {"variant_id": "large"}})
        self.command("event.link", {"plan_id": plan["id"], "event_id": occasion["id"]})
        return plan, meal, occasion, first, second, self.scope(plan)

    def test_complete_projection_and_separate_source_extra_coverage(self):
        plan, meal, occasion, first, second, scope = self.standard()
        row = self.pasta(scope)
        self.assertEqual(D(row["required"]), 820, "event is beyond the three-visible-day frontend page")
        self.cover(scope, row, [first["id"]])
        self.assertEqual(D(self.pasta(scope)["remaining"]), 600)
        self.extra(scope, row)
        self.assertEqual(D(self.pasta(scope)["total"]), 920)
        self.cover(scope, row, [second["id"]], "have")
        self.assertEqual(D(self.pasta(scope)["remaining"]), 100)
        self.cover(scope, row, [], "have", extra=True)
        self.assertEqual(D(self.pasta(scope)["remaining"]), 0)
        saved = self.response(self.get(f'/meals/{meal["id"]}/items'))["items"][0]
        self.assertEqual(D(saved["servings"]), 2)

    def test_canonical_empty_date_and_event_scopes_never_share_checks(self):
        plan, meal, occasion, first, second, whole = self.standard()
        self.cover(whole, self.pasta(whole), [first["id"], second["id"]])
        dates = self.scope(plan, mode="dates", start_date="2026-09-13", end_date="2026-09-13")
        event_scope = self.scope(occasion, owner_type="event")
        empty = self.scope(plan, mode="meals", selection=[])
        self.assertEqual(D(self.pasta(dates)["remaining"]), 220)
        self.assertEqual(D(self.pasta(event_scope)["remaining"]), 600)
        self.assertEqual(self.projection(empty)["rows"], [])
        self.assertEqual(self.scope(plan, mode="dates", start_date="2026-09-13", end_date="2026-09-13"), dates)
        self.assertEqual(self.scope(plan), whole)
        selection = ["event:" + occasion["id"], "meal:" + meal["id"]]
        chosen = self.scope(plan, mode="meals", selection=selection)
        self.assertEqual(self.scope(plan, mode="meals", selection=list(reversed(selection))), chosen)
        self.assertEqual(D(self.pasta(chosen)["required"]), 820)

    def test_event_deduplication_contribution_and_outside_range_exclusions(self):
        plan, meal, occasion, first, second, scope = self.standard()
        self.command("event.link", {"plan_id": plan["id"], "event_id": occasion["id"]})
        self.assertEqual(D(self.pasta(scope)["required"]), 820)
        self.command("item.update", {"item_id": second["id"], "contribution": "Guest brings this"})
        self.assertEqual(D(self.pasta(scope)["required"]), 220)
        self.command("item.update", {"item_id": second["id"], "contribution": None})
        self.command("event.update", {"event_id": occasion["id"], "date": "2026-10-01"})
        self.assertEqual(D(self.pasta(scope)["required"]), 220)
        standalone = self.scope(occasion, owner_type="event")
        self.assertEqual(D(self.pasta(standalone)["required"]), 600)

    def test_sticky_review_is_written_on_item_guest_and_extra_changes_without_intermediate_reads(self):
        _, _, occasion, first, second, scope = self.standard()
        row = self.pasta(scope)
        for operation, bigger, smaller in (
            ("item.update", {"item_id": first["id"], "servings": 4}, {"item_id": first["id"], "servings": 2}),
            ("event.update", {"event_id": occasion["id"], "guests": 8}, {"event_id": occasion["id"], "guests": 6}),
            ("shopping.extra", {"scope_id": scope, "row_key": row["key"], "amount": "200.000"},
             {"scope_id": scope, "row_key": row["key"], "amount": "100.000"}),
        ):
            with self.subTest(operation=operation):
                self.extra(scope, row)
                self.cover(scope, row, [first["id"], second["id"]], extra=True)
                self.command(operation, bigger)
                self.command(operation, smaller)
                before = self.snapshot()
                self.assertEqual(self.pasta(scope)["state"], "review")
                self.assertEqual(self.snapshot(), before, "GET must not persist reconciliation")

    def test_removed_source_does_not_regain_coverage_but_explicit_undo_does(self):
        _, _, _, first, second, scope = self.standard()
        row = self.pasta(scope)
        self.cover(scope, row, [first["id"]])
        removed = self.remove("item.delete", {"item_id": first["id"]})
        self.assertEqual(D(self.pasta(scope)["remaining"]), 600)
        self.command("undo.apply", {"undo_id": removed["undo_id"]})
        self.assertEqual(D(self.pasta(scope)["remaining"]), 600)
        self.command("item.update", {"item_id": first["id"], "contribution": "Someone brings it"})
        self.command("item.update", {"item_id": first["id"], "contribution": None})
        self.assertEqual(D(self.pasta(scope)["remaining"]), 820)

    def test_orphan_extra_survives_deleting_all_recipe_sources(self):
        _, _, _, first, second, scope = self.standard()
        row = self.pasta(scope)
        self.extra(scope, row)
        self.cover(scope, row, [], "have", extra=True)
        for item in (first, second):
            self.remove("item.delete", {"item_id": item["id"]})
        orphan = self.pasta(scope)
        self.assertEqual(D(orphan["required"]), 0)
        self.assertEqual(D(orphan["extra"]), 100)
        self.assertEqual(D(orphan["total"]), 100)
        self.assertEqual(D(orphan["remaining"]), 0)

    def test_lost_response_replays_bounded_receipt_without_projection_or_catalog(self):
        _, _, _, first, _, scope = self.standard()
        body = self.body("shopping.cover", {"scope_id": scope, "row_key": self.pasta(scope)["key"],
                         "source_ids": self.source_ids(self.pasta(scope), [first["id"]]), "status": "bought", "include_extra": False})
        response = self.post(body)
        saved = self.response(response)
        before = self.snapshot()
        replay = self.post(body)
        self.assertEqual(replay.get_data(), response.get_data())
        self.assertEqual(self.response(replay), saved)
        receipt = self.response(self.get("/mutations/" + body["mutation_id"]))
        self.assertEqual(receipt["result"], saved)
        self.assertLess(len(json.dumps(receipt)), 4096)
        self.assertNotIn("Synthetic private method", json.dumps(receipt))
        self.assertNotIn('"ingredients"', json.dumps(receipt))
        self.assertNotIn('"rows"', json.dumps(receipt))
        self.assertEqual(self.snapshot(), before)
        changed = copy.deepcopy(body)
        changed["payload"]["status"] = "have"
        self.assertEqual(self.response(self.post(changed), 409)["code"], "mutation_conflict")

    def test_receipt_flush_failure_rolls_back_coverage_and_can_retry_same_mutation(self):
        from sqlalchemy import event
        from sqlalchemy.exc import SQLAlchemyError
        from planning_models import PlanningMutation
        _, _, _, first, _, scope = self.standard()
        body = self.body("shopping.cover", {"scope_id": scope, "row_key": self.pasta(scope)["key"],
                         "source_ids": self.source_ids(self.pasta(scope), [first["id"]]), "status": "bought", "include_extra": False})
        before = self.snapshot()
        fired = []
        def fail_receipt(mapper, connection, target):
            if target.mutation_id == body["mutation_id"]:
                fired.append(True)
                raise SQLAlchemyError("Synthetic receipt flush failure")
        event.listen(PlanningMutation, "before_insert", fail_receipt)
        try:
            self.response(self.post(body), 503)
        finally:
            event.remove(PlanningMutation, "before_insert", fail_receipt)
        self.assertEqual(fired, [True])
        self.assertEqual(self.snapshot(), before)
        self.response(self.get("/mutations/" + body["mutation_id"]), 404)
        self.response(self.post(body))
        self.assertEqual(D(self.pasta(scope)["remaining"]), 600)

    def test_foreign_scope_source_and_invalid_selection_rejections_are_atomic(self):
        plan, _, _, first, _, scope = self.standard()
        for path in ("/shopping/scopes/" + scope,):
            self.response(self.get(path, self.other_headers), 404)
        self.reject("shopping.extra", {"scope_id": scope, "row_key": self.pasta(scope)["key"], "amount": "100"}, self.other_headers, (404,))
        foreign_plan = self.plan(self.other_headers)
        foreign_meal = self.meal(foreign_plan, headers=self.other_headers)
        foreign = self.reject("shopping.scope", {"owner_type": "plan", "owner_id": foreign_plan["id"], "mode": "all"})
        missing = self.reject("shopping.scope", {"owner_type": "plan", "owner_id": str(uuid4()), "mode": "all"})
        self.assertEqual(foreign["code"], missing["code"], "foreign and missing roots must be equally opaque")
        for fields in ({"mode": "meals", "selection": ["meal:" + foreign_meal["id"]]},
                       {"mode": "dates", "start_date": "2026-09-12", "end_date": "2026-09-13"},
                       {"mode": "all", "selection": []}):
            self.reject("shopping.scope", {"owner_type": "plan", "owner_id": plan["id"], **fields})
        self.reject("shopping.cover", {"scope_id": scope, "row_key": self.pasta(scope)["key"],
                    "source_ids": [str(uuid4())], "status": "bought", "include_extra": False})

    def test_catalog_v1_is_not_rewritten_when_v2_is_published(self):
        from planning_catalog_models import PlanningCatalogEntry
        selection = self.publish(version=1)
        with self.app.app_context():
            row = PlanningCatalogEntry.query.filter_by(entry_id=selection["entry_id"], revision=1).one()
            before = (copy.deepcopy(row.content), row.content_digest, row.availability)
        self.publish(version=2)
        with self.app.app_context():
            row = PlanningCatalogEntry.query.filter_by(entry_id=selection["entry_id"], revision=1).one()
            self.assertEqual((row.content, row.content_digest, row.availability), before)
        plan = self.plan()
        meal = self.meal(plan)
        self.item("meal", meal, selection, servings=2)
        self.assertEqual(D(self.pasta(self.scope(plan))["required"]), 220)

    def test_identity_form_and_compatible_units_only_with_cupboard_details(self):
        ingredients = [self.ingredient("100.000"), self.ingredient("0.500", "kg"),
                       self.ingredient("50.000", form="cooked"), self.ingredient("30.000", "ml"),
                       self.ingredient("0.020", "l"), self.ingredient("40.000", identity="another-food"),
                       self.ingredient("1.000", "tsp", identity="synthetic-salt", mode="check_cupboard"),
                       self.ingredient(None, "taste", identity="synthetic-salt", mode="check_cupboard")]
        plan = self.plan()
        meal = self.meal(plan)
        dish = self.item("meal", meal, self.publish(ingredients=ingredients), servings=1)
        scope = self.scope(plan)
        rows = self.projection(scope)["rows"]
        self.assertEqual(D(self.pasta(scope)["required"]), 600)
        volumes = [r for r in rows if r["ingredient_id"] == "synthetic-pasta" and r["unit"] == "ml"]
        self.assertEqual(len(volumes), 1)
        self.assertEqual(D(volumes[0]["required"]), 50)
        self.assertEqual(len([r for r in rows if r["form"] == "cooked"]), 1)
        self.assertEqual(len([r for r in rows if r["ingredient_id"] == "another-food"]), 1)
        cupboard = [r for r in rows if r["ingredient_id"] == "synthetic-salt"]
        self.assertEqual(len(cupboard), 1, "measured and to-taste salt share one cupboard checklist row")
        salt = cupboard[0]
        self.assertIsNone(salt["total"])
        self.assertEqual({s["unit"] for s in salt["sources"]}, {"taste", "tsp"})
        self.cover(scope, salt, [dish["id"]], "have")
        self.assertEqual(next(r for r in self.projection(scope)["rows"] if r["key"] == salt["key"])["state"], "have")
        self.reject("shopping.extra", {"scope_id": scope, "row_key": salt["key"], "amount": "1.000"}, statuses=(400,))
        self.assertEqual(D(self.pasta(scope)["remaining"]), 600)

    def test_personal_additions_never_merge_by_title_and_delete_undo_restores_coverage(self):
        _, _, _, _, _, scope = self.standard()
        first = self.command("shopping.personal.create", {"scope_id": scope, "title": "Synthetic ingredient", "amount": "2.000", "unit": "pack"})
        second = self.command("shopping.personal.create", {"scope_id": scope, "title": "Synthetic ingredient", "amount": "2.000", "unit": "pack"})
        self.assertNotEqual(first["item_id"], second["item_id"])
        rows = self.projection(scope)["rows"]
        row = next(r for r in rows if r.get("personal_id") == first["item_id"])
        self.cover(scope, row, [], "bought", extra=True)
        before = self.projection(scope)["rows"]
        removed = self.remove("shopping.personal.delete", {"scope_id": scope, "item_id": first["item_id"]})
        self.assertFalse(any(r.get("personal_id") == first["item_id"] for r in self.projection(scope)["rows"]))
        self.command("undo.apply", {"undo_id": removed["undo_id"]})
        self.assertEqual(self.projection(scope)["rows"], before)
        self.command("shopping.personal.update", {"scope_id": scope, "item_id": first["item_id"],
                     "title": "Changed personal addition", "amount": "2.000", "unit": "pack"})
        changed = next(r for r in self.projection(scope)["rows"] if r.get("personal_id") == first["item_id"])
        self.assertEqual(changed["state"], "needed")
        self.assertEqual(D(self.pasta(scope)["required"]), 820)

    def test_selected_meal_move_requires_review_and_inverse_restores_entire_scope(self):
        plan, meal, _, first, _, _ = self.standard()
        target = self.plan()
        scope = self.scope(plan, mode="meals", selection=["meal:" + meal["id"]])
        row = self.pasta(scope)
        self.extra(scope, row)
        self.cover(scope, row, [first["id"]], extra=True)
        addition = self.command("shopping.personal.create", {"scope_id": scope, "title": "Keep this addition", "amount": "2", "unit": "bottle"})
        before = self.projection(scope)
        move = {"meal_id": meal["id"], "plan_id": target["id"], "date": "2026-09-18"}
        rejected = self.reject("meal.move", move, statuses=(409,))
        self.assertEqual(rejected["code"], "shopping_preview_required")
        preview = self.preview("meal.move", move)
        captured = next(r for r in preview["effects"]["affected"]["shopping_scopes"] if r["id"] == scope)
        self.assertIn(addition["item_id"], json.dumps(captured))
        self.assertIn("100.000", json.dumps(captured))
        self.assertEqual(self.projection(scope), before, "proposal creates no domain mutation")
        confirmed = self.command("preview.confirm", {"preview_id": preview["id"]})
        self.response(self.get("/shopping/scopes/" + scope), 404)
        self.command("undo.apply", {"undo_id": confirmed["undo_id"]})
        restored = self.projection(scope)
        self.assertEqual(restored["scope"], before["scope"])
        self.assertEqual(restored["rows"], before["rows"])
        self.assertEqual(self.response(self.get(f'/plans/{plan["id"]}/meals'))["meals"][0]["id"], meal["id"])

    def test_preferences_keep_domain_undo_and_use_independent_revision_and_receipt(self):
        _, _, _, first, _, scope = self.standard()
        deleted = self.remove("item.delete", {"item_id": first["id"]})
        initial = self.response(self.get("/preferences"))
        payload = {"expected_revision": initial["preference_revision"], "changes": {
            "shopping_layout": "dish", "shopping_scope_id": scope, "language": "de", "dark_mode": True}}
        body = self.body("preferences.update", payload)
        result = self.response(self.post(body))
        self.assertEqual(result["revision"], deleted["revision"])
        self.assertEqual(result["preference_revision"], initial["preference_revision"] + 1)
        self.assertEqual(self.response(self.post(body)), result)
        after = self.response(self.get("/preferences"))
        self.assertEqual(after["preferences"], {**initial["preferences"], **payload["changes"]})
        self.command("undo.apply", {"undo_id": deleted["undo_id"]})
        self.assertEqual(self.response(self.get("/preferences"))["preferences"], after["preferences"])
        self.reject("preferences.update", payload, statuses=(409,))

    def test_menu_template_applies_independently_with_guest_follow_and_override_without_tasks_or_checks(self):
        selection = self.publish()
        source = self.occasion(guests=6)
        follower = self.item("event", source, selection)
        override = self.item("event", source, selection, servings=4)
        self.command("task.create", {"event_id": source["id"], "text": "Synthetic reminder", "bucket": "earlier"})
        source_scope = self.scope(source, owner_type="event")
        self.cover(source_scope, self.pasta(source_scope), [follower["id"], override["id"]])
        self.extra(source_scope, self.pasta(source_scope))
        saved = self.command("template.save", {"parent_type": "event", "parent_id": source["id"], "name": "Independent menu"})
        blueprint = next(t for t in self.response(self.get("/templates"))["templates"] if t["id"] == saved["template_id"])
        self.assertTrue({"date", "tasks", "event_links", "shopping_scopes"}.isdisjoint(blueprint))
        self.command("item.update", {"item_id": override["id"], "servings": 9})
        target = self.occasion(guests=3)
        before = self.response(self.get(f'/events/{source["id"]}/items'))["items"]
        body = self.body("template.apply", {"template_id": saved["template_id"], "parent_type": "event", "parent_id": target["id"]})
        applied = self.response(self.post(body), 201)
        self.assertEqual(self.response(self.post(body), 201), applied)
        items = self.response(self.get(f'/events/{target["id"]}/items'))["items"]
        self.assertEqual(len(items), 2)
        self.assertTrue({i["id"] for i in items}.isdisjoint({follower["id"], override["id"]}))
        self.assertEqual(sorted(D(i["servings"]) for i in items), [D(3), D(4)])
        self.assertEqual(self.response(self.get(f'/events/{target["id"]}/tasks'))["tasks"], [])
        self.assertEqual(self.response(self.get(f'/events/{source["id"]}/items'))["items"], before)
        target_scope = self.scope(target, owner_type="event")
        self.assertEqual(D(self.pasta(target_scope)["remaining"]), 770)
        self.assertEqual(D(self.pasta(target_scope)["extra"]), 0)
        self.reject("template.apply", {"template_id": saved["template_id"], "parent_type": "event", "parent_id": target["id"]}, self.other_headers)

    def test_revoked_catalog_projection_cover_and_template_apply_fail_without_sql_changes(self):
        from planning_catalog import set_availability
        selection = self.publish()
        plan = self.plan()
        meal = self.meal(plan)
        item = self.item("meal", meal, selection, servings=2)
        scope = self.scope(plan)
        row = self.pasta(scope)
        template = self.command("template.save", {"parent_type": "meal", "parent_id": meal["id"], "name": "Pinned menu"})
        with self.app.app_context():
            set_availability(selection["entry_id"], 1, "revoked")
            self.db.session.commit()
        before = self.snapshot()
        unavailable = self.response(self.get("/shopping/scopes/" + scope), 409)
        self.assertEqual(unavailable["code"], "catalog_unavailable")
        self.assertNotIn("rows", unavailable)
        self.assertEqual(self.snapshot(), before)
        self.reject("shopping.cover", {"scope_id": scope, "row_key": row["key"],
                    "source_ids": self.source_ids(row, [item["id"]]), "status": "bought", "include_extra": False}, statuses=(409,))
        self.reject("template.apply", {"template_id": template["template_id"], "parent_type": "meal", "parent_id": meal["id"]}, statuses=(409,))

    def test_revoked_template_read_does_not_return_unchecked_blueprint(self):
        from planning_catalog import set_availability
        selection = self.publish()
        meal = self.meal(self.plan())
        self.item("meal", meal, selection, servings=2)
        template = self.command("template.save", {"parent_type": "meal", "parent_id": meal["id"], "name": "Later revoked"})
        with self.app.app_context():
            set_availability(selection["entry_id"], 1, "revoked")
            self.db.session.commit()
        before = self.snapshot()
        response = self.get("/templates")
        if response.status_code == 409:
            self.assertEqual(self.response(response, 409)["code"], "catalog_unavailable")
        else:
            data = self.response(response)
            for row in data["templates"]:
                if row["id"] == template["template_id"]:
                    self.assertNotIn("blueprint", row, "unavailable template may be a metadata tombstone, never unchecked content")
        self.assertEqual(self.snapshot(), before)

    def test_template_undo_revalidates_revoked_catalog(self):
        from planning_catalog import set_availability
        selection = self.publish()
        meal = self.meal(self.plan())
        self.item("meal", meal, selection, servings=2)
        template = self.command("template.save", {"parent_type": "meal", "parent_id": meal["id"], "name": "Undo menu"})
        removed = self.remove("template.delete", {"template_id": template["template_id"]})
        with self.app.app_context():
            set_availability(selection["entry_id"], 1, "revoked")
            self.db.session.commit()
        self.reject("undo.apply", {"undo_id": removed["undo_id"]}, statuses=(409,))

    def test_missing_entitlement_blocks_projection_and_does_not_destroy_coverage(self):
        from models import User
        with self.app.app_context():
            self.db.session.get(User, self.uid).plan = "premium"
            self.db.session.commit()
        selection = self.publish(level="advanced")
        meal = self.meal(self.plan())
        item = self.item("meal", meal, selection, servings=2)
        scope = self.scope({"id": meal["plan_id"]})
        self.cover(scope, self.pasta(scope), [item["id"]])
        with self.app.app_context():
            self.db.session.get(User, self.uid).plan = "free"
            self.db.session.commit()
        before = self.snapshot()
        self.response(self.get("/shopping/scopes/" + scope), 409)
        self.assertEqual(self.snapshot(), before)
        # A successful unrelated domain write must retain hidden coverage for
        # review, not silently discard it or make an incomplete list checkable.
        self.command("plan.rename", {"plan_id": meal["plan_id"], "name": "Changed while inaccessible"})
        with self.app.app_context():
            self.db.session.get(User, self.uid).plan = "premium"
            self.db.session.commit()
        self.assertEqual(self.pasta(scope)["state"], "review")

    def test_export_and_account_deletion_include_all_new_private_records(self):
        from planning_models import PlanningWorkspace
        plan, meal, _, first, _, scope = self.standard()
        self.cover(scope, self.pasta(scope), [first["id"]])
        addition = self.command("shopping.personal.create", {"scope_id": scope, "title": "Export this addition", "amount": "2", "unit": "bottle"})
        template = self.command("template.save", {"parent_type": "meal", "parent_id": meal["id"], "name": "Export this template"})
        self.command("preferences.update", {"expected_revision": 0, "changes": {"shopping_scope_id": scope, "shopping_layout": "dish"}})
        self.remove("item.delete", {"item_id": first["id"]})
        self.preview("plan.delete", {"plan_id": plan["id"]})
        foreign_plan = self.plan(self.other_headers)
        foreign_before = self.response(self.get("/plans", self.other_headers))
        exported = self.response(self.client.get("/api/auth/me/export", headers=self.headers))["private_planning"]
        self.assertEqual([s["id"] for s in exported["shopping_scopes"]], [scope])
        self.assertIn(addition["item_id"], json.dumps(exported["shopping_scopes"]))
        self.assertIn(template["template_id"], json.dumps(exported["templates"]))
        self.assertTrue(exported["preferences"])
        self.assertTrue(exported["previews"])
        self.assertTrue(exported["undo"])
        with self.app.app_context():
            workspace = PlanningWorkspace.query.filter_by(user_id=self.uid).one().id
        self.response(self.client.delete("/api/auth/me", headers=self.headers))
        with self.app.app_context():
            for table in self.db.metadata.sorted_tables:
                if "workspace_id" in table.c:
                    count = self.db.session.execute(self.db.select(self.db.func.count()).select_from(table).where(table.c.workspace_id == workspace)).scalar()
                    self.assertEqual(count, 0, table.name)
        self.assertEqual(self.response(self.get("/plans", self.other_headers)), foreign_before)
        self.response(self.get("/shopping/scopes/" + scope), 401)

    def test_direct_sql_rejects_cross_workspace_scope_parent(self):
        from planning_models import PlanningWorkspace
        from planning_shopping_models import PrivateShoppingScope
        from sqlalchemy.exc import IntegrityError
        _, _, _, _, _, scope = self.standard()
        self.plan(self.other_headers)
        with self.app.app_context():
            foreign_workspace = PlanningWorkspace.query.filter_by(user_id=self.other_uid).one().id
            table = PrivateShoppingScope.__table__
            with self.assertRaises(IntegrityError):
                self.db.session.execute(table.update().where(table.c.id == scope).values(workspace_id=foreign_workspace))
                self.db.session.flush()
            self.db.session.rollback()
            self.assertEqual(self.db.session.execute(self.db.text("PRAGMA foreign_key_check")).all(), [])
        self.assertEqual(D(self.pasta(scope)["required"]), 820)

    def test_variant_and_item_transfer_changes_persist_review_without_projection_reads(self):
        plan, _, occasion, first, second, scope = self.standard()
        self.command("item.update", {"item_id": first["id"], "options": {"variant_id": "large"}})
        self.cover(scope, self.pasta(scope), [first["id"], second["id"]])
        self.command("item.update", {"item_id": first["id"], "options": {"variant_id": "small"}})
        self.command("item.update", {"item_id": first["id"], "options": {"variant_id": "large"}})
        self.assertEqual(self.pasta(scope)["state"], "review")
        target = self.occasion(guests=8)
        self.command("event.link", {"plan_id": plan["id"], "event_id": target["id"]})
        self.cover(scope, self.pasta(scope), [first["id"], second["id"]])
        self.command("item.move", {"item_id": second["id"], "parent_type": "event", "parent_id": target["id"]})
        self.command("item.move", {"item_id": second["id"], "parent_type": "event", "parent_id": occasion["id"]})
        self.assertEqual(self.pasta(scope)["state"], "review")

    def test_date_scope_loses_removed_sources_when_meal_moves_away_and_back(self):
        plan, meal, _, first, _, _ = self.standard()
        scope = self.scope(plan, mode="dates", start_date="2026-09-13", end_date="2026-09-13")
        self.cover(scope, self.pasta(scope), [first["id"]])
        for date in ("2026-09-20", "2026-09-13"):
            self.command("meal.move", {"meal_id": meal["id"], "plan_id": plan["id"], "date": date})
        self.assertEqual(D(self.pasta(scope)["remaining"]), 220)

    def test_copy_and_repeat_add_fresh_uncovered_demand_without_copying_scope_state(self):
        plan, meal, _, first, second, scope = self.standard()
        self.cover(scope, self.pasta(scope), [first["id"], second["id"]])
        self.command("meal.copy", {"meal_id": meal["id"], "plan_id": plan["id"], "date": "2026-09-21"})
        self.assertEqual(D(self.pasta(scope)["remaining"]), 220)
        repeated = self.command("plan.copy", {"plan_id": plan["id"], "name": "Independent repeat", "start_date": "2026-10-01"})
        new_scope = self.scope(repeated["plan"])
        self.assertEqual(D(self.pasta(new_scope)["remaining"]), 1040)
        self.assertEqual(D(self.pasta(scope)["remaining"]), 220)

    def test_preference_changes_do_not_allow_foreign_scope(self):
        plan = self.plan()
        scope = self.scope(plan)
        self.reject("preferences.update", {"expected_revision": 0, "changes": {"shopping_scope_id": scope}},
                    self.other_headers, statuses=(404,))
        self.assertEqual(self.response(self.get("/preferences", self.other_headers))["preference_revision"], 0)

    def test_invalid_shopping_quantities_coverage_and_preferences_are_atomic(self):
        plan, _, _, first, _, scope = self.standard()
        row = self.pasta(scope)
        for invalid in ("-1", "NaN", "Infinity", "1e3", "0.0001", "1000000000001", "", 1, True, None):
            with self.subTest(extra=invalid):
                self.reject("shopping.extra", {"scope_id": scope, "row_key": row["key"], "amount": invalid}, statuses=(400,))
        cover = {"scope_id": scope, "row_key": row["key"], "source_ids": self.source_ids(row, [first["id"]]),
                 "status": "bought", "include_extra": False}
        for changes in ({"status": "partial"}, {"status": []}, {"source_ids": []},
                        {"source_ids": cover["source_ids"] * 2}, {"include_extra": 1}, {"row_key": "missing"}):
            with self.subTest(coverage=changes):
                self.reject("shopping.cover", {**cover, **changes}, statuses=(400, 404))
        for changes in ({"dark_mode": "true"}, {"language": "fr"}, {"shopping_layout": "future"},
                        {"shopping_scope_id": "wrong"}, {"unknown": 1}, {}):
            with self.subTest(preference=changes):
                self.reject("preferences.update", {"expected_revision": 0, "changes": changes}, statuses=(400,))
        for malformed in ({"owner_type": []}, {"mode": []}, {"owner_id": True}):
            with self.subTest(scope=malformed):
                self.reject("shopping.scope", {"owner_type": "plan", "owner_id": plan["id"], "mode": "all", **malformed}, statuses=(400,))

    def test_foreign_personal_ids_and_unreviewed_deletes_never_change_a_scope(self):
        plan, meal, _, _, _, scope = self.standard()
        other_scope = self.scope(plan, mode="meals", selection=[])
        item = self.command("shopping.personal.create", {"scope_id": scope, "title": "Only in first scope", "amount": "1", "unit": "piece"})
        self.reject("shopping.personal.update", {"scope_id": other_scope, "item_id": item["item_id"], "title": "Hijacked", "amount": "2", "unit": "piece"}, statuses=(404,))
        self.reject("shopping.personal.delete", {"scope_id": scope, "item_id": item["item_id"]}, statuses=(400,))
        template = self.command("template.save", {"parent_type": "meal", "parent_id": meal["id"], "name": "Private meal template"})
        self.reject("template.delete", {"template_id": template["template_id"]}, statuses=(400,))
        event = self.occasion()
        self.reject("template.apply", {"template_id": template["template_id"], "parent_type": "event", "parent_id": event["id"]}, statuses=(400,))
        foreign_payload = {"operation": "shopping.personal.delete", "payload": {"scope_id": scope, "item_id": item["item_id"]},
                           "expected_workspace_revision": self.revision(self.other_headers)}
        before = self.snapshot()
        self.response(self.client.post(BASE + "/previews", json=foreign_payload, headers=self.other_headers), 404)
        self.assertEqual(self.snapshot(), before)

    def test_stale_reviewed_move_cannot_delete_newer_scope_additions(self):
        plan, meal, _, _, _, _ = self.standard()
        target = self.plan()
        scope = self.scope(plan, mode="meals", selection=["meal:" + meal["id"]])
        preview = self.preview("meal.move", {"meal_id": meal["id"], "plan_id": target["id"], "date": "2026-09-18"})
        addition = self.command("shopping.personal.create", {"scope_id": scope, "title": "Added after preview", "amount": "1", "unit": "piece"})
        self.reject("preview.confirm", {"preview_id": preview["id"]}, statuses=(409,))
        self.assertTrue(any(r.get("personal_id") == addition["item_id"] for r in self.projection(scope)["rows"]))

    def test_check_all_returns_guarded_undo_and_restores_mixed_source_and_extra_states(self):
        _, _, _, first, second, scope = self.standard()
        row = self.pasta(scope)
        self.extra(scope, row)
        self.cover(scope, row, [first["id"]], "have")
        before = self.projection(scope)["rows"]
        result = self.cover(scope, self.pasta(scope), [first["id"], second["id"]], "bought", extra=True)
        self.assertIn("undo_id", result, "approved Check all follow-up requires recoverable one-action undo")
        self.assertEqual(D(self.pasta(scope)["remaining"]), 0)
        self.command("undo.apply", {"undo_id": result["undo_id"]})
        self.assertEqual(self.projection(scope)["rows"], before)
        again = self.cover(scope, self.pasta(scope), [first["id"], second["id"]], "bought", extra=True)
        self.extra(scope, self.pasta(scope), "101.000")
        self.reject("undo.apply", {"undo_id": again["undo_id"]}, statuses=(404, 409))

    def test_scope_receipts_remain_replayable_when_new_writes_hit_receipt_capacity(self):
        from planning_models import PlanningMutation
        plan = self.plan()
        body = self.body("shopping.scope", {"owner_type": "plan", "owner_id": plan["id"], "mode": "all"})
        original = self.post(body)
        saved = self.response(original, 201)
        with self.app.app_context():
            count = PlanningMutation.query.count()
        with patch("routes.planning.MAX_MUTATIONS", count):
            self.assertEqual(self.response(self.post(body), 201), saved)
            self.reject("shopping.scope", {"owner_type": "plan", "owner_id": plan["id"], "mode": "meals", "selection": []}, statuses=(409,))

    def test_duplicate_check_and_undo_receipts_never_reapply_over_restored_or_newer_state(self):
        plan, _, _, first, second, scope = self.standard()
        other = self.scope(plan, mode="dates", start_date="2026-09-13", end_date="2026-09-13")
        self.extra(other, self.pasta(other), "17.000")
        self.cover(other, self.pasta(other), [first["id"]], "have")
        other_before = self.projection(other)["rows"]
        self.extra(scope, self.pasta(scope))
        self.cover(scope, self.pasta(scope), [first["id"]], "have")
        restored_rows = self.projection(scope)["rows"]
        row = self.pasta(scope)
        check_body = self.body("shopping.cover", {"scope_id": scope, "row_key": row["key"],
                               "source_ids": self.source_ids(row, [first["id"], second["id"]]),
                               "status": "bought", "include_extra": True})
        check_response = self.post(check_body)
        checked = self.response(check_response)
        undo_body = self.body("undo.apply", {"undo_id": checked["undo_id"]})
        undo_response = self.post(undo_body)
        self.response(undo_response)
        self.assertEqual(self.projection(scope)["rows"], restored_rows)
        self.assertEqual(self.projection(other)["rows"], other_before, "undo replaces only the checked scope")

        def replay_both_without_writes():
            before = self.snapshot()
            for body, original in ((check_body, check_response), (undo_body, undo_response)):
                replay = self.post(body)
                self.response(replay)
                self.assertEqual(replay.get_data(), original.get_data(), "receipt replay returns original acknowledgement")
                self.assertEqual(self.snapshot(), before, "receipt replay must never restore an old scope or recreate undo")

        replay_both_without_writes()
        newer = self.cover(other, self.pasta(other), [first["id"]], "bought", extra=True)
        replay_both_without_writes()
        self.assertEqual(self.projection(scope)["rows"], restored_rows)
        self.assertEqual(D(self.pasta(other)["remaining"]), 0)
        self.command("undo.apply", {"undo_id": newer["undo_id"]})
        self.assertEqual(self.projection(other)["rows"], other_before, "old retries cannot erase the newer action's undo")

    def test_check_capacity_reserves_undo_receipt_and_allows_both_replays_at_full_capacity(self):
        from planning_models import PlanningMutation
        _, _, _, first, second, scope = self.standard()
        row = self.pasta(scope)
        payload = {"scope_id": scope, "row_key": row["key"],
                   "source_ids": self.source_ids(row, [first["id"], second["id"]]),
                   "status": "bought", "include_extra": False}
        with self.app.app_context():
            count = PlanningMutation.query.count()
        with patch("routes.planning.MAX_MUTATIONS", count + 1):
            rejected = self.reject("shopping.cover", payload, statuses=(409,))
            self.assertEqual(rejected["code"], "limit_reached")
        with patch("routes.planning.MAX_MUTATIONS", count + 2):
            check_body = self.body("shopping.cover", payload)
            checked = self.response(self.post(check_body))
            undo_body = self.body("undo.apply", {"undo_id": checked["undo_id"]})
            undone = self.response(self.post(undo_body))
            before = self.snapshot()
            self.assertEqual(self.response(self.post(check_body)), checked)
            self.assertEqual(self.response(self.post(undo_body)), undone)
            self.assertEqual(self.snapshot(), before)
            self.assertEqual(D(self.pasta(scope)["remaining"]), 820)
            self.reject("shopping.cover", payload, statuses=(409,))

    def test_check_inverse_limit_rejects_before_apply_and_preserves_existing_undo(self):
        _, _, _, first, second, scope = self.standard()
        row = self.pasta(scope)
        previous = self.cover(scope, row, [first["id"]], "have")
        payload = {"scope_id": scope, "row_key": row["key"],
                   "source_ids": self.source_ids(row, [first["id"], second["id"]]),
                   "status": "bought", "include_extra": False}
        with patch("planning_changes.MAX_SCOPE_INVERSE_BYTES", 1), \
             patch("routes.planning.apply_command", side_effect=AssertionError("oversized inverse must fail before apply")):
            rejected = self.reject("shopping.cover", payload, statuses=(409,))
            self.assertEqual(rejected["code"], "limit_reached")
        self.command("undo.apply", {"undo_id": previous["undo_id"]})
        self.assertEqual(D(self.pasta(scope)["remaining"]), 820)

    def large_unrelated_scope(self):
        """Valid synthetic ORM fixture above inverse capacity, below scope capacity.

        Create the scope/addition through the API, then bulk-populate copies of
        that actual record in memory. Avoid thousands of setup HTTP commands;
        normal model validators still validate the resulting saved state.
        """
        from planning_shopping_models import PrivateShoppingScope
        scope = self.scope(self.plan())
        self.command("shopping.personal.create", {"scope_id": scope, "title": "Unrelated large list", "amount": "1.000", "unit": "piece"})
        with self.app.app_context():
            row = self.db.session.get(PrivateShoppingScope, scope)
            state = copy.deepcopy(row.state)
            prototype = copy.deepcopy(state["personal"][0])
            state["personal"] = [{**copy.deepcopy(prototype), "id": str(uuid4()),
                                   "title": f"Synthetic unrelated addition {index:04d} " + "x" * 120}
                                  for index in range(1100)]
            row.state = state
            self.db.session.commit()
            serialized = json.dumps(row.to_dict(), ensure_ascii=True).encode()
            self.assertGreater(len(serialized), 256 * 1024, "fixture must exceed the real inverse cap")
            self.assertLess(len(serialized), 512 * 1024)
        return scope

    def saved_scope(self, scope):
        from planning_shopping_models import PrivateShoppingScope
        with self.app.app_context():
            row = self.db.session.get(PrivateShoppingScope, scope)
            self.assertIsNotNone(row, "scope disappeared")
            return copy.deepcopy(row.to_dict())

    def test_large_unrelated_scope_does_not_block_task_or_template_delete_and_undo(self):
        meal = self.meal(self.plan())
        template = self.command("template.save", {"parent_type": "meal", "parent_id": meal["id"], "name": "Small independent template"})
        event = self.occasion()
        task = self.command("task.create", {"event_id": event["id"], "text": "Small independent reminder", "bucket": "earlier"})["task"]
        large = self.large_unrelated_scope()
        before = self.saved_scope(large)
        for operation, payload in (("task.delete", {"task_id": task["id"]}),
                                   ("template.delete", {"template_id": template["template_id"]})):
            with self.subTest(operation=operation):
                preview = self.preview(operation, payload)
                self.assertEqual(preview["effects"]["affected"]["shopping_scopes"], [])
                self.assertEqual(preview["effects"]["removed_shopping_selections"], [])
                result = self.command("preview.confirm", {"preview_id": preview["id"]})
                self.assertEqual(self.saved_scope(large), before)
                self.command("undo.apply", {"undo_id": result["undo_id"]})
                self.assertEqual(self.saved_scope(large), before)
        self.assertEqual(self.response(self.get(f'/events/{event["id"]}/tasks'))["tasks"][0]["id"], task["id"])
        self.assertTrue(any(t["id"] == template["template_id"] for t in self.response(self.get("/templates"))["templates"]))

    def linked_event_scopes(self):
        plan, meal, event, first, second, whole = self.standard()
        other_plan = self.plan()
        self.command("event.link", {"plan_id": other_plan["id"], "event_id": event["id"]})
        other_whole = self.scope(other_plan)
        event_scope = self.scope(event, owner_type="event")
        selected = self.scope(other_plan, mode="meals", selection=["event:" + event["id"]])
        scopes = [whole, other_whole, event_scope, selected]
        for index, scope in enumerate(scopes):
            self.extra(scope, self.pasta(scope), f"{index + 11}.000")
            self.cover(scope, self.pasta(scope), [second["id"]], "have", extra=True)
        return plan, meal, event, first, second, scopes

    def test_event_item_delete_captures_every_linked_plan_scope_and_restores_without_unrelated_scope(self):
        _, _, _, _, second, scopes = self.linked_event_scopes()
        large = self.large_unrelated_scope()
        before = {scope: self.saved_scope(scope) for scope in scopes + [large]}
        preview = self.preview("item.delete", {"item_id": second["id"]})
        self.assertEqual({row["id"] for row in preview["effects"]["affected"]["shopping_scopes"]}, set(scopes))
        self.assertEqual(preview["effects"]["removed_shopping_selections"], [], "removing demand does not remove its parent selections")
        result = self.command("preview.confirm", {"preview_id": preview["id"]})
        self.assertEqual(D(self.pasta(scopes[0])["required"]), 220)
        self.assertEqual(D(self.pasta(scopes[1])["required"]), 0)
        self.assertEqual(self.saved_scope(large), before[large])
        self.command("undo.apply", {"undo_id": result["undo_id"]})
        for scope in scopes + [large]:
            self.assertEqual(self.saved_scope(scope), before[scope])

    def test_event_delete_discloses_only_removed_selections_and_restores_all_linked_scope_state(self):
        _, _, event, _, _, scopes = self.linked_event_scopes()
        large = self.large_unrelated_scope()
        before = {scope: self.saved_scope(scope) for scope in scopes + [large]}
        preview = self.preview("event.delete", {"event_id": event["id"]})
        self.assertEqual({row["id"] for row in preview["effects"]["affected"]["shopping_scopes"]}, set(scopes))
        removed = preview["effects"]["removed_shopping_selections"]
        self.assertEqual({row["id"] for row in removed}, {scopes[2], scopes[3]})
        for row in removed:
            self.assertEqual(row["coverage_count"], 1)
            self.assertEqual(row["extra_count"], 1)
            self.assertEqual(row["personal_count"], 0)
        result = self.command("preview.confirm", {"preview_id": preview["id"]})
        for scope in (scopes[2], scopes[3]):
            self.response(self.get("/shopping/scopes/" + scope), 404)
        self.assertEqual(self.saved_scope(large), before[large])
        self.command("undo.apply", {"undo_id": result["undo_id"]})
        for scope in scopes + [large]:
            self.assertEqual(self.saved_scope(scope), before[scope])

    def test_reviewed_meal_move_captures_both_ends_and_preserves_large_unrelated_scope(self):
        plan, meal, _, first, _, origin = self.standard()
        target = self.plan()
        target_meal = self.meal(target, date="2026-09-18")
        selection = self.publish()
        target_item = self.item("meal", target_meal, selection, servings=1)
        destination = self.scope(target)
        selected = self.scope(plan, mode="meals", selection=["meal:" + meal["id"]])
        for scope, item in ((origin, first), (selected, first), (destination, target_item)):
            self.extra(scope, self.pasta(scope), "12.000")
            self.cover(scope, self.pasta(scope), [item["id"]], "have", extra=True)
        large = self.large_unrelated_scope()
        scopes = [origin, destination, selected]
        before = {scope: self.saved_scope(scope) for scope in scopes + [large]}
        preview = self.preview("meal.move", {"meal_id": meal["id"], "plan_id": target["id"], "date": "2026-09-18"})
        self.assertEqual({row["id"] for row in preview["effects"]["affected"]["shopping_scopes"]}, set(scopes))
        self.assertEqual([row["id"] for row in preview["effects"]["removed_shopping_selections"]], [selected])
        result = self.command("preview.confirm", {"preview_id": preview["id"]})
        self.assertEqual(D(self.pasta(origin)["required"]), 600)
        self.assertEqual(D(self.pasta(destination)["required"]), 330)
        self.response(self.get("/shopping/scopes/" + selected), 404)
        self.assertEqual(self.saved_scope(large), before[large])
        self.command("undo.apply", {"undo_id": result["undo_id"]})
        for scope in scopes + [large]:
            self.assertEqual(self.saved_scope(scope), before[scope])

    def test_personal_delete_captures_only_its_scope_and_preserves_large_unrelated_scope(self):
        scope = self.scope(self.plan())
        addition = self.command("shopping.personal.create", {"scope_id": scope, "title": "Remove only this", "amount": "1.000", "unit": "piece"})
        large = self.large_unrelated_scope()
        before = {identity: self.saved_scope(identity) for identity in (scope, large)}
        preview = self.preview("shopping.personal.delete", {"scope_id": scope, "item_id": addition["item_id"]})
        self.assertEqual([row["id"] for row in preview["effects"]["affected"]["shopping_scopes"]], [scope])
        self.assertEqual(preview["effects"]["removed_shopping_selections"], [])
        result = self.command("preview.confirm", {"preview_id": preview["id"]})
        self.assertEqual(self.projection(scope)["rows"], [])
        self.command("undo.apply", {"undo_id": result["undo_id"]})
        for identity in (scope, large):
            self.assertEqual(self.saved_scope(identity), before[identity])

    def test_scope_delete_preview_undo_restores_list_but_not_overwrites_newer_preferences(self):
        plan, meal, event, first, _, scope = self.standard()
        other = self.scope(event, owner_type="event")
        self.extra(scope, self.pasta(scope))
        self.cover(scope, self.pasta(scope), [first["id"]], "have", extra=True)
        addition = self.command("shopping.personal.create", {"scope_id": scope, "title": "Restore this addition", "amount": "2", "unit": "bottle"})
        self.command("preferences.update", {"expected_revision": 0, "changes": {"shopping_scope_id": scope}})
        before = self.saved_scope(scope)
        other_before = self.saved_scope(other)
        plan_before = self.response(self.get(f'/plans/{plan["id"]}'))["plan"]
        event_before = self.response(self.get(f'/events/{event["id"]}'))["event"]
        items_before = self.response(self.get(f'/meals/{meal["id"]}/items'))["items"]
        preview = self.preview("shopping.scope.delete", {"scope_id": scope})
        affected = preview["effects"]["affected"]
        self.assertEqual([row["id"] for row in affected["shopping_scopes"]], [scope])
        for kind in ("plans", "events", "meals", "items", "tasks", "links"):
            self.assertEqual(affected[kind], [], kind)
        removed = preview["effects"]["removed_shopping_selections"]
        self.assertEqual([row["id"] for row in removed], [scope])
        self.assertEqual(removed[0]["personal_count"], 1)
        self.assertEqual(removed[0]["extra_count"], 1)
        self.assertEqual(self.saved_scope(scope), before)
        confirm_body = self.body("preview.confirm", {"preview_id": preview["id"]})
        confirmed = self.response(self.post(confirm_body))
        self.response(self.get("/shopping/scopes/" + scope), 404)
        self.assertIsNone(self.response(self.get("/preferences"))["preferences"]["shopping_scope_id"])
        preferences = self.response(self.get("/preferences"))
        self.command("preferences.update", {"expected_revision": preferences["preference_revision"], "changes": {
            "shopping_scope_id": other, "shopping_layout": "amount", "language": "de", "dark_mode": True}})
        newest = self.response(self.get("/preferences"))
        undo_body = self.body("undo.apply", {"undo_id": confirmed["undo_id"]})
        undone = self.response(self.post(undo_body))
        self.assertEqual(self.saved_scope(scope), before)
        self.assertIn(addition["item_id"], json.dumps(before))
        self.assertEqual(self.saved_scope(other), other_before)
        self.assertEqual(self.response(self.get("/preferences"))["preferences"], newest["preferences"])
        after = self.snapshot()
        self.assertEqual(self.response(self.post(confirm_body)), confirmed)
        self.assertEqual(self.response(self.post(undo_body)), undone)
        self.assertEqual(self.snapshot(), after)
        self.assertEqual(self.response(self.get(f'/plans/{plan["id"]}'))["plan"], plan_before)
        self.assertEqual(self.response(self.get(f'/events/{event["id"]}'))["event"], event_before)
        self.assertEqual(self.response(self.get(f'/meals/{meal["id"]}/items'))["items"], items_before)

    def test_scope_cleanup_and_undo_do_not_reconcile_unrelated_unavailable_sources(self):
        from planning_catalog import set_availability
        selection = self.publish()
        unrelated_plan = self.plan()
        item = self.item("meal", self.meal(unrelated_plan), selection, servings=2)
        unrelated = self.scope(unrelated_plan)
        self.cover(unrelated, self.pasta(unrelated), [item["id"]], "have")
        target = self.scope(self.plan())
        self.command("shopping.personal.create", {"scope_id": target, "title": "Recover independently"})
        target_before = self.saved_scope(target)
        unrelated_before = self.saved_scope(unrelated)
        with self.app.app_context():
            set_availability(selection["entry_id"], 1, "revoked")
            self.db.session.commit()
        self.assertEqual(self.response(self.get("/shopping/scopes/" + unrelated), 409)["code"], "catalog_unavailable")
        # This branch must not merely tolerate unavailable demand: it must not
        # rebuild unrelated lists at all, including changing their review flags.
        with patch("planning_shopping.reconcile", side_effect=AssertionError("Cleanup rebuilt all scopes")):
            removed = self.remove("shopping.scope.delete", {"scope_id": target})
            self.response(self.get("/shopping/scopes/" + target), 404)
            self.assertEqual(self.saved_scope(unrelated), unrelated_before)
            self.command("undo.apply", {"undo_id": removed["undo_id"]})
        self.assertEqual(self.saved_scope(target), target_before)
        self.assertEqual(self.saved_scope(unrelated), unrelated_before)
        self.response(self.get(f'/plans/{unrelated_plan["id"]}'))

    def test_scope_cleanup_undo_entitlement_loss_rolls_back_and_exact_retry_preserves_preferences(self):
        from models import User
        with self.app.app_context():
            self.db.session.get(User, self.uid).plan = "premium"
            self.db.session.commit()
        selection = self.publish(level="advanced")
        plan = self.plan()
        item = self.item("meal", self.meal(plan), selection, servings=2)
        scope = self.scope(plan)
        other = self.scope(self.plan())
        self.extra(scope, self.pasta(scope))
        self.cover(scope, self.pasta(scope), [item["id"]], "have", extra=True)
        self.command("shopping.personal.create", {"scope_id": scope, "title": "Retained private addition"})
        saved = self.saved_scope(scope)
        with self.app.app_context():
            self.db.session.get(User, self.uid).plan = "free"
            self.db.session.commit()
        # Even the target's unavailable recipe must not prevent deleting a list.
        preview = self.preview("shopping.scope.delete", {"scope_id": scope})
        confirm_body = self.body("preview.confirm", {"preview_id": preview["id"]})
        confirmed = self.response(self.post(confirm_body))
        self.command("preferences.update", {"expected_revision": 0, "changes": {
            "shopping_scope_id": other, "language": "de", "dark_mode": True}})
        preferences = self.response(self.get("/preferences"))
        undo_body = self.body("undo.apply", {"undo_id": confirmed["undo_id"]})
        before = self.snapshot()
        self.assertEqual(self.response(self.post(undo_body), 409)["code"], "catalog_unavailable")
        self.assertEqual(self.snapshot(), before, "failed authorization must restore the undo token and every SQL row")
        self.response(self.get("/shopping/scopes/" + scope), 404)
        self.response(self.get("/mutations/" + undo_body["mutation_id"]), 404)
        self.assertEqual(self.response(self.post(confirm_body)), confirmed)
        self.assertEqual(self.snapshot(), before)
        with self.app.app_context():
            self.db.session.get(User, self.uid).plan = "premium"
            self.db.session.commit()
        undone = self.response(self.post(undo_body))
        self.assertEqual(self.saved_scope(scope), saved)
        current_preferences = self.response(self.get("/preferences"))
        self.assertEqual(current_preferences["preferences"], preferences["preferences"])
        self.assertEqual(current_preferences["preference_revision"], preferences["preference_revision"])
        # Lost responses replay bounded acknowledgements, not restored catalog
        # content, and must not reapply either removal or restoration.
        after = self.snapshot()
        for body, result in ((confirm_body, confirmed), (undo_body, undone)):
            self.assertEqual(self.response(self.post(body)), result)
            receipt = self.response(self.get("/mutations/" + body["mutation_id"]))
            self.assertEqual(receipt["result"], result)
            self.assertLess(len(json.dumps(receipt)), 4096)
            for forbidden in ('"rows"', '"ingredients"', "Retained private addition", "Synthetic private method"):
                self.assertNotIn(forbidden, json.dumps(receipt))
        self.assertEqual(self.snapshot(), after)

    def test_scope_cleanup_undo_rechecks_catalog_revocation_after_reviewed_deletion(self):
        from planning_catalog import set_availability
        selection = self.publish()
        plan = self.plan()
        self.item("meal", self.meal(plan), selection, servings=2)
        scope = self.scope(plan)
        removed = self.remove("shopping.scope.delete", {"scope_id": scope})
        with self.app.app_context():
            set_availability(selection["entry_id"], 1, "revoked")
            self.db.session.commit()
        rejected = self.reject("undo.apply", {"undo_id": removed["undo_id"]}, statuses=(409,))
        self.assertEqual(rejected["code"], "catalog_unavailable")
        self.response(self.get("/shopping/scopes/" + scope), 404)
        self.response(self.get(f'/plans/{plan["id"]}'))

    def test_scope_cleanup_and_undo_receipt_failures_roll_back_and_retry_exactly(self):
        from sqlalchemy import event
        from sqlalchemy.exc import SQLAlchemyError
        from planning_models import PlanningMutation
        scope = self.scope(self.plan())
        self.command("shopping.personal.create", {"scope_id": scope, "title": "Atomic cleanup fixture"})
        saved = self.saved_scope(scope)
        preview = self.preview("shopping.scope.delete", {"scope_id": scope})
        operation, payload = "preview.confirm", {"preview_id": preview["id"]}
        for step in ("delete", "restore"):
            with self.subTest(step=step):
                body = self.body(operation, payload)
                before = self.snapshot()
                fired = []
                def fail_receipt(mapper, connection, target):
                    if target.mutation_id == body["mutation_id"]:
                        fired.append(True)
                        raise SQLAlchemyError("Synthetic cleanup receipt failure")
                event.listen(PlanningMutation, "before_insert", fail_receipt)
                try:
                    self.response(self.post(body), 503)
                finally:
                    event.remove(PlanningMutation, "before_insert", fail_receipt)
                self.assertEqual(fired, [True])
                self.assertEqual(self.snapshot(), before)
                self.response(self.get("/mutations/" + body["mutation_id"]), 404)
                result = self.response(self.post(body))
                after = self.snapshot()
                self.assertEqual(self.response(self.post(body)), result)
                self.assertEqual(self.snapshot(), after)
                if step == "delete":
                    self.response(self.get("/shopping/scopes/" + scope), 404)
                    operation, payload = "undo.apply", {"undo_id": result["undo_id"]}
                else:
                    self.assertEqual(self.saved_scope(scope), saved)

    def test_capacity_counter_matches_complete_route_projections_across_scope_selections(self):
        from planning_models import PlanningWorkspace
        from planning_shopping import preflight
        plan, meal, occasion, _, second, whole = self.standard()
        self.command("event.link", {"plan_id": plan["id"], "event_id": occasion["id"]})
        scopes = [whole, self.scope(plan, mode="meals", selection=[]),
                  self.scope(plan, mode="dates", start_date="2026-09-13", end_date="2026-09-13"),
                  self.scope(plan, mode="meals", selection=["meal:" + meal["id"], "event:" + occasion["id"]]),
                  self.scope(occasion, owner_type="event")]
        self.item("meal", meal, {"kind": "note", "title": "Not shopping demand"})
        self.item("meal", meal, {"kind": "personal", "title": "Planned addition"})
        self.command("shopping.personal.create", {"scope_id": whole, "title": "Separate addition"})
        def compare(expected):
            actual = sum(len(row["sources"]) + int("personal_id" in row)
                         for scope in scopes for row in self.projection(scope)["rows"])
            self.assertEqual(actual, expected)
            before = self.snapshot()
            with self.app.app_context():
                owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
                with patch("planning_shopping_projection.resolve_item", side_effect=AssertionError("Admission resolved content")):
                    self.assertEqual(preflight(owner)["demand_allocations"], actual)
            self.assertEqual(self.snapshot(), before)
        compare(10)
        self.command("item.update", {"item_id": second["id"], "contribution": "Guest brings it"})
        compare(7)
        self.command("item.update", {"item_id": second["id"], "contribution": None})
        self.command("event.update", {"event_id": occasion["id"], "date": "2026-10-01"})
        compare(8)  # Standalone event still counts; its linked plan scopes do not.

    def test_actual_8000_allocation_boundary_rejects_growth_before_projection_and_allows_scoped_recovery(self):
        from planning_item_models import PrivatePlannedItem
        from planning_models import PlanningWorkspace
        from planning_shopping import preflight, MAX_WORKSPACE_ALLOCATIONS
        self.assertEqual(MAX_WORKSPACE_ALLOCATIONS, 8000)
        selection = self.publish(ingredients=[self.ingredient("1.000", identity=f"capacity-{n}") for n in range(200)])
        plans = [self.plan() for _ in range(4)]
        meals = [self.meal(plan) for plan in plans]
        scopes = [self.scope(plan) for plan in plans]
        # Synthetic FK-checked bulk setup: 4 lists x 10 dishes x 200 distinct
        # sources. No coverage bases are needed to reach the true demand cap.
        with self.app.app_context():
            owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
            for meal in meals:
                for position in range(10):
                    self.db.session.add(PrivatePlannedItem(workspace_id=owner.id, meal_id=meal["id"],
                        position=position, servings=1, follows_guests=False, **selection))
            self.db.session.commit()
            self.assertEqual(preflight(owner)["demand_allocations"], 8000)
        self.command("plan.rename", {"plan_id": plans[0]["id"], "name": "Exactly at budget"})
        with patch("planning_shopping.build", side_effect=AssertionError("Rejected demand reached projection")):
            error = self.reject("item.create", {"parent_type": "meal", "parent_id": meals[0]["id"],
                "kind": "personal", "title": "Allocation 8001"}, statuses=(422,))
        self.assertEqual((error["code"], error["dimension"], error["used"], error["limit"]),
                         ("shopping_capacity_exceeded", "demand_allocations", 8001, 8000))
        saved = {scope: self.saved_scope(scope) for scope in scopes}
        # Simulate a later tighter policy: deleting one list still leaves the
        # workspace over budget; undo may restore that accepted individual list.
        with patch("planning_shopping.MAX_WORKSPACE_ALLOCATIONS", 3999):
            self.assertEqual(len(self.projection(scopes[0])["rows"]), 200)
            removed = self.remove("shopping.scope.delete", {"scope_id": scopes[0]})
            self.response(self.get("/shopping/scopes/" + scopes[0]), 404)
            self.command("preferences.update", {"expected_revision": 0, "changes": {"language": "de"}})
            self.command("undo.apply", {"undo_id": removed["undo_id"]})
            for scope in scopes:
                self.assertEqual(self.saved_scope(scope), saved[scope])
            self.assertEqual(self.response(self.get("/preferences"))["preferences"]["language"], "de")
            self.assertEqual(self.reject("plan.rename", {"plan_id": plans[0]["id"], "name": "Must not bypass"},
                statuses=(422,))["code"], "shopping_capacity_exceeded")

    def test_proposed_state_byte_growth_rejects_atomically_including_orphans_and_unicode(self):
        from planning_models import PlanningWorkspace
        from planning_shopping import preflight
        selection = self.publish()
        plan = self.plan()
        item = self.item("meal", self.meal(plan), selection, servings=2)
        scope = self.scope(plan)
        self.extra(scope, self.pasta(scope), "3.000")
        self.remove("item.delete", {"item_id": item["id"]})
        self.assertTrue(self.pasta(scope)["orphan"])
        addition = self.command("shopping.personal.create", {"scope_id": scope, "title": "Öl 🥣"})
        with self.app.app_context():
            owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
            raw = self.db.session.execute(self.db.text(
                "SELECT state FROM private_shopping_scopes WHERE id=:id"), {"id": scope}).scalar_one()
            size = len(raw.encode("utf-8"))
            self.assertEqual(preflight(owner)["state_bytes"], size)
            self.assertEqual(preflight(owner)["demand_allocations"], 1)
        with patch("planning_shopping.MAX_WORKSPACE_STATE_BYTES", size):
            self.command("plan.rename", {"plan_id": plan["id"], "name": "Exact byte boundary"})
            error = self.reject("shopping.personal.update", {"scope_id": scope, "item_id": addition["item_id"],
                "title": "Öl 🥣 plus a longer label"}, statuses=(422,))
        self.assertEqual((error["code"], error["dimension"], error["limit"]),
                         ("shopping_capacity_exceeded", "state_bytes", size))
        self.assertGreater(error["used"], size)
        self.assertTrue(self.pasta(scope)["orphan"])
        self.assertEqual(next(row["label"] for row in self.projection(scope)["rows"] if row.get("personal_id")), "Öl 🥣")

    def test_actual_aggregate_byte_limit_preserves_individual_cleanup_undo_and_preferences(self):
        from planning_models import PlanningWorkspace
        from planning_shopping_models import PrivateShoppingScope
        from planning_shopping import MAX_WORKSPACE_STATE_BYTES
        self.assertEqual(MAX_WORKSPACE_STATE_BYTES, 2 * 1024 * 1024)
        plans = [self.plan() for _ in range(6)]
        scopes = [self.scope(plan) for plan in plans]
        large = self.large_unrelated_scope()
        scopes.append(large)
        state = self.saved_scope(large)["state"]
        # Old accepted data may exceed a new aggregate policy without violating
        # any single-list shape, allocation, or inverse limit.
        with self.app.app_context():
            owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
            for identity in scopes[:-1]:
                self.db.session.get(PrivateShoppingScope, identity).state = copy.deepcopy(state)
            self.db.session.commit()
            raw = self.db.session.execute(self.db.text(
                "SELECT state FROM private_shopping_scopes WHERE workspace_id=:owner"), {"owner": owner.id}).scalars().all()
            size = sum(len(value.encode("utf-8")) for value in raw)
        self.assertGreater(size, MAX_WORKSPACE_STATE_BYTES)
        self.assertLess(1100 * len(scopes), 8000, "This fixture isolates bytes, not demand capacity")
        before = {scope: self.saved_scope(scope) for scope in scopes}
        with patch("planning_shopping.build", side_effect=AssertionError("Byte rejection reached projection")):
            error = self.reject("plan.rename", {"plan_id": plans[0]["id"], "name": "Over byte budget"}, statuses=(422,))
        self.assertEqual((error["code"], error["dimension"], error["used"], error["limit"]),
                         ("shopping_capacity_exceeded", "state_bytes", size, MAX_WORKSPACE_STATE_BYTES))
        self.assertEqual(len(self.projection(large)["rows"]), 1100)
        removed = self.remove("shopping.scope.delete", {"scope_id": large})
        self.command("preferences.update", {"expected_revision": 0, "changes": {"dark_mode": True}})
        self.command("undo.apply", {"undo_id": removed["undo_id"]})
        self.assertTrue(self.response(self.get("/preferences"))["preferences"]["dark_mode"])
        for scope in scopes:
            self.assertEqual(self.saved_scope(scope), before[scope])

    def test_catalog_byte_budget_deduplicates_revisions_and_guards_scoped_reads_and_undo_before_json_load(self):
        from sqlalchemy import event
        from planning_models import PlanningWorkspace
        from planning_shopping import preflight, MAX_CATALOG_WORK_BYTES
        self.assertEqual(MAX_CATALOG_WORK_BYTES, 8 * 1024 * 1024)
        selection = self.publish()
        plan = self.plan()
        meal = self.meal(plan)
        self.item("meal", meal, selection, servings=2)
        self.item("meal", meal, selection, servings=3)
        scope = self.scope(plan)
        other = self.scope(plan, mode="meals", selection=["meal:" + meal["id"]])
        # Unselected authored content must not consume this workspace's budget.
        self.item("meal", self.meal(self.plan()), self.publish(), servings=1)
        with self.app.app_context():
            owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
            raw = self.db.session.execute(self.db.text(
                "SELECT content FROM planning_catalog_entries WHERE entry_id=:entry AND revision=1"),
                {"entry": selection["entry_id"]}).scalar_one()
            size = len(raw.encode("utf-8"))
            self.assertEqual(preflight(owner)["catalog_bytes"], size)
            engine = self.db.engine
        with patch("planning_shopping.MAX_CATALOG_WORK_BYTES", size):
            self.assertEqual(len(self.pasta(scope)["sources"]), 2)
            self.command("plan.rename", {"plan_id": plan["id"], "name": "Exact catalog boundary"})
        before_scopes = {identity: self.saved_scope(identity) for identity in (scope, other)}
        statements = []
        def forbid_catalog_materialization(connection, cursor, statement, parameters, context, many):
            normalized = statement.lower()
            if normalized.lstrip().startswith("select") and "planning_catalog_entries" in normalized:
                statements.append(normalized)
                self.assertIn("sum(", normalized, "Over-budget admission loaded catalog JSON before rejection")
        before = self.snapshot()
        event.listen(engine, "before_cursor_execute", forbid_catalog_materialization)
        try:
            with patch("planning_shopping.MAX_CATALOG_WORK_BYTES", size - 1):
                error = self.response(self.get("/shopping/scopes/" + scope), 422)
                self.assertEqual((error["code"], error["dimension"], error["used"], error["limit"]),
                                 ("shopping_capacity_exceeded", "catalog_bytes", size, size - 1))
                # snapshot() itself reads all tables; don't count those diagnostic
                # reads as application catalog materialization.
                event.remove(engine, "before_cursor_execute", forbid_catalog_materialization)
                self.assertEqual(self.snapshot(), before)
                removed = self.remove("shopping.scope.delete", {"scope_id": scope})
                undo_body = self.body("undo.apply", {"undo_id": removed["undo_id"]})
                after_delete = self.snapshot()
                event.listen(engine, "before_cursor_execute", forbid_catalog_materialization)
                error = self.response(self.post(undo_body), 422)
                self.assertEqual(error["dimension"], "catalog_bytes")
                event.remove(engine, "before_cursor_execute", forbid_catalog_materialization)
                self.assertEqual(self.snapshot(), after_delete)
                self.response(self.get("/mutations/" + undo_body["mutation_id"]), 404)
        finally:
            if event.contains(engine, "before_cursor_execute", forbid_catalog_materialization):
                event.remove(engine, "before_cursor_execute", forbid_catalog_materialization)
        self.assertGreaterEqual(len(statements), 2)
        self.response(self.post(undo_body))
        for identity in (scope, other):
            self.assertEqual(self.saved_scope(identity), before_scopes[identity])

    def variant_capacity_fixture(self):
        """512 real keys: 8 entries x 2 revisions x 16 options x 2 languages.

        A 513th key is retained in an unselected meal. All records use trusted
        synthetic catalog sync and FK-checked in-memory ORM setup; no cap patch.
        """
        from planning_catalog import sync_catalog
        from planning_item_models import PrivatePlannedItem
        from planning_models import PlanningWorkspace
        plan = self.plan()
        meals = [self.meal(plan) for _ in range(7)]
        selected = self.scope(plan, mode="meals", selection=["meal:" + meal["id"] for meal in meals[:6]])
        overlap = self.scope(plan, mode="meals", selection=["meal:" + meals[0]["id"]])
        slug = "synthetic-variant-cap-" + uuid4().hex
        content = {"schema_version": 2, "recipe": {"dish_slug": slug, "level": "basic"},
            "variants": [{"id": f"v{option}", "base_servings": 1, "languages": {language: {
                "title": "Synthetic variant capacity", "ingredients": [self.ingredient("1.000")],
                "method": ["Synthetic fixture only"], "equipment": [], "time_min": 1}
                for language in ("en", "de")}} for option in range(17)]}
        choices = [{"kind": "dish", "entry_id": f"{slug}-{entry}", "catalog_revision": revision,
                    "language": language, "options": {"variant_id": f"v{option}"}}
                   for entry in range(8) for revision in (1, 2) for option in range(16) for language in ("en", "de")]
        self.assertEqual(len(choices), 512)
        with self.app.app_context():
            for language in ("en", "de"):
                make_tier(self.db, slug, "basic", lang=language)
            sync_catalog([{"entry_id": f"{slug}-{entry}", "revision": revision, "kind": "recipe",
                           "availability": "published", "content": content}
                          for entry in range(8) for revision in (1, 2)])
            owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
            for index, choice in enumerate(choices):
                self.db.session.add(PrivatePlannedItem(workspace_id=owner.id, meal_id=meals[index // 90]["id"],
                    position=index % 90, servings=1, follows_guests=False, **choice))
            self.db.session.add(PrivatePlannedItem(workspace_id=owner.id, meal_id=meals[6]["id"],
                position=0, servings=1, follows_guests=False, **{**choices[0], "options": {"variant_id": "v16"}}))
            self.db.session.commit()
        return plan, meals, selected, overlap, choices[0]

    def test_variant_capacity_exact_512_admitted_across_revisions_languages_options_and_servings(self):
        from planning_models import PlanningWorkspace
        from planning_shopping import preflight
        plan, meals, selected, overlap, choice = self.variant_capacity_fixture()
        with self.app.app_context():
            owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
            admitted = preflight(owner)
            self.assertEqual(admitted["demand_allocations"], 602)  # 512 plus 90 overlapping sources.
            self.assertLess(admitted["state_bytes"], 2 * 1024 * 1024)
            self.assertLess(admitted["catalog_bytes"], 8 * 1024 * 1024)
        # Full authorized projection, not only a cheap helper accepting its own
        # estimate. Every key dimension is represented at the real boundary.
        self.assertEqual(len(self.pasta(selected)["sources"]), 512)
        self.assertEqual(len(self.pasta(overlap)["sources"]), 90)
        duplicate = self.item("meal", meals[0], choice, servings=999)
        self.assertEqual(len(self.pasta(selected)["sources"]), 513)
        self.assertEqual(next(source["amount"] for source in self.pasta(selected)["sources"]
                              if source["item_id"] == duplicate["id"]), "999.000")
        self.command("plan.rename", {"plan_id": plan["id"], "name": "Still exactly 512 variant keys"})
        with self.app.app_context():
            owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
            self.assertEqual(preflight(owner)["demand_allocations"], 604)

    def test_variant_capacity_513_scope_rejected_before_full_catalog_load_or_resolution(self):
        from sqlalchemy import event
        plan, _, _, _, _ = self.variant_capacity_fixture()
        body = self.body("shopping.scope", {"owner_type": "plan", "owner_id": plan["id"], "mode": "all"})
        before = self.snapshot()
        with self.app.app_context():
            engine = self.db.engine
        def reject_content_read(connection, cursor, statement, parameters, context, many):
            sql = statement.lower()
            if sql.lstrip().startswith("select") and "planning_catalog_entries" in sql:
                self.assertIn("sum(", sql, "Variant admission loaded catalog content before rejecting")
        event.listen(engine, "before_cursor_execute", reject_content_read)
        try:
            with patch("planning_shopping_projection.resolve_item", side_effect=AssertionError("Variant rejection resolved content")):
                error = self.response(self.post(body), 422)
        finally:
            event.remove(engine, "before_cursor_execute", reject_content_read)
        self.assertEqual((error["code"], error["dimension"], error["used"], error["limit"]),
                         ("shopping_capacity_exceeded", "variant_resolutions", 513, 512))
        self.assertEqual(self.snapshot(), before, "Failed admission must roll back the new scope, domain revision and receipt")
        self.response(self.get("/mutations/" + body["mutation_id"]), 404)

    def test_variant_capacity_scoped_read_and_cleanup_undo_keep_individual_guard(self):
        from planning_models import PlanningWorkspace
        from planning_shopping_models import PrivateShoppingScope, empty_state
        from planning_shopping import digest
        plan, _, selected, _, _ = self.variant_capacity_fixture()
        # Model-valid legacy list accepted before the new work budget. Creating
        # it through today's command would correctly fail the admission gate.
        with self.app.app_context():
            owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
            legacy = PrivateShoppingScope(id=str(uuid4()), workspace_id=owner.id, plan_id=plan["id"],
                mode="all", selection=[], state=empty_state())
            legacy.selection_digest = digest(legacy)
            self.db.session.add(legacy)
            self.db.session.commit()
            identity = legacy.id
        # A different, individually admissible list remains readable even when
        # the union of saved scopes has more than 512 distinct variant keys.
        self.assertEqual(len(self.pasta(selected)["sources"]), 512)
        before = self.snapshot()
        with patch("planning_shopping_projection.catalog_work_bytes", side_effect=AssertionError("Variant guard must precede catalog sizing")):
            error = self.response(self.get("/shopping/scopes/" + identity), 422)
        self.assertEqual((error["dimension"], error["used"], error["limit"]), ("variant_resolutions", 513, 512))
        self.assertEqual(self.snapshot(), before)
        removed = self.remove("shopping.scope.delete", {"scope_id": identity})
        with patch("planning_shopping_projection.catalog_work_bytes", side_effect=AssertionError("Undo bypassed variant guard")):
            error = self.reject("undo.apply", {"undo_id": removed["undo_id"]}, statuses=(422,))
        self.assertEqual(error["dimension"], "variant_resolutions")
        self.response(self.get("/shopping/scopes/" + identity), 404)
        self.response(self.get(f'/plans/{plan["id"]}'))

    def test_scope_delete_rejects_foreign_malformed_and_unreviewed_requests(self):
        scope = self.scope(self.plan())
        self.plan(self.other_headers)
        self.reject("shopping.scope.delete", {"scope_id": scope}, statuses=(400,))
        for payload, headers, status in (({"scope_id": scope}, self.other_headers, 404),
                                        ({"scope_id": str(uuid4())}, self.headers, 404),
                                        ({}, self.headers, 400),
                                        ({"scope_id": True}, self.headers, 400),
                                        ({"scope_id": "invalid"}, self.headers, 400),
                                        ({"scope_id": scope, "delete_owner": True}, self.headers, 400)):
            with self.subTest(payload=payload, status=status):
                before = self.snapshot()
                body = {"operation": "shopping.scope.delete", "payload": payload,
                        "expected_workspace_revision": self.revision(headers)}
                self.response(self.client.post(BASE + "/previews", json=body, headers=headers), status)
                self.assertEqual(self.snapshot(), before)
        before = self.snapshot()
        self.response(self.client.delete(BASE + "/shopping/scopes/" + scope, headers=self.headers), 405)
        self.assertEqual(self.snapshot(), before)

    def test_scope_delete_frees_real_100_selection_capacity_and_undo_remains_revision_guarded(self):
        from datetime import date, timedelta
        plan = self.command("plan.create", {"name": "Capacity fixture", "start_date": "2026-01-01", "end_date": "2026-04-30"})["plan"]
        scopes = []
        for offset in range(100):
            day = (date(2026, 1, 1) + timedelta(days=offset)).isoformat()
            scopes.append(self.scope(plan, mode="dates", start_date=day, end_date=day))
        listing = lambda: self.response(self.get("/shopping/scopes?limit=100"))["scopes"]
        self.assertEqual(len(listing()), 100)
        new = {"owner_type": "plan", "owner_id": plan["id"], "mode": "all"}
        self.assertEqual(self.reject("shopping.scope", new, statuses=(409,))["code"], "limit_reached")
        deleted = self.remove("shopping.scope.delete", {"scope_id": scopes[0]})
        self.assertEqual(len(listing()), 99)
        self.command("undo.apply", {"undo_id": deleted["undo_id"]})
        self.assertEqual({row["id"] for row in listing()}, set(scopes))
        deleted = self.remove("shopping.scope.delete", {"scope_id": scopes[0]})
        replacement = self.command("shopping.scope", new)["scope_id"]
        self.assertEqual(len(listing()), 100)
        self.assertIn(replacement, {row["id"] for row in listing()})
        self.reject("undo.apply", {"undo_id": deleted["undo_id"]}, statuses=(404, 409))
        self.response(self.get(f'/plans/{plan["id"]}'))

    def test_large_single_scope_cover_personal_delete_and_scope_delete_undo_fit_scoped_limit(self):
        other = self.scope(self.plan())
        large = self.large_unrelated_scope()
        before = self.saved_scope(large)
        other_before = self.saved_scope(other)
        row = self.projection(large)["rows"][0]
        checked = self.cover(large, row, [], "bought", extra=True)
        self.assertIn("undo_id", checked)
        self.command("undo.apply", {"undo_id": checked["undo_id"]})
        self.assertEqual(self.saved_scope(large), before)
        for operation, payload in (("shopping.personal.delete", {"scope_id": large, "item_id": row["personal_id"]}),
                                   ("shopping.scope.delete", {"scope_id": large})):
            with self.subTest(operation=operation):
                preview = self.preview(operation, payload)
                self.assertEqual([r["id"] for r in preview["effects"]["affected"]["shopping_scopes"]], [large])
                size = len(json.dumps(preview["effects"]["affected"], ensure_ascii=True).encode())
                self.assertGreater(size, 256 * 1024)
                self.assertLess(size, 2 * 1024 * 1024)
                deleted = self.command("preview.confirm", {"preview_id": preview["id"]})
                self.command("undo.apply", {"undo_id": deleted["undo_id"]})
                self.assertEqual(self.saved_scope(large), before)
                self.assertEqual(self.saved_scope(other), other_before)

    def test_large_scope_cleanup_preserves_general_plan_inverse_limit_and_plan_owner(self):
        large = self.large_unrelated_scope()
        plan_id = self.saved_scope(large)["plan_id"]
        before = self.snapshot()
        body = {"operation": "plan.delete", "payload": {"plan_id": plan_id}, "expected_workspace_revision": self.revision()}
        rejected = self.response(self.client.post(BASE + "/previews", json=body, headers=self.headers), 409)
        self.assertEqual(rejected["code"], "limit_reached")
        self.assertEqual(self.snapshot(), before)
        self.remove("shopping.scope.delete", {"scope_id": large})
        self.response(self.get("/shopping/scopes/" + large), 404)
        self.response(self.get("/plans/" + plan_id))
        # Cleaning the list makes a bounded owner preview possible; do not confirm
        # it, because list cleanup must itself never delete the plan.
        preview = self.preview("plan.delete", {"plan_id": plan_id})
        self.assertEqual(preview["effects"]["affected"]["shopping_scopes"], [])
        self.response(self.get("/plans/" + plan_id))


if __name__ == "__main__":
    unittest.main()
