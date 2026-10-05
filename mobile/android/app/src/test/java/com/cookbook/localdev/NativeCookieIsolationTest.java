package com.cookbook.localdev;

import static org.junit.Assert.*;
import java.net.CookieHandler;
import java.net.URI;
import java.util.Collections;
import org.junit.Test;

public class NativeCookieIsolationTest {
    @Test public void nativeCookieHandlerNeitherSendsNorRetainsCookies() throws Exception {
        CookieHandler previous = CookieHandler.getDefault();
        try {
            NativeCookieIsolation.install();
            CookieHandler handler = CookieHandler.getDefault();
            URI uri = URI.create("http://127.0.0.1:5100/api/auth/session/me");
            handler.put(uri, Collections.singletonMap("Set-Cookie", Collections.singletonList("synthetic=value")));
            assertTrue(handler.get(uri, Collections.emptyMap()).isEmpty());
            NativeCookieIsolation.install();
            assertTrue(CookieHandler.getDefault().get(uri, Collections.emptyMap()).isEmpty());
        } finally { CookieHandler.setDefault(previous); }
    }
}
