"""
Step 3c — routes/lessons.py: tier gating, language fallback, next-practice
filtering (docs/contracts/pilot-fixtures.md §11).

Run: python3 tests/backend/test_step3c_lessons_api.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import make_app, make_user, make_tier, make_lesson, auth_header  # noqa: E402


class LessonsApiTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        with self.app.app_context():
            make_tier(self.db, "lentil-bolognese", "basic", "en",
                      steps=[{"id": "rinse-and-simmer", "text": "Simmer."}], title="Lentil Bolognese")
            make_tier(self.db, "lentil-bolognese", "advanced", "en",
                      steps=[{"id": "sear-step", "text": "Sear."}], title="Lentil Bolognese (advanced)")
            make_tier(self.db, "eggs-benedict", "basic", "en", steps=["Poach."], title="Eggs Benedict")
            make_lesson(
                self.db, "simmering", "simmering", "lentil-bolognese", "basic", "rinse-and-simmer",
                next_practice=("eggs-benedict", "basic", "Try a bare simmer.", "Ein leises Koecheln."),
            )
            make_lesson(self.db, "searing", "searing", "lentil-bolognese", "advanced", "sear-step")
        self.client = self.app.test_client()

    def test_lookup_by_slug(self):
        resp = self.client.get("/api/lessons/simmering?lang=en")
        self.assertEqual(resp.status_code, 200, resp.get_json())
        body = resp.get_json()
        self.assertEqual(body["step_id"], "rinse-and-simmer")
        self.assertEqual(body["dish_slug"], "lentil-bolognese")

    def test_lookup_by_ref_resolves_the_same_lesson(self):
        by_slug = self.client.get("/api/lessons/simmering?lang=en").get_json()
        by_ref = self.client.get(
            "/api/lessons/by-ref",
            query_string={"dish_slug": "lentil-bolognese", "level": "basic", "lang": "en", "step_id": "rinse-and-simmer"},
        ).get_json()
        self.assertEqual(by_slug["slug"], by_ref["slug"])
        self.assertEqual(by_slug["body"], by_ref["body"])

    def test_by_ref_missing_step_returns_404_not_a_guess(self):
        resp = self.client.get(
            "/api/lessons/by-ref",
            query_string={"dish_slug": "lentil-bolognese", "level": "basic", "lang": "en", "step_id": "no-such-step"},
        )
        self.assertEqual(resp.status_code, 404)

    def test_language_gap_falls_back_to_en_never_404s(self):
        # Only en/de were authored above (both, in fact) - force a genuine
        # gap by asking for a language the lesson has no content in at all.
        with self.app.app_context():
            from models import Lesson
            lesson = Lesson.query.filter_by(slug="simmering").first()
            lesson.title = {"en": "Simmering"}
            lesson.body = {"en": "Simmer body"}
            self.db.session.commit()
        resp = self.client.get("/api/lessons/simmering?lang=de")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["body"], "Simmer body")
        self.assertEqual(resp.get_json()["lang"], "en")

    def test_advanced_lesson_needs_premium_guest_gets_403(self):
        resp = self.client.get("/api/lessons/searing?lang=en")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.get_json()["code"], "needs_account")

    def test_advanced_lesson_needs_premium_free_account_gets_403(self):
        with self.app.app_context():
            user = make_user(self.db, plan="free")
            headers = auth_header(self.app, user.id)
        resp = self.client.get("/api/lessons/searing?lang=en", headers=headers)
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.get_json()["code"], "needs_premium")

    def test_advanced_lesson_readable_by_premium_account(self):
        with self.app.app_context():
            user = make_user(self.db, email="premium@example.com", plan="premium")
            headers = auth_header(self.app, user.id)
        resp = self.client.get("/api/lessons/searing?lang=en", headers=headers)
        self.assertEqual(resp.status_code, 200, resp.get_json())

    def test_next_practice_included_when_eligible(self):
        resp = self.client.get("/api/lessons/simmering?lang=en")
        self.assertEqual(resp.get_json()["next_practice"]["dish_slug"], "eggs-benedict")

    def test_next_practice_omitted_when_requester_cant_open_it(self):
        # Repoint next_practice at an advanced-only dish a guest can't open.
        with self.app.app_context():
            from models import Lesson
            lesson = Lesson.query.filter_by(slug="simmering").first()
            lesson.next_practice_dish_slug = "lentil-bolognese"
            lesson.next_practice_level = "advanced"
            self.db.session.commit()
        resp = self.client.get("/api/lessons/simmering?lang=en")
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.get_json()["next_practice"], "must be omitted, never a locked tile or broken link")

    def test_next_practice_present_for_a_requester_who_can_open_the_advanced_target(self):
        with self.app.app_context():
            from models import Lesson
            lesson = Lesson.query.filter_by(slug="simmering").first()
            lesson.next_practice_dish_slug = "lentil-bolognese"
            lesson.next_practice_level = "advanced"
            self.db.session.commit()
            user = make_user(self.db, email="premium2@example.com", plan="premium")
            headers = auth_header(self.app, user.id)
        resp = self.client.get("/api/lessons/simmering?lang=en", headers=headers)
        self.assertEqual(resp.get_json()["next_practice"]["level"], "advanced")


if __name__ == "__main__":
    unittest.main()
