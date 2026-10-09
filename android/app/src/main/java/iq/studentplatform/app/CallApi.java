package iq.studentplatform.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import org.json.JSONObject;

/**
 * The call screen works while the app is closed, so it talks to the database itself for two things: telling the caller that the
 * call was declined, and noticing that the caller hung up. The page hands over the signed-in student's refresh token (IspNative.setAuth,
 * kept only in the app's private storage, cleared on sign-out); each use trades it for a short-lived ID token. Network work: call from a thread.
 */
final class CallApi {
    private static final String PREFS = "isp_call_auth";
    private final String uid, db;
    private final String token;

    private CallApi(String uid, String db, String token) { this.uid = uid; this.db = db; this.token = token; }

    static void save(Context ctx, String uid, String refresh, String key, String db) {
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (uid == null || uid.isEmpty() || refresh == null || refresh.isEmpty()) e.clear();
        else e.putString("u", uid).putString("r", refresh).putString("k", key == null ? "" : key).putString("d", db == null ? "" : db);
        e.apply();
    }

    /** null when nobody is signed in or the token could not be refreshed. */
    static CallApi open(Context ctx) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String u = p.getString("u", ""), r = p.getString("r", ""), k = p.getString("k", ""), d = p.getString("d", "");
            if (u.isEmpty() || r.isEmpty() || k.isEmpty() || !d.startsWith("https://")) return null;
            String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(r, "UTF-8");
            String res = http("POST", "https://securetoken.googleapis.com/v1/token?key=" + URLEncoder.encode(k, "UTF-8"), body, "application/x-www-form-urlencoded");
            String t = res == null ? "" : new JSONObject(res).optString("id_token");
            return t.isEmpty() ? null : new CallApi(u, d.replaceAll("/+$", ""), t);
        } catch (Throwable t) { return null; }
    }

    private String chat(String from) { return uid.compareTo(from) < 0 ? uid + "_" + from : from + "_" + uid; }

    private String url(String path) throws Exception { return db + "/" + path + ".json?auth=" + URLEncoder.encode(token, "UTF-8"); }

    /** the call's state ("ring", "no", "cancel", ...), or null when unknown. */
    String state(String from) {
        try {
            String s = http("GET", url("calls/" + chat(from) + "/st"), null, null);
            if (s == null) return null;
            s = s.trim();
            return "null".equals(s) ? "" : s.replace("\"", "");
        } catch (Throwable t) { return null; }
    }

    /** the caller sees "رفض المكالمة": the same two writes the page makes when "رفض" is pressed. Only a call that is still ringing is touched. */
    void decline(String from) {
        try {
            if (!"ring".equals(state(from))) return;
            String c = "calls/" + chat(from);
            http("PUT", url(c + "/st"), "\"no\"", "application/json");
            http("PUT", url(c + "/by"), JSONObject.quote(uid), "application/json");
            http("DELETE", url("callRing/" + uid + "/" + from), null, null);
        } catch (Throwable ignored) {}
    }

    private static String http(String method, String url, String body, String type) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(8000); c.setReadTimeout(8000);
            c.setRequestMethod(method);
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", type);
                OutputStream o = c.getOutputStream(); o.write(body.getBytes("UTF-8")); o.close();
            }
            int code = c.getResponseCode();
            if (code < 200 || code >= 300) return null;
            InputStream in = c.getInputStream();
            BufferedReader br = new BufferedReader(new InputStreamReader(in, "UTF-8"));
            StringBuilder sb = new StringBuilder(); String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();
            return sb.toString();
        } finally { c.disconnect(); }
    }
}
