// OneSignal web push service worker. It must stay at the site root next to index.html.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// Offline support: the app opens without internet from the copy saved on the last visit.
// Pages come from the network first (so updates show right away) and fall back to the saved
// copy; the app's files and libraries come from the saved copy and refresh in the background.
const CACHE = 'isp-cache-v1';
const SKIP = /firebaseio\.com|identitytoolkit|securetoken|firebasestorage|open-meteo\.com|onesignal\.com|google-analytics|googletagmanager/;
const LIBS = /cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com\/firebasejs|ui-avatars\.com/;

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

self.addEventListener('fetch', (e) => {
    const r = e.request;
    if (r.method !== 'GET' || SKIP.test(r.url) || !/^https?:/.test(r.url)) return;
    const u = new URL(r.url), same = u.origin === self.location.origin;
    if (r.mode === 'navigate') {
        const isApp = same && /\/(index\.html)?$/.test(u.pathname);
        e.respondWith(fetch(r).then((res) => {
            if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(isApp ? './' : r, cp)); }
            return res;
        }).catch(() => caches.match(isApp ? './' : r).then((m) => m || caches.match('./'))));
        return;
    }
    if (!same && !LIBS.test(u.hostname + u.pathname)) return;
    const p = caches.open(CACHE).then((c) => c.match(r).then((hit) => {
        const net = fetch(r).then((res) => (res && (res.ok || res.type === 'opaque') ? save(c, r, res.clone()).then(() => res, () => res) : res))
            .catch(() => hit || Response.error());
        return { hit, net };
    }));
    e.respondWith(p.then((o) => o.hit || o.net));
    e.waitUntil(p.then((o) => o.net).catch(() => {}));
});
