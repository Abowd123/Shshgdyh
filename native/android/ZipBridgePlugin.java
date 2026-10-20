package com.ziptogithub.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.WindowManager;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;

/**
 * جسرٌ أصليٌّ واحد لما لا يقدر عليه الويب:
 *  - استلامُ ملف ZIP من قائمة المشاركة/الفتح (ينسخه إلى الكاش ويبلّغ JS)
 *  - قراءةُ الملف المستلَم قطعةً قطعة (لا يُحمَّل كاملاً في الذاكرة)
 *  - حفظُ التوكن مشفّراً (EncryptedSharedPreferences فوق Android Keystore)
 *  - إبقاءُ الشاشة مضاءةً أثناء الرفع
 */
@CapacitorPlugin(name = "ZipBridge")
public class ZipBridgePlugin extends Plugin {

    private JSObject pending = null;

    @Override
    public void load() {
        if (getActivity() != null) handle(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handle(intent);
    }

    private void handle(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(action)) {
            Object x = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (x instanceof Uri) uri = (Uri) x;
        } else if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        }
        if (uri == null) return;
        intent.setAction(Intent.ACTION_MAIN); // لا يُعاد استلامُه عند تدوير الشاشة
        final Uri u = uri;
        new Thread(() -> {
            try {
                String name = displayName(u);
                File dir = new File(getContext().getCacheDir(), "shared");
                if (!dir.exists()) dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File out = new File(dir, "incoming.zip");
                try (InputStream in = getContext().getContentResolver().openInputStream(u);
                     OutputStream os = new FileOutputStream(out)) {
                    if (in == null) throw new Exception("لا يمكن فتح الملف");
                    byte[] buf = new byte[1 << 16];
                    int n;
                    while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                }
                JSObject r = new JSObject();
                r.put("path", out.getAbsolutePath());
                r.put("name", name);
                r.put("size", out.length());
                pending = r;
                notifyListeners("shared", r, true);
            } catch (Exception e) {
                JSObject r = new JSObject();
                r.put("error", String.valueOf(e.getMessage()));
                notifyListeners("shared", r, true);
            }
        }).start();
    }

    private String displayName(Uri u) {
        String name = null;
        try (Cursor c = getContext().getContentResolver().query(u, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0) name = c.getString(i);
            }
        } catch (Exception ignored) { }
        if (name == null) name = u.getLastPathSegment();
        if (name == null || name.isEmpty()) name = "shared.zip";
        return name;
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject r = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(r);
    }

    @PluginMethod
    public void clearShared(PluginCall call) {
        File dir = new File(getContext().getCacheDir(), "shared");
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        call.resolve();
    }

    @PluginMethod
    public void read(PluginCall call) {
        final String path = call.getString("path");
        final long offset = (long) (double) call.getDouble("offset", 0.0);
        final int length = call.getInt("length", 0);
        new Thread(() -> {
            try (RandomAccessFile f = new RandomAccessFile(path, "r")) {
                long remain = Math.max(0, f.length() - offset);
                int n = (int) Math.min(length, remain);
                byte[] buf = new byte[n];
                f.seek(offset);
                f.readFully(buf);
                JSObject r = new JSObject();
                r.put("data", Base64.encodeToString(buf, Base64.NO_WRAP));
                call.resolve(r);
            } catch (Exception e) {
                call.reject("read failed: " + e.getMessage());
            }
        }).start();
    }

    private SharedPreferences prefs() throws Exception {
        Context ctx = getContext();
        MasterKey key = new MasterKey.Builder(ctx)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        return EncryptedSharedPreferences.create(ctx, "z2g_secure", key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
    }

    @PluginMethod
    public void setToken(PluginCall call) {
        try {
            prefs().edit().putString("token", call.getString("token", "")).apply();
            call.resolve();
        } catch (Exception e) { call.reject("secure store failed: " + e.getMessage()); }
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("token", prefs().getString("token", ""));
            call.resolve(r);
        } catch (Exception e) { call.reject("secure store failed: " + e.getMessage()); }
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        try {
            prefs().edit().remove("token").apply();
            call.resolve();
        } catch (Exception e) { call.reject("secure store failed: " + e.getMessage()); }
    }

    /* ═══ الرفع في الخلفية ═══ */
    @PluginMethod
    public void bgStart(PluginCall call) {
        try {
            UploadService.start(getContext(), call.getString("title", "الرفع إلى GitHub"), call.getString("text", ""));
            call.resolve();
        } catch (Exception e) { call.reject("bg start failed: " + e.getMessage()); }
    }

    @PluginMethod
    public void bgUpdate(PluginCall call) {
        try {
            UploadService.update(getContext(), call.getString("title", "الرفع إلى GitHub"),
                    call.getString("text", ""), call.getInt("pct", -1));
            call.resolve();
        } catch (Exception e) { call.reject("bg update failed: " + e.getMessage()); }
    }

    @PluginMethod
    public void bgStop(PluginCall call) {
        try { UploadService.stop(getContext()); } catch (Exception ignored) { }
        call.resolve();
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }
}
