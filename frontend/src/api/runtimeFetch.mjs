import { createSessionRuntime } from './authSession.mjs';
export { SESSION_CHANGE_KEY } from './authSession.mjs';

// Web defaults stay unchanged until the entry explicitly opts into sessions.
let nativeFetch;
let sessionRuntime;
const listeners = new Set();
export const getSessionRuntime = () => sessionRuntime;
export function onSessionRuntimeConfigured(listener) {
  listeners.add(listener);
  if (sessionRuntime) listener(sessionRuntime);
  return () => listeners.delete(listener);
}
export function configureSessionRuntime({ transport, fetchImpl, storage, ...options }) {
  if (sessionRuntime) throw new Error('Session runtime already configured');
  sessionRuntime = createSessionRuntime({ ...options, transport, storage,
    fetchImpl: fetchImpl || nativeFetch || ((...args) => globalThis.fetch(...args)) });
  for (const listener of listeners) listener(sessionRuntime);
  return sessionRuntime;
}
export function installNativeApiFetch(fetchImpl) {
  if (typeof fetchImpl !== 'function' || nativeFetch) throw new Error('Native API transport already set or invalid');
  nativeFetch = fetchImpl;
}
export function apiFetch(...args) {
  return (sessionRuntime?.fetch || nativeFetch || globalThis.fetch)(...args);
}
