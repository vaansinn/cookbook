"""Integration regressions for retained content, mutation identity and privacy."""
import os
import sys
import threading
import unittest
import uuid
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))
from helpers import make_app, make_user, make_tier, make_lesson, auth_header


class HardeningTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        with self.app.app_context():
            user = make_user(self.db)
            self.uid = user.id
            make_tier(self.db, "lentil-bolognese", "basic", "en", steps=[{"id": "simmer", "text": "Simmer."}])
            make_lesson(self.db, "simmering", "simmering", "lentil-bolognese", "basic", "simmer")
        self.client = self.app.test_client()
        self.headers = auth_header(self.app, self.uid)
        self.ref = {"dish_slug": "lentil-bolognese", "level": "basic", "lang": "en"}
        self.snap = self.client.post("/api/recipe-snapshot", json=self.ref).get_json()
        result = self.client.post("/api/cook-log", json={**self.ref, "session_id": str(uuid.uuid4()), "snapshot_id": self.snap["snapshot_id"]}, headers=self.headers)
        self.cook = result.get_json()["cook_log"]

    def payload(self, revision=0, **fields):
        return {"cook_log_id": self.cook["id"], "mutation_id": str(uuid.uuid4()), "expected_revision": revision, **fields}

    def post(self, data):
        return self.client.post("/api/reflections", json=data, headers=self.headers)

    def test_content_changes_create_new_snapshot_and_old_help_survives(self):
        from models import Lesson
        self.assertEqual(self.snap["content"]["schema_version"], 2)
        with self.app.app_context():
            Lesson.query.first().body = {"en": "New instructions", "de": "Neu"}
            self.db.session.commit()
        new = self.client.post("/api/recipe-snapshot", json=self.ref).get_json()
        self.assertNotEqual(new["snapshot_id"], self.snap["snapshot_id"])
        old = self.client.get(f'/api/recipe-snapshot/{self.snap["snapshot_id"]}', query_string=self.ref).get_json()
        self.assertEqual(old["content"], self.snap["content"])

    def test_broken_link_fails_capture_not_empty_pin(self):
        from models import Lesson
        with self.app.app_context():
            Lesson.query.first().step_id = "missing"
            self.db.session.commit()
        self.assertEqual(self.client.post("/api/recipe-snapshot", json=self.ref).status_code, 503)

    def test_unannotated_structured_steps_remain_supported(self):
        with self.app.app_context():
            make_tier(self.db, "legacy-prose", "basic", "en", steps=[{"id": None, "text": "Bake."}])
        response = self.client.post("/api/recipe-snapshot", json={**self.ref, "dish_slug": "legacy-prose"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["content"]["steps"], [{"id": None, "text": "Bake."}])
        self.assertEqual(response.get_json()["content"]["lessons"], {})

    def test_unrelated_skill_is_rejected(self):
        self.assertEqual(self.post(self.payload(skill_slug="other", practiced_skill_confirmed=True)).status_code, 400)

    def test_stale_retry_does_not_overwrite_correction(self):
        original = self.payload(confidence="comfortable")
        first = self.post(original)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(self.post(self.payload(1, confidence="wants_guidance")).status_code, 200)
        replay = self.post(original)
        self.assertEqual(replay.get_json(), first.get_json())
        current = self.client.get("/api/me/skills/simmering", headers=self.headers).get_json()
        self.assertEqual(current["confidence"], "wants_guidance")
        self.assertEqual(self.post(self.payload(0, outcome="happy")).status_code, 409)
        self.assertEqual(self.post({**original, "confidence": "unknown"}).status_code, 409)

    def test_unversioned_edits_cannot_overwrite_history(self):
        p = {"cook_log_id": self.cook["id"], "outcome": "happy"}
        self.assertEqual(self.post(p).status_code, 201)
        self.assertEqual(self.post(p).status_code, 200)
        self.assertEqual(self.post({**p, "outcome": "mixed"}).status_code, 409)

    def test_atomic_rollback_includes_reflection_confidence_and_receipt(self):
        from models import CookReflection, SkillConfidence, ReflectionMutation
        with patch("routes.reflections._set_confidence", side_effect=ValueError("injected failure")):
            self.assertEqual(self.post(self.payload(confidence="comfortable")).status_code, 409)
        with self.app.app_context():
            self.assertEqual([CookReflection.query.count(), SkillConfidence.query.count(), ReflectionMutation.query.count()], [0, 0, 0])

    def test_concurrent_mutation_replays_one_result(self):
        from models import CookReflection, ReflectionMutation
        payload = self.payload(confidence="comfortable")
        barrier = threading.Barrier(2)
        results = []
        def run():
            with self.app.test_client() as client:
                barrier.wait(5)
                response = client.post("/api/reflections", json=payload, headers=self.headers)
                results.append((response.status_code, response.get_json()))
        threads = [threading.Thread(target=run) for _ in range(2)]
        for thread in threads: thread.start()
        for thread in threads: thread.join(10)
        self.assertEqual(len(results), 2)
        self.assertEqual(sorted(r[0] for r in results), [200, 201])
        self.assertEqual(results[0][1], results[1][1])
        with self.app.app_context():
            self.assertEqual(CookReflection.query.count(), 1)
            self.assertEqual(ReflectionMutation.query.count(), 1)

    def test_validation_and_empty_submission(self):
        from models import CookReflection
        for fields in ({"outcome": "x" * 100}, {"confidence": []}, {"practiced_skill_confirmed": 1}, {"cook_log_id": True}):
            self.assertEqual(self.post(self.payload(**fields)).status_code, 400)
        self.assertEqual(self.client.post("/api/reflections", json=[], headers=self.headers).status_code, 400)
        self.assertEqual(self.post(self.payload()).get_json()["status"], "skipped")
        with self.app.app_context(): self.assertEqual(CookReflection.query.count(), 0)

    def test_partial_clear_does_not_change_independent_confidence(self):
        self.post(self.payload(outcome="happy", practiced_skill_confirmed=True, confidence="comfortable"))
        result = self.post(self.payload(1, outcome=None)).get_json()["reflection"]
        self.assertIsNone(result["outcome"])
        self.assertTrue(result["practiced_skill_confirmed"])
        self.post(self.payload(2, confidence=None))
        self.assertEqual(self.client.get("/api/me/skills/simmering", headers=self.headers).get_json()["confidence"], "comfortable")

    def test_legacy_snapshot_cannot_invent_practice(self):
        from models import RecipeContentSnapshot
        with self.app.app_context():
            row = self.db.session.get(RecipeContentSnapshot, self.snap["snapshot_id"])
            # Fixture representing an immutable row captured by the old release.
            row.content = {"steps": ["Old prose"]}
            self.db.session.commit()
        self.assertEqual(self.post(self.payload(practiced_skill_confirmed=True)).status_code, 400)
        self.assertEqual(self.post(self.payload(outcome="happy")).status_code, 201)

    def test_missing_target_translation_omits_suggestion(self):
        from models import Lesson
        with self.app.app_context():
            make_tier(self.db, "target", "basic", "de")
            lesson = Lesson.query.first()
            lesson.next_practice_dish_slug = "target"
            lesson.next_practice_level = "basic"
            self.db.session.commit()
        result = self.client.get("/api/lessons/simmering?lang=en").get_json()
        self.assertIsNone(result["next_practice"])

    def test_export_links_and_delete_cascade(self):
        from models import ReflectionMutation, CookReflection, SkillConfidence
        self.post(self.payload(confidence="comfortable"))
        export = self.client.get("/api/auth/me/export", headers=self.headers).get_json()
        self.assertEqual(export["cook_logs"][0]["id"], export["cook_reflections"][0]["cook_log_id"])
        self.assertEqual(export["cook_logs"][0]["snapshot_id"], self.snap["snapshot_id"])
        self.assertEqual(self.client.delete("/api/auth/me", headers=self.headers).status_code, 200)
        with self.app.app_context():
            self.assertEqual([ReflectionMutation.query.count(), CookReflection.query.count(), SkillConfidence.query.count()], [0, 0, 0])


if __name__ == "__main__": unittest.main()
