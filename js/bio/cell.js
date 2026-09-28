// 3D biology diagrams, part 1: the cell (6th grade scientific, chapter 1).
// Each model is built from simple shapes with a cutaway so the inside is visible, and gives
// its labels (name, short explanation, pointer position, parts to light up).

function roundedBox(T, w, h, d, r) {
    const s = new T.Shape(), x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
    s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.lineTo(x, y);
    const g = new T.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 6, curveSegments: 10 });
    g.translate(0, 0, -(d - 2 * r) / 2);
    g.computeVertexNormals();
    return g;
}

// Pointy chromatid-like tube with coils.
function coiledTube(k, pts, r, rings, pinch) {
    const T = k.THREE;
    const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(p[0], p[1], p[2])), false, 'centripetal');
    const radial = 18, g = new T.TubeGeometry(curve, rings, r, radial, false);
    const pos = g.attributes.position, v = new T.Vector3(), c = new T.Vector3();
    for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        curve.getPointAt(Math.min(1, t), c);
        let f = 1 + 0.1 * Math.sin(i * 0.95);
        if (pinch !== undefined) f *= 0.55 + 0.45 * Math.min(1, Math.abs(t - pinch) * 3.2);
        f *= Math.min(1, Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * 3 + 0.25);
        for (let j = 0; j <= radial; j++) {
            const idx = i * (radial + 1) + j;
            v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(f).add(c);
            pos.setXYZ(idx, v.x, v.y, v.z);
        }
    }
    g.computeVertexNormals();
    return g;
}

export const MODELS = [
    // ---------- 1. Bacterium ----------
    {
        id: 'bacteria', title: 'خلية بدائية النواة (البكتريا)', icon: 'bug',
        build(k) {
            const T = k.THREE, R = k.rnd(11), D = T.DoubleSide;
            const notch = (y) => [k.cut(0, 0, 1, 0), k.cut(0, 1, 0, y)];
            const caps = k.mesh(new T.CapsuleGeometry(0.62, 1.9, 16, 48), k.mat(0xE07A3F, { clip: notch(-0.35), clipAll: true, side: D, rough: 0.7, sheen: 0.4 }));
            const wall = k.mesh(new T.CapsuleGeometry(0.55, 1.9, 16, 48), k.mat(0x3F9E4D, { clip: notch(-0.12), clipAll: true, side: D }));
            const memb = k.mesh(new T.CapsuleGeometry(0.5, 1.9, 16, 48), k.mat(0x3D6FB6, { clip: notch(0.1), clipAll: true, side: D }));
            const cyto = k.mesh(new T.CapsuleGeometry(0.485, 1.9, 16, 48), k.mat(0x9A76C6, { opacity: 0.5, clip: notch(0.32), clipAll: true, side: D }));
            // nucleoid: a long tangled loop of DNA
            const pts = [];
            let p = new T.Vector3(0, 0.55, 0.05);
            for (let i = 0; i < 46; i++) {
                p = p.clone().add(new T.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.22));
                const c = new T.Vector3(0, 0.55, 0.05), o = p.clone().sub(c);
                if (o.length() > 0.3) p = c.clone().add(o.setLength(0.3 * R()));
                pts.push([p.x, p.y, p.z]);
            }
            const dna = k.mesh(k.tube(pts, 0.017, 420, true, 8), k.mat(0xF28DB5, { coat: 0.8, rough: 0.3 }));
            // ribosomes
            const rib = [];
            for (let i = 0; i < 170; i++) {
                const y = -0.9 + R() * 2.2, a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.42;
                const q = [Math.cos(a) * r, y, Math.sin(a) * r];
                if (Math.hypot(q[0], q[1] - 0.55, q[2] - 0.05) < 0.33) continue;
                rib.push(q);
            }
            rib.push([0.24, 0.9, 0.24]);
            const ribs = k.many(new T.IcosahedronGeometry(0.024, 1), k.mat(0x3A2466, { rough: 0.6 }), rib);
            // pili all over the capsule (not in the cut away corner)
            const pili = k.group(), pm = k.mat(0x6B4F3A, { rough: 0.8 });
            const pg = new T.CylinderGeometry(0.006, 0.008, 1, 5);
            let tip = null;
            for (let i = 0; i < 140; i++) {
                const y = -1.4 + R() * 2.8, a = R() * Math.PI * 2;
                let n = new T.Vector3(Math.cos(a), 0, Math.sin(a)), base;
                if (Math.abs(y) > 0.95) { const s = Math.sign(y); n = new T.Vector3(Math.cos(a) * 0.6, s * 0.8, Math.sin(a) * 0.6).normalize(); base = new T.Vector3(0, s * 0.95, 0).add(n.clone().multiplyScalar(0.62)); }
                else base = new T.Vector3(0, y, 0).add(n.clone().multiplyScalar(0.62));
                if (base.z > 0 && base.y > -0.35) continue;
                const L = 0.1 + R() * 0.1, m = k.mesh(pg, pm, pili);
                m.scale.set(1, L, 1);
                m.position.copy(base).add(n.clone().multiplyScalar(L / 2));
                m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
                if (!tip && base.x > 0.3 && base.z > 0.3) tip = base.clone().add(n.clone().multiplyScalar(L));
            }
            // sex pilus: one long curved tube
            const sex = k.mesh(k.tube([[-0.6, 0.7, 0.05], [-0.85, 0.82, 0.08], [-1.05, 0.78, 0.12], [-1.2, 0.95, 0.1]], 0.016, 40, false, 8), k.mat(0x4A3426, { rough: 0.6 }));
            // flagellum: a spinning helix
            const hel = [];
            for (let i = 0; i <= 90; i++) { const t = i / 90; hel.push([Math.cos(t * 14) * 0.14 * Math.min(1, t * 4), -1.52 - t * 1.5, Math.sin(t * 14) * 0.14 * Math.min(1, t * 4)]); }
            const flag = k.mesh(k.tube(hel, 0.022, 260, false, 8), k.mat(0x2B2B2B, { rough: 0.4 }));
            k.onFrame((t) => { flag.rotation.y = t * 5; });
            k.label('المحفظة', 'طبقة لزجة تحيط بجدار بعض أنواع البكتريا، تحميها وتساعدها على الالتصاق بالسطوح.', [0.44, -0.7, 0.44], caps);
            k.label('الجدار الخلوي', 'يحيط بالغشاء البلازمي، يعطي الخلية شكلها الثابت ويحميها.', [0.39, -0.24, 0.39], wall);
            k.label('الغشاء البلازمي', 'يحيط بالسايتوبلازم وينظم دخول المواد وخروجها من الخلية.', [0.35, 0.0, 0.35], memb);
            k.label('السايتوبلازم', 'مادة شبه سائلة تملأ الخلية، تحدث فيها معظم التفاعلات الحيوية.', [0.3, 0.26, 0.39], cyto);
            k.label('المنطقة النووية', 'فيها المادة الوراثية (DNA) الحلقية، وما يحيطها غشاء نووي لأن الخلية بدائية النواة.', [0.05, 0.62, 0.2], dna);
            k.label('الرايبوسومات', 'حبيبات صغيرة تبني البروتين.', [0.24, 0.9, 0.24], ribs);
            k.label('الشعيرات (الأهداب)', 'زوائد قصيرة ورفيعة تساعد البكتريا على الالتصاق بالسطوح.', tip ? [tip.x, tip.y, tip.z] : [0.5, -1, 0.5], pili);
            k.label('الهلب الجنسي', 'زائدة أطول من الشعيرات، تنتقل عبرها المادة الوراثية من خلية لأخرى أثناء الاقتران.', [-1.05, 0.78, 0.12], sex);
            k.label('السوط', 'زائدة طويلة تدور مثل المروحة وتحرك البكتريا.', [0.1, -2.3, 0.1], flag);
            return { view: [1, 0.35, 1.3] };
        }
    },

    // ---------- 2. Plant cell ----------
    {
        id: 'plant', title: 'الخلية النباتية', icon: 'leaf',
        build(k) {
            const T = k.THREE, R = k.rnd(5), D = T.DoubleSide;
            const wall = k.mesh(roundedBox(T, 1.9, 2.5, 1.05, 0.12), k.mat(0x7A2E3A, { clip: [k.cut(0, 0, 1, 0.3)], side: D, rough: 0.75 }));
            const memb = k.mesh(roundedBox(T, 1.74, 2.34, 0.9, 0.1), k.mat(0xD9607A, { clip: [k.cut(0, 0, 1, 0.2)], side: D }));
            const cyto = k.mesh(roundedBox(T, 1.7, 2.3, 0.86, 0.09), k.mat(0xF6E4B4, { opacity: 0.42, clip: [k.cut(0, 0, 1, 0.1)], side: D }));
            const vac = k.mesh(k.blob(0.55, 0.28, 2.2, 56, 3), k.mat(0x8CCB86, { opacity: 0.82, coat: 0.9, rough: 0.2 }));
            k.at(vac, 0.18, -0.12, -0.12, 0, 0, 0, [1.05, 1.45, 0.55]);
            const nuc = k.mesh(new T.SphereGeometry(0.27, 40, 30), k.mat(0x2B6A9E, { clip: [k.cut(0, 0, 1, 0.12)], side: D }));
            k.at(nuc, -0.5, 0.3, -0.02);
            const nucl = k.mesh(new T.SphereGeometry(0.1, 24, 18), k.mat(0xE0333C, { coat: 0.8 }));
            k.at(nucl, -0.46, 0.33, 0.04);
            const chl = k.group(), cm = k.mat(0x3E8E3A, { coat: 0.6 }), gm = k.mat(0x1F5A22);
            [[0.55, 0.62, 0.02, 0.4], [0.62, 0.05, 0.02, -0.3], [-0.55, -0.35, 0.02, 0.9], [0.55, -0.72, 0.0, -0.8], [-0.3, 0.9, -0.05, 0.1]].forEach(([x, y, z, r]) => {
                const g = k.group(chl);
                k.at(g, x, y, z, 0, 0, r);
                k.at(k.mesh(new T.SphereGeometry(0.16, 28, 20), cm, g), 0, 0, 0, 0, 0, 0, [1, 0.55, 0.55]);
                for (let s = -1; s <= 1; s++) k.at(k.mesh(new T.CylinderGeometry(0.035, 0.035, 0.11, 12), gm, g), s * 0.075, 0, 0.055, Math.PI / 2, 0, 0);
            });
            const mit = k.group(), mm = k.mat(0xE08A5A, { coat: 0.5 });
            [[-0.05, 0.75, 0.0, 0.3], [0.2, -0.95, 0.02, 1.2], [-0.62, -0.85, 0.0, -0.4]].forEach(([x, y, z, r]) => k.at(k.mesh(new T.CapsuleGeometry(0.06, 0.16, 8, 16), mm, mit), x, y, z, 0, 0, r + Math.PI / 2));
            const golgi = k.group(), gom = k.mat(0xC98A4B, { coat: 0.4 });
            for (let i = 0; i < 4; i++) k.at(k.mesh(new T.TorusGeometry(0.2 - i * 0.02, 0.022, 8, 28, 1.7), gom, golgi), 0, -i * 0.055, 0, 0, 0, 0.72, [1, 1, 0.45]);
            k.at(golgi, 0.4, 0.78, 0.02);
            const ves = k.many(new T.SphereGeometry(0.03, 12, 10), k.mat(0xD9A15E), [[0.2, 1.0, 0.02], [0.13, 0.95, 0.05], [0.24, 0.9, 0.06], [0.64, 0.6, 0.04]]);
            const rer = k.group(), rerM = k.mat(0xB0684A);
            for (let i = 0; i < 4; i++) k.at(k.mesh(new T.TorusGeometry(0.34 + i * 0.05, 0.016, 6, 40, 1.4), rerM, rer), -0.5, 0.3, -0.04, 0, 0, 2.2 + i * 0.05);
            const rrib = [];
            for (let i = 0; i < 4; i++) for (let a = 0; a < 16; a++) { const an = 2.2 + i * 0.05 + (a / 16) * 1.4, rr = 0.34 + i * 0.05 + 0.02; rrib.push([-0.5 + Math.cos(an) * rr, 0.3 + Math.sin(an) * rr, -0.04]); }
            k.many(new T.SphereGeometry(0.012, 6, 5), k.mat(0x3A2020), rrib, rer);
            const ser = k.mesh(k.tube([[-0.75, -0.02, 0], [-0.6, -0.12, 0.03], [-0.72, -0.2, 0], [-0.55, -0.28, 0.03], [-0.7, -0.38, 0]], 0.02, 60, false, 8), k.mat(0xD8A06E));
            const fr = [];
            for (let i = 0; i < 40; i++) fr.push([-0.75 + R() * 0.4, 0.75 + R() * 0.35, -0.05 + R() * 0.12]);
            const ribs = k.many(new T.IcosahedronGeometry(0.018, 1), k.mat(0x2A1A1A), fr);
            const starch = k.group(), sm = k.mat(0xEADCBF, { coat: 0.6 });
            k.mesh(new T.SphereGeometry(0.075, 24, 18), sm, starch);
            for (let i = 1; i <= 2; i++) k.at(k.mesh(new T.TorusGeometry(0.045 + i * 0.035, 0.009, 6, 30), k.mat(0xB89868), starch), 0, 0, 0.02);
            k.at(starch, -0.55, -0.72, 0.02);
            k.label('الجدار الخلوي', 'طبقة صلبة من السليلوز تحيط بالغشاء البلازمي، تعطي الخلية النباتية شكلها الثابت وتحميها.', [0.95, 0.2, 0.25], wall);
            k.label('الغشاء البلازمي', 'يحيط بالسايتوبلازم تحت الجدار ويتحكم بمرور المواد.', [0.85, -0.45, 0.17], memb);
            k.label('السايتوبلازم', 'المادة التي تملأ الخلية وتسبح فيها العضيات.', [0.75, -1.05, 0.02], cyto);
            k.label('الفجوة العصارية المركزية', 'فجوة كبيرة تخزن الماء والأملاح والفضلات وتحافظ على امتلاء الخلية.', [0.2, -0.3, 0.14], vac);
            k.label('النواة', 'تحوي المادة الوراثية وتتحكم بجميع فعاليات الخلية.', [-0.66, 0.42, 0.08], nuc);
            k.label('النوية', 'جسم داخل النواة يصنع الرايبوسومات.', [-0.46, 0.33, 0.13], nucl);
            k.label('البلاستيدة الخضراء', 'تحوي الكلوروفيل وتقوم بعملية البناء الضوئي.', [0.62, 0.05, 0.1], chl);
            k.label('المايتوكوندريا', 'مركز تحرير الطاقة في الخلية (التنفس الخلوي).', [0.2, -0.95, 0.08], mit);
            k.label('جهاز كولجي', 'أكياس غشائية مسطحة تعدّل البروتينات وتعبئها بحويصلات.', [0.42, 0.72, 0.05], golgi);
            k.label('حويصلة كولجي', 'تنقل المواد التي عبّأها جهاز كولجي.', [0.2, 1.0, 0.05], ves);
            k.label('الشبكة البلازمية الداخلية الخشنة', 'أغشية عليها رايبوسومات، تبني البروتين وتنقله.', [-0.84, 0.44, -0.02], rer);
            k.label('الشبكة البلازمية الداخلية الملساء', 'أغشية بدون رايبوسومات، تبني الدهون.', [-0.6, -0.12, 0.05], ser);
            k.label('الرايبوسومات', 'حبيبات صغيرة تبني البروتين.', [-0.55, 1.0, 0.02], ribs);
            k.label('حبيبات النشا', 'غذاء مخزون بشكل نشا.', [-0.55, -0.72, 0.1], starch);
            return { view: [0.55, 0.3, 1.5] };
        }
    },

    // ---------- 3. Animal cell ----------
    {
        id: 'animal', title: 'الخلية الحيوانية', icon: 'circle-dot',
        build(k) {
            const T = k.THREE, R = k.rnd(9), D = T.DoubleSide;
            const wedge = (d) => [k.cut(1, 0, 0, d), k.cut(0, 0, 1, d)];
            const memb = k.mesh(new T.SphereGeometry(1, 72, 54), k.mat(0xE3A06E, { clip: wedge(0.02), clipAll: true, side: D, sheen: 0.5 }));
            memb.scale.set(1, 1.2, 0.9);
            const cyto = k.mesh(new T.SphereGeometry(0.97, 64, 48), k.mat(0xF7E2A6, { opacity: 0.4, clip: wedge(0), clipAll: true, side: D }));
            cyto.scale.set(1, 1.2, 0.9);
            const nuc = k.mesh(new T.SphereGeometry(0.3, 44, 34), k.mat(0x2D5E68, { clip: wedge(0.05), clipAll: true, side: D }));
            const nucIn = k.mesh(new T.SphereGeometry(0.29, 40, 30), k.mat(0x4F8A92, { opacity: 0.6, clip: wedge(0.04), clipAll: true, side: D }));
            const nucl = k.mesh(new T.SphereGeometry(0.1, 26, 20), k.mat(0xE0333C, { coat: 0.9 }));
            k.at(nucl, 0.06, 0.05, 0.06);
            // rough ER: folded sheets around the nucleus, studded with ribosomes
            const rer = k.group(), rm = k.mat(0xC0754E, { side: D });
            const rib = [];
            for (let f = 0; f < 3; f++) {
                const pts = [];
                for (let i = 0; i <= 40; i++) {
                    const a = -0.4 + (i / 40) * 2.6, rr = 0.42 + f * 0.1 + 0.05 * Math.sin(i * 1.3);
                    pts.push([Math.cos(a) * rr, -0.1 + f * 0.12 + 0.08 * Math.sin(i * 0.8), Math.sin(a) * rr]);
                }
                k.mesh(k.tube(pts, 0.03, 160, false, 6), rm, rer);
                pts.forEach((p, i) => { if (i % 2 === 0) rib.push([p[0] * 1.08, p[1] + 0.03, p[2] * 1.08]); });
            }
            k.many(new T.SphereGeometry(0.015, 6, 5), k.mat(0x2A1818), rib, rer);
            const ser = k.group(), serM = k.mat(0xE3B07E);
            for (let f = 0; f < 3; f++) {
                const pts = [];
                for (let i = 0; i <= 10; i++) pts.push([-0.55 + f * 0.08 + 0.08 * Math.sin(i * 1.7), -0.55 + i * 0.07, 0.25 + 0.1 * Math.cos(i * 1.3 + f)]);
                k.mesh(k.tube(pts, 0.025, 80, false, 8), serM, ser);
            }
            const golgi = k.group(), gm = k.mat(0x3F8F5A, { coat: 0.5 });
            for (let i = 0; i < 5; i++) k.at(k.mesh(new T.TorusGeometry(0.24 - i * 0.02, 0.022, 8, 30, 1.8), gm, golgi), 0, -i * 0.055, 0, 0, 0, 0.7, [1, 1, 0.4]);
            k.at(golgi, 0.35, 0.62, 0.3, 0.3, 0.6, 0);
            const ves = k.many(new T.SphereGeometry(0.035, 14, 10), k.mat(0x7CC08A), [[0.12, 0.78, 0.4], [0.2, 0.86, 0.3], [0.55, 0.45, 0.35]]);
            const lyso = k.group();
            k.mesh(new T.SphereGeometry(0.08, 24, 18), k.mat(0x9063B0, { coat: 0.7 }), lyso);
            k.many(new T.SphereGeometry(0.014, 6, 5), k.mat(0x3D1F58), Array.from({ length: 10 }, () => [(R() - 0.5) * 0.1, (R() - 0.5) * 0.1, 0.06 + R() * 0.02]), lyso);
            k.at(lyso, -0.25, 0.85, 0.35);
            const mit = k.group(), mm = k.mat(0xE0773E, { coat: 0.5 }), cr = k.mat(0xF5C089);
            [[0.55, -0.35, 0.35, 0.6], [-0.3, -0.75, 0.45, -0.3], [0.62, 0.15, -0.1, 1.2]].forEach(([x, y, z, r]) => {
                const g = k.group(mit); k.at(g, x, y, z, 0.3, 0, r);
                k.mesh(new T.CapsuleGeometry(0.075, 0.2, 8, 18), mm, g).rotation.z = Math.PI / 2;
                for (let i = -2; i <= 2; i++) k.at(k.mesh(new T.TorusGeometry(0.05, 0.008, 5, 16, Math.PI), cr, g), i * 0.05, 0, 0.06, 0, Math.PI / 2, 0);
            });
            const cent = k.group(), ctm = k.mat(0x5B6C8F, { coat: 0.4 });
            [[0, 0, 0], [Math.PI / 2, 0, 0]].forEach((rot, j) => {
                const g = k.group(cent); k.at(g, j * 0.13, 0, 0, rot[0], rot[1], rot[2]);
                for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; k.at(k.mesh(new T.CylinderGeometry(0.012, 0.012, 0.16, 6), ctm, g), Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04); }
            });
            k.at(cent, 0.3, -0.6, 0.42);
            const mt = k.group(), mtm = k.mat(0x6AAF3F);
            [[[-0.7, -0.2, 0.2], [-0.3, 0.1, 0.5]], [[0.2, -0.95, -0.1], [0.55, -0.6, 0.25]], [[-0.55, 0.5, 0.3], [-0.15, 0.95, 0.1]]].forEach(([a, b]) => k.mesh(k.tube([a, [(a[0] + b[0]) / 2 + 0.05, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b], 0.012, 20, false, 6), mtm, mt));
            const fr = [];
            for (let i = 0; i < 90; i++) { const a = R() * Math.PI * 2, r = 0.45 + R() * 0.4; fr.push([Math.cos(a) * r, (R() - 0.5) * 1.6, Math.sin(a) * r * 0.8]); }
            const ribs = k.many(new T.IcosahedronGeometry(0.017, 1), k.mat(0x2A1818), fr);
            k.label('الغشاء البلازمي', 'يحيط بالخلية وينظم دخول المواد وخروجها (نفاذية اختيارية).', [-0.55, 0.62, 0.56], memb);
            k.label('السايتوبلازم', 'المادة التي تملأ الخلية وتسبح فيها العضيات.', [0.6, -0.8, 0.02], cyto);
            k.label('النواة', 'تحوي المادة الوراثية وتسيطر على فعاليات الخلية.', [0.02, 0.24, 0.16], nuc);
            k.label('النوية', 'تصنع الرايبوسومات داخل النواة.', [0.06, 0.05, 0.16], nucl);
            k.label('الشبكة البلازمية الداخلية الخشنة', 'عليها رايبوسومات، تبني البروتين وتنقله داخل الخلية.', [0.45, -0.05, 0.25], rer);
            k.label('الشبكة البلازمية الداخلية الملساء', 'بدون رايبوسومات، تبني الدهون وتخلص الخلية من السموم.', [-0.5, -0.2, 0.3], ser);
            k.label('جهاز كولجي', 'يعدّل البروتينات ويعبئها بحويصلات ويوزعها.', [0.4, 0.55, 0.32], golgi);
            k.label('حويصلة كولجي', 'تنقل المواد من جهاز كولجي.', [0.12, 0.78, 0.43], ves);
            k.label('الجسيم الحال', 'كيس فيه إنزيمات هاضمة، يهضم المواد والعضيات التالفة.', [-0.25, 0.85, 0.43], lyso);
            k.label('المايتوكوندريا', 'تحرر الطاقة من الغذاء بعملية التنفس الخلوي.', [0.55, -0.35, 0.43], mit);
            k.label('الجسيمات المركزية', 'زوج من الأجسام الأسطوانية، تشترك بانقسام الخلية الحيوانية.', [0.36, -0.6, 0.5], cent);
            k.label('النبيبات الدقيقة', 'أنابيب رفيعة تكوّن هيكل الخلية وتساعد بحركة العضيات.', [-0.5, 0.05, 0.35], mt);
            k.label('الرايبوسومات', 'حبيبات صغيرة تبني البروتين.', fr[3], ribs);
            return { view: [1.2, 0.55, 1.1] };
        }
    },

    // ---------- 4. Plasma membrane ----------
    {
        id: 'membrane', title: 'الغشاء البلازمي (النموذج الفسيفسائي السائل)', icon: 'layers',
        build(k) {
            const T = k.THREE;
            const prot = [[-0.7, 0, 0.1, 0.22, 0.2], [0.55, 0, -0.2, 0.26, -0.5], [0.95, 0, 0.35, 0.2, 0.3], [-0.2, 0, -0.35, 0.2, 0.6]];
            const ch = [0.1, 0, 0.25];
            const heads = [], tails = [];
            for (let x = -1.35; x <= 1.36; x += 0.15) for (let z = -0.6; z <= 0.61; z += 0.15) {
                if (prot.some((p) => Math.hypot(p[0] - x, p[2] - z) < p[3] + 0.08) || Math.hypot(ch[0] - x, ch[2] - z) < 0.3) continue;
                [1, -1].forEach((s) => {
                    heads.push([x, s * 0.42, z]);
                    tails.push([x - 0.025, s * 0.25, z, 0, 0, 0.05 * s], [x + 0.025, s * 0.25, z, 0, 0, -0.05 * s]);
                });
            }
            const hm = k.many(new T.SphereGeometry(0.068, 16, 12), k.mat(0x3663B0, { coat: 0.8, rough: 0.3 }), heads);
            const tm = k.many(new T.CylinderGeometry(0.011, 0.011, 0.3, 6), k.mat(0xC59BDB, { rough: 0.7 }), tails);
            const pm = k.mat(0xE8743A, { coat: 0.6, rough: 0.35 }), carr = k.group();
            prot.forEach(([x, y, z, r, ry], i) => {
                const m = k.mesh(k.blob(1, 0.18, 2.5, 40, i + 2), pm, carr);
                k.at(m, x, y, z, 0.1 * i, ry, 0.15 * (i % 2 ? 1 : -1), [r, 0.62, r * 0.9]);
            });
            const pts = [[0, -0.5], [0.23, -0.5], [0.25, -0.2], [0.22, 0.2], [0.25, 0.5], [0, 0.5]].map(([x, y]) => new T.Vector2(x, y));
            const chanShape = [new T.Vector2(0.07, -0.52), new T.Vector2(0.26, -0.5), new T.Vector2(0.24, 0), new T.Vector2(0.26, 0.5), new T.Vector2(0.07, 0.52), new T.Vector2(0.07, -0.52)];
            const chan = k.mesh(new T.LatheGeometry(chanShape, 40), k.mat(0xD4552A, { coat: 0.6, side: T.DoubleSide }));
            k.at(chan, ch[0], 0, ch[2]);
            const pore = k.mesh(new T.CircleGeometry(0.07, 24), k.mat(0x1A0B08, { rough: 1 }));
            k.at(pore, ch[0], 0.515, ch[2], -Math.PI / 2, 0, 0);
            // molecules going through the channel
            const mol = k.group(), molM = k.mat(0xD91E36, { coat: 0.9, rough: 0.2 });
            const balls = [];
            for (let i = 0; i < 4; i++) balls.push(k.mesh(new T.SphereGeometry(0.05, 18, 14), molM, mol));
            const still = [[-0.4, 0.75, 0.2], [-0.3, 0.9, -0.1], [0.5, 0.8, 0.3], [0.7, 0.95, 0.1], [-0.9, -0.8, 0.2]];
            still.forEach((p) => k.at(k.mesh(new T.SphereGeometry(0.05, 18, 14), molM, mol), p[0], p[1], p[2]));
            k.onFrame((t) => balls.forEach((b, i) => { const u = ((t * 0.35 + i / 4) % 1); b.position.set(ch[0], 0.95 - u * 1.9, ch[2]); b.scale.setScalar(0.8 + 0.2 * Math.sin(u * Math.PI)); }));
            k.label('طرف أليف للماء', 'رؤوس الدهون المفسفرة، تتجه للماء خارج الخلية وداخلها.', [-1.2, 0.42, 0.45], hm);
            k.label('طرف نافر للماء', 'ذيول الدهون المفسفرة، تتجه للداخل بعيداً عن الماء.', [-1.2, 0.2, 0.45], tm);
            k.label('بروتينات ناقلة', 'بروتينات تخترق الغشاء وتنقل مواد معينة عبره.', [0.55, 0.2, 0.0], carr);
            k.label('قناة ناقلة', 'بروتين على شكل قناة تمر منها مواد محددة.', [0.33, 0.1, 0.25], chan);
            k.label('ثقب', 'فتحة القناة التي تعبر منها الجزيئات.', [ch[0], 0.52, ch[2]], pore);
            k.label('مواد منقولة', 'جزيئات تعبر الغشاء من خلال القنوات والبروتينات الناقلة.', [0.5, 0.8, 0.3], mol);
            k.label('خارج الخلية', 'الجهة الخارجية من الغشاء.', [-0.9, 0.95, -0.3], []);
            k.label('داخل الخلية', 'الجهة الداخلية (السايتوبلازم).', [-0.9, -0.95, -0.3], []);
            return { view: [0.4, 0.45, 1.5] };
        }
    },

    // ---------- 5. Chromosome ----------
    {
        id: 'chromosome', title: 'الكروموسوم', icon: 'dna',
        build(k) {
            const T = k.THREE;
            const cm = k.mat(0x2B4C7E, { coat: 0.8, rough: 0.35, sheen: 0.4 });
            const left = k.mesh(coiledTube(k, [[-0.42, 1.25, 0], [-0.3, 0.8, 0.05], [-0.1, 0.2, 0], [-0.07, 0, 0], [-0.1, -0.2, 0], [-0.32, -0.85, 0.05], [-0.45, -1.3, 0]], 0.2, 180, 0.5), cm);
            const right = k.mesh(coiledTube(k, [[0.42, 1.25, 0], [0.3, 0.8, -0.05], [0.1, 0.2, 0], [0.07, 0, 0], [0.1, -0.2, 0], [0.32, -0.85, -0.05], [0.45, -1.3, 0]], 0.2, 180, 0.5), cm.clone());
            const cen = k.group(), rm = k.mat(0xD62B2B, { coat: 0.9, rough: 0.25 });
            k.at(k.mesh(new T.SphereGeometry(0.13, 32, 24), rm, cen), -0.1, 0, 0.02);
            k.at(k.mesh(new T.SphereGeometry(0.13, 32, 24), rm, cen), 0.1, 0, 0.02);
            k.label('كروماتيدان شقيقتان', 'نسختان متطابقتان من الكروموسوم نتجتا من تضاعف الـ DNA، مرتبطتان بالقطعة المركزية.', [0.4, 0.95, 0.12], [left, right]);
            k.label('القطعة المركزية (الجزء المركزي)', 'المنطقة التي ترتبط عندها الكروماتيدات الشقيقة، وتتصل بها خيوط المغزل أثناء الانقسام.', [0.12, 0, 0.14], cen);
            return { view: [0.25, 0.2, 1.6] };
        }
    },

    // ---------- 6. Chloroplast ----------
    {
        id: 'chloroplast', title: 'البلاستيدة الخضراء', icon: 'sprout',
        build(k) {
            const T = k.THREE, D = T.DoubleSide;
            const outer = k.mesh(new T.SphereGeometry(1, 72, 54), k.mat(0x4E9A3A, { clip: [k.cut(0, 0, 1, 0.08)], side: D }));
            outer.scale.set(1.35, 0.7, 0.72);
            const inner = k.mesh(new T.SphereGeometry(0.95, 72, 54), k.mat(0xB8D86A, { clip: [k.cut(0, 0, 1, 0.02)], side: D }));
            inner.scale.set(1.35, 0.7, 0.72);
            const stroma = k.mesh(new T.SphereGeometry(0.92, 60, 44), k.mat(0xF3EC8C, { opacity: 0.5, clip: [k.cut(0, 0, 1, -0.02)], side: D }));
            stroma.scale.set(1.35, 0.7, 0.72);
            const grana = k.group(), gm = k.mat(0x2E6B2D, { coat: 0.6 }), lam = k.group(), lm = k.mat(0x76B253);
            const rows = [[-0.28, [-0.85, -0.35, 0.2, 0.75]], [0.08, [-0.6, -0.05, 0.5]], [0.38, [-0.8, -0.2, 0.35, 0.85]]];
            let pick = null;
            rows.forEach(([y, xs]) => {
                xs.forEach((x) => {
                    const st = k.group(grana);
                    k.at(st, x, y, -0.1);
                    for (let i = 0; i < 6; i++) k.at(k.mesh(new T.CylinderGeometry(0.12, 0.12, 0.028, 26), gm, st), 0, -0.1 + i * 0.042, 0);
                    if (!pick) pick = [x, y, -0.1];
                });
                for (let i = 0; i < xs.length - 1; i++) {
                    const a = xs[i], b = xs[i + 1];
                    k.at(k.mesh(new T.BoxGeometry(b - a - 0.2, 0.014, 0.16), lm, lam), (a + b) / 2, y + 0.005, -0.1);
                }
            });
            const st = k.group(), sm = k.mat(0xC62828, { coat: 0.9, rough: 0.25 });
            k.at(k.mesh(new T.SphereGeometry(0.13, 30, 22), sm, st), 0.55, 0.2, -0.12);
            k.at(k.mesh(new T.SphereGeometry(0.12, 30, 22), sm, st), -0.25, -0.05, -0.15);
            k.label('غشاء خارجي', 'الغشاء الأملس الذي يحيط بالبلاستيدة.', [-0.95, 0.35, 0.28], outer);
            k.label('غشاء داخلي', 'غشاء ثاني تحت الخارجي يحيط بالسدى.', [-1.05, -0.2, 0.2], inner);
            k.label('السدى', 'سائل يملأ البلاستيدة، تحدث فيه تفاعلات الظلام (تكوين السكر).', [0.1, -0.45, -0.1], stroma);
            k.label('الكرانوم', 'مجموعة أقراص (ثايلاكويدات) مرصوصة فوق بعض، فيها الكلوروفيل وتحدث فيها تفاعلات الضوء.', [pick[0], pick[1] + 0.16, pick[2]], grana);
            k.label('صفائح الكرانا', 'صفائح غشائية تربط الكرانات ببعضها.', [0.12, 0.09, -0.1], lam);
            k.label('حبيبة نشا', 'غذاء مخزون ناتج من البناء الضوئي.', [0.55, 0.3, -0.05], st);
            return { view: [0.35, 0.55, 1.4] };
        }
    },

    // ---------- 7. Mitochondrion ----------
    {
        id: 'mito', title: 'المايتوكوندريا', icon: 'battery-charging',
        build(k) {
            const T = k.THREE, D = T.DoubleSide;
            const outer = k.mesh(new T.CapsuleGeometry(0.5, 1.5, 20, 60), k.mat(0xD9803F, { clip: [k.cut(0, 0, 1, 0.1)], side: D }));
            outer.rotation.z = Math.PI / 2;
            const inner = k.mesh(new T.CapsuleGeometry(0.43, 1.5, 20, 60), k.mat(0xF0A763, { clip: [k.cut(0, 0, 1, 0.05)], side: D }));
            inner.rotation.z = Math.PI / 2;
            const matrix = k.mesh(new T.CapsuleGeometry(0.41, 1.48, 16, 48), k.mat(0x93C17E, { opacity: 0.55, clip: [k.cut(0, 0, 1, 0.0)], side: D }));
            matrix.rotation.z = Math.PI / 2;
            const cr = k.group(), cm = k.mat(0xF0A763, { coat: 0.5 });
            for (let i = 0; i < 9; i++) {
                const x = -0.95 + i * 0.24, up = i % 2 === 0, L = 0.42 + (i % 3) * 0.06;
                const m = k.mesh(new T.CapsuleGeometry(0.035, L, 6, 12), cm, cr);
                k.at(m, x, up ? 0.43 - L / 2 - 0.02 : -0.43 + L / 2 + 0.02, -0.08, 0, 0, 0.12 * (up ? 1 : -1), [1, 1, 7]);
            }
            const dots = [];
            const R = k.rnd(3);
            for (let i = 0; i < 26; i++) dots.push([-1 + R() * 2, (R() - 0.5) * 0.6, -0.2 + R() * 0.2]);
            const dm = k.many(new T.SphereGeometry(0.025, 10, 8), k.mat(0x7A1F1F), dots);
            k.label('غشاء خارجي', 'غشاء أملس يحيط بالمايتوكوندريا.', [-0.35, 0.5, 0.12], outer);
            k.label('غشاء داخلي', 'غشاء ثاني ينطوي للداخل مكوّناً الأعراف.', [0.4, -0.42, 0.07], inner);
            k.label('الأعراف', 'طيات الغشاء الداخلي، تزيد المساحة التي تحدث عليها تفاعلات تحرير الطاقة.', [-0.47, -0.12, -0.02], cr);
            k.label('القالب', 'السائل داخل الغشاء الداخلي، فيه إنزيمات التنفس الخلوي والـ DNA الخاص بالمايتوكوندريا.', [0.85, 0.05, -0.1], [matrix, dm]);
            return { view: [0.3, 0.5, 1.5] };
        }
    }
];
