"""
Regression test — Fix 5: scripts/sync_learning.py's sync_lessons must require
BOTH en.md and de.md for a lesson slug before writing anything, and must never
overwrite a previously-complete bilingual Lesson row with a partial one.

Uses its own temp content/lessons/<slug>/ fixture - never touches the real
content/lessons/simmering/de.md fixture the task explicitly says not to break.

Run: python3 tests/backend/test_fix5_sync_requires_both_languages.py
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import make_app, make_tier  # noqa: E402

LESSON_SLUG = "test-searing"

EN_MD = """---
skill: searing
dish_slug: test-dish
level: basic
lang: en
step_id: sear-step
title: "Searing"
---
English body text about searing.
"""

DE_MD = """---
skill: searing
dish_slug: test-dish
level: basic
lang: de
step_id: sear-step
title: "Anbraten"
---
Deutscher Text uebers Anbraten.
"""


class SyncRequiresBothLanguagesTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        with self.app.app_context():
            make_tier(self.db, "test-dish", "basic", "en", steps=[{"id": "sear-step", "text": "Sear the meat."}])
            make_tier(self.db, "test-dish", "basic", "de", steps=[{"id": "sear-step", "text": "Fleisch anbraten."}])

        self.tmp_content_dir = tempfile.mkdtemp()
        self.lessons_dir = os.path.join(self.tmp_content_dir, "lessons")
        self.lesson_dir = os.path.join(self.lessons_dir, LESSON_SLUG)
        os.makedirs(self.lesson_dir)
        self._write_lesson(en=True, de=True)

        import scripts.sync_learning as sync_learning
        self.sync_learning = sync_learning
        self._orig_lessons_dir = sync_learning.LESSONS_DIR
        sync_learning.LESSONS_DIR = self.lessons_dir

    def tearDown(self):
        self.sync_learning.LESSONS_DIR = self._orig_lessons_dir
        shutil.rmtree(self.tmp_content_dir, ignore_errors=True)

    def _write_lesson(self, en, de):
        en_path = os.path.join(self.lesson_dir, "en.md")
        de_path = os.path.join(self.lesson_dir, "de.md")
        if en:
            with open(en_path, "w", encoding="utf-8") as f:
                f.write(EN_MD)
        elif os.path.exists(en_path):
            os.remove(en_path)
        if de:
            with open(de_path, "w", encoding="utf-8") as f:
                f.write(DE_MD)
        elif os.path.exists(de_path):
            os.remove(de_path)

    def test_full_bilingual_sync_succeeds(self):
        with self.app.app_context():
            from models import Skill, Lesson, RecipeTier
            self.sync_learning.sync_lessons(self.db, Skill, Lesson, RecipeTier, verbose=lambda *a: None)
            lesson = Lesson.query.filter_by(slug=LESSON_SLUG).first()
            self.assertIsNotNone(lesson)
            self.assertEqual(set(lesson.title.keys()), {"en", "de"})

    def test_missing_german_aborts_sync_with_clear_error(self):
        with self.app.app_context():
            from models import Skill, Lesson, RecipeTier
            # First, a real complete bilingual sync (so there IS a previously-
            # complete row that a later partial sync must not clobber).
            self.sync_learning.sync_lessons(self.db, Skill, Lesson, RecipeTier, verbose=lambda *a: None)

        # Now break it: remove de.md, leaving only en.md.
        self._write_lesson(en=True, de=False)

        with self.app.app_context():
            from models import Skill, Lesson, RecipeTier
            with self.assertRaises(self.sync_learning.SyncError) as cm:
                self.sync_learning.sync_lessons(self.db, Skill, Lesson, RecipeTier, verbose=lambda *a: None)
            message = str(cm.exception)
            self.assertIn(LESSON_SLUG, message, "error must name the broken lesson slug")
            self.assertIn("de", message, "error must name the missing language")

            # The previously-synced bilingual row must be completely untouched.
            lesson = Lesson.query.filter_by(slug=LESSON_SLUG).first()
            self.assertIsNotNone(lesson)
            self.assertEqual(set(lesson.title.keys()), {"en", "de"}, "aborted resync must not overwrite the existing bilingual row")
            self.assertEqual(lesson.title["de"], "Anbraten")
            self.assertEqual(lesson.body["de"].strip(), "Deutscher Text uebers Anbraten.")


if __name__ == "__main__":
    unittest.main()
