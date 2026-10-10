package iq.studentplatform.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * The notification tone the student picked in the app (res/raw/snd_<id>.wav). An Android notification gets its sound from its
 * channel, and a channel's sound cannot change once it exists, so there is one channel per tone; CallNotificationExtension
 * puts each incoming push on the chosen one. "default" leaves the push on OneSignal's own channel (the phone's default sound),
 * "silent" is a channel with no sound (vibration only).
 */
final class NotifSounds {
    static final String[] IDS = {"chime", "drop", "harp", "bell", "marimba", "pop", "crystal", "dingdong", "beep", "silent"};

    private NotifSounds() {}

    static String channel(String id) { return "isp_snd_" + id; }

    static String chosen(Context c) {
        try { return c.getSharedPreferences("isp", Context.MODE_PRIVATE).getString("notifSound", "default"); } catch (Throwable t) { return "default"; }
    }

    static void save(Context c, String id) {
        try { c.getSharedPreferences("isp", Context.MODE_PRIVATE).edit().putString("notifSound", id == null ? "default" : id).apply(); } catch (Throwable ignored) {}
    }

    static Uri uri(Context c, String id) {
        int res = c.getResources().getIdentifier("snd_" + id, "raw", c.getPackageName());
        return res == 0 ? null : Uri.parse("android.resource://" + c.getPackageName() + "/" + res);
    }

    static void ensure(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            AudioAttributes aa = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
            for (String id : IDS) {
                if (nm.getNotificationChannel(channel(id)) != null) continue;
                NotificationChannel ch = new NotificationChannel(channel(id), "silent".equals(id) ? "بدون صوت" : "نغمة " + id, NotificationManager.IMPORTANCE_HIGH);
                ch.enableVibration(true);
                if ("silent".equals(id)) ch.setSound(null, null);
                else { Uri u = uri(c, id); if (u != null) ch.setSound(u, aa); }
                nm.createNotificationChannel(ch);
            }
        } catch (Throwable ignored) {}
    }
}
