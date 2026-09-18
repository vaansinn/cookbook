"""Actual HTTP regressions for bounded private-planning proposals and undo.

Run with the project venv: python -B tests/backend/test_planning_changes.py -v.
Reuse the existing synthetic SQLite harness; never import a developer dotenv.
Only clock/DB-failure injection and deliberate stored-data drift bypass HTTP.
"""

import copy
from datetime import datetime, timedelta
import json
import os
import sys
import unittest
from unittest.mock import patch
import uuid

sys.path.insert(0, os.path.dirname(__file__))
import test_private_planning as harness

BASE, START, END = harness.BASE, harness.START, harness.END
DOMAIN = ("plans", "meals", "events", "event_links", "preparation_tasks")
EFFECT_KEYS = ("plans", "meals", "events", "links", "tasks")


class PlanningChangesTest(unittest.TestCase):
    # Reuse setup/utilities without inheriting and rerunning the foundation suite.
    body = harness.PrivatePlanningTest.body
    post = harness.PrivatePlanningTest.post
    get = harness.PrivatePlanningTest.get
    assert_response = harness.PrivatePlanningTest.assert_response
    snapshot = harness.PrivatePlanningTest.snapshot
    seed_legacy = harness.PrivatePlanningTest.seed_legacy

    def setUp(self):
        self.dotenv = patch("dotenv.load_dotenv", return_value=False)
        self.dotenv.start()
        self.addCleanup(self.dotenv.stop)
        harness.PrivatePlanningTest.setUp(self)
        from planning_models import (
            PrivateEvent, PrivateEventLink, PrivatePreparationTask,
            PlanningPreview, PlanningUndo,
        )
        self.planning_models += (PrivateEvent, PrivateEventLink,
                                 PrivatePreparationTask, PlanningPreview, PlanningUndo)
        # The parallel item/catalog integration registers its models in create_app.
        # Do not import half-integrated modules or manufacture missing schema.
        self.planning_models += tuple(
            mapper.class_ for mapper in self.db.Model.registry.mappers
            if mapper.local_table.name == "private_planned_items"
        )
        # Exercise real dependency order as well as the default harness behavior.
        from sqlalchemy import event
        with self.app.app_context():
            self.engine = self.db.engine
            def foreign_keys(connection, _record):
                connection.execute("PRAGMA foreign_keys=ON")
            event.listen(self.engine, "connect", foreign_keys)
            self.db.session.execute(self.db.text("PRAGMA foreign_keys=ON"))
            self.db.session.commit()
        self.addCleanup(self.engine.dispose)

    def revision(self, headers=None):
        return self.assert_response(self.get("/workspace", headers), 200)["revision"]

    def export(self, headers=None):
        return self.assert_response(self.client.get(
            "/api/auth/me/export", headers=self.headers if headers is None else headers,
        ), 200)["private_planning"]

    def domain(self, headers=None):
        data = self.export(headers)
        return {key: data[key] for key in (*DOMAIN, "items") if key in data}

    def command(self, operation, payload, headers=None, status=200):
        revision = self.revision(headers)
        result = self.assert_response(self.post(self.body(
            operation, payload, revision), headers), status)
        self.assertEqual(result["revision"], revision + 1)
        return result

    def plan(self, headers=None, **fields):
        return self.command("plan.create", {
            "name": "Week", "start_date": START, "end_date": END, **fields,
        }, headers, 201)["plan"]

    def meal(self, plan, headers=None, **fields):
        return self.command("meal.create", {
            "plan_id": plan["id"], "date": START, "name": "Soup", "time": "12:30",
            **fields,
        }, headers, 201)["meal"]

    def event(self, headers=None, **fields):
        return self.command("event.create", {
            "name": "Dinner", "date": END, "time": "18:30", "guests": 7, **fields,
        }, headers, 201)["event"]

    def link(self, plan, event, headers=None):
        return self.command("event.link", {
            "plan_id": plan["id"], "event_id": event["id"],
        }, headers, 201)["link"]

    def task(self, event, headers=None, **fields):
        return self.command("task.create", {
            "event_id": event["id"], "bucket": "earlier", "text": "Chop vegetables",
            **fields,
        }, headers, 201)["task"]

    def fixture(self, headers=None):
        first, second = self.plan(headers), self.plan(headers, name="Other week")
        meals = [self.meal(first, headers, date=day) for day in
                 (START, "2026-09-15", END)]
        self.meal(second, headers, name="Untouched")
        event = self.event(headers)
        links = [self.link(plan, event, headers) for plan in (first, second)]
        tasks = [self.task(event, headers, bucket=bucket) for bucket in
                 ("earlier", "day", "serving")]
        tasks[1] = self.command("task.update", {
            "task_id": tasks[1]["id"], "done": True,
        }, headers)["task"]
        return {"first": first, "second": second, "meals": meals,
                "event": event, "links": links, "tasks": tasks}

    def preview_body(self, operation, payload, revision=None, headers=None):
        return {"operation": operation, "payload": payload,
                "expected_workspace_revision": self.revision(headers) if revision is None else revision}

    def post_preview(self, body, headers=None):
        return self.client.post(BASE + "/previews", json=body,
                                headers=self.headers if headers is None else headers)

    def preview(self, operation, payload, headers=None):
        body = self.preview_body(operation, payload, headers=headers)
        result = self.assert_response(self.post_preview(body, headers), 201)
        self.assertEqual(result["revision"], body["expected_workspace_revision"])
        proposal = result["preview"]
        self.assertEqual(proposal["revision"], result["revision"])
        self.assertEqual(proposal["operation"], operation)
        self.assertEqual(proposal["payload"], payload)
        self.assertEqual(str(uuid.UUID(proposal["id"])), proposal["id"])
        return proposal

    def confirm(self, proposal, headers=None):
        return self.command("preview.confirm", {"preview_id": proposal["id"]}, headers)

    def undo(self, result, headers=None):
        return self.command("undo.apply", {"undo_id": result["undo_id"]}, headers)

    def assert_effects(self, proposal, **rows):
        actual = proposal["effects"]["affected"]
        self.assertTrue(set(EFFECT_KEYS) <= set(actual))
        expected = {key: sorted(rows.get(key, []), key=lambda row: row["id"])
                    for key in set(actual) | set(rows)}
        self.assertEqual(actual, expected)

    def assert_rejected(self, body, status, code=None, *, preview=False, headers=None):
        before = self.snapshot()
        response = self.post_preview(body, headers) if preview else self.post(body, headers)
        result = self.assert_response(response, status)
        if code:
            self.assertEqual(result["code"], code)
        self.assertEqual(self.snapshot(), before, "Rejected operation wrote persistent state")
        return result

    def test_preview_is_201_without_domain_revision_receipt_or_other_data_changes(self):
        self.seed_legacy()
        plan = self.plan()
        self.meal(plan)
        before = self.snapshot()
        frozen = datetime(2026, 9, 13, 12, 0)
        with patch("planning_changes.datetime") as clock:
            clock.utcnow.return_value = frozen
            proposal = self.preview("plan.delete", {"plan_id": plan["id"]})
        self.assertEqual(proposal["expires_at"], "2026-09-13T12:10:00Z")
        self.assertEqual(self.revision(), 2)
        after = self.snapshot()
        for table in before:
            if table != "planning_previews":
                self.assertEqual(after[table], before[table], table)
        self.assertEqual(len(after["planning_previews"]), 1)
        self.assertEqual(self.export()["previews"], [proposal])

    def test_plan_delete_preserves_live_event_tasks_other_plan_and_restores_all_ids(self):
        self.seed_legacy()
        data = self.fixture()
        self.fixture(self.other_headers)
        foreign, legacy, before = self.export(self.other_headers), self.snapshot(legacy_only=True), self.domain()
        proposal = self.preview("plan.delete", {"plan_id": data["first"]["id"]})
        self.assert_effects(proposal, plans=[data["first"]], meals=data["meals"], links=[data["links"][0]])
        self.assertTrue(proposal["effects"]["events_preserved"])
        result = self.confirm(proposal)
        expected = copy.deepcopy(before)
        expected["plans"] = [data["second"]]
        expected["meals"] = [m for m in before["meals"] if m["plan_id"] == data["second"]["id"]]
        expected["event_links"] = [data["links"][1]]
        self.assertEqual(self.domain(), expected)
        self.assert_response(self.get("/plans/" + data["first"]["id"]), 404)
        self.assertEqual(self.get("/events/" + data["event"]["id"]).get_json()["event"], data["event"])
        self.assertTrue(self.undo(result)["restored"])
        self.assertEqual(self.domain(), before)
        self.assertEqual(self.export(self.other_headers), foreign)
        self.assertEqual(self.snapshot(legacy_only=True), legacy)
        with self.app.app_context():
            self.assertEqual(self.db.session.execute(self.db.text("PRAGMA foreign_key_check")).all(), [])

    def test_event_delete_captures_links_across_plans_and_all_tasks_then_restores_ids(self):
        data = self.fixture()
        retained = self.event(name="Independent event")
        self.task(retained)
        before = self.domain()
        proposal = self.preview("event.delete", {"event_id": data["event"]["id"]})
        self.assert_effects(proposal, events=[data["event"]], links=data["links"], tasks=data["tasks"])
        result = self.confirm(proposal)
        expected = copy.deepcopy(before)
        expected["events"] = [retained]
        expected["event_links"] = []
        expected["preparation_tasks"] = [t for t in before["preparation_tasks"] if t["event_id"] == retained["id"]]
        self.assertEqual(self.domain(), expected)
        for plan in (data["first"], data["second"]):
            self.assertEqual(self.get(f'/plans/{plan["id"]}/events').get_json()["links"], [])
        self.undo(result)
        self.assertEqual(self.domain(), before)

    def test_resize_only_removes_outside_meals_and_exposes_preserved_outside_events(self):
        data = self.fixture()
        for day in ("2026-09-14", "2026-09-16"):
            self.meal(data["first"], date=day)
        inside = self.event(date="2026-09-15", name="Inside")
        self.link(data["first"], inside)
        self.event(date=END, name="Unlinked outside")
        before = self.domain()
        proposal = self.preview("plan.resize", {
            "plan_id": data["first"]["id"], "start_date": "2026-09-14", "end_date": "2026-09-16",
        })
        self.assert_effects(proposal, plans=[data["first"]], meals=[data["meals"][0], data["meals"][2]])
        self.assertEqual(proposal["effects"]["linked_events_outside_range"], [data["event"]])
        self.assertTrue(proposal["effects"]["events_preserved"])
        result = self.confirm(proposal)
        expected = copy.deepcopy(before)
        for plan in expected["plans"]:
            if plan["id"] == data["first"]["id"]:
                plan.update(start_date="2026-09-14", end_date="2026-09-16")
        expected["meals"] = [m for m in before["meals"] if m["plan_id"] != data["first"]["id"] or "2026-09-14" <= m["date"] <= "2026-09-16"]
        self.assertEqual(self.domain(), expected)
        links = self.get(f'/plans/{data["first"]["id"]}/events').get_json()["links"]
        self.assertEqual({link["event_id"]: link["in_range"] for link in links},
                         {data["event"]["id"]: False, inside["id"]: True})
        self.undo(result)
        self.assertEqual(self.domain(), before)

    def test_single_record_deletes_and_unlink_restore_only_the_selected_record(self):
        data = self.fixture()
        cases = (
            ("meal.delete", "meal_id", "meals", "meals", data["meals"][1]),
            ("task.delete", "task_id", "tasks", "preparation_tasks", data["tasks"][1]),
            ("event.unlink", "link_id", "links", "event_links", data["links"][0]),
        )
        for operation, field, effect, collection, row in cases:
            with self.subTest(operation=operation):
                before = self.domain()
                proposal = self.preview(operation, {field: row["id"]})
                self.assert_effects(proposal, **{effect: [row]})
                result = self.confirm(proposal)
                expected = copy.deepcopy(before)
                expected[collection] = [r for r in expected[collection] if r["id"] != row["id"]]
                self.assertEqual(self.domain(), expected)
                self.undo(result)
                self.assertEqual(self.domain(), before)

    def test_destructive_operations_cannot_bypass_previews_through_commands(self):
        data = self.fixture()
        for operation, payload in self.targets(data):
            with self.subTest(operation=operation):
                self.assert_rejected(self.body(operation, payload, self.revision()), 400, "invalid_request")

    def targets(self, data):
        return (
            ("plan.delete", {"plan_id": data["first"]["id"]}),
            ("plan.resize", {"plan_id": data["first"]["id"], "start_date": START, "end_date": START}),
            ("meal.delete", {"meal_id": data["meals"][0]["id"]}),
            ("event.delete", {"event_id": data["event"]["id"]}),
            ("task.delete", {"task_id": data["tasks"][0]["id"]}),
            ("event.unlink", {"link_id": data["links"][0]["id"]}),
        )

    def test_confirm_replay_after_undo_returns_old_result_without_reapplying(self):
        plan = self.plan()
        self.meal(plan)
        original = self.domain()
        proposal = self.preview("plan.delete", {"plan_id": plan["id"]})
        body = self.body("preview.confirm", {"preview_id": proposal["id"]}, self.revision())
        response = self.post(body)
        result = self.assert_response(response, 200)
        self.undo(result)
        self.assertEqual(self.domain(), original)
        before = self.snapshot()
        replay = self.post(body)
        self.assertEqual(self.assert_response(replay, 200), result)
        self.assertEqual(replay.get_data(), response.get_data())
        self.assertEqual(self.get("/mutations/" + body["mutation_id"]).get_json(),
                         {"result": result, "status_code": 200})
        self.assertEqual(self.snapshot(), before)
        changed = {**body, "expected_workspace_revision": self.revision()}
        self.assert_rejected(changed, 409, "mutation_conflict")
        self.assert_rejected(self.body("preview.confirm", {"preview_id": proposal["id"]}, self.revision()), 404)

    def test_confirm_reserves_final_receipt_slot_for_immediate_undo_and_replay(self):
        plan = self.plan()
        self.meal(plan)
        original = self.domain()
        proposal = self.preview("plan.delete", {"plan_id": plan["id"]})
        count = len(self.export()["mutations"])
        self.assertEqual(count, 2)
        confirm_body = self.body("preview.confirm", {"preview_id": proposal["id"]}, self.revision())
        with patch("routes.planning.MAX_MUTATIONS", count + 2):
            confirmed = self.assert_response(self.post(confirm_body), 200)
            self.assertEqual(len(self.export()["mutations"]), count + 1)
            self.assertEqual(self.export()["previews"], [])
            self.assertEqual(self.domain()["plans"], [])
            self.assertEqual(self.export()["undo"][0]["id"], confirmed["undo_id"])
            undo_body = self.body("undo.apply", {"undo_id": confirmed["undo_id"]}, self.revision())
            restored = self.assert_response(self.post(undo_body), 200)
            self.assertTrue(restored["restored"])
            self.assertEqual(restored["revision"], confirmed["revision"] + 1)
            self.assertEqual(len(self.export()["mutations"]), count + 2)
            self.assertEqual(self.domain(), original)
            self.assertEqual(self.export()["undo"], [])
            # Both saved responses remain replayable at the now-full quota.
            before = self.snapshot()
            self.assertEqual(self.assert_response(self.post(confirm_body), 200), confirmed)
            self.assertEqual(self.assert_response(self.post(undo_body), 200), restored)
            self.assertEqual(self.snapshot(), before)
            self.assert_rejected(self.body("plan.rename", {"plan_id": plan["id"], "name": "Over quota"},
                                 self.revision()), 409, "limit_reached")

    def test_confirm_capacity_failure_preserves_preview_domain_revision_receipt_and_existing_undo(self):
        plan = self.plan()
        removed = self.meal(plan)
        previous = self.confirm(self.preview("meal.delete", {"meal_id": removed["id"]}))
        proposal = self.preview("plan.delete", {"plan_id": plan["id"]})
        count = len(self.export()["mutations"])
        self.assertEqual(count, 3)
        original = self.domain()
        revision = self.revision()
        confirm_body = self.body("preview.confirm", {"preview_id": proposal["id"]}, revision)
        # One free receipt can record removal, but cannot also record its undo.
        with patch("routes.planning.MAX_MUTATIONS", count + 1):
            self.assert_rejected(confirm_body, 409, "limit_reached")
            self.assert_response(self.get("/mutations/" + confirm_body["mutation_id"]), 404)
            self.assertEqual(self.export()["previews"], [proposal])
            self.assertEqual(self.export()["undo"][0]["id"], previous["undo_id"])
            self.assertEqual(self.domain(), original)
            self.assertEqual(self.revision(), revision)
            self.assertEqual(len(self.export()["mutations"]), count)
        # No receipt or preview was consumed: the exact request can be retried.
        with patch("routes.planning.MAX_MUTATIONS", count + 2):
            confirmed = self.assert_response(self.post(confirm_body), 200)
            self.assertEqual(confirmed["revision"], revision + 1)
            self.assertNotEqual(confirmed["undo_id"], previous["undo_id"])
            self.undo(confirmed)
            self.assertEqual(self.domain(), original)
            self.assertEqual(len(self.export()["mutations"]), count + 2)

    def test_undo_replay_is_idempotent_and_fresh_reuse_is_rejected(self):
        plan = self.plan()
        proposal = self.preview("plan.delete", {"plan_id": plan["id"]})
        result = self.confirm(proposal)
        body = self.body("undo.apply", {"undo_id": result["undo_id"]}, self.revision())
        restored = self.assert_response(self.post(body), 200)
        before = self.snapshot()
        self.assertEqual(self.assert_response(self.post(body), 200), restored)
        self.assertEqual(self.snapshot(), before)
        self.assert_rejected(self.body("undo.apply", body["payload"], self.revision()), 404)

    def test_undo_requires_exact_successor_and_does_not_overwrite_new_changes(self):
        plan, other = self.plan(), self.plan(name="Retained")
        proposal = self.preview("plan.delete", {"plan_id": plan["id"]})
        result = self.confirm(proposal)
        self.assert_rejected(self.body("undo.apply", {"undo_id": result["undo_id"]}, self.revision() - 1), 409, "revision_conflict")
        self.command("plan.rename", {"plan_id": other["id"], "name": "New work"})
        # Old inverse contents are scrubbed when the next domain mutation commits.
        self.assertEqual(self.export()["undo"], [])
        self.assert_rejected(self.body("undo.apply", {"undo_id": result["undo_id"]}, self.revision()), 404)
        self.assertEqual(self.domain()["plans"][0]["name"], "New work")
        self.assert_response(self.get("/plans/" + plan["id"]), 404)

    def test_previews_cancellation_and_foreign_commands_do_not_invalidate_undo(self):
        plan, retained = self.plan(), self.plan()
        result = self.confirm(self.preview("plan.delete", {"plan_id": plan["id"]}))
        revision = self.revision()
        next_preview = self.preview("plan.delete", {"plan_id": retained["id"]})
        self.assert_response(self.client.delete(BASE + "/previews/" + next_preview["id"], headers=self.headers), 200)
        self.plan(self.other_headers)
        self.assertEqual(self.revision(), revision)
        self.undo(result)
        self.assertEqual({p["id"] for p in self.domain()["plans"]}, {plan["id"], retained["id"]})

    def test_preview_and_undo_expire_at_exact_ten_minute_boundary(self):
        plan = self.plan()
        frozen = datetime(2026, 9, 13, 12)
        with patch("planning_changes.datetime") as clock:
            clock.fromisoformat.side_effect = datetime.fromisoformat
            clock.utcnow.return_value = frozen
            proposal = self.preview("plan.delete", {"plan_id": plan["id"]})
            clock.utcnow.return_value = frozen + timedelta(minutes=10)
            self.assert_rejected(self.body("preview.confirm", {"preview_id": proposal["id"]}, self.revision()), 409, "preview_expired")
            clock.utcnow.return_value = frozen + timedelta(minutes=10, microseconds=-1)
            result = self.confirm(proposal)
            expiry = datetime.fromisoformat(result["undo_expires_at"].removesuffix("Z"))
            self.assertEqual(expiry, clock.utcnow.return_value + timedelta(minutes=10))
            clock.utcnow.return_value = expiry
            self.assert_rejected(self.body("undo.apply", {"undo_id": result["undo_id"]}, self.revision()), 409, "undo_expired")
            clock.utcnow.return_value = expiry - timedelta(microseconds=1)
            self.undo(result)

    def test_stale_preview_creation_and_confirmation_never_mutate_records(self):
        plan = self.plan()
        proposal = self.preview("plan.delete", {"plan_id": plan["id"]})
        self.command("plan.rename", {"plan_id": plan["id"], "name": "Newer"})
        self.assert_rejected(self.preview_body("plan.delete", {"plan_id": plan["id"]}, 1), 409, "revision_conflict", preview=True)
        self.assert_rejected(self.body("preview.confirm", {"preview_id": proposal["id"]}, 1), 409, "revision_conflict")
        self.assert_rejected(self.body("preview.confirm", {"preview_id": proposal["id"]}, 2), 409, "preview_expired")
        self.assertEqual(self.export()["previews"], [proposal], "Stored effects must remain immutable")

    def test_same_revision_affected_record_drift_is_rejected_without_refreshing_effects(self):
        data = self.fixture()
        proposal = self.preview("event.delete", {"event_id": data["event"]["id"]})
        from planning_models import PrivatePreparationTask
        with self.app.app_context():
            row = self.db.session.get(PrivatePreparationTask, data["tasks"][0]["id"])
            row.text = "Changed outside command stream"
            self.db.session.commit()
        self.assert_rejected(self.body("preview.confirm", {"preview_id": proposal["id"]}, self.revision()), 409, "preview_expired")
        self.assertEqual(self.export()["previews"], [proposal])

    def test_resize_rejects_drift_in_displayed_linked_outside_event_effects(self):
        data = self.fixture()
        proposal = self.preview("plan.resize", {"plan_id": data["first"]["id"], "start_date": START, "end_date": START})
        from planning_models import PrivateEvent
        with self.app.app_context():
            row = self.db.session.get(PrivateEvent, data["event"]["id"])
            row.name = "Different displayed event"
            self.db.session.commit()
        self.assert_rejected(self.body("preview.confirm", {"preview_id": proposal["id"]}, self.revision()), 409, "preview_expired")

    def test_foreign_targets_previews_and_undo_are_hidden_and_account_scoped(self):
        data = self.fixture()
        self.plan(self.other_headers)
        for operation, payload in self.targets(data):
            with self.subTest(operation=operation):
                self.assert_rejected(self.preview_body(operation, payload, headers=self.other_headers), 404, preview=True, headers=self.other_headers)
        proposal = self.preview("plan.delete", {"plan_id": data["first"]["id"]})
        self.assert_rejected(self.body("preview.confirm", {"preview_id": proposal["id"]}, 1), 404, headers=self.other_headers)
        before = self.snapshot()
        self.assert_response(self.client.delete(BASE + "/previews/" + proposal["id"], headers=self.other_headers), 404)
        self.assertEqual(self.snapshot(), before)
        result = self.confirm(proposal)
        self.assert_rejected(self.body("undo.apply", {"undo_id": result["undo_id"]}, 1), 404, headers=self.other_headers)
        self.undo(result)

    def test_proposal_limit_is_twenty_per_account_and_expiry_or_cancel_frees_slot(self):
        plan, foreign_plan = self.plan(), self.plan(self.other_headers)
        frozen = datetime(2026, 9, 13, 12)
        with patch("planning_changes.datetime") as clock:
            clock.utcnow.return_value = frozen
            proposals = [self.preview("plan.delete", {"plan_id": plan["id"]}) for _ in range(20)]
            self.assertEqual(len({p["id"] for p in proposals}), 20)
            self.assert_rejected(self.preview_body("plan.delete", {"plan_id": plan["id"]}), 409, "limit_reached", preview=True)
            self.preview("plan.delete", {"plan_id": foreign_plan["id"]}, self.other_headers)
            self.assert_response(self.client.delete(BASE + "/previews/" + proposals[0]["id"], headers=self.headers), 200)
            self.preview("plan.delete", {"plan_id": plan["id"]})
            self.assertEqual(len(self.export()["previews"]), 20)
            clock.utcnow.return_value = frozen + timedelta(minutes=10)
            replacement = self.preview("plan.delete", {"plan_id": plan["id"]})
            self.assertEqual(self.export()["previews"], [replacement])
            self.assertEqual(len(self.export(self.other_headers)["previews"]), 1)
        self.assertEqual(self.revision(), 1)

    def test_move_keeps_id_copy_allocates_id_and_both_preserve_other_data(self):
        self.seed_legacy()
        data = self.fixture()
        self.fixture(self.other_headers)
        foreign, legacy = self.export(self.other_headers), self.snapshot(legacy_only=True)
        original = data["meals"][1]
        before = self.domain()
        moved = self.command("meal.move", {"meal_id": original["id"], "plan_id": data["second"]["id"], "date": START})["meal"]
        self.assertEqual(moved, {**original, "plan_id": data["second"]["id"], "date": START, "position": 1})
        copied = self.command("meal.copy", {"meal_id": moved["id"], "plan_id": data["first"]["id"], "date": END}, status=201)["meal"]
        self.assertNotEqual(copied["id"], moved["id"])
        self.assertEqual(str(uuid.UUID(copied["id"])), copied["id"])
        self.assertEqual(copied, {**original, "id": copied["id"], "date": END, "position": 1})
        expected = copy.deepcopy(before)
        expected["meals"] = sorted([moved if m["id"] == original["id"] else m for m in before["meals"]] + [copied], key=lambda m: m["id"])
        self.assertEqual(self.domain(), expected)
        self.assertEqual(self.export(self.other_headers), foreign)
        self.assertEqual(self.snapshot(legacy_only=True), legacy)

    def test_move_copy_invalid_destinations_and_capacity_failure_are_atomic(self):
        source, target, foreign = self.plan(), self.plan(), self.plan(self.other_headers)
        meal = self.meal(source)
        for operation in ("meal.move", "meal.copy"):
            for plan_id, day, status in ((foreign["id"], START, 404), (str(uuid.uuid4()), START, 404),
                                         (target["id"], "2026-09-20", 400)):
                with self.subTest(operation=operation, plan_id=plan_id, day=day):
                    self.assert_rejected(self.body(operation, {"meal_id": meal["id"], "plan_id": plan_id, "date": day}, self.revision()), status)
            with patch("routes.planning.MAX_DAY_MEALS", 0):
                self.assert_rejected(self.body(operation, {"meal_id": meal["id"], "plan_id": target["id"], "date": START}, self.revision()), 409, "limit_reached")

    def test_malformed_preview_envelopes_keys_ids_and_revisions_never_write(self):
        data = self.fixture()
        valid = self.preview_body("plan.delete", {"plan_id": data["first"]["id"]})
        invalid = [dict(valid, **{key: value}) for key, values in (
            ("expected_workspace_revision", (True, False, None, -1, 1.0, "1", 2147483647, [], {})),
            ("operation", (None, True, [], {}, "plan.create", "preview.confirm", "undo.apply", "unknown")),
            ("payload", (None, True, [], "text")),
            ("mutation_id", (str(uuid.uuid4()),)), ("owner_id", (self.other_uid,)),
        ) for value in values]
        invalid += [{k: v for k, v in valid.items() if k != key} for key in valid]
        for body in invalid:
            with self.subTest(body=body):
                self.assert_rejected(body, 400, "invalid_request", preview=True)
        bad_ids = (None, True, 1, [], {}, "bad", "abcdefabcdef4abc8defabcdefabcdef",
                   "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF")
        for operation, payload in self.targets(data):
            field = next(key for key in payload if key.endswith("_id"))
            for value in bad_ids:
                with self.subTest(operation=operation, value=value):
                    self.assert_rejected(self.preview_body(operation, {**payload, field: value}), 400, preview=True)
            self.assert_rejected(self.preview_body(operation, {**payload, "effects": {}}), 400, preview=True)
            self.assert_rejected(self.preview_body(operation, {**payload, field: str(uuid.uuid4())}), 404, preview=True)
        for start, end in ((END, START), ("2026-02-30", END), (START, "2030-01-01"), (True, END)):
            self.assert_rejected(self.preview_body("plan.resize", {"plan_id": data["first"]["id"], "start_date": start, "end_date": end}), 400, preview=True)

    def test_confirmation_undo_and_transfer_validation_rejects_ids_keys_boolean_revision(self):
        plan = self.plan()
        meal = self.meal(plan)
        missing = str(uuid.uuid4())
        cases = (("preview.confirm", {"preview_id": missing}), ("undo.apply", {"undo_id": missing}),
                 ("meal.move", {"meal_id": meal["id"], "plan_id": plan["id"], "date": START}),
                 ("meal.copy", {"meal_id": meal["id"], "plan_id": plan["id"], "date": START}))
        for operation, payload in cases:
            for revision in (True, False):
                self.assert_rejected(self.body(operation, payload, revision), 400)
            for key in payload:
                self.assert_rejected(self.body(operation, {k: v for k, v in payload.items() if k != key}, 2), 400)
                if key.endswith("_id"):
                    for value in (True, None, {}, [], 2, "bad", missing.upper()):
                        self.assert_rejected(self.body(operation, {**payload, key: value}, 2), 400)
            for key in ("effects", "workspace_id", "owner_id", "inverse", "operation"):
                self.assert_rejected(self.body(operation, {**payload, key: "untrusted"}, 2), 400)
        for operation, payload in cases[:2]:
            self.assert_rejected(self.body(operation, payload, 2), 404)

    def test_preview_raw_json_duplicates_body_limit_and_authentication(self):
        plan = self.plan()
        body = self.preview_body("plan.delete", {"plan_id": plan["id"]})
        encoded = json.dumps(body)
        raw_cases = ("", "{", "null", "[]", "true", '"text"',
                     encoded[:-1] + ', "operation": "plan.delete"}',
                     encoded.replace('"plan_id":', '"plan_id": "bad", "plan_id":'))
        before = self.snapshot()
        for raw in raw_cases:
            with self.subTest(raw=raw):
                self.assert_response(self.client.post(BASE + "/previews", data=raw, content_type="application/json", headers=self.headers), 400)
        self.assert_response(self.client.post(BASE + "/previews", data=encoded + " " * (16 * 1024), content_type="application/json", headers=self.headers), 413)
        self.assert_response(self.client.post(BASE + "/previews", data=encoded, content_type="text/plain", headers=self.headers), 400)
        self.assert_response(self.post_preview(body, {}), 401)
        self.assert_response(self.client.delete(BASE + "/previews/" + str(uuid.uuid4())), 401)
        for operation, key in (("preview.confirm", "preview_id"), ("undo.apply", "undo_id")):
            self.assert_response(self.post(self.body(operation, {key: str(uuid.uuid4())}, 1), {}), 401)
        self.assertEqual(self.snapshot(), before)

    def test_failed_confirm_and_undo_after_flush_roll_back_and_same_mutation_can_retry(self):
        from sqlalchemy.exc import SQLAlchemyError
        import planning_changes
        data = self.fixture()
        proposal = self.preview("event.delete", {"event_id": data["event"]["id"]})
        apply = planning_changes.apply
        reached = []
        def fail_after_apply(owner, operation, payload):
            result = apply(owner, operation, payload)
            self.db.session.flush()
            reached.append(operation)
            raise SQLAlchemyError("Synthetic failure after actual writes")
        confirm = self.body("preview.confirm", {"preview_id": proposal["id"]}, self.revision())
        with patch("planning_changes.apply", side_effect=fail_after_apply):
            self.assert_rejected(confirm, 503, "planning_unavailable")
        self.assertEqual(reached, ["preview.confirm"])
        self.assert_response(self.get("/mutations/" + confirm["mutation_id"]), 404)
        result = self.assert_response(self.post(confirm), 200)
        undo = self.body("undo.apply", {"undo_id": result["undo_id"]}, self.revision())
        with patch("planning_changes.apply", side_effect=fail_after_apply):
            self.assert_rejected(undo, 503, "planning_unavailable")
        self.assertEqual(reached, ["preview.confirm", "undo.apply"])
        self.assert_response(self.get("/mutations/" + undo["mutation_id"]), 404)
        self.assertTrue(self.assert_response(self.post(undo), 200)["restored"])

    def test_failed_preview_commit_rolls_back_new_proposal(self):
        from sqlalchemy.exc import SQLAlchemyError
        plan = self.plan()
        body = self.preview_body("plan.delete", {"plan_id": plan["id"]})
        with patch.object(self.db.session, "commit", side_effect=SQLAlchemyError("Synthetic commit failure")):
            self.assert_rejected(body, 503, "planning_unavailable", preview=True)
        self.assert_response(self.post_preview(body), 201)

    def test_inverse_size_limit_rejects_large_capture_without_writing_proposal(self):
        data = self.fixture()
        with patch("planning_changes.MAX_INVERSE_BYTES", 1):
            self.assert_rejected(self.preview_body("event.delete", {"event_id": data["event"]["id"]}), 409, "limit_reached", preview=True)

    def test_account_export_and_delete_include_ephemeral_records_and_preserve_foreign_data(self):
        self.seed_legacy()
        data, foreign = self.fixture(), self.fixture(self.other_headers)
        for records, headers in ((data, self.headers), (foreign, self.other_headers)):
            self.confirm(self.preview("meal.delete", {"meal_id": records["meals"][0]["id"]}, headers), headers)
            self.preview("event.delete", {"event_id": records["event"]["id"]}, headers)
        own, other = self.export(), self.export(self.other_headers)
        self.assertTrue({"workspace", "mutations", "previews", "undo", *DOMAIN} <= set(own))
        self.assertEqual(len(own["previews"]), 1)
        self.assertEqual(len(own["undo"]), 1)
        self.assertEqual(own["undo"][0]["inverse"]["snapshot"]["meals"], [data["meals"][0]])
        self.assertEqual(own["previews"][0]["payload"], {"event_id": data["event"]["id"]})
        before = self.snapshot(legacy_only=True)
        self.assert_response(self.client.delete("/api/auth/me", headers=self.headers), 200)
        self.assertEqual(self.export(self.other_headers), other)
        with self.app.app_context():
            from planning_models import PlanningWorkspace
            self.assertIsNone(PlanningWorkspace.query.filter_by(user_id=self.uid).first())
            for model in self.planning_models:
                if model is not PlanningWorkspace:
                    self.assertEqual(model.query.filter_by(workspace_id=own["workspace"]["id"]).count(), 0, model.__name__)
            self.assertEqual(self.db.session.execute(self.db.text("PRAGMA foreign_key_check")).all(), [])
        after = self.snapshot(legacy_only=True)
        for table in before:
            if table != "users":
                self.assertEqual(after[table], before[table], table)
        self.assert_response(self.get("/workspace"), 401)


if __name__ == "__main__":
    unittest.main()
