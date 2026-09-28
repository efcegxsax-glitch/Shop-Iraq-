// 3D biology diagrams, part 4: tissues (epithelial, connective, bone, muscle, blood, phloem).

function rbox(T, w, h, d, r) {
    r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const s = new T.Shape(), x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
    s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.lineTo(x, y);
    const g = new T.ExtrudeGeometry(s, { depth: Math.max(1e-3, d - 2 * r), bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 3, curveSegments: 4 });
    g.translate(0, 0, -Math.max(1e-3, d - 2 * r) / 2);
    g.computeVertexNormals();
    return g;
}

// Instances with their own size: list of [x, y, z, sx, sy, sz, rx, ry, rz]
function inst(k, geo, mat, list, parent) {
    const T = k.THREE, im = new T.InstancedMesh(geo, mat, list.length), o = new T.Object3D();
    list.forEach((q, i) => {
        o.position.set(q[0], q[1], q[2]);
        o.scale.set(q[3] ?? 1, q[4] ?? 1, q[5] ?? 1);
        o.rotation.set(q[6] || 0, q[7] || 0, q[8] || 0);
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
    });
    (parent || k.group()).add(im);
    return im;
}

// The connective tissue under an epithelium: a slab with fibres and spindle-shaped fibroblasts.
function ctSlab(k, w, d, h, y, color, R) {
    const T = k.THREE, g = k.group();
    const slab = k.mesh(new T.BoxGeometry(w, h, d), k.mat(color, { tex: 'fiber', bump: 1.6, rep: 3, rough: 0.8 }), g);
    slab.position.y = y - h / 2;
    const fib = [], nuc = [];
    for (let i = 0; i < 7; i++) {
        const x = (R() - 0.5) * (w - 0.4), z = d / 2 + 0.004, yy = y - h * (0.3 + R() * 0.45), ry = (R() - 0.5) * 0.5;
        fib.push([x, yy, z, 0.2, 0.045, 0.02, 0, 0, ry]);
        nuc.push([x, yy, z + 0.012, 0.045, 0.022, 0.012]);
    }
    for (let i = 0; i < 5; i++) {
        const x = w / 2 + 0.004, z = (R() - 0.5) * (d - 0.3), yy = y - h * (0.3 + R() * 0.45);
        fib.push([x, yy, z, 0.02, 0.045, 0.2, 0, 0, 0]);
        nuc.push([x + 0.012, yy, z, 0.012, 0.022, 0.045]);
    }
    const fm = inst(k, new T.SphereGeometry(1, 20, 12), k.mat(0x2E8C8C, { coat: 0.4, bump: 0 }), fib, g);
    inst(k, new T.SphereGeometry(1, 14, 10), k.mat(0x13405C, { bump: 0 }), nuc, g);
    return { slab, fib: fm, g };
}

function basement(k, w, d, y) {
    const m = k.mesh(new k.THREE.BoxGeometry(w + 0.004, 0.028, d + 0.004), k.mat(0x6B2A3A, { rough: 0.6, bump: 0.4 }));
    m.position.y = y - 0.014;
    return m;
}

// Cilia on the top of a row of cells, gently waving.
function cilia(k, x0, x1, z0, z1, y, len, color) {
    const T = k.THREE, list = [];
    for (let x = x0; x <= x1; x += 0.035) for (let z = z0; z <= z1; z += 0.07) list.push([x, y + len / 2, z, 1, 1, 1]);
    const im = inst(k, new T.CylinderGeometry(0.006, 0.008, len, 5), k.mat(color, { bump: 0, coat: 0.3 }), list);
    const o = new T.Object3D();
    k.onFrame((t) => {
        list.forEach((q, i) => {
            const a = 0.35 * Math.sin(t * 5 - q[0] * 10);
            o.position.set(q[0] + Math.sin(a) * len / 2, y + Math.cos(a) * len / 2, q[2]);
            o.rotation.set(0, 0, -a);
            o.updateMatrix();
            im.setMatrixAt(i, o.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
    });
    return im;
}

const W = 2.4, D = 1.2;

export const MODELS = [
    // ---------- Simple squamous ----------
    {
        id: 'sq-simple', title: 'النسيج الظهاري الحرشفي البسيط', icon: 'hexagon',
        build(k) {
            const T = k.THREE, R = k.rnd(3);
            const ct = ctSlab(k, W, D, 0.34, 0, 0xB8D86A, R);
            const bm = basement(k, W, D, 0.03);
            const cells = [], nuc = [];
            const s = 0.36, hx = s * Math.sqrt(3);
            for (let r = -3; r <= 3; r++) for (let c = -5; c <= 5; c++) {
                const x = c * hx + (r % 2 ? hx / 2 : 0), z = r * s * 1.5;
                if (Math.abs(x) > W / 2 - 0.05 || Math.abs(z) > D / 2 - 0.05) continue;
                cells.push([x, 0.06, z, 1, 1, 1, 0, R() * 0.1, 0]);
                nuc.push([x + (R() - 0.5) * 0.06, 0.1, z + (R() - 0.5) * 0.06, 0.1, 0.05, 0.1]);
            }
            const hexG = new T.CylinderGeometry(s * 0.99, s * 0.99, 0.06, 6);
            hexG.rotateY(Math.PI / 6);
            const cm = inst(k, hexG, k.mat(0xE89A82, { coat: 0.5, bump: 0.8, rep: 2 }), cells);
            const nm = inst(k, new T.SphereGeometry(1, 24, 16), k.mat(0xB0162A, { coat: 0.8, bump: 0.3 }), nuc);
            k.label('خلية حرشفية', 'خلية مسطحة رقيقة مثل الحراشف، تسمح بمرور المواد بسهولة (مثل جدران الحويصلات الهوائية).', [cells[3][0], 0.09, cells[3][2]], cm);
            k.label('نواة', 'نواة الخلية، تبرز بوسطها لأن الخلية رقيقة.', [nuc[5][0], 0.14, nuc[5][2]], nm);
            k.label('غشاء قاعدي', 'طبقة رقيقة تستند عليها الخلايا وتفصلها عن النسيج الضام.', [W / 2, 0.02, D / 2], bm);
            k.label('نسيج ضام', 'نسيج تحت الظهاري يسنده ويغذيه.', [W / 2, -0.2, D / 2], ct.slab);
            return { view: [0.5, 0.9, 1.3] };
        }
    },
    // ---------- Simple cuboidal ----------
    {
        id: 'cu-simple', title: 'النسيج الظهاري المكعبي البسيط', icon: 'box',
        build(k) {
            const T = k.THREE, R = k.rnd(5);
            const ct = ctSlab(k, W, D, 0.34, 0, 0xB8D86A, R);
            const bm = basement(k, W, D, 0.03);
            const cs = 0.3, cells = [], nuc = [];
            for (let x = -W / 2 + cs / 2; x < W / 2; x += cs) for (let z = -D / 2 + cs / 2; z < D / 2; z += cs) {
                cells.push([x, 0.03 + cs / 2, z]);
                nuc.push([x, 0.03 + cs / 2, z, 0.075, 0.075, 0.075]);
            }
            const cm = inst(k, rbox(T, cs * 0.97, cs * 0.97, cs * 0.97, 0.03), k.mat(0x8CC4EC, { glass: true, thick: 0.25, atten: 0.32, bump: 0.5 }), cells);
            const nm = inst(k, new T.SphereGeometry(1, 24, 16), k.mat(0xD7263D, { coat: 0.8, bump: 0.3 }), nuc);
            const f = cells[cells.length - 1];
            k.label('خلية مكعبة', 'خلية طولها وعرضها وارتفاعها متساوية تقريباً، تبطن قنوات الغدد والكلية (إفراز وامتصاص).', [f[0], f[1] + 0.1, f[2] + cs / 2], cm);
            k.label('نواة', 'نواة كروية بوسط الخلية.', [nuc[2][0], nuc[2][1], nuc[2][2]], nm);
            k.label('غشاء قاعدي', 'طبقة رقيقة تحت الخلايا.', [-W / 2, 0.02, D / 2], bm);
            k.label('نسيج ضام', 'نسيج داعم تحت الغشاء القاعدي.', [W / 2, -0.18, D / 2], ct.slab);
            return { view: [0.5, 0.6, 1.4] };
        }
    },
    // ---------- Simple columnar ----------
    {
        id: 'co-simple', title: 'النسيج الظهاري العمودي البسيط', icon: 'columns-3',
        build(k) {
            const T = k.THREE, R = k.rnd(7);
            const ct = ctSlab(k, W, D, 0.34, 0, 0x7FBF6A, R);
            const bm = basement(k, W, D, 0.03);
            const cw = 0.26, ch = 0.9, cells = [], nuc = [];
            for (let x = -W / 2 + cw / 2; x < W / 2; x += cw) for (let z = -D / 2 + cw / 2; z < D / 2; z += cw) {
                cells.push([x, 0.03 + ch / 2, z]);
                nuc.push([x, 0.2 + R() * 0.04, z, 0.075, 0.1, 0.075]);
            }
            const cm = inst(k, rbox(T, cw * 0.96, ch, cw * 0.96, 0.03), k.mat(0xF0A28C, { glass: true, thick: 0.25, atten: 0.32, bump: 0.5 }), cells);
            const nm = inst(k, new T.SphereGeometry(1, 24, 16), k.mat(0xA8142A, { coat: 0.8, bump: 0.3 }), nuc);
            const cl = cilia(k, -W / 2 + 0.02, W / 2 - 0.02, -D / 2 + 0.03, D / 2 - 0.03, 0.03 + ch, 0.12, 0xC0395A);
            const f = cells[cells.length - 1];
            k.label('أهداب', 'زوائد شعرية تتحرك وتدفع المواد على السطح (مثل قناة البيض).', [0.5, 0.03 + ch + 0.1, D / 2 - 0.05], cl);
            k.label('خلية عمودية', 'خلية طويلة ارتفاعها أكبر من عرضها، تبطن المعدة والأمعاء.', [f[0], 0.7, f[2] + cw / 2], cm);
            k.label('النواة', 'نواة بيضوية قرب قاعدة الخلية.', [nuc[nuc.length - 1][0], nuc[nuc.length - 1][1], nuc[nuc.length - 1][2]], nm);
            k.label('غشاء قاعدي', 'طبقة رقيقة تحت الخلايا.', [W / 2, 0.02, D / 2], bm);
            k.label('نسيج ضام', 'نسيج داعم فيه خلايا ليفية.', [-W / 2, -0.2, D / 2], ct.slab);
            return { view: [0.4, 0.45, 1.4] };
        }
    },
    // ---------- Pseudostratified ----------
    {
        id: 'pseudo', title: 'النسيج الظهاري العمودي المطبق الكاذب', icon: 'columns-4',
        build(k) {
            const T = k.THREE, R = k.rnd(9);
            const ct = ctSlab(k, W, D, 0.34, 0, 0xC79AD6, R);
            const bm = basement(k, W, D, 0.03);
            const cw = 0.24, ch = 0.95, tall = [], short = [], nuc = [];
            let i = 0;
            for (let x = -W / 2 + cw / 2; x < W / 2; x += cw) for (let z = -D / 2 + cw / 2; z < D / 2; z += cw) {
                const isShort = (i++ % 3) === 1;
                if (isShort) { short.push([x, 0.03 + 0.2, z, 1, 1, 1]); nuc.push([x, 0.16, z, 0.07, 0.07, 0.07]); }
                else { tall.push([x, 0.03 + ch / 2, z]); nuc.push([x, 0.3 + R() * 0.3, z, 0.07, 0.09, 0.07]); }
            }
            const tm = inst(k, rbox(T, cw * 0.96, ch, cw * 0.96, 0.03), k.mat(0xF2A081, { glass: true, thick: 0.25, atten: 0.32, bump: 0.5 }), tall);
            const sm = inst(k, new T.ConeGeometry(cw * 0.55, 0.4, 16), k.mat(0xE77F66, { coat: 0.4, bump: 0.5 }), short.map((q) => [q[0], q[1], q[2], 1, 1, 1, Math.PI, 0, 0]));
            const nm = inst(k, new T.SphereGeometry(1, 22, 16), k.mat(0x9E1428, { coat: 0.8, bump: 0.3 }), nuc);
            const cl = cilia(k, -W / 2 + 0.02, W / 2 - 0.02, -D / 2 + 0.03, D / 2 - 0.03, 0.03 + ch, 0.18, 0xB02A4A);
            k.label('أهداب', 'تحرك المخاط والأتربة نحو الخارج (بطانة القصبة الهوائية).', [0.3, 0.03 + ch + 0.15, D / 2 - 0.05], cl);
            k.label('خلية عمودية', 'كل الخلايا ترتكز على الغشاء القاعدي لكن مو كلها تصل السطح، فيبين مطبق وهو طبقة وحدة.', [tall[tall.length - 1][0], 0.75, tall[tall.length - 1][2] + cw / 2], tm);
            k.label('نواة', 'الأنوية بمستويات مختلفة، لذلك يبدو النسيج متعدد الطبقات (كاذب).', [nuc[4][0], nuc[4][1], nuc[4][2]], nm);
            k.label('غشاء قاعدي', 'كل الخلايا مستندة عليه.', [W / 2, 0.02, D / 2], [bm, sm]);
            k.label('نسيج ضام', 'نسيج داعم تحت الظهاري.', [-W / 2, -0.2, D / 2], ct.slab);
            return { view: [0.4, 0.45, 1.4] };
        }
    },
    // ---------- Stratified squamous ----------
    {
        id: 'sq-strat', title: 'النسيج الظهاري المطبق الحرشفي', icon: 'layers',
        build(k) {
            const T = k.THREE, R = k.rnd(11);
            const ct = ctSlab(k, W, D, 0.4, 0, 0xB587CC, R);
            const bm = basement(k, W, D, 0.03);
            const layers = [[0.15, 0.15, 0xF6F0C8], [0.13, 0.16, 0xF3EAC0], [0.16, 0.12, 0xF2D8CE], [0.22, 0.08, 0xF0C9C0], [0.3, 0.045, 0xE8A58E]];
            let y = 0.03;
            const groups = [];
            layers.forEach(([sz, h, col], li) => {
                const list = [], nuc = [];
                for (let x = -W / 2 + sz / 2; x < W / 2 - 1e-3; x += sz) for (let z = -D / 2 + sz / 2; z < D / 2 - 1e-3; z += sz) {
                    const off = li % 2 ? sz * 0.3 : 0;
                    list.push([x + off * (Math.abs(x + off) < W / 2 - sz / 2 ? 1 : 0), y + h / 2, z]);
                    nuc.push([x, y + h / 2, z, sz * 0.18, Math.min(h * 0.3, sz * 0.18), sz * 0.18]);
                }
                const cm = inst(k, rbox(T, sz * 0.96, h * 0.94, sz * 0.96, Math.min(h, sz) * 0.2), k.mat(col, { glass: li < 4, thick: 0.2, atten: 0.4, coat: 0.4, bump: 0.5 }), list);
                const nm = inst(k, new T.SphereGeometry(1, 16, 12), k.mat(0x5A1418, { coat: 0.7, bump: 0 }), nuc);
                groups.push({ cm, nm, y: y + h / 2 });
                y += h;
            });
            k.label('خلية حرشفية', 'الخلايا السطحية مسطحة، تتجدد باستمرار (بطانة الفم والمريء والجلد).', [W / 2, groups[4].y, 0.3], groups[4].cm);
            k.label('خلية مكعبة قاعدية', 'الخلايا القاعدية مكعبة، تنقسم وتدفع الخلايا للأعلى فتتسطح تدريجياً.', [W / 2, groups[0].y, 0.3], groups[0].cm);
            k.label('نواة', 'أنوية الخلايا.', [0.0, groups[1].y, D / 2], [groups[1].nm, groups[2].nm]);
            k.label('غشاء قاعدي', 'تستند عليه الطبقة القاعدية.', [W / 2, 0.02, D / 2], bm);
            k.label('نسيج ضام', 'نسيج داعم فيه خلايا ليفية.', [-W / 2, -0.2, D / 2], ct.slab);
            return { view: [0.45, 0.5, 1.35] };
        }
    },
    // ---------- Stratified cuboidal ----------
    {
        id: 'cu-strat', title: 'النسيج الظهاري المطبق المكعبي', icon: 'boxes',
        build(k) {
            const T = k.THREE, R = k.rnd(13);
            const ct = ctSlab(k, W, D, 0.4, 0, 0xE3A9C4, R);
            const bm = basement(k, W, D, 0.03);
            const cs = 0.3, list = [], nuc = [];
            for (let l = 0; l < 2; l++) for (let x = -W / 2 + cs / 2; x < W / 2; x += cs) for (let z = -D / 2 + cs / 2; z < D / 2; z += cs) {
                list.push([x, 0.03 + cs / 2 + l * cs, z]);
                nuc.push([x, 0.03 + cs / 2 + l * cs, z, 0.07, 0.07, 0.07]);
            }
            const cm = inst(k, rbox(T, cs * 0.96, cs * 0.96, cs * 0.96, 0.035), k.mat(0xF4EFB0, { glass: true, thick: 0.25, atten: 0.32, bump: 0.5 }), list);
            const top = inst(k, new T.BoxGeometry(W, 0.012, D), k.mat(0x9DB8E8, { opacity: 0.35, bump: 0 }), [[0, 0.03 + cs * 2 + 0.006, 0]]);
            const nm = inst(k, new T.SphereGeometry(1, 22, 16), k.mat(0xC21E2E, { coat: 0.8, bump: 0.3 }), nuc);
            k.label('خلايا مكعبة', 'طبقتان من الخلايا المكعبة (قنوات الغدد العرقية).', [-W / 2, 0.03 + cs, 0.3], [cm, top]);
            k.label('نواة', 'نواة كروية.', [nuc[1][0], nuc[1][1], nuc[1][2]], nm);
            k.label('غشاء قاعدي', 'تحت الطبقة السفلى.', [W / 2, 0.02, D / 2], bm);
            k.label('نسيج ضام', 'نسيج داعم.', [W / 2, -0.2, D / 2], ct.slab);
            return { view: [0.5, 0.5, 1.35] };
        }
    },
    // ---------- Stratified columnar ----------
    {
        id: 'co-strat', title: 'النسيج الظهاري المطبق العمودي', icon: 'columns-2',
        build(k) {
            const T = k.THREE, R = k.rnd(15);
            const ct = ctSlab(k, W, D, 0.34, 0, 0xE6A94E, R);
            const bm = basement(k, W, D, 0.03);
            const cw = 0.3, base = [], col = [], nuc = [];
            for (let x = -W / 2 + cw / 2; x < W / 2; x += cw) for (let z = -D / 2 + cw / 2; z < D / 2; z += cw) {
                base.push([x, 0.03 + 0.16, z]); nuc.push([x, 0.19, z, 0.06, 0.06, 0.06]);
                col.push([x, 0.35 + 0.28, z]); nuc.push([x, 0.55, z, 0.055, 0.075, 0.055]);
            }
            const bmesh = inst(k, rbox(T, cw * 0.96, 0.3, cw * 0.96, 0.03), k.mat(0xE88A9A, { glass: true, thick: 0.25, atten: 0.32, bump: 0.5 }), base);
            const cmesh = inst(k, rbox(T, cw * 0.96, 0.56, cw * 0.96, 0.03), k.mat(0xE56F86, { glass: true, thick: 0.25, atten: 0.32, bump: 0.5 }), col);
            const tops = [];
            for (let x = -W / 2 + 0.1; x < W / 2; x += 0.2) for (let z = -D / 2 + 0.1; z < D / 2; z += 0.2) tops.push([x, 0.93, z, 0.1, 0.02, 0.1]);
            const tm = inst(k, new T.CylinderGeometry(1, 1, 1, 6), k.mat(0x8A1F2E, { bump: 0.3 }), tops);
            const nm = inst(k, new T.SphereGeometry(1, 20, 14), k.mat(0x1F6E80, { coat: 0.8, bump: 0.3 }), nuc);
            k.label('خلية عمودية', 'الطبقة السطحية عمودية والطبقات تحتها مكعبة (الإحليل وقنوات بعض الغدد).', [W / 2, 0.65, 0.3], [cmesh, tm]);
            k.label('نواة', 'أنوية كروية.', [nuc[1][0], nuc[1][1], nuc[1][2]], nm);
            k.label('طبقة قاعدية', 'خلايا مكعبة قرب الغشاء القاعدي.', [-W / 2, 0.19, 0.3], bmesh);
            k.label('غشاء قاعدي', 'تحت الخلايا.', [W / 2, 0.02, D / 2], bm);
            k.label('نسيج ضام', 'نسيج داعم.', [-W / 2, -0.2, D / 2], ct.slab);
            return { view: [0.45, 0.45, 1.35] };
        }
    },
    // ---------- Adipose ----------
    {
        id: 'adipose', title: 'النسيج الضام الشحمي (الدهني)', icon: 'circle',
        build(k) {
            const T = k.THREE, R = k.rnd(17);
            const cells = [], drops = [], nuc = [], fib = [];
            for (let x = -1; x <= 1.01; x += 0.5) for (let y = -0.75; y <= 0.76; y += 0.5) for (let z = -0.25; z <= 0.26; z += 0.5) {
                const p = [x + (R() - 0.5) * 0.06, y + (R() - 0.5) * 0.06, z];
                cells.push([p[0], p[1], p[2], 0.25, 0.24, 0.25]);
                drops.push([p[0] - 0.02, p[1] + 0.02, p[2], 0.21, 0.19, 0.21]);
                const a = R() * 6.28;
                nuc.push([p[0] + Math.cos(a) * 0.2, p[1] + Math.sin(a) * 0.2, p[2] + 0.1, 0.06, 0.035, 0.05, 0, 0, a]);
            }
            for (let i = 0; i < 40; i++) fib.push([(R() - 0.5) * 2.6, (R() - 0.5) * 2, (R() - 0.5) * 0.9, 0.006, 0.12, 0.006, R() * 3, R() * 3, R() * 3]);
            const cm = inst(k, new T.SphereGeometry(1, 40, 30), k.mat(0x9CC9F0, { glass: true, thick: 0.35, atten: 0.5, bump: 0.3 }), cells);
            const dm = inst(k, new T.SphereGeometry(1, 36, 26), k.mat(0xF4D84A, { coat: 1, rough: 0.12, bump: 0.1 }), drops);
            const nm = inst(k, new T.SphereGeometry(1, 16, 12), k.mat(0xD62A48, { coat: 0.7, bump: 0 }), nuc);
            const fm = inst(k, new T.CylinderGeometry(1, 1, 1, 5), k.mat(0xE35A7A, { bump: 0 }), fib);
            const matrix = k.mesh(new T.BoxGeometry(2.7, 2.1, 1.0), k.mat(0x3C7FD6, { clear: true, opacity: 0.3 }));
            k.label('خلايا دهنية', 'خلايا كبيرة يملأها قطرة دهن واحدة، تخزن الدهون وتعزل الحرارة وتحمي الأعضاء.', [cells[2][0] + 0.2, cells[2][1], cells[2][2] + 0.1], cm);
            k.label('قطرة دهن', 'الدهن المخزون يدفع السايتوبلازم والنواة للحافة.', [drops[7][0], drops[7][1], drops[7][2] + 0.2], dm);
            k.label('نواة مضغوطة', 'النواة مدفوعة لجانب الخلية بسبب قطرة الدهن.', [nuc[4][0], nuc[4][1], nuc[4][2]], nm);
            k.label('ألياف', 'ألياف بين الخلايا تربطها.', [fib[3][0], fib[3][1], fib[3][2]], [fm, matrix]);
            return { view: [0.3, 0.3, 1.5] };
        }
    },
    // ---------- Reticular ----------
    {
        id: 'reticular', title: 'النسيج الضام الشبكي', icon: 'network',
        build(k) {
            const T = k.THREE, R = k.rnd(19);
            const pts = [];
            for (let x = 0; x < 6; x++) for (let y = 0; y < 5; y++) for (let z = 0; z < 2; z++) pts.push(new T.Vector3(-1.1 + x * 0.44 + (R() - 0.5) * 0.3, -0.9 + y * 0.45 + (R() - 0.5) * 0.3, -0.3 + z * 0.6 + (R() - 0.5) * 0.25));
            for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
            const cells = k.group(), cm = k.mat(0xF2C34A, { coat: 0.5, bump: 0.8 }), nm = k.mat(0xB0162A, { coat: 0.8, bump: 0 });
            pts.slice(0, 16).forEach((p, i) => { const b = k.mesh(k.blob(0.13, 0.5, 3, 32, i + 2), cm, cells); b.position.copy(p); b.scale.set(1.3, 0.9, 0.8); k.at(k.mesh(new T.SphereGeometry(0.045, 16, 12), nm, cells), p.x, p.y, p.z + 0.08); });
            const fibers = k.group(), fmat = k.mat(0x3A3A2A, { rough: 0.6, bump: 0 }), done = {};
            pts.forEach((a, i) => {
                const near = pts.map((b, j) => [a.distanceTo(b), j]).filter((q) => q[1] !== i).sort((x, y) => x[0] - y[0]).slice(0, 3);
                near.forEach(([d, j]) => {
                    const key = Math.min(i, j) + '_' + Math.max(i, j);
                    if (done[key]) return;
                    done[key] = 1;
                    const b = pts[j], m = a.clone().lerp(b, 0.5).add(new T.Vector3((R() - 0.5) * 0.25, (R() - 0.5) * 0.25, (R() - 0.5) * 0.2));
                    k.mesh(k.tube([[a.x, a.y, a.z], [m.x, m.y, m.z], [b.x, b.y, b.z]], 0.02, 24, false, 6), fmat, fibers);
                });
            });
            const bg = k.mesh(new T.BoxGeometry(2.6, 2.2, 1.1), k.mat(0xD7EA8A, { clear: true, opacity: 0.2 }));
            k.label('خلية شبكية', 'خلايا متفرعة تصنع الألياف الشبكية (الطحال والعقد اللمفاوية ونخاع العظم).', [pts[0].x, pts[0].y + 0.1, pts[0].z], cells);
            k.label('ألياف شبكية', 'ألياف رفيعة متشابكة تكوّن هيكل يسند خلايا العضو.', [pts[10].x, pts[10].y, pts[10].z], [fibers, bg]);
            return { view: [0.2, 0.3, 1.5] };
        }
    },
    // ---------- Mucous (Wharton's jelly) ----------
    {
        id: 'mucous', title: 'النسيج الضام المخاطي', icon: 'droplet',
        build(k) {
            const T = k.THREE, R = k.rnd(23);
            const jelly = k.mesh(k.blob(1, 0.18, 1.3, 64, 4), k.mat(0x6FA8E8, { opacity: 0.55, clip: [k.cut(0, 0, 1, 0.12)], side: T.DoubleSide, bump: 0.6, rep: 3 }));
            jelly.scale.set(1.05, 1.25, 0.5);
            const face = k.mesh(new T.CircleGeometry(1, 64), k.mat(0x5A94DC, { rough: 0.7, bump: 1, rep: 3 }));
            face.position.z = 0.12; face.scale.set(1.02, 1.22, 1);
            const art = k.group();
            [[-0.38, 0.28], [0.38, 0.4]].forEach(([x, y]) => {
                const w = k.mesh(new T.CylinderGeometry(0.24, 0.24, 0.7, 40, 1, true), k.mat(0xA5CFC3, { side: T.DoubleSide, tex: 'fiber', bump: 1.2, rep: 3 }), art);
                w.rotation.x = Math.PI / 2; w.position.set(x, y, -0.2);
                const lum = k.mesh(new T.RingGeometry(0.08, 0.24, 40), k.mat(0x8FC3B5, { tex: 'fiber', bump: 1.4, rep: 2, side: T.DoubleSide }), art);
                lum.position.set(x, y, 0.135);
                const hole = k.mesh(new T.CircleGeometry(0.08, 24), k.mat(0x2A1A1A, { bump: 0 }), art);
                hole.position.set(x, y, 0.136);
            });
            const vein = k.group();
            const vs = new T.Shape(); vs.absellipse(0, 0, 0.36, 0.14, 0, Math.PI * 2);
            const vh = new T.Path(); vh.absellipse(0, 0, 0.3, 0.09, 0, Math.PI * 2); vs.holes.push(vh);
            const vm = k.mesh(new T.ShapeGeometry(vs, 32), k.mat(0xE56A7A, { bump: 0.6, side: T.DoubleSide }), vein);
            const vi = k.mesh(new T.ShapeGeometry(new T.Shape().absellipse(0, 0, 0.3, 0.09, 0, Math.PI * 2), 32), k.mat(0xFBEFEF, { bump: 0.2 }), vein);
            vein.position.set(0.18, -0.55, 0.137); vein.rotation.z = 0.25;
            const stars = [];
            for (let i = 0; i < 40; i++) {
                const x = (R() - 0.5) * 1.8, y = (R() - 0.5) * 2.2;
                if (Math.hypot(x / 1.05, y / 1.25) > 0.9 || Math.hypot(x + 0.38, y - 0.28) < 0.3 || Math.hypot(x - 0.38, y - 0.4) < 0.3 || Math.hypot((x - 0.18) / 0.4, (y + 0.55) / 0.2) < 1) continue;
                const a = R() * 3;
                stars.push([x, y, 0.14, 0.05, 0.008, 0.01, 0, 0, a], [x, y, 0.14, 0.05, 0.008, 0.01, 0, 0, a + 1.3], [x, y, 0.14, 0.035, 0.008, 0.01, 0, 0, a + 2.4]);
            }
            const sm = inst(k, new T.BoxGeometry(1, 1, 1), k.mat(0x1E2A4A, { bump: 0 }), stars);
            k.label('شريان', 'وعاء دموي جداره سميك (بالحبل السري).', [0.38, 0.4, 0.14], art);
            k.label('وريد', 'وعاء دموي جداره أرق ومفلطح.', [0.18, -0.55, 0.14], vein);
            k.label('أرومة ليفية', 'خلايا نجمية الشكل تفرز المادة الأساس الهلامية (هلام وارتن بالحبل السري).', [stars[0][0], stars[0][1], 0.14], [sm, jelly, face]);
            return { view: [0.25, 0.2, 1.6] };
        }
    },
    // ---------- Compact bone ----------
    {
        id: 'bone', title: 'العظم المصمت', icon: 'bone',
        build(k) {
            const T = k.THREE, R = k.rnd(29);
            const H = 0.8, RB = 1.35, top = H / 2;
            const matrix = k.mesh(new T.CylinderGeometry(RB, RB, H, 96), k.mat(0xBFE3EA, { tex: 'organic', bump: 1.1, rep: 5 }));
            const peri = k.mesh(new T.CylinderGeometry(RB + 0.07, RB + 0.07, H * 0.96, 96, 1, true), k.mat(0x557A2B, { tex: 'fiber', bump: 1.8, rep: 5, side: T.DoubleSide }));
            const lamM = k.mat(0x2A3440, { bump: 0 }), lacM = k.mat(0xB5232B, { coat: 0.6, bump: 0 });
            const lac = [], can = [];
            const addLac = (x, z, a) => { lac.push([x, top + 0.012, z, 0.032, 0.012, 0.016, 0, -a, 0]); for (let j = 0; j < 4; j++) { const b = R() * 6.28; can.push([x + Math.cos(b) * 0.035, top + 0.006, z + Math.sin(b) * 0.035, 0.0025, 0.055, 0.0025, Math.PI / 2, 0, b]); } };
            // circumferential lamellae around the whole bone
            const circ = k.group();
            [RB - 0.08, RB - 0.18].forEach((r) => {
                const ring = k.mesh(new T.TorusGeometry(r, 0.007, 6, 160), lamM, circ);
                ring.rotation.x = Math.PI / 2; ring.position.y = top + 0.004;
                for (let j = 0; j < 44; j++) { const a = (j / 44) * 6.283; addLac(Math.cos(a) * r, Math.sin(a) * r, a + Math.PI / 2); }
            });
            // Haversian systems
            const ost = k.group(), canals = k.group();
            const osts = [[0, 0, 0.42], [-0.62, 0.38, 0.3], [0.62, 0.42, 0.3], [-0.55, -0.5, 0.32], [0.58, -0.5, 0.3], [0.02, 0.8, 0.22], [0.0, -0.85, 0.22]];
            osts.forEach(([x, z, r]) => {
                const disc = k.mesh(new T.CylinderGeometry(r, r, 0.02, 56), k.mat(0xDDEFE3, { tex: 'organic', bump: 0.9, rep: 3 }), ost);
                disc.position.set(x, top + 0.002, z);
                for (let q = 1; q <= 3; q++) {
                    const rr = r * (0.28 + q * 0.23), ring = k.mesh(new T.TorusGeometry(rr, 0.006, 6, 64), lamM, ost);
                    ring.rotation.x = Math.PI / 2; ring.position.set(x, top + 0.013, z);
                    const n = Math.round(5 + q * 3 * (r / 0.3));
                    for (let j = 0; j < n; j++) { const a = (j / n) * 6.283 + R() * 0.4; addLac(x + Math.cos(a) * rr, z + Math.sin(a) * rr, a + Math.PI / 2); }
                }
                const hc = k.mesh(new T.CylinderGeometry(r * 0.24, r * 0.24, H + 0.03, 28), k.mat(0xF7F1E3, { bump: 0.2 }), canals);
                hc.position.set(x, 0, z);
            });
            const lm = inst(k, new T.SphereGeometry(1, 12, 8), lacM, lac);
            const cn = inst(k, new T.CylinderGeometry(1, 1, 1, 3), lamM, can);
            const [ox, oz, orr] = osts[0];
            const art = k.mesh(new T.CylinderGeometry(orr * 0.08, orr * 0.08, H + 0.06, 16), k.mat(0xD62B2B, { coat: 0.8, bump: 0 }));
            art.position.set(ox - orr * 0.09, 0, oz);
            const ven = k.mesh(new T.CylinderGeometry(orr * 0.08, orr * 0.08, H + 0.06, 16), k.mat(0x2B55D6, { coat: 0.8, bump: 0 }));
            ven.position.set(ox + orr * 0.09, 0, oz);
            k.label('سمحاق العظم', 'غشاء ليفي يغلف العظم من الخارج.', [RB + 0.07, 0, 0.1], peri);
            k.label('صفائح محيطية', 'صفائح عظمية تحيط بالعظم كله من الخارج.', [0, top, RB - 0.13], circ);
            k.label('صفائح عظمية', 'صفائح دائرية متحدة المركز حول قناة هافرس (جهاز هافرس).', [osts[2][0] + 0.2, top, osts[2][1]], ost);
            k.label('قناة هافرس', 'قناة بوسط كل جهاز فيها أوعية دموية وأعصاب.', [osts[3][0], top + 0.015, osts[3][1]], canals);
            k.label('أوعية دموية', 'شريان ووريد داخل قناة هافرس تغذي خلايا العظم.', [ox, top + 0.03, oz], [art, ven]);
            k.label('فجوات وخلايا عظمية', 'فراغات صغيرة بين الصفائح تسكنها الخلايا العظمية، وتتصل ببعضها بقنيات دقيقة.', [lac[100][0], lac[100][1], lac[100][2]], [lm, cn]);
            k.label('مادة عظمية', 'مادة بين الخلايا صلبة فيها أملاح الكالسيوم.', [-0.95, top, 0.05], matrix);
            return { view: [0.45, 1.0, 1.0] };
        }
    },
    // ---------- Muscles (3 kinds as steps) ----------
    {
        id: 'muscles', title: 'أنواع العضلات', icon: 'biceps-flexed',
        build(k) {
            const T = k.THREE, R = k.rnd(31);
            const sk = k.group(), sm = k.group(), cd = k.group();
            // skeletal: long cylinders, stripes, nuclei at the edge
            const skFib = [], skNuc = [];
            for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
                const y = -0.6 + i * 0.4, z = -0.2 + j * 0.4;
                skFib.push([0, y, z]);
                for (let q = 0; q < 5; q++) { const x = -1 + q * 0.5 + R() * 0.1, a = R() * 6.28; skNuc.push([x, y + Math.cos(a) * 0.19, z + Math.sin(a) * 0.19, 0.07, 0.03, 0.035, a, 0, 0]); }
            }
            const skG = new T.CylinderGeometry(0.19, 0.19, 2.4, 40, 1, true); skG.rotateZ(Math.PI / 2);
            const skM = inst(k, skG, k.mat(0xE8905A, { stripe: 34, coat: 0.4, bump: 0.6, side: T.DoubleSide }), skFib, sk);
            const skN = inst(k, new T.SphereGeometry(1, 16, 12), k.mat(0x8A1520, { coat: 0.8, bump: 0 }), skNuc, sk);
            // smooth: spindles with a central nucleus
            const smF = [], smN = [];
            for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) for (let l = 0; l < 2; l++) {
                const x = -0.9 + j * 0.9 + (i % 2) * 0.45, y = -0.6 + i * 0.3, z = -0.15 + l * 0.3;
                smF.push([x, y, z, 0.45, 0.11, 0.11, 0, 0, 0]);
                smN.push([x + (R() - 0.5) * 0.05, y, z + 0.05, 0.1, 0.035, 0.04]);
            }
            const spG = new T.SphereGeometry(1, 36, 20);
            const pos = spG.attributes.position;
            for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), f = Math.sqrt(Math.max(0, 1 - x * x)); pos.setY(i, pos.getY(i) * f); pos.setZ(i, pos.getZ(i) * f); }
            spG.computeVertexNormals();
            const smM = inst(k, spG, k.mat(0xF2C27A, { coat: 0.5, bump: 0.6 }), smF, sm);
            const smNm = inst(k, new T.SphereGeometry(1, 16, 12), k.mat(0x8A1520, { coat: 0.8, bump: 0 }), smN, sm);
            // cardiac: branched striated fibres, central nucleus, intercalated discs
            const cm = k.mat(0x7FB4E3, { stripe: 26, coat: 0.4, bump: 0.6 }), cdN = [], discs = [];
            const lines = [[-1.2, -0.45, 1.2, -0.5], [-1.2, 0.05, 1.2, 0.1], [-1.2, 0.55, 1.2, 0.5]];
            lines.forEach(([x0, y0, x1, y1], i) => {
                k.mesh(k.tube([[x0, y0, 0], [0, (y0 + y1) / 2 + 0.05, 0], [x1, y1, 0]], 0.15, 60, false, 20), cm, cd);
                for (let q = -0.8; q <= 0.8; q += 0.8) cdN.push([q + 0.2, y0 + (y1 - y0) * ((q + 1.2) / 2.4) + 0.02, 0.05, 0.07, 0.035, 0.05]);
                [-0.4, 0.45].forEach((q) => discs.push([q, y0 + (y1 - y0) * ((q + 1.2) / 2.4) + 0.02, 0, 0.16, 0.035, 0.16, 0, 0, Math.PI / 2]));
            });
            const br = k.mesh(k.tube([[-0.3, -0.42, 0], [0.0, -0.18, 0.05], [0.3, 0.07, 0]], 0.1, 30, false, 16), cm, cd);
            const br2 = k.mesh(k.tube([[0.5, 0.12, 0], [0.7, 0.32, 0.04], [0.9, 0.52, 0]], 0.09, 30, false, 16), cm, cd);
            const cdNm = inst(k, new T.SphereGeometry(1, 16, 12), k.mat(0x8A1520, { coat: 0.8, bump: 0 }), cdN, cd);
            const dm = inst(k, new T.CylinderGeometry(1, 1, 1, 24), k.mat(0x7A1020, { bump: 0 }), discs, cd);
            const groups = [sk, sm, cd];
            const setStep = (i) => groups.forEach((g, j) => { g.visible = j === i; });
            k.label('ليف عضلي', 'خلية عضلية طويلة أسطوانية.', [0.3, 0.6, 0.2], skM, [0]);
            k.label('تخطيط الليف', 'أشرطة فاتحة وغامقة بالتبادل، لذلك تسمى مخططة (إرادية، تحرك الهيكل).', [-0.6, 0.2, 0.15], skM, [0]);
            k.label('نواة', 'أنوية متعددة على حافة الليف تحت الغشاء.', [skNuc[10][0], skNuc[10][1], skNuc[10][2]], skN, [0]);
            k.label('ليف عضلي', 'خلية مغزلية الشكل مدببة الطرفين، غير مخططة ولا إرادية (جدران المعدة والأمعاء والأوعية).', [smF[7][0], smF[7][1] + 0.1, smF[7][2]], smM, [1]);
            k.label('نواة', 'نواة واحدة بوسط الخلية.', [smN[7][0], smN[7][1], smN[7][2] + 0.04], smNm, [1]);
            k.label('ليف عضلي متفرع', 'ألياف مخططة متفرعة ومتصلة ببعضها، لا إرادية (عضلة القلب فقط).', [0.0, -0.18, 0.1], [br, br2], [2]);
            k.label('نواة', 'نواة واحدة أو اثنتان بوسط الليف.', [cdN[1][0], cdN[1][1], cdN[1][2] + 0.04], cdNm, [2]);
            k.label('أقراص بينية', 'خطوط غامقة تربط الخلايا القلبية وتنقل الإشارة بسرعة لتنقبض سوية.', [discs[2][0], discs[2][1] + 0.1, 0.1], dm, [2]);
            return { view: [0.3, 0.35, 1.5], steps: [['عضلات هيكلية', 'مخططة وإرادية، أليافها طويلة وأنويتها متعددة على الحافة.'], ['عضلات ملساء', 'غير مخططة ولا إرادية، خلاياها مغزلية بنواة وسطية.'], ['عضلات قلبية', 'مخططة ولا إرادية، أليافها متفرعة وبينها أقراص بينية.']], setStep };
        }
    },
    // ---------- Blood cells ----------
    {
        id: 'blood', title: 'خلايا الدم', icon: 'droplets',
        build(k) {
            const T = k.THREE, R = k.rnd(37);
            const P = k.portrait, pos = (i, n, row) => (P ? [((i % 2) - 0.5) * 1.05, (1.5 - Math.floor(i / 2)) * 0.95, 0] : [(i - (n - 1) / 2) * 0.95, row, 0]);
            const shell = (c) => k.mat(c, { glass: true, thick: 0.4, atten: 0.45, bump: 0.4 });
            const nucM = k.mat(0x3B1F5C, { coat: 0.5, bump: 1.2, rep: 3 });
            const lobes = (g, pts, r) => { const nm = k.group(g); pts.forEach((p, i) => { const b = k.mesh(k.blob(r, 0.3, 4, 24, i + 1), nucM, nm); b.position.set(...p); }); for (let i = 1; i < pts.length; i++) k.mesh(k.tube([pts[i - 1], pts[i]], r * 0.3, 8, false, 6), nucM, nm); return nm; };
            const granules = (g, n, col, r, rad) => { const l = []; for (let i = 0; i < n; i++) { const v = new T.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(rad * Math.cbrt(R())); l.push([v.x, v.y, v.z, r, r, r]); } return inst(k, new T.SphereGeometry(1, 10, 8), k.mat(col, { coat: 0.8, bump: 0 }), l, g); };
            const cells = [];
            const mk = (i, n, row) => { const g = k.group(); g.position.set(...pos(i, n, row)); cells.push(g); return g; };
            const rowA = P ? 0 : 0.55, rowB = P ? 0 : -0.55;
            // granular
            const baso = mk(0, 5, rowA); k.mesh(new T.SphereGeometry(0.34, 40, 30), shell(0xC9B6E6), baso); lobes(baso, [[-0.08, 0, 0], [0.08, -0.05, 0.03]], 0.12); granules(baso, 36, 0x2A1450, 0.035, 0.3);
            const eos = mk(1, 5, rowA); k.mesh(new T.SphereGeometry(0.34, 40, 30), shell(0xF3B7A0), eos); lobes(eos, [[-0.12, 0.02, 0], [0.12, 0.0, 0]], 0.12); granules(eos, 70, 0xE0561F, 0.028, 0.31);
            const neu = mk(2, 5, rowA); k.mesh(new T.SphereGeometry(0.34, 40, 30), shell(0xF1D9DC), neu); lobes(neu, [[-0.15, 0.08, 0], [-0.02, -0.08, 0.03], [0.14, 0.02, 0], [0.12, 0.17, -0.02]], 0.08); granules(neu, 40, 0xE4A6B6, 0.014, 0.3);
            // agranular
            const lym = mk(3, 5, rowA); k.mesh(new T.SphereGeometry(0.3, 40, 30), shell(0xBCC8F0), lym); const lymN = k.mesh(k.blob(0.25, 0.1, 3, 32, 5), nucM, lym); lymN.position.x = -0.02;
            const mon = mk(4, 5, rowA); const mb = k.mesh(k.blob(0.38, 0.25, 2.2, 40, 9), k.mat(0x8FB6DE, { clear: true, opacity: 0.55, bump: 0.4 }), mon); mb.scale.set(1.1, 0.9, 0.9);
            const monN = k.mesh(new T.TorusGeometry(0.15, 0.1, 16, 30, 3.6), nucM, mon); monN.rotation.z = 0.6;
            // red cell: biconcave disc
            const prof = [[0, 0.04], [0.12, 0.05], [0.24, 0.1], [0.3, 0.08], [0.32, 0], [0.3, -0.08], [0.24, -0.1], [0.12, -0.05], [0, -0.04]].map((p) => new T.Vector2(p[0], p[1]));
            const rbc = P ? k.group() : mk(0, 2, rowB);
            if (P) rbc.position.set(-0.52, -1.9, 0);
            const rb = k.mesh(new T.LatheGeometry(prof, 60), k.mat(0xD7263D, { coat: 0.8, rough: 0.3, bump: 0.3 }), rbc); rb.rotation.x = Math.PI / 2 - 0.5;
            const plt = P ? k.group() : mk(1, 2, rowB);
            if (P) plt.position.set(0.52, -1.9, 0);
            const pl = [];
            for (let i = 0; i < 8; i++) pl.push([(R() - 0.5) * 0.5, (R() - 0.5) * 0.4, (R() - 0.5) * 0.2, 0.05, 0.03, 0.04, R() * 3, R() * 3, 0]);
            const plm = inst(k, new T.IcosahedronGeometry(1, 1), k.mat(0x7B5AAE, { bump: 0.8 }), pl, plt);
            k.onFrame((t) => { rb.rotation.y = t * 0.6; cells.forEach((g, i) => { g.position.y += Math.sin(t * 1.2 + i) * 0.0006; }); });
            const top = (g, dy) => [g.position.x, g.position.y + dy, g.position.z + 0.2];
            k.label('قعدة', 'خلية حبيبية، حبيباتها زرقاء غامقة، تفرز الهستامين والهيبارين.', top(baso, 0.3), baso);
            k.label('حامضية', 'خلية حبيبية، حبيباتها حمراء برتقالية ونواتها بفصين، تقاوم الطفيليات والحساسية.', top(eos, 0.3), eos);
            k.label('متعادلة', 'خلية حبيبية، نواتها بعدة فصوص، تبلعم البكتريا.', top(neu, 0.3), neu);
            k.label('لمفية', 'خلية لا حبيبية نواتها كبيرة تملأ الخلية، تكوّن الأجسام المضادة.', top(lym, 0.28), lym);
            k.label('وحيدة', 'أكبر كريات الدم البيضاء، نواتها كلوية الشكل، تبلعم.', top(mon, 0.3), mon);
            k.label('كرية حمراء', 'قرص مقعر الوجهين بدون نواة، فيه الهيموكلوبين وينقل الأكسجين.', top(rbc, 0.2), rbc);
            k.label('صفيحات دموية', 'قطع صغيرة من الخلايا تساعد بتخثر الدم.', top(plt, 0.15), plt);
            return { view: [0.1, 0.15, 1.6] };
        }
    },
    // ---------- Phloem ----------
    {
        id: 'phloem', title: 'نسيج اللحاء', icon: 'align-vertical-space-around',
        build(k) {
            const T = k.THREE, R = k.rnd(41);
            const tubes = k.group(), plates = k.group(), comp = k.group();
            const tubeM = k.mat(0xE9EE9A, { glass: true, thick: 0.4, atten: 1.4, bump: 0.5, side: T.DoubleSide, clip: [k.cut(0, 0, 1, 0.05)] });
            const plateM = k.mat(0xE77563, { coat: 0.4, bump: 0.6 });
            const holeM = k.mat(0xB0162A, { bump: 0 });
            const compM = k.mat(0xD4E07A, { coat: 0.3, bump: 0.7 }), nucM = k.mat(0x151515, { coat: 0.6, bump: 0 });
            const seg = 0.85;
            for (let i = 0; i < 3; i++) {
                const y = -0.85 + i * seg;
                const pts = [];
                for (let q = 0; q <= 12; q++) { const t = q / 12; pts.push(new T.Vector2(0.3 - 0.07 * Math.sin(t * Math.PI), y - seg / 2 + t * seg)); }
                k.mesh(new T.LatheGeometry(pts, 48), tubeM, tubes);
                const p = k.mesh(new T.CylinderGeometry(0.31, 0.31, 0.04, 40), plateM, plates); p.position.y = y + seg / 2;
                const holes = [];
                for (let h = 0; h < 14; h++) { const a = R() * 6.28, r = Math.sqrt(R()) * 0.25; holes.push([Math.cos(a) * r, y + seg / 2 + 0.022, Math.sin(a) * r, 0.025, 0.01, 0.025]); }
                inst(k, new T.SphereGeometry(1, 10, 8), holeM, holes, plates);
                const c = k.mesh(new T.CapsuleGeometry(0.09, seg * 0.62, 8, 16), compM, comp); c.position.set(0.4, y, 0.05);
                k.at(k.mesh(new T.SphereGeometry(0.05, 14, 10), nucM, comp), 0.44, y + (R() - 0.5) * 0.2, 0.12, 0, 0, 0, [0.9, 1.4, 0.9]);
                const c2 = k.mesh(new T.CapsuleGeometry(0.08, seg * 0.55, 8, 16), compM, comp); c2.position.set(-0.39, y + 0.1, -0.05);
                k.at(k.mesh(new T.SphereGeometry(0.045, 14, 10), nucM, comp), -0.43, y + 0.1, 0.02, 0, 0, 0, [0.9, 1.4, 0.9]);
            }
            const cyto = k.mesh(k.tube([[0.02, -1.3, 0], [-0.06, -0.8, 0.02], [0.06, -0.3, -0.02], [-0.05, 0.2, 0.02], [0.05, 0.7, -0.02], [0, 1.28, 0]], 0.012, 120, false, 6), k.mat(0x3A3A3A, { bump: 0 }));
            k.label('أنبوب منخلي', 'خلايا حية بدون نواة مرتبة طولياً، تنقل الغذاء المصنوع بالأوراق لباقي النبات.', [0.22, 0, 0.05], tubes);
            k.label('صفيحة منخلية', 'جدار عرضي مثقب بين خلايا الأنبوب يمر منه الغذاء.', [0, 0.425 + 0.03, 0.2], plates);
            k.label('خلية مرافقة', 'خلية صغيرة بنواة بجانب الأنبوب المنخلي، تنظم عمله.', [0.44, -0.85, 0.12], comp);
            k.label('خيوط سايتوبلازمية', 'تمتد عبر ثقوب الصفائح وتربط الخلايا.', [0.05, 0.7, 0], cyto);
            return { view: [0.4, 0.25, 1.6] };
        }
    }
];
