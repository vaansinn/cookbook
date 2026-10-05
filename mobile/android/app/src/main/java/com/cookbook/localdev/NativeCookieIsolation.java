package com.cookbook.localdev;

import java.net.CookieHandler;
import java.net.URI;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/** This app's native API transport is bearer-only, never cookie-authenticated.
 * This does not clear or access WebView/browser cookies. It prevents Java HTTP
 * from sending or persisting cookies via Capacitor's global CookieHandler.
 */
final class NativeCookieIsolation extends CookieHandler {
    static void install() { CookieHandler.setDefault(new NativeCookieIsolation()); }

    @Override public Map<String, List<String>> get(URI uri, Map<String, List<String>> headers) {
        return Collections.emptyMap();
    }

    @Override public void put(URI uri, Map<String, List<String>> headers) {
        // Intentionally do not forward Set-Cookie into the WebView cookie jar.
    }
}
