// رحلة الطالب الجوية (the engine): a real map, a real route and a plane that flies it in real time.
//  - Map: Google Maps when the panel has a Maps key (siteConfig/maps/key), otherwise the Leaflet map the app already uses
//    (study spots). Both sit behind the same small adapter, so the flight code does not care which one it is.
//  - Plane: sprites baked once from a 3D model (js/flight3d.js), drawn on a flat canvas over the map; LOD + clustering for other planes.
//  - Time: a flight is { start, duration, from, to }. The position of every plane is worked out from the clock (js/flightmath.js),
//    so nothing is sent while flying, and nothing jumps when the connection comes back.
//  - Data: Firebase RTDB (flightActive / flightOwners / flightGrid / flightHistory, see tools/rules.py); the viewport decides which
//    4-degree cells a phone listens to.
// The page and its buttons are in js/flightsui.js. Loaded on demand by app._need('flights').
(function () {
    const FM = window.FlightMath;
    const KEY = { ACTIVE: 'isp_fl_active', HIST: 'isp_fl_hist', PERF: 'isp_fl_perf', STYLE: 'isp_fl_style', MAP: 'isp_fl_map' };
    const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
    const IRAQ_BOX = { s: 28.9, n: 37.6, w: 38.7, e: 48.9 };
    const ms = () => (window.performance && performance.now ? performance.now() : Date.now());
    const clamp = FM.clamp;
    const lerp = (a, b, t) => a + (b - a) * t;
    const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
    const jget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
    const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

    // ---------- the shared state of the page ----------
    const C = window.FlightCore = {
        adapter: null, host: null, cv: null, ctx: null, w: 0, h: 0, dpr: 1,
        sprites: null, shadow: null, spriteState: '',  // '' | 'loading' | 'ready' | 'flat'
        off: 0,                                          // server clock - phone clock
        online: true,
        hero: null,                                      // { fid, s, du, o, d, on, dn, sty, sh }
        replay: null,                                    // { rec, speed, base, last, paused }
        arrivedAt: 0,
        others: new Map(), subs: new Map(), showOthers: false, filter: 'all',
        cam: 'free', camT0: 0, camFrom: null, pad: { t: 80, b: 220, l: 20, r: 20 },
        night: false, perf: false, perfAuto: false,
        preview: null, pick: null, pins: [],
        hits: [], me: null,
        weather: null, weatherAt: 0,
        onFrame: null, onEvent: null, listeners: [],
        _raf: 0, _last: 0, _ft: [], _skip: false, _run: false, _ro: null, _lines: {},
    };

    // the clock every flight is measured with
    C.now = () => Date.now() + C.off;
    C.emit = (name, data) => { try { C.onEvent && C.onEvent(name, data); } catch (e) { console.warn('flight event', name, e); } };

    // ---------- loading the map libraries ----------
    function loadLeaflet() {
        if (window.L && window.L.map) return Promise.resolve();
        if (loadLeaflet.p) return loadLeaflet.p;
        loadLeaflet.p = new Promise((res, rej) => {
            const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css'; document.head.appendChild(css);
            const sc = document.createElement('script'); sc.src = LEAFLET + 'leaflet.min.js';
            sc.onload = () => res(); sc.onerror = () => { loadLeaflet.p = null; rej(new Error('leaflet')); };
            document.head.appendChild(sc);
        });
        return loadLeaflet.p;
    }
    function loadGoogle(key) {
        if (window.google && window.google.maps && window.google.maps.importLibrary) return Promise.resolve();
        if (loadGoogle.p) return loadGoogle.p;
        loadGoogle.p = new Promise((res, rej) => {
            const timer = setTimeout(() => { loadGoogle.p = null; rej(new Error('gm-timeout')); }, 15000);
            window.__flGm = () => { clearTimeout(timer); res(); };
            window.gm_authFailure = () => { C.gmAuthFailed = true; C.emit('gm-auth'); };
            const sc = document.createElement('script');
            sc.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&loading=async&language=ar&region=IQ&callback=__flGm';
            sc.async = true; sc.onerror = () => { clearTimeout(timer); loadGoogle.p = null; rej(new Error('gm-load')); };
            document.head.appendChild(sc);
        });
        return loadGoogle.p;
    }

    // ---------- the map adapter: Leaflet ----------
    async function makeLeaflet(host, start) {
        await loadLeaflet();
        const L = window.L, map = L.map(host, { zoomControl: false, attributionControl: true, zoomSnap: 0, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, minZoom: 2, maxZoom: 19, preferCanvas: true, worldCopyJump: false, inertia: true });
        map.attributionControl.setPrefix('');
        map.setView([start.lat, start.lng], start.z, { animate: false });
        let tile = null, dark = null, errs = 0, tried = 0, mode = 'street', over = [];
        const SRC = [
            ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }],
            ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' }],
        ];
        const SAT = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 18, attribution: 'Esri, Maxar, Earthstar Geographics' }];
        const LAB = [];                                   // plain photos: no road numbers or place names drawn over them
        const lines = {};
        // a tile server that stops answering (or asks for a key) is replaced by the next one
        const useTiles = (i) => {
            if (tile) map.removeLayer(tile);
            errs = 0; tried = i;
            over.forEach((l) => map.removeLayer(l)); over = [];
            if (mode === 'sat') {
                // real satellite photos (houses, streets) with the roads and place names drawn over them
                tile = L.tileLayer(SAT[0], Object.assign({ keepBuffer: 1, updateWhenZooming: false, updateInterval: 250 }, SAT[1])).addTo(map);
                LAB.forEach((u) => over.push(L.tileLayer(u, { maxZoom: 19, maxNativeZoom: 18, opacity: 0.95, attribution: '' }).addTo(map)));
                tile.on('tileload', () => { errs = 0; });
                return;
            }
            tile = L.tileLayer(SRC[i][0], Object.assign({ keepBuffer: 1, updateWhenZooming: false, updateInterval: 250 }, SRC[i][1])).addTo(map);
            tile.on('tileload', () => { errs = 0; });
            tile.on('tileerror', () => { if (++errs >= 6 && tried + 1 < SRC.length) useTiles(tried + 1); });
        };
        const A = {
            kind: 'leaflet', fractional: true,
            setDark(d) { dark = d; host.classList.toggle('fl-night', !!d); if (!tile) useTiles(0); },
            setMapType(t) { mode = t === 'sat' ? 'sat' : 'street'; host.classList.toggle('fl-sat', mode === 'sat'); useTiles(0); },
            view(out) { const c = map.getCenter(); out.lat = c.lat; out.lng = c.lng; out.z = map.getZoom(); out.w = host.clientWidth; out.h = host.clientHeight; return out; },
            // moving the camera with a fixed zoom only slides the map layer by a fraction of a pixel (no re-layout of the tiles every frame:
            // that was the stutter); the tiles catch up a few times a second
            setView(lat, lng, z) {
                const cz = map.getZoom();
                if ((z == null || Math.abs(z - cz) < 1e-4) && map._rawPanBy && map._loaded) {
                    const a = map.project(map.getCenter(), cz), b = map.project([lat, lng], cz), dx = b.x - a.x, dy = b.y - a.y;
                    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;
                    if (Math.abs(dx) > 600 || Math.abs(dy) > 600) { map.setView([lat, lng], cz, { animate: false }); return; }
                    map._rawPanBy(L.point(dx, dy));
                    const n = performance.now(); if (n - (A._me || 0) > 350) { A._me = n; map.fire('moveend'); }
                    return;
                }
                map.setView([lat, lng], z == null ? cz : z, { animate: false });
            },
            line(id, pts, st) {
                const ll = pts.map((p) => [p[0], p[1]]);
                if (!lines[id]) lines[id] = L.polyline(ll, { interactive: false, lineCap: 'round', lineJoin: 'round', ...st }).addTo(map); else { lines[id].setLatLngs(ll); lines[id].setStyle(st); }
            },
            noLine(id) { if (lines[id]) { map.removeLayer(lines[id]); delete lines[id]; } },
            on(evt, fn) {
                if (evt === 'drag') map.on('dragstart', fn);
                else if (evt === 'tap') map.on('click', (e) => fn(e.containerPoint.x, e.containerPoint.y));
                else if (evt === 'moveend') map.on('moveend', fn);
            },
            invalidate() { map.invalidateSize(false); },
            destroy() { try { map.remove(); } catch (e) {} },
            raw: map,
        };
        return A;
    }

    // ---------- the map adapter: Google Maps ----------
    const GM_DARK = [
        { elementType: 'geometry', stylers: [{ color: '#1b2438' }] }, { elementType: 'labels.text.fill', stylers: [{ color: '#8a96ad' }] }, { elementType: 'labels.text.stroke', stylers: [{ color: '#141b2b' }] },
        { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3a4560' }] }, { featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a3550' }] },
        { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] }, { featureType: 'transit', stylers: [{ visibility: 'off' }] }, { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1220' }] },
    ];
    const GM_LIGHT = [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'transit', stylers: [{ visibility: 'off' }] }, { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] }];
    async function makeGoogle(host, key, start) {
        await loadGoogle(key);
        const { Map } = await window.google.maps.importLibrary('maps');
        const map = new Map(host, { center: { lat: start.lat, lng: start.lng }, zoom: Math.round(start.z), disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false, backgroundColor: '#0b1220', minZoom: 2, maxZoom: 19, keyboardShortcuts: false, styles: GM_LIGHT });
        const lines = {}, ready = new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('gm-tiles')), 14000); window.google.maps.event.addListenerOnce(map, 'tilesloaded', () => { clearTimeout(t); res(); }); });
        await ready;
        if (C.gmAuthFailed) throw new Error('gm-auth');
        let dark = null;
        const A = {
            kind: 'google', fractional: false,
            setMapType(t) { map.setMapTypeId(t === 'sat' ? 'hybrid' : 'roadmap'); },
            setDark(d) { if (dark === d) return; dark = d; map.setOptions({ styles: d ? GM_DARK : GM_LIGHT }); },
            view(out) { const c = map.getCenter(); out.lat = c.lat(); out.lng = c.lng(); out.z = map.getZoom(); out.w = host.clientWidth; out.h = host.clientHeight; return out; },
            setView(lat, lng, z) { map.setCenter({ lat, lng }); if (z != null && Math.round(z) !== map.getZoom()) map.setZoom(Math.round(z)); },
            line(id, pts, st) {
                const path = pts.map((p) => ({ lat: p[0], lng: p[1] })), o = { path, strokeColor: st.color, strokeOpacity: st.opacity, strokeWeight: st.weight, clickable: false, geodesic: false };
                if (!lines[id]) lines[id] = new window.google.maps.Polyline({ ...o, map }); else lines[id].setOptions(o);
            },
            noLine(id) { if (lines[id]) { lines[id].setMap(null); delete lines[id]; } },
            on(evt, fn) {
                const ev = window.google.maps.event;
                if (evt === 'drag') ev.addListener(map, 'dragstart', fn);
                else if (evt === 'tap') ev.addListener(map, 'click', (e) => { const r = host.getBoundingClientRect(), d = e.domEvent || {}, t = (d.changedTouches && d.changedTouches[0]) || d; fn((t.clientX || 0) - r.left, (t.clientY || 0) - r.top); });
                else if (evt === 'moveend') ev.addListener(map, 'idle', fn);
            },
            invalidate() { window.google.maps.event.trigger(map, 'resize'); },
            destroy() { try { window.google.maps.event.clearInstanceListeners(map); host.innerHTML = ''; } catch (e) {} },
            raw: map,
        };
        return A;
    }

    // ---------- starting the engine ----------
    // opts: { host, canvas, key (a Google Maps key or ''), start: { lat, lng, z } }
    C.init = async function (opts) {
        C.destroy();
        C.host = opts.host; C.cv = opts.canvas; C.ctx = C.cv.getContext('2d');
        const start = opts.start || { lat: 32.8, lng: 44.4, z: 5.6 };
        let A = null;
        const key = String(opts.key || '').trim();
        if (/^AIza[0-9A-Za-z_-]{30,60}$/.test(key) && !opts.noGoogle) {
            try { A = await makeGoogle(C.host, key, start); } catch (e) { console.warn('google maps failed', e && e.message); C.gmError = (e && e.message) || 'gm'; C.host.innerHTML = ''; loadGoogle.p = null; }
        }
        if (!A) A = await makeLeaflet(C.host, start);
        C.adapter = A; C._born = ms();
        C.perf = jget(KEY.PERF, null) == null ? (navigator.deviceMemory ? navigator.deviceMemory <= 2 : false) : !!jget(KEY.PERF, false);
        C.mapType = jget(KEY.MAP, 'street') === 'sat' ? 'sat' : 'street';
        if (C.mapType === 'sat') A.setMapType('sat');
        C.autoNight();
        A.on('drag', () => { if (C.cam !== 'free') { C.cam = 'free'; C.emit('cam', 'free'); } });
        A.on('tap', (x, y) => C.tap(x, y));
        A.on('moveend', () => { C.syncSoon(); });
        C.resize();
        C._ro = new ResizeObserver(() => C.resize()); C._ro.observe(C.host);
        C.watchNet();
        C.bakeSprites();
        C.run();
        return A;
    };
    C.destroy = function () {
        C.stop();
        C.unsubAll();
        if (C._ro) { C._ro.disconnect(); C._ro = null; }
        if (C._netOff) { C._netOff(); C._netOff = null; }
        window.removeEventListener('online', C._on); window.removeEventListener('offline', C._off);
        if (C.adapter) { C.adapter.destroy(); C.adapter = null; }
        C._lines = {};
    };
    C.resize = function () {
        if (!C.host || !C.cv) return;
        const w = C.host.clientWidth || 1, h = C.host.clientHeight || 1, d = Math.min(window.devicePixelRatio || 1, C.perf ? 1.25 : 2);
        if (w === C.w && h === C.h && d === C.dpr) return;
        C.w = w; C.h = h; C.dpr = d;
        C.cv.width = Math.round(w * d); C.cv.height = Math.round(h * d); C.cv.style.width = w + 'px'; C.cv.style.height = h + 'px';
        if (C.adapter) C.adapter.invalidate();
    };
    // dark map at night (local clock), unless the student fixed it
    C.autoNight = function () { const H = new Date().getHours(), n = H >= 19 || H < 5; C.night = n; if (C.adapter) C.adapter.setDark(n); };

    // ---------- the plane sprites ----------
    C.bakeSprites = async function () {
        if (C.spriteState) return;
        C.spriteState = 'loading';
        try {
            const mod = await import(new URL('js/flight3d.js?v=' + (window.APP_VER || '1'), document.baseURI).href);
            C._styles = mod.STYLES; C._banks = mod.BANKS;
            C.sprites = mod.bake();
            // a black copy of each sprite (the shadow on the ground)
            C.shadow = {};
            Object.keys(C.sprites).forEach((k) => { const s = C.sprites[k][3], c = document.createElement('canvas'); c.width = s.width; c.height = s.height; const g = c.getContext('2d'); g.drawImage(s, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); C.shadow[k] = c; });
            C.spriteState = 'ready';
        } catch (e) { C.spriteState = 'flat'; C.sprites = null; }
    };
    const BANK_LIST = [-28, -18, -9, 0, 9, 18, 28];
    // the flat silhouette (performance mode, no WebGL, or while the sprites are still being made)
    const FLAT = new Path2D('M0,-0.5 C0.03,-0.5 0.05,-0.42 0.055,-0.3 L0.055,-0.12 L0.62,0.18 L0.62,0.25 L0.055,0.06 L0.045,0.3 L0.2,0.43 L0.2,0.5 L0.02,0.44 L0,0.5 L-0.02,0.44 L-0.2,0.5 L-0.2,0.43 L-0.045,0.3 L-0.055,0.06 L-0.62,0.25 L-0.62,0.18 L-0.055,-0.12 L-0.055,-0.3 C-0.05,-0.42 -0.03,-0.5 0,-0.5 Z');
    const ACCENT = { modern: '#0ea5e9', classic: '#dc2626', minimal: '#f8fafc' };
    // draw a plane at (x, y), heading in degrees (0 = up), size = wing span in pixels, lift = pixels of "altitude" (shadow offset)
    function drawPlane(g, x, y, head, size, bank, sty, alpha, lift, flat, ex) {
        g.save(); g.translate(x, y);
        const rot = (head * Math.PI) / 180;
        if (lift > 0.5) { g.save(); g.rotate(0); g.translate(lift * 0.35, lift * 0.9); g.rotate(rot); g.globalAlpha = alpha * 0.28; if (!flat && C.shadow && C.shadow[sty]) g.drawImage(C.shadow[sty], -size / 2, -size / 2, size, size); else { g.scale(size, size); g.fillStyle = '#000'; g.fill(FLAT); } g.restore(); }
        g.rotate(rot); g.globalAlpha = alpha;
        if (ex && ex.sx != null) g.scale(ex.sx, 1);           // a roll: the wings turn edge-on and back
        if (!flat && C.sprites && C.sprites[sty]) {
            const sp = C.sprites[sty], b = clamp(bank, -28, 28);
            let i = 0; while (i < BANK_LIST.length - 2 && b > BANK_LIST[i + 1]) i++;
            const t = clamp((b - BANK_LIST[i]) / (BANK_LIST[i + 1] - BANK_LIST[i]), 0, 1);
            if (C.perf || t < 0.02) g.drawImage(sp[t > 0.5 ? i + 1 : i], -size / 2, -size / 2, size, size);
            else { g.globalAlpha = alpha * (1 - t); g.drawImage(sp[i], -size / 2, -size / 2, size, size); g.globalAlpha = alpha * t; g.drawImage(sp[i + 1], -size / 2, -size / 2, size, size); }
        } else { g.scale(size * 0.82, size * 0.82); g.fillStyle = '#f4f6f8'; g.fill(FLAT); g.lineWidth = 0.05; g.strokeStyle = ACCENT[sty] || '#0ea5e9'; g.stroke(FLAT); }
        g.restore();
    }

    // ---------- the offline / online mark ----------
    C._on = () => { C.online = true; C.emit('net', true); };
    C._off = () => { C.online = false; C.emit('net', false); };
    C.watchNet = function () {
        window.addEventListener('online', C._on); window.addEventListener('offline', C._off);
        C.online = navigator.onLine !== false;
        const db = window.firebaseDb, H = window.firebaseDbHelpers;
        if (db && H) {
            try {
                const o1 = H.onValue(H.ref(db, '.info/serverTimeOffset'), (s) => { const v = Number(s.val()); if (Number.isFinite(v)) C.off = v; });
                const o2 = H.onValue(H.ref(db, '.info/connected'), (s) => { const on = s.val() === true; if (on !== C.online) { C.online = on; C.emit('net', on); } });
                C._netOff = () => { try { o1 && o1(); o2 && o2(); } catch (e) {} };
            } catch (e) {}
        }
    };

    // ---------- the camera ----------
    const V = { lat: 0, lng: 0, z: 5, w: 1, h: 1 }, P = [0, 0], Q = [0, 0], POS = [0, 0];
    C.view = () => C.adapter ? C.adapter.view(V) : V;
    C.setCam = function (mode) {
        C.cam = mode; C.camT0 = ms(); const v = C.view(); C.camFrom = { lat: v.lat, lng: v.lng, z: v.z };
        if (mode === 'overview') C.camGoal = C.routeView();
        C.emit('cam', mode);
    };
    C.routeView = function () { const f = C.heroFlight(); if (!f) return null; const sf = FM.fitView([f.o, f.d], C.w, C.h, C.pad, 12); return sf; };
    C.heroFlight = () => C.replay ? C.replay.rec : C.hero;
    C.heroState = function () {
        const f = C.heroFlight(); if (!f) return null;
        if (C.replay) { const r = C.replay; return FM.stateAt(f, f.s + r.base); }
        return FM.stateAt(f, C.now());
    };
    // the opening move: out from the departure city, the whole route, then onto the plane
    C.intro = function () { C._landZ = 0; C._zGoal = null; C.cam = 'intro'; C.camT0 = ms(); const f = C.heroFlight(); if (!f) return; C.camGoal = C.routeView(); C.introFrom = { lat: f.o[0], lng: f.o[1] }; C.emit('cam', 'intro'); };
    const FOLLOW_Z = (goalZ) => C.mapType === 'sat' ? clamp(goalZ + 5, 11, 14) : clamp(goalZ + 2, 6.5, 11);
    // switch between the street map and the satellite photos; the camera dives down when the photos are on
    C.setMapType = function (t) {
        t = t === 'sat' ? 'sat' : 'street'; C.mapType = t; jset(KEY.MAP, t);
        if (C.adapter && C.adapter.setMapType) C.adapter.setMapType(t);
        const rv = C.heroFlight() ? C.routeView() : null;
        if (C.cam === 'follow' && rv) C._zGoal = FOLLOW_Z(rv.z);
        C.emit('maptype', t);
    };
    // the middle of the part of the screen that is not covered by the sheet / the top bar: that is where the plane should be
    C.visCenter = function () { const p = C.pad; return { x: p.l + (C.w - p.l - p.r) / 2, y: p.t + (C.h - p.t - p.b) / 2 }; };
    // the map centre that puts `pos` in the middle of the visible part at zoom z
    C.shiftCenter = function (pos, z) {
        const c = C.visCenter(), vv = { lat: pos[0], lng: pos[1], z, w: C.w, h: C.h };
        const o = FM.unproject(vv, C.w / 2 - (c.x - C.w / 2), C.h / 2 - (c.y - C.h / 2)); return { lat: o[0], lng: o[1] };
    };
    function cameraStep(dt, hs) {
        const A = C.adapter; if (!A || !hs || C.cam === 'free') return;
        const v = C.view();
        if (C.cam === 'intro') {
            const t = (ms() - C.camT0) / 1000, g = C.camGoal || { lat: hs.pos[0], lng: hs.pos[1], z: 7 }, f = C.heroFlight();
            if (A.fractional) {
                const zS = Math.min(9, g.z + 2.6), zF = FOLLOW_Z(g.z);
                if (t < 0.9) { const k = ease(t / 0.9); A.setView(lerp(C.introFrom.lat, g.lat, k), lerp(C.introFrom.lng, g.lng, k), lerp(zS, g.z, k)); }
                else if (t < 1.7) A.setView(g.lat, g.lng, g.z);
                else if (t < 2.9) { const k = ease((t - 1.7) / 1.2), sc = C.shiftCenter(hs.pos, lerp(g.z, zF, k)); A.setView(lerp(g.lat, sc.lat, k), lerp(g.lng, sc.lng, k), lerp(g.z, zF, k)); }
                else { C.cam = 'follow'; C.emit('cam', 'follow'); }
            } else {
                if (t < 0.05) A.setView(f.o[0], f.o[1], Math.min(9, g.z + 2));
                else if (t < 1.3 && !C._introStep1) { C._introStep1 = 1; A.setView(g.lat, g.lng, g.z); }
                else if (t > 2.5) { C._introStep1 = 0; C.cam = 'follow'; const z2 = FOLLOW_Z(g.z), sc = C.shiftCenter(hs.pos, Math.round(z2)); A.setView(sc.lat, sc.lng, z2); C.emit('cam', 'follow'); }
            }
            return;
        }
        if (C.cam === 'follow') {
            const k = 1 - Math.exp(-dt * 3.2), vc = C.visCenter();
            FM.project(v, hs.pos[0], hs.pos[1], P);
            const ll = FM.unproject(v, v.w / 2 + (P[0] - vc.x), v.h / 2 + (P[1] - vc.y), Q);
            let zz = null;
            if (C._zGoal != null) { zz = A.fractional ? lerp(v.z, C._zGoal, 1 - Math.exp(-dt * 2.4)) : Math.round(C._zGoal); if (Math.abs(v.z - C._zGoal) < 0.06) C._zGoal = null; }
            else if (hs.status === 'landing' && !C._landZ) { C._landZ = 1; C._zGoal = Math.min(16, FOLLOW_Z(C.routeView() ? C.routeView().z : 7) + 1.6); }
            A.setView(lerp(v.lat, ll[0], k), lerp(v.lng, ll[1], k), zz);
        } else if (C.cam === 'overview') {
            const g = C.camGoal || C.routeView(); if (!g) return;
            if (A.fractional) { const k = 1 - Math.exp(-dt * 4); A.setView(lerp(v.lat, g.lat, k), lerp(v.lng, g.lng, k), lerp(v.z, g.z, k)); }
            else if (!C._ovDone) { C._ovDone = 1; A.setView(g.lat, g.lng, g.z); }
        }
        if (C.cam !== 'overview') C._ovDone = 0;
    }

    // ---------- other students' flights: the 4-degree cells of the visible map ----------
    C.syncSoon = function () { clearTimeout(C._syncT); C._syncT = setTimeout(C.syncCells, 450); };
    C.unsubAll = function () { C.subs.forEach((u) => { try { u(); } catch (e) {} }); C.subs.clear(); C.others.clear(); };
    C.syncCells = function () {
        const db = window.firebaseDb, H = window.firebaseDbHelpers;
        if (!C.adapter || !C.showOthers || !db || !H || !window.app || !app.isLoggedIn) { if (!C.showOthers) C.unsubAll(); return; }
        const v = C.view(), tl = FM.unproject(v, 0, 0), br = FM.unproject(v, v.w, v.h);
        const want = new Set(FM.cellsForBounds({ s: Math.min(tl[0], br[0]), n: Math.max(tl[0], br[0]), w: tl[1], e: br[1] }, v.z < 4.5 ? 16 : 10));
        C.subs.forEach((u, c) => { if (!want.has(c)) { try { u(); } catch (e) {} C.subs.delete(c); C.others.forEach((o, id) => { o.cells.delete(c); if (!o.cells.size) C.others.delete(id); }); } });
        want.forEach((c) => {
            if (C.subs.has(c)) return;
            const q = H.query(H.ref(db, 'flightGrid/' + c), H.orderByChild('s'), H.startAt(C.now() - 12 * 3600000), H.limitToLast(C.perf ? 60 : 150));
            const un = H.onValue(q, (snap) => {
                const val = snap.val() || {}, seen = new Set();
                Object.keys(val).forEach((id) => {
                    const r = val[id]; if (!r || !Number.isFinite(r.s) || !Number.isFinite(r.du)) return;
                    seen.add(id);
                    if (C.hero && C.hero.fid === id) return;
                    let o = C.others.get(id);
                    if (!o) { o = { id, cells: new Set(), f: { s: r.s, du: r.du, o: [r.oa, r.oo], d: [r.da, r.do], on: r.on, dn: r.dn, sty: r.sty, n: r.n, dist: FM.haversine([r.oa, r.oo], [r.da, r.do]) }, born: 0 }; C.others.set(id, o); }
                    o.cells.add(c);
                    // long-finished flights are swept away by whoever sees them (the rules allow it)
                    if (r.s + r.du < C.now() - 3600000 && C._sweeps < 6) { C._sweeps++; try { H.set(H.ref(db, 'flightGrid/' + c + '/' + id), null).catch(() => {}); } catch (e) {} }
                });
                C.others.forEach((o, id) => { if (o.cells.has(c) && !seen.has(id)) { o.cells.delete(c); if (!o.cells.size) C.others.delete(id); } });
                C._sweeps = 0;
            }, () => {});
            C.subs.set(c, un);
        });
    };
    C._sweeps = 0;
    C.setShowOthers = function (on) { C.showOthers = !!on; if (on) C.syncCells(); else C.unsubAll(); };

    // ---------- tapping ----------
    C.tap = function (x, y) {
        if (C.pick) { const v = C.view(), ll = FM.unproject(v, x, y); const fn = C.pick; C.pick = null; fn(ll[0], ll[1]); return; }
        let best = null, bd = 34 * 34;
        for (let i = 0; i < C.hits.length; i++) { const h = C.hits[i], d = (h.x - x) ** 2 + (h.y - y) ** 2; if (d < bd && d < (h.r + 14) ** 2) { bd = d; best = h; } }
        if (!best) { C.emit('tap-empty'); return; }
        if (best.cluster) {
            const pts = best.cluster.map((o) => FM.gcPoint(o.f.o, o.f.d, FM.stateAt(o.f, C.now()).p));
            const g = FM.fitView(pts.length > 1 ? pts : [pts[0], [pts[0][0] + 0.5, pts[0][1] + 0.5]], C.w, C.h, { t: 120, b: 260, l: 40, r: 40 }, 11);
            C.setCam('free'); if (C.adapter.fractional) C.adapter.setView(g.lat, g.lng, g.z); else C.adapter.setView(g.lat, g.lng, Math.round(g.z));
            return;
        }
        if (best.hero) C.emit('tap-hero'); else C.emit('tap-flight', best.id);
    };

    // ---------- drawing ----------
    function pin(g, x, y, label, color, night) {
        g.save(); g.fillStyle = color; g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 6, 0, 6.2832); g.fill(); g.stroke();
        g.font = '700 12px Tahoma, Arial, sans-serif'; g.textAlign = 'center'; g.lineWidth = 3.5; g.strokeStyle = night ? 'rgba(8,12,22,.85)' : 'rgba(255,255,255,.92)'; g.fillStyle = night ? '#e5edff' : '#0f172a';
        g.strokeText(label, x, y - 12); g.fillText(label, x, y - 12); g.restore();
    }
    const NAV = { l: '#ff3b3b', r: '#2cff7a' };
    function lights(g, x, y, head, size, now, night) {
        const rot = (head * Math.PI) / 180, c = Math.cos(rot), s = Math.sin(rot), wx = size * 0.34, wy = size * 0.1;
        const dots = [[-wx, wy, NAV.l], [wx, wy, NAV.r]];
        g.save();
        dots.forEach((d) => { const px = x + d[0] * c - d[1] * s, py = y + d[0] * s + d[1] * c; g.globalAlpha = night ? 0.95 : 0.55; g.fillStyle = d[2]; g.beginPath(); g.arc(px, py, night ? 2.4 : 1.6, 0, 6.2832); g.fill(); });
        if (night && (now % 1400) < 120) { g.globalAlpha = 0.95; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y + size * 0.02, 3, 0, 6.2832); g.fill(); }
        g.restore();
    }
    const GRID = new Map();
    function drawOthers(g, v, now, hero) {
        C.hits.length = 0;
        if (!C.showOthers || C.replay) return;
        const near = [], cap = C.perf ? 40 : 160;
        GRID.clear();
        const cellPx = v.z < 5 ? 86 : v.z < 7 ? 60 : 46;
        let n = 0;
        C.others.forEach((o) => {
            const st = FM.stateAt(o.f, now);
            if (st.status === 'done' && now - st.end > 40000) return;
            if (!C.passFilter(o, st, hero)) return;
            FM.project(v, st.pos[0], st.pos[1], P);
            if (P[0] < -60 || P[0] > v.w + 60 || P[1] < -60 || P[1] > v.h + 60) return;
            if (++n > 600) return;
            near.push({ o, st, x: P[0], y: P[1] });
        });
        // too many to show one by one: groups on a pixel grid ("x 24"); they open as you zoom in
        const cluster = near.length > (C.perf ? 18 : 34) || v.z < 5.2;
        if (cluster) {
            near.forEach((it) => { const k = Math.floor(it.x / cellPx) + ',' + Math.floor(it.y / cellPx); let c = GRID.get(k); if (!c) { c = { n: 0, x: 0, y: 0, items: [] }; GRID.set(k, c); } c.n++; c.x += it.x; c.y += it.y; c.items.push(it); });
        }
        const singles = [];
        if (cluster) {
            GRID.forEach((c) => {
                if (c.n >= 3 || (v.z < 5.2 && c.n >= 2)) {
                    const x = c.x / c.n, y = c.y / c.n, r = 15 + Math.min(10, Math.log2(c.n) * 3);
                    g.save(); g.globalAlpha = 0.95; g.fillStyle = C.night ? '#0ea5e9' : '#0369a1'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); g.stroke();
                    g.fillStyle = '#fff'; g.font = '800 12px Tahoma, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('×' + c.n, x, y + 0.5); g.restore();
                    C.hits.push({ x, y, r, cluster: c.items.map((it) => it.o) });
                } else c.items.forEach((it) => singles.push(it));
            });
        } else near.forEach((it) => singles.push(it));
        // the nearest ones to the centre of the screen are drawn first-class, the rest as small shapes / dots
        singles.sort((a, b) => ((a.x - v.w / 2) ** 2 + (a.y - v.h / 2) ** 2) - ((b.x - v.w / 2) ** 2 + (b.y - v.h / 2) ** 2));
        let drawn = 0;
        for (let i = 0; i < singles.length && drawn < cap; i++, drawn++) {
            const it = singles[i], st = it.st, o = it.o, d2 = (it.x - v.w / 2) ** 2 + (it.y - v.h / 2) ** 2;
            const lod = (v.z >= 8 || (d2 < 190 * 190 && v.z >= 6.5)) && !C.perf ? 0 : v.z >= 6.2 ? 1 : 2;
            if (!o.born) o.born = ms();
            const sp = ease((ms() - o.born) / 1300);                         // a new plane rises in
            const alpha = (st.status === 'done' ? clamp(1 - (now - st.end) / 40000, 0, 1) : 1) * sp;
            const size = lod === 0 ? lerp(28, 44, clamp((v.z - 7) / 4, 0, 1)) : lod === 1 ? 22 : 0;
            if (lod === 2) { g.save(); g.globalAlpha = alpha * 0.9; g.fillStyle = C.night ? '#7dd3fc' : '#0369a1'; g.beginPath(); g.arc(it.x, it.y, 3.2, 0, 6.2832); g.fill(); g.restore(); }
            else drawPlane(g, it.x, it.y, st.head, size * (0.7 + 0.3 * sp), lod === 0 ? st.bank : 0, o.f.sty || 'modern', alpha, lod === 0 ? (1 - 0.5 * (1 - sp)) * size * 0.16 : 0, lod !== 0);
            C.hits.push({ x: it.x, y: it.y, r: Math.max(12, size / 2), id: o.id });
        }
    }
    C.passFilter = function (o, st, hero) {
        switch (C.filter) {
            case 'iraq': { const a = o.f.o, b = o.f.d, inb = (p) => p[0] >= IRAQ_BOX.s && p[0] <= IRAQ_BOX.n && p[1] >= IRAQ_BOX.w && p[1] <= IRAQ_BOX.e; return inb(a) || inb(b); }
            case 'mine': return false;
            case 'near': { const c = C.me || (C.adapter ? [V.lat, V.lng] : null); return c ? FM.haversine(c, st.pos) < 300 : true; }
            case 'active': return st.status !== 'done';
            case 'done': return st.status === 'done';
            default: return true;
        }
    };


    // ---------- a sense of speed (a real cruise moves only a few pixels a minute, so the air around the plane moves instead) ----------
    let cloudSp = null; const CLOUDS = [];
    function cloudSprite() {
        const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
        [[96, 70, 56], [150, 62, 62], [196, 76, 44], [64, 82, 38], [128, 84, 50]].forEach((b) => { const gr = g.createRadialGradient(b[0], b[1], 2, b[0], b[1], b[2]); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128); });
        return c;
    }
    function drawClouds(g, w, h, head, dt, k, night) {
        if (!cloudSp) { cloudSp = cloudSprite(); let r = 7; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; }; for (let i = 0; i < 12; i++) CLOUDS.push({ x: rnd(), y: rnd(), s: 90 + rnd() * 130, a: 0.16 + rnd() * 0.2 }); }
        const n = C.perf ? 3 : 7, rad = (head * Math.PI) / 180, dx = -Math.sin(rad), dy = Math.cos(rad);
        g.save();
        for (let i = 0; i < n; i++) {
            const c = CLOUDS[i], sp = (18 + c.s * 0.32) * k;                    // bigger = closer = faster
            c.x += (dx * sp * dt) / w; c.y += (dy * sp * dt) / h;
            const m = c.s / w; if (c.x < -m) c.x += 1 + 2 * m; else if (c.x > 1 + m) c.x -= 1 + 2 * m; if (c.y < -m) c.y += 1 + 2 * m; else if (c.y > 1 + m) c.y -= 1 + 2 * m;
            g.globalAlpha = c.a * (night ? 0.45 : 1) * k; g.drawImage(cloudSp, c.x * w - c.s, c.y * h - c.s * 0.5, c.s * 2, c.s);
        }
        g.restore();
    }
    // pulses of light running along the route ahead of the plane (the direction of travel, at a steady speed)
    function drawFlow(g, v, f, hs, t) {
        if (hs.status === 'done' || hs.p >= 0.999) return;
        const n = 18, a = hs.p, b = Math.min(1, hs.p + 0.22);
        g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([2, 15]); g.lineDashOffset = -((t / 1000) * 26) % 17; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.9)'; g.shadowBlur = 0;
        g.beginPath();
        for (let i = 0; i <= n; i++) { FM.gcPoint(f.o, f.d, a + (b - a) * (i / n), POS); FM.project(v, POS[0], POS[1], Q); if (i) g.lineTo(Q[0], Q[1]); else g.moveTo(Q[0], Q[1]); }
        g.stroke(); g.restore();
    }

    // ---------- stunts: a roll, a spin, a wing wave (tap the plane, or the sparkle button) ----------
    const STUNTS = { roll: 2300, spin: 2600, wave: 2000, dive: 2400 };
    C.stunt = function (kind) {
        if (C._st) return false;
        const ks = Object.keys(STUNTS); kind = STUNTS[kind] ? kind : ks[Math.floor(Math.random() * ks.length)];
        C._st = { k: kind, t0: ms(), dur: STUNTS[kind] }; C.emit('stunt', kind); return kind;
    };
    // returns the extra look of the plane for now: { sx, rot, scale, bank, k } or null
    function stuntNow() {
        const st = C._st; if (!st) return null;
        const k = (ms() - st.t0) / st.dur; if (k >= 1) { C._st = null; return null; }
        const e = ease(k);
        if (st.k === 'roll') return { sx: Math.cos(e * 4 * Math.PI), rot: 0, scale: 1 + 0.12 * Math.sin(Math.PI * k), bank: 0, k };
        if (st.k === 'spin') return { sx: 1, rot: 360 * e, scale: 1 + 0.3 * Math.sin(Math.PI * k), bank: 0, k };
        if (st.k === 'wave') return { sx: 1, rot: 0, scale: 1, bank: 26 * Math.sin(k * 6 * Math.PI) * (1 - k), k };
        return { sx: 1, rot: 0, scale: 1 + 0.5 * Math.sin(Math.PI * k), bank: 0, k, dive: true };           // dive: swoops towards the viewer and back
    }
    // sparks flying out of the plane during a stunt
    function drawSparks(g, x, y, k, size, kind) {
        const n = C.perf ? 8 : 18; g.save();
        for (let i = 0; i < n; i++) {
            const a = (i / n) * 6.2832 + k * 3, r = size * (0.2 + 0.9 * ((k * 1.4 + i * 0.173) % 1)), al = 1 - ((k * 1.4 + i * 0.173) % 1);
            g.globalAlpha = al * 0.9; g.fillStyle = i % 3 === 0 ? '#fde047' : i % 3 === 1 ? '#38bdf8' : '#fff';
            g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.6 + 2 * al, 0, 6.2832); g.fill();
        }
        if (kind === 'spin') { g.globalAlpha = 0.5 * (1 - k); g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, size * (0.4 + 0.5 * k), 0, 6.2832); g.stroke(); }
        g.restore();
    }
    // thin streaks sliding past the plane against its heading (the feeling of speed)
    const STREAKS = [];
    function drawStreaks(g, w, h, head, dt, k, night) {
        if (!STREAKS.length) { let r = 11; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; }; for (let i = 0; i < 16; i++) STREAKS.push({ x: rnd(), y: rnd(), l: 26 + rnd() * 60, v: 380 + rnd() * 420, a: 0.12 + rnd() * 0.18 }); }
        const rad = (head * Math.PI) / 180, dx = -Math.sin(rad), dy = Math.cos(rad), n = C.perf ? 5 : STREAKS.length;
        g.save(); g.lineCap = 'round'; g.lineWidth = 1.6;
        for (let i = 0; i < n; i++) {
            const c = STREAKS[i]; c.x += (dx * c.v * k * dt) / w; c.y += (dy * c.v * k * dt) / h;
            if (c.x < -0.2) c.x += 1.4; else if (c.x > 1.2) c.x -= 1.4; if (c.y < -0.2) c.y += 1.4; else if (c.y > 1.2) c.y -= 1.4;
            const X = c.x * w, Y = c.y * h; g.strokeStyle = 'rgba(255,255,255,' + (c.a * k * (night ? 0.6 : 1)) + ')';
            g.beginPath(); g.moveTo(X, Y); g.lineTo(X - dx * c.l * k, Y - dy * c.l * k); g.stroke();
        }
        g.restore();
    }
    // slow pulsing rings on the two cities
    function cityRing(g, x, y, color, t, phase) {
        const k = ((t / 2600 + phase) % 1); g.save(); g.strokeStyle = color; g.globalAlpha = 0.55 * (1 - k); g.lineWidth = 2; g.beginPath(); g.arc(x, y, 8 + k * 34, 0, 6.2832); g.stroke(); g.restore();
    }

    function frame(t) {
        C._raf = requestAnimationFrame(frame);
        if (!C._run || !C.adapter) return;
        if (C.onFrame && C.onFrame() === false) return;                   // the page says: not visible
        const dt = Math.min(0.1, (t - (C._last || t)) / 1000); C._last = t;
        // measure only after the start-up (loading tiles and baking the plane make the first seconds slow) and use the median
        if (ms() - (C._born || 0) > 6000) { C._ft.push(dt); if (C._ft.length > 150) C._ft.shift(); if (!C.perf && !C.perfAuto && C._ft.length === 150) { const m = C._ft.slice().sort((a, b) => a - b)[75]; if (m > 0.042) { C.perfAuto = true; C.setPerf(true, true); } } }
        if (C.replay && !C.replay.paused) { const f = C.replay.rec; C.replay.base = Math.min(f.du + 2000, C.replay.base + dt * 1000 * C.replay.speed); }
        const now = C.now(), v = C.view(), g = C.ctx, d = C.dpr;
        const hs = C.heroState();
        cameraStep(dt, hs);
        g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, C.w, C.h);
        // the route lines: the part flown fades, the part to fly glows (refreshed about once a second)
        if (hs) drawRoute(g, v, hs);
        const f = C.heroFlight();
        if (C.preview) { /* the route before the flight starts: lines only (set by setPreview) */ }
        if (hs && (C.cam === 'follow' || C.cam === 'intro') && (hs.status === 'flying' || hs.status === 'landing')) drawClouds(g, C.w, C.h, hs.head, dt, clamp(hs.left / 9000, 0.12, 1) * clamp(hs.el / 7000, 0, 1) * clamp(1.5 - (v.z - 9) / 5, 0.25, 1), C.night);
        if (hs && (C.cam === 'follow' || C.cam === 'intro') && hs.status === 'flying') drawStreaks(g, C.w, C.h, hs.head, dt, clamp(hs.left / 9000, 0.1, 1) * clamp(hs.el / 7000, 0, 1) * clamp(1.4 - (v.z - 8) / 6, 0.35, 1), C.night);
        if (f && hs) drawFlow(g, v, f, hs, t);
        if (hs && hs.status === 'flying' && !C.replay && C.cam === 'follow') { if (!C._nextSt) C._nextSt = ms() + 25000; else if (ms() > C._nextSt && !C._st) { C.stunt('wave'); C._nextSt = ms() + 40000 + Math.random() * 50000; } }
        drawOthers(g, v, now, f);
        if (f && hs) {
            const night = C.night, done = hs.status === 'done';
            // contrail
            if (hs.status !== 'boarding' && !done) {
                g.save(); g.lineCap = 'round';
                const n = C.perf ? 5 : 12;
                for (let i = n; i >= 1; i--) {
                    const pf = Math.max(0, hs.p - i * 0.0042 * (1 + v.z / 8)); FM.gcPoint(f.o, f.d, pf, POS); FM.project(v, POS[0], POS[1], Q);
                    FM.gcPoint(f.o, f.d, Math.max(0, hs.p - (i - 1) * 0.0042 * (1 + v.z / 8)), POS); FM.project(v, POS[0], POS[1], P);
                    g.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - i / (n + 1))) + ')'; g.lineWidth = lerp(1, 3.4, 1 - i / n); g.beginPath(); g.moveTo(Q[0], Q[1]); g.lineTo(P[0], P[1]); g.stroke();
                    if (!C.perf && v.z >= 7.5) {
                        const sx = P[0] - Q[0], sy = P[1] - Q[1], L = Math.hypot(sx, sy) || 1, off = clamp(lerp(46, 92, clamp((v.z - 5) / 6, 0, 1)), 40, 96) * 0.3, nx = -sy / L * off, ny = sx / L * off;
                        g.strokeStyle = 'rgba(255,255,255,' + (0.22 * (1 - i / (n + 1))) + ')'; g.lineWidth = 1.2;
                        g.beginPath(); g.moveTo(Q[0] + nx, Q[1] + ny); g.lineTo(P[0] + nx, P[1] + ny); g.moveTo(Q[0] - nx, Q[1] - ny); g.lineTo(P[0] - nx, P[1] - ny); g.stroke();
                    }
                }
                g.restore();
            }
            // end points
            FM.project(v, f.o[0], f.o[1], P); pin(g, P[0], P[1], f.on, '#0ea5e9', night);
            FM.project(v, f.d[0], f.d[1], Q); pin(g, Q[0], Q[1], f.dn, '#22c55e', night);
            if (!C.perf && !done) { cityRing(g, Q[0], Q[1], '#22c55e', t, 0); if (hs.p < 0.25) cityRing(g, P[0], P[1], '#0ea5e9', t, 0.5); }
            // arrival ring
            if (done) { const k = ((ms() % 2200) / 2200); g.save(); g.strokeStyle = 'rgba(34,197,94,' + (1 - k) + ')'; g.lineWidth = 2.5; g.beginPath(); g.arc(Q[0], Q[1], 10 + k * 46, 0, 6.2832); g.stroke(); g.restore(); }
            // the plane: rises from the apron at the start, settles at the end
            FM.project(v, hs.pos[0], hs.pos[1], P);
            const born = clamp(hs.el / 3500, 0, 1), land = hs.status === 'done' ? 0 : clamp(hs.left / 5000, 0, 1);
            const alt = Math.min(ease(born), hs.status === 'done' ? 0 : 1) * (0.35 + 0.65 * land);
            const size = clamp(lerp(46, 92, clamp((v.z - 5) / 6, 0, 1)), 40, 96) * (0.84 + 0.16 * ease(born)) * (0.92 + 0.08 * land);
            const spawn = C.replay ? 1 : ease(born);
            const tm = Date.now(), sway = hs.status === 'flying' ? Math.sin(tm / 1500) * 3.2 + Math.sin(tm / 620) * 1.1 : 0, breathe = 1 + Math.sin(tm / 1100) * 0.012;
            const sn = stuntNow(), px = P[0] + Math.sin(tm / 900) * 0.7, py = P[1] + Math.cos(tm / 1300) * 0.7;
            if (sn) drawSparks(g, px, py, sn.k, size, C._st && C._st.k);
            drawPlane(g, px, py, hs.head + (sn ? sn.rot : 0), size * breathe * (sn ? sn.scale : 1), sn && sn.bank ? sn.bank : hs.bank + sway, f.sty || 'modern', clamp(0.15 + spawn, 0, 1), (alt * size * 0.34) * (1 + Math.sin(tm / 1700) * 0.06) * (sn && sn.dive ? 1 + 1.6 * Math.sin(Math.PI * sn.k) : 1), C.spriteState !== 'ready', sn);
            lights(g, P[0], P[1], hs.head, size, Date.now(), night);
            C.hits.push({ x: P[0], y: P[1], r: size / 2, hero: true });
            C._heroPx = [P[0], P[1]];
        }
        if (C.pins.length) C.pins.forEach((p) => { FM.project(v, p.lat, p.lng, P); pin(g, P[0], P[1], p.label, p.color, C.night); });
    }
    // the route is drawn on our own canvas every frame (a map-library polyline was redrawn once a second, which made the whole screen hitch)
    function drawRoute(g, v, hs) {
        const f = C.heroFlight(); if (!f) return;
        const p = hs.p, night = C.night;
        const path = (a, b, n) => { g.beginPath(); for (let i = 0; i <= n; i++) { FM.gcPoint(f.o, f.d, a + (b - a) * (i / n), POS); FM.project(v, POS[0], POS[1], Q); if (i) g.lineTo(Q[0], Q[1]); else g.moveTo(Q[0], Q[1]); } };
        g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
        if (p > 0.004) { g.strokeStyle = night ? 'rgba(148,163,184,.6)' : 'rgba(100,116,139,.65)'; g.lineWidth = 3; path(0, p, Math.max(6, Math.round(p * 40))); g.stroke(); }
        if (p < 0.999) { path(p, 1, 40); g.strokeStyle = 'rgba(2,6,23,.35)'; g.lineWidth = 6.5; g.stroke(); g.strokeStyle = night ? '#38bdf8' : '#0ea5e9'; g.lineWidth = 4; g.stroke(); }
        g.restore();
    }
    // the dashed route shown while the student is still choosing
    C.setPreview = function (o, d) {
        const A = C.adapter; if (!A) return;
        if (o && d) { A.line('prev', FM.gcPath(o, d, 64), { color: '#38bdf8', weight: 3, opacity: 0.9, dashArray: '7 8' }); C.preview = { o, d }; }
        else { A.noLine('prev'); C.preview = null; }
    };
    C.clearLines = function () { const A = C.adapter; if (!A) return; ['rest', 'done', 'prev'].forEach((k) => A.noLine(k)); C._lineP = null; C.preview = null; };
    C.setPins = function (list) { C.pins = list || []; };
    C.run = function () { if (C._run) return; C._run = true; C._last = 0; if (!C._raf) C._raf = requestAnimationFrame(frame); };
    C.stop = function () { C._run = false; if (C._raf) { cancelAnimationFrame(C._raf); C._raf = 0; } };
    C.setPerf = function (on, auto) {
        C.perf = !!on; if (!auto) { C.perfAuto = false; jset(KEY.PERF, !!on); }
        C.dpr = 0; C.resize(); C._ft = [];
        if (on) { C.spriteState = C.spriteState === 'ready' ? 'ready' : C.spriteState; if (C.others.size > 60) { /* the cap is applied while drawing */ } }
        else if (C.spriteState === 'flat') { C.spriteState = ''; C.bakeSprites(); }
        C.emit('perf', { on: !!on, auto: !!auto });
    };

    // ---------- the student's own location (used on the phone; never saved) ----------
    C.locate = function () {
        return new Promise((res, rej) => {
            if (!navigator.geolocation) { rej(new Error('nogeo')); return; }
            navigator.geolocation.getCurrentPosition((p) => { C.me = [p.coords.latitude, p.coords.longitude]; res(C.me); }, (e) => rej(e), { enableHighAccuracy: false, timeout: 9000, maximumAge: 120000 });
        });
    };

    // ---------- places: search ----------
    // a small result: { name, sub, lat, lng, resolve? }
    const norm = (s) => String(s || '').replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase().trim();
    C.searchPresets = function (q) {
        const n = norm(q); if (!n) return FM.PLACES.slice(0, 12).map((p) => ({ name: p.name, sub: '', lat: p.lat, lng: p.lng, preset: true }));
        return FM.PLACES.filter((p) => norm(p.name).includes(n)).map((p) => ({ name: p.name, sub: '', lat: p.lat, lng: p.lng, preset: true }));
    };
    let gToken = null, gAbort = 0;
    C.searchOnline = async function (q) {
        q = String(q || '').trim(); if (q.length < 2) return [];
        const A = C.adapter, my = ++gAbort;
        if (A && A.kind === 'google') {
            const { AutocompleteSuggestion, AutocompleteSessionToken } = await window.google.maps.importLibrary('places');
            if (!gToken) gToken = new AutocompleteSessionToken();
            const r = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: q, sessionToken: gToken, language: 'ar', region: 'IQ' });
            if (my !== gAbort) return null;
            return (r.suggestions || []).filter((s) => s.placePrediction).slice(0, 6).map((s) => {
                const pp = s.placePrediction;
                return { name: (pp.mainText && pp.mainText.text) || pp.text.text, sub: (pp.secondaryText && pp.secondaryText.text) || '', resolve: async () => { const pl = pp.toPlace(); await pl.fetchFields({ fields: ['location', 'displayName'] }); gToken = null; return { lat: pl.location.lat(), lng: pl.location.lng() }; } };
            });
        }
        // no Google key: the free Photon search (made for type-ahead; OpenStreetMap data)
        const r = await fetch('https://photon.komoot.io/api/?limit=6&q=' + encodeURIComponent(q), { cache: 'force-cache' });
        if (!r.ok) throw new Error('search ' + r.status);
        const j = await r.json();
        if (my !== gAbort) return null;
        return (j.features || []).map((f) => ({ name: f.properties.name || f.properties.city || '', sub: [f.properties.city, f.properties.state, f.properties.country].filter((x, i, a) => x && a.indexOf(x) === i && x !== f.properties.name).join('، '), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] })).filter((x) => x.name);
    };
    // a label for a point (no geocoding call, nothing leaves the phone): "near Basra"
    C.labelFor = function (lat, lng, my) {
        const n = FM.nearestPlace(lat, lng, 90);
        if (my) return n ? 'موقعي (قرب ' + n.place.name + ')' : 'موقعي الحالي';
        return n ? (n.km < 8 ? n.place.name : 'قرب ' + n.place.name) : 'نقطة على الخريطة';
    };

    // ---------- data: the running flight, history, the public record ----------
    const H_ = () => window.firebaseDbHelpers, DB_ = () => window.firebaseDb;
    const rid = () => { const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; const r = crypto.getRandomValues(new Uint8Array(12)); for (let i = 0; i < 12; i++) s += a[r[i] % 36]; return s; };
    C.newId = rid;
    C.loadSaved = () => { const f = jget(KEY.ACTIVE, null); return f && f.uid === (window.app && app.authUid) ? f : null; };
    C.saveActive = (f) => jset(KEY.ACTIVE, Object.assign({ uid: window.app && app.authUid }, f));
    C.clearActive = () => { try { localStorage.removeItem(KEY.ACTIVE); } catch (e) {} };
    C.history = () => jget(KEY.HIST + ':' + ((window.app && app.authUid) || 'x'), []);
    C.saveHistory = (h) => jset(KEY.HIST + ':' + ((window.app && app.authUid) || 'x'), h.slice(0, 200));
    C.style = () => jget(KEY.STYLE, 'modern');
    C.setStyle = (s) => jset(KEY.STYLE, s);

    // writes the flight; the start time is the server's (the rules check it), so a phone with a wrong clock cannot cheat the timer
    C.createFlight = async function (f) {
        const db = DB_(), H = H_(), uid = window.app && app.authUid;
        if (!db || !H || !uid) throw Object.assign(new Error('offline'), { code: 'offline' });
        const rec = { f: f.fid, s: H.serverTimestamp(), du: f.du, oa: f.o[0], oo: f.o[1], da: f.d[0], do: f.d[1], on: f.on, dn: f.dn, sty: f.sty, sh: !!f.sh };
        const up = { ['flightActive/' + uid]: rec, ['flightLast/' + uid]: H.serverTimestamp() };
        if (f.sh) {
            up['flightOwners/' + f.fid] = uid;
            const cells = FM.cellsForPath(f.o, f.d, 12), pub = { oa: f.o[0], oo: f.o[1], da: f.d[0], do: f.d[1], on: f.on, dn: f.dn, s: H.serverTimestamp(), du: f.du, sty: f.sty, n: FM.anonNo(f.fid) };
            cells.forEach((c) => { up['flightGrid/' + c + '/' + f.fid] = pub; });
            f.cells = cells;
        }
        await H.update(H.ref(db), up);
        // read back the real start time
        try { const s = await H.get(H.ref(db, 'flightActive/' + uid + '/s')); if (Number.isFinite(s.val())) f.s = s.val(); } catch (e) {}
        return f;
    };
    // when the flight is over or cancelled: into the history, off the map
    C.endFlight = async function (f, status) {
        const db = DB_(), H = H_(), uid = window.app && app.authUid, now = C.now();
        const el = Math.max(0, Math.min(f.du, now - f.s)), dist = Math.round(FM.haversine(f.o, f.d));
        const rec = { oa: f.o[0], oo: f.o[1], da: f.d[0], do: f.d[1], on: f.on, dn: f.dn, s: f.s, du: status === 'done' ? f.du : Math.round(el), dist, st: status, sty: f.sty || 'modern', sh: !!f.sh, el: Math.round(el) };
        const hist = C.history().filter((x) => x.id !== f.fid); hist.unshift({ id: f.fid, ...rec }); C.saveHistory(hist);
        C.clearActive();
        if (!db || !H || !uid) return rec;
        const up = { ['flightActive/' + uid]: null, ['flightHistory/' + uid + '/' + f.fid]: rec };
        if (status === 'cancel' && f.sh) { up['flightOwners/' + f.fid] = null; (f.cells || FM.cellsForPath(f.o, f.d, 12)).forEach((c) => { up['flightGrid/' + c + '/' + f.fid] = null; }); }
        try { await H.update(H.ref(db), up); } catch (e) { console.warn('flight history not saved', e && e.message); }
        return rec;
    };
    C.loadHistory = async function () {
        const db = DB_(), H = H_(), uid = window.app && app.authUid; let local = C.history();
        if (!db || !H || !uid) return local;
        try {
            const s = await H.get(H.ref(db, 'flightHistory/' + uid)), v = s.val() || {};
            const map = new Map(local.map((x) => [x.id, x]));
            Object.keys(v).forEach((id) => map.set(id, { id, ...v[id] }));
            local = Array.from(map.values()).sort((a, b) => b.s - a.s); C.saveHistory(local);
        } catch (e) {}
        return local;
    };
    C.deleteHistory = async function (id) {
        C.saveHistory(C.history().filter((x) => x.id !== id));
        const db = DB_(), H = H_(), uid = window.app && app.authUid;
        if (db && H && uid) { try { await H.set(H.ref(db, 'flightHistory/' + uid + '/' + id), null); } catch (e) {} }
    };
    // account deletion: everything the student made, public and private
    window.app && Object.assign(window.app, {
        async _flPurge(uid, db) {
            const H = H_(); if (!H || !db) return;
            const del = (p) => H.set(H.ref(db, p), null).catch(() => {});
            try {
                const [a, h] = await Promise.all([H.get(H.ref(db, 'flightActive/' + uid)), H.get(H.ref(db, 'flightHistory/' + uid))]);
                const items = [];
                if (a.val() && a.val().sh) items.push({ id: a.val().f, o: [a.val().oa, a.val().oo], d: [a.val().da, a.val().do] });
                Object.keys(h.val() || {}).forEach((id) => { const r = h.val()[id]; if (r && r.sh) items.push({ id, o: [r.oa, r.oo], d: [r.da, r.do] }); });
                // the public records first (the rules check the owner record), then the owner record
                for (const it of items) { await Promise.all(FM.cellsForPath(it.o, it.d, 12).map((c) => del('flightGrid/' + c + '/' + it.id))); await del('flightOwners/' + it.id); }
            } catch (e) {}
            await Promise.all(['flightActive/', 'flightHistory/', 'flightLast/'].map((p) => del(p + uid)));
            ['isp_fl_active', 'isp_fl_hist:' + uid].forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
        },
    });

    // the weather where the plane is (Open-Meteo, no key), asked rarely
    C.loadWeather = async function (pos) {
        if (Date.now() - C.weatherAt < 8 * 60000 || !navigator.onLine) return C.weather;
        C.weatherAt = Date.now();
        try {
            const r = await fetch('https://api.open-meteo.com/v1/forecast?current=weather_code,temperature_2m&latitude=' + pos[0].toFixed(2) + '&longitude=' + pos[1].toFixed(2));
            const j = await r.json(); C.weather = { text: FM.WEATHER(j.current.weather_code), t: Math.round(j.current.temperature_2m), code: j.current.weather_code };
        } catch (e) { /* the weather is only a decoration */ }
        return C.weather;
    };
    C.drawPlaneForTest = drawPlane;
})();
