import useAuthStore from "./useAuthStore";

// Persists cook session attempts for the signed-in account, so a mid-cook
// refresh reuses the same idempotency session_id (pilot-fixtures.md section 4
// / #48's cook-log idempotency) instead of silently starting a new cook
// attempt. This isn't reactive UI state - CookMode reads/writes it
// imperatively - so it's plain functions rather than a Zustand hook, but it
// lives in store/ and follows the other stores' account-boundary pattern
// (see the epoch subscription below).
//
// Storage key shape: (owner_namespace, owner_id, session_id) - one persisted
// record PER ATTEMPT, not one slot per owner. owner_namespace is the literal
// string "account" for a signed-in user; there's no guest support yet
// (Wave 3), but the namespace segment leaves room for a future "guest" value
// without a key-shape change. Each record carries
// session_id/dish_slug/level/lang/snapshot_id (fixed at session start per
// pilot-fixtures.md §4 - never mutated mid-attempt) plus current_step_id
// (the one field expected to change turn-by-turn as the user advances).
//
// A separate per-owner index key maps dish/level/lang -> the session_id of
// the current attempt for that combo, so a bare mount (CookMode.jsx doesn't
// know the session_id in advance) can find "the record to resume for this
// dish/level/lang". The index only SELECTS which attempt-record to use - it
// is never itself the record that a completion clears; only the specific
// attempt-record identified by its own session_id is.
const recordKey = (ownerId, sessionId) => `cook_session:account:${ownerId}:${sessionId}`;
const indexKey = (ownerId) => `cook_session:account:${ownerId}:index`;
const ownerPrefix = (ownerId) => `cook_session:account:${ownerId}:`;

function readIndex(ownerId) {
  try {
    const raw = localStorage.getItem(indexKey(ownerId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeIndex(ownerId, index) {
  try {
    localStorage.setItem(indexKey(ownerId), JSON.stringify(index));
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
// finish). ownerId is required - callers with no signed-in owner (shouldn't
// happen; CookMode is behind RequireAuth) get an unpersisted one-off id
// rather than throwing.
//
// snapshotId is optional and only used when a NEW record is created (a
// resumed record's snapshot_id is never overwritten by a later call - see
// pilot-fixtures.md §4: it's fixed once captured at session start).
export function getOrStartSession(ownerId, { dishSlug, level, lang, snapshotId } = {}) {
  if (!ownerId) return crypto.randomUUID();
  try {
    const index = readIndex(ownerId);
    const combo = comboKey(dishSlug, level, lang);
    const existingSessionId = index[combo];
    if (existingSessionId) {
      const raw = localStorage.getItem(recordKey(ownerId, existingSessionId));
      if (raw) return existingSessionId; // in-progress attempt for this exact combo - resume it
    }
    const sessionId = crypto.randomUUID();
    localStorage.setItem(recordKey(ownerId, sessionId), JSON.stringify({
      session_id: sessionId,
      dish_slug: dishSlug,
      level,
      lang,
      snapshot_id: snapshotId ?? null,
      current_step_id: null,
    }));
    writeIndex(ownerId, { ...index, [combo]: sessionId });
    return sessionId;
  } catch {
    return crypto.randomUUID(); // storage unavailable - fall back to an unpersisted session
  }
}

// Returns the full persisted record for one specific attempt (or null if
// there isn't one) - for a caller that needs more than the bare session_id,
// e.g. resuming snapshot_id/current_step_id after a reload.
export function getSessionRecord(ownerId, sessionId) {
  if (!ownerId || !sessionId) return null;
  try {
    const raw = localStorage.getItem(recordKey(ownerId, sessionId));
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
export function setCurrentStep(ownerId, sessionId, stepId) {
  if (!ownerId || !sessionId) return;
  const key = recordKey(ownerId, sessionId);
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

// Call once the cook is actually saved (POST /api/cook-log succeeded) - the
// attempt is over, so the next "Start cooking" for this dish/level mints a
// genuinely new session_id instead of resuming this finished one. Only
// clears the record (and index entry) for THIS session_id - a different
// attempt's record, even for the same owner, is never touched.
export function completeSession(ownerId, sessionId) {
  if (!ownerId || !sessionId) return;
  try {
    localStorage.removeItem(recordKey(ownerId, sessionId));
    const index = readIndex(ownerId);
    const next = Object.fromEntries(Object.entries(index).filter(([, v]) => v !== sessionId));
    writeIndex(ownerId, next);
  } catch {
    // ignore - nothing to clear
  }
}

// Drops every persisted attempt-record and the index for one owner - used
// only by the account-change boundary below, never by a single-attempt
// completion (see completeSession above).
function clearAllSessions(ownerId) {
  if (ownerId == null) return;
  try {
    const prefix = ownerPrefix(ownerId);
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
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
