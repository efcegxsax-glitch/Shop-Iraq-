// "My tree" (شجرتي): a solo focus timer drawn as a realistic 3D scene. Loaded on demand
// (import()) the first time the page opens. The ground is shown cut open at the front, so the
// roots are seen growing through the soil while the tree grows above: seed, split coat and
// root, seed leaves, stem, branches, leaves, flowers, fruit. Everything sways in the wind.
// The app drives it: plant(), grow(0..1) as the session runs, finish(ok).
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

export const SPECIES = {
    pom: { name: 'رمان', leafW: 0.26, leafLen: 0.085, leafRough: 0.5, leafTone: [0.36, 0.55, 0.2], serr: 0, stems: 3, depth: 3, angle: [0.45, 0.75], up: 0.14, droop: 0.02, kids: [3, 4], flower: [0.93, 0.28, 0.12], fruit: [0.55, 0.04, 0.05], fruitR: 0.06, fruitN: 14, cap: 'crown', leafDense: 3 },
    orange: { name: 'برتقال', leafW: 0.42, leafLen: 0.1, leafRough: 0.32, leafTone: [0.16, 0.38, 0.12], serr: 0, stems: 1, depth: 4, angle: [0.6, 0.95], up: 0.1, droop: 0.03, kids: [3, 4], flower: [0.98, 0.97, 0.92], fruit: [0.98, 0.5, 0.05], fruitR: 0.058, fruitN: 16, cap: 'leaf', leafDense: 3 },
    apple: { name: 'تفاح', leafW: 0.46, leafLen: 0.095, leafRough: 0.55, leafTone: [0.3, 0.52, 0.18], serr: 1, stems: 1, depth: 4, angle: [0.75, 1.1], up: 0.05, droop: 0.06, kids: [3, 4], flower: [1, 0.86, 0.9], fruit: [0.8, 0.08, 0.1], fruitR: 0.055, fruitN: 16, cap: 'stalk', leafDense: 3 }
};

// ---------- small helpers ----------
function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
}
function fbm(x, y, o = 5) { let n = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { n += a * vnoise(x * f, y * f); a *= 0.5; f *= 2; } return n; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true, rep) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
}

// ---------- textures, drawn once ----------
// The cut face of the ground: humus, topsoil, a redder subsoil and stony clay at the bottom.
function soilSection() {
    const W = 768, H = 384, c = canvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), bump = canvas(W, H), bg = bump.getContext('2d'), bimg = bg.createImageData(W, H);
    const layers = [[0, [44, 30, 20]], [0.1, [58, 40, 26]], [0.45, [92, 58, 36]], [0.75, [110, 94, 78]], [1, [96, 84, 72]]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = x / W, v = y / H, wob = (fbm(u * 6, v * 2 + 3) - 0.5) * 0.08;
        const vv = clamp01(v + wob);
        let k = 0; while (k < layers.length - 2 && vv > layers[k + 1][0]) k++;
        const t = smooth(layers[k + 1][0] - 0.03, layers[k + 1][0] + 0.03, vv);
        const a = layers[k][1], b = layers[Math.min(k + 1, layers.length - 1)][1];
        const n = fbm(u * 40, v * 20, 4), grain = hash(x, y);
        let s = 0.78 + n * 0.45 + (grain > 0.985 ? 0.35 : grain < 0.02 ? -0.3 : 0);
        const i = (y * W + x) * 4;
        img.data[i] = Math.min(255, lerp(a[0], b[0], t) * s); img.data[i + 1] = Math.min(255, lerp(a[1], b[1], t) * s); img.data[i + 2] = Math.min(255, lerp(a[2], b[2], t) * s); img.data[i + 3] = 255;
        const bb = Math.round(clamp01(0.35 + n * 0.5 + (grain > 0.97 ? 0.3 : 0)) * 255);
        bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = bb; bimg.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); bg.putImageData(bimg, 0, 0);
    // pebbles, more of them lower down
    const r = rng(7);
    for (let i = 0; i < 170; i++) {
        const v = Math.pow(r(), 0.6), x = r() * W, y = (0.2 + v * 0.8) * H, s = (1.5 + r() * 6) * (0.5 + v);
        const col = [100 + r() * 50, 90 + r() * 40, 75 + r() * 35];
        const grd = g.createRadialGradient(x - s * 0.3, y - s * 0.3, s * 0.1, x, y, s);
        grd.addColorStop(0, `rgb(${col.map((q) => Math.min(255, q + 12) | 0)})`); grd.addColorStop(1, `rgb(${col.map((q) => q * 0.6 | 0)})`);
        g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, s, s * (0.6 + r() * 0.3), r() * 3, 0, 7); g.fill();
        bg.fillStyle = '#fff'; bg.beginPath(); bg.ellipse(x, y, s, s * 0.75, 0, 0, 7); bg.fill();
    }
    // fine grass roots in the humus
    g.strokeStyle = 'rgba(200,180,140,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 160; i++) { let x = r() * W, y = 0; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 8; y += 3 + r() * 7; g.lineTo(x, y); } g.stroke(); }
    return { map: tex(c, true, [3, 1]), bump: tex(bump, false, [3, 1]) };
}
function grassGround() {
    const N = 512, c = canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const n = fbm(x / 40, y / 40, 5), m = fbm(x / 6 + 9, y / 6, 3), i = (y * N + x) * 4;
        img.data[i] = 55 + n * 50 + m * 20; img.data[i + 1] = 88 + n * 70 + m * 30; img.data[i + 2] = 30 + n * 25; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c, true, [60, 30]);
}
function barkTex() {
    const W = 128, H = 256, c = canvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = x / W, v = y / H;
        const fis = Math.abs(Math.sin((u + fbm(u * 3, v * 2) * 0.35) * Math.PI * 7));
        const n = fbm(u * 8, v * 24, 4), k = Math.round((0.55 + 0.45 * Math.pow(fis, 0.35) * (0.7 + n * 0.5)) * 255), i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, k); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c, false, [2, 3]);
}
// A leaf pointing up, stalk at the bottom: shape, colour, veins; the alpha cuts the outline.
function leafTex(sp) {
    const W = 256, H = 512, c = canvas(W, H), g = c.getContext('2d'), T = sp.leafTone, hex = (k, a = 0) => `rgb(${T.map((v, i) => Math.round(Math.min(255, v * 255 * k + a * [20, 30, 10][i])))})`;
    const base = 0.1, wMax = sp.leafW * W * 0.5 / 0.5;
    const half = (t) => { if (t < base) return 3; const s = (t - base) / (1 - base); return Math.max(1.5, wMax * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.9) * (sp.serr ? 1 - 0.05 * Math.abs(Math.sin(s * 60)) : 1)); };
    g.beginPath(); g.moveTo(W / 2, H);
    for (let i = 0; i <= 60; i++) { const t = i / 60; g.lineTo(W / 2 + half(t), H - t * H); }
    for (let i = 60; i >= 0; i--) { const t = i / 60; g.lineTo(W / 2 - half(t), H - t * H); }
    g.closePath();
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, hex(0.85)); grd.addColorStop(0.5, hex(1.25, 1)); grd.addColorStop(1, hex(0.8));
    g.fillStyle = grd; g.fill();
    g.save(); g.clip();
    // mottling
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,70,20' : '190,220,140'},0.05)`; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 2 + Math.random() * 8, 0, 7); g.fill(); }
    // veins
    g.strokeStyle = 'rgba(225,240,190,0.75)'; g.lineWidth = 4; g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 6); g.stroke();
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(215,235,175,0.5)';
    for (let k = 0; k < 11; k++) {
        const t = base + (k + 0.6) / 12 * (1 - base) * 0.95, y = H - t * H, w = half(t);
        [-1, 1].forEach((s) => { g.beginPath(); g.moveTo(W / 2, y); g.quadraticCurveTo(W / 2 + s * w * 0.5, y - 14, W / 2 + s * w * 0.92, y - 34); g.stroke(); });
    }
    const edge = g.createRadialGradient(W / 2, H / 2, W * 0.1, W / 2, H / 2, W * 0.7);
    edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(20,40,10,0.35)');
    g.fillStyle = edge; g.fillRect(0, 0, W, H);
    g.restore();
    const t = tex(c, true);
    t.generateMipmaps = true;
    return t;
}
function petalTex() {
    const W = 128, H = 128, c = canvas(W, H), g = c.getContext('2d');
    g.beginPath(); g.moveTo(W / 2, H);
    g.bezierCurveTo(-10, H * 0.55, W * 0.15, -8, W / 2, 6); g.bezierCurveTo(W * 0.85, -8, W + 10, H * 0.55, W / 2, H); g.closePath();
    const grd = g.createLinearGradient(0, H, 0, 0); grd.addColorStop(0, '#d9d0b0'); grd.addColorStop(0.35, '#ffffff'); grd.addColorStop(1, '#f4f1ee');
    g.fillStyle = grd; g.fill();
    g.save(); g.clip(); g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 1;
    for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(W / 2, H); g.quadraticCurveTo(W / 2 + i * 6, H / 2, W / 2 + i * 9, 0); g.stroke(); }
    g.restore();
    return tex(c, true);
}
function cloudTex() {
    const W = 256, H = 128, c = canvas(W, H), g = c.getContext('2d'), r = rng(3);
    for (let i = 0; i < 26; i++) {
        const x = 40 + r() * 176, y = 50 + r() * 40 - Math.abs(x - 128) * 0.12, s = 18 + r() * 30;
        const grd = g.createRadialGradient(x, y, 0, x, y, s); grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, W, H);
    }
    return tex(c, true);
}
function peelTex() {
    const N = 128, c = canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const d = hash(Math.floor(x / 3), Math.floor(y / 3)), n = fbm(x / 10, y / 10, 3), k = Math.round((0.7 + n * 0.25 - (d > 0.8 ? 0.12 : 0)) * 255), i = (y * N + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = k; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c, false, [3, 2]);
}

// ---------- geometry ----------
function leafGeo(sp) {
    const g = new THREE.PlaneGeometry(sp.leafW * 2, 1, 2, 8);
    g.translate(0, 0.5, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        // folded along the midrib and arched back toward the tip
        p.setZ(i, Math.abs(x) * 0.35 - y * y * 0.18);
    }
    g.computeVertexNormals();
    return g;
}
function mergeGeos(list) {
    let n = 0; list.forEach((g) => { n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
    let o = 0;
    list.forEach((g) => {
        const gi = g.index ? g : g.toNonIndexed();
        pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
        if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + o); else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + o);
        o += g.attributes.position.count;
    });
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    m.setIndex(idx);
    return m;
}
function flowerGeo() {
    const parts = [];
    for (let i = 0; i < 5; i++) {
        const p = new THREE.PlaneGeometry(0.5, 0.6, 2, 3);
        p.translate(0, 0.3, 0);
        const a = p.attributes.position;
        for (let k = 0; k < a.count; k++) { const y = a.getY(k), x = a.getX(k); a.setZ(k, y * y * 0.5 - Math.abs(x) * 0.15); }
        p.rotateX(-1.05); p.rotateY(i / 5 * Math.PI * 2);
        p.computeVertexNormals();
        parts.push(p);
    }
    const c = new THREE.SphereGeometry(0.1, 8, 6); c.translate(0, 0.05, 0); parts.push(c);
    return mergeGeos(parts);
}
function fruitGeo(sp) {
    const g = new THREE.SphereGeometry(1, 28, 20), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        if (sp.cap === 'stalk') { const r = Math.hypot(v.x, v.z); if (v.y > 0) v.y -= 0.28 * Math.exp(-r * r * 12); v.y *= 0.92; if (v.y < 0) v.multiplyScalar(1 - 0.06 * -v.y); }
        if (sp.cap === 'leaf') { v.y *= 0.94; }
        if (sp.cap === 'crown') { v.y *= 0.93; v.x *= 1 + 0.03 * Math.sin(Math.atan2(v.z, v.x) * 6); }
        p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
}
function capGeo(sp) {
    if (sp.cap === 'crown') { const g = new THREE.CylinderGeometry(0.34, 0.2, 0.34, 7, 1, true); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, p.getY(i) + 0.08 * Math.cos(a * 7)); } g.translate(0, -0.17, 0); g.rotateX(Math.PI); g.translate(0, -0.9, 0); g.computeVertexNormals(); return g; }
    if (sp.cap === 'stalk') { const g = new THREE.CylinderGeometry(0.04, 0.05, 0.5, 5); g.translate(0, 0.95, 0); g.rotateZ(0.15); return g; }
    const g = new THREE.CircleGeometry(0.22, 6); g.rotateX(-Math.PI / 2); g.translate(0, 0.96, 0); return g;
}

// ---------- the plant: a skeleton of segments with growth windows ----------
// seg: parent index, f (where on the parent it starts, 0..1), base local rotation, length,
// radius, t0..t1 (plant time it grows over), depth, kind 'stem' | 'root'
function buildPlant(spKey, seed) {
    const sp = SPECIES[spKey], R = rng(seed), segs = [], leaves = [], tips = [], up = new THREE.Vector3(0, 1, 0);
    const Y = new THREE.Vector3(0, 1, 0), tmpQ = new THREE.Quaternion();
    const worldQ = [];
    function addSeg(parent, f, dir, len, r, t0, t1, depth, kind) {
        const wq = new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize());
        const pq = parent >= 0 ? worldQ[parent] : new THREE.Quaternion();
        const bq = pq.clone().invert().multiply(wq);
        segs.push({ parent, f, bq, len, r, t0, t1, depth, kind, sway: 0, dir: dir.clone().normalize() });
        worldQ.push(wq);
        return segs.length - 1;
    }
    const perp = (d, phi) => {
        const a = Math.abs(d.y) < 0.9 ? up : new THREE.Vector3(1, 0, 0);
        const u = new THREE.Vector3().crossVectors(d, a).normalize(), v = new THREE.Vector3().crossVectors(d, u).normalize();
        return u.multiplyScalar(Math.cos(phi)).add(v.multiplyScalar(Math.sin(phi)));
    };
    // a branch: n segments bending a little each, leaning up (or down with weight at the tips)
    function branch(parent, f, dir, len, r, t0, t1, depth) {
        const n = depth === 0 ? 6 : depth === 1 ? 5 : 4, sl = len / n, dt = (t1 - t0) / n;
        let d = dir.clone().normalize(), prev = parent, pf = f, list = [];
        for (let i = 0; i < n; i++) {
            const s = addSeg(prev, pf, d, sl, r * Math.pow(0.8, i / n * 1.6), t0 + i * dt, t0 + (i + 1) * dt, depth, 'stem');
            segs[s].sway = (depth + i / n) * 0.9;
            list.push(s);
            prev = s; pf = 1;
            const jitter = new THREE.Vector3((R() - 0.5), (R() - 0.5) * 0.4, (R() - 0.5)).multiplyScalar(depth === 0 ? 0.18 : 0.28);
            d.add(jitter).add(up.clone().multiplyScalar(sp.up)).add(new THREE.Vector3(0, -sp.droop * depth * i / n, 0)).normalize();
            if (depth === 0) d.z = Math.min(d.z, 0.05);
        }
        // leaves along the young wood, children from the upper part
        list.forEach((s, i) => {
            const S = segs[s];
            // the young trunk has leaves too; the lower ones fall as it turns to bark
            const drop = depth === 0 && i < n - 2 ? 0.5 + i * 0.04 + R() * 0.08 : 2;
            for (let k = 0; k < sp.leafDense; k++) leaves.push({ seg: s, f: (k + R()) / sp.leafDense, phi: R() * 6.28, tilt: 0.7 + R() * 0.5, size: sp.leafLen * (0.8 + R() * 0.45), t0: lerp(S.t0, S.t1, 0.4 + R() * 0.6), t2: drop, c: R() });
        });
        const last = list[list.length - 1];
        tips.push({ seg: last, depth });
        for (let k = 0; k < 5; k++) leaves.push({ seg: last, f: 0.85 + R() * 0.15, phi: R() * 6.28, tilt: 0.35 + R() * 0.5, size: sp.leafLen * (0.85 + R() * 0.4), t0: segs[last].t1 - 0.01, c: R() });
        if (depth >= sp.depth) return;
        const nk = sp.kids[0] + Math.floor(R() * (sp.kids[1] - sp.kids[0] + 1));
        for (let k = 0; k < nk; k++) {
            const at = Math.min(n - 1, Math.floor(n * (0.35 + 0.6 * (k + R() * 0.6) / nk))), host = list[at];
            const phi = k * 2.39996 + R() * 0.6, ang = lerp(sp.angle[0], sp.angle[1], R());
            const hd = segs[host].dir, cd = hd.clone().multiplyScalar(Math.cos(ang)).add(perp(hd, phi).multiplyScalar(Math.sin(ang)));
            if (depth === 0) cd.z *= 0.6;
            const b0 = segs[host].t1 + 0.01, span = Math.max(0.08, (0.8 - b0) * (0.55 + R() * 0.35));
            branch(host, 0.5 + R() * 0.5, cd, len * (0.62 + R() * 0.16) * (1 - at / n * 0.3), segs[host].r * 0.62, b0, Math.min(0.84, b0 + span), depth + 1);
        }
    }
    // the shoot climbs from the seed to the surface first
    const hyp = addSeg(-2, 0, new THREE.Vector3(0, 1, 0), 0.1, 0.011, 0.05, 0.09, 0, 'stem');
    const trunkLen = 0.75;
    for (let s = 0; s < sp.stems; s++) {
        const a = sp.stems > 1 ? (s / sp.stems) * 6.28 + 0.4 : 0, lean = sp.stems > 1 ? 0.28 : 0.04;
        const d = new THREE.Vector3(Math.sin(a) * lean, 1, Math.cos(a) * lean * 0.5 - 0.03);
        branch(hyp, 1, d, trunkLen * (sp.stems > 1 ? 0.8 + s * 0.08 : 1), sp.stems > 1 ? 0.03 : 0.045, 0.09 + s * 0.05, 0.5 + s * 0.03, 0);
    }
    // roots, lying on the cut face of the soil
    const rootStart = segs.length;
    function root(parent, f, dir, len, r, t0, t1, n, level) {
        let d = dir.clone().normalize(), prev = parent, pf = f; const sl = len / n, dt = (t1 - t0) / n, list = [];
        for (let i = 0; i < n; i++) {
            const s = addSeg(prev, pf, d, sl, r * Math.pow(0.55, i / n), t0 + i * dt, t0 + (i + 1) * dt, level, 'root');
            list.push(s); prev = s; pf = 1;
            d.x += (R() - 0.5) * 0.7; d.y += level === 0 ? -0.15 : -0.06; d.z = 0; d.normalize();
        }
        return list;
    }
    const main = root(-2, 0, new THREE.Vector3(0.05, -1, 0), 1.0, 0.009, 0.03, 0.62, 14, 0);
    main.forEach((s, i) => {
        if (i < 1 || i > 12) return;
        const side = i % 2 ? 1 : -1, S = segs[s];
        const lat = root(s, 0.6, new THREE.Vector3(side, -0.35 - R() * 0.3, 0), (0.55 - i * 0.03) * (0.8 + R() * 0.4), 0.0045, S.t1, Math.min(0.9, S.t1 + 0.3 + R() * 0.15), 7, 1);
        lat.forEach((l, j) => {
            if (j < 1 || j > 6 || R() < 0.25) return;
            const L = segs[l];
            root(l, 0.5, new THREE.Vector3(side * (0.3 + R()), -1, 0), 0.08 + R() * 0.12, 0.0022, L.t1, Math.min(0.95, L.t1 + 0.18), 4, 2);
        });
    });
    // normalise the height so the grown tree stands about 1.75 tall
    const H = measure(segs);
    const k = 1.75 / Math.max(0.5, H);
    for (let i = 0; i < rootStart; i++) segs[i].len *= k;
    // flowers and fruit at the tips of the outer branches (not all of them)
    const outer = tips.filter((t) => t.depth >= Math.max(1, sp.depth - 1));
    const flowers = [];
    outer.forEach((t) => { if (R() < 0.8) flowers.push({ seg: t.seg, f: 0.9, fruit: flowers.filter((x) => x.fruit).length < sp.fruitN && R() < 0.85, phi: R() * 6.28, d: R() }); });
    leaves.forEach((l) => { l.size *= Math.min(1.25, k); });
    return { sp, segs, leaves, flowers, rootStart, coty: hyp + 1 };
}
function measure(segs) {
    // grown height of the stems, following the rest directions
    const top = []; let max = 0;
    segs.forEach((s, i) => {
        if (s.kind !== 'stem') return;
        const base = s.parent >= 0 ? top[s.parent].clone().lerp(top[s.parent].base, 1 - s.f) : new THREE.Vector3(0, -0.1, 0);
        const end = base.clone().add(s.dir.clone().multiplyScalar(s.len)); end.base = base;
        top[i] = end; max = Math.max(max, end.y);
    });
    return max;
}

// ---------- the scene ----------
export class Garden {
    constructor(root) {
        this.root = root;
        const R = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
        R.toneMapping = THREE.NeutralToneMapping; R.toneMappingExposure = 1.0;
        R.outputColorSpace = THREE.SRGBColorSpace;
        root.appendChild(R.domElement);
        const S = this.scene = new THREE.Scene();
        const pm = new THREE.PMREMGenerator(R);
        S.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
        S.environmentIntensity = 0.35;
        const C = this.camera = new THREE.PerspectiveCamera(40, 1, 0.02, 300);
        C.position.set(0.5, 0.35, 2.2);
        this.controls = new OrbitControls(C, R.domElement);
        Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 1.2, maxDistance: 9, minPolarAngle: 0.9, maxPolarAngle: 1.62, minAzimuthAngle: -0.75, maxAzimuthAngle: 0.75, rotateSpeed: 0.6 });
        this.controls.addEventListener('start', () => { this.userAt = performance.now(); });
        this.controls.target.set(0, -0.1, 0);
        this.g = 0; this.shown = 0; this.t = 0; this.wind = 0; this.state = 'idle';
        this._world();
        this._sky();
        this.setSpecies('pom', 1);
        this.resize();
        this._ro = new ResizeObserver(() => this.resize());
        this._ro.observe(root);
        this.clock = new THREE.Clock();
    }

    _world() {
        const S = this.scene;
        this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a4a30, 0.9); S.add(this.hemi);
        const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
        sun.position.set(3, 6, 4); sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        Object.assign(sun.shadow.camera, { left: -2.2, right: 2.2, top: 3, bottom: -1.6, near: 0.5, far: 20 });
        sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
        S.add(sun); S.add(sun.target);
        // ground behind the cut, and the cut face itself
        const gt = grassGround();
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 80), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.95 }));
        ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -40); ground.receiveShadow = true; S.add(ground);
        const ss = soilSection();
        const face = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.5), new THREE.MeshStandardMaterial({ map: ss.map, bumpMap: ss.bump, bumpScale: 2.2, roughness: 1 }));
        face.position.set(0, -0.75, 0); face.receiveShadow = true; S.add(face);
        // deeper down: more of the stony bottom layer, so no sky shows under the cut
        const deepMap = ss.map.clone(), deepBump = ss.bump.clone();
        [deepMap, deepBump].forEach((t) => { t.repeat.set(3, 0.2); t.offset.set(0, 0); t.needsUpdate = true; });
        const deep = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshStandardMaterial({ map: deepMap, bumpMap: deepBump, bumpScale: 2.2, roughness: 1, color: 0xd8d2cc }));
        deep.position.set(0, -4.5, 0); S.add(deep);
        // a lip of turf along the top edge of the cut
        const lip = new THREE.Mesh(new THREE.BoxGeometry(12, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0x3f5e22, roughness: 1 }));
        lip.position.set(0, -0.012, -0.025); lip.receiveShadow = true; S.add(lip);
        // the planting spot: loose dark soil
        const spot = new THREE.Mesh(new THREE.CircleGeometry(0.32, 40, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 1, bumpMap: ss.bump, bumpScale: 1.5 }));
        spot.rotation.x = -Math.PI / 2; spot.rotation.z = Math.PI; spot.position.set(0, 0.003, 0); spot.receiveShadow = true; S.add(spot);
        // grass blades that bend with the wind (in the vertex shader)
        const blade = new THREE.PlaneGeometry(0.009, 0.075, 1, 3); blade.translate(0, 0.0375, 0);
        const bp = blade.attributes.position;
        for (let i = 0; i < bp.count; i++) { const y = bp.getY(i) / 0.075; bp.setX(i, bp.getX(i) * (1 - y * 0.9)); bp.setZ(i, y * y * 0.012); }
        blade.computeVertexNormals();
        const gm = new THREE.MeshStandardMaterial({ color: 0x6f9a3a, roughness: 0.8, side: THREE.DoubleSide });
        this.grassU = { uTime: { value: 0 }, uWind: { value: 0 } };
        gm.onBeforeCompile = (sh) => {
            sh.uniforms.uTime = this.grassU.uTime; sh.uniforms.uWind = this.grassU.uWind;
            sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
                vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                float h = position.y / 0.075;
                float w = sin(uTime * 1.7 + ip.x * 1.3 + ip.z * 0.7) * 0.5 + 0.5;
                transformed.x += h * h * (0.01 + 0.035 * uWind * w);
                transformed.z += h * h * 0.01 * sin(uTime * 2.3 + ip.x * 3.0);`);
        };
        const N = 5200, grass = new THREE.InstancedMesh(blade, gm, N), m = new THREE.Matrix4(), q = new THREE.Quaternion(), r = rng(11), col = new THREE.Color();
        for (let i = 0; i < N; i++) {
            const z = -Math.pow(r(), 1.8) * 6 - 0.03, x = (r() - 0.5) * 10;
            if (Math.hypot(x, z) < 0.34) { i--; continue; }
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
            const s = 0.55 + r() * 0.8;
            m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.7 + r() * 0.8), s));
            grass.setMatrixAt(i, m);
            grass.setColorAt(i, col.setHSL(0.22 + r() * 0.07, 0.4 + r() * 0.2, 0.22 + r() * 0.2));
        }
        grass.receiveShadow = true;
        S.add(grass);
        // far hills
        const hm = new THREE.MeshStandardMaterial({ color: 0x5d7f48, roughness: 1 });
        [[-30, -60, 26, 5], [18, -70, 30, 7], [48, -55, 22, 4], [-60, -50, 20, 4]].forEach(([x, z, w, h]) => { const m2 = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), hm); m2.scale.set(w, h, 10); m2.position.set(x, -h * 0.35, z); S.add(m2); });
        // motes in the sunlight
        const pg = new THREE.BufferGeometry(), pp = new Float32Array(90 * 3);
        for (let i = 0; i < 90; i++) { pp[i * 3] = (r() - 0.5) * 3; pp[i * 3 + 1] = r() * 2.2; pp[i * 3 + 2] = (r() - 0.5) * 2 - 0.4; }
        pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
        this.motes = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xfff6d8, size: 0.012, transparent: true, opacity: 0.55, depthWrite: false }));
        S.add(this.motes);
        // shared materials for the plant
        const bt = barkTex();
        this.barkMat = new THREE.MeshStandardMaterial({ map: bt, bumpMap: bt, bumpScale: 3, roughness: 0.92 });
        this.rootMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, bumpMap: bt, bumpScale: 1 });
        this.petalMat = new THREE.MeshStandardMaterial({ map: petalTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 });
        this.cylGeo = new THREE.CylinderGeometry(0.94, 1, 1, 10, 1, true); this.cylGeo.translate(0, 0.5, 0);
        this.jointGeo = new THREE.SphereGeometry(1, 10, 8);
    }

    _sky() {
        const S = this.scene;
        this.skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0.3, 0.5, -1).normalize() }, sunCol: { value: new THREE.Color() } };
        const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({
            side: THREE.BackSide, depthWrite: false, uniforms: this.skyU,
            vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vD;
                void main(){ float h = vD.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(mid, bot, clamp(-h*4.0,0.0,1.0));
                float s = max(dot(normalize(vD), sunDir), 0.0); c += sunCol * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.25);
                gl_FragColor = vec4(c, 1.0); }`
        }));
        S.add(sky);
        S.fog = new THREE.Fog(0xcfe0ee, 18, 110);
        const ct = cloudTex(), r = rng(5);
        this.clouds = [];
        for (let i = 0; i < 9; i++) {
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
            const s = 18 + r() * 22; sp.scale.set(s, s * 0.45, 1);
            sp.position.set((r() - 0.5) * 160, 16 + r() * 18, -70 - r() * 50);
            sp.userData.v = 0.4 + r() * 0.8;
            S.add(sp); this.clouds.push(sp);
        }
        const sg = new THREE.BufferGeometry(), sp = new Float32Array(500 * 3);
        for (let i = 0; i < 500; i++) { const a = r() * 6.28, b = r() * 1.3 + 0.1, d = 180; sp[i * 3] = Math.cos(a) * Math.cos(b) * d; sp[i * 3 + 1] = Math.sin(b) * d; sp[i * 3 + 2] = Math.sin(a) * Math.cos(b) * d; }
        sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
        this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
        S.add(this.stars);
        this.setDaytime(new Date());
    }

    // sky, sun and fog by the student's real clock
    setDaytime(d) {
        const h = d.getHours() + d.getMinutes() / 60;
        const day = smooth(5.5, 7.5, h) * (1 - smooth(17.5, 19.3, h)), dusk = Math.max(Math.exp(-Math.pow((h - 18.2) / 0.9, 2)), Math.exp(-Math.pow((h - 6.2) / 0.8, 2)));
        const U = this.skyU, c = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
        U.top.value.copy(c(0x0b1430, 0x3d7fd6, day).lerp(new THREE.Color(0x2a3d78), dusk * 0.4));
        U.mid.value.copy(c(0x1c2748, 0xbfd9ef, day).lerp(new THREE.Color(0xf2a765), dusk * 0.8));
        U.bot.value.copy(c(0x0e1422, 0x9fb7c8, day));
        const el = lerp(-0.2, 1, day) * 0.9 + dusk * 0.15, az = (h / 24) * 6.28;
        const dir = new THREE.Vector3(Math.sin(az) * 0.8, Math.max(0.06, el), -0.9).normalize();
        U.sunDir.value.copy(dir);
        U.sunCol.value.copy(c(0x8899cc, 0xfff0d0, day).lerp(new THREE.Color(0xff9a50), dusk * 0.7)).multiplyScalar(day > 0.05 ? 1 : 0.25);
        this.sun.position.copy(dir.clone().multiplyScalar(8)).add(new THREE.Vector3(1.5, 0, 3));
        this.sun.color.copy(U.sunCol.value).lerp(new THREE.Color(0xffffff), 0.3);
        this.sun.intensity = lerp(0.18, 2.6, day) + dusk * 0.4;
        this.hemi.intensity = lerp(0.14, 0.95, day) + dusk * 0.1;
        this.scene.environmentIntensity = lerp(0.06, 0.35, day);
        this.hemi.color.copy(c(0x5566aa, 0xcfe6ff, day));
        this.scene.fog.color.copy(U.mid.value);
        this.stars.material.opacity = (1 - day) * (1 - dusk) * 0.9;
        this.clouds.forEach((cl) => { cl.material.color.copy(c(0x3a4466, 0xffffff, day).lerp(new THREE.Color(0xffc49a), dusk * 0.6)); });
        this.renderer.toneMappingExposure = lerp(0.75, 1.0, day);
    }

    setSpecies(key, seed) {
        if (this.plantObj) { this.scene.remove(this.plantObj); this.plantObj.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); }
        this.spKey = key;
        const P = this.P = buildPlant(key, seed || 1), sp = P.sp;
        const grp = this.plantObj = new THREE.Group();
        const nStem = P.rootStart, nRoot = P.segs.length - P.rootStart;
        const mk = (geo, mat, n, shadow) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.castShadow = !!shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; grp.add(m); return m; };
        this.mBark = mk(this.cylGeo, this.barkMat, nStem, true);
        this.mJoint = mk(this.jointGeo, this.barkMat, nStem, true);
        this.mRoot = mk(this.cylGeo, this.rootMat, nRoot);
        this.mRootJ = mk(this.jointGeo, this.rootMat, nRoot);
        this.leafMat = new THREE.MeshStandardMaterial({ map: leafTex(sp), alphaTest: 0.45, side: THREE.DoubleSide, roughness: sp.leafRough, metalness: 0 });
        this.mLeaf = mk(leafGeo(sp), this.leafMat, P.leaves.length + 2, true);
        this.mFlower = mk(flowerGeo(), this.petalMat, P.flowers.length, true);
        const fmat = new THREE.MeshPhysicalMaterial({ roughness: sp.cap === 'stalk' ? 0.28 : 0.45, clearcoat: sp.cap === 'stalk' ? 0.7 : 0.25, clearcoatRoughness: 0.35, bumpMap: sp.cap === 'leaf' ? peelTex() : null, bumpScale: 1.2 });
        this.mFruit = mk(fruitGeo(sp), fmat, P.flowers.length, true);
        this.mCap = mk(capGeo(sp), new THREE.MeshStandardMaterial({ color: sp.cap === 'crown' ? 0x8a2a1c : 0x4a5a22, roughness: 0.8, side: THREE.DoubleSide }), P.flowers.length);
        // the seed: two halves of its coat
        const seedMat = new THREE.MeshStandardMaterial({ color: key === 'pom' ? 0xd8b48a : key === 'orange' ? 0xe8dcc0 : 0x5a3a22, roughness: 0.55 });
        const half = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI);
        this.seedA = new THREE.Mesh(half, seedMat); this.seedB = new THREE.Mesh(half, seedMat); this.seedB.rotation.y = Math.PI;
        this.seed = new THREE.Group(); this.seed.add(this.seedA, this.seedB); this.seed.scale.set(0.02, 0.03, 0.02);
        this.seed.rotation.z = 0.4; this.seedA.castShadow = true;
        grp.add(this.seed);
        this.seedHome = new THREE.Vector3(0, -0.11, 0.006);
        this.seed.position.copy(this.seedHome);
        // cotyledons: two round seed leaves on the new shoot
        const cg = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); cg.scale(1, 0.18, 0.6); cg.translate(1, 0, 0);
        this.coty = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0x86b04a, roughness: 0.6, side: THREE.DoubleSide }), 2);
        this.coty.castShadow = true; this.coty.frustumCulled = false; grp.add(this.coty);
        // world transforms, recomputed each frame
        this.wq = P.segs.map(() => new THREE.Quaternion()); this.wp = P.segs.map(() => new THREE.Vector3()); this.cl = new Float32Array(P.segs.length); this.cr = new Float32Array(P.segs.length);
        this.leafDead = null;
        this.scene.add(grp);
        this._layout(this.shown, 0);
    }

    // ---------- driving it ----------
    plant() { this.state = 'drop'; this.dropAt = this.t; this.g = 0; this.shown = 0; this.dead = null; this.won = null; }
    grow(g) { if (this.state === 'idle') this.state = 'grow'; if (!this.dead) this.g = clamp01(g); }
    finish(ok) {
        if (ok) { this.g = 1; this.won = this.t; }
        else { this.dead = this.t; this.leafDead = this.P.leaves.map(() => ({ fall: Math.random() * 1.5, dx: (Math.random() - 0.5) * 0.6, dz: Math.random() * 0.4 })); }
    }
    reset(key, seed) { this.state = 'idle'; this.g = 0; this.shown = 0; this.dead = null; this.won = null; this.setSpecies(key || this.spKey, seed); }
    stageName() {
        const g = this.shown;
        return g < 0.03 ? 'بذرة' : g < 0.1 ? 'تنبت' : g < 0.25 ? 'بادرة' : g < 0.5 ? 'شتلة' : g < 0.7 ? 'شجيرة' : g < 0.84 ? 'تزهر' : g < 1 ? 'تثمر' : 'أثمرت';
    }

    start(active) {
        this.active = active;
        if (this._raf) return;
        const loop = () => {
            this._raf = requestAnimationFrame(loop);
            if (this.active && !this.active()) return;
            this._frame();
        };
        loop();
    }
    stop() { cancelAnimationFrame(this._raf); this._raf = 0; }
    resize() {
        const w = this.root.clientWidth || 1, h = this.root.clientHeight || 1;
        this.renderer.setSize(w, h, false);
        this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
        this.camera.aspect = w / (h - (this.inset || 0) * 0.6);
        // centre the picture in the space above the card at the bottom
        const d = Math.round((this.inset || 0) * 0.6);
        if (d > 0) this.camera.setViewOffset(w, h + d, 0, d, w, h); else this.camera.clearViewOffset();
        this.camera.updateProjectionMatrix();
    }
    // how many pixels at the bottom are covered by the page's card
    setInset(px) { px = Math.max(0, Math.round(px || 0)); if (px === this.inset) return; this.inset = px; this.resize(); }
    dispose() { this.stop(); this._ro.disconnect(); this.renderer.dispose(); this.renderer.domElement.remove(); }

    _frame() {
        const dt = Math.min(0.05, this.clock.getDelta());
        this.t += dt;
        const t = this.t;
        // growth eases toward the session's progress, so it looks continuous
        if (!this.dead) this.shown += (this.g - this.shown) * Math.min(1, dt * 1.5);
        // wind: a slow breeze with gusts
        const gust = Math.max(0, Math.sin(t * 0.23) * Math.sin(t * 0.61 + 1) ) * 1.2;
        this.wind = 0.35 + 0.25 * Math.sin(t * 0.4) + gust;
        this.grassU.uTime.value = t; this.grassU.uWind.value = this.wind;
        this.clouds.forEach((c) => { c.position.x += c.userData.v * dt; if (c.position.x > 90) c.position.x = -90; });
        const mp = this.motes.geometry.attributes.position;
        for (let i = 0; i < mp.count; i++) { let y = mp.getY(i) + dt * 0.03, x = mp.getX(i) + dt * 0.05 * this.wind; if (y > 2.3) y = 0.05; if (x > 1.6) x = -1.6; mp.setY(i, y); mp.setX(i, x); }
        mp.needsUpdate = true;
        this._layout(this.shown, t);
        this._camera(dt);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    // straight to where the camera wants to be (after a resize, or for tests)
    snap() { this.userAt = 0; for (let i = 0; i < 60; i++) this._camera(0.2); this.controls.update(); }

    // camera follows the plant: close on the seed first, wider as the tree grows
    _camera(dt) {
        if (this.userAt && performance.now() - this.userAt < 9000) return;
        const g = this.state === 'idle' ? 0 : this.shown;
        const narrow = Math.max(1, 0.8 / Math.max(0.3, this.camera.aspect)), ty = lerp(-0.2, 0.7, smooth(0.05, 0.75, g)), dist = lerp(1.9, 4.4, smooth(0.04, 0.8, g)) * lerp(1, narrow, smooth(0.1, 0.6, g));
        const tgt = this.controls.target, cam = this.camera.position;
        tgt.y += (ty - tgt.y) * dt * 0.8;
        const off = cam.clone().sub(tgt), len = off.length();
        off.multiplyScalar(lerp(len, dist, dt * 0.8) / len);
        cam.copy(tgt).add(off);
    }

    _layout(g, t) {
        const P = this.P, sp = P.sp, segs = P.segs, m = new THREE.Matrix4(), sv = new THREE.Vector3(), q = new THREE.Quaternion(), col = new THREE.Color();
        const Y = new THREE.Vector3(0, 1, 0), ZA = new THREE.Vector3(0, 0, 1), XA = new THREE.Vector3(1, 0, 0);
        const dead = this.dead != null ? clamp01((t - this.dead) / 2.5) : 0;
        const base = new THREE.Vector3(0, -0.005, 0.012), seedP = this.seedHome;
        // the seed drops in, then swells and splits
        if (this.state === 'drop') {
            const k = clamp01((t - this.dropAt) / 1.3), fall = k < 0.55 ? k / 0.55 : 1;
            this.seed.position.set(0, lerp(0.7, 0.01, fall * fall) - (k > 0.55 ? (k - 0.55) / 0.45 * 0.12 : 0), 0.006);
            if (k >= 1) this.state = 'grow';
        } else if (this.state !== 'idle') this.seed.position.copy(seedP);
        else this.seed.position.set(0, 0.16 + Math.sin(t * 1.5) * 0.015, 0.006);
        const swell = 1 + 0.18 * smooth(0, 0.03, g), open = smooth(0.03, 0.08, g) * 0.55, shrink = Math.max(0.0001, 1 - smooth(0.14, 0.3, g));
        this.seed.scale.set(0.02 * swell * shrink, 0.03 * swell * shrink, 0.02 * swell * shrink);
        this.seedA.rotation.z = open; this.seedB.rotation.z = -open;
        // stems and roots
        let nb = 0, nj = 0, nr = 0, nrj = 0;
        const barkYoung = new THREE.Color(0x7c9a4a), barkOld = new THREE.Color(sp.cap === 'stalk' ? 0x5e4a3c : sp.cap === 'leaf' ? 0x6a5a44 : 0x6e5238), rootC = new THREE.Color(0xe6d6b4), rootOld = new THREE.Color(0x9a7a50);
        for (let i = 0; i < segs.length; i++) {
            const s = segs[i], grow = clamp01((g - s.t0) / (s.t1 - s.t0));
            this.cl[i] = s.len * grow;
            const thick = s.kind === 'stem' ? 0.22 + 0.78 * smooth(s.t0, Math.min(1, s.t0 + 0.55), g) : 0.5 + 0.5 * smooth(s.t0, s.t0 + 0.3, g);
            this.cr[i] = s.r * thick;
            // where it starts
            let pq, pp;
            if (s.parent === -1) { pq = new THREE.Quaternion(); pp = base; }
            else if (s.parent === -2) { pq = new THREE.Quaternion(); pp = seedP; }
            else { pq = this.wq[s.parent]; pp = sv.copy(Y).applyQuaternion(pq).multiplyScalar(this.cl[s.parent] * s.f).add(this.wp[s.parent]); }
            this.wp[i].copy(pp);
            const w = this.wq[i].copy(pq).multiply(s.bq);
            if (s.kind === 'stem' && t) {
                // sway: a world-space tilt, bigger for thin outer wood, cumulative up the tree
                const a = (0.006 + 0.012 * s.sway) * this.wind * (0.6 + 0.4 * Math.sin(t * (1.6 + s.depth * 0.7) + i * 0.37)) * (1 - dead);
                const tw = 0.004 * s.sway * Math.sin(t * 2.1 + i);
                q.setFromAxisAngle(ZA, -a).multiply(new THREE.Quaternion().setFromAxisAngle(XA, tw));
                w.premultiply(q);
                if (dead) w.premultiply(new THREE.Quaternion().setFromAxisAngle(ZA, -dead * 0.05 * s.depth));
            }
            if (grow <= 0 || this.cl[i] < 1e-4) continue;
            const r = this.cr[i];
            m.compose(this.wp[i], w, new THREE.Vector3(r, this.cl[i], r));
            if (s.kind === 'stem') {
                // the stem is still green before it grows bark
                if (s.t1 > g + 0.001 && i === 0 && g < 0.1) { /* underground bit */ }
                col.copy(barkYoung).lerp(barkOld, smooth(s.t0, s.t0 + 0.5, g));
                if (dead) col.lerp(new THREE.Color(0x4a3a2a), dead);
                this.mBark.setMatrixAt(nb, m); this.mBark.setColorAt(nb++, col);
                m.compose(this.wp[i], w, new THREE.Vector3(r * 0.97, r * 0.97, r * 0.97));
                this.mJoint.setMatrixAt(nj, m); this.mJoint.setColorAt(nj++, col);
            } else {
                col.copy(rootC).lerp(rootOld, smooth(s.t1, s.t1 + 0.4, g));
                this.mRoot.setMatrixAt(nr, m); this.mRoot.setColorAt(nr++, col);
                m.compose(this.wp[i], w, new THREE.Vector3(r, r, r));
                this.mRootJ.setMatrixAt(nrj, m); this.mRootJ.setColorAt(nrj++, col);
            }
        }
        this.mBark.count = nb; this.mJoint.count = nj; this.mRoot.count = nr; this.mRootJ.count = nrj;
        // seed leaves on top of the first stem, dropping off as true leaves take over
        const c0 = P.coty, top = sv.copy(Y).applyQuaternion(this.wq[c0]).multiplyScalar(this.cl[c0]).add(this.wp[c0]);
        const cs = smooth(0.09, 0.15, g) * (1 - smooth(0.28, 0.36, g)) * 0.035;
        for (let k = 0; k < 2; k++) {
            q.setFromAxisAngle(Y, k * Math.PI + 0.3).multiply(new THREE.Quaternion().setFromAxisAngle(ZA, 0.35 + 0.05 * Math.sin(t * 2 + k)));
            m.compose(top, q, new THREE.Vector3(cs, cs, cs)); this.coty.setMatrixAt(k, m);
        }
        this.coty.count = cs > 0.0005 ? 2 : 0;
        this.coty.instanceMatrix.needsUpdate = true;
        // leaves
        let nl = 0;
        const lt = sp.leafTone, young = new THREE.Color(), leafOld = new THREE.Color(), deadC = new THREE.Color(0x8a6a2a);
        for (let i = 0; i < P.leaves.length; i++) {
            const L = P.leaves[i], S = segs[L.seg];
            const ls = smooth(L.t0, L.t0 + 0.05, g) * (L.t2 ? 1 - smooth(L.t2, L.t2 + 0.06, g) : 1);
            if (ls <= 0.001 || this.cl[L.seg] <= 0) continue;
            const pos = sv.copy(Y).applyQuaternion(this.wq[L.seg]).multiplyScalar(this.cl[L.seg] * L.f).add(this.wp[L.seg]);
            q.copy(this.wq[L.seg]).multiply(new THREE.Quaternion().setFromAxisAngle(Y, L.phi)).multiply(new THREE.Quaternion().setFromAxisAngle(XA, L.tilt + (dead ? dead * 0.9 : 0)));
            // flutter
            q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, 0.18 * this.wind * Math.sin(t * 5.3 + i * 1.7))).multiply(new THREE.Quaternion().setFromAxisAngle(XA, 0.08 * this.wind * Math.sin(t * 4.1 + i)));
            if (dead && this.leafDead) {
                const d = this.leafDead[i], f = clamp01(dead * 2 - d.fall * 0.6);
                if (f > 0) { pos.y = lerp(pos.y, 0.01, f * f); pos.x += d.dx * f; pos.z += d.dz * f * 0.5; q.multiply(new THREE.Quaternion().setFromAxisAngle(ZA, f * 2)); }
            }
            const sz = L.size * ls;
            m.compose(pos, q, new THREE.Vector3(sz, sz, sz));
            this.mLeaf.setMatrixAt(nl, m);
            young.setRGB(1.35, 1.4, 0.9);
            leafOld.setRGB(0.8 + L.c * 0.35, 0.85 + L.c * 0.3, 0.8 + L.c * 0.25);
            col.copy(young).lerp(leafOld, smooth(L.t0 + 0.02, L.t0 + 0.14, g));
            if (dead) col.lerp(deadC, dead);
            this.mLeaf.setColorAt(nl++, col);
        }
        this.mLeaf.count = nl;
        // flowers, then fruit where a flower was
        let nf = 0, nfr = 0;
        const fl = new THREE.Color(...sp.flower), ripe = new THREE.Color(...sp.fruit), unripe = new THREE.Color(0.38, 0.55, 0.16);
        const glow = this.won != null ? 0.15 + 0.15 * Math.sin((t - this.won) * 4) : 0;
        P.flowers.forEach((F, i) => {
            if (this.cl[F.seg] <= 0) return;
            const at = sv.copy(Y).applyQuaternion(this.wq[F.seg]).multiplyScalar(this.cl[F.seg] * F.f).add(this.wp[F.seg]);
            const bloom = smooth(0.7 + F.d * 0.05, 0.78 + F.d * 0.05, g) * (1 - (F.fruit ? smooth(0.86, 0.9, g) : smooth(0.93, 0.98, g))) * (1 - dead);
            if (bloom > 0.01) {
                const s = (sp.cap === 'crown' ? 0.055 : 0.075) * bloom;
                q.copy(this.wq[F.seg]).multiply(new THREE.Quaternion().setFromAxisAngle(XA, 0.6 + 0.2 * Math.sin(F.phi)));
                m.compose(at, q, new THREE.Vector3(s, s, s));
                this.mFlower.setMatrixAt(nf, m); this.mFlower.setColorAt(nf++, fl);
            }
            if (!F.fruit) return;
            const fg = smooth(0.84, 0.99, g);
            if (fg <= 0.01) return;
            const fr = sp.fruitR * (0.25 + 0.75 * fg);
            // it hangs below its twig, swinging a little
            const hang = at.clone().add(new THREE.Vector3(0.02 * Math.sin(t * 1.3 + i) * this.wind, -fr * 1.15, 0));
            let dropY = 0;
            if (dead) dropY = Math.min(hang.y - fr, dead * dead * 2);
            hang.y -= dropY;
            q.setFromAxisAngle(ZA, 0.15 * Math.sin(t * 1.3 + i) * this.wind);
            if (sp.cap === 'crown') q.multiply(new THREE.Quaternion().setFromAxisAngle(XA, -1.3 + F.d * 0.5));
            m.compose(hang, q, new THREE.Vector3(fr, fr, fr));
            this.mFruit.setMatrixAt(nfr, m); this.mCap.setMatrixAt(nfr, m);
            col.copy(unripe).lerp(ripe, smooth(0.9, 1, g) * (0.85 + 0.15 * F.d));
            if (glow) col.multiplyScalar(1 + glow);
            if (dead) col.lerp(new THREE.Color(0x5a4020), dead * 0.7);
            this.mFruit.setColorAt(nfr++, col);
        });
        this.mFlower.count = nf; this.mFruit.count = nfr; this.mCap.count = nfr;
        [this.mBark, this.mJoint, this.mRoot, this.mRootJ, this.mLeaf, this.mFlower, this.mFruit, this.mCap].forEach((o) => {
            o.instanceMatrix.needsUpdate = true;
            if (o.instanceColor) o.instanceColor.needsUpdate = true;
        });
    }
}
