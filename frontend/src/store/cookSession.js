import useAuthStore from "./useAuthStore";

// Persists the one in-progress cook session for the signed-in account, so a
// mid-cook refresh reuses the same idempotency session_id (pilot-fixtures.md
// section 4 / #48's cook-log idempotency) instead of silently starting a new
// cook attempt. This isn't reactive UI state - CookMode reads/writes it
// imperatively - so it's plain functions rather than a Zustand hook, but it
// lives in store/ and follows the other stores' account-boundary pattern
// (see the epoch subscription below).
//
// Storage key shape: (owner_namespace, owner_id) - one active cook session
// per owner at a time. owner_namespace is the literal string "account" for a
// signed-in user; there's no guest support yet (Wave 3), but the namespace
// segment leaves room for a future "guest" value without a key-shape change.
// The persisted record carries session_id/dish_slug/level/lang/snapshot_id
// (fixed at session start per pilot-fixtures.md §4 - never mutated
// mid-attempt) plus current_step_id (the one field expected to change
// turn-by-turn as the user advances).
const storageKey = (ownerId) => `cook_session:account:${ownerId}`;

// Returns the session_id to use for this owner+dish+level+lang: the
// persisted one if it matches (a refresh or remount of an in-progress cook),
// otherwise a freshly minted one (a deliberate new/again cook - no matching
// record because there was never one, or because completeSession() cleared
// it after a prior finish). ownerId is required - callers with no signed-in
// owner (shouldn't happen; CookMode is behind RequireAuth) get an
// unpersisted one-off id rather than throwing.
//
// snapshotId is optional and only used when a NEW record is created (a
// resumed record's snapshot_id is never overwritten by a later call - see
// pilot-fixtures.md §4: it's fixed once captured at session start). Callers
// that don't pass it (e.g. today's CookMode.jsx, unchanged in this pass)
// keep working exactly as before - the return value is still just the
// session_id string.
export function getOrStartSession(ownerId, { dishSlug, level, lang, snapshotId } = {}) {
  if (!ownerId) return crypto.randomUUID();
  const key = storageKey(ownerId);
  try {
    const raw = localStorage.getItem(key);
    const existing = raw ? JSON.parse(raw) : null;
    if (existing && existing.dish_slug === dishSlug && existing.level === level && existing.lang === lang) {
      return existing.session_id;
    }
    const sessionId = crypto.randomUUID();
    localStorage.setItem(key, JSON.stringify({
      session_id: sessionId,
      dish_slug: dishSlug,
      level,
      lang,
      snapshot_id: snapshotId ?? null,
      current_step_id: null,
    }));
    return sessionId;
  } catch {
    return crypto.randomUUID(); // storage unavailable - fall back to an unpersisted session
  }
}

// Returns the full persisted record for the owner's in-progress session (or
// null if there isn't one) - for a caller that needs more than the bare
// session_id, e.g. resuming snapshot_id/current_step_id after a reload.
export function getSessionRecord(ownerId) {
  if (!ownerId) return null;
  try {
    const raw = localStorage.getItem(storageKey(ownerId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Persists current_step_id as the user advances - the one field on the
// record that changes turn-by-turn (pilot-fixtures.md §4). Never touches
// dish_slug/level/lang/snapshot_id, which stay fixed for the life of the
// attempt. A no-op if there's no in-progress record for this owner.
export function setCurrentStep(ownerId, stepId) {
  if (!ownerId) return;
  const key = storageKey(ownerId);
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
// genuinely new session_id instead of resuming this finished one.
export function completeSession(ownerId) {
  if (!ownerId) return;
  try {
    localStorage.removeItem(storageKey(ownerId));
  } catch {
    // ignore - nothing to clear
  }
}

// Same private-state boundary useFavoritesStore already enforces for its
// own state: drop the persisted cook session on every account change
// (login, logout, switch, session expiry), so even a same-user re-login
// clears a stale in-progress session rather than silently resuming it.
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
    completeSession(prevOwnerId);
  }
});
