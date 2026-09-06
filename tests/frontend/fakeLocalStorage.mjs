// Minimal localStorage polyfill for running frontend/src/store modules under
// plain Node (no browser, no test framework in this repo's frontend). Must
// be installed on globalThis BEFORE importing anything that reads
// localStorage at module-eval time (useAuthStore.js does, via cookSession.js
// -> useAuthStore -> ../api/client).
//
// Object.keys(localStorage) must return exactly the stored keys (real
// browsers expose stored keys as enumerable own string properties, with
// getItem/setItem/etc. reachable but not enumerable) - cookSession.js's
// account-switch cleanup relies on that to find every key under an owner's
// prefix. A plain object literal would leak its method names into
// Object.keys(), so this uses a Proxy backed by a plain data object instead.
export function installFakeLocalStorage() {
  const data = Object.create(null);
  const methods = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
  };
  const store = new Proxy(methods, {
    ownKeys() {
      return Reflect.ownKeys(data);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (Object.prototype.hasOwnProperty.call(data, prop)) {
        return { enumerable: true, configurable: true, value: data[prop] };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    get(target, prop) {
      if (prop in methods) return methods[prop];
      return undefined;
    },
  });
  globalThis.localStorage = store;
  return store;
}
