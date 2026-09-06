"""
scripts/sync_learning.py — Markdown -> Postgres sync for skills/lessons.

Source: content/lessons/<lesson-slug>/<lang>.md — YAML front matter (skill,
dish_slug, level, lang, step_id, title) + a markdown body, followed by a
trailing `next_practice:` block (dish_slug/level/reason) that is NOT part of
the delimited front matter — see parse_lesson_file() below.

Sync-time validation is mandatory (docs/contracts/pilot-fixtures.md §2): every
lesson's recipe/step link — the 4-tuple (dish_slug, level, lang, step_id) — is
resolved against the actually-synced RecipeTier step data for that exact
(dish_slug, level, lang) before anything is written. A link that doesn't
resolve aborts the WHOLE sync with a clear error identifying the broken link
— never publish some lessons while silently dropping a broken one, and never
fall back to "closest text match."

Run with the Flask app context via `flask sync-skills` / `flask sync-lessons`
(see app.py).
"""

import os
import re

import yaml

CONTENT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "content")
LESSONS_DIR = os.path.join(CONTENT_DIR, "lessons")

NEXT_PRACTICE_RE = re.compile(r"\n(next_practice:\n(?:[ \t]+.*\n?)*)$")


class SyncError(Exception):
    pass


def parse_front_matter(text, path):
    m = re.match(r"^---\s*\n(.*?\n)---\s*\n(.*)$", text, re.DOTALL)
    if not m:
        raise SyncError(f"{path}: missing YAML front matter (--- ... ---)")
    meta = yaml.safe_load(m.group(1)) or {}
    return meta, m.group(2)


def parse_lesson_file(path):
    """Returns (meta, body, next_practice|None). The trailing `next_practice:`
    stanza is written in the body as plain YAML text (not inside the
    delimited front-matter block) so it doesn't show up in the front matter
    dict — split it out here rather than parsing it as prose."""
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    meta, rest = parse_front_matter(text, path)

    next_practice = None
    m = NEXT_PRACTICE_RE.search(rest)
    if m:
        rest = rest[: m.start()]
        parsed = yaml.safe_load(m.group(1)) or {}
        next_practice = parsed.get("next_practice")
        for required in ("dish_slug", "level", "reason"):
            if not next_practice or required not in next_practice:
                raise SyncError(f"{path}: next_practice block missing required field '{required}'")

    return meta, rest.strip(), next_practice


def find_lesson_files():
    if not os.path.isdir(LESSONS_DIR):
        return []
    out = []
    for slug in sorted(os.listdir(LESSONS_DIR)):
        lesson_dir = os.path.join(LESSONS_DIR, slug)
        if not os.path.isdir(lesson_dir):
            continue
        for fname in sorted(os.listdir(lesson_dir)):
            if not fname.endswith(".md"):
                continue
            m = re.match(r"^(en|de)\.md$", fname)
            if not m:
                raise SyncError(f"{lesson_dir}/{fname}: filename must be '<lang>.md'")
            out.append((slug, m.group(1), os.path.join(lesson_dir, fname)))
    return out


def _load_by_slug(files):
    """Parses every lesson file and groups by lesson slug, checking that the
    fields shared across a lesson's language variants (skill, dish_slug,
    level, step_id, next_practice target) actually agree — a lesson is one
    instructional moment, translated, not two different ones that happen to
    share a URL slug."""
    by_slug = {}
    for slug, lang, path in files:
        meta, body, next_practice = parse_lesson_file(path)
        for required in ("skill", "dish_slug", "level", "step_id", "title"):
            if required not in meta:
                raise SyncError(f"{path}: missing required front-matter field '{required}'")
        if meta.get("lang", lang) != lang:
            raise SyncError(f"{path}: front-matter lang '{meta.get('lang')}' does not match filename lang '{lang}'")

        entry = by_slug.setdefault(slug, {
            "skill": meta["skill"], "dish_slug": meta["dish_slug"], "level": meta["level"],
            "step_id": meta["step_id"], "title": {}, "body": {}, "next_practice": None,
            "next_practice_reason": {},
        })
        for shared_field in ("skill", "dish_slug", "level", "step_id"):
            if entry[shared_field] != meta[shared_field]:
                raise SyncError(
                    f"{path}: {shared_field}={meta[shared_field]!r} disagrees with the '{lang}' "
                    f"sibling's {shared_field}={entry[shared_field]!r} for lesson '{slug}'"
                )
        entry["title"][lang] = meta["title"]
        entry["body"][lang] = body
        if next_practice:
            if entry["next_practice"] is None:
                entry["next_practice"] = {"dish_slug": next_practice["dish_slug"], "level": next_practice["level"]}
            elif (entry["next_practice"]["dish_slug"], entry["next_practice"]["level"]) != (
                next_practice["dish_slug"], next_practice["level"],
            ):
                raise SyncError(f"{path}: next_practice target disagrees with lesson '{slug}''s other language")
            entry["next_practice_reason"][lang] = next_practice["reason"]

    return by_slug


def _resolve_step(dish_slug, level, lang, step_id, RecipeTier, Dish, path):
    """The mandatory, fail-loud resolution (contract §2): looks up the actual
    synced RecipeTier for this exact (dish_slug, level, lang) and confirms
    step_id is one of its real, authored step ids — never a text match, never
    a fallback."""
    dish = Dish.query.filter_by(slug=dish_slug).first()
    if not dish:
        raise SyncError(f"{path}: dish '{dish_slug}' does not exist")
    tier = RecipeTier.query.filter_by(dish_id=dish.id, level=level, lang=lang).first()
    if not tier:
        raise SyncError(f"{path}: no recipe_tiers row for {dish_slug}/{level}/{lang}")
    if step_id not in tier.step_ids():
        raise SyncError(
            f"{path}: step_id '{step_id}' does not resolve against {dish_slug}/{level}/{lang}'s "
            f"synced steps (found step_ids: {sorted(tier.step_ids()) or '[]'}) — "
            f"the recipe step may have been renamed/removed, or never converted to structured steps"
        )


def sync_skills(db, Skill, verbose=print):
    """Ensures a Skill row exists for every skill referenced by a lesson file
    — lightweight and independent of Lesson's own (heavier, validated) sync,
    mirroring how flask sync-skills/flask sync-lessons are wired as two
    separate CLI commands."""
    files = find_lesson_files()
    if not files:
        verbose("No lesson files found — skipping.")
        return

    slugs = set()
    for _, _, path in files:
        meta, _, _ = parse_lesson_file(path)
        if "skill" not in meta:
            raise SyncError(f"{path}: missing required front-matter field 'skill'")
        slugs.add(meta["skill"])

    existing = {s.slug: s for s in Skill.query.all()}
    for slug in sorted(slugs):
        if slug not in existing:
            db.session.add(Skill(slug=slug))
            verbose(f"  + {slug}")
        else:
            verbose(f"  = {slug}")
    db.session.commit()
    verbose(f"Synced {len(slugs)} skill(s).")


def sync_lessons(db, Skill, Lesson, RecipeTier, verbose=print):
    from models import Dish  # local import to avoid a hard dependency for callers that only need sync_skills

    files = find_lesson_files()
    if not files:
        verbose("No lesson files found — skipping.")
        return

    by_slug = _load_by_slug(files)

    # Validation pass FIRST, for every lesson, before any db.session.add —
    # a broken link anywhere aborts the whole sync, nothing gets published.
    for slug, data in by_slug.items():
        for lang in data["title"]:
            _resolve_step(data["dish_slug"], data["level"], lang, data["step_id"], RecipeTier, Dish, f"lessons/{slug}/{lang}.md")
        if data["next_practice"]:
            target_dish = Dish.query.filter_by(slug=data["next_practice"]["dish_slug"]).first()
            if not target_dish or not any(t.level == data["next_practice"]["level"] for t in target_dish.tiers):
                raise SyncError(
                    f"lessons/{slug}: next_practice target "
                    f"{data['next_practice']['dish_slug']}/{data['next_practice']['level']} does not exist"
                )

    existing_skills = {s.slug: s for s in Skill.query.all()}
    existing_lessons = {l.slug: l for l in Lesson.query.all()}
    for slug, data in by_slug.items():
        skill = existing_skills.get(data["skill"])
        if skill is None:
            skill = Skill(slug=data["skill"])
            db.session.add(skill)
            db.session.flush()
            existing_skills[data["skill"]] = skill

        lesson = existing_lessons.get(slug)
        if lesson is None:
            lesson = Lesson(slug=slug)
            db.session.add(lesson)
        lesson.skill = skill
        lesson.title = data["title"]
        lesson.body = data["body"]
        lesson.dish_slug = data["dish_slug"]
        lesson.level = data["level"]
        lesson.step_id = data["step_id"]
        if data["next_practice"]:
            lesson.next_practice_dish_slug = data["next_practice"]["dish_slug"]
            lesson.next_practice_level = data["next_practice"]["level"]
            lesson.next_practice_reason = data["next_practice_reason"]
        verbose(f"  {slug} — {len(data['title'])} language(s), step {data['dish_slug']}/{data['level']}/{data['step_id']}")

    db.session.commit()
    verbose(f"Synced {len(by_slug)} lesson(s).")
