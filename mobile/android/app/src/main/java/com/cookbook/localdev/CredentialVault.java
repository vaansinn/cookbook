package com.cookbook.localdev;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** One encrypted session record, never a password store. No plaintext fallback. */
final class CredentialVault {
    private final SharedPreferences preferences;
    private final String alias;
    private final byte[] associatedData;

    CredentialVault(Context context, String name) {
        preferences = context.getSharedPreferences(name, Context.MODE_PRIVATE);
        alias = context.getPackageName() + "." + name;
        associatedData = (alias + ":v1").getBytes(StandardCharsets.UTF_8);
    }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        if (!create) throw new GeneralSecurityException("Session key unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    synchronized String get() throws Exception {
        String record = preferences.getString("record", null);
        if (record == null) return null;
        String[] parts = record.split(":", -1);
        if (parts.length != 3 || !"v1".equals(parts[0]) || record.length() > 24000)
            throw new GeneralSecurityException("Invalid session record");
        byte[] iv = Base64.decode(parts[1], Base64.NO_WRAP);
        if (iv.length != 12) throw new GeneralSecurityException("Invalid session IV");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
        cipher.updateAAD(associatedData);
        return new String(cipher.doFinal(Base64.decode(parts[2], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    synchronized void set(String value) throws Exception {
        if (value == null || value.getBytes(StandardCharsets.UTF_8).length > 16384)
            throw new IllegalArgumentException("Invalid session value");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(true));
        cipher.updateAAD(associatedData);
        String record = "v1:" + Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
            + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        if (!preferences.edit().putString("record", record).commit())
            throw new IOException("Session storage unavailable");
    }

    synchronized void remove() throws IOException {
        // Remove only this app's session record. Preserve cooking/planning data.
        if (!preferences.edit().remove("record").commit())
            throw new IOException("Session storage unavailable");
    }
}
