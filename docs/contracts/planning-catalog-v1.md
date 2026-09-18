# Planning catalog v1

Status: infrastructure only. Q10 culinary content still requires the user's
decisions and authored review. There are no shipped entries, published seeds,
prototype imports, inferred yields, or creator-verification claims. Synthetic
published content exists only in tests. Drafts are never returned by runtime
services, including in development; there is no `allow_drafts` switch.

## Frozen integration surface

Import `planning_catalog_models` before metadata discovery. Main owns route
registration; this slice does not edit the application, routes, or shared models.
Register these functions from `planning_catalog` under `/api/planning/v1`:

| Method | Suffix | Function | Input |
| --- | --- | --- | --- |
| GET | `/catalog` | `catalog_list` | required `language=en` or `de` |
| GET | `/catalog/<entry_id>/<int:revision>` | `catalog_get` | required `language` |
| POST | `/catalog/resolve` | `catalog_resolve` | JSON selection below |

Each function authenticates independently and returns JSON with `no-store`,
including errors. There is no publishing, authoring, conversion, or sync HTTP
endpoint. Resolve is read-only. Unknown/duplicate query or JSON keys are rejected.

Service signatures (no commit and no private workspace creation):

```python
validate_selection(entry_id, revision, language, options, servings)
list_entries(language, user)
get_entry(entry_id, revision, language, user)
resolve(entry_id, revision, language, options, servings, user)
sync_catalog(records=())  # trusted server-authored input only
set_availability(entry_id, revision, availability)  # trusted operator only
```

Selection has exactly `entry_id`, `revision`, `language`, `options`, `servings`.
`options` has exactly `variant_id`. IDs are lowercase ASCII hyphenated slugs,
1–80 characters. Revision is an integer 1–2147483647. Servings and authored
base servings are integers 1–1000. Booleans and floats are not integers here.
Language is exactly `en` or `de`; no fallback. A variant ID identifies an entire
authored combination, not independently mixable ingredient/method switches.

`CatalogError` exposes `code`, `status`, and `body` (`code`, `error`, optional
`reason`). Invalid client input is 400 `invalid_request`. Valid but unavailable
selections are 409 `catalog_unavailable`, with reasons `entry_missing`,
`not_published`, `revoked`, `language_missing`, `variant_missing`,
`recipe_missing`, or `recipe_inaccessible`. Invalid/deleted users receive 401
`invalid_session`. Corrupt stored content fails closed with 503
`catalog_integrity_error`; database errors at the HTTP boundary return 503
`catalog_unavailable`. Authoring errors are 400 `invalid_catalog`; revision
reuse/immutable mutation is 409 `catalog_revision_conflict`.

## Authored content (closed schema)

Each trusted sync record has required `entry_id`, `revision`, `kind`, `content`
and optional `availability` (defaults to `draft`) and `content_digest` (must
match when supplied). `kind` is `recipe` or `planning_example`.

Content has exactly these fields:

```json
{
  "schema_version": 1,
  "recipe": {"dish_slug": "synthetic-fixture", "level": "basic"},
  "variants": [{
    "id": "jar",
    "base_servings": 2,
    "languages": {
      "en": {
        "title": "Synthetic test fixture — not culinary guidance",
        "ingredients": [{
          "ingredient_id": "synthetic-ingredient",
          "form": "dry",
          "unit": "g",
          "amount": "100.000"
        }],
        "method": ["Synthetic test method."],
        "equipment": ["Synthetic test equipment"],
        "time_min": 10
      }
    }
  }]
}
```

For a `planning_example`, `recipe` must be null and each language object has
**only** `title` and `ingredients`. Method, equipment, time, verified/creator
fields, nutrition, yields, and arbitrary additional fields are rejected.
Examples cannot be promoted into recipes by changing a revision's kind or
introducing a later revision of the same entry with another kind.

Recipes require exact `dish_slug` and level `basic|intermediate|advanced`.
Variant IDs are unique within content. Each variant has 1–2 language objects,
1–200 ingredients per language, 1–100 method strings for recipes, and 0–50
equipment strings. Each ingredient has exactly the four displayed fields;
`ingredient_id` and `form` are slugs. Repeated `(ingredient_id, form, unit)`
within one variant/language is rejected. Units are exactly `g`, `kg`, `ml`,
`l`, `piece`, `tsp`, `tbsp`; units and forms are preserved without conversion.
Titles/equipment are nonempty strings up to 160 characters, method strings
up to 4000 characters. Control characters, invalid Unicode, and surrounding
whitespace are rejected. Recipe `time_min` is an integer 1–10080. Content is
bounded to 256 KiB of canonical UTF-8 JSON and 32 variants; sync is bounded to
1000 records per call. These are infrastructure limits, not culinary claims.

Authored amounts are unsigned plain decimal strings with at most three
fractional digits and value `0 < amount <= 1000000`. Exponents, signs, leading
zeros, booleans, numeric JSON, NaN/infinity, and extra precision are rejected.
Validation normalizes valid amounts to exactly three decimal places before
hashing or saving. Output `amount` and `source_amount` always use that form.

## Reads, eligibility, and pinned history

`PlanningCatalogEntry` stores immutable `entry_id`, `revision`, `kind`,
`content`, and `content_digest`, with unique `(entry_id, revision)`. SHA-256
covers canonical JSON of `{entry_id, revision, kind, content}` (sorted keys,
compact separators, Unicode preserved). Availability is deliberately outside
the digest. Model insert/update guards validate content and digest and prohibit
rewriting/deleting retained revisions. SQL constraints enforce identity
uniqueness, revision range, enums, and digest length. Privileged raw SQL/bulk
DML bypasses Python guards and must not be used for catalog authorship;
resolution verifies the digest again before returning any content.

Availability is **per revision**, checked from current persisted rows on every
read, never from a saved item or an ORM identity-map snapshot. Draft can be
published or revoked; published can only be revoked; revoked is terminal.
Revoking an entry means explicitly revoking every applicable revision. Adding
a draft/new revision does not silently withdraw an older published revision.
Sync is append-only: matching content is idempotent and preserves the existing
availability, including revocation; conflicting revision reuse is rejected.
It never removes absent records or publishes existing drafts. New revisions
must increase the entry's revision number; existing identical revisions remain
replayable. Trusted operator APIs participate in the caller's transaction.

`resolve` rechecks the user's persisted account and plan, catalog availability,
the exact live `Dish`/`RecipeTier` tuple and `access.tier_access`. The current
recipe supplies eligibility only: its title, quantities, or method never
replace the pinned catalog content. Missing recipe, deleted tier/language,
downgraded account, missing variant, and revoked revision fail explicitly.
No first-variant/default-language substitution is allowed.

`list_entries` returns `{"entries": [...]}` containing the highest eligible
published revision of each entry for the requested language. `get_entry`
returns one exact revision. Both expose metadata (`entry_id`, `revision`,
`content_digest`, `kind`, `availability`, `language`, `recipe`) and `variants`,
each with `id`, `base_servings`, `title`; get additionally includes that
language's complete authored content per variant. Neither leaks unavailable
languages, draft content, or inaccessible recipe content. Lists omit unavailable
entries; direct get/resolve report the explicit unavailable reason.

Resolved output has `schema_version: 1`, the metadata above, `options`,
`servings`, `base_servings`, `title`, `ingredients`, plus `method`, `equipment`,
`time_min` for recipes only. Each ingredient preserves identity/form/unit and
adds `source_amount` (authored amount at `base_servings`). `amount` is purely
`Decimal(source_amount) * servings / base_servings`, rounded once to 0.001
with ROUND_HALF_UP. Values that exceed 1000000 before rounding or round to
zero are unavailable (`quantity_out_of_range`), not clamped. Scaling never
changes method/equipment/time, converts volume to weight, or guesses raw yield.
Consumers must retain the exact selection and re-resolve before materializing
dependent content; old saved result JSON is not current permission evidence.

## Verification boundary

### Shopping content extension (schema 2, local implementation)

Schema 1 remains valid with its original canonical bytes, digest rules and
resolved shape. Existing revisions are never rewritten. Schema 2 is an explicit
new authored revision, not an inferred upgrade or permission to publish content.

Every schema-2 ingredient additionally requires:

- `label`: authored localized nonempty text, at most 160 characters.
- `category`: `produce`, `bakery`, `cupboard`, `herbs`, `chilled`, `frozen`, or `other`.
- `purchase_mode`: `measured` or `check_cupboard`.

Ingredient/form identity is still language-independent. Labels are never matching
keys. Classification is authored, not inferred from ingredient names or category:
flour can remain measured for baking; being in the cupboard does not imply pantry
stock or a cupboard-check instruction.

Numeric units additionally allow `head`, `loaf`, `bunch`, and `pack`. These are
counts, not implied gram contents. The qualitative pair `unit: "taste"`,
`amount: null` is allowed only with `purchase_mode: "check_cupboard"`. Other units
still require a positive bounded decimal. Numeric cupboard-check quantities are
valid and retain their recipe quantities. Qualitative quantities never scale;
both resolved `amount` and `source_amount` remain null. Resolved `schema_version`
matches the retained content version. Metadata is covered by the content digest.

Older schema-1-only backend builds reject schema 2. They are **not** a supported
rollback after schema-2 records are written. Recovery must use a build that reads
both versions, or a verified pre-write backup with an explicit data-loss decision.
This extension publishes no entries and grants no culinary approval.

Tests use only synthetic content, real model metadata with in-memory SQLite,
and Flask's local test client. Migration structure and PostgreSQL DDL compilation
can be checked offline; this is not real PostgreSQL/concurrency acceptance.
Migration `c953d421ab62` follows `b842c310fa51`, inserts no rows, and refuses
downgrade while any retained catalog revision exists. No deployment, real
database, external service, or Q10 content approval is part of this slice.
