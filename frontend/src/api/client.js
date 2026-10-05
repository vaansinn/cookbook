import axios from "axios";
import { getSessionRuntime } from './runtimeFetch.mjs';
export { configureSessionRuntime, getSessionRuntime, onSessionRuntimeConfigured, SESSION_CHANGE_KEY } from './runtimeFetch.mjs';

const api = axios.create({ baseURL: "/api" });
// Called only by the bundled Android entry, before mounting any app consumers.
// Existing request/response interceptors retain identity and stale-result guards.
export function configureNativeApi(fetchImpl) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Native API fetch is required');
  api.defaults.adapter = 'fetch';
  api.defaults.env = { ...api.defaults.env, fetch: fetchImpl };
  api.defaults.baseURL = 'https://localhost/api';
  api.defaults.timeout = 15000;
}
let readSession = () => ({ token: null });
export const setAuthSessionReader = (reader) => { readSession = reader; };
const credentialRequest = (config) => /^\/?auth\/(login|register)\/?(?:\?|$)/.test(config.url || "");

api.interceptors.request.use((config) => {
  config.headers ||= {};
  const runtime = getSessionRuntime();
  if (runtime) {
    const { token, epoch, requestGeneration } = config.authOrigin || readSession();
    config.authOrigin = { token, epoch, requestGeneration };
    if (!['token', 'epoch', 'requestGeneration'].every((key) => readSession()[key] === config.authOrigin[key])) {
      throw Object.assign(new Error('stale_session'), { code: 'stale_session' });
    }
    // Force the same runtime wrapper for Axios in both browser and native builds.
    // configureNativeApi's raw adapter and placeholder origin remain compatible.
    config.adapter = 'fetch';
    config.env = { ...config.env, fetch: runtime.fetch };
    config.sessionRuntime = true;
    const authorization = token?.startsWith('session:') ? `Bearer ${token}` : undefined;
    if (config.headers.delete) config.headers.delete('Authorization');
    else for (const key of Object.keys(config.headers)) if (key.toLowerCase() === 'authorization') delete config.headers[key];
    if (authorization) config.headers.Authorization = authorization;
    return config;
  }
  if (credentialRequest(config)) {
    if (config.headers.delete) config.headers.delete("Authorization");
    else for (const key of Object.keys(config.headers)) if (key.toLowerCase() === "authorization") delete config.headers[key];
    return config;
  }
  const { token, epoch, requestGeneration } = config.authOrigin || readSession();
  config.authOrigin = { token, epoch, requestGeneration };
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => {
    if (res.config?.sessionRuntime && res.config.authOrigin &&
      !['token', 'epoch', 'requestGeneration'].every((key) => readSession()[key] === res.config.authOrigin[key])) {
      return Promise.reject(Object.assign(new Error('stale_session'), { code: 'stale_session' }));
    }
    return res;
  },
  (err) => {
    const origin = err.config?.authOrigin;
    const state = readSession();
    // Initialization owns its rejection handling, including the JWT 422 case.
    if (!err.config?.sessionRuntime && err.response?.status === 401 && !err.config?.handlesAuthRejection && !credentialRequest(err.config || {}) &&
        origin?.token && err.config?.headers?.Authorization === `Bearer ${origin.token}` &&
        ["token", "epoch", "requestGeneration"].every((key) => state[key] === origin[key]) && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:expired", { detail: origin }));
    }
    return Promise.reject(err);
  }
);
export default api;
