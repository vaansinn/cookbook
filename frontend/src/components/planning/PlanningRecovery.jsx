import { useState } from 'react';
import { Link } from 'react-router-dom';

// Mount inside an open native dialog so its controls remain reachable while the
// rest of the document is inert. Clearing a rejected request does not close or
// remount the editor, and never replaces its unsaved field values.
export default function PlanningRecovery({ pending, t, busy, error, run, onRetried }) {
  const [reviewed, setReviewed] = useState(false);
  if (!pending) return null;
  if (pending.state === 'blocked') return <p role="alert">{t.storageError}</p>;
  const rejected = pending.state === 'rejected';
  let submitted;
  try { submitted = JSON.parse(pending.body); } catch { return <p role="alert">{t.storageError}</p>; }
  return <section className="pp-recovery" aria-label={t.pendingDetails}>
    <p role="status">{rejected ? t.rejected : t.pending}</p>
    {[401, 422].includes(error?.status) && <p><Link className="pp-back" to="/login">{t.signInAction}</Link></p>}
    <details onToggle={(event) => { if (event.currentTarget.open) setReviewed(true); }}><summary>{t.pendingDetails}</summary>
      <p>{t.request}: {t[submitted.operation] || submitted.operation}</p>
      {pending.status && <p>{t.status}: {pending.status}</p>}
      <pre>{JSON.stringify(submitted.payload, null, 2)}</pre>
    </details>
    <button type="button" disabled={busy || (rejected && !reviewed)} onClick={async () => {
      const result = await run(null, null, null, rejected ? 'discard' : 'retry');
      if (result && !rejected) onRetried?.(result, submitted.operation);
    }}>{rejected ? t.discard : t.retry}</button>
  </section>;
}
