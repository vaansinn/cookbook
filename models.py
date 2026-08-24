"""
models.py — SQLAlchemy database models.

Table overview:
  users             — registered accounts
  dishes            — one row per dish concept (slug, cuisine, meal type, methods)
  recipe_tiers      — one row per (dish, difficulty level, language) — the actual
                      recipe content, including nutrition computed at sync time
  food_items        — per-100g nutrition lookup, keyed by slug; ingredient lines in
                      recipe markdown reference these via a `food:<slug>` tag so
                      nutrition is always derived, never hand-typed (see
                      scripts/sync_recipes.py)
  households        — a shared grocery list + planner belongs to a household, not
                      a user, so it can be shared between accounts
  household_members — join table, user <-> household
  grocery_lists     — one active list per household (kept to one for now — no
                      per-week lists yet, see PIPELINE.md)
  grocery_items     — items on a list; food_slug-linked items merge by weight
                      when the same ingredient is added from more than one recipe
  plan_entries      — week planner: a dish+tier assigned to a date
"""

from app import db
from datetime import datetime
import secrets


class User(db.Model):
    __tablename__ = "users"
    id            = db.Column(db.Integer, primary_key=True)
    email         = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    display_name  = db.Column(db.String(100))
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    # Free tier is always Basic-only; paid unlocks Intermediate/Advanced.
    # Whether/when that gate actually gets enforced is still open (see blueprint P6).
    plan = db.Column(db.String(20), default="free", nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "display_name": self.display_name,
            "plan": self.plan,
        }


class Dish(db.Model):
    __tablename__ = "dishes"
    id         = db.Column(db.Integer, primary_key=True)
    slug       = db.Column(db.String(80), unique=True, nullable=False)
    cuisine    = db.Column(db.String(80))
    meal_type  = db.Column(db.String(40))          # breakfast | lunch | dinner | snack
    methods    = db.Column(db.JSON, default=list)  # e.g. ["stovetop"], ["baking", "grill"]
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    tiers = db.relationship("RecipeTier", backref="dish", cascade="all, delete-orphan")

    def to_dict(self, lang="en"):
        by_level = {t.level: t for t in self.tiers if t.lang == lang}
        return {
            "slug": self.slug,
            "cuisine": self.cuisine,
            "meal_type": self.meal_type,
            "methods": self.methods or [],
            "tiers_available": sorted(by_level.keys(), key=lambda l: ["basic", "intermediate", "advanced"].index(l)),
            # Summary card fields come from whichever tier exists, cheapest-first,
            # so the browse grid always has something to show even if only one
            # tier/language has been written for this dish yet.
            "summary": (by_level.get("basic") or by_level.get("intermediate") or by_level.get("advanced")).to_summary_dict()
            if by_level else None,
        }


class RecipeTier(db.Model):
    __tablename__ = "recipe_tiers"
    id      = db.Column(db.Integer, primary_key=True)
    dish_id = db.Column(db.Integer, db.ForeignKey("dishes.id"), nullable=False)
    level   = db.Column(db.String(20), nullable=False)   # basic | intermediate | advanced
    lang    = db.Column(db.String(5),  nullable=False)   # en | de

    title       = db.Column(db.String(160), nullable=False)
    serves      = db.Column(db.Integer, default=2)
    time_min    = db.Column(db.Integer)
    equipment   = db.Column(db.JSON, default=list)
    diet_flags  = db.Column(db.JSON, default=list)   # vegetarian, vegan, ...
    allergens   = db.Column(db.JSON, default=list)   # gluten, dairy, ...
    tags        = db.Column(db.JSON, default=list)

    prep         = db.Column(db.JSON, default=list)  # list[str]
    ingredients  = db.Column(db.JSON, default=list)  # list[{qty, unit, text, food_slug|null}]
    steps        = db.Column(db.JSON, default=list)  # list[str]
    notes        = db.Column(db.JSON, default=list)  # list[str]

    # Computed at sync time from ingredients × food_items — never hand-edited.
    # {kcal, protein_g, carbs_g, fat_g, fiber_g, iron_mg} per serving.
    nutrition = db.Column(db.JSON, default=dict)

    __table_args__ = (db.UniqueConstraint("dish_id", "level", "lang", name="uq_dish_level_lang"),)

    def to_summary_dict(self):
        return {
            "title": self.title,
            "time_min": self.time_min,
            "kcal": (self.nutrition or {}).get("kcal"),
        }

    def to_dict(self):
        return {
            "level": self.level,
            "lang": self.lang,
            "title": self.title,
            "serves": self.serves,
            "time_min": self.time_min,
            "equipment": self.equipment or [],
            "diet_flags": self.diet_flags or [],
            "allergens": self.allergens or [],
            "tags": self.tags or [],
            "prep": self.prep or [],
            "ingredients": self.ingredients or [],
            "steps": self.steps or [],
            "notes": self.notes or [],
            "nutrition": self.nutrition or {},
        }


class FoodItem(db.Model):
    __tablename__ = "food_items"
    id    = db.Column(db.Integer, primary_key=True)
    slug  = db.Column(db.String(80), unique=True, nullable=False)
    names = db.Column(db.JSON, default=dict)   # {"en": "Red lentils (dry)", "de": "..."}

    # Nutrition per 100g (or 100ml for liquids) — approximate reference values,
    # see the "approximate values" note surfaced in the nutrition panel.
    per_100g = db.Column(db.JSON, nullable=False)  # {kcal, protein_g, carbs_g, fat_g, fiber_g, iron_mg}

    # Optional: named units this food is commonly measured in, e.g. {"tbsp": 14, "clove": 5}
    grams_per_unit = db.Column(db.JSON, default=dict)

    def to_dict(self):
        return {"slug": self.slug, "names": self.names or {}, "per_100g": self.per_100g}


def _invite_code():
    return secrets.token_hex(4)  # 8 hex chars, easy to read aloud/type


class Household(db.Model):
    __tablename__ = "households"
    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(100), default="Our kitchen")
    invite_code = db.Column(db.String(16), unique=True, nullable=False, default=_invite_code)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    members = db.relationship("HouseholdMember", backref="household", cascade="all, delete-orphan")
    lists   = db.relationship("GroceryList", backref="household", cascade="all, delete-orphan")
    plan_entries = db.relationship("PlanEntry", backref="household", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "invite_code": self.invite_code,
            "members": [
                {"user_id": m.user_id, "display_name": m.user.display_name, "email": m.user.email}
                for m in self.members
            ],
        }


class HouseholdMember(db.Model):
    __tablename__ = "household_members"
    id           = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False)
    user_id      = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)
    role         = db.Column(db.String(20), default="member")  # owner | member
    joined_at    = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User")


class GroceryList(db.Model):
    __tablename__ = "grocery_lists"
    id           = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)

    items = db.relationship("GroceryItem", backref="list", cascade="all, delete-orphan")


class GroceryItem(db.Model):
    __tablename__ = "grocery_items"
    id         = db.Column(db.Integer, primary_key=True)
    list_id    = db.Column(db.Integer, db.ForeignKey("grocery_lists.id"), nullable=False)
    food_slug  = db.Column(db.String(80), nullable=True)   # set when added from a recipe; enables merging
    text       = db.Column(db.String(200), nullable=False) # display name ("Onion", "Paper towels")
    qty_g      = db.Column(db.Float, nullable=True)         # summed across contributing recipes, when food_slug is set
    sources    = db.Column(db.JSON, default=list)           # list[{"dish_slug", "dish_title"}] — "used in: X, Y"
    checked    = db.Column(db.Boolean, default=False, nullable=False)
    added_by   = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "food_slug": self.food_slug,
            "text": self.text,
            "qty_g": self.qty_g,
            "sources": self.sources or [],
            "checked": self.checked,
        }


class PlanEntry(db.Model):
    __tablename__ = "plan_entries"
    id           = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False)
    date         = db.Column(db.String(10), nullable=False)  # ISO "YYYY-MM-DD" — no timezone math needed for a meal plan
    dish_slug    = db.Column(db.String(80), nullable=False)
    level        = db.Column(db.String(20), nullable=False)
    serves       = db.Column(db.Integer, default=2)
    added_by     = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date,
            "dish_slug": self.dish_slug,
            "level": self.level,
            "serves": self.serves,
        }
