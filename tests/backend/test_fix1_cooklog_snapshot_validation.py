"""
Regression test — Fix 1: routes/progress.py's log_cook must reject a
snapshot_id that doesn't belong to the request's own (dish_slug, level, lang).

Reproduces the reported bug: a Basic-tier cook-log request referencing a real
Advanced-tier snapshot_id was accepted with zero validation. Also confirms the
legacy path (no snapshot_id sent at all) is untouched.

Run: python3 tests/backend/test_fix1_cooklog_snapshot_validation.py
"""
import os
import sys
import unittest
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import make_app, make_user, make_tier, auth_header  # noqa: E402


class LogCookSnapshotValidationTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        with self.app.app_context():
            user = make_user(self.db)
            self.user_id = user.id
            make_tier(self.db, "lentil-bolognese", "basic", "en", steps=["Simmer."])
            make_tier(self.db, "lentil-bolognese", "advanced", "en", steps=["Sear.", "Deglaze."])

            from snapshots import capture_or_reuse_snapshot
            basic_snap, err = capture_or_reuse_snapshot("lentil-bolognese", "basic", "en")
            self.assertIsNone(err)
            self.basic_snap_id = basic_snap.id
            advanced_snap, err = capture_or_reuse_snapshot("lentil-bolognese", "advanced", "en")
            self.assertIsNone(err)
            self.advanced_snap_id = advanced_snap.id

        self.headers = auth_header(self.app, self.user_id)
        self.client = self.app.test_client()

    def test_snapshot_id_from_a_different_tier_is_rejected(self):
        body = {
            "dish_slug": "lentil-bolognese",
            "level": "basic",
            "lang": "en",
            "session_id": str(uuid.uuid4()),
            "snapshot_id": self.advanced_snap_id,  # wrong tier for this basic-level request
        }
        resp = self.client.post("/api/cook-log", json=body, headers=self.headers)
        self.assertEqual(resp.status_code, 400, resp.get_json())

        with self.app.app_context():
            from models import CookLog
            self.assertEqual(CookLog.query.count(), 0, "the bad snapshot_id must never reach a CookLog row")

    def test_snapshot_id_matching_the_request_tier_is_accepted(self):
        body = {
            "dish_slug": "lentil-bolognese",
            "level": "basic",
            "lang": "en",
            "session_id": str(uuid.uuid4()),
            "snapshot_id": self.basic_snap_id,
        }
        resp = self.client.post("/api/cook-log", json=body, headers=self.headers)
        self.assertEqual(resp.status_code, 201, resp.get_json())
        self.assertEqual(resp.get_json()["cook_log"]["snapshot_id"], self.basic_snap_id)

    def test_nonexistent_snapshot_id_is_rejected(self):
        body = {
            "dish_slug": "lentil-bolognese",
            "level": "basic",
            "lang": "en",
            "session_id": str(uuid.uuid4()),
            "snapshot_id": 999999,
        }
        resp = self.client.post("/api/cook-log", json=body, headers=self.headers)
        self.assertEqual(resp.status_code, 400, resp.get_json())

    def test_legacy_request_with_no_snapshot_id_still_works(self):
        body = {
            "dish_slug": "lentil-bolognese",
            "level": "basic",
            "lang": "en",
            "session_id": str(uuid.uuid4()),
            # no snapshot_id at all - un-upgraded client
        }
        resp = self.client.post("/api/cook-log", json=body, headers=self.headers)
        self.assertEqual(resp.status_code, 201, resp.get_json())
        self.assertIsNone(resp.get_json()["cook_log"]["snapshot_id"])


if __name__ == "__main__":
    unittest.main()
