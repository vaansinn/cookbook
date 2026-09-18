import axios from "axios";

const api = axios.create({ baseURL: "/api" });
let readSession = () => ({ token: null });
export const setAuthSessionReader = (reader) => { readSession = reader; };
const credentialRequest = (config) => /^\/?auth\/(login|register)\/?(?:\?|$)/.test(config.url || "");

api.interceptors.request.use((config) => {
  config.headers ||= {};
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
  (res) => res,
  (err) => {
    const origin = err.config?.authOrigin;
    const state = readSession();
    // Initialization owns its rejection handling, including the JWT 422 case.
    if (err.response?.status === 401 && !err.config?.handlesAuthRejection && !credentialRequest(err.config || {}) &&
        origin?.token && err.config?.headers?.Authorization === `Bearer ${origin.token}` &&
        ["token", "epoch", "requestGeneration"].every((key) => state[key] === origin[key]) && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:expired", { detail: origin }));
    }
    return Promise.reject(err);
  }
);
export default api;
