"""
tests/backend/helpers.py — shared setup for the Wave-3-Step-2 regression
tests (routes/progress.py, snapshots.py, scripts/sync_learning.py).

No pytest in requirements.txt, and no existing tests/ convention in this repo
- these scripts use stdlib unittest + Flask's test client directly, matching
CLAUDE.md's "direct verification over a formal test suite" note. Each test
file is meant to be run as its own process (`python3 tests/backend/test_x.py`)
so app/db module-level singletons never bleed state between unrelated runs.
"""

import os
import sys
import tempfile

# Repo root on sys.path so `import app`, `import models`, etc. resolve the
# same way they do for the real Flask app / CLI commands.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


def make_app():
    """Fresh Flask app + a throwaway SQLite file (architecture.md: SQLite is
    the local-dev DB) with all tables created. Returns (app, db)."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path}"
    os.environ["FLASK_ENV"] = "development"  # app.py allows the dev JWT secret fallback

    from app import create_app, db
    app = create_app()
    app.config["TESTING"] = True
    with app.app_context():
        db.create_all()
    return app, db


def make_user(db, email="cook@example.com", plan="free"):
    from models import User
    from app import bcrypt
    user = User(email=email, password_hash=bcrypt.generate_password_hash("password123").decode("utf-8"), plan=plan)
    db.session.add(user)
    db.session.commit()
    return user


def make_tier(db, dish_slug, level, lang="en", steps=None, title=None):
    """Creates (or reuses) a Dish and attaches one RecipeTier to it."""
    from models import Dish, RecipeTier
    dish = Dish.query.filter_by(slug=dish_slug).first()
    if not dish:
        dish = Dish(slug=dish_slug, cuisine="test", meal_type="dinner")
        db.session.add(dish)
        db.session.flush()
    tier = RecipeTier(
        dish_id=dish.id,
        level=level,
        lang=lang,
        title=title or f"{dish_slug} ({level}/{lang})",
        serves=2,
        time_min=20,
        steps=steps or ["Do the thing."],
        ingredients=[],
        prep=[],
        notes=[],
        nutrition={},
    )
    db.session.add(tier)
    db.session.commit()
    return dish, tier


def make_lesson(db, slug, skill_slug, dish_slug, level, step_id, next_practice=None):
    """Creates (or reuses) a Skill and attaches one Lesson to it, mirroring
    scripts/sync_learning.py's shape closely enough for route tests that
    don't need the sync script itself. next_practice, when given, is
    (dish_slug, level, reason_en, reason_de)."""
    from models import Skill, Lesson
    skill = Skill.query.filter_by(slug=skill_slug).first()
    if not skill:
        skill = Skill(slug=skill_slug)
        db.session.add(skill)
        db.session.flush()
    lesson = Lesson(
        slug=slug,
        skill=skill,
        title={"en": slug.title(), "de": slug.title()},
        body={"en": f"{slug} body (en)", "de": f"{slug} body (de)"},
        dish_slug=dish_slug,
        level=level,
        step_id=step_id,
    )
    if next_practice:
        np_dish, np_level, reason_en, reason_de = next_practice
        lesson.next_practice_dish_slug = np_dish
        lesson.next_practice_level = np_level
        lesson.next_practice_reason = {"en": reason_en, "de": reason_de}
    db.session.add(lesson)
    db.session.commit()
    return skill, lesson


def auth_header(app, user_id):
    from flask_jwt_extended import create_access_token
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}
