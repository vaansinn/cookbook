# #47a — Teaching pilot fixture contract

## Hardening amendment — authoritative over older implementation examples

The following tightens sections 1, 3, 4, 9, 10 and 13 without adding a broader
learning platform. Earlier examples remain historical where they differ.

- New recipe snapshots use `content.schema_version: 2` and `content.lessons`,
  a map keyed by authored step ID containing the full localized lesson, slug,
  skill slug, exact recipe reference and authored next-practice reference.
  Capture uses one SQL statement for recipe/lesson/skill consistency. These
  fields participate in the digest and are never updated after capture.
- Snapshot responses additionally expose `next_practice` outside `content`.
  It is filtered against current access and actual tier/language availability;
  this presentation metadata may change, but immutable `content` never does.
- Legacy snapshots stay untouched. Missing retained teaching data is shown as
  unavailable; neither the server nor browser fills it from today's lessons.
  A reflection's focus skill is derived only from retained server content.
- `GET /api/cook-log/<id>/reflection` returns owner-scoped flat context, including
  `revision`, `focus_skill` and optional historical fields. An absent reflection
  returns revision 0 and null fields without inserting a row. Unknown/foreign
  cooks still return 404. A legacy cook may record outcome only, not invented
  skill practice or confidence. Existing historical answers are not backfilled.
- `POST /api/reflections` accepts `cook_log_id`, a canonical UUID `mutation_id`,
  nonnegative `expected_revision`, and only touched optional fields. Null clears
  a field; omission leaves it untouched. Invalid types/values return 400.
  Outcome: happy/mixed/need_help. Confidence: unknown/wants_guidance/comfortable.
  Practice confirmation: boolean/null, never derived or defaulted to false.
- A successful revision-checked write increments the revision and atomically
  commits its reflection, any explicit current-confidence update, and its
  user-scoped mutation receipt. Repeating a mutation+payload returns its original
  result (200), without reapplying side effects. Reusing an ID for different
  content returns 409. Stale expected revisions return 409 plus
  `current_reflection`; users review those values before making a new mutation.
  Account writes serialize before the owning cook lock, covering SQLite and
  PostgreSQL and preventing races with direct confidence updates.
- Unversioned clients may create an initial reflection and replay identical
  existing fields. Differing unversioned updates return 409; they cannot silently
  overwrite newer answers. Empty new submissions create no reflection row.
- Clearing a historical confidence field leaves current confidence unchanged.
  Explicitly submitting a nonnull confidence updates current confidence in the
  same transaction. Direct `PUT /api/me/skills/<slug>` changes current confidence
  only. `GET /api/me/skills` lists saved assessments and the pilot simmering skill.
- History provides reflection corrections and independent current-confidence
  editing without a new navigation entry. Pending reflection payload/UUID pairs
  survive refresh in account/cook-scoped storage, cleared on account boundaries.
  An uncertain save offers safe retry or continuing without further changes,
  never an assertion that the server did not save it.
- Auth initialization completes before guest/account selection. Each mounted
  flow binds requests to its owner, attempt and language; obsolete reads abort
  and stale writes cannot affect newer UI. Cook URLs preserve `attempt` identity.
  Explicit Start over creates a new attempt without overwriting another one.
- The old owner-only storage record is adopted after validation, preserving
  session ID. Only after the new record and index are written is the old key
  removed. Legacy snapshot-less attempts never capture today's content silently:
  users explicitly restart or record the earlier cook through the legacy path.
- Export includes cook ID/session/language/snapshot references, reflections and
  current confidence. Account deletion removes mutation receipts before cooks.
  Snapshot references in export do not grant access to restricted content.

Release gates remain PostgreSQL fresh/populated-history verification, real UI
approval, culinary review and beginner observation. SQLite tests are not evidence
that the PostgreSQL gate has passed.

Status: final for the pilot slice (#47a). Two agents build against this without
talking to each other live — one on the teaching flow (#34a–#38a), one on
idempotent cook-logging (#48). Field names here are the ones to implement
against; if a slice needs something this doc doesn't define, propose an
addition to this file rather than inventing a parallel shape.

Scope: `dish_slug` + `level` + `lang` resolved through the existing
`Dish`/`RecipeTier` tables (`models.py`). No `RecipeVersion`/`RecipeRevision`
migration (#40/#47b) is part of this contract.

Conventions: JSON field names are `snake_case`. `level` is one of
`basic`/`intermediate`/`advanced`. `lang` is `en`/`de`. All timestamps are
UTC ISO-8601. Nothing here is a git-style diff/merge concept — see
`architecture.md`'s "no Git jargon" note.

---

## 1. Content snapshot — server-authorized, never a client hash

A cook session must be able to show and replay the *actual instructions the
user cooked from*, even after the recipe is edited or the browser is closed.
A hash alone cannot do that — it can only prove two things were equal, it
can't hand back the content. So the server stores the full content, not a
digest of it.

**New table: `recipe_content_snapshots`**

| Field | Type | Notes |
|---|---|---|
| `id` | int, PK | This *is* the snapshot reference (`snapshot_id`) held by the client and by `CookLog`. |
| `dish_slug` | string(80) | |
| `level` | string(20) | |
| `lang` | string(5) | |
| `content` | JSON | Full recipe content at capture time — the equivalent of `RecipeTier.to_dict(full=True)`: `title`, `tier_summary`, `serves`, `time_min`, `equipment`, `diet_flags`, `allergens`, `tags`, `prep`, `ingredients`, `steps`, `notes`, `nutrition`. Not a hash, not a subset — the whole thing, so it can be redisplayed on its own later even if the live recipe has changed. |
| `content_digest` | string | Deterministic digest of `content`, used **only** to decide whether an existing row already represents this exact content (see reuse rule below). It is a lookup key, not the authorization artifact — the row's `content` column is. |
| `created_at` | datetime | |

`__table_args__`: unique on `(dish_slug, level, lang, content_digest)` so a
retried or repeated capture of unchanged content resolves to the same row
instead of inserting a duplicate.

**Capture / reuse rule.** When a cook session starts (or a guest opens the
recipe to cook it), the server:
1. Computes `content_digest` for the current `RecipeTier` content.
2. Looks for an existing `recipe_content_snapshots` row with the same
   `(dish_slug, level, lang, content_digest)`. If found, reuse its `id` —
   do **not** insert a new row just because someone else is cooking the same
   unchanged recipe today.
3. Otherwise inserts a new row and returns its `id`.

**Lifecycle through a cook.** The client receives `snapshot_id` once, at
session start, and holds it through completion. It never asks the server for
"the current content" again mid-session — the whole point of the snapshot is
that it doesn't move under the user's feet, including if the recipe is edited
mid-cook.

**The one legitimate re-fetch: a page reload.** A refresh may re-request the
*same* `snapshot_id` the session already has (e.g. to redraw the UI after a
reload) — that is not "getting new content," it's redisplaying the same
immutable row, and it must come back byte-identical every time. What must
never happen is the server silently substituting whatever the live recipe
currently contains for that `snapshot_id` — a snapshot row is immutable once
created; it is never updated in place.

**Entitlement is re-checked on every read, not just at creation.** Every read
of a snapshot (initial capture, a reload, anything) re-runs the same
tier/premium check `access.py` applies to live recipes, using the snapshot's
own `dish_slug`/`level` and the requester's *current* access — not whatever
access they had when the session started. Example: a premium subscription
lapses mid-session; the next snapshot read for an `advanced` snapshot must
fail access, even though the session already had the snapshot id in hand.
Holding a `snapshot_id` is not itself a substitute credential.

**Old cooks with no captured snapshot** (anything logged before this table
exists) show as "source content unknown" — never backfilled with today's
content and mislabeled as original.

---

## 2. Step identity — stable ID, full tier+language identity, not text matching

**A step reference is the 4-tuple `(dish_slug, level, lang, step_id)`.**
Not `(dish_slug, step_id)` and not `(recipe_slug, step_id)` — Basic and
Advanced instructions for the same dish are genuinely different text, and EN
and DE are separate translations with their own step content. A `step_id`
only means something once you also know which tier and which language it
lives in.

`step_id` is a stable string set by the recipe author (e.g. `"simmer-15"`),
carried in the structured step data introduced by #35's step format. It must
survive copy edits to the instruction text — it is not a numeric array
index, and not derived from the instruction wording.

**Lesson-to-step link.** A `Lesson` (or its recipe-link table, #34a) that
points at a specific instructional moment in a recipe stores:

```
{
  "dish_slug": "lentil-bolognese",
  "level": "basic",
  "lang": "en",
  "step_id": "simmer-15"
}
```

**Sync-time validation is mandatory and must fail loudly.** When
`scripts/sync_learning.py` (or whatever #34a's sync entry point is) commits a
lesson's recipe/step links, it must resolve every one of these 4-tuples
against the actual synced `RecipeTier` step data for that exact
`(dish_slug, level, lang)`. A link that doesn't resolve — wrong step_id,
wrong level, wrong lang, step renamed/removed — aborts the sync with a clear
error identifying the broken link. It must never publish a lesson with a
dangling step reference, and must never fall back to "closest text match."

**Glossary trigger-word matching is a separate, unrelated mechanism.**
`GlossaryLinkedText.jsx` auto-links any occurrence of an authored trigger
word (`GlossaryEntry.trigger_words`) wherever it appears in recipe prose —
it's a best-effort *display* convenience, not an instructional association,
and it has no `step_id` or level/lang awareness at all (today it only
matches English text; see the file's own comment). It must never be used to
decide which step a lesson is teaching against — that association is only
ever the explicit 4-tuple above, resolved and validated at sync time.

---

## 3. Reflection payload — four distinct fields, never conflated

`CookReflection` (or equivalent fields on a reflection endpoint) carries
four independent pieces of information. None of them is inferable from any
of the others.

| Field | Type | Meaning |
|---|---|---|
| `outcome` | string or null | Optional. Free text or a selected value (e.g. `"happy"` / `"mixed"` / `"need_help"` per the product copy in the implementation plan). How it went — not evidence of anything else. |
| `practiced_skill_confirmed` | bool, no default | Explicit, user-clicked confirmation that they actually practiced *the cook's specific focus skill*. This is never set from "the recipe was marked complete" — completing a cook proves nothing about practice on its own. If the user never answers this question, the field is simply absent/null, not `false`. |
| `confidence` | string or null | Optional self-assessment (e.g. `unknown` / `wants_guidance` / `comfortable`), editable independently of `outcome` — changing one must not touch the other. Also independently updatable later outside this reflection payload (see #37's `PUT /api/me/skills/<slug>`). |
| *(skip)* | — | The skip path is the absence of a `CookReflection`/`SkillPractice` row at all — not a row with all fields defaulted. Skipping records nothing, and specifically must never synthesize `practiced_skill_confirmed = true` from the fact that the cook itself was saved. |

A single reflection submission may set `outcome`, `practiced_skill_confirmed`,
and `confidence` together, but each is optional/independent except that
`practiced_skill_confirmed` — when present at all — must be an explicit
boolean the user affirmatively set, never a computed default.

---

## 4. Cook-session lifecycle

**Identity and keying.** A cook session is scoped to *one* of:
- a signed-in account (`user_id` from the decoded JWT), or
- a distinct guest namespace (a client-generated guest id, never a `user_id`
  of `null`/`0` masquerading as one, and never merged into the signed-in
  keyspace even if the same browser later signs in).

These two are never mixed under one storage key.

The session key is **not** bare `(dish_slug, level)`. The lookup key a
session is keyed by is:

```
(owner_namespace, owner_id, session_id)
```

— where `owner_namespace` is `"account"` for a signed-in user or `"guest"`
for a guest (so the two are never comparable, even if a numeric `owner_id`
and a guest id ever collided), `owner_id` is the account's `user_id` for
signed-in users or the guest namespace id for guests, and `session_id` alone
disambiguates two separate attempts by the same owner at the same
dish/level/lang.

`dish_slug`, `level`, `lang`, `snapshot_id`, and `current_step_id` are
**fields on** the stored record, not part of what identifies it — a value
that changes as a side effect of using the record (as `current_step_id`
does, every time the user advances a step) can't also be part of the key
used to look that same record up. Of these fields, `dish_slug`/`level`/
`lang`/`snapshot_id` are fixed once captured at session start, for the life
of one cook attempt — they identify *what* is being cooked and from *which*
content, and never change turn-by-turn. Only `current_step_id` and
completion/reflection state are expected to change as the user progresses.
A deliberate switch to a different recipe/tier starts a new attempt (a new
`session_id`), never a silent mutation of the existing record's recipe/
snapshot fields.

**`session_id` minting.** A new `session_id` is generated only for a
deliberate new cook — the user explicitly chose "Start cooking" / "Cook
again" / "Start over." It is never minted on every component mount or page
load; a refresh or remount reuses the `session_id` already held for that
in-progress cook.

**Clearing.** All of this per-user session state (signed-in or guest) is
cleared on logout and on account switch — this is the same private-state
boundary #50's cache/store-reset work already has to enforce for other
stores; cook-session state joins that reset, not a separate mechanism.

**Concurrency / idempotency.** Two submissions of the same finish action
(double-tap, retry after a flaky response) for the same `(user_id,
session_id)` must produce exactly one saved `CookLog` row, decided
transactionally at the database level via a unique constraint on
`(user_id, session_id)` — not via a client-side "already submitting" flag
alone, since that can't stop a genuine second network request. See section 6
for the exact request/response shape this produces.

**Signed-in save-then-reflect ordering.**
1. The cook-completion save (`POST /api/cook-log`) happens and must succeed
   **before** reflection is ever offered. Reflection is strictly additive to
   an already-saved `CookLog` row — it is never a precondition for that row
   existing.
2. Skipping reflection (or answering only part of it) leaves the saved
   `CookLog` row exactly as it was saved — nothing about the save is
   retroactively incomplete because reflection was skipped.
3. If the completion save fails (network error, 5xx, validation error), the
   UI must show a visible error state with a retry action on the same
   screen. It must never navigate the user forward (e.g. to the reflection
   or next-practice screen) as though the save had succeeded — that would
   silently lose the cook.

**Guest exception.** Guests are the one stated exception to "save before
reflection," because for a guest there is no server-side save to sequence
against at all (section 5). A guest completes the cook entirely client-side
and is shown the next-practice suggestion (section 7) without any server
round-trip and without being pushed to register. This is a sequencing
exception for accounts, not a gate on the teaching content itself — guests
still get the full teaching flow, just with no persisted record.

---

## 5. Guest snapshot handling

A guest reads and reuses **the same** `recipe_content_snapshots` row as any
signed-in visitor to that `dish_slug`/`level`/`lang` — the reuse rule in
section 1 applies identically; a guest visit never forces a new snapshot row
to be inserted for otherwise-unchanged content. (In practice a guest can
only ever reach `level = basic` snapshots, since Basic is the only tier
`access.py` serves to anonymous requests — the same entitlement re-check
from section 1 still runs on every guest read.)

What a guest explicitly does **not** get, because there is no account to own
either:
- No `CookLog` row.
- No `CookReflection`/`SkillPractice`/confidence row.

Account creation stays fully optional and is never forced by the cook flow
(see section 4's guest exception). If a guest later creates an account or
logs in, **nothing is migrated or uploaded** from their guest session —
their reflection/confidence answers, if any, were never persisted anywhere,
so there is nothing to attach to the new account, and none of it may
retroactively appear there. This is a hard rule, not an oversight: don't build
a "carry over guest state on signup" path for this data.

---

## 6. Cook-log idempotency endpoint — request/response shape

`POST /api/cook-log` — the endpoint #48's reliability logic implements
against. Signed-in only (guests never call this — section 5).

### Request

```json
{
  "session_id": "b3f1c2d0-8a41-4e2a-9b1a-6b6a2e6a9f10",
  "dish_slug": "lentil-bolognese",
  "level": "basic",
  "lang": "en",
  "snapshot_id": 482
}
```

- `session_id`: string, client-generated UUID, minted per section 4's rule.
  This is the idempotency key, scoped per-user by the unique constraint
  below.
- `dish_slug` / `level` / `lang`: the resolved recipe reference being
  logged.
- `snapshot_id`: FK into `recipe_content_snapshots` — the exact content this
  cook was performed against (section 1).

### Server-side constraint

`cook_logs` gets a unique constraint on `(user_id, session_id)` (an
additive migration — `user_id` from the decoded JWT, never the request
body). The route inserts inside a transaction and reacts to the constraint
rather than pre-checking-then-inserting (to actually close the race, not
just narrow it):

- Insert succeeds → **fresh success**.
- Insert violates the unique constraint → re-read the existing row for
  `(user_id, session_id)` and compare its stored `(dish_slug, level, lang,
  snapshot_id)` against the incoming request:
  - Same payload → **idempotent replay** (the double-tap case).
  - Different payload → **conflict** (the client is reusing a `session_id`
    that already means something else — a client bug or a stale retry
    against a `session_id` that should have been re-minted).

### Response — fresh success

`201 Created`

```json
{
  "status": "created",
  "cook_log": {
    "id": 9931,
    "session_id": "b3f1c2d0-8a41-4e2a-9b1a-6b6a2e6a9f10",
    "dish_slug": "lentil-bolognese",
    "level": "basic",
    "lang": "en",
    "snapshot_id": 482,
    "cooked_at": "2026-09-06T14:02:11Z"
  }
}
```

### Response — idempotent replay (same session_id, same payload)

`200 OK`, same `cook_log` body as the original insert (the already-saved
row, not a new one):

```json
{
  "status": "already_saved",
  "cook_log": {
    "id": 9931,
    "session_id": "b3f1c2d0-8a41-4e2a-9b1a-6b6a2e6a9f10",
    "dish_slug": "lentil-bolognese",
    "level": "basic",
    "lang": "en",
    "snapshot_id": 482,
    "cooked_at": "2026-09-06T14:02:11Z"
  }
}
```

The client cannot distinguish this from the fresh-success case just by
reading `cook_log` — treat both as "the cook is saved, proceed to
reflection." `status` is what tells you which happened, if you care.

### Response — conflict (same session_id, different payload)

`409 Conflict`

```json
{
  "status": "conflict",
  "error": "session_id already logged with different parameters",
  "existing_cook_log": {
    "id": 9931,
    "session_id": "b3f1c2d0-8a41-4e2a-9b1a-6b6a2e6a9f10",
    "dish_slug": "lentil-bolognese",
    "level": "intermediate",
    "lang": "en",
    "snapshot_id": 470,
    "cooked_at": "2026-09-06T13:55:02Z"
  }
}
```

The client must not overwrite or merge into `existing_cook_log`. This is the
signal (section 4's retry rule) to surface a visible error/retry state — a
409 here is not "saved," and the frontend must not treat it as success.

---

## 7. Next-practice link shape

Returned alongside (or after) a completed cook, whether the user is a guest
or signed-in:

```json
{
  "dish_slug": "chickpea-tikka-masala",
  "level": "basic",
  "lang": "en",
  "reason": "Try keeping a steady simmer in another dish."
}
```

- `dish_slug` / `level` / `lang`: an existing, access-checked recipe
  reference the user is actually eligible to open (never a locked tier as
  the only suggestion).
- `reason`: a short authored string explaining *why* this is being
  suggested — not a generic "try this next," and not computed/opaque. The
  example above is deliberately neutral/outcome-agnostic: section 3 makes
  `practiced_skill_confirmed` optional and skippable, so the default reason
  text must never presume practice happened when it might not have (i.e.
  never phrase it as "you just practiced X"). Personalized "you practiced
  X" phrasing is only appropriate once `practiced_skill_confirmed` is
  actually `true` for that session — never as the default/fallback wording.
- Always skippable/dismissable: the user can ignore it and browse normally;
  it is a suggestion, never a required next step, and dismissing it must not
  affect the already-saved cook or reflection in any way.

---

## 8. Guest session identity

Extends section 4's identity model (`owner_namespace`/`owner_id`/`session_id`)
and section 5's snapshot-reuse rule to fix how "guest" is actually realized
on the client — not just that it's a distinct namespace.

- A guest gets `owner_namespace = "guest"` and an `owner_id` that is a
  client-generated UUID (the guest id) — never `null`/`0` masquerading as an
  account id (section 4's existing rule).
- The guest id is stored under its own **fixed** `localStorage` key, wholly
  separate from any account's storage — generated once and reused for the
  lifetime of that browser/guest, never read from or written into an
  account's key and vice versa. (`frontend/src/store/cookSession.js`'s
  existing key-shape comment already reserves the `guest` namespace segment
  for this — see the note there on `cook_session:account:<owner_id>`.)
- The per-attempt storage identity is the **same**
  `(owner_namespace, owner_id, session_id)` triple section 4 establishes for
  signed-in accounts — a guest's in-progress cook is looked up and resumed
  exactly the same way, just under `owner_namespace = "guest"`.
- **Refresh resumes exactly like a signed-in user's.** A guest's page reload
  must resume the same `snapshot_id`/`current_step_id` from the persisted
  record. There is no special-cased "guests don't get to resume" path —
  section 1's "one legitimate re-fetch: a page reload" rule and section 5's
  snapshot-reuse rule apply identically to a guest read.
- **Sign-in never inherits guest state.** If a guest later creates an
  account or signs in on the same browser, nothing from the guest's stored
  attempt(s) is read, migrated, or attached to the new account — this
  sharpens section 5's existing "nothing is migrated or uploaded" rule to
  explicitly cover the *session* record too, not only reflection/confidence
  data. The account's own storage starts empty, as if that browser had never
  cooked as a guest at all.
- **Guest completion never touches the reflection/cook-log backend.**
  Finishing a cook as a guest is a client-side-only branch: it never calls
  `POST /api/cook-log` (section 6) or any reflection endpoint (section 10)
  with a placeholder/guest identity. This is a routing decision made before
  any request is built, not a request the backend happens to reject — there
  is no guest-shaped payload for those endpoints at all.

The exact `localStorage` key name/generation timing is still left to the
implementing slice (see "Explicitly undecided" below) — this section fixes
the *shape* (namespace value, UUID, fixed-and-separate key, reuse-not-
regenerate, no migration on sign-in), not the literal string.

---

## 9. Pinning the lesson content a session actually showed

Section 1 already explains why a cook session stores full recipe content,
not a hash, at session start: a resumed session must redisplay the *actual
instructions the user cooked from*, even if the live recipe is edited
afterward. The identical problem exists one level up, for the contextual
teaching content (the `Lesson` shown alongside a step, section 2) — and the
fix is the same shape of fix.

**The gap.** A resumed content snapshot (section 1) correctly redisplays the
frozen recipe steps. But if the `Lesson` linked to one of those steps is
edited after the session started — copy improved, a success cue reworded,
an example changed — a resumed session would show *today's* lesson text
next to *yesterday's* frozen recipe. That's exactly the inconsistency the
snapshot mechanism exists to prevent, applied here to teaching content
instead of recipe content, and it is not automatically covered by section
1's recipe-content fix alone.

**Requirement.** The full lesson content actually shown to the user at
session start must be retained **immutably** — either embedded directly in
the content snapshot, or referenced through its own immutable stored record
(a lesson-content snapshot, parallel to section 1's
`recipe_content_snapshots`). A digest of the lesson body does not satisfy
this, for the same reason section 1 rules out a recipe-content hash: a
digest can only prove two things were equal, it cannot hand back the
content to redisplay.

**What resumption must do.** A resumed session's contextual help must read
what was pinned for that session at its start — never perform a live
`Lesson` lookup by slug/step_id at resume time. The exact schema (embedded
on the recipe snapshot vs. its own `lesson_content_snapshots` table vs.
something else) is left to the implementing agent; this section fixes the
non-negotiable behavior, not the storage shape. Section 10 below relies on
this same pinned reference for resolving `practiced_skill_confirmed`.

---

## 10. Confidence is separate from reflection, with an explicit interaction rule

Section 3 already distinguishes three independent fields on a reflection:
`outcome`, `practiced_skill_confirmed`, and `confidence`. This section
extends that distinction to fix where the *authoritative* confidence value
lives and exactly how the two interact.

**Two places confidence can be written:**

| Source | Scope | Meaning |
|---|---|---|
| `PUT /api/me/skills/<slug>` (dedicated endpoint, referenced in section 3 and #37) | One row per `(user, Skill)` | The user's *current* confidence in that skill — the authoritative value shown anywhere "your current confidence" appears. Editable any time, independent of any specific cook. |
| `confidence` on a `CookReflection` (section 3) | One row per reflection | The confidence *assessed at that cook's submission* — a point-in-time record of what the user said right after that specific cook, not the authoritative current value. |

**The interaction rule:**
- Submitting `confidence` through a reflection **also updates** current
  confidence (the `Skill`-scoped row above) — a completed cook is a natural
  moment to update it, so the write is not confined to the reflection row
  alone.
- A later, separate edit via `PUT /api/me/skills/<slug>` updates **only**
  current confidence. It never reaches back and rewrites what a past
  `CookReflection` recorded — that row stays a historical record of what was
  said at that cook, even after the user's current confidence has since
  moved on.
- **This side effect fires only on a genuinely new confidence submission,
  never on a mechanical retry of an already-saved reflection.** Retrying a
  reflection whose save already succeeded (the same double-tap/flaky-network
  case section 6 handles for the cook-log save, extended to reflections in
  section 13) must not reapply that reflection's old confidence value on top
  of whatever current confidence has since become via an independent, later
  edit. Concretely: "replaying an existing reflection" (the save already
  happened; this request is a retry of the same submission) and "submitting
  a new/edited confidence value" (a genuinely new write) must be treated as
  distinct operations by the implementation, even when both arrive at the
  same endpoint — the same "decide it transactionally, don't rely on client
  state" discipline section 6 requires for cook-log idempotency applies here
  to *whether the current-confidence side effect fires at all*, not just to
  whether a duplicate row gets created.

**Resolving against pinned content, not the live record.** A reflection's
own `practiced_skill_confirmed` must resolve against the skill *as pinned
for that cook* (section 9) — whichever `Lesson`/`Skill` reference was
actually shown during that session — never whatever the live `Lesson`/
`Skill` linkage happens to be by the time the reflection is submitted or
read back later. If a lesson's skill or step link is repointed after the
cook, a past reflection's `practiced_skill_confirmed` still means
"confirmed for the skill shown at the time," never silently reinterpreted
against today's linkage.

---

## 11. The lesson API contract

Two request shapes resolve to the same underlying `Lesson`:
- **By lesson slug** — a standalone lesson page (see `LessonPage.jsx`'s
  mockup), e.g. `GET /api/lessons/<slug>`.
- **By reference** — the exact 4-tuple `(dish_slug, level, lang, step_id)`
  from section 2, for in-cook contextual help.

Both paths must resolve to the identical `Lesson` row when they name the
same lesson — there is no separate "in-cook" copy of a lesson's content.

**Language mismatch: falls back to `en`, never 404s.** If a lesson request
names a `lang` with no authored content for that lesson, the response falls
back to the lesson's `en` copy rather than 404ing. A recipe can 404 on a
missing tier/language (there's genuinely no `RecipeTier` row to serve), but
a lesson that exists in one language and not the other still has
*something* useful to show — a hard 404 mid-cook on contextual help would
be a worse experience than showing it in English. (This mirrors
`sync_learning.py`'s own shape: `title`/`body` are keyed by language on one
`Lesson` row, so a missing language is a gap in that dict, not a missing
row.)

**Tier/premium access.** `Lesson` itself has no tier column (`models.py`) —
a lesson response respects the same tier/premium check `access.py` applies
to the recipe it's attached to (see the top-level project's "Access is
three-tiered" note), resolved via the linked `RecipeTier`'s `level` — i.e.
`tier_access(lesson.level, user)` using the `dish_slug`/`level` the lesson's
own recipe/step link names (section 2). A lesson attached to an `advanced`
step is gated exactly like the `advanced` recipe it belongs to, re-checked
on every read — the same "entitlement is re-checked on every read, not just
at creation" rule section 1 states for recipe snapshots.

**Next-practice suggestion filtering.** Any next-practice suggestion
returned alongside a lesson (the `next_practice` block `sync_learning.py`
parses, section 7's shape) is filtered to a `dish_slug`/`level`/`lang` the
*current* requester can actually open, via that same `tier_access()` check.
If no eligible suggestion exists for this requester (e.g. the authored
next-practice target is `advanced` and the requester isn't premium), the
suggestion is omitted from the response entirely — never returned as a
locked tile, and never substituted with a broken/guessed link.

---

## 12. Checkbox semantics — `practiced_skill_confirmed`

Restates and sharpens section 3's existing rule with an explicit
implementation note: a `practiced_skill_confirmed` checkbox that starts
unchecked and is never touched by the user must submit as absent/null in
the reflection payload — never `false`. `false` means "the user was asked
and said no"; unanswered means the question was never affirmatively
answered at all, and section 3 already forbids treating those as the same
thing.

**Implementation note.** A naive `useState(false)` for this control
conflates "never answered" with "explicitly unchecked" — both read as
`false`. The control's touched/untouched state must be tracked as a fact
independent of its checked state (e.g. a three-state `null`/`true`/`false`
value, or a separate `touched` boolean alongside the checked flag), and the
payload must send `null`/absent unless the user actually interacted with
it.

---

## 13. Recovery/edge-case acceptance criteria

An implementation of this contract must satisfy all of the following:

- **Refresh between cook-log save and reflection.** A refresh after the
  cook-log save (section 6) succeeds but before reflection is submitted
  must not lose the saved cook: the saved `CookLog` row stays saved, and
  reflection is still offered or resumable against the right cook — never
  re-prompted as if the cook itself needs re-saving, and never silently
  dropped.
- **Failed reflection submission.** A reflection submission that fails
  (network error, 5xx) must surface a visible retry — the same pattern
  section 4 already requires for a failed cook-log save — never silently
  dropped with no user-visible sign anything went wrong.
- **Duplicate reflection submissions.** Two submissions of the same
  reflection (a retry after a slow or ambiguous response) must produce one
  reflection row, not two — the same idempotency discipline section 6
  applies to `cook_logs`, applied here to reflections.
- **Partial edits don't clobber other fields.** Editing an already-submitted
  reflection to change only `confidence` must not reset `outcome` or
  `practiced_skill_confirmed` to null — an edit touches only the field(s)
  actually submitted in that edit, per section 3's "each is
  optional/independent" rule.
- **Pre-snapshot legacy records degrade, never crash or fabricate.**
  Resuming a session whose persisted record predates the snapshot mechanism
  (or otherwise has no `snapshot_id`) degrades to "source content unknown"
  — the same rule section 1 already states for pre-snapshot `CookLog` rows,
  applied here to session records generally. It must never crash, and must
  never fabricate a snapshot for content it can no longer prove was
  actually shown.

---

## Explicitly undecided — do not guess past this

- **Who generates `session_id`.** This doc assumes client-generated UUID
  (simplest, and lets the client mint it once at "Start cooking" without a
  round-trip). If #48 finds a reason the server must mint it instead, that's
  a change to this contract, not a silent per-implementation choice.
- **Exact `outcome` enum values** beyond the three named in the product plan
  (`happy` / `mixed` / `need_help`) — confirm final copy/keys with the
  content agent (#33a) before locking the column's allowed values.
- **Guest namespace mechanics — narrowed by section 8.** Section 8 now fixes
  the *shape* (`owner_namespace = "guest"`, a client-generated UUID, its own
  fixed and separate `localStorage` key, reuse-not-regenerate, no migration
  on sign-in). What's still left to whichever slice implements the
  guest-side client state (#36a/#37a): the literal `localStorage` key name
  and exactly when the guest id is first generated (first Basic recipe view
  vs. first "Start cooking" tap, etc.) — cosmetic choices within section 8's
  fixed shape, not open questions about the shape itself.
- **Step data shape pre-#35.** Section 2 assumes structured steps with a
  `step_id` field exist by the time lesson-step links are validated. Until
  #35a lands, `RecipeTier.steps` is `list[str]` with no stable ID — #34a's
  sync validation has nothing to resolve against for those recipes. Do not
  invent a synthetic `step_id` (e.g. array index) as a stand-in; block the
  lesson-recipe link for a dish until its steps are converted, and say so in
  the sync's validation error.
