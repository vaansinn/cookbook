// Step 3c — frontend/src/store/cookSession.js's guest namespace (docs/
// contracts/pilot-fixtures.md §8): a guest id persisted under its own fixed,
// separate localStorage key and reused (never regenerated); guest attempt
// records live under owner_namespace="guest", fully separate from any
// account's owner_namespace="account" keys even if the numeric-looking ids
// ever collided; and signing in never migrates/reads a guest's stored
// attempt into the new account.
//
// Run:
//   cd frontend && node --experimental-loader ../tests/frontend/extensionlessLoader.mjs ../tests/frontend/test_guest_session.mjs
import assert from "node:assert/strict";
import { installFakeLocalStorage } from "./fakeLocalStorage.mjs";

installFakeLocalStorage();

const { default: useAuthStore } = await import("../../frontend/src/store/useAuthStore.js");
const cookSession = await import("../../frontend/src/store/cookSession.js");
const { getOrCreateGuestId, getOrStartSession, getSessionRecord, setCurrentStep, completeSession } = cookSession;

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${label}`);
}

// --- Guest id is generated once and reused. ---------------------------------
const guestId1 = getOrCreateGuestId();
const guestId2 = getOrCreateGuestId();
check("guest id is stable across calls (reused, not regenerated)", () => {
  assert.equal(guestId1, guestId2);
});
check("guest id lives under its own fixed key", () => {
  assert.equal(globalThis.localStorage.getItem("cookbook_guest_id"), guestId1);
});

// --- A guest cook session, keyed under owner_namespace="guest". ------------
const guestSession = getOrStartSession(guestId1, { dishSlug: "lentil-bolognese", level: "basic", lang: "en", snapshotId: 7, ns: "guest" });
setCurrentStep(guestId1, guestSession, "rinse-and-simmer", "guest");
check("guest session record persists under the guest namespace", () => {
  const rec = getSessionRecord(guestId1, guestSession, "guest");
  assert.ok(rec, "guest record must exist");
  assert.equal(rec.current_step_id, "rinse-and-simmer");
  assert.equal(rec.snapshot_id, 7);
});
check("guest session key is namespaced separately from account keys", () => {
  const keys = Object.keys(globalThis.localStorage).filter((k) => k.includes(guestSession));
  assert.ok(keys.every((k) => k.startsWith("cook_session:guest:")), `expected only guest: keys, found ${keys}`);
});

// --- Same-looking owner id under "account" namespace never sees the guest's
// record - the two namespaces are never comparable (§8). ---------------------
check("the same id string under owner_namespace=account has no session", () => {
  const rec = getSessionRecord(guestId1, guestSession, "account");
  assert.equal(rec, null, "an account-namespace lookup must never see a guest record");
});

// --- Guest refresh resumes exactly like a signed-in user's. -----------------
const guestSessionAfterRefresh = getOrStartSession(guestId1, { dishSlug: "lentil-bolognese", level: "basic", lang: "en", ns: "guest" });
check("guest resumes the same session_id after a refresh", () => {
  assert.equal(guestSessionAfterRefresh, guestSession);
  const rec = getSessionRecord(guestId1, guestSessionAfterRefresh, "guest");
  assert.equal(rec.current_step_id, "rinse-and-simmer");
  assert.equal(rec.snapshot_id, 7);
});

// --- Sign-in never migrates or reads guest state into the new account. ------
useAuthStore.setState((s) => ({ user: { id: 555 }, epoch: s.epoch + 1 })); // simulate signing in on this browser
check("the newly signed-in account starts with no session for this dish/level/lang", () => {
  const acctSession = getOrStartSession(555, { dishSlug: "lentil-bolognese", level: "basic", lang: "en", ns: "account" });
  assert.notEqual(acctSession, guestSession, "the account must never inherit the guest's session_id");
  const acctRecord = getSessionRecord(555, acctSession, "account");
  assert.equal(acctRecord.current_step_id, null, "a freshly-started account session must not carry the guest's progress");
});
check("the guest's own record is untouched by signing in", () => {
  const rec = getSessionRecord(guestId1, guestSession, "guest");
  assert.ok(rec, "guest record must still exist after sign-in");
  assert.equal(rec.current_step_id, "rinse-and-simmer");
});

// --- Guest completion clears only the guest's own record, same shape as the
// account completion flow. ----------------------------------------------------
completeSession(guestId1, guestSession, "guest");
check("completing the guest session clears its record", () => {
  assert.equal(getSessionRecord(guestId1, guestSession, "guest"), null);
});

console.log(`\n${passed} checks passed.`);
