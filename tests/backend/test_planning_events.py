"""Private event leaf regressions through the real planning command API.

Uses helpers' disposable SQLite and application models; no fixture schema,
external services or production data. The coordinator supplies model/route wiring.
"""

import copy
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


class EventValidationTest(unittest.TestCase):
    def test_validation_needs_no_database_or_app_context_and_does_not_mutate_payload(self):
        # Initialize app-owned imports through the normal helper, then validate
        # outside an app context. Importing routes first cycles through app.py.
        make_app()
        from planning_events import OPERATIONS, validate
        from routes.planning import PlanningError

        identity = str(uuid4())
        cases = {
            "event.create": {"name": "  Dinner  ", "date": DATE},
            "event.update": {"event_id": identity, "time": None},
            "event.link": {"plan_id": identity, "event_id": identity},
            "task.create": {"event_id": identity, "bucket": "earlier", "text": "  Chop  "},
            "task.update": {"task_id": identity, "done": False},
        }
        self.assertEqual(OPERATIONS, set(cases))
        with patch("sqlalchemy.orm.Session.execute", side_effect=AssertionError("Validation queried DB")):
            for operation, payload in cases.items():
                before = copy.deepcopy(payload)
                validate(operation, payload)
                self.assertEqual(payload, before)
                with self.assertRaises(PlanningError):
                    validate(operation, {**payload, "workspace_id": identity})
            for operation in ("event.unlink", "task.delete", "event.delete", "event.copy", None, []):
                with self.assertRaises(PlanningError):
                    validate(operation, {})


class PlanningEventsTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        with self.app.app_context():
            self.uid = make_user(self.db, email="events@example.com").id
            self.other_uid = make_user(self.db, email="other-events@example.com").id
        self.client = self.app.test_client()
        self.headers = auth_header(self.app, self.uid)
        self.other_headers = auth_header(self.app, self.other_uid)

    def get(self, path, headers=None):
        return self.client.get(BASE + path, headers=self.headers if headers is None else headers)

    def response(self, response, status):
        self.assertEqual(response.status_code, status, response.get_data(as_text=True))
        self.assertIn("no-store", response.headers.get("Cache-Control", ""))
        return response.get_json()

    def body(self, operation, payload, *, headers=None, revision=None):
        if revision is None:
            revision = self.response(self.get("/workspace", headers), 200)["revision"]
        return {"operation": operation, "payload": payload, "mutation_id": str(uuid4()),
                "expected_workspace_revision": revision}

    def post(self, body, headers=None):
        return self.client.post(BASE + "/commands", json=body,
                                headers=self.headers if headers is None else headers)

    def command(self, operation, payload, status=200, headers=None):
        body = self.body(operation, payload, headers=headers)
        result = self.response(self.post(body, headers), status)
        self.assertEqual(result["revision"], body["expected_workspace_revision"] + 1)
        return result

    def event(self, headers=None, **fields):
        return self.command("event.create", {"name": "Dinner", "date": DATE, **fields},
                            201, headers)["event"]

    def plan(self, headers=None, **fields):
        return self.command("plan.create", {"name": "Week", "start_date": DATE,
                            "end_date": "2026-09-19", **fields}, 201, headers)["plan"]

    def task(self, event, headers=None, **fields):
        return self.command("task.create", {"event_id": event["id"], "bucket": "earlier",
                            "text": "Chop vegetables", **fields}, 201, headers)["task"]

    def link(self, plan, event, headers=None, status=201):
        return self.command("event.link", {"plan_id": plan["id"], "event_id": event["id"]},
                            status, headers)["link"]

    def preview_response(self, operation, payload, headers=None):
        body = self.body(operation, payload, headers=headers)
        del body["mutation_id"]
        return self.client.post(BASE + "/previews", json=body,
                                headers=self.headers if headers is None else headers)

    def preview(self, operation, payload):
        return self.response(self.preview_response(operation, payload), 201)["preview"]

    def remove(self, operation, payload):
        preview = self.preview(operation, payload)
        return self.command("preview.confirm", {"preview_id": preview["id"]})

    def rows(self, model):
        with self.app.app_context():
            return [row.to_dict() for row in model.query.order_by(model.id)]

    def snapshot(self):
        with self.app.app_context():
            return {
                table.name: sorted(json.dumps(dict(row), sort_keys=True, default=str)
                                   for row in self.db.session.execute(table.select()).mappings())
                for table in self.db.metadata.sorted_tables
            }

    def rejected(self, operation, payload, status=400, code="invalid_request", headers=None):
        before = self.snapshot()
        body = self.body(operation, payload, headers=headers)
        result = self.response(self.post(body, headers), status)
        self.assertEqual(result["code"], code)
        self.response(self.get("/mutations/" + body["mutation_id"], headers), 404)
        self.assertEqual(self.snapshot(), before)
        return result

    def test_event_defaults_boundaries_and_partial_updates(self):
        original = self.event(name="  Crème brûlée 豆腐  ")
        self.assertEqual(original["name"], "Crème brûlée 豆腐")
        self.assertEqual(original["guests"], 2)
        self.assertIsNone(original["time"])
        self.assertEqual(original["date"], DATE)
        expected = dict(original)
        for fields in ({"time": "23:59", "guests": 1000}, {"name": "界" * 160},
                       {"time": None}, {"date": "2024-02-29"}, {"guests": 1},
                       {"time": "00:00"}):
            with self.subTest(fields=fields):
                expected.update(fields)
                edited = self.command("event.update", {"event_id": original["id"], **fields})["event"]
                self.assertEqual(edited, expected)
        from planning_models import PrivateEvent
        self.assertEqual(self.rows(PrivateEvent), [expected])
        explicit = self.event(time=None, guests=1)
        self.assertIsNone(explicit["time"])
        self.assertEqual(explicit["guests"], 1)

    def test_invalid_create_fields_never_initialize_workspace(self):
        invalid_fields = {
            "guests": (True, False, 0, -1, 1001, 2.0, "2", None, [], {}),
            "name": (None, True, 2, [], {}, "", "  ", "x" * 161, "bad\nname", "\x7f", "\ud800"),
            "date": (None, True, 2, [], {}, "2026-02-29", "2026-9-13", "2026-09-13T00:00:00"),
            "time": (False, 1200, [], {}, "", "9:00", "24:00", "12:60", "12:00:00"),
        }
        for field, values in invalid_fields.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    self.rejected("event.create", {"name": "Dinner", "date": DATE, field: value})
        self.assertEqual(self.response(self.get("/workspace"), 200), {"workspace": None, "revision": 0})

    def test_invalid_edits_reject_all_fields_before_any_change(self):
        event = self.event(time="18:00", guests=6)
        task = self.task(event)
        for fields in ({}, {"name": "Renamed", "guests": True}, {"name": None},
                       {"date": None}, {"guests": None}, {"time": "25:00"},
                       {"name": "Valid", "date": "2026-02-30"}, {"position": 1},
                       {"workspace_id": str(uuid4())}, {"id": str(uuid4())}):
            self.rejected("event.update", {"event_id": event["id"], **fields})
        for fields in ({}, {"text": "Changed", "done": 1}, {"done": 0}, {"done": "true"},
                       {"done": None}, {"bucket": None}, {"bucket": []}, {"bucket": "tomorrow"},
                       {"text": None}, {"text": " "}, {"text": "x" * 161}, {"text": "bad\x00"},
                       {"event_id": str(uuid4())}, {"position": 2}):
            self.rejected("task.update", {"task_id": task["id"], **fields})
        for extra in ({"done": True}, {"position": 0}, {"bucket": "Day"},
                      {"text": None}, {"text": "\ud800"}):
            self.rejected("task.create", {"event_id": event["id"], "bucket": "day", "text": "Prep", **extra})

    def test_payload_shapes_ids_and_preview_gated_operations_are_rejected(self):
        identity = str(uuid4())
        cases = {
            "event.create": {"name": "Dinner", "date": DATE},
            "event.update": {"event_id": identity, "time": None},
            "event.link": {"event_id": identity, "plan_id": identity},
            "task.create": {"event_id": identity, "bucket": "day", "text": "Prep"},
            "task.update": {"task_id": identity, "done": True},
        }
        for operation, payload in cases.items():
            for malformed in (None, [], True, "payload", {**payload, "owner_id": self.uid}):
                self.rejected(operation, malformed)
            required = {
                "event.create": ("name", "date"), "event.update": ("event_id",),
                "event.link": ("plan_id", "event_id"),
                "task.create": ("event_id", "bucket", "text"), "task.update": ("task_id",),
            }[operation]
            for field in required:
                self.rejected(operation, {k: v for k, v in payload.items() if k != field})
            for field in (key for key in payload if key.endswith("_id")):
                for malformed in (True, None, 1, [], {}, "bad", identity.replace("-", ""),
                                  "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF"):
                    self.rejected(operation, {**payload, field: malformed})
        event = self.event()
        task = self.task(event)
        link = self.link(self.plan(), event)
        for operation, payload in (("task.delete", {"task_id": task["id"]}),
                                   ("event.delete", {"event_id": event["id"]}),
                                   ("event.unlink", {"link_id": link["id"]}),
                                   ("event.copy", {"event_id": event["id"]})):
            self.rejected(operation, payload)

    def test_links_keep_live_identity_across_date_edits_and_unlink_only_removes_one_link(self):
        from planning_models import PrivateEvent, PrivateEventLink, PrivatePlan, PrivatePreparationTask
        plan = self.plan()
        other_plan = self.plan(name="Another week")
        event = self.event(date="2026-10-01")  # Out-of-range links are explicitly allowed.
        task = self.task(event)
        link = self.link(plan, event)
        other_link = self.link(other_plan, event)
        original_links = self.rows(PrivateEventLink)
        outside = self.response(self.get(f'/plans/{plan["id"]}/events'), 200)["links"]
        self.assertEqual(outside, [{**link, "event": event, "in_range": False}])
        for day in (DATE, "2026-09-19", "2026-12-31"):
            event = self.command("event.update", {"event_id": event["id"], "date": day})["event"]
            self.assertEqual(self.rows(PrivateEventLink), original_links)
            self.assertEqual(self.rows(PrivateEvent), [event])
            self.assertEqual({row["event_id"] for row in original_links}, {event["id"]})
            for linked_plan, expected_link in ((plan, link), (other_plan, other_link)):
                current = self.response(self.get(f'/plans/{linked_plan["id"]}/events'), 200)
                self.assertEqual(current["links"], [{**expected_link, "event": event,
                                  "in_range": day != "2026-12-31"}])
        plans_before = self.rows(PrivatePlan)
        preview = self.preview("event.unlink", {"link_id": link["id"]})
        self.assertEqual(preview["effects"]["affected"]["links"], [link])
        self.assertIs(preview["effects"]["events_preserved"], True)
        self.assertEqual(self.rows(PrivateEventLink), original_links)
        result = self.command("preview.confirm", {"preview_id": preview["id"]})
        self.assertIs(result["applied"], True)
        self.assertEqual(self.rows(PrivateEventLink), [other_link])
        self.assertEqual(self.rows(PrivateEvent), [event])
        self.assertEqual(self.rows(PrivatePreparationTask), [task])
        self.assertEqual(self.rows(PrivatePlan), plans_before)
        self.command("undo.apply", {"undo_id": result["undo_id"]})
        self.assertEqual(self.rows(PrivateEventLink), original_links)
        self.assertEqual(self.rows(PrivateEvent), [event])
        self.assertEqual(self.rows(PrivatePreparationTask), [task])

    def test_task_removal_requires_preview_and_undo_restores_exact_task(self):
        from planning_models import PrivateEvent, PrivateEventLink, PrivatePreparationTask
        event = self.event()
        task = self.task(event)
        task = self.command("task.update", {"task_id": task["id"], "done": True})["task"]
        sibling = self.task(event, bucket="serving")
        link = self.link(self.plan(), event)
        self.rejected("task.delete", {"task_id": task["id"]})
        preview = self.preview("task.delete", {"task_id": task["id"]})
        self.assertEqual(preview["effects"]["affected"]["tasks"], [task])
        self.assertCountEqual(self.rows(PrivatePreparationTask), [task, sibling])
        result = self.command("preview.confirm", {"preview_id": preview["id"]})
        self.assertEqual(self.rows(PrivatePreparationTask), [sibling])
        self.assertEqual(self.rows(PrivateEvent), [event])
        self.assertEqual(self.rows(PrivateEventLink), [link])
        self.command("undo.apply", {"undo_id": result["undo_id"]})
        self.assertCountEqual(self.rows(PrivatePreparationTask), [task, sibling])

    def test_task_positions_append_per_event_and_partial_updates_preserve_identity(self):
        event = self.event()
        tasks = [self.task(event, bucket=bucket, text="  Prep 豆腐  ")
                 for bucket in ("earlier", "day", "serving")]
        self.assertEqual([task["position"] for task in tasks], [0, 1, 2])
        for task in tasks:
            self.assertIs(task["done"], False)
            self.assertEqual(task["text"], "Prep 豆腐")
        expected = dict(tasks[0])
        for fields in ({"done": True}, {"bucket": "serving"}, {"text": "界" * 160},
                       {"done": False}, {"bucket": "day", "text": "Serve", "done": True}):
            expected.update(fields)
            actual = self.command("task.update", {"task_id": expected["id"], **fields})["task"]
            self.assertEqual(actual, expected)
        self.assertEqual(self.task(event)["position"], 3)
        self.assertEqual(self.task(self.event())["position"], 0)

    def test_guest_edits_do_not_change_recipe_sources_and_unbuilt_items_are_rejected(self):
        from planning_models import PrivateEventLink, PrivatePreparationTask
        with self.app.app_context():
            make_tier(self.db, "synthetic-event-recipe", "basic", title="Source recipe")
        event = self.event(guests=4)
        task = self.task(event)
        link = self.link(self.plan(), event)
        before = self.snapshot()
        updated = self.command("event.update", {"event_id": event["id"], "guests": 8})["event"]
        self.assertEqual(updated, {**event, "guests": 8})
        after = self.snapshot()
        for table in before:
            if table not in {"private_events", "planning_workspaces", "planning_mutations"}:
                self.assertEqual(after[table], before[table], table)
        self.assertEqual(self.rows(PrivatePreparationTask), [task])
        self.assertEqual(self.rows(PrivateEventLink), [link])
        for fields in ({"items": []}, {"recipe_id": "synthetic-event-recipe"},
                       {"follows_guests": True}, {"guest_overrides": {}}, {"servings": 8}):
            self.rejected("event.create", {"name": "Dinner", "date": DATE, **fields})
            self.rejected("event.update", {"event_id": event["id"], "guests": 12, **fields})
        for operation in ("item.create", "item.update", "event.item.create"):
            self.rejected(operation, {"event_id": event["id"], "recipe_id": "synthetic-event-recipe"})

    def test_foreign_and_missing_references_are_indistinguishable_and_never_write(self):
        plan, event = self.plan(), self.event()
        task, link = self.task(event), self.link(plan, event)
        foreign_cases = (
            ("event.update", {"event_id": event["id"], "name": "Stolen"}, "event_id"),
            ("event.link", {"plan_id": plan["id"], "event_id": event["id"]}, "plan_id"),
            ("task.create", {"event_id": event["id"], "bucket": "day", "text": "Stolen"}, "event_id"),
            ("task.update", {"task_id": task["id"], "done": True}, "task_id"),
        )
        for operation, payload, field in foreign_cases:
            foreign = self.rejected(operation, payload, 404, "not_found", self.other_headers)
            missing = self.rejected(operation, {**payload, field: str(uuid4())}, 404,
                                    "not_found", self.other_headers)
            self.assertEqual(foreign, missing)
        self.assertEqual(self.response(self.get("/workspace", self.other_headers), 200),
                         {"workspace": None, "revision": 0})
        other_plan, other_event = self.plan(self.other_headers), self.event(self.other_headers)
        for fields in ({"plan_id": other_plan["id"], "event_id": event["id"]},
                       {"plan_id": plan["id"], "event_id": other_event["id"]}):
            self.rejected("event.link", fields, 404, "not_found", self.other_headers)
        for operation, payload, _ in foreign_cases:
            self.rejected(operation, payload, 404, "not_found", self.other_headers)
        before = self.snapshot()
        for operation, field, identity in (("event.unlink", "link_id", link["id"]),
                                          ("task.delete", "task_id", task["id"])):
            foreign = self.response(self.preview_response(operation, {field: identity}, self.other_headers), 404)
            missing = self.response(self.preview_response(operation, {field: str(uuid4())}, self.other_headers), 404)
            self.assertEqual(foreign, missing)
        self.assertEqual(self.snapshot(), before)

    def test_event_quota_is_workspace_scoped_and_failed_first_create_rolls_back(self):
        import planning_events
        self.assertEqual(planning_events.MAX_EVENTS, 500)
        with patch("planning_events.MAX_EVENTS", 0):
            self.rejected("event.create", {"name": "Dinner", "date": DATE}, 409, "limit_reached")
        self.assertEqual(self.response(self.get("/workspace"), 200), {"workspace": None, "revision": 0})
        with patch("planning_events.MAX_EVENTS", 2):
            event = self.event()
            self.event()
            self.event(self.other_headers)
            self.rejected("event.create", {"name": "Over quota", "date": DATE}, 409, "limit_reached")
            self.command("event.update", {"event_id": event["id"], "name": "Allowed edit"})

    def test_duplicate_link_is_idempotent_at_workspace_quota_but_advances_revision(self):
        from planning_models import PrivateEventLink
        import planning_events
        self.assertEqual(planning_events.MAX_LINKS, 2000)
        plans, event = [self.plan() for _ in range(3)], self.event()
        with patch("planning_events.MAX_LINKS", 2):
            link = self.link(plans[0], event)
            self.link(plans[1], event)
            self.assertEqual(self.link(plans[0], event, status=200), link)
            self.assertEqual(len(self.rows(PrivateEventLink)), 2)
            self.rejected("event.link", {"plan_id": plans[2]["id"], "event_id": event["id"]},
                          409, "limit_reached")
            other_plan, other_event = self.plan(self.other_headers), self.event(self.other_headers)
            self.link(other_plan, other_event, self.other_headers)
            self.remove("event.unlink", {"link_id": link["id"]})
            fresh = self.link(plans[0], event)
            self.assertNotEqual(fresh["id"], link["id"])

    def test_task_event_quota_counts_all_buckets_and_allows_edits(self):
        import planning_events
        self.assertEqual(planning_events.MAX_EVENT_TASKS, 500)
        first, second = self.event(), self.event()
        with patch("planning_events.MAX_EVENT_TASKS", 2):
            task = self.task(first, bucket="earlier")
            self.task(first, bucket="day")
            self.rejected("task.create", {"event_id": first["id"], "bucket": "serving", "text": "Over"},
                          409, "limit_reached")
            self.task(second)
            self.command("task.update", {"task_id": task["id"], "bucket": "serving", "done": True})

    def test_task_workspace_quota_counts_all_events_but_not_other_accounts(self):
        import planning_events
        self.assertEqual(planning_events.MAX_WORKSPACE_TASKS, 10000)
        first, second = self.event(), self.event()
        with patch("planning_events.MAX_WORKSPACE_TASKS", 3):
            self.task(first)
            self.task(second)
            self.task(second)
            self.rejected("task.create", {"event_id": first["id"], "bucket": "day", "text": "Over"},
                          409, "limit_reached")
            self.task(self.event(self.other_headers), self.other_headers)

    def test_every_operation_replays_original_body_and_status_without_reapplying(self):
        records = []

        def record(operation, payload, status):
            body = self.body(operation, payload)
            response = self.post(body)
            result = self.response(response, status)
            records.append((body, status, result, response.get_data()))
            return result

        event = record("event.create", {"name": "Dinner", "date": DATE}, 201)["event"]
        plan = self.plan()
        task = record("task.create", {"event_id": event["id"], "bucket": "day", "text": "Prep"}, 201)["task"]
        record("event.update", {"event_id": event["id"], "date": "2026-10-01", "time": None}, 200)
        record("task.update", {"task_id": task["id"], "done": True}, 200)
        fields = {"plan_id": plan["id"], "event_id": event["id"]}
        link = record("event.link", fields, 201)["link"]
        record("event.link", fields, 200)
        preview = self.preview("event.unlink", {"link_id": link["id"]})
        record("preview.confirm", {"preview_id": preview["id"]}, 200)
        before = self.snapshot()
        with patch("routes.planning.MAX_MUTATIONS", 0), patch("planning_events.MAX_EVENTS", 0), \
                patch("planning_events.MAX_LINKS", 0), patch("planning_events.MAX_WORKSPACE_TASKS", 0):
            for body, status, result, raw in records:
                with self.subTest(operation=body["operation"], status=status):
                    replay = self.post(body)
                    self.assertEqual(self.response(replay, status), result)
                    self.assertEqual(replay.get_data(), raw)
                    receipt = self.response(self.get("/mutations/" + body["mutation_id"]), 200)
                    self.assertEqual(receipt, {"result": result, "status_code": status})
        self.assertEqual(self.snapshot(), before)
        changed = copy.deepcopy(records[0][0])
        changed["payload"]["name"] = "Different"
        self.assertEqual(self.response(self.post(changed), 409)["code"], "mutation_conflict")
        stale = self.body("event.update", {"event_id": event["id"], "name": "Stale"}, revision=0)
        self.assertEqual(self.response(self.post(stale), 409)["code"], "revision_conflict")
        self.assertEqual(self.snapshot(), before)

    def test_database_failure_after_each_leaf_flush_rolls_back_all_changes_and_receipts(self):
        from routes.planning import apply_command
        from sqlalchemy.exc import SQLAlchemyError

        def fail_after_apply(*args, **kwargs):
            apply_command(*args, **kwargs)
            raise SQLAlchemyError("Synthetic failure after domain flush")

        # Even the first workspace creation must disappear on downstream failure.
        with patch("routes.planning.apply_command", side_effect=fail_after_apply):
            self.rejected("event.create", {"name": "Dinner", "date": DATE}, 503, "planning_unavailable")
        self.assertEqual(self.response(self.get("/workspace"), 200), {"workspace": None, "revision": 0})
        event, plan = self.event(), self.plan()
        task, link = self.task(event), self.link(plan, event)
        other_plan = self.plan()
        unlink_preview = self.preview("event.unlink", {"link_id": link["id"]})
        unlink_body = self.body("preview.confirm", {"preview_id": unlink_preview["id"]})
        before = self.snapshot()
        with patch("routes.planning.apply_command", side_effect=fail_after_apply):
            self.assertEqual(self.response(self.post(unlink_body), 503)["code"], "planning_unavailable")
        self.assertEqual(self.snapshot(), before)
        self.response(self.get("/mutations/" + unlink_body["mutation_id"]), 404)
        self.response(self.post(unlink_body), 200)
        operations = (
            ("event.create", {"name": "New dinner", "date": DATE}),
            ("event.update", {"event_id": event["id"], "name": "Changed", "date": "2026-10-01"}),
            ("event.link", {"plan_id": other_plan["id"], "event_id": event["id"]}),
            ("task.create", {"event_id": event["id"], "bucket": "serving", "text": "Changed"}),
            ("task.update", {"task_id": task["id"], "text": "Changed", "done": True}),
        )
        for operation, payload in operations:
            with self.subTest(operation=operation):
                body = self.body(operation, payload)
                before = self.snapshot()
                with patch("routes.planning.apply_command", side_effect=fail_after_apply):
                    self.assertEqual(self.response(self.post(body), 503)["code"], "planning_unavailable")
                self.response(self.get("/mutations/" + body["mutation_id"]), 404)
                self.assertEqual(self.snapshot(), before)
                # The same mutation is usable after the transient failure.
                status = 201 if operation in ("event.create", "event.link", "task.create") else 200
                result = self.response(self.post(body), status)
                self.assertEqual(result["revision"], body["expected_workspace_revision"] + 1)

    def test_leaf_flushes_without_committing_or_owning_revision_and_receipt(self):
        from planning_events import apply
        from planning_models import PlanningWorkspace, PlanningMutation, PrivateEvent
        self.plan()
        before = self.snapshot()
        with self.app.app_context():
            owner = PlanningWorkspace.query.filter_by(user_id=self.uid).one()
            revision, receipts = owner.revision, PlanningMutation.query.count()
            with patch.object(self.db.session, "commit", side_effect=AssertionError("Leaf committed")):
                result, status = apply(owner, "event.create", {"name": "Uncommitted", "date": DATE})
                self.assertEqual(status, 201)
                self.assertNotIn("revision", result)
                self.assertEqual(PrivateEvent.query.count(), 1)
                self.assertEqual(owner.revision, revision)
                self.assertEqual(PlanningMutation.query.count(), receipts)
                self.db.session.rollback()
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
