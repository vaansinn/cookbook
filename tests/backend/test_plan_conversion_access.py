import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from helpers import make_app, make_user, make_tier, auth_header


class PlanConversionTest(unittest.TestCase):
    def setUp(self):
        self.app, self.db = make_app()
        from models import Household, HouseholdMember, MealPlan, MealPlanItem
        with self.app.app_context():
            user = make_user(self.db, plan="premium")
            self.uid = user.id
            household = Household(name="Synthetic household")
            self.db.session.add(household)
            self.db.session.flush()
            self.hid = household.id
            self.db.session.add(HouseholdMember(user_id=user.id, household_id=household.id))
            plan = MealPlan(user_id=user.id, name="Mixed tiers")
            self.db.session.add(plan)
            self.db.session.flush()
            self.pid = plan.id
            for slug, level in (("simple", "basic"), ("complex", "advanced")):
                _, tier = make_tier(self.db, slug, level)
                tier.ingredients = [{"text": slug, "qty_g": 100}]
                self.db.session.add(MealPlanItem(meal_plan_id=plan.id, dish_slug=slug, level=level))
            self.db.session.commit()
        self.client = self.app.test_client()
        self.headers = auth_header(self.app, self.uid)
        self.path = f"/api/meal-plans/{self.pid}/grocery-list"

    def downgrade(self):
        from models import User
        with self.app.app_context():
            self.db.session.get(User, self.uid).plan = "free"
            self.db.session.commit()

    def test_downgrade_rejected_before_creating_list(self):
        from models import GroceryList, GroceryItem
        self.downgrade()
        self.assertEqual(self.client.post(self.path, json={}, headers=self.headers).status_code, 403)
        with self.app.app_context():
            self.assertEqual(GroceryList.query.count(), 0)
            self.assertEqual(GroceryItem.query.count(), 0)

    def test_downgrade_does_not_partially_change_existing_list(self):
        from models import GroceryList, GroceryItem
        with self.app.app_context():
            lst = GroceryList(household_id=self.hid)
            self.db.session.add(lst)
            self.db.session.flush()
            self.db.session.add(GroceryItem(list_id=lst.id, text="keep", qty_g=42, checked=True))
            self.db.session.commit()
        self.downgrade()
        self.assertEqual(self.client.post(self.path, json={}, headers=self.headers).status_code, 403)
        with self.app.app_context():
            item = GroceryItem.query.one()
            self.assertEqual((item.text, item.qty_g, item.checked), ("keep", 42, True))

    def test_current_authorized_account_succeeds(self):
        response = self.client.post(self.path, json={"lang": "en"}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["added_recipes"], 2)

    def test_malformed_conversion_input_does_not_write(self):
        from models import GroceryList
        for data in ([], None, "wrong", {"lang": []}, {"lang": "xx"}):
            response = self.client.post(self.path, data=__import__("json").dumps(data), content_type="application/json", headers=self.headers)
            self.assertEqual(response.status_code, 400)
        with self.app.app_context():
            self.assertEqual(GroceryList.query.count(), 0)


if __name__ == "__main__":
    unittest.main()
