import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("backend_runner", Path(__file__).resolve().parents[1] / "run_backend.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunnerIsolationTest(unittest.TestCase):
    def test_hostile_parent_configuration_is_not_inherited(self):
        parent = {"PATH": "runtime", "SystemRoot": "system", "DATABASE_URL": "production",
                  "JWT_SECRET_KEY": "private", "FLASK_ENV": "production", "CORS_ORIGINS": "*",
                  "MAX_CONTENT_LENGTH": "1", "PROXY_FIX_X_FOR": "bad", "PYTHONPATH": "other",
                  "PGHOST": "remote", "FRONTEND_URL": "https://wrong.invalid", "SECRET": "private"}
        env = runner.test_environment(parent, Path("disposable.db"))
        for key in ("CORS_ORIGINS", "MAX_CONTENT_LENGTH", "PROXY_FIX_X_FOR", "PYTHONPATH", "PGHOST", "SECRET", "FRONTEND_URL"):
            self.assertNotIn(key, env)
        self.assertEqual(env["DATABASE_URL"], "sqlite:///disposable.db")
        self.assertEqual(env["FLASK_SKIP_DOTENV"], "1")
        self.assertEqual(env["FLASK_ENV"], "development")
        self.assertNotEqual(env["JWT_SECRET_KEY"], parent["JWT_SECRET_KEY"])
        self.assertEqual(env["SystemRoot"], "system")
        self.assertEqual(parent["DATABASE_URL"], "production")


if __name__ == "__main__":
    unittest.main()
