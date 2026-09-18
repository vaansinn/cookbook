"""Finite server-authored planning catalog. No shipped entries or publish route.

Content is retained by revision; live recipe data is used only for eligibility.
Trusted sync/operator functions flush but never commit the caller's transaction.
See docs/contracts/planning-catalog-v1.md for the closed wire/content schema.
"""
from copy import deepcopy
from decimal import Decimal, ROUND_HALF_UP, localcontext
from functools import wraps
import hashlib
import json
import re
from types import SimpleNamespace

from flask import current_app, jsonify, request
from flask_jwt_extended import get_current_user, jwt_required
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import BadRequest

from access import tier_access
from app import db
from models import Dish, RecipeTier, User
from planning_catalog_models import PlanningCatalogEntry

LANGUAGES = ("en", "de")
KINDS = ("recipe", "planning_example")
AVAILABILITIES = ("draft", "published", "revoked")
UNITS = ("g", "kg", "ml", "l", "piece", "tsp", "tbsp")
V2_UNITS = UNITS + ("head", "loaf", "bunch", "pack", "taste")
CATEGORIES = ("produce", "bakery", "cupboard", "herbs", "chilled", "frozen", "other")
PURCHASE_MODES = ("measured", "check_cupboard")
MAX_CONTENT_BYTES = 256 * 1024
MAX_RESOLVE_BYTES = 4096
MAX_QUANTITY = Decimal("1000000")
QUANTUM = Decimal("0.001")
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z", re.ASCII)
AMOUNT = re.compile(r"(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,3})?\Z", re.ASCII)


class CatalogError(Exception):
    def __init__(self, code, message, status=400, **details):
        super().__init__(message)
        self.code, self.status = code, status
        self.body = {"code": code, "error": message, **details}


def _invalid(message, code="invalid_catalog"):
    raise CatalogError(code, message)


def _keys(value, required, optional=(), *, code="invalid_catalog"):
    if type(value) is not dict or set(value) - set(required) - set(optional) or not set(required) <= set(value):
        _invalid("Missing or unsupported fields", code)


def _slug(value, *, code="invalid_catalog"):
    if type(value) is not str or not 1 <= len(value) <= 80 or not SLUG.fullmatch(value):
        _invalid("Expected a lowercase hyphenated slug of at most 80 characters", code)
    return value


def _integer(value, maximum, *, code="invalid_catalog"):
    if type(value) is not int or not 1 <= value <= maximum:
        _invalid(f"Expected an integer between 1 and {maximum}", code)
    return value


def _text(value, maximum=160):
    if type(value) is not str or not value or len(value) > maximum or value != value.strip():
        _invalid("Expected bounded nonempty text without surrounding whitespace")
    if any(ord(c) < 32 or 127 <= ord(c) <= 159 for c in value):
        _invalid("Unsupported control character")
    try:
        value.encode("utf-8")
    except UnicodeError:
        _invalid("Invalid Unicode text")
    return value


def _array(value, minimum, maximum):
    if type(value) is not list or not minimum <= len(value) <= maximum:
        _invalid(f"Expected an array with {minimum} to {maximum} items")
    return value


def _language(value, *, code="invalid_request"):
    if type(value) is not str or value not in LANGUAGES:
        _invalid("Language must be exactly en or de", code)


def decimal_amount(value):
    """Validate authored wire quantities without float coercion or context drift."""
    if type(value) is not str or not AMOUNT.fullmatch(value):
        _invalid("Amount must be an unsigned plain decimal string with at most three decimal places")
    amount = Decimal(value)
    if not 0 < amount <= MAX_QUANTITY:
        _invalid("Amount must be greater than zero and at most 1000000")
    return amount


def scale_amount(source_amount, base_servings, servings):
    """Pure bounded Decimal scaling; quantities remain in the authored unit."""
    source = decimal_amount(source_amount)
    _integer(base_servings, 1000)
    _integer(servings, 1000, code="invalid_request")
    with localcontext() as context:
        context.prec = 28
        scaled = source * Decimal(servings) / Decimal(base_servings)
        if scaled > MAX_QUANTITY:
            _unavailable("quantity_out_of_range")
        scaled = scaled.quantize(QUANTUM, rounding=ROUND_HALF_UP)
        if scaled <= 0:
            _unavailable("quantity_out_of_range")
        return format(scaled, ".3f")


def _canonical(value):
    try:
        return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False,
                          separators=(",", ":")).encode("utf-8")
    except (ValueError, TypeError, UnicodeError, RecursionError):
        _invalid("Content must be finite valid JSON")


def validate_content(kind, content):
    """Return a detached canonical value; reject unknown fields at every level."""
    if type(kind) is not str or kind not in KINDS:
        _invalid("Unknown catalog kind")
    _keys(content, ("schema_version", "recipe", "variants"))
    if len(_canonical(content)) > MAX_CONTENT_BYTES:
        _invalid("Catalog content exceeds 256 KiB")
    version = content["schema_version"]
    if type(version) is not int or version not in (1, 2):
        _invalid("Unsupported catalog schema version")
    recipe = content["recipe"]
    if kind == "recipe":
        _keys(recipe, ("dish_slug", "level"))
        _slug(recipe["dish_slug"])
        if type(recipe["level"]) is not str or recipe["level"] not in ("basic", "intermediate", "advanced"):
            _invalid("Unknown recipe tier")
    elif recipe is not None:
        _invalid("Planning examples cannot claim a recipe reference")
    result = deepcopy(content)
    ids = set()
    for variant in _array(result["variants"], 1, 32):
        _keys(variant, ("id", "base_servings", "languages"))
        identity = _slug(variant["id"])
        if identity in ids:
            _invalid("Duplicate variant ID")
        ids.add(identity)
        _integer(variant["base_servings"], 1000)
        languages = variant["languages"]
        if type(languages) is not dict or not 1 <= len(languages) <= len(LANGUAGES):
            _invalid("Each variant needs an authored language")
        for language, authored in languages.items():
            _language(language, code="invalid_catalog")
            fields = ("title", "ingredients")
            if kind == "recipe":
                fields += ("method", "equipment", "time_min")
            _keys(authored, fields)
            _text(authored["title"])
            ingredients = set()
            for ingredient in _array(authored["ingredients"], 1, 200):
                fields = ("ingredient_id", "form", "unit", "amount")
                if version == 2:
                    fields += ("label", "category", "purchase_mode")
                _keys(ingredient, fields)
                _slug(ingredient["ingredient_id"])
                _slug(ingredient["form"])
                if version == 2:
                    _text(ingredient["label"])
                    if type(ingredient["category"]) is not str or ingredient["category"] not in CATEGORIES:
                        _invalid("Unsupported ingredient category")
                    if type(ingredient["purchase_mode"]) is not str or ingredient["purchase_mode"] not in PURCHASE_MODES:
                        _invalid("Unsupported ingredient purchase mode")
                if type(ingredient["unit"]) is not str or ingredient["unit"] not in (V2_UNITS if version == 2 else UNITS):
                    _invalid("Unsupported authored unit")
                key = (ingredient["ingredient_id"], ingredient["form"], ingredient["unit"])
                if key in ingredients:
                    _invalid("Duplicate ingredient/form/unit")
                ingredients.add(key)
                if ingredient["unit"] == "taste":
                    if ingredient["amount"] is not None or ingredient["purchase_mode"] != "check_cupboard":
                        _invalid("To-taste ingredients require null amount and check_cupboard purchase mode")
                else:
                    ingredient["amount"] = format(decimal_amount(ingredient["amount"]), ".3f")
            if kind == "recipe":
                for step in _array(authored["method"], 1, 100):
                    _text(step, 4000)
                for equipment in _array(authored["equipment"], 0, 50):
                    _text(equipment)
                _integer(authored["time_min"], 10080)
    if len(_canonical(result)) > MAX_CONTENT_BYTES:
        _invalid("Catalog content exceeds 256 KiB")
    return result


def content_digest(entry_id, revision, kind, content):
    return hashlib.sha256(_canonical({"entry_id": entry_id, "revision": revision,
                                      "kind": kind, "content": content})).hexdigest()


def validate_record(record):
    _keys(record, ("entry_id", "revision", "kind", "content"), ("availability", "content_digest"))
    _slug(record["entry_id"])
    _integer(record["revision"], 2147483647)
    availability = record.get("availability", "draft")
    if type(availability) is not str or availability not in AVAILABILITIES:
        _invalid("Unknown availability")
    content = validate_content(record["kind"], record["content"])
    digest = content_digest(record["entry_id"], record["revision"], record["kind"], content)
    if "content_digest" in record and record["content_digest"] != digest:
        _invalid("Content digest does not match the authored revision")
    return {"entry_id": record["entry_id"], "revision": record["revision"],
            "kind": record["kind"], "content": content,
            "availability": availability, "content_digest": digest}


def validate_transition(old, new):
    permitted = {"draft": ("draft", "published", "revoked"),
                 "published": ("published", "revoked"), "revoked": ("revoked",)}
    if type(new) is not str or new not in AVAILABILITIES:
        _invalid("Unknown availability")
    if new not in permitted.get(old, ()):
        raise CatalogError("catalog_revision_conflict", "Availability cannot be restored by rewriting history", 409)


def _stored(entry_id, revision):
    # Column mappings force an actual persisted read, ignoring ORM object caches.
    table = PlanningCatalogEntry.__table__
    return db.session.execute(select(table).where(
        table.c.entry_id == entry_id, table.c.revision == revision)).mappings().first()


def _verify(row):
    try:
        validated = validate_record({key: row[key] for key in (
            "entry_id", "revision", "kind", "availability", "content", "content_digest")})
        if validated["content"] != row["content"]:
            _invalid("Stored content is not canonical")
    except CatalogError:
        raise CatalogError("catalog_integrity_error", "Catalog content is temporarily unavailable", 503) from None
    return validated


def sync_catalog(records=()):
    """Append trusted authored revisions; defaults to no content and no publish.

    Replaying matching content preserves CURRENT availability, especially revoked.
    Caller owns transaction/rollback and serializes administrative sync jobs.
    """
    if type(records) not in (list, tuple) or len(records) > 1000:
        _invalid("Sync accepts at most 1000 authored records")
    validated = [validate_record(record) for record in records]
    unique = {}
    for record in validated:
        key = (record["entry_id"], record["revision"])
        if key in unique and unique[key] != record:
            raise CatalogError("catalog_revision_conflict", "Conflicting duplicate authored revision", 409)
        unique[key] = record
    additions, result = [], []
    table = PlanningCatalogEntry.__table__
    # Complete the validation/conflict pass before adding any row to the session.
    for record in sorted(unique.values(), key=lambda value: (value["entry_id"], value["revision"])):
        old = _stored(record["entry_id"], record["revision"])
        if old:
            old = _verify(old)
            if old["content_digest"] != record["content_digest"]:
                raise CatalogError("catalog_revision_conflict", "Revision already retains different authored content", 409)
            result.append(old)
            continue
        history = db.session.execute(select(table.c.kind, table.c.revision).where(
            table.c.entry_id == record["entry_id"])).all()
        earlier = [item for item in additions if item["entry_id"] == record["entry_id"]]
        if (any(item.kind != record["kind"] or item.revision >= record["revision"] for item in history)
                or any(item["kind"] != record["kind"] for item in earlier)):
            raise CatalogError("catalog_revision_conflict", "New revisions must increase and retain the entry kind", 409)
        additions.append(record)
        result.append(record)
    for record in additions:
        db.session.add(PlanningCatalogEntry(**record))
    if additions:
        db.session.flush()
    return deepcopy(result)


def set_availability(entry_id, revision, availability):
    _slug(entry_id)
    _integer(revision, 2147483647)
    row = db.session.execute(select(PlanningCatalogEntry).where(
        PlanningCatalogEntry.entry_id == entry_id, PlanningCatalogEntry.revision == revision)
        .with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
    if row is None:
        _unavailable("entry_missing")
    _verify({key: getattr(row, key) for key in ("entry_id", "revision", "kind", "availability", "content", "content_digest")})
    validate_transition(row.availability, availability)
    row.availability = availability
    db.session.flush()
    return {"entry_id": entry_id, "revision": revision, "availability": availability}


def validate_selection(entry_id, revision, language, options, servings):
    _slug(entry_id, code="invalid_request")
    _integer(revision, 2147483647, code="invalid_request")
    _language(language)
    _keys(options, ("variant_id",), code="invalid_request")
    _slug(options["variant_id"], code="invalid_request")
    _integer(servings, 1000, code="invalid_request")


def _unavailable(reason):
    raise CatalogError("catalog_unavailable", "The exact authored selection is unavailable", 409, reason=reason)


def _current_user(user):
    identity = getattr(user, "id", None)
    if type(identity) is not int or identity <= 0:
        raise CatalogError("invalid_session", "Authentication required", 401)
    row = db.session.execute(select(User.id, User.plan).where(User.id == identity)).first()
    if row is None:
        raise CatalogError("invalid_session", "Authentication required", 401)
    return SimpleNamespace(id=row.id, plan=row.plan)


def _eligible(row, language, user):
    if row is None:
        _unavailable("entry_missing")
    row = _verify(row)
    if row["availability"] != "published":
        _unavailable("revoked" if row["availability"] == "revoked" else "not_published")
    if not any(language in variant["languages"] for variant in row["content"]["variants"]):
        _unavailable("language_missing")
    recipe = row["content"]["recipe"]
    if recipe is not None:
        exists = db.session.execute(select(RecipeTier.id).join(Dish, Dish.id == RecipeTier.dish_id).where(
            Dish.slug == recipe["dish_slug"], RecipeTier.level == recipe["level"], RecipeTier.lang == language)).first()
        if exists is None:
            _unavailable("recipe_missing")
        allowed, _reason = tier_access(recipe["level"], user)
        if not allowed:
            _unavailable("recipe_inaccessible")
    return row


def _metadata(row, language):
    return {**{key: row[key] for key in ("entry_id", "revision", "content_digest", "kind", "availability")},
            "language": language, "recipe": deepcopy(row["content"]["recipe"])}


def _entry_view(row, language, *, summary=False):
    variants = []
    for variant in row["content"]["variants"]:
        authored = variant["languages"].get(language)
        if authored is not None:
            fields = {"title": authored["title"]} if summary else deepcopy(authored)
            variants.append({"id": variant["id"], "base_servings": variant["base_servings"], **fields})
    return {**_metadata(row, language), "variants": variants}


def list_entries(language, user):
    _language(language)
    user = _current_user(user)
    table = PlanningCatalogEntry.__table__
    rows = db.session.execute(select(table).where(table.c.availability == "published")
                              .order_by(table.c.entry_id, table.c.revision.desc())).mappings()
    entries, seen = [], set()
    for row in rows:
        if row["entry_id"] in seen:
            continue
        try:
            eligible = _eligible(row, language, user)
        except CatalogError as error:
            if error.code != "catalog_unavailable":
                raise
            continue
        entries.append(_entry_view(eligible, language, summary=True))
        seen.add(row["entry_id"])
    return {"entries": entries}


def get_entry(entry_id, revision, language, user):
    _slug(entry_id, code="invalid_request")
    _integer(revision, 2147483647, code="invalid_request")
    _language(language)
    row = _eligible(_stored(entry_id, revision), language, _current_user(user))
    return _entry_view(row, language)


def resolve(entry_id, revision, language, options, servings, user):
    validate_selection(entry_id, revision, language, options, servings)
    row = _eligible(_stored(entry_id, revision), language, _current_user(user))
    variant = next((variant for variant in row["content"]["variants"] if variant["id"] == options["variant_id"]), None)
    if variant is None:
        _unavailable("variant_missing")
    authored = variant["languages"].get(language)
    if authored is None:
        _unavailable("language_missing")
    output = {"schema_version": row["content"]["schema_version"], **_metadata(row, language), **deepcopy(authored),
              "options": deepcopy(options), "servings": servings, "base_servings": variant["base_servings"]}
    output["ingredients"] = [
        {**ingredient, "source_amount": ingredient["amount"],
         "amount": (None if ingredient["amount"] is None else
                    scale_amount(ingredient["amount"], variant["base_servings"], servings))}
        for ingredient in authored["ingredients"]
    ]
    return output


def _http(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        try:
            response = jsonify(function(*args, **kwargs))
        except CatalogError as error:
            response = jsonify(error.body)
            response.status_code = error.status
        except SQLAlchemyError:
            db.session.rollback()
            current_app.logger.error("Planning catalog database operation failed")
            response = jsonify(code="catalog_unavailable", error="Catalog is temporarily unavailable")
            response.status_code = 503
        response.headers["Cache-Control"] = "no-store"
        return response
    return wrapped


def _query_language():
    if set(request.args) != {"language"} or len(request.args.getlist("language")) != 1:
        _invalid("Exactly one language query parameter is required", "invalid_request")
    language = request.args["language"]
    _language(language)
    return language


def _selection_body():
    if request.args or not request.is_json:
        _invalid("JSON selection without query parameters required", "invalid_request")
    raw = request.stream.read(MAX_RESOLVE_BYTES + 1)
    if len(raw) > MAX_RESOLVE_BYTES:
        raise CatalogError("payload_too_large", "Catalog selection exceeds 4 KiB", 413)

    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                _invalid("Duplicate JSON field", "invalid_request")
            result[key] = value
        return result

    try:
        body = json.loads(raw, object_pairs_hook=unique_pairs,
                          parse_constant=lambda _value: _invalid("Nonfinite JSON number", "invalid_request"))
    except (ValueError, UnicodeError, RecursionError, BadRequest):
        _invalid("Malformed JSON selection", "invalid_request")
    _keys(body, ("entry_id", "revision", "language", "options", "servings"), code="invalid_request")
    return body


@_http
@jwt_required()
def catalog_list():
    return list_entries(_query_language(), get_current_user())


@_http
@jwt_required()
def catalog_get(entry_id, revision):
    return get_entry(entry_id, revision, _query_language(), get_current_user())


@_http
@jwt_required()
def catalog_resolve():
    return resolve(**_selection_body(), user=get_current_user())
