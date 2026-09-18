"""Service/model tests on fresh in-memory SQLite only, no inherited DB or dotenv.

Route receipts, PostgreSQL concurrency/migration and reviewed deletion integration
belong to main; these tests do not claim those gates are covered.
"""
from copy import deepcopy
from datetime import date
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from flask import Flask
from sqlalchemy import event, select
from sqlalchemy.exc import IntegrityError

_allowed = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"}
_environment = {key: value for key, value in os.environ.items() if key.upper() in _allowed}
_environment.update(DATABASE_URL="sqlite:///:memory:", FLASK_ENV="development", FLASK_SKIP_DOTENV="1",
                    JWT_SECRET_KEY="synthetic-template-import-key-at-least-32-characters")
with patch.dict(os.environ, _environment, clear=True), patch("dotenv.load_dotenv", return_value=False):
    from app import db
    from models import Dish, RecipeTier, User
    from planning_models import PlanningWorkspace, PrivatePlan, PrivateMeal, PrivateEvent
    from planning_item_models import PrivatePlannedItem
    from planning_template_models import PrivatePlanningTemplate
    import planning_catalog as catalog
    import planning_items
    import planning_templates as templates
    from routes.planning import PlanningError


class PlanningTemplatesTest(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
                               SQLALCHEMY_TRACK_MODIFICATIONS=False)
        db.init_app(self.app)
        self.context = self.app.app_context()
        self.context.push()
        db.session.execute(db.text("PRAGMA foreign_keys=ON"))
        db.create_all()
        self.user = User(email="templates@example.invalid", password_hash="synthetic", plan="premium")
        other = User(email="foreign@example.invalid", password_hash="synthetic", plan="premium")
        db.session.add_all([self.user, other])
        db.session.flush()
        self.owner = PlanningWorkspace(user_id=self.user.id, revision=0)
        self.other = PlanningWorkspace(user_id=other.id, revision=0)
        db.session.add_all([self.owner, self.other])
        db.session.flush()
        self.plan = PrivatePlan(workspace_id=self.owner.id, name="Synthetic week",
                                start_date=date(2026, 9, 13), end_date=date(2026, 9, 19))
        db.session.add(self.plan)
        db.session.flush()
        self.meal = PrivateMeal(workspace_id=self.owner.id, plan_id=self.plan.id,
                                date=date(2026, 9, 13), position=0)
        self.destination = PrivateMeal(workspace_id=self.owner.id, plan_id=self.plan.id,
                                       date=date(2026, 9, 14), position=0)
        self.source_event = PrivateEvent(workspace_id=self.owner.id, name="Source", date=date(2026, 9, 13), guests=6)
        self.target_event = PrivateEvent(workspace_id=self.owner.id, name="Target", date=date(2026, 9, 14), guests=9)
        self.foreign_event = PrivateEvent(workspace_id=self.other.id, name="Foreign", date=date(2026, 9, 14), guests=2)
        db.session.add_all([self.meal, self.destination, self.source_event, self.target_event, self.foreign_event])
        dish = Dish(slug="synthetic-template-dish")
        db.session.add(dish)
        db.session.flush()
        db.session.add(RecipeTier(dish_id=dish.id, level="advanced", lang="en", title="Synthetic live recipe"))
        db.session.flush()
        for entry, amount in (("synthetic-template", "10.000"), ("synthetic-overflow", "1000000.000")):
            catalog.sync_catalog([{"entry_id": entry, "revision": 1, "kind": "recipe", "availability": "published",
                "content": {"schema_version": 1, "recipe": {"dish_slug": dish.slug, "level": "advanced"},
                "variants": [{"id": "plain", "base_servings": 6, "languages": {"en": {
                    "title": "Synthetic catalog prose NEVER saved", "ingredients": [
                        {"ingredient_id": "synthetic-food", "form": "dry", "unit": "g", "amount": amount}],
                    "method": ["Synthetic method NEVER saved"], "equipment": [], "time_min": 1}}}]}}])
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.engine.dispose()
        self.context.pop()

    def item(self, parent=None, **fields):
        parent = parent or self.meal
        parent_type = "event" if isinstance(parent, PrivateEvent) else "meal"
        payload = {"parent_type": parent_type, "parent_id": parent.id, "kind": "personal", "title": "Bread", **fields}
        if payload["kind"] == "dish":
            payload.pop("title")
            payload = {"entry_id": "synthetic-template", "catalog_revision": 1, "language": "en",
                       "options": {"variant_id": "plain"}, **payload}
        result, _ = planning_items.apply(self.owner, "item.create", payload)
        db.session.commit()
        return db.session.get(PrivatePlannedItem, result["item"]["id"])

    def save(self, parent=None):
        parent = parent or self.meal
        result, status = templates.apply(self.owner, "template.save", {
            "parent_type": "event" if isinstance(parent, PrivateEvent) else "meal",
            "parent_id": parent.id, "name": "  Crème 豆腐  "})
        self.assertEqual(status, 201)
        self.assertEqual(set(result), {"template_id"})
        db.session.commit()
        return db.session.get(PrivatePlanningTemplate, result["template_id"])

    def apply_payload(self, template, parent=None):
        parent = parent or self.destination
        return {"template_id": template.id, "parent_type": "event" if isinstance(parent, PrivateEvent) else "meal",
                "parent_id": parent.id}

    def snapshot(self):
        return {table.name: list(db.session.execute(select(table)).mappings())
                for table in db.metadata.sorted_tables}

    def rejected(self, operation, payload, error=PlanningError):
        before = self.snapshot()
        with self.assertRaises(error) as caught:
            templates.apply(self.owner, operation, payload)
        self.assertFalse(db.session.new)
        self.assertFalse(db.session.deleted)
        self.assertFalse(db.session.dirty)
        self.assertEqual(self.snapshot(), before)
        return caught.exception

    def test_save_shape_independence_and_export_has_no_catalog_prose(self):
        source = self.item(kind="dish", servings=3, group="Main", contribution="Alex")
        personal = self.item(quantity="1.125", unit="loaf", group="Side")
        self.item(kind="note", title="Bring plates")
        template = self.save()
        exported = template.to_dict()
        self.assertEqual(exported["name"], "Crème 豆腐")
        self.assertNotIn("workspace_id", exported)
        self.assertEqual(set(exported), {"id", "name", "kind", "blueprint", "created_at"})
        serialized = json.dumps(exported["blueprint"])
        for forbidden in (source.id, personal.id, "NEVER", "ingredients", "meal_id", "position", "tasks", "coverage"):
            self.assertNotIn(forbidden, serialized)
        self.assertEqual(exported["blueprint"]["items"][0]["contribution"], "Alex")
        self.assertEqual(exported["blueprint"]["items"][1]["quantity"], "1.125")
        exported["blueprint"]["items"][0]["options"]["variant_id"] = "not-shared"
        source.options = {"variant_id": "changed"}
        personal.title = "Different bread"
        db.session.commit()
        self.assertEqual(template.blueprint["items"][0]["options"], {"variant_id": "plain"})
        self.assertEqual(template.blueprint["items"][1]["title"], "Bread")
        self.assertEqual(templates.get_template(self.owner, template.id), template.to_dict())

    def test_menu_application_guest_followers_overrides_fresh_ids_and_append(self):
        follower = self.item(self.source_event, kind="dish", group="Main", contribution="Alex")
        override = self.item(self.source_event, kind="dish", servings=3)
        self.item(self.source_event, kind="note", title="Bring plates")
        existing = self.item(self.target_event, quantity="2", unit="loaf")
        template = self.save(self.source_event)
        before = deepcopy(template.blueprint)
        result, status = templates.apply(self.owner, "template.apply", self.apply_payload(template, self.target_event))
        self.assertEqual(status, 201)
        self.assertEqual(set(result), {"template_id", "created_item_ids"})
        self.assertEqual(len(result["created_item_ids"]), 3)
        self.assertFalse(set(result["created_item_ids"]) & {follower.id, override.id, existing.id})
        rows = [db.session.get(PrivatePlannedItem, identity) for identity in result["created_item_ids"]]
        self.assertEqual([row.position for row in rows], [1, 2, 3])
        self.assertEqual([int(row.servings) for row in rows[:2]], [9, 3])
        self.assertEqual([row.follows_guests for row in rows], [True, False, False])
        self.assertEqual(rows[0].contribution, "Alex")
        rows[0].options["variant_id"] = "independent"
        self.assertEqual(template.blueprint, before)
        self.assertEqual(follower.options, {"variant_id": "plain"})
        # No commit here: caller rollback removes every appended item.
        db.session.rollback()
        self.assertEqual(PrivatePlannedItem.query.filter_by(event_id=self.target_event.id).count(), 1)

    def test_meal_apply_and_reapply_have_independent_ids(self):
        source = self.item(quantity="0.125", unit="kg")
        template = self.save()
        first, _ = templates.apply(self.owner, "template.apply", self.apply_payload(template))
        second, _ = templates.apply(self.owner, "template.apply", self.apply_payload(template))
        self.assertFalse(set(first["created_item_ids"]) & set(second["created_item_ids"]))
        row = db.session.get(PrivatePlannedItem, first["created_item_ids"][0])
        self.assertNotEqual(row.id, source.id)
        self.assertEqual(str(row.quantity), "0.125")
        self.assertFalse(row.follows_guests)
        self.assertEqual(row.meal_id, self.destination.id)

    def test_empty_templates_and_parent_kind_restrictions(self):
        meal, menu = self.save(), self.save(self.source_event)
        result, _ = templates.apply(self.owner, "template.apply", self.apply_payload(meal))
        self.assertEqual(result["created_item_ids"], [])
        self.rejected("template.apply", self.apply_payload(meal, self.target_event))
        self.rejected("template.apply", self.apply_payload(menu))

    def test_foreign_and_missing_ids_are_not_found_without_writes(self):
        template = self.save()
        for identity in (self.foreign_event.id, str(uuid4())):
            error = self.rejected("template.save", {"parent_type": "event", "parent_id": identity, "name": "No"})
            self.assertEqual(error.status, 404)
        self.rejected("template.apply", self.apply_payload(self.save(self.source_event), self.foreign_event))
        foreign = PrivatePlanningTemplate(workspace_id=self.other.id, name="Foreign", kind="meal",
                                          blueprint={"schema_version": 1, "items": []})
        db.session.add(foreign)
        db.session.commit()
        for identity in (foreign.id, str(uuid4())):
            for operation, extra in (("template.rename", {"name": "No"}), ("template.delete", {}),
                                     ("template.apply", {"parent_type": "meal", "parent_id": self.destination.id})):
                self.assertEqual(self.rejected(operation, {"template_id": identity, **extra}).status, 404)
            with self.assertRaises(PlanningError):
                templates.get_template(self.owner, identity)
        self.assertEqual(template.name, "Crème 豆腐")

    def test_strict_command_validation(self):
        valid = {"parent_type": "meal", "parent_id": self.meal.id, "name": "Valid"}
        for field, value in (("parent_type", []), ("parent_type", "menu"), ("parent_id", True),
                             ("parent_id", "not-uuid"), ("name", True), ("name", ""),
                             ("name", "x" * 161), ("name", "bad\x00"), ("name", "\ud800")):
            with self.subTest(field=field, value=repr(value)):
                self.rejected("template.save", {**valid, field: value})
        for payload in (None, [], {}, {**valid, "blueprint": {}}, {**valid, "workspace_id": self.other.id}):
            self.rejected("template.save", payload)
        for operation in ([], None, "template.create", "item.create"):
            self.rejected(operation, valid)
        for operation, payload in (("template.rename", {"template_id": self.meal.id}),
                                   ("template.delete", {"template_id": self.meal.id, "name": "No"}),
                                   ("template.apply", {"template_id": self.meal.id, "parent_type": "meal"})):
            self.rejected(operation, payload)

    def test_every_dependency_checked_before_first_write_on_save_and_apply(self):
        self.item(self.source_event, kind="dish")
        self.item(self.source_event, kind="dish", entry_id="synthetic-overflow")
        template = self.save(self.source_event)
        # Destination overflow occurs in the second dish, after the first resolves.
        error = self.rejected("template.apply", self.apply_payload(template, self.target_event), catalog.CatalogError)
        self.assertEqual(error.body["reason"], "quantity_out_of_range")
        catalog.set_availability("synthetic-overflow", 1, "revoked")
        db.session.commit()
        error = self.rejected("template.save", {"parent_type": "event", "parent_id": self.source_event.id,
                                               "name": "Blocked"}, catalog.CatalogError)
        self.assertEqual(error.body["reason"], "revoked")
        self.assertEqual(PrivatePlanningTemplate.query.count(), 1)

    def test_current_eligibility_read_and_all_mutations_fail_closed(self):
        self.item(kind="dish")
        template = self.save()
        self.user.plan = "free"
        db.session.commit()
        with self.assertRaises(catalog.CatalogError) as caught:
            templates.get_template(self.owner, template.id)
        self.assertEqual(caught.exception.body["reason"], "recipe_inaccessible")
        for operation, payload in (("template.apply", self.apply_payload(template)),
                                   ("template.save", {"parent_type": "meal", "parent_id": self.meal.id, "name": "No"}),
                                   ("template.rename", {"template_id": template.id, "name": "No"}),
                                   ("template.delete", {"template_id": template.id})):
            self.rejected(operation, payload, catalog.CatalogError)
        # Private export still preserves the owner's configuration without prose.
        self.assertEqual(len(template.to_dict()["blueprint"]["items"]), 1)

    def test_restore_access_helper_checks_detached_blueprint_without_writes(self):
        self.item(self.source_event, kind="dish")
        self.item(self.source_event, kind="dish", servings=3)
        template = self.save(self.source_event)
        captured = template.to_dict()
        templates.apply(self.owner, "template.delete", {"template_id": template.id})
        db.session.commit()
        before = self.snapshot()
        original = deepcopy(captured)
        with patch("sqlalchemy.orm.Session.flush", side_effect=AssertionError("Validator must not flush")), \
                patch.object(db.session, "commit", side_effect=AssertionError("Validator must not commit")):
            self.assertIsNone(templates.validate_template_access(self.owner, captured["blueprint"], captured["kind"]))
        self.assertEqual(captured, original)
        self.assertFalse(db.session.new)
        self.assertFalse(db.session.dirty)
        self.assertEqual(self.snapshot(), before)

    def test_restore_access_helper_rejects_revoked_or_invalid_blueprint_before_restore(self):
        self.item(kind="dish")
        template = self.save()
        captured = template.to_dict()
        templates.apply(self.owner, "template.delete", {"template_id": template.id})
        catalog.set_availability("synthetic-template", 1, "revoked")
        db.session.commit()
        before = self.snapshot()
        original = deepcopy(captured)
        with self.assertRaises(catalog.CatalogError) as caught:
            templates.validate_template_access(self.owner, captured["blueprint"], captured["kind"])
        self.assertEqual(caught.exception.body["reason"], "revoked")
        self.assertEqual(captured, original)
        with self.assertRaises(PlanningError):
            templates.validate_template_access(self.owner, {**captured["blueprint"], "prose": "No"}, captured["kind"])
        self.assertFalse(db.session.new)
        self.assertFalse(db.session.dirty)
        self.assertEqual(PrivatePlanningTemplate.query.count(), 0)
        self.assertEqual(self.snapshot(), before)

    def test_rename_delete_and_caller_rollback_leave_source_and_applied_items_independent(self):
        self.item(quantity="1", unit="loaf")
        template = self.save()
        applied, _ = templates.apply(self.owner, "template.apply", self.apply_payload(template))
        db.session.commit()
        before = self.snapshot()
        with patch.object(db.session, "commit", side_effect=AssertionError("Service must not commit")):
            templates.apply(self.owner, "template.rename", {"template_id": template.id, "name": " New "})
            self.assertEqual(template.name, "New")
            templates.apply(self.owner, "template.delete", {"template_id": template.id})
        db.session.rollback()
        self.assertEqual(self.snapshot(), before)
        templates.apply(self.owner, "template.delete", {"template_id": template.id})
        db.session.commit()
        self.assertEqual(PrivatePlanningTemplate.query.count(), 0)
        self.assertIsNotNone(db.session.get(PrivatePlannedItem, applied["created_item_ids"][0]))
        self.assertEqual(PrivatePlannedItem.query.count(), 2)

    def test_caps_parent_workspace_template_count_and_position(self):
        self.item()
        self.item(kind="note", title="Keep")
        template = self.save()
        with patch.object(templates, "MAX_TEMPLATES", 1):
            self.assertEqual(self.rejected("template.save", {"parent_type": "meal", "parent_id": self.meal.id,
                                                            "name": "No"}).body["code"], "limit_reached")
        with patch.object(planning_items, "MAX_PARENT_ITEMS", 1):
            self.rejected("template.apply", self.apply_payload(template))
        with patch.object(planning_items, "MAX_ITEMS", 3):
            self.rejected("template.apply", self.apply_payload(template))
        with patch.object(templates, "MAX_BLUEPRINT_ITEMS", 1):
            self.rejected("template.save", {"parent_type": "meal", "parent_id": self.meal.id, "name": "No"})
        existing = self.item(self.destination)
        existing.position = templates.MAX_POSITION
        db.session.commit()
        self.rejected("template.apply", self.apply_payload(template))

    def test_blueprint_actual_count_and_utf8_byte_bounds_and_closed_shape(self):
        note = {"kind": "note", "title": "x", "group": None, "contribution": None}
        blueprint = {"schema_version": 1, "items": [deepcopy(note) for _ in range(100)]}
        templates.validate_blueprint(blueprint, "meal")
        blueprint["items"].append(deepcopy(note))
        with self.assertRaises(PlanningError):
            templates.validate_blueprint(blueprint, "meal")
        blueprint["items"] = [{**note, "title": "豆" * 160, "group": "豆" * 160,
                                "contribution": "豆" * 160} for _ in range(100)]
        with self.assertRaises(PlanningError):
            templates.validate_blueprint(blueprint, "meal")
        small = {"schema_version": 1, "items": [note]}
        encoded_size = len(json.dumps(small, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
        with patch.object(templates, "MAX_BLUEPRINT_BYTES", encoded_size):
            templates.validate_blueprint(small, "meal")
        with patch.object(templates, "MAX_BLUEPRINT_BYTES", encoded_size - 1):
            with self.assertRaises(PlanningError):
                templates.validate_blueprint(small, "meal")
        for invalid in ({"schema_version": True, "items": []}, {"schema_version": 2, "items": []},
                        {"schema_version": 1, "items": [{**note, "id": str(uuid4())}]},
                        {"schema_version": 1, "items": [{**note, "ingredients": []}]},
                        {"schema_version": 1, "items": [{**note, "title": "\ud800"}]}):
            with self.assertRaises(PlanningError):
                templates.validate_blueprint(invalid, "meal")

    def test_actual_hundred_template_limit_and_save_rollback(self):
        payload = {"parent_type": "meal", "parent_id": self.meal.id, "name": "Empty template"}
        before = self.snapshot()
        with patch.object(db.session, "commit", side_effect=AssertionError("Service must not commit")):
            templates.apply(self.owner, "template.save", payload)
        db.session.rollback()
        self.assertEqual(self.snapshot(), before)
        for _ in range(100):
            templates.apply(self.owner, "template.save", payload)
        db.session.commit()
        self.assertEqual(PrivatePlanningTemplate.query.count(), 100)
        self.rejected("template.save", payload)

    def test_blueprint_dish_and_personal_types_are_not_coerced(self):
        self.item(kind="dish")
        self.item(quantity="1", unit="loaf")
        blueprint = self.save().blueprint
        changes = [(0, "servings", value) for value in (True, "2", 2.5, 0, 1001)]
        changes += [(0, "follows_guests", value) for value in (1, None, True)]
        changes += [(0, "options", {"variant_id": "plain", "method": "No"}),
                    (0, "catalog_revision", True), (1, "quantity", "1e0"),
                    (1, "quantity", 1), (1, "quantity", "1.0000"),
                    (1, "quantity", None), (1, "unit", None), (1, "unit", "guessed")]
        for index, field, value in changes:
            with self.subTest(index=index, field=field, value=value):
                invalid = deepcopy(blueprint)
                invalid["items"][index][field] = value
                with self.assertRaises((PlanningError, catalog.CatalogError)):
                    templates.validate_blueprint(invalid, "meal")

    def test_deleted_recipe_dependency_blocks_read_save_and_apply(self):
        self.item(kind="dish")
        template = self.save()
        RecipeTier.query.delete(synchronize_session=False)
        db.session.commit()
        with self.assertRaises(catalog.CatalogError) as caught:
            templates.get_template(self.owner, template.id)
        self.assertEqual(caught.exception.body["reason"], "recipe_missing")
        self.rejected("template.apply", self.apply_payload(template), catalog.CatalogError)
        self.rejected("template.save", {"parent_type": "meal", "parent_id": self.meal.id, "name": "No"},
                      catalog.CatalogError)

    def test_invalid_blueprint_model_writes_and_foreign_workspace_fk(self):
        db.session.add(PrivatePlanningTemplate(workspace_id=self.owner.id, name="Bad", kind="meal",
                                              blueprint={"schema_version": 1, "items": [], "prose": "No"}))
        with self.assertRaises(PlanningError):
            db.session.flush()
        db.session.rollback()
        db.session.add(PrivatePlanningTemplate(workspace_id=str(uuid4()), name="Missing", kind="meal",
                                              blueprint={"schema_version": 1, "items": []}))
        with self.assertRaises(IntegrityError):
            db.session.flush()
        db.session.rollback()
        self.assertEqual(PrivatePlanningTemplate.query.count(), 0)

    def test_injected_post_insert_failure_is_rolled_back_by_caller(self):
        self.item()
        self.item(kind="note", title="Second")
        template = self.save()
        before = self.snapshot()
        def fail_after_insert(_mapper, _connection, _target):
            raise RuntimeError("Synthetic storage failure")
        event.listen(PrivatePlannedItem, "after_insert", fail_after_insert)
        try:
            with self.assertRaisesRegex(RuntimeError, "Synthetic storage failure"):
                templates.apply(self.owner, "template.apply", self.apply_payload(template))
        finally:
            event.remove(PrivatePlannedItem, "after_insert", fail_after_insert)
            db.session.rollback()
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
