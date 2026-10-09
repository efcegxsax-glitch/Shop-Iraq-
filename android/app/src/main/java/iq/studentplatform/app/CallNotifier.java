package iq.studentplatform.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;

/**
 * The incoming-call notification: a high-priority "call" notification with a full-screen intent, so a phone that is locked or
 * showing another app gets the green call screen (IncomingCallActivity), and an unlocked phone gets a heads-up with "رد" / "رفض".
 * The sound is the notification's own ring (it repeats until the notification is cancelled or times out after 45 seconds).
 */
final class CallNotifier {
    static final int ID = 7701;
    static final String EXTRA_FROM = "isp_call_from";
    static final String EXTRA_NAME = "isp_call_name";
    static final String ACCEPT_FROM = "isp_accept_from";
    static final long RING_MS = 45000;
    private static final String CHANNEL = "isp_calls_v1";

    private CallNotifier() {}

    private static void channel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "المكالمات الواردة", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("شاشة الاتصال عند وصول مكالمة صوتية");
        ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 700, 500, 700, 500});
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private static int flags() { return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE; }

    static Intent acceptIntent(Context ctx, String from) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra(ACCEPT_FROM, from);
        return i;
    }

    static void show(Context ctx, String from, String name) {
        channel(ctx);
        String who = (name == null || name.trim().isEmpty()) ? "طالب" : name.trim();
        Intent full = new Intent(ctx, IncomingCallActivity.class);
        full.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        full.putExtra(EXTRA_FROM, from);
        full.putExtra(EXTRA_NAME, who);
        PendingIntent fullPi = PendingIntent.getActivity(ctx, 1, full, flags());
        PendingIntent acceptPi = PendingIntent.getActivity(ctx, 2, acceptIntent(ctx, from), flags());
        Intent dec = new Intent(ctx, CallActionReceiver.class);
        dec.setAction("iq.studentplatform.app.CALL_DECLINE");
        dec.putExtra(EXTRA_FROM, from);
        PendingIntent decPi = PendingIntent.getBroadcast(ctx, 3, dec, flags());
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_onesignal_default)
            .setColor(0xFF0F766E)
            .setContentTitle(who)
            .setContentText("اتصال صوتي من أكادمي السادس")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setTimeoutAfter(RING_MS)
            .setContentIntent(fullPi)
            .setFullScreenIntent(fullPi, true)
            .addAction(0, "رفض", decPi)
            .addAction(0, "رد", acceptPi);
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(ID, n);
    }

    static void cancel(Context ctx) {
        try { ((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(ID); } catch (Throwable ignored) {}
    }
}
