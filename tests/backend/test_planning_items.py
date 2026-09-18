"""Private menu-item API regressions on helpers' disposable SQLite databases.

All private writes use revisioned commands and real preview/undo endpoints.
Catalog fixtures are synthetic authored data, never replacement fixture schema.
"""

import copy
from decimal import Decimal
import json
import os
import sys
import unittest
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, os.path.dirname(__file__))
from helpers import auth_header, make_app, make_tier, make_user


BASE = "/api/planning/v1"
DATE = "2026-09-13"


class PlanningItemsTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        with self.app.app_context():
            self.uid = make_user(self.db, email="items@example.com").id
            self.other_uid = make_user(self.db, email="other-items@example.com").id
        self.client = self.app.test_client()
        self.headers = auth_header(self.app, self.uid)
        self.other_headers = auth_header(self.app, self.other_uid)

    def get(self, path, headers=None):
        return self.client.get(BASE + path, headers=self.headers if headers is None else headers)

    def response(self, response, status):
        self.assertEqual(response.status_code, status, response.get_data(as_text=True))
        self.assertIn("no-store", response.headers.get("Cache-Control", ""))
        return response.get_json()

    def body(self, operation, payload, headers=None, revision=None):
        if revision is None:
            revision = self.response(self.get("/workspace", headers), 200)["revision"]
        return {"operation": operation, "payload": payload, "mutation_id": str(uuid4()),
                "expected_workspace_revision": revision}

    def post(self, body, headers=None):
        return self.client.post(BASE + "/commands", json=body,
                                headers=self.headers if headers is None else headers)

    def command(self, operation, payload, status=200, headers=None):
        body = self.body(operation, payload, headers)
        result = self.response(self.post(body, headers), status)
        self.assertEqual(result["revision"], body["expected_workspace_revision"] + 1)
        return result

    def plan(self, headers=None):
        return self.command("plan.create", {"name": "Week", "start_date": DATE,
                            "end_date": "2026-09-19"}, 201, headers)["plan"]

    def meal(self, plan=None, headers=None):
        plan = plan or self.plan(headers)
        return self.command("meal.create", {"plan_id": plan["id"], "date": DATE}, 201, headers)["meal"]

    def event(self, headers=None, guests=6):
        return self.command("event.create", {"name": "Dinner", "date": DATE, "guests": guests},
                            201, headers)["event"]

    def item(self, parent_type, parent, headers=None, **fields):
        payload = {"parent_type": parent_type, "parent_id": parent["id"],
                   "kind": "personal", "title": "Bread", **fields}
        if payload["kind"] == "dish":
            payload.pop("title")
        return self.command("item.create", payload, 201, headers)["item"]

    def items(self, parent_type, parent, headers=None):
        return self.response(self.get(f'/{parent_type}s/{parent["id"]}/items', headers), 200)["items"]

    def preview(self, operation, payload, headers=None, status=201):
        body = self.body(operation, payload, headers)
        del body["mutation_id"]
        result = self.response(self.client.post(BASE + "/previews", json=body,
                               headers=self.headers if headers is None else headers), status)
        return result["preview"] if status == 201 else result

    def snapshot(self):
        with self.app.app_context():
            return {table.name: sorted(json.dumps(dict(row), sort_keys=True, default=str)
                                      for row in self.db.session.execute(table.select()).mappings())
                    for table in self.db.metadata.sorted_tables}

    def rejected(self, operation, payload, status=400, code="invalid_request", headers=None):
        before = self.snapshot()
        body = self.body(operation, payload, headers)
        result = self.response(self.post(body, headers), status)
        self.assertEqual(result["code"], code)
        self.response(self.get("/mutations/" + body["mutation_id"], headers), 404)
        self.assertEqual(self.snapshot(), before)
        return result

    def assert_item_equal(self, actual, expected):
        # Numeric columns may serialize their declared scale after a fresh read.
        def normalized(item):
            item = dict(item)
            for key in ("quantity", "servings"):
                if item.get(key) is not None:
                    item[key] = Decimal(str(item[key]))
            return item
        self.assertEqual(normalized(actual), normalized(expected))

    def publish_recipe(self, *, amounts=(("jar", "100.000"), ("homemade", "150.000"))):
        """Authored synthetic fixture using the catalog's trusted sync API."""
        from planning_catalog import sync_catalog
        variants = []
        for variant_id, amount in amounts:
            languages = {}
            for language in ("en", "de"):
                languages[language] = {
                    "title": f"Synthetic {variant_id} {language}",
                    "ingredients": [{"ingredient_id": "synthetic-flour", "form": "dry",
                                     "unit": "g", "amount": amount}],
                    "method": [f"Synthetic {variant_id} method {language}."],
                    "equipment": ["Synthetic equipment"], "time_min": 10,
                }
            variants.append({"id": variant_id, "base_servings": 2, "languages": languages})
        record = {"entry_id": "synthetic-item-recipe", "revision": 1, "kind": "recipe",
                  "availability": "published", "content": {"schema_version": 1,
                  "recipe": {"dish_slug": "synthetic-item-dish", "level": "basic"}, "variants": variants}}
        with self.app.app_context():
            for language in ("en", "de"):
                make_tier(self.db, "synthetic-item-dish", "basic", lang=language)
            sync_catalog([record])
            self.db.session.commit()
        return {"kind": "dish", "entry_id": record["entry_id"], "catalog_revision": 1,
                "language": "en", "options": {"variant_id": "jar"}}

    def test_personal_and_note_creation_positions_and_partial_null_edits(self):
        meal, event = self.meal(), self.event()
        first = self.item("meal", meal, title="  Crème 豆腐  ", quantity="1.125", unit="kg",
                          group="  Main  ", contribution="  Alex  ")
        second = self.item("meal", meal, kind="note", title="Set the table")
        third = self.item("event", event, title="Bread", quantity="1000000", unit="g")
        self.assertEqual([first["position"], second["position"], third["position"]], [0, 1, 0])
        self.assertEqual((first["title"], first["group"], first["contribution"]), ("Crème 豆腐", "Main", "Alex"))
        self.assertEqual(Decimal(first["quantity"]), Decimal("1.125"))
        self.assertEqual((first["meal_id"], first["event_id"]), (meal["id"], None))
        self.assertEqual((third["meal_id"], third["event_id"]), (None, event["id"]))
        for field in ("entry_id", "catalog_revision", "language", "options", "servings"):
            self.assertIsNone(first[field])
        self.assertIs(first["follows_guests"], False)
        expected = dict(first)
        for fields in ({"title": "Bread"}, {"quantity": "0.001"}, {"unit": "g"},
                       {"group": None}, {"contribution": "  "}, {"quantity": None, "unit": None}):
            expected.update(fields)
            if fields.get("contribution") == "  ":
                expected["contribution"] = None
            changed = self.command("item.update", {"item_id": first["id"], **fields})["item"]
            self.assert_item_equal(changed, expected)
        by_id = {row["id"]: row for row in self.items("meal", meal)}
        self.assert_item_equal(by_id[first["id"]], expected)
        self.assert_item_equal(by_id[second["id"]], second)

    def test_invalid_amounts_pairs_and_kind_fields_leave_no_changes(self):
        meal = self.meal()
        base = {"parent_type": "meal", "parent_id": meal["id"], "kind": "personal", "title": "Flour"}
        for quantity in (True, False, 1.5, [], {}, "", "NaN", "Infinity", "-Infinity", "1e100000",
                         "0", "-1", "1000000.001", "0.0001", "999999999999999999999"):
            with self.subTest(quantity=quantity):
                self.rejected("item.create", {**base, "quantity": quantity, "unit": "g"})
        for fields in ({"quantity": "2"}, {"unit": "g"}, {"quantity": None, "unit": "g"},
                       {"quantity": "2", "unit": None}, {"quantity": "2", "unit": "cup"},
                       {"quantity": "2", "unit": True}, {"title": None}, {"title": " "},
                       {"title": "x" * 161}, {"title": "bad\nname"}, {"title": "\ud800"},
                       {"kind": "note", "quantity": "2", "unit": "g"},
                       {"kind": "note", "quantity": None, "unit": None},
                       {"options": {"variant_id": "jar"}}, {"servings": 2}, {"follows_guests": False},
                       {"group": True}, {"contribution": True}, {"kind": True}):
            self.rejected("item.create", {**base, **fields})
        item = self.item("meal", meal, quantity="2", unit="g")
        for fields in ({}, {"title": "Changed", "quantity": True}, {"quantity": None}, {"unit": None},
                       {"title": "Changed", "quantity": "1000001"}, {"kind": "note"}, {"position": 2},
                       {"parent_id": meal["id"]}, {"workspace_id": str(uuid4())},
                       {"options": {"variant_id": "jar"}}, {"servings": 2}, {"follows_guests": True}):
            self.rejected("item.update", {"item_id": item["id"], **fields})

    def test_malformed_parents_and_missing_ids_do_not_create_workspace(self):
        missing = str(uuid4())
        base = {"parent_type": "meal", "parent_id": missing, "kind": "personal", "title": "Bread"}
        for field, values in (("parent_type", (None, True, [], {}, "plan", "Meal")),
                              ("parent_id", (None, True, [], {}, "bad", missing.replace("-", "")))):
            for value in values:
                self.rejected("item.create", {**base, field: value})
        for kind in ("meal", "event"):
            self.rejected("item.create", {**base, "parent_type": kind}, 404, "not_found")
            for operation in ("item.move", "item.copy"):
                self.rejected(operation, {"parent_type": kind, "parent_id": missing, "item_id": missing},
                              404, "not_found")
        self.rejected("item.update", {"item_id": missing, "title": "Changed"}, 404, "not_found")
        self.assertEqual(self.response(self.get("/workspace"), 200), {"workspace": None, "revision": 0})

    def test_notes_have_no_quantity_or_recipe_requirements(self):
        event = self.event()
        note = self.item("event", event, kind="note", title="Set table", group="Earlier")
        personal = self.item("event", event, title="Bread", quantity="2", unit="loaf")
        before = self.snapshot()
        for item in (note, personal):
            result = self.response(self.get(f'/items/{item["id"]}/preview'), 200)
            self.assert_item_equal(result["item"], item)
            self.assertIsNone(result["preview"])
        self.assertEqual(self.snapshot(), before)
        self.assertIsNone(note["quantity"])
        self.assertIsNone(note["unit"])
        self.assertIsNone(note["entry_id"])
        for fields in ({"quantity": "2", "unit": "piece"}, {"quantity": None},
                       {"unit": None}, {"options": {"variant_id": "jar"}}, {"servings": 2}):
            self.rejected("item.update", {"item_id": note["id"], **fields})
        self.command("item.update", {"item_id": note["id"], "title": "Set a larger table"})

    def test_cross_owner_create_update_copy_move_and_reads_are_hidden(self):
        meal, event = self.meal(), self.event()
        item = self.item("meal", meal)
        other_meal = self.meal(headers=self.other_headers)
        other_event = self.event(self.other_headers)
        other_item = self.item("event", other_event, self.other_headers)
        for parent_type, own, foreign in (("meal", meal, other_meal), ("event", event, other_event)):
            self.rejected("item.create", {"parent_type": parent_type, "parent_id": foreign["id"],
                          "kind": "personal", "title": "Stolen"}, 404, "not_found")
            for operation in ("item.move", "item.copy"):
                for source, destination in ((item, foreign), (other_item, own), (other_item, foreign)):
                    body = {"item_id": source["id"], "parent_type": parent_type, "parent_id": destination["id"]}
                    denied = self.rejected(operation, body, 404, "not_found")
                    unknown = self.rejected(operation, {**body, "item_id": str(uuid4())}, 404, "not_found")
                    self.assertEqual(denied, unknown)
            self.response(self.get(f'/{parent_type}s/{foreign["id"]}/items'), 404)
        self.rejected("item.update", {"item_id": other_item["id"], "title": "Stolen"}, 404, "not_found")
        self.response(self.get(f'/items/{other_item["id"]}/preview'), 404)
        before = self.snapshot()
        self.preview("item.delete", {"item_id": other_item["id"]}, status=404)
        self.assertEqual(self.snapshot(), before)

    def test_move_preserves_identity_and_copy_is_independent_across_parents(self):
        meal, event = self.meal(), self.event()
        original = self.item("meal", meal, quantity="1.25", unit="loaf", group="Starter", contribution="Alex")
        self.item("event", event, kind="note", title="Welcome")
        copied = self.command("item.copy", {"item_id": original["id"], "parent_type": "event",
                              "parent_id": event["id"]}, 201)["item"]
        self.assertNotEqual(copied["id"], original["id"])
        self.assertEqual(copied["position"], 1)
        self.assert_item_equal(copied, {**original, "id": copied["id"], "meal_id": None,
                               "event_id": event["id"], "position": 1})
        self.command("item.update", {"item_id": copied["id"], "title": "Independent", "quantity": "2"})
        self.assert_item_equal(self.items("meal", meal)[0], original)
        moved = self.command("item.move", {"item_id": original["id"], "parent_type": "event",
                             "parent_id": event["id"]})["item"]
        self.assertEqual(moved["id"], original["id"])
        self.assertEqual(moved["position"], 2)
        self.assertEqual(self.items("meal", meal), [])
        same = self.command("item.move", {"item_id": moved["id"], "parent_type": "event",
                            "parent_id": event["id"]})["item"]
        self.assert_item_equal(same, moved)
        returned = self.command("item.move", {"item_id": moved["id"], "parent_type": "meal",
                                "parent_id": meal["id"]})["item"]
        self.assert_item_equal(returned, original)

    def test_parent_quota_counts_notes_and_blocks_copy_and_move_without_changes(self):
        import planning_items
        self.assertEqual(planning_items.MAX_PARENT_ITEMS, 100)
        meal, event = self.meal(), self.event()
        source = self.item("meal", meal)
        with patch("planning_items.MAX_PARENT_ITEMS", 2):
            target = self.item("event", event)
            self.item("event", event, kind="note", title="Note")
            self.rejected("item.create", {"parent_type": "event", "parent_id": event["id"],
                          "kind": "personal", "title": "Over quota"}, 409, "limit_reached")
            for operation in ("item.copy", "item.move"):
                self.rejected(operation, {"item_id": source["id"], "parent_type": "event",
                              "parent_id": event["id"]}, 409, "limit_reached")
            self.command("item.update", {"item_id": target["id"], "title": "Allowed edit"})
            self.command("item.move", {"item_id": target["id"], "parent_type": "event", "parent_id": event["id"]})
            self.item("meal", meal)

    def test_workspace_quota_allows_moves_edits_and_other_accounts_but_not_copies(self):
        import planning_items
        self.assertEqual(planning_items.MAX_ITEMS, 10000)
        meal, event = self.meal(), self.event()
        with patch("planning_items.MAX_ITEMS", 2):
            item = self.item("meal", meal)
            self.item("event", event, kind="note", title="Note")
            self.rejected("item.create", {"parent_type": "meal", "parent_id": meal["id"],
                          "kind": "personal", "title": "Over quota"}, 409, "limit_reached")
            self.rejected("item.copy", {"item_id": item["id"], "parent_type": "event", "parent_id": event["id"]},
                          409, "limit_reached")
            self.command("item.move", {"item_id": item["id"], "parent_type": "event", "parent_id": event["id"]})
            self.command("item.update", {"item_id": item["id"], "title": "Allowed edit"})
            self.item("event", self.event(self.other_headers), self.other_headers)

    def test_all_item_operations_replay_original_result_and_status_after_deletion(self):
        meal, event = self.meal(), self.event()
        records = []

        def record(operation, payload, status):
            body = self.body(operation, payload)
            response = self.post(body)
            data = self.response(response, status)
            records.append((body, status, data, response.get_data()))
            return data["item"]

        item = record("item.create", {"parent_type": "meal", "parent_id": meal["id"],
                      "kind": "personal", "title": "Bread", "quantity": "2", "unit": "loaf"}, 201)
        record("item.update", {"item_id": item["id"], "title": "Changed"}, 200)
        record("item.copy", {"item_id": item["id"], "parent_type": "event", "parent_id": event["id"]}, 201)
        record("item.move", {"item_id": item["id"], "parent_type": "event", "parent_id": event["id"]}, 200)
        preview = self.preview("item.delete", {"item_id": item["id"]})
        self.command("preview.confirm", {"preview_id": preview["id"]})
        before = self.snapshot()
        with patch("routes.planning.MAX_MUTATIONS", 0), patch("planning_items.MAX_ITEMS", 0):
            for body, status, expected, raw in records:
                actual = self.post(body)
                self.assertEqual(self.response(actual, status), expected)
                self.assertEqual(actual.get_data(), raw)
                self.assertEqual(self.response(self.get("/mutations/" + body["mutation_id"]), 200),
                                 {"result": expected, "status_code": status})
        stale = self.body("item.update", {"item_id": item["id"], "title": "Stale"}, revision=0)
        self.assertEqual(self.response(self.post(stale), 409)["code"], "revision_conflict")
        changed = copy.deepcopy(records[0][0])
        changed["payload"]["title"] = "Conflicting"
        self.assertEqual(self.response(self.post(changed), 409)["code"], "mutation_conflict")
        self.assertEqual(self.snapshot(), before)

    def test_failure_after_each_item_flush_rolls_back_then_same_mutation_can_retry(self):
        from routes.planning import apply_command
        from sqlalchemy.exc import SQLAlchemyError
        meal, event = self.meal(), self.event()
        item = self.item("meal", meal)

        def fail_after_apply(*args, **kwargs):
            apply_command(*args, **kwargs)
            raise SQLAlchemyError("Synthetic post-item flush failure")

        operations = (
            ("item.create", {"parent_type": "event", "parent_id": event["id"], "kind": "personal", "title": "New"}, 201),
            ("item.update", {"item_id": item["id"], "title": "Changed"}, 200),
            ("item.copy", {"item_id": item["id"], "parent_type": "event", "parent_id": event["id"]}, 201),
            ("item.move", {"item_id": item["id"], "parent_type": "event", "parent_id": event["id"]}, 200),
        )
        for operation, payload, status in operations:
            body = self.body(operation, payload)
            before = self.snapshot()
            with patch("routes.planning.apply_command", side_effect=fail_after_apply):
                self.assertEqual(self.response(self.post(body), 503)["code"], "planning_unavailable")
            self.assertEqual(self.snapshot(), before)
            self.response(self.get("/mutations/" + body["mutation_id"]), 404)
            self.response(self.post(body), status)

    def test_item_delete_requires_preview_and_undo_restores_exact_id_and_content(self):
        meal = self.meal()
        item = self.item("meal", meal, quantity="1.125", unit="loaf", group="Side", contribution="Alex")
        sibling = self.item("meal", meal, kind="note", title="Keep")
        original = self.items("meal", meal)
        self.rejected("item.delete", {"item_id": item["id"]})
        preview = self.preview("item.delete", {"item_id": item["id"]})
        self.assertEqual(self.items("meal", meal), original)
        self.assertEqual([row["id"] for row in preview["effects"]["affected"]["items"]], [item["id"]])
        result = self.command("preview.confirm", {"preview_id": preview["id"]})
        self.assertEqual([row["id"] for row in self.items("meal", meal)], [sibling["id"]])
        self.command("undo.apply", {"undo_id": result["undo_id"]})
        self.assertEqual(self.items("meal", meal), original)

    def test_meal_copy_includes_independent_items_and_parent_delete_undo_restores_them(self):
        plan = self.plan()
        meal = self.meal(plan)
        self.item("meal", meal, title="Bread", quantity="1.125", unit="loaf")
        self.item("meal", meal, kind="note", title="Note")
        original = sorted(self.items("meal", meal), key=lambda row: row["position"])
        copied_meal = self.command("meal.copy", {"meal_id": meal["id"], "plan_id": plan["id"],
                                   "date": "2026-09-14"}, 201)["meal"]
        copied = sorted(self.items("meal", copied_meal), key=lambda row: row["position"])
        self.assertEqual(len(copied), len(original))
        self.assertFalse({row["id"] for row in copied} & {row["id"] for row in original})
        for source, target in zip(original, copied):
            self.assert_item_equal(target, {**source, "id": target["id"], "meal_id": copied_meal["id"]})
        self.command("item.update", {"item_id": copied[0]["id"], "title": "Independent"})
        self.assertEqual(sorted(self.items("meal", meal), key=lambda row: row["position"]), original)
        preview = self.preview("meal.delete", {"meal_id": meal["id"]})
        self.assertCountEqual(preview["effects"]["affected"]["items"], original)
        result = self.command("preview.confirm", {"preview_id": preview["id"]})
        self.response(self.get(f'/meals/{meal["id"]}/items'), 404)
        self.command("undo.apply", {"undo_id": result["undo_id"]})
        self.assertEqual(sorted(self.items("meal", meal), key=lambda row: row["position"]), original)

    def test_meal_copy_item_quota_failure_does_not_leave_empty_meal(self):
        plan = self.plan()
        meal = self.meal(plan)
        self.item("meal", meal)
        self.item("meal", meal, kind="note", title="Note")
        with patch("planning_items.MAX_ITEMS", 3):
            self.rejected("meal.copy", {"meal_id": meal["id"], "plan_id": plan["id"],
                          "date": "2026-09-14"}, 409, "limit_reached")

    def test_dish_guest_following_and_explicit_serving_overrides(self):
        selection = self.publish_recipe()
        event, meal = self.event(guests=6), self.meal()
        following = self.item("event", event, **selection)
        explicit = self.item("event", event, **selection, servings=3)
        opted_out = self.item("event", event, **selection, follows_guests=False)
        meal_item = self.item("meal", meal, **selection)
        self.assertIs(following["follows_guests"], True)
        self.assertEqual(Decimal(following["servings"]), 6)
        for row in (explicit, opted_out, meal_item):
            self.assertIs(row["follows_guests"], False)
        before = self.snapshot()
        self.command("event.update", {"event_id": event["id"], "guests": 8})
        after = self.snapshot()
        for table in before:
            if table not in {"private_events", "private_planned_items", "planning_workspaces", "planning_mutations"}:
                self.assertEqual(after[table], before[table], table)
        current = {row["id"]: row for row in self.items("event", event)}
        self.assertEqual(Decimal(current[following["id"]]["servings"]), 8)
        self.assertEqual(Decimal(current[explicit["id"]]["servings"]), 3)
        self.assertEqual(Decimal(current[opted_out["id"]]["servings"]), Decimal(opted_out["servings"]))
        self.assert_item_equal(self.items("meal", meal)[0], meal_item)
        changed = self.command("item.update", {"item_id": following["id"], "servings": 4})["item"]
        self.assertIs(changed["follows_guests"], False)
        self.command("event.update", {"event_id": event["id"], "guests": 10})
        current = {row["id"]: row for row in self.items("event", event)}
        self.assertEqual(Decimal(current[following["id"]]["servings"]), 4)
        changed = self.command("item.update", {"item_id": following["id"], "follows_guests": True})["item"]
        self.assertEqual(Decimal(changed["servings"]), 10)
        self.rejected("item.update", {"item_id": meal_item["id"], "follows_guests": True})
        self.rejected("item.update", {"item_id": explicit["id"], "servings": 2, "follows_guests": True})

    def test_guest_count_quantity_overflow_rolls_back_event_all_items_revision_and_receipt(self):
        selection = self.publish_recipe(amounts=(("jar", "100.000"), ("homemade", "1000000.000")))
        event = self.event(guests=2)
        ordinary = self.item("event", event, **selection)
        expensive = self.item("event", event, **{**selection, "options": {"variant_id": "homemade"}})
        override = self.item("event", event, **selection, servings=7)
        self.item("event", event, title="Bread", quantity="2", unit="loaf")
        self.item("event", event, kind="note", title="Keep reminder")
        items_before = self.items("event", event)
        event_before = self.response(self.get(f'/events/{event["id"]}'), 200)
        result = self.rejected("event.update", {"event_id": event["id"], "guests": 3,
                               "name": "Must roll back", "date": "2026-09-14", "time": "20:00"},
                               409, "catalog_unavailable")
        self.assertEqual(result["reason"], "quantity_out_of_range")
        self.assertEqual(self.response(self.get(f'/events/{event["id"]}'), 200), event_before)
        self.assertEqual(self.items("event", event), items_before)
        # A valid change still updates every follower, but no serving overrides.
        self.command("event.update", {"event_id": event["id"], "guests": 1})
        current = {row["id"]: row for row in self.items("event", event)}
        for row in items_before:
            expected = {**row, "servings": "1"} if row["id"] in {ordinary["id"], expensive["id"]} else row
            self.assert_item_equal(current[row["id"]], expected)
        self.assertEqual(Decimal(current[override["id"]]["servings"]), 7)

    def test_guest_count_revoked_follower_rolls_back_but_explicit_override_does_not_block(self):
        from planning_catalog import sync_catalog, set_availability
        from planning_catalog_models import PlanningCatalogEntry
        selection = self.publish_recipe()
        # Two immutable revisions let one follower remain eligible while another
        # is revoked, exercising rollback of the complete event command.
        with self.app.app_context():
            source = PlanningCatalogEntry.query.filter_by(entry_id=selection["entry_id"], revision=1).one()
            sync_catalog([{"entry_id": source.entry_id, "revision": 2, "kind": source.kind,
                           "availability": "published", "content": copy.deepcopy(source.content)}])
            self.db.session.commit()
        revoked_selection = {**selection, "catalog_revision": 2}
        blocked, allowed = self.event(guests=2), self.event(guests=2)
        self.item("event", blocked, **selection)
        self.item("event", blocked, **revoked_selection)
        self.item("event", blocked, **revoked_selection, servings=4)
        self.item("event", blocked, kind="note", title="Keep note")
        allowed_follower = self.item("event", allowed, **selection)
        allowed_override = self.item("event", allowed, **revoked_selection, servings=4)
        with self.app.app_context():
            set_availability(selection["entry_id"], 2, "revoked")
            self.db.session.commit()
        blocked_before = self.items("event", blocked)
        event_before = self.response(self.get(f'/events/{blocked["id"]}'), 200)
        result = self.rejected("event.update", {"event_id": blocked["id"], "guests": 5,
                               "name": "Must roll back", "date": "2026-09-15", "time": "19:00"},
                               409, "catalog_unavailable")
        self.assertEqual(result["reason"], "revoked")
        self.assertEqual(self.response(self.get(f'/events/{blocked["id"]}'), 200), event_before)
        self.assertEqual(self.items("event", blocked), blocked_before)
        # The unavailable explicit override isn't being changed or re-resolved.
        changed = self.command("event.update", {"event_id": allowed["id"], "guests": 5})
        self.assertEqual(changed["event"]["guests"], 5)
        current = {row["id"]: row for row in self.items("event", allowed)}
        self.assert_item_equal(current[allowed_follower["id"]], {**allowed_follower, "servings": "5"})
        self.assert_item_equal(current[allowed_override["id"]], allowed_override)
        self.assertEqual(self.items("event", blocked), blocked_before)

    def test_dish_options_are_per_item_and_copying_does_not_share_configuration(self):
        selection = self.publish_recipe()
        meal, event = self.meal(), self.event()
        first = self.item("meal", meal, **selection, servings=2)
        second = self.item("meal", meal, **selection, servings=4)
        copied = self.command("item.copy", {"item_id": first["id"], "parent_type": "event",
                              "parent_id": event["id"]}, 201)["item"]
        self.command("item.update", {"item_id": copied["id"], "options": {"variant_id": "homemade"}})
        current = {row["id"]: row for row in self.items("meal", meal)}
        self.assert_item_equal(current[first["id"]], first)
        self.assert_item_equal(current[second["id"]], second)
        self.assertEqual(self.items("event", event)[0]["options"], {"variant_id": "homemade"})
        before = self.snapshot()
        for item, variant, amount in ((first, "jar", "100.000"), (second, "jar", "200.000"),
                                      (copied, "homemade", "150.000")):
            result = self.response(self.get(f'/items/{item["id"]}/preview'), 200)
            self.assertEqual(result["preview"]["options"], {"variant_id": variant})
            self.assertEqual(result["preview"]["ingredients"][0]["amount"], amount)
        self.assertEqual(self.snapshot(), before)

    def test_invalid_dish_options_servings_and_unavailable_selections_are_atomic(self):
        selection = self.publish_recipe()
        meal = self.meal()
        item = self.item("meal", meal, **selection)
        base = {"parent_type": "meal", "parent_id": meal["id"], **selection}
        for fields in ({"servings": True}, {"servings": False}, {"servings": 1.5}, {"servings": 0},
                       {"servings": 1001}, {"servings": "1e9999"}, {"servings": "NaN"},
                       {"options": None}, {"options": []}, {"options": {}},
                       {"options": {"variant_id": "jar", "extra": "no"}},
                       {"options": {"variant_id": True}}, {"catalog_revision": True},
                       {"title": "Override"}, {"quantity": "2", "unit": "g"}):
            self.rejected("item.create", {**base, **fields})
        for fields in ({"options": {"variant_id": "missing"}}, {"entry_id": "missing-entry"},
                       {"catalog_revision": 2}):
            self.rejected("item.create", {**base, **fields}, 409, "catalog_unavailable")
        self.rejected("item.update", {"item_id": item["id"], "group": "Changed",
                      "options": {"variant_id": "missing"}}, 409, "catalog_unavailable")

    def test_dish_serving_updates_reject_fractional_strings_without_truncation(self):
        selection = self.publish_recipe()
        item = self.item("meal", self.meal(), **selection, servings=4)
        for servings in (True, False, 0, 1001, 1.5, "1.5", "2", "2.000", "NaN", "1e9999", None):
            with self.subTest(servings=servings):
                self.rejected("item.update", {"item_id": item["id"], "servings": servings})

    def test_dish_moves_follow_destination_event_and_clear_following_on_meal(self):
        selection = self.publish_recipe()
        first, second, meal = self.event(guests=6), self.event(guests=10), self.meal()
        follower = self.item("event", first, **selection)
        explicit = self.item("event", first, **selection, servings=3)
        moved = self.command("item.move", {"item_id": follower["id"], "parent_type": "event",
                             "parent_id": second["id"]})["item"]
        self.assertEqual(moved["id"], follower["id"])
        self.assertIs(moved["follows_guests"], True)
        self.assertEqual(Decimal(moved["servings"]), 10)
        moved_explicit = self.command("item.move", {"item_id": explicit["id"], "parent_type": "event",
                                      "parent_id": second["id"]})["item"]
        self.assertIs(moved_explicit["follows_guests"], False)
        self.assertEqual(Decimal(moved_explicit["servings"]), 3)
        moved_to_meal = self.command("item.move", {"item_id": follower["id"], "parent_type": "meal",
                                     "parent_id": meal["id"]})["item"]
        self.assertIs(moved_to_meal["follows_guests"], False)
        self.assertEqual(Decimal(moved_to_meal["servings"]), 10)
        self.command("event.update", {"event_id": second["id"], "guests": 12})
        self.assert_item_equal(self.items("meal", meal)[0], moved_to_meal)

    def test_dish_meal_copy_and_item_delete_undo_keep_exact_catalog_selection(self):
        selection = self.publish_recipe()
        plan = self.plan()
        meal = self.meal(plan)
        item = self.item("meal", meal, **{**selection, "language": "de",
                         "options": {"variant_id": "homemade"}}, servings=3)
        copied_meal = self.command("meal.copy", {"meal_id": meal["id"], "plan_id": plan["id"],
                                   "date": "2026-09-14"}, 201)["meal"]
        copied = self.items("meal", copied_meal)
        self.assertEqual(len(copied), 1)
        self.assertNotEqual(copied[0]["id"], item["id"])
        self.assert_item_equal(copied[0], {**item, "id": copied[0]["id"], "meal_id": copied_meal["id"]})
        preview = self.preview("item.delete", {"item_id": item["id"]})
        result = self.command("preview.confirm", {"preview_id": preview["id"]})
        self.assertEqual(self.items("meal", meal), [])
        self.command("undo.apply", {"undo_id": result["undo_id"]})
        self.assert_item_equal(self.items("meal", meal)[0], item)
        configured = self.response(self.get(f'/items/{item["id"]}/preview'), 200)["preview"]
        self.assertEqual(configured["language"], "de")
        self.assertEqual(configured["options"], {"variant_id": "homemade"})
        self.assertEqual(configured["ingredients"][0]["amount"], "225.000")

    def test_revoked_catalog_cannot_be_previewed_copied_moved_or_restored(self):
        from planning_catalog import set_availability
        selection = self.publish_recipe()
        plan = self.plan()
        meal, event = self.meal(plan), self.event()
        item = self.item("meal", meal, **selection)
        with self.app.app_context():
            set_availability(selection["entry_id"], 1, "revoked")
            self.db.session.commit()
        before = self.snapshot()
        unavailable = self.response(self.get(f'/items/{item["id"]}/preview'), 409)
        self.assertEqual((unavailable["code"], unavailable["reason"]), ("catalog_unavailable", "revoked"))
        self.assert_item_equal(self.items("meal", meal)[0], item)
        self.assertEqual(self.snapshot(), before)
        for operation in ("item.copy", "item.move"):
            self.rejected(operation, {"item_id": item["id"], "parent_type": "event", "parent_id": event["id"]},
                          409, "catalog_unavailable")
        self.rejected("item.update", {"item_id": item["id"], "options": {"variant_id": "homemade"}},
                      409, "catalog_unavailable")
        self.rejected("meal.copy", {"meal_id": meal["id"], "plan_id": plan["id"], "date": "2026-09-14"},
                      409, "catalog_unavailable")
        preview = self.preview("item.delete", {"item_id": item["id"]})
        result = self.command("preview.confirm", {"preview_id": preview["id"]})
        self.rejected("undo.apply", {"undo_id": result["undo_id"]}, 409, "catalog_unavailable")
        self.assertEqual(self.items("meal", meal), [])


if __name__ == "__main__":
    unittest.main()
