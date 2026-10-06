// رحلة الطالب الجوية: the maths of a flight, with no dependency on the page (so it can be tested alone).
// A flight is only { s: start (ms, server clock), du: duration (ms), o: [lat, lng], d: [lat, lng] }.
// Where the plane is, how far it has gone, the time left: all of it is worked out from those four
// numbers and the clock, so nothing has to be sent while it flies and every phone sees the same plane.
(function (root) {
    const RAD = Math.PI / 180, DEG = 180 / Math.PI, R_KM = 6371.0088;
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

    // ---------- the sphere ----------
    function haversine(a, b) {
        const dLat = (b[0] - a[0]) * RAD, dLng = (b[1] - a[1]) * RAD;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
        return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    // a point a fraction f (0..1) of the way along the great circle from a to b; writes into out when given (no new objects)
    function gcPoint(a, b, f, out) {
        out = out || [0, 0];
        const la1 = a[0] * RAD, lo1 = a[1] * RAD, la2 = b[0] * RAD, lo2 = b[1] * RAD;
        const d = haversine(a, b) / R_KM;
        if (d < 1e-9) { out[0] = a[0]; out[1] = a[1]; return out; }
        const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
        const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
        const z = A * Math.sin(la1) + B * Math.sin(la2);
        out[0] = Math.atan2(z, Math.sqrt(x * x + y * y)) * DEG; out[1] = Math.atan2(y, x) * DEG;
        return out;
    }
    // the compass heading (0 = north, clockwise) of travel along the great circle at fraction f
    function gcHeading(a, b, f) {
        const e = 0.002, p = gcPoint(a, b, clamp(f - e, 0, 1)), q = gcPoint(a, b, clamp(f + e, 0, 1));
        const la1 = p[0] * RAD, la2 = q[0] * RAD, dl = (q[1] - p[1]) * RAD;
        const y = Math.sin(dl) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl);
        return (Math.atan2(y, x) * DEG + 360) % 360;
    }
    // n+1 points along the route (for drawing it)
    function gcPath(a, b, n) { const out = []; for (let i = 0; i <= n; i++) out.push(gcPoint(a, b, i / n)); return out; }
    // slice of the route between fractions f0 and f1
    function gcSlice(a, b, f0, f1, n) { const out = []; for (let i = 0; i <= n; i++) out.push(gcPoint(a, b, f0 + (f1 - f0) * (i / n))); return out; }

    // ---------- time -> position ----------
    // Slow at both ends (take-off and landing), faster in the middle; exact at 0 and 1.
    const EASE = 0.55;
    const warp = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x - (EASE * Math.sin(2 * Math.PI * x)) / (2 * Math.PI));
    const BOARD_MS = 4000; // the first seconds on the apron

    // everything the screen shows about a flight at the moment `now`
    function stateAt(f, now) {
        const du = Math.max(1, f.du), el = now - f.s, x = clamp(el / du, 0, 1), p = warp(x);
        const dist = f.dist != null ? f.dist : haversine(f.o, f.d);
        const pos = gcPoint(f.o, f.d, p), head = gcHeading(f.o, f.d, p);
        // a roll angle from how fast the heading turns, plus a slow sway so the plane does not look nailed to the map
        const p2 = warp(clamp(x + 0.004, 0, 1)), h2 = gcHeading(f.o, f.d, p2);
        let turn = h2 - head; if (turn > 180) turn -= 360; if (turn < -180) turn += 360;
        const bank = clamp(turn * 9 + Math.sin(now / 2300) * 1.6, -28, 28);
        let status = 'flying';
        if (el < 0) status = 'prepare'; else if (el < BOARD_MS) status = 'boarding'; else if (x >= 1) status = 'done'; else if (x > 0.965) status = 'landing';
        return { x, p, el: Math.max(0, el), left: Math.max(0, du - el), dist, distLeft: dist * (1 - p), pos, head, bank, status, end: f.s + du };
    }
    // altitude and speed shown on the screen: a simulation that follows the take-off / cruise / landing shape
    function sim(st) {
        const x = st.x, up = clamp(x / 0.12, 0, 1), down = clamp((1 - x) / 0.12, 0, 1), k = Math.min(up, down);
        const smooth = k * k * (3 - 2 * k);
        return { alt: Math.round(smooth * 10500 / 50) * 50, spd: Math.round((120 + smooth * 700) / 5) * 5 };
    }

    // ---------- map cells (what a phone subscribes to) ----------
    const CELL = 4;
    const cellKey = (lat, lng) => Math.floor((clamp(lat, -89.99, 89.99) + 90) / CELL) + '_' + Math.floor((clamp(lng, -179.99, 179.99) + 180) / CELL);
    // every cell the route passes through (at most `cap`)
    function cellsForPath(a, b, cap) {
        const set = new Set(), n = Math.max(8, Math.ceil(haversine(a, b) / 80)), p = [0, 0];
        for (let i = 0; i <= n; i++) { gcPoint(a, b, i / n, p); set.add(cellKey(p[0], p[1])); }
        return Array.from(set).slice(0, cap || 14);
    }
    // the cells that touch the visible map (at most `cap`)
    // the cells a view covers; when there are more than `cap`, the ones nearest the middle of the view are kept
    function cellsForBounds(bd, cap) {
        const all = [], s = clamp(bd.s, -89.99, 89.99), n = clamp(bd.n, -89.99, 89.99), lim = cap || 16;
        let w = bd.w, e = bd.e; if (e - w >= 360) { w = -179.99; e = 179.99; }
        const l0 = Math.floor((s + 90) / CELL), l1 = Math.floor((n + 90) / CELL), o0 = Math.floor((clamp(w, -179.99, 179.99) + 180) / CELL), o1 = Math.floor((clamp(e, -179.99, 179.99) + 180) / CELL);
        for (let la = l0; la <= l1; la++) for (let lo = o0; lo <= o1; lo++) all.push([la, lo]);
        if (all.length > lim) { const cl = (l0 + l1) / 2, co = (o0 + o1) / 2; all.sort((x, y) => (x[0] - cl) ** 2 + (x[1] - co) ** 2 - ((y[0] - cl) ** 2 + (y[1] - co) ** 2)); all.length = lim; }
        return all.map((c) => c[0] + '_' + c[1]);
    }

    // ---------- Web Mercator (the same as Google Maps and Leaflet) ----------
    const worldSize = (z) => 256 * Math.pow(2, z);
    // writes the container pixel of a point into out[0], out[1]; v = { lat, lng, z, w, h }
    function project(v, lat, lng, out) {
        const ws = worldSize(v.z), sc = Math.sin(clamp(lat, -85.05, 85.05) * RAD), sc0 = Math.sin(clamp(v.lat, -85.05, 85.05) * RAD);
        const x = (lng / 360 + 0.5) * ws, y = (0.5 - Math.log((1 + sc) / (1 - sc)) / (4 * Math.PI)) * ws;
        const x0 = (v.lng / 360 + 0.5) * ws, y0 = (0.5 - Math.log((1 + sc0) / (1 - sc0)) / (4 * Math.PI)) * ws;
        let dx = x - x0; if (dx > ws / 2) dx -= ws; else if (dx < -ws / 2) dx += ws;
        out[0] = v.w / 2 + dx; out[1] = v.h / 2 + (y - y0);
        return out;
    }
    function unproject(v, px, py, out) {
        out = out || [0, 0];
        const ws = worldSize(v.z), sc0 = Math.sin(clamp(v.lat, -85.05, 85.05) * RAD);
        const x0 = (v.lng / 360 + 0.5) * ws, y0 = (0.5 - Math.log((1 + sc0) / (1 - sc0)) / (4 * Math.PI)) * ws;
        const x = x0 + (px - v.w / 2), y = y0 + (py - v.h / 2), n = Math.PI - (2 * Math.PI * y) / ws;
        out[0] = DEG * Math.atan(Math.sinh(n)); out[1] = ((x / ws - 0.5) * 360 + 540) % 360 - 180;
        return out;
    }
    // the zoom and centre that fit a set of points in a w x h box with padding (pad = {t,b,l,r})
    function fitView(pts, w, h, pad, maxZ) {
        pad = pad || { t: 0, b: 0, l: 0, r: 0 };
        let la0 = 90, la1 = -90, lo0 = 360, lo1 = -360;
        pts.forEach((p) => { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); });
        const mY = (la) => { const s = Math.sin(clamp(la, -85.05, 85.05) * RAD); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
        const fw = Math.max(1e-6, (lo1 - lo0) / 360), fh = Math.max(1e-6, mY(la0) - mY(la1));
        const aw = Math.max(40, w - pad.l - pad.r), ah = Math.max(40, h - pad.t - pad.b);
        const z = clamp(Math.min(Math.log2(aw / 256 / fw), Math.log2(ah / 256 / fh)), 2, maxZ || 15);
        const cLat = (la0 + la1) / 2, cLng = (lo0 + lo1) / 2;
        // shift the centre so the route sits in the free part of the screen (padding is not symmetric)
        const v = { lat: cLat, lng: cLng, z, w, h }, o = [0, 0];
        unproject(v, w / 2 - (pad.l - pad.r) / 2, h / 2 - (pad.t - pad.b) / 2, o);
        return { lat: o[0], lng: o[1], z };
    }

    // ---------- names, numbers, clocks ----------
    const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
    const anonNo = (fid) => 100 + (hash('n' + fid) % 900);
    const flightNo = (fid) => 'IRQ-' + (1000 + (hash('f' + fid) % 9000));
    const pad2 = (n) => String(n).padStart(2, '0');
    function fmtHMS(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' + pad2(s % 60); }
    function fmtDur(ms) { const m = Math.round(ms / 60000), h = Math.floor(m / 60); return h ? h + ' س ' + (m % 60 ? pad2(m % 60) + ' د' : '') : m + ' د'; }
    const fmtClock = (ts) => { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
    const fmtKm = (km) => (km >= 100 ? Math.round(km) : Math.round(km * 10) / 10) + ' كم';
    // privacy: a place is stored on a coarse grid (about 1 km), a "my location" point on a coarser one (about 11 km)
    const roundTo = (v, step) => Math.round(v / step) * step;
    const coarse = (v, my) => Math.round(roundTo(v, my ? 0.1 : 0.01) * 1000) / 1000;
    // a reasonable duration to suggest: cruise at 800 km/h plus time on the ground, rounded to 5 minutes
    const suggestMinutes = (km) => Math.max(10, Math.round((km / 800 * 60 + 25) / 5) * 5);
    const WEATHER = (c) => (c == null ? '' : c === 0 ? 'صافي' : c <= 3 ? 'غائم جزئياً' : c <= 48 ? 'ضباب' : c <= 67 ? 'مطر' : c <= 77 ? 'ثلج' : c <= 82 ? 'زخات مطر' : 'عاصفة رعدية');

    // ---------- places that are always there (no search needed, no key needed) ----------
    const PLACES = [
        ['بغداد', 33.3152, 44.3661], ['البصرة', 30.5085, 47.7835], ['الموصل', 36.34, 43.13], ['أربيل', 36.1912, 44.0092], ['النجف', 32.0, 44.34],
        ['كربلاء', 32.616, 44.024], ['السليمانية', 35.5613, 45.4305], ['كركوك', 35.4681, 44.3922], ['الناصرية', 31.05, 46.26], ['الرمادي', 33.4258, 43.2995],
        ['دهوك', 36.8679, 42.9885], ['الحلة', 32.4833, 44.4333], ['الديوانية', 31.9889, 44.9258], ['العمارة', 31.8356, 47.145], ['الكوت', 32.5128, 45.8182],
        ['السماوة', 31.319, 45.287], ['تكريت', 34.6071, 43.6789], ['بعقوبة', 33.7467, 44.6436], ['حلبجة', 35.1778, 45.9861],
        ['إسطنبول', 41.0082, 28.9784], ['دبي', 25.2048, 55.2708], ['عمّان', 31.9454, 35.9284], ['الرياض', 24.7136, 46.6753], ['الكويت', 29.3759, 47.9774],
        ['طهران', 35.6892, 51.389], ['القاهرة', 30.0444, 31.2357], ['أنقرة', 39.9334, 32.8597], ['بيروت', 33.8938, 35.5018], ['باريس', 48.8566, 2.3522],
        ['لندن', 51.5074, -0.1278], ['برلين', 52.52, 13.405], ['نيويورك', 40.7128, -74.006], ['طوكيو', 35.6762, 139.6503],
    ].map((p) => ({ name: p[0], lat: p[1], lng: p[2] }));
    function nearestPlace(lat, lng, maxKm) {
        let best = null, bd = 1e9;
        PLACES.forEach((p) => { const d = haversine([lat, lng], [p.lat, p.lng]); if (d < bd) { bd = d; best = p; } });
        return best && bd <= (maxKm || 120) ? { place: best, km: bd } : null;
    }

    // ---------- badges, worked out from the list of finished flights ----------
    const BADGES = [
        { id: 'first', n: 'أول رحلة', d: 'أكمل رحلتك الأولى', t: (h) => h.length >= 1, v: (h) => Math.min(1, h.length) },
        { id: 'ten', n: '10 رحلات', d: 'أكمل 10 رحلات', t: (h) => h.length >= 10, v: (h) => Math.min(1, h.length / 10) },
        { id: 'far', n: 'مسافة طويلة', d: 'رحلة 1000 كم أو أكثر', t: (h) => h.some((x) => x.dist >= 1000), v: (h) => Math.min(1, Math.max(0, ...h.map((x) => x.dist || 0)) / 1000) },
        { id: 'night', n: 'رحلة ليلية', d: 'ابدأ رحلة بين التاسعة ليلاً والخامسة فجراً', t: (h) => h.some((x) => { const H = new Date(x.s).getHours(); return H >= 21 || H < 5; }), v: (h) => (h.some((x) => { const H = new Date(x.s).getHours(); return H >= 21 || H < 5; }) ? 1 : 0) },
        { id: 'explorer', n: 'مستكشف العراق', d: 'سافر بين 6 مدن عراقية مختلفة', t: (h) => iraqCities(h).size >= 6, v: (h) => Math.min(1, iraqCities(h).size / 6) },
        { id: 'marathon', n: 'ماراثون', d: 'رحلة ساعتين أو أكثر', t: (h) => h.some((x) => x.du >= 7200000), v: (h) => Math.min(1, Math.max(0, ...h.map((x) => x.du || 0)) / 7200000) },
    ];
    const IRAQ = new Set(PLACES.slice(0, 19).map((p) => p.name));
    function iraqCities(h) { const s = new Set(); h.forEach((x) => { if (IRAQ.has(x.on)) s.add(x.on); if (IRAQ.has(x.dn)) s.add(x.dn); }); return s; }
    function badges(hist) { const done = (hist || []).filter((x) => x.st === 'done'); return BADGES.map((b) => ({ id: b.id, n: b.n, d: b.d, ok: b.t(done), v: b.v(done) })); }

    const api = { haversine, gcPoint, gcHeading, gcPath, gcSlice, warp, stateAt, sim, BOARD_MS, cellKey, cellsForPath, cellsForBounds, project, unproject, fitView, hash, anonNo, flightNo, fmtHMS, fmtDur, fmtClock, fmtKm, coarse, suggestMinutes, WEATHER, PLACES, nearestPlace, badges, clamp };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FlightMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
