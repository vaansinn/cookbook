import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from flask import Flask

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts import auth_mail_sink


class LocalMailboxTest(unittest.TestCase):
    def test_local_delivery_is_file_only_and_production_is_refused(self):
        app = Flask(__name__)
        with tempfile.TemporaryDirectory() as folder, patch.object(auth_mail_sink, "INBOX", Path(folder)), app.app_context():
            for mode in (None, "testing", "production"):
                app.config["RUNTIME_ENV"] = mode
                with self.assertRaises(RuntimeError):
                    auth_mail_sink.local_mail_delivery(to="test@example.test", purpose="reset", token="synthetic")
            self.assertEqual(list(Path(folder).iterdir()), [])
            app.config["RUNTIME_ENV"] = "development"
            auth_mail_sink.local_mail_delivery(to="test@example.test", purpose="reset", token="synthetic-reset-code")
            files = list(Path(folder).glob("*.eml"))
            self.assertEqual(len(files), 1)
            message = files[0].read_text()
            self.assertIn("synthetic-reset-code", message)
            self.assertIn("not sent by email", message)


if __name__ == "__main__":
    unittest.main()
