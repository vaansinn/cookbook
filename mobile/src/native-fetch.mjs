const BUNDLED_ORIGIN = 'https://localhost';
const API_ORIGIN = 'http://127.0.0.1:5100';
const METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']);
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

function apiUrl(input) {
  if (typeof input !== 'string' || /[\u0000-\u0020\u007f\\#]/u.test(input)) {
    throw new TypeError('Invalid native API URL');
  }
  const path = input.startsWith(`${BUNDLED_ORIGIN}/api/`)
    ? input.slice(BUNDLED_ORIGIN.length)
    : input;
  if (!path.startsWith('/api/')) throw new TypeError('Unsupported native API origin');

  // Validate before URL parsing, which would silently normalize dot segments.
  for (const segment of path.split('?')[0].split('/')) {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new TypeError('Invalid native API path encoding');
    }
    if (decoded === '.' || decoded === '..' || /[%/\\#?\u0000-\u0020\u007f]/u.test(decoded)) {
      throw new TypeError('Unsafe native API path');
    }
  }
  const url = `${API_ORIGIN}${path}`;
  if (new URL(url).href !== url) throw new TypeError('Noncanonical native API URL');
  return url;
}

/** Inject CapacitorHttp.request; timeoutMs may only shorten the deadline for tests. */
export function createNativeApiFetch(request, { timeoutMs = 15000 } = {}) {
  if (typeof request !== 'function') throw new TypeError('Native request must be a function');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 15000) {
    throw new TypeError('Invalid native API deadline');
  }

  return async function nativeApiFetch(input, init = {}) {
    const source = input instanceof Request ? input : null;
    const signal = init.signal !== undefined ? init.signal : source?.signal;
    const abortReason = () => signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
    if (signal?.aborted) throw abortReason();

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (complete, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        complete(value);
      };
      const onAbort = () => finish(reject, abortReason());
      const timer = setTimeout(() => {
        finish(reject, new DOMException('Native API request timed out', 'TimeoutError'));
      }, timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });

      // Both handlers remain attached after cancellation, consuming late failures.
      Promise.resolve().then(async () => {
        if (settled) return;
        const url = apiUrl(source ? source.url : input);
        const method = String(init.method ?? source?.method ?? 'GET').toUpperCase();
        if (!METHODS.has(method)) throw new TypeError('Unsupported native API method');
        const credentials = init.credentials !== undefined
          ? init.credentials
          : source?.credentials ?? 'same-origin';
        if (credentials !== 'omit' && credentials !== 'same-origin') {
          throw new TypeError('Native API credentials are unsupported');
        }
        const headers = new Headers(init.headers !== undefined ? init.headers : source?.headers);
        if (headers.has('cookie') || headers.has('cookie2')) throw new TypeError('Native API cookies are unsupported');
        let body = init.body;
        if (body == null && source && source.body !== null) body = await source.text();
        if (settled) return;
        if (body != null) {
          if (method === 'GET' || method === 'HEAD' || typeof body !== 'string') {
            throw new TypeError('Only serialized JSON write bodies are supported');
          }
          const contentType = headers.get('content-type');
          if (contentType && !/^application\/(?:json|[\w.-]+\+json)(?:\s*;|\s*$)/i.test(contentType)) {
            throw new TypeError('Only JSON uploads are supported');
          }
          try {
            JSON.parse(body);
          } catch {
            throw new TypeError('Invalid JSON request body');
          }
          if (!contentType) headers.set('content-type', 'application/json');
        }
        const result = await request({
          url,
          method,
          headers: Object.fromEntries(headers),
          ...(body != null ? { data: body } : {}),
          disableRedirects: true,
          responseType: 'text',
          connectTimeout: 10000,
          readTimeout: 15000,
        });
        if (settled) return;
        if (result?.url !== url) throw new TypeError('Native API response URL mismatch');
        if (result.status >= 300 && result.status < 400 && result.status !== 304) {
          throw new TypeError('Native API redirects are unsupported');
        }
        if (!Number.isInteger(result.status) || result.status < 200 || result.status > 599) {
          throw new TypeError('Invalid native API response status');
        }
        // Capacitor can decode JSON by Content-Type even with responseType: text.
        const data = method === 'HEAD' || NULL_BODY_STATUSES.has(result.status)
          ? null
          : typeof result.data === 'string' ? result.data : JSON.stringify(result.data) ?? null;
        const responseHeaders = new Headers(result.headers);
        responseHeaders.delete('set-cookie');
        responseHeaders.delete('set-cookie2');
        return new Response(data, { status: result.status, headers: responseHeaders });
      }).then(value => finish(resolve, value), error => finish(reject, error));
    });
  };
}
