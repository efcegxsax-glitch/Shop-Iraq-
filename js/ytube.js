// تيوب المدرسين: the teachers' YouTube videos inside the app, with nothing around the video to pull attention away
// (no comments, no suggested videos, no shorts). The admin panel picks the channels (ytChannels/{key} = {id, n, h, a, s, o}:
// channel id, name, @handle, picture, subject, order). The tutor Worker reads each channel's public feed (mode "ytfeed").
// The video plays in YouTube's own player, so its quality menu is YouTube's. Watching earns points with the same rules and
// daily limit as the study rooms (ytroom.js: app._yrLedger / app._yrPay / app.YR_EARN). Loaded by app._need('ytube').
(function () {
    const K_HIST = 'isp_tube_hist', K_FAV = 'isp_tube_fav', K_FEED = 'isp_tube_feed', K_MARK = 'isp_tube_marks', FEED_TTL = 10 * 60000, PAGE = 20;
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const H = () => window.firebaseDbHelpers;
    const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
    const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const thumb = (v, q) => 'https://i.ytimg.com/vi/' + v + '/' + (q || 'mqdefault') + '.jpg';
    const views = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' مليون' : n >= 1000 ? Math.round(n / 1000) + ' ألف' : String(n || 0)) + ' مشاهدة';
    const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const TAB_ID = Math.random().toString(36).slice(2);
    const $ = (id) => document.getElementById(id);
    let ALL = {}, CH = [], FEED = [], S = { subj: 'all', tab: 'all', teacher: '', shown: PAGE }, P = null, tickT = 0, un = null, err = '', netBusy = false, apiP = null;

    // ---------- YouTube's player script, loaded once ----------
    function ytApi() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        if (apiP) return apiP;
        apiP = new Promise((resolve, reject) => {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') try { prev(); } catch (e) {} resolve(); };
            const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
            s.onerror = () => { apiP = null; reject(new Error('yt api')); };
            document.head.appendChild(s);
        });
        return apiP;
    }

    // ---------- data: channels from the database, videos from the Worker ----------
    const chById = (id) => CH.find((c) => c.id === id) || null;
    const pushOn = () => { try { return localStorage.getItem('isp_tube_push') !== '0'; } catch (e) { return true; } };
    const favs = () => new Set(load(K_FAV, []));
    function listenChannels() {
        if (un || !window.firebaseDb) return;
        const { ref, onValue } = H();
        un = onValue(ref(window.firebaseDb, 'ytChannels'), (snap) => {
            const v = snap.exists() ? snap.val() : {};
            CH = Object.keys(v).map((k) => ({ k, ...v[k] })).filter((c) => c && /^UC[A-Za-z0-9_-]{22}$/.test(String(c.id || ''))).sort((a, b) => (Number(a.o) || 0) - (Number(b.o) || 0));
            paint(); fetchFeed(false);
        }, () => { err = 'ما كدرت أجيب قائمة الأساتذة'; paint(); });
    }
    async function fetchFeed(force) {
        const ids = CH.map((c) => c.id), sig = ids.join(',');
        if (!ids.length) { FEED = []; paint(); return; }
        const cache = load(K_FEED, null);
        if (cache && cache.sig === sig && Array.isArray(cache.v)) {
            if (!FEED.length) { FEED = cache.v; paint(); }
            if (!force && Date.now() - (cache.at || 0) < FEED_TTL) return;
        }
        if (netBusy) return;
        netBusy = true; err = '';
        try {
            const cu = String((app.siteConfig && app.siteConfig.tutorUrl) || '').trim().replace(/\/+$/, '');
            const base = /^https:\/\/[^\s]+$/.test(cu) ? cu : 'https://isp-tutor.efceg-xsax.workers.dev', user = window.firebaseAuth && window.firebaseAuth.currentUser;
            if (!base || !user) throw new Error('signin');
            const tok = await user.getIdToken();
            const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ mode: 'ytfeed', ids }) });
            if (!r.ok) throw new Error('http ' + r.status);
            const j = await r.json();
            FEED = (j.videos || []).filter((x) => x && /^[A-Za-z0-9_-]{11}$/.test(x.v));
            save(K_FEED, { sig, at: Date.now(), v: FEED });
        } catch (e) {
            if (!FEED.length) err = app.authUid ? 'ما كدرت أجيب الفيديوهات، تأكد من النت وجرّب مرة ثانية' : 'سجّل دخولك حتى تشوف فيديوهات المدرسين';
        }
        netBusy = false; paint();
    }

    // a teacher's whole channel (old videos too), 100 per page, through the Worker
    async function workerCall(body) {
        const cu = String((app.siteConfig && app.siteConfig.tutorUrl) || '').trim().replace(/\/+$/, '');
        const base = /^https:\/\/[^\s]+$/.test(cu) ? cu : 'https://isp-tutor.efceg-xsax.workers.dev', user = window.firebaseAuth && window.firebaseAuth.currentUser;
        if (!user) throw new Error('signin');
        const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await user.getIdToken()) }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
    }
    async function loadAll(id, more) {
        const a = ALL[id] = ALL[id] || { list: [], next: '', busy: false, fail: false, done: false, pages: 0 };
        if (a.busy || (a.done && !a.fail) || (a.pages && !a.next && !a.fail)) return;
        if (more && !a.next) return;
        a.busy = true; a.fail = false; paint();
        try {
            const j = await workerCall({ mode: 'ytchan', id, cont: a.pages ? a.next : '' });
            const seen = new Set(a.list.map((x) => x.v));
            (j.videos || []).forEach((x) => { if (x && /^[A-Za-z0-9_-]{11}$/.test(x.v) && !seen.has(x.v)) a.list.push({ v: x.v, t: x.t, c: id, wt: x.w, at: x.a }); });
            a.next = j.next || ''; a.pages++; if (!a.next) a.done = true;
        } catch (e) { a.fail = true; }
        a.busy = false; paint();
        // searching: keep reading older pages until something matches (a few pages at most)
        const q = String(($('tuSearch') || {}).value || '').trim();
        if (q && S.teacher === id && a.next && a.pages < 8 && !a.fail && !visible().length) loadAll(id, true);
    }
    // ---------- the page ----------
    function subjects() { const s = []; CH.forEach((c) => { const x = String(c.s || '').trim(); if (x && s.indexOf(x) === -1) s.push(x); }); return s; }
    function visible() {
        const f = favs(), q = String(($('tuSearch') || {}).value || '').trim();
        const a = S.teacher && ALL[S.teacher] && ALL[S.teacher].list.length ? ALL[S.teacher] : null;
        // the teacher's full list, with the newest ones' numbers taken from the feed
        const src = a ? a.list.map((x) => { const n = FEED.find((f) => f.v === x.v); return n ? Object.assign({}, x, n) : x; }) : FEED;
        return src.filter((x) => {
            const c = chById(x.c); if (!c) return false;
            if (S.teacher && c.id !== S.teacher) return false;
            if (S.tab === 'mine' && !f.has(c.id)) return false;
            if (S.subj !== 'all' && String(c.s || '') !== S.subj) return false;
            if (q && (x.t + ' ' + c.n).indexOf(q) === -1) return false;
            return true;
        });
    }
    function card(x, big) {
        const c = chById(x.c) || {};
        const av = c.a && isSafeImageUrl(c.a) ? `<img src="${esc(c.a)}" alt="">` : `<span>${esc(String(c.n || 'أ').trim().charAt(0))}</span>`;
        return `<button class="tu-card${big ? ' big' : ''}" onclick="app.tuPlay('${x.v}')">
            <span class="tu-th"><img src="${thumb(x.v, big ? 'hqdefault' : 'mqdefault')}" alt="" loading="lazy"></span>
            <span class="tu-meta"><span class="tu-av">${av}</span><span class="tu-tx"><b>${esc(x.t)}</b><small>${esc(c.n || '')} . ${x.w ? views(x.w) + ' . ' : x.wt ? esc(x.wt) + ' . ' : ''}${x.p ? timeAgo(x.p) : x.at ? esc(x.at) : ''}</small></span></span></button>`;
    }
    function paint() {
        const box = $('tuContent'); if (!box) return;
        const f = favs(), subs = subjects(), list = visible(), hist = load(K_HIST, []).filter((h) => h && h.v).slice(0, 8);
        const chips = ['all'].concat(subs).map((s) => `<button class="tu-chip${S.subj === s ? ' on' : ''}" onclick="app.tuSubj(${jsArg(s)})">${s === 'all' ? 'الكل' : esc(s)}</button>`).join('');
        const teachers = CH.map((c) => {
            const av = c.a && isSafeImageUrl(c.a) ? `<img src="${esc(c.a)}" alt="">` : `<span>${esc(String(c.n || 'أ').trim().charAt(0))}</span>`;
            return `<button class="tu-tch${S.teacher === c.id ? ' on' : ''}${f.has(c.id) ? ' fav' : ''}" onclick="app.tuTeacher('${c.id}')"><i>${av}</i><small>${esc(c.n)}</small></button>`;
        }).join('');
        let body;
        if (!CH.length) body = '<div class="tu-empty"><i data-lucide="graduation-cap"></i><b>ما انضاف أي أستاذ بعد</b><p>الإدارة تضيف قنوات المدرسين من لوحة التحكم، وتطلع هنا.</p></div>';
        else if (!FEED.length && !err) body = '<div class="tu-skel">' + '<i></i>'.repeat(3) + '</div>';
        else if (err && !FEED.length) body = `<div class="tu-empty"><i data-lucide="wifi-off"></i><b>${esc(err)}</b><button class="tu-btn" onclick="app.tuRefresh()">إعادة المحاولة</button></div>`;
        else if (S.tab === 'mine' && !f.size) body = '<div class="tu-empty"><i data-lucide="users"></i><b>لم تحدد أي أستاذ بعد</b><p>اختار أساتذتك وتطلع محاضراتهم هنا بس.</p><button class="tu-btn" onclick="app.tuPick()">تحديد أساتذتي</button></div>';
        else if (!list.length) body = '<div class="tu-empty"><i data-lucide="search-x"></i><b>ما لكيت فيديوهات</b></div>';
        else body = list.slice(0, S.shown).map((x, i) => card(x, i % 3 === 0)).join('') + (list.length > S.shown || (S.teacher && ALL[S.teacher] && (ALL[S.teacher].next || ALL[S.teacher].busy)) ? `<button class="tu-more" onclick="app.tuMore()">${S.teacher && ALL[S.teacher] && ALL[S.teacher].busy ? 'دا يحمّل...' : 'عرض المزيد'}</button>` : '');
        const recent = !S.teacher && S.tab === 'all' && S.subj === 'all' && hist.length ? `<div class="tu-h"><span>آخر ما شاهدته</span><button onclick="app.tuClearHist()">مسح</button></div>
            <div class="tu-rec">${hist.map((h) => `<button class="tu-rc" onclick="app.tuPlay('${h.v}')"><span class="tu-th"><img src="${thumb(h.v)}" alt="" loading="lazy"><i style="width:${Math.min(100, Math.round((h.p || 0) / Math.max(1, h.d || 1) * 100))}%"></i></span><small>${esc(h.t)}</small></button>`).join('')}</div>` : '';
        box.innerHTML = `${CH.length ? `<div class="tu-chips">${chips}</div>
            <div class="tu-h"><span>الأساتذة</span><button onclick="app.tuPick()"><i data-lucide="sliders-horizontal"></i>تعديل أساتذتي</button></div>
            <div class="tu-tchs">${teachers}</div>
            <div class="tu-tabs"><button class="${S.tab === 'all' ? 'on' : ''}" onclick="app.tuTab('all')">الكل</button><button class="${S.tab === 'mine' ? 'on' : ''}" onclick="app.tuTab('mine')">أساتذتي</button></div>` : ''}
            ${recent}<div class="tu-feed">${body}</div>`;
        try { lucide.createIcons(); } catch (e) {}
    }

    // ---------- the player: just the video, how far you are, and what comes next ----------
    function hist(v, patch) {
        const L = load(K_HIST, []).filter((h) => h && h.v);
        let h = L.find((x) => x.v === v);
        if (!h) { h = { v }; L.unshift(h); } else { L.splice(L.indexOf(h), 1); L.unshift(h); }
        Object.assign(h, patch, { at: Date.now() });
        save(K_HIST, L.slice(0, 20));
    }
    function openPlayer(v) {
        const item = FEED.find((x) => x.v === v) || load(K_HIST, []).find((h) => h && h.v === v) || { v, t: 'فيديو' };
        const c = chById(item.c) || {};
        const h = load(K_HIST, []).find((x) => x && x.v === v);
        const start = h && h.d && h.p && h.p < h.d * 0.95 ? Math.floor(h.p) : 0;
        closePlayer(true);
        P = { v, t: item.t || (h && h.t) || 'فيديو', c: c.id || item.c || '', start, pend: 0, lockOk: true, ready: false };
        const next = FEED.filter((x) => x.v !== v && (!c.id || x.c === c.id)).slice(0, 8);
        const w = document.createElement('div'); w.id = 'tuPlayer'; w.className = 'tu-pl';
        w.innerHTML = `<div class="tu-stage" id="tuStage"><div id="tuYt"></div>
                <button class="tu-x" onclick="app.tuBack()" aria-label="رجوع"><i data-lucide="chevron-right"></i></button>
                <button class="tu-fs" onclick="app.tuFull()" aria-label="ملء الشاشة"><i data-lucide="maximize"></i></button></div>
            <div class="tu-body">
                <h2>${esc(P.t)}</h2>
                <div class="tu-by">${c.a && isSafeImageUrl(c.a) ? `<img src="${esc(c.a)}" alt="">` : ''}<b>${esc(c.n || '')}</b></div>
                ${item.w ? `<div class="tu-views"><i data-lucide="eye"></i>${views(item.w)}</div>` : ''}
                <div class="tu-acts">
                    <button onclick="app.tuMark('q')"><i data-lucide="hand"></i>ما فهمت هنا</button>
                    <button onclick="app.tuMark('i')"><i data-lucide="star"></i>مهم</button>
                    <button id="tuMkBtn" onclick="app.tuMarksToggle()"><i data-lucide="bookmark"></i>علاماتي<em id="tuMkN"></em></button>
                    <button onclick="app.tuWithFriend()"><i data-lucide="users"></i>ويا صديق</button>
                </div>
                <div class="tu-marks hidden" id="tuMarks"></div>
                <div class="tu-earn" id="tuEarn"></div>
                ${next.length ? '<div class="tu-h"><span>المزيد من نفس الأستاذ</span></div><div class="tu-feed">' + next.map((x) => card(x, false)).join('') + '</div>' : ''}
            </div>`;
        document.body.appendChild(w);
        try { lucide.createIcons(); } catch (e) {}
        hist(v, { t: P.t, c: P.c });
        paintMarks();
        const mine = P;
        app._yrLedger && app._yrLedger();
        ytApi().then(() => {
            if (P !== mine) return;
            mine.pl = new YT.Player('tuYt', {
                videoId: v, width: '100%', height: '100%',
                playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1, iv_load_policy: 3, fs: 0, start: start },
                events: {
                    onReady: () => { mine.ready = true; try { mine.pl.playVideo(); } catch (e) {} },
                    onStateChange: (e) => { if (e && e.data === 0) ended(); },
                    onError: (e) => { const code = e && e.data; app.showToast(code === 101 || code === 150 || code === 153 ? 'صاحب الفيديو مانع تشغيله خارج يوتيوب' : 'ما كدرت أشغّل الفيديو'); },
                },
            });
        }).catch(() => app.showToast('ما انحمّل مشغّل يوتيوب، تأكد من النت'));
        clearInterval(tickT); tickT = setInterval(tick, 1000);
        paintEarn();
    }
    // ---------- personal marks: "didn't understand" / "important", kept per video and hidden until asked for ----------
    function marksOf(v) { return (load(K_MARK, {})[v] || []).slice().sort((a, b) => a.s - b.s); }
    function paintMarks() {
        const box = $('tuMarks'), n = $('tuMkN'); if (!P) return;
        const L = marksOf(P.v);
        if (n) n.textContent = L.length ? String(L.length) : '';
        if (!box) return;
        box.innerHTML = L.length ? L.map((m, i) => `<div class="tu-mk ${m.k}"><button class="go" onclick="app.tuMarkGo(${m.s})"><i data-lucide="${m.k === 'i' ? 'star' : 'hand'}"></i><b>${clock(m.s)}</b><span>${m.k === 'i' ? 'مهم' : 'ما فهمت'}</span></button><button class="rm" onclick="app.tuMarkDel(${i})" aria-label="حذف"><i data-lucide="x"></i></button></div>`).join('')
            : '<p class="tu-mk-e">ما عندك علامات. اضغط "ما فهمت هنا" أو "مهم" وكت ما تحتاج، ويرجعلك الوقت نفسه.</p>';
        try { lucide.createIcons(); } catch (e) {}
    }
    function closePlayer(silent) {
        clearInterval(tickT); tickT = 0;
        const p = P; P = null;
        if (p && p.pl) {
            try { const t = p.pl.getCurrentTime() || 0, d = p.pl.getDuration() || p.d || 0; if (d) hist(p.v, { p: t, d }); } catch (e) {}
            try { p.pl.destroy(); } catch (e) {}
        }
        try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
        try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {}
        $('tuPlayer')?.remove();
        if (!silent && $('tuContent')) paint();
    }
    function ended() {
        const p = P; if (!p || p.donePaid) return;
        const L = app._yrLedger && app._yrLedger(), E = app.YR_EARN;
        if (!L || !E || !p.d) return;
        p.donePaid = true;
        hist(p.v, { p: 0, d: p.d });
        if ((L.vids[p.v] || 0) >= p.d * 0.6 && !L.done['t/' + p.v] && !why({ s: 0, d: p.d }, true)) {
            L.done['t/' + p.v] = 1; app._yrPay(E.DONE_PTS, 'خلصت الفيديو');
        }
    }

    // ---------- points (same rules as the study rooms) ----------
    function why(st, skipPlay) {
        const L = app._yrLedger(), E = app.YR_EARN, now = Date.now();
        if (!app.authUid) return 'سجّل دخولك حتى تنحسب نقاط';
        if (L.earned >= E.DAY_CAP) return 'وصلت حد نقاط اليوم (' + E.DAY_CAP + ')';
        if (L.frozen > now) return 'ما جاوبت التحقق، النقاط ترجع بعد شوية';
        if (L.fails >= 2) return 'النقاط واكفة اليوم لأن ما جاوبت التحقق مرتين';
        if (skipPlay) return '';
        if (!st || st.s !== 1) return 'شغّل الفيديو حتى تنحسب نقاط';
        if (document.hidden) return 'رجع للتطبيق حتى تنحسب نقاط';
        if (st.mute) return 'افتح الصوت حتى تنحسب نقاط';
        if (P.check) return 'جاوب التحقق';
        if (!P.lockOk) return 'أكو مشاهدة ثانية شغالة بحسابك';
        if (st.d && (L.vids[P.v] || 0) >= st.d) return 'هذا الفيديو خلصت نقاطه اليوم';
        if (P.jumped) return 'قدّمت الفيديو، النقاط تنحسب على المشاهدة بس';
        return '';
    }
    function tick() {
        const p = P; if (!p || !p.pl || !p.ready || !p.pl.getPlayerState || !app.YR_EARN) return;
        let st;
        try { st = { s: p.pl.getPlayerState(), t: p.pl.getCurrentTime() || 0, d: p.pl.getDuration() || 0, mute: p.pl.isMuted() || p.pl.getVolume() === 0, rate: p.pl.getPlaybackRate() || 1 }; } catch (e) { return; }
        if (st.d) p.d = st.d;
        const L = app._yrLedger(), E = app.YR_EARN, now = Date.now();
        let lock = null; try { lock = JSON.parse(localStorage.getItem('isp_yr_lock') || 'null'); } catch (e) {}
        p.lockOk = !lock || lock.id === TAB_ID || now - lock.at > 4000;
        if (p.lockOk && st.s === 1) try { localStorage.setItem('isp_yr_lock', JSON.stringify({ id: TAB_ID, at: now })); } catch (e) {}
        const dt = p.lastAt ? (now - p.lastAt) / 1000 : 1, rate = st.rate || 1;
        p.jumped = !!(p.lastPos != null && st.s === 1 && st.t - p.lastPos > rate * dt + 2);
        p.lastPos = st.t; p.lastAt = now;
        if (now - (p.savedAt || 0) > 5000 && st.d) { p.savedAt = now; hist(p.v, { p: st.t, d: st.d }); }
        const w = why(st); p.why = w;
        if (!w) {
            const sec = Math.min(rate, 2);
            L.vids[p.v] = (L.vids[p.v] || 0) + sec; L.pend = (L.pend || 0) + sec;
            p.since = (p.since || 0) + 1;
            if (!p.nextCheck) p.nextCheck = E.CHECK_MIN + Math.random() * (E.CHECK_MAX - E.CHECK_MIN);
            if (p.since >= p.nextCheck) check();
            if (L.pend >= E.EVERY) { L.pend -= E.EVERY; app._yrPay(E.PER, 'مشاهدة 5 دقايق'); }
            if (now - (p.ledSaved || 0) > 5000) { p.ledSaved = now; app._yrLedgerSave(); }
        }
        paintEarn();
    }
    function paintEarn() {
        const box = $('tuEarn'), L = app._yrL, E = app.YR_EARN; if (!box || !P || !L || !E) return;
        const pct = Math.min(100, (L.pend || 0) / E.EVERY * 100), left = Math.max(1, Math.ceil((E.EVERY - (L.pend || 0)) / 60));
        if (!box.firstChild) box.innerHTML = '<span class="tu-ei"><i data-lucide="coins"></i></span><div><b></b><div class="tu-pg"><i></i></div></div><em dir="ltr"></em>';
        if (!box.dataset.ic) { box.dataset.ic = 1; try { lucide.createIcons(); } catch (e) {} }
        box.classList.toggle('off', !!P.why);
        box.querySelector('b').textContent = P.why || ('تنحسب نقاط . باقي ' + left + ' د للـ +' + E.PER);
        box.querySelector('.tu-pg i').style.width = pct + '%';
        box.querySelector('em').textContent = '+' + L.earned + '/' + E.DAY_CAP;
    }
    function check() {
        const p = P, stage = $('tuStage'); if (!p || p.check || !stage) return;
        const want = 1 + Math.floor(Math.random() * 9), opts = [want];
        while (opts.length < 4) { const n = 1 + Math.floor(Math.random() * 9); if (opts.indexOf(n) === -1) opts.push(n); }
        opts.sort(() => Math.random() - 0.5);
        const el = document.createElement('div'); el.id = 'tuCheck'; el.className = 'yr-check';
        el.innerHTML = `<div class="yr-check-c"><b>تأكيد إنك تشاهد</b><p>دوس على الرقم <strong>${want}</strong></p><div class="yr-check-o">${opts.map((n) => `<button onclick="app.tuCheckAns(${n})">${n}</button>`).join('')}</div></div>`;
        stage.appendChild(el);
        p.check = { want }; p.checkTimer = setTimeout(() => app.tuCheckAns(-1), 30000);
    }

    Object.assign(app, {
        tuOpen() {
            S = { subj: 'all', tab: 'all', teacher: '', shown: PAGE };
            const q = $('tuSearch'); if (q) q.value = '';
            $('tuSearchBar')?.classList.add('hidden');
            app._need('ytroom').then(() => { listenChannels(); paint(); }).catch(() => { err = 'ما انحمّلت الصفحة، حاول مرة ثانية'; paint(); });
            paint();
            if (CH.length) fetchFeed(false);
        },
        tuClose() { closePlayer(true); },
        tuSubj(s) { S.subj = s; S.shown = PAGE; paint(); },
        tuTab(t) { S.tab = t; S.shown = PAGE; paint(); },
        tuTeacher(id) { S.teacher = S.teacher === id ? '' : id; S.shown = PAGE; paint(); if (S.teacher) loadAll(S.teacher); },
        tuMore() {
            S.shown += PAGE;
            const a = S.teacher && ALL[S.teacher];
            if (a && a.next && S.shown > visible().length - 5) loadAll(S.teacher, true); else paint();
        },
        tuRefresh() { err = ''; paint(); fetchFeed(true); },
        tuSearchToggle() {
            const b = $('tuSearchBar'); if (!b) return;
            b.classList.toggle('hidden');
            if (!b.classList.contains('hidden')) $('tuSearch')?.focus(); else { $('tuSearch').value = ''; paint(); }
        },
        tuSearchInput() {
            S.shown = PAGE; paint();
            const a = S.teacher && ALL[S.teacher];
            if (a && a.next && !a.busy && !visible().length) loadAll(S.teacher, true);
        },
        tuClearHist() { save(K_HIST, []); paint(); },
        tuPlay(v) { if (!app.authUid) { app.showToast('سجّل دخولك حتى تشاهد وتحصل نقاط'); app.goToAuth('login'); return; } openPlayer(v); },
        tuBack() { closePlayer(false); },
        tuFull() {
            const st = $('tuStage'); if (!st) return;
            try {
                if (document.fullscreenElement) { document.exitFullscreen(); return; }
                const go = st.requestFullscreen ? st.requestFullscreen() : (st.webkitRequestFullscreen && st.webkitRequestFullscreen());
                Promise.resolve(go).then(() => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
            } catch (e) {}
        },
        tuCheckAns(n) {
            const p = P, L = app._yrLedger(), E = app.YR_EARN; if (!p || !p.check) return;
            clearTimeout(p.checkTimer);
            const ok = n === p.check.want;
            p.check = null; $('tuCheck')?.remove(); p.since = 0; p.nextCheck = E.CHECK_MIN + Math.random() * (E.CHECK_MAX - E.CHECK_MIN);
            if (ok) { app.showToast('تمام، كمّل'); return; }
            L.pend = 0; L.fails = (L.fails || 0) + 1; L.frozen = Date.now() + E.FREEZE; app._yrLedgerSave();
            app.showToast(L.fails >= 2 ? 'ما جاوبت التحقق مرتين، النقاط واكفة لباجر' : 'ما جاوبت التحقق، النقاط واكفة 20 دقيقة');
        },
        // which teachers are "mine" (kept on this phone)
        tuMark(k) {
            if (!P || !P.pl || !P.ready) { app.showToast('شغّل الفيديو أول'); return; }
            let t = 0; try { t = Math.floor(P.pl.getCurrentTime() || 0); } catch (e) {}
            const all = load(K_MARK, {}), L = all[P.v] || [];
            if (!L.some((m) => m.k === k && Math.abs(m.s - t) < 4)) L.push({ k, s: t, at: Date.now() });
            all[P.v] = L.slice(-60); save(K_MARK, all);
            paintMarks();
            app.showToast((k === 'i' ? 'علّمت مهم عند ' : 'علّمت ما فهمت عند ') + clock(t));
        },
        tuMarksToggle() { const b = $('tuMarks'); if (!b) return; b.classList.toggle('hidden'); $('tuMkBtn')?.classList.toggle('on', !b.classList.contains('hidden')); },
        tuMarkGo(s) { try { if (P && P.pl) { P.pl.seekTo(s, true); P.pl.playVideo(); } } catch (e) {} },
        tuMarkDel(i) {
            if (!P) return;
            const all = load(K_MARK, {}), L = marksOf(P.v); L.splice(i, 1); all[P.v] = L; save(K_MARK, all); paintMarks();
        },
        tuWithFriend() {
            if (!P) return;
            if (!app.authUid) { app.showToast('سجّل دخولك أول'); return; }
            const v = P.v, t = P.t;
            closePlayer(true);
            app.yrWatchWith ? app.yrWatchWith(v, t) : app._withPart('ytroom', () => typeof app.yrWatchWith === 'function', 'ytRoomView', () => app.yrWatchWith(v, t));
        },
        tuPick() {
            document.getElementById('tuSheet')?.remove();
            const f = favs();
            const w = document.createElement('div'); w.id = 'tuSheet'; w.className = 'tu-sheetw';
            w.innerHTML = `<div class="tu-sbd" onclick="app.tuPickClose()"></div><div class="tu-sheet"><div class="tu-grab"></div><div class="tu-sh"><b>أساتذتي</b><button onclick="app.tuPickClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div>
                <p>اختار الأساتذة اللي تريد تتابعهم، وتطلع محاضراتهم بتبويب "أساتذتي".</p>
                <button class="tu-pushsw ${pushOn() ? 'on' : ''}" onclick="app.tuPushToggle(this)"><i data-lucide="bell"></i><span><b>إشعار عند نزول محاضرة جديدة</b><small>يوصلك اسم المحاضرة أول ما ينزلها الأستاذ</small></span><em><i data-lucide="check"></i></em></button>
                <div class="tu-pick">${CH.map((c) => { const av = c.a && isSafeImageUrl(c.a) ? `<img src="${esc(c.a)}" alt="">` : `<span>${esc(String(c.n || 'أ').trim().charAt(0))}</span>`; return `<button class="${f.has(c.id) ? 'on' : ''}" onclick="app.tuFavToggle('${c.id}', this)"><i>${av}</i><span><b>${esc(c.n)}</b><small>${esc(c.s || '')}</small></span><em><i data-lucide="check"></i></em></button>`; }).join('')}</div></div>`;
            document.body.appendChild(w); try { lucide.createIcons(); } catch (e) {}
            requestAnimationFrame(() => w.classList.add('on'));
        },
        tuPushToggle(btn) {
            const on = !pushOn();
            try { localStorage.setItem('isp_tube_push', on ? '1' : '0'); } catch (e) {}
            app._tubeTag(); btn && btn.classList.toggle('on', on);
        },
        tuFavToggle(id, btn) { const f = favs(); if (f.has(id)) f.delete(id); else f.add(id); save(K_FAV, Array.from(f)); btn && btn.classList.toggle('on', f.has(id)); paint(); },
        tuPickClose() { const w = document.getElementById('tuSheet'); if (!w) return; w.classList.remove('on'); setTimeout(() => w.remove(), 250); },
    });
})();
