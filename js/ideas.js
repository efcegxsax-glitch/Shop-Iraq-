// صندوق الأفكار: students suggest what the app should add and vote on each other's ideas; the
// admin moves an idea through its status (under review, being built, added, won't be added)
// and answers it, and the student whose idea is added gets 100 points. Texts go through the
// فضفضة word filter (js/ventfilter.js). ideas/{id} = { t, d?, c, by, n, st, v, r?, at };
// ideaVotes/{id}/{uid} and ideaMine/{uid}/{id} hold the votes (see tools/rules.py).
// Loaded on demand by app._need('ideas') after app._need('ventfilter').
(function () {
    const CATS = { study: ['الدراسة', 'graduation-cap', '#2563EB'], play: ['المنافسة والنقاط', 'trophy', '#F59E0B'], look: ['الشكل والتصميم', 'palette', '#EC4899'], store: ['المتجر', 'store', '#10B981'], other: ['غيرها', 'sparkles', '#8B5CF6'] };
    const ST = { new: ['جديدة', 'circle-dot', '#64748B'], review: ['قيد الدراسة', 'search', '#2563EB'], doing: ['قيد التنفيذ', 'hammer', '#F59E0B'], done: ['انضافت', 'badge-check', '#16A34A'], no: ['ما راح تنضاف', 'circle-x', '#DC2626'] };
    const TABS = [['top', 'الأكثر تصويت', 'flame'], ['new', 'الأحدث', 'clock'], ['doing', 'قيد التنفيذ', 'hammer'], ['done', 'انضافت', 'badge-check']];
    const CMK = { bug: ['خطأ بالتطبيق', 'bug', '#EF4444'], problem: ['مشكلة', 'alert-triangle', '#F59E0B'], complaint: ['شكوى', 'message-square-warning', '#8B5CF6'] };
    const CMS = { new: ['انرسلت', 'send', '#64748B'], seen: ['شافتها الإدارة', 'eye', '#2563EB'], fixed: ['انحلت', 'badge-check', '#16A34A'], closed: ['مسدودة', 'circle-slash', '#94A3B8'] };
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const ago = (t) => {
        const m = Math.max(0, Math.round((Date.now() - (Number(t) || 0)) / 60000));
        return m < 1 ? 'هسه' : m < 60 ? 'قبل ' + m + ' دقيقة' : m < 1440 ? 'قبل ' + Math.round(m / 60) + ' ساعة' : 'قبل ' + Math.round(m / 1440) + ' يوم';
    };
    const words = (s) => new Set(String(s || '').replace(/[^ء-يa-z0-9\s]/gi, ' ').split(/\s+/).filter((w) => w.length > 2));

    Object.assign(app, {
        idOpen() {
            this._id = this._id || { list: [], tab: 'top', cat: '', mine: {}, open: {}, loaded: false };
            this._idRender();
            { const t = document.getElementById('idHeadT'); if (t) t.textContent = this._id.sec === 'cmp' ? 'الشكاوي والمشاكل' : 'صندوق الأفكار'; }
            if (!this.isLoggedIn || !this.authUid || !window.firebaseDb) return;
            this._idListen();
        },

        _idListen() {
            const s = this._id;
            if (s.off) return;
            const { ref, onValue, get, query, orderByChild, limitToLast } = window.firebaseDbHelpers;
            s.off = onValue(query(ref(window.firebaseDb, 'ideas'), orderByChild('at'), limitToLast(300)), (snap) => {
                const v = snap.val() || {};
                s.list = Object.keys(v).map((id) => Object.assign({ id }, v[id])).filter((x) => x.t && ST[x.st]);
                s.loaded = true;
                if (this.currentView === 'ideasView') this._idList();
                this._idStats();
            }, () => { s.loaded = true; s.denied = true; this._idRender(); });
            get(ref(window.firebaseDb, 'ideaMine/' + this.authUid)).then((snap) => { s.mine = snap.val() || {}; this._idList(); }).catch(() => {});
        },

        // the two halves of the page: the ideas, and the problems/complaints the student reported
        _idSwitch() {
            const sec = this._id.sec || 'ideas';
            return `<div class="id-sw"><button class="${sec === 'ideas' ? 'on' : ''}" onclick="app.idSec('ideas')"><i data-lucide="lightbulb"></i>أفكار</button><button class="${sec === 'cmp' ? 'on' : ''}" onclick="app.idSec('cmp')"><i data-lucide="life-buoy"></i>شكاوي ومشاكل</button></div>`;
        },
        idSec(k) { this._id.sec = k; this._idRender(); const t = document.getElementById('idHeadT'); if (t) t.textContent = k === 'cmp' ? 'الشكاوي والمشاكل' : 'صندوق الأفكار'; },
        idPlus() { if ((this._id || {}).sec === 'cmp') this.cmCompose(); else this.idCompose(); },

        _idRender() {
            const s = this._id, box = document.getElementById('idContent');
            if (!box) return;
            if (s.sec === 'cmp' && this.isLoggedIn && this.authUid) { this._cmRender(); return; }
            if (!this.isLoggedIn || !this.authUid) {
                box.innerHTML = `<div class="id-wrap"><div class="id-empty"><span><i data-lucide="lightbulb"></i></span><b>سجّل دخولك حتى تقترح وتصوّت</b><button class="id-btn" onclick="app.goToAuth('login')">تسجيل الدخول</button></div></div>`;
                lucide.createIcons();
                return;
            }
            box.innerHTML = `<div class="id-wrap">
                ${this._idSwitch()}
                <div class="id-hero">
                    <div class="id-bulb"><i data-lucide="lightbulb"></i><span></span><span></span><span></span></div>
                    <div><b>عندك فكرة تخلي التطبيق أحلى؟</b><p>اقترحها، والطلاب يصوتون، والأفكار الأكثر تصويت تنضاف. وصاحب الفكرة ياخذ <em>100 نقطة</em>.</p></div>
                    <button class="id-btn light" onclick="app.idCompose()"><i data-lucide="plus"></i>عندي فكرة</button>
                </div>
                <div class="id-stats" id="idStats"></div>
                <div class="id-tabs">${TABS.map(([k, l, ic]) => `<button class="${s.tab === k ? 'on' : ''}" onclick="app.idTab('${k}')"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div>
                <div class="id-cats"><button class="${!s.cat ? 'on' : ''}" onclick="app.idCat('')">الكل</button>${Object.keys(CATS).map((k) => `<button class="${s.cat === k ? 'on' : ''}" style="--c:${CATS[k][2]}" onclick="app.idCat('${k}')"><i data-lucide="${CATS[k][1]}"></i>${CATS[k][0]}</button>`).join('')}</div>
                <div class="id-list" id="idList"></div>
            </div>`;
            lucide.createIcons();
            this._idStats(); this._idList();
        },

        _idStats() {
            const s = this._id, el = document.getElementById('idStats');
            if (!el) return;
            const n = (st) => s.list.filter((x) => x.st === st).length;
            el.innerHTML = [['lightbulb', s.list.length, 'فكرة'], ['hammer', n('doing'), 'قيد التنفيذ'], ['badge-check', n('done'), 'انضافت']]
                .map(([ic, v, l]) => `<div><i data-lucide="${ic}"></i><b>${v}</b><span>${l}</span></div>`).join('');
            lucide.createIcons();
        },

        idTab(k) { this._id.tab = k; this._idRender(); },
        idCat(k) { this._id.cat = k; this._idRender(); },

        _idList() {
            const s = this._id, box = document.getElementById('idList');
            if (!box) return;
            if (!s.loaded) { box.innerHTML = '<div class="id-load"><i></i><i></i><i></i></div>'; return; }
            if (s.denied) { box.innerHTML = '<p class="id-none">صندوق الأفكار بعده ما مفعل. لازم الإدارة تنشر القواعد الجديدة.</p>'; return; }
            let list = s.list.filter((x) => !s.cat || x.c === s.cat);
            if (s.tab === 'top') list = list.filter((x) => x.st !== 'no' && x.st !== 'done').sort((a, b) => (b.v || 0) - (a.v || 0) || (b.at || 0) - (a.at || 0));
            else if (s.tab === 'new') list.sort((a, b) => (b.at || 0) - (a.at || 0));
            else list = list.filter((x) => x.st === s.tab).sort((a, b) => (b.v || 0) - (a.v || 0));
            if (!list.length) {
                box.innerHTML = `<div class="id-empty small"><span><i data-lucide="${s.tab === 'done' ? 'badge-check' : 'lightbulb'}"></i></span><b>${s.tab === 'done' ? 'بعد ما انضافت أفكار' : s.tab === 'doing' ? 'ماكو أفكار قيد التنفيذ هسه' : 'بعد ماكو أفكار هنا'}</b>${s.tab === 'top' || s.tab === 'new' ? '<p>كون أول واحد يقترح.</p>' : ''}</div>`;
                lucide.createIcons();
                return;
            }
            const top = s.tab === 'top' ? list[0] && list[0].v ? list[0].id : '' : '';
            box.innerHTML = list.slice(0, 120).map((x, i) => this._idCard(x, i, x.id === top)).join('');
            lucide.createIcons();
        },

        _idCard(x, i, crown) {
            const s = this._id, c = CATS[x.c] || CATS.other, st = ST[x.st], voted = !!s.mine[x.id], mine = x.by === this.authUid, long = (x.d || '').length > 140;
            return `<article class="id-card st-${x.st}${crown ? ' crown' : ''}" style="--c:${c[2]};--sc:${st[2]};--i:${Math.min(i, 12)}">
                <button class="id-vote${voted ? ' on' : ''}" onclick="app.idVote(${jsArg(x.id)}, this)" ${x.st === 'done' || x.st === 'no' ? 'disabled' : ''} aria-label="${voted ? 'شيل صوتي' : 'صوّت'}">
                    <i data-lucide="${voted ? 'heart' : 'chevron-up'}"></i><b>${x.v || 0}</b><small>${voted ? 'صوتك' : 'صوّت'}</small></button>
                <div class="id-b">
                    <div class="id-meta"><span class="id-cat"><i data-lucide="${c[1]}"></i>${c[0]}</span><span class="id-st"><i data-lucide="${st[1]}"></i>${st[0]}</span>${crown ? '<span class="id-crown"><i data-lucide="crown"></i>الأولى</span>' : ''}</div>
                    <b class="id-t" dir="auto">${esc(x.t)}</b>
                    ${x.d ? `<p class="id-d${long && !s.open[x.id] ? ' clamp' : ''}" dir="auto">${esc(x.d)}</p>${long ? `<button class="id-more" onclick="app.idMore(${jsArg(x.id)})">${s.open[x.id] ? 'أقل' : 'اقرا أكثر'}</button>` : ''}` : ''}
                    <div class="id-by"><span>فكرة ${esc(x.n || 'طالب')} · ${ago(x.at)}</span>${mine ? '<em>فكرتك</em>' : app.rpBtn({ type: 'idea', targetUid: x.by, ref: 'ideas/' + x.id, snippet: x.t + ' ' + (x.d || '') }, 'id-rp', '')}${mine && x.st === 'new' ? `<button onclick="app.idDelete(${jsArg(x.id)})"><i data-lucide="trash-2"></i></button>` : ''}</div>
                    ${x.r ? `<div class="id-reply"><span><i data-lucide="megaphone"></i>رد الإدارة</span><p dir="auto">${esc(x.r)}</p></div>` : ''}
                    ${x.st === 'done' ? `<div class="id-thanks"><i data-lucide="party-popper"></i>انضافت للتطبيق، شكراً ${esc(x.n || '')}!</div>` : ''}
                </div>
            </article>`;
        },

        idMore(id) { const s = this._id; s.open[id] = !s.open[id]; this._idList(); },

        async idVote(id, btn) {
            const s = this._id, x = s.list.find((y) => y.id === id);
            if (!x || s.busy) return;
            const on = !s.mine[id], { ref, update } = window.firebaseDbHelpers;
            s.busy = true;
            if (on) { btn?.classList.add('on', 'pop'); const f = document.createElement('i'); f.className = 'id-plus'; f.textContent = '+1'; btn?.appendChild(f); setTimeout(() => f.remove(), 900); }
            try {
                await update(ref(window.firebaseDb), {
                    ['ideaVotes/' + id + '/' + this.authUid]: on ? true : null,
                    ['ideaMine/' + this.authUid + '/' + id]: on ? true : null,
                    ['ideas/' + id + '/v']: (x.v || 0) + (on ? 1 : -1),
                });
                if (on) s.mine[id] = true; else delete s.mine[id];
            } catch (e) {
                this.showToast('ما انحسب صوتك، حاول مرة ثانية');
            }
            s.busy = false;
            this._idList();
        },

        async idDelete(id) {
            if (!confirm('تحذف فكرتك؟')) return;
            const { ref, set } = window.firebaseDbHelpers;
            try { await set(ref(window.firebaseDb, 'ideas/' + id), null); this.showToast('انحذفت'); } catch (e) { this.showToast('ما انحذفت'); }
        },

        // ---------- suggesting ----------
        idCompose() {
            const s = this._id;
            s.draft = s.draft || { c: '' };
            document.querySelector('.id-sheet')?.remove();
            const el = document.createElement('div');
            el.className = 'id-sheet';
            el.innerHTML = '<div class="id-sp" id="idSp"></div>';
            el.addEventListener('click', (e) => { if (e.target === el) this.idComposeClose(); });
            document.body.appendChild(el);
            requestAnimationFrame(() => el.classList.add('in'));
            this._idForm();
            setTimeout(() => document.getElementById('idT')?.focus(), 250);
        },
        idComposeClose() { const el = document.querySelector('.id-sheet'); if (el) { el.classList.remove('in'); setTimeout(() => el.remove(), 250); } },

        _idForm() {
            const s = this._id, d = s.draft, box = document.getElementById('idSp');
            if (!box) return;
            const wait = Math.max(0, 600000 - (Date.now() - (Number((() => { try { return localStorage.getItem('isp_idea_last_' + this.authUid); } catch (e) { return 0; } })()) || 0)));
            box.innerHTML = `<div class="id-sh"><b>فكرتك</b><button onclick="app.idComposeClose()" aria-label="سد"><i data-lucide="x"></i></button></div>
                <label>شنو الفكرة باختصار؟ *</label>
                <input id="idT" maxlength="80" value="${esc(d.t || '')}" placeholder="مثلاً: وضع ليلي لصفحة الملازم" oninput="app._idSimilar(this.value)">
                <div id="idSim"></div>
                <label>تخص شنو؟ *</label>
                <div class="id-pick">${Object.keys(CATS).map((k) => `<button class="${d.c === k ? 'on' : ''}" style="--c:${CATS[k][2]}" onclick="app.idPickCat('${k}')"><i data-lucide="${CATS[k][1]}"></i>${CATS[k][0]}</button>`).join('')}</div>
                <label>اشرحها أكثر (اختياري)</label>
                <textarea id="idD" maxlength="400" rows="4" placeholder="شلون تشتغل؟ وليش تفيد الطلاب؟">${esc(d.d || '')}</textarea>
                <button class="id-btn wide" id="idSend" onclick="app.idSubmit()" ${wait ? 'disabled' : ''}><i data-lucide="send"></i>${wait ? 'تكدر تقترح بعد ' + Math.ceil(wait / 60000) + ' دقيقة' : 'أرسل الفكرة'}</button>`;
            lucide.createIcons();
            if (d.t) this._idSimilar(d.t);
        },
        idPickCat(k) {
            const d = this._id.draft;
            d.t = (document.getElementById('idT') || {}).value || d.t; d.d = (document.getElementById('idD') || {}).value || d.d;
            d.c = k;
            this._idForm();
        },
        // ideas that look the same: vote on them instead of repeating them
        _idSimilar(t) {
            const s = this._id, el = document.getElementById('idSim');
            if (!el) return;
            const w = words(t);
            if (w.size < 2) { el.innerHTML = ''; return; }
            const sim = s.list.filter((x) => x.st !== 'no').map((x) => { const xw = words(x.t + ' ' + (x.d || '')); let n = 0; w.forEach((a) => { if (xw.has(a)) n++; }); return [x, n / w.size]; })
                .filter(([, r]) => r >= 0.5).sort((a, b) => b[1] - a[1]).slice(0, 3);
            el.innerHTML = sim.length ? `<div class="id-sim"><small><i data-lucide="info"></i>أكو أفكار تشبهها، صوّت عليها بدل ما تكررها:</small>${sim.map(([x]) => `<button onclick="app.idGoTo(${jsArg(x.id)})"><b>${esc(x.t)}</b><span>${x.v || 0} صوت</span></button>`).join('')}</div>` : '';
            lucide.createIcons();
        },
        idGoTo(id) {
            this.idComposeClose();
            const s = this._id; s.tab = 'new'; s.cat = '';
            this._idRender();
            setTimeout(() => { const i = s.list.filter((x) => true).sort((a, b) => (b.at || 0) - (a.at || 0)).findIndex((x) => x.id === id); document.querySelectorAll('#idList .id-card')[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200);
        },

        async idSubmit() {
            const s = this._id, d = s.draft;
            d.t = String((document.getElementById('idT') || {}).value || '').trim(); d.d = String((document.getElementById('idD') || {}).value || '').trim();
            if (d.t.length < 5) { this.showToast('اكتب الفكرة بجملة أوضح'); return; }
            if (!d.c) { this.showToast('اختار الفكرة تخص شنو'); return; }
            const r = window.ventCheck ? window.ventCheck(d.t + '\n' + d.d) : { kind: null };
            if (r.kind) { this.showToast('بالفكرة كلمات ما تنفع، عدلها'); return; }
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const { ref, update, serverTimestamp } = window.firebaseDbHelpers;
            const o = { t: d.t.slice(0, 80), c: d.c, by: this.authUid, n: String((this.currentUser || {}).fullName || 'طالب').split(' ')[0].slice(0, 30), st: 'new', v: 0, at: serverTimestamp() };
            if (d.d) o.d = d.d.slice(0, 400);
            const btn = document.getElementById('idSend');
            if (btn) btn.disabled = true;
            try {
                await update(ref(window.firebaseDb), { ['ideas/' + id]: o, ['ideaLast/' + this.authUid]: serverTimestamp() });
                try { localStorage.setItem('isp_idea_last_' + this.authUid, String(Date.now())); } catch (e) {}
                s.draft = null; s.tab = 'new';
                this.idComposeClose();
                this._idRender();
                this.showToast('انرسلت فكرتك، خلي أصدقائك يصوتون عليها');
            } catch (e) {
                this.showToast(String(e && e.message || e).includes('ermission') ? 'ما انرسلت. يمكن اقترحت قبل أقل من 10 دقايق' : 'ما انرسلت، تأكد من النت');
                if (btn) btn.disabled = false;
            }
        },

        // ---------- شكاوي ومشاكل ----------
        _cmListen() {
            const s = this._id;
            if (s.cmOff || !window.firebaseDb) return;
            const { ref, onValue, query, orderByChild, limitToLast } = window.firebaseDbHelpers;
            s.cmOff = onValue(query(ref(window.firebaseDb, 'complaints/' + this.authUid), orderByChild('at'), limitToLast(50)), (snap) => {
                const v = snap.val() || {};
                s.cm = Object.keys(v).map((id) => Object.assign({ id }, v[id])).sort((a, b) => (b.at || 0) - (a.at || 0));
                s.cmLoaded = true;
                if (this.currentView === 'ideasView' && s.sec === 'cmp') this._cmList();
            }, () => { s.cmLoaded = true; s.cmDenied = true; if (s.sec === 'cmp') this._cmList(); });
        },
        _cmRender() {
            const s = this._id, box = document.getElementById('idContent');
            if (!box) return;
            this._cmListen();
            box.innerHTML = `<div class="id-wrap">
                ${this._idSwitch()}
                <div class="id-hero cm">
                    <div class="id-bulb"><i data-lucide="life-buoy"></i><span></span><span></span><span></span></div>
                    <div><b>شفت خطأ أو عندك مشكلة بالتطبيق؟</b><p>اكتبها وأرفق صورة اذا تحب، والإدارة تشوفها وترد عليك هنا.</p></div>
                    <button class="id-btn light" onclick="app.cmCompose()"><i data-lucide="plus"></i>بلّغ عن مشكلة</button>
                </div>
                <div class="id-list" id="cmList"></div>
            </div>`;
            lucide.createIcons();
            this._cmList();
        },
        _cmList() {
            const s = this._id, box = document.getElementById('cmList');
            if (!box) return;
            if (!s.cmLoaded) { box.innerHTML = '<div class="id-load"><i></i><i></i></div>'; return; }
            if (s.cmDenied) { box.innerHTML = '<p class="id-none">البلاغات بعدها ما مفعلة. لازم الإدارة تنشر القواعد الجديدة.</p>'; return; }
            if (!(s.cm || []).length) { box.innerHTML = '<div class="id-empty small"><span><i data-lucide="check-circle"></i></span><b>ما بلّغت عن شي لحد الحين</b></div>'; lucide.createIcons(); return; }
            box.innerHTML = '<div class="id-sub">بلاغاتي</div>' + s.cm.map((x) => {
                const k = CMK[x.k] || CMK.problem, st = CMS[x.st] || CMS.new;
                return `<article class="id-card cm" style="--c:${k[2]};--sc:${st[2]}">
                    <div class="id-b">
                        <div class="id-meta"><span class="id-cat"><i data-lucide="${k[1]}"></i>${k[0]}</span><span class="id-st"><i data-lucide="${st[1]}"></i>${st[0]}</span></div>
                        <p class="id-d" dir="auto">${esc(x.t)}</p>
                        ${x.img ? `<img class="cm-img" src="${esc(x.img)}" alt="" onclick="app.cmZoom(this.src)">` : ''}
                        <div class="id-by"><span>${ago(x.at)}${x.ph ? ' · رقمك: ' + esc(x.ph) : ''}</span></div>
                        ${x.r ? `<div class="id-reply"><span><i data-lucide="megaphone"></i>رد الإدارة</span><p dir="auto">${esc(x.r)}</p></div>` : ''}
                    </div></article>`;
            }).join('');
            lucide.createIcons();
        },
        cmZoom(src) {
            const o = document.createElement('div');
            o.className = 'cm-zoom'; o.innerHTML = '<img alt="">'; o.firstChild.src = src;
            o.onclick = () => o.remove(); document.body.appendChild(o);
        },

        cmCompose() {
            const s = this._id;
            s.cd = { k: 'bug', t: '', ph: '', img: '' };
            document.querySelector('.id-sheet')?.remove();
            const el = document.createElement('div');
            el.className = 'id-sheet';
            el.innerHTML = '<div class="id-sp" id="idSp"></div>';
            el.addEventListener('click', (e) => { if (e.target === el) this.idComposeClose(); });
            document.body.appendChild(el);
            requestAnimationFrame(() => el.classList.add('in'));
            this._cmForm();
            setTimeout(() => document.getElementById('cmT')?.focus(), 250);
        },
        _cmForm() {
            const d = this._id.cd, box = document.getElementById('idSp');
            if (!box) return;
            const wait = Math.max(0, 300000 - (Date.now() - (Number((() => { try { return localStorage.getItem('isp_cm_last_' + this.authUid); } catch (e) { return 0; } })()) || 0)));
            box.innerHTML = `<div class="id-sh"><b>بلّغ عن مشكلة</b><button onclick="app.idComposeClose()" aria-label="سد"><i data-lucide="x"></i></button></div>
                <label>شنو نوع البلاغ؟ *</label>
                <div class="id-pick">${Object.keys(CMK).map((k) => `<button class="${d.k === k ? 'on' : ''}" style="--c:${CMK[k][2]}" onclick="app.cmKind('${k}')"><i data-lucide="${CMK[k][1]}"></i>${CMK[k][0]}</button>`).join('')}</div>
                <label>اكتب المشكلة بالتفصيل *</label>
                <textarea id="cmT" maxlength="1000" rows="5" placeholder="شنو صار؟ بأي صفحة؟ شنو ضغطت؟ كل ما كتبت أكثر نكدر نحلها أسرع.">${esc(d.t)}</textarea>
                <label>صورة توضيحية (اختياري)</label>
                ${d.img ? `<div class="cm-prev"><img src="${esc(d.img)}" alt=""><button onclick="app.cmImg(null)" aria-label="شيل الصورة"><i data-lucide="x"></i></button></div>`
                    : `<label class="cm-file"><i data-lucide="image-plus"></i>أرفق صورة من الكاليري<input type="file" accept="image/*" hidden onchange="app.cmImg(this.files[0])"></label>`}
                <label>رقم هاتف للتواصل (اختياري)</label>
                <input id="cmP" type="tel" inputmode="tel" maxlength="16" dir="ltr" value="${esc(d.ph)}" placeholder="07xxxxxxxxx">
                <small class="cm-note">اذا تحب نتواصل وياك أو نستفسر أكثر اكتب رقمك. وتوصل وياها بياناتك بالتطبيق (الاسم ورقم الطالب) ونسخة التطبيق حتى نكدر نحل المشكلة.</small>
                <button class="id-btn wide" id="cmSend" onclick="app.cmSubmit()" ${wait ? 'disabled' : ''}><i data-lucide="send"></i>${wait ? 'تكدر تبلّغ بعد ' + Math.ceil(wait / 60000) + ' دقيقة' : 'أرسل البلاغ'}</button>`;
            lucide.createIcons();
        },
        _cmKeep() { const d = this._id.cd; d.t = (document.getElementById('cmT') || {}).value || d.t; d.ph = (document.getElementById('cmP') || {}).value || d.ph; },
        cmKind(k) { this._cmKeep(); this._id.cd.k = k; this._cmForm(); },
        async cmImg(file) {
            this._cmKeep();
            const d = this._id.cd;
            if (!file) { d.img = ''; this._cmForm(); return; }
            try {
                const url = await new Promise((res, rej) => {
                    const fr = new FileReader(); fr.onerror = rej;
                    fr.onload = () => {
                        const im = new Image(); im.onerror = rej;
                        im.onload = () => {
                            let w = Math.min(960, im.width), q = 0.72, out = '';
                            for (let i = 0; i < 6; i++) {
                                const cv = document.createElement('canvas'), r = w / im.width; cv.width = Math.round(im.width * r); cv.height = Math.round(im.height * r);
                                const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
                                out = cv.toDataURL('image/jpeg', q);
                                if (out.length <= 110000) break;
                                w = Math.round(w * 0.8); q = Math.max(0.5, q - 0.06);
                            }
                            out.length <= 110000 ? res(out) : rej(new Error('big'));
                        };
                        im.src = fr.result;
                    };
                    fr.readAsDataURL(file);
                });
                d.img = url;
            } catch (e) { this.showToast('ما كدرت أجهز الصورة، جرب صورة ثانية'); }
            this._cmForm();
        },
        async cmSubmit() {
            const s = this._id; this._cmKeep();
            const d = s.cd, t = String(d.t || '').trim(), ph = String(d.ph || '').replace(/[^\d+]/g, '');
            if (t.length < 10) { this.showToast('اكتب المشكلة بجملة أوضح (10 حروف على الأقل)'); return; }
            if (ph && (ph.length < 9 || ph.length > 16)) { this.showToast('رقم الهاتف مو صحيح، صححه أو شيله'); return; }
            const u = this.currentUser || {}, id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const native = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
            const o = { uid: this.authUid, k: d.k, t: t.slice(0, 1000), st: 'new', at: window.firebaseDbHelpers.serverTimestamp(),
                n: String(u.fullName || 'طالب').slice(0, 80), s: String(u.studentNumber || '').slice(0, 12), ver: String(window.APP_VER || '').slice(0, 40), view: String(this.currentView || '').slice(0, 40),
                dev: ((native ? 'تطبيق أندرويد' : 'متصفح') + ' · ' + ((navigator.userAgent.match(/\(([^)]+)\)/) || [])[1] || '')).slice(0, 160) };
            if (ph) o.ph = ph; if (d.img) o.img = d.img;
            const { ref, update, serverTimestamp } = window.firebaseDbHelpers;
            const btn = document.getElementById('cmSend'); if (btn) btn.disabled = true;
            try {
                await update(ref(window.firebaseDb), { ['complaints/' + this.authUid + '/' + id]: o, ['complaintLast/' + this.authUid]: serverTimestamp() });
                try { localStorage.setItem('isp_cm_last_' + this.authUid, String(Date.now())); } catch (e) {}
                s.cd = null; this.idComposeClose(); this._idRender();
                this.showToast('وصل بلاغك للإدارة، شكراً لك');
            } catch (e) {
                this.showToast(String(e && e.message || e).includes('ermission') ? 'ما انرسل. يمكن بلّغت قبل أقل من 5 دقايق' : 'ما انرسل، تأكد من النت');
                if (btn) btn.disabled = false;
            }
        },
    });
})();
