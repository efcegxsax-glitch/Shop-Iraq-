// 3D biology diagrams, part 3: mitosis, one cell that moves through the phases.

const STEPS = [
    ['الطور البيني المتأخر', 'الخلية تجهز نفسها: تتضاعف المادة الوراثية (الكروماتين) والجسيمات المركزية، والغلاف النووي والنوية واضحة.'],
    ['الطور التمهيدي', 'يتكثف الكروماتين ويظهر ككروموسومات، كل واحد من كروماتيدين، وتبدأ ألياف المغزل بالتكوّن ويتجه الجسيمان المركزيان للقطبين.'],
    ['الطور الاستوائي الأول', 'يختفي الغلاف النووي والنوية، وتتصل ألياف المغزل بالقطع المركزية للكروموسومات.'],
    ['الطور الاستوائي', 'تترتب الكروموسومات على خط استواء الخلية، وكل كروموسوم متصل بألياف من القطبين.'],
    ['الطور الانفصالي', 'تنفصل الكروماتيدات الشقيقة وتسحبها ألياف المغزل نحو القطبين المتقابلين.'],
    ['الطور النهائي', 'تصل الكروموسومات للقطبين، ويتكون غلاف نووي جديد حول كل مجموعة، وتظهر النوية.'],
    ['الانقسام السايتوبلازمي', 'ينخصر الغشاء من الوسط (أخدود الانشطار) حتى ينقسم السايتوبلازم.'],
    ['الطور البيني المبكر', 'تنتج خليتان بنويتان متشابهتان، كل وحدة بنفس عدد كروموسومات الخلية الأم.']
];

function chromatid(k, len, r, bend) {
    const T = k.THREE, rings = 70, radial = 12;
    const curve = new T.CatmullRomCurve3([new T.Vector3(bend, len / 2, 0), new T.Vector3(0, 0.06, 0), new T.Vector3(0, -0.06, 0), new T.Vector3(bend, -len / 2, 0)]);
    const g = new T.TubeGeometry(curve, rings, r, radial, false), pos = g.attributes.position, v = new T.Vector3(), c = new T.Vector3();
    for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        curve.getPointAt(t, c);
        const f = (1 + 0.12 * Math.sin(i * 1.3)) * Math.min(1, Math.sin(Math.PI * t) * 3 + 0.3) * (0.6 + 0.4 * Math.min(1, Math.abs(t - 0.5) * 4));
        for (let j = 0; j <= radial; j++) { const idx = i * (radial + 1) + j; v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(f).add(c); pos.setXYZ(idx, v.x, v.y, v.z); }
    }
    g.computeVertexNormals();
    return g;
}

export const MODELS = [
    {
        id: 'mitosis', title: 'أطوار الانقسام الخيطي', icon: 'git-fork',
        build(k) {
            const T = k.THREE, R = k.rnd(21), lerp = (a, b, f) => a + (b - a) * f;
            // the cell: one sphere whose shape stretches and pinches between the phases
            const cellGeo = new T.SphereGeometry(1, 80, 60), base = cellGeo.attributes.position.array.slice();
            const cell = k.mesh(cellGeo, k.mat(0xF6B874, { clear: true, opacity: 0.32, bump: 0.3, rep: 3 }));
            const memb = k.mesh(cellGeo, k.mat(0xE08A3C, { opacity: 0.22, side: T.BackSide, bump: 0.4 }));
            const cell2 = k.mesh(new T.SphereGeometry(0.72, 60, 44), cell.material); cell2.visible = false;
            const cell3 = k.mesh(new T.SphereGeometry(0.72, 60, 44), cell.material); cell3.visible = false;
            cell2.position.x = -1.0; cell3.position.x = 1.0;
            // nuclear envelopes (one in the middle, two when the cell divides)
            const envM = k.mat(0x3B6FD6, { clear: true, opacity: 0.35, bump: 0.5, rep: 4 });
            const env = k.mesh(new T.SphereGeometry(0.46, 48, 36), envM);
            const envA = k.mesh(new T.SphereGeometry(0.3, 40, 30), envM), envB = k.mesh(new T.SphereGeometry(0.3, 40, 30), envM);
            const nucleolus = k.mesh(new T.SphereGeometry(0.1, 24, 18), k.mat(0x28305E, { coat: 0.7 }));
            const nlA = k.mesh(new T.SphereGeometry(0.07, 20, 14), nucleolus.material), nlB = k.mesh(new T.SphereGeometry(0.07, 20, 14), nucleolus.material);
            // chromatin threads (interphase)
            const chromM = k.mat(0x2E7D4F, { coat: 0.6 });
            const thread = (cx, rad, n) => { const pts = []; let p = new T.Vector3(cx, 0, 0); for (let i = 0; i < n; i++) { p = p.clone().add(new T.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.2)); const o = p.clone().sub(new T.Vector3(cx, 0, 0)); if (o.length() > rad) p = new T.Vector3(cx, 0, 0).add(o.setLength(rad * R())); pts.push([p.x, p.y, p.z]); } return k.mesh(k.tube(pts, 0.012, n * 8, false, 6), chromM); };
            const chromatin = thread(0, 0.36, 60), chromA = thread(-0.95, 0.22, 36), chromB = thread(0.95, 0.22, 36);
            // four chromosomes, each two sister chromatids that can separate
            const colors = [0x2E7D4F, 0x3F51B5, 0x2E7D4F, 0x3F51B5];
            const cen = k.mat(0xD62B2B, { coat: 0.9, bump: 0 });
            const chroms = [];
            for (let i = 0; i < 4; i++) {
                const m = k.mat(colors[i], { coat: 0.7, rough: 0.35, bump: 0.7, rep: 3 }), L = 0.36 + (i % 2) * 0.1;
                const a = k.mesh(chromatid(k, L, 0.045, -0.05), m), b = k.mesh(chromatid(k, L, 0.045, 0.05), m);
                const c = k.mesh(new T.SphereGeometry(0.035, 14, 10), cen);
                const pro = [(R() - 0.5) * 0.4, (R() - 0.5) * 0.4, (R() - 0.5) * 0.3], rot = [R() * 3, R() * 3, R() * 3];
                const metY = -0.42 + i * 0.28, metZ = (i % 2 ? 0.12 : -0.12);
                chroms.push({ a, b, c, pro, rot, metY, metZ, cur: { ax: pro[0], bx: pro[0], y: pro[1], z: pro[2], rx: rot[0], ry: rot[1], sep: 0.05, sc: 0 } });
            }
            const centM = k.mat(0x8E5AA8, { coat: 0.5 });
            const pole = (x) => { const g = k.group(); for (let j = 0; j < 2; j++) { const c = k.mesh(new T.CylinderGeometry(0.03, 0.03, 0.12, 12), centM, g); c.rotation.set(j ? Math.PI / 2 : 0, 0, 0); c.position.x = j * 0.06; } g.position.x = x; return g; };
            const poleA = pole(-0.2), poleB = pole(0.2);
            // spindle fibres
            const spG = new T.BufferGeometry(), spPos = new Float32Array(4 * 2 * 2 * 3 + 12 * 2 * 3);
            spG.setAttribute('position', new T.BufferAttribute(spPos, 3));
            const spindle = new T.LineSegments(spG, new T.LineBasicMaterial({ color: 0x8C6A3F, transparent: true, opacity: 0.8 }));
            k.group().add(spindle);
            const furrow = new T.Vector3(0, 0.55, 0.55);
            // state per phase: stretch, pinch, separation, envelope, fibres...
            const S = [
                { st: 1.0, pin: 0, env: 1, twin: 0, spin: 0, chr: 0, poles: 0.2 },
                { st: 1.05, pin: 0, env: 0.7, twin: 0, spin: 0.35, chr: 1, poles: 0.75 },
                { st: 1.1, pin: 0, env: 0, twin: 0, spin: 0.8, chr: 2, poles: 1.0 },
                { st: 1.15, pin: 0, env: 0, twin: 0, spin: 1, chr: 3, poles: 1.05 },
                { st: 1.3, pin: 0.05, env: 0, twin: 0, spin: 1, chr: 4, poles: 1.2 },
                { st: 1.42, pin: 0.3, env: 0, twin: 1, spin: 0.5, chr: 5, poles: 1.3 },
                { st: 1.5, pin: 0.72, env: 0, twin: 1, spin: 0.15, chr: 5, poles: 1.35 },
                { st: 1.5, pin: 1, env: 0, twin: 1, spin: 0, chr: 6, poles: 1.35 }
            ];
            let target = S[0], cur = Object.assign({}, S[0]), step = 0;
            const setStep = (i) => { step = i; target = S[i]; };
            const pv = new T.Vector3();
            k.onFrame(() => {
                ['st', 'pin', 'env', 'twin', 'spin', 'poles'].forEach((q) => { cur[q] = lerp(cur[q], target[q], 0.08); });
                // cell shape
                const p = cellGeo.attributes.position, sep = (cur.st - 1) * 0.9;
                for (let i = 0; i < p.count; i++) {
                    const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
                    const nx = x * (1 + (cur.st - 1) * 0.4) + sep * Math.tanh(x * 4) * 0.5;
                    const f = 1 - cur.pin * 0.97 * Math.exp(-Math.pow(nx / 0.32, 2));
                    p.setXYZ(i, nx, y * f * 0.82, z * f * 0.82);
                }
                p.needsUpdate = true;
                cellGeo.computeVertexNormals();
                const split = step === 7;
                cell.visible = memb.visible = !split;
                cell2.visible = cell3.visible = split;
                cell2.position.set(-1.0, 0, 0); cell3.position.set(1.0, 0, 0);
                cell2.scale.set(1, 0.85, 0.85); cell3.scale.set(1, 0.85, 0.85);
                // envelopes
                env.visible = nucleolus.visible = cur.env > 0.05;
                env.scale.setScalar(0.6 + 0.4 * cur.env);
                const tw = cur.twin > 0.05 && step >= 5;
                envA.visible = envB.visible = nlA.visible = nlB.visible = tw;
                envA.scale.setScalar(Math.max(0.01, cur.twin)); envB.scale.setScalar(Math.max(0.01, cur.twin));
                const cx = step === 7 ? 1.0 : 0.95;
                envA.position.x = -cx; envB.position.x = cx; nlA.position.set(-cx + 0.05, 0.05, 0.1); nlB.position.set(cx - 0.05, 0.05, 0.1);
                chromatin.visible = step === 0;
                chromA.visible = chromB.visible = step === 7;
                chromA.position.x = step === 7 ? -0.05 : 0; chromB.position.x = step === 7 ? 0.05 : 0;
                // poles
                poleA.position.x = -cur.poles; poleB.position.x = cur.poles;
                poleA.position.y = poleB.position.y = step === 0 ? 0.6 : 0;
                // chromosomes
                chroms.forEach((c, i) => {
                    const show = step >= 1 && step <= 6;
                    c.a.visible = c.b.visible = show; c.c.visible = show && step <= 3;
                    let ax, bx, y, z, rx, ry, sep2, sc = show ? 1 : 0;
                    if (step <= 2) { ax = bx = c.pro[0] * (step === 2 ? 1.5 : 1); y = c.pro[1] * (step === 2 ? 1.5 : 1); z = c.pro[2]; rx = c.rot[0]; ry = c.rot[1]; sep2 = 0.05; }
                    else if (step === 3) { ax = bx = 0; y = c.metY; z = c.metZ; rx = 0; ry = Math.PI / 2; sep2 = 0.05; }
                    else if (step === 4) { ax = -0.62; bx = 0.62; y = c.metY * 0.7; z = c.metZ; rx = 0; ry = Math.PI / 2; sep2 = 0; }
                    else { ax = -0.95; bx = 0.95; y = c.metY * 0.4; z = c.metZ * 0.6; rx = 0.6; ry = Math.PI / 2; sep2 = 0; sc = step >= 5 ? 0.6 : 1; }
                    const q = c.cur, f = 0.07;
                    q.ax = lerp(q.ax, ax, f); q.bx = lerp(q.bx, bx, f); q.y = lerp(q.y, y, f); q.z = lerp(q.z, z, f); q.rx = lerp(q.rx, rx, f); q.ry = lerp(q.ry, ry, f); q.sep = lerp(q.sep, sep2, f); q.sc = lerp(q.sc, sc, f);
                    c.a.position.set(q.ax - q.sep, q.y, q.z); c.b.position.set(q.bx + q.sep, q.y, q.z);
                    c.a.rotation.set(q.rx, q.ry, 0); c.b.rotation.set(q.rx, q.ry, 0);
                    c.a.scale.setScalar(Math.max(0.01, q.sc)); c.b.scale.setScalar(Math.max(0.01, q.sc));
                    c.c.position.set((q.ax + q.bx) / 2, q.y, q.z);
                });
                // fibres from each pole to each chromatid
                let n = 0;
                const put = (a, b) => { spPos[n++] = a.x; spPos[n++] = a.y; spPos[n++] = a.z; spPos[n++] = b.x; spPos[n++] = b.y; spPos[n++] = b.z; };
                const PA = poleA.position, PB = poleB.position;
                chroms.forEach((c) => { put(PA, c.a.position); put(PB, c.b.position); });
                for (let j = 0; j < 12; j++) { const a = (j / 12) * Math.PI * 2; pv.set(0, Math.cos(a) * 0.55, Math.sin(a) * 0.45); put(PA, pv); put(PB, pv); }
                spG.attributes.position.needsUpdate = true;
                spindle.material.opacity = 0.85 * cur.spin;
                spindle.visible = cur.spin > 0.03;
            });
            const c0 = chroms[1];
            k.label('الغلاف النووي', 'غشاء يحيط بالنواة، يختفي أثناء الانقسام ويرجع يتكون بالطور النهائي.', [0.3, 0.3, 0.22], env, [0, 1]);
            k.label('النوية', 'جسم داخل النواة، يختفي أثناء الانقسام.', [0, 0, 0.1], nucleolus, [0]);
            k.label('الكروماتين', 'المادة الوراثية بشكل خيوط رفيعة قبل ما تتكثف.', [0.2, -0.15, 0.1], chromatin, [0]);
            k.label('مريكزا الجسيم المركزي', 'زوج من الأجسام الأسطوانية، يتجهان للقطبين وتنشأ منهما ألياف المغزل.', poleA.position, [poleA, poleB], [0, 1, 2, 3, 4]);
            k.label('كروموسوم', 'مادة وراثية متكثفة، كل كروموسوم من كروماتيدين شقيقين.', c0.a.position, chroms.map((c) => [c.a, c.b]).flat(), [1, 2, 3]);
            k.label('ألياف المغزل', 'خيوط بروتينية تمتد من القطبين وتتصل بالكروموسومات وتسحبها.', poleB.position, spindle, [1, 2, 3, 4, 5]);
            k.label('القطعة المركزية', 'مكان ارتباط الكروماتيدين، تتصل بيه ألياف المغزل.', c0.c.position, chroms.map((c) => c.c), [3]);
            k.label('خط الاستواء', 'الكروموسومات مصطفة بمستوى واحد بوسط الخلية.', [0, 0.62, 0], chroms.map((c) => [c.a, c.b]).flat(), [3]);
            k.label('الكروماتيدات المنفصلة', 'كل كروماتيد صار كروموسوم مستقل ويتجه لقطب.', c0.a.position, chroms.map((c) => [c.a, c.b]).flat(), [4, 5]);
            k.label('غلاف نووي جديد', 'يتكون حول كل مجموعة كروموسومات عند القطبين.', envB.position, [envA, envB], [5, 6]);
            k.label('أخدود الانشطار', 'انخصار الغشاء من الوسط يقسم السايتوبلازم إلى قسمين.', furrow, cell, [6]);
            k.label('خليتان بنويتان', 'كل خلية فيها نفس عدد كروموسومات الأم.', [1.0, 0.6, 0.3], [cell2, cell3], [7]);
            return { view: [0.2, 0.35, 1.6], steps: STEPS, setStep };
        }
    }
];
