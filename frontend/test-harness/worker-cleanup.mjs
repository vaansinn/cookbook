// Test-harness-only confirmation state. No browser modal, storage or networking.
export function createCleanupConfirmation({ cleanup, render, onError }) {
  let reviewing = false, busy = false, complete = false;
  const publish = () => render({ reviewing, busy, complete });
  return {
    ask() {
      if (busy || complete) return false;
      reviewing = true; publish(); return true;
    },
    cancel() {
      if (!reviewing || busy || complete) return false;
      reviewing = false; publish(); return true;
    },
    async confirm() {
      if (!reviewing || busy || complete) return false;
      // Consume the explicit confirmation before yielding; duplicate clicks
      // cannot unregister/delete twice. A failed attempt needs fresh review.
      reviewing = false; busy = true; publish();
      try {
        await cleanup(); complete = true; return true;
      } catch (error) {
        onError(error); return false;
      } finally { busy = false; publish(); }
    },
  };
}
