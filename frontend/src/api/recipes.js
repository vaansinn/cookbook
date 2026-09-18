import api from "./client";
import useAuthStore from "../store/useAuthStore";
import { createRequestScope } from "../utils/requestScope";

// In-memory only: includes a credential. Never serialize into history, storage,
// URLs, diagnostics or DOM attributes; it is only a request/render fence.
export const discoveryIdentity = (state) => JSON.stringify([
  state.initialized, state.user?.id, state.token, state.epoch, state.requestGeneration,
]);

// Shared by discovery pages. Deferred-response tests exercise this exact helper;
// cancellation alone is insufficient when a transport ignores its signal.
export function startDiscoveryRead({ request, isCurrent, onStart, onSuccess, onError, delay = 0 }) {
  const identity = discoveryIdentity(useAuthStore.getState());
  const scope = createRequestScope(() => useAuthStore.getState().initialized
    && discoveryIdentity(useAuthStore.getState()) === identity && isCurrent());
  // Fence even A -> guest -> A transitions batched into a single React render.
  const unsubscribe = useAuthStore.subscribe((next, previous) => {
    if (discoveryIdentity(next) !== discoveryIdentity(previous)) scope.cancel();
  });
  onStart();
  async function load() {
    if (!scope.current()) return;
    try {
      const value = await request(scope.signal);
      if (scope.current()) onSuccess(value);
    } catch {
      if (scope.current()) onError();
    }
  }
  const handle = delay ? setTimeout(load, delay) : null;
  if (!delay) load();
  return () => { scope.cancel(); unsubscribe(); if (handle !== null) clearTimeout(handle); };
}

export async function fetchDishes(params = {}, signal) {
  const { data } = await api.get("/dishes", { params, signal });
  return data;
}

export async function fetchDish(slug, lang = "en", signal) {
  const { data } = await api.get(`/dishes/${slug}`, { params: { lang }, signal });
  return data;
}

export async function fetchFilters(lang = "en", signal) {
  const { data } = await api.get("/filters", { params: { lang }, signal });
  return data;
}
