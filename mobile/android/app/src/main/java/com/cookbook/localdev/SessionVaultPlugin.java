package com.cookbook.localdev;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Serial worker keeps Keystore IO off the UI thread and preserves write order. */
@CapacitorPlugin(name = "SessionVault")
public class SessionVaultPlugin extends Plugin {
    // One queue for the app process, including overlapping Activity instances.
    // Never shut it down when one Activity is destroyed.
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean active = true;
    private CredentialVault vault;

    @Override public void load() {
        vault = new CredentialVault(getContext(), "cookbook-session-v1");
    }

    @PluginMethod public void get(PluginCall call) {
        worker.execute(() -> {
            if (!active) { call.reject("Obsolete session operation", "stale_session"); return; }
            try {
                String value = vault.get();
                JSObject result = new JSObject();
                result.put("value", value == null ? JSONObject.NULL : value);
                call.resolve(result);
            } catch (Exception ignored) { call.reject("Secure session storage unavailable", "session_storage"); }
        });
    }

    @PluginMethod public void set(PluginCall call) {
        String value = call.getString("value");
        worker.execute(() -> {
            if (!active) { call.reject("Obsolete session operation", "stale_session"); return; }
            try { vault.set(value); call.resolve(); }
            catch (Exception ignored) { call.reject("Secure session storage unavailable", "session_storage"); }
        });
    }

    @PluginMethod public void remove(PluginCall call) {
        worker.execute(() -> {
            if (!active) { call.reject("Obsolete session operation", "stale_session"); return; }
            try { vault.remove(); call.resolve(); }
            catch (Exception ignored) { call.reject("Secure session storage unavailable", "session_storage"); }
        });
    }

    @Override protected void handleOnDestroy() {
        active = false;
        super.handleOnDestroy();
    }
}
