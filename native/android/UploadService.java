package com.ziptogithub.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/**
 * خدمةٌ أماميّة (foreground service) طوال الرفع: تمنع أندرويد من قتل التطبيق
 * أو تجميده حين تخرج منه، وتُظهر إشعاراً بالتقدّم. تُبدأ والتطبيقُ ظاهر،
 * والتحديثاتُ تمرّ عبر NotificationManager مباشرةً (لا إعادة تشغيلٍ للخدمة،
 * فلا قيودَ أندرويد 12+ على البدء من الخلفية).
 */
public class UploadService extends Service {
    static final String CH = "z2g_upload";
    static final int ID = 4242;
    private PowerManager.WakeLock wl;

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CH) == null) {
                NotificationChannel ch = new NotificationChannel(CH, "الرفع إلى GitHub", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
        }
    }

    static Notification build(Context c, String title, String text, int pct) {
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = open == null ? null : PendingIntent.getActivity(c, 0, open, flags);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH)
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setProgress(100, Math.max(0, pct), pct < 0);
        if (pi != null) b.setContentIntent(pi);
        return b.build();
    }

    static void start(Context c, String title, String text) {
        ensureChannel(c);
        Intent i = new Intent(c, UploadService.class);
        i.putExtra("title", title);
        i.putExtra("text", text);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    static void update(Context c, String title, String text, int pct) {
        ensureChannel(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(ID, build(c, title, text, pct));
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, UploadService.class));
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "الرفع إلى GitHub";
        String text = intent != null && intent.getStringExtra("text") != null ? intent.getStringExtra("text") : "";
        Notification n = build(this, title, text, -1);
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(ID, n);
        if (wl == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "z2g:upload");
                wl.acquire(3 * 60 * 60 * 1000L);
            }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (wl != null && wl.isHeld()) wl.release();
        wl = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        super.onDestroy();
    }
}
