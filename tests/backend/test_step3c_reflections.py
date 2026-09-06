"""
Step 3c — routes/reflections.py + routes/progress.py: the full cook+reflection
cycle, the confidence/reflection interaction rule, reflection idempotency, and
partial-edit semantics (docs/contracts/pilot-fixtures.md §3/§6/§10/§13).

Run: python3 tests/backend/test_step3c_reflections.py
"""
import os
import sys
import unittest
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import make_app, make_user, make_tier, make_lesson, auth_header  # noqa: E402


class ReflectionCycleTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        with self.app.app_context():
            user = make_user(self.db)
            self.user_id = user.id
            make_tier(self.db, "lentil-bolognese", "basic", "en",
                      steps=[{"id": "rinse-and-simmer", "text": "Simmer."}], title="Lentil Bolognese")
            make_lesson(self.db, "simmering", "simmering", "lentil-bolognese", "basic", "rinse-and-simmer")

            from snapshots import capture_or_reuse_snapshot
            snap, err = capture_or_reuse_snapshot("lentil-bolognese", "basic", "en")
            self.assertIsNone(err)
            self.snapshot_id = snap.id

        self.headers = auth_header(self.app, self.user_id)
        self.client = self.app.test_client()

    def _log_cook(self, session_id=None):
        body = {
            "dish_slug": "lentil-bolognese", "level": "basic", "lang": "en",
            "session_id": session_id or str(uuid.uuid4()), "snapshot_id": self.snapshot_id,
        }
        resp = self.client.post("/api/cook-log", json=body, headers=self.headers)
        self.assertIn(resp.status_code, (200, 201), resp.get_json())
        return resp.get_json()["cook_log"]

    def test_full_snapshot_to_reflection_round_trip(self):
        cook_log = self._log_cook()
        self.assertEqual(cook_log["snapshot_id"], self.snapshot_id)

        resp = self.client.post("/api/reflections", json={
            "cook_log_id": cook_log["id"], "skill_slug": "simmering",
            "outcome": "happy", "practiced_skill_confirmed": True, "confidence": "comfortable",
        }, headers=self.headers)
        self.assertEqual(resp.status_code, 201, resp.get_json())
        reflection = resp.get_json()["reflection"]
        self.assertEqual(reflection["cook_log_id"], cook_log["id"])
        self.assertEqual(reflection["confidence"], "comfortable")
        self.assertTrue(reflection["practiced_skill_confirmed"])

        # A refresh must be able to resume this exact reflection.
        resp = self.client.get(f"/api/cook-log/{cook_log['id']}/reflection", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["outcome"], "happy")

    def test_confidence_via_reflection_updates_current_confidence(self):
        cook_log = self._log_cook()
        self.client.post("/api/reflections", json={
            "cook_log_id": cook_log["id"], "skill_slug": "simmering", "confidence": "wants_guidance",
        }, headers=self.headers)
        resp = self.client.get("/api/me/skills/simmering", headers=self.headers)
        self.assertEqual(resp.get_json()["confidence"], "wants_guidance")

    def test_later_direct_edit_never_rewrites_the_past_reflection(self):
        cook_log = self._log_cook()
        self.client.post("/api/reflections", json={
            "cook_log_id": cook_log["id"], "skill_slug": "simmering", "confidence": "comfortable",
        }, headers=self.headers)

        # A later, separate direct edit.
        resp = self.client.put("/api/me/skills/simmering", json={"confidence": "wants_guidance"}, headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["confidence"], "wants_guidance")

        # The past reflection's own recorded confidence is untouched.
        reflection = self.client.get(f"/api/cook-log/{cook_log['id']}/reflection", headers=self.headers).get_json()
        self.assertEqual(reflection["confidence"], "comfortable")

    def test_mechanical_retry_of_saved_reflection_does_not_reapply_stale_confidence(self):
        cook_log = self._log_cook()
        payload = {"cook_log_id": cook_log["id"], "skill_slug": "simmering", "confidence": "comfortable"}
        first = self.client.post("/api/reflections", json=payload, headers=self.headers)
        self.assertEqual(first.status_code, 201)

        # An independent later edit moves current confidence on.
        self.client.put("/api/me/skills/simmering", json={"confidence": "wants_guidance"}, headers=self.headers)

        # Now a *retry* of the exact same original reflection payload arrives late.
        retry = self.client.post("/api/reflections", json=payload, headers=self.headers)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.get_json()["status"], "already_saved")

        # Current confidence must still be the independently-edited value,
        # not reverted to the reflection's stale "comfortable".
        current = self.client.get("/api/me/skills/simmering", headers=self.headers).get_json()
        self.assertEqual(current["confidence"], "wants_guidance")

    def test_two_submissions_of_the_same_reflection_produce_one_row(self):
        cook_log = self._log_cook()
        payload = {"cook_log_id": cook_log["id"], "skill_slug": "simmering", "outcome": "happy"}
        self.client.post("/api/reflections", json=payload, headers=self.headers)
        self.client.post("/api/reflections", json=payload, headers=self.headers)
        with self.app.app_context():
            from models import CookReflection
            self.assertEqual(CookReflection.query.filter_by(cook_log_id=cook_log["id"]).count(), 1)

    def test_partial_edit_does_not_null_other_fields(self):
        cook_log = self._log_cook()
        self.client.post("/api/reflections", json={
            "cook_log_id": cook_log["id"], "skill_slug": "simmering",
            "outcome": "happy", "practiced_skill_confirmed": True, "confidence": "unknown",
        }, headers=self.headers)

        # Edit ONLY confidence.
        resp = self.client.post("/api/reflections", json={
            "cook_log_id": cook_log["id"], "confidence": "comfortable",
            "mutation_id": str(uuid.uuid4()), "expected_revision": 1,
        }, headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        reflection = resp.get_json()["reflection"]
        self.assertEqual(reflection["confidence"], "comfortable")
        self.assertEqual(reflection["outcome"], "happy", "an untouched field must survive a partial edit")
        self.assertTrue(reflection["practiced_skill_confirmed"], "an untouched field must survive a partial edit")

    def test_untouched_checkbox_never_submits_false(self):
        cook_log = self._log_cook()
        resp = self.client.post("/api/reflections", json={
            "cook_log_id": cook_log["id"], "outcome": "happy",  # practiced_skill_confirmed never sent
        }, headers=self.headers)
        self.assertIsNone(resp.get_json()["reflection"]["practiced_skill_confirmed"])

    def test_skip_leaves_no_reflection_row_at_all(self):
        cook_log = self._log_cook()
        resp = self.client.get(f"/api/cook-log/{cook_log['id']}/reflection", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["revision"], 0)
        with self.app.app_context():
            from models import CookReflection
            self.assertEqual(CookReflection.query.count(), 0, "context read must not create a row")

    def test_reflection_endpoint_requires_ownership(self):
        cook_log = self._log_cook()
        with self.app.app_context():
            other = make_user(self.db, email="other@example.com")
            other_headers = auth_header(self.app, other.id)
        resp = self.client.post("/api/reflections", json={"cook_log_id": cook_log["id"], "outcome": "happy"}, headers=other_headers)
        self.assertEqual(resp.status_code, 404)

    def test_legacy_cook_log_with_no_snapshot_id_still_supports_reflection(self):
        # Pre-#48/#35 style request: no snapshot_id at all.
        body = {"dish_slug": "lentil-bolognese", "level": "basic", "session_id": str(uuid.uuid4())}
        resp = self.client.post("/api/cook-log", json=body, headers=self.headers)
        cook_log = resp.get_json()["cook_log"]
        self.assertIsNone(cook_log["snapshot_id"], "a legacy/no-snapshot cook must degrade, never fabricate one")

        resp = self.client.post("/api/reflections", json={
            "cook_log_id": cook_log["id"], "outcome": "mixed",
        }, headers=self.headers)
        self.assertEqual(resp.status_code, 201, resp.get_json())


if __name__ == "__main__":
    unittest.main()
