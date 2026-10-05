"""X1a private-planning contract regressions using helpers' synthetic SQLite.

No schema, demo data, subprocesses, or production database are created here.
Pagination uses the public ``limit``/``cursor`` query parameters.
"""

import copy
from datetime import date, timedelta
import json
import os
import sys
import unittest
from unittest.mock import patch
import uuid

sys.path.insert(0, os.path.dirname(__file__))
from helpers import auth_header, make_app, make_tier, make_user


BASE = "/api/planning/v1"
START = "2026-09-13"
END = "2026-09-19"


class PrivatePlanningTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        from planning_models import (
            PlanningWorkspace, PrivatePlan, PrivateMeal, PlanningMutation,
        )
        self.planning_models = (
            PlanningWorkspace, PrivatePlan, PrivateMeal, PlanningMutation,
        )
        with self.app.app_context():
            self.uid = make_user(self.db, email="private@example.com").id
            self.other_uid = make_user(self.db, email="other@example.com").id
        self.client = self.app.test_client()
        self.headers = auth_header(self.app, self.uid)
        self.other_headers = auth_header(self.app, self.other_uid)

    def body(self, operation="plan.create", payload=None, revision=0,
             mutation_id=None):
        return {
            "mutation_id": mutation_id or str(uuid.uuid4()),
            "expected_workspace_revision": revision,
            "operation": operation,
            "payload": ({"name": "Week", "start_date": START, "end_date": END}
                        if payload is None else payload),
        }

    def post(self, body, headers=None):
        return self.client.post(
            BASE + "/commands", json=body,
            headers=self.headers if headers is None else headers,
        )

    def get(self, path, headers=None, **kwargs):
        return self.client.get(
            BASE + path, headers=self.headers if headers is None else headers,
            **kwargs,
        )

    def assert_response(self, response, status):
        self.assertEqual(response.status_code, status, response.get_data(as_text=True))
        self.assertIn("no-store", response.headers.get("Cache-Control", ""))
        data = response.get_json()
        self.assertIsInstance(data, dict)
        return data

    def success(self, body, headers=None):
        creating = body["operation"].endswith(".create")
        data = self.assert_response(self.post(body, headers), 201 if creating else 200)
        kind = body["operation"].split(".")[0]
        self.assertEqual(set(data), {"revision", kind})
        self.assertIs(type(data["revision"]), int)
        self.assertEqual(data["revision"], body["expected_workspace_revision"] + 1)
        self.assertIsInstance(data[kind], dict)
        self.assertEqual(str(uuid.UUID(data[kind]["id"])), data[kind]["id"])
        return data[kind]

    def create_plan(self, revision=0, headers=None, **fields):
        payload = {"name": "Week", "start_date": START, "end_date": END, **fields}
        return self.success(self.body(payload=payload, revision=revision), headers)

    def create_meal(self, plan_id, revision=1, headers=None, **fields):
        return self.success(self.body(
            "meal.create", {"plan_id": plan_id, "date": START, **fields}, revision,
        ), headers)

    def counts(self):
        with self.app.app_context():
            return tuple(model.query.count() for model in self.planning_models)

    def snapshot(self, *, legacy_only=False):
        """Read existing helper-created tables; never supply fixture schema."""
        private = {model.__table__.name for model in self.planning_models}
        with self.app.app_context():
            result = {}
            for table in self.db.metadata.sorted_tables:
                if legacy_only and table.name in private:
                    continue
                rows = self.db.session.execute(table.select()).mappings().all()
                result[table.name] = sorted(
                    json.dumps(dict(row), sort_keys=True, default=str) for row in rows
                )
            return result

    def seed_legacy(self):
        from models import MealPlan, MealPlanItem
        with self.app.app_context():
            make_tier(self.db, "synthetic-source", "basic", title="Original recipe")
            plan = MealPlan(user_id=self.other_uid, name="Other legacy plan")
            self.db.session.add(plan)
            self.db.session.flush()
            self.db.session.add(MealPlanItem(
                meal_plan_id=plan.id, dish_slug="synthetic-source", level="basic",
            ))
            self.db.session.commit()

    def test_empty_reads_and_export_do_not_create_workspace_or_demo_data(self):
        before = self.snapshot()
        for _ in range(2):
            self.assertEqual(self.assert_response(self.get("/workspace"), 200),
                             {"workspace": None, "revision": 0})
            self.assertEqual(self.assert_response(self.get("/plans"), 200),
                             {"plans": [], "revision": 0, "next_cursor": None})
        exported = self.assert_response(self.client.get(
            "/api/auth/me/export", headers=self.headers,
        ), 200)
        self.assertEqual(exported["private_planning"], {
            "workspace": None, "plans": [], "meals": [], "mutations": [],
            "events": [], "event_links": [], "preparation_tasks": [], "previews": [], "undo": [], "items": [],
            "shopping_scopes": [], "templates": [], "preferences": [],
        })
        self.assertEqual(self.counts(), (0, 0, 0, 0))
        self.assertEqual(self.snapshot(), before)

    def test_every_planning_endpoint_requires_a_current_authenticated_account(self):
        missing = str(uuid.uuid4())
        paths = ("/workspace", "/plans", f"/plans/{missing}",
                 f"/plans/{missing}/meals", f"/mutations/{missing}")
        from models import User
        with self.app.app_context():
            deleted_uid = make_user(self.db, email="deleted@example.com").id
            self.db.session.delete(self.db.session.get(User, deleted_uid))
            self.db.session.commit()
        # Centralized auth handling deliberately gives missing, malformed and
        # deleted-account credentials the same non-enumerating response.
        invalid_headers = (({}, 401), ({"Authorization": "Bearer invalid"}, 401),
                           (auth_header(self.app, deleted_uid), 401))
        rejected = {"error": "Authentication required", "code": "invalid_session"}
        before = self.snapshot()
        for headers, status in invalid_headers:
            for path in paths:
                with self.subTest(headers=headers, path=path):
                    self.assertEqual(self.assert_response(self.get(path, headers), status), rejected)
            self.assertEqual(self.assert_response(self.post(self.body(), headers), status), rejected)
        self.assertEqual(self.snapshot(), before)

    def test_first_command_creates_workspace_with_trimmed_unicode_and_date_bounds(self):
        # Deliberately issue no GET before the first command.
        name = "Crème brûlée — 豆腐 🍲"
        plan = self.create_plan(name="  " + name + "  ", end_date=START)
        self.assertEqual((plan["name"], plan["start_date"], plan["end_date"]),
                         (name, START, START))
        workspace = self.assert_response(self.get("/workspace"), 200)
        self.assertIsInstance(workspace["workspace"], dict)
        self.assertEqual(workspace["revision"], 1)
        last_day = (date.fromisoformat(START) + timedelta(days=729)).isoformat()
        boundary = self.create_plan(1, name="界" * 160, end_date=last_day)
        self.assertEqual(boundary["name"], "界" * 160)
        self.assertEqual(boundary["end_date"], last_day)
        self.assertEqual(self.counts(), (1, 2, 0, 2))
        self.assertEqual(self.assert_response(self.get("/plans/" + plan["id"]), 200),
                         {"plan": plan, "revision": 2})

    def test_create_and_edit_replays_return_recorded_results_even_at_receipt_quota(self):
        commands = []

        def record(body, status, kind):
            response = self.post(body)
            result = self.assert_response(response, status)
            commands.append((body, status, result, response.get_data()))
            return result[kind]

        with patch("routes.planning.MAX_MUTATIONS", 1):
            first = self.body()
            plan = record(first, 201, "plan")
            before = self.snapshot()
            self.assertEqual(self.assert_response(self.post(first), 201), commands[0][2])
            blocked = self.body("plan.rename", {"plan_id": plan["id"], "name": "Over quota"}, 1)
            self.assertEqual(self.assert_response(self.post(blocked), 409)["code"], "limit_reached")
            self.assert_response(self.get("/mutations/" + blocked["mutation_id"]), 404)
            changed = {**first, "payload": {**first["payload"], "name": "Conflicting"}}
            self.assertEqual(self.assert_response(self.post(changed), 409)["code"], "mutation_conflict")
            self.assertEqual(self.snapshot(), before)
        record(self.body("plan.rename", {"plan_id": plan["id"], "name": "New"}, 1),
               200, "plan")
        meal = record(self.body("meal.create", {
            "plan_id": plan["id"], "date": START, "name": "Before",
        }, 2), 201, "meal")
        record(self.body("meal.update", {"meal_id": meal["id"], "name": "After"}, 3),
               200, "meal")
        before = self.snapshot()
        for body, status, result, raw in commands:
            with self.subTest(operation=body["operation"]):
                replay = self.post(body)
                self.assertEqual(self.assert_response(replay, status), result)
                self.assertEqual(replay.get_data(), raw)
                receipt = self.assert_response(
                    self.get("/mutations/" + body["mutation_id"]), 200,
                )
                self.assertEqual(receipt, {"result": result, "status_code": status})
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.counts(), (1, 1, 1, 4))
        self.assertEqual(self.get("/plans/" + plan["id"]).get_json()["plan"]["name"], "New")
        self.assertEqual(self.get(f'/plans/{plan["id"]}/meals').get_json()["meals"][0]["name"],
                         "After")

    def test_stale_revision_and_reused_mutation_with_different_body_never_write(self):
        original = self.body()
        plan = self.success(original)
        self.success(self.body("plan.rename", {"plan_id": plan["id"], "name": "Current"}, 1))
        before = self.snapshot()
        for revision in (0, 1, 999):
            body = self.body("plan.rename", {"plan_id": plan["id"], "name": "Stale"}, revision)
            data = self.assert_response(self.post(body), 409)
            self.assertEqual(data["code"], "revision_conflict")
            self.assertEqual(data["current_revision"], 2)
            self.assert_response(self.get("/mutations/" + body["mutation_id"]), 404)
        variations = (
            {**original, "payload": {**original["payload"], "name": "Different"}},
            {**original, "expected_workspace_revision": 2},
            {**original, "operation": "plan.rename",
             "payload": {"plan_id": plan["id"], "name": "Different"}},
        )
        for body in variations:
            with self.subTest(body=body):
                self.assertEqual(self.assert_response(self.post(body), 409)["code"],
                                 "mutation_conflict")
        self.assertEqual(self.snapshot(), before)

    def test_meal_creation_appends_and_preserves_optional_nulls_and_unicode(self):
        plan = self.create_plan()
        first = self.create_meal(plan["id"], name="豆腐 🍲", time="23:59")
        second = self.create_meal(plan["id"], 2, name=None, time=None)
        third = self.create_meal(plan["id"], 3)
        for meal in (first, second, third):
            self.assertIs(type(meal["position"]), int)
            self.assertEqual(meal["plan_id"], plan["id"])
            self.assertEqual(meal["date"], START)
        self.assertEqual(second["position"], first["position"] + 1)
        self.assertEqual(third["position"], second["position"] + 1)
        self.assertEqual((first["name"], first["time"]), ("豆腐 🍲", "23:59"))
        for meal in (second, third):
            self.assertIsNone(meal["name"])
            self.assertIsNone(meal["time"])
        last = self.create_meal(plan["id"], 4, date=END, name="界" * 160, time="00:00")
        self.assertEqual((last["date"], last["name"], last["time"]), (END, "界" * 160, "00:00"))
        meals = self.assert_response(self.get(f'/plans/{plan["id"]}/meals'), 200)
        self.assertEqual(meals, {"meals": sorted([first, second, third, last], key=lambda m: m["id"]),
                                 "revision": 5, "next_cursor": None})

    def test_partial_meal_updates_preserve_omitted_fields_and_null_clears(self):
        plan = self.create_plan()
        original = self.create_meal(plan["id"], name="Lunch", time="12:30")
        changes = (
            ({"name": "Abendessen 🍽"}, "Abendessen 🍽", "12:30"),
            ({"time": "18:45"}, "Abendessen 🍽", "18:45"),
            ({"name": None}, None, "18:45"),
            ({"time": None}, None, None),
            ({"name": "Both", "time": "08:00"}, "Both", "08:00"),
            ({"name": None, "time": None}, None, None),
        )
        for revision, (fields, name, time) in enumerate(changes, start=2):
            with self.subTest(fields=fields):
                meal = self.success(self.body("meal.update", {
                    "meal_id": original["id"], **fields,
                }, revision))
                self.assertEqual((meal["name"], meal["time"]), (name, time))
                for key in ("id", "plan_id", "date", "position"):
                    self.assertEqual(meal[key], original[key])
                listed = self.assert_response(self.get(f'/plans/{plan["id"]}/meals'), 200)
                self.assertEqual(listed["meals"], [meal])
                self.assertEqual(listed["revision"], revision + 1)

    def test_foreign_ids_are_hidden_and_mutation_identity_is_scoped_to_account(self):
        original = self.body()
        plan = self.success(original)
        meal = self.create_meal(plan["id"])
        before = self.snapshot()
        for path in (f'/plans/{plan["id"]}', f'/plans/{plan["id"]}/meals',
                     "/mutations/" + original["mutation_id"]):
            self.assert_response(self.get(path, self.other_headers), 404)
        for operation, payload in (
            ("plan.rename", {"plan_id": plan["id"], "name": "Hijacked"}),
            ("meal.create", {"plan_id": plan["id"], "date": START}),
            ("meal.update", {"meal_id": meal["id"], "name": "Hijacked"}),
        ):
            self.assert_response(self.post(self.body(operation, payload), self.other_headers), 404)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.get("/workspace", self.other_headers).get_json(),
                         {"workspace": None, "revision": 0})
        other_plan = self.success(original, self.other_headers)
        self.assertNotEqual(other_plan["id"], plan["id"])
        before = self.snapshot()
        for operation, payload in (
            ("plan.rename", {"plan_id": plan["id"], "name": "Hijacked"}),
            ("meal.create", {"plan_id": plan["id"], "date": START}),
            ("meal.update", {"meal_id": meal["id"], "name": "Hijacked"}),
        ):
            self.assert_response(self.post(self.body(operation, payload, 1), self.other_headers), 404)
        self.assert_response(self.get("/plans/" + other_plan["id"]), 404)
        self.assert_response(self.get(f'/plans/{plan["id"]}/meals', self.other_headers), 404)
        self.assertEqual(self.snapshot(), before)
        own_receipt = self.get("/mutations/" + original["mutation_id"]).get_json()
        other_receipt = self.get("/mutations/" + original["mutation_id"], self.other_headers).get_json()
        self.assertEqual(own_receipt["result"]["plan"]["id"], plan["id"])
        self.assertEqual(other_receipt["result"]["plan"]["id"], other_plan["id"])
        self.assertEqual(self.get("/plans").get_json()["plans"], [plan])
        self.assertEqual(self.get("/plans", self.other_headers).get_json()["plans"], [other_plan])

    def test_command_envelope_rejects_malformed_json_keys_types_and_noncanonical_uuid(self):
        before = self.snapshot()
        for raw in ("", "{", "null", "[]", "[{}]", '"text"', "true", "42"):
            with self.subTest(raw=raw):
                response = self.client.post(BASE + "/commands", data=raw,
                                            content_type="application/json", headers=self.headers)
                self.assert_response(response, 400)
        base = self.body()
        encoded = json.dumps(base)
        duplicates = (
            encoded[:-1] + ', "operation": "plan.create"}',
            encoded[:-1] + ', "expected_workspace_revision": 0}',
            encoded.replace('"name": "Week"', '"name": "Week", "name": "Other"'),
        )
        for raw in duplicates:
            with self.subTest(duplicate=raw):
                self.assert_response(self.client.post(
                    BASE + "/commands", data=raw, content_type="application/json", headers=self.headers,
                ), 400)
        invalid = [dict(base, **{field: value}) for field, values in (
            ("mutation_id", (None, True, 1, [], {}, "bad", "", "A" * 32,
                             "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF",
                             "abcdefabcdef4abc8defabcdefabcdef",
                             "{abcdefab-cdef-4abc-8def-abcdefabcdef}")),
            ("expected_workspace_revision", (None, True, False, -1, 1.0, "0", [], {})),
            ("operation", (None, True, 1, [], {}, "", "plan.delete", "meal.delete", "plan.update")),
            ("payload", (None, True, 1, [], "text")),
            ("owner_id", (self.other_uid,)),
            ("user_id", (self.other_uid,)),
            ("extra", ("unknown",)),
        ) for value in values]
        for key in base:
            missing = copy.deepcopy(base)
            del missing[key]
            invalid.append(missing)
        for body in invalid:
            with self.subTest(body=body):
                self.assert_response(self.post(body), 400)
        self.assertEqual(self.snapshot(), before)

    def test_plan_payloads_reject_invalid_names_dates_owner_fields_and_date_edits(self):
        base = self.body()["payload"]
        invalid = []
        for field, values in (
            ("name", (None, True, 1, [], {}, "", " \t\n", "x" * 161, "\ud800")),
            ("start_date", (None, True, 1, [], "2026-9-13", "20260913", "2026-02-30",
                            "2026-09-13T00:00:00", " 2026-09-13", "２０２６-０９-１３")),
            ("end_date", (None, True, 1, [], "2026-9-19", "2026-09-12",
                          (date.fromisoformat(START) + timedelta(days=730)).isoformat())),
            ("owner_id", (self.other_uid,)),
            ("user_id", (self.other_uid,)),
            ("workspace_id", (str(uuid.uuid4()),)),
        ):
            invalid.extend({**base, field: value} for value in values)
        invalid.extend({key: value for key, value in base.items() if key != missing}
                       for missing in base)
        before = self.snapshot()
        for payload in invalid:
            with self.subTest(payload=payload):
                self.assert_response(self.post(self.body(payload=payload)), 400)
        self.assertEqual(self.snapshot(), before)
        plan = self.create_plan()
        renamed = self.success(self.body("plan.rename", {
            "plan_id": plan["id"], "name": "  Menü 🍲  ",
        }, 1))
        self.assertEqual(renamed["name"], "Menü 🍲")
        self.assertEqual((renamed["start_date"], renamed["end_date"]), (START, END))
        before = self.snapshot()
        invalid_renames = [
            {"plan_id": plan["id"]}, {"name": "New"},
            *({"plan_id": plan["id"], "name": value}
              for value in (None, True, 7, [], "", "  ", "x" * 161)),
            {"plan_id": plan["id"], "name": "New", "start_date": END},
            {"plan_id": plan["id"], "name": "New", "end_date": END},
            {"plan_id": plan["id"], "name": "New", "owner_id": self.other_uid},
        ]
        for payload in invalid_renames:
            with self.subTest(rename=payload):
                self.assert_response(self.post(self.body("plan.rename", payload, 2)), 400)
        self.assertEqual(self.snapshot(), before)

    def test_meal_payloads_reject_bad_types_dates_times_empty_updates_and_unknown_fields(self):
        plan = self.create_plan()
        meal = self.create_meal(plan["id"], name="Keep", time="12:00")
        before = self.snapshot()
        invalid_fields = (
            ("name", (True, 1, [], {}, "x" * 161, "\ud800")),
            ("time", (True, 1, [], {}, "", "1:00", "24:00", "12:60", "12:00:00",
                      " 12:00", "１２:００")),
            ("owner_id", (self.other_uid,)), ("user_id", (self.other_uid,)),
            ("position", (0,)), ("extra", ("unknown",)),
        )
        for operation, target in (
            ("meal.create", {"plan_id": plan["id"], "date": START}),
            ("meal.update", {"meal_id": meal["id"]}),
        ):
            for field, values in invalid_fields:
                for value in values:
                    with self.subTest(operation=operation, field=field, value=value):
                        self.assert_response(self.post(self.body(
                            operation, {**target, field: value}, 2,
                        )), 400)
        for value in (None, True, 1, [], "2026-9-13", "2026-02-30", "2026-09-12",
                      "2026-09-20", "2026-09-13T12:00:00"):
            self.assert_response(self.post(self.body("meal.create", {
                "plan_id": plan["id"], "date": value,
            }, 2)), 400)
        for payload in ({}, {"plan_id": plan["id"]}, {"date": START}):
            self.assert_response(self.post(self.body("meal.create", payload, 2)), 400)
        for payload in ({}, {"meal_id": meal["id"]}, {"name": "Missing ID"},
                        {"meal_id": meal["id"], "name": "New", "date": END},
                        {"meal_id": meal["id"], "name": "New", "plan_id": plan["id"]}):
            self.assert_response(self.post(self.body("meal.update", payload, 2)), 400)
        self.assertEqual(self.snapshot(), before)

    def test_command_body_cap_is_16_kib_measured_in_bytes_and_rejection_is_atomic(self):
        body = self.body(payload={"name": "界" * 160, "start_date": START, "end_date": END})
        encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
        boundary = encoded + b" " * (16 * 1024 - len(encoded))
        self.assertEqual(len(boundary), 16 * 1024)
        before = self.snapshot()
        for raw in (boundary + b" ", boundary + b" " * 4096):
            response = self.client.post(BASE + "/commands", data=raw,
                                        content_type="application/json", headers=self.headers)
            # The contract fixes the bound, but does not prescribe 400 versus 413.
            self.assertIn(response.status_code, (400, 413), response.get_data(as_text=True))
            self.assertIn("no-store", response.headers.get("Cache-Control", ""))
            self.assertEqual(self.snapshot(), before)
        result = self.assert_response(self.client.post(
            BASE + "/commands", data=boundary, content_type="application/json", headers=self.headers,
        ), 201)
        self.assertEqual(result["plan"]["name"], "界" * 160)
        self.assertEqual(result["revision"], 1)
        self.assertEqual(self.counts(), (1, 1, 0, 1))

    def test_plan_and_meal_pagination_is_complete_stable_and_account_scoped(self):
        plans = [self.create_plan(i, name=f"Plan {i}") for i in range(5)]
        meals = [self.create_meal(plans[0]["id"], 5 + i, name=f"Meal {i}") for i in range(5)]
        other_plan = self.create_plan(headers=self.other_headers, name="Foreign")
        self.create_meal(other_plan["id"], headers=self.other_headers, name="Foreign meal")
        before = self.snapshot()

        def collect(path, key):
            cursor, seen_cursors, rows = None, set(), []
            for _ in range(10):
                query = {"limit": 2}
                if cursor is not None:
                    query["cursor"] = cursor
                page = self.assert_response(self.get(path, query_string=query), 200)
                self.assertEqual(set(page), {key, "revision", "next_cursor"})
                self.assertEqual(page["revision"], 10)
                self.assertIsInstance(page[key], list)
                self.assertLessEqual(len(page[key]), 2)
                rows.extend(page[key])
                cursor = page["next_cursor"]
                if cursor is None:
                    return rows
                self.assertTrue(page[key], "Nonterminal pages must make progress")
                self.assertIsInstance(cursor, str)
                self.assertNotIn(cursor, seen_cursors)
                seen_cursors.add(cursor)
            self.fail("Pagination never terminated")

        for path, key, expected in (("/plans", "plans", plans),
                                    (f'/plans/{plans[0]["id"]}/meals', "meals", meals)):
            with self.subTest(path=path):
                first = collect(path, key)
                self.assertEqual(first, collect(path, key))
                ids = [row["id"] for row in first]
                self.assertEqual(len(ids), len(set(ids)))
                self.assertEqual(set(ids), {row["id"] for row in expected})
                self.assertCountEqual(first, expected)
                self.assertEqual(ids, sorted(ids))
                for limit in (1, 100):
                    page = self.assert_response(self.get(path, query_string={"limit": limit}), 200)
                    self.assertEqual(page[key], first[:limit])
                for query in ({"limit": "0"}, {"limit": "101"}, {"limit": "-1"},
                              {"limit": "true"}, {"limit": "1.0"}, {"cursor": "bad"},
                              {"owner_id": self.other_uid}, [("limit", "1"), ("limit", "2")]):
                    self.assert_response(self.get(path, query_string=query), 400)
        self.assertEqual(self.snapshot(), before)

    def test_unknown_targets_and_invalid_target_uuids_fail_without_initializing_workspace(self):
        missing = str(uuid.uuid4())
        before = self.snapshot()
        for path in (f"/plans/{missing}", f"/plans/{missing}/meals", f"/mutations/{missing}"):
            self.assert_response(self.get(path), 404)
        targets = (
            ("plan.rename", "plan_id", {"name": "New"}),
            ("meal.create", "plan_id", {"date": START}),
            ("meal.update", "meal_id", {"name": "New"}),
        )
        for operation, field, extra in targets:
            self.assert_response(self.post(self.body(operation, {field: missing, **extra})), 404)
            for invalid in (None, True, 123, [], {}, "bad", missing.replace("-", ""),
                            "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF"):
                with self.subTest(operation=operation, invalid=invalid):
                    self.assert_response(self.post(self.body(operation, {field: invalid, **extra})), 400)
        for invalid in ("not-a-uuid", missing.replace("-", "")):
            for path in (f"/plans/{invalid}", f"/plans/{invalid}/meals", f"/mutations/{invalid}"):
                response = self.get(path)
                self.assertIn(response.status_code, (400, 404))
                self.assertIn("no-store", response.headers.get("Cache-Control", ""))
        self.assertEqual(self.snapshot(), before)

    def test_private_commands_do_not_import_or_mutate_legacy_and_recipe_sources(self):
        self.seed_legacy()
        before = self.snapshot(legacy_only=True)
        self.assertEqual(self.get("/plans").get_json()["plans"], [])
        self.assertEqual(self.get("/plans", self.other_headers).get_json()["plans"], [])
        plan = self.create_plan(name="Original recipe")
        meal = self.create_meal(plan["id"], name="Original recipe")
        self.success(self.body("plan.rename", {"plan_id": plan["id"], "name": "Private rename"}, 2))
        self.success(self.body("meal.update", {"meal_id": meal["id"], "name": "Private edit"}, 3))
        for operation, payload in (
            ("plan.create", {**self.body()["payload"], "source": "demo"}),
            ("meal.create", {"plan_id": plan["id"], "date": START, "dish_slug": "synthetic-source"}),
            ("meal.update", {"meal_id": meal["id"], "name": "No", "recipe_id": 1}),
        ):
            self.assert_response(self.post(self.body(operation, payload, 4)), 400)
        self.assertEqual(self.snapshot(legacy_only=True), before)
        self.assertEqual(self.counts(), (1, 1, 1, 4))

    def test_account_export_and_delete_include_all_private_rows_and_preserve_other_data(self):
        from models import (
            Favorite, GroceryItem, GroceryList, Household, HouseholdMember,
            MealPlan, MealPlanItem, PlanEntry, User,
        )
        from sqlalchemy import text
        # Enforce real FK restrictions in this helper-owned SQLite database so
        # the retention assertions also catch dangling references on deletion.
        with self.app.app_context():
            self.db.session.execute(text("PRAGMA foreign_keys=ON"))
            self.assertEqual(self.db.session.execute(text("PRAGMA foreign_keys")).scalar(), 1)
            self.db.session.commit()
        self.seed_legacy()
        with self.app.app_context():
            own_legacy = MealPlan(user_id=self.uid, name="Own legacy plan")
            household = Household(name="Retained shared kitchen")
            self.db.session.add_all([own_legacy, household])
            self.db.session.flush()
            own_legacy_id, household_id = own_legacy.id, household.id
            grocery_list = GroceryList(household_id=household_id)
            own_item = MealPlanItem(meal_plan_id=own_legacy_id,
                                   dish_slug="synthetic-source", level="basic")
            self.db.session.add_all([
                grocery_list, own_item,
                Favorite(user_id=self.uid, dish_slug="synthetic-source"),
                Favorite(user_id=self.other_uid, dish_slug="synthetic-source"),
                HouseholdMember(household_id=household_id, user_id=self.uid),
                HouseholdMember(household_id=household_id, user_id=self.other_uid),
            ])
            self.db.session.flush()
            own_item_id, list_id = own_item.id, grocery_list.id
            retained = []
            for user_id in (self.uid, self.other_uid):
                grocery = GroceryItem(list_id=list_id, text="Shared lentils", qty_g=250,
                                      checked=True, added_by=user_id,
                                      sources=[{"dish_slug": "synthetic-source", "dish_title": "Original recipe"}])
                entry = PlanEntry(household_id=household_id, date=START,
                                  dish_slug="synthetic-source", level="basic", serves=3,
                                  added_by=user_id)
                self.db.session.add_all([grocery, entry])
                self.db.session.flush()
                retained.extend((type(row), row.id, user_id, row.to_dict()) for row in (grocery, entry))
            self.db.session.commit()
            own_legacy_export = own_legacy.to_dict()
        own_plan = self.create_plan(name="Own private")
        own_meal = self.create_meal(own_plan["id"], name="Own meal")
        other_plan = self.create_plan(headers=self.other_headers, name="Other private")
        self.create_meal(other_plan["id"], headers=self.other_headers, name="Other meal")

        def export(headers):
            return self.assert_response(self.client.get(
                "/api/auth/me/export", headers=headers,
            ), 200)["private_planning"]

        before = self.snapshot()
        own, other = export(self.headers), export(self.other_headers)
        full_export = self.assert_response(self.client.get(
            "/api/auth/me/export", headers=self.headers,
        ), 200)
        self.assertEqual([favorite["dish_slug"] for favorite in full_export["favorites"]],
                         ["synthetic-source"])
        self.assertEqual(full_export["legacy_meal_plans"], [own_legacy_export])
        self.assertEqual(set(own), {"workspace", "plans", "meals", "mutations", "events",
                                    "event_links", "preparation_tasks", "previews", "undo", "items", "shopping_scopes", "templates", "preferences"})
        self.assertIsInstance(own["workspace"], dict)
        self.assertEqual(own["workspace"], self.get("/workspace").get_json()["workspace"])
        self.assertEqual(own["plans"], [own_plan])
        self.assertEqual(own["meals"], [own_meal])
        self.assertEqual(len(own["mutations"]), 2)
        for mutation in own["mutations"]:
            self.assertIsInstance(mutation, dict)
            receipt = self.assert_response(self.get("/mutations/" + mutation["mutation_id"]), 200)
            self.assertEqual(receipt, {"result": mutation["result"], "status_code": mutation["status_code"]})
            self.assert_response(self.get("/mutations/" + mutation["mutation_id"], self.other_headers), 404)
        self.assertNotEqual(own["workspace"], other["workspace"])
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.counts(), (2, 2, 2, 4))
        legacy_before = self.snapshot(legacy_only=True)
        self.assert_response(self.client.delete("/api/auth/me", headers=self.headers), 200)
        self.assertEqual(self.counts(), (1, 1, 1, 2))
        self.assertEqual(export(self.other_headers), other)
        with self.app.app_context():
            self.assertIsNone(self.db.session.get(User, self.uid))
            self.assertIsNotNone(self.db.session.get(User, self.other_uid))
            self.assertIsNone(self.db.session.get(MealPlan, own_legacy_id))
            self.assertIsNone(self.db.session.get(MealPlanItem, own_item_id))
            self.assertEqual(Favorite.query.filter_by(user_id=self.uid).count(), 0)
            self.assertEqual(Favorite.query.filter_by(user_id=self.other_uid).count(), 1)
            self.assertEqual(MealPlan.query.filter_by(user_id=self.other_uid).count(), 1)
            self.assertEqual(MealPlanItem.query.count(), 1)
            self.assertIsNotNone(self.db.session.get(Household, household_id))
            self.assertIsNotNone(self.db.session.get(GroceryList, list_id))
            self.assertEqual(HouseholdMember.query.filter_by(user_id=self.uid).count(), 0)
            member = HouseholdMember.query.filter_by(user_id=self.other_uid).one()
            self.assertEqual(member.household_id, household_id)
            for model, identity, user_id, content in retained:
                row = self.db.session.get(model, identity)
                self.assertIsNotNone(row)
                self.assertEqual(row.to_dict(), content)
                self.assertEqual(row.added_by, None if user_id == self.uid else self.other_uid)
            self.assertEqual(self.db.session.execute(text("PRAGMA foreign_key_check")).all(), [])
        legacy_after = self.snapshot(legacy_only=True)
        changed_tables = {model.__table__.name for model in (
            User, Favorite, MealPlan, MealPlanItem, HouseholdMember, GroceryItem, PlanEntry,
        )}
        for table, rows in legacy_before.items():
            if table not in changed_tables:
                self.assertEqual(legacy_after[table], rows, table)
        self.assert_response(self.get("/workspace"), 401)
        self.assert_response(self.post(self.body()), 401)
        self.assert_response(self.get("/plans/" + own_plan["id"], self.other_headers), 404)


if __name__ == "__main__":
    unittest.main()
