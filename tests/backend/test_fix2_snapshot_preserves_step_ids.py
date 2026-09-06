"""
Regression test — Fix 2: capturing a snapshot must preserve structured
{"id","text"} steps, not flatten them through RecipeTier._step_text() first.

Reproduces the reported bug: capture_or_reuse_snapshot used to call
tier.to_dict(full=True), which always ran every step through _step_text()
before returning - so a snapshot's content.steps lost the step_id
permanently at capture time. Also confirms every OTHER existing caller of
to_dict() (routes/recipes.py -> RecipePage.jsx/RecipesPage, and seo.py's own
direct _step_text() use) is completely unaffected - still plain strings.

Run: python3 tests/backend/test_fix2_snapshot_preserves_step_ids.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import make_app, make_tier  # noqa: E402

STRUCTURED_STEP = {"id": "rinse-and-simmer", "text": "Rinse the lentils and simmer for 15 minutes."}
LEGACY_STEP = "Serve hot with crusty bread."


class SnapshotStepIdTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        with self.app.app_context():
            dish, tier = make_tier(
                self.db, "lentil-bolognese", "basic", "en",
                steps=[STRUCTURED_STEP, LEGACY_STEP],
            )
            self.tier_id = tier.id

    def test_snapshot_content_keeps_structured_step_ids(self):
        with self.app.app_context():
            from snapshots import capture_or_reuse_snapshot
            snapshot, err = capture_or_reuse_snapshot("lentil-bolognese", "basic", "en")
            self.assertIsNone(err)
            steps = snapshot.content["steps"]
            self.assertEqual(steps[0], STRUCTURED_STEP, "structured step must survive capture with its id intact")
            self.assertEqual(steps[1], LEGACY_STEP, "a plain-string legacy step is captured as-is either way")

    def test_default_to_dict_is_unaffected_still_flattens(self):
        # Every OTHER caller of RecipeTier.to_dict() (routes/recipes.py,
        # and therefore RecipePage.jsx/RecipesPage) must keep getting plain
        # strings, completely unchanged by the new raw_steps parameter.
        with self.app.app_context():
            from models import RecipeTier
            tier = RecipeTier.query.get(self.tier_id)
            d = tier.to_dict(full=True)
            self.assertEqual(d["steps"][0], STRUCTURED_STEP["text"])
            self.assertEqual(d["steps"][1], LEGACY_STEP)
            self.assertIsInstance(d["steps"][0], str)

    def test_seo_module_still_gets_plain_step_text(self):
        with self.app.app_context():
            from models import RecipeTier
            tier = RecipeTier.query.get(self.tier_id)
            # seo.py's own JSON-LD builder calls tier._step_text(s) directly.
            texts = [tier._step_text(s) for s in tier.steps]
            self.assertEqual(texts, [STRUCTURED_STEP["text"], LEGACY_STEP])

    def test_recipes_api_endpoint_still_returns_plain_strings(self):
        # The actual HTTP path RecipePage.jsx/RecipesPage consume.
        client = self.app.test_client()
        resp = client.get("/api/dishes/lentil-bolognese?lang=en")
        self.assertEqual(resp.status_code, 200, resp.get_json())
        steps = resp.get_json()["tiers"]["basic"]["steps"]
        self.assertEqual(steps, [STRUCTURED_STEP["text"], LEGACY_STEP])
        self.assertTrue(all(isinstance(s, str) for s in steps))


if __name__ == "__main__":
    unittest.main()
