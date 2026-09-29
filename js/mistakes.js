// دفتر الغلطات: questions the student got wrong come back after 1, 3 and 7 days, and leave the
// notebook once answered right three times in a row. Wrong answers from the tutor's surprise
// quizzes and from duels are added on their own (app._mkAdd in js/app.js); the student can also
// photograph a question. Multiple-choice items are marked by the app; photo items by the student.
// Everything stays on the device: the list in localStorage (app._mkKey), photos in IndexedDB.
// Loaded on demand by app._need('mistakes').
(function () {
    const PTS_RIGHT = 2, PTS_DONE = 5, PTS_DAY_CAP = 20, STEPS = [1, 3, 7], L = ['أ', 'ب', 'ج', 'د', 'هـ'];
    const SRC = { quiz: ['list-checks', 'اختبار مفاجئ'], duel: ['zap', 'تحدي مباشر'], photo: ['camera', 'أضفته أنت'] };
    const esc = (s) => escapeHtml(String(s == null ? '' : s));

    // photos: { big, thumb } data URLs under the item's id
    const IDB = {
        open() {
            if (!this.p) this.p = new Promise((res, rej) => {
                const r = indexedDB.open('isp_mk', 1);
                r.onupgradeneeded = () => r.result.createObjectStore('img');
                r.onsuccess = () => res(r.result);
                r.onerror = () => { this.p = null; rej(r.error); };
            });
            return this.p;
        },
        async run(mode, fn) {
            const db = await this.open();
            return new Promise((res, rej) => {
                const t = db.transaction('img', mode), req = fn(t.objectStore('img'));
                t.oncomplete = () => res(req && req.result);
                t.onerror = () => rej(t.error);
            });
        },
        get(k) { return this.run('readonly', (s) => s.get(k)).catch(() => null); },
        put(k, v) { return this.run('readwrite', (s) => s.put(v, k)); },
        del(k) { return this.run('readwrite', (s) => s.delete(k)).catch(() => {}); },
    };

    function shrink(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file), img = new Image();
            img.onload = () => {
                const draw = (max, q) => {
                    const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
                    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    return c.toDataURL('image/jpeg', q);
                };
                const out = { big: draw(1280, 0.8), thumb: draw(240, 0.7) };
                URL.revokeObjectURL(url);
                resolve(out);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
            img.src = url;
        });
    }

    const whenDue = (it) => {
        const d = Math.floor((it.due - app._mkDay(0)) / 86400000);
        return d <= 0 ? ['مستحق اليوم', 'now'] : d === 1 ? ['باجر', ''] : ['بعد ' + d + ' أيام', ''];
    };

    Object.assign(app, {
        mkOpen() {
            this._mk = this._mk || { mode: 'home', filter: '', thumbs: {}, draft: null, rv: null };
            this._mkRender();
        },

        mkBack() {
            const m = this._mk;
            if (m && m.mode !== 'home') { if (m.mode === 'review') this._mkFinish(true); m.mode = 'home'; this._mkRender(); window.scrollTo(0, 0); return; }
            this.goBack();
        },

        _mkRender() {
            const m = this._mk, box = document.getElementById('mkContent');
            if (!box) return;
            box.innerHTML = m.mode === 'add' ? this._mkAddHtml() : m.mode === 'review' ? this._mkReviewHtml() : m.mode === 'end' ? this._mkEndHtml() : this._mkHomeHtml();
            lucide.createIcons();
            if (m.mode === 'home') this._mkThumbs();
        },

        // ---------- the notebook ----------
        _mkHomeHtml() {
            const m = this._mk, all = this._mkList(), now = Date.now();
            const active = all.filter((x) => !x.done), done = all.filter((x) => x.done);
            const due = active.filter((x) => x.due <= now);
            const week = all.filter((x) => now - x.at < 7 * 86400000).length;
            const subs = [...new Set(active.map((x) => x.s || 'عام'))];
            if (m.filter && !subs.includes(m.filter)) m.filter = '';
            const shown = active.filter((x) => !m.filter || (x.s || 'عام') === m.filter).sort((a, b) => a.due - b.due);
            const next = active.length && !due.length ? whenDue(active.slice().sort((a, b) => a.due - b.due)[0])[0] : '';
            const sub = document.getElementById('mkSub');
            if (sub) sub.textContent = due.length ? due.length + ' مستحقة اليوم' : 'كل غلطة ترجعلك لحد ما تتقنها';

            if (!all.length) return `<div class="mk"><div class="mk-empty">
                <span class="mk-emp-ic"><i data-lucide="notebook-pen"></i></span>
                <b>دفترك فارغ</b>
                <p>كل سؤال تغلط بيه بالاختبار المفاجئ ويا المعلم أو بالتحدي المباشر ينكتب هنا وحده. وتكدر تصوّر أي سؤال غلطت بيه بالمدرسة أو بالملزمة.</p>
                <p>الدفتر يرجعلك كل سؤال بعد يوم، وبعد 3 أيام، وبعد أسبوع، ولمن تجاوبه صح 3 مرات ورا بعض يطلع من الدفتر.</p>
                <button class="mk-btn" onclick="app.mkAddOpen()"><i data-lucide="camera"></i>صوّر سؤال غلطت بيه</button>
            </div></div>`;

            return `<div class="mk">
                <div class="mk-hero${due.length ? '' : ' calm'}">
                    <div class="mk-hero-n"><b>${due.length}</b><span>${due.length ? 'مستحقة اليوم' : 'ماكو شي مستحق اليوم'}</span></div>
                    ${due.length ? `<button class="mk-btn" onclick="app.mkStart()"><i data-lucide="rotate-ccw"></i>ابدأ المراجعة</button>`
                        : `<p>${active.length ? 'الوجبة الجاية ' + next + '. أحسنت.' : 'اتقنت كل غلطاتك. أحسنت.'}</p>`}
                </div>
                <div class="mk-stats">
                    <div><b>${active.length}</b><span>بالدفتر</span></div>
                    <div><b>${done.length}</b><span>اتقنتها</span></div>
                    <div><b>${week}</b><span>غلطات هالأسبوع</span></div>
                </div>
                ${subs.length > 1 ? `<div class="mk-chips"><button class="${m.filter ? '' : 'on'}" onclick="app.mkFilter('')">الكل</button>${subs.map((s) => `<button class="${m.filter === s ? 'on' : ''}" onclick="app.mkFilter(${jsArg(s)})">${esc(s)}</button>`).join('')}</div>` : ''}
                <div class="mk-list">${shown.map((x) => this._mkItemHtml(x)).join('') || '<p class="mk-none">ماكو غلطات بهاي المادة.</p>'}</div>
                ${done.length ? `<details class="mk-done"><summary>اللي اتقنتها (${done.length})</summary><div class="mk-list">${done.slice().reverse().slice(0, 60).map((x) => this._mkItemHtml(x)).join('')}</div></details>` : ''}
                <button class="mk-add" onclick="app.mkAddOpen()"><i data-lucide="camera"></i>صوّر سؤال غلطت بيه</button>
            </div>`;
        },

        _mkItemHtml(x) {
            const src = SRC[x.src] || SRC.photo, [when, cls] = x.done ? ['اتقنتها', 'ok'] : whenDue(x);
            const text = x.q || (x.img ? 'سؤال بالصورة' : '');
            return `<button class="mk-item" onclick="app.mkStart(${jsArg(x.id)})">
                ${x.img ? `<img class="mk-th" data-mk="${esc(x.id)}" alt="">` : `<span class="mk-th ic"><i data-lucide="${src[0]}"></i></span>`}
                <div class="mk-it-b"><small>${esc(x.s || 'عام')} · ${src[1]}${x.miss > 1 ? ' · غلطت بيه ' + x.miss + ' مرات' : ''}</small><p dir="auto">${esc(text.length > 110 ? text.slice(0, 110) + '...' : text)}</p>
                    <span class="mk-dots">${[0, 1, 2].map((i) => `<i class="${(x.done ? 3 : x.ok || 0) > i ? 'on' : ''}"></i>`).join('')}</span></div>
                <span class="mk-when ${cls}">${when}</span>
            </button>`;
        },

        async _mkThumbs() {
            const m = this._mk;
            for (const el of document.querySelectorAll('#mkContent img[data-mk]')) {
                const id = el.dataset.mk;
                if (!m.thumbs[id]) { const v = await IDB.get(id); m.thumbs[id] = v ? v.thumb : ''; }
                if (m.thumbs[id]) el.src = m.thumbs[id];
            }
        },

        mkFilter(s) { this._mk.filter = s; this._mkRender(); },

        // ---------- adding a photo ----------
        mkAddOpen() {
            const m = this._mk;
            if (!m) return;
            if (m.mode === 'review') this._mkFinish(true);
            m.mode = 'add';
            m.draft = { s: this._mk.filter || '', q: '', ans: '', img: null };
            this._mkRender();
            window.scrollTo(0, 0);
        },

        _mkAddHtml() {
            const d = this._mk.draft, g = this._gradesLoad(), subs = [...new Set([...(g.subjects || []), 'عام'])];
            return `<div class="mk mk-form">
                <button class="mk-photo${d.img ? ' has' : ''}" onclick="document.getElementById('mkFile').click()">
                    ${d.img ? `<img src="${d.img.thumb}" alt="">` : '<i data-lucide="camera"></i><b>صوّر السؤال</b><small>أو اختار صورة من الاستوديو</small>'}
                </button>
                <label>المادة</label>
                <div class="mk-chips wrap">${subs.map((s) => `<button class="${d.s === s ? 'on' : ''}" onclick="app.mkDraftSub(${jsArg(s)})">${esc(s)}</button>`).join('')}</div>
                <label for="mkQ">السؤال أو ملاحظتك <small>(اختياري إذا صورته)</small></label>
                <textarea id="mkQ" rows="3" maxlength="600" placeholder="مثلاً: نسيت أحول الوحدات للنظام الدولي">${esc(d.q)}</textarea>
                <label for="mkA">الجواب الصحيح <small>(اختياري)</small></label>
                <textarea id="mkA" rows="2" maxlength="600" placeholder="حتى تتأكد من نفسك وقت المراجعة">${esc(d.ans)}</textarea>
                <button class="mk-btn wide" onclick="app.mkSave()"><i data-lucide="check"></i>ضيفه للدفتر</button>
            </div>`;
        },

        _mkKeepDraft() {
            const d = this._mk.draft;
            if (!d) return;
            const q = document.getElementById('mkQ'), a = document.getElementById('mkA');
            if (q) d.q = q.value; if (a) d.ans = a.value;
        },
        mkDraftSub(s) { this._mkKeepDraft(); this._mk.draft.s = s; this._mkRender(); },

        async mkPickImage(input) {
            const f = input.files && input.files[0];
            input.value = '';
            if (!f || !this._mk) return;
            if (!/^image\//.test(f.type)) { this.showToast('اختار صورة'); return; }
            try {
                const img = await shrink(f);
                if (this._mk.mode !== 'add') this.mkAddOpen();
                this._mkKeepDraft();
                this._mk.draft.img = img;
                this._mkRender();
            } catch (e) { this.showToast('ما كدرت أقرا الصورة'); }
        },

        async mkSave() {
            this._mkKeepDraft();
            const d = this._mk.draft, q = d.q.trim(), ans = d.ans.trim();
            if (!d.img && !q) { this.showToast('صوّر السؤال أو اكتبه'); return; }
            if (!d.s) { this.showToast('اختار المادة'); return; }
            const item = this._mkAdd({ src: 'photo', s: d.s, q, ans, img: !!d.img });
            if (d.img) {
                try { await IDB.put(item.id, d.img); this._mk.thumbs[item.id] = d.img.thumb; } catch (e) { this.showToast('ما انحفظت الصورة، المساحة ممتلئة'); }
            }
            this._mk.mode = 'home'; this._mk.draft = null;
            this._mkRender();
            this.showToast('انضاف، يرجعلك باجر');
        },

        // ---------- reviewing ----------
        mkStart(id) {
            const m = this._mk, now = Date.now(), list = this._mkList();
            const ids = id ? [id] : list.filter((x) => !x.done && x.due <= now).sort((a, b) => a.due - b.due).map((x) => x.id).slice(0, 30);
            if (!ids.length) return;
            m.rv = { ids, i: 0, right: 0, wrong: 0, pts: 0, pick: null, reveal: false, res: null, one: !!id };
            m.mode = 'review';
            this._mkRender();
            this._mkReviewImg();
            window.scrollTo(0, 0);
        },

        _mkCur() { const rv = this._mk.rv; return rv && this._mkList().find((x) => x.id === rv.ids[rv.i]); },

        _mkReviewHtml() {
            const rv = this._mk.rv, it = this._mkCur();
            if (!it) { rv.i++; if (rv.i >= rv.ids.length) { this._mkFinish(); return this._mkEndHtml(); } return this._mkReviewHtml(); }
            const src = SRC[it.src] || SRC.photo, mcq = Array.isArray(it.ch) && Number.isInteger(it.a);
            const answered = rv.res !== null;
            let body = '';
            if (mcq) {
                body = `<div class="mk-ch">${it.ch.map((c, j) => {
                    const cls = answered ? (j === it.a ? 'ok' : j === rv.pick ? 'bad' : 'off') : '';
                    return `<button dir="auto" class="${cls}"${answered ? ' disabled' : ` onclick="app.mkAnswer(${j})"`}><span>${L[j] || j + 1}</span>${esc(c)}</button>`;
                }).join('')}</div>`;
                if (answered && it.why) body += `<p class="mk-why" dir="auto">${esc(it.why)}</p>`;
                if (!answered && Number.isInteger(it.pick) && it.ch[it.pick] !== undefined) body = `<p class="mk-was">المرة اللي فاتت اخترت: ${esc(it.ch[it.pick])}</p>` + body;
            } else if (!rv.reveal) {
                body = `<button class="mk-btn wide ghost" onclick="app.mkReveal()"><i data-lucide="eye"></i>حليته براسك؟ شوف الجواب</button>`;
            } else {
                body = `<div class="mk-ans"><small>الجواب الصحيح</small><p dir="auto">${it.ans ? esc(it.ans) : 'ما كاتب جواب. إذا مو متأكد اسأل المعلم.'}</p></div>`
                    + (answered ? '' : `<div class="mk-self"><button class="bad" onclick="app.mkSelf(false)"><i data-lucide="circle-x"></i>ما عرفته</button><button class="ok" onclick="app.mkSelf(true)"><i data-lucide="circle-check"></i>عرفته</button></div>`);
            }
            const res = answered ? `<div class="mk-res ${rv.res.right ? 'ok' : 'bad'}"><b>${rv.res.right ? (rv.res.done ? 'اتقنته، طلع من الدفتر' : 'صح') : 'غلط'}</b><span>${rv.res.done ? (rv.res.pts ? '+' + rv.res.pts + ' نقطة' : '') : rv.res.right ? 'يرجعلك بعد ' + rv.res.days + ' أيام' : 'يرجعلك باجر'}${!rv.res.done && rv.res.pts ? ' · +' + rv.res.pts + ' نقطة' : ''}</span></div>` : '';
            return `<div class="mk mk-rv">
                <div class="mk-prog"><i style="width:${Math.round(rv.i / rv.ids.length * 100)}%"></i></div>
                <div class="mk-rv-h"><span>${rv.i + 1} من ${rv.ids.length}</span><span>${esc(it.s || 'عام')} · ${src[1]}</span></div>
                <div class="mk-card">
                    ${it.img ? `<img class="mk-big" id="mkBig" alt="صورة السؤال">` : ''}
                    ${it.q ? `<p class="mk-q" dir="auto">${esc(it.q)}</p>` : ''}
                    ${body}
                </div>
                ${res}
                <div class="mk-foot">
                    <button class="mk-btn ghost" onclick="app.mkAsk()"><i data-lucide="sparkles"></i>اسأل المعلم</button>
                    ${answered ? `<button class="mk-btn" onclick="app.mkNext()">${rv.i + 1 < rv.ids.length ? 'التالي' : 'خلصت'}<i data-lucide="chevron-left"></i></button>` : ''}
                </div>
                <button class="mk-del" onclick="app.mkDelete()">شيله من الدفتر</button>
            </div>`;
        },

        async _mkReviewImg() {
            const it = this._mkCur(), el = document.getElementById('mkBig');
            if (!it || !it.img || !el) return;
            const v = await IDB.get(it.id);
            if (v) el.src = v.big; else el.remove();
        },

        mkAnswer(j) {
            const rv = this._mk.rv, it = this._mkCur();
            if (!it || rv.res) return;
            rv.pick = j;
            this._mkGrade(it, j === it.a, true);
        },
        mkReveal() { this._mk.rv.reveal = true; this._mkRender(); this._mkReviewImg(); },
        mkSelf(right) { const it = this._mkCur(); if (it && !this._mk.rv.res) this._mkGrade(it, right, false); },

        _mkGrade(it, right, marked) {
            const rv = this._mk.rv, list = this._mkList(), x = list.find((y) => y.id === it.id);
            if (!x) return;
            x.n = (x.n || 0) + 1; x.last = Date.now();
            let days = 1, done = false, pts = 0;
            if (right) {
                x.ok = (x.ok || 0) + 1;
                if (x.ok >= 3) { x.done = Date.now(); done = true; } else { days = STEPS[x.ok]; x.due = this._mkDay(days); }
                // points only for questions the app marks itself
                if (marked) pts = this._mkPts(PTS_RIGHT + (done ? PTS_DONE : 0));
                rv.right++;
            } else {
                x.ok = 0; x.miss = (x.miss || 1) + 1; x.due = this._mkDay(1);
                if (marked) x.pick = rv.pick;
                rv.wrong++;
            }
            rv.pts += pts;
            this._mkStore(list);
            rv.res = { right, done, days, pts };
            this._mkRender();
            this._mkReviewImg();
        },

        // points against today's cap, paid when the review ends
        _mkPts(n) {
            const key = 'isp_mk_pts_' + this.authUid, today = this.localDateStr();
            let led = { d: today, p: 0 };
            try { const o = JSON.parse(localStorage.getItem(key) || 'null'); if (o && o.d === today) led = o; } catch (e) {}
            const give = Math.max(0, Math.min(n, PTS_DAY_CAP - led.p));
            led.p += give;
            try { localStorage.setItem(key, JSON.stringify(led)); } catch (e) {}
            return give;
        },

        mkNext() {
            const rv = this._mk.rv;
            rv.i++; rv.pick = null; rv.reveal = false; rv.res = null;
            if (rv.i >= rv.ids.length) { this._mkFinish(); this._mk.mode = rv.one ? 'home' : 'end'; }
            this._mkRender();
            this._mkReviewImg();
            window.scrollTo(0, 0);
        },

        _mkFinish(quiet) {
            const rv = this._mk.rv;
            if (!rv || rv.paid) return;
            rv.paid = true;
            const n = rv.right + rv.wrong;
            if (!n || !this.authUid) return;
            if (rv.pts > 0) this.addPointsAtomic(rv.pts).then((np) => { if (np !== null) this.logDailyActivity({ points: rv.pts, studySessions: n >= 3 ? 1 : 0 }); });
            else if (n >= 3) this.logDailyActivity({ studySessions: 1 });
            if (quiet && rv.pts) this.showToast('+' + rv.pts + ' نقطة من المراجعة');
        },

        _mkEndHtml() {
            const rv = this._mk.rv || { right: 0, wrong: 0, pts: 0 }, n = rv.right + rv.wrong;
            const say = !n ? '' : rv.wrong === 0 ? 'كلها صح. هيج الحفظ يثبت.' : rv.right >= rv.wrong ? 'زين، اللي غلطت بيهن يرجعلك باجر.' : 'لا تزعل، هاي فايدة الدفتر: تغلط هنا حتى ما تغلط بالامتحان.';
            return `<div class="mk"><div class="mk-empty">
                <span class="mk-emp-ic done"><i data-lucide="circle-check"></i></span>
                <b>خلصت مراجعة اليوم</b>
                <div class="mk-stats"><div><b>${rv.right}</b><span>صح</span></div><div><b>${rv.wrong}</b><span>غلط</span></div><div><b>${rv.pts}</b><span>نقطة</span></div></div>
                <p>${say}</p>
                <button class="mk-btn" onclick="app.mkHome()">رجوع للدفتر</button>
            </div></div>`;
        },
        mkHome() { this._mk.mode = 'home'; this._mkRender(); window.scrollTo(0, 0); },

        async mkDelete() {
            const it = this._mkCur();
            if (!it || !confirm('تشيل هذا السؤال من الدفتر؟')) return;
            this._mkStore(this._mkList().filter((x) => x.id !== it.id));
            if (it.img) IDB.del(it.id);
            const rv = this._mk.rv;
            rv.ids.splice(rv.i, 1); rv.pick = null; rv.reveal = false; rv.res = null;
            if (rv.i >= rv.ids.length) { this._mkFinish(); this._mk.mode = rv.one || !(rv.right + rv.wrong) ? 'home' : 'end'; }
            this._mkRender();
            this._mkReviewImg();
        },

        // opens the tutor with the question (and its photo) ready to send
        async mkAsk() {
            const it = this._mkCur();
            if (!it) return;
            const mcq = Array.isArray(it.ch) && Number.isInteger(it.a);
            const text = mcq
                ? 'اشرحلي هذا السؤال، غلطت بيه قبل:\n' + it.q + '\nالخيارات: ' + it.ch.map((c, i) => (L[i] || i + 1) + ') ' + c).join('، ') + '\nالجواب الصحيح: ' + it.ch[it.a]
                : 'اشرحلي حل هذا السؤال خطوة بخطوة، غلطت بيه قبل.' + (it.q ? '\n' + it.q : '');
            let img = null;
            if (it.img) { const v = await IDB.get(it.id); if (v) img = { data: v.big.split(',')[1], type: 'image/jpeg', thumb: v.thumb }; }
            this.setTab('tutor');
            try { await this._need('tutor'); } catch (e) { return; }
            for (let i = 0; i < 60 && !(this._tt && document.getElementById('ttInput') && this.currentView === 'tutorView'); i++) await new Promise((r) => setTimeout(r, 50));
            const inp = document.getElementById('ttInput');
            if (!this._tt || !inp || this._tt.busy) return;
            if (img) this._tt.img = img;
            inp.value = text;
            this.ttAutosize(inp);
            this._ttComposer();
        },
    });
})();
