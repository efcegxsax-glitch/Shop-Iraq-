// Admission calculator (حاسبة القبول): loaded on demand by app._need('uni'), and by admin.html
// for its defaults. A college's cut-off at a university = the college's base mark + the
// university's offset, plus the "outside" mark when the university is not in the student's
// province (students get priority in their own province). The admin panel overrides any of
// these numbers in admission/{base, off, outside, note}; the defaults below are estimates.
(function () {
    const UNI_DATA = {
        outside: 1.2,
        // [id, name, base, icon, color, group]
        colleges: [
            ['med', 'الطب', 98.2, 'stethoscope', '#DC2626', 'med'],
            ['dent', 'طب الأسنان', 97.3, 'smile', '#0EA5E9', 'med'],
            ['pharm', 'الصيدلة', 96.4, 'pill', '#16A34A', 'med'],
            ['lab', 'التحليلات المرضية', 91, 'test-tube', '#9333EA', 'med'],
            ['nurs', 'التمريض', 89.5, 'heart-pulse', '#E11D48', 'med'],
            ['vet', 'الطب البيطري', 86, 'paw-print', '#B45309', 'med'],
            ['e_pet', 'هندسة النفط', 93, 'fuel', '#0F172A', 'eng'],
            ['e_bio', 'الهندسة الطبية', 92, 'activity', '#DB2777', 'eng'],
            ['e_comp', 'هندسة الحاسوب والاتصالات', 91, 'cpu', '#2563EB', 'eng'],
            ['e_elec', 'الهندسة الكهربائية', 90.5, 'zap', '#EAB308', 'eng'],
            ['e_arch', 'الهندسة المعمارية', 89, 'building-2', '#7C3AED', 'eng'],
            ['e_civ', 'الهندسة المدنية', 88, 'construction', '#EA580C', 'eng'],
            ['e_mech', 'الهندسة الميكانيكية', 87.5, 'cog', '#475569', 'eng'],
            ['cs', 'علوم الحاسوب', 84, 'monitor', '#0891B2', 'sci'],
            ['s_bio', 'علوم الأحياء', 78, 'leaf', '#22C55E', 'sci'],
            ['s_chem', 'الكيمياء', 74, 'flask-conical', '#EC4899', 'sci'],
            ['s_math', 'الرياضيات', 70, 'sigma', '#8B5CF6', 'sci'],
            ['s_phys', 'الفيزياء', 70, 'atom', '#06B6D4', 'sci'],
            ['law', 'القانون', 83, 'scale', '#1E40AF', 'hum'],
            ['econ', 'الإدارة والاقتصاد', 72, 'briefcase', '#0D9488', 'hum'],
            ['edu', 'التربية للعلوم الصرفة', 66, 'graduation-cap', '#6366F1', 'hum'],
            ['agri', 'الزراعة', 60, 'sprout', '#65A30D', 'hum'],
            ['pe', 'التربية البدنية', 60, 'dumbbell', '#F97316', 'hum']
        ],
        // [id, name, province, offset, only these colleges (optional)]
        unis: [
            ['bgd', 'جامعة بغداد', 'بغداد', 0.6],
            ['nah', 'جامعة النهرين', 'بغداد', 0.5],
            ['mus', 'الجامعة المستنصرية', 'بغداد', 0.3],
            ['tec', 'الجامعة التكنولوجية', 'بغداد', 0.3, ['e_pet', 'e_bio', 'e_comp', 'e_elec', 'e_arch', 'e_civ', 'e_mech', 'cs', 's_chem', 's_phys', 's_math']],
            ['bsr', 'جامعة البصرة', 'البصرة', 0.2],
            ['mos', 'جامعة الموصل', 'نينوى', 0.2],
            ['kuf', 'جامعة الكوفة', 'النجف', 0.2],
            ['bab', 'جامعة بابل', 'بابل', 0],
            ['ker', 'جامعة كربلاء', 'كربلاء', 0],
            ['qad', 'جامعة القادسية', 'القادسية', -0.1],
            ['dhq', 'جامعة ذي قار', 'ذي قار', -0.2],
            ['anb', 'جامعة الأنبار', 'الأنبار', -0.2],
            ['tik', 'جامعة تكريت', 'صلاح الدين', -0.2],
            ['krk', 'جامعة كركوك', 'كركوك', -0.3],
            ['dya', 'جامعة ديالى', 'ديالى', -0.3],
            ['was', 'جامعة واسط', 'واسط', -0.3],
            ['mys', 'جامعة ميسان', 'ميسان', -0.5],
            ['mth', 'جامعة المثنى', 'المثنى', -0.5]
        ],
        // Private (أهلي) colleges: college id -> [minimum average set by the ministry, yearly fee in million IQD]
        priv: {
            med: [92, 12], dent: [90, 9], pharm: [88, 7], lab: [80, 3.5], nurs: [75, 2.5],
            e_pet: [75, 4], e_bio: [72, 3.5], e_comp: [70, 3], e_elec: [70, 3], e_arch: [70, 3.5], e_civ: [70, 3], e_mech: [70, 3],
            cs: [65, 2], law: [70, 2], econ: [60, 1.5]
        },
        groups: [['med', 'المجموعة الطبية', 'stethoscope'], ['eng', 'الهندسة', 'hard-hat'], ['sci', 'العلوم والحاسوب', 'atom'], ['hum', 'كليات ثانية', 'landmark']]
    };
    window.UNI_DATA = UNI_DATA;
    if (typeof app === 'undefined') return;

    const KEY = 'isp_uni', SAFE = 0.5, NEAR = -0.5;
    const ST = {
        safe: ['مضمون', '#16A34A', 'shield-check'],
        maybe: ['ممكن', '#D97706', 'circle-help'],
        hard: ['صعب', '#DC2626', 'mountain']
    };
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const r1 = (x) => Math.round(x * 10) / 10;
    const fmt = (x) => r1(x).toFixed(1);
    const fee = (m) => (m >= 1 ? r1(m) + ' مليون' : Math.round(m * 1000) + ' ألف') + ' دينار';
    const num = (v, d) => { const n = Number(v); return isFinite(n) ? n : d; };

    // private admission depends on seats too, so it is never called "guaranteed"
    const lbl = (k) => (app._un && app._un.kind === 'priv' ? { safe: 'تكدر تقدّم', hard: 'تحت الحد', maybe: ST.maybe[0] }[k] : ST[k][0]);

    Object.assign(app, {
        uniOpen() {
            let s = {};
            try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
            const u = this.currentUser || {};
            this._un = {
                avg: Math.min(100, Math.max(50, num(s.avg, 90))),
                gov: IRAQ_GOVERNORATES.indexOf(s.gov) !== -1 ? s.gov : (IRAQ_GOVERNORATES.indexOf(u.governorate) !== -1 ? u.governorate : 'بغداد'),
                dream: s.dream || '',
                kind: s.kind === 'priv' ? 'priv' : 'gov',
                f: 'all', open: ''
            };
            this._uniListen();
            this._uniRender(true);
        },

        _uniListen() {
            if (this._unListening || !window.firebaseDb || !window.firebaseDbHelpers) return;
            this._unListening = true;
            const { ref, onValue } = window.firebaseDbHelpers;
            onValue(ref(window.firebaseDb, 'admission'), (snap) => {
                this._unCfg = snap.val() || null;
                if (this.currentView === 'uniView' && this._un) this._uniRender(false);
            }, () => {});
        },

        _uniSave() {
            const s = this._un;
            try { localStorage.setItem(KEY, JSON.stringify({ avg: s.avg, gov: s.gov, dream: s.dream, kind: s.kind })); } catch (e) {}
        },

        // Private colleges: one national minimum each; at or above it the student can apply.
        _uniPriv() {
            const s = this._un, c = this._unCfg || {}, pmin = c.pmin || {}, fee = c.fee || {}, out = {};
            UNI_DATA.colleges.forEach(([id]) => {
                const d = UNI_DATA.priv[id];
                if (!d || pmin[id] === 0) return;
                const min = r1(num(pmin[id], d[0])), m = r1(s.avg - min);
                out[id] = { min, fee: num(fee[id], d[1]), m, st: m >= 0 ? 'safe' : 'hard' };
            });
            return out;
        },

        // Every college, with each university's cut-off for this student.
        _uniCalc() {
            const s = this._un, c = this._unCfg || {}, base = c.base || {}, off = c.off || {}, priv = this._uniPriv();
            if (s.kind === 'priv') {
                return UNI_DATA.colleges.filter(([id]) => priv[id]).map(([id, name, , ic, col, grp]) => {
                    const p = priv[id];
                    return { id, name, ic, col, grp, priv: p, st: p.st, gap: r1(-p.m) };
                });
            }
            const outside = num(c.outside, UNI_DATA.outside), rank = { safe: 2, maybe: 1, hard: 0 };
            return UNI_DATA.colleges.map(([id, name, b, ic, col, grp]) => {
                const bs = num(base[id], b);
                const unis = UNI_DATA.unis.filter((u) => !u[4] || u[4].indexOf(id) !== -1).map(([uid, un, prov, o]) => {
                    const home = prov === s.gov, cut = r1(bs + num(off[uid], o) + (home ? 0 : outside)), m = r1(s.avg - cut);
                    return { uid, un, prov, home, cut, m, o: num(off[uid], o), st: m >= SAFE ? 'safe' : m >= NEAR ? 'maybe' : 'hard' };
                }).sort((a, b) => (b.home - a.home) || (b.o - a.o));
                const st = unis.reduce((a, u) => (rank[u.st] > rank[a] ? u.st : a), 'hard');
                // home province first, then the strongest university, among those at the best status
                const pick = unis.find((u) => u.st === st);
                const easiest = unis.reduce((a, u) => (u.cut < a.cut ? u : a), unis[0]);
                return { id, name, ic, col, grp, unis, st, pick, easiest, gap: r1(easiest.cut - s.avg), alt: priv[id] };
            });
        },

        _uniRender(first) {
            const box = document.getElementById('uniContent');
            if (!box || !this._un) return;
            const s = this._un;
            if (first || !document.getElementById('unBody')) {
                box.innerHTML = `
                    <div class="un-hero">
                        <div class="un-kind">${[['gov', 'حكومي', 'landmark'], ['priv', 'أهلي', 'building-2']].map(([k, t, ic]) => `<button class="${s.kind === k ? 'on' : ''}" onclick="app.uniKind('${k}')"><i data-lucide="${ic}"></i>${t}</button>`).join('')}</div>
                        <div class="un-hero-top">
                            <span>معدلك المتوقع</span>
                        </div>
                        <div class="un-avg-row">
                            <button class="un-step" onclick="app.uniStep(-0.1)" aria-label="نقّص"><i data-lucide="minus"></i></button>
                            <input id="unAvg" class="un-avg" type="number" inputmode="decimal" min="50" max="100" step="0.1" value="${fmt(s.avg)}" onchange="app.uniSet(this.value)">
                            <button class="un-step" onclick="app.uniStep(0.1)" aria-label="زيد"><i data-lucide="plus"></i></button>
                        </div>
                        <input id="unRange" class="un-range" type="range" min="50" max="100" step="0.1" value="${s.avg}" oninput="app.uniSet(this.value, 1)">
                        <div class="un-scale"><span>50</span><span>75</span><span>100</span></div>
                        <label class="un-gov${s.kind === 'priv' ? ' hidden' : ''}"><i data-lucide="map-pin"></i><span>محافظتك</span>
                            <select onchange="app.uniGov(this.value)">${IRAQ_GOVERNORATES.map((g) => `<option${g === s.gov ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select>
                        </label>
                    </div>
                    <div id="unBody"></div>`;
            }
            this._uniPaint(true);
        },

        _uniPaint(anim) {
            const body = document.getElementById('unBody');
            if (!body) return;
            const s = this._un, list = this._uniCalc(), c = this._unCfg || {};
            this._unList = list;
            body.classList.toggle('anim', !!anim);
            const n = { safe: 0, maybe: 0, hard: 0 };
            list.forEach((x) => { n[x.st]++; });
            const reach = n.safe + n.maybe, pct = list.length ? reach / list.length : 0;
            const R = 42, C = 2 * Math.PI * R;
            const dream = list.find((x) => x.id === s.dream);
            const shown = list.filter((x) => s.f === 'all' || x.st === s.f);
            const hero = document.getElementById('uniContent');
            if (hero) hero.style.setProperty('--h', pct >= 0.6 ? '#16A34A' : pct >= 0.3 ? '#D97706' : '#DC2626');

            body.innerHTML = `
                <div class="un-sum">
                    <div class="un-ring">
                        <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" class="bg"/><circle cx="50" cy="50" r="${R}" class="fg" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}"/></svg>
                        <div><b>${reach}</b><span>من ${list.length}</span></div>
                    </div>
                    <div class="un-counts">
                        <p>${s.kind === 'priv' ? 'الكليات الأهلية اللي تكدر تقدّم عليها' : 'الكليات الحكومية اللي تكدر تنقبل بيها'}</p>
                        ${Object.keys(ST).filter((k) => s.kind !== 'priv' || k !== 'maybe').map((k) => `<button class="${s.f === k ? 'on' : ''}" style="--c:${ST[k][1]}" onclick="app.uniFilter('${k}')"><i data-lucide="${ST[k][2]}"></i><b>${n[k]}</b>${lbl(k)}</button>`).join('')}
                    </div>
                </div>
                ${dream ? this._uniDream(dream) : '<div class="un-dream-empty"><i data-lucide="star"></i>دوس النجمة على أي كلية حتى تصير "كلية حلمك" وتشوف شكد يعوزك توصلها</div>'}
                <div class="un-list-h"><b>${s.f === 'all' ? 'كل الكليات' : 'الكليات: ' + lbl(s.f)}</b>${s.f !== 'all' ? '<button onclick="app.uniFilter(\'all\')">عرض الكل</button>' : ''}</div>
                ${UNI_DATA.groups.map(([g, t, ic]) => {
                    const items = shown.filter((x) => x.grp === g);
                    return items.length ? `<div class="un-grp"><i data-lucide="${ic}"></i>${t}</div>${items.map((x, i) => this._uniCard(x, i)).join('')}` : '';
                }).join('') || '<p class="un-none">ماكو كليات بهذا التصنيف</p>'}
                ${s.kind === 'priv' ? '<div class="un-note"><i data-lucide="wallet"></i><div><b>شلون القبول بالأهلي؟</b>الوزارة تحدد حد أدنى لكل كلية، وإذا معدلك يساويه أو أكثر تكدر تقدّم، وبعدها القبول حسب المقاعد. الأقساط تختلف من كلية لكلية، والمكتوب هنا تقريبي.</div></div>' : ''}
                <div class="un-note"><i data-lucide="info"></i><div><b>الأرقام تقديرية</b>${esc(c.note || 'مبنية على معدلات القبول بالسنين الماضية وتتغير كل سنة حسب عدد المتقدمين والمقاعد. استخدمها حتى تعرف وين واكف، مو كنتيجة نهائية.')}</div></div>
                <button class="un-share btn-press" onclick="app.uniShare()"><i data-lucide="share-2"></i>شارك نتيجتك ويا ربعك</button>`;
            lucide.createIcons();
        },

        _uniDream(x) {
            if (x.priv) {
                const stc = ST[x.st];
                return `<div class="un-dream" style="--c:${x.col}">
                    <span class="un-dream-ic"><i data-lucide="${x.ic}"></i></span>
                    <div><small>كلية حلمك (أهلي)</small><b>${esc(x.name)}</b><p>${x.st === 'safe' ? `معدلك يكفي تقدّم عليها. القسط تقريباً <b>${fee(x.priv.fee)}</b> بالسنة` : `يعوزك <b>${fmt(x.gap)}</b> درجة حتى توصل الحد الأدنى`}</p></div>
                    <em style="--s:${stc[1]}">${lbl(x.st)}</em>
                </div>`;
            }
            // the dream is the top university among those the student would apply to first
            const s = this._un, top = x.unis[0], need = r1(top.cut + SAFE - s.avg), stc = ST[x.st];
            const msg = need <= 0 ? `معدلك يدخلك ${esc(top.un)} بالمضمون`
                : x.st === 'hard' ? `يعوزك <b>${fmt(x.gap + SAFE)}</b> درجة حتى توصلها بأي جامعة`
                : `تكدر توصلها. ويعوزك <b>${fmt(need)}</b> درجة حتى تضمن ${esc(top.un)}`;
            return `<div class="un-dream" style="--c:${x.col}">
                <span class="un-dream-ic"><i data-lucide="${x.ic}"></i></span>
                <div><small>كلية حلمك</small><b>${esc(x.name)}</b><p>${msg}</p></div>
                <em style="--s:${stc[1]}">${lbl(x.st)}</em>
            </div>`;
        },

        _uniCard(x, i) {
            const s = this._un, stc = ST[x.st], open = s.open === x.id, p = x.priv;
            const sub = p ? (x.st === 'hard' ? `يعوزك ${fmt(x.gap)} درجة للحد الأدنى` : `القسط تقريباً ${fee(p.fee)} بالسنة`)
                : x.st === 'hard' ? `يعوزك ${fmt(x.gap)} درجة لأسهل جامعة` : `${esc(x.pick.un)}${x.pick.home ? '' : ' (خارج محافظتك)'}`;
            const alt = !p && x.st === 'hard' && x.alt && x.alt.st === 'safe'
                ? `<button class="un-alt" onclick="app.uniKind('priv')"><i data-lucide="building-2"></i>بالأهلي تكدر تقدّم عليها، القسط تقريباً ${fee(x.alt.fee)} بالسنة</button>` : '';
            const detail = p ? `<div class="un-unis"><div class="un-pv">
                    <div><span>الحد الأدنى</span><b>${fmt(p.min)}</b></div>
                    <div><span>معدلك</span><b>${fmt(s.avg)}</b></div>
                    <div style="--s:${stc[1]}"><span>الفرق</span><b class="d">${p.m >= 0 ? '+' + fmt(p.m) : fmt(p.m)}</b></div>
                    <div><span>القسط السنوي</span><b>${fee(p.fee)}</b></div>
                </div></div>`
                : `<div class="un-unis">${x.unis.map((u) => `<div class="un-u" style="--s:${ST[u.st][1]}">
                    <span><b>${esc(u.un)}</b><small>${esc(u.prov)}${u.home ? ' - محافظتك' : ''}</small></span>
                    <span class="un-cut">${fmt(u.cut)}</span>
                    <em>${u.m >= 0 ? '+' + fmt(u.m) : fmt(u.m)}</em>
                </div>`).join('')}<p class="un-u-note">الرقم الأول معدل القبول التقديري، والثاني الفرق بينه وبين معدلك</p></div>`;
            return `<div class="un-card${open ? ' open' : ''}" style="--c:${x.col};--s:${stc[1]};--i:${i}">
                <button class="un-card-h" onclick="app.uniToggle(${jsArg(x.id)})">
                    <span class="un-ic"><i data-lucide="${x.ic}"></i></span>
                    <span class="un-card-t"><b>${esc(x.name)}</b><small>${sub}</small></span>
                    <em class="un-pill">${lbl(x.st)}</em>
                </button>
                <button class="un-star${s.dream === x.id ? ' on' : ''}" onclick="app.uniDreamSet(${jsArg(x.id)})" aria-label="كلية حلمي"><i data-lucide="star"></i></button>
                ${alt}${open ? detail : ''}
            </div>`;
        },

        uniSet(v, live) {
            const s = this._un;
            if (!s) return;
            s.avg = r1(Math.min(100, Math.max(50, num(v, s.avg))));
            const a = document.getElementById('unAvg'), rg = document.getElementById('unRange');
            if (a && (!live || document.activeElement !== a)) a.value = fmt(s.avg);
            if (rg && !live) rg.value = s.avg;
            this._uniSave();
            this._uniPaint();
        },
        uniStep(d) { if (this._un) this.uniSet(this._un.avg + d); },
        uniKind(k) {
            if (!this._un || this._un.kind === k) return;
            this._un.kind = k; this._un.f = 'all'; this._un.open = '';
            this._uniSave();
            this._uniRender(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        uniGov(g) { if (!this._un) return; this._un.gov = g; this._uniSave(); this._uniPaint(); },
        uniFilter(f) { if (!this._un) return; this._un.f = this._un.f === f ? 'all' : f; this._uniPaint(true); },
        uniToggle(id) { if (!this._un) return; this._un.open = this._un.open === id ? '' : id; this._uniPaint(); },
        uniDreamSet(id) {
            if (!this._un) return;
            this._un.dream = this._un.dream === id ? '' : id;
            this._uniSave();
            this._uniPaint();
            if (this._un.dream) window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        uniShare() {
            const s = this._un, list = this._unList || [];
            const safe = list.filter((x) => x.st === 'safe').slice(0, 3).map((x) => x.name);
            const text = `معدلي المتوقع ${fmt(s.avg)}` +
                (safe.length ? ` وحسب حاسبة القبول أكدر أدخل${s.kind === 'priv' ? ' بالأهلي' : ''}: ${safe.join('، ')}` : '') +
                `. شوف وين يدخلك معدلك: ${location.origin + location.pathname}`;
            if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
            (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
                () => this.showToast('انسخت النتيجة، الصقها لربعك'),
                () => this.showToast('ما كدرت أنسخ النتيجة'));
        }
    });
})();
