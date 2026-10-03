// غرفتنا: the shared 3D study room. A cosy room with a window that follows the real time of day, desks, lamps,
// a bookshelf, and cute anime-style characters drawn in 3D (toon shading and outlines). Each student picks one;
// they study, rest, get annoyed when poked and happy when petted, and the whole room shakes (papers fly) when
// somebody shakes the phone. Loaded on demand (import()) by js/sroom.js, which drives it.
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

// ---------- the cast: 11 characters; the more a student studies, the more of them open up ----------
// unlock = minutes of study in the room
export const CHARS = [
    { id: 'lulu', n: 'لولو', g: 'f', unlock: 0, hair: 'long', hc: '#EBD3A4', hs: '#F7E8C8', skin: '#FFE7DA', eye: '#5C6BFF', top: '#F6C9D6', topD: '#E7A7BB', bot: '#FFF3F0', ears: 'dog', earC: '#E3C48C', acc: 'bow', accC: '#F08CA8', wink: true, about: 'بنت خجولة ودودة' },
    { id: 'rio', n: 'ريو', g: 'm', unlock: 0, hair: 'spiky', hc: '#6B4A33', hs: '#8A6444', skin: '#FFE0CC', eye: '#2E8B6E', top: '#4A7FD6', topD: '#3563B3', bot: '#33436B', ears: '', acc: 'headphones', accC: '#F4F1EA', about: 'ولد نشيط وهادي' },
    { id: 'mimi', n: 'ميمي', g: 'f', unlock: 15, hair: 'twin', hc: '#F5A3C7', hs: '#FFC9E0', skin: '#FFE7DA', eye: '#E0589D', top: '#FFFFFF', topD: '#E9E4EF', bot: '#F5A3C7', ears: 'cat', earC: '#F5A3C7', acc: 'band', accC: '#FFFFFF', about: 'قطوة شقية' },
    { id: 'soma', n: 'سوما', g: 'm', unlock: 30, hair: 'short', hc: '#C9D2DE', hs: '#E6ECF4', skin: '#FFE3D2', eye: '#7A5CF0', top: '#2F3A57', topD: '#232C45', bot: '#2A3250', ears: '', acc: 'glasses', accC: '#2B2B35', about: 'ذكي ورزين' },
    { id: 'nana', n: 'نانا', g: 'f', unlock: 60, hair: 'bob', hc: '#2A2230', hs: '#4A3F55', skin: '#FFE3D4', eye: '#D4493F', top: '#F7F7FB', topD: '#DCDCEA', bot: '#2D3C73', ears: '', acc: 'ribbon', accC: '#D4493F', about: 'جدّية وقوية' },
    { id: 'yuki', n: 'يوكي', g: 'f', unlock: 100, hair: 'ponytail', hc: '#BFE3F7', hs: '#E2F4FF', skin: '#FFEBE0', eye: '#4AA3E8', top: '#F2FAFF', topD: '#CFE6F5', bot: '#8FB8D8', ears: '', acc: 'scarf', accC: '#E86A7A', about: 'هادية مثل الثلج' },
    { id: 'hiro', n: 'هيرو', g: 'm', unlock: 160, hair: 'spiky', hc: '#F28A2E', hs: '#FFB45E', skin: '#FFD9BF', eye: '#E8A100', top: '#F7D54A', topD: '#E0B92D', bot: '#3C4A6B', ears: '', acc: 'band', accC: '#D9402B', about: 'حماسي ما يكل' },
    { id: 'koko', n: 'كوكو', g: 'm', unlock: 240, hair: 'short', hc: '#79C98A', hs: '#A4E3B0', skin: '#FFE3D2', eye: '#3A9E73', top: '#C79A6B', topD: '#A87D50', bot: '#8B6B4A', ears: 'bear', earC: '#C79A6B', acc: '', about: 'دبدوب لطيف' },
    { id: 'remi', n: 'ريمي', g: 'f', unlock: 360, hair: 'bun', hc: '#9B7BDB', hs: '#C0A7F0', skin: '#FFE7DA', eye: '#7F5AE0', top: '#D8CCF5', topD: '#B9A8E6', bot: '#6E5BAE', ears: '', acc: 'glasses', accC: '#F4F1EA', about: 'دودة كتب' },
    { id: 'saki', n: 'ساكي', g: 'f', unlock: 520, hair: 'buns', hc: '#E0453A', hs: '#FF7A6B', skin: '#FFE3D4', eye: '#F29B1D', top: '#FFF1F3', topD: '#F0D0D6', bot: '#E0453A', ears: 'cat', earC: '#E0453A', acc: 'ribbon', accC: '#FFFFFF', about: 'نار وحماس' },
    { id: 'ren', n: 'رين', g: 'm', unlock: 700, hair: 'long', hc: '#F4F1EA', hs: '#FFFFFF', skin: '#FFE7DA', eye: '#E0734A', top: '#3B3350', topD: '#2B2540', bot: '#2B2540', ears: 'fox', earC: '#F4F1EA', acc: '', about: 'ثعلب غامض' },
];
export const charById = (id) => CHARS.find((c) => c.id === id) || CHARS[0];

// ---------- helpers ----------
const rngMk = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
const toonGrad = (() => { const t = new THREE.DataTexture(new Uint8Array([120, 180, 232, 255]), 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const toon = (c, o) => new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: toonGrad }, o || {}));
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x3b2530, side: THREE.BackSide });
const sphereAt = (R, theta, phi) => new THREE.Vector3(-R * Math.cos(phi) * Math.sin(theta), R * Math.cos(theta), R * Math.sin(phi) * Math.sin(theta));
function mesh(geo, mat, o) {
    const m = new THREE.Mesh(geo, mat);
    if (o && o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
    if (o && o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
    if (o && o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
    if (o && o.line) { const l = new THREE.Mesh(geo, OUTLINE); l.scale.setScalar(o.line); m.add(l); }
    m.castShadow = !(o && o.noShadow);
    return m;
}
const SPH = (r, w = 24, h = 16) => new THREE.SphereGeometry(r, w, h);

// ---------- the face: big anime eyes drawn on a canvas that wraps the front of the head ----------
const FW = 512, FH = 320;
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function shade(h, k) { const [r, g, b] = hex2rgb(h); const f = (v) => Math.round(clamp(v * k, 0, 255)); return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; }
function drawEye(g, cx, cy, rx, ry, def, kind, side) {
    const dark = '#3b2530', s = side; // s = -1 left eye, +1 right eye (viewer's view)
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'happy' || kind === 'closed' || kind === 'wink') {
        g.strokeStyle = dark; g.lineWidth = 11; g.beginPath();
        if (kind === 'closed') { g.arc(cx, cy - ry * 0.1, rx * 0.95, 0.15 * Math.PI, 0.85 * Math.PI); }
        else { g.arc(cx, cy + ry * 0.35, rx * 0.95, 1.12 * Math.PI, 1.88 * Math.PI); }
        g.stroke();
        return;
    }
    const open = kind === 'sleepy' ? 0.45 : kind === 'angry' ? 0.78 : 1;
    const R = kind === 'surprised' ? 1.12 : 1;
    const ery = ry * open * R;
    g.save(); g.translate(cx, cy);
    if (kind === 'angry') g.rotate(s * 0.14);
    // white
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(0, 0, rx * R, ery, 0, 0, Math.PI * 2); g.fill();
    // iris
    const irx = rx * (kind === 'surprised' ? 0.62 : 0.86), iry = ery * (kind === 'surprised' ? 0.72 : 0.95);
    const grd = g.createLinearGradient(0, -iry, 0, iry); grd.addColorStop(0, shade(def.eye, 0.55)); grd.addColorStop(0.55, def.eye); grd.addColorStop(1, shade(def.eye, 1.35));
    g.fillStyle = grd; g.beginPath(); g.ellipse(0, ery * 0.04, irx, iry, 0, 0, Math.PI * 2); g.fill();
    if (kind === 'love') {
        g.fillStyle = '#FF5D8F'; g.beginPath(); const hs = rx * 0.55; g.moveTo(0, hs * 0.9); g.bezierCurveTo(-hs * 1.4, -hs * 0.2, -hs * 0.6, -hs * 1.2, 0, -hs * 0.35); g.bezierCurveTo(hs * 0.6, -hs * 1.2, hs * 1.4, -hs * 0.2, 0, hs * 0.9); g.fill();
    } else {
        g.fillStyle = '#2a1824'; g.beginPath(); g.ellipse(0, ery * 0.05, irx * (kind === 'surprised' ? 0.35 : 0.52), iry * (kind === 'surprised' ? 0.4 : 0.58), 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(-irx * 0.32, -iry * 0.38, irx * 0.27, iry * 0.25, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.9; g.beginPath(); g.ellipse(irx * 0.34, iry * 0.4, irx * 0.13, iry * 0.12, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    // lid: sleepy / angry cut the top
    if (kind === 'sleepy' || kind === 'angry') { g.fillStyle = shade(def.skin, 1); g.beginPath(); g.rect(-rx * 1.3, -ery * 1.6, rx * 2.6, ery * (kind === 'sleepy' ? 1.0 : 0.62)); g.fill(); }
    // upper lash
    g.strokeStyle = dark; g.lineWidth = 12; g.beginPath(); g.ellipse(0, 0, rx * R, ery, 0, Math.PI * 1.04, Math.PI * 1.96); g.stroke();
    g.lineWidth = 9; g.beginPath(); g.moveTo(s * rx * 0.95, -ery * 0.55); g.lineTo(s * rx * 1.28, -ery * 0.95); g.stroke();
    g.restore();
}
export function drawFace(canvas, def, ex) {
    const g = canvas.getContext('2d'); g.clearRect(0, 0, FW, FH);
    const ey = FH * 0.54, rx = FW * 0.1, ry = FH * 0.235, x1 = FW * 0.3, x2 = FW * 0.7;
    const dark = '#3b2530';
    // blush
    const bl = ex === 'cute' || ex === 'love' ? 0.7 : ex === 'angry' ? 0.55 : 0.38;
    g.fillStyle = ex === 'angry' ? 'rgba(255,70,70,' + bl + ')' : 'rgba(255,120,150,' + bl + ')';
    [x1 - rx * 0.1, x2 + rx * 0.1].forEach((x) => { g.beginPath(); g.ellipse(x, ey + ry * 1.25, rx * 1.05, ry * 0.42, 0, 0, Math.PI * 2); g.fill(); });
    let ke = 'open', kl = 'open';
    if (ex === 'blink') { ke = kl = 'closed'; } else if (ex === 'wink') { kl = 'open'; ke = 'wink'; }
    else if (ex === 'happy' || ex === 'cute') { ke = kl = 'happy'; } else if (ex === 'angry') { ke = kl = 'angry'; }
    else if (ex === 'surprised') { ke = kl = 'surprised'; } else if (ex === 'sleepy') { ke = kl = 'sleepy'; } else if (ex === 'love') { ke = kl = 'love'; }
    else if (ex === 'sad') { ke = kl = 'open'; }
    drawEye(g, x1, ey, rx, ry, def, kl, -1);
    drawEye(g, x2, ey, rx, ry, def, ke, 1);
    // brows
    g.strokeStyle = shade(def.hc, 0.62); g.lineWidth = 8; g.lineCap = 'round';
    const brow = (x, dir) => { g.beginPath(); const y = ey - ry * 1.5; if (ex === 'angry') { g.moveTo(x - dir * rx * 0.9, y - ry * 0.55); g.lineTo(x + dir * rx * 0.9, y + ry * 0.25); } else if (ex === 'sad' || ex === 'sleepy') { g.moveTo(x - dir * rx * 0.9, y + ry * 0.15); g.lineTo(x + dir * rx * 0.9, y - ry * 0.25); } else if (ex === 'surprised') { g.arc(x, y + ry * 0.55, rx * 0.9, 1.2 * Math.PI, 1.8 * Math.PI); } else { g.arc(x, y + ry * 0.7, rx * 0.85, 1.18 * Math.PI, 1.82 * Math.PI); } g.stroke(); };
    brow(x1, -1); brow(x2, 1);
    // mouth
    const mx = FW * 0.5, my = FH * 0.86;
    g.strokeStyle = dark; g.lineWidth = 8; g.fillStyle = '#E8707A';
    g.beginPath();
    if (ex === 'happy' || ex === 'cute' || ex === 'love') { g.moveTo(mx - 30, my - 8); g.quadraticCurveTo(mx, my + 34, mx + 30, my - 8); g.closePath(); g.fillStyle = '#E8707A'; g.fill(); g.stroke(); }
    else if (ex === 'angry') { g.moveTo(mx - 26, my + 10); g.lineTo(mx - 9, my - 4); g.lineTo(mx + 9, my + 10); g.lineTo(mx + 26, my - 4); g.stroke(); }
    else if (ex === 'surprised') { g.ellipse(mx, my + 4, 15, 21, 0, 0, Math.PI * 2); g.fillStyle = '#B5444E'; g.fill(); g.stroke(); }
    else if (ex === 'sad') { g.moveTo(mx - 24, my + 12); g.quadraticCurveTo(mx, my - 12, mx + 24, my + 12); g.stroke(); }
    else if (ex === 'sleepy') { g.ellipse(mx, my + 2, 10, 8, 0, 0, Math.PI * 2); g.stroke(); }
    else { g.moveTo(mx - 20, my - 2); g.quadraticCurveTo(mx - 10, my + 14, mx, my + 2); g.quadraticCurveTo(mx + 10, my + 14, mx + 20, my - 2); g.stroke(); }
}

// ---------- one character ----------
const HEAD_R = 0.38;
export function buildCharacter(def, opt) {
    const root = new THREE.Group(), P = {};
    const skin = toon(def.skin), hairM = toon(def.hc), hairS = toon(def.hs), top = toon(def.top), topD = toon(def.topD), bot = toon(def.bot);
    const female = def.g === 'f';
    // body
    const torso = mesh(new THREE.CapsuleGeometry(0.17, 0.26, 6, 14), top, { p: [0, 0.3, 0], line: 1.06 });
    root.add(torso); P.torso = torso;
    if (female) {
        const skirt = mesh(new THREE.CylinderGeometry(0.17, 0.3, 0.2, 18, 1, true), bot, { p: [0, 0.07, 0], line: 1.04 });
        skirt.material = bot.clone(); skirt.material.side = THREE.DoubleSide; root.add(skirt);
    } else {
        root.add(mesh(new THREE.BoxGeometry(0.34, 0.16, 0.3), bot, { p: [0, 0.08, 0.03], line: 1.04 }));
    }
    // legs (seated): thighs forward, shins down
    const legs = [];
    [-1, 1].forEach((s) => {
        const th = mesh(new THREE.CapsuleGeometry(0.065, 0.26, 4, 8), female ? skin : bot, { p: [s * 0.1, 0.02, 0.2], r: [Math.PI / 2, 0, 0] });
        const sh = mesh(new THREE.CapsuleGeometry(0.058, 0.3, 4, 8), female ? skin : bot, { p: [s * 0.1, -0.2, 0.34] });
        const shoe = mesh(SPH(0.085, 14, 10), toon('#FFFFFF'), { p: [s * 0.1, -0.42, 0.37], s: [1, 0.7, 1.3] });
        root.add(th, sh, shoe); legs.push(th, sh, shoe);
    });
    // neck + head
    const headG = new THREE.Group(); headG.position.set(0, 0.6, 0); root.add(headG); P.head = headG;
    const head = mesh(SPH(HEAD_R, 40, 28), skin, { p: [0, 0.34, 0], s: [1, 0.94, 0.97], line: 1.035 }); headG.add(head); P.skull = head;
    const hc = new THREE.Vector3(0, 0.34, 0);
    // face patch
    const faceC = cvs(FW, FH), faceT = ctex(faceC);
    drawFace(faceC, def, 'norm'); faceT.needsUpdate = true;
    const face = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.012, 48, 32, Math.PI / 2 - 1.02, 2.04, 1.1, 1.12), new THREE.MeshBasicMaterial({ map: faceT, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }));
    face.position.copy(hc); face.scale.set(1, 0.94, 0.97); headG.add(face); P.face = face; P.faceC = faceC; P.faceT = faceT;
    // nose hint
    headG.add(mesh(SPH(0.018, 8, 6), toon('#F2B8A6'), { p: [0, 0.285, HEAD_R * 0.97], noShadow: true }));
    // hair
    const hairG = new THREE.Group(); headG.add(hairG); P.hair = hairG; P.sway = [];
    const HR = HEAD_R * 1.075;
    const cap = mesh(new THREE.SphereGeometry(HR, 40, 24, 0, Math.PI * 2, 0, 1.36), hairM, { p: [hc.x, hc.y, hc.z], s: [1, 0.96, 1], line: 1.03 }); hairG.add(cap);
    const backLen = def.hair === 'bob' ? 2.35 : def.hair === 'long' ? 2.2 : 1.95;
    const back = mesh(new THREE.SphereGeometry(HR, 40, 24, Math.PI / 2 + 1.12, Math.PI * 2 - 2.24, 1.3, backLen - 1.3), hairM, { p: [hc.x, hc.y, hc.z], s: [1, 0.96, 1] }); back.material = hairM.clone(); back.material.side = THREE.DoubleSide; hairG.add(back);
    // fringe: pointed locks hanging from the front edge of the cap
    const nL = 9;
    for (let i = 0; i < nL; i++) {
        const u = i / (nL - 1), phi = Math.PI / 2 + (u - 0.5) * 2.1, th = 1.1 + Math.abs(u - 0.5) * 0.22, len = (def.hair === 'spiky' ? 0.15 : 0.115) * (0.8 + ((i * 37) % 5) * 0.1);
        const n = sphereAt(1, th, phi), pos = n.clone().multiplyScalar(HR * 1.0).add(hc);
        const dir = n.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, -1, 0)).normalize();
        const lock = mesh(SPH(1, 14, 10), (i % 3 === 1 ? hairS : hairM), { s: [0.07, len * 0.8, 0.045], line: 1.14 });
        lock.position.copy(pos).addScaledVector(dir, len * 0.45);
        lock.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
        lock.rotateY(0);
        hairG.add(lock);
    }
    // shine band
    const shine = mesh(new THREE.TorusGeometry(HR * 0.93, 0.018, 6, 40, Math.PI * 1.5), toon(def.hs), { p: [hc.x, hc.y + 0.04, hc.z + 0.01], r: [Math.PI / 2 - 0.5, 0, Math.PI * 0.75], noShadow: true }); shine.visible = false;
    // side locks / style
    const lockEll = (x, y, z, sx, sy, sz, rz, mat) => { const m = mesh(SPH(1, 18, 12), mat || hairM, { p: [x, y, z], s: [sx, sy, sz], r: [0, 0, rz || 0], line: 1.06 }); hairG.add(m); return m; };
    const sideX = HEAD_R * 0.98;
    if (def.hair === 'long') {
        lockEll(-sideX, hc.y - 0.2, 0.06, 0.1, 0.34, 0.12, 0.05); lockEll(sideX, hc.y - 0.2, 0.06, 0.1, 0.34, 0.12, -0.05);
        P.sway.push(lockEll(0, hc.y - 0.42, -0.2, 0.34, 0.55, 0.16));
    } else if (def.hair === 'bob') {
        lockEll(-sideX, hc.y - 0.08, 0.05, 0.1, 0.26, 0.15, 0.08); lockEll(sideX, hc.y - 0.08, 0.05, 0.1, 0.26, 0.15, -0.08);
    } else if (def.hair === 'twin') {
        [-1, 1].forEach((s) => { const t = lockEll(s * 0.46, hc.y - 0.12, -0.06, 0.12, 0.42, 0.12, s * 0.12); t.userData.base = s * 0.12; P.sway.push(t); hairG.add(mesh(SPH(0.07, 12, 8), toon(def.accC), { p: [s * 0.42, hc.y + 0.2, -0.04], noShadow: true })); });
        lockEll(-sideX, hc.y - 0.1, 0.1, 0.07, 0.2, 0.1, 0.05); lockEll(sideX, hc.y - 0.1, 0.1, 0.07, 0.2, 0.1, -0.05);
    } else if (def.hair === 'ponytail') {
        const t = lockEll(0, hc.y - 0.12, -0.42, 0.14, 0.5, 0.14, 0, hairM); t.rotation.x = -0.35; P.sway.push(t);
        hairG.add(mesh(SPH(0.065, 12, 8), toon(def.accC || '#E86A7A'), { p: [0, hc.y + 0.1, -0.4], noShadow: true }));
        lockEll(-sideX, hc.y - 0.12, 0.08, 0.08, 0.24, 0.1, 0.04); lockEll(sideX, hc.y - 0.12, 0.08, 0.08, 0.24, 0.1, -0.04);
    } else if (def.hair === 'bun') {
        hairG.add(mesh(SPH(0.17, 20, 14), hairM, { p: [0, hc.y + HR * 0.97, -0.08], line: 1.07 }));
        lockEll(-sideX, hc.y - 0.08, 0.08, 0.08, 0.22, 0.1, 0.05); lockEll(sideX, hc.y - 0.08, 0.08, 0.08, 0.22, 0.1, -0.05);
    } else if (def.hair === 'buns') {
        [-1, 1].forEach((s) => hairG.add(mesh(SPH(0.15, 18, 12), hairM, { p: [s * 0.3, hc.y + HR * 0.86, -0.05], line: 1.07 })));
        lockEll(-sideX, hc.y - 0.1, 0.08, 0.07, 0.2, 0.1, 0.05); lockEll(sideX, hc.y - 0.1, 0.08, 0.07, 0.2, 0.1, -0.05);
    } else if (def.hair === 'spiky') {
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = HR * 0.8; const sp = mesh(new THREE.ConeGeometry(0.1, 0.3, 8), i % 2 ? hairM : hairS, { p: [Math.cos(a) * r * 0.8, hc.y + HR * 0.82, Math.sin(a) * r * 0.8], line: 1.07 }); sp.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); hairG.add(sp); }
    } else { lockEll(-sideX, hc.y - 0.02, 0.1, 0.07, 0.17, 0.09, 0.04); lockEll(sideX, hc.y - 0.02, 0.1, 0.07, 0.17, 0.09, -0.04); }
    // ahoge
    if (def.hair !== 'spiky' && def.hair !== 'bun' && def.hair !== 'buns') { const a = mesh(new THREE.ConeGeometry(0.03, 0.2, 6), hairM, { p: [0.04, hc.y + HR * 1.03, 0.04], r: [0.1, 0, -0.45] }); hairG.add(a); P.sway.push(a); }
    // ears
    P.ears = [];
    if (def.ears) [-1, 1].forEach((s) => {
        let e;
        if (def.ears === 'dog') { e = mesh(SPH(1, 14, 10), toon(def.earC), { p: [s * 0.37, hc.y + 0.12, 0.0], s: [0.1, 0.2, 0.06], r: [0, 0, s * 0.35], line: 1.1 }); e.userData.base = s * 0.35; }
        else if (def.ears === 'bear') { e = mesh(SPH(0.11, 14, 10), toon(def.earC), { p: [s * 0.3, hc.y + 0.34, 0.0], line: 1.1 }); e.add(mesh(SPH(0.06, 10, 8), toon('#F2C8A0'), { p: [0, 0, 0.06], noShadow: true })); }
        else { e = mesh(new THREE.ConeGeometry(0.13, 0.26, 4), toon(def.earC), { p: [s * 0.25, hc.y + 0.42, 0.0], r: [0, Math.PI / 4, s * -0.28], line: 1.1 }); if (def.ears === 'fox') e.add(mesh(new THREE.ConeGeometry(0.06, 0.1, 4), toon('#3B3350'), { p: [0, 0.09, 0], noShadow: true })); else e.add(mesh(new THREE.ConeGeometry(0.07, 0.15, 4), toon('#FFC8D6'), { p: [0, -0.02, 0.03], noShadow: true })); }
        headG.add(e); P.ears.push(e);
    });
    // accessories
    const A = def.acc;
    if (A === 'bow' || A === 'ribbon') {
        const bw = new THREE.Group(); const m = toon(def.accC);
        [-1, 1].forEach((s) => bw.add(mesh(new THREE.ConeGeometry(0.09, 0.15, 3), m, { p: [s * 0.07, 0, 0], r: [0, 0, s * -Math.PI / 2], line: 1.1 })));
        bw.add(mesh(SPH(0.04, 8, 6), m, { noShadow: true }));
        if (A === 'bow') { bw.position.set(-0.27, hc.y + 0.3, 0.2); bw.rotation.z = 0.5; headG.add(bw); }
        else { bw.position.set(0, 0.04, 0.2); bw.scale.setScalar(1.1); root.add(bw); bw.position.set(0, 0.52, 0.17); }
    }
    if (A === 'glasses') {
        const gm = new THREE.MeshStandardMaterial({ color: def.accC, roughness: 0.4 });
        [-1, 1].forEach((s) => headG.add(mesh(new THREE.TorusGeometry(0.105, 0.012, 8, 28), gm, { p: [s * 0.135, hc.y - 0.035, HEAD_R * 0.99], noShadow: true })));
        headG.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6), gm, { p: [0, hc.y - 0.02, HEAD_R * 0.99], r: [0, 0, Math.PI / 2], noShadow: true }));
    }
    if (A === 'band') { const b = mesh(new THREE.TorusGeometry(HR * 0.98, 0.028, 8, 36), toon(def.accC), { p: [hc.x, hc.y + 0.04, hc.z], r: [Math.PI / 2 - 0.25, 0, 0], line: 1.1 }); headG.add(b); }
    if (A === 'headphones') {
        const hm = toon(def.accC);
        headG.add(mesh(new THREE.TorusGeometry(HR * 0.96, 0.025, 8, 28, Math.PI), hm, { p: [0, hc.y, 0], r: [0, 0, 0], line: 1.1 }));
        [-1, 1].forEach((s) => headG.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 16), toon('#3b4a6b'), { p: [s * HR * 0.99, hc.y - 0.02, 0], r: [0, 0, Math.PI / 2], line: 1.1 })));
    }
    if (A === 'scarf') { root.add(mesh(new THREE.TorusGeometry(0.16, 0.07, 10, 22), toon(def.accC), { p: [0, 0.58, 0.01], r: [Math.PI / 2, 0, 0], line: 1.06 })); root.add(mesh(new THREE.CapsuleGeometry(0.045, 0.2, 4, 8), toon(def.accC), { p: [0.1, 0.45, 0.17], r: [0, 0, 0.1] })); }
    // arms: shoulder -> upper -> forearm(hand)
    P.arms = [];
    [-1, 1].forEach((s) => {
        const sh = new THREE.Group(); sh.position.set(s * 0.215, 0.47, 0.02); root.add(sh);
        const up = mesh(new THREE.CapsuleGeometry(0.052, 0.2, 4, 8), top, { p: [0, -0.12, 0], line: 1.08 }); sh.add(up);
        const el = new THREE.Group(); el.position.set(0, -0.25, 0); sh.add(el);
        const fo = mesh(new THREE.CapsuleGeometry(0.047, 0.18, 4, 8), topD, { p: [0, -0.1, 0], line: 1.08 }); el.add(fo);
        const hd = mesh(SPH(0.058, 12, 8), skin, { p: [0, -0.23, 0], line: 1.1 }); el.add(hd);
        P.arms.push({ sh, el, s });
    });
    P.R = P.arms[1]; P.L = P.arms[0];
    // effects (hidden until needed)
    const spr = (kind, size) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex(kind), transparent: true, depthTest: false, depthWrite: false })); m.scale.setScalar(size); m.visible = false; m.renderOrder = 20; return m; };
    P.vein = spr('vein', 0.3); P.vein.position.set(0.22, 0.34 + 0.38, 0.28); headG.add(P.vein);
    P.zzz = spr('zzz', 0.34); P.zzz.position.set(0.3, 0.34 + 0.55, 0.1); headG.add(P.zzz);
    P.steam = spr('steam', 0.26); P.steam.position.set(-0.28, 0.34 + 0.45, 0.2); headG.add(P.steam);
    P.hearts = []; for (let i = 0; i < 4; i++) { const h = spr('heart', 0.2); h.userData.t = 0; root.add(h); P.hearts.push(h); }
    // paper + pencil on the desk in front (set by the room)
    // picking: invisible but raycastable
    const pick = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 2, 8), new THREE.MeshBasicMaterial({ visible: false })); pick.position.set(0, 0.6, 0.05); root.add(pick); P.pick = pick;
    P.def = def; P.expr = 'norm'; P.root = root;
    P.setExpr = (e) => { if (P.expr === e) return; P.expr = e; drawFace(faceC, def, e); faceT.needsUpdate = true; };
    P.legs = legs; P.base = { headY: headG.position.y };
    root.traverse((o) => { if (o.isMesh) { o.receiveShadow = false; o.castShadow = false; } });
    P.skull.castShadow = true; P.torso.castShadow = true;
    return P;
}

// ---------- tiny effect textures (hearts, anger vein, zzz, steam), shared ----------
const FX = {};
function fxTex(kind) {
    if (FX[kind]) return FX[kind];
    const c = cvs(128, 128), g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'heart') {
        g.fillStyle = '#FF5D8F'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 8; g.beginPath(); g.moveTo(64, 108); g.bezierCurveTo(8, 70, 18, 18, 64, 44); g.bezierCurveTo(110, 18, 120, 70, 64, 108); g.closePath(); g.stroke(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(44, 48, 9, 6, -0.6, 0, 7); g.fill();
    } else if (kind === 'vein') {
        g.strokeStyle = '#E11D2E'; g.lineWidth = 15;
        [[[18, 18], [50, 50]], [[110, 18], [78, 50]], [[18, 110], [50, 78]], [[110, 110], [78, 78]]].forEach((p) => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); g.lineTo(p[1][0], p[1][1]); g.stroke(); });
        g.strokeStyle = '#FFFFFF'; g.lineWidth = 4;
        [[[18, 18], [50, 50]], [[110, 18], [78, 50]], [[18, 110], [50, 78]], [[110, 110], [78, 78]]].forEach((p) => { g.beginPath(); g.moveTo(p[0][0] + 2, p[0][1] + 2); g.lineTo(p[1][0], p[1][1]); g.stroke(); });
    } else if (kind === 'zzz') {
        g.fillStyle = '#6C7AE0'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 6; g.font = '900 64px sans-serif'; g.textAlign = 'center';
        g.strokeText('z', 40, 100); g.fillText('z', 40, 100); g.font = '900 44px sans-serif'; g.strokeText('z', 84, 66); g.fillText('z', 84, 66); g.font = '900 30px sans-serif'; g.strokeText('z', 108, 36); g.fillText('z', 108, 36);
    } else if (kind === 'steam') {
        g.fillStyle = 'rgba(255,255,255,.92)'; g.strokeStyle = 'rgba(190,200,215,.9)'; g.lineWidth = 5;
        [[40, 84, 24], [70, 70, 30], [92, 92, 20], [60, 100, 22]].forEach((p) => { g.beginPath(); g.arc(p[0], p[1], p[2], 0, 7); g.fill(); g.stroke(); });
    } else if (kind === 'spark') {
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    } else if (kind === 'glow') {
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,214,150,.95)'); gr.addColorStop(0.35, 'rgba(255,190,110,.35)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    return (FX[kind] = ctex(c));
}

// ---------- portraits for the picker: one hidden renderer draws each face ----------
export function portraits(size, ids) {
    const R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    R.setSize(size, size, false); R.setPixelRatio(1); R.outputColorSpace = THREE.SRGBColorSpace; R.setClearColor(0x000000, 0);
    const S = new THREE.Scene(), C = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
    S.add(new THREE.HemisphereLight(0xffffff, 0xffe8dc, 2.1)); const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(1.5, 3, 4); S.add(d);
    const out = {};
    (ids || CHARS.map((c) => c.id)).forEach((id) => {
        const def = charById(id), ch = buildCharacter(def);
        ch.setExpr(def.wink ? 'wink' : 'happy');
        S.add(ch.root); ch.root.position.set(0, 0, 0); ch.head.rotation.set(0.04, -0.12, 0.05);
        C.position.set(0.15, 1.18, 3.3); C.lookAt(0, 0.88, 0); R.render(S, C);
        out[id] = R.domElement.toDataURL('image/png');
        S.remove(ch.root); ch.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    });
    R.dispose();
    return out;
}

// ---------- the room ----------
function woodTex(base, rep) {
    const W = 512, H = 512, c = cvs(W, H), g = c.getContext('2d'), r = rngMk(11);
    const planks = 8, ph = H / planks;
    for (let i = 0; i < planks; i++) {
        const t = 0.86 + r() * 0.2; g.fillStyle = shade(base, t); g.fillRect(0, i * ph, W, ph);
        for (let k = 0; k < 26; k++) { g.strokeStyle = 'rgba(70,40,20,' + (0.04 + r() * 0.06) + ')'; g.lineWidth = 1 + r() * 2; g.beginPath(); const y = i * ph + r() * ph; g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 6, W * 0.6, y + (r() - 0.5) * 6, W, y + (r() - 0.5) * 4); g.stroke(); }
        g.fillStyle = 'rgba(40,22,10,.55)'; g.fillRect(0, i * ph, W, 2);
        const off = r() * W; g.fillRect(off, i * ph, 2, ph);
    }
    const t = ctex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); return t;
}
function wallTex() {
    const c = cvs(256, 256), g = c.getContext('2d'); g.fillStyle = '#F3E6DA'; g.fillRect(0, 0, 256, 256);
    const r = rngMk(5); for (let i = 0; i < 2400; i++) { g.fillStyle = 'rgba(' + (r() > 0.5 ? '255,255,255' : '190,160,140') + ',' + (0.03 + r() * 0.05) + ')'; g.fillRect(r() * 256, r() * 256, 2, 2); }
    const t = ctex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 2); return t;
}
function rugTex() {
    const c = cvs(512, 512), g = c.getContext('2d'); g.fillStyle = '#F2B8C6'; g.fillRect(0, 0, 512, 512);
    [[240, '#FBE3EA'], [190, '#EFA3B8'], [140, '#FFF1F4'], [90, '#F2B8C6'], [40, '#FFFFFF']].forEach(([r, col]) => { g.fillStyle = col; g.beginPath(); g.arc(256, 256, r, 0, 7); g.fill(); });
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 4; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.beginPath(); g.moveTo(256 + Math.cos(a) * 60, 256 + Math.sin(a) * 60); g.lineTo(256 + Math.cos(a) * 230, 256 + Math.sin(a) * 230); g.stroke(); }
    return ctex(c);
}
function skyTex(day) {
    const c = cvs(512, 512), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
    if (day > 0.6) { gr.addColorStop(0, '#6DB6F2'); gr.addColorStop(1, '#D8F0FF'); }
    else if (day > 0.25) { gr.addColorStop(0, '#6A78C9'); gr.addColorStop(0.55, '#F2A87A'); gr.addColorStop(1, '#FFD8A0'); }
    else { gr.addColorStop(0, '#0B1230'); gr.addColorStop(1, '#2A3568'); }
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    const r = rngMk(21);
    if (day <= 0.25) { for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.4 + r() * 0.6) + ')'; g.beginPath(); g.arc(r() * 512, r() * 380, 0.6 + r() * 1.6, 0, 7); g.fill(); } g.fillStyle = '#FFF6D6'; g.beginPath(); g.arc(380, 120, 34, 0, 7); g.fill(); g.fillStyle = '#0B1230'; g.beginPath(); g.arc(396, 112, 30, 0, 7); g.fill(); }
    else { g.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 7; i++) { const x = r() * 512, y = 60 + r() * 220; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(x + k * 22, y + Math.sin(k) * 8, 20 + r() * 12, 0, 7); g.fill(); } } if (day > 0.6) { g.fillStyle = '#FFF4B8'; g.beginPath(); g.arc(120, 90, 38, 0, 7); g.fill(); } }
    // Baghdad skyline hint at the bottom
    g.fillStyle = day > 0.25 ? 'rgba(120,150,170,.55)' : 'rgba(10,16,36,.9)';
    for (let i = 0; i < 18; i++) g.fillRect(i * 30 + r() * 10, 420 - r() * 70, 22 + r() * 10, 120);
    g.beginPath(); g.arc(256, 430, 40, Math.PI, 0); g.fill();
    return ctex(c);
}
function clockTex(label, time, sub) {
    const c = cvs(512, 256), g = c.getContext('2d');
    g.fillStyle = '#1C2230'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#26304A'; g.fillRect(8, 8, 496, 240);
    g.fillStyle = '#7CE3C9'; g.shadowColor = '#4FE3B8'; g.shadowBlur = 16; g.font = '900 120px "Courier New", monospace'; g.textAlign = 'center'; g.fillText(time, 256, 150);
    g.shadowBlur = 0; g.fillStyle = '#C4CCE0'; g.font = '700 34px Tahoma, sans-serif'; g.fillText(label, 256, 54); g.fillStyle = '#8F9AB8'; g.font = '600 28px Tahoma, sans-serif'; g.fillText(sub || '', 256, 214);
    return ctex(c);
}
function posterTex(kind) {
    const c = cvs(256, 340), g = c.getContext('2d');
    if (kind === 0) { const gr = g.createLinearGradient(0, 0, 0, 340); gr.addColorStop(0, '#FFD9E6'); gr.addColorStop(1, '#C9E4FF'); g.fillStyle = gr; g.fillRect(0, 0, 256, 340); g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(128, 130, 70, 0, 7); g.fill(); g.fillStyle = '#FFB1CB'; g.beginPath(); g.arc(128, 130, 56, 0, 7); g.fill(); g.fillStyle = '#3B2530'; g.font = '900 38px Tahoma, sans-serif'; g.textAlign = 'center'; g.fillText('ذاكر بحب', 128, 266); g.font = '600 24px Tahoma'; g.fillText('خطوة خطوة', 128, 304); }
    else { g.fillStyle = '#FFF6D6'; g.fillRect(0, 0, 256, 340); g.fillStyle = '#E28A1F'; g.font = '900 120px sans-serif'; g.textAlign = 'center'; g.fillText('A+', 128, 190); g.fillStyle = '#7A4B1E'; g.font = '800 34px Tahoma'; g.fillText('السادس الإعدادي', 128, 262); }
    return ctex(c);
}

const SEATS_W = [[-3.3, 0.9], [-1.1, 0.9], [1.1, 0.9], [3.3, 0.9], [-3.3, -1.7], [-1.1, -1.7], [1.1, -1.7], [3.3, -1.7]];
const SEATS_T = [[-1.15, 1.6, 0], [1.15, 1.6, 0], [-1.15, 0.1, 0.8], [1.15, 0.1, 0.8], [-1.15, -1.4, 1.65], [1.15, -1.4, 1.65], [-1.15, -2.9, 2.5], [1.15, -2.9, 2.5]];
const MAXSEAT = 8;

export class StudyRoom3D {
    constructor(root) {
        this.root = root;
        this.low = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 3;
        const R = this.renderer = new THREE.WebGLRenderer({ antialias: !this.low, powerPreference: 'high-performance' });
        this.pr = Math.min(window.devicePixelRatio || 1, this.low ? 1.5 : 2);
        R.setPixelRatio(this.pr);
        R.shadowMap.enabled = !this.low; R.shadowMap.type = THREE.PCFSoftShadowMap; R.shadowMap.autoUpdate = false;
        R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05; R.outputColorSpace = THREE.SRGBColorSpace;
        R.domElement.className = 'rm-canvas'; root.appendChild(R.domElement);
        this.labels = document.createElement('div'); this.labels.className = 'rm-labels'; root.appendChild(this.labels);
        const S = this.scene = new THREE.Scene();
        S.background = new THREE.Color('#2b2433');
        const pm = new THREE.PMREMGenerator(R);
        S.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; S.environmentIntensity = 0.5;
        const C = this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
        C.position.set(0, 4.6, 10.8);
        this.controls = new OrbitControls(C, R.domElement);
        Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 6.2, maxDistance: 13.5, minPolarAngle: 0.95, maxPolarAngle: 1.55, minAzimuthAngle: -0.55, maxAzimuthAngle: 0.55, rotateSpeed: 0.55, zoomSpeed: 0.7 });
        this.controls.target.set(0, 1.2, -0.7);
        this.tilt = new THREE.Vector2(); this.tiltS = new THREE.Vector2();
        this.t = 0; this.shakeT = 0; this.chars = new Map(); this.papers = []; this.bubbles = new Map();
        this.onTap = null; this.onPet = null; this.day = 1;
        this._room(); this._lights(); this._dust();
        this._input();
        this.resize();
        this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(root);
        this.clock = new THREE.Clock();
        this.setDaytime(new Date());
    }

    // ----- building the room -----
    _room() {
        const S = this.scene, std = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
        const box = (w, h, d, mat, x, y, z, sh = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = sh; m.receiveShadow = true; S.add(m); return m; };
        // floor, walls
        const floorM = new THREE.MeshStandardMaterial({ map: woodTex('#B9824F', [4, 4]), roughness: 0.55, metalness: 0.02 });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 13.5), floorM); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 1.75); floor.receiveShadow = true; S.add(floor);
        const wallM = new THREE.MeshStandardMaterial({ map: wallTex(), roughness: 0.95 });
        const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), wallM); back.position.set(0, 4, -5); back.receiveShadow = true; S.add(back);
        const sideL = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 8), wallM); sideL.rotation.y = Math.PI / 2; sideL.position.set(-6.2, 4, 1.75); sideL.receiveShadow = true; S.add(sideL);
        const sideR = sideL.clone(); sideR.rotation.y = -Math.PI / 2; sideR.position.x = 6.2; S.add(sideR);
        // wainscot + skirting
        box(14, 1.05, 0.08, std('#D9B8A2', 0.8), 0, 0.52, -4.96, false); box(14, 0.08, 0.14, std('#FFFFFF', 0.6), 0, 1.07, -4.93, false); box(14, 0.14, 0.12, std('#FFFFFF', 0.6), 0, 0.07, -4.94, false);
        [-1, 1].forEach((s) => { box(0.08, 1.05, 13.5, std('#D9B8A2', 0.8), s * 6.16, 0.52, 1.75, false); });
        // window with the real sky
        this.skyM = new THREE.MeshBasicMaterial({ map: skyTex(1), toneMapped: false });
        const win = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.4), this.skyM); win.position.set(0, 2.75, -4.96); S.add(win);
        const fr = std('#FFFFFF', 0.5);
        box(3.9, 0.15, 0.2, fr, 0, 4.0, -4.9, false); box(3.9, 0.15, 0.2, fr, 0, 1.5, -4.9, false); box(0.15, 2.65, 0.2, fr, -1.88, 2.75, -4.9, false); box(0.15, 2.65, 0.2, fr, 1.88, 2.75, -4.9, false); box(0.07, 2.4, 0.1, fr, 0, 2.75, -4.88, false); box(3.6, 0.07, 0.1, fr, 0, 2.75, -4.88, false);
        box(4.2, 0.1, 0.4, std('#F5F0EA', 0.6), 0, 1.45, -4.78, false);
        // curtains
        [-1, 1].forEach((s) => { const cu = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.9, 0.18), std('#F9C9D4', 0.95)); cu.position.set(s * 2.45, 2.75, -4.75); cu.castShadow = true; S.add(cu); for (let i = 0; i < 4; i++) box(0.03, 2.9, 0.2, std('#EFA9BC', 0.95), s * 2.45 - 0.28 + i * 0.19, 2.75, -4.74, false); });
        box(6.4, 0.07, 0.07, std('#8A6A4E', 0.5, 0.2), 0, 4.25, -4.72, false);
        // bookshelf (left) with instanced books
        const shelfX = -4.7; box(2.2, 3.6, 0.5, std('#A8744A', 0.7), shelfX, 1.8, -4.7); box(2.0, 3.4, 0.42, std('#6B4630', 0.9), shelfX, 1.8, -4.66, false);
        const cols = ['#E85D75', '#F2A65A', '#6CB4EE', '#7BC96F', '#B58BE0', '#F6D55C', '#4FA3A5', '#F28FAD'], rr = rngMk(3);
        const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.7 }), 80); let bi = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
        for (let row = 0; row < 4; row++) { let x = shelfX - 0.92; const y = 0.55 + row * 0.82; box(2.1, 0.06, 0.45, std('#A8744A', 0.7), shelfX, y - 0.34, -4.68, false); while (x < shelfX + 0.88 && bi < 80) { const w = 0.07 + rr() * 0.07, h = 0.42 + rr() * 0.22; m4.compose(new THREE.Vector3(x + w / 2, y - 0.31 + h / 2, -4.66), q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (rr() - 0.5) * 0.05), new THREE.Vector3(w, h, 0.3)); books.setMatrixAt(bi, m4); books.setColorAt(bi, col.set(cols[Math.floor(rr() * cols.length)])); bi++; x += w + 0.012; } }
        books.count = bi; books.castShadow = true; S.add(books); this.books = books;
        // wall clock = the room's study timer
        this.clockC = null; const cm = new THREE.MeshBasicMaterial({ map: clockTex('وقت الدراسة', '00:00', ''), toneMapped: false });
        this.clockMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), cm); this.clockMesh.position.set(3.4, 3.7, -4.9); S.add(this.clockMesh);
        box(1.85, 1.0, 0.1, std('#2A2F3F', 0.4, 0.3), 3.4, 3.7, -4.97, false);
        // posters
        [[2.2, 0], [4.7, 1]].forEach(([x, k], i) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.26), new THREE.MeshBasicMaterial({ map: posterTex(k), toneMapped: false })); p.position.set(x + (i ? 0.3 : -0.2), i ? 2.35 : 2.0, -4.95); p.rotation.z = i ? 0.04 : -0.03; S.add(p); });
        // rug
        const rug = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshStandardMaterial({ map: rugTex(), roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.012, -0.4); rug.scale.set(1.5, 1, 0.9); rug.receiveShadow = true; S.add(rug);
        this._layout('wide');
        // plants
        const plant = (x, z, s) => { const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.2 * s, 0.4 * s, 16), std('#E6A07A', 0.8)); pot.position.set(x, 0.2 * s, z); pot.castShadow = true; S.add(pot); for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s, 10, 8), std(i % 2 ? '#5FAE5B' : '#7CC870', 0.8)); const a = i / 9 * Math.PI * 2; l.scale.set(0.5, 1.4, 0.3); l.position.set(x + Math.cos(a) * 0.17 * s, 0.7 * s + (i % 3) * 0.1 * s, z + Math.sin(a) * 0.17 * s); l.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); l.castShadow = true; S.add(l); } };
        plant(5.0, -3.9, 1.5); plant(-5.2, 1.6, 1.1); plant(5.3, 2.2, 1.2);
        // fairy lights across the back wall
        const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(new THREE.Vector3(-5.6 + u * 11.2, 4.55 - Math.sin(u * Math.PI) * 0.45 - (i % 2 ? 0.06 : 0), -4.85)); }
        this.fairy = []; const fg = new THREE.Group(); S.add(fg);
        pts.forEach((p, i) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: ['#FFE08A', '#FFB6C8', '#BFE3FF', '#C9F0C0'][i % 4], toneMapped: false })); b.position.copy(p); fg.add(b); const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex('glow'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 })); g.scale.setScalar(0.5); g.position.copy(p); fg.add(g); this.fairy.push(g); });
        this.fairyGroup = fg;
        // a cat plush on the shelf side, a globe... small props
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), std('#7FB7E5', 0.4)); ball.position.set(-3.8, 0.22, 3.2); ball.castShadow = true; S.add(ball); this.ball = ball;
        // pendant sun beam
        const beam = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.4), new THREE.MeshBasicMaterial({ color: '#FFF1C9', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.set(0.4, 1.7, -2.2); beam.rotation.set(-0.5, 0, 0); S.add(beam); this.beam = beam;
    }
    _layout(mode) {
        if (this._mode === mode) return; this._mode = mode;
        if (this.deskG) { this.scene.remove(this.deskG); this.deskG.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
        const seats = mode === 'tall' ? SEATS_T : SEATS_W;
        this.seats = seats; this.seatPos = seats.map(([x, z, y]) => new THREE.Vector3(x, 0.48 + (y || 0), z)); this.papersOn = []; this.lamps = [];
        const G = this.deskG = new THREE.Group(); this.scene.add(G);
        let cur = G; const S = { add: (...o) => cur.add(...o) }, std = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
        const box = (w, h, d, mat, x, y, z, sh = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = sh; m.receiveShadow = true; cur.add(m); return m; };
        if (mode === 'tall') [[-2.9, 2.5], [-1.4, 1.65], [0.1, 0.8]].forEach(([z, y]) => { const st = box(5.6, y, 1.6, std('#E8C9A6', 0.8), 0, y / 2, z + 0.45); st.receiveShadow = true; });
        
        const woodD = new THREE.MeshStandardMaterial({ map: woodTex('#D7A976', [1, 1]), roughness: 0.5 });
        seats.forEach(([x, z, yo], i) => {
            cur = new THREE.Group(); cur.position.y = yo || 0; if (mode === 'tall') { cur.scale.x = 0.72; cur.position.x = x * 0.28; } G.add(cur);
            // desk in front of the seat (towards the camera, +z)
            const dz = z + 0.95;
            const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.95), woodD); top.position.set(x, 0.86, dz); top.castShadow = top.receiveShadow = true; S.add(top);
            [[-0.78, -0.4], [0.78, -0.4], [-0.78, 0.4], [0.78, 0.4]].forEach(([lx, lz]) => box(0.07, 0.83, 0.07, std('#8A5C3A', 0.6), x + lx, 0.42, dz + lz, true));
            // chair
            box(0.62, 0.07, 0.6, std(i % 2 ? '#7FB7E5' : '#F2A8BC', 0.6), x, 0.43, z - 0.02); box(0.62, 0.62, 0.07, std(i % 2 ? '#6AA3D2' : '#E593AA', 0.6), x, 0.78, z - 0.34);
            [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.2], [0.25, 0.2]].forEach(([lx, lz]) => box(0.05, 0.4, 0.05, std('#5A4636', 0.5, 0.3), x + lx, 0.2, z + lz, false));
            // notebook + pencil (+ a paper that flies when the room shakes)
            const nb = box(0.5, 0.025, 0.36, std(i % 2 ? '#FFFFFF' : '#FFF8E8', 0.8), x + 0.05, 0.915, dz + 0.1, false); nb.rotation.y = (i % 3 - 1) * 0.08;
            box(0.34, 0.02, 0.45, std('#FFFFFF', 0.8), x - 0.5, 0.915, dz + 0.05, false).rotation.y = 0.15;
            const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), std('#F2C94C', 0.5)); pen.rotation.set(0, 0.5, Math.PI / 2); pen.position.set(x + 0.32, 0.93, dz + 0.1); S.add(pen);
            this.papersOn.push(new THREE.Vector3(x - 0.5, 0.95, dz + 0.05));
            // lamp
            const lampBase = box(0.16, 0.03, 0.16, std('#E8E4DC', 0.4), x + 0.7, 0.9, dz - 0.3, false);
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), std('#E8E4DC', 0.4)); arm.position.set(x + 0.7, 1.15, dz - 0.3); arm.rotation.z = 0.15; S.add(arm);
            const sh = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.17, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#F6C4D2', roughness: 0.6, side: THREE.DoubleSide, emissive: '#FFB36B', emissiveIntensity: 0.6 })); sh.position.set(x + 0.66, 1.4, dz - 0.3); sh.rotation.z = 0.25; S.add(sh);
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex('glow'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 })); glow.scale.setScalar(0.9); glow.position.set(x + 0.62, 1.3, dz - 0.3); S.add(glow);
            this.lamps.push({ shade: sh, glow, x, dz });
            // mug
            const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.1, 14), std(['#FFFFFF', '#FFE08A', '#BFE3F7'][i % 3], 0.5)); mug.position.set(x - 0.75, 0.95, dz - 0.25); mug.castShadow = true; S.add(mug);
        });
        this.chars && this.chars.forEach((c) => { c.P.root.position.copy(this.seatPos[c.seat]); });
        if (this.day !== undefined && this.setDaytime && this._lastDate) this.setDaytime(this._lastDate);
    }
    _lights() {
        const S = this.scene;
        this.hemi = new THREE.HemisphereLight(0xfff0e0, 0xb89a86, 0.9); S.add(this.hemi);
        const sun = this.sun = new THREE.DirectionalLight(0xfff0d0, 2.6); sun.position.set(2.5, 6.5, -2.5); sun.target.position.set(0, 0, 0.5);
        sun.castShadow = !this.low; sun.shadow.mapSize.set(this.low ? 512 : 1536, this.low ? 512 : 1536); const sc = sun.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 5; sc.bottom = -5; sc.near = 1; sc.far = 18; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 5;
        S.add(sun, sun.target);
        this.fill = new THREE.DirectionalLight(0xdfe8ff, 0.6); this.fill.position.set(-4, 4, 8); S.add(this.fill);
        this.warm = []; [-2.2, 2.2].forEach((x) => { const p = new THREE.PointLight(0xffc27a, 6, 9, 1.6); p.position.set(x, 2.2, -0.2); S.add(p); this.warm.push(p); });
    }
    _dust() {
        const n = 90, g = new THREE.BufferGeometry(), a = new Float32Array(n * 3), r = rngMk(9);
        for (let i = 0; i < n; i++) { a[i * 3] = (r() - 0.5) * 5; a[i * 3 + 1] = r() * 4.2; a[i * 3 + 2] = -3 + r() * 5; }
        g.setAttribute('position', new THREE.BufferAttribute(a, 3));
        this.dust = new THREE.Points(g, new THREE.PointsMaterial({ map: fxTex('spark'), size: 0.07, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff2cf }));
        this.scene.add(this.dust);
    }

    // ----- time of day: sky, sun, lamps -----
    setDaytime(date) {
        this._lastDate = date;
        const h = date.getHours() + date.getMinutes() / 60;
        // 0 night .. 1 noon
        const day = h < 5.5 || h > 19.5 ? 0 : h < 7 ? (h - 5.5) / 1.5 * 0.5 : h < 17.5 ? 1 : h < 19.5 ? lerp(1, 0.3, (h - 17.5) / 2) : 0;
        const key = day > 0.6 ? 'd' : day > 0.25 ? 's' : 'n';
        if (this._sky !== key) { this._sky = key; if (this.skyM.map) this.skyM.map.dispose(); this.skyM.map = skyTex(day > 0.6 ? 1 : day > 0.25 ? 0.4 : 0); this.skyM.needsUpdate = true; }
        this.day = day;
        this.sun.intensity = 0.15 + day * 2.6; this.sun.color.set(day > 0.6 ? 0xfff0d0 : day > 0.25 ? 0xffb27a : 0x8fa4ff);
        this.hemi.intensity = 0.28 + day * 0.7; this.renderer.toneMappingExposure = 0.78 + day * 0.32;
        this.scene.environmentIntensity = 0.18 + day * 0.4;
        this.warm.forEach((p) => { p.intensity = 3 + (1 - day) * 9; });
        (this.lamps || []).forEach((l) => { l.glow.material.opacity = 0.35 + (1 - day) * 0.6; l.shade.material.emissiveIntensity = 0.3 + (1 - day) * 1.6; });
        this.beam.material.opacity = 0.015 + day * 0.07; this.dust.material.opacity = 0.2 + day * 0.4;
        this.scene.background.set(day > 0.25 ? '#3a3040' : '#15131f');
    }
    setTimer(time, label, sub) {
        const k = time + '|' + label + '|' + sub; if (this._clk === k) return; this._clk = k;
        const m = this.clockMesh.material; if (m.map) m.map.dispose(); m.map = clockTex(label, time, sub); m.needsUpdate = true;
    }

    // ----- people -----
    // list: [{uid, name, char, state: 'study'|'rest'|'sleep', mins}]
    setMembers(list) {
        const keep = new Set();
        list.slice(0, MAXSEAT).forEach((m) => {
            keep.add(m.uid);
            let c = this.chars.get(m.uid);
            if (c && c.defId !== m.char) { this._removeChar(m.uid); c = null; }
            if (!c) c = this._addChar(m);
            else if (Number.isInteger(m.seat) && m.seat >= 0 && m.seat < MAXSEAT && m.seat !== c.seat && ![...this.chars.values()].some((o) => o !== c && o.seat === m.seat)) { c.seat = m.seat; c.P.root.position.copy(this.seatPos[m.seat]); }
            c.name = m.name; c.mins = m.mins || 0;
            if (c.state !== m.state && c.mood !== 'angry' && c.mood !== 'cute' && c.mood !== 'scared') { c.state = m.state; c.moodT = 0; }
            c.state = m.state; c.me = !!m.me;
            this._label(c);
        });
        [...this.chars.keys()].forEach((u) => { if (!keep.has(u)) this._removeChar(u); });
    }
    _freeSeat() { const used = new Set([...this.chars.values()].map((c) => c.seat)); for (let i = 0; i < MAXSEAT; i++) if (!used.has(i)) return i; return 0; }
    _addChar(m) {
        const def = charById(m.char), P = buildCharacter(def), want = Number.isInteger(m.seat) && m.seat >= 0 && m.seat < MAXSEAT && ![...this.chars.values()].some((o) => o.seat === m.seat), seat = want ? m.seat : this._freeSeat();
        P.root.position.copy(this.seatPos[seat]); this.scene.add(P.root);
        if (this.low) P.root.traverse((o) => { if (o.isMesh && o.material === OUTLINE) o.visible = false; });
        const c = { P, seat, uid: m.uid, defId: def.id, def, state: m.state || 'study', mood: '', moodT: 0, t0: Math.random() * 10, blink: 2 + Math.random() * 4, look: 4 + Math.random() * 6, lookTo: 0, pokes: 0, pokeAt: 0, name: m.name, mins: 0, spawn: 0 };
        P.root.scale.setScalar(0.001);
        P.root.rotation.y = ((seat % 2) - 0.5) * -0.08;
        const el = document.createElement('div'); el.className = 'rm-tag'; this.labels.appendChild(el); c.el = el;
        P.pick.traverse((o) => { o.userData.uid = m.uid; }); P.pick.userData.uid = m.uid;
        this.chars.set(m.uid, c);
        return c;
    }
    _removeChar(uid) {
        const c = this.chars.get(uid); if (!c) return;
        this.scene.remove(c.P.root); c.P.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); c.P.faceT.dispose();
        c.el.remove(); const b = this.bubbles.get(uid); if (b) { b.el.remove(); this.bubbles.delete(uid); }
        this.chars.delete(uid);
    }
    _label(c) {
        c.el.className = 'rm-tag' + (c.me ? ' me' : '') + (c.state === 'sleep' ? ' zz' : '');
        c.el.innerHTML = '<b>' + escapeHtml(String(c.name || '')) + '</b><small>' + (c.state === 'study' ? 'يدرس' : c.state === 'sleep' ? 'نايم' : 'استراحة') + (c.mins ? ' · ' + c.mins + 'د' : '') + '</small>';
    }
    say(uid, text, ms) {
        const c = this.chars.get(uid); if (!c) return;
        let b = this.bubbles.get(uid);
        if (!b) { b = { el: document.createElement('div') }; b.el.className = 'rm-bub'; this.labels.appendChild(b.el); this.bubbles.set(uid, b); }
        b.el.textContent = text; b.until = performance.now() + (ms || 2600); b.el.style.opacity = '1';
    }
    // one-shot reactions, the same on every phone
    react(uid, kind, text) {
        const c = this.chars.get(uid); if (!c) return;
        const now = performance.now();
        if (kind === 'poke') {
            c.pokes = now - c.pokeAt < 9000 ? c.pokes + 1 : 1; c.pokeAt = now;
            if (c.pokes === 1) { c.mood = 'surprised'; c.moodT = 1.1; this.say(uid, text || ['هاه؟', 'منو؟', 'أوه!'][Math.floor(Math.random() * 3)], 1500); }
            else { c.mood = 'angry'; c.moodT = c.pokes >= 4 ? 3.6 : 2.4; this.say(uid, text || (c.pokes >= 4 ? 'كافي!! دا أدرس!' : ['لا تضغط علي!', 'هيه، دا أركز!', 'اوف، ليش؟'][Math.floor(Math.random() * 3)]), 2200); }
        } else if (kind === 'pet') { c.mood = 'cute'; c.moodT = 3.2; c.pokes = 0; this.say(uid, text || ['شكراً 💗'.replace(' 💗', ''), 'يعني حبيتك', 'هيهي'][Math.floor(Math.random() * 3)], 2200); }
        else if (kind === 'scared') { c.mood = 'scared'; c.moodT = 1.8; this.say(uid, text || 'آآه! شنو هذا؟', 1800); }
        else if (kind === 'cheer') { c.mood = 'cute'; c.moodT = 2.2; this.say(uid, text || 'تشجع!', 1800); }
        else if (kind === 'hi') { c.mood = 'wave'; c.moodT = 2.4; this.say(uid, text || 'هلا!', 1800); }
        c.P.setExpr(c.mood === 'angry' ? 'angry' : c.mood === 'surprised' || c.mood === 'scared' ? 'surprised' : c.mood === 'cute' ? 'cute' : c.mood === 'wave' ? 'happy' : c.P.expr);
    }
    // the whole room shakes: camera, lamps, books, and the students' papers fly
    shake(power) {
        this.shakeT = 1.4 * clamp(power || 1, 0.4, 1.6); this.shakePow = clamp(power || 1, 0.4, 1.6);
        const n = Math.round(10 * this.shakePow);
        this.papersOn.forEach((p0, i) => {
            if (![...this.chars.values()].some((c) => c.seat === i)) return;
            for (let k = 0; k < n; k++) {
                const m = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), new THREE.MeshStandardMaterial({ color: k % 3 ? '#FFFFFF' : '#FFF4C7', side: THREE.DoubleSide, roughness: 0.9 }));
                m.position.copy(p0); m.position.x += (Math.random() - 0.5) * 0.3; m.castShadow = true;
                m.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 2.4, 2.2 + Math.random() * 2.2, (Math.random() - 0.3) * 2.4), w: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), life: 9, rest: false };
                this.scene.add(m); this.papers.push(m);
            }
        });
        this.chars.forEach((c, uid) => { if (c.mood !== 'angry') this.react(uid, 'scared'); });
    }

    // ----- input: tap, long press, tilt -----
    _input() {
        const el = this.renderer.domElement, ray = new THREE.Raycaster(), v = new THREE.Vector2();
        let down = null, timer = 0, long = false;
        const pick = (e) => {
            const r = el.getBoundingClientRect(); v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
            ray.setFromCamera(v, this.camera);
            const picks = [...this.chars.values()].map((c) => c.P.pick);
            const hit = ray.intersectObjects(picks, false)[0];
            return hit ? hit.object.userData.uid : null;
        };
        el.addEventListener('pointerdown', (e) => {
            down = { x: e.clientX, y: e.clientY, uid: pick(e), t: performance.now() }; long = false;
            if (down.uid) timer = setTimeout(() => { long = true; if (this.onPet) this.onPet(down.uid); }, 520);
        });
        el.addEventListener('pointermove', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) { clearTimeout(timer); down.moved = true; } });
        const up = () => { clearTimeout(timer); if (down && !down.moved && !long && down.uid && performance.now() - down.t < 500 && this.onTap) this.onTap(down.uid); down = null; };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', () => { clearTimeout(timer); down = null; });
    }
    setTilt(x, y) { this.tiltS.set(clamp(x, -1, 1), clamp(y, -1, 1)); }

    // ----- loop -----
    start(active) {
        this._active = active || (() => true); if (this._raf) return; this.clock.getDelta();
        const loop = () => {
            this._raf = requestAnimationFrame(loop);
            if (this._active && !this._active()) return;
            const dt = Math.min(0.05, this.clock.getDelta()); this.t += dt;
            this._frame(dt);
            this._fps(dt);
        };
        this._raf = requestAnimationFrame(loop);
    }
    stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; }
    _fps(dt) {
        this._acc = (this._acc || 0) + dt; this._n = (this._n || 0) + 1;
        if (this._acc > 2.5) { const fps = this._n / this._acc; this._acc = 0; this._n = 0; if (fps < 24 && this.pr > 1) { this.pr = Math.max(1, this.pr - 0.25); this.renderer.setPixelRatio(this.pr); this.resize(); } else if (fps < 20 && !this.low) this._downgrade(); }
    }
    // slow phone: no shadows, no outlines, light pixels
    _downgrade() {
        this.low = true; this.sun.castShadow = false; this.renderer.shadowMap.enabled = false; this.pr = Math.min(this.pr, 1.25); this.renderer.setPixelRatio(this.pr);
        this.scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); } if (o.isMesh && o.material === OUTLINE) o.visible = false; });
        this.resize();
    }
    resize() {
        const w = this.root.clientWidth || 360, h = this.root.clientHeight || 640, tall = w / h < 0.95;
        this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
        if (this._camTall !== tall) {
            this._camTall = tall; this._layout(tall ? 'tall' : 'wide');
            if (tall) { this.camera.position.set(0, 4.0, 9.6); this.controls.target.set(0, 1.3, -0.4); Object.assign(this.controls, { minDistance: 5.5, maxDistance: 12, minPolarAngle: 0.9, maxPolarAngle: 1.6 }); }
            else { this.camera.position.set(0, 4.6, 10.8); this.controls.target.set(0, 1.2, -0.7); Object.assign(this.controls, { minDistance: 6.2, maxDistance: 13.5, minPolarAngle: 0.95, maxPolarAngle: 1.55 }); }
        }
        this.camera.fov = tall ? 52 : w / h < 1.3 ? 46 : 40; this.camera.updateProjectionMatrix();
    }
    _frame(dt) {
        const t = this.t;
        // camera: orbit + small tilt parallax + shake
        this.tilt.lerp(this.tiltS, 0.08);
        this.controls.update();
        const base = this.camera.position.clone();
        this.camera.position.x += this.tilt.x * 0.55; this.camera.position.y += this.tilt.y * 0.3;
        if (this.shakeT > 0) { this.shakeT -= dt; const k = Math.min(1, this.shakeT) * 0.13 * (this.shakePow || 1); this.camera.position.x += (Math.random() - 0.5) * k; this.camera.position.y += (Math.random() - 0.5) * k; }
        this._fr = (this._fr || 0) + 1; if (this._fr % 2 === 0) this.renderer.shadowMap.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
        this.camera.position.copy(base);
        // ambient motion
        if (this.fairy) this.fairy.forEach((g, i) => { g.material.opacity = 0.5 + Math.sin(t * 2 + i) * 0.25; });
        if (this.lamps) { const sw = this.shakeT > 0 ? Math.sin(t * 25) * 0.1 * Math.min(1, this.shakeT) : 0; this.lamps.forEach((l, i) => { l.shade.rotation.z = 0.25 + Math.sin(t * 1.3 + i) * 0.01 + sw; }); }
        if (this.fairyGroup) this.fairyGroup.rotation.z = this.shakeT > 0 ? Math.sin(t * 22) * 0.012 : 0;
        if (this.ball) this.ball.rotation.y += dt * 0.2;
        const pa = this.dust.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) { let y = pa.getY(i) + dt * (0.05 + (i % 5) * 0.012); if (y > 4.3) y = 0.2; pa.setY(i, y); pa.setX(i, pa.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.03); }
        pa.needsUpdate = true;
        // papers
        for (let i = this.papers.length - 1; i >= 0; i--) {
            const p = this.papers[i], u = p.userData; u.life -= dt;
            if (!u.rest) { u.v.y -= 9 * dt; p.position.addScaledVector(u.v, dt); p.rotation.x += u.w.x * dt; p.rotation.y += u.w.y * dt; p.rotation.z += u.w.z * dt; u.v.multiplyScalar(0.995); if (p.position.y < 0.03) { p.position.y = 0.03; u.rest = true; p.rotation.set(-Math.PI / 2, 0, Math.random() * 6); } }
            if (u.life < 1) { p.scale.setScalar(Math.max(0.01, u.life)); }
            if (u.life <= 0) { this.scene.remove(p); p.geometry.dispose(); p.material.dispose(); this.papers.splice(i, 1); }
        }
        // characters
        const v = new THREE.Vector3(), w = this.root.clientWidth, h = this.root.clientHeight, now = performance.now();
        this.chars.forEach((c) => {
            this._animate(c, dt, t);
            v.copy(c.P.root.position); v.y += 1.5 * c.P.root.scale.y; v.project(this.camera);
            const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h, vis = v.z < 1;
            c.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + (y - 6).toFixed(1) + 'px) translate(-50%,-100%)'; c.el.style.display = vis ? '' : 'none';
            const b = this.bubbles.get(c.uid);
            if (b) { if (now > b.until) { b.el.style.opacity = '0'; } b.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + (y - 50).toFixed(1) + 'px) translate(-50%,-100%)'; }
        });
    }
    _animate(c, dt, t) {
        const P = c.P, T = t + c.t0, root = P.root;
        // grow in
        c.spawn = Math.min(1, c.spawn + dt * 2.2); const sp = c.spawn < 1 ? 1 - Math.pow(1 - c.spawn, 3) + Math.sin(c.spawn * Math.PI) * 0.15 : 1;
        root.scale.setScalar(Math.max(0.001, sp * 1.12));
        // mood timer
        if (c.moodT > 0) { c.moodT -= dt; if (c.moodT <= 0) { c.mood = ''; c.pokes = performance.now() - c.pokeAt < 9000 ? c.pokes : 0; } }
        const mood = c.mood, st = c.state;
        // expression
        let ex = mood === 'angry' ? 'angry' : mood === 'surprised' || mood === 'scared' ? 'surprised' : mood === 'cute' ? 'cute' : mood === 'wave' ? 'happy' : st === 'sleep' ? 'sleepy' : 'norm';
        if (!mood) {
            c.blink -= dt;
            if (c.blink < 0.12 && st !== 'sleep') ex = 'blink';
            if (c.blink < 0) c.blink = 2.5 + Math.random() * 4;
            if (st === 'rest' && Math.sin(T * 0.4) > 0.92) ex = c.def.wink ? 'wink' : 'happy';
        }
        P.setExpr(ex);
        // body
        const breathe = 1 + Math.sin(T * 2.1) * 0.012;
        P.torso.scale.y = breathe;
        let headX = 0, headY = 0, headZ = 0, bob = 0;
        let rx = -0.35, rex = -0.2, lx = -0.25, lex = -0.15, rz = 0, lz = 0;
        if (st === 'study' && !mood) {
            headX = 0.3 + Math.sin(T * 0.8) * 0.04; headY = Math.sin(T * 0.37) * 0.08;
            c.look -= dt; if (c.look < 0) { c.lookTo = 0.9; if (c.look < -1.2) { c.look = 5 + Math.random() * 8; c.lookTo = 0; } }
            headX -= (c.lookTo || 0) * 0.3 * Math.sin(Math.min(1, -c.look / 0.3) * 1.2 + 0.001);
            rx = -1.15; rex = -0.55 + Math.sin(T * 8) * 0.07; lx = -0.95; lex = -0.7;
            P.R.sh.rotation.z = -0.15 + Math.sin(T * 4) * 0.03;
        } else if (st === 'sleep' && !mood) {
            headX = 0.62 + Math.sin(T * 1.2) * 0.03; headZ = 0.1; rx = lx = -0.5; rex = lex = -0.3; bob = Math.sin(T * 1.2) * 0.01;
        } else if (!mood) {
            headY = Math.sin(T * 0.5) * 0.35; headX = Math.sin(T * 0.7) * 0.06; headZ = Math.sin(T * 0.9) * 0.04;
            rx = -0.4 + Math.sin(T * 0.8) * 0.08; lx = -0.3; rex = -0.35; lex = -0.25;
            // chin on hand now and then (like the reference picture)
            if (Math.sin(T * 0.23) > 0.55) { lx = -2.0; lex = -1.5; headZ = 0.14; lz = 0.3; }
        }
        if (mood === 'angry') { const k = Math.sin(T * 38) * 0.06; headZ = k; headY = Math.sin(T * 30) * 0.05; rx = lx = -0.2; P.R.sh.rotation.z = -0.5; P.L.sh.rotation.z = 0.5; rex = lex = -1.9; bob = Math.abs(Math.sin(T * 14)) * 0.02; }
        else if (mood === 'cute') { bob = Math.abs(Math.sin(T * 7)) * 0.07; headZ = Math.sin(T * 6) * 0.12; rx = -2.4 + Math.sin(T * 9) * 0.1; lx = -2.4 - Math.sin(T * 9) * 0.1; rex = lex = -0.4; headX = -0.05; }
        else if (mood === 'scared') { bob = Math.max(0, Math.sin(Math.min(1, (1.8 - c.moodT) * 2.2) * Math.PI)) * 0.2; rx = lx = -2.6; rex = lex = -0.5; headX = -0.2; headZ = Math.sin(T * 40) * 0.03; }
        else if (mood === 'surprised') { bob = 0.03; headX = -0.12; }
        else if (mood === 'wave') { rx = -3.0 + Math.sin(T * 10) * 0.3; rex = -0.3; headZ = 0.1; headY = 0.2; }
        const k = Math.min(1, dt * 10), ease = (a, b) => a + (b - a) * k;
        const H = P.head; H.rotation.x = ease(H.rotation.x, headX); H.rotation.y = ease(H.rotation.y, headY); H.rotation.z = ease(H.rotation.z, headZ);
        P.R.sh.rotation.x = ease(P.R.sh.rotation.x, rx); P.R.el.rotation.x = ease(P.R.el.rotation.x, rex); P.L.sh.rotation.x = ease(P.L.sh.rotation.x, lx); P.L.el.rotation.x = ease(P.L.el.rotation.x, lex);
        if (mood !== 'angry') { P.R.sh.rotation.z = ease(P.R.sh.rotation.z, rz); P.L.sh.rotation.z = ease(P.L.sh.rotation.z, lz); }
        H.position.y = P.base.headY + bob + Math.sin(T * 2.1) * 0.006;
        root.position.y = this.seatPos[c.seat].y + (mood === 'cute' || mood === 'scared' ? bob * 0.6 : 0);
        P.sway.forEach((m, i) => { m.rotation.z = (m.userData.base || 0) + Math.sin(T * 1.6 + i) * 0.04 + (mood === 'angry' ? Math.sin(T * 30) * 0.06 : 0); });
        P.ears.forEach((e, i) => { const b = e.userData.base; if (b !== undefined) e.rotation.z = b + Math.sin(T * 1.3 + i) * 0.04 + (mood === 'cute' ? Math.sin(T * 9) * 0.12 : 0) + (mood === 'angry' ? (i ? -0.2 : 0.2) : 0); });
        P.vein.visible = mood === 'angry'; if (P.vein.visible) P.vein.scale.setScalar(0.3 + Math.abs(Math.sin(T * 12)) * 0.07);
        P.steam.visible = mood === 'angry' && c.pokes >= 4; if (P.steam.visible) { P.steam.position.y = 0.8 + ((T * 0.8) % 0.4); P.steam.material.opacity = 1 - ((T * 0.8) % 0.4) / 0.4; }
        P.zzz.visible = st === 'sleep' && !mood; if (P.zzz.visible) { P.zzz.position.y = 0.88 + Math.sin(T * 1.5) * 0.06; }
        P.hearts.forEach((h, i) => {
            if (mood === 'cute') {
                h.visible = true; const u = ((T * 0.9 + i * 0.25) % 1); h.position.set(Math.sin(u * 6 + i * 2) * 0.3, 1.3 + u * 0.8, 0.15 + (i % 2) * 0.1); h.material.opacity = 1 - Math.pow(u, 3); h.scale.setScalar(0.12 + 0.12 * Math.sin(Math.min(1, u * 3) * Math.PI / 2));
            } else h.visible = false;
        });
    }
    dispose() {
        this.stop(); this._ro.disconnect(); this.chars.forEach((c, u) => this._removeChar(u)); this.papers.forEach((p) => this.scene.remove(p));
        this.renderer.dispose(); this.renderer.domElement.remove(); this.labels.remove();
    }
}
