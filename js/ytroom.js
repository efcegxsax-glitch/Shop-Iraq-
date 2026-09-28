// YouTube study rooms (غرفة يوتيوب جماعية): loaded on demand by app._need('ytroom').
// A student opens a room, invites friends, and the host picks what plays; everyone's player
// follows the host's pick, but each one pauses, rewinds and resizes on their own. Everyone
// sees how far the others got, who finished, and "ما فهمت هنا" marks at a moment of the video.
//
// ytRooms/{rid}/meta     {host, title, at, cur}      cur = queue key playing for everyone
//              /queue/{k} {v, t, by, at}              v = YouTube id, t = title
//              /members/{uid} {n, a, j}
//              /kicked/{uid} true
//              /prog/{uid} {k, t, d, p, at}           where each one is (seconds, duration, playing)
//              /done/{uid}/{k} true
//              /chat/{id} {u, n, m, at, k?, s?}       k + s = a mark at a moment of a video
// ytInvites/{uid}/{rid} {from, fn, t, at}
(function () {
    const MAX_MEMBERS = 12, RECENT_KEY = 'isp_yr_recent', DONE_AT = 0.95, POINTS = 10;
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const H = () => window.firebaseDbHelpers;
    const R = (p) => H().ref(window.firebaseDb, p);
    const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60), x = s % 60; return m + ':' + String(x).padStart(2, '0'); };
    const newId = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
    const thumb = (v) => 'https://i.ytimg.com/vi/' + v + '/mqdefault.jpg';
    const SPEEDS = [1, 1.25, 1.5, 2];
    // quick reactions everyone sees float over their own video
    const REACTS = { ok: ['thumbs-up', 'فهمت', '#16A34A'], imp: ['star', 'مهم', '#F59E0B'], hard: ['circle-help', 'صعب', '#E11D48'] };
    const avatar = (a, n) => a && isSafeImageUrl(a) ? `<img src="${esc(a)}" alt="">` : `<span>${esc(String(n || 'ط').trim().charAt(0))}</span>`;

    // The YouTube player API, loaded once.
    let apiP = null;
    function ytApi() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        if (apiP) return apiP;
        apiP = new Promise((resolve, reject) => {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') try { prev(); } catch (e) {} resolve(); };
            const s = document.createElement('script');
            s.src = 'https://www.youtube.com/iframe_api';
            s.onerror = () => { apiP = null; reject(new Error('yt api')); };
            document.head.appendChild(s);
        });
        return apiP;
    }

    Object.assign(app, {
        // ---------- home: new room, invites, recent rooms ----------
        yrHome() {
            this._yrCloseRoom(true);
            const box = document.getElementById('yrContent');
            if (!box) return;
            const inv = this._yrInvites || [], recent = this._yrRecent();
            box.innerHTML = `
                <div class="yr-hero">
                    <div class="yr-hero-ic"><i data-lucide="tv"></i></div>
                    <b>ادرسوا سوا من يوتيوب</b>
                    <p>سوّي غرفة، ادعُ أصدقاءك، وشغّل الشرح. كل واحد يوكف ويرجع بكيفه، وتشوفون منو خلص الفيديو.</p>
                </div>
                ${inv.length ? `<div class="yr-h"><i data-lucide="mail"></i>دعوات إلك</div>${inv.map((x) => `
                    <div class="yr-inv">
                        <div><b>${esc(x.t || 'غرفة دراسة')}</b><small>${esc(x.fn || 'صديقك')} دعاك</small></div>
                        <button class="yr-btn" onclick="app.yrJoin(${jsArg(x.rid)})">ادخل</button>
                        <button class="yr-x" onclick="app.yrDecline(${jsArg(x.rid)})" aria-label="رفض"><i data-lucide="x"></i></button>
                    </div>`).join('')}` : ''}
                <div class="yr-h"><i data-lucide="plus-circle"></i>غرفة جديدة</div>
                <div class="yr-card">
                    <input id="yrTitle" maxlength="40" placeholder="اسم الغرفة، مثلاً: فيزياء الفصل الثالث">
                    <input id="yrFirst" placeholder="رابط أول فيديو من يوتيوب (اختياري)" dir="ltr">
                    <button class="yr-btn wide" onclick="app.yrCreate()"><i data-lucide="sparkles"></i>سوّي الغرفة</button>
                </div>
                ${recent.length ? `<div class="yr-h"><i data-lucide="history"></i>غرفك</div>${recent.map((r) => `
                    <button class="yr-recent" onclick="app.yrJoin(${jsArg(r.rid)})"><i data-lucide="tv"></i><span>${esc(r.t)}</span><i data-lucide="chevron-left"></i></button>`).join('')}` : ''}
                <div class="yr-h"><i data-lucide="link"></i>عندك رابط غرفة؟</div>
                <div class="yr-card row">
                    <input id="yrCode" placeholder="الصق الرابط أو رمز الغرفة" dir="ltr">
                    <button class="yr-btn" onclick="app.yrJoinCode()">ادخل</button>
                </div>`;
            this._yrHeader('غرفة يوتيوب جماعية', 'ادرسوا سوا وكل واحد بسرعته');
            lucide.createIcons();
        },

        _yrHeader(t, s) {
            const a = document.getElementById('yrTitleTx'), b = document.getElementById('yrSubTx'), m = document.getElementById('yrMenuBtn');
            if (a) a.textContent = t;
            if (b) b.textContent = s;
            if (m) m.classList.toggle('hidden', !this._yr);
        },

        _yrRecent() {
            try { return (JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') || []).filter((r) => r && r.rid).slice(0, 6); } catch (e) { return []; }
        },
        _yrRemember(rid, t, drop) {
            const list = this._yrRecent().filter((r) => r.rid !== rid);
            if (!drop) list.unshift({ rid, t: String(t || 'غرفة').slice(0, 40) });
            try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6))); } catch (e) {}
        },

        async yrCreate() {
            if (!this.authUid || !window.firebaseDb) { this.showToast('سجّل دخولك أول حتى تسوي غرفة'); return; }
            const btn = document.querySelector('.yr-card .yr-btn.wide');
            if (btn && btn.disabled) return;
            const title = filterBadWords(String(document.getElementById('yrTitle')?.value || '').trim()).clean.slice(0, 40) || 'غرفة دراسة';
            const raw = String(document.getElementById('yrFirst')?.value || '').trim(), first = this.extractYoutubeId(raw);
            if (raw && !first) { this.showToast('الرابط مو رابط فيديو يوتيوب، انسخه من زر المشاركة بيوتيوب'); return; }
            const rid = newId(), now = Date.now(), u = this.currentUser || {};
            const room = { meta: { host: this.authUid, title, at: now }, members: { [this.authUid]: { n: String(u.fullName || 'طالب').slice(0, 40), a: u.avatar || '', j: now } } };
            if (first) { const k = 'q' + now.toString(36); room.queue = { [k]: { v: first, t: '', by: this.authUid, at: now } }; room.meta.cur = k; }
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="yr-spin"></span>دا تنسوي الغرفة...'; }
            try {
                // a write the server never answers (no internet) should not leave the button spinning
                await Promise.race([H().set(R('ytRooms/' + rid), room), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))]);
                this._yrRemember(rid, title);
                this.yrOpen(rid);
                setTimeout(() => this.yrInvite(), 600);
            } catch (e) {
                console.warn('yrCreate', e);
                const msg = String(e && (e.code || e.message) || '');
                this.showToast(/permission|denied/i.test(msg) ? 'قاعدة البيانات رفضت الغرفة: لازم تنشر قواعد الحماية الجديدة من صفحة rules.html'
                    : /timeout/.test(msg) ? 'النت ضعيف، ما وصلت الغرفة. حاول مرة ثانية' : 'ما انسوت الغرفة، حاول مرة ثانية');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="sparkles"></i>سوّي الغرفة'; lucide.createIcons(); }
            }
        },

        yrJoinCode() {
            const v = String(document.getElementById('yrCode')?.value || '').trim();
            const m = v.match(/[?&]yr=([a-z0-9]{6,20})/i) || v.match(/^([a-z0-9]{6,20})$/i);
            if (!m) { this.showToast('الرابط مو صحيح'); return; }
            this.yrJoin(m[1].toLowerCase());
        },

        async yrJoin(rid) {
            if (!this.authUid || !window.firebaseDb) return;
            try {
                const [meta, mem, kick, all] = await Promise.all([
                    H().get(R('ytRooms/' + rid + '/meta')), H().get(R('ytRooms/' + rid + '/members/' + this.authUid)),
                    H().get(R('ytRooms/' + rid + '/kicked/' + this.authUid)), H().get(R('ytRooms/' + rid + '/members'))]);
                if (!meta.exists()) { this.showToast('هاي الغرفة انسدت'); this._yrRemember(rid, '', true); this.yrDecline(rid); if (this.currentView === 'ytRoomView') this.yrHome(); return; }
                if (kick.exists()) { this.showToast('ما تكدر تدخل هاي الغرفة'); this.yrDecline(rid); return; }
                if (!mem.exists()) {
                    if (Object.keys(all.val() || {}).length >= MAX_MEMBERS) { this.showToast('الغرفة مليانة (' + MAX_MEMBERS + ' طلاب)'); return; }
                    const u = this.currentUser || {};
                    await H().set(R('ytRooms/' + rid + '/members/' + this.authUid), { n: String(u.fullName || 'طالب').slice(0, 40), a: u.avatar || '', j: Date.now() });
                }
                this.yrDecline(rid);
                this._yrRemember(rid, meta.val().title);
                this.yrOpen(rid);
            } catch (e) { console.warn(e); this.showToast(/permission|denied/i.test(String(e && (e.code || e.message))) ? 'قاعدة البيانات رفضت: لازم تنشر قواعد الحماية الجديدة من صفحة rules.html' : 'ما كدرت أدخل الغرفة، تأكد من النت'); }
        },

        yrDecline(rid) {
            if (!this.authUid || !window.firebaseDb) return;
            H().remove(R('ytInvites/' + this.authUid + '/' + rid)).catch(() => {});
        },

        // ---------- inside a room ----------
        yrOpen(rid) {
            this._yrCloseRoom(true);
            const y = this._yr = { rid, meta: null, queue: {}, members: {}, prog: {}, done: {}, chat: [], tab: 'people', size: 'md', key: '', solo: false, watched: 0, subs: [], lastSend: 0, lastState: -2 };
            const box = document.getElementById('yrContent');
            box.innerHTML = `
                <div id="yrStage" class="yr-stage md">
                    <div class="yr-frame"><div id="yrPlayer"></div><div id="yrEmpty" class="yr-empty"><i data-lucide="clapperboard"></i><span>بعد ما انشغل فيديو</span></div><div id="yrFloat" class="yr-float"></div></div>
                    <div class="yr-rail">
                        <button onclick="app.yrSize('md')" aria-label="صغّر"><i data-lucide="minimize-2"></i></button>
                        <button class="yr-speed-b" onclick="app.yrSpeed()"><b class="yr-speed-t">1x</b></button>
                        ${Object.keys(REACTS).map((k) => `<button style="--c:${REACTS[k][2]}" onclick="app.yrReact('${k}')" aria-label="${REACTS[k][1]}"><i data-lucide="${REACTS[k][0]}"></i></button>`).join('')}
                        <button class="q" onclick="app.yrMark()" aria-label="ما فهمت هنا"><i data-lucide="hand"></i></button>
                        <small id="yrRailN"></small>
                    </div>
                    <div id="yrMarks" class="yr-marks"></div>
                </div>
                <div class="yr-bar">
                    <div class="yr-size">${[['sm', 'picture-in-picture-2', 'صغير'], ['md', 'rectangle-horizontal', 'عادي'], ['land', 'rectangle-horizontal', 'بالعرض']].map(([k, ic, t]) => `<button data-s="${k}" class="${k === 'md' ? 'on' : ''}${k === 'land' ? ' land' : ''}" onclick="app.yrSize('${k}')"><i data-lucide="${ic}"></i>${t}</button>`).join('')}</div>
                    <button class="yr-q" onclick="app.yrMark()"><i data-lucide="hand"></i>ما فهمت هنا</button>
                </div>
                <div class="yr-reacts">
                    ${Object.keys(REACTS).map((k) => `<button style="--c:${REACTS[k][2]}" onclick="app.yrReact('${k}')"><i data-lucide="${REACTS[k][0]}"></i>${REACTS[k][1]}</button>`).join('')}
                    <button class="yr-speed-b sp" onclick="app.yrSpeed()"><i data-lucide="gauge"></i><b class="yr-speed-t">1x</b></button>
                </div>
                <div id="yrNow"></div>
                <div class="yr-tabs">${[['people', 'users', 'الطلاب'], ['list', 'list-video', 'الفيديوهات'], ['chat', 'message-circle', 'الدردشة']].map(([k, ic, t]) => `<button data-t="${k}" class="${k === 'people' ? 'on' : ''}" onclick="app.yrTab('${k}')"><i data-lucide="${ic}"></i>${t}<em id="yrBadge_${k}"></em></button>`).join('')}</div>
                <div id="yrPanel"></div>`;
            this._yrHeader('غرفة يوتيوب', '');
            lucide.createIcons();

            const on = (path, fn, q) => {
                const r = q ? q(R(path)) : R(path);
                y.subs.push(H().onValue(r, (s) => { if (this._yr === y) fn(s.val()); }, () => {}));
            };
            on('ytRooms/' + rid + '/meta', (v) => {
                if (!v) { this.showToast('المضيف سد الغرفة'); this._yrRemember(rid, '', true); this.yrHome(); return; }
                const prevCur = y.meta && y.meta.cur;
                y.meta = v;
                this._yrRemember(rid, v.title);
                this._yrHeader(v.title || 'غرفة يوتيوب', '');
                if (v.cur !== prevCur && !y.solo) this._yrFollow();
                this._yrPaint();
            });
            on('ytRooms/' + rid + '/queue', (v) => { y.queue = v || {}; if (!y.key) this._yrFollow(); this._yrPaint(); });
            on('ytRooms/' + rid + '/members', (v) => {
                y.members = v || {};
                if (y.meta && !y.members[this.authUid]) { this.showToast('طلعت من الغرفة'); this._yrRemember(rid, '', true); this.yrHome(); return; }
                this._yrPaint();
            });
            on('ytRooms/' + rid + '/prog', (v) => { y.prog = v || {}; this._yrPaint(); });
            on('ytRooms/' + rid + '/done', (v) => { y.done = v || {}; this._yrPaint(); });
            const h = H();
            on('ytRooms/' + rid + '/chat', (v) => {
                const list = Object.keys(v || {}).map((id) => Object.assign({ id }, v[id])).sort((a, b) => (a.at || 0) - (b.at || 0));
                // the first load is history; only what arrives after it is new
                const seen = y.chatLoaded ? y.chat.length : list.length;
                y.chatLoaded = true;
                y.chat = list;
                if (list.length > seen && y.tab !== 'chat') y.unread = (y.unread || 0) + (list.length - seen);
                if (list.length > seen && y.size === 'land') list.slice(seen).filter((c) => c.u !== this.authUid).slice(-3).forEach((c) => this._yrFloatMsg(c));
                this._yrPaint();
            }, h.query && h.limitToLast ? (r) => h.query(r, h.limitToLast(60)) : null);

            const opened = Date.now();
            y.reactSeen = {};
            on('ytRooms/' + rid + '/react', (v) => {
                Object.keys(v || {}).forEach((u) => {
                    const r = v[u];
                    if (!r || !REACTS[r.r] || (r.at || 0) < opened || y.reactSeen[u] === r.at || u === this.authUid) return;
                    y.reactSeen[u] = r.at;
                    this._yrFloatReact(r.r, (y.members[u] || {}).n);
                });
            });
            // turning the phone sideways goes to the landscape view, and back
            y.onRot = () => this._yrRot();
            window.addEventListener('resize', y.onRot);
            document.addEventListener('fullscreenchange', y.onRot);
            y.onVis = () => { if (!document.hidden) y.wl = null; };
            document.addEventListener('visibilitychange', y.onVis);

            this.joinStudyRoom('youtube');
            y.tick = setInterval(() => this._yrTick(), 1000);
            ytApi().catch(() => this.showToast('ما انحمل مشغل يوتيوب، تأكد من النت'));
        },

        // leaving the page keeps the membership, only stops listening
        _yrCloseRoom(keep) {
            const y = this._yr;
            if (!y) return;
            this._yrSend(true);
            y.subs.forEach((u) => { try { u(); } catch (e) {} });
            clearInterval(y.tick);
            window.removeEventListener('resize', y.onRot);
            document.removeEventListener('fullscreenchange', y.onRot);
            document.removeEventListener('visibilitychange', y.onVis);
            try { if (y.wl && y.wl.release) y.wl.release(); } catch (e) {}
            try { if (y.player && y.player.destroy) y.player.destroy(); } catch (e) {}
            if (document.fullscreenElement) try { document.exitFullscreen(); } catch (e) {}
            try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {}
            document.body.classList.remove('yr-land-on');
            this.leaveStudyRoom();
            this._yr = null;
            document.body.classList.remove('yr-mini-on');
        },
        _yrLeaveView() { this._yrCloseRoom(true); },

        // Play the room's current video (or keep playing my own pick in solo mode).
        _yrFollow(key) {
            const y = this._yr;
            if (!y) return;
            const k = key || (y.meta && y.meta.cur) || '';
            const item = k && (y.queue[k] || (y.adhoc && y.adhoc.k === k ? y.adhoc : null));
            if (!item) return;
            if (y.key === k && y.player) return;
            this._yrSend(true);
            y.key = k; y.watched = 0; y.lastState = -2;
            const mine = y.prog[this.authUid], start = mine && mine.k === k && !(y.done[this.authUid] || {})[k] ? Math.max(0, (mine.t || 0) - 3) : 0;
            document.getElementById('yrEmpty')?.classList.add('hidden');
            ytApi().then(() => {
                if (this._yr !== y || y.key !== k) return;
                if (y.player && y.player.loadVideoById) { y.player.loadVideoById({ videoId: item.v, startSeconds: start }); return; }
                y.player = new YT.Player('yrPlayer', {
                    videoId: item.v,
                    playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1, start: Math.floor(start) },
                    events: {
                        onStateChange: () => this._yrSend(false, true),
                        onError: (e) => this.showToast(e && (e.data === 101 || e.data === 150) ? 'صاحب هذا الفيديو مانع تشغيله خارج يوتيوب، جرّبوا فيديو ثاني' : 'ما اشتغل الفيديو، تأكد من الرابط'),
                        onReady: () => { try { y.player.playVideo(); } catch (e) {} }
                    }
                });
            }).catch(() => {});
            this._yrPaint();
        },

        _yrState() {
            const p = this._yr && this._yr.player;
            if (!p || !p.getCurrentTime) return null;
            try { return { t: p.getCurrentTime() || 0, d: p.getDuration() || 0, s: p.getPlayerState() }; } catch (e) { return null; }
        },

        _yrTick() {
            const y = this._yr, st = this._yrState();
            if (!y || !st) return;
            if (st.s === 1 && !document.hidden) {
                y.watched += y.rate || 1;
                if (!y.wl && navigator.wakeLock && navigator.wakeLock.request) {
                    y.wl = 1;
                    navigator.wakeLock.request('screen').then((l) => { if (this._yr === y) y.wl = l; else l.release(); }).catch(() => {});
                }
            }
            // the title comes from the player the first time anyone plays it
            const item = y.queue[y.key];
            if (item && !item.t && y.meta && y.meta.host === this.authUid) {
                try { const t = y.player.getVideoData().title; if (t) { item.t = t; H().set(R('ytRooms/' + y.rid + '/queue/' + y.key + '/t'), String(t).slice(0, 100)).catch(() => {}); } } catch (e) {}
            }
            if (st.d > 0 && (st.t / st.d >= DONE_AT || st.s === 0)) this._yrDone();
            this._yrSend(false);
            this._yrPaintNow(st);
        },

        // my position, every 5 seconds and whenever I play/pause
        _yrSend(force, stateChange) {
            const y = this._yr, st = this._yrState();
            if (!y || !st || !y.key || !this.authUid) return;
            const now = Date.now(), playing = st.s === 1 ? 1 : 0;
            if (!force && !(stateChange && playing !== y.lastState) && now - y.lastSend < 5000) return;
            y.lastSend = now; y.lastState = playing;
            H().set(R('ytRooms/' + y.rid + '/prog/' + this.authUid), { k: y.key, t: Math.round(st.t), d: Math.round(st.d), p: playing, at: now }).catch(() => {});
        },

        _yrDone() {
            const y = this._yr, k = y && y.key;
            if (!k || k.indexOf('x') === 0 || (y.done[this.authUid] || {})[k] || y.doneBusy === k) return;
            y.doneBusy = k;
            const st = this._yrState() || { d: 0 };
            H().set(R('ytRooms/' + y.rid + '/done/' + this.authUid + '/' + k), true).catch(() => {});
            // points only for real watching: most of a video at least two minutes long
            if (st.d >= 120 && y.watched >= st.d * 0.6) {
                this.addPointsAtomic(POINTS).then(() => {
                    this.logDailyActivity({ points: POINTS });
                    this.showToast('خلصت الفيديو (+' + POINTS + ' نقاط)');
                }).catch(() => {});
            } else this.showToast('خلصت الفيديو');
        },

        // ---------- controls ----------
        yrSize(s, auto) {
            const y = this._yr, stage = document.getElementById('yrStage');
            if (!y || !stage) return;
            if (y.size === 'land' && s !== 'land' && !auto && window.innerWidth > window.innerHeight) y.leftLand = true;
            const wasLand = y.size === 'land';
            y.size = s;
            y.autoLand = s === 'land' && !!auto;
            ['sm', 'md', 'land'].forEach((k) => stage.classList.toggle(k, s === k));
            document.body.classList.toggle('yr-mini-on', s === 'sm');
            document.body.classList.toggle('yr-land-on', s === 'land');
            document.querySelectorAll('.yr-size button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-s') === s));
            if (s === 'land' && !auto) {
                // real fullscreen and a sideways lock where the phone allows it (Android);
                // elsewhere (iPhone) the view is simply turned with CSS
                // the whole page goes fullscreen, not the stage: a fullscreen element can't be turned
                const de = document.documentElement, req = de.requestFullscreen || de.webkitRequestFullscreen;
                if (req && !document.fullscreenElement) Promise.resolve(req.call(de)).then(() => { try { return screen.orientation.lock('landscape'); } catch (e) {} }).catch(() => {}).then(() => this._yrRot());
            }
            if (s !== 'land' && wasLand) {
                if (document.fullscreenElement) try { document.exitFullscreen(); } catch (e) {}
                try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {}
                const f = document.getElementById('yrFloat');
                if (f) f.innerHTML = '';
            }
            this._yrRot();
        },

        // portrait phone in the landscape view: turn the stage with CSS
        _yrRot() {
            const y = this._yr, stage = document.getElementById('yrStage');
            if (!y || !stage) return;
            const wide = window.innerWidth > window.innerHeight, small = Math.min(window.innerWidth, window.innerHeight) < 600;
            if (small && wide && y.size !== 'land' && y.key && !y.leftLand) { y.preLand = y.size; this.yrSize('land', true); return; }
            if (!wide && y.autoLand) { y.autoLand = false; this.yrSize(y.preLand || 'md'); return; }
            if (!wide) y.leftLand = false;
            stage.classList.toggle('rot', y.size === 'land' && !wide);
        },

        yrSpeed() {
            const y = this._yr;
            if (!y || !y.player || !y.player.setPlaybackRate) return;
            const i = SPEEDS.indexOf(y.rate || 1), r = SPEEDS[(i + 1) % SPEEDS.length];
            try { y.player.setPlaybackRate(r); } catch (e) {}
            y.rate = r;
            document.querySelectorAll('.yr-speed-t').forEach((b) => { b.textContent = r + 'x'; });
            this.showToast('السرعة ' + r + 'x (إلك بس)');
        },

        yrReact(r) {
            const y = this._yr;
            if (!y || !REACTS[r] || !this.authUid) return;
            const now = Date.now();
            if (now - (y.lastReact || 0) < 1500) return;
            y.lastReact = now;
            this._yrFloatReact(r, 'أنت');
            H().set(R('ytRooms/' + y.rid + '/react/' + this.authUid), { r, at: now }).catch(() => {});
        },

        _yrFloatReact(r, name) {
            const f = document.getElementById('yrFloat'), d = REACTS[r];
            if (!f || !d) return;
            const el = document.createElement('span');
            el.className = 'yr-fr-r';
            el.style.cssText = '--c:' + d[2] + ';--x:' + Math.round(Math.random() * 40 - 20) + 'px';
            el.innerHTML = `<i data-lucide="${d[0]}"></i><small>${esc(name || '')} ${d[1]}</small>`;
            f.appendChild(el);
            lucide.createIcons();
            setTimeout(() => el.remove(), 2600);
        },

        _yrFloatMsg(c) {
            const f = document.getElementById('yrFloat');
            if (!f) return;
            const el = document.createElement('div');
            el.className = 'yr-fr-m';
            el.innerHTML = `<b>${esc(c.n)}</b>${esc(c.sv ? 'اقترح فيديو' : c.m)}`;
            f.appendChild(el);
            [...f.querySelectorAll('.yr-fr-m')].slice(0, -3).forEach((x) => x.remove());
            setTimeout(() => el.remove(), 6000);
        },

        yrTab(t) {
            const y = this._yr;
            if (!y) return;
            y.tab = t;
            if (t === 'chat') y.unread = 0;
            document.querySelectorAll('.yr-tabs button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-t') === t));
            this._yrPaint();
            if (t === 'chat') setTimeout(() => { const l = document.getElementById('yrChatList'); if (l) l.scrollTop = l.scrollHeight; }, 30);
        },

        yrSeek(sec, key) {
            const y = this._yr;
            if (!y) return;
            if (key && key !== y.key) { y.solo = key !== (y.meta && y.meta.cur); this._yrFollow(key); setTimeout(() => this.yrSeek(sec), 1500); return; }
            try { y.player.seekTo(Math.max(0, sec), true); y.player.playVideo(); } catch (e) {}
            if (y.size === 'sm') return;
            document.getElementById('yrStage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },

        // jump to where the host is now
        yrCatchUp() {
            const y = this._yr, hp = y && y.meta && y.prog[y.meta.host];
            if (!hp || !hp.k) return;
            const t = hp.t + (hp.p ? (Date.now() - hp.at) / 1000 : 0);
            if (hp.k !== y.key) { y.solo = hp.k !== y.meta.cur; this._yrFollow(hp.k); setTimeout(() => this.yrSeek(t + 1.5), 1500); } else this.yrSeek(t);
            this.showToast('لحكت المضيف');
        },

        yrMark() {
            const y = this._yr, st = this._yrState();
            if (!y || !st || !y.key) { this.showToast('شغّل الفيديو أول'); return; }
            this._yrPost('ما فهمت هنا', { k: y.key, s: Math.round(st.t) });
            this.showToast('وصلت علامتك للكل عند ' + clock(st.t));
        },

        yrSendChat() {
            const inp = document.getElementById('yrMsg');
            const m = filterBadWords(String(inp && inp.value || '').trim()).clean.slice(0, 200);
            if (!m) return;
            inp.value = '';
            this._yrPost(m);
        },

        _yrPost(m, extra) {
            const y = this._yr;
            if (!y || !this.authUid) return;
            const u = this.currentUser || {};
            H().set(R('ytRooms/' + y.rid + '/chat/' + newId()), Object.assign({ u: this.authUid, n: String(u.fullName || 'طالب').slice(0, 40), m, at: Date.now() }, extra || {})).catch(() => this.showToast('ما انرسلت'));
        },

        // one box: a YouTube link, or words to search YouTube for
        yrFind() {
            const y = this._yr, inp = document.getElementById('yrQ');
            if (!y || !inp) return;
            const q = String(inp.value || '').trim();
            if (!q) return;
            const v = this.extractYoutubeId(q);
            if (v) {
                inp.value = '';
                if (y.meta.host === this.authUid) this.yrAddVideo(v, '', !y.meta.cur);
                else this.yrSolo(v, '');
                return;
            }
            this._yrSearch(q);
        },

        _yrKey() {
            const c = this.siteConfig || {};
            if (c.ytKey) return String(c.ytKey);
            try { return window.firebaseDb.app.options.apiKey || ''; } catch (e) { return ''; }
        },

        async _yrSearch(q) {
            const y = this._yr;
            if (!y) return;
            const norm = q.replace(/\s+/g, ' ').toLowerCase();
            let cache = {};
            try { cache = JSON.parse(localStorage.getItem('isp_yts') || '{}') || {}; } catch (e) {}
            if (cache[norm] && Date.now() - cache[norm].at < 86400000) { y.res = { q, items: cache[norm].items }; this._yrPaint(); return; }
            y.res = { q, loading: 1 };
            this._yrPaint();
            const key = this._yrKey(), base = 'https://www.googleapis.com/youtube/v3/';
            try {
                const r = await fetch(base + 'search?part=snippet&type=video&videoEmbeddable=true&safeSearch=strict&maxResults=12&relevanceLanguage=ar&regionCode=IQ&q=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(key));
                const j = await r.json();
                if (j.error) throw j.error;
                const dec = (t) => { const d = document.createElement('textarea'); d.innerHTML = t || ''; return d.value; };
                const items = (j.items || []).filter((x) => x.id && x.id.videoId).map((x) => ({ v: x.id.videoId, t: dec(x.snippet.title).slice(0, 100), c: dec(x.snippet.channelTitle).slice(0, 40) }));
                // lengths come from a second, cheap call
                if (items.length) {
                    try {
                        const d = await (await fetch(base + 'videos?part=contentDetails&id=' + items.map((x) => x.v).join(',') + '&key=' + encodeURIComponent(key))).json();
                        const len = {};
                        (d.items || []).forEach((x) => { const m = String(x.contentDetails && x.contentDetails.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if (m) len[x.id] = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); });
                        items.forEach((x) => { if (len[x.v]) x.d = len[x.v]; });
                    } catch (e) {}
                }
                cache[norm] = { at: Date.now(), items };
                const ks = Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at).slice(0, 30), keep = {};
                ks.forEach((k) => { keep[k] = cache[k]; });
                try { localStorage.setItem('isp_yts', JSON.stringify(keep)); } catch (e) {}
                if (this._yr === y) { y.res = { q, items }; this._yrPaint(); }
            } catch (e) {
                const why = String((e && e.errors && e.errors[0] && e.errors[0].reason) || (e && e.status) || e && e.message || '');
                console.warn('YouTube search', why, e);
                const msg = /quota|dailyLimit|rateLimit/i.test(why) ? 'خلص حد البحث لليوم. الصق رابط الفيديو بداله'
                    : /accessNotConfigured|SERVICE_DISABLED|BLOCKED|forbidden|PERMISSION|keyInvalid|API_KEY/i.test(why) ? 'بحث يوتيوب بعده ما مفعّل. الصق رابط الفيديو بداله'
                    : 'ما اشتغل البحث، تأكد من النت';
                if (this._yr === y) { y.res = { q, err: msg }; this._yrPaint(); }
            }
        },

        yrClearRes() { const y = this._yr; if (!y) return; y.res = null; const i = document.getElementById('yrQ'); if (i) i.value = ''; this._yrPaint(); },

        // host: add a video to the room's list (and play it for everyone if asked)
        yrAddVideo(v, t, playNow) {
            const y = this._yr;
            if (!y || y.meta.host !== this.authUid) return;
            if (Object.keys(y.queue).length >= 30) { this.showToast('القائمة مليانة'); return; }
            const now = Date.now(), k = 'q' + now.toString(36);
            H().set(R('ytRooms/' + y.rid + '/queue/' + k), { v, t: String(t || '').slice(0, 100), by: this.authUid, at: now }).then(() => {
                this.showToast(playNow ? 'انشغل للكل' : 'انضاف للقائمة');
                if (playNow) this.yrPlayAll(k);
            }).catch(() => this.showToast('ما انضاف'));
        },
        // a student: watch a video that isn't in the list, on your own
        yrSolo(v, t) {
            const y = this._yr;
            if (!y) return;
            y.adhoc = { k: 'x' + v, v, t: String(t || '') };
            y.solo = true;
            this._yrFollow(y.adhoc.k);
            document.getElementById('yrStage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        yrSuggest(v, t) {
            this._yrPost('اقترح هذا الفيديو', { sv: v, st: String(t || 'فيديو يوتيوب').slice(0, 100) });
            this.showToast('وصل اقتراحك للمضيف بالدردشة');
        },
        _yrResult(x) {
            const y = this._yr, host = y.meta.host === this.authUid, v = jsArg(x.v), t = jsArg(x.t || '');
            return `<div class="yr-r">
                <div class="yr-v-m"><img src="${thumb(x.v)}" alt="" loading="lazy">${x.d ? `<span class="yr-len">${clock(x.d)}</span>` : ''}</div>
                <div class="yr-r-b"><b>${esc(x.t || 'فيديو يوتيوب')}</b>${x.c ? `<small>${esc(x.c)}</small>` : ''}
                    <div class="yr-r-a">${host
                        ? `<button class="go" onclick="app.yrAddVideo(${v}, ${t}, true)"><i data-lucide="play"></i>شغّل للكل</button><button onclick="app.yrAddVideo(${v}, ${t}, false)"><i data-lucide="plus"></i>للقائمة</button>`
                        : `<button class="go" onclick="app.yrSolo(${v}, ${t})"><i data-lucide="play"></i>شوفه لوحدك</button><button onclick="app.yrSuggest(${v}, ${t})"><i data-lucide="send"></i>اقترح</button>`}</div>
                </div>
            </div>`;
        },

        // host: play this for everyone; a student: watch it on your own for now
        yrPick(k) {
            const y = this._yr;
            if (!y) return;
            if (y.meta.host === this.authUid) { this.yrPlayAll(k); return; }
            y.solo = k !== y.meta.cur;
            this._yrFollow(k);
            if (y.solo) this.showToast('تشوفه لوحدك هسه. دوس "ارجع للكل" حتى ترجع ويا المجموعة');
        },
        yrPlayAll(k) {
            const y = this._yr;
            if (!y || y.meta.host !== this.authUid) return;
            H().set(R('ytRooms/' + y.rid + '/meta/cur'), k).catch(() => {});
        },
        yrBackToGroup() { const y = this._yr; if (!y) return; y.solo = false; this._yrFollow(); },
        yrNext() {
            const y = this._yr;
            if (!y) return;
            const keys = Object.keys(y.queue).sort(), i = keys.indexOf(y.meta.cur);
            if (keys[i + 1]) this.yrPlayAll(keys[i + 1]);
        },
        yrRemove(k) {
            const y = this._yr;
            if (!y || y.meta.host !== this.authUid || !confirm('تشيل هذا الفيديو من القائمة؟')) return;
            H().remove(R('ytRooms/' + y.rid + '/queue/' + k)).catch(() => {});
            if (y.meta.cur === k) H().remove(R('ytRooms/' + y.rid + '/meta/cur')).catch(() => {});
        },

        yrKick(uid) {
            const y = this._yr, m = y && y.members[uid];
            if (!m || y.meta.host !== this.authUid || uid === this.authUid) return;
            if (!confirm('تطلّع ' + m.n + ' من الغرفة؟')) return;
            H().update(R('ytRooms/' + y.rid), { ['kicked/' + uid]: true, ['members/' + uid]: null, ['prog/' + uid]: null }).catch(() => this.showToast('ما صار'));
        },

        yrMenu() {
            const y = this._yr;
            if (!y) return;
            const host = y.meta.host === this.authUid;
            document.getElementById('walletModalTitle').textContent = y.meta.title || 'الغرفة';
            document.getElementById('walletModalContent').innerHTML = `
                <button class="yr-menu-i" onclick="app.closeWalletModal(); app.yrInvite()"><i data-lucide="user-plus"></i>ادعُ أصدقاء</button>
                <button class="yr-menu-i" onclick="app.yrCopyLink()"><i data-lucide="link"></i>انسخ رابط الغرفة</button>
                ${host ? '<button class="yr-menu-i red" onclick="app.yrEnd()"><i data-lucide="power"></i>سد الغرفة للكل</button>'
                    : '<button class="yr-menu-i red" onclick="app.yrLeave()"><i data-lucide="log-out"></i>اطلع من الغرفة</button>'}`;
            document.getElementById('walletModal').classList.remove('hidden');
            lucide.createIcons();
        },

        yrLink() { return location.origin + location.pathname + '?yr=' + (this._yr ? this._yr.rid : ''); },
        yrCopyLink() {
            const link = this.yrLink(), t = 'تعال ندرس سوا بغرفة يوتيوب: ' + link;
            this.closeWalletModal();
            if (navigator.share) { navigator.share({ text: t }).catch(() => {}); return; }
            (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => this.showToast('انسخ الرابط'), () => this.showToast(link));
        },

        yrInvite() {
            const y = this._yr;
            if (!y) return;
            const fr = (typeof friendsList !== 'undefined' ? friendsList : []).filter((f) => f && f.uid);
            y.invited = y.invited || {};
            document.getElementById('walletModalTitle').textContent = 'ادعُ أصدقاءك';
            document.getElementById('walletModalContent').innerHTML = `
                ${fr.length ? `<div class="yr-fr">${fr.map((f) => {
                    const inRoom = !!y.members[f.uid], sent = y.invited[f.uid];
                    return `<div class="yr-fr-i"><span class="yr-av">${avatar(f.avatar, f.name)}</span><b>${esc(f.name || 'طالب')}</b>
                        ${inRoom ? '<em>بالغرفة</em>' : `<button class="yr-btn${sent ? ' done' : ''}" ${sent ? 'disabled' : ''} onclick="app.yrSendInvite(${jsArg(f.uid)}, this)">${sent ? 'انرسلت' : 'ادعُ'}</button>`}</div>`;
                }).join('')}</div>` : '<p class="yr-muted">ما عندك أصدقاء بالتطبيق بعد. ضيفهم من صفحة الأصدقاء، أو دزلهم الرابط.</p>'}
                <button class="yr-menu-i" onclick="app.yrCopyLink()"><i data-lucide="share-2"></i>دز رابط الغرفة</button>`;
            document.getElementById('walletModal').classList.remove('hidden');
            lucide.createIcons();
        },

        yrSendInvite(uid, btn) {
            const y = this._yr, u = this.currentUser || {};
            if (!y) return;
            H().set(R('ytInvites/' + uid + '/' + y.rid), { from: this.authUid, fn: String(u.fullName || 'طالب').slice(0, 40), t: String(y.meta.title || '').slice(0, 40), at: Date.now() }).then(() => {
                y.invited[uid] = 1;
                if (btn) { btn.textContent = 'انرسلت'; btn.disabled = true; btn.classList.add('done'); }
            }).catch(() => this.showToast('ما انرسلت الدعوة'));
        },

        yrLeave() {
            const y = this._yr;
            if (!y) return;
            this.closeWalletModal();
            const rid = y.rid;
            this._yrRemember(rid, '', true);
            H().update(R('ytRooms/' + rid), { ['members/' + this.authUid]: null, ['prog/' + this.authUid]: null }).catch(() => {});
            this.yrHome();
        },
        yrEnd() {
            const y = this._yr;
            if (!y || !confirm('تسد الغرفة؟ كل الطلاب يطلعون منها.')) return;
            this.closeWalletModal();
            const rid = y.rid;
            this._yrRemember(rid, '', true);
            this._yrCloseRoom(true);
            H().remove(R('ytRooms/' + rid)).catch(() => {});
            this.yrHome();
        },

        // ---------- drawing ----------
        _yrStatus(uid, curKey) {
            const y = this._yr, p = y.prog[uid], done = (y.done[uid] || {})[curKey];
            if (done) return ['done', 'خلص', 100];
            if (!p || p.k !== curKey) return ['off', p && Date.now() - p.at < 60000 ? 'بفيديو ثاني' : 'مو متصل', 0];
            const pct = p.d ? Math.min(99, Math.round(p.t / p.d * 100)) : 0;
            if (Date.now() - p.at > 60000) return ['off', 'مو متصل', pct];
            return p.p ? ['play', 'يشاهد', pct] : ['pause', 'واكف', pct];
        },

        _yrPaint() {
            const y = this._yr, panel = document.getElementById('yrPanel');
            if (!y || !y.meta || !panel) return;
            // others' progress repaints this every few seconds: keep what's being typed and the chat scroll
            const ae = document.activeElement, typing = ae && (ae.id === 'yrMsg' || ae.id === 'yrQ') ? { id: ae.id, s: ae.selectionStart } : null;
            const kept = {};
            ['yrMsg', 'yrQ'].forEach((id) => { const e = document.getElementById(id); if (e && e.value) kept[id] = e.value; });
            const cl = document.getElementById('yrChatList'), clTop = cl ? cl.scrollTop : 0, atBottom = !cl || cl.scrollHeight - cl.scrollTop - cl.clientHeight < 40;
            const host = y.meta.host === this.authUid, cur = y.meta.cur, keys = Object.keys(y.queue).sort();
            const mids = Object.keys(y.members).sort((a, b) => (a === y.meta.host ? -1 : b === y.meta.host ? 1 : (y.members[a].j || 0) - (y.members[b].j || 0)));
            const doneN = cur ? mids.filter((u) => (y.done[u] || {})[cur]).length : 0;
            const rn = document.getElementById('yrRailN');
            if (rn) rn.textContent = cur ? doneN + '/' + mids.length : '';
            const sub = document.getElementById('yrSubTx');
            if (sub) sub.textContent = mids.length + ' طلاب' + (keys.length ? ' . ' + keys.length + ' فيديو' : '');
            ['list', 'chat', 'people'].forEach((t) => { const b = document.getElementById('yrBadge_' + t); if (b) b.textContent = t === 'chat' && y.unread ? y.unread : ''; });

            // strip under the player: what's on, who finished, and the buttons that matter now
            const item = y.queue[y.key] || (y.adhoc && y.adhoc.k === y.key ? y.adhoc : null), now = document.getElementById('yrNow');
            const hp = y.prog[y.meta.host], behind = !host && hp && hp.k === y.key && this._yrState() && Math.abs(hp.t - this._yrState().t) > 20;
            if (now) now.innerHTML = item ? `
                <div class="yr-now">
                    <div class="yr-now-t"><b>${esc(item.t || 'فيديو يوتيوب')}</b>${y.solo ? '<small class="solo">تشوفه لوحدك</small>' : `<small>${doneN} من ${mids.length} خلصوا هذا الفيديو</small>`}</div>
                    <div class="yr-stack">${mids.slice(0, 6).map((u) => { const s = this._yrStatus(u, y.key)[0]; return `<span class="yr-av s-${s}" title="${esc(y.members[u].n)}">${avatar(y.members[u].a, y.members[u].n)}</span>`; }).join('')}</div>
                </div>
                <div class="yr-acts">
                    ${y.solo ? '<button onclick="app.yrBackToGroup()"><i data-lucide="users"></i>ارجع للكل</button>' : ''}
                    ${behind ? '<button onclick="app.yrCatchUp()"><i data-lucide="fast-forward"></i>الحق المضيف</button>' : ''}
                    ${host && cur && doneN === mids.length && keys.indexOf(cur) < keys.length - 1 ? '<button class="go" onclick="app.yrNext()"><i data-lucide="skip-back"></i>كلكم خلصتوا، شغّل الجاي</button>' : ''}
                </div>` : '';

            // marks on the timeline of the video I'm watching
            const st = this._yrState(), marks = document.getElementById('yrMarks'), d = st && st.d;
            if (marks) marks.innerHTML = d ? y.chat.filter((c) => c.k === y.key && c.s != null).map((c) => `<button style="left:${Math.min(100, c.s / d * 100)}%" title="${esc(c.n)} ${clock(c.s)}" onclick="app.yrSeek(${Number(c.s) || 0})"></button>`).join('') : '';

            if (y.tab === 'people') {
                panel.innerHTML = `<div class="yr-people">${mids.map((u) => {
                    const m = y.members[u], [s, label, pct] = this._yrStatus(u, y.key || cur), p = y.prog[u];
                    const nDone = keys.filter((k) => (y.done[u] || {})[k]).length;
                    return `<div class="yr-p s-${s}${u === this.authUid ? ' me-row' : ''}">
                        <span class="yr-av">${avatar(m.a, m.n)}</span>
                        <div class="yr-p-b">
                            <div class="yr-p-t"><b>${esc(m.n)}${u === this.authUid ? ' (أنت)' : ''}</b>${u === y.meta.host ? '<em class="host">المضيف</em>' : ''}<small>${label}${p && p.k === (y.key || cur) && s !== 'done' ? ' . ' + clock(p.t) : ''}</small></div>
                            <div class="yr-prog"><i style="width:${pct}%"></i></div>
                            <small class="yr-p-n">خلص ${nDone} من ${keys.length || 0} فيديو</small>
                        </div>
                        ${host && u !== this.authUid ? `<button class="yr-x" onclick="app.yrKick(${jsArg(u)})" aria-label="طلّعه"><i data-lucide="user-x"></i></button>` : ''}
                    </div>`;
                }).join('')}</div>
                <button class="yr-invite-btn" onclick="app.yrInvite()"><i data-lucide="user-plus"></i>ادعُ أصدقاء للغرفة</button>`;
            } else if (y.tab === 'list') {
                panel.innerHTML = `
                    <div class="yr-find"><i data-lucide="search"></i><input id="yrQ" type="search" enterkeyhint="search" placeholder="دوّر بيوتيوب أو الصق رابط" onkeydown="if(event.key==='Enter'){event.preventDefault();app.yrFind()}"><button class="yr-btn" onclick="app.yrFind()">دوّر</button></div>
                    ${y.res ? `<div class="yr-res">
                        <div class="yr-res-h"><b>نتائج: ${esc(y.res.q)}</b><button onclick="app.yrClearRes()"><i data-lucide="x"></i>سد</button></div>
                        ${y.res.loading ? '<div class="kd-loading"><span></span><span></span><span></span></div>'
                            : y.res.err ? `<p class="yr-muted">${esc(y.res.err)}</p>`
                            : y.res.items && y.res.items.length ? y.res.items.map((x) => this._yrResult(x)).join('') : '<p class="yr-muted">ما لكيت فيديوهات، جرّب كلمات ثانية</p>'}
                    </div>` : ''}
                    <div class="yr-h">${host ? '<i data-lucide="list-video"></i>قائمة الغرفة' : '<i data-lucide="list-video"></i>قائمة الغرفة (المضيف يختار شنو ينشغل للكل)'}</div>
                    ${keys.length ? keys.map((k, i) => {
                        const q = y.queue[k], all = mids.length, dn = mids.filter((u) => (y.done[u] || {})[k]).length;
                        return `<div class="yr-v${k === cur ? ' cur' : ''}${k === y.key ? ' me' : ''}">
                            <button class="yr-v-m" onclick="app.yrPick(${jsArg(k)})"><img src="${thumb(q.v)}" alt="" loading="lazy"><span class="yr-v-n">${i + 1}</span></button>
                            <div class="yr-v-b" onclick="app.yrPick(${jsArg(k)})"><b>${esc(q.t || 'فيديو يوتيوب')}</b><small>${k === cur ? '<em>شغال للكل</em> . ' : ''}خلصوه ${dn} من ${all}</small><div class="yr-prog"><i style="width:${all ? dn / all * 100 : 0}%"></i></div></div>
                            ${host ? `<button class="yr-x" onclick="app.yrRemove(${jsArg(k)})" aria-label="شيل"><i data-lucide="trash-2"></i></button>` : ''}
                        </div>`;
                    }).join('') : `<p class="yr-muted">${host ? 'القائمة فارغة. دوّر على شرح وضيفه.' : 'القائمة فارغة.'}</p>`}`;
            } else {
                const list = y.chat.slice(-60);
                panel.innerHTML = `<div id="yrChatList" class="yr-chat">${list.length ? list.map((c) => {
                    const mine = c.u === this.authUid, q = y.queue[c.k];
                    return `<div class="yr-msg${mine ? ' mine' : ''}${c.s != null ? ' mark' : ''}">
                        ${mine ? '' : `<small>${esc(c.n)}</small>`}
                        <p>${esc(c.m)}</p>
                        ${c.sv ? `<div class="yr-sug"><img src="${thumb(c.sv)}" alt="" loading="lazy"><span>${esc(c.st || 'فيديو يوتيوب')}</span></div><div class="yr-sug-a">${host ? `<button onclick="app.yrAddVideo(${jsArg(c.sv)}, ${jsArg(c.st || '')}, false)"><i data-lucide="plus"></i>ضيفه للقائمة</button>` : ''}<button onclick="app.yrSolo(${jsArg(c.sv)}, ${jsArg(c.st || '')})"><i data-lucide="play"></i>شوفه</button></div>` : ''}
                        ${c.s != null && q ? `<button onclick="app.yrSeek(${Number(c.s) || 0}, ${jsArg(c.k)})"><i data-lucide="play"></i>${clock(c.s)}${c.k !== y.key ? ' . ' + esc((q.t || 'فيديو').slice(0, 24)) : ''}</button>` : ''}
                    </div>`;
                }).join('') : '<p class="yr-muted">اكتبوا هنا، أو دوسوا "ما فهمت هنا" بنص الفيديو حتى تطلع علامة بالدقيقة.</p>'}</div>
                <div class="yr-send"><input id="yrMsg" maxlength="200" placeholder="اكتب رسالة..." onkeydown="if(event.key==='Enter')app.yrSendChat()"><button onclick="app.yrSendChat()" aria-label="إرسال"><i data-lucide="send"></i></button></div>`;
                const l = document.getElementById('yrChatList');
                if (l) l.scrollTop = atBottom ? l.scrollHeight : clTop;
            }
            Object.keys(kept).forEach((id) => { const e = document.getElementById(id); if (e) e.value = kept[id]; });
            if (typing) { const e = document.getElementById(typing.id); if (e) { e.focus(); try { e.setSelectionRange(typing.s, typing.s); } catch (err) {} } }
            lucide.createIcons();
        },

        // light repaint every second: only my own bar in the people list
        _yrPaintNow(st) {
            const y = this._yr;
            if (!y || y.tab !== 'people' || !st || !st.d) return;
            const me = document.querySelector('.yr-p.me-row .yr-prog i');
            if (me) me.style.width = Math.min(100, st.t / st.d * 100) + '%';
        }
    });
})();
