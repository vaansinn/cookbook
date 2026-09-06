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
  cook_logs         — one row per "I cooked this" check-in; streaks/XP/badges
                      are all derived from this table, never stored directly
  badge_awards      — a badge, once earned, is permanent (see routes/progress.py)
  glossary_entries  — technique/nutrition explainer pages, linked from recipe
                      steps and the nutrition panel by keyword match (see
                      content/glossary/*.md + scripts/sync_glossary.py)
  favorites         — a user's heart-marked dishes (routes/favorites.py)
  meal_plans        — a named, user-owned bundle of recipes with a public
                      shareable link (routes/meal_plans.py) — distinct from
                      plan_entries: this is a curated set to share out, not a
                      household's dated week schedule
  meal_plan_items   — one dish+tier in a meal plan
  recipe_content_snapshots — immutable capture of a RecipeTier's full content
                      at the moment a cook session started, so a cook can be
                      replayed later even if the live recipe changed since
                      (docs/contracts/pilot-fixtures.md §1). Reused by digest
                      when unchanged, never updated in place.
  skills            — a named technique a lesson teaches (e.g. "simmering")
  lessons           — one contextual-help page per skill, linked to a single
                      exact recipe step via (dish_slug, level, lang, step_id)
                      (pilot-fixtures.md §2) — see scripts/sync_learning.py
  cook_reflections  — optional, additive per-cook reflection (pilot-fixtures.md
                      §3/§10/§12/§13) — outcome/practiced_skill_confirmed/
                      confidence, one row per CookLog, never a precondition
                      for the CookLog row itself. skill_slug is the skill *as
                      pinned* for that cook (derived from its server-retained
                      snapshot, §9/§10), never re-derived from today's
                      live Lesson/Skill linkage.
  skill_confidences — one row per (user, Skill): the user's *current*
                      confidence, independent of any one reflection (§10).
                      Submitting confidence via a reflection also writes here;
                      a later direct PUT /api/me/skills/<slug> edit only ever
                      touches this table, never a past CookReflection row.
"""

from app import db
from datetime import datetime, timedelta
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

    title        = db.Column(db.String(160), nullable=False)
    tier_summary = db.Column(db.String(120))  # short "what's different at this level" line
    serves       = db.Column(db.Integer, default=2)
    time_min     = db.Column(db.Integer)
    equipment    = db.Column(db.JSON, default=list)
    diet_flags   = db.Column(db.JSON, default=list)   # vegetarian, vegan, ...
    allergens    = db.Column(db.JSON, default=list)   # gluten, dairy, ...
    tags         = db.Column(db.JSON, default=list)

    prep         = db.Column(db.JSON, default=list)  # list[str]
    ingredients  = db.Column(db.JSON, default=list)  # list[{qty, unit, text, food_slug|null}]
    # list[str] for any tier/dish not yet converted to structured steps, or
    # list[{"id": step_id|null, "text": str}] once #35 has converted it (see
    # scripts/sync_recipes.py). `id` is null except where a dish/tier has real
    # authored step_ids (lentil-bolognese Basic EN+DE, for the #47a pilot) —
    # never a synthesized one (no array index). _step_text() below is the
    # compatibility serializer: to_dict() always hands back plain strings so
    # existing consumers (CookMode.jsx's parseSeconds, RecipePage.jsx's
    # Instructions section) don't need to know this shape exists.
    steps        = db.Column(db.JSON, default=list)
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

    @staticmethod
    def _step_text(step):
        """Compatibility serializer (#35 / pilot-fixtures.md §2): a step is
        either a legacy plain string or a structured {"id", "text"} dict —
        every external reader (this to_dict, and therefore CookMode.jsx /
        RecipePage.jsx) only ever sees the plain text either way."""
        return step["text"] if isinstance(step, dict) else step

    def step_ids(self):
        """Internal use only (sync-time lesson-link validation) — the set of
        real, authored step_ids on this tier. Never used to serve step text."""
        return {s["id"] for s in (self.steps or []) if isinstance(s, dict) and s.get("id")}

    def to_dict(self, full=True, raw_steps=False):
        """full=False returns the paywall teaser shape: prep/ingredients/
        nutrition stay complete (they're the "what you'd need to buy"
        preview), but steps are cut to the first one and notes are
        withheld, with steps_total telling the frontend how much more
        there is so the fade UI can say "N more steps" accurately.

        raw_steps=True keeps structured {"id", "text"} steps intact instead
        of flattening them through _step_text() - only for callers that need
        to preserve step_id (snapshots.py's capture_or_reuse_snapshot, so a
        frozen snapshot can still be matched against step_id later). Every
        other caller (routes/recipes.py, seo.py's own direct _step_text use,
        RecipePage.jsx/RecipesPage via the API) keeps getting plain strings -
        this parameter changes nothing for them since it defaults to False."""
        steps = list(self.steps or []) if raw_steps else [self._step_text(s) for s in (self.steps or [])]
        return {
            "level": self.level,
            "lang": self.lang,
            "title": self.title,
            "tier_summary": self.tier_summary,
            "serves": self.serves,
            "time_min": self.time_min,
            "equipment": self.equipment or [],
            "diet_flags": self.diet_flags or [],
            "allergens": self.allergens or [],
            "tags": self.tags or [],
            "prep": self.prep or [],
            "ingredients": self.ingredients or [],
            "steps": steps if full else steps[:1],
            "steps_total": len(steps),
            "notes": (self.notes or []) if full else [],
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


class Favorite(db.Model):
    __tablename__ = "favorites"
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    dish_slug  = db.Column(db.String(80), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint("user_id", "dish_slug", name="uq_user_dish_favorite"),)


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


def _plan_share_slug():
    return secrets.token_urlsafe(9)  # public, unguessable — longer than the household invite code


class MealPlan(db.Model):
    __tablename__ = "meal_plans"
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name       = db.Column(db.String(100), nullable=False)
    share_slug = db.Column(db.String(24), unique=True, nullable=False, default=_plan_share_slug)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user  = db.relationship("User")
    items = db.relationship("MealPlanItem", backref="plan", cascade="all, delete-orphan", order_by="MealPlanItem.id")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "share_slug": self.share_slug,
            "items": [i.to_dict() for i in self.items],
        }


class MealPlanItem(db.Model):
    __tablename__ = "meal_plan_items"
    id           = db.Column(db.Integer, primary_key=True)
    meal_plan_id = db.Column(db.Integer, db.ForeignKey("meal_plans.id"), nullable=False)
    dish_slug    = db.Column(db.String(80), nullable=False)
    level        = db.Column(db.String(20), nullable=False)

    def to_dict(self):
        return {"dish_slug": self.dish_slug, "level": self.level}


class RecipeContentSnapshot(db.Model):
    """Server-authorized, immutable capture of a RecipeTier's full content at
    the moment a cook session started (pilot-fixtures.md §1). A hash alone
    can't redisplay content later, so this stores the whole thing — not a
    digest of it. Never updated in place once inserted; content_digest exists
    only to decide whether an existing row already represents this exact
    content, so a retried/repeated capture of unchanged content reuses the
    same row instead of inserting a duplicate (see the unique constraint)."""
    __tablename__ = "recipe_content_snapshots"
    id             = db.Column(db.Integer, primary_key=True)
    dish_slug      = db.Column(db.String(80), nullable=False)
    level          = db.Column(db.String(20), nullable=False)
    lang           = db.Column(db.String(5), nullable=False)
    content        = db.Column(db.JSON, nullable=False)  # RecipeTier.to_dict(full=True) at capture time
    content_digest = db.Column(db.String(64), nullable=False)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("dish_slug", "level", "lang", "content_digest", name="uq_snapshot_content"),
    )


class CookLog(db.Model):
    __tablename__ = "cook_logs"
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    dish_id    = db.Column(db.Integer, db.ForeignKey("dishes.id"), nullable=False)
    level      = db.Column(db.String(20), nullable=False)
    cooked_at  = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Client-generated idempotency key (#48) - a UUID minted once per cook
    # session so a retried/double-tapped Finish resolves to the same row
    # instead of creating a second one. Nullable: existing rows predate this
    # column and stay valid legacy history, and a client that doesn't send
    # one yet just inserts like before (see unique constraint below - two
    # NULLs never collide). Never fabricate one for old rows.
    session_id = db.Column(db.String(64), nullable=True)

    # Added for pilot-fixtures.md §6 — widen the conflict-check from bare
    # (dish_id, level) to the full (dish_slug, level, lang, snapshot_id).
    # Nullable for the same reason session_id is: pre-Wave-3 rows (and any
    # client that hasn't upgraded yet) never had these, and that's legacy
    # history, never backfilled with a guessed value.
    lang        = db.Column(db.String(5), nullable=True)
    snapshot_id = db.Column(db.Integer, db.ForeignKey("recipe_content_snapshots.id"), nullable=True)

    dish     = db.relationship("Dish")
    snapshot = db.relationship("RecipeContentSnapshot")

    # Narrow on purpose: (user_id, session_id) only, not also dish/level/lang.
    # A session_id reused with a different payload is a conflict to reject
    # (routes/progress.py:log_cook), not a second row to allow.
    __table_args__ = (db.UniqueConstraint("user_id", "session_id", name="uq_user_session_cooklog"),)


class BadgeAward(db.Model):
    __tablename__ = "badge_awards"
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    badge_slug = db.Column(db.String(40), nullable=False)
    earned_at  = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint("user_id", "badge_slug", name="uq_user_badge"),)


class GlossaryEntry(db.Model):
    __tablename__ = "glossary_entries"
    id            = db.Column(db.Integer, primary_key=True)
    slug          = db.Column(db.String(80), unique=True, nullable=False)
    type          = db.Column(db.String(20), nullable=False)  # technique | nutrition
    names         = db.Column(db.JSON, default=dict)          # {"en": "Deglazing", "de": "..."}
    body          = db.Column(db.JSON, default=dict)          # {"en": "...", "de": "..."}
    trigger_words = db.Column(db.JSON, default=list)          # lowercase phrases matched in recipe text

    def to_dict(self, lang="en"):
        return {
            "slug": self.slug,
            "type": self.type,
            "title": (self.names or {}).get(lang, self.slug),
            "body": (self.body or {}).get(lang, ""),
            "trigger_words": self.trigger_words or [],
        }


class Skill(db.Model):
    """A named technique a Lesson teaches (e.g. "simmering"). Deliberately
    thin for this pilot slice — it's the parent a future per-user
    SkillPractice/confidence record (contract §3, #37's PUT /api/me/skills/
    <slug>) will hang off of; that endpoint is a later slice, not built here."""
    __tablename__ = "skills"
    id         = db.Column(db.Integer, primary_key=True)
    slug       = db.Column(db.String(80), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    lessons = db.relationship("Lesson", backref="skill", cascade="all, delete-orphan")


class Lesson(db.Model):
    """One contextual-help page per skill (content/lessons/<slug>/{en,de}.md).
    Recipe/step link (pilot-fixtures.md §2) is the 4-tuple (dish_slug, level,
    lang, step_id) — dish_slug/level/step_id are one fixed recipe moment
    regardless of language (this pilot's only lesson explains the same step
    in both EN and DE); lang is implicit in the title/body/next_practice_
    reason dict lookup, and scripts/sync_learning.py validates the full
    4-tuple per language against actually-synced RecipeTier step data before
    ever publishing a lesson, never a "closest match" fallback."""
    __tablename__ = "lessons"
    id       = db.Column(db.Integer, primary_key=True)
    skill_id = db.Column(db.Integer, db.ForeignKey("skills.id"), nullable=False)
    slug     = db.Column(db.String(80), unique=True, nullable=False)  # URL slug, /lesson/<slug>
    title    = db.Column(db.JSON, default=dict)  # {"en": "Simmering", "de": "Köcheln"}
    body     = db.Column(db.JSON, default=dict)  # {"en": "...", "de": "..."}

    dish_slug = db.Column(db.String(80), nullable=False)
    level     = db.Column(db.String(20), nullable=False)
    step_id   = db.Column(db.String(80), nullable=False)

    # Next-practice suggestion (contract §7) — one target recipe regardless
    # of language, reason text localized. Nullable: a lesson need not carry one.
    next_practice_dish_slug = db.Column(db.String(80), nullable=True)
    next_practice_level     = db.Column(db.String(20), nullable=True)
    next_practice_reason    = db.Column(db.JSON, default=dict)  # {"en": "...", "de": "..."}

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, lang="en"):
        next_practice = None
        if self.next_practice_dish_slug:
            next_practice = {
                "dish_slug": self.next_practice_dish_slug,
                "level": self.next_practice_level,
                "lang": lang,
                "reason": (self.next_practice_reason or {}).get(lang, ""),
            }
        return {
            "slug": self.slug,
            "skill": self.skill.slug if self.skill else None,
            "title": (self.title or {}).get(lang, self.slug),
            "body": (self.body or {}).get(lang, ""),
            "dish_slug": self.dish_slug,
            "level": self.level,
            "lang": lang,
            "step_id": self.step_id,
            "next_practice": next_practice,
        }


class CookReflection(db.Model):
    """Optional, additive per-cook reflection (pilot-fixtures.md §3/§10/§12/
    §13) — never a precondition for the CookLog row it's attached to; skipping
    it leaves that row exactly as saved. One row per (user, CookLog): the
    unique constraint is what routes/reflections.py's create-or-update logic
    reacts to (same "insert, catch IntegrityError, re-read" shape as
    CookLog/RecipeContentSnapshot elsewhere in this codebase).

    `outcome`/`practiced_skill_confirmed`/`confidence` are three genuinely
    independent optional fields (§3) - each nullable with no default, so
    "never answered" (NULL) is distinguishable from an explicit `false`.
    `skill_slug` is derived from the cook's server-retained snapshot, never
    trusted from a client or inferred from completion. It is never
    re-resolved from today's live Lesson/Skill linkage, so a later re-pointed
    lesson/skill never reinterprets what a past reflection meant (§10)."""
    __tablename__ = "cook_reflections"
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    cook_log_id = db.Column(db.Integer, db.ForeignKey("cook_logs.id"), nullable=False)

    skill_slug = db.Column(db.String(80), nullable=True)
    outcome    = db.Column(db.String(20), nullable=True)   # "happy" | "mixed" | "need_help" | null
    practiced_skill_confirmed = db.Column(db.Boolean, nullable=True)  # tri-state: null = never answered
    confidence = db.Column(db.String(20), nullable=True)   # "unknown" | "wants_guidance" | "comfortable" | null
    revision = db.Column(db.Integer, nullable=False, default=1, server_default="1")

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    cook_log = db.relationship("CookLog")

    __table_args__ = (db.UniqueConstraint("user_id", "cook_log_id", name="uq_user_cooklog_reflection"),)

    def to_dict(self):
        return {
            "id": self.id,
            "cook_log_id": self.cook_log_id,
            "skill_slug": self.skill_slug,
            "outcome": self.outcome,
            "practiced_skill_confirmed": self.practiced_skill_confirmed,
            "confidence": self.confidence,
            "revision": self.revision,
            "updated_at": self.updated_at.strftime("%Y-%m-%dT%H:%M:%SZ") if self.updated_at else None,
        }


class ReflectionMutation(db.Model):
    """Successful account-scoped write receipt; replay never reapplies side effects."""
    __tablename__ = "reflection_mutations"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    mutation_id = db.Column(db.String(36), nullable=False)
    cook_log_id = db.Column(db.Integer, db.ForeignKey("cook_logs.id"), nullable=False)
    request_digest = db.Column(db.String(64), nullable=False)
    result = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    __table_args__ = (db.UniqueConstraint("user_id", "mutation_id", name="uq_reflection_mutation"),)


class SkillConfidence(db.Model):
    """The user's *current* confidence in a Skill (pilot-fixtures.md §10) -
    one row per (user, Skill), editable any time via PUT /api/me/skills/<slug>
    independent of any specific cook/reflection. Submitting `confidence`
    through a CookReflection also writes here (routes/reflections.py); a
    later direct edit here never reaches back and rewrites what a past
    CookReflection recorded — that stays a historical record of what was said
    at that cook."""
    __tablename__ = "skill_confidences"
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    skill_id   = db.Column(db.Integer, db.ForeignKey("skills.id"), nullable=False)
    confidence = db.Column(db.String(20), nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    skill = db.relationship("Skill")

    __table_args__ = (db.UniqueConstraint("user_id", "skill_id", name="uq_user_skill_confidence"),)

    def to_dict(self):
        return {
            "skill": self.skill.slug if self.skill else None,
            "confidence": self.confidence,
            "updated_at": self.updated_at.strftime("%Y-%m-%dT%H:%M:%SZ") if self.updated_at else None,
        }
