// رسم الشخصيات: soft, cute anime busts (big sparkly eyes, flowing hair, pastel clothes) painted with the canvas, in
// layers that the 3D room (js/room3d.js) stands in the room and moves a little (breathing, blinking, hair sway, a hand
// writing, a hand on the cheek). Everything is drawn here in code, so there are no image files to download.
// A bust is 512x512; every layer shares that box, so the layers line up when stacked.
export const CHARS = [
    { id: 'lulu', n: 'لولو', g: 'f', unlock: 0, hair: 'long', bangs: 'center', hc: '#EFD7A3', hs: '#FFF2D2', skin: '#FFE9DE', eye: '#5B6CF2', eye2: '#9AA8FF', outfit: 'cardigan', top: '#F6C3D2', topD: '#E39FB6', inner: '#FFFFFF', ears: 'dog', earC: '#E6C690', acc: 'bow', accC: '#F27A9E', wink: true, about: 'بنت خجولة ودودة' },
    { id: 'rio', n: 'ريو', g: 'm', unlock: 0, hair: 'short', bangs: 'spiky', hc: '#7A5238', hs: '#A5764F', skin: '#FFE0CC', eye: '#2E9577', eye2: '#7FE0BF', outfit: 'hoodie', top: '#5A8FE0', topD: '#3F6FC0', inner: '#FFFFFF', ears: '', acc: 'headphones', accC: '#F4F1EA', about: 'ولد نشيط وهادي' },
    { id: 'mimi', n: 'ميمي', g: 'f', unlock: 15, hair: 'twin', bangs: 'straight', hc: '#F7A9CB', hs: '#FFD3E6', skin: '#FFE9DE', eye: '#E0539F', eye2: '#FFA0D0', outfit: 'sailor', top: '#FFFFFF', topD: '#E6DFF0', inner: '#FFFFFF', coll: '#F27AAB', ears: 'cat', earC: '#F7A9CB', acc: 'band', accC: '#FFFFFF', about: 'قطوة شقية' },
    { id: 'soma', n: 'سوما', g: 'm', unlock: 30, hair: 'short', bangs: 'side', hc: '#C8D2E0', hs: '#EEF3FA', skin: '#FFE5D5', eye: '#7B5CF0', eye2: '#B9A8FF', outfit: 'uniform', top: '#34405F', topD: '#262F49', inner: '#FFFFFF', coll: '#C8423B', ears: '', acc: 'glasses', accC: '#2B2B38', about: 'ذكي ورزين' },
    { id: 'nana', n: 'نانا', g: 'f', unlock: 60, hair: 'bob', bangs: 'straight', hc: '#2D2433', hs: '#5A4B68', skin: '#FFE6D8', eye: '#D4493F', eye2: '#FF9A8F', outfit: 'sailor', top: '#F7F7FB', topD: '#DCDCEA', inner: '#FFFFFF', coll: '#2E3C75', ears: '', acc: 'ribbon', accC: '#D4493F', about: 'جدّية وقوية' },
    { id: 'yuki', n: 'يوكي', g: 'f', unlock: 100, hair: 'ponytail', bangs: 'center', hc: '#BCE2F7', hs: '#EAF8FF', skin: '#FFEDE3', eye: '#4AA3E8', eye2: '#9BD5FF', outfit: 'scarf', top: '#F2FAFF', topD: '#CFE6F5', inner: '#FFFFFF', ears: '', acc: 'scarf', accC: '#E86A7A', about: 'هادية مثل الثلج' },
    { id: 'hiro', n: 'هيرو', g: 'm', unlock: 160, hair: 'short', bangs: 'spiky', hc: '#F28A2E', hs: '#FFC27A', skin: '#FFDCC4', eye: '#E8A100', eye2: '#FFD966', outfit: 'hoodie', top: '#F7D54A', topD: '#DDB92B', inner: '#FFFFFF', ears: '', acc: 'band', accC: '#D9402B', about: 'حماسي ما يكل' },
    { id: 'koko', n: 'كوكو', g: 'm', unlock: 240, hair: 'short', bangs: 'center', hc: '#7ACB8C', hs: '#B2EBBE', skin: '#FFE5D5', eye: '#3A9E73', eye2: '#8CE8BF', outfit: 'bear', top: '#C99C6C', topD: '#A98050', inner: '#FFFFFF', ears: 'bear', earC: '#C99C6C', acc: '', about: 'دبدوب لطيف' },
    { id: 'remi', n: 'ريمي', g: 'f', unlock: 360, hair: 'bun', bangs: 'center', hc: '#9D7DDD', hs: '#C9B3F5', skin: '#FFE9DE', eye: '#7F5AE0', eye2: '#B9A0FF', outfit: 'sweater', top: '#D9CDF6', topD: '#B9A8E6', inner: '#FFFFFF', ears: '', acc: 'glasses', accC: '#F4F1EA', about: 'دودة كتب' },
    { id: 'saki', n: 'ساكي', g: 'f', unlock: 520, hair: 'buns', bangs: 'straight', hc: '#E2483C', hs: '#FF8A7B', skin: '#FFE6D8', eye: '#F29B1D', eye2: '#FFD27A', outfit: 'cardigan', top: '#FFF1F3', topD: '#EBCBD2', inner: '#FFFFFF', ears: 'cat', earC: '#E2483C', acc: 'ribbon', accC: '#FFFFFF', about: 'نار وحماس' },
    { id: 'ren', n: 'رين', g: 'm', unlock: 700, hair: 'long', bangs: 'side', hc: '#F4F1EA', hs: '#FFFFFF', skin: '#FFE9DE', eye: '#E0734A', eye2: '#FFB38F', outfit: 'robe', top: '#3D3552', topD: '#2B253F', inner: '#E9E4F2', ears: 'fox', earC: '#F4F1EA', acc: '', about: 'ثعلب غامض' },
];
export const charById = (id) => CHARS.find((c) => c.id === id) || CHARS[0];

// ---------- colour and path helpers ----------
const S = 512;
function rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function hsl(h) { let [r, g, b] = rgb(h).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let H = 0, Sa = 0; const L = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; Sa = L > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); H = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H /= 6; } return [H, Sa, L]; }
function hex(H, Sa, L) { const f = (n) => { const k = (n + H * 12) % 12, a = Sa * Math.min(L, 1 - L); return Math.round(255 * (L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join(''); }
const tone = (h, dl, ds = 0, dh = 0) => { const [H, Sa, L] = hsl(h); return hex((H + dh + 1) % 1, Math.max(0, Math.min(1, Sa + ds)), Math.max(0.03, Math.min(0.97, L + dl))); };
const rgba = (h, a) => { const [r, g, b] = rgb(h); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; };
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };
const cq = (q) => { const c = cv(Math.round(S * (q || 1))); const g = c.getContext('2d'); g.scale((q || 1) * (c.width / Math.round(S * (q || 1))), (q || 1)); return [c, g]; };
// a smooth closed (or open) curve through the points
function curve(g, pts, closed = true, k = 0.5) {
    const n = pts.length; g.moveTo(pts[0][0], pts[0][1]);
    const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    const m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
        g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k / 3 * 1.0, p1[1] + (p2[1] - p0[1]) * k / 3 * 1.0, p2[0] - (p3[0] - p1[0]) * k / 3, p2[1] - (p3[1] - p1[1]) * k / 3, p2[0], p2[1]);
    }
    if (closed) g.closePath();
}
const mir = (pts) => pts.map(([x, y]) => [S - x, y]);
// fill with a vertical gradient, soft shade at the bottom and a coloured outline
function shape(g, pts, o) {
    g.save(); g.beginPath(); curve(g, pts, o.closed !== false, o.k || 0.5);
    const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, o.c1 || o.c); gr.addColorStop(1, o.c2 || tone(o.c, -0.1));
    g.fillStyle = gr; g.fill();
    if (o.shade) { g.clip(); const f = y0 + (y1 - y0) * (o.shadeFrom || 0.62), sg = g.createLinearGradient(0, f, 0, y1); sg.addColorStop(0, rgba(o.shade, 0)); sg.addColorStop(1, rgba(o.shade, o.shadeA || 0.35)); g.fillStyle = sg; g.fillRect(0, f, S, S); }
    g.restore();
    if (o.line !== false) { g.save(); g.beginPath(); curve(g, pts, o.closed !== false, o.k || 0.5); g.lineWidth = o.lw || 4; g.lineJoin = 'round'; g.strokeStyle = o.line || tone(o.c, -0.28, 0.05); g.stroke(); g.restore(); }
}
function strand(g, pts, col, w, a = 1) { g.save(); g.beginPath(); curve(g, pts, false, 0.6); g.strokeStyle = col; g.globalAlpha = a; g.lineWidth = w; g.lineCap = 'round'; g.stroke(); g.restore(); }
function blob(g, x, y, rx, ry, col, a = 1, rot = 0) { g.save(); g.globalAlpha = a; g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); g.restore(); }
function glow(g, x, y, r, col, a) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }

// ---------- hair: the part behind the head ----------
function hairBack(g, d) {
    const hc = d.hc, lineC = tone(hc, -0.3), L = (pts, o) => shape(g, pts, Object.assign({ c: hc, c1: tone(hc, 0.04), c2: tone(hc, -0.12), shade: tone(hc, -0.35), line: lineC }, o || {}));
    const strands = (arr) => arr.forEach((a) => strand(g, a, tone(hc, -0.2), 3, 0.5));
    // animal / bun parts that sit behind the cap
    if (d.ears === 'cat' || d.ears === 'fox') [[0, 1], [1, -1]].forEach(([i, s]) => { const x = s > 0 ? 345 : 167, tip = s > 0 ? [405, 22] : [107, 22]; shape(g, [[x - 55 * s, 120], [tip[0], tip[1]], [x + 52 * s, 130]], { c: d.earC, c2: tone(d.earC, -0.08), k: 0.15, lw: 4 }); shape(g, [[x - 28 * s, 112], [tip[0] - 4 * s, 56], [x + 26 * s, 120]], { c: d.ears === 'fox' ? '#4A3F5E' : '#FFC8D8', k: 0.15, line: false }); });
    if (d.ears === 'bear') [-1, 1].forEach((s) => { const x = 256 + s * 130; blob(g, x, 80, 56, 56, tone(d.earC, -0.2)); blob(g, x, 80, 52, 52, d.earC); blob(g, x, 84, 30, 28, '#F5CFA7'); });
    if (d.hair === 'long') {
        L([[84, 170], [58, 260], [48, 380], [66, 470], [130, 508], [256, 516], [382, 508], [446, 470], [464, 380], [454, 260], [428, 170], [256, 60]]);
        strands([[[120, 240], [100, 340], [92, 450]], [[170, 250], [160, 360], [150, 480]], [[342, 250], [352, 360], [362, 480]], [[392, 240], [412, 340], [420, 450]]]);
    } else if (d.hair === 'twin') {
        [-1, 1].forEach((s) => { const X = (x) => 256 + s * (x - 256); L([[X(120), 120], [X(40), 190], [X(14), 300], [X(30), 410], [X(78), 490], [X(112), 440], [X(100), 360], [X(120), 270], [X(150), 190]], { k: 0.6 }); strand(g, [[X(66), 230], [X(46), 320], [X(70), 440]], tone(hc, -0.2), 3, 0.5); strand(g, [[X(90), 250], [X(84), 340], [X(96), 430]], tone(hc, 0.1), 4, 0.5); });
        L([[100, 160], [256, 60], [412, 160], [420, 300], [256, 330], [92, 300]]);
    } else if (d.hair === 'bob') {
        L([[84, 190], [70, 290], [92, 372], [150, 404], [256, 412], [362, 404], [420, 372], [442, 290], [428, 190], [256, 50]], { k: 0.55 });
    } else if (d.hair === 'ponytail') {
        L([[96, 190], [84, 280], [130, 330], [256, 340], [382, 330], [428, 280], [416, 190], [256, 50]]);
        L([[392, 120], [470, 170], [496, 290], [470, 420], [420, 500], [408, 430], [430, 330], [410, 240], [380, 170]], { k: 0.6 }); strand(g, [[440, 190], [462, 300], [440, 430]], tone(hc, -0.2), 3, 0.5);
    } else if (d.hair === 'bun') {
        blob(g, 256, 56, 64, 60, tone(hc, -0.28)); blob(g, 256, 56, 60, 56, hc); strand(g, [[220, 40], [256, 28], [292, 40]], d.hs, 6, 0.6);
        L([[96, 190], [84, 280], [130, 320], [256, 330], [382, 320], [428, 280], [416, 190], [256, 50]]);
    } else if (d.hair === 'buns') {
        [-1, 1].forEach((s) => { const x = 256 + s * 150; blob(g, x, 78, 62, 60, tone(hc, -0.28)); blob(g, x, 78, 58, 56, hc); strand(g, [[x - 30, 58], [x, 46], [x + 30, 58]], d.hs, 6, 0.6); });
        L([[96, 190], [84, 280], [130, 330], [256, 340], [382, 330], [428, 280], [416, 190], [256, 50]]);
    } else { // short
        L([[92, 190], [86, 262], [124, 296], [256, 306], [388, 296], [426, 262], [420, 190], [256, 50]]);
    }
}

// ---------- the head: skin and the face (expression drawn in) ----------
const FACE = [[256, 92], [338, 106], [396, 168], [410, 244], [386, 306], [322, 348], [256, 360], [190, 348], [126, 306], [102, 244], [116, 168], [174, 106]];
function eye(g, d, cx, cy, side, ex) {
    const dark = '#3A2430', s = side;
    const closedArc = (up) => { g.save(); g.lineCap = 'round'; g.strokeStyle = dark; g.lineWidth = 9; g.beginPath(); if (up) g.arc(cx, cy + 22, 36, 1.12 * Math.PI, 1.88 * Math.PI); else g.arc(cx, cy - 14, 36, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke(); g.lineWidth = 6; g.beginPath(); g.moveTo(cx + s * 34, cy + (up ? 10 : 8)); g.lineTo(cx + s * 52, cy + (up ? 0 : 20)); g.stroke(); g.restore(); };
    if (ex === 'happy' || ex === 'cute-closed') { closedArc(true); return; }
    if (ex === 'blink') { closedArc(false); return; }
    const big = ex === 'surprised' ? 1.12 : 1, rx = 38 * big, ry = 52 * big;
    g.save(); g.translate(cx, cy); if (ex === 'angry') g.rotate(s * 0.1);
    // eye shape (white) and a soft lid shadow
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill();
    const lid = g.createLinearGradient(0, -ry, 0, 0); lid.addColorStop(0, 'rgba(120,90,110,.45)'); lid.addColorStop(1, 'rgba(120,90,110,0)'); g.save(); g.clip(); g.fillStyle = lid; g.fillRect(-rx, -ry, rx * 2, ry); g.restore();
    // iris
    const irx = rx * (ex === 'surprised' ? 0.66 : 0.86), iry = ry * (ex === 'surprised' ? 0.74 : 0.9), iy = ry * 0.06;
    g.save(); g.beginPath(); g.ellipse(0, 0, rx - 1, ry - 1, 0, 0, Math.PI * 2); g.clip();
    const ir = g.createLinearGradient(0, iy - iry, 0, iy + iry); ir.addColorStop(0, tone(d.eye, -0.34)); ir.addColorStop(0.5, d.eye); ir.addColorStop(1, d.eye2);
    g.beginPath(); g.ellipse(0, iy, irx, iry, 0, 0, Math.PI * 2); g.fillStyle = ir; g.fill();
    g.lineWidth = 3; g.strokeStyle = tone(d.eye, -0.4); g.stroke();
    if (ex === 'cute' || ex === 'love') { g.fillStyle = '#FF5A8E'; g.beginPath(); const h = 20; g.moveTo(0, iy + h * 1.1); g.bezierCurveTo(-h * 1.7, iy - h * 0.2, -h * 0.7, iy - h * 1.5, 0, iy - h * 0.5); g.bezierCurveTo(h * 0.7, iy - h * 1.5, h * 1.7, iy - h * 0.2, 0, iy + h * 1.1); g.fill(); }
    else { g.fillStyle = '#21122A'; g.beginPath(); g.ellipse(0, iy + 2, irx * (ex === 'surprised' ? 0.3 : 0.46), iry * (ex === 'surprised' ? 0.34 : 0.52), 0, 0, Math.PI * 2); g.fill(); }
    // lower glow
    glow(g, 0, iy + iry * 0.55, irx * 0.9, d.eye2, 0.55);
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(-irx * 0.3, iy - iry * 0.4, irx * 0.34, iry * 0.28, -0.2, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.95; g.beginPath(); g.ellipse(irx * 0.36, iy + iry * 0.42, irx * 0.15, iry * 0.12, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 0.8; g.beginPath(); g.arc(irx * 0.5, iy - iry * 0.1, 4, 0, Math.PI * 2); g.fill();
    if (ex === 'sad') { glow(g, 0, iy + iry * 0.8, irx, '#CFEFFF', 0.9); }
    g.restore();
    // lids
    if (ex === 'sleepy' || ex === 'angry') { g.save(); g.fillStyle = d.skin; g.beginPath(); const cut = ex === 'sleepy' ? 0.0 : -0.28; g.rect(-rx - 6, -ry - 6, rx * 2 + 12, ry * (1 + cut) + 6); g.fill(); g.restore(); }
    // upper lash (thick), outer flick, lower lash (thin)
    g.lineCap = 'round'; g.strokeStyle = dark; g.lineWidth = ex === 'sleepy' ? 9 : 11; g.beginPath();
    if (ex === 'sleepy') { g.moveTo(-rx, 2); g.quadraticCurveTo(0, 14, rx, 2); } else if (ex === 'angry') { g.moveTo(-rx, -ry * 0.28 - s * 0); g.quadraticCurveTo(0, -ry * 0.22, rx, -ry * 0.22); } else g.ellipse(0, 0, rx + 1, ry + 1, 0, Math.PI * 1.06, Math.PI * 1.94);
    g.stroke();
    g.lineWidth = 7; g.beginPath(); g.moveTo(s * rx * 0.88, -ry * 0.58); g.quadraticCurveTo(s * rx * 1.2, -ry * 0.78, s * rx * 1.3, -ry * 1.0); g.stroke();
    g.lineWidth = 3; g.globalAlpha = 0.55; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, Math.PI * 0.12, Math.PI * 0.88); g.stroke(); g.globalAlpha = 1;
    g.restore();
}
function brows(g, d, ex) {
    const col = tone(d.hc, -0.34);
    [[-1, 190], [1, 322]].forEach(([s, cx]) => {
        const y = ex === 'surprised' ? 156 : 172;
        g.save(); g.strokeStyle = col; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath();
        if (ex === 'angry') { g.moveTo(cx - s * 34, y - 10); g.lineTo(cx + s * 34, y + 14); } else if (ex === 'sad' || ex === 'sleepy') { g.moveTo(cx - s * 34, y + 6); g.quadraticCurveTo(cx, y - 8, cx + s * 34, y - 6); }
        else { g.moveTo(cx - 32, y + 4); g.quadraticCurveTo(cx, y - 8, cx + 32, y + 2); }
        g.stroke(); g.restore();
    });
}
function mouth(g, d, ex) {
    const x = 256, y = 322, dark = '#8A4152';
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = dark; g.lineWidth = 5; g.beginPath();
    if (ex === 'happy' || ex === 'cute' || ex === 'love') { g.moveTo(x - 24, y - 6); g.quadraticCurveTo(x, y + 36, x + 24, y - 6); g.closePath(); g.fillStyle = '#E9707F'; g.fill(); g.stroke(); g.save(); g.clip(); blob(g, x, y + 22, 14, 10, '#FF9AA8'); g.restore(); }
    else if (ex === 'angry') { g.moveTo(x - 22, y + 10); g.lineTo(x - 11, y - 2); g.lineTo(x, y + 10); g.lineTo(x + 11, y - 2); g.lineTo(x + 22, y + 10); g.stroke(); }
    else if (ex === 'surprised') { g.ellipse(x, y + 6, 13, 18, 0, 0, Math.PI * 2); g.fillStyle = '#B34A5C'; g.fill(); g.stroke(); }
    else if (ex === 'sad') { g.moveTo(x - 20, y + 10); g.quadraticCurveTo(x, y - 8, x + 20, y + 10); g.stroke(); }
    else if (ex === 'sleepy') { g.ellipse(x, y + 4, 9, 7, 0, 0, Math.PI * 2); g.stroke(); }
    else { g.moveTo(x - 20, y - 2); g.quadraticCurveTo(x - 10, y + 12, x, y + 1); g.quadraticCurveTo(x + 10, y + 12, x + 20, y - 2); g.stroke(); }
    g.restore();
}
export function drawHead(d, ex, q, into) {
    let c, g;
    if (into) { c = into; g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.scale(c.width / S, c.width / S); } else [c, g] = cq(q);
    // ears (skin) behind the face
    [-1, 1].forEach((s) => { blob(g, 256 + s * 148, 262, 24, 34, tone(d.skin, -0.04)); });
    // skin with soft shading
    shape(g, FACE, { c: d.skin, c1: tone(d.skin, 0.03), c2: tone(d.skin, -0.05, 0.02), line: tone(d.skin, -0.22, 0.06), lw: 3, shade: tone(d.skin, -0.18, 0.06), shadeA: 0.35, shadeFrom: 0.8, k: 0.55 });
    g.save(); g.beginPath(); curve(g, FACE, true, 0.55); g.clip();
    // shadow of the fringe on the forehead
    const fr = g.createLinearGradient(0, 90, 0, 200); fr.addColorStop(0, rgba(tone(d.skin, -0.28, 0.1), 0.55)); fr.addColorStop(1, rgba(tone(d.skin, -0.28, 0.1), 0)); g.fillStyle = fr; g.fillRect(0, 80, S, 130);
    // blush
    const bl = ex === 'cute' || ex === 'love' ? 0.85 : ex === 'angry' ? 0.65 : 0.5, bc = ex === 'angry' ? '#FF4F5E' : '#FF7C9C';
    glow(g, 168, 292, 56, bc, bl); glow(g, 344, 292, 56, bc, bl);
    if (ex === 'cute' || ex === 'love') { [[150, 300], [346, 300]].forEach(([x, y]) => { g.strokeStyle = rgba('#FF4F7B', 0.6); g.lineWidth = 3; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x + i * 14, y); g.lineTo(x + i * 14 + 8, y + 18); g.stroke(); } }); }
    g.restore();
    // nose
    g.save(); g.strokeStyle = rgba(tone(d.skin, -0.3, 0.15), 0.7); g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(252, 292); g.quadraticCurveTo(256, 298, 261, 292); g.stroke(); g.restore();
    const e = ex === 'wink' ? 'norm' : ex;
    brows(g, d, ex);
    eye(g, d, 190, 252, -1, e === 'cute' ? 'cute' : e);
    eye(g, d, 322, 252, 1, ex === 'wink' ? 'happy' : e === 'cute' ? 'cute' : e);
    mouth(g, d, ex === 'wink' ? 'happy' : ex);
    if (ex === 'sad') { g.save(); g.fillStyle = 'rgba(160,220,255,.85)'; g.beginPath(); g.moveTo(352, 292); g.quadraticCurveTo(364, 316, 352, 330); g.quadraticCurveTo(340, 316, 352, 292); g.fill(); g.restore(); }
    return c;
}

// ---------- the front hair: cap, fringe, side locks, ears and things worn on the head ----------
function bangsFor(style) {
    // [x of the root, half width, tip x, tip y]
    if (style === 'spiky') return [[126, 34, 104, 186], [176, 34, 156, 206], [226, 30, 214, 180], [262, 28, 268, 166], [304, 30, 344, 200], [350, 34, 384, 190], [392, 30, 408, 178]];
    if (style === 'straight') return [[130, 36, 122, 180], [182, 32, 178, 188], [232, 32, 232, 184], [282, 32, 284, 188], [332, 32, 338, 184], [382, 34, 392, 178]];
    if (style === 'side') return [[128, 36, 152, 196], [184, 38, 224, 190], [244, 38, 296, 182], [306, 36, 346, 168], [366, 32, 388, 178], [404, 24, 408, 188]];
    return [[130, 34, 116, 182], [182, 34, 178, 196], [230, 28, 238, 170], [256, 22, 256, 150], [282, 28, 274, 170], [330, 34, 334, 196], [382, 34, 396, 182]]; // center part
}
export function drawFront(d, q) {
    const [c, g] = cq(q), hc = d.hc, lineC = tone(hc, -0.32);
    const L = (pts, o) => shape(g, pts, Object.assign({ c: hc, c1: tone(hc, 0.05), c2: tone(hc, -0.1), shade: tone(hc, -0.3), shadeA: 0.3, line: lineC }, o || {}));
    // floppy dog ears hang over the hair at the sides
    if (d.ears === 'dog') [-1, 1].forEach((s) => { const X = (x) => 256 + s * (x - 256); L([[X(142), 110], [X(98), 128], [X(58), 196], [X(40), 290], [X(66), 346], [X(112), 316], [X(132), 236], [X(150), 160]], { c: d.earC, c1: tone(d.earC, 0.04), c2: tone(d.earC, -0.1), shade: tone(d.earC, -0.3), line: tone(d.earC, -0.3), k: 0.6 }); strand(g, [[X(100), 150], [X(76), 240], [X(86), 314]], tone(d.earC, -0.16), 4, 0.5); blob(g, X(98), 230, 14, 48, tone(d.earC, 0.1), 0.45, s * 0.1); });
    // the cap of hair over the head
    L([[96, 238], [88, 172], [110, 108], [168, 60], [256, 40], [344, 60], [402, 108], [424, 172], [416, 238], [392, 186], [330, 150], [256, 136], [182, 150], [120, 186]], { k: 0.55 });
    // angel ring and strands on the cap
    g.save(); g.beginPath(); curve(g, [[96, 238], [88, 172], [110, 108], [168, 60], [256, 40], [344, 60], [402, 108], [424, 172], [416, 238], [256, 140]], true, 0.55); g.clip();
    g.save(); g.filter = 'blur(6px)'; strand(g, [[116, 150], [180, 100], [256, 88], [332, 100], [396, 150]], d.hs, 26, 0.85); g.restore();
    [[150, 60], [200, 48], [256, 42], [312, 48], [362, 60]].forEach((p, i) => strand(g, [p, [p[0] + (i - 2) * 14, p[1] + 60], [p[0] + (i - 2) * 26, p[1] + 120]], tone(hc, -0.2), 2.4, 0.3));
    g.restore();
    // fringe locks
    bangsFor(d.bangs).forEach(([rx, hw, tx, ty], i) => {
        const y0 = 120, mid = (y0 + ty) / 2;
        L([[rx - hw, y0], [rx - hw - 6, mid], [tx - 6, ty - 8], [tx, ty], [tx + 6, ty - 8], [rx + hw + 6, mid], [rx + hw, y0]], { k: 0.4, lw: 3.5, c1: i % 2 ? tone(hc, 0.07) : tone(hc, 0.02) });
        strand(g, [[rx - hw * 0.35, y0 + 14], [(rx + tx) / 2 - hw * 0.2, mid], [tx - 2, ty - 18]], d.hs, 2.6, 0.38);
    });
    // side locks framing the face
    const sidelen = d.hair === 'long' ? 470 : d.hair === 'bob' ? 372 : d.hair === 'short' ? 300 : 360;
    [-1, 1].forEach((s) => { const X = (x) => 256 + s * (x - 256); L([[X(110), 150], [X(92), 230], [X(96), 300], [X(84), (sidelen + 300) / 2], [X(72), sidelen], [X(112), sidelen - 40], [X(128), 320], [X(130), 230], [X(142), 160]], { k: 0.55, lw: 3.5 }); strand(g, [[X(108), 200], [X(104), 290], [X(94), sidelen - 40]], d.hs, 3.5, 0.5); });
    // spikes on the top for short boyish hair
    if (d.hair === 'short' && d.bangs === 'spiky') [[200, 54, 188, 6], [256, 40, 262, -6], [312, 54, 330, 8], [150, 76, 124, 34], [362, 76, 392, 34]].forEach(([x, y, tx, ty]) => L([[x - 28, y + 20], [tx, ty], [x + 28, y + 20]], { k: 0.2, lw: 3.5 }));
    // things worn on the head
    const A = d.acc;
    if (A === 'band') { g.save(); g.beginPath(); curve(g, [[100, 150], [150, 100], [256, 82], [362, 100], [412, 150]], false, 0.6); g.lineWidth = 20; g.strokeStyle = tone(d.accC, -0.2); g.lineCap = 'round'; g.stroke(); g.lineWidth = 14; g.strokeStyle = d.accC; g.stroke(); g.restore(); }
    if (A === 'headphones') { g.save(); g.beginPath(); curve(g, [[80, 250], [90, 130], [256, 50], [422, 130], [432, 250]], false, 0.6); g.lineWidth = 16; g.strokeStyle = '#33415F'; g.lineCap = 'round'; g.stroke(); g.restore(); [-1, 1].forEach((s) => { shape(g, [[256 + s * 164, 214], [256 + s * 190, 244], [256 + s * 190, 300], [256 + s * 164, 330], [256 + s * 140, 300], [256 + s * 140, 244]], { c: '#4A5C86', c2: '#33415F', k: 0.4 }); blob(g, 256 + s * 170, 272, 9, 22, '#7C93C8', 0.6); }); }
    if (A === 'bow' || A === 'ribbon') {
        const bx = A === 'bow' ? 128 : 256, by = A === 'bow' ? 112 : 90, sc = A === 'bow' ? 0.9 : 1.0, col = d.accC;
        [-1, 1].forEach((s) => shape(g, [[bx, by], [bx + s * 56 * sc, by - 38 * sc], [bx + s * 64 * sc, by + 8 * sc], [bx + s * 52 * sc, by + 44 * sc]], { c: col, c2: tone(col, -0.12), k: 0.4, lw: 3.5 }));
        blob(g, bx, by, 15 * sc, 15 * sc, tone(col, -0.12)); blob(g, bx - 3, by - 3, 11 * sc, 11 * sc, tone(col, 0.05));
    }
    if (A === 'glasses') { g.save(); g.lineWidth = 8; g.strokeStyle = d.accC; [[190], [322]].forEach(([cx]) => { g.beginPath(); g.ellipse(cx, 252, 56, 62, 0, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(255,255,255,.12)'; g.fill(); }); g.beginPath(); g.moveTo(246, 244); g.quadraticCurveTo(256, 232, 266, 244); g.stroke(); g.lineWidth = 5; g.beginPath(); g.moveTo(134, 240); g.lineTo(104, 232); g.moveTo(378, 240); g.lineTo(408, 232); g.stroke(); g.restore(); strand(g, [[160, 222], [186, 214], [208, 218]], '#FFFFFF', 5, 0.55); strand(g, [[292, 222], [318, 214], [340, 218]], '#FFFFFF', 5, 0.55); }
    return c;
}

// ---------- the body: neck, shoulders and the outfit ----------
export function drawBody(d, q) {
    const [c, g] = cq(q), skin = d.skin, top = d.top, topD = d.topD, male = d.g === 'm';
    const sw = male ? 142 : 124; // half shoulder width
    // neck
    shape(g, [[222, 330], [290, 330], [296, 412], [216, 412]], { c: tone(skin, -0.03), c2: tone(skin, -0.14, 0.05), line: tone(skin, -0.22, 0.06), lw: 3, k: 0.3 });
    glow(g, 256, 345, 46, tone(skin, -0.3, 0.1), 0.35);
    const torso = (c1, c2, extra) => shape(g, [[256 - sw, 420], [256 - sw - 10, 470], [256 - sw - 14, 520], [256 + sw + 14, 520], [256 + sw + 10, 470], [256 + sw, 420], [292, 392], [256, 398], [220, 392]], Object.assign({ c: c1, c1, c2, shade: tone(c1, -0.25), shadeA: 0.3, shadeFrom: 0.5, k: 0.45, lw: 4 }, extra || {}));
    const o = d.outfit;
    if (o === 'cardigan') {
        // blouse + ribbon, cardigan with lace trim
        shape(g, [[196, 392], [256, 410], [316, 392], [330, 520], [182, 520]], { c: d.inner, c2: tone(d.inner, -0.06), line: tone(d.inner, -0.22), lw: 3 });
        torso(top, topD, { line: tone(top, -0.3) });
        shape(g, [[196, 392], [226, 420], [256, 520], [188, 520], [172, 440]], { c: d.inner, c2: tone(d.inner, -0.06), line: tone(d.inner, -0.22), lw: 3, k: 0.4 });
        shape(g, [[316, 392], [286, 420], [256, 520], [324, 520], [340, 440]], { c: d.inner, c2: tone(d.inner, -0.06), line: tone(d.inner, -0.22), lw: 3, k: 0.4 });
        [[-1, 188], [1, 324]].forEach(([s, x]) => { for (let i = 0; i < 9; i++) blob(g, 256 + s * (28 + i * 2.2) , 430 + i * 10, 7, 5, '#FFFFFF', 0.9); });
        const bow = '#F27A9E'; [-1, 1].forEach((s) => shape(g, [[256, 420], [256 + s * 40, 404], [256 + s * 46, 432], [256 + s * 36, 452]], { c: bow, c2: tone(bow, -0.12), k: 0.4, lw: 3 })); blob(g, 256, 424, 11, 11, tone(bow, -0.12));
        [470, 500].forEach((y) => blob(g, 268, y, 6, 6, '#FFFFFF', 0.95));
    } else if (o === 'hoodie' || o === 'bear') {
        shape(g, [[182, 372], [256, 360], [330, 372], [362, 420], [150, 420]], { c: tone(top, -0.1), c2: tone(topD, -0.1), k: 0.5, line: tone(topD, -0.2) });
        torso(top, topD);
        shape(g, [[206, 380], [256, 398], [306, 380], [296, 430], [256, 446], [216, 430]], { c: tone(top, -0.06), c2: tone(topD, -0.04), k: 0.5, line: tone(topD, -0.25), lw: 3 });
        [-1, 1].forEach((s) => { strand(g, [[256 + s * 22, 430], [256 + s * 26, 470], [256 + s * 20, 500]], d.inner, 6, 0.95); blob(g, 256 + s * 20, 504, 6, 8, d.inner); });
        if (o === 'bear') { blob(g, 256, 470, 36, 26, tone(top, 0.12), 0.9); blob(g, 256, 462, 14, 10, '#5A4033'); }
    } else if (o === 'uniform') {
        torso(top, topD);
        shape(g, [[210, 392], [256, 440], [302, 392], [330, 420], [256, 470], [182, 420]], { c: d.inner, c2: tone(d.inner, -0.06), line: tone(d.inner, -0.25), lw: 3, k: 0.3 });
        shape(g, [[236, 418], [276, 418], [284, 520], [228, 520]], { c: d.coll || '#C8423B', c2: tone(d.coll || '#C8423B', -0.12), k: 0.2, lw: 3 }); shape(g, [[238, 410], [274, 410], [266, 436], [246, 436]], { c: tone(d.coll || '#C8423B', 0.04), k: 0.2, lw: 3 });
        [[-1, 1]].forEach(() => { shape(g, [[210, 392], [256, 446], [196, 520], [150, 450]], { c: top, c2: topD, k: 0.4, lw: 3.5, line: tone(top, -0.3) }); shape(g, [[302, 392], [256, 446], [316, 520], [362, 450]], { c: top, c2: topD, k: 0.4, lw: 3.5, line: tone(top, -0.3) }); });
    } else if (o === 'sailor') {
        torso(top, topD);
        shape(g, [[196, 392], [256, 440], [316, 392], [372, 420], [352, 470], [256, 500], [160, 470], [140, 420]], { c: d.coll || '#2E3C75', c2: tone(d.coll || '#2E3C75', -0.12), line: tone(d.coll || '#2E3C75', -0.25), lw: 3.5, k: 0.4 });
        [-1, 1].forEach((s) => strand(g, [[256 + s * 100, 424], [256 + s * 72, 462], [256 + s * 30, 484]], '#FFFFFF', 6, 0.95));
        const rb = d.acc === 'ribbon' ? d.accC : '#F2557A'; [-1, 1].forEach((s) => shape(g, [[256, 446], [256 + s * 50, 424], [256 + s * 58, 460], [256 + s * 44, 484]], { c: rb, c2: tone(rb, -0.14), k: 0.4, lw: 3 })); blob(g, 256, 454, 12, 12, tone(rb, -0.14)); shape(g, [[248, 462], [264, 462], [270, 512], [242, 512]], { c: tone(rb, -0.04), k: 0.2, lw: 3 });
    } else if (o === 'sweater') {
        torso(top, topD);
        g.save(); g.beginPath(); curve(g, [[256 - sw, 420], [256 - sw - 14, 520], [256 + sw + 14, 520], [256 + sw, 420], [292, 392], [256, 398], [220, 392]], true, 0.45); g.clip(); for (let y = 410; y < 520; y += 16) { g.strokeStyle = rgba(topD, 0.35); g.lineWidth = 3; g.beginPath(); g.moveTo(100, y); g.quadraticCurveTo(256, y + 8, 412, y); g.stroke(); } g.restore();
        shape(g, [[206, 384], [256, 406], [306, 384], [310, 418], [256, 436], [202, 418]], { c: tone(top, 0.04), c2: tone(topD, 0.02), k: 0.5, lw: 3.5, line: tone(topD, -0.25) });
    } else if (o === 'scarf') {
        torso(top, topD);
        shape(g, [[150, 390], [256, 420], [362, 390], [376, 436], [256, 470], [136, 436]], { c: d.accC, c2: tone(d.accC, -0.14), line: tone(d.accC, -0.3), lw: 3.5, k: 0.5 });
        shape(g, [[300, 440], [346, 452], [352, 520], [310, 520]], { c: tone(d.accC, 0.02), c2: tone(d.accC, -0.14), line: tone(d.accC, -0.3), lw: 3.5, k: 0.3 });
        for (let i = 0; i < 4; i++) strand(g, [[158 + i * 60, 408 + i % 2 * 6], [170 + i * 60, 432]], tone(d.accC, -0.25), 4, 0.5);
    } else if (o === 'robe') {
        torso(top, topD);
        shape(g, [[196, 392], [256, 450], [316, 392], [300, 520], [212, 520]], { c: d.inner, c2: tone(d.inner, -0.08), line: tone(d.inner, -0.26), lw: 3, k: 0.4 });
        shape(g, [[196, 392], [262, 460], [226, 520], [170, 520], [150, 440]], { c: top, c2: topD, k: 0.4, lw: 3.5, line: tone(top, -0.3) }); shape(g, [[316, 392], [250, 460], [286, 520], [342, 520], [362, 440]], { c: top, c2: topD, k: 0.4, lw: 3.5, line: tone(top, -0.3) });
        strand(g, [[200, 400], [258, 462]], '#F2C46A', 5, 0.9); strand(g, [[312, 400], [254, 462]], '#F2C46A', 5, 0.9);
    } else torso(top, topD);
    // shoulder highlight
    glow(g, 160, 430, 50, '#FFFFFF', 0.18);
    return c;
}

// ---------- hands ----------
function hand(g, x, y, scale, d, rot) {
    g.save(); g.translate(x, y); g.rotate(rot || 0); g.scale(scale, scale);
    const sk = d.skin;
    shape(g, [[-26, 6], [-30, -22], [-12, -40], [14, -38], [30, -16], [26, 14], [8, 32], [-14, 28]], { c: sk, c2: tone(sk, -0.07, 0.03), line: tone(sk, -0.28, 0.08), lw: 3.5, k: 0.5 });
    [[-14, -28], [2, -34], [18, -26]].forEach(([fx, fy]) => strand(g, [[fx, fy + 8], [fx - 1, fy + 22]], tone(sk, -0.22, 0.06), 2.5, 0.6));
    g.restore();
}
export function drawHandWrite(d) {
    const c = cv(256), g = c.getContext('2d'); g.save(); g.scale(0.5, 0.5);
    // sleeve cuff, hand, pencil
    shape(g, [[150, 330], [200, 280], [260, 296], [250, 360], [190, 392]], { c: d.top, c2: d.topD, line: tone(d.top, -0.3), lw: 4, k: 0.45 });
    shape(g, [[250, 300], [310, 276], [352, 304], [336, 350], [276, 356]], { c: d.skin, c2: tone(d.skin, -0.07, 0.03), line: tone(d.skin, -0.28, 0.08), lw: 4, k: 0.5 });
    [[300, 292], [322, 300], [338, 316]].forEach(([x, y]) => strand(g, [[x, y], [x + 6, y + 16]], tone(d.skin, -0.22, 0.06), 3, 0.6));
    g.save(); g.translate(344, 318); g.rotate(0.9); shape(g, [[-9, -90], [9, -90], [9, 14], [0, 36], [-9, 14]], { c: '#F2C94C', c2: '#E0A82E', line: '#8A5A12', lw: 3, k: 0.1 }); shape(g, [[-9, -90], [9, -90], [9, -70], [-9, -70]], { c: '#F28FAD', line: '#8A5A12', lw: 3, k: 0.1 }); g.restore();
    g.restore(); return c;
}
export function drawHandCheek(d, q) {
    const [c, g] = cq(q);
    shape(g, [[318, 530], [330, 452], [372, 400], [432, 420], [446, 530]], { c: d.top, c2: d.topD, line: tone(d.top, -0.3), lw: 4, k: 0.45 });
    shape(g, [[338, 410], [350, 346], [396, 306], [450, 336], [452, 408], [412, 438], [362, 440]], { c: d.skin, c2: tone(d.skin, -0.07, 0.03), line: tone(d.skin, -0.28, 0.08), lw: 4, k: 0.5 });
    [[372, 330], [398, 320], [424, 332], [442, 354]].forEach(([x, y]) => strand(g, [[x, y], [x - 2, y + 26]], tone(d.skin, -0.22, 0.06), 3, 0.6));
    return c;
}

// ---------- the whole portrait (for the pickers) ----------
export function drawPortrait(d, size, ex) {
    const out = cv(size), g = out.getContext('2d'), q = Math.min(1, size / S * 1.4);
    const layers = [drawBack(d, q), drawBody(d, q), drawHead(d, ex || (d.wink ? 'wink' : 'happy'), q), drawFront(d, q)];
    // frame the face and shoulders
    layers.forEach((l) => g.drawImage(l, 0, 0, l.width, l.height, -size * 0.05, -size * 0.02, size * 1.1, size * 1.1));
    return out;
}
export function drawBack(d, q) { const [c, g] = cq(q); hairBack(g, d); return c; }

// small effect pictures shared by the room
export function fxCanvas(kind) {
    const c = cv(128), g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'heart') { g.fillStyle = '#FF5D8F'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 8; g.beginPath(); g.moveTo(64, 108); g.bezierCurveTo(8, 70, 18, 18, 64, 44); g.bezierCurveTo(110, 18, 120, 70, 64, 108); g.closePath(); g.stroke(); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(44, 48, 9, 6, -0.6, 0, 7); g.fill(); }
    else if (kind === 'vein') { const seg = [[[18, 18], [50, 50]], [[110, 18], [78, 50]], [[18, 110], [50, 78]], [[110, 110], [78, 78]]]; g.strokeStyle = '#E11D2E'; g.lineWidth = 15; seg.forEach((p) => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); g.lineTo(p[1][0], p[1][1]); g.stroke(); }); g.strokeStyle = '#FFFFFF'; g.lineWidth = 4; seg.forEach((p) => { g.beginPath(); g.moveTo(p[0][0] + 2, p[0][1] + 2); g.lineTo(p[1][0], p[1][1]); g.stroke(); }); }
    else if (kind === 'zzz') { g.fillStyle = '#6C7AE0'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 6; g.textAlign = 'center'; g.font = '900 64px sans-serif'; g.strokeText('z', 40, 100); g.fillText('z', 40, 100); g.font = '900 44px sans-serif'; g.strokeText('z', 84, 66); g.fillText('z', 84, 66); g.font = '900 30px sans-serif'; g.strokeText('z', 108, 36); g.fillText('z', 108, 36); }
    else if (kind === 'steam') { g.fillStyle = 'rgba(255,255,255,.92)'; g.strokeStyle = 'rgba(190,200,215,.9)'; g.lineWidth = 5; [[40, 84, 24], [70, 70, 30], [92, 92, 20], [60, 100, 22]].forEach((p) => { g.beginPath(); g.arc(p[0], p[1], p[2], 0, 7); g.fill(); g.stroke(); }); }
    else if (kind === 'sweat') { g.fillStyle = '#9ADCFF'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 6; g.beginPath(); g.moveTo(64, 14); g.bezierCurveTo(100, 62, 96, 110, 64, 112); g.bezierCurveTo(32, 110, 28, 62, 64, 14); g.closePath(); g.stroke(); g.fill(); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(52, 80, 6, 14, 0.2, 0, 7); g.fill(); }
    else if (kind === 'star') { g.fillStyle = '#FFE066'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 6; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 52, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.closePath(); g.stroke(); g.fill(); }
    return c;
}
