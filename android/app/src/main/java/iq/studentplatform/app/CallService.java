package iq.studentplatform.app;

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
 * Keeps a voice call alive when the student leaves the app (another app, the home screen, the screen off). Since Android 9 a
 * background app is given silence by the microphone, so one side stopped hearing the other; a foreground service of the
 * "microphone" type keeps the microphone and the network awake and shows the "مكالمة جارية" notification (tap = back to the call).
 * Started when the call's audio starts (MainActivity.callAudio(true)), stopped when it ends.
 */
public class CallService extends Service {
    private static final int ID = 7702;
    private static final String CHANNEL = "isp_call_active_v1";
    private PowerManager.WakeLock wl;

    static void start(Context c) {
        try {
            Intent i = new Intent(c, CallService.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Throwable ignored) {}
    }

    static void stop(Context c) {
        try { c.stopService(new Intent(c, CallService.class)); } catch (Throwable ignored) {}
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "المكالمة الجارية", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("يبقي المكالمة شغالة وانت بتطبيق ثاني");
                nm.createNotificationChannel(ch);
            }
        }
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 4, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_onesignal_default)
            .setColor(0xFF0F766E)
            .setContentTitle("مكالمة صوتية جارية")
            .setContentText("اضغط للرجوع للمكالمة")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setContentIntent(pi)
            .build();
        try {
            if (Build.VERSION.SDK_INT >= 30) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(ID, n);
        } catch (Throwable t) { stopSelf(); return START_NOT_STICKY; }
        try {
            if (wl == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "isp:call");
                wl.setReferenceCounted(false);
                wl.acquire(4 * 60 * 60 * 1000L);
            }
        } catch (Throwable ignored) {}
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        try { if (wl != null && wl.isHeld()) wl.release(); } catch (Throwable ignored) {}
        wl = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
