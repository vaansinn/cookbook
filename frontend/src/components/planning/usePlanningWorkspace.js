import { useCallback, useEffect, useRef, useState } from 'react';
import { createPlanningClient } from '../../api/planning.mjs';
import useAuthStore from '../../store/useAuthStore';
import { loadPlanningSnapshot, previewGroups, previewUsable, sessionKey, undoAfterSuccess, verifiedSession } from './planningModel.mjs';

// Owns only this mounted leaf. Auth, the durable outbox and the rest of the app
// remain owned by their existing adapters/stores.
export default function usePlanningWorkspace(route) {
  const scope = useRef(null);
  const generation = useRef(0);
  const writing = useRef(false);
  const notifying = useRef(false);
  const activeLoad = useRef(null);
  const reloadLatest = useRef(null);
  const revalidateAfterWrite = useRef(false);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [undo, setUndo] = useState(null);
  const current = (source) => scope.current === source && source?.active && source.key === sessionKey(useAuthStore.getState());
  const inspectPending = useCallback((source) => {
    if (!current(source)) return;
    try { setPending(source.client.pending()); }
    catch (err) { setError(err); setPending({ state: 'blocked' }); }
  }, []);

  useEffect(() => {
    const key = sessionKey(useAuthStore.getState());
    const client = createPlanningClient({ getSession: () => verifiedSession(useAuthStore.getState()) });
    const source = { client, key, active: true };
    scope.current = source;
    // Synchronous subscription fences even A -> null -> A between renders.
    const unsubscribe = useAuthStore.subscribe((next, previous) => {
      if (sessionKey(next) !== sessionKey(previous)) {
        client.sessionChanged();
        source.active = false;
        generation.current += 1;
        setSnapshot(null); setPending(null); setUndo(null); setSaved(false);
      }
    });
    const onStorage = (event) => {
      const account = verifiedSession(useAuthStore.getState())?.accountId;
      if (event.key !== null && event.key !== `private-planning:v1:outbox:${encodeURIComponent(account)}`) return;
      if (!current(source)) return;
      setStale(true); setSaved(false);
      inspectPending(source);
      reloadLatest.current?.({ background: true });
    };
    const onForeground = () => {
      if (current(source) && document.visibilityState === 'visible') reloadLatest.current?.({ background: true });
    };
    const onConfirmedCommand = () => {
      if (!current(source) || notifying.current) return;
      // Another mounted account control may have saved while this leaf was
      // reading its outbox. Supersede that read without losing an open form.
      inspectPending(source);
      reloadLatest.current?.({ background: true, supersede: true });
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('cookbook:account-command-saved', onConfirmedCommand);
    window.addEventListener('focus', onForeground);
    document.addEventListener('visibilitychange', onForeground);
    inspectPending(source);
    return () => {
      source.active = false;
      generation.current += 1;
      unsubscribe(); window.removeEventListener('storage', onStorage);
      window.removeEventListener('cookbook:account-command-saved', onConfirmedCommand);
      window.removeEventListener('focus', onForeground);
      document.removeEventListener('visibilitychange', onForeground);
      client.dispose();
    };
  }, [inspectPending]);

  const reload = useCallback(async ({ background = false, afterWrite = false, supersede = false } = {}) => {
    const source = scope.current;
    if (!current(source)) return;
    if (writing.current && !afterWrite) {
      revalidateAfterWrite.current = true;
      setStale(true);
      if (!background) { setSnapshot(null); setLoading(true); }
      return;
    }
    if (background && !supersede && activeLoad.current !== null) return;
    revalidateAfterWrite.current = false;
    const ticket = ++generation.current;
    activeLoad.current = ticket;
    setLoading(true); setStale(true); setError(null);
    if (!background) setSnapshot(null);
    inspectPending(source);
    try {
      const next = await loadPlanningSnapshot(source.client, route);
      if (!current(source) || ticket !== generation.current) return;
      setSnapshot(next);
      setStale(false);
      setUndo((value) => value?.revision === next.revision ? value : null);
    } catch (err) {
      if (current(source) && ticket === generation.current) setError(err);
    } finally {
      if (activeLoad.current === ticket) activeLoad.current = null;
      if (current(source) && ticket === generation.current) setLoading(false);
    }
  }, [route.area, route.id, route.offset, inspectPending]);
  reloadLatest.current = reload;

  useEffect(() => { reload(); }, [reload]);

  const read = useCallback(async (path, { key, revision } = {}) => {
    const source = scope.current;
    const ticket = generation.current;
    if (!current(source)) throw Object.assign(new Error(), { code: 'stale_session' });
    const result = key ? await source.client.loadCollection(path, key) : await source.client.read(path);
    if (!current(source) || ticket !== generation.current) throw Object.assign(new Error(), { code: 'superseded' });
    if (revision !== undefined && result.revision !== revision) throw Object.assign(new Error(), { code: 'revision_changed' });
    return result;
  }, []);

  async function run(operation, payload, expectedRevision = snapshot?.revision, recovery = null) {
    const source = scope.current;
    if (!current(source) || writing.current) return null;
    const ticket = ++generation.current;
    writing.current = true;
    setBusy(true); setLoading(false); setError(null); setSaved(false);
    try {
      // The adapter owns the cross-tab Web Lock and exact durable request body.
      // discardRejected is async too: never reload or submit before it finishes.
      const response = recovery === 'retry' ? await source.client.retry()
        : recovery === 'discard' ? await source.client.discardRejected()
          : await source.client.command(operation, payload, expectedRevision);
      if (!current(source) || ticket !== generation.current) return null;
      inspectPending(source);
      if (recovery !== 'discard') {
        setSaved(true);
      }
      // Keep a valid undo through validation/storage/lock failures and unresolved
      // writes. Only a confirmed successor or a newer snapshot invalidates it.
      setUndo((previous) => undoAfterSuccess(previous, response?.result, recovery));
      await reloadLatest.current({ afterWrite: true }); // Receipt is never a snapshot.
      if (!current(source)) return null; // Auth may change during the receipt reload.
      if (recovery !== 'discard') {
        notifying.current = true;
        try { window.dispatchEvent(new Event('cookbook:account-command-saved')); }
        finally { notifying.current = false; }
      }
      return response?.result || { discarded: true };
    } catch (err) {
      if (current(source) && ticket === generation.current) { setError(err); inspectPending(source); }
      return null;
    } finally {
      if (current(source)) {
        writing.current = false; setBusy(false);
        if (revalidateAfterWrite.current) reloadLatest.current({ background: true });
      }
    }
  }

  async function preview(operation, payload, expectedRevision) {
    const source = scope.current;
    if (!current(source) || writing.current) return null;
    const ticket = ++generation.current;
    writing.current = true; setBusy(true); setError(null);
    try {
      if (typeof source.client.preview !== 'function') throw Object.assign(new Error(), { code: 'previewUnsupported' });
      const response = await source.client.preview(operation, payload, expectedRevision);
      if (!current(source) || ticket !== generation.current) return null;
      previewGroups(response.preview);
      if (response.revision !== expectedRevision || !previewUsable(response.preview, expectedRevision)) throw Object.assign(new Error(), { code: 'revision_changed' });
      return response.preview;
    } catch (err) {
      if (current(source) && ticket === generation.current) setError(err);
      return null;
    } finally {
      if (current(source)) {
        writing.current = false; setBusy(false);
        if (revalidateAfterWrite.current) reloadLatest.current({ background: true });
      }
    }
  }

  async function cancelPreview(id) {
    const source = scope.current;
    if (!current(source) || !id) return;
    try { await source.client.cancelPreview(id); }
    catch (err) {
      // Already-consumed/expired proposals need no cleanup. Other failures are
      // visible; cancellation never implies that any domain records were saved.
      if (current(source) && err.status !== 404) setError(err);
    }
  }

  return { snapshot, loading, stale, busy, pending, error, saved, undo, reload, read, run, preview, cancelPreview,
    canEdit: !!snapshot && !loading && !stale && !busy && !pending && !error?.readOnly, clearError: () => setError(null) };
}
