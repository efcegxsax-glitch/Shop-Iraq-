// المؤقت: pomodoro and the other known study timers (50/10, 52/17, 90/20 ...), a free countdown and a stopwatch,
// each editable. 40 themes ("الخلفيات") are painted here as vector scenes (SVG), so they are sharp on any screen and
// are redrawn for the real screen shape (phone, tablet, desktop, landscape). A few themes add falling snow, rain,
// petals, fireflies and so on (canvas). Everything stays on the phone (localStorage isp:tm:v1); times are wall clock based.
// Loaded on demand by app._need('timer').
(function () {
    const KEY = 'isp:tm:v1';
    const $ = (id) => document.getElementById(id);
    const pad = (n) => String(n).padStart(2, '0');
    const f1 = (v) => Math.round(v * 10) / 10;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

    // ---------- tiny helpers: seeded random, colours ----------
    const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
    const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const hex = (c) => { c = c.replace('#', ''); if (c.length === 3) c = c.split('').map((x) => x + x).join(''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; };
    const toHex = (a) => '#' + a.map((v) => pad(clamp(Math.round(v), 0, 255).toString(16))).join('');
    const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
    const lum = (c) => { const [r, g, b] = hex(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
    const palAt = (pal, t) => { t = clamp(t, 0, 0.9999) * (pal.length - 1); const i = Math.floor(t); return mix(pal[i], pal[i + 1], t - i); };

    // ---------- the 40 themes ----------
    // sky: gradient top to bottom; layers are painted in order (far to near).
    // kinds: sun moon full planet eclipse earth clouds aurora nebula band blobs lowpoly rings glowbg  (sky things)
    //        hills mount dunes waves  (ridges, can carry items: pine palm round sakura reed dots)
    //        city baghdad ziggurat water boat tent  (scenes)
    const CATS = [['all', 'الكل'], ['night', 'ليل'], ['nature', 'طبيعة'], ['iraq', 'العراق'], ['space', 'فضاء'], ['calm', 'هدوء وألوان']];
    const THEMES = [
        // ----- night -----
        { id: 'nt-stars', n: 'ليلة نجوم', c: 'night', sky: ['#03050d', '#08112b', '#142755', '#26407a'], stars: { n: 260, top: 0.8 }, layers: [
            { k: 'moon', x: 0.74, y: 0.2, r: 0.045, c: '#f4f1e4' },
            { k: 'hills', y: 0.78, amp: 0.08, c: '#0a1430', f: 1.1, haze: '#1a2c5c' },
            { k: 'hills', y: 0.89, amp: 0.07, c: '#050a1c', f: 0.8, items: { k: 'pine', n: 16, h: [0.08, 0.16] } }] },
        { id: 'nt-moon', n: 'قمر كامل', c: 'night', sky: ['#070b1a', '#111c3d', '#24366a'], stars: { n: 120, top: 0.6 }, layers: [
            { k: 'full', x: 0.72, y: 0.24, r: 0.095, c: '#fff6dc' },
            { k: 'clouds', n: 4, c: '#9fb2e6', o: 0.13, y0: 0.08, y1: 0.4 },
            { k: 'hills', y: 0.8, amp: 0.09, c: '#0b1530', f: 1, haze: '#223a72' },
            { k: 'hills', y: 0.92, amp: 0.06, c: '#050a18', f: 1.3, items: { k: 'round', n: 7, h: [0.1, 0.16], c: '#050a18' } }] },
        { id: 'nt-city', n: 'مدينة بالليل', c: 'night', sky: ['#080b1f', '#241a4d', '#7a3a72', '#e0788a'], stars: { n: 70, top: 0.4 }, layers: [
            { k: 'city', y: 0.8, c: '#1c1640', hh: [0.05, 0.17], win: '#ffd98a', wp: 0.22, haze: '#c46688' },
            { k: 'city', y: 0.93, c: '#0a0818', hh: [0.08, 0.27], win: '#ffcf6b', wp: 0.38 }] },
        { id: 'nt-rain', n: 'ليلة ممطرة', c: 'night', sky: ['#070a10', '#121a25', '#26333f'], fx: 'rain', layers: [
            { k: 'clouds', n: 7, c: '#3a4856', o: 0.55, y0: 0.02, y1: 0.35 },
            { k: 'city', y: 0.82, c: '#141c26', hh: [0.05, 0.15], win: '#9fd0ff', wp: 0.18 },
            { k: 'city', y: 0.95, c: '#080c12', hh: [0.07, 0.22], win: '#ffd27a', wp: 0.3 }] },
        { id: 'nt-desert', n: 'صحراء ليلا', c: 'night', sky: ['#040814', '#101d44', '#2e3a76', '#6a5a8e'], stars: { n: 280, top: 0.7 }, layers: [
            { k: 'moon', x: 0.28, y: 0.2, r: 0.05, c: '#f6f0dc' },
            { k: 'dunes', y: 0.78, amp: 0.1, c: '#3a3366', f: 0.8, haze: '#6a5a8e' },
            { k: 'dunes', y: 0.88, amp: 0.1, c: '#241f48', f: 1.0 },
            { k: 'dunes', y: 0.98, amp: 0.09, c: '#12102c', f: 1.3 }] },
        { id: 'nt-sea', n: 'بحر ليلي', c: 'night', sky: ['#050b1c', '#0d1f45', '#1f3d73'], stars: { n: 180, top: 0.55 }, layers: [
            { k: 'full', x: 0.3, y: 0.26, r: 0.07, c: '#f8f3e0' },
            { k: 'water', y: 0.62, c: ['#12305a', '#030a1a'], refl: { x: 0.3, c: '#f4efd8', w: 0.07 } },
            { k: 'waves', y: 0.97, amp: 0.025, c: '#030812', f: 1.2 }] },
        { id: 'nt-lantern', n: 'فوانيس الليل', c: 'night', sky: ['#0d0720', '#2a1054', '#6b2a6e', '#b2506a'], stars: { n: 110, top: 0.5 }, fx: 'lantern', layers: [
            { k: 'hills', y: 0.84, amp: 0.07, c: '#1a0d33', f: 1, haze: '#74306e' },
            { k: 'hills', y: 0.95, amp: 0.05, c: '#0a0516', f: 1.4, items: { k: 'pine', n: 10, h: [0.07, 0.13] } }] },
        { id: 'nt-camp', n: 'مخيم ونار', c: 'night', sky: ['#04060f', '#0b1530', '#1a2a50'], stars: { n: 200, top: 0.6 }, fx: 'ember', layers: [
            { k: 'moon', x: 0.8, y: 0.16, r: 0.035, c: '#f4f1e4' },
            { k: 'hills', y: 0.76, amp: 0.07, c: '#0a1428', f: 1, items: { k: 'pine', n: 14, h: [0.1, 0.2] } },
            { k: 'hills', y: 0.88, amp: 0.04, c: '#060b17', f: 0.7, items: { k: 'pine', n: 6, h: [0.14, 0.26], xr: [0, 0.3] } },
            { k: 'tent', x: 0.62, y: 0.9, w: 0.2, c: '#1c2a4d' },
            { k: 'hills', y: 0.95, amp: 0.025, c: '#05080f', f: 1 }] },
        { id: 'nt-snow', n: 'ثلج وليل', c: 'night', sky: ['#06141f', '#0f2a3d', '#25506a'], stars: { n: 140, top: 0.5 }, fx: 'snow', layers: [
            { k: 'moon', x: 0.7, y: 0.2, r: 0.04, c: '#f2f6f8' },
            { k: 'hills', y: 0.78, amp: 0.08, c: '#7aa3b8', f: 1, haze: '#9fc3d6' },
            { k: 'hills', y: 0.9, amp: 0.06, c: '#c6dde8', f: 0.9, items: { k: 'pine', n: 12, h: [0.1, 0.2], c: '#0d2230', snow: '#e8f3f8' } }] },
        { id: 'nt-fly', n: 'يراعات', c: 'night', sky: ['#030a0a', '#07201a', '#0e3a2c'], stars: { n: 60, top: 0.4 }, fx: 'fly', layers: [
            { k: 'hills', y: 0.7, amp: 0.1, c: '#0b2e24', f: 1, haze: '#14503d', items: { k: 'pine', n: 18, h: [0.1, 0.2] } },
            { k: 'hills', y: 0.84, amp: 0.07, c: '#06201a', f: 1.2, items: { k: 'pine', n: 12, h: [0.15, 0.28] } },
            { k: 'hills', y: 0.96, amp: 0.05, c: '#020f0c', f: 1.5, items: { k: 'reed', n: 20, h: [0.05, 0.11] } }] },
        // ----- nature -----
        { id: 'nat-sunrise', n: 'شروق الشمس', c: 'nature', sky: ['#2b4a8b', '#8a7bb5', '#f1a98a', '#ffd9a0'], layers: [
            { k: 'sun', x: 0.3, y: 0.66, r: 0.05, c: '#fff0c0' },
            { k: 'clouds', n: 4, c: '#ffe0cf', o: 0.5, y0: 0.15, y1: 0.45 },
            { k: 'hills', y: 0.7, amp: 0.08, c: '#d58a76', f: 0.9, haze: '#ffd0a0' },
            { k: 'hills', y: 0.82, amp: 0.08, c: '#9a5566', f: 1.1, haze: '#e8a088' },
            { k: 'hills', y: 0.94, amp: 0.07, c: '#4a2b45', f: 1.3, items: { k: 'pine', n: 10, h: [0.08, 0.16] } }] },
        { id: 'nat-sunset', n: 'غروب بنفسجي', c: 'nature', sky: ['#1c1b4b', '#6a2c70', '#e0566b', '#ffb36b'], layers: [
            { k: 'sun', x: 0.66, y: 0.6, r: 0.07, c: '#ffe2a8' },
            { k: 'clouds', n: 4, c: '#ff9a8a', o: 0.35, y0: 0.2, y1: 0.5 },
            { k: 'mount', y: 0.82, amp: 0.2, c: '#6a2c70', f: 0.8, haze: '#ff9a7a' },
            { k: 'mount', y: 0.92, amp: 0.14, c: '#341a52', f: 1.1, haze: '#b04a7a' },
            { k: 'hills', y: 0.99, amp: 0.05, c: '#150a2a', f: 1.2 }] },
        { id: 'nat-mount', n: 'جبال الثلج', c: 'nature', sky: ['#3b82c4', '#7fb6e6', '#cfe6f5'], layers: [
            { k: 'clouds', n: 5, c: '#ffffff', o: 0.8, y0: 0.06, y1: 0.4 },
            { k: 'mount', y: 0.78, amp: 0.3, c: '#7d9bbd', f: 0.8, snow: '#ffffff', haze: '#cfe6f5' },
            { k: 'mount', y: 0.88, amp: 0.2, c: '#4d6f96', f: 1.1, snow: '#eef6fc', haze: '#9fc0de' },
            { k: 'hills', y: 0.96, amp: 0.07, c: '#2d5a4a', f: 1.1, items: { k: 'pine', n: 14, h: [0.08, 0.18], c: '#1d4034' } }] },
        { id: 'nat-lake', n: 'بحيرة الجبل', c: 'nature', sky: ['#2d5a9e', '#8fb8dd', '#f3d9b5'], layers: [
            { k: 'sun', x: 0.72, y: 0.4, r: 0.04, c: '#fff4d0' },
            { k: 'clouds', n: 3, c: '#ffffff', o: 0.55, y0: 0.08, y1: 0.35 },
            { k: 'mount', y: 0.62, amp: 0.28, c: '#5a7aa8', f: 0.9, snow: '#ffffff', mirror: 0.62, haze: '#e3d0c0' },
            { k: 'hills', y: 0.62, amp: 0.05, c: '#2e5a52', f: 1.3, items: { k: 'pine', n: 22, h: [0.05, 0.1], c: '#1f4540' }, mirror: 0.62 },
            { k: 'water', y: 0.62, c: ['#6f98bf', '#1d3f68'], refl: { x: 0.72, c: '#fff4d0', w: 0.04 }, o: 0.8 }] },
        { id: 'nat-forest', n: 'غابة الضباب', c: 'nature', sky: ['#5aa58a', '#a8d5b5', '#e8f0c8'], layers: [
            { k: 'sun', x: 0.62, y: 0.18, r: 0.05, c: '#fffbe0' },
            { k: 'hills', y: 0.66, amp: 0.07, c: '#8cc4a0', f: 1, haze: '#e8f4d8', items: { k: 'pine', n: 28, h: [0.1, 0.18], c: '#8cc4a0' } },
            { k: 'hills', y: 0.78, amp: 0.07, c: '#4f9a78', f: 1.2, haze: '#cfe8cf', items: { k: 'pine', n: 22, h: [0.14, 0.26], c: '#4f9a78' } },
            { k: 'hills', y: 0.9, amp: 0.06, c: '#2a6a52', f: 1.4, haze: '#a8d8b8', items: { k: 'pine', n: 14, h: [0.2, 0.36], c: '#2a6a52' } },
            { k: 'hills', y: 1, amp: 0.04, c: '#134a38', f: 1.6, items: { k: 'pine', n: 6, h: [0.3, 0.5], c: '#134a38' } }] },
        { id: 'nat-meadow', n: 'مرج أخضر', c: 'nature', sky: ['#2f8ae0', '#7fc0f2', '#d9f0ff'], layers: [
            { k: 'sun', x: 0.2, y: 0.18, r: 0.04, c: '#fffbe0' },
            { k: 'clouds', n: 6, c: '#ffffff', o: 0.9, y0: 0.06, y1: 0.45 },
            { k: 'hills', y: 0.72, amp: 0.08, c: '#7ccf7a', f: 0.9, haze: '#d9f0ff' },
            { k: 'hills', y: 0.84, amp: 0.08, c: '#4fb458', f: 1.1 },
            { k: 'hills', y: 0.96, amp: 0.07, c: '#2e9444', f: 1.3, items: { k: 'dots', n: 60, h: [0.008, 0.016], cs: ['#ffffff', '#ffd84a', '#ff7aa8'] } }] },
        { id: 'nat-beach', n: 'شاطئ استوائي', c: 'nature', sky: ['#2aa0e8', '#8fd8f5', '#fff1cf'], layers: [
            { k: 'sun', x: 0.75, y: 0.25, r: 0.05, c: '#fffbe0' },
            { k: 'clouds', n: 3, c: '#ffffff', o: 0.85, y0: 0.08, y1: 0.35 },
            { k: 'water', y: 0.58, c: ['#38c4dc', '#0a6fa0'], refl: { x: 0.75, c: '#ffffff', w: 0.05 } },
            { k: 'waves', y: 0.76, amp: 0.018, c: '#e8fbff', f: 1.4, o: 0.8 },
            { k: 'dunes', y: 0.88, amp: 0.06, c: '#f1d9a0', f: 0.5, items: { k: 'palm', n: 3, h: [0.3, 0.45], c: '#3a2a1a', xr: [0, 0.3] } },
            { k: 'dunes', y: 0.98, amp: 0.04, c: '#e6c685', f: 0.7, items: { k: 'palm', n: 2, h: [0.35, 0.5], c: '#2a1c12', xr: [0.7, 1] } }] },
        { id: 'nat-autumn', n: 'خريف', c: 'nature', sky: ['#3b5b8f', '#c98a7a', '#ffd9a0'], fx: 'leaf', layers: [
            { k: 'sun', x: 0.4, y: 0.56, r: 0.045, c: '#fff0c0' },
            { k: 'hills', y: 0.7, amp: 0.08, c: '#c46a3a', f: 0.9, haze: '#ffcf9a' },
            { k: 'hills', y: 0.82, amp: 0.08, c: '#8a3d22', f: 1.1, items: { k: 'round', n: 9, h: [0.12, 0.2], cs: ['#d9541e', '#f08a1c', '#c0392b', '#e8b923'] } },
            { k: 'hills', y: 0.95, amp: 0.06, c: '#3f1d12', f: 1.3, items: { k: 'round', n: 5, h: [0.2, 0.32], cs: ['#d9541e', '#f08a1c', '#a8301e'] } }] },
        { id: 'nat-sakura', n: 'ربيع الكرز', c: 'nature', sky: ['#fbd3e0', '#f8e3ea', '#fff4ee'], fx: 'petal', layers: [
            { k: 'clouds', n: 3, c: '#ffffff', o: 0.7, y0: 0.08, y1: 0.35 },
            { k: 'hills', y: 0.78, amp: 0.07, c: '#cfe3b4', f: 0.9 },
            { k: 'hills', y: 0.9, amp: 0.06, c: '#9cc88a', f: 1.2, items: { k: 'sakura', n: 6, h: [0.2, 0.34] } },
            { k: 'hills', y: 1, amp: 0.04, c: '#6ea66a', f: 1.5 }] },
        { id: 'nat-winter', n: 'شتاء أبيض', c: 'nature', sky: ['#8fa7bd', '#c7d5e2', '#eef3f8'], fx: 'snow', layers: [
            { k: 'hills', y: 0.72, amp: 0.07, c: '#d6e2ec', f: 0.9, haze: '#f2f6fa' },
            { k: 'hills', y: 0.84, amp: 0.07, c: '#e8f0f6', f: 1.1, items: { k: 'pine', n: 14, h: [0.1, 0.2], c: '#4c6a66', snow: '#ffffff' } },
            { k: 'hills', y: 0.96, amp: 0.05, c: '#ffffff', f: 1.4, items: { k: 'pine', n: 5, h: [0.2, 0.34], c: '#3a5652', snow: '#ffffff' } }] },
        // ----- Iraq -----
        { id: 'iq-tigris', n: 'دجلة عند الغروب', c: 'iraq', sky: ['#1b2a5e', '#7a3f7a', '#f07a4a', '#ffc56b'], layers: [
            { k: 'sun', x: 0.5, y: 0.56, r: 0.06, c: '#ffe7b0' },
            { k: 'clouds', n: 3, c: '#ff9a7a', o: 0.35, y0: 0.15, y1: 0.4 },
            { k: 'hills', y: 0.62, amp: 0.02, c: '#3a2448', f: 2, items: { k: 'palm', n: 12, h: [0.12, 0.2], c: '#2a1a38' } },
            { k: 'water', y: 0.63, c: ['#e08a5a', '#2a2050'], refl: { x: 0.5, c: '#ffe7b0', w: 0.07 } },
            { k: 'boat', x: 0.28, y: 0.76, s: 1, c: '#120a20' },
            { k: 'hills', y: 1, amp: 0.05, c: '#0e0818', f: 1.2, items: { k: 'palm', n: 3, h: [0.4, 0.55], c: '#0a0612', xr: [0, 0.22] } }] },
        { id: 'iq-palms', n: 'نخيل العراق', c: 'iraq', sky: ['#e8883a', '#f6b25a', '#ffe0a0', '#fff3cf'], layers: [
            { k: 'sun', x: 0.7, y: 0.3, r: 0.07, c: '#fffbe6' },
            { k: 'dunes', y: 0.74, amp: 0.05, c: '#e0a860', f: 0.7, haze: '#ffe8b8', items: { k: 'palm', n: 14, h: [0.14, 0.22], c: '#7a5a30' } },
            { k: 'dunes', y: 0.86, amp: 0.05, c: '#b87a3a', f: 0.9, items: { k: 'palm', n: 8, h: [0.22, 0.34], c: '#4a3018' } },
            { k: 'dunes', y: 0.98, amp: 0.04, c: '#6a4018', f: 1.1, items: { k: 'palm', n: 4, h: [0.4, 0.58], c: '#241408' } }] },
        { id: 'iq-marsh', n: 'الأهوار', c: 'iraq', sky: ['#7a9fb8', '#d6c9b0', '#f4d9a8'], layers: [
            { k: 'sun', x: 0.4, y: 0.52, r: 0.05, c: '#fff4d0' },
            { k: 'clouds', n: 3, c: '#ffffff', o: 0.4, y0: 0.12, y1: 0.4 },
            { k: 'hills', y: 0.58, amp: 0.015, c: '#8aa088', f: 2, haze: '#f0e0c0', items: { k: 'reed', n: 40, h: [0.04, 0.08] } },
            { k: 'water', y: 0.6, c: ['#c9c0a0', '#46686e'], refl: { x: 0.4, c: '#fff4d0', w: 0.05 } },
            { k: 'boat', x: 0.68, y: 0.78, s: 1.2, c: '#2a1c12' },
            { k: 'hills', y: 1, amp: 0.03, c: '#23402e', f: 1.4, items: { k: 'reed', n: 36, h: [0.12, 0.3], c: '#23402e', xr: [0, 1] } }] },
        { id: 'iq-babylon', n: 'بابل', c: 'iraq', sky: ['#070a1c', '#1b1a3d', '#5a3a4a', '#a8644a'], stars: { n: 190, top: 0.6 }, layers: [
            { k: 'moon', x: 0.2, y: 0.18, r: 0.04, c: '#f6ecd0' },
            { k: 'dunes', y: 0.82, amp: 0.05, c: '#3d2a3a', f: 0.7 },
            { k: 'ziggurat', x: 0.55, y: 0.84, w: 0.42, c: '#2a1c2c', glow: '#ffb060' },
            { k: 'dunes', y: 0.97, amp: 0.05, c: '#140c14', f: 1, items: { k: 'palm', n: 3, h: [0.3, 0.4], c: '#0a060a', xr: [0, 0.25] } }] },
        { id: 'iq-baghdad', n: 'بغداد', c: 'iraq', sky: ['#1a2150', '#5a3a80', '#e07a6a', '#ffc080'], layers: [
            { k: 'sun', x: 0.78, y: 0.58, r: 0.045, c: '#ffe2a8' },
            { k: 'clouds', n: 3, c: '#ff9a8a', o: 0.3, y0: 0.15, y1: 0.4 },
            { k: 'baghdad', y: 0.7, c: '#3a2a58', haze: '#e0867a', win: '#ffd98a' },
            { k: 'water', y: 0.7, c: ['#a05a6a', '#1a1238'], refl: { x: 0.78, c: '#ffd9a0', w: 0.05 } },
            { k: 'waves', y: 1, amp: 0.02, c: '#0c0820', f: 1 }] },
        { id: 'iq-sand', n: 'رمال ذهبية', c: 'iraq', sky: ['#3a8fd0', '#9fd0ee', '#ffe6b0'], layers: [
            { k: 'sun', x: 0.5, y: 0.2, r: 0.05, c: '#fffbe6' },
            { k: 'dunes', y: 0.7, amp: 0.1, c: '#f0c878', f: 0.8, haze: '#fff0cf' },
            { k: 'dunes', y: 0.84, amp: 0.1, c: '#d9a458', f: 1.0 },
            { k: 'dunes', y: 0.98, amp: 0.09, c: '#b87a38', f: 1.3 }] },
        // ----- space -----
        { id: 'sp-galaxy', n: 'مجرة درب التبانة', c: 'space', sky: ['#02030a', '#0a0820', '#150a30'], stars: { n: 900, top: 1, band: true }, layers: [
            { k: 'band' },
            { k: 'nebula', blobs: [[0.3, 0.7, 0.3, '#7a3aa0', 0.35], [0.65, 0.35, 0.3, '#2a6ab0', 0.3], [0.5, 0.5, 0.22, '#d06aa0', 0.18]] }] },
        { id: 'sp-nebula', n: 'سديم', c: 'space', sky: ['#04020e', '#120626', '#220a3a'], stars: { n: 180, top: 1 }, layers: [
            { k: 'nebula', blobs: [[0.25, 0.3, 0.4, '#d0308a', 0.45], [0.7, 0.55, 0.45, '#3a5ad0', 0.4], [0.5, 0.8, 0.35, '#20c0c0', 0.25], [0.8, 0.15, 0.25, '#a040e0', 0.3]] }] },
        { id: 'sp-planet', n: 'كوكب الحلقات', c: 'space', sky: ['#02030a', '#050a22', '#0c1440'], stars: { n: 220, top: 1 }, layers: [
            { k: 'planet', x: 0.72, y: 0.34, r: 0.15, c1: '#f0c890', c2: '#8a4a30', ring: '#e8d0a8' },
            { k: 'full', x: 0.16, y: 0.74, r: 0.03, c: '#cfd6e6' }] },
        { id: 'sp-aurora', n: 'الشفق القطبي', c: 'space', sky: ['#020611', '#06182a', '#0b2a3a'], stars: { n: 200, top: 0.7 }, layers: [
            { k: 'aurora', y: 0.34, cs: ['#3dffa8', '#37c8ff', '#a060ff'] },
            { k: 'mount', y: 0.9, amp: 0.2, c: '#04080f', f: 0.9, snow: '#2a4a5a' },
            { k: 'hills', y: 1, amp: 0.05, c: '#02050a', f: 1.2, items: { k: 'pine', n: 12, h: [0.1, 0.2] } }] },
        { id: 'sp-earth', n: 'الأرض من الفضاء', c: 'space', sky: ['#010208', '#03061a', '#081a3a'], stars: { n: 240, top: 0.8 }, layers: [{ k: 'earth' }] },
        { id: 'sp-eclipse', n: 'كسوف', c: 'space', sky: ['#020208', '#060818', '#0e1230'], stars: { n: 160, top: 1 }, layers: [{ k: 'eclipse', x: 0.5, y: 0.4, r: 0.1 }] },
        // ----- calm -----
        { id: 'cl-ocean', n: 'أمواج هادئة', c: 'calm', sky: ['#0b3a6e', '#1e78b4', '#6fc3dd'], layers: [
            { k: 'waves', y: 0.5, amp: 0.04, c: '#3d9fcc', f: 0.9, o: 0.9 },
            { k: 'waves', y: 0.62, amp: 0.045, c: '#2b86bb', f: 1.1 },
            { k: 'waves', y: 0.75, amp: 0.05, c: '#1c6ca2', f: 1.3 },
            { k: 'waves', y: 0.88, amp: 0.05, c: '#0f5287', f: 1.5 },
            { k: 'waves', y: 1, amp: 0.05, c: '#08396a', f: 1.7 }] },
        { id: 'cl-mint', n: 'نعناع', c: 'calm', sky: ['#e6f7ee', '#d4f0e2'], layers: [{ k: 'blobs', bl: [[0.2, 0.2, 0.35, '#8fe0b8', 0.7], [0.8, 0.3, 0.3, '#b8f0d8', 0.8], [0.5, 0.85, 0.4, '#6fd0c8', 0.55], [0.1, 0.8, 0.25, '#c8f4a8', 0.6]] }] },
        { id: 'cl-peach', n: 'خوخ', c: 'calm', sky: ['#ffe3d6', '#ffd6d0'], layers: [{ k: 'blobs', bl: [[0.2, 0.25, 0.35, '#ffb18a', 0.7], [0.82, 0.2, 0.3, '#ff9eb8', 0.65], [0.55, 0.85, 0.42, '#ffc8a0', 0.7], [0.1, 0.85, 0.25, '#ffa0a0', 0.5]] }] },
        { id: 'cl-lav', n: 'لافندر', c: 'calm', sky: ['#3a2a6e', '#6a4fb0', '#b79be0'], layers: [{ k: 'blobs', bl: [[0.2, 0.2, 0.35, '#e0a0ff', 0.55], [0.8, 0.3, 0.3, '#7a60ff', 0.6], [0.5, 0.85, 0.4, '#ff9ad0', 0.4], [0.9, 0.9, 0.25, '#60b0ff', 0.4]] }] },
        { id: 'cl-mid', n: 'ظلام هادئ', c: 'calm', sky: ['#020306', '#05060a', '#080a12'], layers: [{ k: 'blobs', bl: [[0.5, 0.95, 0.45, '#1c2a4a', 0.55], [0.5, 0.05, 0.25, '#14182a', 0.5]] }] },
        { id: 'cl-gold', n: 'ذهب أسود', c: 'calm', sky: ['#0b0a08', '#1a1409', '#0b0a08'], layers: [{ k: 'rings', c: '#e0b85a' }] },
        { id: 'cl-geo', n: 'هندسة تركوازية', c: 'calm', sky: ['#0b3a4a'], layers: [{ k: 'lowpoly', pal: ['#0b3a4a', '#14808a', '#5fd0c0'] }] },
        { id: 'cl-paper', n: 'ورق أبيض', c: 'calm', sky: ['#f6f1e6', '#efe6d4'], layers: [{ k: 'blobs', bl: [[0.15, 0.2, 0.3, '#e8dcc2', 0.8], [0.85, 0.75, 0.38, '#e2d4b4', 0.7], [0.6, 0.1, 0.2, '#f9f4ea', 0.9]] }] },
    ];
    THEMES.forEach((t) => { if (!t.tone) { const m = lum(t.sky[Math.min(1, t.sky.length - 1)]); t.tone = m > 0.55 ? 'l' : 'd'; } });
    const THEME = {}; THEMES.forEach((t) => { THEME[t.id] = t; });

    // ---------- painting ----------
    let uidN = 0;
    function paint(T, W, H, thumb) {
        const r = rng(hash(T.id) + (thumb ? 7 : 0));
        const uid = 't' + (uidN++) + '_';
        let n = 0, defs = '', out = '';
        const gid = () => uid + (n++);
        const glow = (x, y, rad, c, o) => { const g = gid(); defs += `<radialGradient id="${g}"><stop offset="0" stop-color="${c}" stop-opacity="${o == null ? 1 : o}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`; return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}" fill="url(#${g})"/>`; };
        const vgrad = (stops) => { const g = gid(); defs += `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">${stops.map((s) => `<stop offset="${s[0]}" stop-color="${s[1]}" stop-opacity="${s[2] == null ? 1 : s[2]}"/>`).join('')}</linearGradient>`; return g; };
        const S = H / 1000;

        // sky
        const sk = T.sky.length > 1 ? T.sky : [T.sky[0], T.sky[0]];
        out += `<rect width="${W}" height="${H}" fill="url(#${vgrad(sk.map((c, i) => [(i / (sk.length - 1)).toFixed(3), c]))})"/>`;

        // stars
        if (T.stars) {
            const s = T.stars; let cnt = Math.round(s.n * clamp((W * H) / 1e6, 0.45, 2.2) * (thumb ? 0.6 : 1)), tw = 0, o = '';
            if (s.band) out += glow(W / 2, H / 2, Math.max(W, H) * 0.55, '#aab8ff', 0.0);
            for (let i = 0; i < cnt; i++) {
                let x = r() * W, y = Math.pow(r(), 1.25) * H * s.top;
                if (s.band) { const t = r(); x = t * W; y = H * (0.9 - 0.8 * t) + (r() + r() + r() - 1.5) * H * 0.13; }
                const rad = (0.5 + r() * r() * 1.9) * S, op = 0.35 + r() * 0.65;
                const twk = !thumb && tw < 46 && r() < 0.22 && !reduceMotion();
                if (twk) { tw++; o += `<circle class="tm-tw" style="animation-delay:-${(r() * 5).toFixed(1)}s;animation-duration:${(2.5 + r() * 3).toFixed(1)}s" cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad * 1.2)}" fill="#fff" opacity="${op.toFixed(2)}"/>`; }
                else o += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}" fill="${r() < 0.12 ? '#cfe0ff' : r() < 0.08 ? '#ffe6c0' : '#fff'}" opacity="${op.toFixed(2)}"/>`;
            }
            out += o;
        }

        // ridge helpers
        const ridge = (L) => {
            const pts = [], step = W / (thumb ? 40 : (L.k === 'waves' ? 130 : 90));
            const p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28, base = L.y * H, amp = L.amp * H, fq = (L.f || 1) * (W / H > 1.2 ? 1 : 0.7);
            for (let x = 0; x <= W + step; x += step) {
                const u = (x / W) * fq; let v;
                if (L.k === 'mount') v = -(Math.pow(1 - Math.abs(Math.sin(u * 5.1 + p1)), 1.25) * 0.68 + (1 - Math.abs(Math.sin(u * 11.3 + p2))) * 0.24 + (1 - Math.abs(Math.sin(u * 23 + p3))) * 0.08);
                else if (L.k === 'dunes') v = -(Math.pow(Math.abs(Math.sin(u * 3 + p1)), 1.5) * 0.7 + Math.sin(u * 7 + p2) * 0.15);
                else if (L.k === 'waves') v = Math.sin(u * 14 + p1) * 0.5 + Math.sin(u * 6 + p2) * 0.3 + Math.sin(u * 27 + p3) * 0.08;
                else v = Math.sin(u * 3.3 + p1) * 0.5 + Math.sin(u * 7.1 + p2) * 0.28 + Math.sin(u * 15 + p3) * 0.08;
                pts.push([x, base + v * amp]);
            }
            return pts;
        };
        const yAt = (pts, x) => { const i = clamp(Math.floor((x / W) * (pts.length - 1)), 0, pts.length - 2), a = pts[i], b = pts[i + 1]; return a[1] + (b[1] - a[1]) * clamp((x - a[0]) / (b[0] - a[0] || 1), 0, 1); };
        const poly = (pts) => 'M0,' + H + ' ' + pts.map((p) => 'L' + f1(p[0]) + ',' + f1(p[1])).join(' ') + ' L' + W + ',' + H + ' Z';

        // items on a ridge
        const pine = (x, y, h, c, snow) => {
            const w = h * 0.4; let s = `<rect x="${f1(x - h * 0.02)}" y="${f1(y - h * 0.1)}" width="${f1(h * 0.04)}" height="${f1(h * 0.12)}" fill="${c}"/>`;
            for (let t = 0; t < 3; t++) {
                const top = y - h + t * h * 0.26, hw = w * (0.42 + 0.26 * t), bot = top + h * 0.4;
                const tier = (dy, col) => `<path d="M${f1(x)},${f1(top + dy)} L${f1(x + hw)},${f1(bot + dy)} L${f1(x - hw)},${f1(bot + dy)} Z" fill="${col}"/>`;
                if (snow) s += tier(0, snow);
                s += tier(snow ? h * 0.035 : 0, c);
            }
            return s;
        };
        const palm = (x, y, h, c) => {
            const lean = (r() - 0.5) * h * 0.35, tx = x + lean, ty = y - h; let s = `<path d="M${f1(x)},${f1(y + 4)} Q${f1(x + lean * 0.1)},${f1(y - h * 0.55)} ${f1(tx)},${f1(ty)}" stroke="${c}" stroke-width="${f1(Math.max(2, h * 0.045))}" fill="none" stroke-linecap="round"/>`;
            const fr = 9;
            for (let i = 0; i < fr; i++) {
                const a = Math.PI * (1.05 + (i / (fr - 1)) * 0.9), len = h * (0.34 + r() * 0.12), ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.45 + len * 0.32;
                s += `<path d="M${f1(tx)},${f1(ty)} Q${f1(tx + Math.cos(a) * len * 0.55)},${f1(ty + Math.sin(a) * len * 0.75 - len * 0.05)} ${f1(ex)},${f1(ey)}" stroke="${c}" stroke-width="${f1(Math.max(1.4, h * 0.028))}" fill="none" stroke-linecap="round"/>`;
            }
            return s + `<circle cx="${f1(tx)}" cy="${f1(ty + h * 0.03)}" r="${f1(h * 0.035)}" fill="${c}"/>`;
        };
        const round = (x, y, h, c, c2) => {
            let s = `<rect x="${f1(x - h * 0.03)}" y="${f1(y - h * 0.5)}" width="${f1(h * 0.06)}" height="${f1(h * 0.52)}" fill="${c}"/>`;
            for (let i = 0; i < 6; i++) s += `<circle cx="${f1(x + (r() - 0.5) * h * 0.42)}" cy="${f1(y - h * 0.68 + (r() - 0.5) * h * 0.3)}" r="${f1(h * (0.17 + r() * 0.08))}" fill="${c2 || c}"/>`;
            return s;
        };
        const sakura = (x, y, h) => {
            let s = `<path d="M${f1(x)},${f1(y + 3)} Q${f1(x + h * 0.04)},${f1(y - h * 0.4)} ${f1(x - h * 0.02)},${f1(y - h * 0.62)} M${f1(x)},${f1(y - h * 0.4)} L${f1(x + h * 0.2)},${f1(y - h * 0.6)} M${f1(x)},${f1(y - h * 0.45)} L${f1(x - h * 0.2)},${f1(y - h * 0.65)}" stroke="#5a3a3a" stroke-width="${f1(Math.max(2, h * 0.045))}" fill="none" stroke-linecap="round"/>`;
            for (let i = 0; i < 12; i++) s += `<circle cx="${f1(x + (r() - 0.5) * h * 0.62)}" cy="${f1(y - h * 0.7 + (r() - 0.5) * h * 0.34)}" r="${f1(h * (0.1 + r() * 0.08))}" fill="${r() < 0.5 ? '#ffb7cc' : r() < 0.5 ? '#ffd0de' : '#f98fb0'}" opacity="0.92"/>`;
            return s;
        };
        const reed = (x, y, h, c) => {
            let s = '';
            for (let i = 0; i < 5; i++) { const bx = x + (i - 2) * h * 0.06, lean = (r() - 0.5) * h * 0.5, hh = h * (0.7 + r() * 0.4); s += `<path d="M${f1(bx)},${f1(y + 3)} Q${f1(bx + lean * 0.2)},${f1(y - hh * 0.6)} ${f1(bx + lean)},${f1(y - hh)}" stroke="${c}" stroke-width="${f1(Math.max(1.3, h * 0.03))}" fill="none" stroke-linecap="round"/>`; }
            return s;
        };
        const items = (L, pts) => {
            const it = L.items; if (!it) return '';
            const cnt = Math.max(2, Math.round(it.n * clamp(W / 1000, 0.45, 2.4) * (thumb ? 0.7 : 1))), xr = it.xr || [0, 1], col = it.c || L.c; let s = '';
            const list = [];
            for (let i = 0; i < cnt; i++) list.push((xr[0] + r() * (xr[1] - xr[0])) * W);
            list.sort((a, b) => a - b);
            list.forEach((x) => {
                const y = yAt(pts, x) + 3 * S, h = (it.h[0] + r() * (it.h[1] - it.h[0])) * H;
                if (it.k === 'pine') s += pine(x, y, h, col, it.snow);
                else if (it.k === 'palm') s += palm(x, y, h, col);
                else if (it.k === 'round') s += round(x, y, h, col, it.cs ? it.cs[Math.floor(r() * it.cs.length)] : col);
                else if (it.k === 'sakura') s += sakura(x, y, h);
                else if (it.k === 'reed') s += reed(x, y, h, col);
                else if (it.k === 'dots') s += `<circle cx="${f1(x)}" cy="${f1(y + r() * (H - y) * 0.5)}" r="${f1(h * (0.5 + r()))}" fill="${it.cs[Math.floor(r() * it.cs.length)]}"/>`;
            });
            return s;
        };

        // scene pieces
        const body = (L) => {
            const x = L.x * W, y = L.y * H, rad = L.r * H;
            if (L.k === 'sun') return glow(x, y, rad * 7, L.c, 0.32) + glow(x, y, rad * 2.8, L.c, 0.6) + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}" fill="${L.c}"/>`;
            if (L.k === 'moon') { const m = gid(); defs += `<mask id="${m}"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="${f1(x + rad * 0.55)}" cy="${f1(y - rad * 0.2)}" r="${f1(rad * 0.88)}" fill="#000"/></mask>`; return glow(x, y, rad * 6, L.c, 0.22) + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}" fill="${L.c}" mask="url(#${m})"/>`; }
            if (L.k === 'full') { let s = glow(x, y, rad * 4.5, L.c, 0.3) + glow(x, y, rad * 2, L.c, 0.4) + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}" fill="${L.c}"/>`; for (let i = 0; i < 6; i++) s += `<circle cx="${f1(x + (r() - 0.5) * rad)}" cy="${f1(y + (r() - 0.5) * rad)}" r="${f1(rad * (0.07 + r() * 0.12))}" fill="#9a9a8a" opacity="0.18"/>`; return s; }
            return '';
        };
        const clouds = (L) => {
            let s = '';
            const cnt = Math.round(L.n * clamp(W / 1000, 0.5, 2) * (thumb ? 0.7 : 1));
            for (let i = 0; i < cnt; i++) {
                const cx = r() * W, cy = (L.y0 + r() * (L.y1 - L.y0)) * H, sc = (0.6 + r() * 0.9) * S;
                let g = '';
                for (let j = 0; j < 6; j++) g += `<ellipse cx="${f1(cx + (j - 2.5) * 36 * sc + (r() - 0.5) * 20 * sc)}" cy="${f1(cy + (r() - 0.5) * 16 * sc)}" rx="${f1((46 + r() * 36) * sc)}" ry="${f1((16 + r() * 14) * sc)}"/>`;
                s += `<g class="tm-drift" style="animation-duration:${(40 + r() * 50).toFixed(0)}s;animation-delay:-${(r() * 40).toFixed(0)}s" fill="${L.c}" opacity="${L.o}">${g}</g>`;
            }
            return s;
        };
        const cityLayer = (L) => {
            const base = L.y * H; let x = -10 * S, s = '', w2 = '';
            if (L.haze) s += `<rect x="0" y="${f1(base - L.hh[1] * H * 1.3)}" width="${W}" height="${f1(H - base + L.hh[1] * H * 1.3)}" fill="url(#${vgrad([[0, L.haze, 0], [1, L.haze, 0.55]])})"/>`;
            while (x < W) {
                const bw = (28 + r() * 62) * S, bh = (L.hh[0] + r() * (L.hh[1] - L.hh[0])) * H;
                s += `<rect x="${f1(x)}" y="${f1(base - bh)}" width="${f1(bw + 1)}" height="${f1(bh + (H - base))}" fill="${L.c}"/>`;
                if (r() < 0.25) s += `<rect x="${f1(x + bw * 0.48)}" y="${f1(base - bh - 18 * S)}" width="${f1(2 * S)}" height="${f1(18 * S)}" fill="${L.c}"/>`;
                if (L.win) for (let wy = base - bh + 10 * S; wy < base - 6 * S; wy += 13 * S) for (let wx = x + 6 * S; wx < x + bw - 8 * S; wx += 11 * S) if (r() < L.wp) w2 += `<rect x="${f1(wx)}" y="${f1(wy)}" width="${f1(4.5 * S)}" height="${f1(6.5 * S)}" fill="${L.win}" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`;
                x += bw + r() * 6 * S;
            }
            return s + w2;
        };
        const baghdad = (L) => {
            const base = L.y * H; let x = -10 * S, s = '', w2 = '';
            if (L.haze) s += `<rect x="0" y="${f1(base - 260 * S)}" width="${W}" height="${f1(H - base + 260 * S)}" fill="url(#${vgrad([[0, L.haze, 0], [1, L.haze, 0.5]])})"/>`;
            while (x < W) {
                const t = r();
                if (t < 0.22) { const bw = (70 + r() * 40) * S, bh = (40 + r() * 30) * S, dr = bw * 0.38; s += `<rect x="${f1(x)}" y="${f1(base - bh)}" width="${f1(bw)}" height="${f1(bh + (H - base))}" fill="${L.c}"/><path d="M${f1(x + bw / 2 - dr)},${f1(base - bh)} A${f1(dr)},${f1(dr * 1.2)} 0 0 1 ${f1(x + bw / 2 + dr)},${f1(base - bh)} Z" fill="${L.c}"/><rect x="${f1(x + bw / 2 - 1.2 * S)}" y="${f1(base - bh - dr * 1.2 - 16 * S)}" width="${f1(2.4 * S)}" height="${f1(16 * S)}" fill="${L.c}"/>`; x += bw + 8 * S; }
                else if (t < 0.4) { const mh = (130 + r() * 90) * S, mw = 11 * S; s += `<rect x="${f1(x)}" y="${f1(base - mh)}" width="${f1(mw)}" height="${f1(mh + (H - base))}" fill="${L.c}"/><rect x="${f1(x - 3 * S)}" y="${f1(base - mh * 0.8)}" width="${f1(mw + 6 * S)}" height="${f1(5 * S)}" fill="${L.c}"/><path d="M${f1(x - 1 * S)},${f1(base - mh)} L${f1(x + mw / 2)},${f1(base - mh - 34 * S)} L${f1(x + mw + 1 * S)},${f1(base - mh)} Z" fill="${L.c}"/>`; x += mw + 10 * S; }
                else { const bw = (30 + r() * 50) * S, bh = (24 + r() * 56) * S; s += `<rect x="${f1(x)}" y="${f1(base - bh)}" width="${f1(bw)}" height="${f1(bh + (H - base))}" fill="${L.c}"/>`; if (L.win) for (let wy = base - bh + 8 * S; wy < base - 4 * S; wy += 12 * S) for (let wx = x + 5 * S; wx < x + bw - 6 * S; wx += 10 * S) if (r() < 0.2) w2 += `<rect x="${f1(wx)}" y="${f1(wy)}" width="${f1(4 * S)}" height="${f1(6 * S)}" fill="${L.win}" opacity="0.8"/>`; x += bw + 6 * S; }
            }
            return s + w2;
        };
        const ziggurat = (L) => {
            const cx = L.x * W, by = L.y * H, w = Math.min(L.w * W, L.w * H * 1.6); let s = glow(cx, by - w * 0.46, w * 0.9, L.glow, 0.28);
            for (let i = 0; i < 4; i++) { const tw = w * (1 - i * 0.22), th = w * 0.13, y = by - i * th; s += `<path d="M${f1(cx - tw / 2)},${f1(y)} L${f1(cx - tw / 2 + w * 0.05)},${f1(y - th)} L${f1(cx + tw / 2 - w * 0.05)},${f1(y - th)} L${f1(cx + tw / 2)},${f1(y)} Z" fill="${mix(L.c, '#000000', i * 0.08)}"/>`; }
            const ty = by - 4 * w * 0.13;
            s += `<rect x="${f1(cx - w * 0.1)}" y="${f1(ty - w * 0.07)}" width="${f1(w * 0.2)}" height="${f1(w * 0.07)}" fill="${L.c}"/>` + glow(cx, ty - w * 0.1, w * 0.1, L.glow, 0.95);
            s += `<path d="M${f1(cx - w * 0.06)},${f1(by)} L${f1(cx - w * 0.03)},${f1(ty)} L${f1(cx + w * 0.03)},${f1(ty)} L${f1(cx + w * 0.06)},${f1(by)} Z" fill="${mix(L.c, L.glow, 0.18)}"/>`;
            return s;
        };
        const water = (L) => {
            const wy = L.y * H; let s = `<rect x="0" y="${f1(wy)}" width="${W}" height="${f1(H - wy)}" fill="url(#${vgrad([[0, L.c[0]], [1, L.c[1]]])})" opacity="${L.o || 1}"/>`;
            if (L.refl) {
                const rx = L.refl.x * W, rw = L.refl.w * H;
                for (let i = 0; i < 26; i++) { const yy = wy + (i / 26) * (H - wy) * 0.75 + 4 * S, ww = rw * (0.5 + i * 0.07) * (0.4 + r() * 0.8); s += `<rect x="${f1(rx - ww / 2)}" y="${f1(yy)}" width="${f1(ww)}" height="${f1(Math.max(1.5, 2.6 * S + i * 0.18 * S))}" rx="1.5" fill="${L.refl.c}" opacity="${(0.55 - i * 0.017).toFixed(2)}"/>`; }
            }
            for (let i = 0; i < (thumb ? 14 : 38); i++) s += `<rect x="${f1(r() * W)}" y="${f1(wy + 6 * S + r() * (H - wy - 8 * S))}" width="${f1((20 + r() * 70) * S)}" height="${f1(1.4 * S)}" rx="1" fill="#fff" opacity="${(0.05 + r() * 0.14).toFixed(2)}"/>`;
            return s;
        };
        const boat = (L) => { const x = L.x * W, y = L.y * H, s = S * (L.s || 1); return `<path d="M${f1(x - 90 * s)},${f1(y - 20 * s)} Q${f1(x - 40 * s)},${f1(y + 16 * s)} ${f1(x)},${f1(y + 14 * s)} Q${f1(x + 50 * s)},${f1(y + 16 * s)} ${f1(x + 96 * s)},${f1(y - 26 * s)} Q${f1(x + 20 * s)},${f1(y + 2 * s)} ${f1(x - 90 * s)},${f1(y - 20 * s)} Z" fill="${L.c}"/><circle cx="${f1(x - 8 * s)}" cy="${f1(y - 36 * s)}" r="${f1(6 * s)}" fill="${L.c}"/><path d="M${f1(x - 14 * s)},${f1(y)} L${f1(x - 12 * s)},${f1(y - 28 * s)} L${f1(x - 2 * s)},${f1(y - 28 * s)} L${f1(x)},${f1(y)} Z" fill="${L.c}"/><path d="M${f1(x + 14 * s)},${f1(y - 4 * s)} L${f1(x + 54 * s)},${f1(y - 56 * s)}" stroke="${L.c}" stroke-width="${f1(2.4 * s)}"/>`; };
        const tent = (L) => {
            const x = L.x * W, y = L.y * H, w = L.w * Math.min(W, H * 1.4); const fx = x + w * 0.8;
            return glow(fx, y - 12 * S, w * 1.1, '#ff9a3c', 0.4) + `<path d="M${f1(x - w / 2)},${f1(y)} L${f1(x)},${f1(y - w * 0.62)} L${f1(x + w / 2)},${f1(y)} Z" fill="${L.c}"/><path d="M${f1(x - w * 0.1)},${f1(y)} L${f1(x)},${f1(y - w * 0.3)} L${f1(x + w * 0.1)},${f1(y)} Z" fill="#ffb05a" opacity="0.85"/>` +
                `<path d="M${f1(fx - 14 * S)},${f1(y)} Q${f1(fx - 16 * S)},${f1(y - 26 * S)} ${f1(fx)},${f1(y - 48 * S)} Q${f1(fx + 16 * S)},${f1(y - 26 * S)} ${f1(fx + 14 * S)},${f1(y)} Z" fill="#ff8a1c"/><path d="M${f1(fx - 7 * S)},${f1(y)} Q${f1(fx - 8 * S)},${f1(y - 16 * S)} ${f1(fx)},${f1(y - 28 * S)} Q${f1(fx + 8 * S)},${f1(y - 16 * S)} ${f1(fx + 7 * S)},${f1(y)} Z" fill="#ffd25a"/>`;
        };
        const planet = (L) => {
            const x = L.x * W, y = L.y * H, rad = L.r * H, id = gid(), cp = gid();
            defs += `<radialGradient id="${id}" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stop-color="${L.c1}"/><stop offset="1" stop-color="${L.c2}"/></radialGradient><clipPath id="${cp}"><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}"/></clipPath>`;
            let bands = ''; for (let i = 0; i < 7; i++) bands += `<rect x="${f1(x - rad)}" y="${f1(y - rad + r() * rad * 2)}" width="${f1(rad * 2)}" height="${f1(rad * (0.05 + r() * 0.12))}" fill="${r() < 0.5 ? '#ffffff' : '#000000'}" opacity="0.1"/>`;
            defs += `<clipPath id="${cp}f"><rect x="${f1(x - rad * 3)}" y="${f1(y)}" width="${f1(rad * 6)}" height="${f1(rad * 3)}"/></clipPath>`;
            const shade = gid(); defs += `<radialGradient id="${shade}" cx="0.3" cy="0.25" r="0.9"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.65"/></radialGradient>`;
            return glow(x, y, rad * 3.2, L.c1, 0.18) + `<g transform="rotate(-16 ${f1(x)} ${f1(y)})"><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rad * 2.05)}" ry="${f1(rad * 0.5)}" fill="none" stroke="${L.ring}" stroke-width="${f1(rad * 0.16)}" opacity="0.5"/></g><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}" fill="url(#${id})"/><g clip-path="url(#${cp})">${bands}</g><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}" fill="url(#${shade})"/>` + `<g transform="rotate(-16 ${f1(x)} ${f1(y)})"><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rad * 2.05)}" ry="${f1(rad * 0.5)}" fill="none" stroke="${L.ring}" stroke-width="${f1(rad * 0.16)}" opacity="0.85" clip-path="url(#${cp}f)"/></g>`;
        };
        const earth = () => {
            const cx = W / 2, rad = Math.max(W * 0.95, H * 1.05), cy = H * 1.0 + rad * 0.62, id = gid(), cp = gid(), ring = gid();
            defs += `<radialGradient id="${id}" cx="0.5" cy="0" r="1"><stop offset="0" stop-color="#2a7ad0"/><stop offset="0.35" stop-color="#14509c"/><stop offset="1" stop-color="#03102a"/></radialGradient><clipPath id="${cp}"><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rad)}"/></clipPath><radialGradient id="${ring}" cx="0.5" cy="0.5" r="0.5"><stop offset="0.86" stop-color="#6ab8ff" stop-opacity="0"/><stop offset="0.925" stop-color="#8fd0ff" stop-opacity="0.9"/><stop offset="1" stop-color="#6ab8ff" stop-opacity="0"/></radialGradient>`;
            let land = '', cl = ''; for (let i = 0; i < 8; i++) land += `<ellipse cx="${f1(cx + (r() - 0.5) * rad * 1.4)}" cy="${f1(cy - rad + r() * rad * 0.35)}" rx="${f1(rad * (0.06 + r() * 0.14))}" ry="${f1(rad * (0.02 + r() * 0.05))}" fill="#3f8a4a" opacity="0.7"/>`;
            for (let i = 0; i < 9; i++) cl += `<ellipse cx="${f1(cx + (r() - 0.5) * rad * 1.6)}" cy="${f1(cy - rad + r() * rad * 0.3)}" rx="${f1(rad * (0.05 + r() * 0.1))}" ry="${f1(rad * (0.008 + r() * 0.014))}" fill="#fff" opacity="${(0.15 + r() * 0.2).toFixed(2)}"/>`;
            return glow(W * 0.78, cy - rad + 4 * S, W * 0.35, '#ffb050', 0.55) + `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rad * 1.08)}" fill="url(#${ring})"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rad)}" fill="url(#${id})"/><g clip-path="url(#${cp})">${land}${cl}</g>` + glow(W * 0.78, cy - rad + 2 * S, W * 0.16, '#fff1c0', 0.8);
        };
        const eclipse = (L) => { const x = L.x * W, y = L.y * H, rad = L.r * H; return glow(x, y, rad * 6, '#cfd8ff', 0.28) + glow(x, y, rad * 2.6, '#ffffff', 0.55) + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad * 1.04)}" fill="none" stroke="#fff" stroke-width="${f1(2.2 * S)}" opacity="0.8"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}" fill="#000"/>` + glow(x + rad * 0.72, y - rad * 0.72, rad * 0.8, '#fff6d8', 0.95); };
        const aurora = (L) => {
            let s = ''; const fl = gid(); defs += `<filter id="${fl}" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="${f1(16 * S)}"/></filter>`;
            L.cs.forEach((c, i) => {
                const g = vgrad([[0, c, 0], [0.55, c, 0.5], [1, c, 0.05]]), p = r() * 6.28, y0 = (L.y + (i - 1) * 0.07) * H, th = H * (0.2 + r() * 0.1); let up = '', dn = [];
                for (let x = 0; x <= W; x += W / 30) { const yy = y0 + Math.sin((x / W) * 5 + p) * H * 0.07 + Math.sin((x / W) * 11 + p) * H * 0.025; up += (up ? 'L' : 'M') + f1(x) + ',' + f1(yy - th * 0.5) + ' '; dn.unshift('L' + f1(x) + ',' + f1(yy + th * 0.5) + ' '); }
                s += `<g class="tm-aur" style="animation-duration:${(14 + r() * 10).toFixed(0)}s;animation-delay:-${(r() * 12).toFixed(0)}s" filter="url(#${fl})"><path d="${up}${dn.join('')}Z" fill="url(#${g})"/></g>`;
            });
            return s;
        };
        const nebula = (L) => L.blobs.map((b) => glow(b[0] * W, b[1] * H, b[2] * Math.max(W, H), b[3], b[4])).join('');
        const band = () => glow(W / 2, H / 2, Math.max(W, H) * 0.42, '#9aa8ff', 0.3) + glow(W * 0.35, H * 0.62, Math.max(W, H) * 0.26, '#ffd9b0', 0.26) + glow(W * 0.68, H * 0.36, Math.max(W, H) * 0.26, '#b0c0ff', 0.26);
        const blobs = (L) => { const fl = gid(); defs += `<filter id="${fl}" filterUnits="userSpaceOnUse" x="${-W}" y="${-H}" width="${3 * W}" height="${3 * H}"><feGaussianBlur stdDeviation="${f1(70 * S)}"/></filter>`; return `<g filter="url(#${fl})">` + L.bl.map((b) => `<circle cx="${f1(b[0] * W)}" cy="${f1(b[1] * H)}" r="${f1(b[2] * Math.max(W, H) * 0.7)}" fill="${b[3]}" opacity="${b[4]}"/>`).join('') + '</g>'; };
        const rings = (L) => { let s = glow(W / 2, H / 2, Math.max(W, H) * 0.6, L.c, 0.2); for (let i = 1; i < 9; i++) s += `<circle cx="${f1(W / 2)}" cy="${f1(H / 2)}" r="${f1(i * H * 0.13)}" fill="none" stroke="${L.c}" stroke-width="${f1(1.2 * S)}" opacity="${(0.55 - i * 0.055).toFixed(2)}"/>`; for (let i = 0; i < 40; i++) { const a = (i / 40) * 6.283, rr = H * 0.52; s += `<circle cx="${f1(W / 2 + Math.cos(a) * rr)}" cy="${f1(H / 2 + Math.sin(a) * rr)}" r="${f1(2.4 * S)}" fill="${L.c}" opacity="0.7"/>`; } return s; };
        const lowpoly = (L) => {
            const cols = Math.max(6, Math.round(W / (H * 0.16))), cw = W / cols, rows = Math.ceil(H / cw) + 1, P = [];
            for (let j = 0; j <= rows; j++) { P[j] = []; for (let i = 0; i <= cols; i++) P[j][i] = [i * cw + (i && i < cols ? (r() - 0.5) * cw * 0.7 : 0), j * cw + (j && j < rows ? (r() - 0.5) * cw * 0.7 : 0)]; }
            let s = '';
            for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
                const a = P[j][i], b = P[j][i + 1], c = P[j + 1][i], d = P[j + 1][i + 1];
                [[a, b, c], [b, d, c]].forEach((tri) => { const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3, col = mix(palAt(L.pal, (cx / W) * 0.55 + (cy / H) * 0.45), r() < 0.5 ? '#ffffff' : '#000000', r() * 0.12); s += `<path d="M${f1(tri[0][0])},${f1(tri[0][1])} L${f1(tri[1][0])},${f1(tri[1][1])} L${f1(tri[2][0])},${f1(tri[2][1])} Z" fill="${col}" stroke="${col}" stroke-width="0.7"/>`; });
            }
            return s;
        };

        T.layers.forEach((L) => {
            const k = L.k;
            if (k === 'sun' || k === 'moon' || k === 'full') out += body(L);
            else if (k === 'clouds') out += clouds(L);
            else if (k === 'city') out += cityLayer(L);
            else if (k === 'baghdad') out += baghdad(L);
            else if (k === 'ziggurat') out += ziggurat(L);
            else if (k === 'water') out += water(L);
            else if (k === 'boat') out += boat(L);
            else if (k === 'tent') out += tent(L);
            else if (k === 'planet') out += planet(L);
            else if (k === 'earth') out += earth();
            else if (k === 'eclipse') out += eclipse(L);
            else if (k === 'aurora') out += aurora(L);
            else if (k === 'nebula') out += nebula(L);
            else if (k === 'band') out += band();
            else if (k === 'blobs') out += blobs(L);
            else if (k === 'rings') out += rings(L);
            else if (k === 'lowpoly') out += lowpoly(L);
            else if (k === 'hills' || k === 'mount' || k === 'dunes' || k === 'waves') {
                const pts = ridge(L);
                if (L.haze) { const top = L.y * H - L.amp * H * 1.4; out += `<rect x="0" y="${f1(top)}" width="${W}" height="${f1(H - top)}" fill="url(#${vgrad([[0, L.haze, 0], [0.55, L.haze, 0.5], [1, L.haze, 0.5]])})"/>`; }
                if (L.mirror != null) { const cp = gid(), my = L.mirror * H; defs += `<clipPath id="${cp}"><rect x="0" y="${f1(my)}" width="${W}" height="${f1(H - my)}"/></clipPath>`; out += `<g clip-path="url(#${cp})" opacity="0.55"><g transform="translate(0 ${f1(2 * my)}) scale(1 -1)"><path d="${poly(pts)}" fill="${L.c}"/>${items(L, pts)}</g></g>`; }
                out += `<path d="${poly(pts)}" fill="${L.c}"${L.o ? ` opacity="${L.o}"` : ''}/>`;
                if (L.snow && k === 'mount') {
                    const capH = L.amp * H * 0.2;
                    for (let i = 1; i < pts.length - 1; i++) if (pts[i][1] < pts[i - 1][1] && pts[i][1] <= pts[i + 1][1] && pts[i][1] < L.y * H - L.amp * H * 0.55) {
                        let a = i, b = i; while (a > 0 && pts[a][1] < pts[i][1] + capH) a--; while (b < pts.length - 1 && pts[b][1] < pts[i][1] + capH) b++;
                        let d = ''; for (let j = a; j <= b; j++) d += (d ? 'L' : 'M') + f1(pts[j][0]) + ',' + f1(pts[j][1]) + ' ';
                        const zig = []; for (let j = b; j >= a; j--) zig.push('L' + f1(pts[j][0]) + ',' + f1(pts[j][1] + capH * (0.45 + 0.35 * ((j % 2) ? 1 : 0.2))));
                        out += `<path d="${d}${zig.join(' ')} Z" fill="${L.snow}" opacity="0.95"/>`;
                    }
                }
                out += items(L, pts);
            }
        });
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f1(W)} ${f1(H)}" width="100%" height="100%" preserveAspectRatio="none"><defs>${defs}</defs>${out}</svg>`;
    }

    // ---------- particle effects (canvas) ----------
    function startFx(cv, type, alive) {
        if (!cv || !type || reduceMotion()) return { stop() {} };
        const ctx = cv.getContext('2d'); let W = 0, H = 0, dpr = 1, raf = 0, last = 0, P = [], stopped = false;
        const R = Math.random;
        const mk = (init) => {
            const t = type;
            if (t === 'snow') return { x: R() * W, y: init ? R() * H : -10, s: 1 + R() * 2.6, vy: 22 + R() * 46, ph: R() * 6.28, sw: 10 + R() * 25 };
            if (t === 'rain') return { x: R() * (W + 200), y: init ? R() * H : -30, l: 12 + R() * 16, vy: 750 + R() * 350 };
            if (t === 'petal' || t === 'leaf') return { x: R() * W, y: init ? R() * H : -14, s: 4 + R() * 5, vy: 28 + R() * 40, ph: R() * 6.28, sw: 20 + R() * 40, rot: R() * 6.28, vr: (R() - 0.5) * 2, c: t === 'petal' ? ['#ffb7cc', '#ffd0de', '#f98fb0'][Math.floor(R() * 3)] : ['#e8761f', '#c9421a', '#f2b132', '#a8301e'][Math.floor(R() * 4)] };
            if (t === 'fly') return { x: R() * W, y: H * (0.35 + R() * 0.62), vx: (R() - 0.5) * 14, vy: (R() - 0.5) * 10, ph: R() * 6.28, s: 1.4 + R() * 2 };
            if (t === 'ember') return { x: W * 0.62 + W * 0.2 * 0.8 + (R() - 0.5) * 20, y: H * 0.88 - (init ? R() * H * 0.4 : 0), vx: (R() - 0.5) * 30, vy: -(40 + R() * 90), life: R(), s: 1 + R() * 2 };
            return { x: R() * W, y: init ? R() * H : H + 20, vy: -(14 + R() * 26), ph: R() * 6.28, s: 11 + R() * 11, sw: 14 + R() * 20 };
        };
        const count = () => ({ snow: 120, rain: 150, petal: 40, leaf: 36, fly: 38, ember: 55, lantern: 16 })[type] || 40;
        const resize = () => { dpr = Math.min(window.devicePixelRatio || 1, 1.75); W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); P = []; for (let i = 0; i < count() * clamp((W * H) / 450000, 0.5, 1.8); i++) P.push(mk(true)); };
        const frame = (ts) => {
            if (stopped) return;
            raf = requestAnimationFrame(frame);
            if (!alive()) { last = 0; return; }
            const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016; last = ts;
            ctx.clearRect(0, 0, W, H);
            P.forEach((p, i) => {
                if (type === 'snow') { p.y += p.vy * dt; p.x += Math.sin(p.ph + p.y * 0.01) * p.sw * dt; ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.283); ctx.fill(); if (p.y > H + 6) P[i] = mk(false); }
                else if (type === 'rain') { p.y += p.vy * dt; p.x -= p.vy * dt * 0.18; ctx.globalAlpha = 0.3; ctx.strokeStyle = '#bcd4ea'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.l * 0.18, p.y - p.l); ctx.stroke(); if (p.y > H + 20) P[i] = mk(false); }
                else if (type === 'petal' || type === 'leaf') { p.y += p.vy * dt; p.x += Math.sin(p.ph + p.y * 0.012) * p.sw * dt; p.rot += p.vr * dt; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = 0.9; ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, 6.283); ctx.fill(); ctx.restore(); if (p.y > H + 14) P[i] = mk(false); }
                else if (type === 'fly') { p.ph += dt * 1.6; p.vx += (R() - 0.5) * 30 * dt; p.vy += (R() - 0.5) * 30 * dt; p.vx = clamp(p.vx, -22, 22); p.vy = clamp(p.vy, -16, 16); p.x += p.vx * dt; p.y += p.vy * dt; if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10; p.y = clamp(p.y, H * 0.3, H * 0.98); const a = 0.25 + 0.75 * Math.max(0, Math.sin(p.ph)); const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 6); g.addColorStop(0, 'rgba(214,255,122,' + a + ')'); g.addColorStop(1, 'rgba(214,255,122,0)'); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 6, 0, 6.283); ctx.fill(); }
                else if (type === 'ember') { p.life += dt * 0.35; p.y += p.vy * dt; p.x += p.vx * dt + Math.sin(p.life * 12) * 0.4; ctx.globalAlpha = Math.max(0, 1 - p.life); ctx.fillStyle = '#ffae42'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 - p.life * 0.6), 0, 6.283); ctx.fill(); if (p.life >= 1 || p.y < 0) { P[i] = mk(false); P[i].life = 0; } }
                else { p.y += p.vy * dt; p.x += Math.sin(p.ph + p.y * 0.01) * p.sw * dt; const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 2.4); g.addColorStop(0, 'rgba(255,200,110,.95)'); g.addColorStop(0.4, 'rgba(255,150,60,.45)'); g.addColorStop(1, 'rgba(255,120,40,0)'); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 2.4, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff1c0'; ctx.fillRect(p.x - p.s * 0.28, p.y - p.s * 0.38, p.s * 0.56, p.s * 0.76); if (p.y < -30) P[i] = mk(false); }
            });
            ctx.globalAlpha = 1;
        };
        resize(); raf = requestAnimationFrame(frame);
        const onR = () => resize(); window.addEventListener('resize', onR);
        return { stop() { stopped = true; cancelAnimationFrame(raf); window.removeEventListener('resize', onR); } };
    }

    // ---------- timer state ----------
    const PRESETS = [
        { id: 'pomo', n: 'بومودورو', d: '25 تركيز · 5 راحة', f: 25, s: 5, l: 15, r: 4 },
        { id: 'p50', n: '50 / 10', d: '50 تركيز · 10 راحة', f: 50, s: 10, l: 20, r: 3 },
        { id: 'p52', n: '52 / 17', d: '52 تركيز · 17 راحة', f: 52, s: 17, l: 30, r: 3 },
        { id: 'p90', n: 'دورة 90', d: '90 تركيز · 20 راحة', f: 90, s: 20, l: 30, r: 2 },
        { id: 'p45', n: 'حصة 45 / 15', d: '45 تركيز · 15 راحة', f: 45, s: 15, l: 30, r: 3 },
        { id: 'p30', n: '30 / 5', d: '30 تركيز · 5 راحة', f: 30, s: 5, l: 15, r: 4 },
        { id: 'p15', n: 'سريع 15 / 3', d: '15 تركيز · 3 راحة', f: 15, s: 3, l: 10, r: 4 },
        { id: 'cus', n: 'مخصص', d: 'اختار أنت', f: 25, s: 5, l: 15, r: 4 },
    ];
    const PH = { f: 'تركيز', s: 'راحة قصيرة', l: 'راحة طويلة', cd: 'عد تنازلي', sw: 'ساعة توقيت' };
    const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const defState = () => ({ v: 1, mode: 'focus', preset: 'pomo', cfg: { f: 25, s: 5, l: 15, r: 4, auto: true, sound: true, vib: true }, cd: 600, theme: 'nt-stars', runs: {}, stats: { d: today(), n: 0, m: 0, tn: 0, tm: 0 } });
    let S = null, tickT = 0, fx = null, lastBg = '', sceneOn = false, lockObj = null, actx = null;

    function load() {
        try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === 1) { S = Object.assign(defState(), o); S.cfg = Object.assign(defState().cfg, o.cfg || {}); S.stats = Object.assign(defState().stats, o.stats || {}); } } catch (e) {}
        if (!S) S = defState();
        if (!THEME[S.theme]) S.theme = 'nt-stars';
        if (S.stats.d !== today()) { S.stats.d = today(); S.stats.n = 0; S.stats.m = 0; }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
    const newRun = (mode) => {
        if (mode === 'cd') return { ph: 'cd', total: S.cd * 1000, left: S.cd * 1000, running: false, end: 0, round: 1 };
        if (mode === 'sw') return { ph: 'sw', total: 0, acc: 0, running: false, t0: 0, round: 1 };
        return { ph: 'f', total: S.cfg.f * 60000, left: S.cfg.f * 60000, running: false, end: 0, round: 1 };
    };
    const run = (mode) => { mode = mode || S.mode; if (!S.runs[mode]) S.runs[mode] = newRun(mode); return S.runs[mode]; };
    const remain = (R) => (R.ph === 'sw' ? (R.acc || 0) + (R.running ? Date.now() - R.t0 : 0) : R.running ? Math.max(0, R.end - Date.now()) : R.left);
    const fmtT = (ms, sw) => { const s = sw ? Math.floor(ms / 1000) : Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s % 60); };

    // ---------- alert: sound, vibration, notification ----------
    function beep() {
        if (!S.cfg.sound) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
            [880, 1175, 1568, 1175, 1568].forEach((fr, i) => { const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.22; o.type = 'sine'; o.frequency.value = fr; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.21); });
        } catch (e) {}
    }
    function alertEnd(msg) {
        beep();
        if (S.cfg.vib) { try { navigator.vibrate && navigator.vibrate([220, 120, 220, 120, 400]); } catch (e) {} }
        if (document.hidden) { try { if ('Notification' in window && Notification.permission === 'granted') new Notification('المؤقت', { body: msg, icon: 'icons/icon-192.png' }); } catch (e) {} }
        try { app.showToast(msg); } catch (e) {}
    }
    async function wake(on) {
        try {
            if (on && !lockObj && navigator.wakeLock) { lockObj = await navigator.wakeLock.request('screen'); lockObj.addEventListener('release', () => { lockObj = null; }); }
            else if (!on && lockObj) { await lockObj.release(); lockObj = null; }
        } catch (e) { lockObj = null; }
    }

    // ---------- the machine ----------
    function finish(R, mode, manual, late) {
        if (mode === 'cd') { R.running = false; R.left = 0; if (!late) alertEnd('انتهى الوقت'); return; }
        const c = S.cfg; let msg = '';
        if (R.ph === 'f') {
            if (!manual) { S.stats.n++; S.stats.m += c.f; S.stats.tn++; S.stats.tm += c.f; }
            const long = R.round >= c.r; R.ph = long ? 'l' : 's'; msg = long ? 'خلصت جولة التركيز، خذ راحة طويلة' : 'أحسنت، خذ راحة قصيرة';
        } else { if (R.ph === 'l') R.round = 1; else R.round++; R.ph = 'f'; msg = 'خلصت الراحة، يلا نكمل'; }
        R.total = (R.ph === 'f' ? c.f : R.ph === 's' ? c.s : c.l) * 60000; R.left = R.total;
        const cont = manual ? R.running : (c.auto && sceneOn && !late);
        R.running = !!cont; R.end = cont ? Date.now() + R.total : 0;
        if (!manual && !late) alertEnd(msg);
    }
    function tick() {
        let changed = false;
        ['focus', 'cd'].forEach((m) => { const R = S.runs[m]; if (R && R.running && R.end - Date.now() <= 0) { finish(R, m, false, Date.now() - R.end > 60000); changed = true; } });
        if (changed) save();
        const any = Object.keys(S.runs).some((m) => S.runs[m] && S.runs[m].running);
        if (!any && !sceneOn) { clearInterval(tickT); tickT = 0; }
        if (sceneOn) draw();
        wake(sceneOn && !!(S.runs[S.mode] && S.runs[S.mode].running));
    }
    function ensureTick() { if (!tickT) tickT = setInterval(tick, 250); }
    const T = {
        toggle() {
            const R = run(); ensureTick();
            if (R.running) { if (R.ph === 'sw') { R.acc = remain(R); } else R.left = Math.max(0, R.end - Date.now()); R.running = false; }
            else { if (R.ph !== 'sw' && R.left <= 0) { Object.assign(R, newRun(S.mode)); } R.running = true; if (R.ph === 'sw') R.t0 = Date.now(); else R.end = Date.now() + R.left; try { if (actx && actx.state === 'suspended') actx.resume(); else if (S.cfg.sound && !actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) { actx = new AC(); } } if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {} }
            save(); draw(); wake(R.running);
        },
        reset() { S.runs[S.mode] = newRun(S.mode); save(); draw(); wake(false); },
        skip() { const R = run(); if (S.mode !== 'focus') return; finish(R, 'focus', true); save(); ensureTick(); draw(); },
        mode(m) { S.mode = m; save(); draw(); build(); },
        preset(id) { const p = PRESETS.find((x) => x.id === id); if (!p) return; S.preset = id; if (id !== 'cus') Object.assign(S.cfg, { f: p.f, s: p.s, l: p.l, r: p.r }); S.runs.focus = newRun('focus'); save(); draw(); build(); },
        cdAdd(sec) { const R = run('cd'); if (R.running) return; S.cd = clamp(S.cd + sec, 60, 6 * 3600); S.runs.cd = newRun('cd'); save(); draw(); },
        cdSet(sec) { const R = run('cd'); if (R.running) return; S.cd = sec; S.runs.cd = newRun('cd'); save(); draw(); },
        step(key, d) {
            const lim = { f: [1, 180], s: [1, 60], l: [1, 90], r: [1, 10] }[key]; S.cfg[key] = clamp(S.cfg[key] + d, lim[0], lim[1]); S.preset = 'cus';
            const R = S.runs.focus; if (!R || !R.running) S.runs.focus = newRun('focus'); save(); sheetSettings(); draw();
        },
        flag(key) { S.cfg[key] = !S.cfg[key]; save(); sheetSettings(); },
        theme(id) { if (!THEME[id]) return; S.theme = id; save(); bg(true); document.querySelectorAll('.tm-th').forEach((b) => b.classList.toggle('on', b.dataset.id === id)); },
        zen() { const s = $('tmScene'); if (s) s.classList.toggle('tm-zen'); },
    };

    // ---------- the page ----------
    const IC = {
        play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4.2" height="14" rx="1.2"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2"/></svg>',
        reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
        skip: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6.5v11a.8.8 0 0 0 1.2.7l8-5.5a.8.8 0 0 0 0-1.3l-8-5.5A.8.8 0 0 0 6 6.5z"/><rect x="16.5" y="5.5" width="2.5" height="13" rx="1"/></svg>',
        back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
        pal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.5-1.9-.3-1 .3-2.1 1.4-2.1H17a4 4 0 0 0 4-4c0-5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15.5" cy="7.5" r="1"/></svg>',
        set: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.4"/><circle cx="8" cy="17" r="2.4"/></svg>',
        eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
        x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
        ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const CIRC = 2 * Math.PI * 92;

    function bg(force) {
        const el = $('tmBg'), sc = $('tmScene'); if (!el || !sc) return;
        const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight, asp = clamp(w / h, 0.42, 2.6), key = S.theme + '|' + asp.toFixed(2);
        if (!force && key === lastBg) return; lastBg = key;
        const th = THEME[S.theme];
        el.innerHTML = paint(th, Math.round(1000 * asp), 1000, false);
        sc.dataset.tone = th.tone;
        if (fx) { fx.stop(); fx = null; }
        const cv = $('tmFx'); if (cv) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); fx = startFx(cv, th.fx, () => sceneOn && !document.hidden); }
    }

    function draw() {
        const sc = $('tmScene'); if (!sc) return;
        const R = run(), sw = R.ph === 'sw', ms = remain(R);
        $('tmTime').textContent = fmtT(ms, sw);
        const prog = sw ? ((ms / 1000) % 60) / 60 : R.total ? 1 - ms / R.total : 0;
        $('tmArc').style.strokeDashoffset = String(CIRC * (1 - clamp(prog, 0, 1)));
        let lab = PH[R.ph] || '';
        if (S.mode === 'focus') lab += ' · الجولة ' + R.round + ' من ' + S.cfg.r;
        if (S.mode === 'cd' && R.left <= 0 && !R.running) lab = 'انتهى الوقت';
        $('tmLab').textContent = lab;
        const chip = $('tmChip'); chip.textContent = (R.running ? '' : 'موقوف · ') + (PH[R.ph] || ''); chip.dataset.run = R.running ? '1' : '0';
        $('tmPlay').innerHTML = R.running ? IC.pause : IC.play; $('tmPlay').setAttribute('aria-label', R.running ? 'إيقاف مؤقت' : 'ابدأ');
        $('tmSkip').style.visibility = S.mode === 'focus' ? 'visible' : 'hidden';
        sc.dataset.ph = R.ph; sc.classList.toggle('tm-run', !!R.running);
        $('tmStats').textContent = 'اليوم: ' + S.stats.n + ' جلسة · ' + S.stats.m + ' دقيقة تركيز';
        document.title = R.running ? fmtT(ms, sw) + ' · ' + (PH[R.ph] || '') : (window.__tmTitle || document.title);
    }

    function build() {
        const root = $('tmContent'); if (!root) return;
        const modes = [['focus', 'تركيز'], ['cd', 'عد تنازلي'], ['sw', 'ساعة توقيت']];
        let row = '';
        if (S.mode === 'focus') row = PRESETS.map((p) => `<button class="tm-pre${S.preset === p.id ? ' on' : ''}" onclick="app.tmPreset('${p.id}')"><b>${esc(p.n)}</b><small>${esc(p.id === 'cus' ? S.cfg.f + ' · ' + S.cfg.s + ' · ' + S.cfg.l : p.d)}</small></button>`).join('');
        else if (S.mode === 'cd') row = [[-300, '−5'], [-60, '−1'], [60, '+1'], [300, '+5']].map((a) => `<button class="tm-pre tm-sm" onclick="app.tmCdAdd(${a[0]})"><b dir="ltr">${a[1]}</b><small>دقيقة</small></button>`).join('') + [5, 10, 15, 25, 45, 60].map((m) => `<button class="tm-pre tm-sm" onclick="app.tmCdSet(${m * 60})"><b>${m}</b><small>دقيقة</small></button>`).join('');
        else row = '<div class="tm-hint">ساعة توقيت تعد من الصفر وتكمل حتى توقفها</div>';
        const wasZen = $('tmScene') && $('tmScene').classList.contains('tm-zen');
        root.innerHTML = `<div class="tm-scene${wasZen ? ' tm-zen' : ''}" id="tmScene" data-tone="${THEME[S.theme].tone}">
            <div class="tm-bg" id="tmBg"></div><canvas class="tm-fx" id="tmFx" aria-hidden="true"></canvas><div class="tm-shade"></div>
            <div class="tm-ui">
                <div class="tm-top">
                    <button class="tm-ic" onclick="app.goBack()" aria-label="رجوع">${IC.back}</button>
                    <span class="tm-chip" id="tmChip" data-run="0"></span>
                    <span class="tm-sp"></span>
                    <button class="tm-ic tm-hide" onclick="app.tmTheme()" aria-label="الخلفيات">${IC.pal}</button>
                    <button class="tm-ic tm-hide" onclick="app.tmSettings()" aria-label="الإعدادات">${IC.set}</button>
                    <button class="tm-ic" onclick="app.tmZen()" aria-label="إخفاء الأزرار">${IC.eye}</button>
                </div>
                <div class="tm-mid">
                    <div class="tm-ring" onclick="app.tmZenIf()">
                        <svg viewBox="0 0 200 200" aria-hidden="true"><circle class="tm-track" cx="100" cy="100" r="92"/><circle class="tm-arc" id="tmArc" cx="100" cy="100" r="92" stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="${CIRC.toFixed(2)}" transform="rotate(-90 100 100)"/></svg>
                        <div class="tm-center"><div class="tm-time" id="tmTime" dir="ltr">00:00</div><div class="tm-lab" id="tmLab"></div></div>
                    </div>
                    <div class="tm-ctl tm-hide">
                        <button class="tm-b" onclick="app.tmReset()" aria-label="إعادة">${IC.reset}</button>
                        <button class="tm-b tm-big" id="tmPlay" onclick="app.tmToggle()"></button>
                        <button class="tm-b" id="tmSkip" onclick="app.tmSkip()" aria-label="تخطي">${IC.skip}</button>
                    </div>
                </div>
                <div class="tm-bot tm-hide">
                    <div class="tm-seg">${modes.map((m) => `<button class="${S.mode === m[0] ? 'on' : ''}" onclick="app.tmMode('${m[0]}')">${m[1]}</button>`).join('')}</div>
                    <div class="tm-row">${row}</div>
                    <div class="tm-stats" id="tmStats"></div>
                </div>
            </div></div>`;
        lastBg = ''; bg(true); draw();
    }

    function sheet(inner, cls) {
        sheetClose();
        const sc = $('tmScene'); if (!sc) return;
        const w = document.createElement('div'); w.className = 'tm-sheetw'; w.id = 'tmSheet';
        w.innerHTML = `<div class="tm-sheet ${cls || ''}" role="dialog">${inner}</div>`;
        w.addEventListener('click', (e) => { if (e.target === w) sheetClose(); });
        sc.appendChild(w); requestAnimationFrame(() => w.classList.add('on'));
    }
    function sheetClose() { const w = $('tmSheet'); if (w) w.remove(); }

    let thCat = 'all', thTok = 0;
    function sheetTheme() {
        const list = THEMES.filter((t) => thCat === 'all' || t.c === thCat);
        sheet(`<div class="tm-sh-h"><b>الخلفيات</b><small>${THEMES.length} خلفية</small><button class="tm-x" onclick="app.tmSheetClose()" aria-label="إغلاق">${IC.x}</button></div>
            <div class="tm-cats">${CATS.map((c) => `<button class="${thCat === c[0] ? 'on' : ''}" onclick="app.tmCat('${c[0]}')">${c[1]}</button>`).join('')}</div>
            <div class="tm-grid" id="tmGrid">${list.map((t) => `<button class="tm-th${S.theme === t.id ? ' on' : ''}" data-id="${t.id}" onclick="app.tmPick('${t.id}')"><span class="tm-thumb"></span><span class="tm-thn">${esc(t.n)}</span><i>${IC.ok}</i></button>`).join('')}</div>`, 'tm-tall');
        const tok = ++thTok, btns = Array.from(document.querySelectorAll('#tmGrid .tm-th'));
        let i = 0;
        const step = () => { if (tok !== thTok) return; for (let k = 0; k < 4 && i < btns.length; k++, i++) { const b = btns[i], th = THEME[b.dataset.id]; b.querySelector('.tm-thumb').innerHTML = paint(th, 480, 300, true); } if (i < btns.length) requestAnimationFrame(step); };
        requestAnimationFrame(step);
    }
    function sheetSettings() {
        const c = S.cfg;
        const st = (key, label, unit) => `<div class="tm-st"><span>${label}</span><div class="tm-stp"><button onclick="app.tmStep('${key}',-1)" aria-label="أنقص">−</button><b>${c[key]}<small>${unit}</small></b><button onclick="app.tmStep('${key}',1)" aria-label="زِد">+</button></div></div>`;
        const sw = (key, label, d) => `<div class="tm-st"><span>${label}<small>${d}</small></span><button class="tm-tg${c[key] ? ' on' : ''}" onclick="app.tmFlag('${key}')" role="switch" aria-checked="${c[key] ? 'true' : 'false'}"><i></i></button></div>`;
        sheet(`<div class="tm-sh-h"><b>إعدادات المؤقت</b><small>تتغير لما تعدل</small><button class="tm-x" onclick="app.tmSheetClose()" aria-label="إغلاق">${IC.x}</button></div>
            <div class="tm-form">${st('f', 'مدة التركيز', 'دقيقة')}${st('s', 'الراحة القصيرة', 'دقيقة')}${st('l', 'الراحة الطويلة', 'دقيقة')}${st('r', 'جولات قبل الراحة الطويلة', 'جولة')}
            ${sw('auto', 'ابدأ المرحلة الجاية تلقائي', 'من تخلص الجولة تبدأ الراحة لحالها')}${sw('sound', 'صوت التنبيه', 'نغمة قصيرة عند نهاية المرحلة')}${sw('vib', 'اهتزاز', 'يهتز الهاتف عند النهاية')}</div>`);
    }

    // ---------- app glue ----------
    Object.assign(app, {
        tmOpen() {
            load(); sceneOn = true; window.__tmTitle = window.__tmTitle || document.title;
            build(); ensureTick();
            this._tmRes = this._tmRes || (() => { let t = 0; const h = () => { clearTimeout(t); t = setTimeout(() => { if (sceneOn) bg(false); }, 140); }; window.addEventListener('resize', h); window.addEventListener('orientationchange', h); document.addEventListener('visibilitychange', () => { if (!document.hidden && sceneOn) { tick(); } }); return h; })();
        },
        tmClose() {
            sceneOn = false; sheetClose(); if (fx) { fx.stop(); fx = null; } wake(false); lastBg = '';
            const c = $('tmContent'); if (c) c.innerHTML = ''; try { document.title = window.__tmTitle || document.title; } catch (e) {}
        },
        tmToggle() { T.toggle(); }, tmReset() { T.reset(); }, tmSkip() { T.skip(); }, tmMode(m) { T.mode(m); },
        tmPreset(id) { T.preset(id); }, tmCdAdd(s) { T.cdAdd(s); }, tmCdSet(s) { T.cdSet(s); },
        tmStep(k, d) { T.step(k, d); }, tmFlag(k) { T.flag(k); }, tmPick(id) { T.theme(id); },
        tmTheme() { sheetTheme(); }, tmSettings() { sheetSettings(); }, tmSheetClose() { sheetClose(); },
        tmCat(c) { thCat = c; sheetTheme(); },
        tmZen() { T.zen(); }, tmZenIf() { const s = $('tmScene'); if (s && s.classList.contains('tm-zen')) s.classList.remove('tm-zen'); },
    });
    window.TimerThemes = { THEMES, paint };
})();
