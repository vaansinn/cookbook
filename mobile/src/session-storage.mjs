/** Injectable bridge adapter. Never falls back to browser storage on failure. */
export function createSessionStorage(vault) {
  if (!vault || ['get', 'set', 'remove'].some(key => typeof vault[key] !== 'function')) {
    throw new TypeError('Native session vault required');
  }
  let queue = Promise.resolve();
  const serial = operation => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  return {
    get: () => serial(async () => {
      const { value } = await vault.get();
      if (value === null) return null;
      if (typeof value !== 'string' || value.length > 16384) throw new Error('Invalid secure session record');
      const parsed = JSON.parse(value);
      if (!object(parsed)) throw new Error('Invalid secure session record');
      return parsed;
    }),
    set: (value, { isCurrent = () => true } = {}) => {
      // Snapshot before queuing so callers cannot mutate a pending save.
      if (!object(value)) return Promise.reject(new TypeError('Session object required'));
      const serialized = JSON.stringify(value);
      if (new TextEncoder().encode(serialized).length > 16384) return Promise.reject(new TypeError('Session record too large'));
      return serial(() => {
        if (!isCurrent()) throw new Error('Obsolete session write');
        return vault.set({ value: serialized });
      });
    },
    remove: ({ isCurrent = () => true } = {}) => serial(() => {
      if (!isCurrent()) throw new Error('Obsolete session removal');
      return vault.remove();
    }),
  };
}
