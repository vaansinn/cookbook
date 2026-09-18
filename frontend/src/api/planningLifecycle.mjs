/**
 * Account deletion and planning writes share private-planning:v1:writer:<owner>.
 * Storage events are notifications, not exclusion: a durable marker must fence a
 * stale tab after that lock is released. The marker contains only a version and
 * state, no token, command, personal content or timestamp. Do not expire it.
 *
 * Before DELETE, persist/read-back `deleting`. After confirmed success, attempt
 * `deleted` and outbox cleanup independently; either deleting or deleted blocks
 * writers even if finalization/cleanup fails. Existing deleted markers permit
 * explicit local cleanup retry without another server request.
 *
 * A definitive rejected FIRST attempt restores `open`. Network/5xx/404 and any
 * failure following a previous unresolved intent retain `deleting`, NOT deleted.
 * Recovery is explicit deletion retry. A login or GET showing the owner still
 * exists cannot clear an intent: the original DELETE might still commit later.
 * If storage cannot persist protection, do not send DELETE. If rollback storage
 * fails, remain blocked and report it; never infer deletion from that failure.
 *
 * removeAccount must resolve only for a confirmed successful DELETE and reject
 * for every other outcome (the auth store supplies Axios with a 15s timeout).
 * Return contract: {stale:true} before dispatch or {deleted:true,cleanupError} on
 * confirmed success. Failures reject. Cleanup always addresses the captured owner
 * even if auth changed while DELETE was in flight; consumer owns auth clearing.
 * Retain the returned object on cleanupError and offer retryPlanningDeletionCleanup
 * (local only). It accepts a durable deleted marker or this module's actual success
 * object as proof. A copied/forged object or a fresh GET is never deletion proof.
 * After refresh, an unresolved marker with no success object requires delete retry.
 */

const MARKER_PREFIX = 'private-planning:v1:owner:';
const MARKERS = { open: '1:open', deleting: '1:deleting', deleted: '1:deleted' };
const definiteRejections = new Set([400, 401, 403, 409, 413, 422]);
const error = (code, details = {}) => Object.assign(new Error(code), { code, ...details });
const confirmations = new WeakMap();

export const planningOwnerMarkerKey = (accountId) => `${MARKER_PREFIX}${encodeURIComponent(accountId)}`;

// Writers call this inside the shared lock. Unknown/unreadable marker is blocked,
// never overwritten. null means no deletion has been attempted in this storage.
export function readPlanningOwnerState(accountId, storage) {
  let raw;
  try { raw = storage.getItem(planningOwnerMarkerKey(accountId)); }
  catch { throw error('storage_blocked'); }
  if (raw === null) return null;
  const state = Object.keys(MARKERS).find((key) => MARKERS[key] === raw);
  if (!state) throw error('storage_blocked');
  return state;
}

function writeState(accountId, storage, expected, next) {
  if (readPlanningOwnerState(accountId, storage) !== expected) throw error('deletion_marker_changed');
  try { storage.setItem(planningOwnerMarkerKey(accountId), MARKERS[next]); }
  catch { throw error('storage_blocked'); }
  if (readPlanningOwnerState(accountId, storage) !== next) throw error('storage_blocked');
}

function finishDeletion(accountId, storage, state) {
  let cleanupError = false;
  if (state !== 'deleted') {
    try { writeState(accountId, storage, state, 'deleted'); }
    catch { cleanupError = true; } // The verified pre-DELETE intent still fences.
  }
  try {
    const key = `private-planning:v1:outbox:${encodeURIComponent(accountId)}`;
    storage.removeItem(key);
    if (storage.getItem(key) !== null) cleanupError = true;
  } catch { cleanupError = true; }
  const result = { deleted: true, cleanupError };
  confirmations.set(result, accountId);
  return result;
}

export async function deleteWithPlanningCleanup(accountId, removeAccount, isCurrent, options = {}) {
  if (!Number.isSafeInteger(accountId) || accountId < 1) throw error('invalid_account');
  if ((!options.cleanupOnly && typeof removeAccount !== 'function') || typeof isCurrent !== 'function') throw error('invalid_configuration');
  let lockManager;
  try { lockManager = Object.hasOwn(options, 'lockManager') ? options.lockManager : globalThis.navigator?.locks; }
  catch { throw error('write_coordination_unavailable'); }
  if (typeof lockManager?.request !== 'function') throw error('write_coordination_unavailable');
  let entered = false;
  try {
    const result = await lockManager.request(`private-planning:v1:writer:${encodeURIComponent(accountId)}`,
      { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        entered = true;
        if (!lock) throw error('writer_busy');
        if (!isCurrent()) return { stale: true };
        let storage;
        try { storage = Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage; }
        catch { throw error('storage_blocked'); }
        const previous = readPlanningOwnerState(accountId, storage);
        if (previous === 'deleted' || (previous === 'deleting' && confirmations.get(options.confirmation) === accountId)) {
          return finishDeletion(accountId, storage, previous);
        }
        if (options.cleanupOnly) throw error('deletion_unconfirmed');
        if (previous !== 'deleting') writeState(accountId, storage, previous, 'deleting');
        // Recheck after storage access and directly before dispatch. Roll back a
        // new, unsent intent only; an older ambiguous intent must remain protected.
        if (!isCurrent()) {
          if (previous !== 'deleting') writeState(accountId, storage, 'deleting', 'open');
          return { stale: true };
        }
        try { await removeAccount(); }
        catch (failure) {
          const status = failure?.response?.status ?? failure?.status;
          if (previous !== 'deleting' && definiteRejections.has(status)) {
            try { writeState(accountId, storage, 'deleting', 'open'); }
            catch { throw error('deletion_recovery_required', { cause: failure, cleanupError: true }); }
          }
          throw failure;
        }
        return finishDeletion(accountId, storage, 'deleting');
      });
    if (!entered) throw error('write_coordination_unavailable');
    return result;
  } catch (failure) {
    if (entered) throw failure;
    throw error('write_coordination_unavailable');
  }
}

// Explicit recovery route, without a server request or auth-store dependency.
// Preserve the deletion marker; remove only this owner's outbox. With a durable
// deleted marker confirmation can be omitted (e.g. after a page refresh).
export async function retryPlanningDeletionCleanup(accountId, confirmation, options = {}) {
  return deleteWithPlanningCleanup(accountId, null, () => true, { ...options, confirmation, cleanupOnly: true });
}
