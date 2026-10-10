package iq.studentplatform.app;

import android.content.Context;
import com.onesignal.notifications.INotificationReceivedEvent;
import com.onesignal.notifications.INotificationServiceExtension;
import org.json.JSONObject;

/**
 * OneSignal hands every push here first. A call push (data.kind == "call") that arrives while the app is NOT on screen is shown
 * as the full-screen incoming call (CallNotifier); everything else, and a call while the app is open, is left to OneSignal / the page.
 */
public class CallNotificationExtension implements INotificationServiceExtension {
    @Override
    public void onNotificationReceived(INotificationReceivedEvent event) {
        try {
            JSONObject d = event.getNotification().getAdditionalData();
            if (d == null || !"call".equals(d.optString("kind"))) { applyChosenSound(event); return; }
            if (MainActivity.foreground) return;
            Context ctx = event.getContext();
            event.preventDefault();
            CallNotifier.show(ctx, d.optString("from"), d.optString("fromName"));
        } catch (Throwable ignored) {}
    }

    // the tone the student chose: the push is shown on that tone's channel (Android 8+) or with that sound (older phones)
    private static void applyChosenSound(INotificationReceivedEvent event) {
        try {
            final Context ctx = event.getContext();
            final String id = NotifSounds.chosen(ctx);
            if (id == null || "default".equals(id)) return;
            NotifSounds.ensure(ctx);
            final String ch = NotifSounds.channel(id);
            final android.net.Uri u = "silent".equals(id) ? null : NotifSounds.uri(ctx, id);
            event.getNotification().setExtender(new androidx.core.app.NotificationCompat.Extender() {
                @Override
                public androidx.core.app.NotificationCompat.Builder extend(androidx.core.app.NotificationCompat.Builder b) {
                    b.setChannelId(ch);
                    if (android.os.Build.VERSION.SDK_INT < 26) { if (u != null) b.setSound(u); else b.setSound(null); }
                    return b;
                }
            });
        } catch (Throwable ignored) {}
    }
}
