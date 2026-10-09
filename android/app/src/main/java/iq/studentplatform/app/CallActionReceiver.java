package iq.studentplatform.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** "رفض" on the heads-up call notification: stops the ring and tells the caller. */
public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(final Context ctx, Intent intent) {
        final String from = intent.getStringExtra(CallNotifier.EXTRA_FROM);
        CallNotifier.cancel(ctx);
        if (from == null || from.isEmpty()) return;
        final PendingResult pr = goAsync();
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try { CallApi a = CallApi.open(app); if (a != null) a.decline(from); } catch (Throwable ignored) {}
            pr.finish();
        }).start();
    }
}
