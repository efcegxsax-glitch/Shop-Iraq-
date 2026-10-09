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
            if (d == null || !"call".equals(d.optString("kind"))) return;
            if (MainActivity.foreground) return;
            Context ctx = event.getContext();
            event.preventDefault();
            CallNotifier.show(ctx, d.optString("from"), d.optString("fromName"));
        } catch (Throwable ignored) {}
    }
}
