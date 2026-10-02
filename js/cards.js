// Review cards (بطاقات المراجعة): loaded on demand by app._need('cards') the first time the page opens.
// Decks per subject, spaced repetition (a card you know comes back later and later, one you
// miss comes back soon), and a 3D card you flip with a tap and throw right or left.
// Saved on the device (isp_cards_<uid>) and mirrored to userCards/{uid} when signed in, so the
// cards follow the student to another phone. Deleted items stay as {x:1} so every copy agrees.
(function () {
    const KD_SUBJECTS = [
        ['s0', 'الإسلامية', '#10B981', 'book-open'],
        ['s1', 'العربي', '#F59E0B', 'feather'],
        ['s2', 'الإنكليزي', '#3B82F6', 'languages'],
        ['s3', 'الرياضيات', '#8B5CF6', 'sigma'],
        ['s4', 'الفيزياء', '#06B6D4', 'atom'],
        ['s5', 'الكيمياء', '#EC4899', 'flask-conical'],
        ['s6', 'الأحياء', '#22C55E', 'leaf']
    ];
    const KD_COLORS = ['#F97316', '#0EA5E9', '#A855F7', '#EF4444', '#14B8A6', '#EAB308', '#6366F1', '#84CC16'];
    // days until a card comes back, by level (0 = new or missed)
    const KD_DAYS = [0, 1, 2, 4, 8, 16, 32, 64];
    const KD_MAX = 7, DAY = 86400000;
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const ring = (pct, size, stroke) => {
        const r = (size - stroke) / 2, c = 2 * Math.PI * r;
        return `<svg class="kd-ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="--c-len:${c.toFixed(1)};--c-off:${(c * (1 - Math.max(0, Math.min(1, pct)))).toFixed(1)}">
            <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="kd-ring-bg"/>
            <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="kd-ring-fg" stroke-dasharray="${c.toFixed(1)}"/>
        </svg>`;
    };

    Object.assign(app, {
        // ---------- data ----------
        _kdKey() { return 'isp_cards_' + (this.authUid || 'guest'); },

        _kdLoad() {
            const key = this._kdKey();
            if (this._kd && this._kdFor === key) return this._kd;
            let d = null;
            try { d = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
            if (!d || typeof d !== 'object') d = {};
            d.decks = d.decks && typeof d.decks === 'object' ? d.decks : {};
            d.cards = d.cards && typeof d.cards === 'object' ? d.cards : {};
            d.days = d.days && typeof d.days === 'object' ? d.days : {};
            this._kd = d;
            this._kdFor = key;
            return d;
        },

        // paths: what changed, relative to userCards/{uid}, e.g. {'cards/c1': {...}}
        _kdSave(paths) {
            try { localStorage.setItem(this._kdFor || this._kdKey(), JSON.stringify(this._kd)); } catch (e) {}
            if (paths && this.authUid && window.firebaseDb) {
                const { ref, update } = window.firebaseDbHelpers;
                update(ref(window.firebaseDb, 'userCards/' + this.authUid), paths).catch(() => {});
            }
        },

        // Once per sign-in: bring in cards made on another phone and send up the ones made here.
        _kdSync() {
            if (!this.authUid || !window.firebaseDb || this._kdSynced === this.authUid) return;
            this._kdSynced = this.authUid;
            const uid = this.authUid;
            const { ref, get } = window.firebaseDbHelpers;
            get(ref(window.firebaseDb, 'userCards/' + uid)).then((snap) => {
                if (this.authUid !== uid) return;
                const r = snap.val() || {}, d = this._kdLoad(), up = {};
                let changed = false;
                ['decks', 'cards'].forEach((k) => {
                    const mine = d[k], theirs = r[k] && typeof r[k] === 'object' ? r[k] : {};
                    Object.keys(theirs).forEach((id) => {
                        const t = theirs[id];
                        if (t && typeof t === 'object' && (!mine[id] || numOr0(t.u) > numOr0(mine[id].u))) { mine[id] = t; changed = true; }
                    });
                    Object.keys(mine).forEach((id) => { if (!theirs[id] || numOr0(mine[id].u) > numOr0(theirs[id].u)) up[k + '/' + id] = mine[id]; });
                });
                const rd = r.days && typeof r.days === 'object' ? r.days : {};
                Object.keys(rd).forEach((k) => { if (numOr0(rd[k]) > numOr0(d.days[k])) { d.days[k] = numOr0(rd[k]); changed = true; } });
                Object.keys(d.days).forEach((k) => { if (numOr0(d.days[k]) > numOr0(rd[k])) up['days/' + k] = d.days[k]; });
                this._kdSave(Object.keys(up).length ? up : null);
                if (changed && this.currentView === 'cardsView' && this._kdScr && this._kdScr.s !== 'review') this._kdRender();
            }).catch(() => { this._kdSynced = null; });
        },

        _kdDecks() {
            const d = this._kdLoad(), out = [];
            KD_SUBJECTS.forEach(([id, name, color, icon]) => {
                const o = d.decks[id];
                if (o && o.x) return;
                out.push({ id, name: (o && o.n) || name, color, icon, fixed: true });
            });
            Object.keys(d.decks).filter((id) => id[0] === 'd' && !d.decks[id].x)
                .sort((a, b) => numOr0(d.decks[a].at) - numOr0(d.decks[b].at))
                .forEach((id) => { const o = d.decks[id]; out.push({ id, name: o.n || 'مجموعة', color: o.c || KD_COLORS[0], icon: 'layers', fixed: false }); });
            return out;
        },
        _kdDeck(id) { return this._kdDecks().find((x) => x.id === id) || null; },
        _kdCards(deckId) {
            const d = this._kdLoad();
            return Object.keys(d.cards).map((id) => d.cards[id]).filter((c) => c && !c.x && (!deckId || c.d === deckId) && (deckId || this._kdDeck(c.d)))
                .sort((a, b) => numOr0(b.at) - numOr0(a.at));
        },
        _kdDueList(deckId, now) { return this._kdCards(deckId).filter((c) => numOr0(c.due) <= now); },
        _kdStreak() {
            const d = this._kdLoad();
            let n = 0, t = Date.now();
            if (!numOr0(d.days[this.localDateStr(new Date(t))])) t -= DAY;
            while (numOr0(d.days[this.localDateStr(new Date(t))]) > 0) { n++; t -= DAY; }
            return n;
        },

        // ---------- navigation ----------
        kdOpen() {
            this._kdLoad();
            this._kdSync();
            this._kdScr = { s: 'home' };
            this._kdRender();
        },

        kdBack() {
            const s = this._kdScr ? this._kdScr.s : 'home';
            if (s === 'review' || s === 'done') { const from = this._kdScr.from; this._kdEndReview(); this._kdScr = from ? { s: 'deck', id: from } : { s: 'home' }; this._kdRender(); return; }
            if (s === 'snap') { const from = this._kdScr.from; this._kdScr = from ? { s: 'deck', id: from } : { s: 'home' }; this._kdRender(); return; }
            if (s === 'deck') { this._kdScr = { s: 'home' }; this._kdRender(); return; }
            this.goBack();
        },

        // ---------- a page photographed into cards, written by the AI tutor (siteConfig/tutorUrl) ----------
        _kdSnapBtn(deckId) {
            const c = this.siteConfig || {};
            if (!/^https:\/\/[^\s]+$/.test(String(this._tutorUrl() || ''))) return '';
            return `<button class="kd-snap" onclick="app.kdSnap(${deckId ? jsArg(deckId) : 'null'})"><span><i data-lucide="camera"></i></span><div><b>صوّر صفحة وحوّلها بطاقات</b><small>المعلم الذكي يقرا الملزمة ويكتب البطاقات</small></div><i data-lucide="sparkles"></i></button>`;
        },

        kdSnap(deckId) {
            if (!this.isLoggedIn || !window.firebaseAuth || !window.firebaseAuth.currentUser) { this.showToast('سجّل دخولك أول'); this.goToAuth('login'); return; }
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) this._kdSnapRun(f, deckId); };
            inp.click();
        },

        async _kdSnapRun(file, deckId) {
            if (!/^image\//.test(file.type)) { this.showToast('اختار صورة'); return; }
            const deck = deckId || (this._kdScr && this._kdScr.id) || '';
            const scr = this._kdScr = { s: 'snap', from: deckId || null, deck, busy: true, cards: [], pick: [] };
            try {
                scr.img = await new Promise((resolve, reject) => {
                    const url = URL.createObjectURL(file), im = new Image();
                    im.onload = () => {
                        const k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas');
                        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
                        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
                        URL.revokeObjectURL(url);
                        resolve(c.toDataURL('image/jpeg', 0.85));
                    };
                    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
                    im.src = url;
                });
            } catch (e) { this.showToast('ما كدرت أقرا الصورة'); this.kdBack(); return; }
            this._kdRender();
            const k = this._kdDeck(deck);
            try {
                const token = await window.firebaseAuth.currentUser.getIdToken();
                const res = await fetch(this._tutorUrl(), {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ mode: 'cards', image: { type: 'image/jpeg', data: scr.img.split(',')[1] }, subject: k ? k.name : '' }),
                });
                const r = await res.json().catch(() => null);
                if (!res.ok || !r) throw Object.assign(new Error('http'), { status: res.status, code: r && r.error });
                scr.cards = (r.cards || []).filter((c) => c && c.q && c.a);
                scr.title = r.title || '';
                scr.pick = scr.cards.map(() => true);
                if (!scr.cards.length) scr.err = 'ما لكيت بالصورة شي أسويه بطاقات. صوّر الصفحة من قريب وبإضاءة زينة.';
            } catch (e) {
                scr.err = e.status === 429 || e.code === 'slow_down' ? 'على كيفك، انتظر دقيقة وجرب مرة ثانية.'
                    : e.code === 'busy' ? 'المعلم مشغول هسه، جرب بعد دقيقة.'
                    : !navigator.onLine ? 'ماكو نت، تأكد من الاتصال.' : 'ما كدرت أسوي البطاقات، جرب مرة ثانية.';
            }
            scr.busy = false;
            if (this._kdScr === scr) this._kdRender();
        },

        _kdRenderSnap(box, scr) {
            const decks = this._kdDecks(), n = scr.pick.filter(Boolean).length;
            this._kdTitle('صوّر وحوّلها بطاقات', scr.busy ? 'المعلم دا يقرا الصفحة...' : scr.cards.length ? scr.cards.length + ' بطاقة' : '');
            box.innerHTML = `<div class="kd kd-in kd-snapv">
                ${scr.img ? `<img class="kd-snap-img" src="${scr.img}" alt="">` : ''}
                ${scr.busy ? `<div class="kd-snap-busy"><span></span><b>المعلم دا يقرا الصفحة ويكتب البطاقات...</b><small>تاخذ ثواني</small></div>`
                    : scr.err ? `<div class="kd-snap-busy err"><b>${esc(scr.err)}</b><button class="kd-go" onclick="app.kdSnap(${scr.from ? jsArg(scr.from) : 'null'})"><i data-lucide="camera"></i>صوّر مرة ثانية</button></div>`
                    : `${scr.title ? `<p class="kd-snap-t">${esc(scr.title)}</p>` : ''}
                    <div class="kd-snap-list">${scr.cards.map((c, i) => `<button class="kd-snap-card ${scr.pick[i] ? 'on' : ''}" onclick="app.kdSnapPick(${i})">
                        <span class="kd-snap-chk"><i data-lucide="${scr.pick[i] ? 'check' : 'plus'}"></i></span>
                        <div><b dir="auto">${esc(c.q)}</b><small dir="auto">${esc(c.a)}</small></div></button>`).join('')}</div>
                    <label class="kd-snap-deck">تنضاف لمجموعة
                        <select onchange="app._kdScr.deck = this.value">${decks.map((k) => `<option value="${esc(k.id)}" ${k.id === scr.deck ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select></label>
                    <button class="kd-go" ${n ? '' : 'disabled'} onclick="app.kdSnapSave()"><i data-lucide="check"></i>أضف ${n} ${n === 1 ? 'بطاقة' : 'بطاقات'}</button>`}
            </div>`;
            if (!scr.busy && !scr.err && !decks.some((k) => k.id === scr.deck)) scr.deck = decks[0] ? decks[0].id : '';
        },

        kdSnapPick(i) {
            const scr = this._kdScr;
            if (!scr || scr.s !== 'snap') return;
            scr.pick[i] = !scr.pick[i];
            const y = window.scrollY;
            this._kdRender();
            window.scrollTo(0, y);
        },

        kdSnapSave() {
            const scr = this._kdScr, d = this._kdLoad(), now = Date.now(), up = {};
            if (!scr || !scr.deck || !this._kdDeck(scr.deck)) { this.showToast('اختار المجموعة'); return; }
            let n = 0;
            scr.cards.forEach((c, i) => {
                if (!scr.pick[i]) return;
                const card = { id: newId('c'), d: scr.deck, f: String(c.q).slice(0, 300), b: String(c.a).slice(0, 600), box: 0, due: now, n: 0, ok: 0, bad: 0, at: now + n, u: now };
                d.cards[card.id] = card; up['cards/' + card.id] = card; n++;
            });
            this._kdSave(up);
            this.showToast('انضافت ' + n + (n === 1 ? ' بطاقة' : ' بطاقات'));
            this._kdScr = { s: 'deck', id: scr.deck, q: '' };
            this._kdRender();
        },

        kdOpenDeck(id) { this._kdScr = { s: 'deck', id, q: '' }; this._kdRender(); },

        _kdTitle(t, sub) {
            const a = document.getElementById('cardsTitle'), b = document.getElementById('cardsSub');
            if (a) a.textContent = t;
            if (b) b.textContent = sub;
        },

        _kdRender() {
            const box = document.getElementById('cardsContent');
            if (!box) return;
            const scr = this._kdScr || { s: 'home' };
            document.body.classList.toggle('kd-reviewing', scr.s === 'review');
            if (scr.s === 'snap') this._kdRenderSnap(box, scr);
            else if (scr.s === 'deck') this._kdRenderDeck(box, scr);
            else if (scr.s === 'review') this._kdRenderReview(box);
            else if (scr.s === 'done') this._kdRenderDone(box);
            else this._kdRenderHome(box);
            try { lucide.createIcons(); } catch (e) {}
            window.scrollTo(0, 0);
        },

        // ---------- home ----------
        _kdRenderHome(box) {
            const now = Date.now(), d = this._kdLoad(), decks = this._kdDecks();
            const due = this._kdDueList(null, now).length, total = this._kdCards().length;
            const today = numOr0(d.days[this.localDateStr()]), streak = this._kdStreak();
            this._kdTitle('بطاقات المراجعة', total ? total + ' بطاقة بكل موادك' : 'سوّي بطاقاتك وراجعها بذكاء');
            const pct = today + due ? today / (today + due) : (total ? 1 : 0);
            box.innerHTML = `
                <div class="kd kd-in">
                    <div class="kd-hero">
                        <div class="kd-hero-ring">${ring(pct, 116, 11)}<div class="kd-hero-n"><b data-count="${due}">0</b><small>${due === 1 ? 'بطاقة' : 'بطاقات'}</small></div></div>
                        <div class="kd-hero-tx">
                            <b>${due ? 'تنتظرك اليوم' : total ? 'خلصت مراجعة اليوم' : 'ابدي أول مجموعة'}</b>
                            <p>${due ? 'كل بطاقة تعرفها ترجعلك بعد مدة أطول، واللي تغلط بيها ترجع قريب' : total ? 'رجع باچر، البطاقات تنتظرك بوقتها' : 'اكتب السؤال بوجه والجواب بالوجه الثاني'}</p>
                            <div class="kd-chips-row"><span><i data-lucide="check-check"></i>${today} اليوم</span><span class="${streak ? 'hot' : ''}"><i data-lucide="flame"></i>${streak} ${streak === 1 ? 'يوم' : 'أيام'}</span></div>
                        </div>
                    </div>
                    <button class="kd-go" ${due ? '' : 'disabled'} onclick="app.kdStart(null)"><i data-lucide="play"></i>${due ? 'راجع كل البطاقات المستحقة' : 'ماكو بطاقات مستحقة هسه'}</button>
                    ${this._kdSnapBtn(null)}
                    <div class="kd-sec"><b>المواد</b><button onclick="app.kdNewDeck()"><i data-lucide="folder-plus"></i>مجموعة جديدة</button></div>
                    <div class="kd-grid">
                        ${decks.map((k, i) => {
                            const cs = this._kdCards(k.id), dd = cs.filter((c) => numOr0(c.due) <= now).length;
                            const m = cs.length ? cs.reduce((s, c) => s + numOr0(c.box), 0) / (cs.length * KD_MAX) : 0;
                            return `<button class="kd-deck" style="--c:${k.color};--i:${i}" onclick="app.kdOpenDeck(${jsArg(k.id)})">
                                <span class="kd-deck-bg"></span>
                                <span class="kd-deck-ic"><i data-lucide="${k.icon}"></i></span>
                                ${dd ? `<em class="kd-due">${dd}</em>` : ''}
                                <b>${esc(k.name)}</b>
                                <small>${cs.length ? cs.length + ' بطاقة' : 'فارغة'}</small>
                                <span class="kd-bar"><i style="width:${Math.round(m * 100)}%"></i></span>
                            </button>`;
                        }).join('')}
                    </div>
                </div>
                <button class="kd-fab" onclick="app.kdEdit(null, null)" aria-label="بطاقة جديدة"><i data-lucide="plus"></i></button>`;
            this._kdCountUp(box);
        },

        _kdCountUp(box) {
            box.querySelectorAll('[data-count]').forEach((el) => {
                const to = numOr0(el.dataset.count);
                if (reduced() || to <= 0) { el.textContent = to; return; }
                const t0 = performance.now(), dur = 700;
                const step = (t) => {
                    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
                    el.textContent = Math.round(to * e);
                    if (k < 1 && el.isConnected) requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            });
        },

        // ---------- one deck ----------
        _kdRenderDeck(box, scr) {
            const k = this._kdDeck(scr.id);
            if (!k) { this._kdScr = { s: 'home' }; this._kdRenderHome(box); return; }
            const now = Date.now(), all = this._kdCards(k.id), due = all.filter((c) => numOr0(c.due) <= now).length;
            this._kdTitle(k.name, all.length ? all.length + ' بطاقة · ' + due + ' مستحقة' : 'مجموعة فارغة');
            box.innerHTML = `
                <div class="kd kd-in" style="--c:${k.color}">
                    <div class="kd-dhead">
                        <span class="kd-dhead-ic"><i data-lucide="${k.icon}"></i></span>
                        <div class="kd-dhead-tx"><b>${esc(k.name)}</b><small>${all.length} بطاقة · ${due} مستحقة</small></div>
                        ${k.fixed ? '' : `<button class="kd-icbtn" onclick="app.kdDeleteDeck(${jsArg(k.id)})" aria-label="حذف المجموعة"><i data-lucide="trash-2"></i></button>`}
                    </div>
                    <div class="kd-dbtns">
                        <button class="kd-go" ${due ? '' : 'disabled'} onclick="app.kdStart(${jsArg(k.id)})"><i data-lucide="play"></i>راجع المستحقة (${due})</button>
                        <button class="kd-go ghost" ${all.length ? '' : 'disabled'} onclick="app.kdStart(${jsArg(k.id)}, true)"><i data-lucide="shuffle"></i>كلها</button>
                    </div>
                    ${all.length > 5 ? `<label class="kd-search"><i data-lucide="search"></i><input type="search" placeholder="دوّر بالبطاقات" value="${esc(scr.q || '')}" oninput="app.kdFilter(this.value)"></label>` : ''}
                    ${this._kdSnapBtn(k.id)}
                    <div class="kd-list" id="kdList">${this._kdListHtml(all, scr.q)}</div>
                </div>
                <button class="kd-fab" style="--c:${k.color}" onclick="app.kdEdit(null, ${jsArg(k.id)})" aria-label="بطاقة جديدة"><i data-lucide="plus"></i></button>`;
        },

        _kdListHtml(all, q) {
            const qq = String(q || '').trim();
            const list = qq ? all.filter((c) => (c.f + ' ' + c.b).indexOf(qq) !== -1) : all;
            if (!all.length) {
                return `<div class="kd-empty"><div class="kd-empty-art"><span></span><span></span><span></span></div><b>ماكو بطاقات بعد</b><p>اضغط + واكتب سؤال بوجه وجوابه بالوجه الثاني</p></div>`;
            }
            if (!list.length) return '<p class="kd-none">ماكو بطاقة بهالكلمة</p>';
            const now = Date.now();
            return list.map((c, i) => {
                const b = numOr0(c.box), dd = numOr0(c.due) <= now;
                const left = Math.ceil((dayStart(numOr0(c.due)) - dayStart(now)) / DAY);
                return `<button class="kd-row" style="--i:${Math.min(i, 12)}" onclick="app.kdEdit(${jsArg(c.id)})">
                    <div class="kd-row-tx"><b>${esc(c.f)}</b><small>${esc(c.b)}</small></div>
                    <div class="kd-row-side"><span class="kd-lv">${Array.from({ length: KD_MAX }, (_, j) => `<i class="${j < b ? 'on' : ''}"></i>`).join('')}</span><em class="${dd ? 'due' : ''}">${dd ? 'مستحقة' : left === 1 ? 'باچر' : 'بعد ' + left + ' يوم'}</em></div>
                </button>`;
            }).join('');
        },

        kdFilter(q) {
            if (!this._kdScr || this._kdScr.s !== 'deck') return;
            this._kdScr.q = q;
            const el = document.getElementById('kdList');
            if (el) el.innerHTML = this._kdListHtml(this._kdCards(this._kdScr.id), q);
        },

        // ---------- editor sheets ----------
        _kdSheet(html, onReady) {
            this._kdCloseSheet(true);
            const bg = document.createElement('div');
            bg.className = 'kd-sheet-bg';
            bg.innerHTML = `<div class="kd-sheet" role="dialog" aria-modal="true"><span class="kd-grab"></span>${html}</div>`;
            bg.addEventListener('click', (e) => { if (e.target === bg) this._kdCloseSheet(); });
            document.body.appendChild(bg);
            this._kdSheetEl = bg;
            try { lucide.createIcons(); } catch (e) {}
            requestAnimationFrame(() => { bg.classList.add('on'); if (onReady) onReady(bg); });
        },
        _kdCloseSheet(now) {
            const bg = this._kdSheetEl;
            if (!bg) return;
            this._kdSheetEl = null;
            if (now || reduced()) { bg.remove(); return; }
            bg.classList.remove('on');
            setTimeout(() => bg.remove(), 320);
        },

        kdEdit(cardId, deckId) {
            const d = this._kdLoad(), c = cardId ? d.cards[cardId] : null;
            const decks = this._kdDecks();
            let sel = (c && c.d) || deckId || (this._kdScr && this._kdScr.s === 'deck' ? this._kdScr.id : null) || (this._kdLastDeck && this._kdDeck(this._kdLastDeck) ? this._kdLastDeck : decks[0].id);
            this._kdSel = sel;
            this._kdAdded = 0;
            this._kdSheet(`
                <b class="kd-sh-t">${c ? 'تعديل البطاقة' : 'بطاقة جديدة'}</b>
                <span class="kd-added" id="kdAdded"></span>
                <div class="kd-flipdemo"><span>السؤال</span><i data-lucide="repeat-2"></i><span>الجواب</span></div>
                <label class="kd-lbl" for="kdF">الوجه: السؤال</label>
                <textarea id="kdF" maxlength="300" rows="3" placeholder="مثلاً: ما وحدة قياس القوة؟">${c ? esc(c.f) : ''}</textarea>
                <label class="kd-lbl" for="kdB">الظهر: الجواب</label>
                <textarea id="kdB" maxlength="300" rows="3" placeholder="مثلاً: نيوتن">${c ? esc(c.b) : ''}</textarea>
                <div class="kd-lbl">المادة</div>
                <div class="kd-chips" id="kdChips">${decks.map((k) => `<button type="button" class="${k.id === sel ? 'on' : ''}" style="--c:${k.color}" onclick="app._kdPick(${jsArg(k.id)}, this)">${esc(k.name)}</button>`).join('')}</div>
                <div class="kd-sh-btns">
                    <button class="kd-go" onclick="app.kdSaveCard(${c ? jsArg(c.id) : 'null'}, false)"><i data-lucide="check"></i>حفظ</button>
                    ${c ? `<button class="kd-go danger" onclick="app.kdDeleteCard(${jsArg(c.id)})"><i data-lucide="trash-2"></i>حذف</button>` : `<button class="kd-go ghost" onclick="app.kdSaveCard(null, true)"><i data-lucide="plus"></i>حفظ وبطاقة ثانية</button>`}
                </div>`, (bg) => { const f = bg.querySelector('#kdF'); if (f && !c) f.focus(); });
        },

        _kdPick(id, btn) {
            this._kdSel = id;
            const box = document.getElementById('kdChips');
            if (box) box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
        },

        kdSaveCard(cardId, again) {
            const fEl = document.getElementById('kdF'), bEl = document.getElementById('kdB');
            if (!fEl || !bEl) return;
            const f = fEl.value.replace(/\s+/g, ' ').trim().slice(0, 300), b = bEl.value.replace(/\s+/g, ' ').trim().slice(0, 300);
            if (!f) { this.showToast('اكتب السؤال'); fEl.focus(); return; }
            if (!b) { this.showToast('اكتب الجواب'); bEl.focus(); return; }
            const d = this._kdLoad(), now = Date.now(), deck = this._kdDeck(this._kdSel) ? this._kdSel : this._kdDecks()[0].id;
            let c = cardId ? d.cards[cardId] : null;
            if (c) { c.f = f; c.b = b; c.d = deck; c.u = now; }
            else { c = { id: newId('c'), d: deck, f, b, box: 0, due: now, n: 0, ok: 0, bad: 0, at: now, u: now }; d.cards[c.id] = c; }
            this._kdLastDeck = deck;
            this._kdSave({ ['cards/' + c.id]: c });
            try { navigator.vibrate && navigator.vibrate(12); } catch (e) {}
            if (again) {
                fEl.value = ''; bEl.value = ''; fEl.focus();
                const sh = this._kdSheetEl && this._kdSheetEl.querySelector('.kd-sheet');
                if (sh && !reduced()) { sh.classList.remove('kd-pop'); void sh.offsetWidth; sh.classList.add('kd-pop'); }
                this._kdAdded = (this._kdAdded || 0) + 1;
                const lab = document.getElementById('kdAdded');
                if (lab) { lab.textContent = 'انحفظت ' + this._kdAdded + (this._kdAdded === 1 ? ' بطاقة' : ' بطاقات') + '، اكتب اللي بعدها'; lab.classList.remove('on'); void lab.offsetWidth; lab.classList.add('on'); }
            } else {
                this._kdCloseSheet();
                this.showToast(cardId ? 'انحفظ التعديل' : 'انضافت البطاقة');
            }
            this._kdRender();
        },

        async kdDeleteCard(cardId) {
            const d = this._kdLoad(), c = d.cards[cardId];
            if (!c) return;
            if (!(await this.ask({ icon: 'trash-2', title: 'تحذف البطاقة؟', text: 'تنحذف من كل أجهزتك.', ok: 'احذف' }))) return;
            const x = { id: c.id, x: 1, u: Date.now() };
            d.cards[cardId] = x;
            this._kdSave({ ['cards/' + cardId]: x });
            this._kdCloseSheet();
            this._kdRender();
        },

        kdNewDeck() {
            const d = this._kdLoad(), used = Object.keys(d.decks).filter((id) => id[0] === 'd').length;
            this._kdNewColor = KD_COLORS[used % KD_COLORS.length];
            this._kdSheet(`
                <b class="kd-sh-t">مجموعة جديدة</b>
                <label class="kd-lbl" for="kdN">الاسم</label>
                <input id="kdN" maxlength="30" placeholder="مثلاً: قواعد الإنكليزي، قوانين الفيزياء">
                <div class="kd-lbl">اللون</div>
                <div class="kd-swatches" id="kdSw">${KD_COLORS.map((c) => `<button type="button" class="${c === this._kdNewColor ? 'on' : ''}" style="--c:${c}" aria-label="لون" onclick="app._kdSw(${jsArg(c)}, this)"></button>`).join('')}</div>
                <div class="kd-sh-btns"><button class="kd-go" onclick="app.kdSaveDeck()"><i data-lucide="check"></i>إنشاء</button></div>`, (bg) => { const n = bg.querySelector('#kdN'); if (n) n.focus(); });
        },
        _kdSw(c, btn) {
            this._kdNewColor = c;
            const box = document.getElementById('kdSw');
            if (box) box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
        },
        kdSaveDeck() {
            const el = document.getElementById('kdN');
            const n = el ? el.value.replace(/\s+/g, ' ').trim().slice(0, 30) : '';
            if (!n) { this.showToast('اكتب اسم المجموعة'); return; }
            const d = this._kdLoad(), now = Date.now(), id = newId('d');
            d.decks[id] = { n, c: this._kdNewColor || KD_COLORS[0], at: now, u: now };
            this._kdSave({ ['decks/' + id]: d.decks[id] });
            this._kdCloseSheet();
            this._kdScr = { s: 'deck', id, q: '' };
            this._kdRender();
        },
        async kdDeleteDeck(id) {
            const d = this._kdLoad(), k = d.decks[id];
            if (!k || id[0] !== 'd') return;
            const cs = this._kdCards(id);
            if (!(await this.ask({ icon: 'trash-2', title: 'تحذف المجموعة؟', text: cs.length ? 'تنحذف ويا ' + cs.length + ' بطاقة بيها.' : 'المجموعة فارغة.', ok: 'احذف' }))) return;
            const now = Date.now(), up = {};
            d.decks[id] = { x: 1, u: now };
            up['decks/' + id] = d.decks[id];
            cs.forEach((c) => { d.cards[c.id] = { id: c.id, x: 1, u: now }; up['cards/' + c.id] = d.cards[c.id]; });
            this._kdSave(up);
            this._kdScr = { s: 'home' };
            this._kdRender();
        },

        // ---------- review ----------
        kdStart(deckId, all) {
            const now = Date.now();
            let list = all ? this._kdCards(deckId) : this._kdDueList(deckId, now);
            if (!list.length) return;
            // missed and new cards first, then the rest, a little shuffled so it never feels the same
            list = list.map((c) => ({ c, k: numOr0(c.box) * 10 + Math.random() * 14 })).sort((a, b) => a.k - b.k).map((x) => x.c).slice(0, 60);
            this._kdRv = { q: list.map((c) => c.id), i: 0, seq: 0, keys: [], flipped: false, ok: 0, hard: 0, bad: 0, seen: {}, again: {}, cram: !!all };
            this._kdRv.keys = this._kdRv.q.map(() => ++this._kdRv.seq);
            this._kdScr = { s: 'review', from: deckId || null };
            this._kdRender();
        },

        _kdEndReview() {
            if (this._kdKeyH) { document.removeEventListener('keydown', this._kdKeyH); this._kdKeyH = null; }
            if (this._kdFx) { cancelAnimationFrame(this._kdFx); this._kdFx = null; }
            document.body.classList.remove('kd-reviewing');
            this._kdRv = null;
        },

        _kdRenderReview(box) {
            const rv = this._kdRv;
            if (!rv) { this._kdScr = { s: 'home' }; this._kdRenderHome(box); return; }
            this._kdTitle('مراجعة', rv.cram ? 'مراجعة حرة، ما تغير مواعيد البطاقات' : 'اقلب البطاقة وقيّم نفسك بصدق');
            box.innerHTML = `
                <div class="kd-rv">
                    <div class="kd-rv-top"><div class="kd-prog"><i id="kdProg"></i></div><span id="kdCount"></span></div>
                    <div class="kd-stage" id="kdStage"></div>
                    <p class="kd-hint" id="kdHint">اضغط على البطاقة حتى تنقلب</p>
                    <div class="kd-rate" id="kdRate">
                        <button class="bad" onclick="app.kdRate('bad')"><i data-lucide="x"></i><span>ما عرفتها</span></button>
                        <button class="hard" onclick="app.kdRate('hard')"><i data-lucide="minus"></i><span>صعبة</span></button>
                        <button class="ok" onclick="app.kdRate('ok')"><i data-lucide="check"></i><span>عرفتها</span></button>
                    </div>
                </div>`;
            this._kdStack(true);
            if (!this._kdKeyH) {
                this._kdKeyH = (e) => {
                    if (!this._kdRv || this._kdSheetEl) return;
                    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.kdFlip(); }
                    else if (this._kdRv.flipped && (e.key === 'ArrowRight' || e.key === '3')) this.kdRate('ok');
                    else if (this._kdRv.flipped && (e.key === 'ArrowLeft' || e.key === '1')) this.kdRate('bad');
                    else if (this._kdRv.flipped && (e.key === 'ArrowUp' || e.key === '2')) this.kdRate('hard');
                };
                document.addEventListener('keydown', this._kdKeyH);
            }
        },

        _kdCardEl(id, key) {
            const d = this._kdLoad(), c = d.cards[id] || {}, k = this._kdDeck(c.d) || { name: '', color: '#64748B', icon: 'layers' };
            const el = document.createElement('div');
            el.className = 'kd-card';
            el.dataset.k = key;
            el.style.setProperty('--c', k.color);
            el.innerHTML = `
                <div class="kd-inner">
                    <div class="kd-face kd-front"><span class="kd-tag"><i data-lucide="${k.icon}"></i>${esc(k.name)}</span><p>${esc(c.f)}</p><em><i data-lucide="hand"></i>اضغط للجواب</em></div>
                    <div class="kd-face kd-back"><span class="kd-tag"><i data-lucide="lightbulb"></i>الجواب</span><p>${esc(c.b)}</p><small>${esc(c.f)}</small></div>
                </div>
                <span class="kd-stamp ok">عرفتها</span><span class="kd-stamp bad">ما عرفتها</span><span class="kd-stamp hard">صعبة</span>`;
            return el;
        },

        // Keeps the top card and two behind it on the stage; cards move up with a CSS transition.
        _kdStack(first) {
            const rv = this._kdRv, stage = document.getElementById('kdStage');
            if (!rv || !stage) return;
            const want = [];
            for (let j = 0; j < 3 && rv.i + j < rv.q.length; j++) want.push([rv.q[rv.i + j], rv.keys[rv.i + j], j]);
            const keep = {};
            want.forEach(([id, key, j]) => {
                let el = stage.querySelector('.kd-card[data-k="' + key + '"]');
                if (!el) {
                    el = this._kdCardEl(id, key);
                    el.classList.add('pos3');
                    // the deal-in animation ends by taking itself off: while an opacity animation
                    // stays on the card, the browser flattens the 3D flip
                    if (first) { el.classList.add('deal'); el.addEventListener('animationend', () => el.classList.remove('deal'), { once: true }); }
                    el.style.setProperty('--d', (j * 90) + 'ms');
                    stage.insertBefore(el, stage.firstChild);
                }
                keep[key] = true;
                requestAnimationFrame(() => { el.classList.remove('pos0', 'pos1', 'pos2', 'pos3'); el.classList.add('pos' + j); });
            });
            stage.querySelectorAll('.kd-card').forEach((el) => { if (!keep[el.dataset.k] && !el.classList.contains('gone')) el.remove(); });
            try { lucide.createIcons(); } catch (e) {}
            rv.flipped = false;
            const top = stage.querySelector('.kd-card[data-k="' + rv.keys[rv.i] + '"]');
            this._kdBindDrag(top);
            const prog = document.getElementById('kdProg'), cnt = document.getElementById('kdCount');
            if (prog) prog.style.width = Math.round(rv.i / rv.q.length * 100) + '%';
            if (cnt) cnt.textContent = Math.min(rv.i + 1, rv.q.length) + ' / ' + rv.q.length;
            const rate = document.getElementById('kdRate'), hint = document.getElementById('kdHint');
            if (rate) rate.classList.remove('on');
            if (hint) hint.textContent = 'اضغط على البطاقة حتى تنقلب';
        },

        kdFlip() {
            const rv = this._kdRv, stage = document.getElementById('kdStage');
            if (!rv || !stage) return;
            const top = stage.querySelector('.kd-card.pos0');
            if (!top) return;
            rv.flipped = !rv.flipped;
            top.classList.toggle('flipped', rv.flipped);
            try { navigator.vibrate && navigator.vibrate(8); } catch (e) {}
            if (rv.flipped) {
                const rate = document.getElementById('kdRate'), hint = document.getElementById('kdHint');
                if (rate) rate.classList.add('on');
                if (hint) hint.textContent = 'اسحب يمين إذا عرفتها، ويسار إذا ما عرفتها';
            }
        },

        // Drag the top card: it follows the finger and tilts; far enough and it flies off.
        _kdBindDrag(el) {
            if (!el || el._kdBound) return;
            el._kdBound = true;
            let sx = 0, sy = 0, dx = 0, dy = 0, down = false, moved = false, raf = 0, id = null;
            const paint = () => {
                raf = 0;
                el.style.transform = `translate3d(${dx}px, ${dy * 0.35}px, 0) rotate(${dx / 18}deg)`;
                const p = Math.min(1, Math.abs(dx) / 110);
                el.style.setProperty('--ok', dx > 0 ? p : 0);
                el.style.setProperty('--bad', dx < 0 ? p : 0);
            };
            el.addEventListener('pointerdown', (e) => {
                if (!this._kdRv || !el.classList.contains('pos0')) return;
                down = true; moved = false; sx = e.clientX; sy = e.clientY; dx = dy = 0; id = e.pointerId;
            });
            el.addEventListener('pointermove', (e) => {
                if (!down || e.pointerId !== id) return;
                const nx = e.clientX - sx, ny = e.clientY - sy;
                if (!moved && Math.abs(nx) < 8 && Math.abs(ny) < 8) return;
                if (!moved) {
                    if (!this._kdRv.flipped || Math.abs(ny) > Math.abs(nx) * 1.2) { down = false; return; }
                    moved = true;
                    try { el.setPointerCapture(id); } catch (err) {}
                    el.classList.add('drag');
                }
                dx = nx; dy = ny;
                if (!raf) raf = requestAnimationFrame(paint);
            });
            const up = (e) => {
                if (!down || (e && e.pointerId !== id)) return;
                down = false;
                if (!moved) { if (e && e.type === 'pointerup') this.kdFlip(); return; }
                el.classList.remove('drag');
                if (Math.abs(dx) > 100) { this.kdRate(dx > 0 ? 'ok' : 'bad', dx); return; }
                el.style.transform = '';
                el.style.setProperty('--ok', 0);
                el.style.setProperty('--bad', 0);
            };
            el.addEventListener('pointerup', up);
            el.addEventListener('pointercancel', up);
        },

        kdRate(r, fromDx) {
            const rv = this._kdRv, stage = document.getElementById('kdStage');
            if (!rv || !stage || rv.busy) return;
            if (!rv.flipped) { this.kdFlip(); return; }
            const top = stage.querySelector('.kd-card.pos0');
            const d = this._kdLoad(), id = rv.q[rv.i], c = d.cards[id], now = Date.now();
            rv.busy = true;
            if (c && !c.x) {
                c.n = numOr0(c.n) + 1;
                if (!rv.cram) {
                    if (r === 'ok') { c.box = Math.min(KD_MAX, numOr0(c.box) + 1); c.ok = numOr0(c.ok) + 1; c.due = dayStart(now) + KD_DAYS[c.box] * DAY; }
                    else if (r === 'hard') { c.box = Math.max(1, numOr0(c.box)); c.due = dayStart(now) + DAY; }
                    else { c.box = 0; c.bad = numOr0(c.bad) + 1; c.due = now; }
                } else if (r === 'bad') c.bad = numOr0(c.bad) + 1;
                c.u = now;
                const today = this.localDateStr();
                d.days[today] = numOr0(d.days[today]) + 1;
                this._kdSave({ ['cards/' + id]: c, ['days/' + today]: d.days[today] });
            }
            rv[r]++;
            rv.seen[id] = r;
            // a missed card comes back a few cards later in this same round (at most twice)
            if (r === 'bad' && numOr0(rv.again[id]) < 2) {
                rv.again[id] = numOr0(rv.again[id]) + 1;
                const at = Math.min(rv.q.length, rv.i + 4);
                rv.q.splice(at, 0, id);
                rv.keys.splice(at, 0, ++rv.seq);
            }
            try { navigator.vibrate && navigator.vibrate(r === 'ok' ? 14 : [10, 40, 10]); } catch (e) {}
            if (top) {
                top.classList.remove('drag');
                top.classList.add('gone', 'fly-' + r);
                const w = window.innerWidth;
                const tx = r === 'ok' ? w * 1.2 : r === 'bad' ? -w * 1.2 : (fromDx || 0);
                const ty = r === 'hard' ? -window.innerHeight * 0.9 : 60;
                top.style.setProperty('--ok', r === 'ok' ? 1 : 0);
                top.style.setProperty('--bad', r === 'bad' ? 1 : 0);
                top.style.setProperty('--hard', r === 'hard' ? 1 : 0);
                top.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotate(${r === 'hard' ? 0 : (tx > 0 ? 24 : -24)}deg)`;
                setTimeout(() => top.remove(), 520);
            }
            rv.i++;
            setTimeout(() => {
                if (this._kdRv !== rv) return;
                rv.busy = false;
                if (rv.i >= rv.q.length) { this._kdFinish(); return; }
                this._kdStack(false);
            }, reduced() ? 0 : 170);
        },

        _kdFinish() {
            const rv = this._kdRv;
            if (!rv) return;
            const uniq = Object.keys(rv.seen).length, okN = Object.keys(rv.seen).filter((k) => rv.seen[k] === 'ok').length;
            this._kdDone = { total: rv.ok + rv.hard + rv.bad, uniq, okN, ok: rv.ok, hard: rv.hard, bad: rv.bad, missed: Object.keys(rv.seen).filter((k) => rv.seen[k] === 'bad'), pts: 0 };
            // 10 points once a day for finishing a round of at least 10 cards
            const today = this.localDateStr(), pk = 'isp_kd_pts_' + (this.authUid || 'guest');
            let last = '';
            try { last = localStorage.getItem(pk) || ''; } catch (e) {}
            if (this.isLoggedIn && this.authUid && uniq >= 10 && last !== today) {
                try { localStorage.setItem(pk, today); } catch (e) {}
                this._kdDone.pts = 10;
                this.addPointsAtomic(10).then((v) => { if (v !== null) this.logDailyActivity({ points: 10 }); });
            }
            const from = this._kdScr && this._kdScr.from;
            this._kdEndReview();
            this._kdScr = { s: 'done', from };
            this._kdRender();
        },

        _kdRenderDone(box) {
            const r = this._kdDone || { total: 0, uniq: 0, okN: 0, ok: 0, hard: 0, bad: 0, missed: [], pts: 0 };
            const pct = r.uniq ? r.okN / r.uniq : 0;
            const msg = pct >= 0.9 ? 'أسطورة! تقريباً كلشي تعرفه' : pct >= 0.6 ? 'شغل حلو، كمّل هيج' : pct >= 0.3 ? 'بدينا نثبّتها، البطاقات الصعبة ترجعلك قريب' : 'عادي، التكرار هو السر. راح ترجعلك قريب';
            this._kdTitle('خلصت المراجعة', r.uniq + ' بطاقة');
            box.innerHTML = `
                <div class="kd kd-done">
                    <canvas id="kdFx" class="kd-fx"></canvas>
                    <div class="kd-done-ring">${ring(pct, 168, 14)}<div class="kd-hero-n big"><b data-count="${Math.round(pct * 100)}">0</b><small>% عرفتها</small></div></div>
                    <b class="kd-done-t">${msg}</b>
                    <div class="kd-done-stats">
                        <span class="ok"><i data-lucide="check"></i><b>${r.ok}</b>عرفتها</span>
                        <span class="hard"><i data-lucide="minus"></i><b>${r.hard}</b>صعبة</span>
                        <span class="bad"><i data-lucide="x"></i><b>${r.bad}</b>ما عرفتها</span>
                    </div>
                    ${r.pts ? `<div class="kd-pts"><i data-lucide="sparkles"></i>+${r.pts} نقطة لمراجعة اليوم</div>` : ''}
                    <div class="kd-dbtns col">
                        ${r.missed.length ? `<button class="kd-go" onclick="app.kdRetryMissed()"><i data-lucide="rotate-ccw"></i>راجع اللي ما عرفتها (${r.missed.length})</button>` : ''}
                        <button class="kd-go ${r.missed.length ? 'ghost' : ''}" onclick="app.kdBack()"><i data-lucide="layers"></i>رجوع للبطاقات</button>
                    </div>
                </div>`;
            this._kdCountUp(box);
            if (pct >= 0.5 && !reduced()) this._kdConfetti(document.getElementById('kdFx'), pct);
        },

        kdRetryMissed() {
            const r = this._kdDone, d = this._kdLoad();
            if (!r || !r.missed.length) return;
            const ids = r.missed.filter((id) => d.cards[id] && !d.cards[id].x);
            if (!ids.length) return;
            this._kdRv = { q: ids.slice(), i: 0, seq: 0, keys: [], flipped: false, ok: 0, hard: 0, bad: 0, seen: {}, again: {}, cram: true };
            this._kdRv.keys = ids.map(() => ++this._kdRv.seq);
            this._kdScr = { s: 'review', from: this._kdScr && this._kdScr.from };
            this._kdRender();
        },

        // A short burst of paper pieces over the result; stops by itself.
        _kdConfetti(cv, pct) {
            if (!cv) return;
            const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
            cv.width = w * dpr; cv.height = h * dpr;
            const g = cv.getContext('2d');
            g.scale(dpr, dpr);
            const cols = ['#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#8B5CF6', '#FACC15'];
            const n = Math.round(60 + pct * 60), ps = [];
            for (let i = 0; i < n; i++) {
                const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = 7 + Math.random() * 7;
                ps.push({ x: w / 2, y: h * 0.32, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, s: 5 + Math.random() * 6, c: cols[i % cols.length] });
            }
            const t0 = performance.now();
            const step = (t) => {
                const k = (t - t0) / 2400;
                g.clearRect(0, 0, w, h);
                if (k >= 1 || !cv.isConnected) { this._kdFx = null; return; }
                ps.forEach((p) => {
                    p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
                    g.save();
                    g.globalAlpha = 1 - k * k;
                    g.translate(p.x, p.y); g.rotate(p.r);
                    g.fillStyle = p.c;
                    g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2 * (0.4 + Math.abs(Math.sin(p.r * 2))));
                    g.restore();
                });
                this._kdFx = requestAnimationFrame(step);
            };
            this._kdFx = requestAnimationFrame(step);
        }
    });
})();
