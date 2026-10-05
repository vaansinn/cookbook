package com.cookbook.localdev;

import static org.junit.Assert.*;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Executes only against the separate bundled-development package. No account writes. */
@RunWith(AndroidJUnit4.class)
public class BundledShellInstrumentedTest {
    @Test public void packagedShellAndOptionalGuestApi() throws Exception {
        assertEquals("com.cookbook.bundleddev", InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName());
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            assertEventually(activity, "location.origin === 'https://localhost' && document.title === 'Recipe Drawer' && document.getElementById('root').children.length > 0", 15000);
            assertEventually(activity, "window.Capacitor.isNativePlatform() && !navigator.serviceWorker.controller", 3000);
            if (!"false".equals(InstrumentationRegistry.getArguments().getString("expectApi"))) {
                assertEventually(activity, "document.querySelectorAll('a.library-recipe-link').length > 0", 20000);
            }
        }
    }

    private void assertEventually(ActivityScenario<MainActivity> activity, String expression, long timeout) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeout;
        do {
            CountDownLatch returned = new CountDownLatch(1);
            AtomicReference<String> value = new AtomicReference<>();
            activity.onActivity(screen -> screen.getBridge().getWebView().evaluateJavascript(
                "Boolean(" + expression + ")", result -> { value.set(result); returned.countDown(); }));
            if (returned.await(3, TimeUnit.SECONDS) && "true".equals(value.get())) return;
            SystemClock.sleep(150);
        } while (SystemClock.elapsedRealtime() < deadline);
        fail("Bundled shell condition not met: " + expression);
    }
}
