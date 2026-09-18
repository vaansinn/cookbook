"""Catalog infrastructure tests: synthetic authorship and in-memory SQLite only.

No dotenv, existing database, external service, or culinary content is used.
Main owns shared application/model/route integration.
"""
import copy
from decimal import Decimal, localcontext
import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token
from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.schema import CreateTable

# app.py constructs a module-level app on import. Isolate that import as well as
# each test app; never inherit a database URL or read a developer's dotenv.
_os_keys = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"}
_environment = {key: value for key, value in os.environ.items() if key.upper() in _os_keys}
_environment.update(DATABASE_URL="sqlite:///:memory:", FLASK_ENV="development", FLASK_SKIP_DOTENV="1",
                    JWT_SECRET_KEY="synthetic-catalog-import-key-at-least-32-characters")
with patch.dict(os.environ, _environment, clear=True):
    from app import db
    from auth_identity import install_identity_checks
    from models import Dish, RecipeTier, User
    from planning_catalog_models import PlanningCatalogEntry
    import planning_catalog as catalog


def fixture(*, kind="recipe", revision=1, availability="published", level="basic", entry_id="synthetic-entry"):
    """Deliberately synthetic; not a recipe source, seed, or culinary approval."""
    authored = {"title": "Synthetic fixture", "ingredients": [
        {"ingredient_id": "test-ingredient", "form": "dry", "unit": "g", "amount": "12.500"},
        {"ingredient_id": "test-liquid", "form": "liquid", "unit": "ml", "amount": "0.125"},
    ]}
    if kind == "recipe":
        authored.update(method=["Synthetic method, not culinary guidance."],
                        equipment=["Synthetic equipment"], time_min=10)
    jar = {"id": "jar", "base_servings": 2, "languages": {"en": authored}}
    homemade = copy.deepcopy(jar)
    homemade["id"] = "homemade"
    homemade["languages"]["en"]["title"] = "Different complete fixture"
    homemade["languages"]["en"]["ingredients"][0]["amount"] = "99.000"
    if kind == "recipe":
        homemade["languages"]["en"]["method"] = ["Different synthetic method."]
        homemade["languages"]["en"]["equipment"] = ["Different equipment"]
        homemade["languages"]["en"]["time_min"] = 30
    return {"entry_id": entry_id, "revision": revision, "kind": kind,
            "availability": availability,
            "content": {"schema_version": 1,
                        "recipe": {"dish_slug": "synthetic-dish", "level": level} if kind == "recipe" else None,
                        "variants": [jar, homemade]}}


def selection(**changes):
    return {"entry_id": "synthetic-entry", "revision": 1, "language": "en",
            "options": {"variant_id": "jar"}, "servings": 3, **changes}


def fixture_v2(**changes):
    record = fixture(**changes)
    record["content"]["schema_version"] = 2
    for variant in record["content"]["variants"]:
        ingredients = variant["languages"]["en"]["ingredients"]
        for ingredient in ingredients:
            ingredient.update(label="Synthetic ingredient", category="cupboard", purchase_mode="measured")
        ingredients.append({"ingredient_id": "test-seasoning", "form": "dry", "unit": "taste",
                            "amount": None, "label": "Synthetic seasoning", "category": "herbs",
                            "purchase_mode": "check_cupboard"})
    return record


class CatalogValidationTest(unittest.TestCase):
    def rejected(self, function, *args, code="invalid_catalog", **kwargs):
        with self.assertRaises(catalog.CatalogError) as caught:
            function(*args, **kwargs)
        self.assertEqual(caught.exception.code, code)
        return caught.exception

    def test_validation_pure_detached_canonical_and_defaults_to_draft(self):
        record = fixture()
        del record["availability"]
        record["content"]["variants"][0]["languages"]["en"]["ingredients"][0]["amount"] = "12.5"
        before = copy.deepcopy(record)
        with patch("sqlalchemy.orm.Session.execute", side_effect=AssertionError("Validation queried a DB")):
            validated = catalog.validate_record(record)
            catalog.validate_selection(**selection())
        self.assertEqual(record, before)
        self.assertEqual(validated["availability"], "draft")
        self.assertEqual(validated["content"]["variants"][0]["languages"]["en"]["ingredients"][0]["amount"], "12.500")
        self.assertEqual(len(validated["content_digest"]), 64)
        validated["content"]["variants"][0]["id"] = "changed-copy"
        self.assertEqual(record, before)

    def test_decimal_rejects_coercions_special_values_and_extra_precision(self):
        for value in (True, False, 1, 1.5, Decimal("1"), None, [], {}, "", "0", "0.000",
                      "-1", "+1", "01", "1.", ".5", "1e2", "NaN", "Infinity", "-Infinity",
                      " 1", "1 ", "1\n", "١", "1.0000", "1000000.001", "1000001", "1" * 1000):
            with self.subTest(value=value):
                self.rejected(catalog.decimal_amount, value)
        for value in ("0.001", "1", "12.50", "1000000.000"):
            self.assertEqual(catalog.decimal_amount(value), Decimal(value))

    def test_v2_explicit_metadata_and_qualitative_amounts(self):
        record = fixture_v2()
        before = copy.deepcopy(record)
        result = catalog.validate_record(record)
        self.assertEqual(record, before)
        ingredient = result["content"]["variants"][0]["languages"]["en"]["ingredients"][-1]
        self.assertIsNone(ingredient["amount"])
        for field, value in (("amount", "1"), ("purchase_mode", "measured"), ("unit", "g"),
                             ("label", ""), ("category", "inferred"), ("purchase_mode", True)):
            with self.subTest(field=field, value=value):
                invalid = copy.deepcopy(record)
                invalid["content"]["variants"][0]["languages"]["en"]["ingredients"][-1][field] = value
                self.rejected(catalog.validate_record, invalid)
        for field in ("label", "category", "purchase_mode"):
            invalid = copy.deepcopy(record)
            del invalid["content"]["variants"][0]["languages"]["en"]["ingredients"][0][field]
            self.rejected(catalog.validate_record, invalid)
        # A numeric cupboard check is also valid; classification is authored, not inferred from names.
        record["content"]["variants"][0]["languages"]["en"]["ingredients"][0]["purchase_mode"] = "check_cupboard"
        catalog.validate_record(record)

    def test_decimal_scaling_bounds_rounding_and_context(self):
        self.assertEqual(catalog.scale_amount("0.001", 2, 1), "0.001")
        self.assertEqual(catalog.scale_amount("1", 3, 2), "0.667")
        self.assertEqual(catalog.scale_amount("1000000", 1000, 1000), "1000000.000")
        self.assertEqual(catalog.scale_amount("0.125", 2, 3), "0.188")
        with localcontext() as context:
            context.prec = 2
            self.assertEqual(catalog.scale_amount("12345.678", 3, 2), "8230.452")
        for args in (("0.001", 1000, 1), ("1000000", 1, 2), ("1000.001", 1, 1000)):
            error = self.rejected(catalog.scale_amount, *args, code="catalog_unavailable")
            self.assertEqual(error.body["reason"], "quantity_out_of_range")

    def test_strict_selection(self):
        invalid = {
            "entry_id": (None, True, 1, "", "A", "two_words", "-a", "a-", "a--b", "a/b", "a" * 81),
            "revision": (None, True, False, 0, -1, 1.0, "1", [], 2147483648),
            "language": (None, True, "EN", "en-US", "fr", "", []),
            "options": (None, {}, [], {"variant_id": True}, {"variant_id": "jar", "sauce": "homemade"}),
            "servings": (None, True, False, 0, -1, 1001, 2.0, "2", [], float("nan")),
        }
        for field, values in invalid.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    self.rejected(catalog.validate_selection, **selection(**{field: value}), code="invalid_request")
        for servings in (1, 1000):
            catalog.validate_selection(**selection(servings=servings))

    def test_closed_schema_at_every_level(self):
        for path in ((), ("content",), ("content", "recipe"), ("content", "variants", 0),
                     ("content", "variants", 0, "languages", "en"),
                     ("content", "variants", 0, "languages", "en", "ingredients", 0)):
            for remove in (False, True):
                record = fixture()
                target = record
                for key in path:
                    target = target[key]
                if remove:
                    del target[next(iter(target))]
                else:
                    target["creator_verified"] = True
                with self.subTest(path=path, remove=remove):
                    self.rejected(catalog.validate_record, record)

    def test_variant_recipe_and_nested_field_constraints(self):
        mutations = [
            lambda r: r.update(kind=True),
            lambda r: r.update(availability=False),
            lambda r: r["content"].update(schema_version=True),
            lambda r: r["content"].update(schema_version=2),
            lambda r: r["content"].update(recipe=None),
            lambda r: r["content"]["recipe"].update(level="unknown"),
            lambda r: r["content"].update(variants=[]),
            lambda r: r["content"].update(variants=[r["content"]["variants"][0]] * 33),
            lambda r: r["content"]["variants"][1].update(id="jar"),
            lambda r: r["content"]["variants"][0].update(base_servings=True),
            lambda r: r["content"]["variants"][0].update(languages={}),
            lambda r: r["content"]["variants"][0]["languages"].update(fr={}),
        ]
        for mutate in mutations:
            record = fixture()
            mutate(record)
            self.rejected(catalog.validate_record, record)
        invalid = {"title": ("", " x", "x ", "x" * 161, "x\nx", "\ud800", "x\x7f"),
                   "ingredients": ([], {}, [None]), "method": ([], "step", [True], ["x" * 4001]),
                   "equipment": ("pan", [None], ["pan"] * 51), "time_min": (True, 0, 10081, 1.5)}
        for field, values in invalid.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    record = fixture()
                    record["content"]["variants"][0]["languages"]["en"][field] = value
                    self.rejected(catalog.validate_record, record)
        for field, value in (("ingredient_id", "bad_id"), ("form", ""), ("unit", "pinch"), ("unit", [])):
            record = fixture()
            record["content"]["variants"][0]["languages"]["en"]["ingredients"][0][field] = value
            self.rejected(catalog.validate_record, record)
        record = fixture()
        ingredients = record["content"]["variants"][0]["languages"]["en"]["ingredients"]
        ingredients.append(copy.deepcopy(ingredients[0]))
        self.rejected(catalog.validate_record, record)

    def test_content_json_size_and_cycles_rejected(self):
        record = fixture()
        record["content"]["variants"][0]["languages"]["en"]["method"] = ["x" * 4000] * 100
        self.rejected(catalog.validate_record, record)
        record = fixture()
        record["content"]["variants"].append(record["content"])
        self.rejected(catalog.validate_record, record)

    def test_examples_forbid_recipe_guidance_and_verification(self):
        self.assertIsNone(catalog.validate_record(fixture(kind="planning_example"))["content"]["recipe"])
        for field, value in (("method", []), ("equipment", []), ("time_min", 10),
                             ("creator_verified", False), ("verified", True), ("nutrition", {}), ("yield", 2)):
            record = fixture(kind="planning_example")
            record["content"]["variants"][0]["languages"]["en"][field] = value
            self.rejected(catalog.validate_record, record)
        record = fixture(kind="planning_example")
        record["content"]["recipe"] = {"dish_slug": "synthetic-dish", "level": "basic"}
        self.rejected(catalog.validate_record, record)

    def test_digest_covers_identity_revision_kind_content_but_not_status(self):
        first = catalog.validate_record(fixture())
        reordered = json.loads(json.dumps(fixture(), sort_keys=True))
        self.assertEqual(catalog.validate_record(reordered)["content_digest"], first["content_digest"])
        self.assertEqual(catalog.validate_record(fixture(availability="revoked"))["content_digest"], first["content_digest"])
        for changed in (fixture(revision=2), fixture(entry_id="other-entry"), fixture(kind="planning_example")):
            self.assertNotEqual(catalog.validate_record(changed)["content_digest"], first["content_digest"])
        record = fixture()
        record["content_digest"] = "0" * 64
        self.rejected(catalog.validate_record, record)


class CatalogDatabaseTest(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
                               JWT_SECRET_KEY="synthetic-catalog-test-key-at-least-32-characters")
        db.init_app(self.app)
        jwt = JWTManager(self.app)
        install_identity_checks(jwt)

        @self.app.after_request
        def no_store(response):
            # Same global error/JWT cache policy provided by the real factory.
            response.headers["Cache-Control"] = "no-store"
            return response

        self.app.add_url_rule("/api/planning/v1/catalog", view_func=catalog.catalog_list, methods=["GET"])
        self.app.add_url_rule("/api/planning/v1/catalog/<entry_id>/<int:revision>",
                              view_func=catalog.catalog_get, methods=["GET"])
        self.app.add_url_rule("/api/planning/v1/catalog/resolve", view_func=catalog.catalog_resolve, methods=["POST"])
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.user = User(email="synthetic@example.invalid", password_hash="test-only", plan="free")
        db.session.add(self.user)
        dish = Dish(slug="synthetic-dish")
        db.session.add(dish)
        db.session.flush()
        self.tier = RecipeTier(dish_id=dish.id, level="basic", lang="en", title="LIVE title must not replace revision")
        db.session.add(self.tier)
        db.session.commit()
        self.headers = {"Authorization": "Bearer " + create_access_token(identity=str(self.user.id))}
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.engine.dispose()
        self.context.pop()

    def seed(self, **kwargs):
        catalog.sync_catalog([fixture(**kwargs)])
        db.session.commit()
        return db.session.execute(select(PlanningCatalogEntry).where(
            PlanningCatalogEntry.entry_id == kwargs.get("entry_id", "synthetic-entry"),
            PlanningCatalogEntry.revision == kwargs.get("revision", 1))).scalar_one()

    def resolve(self, **kwargs):
        return catalog.resolve(**selection(**kwargs), user=self.user)

    def error(self, function, *args, code="catalog_unavailable", reason=None, **kwargs):
        with self.assertRaises(catalog.CatalogError) as caught:
            function(*args, **kwargs)
        self.assertEqual(caught.exception.code, code)
        if reason:
            self.assertEqual(caught.exception.body["reason"], reason)
        return caught.exception

    def test_empty_catalog_default_sync_and_no_draft_bypass(self):
        self.assertEqual(catalog.sync_catalog(), [])
        self.assertEqual(catalog.list_entries("en", self.user), {"entries": []})
        self.seed(availability="draft")
        self.app.config["PLANNING_CATALOG_ALLOW_DRAFTS"] = True
        self.assertEqual(catalog.list_entries("en", self.user), {"entries": []})
        self.error(self.resolve, reason="not_published")
        self.error(self.resolve, entry_id="unknown", reason="entry_missing")

    def test_published_authorized_recipe_resolves_complete_variant_without_overlay(self):
        row = self.seed()
        result = self.resolve()
        self.assertEqual(result["content_digest"], row.content_digest)
        self.assertEqual(result["title"], "Synthetic fixture")
        self.assertEqual(result["ingredients"][0], {"ingredient_id": "test-ingredient", "form": "dry",
                         "unit": "g", "amount": "18.750", "source_amount": "12.500"})
        self.assertEqual(result["ingredients"][1]["amount"], "0.188")
        self.assertEqual((result["servings"], result["base_servings"]), (3, 2))
        other = self.resolve(options={"variant_id": "homemade"})
        self.assertEqual(other["ingredients"][0]["amount"], "148.500")
        self.assertEqual(other["method"], ["Different synthetic method."])
        self.assertEqual(other["equipment"], ["Different equipment"])
        self.assertEqual(other["time_min"], 30)
        result["ingredients"][0]["amount"] = "999"
        self.assertEqual(self.resolve()["ingredients"][0]["amount"], "18.750")

    def test_v2_resolution_preserves_v1_and_never_scales_qualitative_amounts(self):
        old = self.seed()
        old_content, old_digest, old_result = copy.deepcopy(old.content), old.content_digest, self.resolve()
        catalog.sync_catalog([fixture_v2(revision=2)])
        db.session.commit()
        result = self.resolve(revision=2)
        self.assertEqual(result["schema_version"], 2)
        self.assertEqual(result["ingredients"][0]["amount"], "18.750")
        self.assertEqual(result["ingredients"][0]["label"], "Synthetic ingredient")
        self.assertIsNone(result["ingredients"][-1]["amount"])
        self.assertIsNone(result["ingredients"][-1]["source_amount"])
        self.assertEqual(self.resolve(), old_result)
        db.session.refresh(old)
        self.assertEqual((old.content, old.content_digest), (old_content, old_digest))

    def test_missing_language_variant_and_recipe_are_explicit(self):
        self.seed()
        self.error(self.resolve, language="de", reason="language_missing")
        self.error(self.resolve, options={"variant_id": "absent"}, reason="variant_missing")
        self.error(self.resolve, revision=2, reason="entry_missing")
        db.session.delete(self.tier)
        db.session.commit()
        self.error(self.resolve, reason="recipe_missing")
        self.assertEqual(catalog.list_entries("en", self.user), {"entries": []})

    def test_deleted_dish_cannot_leave_an_eligible_orphan_tier(self):
        self.seed()
        db.session.execute(Dish.__table__.delete())
        db.session.commit()
        self.error(self.resolve, reason="recipe_missing")

    def test_exact_variant_language_and_recipe_language_no_fallback(self):
        record = fixture()
        record["content"]["variants"][1]["languages"]["de"] = copy.deepcopy(
            record["content"]["variants"][1]["languages"]["en"])
        catalog.sync_catalog([record])
        db.session.commit()
        # Authored DE exists, but exact live RecipeTier DE does not.
        self.error(self.resolve, language="de", reason="recipe_missing")
        db.session.add(RecipeTier(dish_id=self.tier.dish_id, level="basic", lang="de", title="Live DE"))
        db.session.commit()
        self.error(self.resolve, language="de", reason="language_missing")
        result = self.resolve(language="de", options={"variant_id": "homemade"})
        self.assertEqual(result["language"], "de")
        self.assertEqual([item["id"] for item in catalog.get_entry("synthetic-entry", 1, "de", self.user)["variants"]], ["homemade"])

    def test_tier_gate_rechecks_current_plan_even_with_stale_user(self):
        self.tier.level = "advanced"
        self.user.plan = "premium"
        db.session.commit()
        self.seed(level="advanced")
        self.resolve()
        db.session.execute(User.__table__.update().where(User.id == self.user.id).values(plan="free"))
        db.session.flush()
        self.assertEqual(self.user.plan, "premium")
        self.error(self.resolve, reason="recipe_inaccessible")
        self.assertEqual(catalog.list_entries("en", self.user), {"entries": []})
        self.error(catalog.get_entry, "synthetic-entry", 1, "en", self.user, reason="recipe_inaccessible")

    def test_intermediate_accepts_authenticated_free_user(self):
        self.tier.level = "intermediate"
        db.session.commit()
        self.seed(level="intermediate")
        self.assertEqual(self.resolve()["recipe"]["level"], "intermediate")

    def test_user_required_and_deleted_account_rejected(self):
        self.seed()
        self.error(catalog.resolve, **selection(), user=None, code="invalid_session")
        db.session.execute(User.__table__.delete().where(User.id == self.user.id))
        db.session.flush()
        self.error(self.resolve, code="invalid_session")

    def test_example_has_no_guidance_and_does_not_depend_on_recipe(self):
        self.seed(kind="planning_example")
        db.session.delete(self.tier)
        db.session.commit()
        result = self.resolve()
        self.assertIsNone(result["recipe"])
        self.assertEqual(result["kind"], "planning_example")
        for response in (result, catalog.get_entry("synthetic-entry", 1, "en", self.user)):
            wire = json.dumps(response)
            for forbidden in ("method", "equipment", "time_min", "creator_verified", "nutrition"):
                self.assertNotIn('"' + forbidden + '"', wire)

    def test_old_revision_survives_new_revision_and_live_recipe_changes(self):
        old = self.seed()
        old_digest = old.content_digest
        record = fixture(revision=2)
        record["content"]["variants"][0]["languages"]["en"].update(title="Second revision")
        catalog.sync_catalog([record])
        self.tier.title = "New live title"
        self.tier.ingredients = [{"qty": "999", "unit": "kg"}]
        self.tier.steps = ["New live method"]
        db.session.commit()
        self.assertEqual(self.resolve()["content_digest"], old_digest)
        self.assertEqual(self.resolve()["title"], "Synthetic fixture")
        self.assertEqual(self.resolve(revision=2)["title"], "Second revision")
        entries = catalog.list_entries("en", self.user)["entries"]
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["revision"], 2)
        self.assertNotIn("ingredients", entries[0]["variants"][0])

    def test_new_draft_does_not_overlay_or_withdraw_published_revision(self):
        self.seed()
        self.seed(revision=2, availability="draft")
        self.assertEqual(catalog.list_entries("en", self.user)["entries"][0]["revision"], 1)
        self.assertEqual(self.resolve()["title"], "Synthetic fixture")
        self.error(self.resolve, revision=2, reason="not_published")

    def test_revocation_current_no_cached_or_sync_resurrection(self):
        row = self.seed()
        self.resolve()
        db.session.execute(PlanningCatalogEntry.__table__.update().where(
            PlanningCatalogEntry.id == row.id).values(availability="revoked"))
        db.session.flush()
        self.assertEqual(row.availability, "published")
        self.error(self.resolve, reason="revoked")
        replay = catalog.sync_catalog([fixture()])
        self.assertEqual(replay[0]["availability"], "revoked")
        self.error(catalog.set_availability, row.entry_id, row.revision, "published", code="catalog_revision_conflict")
        self.assertEqual(catalog.list_entries("en", self.user), {"entries": []})

    def test_operator_status_is_explicit_and_terminal(self):
        row = self.seed(availability="draft")
        self.assertEqual(catalog.sync_catalog([fixture()])[0]["availability"], "draft")
        catalog.set_availability(row.entry_id, row.revision, "published")
        self.resolve()
        catalog.set_availability(row.entry_id, row.revision, "revoked")
        catalog.set_availability(row.entry_id, row.revision, "revoked")
        self.error(self.resolve, reason="revoked")
        self.error(catalog.set_availability, row.entry_id, row.revision, "draft", code="catalog_revision_conflict")

    def test_sync_idempotency_digest_and_revision_conflicts(self):
        self.seed()
        original = catalog.sync_catalog([fixture()])
        self.assertEqual(catalog.sync_catalog([fixture(), fixture()]), original)
        self.assertEqual(PlanningCatalogEntry.query.count(), 1)
        changed = fixture()
        changed["content"]["variants"][0]["languages"]["en"]["title"] = "Changed content"
        self.error(catalog.sync_catalog, [changed], code="catalog_revision_conflict")
        self.assertEqual(self.resolve()["title"], "Synthetic fixture")
        self.seed(revision=3)
        self.error(catalog.sync_catalog, [fixture(revision=2)], code="catalog_revision_conflict")
        self.error(catalog.sync_catalog, [fixture(kind="planning_example", revision=4)], code="catalog_revision_conflict")

    def test_examples_cannot_be_promoted_to_recipe_under_same_entry(self):
        self.seed(kind="planning_example")
        self.error(catalog.sync_catalog, [fixture(revision=2)], code="catalog_revision_conflict")
        self.assertEqual(PlanningCatalogEntry.query.count(), 1)

    def test_sync_validates_entire_batch_before_mutating(self):
        invalid = fixture(entry_id="z-invalid")
        invalid["content"]["variants"][0]["base_servings"] = True
        self.error(catalog.sync_catalog, [fixture(), invalid], code="invalid_catalog")
        self.assertEqual(PlanningCatalogEntry.query.count(), 0)
        self.assertEqual(len(db.session.new), 0)
        changed = fixture()
        changed["content"]["variants"][0]["languages"]["en"]["title"] = "Different"
        self.error(catalog.sync_catalog, [fixture(), changed], code="catalog_revision_conflict")
        self.assertEqual(len(db.session.new), 0)

    def test_model_immutable_revision_fields_and_nested_changes(self):
        row = self.seed()
        identity = row.id
        changes = {"entry_id": "changed", "revision": 2, "kind": "planning_example",
                   "content_digest": "0" * 64, "content": fixture(revision=2)["content"]}
        # Content must actually differ to exercise the guard.
        changes["content"]["variants"][0]["languages"]["en"]["title"] = "Changed"
        for field, value in changes.items():
            with self.subTest(field=field):
                row = db.session.get(PlanningCatalogEntry, identity)
                setattr(row, field, value)
                self.error(db.session.flush, code="catalog_revision_conflict")
                db.session.rollback()
        row = db.session.get(PlanningCatalogEntry, identity)
        row.content["variants"][0]["languages"]["en"]["title"] = "In-place mutation"
        flag_modified(row, "content")
        self.error(db.session.flush, code="catalog_revision_conflict")
        db.session.rollback()
        self.assertEqual(self.resolve()["title"], "Synthetic fixture")

    def test_model_delete_and_reactivation_are_rejected(self):
        row = self.seed()
        db.session.delete(row)
        self.error(db.session.flush, code="catalog_revision_conflict")
        db.session.rollback()
        catalog.set_availability("synthetic-entry", 1, "revoked")
        db.session.commit()
        row.availability = "published"
        self.error(db.session.flush, code="catalog_revision_conflict")
        db.session.rollback()

    def test_model_insert_validates_digest_and_schema_without_sync(self):
        for changes in ({"content_digest": "0" * 64}, {"availability": False}, {"revision": True}):
            values = catalog.validate_record(fixture())
            values.update(changes)
            db.session.add(PlanningCatalogEntry(**values))
            self.error(db.session.flush, code="invalid_catalog")
            db.session.rollback()
        values = fixture()
        del values["availability"]
        row = PlanningCatalogEntry(**values)
        db.session.add(row)
        db.session.flush()
        self.assertEqual(row.availability, "draft")
        self.assertEqual(len(row.content_digest), 64)

    def test_stored_content_tampering_fails_closed_even_for_cached_row(self):
        row = self.seed()
        corrupt = copy.deepcopy(row.content)
        corrupt["variants"][0]["languages"]["en"]["title"] = "Tampered"
        db.session.execute(PlanningCatalogEntry.__table__.update().where(
            PlanningCatalogEntry.id == row.id).values(content=corrupt))
        self.assertEqual(row.content["variants"][0]["languages"]["en"]["title"], "Synthetic fixture")
        self.error(self.resolve, code="catalog_integrity_error")
        self.error(catalog.get_entry, "synthetic-entry", 1, "en", self.user, code="catalog_integrity_error")
        self.error(catalog.list_entries, "en", self.user, code="catalog_integrity_error")

    def test_sql_uniqueness_enum_revision_digest_constraints(self):
        row = self.seed()
        values = {column.name: getattr(row, column.name) for column in PlanningCatalogEntry.__table__.columns if column.name != "id"}
        for changes in ({}, {"revision": 0}, {"revision": 2, "availability": "unknown"},
                        {"revision": 2, "kind": "unknown"}, {"revision": 2, "content_digest": "short"}):
            with self.subTest(changes=changes):
                with self.assertRaises(IntegrityError):
                    with db.session.begin_nested():
                        db.session.execute(PlanningCatalogEntry.__table__.insert().values(**{**values, **changes}))

    def test_sync_participates_in_caller_transaction_without_commit(self):
        catalog.sync_catalog([fixture()])
        db.session.rollback()
        self.assertEqual(PlanningCatalogEntry.query.count(), 0)

    def test_http_auth_reads_resolution_and_no_publish(self):
        self.seed()
        base = "/api/planning/v1/catalog"
        for method, path, body in (("GET", base + "?language=en", None),
                                   ("GET", base + "/synthetic-entry/1?language=en", None),
                                   ("POST", base + "/resolve", selection())):
            unauthorized = self.client.open(path, method=method, json=body)
            self.assertEqual(unauthorized.status_code, 401)
            self.assertIn("no-store", unauthorized.headers["Cache-Control"])
            response = self.client.open(path, method=method, json=body, headers=self.headers)
            self.assertEqual(response.status_code, 200, response.get_json())
            self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertEqual(self.client.post(base, json=fixture(), headers=self.headers).status_code, 405)
        response = self.client.post(base + "/resolve", json={**selection(), "content": fixture()["content"]}, headers=self.headers)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(PlanningCatalogEntry.query.count(), 1)

    def test_http_unknown_duplicate_and_malformed_input(self):
        base = "/api/planning/v1/catalog"
        for query in ("", "?language=en&language=de", "?language=en&allow_drafts=true", "?language=fr"):
            response = self.client.get(base + query, headers=self.headers)
            self.assertEqual(response.status_code, 400, response.get_json())
        for body in ("[]", "null", "{}", "{", '{"servings":NaN}',
                     json.dumps(selection())[:-1] + ',"servings":4}',
                     json.dumps(selection()).replace('"variant_id": "jar"', '"variant_id":"jar","variant_id":"homemade"')):
            response = self.client.post(base + "/resolve", data=body, content_type="application/json", headers=self.headers)
            self.assertEqual(response.status_code, 400, response.get_json())
        response = self.client.post(base + "/resolve", data=" " * 4097, content_type="application/json", headers=self.headers)
        self.assertEqual(response.status_code, 413)
        response = self.client.post(base + "/resolve", data=json.dumps(selection()), headers=self.headers)
        self.assertEqual(response.status_code, 400)
        response = self.client.post(base + "/resolve?allow_drafts=true", json=selection(), headers=self.headers)
        self.assertEqual(response.status_code, 400)

    def test_http_deleted_user_and_unavailable_and_database_failure(self):
        self.seed(availability="draft")
        response = self.client.post("/api/planning/v1/catalog/resolve", json=selection(), headers=self.headers)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["reason"], "not_published")
        with patch.object(catalog, "list_entries", side_effect=OperationalError("private SQL", {}, Exception("private DB details"))):
            response = self.client.get("/api/planning/v1/catalog?language=en", headers=self.headers)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private", response.get_data(as_text=True))
        db.session.delete(self.user)
        db.session.commit()
        response = self.client.get("/api/planning/v1/catalog?language=en", headers=self.headers)
        self.assertEqual(response.status_code, 401)


class CatalogMigrationTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("catalog_migration", ROOT / "migrations/versions/c953d421ab62_planning_catalog.py")
        self.migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.migration)

    def test_migration_matches_model_and_emits_no_seed_writes(self):
        import sqlalchemy as sa
        self.assertEqual(self.migration.down_revision, "b842c310fa51")
        with patch.object(self.migration, "op") as op:
            self.migration.upgrade()
            op.bulk_insert.assert_not_called()
            op.execute.assert_not_called()
            op.create_table.assert_called_once()
            args = op.create_table.call_args.args
            table = sa.Table(args[0], sa.MetaData(), *args[1:])
        model = PlanningCatalogEntry.__table__
        self.assertEqual(set(table.columns.keys()), set(model.columns.keys()))
        self.assertEqual({c.name for c in table.constraints}, {c.name for c in model.constraints})
        ddl = str(CreateTable(table).compile(dialect=postgresql.dialect()))
        self.assertIn("UNIQUE (entry_id, revision)", ddl)
        self.assertIn("content JSON NOT NULL", ddl)
        self.assertIn("DEFAULT 'draft'", ddl)

    def test_retained_revisions_block_destructive_downgrade(self):
        with patch.object(self.migration, "op") as op:
            op.get_bind.return_value.execute.return_value.scalar.return_value = True
            with self.assertRaisesRegex(RuntimeError, "destructive downgrade refused"):
                self.migration.downgrade()
            op.drop_table.assert_not_called()
            self.assertIn("planning_catalog_entries", str(op.get_bind.return_value.execute.call_args.args[0]))
        with patch.object(self.migration, "op") as op:
            op.get_bind.return_value.execute.return_value.scalar.return_value = False
            self.migration.downgrade()
            op.drop_table.assert_called_once_with("planning_catalog_entries")


if __name__ == "__main__":
    unittest.main()
