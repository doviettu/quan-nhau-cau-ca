package vn.caucalive.app;

import android.Manifest;
import android.app.Activity;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.system.Os;
import android.text.InputType;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * App Cậu Cả Live cho Android: chạy app/server.mjs bằng Node (nodejs-mobile) ngay trên điện thoại,
 * hiện game trong WebView toàn màn hình. Nút Quay lại chuyển giữa game và bảng điều khiển.
 * Phát live: dùng chế độ chia sẻ màn hình của app TikTok.
 */
public class MainActivity extends Activity {
    static {
        System.loadLibrary("node");
        System.loadLibrary("native-lib");
    }

    static native int startNode(String[] args);

    static final String BASE = "http://127.0.0.1:8686";
    static final String GAME = BASE + "/?obs=1&auto=1&clean=1&preset=live";
    static final String PANEL = BASE + "/panel";
    // Node chỉ khởi động được một lần trong mỗi tiến trình
    static boolean nodeStarted = false;

    WebView web;
    TextToSpeech tts;
    volatile boolean ttsReady = false;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // vẽ cả vùng camera đục lỗ (không để dải đen ở mép trên); game tự né bằng safe-area
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        web.setWebViewClient(new WebViewClient() {
            // chỉ trang của máy chủ trong app được mở trong WebView (có cầu nối CauCaAndroid); link ngoài mở bằng trình duyệt
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (!r.isForMainFrame()) return false;
                String u = r.getUrl().toString();
                if (u.startsWith(BASE + "/")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (Exception ignored) { }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "CauCaAndroid");
        setContentView(web);
        hideBars();
        web.loadData(page("🍻 Đang mở quán…"), "text/html; charset=utf-8", "utf-8");

        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) return;
            tts.setLanguage(new Locale("vi", "VN"));
            // USAGE_MEDIA để chế độ chia sẻ màn hình của TikTok thu được giọng MC
            tts.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            tts.setSpeechRate(1.05f);
            ttsReady = true;
        });

        if (!nodeStarted) {
            nodeStarted = true;
            new Thread(this::runNode, "node").start();
        }
        new Thread(this::waitAndLoad, "wait-node").start();
        keepAlive();
    }

    // Giữ quán sống khi chuyển sang app TikTok: dịch vụ có thông báo + xin bỏ tối ưu pin (hỏi một lần)
    @SuppressWarnings("BatteryLife")
    void keepAlive() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        startForegroundService(new Intent(this, KeepAliveService.class));
        SharedPreferences p = getSharedPreferences("app", MODE_PRIVATE);
        PowerManager pm = getSystemService(PowerManager.class);
        if (!p.getBoolean("askedBattery", false) && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
            p.edit().putBoolean("askedBattery", true).apply();
            try { startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()))); }
            catch (Exception ignored) { }
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        String u = web.getUrl();
        if (u == null || !u.startsWith(BASE)) { super.onBackPressed(); return; }
        web.loadUrl(u.startsWith(PANEL) ? GAME : PANEL);
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    void hideBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);   // không chừa chỗ cho vùng camera; game tự né bằng safe-area
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    static String page(String msg) {
        return "<html><body style='margin:0;background:#1a0f1c;color:#ffe082;font:700 20px sans-serif;"
                + "display:grid;place-items:center;height:100vh;text-align:center;padding:24px;box-sizing:border-box'>"
                + msg + "</body></html>";
    }

    // ---- Node ----
    void runNode() {
        try {
            File dir = prepareProject();
            File files = getFilesDir();
            Os.setenv("HOME", files.getAbsolutePath(), true);
            Os.setenv("TMPDIR", getCacheDir().getAbsolutePath(), true);
            Os.setenv("PORT", "8686", true);
            Os.setenv("CAU_CA_ANDROID", "1", true);
            String key = KeyBox.load(this);
            if (!key.isEmpty()) Os.setenv("ANTHROPIC_API_KEY", key, true);
            startNode(new String[]{"node", new File(dir, "app/server.mjs").getAbsolutePath(), "--no-open"});
        } catch (Exception e) {
            showError("Không chạy được máy chủ trong app: " + e.getMessage());
        }
    }

    // Giải nén mã nguồn Node từ APK vào bộ nhớ riêng của app (chỉ khi APK mới cài hoặc vừa cập nhật).
    // Giữ lại config.json và .secrets.json (cấu hình và khóa bí mật bạn đã nhập).
    File prepareProject() throws Exception {
        File dir = new File(getFilesDir(), "nodejs-project");
        long stamp = getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime;
        File marker = new File(dir, ".apk-stamp");
        if (marker.exists() && new String(Files.readAllBytes(marker.toPath()), StandardCharsets.UTF_8).equals(String.valueOf(stamp))) return dir;
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) {
            String n = f.getName();
            if (!n.equals("config.json") && !n.equals(".secrets.json")) deleteTree(f);
        }
        dir.mkdirs();
        String root = dir.getCanonicalPath() + File.separator;
        try (InputStream in = getAssets().open("nodejs-project.zip"); ZipInputStream zip = new ZipInputStream(in)) {
            byte[] buf = new byte[64 * 1024];
            for (ZipEntry e; (e = zip.getNextEntry()) != null; ) {
                File out = new File(dir, e.getName());
                if (!out.getCanonicalPath().startsWith(root)) throw new SecurityException("Đường dẫn lạ trong gói: " + e.getName());
                if (e.isDirectory()) { out.mkdirs(); continue; }
                out.getParentFile().mkdirs();
                try (FileOutputStream fo = new FileOutputStream(out)) { for (int n; (n = zip.read(buf)) > 0; ) fo.write(buf, 0, n); }
            }
        }
        Files.write(marker.toPath(), String.valueOf(stamp).getBytes(StandardCharsets.UTF_8));
        return dir;
    }

    static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    void waitAndLoad() {
        for (int i = 0; i < 240; i++) {   // tối đa ~2 phút (lần đầu phải giải nén)
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/config").openConnection();
                c.setConnectTimeout(500);
                c.setReadTimeout(1000);
                if (c.getResponseCode() == 200) {
                    runOnUiThread(() -> web.loadUrl(GAME));
                    return;
                }
            } catch (Exception ignored) { }
            try { Thread.sleep(500); } catch (InterruptedException e) { return; }
        }
        showError("Máy chủ trong app không chạy. Tắt hẳn app rồi mở lại.");
    }

    void showError(String msg) {
        runOnUiThread(() -> web.loadData(page("⚠️ " + msg), "text/html; charset=utf-8", "utf-8"));
    }

    // ---- Claude API key: nhập ở hộp thoại của app, lưu trong Android Keystore, không đưa vào trang web ----
    void askKey() {
        EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        in.setHint("sk-ant-...");
        new AlertDialog.Builder(this)
                .setTitle("Claude API key")
                .setMessage("Key được mã hoá bằng Android Keystore và chỉ máy chủ trong app dùng. App sẽ tự khởi động lại.")
                .setView(in)
                .setPositiveButton("Lưu", (d, w) -> {
                    String k = in.getText().toString().trim();
                    if (!k.matches("sk-ant-[A-Za-z0-9_\\-]{20,}")) { Toast.makeText(this, "Key không đúng dạng sk-ant-…", Toast.LENGTH_LONG).show(); return; }
                    try { KeyBox.save(this, k); restart(); }
                    catch (Exception e) { Toast.makeText(this, "Không lưu được key: " + e.getMessage(), Toast.LENGTH_LONG).show(); }
                })
                .setNeutralButton("Xoá key", (d, w) -> { KeyBox.clear(this); restart(); })
                .setNegativeButton("Huỷ", null)
                .show();
    }

    void restart() {
        Toast.makeText(this, "Đang khởi động lại app…", Toast.LENGTH_SHORT).show();
        Intent i = Intent.makeRestartActivityTask(getPackageManager().getLaunchIntentForPackage(getPackageName()).getComponent());
        startActivity(i);
        Runtime.getRuntime().exit(0);   // Node chỉ đọc key lúc khởi động
    }

    class Bridge {
        @JavascriptInterface
        public void speak(String text) {
            if (!ttsReady || text == null) return;
            String t = text.trim();
            if (t.isEmpty()) return;
            tts.speak(t.length() > 220 ? t.substring(0, 220) : t, TextToSpeech.QUEUE_ADD, null, "mc" + System.nanoTime());
        }

        @JavascriptInterface
        public boolean hasClaudeKey() { return !KeyBox.load(MainActivity.this).isEmpty(); }

        @JavascriptInterface
        public void askClaudeKey() { runOnUiThread(MainActivity.this::askKey); }
    }
}
