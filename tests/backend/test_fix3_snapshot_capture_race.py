"""
Regression test — Fix 3: capture_or_reuse_snapshot's pre-check + insert isn't
atomic, so two near-simultaneous captures of identical unchanged content used
to be able to both see "no existing row", then the second commit raised an
uncaught IntegrityError (uncaught 500) on the unique
(dish_slug, level, lang, content_digest) constraint.

To reproduce the race deterministically (not "hope threads interleave"), this
patches sqlalchemy.orm.Query.filter_by with a version that puts a
threading.Barrier in front of ONLY the snapshot pre-check query (identified by
its content_digest kwarg - the one filter_by call this function makes that no
other query in the codepath uses) so two threads are guaranteed to both
observe "not found" before either inserts, then are released together into
the real insert/commit race.

Run: python3 tests/backend/test_fix3_snapshot_capture_race.py
"""
import os
import sys
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import make_app, make_tier  # noqa: E402

from sqlalchemy.orm import Query  # noqa: E402


class SnapshotCaptureRaceTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        with self.app.app_context():
            make_tier(self.db, "lentil-bolognese", "basic", "en", steps=["Simmer for 15 minutes."])

    def test_two_concurrent_captures_of_new_content_produce_exactly_one_row(self):
        barrier = threading.Barrier(2)
        lock = threading.Lock()
        state = {"hits": 0}
        orig_filter_by = Query.filter_by

        def racy_filter_by(self_, **kwargs):
            # Only the first two content_digest-keyed filter_by calls are the
            # two threads' initial pre-check (the ones that must race) - a
            # third such call is the fixed code's own post-IntegrityError
            # re-query recovering from the race, which must NOT be blocked
            # again (it needs to see the winner's already-committed row).
            if "content_digest" in kwargs:
                with lock:
                    state["hits"] += 1
                    should_wait = state["hits"] <= 2
                if should_wait:
                    try:
                        barrier.wait(timeout=5)
                    except threading.BrokenBarrierError:
                        pass
            return orig_filter_by(self_, **kwargs)

        results = {}

        def worker(idx):
            with self.app.app_context():
                from snapshots import capture_or_reuse_snapshot
                try:
                    row, err = capture_or_reuse_snapshot("lentil-bolognese", "basic", "en")
                    results[idx] = (row.id if row else None, err)
                except Exception as e:  # the pre-fix bug: an uncaught IntegrityError -> 500
                    results[idx] = ("EXCEPTION", repr(e))

        Query.filter_by = racy_filter_by
        try:
            threads = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=10)
        finally:
            Query.filter_by = orig_filter_by

        self.assertGreaterEqual(state["hits"], 2, "both threads must have raced through the same pre-check")
        for idx, (row_id, err) in results.items():
            self.assertNotEqual(row_id, "EXCEPTION", f"thread {idx} raised instead of resolving: {err}")
            self.assertIsNone(err, f"thread {idx} got an error code: {err}")

        ids = {results[0][0], results[1][0]}
        self.assertEqual(len(ids), 1, f"both concurrent captures must resolve to the SAME row, got {ids}")

        with self.app.app_context():
            from models import RecipeContentSnapshot
            count = RecipeContentSnapshot.query.filter_by(
                dish_slug="lentil-bolognese", level="basic", lang="en"
            ).count()
            self.assertEqual(count, 1, "exactly one snapshot row must exist, no duplicate")


if __name__ == "__main__":
    unittest.main()
