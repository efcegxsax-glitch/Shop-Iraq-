// The Worker's own access to the Realtime Database, as the project's service account (the FIREBASE_SA secret: the key file's JSON).
// A service account is not stopped by the database rules, so this is used only for the news bot's own paths and for publishing news.
const b64url = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));

export function parseSA(raw) {
    let s = String(raw || '').trim();
    if (!s) return null;
    try { if (s[0] !== '{') s = atob(s); const j = JSON.parse(s); return j.client_email && j.private_key ? j : null; } catch { return null; }
}

const cache = new Map();
export async function saToken(sa, fetchFn, now) {
    const hit = cache.get(sa.client_email);
    if (hit && hit.exp > now + 120000) return hit.token;
    const iat = Math.floor(now / 1000);
    const head = enc({ alg: 'RS256', typ: 'JWT' });
    const claims = enc({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 });
    const der = Uint8Array.from(atob(String(sa.private_key).replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + claims)));
    const r = await fetchFn('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claims + '.' + sig });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error('sa_token_' + r.status);
    cache.set(sa.client_email, { token: j.access_token, exp: now + (Number(j.expires_in) || 3600) * 1000 });
    return j.access_token;
}

// -> { get, put, update, del }; throws Error('no_sa') when the secret is missing or is not a key file
export function makeDb(env, fetchFn = fetch, nowFn = Date.now) {
    const sa = parseSA(env.FIREBASE_SA), base = String(env.FIREBASE_DB_URL || '').replace(/\/$/, '');
    const call = async (method, path, body, query) => {
        if (!sa || !base) throw new Error('no_sa');
        const t = await saToken(sa, fetchFn, nowFn());
        const r = await fetchFn(base + '/' + path + '.json?access_token=' + encodeURIComponent(t) + (query || ''), { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        if (!r.ok) throw new Error('db_' + r.status);
        return r.status === 204 ? null : r.json();
    };
    return {
        ok: !!(sa && base),
        get: (path, query) => call('GET', path, undefined, query),
        put: (path, v) => call('PUT', path, v),
        update: (updates) => call('PATCH', '', updates),      // many paths at once: { 'a/b': value, 'c': null }
        del: (path) => call('DELETE', path),
    };
}
