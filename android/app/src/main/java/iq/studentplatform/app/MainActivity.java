package iq.studentplatform.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * The page is drawn behind the status bar and the navigation bar, so the app's own colours show there
 * (no grey strips). The size of those bars goes to the page as CSS variables (--sat, --sab), and when the
 * keyboard opens the page is shortened by the keyboard's height so fields and bottom sheets stay above it.
 */
public class MainActivity extends BridgeActivity {
    private float top = 0, bottom = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            getWindow().setNavigationBarContrastEnforced(false);
            getWindow().setStatusBarContrastEnforced(false);
        }
        final View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            float d = getResources().getDisplayMetrics().density;
            boolean keyboard = ime.bottom > bars.bottom;
            v.setPadding(0, 0, 0, keyboard ? ime.bottom : 0);
            top = bars.top / d;
            bottom = keyboard ? 0 : bars.bottom / d;
            push();
            return WindowInsetsCompat.CONSUMED;
        });
        final WebView web = getBridge().getWebView();
        web.addJavascriptInterface(new Object() {
            // "top,bottom" in CSS pixels, read by the page when it starts
            @JavascriptInterface
            public String insets() { return top + "," + bottom; }

            // light = the page is light, so the status bar and navigation bar icons must be dark
            @JavascriptInterface
            public void bars(final boolean light) {
                runOnUiThread(() -> {
                    WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
                    c.setAppearanceLightStatusBars(light);
                    c.setAppearanceLightNavigationBars(light);
                });
            }
        }, "IspNative");
        ViewCompat.requestApplyInsets(content);
    }

    private void push() {
        final WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        final String js = "window.__ispInsets&&window.__ispInsets(" + top + "," + bottom + ")";
        web.post(() -> web.evaluateJavascript(js, null));
    }
}
