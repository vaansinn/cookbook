// A component's requests are valid only for the identity that started them.
// Invalidating aborts reads; writes may finish server-side but cannot change UI.
export function createRequestScope(isIdentityCurrent) {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    current: () => !controller.signal.aborted && isIdentityCurrent(),
    cancel: () => controller.abort(),
  };
}
