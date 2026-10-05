package com.cookbook.localdev;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class SessionVaultInstrumentedTest {
    @Test public void cookieIsolationSurvivesActivityRecreation() throws Exception {
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(java.net.CookieHandler.getDefault() instanceof NativeCookieIsolation);
            // ActivityScenario recreation requires an unlocked foreground app.
            activity.recreate();
            assertTrue(java.net.CookieHandler.getDefault() instanceof NativeCookieIsolation);
        }
    }

    @Test public void encryptedRoundTripAndTamperFailure() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.cookbook.bundleddev", context.getPackageName());
        // Separate namespace: never read or modify the user's actual session.
        String name = "cookbook-vault-instrumentation-only";
        CredentialVault vault = new CredentialVault(context, name);
        try {
            vault.remove();
            assertNull(vault.get());
            vault.set("synthetic-secret-only");
            assertEquals("synthetic-secret-only", new CredentialVault(context, name).get());
            String first = context.getSharedPreferences(name, Context.MODE_PRIVATE).getString("record", "");
            assertFalse(first.contains("synthetic-secret-only"));
            vault.set("synthetic-secret-only");
            String second = context.getSharedPreferences(name, Context.MODE_PRIVATE).getString("record", "");
            assertNotEquals(first, second);
            assertTrue(context.getSharedPreferences(name, Context.MODE_PRIVATE).edit().putString("record", "v1:invalid:tampered").commit());
            try { vault.get(); fail("Corrupt vault must not become a guest session"); }
            catch (Exception expected) { /* No destructive repair or plaintext fallback. */ }
        } finally { vault.remove(); }
        assertNull(vault.get());
    }
}
