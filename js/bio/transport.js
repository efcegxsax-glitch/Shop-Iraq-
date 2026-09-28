// 3D biology diagrams, part 2: moving materials across the membrane.

// A lipid bilayer laid on a surface of revolution (profile [r, y] turned around the y axis),
// cut open over `open` radians so the inside shows: heads on both faces, tails between, and
// a see-through core. Returns the parts to label.
function revoBilayer(k, profile, o = {}) {
    const T = k.THREE, t = o.t || 0.13, sp = o.sp || 0.075, open = o.open ?? 1.1, rot = o.rot || 0;
    const pts = profile.map((p) => new T.Vector2(p[0], p[1]));
    // resample the profile by length
    const seg = [];
    let L = 0;
    for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); seg.push([L, d, i]); L += d; }
    const at = (s) => {
        let i = seg.findIndex((q) => s <= q[0] + q[1]);
        if (i < 0) i = seg.length - 1;
        const [s0, d, j] = seg[i], f = d ? (s - s0) / d : 0, a = pts[j - 1], b = pts[j];
        const p = a.clone().lerp(b, f), tg = b.clone().sub(a).normalize();
        return { p, n: new T.Vector2(tg.y, -tg.x) };
    };
    const headsO = [], headsI = [], tails = [];
    const span = Math.PI * 2 - open;
    for (let s = sp / 2; s < L; s += sp) {
        const { p, n } = at(s);
        const r = Math.max(0.001, p.x), cnt = Math.max(3, Math.round((span * r) / sp));
        for (let c = 0; c <= cnt; c++) {
            const th = rot + open / 2 + (c / cnt) * span, cs = Math.cos(th), sn = Math.sin(th);
            const place = (off, arr) => { const rr = p.x + n.x * off, yy = p.y + n.y * off; arr.push([rr * cs, yy, rr * sn]); };
            place(t / 2, headsO); place(-t / 2, headsI);
            [t / 2 - 0.03, -t / 2 + 0.03].forEach((off, side) => {
                const rr = p.x + n.x * (off * 0.55), yy = p.y + n.y * (off * 0.55);
                const ax = new T.Vector3(n.x * cs, n.y, n.x * sn).normalize();
                const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), ax), e = new T.Euler().setFromQuaternion(q);
                tails.push([rr * cs, yy, rr * sn, e.x, e.y, e.z]);
            });
        }
    }
    const hm = k.mat(o.head || 0xE8A55E, { coat: 0.8, rough: 0.3, bump: 0.2 });
    const heads = k.group();
    k.many(new T.SphereGeometry(0.034, 12, 9), hm, headsO, heads);
    k.many(new T.SphereGeometry(0.034, 12, 9), hm, headsI, heads);
    const tl = k.many(new T.CylinderGeometry(0.007, 0.007, t * 0.42, 5), k.mat(0x7A3B4A, { bump: 0 }), tails);
    const core = k.mesh(new T.LatheGeometry(pts, 64, rot + open / 2, span), k.mat(o.core || 0x6FB7E8, { opacity: 0.55, side: T.DoubleSide, bump: 0.3 }));
    return { heads, tails: tl, core, at, L };
}

// A flat piece of bilayer (x from x0 to x1, z from z0 to z1), with gaps where proteins sit.
function flatBilayer(k, x0, x1, z0, z1, o = {}) {
    const T = k.THREE, sp = o.sp || 0.14, y = o.y || 0.42, heads = [], tails = [];
    for (let x = x0; x <= x1 + 1e-6; x += sp) for (let z = z0; z <= z1 + 1e-6; z += sp) {
        if (o.skip && o.skip(x, z)) continue;
        [1, -1].forEach((s) => {
            heads.push([x, s * y, z]);
            tails.push([x - 0.022, s * y * 0.6, z, 0, 0, 0.05 * s], [x + 0.022, s * y * 0.6, z, 0, 0, -0.05 * s]);
        });
    }
    const hm = k.many(new T.SphereGeometry(sp * 0.46, 16, 12), k.mat(o.head || 0x3663B0, { coat: 0.8, rough: 0.3, bump: 0.2 }), heads);
    const tm = k.many(new T.CylinderGeometry(0.011, 0.011, y * 0.7, 6), k.mat(o.tail || 0xC59BDB, { rough: 0.7, bump: 0 }), tails);
    return { hm, tm };
}

function arrow(k, from, to, color, r) {
    const T = k.THREE, a = new T.Vector3(...from), b = new T.Vector3(...to), d = b.clone().sub(a), L = d.length(), g = k.group();
    const m = k.mat(color, { coat: 0.6, bump: 0, glow: color });
    const shaft = k.mesh(new T.CylinderGeometry(r, r, L * 0.72, 12), m, g);
    shaft.position.y = L * 0.36;
    const head = k.mesh(new T.ConeGeometry(r * 2.6, L * 0.28, 16), m, g);
    head.position.y = L * 0.86;
    g.position.copy(a);
    g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return g;
}

function beakerGlass(k, r, h, parent) {
    const T = k.THREE;
    const prof = [[r * 0.02, 0], [r, 0], [r, h], [r * 1.06, h + 0.03], [r * 1.02, h + 0.05], [r * 0.95, h], [r * 0.95, 0.04], [r * 0.02, 0.04]].map((p) => new T.Vector2(p[0], p[1]));
    return k.mesh(new T.LatheGeometry(prof, 64), k.mat(0xDDEEFF, { clear: true, opacity: 0.22, side: T.DoubleSide }), parent);
}

export const MODELS = [
    // ---------- Diffusion ----------
    {
        id: 'diffusion', title: 'الانتشار', icon: 'wind',
        build(k) {
            const T = k.THREE, R = k.rnd(4), groups = [];
            const water = [], dye = [];
            const P = k.portrait, place = (i) => (P ? [0, (1 - i) * 1.75 - 0.5, 0] : [(i - 1) * 1.5, 0, 0]);
            [0, 1, 2].forEach((bi) => {
                const g = k.group();
                g.position.set(...place(bi));
                beakerGlass(k, 0.5, 1.3, g);
                const liq = k.mesh(new T.CylinderGeometry(0.46, 0.46, 0.95, 48), k.mat(0x5AA8E0, { clear: true, opacity: 0.38 }), g);
                liq.position.y = 0.52;
                const wl = [], dl = [];
                for (let i = 0; i < 46; i++) { const a = R() * 6.283, r = Math.sqrt(R()) * 0.38; wl.push([Math.cos(a) * r, 0.1 + R() * 0.85, Math.sin(a) * r]); }
                for (let i = 0; i < 40; i++) {
                    const a = R() * 6.283;
                    if (bi === 0) { const r = R() * 0.14; dl.push([Math.cos(a) * r, 0.08 + R() * 0.18 * (1 - r / 0.16), Math.sin(a) * r]); }
                    else if (bi === 1) { const r = Math.sqrt(R()) * (0.18 + 0.2 * R()); dl.push([Math.cos(a) * r, 0.08 + R() * 0.55, Math.sin(a) * r]); }
                    else { const r = Math.sqrt(R()) * 0.38; dl.push([Math.cos(a) * r, 0.1 + R() * 0.85, Math.sin(a) * r]); }
                }
                water.push(k.many(new T.SphereGeometry(0.028, 12, 9), k.mat(0x1E6B45, { coat: 0.8, bump: 0 }), wl, g));
                dye.push(k.many(new T.SphereGeometry(0.036, 14, 10), k.mat(0xD7263D, { coat: 0.9, rough: 0.25, bump: 0 }), dl, g));
                groups.push({ g, wl, dl });
            });
            const mid = (i, j, f) => { const a = place(i), b = place(j); return a.map((v, q) => v + (b[q] - v) * f + (q === 1 ? (P ? 0.65 : 0.7) : 0) + (q === 0 && P ? 0.75 : 0)); };
            const ar1 = arrow(k, mid(0, 1, 0.4), mid(0, 1, 0.6), 0x333333, 0.018), ar2 = arrow(k, mid(1, 2, 0.4), mid(1, 2, 0.6), 0x333333, 0.018);
            // molecules keep jiggling (random motion drives diffusion)
            const o = new T.Object3D();
            k.onFrame((t) => groups.forEach((G, bi) => {
                [[water[bi], G.wl], [dye[bi], G.dl]].forEach(([im, list]) => list.forEach((p, i) => {
                    o.position.set(p[0] + 0.012 * Math.sin(t * 3 + i * 1.7), p[1] + 0.012 * Math.sin(t * 2.6 + i), p[2] + 0.012 * Math.cos(t * 3.3 + i * 0.7));
                    o.updateMatrix(); im.setMatrixAt(i, o.matrix);
                }));
                water[bi].instanceMatrix.needsUpdate = true; dye[bi].instanceMatrix.needsUpdate = true;
            }));
            const off = (i, x, y, z) => { const b = place(i); return [b[0] + x, b[1] + y, b[2] + z]; };
            k.label('جزيئات الماء (المذيب)', 'جزيئات المادة التي يذوب فيها غيرها، تتحرك حركة عشوائية مستمرة.', off(0, 0.2, 0.8, 0.2), water);
            k.label('جزيئات الصبغة (المذاب)', 'المادة الذائبة، تبدأ متجمعة بتركيز عالي بمكان واحد.', off(0, 0, 0.2, 0.1), dye[0]);
            k.label('الانتشار', 'انتقال جزيئات المادة من المنطقة الأعلى تركيزاً إلى الأقل تركيزاً بدون صرف طاقة.', off(1, 0.1, 0.45, 0.2), dye[1]);
            k.label('حالة التوازن', 'تتوزع الجزيئات بالتساوي بكل المحلول، ويستمر تحركها العشوائي.', off(2, 0.1, 0.8, 0.2), dye[2]);
            k.label('اتجاه الزمن', 'نفس الكأس بعد مرور وقت.', mid(0, 1, 0.5), [ar1, ar2]);
            return { view: [0.15, 0.45, 1.6] };
        }
    },

    // ---------- Osmosis (thistle funnel) ----------
    {
        id: 'osmosis', title: 'الأزموزية (التنافذ)', icon: 'test-tube',
        build(k) {
            const T = k.THREE, R = k.rnd(8);
            beakerGlass(k, 0.95, 1.5);
            const water = k.mesh(new T.CylinderGeometry(0.91, 0.91, 1.25, 64), k.mat(0xF0A6CB, { clear: true, opacity: 0.32 }));
            water.position.y = 0.67;
            // thistle funnel: bell + long tube
            const fp = [[0.07, 2.85], [0.07, 1.05], [0.52, 0.32], [0.52, 0.3]].map((p) => new T.Vector2(p[0], p[1]));
            const funnel = k.mesh(new T.LatheGeometry(fp, 60), k.mat(0xDDEEFF, { clear: true, opacity: 0.25, side: T.DoubleSide }));
            const sp = [[0.001, 0.31], [0.5, 0.31], [0.058, 1.05], [0.058, 1.9], [0.001, 1.9]].map((p) => new T.Vector2(p[0], p[1]));
            const sol = k.mesh(new T.LatheGeometry(sp, 60), k.mat(0x2E8FC0, { clear: true, opacity: 0.6 }));
            const col = k.mesh(new T.CylinderGeometry(0.058, 0.058, 1, 24), sol.material);
            col.position.y = 1.9;
            const top = new T.Vector3(0, 1.9, 0);
            k.onFrame((t) => { const h = 0.05 + 0.75 * ((t * 0.08) % 1); col.scale.y = h; col.position.y = 1.9 + h / 2; top.y = 1.9 + h; });
            const mem = k.mesh(new T.CylinderGeometry(0.53, 0.53, 0.035, 60), k.mat(0x2F7A3A, { rough: 0.8, bump: 1.4, rep: 5 }));
            mem.position.y = 0.3;
            // water molecules crossing the membrane upward
            const mol = [];
            for (let i = 0; i < 30; i++) { const a = R() * 6.283, r = 0.1 + R() * 0.75; mol.push([Math.cos(a) * r, 0.1 + R() * 1.1, Math.sin(a) * r]); }
            const mm = k.many(new T.SphereGeometry(0.03, 12, 9), k.mat(0x5B2A86, { coat: 0.8, bump: 0 }), mol);
            const up = [];
            for (let i = 0; i < 14; i++) { const a = R() * 6.283, r = R() * 0.4; up.push([Math.cos(a) * r, 0, Math.sin(a) * r, R()]); }
            const um = k.many(new T.SphereGeometry(0.03, 12, 9), mm.material, up.map((p) => [p[0], 0.1, p[2]]));
            const o = new T.Object3D();
            k.onFrame((t) => { up.forEach((p, i) => { const u = (t * 0.25 + p[3]) % 1; o.position.set(p[0] * (1 - u * 0.6), 0.08 + u * 0.7, p[2] * (1 - u * 0.6)); o.updateMatrix(); um.setMatrixAt(i, o.matrix); }); um.instanceMatrix.needsUpdate = true; });
            const ar = k.group();
            ar.add(arrow(k, [-0.22, -0.05, 0.25], [-0.22, 0.22, 0.25], 0xC62828, 0.02));
            ar.add(arrow(k, [0.22, -0.05, 0.25], [0.22, 0.22, 0.25], 0xC62828, 0.02));
            ar.position.y = 0.05;
            k.label('ماء مقطر', 'ماء نقي تركيز الماء بيه عالي.', [0.7, 0.6, 0.45], water);
            k.label('قمع ثيسل', 'قمع مقلوب فتحته مسدودة بغشاء نصف ناضح.', [0.36, 0.55, 0.2], funnel);
            k.label('محلول سكري', 'محلول تركيز الماء بيه أقل من الماء المقطر.', [0.0, 0.7, 0.2], sol);
            k.label('غشاء نصف ناضح', 'يسمح بمرور جزيئات الماء ويمنع مرور جزيئات السكر الكبيرة.', [-0.45, 0.3, 0.2], mem);
            k.label('حركة الماء', 'الماء ينتقل من التركيز العالي للماء إلى الواطئ عبر الغشاء (الأزموزية).', [0.22, 0.2, 0.25], [ar, um]);
            k.label('ارتفاع مستوى المحلول', 'دخول الماء للقمع يرفع مستوى المحلول بالأنبوب.', top, col);
            return { view: [0.4, 0.35, 1.6] };
        }
    },

    // ---------- Tonicity: animal cells ----------
    {
        id: 'tonic-animal', title: 'التناضح في الخلية الحيوانية', icon: 'droplets',
        build(k) {
            const T = k.THREE;
            const cellM = (c) => k.mat(c, { coat: 0.7, rough: 0.35, sheen: 0.6, bump: 0.8, rep: 3 });
            const nucM = k.mat(0x1C1C3A, { coat: 0.6 });
            // normal
            const P = k.portrait, place = (i) => (P ? [0, (1 - i) * 1.55, 0] : [(i - 1) * 1.5, 0, 0]);
            const iso = k.group(); iso.position.set(...place(0));
            const c1 = k.mesh(k.blob(0.5, 0.3, 2.4, 60, 2), cellM(0x5A8FE0), iso); c1.scale.set(1, 0.8, 0.75);
            k.at(k.mesh(new T.SphereGeometry(0.1, 24, 18), nucM, iso), 0.05, 0, 0.3, 0, 0, 0, [1.2, 0.8, 0.6]);
            // swollen, bursting
            const hypo = k.group(); hypo.position.set(...place(1));
            const c2 = k.mesh(new T.SphereGeometry(0.62, 64, 48), k.mat(0x6A9BE8, { coat: 0.7, sheen: 0.6, bump: 0.6, clip: [k.cut(1, 0, 0, place(1)[0] + 0.45), k.cut(0, 1, 0, place(1)[1] - 0.25), k.cut(0, 0, 1, 0.1)], clipAll: true, side: T.DoubleSide }), hypo);
            k.at(k.mesh(new T.SphereGeometry(0.12, 24, 18), nucM, hypo), -0.05, -0.05, 0.2);
            const leak = k.many(new T.SphereGeometry(0.035, 10, 8), k.mat(0xE890C8, { coat: 0.8, bump: 0 }), [[0.62, 0.35, 0.25], [0.72, 0.42, 0.3], [0.68, 0.3, 0.28], [0.8, 0.45, 0.2], [0.84, 0.36, 0.32]], hypo);
            // shrunk, crenated
            const hyper = k.group(); hyper.position.set(...place(2));
            const c3 = k.mesh(k.blob(0.42, 0.75, 3.4, 72, 7), cellM(0x6A86D8), hyper); c3.scale.set(1, 0.85, 0.7);
            const arrows = k.group(), inA = k.group(), outA = k.group();
            const ring = (ci, n, inward, grp, col, a0) => {
                const [cx, cy] = place(ci);
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * 6.283 + a0, r0 = 0.92, r1 = 0.66, c = Math.cos(a), s = Math.sin(a);
                    const from = inward ? [cx + c * r0, cy + s * r0 * 0.8, 0.15] : [cx + c * r1, cy + s * r1 * 0.8, 0.15], to = inward ? [cx + c * r1, cy + s * r1 * 0.8, 0.15] : [cx + c * r0, cy + s * r0 * 0.8, 0.15];
                    grp.add(arrow(k, from, to, col, 0.018));
                }
            };
            ring(0, 2, true, inA, 0x2E9E4F, 0.4); ring(0, 2, false, outA, 0xC62828, 1.9);
            ring(1, 4, true, inA, 0x2E9E4F, 0.4); ring(1, 1, false, outA, 0xC62828, 0);
            ring(2, 1, true, inA, 0x2E9E4F, 1.2); ring(2, 4, false, outA, 0xC62828, 0.4);
            arrows.add(inA); arrows.add(outA);
            const at = (i, x, y, z) => { const b = place(i); return [b[0] + x, b[1] + y, b[2] + z]; };
            k.label('محلول متعادل التركيز', 'دخول الماء يساوي خروجه، فالخلية تبقى بحجمها (لا يحصل شيء).', at(0, 0, 0.36, 0.2), c1);
            k.label('محلول واطئ التركيز (انتفاخ)', 'يدخل الماء للخلية أكثر مما يخرج، فتنتفخ وقد تنفجر لأن ما عندها جدار.', at(1, -0.2, 0.5, 0.25), [c2, leak]);
            k.label('محلول عالي التركيز (انكماش)', 'يخرج الماء من الخلية أكثر مما يدخل، فتنكمش.', at(2, 0, 0.3, 0.2), c3);
            k.label('دخول الماء', 'الأسهم الخضراء: الماء داخل للخلية.', at(1, 0.6, 0.45, 0.15), inA);
            k.label('خروج الماء', 'الأسهم الحمراء: الماء طالع من الخلية.', at(2, -0.6, -0.45, 0.15), outA);
            return { view: [0.1, 0.35, 1.6] };
        }
    },

    // ---------- Tonicity: plant cells ----------
    {
        id: 'tonic-plant', title: 'التناضح في الخلية النباتية', icon: 'sprout',
        build(k) {
            const T = k.THREE;
            const hex = (w, h, d, bev) => {
                const s = new T.Shape();
                [[0, h], [w, h * 0.66], [w, -h * 0.66], [0, -h], [-w, -h * 0.66], [-w, h * 0.66]].forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
                s.closePath();
                const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 4 });
                g.translate(0, 0, -d / 2);
                g.computeVertexNormals();
                return g;
            };
            const wallM = k.mat(0x9BBF3A, { clip: [k.cut(0, 0, 1, 0.12)], side: T.DoubleSide, rough: 0.8, tex: 'fiber', rep: 3 });
            const cytoM = k.mat(0xF2A65A, { clear: true, opacity: 0.45, bump: 0.3 });
            const nucM = k.mat(0xC0282D, { coat: 0.8 }), plM = k.mat(0x2E7D32, { coat: 0.5 });
            const cells = [], parts = { wall: [], memb: [], vac: [], nuc: [], pl: [] };
            const P = k.portrait, place = (i) => (P ? [0, (1 - i) * 2.05, 0] : [(i - 1) * 1.5, 0, 0]);
            const rot = P ? Math.PI / 2 : 0;
            [[0, 'iso'], [1, 'hypo'], [2, 'hyper']].forEach(([ci, kind]) => {
                const g = k.group(); g.position.set(...place(ci)); g.rotation.z = rot;
                const w = k.mesh(hex(0.48, 0.9, 0.32, 0.05), wallM, g); parts.wall.push(w);
                const shrink = kind === 'hyper' ? 0.62 : kind === 'hypo' ? 0.97 : 0.9;
                const pr = kind === 'hyper' ? k.mesh(k.blob(0.5, 0.35, 2.2, 56, 5), k.mat(0xC77ACF, { clear: true, opacity: 0.55, bump: 0.3 }), g) : k.mesh(hex(0.48 * shrink, 0.9 * shrink, 0.22, 0.04), cytoM, g);
                if (kind === 'hyper') pr.scale.set(0.62, 1.0, 0.35);
                parts.memb.push(pr);
                const vs = kind === 'hypo' ? [0.33, 0.66] : kind === 'iso' ? [0.22, 0.48] : [0.12, 0.26];
                const vac = k.mesh(k.blob(1, 0.2, 2, 48, 3), k.mat(kind === 'hypo' ? 0x2FA7A0 : 0xE9D33A, { coat: 0.8, rough: 0.25, bump: 0.2 }), g);
                vac.scale.set(vs[0], vs[1], 0.12); vac.position.set(-0.05, 0, 0.02); parts.vac.push(vac);
                const n = k.mesh(new T.SphereGeometry(0.075, 20, 16), nucM, g); n.position.set(kind === 'hyper' ? 0.14 : 0.3, 0.1, 0.1); parts.nuc.push(n);
                const pls = [];
                for (let i = 0; i < 6; i++) pls.push([(kind === 'hyper' ? 0.2 : 0.34) * Math.cos(i * 1.1 + 0.5), (kind === 'hyper' ? 0.45 : 0.62) * Math.sin(i * 1.1 + 0.5), 0.1]);
                parts.pl.push(k.many(new T.SphereGeometry(0.04, 12, 9), plM, pls, g));
                cells.push(g);
            });
            const inA = k.group(), outA = k.group();
            const rv = (x, y) => (P ? [-y, x] : [x, y]);
            [[0, 1, 1], [1, 3, 0], [2, 0, 3]].forEach(([ci, nin, nout]) => {
                const [cx, cy] = place(ci);
                for (let i = 0; i < nin; i++) { const a = 0.6 + i * 2.1, p0 = rv(Math.cos(a) * 0.95, Math.sin(a) * 1.15), p1 = rv(Math.cos(a) * 0.62, Math.sin(a) * 0.8); inA.add(arrow(k, [cx + p0[0], cy + p0[1], 0.2], [cx + p1[0], cy + p1[1], 0.2], 0x2E9E4F, 0.018)); }
                for (let i = 0; i < nout; i++) { const a = 2.6 + i * 2.1, p0 = rv(Math.cos(a) * 0.5, Math.sin(a) * 0.7), p1 = rv(Math.cos(a) * 0.9, Math.sin(a) * 1.1); outA.add(arrow(k, [cx + p0[0], cy + p0[1], 0.2], [cx + p1[0], cy + p1[1], 0.2], 0xC62828, 0.018)); }
            });
            const wp = (o) => { o.updateWorldMatrix(true, false); return new T.Vector3().setFromMatrixPosition(o.matrixWorld); };
            const near = (o, x, y, z) => { o.updateWorldMatrix(true, false); return new T.Vector3(x, y, z).applyMatrix4(o.matrixWorld); };
            k.label('جدار الخلية', 'جدار صلب يمنع الخلية النباتية من الانفجار.', near(cells[2], 0.47, 0.3, 0.2), parts.wall);
            k.label('غشاء الخلية', 'يحيط بالسايتوبلازم تحت الجدار.', near(cells[0], 0.4, -0.5, 0.18), parts.memb[0]);
            k.label('الفجوة المركزية', 'تكبر عند دخول الماء وتصغر عند خروجه.', near(cells[0], -0.05, 0.2, 0.1), parts.vac[0]);
            k.label('النواة', 'نواة الخلية.', wp(parts.nuc[0]), parts.nuc[0]);
            k.label('البلاستيدات', 'البلاستيدات الخضراء بالسايتوبلازم.', near(cells[0], 0.34 * Math.cos(0.5), 0.62 * Math.sin(0.5), 0.14), parts.pl[0]);
            k.label('الانتفاخ (محلول واطئ التركيز)', 'يدخل الماء فتنتفخ الفجوة وتضغط على الجدار (امتلاء)، لكن الجدار يمنع الانفجار.', near(cells[1], 0, 0.5, 0.15), parts.vac[1]);
            k.label('البلزمة (محلول عالي التركيز)', 'يخرج الماء فينكمش السايتوبلازم وينفصل الغشاء عن الجدار.', near(cells[2], 0.12, -0.3, 0.12), parts.memb[2]);
            k.label('دخول وخروج الماء', 'الأخضر دخول الماء للخلية، والأحمر خروجه منها.', inA.children[0] ? wp(inA.children[0]) : [0, 0, 0], [inA, outA]);
            return { view: [0.1, 0.2, 1.6] };
        }
    },

    // ---------- Active transport ----------
    {
        id: 'active', title: 'النقل الفعال', icon: 'zap',
        build(k) {
            const T = k.THREE, R = k.rnd(6);
            const car = [[-0.8, 0.1], [0.05, -0.1], [0.85, 0.15]];
            const lip = flatBilayer(k, -1.4, 1.4, -0.55, 0.55, { head: 0xE5C84A, tail: 0x9C6B3C, skip: (x, z) => car.some((c) => Math.hypot(c[0] - x, c[1] - z) < 0.36) });
            const pm = k.mat(0xF0A35E, { coat: 0.6, rough: 0.4, bump: 0.9 }), carriers = k.group(), halves = [];
            car.forEach(([x, z], i) => {
                const g = k.group(carriers); g.position.set(x, 0, z);
                [-1, 1].forEach((s) => {
                    const h = k.mesh(k.blob(1, 0.18, 2.4, 40, i * 3 + s + 5), pm, g);
                    h.scale.set(0.13, 0.52, 0.2); h.position.x = s * 0.14; h.rotation.z = -s * 0.25;
                    halves.push({ h, s, i });
                });
            });
            // ions: few above (low concentration), many below (high)
            const ionM = k.mat(0xDDE7F5, { coat: 1, rough: 0.15, bump: 0, sheen: 0.8 });
            const up = [], low = [];
            for (let i = 0; i < 14; i++) up.push([(R() - 0.5) * 2.6, 0.75 + R() * 0.5, (R() - 0.5) * 1.1]);
            for (let i = 0; i < 70; i++) low.push([(R() - 0.5) * 2.6, -0.7 - R() * 0.6, (R() - 0.5) * 1.1]);
            const ionsUp = k.many(new T.SphereGeometry(0.06, 16, 12), ionM, up);
            const ionsLow = k.many(new T.SphereGeometry(0.06, 16, 12), ionM, low);
            const mover = k.mesh(new T.SphereGeometry(0.07, 18, 14), ionM);
            const atp = k.mesh(new T.SphereGeometry(0.1, 24, 18), k.mat(0xFFC83A, { glow: 0xFFB000, coat: 1, bump: 0 }));
            k.onFrame((t) => {
                const u = (t * 0.3) % 1, c = car[1];
                mover.position.set(c[0], 0.85 - u * 1.7, c[1]);
                const open = Math.max(0, Math.sin(u * Math.PI));
                halves.filter((q) => q.i === 1).forEach((q) => { q.h.rotation.z = -q.s * (0.25 - 0.2 * open); q.h.position.x = q.s * (0.14 + 0.04 * open); });
                atp.position.set(c[0] + 0.45, 0.62 - 0.1 * Math.sin(t * 3), c[1] + 0.2);
                atp.material.emissiveIntensity = 0.4 + 0.5 * open;
            });
            k.label('أيونات', 'دقائق مشحونة تنتقل عبر الغشاء.', up[2], ionsUp);
            k.label('بروتين حامل', 'بروتين بالغشاء يرتبط بالأيون وينقله للجهة الثانية.', [car[0][0] + 0.15, 0.3, car[0][1] + 0.2], carriers);
            k.label('طاقة', 'النقل الفعال يحتاج طاقة (ATP) لأنه عكس اتجاه التركيز.', atp.position, atp);
            k.label('تركيز أعلى للأيونات', 'الأيونات تنتقل من الواطئ للأعلى تركيزاً، عكس الانتشار.', low[4], ionsLow);
            k.label('الغشاء البلازمي', 'طبقتين من الدهون المفسفرة تتخللها البروتينات.', [-1.2, 0.42, 0.5], lip.hm);
            return { view: [0.3, 0.45, 1.5] };
        }
    },

    // ---------- Phagocytosis ----------
    {
        id: 'phago', title: 'البلعمة (الأكل الخلوي)', icon: 'utensils',
        build(k) {
            const T = k.THREE;
            const cup = [];
            for (let i = 0; i <= 40; i++) { const a = -Math.PI / 2 + (i / 40) * (Math.PI / 2 + 0.87); cup.push([0.45 * Math.cos(a) + 0.01, 0.45 * Math.sin(a)]); }
            const tail = [[0.33, 0.42], [0.45, 0.48], [0.7, 0.5], [1.0, 0.5], [1.3, 0.5]];
            const g = k.group(); g.position.x = -0.75; g.rotation.z = Math.PI / 2;
            const mem = revoBilayer(k, cup.concat(tail).map((p) => [p[0], p[1]]), { open: 1.6, rot: Math.PI / 2 });
            [mem.heads, mem.tails, mem.core].forEach((o) => g.add(o));
            const food = k.mesh(k.blob(0.2, 0.7, 5, 64, 3), k.mat(0xE0484F, { coat: 0.5, rough: 0.55, bump: 1.2, rep: 4 }));
            food.position.set(-0.78, 0, 0);
            const vac = k.group(); vac.position.x = 1.0;
            const ring = [];
            for (let i = 0; i <= 40; i++) { const a = -Math.PI / 2 + (i / 40) * Math.PI; ring.push([0.42 * Math.cos(a), 0.42 * Math.sin(a)]); }
            const vm = revoBilayer(k, ring, { open: 1.4 });
            [vm.heads, vm.tails, vm.core].forEach((o) => vac.add(o));
            const food2 = k.mesh(k.blob(0.18, 0.7, 5, 56, 9), food.material, vac);
            const ar = arrow(k, [0.1, 0, 0], [0.45, 0, 0], 0x222222, 0.022);
            k.label('غشاء بلازمي', 'الغشاء يتحدب ويحيط بدقيقة الغذاء الصلبة.', [-0.75 - 0.3, 0.9, 0.2], [mem.heads, mem.core]);
            k.label('الغذاء', 'دقيقة غذائية صلبة كبيرة.', [-0.78, 0.1, 0.15], food);
            k.label('فجوة غذائية', 'بعد ما ينغلق الغشاء تتكون فجوة غذائية داخل الخلية فيها الغذاء.', [1.0, 0.42, 0.1], [vm.heads, vm.core]);
            k.label('انغلاق الغشاء', 'حافتا الغشاء تلتقيان وتنفصل الفجوة للداخل.', [0.28, 0, 0], ar);
            return { view: [0.2, 0.35, 1.6] };
        }
    },

    // ---------- Pinocytosis ----------
    {
        id: 'pino', title: 'الشرب الخلوي', icon: 'droplet',
        build(k) {
            const T = k.THREE, R = k.rnd(5);
            const prof = [];
            for (let i = 0; i <= 30; i++) { const a = -Math.PI / 2 + (i / 30) * (Math.PI / 2 + 0.87); prof.push([0.28 * Math.cos(a) + 0.01, 0.28 * Math.sin(a)]); }
            [[0.21, 0.26], [0.3, 0.31], [0.5, 0.33], [0.85, 0.33], [1.15, 0.33]].forEach((p) => prof.push(p));
            const g = k.group(); g.position.x = -0.7; g.rotation.z = Math.PI / 2;
            const mem = revoBilayer(k, prof, { open: 1.6, rot: Math.PI / 2 });
            [mem.heads, mem.tails, mem.core].forEach((o) => g.add(o));
            const liquid = k.mesh(new T.SphereGeometry(0.22, 32, 24), k.mat(0x6CC6D9, { glass: true, thick: 0.4, atten: 0.5, bump: 0.2 }));
            liquid.position.set(-0.72, 0, 0);
            const drops = [];
            for (let i = 0; i < 22; i++) drops.push([-1.2 - R() * 0.35, (R() - 0.5) * 0.5, (R() - 0.5) * 0.5]);
            for (let i = 0; i < 12; i++) drops.push([-0.72 + (R() - 0.5) * 0.25, (R() - 0.5) * 0.25, (R() - 0.5) * 0.25]);
            const dm = k.many(new T.SphereGeometry(0.03, 12, 9), k.mat(0x0E6E6E, { coat: 0.8, bump: 0 }), drops);
            const ves = k.group(); ves.position.x = 0.9;
            const ring = [];
            for (let i = 0; i <= 30; i++) { const a = -Math.PI / 2 + (i / 30) * Math.PI; ring.push([0.3 * Math.cos(a), 0.3 * Math.sin(a)]); }
            const vm = revoBilayer(k, ring, { open: 1.4 });
            [vm.heads, vm.tails, vm.core].forEach((o) => ves.add(o));
            k.at(k.mesh(new T.SphereGeometry(0.13, 28, 20), liquid.material, ves), 0, 0, 0);
            k.label('غشاء بلازمي', 'يتحدب للداخل ويحيط بقطرة سائلة.', [-0.7 - 0.2, 0.85, 0.2], [mem.heads, mem.core]);
            k.label('مادة سائلة', 'سائل فيه مواد ذائبة تسحبه الخلية.', [-1.3, 0.1, 0.1], [dm, liquid]);
            k.label('حويصلة', 'كيس صغير يتكون من الغشاء ويدخل السائل للخلية.', [0.9, 0.3, 0.1], [vm.heads, vm.core]);
            return { view: [0.2, 0.35, 1.6] };
        }
    },

    // ---------- Exocytosis ----------
    {
        id: 'exo', title: 'الإخراج الخلوي', icon: 'log-out',
        build(k) {
            const T = k.THREE, R = k.rnd(12);
            // the cell's surface seen as a disc, with a vesicle fusing and opening upward
            const prof = [];
            for (let i = 0; i <= 18; i++) { const a = Math.PI + (i / 18) * (Math.PI / 2); prof.push([0.26 + 0.26 * Math.cos(a) + 0.26, -0.26 + 0.26 * Math.sin(a) + 0.26 - 0.26]); }
            const mprof = [[0.001, -0.5], [0.12, -0.5]].concat([[0.22, -0.46], [0.3, -0.35], [0.34, -0.2], [0.38, -0.06], [0.48, 0], [0.8, 0], [1.2, 0], [1.6, 0]]);
            const mem = revoBilayer(k, mprof, { open: 1.8, rot: 0.3, head: 0xE3B24F });
            const cargo = k.mesh(new T.SphereGeometry(0.14, 28, 20), k.mat(0x7CC57C, { glass: true, thick: 0.3, atten: 0.5 }));
            cargo.position.set(0, -0.3, 0);
            const out = [];
            for (let i = 0; i < 26; i++) out.push([(R() - 0.5) * 0.5, 0.2 + R() * 0.6, (R() - 0.5) * 0.5]);
            const om = k.many(new T.SphereGeometry(0.025, 10, 8), k.mat(0x222222, { bump: 0 }), out);
            const nv = k.group(); nv.position.set(0.2, -1.05, 0.6);
            const ring = [];
            for (let i = 0; i <= 26; i++) { const a = -Math.PI / 2 + (i / 26) * Math.PI; ring.push([0.28 * Math.cos(a), 0.28 * Math.sin(a)]); }
            const vm = revoBilayer(k, ring, { open: 1.4, head: 0xE3B24F });
            [vm.heads, vm.tails, vm.core].forEach((o) => nv.add(o));
            k.at(k.mesh(new T.SphereGeometry(0.12, 24, 18), k.mat(0x2F6F9C, { glass: true, thick: 0.3, atten: 0.5 }), nv), 0, 0, 0);
            const ar = arrow(k, [0.2, -0.72, 0.6], [0.1, -0.45, 0.3], 0x222222, 0.02);
            k.onFrame((t) => { nv.position.y = -1.05 + 0.05 * Math.sin(t * 1.4); });
            k.label('غشاء بلازمي', 'الغشاء الخارجي للخلية تندمج بيه الحويصلة.', [1.2, 0.07, 0.2], [mem.heads, mem.core]);
            k.label('حويصلة إفرازية', 'كيس فيه مواد تريد الخلية تطلعها، يتحرك للغشاء ويندمج بيه.', [0.2, -0.85, 0.6], [vm.heads, vm.core]);
            k.label('مواد مفرزة', 'المواد تطلع لخارج الخلية بعد اندماج الحويصلة.', out[3], om);
            k.label('خارج الخلية', 'فوق الغشاء.', [-1.2, 0.8, 0], []);
            k.label('داخل الخلية', 'تحت الغشاء (السايتوبلازم).', [-1.2, -0.8, 0], []);
            return { view: [0.4, 0.5, 1.5] };
        }
    }
];
