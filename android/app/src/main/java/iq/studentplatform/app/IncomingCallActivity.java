package iq.studentplatform.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The full-screen incoming call (shown over the lock screen): the app's green, the caller's initials and name, and two round
 * buttons. "رد" opens the app, which answers by itself; "رفض" stops the ring. It closes by itself when the ring time is over.
 */
public class IncomingCallActivity extends Activity {
    private final Handler h = new Handler(Looper.getMainLooper());
    private String from = "";

    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        from = String.valueOf(getIntent().getStringExtra(CallNotifier.EXTRA_FROM));
        String name = getIntent().getStringExtra(CallNotifier.EXTRA_NAME);
        if (name == null || name.trim().isEmpty()) name = "طالب";

        FrameLayout root = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xFF1F8A7E, 0xFF0C4A43, 0xFF06201C});
        root.setBackground(bg);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        cp.topMargin = dp(150);
        root.addView(col, cp);

        TextView av = new TextView(this);
        av.setText(initials(name));
        av.setTextColor(Color.WHITE);
        av.setTextSize(44);
        av.setTypeface(Typeface.DEFAULT_BOLD);
        av.setGravity(Gravity.CENTER);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(0x2EFFFFFF);
        circle.setStroke(dp(2), 0x40FFFFFF);
        av.setBackground(circle);
        col.addView(av, new LinearLayout.LayoutParams(dp(132), dp(132)));
        ObjectAnimator pulse = ObjectAnimator.ofPropertyValuesHolder(av, PropertyValuesHolder.ofFloat("scaleX", 1f, 1.08f), PropertyValuesHolder.ofFloat("scaleY", 1f, 1.08f));
        pulse.setDuration(900); pulse.setRepeatCount(ObjectAnimator.INFINITE); pulse.setRepeatMode(ObjectAnimator.REVERSE); pulse.start();

        TextView nm = new TextView(this);
        nm.setText(name);
        nm.setTextColor(Color.WHITE);
        nm.setTextSize(26);
        nm.setTypeface(Typeface.DEFAULT_BOLD);
        nm.setGravity(Gravity.CENTER);
        nm.setMaxLines(2);
        LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        np.topMargin = dp(40); np.leftMargin = np.rightMargin = dp(24);
        col.addView(nm, np);

        TextView sub = new TextView(this);
        sub.setText("اتصال صوتي من أكادمي السادس");
        sub.setTextColor(0xCCFFFFFF);
        sub.setTextSize(15);
        sub.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sp.topMargin = dp(8);
        col.addView(sub, sp);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        row.setWeightSum(2);
        FrameLayout.LayoutParams rp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        rp.bottomMargin = dp(70); rp.leftMargin = rp.rightMargin = dp(30);
        root.addView(row, rp);
        row.addView(button(R.drawable.ic_call_decline, 0xFFDC2626, "رفض", false), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(button(R.drawable.ic_call_accept, 0xFF16A34A, "رد", true), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        setContentView(root);
        h.postDelayed(this::end, CallNotifier.RING_MS);
    }

    private View button(int icon, int color, String label, final boolean accept) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        ImageView iv = new ImageView(this);
        GradientDrawable c = new GradientDrawable();
        c.setShape(GradientDrawable.OVAL);
        c.setColor(color);
        iv.setBackground(c);
        iv.setImageResource(icon);
        iv.setScaleType(ImageView.ScaleType.CENTER);
        iv.setContentDescription(label);
        box.addView(iv, new LinearLayout.LayoutParams(dp(72), dp(72)));
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextColor(Color.WHITE);
        t.setTextSize(13);
        t.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tp.topMargin = dp(8);
        box.addView(t, tp);
        box.setOnClickListener((v) -> { if (accept) accept(); else end(); });
        return box;
    }

    private static String initials(String name) {
        StringBuilder sb = new StringBuilder();
        for (String w : name.trim().split("\\s+")) { if (!w.isEmpty() && sb.length() < 2) sb.append(w.charAt(0)); }
        return sb.length() == 0 ? "؟" : sb.toString();
    }

    private void accept() {
        CallNotifier.cancel(this);
        try {
            if (Build.VERSION.SDK_INT >= 26) { KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE); if (km != null) km.requestDismissKeyguard(this, null); }
        } catch (Throwable ignored) {}
        Intent i = CallNotifier.acceptIntent(this, from);
        startActivity(i);
        finish();
    }

    private void end() {
        CallNotifier.cancel(this);
        finish();
    }

    @Override
    protected void onDestroy() {
        h.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
