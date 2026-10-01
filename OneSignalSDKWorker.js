// OneSignal web push service worker. It must stay at the site root next to index.html.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// The app opens like an installed app: straight from the copy saved on the phone, with no
// wait for the network. Meanwhile the newest version is fetched in the background; when it
// differs, the open pages are told (app shows "تحديث جديد") and the next opening uses it.
// - the app page: saved copy first, refreshed in the background
// - the app's own files (?v=...): a version never changes, so the saved copy is always used
// - libraries and fonts: saved copy, refreshed in the background at most once a day
const CACHE = 'isp-cache-v2';
const SKIP = /firebaseio\.com|identitytoolkit|securetoken|firebasestorage|open-meteo\.com|onesignal\.com|google-analytics|googletagmanager|workers\.dev/;
const LIBS = /cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com\/firebasejs|ui-avatars\.com|cdnjs\.cloudflare\.com/;
const DAY = 86400000;

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'manifest.webmanifest', 'icons/icon-192.png'])).catch(() => {}));
});
self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.indexOf('isp-cache-') === 0 && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Keep one copy per file: a new ?v= version replaces the old one.
function save(c, req, res) {
    const u = new URL(req.url);
    const drop = u.origin === self.location.origin && u.search
        ? c.keys().then((ks) => Promise.all(ks.filter((k) => { const o = new URL(k.url); return o.pathname === u.pathname && o.search !== u.search; }).map((k) => c.delete(k))))
        : Promise.resolve();
    return drop.then(() => c.put(req, res));
}

const verOf = (html) => ((/window\.APP_VER = '([\w_]*)'/.exec(html || '') || [])[1] || '');

// Fetches the newest app page, saves it, and tells the open pages when it is a new version.
function refreshApp(c, cached) {
    return fetch('./', { cache: 'no-cache' }).then((res) => {
        if (!res || !res.ok) return;
        return res.clone().text().then((html) => c.put('./', res).then(() => {
            if (!cached) return;
            return cached.text().then((old) => {
                if (verOf(old) && verOf(html) && verOf(old) !== verOf(html)) {
                    return self.clients.matchAll({ type: 'window' }).then((list) => list.forEach((w) => w.postMessage({ type: 'isp-update', ver: verOf(html) })));
                }
            });
        }));
    }).catch(() => {});
}

// Libraries: when was each one last refreshed (kept in the same cache as tiny entries).
const stampKey = (url) => url + (url.indexOf('?') < 0 ? '?' : '&') + '__isp_t=1';
function stale(c, url) {
    return c.match(stampKey(url)).then((m) => (m ? m.text() : '0')).then((t) => Date.now() - Number(t || 0) > DAY);
}
function refreshLib(c, req) {
    return fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
            return save(c, req, res.clone()).then(() => c.put(stampKey(req.url), new Response(String(Date.now())))).then(() => res);
        }
        return res;
    });
}

self.addEventListener('message', (e) => {
    const d = e.data || {};
    // the app asks for the pages it loads later (lazy parts) to be saved ahead of time
    if (d.type === 'isp-warm' && Array.isArray(d.urls)) {
        e.waitUntil(caches.open(CACHE).then((c) => Promise.all(d.urls.slice(0, 40).map((u) => {
            const req = new Request(new URL(u, self.location.href).href);
            return c.match(req).then((hit) => hit || fetch(req).then((res) => (res.ok ? save(c, req, res) : null)).catch(() => {}));
        }))));
    }
});

// the app's own notifications (tutor, meals, water): a tap opens the app or brings it forward
self.addEventListener('notificationclick', (e) => {
    const tag = (e.notification && e.notification.tag) || '';
    if (tag.indexOf('isp-') !== 0) return;
    e.notification.close();
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        const w = list.find((c) => new URL(c.url).origin === self.location.origin);
        if (w) { w.postMessage({ type: 'isp-open', tag }); return w.focus(); }
        return self.clients.openWindow('./');
    }));
});

self.addEventListener('fetch', (e) => {
    const r = e.request;
    if (r.method !== 'GET' || SKIP.test(r.url) || !/^https?:/.test(r.url)) return;
    const u = new URL(r.url), same = u.origin === self.location.origin;

    if (r.mode === 'navigate') {
        const isApp = same && /\/(index\.html)?$/.test(u.pathname);
        if (isApp && !u.search) {
            e.respondWith(caches.open(CACHE).then((c) => c.match('./').then((hit) => {
                if (hit) {
                    e.waitUntil(refreshApp(c, hit.clone()));
                    return hit;
                }
                return fetch(r).then((res) => {
                    if (res.ok) c.put('./', res.clone());
                    return res;
                });
            })).catch(() => fetch(r)));
            return;
        }
        e.respondWith(fetch(r).then((res) => {
            if (res.ok && isApp) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put('./', cp)); }
            return res;
        }).catch(() => caches.match(isApp ? './' : r).then((m) => m || caches.match('./'))));
        return;
    }

    if (same && u.search) {
        // a versioned file of the app: the saved copy is exact
        e.respondWith(caches.open(CACHE).then((c) => c.match(r).then((hit) => hit || fetch(r).then((res) => {
            if (res.ok) e.waitUntil(save(c, r, res.clone()));
            return res;
        }))));
        return;
    }
    if (!same && !LIBS.test(u.hostname + u.pathname)) return;
    if (!same) {
        e.respondWith(caches.open(CACHE).then((c) => c.match(r).then((hit) => {
            if (!hit) return refreshLib(c, r);
            e.waitUntil(stale(c, r.url).then((old) => (old ? refreshLib(c, r).catch(() => {}) : null)));
            return hit;
        })));
        return;
    }
    // other files of the site (icons, manifest): saved copy, refreshed in the background
    const p = caches.open(CACHE).then((c) => c.match(r).then((hit) => {
        const net = fetch(r).then((res) => (res && res.ok ? save(c, r, res.clone()).then(() => res, () => res) : res))
            .catch(() => hit || Response.error());
        return { hit, net };
    }));
    e.respondWith(p.then((o) => o.hit || o.net));
    e.waitUntil(p.then((o) => o.net).catch(() => {}));
});
