// رحلة الطالب الجوية: the aircraft. A small airliner is modelled once with three.js (fuselage, swept wings with winglets,
// engines, tail), seen from straight above, and drawn into a few sprites (three liveries x a handful of roll angles).
// After that the page only draws those sprites on a flat canvas, so there is no WebGL running over the map, the plane
// still looks solid and lit, and it turns to any heading by simply rotating the sprite. Loaded by import() the first time a flight opens.
import * as THREE from './vendor/three.module.min.js';

export const STYLES = {
    modern: { name: 'عصري', body: 0xf4f6f8, accent: 0x0ea5e9, accent2: 0x0369a1 },
    classic: { name: 'كلاسيكي', body: 0xefe9dc, accent: 0xb91c1c, accent2: 0x7f1d1d },
    minimal: { name: 'بسيط', body: 0xe5e7eb, accent: 0x111827, accent2: 0x374151 },
};
export const BANKS = [-28, -18, -9, 0, 9, 18, 28];
const SIZE = 192;

function build(st, bank) {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: st.body, roughness: 0.38, metalness: 0.15 });
    const acc = new THREE.MeshStandardMaterial({ color: st.accent, roughness: 0.4, metalness: 0.1 });
    const acc2 = new THREE.MeshStandardMaterial({ color: st.accent2, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.25, metalness: 0.4 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.35, metalness: 0.6 });
    // fuselage: a lathe around the long axis (Y): nose at +Y, tail at -Y
    const prof = [[0, 0.5], [0.014, 0.49], [0.03, 0.46], [0.045, 0.4], [0.054, 0.32], [0.058, 0.2], [0.058, -0.12], [0.054, -0.26], [0.04, -0.38], [0.022, -0.46], [0.008, -0.5], [0, -0.505]].map((p) => new THREE.Vector2(p[0], p[1]));
    const fus = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), body); g.add(fus);
    // livery: a stripe along the top and a coloured tail cone
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.78, 0.01), acc); stripe.position.set(0, 0.0, 0.056); g.add(stripe);
    const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 20), acc); tailCone.rotation.x = -Math.PI / 2; tailCone.position.set(0, -0.44, 0.0); g.add(tailCone);
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.012), dark); cockpit.position.set(0, 0.39, 0.049); cockpit.rotation.x = -0.25; g.add(cockpit);
    // wings: swept trapezoids, a little dihedral, a winglet at each tip
    const wingShape = () => { const sh = new THREE.Shape(); sh.moveTo(0.05, 0.1); sh.lineTo(0.66, -0.2); sh.lineTo(0.66, -0.275); sh.lineTo(0.05, -0.14); sh.closePath(); return sh; };
    const wingGeo = new THREE.ExtrudeGeometry(wingShape(), { depth: 0.012, bevelEnabled: false });
    [1, -1].forEach((sd) => {
        const w = new THREE.Mesh(wingGeo, body); w.position.z = -0.006; if (sd < 0) { w.scale.x = -1; w.material = body; } w.rotation.y = sd * -0.07; g.add(w);
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.075, 0.075), acc); tip.position.set(sd * 0.655, -0.235, 0.03); tip.rotation.z = sd * 0.15; g.add(tip);
        const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.034, 0.15, 18), steel); eng.position.set(sd * 0.22, 0.0, -0.04); g.add(eng);
        const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16), dark); fan.position.set(sd * 0.22, 0.078, -0.04); g.add(fan);
        // tail plane
        const hs = new THREE.Shape(); hs.moveTo(0.02, -0.38); hs.lineTo(0.22, -0.47); hs.lineTo(0.22, -0.505); hs.lineTo(0.02, -0.45); hs.closePath();
        const hmesh = new THREE.Mesh(new THREE.ExtrudeGeometry(hs, { depth: 0.01, bevelEnabled: false }), body); if (sd < 0) hmesh.scale.x = -1; hmesh.position.z = 0.0; g.add(hmesh);
    });
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.13, 0.17), acc2); fin.position.set(0, -0.4, 0.1); fin.rotation.x = 0.35; g.add(fin);
    g.rotation.y = (bank * Math.PI) / 180; // roll around the long axis
    return g;
}

// returns { modern: [canvas per bank], classic: [...], minimal: [...] } (each canvas SIZE x SIZE, transparent, nose up)
export function bake(onlyStyles) {
    const R = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    R.setPixelRatio(1); R.setSize(SIZE, SIZE, false); R.setClearColor(0x000000, 0);
    R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NeutralToneMapping; R.toneMappingExposure = 1.0;
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(22, 1, 0.1, 20);
    cam.position.set(0, 0, 3.6); cam.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a94a6, 1.15));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.3); key.position.set(-0.6, 0.5, 1); scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd2ff, 0.7); fill.position.set(0.8, -0.4, 0.5); scene.add(fill);
    const out = {};
    Object.keys(STYLES).filter((k) => !onlyStyles || onlyStyles.includes(k)).forEach((k) => {
        out[k] = BANKS.map((b) => {
            const m = build(STYLES[k], b); scene.add(m); R.render(scene, cam); scene.remove(m);
            m.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
            const c = document.createElement('canvas'); c.width = c.height = SIZE;
            c.getContext('2d').drawImage(R.domElement, 0, 0);
            return c;
        });
    });
    R.dispose(); R.forceContextLoss && R.forceContextLoss();
    return out;
}
