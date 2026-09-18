"""Signed credentials must identify a current account, including optional auth."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))
from helpers import make_app, make_user, make_tier, auth_header


class AuthIdentityTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        with self.app.app_context():
            self.uid = make_user(self.db).id
            make_tier(self.db, "identity-dish", "basic")
        self.client = self.app.test_client()

    def headers(self, subject):
        from flask_jwt_extended import create_access_token
        with self.app.app_context():
            token = create_access_token(identity=subject)
        return {"Authorization": "Bearer " + token}

    def test_invalid_signed_subjects_never_reach_protected_routes(self):
        for subject in ("garbage", "0", "-1", "1.0", "01", " 1", "١", "9" * 100, "2147483648"):
            for path in ("/api/auth/me", "/api/favorites", "/api/dishes/identity-dish"):
                with self.subTest(subject=subject, path=path):
                    response = self.client.get(path, headers=self.headers(subject))
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(response.get_json()["code"], "invalid_session")

    def test_deleted_account_token_cannot_read_or_write(self):
        headers = auth_header(self.app, self.uid)
        from models import User
        with self.app.app_context():
            self.db.session.delete(self.db.session.get(User, self.uid))
            self.db.session.commit()
        for method, path in (("get", "/api/favorites"), ("get", "/api/auth/me/export"),
                             ("post", "/api/reflections"), ("post", "/api/cook-log"),
                             ("get", "/api/dishes/identity-dish")):
            with self.subTest(path=path):
                response = getattr(self.client, method)(path, headers=headers)
                self.assertEqual(response.status_code, 401)

    def test_valid_account_and_tokenless_guest_remain_supported(self):
        response = self.client.get("/api/auth/me", headers=auth_header(self.app, self.uid))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["id"], self.uid)
        self.assertEqual(self.client.get("/api/dishes/identity-dish").status_code, 200)
        self.assertEqual(self.client.get("/api/favorites").status_code, 401)

    def test_lookup_outage_is_retryable_and_does_not_expose_details(self):
        from sqlalchemy.exc import OperationalError
        headers = auth_header(self.app, self.uid)
        with patch.object(self.db.session, "get", side_effect=OperationalError("private-sql", {}, Exception("secret"))):
            response = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("secret", response.get_data(as_text=True))
        self.assertNotIn("private-sql", response.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
