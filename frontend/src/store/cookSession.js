import useAuthStore from "./useAuthStore";

// Persists cook session attempts for a signed-in account OR a guest, so a
// mid-cook refresh reuses the same idempotency session_id (pilot-fixtures.md
// section 4/8, #48's cook-log idempotency) instead of silently starting a
// new cook attempt. This isn't reactive UI state - CookMode reads/writes it
// imperatively - so it's plain functions rather than a Zustand hook, but it
// lives in store/ and follows the other stores' account-boundary pattern
// (see the epoch subscription below).
//
// Storage key shape: (owner_namespace, owner_id, session_id) - one persisted
// record PER ATTEMPT, not one slot per owner. owner_namespace is "account"
// for a signed-in user or "guest" for a guest (pilot-fixtures.md §8) - the
// two are never comparable even if a numeric account id and a guest UUID
// ever collided, and a guest's records are never read by/migrated into an
// account's key (see getGuestId below - its own separate fixed localStorage
// key - and the complete absence of any guest->account copy path anywhere in
// this module). Each record carries session_id/dish_slug/level/lang/
// snapshot_id (fixed at session start per pilot-fixtures.md §4 - never
// mutated mid-attempt) plus current_step_id and saved cook identity.
// Teaching content is retained only by the server snapshot, not local storage.
//
// A separate per-owner index key maps dish/level/lang -> the session_id of
// the current attempt for that combo, so a bare mount (CookMode.jsx doesn't
// know the session_id in advance) can find "the record to resume for this
// dish/level/lang". The index only SELECTS which attempt-record to use - it
// is never itself the record that a completion clears; only the specific
// attempt-record identified by its own session_id is.
const recordKey = (ns, ownerId, sessionId) => `cook_session:${ns}:${ownerId}:${sessionId}`;
const indexKey = (ns, ownerId) => `cook_session:${ns}:${ownerId}:index`;
const ownerPrefix = (ns, ownerId) => `cook_session:${ns}:${ownerId}:`;

// The guest id lives under its own fixed key, wholly separate from any
// account's cook_session:account:<id>:* keys (pilot-fixtures.md §8) -
// generated once and reused for the lifetime of this browser's guest state,
// never regenerated on every visit and never written by/read from any
// account-scoped code path.
const GUEST_ID_KEY = "cookbook_guest_id";

export function getOrCreateGuestId() {
  try {
    const existing = localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(GUEST_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID(); // storage unavailable - unpersisted for this page view only
  }
}

function readIndex(ns, ownerId) {
  try {
    const raw = localStorage.getItem(indexKey(ns, ownerId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeIndex(ns, ownerId, index) {
  try {
    localStorage.setItem(indexKey(ns, ownerId), JSON.stringify(index));
  } catch {
    // storage unavailable - nothing to persist
  }
}

const comboKey = (dishSlug, level, lang) => `${dishSlug}:${level}:${lang}`;

// Returns the session_id to use for this owner+dish+level+lang: the
// persisted attempt-record if the index still points at one and it still
// exists (a refresh or remount of an in-progress cook), otherwise a freshly
// minted one (a deliberate new/again cook - no matching record because there
// was never one, or because completeSession() cleared it after a prior
// finish). ownerId is required - callers with no resolved owner get an
// unpersisted one-off id rather than throwing.
//
// ns is "account" or "guest" (pilot-fixtures.md §8) - defaults to "account"
// so every pre-existing call site (all signed-in) keeps working unchanged.
//
// snapshotId is optional and only used when a NEW record is created (a
// resumed record's snapshot_id is never overwritten by a later call - see
// pilot-fixtures.md §4: it's fixed once captured at session start).
export function getOrStartSession(ownerId, { dishSlug, level, lang, snapshotId, ns = "account", forceNew = false, attemptId } = {}) {
  if (!ownerId) return crypto.randomUUID();
  try {
    const index = readIndex(ns, ownerId);
    const combo = comboKey(dishSlug, level, lang);
    const matches = (record) => record && record.dish_slug === dishSlug && record.level === level && record.lang === lang;
    if (!forceNew && attemptId && matches(getSessionRecord(ownerId, attemptId, ns))) return attemptId;
    // Adopt the previous owner-only format once, preserving idempotency identity.
    const oldKey = `cook_session:${ns}:${ownerId}`;
    const oldRaw = ns === "account" && localStorage.getItem(oldKey);
    if (!forceNew && oldRaw) {
      let old;
      try { old = JSON.parse(oldRaw); } catch { old = null; }
      if (matches(old) && (old.owner_id == null || String(old.owner_id) === String(ownerId))
          && (old.snapshot_id == null || (Number.isInteger(old.snapshot_id) && old.snapshot_id > 0))
          && typeof old.session_id === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(old.session_id)) {
        localStorage.setItem(recordKey(ns, ownerId, old.session_id), JSON.stringify({ ...old, capture_pending: false }));
        localStorage.setItem(indexKey(ns, ownerId), JSON.stringify({ ...index, [combo]: old.session_id }));
        localStorage.removeItem(oldKey);
        return old.session_id;
      }
    }
    const existingSessionId = index[combo];
    if (!forceNew && existingSessionId) {
      const raw = localStorage.getItem(recordKey(ns, ownerId, existingSessionId));
      if (raw && matches(JSON.parse(raw))) return existingSessionId;
    }
    const sessionId = crypto.randomUUID();
    localStorage.setItem(recordKey(ns, ownerId, sessionId), JSON.stringify({
      session_id: sessionId,
      dish_slug: dishSlug,
      level,
      lang,
      snapshot_id: snapshotId ?? null,
      capture_pending: snapshotId == null,
      current_step_id: null,
    }));
    writeIndex(ns, ownerId, { ...index, [combo]: sessionId });
    return sessionId;
  } catch {
    return crypto.randomUUID(); // storage unavailable - fall back to an unpersisted session
  }
}

// Returns the full persisted record for one specific attempt (or null if
// there isn't one) - for a caller that needs more than the bare session_id,
// e.g. resuming snapshot_id/current_step_id after a reload.
export function getSessionRecord(ownerId, sessionId, ns = "account") {
  if (!ownerId || !sessionId) return null;
  try {
    const raw = localStorage.getItem(recordKey(ns, ownerId, sessionId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Persists current_step_id as the user advances - the one field on the
// record that changes turn-by-turn (pilot-fixtures.md §4). Never touches
// dish_slug/level/lang/snapshot_id, which stay fixed for the life of the
// attempt. Only ever touches the record for this exact session_id - a no-op
// if that specific attempt-record doesn't exist.
export function setCurrentStep(ownerId, sessionId, stepId, ns = "account") {
  if (!ownerId || !sessionId) return;
  const key = recordKey(ns, ownerId, sessionId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const existing = JSON.parse(raw);
    existing.current_step_id = stepId;
    localStorage.setItem(key, JSON.stringify(existing));
  } catch {
    // storage unavailable - nothing to persist
  }
}

// Sets snapshot_id on a record right after a fresh capture (a NEW session -
// never called for a resumed one, which already has it). Immutable once set
// (pilot-fixtures.md §1/§4/§9): a no-op if the record already has a
// snapshot_id, so a stray second call can never move a session onto a
// different snapshot mid-attempt.
export function setSessionSnapshot(ownerId, sessionId, snapshotId, ns = "account") {
  if (!ownerId || !sessionId) return;
  const key = recordKey(ns, ownerId, sessionId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const existing = JSON.parse(raw);
    if (existing.snapshot_id != null) return; // already pinned - never overwritten
    existing.snapshot_id = snapshotId;
    existing.capture_pending = false;
    localStorage.setItem(key, JSON.stringify(existing));
  } catch {
    // storage unavailable - nothing to persist
  }
}

// Records that this session's cook was successfully saved server-side
// (POST /api/cook-log succeeded) WITHOUT clearing the attempt-record itself
// (pilot-fixtures.md §4 save-then-reflect ordering / §13's refresh-between-
// save-and-reflection case): a refresh before reflection is submitted must
// resume the SAME session (and know its cook_log_id) rather than restarting
// the cook from step one. completeSession() below is what actually ends the
// attempt, called only once reflection is submitted or explicitly skipped.
export function setSessionCookLog(ownerId, sessionId, cookLogId, ns = "account") {
  if (!ownerId || !sessionId) return;
  const key = recordKey(ns, ownerId, sessionId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const existing = JSON.parse(raw);
    existing.cook_log_id = cookLogId;
    localStorage.setItem(key, JSON.stringify(existing));
  } catch {
    // storage unavailable - nothing to persist
  }
}

// Call once the cook is actually saved/finished - the attempt is over, so
// the next "Start cooking" for this dish/level mints a genuinely new
// session_id instead of resuming this finished one. Only clears the record
// (and index entry) for THIS session_id - a different attempt's record,
// even for the same owner, is never touched. Used for both a signed-in save
// (after POST /api/cook-log succeeds) and a guest finish (client-side only,
// pilot-fixtures.md §4's guest exception - there's no server save to wait
// on, so this is called directly once the guest reaches the finish screen).
export function completeSession(ownerId, sessionId, ns = "account") {
  if (!ownerId || !sessionId) return;
  try {
    localStorage.removeItem(recordKey(ns, ownerId, sessionId));
    const index = readIndex(ns, ownerId);
    const next = Object.fromEntries(Object.entries(index).filter(([, v]) => v !== sessionId));
    writeIndex(ns, ownerId, next);
  } catch {
    // ignore - nothing to clear
  }
}

// Drops every persisted attempt-record and the index for one owner - used
// only by the account-change boundary below, never by a single-attempt
// completion (see completeSession above). Never called for the guest
// namespace on sign-in (pilot-fixtures.md §8: a guest's stored attempts are
// never migrated OR cleared by a sign-in - they're simply never read by the
// new account, and stay under their own separate guest key untouched).
function clearAllSessions(ownerId, ns = "account") {
  if (ownerId == null) return;
  try {
    const prefix = ownerPrefix(ns, ownerId);
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix) || k === `cook_session:${ns}:${ownerId}` || k.startsWith(`reflection_pending:${ownerId}:`))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore - nothing to clear
  }
}

// Same private-state boundary useFavoritesStore already enforces for its
// own state: drop all persisted cook-session state on every account change
// (login, logout, switch, session expiry), so even a same-user re-login
// clears stale in-progress attempts rather than silently resuming them.
//
// This compares prevState.user directly rather than tracking a separate
// module-level "last owner" variable: init()'s successful /auth/me check
// (a returning user with an already-valid token) sets `user` WITHOUT
// bumping `epoch`, so a variable seeded once at module-load time (before
// that async check resolves) would stay stuck at its initial null and
// never get updated by an epoch-keyed subscription - meaning a returning
// user's session would silently fail to clear on their next logout. Using
// zustand's own prevState/state pair sidesteps that entirely: it reflects
// the actual state at each transition regardless of when this module first
// evaluated, so a real prior owner is never missed.
useAuthStore.subscribe((state, prevState) => {
  const prevOwnerId = prevState.user?.id ?? null;
  if (prevOwnerId != null && prevOwnerId !== (state.user?.id ?? null)) {
    clearAllSessions(prevOwnerId);
  }
});
