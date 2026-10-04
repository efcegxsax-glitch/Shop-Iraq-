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
import android.Manifest;
import android.content.pm.PackageManager;
import android.media.MediaRecorder;
import androidx.core.app.ActivityCompat;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
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
    private MediaRecorder voiceRec;
    private File voiceFile;

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


            // Voice messages recorded by the phone itself (microphone source, AAC 64 kbps mono 44.1 kHz): the web view's recorder
            // goes through the call audio path and sounds thin. Returns "ok", "perm" (the permission was just asked) or "err:...".
            @JavascriptInterface
            public String recStart() {
                try {
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                        runOnUiThread(() -> ActivityCompat.requestPermissions(MainActivity.this, new String[]{Manifest.permission.RECORD_AUDIO}, 7701));
                        return "perm";
                    }
                    final FutureTask<String> task = new FutureTask<>(() -> {
                        try {
                            cleanupRec(true);
                            voiceFile = File.createTempFile("isp_voice", ".m4a", getCacheDir());
                            MediaRecorder r = new MediaRecorder();
                            r.setAudioSource(MediaRecorder.AudioSource.MIC);
                            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
                            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
                            r.setAudioEncodingBitRate(64000);
                            r.setAudioSamplingRate(44100);
                            r.setAudioChannels(1);
                            r.setOutputFile(voiceFile.getAbsolutePath());
                            r.prepare();
                            r.start();
                            voiceRec = r;
                            return "ok";
                        } catch (Throwable e) {
                            cleanupRec(true);
                            return "err:" + e;
                        }
                    });
                    runOnUiThread(task);
                    return task.get(4, TimeUnit.SECONDS);
                } catch (Throwable e) {
                    return "err:" + e;
                }
            }

            // stops the recording; when keep is true the file goes back to the page as window.__ispRec(true, dataUrl), else it is thrown away
            @JavascriptInterface
            public void recStop(final boolean keep) {
                runOnUiThread(() -> {
                    final File f = voiceFile;
                    boolean ok = false;
                    try { if (voiceRec != null) { voiceRec.stop(); ok = true; } } catch (Throwable ignored) {}
                    cleanupRec(false);
                    if (!keep || !ok || f == null) { if (f != null) f.delete(); if (keep) replyRec(false, "empty"); return; }
                    new Thread(() -> {
                        try {
                            FileInputStream in = new FileInputStream(f);
                            ByteArrayOutputStream out = new ByteArrayOutputStream();
                            byte[] buf = new byte[16384]; int n;
                            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                            in.close(); f.delete();
                            replyRec(true, "data:audio/mp4;base64," + android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP));
                        } catch (Throwable e) { replyRec(false, String.valueOf(e)); }
                    }).start();
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

    private void cleanupRec(boolean deleteFile) {
        try { if (voiceRec != null) { try { voiceRec.release(); } catch (Throwable ignored) {} } } finally { voiceRec = null; }
        if (deleteFile && voiceFile != null) { try { voiceFile.delete(); } catch (Throwable ignored) {} voiceFile = null; }
    }

    private void replyRec(boolean ok, String value) {
        final WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        final String js = "window.__ispRec&&window.__ispRec(" + ok + "," + JSONObject.quote(value == null ? "" : value) + ")";
        web.post(() -> web.evaluateJavascript(js, null));
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
