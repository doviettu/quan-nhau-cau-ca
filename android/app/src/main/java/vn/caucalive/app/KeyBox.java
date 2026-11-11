package vn.caucalive.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Lưu Claude API key: mã hoá AES-GCM bằng khóa nằm trong Android Keystore (không rút ra khỏi máy được). */
final class KeyBox {
    private static final String ALIAS = "cau-ca-live";
    private static final String PREF = "secrets", FIELD = "anthropic";

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return g.generateKey();
    }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREF, Context.MODE_PRIVATE); }

    static void save(Context c, String value) throws Exception {
        Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
        ci.init(Cipher.ENCRYPT_MODE, key());
        byte[] enc = ci.doFinal(value.getBytes(StandardCharsets.UTF_8));
        String blob = Base64.encodeToString(ci.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(enc, Base64.NO_WRAP);
        if (!prefs(c).edit().putString(FIELD, blob).commit()) throw new IllegalStateException("không ghi được");
    }

    static String load(Context c) {
        String blob = prefs(c).getString(FIELD, "");
        int i = blob.indexOf(':');
        if (i < 0) return "";
        try {
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(blob.substring(0, i), Base64.NO_WRAP)));
            return new String(ci.doFinal(Base64.decode(blob.substring(i + 1), Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";   // khóa Keystore bị xoá/đổi (ví dụ cài lại app): coi như chưa có key
        }
    }

    static void clear(Context c) { prefs(c).edit().remove(FIELD).commit(); }

    private KeyBox() { }
}
