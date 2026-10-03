// مصاريفي: the student's money manager. Wallets with the money they really have, income and expenses with
// categories, a monthly budget (total and per category), a daily allowance ("تصرف كذا باليوم، وتكفيك كذا يوم"),
// savings goals (like university fees), monthly repeating payments, charts and reports, backup and CSV.
// The tutor watches it: a one-line summary is kept next to the data (isp:mn:sum:<uid>) and read by the tutor,
// and the page shows its own notes ("المعلم يراقب مصاريفك").
// Kept on the phone: isp:mn:<uid>. A copy goes to userMoney/<uid> when the database rules allow it (best effort).
// Loaded on demand by app._need('money').
(function () {
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const EXP = [
        ['food', 'أكل وشرب', 'utensils', '#F97316'], ['cafe', 'كافيه ومطاعم', 'coffee', '#B45309'], ['transport', 'مواصلات', 'bus', '#2563EB'],
        ['study', 'دراسة وقرطاسية', 'book-open', '#0D9488'], ['phone', 'موبايل وإنترنت', 'smartphone', '#7C3AED'], ['rent', 'سكن وفواتير', 'house', '#0891B2'],
        ['clothes', 'ملابس', 'shirt', '#DB2777'], ['health', 'صحة', 'heart-pulse', '#DC2626'], ['fun', 'ترفيه', 'gamepad-2', '#C026D3'],
        ['gifts', 'هدايا', 'gift', '#EA580C'], ['other', 'أخرى', 'ellipsis', '#64748B'],
    ];
    const INC = [
        ['allow', 'مصروف من الأهل', 'hand-coins', '#16A34A'], ['salary', 'راتب أو شغل', 'briefcase', '#0D9488'], ['gift', 'هدية', 'gift', '#DB2777'],
        ['sell', 'بيع', 'tag', '#2563EB'], ['oth', 'دخل آخر', 'circle-plus', '#64748B'],
    ];
    const WCOL = ['#0F766E', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#CA8A04'];
    const GOAL_PRESETS = [['مصاريف الجامعة', 'graduation-cap'], ['لابتوب', 'laptop'], ['سفرة', 'plane'], ['طوارئ', 'shield-check'], ['هدف ثاني', 'target']];
    const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
    const DAYN = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const CAT = {}; EXP.concat(INC).forEach((c) => { CAT[c[0]] = c; });
    const M = { tab: 'home', ym: '', q: '', ft: '', hide: false, draft: null, undo: null };

    // ---------- small helpers ----------
    const pad = (n) => String(n).padStart(2, '0');
    const ymd = (d) => { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const ymOf = (d) => ymd(d).slice(0, 7);
    const todayStr = () => ymd(Date.now());
    const parseYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; };
    const dayDiff = (a, b) => Math.round((parseYmd(ymd(b)) - parseYmd(ymd(a))) / 864e5);
    const daysIn = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
    const shiftYm = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
    const monthName = (ym) => { const [y, m] = ym.split('-').map(Number); return MONTHS[m - 1] + ' ' + y; };
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
    const iqd = (n) => (n < 0 ? '-' : '') + fmt(Math.abs(n));
    const short = (n) => { n = Math.abs(Math.round(n)); return n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'م' : n >= 1e3 ? (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + 'ألف' : String(n); };
    const num = (s) => {
        const map = { '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9, '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9 };
        const t = String(s == null ? '' : s).replace(/[٠-٩۰-۹]/g, (c) => map[c]).replace(/[^\d.]/g, '');
        const v = parseFloat(t); return Number.isFinite(v) ? v : 0;
    };
    const uid8 = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
    const cat = (id) => CAT[id] || CAT.other;

    const blank = () => ({ v: 1, w: [{ id: 'w1', n: 'كاش', c: WCOL[0], b: 0 }], x: [], bud: { t: 0, c: {} }, g: [], rc: [], nx: '', u: Date.now(), ok: 0 });

    // ---------- the numbers ----------
    const effect = (t, wid) => {
        if (t.t === 'i') return t.w === wid ? t.a : 0;
        if (t.t === 'e' || t.t === 'g') return t.w === wid ? -t.a : 0;
        if (t.t === 'm') return (t.w === wid ? -t.a : 0) + (t.w2 === wid ? t.a : 0);
        return 0;
    };
    const walletBal = (d, w) => w.b + d.x.reduce((s, t) => s + effect(t, w.id), 0);
    const totalBal = (d) => d.w.reduce((s, w) => s + walletBal(d, w), 0);
    const goalSaved = (d, g) => d.x.reduce((s, t) => s + (t.t === 'g' && t.g === g.id ? t.a : 0), 0);
    const inMonth = (d, ym) => d.x.filter((t) => ymOf(t.d) === ym);
    const monthStats = (d, ym) => {
        const L = inMonth(d, ym); let inc = 0, exp = 0; const by = {};
        L.forEach((t) => { if (t.t === 'i') inc += t.a; else if (t.t === 'e') { exp += t.a; by[t.c] = (by[t.c] || 0) + t.a; } });
        return { inc, exp, by, n: L.length };
    };
    const spentOn = (d, ds) => d.x.reduce((s, t) => s + (t.t === 'e' && ymd(t.d) === ds ? t.a : 0), 0);
    // daily allowance: the money on hand (plus today's spending, so it doesn't shrink while you spend) over the days until the next income
    const plan = (d) => {
        const now = Date.now(), bal = totalBal(d), today = todayStr();
        let end = parseYmd(d.nx);
        if (!end || dayDiff(now, end) < 1) { const ym = ymOf(now); end = parseYmd(ym + '-' + pad(daysIn(ym))); end = new Date(end.getTime() + 864e5); }
        const days = Math.max(1, dayDiff(now, end));
        const sp = spentOn(d, today);
        const base = Math.max(0, bal + sp) / days;
        const since = new Date(now - 14 * 864e5);
        const first = d.x.reduce((m, t) => (t.t === 'e' && t.d < m ? t.d : m), now);
        const span = Math.max(3, Math.min(14, dayDiff(Math.max(first, since.getTime()), now) + 1));
        const last14 = d.x.reduce((s, t) => s + (t.t === 'e' && t.d >= since.getTime() ? t.a : 0), 0);
        const avg = last14 / span;
        return { bal, days, endStr: ymd(end), base, sp, avg, runway: avg > 0 ? Math.floor(Math.max(0, bal) / avg) : null, custom: !!d.nx && dayDiff(now, parseYmd(d.nx)) >= 1 };
    };

    // notes from the tutor's side: short, specific and kind
    function insights(d) {
        const out = [], P = plan(d), ym = ymOf(Date.now()), S = monthStats(d, ym), now = Date.now();
        const add = (k, ic, t) => out.push({ k, ic, t });
        if (!d.x.length) { add('tip', 'sparkles', 'سجّل أول مصروف لك وأنا أتابعك وأقولك وين تروح فلوسك.'); return out; }
        if (P.bal <= 0) add('bad', 'triangle-alert', 'رصيدك خلص أو سالب. شوف إذا مسجل كل دخلك، وقلل المصروف الجاي.');
        else if (P.runway !== null && P.runway < P.days) add('bad', 'hourglass', 'بمعدل صرفك فلوسك تكفي ' + P.runway + ' يوم بس، وباقي ' + P.days + ' يوم للمصروف الجاي. قلل شوية.');
        else if (P.runway !== null) add('ok', 'circle-check', 'بمعدل صرفك الحالي فلوسك تكفيك ' + (P.runway > 365 ? 'أكثر من سنة' : P.runway + ' يوم') + '. وضعك مريح.');
        if (P.sp > P.base && P.base > 0) add('warn', 'gauge', 'صرفت اليوم ' + fmt(P.sp) + ' وحدك اليومي ' + fmt(P.base) + '. خفف باقي اليوم.');
        if (d.bud.t > 0) {
            const pct = S.exp / d.bud.t, day = new Date(now).getDate(), exp = daysIn(ym);
            if (pct >= 1) add('bad', 'siren', 'تجاوزت ميزانية الشهر بـ ' + fmt(S.exp - d.bud.t) + '.');
            else if (pct >= 0.8) add('warn', 'bell-ring', 'صرفت ' + Math.round(pct * 100) + '% من ميزانية الشهر وباقي ' + (exp - day) + ' يوم.');
            else if (pct > (day / exp) + 0.2) add('warn', 'trending-up', 'صرفك أسرع من وتيرة الشهر: ' + Math.round(pct * 100) + '% من الميزانية بعد ' + Math.round(day / exp * 100) + '% من الشهر.');
        }
        Object.keys(d.bud.c).forEach((k) => { const lim = d.bud.c[k], s = S.by[k] || 0; if (lim > 0 && s > lim) add('warn', 'circle-alert', 'تجاوزت حد "' + cat(k)[1] + '" بـ ' + fmt(s - lim) + '.'); });
        const top = Object.keys(S.by).sort((a, b) => S.by[b] - S.by[a])[0];
        if (top && S.exp > 0 && S.by[top] / S.exp >= 0.4 && S.exp > 20000) add('tip', 'chart-pie', Math.round(S.by[top] / S.exp * 100) + '% من مصروفك هذا الشهر على "' + cat(top)[1] + '". هذا أكبر باب تقدر توفر منه.');
        const w0 = now - 7 * 864e5, w1 = now - 14 * 864e5;
        const a = d.x.reduce((s, t) => s + (t.t === 'e' && t.d >= w0 ? t.a : 0), 0), b = d.x.reduce((s, t) => s + (t.t === 'e' && t.d >= w1 && t.d < w0 ? t.a : 0), 0);
        if (b > 0 && a > b * 1.3) add('warn', 'trending-up', 'صرفك هالأسبوع أعلى من الأسبوع الماضي بـ ' + Math.round((a / b - 1) * 100) + '%.');
        else if (b > 0 && a < b * 0.8) add('ok', 'trending-down', 'أحسنت، صرفك هالأسبوع أقل من الأسبوع الماضي بـ ' + Math.round((1 - a / b) * 100) + '%.');
        const lastTx = d.x.reduce((m, t) => Math.max(m, t.d), 0);
        if (dayDiff(lastTx, now) >= 3) add('tip', 'pencil', 'ما سجلت شي من ' + dayDiff(lastTx, now) + ' أيام. سجل مصروفك حتى تبقى الأرقام صحيحة.');
        const g = d.g.filter((x) => goalSaved(d, x) < x.target).sort((x, y) => goalSaved(d, y) / y.target - goalSaved(d, x) / x.target)[0];
        if (g) add('tip', 'target', 'هدف "' + g.n + '": وصلت ' + Math.round(goalSaved(d, g) / g.target * 100) + '%، باقي ' + fmt(g.target - goalSaved(d, g)) + '.');
        const rank = { bad: 0, warn: 1, tip: 2, ok: 3 };
        return out.sort((x, y) => rank[x.k] - rank[y.k]);
    }

    function summaryText(d) {
        if (!d || (!d.x.length && !totalBal(d))) return '';
        const P = plan(d), ym = ymOf(Date.now()), S = monthStats(d, ym), L = [];
        L.push('مصاريفه (بالدينار العراقي): رصيده الكلي ' + fmt(P.bal) + '، هالشهر دخل ' + fmt(S.inc) + ' وصرف ' + fmt(S.exp) + '.');
        const top = Object.keys(S.by).sort((a, b) => S.by[b] - S.by[a]).slice(0, 3).map((k) => cat(k)[1] + ' ' + fmt(S.by[k]));
        if (top.length) L.push('أكثر ما يصرف عليه: ' + top.join('، ') + '.');
        if (d.bud.t > 0) L.push('ميزانيته الشهرية ' + fmt(d.bud.t) + ' وصرف منها ' + Math.round(S.exp / d.bud.t * 100) + '%.');
        L.push('حده اليومي ' + fmt(P.base) + (P.runway !== null ? '، وبمعدل صرفه تكفيه ' + P.runway + ' يوم' : '') + '، وباقي ' + P.days + ' يوم للمصروف الجاي.');
        if (d.g.length) L.push('أهدافه: ' + d.g.slice(0, 3).map((g) => g.n + ' ' + Math.round(goalSaved(d, g) / g.target * 100) + '%').join('، ') + '.');
        const warn = insights(d).filter((i) => i.k === 'bad' || i.k === 'warn').slice(0, 2).map((i) => i.t);
        if (warn.length) L.push('تنبيهات: ' + warn.join(' '));
        return L.join(' ').slice(0, 900);
    }

    // ---------- tiny svg charts ----------
    function donut(parts, total) {
        const R = 52, C = 2 * Math.PI * R; let off = 0;
        const arcs = parts.map((p) => { const len = total ? C * p.v / total : 0; const s = '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + p.c + '" stroke-width="20" stroke-dasharray="' + Math.max(0, len - 1.5) + ' ' + (C - Math.max(0, len - 1.5)) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 70 70)"/>'; off += len; return s; }).join('');
        return '<svg class="mn-donut" viewBox="0 0 140 140" role="img" aria-label="توزيع المصروف"><circle cx="70" cy="70" r="' + R + '" fill="none" stroke="var(--input-bg)" stroke-width="20"/>' + arcs + '<text x="70" y="66" text-anchor="middle" class="mn-dn-l">المصروف</text><text x="70" y="86" text-anchor="middle" class="mn-dn-v">' + esc(short(total)) + '</text></svg>';
    }
    function bars(vals, labels, hi) {
        const W = 300, H = 120, n = vals.length, bw = Math.min(26, (W - 10) / n - 6), max = Math.max(1, ...vals);
        const g = vals.map((v, i) => {
            const x = 8 + (W - 16) / n * (n - 1 - i) + ((W - 16) / n - bw) / 2, h = Math.max(v ? 4 : 2, (H - 26) * v / max), y = H - 18 - h;
            return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="5" class="' + (i === hi ? 'mn-bar on' : 'mn-bar') + '"/><text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle" class="mn-bl">' + esc(labels[i]) + '</text>';
        }).join('');
        return '<svg class="mn-bars" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="مصروف الأيام الأخيرة">' + g + '</svg>';
    }
    function ring(p, c, inner) {
        const R = 42, C = 2 * Math.PI * R, v = Math.min(1, Math.max(0, p));
        return '<div class="mn-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="' + R + '" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="9"/><circle cx="50" cy="50" r="' + R + '" fill="none" stroke="' + c + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + (C * v) + ' ' + C + '" transform="rotate(-90 50 50)"/></svg><div class="mn-ring-i">' + inner + '</div></div>';
    }

    Object.assign(app, {
        // ---------- opening and storage ----------
        mnOpen() {
            M.tab = M.tab || 'home'; M.ym = ymOf(Date.now()); M.q = ''; M.ft = '';
            let d = this._mnGet();
            M.setup = !d;
            if (d) { this._mnRecurring(d); }
            this._mnRender();
            this._mnCloudPull();
        },
        mnClose() { this._mnSheetClose(); clearTimeout(M.toastT); const t = document.getElementById('mnToast'); if (t) t.remove(); const c = document.getElementById('mnContent'); if (c) c.innerHTML = ''; },
        _mnKey() { return 'isp:mn:' + (this.authUid || 'guest'); },
        _mnGet() {
            if (M.d && M.dk === this._mnKey()) return M.d;
            let d = null;
            try { d = JSON.parse(localStorage.getItem(this._mnKey()) || 'null'); } catch (e) {}
            if (d && Array.isArray(d.w) && Array.isArray(d.x)) { d.g = d.g || []; d.rc = d.rc || []; d.bud = d.bud || { t: 0, c: {} }; d.bud.c = d.bud.c || {}; M.d = d; M.dk = this._mnKey(); return d; }
            M.d = null; return null;
        },
        _mnSave(d, noCloud) {
            d = d || M.d; if (!d) return;
            d.u = Date.now(); M.d = d; M.dk = this._mnKey();
            if (d.x.length > 4000) d.x = d.x.sort((a, b) => b.d - a.d).slice(0, 4000);
            try {
                localStorage.setItem(this._mnKey(), JSON.stringify(d));
                localStorage.setItem('isp:mn:sum:' + (this.authUid || 'guest'), JSON.stringify({ t: summaryText(d), at: Date.now() }));
            } catch (e) { this.showToast('ما كدرت أحفظ (الذاكرة ممتلئة؟)'); }
            if (!noCloud) { clearTimeout(M.cs); M.cs = setTimeout(() => this._mnCloudPush(), 3000); }
        },
        // a copy in the database, so changing the phone does not lose the numbers (needs the userMoney rule; silent without it)
        async _mnCloudPush() {
            try {
                if (!window.firebaseDb || !this.authUid || M.cloudOff) return;
                const { ref, set } = window.firebaseDbHelpers, d = M.d; if (!d) return;
                await set(ref(window.firebaseDb, 'userMoney/' + this.authUid), JSON.stringify(d));
            } catch (e) { M.cloudOff = true; }
        },
        async _mnCloudPull() {
            try {
                if (!window.firebaseDb || !this.authUid || M.cloudOff || M.pulled === this.authUid) return;
                M.pulled = this.authUid;
                const { ref, get } = window.firebaseDbHelpers;
                const snap = await get(ref(window.firebaseDb, 'userMoney/' + this.authUid));
                if (!snap.exists()) { if (M.d) this._mnCloudPush(); return; }
                const c = JSON.parse(snap.val()), mine = this._mnGet();
                if (c && Array.isArray(c.w) && Array.isArray(c.x) && (!mine || (c.u || 0) > (mine.u || 0))) {
                    M.d = c; M.setup = false; this._mnSave(c, true); if (this.currentView === 'moneyView') this._mnRender();
                } else if (mine && (mine.u || 0) > (c.u || 0)) this._mnCloudPush();
            } catch (e) { M.cloudOff = true; }
        },
        // repeating payments (rent, internet, a monthly allowance) are added by themselves on their day
        _mnRecurring(d) {
            const now = new Date(), cur = ymOf(now); let changed = false;
            d.rc.forEach((r) => {
                if (!r.on) return;
                let guard = 0;
                while (r.last < cur && guard++ < 24) {
                    const ym = shiftYm(r.last, 1), day = Math.min(r.day, daysIn(ym)), when = parseYmd(ym + '-' + pad(day));
                    if (when.getTime() > now.getTime()) break;
                    d.x.push({ i: uid8(), t: r.t, a: r.a, w: d.w.some((w) => w.id === r.w) ? r.w : d.w[0].id, c: r.c, n: r.n, d: when.getTime(), r: r.id });
                    r.last = ym; changed = true;
                }
            });
            if (changed) this._mnSave(d);
        },
        _mnMask(el) { const n = num(el.value); el.value = n ? Math.floor(n).toLocaleString('en-US') : ''; },

        // ---------- the page ----------
        _mnRender() {
            const box = document.getElementById('mnContent'); if (!box) return;
            const d = this._mnGet();
            if (!d) { box.innerHTML = '<div class="mn-wrap">' + this._mnSetupHtml() + '</div>'; if (window.lucide) lucide.createIcons(); return; }
            const tabs = [['home', 'الرئيسية', 'layout-dashboard'], ['tx', 'الحركات', 'receipt'], ['bud', 'الميزانية', 'gauge'], ['goals', 'الأهداف', 'target'], ['rep', 'تقارير', 'chart-pie']];
            const body = M.tab === 'tx' ? this._mnTxHtml(d) : M.tab === 'bud' ? this._mnBudHtml(d) : M.tab === 'goals' ? this._mnGoalsHtml(d) : M.tab === 'rep' ? this._mnRepHtml(d) : this._mnHomeHtml(d);
            box.innerHTML = '<div class="mn-wrap"><div class="mn-tabs" role="tablist">' + tabs.map((t) => '<button class="mn-tab' + (M.tab === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (M.tab === t[0]) + '" onclick="app.mnTab(\'' + t[0] + '\')"><i data-lucide="' + t[2] + '"></i>' + t[1] + '</button>').join('') + '</div>'
                + body + '</div><button class="mn-fab" onclick="app.mnAdd()" aria-label="إضافة حركة"><i data-lucide="plus"></i></button>';
            if (window.lucide) lucide.createIcons();
        },
        mnTab(t) { M.tab = t; this._mnRender(); window.scrollTo(0, 0); },

        // first time: how much money do you have?
        _mnSetupHtml() {
            return '<div class="mn-hero mn-hero-w"><div class="mn-hero-t">أهلاً بيك بمصاريفي</div><p class="mn-hero-p">دخّل شكد فلوسك هسه، وبعدها سجّل كل دخل ومصروف. أحسبلك شكد تصرف باليوم وشكد تكفيك، والمعلم يراقب ويكلك إذا زاد صرفك.</p></div>'
                + '<div class="mn-card"><label class="mn-lb" for="mnS1">شكد فلوسك هسه؟ (بالدينار)</label><input id="mnS1" class="mn-in mn-big" inputmode="numeric" placeholder="0" oninput="app._mnMask(this)" autocomplete="off">'
                + '<div class="mn-chips">' + [10000, 25000, 50000, 100000, 250000].map((v) => '<button class="mn-chip" onclick="document.getElementById(\'mnS1\').value=\'' + fmt(v) + '\'">' + fmt(v) + '</button>').join('') + '</div>'
                + '<label class="mn-lb" for="mnS2">اسم المحفظة</label><input id="mnS2" class="mn-in" value="كاش" maxlength="20">'
                + '<label class="mn-lb" for="mnS3">متى يجيك المصروف الجاي؟ (اختياري)</label><input id="mnS3" class="mn-in" type="date">'
                + '<label class="mn-lb" for="mnS4">ميزانيتك الشهرية (اختياري)</label><input id="mnS4" class="mn-in" inputmode="numeric" placeholder="مثلاً 150,000" oninput="app._mnMask(this)" autocomplete="off">'
                + '<button class="mn-go" onclick="app.mnStart()"><i data-lucide="rocket"></i>ابدأ</button></div>';
        },
        mnStart() {
            const v = (id) => (document.getElementById(id) || {}).value || '';
            const d = blank();
            d.w[0].n = v('mnS2').trim().slice(0, 20) || 'كاش'; d.w[0].b = Math.max(0, num(v('mnS1')));
            const nx = v('mnS3'); if (parseYmd(nx) && dayDiff(Date.now(), parseYmd(nx)) >= 1) d.nx = nx;
            d.bud.t = Math.max(0, num(v('mnS4')));
            M.setup = false; this._mnSave(d); this._mnRender(); this.showToast('تم، ابدأ سجّل مصاريفك');
        },

        _mnHomeHtml(d) {
            const P = plan(d), ym = ymOf(Date.now()), S = monthStats(d, ym), hide = (s) => (M.hide ? '••••' : s);
            const pct = P.base > 0 ? P.sp / P.base : (P.sp > 0 ? 1 : 0), over = P.sp > P.base && P.base > 0;
            const rc = P.runway === null ? '—' : P.runway > 365 ? '+365' : String(P.runway);
            const risky = P.bal <= 0 || (P.runway !== null && P.runway < P.days);
            const wallets = d.w.map((w) => '<button class="mn-w" style="--c:' + w.c + '" onclick="app.mnWalletEdit(\'' + w.id + '\')"><i></i><span>' + esc(w.n) + '</span><b>' + hide(iqd(walletBal(d, w))) + '</b></button>').join('') + '<button class="mn-w mn-w-add" onclick="app.mnWalletEdit(\'\')"><i data-lucide="plus"></i><span>محفظة</span></button>';
            const ins = insights(d).slice(0, 4);
            const recent = d.x.slice().sort((a, b) => b.d - a.d).slice(0, 5);
            return '<div class="mn-hero"><div class="mn-hero-top"><span>رصيدك الكلي</span><button class="mn-eye" onclick="app.mnHide()" aria-label="إخفاء الأرقام"><i data-lucide="' + (M.hide ? 'eye-off' : 'eye') + '"></i></button></div>'
                + '<div class="mn-hero-amt"><b>' + hide(iqd(P.bal)) + '</b><small>د.ع</small></div>'
                + '<div class="mn-hero-row"><div><i data-lucide="arrow-down-left"></i><span>دخل الشهر</span><b>' + hide(fmt(S.inc)) + '</b></div><div><i data-lucide="arrow-up-right"></i><span>مصروف الشهر</span><b>' + hide(fmt(S.exp)) + '</b></div></div></div>'
                + '<div class="mn-ws">' + wallets + '</div>'
                + '<div class="mn-plan' + (risky ? ' bad' : over ? ' warn' : '') + '">'
                + ring(pct, over ? '#FCA5A5' : '#fff', '<b>' + hide(short(Math.max(0, P.base - P.sp))) + '</b><small>باقي اليوم</small>')
                + '<div class="mn-plan-t"><div class="mn-plan-h">تصرف باليوم <b>' + hide(fmt(P.base)) + '</b></div>'
                + '<div class="mn-plan-l">فلوسك تكفيك <b>' + hide(rc) + '</b> يوم بمعدل صرفك</div>'
                + '<div class="mn-plan-l">باقي <b>' + P.days + '</b> يوم للمصروف الجاي' + (P.custom ? '' : ' (آخر الشهر)') + '</div>'
                + '<button class="mn-plan-b" onclick="app.mnNext()">' + (P.custom ? 'غيّر موعد المصروف' : 'حدد موعد المصروف الجاي') + '</button></div></div>'
                + '<div class="mn-acts"><button class="mn-act mn-act-e" onclick="app.mnAdd(\'e\')"><i data-lucide="minus"></i>مصروف</button><button class="mn-act mn-act-i" onclick="app.mnAdd(\'i\')"><i data-lucide="plus"></i>دخل</button><button class="mn-act mn-act-m" onclick="app.mnAdd(\'m\')"><i data-lucide="arrow-left-right"></i>تحويل</button></div>'
                + '<div class="mn-card mn-tutor"><div class="mn-card-h"><span class="mn-tut-i"><i data-lucide="graduation-cap"></i></span><b>المعلم يراقب مصاريفك</b></div>'
                + ins.map((i) => '<div class="mn-ins mn-ins-' + i.k + '"><i data-lucide="' + i.ic + '"></i><span>' + esc(i.t) + '</span></div>').join('')
                + '<button class="mn-link" onclick="app.mnAskTutor()"><i data-lucide="message-circle-question"></i>اسأل المعلم يراجع مصاريفي</button></div>'
                + (d.bud.t > 0 ? this._mnBudBar(d, S) : '')
                + '<div class="mn-card"><div class="mn-card-h"><b>آخر الحركات</b><button class="mn-link" onclick="app.mnTab(\'tx\')">الكل</button></div>' + (recent.length ? recent.map((t) => this._mnRow(d, t)).join('') : '<div class="mn-empty">ماكو حركات بعد. اضغط + وسجّل أول مصروف.</div>') + '</div>';
        },
        _mnBudBar(d, S) {
            const p = S.exp / d.bud.t, c = p >= 1 ? '#DC2626' : p >= 0.8 ? '#F59E0B' : '#0D9488';
            return '<div class="mn-card"><div class="mn-card-h"><b>ميزانية ' + MONTHS[+M.ym.slice(5) - 1] + '</b><span class="mn-mut">' + (M.hide ? '••••' : fmt(S.exp) + ' من ' + fmt(d.bud.t)) + '</span></div><div class="mn-bar-t"><i style="width:' + Math.min(100, p * 100).toFixed(1) + '%;background:' + c + '"></i></div><div class="mn-mut">' + (p >= 1 ? 'تجاوزت الميزانية بـ ' + fmt(S.exp - d.bud.t) : 'باقي ' + fmt(d.bud.t - S.exp)) + '</div></div>';
        },
        mnHide() { M.hide = !M.hide; this._mnRender(); },

        _mnRow(d, t) {
            let c, title, sub, sign, cls;
            if (t.t === 'm') { c = ['m', '', 'arrow-left-right', '#2563EB']; const a = d.w.find((w) => w.id === t.w), b = d.w.find((w) => w.id === t.w2); title = 'تحويل'; sub = (a ? a.n : '؟') + ' ← ' + (b ? b.n : '؟'); sign = ''; cls = 'm'; }
            else if (t.t === 'g') { const g = d.g.find((x) => x.id === t.g); c = ['g', '', 'piggy-bank', '#0F766E']; title = (t.a < 0 ? 'سحب من هدف' : 'ادخار') + (g ? ': ' + g.n : ''); const w = d.w.find((x) => x.id === t.w); sub = w ? w.n : ''; sign = t.a < 0 ? '+' : '-'; cls = t.a < 0 ? 'i' : 'm'; }
            else { c = cat(t.c); title = t.n || c[1]; const w = d.w.find((x) => x.id === t.w); sub = (t.n ? c[1] + ' · ' : '') + (w ? w.n : ''); sign = t.t === 'i' ? '+' : '-'; cls = t.t === 'i' ? 'i' : 'e'; }
            return '<button class="mn-row" onclick="app.mnEdit(\'' + t.i + '\')"><span class="mn-ic" style="--c:' + c[3] + '"><i data-lucide="' + c[2] + '"></i></span><span class="mn-row-t"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span><span class="mn-amt ' + cls + '">' + (M.hide ? '••••' : sign + fmt(Math.abs(t.a))) + '</span></button>';
        },

        // ---------- movements ----------
        _mnTxHtml(d) {
            const L = inMonth(d, M.ym).filter((t) => {
                if (M.ft === 'e' || M.ft === 'i' || M.ft === 'm') { if (M.ft === 'm' ? !(t.t === 'm' || t.t === 'g') : t.t !== M.ft) return false; }
                if (M.q) { const c = t.t === 'e' || t.t === 'i' ? cat(t.c)[1] : ''; if (!(String(t.n || '') + ' ' + c).includes(M.q)) return false; }
                return true;
            }).sort((a, b) => b.d - a.d);
            const S = monthStats(d, M.ym), days = {};
            L.forEach((t) => { (days[ymd(t.d)] = days[ymd(t.d)] || []).push(t); });
            const dayHtml = Object.keys(days).sort().reverse().map((k) => {
                const dd = parseYmd(k), tot = days[k].reduce((s, t) => s + (t.t === 'e' ? -t.a : t.t === 'i' ? t.a : 0), 0), isT = k === todayStr();
                return '<div class="mn-day"><span>' + (isT ? 'اليوم' : DAYN[dd.getDay()] + ' ' + dd.getDate()) + '</span><small>' + (M.hide ? '' : (tot > 0 ? '+' : '') + fmt(tot)) + '</small></div>' + days[k].map((t) => this._mnRow(d, t)).join('');
            }).join('');
            return this._mnMonthNav() + '<div class="mn-sum"><div><small>دخل</small><b class="i">' + (M.hide ? '••' : fmt(S.inc)) + '</b></div><div><small>مصروف</small><b class="e">' + (M.hide ? '••' : fmt(S.exp)) + '</b></div><div><small>الصافي</small><b>' + (M.hide ? '••' : iqd(S.inc - S.exp)) + '</b></div></div>'
                + '<input class="mn-search" id="mnQ" placeholder="دور بالملاحظات أو النوع" value="' + esc(M.q) + '" oninput="app.mnSearch(this.value)" autocomplete="off">'
                + '<div class="mn-chips">' + [['', 'الكل'], ['e', 'مصروف'], ['i', 'دخل'], ['m', 'تحويل وادخار']].map((f) => '<button class="mn-chip' + (M.ft === f[0] ? ' on' : '') + '" onclick="app.mnFilter(\'' + f[0] + '\')">' + f[1] + '</button>').join('') + '</div>'
                + '<div class="mn-card">' + (dayHtml || '<div class="mn-empty">ماكو حركات بهذا الشهر.</div>') + '</div>';
        },
        _mnMonthNav() { return '<div class="mn-mnav"><button onclick="app.mnMonth(-1)" aria-label="الشهر السابق"><i data-lucide="chevron-right"></i></button><b>' + monthName(M.ym) + '</b><button onclick="app.mnMonth(1)" aria-label="الشهر التالي"' + (M.ym >= ymOf(Date.now()) ? ' disabled' : '') + '><i data-lucide="chevron-left"></i></button></div>'; },
        mnMonth(k) { const n = shiftYm(M.ym, k); if (n > ymOf(Date.now())) return; M.ym = n; this._mnRender(); },
        mnSearch(v) { M.q = v.trim(); clearTimeout(M.qt); M.qt = setTimeout(() => { this._mnRender(); const i = document.getElementById('mnQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); },
        mnFilter(f) { M.ft = f; this._mnRender(); },

        // ---------- the add / edit sheet ----------
        _mnSheet(html) {
            document.querySelectorAll('.mn-sheet').forEach((e) => e.remove());
            const s = document.createElement('div'); s.className = 'mn-sheet'; s.id = 'mnSheet';
            s.innerHTML = '<div class="mn-back" onclick="app._mnSheetClose()"></div><div class="mn-sh" role="dialog" aria-modal="true"><div class="mn-grab"></div>' + html + '</div>';
            document.body.appendChild(s);
            requestAnimationFrame(() => s.classList.add('on'));
            if (window.lucide) lucide.createIcons();
        },
        _mnSheetClose() { document.querySelectorAll('.mn-sheet').forEach((s) => { s.classList.remove('on'); setTimeout(() => s.remove(), 250); }); },
        mnAdd(t) {
            const d = this._mnGet(); if (!d) return;
            const w = d.w[0].id;
            M.draft = { id: '', t: t || 'e', a: 0, w, w2: d.w[1] ? d.w[1].id : w, c: t === 'i' ? 'allow' : 'food', n: '', d: todayStr(), rep: false };
            this._mnTxSheet();
        },
        mnEdit(id) {
            const d = this._mnGet(), t = d && d.x.find((x) => x.i === id); if (!t) return;
            if (t.t === 'g') { this.showToast('هذي حركة ادخار. عدّلها من تبويب الأهداف'); return; }
            M.draft = { id: t.i, t: t.t, a: t.a, w: t.w, w2: t.w2 || d.w[0].id, c: t.c || 'food', n: t.n || '', d: ymd(t.d), rep: false };
            this._mnTxSheet();
        },
        _mnTxSheet() {
            const d = this._mnGet(), D = M.draft; if (!d || !D) return;
            const cats = D.t === 'i' ? INC : EXP;
            const wsel = (key, label) => '<div class="mn-lb">' + label + '</div><div class="mn-chips">' + d.w.map((w) => '<button class="mn-chip' + (D[key] === w.id ? ' on' : '') + '" style="--c:' + w.c + '" onclick="app.mnPick(\'' + key + '\',\'' + w.id + '\')">' + esc(w.n) + '</button>').join('') + '</div>';
            const yst = ymd(Date.now() - 864e5);
            this._mnSheet('<div class="mn-seg">' + [['e', 'مصروف'], ['i', 'دخل'], ['m', 'تحويل']].map((x) => '<button class="' + (D.t === x[0] ? 'on' : '') + '" onclick="app.mnPick(\'t\',\'' + x[0] + '\')">' + x[1] + '</button>').join('') + '</div>'
                + '<label class="mn-lb" for="mnA">المبلغ (دينار)</label><input id="mnA" class="mn-in mn-big" inputmode="numeric" placeholder="0" value="' + (D.a ? fmt(D.a) : '') + '" oninput="app._mnMask(this)" autocomplete="off">'
                + '<div class="mn-chips">' + [1000, 5000, 10000, 25000].map((v) => '<button class="mn-chip" onclick="app.mnPlus(' + v + ')">+' + fmt(v) + '</button>').join('') + '</div>'
                + (D.t === 'm' ? wsel('w', 'من محفظة') + wsel('w2', 'إلى محفظة')
                    : '<div class="mn-lb">النوع</div><div class="mn-cats">' + cats.map((c) => '<button class="mn-cat' + (D.c === c[0] ? ' on' : '') + '" style="--c:' + c[3] + '" onclick="app.mnPick(\'c\',\'' + c[0] + '\')"><i data-lucide="' + c[2] + '"></i><span>' + c[1] + '</span></button>').join('') + '</div>' + wsel('w', D.t === 'i' ? 'يدخل بأي محفظة' : 'من أي محفظة'))
                + '<label class="mn-lb" for="mnN">ملاحظة (اختياري)</label><input id="mnN" class="mn-in" maxlength="60" value="' + esc(D.n) + '" placeholder="مثلاً: غداء بالكلية" autocomplete="off">'
                + '<div class="mn-lb">التاريخ</div><div class="mn-chips"><button class="mn-chip' + (D.d === todayStr() ? ' on' : '') + '" onclick="app.mnPick(\'d\',\'' + todayStr() + '\')">اليوم</button><button class="mn-chip' + (D.d === yst ? ' on' : '') + '" onclick="app.mnPick(\'d\',\'' + yst + '\')">أمس</button><input id="mnD" class="mn-in mn-date" type="date" value="' + D.d + '" max="' + todayStr() + '" onchange="app.mnPick(\'d\',this.value)"></div>'
                + (!D.id && D.t !== 'm' ? '<label class="mn-chk"><input type="checkbox" id="mnR"' + (D.rep ? ' checked' : '') + '><span>يتكرر كل شهر بنفس اليوم</span></label>' : '')
                + '<button class="mn-go" onclick="app.mnSaveTx()"><i data-lucide="check"></i>' + (D.id ? 'حفظ التعديل' : 'حفظ') + '</button>'
                + (D.id ? '<button class="mn-del" onclick="app.mnDelTx(\'' + D.id + '\')"><i data-lucide="trash-2"></i>حذف الحركة</button>' : ''));
        },
        // changing a choice re-draws the sheet but keeps what was typed
        mnPick(k, v) {
            const D = M.draft; if (!D) return;
            const a = document.getElementById('mnA'), n = document.getElementById('mnN'), r = document.getElementById('mnR');
            if (a) D.a = num(a.value); if (n) D.n = n.value; if (r) D.rep = r.checked;
            D[k] = v;
            if (k === 't') D.c = v === 'i' ? 'allow' : 'food';
            this._mnTxSheet();
        },
        mnPlus(v) { const a = document.getElementById('mnA'); if (!a) return; a.value = (num(a.value) + v).toLocaleString('en-US'); },
        mnSaveTx() {
            const d = this._mnGet(), D = M.draft; if (!d || !D) return;
            const a = Math.floor(num((document.getElementById('mnA') || {}).value)), n = String((document.getElementById('mnN') || {}).value || '').trim().slice(0, 60), r = document.getElementById('mnR');
            const when = parseYmd(D.d) || new Date(); if (when.getTime() > Date.now() + 864e5) { this.showToast('التاريخ ما يصير بالمستقبل'); return; }
            if (!(a > 0)) { this.showToast('اكتب المبلغ'); return; }
            if (D.t === 'm' && D.w === D.w2) { this.showToast('اختار محفظتين مختلفتين'); return; }
            const wasP = plan(d), before = monthStats(d, ymOf(when)), bud = d.bud.t;
            const ts = ymd(when) === todayStr() ? Date.now() : when.getTime();
            const orig = D.id ? d.x.find((x) => x.i === D.id) : null;
            const rec = { i: D.id || uid8(), t: D.t, a, w: D.w, c: D.t === 'm' ? '' : D.c, n, d: orig && ymd(orig.d) === D.d ? orig.d : ts };
            if (D.t === 'm') rec.w2 = D.w2;
            if (D.id) { const k = d.x.findIndex((x) => x.i === D.id); if (k >= 0) { if (d.x[k].r) rec.r = d.x[k].r; d.x[k] = rec; } } else d.x.push(rec);
            if (!D.id && r && r.checked && D.t !== 'm') {
                const ym = ymOf(when);
                d.rc.push({ id: uid8(), t: D.t, a, c: D.c, w: D.w, n, day: Math.min(28, when.getDate()), last: ym, on: 1 });
            }
            this._mnSave(d); this._mnSheetClose(); M.draft = null; this._mnRender();
            // the tutor's quick word when a limit is crossed
            if (D.t === 'e') {
                const after = monthStats(d, ymOf(when));
                if (bud > 0 && before.exp < bud && after.exp >= bud) this.showToast('انتبه: تجاوزت ميزانية الشهر');
                else if (bud > 0 && before.exp < bud * 0.8 && after.exp >= bud * 0.8) this.showToast('وصلت 80% من ميزانية الشهر');
                else if (plan(d).sp > plan(d).base && wasP.sp <= wasP.base) this.showToast('تعديت حدك اليومي');
                else this.showToast('انحفظ');
            } else this.showToast('انحفظ');
        },
        mnDelTx(id) {
            const d = this._mnGet(), k = d ? d.x.findIndex((x) => x.i === id) : -1; if (k < 0) return;
            const gone = d.x.splice(k, 1)[0];
            this._mnSave(d); this._mnSheetClose(); M.draft = null; this._mnRender();
            this._mnUndo('انحذفت الحركة', () => { const dd = this._mnGet(); dd.x.push(gone); this._mnSave(dd); this._mnRender(); });
        },
        _mnUndo(msg, fn) {
            const old = document.getElementById('mnToast'); if (old) old.remove(); clearTimeout(M.toastT);
            const t = document.createElement('div'); t.id = 'mnToast'; t.className = 'mn-toast'; t.innerHTML = '<span>' + esc(msg) + '</span><button>تراجع</button>';
            t.querySelector('button').onclick = () => { t.remove(); fn(); };
            document.body.appendChild(t); M.toastT = setTimeout(() => t.remove(), 6000);
        },

        // ---------- wallets and the next income date ----------
        mnWalletEdit(id) {
            const d = this._mnGet(); if (!d) return;
            const w = d.w.find((x) => x.id === id), col = w ? w.c : WCOL[d.w.length % WCOL.length];
            M.wDraft = { id: id || '', c: col };
            this._mnSheet('<div class="mn-sh-t">' + (w ? 'تعديل المحفظة' : 'محفظة جديدة') + '</div>'
                + '<label class="mn-lb" for="mnWN">الاسم</label><input id="mnWN" class="mn-in" maxlength="20" value="' + esc(w ? w.n : '') + '" placeholder="كاش، بطاقة، زين كاش..." autocomplete="off">'
                + '<label class="mn-lb" for="mnWB">' + (w ? 'شكد فلوسك بيها هسه' : 'شكد فيها فلوس') + '</label><input id="mnWB" class="mn-in mn-big" inputmode="numeric" value="' + (w ? fmt(walletBal(d, w)) : '') + '" placeholder="0" oninput="app._mnMask(this)" autocomplete="off">'
                + '<div class="mn-lb">اللون</div><div class="mn-chips">' + WCOL.map((c) => '<button class="mn-dot' + (c === col ? ' on' : '') + '" style="--c:' + c + '" onclick="app.mnWColor(\'' + c + '\')" aria-label="لون"></button>').join('') + '</div>'
                + '<button class="mn-go" onclick="app.mnWalletSave()"><i data-lucide="check"></i>حفظ</button>'
                + (w && d.w.length > 1 ? '<button class="mn-del" onclick="app.mnWalletDel(\'' + w.id + '\')"><i data-lucide="trash-2"></i>حذف المحفظة وحركاتها</button>' : '')
                + '<div class="mn-sep"></div><button class="mn-link" onclick="app.mnTools()"><i data-lucide="settings-2"></i>نسخة احتياطية وتصدير</button>');
        },
        mnWColor(c) { M.wDraft.c = c; document.querySelectorAll('#mnSheet .mn-dot').forEach((b) => b.classList.toggle('on', b.style.getPropertyValue('--c') === c)); },
        mnWalletSave() {
            const d = this._mnGet(), W = M.wDraft; if (!d || !W) return;
            const n = String(document.getElementById('mnWN').value || '').trim().slice(0, 20) || 'محفظة', bal = Math.floor(num(document.getElementById('mnWB').value));
            let w = d.w.find((x) => x.id === W.id);
            if (!w) { if (d.w.length >= 6) { this.showToast('أكثر شي 6 محافظ'); return; } w = { id: 'w' + uid8(), n, c: W.c, b: bal }; d.w.push(w); }
            else { const cur = walletBal(d, w); w.n = n; w.c = W.c; w.b += bal - cur; }
            this._mnSave(d); this._mnSheetClose(); this._mnRender();
        },
        mnWalletDel(id) {
            const d = this._mnGet(); if (!d || d.w.length < 2) return;
            const w = d.w.find((x) => x.id === id), snap = JSON.stringify(d); if (!w) return;
            d.x = d.x.filter((t) => t.w !== id && t.w2 !== id); d.w = d.w.filter((x) => x.id !== id);
            d.rc.forEach((r) => { if (r.w === id) r.w = d.w[0].id; });
            this._mnSave(d); this._mnSheetClose(); this._mnRender();
            this._mnUndo('انحذفت المحفظة', () => { M.d = JSON.parse(snap); this._mnSave(M.d); this._mnRender(); });
        },
        mnNext() {
            const d = this._mnGet(); if (!d) return;
            const t = ymd(Date.now() + 864e5);
            this._mnSheet('<div class="mn-sh-t">متى يجيك المصروف الجاي؟</div><p class="mn-mut mn-c">أحسب شكد تصرف باليوم لحد هذا اليوم.</p>'
                + '<input id="mnNX" class="mn-in" type="date" min="' + t + '" value="' + (d.nx || '') + '">'
                + '<div class="mn-chips">' + [[7, 'بعد أسبوع'], [14, 'بعد أسبوعين'], [30, 'بعد شهر']].map((x) => '<button class="mn-chip" onclick="document.getElementById(\'mnNX\').value=\'' + ymd(Date.now() + x[0] * 864e5) + '\'">' + x[1] + '</button>').join('') + '</div>'
                + '<button class="mn-go" onclick="app.mnNextSave()"><i data-lucide="check"></i>حفظ</button>' + (d.nx ? '<button class="mn-del" onclick="app.mnNextSave(true)">رجّعه لآخر الشهر</button>' : ''));
        },
        mnNextSave(clear) {
            const d = this._mnGet(); const v = (document.getElementById('mnNX') || {}).value;
            if (clear) d.nx = ''; else if (parseYmd(v) && dayDiff(Date.now(), parseYmd(v)) >= 1) d.nx = v; else { this.showToast('اختار تاريخ جاي'); return; }
            this._mnSave(d); this._mnSheetClose(); this._mnRender();
        },

        // ---------- budget ----------
        _mnBudHtml(d) {
            const ym = ymOf(Date.now()), S = monthStats(d, ym), bud = d.bud;
            const total = '<div class="mn-card"><div class="mn-card-h"><b>ميزانية الشهر</b><button class="mn-link" onclick="app.mnBudEdit(\'\')">' + (bud.t ? 'تعديل' : 'حدد') + '</button></div>'
                + (bud.t ? (() => { const p = S.exp / bud.t, c = p >= 1 ? '#DC2626' : p >= 0.8 ? '#F59E0B' : '#0D9488'; return '<div class="mn-bud-n"><b>' + fmt(S.exp) + '</b><span> من ' + fmt(bud.t) + '</span></div><div class="mn-bar-t"><i style="width:' + Math.min(100, p * 100).toFixed(1) + '%;background:' + c + '"></i></div><div class="mn-mut">' + (p >= 1 ? 'تجاوزت بـ ' + fmt(S.exp - bud.t) : 'باقي ' + fmt(bud.t - S.exp) + ' (' + Math.round(100 - p * 100) + '%)') + '</div>'; })() : '<div class="mn-empty">حدد شكد تريد تصرف بالشهر، وأنبهك قبل ما تخلص.</div>') + '</div>';
            const rows = EXP.map((c) => {
                const lim = bud.c[c[0]] || 0, s = S.by[c[0]] || 0, p = lim ? s / lim : 0, col = p >= 1 ? '#DC2626' : p >= 0.8 ? '#F59E0B' : c[3];
                return '<button class="mn-brow" onclick="app.mnBudEdit(\'' + c[0] + '\')"><span class="mn-ic" style="--c:' + c[3] + '"><i data-lucide="' + c[2] + '"></i></span><span class="mn-row-t"><b>' + c[1] + '</b><span class="mn-bar-t sm"><i style="width:' + Math.min(100, p * 100).toFixed(1) + '%;background:' + col + '"></i></span></span><span class="mn-bn"><b>' + fmt(s) + '</b><small>' + (lim ? 'من ' + fmt(lim) : 'بلا حد') + '</small></span></button>';
            }).join('');
            const rec = d.rc.map((r) => { const c = cat(r.c); return '<div class="mn-rc"><span class="mn-ic" style="--c:' + c[3] + '"><i data-lucide="' + c[2] + '"></i></span><span class="mn-row-t"><b>' + esc(r.n || c[1]) + '</b><small>كل شهر يوم ' + r.day + ' · ' + (r.t === 'i' ? 'دخل' : 'مصروف') + '</small></span><span class="mn-amt ' + (r.t === 'i' ? 'i' : 'e') + '">' + fmt(r.a) + '</span><button class="mn-x" onclick="app.mnRcDel(\'' + r.id + '\')" aria-label="إيقاف"><i data-lucide="x"></i></button></div>'; }).join('');
            return total + '<div class="mn-card"><div class="mn-card-h"><b>حد لكل باب</b><span class="mn-mut">اضغط وحدد</span></div>' + rows + '</div>'
                + '<div class="mn-card"><div class="mn-card-h"><b>الدفعات المتكررة</b></div>' + (rec || '<div class="mn-empty">مثل إيجار أو إنترنت أو مصروف شهري. فعّل "يتكرر كل شهر" وأنت تضيف حركة.</div>') + '</div>';
        },
        mnBudEdit(k) {
            const d = this._mnGet(); if (!d) return;
            const cur = k ? d.bud.c[k] || 0 : d.bud.t;
            this._mnSheet('<div class="mn-sh-t">' + (k ? 'حد ' + cat(k)[1] : 'ميزانية الشهر كله') + '</div><label class="mn-lb" for="mnBL">الحد بالشهر (دينار)</label><input id="mnBL" class="mn-in mn-big" inputmode="numeric" value="' + (cur ? fmt(cur) : '') + '" placeholder="0" oninput="app._mnMask(this)" autocomplete="off">'
                + '<button class="mn-go" onclick="app.mnBudSave(\'' + k + '\')"><i data-lucide="check"></i>حفظ</button>' + (cur ? '<button class="mn-del" onclick="app.mnBudSave(\'' + k + '\',true)">شيل الحد</button>' : ''));
        },
        mnBudSave(k, clear) {
            const d = this._mnGet(); const v = clear ? 0 : Math.floor(num((document.getElementById('mnBL') || {}).value));
            if (k) { if (v > 0) d.bud.c[k] = v; else delete d.bud.c[k]; } else d.bud.t = v;
            this._mnSave(d); this._mnSheetClose(); this._mnRender();
        },
        mnRcDel(id) { const d = this._mnGet(); const k = d.rc.findIndex((r) => r.id === id); if (k < 0) return; const gone = d.rc.splice(k, 1)[0]; this._mnSave(d); this._mnRender(); this._mnUndo('وقفت الدفعة المتكررة', () => { this._mnGet().rc.push(gone); this._mnSave(); this._mnRender(); }); },

        // ---------- goals ----------
        _mnGoalsHtml(d) {
            const now = Date.now();
            const cards = d.g.map((g) => {
                const s = goalSaved(d, g), p = Math.min(1, s / g.target), done = s >= g.target;
                let eta = '';
                if (!done && g.due && parseYmd(g.due)) { const mo = Math.max(1, Math.ceil(dayDiff(now, parseYmd(g.due)) / 30)); eta = 'تحتاج ' + fmt((g.target - s) / mo) + ' بالشهر لحد ' + g.due; }
                return '<div class="mn-goal' + (done ? ' done' : '') + '"><div class="mn-goal-h"><span class="mn-ic" style="--c:#0F766E"><i data-lucide="' + esc(g.ic || 'target') + '"></i></span><span class="mn-row-t"><b>' + esc(g.n) + '</b><small>' + (done ? 'اكتمل الهدف، مبروك' : 'باقي ' + fmt(g.target - s)) + '</small></span><button class="mn-x" onclick="app.mnGoalEdit(\'' + g.id + '\')" aria-label="تعديل"><i data-lucide="pencil"></i></button></div>'
                    + '<div class="mn-goal-n"><b>' + (M.hide ? '••••' : fmt(s)) + '</b><span>من ' + fmt(g.target) + ' · ' + Math.round(p * 100) + '%</span></div><div class="mn-bar-t"><i style="width:' + (p * 100).toFixed(1) + '%;background:' + (done ? '#16A34A' : '#0F766E') + '"></i></div>'
                    + (eta ? '<div class="mn-mut">' + eta + '</div>' : '') + '<div class="mn-goal-b"><button class="mn-act mn-act-i" onclick="app.mnGoalMove(\'' + g.id + '\',1)"><i data-lucide="piggy-bank"></i>ضيف</button><button class="mn-act" onclick="app.mnGoalMove(\'' + g.id + '\',-1)"><i data-lucide="hand-coins"></i>اسحب</button></div></div>';
            }).join('');
            return '<div class="mn-hero mn-hero-g"><div class="mn-hero-t">أهدافك</div><p class="mn-hero-p">وفّر للجامعة أو لأي شي تريده. المبلغ اللي تضيفه للهدف ينخصم من محفظتك وينحسب مدخّر.</p></div>'
                + (cards || '<div class="mn-card"><div class="mn-empty">ماكو أهداف. ابدأ بهدف "مصاريف الجامعة".</div></div>')
                + '<button class="mn-go" onclick="app.mnGoalEdit(\'\')"><i data-lucide="plus"></i>هدف جديد</button>';
        },
        mnGoalEdit(id) {
            const d = this._mnGet(); if (!d) return;
            const g = d.g.find((x) => x.id === id);
            M.gDraft = { id: id || '', ic: g ? g.ic : 'graduation-cap' };
            this._mnSheet('<div class="mn-sh-t">' + (g ? 'تعديل الهدف' : 'هدف جديد') + '</div>'
                + (g ? '' : '<div class="mn-chips">' + GOAL_PRESETS.map((p) => '<button class="mn-chip" onclick="document.getElementById(\'mnGN\').value=\'' + p[0] + '\';app.mnGoalIc(\'' + p[1] + '\')">' + p[0] + '</button>').join('') + '</div>')
                + '<label class="mn-lb" for="mnGN">اسم الهدف</label><input id="mnGN" class="mn-in" maxlength="30" value="' + esc(g ? g.n : '') + '" autocomplete="off">'
                + '<label class="mn-lb" for="mnGT">المبلغ المطلوب (دينار)</label><input id="mnGT" class="mn-in mn-big" inputmode="numeric" value="' + (g ? fmt(g.target) : '') + '" placeholder="0" oninput="app._mnMask(this)" autocomplete="off">'
                + '<label class="mn-lb" for="mnGD">تريد توصله لحد (اختياري)</label><input id="mnGD" class="mn-in" type="date" value="' + (g && g.due ? g.due : '') + '">'
                + '<button class="mn-go" onclick="app.mnGoalSave()"><i data-lucide="check"></i>حفظ</button>' + (g ? '<button class="mn-del" onclick="app.mnGoalDel(\'' + g.id + '\')"><i data-lucide="trash-2"></i>حذف الهدف (الفلوس ترجع للمحفظة)</button>' : ''));
        },
        mnGoalIc(i) { if (M.gDraft) M.gDraft.ic = i; },
        mnGoalSave() {
            const d = this._mnGet(), G = M.gDraft; if (!d || !G) return;
            const n = String(document.getElementById('mnGN').value || '').trim().slice(0, 30), t = Math.floor(num(document.getElementById('mnGT').value)), due = document.getElementById('mnGD').value;
            if (!n || !(t > 0)) { this.showToast('اكتب اسم الهدف والمبلغ'); return; }
            let g = d.g.find((x) => x.id === G.id);
            if (!g) { if (d.g.length >= 12) { this.showToast('أكثر شي 12 هدف'); return; } g = { id: 'g' + uid8(), n, target: t, ic: G.ic, due: '' }; d.g.push(g); }
            g.n = n; g.target = t; g.ic = G.ic || g.ic; g.due = parseYmd(due) ? due : '';
            this._mnSave(d); this._mnSheetClose(); this._mnRender();
        },
        mnGoalDel(id) {
            const d = this._mnGet(), snap = JSON.stringify(d); if (!d) return;
            d.g = d.g.filter((g) => g.id !== id); d.x = d.x.filter((t) => !(t.t === 'g' && t.g === id));
            this._mnSave(d); this._mnSheetClose(); this._mnRender();
            this._mnUndo('انحذف الهدف', () => { M.d = JSON.parse(snap); this._mnSave(M.d); this._mnRender(); });
        },
        mnGoalMove(id, dir) {
            const d = this._mnGet(), g = d && d.g.find((x) => x.id === id); if (!g) return;
            M.mv = { id, dir, w: d.w[0].id };
            this._mnMoveSheet();
        },
        _mnMoveSheet() {
            const d = this._mnGet(), V = M.mv, g = d.g.find((x) => x.id === V.id); if (!g) return;
            const saved = goalSaved(d, g);
            this._mnSheet('<div class="mn-sh-t">' + (V.dir > 0 ? 'ضيف لهدف "' : 'اسحب من هدف "') + esc(g.n) + '"</div>'
                + '<label class="mn-lb" for="mnMA">المبلغ</label><input id="mnMA" class="mn-in mn-big" inputmode="numeric" placeholder="0" oninput="app._mnMask(this)" autocomplete="off">'
                + '<div class="mn-chips">' + (V.dir > 0 ? [5000, 10000, 25000, 50000] : [Math.min(saved, 5000), Math.min(saved, 10000), saved].filter((v, i, a) => v > 0 && a.indexOf(v) === i)).map((v) => '<button class="mn-chip" onclick="document.getElementById(\'mnMA\').value=' + "'" + fmt(v) + "'" + '">' + fmt(v) + '</button>').join('') + '</div>'
                + '<div class="mn-lb">' + (V.dir > 0 ? 'من أي محفظة' : 'ترجع لأي محفظة') + '</div><div class="mn-chips">' + d.w.map((w) => '<button class="mn-chip' + (V.w === w.id ? ' on' : '') + '" style="--c:' + w.c + '" onclick="app.mnMoveW(\'' + w.id + '\')">' + esc(w.n) + '</button>').join('') + '</div>'
                + '<button class="mn-go" onclick="app.mnMoveSave()"><i data-lucide="check"></i>تأكيد</button>');
        },
        mnMoveW(w) { const a = (document.getElementById('mnMA') || {}).value; M.mv.w = w; this._mnMoveSheet(); const el = document.getElementById('mnMA'); if (el && a) el.value = a; },
        mnMoveSave() {
            const d = this._mnGet(), V = M.mv; if (!d || !V) return;
            const g = d.g.find((x) => x.id === V.id), a = Math.floor(num((document.getElementById('mnMA') || {}).value)); if (!g) return;
            if (!(a > 0)) { this.showToast('اكتب المبلغ'); return; }
            const w = d.w.find((x) => x.id === V.w);
            if (V.dir > 0 && walletBal(d, w) < a) { this.showToast('الفلوس بالمحفظة ما تكفي'); return; }
            if (V.dir < 0 && goalSaved(d, g) < a) { this.showToast('المدخر بالهدف أقل من هذا المبلغ'); return; }
            const before = goalSaved(d, g);
            d.x.push({ i: uid8(), t: 'g', a: V.dir * a, w: V.w, g: g.id, c: '', n: '', d: Date.now() });
            this._mnSave(d); this._mnSheetClose(); this._mnRender();
            this.showToast(before < g.target && goalSaved(d, g) >= g.target ? 'مبروك! وصلت هدف ' + g.n : 'انحفظ');
        },

        // ---------- reports ----------
        _mnRepHtml(d) {
            const S = monthStats(d, M.ym), prev = monthStats(d, shiftYm(M.ym, -1)), cur = M.ym === ymOf(Date.now());
            const keys = Object.keys(S.by).sort((a, b) => S.by[b] - S.by[a]);
            const parts = keys.map((k) => ({ k, v: S.by[k], c: cat(k)[3] }));
            const dim = cur ? new Date().getDate() : daysIn(M.ym), avg = dim ? S.exp / dim : 0;
            const days = []; for (let i = 13; i >= 0; i--) days.push(ymd(Date.now() - i * 864e5));
            const dv = days.map((ds) => spentOn(d, ds)).reverse(), dl = days.map((ds) => String(+ds.slice(8))).reverse();
            const months = []; for (let i = 5; i >= 0; i--) months.push(shiftYm(ymOf(Date.now()), -i));
            const mv = months.map((m) => monthStats(d, m));
            const mx = Math.max(1, ...mv.map((x) => Math.max(x.inc, x.exp)));
            const trend = '<div class="mn-trend">' + months.map((m, i) => '<div class="mn-tm"><div class="mn-tb"><i class="i" style="height:' + Math.max(2, mv[i].inc / mx * 100) + '%"></i><i class="e" style="height:' + Math.max(2, mv[i].exp / mx * 100) + '%"></i></div><small>' + MONTHS[+m.slice(5) - 1].split(' ')[0] + '</small></div>').join('') + '</div>';
            const noSpend = (() => { let n = 0; for (let i = 1; i <= dim; i++) { const ds = M.ym + '-' + pad(i); if (spentOn(d, ds) === 0) n++; } return n; })();
            const big = inMonth(d, M.ym).filter((t) => t.t === 'e').sort((a, b) => b.a - a.a).slice(0, 5);
            const delta = prev.exp > 0 ? Math.round((S.exp / prev.exp - 1) * 100) : null;
            return this._mnMonthNav()
                + '<div class="mn-kpis"><div><small>الدخل</small><b class="i">' + fmt(S.inc) + '</b></div><div><small>المصروف</small><b class="e">' + fmt(S.exp) + '</b></div><div><small>الصافي</small><b>' + iqd(S.inc - S.exp) + '</b></div><div><small>معدل اليوم</small><b>' + fmt(avg) + '</b></div></div>'
                + '<div class="mn-card"><div class="mn-card-h"><b>على شنو تصرف</b>' + (delta !== null ? '<span class="mn-pill ' + (delta > 0 ? 'e' : 'i') + '">' + (delta > 0 ? '+' : '') + delta + '% عن الشهر اللي قبل</span>' : '') + '</div>'
                + (parts.length ? '<div class="mn-dn">' + donut(parts, S.exp) + '<div class="mn-leg">' + parts.slice(0, 6).map((p) => '<div><i style="background:' + p.c + '"></i><span>' + cat(p.k)[1] + '</span><b>' + Math.round(p.v / S.exp * 100) + '%</b></div>').join('') + '</div></div>' : '<div class="mn-empty">ماكو مصاريف بهذا الشهر.</div>') + '</div>'
                + '<div class="mn-card"><div class="mn-card-h"><b>آخر 14 يوم</b><span class="mn-mut">أيام بلا صرف: ' + noSpend + '</span></div>' + bars(dv, dl, 0) + '</div>'
                + '<div class="mn-card"><div class="mn-card-h"><b>آخر 6 شهور</b><span class="mn-mut"><i class="mn-lg i"></i>دخل <i class="mn-lg e"></i>مصروف</span></div>' + trend + '</div>'
                + (big.length ? '<div class="mn-card"><div class="mn-card-h"><b>أكبر المصاريف</b></div>' + big.map((t) => this._mnRow(d, t)).join('') + '</div>' : '')
                + '<div class="mn-card"><div class="mn-card-h"><b>أدوات</b></div><div class="mn-tools"><button class="mn-act" onclick="app.mnExportCsv()"><i data-lucide="file-spreadsheet"></i>تصدير CSV</button><button class="mn-act" onclick="app.mnTools()"><i data-lucide="database-backup"></i>نسخة احتياطية</button></div></div>';
        },

        // ---------- backup and export ----------
        mnTools() {
            this._mnSheet('<div class="mn-sh-t">نسخة احتياطية وتصدير</div><p class="mn-mut mn-c">بياناتك محفوظة بهذا الجهاز، ونسخة بحسابك إذا اشتغلت المزامنة. تقدر تاخذ نسخة تحتفظ بيها.</p>'
                + '<button class="mn-go" onclick="app.mnBackup()"><i data-lucide="copy"></i>انسخ النسخة الاحتياطية</button>'
                + '<label class="mn-lb" for="mnRB">استرجاع: الصق النسخة هنا</label><textarea id="mnRB" class="mn-in mn-ta" placeholder="الصق النسخة الاحتياطية" dir="ltr"></textarea>'
                + '<button class="mn-act mn-wide" onclick="app.mnRestore()"><i data-lucide="rotate-ccw"></i>استرجع من النسخة</button>'
                + '<button class="mn-act mn-wide" onclick="app.mnExportCsv()"><i data-lucide="file-spreadsheet"></i>تصدير الحركات CSV</button>'
                + '<div class="mn-sep"></div><button class="mn-del" onclick="app.mnReset()"><i data-lucide="trash-2"></i>مسح كل بياناتي</button>');
        },
        async _mnCopy(text) {
            try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
            try { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch (e) { return false; }
        },
        async mnBackup() { const d = this._mnGet(); if (!d) return; this.showToast((await this._mnCopy(JSON.stringify(d))) ? 'اننسخت النسخة الاحتياطية، الصقها بمكان آمن' : 'ما كدرت أنسخ'); },
        mnRestore() {
            let c = null; try { c = JSON.parse((document.getElementById('mnRB') || {}).value || ''); } catch (e) {}
            if (!c || !Array.isArray(c.w) || !Array.isArray(c.x) || !c.w.length) { this.showToast('هذي مو نسخة صحيحة'); return; }
            c.g = c.g || []; c.rc = c.rc || []; c.bud = c.bud || { t: 0, c: {} };
            this._mnSave(c); M.setup = false; this._mnSheetClose(); this._mnRender(); this.showToast('انسترجعت البيانات');
        },
        async mnExportCsv() {
            const d = this._mnGet(); if (!d) return;
            const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
            const rows = [['التاريخ', 'النوع', 'الباب', 'المحفظة', 'المبلغ', 'ملاحظة']].concat(d.x.slice().sort((a, b) => a.d - b.d).map((t) => {
                const w = (d.w.find((x) => x.id === t.w) || {}).n || '';
                const kind = t.t === 'e' ? 'مصروف' : t.t === 'i' ? 'دخل' : t.t === 'm' ? 'تحويل' : 'ادخار';
                return [ymd(t.d), kind, t.t === 'e' || t.t === 'i' ? cat(t.c)[1] : '', w, t.a, t.n || ''];
            }));
            const text = '﻿' + rows.map((r) => r.map(q).join(',')).join('\n');
            try {
                const file = new File([text], 'مصاريفي.csv', { type: 'text/csv' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: 'مصاريفي' }); return; }
            } catch (e) { if (e && e.name === 'AbortError') return; }
            this.showToast((await this._mnCopy(text)) ? 'اننسخت الحركات، الصقها بملف أو إكسل' : 'ما كدرت أصدّر');
        },
        mnReset() {
            this._mnSheet('<div class="mn-sh-t">تمسح كل شي؟</div><p class="mn-mut mn-c">تنمسح المحافظ والحركات والأهداف من هذا الجهاز ومن نسختك بالحساب.</p><button class="mn-del" onclick="app.mnResetGo()"><i data-lucide="trash-2"></i>إي، امسح كل شي</button><button class="mn-act mn-wide" onclick="app._mnSheetClose()">لا، رجوع</button>');
        },
        mnResetGo() {
            try { localStorage.removeItem(this._mnKey()); localStorage.removeItem('isp:mn:sum:' + (this.authUid || 'guest')); } catch (e) {}
            try { if (window.firebaseDb && this.authUid && !M.cloudOff) window.firebaseDbHelpers.remove(window.firebaseDbHelpers.ref(window.firebaseDb, 'userMoney/' + this.authUid)).catch(() => {}); } catch (e) {}
            M.d = null; M.setup = true; M.pulled = null; this._mnSheetClose(); this._mnRender();
        },
        mnAskTutor() {
            this.goToTutor();
            this._need('tutor').then(() => setTimeout(() => { if (this.ttAsk) this.ttAsk('راجع مصاريفي وكلي شنو أسوي حتى أوفر وتكفيني فلوسي'); }, 700)).catch(() => {});
        },
    });
})();
