// غرفتنا: the shared 3D study room. A real-time 3D room (wood floor, window that follows the time of day, desks with
// laptops and lamps, bookshelf, curtains, plants, a chalkboard) lit by the sun and the lamps, with soft shadows,
// ambient occlusion and a gentle bloom, and cute anime students (drawn in js/anime.js) sitting at the desks. The
// students move a little (breathing, blinking, writing), react when tapped, and the whole room shakes when the phone
// does. It fits any screen: phone upright or sideways, tablet, laptop, wide monitor. Loaded on demand (import()) by
// js/sroom.js, which drives it.
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { EffectComposer } from './vendor/pp/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/pp/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/pp/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/pp/postprocessing/OutputPass.js';
import { GTAOPass } from './vendor/pp/postprocessing/GTAOPass.js';
import { ShaderPass } from './vendor/pp/postprocessing/ShaderPass.js';
import { CHARS, charById, drawBack, drawBody, drawHead, drawFront, drawHandWrite, drawHandCheek, fxCanvas } from './anime.js';
export { CHARS, charById };

// ---------- helpers ----------
const rngMk = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
function shade(h, k) { const n = parseInt(h.slice(1), 16); const f = (v) => Math.round(clamp(v * k, 0, 255)); return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; }
const FX = {};
const fxTex = (k) => FX[k] || (FX[k] = (() => { if (k === 'glow' || k === 'spark') { const c = cvs(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); if (k === 'glow') { gr.addColorStop(0, 'rgba(255,214,150,.95)'); gr.addColorStop(0.35, 'rgba(255,190,110,.35)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); } else { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); } g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return ctex(c); } return ctex(fxCanvas(k)); })());

// rounded slab (for desk tops, cushions): w x d footprint, h tall, corner radius r; lies flat with its bottom at y=0
const slabCache = {};
function slab(w, h, d, r, bevel = 0.012) {
    const key = [w, h, d, r].join('|'); if (slabCache[key]) return slabCache[key];
    const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, h - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); g.translate(0, h / 2 - (h - bevel * 2) / 2 + bevel * 0, 0);
    return (slabCache[key] = g);
}

// ---------- textures for the room, drawn once ----------
function woodTex(base, rep, planks = 8, seed = 11) {
    const W = 512, H = 512, c = cvs(W, H), g = c.getContext('2d'), r = rngMk(seed), bump = cvs(W, H), bg = bump.getContext('2d'), ph = H / planks;
    bg.fillStyle = '#888'; bg.fillRect(0, 0, W, H);
    for (let i = 0; i < planks; i++) {
        const t = 0.82 + r() * 0.3; g.fillStyle = shade(base, t); g.fillRect(0, i * ph, W, ph);
        const gr = g.createLinearGradient(0, i * ph, 0, (i + 1) * ph); gr.addColorStop(0, 'rgba(255,240,210,.10)'); gr.addColorStop(1, 'rgba(60,30,10,.12)'); g.fillStyle = gr; g.fillRect(0, i * ph, W, ph);
        for (let k = 0; k < 40; k++) { const a = 0.03 + r() * 0.07, y = i * ph + r() * ph; g.strokeStyle = 'rgba(70,40,20,' + a + ')'; g.lineWidth = 0.6 + r() * 2.2; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 8, W * 0.6, y + (r() - 0.5) * 8, W, y + (r() - 0.5) * 5); g.stroke(); bg.strokeStyle = 'rgba(' + (r() > 0.5 ? '40,40,40' : '200,200,200') + ',.25)'; bg.lineWidth = 1; bg.beginPath(); bg.moveTo(0, y); bg.lineTo(W, y + (r() - 0.5) * 6); bg.stroke(); }
        for (let k = 0; k < 2; k++) { const kx = r() * W, ky = i * ph + ph * (0.25 + r() * 0.5); g.fillStyle = 'rgba(60,30,12,.28)'; g.beginPath(); g.ellipse(kx, ky, 7 + r() * 5, 3 + r() * 2, 0, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(30,16,8,.7)'; g.fillRect(0, i * ph, W, 2.5); bg.fillStyle = '#222'; bg.fillRect(0, i * ph, W, 3);
        const off = r() * W; g.fillRect(off, i * ph, 2.5, ph); bg.fillRect(off, i * ph, 3, ph);
    }
    const t = ctex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
    const b = ctex(bump, false); b.wrapS = b.wrapT = THREE.RepeatWrapping; b.repeat.set(rep[0], rep[1]);
    return [t, b];
}
function wallTex() {
    const c = cvs(512, 512), g = c.getContext('2d'), bump = cvs(256, 256), bg = bump.getContext('2d'); g.fillStyle = '#F4E8DB'; g.fillRect(0, 0, 512, 512); bg.fillStyle = '#808080'; bg.fillRect(0, 0, 256, 256);
    const r = rngMk(5); for (let i = 0; i < 9000; i++) { const w = r() > 0.5; g.fillStyle = w ? 'rgba(255,255,255,' + (0.03 + r() * 0.05) + ')' : 'rgba(190,160,140,' + (0.03 + r() * 0.05) + ')'; g.fillRect(r() * 512, r() * 512, 2, 2); }
    for (let i = 0; i < 4000; i++) { bg.fillStyle = 'rgba(' + (r() > 0.5 ? '255,255,255' : '0,0,0') + ',.12)'; bg.fillRect(r() * 256, r() * 256, 1.5, 1.5); }
    const t = ctex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 2); const b = ctex(bump, false); b.wrapS = b.wrapT = THREE.RepeatWrapping; b.repeat.set(4, 2); return [t, b];
}
function rugTex() {
    const c = cvs(512, 512), g = c.getContext('2d'); g.fillStyle = '#EDB3C2'; g.fillRect(0, 0, 512, 512);
    [[250, '#FBE3EA'], [214, '#E99BB1'], [170, '#FFF1F4'], [120, '#EDB3C2'], [70, '#FFFFFF'], [34, '#E99BB1']].forEach(([r, col]) => { g.fillStyle = col; g.beginPath(); g.arc(256, 256, r, 0, 7); g.fill(); });
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 4; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; g.beginPath(); g.moveTo(256 + Math.cos(a) * 80, 256 + Math.sin(a) * 80); g.lineTo(256 + Math.cos(a) * 214, 256 + Math.sin(a) * 214); g.stroke(); }
    const r = rngMk(3); for (let i = 0; i < 6000; i++) { g.fillStyle = 'rgba(255,255,255,' + (r() * 0.07) + ')'; g.fillRect(r() * 512, r() * 512, 2, 2); }
    return ctex(c);
}
function skyTex(day) {
    const c = cvs(512, 512), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
    if (day > 0.6) { gr.addColorStop(0, '#5FA9EE'); gr.addColorStop(1, '#D9F0FF'); } else if (day > 0.25) { gr.addColorStop(0, '#6A78C9'); gr.addColorStop(0.55, '#F2A87A'); gr.addColorStop(1, '#FFD8A0'); } else { gr.addColorStop(0, '#0A1030'); gr.addColorStop(1, '#2A3568'); }
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512); const r = rngMk(21);
    if (day <= 0.25) { for (let i = 0; i < 110; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.4 + r() * 0.6) + ')'; g.beginPath(); g.arc(r() * 512, r() * 380, 0.6 + r() * 1.6, 0, 7); g.fill(); } g.fillStyle = '#FFF6D6'; g.beginPath(); g.arc(380, 120, 34, 0, 7); g.fill(); g.fillStyle = '#0A1030'; g.beginPath(); g.arc(396, 112, 30, 0, 7); g.fill(); }
    else { g.fillStyle = 'rgba(255,255,255,.88)'; for (let i = 0; i < 7; i++) { const x = r() * 512, y = 60 + r() * 220; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(x + k * 22, y + Math.sin(k) * 8, 20 + r() * 12, 0, 7); g.fill(); } } if (day > 0.6) { g.fillStyle = '#FFF4B8'; g.beginPath(); g.arc(120, 90, 38, 0, 7); g.fill(); } }
    g.fillStyle = day > 0.25 ? 'rgba(110,145,170,.5)' : 'rgba(8,14,34,.92)'; for (let i = 0; i < 18; i++) g.fillRect(i * 30 + r() * 10, 420 - r() * 70, 22 + r() * 10, 120); g.beginPath(); g.arc(256, 430, 40, Math.PI, 0); g.fill();
    g.fillStyle = day > 0.25 ? 'rgba(70,110,80,.7)' : 'rgba(10,22,24,.95)'; [90, 430].forEach((x) => { g.fillRect(x, 380, 6, 140); for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k - 2.5) * 0.45; g.beginPath(); g.ellipse(x + 3 + Math.cos(a) * 26, 380 + Math.sin(a) * 26, 30, 7, a, 0, 7); g.fill(); } });
    return ctex(c);
}
function clockTex(label, time, sub) {
    const c = cvs(512, 256), g = c.getContext('2d'); g.fillStyle = '#171C29'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#212A42'; g.fillRect(8, 8, 496, 240);
    g.fillStyle = '#7CE3C9'; g.shadowColor = '#4FE3B8'; g.shadowBlur = 16; g.font = '900 120px "Courier New", monospace'; g.textAlign = 'center'; g.fillText(time, 256, 150);
    g.shadowBlur = 0; g.fillStyle = '#C4CCE0'; g.font = '700 34px Tahoma, sans-serif'; g.fillText(label, 256, 54); g.fillStyle = '#8F9AB8'; g.font = '600 28px Tahoma, sans-serif'; g.fillText(sub || '', 256, 214); return ctex(c);
}
function boardTex() {
    const c = cvs(768, 384), g = c.getContext('2d'); g.fillStyle = '#244338'; g.fillRect(0, 0, 768, 384);
    const gr = g.createRadialGradient(384, 160, 20, 384, 192, 460); gr.addColorStop(0, 'rgba(255,255,255,.10)'); gr.addColorStop(1, 'rgba(0,0,0,.28)'); g.fillStyle = gr; g.fillRect(0, 0, 768, 384);
    g.fillStyle = 'rgba(255,255,255,.88)'; g.textAlign = 'center'; g.font = '800 52px Tahoma, sans-serif'; g.fillText('ذاكروا بحب وراح تنجحون', 384, 84);
    g.font = '700 38px "Courier New", monospace'; g.fillStyle = 'rgba(255,240,170,.9)'; g.textAlign = 'left'; g.fillText('E = mc²', 40, 168); g.fillText('x² + y² = r²', 40, 228); g.fillText('F = m · a', 40, 288); g.fillText('H₂O  CO₂  NaCl', 380, 168);
    g.strokeStyle = 'rgba(190,230,255,.85)'; g.lineWidth = 4; g.beginPath(); g.moveTo(420, 330); g.quadraticCurveTo(480, 210, 540, 300); g.quadraticCurveTo(600, 360, 680, 220); g.stroke(); g.beginPath(); g.moveTo(400, 340); g.lineTo(720, 340); g.stroke();
    g.fillStyle = 'rgba(255,170,190,.9)'; g.beginPath(); g.arc(690, 70, 22, 0, 7); g.fill(); g.fillStyle = '#244338'; g.beginPath(); g.arc(690, 70, 10, 0, 7); g.fill();
    return ctex(c);
}
function posterTex(kind) {
    const c = cvs(256, 340), g = c.getContext('2d');
    if (kind === 0) { const gr = g.createLinearGradient(0, 0, 0, 340); gr.addColorStop(0, '#FFD9E6'); gr.addColorStop(1, '#C9E4FF'); g.fillStyle = gr; g.fillRect(0, 0, 256, 340); g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(128, 130, 70, 0, 7); g.fill(); g.fillStyle = '#FFB1CB'; g.beginPath(); g.arc(128, 130, 56, 0, 7); g.fill(); g.fillStyle = '#3B2530'; g.font = '900 38px Tahoma, sans-serif'; g.textAlign = 'center'; g.fillText('ذاكر بحب', 128, 266); g.font = '600 24px Tahoma'; g.fillText('خطوة خطوة', 128, 304); }
    else { g.fillStyle = '#FFF6D6'; g.fillRect(0, 0, 256, 340); g.fillStyle = '#E28A1F'; g.font = '900 120px sans-serif'; g.textAlign = 'center'; g.fillText('A+', 128, 190); g.fillStyle = '#7A4B1E'; g.font = '800 34px Tahoma'; g.fillText('السادس الإعدادي', 128, 262); }
    return ctex(c);
}
function screenTex(i) {
    const c = cvs(256, 160), g = c.getContext('2d'); g.fillStyle = ['#1E293B', '#102A43', '#2B1E3B'][i % 3]; g.fillRect(0, 0, 256, 160);
    const r = rngMk(i + 7); for (let k = 0; k < 9; k++) { g.fillStyle = ['#7CE3C9', '#9DB7FF', '#FFC27A', '#FF9AB8'][Math.floor(r() * 4)]; g.fillRect(14 + (r() > 0.6 ? 24 : 0), 14 + k * 15, 30 + r() * 150, 6); }
    return ctex(c);
}

// the layers of one character, drawn once per character and size, then shared
const LAYERS = {};
function layersFor(def, q) {
    const key = def.id + '@' + q; if (LAYERS[key]) return LAYERS[key];
    const mk = (c) => { const t = ctex(c); t.anisotropy = 2; return t; };
    return (LAYERS[key] = { back: mk(drawBack(def, q)), body: mk(drawBody(def, q)), front: mk(drawFront(def, q)), cheek: mk(drawHandCheek(def, q)), write: mk(drawHandWrite(def)) });
}

const SEATS_W = [[-1.1, 0.9], [1.1, 0.9], [-3.3, 0.9], [3.3, 0.9], [-1.1, -1.7], [1.1, -1.7], [-3.3, -1.7], [3.3, -1.7]];
const SEATS_T = [[-1.15, 1.6, 0], [1.15, 1.6, 0], [-1.15, 0.1, 0.8], [1.15, 0.1, 0.8], [-1.15, -1.4, 1.65], [1.15, -1.4, 1.65], [-1.15, -2.9, 2.5], [1.15, -2.9, 2.5]];
const MAXSEAT = 8, SPR = 1.55; // sprite size (m)
const VIGNETTE = { uniforms: { tDiffuse: { value: null }, amount: { value: 0.3 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.2, length(d * vec2(1.0, 1.1))); c.rgb *= mix(1.0 - amount, 1.0, v); gl_FragColor = c; }' };

export class StudyRoom3D {
    constructor(root, opt) {
        this.root = root;
        const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
        this.q = (opt && opt.quality) || ((navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 3 ? 'low' : mobile ? 'med' : 'high');
        const R = this.renderer = new THREE.WebGLRenderer({ antialias: this.q === 'low', powerPreference: 'high-performance' });
        this.pr = Math.min(window.devicePixelRatio || 1, this.q === 'low' ? 1.5 : this.q === 'med' ? 1.75 : 2);
        R.setPixelRatio(this.pr);
        R.shadowMap.enabled = this.q !== 'low'; R.shadowMap.type = THREE.PCFSoftShadowMap; R.shadowMap.autoUpdate = false;
        R.toneMapping = THREE.NeutralToneMapping; R.toneMappingExposure = 1.0; R.outputColorSpace = THREE.SRGBColorSpace;
        R.domElement.className = 'rm-canvas'; root.appendChild(R.domElement);
        this.labels = document.createElement('div'); this.labels.className = 'rm-labels'; root.appendChild(this.labels);
        const S = this.scene = new THREE.Scene(); S.background = new THREE.Color('#2b2433');
        const pm = new THREE.PMREMGenerator(R); S.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; S.environmentIntensity = 0.5;
        const C = this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80); C.position.set(0, 4, 10);
        this.controls = new OrbitControls(C, R.domElement);
        Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, rotateSpeed: 0.5, zoomSpeed: 0.7 });
        this.tilt = new THREE.Vector2(); this.tiltS = new THREE.Vector2();
        this.t = 0; this.shakeT = 0; this.chars = new Map(); this.papers = []; this.bubbles = new Map(); this.onTap = null; this.onPet = null; this.day = 1;
        this._room(); this._lights(); this._dust(); this._input();
        this._post();
        this.resize();
        this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(root);
        window.addEventListener('orientationchange', this._or = () => setTimeout(() => this.resize(), 250));
        this.clock = new THREE.Clock(); this.setDaytime(new Date());
    }

    // ----- the room -----
    _room() {
        const S = this.scene, std = (c, r = 0.7, m = 0, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r, metalness: m }, o || {}));
        const add = (m, sh = true, rc = true) => { m.castShadow = sh; m.receiveShadow = rc; S.add(m); return m; };
        const box = (w, h, d, mat, x, y, z, sh = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return add(m, sh); };
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
        // floor
        const [fm, fb] = woodTex('#B98652', [4, 4], 8, 11);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 15), new THREE.MeshStandardMaterial({ map: fm, bumpMap: fb, bumpScale: 1.6, roughness: 0.5, metalness: 0.02 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 1.5); add(floor, false);
        // walls with panelling
        const [wm, wb] = wallTex(), wallM = new THREE.MeshStandardMaterial({ map: wm, bumpMap: wb, bumpScale: 0.6, roughness: 0.95 });
        const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), wallM); back.position.set(0, 7, -5); add(back, false);
        [-1, 1].forEach((s) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(15, 14), wallM); w.rotation.y = -s * Math.PI / 2; w.position.set(s * 7, 7, 2.5); add(w, false); });
        const pan = std('#EBD9C8', 0.8), mold = std('#FFFFFF', 0.55);
        box(16, 1.1, 0.07, pan, 0, 0.55, -4.965, false); box(16, 0.07, 0.12, mold, 0, 1.12, -4.94, false); box(16, 0.16, 0.1, mold, 0, 0.08, -4.94, false); box(16, 0.14, 0.2, mold, 0, 5.1, -4.9, false);
        for (let i = -7; i <= 7; i++) box(0.04, 0.8, 0.04, mold, i * 1.05 + 0.5, 0.58, -4.93, false);
        [-1, 1].forEach((s) => { box(0.07, 1.1, 15, pan, s * 6.97, 0.55, 2.5, false); box(0.12, 0.07, 15, mold, s * 6.94, 1.12, 2.5, false); box(0.1, 0.16, 15, mold, s * 6.94, 0.08, 2.5, false); });
        // window: real depth, mullions, sill, sky behind
        this.skyM = new THREE.MeshBasicMaterial({ map: skyTex(1), toneMapped: false });
        const win = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.5), this.skyM); win.position.set(0, 3.0, -4.99); S.add(win);
        const fr = std('#FFFFFF', 0.45); [[3.95, 0.16, 0.2, 0, 4.32], [3.95, 0.16, 0.2, 0, 1.68], [0.16, 2.8, 0.2, -1.93, 3.0], [0.16, 2.8, 0.2, 1.93, 3.0], [0.07, 2.5, 0.1, 0, 3.0], [3.7, 0.07, 0.1, 0, 3.0], [0.05, 2.5, 0.08, -0.93, 3.0], [0.05, 2.5, 0.08, 0.93, 3.0]].forEach(([w, h, d, x, y]) => box(w, h, d, fr, x, y, -4.9, false));
        box(4.4, 0.1, 0.46, std('#F5EFE8', 0.55), 0, 1.62, -4.74, false);
        // the bright patch the window throws on the floor
        const patch = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5.2), new THREE.MeshBasicMaterial({ map: fxTex('spark'), color: '#FFF1C9', transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false })); patch.rotation.x = -Math.PI / 2; patch.position.set(0.4, 0.02, -2.0); S.add(patch); this.patch = patch;
        // pleated curtains
        [-1, 1].forEach((s) => { const g = new THREE.PlaneGeometry(0.95, 3.2, 28, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 22) * 0.07); g.computeVertexNormals(); const m = new THREE.Mesh(g, std('#F6C3CF', 0.92, 0, { side: THREE.DoubleSide })); m.position.set(s * 2.55, 3.1, -4.7); add(m, true, true); box(0.1, 0.1, 0.1, std('#EFAABD', 0.8), s * 2.1, 2.0, -4.62, false); });
        box(7.4, 0.06, 0.06, std('#8A6A4E', 0.45, 0.3), 0, 4.78, -4.68, false); [-3.7, 3.7].forEach((x) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), std('#8A6A4E', 0.4, 0.3)); b.position.set(x, 4.78, -4.68); S.add(b); });
        // chalkboard
        const cb = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.45), new THREE.MeshStandardMaterial({ map: boardTex(), roughness: 0.9 })); cb.position.set(4.6, 3.0, -4.94); add(cb, false);
        const wd = std('#8B5E3C', 0.5); box(3.1, 0.08, 0.1, wd, 4.6, 3.78, -4.9, false); box(3.1, 0.08, 0.1, wd, 4.6, 2.22, -4.9, false); box(0.08, 1.6, 0.1, wd, 3.08, 3.0, -4.9, false); box(0.08, 1.6, 0.1, wd, 6.12, 3.0, -4.9, false); box(2.6, 0.05, 0.1, std('#6F4A2E', 0.5), 4.6, 2.16, -4.86, false);
        // bookshelf (left) with instanced books and a globe
        const sx = -5.2, wood = std('#9E6B43', 0.65); box(0.1, 3.9, 0.5, wood, sx - 1.15, 1.95, -4.72); box(0.1, 3.9, 0.5, wood, sx + 1.15, 1.95, -4.72); box(2.4, 0.1, 0.5, wood, sx, 3.9, -4.72); box(2.4, 0.1, 0.5, wood, sx, 0.05, -4.72); box(2.3, 3.8, 0.05, std('#5E3C28', 0.9), sx, 1.95, -4.94, false);
        const cols = ['#E85D75', '#F2A65A', '#6CB4EE', '#7BC96F', '#B58BE0', '#F6D55C', '#4FA3A5', '#F28FAD', '#FFFFFF', '#5B6CF2'], rr = rngMk(3);
        const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.65 }), 140); let bi = 0;
        for (let row = 0; row < 4; row++) { let x = sx - 1.08; const y = 0.16 + row * 0.92; box(2.3, 0.05, 0.46, wood, sx, y, -4.72, false); while (x < sx + 1.05 && bi < 140) { if (row === 3 && x > sx - 0.2 && x < sx + 0.5) { x += 0.7; continue; } const w = 0.05 + rr() * 0.07, h = 0.42 + rr() * 0.3, lean = rr() > 0.93 ? 0.35 : (rr() - 0.5) * 0.03; m4.compose(new THREE.Vector3(x + w / 2, y + 0.025 + h / 2, -4.66), q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), lean), new THREE.Vector3(w, h, 0.3)); books.setMatrixAt(bi, m4); books.setColorAt(bi, col.set(cols[Math.floor(rr() * cols.length)])); bi++; x += w + 0.012 + (lean > 0.1 ? 0.12 : 0); } }
        books.count = bi; books.castShadow = true; books.receiveShadow = true; S.add(books);
        const globe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), std('#5FA8D3', 0.35, 0.1)); globe.position.set(sx + 0.15, 3.45, -4.62); add(globe); box(0.04, 0.2, 0.04, std('#8A6A4E', 0.4, 0.5), sx + 0.15, 3.17, -4.62, false);
        // wall clock = the room's study timer, posters
        const cm = new THREE.MeshBasicMaterial({ map: clockTex('وقت الدراسة', '00:00', ''), toneMapped: false }); this.clockMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), cm); this.clockMesh.position.set(1.9, 4.35, -4.9); S.add(this.clockMesh); box(1.75, 0.95, 0.08, std('#262B3B', 0.4, 0.3), 1.9, 4.35, -4.95, false);
        [[-2.9, 3.3, 0, 0.04], [6.2, 3.4, 1, -0.03]].forEach(([x, y, k, rz]) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.26), new THREE.MeshStandardMaterial({ map: posterTex(k), roughness: 0.7 })); p.position.set(x, y, -4.94); p.rotation.z = rz; add(p, false); box(1.05, 1.36, 0.04, std('#FFFFFF', 0.5), x, y, -4.96, false).rotation.z = rz; });
        // rug
        const rug = new THREE.Mesh(new THREE.CircleGeometry(3.4, 64), new THREE.MeshStandardMaterial({ map: rugTex(), roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.012, -0.4); rug.scale.set(1.5, 1, 0.9); rug.receiveShadow = true; S.add(rug);
        this._layout('wide');
        // plants (instanced leaves)
        const plant = (x, z, s) => { const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.2 * s, 0.4 * s, 20), std('#E2987A', 0.8)); pot.position.set(x, 0.2 * s, z); add(pot); const lv = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2 * s, 10, 8), std('#6DBF68', 0.75), 22); const r2 = rngMk(Math.floor(x * 7 + z + 50)); for (let i = 0; i < 22; i++) { const a = r2() * Math.PI * 2, h = 0.3 + r2() * 0.9, rad = (0.05 + r2() * 0.28) * s; m4.compose(new THREE.Vector3(x + Math.cos(a) * rad, (0.35 + h) * s, z + Math.sin(a) * rad), q.setFromEuler(new THREE.Euler(Math.sin(a) * 0.7, a, -Math.cos(a) * 0.7)), new THREE.Vector3(0.55, 1.5, 0.3)); lv.setMatrixAt(i, m4); lv.setColorAt(i, col.set(i % 3 ? '#5FAE5B' : '#85CF76')); } lv.castShadow = true; S.add(lv); };
        plant(6.0, -4.0, 1.7); plant(-6.3, 3.0, 1.2); plant(6.4, 3.4, 1.3);
        // fairy lights
        const pts = []; for (let i = 0; i <= 14; i++) { const u = i / 14; pts.push(new THREE.Vector3(-6.4 + u * 12.8, 5.05 - Math.sin(u * Math.PI) * 0.5 - (i % 2 ? 0.07 : 0), -4.82)); }
        this.fairy = []; const fg = new THREE.Group(); S.add(fg); pts.forEach((p, i) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: ['#FFE08A', '#FFB6C8', '#BFE3FF', '#C9F0C0'][i % 4], toneMapped: false })); b.position.copy(p); fg.add(b); const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex('glow'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 })); g.scale.setScalar(0.55); g.position.copy(p); fg.add(g); this.fairy.push(g); });
        this.fairyGroup = fg;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 18), std('#7FB7E5', 0.35)); ball.position.set(-4.2, 0.24, 3.4); add(ball); this.ball = ball;
    }

    // desks, chairs, lamps and things on the desks; rebuilt when the layout changes
    _layout(mode) {
        if (this._mode === mode) return; this._mode = mode;
        if (this.deskG) this.scene.remove(this.deskG);
        const seats = mode === 'tall' ? SEATS_T : SEATS_W;
        this.seats = seats; this.seatPos = seats.map(([x, z, y]) => new THREE.Vector3(x, 0.48 + (y || 0), z)); this.papersOn = []; this.lamps = []; this.steams = []; this.screens = [];
        const G = this.deskG = new THREE.Group(); this.scene.add(G);
        let cur = G; const std = (c, r = 0.7, m = 0, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r, metalness: m }, o || {}));
        const box = (w, h, d, mat, x, y, z, sh = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = sh; m.receiveShadow = true; cur.add(m); return m; };
        const put = (geo, mat, x, y, z, sh = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = sh; m.receiveShadow = true; cur.add(m); return m; };
        if (mode === 'tall') [[-2.9, 2.5], [-1.4, 1.65], [0.1, 0.8]].forEach(([z, y]) => { box(5.6, y, 1.6, std('#E3C3A0', 0.8), 0, y / 2, z + 0.45); });
        const [dm, db] = woodTex('#D9AC78', [1, 1], 5, 17), woodD = new THREE.MeshStandardMaterial({ map: dm, bumpMap: db, bumpScale: 1, roughness: 0.45 });
        const metal = std('#C9CED6', 0.35, 0.8), legG = new THREE.CylinderGeometry(0.03, 0.022, 0.84, 10), cushG = slab(0.62, 0.09, 0.6, 0.08), backG = slab(0.6, 0.08, 0.6, 0.08);
        const rr = rngMk(31);
        seats.forEach(([x, z, yo], i) => {
            cur = new THREE.Group(); cur.position.y = yo || 0; if (mode === 'tall') { cur.scale.x = 0.74; cur.position.x = x * 0.26; } G.add(cur);
            const dz = z + 0.95;
            put(slab(1.7, 0.06, 0.95, 0.06), woodD, x, 0.81, dz);
            box(1.62, 0.5, 0.03, std('#CFA06D', 0.6), x, 0.56, dz + 0.45); box(0.03, 0.5, 0.86, std('#CFA06D', 0.6), x - 0.8, 0.56, dz); box(0.03, 0.5, 0.86, std('#CFA06D', 0.6), x + 0.8, 0.56, dz);
            [[-0.78, -0.42], [0.78, -0.42], [-0.78, 0.42], [0.78, 0.42]].forEach(([lx, lz]) => put(legG, metal, x + lx, 0.42, dz + lz));
            const cc = ['#F2A8BC', '#7FB7E5', '#FFD27A', '#A8D8B0'][i % 4];
            put(cushG, std(cc, 0.8), x, 0.36, z - 0.02); const bk = put(backG, std(shade(cc, 0.92), 0.8), x, 0.8, z - 0.36); bk.rotation.x = Math.PI / 2 + 0.08;
            [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.2], [0.25, 0.2]].forEach(([lx, lz]) => put(new THREE.CylinderGeometry(0.022, 0.018, 0.4, 8), metal, x + lx, 0.2, z + lz, false));
            if (i % 3 === 0) {
                put(slab(0.46, 0.025, 0.32, 0.02), std('#B9BEC8', 0.35, 0.8), x - 0.38, 0.845, dz + 0.02);
                const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.28), new THREE.MeshBasicMaterial({ map: screenTex(i), toneMapped: false })); sc.position.set(x - 0.38, 1.0, dz - 0.15); sc.rotation.x = -0.18; cur.add(sc); this.screens.push(sc);
                put(slab(0.46, 0.012, 0.3, 0.02), std('#B9BEC8', 0.35, 0.8), x - 0.38, 1.0, dz - 0.165, false).rotation.x = Math.PI / 2 - 0.18;
            } else {
                const bc = ['#E85D75', '#6CB4EE', '#F6D55C', '#7BC96F'];
                for (let k = 0; k < 3; k++) put(slab(0.34 - k * 0.02, 0.05, 0.25, 0.01), std(bc[(i + k) % 4], 0.6), x - 0.5 + (k % 2) * 0.01, 0.84 + k * 0.05, dz, true).rotation.y = (k - 1) * 0.1;
                put(slab(0.22, 0.06, 0.08, 0.03), std('#7FB7E5', 0.6), x - 0.7, 0.84, dz + 0.3);
            }
            const nb = put(slab(0.5, 0.02, 0.34, 0.01), std('#FFFFFF', 0.85), x + 0.08, 0.84, dz + 0.1, false); nb.rotation.y = (i % 3 - 1) * 0.06;
            const pen = put(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8), std('#F2C94C', 0.5), x + 0.38, 0.865, dz + 0.16, false); pen.rotation.set(0, 0.5, Math.PI / 2);
            this.papersOn.push(new THREE.Vector3(x - 0.2, 0.96, dz + 0.1));
            put(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 20), std('#F3EEE6', 0.4, 0.2), x + 0.72, 0.885, dz - 0.32, false);
            put(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8), std('#F3EEE6', 0.4, 0.3), x + 0.72, 0.935, dz - 0.32, false);
            const sh = put(new THREE.SphereGeometry(0.075, 20, 14), new THREE.MeshStandardMaterial({ color: '#FFF1D6', roughness: 0.5, emissive: '#FFB36B', emissiveIntensity: 0.5 }), x + 0.72, 1.02, dz - 0.32, false);
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex('glow'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 })); glow.scale.setScalar(0.7); glow.position.set(x + 0.72, 1.02, dz - 0.32); cur.add(glow);
            this.lamps.push({ shade: sh, glow, x, dz });
            const mx = x + 0.55, mz = dz + 0.28;
            put(new THREE.CylinderGeometry(0.05, 0.045, 0.09, 18), std(['#FFFFFF', '#FFE08A', '#BFE3F7', '#F5B7C5'][i % 4], 0.45), mx, 0.89, mz);
            const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex('steam'), transparent: true, opacity: 0.0, depthWrite: false })); st.scale.setScalar(0.16); st.position.set(mx, 1.0, mz); cur.add(st); this.steams.push({ s: st, y0: 0.96, ph: rr() * 6 });
        });
        if (this.chars) this.chars.forEach((c) => { c.root.position.copy(this.seatPos[c.seat]); });
        if (this._lastDate) this.setDaytime(this._lastDate);
    }
    _lights() {
        const S = this.scene;
        this.hemi = new THREE.HemisphereLight(0xfff0e0, 0xb89a86, 0.9); S.add(this.hemi);
        const sun = this.sun = new THREE.DirectionalLight(0xfff0d0, 2.8); sun.position.set(2.2, 6.8, -3.2); sun.target.position.set(0, 0, 0.8);
        sun.castShadow = this.q !== 'low'; sun.shadow.mapSize.set(this.q === 'high' ? 2048 : 1024, this.q === 'high' ? 2048 : 1024); const sc = sun.shadow.camera; sc.left = -8; sc.right = 8; sc.top = 6; sc.bottom = -5; sc.near = 1; sc.far = 20; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 5;
        S.add(sun, sun.target);
        this.fill = new THREE.DirectionalLight(0xdfe8ff, 0.55); this.fill.position.set(-4, 4, 9); S.add(this.fill);
        this.warm = []; [-2.4, 2.4].forEach((x) => { const p = new THREE.PointLight(0xffc27a, 5, 10, 1.6); p.position.set(x, 2.3, -0.2); S.add(p); this.warm.push(p); });
    }
    _dust() {
        const n = 110, g = new THREE.BufferGeometry(), a = new Float32Array(n * 3), r = rngMk(9);
        for (let i = 0; i < n; i++) { a[i * 3] = (r() - 0.5) * 5.5; a[i * 3 + 1] = r() * 4.4; a[i * 3 + 2] = -3.4 + r() * 5.4; }
        g.setAttribute('position', new THREE.BufferAttribute(a, 3));
        this.dust = new THREE.Points(g, new THREE.PointsMaterial({ map: fxTex('spark'), size: 0.07, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff2cf })); this.scene.add(this.dust);
    }

    // ----- picture quality: soft light bloom, ambient occlusion and a vignette on capable devices -----
    _post() {
        this.comp = null; if (this.q === 'low') return;
        try {
            const R = this.renderer, w = this.root.clientWidth || 360, h = this.root.clientHeight || 640;
            const rt = new THREE.WebGLRenderTarget(w * this.pr, h * this.pr, { type: THREE.HalfFloatType, samples: this.q === 'high' ? 4 : 2 });
            const comp = this.comp = new EffectComposer(R, rt); comp.setPixelRatio(this.pr);
            comp.addPass(new RenderPass(this.scene, this.camera));
            if (this.q === 'high') { const ao = this.ao = new GTAOPass(this.scene, this.camera, w, h); ao.output = GTAOPass.OUTPUT.Default; try { ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false }); ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 }); } catch (e) {} comp.addPass(ao); }
            this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.2, 0.6, 0.96); comp.addPass(this.bloom);
            comp.addPass(new ShaderPass(VIGNETTE)); comp.addPass(new OutputPass());
        } catch (e) { console.warn('post effects off', e); this.comp = null; }
    }

    // ----- time of day: sky, sun, lamps, how bright the students look -----
    setDaytime(date) {
        this._lastDate = date;
        const h = date.getHours() + date.getMinutes() / 60;
        const day = h < 5.5 || h > 19.5 ? 0 : h < 7 ? (h - 5.5) / 1.5 * 0.5 : h < 17.5 ? 1 : h < 19.5 ? lerp(1, 0.3, (h - 17.5) / 2) : 0;
        const key = day > 0.6 ? 'd' : day > 0.25 ? 's' : 'n';
        if (this._sky !== key) { this._sky = key; if (this.skyM.map) this.skyM.map.dispose(); this.skyM.map = skyTex(day > 0.6 ? 1 : day > 0.25 ? 0.4 : 0); this.skyM.needsUpdate = true; }
        this.day = day;
        this.sun.intensity = 0.12 + day * 2.1; this.sun.color.set(day > 0.6 ? 0xfff0d0 : day > 0.25 ? 0xffb27a : 0x8fa4ff);
        this.hemi.intensity = 0.28 + day * 0.4; this.renderer.toneMappingExposure = 0.78 + day * 0.1; this.scene.environmentIntensity = 0.18 + day * 0.22;
        this.warm.forEach((p) => { p.intensity = 2.5 + (1 - day) * 9; });
        (this.lamps || []).forEach((l) => { l.glow.material.opacity = 0.3 + (1 - day) * 0.65; l.shade.material.emissiveIntensity = 0.25 + (1 - day) * 1.7; });
        if (this.patch) this.patch.material.opacity = day * 0.22; this.dust.material.opacity = 0.2 + day * 0.4;
        this.scene.background.set(day > 0.25 ? '#3a3040' : '#15131f');
        if (this.bloom) this.bloom.strength = 0.16 + (1 - day) * 0.3;
        this.sprTint = lerp(0.7, 1, Math.min(1, day * 1.4)); this.chars.forEach((c) => this._tint(c));
    }
    _tint(c) { const t = this.sprTint === undefined ? 1 : this.sprTint, k = c.tintCol || (c.tintCol = new THREE.Color()); k.setRGB(t, t * (0.97 + this.day * 0.03), t * (0.93 + this.day * 0.07)); c.layers.forEach((m) => m.material.color.copy(k)); }
    setTimer(time, label, sub) {
        const k = time + '|' + label + '|' + sub; if (this._clk === k) return; this._clk = k;
        const m = this.clockMesh.material; if (m.map) m.map.dispose(); m.map = clockTex(label, time, sub); m.needsUpdate = true;
    }

    // ----- students -----
    // list: [{uid, name, char, state: 'study'|'rest'|'sleep', mins, seat, me}]
    setMembers(list) {
        const keep = new Set();
        list.slice(0, MAXSEAT).forEach((m) => {
            keep.add(m.uid);
            let c = this.chars.get(m.uid);
            if (c && c.defId !== m.char) { this._removeChar(m.uid); c = null; }
            if (!c) c = this._addChar(m);
            else if (Number.isInteger(m.seat) && m.seat >= 0 && m.seat < MAXSEAT && m.seat !== c.seat && ![...this.chars.values()].some((o) => o !== c && o.seat === m.seat)) { c.seat = m.seat; c.root.position.copy(this.seatPos[m.seat]); }
            c.name = m.name; c.mins = m.mins || 0; c.state = m.state; c.me = !!m.me; this._label(c);
        });
        [...this.chars.keys()].forEach((u) => { if (!keep.has(u)) this._removeChar(u); });
        this._fit();
    }
    _freeSeat() { const used = new Set([...this.chars.values()].map((c) => c.seat)); for (let i = 0; i < MAXSEAT; i++) if (!used.has(i)) return i; return 0; }
    _addChar(m) {
        const def = charById(m.char), seat = Number.isInteger(m.seat) && m.seat >= 0 && m.seat < MAXSEAT && ![...this.chars.values()].some((o) => o.seat === m.seat) ? m.seat : this._freeSeat();
        const q = this.q === 'low' ? 0.5 : 0.75, L = layersFor(def, q);
        const root = new THREE.Group(); root.position.copy(this.seatPos[seat]); this.scene.add(root);
        const plane = new THREE.PlaneGeometry(1, 1), layers = [];
        const mk = (tex, z, shadow) => { const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }); const mm = new THREE.Mesh(plane, mat); mm.scale.set(SPR, SPR, 1); mm.position.z = z; if (shadow && this.q !== 'low') { mm.castShadow = true; mm.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 }); } layers.push(mm); return mm; };
        const g = new THREE.Group(); g.position.y = 1.04 - 0.0801 * SPR; root.add(g);
        const back = mk(L.back, -0.12, true), body = mk(L.body, 0, true);
        const headC = cvs(Math.round(512 * q), Math.round(512 * q)); drawHead(def, 'norm', q, headC); const headT = ctex(headC); headT.anisotropy = 2;
        const ny = (256 - 345) / 512 * SPR, neck = new THREE.Group(); neck.position.set(0, ny, 0.06); g.add(neck);
        const head = mk(headT, 0, true); head.position.set(0, -ny, 0); const front = mk(L.front, 0.04, true); front.position.set(0, -ny, 0.05); neck.add(head); neck.add(front);
        const cheek = mk(L.cheek, 0.16, false), cheekP = new THREE.Group(); cheekP.position.set(0.17, (256 - 520) / 512 * SPR, 0.14); cheek.position.set(-0.17, -cheekP.position.y, 0); cheekP.add(cheek); cheek.visible = false; g.add(cheekP);
        g.add(back); g.add(body);
        const wr = mk(L.write, 0.0, false); wr.scale.set(0.5, 0.5, 1); wr.position.set(0.12, 0.5, 1.0); root.add(wr);
        const fx = (k, s) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex(k), transparent: true, depthTest: false, depthWrite: false })); sp.scale.setScalar(s); sp.visible = false; sp.renderOrder = 20; sp.position.z = 0.3; return sp; };
        const vein = fx('vein', 0.2); vein.position.set(0.3, 0.24, 0.3); neck.add(vein); const zzz = fx('zzz', 0.28); zzz.position.set(0.4, 0.5, 0.3); neck.add(zzz); const steam = fx('steam', 0.24); steam.position.set(-0.36, 0.35, 0.3); neck.add(steam); const sweat = fx('sweat', 0.14); sweat.position.set(0.38, 0.35, 0.3); neck.add(sweat);
        const hearts = []; for (let i = 0; i < 4; i++) { const h = fx('heart', 0.16); root.add(h); hearts.push(h); }
        const pick = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.0), new THREE.MeshBasicMaterial({ visible: false })); pick.position.set(0, 1.05, 0.2); root.add(pick);
        const el = document.createElement('div'); el.className = 'rm-tag'; this.labels.appendChild(el);
        const c = { root, g, back, body, head, front, neck, cheek, cheekP, wr, vein, zzz, steam, sweat, hearts, pick, headC, headT, layers, expr: 'norm', def, defId: def.id, seat, uid: m.uid, state: m.state || 'study', mood: '', moodT: 0, t0: Math.random() * 10, blink: 2 + Math.random() * 4, look: 4 + Math.random() * 6, pokes: 0, pokeAt: 0, name: m.name, mins: 0, spawn: 0, el, q, ny };
        pick.userData.uid = m.uid; root.scale.setScalar(0.001);
        this._tint(c); this.chars.set(m.uid, c);
        return c;
    }
    _removeChar(uid) {
        const c = this.chars.get(uid); if (!c) return;
        this.scene.remove(c.root); c.headT.dispose(); c.layers.forEach((m) => { m.material.dispose(); if (m.customDepthMaterial) m.customDepthMaterial.dispose(); });
        c.el.remove(); const b = this.bubbles.get(uid); if (b) { b.el.remove(); this.bubbles.delete(uid); }
        this.chars.delete(uid);
    }
    _setExpr(c, e) { if (c.expr === e) return; c.expr = e; drawHead(c.def, e, c.q, c.headC); c.headT.needsUpdate = true; }
    _label(c) {
        c.el.className = 'rm-tag' + (c.me ? ' me' : '') + (c.state === 'sleep' ? ' zz' : '');
        c.el.innerHTML = '<i class="' + c.state + '"></i><b>' + escapeHtml(String(c.name || '').split(' ')[0]) + '</b>';
    }
    screenPos(uid) {
        const c = this.chars.get(uid); if (!c) return null;
        const v = new THREE.Vector3().copy(c.root.position); v.y += 1.7 * c.root.scale.y; v.project(this.camera);
        return { x: (v.x * 0.5 + 0.5) * this.root.clientWidth, y: (-v.y * 0.5 + 0.5) * this.root.clientHeight, ok: v.z < 1 };
    }
    say(uid, text, ms) {
        const c = this.chars.get(uid); if (!c) return;
        let b = this.bubbles.get(uid);
        if (!b) { b = { el: document.createElement('div') }; b.el.className = 'rm-bub'; this.labels.appendChild(b.el); this.bubbles.set(uid, b); }
        b.el.textContent = text; b.until = performance.now() + (ms || 3000); b.el.style.opacity = '1';
    }
    // one-shot reactions, the same on every phone
    react(uid, kind, text) {
        const c = this.chars.get(uid); if (!c) return; const now = performance.now(); c.tagUntil = now + 2600;
        if (kind === 'poke') {
            c.pokes = now - c.pokeAt < 9000 ? c.pokes + 1 : 1; c.pokeAt = now;
            if (c.pokes === 1) { c.mood = 'surprised'; c.moodT = 1.1; this.say(uid, text || ['هاه؟', 'منو؟', 'أوه!'][Math.floor(Math.random() * 3)], 1500); }
            else { c.mood = 'angry'; c.moodT = c.pokes >= 4 ? 3.6 : 2.4; this.say(uid, text || (c.pokes >= 4 ? 'كافي!! دا أدرس!' : ['لا تضغط علي!', 'هيه، دا أركز!', 'اوف، ليش؟'][Math.floor(Math.random() * 3)]), 2200); }
        } else if (kind === 'pet') { c.mood = 'cute'; c.moodT = 3.2; c.pokes = 0; this.say(uid, text || ['شكراً', 'يعني حبيتك', 'هيهي'][Math.floor(Math.random() * 3)], 2200); }
        else if (kind === 'scared') { c.mood = 'scared'; c.moodT = 1.8; this.say(uid, text || 'آآه! شنو هذا؟', 1800); }
        else if (kind === 'cheer') { c.mood = 'cute'; c.moodT = 2.2; this.say(uid, text || 'تشجع!', 1800); }
        else if (kind === 'hi') { c.mood = 'wave'; c.moodT = 2.4; this.say(uid, text || 'هلا!', 1800); }
        this._setExpr(c, c.mood === 'angry' ? 'angry' : c.mood === 'surprised' || c.mood === 'scared' ? 'surprised' : c.mood === 'cute' ? 'cute' : 'happy');
    }
    // the whole room shakes: camera, lamps, and the students' papers fly
    shake(power) {
        this.shakePow = clamp(power || 1, 0.4, 1.6); this.shakeT = 1.4 * this.shakePow;
        const n = Math.round(9 * this.shakePow), sc = this._mode === 'tall' ? 0.74 : 1;
        this.papersOn.forEach((p0, i) => {
            if (![...this.chars.values()].some((o) => o.seat === i)) return;
            const base = new THREE.Vector3(this.seatPos[i].x + (p0.x - this.seats[i][0]) * sc, p0.y + (this.seats[i][2] || 0), p0.z);
            for (let k = 0; k < n; k++) {
                const m = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), new THREE.MeshStandardMaterial({ color: k % 3 ? '#FFFFFF' : '#FFF4C7', side: THREE.DoubleSide, roughness: 0.9 }));
                m.position.copy(base); m.position.x += (Math.random() - 0.5) * 0.3; m.castShadow = true;
                m.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 2.4, 2.2 + Math.random() * 2.2, (Math.random() - 0.3) * 2.4), w: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), life: 9, rest: false };
                this.scene.add(m); this.papers.push(m);
            }
        });
        this.chars.forEach((c, uid) => { if (c.mood !== 'angry') this.react(uid, 'scared'); });
    }

    // ----- input: tap, long press -----
    _input() {
        const el = this.renderer.domElement, ray = new THREE.Raycaster(), v = new THREE.Vector2(); let down = null, timer = 0, long = false;
        const pick = (e) => {
            const r = el.getBoundingClientRect(); v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(v, this.camera);
            const hit = ray.intersectObjects([...this.chars.values()].map((c) => c.pick), false)[0]; return hit ? hit.object.userData.uid : null;
        };
        el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, uid: pick(e), t: performance.now() }; long = false; if (down.uid) timer = setTimeout(() => { long = true; if (this.onPet) this.onPet(down.uid); }, 520); });
        el.addEventListener('pointermove', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) { clearTimeout(timer); down.moved = true; } });
        const up = () => { clearTimeout(timer); if (down && !down.moved && !long && down.uid && performance.now() - down.t < 500 && this.onTap) this.onTap(down.uid); down = null; };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', () => { clearTimeout(timer); down = null; });
    }
    setTilt(x, y) { this.tiltS.set(clamp(x, -1, 1), clamp(y, -1, 1)); }

    // ----- loop -----
    start(active) {
        this._active = active || (() => true); if (this._raf) return; this.clock.getDelta();
        const loop = () => { this._raf = requestAnimationFrame(loop); if (this._active && !this._active()) return; const dt = Math.min(0.05, this.clock.getDelta()); this.t += dt; this._frame(dt); this._fps(dt); };
        this._raf = requestAnimationFrame(loop);
    }
    stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; }
    // a slow phone gets a simpler picture, step by step
    _fps(dt) {
        this._acc = (this._acc || 0) + dt; this._n = (this._n || 0) + 1;
        if (this._acc > 3) { const fps = this._n / this._acc; this._acc = 0; this._n = 0; if (this._skip) { this._skip--; return; } if (fps < 26) this._downgrade(); }
    }
    _downgrade() {
        if (this.q === 'high') { this.q = 'med'; if (this.ao) { this.comp.removePass(this.ao); this.ao = null; } this.sun.shadow.mapSize.set(1024, 1024); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
        else if (this.q === 'med') { this.q = 'low'; this.comp = null; this.sun.castShadow = false; this.renderer.shadowMap.enabled = false; this.pr = Math.min(this.pr, 1.25); this.renderer.setPixelRatio(this.pr); this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); }); }
        else if (this.pr > 1) { this.pr = Math.max(1, this.pr - 0.25); this.renderer.setPixelRatio(this.pr); }
        this._skip = 1; this.resize();
    }

    // ----- fits any screen: phone upright or sideways, tablet, laptop, wide monitor -----
    resize() {
        const w = this.root.clientWidth || 360, h = this.root.clientHeight || 640, asp = w / h, tall = asp < 0.9;
        this.renderer.setSize(w, h, false); if (this.comp) { this.comp.setPixelRatio(this.pr); this.comp.setSize(w, h); }
        this.camera.aspect = asp; this.camera.fov = tall ? 55 : 42; this.camera.updateProjectionMatrix();
        this._layout(tall ? 'tall' : 'wide'); this._fit(true);
    }
    // frame the people who are in the room: few students close up, a full room further back
    _fit(first) {
        const asp = this.camera.aspect, tall = this._mode === 'tall';
        const used = [...this.chars.values()].map((c) => this.seatPos[c.seat]), pts = used.length ? used : this.seatPos.slice(0, 2);
        let x0 = 1e9, x1 = -1e9, ymax = -1e9, ymin = 1e9, zs = 0;
        pts.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); ymax = Math.max(ymax, p.y); ymin = Math.min(ymin, p.y); zs += p.z; });
        const hw = Math.max((x1 - x0) / 2 + 1.35, tall ? 1.9 : 2.5), cx = (x0 + x1) / 2, top = ymax + 1.85, bot = ymin - 0.05;
        const vf = THREE.MathUtils.degToRad(this.camera.fov), tv = Math.tan(vf / 2), th = tv * asp;
        const d = Math.max(hw / th, (top - bot) / 2 / tv) + 0.7, cyy = (top + bot) / 2 + 0.1, zc = zs / pts.length - 0.1, pitch = 0.2;
        const key = [tall, hw.toFixed(2), top.toFixed(2), asp.toFixed(2)].join('|'); if (this._fitKey === key) return; this._fitKey = key;
        const goal = { target: new THREE.Vector3(cx, cyy, zc), d };
        Object.assign(this.controls, { minDistance: d * 0.6, maxDistance: d * 1.4, minPolarAngle: Math.PI / 2 - pitch - 0.3, maxPolarAngle: Math.PI / 2 - pitch + 0.2, minAzimuthAngle: -0.55, maxAzimuthAngle: 0.55 });
        if (first && !this._fitDone) { this._fitDone = true; this.controls.target.copy(goal.target); this.camera.position.copy(goal.target).add(new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).multiplyScalar(d)); this.controls.update(); this._goal = null; }
        else this._goal = goal;
    }
    _frame(dt) {
        const t = this.t;
        if (this._goal) { const k = 1 - Math.pow(0.002, dt), g = this._goal; this.controls.target.lerp(g.target, k); const off = this.camera.position.clone().sub(this.controls.target), len = off.length(); off.setLength(lerp(len, g.d, k)); this.camera.position.copy(this.controls.target).add(off); if (Math.abs(len - g.d) < 0.02 && this.controls.target.distanceTo(g.target) < 0.02) this._goal = null; }
        this.tilt.lerp(this.tiltS, 0.08); this.controls.update();
        const base = this.camera.position.clone();
        this.camera.position.x += this.tilt.x * 0.5 + Math.sin(t * 0.35) * 0.02; this.camera.position.y += this.tilt.y * 0.3 + Math.sin(t * 0.5) * 0.015;
        if (this.shakeT > 0) { this.shakeT -= dt; const k = Math.min(1, this.shakeT) * 0.13 * (this.shakePow || 1); this.camera.position.x += (Math.random() - 0.5) * k; this.camera.position.y += (Math.random() - 0.5) * k; }
        this._fr = (this._fr || 0) + 1; if (this._fr % 2 === 0) this.renderer.shadowMap.needsUpdate = true;
        if (this.comp) this.comp.render(dt); else this.renderer.render(this.scene, this.camera);
        this.camera.position.copy(base);
        if (this.fairy) this.fairy.forEach((g, i) => { g.material.opacity = 0.5 + Math.sin(t * 2 + i) * 0.25; });
        if (this.lamps) { const sw = this.shakeT > 0 ? Math.sin(t * 25) * 0.1 * Math.min(1, this.shakeT) : 0; this.lamps.forEach((l, i) => { l.shade.position.x = l.x + 0.72 + sw * 0.4; }); }
        if (this.fairyGroup) this.fairyGroup.rotation.z = this.shakeT > 0 ? Math.sin(t * 22) * 0.012 : 0;
        if (this.steams) this.steams.forEach((s) => { const u = ((t * 0.35 + s.ph) % 1); s.s.position.y = s.y0 + u * 0.28; s.s.material.opacity = (1 - u) * 0.4 * (0.4 + (1 - this.day) * 0.4); });
        const pa = this.dust.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { let y = pa.getY(i) + dt * (0.05 + (i % 5) * 0.012); if (y > 4.5) y = 0.2; pa.setY(i, y); pa.setX(i, pa.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.03); } pa.needsUpdate = true;
        for (let i = this.papers.length - 1; i >= 0; i--) {
            const p = this.papers[i], u = p.userData; u.life -= dt;
            if (!u.rest) { u.v.y -= 9 * dt; p.position.addScaledVector(u.v, dt); p.rotation.x += u.w.x * dt; p.rotation.y += u.w.y * dt; p.rotation.z += u.w.z * dt; u.v.multiplyScalar(0.995); if (p.position.y < 0.03) { p.position.y = 0.03; u.rest = true; p.rotation.set(-Math.PI / 2, 0, Math.random() * 6); } }
            if (u.life < 1) p.scale.setScalar(Math.max(0.01, u.life));
            if (u.life <= 0) { this.scene.remove(p); p.geometry.dispose(); p.material.dispose(); this.papers.splice(i, 1); }
        }
        const w = this.root.clientWidth, h = this.root.clientHeight, now = performance.now(), v = new THREE.Vector3();
        if (this.onFrame) this.onFrame();
        this.chars.forEach((c) => {
            this._animate(c, dt, t);
            v.copy(c.root.position); v.y += 1.7 * c.root.scale.y; v.project(this.camera);
            const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h, vis = v.z < 1;
            c.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + (y - 4).toFixed(1) + 'px) translate(-50%,-100%)'; c.el.style.display = vis && (c.me || c.tagUntil > now) ? '' : 'none';
            const b = this.bubbles.get(c.uid);
            if (b) { if (now > b.until) b.el.style.opacity = '0'; b.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + (y - 44).toFixed(1) + 'px) translate(-50%,-100%)'; }
        });
    }
    _animate(c, dt, t) {
        const T = t + c.t0, root = c.root;
        c.spawn = Math.min(1, c.spawn + dt * 2.2); const sp = c.spawn < 1 ? 1 - Math.pow(1 - c.spawn, 3) + Math.sin(c.spawn * Math.PI) * 0.15 : 1; root.scale.setScalar(Math.max(0.001, sp));
        if (c.moodT > 0) { c.moodT -= dt; if (c.moodT <= 0) { c.mood = ''; if (performance.now() - c.pokeAt >= 9000) c.pokes = 0; } }
        const mood = c.mood, st = c.state;
        let ex = mood === 'angry' ? 'angry' : mood === 'surprised' || mood === 'scared' ? 'surprised' : mood === 'cute' ? 'cute' : mood === 'wave' ? 'happy' : st === 'sleep' ? 'sleepy' : 'norm';
        if (!mood) { c.blink -= dt; if (c.blink < 0.13 && st !== 'sleep') ex = 'blink'; if (c.blink < 0) c.blink = 2.5 + Math.random() * 4; if (st === 'rest' && Math.sin(T * 0.4) > 0.9) ex = c.def.wink ? 'wink' : 'happy'; }
        this._setExpr(c, ex);
        let hy = 0, hr = 0, hs = 1, bob = 0, hx = 0, wr = 0, cheek = false, cheekR = 0, hairS = 0;
        if (st === 'study' && !mood) { hy = -0.03 + Math.sin(T * 0.8) * 0.004; hr = Math.sin(T * 0.37) * 0.025; hs = 0.985; wr = 1; c.look -= dt; if (c.look < 0) { hy += 0.02; hs = 1; if (c.look < -1.2) c.look = 5 + Math.random() * 8; } }
        else if (st === 'sleep' && !mood) { hy = -0.07; hr = 0.17 + Math.sin(T * 1.2) * 0.012; hs = 0.97; bob = Math.sin(T * 1.2) * 0.004; }
        else if (!mood) { hx = Math.sin(T * 0.5) * 0.02; hr = Math.sin(T * 0.6) * 0.045; hy = Math.sin(T * 0.7) * 0.004; if (Math.sin(T * 0.23) > 0.4) { cheek = true; hr = -0.07; } }
        if (mood === 'angry') { hx = Math.sin(T * 38) * 0.012; hr = Math.sin(T * 30) * 0.04; bob = Math.abs(Math.sin(T * 14)) * 0.012; hairS = Math.sin(T * 30) * 0.03; }
        else if (mood === 'cute') { bob = Math.abs(Math.sin(T * 7)) * 0.05; hr = Math.sin(T * 6) * 0.09; cheek = true; cheekR = Math.sin(T * 9) * 0.12; }
        else if (mood === 'scared') { bob = Math.max(0, Math.sin(Math.min(1, (1.8 - c.moodT) * 2.2) * Math.PI)) * 0.15; hx = Math.sin(T * 40) * 0.008; hs = 1.02; }
        else if (mood === 'surprised') { bob = 0.02; hs = 1.03; }
        else if (mood === 'wave') { cheek = true; cheekR = Math.sin(T * 10) * 0.3; hr = 0.07; bob = Math.abs(Math.sin(T * 6)) * 0.02; }
        const k = Math.min(1, dt * 10), ease = (a, b) => a + (b - a) * k;
        c.neck.rotation.z = ease(c.neck.rotation.z, hr); c.neck.position.y = ease(c.neck.position.y, c.ny + hy + bob); c.neck.position.x = ease(c.neck.position.x, hx); c.neck.scale.y = ease(c.neck.scale.y, hs);
        c.body.position.y = Math.sin(T * 2.1) * 0.004 + bob * 0.4; c.body.scale.y = SPR * (1 + Math.sin(T * 2.1) * 0.006); c.g.position.x = (mood === 'angry' ? Math.sin(T * 38) * 0.008 : 0);
        c.back.rotation.z = Math.sin(T * 1.4) * 0.012 + hairS; c.back.position.x = Math.sin(T * 1.1) * 0.006;
        c.wr.visible = wr > 0 && st === 'study'; if (c.wr.visible) { c.wr.position.x = 0.12 + Math.sin(T * 9) * 0.012 + Math.sin(T * 2.3) * 0.02; c.wr.position.y = 0.5 + Math.abs(Math.sin(T * 9)) * 0.004; c.wr.rotation.z = Math.sin(T * 9) * 0.04; }
        c.cheek.visible = cheek; c.cheekP.rotation.z = ease(c.cheekP.rotation.z, cheek ? cheekR : 0);
        c.vein.visible = mood === 'angry'; if (c.vein.visible) c.vein.scale.setScalar(0.2 + Math.abs(Math.sin(T * 12)) * 0.05);
        c.steam.visible = mood === 'angry' && c.pokes >= 4; if (c.steam.visible) { const u = (T * 0.8) % 1; c.steam.position.y = 0.35 + u * 0.2; c.steam.material.opacity = 1 - u; }
        c.sweat.visible = mood === 'scared'; if (c.sweat.visible) c.sweat.position.y = 0.35 + Math.sin(T * 8) * 0.02;
        c.zzz.visible = st === 'sleep' && !mood; if (c.zzz.visible) c.zzz.position.y = 0.5 + Math.sin(T * 1.5) * 0.04;
        c.hearts.forEach((h, i) => { if (mood === 'cute') { h.visible = true; const u = ((T * 0.9 + i * 0.25) % 1); h.position.set(Math.sin(u * 6 + i * 2) * 0.35, 1.5 + u * 0.7, 0.2 + (i % 2) * 0.1); h.material.opacity = 1 - Math.pow(u, 3); h.scale.setScalar(0.1 + 0.12 * Math.sin(Math.min(1, u * 3) * Math.PI / 2)); } else h.visible = false; });
        root.position.y = this.seatPos[c.seat].y + (mood === 'cute' || mood === 'scared' ? bob : 0);
    }
    dispose() {
        this.stop(); this._ro.disconnect(); window.removeEventListener('orientationchange', this._or);
        this.chars.forEach((c, u) => this._removeChar(u)); this.papers.forEach((p) => this.scene.remove(p));
        try { this.comp && this.comp.dispose && this.comp.dispose(); } catch (e) {}
        this.renderer.dispose(); this.renderer.domElement.remove(); this.labels.remove();
    }
}
