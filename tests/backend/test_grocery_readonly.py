"""GET safety before enabling cookie-authenticated legacy grocery routes."""
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


class GroceryReadOnlyTest(unittest.TestCase):
    def test_reading_empty_household_does_not_create_a_list(self):
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite:///:memory:",
                "FLASK_ENV": "development", "FLASK_SKIP_DOTENV": "1",
                "JWT_SECRET_KEY": "synthetic-grocery-readonly-test-key"}):
            from app import create_app, db
            from flask_jwt_extended import create_access_token
            from models import User, Household, HouseholdMember, GroceryList
            app = create_app()
            app.config["TESTING"] = True
            with app.app_context():
                db.create_all()
                user = User(email="readonly@example.test", password_hash="not-a-login")
                household = Household(name="Read-only test")
                db.session.add_all([user, household])
                db.session.flush()
                db.session.add(HouseholdMember(user_id=user.id, household_id=household.id, role="owner"))
                db.session.commit()
                headers = {"Authorization": "Bearer " + create_access_token(identity=str(user.id))}
                response = app.test_client().get("/api/grocery-list", headers=headers)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json, {"items": []})
                self.assertEqual(GroceryList.query.count(), 0)
                db.session.remove()
                db.engine.dispose()


if __name__ == "__main__":
    unittest.main()
