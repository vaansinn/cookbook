"""Independent repeat regressions through real revisioned HTTP commands.

Uses the established synthetic SQLite/catalog harness, never fixture schema or
dispatch mocks. Production PostgreSQL acceptance belongs to the coordinator.
"""
import copy
from datetime import date, timedelta
import os
import sys
import unittest
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, os.path.dirname(__file__))
import test_planning_items as harness

BASE, DATE = harness.BASE, harness.DATE


class PlanningRepeatTest(unittest.TestCase):
    get = harness.PlanningItemsTest.get
    response = harness.PlanningItemsTest.response
    body = harness.PlanningItemsTest.body
    post = harness.PlanningItemsTest.post
    command = harness.PlanningItemsTest.command
    plan = harness.PlanningItemsTest.plan
    meal = harness.PlanningItemsTest.meal
    event = harness.PlanningItemsTest.event
    item = harness.PlanningItemsTest.item
    items = harness.PlanningItemsTest.items
    preview = harness.PlanningItemsTest.preview
    snapshot = harness.PlanningItemsTest.snapshot
    rejected = harness.PlanningItemsTest.rejected
    assert_item_equal = harness.PlanningItemsTest.assert_item_equal
    publish_recipe = harness.PlanningItemsTest.publish_recipe

    def setUp(self):
        harness.PlanningItemsTest.setUp(self)
        from sqlalchemy import event
        with self.app.app_context():
            engine = self.db.engine
            event.listen(engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
            self.db.session.execute(self.db.text("PRAGMA foreign_keys=ON"))
            self.db.session.commit()
        self.addCleanup(engine.dispose)

    def export(self, headers=None):
        return self.response(self.client.get("/api/auth/me/export",
                             headers=self.headers if headers is None else headers), 200)["private_planning"]

    def graph(self):
        selection = self.publish_recipe()
        plan, other = self.plan(), self.plan()
        first, second = self.meal(plan), self.meal(plan)
        last = self.command("meal.create", {"plan_id": plan["id"], "date": "2026-09-19",
                            "name": "Last dinner", "time": "19:00"}, 201)["meal"]
        inside = self.command("event.create", {"name": "Inside", "date": "2026-09-14",
                              "time": "18:00", "guests": 6}, 201)["event"]
        outside = self.command("event.create", {"name": "Outside", "date": "2026-09-23",
                               "time": None, "guests": 2}, 201)["event"]
        for linked_plan, event in ((plan, inside), (plan, outside), (other, inside)):
            self.command("event.link", {"plan_id": linked_plan["id"], "event_id": event["id"]}, 201)
        self.command("event.link", {"plan_id": plan["id"], "event_id": inside["id"]})
        self.item("meal", first, **selection, servings=2, group="Main")
        self.item("meal", first, title="Bread", quantity="1.125", unit="loaf", contribution="Alex")
        self.item("meal", second, kind="note", title="Coffee")
        self.item("meal", last, title="Salad")
        self.item("event", inside, **selection, group="Main")
        self.item("event", inside, **{**selection, "options": {"variant_id": "homemade"}}, servings=3)
        self.item("event", inside, title="Contribution", contribution="Sam", quantity="2", unit="piece")
        self.item("event", outside, kind="note", title="Independent reminder")
        for event, bucket, done in ((inside, "earlier", True), (inside, "day", False), (outside, "serving", True)):
            task = self.command("task.create", {"event_id": event["id"], "bucket": bucket,
                                "text": "Prep " + bucket}, 201)["task"]
            if done:
                self.command("task.update", {"task_id": task["id"], "done": True})
        return plan, inside, outside

    def assert_originals_preserved(self, before, after):
        for key in ("plans", "meals", "events", "event_links", "preparation_tasks", "items"):
            current = {row["id"]: row for row in after[key]}
            for row in before[key]:
                self.assertEqual(current[row["id"]], row, (key, row["id"]))

    def test_plan_repeat_shifts_full_graph_and_copies_distinct_live_events(self):
        plan, inside, outside = self.graph()
        before = self.export()
        result = self.command("plan.copy", {"plan_id": plan["id"], "name": "  Next week  ",
                              "start_date": "2026-09-20"}, 201)
        self.assertEqual(set(result), {"plan", "counts", "revision"})
        self.assertEqual(result["counts"], {"plans": 1, "meals": 3, "events": 2, "links": 2, "tasks": 3, "items": 8})
        copied = result["plan"]
        self.assertEqual((copied["name"], copied["start_date"], copied["end_date"]),
                         ("Next week", "2026-09-20", "2026-09-26"))
        after = self.export()
        self.assert_originals_preserved(before, after)
        old_meals = sorted((m for m in before["meals"] if m["plan_id"] == plan["id"]), key=lambda m: (m["date"], m["position"]))
        new_meals = sorted((m for m in after["meals"] if m["plan_id"] == copied["id"]), key=lambda m: (m["date"], m["position"]))
        self.assertEqual(len(new_meals), 3)
        meal_map = {}
        for old, new in zip(old_meals, new_meals):
            meal_map[old["id"]] = new["id"]
            self.assertNotEqual(old["id"], new["id"])
            shifted = (date.fromisoformat(old["date"]) + timedelta(days=7)).isoformat()
            self.assertEqual(new, {**old, "id": new["id"], "plan_id": copied["id"], "date": shifted})
        links = self.response(self.get(f'/plans/{copied["id"]}/events'), 200)["links"]
        self.assertEqual(len(links), 2)
        self.assertEqual({link["in_range"] for link in links}, {True, False})
        event_map = {}
        for original in (inside, outside):
            link = next(link for link in links if link["event"]["name"] == original["name"])
            new = link["event"]
            event_map[original["id"]] = new["id"]
            self.assertNotIn(new["id"], {inside["id"], outside["id"]})
            expected = {**original, "id": new["id"], "created_at": new["created_at"],
                        "date": (date.fromisoformat(original["date"]) + timedelta(days=7)).isoformat()}
            self.assertEqual(new, expected)
            self.assertEqual(link["plan_id"], copied["id"])
        for old in before["preparation_tasks"]:
            new = next(t for t in after["preparation_tasks"] if t["event_id"] == event_map[old["event_id"]]
                       and t["position"] == old["position"])
            self.assertNotEqual(new["id"], old["id"])
            self.assertEqual(new, {**old, "id": new["id"], "event_id": event_map[old["event_id"]], "done": False})
        for old in before["items"]:
            parent_field = "meal_id" if old["meal_id"] else "event_id"
            parent_id = (meal_map if old["meal_id"] else event_map)[old[parent_field]]
            new = next(i for i in after["items"] if i[parent_field] == parent_id and i["position"] == old["position"])
            self.assertNotEqual(new["id"], old["id"])
            self.assertEqual(new, {**old, "id": new["id"], parent_field: parent_id})
        self.assertEqual(len(after["mutations"]), len(before["mutations"]) + 1)
        with self.app.app_context():
            self.assertEqual(self.db.session.execute(self.db.text("PRAGMA foreign_key_check")).all(), [])

    def test_event_repeat_has_no_links_resets_tasks_and_keeps_menu_independent(self):
        _, source, _ = self.graph()
        before = self.export()
        result = self.command("event.copy", {"event_id": source["id"], "name": "Repeat occasion", "date": "2027-01-02"}, 201)
        copied = result["event"]
        self.assertEqual(set(result), {"event", "counts", "revision"})
        self.assertEqual(result["counts"], {"plans": 0, "meals": 0, "events": 1, "links": 0, "tasks": 2, "items": 3})
        self.assertEqual(copied, {**source, "id": copied["id"], "created_at": copied["created_at"],
                                 "name": "Repeat occasion", "date": "2027-01-02"})
        after = self.export()
        self.assert_originals_preserved(before, after)
        self.assertEqual(after["event_links"], before["event_links"])
        new_tasks = self.response(self.get(f'/events/{copied["id"]}/tasks'), 200)["tasks"]
        self.assertEqual(len(new_tasks), 2)
        self.assertTrue(all(task["done"] is False for task in new_tasks))
        new_items = self.items("event", copied)
        follower = next(item for item in new_items if item["follows_guests"])
        self.command("item.update", {"item_id": follower["id"], "options": {"variant_id": "homemade"}})
        self.command("event.update", {"event_id": copied["id"], "guests": 8})
        self.command("task.update", {"task_id": new_tasks[0]["id"], "text": "Independent prep", "done": True})
        self.assert_originals_preserved(before, self.export())

    def test_both_repeats_replay_exact_compact_receipts_without_history_or_check_duplication(self):
        plan, event, _ = self.graph()
        proposal = self.preview("event.delete", {"event_id": event["id"]})
        before = self.export()
        records = []
        for operation, payload in (("plan.copy", {"plan_id": plan["id"], "name": "Repeat", "start_date": DATE}),
                                   ("event.copy", {"event_id": event["id"], "name": "Repeat", "date": DATE})):
            body = self.body(operation, payload)
            response = self.post(body)
            result = self.response(response, 201)
            self.assertLess(len(response.get_data()), 16 * 1024)
            records.append((body, result, response.get_data()))
        after = self.export()
        self.assertEqual(after["previews"], [proposal])
        self.assertEqual(after["undo"], before["undo"])
        self.assertEqual(len(after["mutations"]), len(before["mutations"]) + 2)
        self.assertEqual(after["mutations"][:len(before["mutations"])], before["mutations"])
        snapshot = self.snapshot()
        with patch("routes.planning.MAX_MUTATIONS", 0), patch("planning_events.MAX_EVENTS", 0):
            for body, expected, raw in records:
                replay = self.post(body)
                self.assertEqual(self.response(replay, 201), expected)
                self.assertEqual(replay.get_data(), raw)
                self.assertEqual(self.response(self.get("/mutations/" + body["mutation_id"]), 200),
                                 {"result": expected, "status_code": 201})
        self.assertEqual(self.snapshot(), snapshot)
        changed = copy.deepcopy(records[0][0])
        changed["payload"]["name"] = "Changed body"
        self.assertEqual(self.response(self.post(changed), 409)["code"], "mutation_conflict")
        stale = self.body("event.copy", {"event_id": event["id"], "name": "Stale", "date": DATE}, revision=0)
        self.assertEqual(self.response(self.post(stale), 409)["code"], "revision_conflict")
        self.assertEqual(self.snapshot(), snapshot)

    def test_closed_payload_validation_and_foreign_sources_never_create_workspace(self):
        plan, event = self.plan(), self.event()
        for operation, payload, identity in (("plan.copy", {"plan_id": plan["id"], "name": "Copy", "start_date": DATE}, "plan_id"),
                                              ("event.copy", {"event_id": event["id"], "name": "Copy", "date": DATE}, "event_id")):
            for malformed in (None, [], True, {**payload, "workspace_id": str(uuid4())}, {**payload, "name": " "},
                              {**payload, "name": "x" * 161}, {**payload, "name": "bad\nname"},
                              {**payload, identity: True}, {**payload, identity: "bad"}):
                self.rejected(operation, malformed, headers=self.other_headers)
            for field in payload:
                self.rejected(operation, {k: v for k, v in payload.items() if k != field}, headers=self.other_headers)
            denied = self.rejected(operation, payload, 404, "not_found", self.other_headers)
            absent = self.rejected(operation, {**payload, identity: str(uuid4())}, 404, "not_found", self.other_headers)
            self.assertEqual(denied, absent)
        self.assertEqual(self.response(self.get("/workspace", self.other_headers), 200), {"workspace": None, "revision": 0})

    def test_date_overflow_in_plan_end_or_outside_link_is_atomic_and_730_days_survive(self):
        plan = self.command("plan.create", {"name": "Max range", "start_date": "2024-01-01",
                            "end_date": "2025-12-30"}, 201)["plan"]
        self.rejected("plan.copy", {"plan_id": plan["id"], "name": "Overflow", "start_date": "9999-12-31"})
        copied = self.command("plan.copy", {"plan_id": plan["id"], "name": "Valid range", "start_date": "2026-01-01"}, 201)["plan"]
        self.assertEqual((date.fromisoformat(copied["end_date"]) - date.fromisoformat(copied["start_date"])).days, 729)
        short = self.command("plan.create", {"name": "Short", "start_date": DATE, "end_date": DATE}, 201)["plan"]
        for event_date, destination in (("9999-12-31", "2026-09-14"), ("0001-01-01", "2026-09-12")):
            event = self.command("event.create", {"name": "Outside", "date": event_date}, 201)["event"]
            link = self.command("event.link", {"plan_id": short["id"], "event_id": event["id"]}, 201)["link"]
            self.rejected("plan.copy", {"plan_id": short["id"], "name": "Overflow", "start_date": destination})
            preview = self.preview("event.unlink", {"link_id": link["id"]})
            self.command("preview.confirm", {"preview_id": preview["id"]})
        for value in (None, True, "10000-01-01", "2026-02-30"):
            self.rejected("event.copy", {"event_id": event["id"], "name": "Invalid", "date": value})

    def test_full_aggregate_limits_are_checked_before_any_clone_flush(self):
        from planning_repeat import apply
        from planning_models import PlanningWorkspace
        from routes.planning import PlanningError
        plan, event, _ = self.graph()
        payload = {"plan_id": plan["id"], "name": "Over quota", "start_date": DATE}
        cases = (("routes.planning.MAX_PLANS", 2), ("routes.planning.MAX_WORKSPACE_MEALS", 5),
                 ("routes.planning.MAX_MEALS", 2), ("routes.planning.MAX_DAY_MEALS", 1),
                 ("planning_events.MAX_EVENTS", 3), ("planning_events.MAX_LINKS", 4),
                 ("planning_events.MAX_WORKSPACE_TASKS", 5), ("planning_events.MAX_EVENT_TASKS", 1),
                 ("planning_items.MAX_ITEMS", 15), ("planning_items.MAX_PARENT_ITEMS", 2))
        for constant, limit in cases:
            with self.subTest(constant=constant), patch(constant, limit):
                self.rejected("plan.copy", payload, 409, "limit_reached")
                with self.app.app_context():
                    owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
                    with patch.object(self.db.session, "flush", side_effect=AssertionError("Preflight flushed")):
                        with self.assertRaises(PlanningError) as caught:
                            apply(owner, "plan.copy", payload)
                        self.assertEqual(caught.exception.body["code"], "limit_reached")
                    self.db.session.rollback()
        with patch("planning_events.MAX_EVENTS", 2):
            self.rejected("event.copy", {"event_id": event["id"], "name": "Over", "date": DATE}, 409, "limit_reached")
        # Exact aggregate capacities allow every new row, including all links.
        with patch("routes.planning.MAX_PLANS", 3), patch("routes.planning.MAX_WORKSPACE_MEALS", 6), \
                patch("planning_events.MAX_EVENTS", 4), patch("planning_events.MAX_LINKS", 5), \
                patch("planning_events.MAX_WORKSPACE_TASKS", 6), patch("planning_items.MAX_ITEMS", 16):
            self.command("plan.copy", {**payload, "name": "At limit"}, 201)

    def test_revoked_catalog_in_any_child_rejects_whole_copy_before_flush(self):
        from planning_catalog import sync_catalog, set_availability, CatalogError
        from planning_catalog_models import PlanningCatalogEntry
        from planning_repeat import apply
        from planning_models import PlanningWorkspace
        plan, eligible_event, event = self.graph()
        # Only an outside linked event has the subsequently revoked selection.
        # Every meal and the inside occasion remain eligible for copying.
        with self.app.app_context():
            source = PlanningCatalogEntry.query.filter_by(entry_id="synthetic-item-recipe", revision=1).one()
            sync_catalog([{"entry_id": source.entry_id, "revision": 2, "kind": source.kind,
                           "availability": "published", "content": copy.deepcopy(source.content)}])
            self.db.session.commit()
        self.item("event", event, kind="dish", entry_id="synthetic-item-recipe", catalog_revision=2,
                  language="en", options={"variant_id": "jar"})
        with self.app.app_context():
            set_availability("synthetic-item-recipe", 2, "revoked")
            self.db.session.commit()
        for operation, payload in (("plan.copy", {"plan_id": plan["id"], "name": "Copy", "start_date": DATE}),
                                   ("event.copy", {"event_id": event["id"], "name": "Copy", "date": DATE})):
            self.rejected(operation, payload, 409, "catalog_unavailable")
            with self.app.app_context():
                owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
                with patch.object(self.db.session, "flush", side_effect=AssertionError("Preflight flushed")):
                    with self.assertRaises(CatalogError) as caught:
                        apply(owner, operation, payload)
                    self.assertEqual(caught.exception.body["reason"], "revoked")
                self.db.session.rollback()
        self.command("event.copy", {"event_id": eligible_event["id"], "name": "Still eligible", "date": DATE}, 201)

    def test_overlong_stored_source_range_is_rejected_before_any_clone_flush(self):
        from planning_models import PrivatePlan, PlanningWorkspace
        from planning_repeat import apply
        from routes.planning import PlanningError
        plan = self.plan()
        # Deliberate drift in helper-owned SQLite; do not manufacture schema.
        with self.app.app_context():
            source = self.db.session.get(PrivatePlan, plan["id"])
            source.end_date = source.start_date + timedelta(days=730)
            self.db.session.commit()
        payload = {"plan_id": plan["id"], "name": "Too long", "start_date": DATE}
        self.rejected("plan.copy", payload)
        with self.app.app_context():
            owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
            with patch.object(self.db.session, "flush", side_effect=AssertionError("Invalid range flushed")):
                with self.assertRaises(PlanningError) as caught:
                    apply(owner, "plan.copy", payload)
                self.assertEqual(caught.exception.status, 400)
            self.db.session.rollback()

    def test_failure_after_copy_flush_rolls_back_entire_graph_and_can_retry(self):
        from routes.planning import apply_command
        from sqlalchemy.exc import SQLAlchemyError
        plan, event, _ = self.graph()
        def fail_after_apply(*args, **kwargs):
            apply_command(*args, **kwargs)
            raise SQLAlchemyError("Synthetic failure after full repeat flush")
        for operation, payload in (("plan.copy", {"plan_id": plan["id"], "name": "Copy", "start_date": DATE}),
                                   ("event.copy", {"event_id": event["id"], "name": "Copy", "date": DATE})):
            body = self.body(operation, payload)
            before = self.snapshot()
            with patch("routes.planning.apply_command", side_effect=fail_after_apply):
                self.assertEqual(self.response(self.post(body), 503)["code"], "planning_unavailable")
            self.assertEqual(self.snapshot(), before)
            self.response(self.get("/mutations/" + body["mutation_id"]), 404)
            self.response(self.post(body), 201)


if __name__ == "__main__":
    unittest.main()
