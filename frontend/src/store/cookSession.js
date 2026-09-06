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
// The persisted record itself carries session_id/dish_slug/level/lang
// (no snapshot_id yet - that arrives with a later wave's snapshot table).
const storageKey = (ownerId) => `cook_session:account:${ownerId}`;

// Returns the session_id to use for this owner+dish+level+lang: the
// persisted one if it matches (a refresh or remount of an in-progress cook),
// otherwise a freshly minted one (a deliberate new/again cook - no matching
// record because there was never one, or because completeSession() cleared
// it after a prior finish). ownerId is required - callers with no signed-in
// owner (shouldn't happen; CookMode is behind RequireAuth) get an
// unpersisted one-off id rather than throwing.
export function getOrStartSession(ownerId, { dishSlug, level, lang }) {
  if (!ownerId) return crypto.randomUUID();
  const key = storageKey(ownerId);
  try {
    const raw = localStorage.getItem(key);
    const existing = raw ? JSON.parse(raw) : null;
    if (existing && existing.dish_slug === dishSlug && existing.level === level && existing.lang === lang) {
      return existing.session_id;
    }
    const sessionId = crypto.randomUUID();
    localStorage.setItem(key, JSON.stringify({ session_id: sessionId, dish_slug: dishSlug, level, lang }));
    return sessionId;
  } catch {
    return crypto.randomUUID(); // storage unavailable - fall back to an unpersisted session
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
