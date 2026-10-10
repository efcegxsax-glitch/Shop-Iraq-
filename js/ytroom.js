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
    const MAX_MEMBERS = 12, RECENT_KEY = 'isp_yr_recent', DONE_AT = 0.95;
    // Points: EVERY seconds of real watching pays PER, finishing a video pays DONE_PTS, the
    // whole room finishing pays GROUP_PTS, at most DAY_CAP a day. "Real" = playing, screen on,
    // sound on, not skipped ahead, one tab only, not already counted for that video today,
    // and passing the random "tap the number" checks.
    const EVERY = 300, PER = 10, DONE_PTS = 15, GROUP_PTS = 10, DAY_CAP = 250, CHECK_MIN = 240, CHECK_MAX = 420, FREEZE = 20 * 60000;
    const TAB_ID = Math.random().toString(36).slice(2);
    const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const H = () => window.firebaseDbHelpers;
    const R = (p) => H().ref(window.firebaseDb, p);
    const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60), x = s % 60; return m + ':' + String(x).padStart(2, '0'); };
    const newId = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
    const thumb = (v) => 'https://i.ytimg.com/vi/' + v + '/mqdefault.jpg';
    const SPEEDS = [1, 1.25, 1.5, 2];
    // quick reactions everyone sees float over their own video
    const REACTS = { ok: ['thumbs-up', 'فهمت', '#16A34A'], imp: ['star', 'مهم', '#F59E0B'], hard: ['circle-help', 'صعب', '#E11D48'] };
    const NOTE_KIND = { q: ['hand', 'ما فهمت هنا', '#F59E0B'], hard: ['circle-help', 'صعب', '#E11D48'], imp: ['star', 'مهم', '#F59E0B'], ok: ['thumbs-up', 'فهمت', '#16A34A'], note: ['pencil-line', 'ملاحظة', '#2563EB'] };
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
        // the points rules, shared with the teachers' videos page (js/ytube.js)
        YR_EARN: { EVERY, PER, DONE_PTS, DAY_CAP, CHECK_MIN, CHECK_MAX, FREEZE },
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

        // "watch with a friend" from the teachers page: open the study room with this video already queued, then pick friends
        yrWatchWith(v, title) {
            this.goToYtRooms();
            let n = 0;
            const go = () => {
                if (typeof this.yrCreate === 'function' && document.getElementById('yrContent')) return this.yrCreate({ v, title });
                if (++n < 40) setTimeout(go, 150);
            };
            go();
        },

        async yrCreate(opts) {
            if (!this.authUid || !window.firebaseDb) { this.showToast('سجّل دخولك أول حتى تسوي غرفة'); return; }
            const btn = document.querySelector('.yr-card .yr-btn.wide');
            if (btn && btn.disabled) return;
            const title = filterBadWords(String(opts ? opts.title : document.getElementById('yrTitle')?.value || '').trim()).clean.slice(0, 40) || 'غرفة دراسة';
            const raw = String(opts ? opts.v : document.getElementById('yrFirst')?.value || '').trim(), first = this.extractYoutubeId(raw);
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
                        <small id="yrRailCoin" class="coin"></small>
                    </div>
                    <div id="yrMarks" class="yr-marks"></div>
                </div>
                <div class="yr-bar">
                    <div class="yr-size">${[['sm', 'picture-in-picture-2', 'صغير'], ['md', 'rectangle-horizontal', 'عادي'], ['land', 'rectangle-horizontal', 'بالعرض']].map(([k, ic, t]) => `<button data-s="${k}" class="${k === 'md' ? 'on' : ''}${k === 'land' ? ' land' : ''}" onclick="app.yrSize('${k}')"><i data-lucide="${ic}"></i>${t}</button>`).join('')}</div>
                    <button class="yr-q" onclick="app.yrMark()"><i data-lucide="hand"></i>ما فهمت هنا</button>
                </div>
                <div class="yr-reacts">
                    ${Object.keys(REACTS).map((k) => `<button style="--c:${REACTS[k][2]}" onclick="app.yrReact('${k}')"><i data-lucide="${REACTS[k][0]}"></i>${REACTS[k][1]}</button>`).join('')}
                    <button class="yr-speed-b yr-sp" onclick="app.yrSpeed()"><i data-lucide="gauge"></i><b class="yr-speed-t">1x</b></button>
                </div>
                <div id="yrEarn" class="yr-earn"></div>
                <div id="yrNow"></div>
                <div class="yr-tabs">${[['people', 'users', 'الطلاب'], ['list', 'list-video', 'الفيديوهات'], ['notes', 'pencil-line', 'ملاحظاتنا'], ['chat', 'message-circle', 'الدردشة']].map(([k, ic, t]) => `<button data-t="${k}" class="${k === 'people' ? 'on' : ''}" onclick="app.yrTab('${k}')"><i data-lucide="${ic}"></i>${t}<em id="yrBadge_${k}"></em></button>`).join('')}</div>
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
            // the room's saved marks and notes (صعب / مهم / فهمت / ما فهمت هنا / ملاحظة, each at a moment of a video): they stay with the room
            on('ytRooms/' + rid + '/notes', (v) => { y.notes = Object.keys(v || {}).map((id) => Object.assign({ id }, v[id])); this._yrPaint(); });
            on('ytRooms/' + rid + '/prog', (v) => { y.prog = v || {}; this._yrPaint(); });
            on('ytRooms/' + rid + '/done', (v) => { y.done = v || {}; this._yrPaint(); this._yrGroupBonus(); });
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
            clearTimeout(y.checkTimer);
            if (this._yrL) this._yrLedgerSave();
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
            y.key = k; y.lastState = -2; y.lastPos = null;
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
            try { return { t: p.getCurrentTime() || 0, d: p.getDuration() || 0, s: p.getPlayerState(), mute: (p.isMuted && p.isMuted()) || (p.getVolume && p.getVolume() === 0) }; } catch (e) { return null; }
        },

        _yrTick() {
            const y = this._yr, st = this._yrState();
            if (!y || !st) return;
            this._yrEarnTick(st);
            if (st.s === 1 && !document.hidden) {
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
            // the bonus only for a video of two minutes or more, most of it really watched
            // (recorded before the done mark goes out, so the room-wide bonus can see it)
            const L = this._yrLedger(), item = y.queue[k], seen = item ? (L.vids[item.v] || 0) : 0, tag = y.rid + '/' + k;
            const earned = st.d >= 120 && seen >= st.d * 0.7 && !L.done[tag];
            if (earned) { L.done[tag] = 1; y.legit = y.legit || {}; y.legit[k] = 1; this._yrPay(DONE_PTS, 'خلصت الفيديو'); }
            else this.showToast(st.d >= 120 && !L.done[tag] ? 'خلصت الفيديو. مكافأة الإكمال تحتاج تشوف أغلبه فعلاً' : 'خلصت الفيديو');
            H().set(R('ytRooms/' + y.rid + '/done/' + this.authUid + '/' + k), true).catch(() => {});
            setTimeout(() => this._yrGroupBonus(), 1500);
        },

        // ---------- points and the checks against cheating ----------
        _yrLedger() {
            const key = 'isp_yrp_' + (this.authUid || '');
            // kept in memory; storage is read once per account and day
            if (this._yrL && this._yrL.day === today() && this._yrLUid === this.authUid) return this._yrL;
            this._yrLUid = this.authUid;
            let L = null;
            try { L = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
            if (!L || L.day !== today()) L = { day: today(), earned: 0, vids: {}, fails: 0, frozen: L && L.frozen > Date.now() ? L.frozen : 0, done: {}, grp: {}, pend: 0 };
            this._yrL = L;
            return L;
        },
        _yrLedgerSave() { try { localStorage.setItem('isp_yrp_' + (this.authUid || ''), JSON.stringify(this._yrL)); } catch (e) {} },

        // why points are (or aren't) counting this second
        _yrEarnWhy(st) {
            const y = this._yr, L = this._yrLedger(), now = Date.now();
            if (!this.authUid) return 'سجّل دخولك حتى تنحسب نقاط';
            if (L.earned >= DAY_CAP) return 'وصلت حد نقاط اليوم (' + DAY_CAP + ')';
            if (L.frozen > now) return 'ما جاوبت التحقق، النقاط ترجع الساعة ' + (() => { const d = new Date(L.frozen), h = d.getHours() % 12 || 12; return h + ':' + String(d.getMinutes()).padStart(2, '0'); })();
            if (L.fails >= 2) return 'النقاط واكفة اليوم لأن ما جاوبت التحقق مرتين';
            if (!st || st.s !== 1) return 'شغّل الفيديو حتى تنحسب نقاط';
            if (document.hidden) return 'رجع للتطبيق حتى تنحسب نقاط';
            if (st.mute) return 'افتح الصوت حتى تنحسب نقاط';
            if (y.check) return 'جاوب التحقق';
            if (!y.lockOk) return 'أكو مشاهدة ثانية شغالة بحسابك، النقاط تنحسب لوحدة بس';
            const item = y.queue[y.key] || (y.adhoc && y.adhoc.k === y.key ? y.adhoc : null);
            if (item && st.d && (L.vids[item.v] || 0) >= st.d) return 'هذا الفيديو خلصت نقاطه اليوم';
            if (y.jumped) return 'قدّمت الفيديو، النقاط تنحسب على المشاهدة بس';
            return '';
        },

        _yrEarnTick(st) {
            const y = this._yr, L = this._yrLedger(), now = Date.now();
            // one tab or window of this account earns at a time
            let lock = null;
            try { lock = JSON.parse(localStorage.getItem('isp_yr_lock') || 'null'); } catch (e) {}
            y.lockOk = !lock || lock.id === TAB_ID || now - lock.at > 4000;
            if (y.lockOk && st && st.s === 1) try { localStorage.setItem('isp_yr_lock', JSON.stringify({ id: TAB_ID, at: now })); } catch (e) {}
            // skipping ahead: the position moved more than playing could move it
            const dt = y.lastTickAt ? (now - y.lastTickAt) / 1000 : 1, rate = y.rate || 1;
            y.jumped = !!(st && y.lastPos != null && st.s === 1 && st.t - y.lastPos > rate * dt + 2);
            y.lastPos = st ? st.t : null; y.lastTickAt = now;
            const why = this._yrEarnWhy(st);
            y.earnWhy = why;
            if (!why) {
                const item = y.queue[y.key] || (y.adhoc && y.adhoc.k === y.key ? y.adhoc : null);
                const sec = Math.min(rate, 2);
                if (item) L.vids[item.v] = (L.vids[item.v] || 0) + sec;
                L.pend = (L.pend || 0) + sec;
                y.sinceCheck = (y.sinceCheck || 0) + 1;
                if (!y.nextCheck) y.nextCheck = CHECK_MIN + Math.random() * (CHECK_MAX - CHECK_MIN);
                if (y.sinceCheck >= y.nextCheck) this._yrCheck();
                if (L.pend >= EVERY) { L.pend -= EVERY; this._yrPay(PER, 'مشاهدة 5 دقايق'); }
                if (now - (y.ledgerSaved || 0) > 5000) { y.ledgerSaved = now; this._yrLedgerSave(); }
            }
            this._yrEarnPaint();
        },

        _yrPay(n, why) {
            const L = this._yrLedger();
            n = Math.min(n, DAY_CAP - L.earned);
            if (n <= 0) return;
            L.earned += n;
            this._yrLedgerSave();
            this.addPointsAtomic(n).then((r) => {
                if (r == null) return;
                this.logDailyActivity({ points: n });
                this.showToast(why + ' (+' + n + ' نقطة)');
                const f = document.getElementById('yrFloat');
                if (f) { const el = document.createElement('span'); el.className = 'yr-coin'; el.textContent = '+' + n; f.appendChild(el); setTimeout(() => el.remove(), 2200); }
            }).catch(() => {});
            this._yrEarnPaint();
        },

        // "tap the number": shown over the video, 30 seconds to answer
        _yrCheck() {
            const y = this._yr, stage = document.getElementById('yrStage');
            if (!y || y.check || !stage) return;
            const want = 1 + Math.floor(Math.random() * 9);
            const opts = [want];
            while (opts.length < 4) { const n = 1 + Math.floor(Math.random() * 9); if (opts.indexOf(n) === -1) opts.push(n); }
            opts.sort(() => Math.random() - 0.5);
            const el = document.createElement('div');
            el.id = 'yrCheck';
            el.className = 'yr-check';
            el.innerHTML = `<div class="yr-check-c"><b>تأكيد إنك تشاهد</b><p>دوس على الرقم <strong>${want}</strong></p>
                <div class="yr-check-o">${opts.map((n) => `<button onclick="app._yrCheckAns(${n})">${n}</button>`).join('')}</div>
                <div class="yr-check-t"><i id="yrCheckBar"></i></div></div>`;
            stage.appendChild(el);
            y.check = { want, until: Date.now() + 30000 };
            y.checkTimer = setTimeout(() => this._yrCheckAns(-1), 30000);
            requestAnimationFrame(() => { const b = document.getElementById('yrCheckBar'); if (b) b.style.width = '0%'; });
        },
        _yrCheckAns(n) {
            const y = this._yr, L = this._yrLedger();
            if (!y || !y.check) return;
            clearTimeout(y.checkTimer);
            const ok = n === y.check.want;
            y.check = null;
            document.getElementById('yrCheck')?.remove();
            y.sinceCheck = 0;
            y.nextCheck = CHECK_MIN + Math.random() * (CHECK_MAX - CHECK_MIN);
            if (ok) { this.showToast('تمام، كمّل'); return; }
            // a missed check: the unpaid minutes are lost and points stop for a while
            L.pend = 0;
            L.fails = (L.fails || 0) + 1;
            L.frozen = Date.now() + FREEZE;
            this._yrLedgerSave();
            this.showToast(L.fails >= 2 ? 'ما جاوبت التحقق مرتين، النقاط واكفة لباجر' : 'ما جاوبت التحقق، النقاط واكفة 20 دقيقة');
            this._yrEarnPaint();
        },

        // the whole room finished the group video: a bonus to each one who really watched it
        _yrGroupBonus() {
            const y = this._yr, cur = y && y.meta && y.meta.cur;
            if (!cur || y.solo) return;
            const mids = Object.keys(y.members);
            if (mids.length < 2 || !mids.every((u) => (y.done[u] || {})[cur])) return;
            const L = this._yrLedger(), tag = y.rid + '/' + cur;
            if (L.grp[tag] || !(L.done[tag] || (y.legit && y.legit[cur]))) return;
            L.grp[tag] = 1;
            this._yrPay(GROUP_PTS, 'كلكم خلصتوا الفيديو، مكافأة الجماعة');
        },

        _yrEarnPaint() {
            const y = this._yr, box = document.getElementById('yrEarn'), L = this._yrL;
            if (!y || !box || !L) return;
            // built once; each second only the text and the bar change (keeps the icon)
            if (!box.firstChild) {
                box.innerHTML = '<span class="yr-earn-i"><i data-lucide="coins"></i></span><div><b></b><div class="yr-prog"><i></i></div></div><em><span dir="ltr"></span><small>/' + DAY_CAP + ' اليوم</small></em>';
                lucide.createIcons();
            }
            const why = y.earnWhy, pct = Math.min(100, (L.pend || 0) / EVERY * 100), left = Math.max(1, Math.ceil((EVERY - (L.pend || 0)) / 60));
            box.classList.toggle('off', !!why);
            box.querySelector('b').textContent = why || ('تنحسب نقاط . باقي ' + left + ' د للـ +' + PER);
            box.querySelector('.yr-prog i').style.width = pct + '%';
            box.querySelector('em span').textContent = '+' + L.earned;
            const rc = document.getElementById('yrRailCoin');
            if (rc) { rc.textContent = '+' + L.earned; rc.classList.toggle('off', !!why); }
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
            this._yrSave(r);
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
            const at = Date.now();
            this._yrPost('ما فهمت هنا', { k: y.key, s: Math.round(st.t), at });
            this._yrSave('q', '', at);
            this.showToast('وصلت علامتك للكل عند ' + clock(st.t));
        },

        // ---------- saved marks and notes ----------
        // ytRooms/{rid}/notes/{id} = { u, n, k (video key), v (video id), s (second), c (q | hard | imp | ok | note), x (text), at }
        _yrSave(c, x, at, sec) {
            const y = this._yr, st = this._yrState();
            if (!y || !this.authUid || !y.key || !st || !NOTE_KIND[c]) return null;
            const item = y.queue[y.key] || (y.adhoc && y.adhoc.k === y.key ? y.adhoc : null), u = this.currentUser || {};
            const rec = { u: this.authUid, n: String(u.fullName || 'طالب').slice(0, 40), k: String(y.key).slice(0, 20), s: Math.max(0, Math.round(sec != null ? sec : st.t)), c, at: at || Date.now() };
            if (item && /^[A-Za-z0-9_-]{11}$/.test(String(item.v || ''))) rec.v = item.v;
            if (x) rec.x = String(x).slice(0, 300);
            H().set(R('ytRooms/' + y.rid + '/notes/' + newId()), rec).catch(() => this.showToast('ما انحفظت العلامة، حاول مرة ثانية'));
            return rec;
        },

        // every saved mark and note of the room, in one list (the old "ما فهمت هنا" chat marks are included once)
        _yrMarks() {
            const y = this._yr;
            if (!y) return [];
            const notes = y.notes || [], have = new Set(notes.map((n) => n.u + ':' + n.at));
            const old = (y.chat || []).filter((c) => c.s != null && c.k && !have.has(c.u + ':' + c.at)).map((c) => ({ id: 'c' + c.id, u: c.u, n: c.n, k: c.k, s: c.s, c: 'q', at: c.at, legacy: true }));
            return notes.concat(old);
        },

        // the box on the notes tab: the moment is taken when the student starts typing, so the note goes where he was
        yrNoteFocus() {
            const y = this._yr, st = this._yrState();
            if (!y) return;
            if (y.noteAt == null && st && y.key) y.noteAt = { s: Math.round(st.t), key: y.key };
            const t = document.getElementById('yrNoteT');
            if (t && y.noteAt) t.textContent = 'الملاحظة تنحفظ عند ' + clock(y.noteAt.s);
        },

        yrNoteSave() {
            const y = this._yr, inp = document.getElementById('yrNote');
            if (!y || !inp) return;
            const x = filterBadWords(String(inp.value || '').trim()).clean.slice(0, 300);
            if (!x) return;
            if (!this._yrState() || !y.key) { this.showToast('شغّل الفيديو أول حتى تنحفظ الملاحظة عند وقتها'); return; }
            // typed on a moment that is not the video's current one any more: back to that second for the save
            const keep = y.noteAt && y.noteAt.key === y.key ? y.noteAt.s : null;
            const rec = this._yrSave('note', x, null, keep);
            if (!rec) return;
            inp.value = '';
            y.noteAt = null;
            this.showToast('انحفظت الملاحظة عند ' + clock(rec.s));
        },

        yrNoteGo(id) {
            const y = this._yr;
            if (!y) return;
            const n = this._yrMarks().find((m) => m.id === id);
            if (!n) return;
            if (n.k && (y.queue[n.k] || n.k === y.key)) { this.yrSeek(n.s, n.k); return; }
            // the video left the room's list: open it by its id and go to the moment
            if (n.v) { this.yrSolo(n.v, ''); setTimeout(() => this.yrSeek(n.s), 2000); return; }
            this.showToast('هذا الفيديو انشال من الغرفة');
        },

        yrNoteDel(id) {
            const y = this._yr;
            if (!y || !this.authUid) return;
            H().remove(R('ytRooms/' + y.rid + '/notes/' + id)).catch(() => this.showToast('ما انحذفت'));
        },

        yrNoteFilter(f) { const y = this._yr; if (!y) return; y.nf = f; this._yrPaint(); },

        _yrNotesHtml() {
            const y = this._yr, host = y.meta.host === this.authUid, f = y.nf || 'all';
            const all = this._yrMarks().filter((m) => f === 'all' || m.c === f);
            const order = Object.keys(y.queue).sort();
            const byKey = {};
            all.forEach((m) => { (byKey[m.k] = byKey[m.k] || []).push(m); });
            const keys = order.filter((k) => byKey[k]).concat(Object.keys(byKey).filter((k) => order.indexOf(k) < 0));
            const title = (k) => { const q = y.queue[k] || (y.adhoc && y.adhoc.k === k ? y.adhoc : null); return q && q.t ? q.t : (q ? 'فيديو يوتيوب' : 'فيديو انشال من الغرفة'); };
            const ago = (t) => { const d = Math.floor((Date.now() - (t || 0)) / 60000); return d < 1 ? 'هسه' : d < 60 ? 'قبل ' + d + ' دقيقة' : d < 1440 ? 'قبل ' + Math.floor(d / 60) + ' ساعة' : 'قبل ' + Math.floor(d / 1440) + ' يوم'; };
            const chips = [['all', 'الكل'], ['note', 'ملاحظات'], ['q', 'ما فهمت'], ['hard', 'صعب'], ['imp', 'مهم'], ['ok', 'فهمت']];
            return `<div class="yr-nw">
                    <div class="yr-nw-t" id="yrNoteT">اكتب ملاحظة، تنحفظ عند الدقيقة اللي دا تشوفها</div>
                    <div class="yr-send"><input id="yrNote" maxlength="300" placeholder="اكتب ملاحظة عن هذي اللحظة..." onfocus="app.yrNoteFocus()" onkeydown="if(event.key==='Enter')app.yrNoteSave()"><button onclick="app.yrNoteSave()" aria-label="احفظ"><i data-lucide="save"></i></button></div>
                </div>
                <div class="yr-nf">${chips.map(([k, t]) => `<button class="${k === f ? 'on' : ''}" onclick="app.yrNoteFilter('${k}')">${t}</button>`).join('')}</div>
                ${keys.length ? keys.map((k) => `<div class="yr-ng"><div class="yr-ng-h">${esc(title(k))}<small>${byKey[k].length}</small></div>${byKey[k].sort((a, b) => (a.s || 0) - (b.s || 0)).map((m) => {
                    const d = NOTE_KIND[m.c] || NOTE_KIND.note, mine = m.u === this.authUid;
                    return `<div class="yr-note" style="--c:${d[2]}">
                        <button class="yr-note-go" onclick="app.yrNoteGo(${jsArg(m.id)})" aria-label="روح لهذي اللحظة"><i data-lucide="${d[0]}"></i><b>${clock(m.s)}</b></button>
                        <div class="yr-note-b"><b>${d[1]}</b><em>${esc(m.n)}${mine ? ' (أنت)' : ''}</em>${m.x ? `<p>${esc(m.x)}</p>` : ''}<small>${ago(m.at)}</small></div>
                        ${(mine || host) && !m.legacy ? `<button class="yr-x" onclick="app.yrNoteDel(${jsArg(m.id)})" aria-label="احذف"><i data-lucide="trash-2"></i></button>` : ''}
                    </div>`;
                }).join('')}</div>`).join('') : '<p class="yr-muted">ما كو علامات بعد. دوس "صعب" أو "مهم" أو "ما فهمت هنا" وانت تشوف، أو اكتب ملاحظة. تنحفظ بوقتها، وتجي لها بدوسة.</p>'}`;
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
            const ae = document.activeElement, typing = ae && (ae.id === 'yrMsg' || ae.id === 'yrQ' || ae.id === 'yrNote') ? { id: ae.id, s: ae.selectionStart } : null;
            const kept = {};
            ['yrMsg', 'yrQ', 'yrNote'].forEach((id) => { const e = document.getElementById(id); if (e && e.value) kept[id] = e.value; });
            const cl = document.getElementById('yrChatList'), clTop = cl ? cl.scrollTop : 0, atBottom = !cl || cl.scrollHeight - cl.scrollTop - cl.clientHeight < 40;
            const host = y.meta.host === this.authUid, cur = y.meta.cur, keys = Object.keys(y.queue).sort();
            const mids = Object.keys(y.members).sort((a, b) => (a === y.meta.host ? -1 : b === y.meta.host ? 1 : (y.members[a].j || 0) - (y.members[b].j || 0)));
            const doneN = cur ? mids.filter((u) => (y.done[u] || {})[cur]).length : 0;
            const rn = document.getElementById('yrRailN');
            if (rn) rn.textContent = cur ? doneN + '/' + mids.length : '';
            const sub = document.getElementById('yrSubTx');
            if (sub) sub.textContent = mids.length + ' طلاب' + (keys.length ? ' . ' + keys.length + ' فيديو' : '');
            ['list', 'notes', 'chat', 'people'].forEach((t) => { const b = document.getElementById('yrBadge_' + t); if (b) b.textContent = t === 'chat' && y.unread ? y.unread : ''; });

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
            if (marks) marks.innerHTML = d ? this._yrMarks().filter((c) => c.k === y.key && c.s != null).map((c) => `<button style="left:${Math.min(100, c.s / d * 100)}%" title="${esc(c.n)} ${clock(c.s)}" onclick="app.yrSeek(${Number(c.s) || 0})"></button>`).join('') : '';

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
            } else if (y.tab === 'notes') {
                panel.innerHTML = this._yrNotesHtml();
            } else {
                const list = y.chat.slice(-60);
                panel.innerHTML = `<div id="yrChatList" class="yr-chat">${list.length ? list.map((c) => {
                    const mine = c.u === this.authUid, q = y.queue[c.k];
                    return `<div class="yr-msg${mine ? ' mine' : ''}${c.s != null ? ' mark' : ''}">
                        ${mine ? '' : `<small>${esc(c.n)}${app.rpBtn({ type: 'room', targetUid: c.u, ref: 'ytRooms/' + y.rid + '/chat/' + c.id, snippet: c.m }, 'yr-rp', '')}</small>`}
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
