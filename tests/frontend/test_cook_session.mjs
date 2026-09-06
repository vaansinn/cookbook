// Regression test — Fix 4: frontend/src/store/cookSession.js must persist one
// record PER ATTEMPT (owner_namespace, owner_id, session_id), not one slot
// per owner. Reproduces the reported bug: starting a second attempt (a
// different dish) used to silently overwrite an unfinished first attempt's
// record, and completing one attempt used to unconditionally clear whatever
// was currently in the single per-owner slot - even a different attempt's
// record.
//
// No test framework in frontend/ (see package.json) - this is a plain Node
// ESM script using assert + a localStorage polyfill (installed before the
// zustand-backed store modules are imported, since useAuthStore.js reads
// localStorage at module-eval time). Run:
//   cd frontend && node ../tests/frontend/test_cook_session.mjs
// (needs `npm install` first so zustand/axios resolve - same prerequisite
// `npm run build` already has.)
import assert from "node:assert/strict";
import { installFakeLocalStorage } from "./fakeLocalStorage.mjs";

installFakeLocalStorage();

const { default: useAuthStore } = await import("../../frontend/src/store/useAuthStore.js");
const cookSession = await import("../../frontend/src/store/cookSession.js");
const { getOrStartSession, getSessionRecord, setCurrentStep, completeSession } = cookSession;

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${label}`);
}

const OWNER = 42;

// --- Start attempt A (dish X, basic), don't finish it. ---------------------
const sessionA = getOrStartSession(OWNER, { dishSlug: "dish-x", level: "basic", lang: "en", snapshotId: 100 });
check("attempt A got a session id", () => {
  assert.equal(typeof sessionA, "string");
  assert.ok(sessionA.length > 0);
});

setCurrentStep(OWNER, sessionA, "step-1");
check("A's current_step_id persisted", () => {
  const recA = getSessionRecord(OWNER, sessionA);
  assert.equal(recA.current_step_id, "step-1");
  assert.equal(recA.dish_slug, "dish-x");
});

// --- Start attempt B (a DIFFERENT dish), without finishing A. ---------------
const sessionB = getOrStartSession(OWNER, { dishSlug: "dish-y", level: "basic", lang: "en", snapshotId: 200 });
check("attempt B got a DIFFERENT session id than A", () => {
  assert.notEqual(sessionB, sessionA);
});

// --- Confirm A's stored record is untouched by B starting. -----------------
check("A's record is untouched by B starting", () => {
  const recA = getSessionRecord(OWNER, sessionA);
  assert.ok(recA, "A's record must still exist");
  assert.equal(recA.dish_slug, "dish-x");
  assert.equal(recA.current_step_id, "step-1");
  assert.equal(recA.snapshot_id, 100);
});

setCurrentStep(OWNER, sessionB, "step-2");
check("B's current_step_id persisted independently of A", () => {
  const recB = getSessionRecord(OWNER, sessionB);
  assert.equal(recB.current_step_id, "step-2");
  assert.equal(recB.dish_slug, "dish-y");
});

// --- Finish A. ---------------------------------------------------------------
completeSession(OWNER, sessionA);
check("completing A clears ONLY A's record", () => {
  assert.equal(getSessionRecord(OWNER, sessionA), null);
});

// --- Confirm B's stored record (and current_step_id) is still intact - not
// cleared by A's completion. ------------------------------------------------
check("B's record (and current_step_id) survives A's completion", () => {
  const recB = getSessionRecord(OWNER, sessionB);
  assert.ok(recB, "B's record must still exist after A completes");
  assert.equal(recB.dish_slug, "dish-y");
  assert.equal(recB.current_step_id, "step-2");
  assert.equal(recB.snapshot_id, 200);
});

// --- "Refresh" (a bare mount calling getOrStartSession again with no known
// session_id) - B should still resume correctly, not mint a new session. ----
const sessionBAfterRefresh = getOrStartSession(OWNER, { dishSlug: "dish-y", level: "basic", lang: "en" });
check("B resumes the same session_id after a refresh", () => {
  assert.equal(sessionBAfterRefresh, sessionB);
  const recB = getSessionRecord(OWNER, sessionBAfterRefresh);
  assert.equal(recB.current_step_id, "step-2");
});

// --- A genuinely new "Start cooking" for A's dish/level/lang (now that A's
// record was cleared) mints a fresh session, never resurrecting the old one.
const sessionANew = getOrStartSession(OWNER, { dishSlug: "dish-x", level: "basic", lang: "en", snapshotId: 999 });
check("restarting A's dish after completion mints a genuinely new session", () => {
  assert.notEqual(sessionANew, sessionA);
  const rec = getSessionRecord(OWNER, sessionANew);
  assert.equal(rec.current_step_id, null);
});

// --- Account-change boundary: switching owners clears ALL of the prior
// owner's attempt-records and its index, not a single key. -------------------
const sessionC = getOrStartSession(OWNER, { dishSlug: "dish-z", level: "basic", lang: "en" });
useAuthStore.setState({ user: { id: OWNER } }); // simulate "signed in as OWNER" (no prior owner yet - no-op)
useAuthStore.setState({ user: { id: 999 } }); // simulate switching accounts away from OWNER

check("switching accounts clears every one of the prior owner's records", () => {
  assert.equal(getSessionRecord(OWNER, sessionB), null, "B's record must be gone after account switch");
  assert.equal(getSessionRecord(OWNER, sessionC), null, "C's record must be gone after account switch");
  const remainingOwnerKeys = Object.keys(globalThis.localStorage).filter((k) => k.startsWith(`cook_session:account:${OWNER}:`));
  assert.equal(remainingOwnerKeys.length, 0, `expected no leftover keys for owner ${OWNER}, found: ${remainingOwnerKeys}`);
});

console.log(`\n${passed} checks passed.`);
