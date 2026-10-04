package iq.studentplatform.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import org.json.JSONObject;
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
        // the page's background colour from the last run (light, dark, black or pink), so nothing flashes white before the page draws
        try {
            int bgc = getSharedPreferences("isp", MODE_PRIVATE).getInt("bg", 0xFFF1F5F3);
            getWindow().getDecorView().setBackgroundColor(bgc);
            getBridge().getWebView().setBackgroundColor(bgc);
        } catch (Throwable ignored) {}
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

            // the page's background colour, kept for the next start
            @JavascriptInterface
            public void bg(final String hex) {
                try { getSharedPreferences("isp", MODE_PRIVATE).edit().putInt("bg", android.graphics.Color.parseColor(hex)).apply(); } catch (Throwable ignored) {}
            }

            // "Sign in with Google": the phone's own account picker gives an ID token, which goes back to the page
            // (window.__ispGoogle(ok, tokenOrError)) and Firebase signs in with it. clientId = the Web client ID.
            @JavascriptInterface
            public void googleSignIn(final String clientId) {
                runOnUiThread(() -> {
                    try {
                        GetSignInWithGoogleOption opt = new GetSignInWithGoogleOption.Builder(clientId).build();
                        GetCredentialRequest req = new GetCredentialRequest.Builder().addCredentialOption(opt).build();
                        CredentialManager.Companion.create(MainActivity.this).getCredentialAsync(
                            MainActivity.this, req, new CancellationSignal(), ContextCompat.getMainExecutor(MainActivity.this),
                            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                                @Override public void onResult(GetCredentialResponse r) {
                                    Credential c = r.getCredential();
                                    if (c instanceof CustomCredential && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
                                        replyGoogle(true, GoogleIdTokenCredential.createFrom(((CustomCredential) c).getData()).getIdToken());
                                    } else {
                                        replyGoogle(false, "unsupported credential");
                                    }
                                }
                                @Override public void onError(GetCredentialException e) { replyGoogle(false, e.getClass().getSimpleName() + " | " + e.getType() + " | " + e.getMessage()); }
                            });
                    } catch (Throwable t) {
                        replyGoogle(false, String.valueOf(t));
                    }
                });
            }
        }, "IspNative");
        ViewCompat.requestApplyInsets(content);
    }

    private void replyGoogle(boolean ok, String value) {
        final WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        final String js = "window.__ispGoogle&&window.__ispGoogle(" + ok + "," + JSONObject.quote(value == null ? "" : value) + ")";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    private void push() {
        final WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        final String js = "window.__ispInsets&&window.__ispInsets(" + top + "," + bottom + ")";
        web.post(() -> web.evaluateJavascript(js, null));
    }
}
