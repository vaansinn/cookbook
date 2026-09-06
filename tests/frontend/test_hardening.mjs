import assert from "node:assert/strict";
import { installFakeLocalStorage } from "./fakeLocalStorage.mjs";
installFakeLocalStorage();
const { default: auth } = await import("../../frontend/src/store/useAuthStore.js");
const { default: api } = await import("../../frontend/src/api/client.js");
const sessions = await import("../../frontend/src/store/cookSession.js");
const { createRequestScope } = await import("../../frontend/src/utils/requestScope.js");

const oldId = crypto.randomUUID();
localStorage.setItem("cook_session:account:7", JSON.stringify({ session_id: oldId, dish_slug: "lentil-bolognese", level: "basic", lang: "en", snapshot_id: null, current_step_id: "simmer" }));
const args = { dishSlug: "lentil-bolognese", level: "basic", lang: "en" };
assert.equal(sessions.getOrStartSession(7, args), oldId);
assert.equal(localStorage.getItem("cook_session:account:7"), null);
assert.equal(sessions.getSessionRecord(7, oldId).capture_pending, false);
const next = sessions.getOrStartSession(7, { ...args, forceNew: true });
assert.notEqual(next, oldId);
assert.equal(sessions.getSessionRecord(7, oldId).current_step_id, "simmer");
assert.equal(sessions.getOrStartSession(7, { ...args, attemptId: oldId }), oldId);
sessions.setSessionSnapshot(7, next, 11);
sessions.setSessionSnapshot(7, next, 12);
assert.equal(sessions.getSessionRecord(7, next).snapshot_id, 11);
assert.equal(sessions.getSessionRecord(7, next).capture_pending, false);
sessions.setSessionCookLog(7, next, 23);
assert.equal(sessions.getSessionRecord(7, next).cook_log_id, 23);

let identity = "A:en:attempt1";
const initial = identity;
const scope = createRequestScope(() => identity === initial);
assert.equal(scope.current(), true);
identity = "A:de:attempt2";
assert.equal(scope.current(), false);
identity = initial;
scope.cancel();
assert.equal(scope.current(), false);
assert.equal(scope.signal.aborted, true);

// A delayed auth initialization must never resurrect an account after logout.
let resolve;
api.get = () => new Promise((r) => { resolve = r; });
localStorage.setItem("token", "old-token");
auth.setState({ token: "old-token", initialized: false });
const initializing = auth.getState().init();
auth.getState().logout();
resolve({ data: { id: 7 } });
await initializing;
assert.equal(auth.getState().user, null);
assert.equal(auth.getState().initialized, true);
console.log("hardening: legacy adoption, start-over, pin immutability, save-resume, stale requests and auth-init checks passed");
