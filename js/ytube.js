// تيوب المدرسين: the teachers' YouTube videos inside the app, with nothing around the video to pull attention away
// (no comments, no suggested videos, no shorts). The admin panel picks the channels (ytChannels/{key} = {id, n, h, a, s, o}:
// channel id, name, @handle, picture, subject, order). The tutor Worker reads each channel's public feed (mode "ytfeed").
// The video plays in YouTube's own player, so its quality menu is YouTube's. Watching earns points with the same rules and
// daily limit as the study rooms (ytroom.js: app._yrLedger / app._yrPay / app.YR_EARN). Loaded by app._need('ytube').
(function () {
    const K_HIST = 'isp_tube_hist', K_FAV = 'isp_tube_fav', K_FEED = 'isp_tube_feed', FEED_TTL = 10 * 60000, PAGE = 20;
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const H = () => window.firebaseDbHelpers;
    const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
    const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const thumb = (v, q) => 'https://i.ytimg.com/vi/' + v + '/' + (q || 'mqdefault') + '.jpg';
    const views = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' مليون' : n >= 1000 ? Math.round(n / 1000) + ' ألف' : String(n || 0)) + ' مشاهدة';
    const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const TAB_ID = Math.random().toString(36).slice(2);
    const $ = (id) => document.getElementById(id);
    let CH = [], FEED = [], S = { subj: 'all', tab: 'all', teacher: '', shown: PAGE }, P = null, tickT = 0, un = null, err = '', netBusy = false, apiP = null;

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

    // ---------- the page ----------
    function subjects() { const s = []; CH.forEach((c) => { const x = String(c.s || '').trim(); if (x && s.indexOf(x) === -1) s.push(x); }); return s; }
    function visible() {
        const f = favs(), q = String(($('tuSearch') || {}).value || '').trim();
        return FEED.filter((x) => {
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
            <span class="tu-meta"><span class="tu-av">${av}</span><span class="tu-tx"><b>${esc(x.t)}</b><small>${esc(c.n || '')} . ${x.w ? views(x.w) + ' . ' : ''}${x.p ? timeAgo(x.p) : ''}</small></span></span></button>`;
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
        else body = list.slice(0, S.shown).map((x, i) => card(x, i % 3 === 0)).join('') + (list.length > S.shown ? '<button class="tu-more" onclick="app.tuMore()">عرض المزيد</button>' : '');
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
                <div class="tu-earn" id="tuEarn"></div>
                ${next.length ? '<div class="tu-h"><span>المزيد من نفس الأستاذ</span></div><div class="tu-feed">' + next.map((x) => card(x, false)).join('') + '</div>' : ''}
            </div>`;
        document.body.appendChild(w);
        try { lucide.createIcons(); } catch (e) {}
        hist(v, { t: P.t, c: P.c });
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
        tuTeacher(id) { S.teacher = S.teacher === id ? '' : id; S.shown = PAGE; paint(); },
        tuMore() { S.shown += PAGE; paint(); },
        tuRefresh() { err = ''; paint(); fetchFeed(true); },
        tuSearchToggle() {
            const b = $('tuSearchBar'); if (!b) return;
            b.classList.toggle('hidden');
            if (!b.classList.contains('hidden')) $('tuSearch')?.focus(); else { $('tuSearch').value = ''; paint(); }
        },
        tuSearchInput() { S.shown = PAGE; paint(); },
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
        tuPick() {
            document.getElementById('tuSheet')?.remove();
            const f = favs();
            const w = document.createElement('div'); w.id = 'tuSheet'; w.className = 'tu-sheetw';
            w.innerHTML = `<div class="tu-sbd" onclick="app.tuPickClose()"></div><div class="tu-sheet"><div class="tu-grab"></div><div class="tu-sh"><b>أساتذتي</b><button onclick="app.tuPickClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div>
                <p>اختار الأساتذة اللي تريد تتابعهم، وتطلع محاضراتهم بتبويب "أساتذتي".</p>
                <div class="tu-pick">${CH.map((c) => { const av = c.a && isSafeImageUrl(c.a) ? `<img src="${esc(c.a)}" alt="">` : `<span>${esc(String(c.n || 'أ').trim().charAt(0))}</span>`; return `<button class="${f.has(c.id) ? 'on' : ''}" onclick="app.tuFavToggle('${c.id}', this)"><i>${av}</i><span><b>${esc(c.n)}</b><small>${esc(c.s || '')}</small></span><em><i data-lucide="check"></i></em></button>`; }).join('')}</div></div>`;
            document.body.appendChild(w); try { lucide.createIcons(); } catch (e) {}
            requestAnimationFrame(() => w.classList.add('on'));
        },
        tuFavToggle(id, btn) { const f = favs(); if (f.has(id)) f.delete(id); else f.add(id); save(K_FAV, Array.from(f)); btn && btn.classList.toggle('on', f.has(id)); paint(); },
        tuPickClose() { const w = document.getElementById('tuSheet'); if (!w) return; w.classList.remove('on'); setTimeout(() => w.remove(), 250); },
    });
})();
