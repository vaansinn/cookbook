"""Leaf-service tests on isolated, in-memory SQLite and real model metadata.

No dotenv, inherited database URL, network or real users. app.py constructs its
module-level app on import; sanitize its environment before importing it.
HTTP receipt dispatch and PostgreSQL lock concurrency are integrator gates.
"""
from datetime import date, datetime, timedelta
import os
import sys
import unittest
from uuid import uuid4

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# This script runs in its own process, matching tests/run_backend.py. Importing
# app.py must never discover a developer database or dotenv credentials.
_os_keys = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"}
_test_env = {key: value for key, value in os.environ.items() if key.upper() in _os_keys}
_test_env.update(FLASK_SKIP_DOTENV="1", FLASK_ENV="development", DATABASE_URL="sqlite:///:memory:",
                 JWT_SECRET_KEY="synthetic-preference-tests-only-not-a-real-secret-123456789",
                 PYTHONDONTWRITEBYTECODE="1")
os.environ.clear()
os.environ.update(_test_env)

from flask import Flask
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError

from app import db
from models import User
from planning_models import PlanningWorkspace, PrivatePlan, PlanningMutation, PlanningUndo
from planning_preference_models import PrivatePlanningPreferences, default_values, MAX_REVISION
from planning_shopping_models import PrivateShoppingScope
from planning_preferences import apply, get_preferences, validate
from routes.planning import PlanningError


class PlanningPreferencesTest(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI="sqlite://",
                               SQLALCHEMY_TRACK_MODIFICATIONS=False)
        db.init_app(self.app)
        self.context = self.app.app_context()
        self.context.push()
        self.addCleanup(self.context.pop)
        engine = db.engine
        event.listen(engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        db.create_all()
        self.addCleanup(engine.dispose)
        self.addCleanup(db.session.remove)
        self.owners = []
        for index in range(2):
            user = User(email=f"synthetic-preferences-{index}@example.invalid", password_hash="synthetic-not-a-password", plan="free")
            db.session.add(user)
            db.session.flush()
            owner = PlanningWorkspace(user_id=user.id, revision=7)
            db.session.add(owner)
            db.session.flush()
            self.owners.append(owner)
        db.session.commit()
        self.owner = self.owners[0]

    def update(self, changes, revision=0, owner=None):
        return apply(owner or self.owner, "preferences.update", {"expected_revision": revision, "changes": changes})

    def row(self, owner=None):
        return PrivatePlanningPreferences.query.filter_by(workspace_id=(owner or self.owner).id).one()

    def scope(self, owner=None):
        owner = owner or self.owner
        plan = PrivatePlan(workspace_id=owner.id, name="Synthetic scope", start_date=date(2026, 9, 13), end_date=date(2026, 9, 14))
        db.session.add(plan)
        db.session.flush()
        identity = str(uuid4())
        # Insert synthetic records through the real constrained table. Scope
        # authorship/reconciliation service tests belong to its separate owner.
        db.session.execute(PrivateShoppingScope.__table__.insert().values(
            id=identity, workspace_id=owner.id, plan_id=plan.id, mode="all",
            selection=[], selection_digest=uuid4().hex + uuid4().hex,
            state={"rows": {}, "personal": [], "unavailable": False}))
        db.session.commit()
        return identity

    def error(self, action, code, status):
        with self.assertRaises(PlanningError) as caught:
            action()
        self.assertEqual(caught.exception.status, status)
        self.assertEqual(caught.exception.body["code"], code)
        return caught.exception.body

    def test_defaults_are_detached_and_reads_create_nothing(self):
        for owner in (None, self.owner):
            result = get_preferences(owner)
            self.assertEqual(result, {"preferences": default_values(), "preference_revision": 0})
            result["preferences"]["language"] = "de"
            self.assertEqual(get_preferences(owner)["preferences"]["language"], "en")
        self.assertEqual(PrivatePlanningPreferences.query.count(), 0)

    def test_partial_updates_persist_and_receipt_is_ack_only(self):
        result, status = self.update({"language": "de", "dark_mode": True})
        self.assertEqual((result, status), ({"preference_revision": 1}, 200))
        db.session.commit()
        self.update({"shopping_layout": "dish"}, 1)
        db.session.commit()
        db.session.expire_all()
        self.assertEqual(get_preferences(self.owner), {"preference_revision": 2, "preferences": {
            "language": "de", "dark_mode": True, "shopping_layout": "dish", "shopping_scope_id": None}})
        self.assertEqual(get_preferences(self.owners[1])["preferences"], default_values())

    def test_each_layout_and_explicit_same_value_increment_revision(self):
        for revision, layout in enumerate(("category", "alphabetical", "dish", "amount", "amount")):
            self.assertEqual(self.update({"shopping_layout": layout}, revision)[0], {"preference_revision": revision + 1})
        self.assertEqual(self.row().revision, 5)

    def test_strict_types_unknown_fields_and_malicious_text_are_rejected(self):
        changes = [{}, None, [], {"unknown": True}, {"__proto__": {}},
                   {"language": "<script>alert(1)</script>"}, {"language": "en\x00"},
                   {"language": "EN"}, {"language": ["en"]}, {"dark_mode": 1},
                   {"dark_mode": "false"}, {"dark_mode": None},
                   {"shopping_layout": "a" * 20000}, {"shopping_layout": {}},
                   {"shopping_scope_id": 1}, {"shopping_scope_id": "javascript:alert(1)"},
                   {"shopping_scope_id": str(uuid4()).upper()}, {"shopping_scope_id": ""}]
        for change in changes:
            with self.subTest(change=str(change)[:100]):
                self.error(lambda: self.update(change), "invalid_request", 400)
        for revision in (-1, True, False, 0.0, "0", None, MAX_REVISION + 1):
            self.error(lambda: self.update({"dark_mode": True}, revision), "invalid_request", 400)
        for operation, payload in [("preferences.delete", {}), ([], {}),
                                   ("preferences.update", {}),
                                   ("preferences.update", {"expected_revision": 0, "changes": {"dark_mode": True}, "owner_id": self.owners[1].id})]:
            self.error(lambda: validate(operation, payload), "invalid_request", 400)
        self.assertEqual(PrivatePlanningPreferences.query.count(), 0)

    def test_missing_owner_cannot_create_preferences(self):
        self.error(lambda: apply(None, "preferences.update", {"expected_revision": 0, "changes": {"language": "de"}}), "invalid_session", 401)
        self.assertEqual(PrivatePlanningPreferences.query.count(), 0)

    def test_competing_expected_revisions_reject_loser_without_overwrite(self):
        # Two submissions captured revision zero; caller's workspace lock orders
        # execution. This tests their resulting interleaving, not PG locking.
        self.update({"language": "de"}, 0)
        db.session.commit()
        self.error(lambda: self.update({"dark_mode": True}, 0), "preference_revision_conflict", 409)
        self.assertEqual(get_preferences(self.owner)["preferences"], {**default_values(), "language": "de"})
        self.update({"dark_mode": True}, 1)
        db.session.commit()
        self.assertEqual(self.row().revision, 2)

    def test_stale_orm_revision_is_refreshed_before_update(self):
        self.update({"language": "de"})
        db.session.commit()
        row = self.row()
        db.session.execute(PrivatePlanningPreferences.__table__.update().where(
            PrivatePlanningPreferences.id == row.id).values(revision=2))
        self.assertEqual(row.revision, 1)
        self.error(lambda: self.update({"dark_mode": True}, 1), "preference_revision_conflict", 409)
        self.assertEqual(row.revision, 2)

    def test_rollback_discards_preference_and_receipt_together(self):
        for existing in (False, True):
            with self.subTest(existing=existing):
                if existing:
                    self.update({"language": "de"})
                    db.session.commit()
                baseline = get_preferences(self.owner)
                result, status = self.update({"dark_mode": True}, baseline["preference_revision"])
                db.session.add(PlanningMutation(workspace_id=self.owner.id, mutation_id=str(uuid4()),
                    request_digest="a" * 64, result=result, status_code=status))
                db.session.flush()
                # An outer dispatch/receipt failure must roll back this flush.
                db.session.rollback()
                self.assertEqual(get_preferences(self.owner), baseline)
                self.assertEqual(PlanningMutation.query.count(), 0)

    def test_preference_write_preserves_domain_revision_and_undo(self):
        undo = PlanningUndo(workspace_id=self.owner.id, revision=7,
                            inverse={"synthetic": "retained"}, expires_at=datetime.utcnow() + timedelta(minutes=10))
        db.session.add(undo)
        db.session.commit()
        identity = undo.id
        self.update({"language": "de"})
        db.session.commit()
        self.assertEqual(self.owner.revision, 7)
        self.assertEqual(db.session.get(PlanningUndo, identity).inverse, {"synthetic": "retained"})

    def test_owned_scope_can_be_selected_and_explicitly_cleared(self):
        identity = self.scope()
        self.update({"shopping_scope_id": identity})
        db.session.commit()
        self.assertEqual(get_preferences(self.owner)["preferences"]["shopping_scope_id"], identity)
        self.update({"shopping_scope_id": None}, 1)
        self.assertIsNone(get_preferences(self.owner)["preferences"]["shopping_scope_id"])

    def test_foreign_and_missing_scope_have_identical_rejections(self):
        foreign = self.scope(self.owners[1])
        bodies = [self.error(lambda identity=identity: self.update({"language": "de", "shopping_scope_id": identity}),
                             "not_found", 404) for identity in (foreign, str(uuid4()))]
        self.assertEqual(bodies[0], bodies[1])
        self.assertEqual(PrivatePlanningPreferences.query.count(), 0)

    def test_deleted_and_foreign_stored_scope_read_null_without_writes(self):
        identity = self.scope()
        foreign = self.scope(self.owners[1])
        self.update({"shopping_scope_id": identity})
        db.session.commit()
        db.session.execute(PrivateShoppingScope.__table__.delete().where(PrivateShoppingScope.id == identity))
        db.session.commit()
        for reference in (identity, foreign):
            db.session.execute(PrivatePlanningPreferences.__table__.update().values(
                values={**default_values(), "shopping_scope_id": reference}))
            db.session.commit()
            self.assertEqual(get_preferences(self.owner), {"preference_revision": 1, "preferences": default_values()})
            self.assertFalse(db.session.dirty)
            self.assertEqual(self.row().values["shopping_scope_id"], reference)

    def test_reads_do_not_autoflush_unrelated_changes(self):
        self.owner.revision = 8
        statements = []
        def record(_conn, _cursor, statement, _parameters, _context, _many):
            statements.append(statement)
        event.listen(db.engine, "before_cursor_execute", record)
        try:
            get_preferences(self.owner)
        finally:
            event.remove(db.engine, "before_cursor_execute", record)
        self.assertFalse(any(s.lstrip().upper().startswith(("UPDATE", "INSERT", "DELETE")) for s in statements))

    def test_corrupt_stored_json_fails_closed_without_echoing_content(self):
        self.update({"language": "de"})
        db.session.commit()
        db.session.execute(PrivatePlanningPreferences.__table__.update().values(values={"secret": "malicious-content"}))
        db.session.commit()
        body = self.error(lambda: get_preferences(self.owner), "preferences_integrity_error", 503)
        self.assertNotIn("malicious-content", str(body))
        self.error(lambda: self.update({"language": "en"}, 1), "preferences_integrity_error", 503)

    def test_model_constraints_defaults_and_workspace_cascade(self):
        row = PrivatePlanningPreferences(workspace_id=self.owner.id)
        db.session.add(row)
        db.session.commit()
        self.assertEqual((row.revision, row.values), (0, default_values()))
        for changes in ({"revision": -1}, {"revision": 1.5}, {"revision": None}, {"values": None}):
            with self.assertRaises(IntegrityError):
                db.session.execute(PrivatePlanningPreferences.__table__.update().values(**changes))
            db.session.rollback()
        with self.assertRaises(IntegrityError):
            db.session.execute(PrivatePlanningPreferences.__table__.insert().values(workspace_id=self.owner.id))
        db.session.rollback()
        with self.assertRaises(IntegrityError):
            db.session.execute(PrivatePlanningPreferences.__table__.insert().values(workspace_id=str(uuid4())))
        db.session.rollback()
        db.session.execute(PlanningWorkspace.__table__.delete().where(PlanningWorkspace.id == self.owner.id))
        db.session.commit()
        self.assertEqual(PrivatePlanningPreferences.query.count(), 0)

    def test_model_rejects_invalid_assignment_and_detaches_json(self):
        values = default_values()
        row = PrivatePlanningPreferences(workspace_id=self.owner.id, values=values)
        values["language"] = "de"
        self.assertEqual(row.values["language"], "en")
        for value in ({}, {**default_values(), "dark_mode": 1}):
            with self.assertRaises(ValueError):
                row.values = value
        for value in (True, -1, 0.5):
            with self.assertRaises(ValueError):
                row.revision = value

    def test_revision_exhaustion_fails_without_mutation(self):
        db.session.add(PrivatePlanningPreferences(workspace_id=self.owner.id, revision=MAX_REVISION))
        db.session.commit()
        self.error(lambda: self.update({"dark_mode": True}, MAX_REVISION), "limit_reached", 409)
        self.assertEqual(self.row().values, default_values())


if __name__ == "__main__":
    unittest.main()
