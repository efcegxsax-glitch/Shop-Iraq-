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
import org.json.JSONArray;
import org.json.JSONObject;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import android.Manifest;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import java.util.List;
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
    // true while the app is on screen (the call push is then left to the page); the caller whose call was answered on the call screen
    static volatile boolean foreground = false;
    private static volatile String acceptFrom = "";
    private static volatile long acceptAt = 0;

    private void takeIntent(android.content.Intent i) {
        try {
            String f = i == null ? null : i.getStringExtra(CallNotifier.ACCEPT_FROM);
            if (f != null && !f.isEmpty()) { acceptFrom = f; acceptAt = System.currentTimeMillis(); CallNotifier.cancel(this); i.removeExtra(CallNotifier.ACCEPT_FROM); }
        } catch (Throwable ignored) {}
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        takeIntent(intent);
    }

    @Override
    public void onResume() { super.onResume(); foreground = true; }

    @Override
    public void onPause() { foreground = false; super.onPause(); }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        takeIntent(getIntent());
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
        // the native functions the page may call (the annotations only matter in the fallback below)
        class Native implements NativeApi {
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


            // Calls sound like phone calls: the call audio mode (the volume buttons change the call volume, the echo canceller works),
            // the ear speaker at the start, the loud speaker when asked, and a headset or Bluetooth when one is connected.
            @JavascriptInterface
            public void callAudio(final boolean on) {
                runOnUiThread(() -> {
                    try {
                        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
                        if (on) {
                            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                            setVolumeControlStream(AudioManager.STREAM_VOICE_CALL);
                            int max = am.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL);
                            if (am.getStreamVolume(AudioManager.STREAM_VOICE_CALL) < Math.round(max * 0.6f)) am.setStreamVolume(AudioManager.STREAM_VOICE_CALL, Math.round(max * 0.6f), 0);
                            routeCall(am, false);
                        } else {
                            if (android.os.Build.VERSION.SDK_INT >= 31) { try { am.clearCommunicationDevice(); } catch (Throwable ignored) {} }
                            am.setSpeakerphoneOn(false);
                            am.setMode(AudioManager.MODE_NORMAL);
                            setVolumeControlStream(AudioManager.USE_DEFAULT_STREAM_TYPE);
                        }
                    } catch (Throwable ignored) {}
                });
            }

            @JavascriptInterface
            public void speaker(final boolean on) {
                runOnUiThread(() -> {
                    try {
                        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
                        routeCall(am, on);
                        if (on) {
                            int max = am.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL);
                            if (am.getStreamVolume(AudioManager.STREAM_VOICE_CALL) < Math.round(max * 0.85f)) am.setStreamVolume(AudioManager.STREAM_VOICE_CALL, Math.round(max * 0.85f), 0);
                        }
                    } catch (Throwable ignored) {}
                });
            }

            // the page's background colour, kept for the next start
            // are this app's notifications allowed at all (the system switch)
            @JavascriptInterface
            public boolean notifOn() {
                try { return androidx.core.app.NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled(); } catch (Throwable t) { return true; }
            }

            // opens this app's own notification page in the phone's settings (where "pop on screen" / "floating" is switched on)
            @JavascriptInterface
            public void notifSettings() {
                runOnUiThread(() -> {
                    try {
                        android.content.Intent i = new android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                        i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
                        startActivity(i);
                    } catch (Throwable t) {
                        try {
                            android.content.Intent i = new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + getPackageName()));
                            startActivity(i);
                        } catch (Throwable ignored) {}
                    }
                });
            }

            // the caller whose call was answered on the call screen (once): the page then answers by itself
            @JavascriptInterface
            public String takeAccept() { String f = acceptFrom; acceptFrom = ""; return (f == null || System.currentTimeMillis() - acceptAt > 60000) ? "" : f; }

            // the signed-in student's refresh token, for the call screen (it can decline a call and see a hang-up while the app is closed); empty values clear it
            @JavascriptInterface
            public void setAuth(String uid, String refresh, String key, String db) { CallApi.save(MainActivity.this, uid, refresh, key, db); }

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
        }
        final NativeApi nat = new Native();
        installBridge(web, nat);
        ViewCompat.requestApplyInsets(content);
    }

    // The functions above reach the microphone, the call audio, the Google account picker and the phone's settings, so a frame
    // from another site (the results page, an embedded video) must not be able to call them. addJavascriptInterface puts an object
    // in EVERY frame, so instead one gate object takes a secret key that is written only into the script injected into this
    // app's own pages (addDocumentStartJavaScript, limited to the app's origin). That script builds window.IspNative for the page,
    // and a foreign frame has the gate but not the key. A web view too old for document-start scripts keeps the old open object.
    private void installBridge(final WebView web, final NativeApi nat) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            web.addJavascriptInterface(nat, "IspNative");
            return;
        }
        final String key = java.util.UUID.randomUUID().toString().replace("-", "");
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public String call(String k, String m, String a) {
                if (k == null || !key.equals(k) || m == null) return "";
                try {
                    JSONArray v = new JSONArray(a == null ? "[]" : a);
                    return dispatch(nat, m, v);
                } catch (Throwable t) { return ""; }
            }
        }, "IspNativeGate");
        String js = "(function(){var G=window.IspNativeGate,K='" + key + "';if(!G)return;"
            + "function c(m,a){return G.call(K,m,JSON.stringify(a||[]));}"
            + "window.IspNative={insets:function(){return c('insets');},bars:function(l){c('bars',[!!l]);},"
            + "recStart:function(){return c('recStart');},recStop:function(k){c('recStop',[!!k]);},"
            + "callAudio:function(o){c('callAudio',[!!o]);},speaker:function(o){c('speaker',[!!o]);},"
            + "notifOn:function(){return c('notifOn')==='true';},notifSettings:function(){c('notifSettings');},"
            + "bg:function(h){c('bg',[String(h)]);},takeAccept:function(){return c('takeAccept');},setAuth:function(u,r,k,d){c('setAuth',[String(u),String(r),String(k),String(d)]);},googleSignIn:function(i){c('googleSignIn',[String(i)]);}};})();";
        WebViewCompat.addDocumentStartJavaScript(web, js, getBridge().getAllowedOriginRules());
    }

    // what the page can call; one method per function, so the gate can name them
    private interface NativeApi {
        String insets();
        void bars(boolean light);
        String recStart();
        void recStop(boolean keep);
        void callAudio(boolean on);
        void speaker(boolean on);
        boolean notifOn();
        void notifSettings();
        void bg(String hex);
        String takeAccept();
        void setAuth(String uid, String refresh, String key, String db);
        void googleSignIn(String clientId);
    }

    private static String dispatch(NativeApi n, String m, JSONArray v) {
        switch (m) {
            case "insets": return n.insets();
            case "bars": n.bars(v.optBoolean(0)); return "";
            case "recStart": return n.recStart();
            case "recStop": n.recStop(v.optBoolean(0)); return "";
            case "callAudio": n.callAudio(v.optBoolean(0)); return "";
            case "speaker": n.speaker(v.optBoolean(0)); return "";
            case "notifOn": return String.valueOf(n.notifOn());
            case "notifSettings": n.notifSettings(); return "";
            case "bg": n.bg(v.optString(0)); return "";
            case "takeAccept": return n.takeAccept();
            case "setAuth": n.setAuth(v.optString(0), v.optString(1), v.optString(2), v.optString(3)); return "";
            case "googleSignIn": n.googleSignIn(v.optString(0)); return "";
            default: return "";
        }
    }

    // loud speaker, or the ear speaker, or a headset / Bluetooth that is connected
    private void routeCall(AudioManager am, boolean loud) {
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            try {
                List<AudioDeviceInfo> devs = am.getAvailableCommunicationDevices();
                AudioDeviceInfo pick = null;
                if (!loud) {
                    for (AudioDeviceInfo d : devs) { int ty = d.getType(); if (ty == AudioDeviceInfo.TYPE_WIRED_HEADSET || ty == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || ty == AudioDeviceInfo.TYPE_USB_HEADSET || ty == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || ty == AudioDeviceInfo.TYPE_BLE_HEADSET) { pick = d; break; } }
                }
                if (pick == null) {
                    int want = loud ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
                    for (AudioDeviceInfo d : devs) { if (d.getType() == want) { pick = d; break; } }
                }
                if (pick != null) { am.setCommunicationDevice(pick); return; }
            } catch (Throwable ignored) {}
        }
        am.setSpeakerphoneOn(loud);
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
