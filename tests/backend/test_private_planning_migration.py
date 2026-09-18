"""Pure mock tests of schema downgrade guards, not database execution evidence."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("private_migration", ROOT / "migrations/versions/a631b209ef40_private_planning_foundation.py")
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


class PrivateMigrationGuardTest(unittest.TestCase):
    def test_populated_workspace_refuses_before_any_drop(self):
        with patch.object(migration, "op") as op:
            op.get_bind.return_value.execute.return_value.scalar.return_value = True
            with self.assertRaisesRegex(RuntimeError, "destructive downgrade refused"):
                migration.downgrade()
            op.drop_table.assert_not_called()
            self.assertIn("planning_workspaces", str(op.get_bind.return_value.execute.call_args.args[0]))

    def test_empty_workspace_drops_only_new_tables_in_dependency_order(self):
        with patch.object(migration, "op") as op:
            op.get_bind.return_value.execute.return_value.scalar.return_value = False
            migration.downgrade()
            self.assertEqual([call.args[0] for call in op.drop_table.call_args_list],
                             ["planning_mutations", "private_meals", "private_plans", "planning_workspaces"])
        self.assertEqual(migration.down_revision, "f027a841d110")


if __name__ == "__main__":
    unittest.main()
