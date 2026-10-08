// فضفضة: students write what weighs on them with no name and no governorate, and others answer
// with a hug, strength or a prayer, a ready-made kind reply or a short one of their own.
// Every text goes through ventCheck (js/ventfilter.js) first: insults, swearing and sexual
// words are refused and reported to the admin (ventAlerts); a post that sounds like the
// student may hurt themselves goes through, with a kind word, and the admin is told.
// Who wrote what is kept apart (ventOwners), readable by the admin only (see tools/rules.py).
// Loaded on demand by app._need('vent') after app._need('ventfilter').
(function () {
    const MOODS = {
        sad: ['حزين', 'cloud-rain', '#3B82F6', '#6366F1'],
        worry: ['قلقان', 'cloud-lightning', '#8B5CF6', '#D946EF'],
        tired: ['تعبان', 'battery-low', '#64748B', '#334155'],
        upset: ['متضايق', 'flame', '#F43F5E', '#F97316'],
        lost: ['ضايع', 'compass', '#F59E0B', '#EA580C'],
        hope: ['متفائل', 'sun', '#10B981', '#0D9488'],
    };
    const REACTS = { hug: ['حضن', 'heart-handshake'], power: ['قوة', 'zap'], pray: ['دعاء', 'sparkles'] };
    const KIND = {
        s: ['دعم', 'heart', '#EC4899', ['انت مو وحدك، كلنا وياك', 'اللي تحس بيه طبيعي، لا تلوم نفسك', 'فخور بيك لأنك حچيت', 'قلبي وياك، خذ نفس عميق']],
        m: ['تحفيز', 'rocket', '#F59E0B', ['هاي الفترة راح تعدي وتصير ذكرى', 'انت أقوى مما تتصور', 'خطوة صغيرة اليوم تكفي', 'تعبك ما راح يروح هدر', 'راح تنجح وتتذكر هاليوم وتضحك']],
        d: ['دعاء', 'moon-star', '#10B981', ['الله يفرجها عليك ويريح قلبك', 'دعيتلك من قلبي', 'الله يوفقك وينجحك', 'ربي يكتبلك الخير وين ما كان']],
    };
    const preset = (k) => { const g = KIND[k && k[0]]; return g ? { g, t: g[3][Number(k.slice(1)) - 1] } : null; };
    const CHEER = ['خففت عن قلبك، وهذا شي شجاع', 'الكلام اللي يطلع يخف ثقله', 'انت مو وحدك، راح تشوف', 'محد يعرف منو انت، بس الكل يحس بيك'];
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const ago = (t) => {
        const m = Math.max(0, Math.round((Date.now() - (Number(t) || 0)) / 60000));
        return m < 1 ? 'هسه' : m < 60 ? 'قبل ' + m + ' دقيقة' : m < 1440 ? 'قبل ' + Math.round(m / 60) + ' ساعة' : 'قبل ' + Math.round(m / 1440) + ' يوم';
    };
    const newKey = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const TS = () => window.firebaseDbHelpers.serverTimestamp();

    Object.assign(app, {
        vtOpen() {
            const v = this._vt = this._vt || { posts: [], count: {}, tab: 'new', mood: '', open: '', replies: {}, hero: 0, loaded: false };
            v.mine = this._vtLocal('mine', []);
            v.reacted = this._vtLocal('react', {});
            document.body.classList.add('vt-on');
            this._vtRender();
            if (!this.isLoggedIn || !this.authUid || !window.firebaseDb) return;
            this._vtListen();
            const { ref, get } = window.firebaseDbHelpers;
            get(ref(window.firebaseDb, 'ventBan/' + this.authUid)).then((s) => { v.banned = s.val() === true; if (v.banned) this._vtRender(); }).catch(() => {});
            clearInterval(v.heroT);
            v.heroT = setInterval(() => this._vtHeroNext(), 6000);
        },
        vtClose() {
            document.body.classList.remove('vt-on');
            document.querySelector('.vt-sheet')?.remove();
            if (this._vt) clearInterval(this._vt.heroT);
        },

        _vtLocal(k, def) { try { const v = JSON.parse(localStorage.getItem('isp_vent_' + k + '_' + this.authUid) || 'null'); return v || def; } catch (e) { return def; } },
        _vtSave(k, v) { try { localStorage.setItem('isp_vent_' + k + '_' + this.authUid, JSON.stringify(v)); } catch (e) {} },

        _vtListen() {
            const v = this._vt;
            if (v.off) return;
            const { ref, onValue, query, orderByChild, limitToLast } = window.firebaseDbHelpers;
            const a = onValue(query(ref(window.firebaseDb, 'vent'), orderByChild('at'), limitToLast(120)), (snap) => {
                const val = snap.val() || {};
                v.posts = Object.keys(val).map((id) => Object.assign({ id }, val[id])).filter((p) => p.tx && MOODS[p.m]).sort((x, y) => (y.at || 0) - (x.at || 0));
                v.loaded = true;
                this._vtFeed(); this._vtHero(true);
            }, () => { v.loaded = true; v.denied = true; this._vtRender(); });
            const b = onValue(ref(window.firebaseDb, 'ventCount'), (snap) => { v.count = snap.val() || {}; this._vtFeed(); if (v.open) this._vtSheetRender(); }, () => {});
            v.off = () => { a(); b(); };
        },

        _vtVisible() {
            const v = this._vt;
            let list = v.posts.filter((p) => ((v.count[p.id] || {}).rep || 0) < 3);
            if (v.mood) list = list.filter((p) => p.m === v.mood);
            if (v.tab === 'need') list = list.filter((p) => !((v.count[p.id] || {}).rc)).concat(list.filter((p) => (v.count[p.id] || {}).rc));
            if (v.tab === 'mine') list = v.posts.filter((p) => v.mine.includes(p.id));
            return list;
        },

        // ---------- page ----------
        _vtRender() {
            const v = this._vt, box = document.getElementById('vtRoot');
            if (!box) return;
            if (!this.isLoggedIn || !this.authUid) {
                box.innerHTML = this._vtTop() + `<div class="vt-gate"><span><i data-lucide="lock"></i></span><b>سجّل دخولك حتى تفضفض</b><p>اسمك ما يطلع لأي أحد، بس نحتاج حساب حتى نحمي المكان من المسيئين.</p><button onclick="app.goToAuth('login')">تسجيل الدخول</button></div>`;
                lucide.createIcons();
                return;
            }
            box.innerHTML = this._vtTop() + `
                <div class="vt-hero" id="vtHero"></div>
                ${v.banned ? `<div class="vt-gate small"><b>ما تكدر تكتب بالفضفضة</b><p>انمنعت الكتابة من حسابك بسبب كلام مسيء. تكدر تقرا وتدعم الباقين.</p></div>` : this._vtComposer()}
                <div class="vt-tabs">${[['new', 'الأحدث', 'clock'], ['need', 'محتاجين دعم', 'hand-heart'], ['mine', 'فضفضاتي', 'user-round']].map(([k, l, ic]) => `<button class="${v.tab === k ? 'on' : ''}" onclick="app.vtTab('${k}')"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div>
                <div class="vt-moods">${`<button class="${!v.mood ? 'on' : ''}" onclick="app.vtMoodF('')">الكل</button>` + Object.keys(MOODS).map((k) => `<button class="${v.mood === k ? 'on' : ''}" style="--a:${MOODS[k][2]};--b:${MOODS[k][3]}" onclick="app.vtMoodF('${k}')"><i data-lucide="${MOODS[k][1]}"></i>${MOODS[k][0]}</button>`).join('')}</div>
                <div class="vt-feed" id="vtFeed"></div>`;
            lucide.createIcons();
            this._vtFeed(); this._vtHero(true);
        },

        _vtTop() {
            return `<div class="vt-bg"><i></i><i></i><i></i></div>
                <div class="vt-top"><button class="vt-ic" onclick="app.goBack()" aria-label="رجوع"><i data-lucide="chevron-right"></i></button>
                <div class="vt-title"><b>فضفضة</b><small><i data-lucide="shield-check"></i>بدون اسم وبدون محافظة، محد يعرف منو انت</small></div></div>`;
        },

        _vtComposer() {
            const v = this._vt, m = v.pick || '';
            const wait = Math.max(0, 300000 - (Date.now() - (this._vtLocal('last', 0) || 0)));
            return `<div class="vt-comp ${v.writing ? 'open' : ''}" id="vtComp" style="${m ? `--a:${MOODS[m][2]};--b:${MOODS[m][3]}` : ''}">
                ${v.writing ? `
                    <div class="vt-pick">${Object.keys(MOODS).map((k) => `<button class="${m === k ? 'on' : ''}" style="--a:${MOODS[k][2]};--b:${MOODS[k][3]}" onclick="app.vtPick('${k}')"><i data-lucide="${MOODS[k][1]}"></i>${MOODS[k][0]}</button>`).join('')}</div>
                    <textarea id="vtTx" maxlength="400" rows="4" placeholder="اكتب اللي بقلبك... محد راح يعرف منو انت" oninput="app._vtCount(this)">${esc(v.draft || '')}</textarea>
                    <div class="vt-comp-f"><span id="vtN">${(v.draft || '').length}/400</span><button class="vt-cancel" onclick="app.vtWrite(false)">إلغاء</button>
                        <button class="vt-send" id="vtSend" onclick="app.vtPost()" ${wait ? 'disabled' : ''}><i data-lucide="send"></i>${wait ? 'تكدر تفضفض بعد ' + Math.ceil(wait / 60000) + ' دقيقة' : 'فضفض'}</button></div>`
                    : `<button class="vt-start" onclick="app.vtWrite(true)"><span><i data-lucide="feather"></i></span><b>شنو بقلبك اليوم؟</b><small>اكتب وخفف عن نفسك</small></button>`}
            </div>`;
        },
        vtWrite(on) {
            const v = this._vt;
            if (!on) { v.draft = ''; v.pick = ''; }
            v.writing = on;
            const c = document.getElementById('vtComp');
            if (c) { c.outerHTML = this._vtComposer(); lucide.createIcons(); }
            if (on) setTimeout(() => document.getElementById('vtTx')?.focus(), 100);
        },
        vtPick(k) {
            const v = this._vt;
            v.draft = (document.getElementById('vtTx') || {}).value || v.draft || '';
            v.pick = k;
            const c = document.getElementById('vtComp');
            if (c) { c.outerHTML = this._vtComposer(); lucide.createIcons(); }
        },
        _vtCount(el) { this._vt.draft = el.value; const n = document.getElementById('vtN'); if (n) n.textContent = el.value.length + '/400'; },
        vtTab(k) { this._vt.tab = k; this._vtRender(); },
        vtMoodF(k) { this._vt.mood = k; this._vtRender(); },

        // ---------- the rotating card ----------
        _vtHero(reset) {
            const v = this._vt, el = document.getElementById('vtHero');
            if (!el) return;
            const list = v.posts.filter((p) => ((v.count[p.id] || {}).rep || 0) < 3 && p.tx.length <= 220).slice(0, 8);
            if (!list.length) { el.innerHTML = `<div class="vt-hcard empty"><i data-lucide="feather"></i><p>بعد ماكو فضفضات. كون أول واحد يكتب.</p></div>`; lucide.createIcons(); return; }
            if (reset || v.hero >= list.length) v.hero = Math.min(v.hero, list.length - 1);
            const p = list[v.hero], md = MOODS[p.m];
            el.innerHTML = `<div class="vt-hcard" style="--a:${md[2]};--b:${md[3]}" onclick="app.vtOpen2(${jsArg(p.id)})">
                    <span class="vt-hq">”</span><small><i data-lucide="${md[1]}"></i>طالب ${md[0]} · ${ago(p.at)}</small>
                    <p dir="auto">${esc(p.tx)}</p>
                    <div class="vt-hdots">${list.map((_, i) => `<i class="${i === v.hero ? 'on' : ''}"></i>`).join('')}</div>
                </div>`;
            lucide.createIcons();
        },
        _vtHeroNext() {
            const v = this._vt, el = document.querySelector('#vtHero .vt-hcard');
            if (!el || document.hidden || this.currentView !== 'ventView') return;
            el.classList.add('out');
            setTimeout(() => { v.hero = (v.hero + 1) % Math.max(1, Math.min(8, v.posts.length)); this._vtHero(); }, 450);
        },

        // ---------- feed ----------
        _vtFeed() {
            const v = this._vt, box = document.getElementById('vtFeed');
            if (!box) return;
            if (!v.loaded) { box.innerHTML = '<div class="vt-load"><i></i><i></i><i></i></div>'; return; }
            if (v.denied) { box.innerHTML = '<p class="vt-none">الفضفضة بعدها ما مفعلة. لازم الإدارة تنشر القواعد الجديدة.</p>'; return; }
            const list = this._vtVisible();
            if (!list.length) { box.innerHTML = `<p class="vt-none">${v.tab === 'mine' ? 'بعدك ما فضفضت. اكتب فوك، محد يعرف منو انت.' : 'ماكو فضفضات هنا بعد.'}</p>`; return; }
            box.innerHTML = list.slice(0, 80).map((p, i) => this._vtCard(p, i)).join('');
            lucide.createIcons();
        },
        _vtCard(p, i) {
            const v = this._vt, md = MOODS[p.m], c = v.count[p.id] || {}, mine = v.mine.includes(p.id), my = v.reacted[p.id];
            return `<article class="vt-card" style="--a:${md[2]};--b:${md[3]};--i:${Math.min(i, 12)}">
                <div class="vt-card-h"><span class="vt-mood"><i data-lucide="${md[1]}"></i>${md[0]}</span><small>${ago(p.at)}</small>${mine ? '<em>فضفضتك</em>' : ''}
                    <button class="vt-more" onclick="app.vtMore(${jsArg(p.id)})" aria-label="خيارات"><i data-lucide="${mine || (this.modCan && this.modCan('delVent')) ? 'trash-2' : 'flag'}"></i></button></div>
                <p class="vt-tx" dir="auto">${esc(p.tx)}</p>
                <div class="vt-acts">${Object.keys(REACTS).map((k) => `<button class="${my === k ? 'on' : ''}" onclick="app.vtReact(${jsArg(p.id)}, '${k}', this)" ${my ? 'disabled' : ''}><i data-lucide="${REACTS[k][1]}"></i><span>${c[k] || ''}</span>${REACTS[k][0]}</button>`).join('')}
                    <button class="vt-rep" onclick="app.vtOpen2(${jsArg(p.id)})"><i data-lucide="message-circle-heart"></i>${c.rc ? c.rc + ' ' + (c.rc === 1 ? 'رد' : 'ردود') : 'ادعمه برد'}</button></div>
            </article>`;
        },

        // ---------- writing ----------
        _vtAlert(tx, r, where) {
            const { ref, set } = window.firebaseDbHelpers;
            set(ref(window.firebaseDb, 'ventAlerts/' + newKey()), { u: this.authUid, tx: String(tx).slice(0, 500), kind: r.danger && !r.kind ? 'danger' : r.kind, w: r.words.join('، ').slice(0, 120), where, at: TS() }).catch(() => {});
        },

        async vtPost() {
            const v = this._vt, tx = String((document.getElementById('vtTx') || {}).value || '').trim().replace(/\n{3,}/g, '\n\n');
            if (!v.pick) { this.showToast('اختار شلون حاس'); return; }
            if (tx.length < 3) { this.showToast('اكتب اللي بقلبك'); return; }
            const r = window.ventCheck ? window.ventCheck(tx) : { kind: null, words: [], danger: false };
            if (r.kind) {
                this._vtAlert(tx, r, 'post');
                this._vtWarn();
                return;
            }
            const btn = document.getElementById('vtSend');
            if (btn) btn.disabled = true;
            const id = newKey(), { ref, update } = window.firebaseDbHelpers;
            try {
                await update(ref(window.firebaseDb), { ['vent/' + id]: { tx, m: v.pick, at: TS() }, ['ventOwners/' + id]: this.authUid, ['ventLast/' + this.authUid]: TS() });
                v.mine = [id, ...v.mine].slice(0, 50); this._vtSave('mine', v.mine); this._vtSave('last', Date.now());
                if (r.danger) this._vtAlert(tx, r, 'post');
                v.draft = ''; v.pick = ''; v.writing = false; v.tab = 'new';
                this._vtRender();
                this._vtCheer(r.danger);
            } catch (e) {
                console.warn('Vent failed:', e);
                this.showToast(String(e && e.message || e).includes('ermission') ? 'ما انرسل. يمكن كتبت قبل أقل من 5 دقايق، أو بيه كلمة ممنوعة' : 'ما انرسل، تأكد من النت');
                if (btn) btn.disabled = false;
            }
        },

        _vtWarn() {
            this._vtModal(`<span class="vt-m-ic warn"><i data-lucide="shield-alert"></i></span><b>كلامك بيه ألفاظ ما تنفع</b>
                <p>الفضفضة مكان آمن للكل، فما نقبل سب ولا شتم ولا كلام خادش. عدّل كلامك وفضفض براحتك.</p>
                <p class="vt-m-note">تكرار الكلام المسيء يوقف الكتابة من حسابك.</p>
                <button onclick="app._vtModalClose()">تمام، راح أعدله</button>`);
        },
        _vtCheer(danger) {
            this._vtModal(danger
                ? `<span class="vt-m-ic care"><i data-lucide="heart-handshake"></i></span><b>احنا وياك</b>
                    <p>كلامك وصل، والطلاب راح يدعمونك. بس إذا تفكر تأذي نفسك، احچي هسه ويا شخص تثق بيه: أهلك، صديق، مدرسك، أو طبيب.</p>
                    <p class="vt-m-note">انت مهم، ووجودك يفرق. هاي الفترة تعدي.</p><button onclick="app._vtModalClose()">شكراً</button>`
                : `<span class="vt-m-ic"><i data-lucide="feather"></i></span><b>${CHEER[Math.floor(Math.random() * CHEER.length)]}</b>
                    <p>فضفضتك طلعت بدون اسم. ارجع بعدين وشوف الردود بـ "فضفضاتي".</p><button onclick="app._vtModalClose()">تمام</button>`);
        },
        _vtModal(html) {
            document.querySelector('.vt-modal')?.remove();
            const el = document.createElement('div');
            el.className = 'vt-modal';
            el.innerHTML = `<div class="vt-m">${html}</div>`;
            el.addEventListener('click', (e) => { if (e.target === el) this._vtModalClose(); });
            document.body.appendChild(el);
            lucide.createIcons();
            requestAnimationFrame(() => el.classList.add('in'));
        },
        _vtModalClose() { const el = document.querySelector('.vt-modal'); if (el) { el.classList.remove('in'); setTimeout(() => el.remove(), 250); } },

        // ---------- hug, strength, prayer; report or delete ----------
        async vtReact(pid, k, btn) {
            const v = this._vt;
            if (v.reacted[pid]) return;
            v.reacted[pid] = k; this._vtSave('react', v.reacted);
            btn?.classList.add('on', 'pop');
            const { ref, update } = window.firebaseDbHelpers, cur = ((v.count[pid] || {})[k]) || 0;
            try { await update(ref(window.firebaseDb), { ['ventReactOwners/' + pid + '/' + this.authUid]: k, ['ventCount/' + pid + '/' + k]: cur + 1 }); }
            catch (e) { /* already reacted from another phone */ }
        },

        async vtModDelReply(pid, rid) {
            if (!this.modCan('delVent') || !confirm('تحذف هذا الرد من الكل؟')) return;
            const { ref, update } = window.firebaseDbHelpers;
            try {
                const lg = await this._modLog('replyDel', { pid, rid });
                await update(ref(window.firebaseDb), { ['ventReplies/' + pid + '/' + rid]: null, [lg.path]: lg.val });
                this.showToast('انحذف الرد');
            } catch (e) { this.showToast('ما انحذف، صلاحيتك مطفية أو انقطع النت'); }
        },

        async vtMore(pid) {
            const v = this._vt;
            const { ref, update } = window.firebaseDbHelpers;
            if (v.mine.includes(pid)) {
                if (!confirm('تحذف فضفضتك؟')) return;
                try { await update(ref(window.firebaseDb), { ['vent/' + pid]: null, ['ventOwners/' + pid]: null }); v.mine = v.mine.filter((x) => x !== pid); this._vtSave('mine', v.mine); this.showToast('انحذفت'); } catch (e) { this.showToast('ما انحذفت'); }
                return;
            }
            if (this.modCan && this.modCan('delVent') && confirm('أنت مشرف. تحذف هاي الفضفضة وكل ردودها من الكل؟\n\n(إذا تريد تبلّغ بدل الحذف اضغط إلغاء)')) {
                try {
                    const lg = await this._modLog('ventDel', { pid });
                    await update(ref(window.firebaseDb), { ['vent/' + pid]: null, ['ventReplies/' + pid]: null, [lg.path]: lg.val });
                    this.showToast('انحذفت الفضفضة');
                } catch (e) { this.showToast('ما انحذفت، صلاحيتك مطفية أو انقطع النت'); }
                return;
            }
            if (!confirm('تبلّغ عن هاي الفضفضة؟ إذا وصلها 3 تبليغات تختفي، والإدارة تراجعها.')) return;
            const cur = ((v.count[pid] || {}).rep) || 0;
            try { await update(ref(window.firebaseDb), { ['ventReports/' + pid + '/' + this.authUid]: true, ['ventCount/' + pid + '/rep']: cur + 1 }); this.showToast('وصل تبليغك، شكراً'); } catch (e) { this.showToast('بلّغت عنها قبل'); }
        },

        // ---------- replies ----------
        vtOpen2(pid) {
            const v = this._vt;
            if (!v.posts.some((p) => p.id === pid)) return;
            v.open = pid;
            document.querySelector('.vt-sheet')?.remove();
            const el = document.createElement('div');
            el.className = 'vt-sheet';
            el.innerHTML = '<div class="vt-sp" id="vtSp"></div>';
            el.addEventListener('click', (e) => { if (e.target === el) this.vtSheetClose(); });
            document.body.appendChild(el);
            requestAnimationFrame(() => el.classList.add('in'));
            this._vtSheetRender();
            if (!v.replies[pid]) {
                const { ref, onValue } = window.firebaseDbHelpers;
                v.replies[pid] = { list: [], off: onValue(ref(window.firebaseDb, 'ventReplies/' + pid), (snap) => {
                    const val = snap.val() || {};
                    v.replies[pid].list = Object.keys(val).map((id) => Object.assign({ id }, val[id])).sort((a, b) => (a.at || 0) - (b.at || 0));
                    v.replies[pid].loaded = true;
                    if (v.open === pid) this._vtSheetRender();
                }, () => {}) };
            }
        },
        vtSheetClose() {
            const el = document.querySelector('.vt-sheet');
            if (el) { el.classList.remove('in'); setTimeout(() => el.remove(), 260); }
            if (this._vt) this._vt.open = '';
        },

        _vtSheetRender() {
            const v = this._vt, box = document.getElementById('vtSp'), p = v.posts.find((x) => x.id === v.open);
            if (!box || !p) return;
            const md = MOODS[p.m], R = v.replies[p.id] || { list: [] }, mine = v.mine.includes(p.id);
            const groups = {};
            R.list.forEach((r) => { if (r.k && preset(r.k)) groups[r.k] = (groups[r.k] || 0) + 1; });
            const written = R.list.filter((r) => r.tx);
            const draft = (document.getElementById('vtRtx') || {}).value || '';
            const scroll = box.scrollTop;
            box.innerHTML = `
                <div class="vt-sp-post" style="--a:${md[2]};--b:${md[3]}">
                    <button class="vt-sp-x" onclick="app.vtSheetClose()" aria-label="سد"><i data-lucide="chevron-down"></i></button>
                    <span class="vt-mood light"><i data-lucide="${md[1]}"></i>طالب ${md[0]}</span><small>${ago(p.at)}</small>
                    <p dir="auto">${esc(p.tx)}</p>
                </div>
                <div class="vt-sp-b">
                    <h3>${R.list.length ? 'الطلاب ويا صاحب الفضفضة' : 'كون أول واحد يدعمه'}</h3>
                    ${Object.keys(groups).length ? `<div class="vt-bubbles">${Object.keys(groups).sort((a, b) => groups[b] - groups[a]).map((k, i) => {
                        const pr = preset(k);
                        return `<div class="vt-bub" style="--c:${pr.g[2]};--i:${i}"><i data-lucide="${pr.g[1]}"></i><span>${esc(pr.t)}</span>${groups[k] > 1 ? `<b>×${groups[k]}</b>` : ''}</div>`;
                    }).join('')}</div>` : ''}
                    ${written.length ? `<div class="vt-written">${written.map((r, i) => `<div class="vt-w" style="--i:${Math.min(i, 10)}"><i data-lucide="quote"></i><p dir="auto">${esc(r.tx)}</p><small>${ago(r.at)}</small>${this.modCan && this.modCan('delVent') ? `<button class="vt-mdel" onclick="app.vtModDelReply('${esc(p.id)}','${esc(r.id)}')" aria-label="حذف الرد (مشرف)"><i data-lucide="trash-2"></i></button>` : ''}</div>`).join('')}</div>` : ''}
                    ${!R.loaded ? '<div class="vt-load small"><i></i></div>' : ''}
                    ${mine ? '<p class="vt-mine-note">هاي فضفضتك. الردود توصلك هنا، ومحد يعرف منو انت.</p>' : v.banned ? '' : `
                    <h3>اختار كلمة تدعمه بيها</h3>
                    ${Object.keys(KIND).map((g) => `<div class="vt-kind"><span style="--c:${KIND[g][2]}"><i data-lucide="${KIND[g][1]}"></i>${KIND[g][0]}</span>
                        <div>${KIND[g][3].map((t, i) => `<button style="--c:${KIND[g][2]}" onclick="app.vtReply('${g}${i + 1}')">${esc(t)}</button>`).join('')}</div></div>`).join('')}
                    <h3>أو اكتب كلمة طيبة</h3>
                    <div class="vt-rw"><textarea id="vtRtx" maxlength="200" rows="2" placeholder="كلمة حلوة تفرق وياه...">${esc(draft)}</textarea><button onclick="app.vtReply()" aria-label="إرسال"><i data-lucide="send"></i></button></div>`}
                </div>`;
            lucide.createIcons();
            box.scrollTop = scroll;
        },

        async vtReply(k) {
            const v = this._vt, pid = v.open;
            if (!pid) return;
            const body = { at: TS() };
            if (k) body.k = k;
            else {
                const tx = String((document.getElementById('vtRtx') || {}).value || '').trim();
                if (tx.length < 2) { this.showToast('اكتب كلمة'); return; }
                const r = window.ventCheck ? window.ventCheck(tx) : { kind: null, words: [] };
                if (r.kind) { this._vtAlert(tx, r, 'reply'); this._vtWarn(); return; }
                body.tx = tx;
            }
            const rid = newKey(), { ref, update } = window.firebaseDbHelpers, cur = ((v.count[pid] || {}).rc) || 0;
            try {
                await update(ref(window.firebaseDb), { ['ventReplies/' + pid + '/' + rid]: body, ['ventReplyOwners/' + pid + '/' + rid]: this.authUid, ['ventLastR/' + this.authUid]: TS(), ['ventCount/' + pid + '/rc']: cur + 1 });
                const t = document.getElementById('vtRtx'); if (t) t.value = '';
                this.showToast('وصلت كلمتك، الله يجزيك خير');
            } catch (e) {
                this.showToast(String(e && e.message || e).includes('ermission') ? 'على كيفك، انتظر ثواني بين كل رد' : 'ما انرسل، تأكد من النت');
            }
        },
    });
})();
