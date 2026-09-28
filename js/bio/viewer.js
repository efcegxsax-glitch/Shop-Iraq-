// 3D biology diagrams: the viewer. Loaded on demand (import()) the first time the page opens.
// A model file gives a builder that makes the 3D parts and its labels; the viewer lights it,
// lets the student turn and zoom it, draws the labels on both sides with pointer lines, and
// highlights a part when its label (or the part itself) is tapped. Exam mode hides the names.
import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';

// ---------- helpers the model builders use ----------
function noise3(x, y, z) {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return s - Math.floor(s);
}
function smoothNoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi, f = (t) => t * t * (3 - 2 * t);
    const u = f(xf), v = f(yf), w = f(zf);
    const n = (a, b, c) => noise3(xi + a, yi + b, zi + c);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(n(0, 0, 0), n(1, 0, 0), u), l(n(0, 1, 0), n(1, 1, 0), u), v), l(l(n(0, 0, 1), n(1, 0, 1), u), l(n(0, 1, 1), n(1, 1, 1), u), v), w);
}

export function makeKit(root) {
    const kit = {
        THREE,
        labels: [],
        anim: [],
        mat(color, o = {}) {
            const m = new THREE.MeshPhysicalMaterial({
                color, roughness: o.rough ?? 0.5, metalness: 0, clearcoat: o.coat ?? 0.35, clearcoatRoughness: 0.4,
                transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide,
                depthWrite: o.depthWrite ?? ((o.opacity ?? 1) >= 1), sheen: o.sheen ?? 0, sheenColor: new THREE.Color(0xffffff),
                emissive: new THREE.Color(o.glow || 0x000000), emissiveIntensity: o.glow ? 0.35 : 1,
                clippingPlanes: o.clip || null, clipIntersection: !!o.clipAll, flatShading: !!o.flat
            });
            m.userData.baseEmissive = m.emissive.clone();
            m.userData.baseIntensity = m.emissiveIntensity;
            return m;
        },
        mesh(geo, mat, parent) { const m = new THREE.Mesh(geo, mat); (parent || root).add(m); return m; },
        at(obj, x, y, z, rx, ry, rz, s) {
            obj.position.set(x || 0, y || 0, z || 0);
            obj.rotation.set(rx || 0, ry || 0, rz || 0);
            if (s !== undefined) { if (Array.isArray(s)) obj.scale.set(s[0], s[1], s[2]); else obj.scale.setScalar(s); }
            return obj;
        },
        group(parent) { const g = new THREE.Group(); (parent || root).add(g); return g; },
        // A plane that keeps the side its normal points to (for cutaways): keep(nx,ny,nz, d) keeps n·p <= d
        cut(nx, ny, nz, d) { return new THREE.Plane(new THREE.Vector3(-nx, -ny, -nz), d); },
        // A sphere with a lumpy, organic surface.
        blob(r, amp, freq, seg, seed) {
            const g = new THREE.SphereGeometry(r, seg || 48, Math.round((seg || 48) * 0.75));
            const p = g.attributes.position, v = new THREE.Vector3(), s = seed || 1;
            for (let i = 0; i < p.count; i++) {
                v.fromBufferAttribute(p, i);
                const n = smoothNoise(v.x * freq + s, v.y * freq + s * 2, v.z * freq + s * 3) - 0.5;
                v.multiplyScalar(1 + n * amp);
                p.setXYZ(i, v.x, v.y, v.z);
            }
            g.computeVertexNormals();
            return g;
        },
        // A tube along points (smoothly joined).
        tube(pts, r, seg, closed, radial) {
            const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), !!closed, 'centripetal');
            return new THREE.TubeGeometry(c, seg || 64, r, radial || 10, !!closed);
        },
        // Many copies of one small shape (ribosomes, lipid heads...).
        many(geo, mat, list, parent) {
            const im = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
            list.forEach((t, i) => {
                o.position.set(t[0], t[1], t[2]);
                o.rotation.set(t[3] || 0, t[4] || 0, t[5] || 0);
                o.scale.setScalar(t[6] || 1);
                o.updateMatrix();
                im.setMatrixAt(i, o.matrix);
            });
            (parent || root).add(im);
            return im;
        },
        // A label: a name, a short explanation, where its pointer ends (model space) and the parts it lights up.
        label(name, desc, anchor, parts) {
            kit.labels.push({ name, desc, anchor: new THREE.Vector3(anchor[0], anchor[1], anchor[2]), parts: [].concat(parts || []).filter(Boolean) });
        },
        rnd(seed) { let s = seed || 7; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; },
        onFrame(fn) { kit.anim.push(fn); }
    };
    return kit;
}

export class Bio3D {
    constructor(host, onPick) {
        this.host = host;
        this.onPick = onPick || (() => {});
        this.canvas = host.querySelector('canvas');
        this.svg = host.querySelector('.b3-lines');
        this.lbBox = host.querySelector('.b3-labels');
        const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
        r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.05;
        r.localClippingEnabled = true;
        r.outputColorSpace = THREE.SRGBColorSpace;
        this.scene = new THREE.Scene();
        const pm = new THREE.PMREMGenerator(r);
        this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
        pm.dispose();
        this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
        const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 5, 4); this.scene.add(key);
        const rim = new THREE.DirectionalLight(0x9fd8ff, 0.9); rim.position.set(-4, 2, -3); this.scene.add(rim);
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 0.55));
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = false;
        this.controls.rotateSpeed = 0.8;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.9;
        this.controls.addEventListener('start', () => { this.controls.autoRotate = false; this.touched = performance.now(); });
        this.examMode = false;
        this.showLabels = true;
        this.sel = -1;
        this._ray = new THREE.Raycaster();
        this._bindTap();
        this._ro = new ResizeObserver(() => this._resize());
        this._ro.observe(host);
    }

    show(model) {
        this.clear();
        const root = this.root = new THREE.Group();
        this.scene.add(root);
        const kit = this.kit = makeKit(root);
        const view = model.build(kit) || {};
        const box = new THREE.Box3().setFromObject(root), sph = box.getBoundingSphere(new THREE.Sphere()), size = box.getSize(new THREE.Vector3());
        this.center = box.getCenter(new THREE.Vector3());
        this.radius = sph.radius || 1;
        // half sizes used to fit the camera: across (it turns, so the wider of x/z) and up
        this.halfW = Math.max(size.x, size.z) / 2 || 1;
        this.halfH = size.y / 2 || 1;
        this.home = view.view || [0.9, 0.55, 1.6];
        this.controls.target.copy(this.center);
        this._resize();
        this.reset();
        this.labels = kit.labels.map((l, i) => Object.assign(l, { i }));
        this.lbBox.innerHTML = this.labels.map((l, i) => `<button class="b3-lb" data-i="${i}"><span class="b3-n">${i + 1}</span><b>${l.name}</b></button>`).join('');
        this.lbEls = Array.from(this.lbBox.children);
        this.lbEls.forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); this.select(Number(el.dataset.i)); }));
        this.sel = -1;
        this._applyMode();
        this._resize();
        this.t0 = performance.now();
        this.start();
    }

    reset() {
        const d = this.fitDist || this.radius * 3.1, h = this.home, v = new THREE.Vector3(h[0], h[1], h[2]).normalize().multiplyScalar(d);
        this.camera.position.copy(this.center).add(v);
        this.controls.update();
        this.controls.autoRotate = true;
    }

    setExam(on) { this.examMode = !!on; this.revealed = {}; this._applyMode(); }
    setLabels(on) { this.showLabels = !!on; this._applyMode(); }
    _applyMode() {
        this.host.classList.toggle('exam', this.examMode);
        this.host.classList.toggle('nolabels', !this.showLabels);
        (this.lbEls || []).forEach((el) => { el.classList.toggle('shown', !this.examMode || !!(this.revealed && this.revealed[el.dataset.i])); el._w = 0; });
    }
    reveal(i) { this.revealed = this.revealed || {}; this.revealed[i] = true; this._applyMode(); }

    select(i) {
        this.sel = this.sel === i ? -1 : i;
        (this.lbEls || []).forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === this.sel));
        this.root.traverse((o) => {
            if (!o.material) return;
            [].concat(o.material).forEach((m) => { if (m.userData.baseEmissive) { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseIntensity; } });
        });
        this._hl = [];
        if (this.sel >= 0) {
            const l = this.labels[this.sel];
            const mats = new Set();
            l.parts.forEach((p) => p.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => mats.add(m)); }));
            this._hl = Array.from(mats);
            if (this.examMode) this.reveal(this.sel);
        }
        this.onPick(this.sel >= 0 ? this.labels[this.sel] : null, this.sel);
    }

    _bindTap() {
        let sx = 0, sy = 0, t = 0;
        this.canvas.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; t = performance.now(); });
        this.canvas.addEventListener('pointerup', (e) => {
            if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8 || performance.now() - t > 400 || !this.labels) return;
            const rc = this.canvas.getBoundingClientRect();
            this._ray.setFromCamera(new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1), this.camera);
            const hits = this._ray.intersectObject(this.root, true).filter((h) => {
                const m = h.object.material, planes = m && m.clippingPlanes;
                if (!planes || !planes.length) return true;
                const out = planes.map((p) => p.distanceToPoint(h.point) < 0);
                return m.clipIntersection ? !out.every(Boolean) : !out.some(Boolean);
            });
            for (const h of hits) {
                const i = this.labels.findIndex((l) => l.parts.some((p) => { let o = h.object; while (o) { if (o === p) return true; o = o.parent; } return false; }));
                if (i >= 0) { this.select(i); return; }
            }
            if (this.sel >= 0) this.select(this.sel);
        });
    }

    _resize() {
        const w = this.host.clientWidth, h = this.host.clientHeight;
        if (!w || !h) return;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.fov = 32;
        this.camera.updateProjectionMatrix();
        // far enough that the model fills the middle of the screen and the labels fit on the sides
        if (this.radius) {
            const tv = Math.tan(16 * Math.PI / 180), th = tv * (w / h), wide = this.halfW > this.halfH * 1.3, fit = (w < 520 ? 0.56 : 0.62) + (wide ? 0.2 : 0);
            const d = Math.max(this.halfW / (fit * th), this.halfH / (0.82 * tv)) + this.halfW * 0.6;
            const was = this.fitDist;
            this.fitDist = d;
            this.controls.minDistance = d * 0.4;
            this.controls.maxDistance = d * 1.8;
            if (was && Math.abs(was - d) > 1e-3) {
                const off = this.camera.position.clone().sub(this.center);
                this.camera.position.copy(this.center).add(off.multiplyScalar(d / was));
            }
        }
        this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        this.W = w; this.H = h;
    }

    start() {
        if (this.raf) return;
        const loop = (ts) => {
            if (!this.host.isConnected || this.stopped) { this.raf = 0; return; }
            this.raf = requestAnimationFrame(loop);
            if (document.hidden) return;
            this.frame(ts);
        };
        this.raf = requestAnimationFrame(loop);
    }
    stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

    frame(ts) {
        const t = (ts - (this.t0 || 0)) / 1000;
        if (!this.controls.autoRotate && performance.now() - (this.touched || 0) > 6000) this.controls.autoRotate = true;
        this.controls.update();
        if (this.kit) this.kit.anim.forEach((f) => f(t));
        if (this._hl && this._hl.length) {
            const k = 0.75 + 0.45 * Math.sin(t * 5);
            this._hl.forEach((m) => { m.emissive.setRGB(1, 0.78, 0.2); m.emissiveIntensity = k; });
        }
        this.renderer.render(this.scene, this.camera);
        this._placeLabels();
    }

    // Labels in two columns (left / right of the model), kept apart, with a line to their point.
    _placeLabels() {
        if (!this.labels || !this.W) return;
        const W = this.W, H = this.H, cam = this.camera, v = new THREE.Vector3(), cv = new THREE.Vector3();
        cv.copy(this.center).project(cam);
        const cz = this.center.clone().applyMatrix4(cam.matrixWorldInverse).z;
        const pts = this.labels.map((l, i) => {
            v.copy(l.anchor).project(cam);
            const x = (v.x * 0.5 + 0.5) * W, y = (0.5 - v.y * 0.5) * H;
            const z = l.anchor.clone().applyMatrix4(cam.matrixWorldInverse).z;
            return { i, x, y, back: z < cz - this.radius * 0.25, side: x < (cv.x * 0.5 + 0.5) * W ? 'L' : 'R' };
        });
        const gap = 4, top = 14, bot = H - 14;
        let lines = '';
        ['L', 'R'].forEach((side) => {
            const col = pts.filter((p) => p.side === side).sort((a, b) => a.y - b.y);
            // heights differ (long names take two lines): stack them without overlap
            col.forEach((p) => { const el = this.lbEls[p.i]; if (!el._w) { el._w = el.offsetWidth || 90; el._h = el.offsetHeight || 24; } p.h = el._h; });
            let y = top;
            col.forEach((p) => { p.ly = Math.max(p.y - p.h / 2, y); y = p.ly + p.h + gap; });
            let over = (col.length ? col[col.length - 1].ly + col[col.length - 1].h : 0) - bot;
            for (let k = col.length - 1; k >= 0 && over > 0; k--) { col[k].ly -= over; over = k > 0 ? col[k - 1].ly + col[k - 1].h + gap - col[k].ly : 0; }
            col.forEach((p) => {
                const el = this.lbEls[p.i];
                const lx = side === 'L' ? 8 : W - 8 - el._w;
                el.style.transform = `translate(${lx}px, ${p.ly}px)`;
                p.ly += p.h / 2;
                el.classList.toggle('back', p.back);
                const ex = side === 'L' ? lx + el._w : lx;
                const sel = p.i === this.sel;
                lines += `<path d="M${ex.toFixed(1)} ${p.ly.toFixed(1)} L${(ex + (side === 'L' ? 10 : -10)).toFixed(1)} ${p.ly.toFixed(1)} L${p.x.toFixed(1)} ${p.y.toFixed(1)}" class="${sel ? 'on' : ''}${p.back ? ' back' : ''}"/><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${sel ? 4 : 2.6}" class="${sel ? 'on' : ''}${p.back ? ' back' : ''}"/>`;
            });
        });
        if (lines !== this._lastLines) { this.svg.innerHTML = lines; this._lastLines = lines; }
    }

    clear() {
        if (!this.root) return;
        this.scene.remove(this.root);
        this.root.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) [].concat(o.material).forEach((m) => m.dispose());
        });
        this.root = null;
        this.labels = null;
        this._hl = [];
        this.svg.innerHTML = '';
        this._lastLines = '';
    }

    dispose() {
        this.stopped = true;
        this.stop();
        this.clear();
        this._ro.disconnect();
        this.controls.dispose();
        this.renderer.dispose();
    }
}
