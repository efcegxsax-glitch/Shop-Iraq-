package iq.studentplatform.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** "رفض" on the heads-up call notification: stops the ring. */
public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        CallNotifier.cancel(ctx);
    }
}
