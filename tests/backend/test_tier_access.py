import sys
from pathlib import Path
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from access import tier_access


class TierAccessTest(unittest.TestCase):
    def test_existing_access_contract(self):
        free, premium = SimpleNamespace(plan="free"), SimpleNamespace(plan="premium")
        self.assertEqual(tier_access("basic", None), (True, None))
        self.assertEqual(tier_access("intermediate", None), (False, "account"))
        self.assertEqual(tier_access("intermediate", free), (True, None))
        self.assertEqual(tier_access("advanced", free), (False, "premium"))
        self.assertEqual(tier_access("advanced", premium), (True, None))

    def test_unknown_values_fail_closed(self):
        for level in (None, "", "Basic", "unknown", [], {}, 1, True):
            for user in (None, SimpleNamespace(plan="premium")):
                self.assertEqual(tier_access(level, user), (False, "invalid_tier"))


if __name__ == "__main__":
    unittest.main()
