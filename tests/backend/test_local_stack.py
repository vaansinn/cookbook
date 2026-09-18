"""Static local stack contract; no Docker, database or environment access."""
from pathlib import Path
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]


class LocalStackTest(unittest.TestCase):
    def test_development_and_disposable_clusters_have_separate_storage_and_ports(self):
        source = (ROOT / "compose.local.yaml").read_text(encoding="utf-8")
        self.assertNotIn("${", source)
        config = yaml.safe_load(source)
        self.assertEqual(config["name"], "cookbook-local")
        dev, verification = (config["services"][key] for key in ("database", "verification"))
        self.assertEqual(dev["ports"], ["127.0.0.1:55433:5432"])
        self.assertEqual(verification["ports"], ["127.0.0.1:55432:5432"])
        self.assertEqual(dev["volumes"], ["development-data:/var/lib/postgresql/data"])
        self.assertNotIn("volumes", verification)
        self.assertEqual(verification["tmpfs"], ["/var/lib/postgresql/data"])
        self.assertEqual(verification["profiles"], ["verification"])
        self.assertNotEqual(dev["environment"]["POSTGRES_USER"], verification["environment"]["POSTGRES_USER"])
        for service in (dev, verification):
            self.assertEqual(service["image"], "postgres:16.15-bookworm")
            self.assertEqual(service["restart"], "no")
            self.assertNotIn("privileged", service)


if __name__ == "__main__":
    unittest.main()
