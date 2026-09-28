// 3D biology diagrams, part 5: reproduction.

function arrow(k, from, to, color, r, parent) {
    const T = k.THREE, a = new T.Vector3(...from), b = new T.Vector3(...to), d = b.clone().sub(a), L = d.length(), g = new T.Group();
    (parent || k.group()).add(g);
    const m = k.mat(color, { coat: 0.6, bump: 0 });
    const shaft = k.mesh(new T.CylinderGeometry(r, r, L * 0.75, 10), m, g); shaft.position.y = L * 0.375;
    const head = k.mesh(new T.ConeGeometry(r * 2.6, L * 0.25, 14), m, g); head.position.y = L * 0.875;
    g.position.copy(a);
    g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return g;
}

// A tube whose thickness follows rFn(t) along the curve, closed with round ends.
function organ(k, pts, rFn, mat, parent, seg, radial) {
    const T = k.THREE, rings = seg || 90, rad = radial || 16;
    const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(p[0], p[1], p[2])), false, 'centripetal');
    const g = new T.TubeGeometry(curve, rings, 1, rad, false), pos = g.attributes.position, v = new T.Vector3(), c = new T.Vector3();
    for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        curve.getPointAt(t, c);
        const r = rFn(t);
        for (let j = 0; j <= rad; j++) { const idx = i * (rad + 1) + j; v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c); pos.setXYZ(idx, v.x, v.y, v.z); }
    }
    g.computeVertexNormals();
    const grp = new T.Group();
    (parent || k.group()).add(grp);
    k.mesh(g, mat, grp);
    [0, 1].forEach((e) => { const s = k.mesh(new T.SphereGeometry(rFn(e) * 1.0, rad, 10), mat, grp); s.position.copy(curve.getPointAt(e)); });
    grp.userData.curve = curve;
    return grp;
}

// A germ cell: see-through membrane, nucleus and a few chromosomes.
function germ(k, parent, p, r, o = {}) {
    const T = k.THREE, g = new T.Group();
    parent.add(g);
    g.position.set(p[0], p[1], p[2]);
    k.mesh(new T.SphereGeometry(r, 40, 30), k.mat(o.col || 0x9A6FB0, { glass: true, thick: r, atten: 0.35, bump: 0.5, rep: 2 }), g);
    k.mesh(new T.SphereGeometry(r * 0.52, 28, 20), k.mat(o.nuc || 0x5A3A78, { clear: true, opacity: 0.5, bump: 0.2 }), g);
    const cm = k.mat(0x1E1030, { coat: 0.6, bump: 0 }), n = o.chr ?? 2;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI + 0.3, s = r * 0.3;
        const tb = k.mesh(k.tube([[-s * 0.6, -s, 0], [0, 0, s * 0.3], [s * 0.6, s, 0]], r * 0.05, 16, false, 6), cm, g);
        tb.rotation.z = a; tb.position.set(Math.cos(a) * r * 0.1, Math.sin(a) * r * 0.1, r * 0.1);
        if (o.x) { const t2 = k.mesh(k.tube([[-s * 0.6, s, 0], [0, 0, s * 0.3], [s * 0.6, -s, 0]], r * 0.05, 16, false, 6), cm, g); t2.rotation.z = a; t2.position.copy(tb.position); }
    }
    return g;
}

function sperm(k, parent, p, s, rot) {
    const T = k.THREE, g = new T.Group();
    parent.add(g);
    g.position.set(p[0], p[1], p[2]);
    if (rot) g.rotation.z = rot;
    const head = k.mesh(new T.SphereGeometry(1, 32, 24), k.mat(0x5B7FC4, { coat: 0.8, rough: 0.3, bump: 0.3 }), g);
    head.scale.set(0.2 * s, 0.13 * s, 0.11 * s);
    const acro = k.mesh(new T.SphereGeometry(1, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.45), k.mat(0x93B4E8, { clear: true, opacity: 0.55, bump: 0 }), g);
    acro.scale.set(0.2 * s, 0.14 * s, 0.12 * s); acro.rotation.z = Math.PI / 2; acro.position.x = -0.015 * s;
    const neck = k.mesh(new T.CylinderGeometry(0.05 * s, 0.06 * s, 0.06 * s, 16), k.mat(0x3FB6A8, { coat: 0.6, bump: 0 }), g);
    neck.rotation.z = Math.PI / 2; neck.position.x = 0.22 * s;
    const mid = k.mesh(new T.CylinderGeometry(0.04 * s, 0.04 * s, 0.3 * s, 16), k.mat(0x9E2B3C, { stripe: 10, coat: 0.5, bump: 0.3 }), g);
    mid.rotation.z = Math.PI / 2; mid.position.x = 0.4 * s;
    const tailPts = [];
    for (let i = 0; i <= 30; i++) tailPts.push([0.55 * s + i * 0.045 * s, 0, 0]);
    const tailGeo = k.tube(tailPts, 0.022 * s, 90, false, 8), base = tailGeo.attributes.position.array.slice();
    const tail = k.mesh(tailGeo, k.mat(0xE3A34E, { coat: 0.4, bump: 0 }), g);
    k.onFrame((t) => {
        const pa = tailGeo.attributes.position;
        for (let i = 0; i < pa.count; i++) { const x = base[i * 3], u = Math.max(0, (x - 0.55 * s) / (1.35 * s)); pa.setY(i, base[i * 3 + 1] + Math.sin(x / s * 7 - t * 8) * 0.07 * s * u); }
        pa.needsUpdate = true;
        tailGeo.computeVertexNormals();
    });
    return { g, head, neck, mid, tail };
}

// Shape change for dividing cells: stretch along x, pinch in the middle, then two bodies.
function deformer(geos) {
    const base = geos.map((g) => g.attributes.position.array.slice());
    return (st, pin, sep) => geos.forEach((g, gi) => {
        const p = g.attributes.position, b = base[gi];
        for (let i = 0; i < p.count; i++) {
            const x = b[i * 3], y = b[i * 3 + 1], z = b[i * 3 + 2];
            let nx = x * st + Math.sign(x) * sep;
            const f = 1 - pin * 0.95 * Math.exp(-Math.pow(nx / (0.25 + sep * 0.3), 2)) * (sep > 0.02 ? 0 : 1);
            p.setXYZ(i, nx, y * f, z * f);
        }
        p.needsUpdate = true;
        g.computeVertexNormals();
    });
}

function stepper(k, S, apply) {
    let cur = Object.assign({}, S[0]), target = S[0];
    k.onFrame(() => { Object.keys(target).forEach((q) => { if (typeof target[q] === 'number') cur[q] += (target[q] - cur[q]) * 0.08; }); apply(cur, target); });
    return (i) => { target = S[i]; };
}

export const MODELS = [
    // ---------- Spermatogenesis ----------
    {
        id: 'spermato', title: 'تكوين النطف في اللبائن', icon: 'git-branch',
        build(k) {
            const T = k.THREE, root = k.group(), am = 0x2A2A2A;
            const c0 = germ(k, root, [0, 1.75, 0], 0.26, { chr: 2 });
            const c1 = germ(k, root, [0, 1.0, 0], 0.32, { chr: 2, x: true });
            const c2 = [germ(k, root, [-0.5, 0.2, 0], 0.22, { chr: 1, x: true }), germ(k, root, [0.5, 0.2, 0], 0.22, { chr: 1, x: true })];
            const c3 = [-0.78, -0.26, 0.26, 0.78].map((x) => germ(k, root, [x, -0.55, 0], 0.15, { chr: 1 }));
            const sp = [-0.78, -0.26, 0.26, 0.78].map((x) => sperm(k, root, [x, -1.0, 0], 0.5, -Math.PI / 2));
            const ar = new T.Group(); root.add(ar);
            arrow(k, [0, 1.47, 0], [0, 1.34, 0], am, 0.015, ar);
            [[-1, -0.5], [1, 0.5]].forEach(([s, x]) => arrow(k, [s * 0.18, 0.74, 0], [x * 0.9, 0.44, 0], am, 0.015, ar));
            [[-0.5, -0.78], [-0.5, -0.26], [0.5, 0.26], [0.5, 0.78]].forEach(([a, b]) => arrow(k, [a + (b - a) * 0.2, -0.02, 0], [b - (b - a) * 0.1, -0.36, 0], am, 0.013, ar));
            const dash = [];
            for (let x = -1.05; x <= 1.05; x += 0.1) dash.push([x, -0.83, 0]);
            const dl = k.many(new T.BoxGeometry(0.06, 0.012, 0.012), k.mat(0x222222, { bump: 0 }), dash);
            k.label('سليفة النطفة', 'خلايا بالنبيبات المنوية عدد كروموسوماتها كامل (2ن)، تنقسم خيطياً وتكبر.', [0, 1.75, 0.26], c0);
            k.label('خلية نطفية أولية', 'تكبر السليفة وتصير خلية نطفية أولية (2ن) تدخل الانقسام الاختزالي.', [0, 1.0, 0.32], c1);
            k.label('انقسام اختزالي 1', 'ينتج خليتين نطفيتين ثانويتين (ن).', [0.5, 0.6, 0], ar.children[1]);
            k.label('خلية نطفية ثانوية', 'عدد كروموسوماتها نصف العدد (ن).', [0.5, 0.2, 0.22], c2);
            k.label('انقسام اختزالي 2', 'كل خلية ثانوية تنتج أرومتي نطف.', [0.65, -0.2, 0], ar.children.slice(3));
            k.label('أرومة النطف', 'أربع خلايا (ن) من كل خلية أولية.', [0.26, -0.55, 0.15], c3);
            k.label('عملية التحول النطفي', 'تتحول الأرومة لنطفة: يتكون الذيل والقطعة الوسطية ويقل السايتوبلازم.', [-1.05, -0.83, 0], dl);
            k.label('نطفة', 'خلية جنسية ذكرية متحركة.', [0.78, -1.0, 0.05], sp.map((q) => q.g));
            return { view: [0.1, 0.1, 1.6] };
        }
    },
    // ---------- Oogenesis ----------
    {
        id: 'oogen', title: 'تكوين البيوض في اللبائن', icon: 'egg',
        build(k) {
            const T = k.THREE, root = k.group(), am = 0x2A2A2A, oc = 0x6C5A9E;
            const c0 = germ(k, root, [0, 1.75, 0], 0.27, { col: oc });
            const c1 = germ(k, root, [0, 1.0, 0], 0.34, { col: oc, x: true });
            const pb1 = germ(k, root, [-0.55, 0.25, 0], 0.17, { col: oc, chr: 1, x: true });
            const c2 = germ(k, root, [0.4, 0.2, 0], 0.27, { col: oc, chr: 1, x: true });
            const pb2 = [germ(k, root, [-0.85, -0.55, 0], 0.13, { col: oc, chr: 1 }), germ(k, root, [-0.45, -0.55, 0], 0.13, { col: oc, chr: 1 }), germ(k, root, [0.05, -0.55, 0], 0.13, { col: oc, chr: 1 })];
            const ootid = germ(k, root, [0.6, -0.65, 0], 0.32, { col: oc, chr: 1 });
            const ar = new T.Group(); root.add(ar);
            arrow(k, [0, 1.46, 0], [0, 1.36, 0], am, 0.015, ar);
            arrow(k, [-0.15, 0.7, 0], [-0.45, 0.43, 0], am, 0.015, ar);
            arrow(k, [0.15, 0.7, 0], [0.35, 0.48, 0], am, 0.015, ar);
            [[-0.55, -0.85], [-0.55, -0.45], [0.4, 0.05], [0.4, 0.6]].forEach(([a, b]) => arrow(k, [a + (b - a) * 0.2, (a < 0 ? 0.08 : 0), 0], [b - (b - a) * 0.1, -0.4, 0], am, 0.013, ar));
            k.label('سليفة البيضة', 'خلايا بالمبيض (2ن).', [0, 1.75, 0.27], c0);
            k.label('خلية بيضية أولية', 'تبدأ الانقسام الاختزالي الأول (2ن).', [0, 1.0, 0.34], c1);
            k.label('انقسام اختزالي 1', 'ينتج خليتين غير متساويتين بالحجم.', [0.25, 0.6, 0], ar.children.slice(1, 3));
            k.label('جسم قطبي أول', 'خلية صغيرة سايتوبلازمها قليل.', [-0.55, 0.25, 0.17], pb1);
            k.label('خلية بيضية ثانوية', 'خلية كبيرة تحتفظ بمعظم السايتوبلازم (ن).', [0.4, 0.2, 0.27], c2);
            k.label('انقسام اختزالي 2', 'يكتمل بعد دخول النطفة للخلية البيضية الثانوية.', [0.5, -0.15, 0], ar.children.slice(3));
            k.label('جسم قطبي ثاني', 'الأجسام القطبية تتحلل ولا تكوّن بيوض.', [0.05, -0.55, 0.13], pb2);
            k.label('أرومة البيضة', 'بيضة واحدة فقط من كل خلية أولية (ن).', [0.6, -0.65, 0.32], ootid);
            return { view: [0.1, 0.1, 1.6] };
        }
    },
    // ---------- Bacterial binary fission ----------
    {
        id: 'fission', title: 'الانشطار الثنائي في البكتريا', icon: 'split',
        build(k) {
            const T = k.THREE, D = T.DoubleSide;
            const mk = (r, len) => { const g = new T.CapsuleGeometry(r, len, 18, 48); g.rotateZ(Math.PI / 2); return g; };
            const wg = mk(0.42, 1.2), mg = mk(0.37, 1.2), cg = mk(0.35, 1.2);
            const wall = k.mesh(wg, k.mat(0xE3A93A, { clip: [k.cut(0, 0, 1, 0.12)], side: D, bump: 0.6 }));
            const memb = k.mesh(mg, k.mat(0xE8EAF3, { clip: [k.cut(0, 0, 1, 0.06)], side: D, bump: 0.3 }));
            const cyto = k.mesh(cg, k.mat(0x8E86D6, { glass: true, thick: 0.5, atten: 0.4, bump: 0.4, clip: [k.cut(0, 0, 1, 0.0)], side: D }));
            const def = deformer([wg, mg, cg]);
            const R = k.rnd(4), loop = (seed) => { const r = k.rnd(seed), pts = []; for (let i = 0; i < 30; i++) { const a = (i / 30) * 6.283; pts.push([Math.cos(a) * 0.25 + (r() - 0.5) * 0.12, Math.sin(a * 2) * 0.12 + (r() - 0.5) * 0.08, Math.sin(a) * 0.12 + (r() - 0.5) * 0.08]); } return pts; };
            const chM = k.mat(0x6B2A86, { coat: 0.8, bump: 0 });
            const chA = k.mesh(k.tube(loop(3), 0.014, 200, true, 6), chM), chB = k.mesh(k.tube(loop(3), 0.014, 200, true, 6), chM);
            const S = [{ st: 1, pin: 0, sep: 0, cx: 0, dup: 0 }, { st: 1.2, pin: 0, sep: 0, cx: 0.32, dup: 1 }, { st: 1.3, pin: 0.35, sep: 0, cx: 0.42, dup: 1 }, { st: 1.3, pin: 0.85, sep: 0, cx: 0.45, dup: 1 }, { st: 1.05, pin: 0, sep: 0.35, cx: 0.72, dup: 1 }];
            const setStep = stepper(k, S, (c) => { def(c.st, c.pin, c.sep); chA.position.x = -c.cx; chB.position.x = c.cx; chB.visible = c.dup > 0.5; });
            k.label('كروموسوم', 'DNA حلقي يتضاعف أولاً ثم ينفصل كل نسخة لجهة.', [0.15, 0.1, 0.1], [chA, chB]);
            k.label('جدار الخلية', 'يحيط بالغشاء ويتكون جدار جديد بالوسط عند الانقسام.', [0, 0.4, 0.1], wall);
            k.label('الغشاء البلازمي', 'ينخصر من الوسط ليقسم الخلية.', [-0.5, -0.36, 0.06], memb);
            k.label('سايتوبلازم', 'ينقسم بين الخليتين.', [0.5, -0.2, 0], cyto);
            const steps = [['1. الخلية الأم', 'بكتريا بكروموسوم حلقي واحد.'], ['2. تضاعف الكروموسوم', 'يتضاعف الـ DNA وتطول الخلية.'], ['3. بداية الانخصار', 'يبدأ الغشاء والجدار بالانخصار من الوسط.'], ['4. تكوّن الجدار الفاصل', 'يتقدم الانخصار حتى يكاد يفصل الخلية.'], ['5. خليتان متشابهتان', 'تنتج خليتان بنويتان متطابقتان وراثياً (تكاثر لاجنسي).']];
            return { view: [0.1, 0.5, 1.5], steps, setStep };
        }
    },
    // ---------- Bacterial conjugation ----------
    {
        id: 'conj', title: 'الاقتران في البكتريا', icon: 'link',
        build(k) {
            const T = k.THREE;
            const cap = () => { const g = new T.CapsuleGeometry(0.28, 0.75, 16, 40); return g; };
            const cM = k.mat(0x3E3A8C, { glass: true, thick: 0.5, atten: 0.35, bump: 0.5 });
            const donor = k.mesh(cap(), cM); donor.position.x = -0.5;
            const recip = k.mesh(cap(), cM); recip.position.x = 0.5;
            const chM = k.mat(0xB9B2F0, { coat: 0.5, bump: 0 });
            const chr = (x, s) => { const r = k.rnd(s), p = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * 6.283; p.push([x + Math.cos(a) * 0.12 + (r() - 0.5) * 0.06, 0.35 + Math.sin(a) * 0.14 + (r() - 0.5) * 0.06, (r() - 0.5) * 0.1]); } return k.mesh(k.tube(p, 0.012, 150, true, 6), chM); };
            const chrs = [chr(-0.5, 3), chr(0.5, 5)];
            const fM = k.mat(0xE0603C, { coat: 0.8, bump: 0 });
            const fD = k.mesh(new T.TorusGeometry(0.1, 0.022, 12, 40), fM); fD.position.set(-0.5, -0.15, 0.05);
            const fR = k.mesh(new T.TorusGeometry(0.1, 0.022, 12, 40), fM); fR.position.set(0.5, -0.15, 0.05);
            const bridge = k.mesh(new T.CylinderGeometry(0.05, 0.05, 0.6, 16), k.mat(0x2E2A6E, { coat: 0.4, bump: 0.3 })); bridge.rotation.z = Math.PI / 2; bridge.position.set(0, -0.15, 0);
            const strandGeo = k.tube([[-0.4, -0.15, 0.05], [-0.1, -0.15, 0.05], [0.2, -0.15, 0.05], [0.42, -0.15, 0.05]], 0.016, 60, false, 6);
            const strand = k.mesh(strandGeo, fM);
            const total = strandGeo.index.count;
            const S = [{ br: 0.45, s: 0, r: 0 }, { br: 1, s: 0.45, r: 0 }, { br: 1, s: 1, r: 0 }, { br: 0.2, s: 0, r: 1 }];
            const setStep = stepper(k, S, (c) => {
                bridge.scale.y = Math.max(0.01, c.br); bridge.position.x = -0.3 * (1 - c.br);
                strand.visible = c.s > 0.03; strandGeo.setDrawRange(0, Math.floor(total * Math.min(1, c.s) / 3) * 3);
                fR.visible = c.r > 0.3; fR.scale.setScalar(Math.max(0.01, c.r));
            });
            k.label('خلية معطية', 'تحمل عامل الخصوبة (F)، وتسمى الخلية الذكرية.', [-0.5, 0.55, 0.2], donor);
            k.label('خلية مستلمة', 'ما تحمل عامل الخصوبة، تستلم نسخة منه.', [0.5, 0.55, 0.2], recip);
            k.label('جسر الاقتران', 'أنبوب (هلب جنسي) يربط الخليتين وتعبر منه المادة الوراثية.', [0, -0.12, 0.05], bridge);
            k.label('عامل الخصوبة', 'حلقة صغيرة من الـ DNA (بلازميد) تنتقل نسخة منها للخلية المستلمة.', [-0.5, -0.15, 0.08], [fD, fR, strand]);
            k.label('كروموسوم البكتريا', 'المادة الوراثية الرئيسية للخلية.', [0.5, 0.4, 0.05], chrs);
            const steps = [['1. تكوّن جسر الاقتران', 'تتصل الخلية المعطية بالمستلمة بواسطة جسر.'], ['2. انتقال شريط الـ DNA', 'ينفتح عامل الخصوبة ويعبر شريط منه عبر الجسر.'], ['3. اكتمال الانتقال', 'يعبر الشريط كاملاً ويُبنى الشريط المكمل له.'], ['4. خليتان معطيتان', 'تنفصل الخليتان وكل منهما تحمل عامل الخصوبة.']];
            return { view: [0.1, 0.35, 1.5], steps, setStep };
        }
    },
    // ---------- Virus replication ----------
    {
        id: 'virus', title: 'التكاثر في الفايروسات', icon: 'bug',
        build(k) {
            const T = k.THREE, R = k.rnd(8), D = T.DoubleSide;
            const bg = new T.CapsuleGeometry(0.5, 1.2, 16, 48); bg.rotateZ(Math.PI / 2);
            const bac = k.mesh(bg, k.mat(0x5B5AA8, { glass: true, thick: 0.5, atten: 0.4, bump: 0.5 }));
            const wall = k.mesh(new T.CapsuleGeometry(0.54, 1.2, 16, 48).rotateZ(Math.PI / 2), k.mat(0xC9B79A, { clip: [k.cut(0, 0, 1, 0.1)], side: D, bump: 0.8 }));
            const dnaPts = []; for (let i = 0; i < 26; i++) { const a = (i / 26) * 6.283; dnaPts.push([-0.2 + Math.cos(a) * 0.25, Math.sin(a) * 0.17, 0.05 * Math.sin(a * 3)]); }
            const bdna = k.mesh(k.tube(dnaPts, 0.018, 160, true, 6), k.mat(0x221A50, { bump: 0 }));
            const phage = (p, s, rot) => {
                const g = new T.Group(); k.group().add(g); g.position.set(...p); g.scale.setScalar(s); if (rot) g.rotation.z = rot;
                k.mesh(new T.IcosahedronGeometry(0.1, 0), k.mat(0xC33C8E, { coat: 0.7, flat: true, bump: 0 }), g).position.y = 0.2;
                k.mesh(new T.CylinderGeometry(0.025, 0.025, 0.2, 10), k.mat(0x4A5A3A, { bump: 0 }), g).position.y = 0.02;
                for (let i = 0; i < 4; i++) { const leg = k.mesh(new T.CylinderGeometry(0.008, 0.008, 0.12, 5), k.mat(0x4A5A3A, { bump: 0 }), g); const a = i * Math.PI / 2; leg.position.set(Math.cos(a) * 0.04, -0.12, Math.sin(a) * 0.04); leg.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); }
                return g;
            };
            const attach = phage([0.35, 0.72, 0.1], 1, 0);
            const vdnaM = k.mat(0xE0357A, { coat: 0.8, bump: 0 });
            const vdnaIn = k.mesh(k.tube([[0.35, 0.5, 0.1], [0.3, 0.25, 0.1], [0.4, 0.05, 0.08], [0.3, -0.1, 0.1]], 0.02, 40, false, 6), vdnaM);
            const parts = new T.Group(); k.group().add(parts);
            for (let i = 0; i < 6; i++) { const h = k.mesh(new T.IcosahedronGeometry(0.06, 0), k.mat(0x8A8A8A, { flat: true, bump: 0 }), parts); h.position.set(-0.6 + R() * 1.2, (R() - 0.5) * 0.5, 0.08); const t = k.mesh(new T.CylinderGeometry(0.015, 0.015, 0.14, 8), k.mat(0x4A5A3A, { bump: 0 }), parts); t.position.set(-0.6 + R() * 1.2, (R() - 0.5) * 0.5, 0.08); t.rotation.z = R() * 3; }
            for (let i = 0; i < 4; i++) { const sq = []; const x0 = -0.5 + R(), y0 = (R() - 0.5) * 0.5; for (let j = 0; j < 6; j++) sq.push([x0 + j * 0.04, y0 + Math.sin(j * 2) * 0.04, 0.08]); k.mesh(k.tube(sq, 0.012, 20, false, 6), vdnaM, parts); }
            const inside = new T.Group(); k.group().add(inside);
            for (let i = 0; i < 6; i++) { const p = phage([-0.55 + i * 0.22, (i % 2 ? 0.12 : -0.15), 0.08], 0.55, R() * 2); inside.add(p); }
            const out = new T.Group(); k.group().add(out);
            for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283; out.add(phage([Math.cos(a) * 1.2, Math.sin(a) * 0.75, 0], 0.7, a - Math.PI / 2)); }
            const integ = k.mesh(k.tube(dnaPts.slice(0, 7), 0.026, 30, false, 6), vdnaM);
            const S = [0, 1, 2, 3, 4, 5].map((i) => ({ s: i }));
            const setStep = (i) => {
                attach.visible = i <= 1; attach.position.y = i === 0 ? 0.72 : 0.66;
                vdnaIn.visible = i === 1; parts.visible = i === 2; inside.visible = i === 3; out.visible = i === 4;
                bac.visible = wall.visible = true; bac.scale.setScalar(i === 4 ? 0.9 : 1); wall.material.opacity = 1;
                wall.visible = i !== 4; bdna.visible = i !== 4 && i !== 3; integ.visible = i === 5;
            };
            k.label('غطاء بروتيني', 'الغلاف الخارجي للفايروس (الرأس والذيل).', [0.35, 0.92, 0.12], attach, [0]);
            k.label('حامض نووي', 'المادة الوراثية للفايروس داخل الغطاء البروتيني.', [0.35, 0.92, 0.1], attach, [0]);
            k.label('جدار الخلية البكتيرية', 'يلتصق الفايروس بمستقبلات على سطحه.', [-0.2, 0.52, 0.12], wall, [0, 1, 2, 3, 5]);
            k.label('DNA البكتريا', 'المادة الوراثية للخلية المضيفة.', [-0.2, 0.17, 0.05], bdna, [0, 1, 2, 5]);
            k.label('DNA الفايروس', 'يحقن الفايروس مادته الوراثية داخل البكتريا ويبقى الغطاء خارجها.', [0.35, 0.2, 0.1], vdnaIn, [1]);
            k.label('بناء أجزاء الفايروس', 'تستخدم البكتريا لبناء رؤوس وذيول وأحماض نووية جديدة للفايروس.', [0, 0.1, 0.1], parts, [2]);
            k.label('فايروسات جديدة', 'تتجمع الأجزاء مكونة فايروسات كاملة.', [0.1, 0.12, 0.1], inside, [3]);
            k.label('تحرر الفايروسات', 'تنفجر البكتريا وتتحرر الفايروسات لتصيب خلايا أخرى (دورة التحلل).', [1.2, 0, 0], out, [4]);
            k.label('بلعم أولي', 'يندمج DNA الفايروس مع DNA البكتريا وينتقل معه عند انقسامها (دورة الاندماج).', [0.0, 0.17, 0.05], integ, [5]);
            const steps = [['1. مرحلة الاتصال', 'يلتصق الفايروس بجدار الخلية البكتيرية.'], ['2. مرحلة الاختراق', 'يحقن الفايروس الـ DNA الخاص به داخل البكتريا.'], ['3. مرحلة التخليق (البناء الحيوي)', 'يسيطر الفايروس على الخلية وتُبنى أجزاء فايروسات جديدة.'], ['4. مرحلة الإنضاج', 'تتجمع الأجزاء مكونة فايروسات كاملة.'], ['5. مرحلة التحرر', 'تتحلل البكتريا وتخرج الفايروسات الجديدة (دورة التحلل).'], ['مرحلة التكامل', 'بدورة التحلل والاندماج يندمج DNA الفايروس مع DNA البكتريا ويتضاعف معه.']];
            return { view: [0.1, 0.3, 1.5], steps, setStep };
        }
    },
    // ---------- Paramecium ----------
    {
        id: 'paramecium', title: 'التكاثر اللاجنسي في البراميسيوم', icon: 'footprints',
        build(k) {
            const T = k.THREE, R = k.rnd(12);
            const g = new T.SphereGeometry(1, 72, 40);
            const p = g.attributes.position;
            for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); x *= 0.95; y *= 0.36 * (1 - 0.25 * Math.max(0, x)) ; z *= 0.3; if (y > 0 && Math.abs(x) < 0.4) y *= 1 - 0.25 * Math.cos(x * 4); p.setXYZ(i, x, y, z); }
            g.computeVertexNormals();
            const body = k.mesh(g, k.mat(0xB08A5A, { glass: true, thick: 0.4, atten: 0.5, bump: 0.8, rep: 3 }));
            const cil = [];
            for (let i = 0; i < 220; i++) { const u = R() * 6.283, v = R() * 3.14; cil.push([Math.cos(u) * Math.sin(v), Math.cos(v), Math.sin(u) * Math.sin(v)]); }
            const cilGeo = new T.CylinderGeometry(0.004, 0.004, 0.06, 4);
            const cm = new T.InstancedMesh(cilGeo, k.mat(0x6B4A22, { bump: 0 }), cil.length);
            k.group().add(cm);
            const mac = k.mesh(k.blob(1, 0.2, 2, 32, 3), k.mat(0x6A4A2A, { coat: 0.5, bump: 0.6 })); mac.scale.set(0.18, 0.08, 0.08);
            const micA = k.mesh(new T.SphereGeometry(0.04, 16, 12), k.mat(0x3A2410, { coat: 0.6, bump: 0 })), micB = micA.clone(); k.group().add(micB);
            const oral = k.mesh(new T.TorusGeometry(0.06, 0.018, 8, 20), k.mat(0x5A3A1A, { bump: 0 })); oral.position.set(0, 0.24, 0.05); oral.rotation.x = Math.PI / 2;
            const oral2 = oral.clone(); k.group().add(oral2);
            const vac = k.mesh(new T.SphereGeometry(0.035, 12, 10), k.mat(0xE8E0CC, { bump: 0 })); const vac2 = vac.clone(); k.group().add(vac2);
            const def = deformer([g]);
            const o = new T.Object3D(), bp = new T.Vector3();
            const S = [{ pin: 0, sep: 0, st: 1, m: 0, mc: 0 }, { pin: 0, sep: 0, st: 1.05, m: 0.1, mc: 1 }, { pin: 0.5, sep: 0, st: 1.15, m: 0.5, mc: 1 }, { pin: 0, sep: 0.2, st: 0.62, m: 1, mc: 1 }, { pin: 0, sep: 0.35, st: 0.95, m: 1, mc: 1 }];
            const setStep = stepper(k, S, (c) => {
                def(c.st, c.pin, c.sep);
                const pa = g.attributes.position;
                cil.forEach((d, i) => { const idx = (i * 37) % pa.count; bp.fromBufferAttribute(pa, idx); o.position.copy(bp).multiplyScalar(1.03); o.lookAt(bp.clone().multiplyScalar(2)); o.rotateX(Math.PI / 2); o.updateMatrix(); cm.setMatrixAt(i, o.matrix); });
                cm.instanceMatrix.needsUpdate = true;
                const sx = c.m * (0.35 + c.sep * 0.9) * c.st;
                mac.position.set(-sx * 0.6, -0.03, 0.05); mac.scale.set(0.18 * (1 + (1 - c.m) * 0.4 * (c.pin > 0.2 ? 1 : 0)), 0.08, 0.08);
                micA.position.set(-0.1 - c.mc * sx * 0.5, 0.05, 0.1); micB.position.set(0.1 + c.mc * sx * 0.5, 0.05, 0.1); micB.visible = c.mc > 0.5;
                oral.position.x = -sx * 0.5; oral2.position.x = sx * 0.5; oral2.visible = c.m > 0.3;
                vac.position.set(-0.7 * c.st - c.sep, 0.05, 0.05); vac2.position.set(0.7 * c.st + c.sep, 0.05, 0.05);
            });
            const macB = mac.clone(); k.group().add(macB);
            k.onFrame(() => { macB.position.set(-mac.position.x, mac.position.y, mac.position.z); macB.scale.copy(mac.scale); macB.visible = mac.position.x < -0.05; });
            k.label('نواة صغيرة', 'تنقسم انقساماً خيطياً أولاً.', micA.position, [micA, micB]);
            k.label('نواة كبيرة', 'تستطيل ثم تنقسم إلى نصفين.', mac.position, [mac, macB]);
            k.label('برعم الفم الخلوي', 'يتكون فم خلوي جديد لكل خلية بنوية.', oral.position, [oral, oral2]);
            k.label('أهداب', 'تغطي الجسم وتحركه.', [0.5, 0.3, 0.1], cm);
            const steps = [['1. الخلية الأم', 'براميسيوم بنواة كبيرة ونواة صغيرة.'], ['2. انقسام النواة الصغيرة', 'تنقسم النواة الصغيرة ويتكون برعم فم خلوي جديد.'], ['3. استطالة النواة الكبيرة', 'تستطيل النواة الكبيرة ويبدأ الجسم بالانخصار عرضياً.'], ['4. الانفصال', 'تنقسم الخلية عرضياً إلى خليتين.'], ['5. خليتان بنويتان', 'كل خلية تكمل أجزاءها (انشطار ثنائي عرضي).']];
            return { view: [0.1, 0.7, 1.3], steps, setStep };
        }
    },
    // ---------- Euglena ----------
    {
        id: 'euglena', title: 'الانشطار الطولي في اليوغلينا', icon: 'leaf',
        build(k) {
            const T = k.THREE, R = k.rnd(14);
            const half = (side) => {
                const g = new T.Group(); k.group().add(g);
                const bg = new T.SphereGeometry(1, 48, 32), p = bg.attributes.position;
                for (let i = 0; i < p.count; i++) { const y = p.getY(i), f = 0.3 * (1 - 0.55 * Math.max(0, -y)) * (1 - 0.3 * Math.max(0, y)); p.setXYZ(i, p.getX(i) * f, y * 0.7, p.getZ(i) * f * 0.8); }
                bg.computeVertexNormals(); bg.translate(0, 0.7, 0);
                const body = k.mesh(bg, k.mat(0x6FA84A, { glass: true, thick: 0.35, atten: 0.4, bump: 0.8, rep: 3, tex: 'fiber' }), g);
                const pl = []; for (let i = 0; i < 8; i++) pl.push([(R() - 0.5) * 0.3, 0.3 + R() * 0.8, (R() - 0.5) * 0.15]);
                const chl = k.many(new T.SphereGeometry(0.045, 12, 10), k.mat(0x2E6A2A, { bump: 0 }), pl, g);
                const nuc = k.mesh(new T.SphereGeometry(0.1, 20, 16), k.mat(0x8A74C8, { coat: 0.5, bump: 0.2 }), g); nuc.position.set(0, 0.7, 0.05);
                const fl = []; for (let i = 0; i <= 20; i++) fl.push([Math.sin(i * 0.5) * 0.1 * side, 1.4 + i * 0.04, 0]);
                const flg = k.mesh(k.tube(fl, 0.008, 40, false, 5), k.mat(0x2A2A2A, { bump: 0 }), g);
                const eye = k.mesh(new T.SphereGeometry(0.035, 12, 10), k.mat(0xD4382A, { coat: 0.8, bump: 0 }), g); eye.position.set(0.06 * side, 1.25, 0.07);
                return { g, body, chl, nuc, flg };
            };
            const A = half(-1), B = half(1);
            const S = [{ a: 0, d: 0, n: 0 }, { a: 0.12, d: 0.02, n: 1 }, { a: 0.32, d: 0.08, n: 1 }, { a: 0.7, d: 0.35, n: 1 }];
            const setStep = stepper(k, S, (c) => {
                A.g.rotation.z = c.a; B.g.rotation.z = -c.a; A.g.position.x = -c.d; B.g.position.x = c.d;
                B.flg.visible = c.n > 0.5; B.nuc.visible = c.n > 0.5;
            });
            k.label('سوط', 'يحرك اليوغلينا، ويتضاعف قبل الانقسام.', [0, 2.2, 0], [A.flg, B.flg]);
            k.label('نواة', 'تنقسم انقساماً خيطياً.', [0, 0.7, 0.12], [A.nuc, B.nuc]);
            k.label('سايتوبلازم', 'فيه البلاستيدات الخضراء.', [0.18, 0.4, 0.05], [A.body, B.body, A.chl, B.chl]);
            const steps = [['اليوغلينا', 'خلية بسوط ونواة وبلاستيدات خضراء.'], ['1. تضاعف السوط والنواة', 'تنقسم النواة ويتكون سوط ثاني.'], ['2. بداية الانشطار', 'يبدأ الانشطار من الطرف الأمامي على طول الخلية.'], ['3. خليتان', 'يكتمل الانشطار الطولي وتنتج خليتان.']];
            return { view: [0.1, 0.1, 1.6], steps, setStep };
        }
    },
    // ---------- Alternation of generations ----------
    {
        id: 'altgen', title: 'ظاهرة تعاقب الأجيال', icon: 'refresh-cw',
        build(k) {
            const T = k.THREE, R = k.rnd(18), g = k.group();
            const P = (a, r) => [Math.cos(a) * r, Math.sin(a) * r, 0];
            const clump = (p, n, col, rr) => { const c = new T.Group(); g.add(c); c.position.set(...p); const m = k.mat(col, { coat: 0.7, bump: 0.3 }); for (let i = 0; i < n; i++) { const s = k.mesh(new T.SphereGeometry(rr * (0.6 + R() * 0.5), 20, 16), m, c); s.position.set((R() - 0.5) * rr * 3, (R() - 0.5) * rr * 2.4, (R() - 0.5) * rr * 1.5); } return c; };
            const sporo = clump(P(Math.PI / 2, 1.3), 12, 0x5B4A9E, 0.14);
            const sac = clump(P(Math.PI / 6, 1.3), 3, 0x7B6ABE, 0.12);
            const spore = clump(P(-Math.PI / 6, 1.3), 1, 0xC89A5A, 0.11);
            const gameto = clump(P(-Math.PI / 2, 1.3), 12, 0xB0803A, 0.14);
            const gametes = clump(P(-5 * Math.PI / 6, 1.3), 2, 0xC89A5A, 0.13);
            const zyg = clump(P(5 * Math.PI / 6, 1.3), 1, 0x5B4A9E, 0.16);
            const ring = new T.Group(); g.add(ring);
            const segs = [[Math.PI / 2 - 0.3, Math.PI / 6 + 0.25, 0x333333], [Math.PI / 6 - 0.25, -Math.PI / 6 + 0.25, 0x333333], [-Math.PI / 6 - 0.25, -Math.PI / 2 + 0.3, 0xA04030], [-Math.PI / 2 - 0.3, -5 * Math.PI / 6 + 0.25, 0xA04030], [-5 * Math.PI / 6 - 0.25, -7 * Math.PI / 6 + 0.25, 0xA04030], [5 * Math.PI / 6 - 0.25, Math.PI / 2 + 0.3, 0x333333]];
            segs.forEach(([a0, a1, col]) => {
                const pts = []; for (let i = 0; i <= 12; i++) { const a = a0 + (a1 - a0) * i / 12; pts.push([Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0]); }
                k.mesh(k.tube(pts, 0.014, 30, false, 6), k.mat(col, { bump: 0 }), ring);
                const end = pts[pts.length - 1], pre = pts[pts.length - 2];
                arrow(k, pre, [end[0] + (end[0] - pre[0]) * 0.3, end[1] + (end[1] - pre[1]) * 0.3, 0], col, 0.012, ring);
            });
            const div = k.mesh(new T.BoxGeometry(1.4, 0.012, 0.012), k.mat(0x333333, { bump: 0 })); div.position.set(0, 0, 0);
            const box = (p, w, c) => { const b = k.mesh(new T.BoxGeometry(w, 0.22, 0.08), k.mat(c, { coat: 0.6, bump: 0 })); b.position.set(...p); return b; };
            const mei = box(P(0, 1.3), 0.42, 0x7A5AC8), fert = box(P(Math.PI, 1.3), 0.42, 0xD0703A);
            k.label('الطور البوغي (2س)', 'الجيل الذي خلاياه بالعدد الكامل للكروموسومات، ينتج الأبواغ.', [0, 1.45, 0.1], sporo);
            k.label('حافظة بوغية 2س', 'تنقسم خلاياها انقساماً اختزالياً لتكوين الأبواغ.', sac.position, sac);
            k.label('انقسام اختزالي', 'يختزل عدد الكروموسومات إلى النصف (س).', mei.position, mei);
            k.label('بوغ س', 'ينقسم خيطياً ويكوّن الطور المشيجي.', spore.position, spore);
            k.label('الطور المشيجي (س)', 'الجيل الذي خلاياه بنصف العدد، ينتج الأمشاج بالانقسام الخيطي.', [0, -1.45, 0.1], gameto);
            k.label('أمشاج س', 'خلايا جنسية بنصف العدد.', gametes.position, gametes);
            k.label('إخصاب', 'اتحاد مشيجين يرجع العدد الكامل (2س).', fert.position, fert);
            k.label('زيجة 2س', 'تنقسم خيطياً وتكوّن الطور البوغي من جديد.', zyg.position, zyg);
            k.label('الحد الفاصل', 'فوق الخط العدد الكامل (2س) وتحته نصف العدد (س).', [0.6, 0, 0], [div, ring]);
            return { view: [0, 0, 1] };
        }
    },
    // ---------- Flower ----------
    {
        id: 'flower', title: 'تركيب الزهرة', icon: 'flower-2',
        build(k) {
            const T = k.THREE, D = T.DoubleSide;
            const stem = k.mesh(k.tube([[0, -0.75, 0], [0.04, -0.45, 0.02], [0, -0.2, 0]], 0.05, 30, false, 12), k.mat(0x4E8A36, { bump: 0.6, tex: 'fiber' }));
            const rec = k.mesh(new T.SphereGeometry(0.14, 24, 16), k.mat(0x5E9A42, { bump: 0.5 })); rec.position.y = -0.15; rec.scale.set(1, 0.7, 1);
            const leafGeo = (w, l, cup) => { const g = new T.SphereGeometry(1, 32, 16); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const u = (y + 1) / 2; p.setXYZ(i, x * w * Math.sin(Math.PI * Math.min(1, u * 1.1)), u * l, z * 0.02 + cup * u * u); } g.computeVertexNormals(); return g; };
            const sep = new T.Group(); k.group().add(sep);
            const sm = k.mat(0x3F7A2C, { side: D, bump: 0.8, tex: 'fiber' });
            for (let i = 0; i < 5; i++) { const s = k.mesh(leafGeo(0.14, 0.45, -0.1), sm, sep); s.position.y = -0.15; s.rotation.set(0, (i / 5) * 6.283 + 0.3, 0); s.rotateX(1.7); }
            const pet = new T.Group(); k.group().add(pet);
            const pm = k.mat(0xF08DB8, { side: D, bump: 0.7, tex: 'fiber', sheen: 0.8 });
            for (let i = 0; i < 5; i++) { const s = k.mesh(leafGeo(0.3, 0.85, 0.25), pm, pet); s.position.y = -0.08; s.rotation.set(0, (i / 5) * 6.283, 0); s.rotateX(1.05); }
            const sta = new T.Group(); k.group().add(sta);
            const fm = k.mat(0xE77FA8, { bump: 0 }), am = k.mat(0xE8C24A, { coat: 0.4, bump: 0.8 });
            const fils = [], anth = [];
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * 6.283 + 0.25, top = [Math.cos(a) * 0.28, 0.55, Math.sin(a) * 0.28];
                fils.push(k.mesh(k.tube([[Math.cos(a) * 0.07, -0.05, Math.sin(a) * 0.07], [Math.cos(a) * 0.2, 0.25, Math.sin(a) * 0.2], top], 0.008, 20, false, 5), fm, sta));
                const an = k.mesh(new T.CapsuleGeometry(0.025, 0.07, 6, 10), am, sta); an.position.set(top[0], top[1] + 0.04, top[2]); an.rotation.z = 0.3; anth.push(an);
            }
            const pis = new T.Group(); k.group().add(pis);
            const ovM = k.mat(0x6E8E3A, { side: D, bump: 0.6, clip: [k.cut(0, 0, 1, 0)] });
            const ovary = k.mesh(new T.SphereGeometry(0.14, 32, 24), ovM, pis); ovary.position.y = 0.02; ovary.scale.set(1, 1.2, 1);
            const inner = k.mesh(new T.SphereGeometry(0.1, 24, 18), k.mat(0x2A3A1A, { side: D, bump: 0, clip: [k.cut(0, 0, 1, 0)] }), pis); inner.position.y = 0.02;
            const ovule = k.mesh(new T.SphereGeometry(0.045, 20, 14), k.mat(0xF4E27A, { coat: 0.6, bump: 0.2 }), pis); ovule.position.set(0, 0.02, -0.02);
            const style = k.mesh(new T.CylinderGeometry(0.022, 0.03, 0.5, 14), k.mat(0x7A9A4A, { bump: 0.3 }), pis); style.position.y = 0.4;
            const stig = k.mesh(k.blob(0.05, 0.4, 6, 20, 3), k.mat(0x9AB85A, { bump: 1 }), pis); stig.position.y = 0.67;
            const pt = k.mesh(k.tube([[0.01, 0.66, 0.02], [0.02, 0.4, 0.03], [0.01, 0.1, 0.02], [0, 0.04, 0]], 0.006, 40, false, 5), k.mat(0xF2F2F2, { bump: 0, glow: 0xffffff }));
            k.label('المتك', 'ينتج حبوب اللقاح.', anth[0].position, anth);
            k.label('الخويط', 'يحمل المتك.', [Math.cos(0.25) * 0.2, 0.25, Math.sin(0.25) * 0.2], fils);
            k.label('الأسدية', 'عضو التذكير بالزهرة: متك وخويط.', [Math.cos(2.35) * 0.28, 0.55, Math.sin(2.35) * 0.28], sta);
            k.label('الميسم', 'يلتقط حبوب اللقاح.', stig.position, stig);
            k.label('القلم', 'ينمو خلاله أنبوب اللقاح.', style.position, style);
            k.label('المبيض', 'الجزء المنتفخ بقاعدة المدقة، يصير ثمرة.', [0.14, 0.02, 0], ovary);
            k.label('البويضة', 'داخل المبيض، تصير بذرة بعد الإخصاب.', ovule.position, ovule);
            k.label('المدقة', 'عضو التأنيث: ميسم وقلم ومبيض.', [0, 0.3, 0.03], pis);
            k.label('أنبوب اللقاح', 'ينمو من حبة اللقاح عبر القلم حتى البويضة.', [0.02, 0.4, 0.03], pt);
            k.label('التويج', 'مجموعة البتلات الملونة تجذب الحشرات.', [0.6, 0.35, 0.3], pet);
            k.label('الكأس', 'الأوراق الخضراء تحت التويج تحمي البرعم.', [0.3, -0.3, 0.2], sep);
            return { view: [0.3, 0.5, 1.2] };
        }
    },
    // ---------- Seeds ----------
    {
        id: 'seeds', title: 'تركيب البذرة', icon: 'bean',
        build(k) {
            const T = k.THREE, D = T.DoubleSide, clip = [k.cut(0, 0, 1, 0)];
            // monocot (corn grain)
            const mono = new T.Group(); k.group().add(mono);
            const cg = k.blob(1, 0.1, 1.5, 48, 2); const cp = cg.attributes.position; for (let i = 0; i < cp.count; i++) { const y = cp.getY(i); cp.setX(i, cp.getX(i) * (0.55 - 0.18 * y)); cp.setZ(i, cp.getZ(i) * 0.35); cp.setY(i, y * 0.75); } cg.computeVertexNormals();
            const coat = k.mesh(cg, k.mat(0xC9A650, { side: D, clip, bump: 0.5 }), mono);
            const endo = k.mesh(cg.clone().scale(0.93, 0.95, 0.9), k.mat(0xF1E6C8, { side: D, clip, bump: 0.8, rep: 3 }), mono);
            const emb = k.mesh(new T.SphereGeometry(1, 32, 20), k.mat(0x9AC45A, { side: D, clip, bump: 0.4 }), mono); emb.scale.set(0.16, 0.42, 0.2); emb.position.set(0.2, -0.15, 0); emb.rotation.z = 0.35;
            const lf = k.mesh(k.tube([[0.14, -0.35, 0.01], [0.22, -0.1, 0.01], [0.27, 0.15, 0.01]], 0.02, 20, false, 6), k.mat(0x3E7A2A, { bump: 0 }), mono);
            const rad = k.mesh(k.tube([[0.12, -0.45, 0.01], [0.16, -0.52, 0.01]], 0.03, 10, false, 6), k.mat(0x5A4A2A, { bump: 0 }), mono);
            // dicot (bean): two cotyledons opened
            const di = new T.Group(); k.group().add(di);
            const bg = new T.SphereGeometry(1, 48, 32), bp = bg.attributes.position;
            for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), y = bp.getY(i); bp.setXYZ(i, x * 0.4 - 0.1 * (1 - y * y) * (x > 0 ? 1 : 0.3), y * 0.6, bp.getZ(i) * 0.22); }
            bg.computeVertexNormals();
            const scoat = k.mesh(bg, k.mat(0x7A3A2A, { side: D, clip, bump: 0.5 }), di);
            const cot = k.mesh(bg.clone().scale(0.92, 0.94, 0.9), k.mat(0xE6D2A2, { side: D, clip, bump: 0.8, rep: 3 }), di);
            const plum = k.mesh(new T.SphereGeometry(1, 20, 12), k.mat(0x6FB24A, { side: D, bump: 0.3 }), di); plum.scale.set(0.07, 0.12, 0.02); plum.position.set(-0.08, 0.2, 0.01); plum.rotation.z = 0.8;
            const hyp = k.mesh(k.tube([[0.05, 0.28, 0.01], [0.12, 0.12, 0.01], [0.17, -0.05, 0.01]], 0.025, 20, false, 8), k.mat(0xE8E0C0, { bump: 0 }), di);
            const S = [{ m: 1 }, { m: 0 }];
            const setStep = (i) => { mono.visible = i === 0; di.visible = i === 1; };
            k.label('طبقة محيطة', 'غلاف الحبة (جدار الثمرة والبذرة ملتحمين).', [-0.4, 0.3, 0], coat, [0]);
            k.label('سويداء', 'نسيج يخزن الغذاء بذوات الفلقة الواحدة.', [-0.1, 0.25, 0], endo, [0]);
            k.label('ورقة جنينية', 'فلقة واحدة (القصعة) تنقل الغذاء من السويداء للجنين.', [0.22, -0.1, 0.02], [emb, lf], [0]);
            k.label('جذير', 'ينمو ويصير الجذر.', [0.14, -0.5, 0.02], rad, [0]);
            k.label('غطاء البذرة', 'يحمي البذرة.', [-0.35, 0.35, 0], scoat, [1]);
            k.label('رويشة', 'تصير المجموع الخضري (الساق والأوراق).', plum.position, plum, [1]);
            k.label('جذير', 'يصير الجذر.', [0.17, -0.05, 0.02], hyp, [1]);
            k.label('ورقة جنينية', 'فلقتان كبيرتان تخزنان الغذاء بذوات الفلقتين.', [-0.05, -0.25, 0], cot, [1]);
            return { view: [0, 0.1, 1.6], steps: [['نبات ذو فلقة واحدة', 'مثل الذرة والحنطة: فلقة واحدة وغذاء مخزون بالسويداء.'], ['نبات ذو فلقتين', 'مثل الفاصوليا: فلقتان كبيرتان تخزنان الغذاء.']], setStep };
        }
    },
    // ---------- Fruit ----------
    {
        id: 'fruit', title: 'تركيب الثمرة', icon: 'apple',
        build(k) {
            const T = k.THREE, D = T.DoubleSide, clip = [k.cut(0, 0, 1, 0)];
            const prof = (s) => { const p = []; for (let i = 0; i <= 30; i++) { const t = i / 30, y = -1 + 2 * t; p.push(new T.Vector2(Math.max(0.001, s * 0.6 * Math.pow(Math.sin(Math.PI * t), 0.8) * (1 - 0.15 * y)), y * s)); } return p; };
            const exo = k.mesh(new T.LatheGeometry(prof(1), 64), k.mat(0xE6CFA0, { side: D, clip, bump: 0.6 }));
            const meso = k.mesh(new T.LatheGeometry(prof(0.9), 64), k.mat(0xF6EAD0, { side: D, clip, bump: 1, rep: 3, tex: 'fiber' }));
            const endo = k.mesh(new T.LatheGeometry(prof(0.55), 64), k.mat(0xE8D6B0, { side: D, clip, bump: 0.8 }));
            const seed = k.mesh(new T.LatheGeometry(prof(0.44), 48), k.mat(0x3E9E3A, { coat: 0.6, bump: 0.3 }));
            const stalk = k.mesh(new T.CylinderGeometry(0.03, 0.04, 0.35, 12), k.mat(0x6B4A2A, { bump: 0.6 })); stalk.position.y = 1.12;
            [exo, meso, endo, seed].forEach((m) => { m.rotation.z = Math.PI / 2; }); stalk.rotation.z = Math.PI / 2; stalk.position.set(-1.12, 0, 0);
            k.label('الطبقة الخارجية', 'قشرة الثمرة من الخارج.', [0, 0.58, 0], exo);
            k.label('الطبقة الوسطى', 'غالباً لحمية وعصيرية.', [0.3, -0.45, 0], meso);
            k.label('الطبقة الداخلية', 'تحيط بالبذرة وقد تكون صلبة (مثل نواة المشمش).', [-0.2, 0.3, 0], endo);
            k.label('البذرة', 'تتكون من البويضة بعد الإخصاب، والثمرة من المبيض.', [0.1, 0.05, 0], seed);
            return { view: [0.1, 0.35, 1.5] };
        }
    },
    // ---------- Insect male ----------
    {
        id: 'insect-m', title: 'الجهاز التناسلي الذكري في الحشرات', icon: 'bug',
        build(k) {
            const T = k.THREE, m = k.mat(0xE8B08A, { coat: 0.5, bump: 0.7, rep: 3 }), dk = k.mat(0xC98A68, { coat: 0.5, bump: 0.7 });
            const testes = [], vd = [], sv = [], ag = [];
            [-1, 1].forEach((s) => {
                const t = new T.Group(); k.group().add(t); t.position.set(s * 0.95, 1.1, 0);
                const fan = k.mesh(new T.SphereGeometry(0.2, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.6), k.mat(0xE2A080, { coat: 0.5, bump: 1.2, tex: 'fiber', rep: 4, side: T.DoubleSide }), t); fan.rotation.z = Math.PI;
                for (let i = 0; i < 7; i++) { const r = k.mesh(new T.TorusGeometry(0.2, 0.01, 6, 24, Math.PI * 0.6), dk, t); r.rotation.set(Math.PI / 2, (i / 7) * Math.PI - Math.PI / 2, 0); r.position.y = -0.02; }
                testes.push(t);
                vd.push(organ(k, [[s * 0.95, 0.9, 0], [s * 0.8, 0.75, 0.05], [s * 0.95, 0.62, -0.05], [s * 0.82, 0.5, 0]], () => 0.025, m));
                sv.push(organ(k, [[s * 0.8, 0.5, 0], [s * 0.6, 0.15, 0], [s * 0.3, -0.25, 0], [s * 0.08, -0.45, 0]], (u) => 0.03 + 0.08 * Math.sin(Math.PI * Math.min(1, u * 1.3)), m));
                ag.push(organ(k, [[s * 0.1, -0.35, 0], [s * 0.2, 0.2, 0], [s * 0.3, 0.8, 0]], (u) => 0.05 + 0.02 * u, k.mat(0xE89A7A, { coat: 0.5, bump: 0.7 })));
            });
            const ej = organ(k, [[0, -0.45, 0], [0, -0.9, 0], [0, -1.2, 0]], () => 0.045, m);
            const pen = organ(k, [[0, -1.2, 0], [0, -1.45, 0]], (u) => 0.06 - 0.02 * u, dk);
            k.label('خصية', 'تنتج النطف، مكونة من فصوص تشبه المروحة.', testes[1].position, testes);
            k.label('وعاء ناقل', 'أنبوب ينقل النطف من الخصية.', [-0.9, 0.7, 0], vd);
            k.label('حويصلة منوية', 'توسع بالوعاء الناقل يخزن النطف.', [-0.55, 0.1, 0.05], sv);
            k.label('غدة مساعدة', 'تفرز سائلاً يغذي النطف ويحملها.', [0.25, 0.6, 0.05], ag);
            k.label('القناة القاذفة', 'تلتقي فيها القناتان وتنقل السائل المنوي للقضيب.', [0, -0.8, 0.05], ej);
            k.label('قضيب', 'عضو ينقل النطف لجسم الأنثى.', [0, -1.4, 0.06], pen);
            return { view: [0, 0, 1] };
        }
    },
    // ---------- Insect female ----------
    {
        id: 'insect-f', title: 'الجهاز التناسلي الأنثوي في الحشرات', icon: 'bug',
        build(k) {
            const T = k.THREE, m = k.mat(0xEEB896, { coat: 0.5, bump: 0.7, rep: 3 }), dk = k.mat(0xD08A6A, { coat: 0.5, bump: 0.8 });
            const ovs = [], lat = [];
            [-1, 1].forEach((s) => {
                const ov = new T.Group(); k.group().add(ov);
                for (let i = 0; i < 6; i++) {
                    const a = (i / 5 - 0.5) * 0.9, top = [s * 0.7 + Math.sin(a) * 0.35, 1.45, Math.cos(a) * 0.1];
                    const o = organ(k, [[s * 0.55, 0.45, 0], [s * 0.6 + Math.sin(a) * 0.25, 0.9, 0], top], (u) => 0.03 + 0.03 * Math.sin(Math.PI * u) , m, ov);
                    for (let j = 0; j < 4; j++) { const e = k.mesh(new T.SphereGeometry(0.045 - j * 0.006, 14, 10), dk, ov); const pt = o.userData.curve.getPointAt(0.25 + j * 0.17); e.position.copy(pt); }
                }
                ovs.push(ov);
                lat.push(organ(k, [[s * 0.55, 0.45, 0], [s * 0.35, 0.15, 0], [s * 0.1, -0.05, 0]], () => 0.04, m));
            });
            const common = organ(k, [[0, -0.05, 0], [0, -0.5, 0]], () => 0.06, m);
            const vag = k.mesh(new T.CylinderGeometry(0.15, 0.15, 0.2, 28), k.mat(0xF0C0A0, { coat: 0.5, bump: 0.7 })); vag.position.y = -0.62;
            const acc = organ(k, [[-0.1, -0.5, 0.02], [-0.45, -0.35, 0.05], [-0.8, -0.2, 0.02]], (u) => 0.04 + 0.04 * u, m);
            const sperm = organ(k, [[0.08, -0.5, 0.03], [0.35, -0.3, 0.1], [0.55, -0.15, 0.05]], (u) => 0.025 + 0.05 * Math.max(0, u - 0.6), dk);
            const sg = organ(k, [[0.08, -0.5, -0.03], [0.4, -0.45, -0.05], [0.8, -0.3, 0]], () => 0.03, m);
            k.label('مبيض', 'مكون من أنابيب بيضية تتكون فيها البيوض.', [0.7, 1.2, 0.1], ovs);
            k.label('قناة بيض جانبية', 'تنقل البيوض من كل مبيض.', [-0.35, 0.15, 0.04], lat);
            k.label('قناة البيض الرئيسية', 'تلتقي فيها القناتان الجانبيتان.', [0, -0.3, 0.06], common);
            k.label('مهبل', 'فتحة الجهاز التناسلي للخارج.', [0, -0.62, 0.15], vag);
            k.label('غدة مساعدة', 'تفرز مادة تلصق البيض أو تغلفه.', [-0.7, -0.22, 0.06], acc);
            k.label('مستودع منوي وغدته', 'يخزن النطف بعد التزاوج لحين إخصاب البيض.', [0.5, -0.17, 0.1], [sperm, sg]);
            return { view: [0, 0, 1] };
        }
    },
    // ---------- Human male ----------
    {
        id: 'human-m', title: 'الجهاز التكاثري الذكري للإنسان', icon: 'user',
        build(k) {
            const T = k.THREE, D = T.DoubleSide;
            const bl = k.mesh(new T.SphereGeometry(0.5, 40, 30), k.mat(0xE8A290, { coat: 0.5, bump: 0.7 })); bl.position.set(0, 1.0, -0.1); bl.scale.set(1.1, 0.75, 0.8);
            const vd = [], sv = [], cow = [], ep = [], tes = [];
            [-1, 1].forEach((s) => {
                vd.push(organ(k, [[s * 0.55, -1.0, 0.1], [s * 0.85, -0.3, 0.1], [s * 0.85, 0.9, 0], [s * 0.55, 1.45, -0.1], [s * 0.25, 1.1, -0.35], [s * 0.1, 0.55, -0.2]], () => 0.035, k.mat(0xE3A45A, { coat: 0.5, bump: 0.5 })));
                const v = k.mesh(k.blob(1, 0.3, 4, 32, s + 3), k.mat(0xF0C878, { coat: 0.4, bump: 1.2, rep: 3 })); v.scale.set(0.12, 0.3, 0.1); v.position.set(s * 0.28, 0.72, -0.28); v.rotation.z = -s * 0.5; sv.push(v);
                const c = k.mesh(new T.SphereGeometry(0.05, 16, 12), k.mat(0xD06A7A, { coat: 0.5, bump: 0.4 })); c.position.set(s * 0.12, 0.2, 0.02); cow.push(c);
                const tg = new T.Group(); k.group().add(tg); tg.position.set(s * 0.55, -1.25, 0.1);
                const clipT = s > 0 ? [k.cut(0, 0, 1, 0.1)] : null;
                k.mesh(new T.SphereGeometry(0.28, 36, 28), k.mat(0xF08A5A, { coat: 0.4, bump: 0.6, side: D, clip: clipT }), tg).scale.set(0.9, 1.15, 0.9);
                if (s > 0) for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; k.mesh(k.tube([[0, 0, 0.1], [Math.cos(a) * 0.12, Math.sin(a) * 0.16, 0.1 + 0.02 * Math.sin(i)], [Math.cos(a) * 0.22, Math.sin(a) * 0.28, 0.1]], 0.018, 16, false, 6), k.mat(0xC0632E, { bump: 0.5 }), tg); }
                tes.push(tg);
                ep.push(organ(k, [[s * 0.4, -1.0, 0.18], [s * 0.3, -1.15, 0.2], [s * 0.35, -1.4, 0.15]], (u) => 0.06 - 0.02 * u, k.mat(0xF0C070, { bump: 1.2, rep: 3 })));
            });
            const pro = k.mesh(new T.TorusGeometry(0.13, 0.1, 20, 36), k.mat(0xD86A7A, { coat: 0.5, bump: 0.8 })); pro.position.set(0, 0.45, -0.05); pro.rotation.x = Math.PI / 2;
            const ejd = organ(k, [[0.08, 0.55, -0.2], [0.03, 0.45, -0.05], [0, 0.35, 0]], () => 0.02, k.mat(0xB0402A, { bump: 0 }));
            const pen = new T.Group(); k.group().add(pen);
            k.mesh(new T.CylinderGeometry(0.2, 0.2, 1.1, 36), k.mat(0xE08A9A, { coat: 0.3, bump: 0.8, clip: [k.cut(0, 0, 1, 0.05)], side: D }), pen);
            k.mesh(new T.CylinderGeometry(0.035, 0.035, 1.15, 14), k.mat(0xC03030, { bump: 0 }), pen);
            pen.position.set(0, -0.3, 0.1);
            const ure = organ(k, [[0, 0.72, -0.05], [0, 0.3, 0.05], [0, 0.1, 0.1]], () => 0.035, k.mat(0xC03030, { bump: 0 }));
            k.label('قناة ناقلة', 'تنقل النطف من البربخ للقناة القاذفة.', [-0.85, 0.2, 0.1], vd);
            k.label('حويصلة منوية', 'تفرز سائلاً غنياً بالسكر يغذي النطف.', [0.3, 0.75, -0.2], sv);
            k.label('القناة القاذفة', 'تنقل السائل المنوي للإحليل.', [0.03, 0.45, -0.05], ejd);
            k.label('غدة البروستات', 'تفرز سائلاً قاعدياً يعادل حموضة المسالك.', [0.2, 0.45, 0.05], pro);
            k.label('غدتا كوبر', 'تفرز سائلاً مخاطياً يسبق خروج النطف.', [-0.12, 0.2, 0.06], cow);
            k.label('القضيب', 'فيه الإحليل الذي يخرج منه البول والسائل المنوي.', [0.2, -0.3, 0.1], [pen, ure]);
            k.label('البربخ', 'أنبوب ملتف على الخصية تنضج وتخزن فيه النطف.', [-0.35, -1.15, 0.22], ep);
            k.label('خصية', 'تنتج النطف وهرمون التستوستيرون.', [-0.55, -1.45, 0.25], tes[0]);
            k.label('نبيبات منوية', 'أنابيب ملتفة داخل الخصية تتكون فيها النطف.', [0.62, -1.2, 0.12], tes[1]);
            return { view: [0.2, 0.1, 1.5] };
        }
    },
    // ---------- Human sperm ----------
    {
        id: 'sperm', title: 'نطفة الإنسان', icon: 'move-right',
        build(k) {
            const s = sperm(k, k.group(), [-1.2, 0, 0], 1.6, 0);
            k.label('الرأس', 'فيه النواة (ن) والجسم الطرفي الذي يحوي إنزيمات تذيب غلاف البيضة.', [-1.2, 0.2, 0.1], s.head);
            k.label('العنق', 'يربط الرأس بالقطعة الوسطية.', [-1.2 + 0.22 * 1.6, 0.08, 0.05], s.neck);
            k.label('القطعة الوسطية', 'فيها المايتوكوندريا التي تجهز الطاقة للحركة.', [-1.2 + 0.4 * 1.6, 0.07, 0.05], s.mid);
            k.label('ذيل', 'يتحرك ويدفع النطفة للأمام.', [-1.2 + 1.3 * 1.6, 0.05, 0], s.tail);
            return { view: [0.15, 0.3, 1.5] };
        }
    },
    // ---------- Ovarian cycle ----------
    {
        id: 'ovary', title: 'الدورة المبيضية في أنثى الإنسان', icon: 'circle-dashed',
        build(k) {
            const T = k.THREE, D = T.DoubleSide, clip = [k.cut(0, 0, 1, 0)];
            const cm = (c, o = {}) => k.mat(c, Object.assign({ side: D, clip, bump: 0.6 }, o));
            const ov = k.mesh(new T.SphereGeometry(1, 64, 48), cm(0xF6D5B0, { bump: 1, rep: 3 })); ov.scale.set(1.5, 0.95, 0.6);
            const cap = k.mesh(new T.SphereGeometry(1.02, 64, 48), cm(0xE89A5A, { opacity: 1 })); cap.scale.set(1.5, 0.95, 0.6);
            const fol = (p, R, antrum, lay) => {
                const g = new T.Group(); k.group().add(g); g.position.set(p[0], p[1], 0);
                k.mesh(new T.SphereGeometry(R, 40, 30), cm(0xC24A6A), g);
                k.mesh(new T.SphereGeometry(R * 0.9, 40, 30), cm(0xF0A23A), g);
                if (antrum) { const an = k.mesh(new T.SphereGeometry(R * antrum, 36, 26), cm(0x9A9A70), g); an.position.x = -R * 0.12; }
                const egg = k.mesh(new T.SphereGeometry(R * (lay || 0.35), 28, 20), cm(0xF4D0D8), g); egg.position.x = antrum ? R * 0.35 : 0;
                const n = k.mesh(new T.SphereGeometry(R * 0.12, 16, 12), cm(0xB05A7A), g); n.position.x = egg.position.x;
                return g;
            };
            const f0 = fol([-1.05, 0.45], 0.07, 0, 0.6), f1 = fol([-0.8, 0.6], 0.11, 0, 0.5), f2 = fol([-0.45, 0.62], 0.16, 0.45), f3 = fol([0.0, 0.55], 0.22, 0.6), f4 = fol([0.72, 0.1], 0.36, 0.7, 0.28);
            const pb = k.mesh(new T.SphereGeometry(0.03, 12, 10), k.mat(0xE88AA8, { bump: 0 })); pb.position.set(0.95, 0.06, 0.02);
            const rup = new T.Group(); k.group().add(rup); rup.position.set(0.55, -0.62, 0);
            k.mesh(k.blob(0.2, 0.6, 4, 32, 5), cm(0xB0405A), rup);
            const eggOut = new T.Group(); k.group().add(eggOut); eggOut.position.set(1.05, -0.75, 0.15);
            k.mesh(new T.SphereGeometry(0.1, 24, 18), k.mat(0xF4D0D8, { bump: 0.3 }), eggOut);
            const cor = []; for (let i = 0; i < 40; i++) { const v = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.14 + Math.random() * 0.04); cor.push([v.x, v.y, v.z]); }
            k.many(new T.SphereGeometry(0.018, 8, 6), k.mat(0xE3A23A, { bump: 0 }), cor, eggOut);
            const cl = k.mesh(k.blob(0.28, 0.5, 5, 48, 9), cm(0xF2C24A, { bump: 1.2 })); cl.position.set(-0.05, -0.45, 0);
            const cl2 = k.mesh(k.blob(0.14, 0.4, 5, 32, 7), cm(0xE06A8A)); cl2.position.set(-0.05, -0.45, 0);
            const ca = k.mesh(k.blob(0.13, 0.7, 8, 32, 4), cm(0xE8C8E0, { bump: 1.4 })); ca.position.set(-0.7, -0.2, 0); ca.scale.set(1.4, 0.6, 1);
            const ar = new T.Group(); k.group().add(ar);
            [[[-1.0, 0.5], [-0.88, 0.58]], [[-0.68, 0.62], [-0.6, 0.62]], [[-0.27, 0.6], [-0.2, 0.6]], [[0.25, 0.45], [0.4, 0.33]], [[0.65, -0.3], [0.62, -0.42]], [[0.35, -0.6], [0.25, -0.55]], [[-0.35, -0.38], [-0.5, -0.3]]].forEach(([a, b]) => arrow(k, [a[0], a[1], 0.62], [b[0], b[1], 0.62], 0x3A2A2A, 0.01, ar));
            const z = (o, dz) => [o.position.x, o.position.y, dz || 0.02];
            k.label('مرحلة تكوين الحويصلة البدائية', 'خلية بيضية أولية محاطة بطبقة واحدة من الخلايا.', z(f0), f0);
            k.label('مرحلة تكون الحوصلة الأولية', 'تزداد طبقات الخلايا المحيطة.', z(f1), f1);
            k.label('مرحلة حوصلة ثانوية', 'يظهر تجويف فيه سائل.', z(f2), f2);
            k.label('مرحلة الحوصلة الناضجة', 'حوصلة كبيرة (كراف) فيها خلية بيضية ثانوية جاهزة للخروج.', [0.72, 0.4, 0.02], [f3, f4]);
            k.label('جسم قطبي أول', 'ينتج من الانقسام الاختزالي الأول.', pb.position, pb);
            k.label('خلية بيضية ثانوية', 'تخرج من المبيض عند الإباضة.', [0.97, 0.1, 0.02], f4.children[f4.children.length - 2]);
            k.label('مرحلة الإباضة', 'تنفجر الحوصلة وتخرج الخلية البيضية الثانوية.', [1.05, -0.75, 0.2], [rup, eggOut]);
            k.label('الجسم الأصفر', 'يتكون من بقايا الحوصلة ويفرز البروجسترون.', z(cl), [cl, cl2]);
            k.label('الجسم الأبيض', 'يضمحل الجسم الأصفر عند عدم حصول حمل ويتحول إلى كتلة صغيرة.', z(ca), ca);
            return { view: [0, 0.1, 1] };
        }
    }
];
