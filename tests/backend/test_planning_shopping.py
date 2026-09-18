"""Shopping service regressions; synthetic catalog, disposable DB, no route edits."""
import copy
from datetime import date
from datetime import timedelta
import json
import os
import sys
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))
from helpers import make_app, make_user


class ShoppingTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        self.context = self.app.app_context()
        self.context.push()
        from planning_shopping_models import PrivateShoppingScope
        from planning_models import PlanningWorkspace, PrivatePlan, PrivateMeal
        self.Scope = PrivateShoppingScope
        self.db.create_all()
        user = make_user(self.db, email="shopping@example.com")
        other = make_user(self.db, email="other-shopping@example.com")
        self.owner = PlanningWorkspace(user_id=user.id, revision=0)
        self.other = PlanningWorkspace(user_id=other.id, revision=0)
        self.db.session.add_all([self.owner, self.other])
        self.db.session.flush()
        self.plan = PrivatePlan(workspace_id=self.owner.id, name="Synthetic week", start_date=date(2026, 9, 1), end_date=date(2026, 9, 10))
        self.db.session.add(self.plan)
        self.db.session.flush()
        self.meals = [PrivateMeal(workspace_id=self.owner.id, plan_id=self.plan.id,
                      date=date(2026, 9, day), name=f"Meal {day}", position=0) for day in (1, 8)]
        self.db.session.add_all(self.meals)
        self.db.session.flush()
        self.first = self.dish(self.meals[0], "first", [self.ingredient("220.000")])
        self.second = self.dish(self.meals[1], "second", [self.ingredient("600.000")])
        self.db.session.commit()

    def tearDown(self):
        self.db.session.rollback()
        self.db.session.remove()
        self.context.pop()

    def ingredient(self, value, *, identity="synthetic-pasta", form="dry", unit="g", mode="measured"):
        return {"ingredient_id": identity, "form": form, "unit": unit, "amount": value,
                "label": "Synthetic ingredient", "category": "cupboard", "purchase_mode": mode}

    def dish(self, parent, slug, ingredients, *, version=2, contribution=None, base_servings=2):
        from planning_catalog import sync_catalog
        from planning_item_models import PrivatePlannedItem
        from planning_models import PrivateEvent
        sync_catalog([{"entry_id": "synthetic-" + slug, "revision": 1, "kind": "planning_example",
            "availability": "published", "content": {"schema_version": version, "recipe": None,
            "variants": [{"id": "base", "base_servings": base_servings, "languages": {"en": {
                "title": "Synthetic " + slug, "ingredients": ingredients}}}]}}])
        field = "event_id" if isinstance(parent, PrivateEvent) else "meal_id"
        position = PrivatePlannedItem.query.filter_by(**{field: parent.id}).count()
        item = PrivatePlannedItem(workspace_id=self.owner.id, **{field: parent.id}, position=position,
            kind="dish", entry_id="synthetic-" + slug, catalog_revision=1, language="en",
            options={"variant_id": "base"}, servings=2, follows_guests=False, contribution=contribution)
        self.db.session.add(item)
        self.db.session.flush()
        return item

    def command(self, op, payload, owner=None):
        from planning_shopping import apply, reconcile
        owner = owner or self.owner
        result, status = apply(owner, op, payload)
        reconcile(owner)
        owner.revision += 1
        self.db.session.flush()
        self.assertLess(len(json.dumps(result)), 180)
        self.assertTrue(set(result) <= {"scope_id", "item_id"})
        return result

    def scope(self, mode="all", owner=None, **fields):
        result = self.command("shopping.scope", {"owner_type": "plan", "owner_id": self.plan.id,
                              "mode": mode, **fields}, owner=owner)
        return self.db.session.get(self.Scope, result["scope_id"])

    def rows(self, scope):
        from planning_shopping import project
        result = project(self.owner, scope)
        self.assertNotIn("state", result["scope"])
        self.assertEqual(result["revision"], self.owner.revision)
        return result["rows"]

    def cover(self, scope, row, ids=None, status="bought", extra=False):
        return self.command("shopping.cover", {"scope_id": scope.id, "row_key": row["key"],
            "source_ids": ids if ids is not None else [s["id"] for s in row["sources"]],
            "status": status, "include_extra": extra})

    def extra(self, scope, row, value):
        self.command("shopping.extra", {"scope_id": scope.id, "row_key": row["key"], "amount": value})

    def reconcile(self):
        from planning_shopping import reconcile
        return reconcile(self.owner)

    def test_complete_projection_220_600_820_and_source_cover(self):
        scope = self.scope()
        row = self.rows(scope)[0]
        self.assertEqual(row["required"], "820.000")
        self.assertEqual(sorted(s["amount"] for s in row["sources"]), ["220.000", "600.000"])
        source = next(s for s in row["sources"] if s["item_id"] == self.first.id)
        self.cover(scope, row, [source["id"]])
        row = self.rows(scope)[0]
        self.assertEqual((row["state"], row["remaining"]), ("partial", "600.000"))
        self.cover(scope, row, status="have")
        self.assertEqual(self.rows(scope)[0]["state"], "have")
        self.db.session.commit()
        self.db.session.expire_all()
        self.assertEqual(self.rows(scope)[0]["remaining"], "0.000")

    def test_scope_canonical_reuse_empty_dates_and_independence(self):
        whole = self.scope()
        row = self.rows(whole)[0]
        self.cover(whole, row)
        narrow = self.scope("dates", start_date="2026-09-01", end_date="2026-09-01")
        self.assertEqual((self.rows(narrow)[0]["required"], self.rows(narrow)[0]["state"]), ("220.000", "needed"))
        selected = self.scope("meals", selection=["meal:" + self.meals[1].id, "meal:" + self.meals[0].id])
        reused = self.scope("meals", selection=["meal:" + self.meals[0].id, "meal:" + self.meals[1].id, "meal:" + self.meals[0].id])
        self.assertEqual(selected.id, reused.id)
        self.assertEqual(self.rows(self.scope("meals", selection=[])), [])

    def test_extra_is_separate_and_orphan_survives(self):
        scope = self.scope()
        row = self.rows(scope)[0]
        self.extra(scope, row, "100")
        row = self.rows(scope)[0]
        self.assertEqual((row["required"], row["extra"], row["total"]), ("820.000", "100.000", "920.000"))
        self.cover(scope, row)
        self.assertEqual(self.rows(scope)[0]["remaining"], "100.000")
        self.cover(scope, row, [], status="have", extra=True)
        self.assertEqual(self.rows(scope)[0]["state"], "covered")
        self.first.contribution = "Guest"
        self.second.contribution = "Guest"
        self.reconcile()
        row = self.rows(scope)[0]
        self.assertEqual((row["orphan"], row["required"], row["total"], row["sources"]), (True, "0.000", "100.000", []))
        self.extra(scope, row, "0")
        self.assertEqual(self.rows(scope), [])

    def test_increase_is_sticky_after_decrease_and_reload(self):
        scope = self.scope()
        self.cover(scope, self.rows(scope)[0])
        self.first.servings = 4
        self.reconcile()
        self.first.servings = 1
        self.reconcile()
        self.db.session.commit()
        self.db.session.expire_all()
        self.assertTrue(self.rows(scope)[0]["review"])
        self.cover(scope, self.rows(scope)[0])
        self.assertFalse(self.rows(scope)[0]["review"])

    def test_decrease_preserves_coverage_without_review(self):
        scope = self.scope()
        self.cover(scope, self.rows(scope)[0])
        self.first.servings = 1
        self.reconcile()
        self.assertEqual(self.rows(scope)[0]["state"], "bought")

    def test_drop_and_reintroduce_loses_coverage_explicit_snapshot_restores(self):
        scope = self.scope()
        self.cover(scope, self.rows(scope)[0])
        state = copy.deepcopy(scope.state)
        self.first.contribution = "Guest brings it"
        self.reconcile()
        self.first.contribution = None
        self.reconcile()
        row = self.rows(scope)[0]
        self.assertEqual(next(s for s in row["sources"] if s["item_id"] == self.first.id)["state"], "needed")
        scope.state = state  # Main's explicit reviewed inverse restores this snapshot.
        self.reconcile()
        self.assertEqual(self.rows(scope)[0]["state"], "bought")

    def test_units_and_forms_never_cross_dimensions(self):
        self.dish(self.meals[0], "units", [self.ingredient("1.000", unit="kg"),
            self.ingredient("1.000", unit="l"), self.ingredient("20.000", unit="ml"),
            self.ingredient("50.000", form="cooked")])
        rows = self.rows(self.scope())
        values = {(r["form"], r["unit"]): r["required"] for r in rows}
        self.assertEqual(values, {("dry", "g"): "1820.000", ("dry", "ml"): "1020.000", ("cooked", "g"): "50.000"})

    def test_cupboard_groups_units_preserves_taste_and_forbids_extra(self):
        from routes.planning import PlanningError
        self.dish(self.meals[0], "salt", [self.ingredient("2.000", identity="synthetic-salt", mode="check_cupboard"),
            self.ingredient(None, identity="synthetic-salt", unit="taste", mode="check_cupboard"),
            self.ingredient("1.000", identity="synthetic-salt", unit="tsp", mode="check_cupboard")])
        scope = self.scope()
        row = next(r for r in self.rows(scope) if r["purchase_mode"] == "check_cupboard")
        self.assertIsNone(row["required"])
        self.assertEqual(row["state"], "unchecked")
        self.assertEqual({s["unit"] for s in row["sources"]}, {"g", "taste", "tsp"})
        self.assertEqual(len(row["sources"]), 3)
        self.cover(scope, row, status="have")
        self.assertEqual(next(r for r in self.rows(scope) if r["key"] == row["key"])["state"], "have")
        self.cover(scope, row, status="needed")
        self.assertEqual(next(r for r in self.rows(scope) if r["key"] == row["key"])["state"], "needed")
        with self.assertRaises(PlanningError):
            self.extra(scope, row, "1")

    def test_v1_fallback_is_numeric_not_inferred(self):
        ingredient = {"ingredient_id": "salt", "form": "dry", "unit": "g", "amount": "1.000"}
        self.dish(self.meals[0], "legacy", [ingredient], version=1)
        row = next(r for r in self.rows(self.scope()) if r["ingredient_id"] == "salt")
        self.assertEqual((row["label"], row["category"], row["purchase_mode"]), ("salt", "other", "measured"))

    def test_personal_planned_identity_and_scope_additions(self):
        from planning_item_models import PrivatePlannedItem
        self.db.session.add(PrivatePlannedItem(workspace_id=self.owner.id, meal_id=self.meals[0].id,
            position=1, kind="personal", title="Synthetic ingredient", quantity=5, unit="g", follows_guests=False))
        scope = self.scope()
        self.assertEqual(len(self.rows(scope)), 2)
        result = self.command("shopping.personal.create", {"scope_id": scope.id, "title": "Synthetic ingredient"})
        row = next(r for r in self.rows(scope) if r.get("personal_id"))
        self.assertIsNone(row["total"])
        self.cover(scope, row, [], status="have", extra=True)
        self.command("shopping.personal.update", {"scope_id": scope.id, "item_id": result["item_id"],
            "title": "Synthetic ingredient", "amount": "2", "unit": "pack"})
        row = next(r for r in self.rows(scope) if r.get("personal_id"))
        self.assertEqual(row["extra_state"], "needed")
        self.command("shopping.personal.delete", {"scope_id": scope.id, "item_id": result["item_id"]})
        self.assertEqual(len(self.rows(scope)), 2)

    def event(self):
        from planning_models import PrivateEvent, PrivateEventLink
        event = PrivateEvent(workspace_id=self.owner.id, name="Synthetic occasion", date=date(2026, 9, 2), guests=2)
        self.db.session.add(event)
        self.db.session.flush()
        self.db.session.add(PrivateEventLink(workspace_id=self.owner.id, plan_id=self.plan.id, event_id=event.id))
        self.db.session.flush()
        self.dish(event, "event", [self.ingredient("80.000")])
        self.dish(event, "contributed", [self.ingredient("999.000")], contribution="Guest")
        return event

    def test_event_selection_exclusion_out_of_range_and_independent_scope(self):
        event = self.event()
        plan_scope = self.scope()
        self.assertEqual(self.rows(plan_scope)[0]["required"], "900.000")
        selected = self.scope("meals", selection=["event:" + event.id])
        self.assertEqual(self.rows(selected)[0]["required"], "80.000")
        event_id = self.command("shopping.scope", {"owner_type": "event", "owner_id": event.id, "mode": "all"})["scope_id"]
        event_scope = self.db.session.get(self.Scope, event_id)
        self.cover(event_scope, self.rows(event_scope)[0])
        self.assertEqual(self.rows(selected)[0]["state"], "needed")
        event.date = date(2026, 9, 20)
        self.reconcile()
        self.assertEqual(self.rows(plan_scope)[0]["required"], "820.000")
        self.assertEqual(self.rows(selected), [])
        self.assertEqual(self.rows(event_scope)[0]["required"], "80.000")

    def test_move_invalidation_requires_review_and_restores_scope_snapshot(self):
        from planning_models import PrivatePlan
        from planning_shopping import reconcile
        from routes.planning import PlanningError
        scope = self.scope("meals", selection=["meal:" + self.meals[0].id])
        self.command("shopping.personal.create", {"scope_id": scope.id, "title": "Keep me"})
        before = copy.deepcopy(scope.to_dict())
        target = PrivatePlan(workspace_id=self.owner.id, name="Elsewhere", start_date=self.plan.start_date, end_date=self.plan.end_date)
        self.db.session.add(target)
        self.db.session.flush()
        self.meals[0].plan_id = target.id
        with self.assertRaises(PlanningError) as error:
            reconcile(self.owner)
        self.assertEqual(error.exception.body["code"], "shopping_preview_required")
        self.assertEqual(error.exception.body["scope_ids"], [scope.id])
        self.assertEqual(scope.to_dict(), before)
        removed = reconcile(self.owner, allow_invalidated=True)
        self.assertEqual(removed["removed_scope_ids"], [scope.id])
        self.assertIsNone(self.db.session.get(self.Scope, scope.id))
        self.meals[0].plan_id = self.plan.id
        restored = self.Scope(workspace_id=self.owner.id, **before)
        self.db.session.add(restored)
        self.db.session.flush()
        reconcile(self.owner)
        self.assertEqual(restored.to_dict(), before)

    def test_foreign_scopes_sources_personal_and_owner_rejected(self):
        from planning_shopping import apply, project
        from routes.planning import PlanningError
        scope = self.scope()
        row = self.rows(scope)[0]
        with self.assertRaises(PlanningError):
            project(self.other, scope)
        with self.assertRaises(PlanningError):
            apply(self.other, "shopping.extra", {"scope_id": scope.id, "row_key": row["key"], "amount": "1"})
        with self.assertRaises(PlanningError):
            self.cover(scope, row, ['["forged"]'])
        with self.assertRaises(PlanningError):
            self.scope(owner=self.other)

    def test_unavailable_preserves_checks_and_requires_review_on_return(self):
        from planning_catalog import set_availability, CatalogError
        scope = self.scope()
        self.cover(scope, self.rows(scope)[0])
        before = copy.deepcopy(scope.state)
        set_availability(self.first.entry_id, 1, "revoked")
        self.reconcile()
        self.assertTrue(scope.state["unavailable"])
        self.assertEqual(set(scope.state["rows"]), set(before["rows"]))
        with self.assertRaises(CatalogError):
            self.rows(scope)
        # Temporary entitlement loss is reversible; revoked catalog revisions are
        # terminal. Simulate access restoration at the resolver boundary instead.
        from planning_shopping_projection import resolve_item as original
        revoked = self.first.entry_id
        with patch("planning_shopping_projection.resolve_item") as resolver:
            resolver.side_effect = lambda item, owner: {"title": "Synthetic restored", "base_servings": 2, "ingredients": [{**self.ingredient("220.000"), "source_amount": "220.000"}]} if item.entry_id == revoked else original(item, owner)
            self.reconcile()
            row = self.rows(scope)[0]
            self.assertFalse(scope.state["unavailable"])
            self.assertTrue(next(s for s in row["sources"] if s["item_id"] == self.first.id)["review"])

    def test_known_source_removal_still_reconciles_during_other_unavailability(self):
        from planning_catalog import set_availability
        scope = self.scope()
        self.cover(scope, self.rows(scope)[0])
        set_availability(self.first.entry_id, 1, "revoked")
        self.second.contribution = "Guest"
        self.reconcile()
        ids = [json.loads(s)[0] for row in scope.state["rows"].values() for s in row["sources"]]
        self.assertEqual(ids, [self.first.id])

    def test_limits_fail_without_truncation_and_reuse_at_scope_limit(self):
        from routes.planning import PlanningError
        scope = self.scope()
        with patch("planning_shopping.MAX_SCOPES", 1):
            self.assertEqual(self.scope().id, scope.id)
            with self.assertRaises(PlanningError):
                self.scope("meals", selection=[])
        with patch("planning_shopping_projection.MAX_ALLOCATIONS", 1):
            with self.assertRaises(PlanningError):
                self.rows(scope)
        with patch("planning_shopping.MAX_SCOPE_BYTES", 100):
            from planning_shopping import check_record
            with self.assertRaises(PlanningError):
                check_record(scope)

    def test_validation_rejects_replacements_numbers_and_malformed_scope(self):
        from planning_shopping import validate
        from routes.planning import PlanningError
        scope = self.scope()
        for value in (True, 1, "-1", "NaN", "1e2", "0.0001", "1000000000001"):
            with self.subTest(value=value), self.assertRaises(PlanningError):
                validate("shopping.extra", {"scope_id": scope.id, "row_key": "row", "amount": value})
        for payload in ({"owner_type": "plan", "owner_id": self.plan.id, "mode": "meals"},
                        {"owner_type": "plan", "owner_id": self.plan.id, "mode": "all", "state": {}},
                        {"owner_type": "plan", "owner_id": self.plan.id, "mode": "dates", "start_date": "2026-09-08", "end_date": "2026-09-01"}):
            with self.assertRaises(PlanningError):
                validate("shopping.scope", payload)

    def test_reads_never_persist_recipe_text_or_change_state(self):
        scope = self.scope()
        self.cover(scope, self.rows(scope)[0])
        before = copy.deepcopy(scope.to_dict())
        self.rows(scope)
        self.assertEqual(before, scope.to_dict())
        encoded = json.dumps(scope.state)
        self.assertNotIn("Synthetic first", encoded)
        self.assertNotIn("dish_title", encoded)
        self.assertNotIn("meal_title", encoded)

    def test_extra_and_personal_increases_require_sticky_review(self):
        scope = self.scope()
        row = self.rows(scope)[0]
        self.extra(scope, row, "100")
        self.cover(scope, self.rows(scope)[0], [], extra=True)
        self.extra(scope, row, "200")
        self.extra(scope, row, "50")
        self.assertTrue(self.rows(scope)[0]["extra_review"])
        identity = self.command("shopping.personal.create", {"scope_id": scope.id, "title": "Water", "amount": "1", "unit": "bottle"})["item_id"]
        personal = next(r for r in self.rows(scope) if r.get("personal_id"))
        self.cover(scope, personal, [], extra=True)
        for value in ("2", "1"):
            self.command("shopping.personal.update", {"scope_id": scope.id, "item_id": identity, "title": "Water", "amount": value, "unit": "bottle"})
        self.assertTrue(next(r for r in self.rows(scope) if r.get("personal_id"))["extra_review"])

    def test_personal_delete_preflight_is_read_only_and_works_when_dish_unavailable(self):
        from planning_shopping import validate_personal_delete
        from planning_catalog import set_availability
        from routes.planning import PlanningError
        scope = self.scope()
        identity = self.command("shopping.personal.create", {"scope_id": scope.id, "title": "Personal"})["item_id"]
        before = copy.deepcopy(scope.to_dict())
        payload = {"scope_id": scope.id, "item_id": identity}
        self.assertEqual(validate_personal_delete(self.owner, payload), payload)
        self.assertEqual(scope.to_dict(), before)
        with self.assertRaises(PlanningError):
            validate_personal_delete(self.other, payload)
        set_availability(self.first.entry_id, 1, "revoked")
        self.command("shopping.personal.delete", payload)
        self.assertEqual(scope.state["personal"], [])
        with self.assertRaises(PlanningError):
            validate_personal_delete(self.owner, payload)

    def test_compatible_units_combine_source_basis_before_coverage(self):
        self.dish(self.meals[0], "two-units", [self.ingredient("1", unit="kg"), self.ingredient("20", unit="g")])
        scope = self.scope()
        row = self.rows(scope)[0]
        self.assertEqual(row["required"], "1840.000")
        self.assertEqual(len(row["sources"]), 3)
        source = next(s for s in row["sources"] if s["amount"] == "1020.000")
        self.cover(scope, row, [source["id"]])
        self.assertEqual(self.rows(scope)[0]["remaining"], "820.000")

    def test_invalid_state_does_not_rewrite_or_leak_in_projection(self):
        from planning_shopping import check_state
        from routes.planning import PlanningError
        scope = self.scope()
        self.cover(scope, self.rows(scope)[0])
        state = copy.deepcopy(scope.state)
        state["rows"][next(iter(state["rows"]))]["recipe_text"] = "Do not retain"
        with self.assertRaises(PlanningError):
            check_state(state)
        state = copy.deepcopy(scope.state)
        basis = next(iter(next(iter(state["rows"].values()))["sources"].values()))
        basis["state"] = "pantry"
        with self.assertRaises(PlanningError):
            check_state(state)

    def test_caller_rollback_restores_move_after_preview_required(self):
        from planning_models import PrivatePlan
        from planning_shopping import reconcile
        from routes.planning import PlanningError
        scope = self.scope("meals", selection=["meal:" + self.meals[0].id])
        self.cover(scope, self.rows(scope)[0])
        self.db.session.commit()
        before = copy.deepcopy(scope.to_dict())
        original_parent = self.meals[0].plan_id
        target = PrivatePlan(workspace_id=self.owner.id, name="Move target", start_date=self.plan.start_date, end_date=self.plan.end_date)
        self.db.session.add(target)
        self.db.session.flush()
        self.meals[0].plan_id = target.id
        with self.assertRaises(PlanningError):
            reconcile(self.owner)
        self.db.session.rollback()
        self.assertEqual(self.meals[0].plan_id, original_parent)
        self.assertEqual(scope.to_dict(), before)

    def test_null_taste_projection_supported_without_aggregate_conversion(self):
        from planning_shopping_projection import resolve_item as original
        def resolve(item, owner):
            if item.id == self.first.id:
                return {"title": "Synthetic taste", "base_servings": 2, "ingredients": [{**self.ingredient(None, identity="synthetic-salt", unit=None, mode="check_cupboard"), "source_amount": None}]}
            return original(item, owner)
        with patch("planning_shopping_projection.resolve_item", side_effect=resolve):
            scope = self.scope()
            row = next(r for r in self.rows(scope) if r["purchase_mode"] == "check_cupboard")
            self.assertIsNone(row["sources"][0]["unit"])
            self.assertIsNone(row["sources"][0]["amount"])
            self.cover(scope, row, status="have")
            self.assertEqual(next(r for r in self.rows(scope) if r["key"] == row["key"])["state"], "have")

    def test_sql_composite_owner_and_scope_unique_constraints(self):
        from sqlalchemy.exc import IntegrityError
        from planning_models import new_id
        scope = self.scope()
        values = dict(id=new_id(), workspace_id=self.other.id, plan_id=self.plan.id,
            mode="all", selection=[], selection_digest="a" * 64, state={"rows": {}, "personal": [], "unavailable": False})
        self.db.session.commit()
        # Separate disposable connection enables SQLite FKs before the insert.
        with self.db.engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            with self.assertRaises(IntegrityError):
                connection.execute(self.Scope.__table__.insert(), values)
            connection.rollback()
            values.update(workspace_id=self.owner.id, selection_digest=scope.selection_digest)
            with self.assertRaises(IntegrityError):
                connection.execute(self.Scope.__table__.insert(), values)
            connection.rollback()

    def test_personal_capacity_failure_rolls_back_without_partial_save(self):
        from planning_shopping import apply
        from routes.planning import PlanningError
        scope = self.scope()
        self.db.session.commit()
        before = copy.deepcopy(scope.to_dict())
        with patch("planning_shopping.MAX_SCOPE_BYTES", 400):
            with self.assertRaises(PlanningError):
                apply(self.owner, "shopping.personal.create", {"scope_id": scope.id, "title": "X" * 160})
        self.db.session.rollback()
        self.assertEqual(scope.to_dict(), before)

    def test_resolution_memo_limits_catalog_queries_across_100_scopes(self):
        from sqlalchemy import event
        from planning_item_models import PrivatePlannedItem
        from planning_models import new_id
        from planning_shopping import digest, reconcile
        from planning_shopping_models import empty_state
        from planning_shopping_projection import resolve_item as original
        # Eight occurrences, only two exact configurations. Every scope includes
        # all eight, with distinct inclusive end dates and independent state.
        self.plan.end_date = self.plan.start_date + timedelta(days=110)
        for index in range(6):
            source = self.first if index % 2 == 0 else self.second
            fields = source.to_dict()
            fields.pop("id")
            fields.update(meal_id=self.meals[0].id, position=index + 1)
            self.db.session.add(PrivatePlannedItem(workspace_id=self.owner.id, **fields))
        self.db.session.flush()
        scopes = []
        for index in range(100):
            scope = self.Scope(id=new_id(), workspace_id=self.owner.id, plan_id=self.plan.id,
                mode="dates", selection=[], start_date=self.plan.start_date,
                end_date=self.plan.start_date + timedelta(days=index + 8), state=empty_state())
            scope.selection_digest = digest(scope)
            scopes.append(scope)
        self.db.session.add(scopes[0])
        self.db.session.flush()

        def measured():
            statements = []
            def record(_connection, _cursor, statement, _parameters, _context, _many):
                if statement.lstrip().upper().startswith("SELECT"):
                    statements.append(statement)
            event.listen(self.db.engine, "before_cursor_execute", record)
            try:
                with patch("planning_shopping_projection.resolve_item", wraps=original) as resolver:
                    started = time.perf_counter()
                    reconcile(self.owner)
                    elapsed = time.perf_counter() - started
                    resolutions = resolver.call_count
            finally:
                event.remove(self.db.engine, "before_cursor_execute", record)
            return resolutions, sum("planning_catalog_entries" in sql for sql in statements), len(statements), elapsed

        one = measured()
        self.db.session.add_all(scopes[1:])
        self.db.session.flush()
        hundred = measured()
        self.assertEqual((one[0], hundred[0]), (2, 2))
        self.assertEqual(one[1], hundred[1])
        self.assertGreater(one[1], 0)  # Real persisted catalog queries, not a stub.
        self.assertLess(hundred[3], 15, "Modest reconciliation exceeded the client request timeout")
        # No scopes were skipped; demand changes must reach the last scope too.
        self.assertEqual(self.Scope.query.filter_by(workspace_id=self.owner.id).count(), 100)
        for scope in (scopes[0], scopes[-1]):
            self.assertEqual(self.rows(scope)[0]["required"], "3280.000")
        print(f"\nShopping memo performance (SQLite, 8 occurrences / 2 configurations): "
              f"1 scope: {one[0]} resolutions, {one[1]} catalog SELECTs, {one[2]} total SELECTs, {one[3]:.3f}s; "
              f"100 scopes: {hundred[0]} resolutions, {hundred[1]} catalog SELECTs, {hundred[2]} total SELECTs, {hundred[3]:.3f}s", flush=True)

    def test_project_memo_is_fresh_each_call_and_includes_servings_and_options(self):
        from planning_item_models import PrivatePlannedItem
        from planning_shopping_projection import resolve_item as original
        from planning_catalog import CatalogError, set_availability
        fields = self.first.to_dict()
        fields.pop("id")
        fields["position"] = 1
        duplicate = PrivatePlannedItem(workspace_id=self.owner.id, **fields)
        self.db.session.add(duplicate)
        self.db.session.flush()
        scope = self.scope()
        with patch("planning_shopping_projection.resolve_item", wraps=original) as resolver:
            self.assertEqual(self.rows(scope)[0]["required"], "1040.000")
            self.assertEqual(resolver.call_count, 2)
            duplicate.servings = 4
            self.assertEqual(self.rows(scope)[0]["required"], "1260.000")
            self.assertEqual(resolver.call_count, 4)
            duplicate.options = {"variant_id": "missing"}
            with self.assertRaises(CatalogError):
                self.rows(scope)
            duplicate.options = {"variant_id": "base"}
            self.rows(scope)
            set_availability(self.first.entry_id, 1, "revoked")
            with self.assertRaises(CatalogError):
                self.rows(scope)  # Even inside the same SQL transaction: new memo.

    def test_resolution_memo_rejects_owner_and_transaction_reuse(self):
        from planning_shopping_projection import _ResolutionMemo
        memo = _ResolutionMemo(self.owner)
        memo.resolve(self.first, self.owner)
        with self.assertRaises(RuntimeError):
            memo.resolve(self.first, self.other)
        self.db.session.commit()
        with self.assertRaises(RuntimeError):
            memo.resolve(self.first, self.owner)

    def test_unavailable_memo_reconciles_every_scope_and_is_not_reused(self):
        from planning_catalog import set_availability, CatalogError
        from planning_shopping_projection import resolve_item as original
        from planning_shopping import reconcile
        whole = self.scope()
        narrow = self.scope("dates", start_date="2026-09-01", end_date="2026-09-01")
        for scope in (whole, narrow):
            self.cover(scope, self.rows(scope)[0])
        set_availability(self.first.entry_id, 1, "revoked")
        with patch("planning_shopping_projection.resolve_item", wraps=original) as resolver:
            reconcile(self.owner)
            self.assertEqual(resolver.call_count, 2)
        for scope in (whole, narrow):
            self.assertTrue(scope.state["unavailable"])
            with self.assertRaises(CatalogError):
                self.rows(scope)
            self.assertTrue(any(basis["review"] for row in scope.state["rows"].values()
                                for basis in row["sources"].values()))

    def test_scope_delete_preflight_is_read_only_owned_and_strict(self):
        from planning_shopping import validate, validate_scope_delete, apply
        from planning_models import new_id
        from routes.planning import PlanningError
        scope = self.scope()
        before = copy.deepcopy(scope.to_dict())
        payload = {"scope_id": scope.id}
        self.assertEqual(validate_scope_delete(self.owner, payload), payload)
        self.assertEqual(scope.to_dict(), before)
        for op in (validate_scope_delete, lambda owner, body: apply(owner, "shopping.scope.delete", body)):
            with self.assertRaises(PlanningError) as error:
                op(self.other, payload)
            self.assertEqual(error.exception.status, 404)
            with self.assertRaises(PlanningError) as error:
                op(self.owner, {"scope_id": new_id()})
            self.assertEqual(error.exception.status, 404)
        for malformed in ({}, {"scope_id": None}, {"scope_id": []}, {"scope_id": scope.id, "state": {}},
                          {"scope_id": scope.id, "owner_id": self.other.id}):
            with self.assertRaises(PlanningError):
                validate("shopping.scope.delete", malformed)
        self.assertEqual(scope.to_dict(), before)

    def test_scope_delete_large_unavailable_record_preserves_exact_rollback(self):
        from planning_shopping import apply, validate_scope_delete, check_record
        from planning_catalog import set_availability
        from planning_models import new_id
        scope = self.scope()
        self.cover(scope, self.rows(scope)[0], status="have")
        self.extra(scope, self.rows(scope)[0], "100")
        state = copy.deepcopy(scope.state)
        state["personal"] = [{"id": new_id(), "title": "Synthetic " + "P" * 150,
            "amount": None, "unit": None, "coverage": {"amount": None, "state": "needed", "review": False}}
            for _ in range(1400)]
        scope.state = state
        set_availability(self.first.entry_id, 1, "revoked")
        self.reconcile()
        check_record(scope)
        self.db.session.commit()
        before = copy.deepcopy(scope.to_dict())
        self.assertGreater(len(json.dumps(before).encode()), 256 * 1024)
        self.assertLess(len(json.dumps(before).encode()), 512 * 1024)
        with patch("planning_shopping_projection.resolve_item", side_effect=AssertionError("Cleanup must not resolve unavailable recipes")):
            self.assertEqual(validate_scope_delete(self.owner, {"scope_id": scope.id}), {"scope_id": scope.id})
            result, status = apply(self.owner, "shopping.scope.delete", {"scope_id": scope.id})
            self.assertEqual((result, status), ({"scope_id": before["id"]}, 200))
        self.assertIsNone(self.db.session.get(self.Scope, before["id"]))
        self.db.session.rollback()  # Leaf never commits; caller failure restores all state.
        restored = self.db.session.get(self.Scope, before["id"])
        self.assertEqual(restored.to_dict(), before)

    def test_scope_delete_frees_actual_100_scope_capacity_without_eviction(self):
        from planning_shopping import digest
        from planning_shopping_models import empty_state
        from planning_models import new_id
        from routes.planning import PlanningError
        whole = self.scope()
        self.cover(whole, self.rows(whole)[0])
        self.plan.end_date = self.plan.start_date + timedelta(days=110)
        siblings = []
        for index in range(99):
            scope = self.Scope(id=new_id(), workspace_id=self.owner.id, plan_id=self.plan.id,
                mode="dates", selection=[], start_date=self.plan.start_date,
                end_date=self.plan.start_date + timedelta(days=index + 8), state=empty_state())
            scope.selection_digest = digest(scope)
            siblings.append(scope)
        self.db.session.add_all(siblings)
        self.db.session.flush()
        before = [copy.deepcopy(scope.to_dict()) for scope in siblings]
        plan_before = copy.deepcopy(self.plan.to_dict())
        meals_before = [copy.deepcopy(meal.to_dict()) for meal in self.meals]
        with self.assertRaises(PlanningError):
            self.scope("meals", selection=[])
        original_id = whole.id
        self.command("shopping.scope.delete", {"scope_id": original_id})
        self.assertEqual(self.Scope.query.filter_by(workspace_id=self.owner.id).count(), 99)
        replacement = self.scope()
        self.assertNotEqual(replacement.id, original_id)
        self.assertEqual(self.Scope.query.filter_by(workspace_id=self.owner.id).count(), 100)
        self.assertEqual(self.rows(replacement)[0]["state"], "needed")
        self.assertEqual([scope.to_dict() for scope in siblings], before)
        self.assertEqual(self.plan.to_dict(), plan_before)
        self.assertEqual([meal.to_dict() for meal in self.meals], meals_before)

    def test_scope_delete_snapshot_can_restore_exact_state_without_touching_other_scope(self):
        from planning_shopping import apply
        scope = self.scope("dates", start_date="2026-09-01", end_date="2026-09-01")
        self.extra(scope, self.rows(scope)[0], "100")
        self.cover(scope, self.rows(scope)[0], status="have", extra=True)
        self.command("shopping.personal.create", {"scope_id": scope.id, "title": "Synthetic personal", "amount": "2", "unit": "bottle"})
        other = self.scope()
        before, other_before = copy.deepcopy(scope.to_dict()), copy.deepcopy(other.to_dict())
        apply(self.owner, "shopping.scope.delete", {"scope_id": scope.id})
        self.reconcile()
        self.assertEqual(other.to_dict(), other_before)
        # Exercise the full model snapshot shape expected by main's guarded undo,
        # without claiming to test the central preview/undo protocol here.
        values = copy.deepcopy(before)
        for key in ("start_date", "end_date"):
            values[key] = date.fromisoformat(values[key]) if values[key] else None
        restored = self.Scope(workspace_id=self.owner.id, **values)
        self.db.session.add(restored)
        self.db.session.flush()
        self.reconcile()
        self.assertEqual(restored.to_dict(), before)
        self.assertEqual(other.to_dict(), other_before)

    def test_variant_memo_matches_direct_resolution_for_servings_variants_and_languages(self):
        from types import SimpleNamespace
        from planning_catalog import sync_catalog
        from planning_items import resolve_item as direct
        from planning_shopping_projection import _ResolutionMemo
        variants = []
        for variant_id, value in (("a", "1.000"), ("b", "2.000")):
            variants.append({"id": variant_id, "base_servings": 3, "languages": {
                language: {"title": f"Synthetic {variant_id} {language}", "ingredients": [
                    self.ingredient(value), self.ingredient(None, identity="salt", unit="taste", mode="check_cupboard")]}
                for language in ("en", "de")}})
        sync_catalog([{"entry_id": "synthetic-memo", "revision": 1, "kind": "planning_example",
            "availability": "published", "content": {"schema_version": 2, "recipe": None, "variants": variants}}])
        memo = _ResolutionMemo(self.owner)
        with patch("planning_shopping_projection.resolve_item", wraps=direct) as resolver:
            for language in ("en", "de"):
                for variant in ("a", "b"):
                    for servings in (2, 1, 3, 1000, 7, 2):
                        item = SimpleNamespace(entry_id="synthetic-memo", catalog_revision=1,
                            language=language, options={"variant_id": variant}, servings=servings)
                        expected = direct(item, self.owner)
                        actual = memo.resolve(item, self.owner)
                        self.assertEqual(actual, {key: expected[key] for key in ("title", "ingredients")})
                        self.assertIsNone(actual["ingredients"][1]["amount"])
            self.assertEqual(resolver.call_count, 4)

    def test_variant_memo_range_failures_are_serving_specific_and_cache_hits_validate(self):
        from types import SimpleNamespace
        from planning_items import resolve_item as direct
        from planning_shopping_projection import _ResolutionMemo
        from planning_catalog import CatalogError
        from routes.planning import PlanningError
        for slug, source, base, valid_servings, invalid_servings in (
                ("memo-overflow", "1000000", 1, 1, 2),
                ("memo-round-zero", "0.001", 1000, 1000, 1)):
            # Create the item at its valid serving count through a plain selection;
            # the fixture dish helper itself only persists, it does not resolve.
            original = self.dish(self.meals[0], slug, [self.ingredient(source)], base_servings=base)
            item = SimpleNamespace(**original.to_dict())
            for invalid_first in (False, True):
                memo = _ResolutionMemo(self.owner)
                order = (invalid_servings, valid_servings) if invalid_first else (valid_servings, invalid_servings)
                for servings in order:
                    item.servings = servings
                    if servings == invalid_servings:
                        with self.assertRaises(CatalogError) as expected:
                            direct(item, self.owner)
                        with self.assertRaises(CatalogError) as actual:
                            memo.resolve(item, self.owner)
                        self.assertEqual(actual.exception.body, expected.exception.body)
                    else:
                        expected = direct(item, self.owner)
                        self.assertEqual(memo.resolve(item, self.owner)["ingredients"], expected["ingredients"])
                # An overflow/underflow must not poison later valid demand.
                item.servings = valid_servings
                self.assertEqual(memo.resolve(item, self.owner)["ingredients"], direct(item, self.owner)["ingredients"])
                for invalid in (True, 0, -1, "1.5", "1001", "NaN"):
                    item.servings = invalid
                    with self.assertRaises((PlanningError, CatalogError)):
                        memo.resolve(item, self.owner)

    def test_variant_memo_never_caches_database_or_integrity_failures(self):
        from sqlalchemy.exc import OperationalError
        from planning_items import resolve_item as direct
        from planning_shopping_projection import _ResolutionMemo
        from planning_catalog import CatalogError
        for error in (OperationalError("SELECT", {}, RuntimeError("Synthetic failure")),
                      CatalogError("catalog_integrity_error", "Synthetic corrupt content", 503),
                      CatalogError("invalid_session", "Synthetic deleted account", 401)):
            memo = _ResolutionMemo(self.owner)
            expected = direct(self.first, self.owner)
            with patch("planning_shopping_projection.resolve_item", side_effect=[error, expected]) as resolver:
                with self.assertRaises(type(error)):
                    memo.resolve(self.first, self.owner)
                self.assertEqual(memo.resolve(self.first, self.owner)["ingredients"], expected["ingredients"])
                self.assertEqual(resolver.call_count, 2)

    def test_admission_counts_unchecked_repeated_compatible_and_cupboard_sources(self):
        from planning_shopping import preflight
        from planning_shopping_projection import selection_items
        from planning_item_models import PrivatePlannedItem
        self.dish(self.meals[0], "budget-units", [self.ingredient("1", unit="kg"),
            self.ingredient("1", unit="g"), self.ingredient("1", form="cooked"),
            self.ingredient("1", identity="salt", mode="check_cupboard"),
            self.ingredient("1", identity="salt", unit="kg", mode="check_cupboard"),
            self.ingredient(None, identity="salt", unit="taste", mode="check_cupboard")])
        self.db.session.add_all([
            PrivatePlannedItem(workspace_id=self.owner.id, meal_id=self.meals[0].id,
                position=2, kind="personal", title="Personal", follows_guests=False),
            PrivatePlannedItem(workspace_id=self.owner.id, meal_id=self.meals[0].id,
                position=3, kind="note", title="Excluded", follows_guests=False)])
        whole = self.scope()
        narrow = self.scope("meals", selection=["meal:" + self.meals[0].id])
        self.command("shopping.personal.create", {"scope_id": narrow.id, "title": "Unquantified"})
        # Whole: two original sources + five new allocations + planned personal.
        # Narrow: one original + five + planned personal + scope personal.
        self.assertEqual(preflight(self.owner)["demand_allocations"], 16)
        self.assertFalse(whole.state["rows"])  # No bought/have bases required to count.
        self.assertEqual(preflight(self.other)["demand_allocations"], 0)
        row = next(r for r in self.rows(whole) if r["unit"] == "g" and r["form"] == "cooked")
        self.extra(whole, row, "3")
        added = next(item for item, _ in selection_items(self.owner, whole)
                     if item.entry_id == "synthetic-budget-units")
        added.contribution = "Guest brings it"
        self.reconcile()
        self.assertEqual(preflight(self.owner)["demand_allocations"], 6)
        self.assertTrue(any(row.get("orphan") for row in self.rows(whole)))

    def test_admission_rejects_proposed_unchecked_demand_before_resolution_and_rolls_back(self):
        from planning_shopping import preflight, reconcile
        from planning_item_models import PrivatePlannedItem
        from routes.planning import PlanningError
        scope = self.scope()
        self.db.session.commit()
        with patch("planning_shopping.MAX_WORKSPACE_ALLOCATIONS", 2):
            self.assertEqual(preflight(self.owner)["demand_allocations"], 2)
            self.db.session.add(PrivatePlannedItem(workspace_id=self.owner.id, meal_id=self.meals[0].id,
                position=1, kind="personal", title="Over budget", follows_guests=False))
            with patch("planning_shopping_projection.resolve_item", side_effect=AssertionError("Must preflight first")):
                with self.assertRaises(PlanningError) as caught:
                    reconcile(self.owner)
            self.assertEqual(caught.exception.status, 422)
            self.assertEqual(caught.exception.body["code"], "shopping_capacity_exceeded")
            self.assertEqual(caught.exception.body["dimension"], "demand_allocations")
            self.assertEqual(caught.exception.body["used"], 3)
            self.db.session.rollback()
            self.assertEqual(preflight(self.owner)["demand_allocations"], 2)
            self.assertEqual(scope.state["rows"], {})

    def test_admission_catalog_count_rejection_and_unavailable_retained_count(self):
        from planning_shopping import preflight
        from planning_catalog import set_availability
        from routes.planning import PlanningError
        self.dish(self.meals[0], "budget-many", [self.ingredient("1", identity=f"i{index}") for index in range(10)])
        self.scope()
        set_availability(self.first.entry_id, 1, "revoked")
        with patch("planning_shopping_projection.resolve_item", side_effect=AssertionError("No authorized resolution in preflight")):
            self.assertEqual(preflight(self.owner)["demand_allocations"], 12)
            with patch("planning_shopping.MAX_WORKSPACE_ALLOCATIONS", 11):
                with self.assertRaises(PlanningError) as caught:
                    preflight(self.owner)
        self.assertEqual(caught.exception.body["used"], 12)
        self.assertNotIn("lower_bound", caught.exception.body)

    def test_admission_state_bytes_are_stored_json_including_orphans_and_personal(self):
        from sqlalchemy import text
        from planning_shopping import preflight, blank_row
        from planning_shopping_projection import token, aggregate_state_bytes
        from routes.planning import PlanningError
        scope = self.scope()
        self.command("shopping.personal.create", {"scope_id": scope.id, "title": "Öl 🥣"})
        state = copy.deepcopy(scope.state)
        orphan = blank_row()
        orphan["extra"] = "1.000"
        state["rows"][token("orphan", "raw", "g")] = orphan
        scope.state = state
        self.db.session.flush()
        raw = self.db.session.execute(text("SELECT state FROM private_shopping_scopes WHERE id=:id"), {"id": scope.id}).scalar_one()
        size = len(raw.encode("utf-8"))
        self.assertEqual(aggregate_state_bytes(self.owner), size)
        self.assertEqual(preflight(self.owner)["state_bytes"], size)
        self.assertEqual(preflight(self.owner)["demand_allocations"], 3)
        with patch("planning_shopping.MAX_WORKSPACE_STATE_BYTES", size):
            preflight(self.owner)
        with patch("planning_shopping.MAX_WORKSPACE_STATE_BYTES", size - 1), \
                patch("planning_shopping_projection.resolve_item", side_effect=AssertionError("Must reject before resolve")):
            with self.assertRaises(PlanningError) as caught:
                preflight(self.owner)
        self.assertEqual(caught.exception.body["dimension"], "state_bytes")
        self.assertEqual(caught.exception.status, 422)

    def test_admission_invalidated_scopes_excluded_only_after_explicit_review(self):
        from planning_shopping import preflight
        from routes.planning import PlanningError
        whole = self.scope()
        narrow = self.scope("meals", selection=["meal:" + self.meals[0].id])
        self.db.session.delete(self.meals[0])
        with self.assertRaises(PlanningError) as caught:
            preflight(self.owner)
        self.assertEqual(caught.exception.body["code"], "shopping_preview_required")
        admitted = preflight(self.owner, allow_invalidated=True)
        self.assertEqual(admitted["invalid_scope_ids"], [narrow.id])
        self.assertEqual(admitted["scope_count"], 1)
        self.assertEqual(admitted["demand_allocations"], 1)
        self.assertIsNotNone(self.db.session.get(self.Scope, whole.id))

    def test_admission_recovery_delete_read_and_single_scope_restore_bypass_only_aggregate(self):
        from planning_shopping import apply, preflight, project, reconcile_scope, check_record
        from routes.planning import PlanningError
        scope = self.scope()
        self.cover(scope, self.rows(scope)[0])
        snapshot = copy.deepcopy(scope.to_dict())
        with patch("planning_shopping.MAX_WORKSPACE_ALLOCATIONS", 1):
            with self.assertRaises(PlanningError):
                preflight(self.owner)
            self.assertEqual(len(project(self.owner, scope)["rows"][0]["sources"]), 2)
            apply(self.owner, "shopping.scope.delete", {"scope_id": scope.id})
            restored = self.Scope(workspace_id=self.owner.id, **snapshot)
            self.db.session.add(restored)
            project(self.owner, restored)
            check_record(restored)
            reconcile_scope(self.owner, restored)
            self.assertEqual(restored.to_dict(), snapshot)
            with patch("planning_shopping_projection.MAX_ALLOCATIONS", 1):
                with self.assertRaises(PlanningError):
                    project(self.owner, restored)

    def test_catalog_work_budget_counts_distinct_revisions_and_exact_persisted_bytes(self):
        from sqlalchemy import text
        from planning_shopping import preflight, project
        from planning_shopping_projection import catalog_work_bytes
        from routes.planning import PlanningError
        whole = self.scope()
        narrow = self.scope("meals", selection=["meal:" + self.meals[0].id])
        raw = self.db.session.execute(text("SELECT content FROM planning_catalog_entries")).scalars().all()
        total = sum(len(value.encode()) for value in raw)
        self.assertEqual(preflight(self.owner)["catalog_bytes"], total)
        self.assertEqual(catalog_work_bytes([(self.first.entry_id, 1)] * 100), len(raw[0].encode()))
        with patch("planning_shopping.MAX_CATALOG_WORK_BYTES", total):
            preflight(self.owner)
        with patch("planning_shopping.MAX_CATALOG_WORK_BYTES", total - 1):
            with self.assertRaises(PlanningError) as caught:
                preflight(self.owner)
            self.assertEqual(caught.exception.body["dimension"], "catalog_bytes")
            self.assertEqual(caught.exception.body["used"], total)
            self.assertEqual(caught.exception.status, 422)
            # Another scope's references do not consume the single-read budget.
            project(self.owner, narrow)
            with self.assertRaises(PlanningError):
                project(self.owner, whole)

    def test_catalog_work_budget_rejects_large_content_before_any_materialization_or_resolve(self):
        from sqlalchemy import event
        from planning_catalog import sync_catalog
        from planning_item_models import PrivatePlannedItem
        from planning_shopping import preflight, project, digest, apply, MAX_CATALOG_WORK_BYTES
        from planning_shopping_models import empty_state
        from planning_models import new_id
        from routes.planning import PlanningError
        content = {"schema_version": 2, "recipe": {"dish_slug": "synthetic-large", "level": "basic"},
            "variants": [{"id": "base", "base_servings": 2, "languages": {"en": {
                "title": "Synthetic large retained revision", "ingredients": [self.ingredient("1.000")],
                "method": ["x" * 4000] * 64, "equipment": [], "time_min": 1}}}]}
        # Real, individually valid <=256KiB catalog records. Their selected
        # variant contributes ONE allocation each, but the invocation exceeds8MiB.
        sync_catalog([{"entry_id": f"synthetic-large-{index}", "revision": 1, "kind": "recipe",
            "availability": "published", "content": content} for index in range(34)])
        self.db.session.add_all([PrivatePlannedItem(workspace_id=self.owner.id, meal_id=self.meals[0].id,
            position=index + 1, kind="dish", entry_id=f"synthetic-large-{index}", catalog_revision=1,
            language="en", options={"variant_id": "base"}, servings=2, follows_guests=False) for index in range(34)])
        scope = self.Scope(id=new_id(), workspace_id=self.owner.id, plan_id=self.plan.id,
            mode="all", selection=[], state=empty_state())
        scope.selection_digest = digest(scope)
        self.db.session.add(scope)
        self.db.session.commit()
        scope_id = scope.id
        self.db.session.expire_all()
        catalog_queries = []
        def reject_materialization(_connection, _cursor, statement, _parameters, _context, _many):
            if "planning_catalog_entries" in statement and statement.lstrip().upper().startswith("SELECT"):
                catalog_queries.append(statement)
                self.assertTrue(statement.lstrip().upper().startswith("SELECT COALESCE(SUM("), statement)
        event.listen(self.db.engine, "before_cursor_execute", reject_materialization)
        try:
            with patch("planning_shopping_projection.resolve_item", side_effect=AssertionError("Must not resolve")):
                for call in (lambda: preflight(self.owner), lambda: project(self.owner, scope_id)):
                    with self.assertRaises(PlanningError) as caught:
                        call()
                    self.assertEqual(caught.exception.status, 422)
                    self.assertEqual(caught.exception.body["dimension"], "catalog_bytes")
                    self.assertGreater(caught.exception.body["used"], MAX_CATALOG_WORK_BYTES)
                self.assertEqual(len(catalog_queries), 2)
                # Explicit synthetic deletion remains usable; no catalog budget
                # bypass is given to strict projection/restoration.
                apply(self.owner, "shopping.scope.delete", {"scope_id": scope_id})
                self.assertEqual(len(catalog_queries), 2)
        finally:
            event.remove(self.db.engine, "before_cursor_execute", reject_materialization)

    def test_catalog_work_budget_sizes_all_parameter_batches_before_content_read(self):
        from sqlalchemy import event, text
        from planning_shopping_projection import catalog_work_bytes
        from routes.planning import PlanningError
        # 401 distinct referenced keys exercise the bounded SQL-parameter chunks;
        # missing retained keys contribute no bytes here, but full preflight must
        # subsequently reject their missing content rather than accept a demand.
        references = [("absent", revision) for revision in range(400)] + [(self.first.entry_id, 1)]
        raw = self.db.session.execute(text("SELECT content FROM planning_catalog_entries WHERE entry_id=:id"),
                                      {"id": self.first.entry_id}).scalar_one()
        seen = []
        def observe(_connection, _cursor, statement, _parameters, _context, _many):
            if "planning_catalog_entries" in statement:
                seen.append(statement)
                self.assertTrue(statement.lstrip().upper().startswith("SELECT COALESCE(SUM("))
        event.listen(self.db.engine, "before_cursor_execute", observe)
        try:
            with patch("planning_shopping.MAX_CATALOG_WORK_BYTES", len(raw.encode()) - 1):
                with self.assertRaises(PlanningError):
                    catalog_work_bytes(references)
            self.assertEqual(len(seen), 2)
        finally:
            event.remove(self.db.engine, "before_cursor_execute", observe)


    def test_variant_admission_uses_union_ignores_servings_and_shares_canonical_memo_key(self):
        from types import SimpleNamespace
        from planning_shopping import preflight
        from planning_shopping_projection import variant_key
        from planning_item_models import PrivatePlannedItem
        whole = self.scope()
        self.scope("meals", selection=["meal:" + self.meals[0].id])
        self.db.session.add(PrivatePlannedItem(workspace_id=self.owner.id, meal_id=self.meals[0].id,
            position=1, kind="dish", entry_id=self.first.entry_id, catalog_revision=1,
            language="en", options={"variant_id": "base"}, servings=3, follows_guests=False))
        self.assertEqual(preflight(self.owner)["variant_resolutions"], 2)
        self.assertEqual(preflight(self.other)["variant_resolutions"], 0)
        self.first.contribution = "Guest"
        # The other serving occurrence still references this variant.
        self.assertEqual(preflight(self.owner)["variant_resolutions"], 2)
        first = SimpleNamespace(entry_id="synthetic", catalog_revision=1, language="en",
                                options={"b": 2, "a": 1}, servings=1)
        second = SimpleNamespace(**{**vars(first), "options": {"a": 1, "b": 2}, "servings": 1000})
        self.assertEqual(variant_key(first), variant_key(second))
        for changed in ({"entry_id": "other"}, {"catalog_revision": 2}, {"language": "de"}, {"options": {"a": 1, "b": 3}}):
            self.assertNotEqual(variant_key(first), variant_key(SimpleNamespace(**{**vars(first), **changed})))
        self.assertIsNotNone(whole.id)

    def test_variant_admission_512_boundary_513_rejects_before_catalog_and_rolls_back(self):
        from sqlalchemy import event
        from planning_catalog import sync_catalog
        from planning_models import PrivateMeal, new_id
        from planning_item_models import PrivatePlannedItem
        from planning_shopping import preflight, project, digest
        from planning_shopping_models import empty_state
        from routes.planning import PlanningError
        content = {"schema_version": 2, "recipe": None, "variants": [
            {"id": f"v{index}", "base_servings": 2, "languages": {"en": {
                "title": "Synthetic variant budget", "ingredients": [self.ingredient("1.000")]}}}
            for index in range(32)]}
        sync_catalog([{"entry_id": f"synthetic-variant-{index}", "revision": 1, "kind": "planning_example",
            "availability": "published", "content": content} for index in range(16)])
        meals = [PrivateMeal(id=new_id(), workspace_id=self.owner.id, plan_id=self.plan.id,
            date=self.plan.start_date, position=index + 1, name="Synthetic variant budget") for index in range(6)]
        self.db.session.add_all(meals)
        self.db.session.flush()
        self.db.session.add_all([PrivatePlannedItem(workspace_id=self.owner.id, meal_id=meals[index // 100].id,
            position=index % 100, kind="dish", entry_id=f"synthetic-variant-{index // 32}", catalog_revision=1,
            language="en", options={"variant_id": f"v{index % 32}"}, servings=2, follows_guests=False)
            for index in range(510)])
        scope = self.Scope(id=new_id(), workspace_id=self.owner.id, plan_id=self.plan.id,
            mode="all", selection=[], state=empty_state())
        scope.selection_digest = digest(scope)
        self.db.session.add(scope)
        self.db.session.commit()
        self.assertEqual(preflight(self.owner)["variant_resolutions"], 512)
        self.db.session.add(PrivatePlannedItem(workspace_id=self.owner.id, meal_id=meals[-1].id,
            position=10, kind="dish", entry_id="synthetic-variant-15", catalog_revision=1,
            language="en", options={"variant_id": "v30"}, servings=2, follows_guests=False))
        def no_catalog(_connection, _cursor, statement, _parameters, _context, _many):
            self.assertNotIn("planning_catalog_entries", statement)
        event.listen(self.db.engine, "before_cursor_execute", no_catalog)
        try:
            with patch("planning_shopping_projection.resolve_item", side_effect=AssertionError("No resolution before admission")):
                for call in (lambda: preflight(self.owner), lambda: project(self.owner, scope)):
                    with self.assertRaises(PlanningError) as caught:
                        call()
                    self.assertEqual(caught.exception.status, 422)
                    self.assertEqual(caught.exception.body["code"], "shopping_capacity_exceeded")
                    self.assertEqual(caught.exception.body["dimension"], "variant_resolutions")
                    self.assertEqual(caught.exception.body["used"], 513)
                    self.assertEqual(caught.exception.body["limit"], 512)
        finally:
            event.remove(self.db.engine, "before_cursor_execute", no_catalog)
        self.db.session.rollback()
        self.assertEqual(preflight(self.owner)["variant_resolutions"], 512)


def benchmark_distinct_variant_reconciliation():
    """Historical 8000-variant counterfactual; now rejected by the 512 cap.

    Kept for provenance of the 32s finding. Use --benchmark-admission for the
    currently admitted boundary; do not rerun this expensive historical baseline.
    """
    from sqlalchemy import event
    from helpers import make_tier
    app, db = make_app()
    with app.app_context():
        from planning_models import PlanningWorkspace, PrivatePlan, PrivateMeal, new_id
        from planning_item_models import PrivatePlannedItem
        from planning_shopping_models import PrivateShoppingScope, empty_state
        from planning_shopping import digest, preflight, reconcile
        from planning_shopping_projection import resolve_item as actual_resolve
        from planning_catalog import sync_catalog
        db.create_all()
        user = make_user(db, email="distinct-variant-benchmark@example.com")
        make_tier(db, "synthetic-distinct", "basic")
        title = "Synthetic distinct variant benchmark"
        content = {"schema_version": 2, "recipe": {"dish_slug": "synthetic-distinct", "level": "basic"},
            "variants": [{"id": f"v{index}", "base_servings": 1000, "languages": {"en": {
                "title": title, "ingredients": [{"ingredient_id": "i", "form": "f", "unit": "g",
                    "amount": "1.000", "label": title, "category": "cupboard", "purchase_mode": "measured"}],
                "method": ["Synthetic benchmark only."], "equipment": [], "time_min": 1}}} for index in range(32)]}
        sync_catalog([{"entry_id": f"synthetic-distinct-{index}", "revision": 1, "kind": "recipe",
            "availability": "published", "content": content} for index in range(250)])
        owner = PlanningWorkspace(user_id=user.id, revision=0)
        db.session.add(owner)
        db.session.flush()
        plan = PrivatePlan(workspace_id=owner.id, name=title, start_date=date(2026, 9, 1), end_date=date(2026, 9, 1))
        db.session.add(plan)
        db.session.flush()
        meals = [PrivateMeal(id=new_id(), workspace_id=owner.id, plan_id=plan.id,
            name=title, date=plan.start_date, position=index) for index in range(100)]
        db.session.add_all(meals)
        db.session.flush()
        db.session.add_all([PrivatePlannedItem(id=new_id(), workspace_id=owner.id, meal_id=meals[index // 80].id,
            position=index % 80, kind="dish", entry_id=f"synthetic-distinct-{index // 32}", catalog_revision=1,
            language="en", options={"variant_id": f"v{index % 32}"}, servings=index % 1000 + 1,
            follows_guests=False) for index in range(8000)])
        for half in range(2):
            scope = PrivateShoppingScope(id=new_id(), workspace_id=owner.id, plan_id=plan.id,
                mode="meals", selection=sorted("meal:" + m.id for m in meals[half * 50:(half + 1) * 50]), state=empty_state())
            scope.selection_digest = digest(scope)
            db.session.add(scope)
        db.session.commit()
        db.session.expunge_all()
        owner = PlanningWorkspace.query.one()
        budget = preflight(owner)
        assert budget["demand_allocations"] == 8000
        counts = {"selects": 0, "catalog_selects": 0, "resolutions": 0}
        resolution_seconds = 0.0
        def sql_count(_connection, _cursor, statement, _parameters, _context, _many):
            if statement.lstrip().upper().startswith("SELECT"):
                counts["selects"] += 1
                counts["catalog_selects"] += int("planning_catalog_entries" in statement)
        def resolve_count(item, workspace):
            nonlocal resolution_seconds
            counts["resolutions"] += 1
            started = time.perf_counter()
            try:
                return actual_resolve(item, workspace)
            finally:
                resolution_seconds += time.perf_counter() - started
        print("ONE counterfactual benchmark: 8000 distinct variants, 250 retained recipe revisions, two 4000-allocation scopes; all limits unchanged.", flush=True)
        event.listen(db.engine, "before_cursor_execute", sql_count)
        try:
            with patch("planning_shopping_projection.resolve_item", new=resolve_count):
                started = time.perf_counter()
                result = reconcile(owner)
                elapsed = time.perf_counter() - started
        finally:
            event.remove(db.engine, "before_cursor_execute", sql_count)
        print(json.dumps({**budget, **counts, "seconds": round(elapsed, 3),
            "authorized_resolution_seconds": round(resolution_seconds, 3),
            "other_seconds": round(elapsed - resolution_seconds, 3), "exceeds_15_seconds": elapsed > 15,
            "ack_bytes": len(app.json.dumps(result).encode()),
            "timing_boundary": "reconciliation including SQL, preflight and flush; excludes setup/outer commit/HTTP"}, sort_keys=True), flush=True)
        db.session.rollback()
        db.session.remove()


def benchmark_admitted_reconciliation():
    """ONE 512-variant/8000-demand/near-2MiB run, then cheap rejections."""
    from sqlalchemy import event
    from helpers import make_tier
    app, db = make_app()
    with app.app_context():
        from planning_models import PlanningWorkspace, PrivatePlan, PrivateMeal, new_id
        from planning_item_models import PrivatePlannedItem
        from planning_shopping_models import PrivateShoppingScope
        from planning_shopping import digest, reconcile, preflight, blank_row, MAX_WORKSPACE_STATE_BYTES
        from planning_shopping_projection import token, resolve_item as actual_resolve
        from planning_catalog import sync_catalog
        from routes.planning import PlanningError
        import planning_shopping
        db.create_all()
        user = make_user(db, email="admission-benchmark@example.com")
        make_tier(db, "synthetic-admission", "basic")
        title = "Synthetic admission benchmark ".ljust(160, "x")
        sync_catalog([{"entry_id": f"synthetic-admission-{entry_index}", "revision": 1, "kind": "recipe",
            "availability": "published", "content": {"schema_version": 2,
            "recipe": {"dish_slug": "synthetic-admission", "level": "basic"}, "variants": [
                {"id": f"v{index}", "base_servings": 1000, "languages": {"en": {
                    "title": title, "ingredients": [{"ingredient_id": "i", "form": "f", "unit": "g",
                        "amount": "1.000", "label": title, "category": "cupboard", "purchase_mode": "measured"}],
                    "method": ["Synthetic only"], "equipment": [], "time_min": 1}}} for index in range(32)]}}
                    for entry_index in range(17)])  # The 17th revision is initially unreferenced.
        owner = PlanningWorkspace(user_id=user.id, revision=0)
        db.session.add(owner)
        db.session.flush()
        plan = PrivatePlan(workspace_id=owner.id, name=title, start_date=date(2026, 9, 1), end_date=date(2026, 9, 1))
        db.session.add(plan)
        db.session.flush()
        meals = [PrivateMeal(id=new_id(), workspace_id=owner.id, plan_id=plan.id,
            name=title, date=plan.start_date, position=index) for index in range(100)]
        db.session.add_all(meals)
        db.session.flush()
        items = [PrivatePlannedItem(id=new_id(), workspace_id=owner.id, meal_id=meals[index // 8].id,
            position=index % 8, kind="dish", entry_id=f"synthetic-admission-{(index % 512) // 32}", catalog_revision=1,
            language="en", options={"variant_id": f"v{index % 32}"}, servings=index + 1,
            follows_guests=False) for index in range(800)]
        db.session.add_all(items)
        scopes = []
        serializer = db.engine.dialect._json_serializer or json.dumps
        for index in range(100):
            chosen = [(index + offset) % 100 for offset in range(10)]
            state = {"rows": {token("i", "f", "g"): {"extra": "0.000",
                "extra_coverage": {"amount": "0.000", "state": "needed", "review": False},
                "sources": {token(items[i * 8 + position].id, "i", "f", "g"):
                    {"amount": "0.001", "state": "bought", "review": False} for i in chosen for position in range(8)}}},
                "personal": [], "unavailable": False}
            # Retained orphan extras consume bytes but never invent live demand.
            for orphan_index in range(100):
                key = token(f"orphan-{orphan_index}", "raw", "g")
                orphan = blank_row()
                orphan["extra"] = "1.000"
                state["rows"][key] = orphan
                if len(serializer(state).encode()) > MAX_WORKSPACE_STATE_BYTES // 100:
                    del state["rows"][key]
                    break
            scope = PrivateShoppingScope(id=new_id(), workspace_id=owner.id, plan_id=plan.id,
                mode="meals", selection=sorted("meal:" + meals[i].id for i in chosen), state=state)
            scope.selection_digest = digest(scope)
            scopes.append(scope)
        db.session.add_all(scopes)
        db.session.commit()
        db.session.expunge_all()
        owner = PlanningWorkspace.query.one()
        counts = {"selects": 0, "catalog_selects": 0, "sql_statements": 0, "resolutions": 0}
        sample = []
        actual_build = planning_shopping.build
        def sql_count(_connection, _cursor, statement, _parameters, _context, _many):
            counts["sql_statements"] += 1
            if statement.lstrip().upper().startswith("SELECT"):
                counts["selects"] += 1
                counts["catalog_selects"] += int("planning_catalog_entries" in statement)
        def resolve_count(item, workspace):
            counts["resolutions"] += 1
            return actual_resolve(item, workspace)
        def observe_build(*args, **kwargs):
            result = actual_build(*args, **kwargs)
            assert sum(len(row["sources"]) for row in result[0]["rows"]) == 80
            if not sample:
                sample.append(result[0])
            return result
        print("ONE admitted benchmark: 100 overlapping scopes x 80 allocations; 512 variants, 800 serving configurations; near 2MiB saved state.", flush=True)
        event.listen(db.engine, "before_cursor_execute", sql_count)
        try:
            with patch("planning_shopping_projection.resolve_item", new=resolve_count), patch("planning_shopping.build", new=observe_build):
                started = time.perf_counter()
                result = reconcile(owner)
                elapsed = time.perf_counter() - started
        finally:
            event.remove(db.engine, "before_cursor_execute", sql_count)
        accepted = {"seconds": round(elapsed, 3), **counts, **preflight(owner),
            "projection_response_bytes": len(app.json.dumps(sample[0]).encode()),
            "ack_bytes": len(app.json.dumps(result).encode()), "exceeds_15_seconds": elapsed > 15}
        assert accepted["demand_allocations"] == 8000 and accepted["resolutions"] == accepted["variant_resolutions"] == 512
        assert 0.98 * MAX_WORKSPACE_STATE_BYTES <= accepted["state_bytes"] <= MAX_WORKSPACE_STATE_BYTES
        db.session.commit()
        rejections = {}
        for dimension in ("variant_resolutions", "demand_allocations", "state_bytes"):
            for key in counts:
                counts[key] = 0
            if dimension == "variant_resolutions":
                # Each variant in revision0 has a second occurrence. Replacing
                # one reference therefore adds a 513th key without adding demand.
                item = PrivatePlannedItem.query.filter_by(workspace_id=owner.id, entry_id="synthetic-admission-0").first()
                item.entry_id = "synthetic-admission-16"
            elif dimension == "demand_allocations":
                meal = PrivateMeal.query.filter_by(workspace_id=owner.id).first()
                db.session.add(PrivatePlannedItem(workspace_id=owner.id, meal_id=meal.id, position=8,
                    kind="personal", title="Synthetic over-budget demand", follows_guests=False))
            else:
                scope = PrivateShoppingScope.query.filter_by(workspace_id=owner.id).first()
                state = copy.deepcopy(scope.state)
                for index in range(200):
                    state["rows"][token(f"over-budget-{index}", "raw", "g")] = {**blank_row(), "extra": "1.000"}
                scope.state = state
            event.listen(db.engine, "before_cursor_execute", sql_count)
            try:
                with patch("planning_shopping_projection.resolve_item", side_effect=AssertionError("Rejected before resolution")):
                    started = time.perf_counter()
                    try:
                        preflight(owner)
                    except PlanningError as error:
                        rejection = dict(error.body)
                        assert error.status == 422 and rejection["dimension"] == dimension
                    else:
                        raise AssertionError("Expected capacity rejection")
                    rejection["seconds"] = round(time.perf_counter() - started, 3)
                    rejection.update(counts)
                    rejections[dimension] = rejection
            finally:
                event.remove(db.engine, "before_cursor_execute", sql_count)
                db.session.rollback()
        print(json.dumps({"accepted": accepted, "rejected": rejections,
            "timing_boundary": "reconcile includes admission, SQL reads/state JSON, live authorization, sticky review and flush; excludes outer commit, HTTP/network and setup"}, sort_keys=True), flush=True)
        db.session.remove()


def benchmark_worst_case_reconciliation():
    """Historical pre-admission benchmark; not an accepted current fixture.

    Retained for provenance of the 95s/74s measurements. Aggregate admission now
    rejects this fixture; use --benchmark-admission for the accepted boundary.
    Do not run another 400000-allocation campaign as part of normal verification.
    """
    from sqlalchemy import event
    from sqlalchemy.orm import Session
    from collections import defaultdict
    from helpers import make_tier
    app, db = make_app()
    with app.app_context():
        from planning_models import PlanningWorkspace, PrivatePlan, PrivateMeal, new_id
        from planning_item_models import PrivatePlannedItem
        from planning_shopping_models import PrivateShoppingScope
        from planning_shopping import (digest, check_record, reconcile, canonical,
                                       MAX_SCOPE_BYTES, MAX_SCOPES)
        from planning_shopping_projection import token, resolve_item as actual_resolve
        from planning_catalog import sync_catalog
        import planning_shopping
        import planning_shopping_projection
        from planning_items import MAX_ITEMS, MAX_PARENT_ITEMS
        db.create_all()
        user = make_user(db, email="worst-case-shopping@example.com")
        make_tier(db, "synthetic-benchmark", "basic")
        title = "Synthetic benchmark fixture ".ljust(160, "x")
        variants = [{"id": f"v{index}", "base_servings": 1000, "languages": {"en": {
            "title": title, "ingredients": [{"ingredient_id": "i", "form": "f", "unit": "g",
                "amount": "1.000", "label": title, "category": "cupboard", "purchase_mode": "measured"}],
            "method": ["Synthetic benchmark only."], "equipment": [], "time_min": 1}}}
            for index in range(10)]
        sync_catalog([{"entry_id": "synthetic-benchmark", "revision": 1, "kind": "recipe",
            "availability": "published", "content": {"schema_version": 2,
            "recipe": {"dish_slug": "synthetic-benchmark", "level": "basic"}, "variants": variants}}])
        owner = PlanningWorkspace(user_id=user.id, revision=0)
        db.session.add(owner)
        db.session.flush()
        plan = PrivatePlan(workspace_id=owner.id, name=title,
                           start_date=date(2026, 9, 1), end_date=date(2026, 9, 1))
        db.session.add(plan)
        db.session.flush()
        meals = [PrivateMeal(id=new_id(), workspace_id=owner.id, plan_id=plan.id,
            date=plan.start_date, name=title, position=index) for index in range(100)]
        db.session.add_all(meals)
        db.session.flush()
        items_by_meal = []
        for index, meal in enumerate(meals):
            items = [PrivatePlannedItem(id=new_id(), workspace_id=owner.id, meal_id=meal.id,
                position=position, kind="dish", entry_id="synthetic-benchmark", catalog_revision=1,
                language="en", options={"variant_id": f"v{(index * 100 + position) // 1000}"},
                servings=(index * 100 + position) % 1000 + 1, follows_guests=False)
                for position in range(100)]
            items_by_meal.append(items)
            db.session.add_all(items)
        db.session.flush()
        scopes = []
        row_key = token("i", "f", "g")
        for index in range(100):
            selected = [(index + offset) % 100 for offset in range(40)]
            sources = {token(item.id, "i", "f", "g"):
                {"amount": "0.001", "state": "bought", "review": False}
                for meal_index in selected for item in items_by_meal[meal_index]}
            assert len(sources) == 4000
            scope = PrivateShoppingScope(id=new_id(), workspace_id=owner.id, plan_id=plan.id,
                mode="meals", selection=sorted("meal:" + meals[i].id for i in selected),
                state={"rows": {row_key: {"extra": "0.000",
                    "extra_coverage": {"amount": "0.000", "state": "needed", "review": False},
                    "sources": sources}}, "personal": [], "unavailable": False})
            scope.selection_digest = digest(scope)
            check_record(scope)
            scopes.append(scope)
        assert len(scopes) == MAX_SCOPES == 100
        assert sum(map(len, items_by_meal)) == MAX_ITEMS == 10000
        assert max(map(len, items_by_meal)) == MAX_PARENT_ITEMS == 100
        db.session.add_all(scopes)
        db.session.commit()
        # Evict setup objects so loading/decoding persisted scope state is timed.
        db.session.expunge_all()
        owner = PlanningWorkspace.query.one()
        counts = {"selects": 0, "catalog_selects": 0, "sql_statements": 0, "resolutions": 0,
                  "projections": 0, "allocations": 0}
        projection_sample = []
        real_build = planning_shopping.build
        stage_seconds, stage_stack = defaultdict(float), []

        def timed_stage(name, function):
            # Exclusive stage totals avoid double-counting nested validation,
            # resolution, SQL-triggered flushes and projection work.
            def timed(*args, **kwargs):
                frame = [time.perf_counter(), 0.0]
                stage_stack.append(frame)
                try:
                    return function(*args, **kwargs)
                finally:
                    duration = time.perf_counter() - frame[0]
                    stage_stack.pop()
                    stage_seconds[name] += duration - frame[1]
                    if stage_stack:
                        stage_stack[-1][1] += duration
            return timed

        timed_build = timed_stage("projection_assembly", real_build)
        timed_selection = timed_stage("source_selection", planning_shopping.selection_items)

        def sql_count(_connection, _cursor, statement, _parameters, _context, _many):
            counts["sql_statements"] += 1
            if statement.lstrip().upper().startswith("SELECT"):
                counts["selects"] += 1
                counts["catalog_selects"] += int("planning_catalog_entries" in statement)

        def resolve_count(item, workspace):
            counts["resolutions"] += 1
            return actual_resolve(item, workspace)

        def observe_build(*args, **kwargs):
            result = timed_build(*args, **kwargs)
            projection = result[0]
            allocations = sum(len(row["sources"]) for row in projection["rows"])
            assert allocations == 4000
            counts["projections"] += 1
            counts["allocations"] += allocations
            if not projection_sample:
                projection_sample.append(projection)
            return result

        print("Worst-case fixture valid: 100 scopes x 4000 saved allocations; "
              "10000 distinct configurations; 100 items/meal. Starting ONE reconciliation.", flush=True)
        event.listen(db.engine, "before_cursor_execute", sql_count)
        try:
            with patch("planning_shopping_projection.resolve_item", new=resolve_count), \
                    patch("planning_shopping.build", new=observe_build), \
                    patch("planning_shopping.check_record", new=timed_stage("record_validation", planning_shopping.check_record)), \
                    patch("planning_shopping.check_state", new=timed_stage("state_validation", planning_shopping.check_state)), \
                    patch("planning_shopping.selection_items", new=timed_selection), \
                    patch("planning_shopping_projection.selection_items", new=timed_selection), \
                    patch.object(planning_shopping_projection._ResolutionMemo, "resolve",
                        new=timed_stage("resolution_and_scaling", planning_shopping_projection._ResolutionMemo.resolve)), \
                    patch("planning_shopping.reconcile_scope", new=timed_stage("reconciliation_updates", planning_shopping.reconcile_scope)), \
                    patch.object(Session, "flush", new=timed_stage("flush", Session.flush)):
                started = time.perf_counter()
                result = reconcile(owner)
                elapsed = time.perf_counter() - started
        finally:
            event.remove(db.engine, "before_cursor_execute", sql_count)
        assert counts["projections"] == 100 and counts["allocations"] == 400000
        assert counts["resolutions"] == 10  # Ten authorized variants, 1000 serving values each.
        assert not result["unavailable_scope_ids"] and not result["removed_scope_ids"]
        stored = PrivateShoppingScope.query.filter_by(workspace_id=owner.id).all()
        state_bytes = [len(canonical(scope.state).encode()) for scope in stored]
        snapshot_bytes = [len(canonical(scope.to_dict()).encode()) for scope in stored]
        assert max(snapshot_bytes) <= MAX_SCOPE_BYTES
        reviewed = sum(basis["review"] for scope in stored for row in scope.state["rows"].values()
                       for basis in row["sources"].values())
        assert reviewed == 399600  # 10 one-serving items, each occurs in 40 scopes.
        response_bytes = len(app.json.dumps(projection_sample[0]).encode("utf-8"))
        print(json.dumps({"reconciliation_seconds": round(elapsed, 3), **counts,
            "exclusive_stage_seconds": {**{name: round(value, 3) for name, value in stage_seconds.items()},
                "other": round(elapsed - sum(stage_seconds.values()), 3)},
            "sticky_review_allocations": reviewed,
            "representative_projection_response_bytes": response_bytes,
            "reconcile_ack_bytes": len(app.json.dumps(result).encode("utf-8")),
            "state_bytes_per_scope_min": min(state_bytes), "state_bytes_per_scope_max": max(state_bytes),
            "state_bytes_total": sum(state_bytes), "snapshot_bytes_per_scope_max": max(snapshot_bytes),
            "client_timeout_seconds": 15, "exceeds_client_timeout": elapsed > 15,
            "timing_boundary": "reconcile only, including SQL reads/JSON decoding/state updates/flush; excludes setup, outer commit, HTTP serialization/network"},
            sort_keys=True), flush=True)
        db.session.rollback()
        db.session.remove()


if __name__ == "__main__":
    if sys.argv[1:] == ["--benchmark-distinct-variants"]:
        benchmark_distinct_variant_reconciliation()
    elif sys.argv[1:] == ["--benchmark-admission"]:
        benchmark_admitted_reconciliation()
    elif sys.argv[1:] == ["--benchmark-worst-case"]:
        benchmark_worst_case_reconciliation()
    else:
        unittest.main()
