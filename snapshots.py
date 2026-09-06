"""
snapshots.py — recipe content snapshot capture/reuse + read-time authorization.

docs/contracts/pilot-fixtures.md §1. A cook session must be able to show and
replay the *actual instructions the user cooked from*, even after the recipe
is edited or the browser is closed — so the server stores the full content,
not a digest of it. Kept as a standalone module (like access.py) rather than
folded into routes/ since both the HTTP endpoints (routes/snapshots.py) and
any other future internal caller need the same capture/reuse + auth logic.
"""

import hashlib
import json

from sqlalchemy.exc import IntegrityError

from app import db
from models import Dish, RecipeTier, Lesson, Skill, RecipeContentSnapshot
from access import tier_access


def _digest(content):
    return hashlib.sha256(json.dumps(content, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def capture_or_reuse_snapshot(dish_slug, level, lang):
    """Implements the contract's exact capture/reuse rule: compute the digest
    of the current RecipeTier content, reuse an existing row with the same
    (dish_slug, level, lang, content_digest) if one exists, otherwise insert.
    Returns (snapshot, error) — error is one of "dish_not_found"/"tier_not_found"
    when there's no such content to capture, snapshot is None in that case."""
    # One SQL statement reads recipe, lesson and skill columns from the same
    # database statement snapshot (including PostgreSQL READ COMMITTED).
    rows = db.session.execute(
        db.select(RecipeTier, Lesson, Skill)
        .join(Dish, RecipeTier.dish_id == Dish.id)
        .outerjoin(Lesson, (Lesson.dish_slug == Dish.slug) & (Lesson.level == RecipeTier.level))
        .outerjoin(Skill, Skill.id == Lesson.skill_id)
        .where(Dish.slug == dish_slug, RecipeTier.level == level, RecipeTier.lang == lang)
        .execution_options(populate_existing=True)
    ).all()
    if not rows:
        return None, "tier_not_found" if Dish.query.filter_by(slug=dish_slug).first() else "dish_not_found"
    tier = rows[0][0]

    # raw_steps=True: keep structured {"id","text"} steps intact so a step_id
    # can still be matched against this frozen snapshot later (pilot-fixtures
    # §2) - to_dict()'s default flattens steps to plain strings for every
    # other caller, which would erase the id permanently at capture time.
    content = tier.to_dict(full=True, raw_steps=True)
    content["schema_version"] = 2
    content["lessons"] = {}
    # The existing parser emits {id: null, text: ...} for unannotated recipes.
    # Preserve them; only authored IDs participate in link validation.
    ids = [step["id"] for step in tier.steps if isinstance(step, dict) and step.get("id") is not None]
    if any(not isinstance(sid, str) or not sid for sid in ids) or len(ids) != len(set(ids)):
        return None, "invalid_teaching_content"
    for _, lesson, skill in rows:
        if lesson is None:
            continue
        if lesson.step_id not in ids or not skill or lesson.step_id in content["lessons"]:
            return None, "invalid_teaching_content"
        if lang not in (lesson.title or {}) or lang not in (lesson.body or {}):
            return None, "invalid_teaching_content"
        # Don't lazy-load a relationship after the consistent statement above.
        content["lessons"][lesson.step_id] = {
            "slug": lesson.slug, "skill": skill.slug, "title": lesson.title[lang],
            "body": lesson.body[lang], "dish_slug": dish_slug, "level": level,
            "lang": lang, "step_id": lesson.step_id,
            "next_practice": ({"dish_slug": lesson.next_practice_dish_slug,
                "level": lesson.next_practice_level, "lang": lang,
                "reason": (lesson.next_practice_reason or {}).get(lang, "")}
                if lesson.next_practice_dish_slug else None),
        }
    digest = _digest(content)

    existing = RecipeContentSnapshot.query.filter_by(
        dish_slug=dish_slug, level=level, lang=lang, content_digest=digest
    ).first()
    if existing:
        return existing, None

    row = RecipeContentSnapshot(dish_slug=dish_slug, level=level, lang=lang, content=content, content_digest=digest)
    db.session.add(row)
    try:
        db.session.commit()
    except IntegrityError:
        # Lost the race to a concurrent identical capture - the unique
        # constraint on (dish_slug, level, lang, content_digest) is what
        # actually closes this, not the pre-check above. Re-read and reuse
        # the row the other request just inserted instead of letting the
        # 500 through (same pattern as routes/progress.py's log_cook).
        db.session.rollback()
        existing = RecipeContentSnapshot.query.filter_by(
            dish_slug=dish_slug, level=level, lang=lang, content_digest=digest
        ).first()
        if not existing:
            raise
        return existing, None
    return row, None


def check_snapshot_access(snapshot, user):
    """Re-runs access.py's tier/premium check against the snapshot's own
    dish_slug/level and the requester's *current* access — never whatever
    access they had when the session started (contract §1: a lapsed premium
    subscription must fail the very next read of an advanced snapshot, even
    though the client already holds the snapshot_id). Returns (allowed, reason)."""
    return tier_access(snapshot.level, user)
