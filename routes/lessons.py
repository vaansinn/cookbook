"""
routes/lessons.py — Lesson lookup (docs/contracts/pilot-fixtures.md §11).

Two request shapes resolve to the identical Lesson row:
  - GET /api/lessons/<slug>            — by lesson slug (LessonPage.jsx)
  - GET /api/lessons/by-ref            — by the exact 4-tuple (dish_slug,
    level, lang, step_id) from §2, for in-cook contextual help / a new
    session's content-pin capture (CookMode.jsx).

Both share _lesson_response(): language mismatch falls back to `en` rather
than 404ing (§11 — a lesson existing in one language and not the other still
has something useful to show mid-cook), tier/premium access is re-checked on
every read via access.py's tier_access() resolved from the lesson's own
recipe/step link (Lesson has no tier column of its own), and any
next_practice suggestion is filtered to something the *current* requester can
actually open — omitted entirely, never returned locked, when nothing is
eligible.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import User, Lesson, Dish
from access import tier_access

lessons_bp = Blueprint("lessons", __name__)


def _current_user():
    user_id = get_jwt_identity()
    return User.query.get(int(user_id)) if user_id else None


def _resolve_lang(lesson, lang):
    """§11: falls back to 'en' when the lesson has no authored content for
    the requested language — never 404s for a language gap on an existing
    lesson (a recipe 404s on a missing tier/language; a lesson doesn't)."""
    if lang in (lesson.title or {}) or lang in (lesson.body or {}):
        return lang
    return "en"


def _lesson_response(lesson, lang, user):
    allowed, reason = tier_access(lesson.level, user)
    if not allowed:
        return jsonify({"error": "This tier needs an upgrade", "code": f"needs_{reason}"}), 403

    resolved_lang = _resolve_lang(lesson, lang)
    data = lesson.to_dict(lang=resolved_lang)

    # §11 next-practice filtering: only ever a target this requester can open.
    if data["next_practice"]:
        target_dish = Dish.query.filter_by(slug=data["next_practice"]["dish_slug"]).first()
        target_allowed = bool(target_dish) and tier_access(data["next_practice"]["level"], user)[0]
        if not target_allowed:
            data["next_practice"] = None

    return jsonify(data), 200


@lessons_bp.route("/lessons/<slug>", methods=["GET"])
@jwt_required(optional=True)
def get_lesson_by_slug(slug):
    lesson = Lesson.query.filter_by(slug=slug).first()
    if not lesson:
        return jsonify({"error": "Lesson not found"}), 404
    lang = request.args.get("lang", "en")
    return _lesson_response(lesson, lang, _current_user())


@lessons_bp.route("/lessons/by-ref", methods=["GET"])
@jwt_required(optional=True)
def get_lesson_by_ref():
    """The 4-tuple lookup (§2/§11) — dish_slug/level/lang/step_id are all
    required; lang only affects which language of an otherwise-identical
    Lesson row comes back (see _resolve_lang), it's not part of the link
    itself (Lesson.dish_slug/level/step_id are language-independent)."""
    dish_slug = request.args.get("dish_slug")
    level = request.args.get("level")
    step_id = request.args.get("step_id")
    lang = request.args.get("lang", "en")
    if not dish_slug or not level or not step_id:
        return jsonify({"error": "dish_slug, level, and step_id are required"}), 400

    lesson = Lesson.query.filter_by(dish_slug=dish_slug, level=level, step_id=step_id).first()
    if not lesson:
        return jsonify({"error": "No lesson for this step"}), 404
    return _lesson_response(lesson, lang, _current_user())
