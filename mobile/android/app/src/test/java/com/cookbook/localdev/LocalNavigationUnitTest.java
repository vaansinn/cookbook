package com.cookbook.localdev;

import static org.junit.Assert.*;
import org.junit.Test;

public class LocalNavigationUnitTest {
    @Test public void localRoutesAndErrorPageAreAllowed() {
        assertTrue(LocalNavigation.allowed("https://localhost/planning/plans"));
        assertTrue(LocalNavigation.allowed("https://localhost/dish/tomato?lang=de#method"));
        assertTrue(LocalNavigation.allowed("https://localhost/"));
    }
    @Test public void otherPortsHostsAndSchemesAreRejected() {
        for (String url : new String[]{"http://127.0.0.1:5100/", "http://127.0.0.1:5173/", "https://example.com/",
                "intent://app", "javascript:alert(1)", "data:text/html,hello", "blob:https://localhost/123", "file:///index.html"}) {
            assertFalse(url, LocalNavigation.allowed(url));
        }
    }
    @Test public void userInfoAndOtherAuthoritiesAreRejected() {
        for (String url : new String[]{"https://user:pass@localhost/", "https://localhost.evil/",
                "https://localhost:443/", "http://localhost/", "https://local%68ost/", "not a url"}) {
            assertFalse(url, LocalNavigation.allowed(url));
        }
    }
    @Test public void errorPageDoesNotLoopAndSubresourcesDoNotReplaceThePage() {
        String help = "https://localhost/disconnected.html";
        assertTrue(LocalNavigation.showConnectionHelp(true, "http://127.0.0.1:5173/", help));
        assertFalse(LocalNavigation.showConnectionHelp(true, help, help));
        assertFalse(LocalNavigation.showConnectionHelp(false, "http://127.0.0.1:5173/asset.js", help));
        assertFalse(LocalNavigation.showConnectionHelp(true, "http://127.0.0.1:5173/", null));
    }
}
