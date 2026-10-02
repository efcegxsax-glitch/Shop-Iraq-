// جدولي: the student's weekly lecture timetable. They choose which days are school days and
// which are holidays, how many lectures a day, the lecture times, and how many lectures each
// subject has in the week; the app can spread the subjects over the week by itself and every
// cell can be edited afterwards. It can be printed (or saved as PDF), saved as a picture, and the
// tutor reads it (app._tbSummary, in js/app.js) to walk the student through the week.
// Kept on the phone: isp:tb:<uid>. Loaded on demand by app._need('table').
(function () {
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const ORDER = [6, 0, 1, 2, 3, 4, 5]; // Iraq's week starts on Saturday in the table
    const COLORS = ['#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#16A34A', '#CA8A04', '#0891B2', '#DC2626', '#4F46E5', '#65A30D', '#C026D3'];
    const DEFAULT_SUBS = [['الإسلامية', 2], ['العربي', 4], ['الإنكليزي', 4], ['الرياضيات', 5], ['الفيزياء', 4], ['الكيمياء', 4], ['الأحياء', 4]];
    const mins = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : 0; };
    const hhmm = (n) => { n = ((Math.round(n) % 1440) + 1440) % 1440; return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };
    const T = { setup: false, draft: null };

    const makeTimes = (n, start, len, gap) => Array.from({ length: n }, (_, i) => [hhmm(mins(start) + i * (len + gap)), hhmm(mins(start) + i * (len + gap) + len)]);
    const sub = (d, id) => d.subs.find((x) => x.id === id) || null;
    const workDays = (d) => ORDER.filter((g) => d.days[g] === 1);
    const shownDays = (d) => ORDER.filter((g) => d.days[g] === 1 || d.days[g] === 2);

    function blank() {
        const days = {}; ORDER.forEach((g) => { days[g] = [0, 1, 2, 3, 4].includes(g) ? 1 : (g === 5 ? 2 : 0); });
        return { v: 1, days, times: makeTimes(6, '08:00', 45, 5), subs: DEFAULT_SUBS.map((x, i) => ({ id: 's' + i, n: x[0], c: COLORS[i % COLORS.length], k: x[1] })), cells: {}, set: { n: 6, start: '08:00', len: 45, gap: 5 } };
    }

    // spreads each subject's weekly lectures over the school days, a subject once a day when it can
    function distribute(d) {
        const days = workDays(d), n = d.times.length, grid = {};
        days.forEach((g) => { grid[g] = Array(n).fill(null); });
        if (!days.length) return grid;
        let subs = d.subs.filter((s) => s.k > 0).map((s) => ({ id: s.id, k: s.k }));
        const total = subs.reduce((a, s) => a + s.k, 0), cap = days.length * n;
        if (total > cap) { const f = cap / total; subs = subs.map((s) => ({ id: s.id, k: Math.max(1, Math.floor(s.k * f)) })); }
        subs.sort((a, b) => b.k - a.k);
        const fill = (g) => grid[g].filter(Boolean).length;
        subs.forEach((s) => {
            let last = -1, lastP = -1;
            for (let i = 0; i < s.k; i++) {
                const ok = days.filter((g) => fill(g) < n);
                if (!ok.length) return;
                const fresh = ok.filter((g) => !grid[g].some((c) => c && c.s === s.id));
                const pool = fresh.length ? fresh : ok;
                pool.sort((a, b) => fill(a) - fill(b) || Math.abs(days.indexOf(b) - last) - Math.abs(days.indexOf(a) - last) || days.indexOf(a) - days.indexOf(b));
                const g = pool[0];
                const free = grid[g].map((c, p) => (c ? -1 : p)).filter((p) => p >= 0);
                const p = free.find((q) => q !== lastP) !== undefined ? free.find((q) => q !== lastP) : free[0];
                grid[g][p] = { s: s.id, t: '' };
                last = days.indexOf(g); lastP = p;
            }
        });
        return grid;
    }

    Object.assign(app, {
        tbOpen() {
            T.setup = !this._tbGet();
            T.draft = null;
            this._tbRender();
            if (!T.timer) T.timer = setInterval(() => this._tbHero(), 30000);
        },
        tbClose() {
            if (T.timer) { clearInterval(T.timer); T.timer = null; }
            this._tbSheetClose();
            const c = document.getElementById('tbContent'); if (c) c.innerHTML = '';
        },
        _tbSave(d) { try { localStorage.setItem(this._tbKey(), JSON.stringify(d)); } catch (e) { this.showToast('ما كدرت أحفظ الجدول'); } },

        _tbRender() {
            const box = document.getElementById('tbContent');
            if (!box) return;
            box.innerHTML = '<div class="tb-wrap">' + (T.setup ? this._tbSetupHtml() : this._tbMainHtml()) + '</div>';
            if (window.lucide) lucide.createIcons();
            if (!T.setup) this._tbHero();
        },

        // ---------- setup ----------
        _tbSetupHtml() {
            const d = T.draft || (T.draft = JSON.parse(JSON.stringify(this._tbGet() || blank())));
            const st = ['غير مفعّل', 'دوام', 'عطلة'];
            const chips = ORDER.map((g) => '<button type="button" class="tb-chip s' + d.days[g] + '" onclick="app.tbDay(' + g + ')">' + NAMES[g] + '<small>' + st[d.days[g]] + '</small></button>').join('');
            const stp = (label, val, fn, unit) => '<div class="tb-row"><span>' + label + '</span><div class="tb-step"><button type="button" onclick="app.' + fn + '(-1)">-</button><b>' + val + (unit ? '<small>' + unit + '</small>' : '') + '</b><button type="button" onclick="app.' + fn + '(1)">+</button></div></div>';
            const subs = d.subs.map((s, i) => '<div class="tb-row"><span class="tb-dot" style="background:' + s.c + '"></span><span class="tb-sn">' + esc(s.n) + '</span><div class="tb-step"><button type="button" onclick="app.tbSubK(' + i + ',-1)">-</button><b>' + s.k + '</b><button type="button" onclick="app.tbSubK(' + i + ',1)">+</button></div><button type="button" class="tb-x" onclick="app.tbSubDel(' + i + ')" aria-label="حذف">&times;</button></div>').join('');
            const total = d.subs.reduce((a, s) => a + s.k, 0), cap = workDays(d).length * d.set.n;
            return '<div class="tb-hero tb-hero-s"><div class="tb-hero-t">سوّي جدولك الدراسي</div><div class="tb-hero-p">اختار أيام الدوام والعطلة، عدد المحاضرات، وكم محاضرة لكل مادة، والتطبيق يوزّعها عليك وتكدر تعدّل بعدها.</div></div>'
                + '<div class="tb-card"><h3>1. أيام الأسبوع</h3><p class="tb-hint">اضغط اليوم يتبدل: غير مفعّل، دوام، عطلة.</p><div class="tb-chips">' + chips + '</div></div>'
                + '<div class="tb-card"><h3>2. المحاضرات</h3>' + stp('عدد المحاضرات باليوم', d.set.n, 'tbSetN', '') + stp('مدة المحاضرة', d.set.len, 'tbSetLen', ' د') + stp('الاستراحة بين المحاضرات', d.set.gap, 'tbSetGap', ' د')
                + '<div class="tb-row"><span>بداية أول محاضرة</span><input type="time" id="tbStart" value="' + d.set.start + '" onchange="app.tbSetStart(this.value)" class="tb-time"></div></div>'
                + '<div class="tb-card"><h3>3. المواد وعدد محاضراتها بالأسبوع</h3>' + subs
                + '<div class="tb-add"><input id="tbNew" maxlength="30" placeholder="مادة جديدة" onkeydown="if(event.key===\'Enter\')app.tbSubAdd()"><button type="button" onclick="app.tbSubAdd()">إضافة</button></div>'
                + '<div class="tb-total' + (total > cap ? ' bad' : '') + '">المجموع ' + total + ' محاضرة، والمتاح ' + cap + (total > cap ? ' (راح تتقلّص شوية حتى تكفي)' : '') + '</div></div>'
                + '<button class="tb-main" onclick="app.tbBuild(true)">احفظ ووزّع المواد تلقائياً</button>'
                + (this._tbGet() ? '<button class="tb-sec" onclick="app.tbBuild(false)">احفظ بدون ما أغيّر توزيعي</button><button class="tb-sec" onclick="app.tbCancelSetup()">إلغاء</button>' : '');
        },
        tbDay(g) { const d = T.draft; d.days[g] = (d.days[g] + 1) % 3; this._tbRender(); },
        tbSetN(x) { const s = T.draft.set; s.n = Math.min(10, Math.max(1, s.n + x)); this._tbRender(); },
        tbSetLen(x) { const s = T.draft.set; s.len = Math.min(120, Math.max(20, s.len + x * 5)); this._tbRender(); },
        tbSetGap(x) { const s = T.draft.set; s.gap = Math.min(30, Math.max(0, s.gap + x * 5)); this._tbRender(); },
        tbSetStart(v) { if (/^\d{1,2}:\d{2}$/.test(v)) T.draft.set.start = v; },
        tbSubK(i, x) { const s = T.draft.subs[i]; s.k = Math.min(12, Math.max(0, s.k + x)); this._tbRender(); },
        tbSubDel(i) { T.draft.subs.splice(i, 1); this._tbRender(); },
        tbSubAdd() {
            const el = document.getElementById('tbNew'), n = el && el.value.trim();
            if (!n) return;
            const d = T.draft;
            if (d.subs.some((s) => s.n === n)) { this.showToast('هذه المادة موجودة'); return; }
            if (d.subs.length >= 14) { this.showToast('وصلت الحد الأعلى للمواد'); return; }
            const used = d.subs.map((s) => s.c), c = COLORS.find((x) => !used.includes(x)) || COLORS[d.subs.length % COLORS.length];
            d.subs.push({ id: 's' + Date.now().toString(36), n: n.slice(0, 30), c, k: 2 });
            this._tbRender();
            const e2 = document.getElementById('tbNew'); if (e2) e2.focus();
        },
        tbCancelSetup() { T.setup = false; T.draft = null; this._tbRender(); },
        tbBuild(auto) {
            const d = T.draft; if (!d) return;
            if (!workDays(d).length) { this.showToast('اختار يوم دوام واحد على الأقل'); return; }
            if (!d.subs.length) { this.showToast('أضف مادة وحدة على الأقل'); return; }
            const old = this._tbGet();
            d.times = old && old.times.length === d.set.n && !auto ? old.times : makeTimes(d.set.n, d.set.start, d.set.len, d.set.gap);
            if (auto || !old) {
                const g = distribute(d); d.cells = {};
                Object.keys(g).forEach((k) => { d.cells[k] = g[k]; });
            } else {
                const keep = {};
                Object.keys(old.cells || {}).forEach((k) => { if (d.days[k] === 1) keep[k] = (old.cells[k] || []).slice(0, d.set.n).map((c) => (c && sub(d, c.s) ? c : null)); });
                d.cells = keep;
            }
            workDays(d).forEach((g) => { const a = d.cells[g] || (d.cells[g] = []); while (a.length < d.set.n) a.push(null); });
            this._tbSave(d); T.setup = false; T.draft = null;
            this.showToast('انحفظ جدولك');
            this._tbRender();
        },

        // ---------- the timetable ----------
        _tbGridHtml(d, forPrint) {
            const cols = shownDays(d), today = new Date().getDay(), now = new Date();
            const cur = this._tbNow(d);
            let h = '<div class="tb-scroll"><table class="tb-grid" style="min-width:' + (50 + cols.length * 68) + 'px"><thead><tr><th class="tb-p0"></th>'
                + cols.map((g) => '<th class="' + (g === today ? 'today ' : '') + (d.days[g] === 2 ? 'off' : '') + '" onclick="app.tbDayMenu(' + g + ')">' + NAMES[g] + '</th>').join('') + '</tr></thead><tbody>';
            d.times.forEach((t, p) => {
                h += '<tr><th class="tb-p" onclick="app.tbPeriod(' + p + ')"><b>' + (p + 1) + '</b><small>' + t[0] + '</small><small>' + t[1] + '</small></th>';
                cols.forEach((g) => {
                    if (d.days[g] === 2) { if (p === 0) h += '<td class="tb-off" rowspan="' + d.times.length + '"><span>عطلة</span></td>'; return; }
                    const c = (d.cells[g] || [])[p], s = c && sub(d, c.s);
                    const on = cur && cur.day === g && cur.p === p;
                    h += s ? '<td class="tb-c' + (on ? ' now' : '') + '" style="--c:' + s.c + '" onclick="app.tbCell(' + g + ',' + p + ')"><b>' + esc(s.n) + '</b>' + (c.t ? '<small>' + esc(c.t) + '</small>' : '') + '</td>'
                        : '<td class="tb-c e' + (on ? ' now' : '') + '" onclick="app.tbCell(' + g + ',' + p + ')"><i>+</i></td>';
                });
                h += '</tr>';
            });
            return h + '</tbody></table></div>';
        },

        _tbMainHtml() {
            const d = this._tbGet(); if (!d) { T.setup = true; return this._tbSetupHtml(); }
            const placed = {}; let total = 0;
            Object.keys(d.cells).forEach((g) => { if (d.days[g] === 1) (d.cells[g] || []).forEach((c) => { if (c && sub(d, c.s)) { placed[c.s] = (placed[c.s] || 0) + 1; total++; } }); });
            const stats = d.subs.map((s) => { const n = placed[s.id] || 0; return '<div class="tb-st" style="--c:' + s.c + '"><i></i><span>' + esc(s.n) + '</span><b>' + n + (s.k && s.k !== n ? '<small>/' + s.k + '</small>' : '') + '</b></div>'; }).join('');
            return '<div class="tb-hero" id="tbHero"></div>'
                + '<div class="tb-card tb-gridcard"><div class="tb-head"><h3>جدولي الأسبوعي</h3><span class="tb-hint">اضغط أي خانة تعدّلها</span></div>' + this._tbGridHtml(d) + '</div>'
                + '<div class="tb-card"><div class="tb-head"><h3>محاضرات الأسبوع</h3><b class="tb-tot">' + total + '</b></div><div class="tb-stats">' + stats + '</div></div>'
                + '<div class="tb-acts">'
                + '<button onclick="app.tbAsk()" class="tb-act hi"><i data-lucide="sparkles"></i>اسأل المعلم عن جدولي</button>'
                + '<button onclick="app.tbPrint()" class="tb-act"><i data-lucide="printer"></i>طباعة / PDF</button>'
                + '<button onclick="app.tbImage()" class="tb-act"><i data-lucide="image"></i>حفظ كصورة</button>'
                + '<button onclick="app.tbSetup()" class="tb-act"><i data-lucide="settings-2"></i>الأيام والمواد</button>'
                + '<button onclick="app.tbRedo()" class="tb-act"><i data-lucide="wand-2"></i>وزّع من جديد</button>'
                + '<button onclick="app.tbClear()" class="tb-act warn"><i data-lucide="trash-2"></i>امسح الجدول</button></div>';
        },

        // the lecture now, or the next one today
        _tbNow(d) {
            const now = new Date(), g = now.getDay(), m = now.getHours() * 60 + now.getMinutes();
            if (d.days[g] !== 1) return null;
            for (let p = 0; p < d.times.length; p++) {
                const a = mins(d.times[p][0]), b = mins(d.times[p][1]), c = (d.cells[g] || [])[p];
                if (!c || !sub(d, c.s)) continue;
                if (m >= a && m < b) return { day: g, p, now: true, left: b - m, s: sub(d, c.s) };
                if (m < a) return { day: g, p, now: false, left: a - m, s: sub(d, c.s), at: d.times[p][0] };
            }
            return { day: g, p: -1, done: true };
        },

        _tbHero() {
            const box = document.getElementById('tbHero'), d = this._tbGet();
            if (!box || !d) return;
            const g = new Date().getDay(), list = (d.cells[g] || []).filter((c) => c && sub(d, c.s)).length;
            let line = '', big = NAMES[g];
            if (d.days[g] === 2) line = 'اليوم عطلة، ارتاح وراجع شوية';
            else if (d.days[g] !== 1) line = 'اليوم مو من أيام جدولك';
            else {
                const x = this._tbNow(d), fmt = (m) => (m >= 60 ? Math.floor(m / 60) + ' ساعة' + (m % 60 ? ' و' + (m % 60) + ' دقيقة' : '') : m + ' دقيقة');
                if (!list) line = 'ماكو محاضرات اليوم';
                else if (x && x.now) line = 'هسه محاضرة ' + x.s.n + '، تخلص بعد ' + fmt(x.left);
                else if (x && !x.done) line = 'الجاية ' + x.s.n + ' الساعة ' + x.at + '، بعد ' + fmt(x.left);
                else line = 'خلصت محاضرات اليوم، وقت المراجعة';
            }
            box.innerHTML = '<div class="tb-hero-d">' + big + '</div><div class="tb-hero-n"><b>' + list + '</b> محاضرة اليوم</div><div class="tb-hero-l">' + esc(line) + '</div>';
        },

        // ---------- editing ----------
        _tbSheet(html) {
            this._tbSheetClose();
            const s = document.createElement('div'); s.className = 'tb-sheet'; s.id = 'tbSheet';
            s.innerHTML = '<div class="tb-back" onclick="app._tbSheetClose()"></div><div class="tb-sh"><div class="tb-grab"></div>' + html + '</div>';
            document.body.appendChild(s);
            requestAnimationFrame(() => s.classList.add('on'));
            if (window.lucide) lucide.createIcons();
        },
        _tbSheetClose() { const s = document.getElementById('tbSheet'); if (s) { s.classList.remove('on'); setTimeout(() => s.remove(), 250); } },

        tbCell(g, p) {
            const d = this._tbGet(), c = (d.cells[g] || [])[p] || {};
            T.edit = { g, p, s: c.s || '' };
            const chips = d.subs.map((s) => '<button type="button" class="tb-pick' + (c.s === s.id ? ' on' : '') + '" style="--c:' + s.c + '" data-s="' + s.id + '" onclick="app.tbPickSub(this)">' + esc(s.n) + '</button>').join('');
            this._tbSheet('<div class="tb-sh-t">' + NAMES[g] + ' - المحاضرة ' + (p + 1) + '<small>' + d.times[p][0] + ' - ' + d.times[p][1] + '</small></div><div class="tb-picks">' + chips + '<button type="button" class="tb-pick' + (c.s ? '' : ' on') + '" data-s="" onclick="app.tbPickSub(this)">فارغة</button></div>'
                + '<input id="tbNote" class="tb-note" maxlength="40" placeholder="ملاحظة (اسم المدرس أو القاعة)" value="' + esc(c.t || '') + '">'
                + '<button class="tb-main" onclick="app.tbCellSave()">حفظ</button>');
        },
        tbPickSub(el) {
            T.edit.s = el.dataset.s;
            document.querySelectorAll('#tbSheet .tb-pick').forEach((b) => b.classList.toggle('on', b === el));
        },
        tbCellSave() {
            const d = this._tbGet(), e = T.edit; if (!d || !e) return;
            const a = d.cells[e.g] || (d.cells[e.g] = []);
            while (a.length < d.times.length) a.push(null);
            a[e.p] = e.s ? { s: e.s, t: String((document.getElementById('tbNote') || {}).value || '').slice(0, 40) } : null;
            this._tbSave(d); this._tbSheetClose(); this._tbRender();
        },
        tbPeriod(p) {
            const d = this._tbGet(); T.pe = p;
            this._tbSheet('<div class="tb-sh-t">وقت المحاضرة ' + (p + 1) + '</div><div class="tb-row"><span>تبدأ</span><input type="time" id="tbT0" class="tb-time" value="' + d.times[p][0] + '"></div><div class="tb-row"><span>تخلص</span><input type="time" id="tbT1" class="tb-time" value="' + d.times[p][1] + '"></div><button class="tb-main" onclick="app.tbPeriodSave()">حفظ</button>');
        },
        tbPeriodSave() {
            const d = this._tbGet(), a = document.getElementById('tbT0').value, b = document.getElementById('tbT1').value;
            if (!/^\d{1,2}:\d{2}$/.test(a) || !/^\d{1,2}:\d{2}$/.test(b) || mins(b) <= mins(a)) { this.showToast('الوقت غير صحيح'); return; }
            d.times[T.pe] = [hhmm(mins(a)), hhmm(mins(b))];
            this._tbSave(d); this._tbSheetClose(); this._tbRender();
        },
        tbDayMenu(g) {
            const d = this._tbGet(); T.dm = g;
            this._tbSheet('<div class="tb-sh-t">' + NAMES[g] + '</div><button class="tb-sec" onclick="app.tbDayDo(\'off\')">' + (d.days[g] === 2 ? 'رجّعه يوم دوام' : 'خلّيه عطلة') + '</button><button class="tb-sec" onclick="app.tbDayDo(\'clear\')">امسح محاضرات هذا اليوم</button><button class="tb-sec" onclick="app.tbDayDo(\'hide\')">شيله من الجدول</button>');
        },
        tbDayDo(w) {
            const d = this._tbGet(), g = T.dm;
            if (w === 'off') d.days[g] = d.days[g] === 2 ? 1 : 2;
            if (w === 'hide') d.days[g] = 0;
            if (w === 'clear') d.cells[g] = Array(d.times.length).fill(null);
            if (d.days[g] === 1 && !d.cells[g]) d.cells[g] = Array(d.times.length).fill(null);
            this._tbSave(d); this._tbSheetClose(); this._tbRender();
        },
        tbSetup() { T.setup = true; T.draft = null; this._tbRender(); window.scrollTo(0, 0); },
        tbRedo() {
            const d = this._tbGet(); if (!d) return;
            if (!confirm('أوزّع المواد من جديد؟ تعديلاتك على الخانات راح تنمسح.')) return;
            const g = distribute(d); d.cells = {}; Object.keys(g).forEach((k) => { d.cells[k] = g[k]; });
            this._tbSave(d); this._tbRender(); this.showToast('انوزّع الجدول من جديد');
        },
        tbClear() {
            if (!confirm('تمسح الجدول كله؟')) return;
            try { localStorage.removeItem(this._tbKey()); } catch (e) {}
            T.setup = true; T.draft = null; this._tbRender();
        },

        // ---------- tutor, print, picture ----------
        tbAsk() {
            this._need('tutor').then(() => {
                this.goToTutor();
                setTimeout(() => this.ttAsk('شوف جدولي وكلي هلكد محاضرة آخذ اليوم وباچر وبالأسبوع، وشنو أراجع قبلها'), 700);
            }).catch(() => this.showToast('ما انحمل المعلم، حاول مرة ثانية'));
        },

        _tbPrintHtml(d) {
            const cols = shownDays(d);
            const rows = d.times.map((t, p) => '<tr><th>' + (p + 1) + '<small>' + t[0] + ' - ' + t[1] + '</small></th>' + cols.map((g) => {
                if (d.days[g] === 2) return p === 0 ? '<td class="off" rowspan="' + d.times.length + '">عطلة</td>' : '';
                const c = (d.cells[g] || [])[p], s = c && sub(d, c.s);
                return s ? '<td style="background:' + s.c + '22;border-top:4px solid ' + s.c + '"><b>' + esc(s.n) + '</b>' + (c.t ? '<small>' + esc(c.t) + '</small>' : '') + '</td>' : '<td></td>';
            }).join('') + '</tr>').join('');
            const leg = d.subs.map((s) => '<span><i style="background:' + s.c + '"></i>' + esc(s.n) + '</span>').join('');
            return '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>جدولي الدراسي</title><style>'
                + '@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif;color:#0E1F1B}'
                + 'h1{margin:0 0 4px;font-size:22px;color:#0F766E}p{margin:0 0 12px;color:#5B6E69;font-size:12px}'
                + 'table{width:100%;border-collapse:separate;border-spacing:4px;table-layout:fixed}'
                + 'th{background:#0F766E;color:#fff;padding:9px 4px;border-radius:8px;font-size:14px}tbody th{background:#134E4A;font-size:15px}th small{display:block;font-weight:400;font-size:10px;opacity:.85}'
                + 'td{height:62px;text-align:center;border-radius:8px;background:#F1F5F3;font-size:14px;padding:4px;vertical-align:middle}td small{display:block;font-size:10px;color:#5B6E69;margin-top:2px}'
                + 'td.off{background:repeating-linear-gradient(45deg,#E2E8F0,#E2E8F0 8px,#F1F5F3 8px,#F1F5F3 16px);color:#64748B;font-weight:700;font-size:18px}'
                + '.leg{margin-top:12px;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px}.leg i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-left:5px;vertical-align:middle}'
                + '</style></head><body><h1>جدولي الدراسي</h1><p>منصة الطالب العراقي</p><table><thead><tr><th></th>' + cols.map((g) => '<th>' + NAMES[g] + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table><div class="leg">' + leg + '</div></body></html>';
        },
        tbPrint() {
            const d = this._tbGet(); if (!d) return;
            const f = document.createElement('iframe');
            f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
            f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { this.showToast('الطباعة مو متاحة هنا، جرّب حفظ كصورة'); } setTimeout(() => f.remove(), 60000); };
            f.srcdoc = this._tbPrintHtml(d);
            document.body.appendChild(f);
        },

        async tbImage() {
            const d = this._tbGet(); if (!d) return;
            const cols = shownDays(d), F = "'Readex Pro', Tahoma, Arial, sans-serif";
            const PW = 150, CW = 250, RH = 120, HH = 90, PAD = 50, TOP = 170;
            const W = PAD * 2 + PW + cols.length * CW, legH = 110, H = TOP + HH + d.times.length * RH + legH + PAD;
            const c = document.createElement('canvas'); c.width = W; c.height = H;
            const x = c.getContext('2d'); x.direction = 'rtl';
            const rr = (px, py, w, h, r) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); };
            x.fillStyle = '#F1F5F3'; x.fillRect(0, 0, W, H);
            x.fillStyle = '#0F766E'; x.textAlign = 'right'; x.textBaseline = 'alphabetic'; x.font = '800 54px ' + F; x.fillText('جدولي الدراسي', W - PAD, 90);
            x.fillStyle = '#5B6E69'; x.font = '500 26px ' + F; x.fillText('منصة الطالب العراقي', W - PAD, 134);
            const fit = (t, w) => { let s = String(t); while (s.length > 1 && x.measureText(s).width > w) s = s.slice(0, -1); return s; };
            const colX = (i) => W - PAD - PW - (i + 1) * CW;
            x.textAlign = 'center'; x.textBaseline = 'middle';
            cols.forEach((g, i) => { x.fillStyle = d.days[g] === 2 ? '#64748B' : '#0F766E'; rr(colX(i) + 4, TOP, CW - 8, HH - 8, 18); x.fill(); x.fillStyle = '#fff'; x.font = '800 34px ' + F; x.fillText(NAMES[g], colX(i) + CW / 2, TOP + HH / 2 - 4); });
            d.times.forEach((t, p) => {
                const y = TOP + HH + p * RH;
                x.fillStyle = '#134E4A'; rr(W - PAD - PW + 4, y + 4, PW - 8, RH - 8, 18); x.fill();
                x.fillStyle = '#fff'; x.font = '800 38px ' + F; x.fillText(String(p + 1), W - PAD - PW / 2, y + RH / 2 - 16);
                x.font = '500 22px ' + F; x.direction = 'ltr'; x.fillText(t[0] + ' - ' + t[1], W - PAD - PW / 2, y + RH / 2 + 24); x.direction = 'rtl';
                cols.forEach((g, i) => {
                    const px = colX(i) + 4;
                    if (d.days[g] === 2) { if (p === 0) { x.fillStyle = '#E2E8F0'; rr(px, y + 4, CW - 8, d.times.length * RH - 8, 18); x.fill(); x.fillStyle = '#64748B'; x.font = '800 40px ' + F; x.fillText('عطلة', px + (CW - 8) / 2, y + (d.times.length * RH) / 2); } return; }
                    const cell = (d.cells[g] || [])[p], s = cell && sub(d, cell.s);
                    x.fillStyle = s ? s.c + '2E' : '#E7EEEB'; rr(px, y + 4, CW - 8, RH - 8, 18); x.fill();
                    if (!s) return;
                    x.fillStyle = s.c; rr(px + 14, y + 4, CW - 36, 7, 4); x.fill();
                    x.fillStyle = '#0E1F1B'; x.font = '800 32px ' + F; x.fillText(fit(s.n, CW - 30), px + (CW - 8) / 2, y + RH / 2 - (cell.t ? 8 : 0) + 4);
                    if (cell.t) { x.fillStyle = '#5B6E69'; x.font = '500 21px ' + F; x.fillText(fit(cell.t, CW - 30), px + (CW - 8) / 2, y + RH / 2 + 28); }
                });
            });
            let lx = W - PAD, ly = TOP + HH + d.times.length * RH + 50;
            x.textAlign = 'right'; x.font = '600 26px ' + F;
            d.subs.forEach((s) => {
                const w = x.measureText(s.n).width + 60;
                if (lx - w < PAD) { lx = W - PAD; ly += 44; }
                x.fillStyle = s.c; rr(lx - 24, ly - 12, 24, 24, 6); x.fill();
                x.fillStyle = '#0E1F1B'; x.fillText(s.n, lx - 36, ly); lx -= w + 20;
            });
            const blob = await new Promise((ok) => c.toBlob((b) => ok(b), 'image/png'));
            if (!blob) { this.showToast('ما كدرت أسوي الصورة'); return; }
            const file = new File([blob], 'جدولي.png', { type: 'image/png' });
            try {
                if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: 'جدولي الدراسي' }); return; }
            } catch (e) { if (e && e.name === 'AbortError') return; }
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'جدولي.png';
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
            this.showToast('انحفظت صورة الجدول');
        }
    });
})();
