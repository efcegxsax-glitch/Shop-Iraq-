// The private chat thread (one to one): fast and steady, in the way of the modern messengers.
//  - layout: the thread is a fixed full screen column (header, scrolling messages, input) sized to the visible
//    area, so the keyboard never makes the page jump; the last message stays in view and the place you were reading
//    is kept when the keyboard opens or closes;
//  - messages are drawn by id (only what changed is touched), long chats come in pages, pictures reserve their
//    space and open full screen with pinch zoom;
//  - sending is optimistic and idempotent: every message has its own id, shows "sending / sent / read / failed",
//    can be retried without ever being doubled, survives a weak network and an app restart (outbox);
//  - "typing..." and "recording..." are shown live (chatTyping/{chat}/{uid});
//  - replies keep a reference to the original (rep: {i, f, t, x}) and jump back to it;
//  - clearing a conversation is permanent for the one who cleared it: userChats entry removed, a clear mark
//    (privateChats/{chat}/cleared/{me}, also kept on the phone) hides everything older, and old messages are purged
//    from the database once both have cleared them;
//  - the other end's name and photo, the read state and the connection are listened to only while the chat is open.
// Database (see tools/rules.py): privateChats/{chat}/{messages, deletedFor, readReceipts, cleared}, chatTyping/{chat}/{uid},
// userChats/{uid}/{other}. Loaded on demand by app._need('chat').
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const H = () => window.firebaseDbHelpers, DB = () => window.firebaseDb;
    const R = (p) => (p ? H().ref(DB(), p) : H().ref(DB()));
    const me = () => app.authUid;
    const PAGE = 60, STICK = 90, SWIPE = 62, HOLD_MS = 420, STUCK_MS = 12000, TYPE_EVERY = 2500, TYPE_IDLE = 3500, TYPE_STALE = 7500, MAX_VOICE = 120;
    const TICK1 = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    const TICK2 = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 7 7 18l-5-5"/><path d="m22 7-11 11"/></svg>';
    const CLOCK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    const WARN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>';
    const ICON = { text: '', image: 'صورة', voice: 'رسالة صوتية', file: 'ملف', call: 'مكالمة صوتية' };

    let T = null;          // the open conversation
    let svOff = 0, svUn = null;
    let lastId = 0;
    const now = () => Date.now() + svOff;
    const nextId = () => { lastId = Math.max(now(), lastId + 1); return lastId; };
    const chatIdOf = (a, b) => [a, b].sort().join('_');
    const fmtClock = (t) => { const d = new Date(t || 0), h = d.getHours() % 12 || 12; return h + ':' + String(d.getMinutes()).padStart(2, '0') + (d.getHours() < 12 ? ' ص' : ' م'); };
    const dayKey = (t) => { const d = new Date(t || 0); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
    function dayLabel(t) {
        const d = new Date(t || 0), n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1);
        if (dayKey(d) === dayKey(n)) return 'اليوم';
        if (dayKey(d) === dayKey(y)) return 'أمس';
        const names = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        if (n - d < 6 * 86400000) return names[d.getDay()];
        return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
    }
    const snippet = (m) => { const t = m.type || 'text'; return t === 'text' ? String(m.text || '').slice(0, 90) : t === 'file' ? 'ملف: ' + String(m.fileName || 'PDF').slice(0, 60) : ICON[t] || 'رسالة'; };
    const preview = (m) => { const t = m.type || 'text'; return t === 'text' ? String(m.text || '').slice(0, 120) : t === 'file' ? 'ملف: ' + String(m.fileName || 'PDF') : ICON[t] || 'مرفق'; };
    const keyCC = (uid) => 'isp:cc:' + me() + ':' + uid;
    const keyOB = () => 'isp:cob:' + me();

    // ---------- outbox: unsent messages are kept on the phone until the server confirms them ----------
    function obLoad() { try { const v = JSON.parse(localStorage.getItem(keyOB()) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
    function obSave(list) { try { localStorage.setItem(keyOB(), JSON.stringify(list.slice(-25))); } catch (e) {} }
    function obAdd(entry) { if (JSON.stringify(entry).length > 180000) return; const l = obLoad().filter((x) => x.id !== entry.id); l.push(entry); obSave(l); }
    function obDel(id) { obSave(obLoad().filter((x) => x.id !== id)); }

    // ---------- opening and closing ----------
    function open(otherUid, otherName, otherAvatar, otherStudentNumber) {
        if (!app.isLoggedIn || !app.currentUser) { app.showToast('يجب تسجيل الدخول لاستخدام الرسائل'); app.goToAuth('login'); return; }
        if (app.isBlocked(otherUid)) { app.showToast('هذا المستخدم محظور — ألغِ الحظر أولاً من قائمة الأصدقاء'); return; }
        if (!otherUid || otherUid === me()) return;
        if (!otherName) {
            const ex = (typeof userChatsList !== 'undefined' ? userChatsList : []).find((c) => c.otherUid === otherUid) || (typeof friendsList !== 'undefined' ? friendsList : []).find((f) => f.uid === otherUid);
            if (ex) { otherName = ex.otherName || ex.name; otherAvatar = ex.otherAvatar || ex.avatar; otherStudentNumber = ex.otherStudentNumber || ex.studentNumber; }
        }
        teardown();
        const chat = chatIdOf(me(), otherUid);
        T = {
            uid: otherUid, chat, limit: PAGE, raw: {}, rawCount: 0, list: [], nodes: new Map(), out: {}, un: [], timers: {},
            clearAt: 0, deletedFor: {}, readAt: 0, peerTyping: null, typeKind: '', typeAt: 0, stick: true, lastH: 0, firstDone: false, unseen: 0,
            replyTo: null, blockedByOther: false, conn: true, loaded: false, newPill: 0,
        };
        try { T.clearAt = Number(localStorage.getItem(keyCC(otherUid))) || 0; } catch (e) {}
        app.currentChatUid = otherUid;
        app.currentChatOther = { name: otherName || 'طالب', avatar: otherAvatar || '', studentNumber: otherStudentNumber || '', known: !!otherName };
        if (!otherName || !otherAvatar) resolvePeer(otherUid);
        app._chatOpenAt = Date.now();
        app.switchView('chatThreadView');
        paintHead();
        const inp = $('chatMessageInput'); if (inp) { inp.value = ''; autosize(); }
        replyBar();
        updateSendMode();
        const list = $('chatMessagesList'); if (list) { list.innerHTML = '<div class="ct-skel"><i></i><i></i><i></i></div>'; }
        bindUi();
        applyBg();
        listen();
        document.body.classList.add('ct-open');
        try { lucide.createIcons(); } catch (e) {}
        // the call part and its relay addresses get ready while the chat is open
        app._need('calls').then(() => app._clIce()).catch(() => {});
        // the study owl counts chat time and may pause the conversation (js/mascot.js)
        if (typeof app.mcChatEnter === 'function') app.mcChatEnter();
        else if (!(app.siteConfig && app.siteConfig.features && app.siteConfig.features.mascot === false)) app._need('mascot').then(() => app.mcChatEnter && app.mcChatEnter()).catch(() => {});
    }

    function teardown() {
        if (!T) return;
        const t = T; T = null;
        typing(null, t);
        Object.keys(t.timers).forEach((k) => { clearTimeout(t.timers[k]); clearInterval(t.timers[k]); });
        t.un.forEach((u) => { try { u(); } catch (e) {} });
        if (t.ro) { try { t.ro.disconnect(); } catch (e) {} }
        if (t.vvOff) t.vvOff();
        if (t.uiOff) t.uiOff();
        stopVoice(false);
        closeSheet();
        document.body.classList.remove('ct-open', 'ct-kb');
        document.documentElement.style.removeProperty('--ct-h'); document.documentElement.style.removeProperty('--ct-top');
        $('chatNewPill')?.remove();
    }

    // ---------- listening ----------
    function listen() {
        const t = T, chat = t.chat, other = t.uid;
        const on = (path, cb, q) => { const u = H().onValue(q || R(path), cb, () => {}); t.un.push(u); return u; };
        // the server clock, so ids and "read" times agree between the two phones
        if (!svUn) svUn = H().onValue(R('.info/serverTimeOffset'), (s) => { svOff = Number(s.val()) || 0; }, () => {});
        // the clear mark: the phone's copy first (works offline), then the server's
        Promise.all([H().get(R('chatClearedAt/' + me() + '/' + other)).catch(() => null), H().get(R('privateChats/' + chat + '/cleared/' + me())).catch(() => null)]).then(([a, b]) => {
            if (T !== t) return;
            const v = Math.max(Number(a && a.val()) || 0, Number(b && b.val()) || 0);
            if (v > t.clearAt) { t.clearAt = v; try { localStorage.setItem(keyCC(other), String(v)); } catch (e) {} reconcile(); }
            purgeOld();
        });
        H().get(R('blockedUsers/' + other + '/' + me())).then((s) => { if (T !== t) return; t.blockedByOther = s.exists(); if (t.blockedByOther) app.showToast('هذا المستخدم قيّد التواصل معك'); }).catch(() => {});
        on('privateChats/' + chat + '/deletedFor/' + me(), (s) => { t.deletedFor = s.val() || {}; reconcile(); });
        on('privateChats/' + chat + '/readReceipts/' + other, (s) => { t.readAt = Number(s.val()) || 0; ticks(); });
        on('chatTyping/' + chat + '/' + other, (s) => peerTyping(s.val()));
        on('.info/connected', (s) => { const c = s.val() === true; t.conn = c; netBanner(); if (c) resendPending(); });
        listenMsgs();
        const onNet = () => { netBanner(); if (navigator.onLine) resendPending(); };
        window.addEventListener('online', onNet); window.addEventListener('offline', onNet);
        const onVis = () => { if (document.hidden) typing(null); else { markRead(); } };
        document.addEventListener('visibilitychange', onVis);
        t.uiOff = () => { window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet); document.removeEventListener('visibilitychange', onVis); };
        app._presenceSync && app._presenceSync();
    }

    function listenMsgs() {
        const t = T; if (!t) return;
        if (t.msgUn) { try { t.msgUn(); } catch (e) {} t.un = t.un.filter((u) => u !== t.msgUn); }
        const { query, orderByKey, limitToLast } = H();
        t.msgUn = H().onValue(query(R('privateChats/' + t.chat + '/messages'), orderByKey(), limitToLast(t.limit)), (snap) => {
            if (T !== t) return;
            const prevIds = new Set(Object.keys(t.raw));
            t.raw = snap.val() || {};
            t.rawCount = Object.keys(t.raw).length;
            t.loaded = true;
            // a new message from the other one: they stopped typing, and the chat is being read
            let incoming = false;
            Object.keys(t.raw).forEach((k) => { if (!prevIds.has(k) && t.firstDone && t.raw[k] && t.raw[k].from !== me()) incoming = true; });
            if (incoming) { t.peerTyping = null; paintHead(); typingRow(); }
            reconcile();
            if (!document.hidden && app.currentView === 'chatThreadView') { if (!t.firstDone || incoming) markReadSoon(); }
            t.firstDone = true;
            resendPending();
        }, () => {});
        t.un.push(t.msgUn);
    }

    async function resolvePeer(uid) {
        try {
            if (!DB()) return;
            const [p, lb] = await Promise.all([H().get(R('pub/' + uid)), H().get(R('leaderboard/' + uid))]);
            if (!T || T.uid !== uid) return;
            const pub = p.val() || {}, board = lb.val() || {}, o = app.currentChatOther || (app.currentChatOther = {});
            if (pub.n && (!o.known || !o.name || o.name === 'طالب')) { o.name = String(pub.n); o.known = true; }
            if (!o.avatar && board.avatar) o.avatar = board.avatar;
            if (!o.studentNumber && pub.s) o.studentNumber = String(pub.s);
            paintHead();
        } catch (e) { /* the chat works with the placeholder name */ }
    }

    // ---------- header: name, photo, and the status line (typing > offline > last seen) ----------
    function paintHead() {
        if (!T) return;
        const o = app.currentChatOther || {};
        const n = $('chatThreadName'), a = $('chatThreadAvatar');
        if (n) n.innerHTML = esc(o.name) + app.vb(T.uid);
        if (a) { const src = personAvatarSrc(o.avatar, o.name); if (a.getAttribute('src') !== src) a.src = src; }
        const p = $('chatThreadPresence');
        if (p) {
            const pt = T.peerTyping;
            if (pt) { p.innerHTML = (pt === 'r' ? 'يسجل رسالة صوتية' : 'يكتب') + '<span class="ct-dots"><i></i><i></i><i></i></span>'; p.className = 'ct-pres typing'; }
            else { p.textContent = app.presenceLabel(T.uid); p.className = 'ct-pres'; }
        }
    }
    function peerTyping(v) {
        if (!T) return;
        const active = v && v.s && (now() - (Number(v.at) || 0) < TYPE_STALE) ? v.s : null;
        clearTimeout(T.timers.pt);
        T.peerTyping = active;
        if (active) T.timers.pt = setTimeout(() => { if (T) { T.peerTyping = null; paintHead(); typingRow(); } }, TYPE_STALE);
        paintHead(); typingRow();
    }
    function typingRow() {
        const r = $('chatTypingRow'); if (!r || !T) return;
        const k = T.peerTyping;
        r.classList.toggle('hidden', !k);
        if (k) r.innerHTML = k === 'r' ? '<div class="ct-tb rec"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><span class="ct-dots"><i></i><i></i><i></i></span></div>' : '<div class="ct-tb"><span class="ct-dots"><i></i><i></i><i></i></span></div>';
    }
    function netBanner() {
        const b = $('chatNet'); if (!b || !T) return;
        const off = navigator.onLine === false || T.conn === false;
        clearTimeout(T.timers.nb);
        if (!off) { b.classList.add('hidden'); return; }
        T.timers.nb = setTimeout(() => { if (T && (navigator.onLine === false || T.conn === false)) { b.textContent = 'ماكو اتصال بالنت. رسائلك تنحفظ وتنرسل أول ما يرجع'; b.classList.remove('hidden'); } }, 1500);
    }

    // ---------- the list: only what changed is touched ----------
    const visible = (m) => (!T.clearAt || (m.createdAt || m.id || 0) > T.clearAt) && !T.deletedFor[m.id];
    function merged() {
        const arr = [];
        Object.keys(T.raw).forEach((k) => { const m = T.raw[k]; if (m && Number.isFinite(Number(m.id || k))) { if (m.id == null) m.id = Number(k); arr.push(typeof m.id === 'number' ? m : Object.assign({}, m, { id: Number(m.id) })); } });
        // messages still on their way (or failed): shown from the phone's copy
        Object.keys(T.out).forEach((k) => { const o = T.out[k]; if (!T.raw[k]) arr.push(o.payload); });
        return arr.filter(visible).sort((a, b) => a.id - b.id);
    }
    function stateOf(m) { const o = T.out[m.id]; return o ? (o.st === 'failed' || o.st === 'stuck' ? 'failed' : 'sending') : 'ok'; }
    function sig(m, prev) {
        return [m.id, m.type || '', m.text || '', m.edited ? 1 : 0, stateOf(m), prev && prev.from === m.from && dayKey(prev.createdAt) === dayKey(m.createdAt) ? 1 : 0,
            !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt) ? dayLabel(m.createdAt) : '', m.rep ? m.rep.i + ':' + m.rep.x : '', m.dur || '', m.st || ''].join('|');
    }
    function reconcile() {
        if (!T) return;
        const list = $('chatMessagesList'), sc = $('chatScroller'); if (!list || !sc) return;
        const msgs = merged();
        if (!T.loaded && !msgs.length) return;           // still the skeleton
        const first = !T.rendered;
        if (first) { list.innerHTML = ''; T.nodes.clear(); T.rendered = true; }
        const oldH = sc.scrollHeight, oldTop = sc.scrollTop, wasStick = T.stick;
        const ids = new Set(msgs.map((m) => m.id));
        let topInsert = false, appended = 0, mineLast = false;
        T.nodes.forEach((n, id) => { if (!ids.has(id)) { n.el.remove(); T.nodes.delete(id); } });
        let prevEl = null;
        msgs.forEach((m, i) => {
            const prev = msgs[i - 1], s = sig(m, prev), n = T.nodes.get(m.id);
            if (!n) {
                const el = build(m, prev);
                if (prevEl) prevEl.after(el); else list.prepend(el);
                T.nodes.set(m.id, { el, sig: s });
                if (!prevEl && !first) topInsert = true;
                if (!first && !topInsert) { appended++; if (m.from === me()) mineLast = true; }
                prevEl = el;
            } else {
                if (n.sig !== s) { const el = build(m, prev); n.el.replaceWith(el); n.el = el; n.sig = s; }
                prevEl = n.el;
            }
        });
        // the first of the list may have changed its day separator after older messages came in
        T.list = msgs;
        const more = $('chatOlder'); if (more) more.classList.toggle('hidden', !(T.rawCount >= T.limit && msgs.length && (msgs[0].createdAt || 0) > T.clearAt));
        const empty = $('chatEmpty');
        if (!msgs.length) { if (!empty) list.insertAdjacentHTML('afterbegin', '<p id="chatEmpty" class="ct-empty">ابدأ المحادثة بإرسال أول رسالة</p>'); } else if (empty) empty.remove();
        ticks();
        if (first) { toBottom(false); [120, 400, 1000].forEach((ms) => setTimeout(() => { if (T && T.stick) toBottom(false); }, ms)); }
        else if (topInsert) sc.scrollTop = oldTop + (sc.scrollHeight - oldH);      // older messages came in above: keep the place
        else if (appended) { if (wasStick || mineLast) requestAnimationFrame(() => toBottom(true)); else { T.newPill += appended; pill(); } }
    }

    function quoteHtml(m) {
        const r = m.rep; if (!r) return '';
        const who = r.f === me() ? 'أنت' : (app.currentChatOther && app.currentChatOther.name) || 'طالب';
        const ic = r.t === 'image' ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/></svg>' : r.t === 'voice' ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/></svg>' : '';
        return `<div class="cm-quote" onclick="event.stopPropagation(); app.chatJump(${jsNum(r.i)})"><b>${esc(who)}</b><span>${ic}${esc(r.x || ICON[r.t] || 'رسالة')}</span></div>`;
    }

    function bodyHtml(m, mine) {
        if (m.type === 'image') {
            const w = numOr0(m.w), h = numOr0(m.h), ar = w && h ? w + ' / ' + h : '4 / 3';
            return `<img class="ct-img ld" src="${safeImage(m.imageUrl)}" alt="صورة" style="aspect-ratio:${ar}" decoding="async" ${w ? 'width="' + w + '" height="' + h + '"' : ''} onload="this.classList.remove('ld')" onerror="this.classList.remove('ld'); this.classList.add('bad')" onclick="event.stopPropagation(); app.openChatImage(${jsNum(m.id)})">`;
        }
        if (m.type === 'voice') {
            const total = Math.max(0, Math.round(m.duration || 0)), mm = Math.floor(total / 60), ss = String(total % 60).padStart(2, '0');
            return `<div class="flex items-center gap-2" style="min-width: 190px;">
                    <button id="voicePlayBtn-${m.id}" onclick="event.stopPropagation(); app.toggleVoicePlayback(${jsNum(m.id)})" class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style="background: rgba(127,127,127,0.25);"><i data-lucide="play" class="w-4 h-4"></i></button>
                    <div class="flex-1 h-1 rounded-full overflow-hidden" style="background: rgba(127,127,127,0.3);"><div id="voiceProgress-${m.id}" class="h-1 rounded-full" style="width: 0%; background: currentColor;"></div></div>
                    <span id="voiceDuration-${m.id}" class="text-[10px] opacity-70 flex-shrink-0" data-total="${total}">${mm}:${ss}</span>
                    <button id="voiceSpeedBtn-${m.id}" onclick="event.stopPropagation(); app.cycleVoiceSpeed(${jsNum(m.id)})" class="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style="background: rgba(127,127,127,0.25);">1x</button>
                    <audio id="voiceAudio-${m.id}" data-duration="${total}" src="${esc(safeAudioUrl(m.audioUrl))}" class="hidden voice-message-audio" preload="none" onplay="app.onVoicePlay(${jsNum(m.id)})" onpause="app.onVoicePause(${jsNum(m.id)})" onended="app.onVoiceEnded(${jsNum(m.id)})" ontimeupdate="app.onVoiceTimeUpdate(${jsNum(m.id)})" onerror="app.onVoiceError(${jsNum(m.id)})"></audio>
                </div>`;
        }
        if (m.type === 'call') {
            const ok = m.st === 'done', iCalled = (m.caller || m.from) === me(), d = Math.max(0, Math.round(numOr0(m.dur)));
            const lbl = ok ? 'مكالمة صوتية' : iCalled ? ({ no: 'رفض المكالمة', busy: 'كان مشغول', cancel: 'مكالمة ملغية' }[m.st] || 'ما رد') : 'مكالمة فائتة';
            const sub = ok ? (d >= 3600 ? Math.floor(d / 3600) + ':' + String(Math.floor(d / 60) % 60).padStart(2, '0') : Math.floor(d / 60)) + ':' + String(d % 60).padStart(2, '0') : 'اضغط حتى ترجع تتصل';
            return `<div class="chat-call ${ok ? '' : 'missed'}" onclick="event.stopPropagation(); app.goCall()"><span class="chat-call-ic"><i data-lucide="${ok ? (iCalled ? 'phone-outgoing' : 'phone-incoming') : 'phone-missed'}" class="w-4 h-4"></i></span><span class="min-w-0"><span class="block text-xs font-bold">${lbl}</span><span class="block text-[10px] opacity-75" dir="${ok ? 'ltr' : 'rtl'}">${sub}</span></span></div>`;
        }
        if (m.type === 'file') {
            return `<a href="${esc(safeFileUrl(m.fileUrl) || '#')}" download="${esc(m.fileName || 'file.pdf')}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="flex items-center gap-2" style="color: inherit; text-decoration: none;"><div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(127,127,127,0.15);"><i data-lucide="file-text" class="w-5 h-5"></i></div><div class="min-w-0"><div class="text-xs font-bold truncate">${esc(m.fileName || 'ملف')}</div><div class="text-[10px] opacity-70">${(numOr0(m.fileSize) / 1024 / 1024).toFixed(1)} MB</div></div></a>`;
        }
        return `<span class="cm-text">${esc(m.text)}</span>`;
    }

    function build(m, prev) {
        const mine = m.from === me(), grouped = !!prev && prev.from === m.from && dayKey(prev.createdAt) === dayKey(m.createdAt), st = stateOf(m);
        const isText = !m.type || m.type === 'text';
        let sep = '';
        if (!prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)) sep = `<div class="cm-day"><span>${dayLabel(m.createdAt)}</span></div>`;
        const stIcon = !mine ? '' : st === 'sending' ? `<span class="cm-st sending">${CLOCK}</span>` : st === 'failed' ? `<span class="cm-st failed">${WARN}</span>` : `<span class="cm-tick" data-at="${numOr0(m.createdAt)}">${TICK1}${TICK2}</span>`;
        const meta = `<span class="cm-meta${m.type === 'image' ? ' cm-meta-img' : isText ? '' : ' cm-meta-blk'}">${m.edited && isText ? '<span>معدّلة</span>' : ''}<span>${fmtClock(m.createdAt || m.id)}</span>${stIcon}</span>`;
        const cls = `cm-bubble max-w-[80%] ${m.type === 'image' ? 'p-1' : 'px-3.5 pt-2 pb-1.5'} text-sm leading-relaxed cursor-pointer shadow-sm ${mine ? 'bg-primary text-white rounded-2xl' : 'theme-transition rounded-2xl'} ${grouped ? '' : mine ? 'rounded-ee-md' : 'rounded-es-md'}`;
        const el = document.createElement('div');
        el.className = 'cm-w'; el.dataset.mid = m.id; el.dataset.st = st;
        el.innerHTML = `${sep}<div class="cm-row flex flex-col ${mine ? 'items-end' : 'items-start'} ${grouped ? '' : 'mt-1.5'}"><div class="${cls}" data-mid="${m.id}" style="${!mine ? 'background-color: var(--surface); border: 1px solid var(--border); color: var(--text);' : ''}">${quoteHtml(m)}${bodyHtml(m, mine)}${meta}</div>${st === 'failed' ? `<div class="cm-fail"><button onclick="app.retryChatMsg(${jsNum(m.id)})">إعادة الإرسال</button><button onclick="app.cancelChatMsg(${jsNum(m.id)})">حذف</button></div>` : ''}</div>`;
        try { if (window.lucide) lucide.createIcons({ nameAttr: 'data-lucide', attrs: {}, root: el }); } catch (e) { try { lucide.createIcons(); } catch (e2) {} }
        return el;
    }
    function ticks() {
        if (!T) return;
        const at = T.readAt || 0;
        document.querySelectorAll('#chatMessagesList .cm-tick').forEach((el) => el.classList.toggle('read', at >= Number(el.dataset.at || 0)));
    }

    // ---------- scrolling ----------
    const nearBottom = () => { const sc = $('chatScroller'); return !sc || sc.scrollHeight - (sc.scrollTop + sc.clientHeight) < STICK; };
    function toBottom(smooth) {
        const sc = $('chatScroller'); if (!sc) return;
        sc.scrollTo({ top: sc.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
        if (T) { T.stick = true; T.newPill = 0; } pill();
    }
    function pill() {
        const b = $('chatDownBtn'); if (!b || !T) return;
        const show = !T.stick || T.newPill > 0;
        b.classList.toggle('hidden', !show);
        b.querySelector('b').textContent = T.newPill > 0 ? T.newPill : '';
    }
    function bindUi() {
        const t = T, sc = $('chatScroller'), list = $('chatMessagesList'); if (!sc || !list) return;
        t.lastH = sc.clientHeight;
        const onScroll = () => { if (T !== t) return; t.stick = nearBottom(); if (t.stick) { t.newPill = 0; if (!document.hidden) markReadSoon(); } pill(); };
        sc.addEventListener('scroll', onScroll, { passive: true });
        // anything that changes the size of the thread keeps the bottom, or the place you were reading
        if (window.ResizeObserver) {
            t.ro = new ResizeObserver(() => {
                if (T !== t) return;
                const h = sc.clientHeight;
                if (h !== t.lastH) { const d = t.lastH - h; t.lastH = h; if (t.stick) sc.scrollTop = sc.scrollHeight; else sc.scrollTop += d; }
                else if (t.stick) sc.scrollTop = sc.scrollHeight;
            });
            t.ro.observe(sc); t.ro.observe(list);
        }
        // the visible area (the keyboard shrinks it): the column is sized to it
        const vv = window.visualViewport, root = document.documentElement;
        const fit = () => {
            if (T !== t) return;
            const h = vv ? vv.height : window.innerHeight, top = vv ? vv.offsetTop : 0;
            root.style.setProperty('--ct-h', Math.round(h) + 'px'); root.style.setProperty('--ct-top', Math.round(top) + 'px');
            document.body.classList.toggle('ct-kb', window.innerHeight - h > 120);
        };
        fit();
        if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); t.vvOff = () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }; }
        else { window.addEventListener('resize', fit); t.vvOff = () => window.removeEventListener('resize', fit); }
        // long press, swipe to reply, and taps on the list
        list.addEventListener('pointerdown', gDown); list.addEventListener('pointermove', gMove); list.addEventListener('pointerup', gUp); list.addEventListener('pointercancel', gCancel);
        list.addEventListener('contextmenu', (e) => { if (e.target.closest('.cm-bubble')) e.preventDefault(); });
        const prevUi = t.uiOff;
        t.uiOff = () => { try { prevUi && prevUi(); } catch (e) {} sc.removeEventListener('scroll', onScroll); list.removeEventListener('pointerdown', gDown); list.removeEventListener('pointermove', gMove); list.removeEventListener('pointerup', gUp); list.removeEventListener('pointercancel', gCancel); };
        // the other end's typing/recording status goes with the text box
        const inp = $('chatMessageInput');
        if (inp) { inp.oninput = onInput; inp.onkeydown = onKey; inp.onfocus = () => { if (T && T.stick) setTimeout(() => toBottom(false), 250); }; }
    }

    // ---------- gestures on a message ----------
    let G = null;
    function gDown(e) {
        const b = e.target.closest('.cm-bubble'); if (!b || e.target.closest('button, a, audio, .cm-quote, .chat-call')) return;
        G = { id: Number(b.dataset.mid), x: e.clientX, y: e.clientY, b, swiping: false, done: false, row: b.closest('.cm-row') };
        G.timer = setTimeout(() => { if (G && !G.swiping) { G.done = true; if (navigator.vibrate) { try { navigator.vibrate(18); } catch (er) {} } actions(G.id); } }, HOLD_MS);
    }
    function gMove(e) {
        if (!G || G.done) return;
        const dx = e.clientX - G.x, dy = e.clientY - G.y;
        if (!G.swiping) { if (Math.abs(dy) > 12) { clearTimeout(G.timer); G = null; return; } if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) { G.swiping = true; clearTimeout(G.timer); try { G.row.setPointerCapture && G.row.setPointerCapture(e.pointerId); } catch (er) {} } else return; }
        const c = Math.max(-SWIPE - 14, Math.min(SWIPE + 14, dx));
        G.row.style.transform = 'translateX(' + c + 'px)'; G.row.style.transition = 'none';
        G.row.classList.toggle('cm-armed', Math.abs(dx) >= SWIPE);
        if (Math.abs(dx) >= SWIPE && !G.vib) { G.vib = true; if (navigator.vibrate) { try { navigator.vibrate(12); } catch (er) {} } }
    }
    function gUp(e) {
        if (!G) return;
        clearTimeout(G.timer);
        const g = G; G = null;
        g.row.style.transition = 'transform .18s'; g.row.style.transform = ''; g.row.classList.remove('cm-armed');
        if (g.swiping && Math.abs(e.clientX - g.x) >= SWIPE) reply(g.id);
    }
    function gCancel() { if (!G) return; clearTimeout(G.timer); G.row.style.transform = ''; G.row.classList.remove('cm-armed'); G = null; }

    // ---------- actions on a message (long press) ----------
    const msgById = (id) => { const o = T && T.out[id]; return (T && T.raw[id]) || (o && o.payload) || null; };
    function actions(id) {
        const m = msgById(id); if (!m || !T) return;
        const mine = m.from === me(), isText = !m.type || m.type === 'text', failed = stateOf(m) === 'failed';
        const row = (ic, label, fn, cls) => `<button class="ct-act ${cls || ''}" onclick="${fn}"><i data-lucide="${ic}"></i><span>${label}</span></button>`;
        sheet(`<div class="ct-sh-prev">${esc(snippet(m)) || 'رسالة'}</div>
            ${failed ? row('rotate-cw', 'إعادة الإرسال', `app.chatSheetClose(); app.retryChatMsg(${jsNum(id)})`) : row('reply', 'رد', `app.chatSheetClose(); app.chatReply(${jsNum(id)})`)}
            ${isText ? row('copy', 'نسخ', `app.chatSheetClose(); app.copyMessageText(${jsNum(id)})`) : ''}
            ${mine && isText && !failed ? row('pencil', 'تعديل', `app.chatSheetClose(); app.openEditMessageModal(${jsNum(id)})`) : ''}
            ${m.type === 'image' ? row('maximize', 'فتح الصورة', `app.chatSheetClose(); app.openChatImage(${jsNum(id)})`) : ''}
            ${row('trash-2', 'حذف', `app.chatSheetClose(); app.openMessageDeleteChoice(${jsNum(id)})`, 'bad')}
            ${!mine ? row('flag', 'إبلاغ', `app.chatSheetClose(); app.openReportModal(${jsArg(m.from)}, ${jsNum(id)}, ${jsArg(snippet(m))})`, 'bad') : ''}`);
    }
    function sheet(inner) {
        closeSheet();
        const root = $('ctRoot'); if (!root) return;
        const w = document.createElement('div'); w.id = 'ctSheet'; w.className = 'ct-sheetw';
        w.innerHTML = `<div class="ct-bd" onclick="app.chatSheetClose()"></div><div class="ct-sheet" role="dialog">${inner}</div>`;
        root.appendChild(w); requestAnimationFrame(() => w.classList.add('on'));
        try { lucide.createIcons(); } catch (e) {}
    }
    function closeSheet() { $('ctSheet')?.remove(); }

    // ---------- replying ----------
    function reply(id) {
        const m = msgById(id); if (!m || !T) return;
        T.replyTo = { i: m.id, f: m.from, t: m.type || 'text', x: snippet(m).slice(0, 120) };
        replyBar();
        $('chatMessageInput')?.focus();
    }
    function replyBar() {
        const b = $('chatReplyBar'); if (!b) return;
        const r = T && T.replyTo;
        b.classList.toggle('hidden', !r);
        if (!r) { b.innerHTML = ''; return; }
        const who = r.f === me() ? 'أنت' : (app.currentChatOther && app.currentChatOther.name) || 'طالب';
        b.innerHTML = `<div class="ct-rp"><b>رد على ${esc(who)}</b><span>${esc(r.x || ICON[r.t] || 'رسالة')}</span></div><button onclick="app.chatReplyCancel()" aria-label="إلغاء الرد"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    }
    async function jump(id) {
        if (!T) return;
        let tries = 0;
        while (T && !T.nodes.has(id) && tries < 4 && T.rawCount >= T.limit) { T.limit += PAGE; listenMsgs(); tries++; await new Promise((r) => setTimeout(r, 900)); }
        const n = T && T.nodes.get(id);
        if (!n) { app.showToast('الرسالة الأصلية قديمة أو انحذفت'); return; }
        const b = n.el.querySelector('.cm-bubble'), sc = $('chatScroller');
        const y = sc.scrollTop + (n.el.getBoundingClientRect().top - sc.getBoundingClientRect().top);
        sc.scrollTo({ top: Math.max(0, y - sc.clientHeight / 3), behavior: 'smooth' });
        T.stick = false;
        if (b) { b.classList.remove('cm-flash'); void b.offsetWidth; b.classList.add('cm-flash'); }
    }

    // ---------- the input ----------
    function autosize() {
        const i = $('chatMessageInput'); if (!i) return;
        i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 120) + 'px';
    }
    function updateSendMode() {
        const i = $('chatMessageInput'), s = $('chatSendBtn'), mic = $('chatMicBtn'); if (!i || !s || !mic) return;
        const has = i.value.trim().length > 0;
        s.classList.toggle('hidden', !has); mic.classList.toggle('hidden', has);
    }
    function onInput() {
        updateSendMode(); autosize();
        const i = $('chatMessageInput');
        typing(i && i.value.trim() ? 't' : null);
    }
    function onKey(e) {
        // a phone keyboard's Enter makes a new line, the send button sends; on a computer Enter sends and Shift+Enter makes a line
        const touch = (navigator.maxTouchPoints || 0) > 0 && !window.matchMedia('(pointer: fine)').matches;
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !touch) { e.preventDefault(); sendText(); }
    }
    // "typing..." for the other end: written when it starts, refreshed while it goes on, removed when it stops
    function typing(kind, tt) {
        const t = tt || T; if (!t || !DB() || !me()) return;
        const path = 'chatTyping/' + t.chat + '/' + me();
        clearTimeout(t.timers.ti);
        if (!kind) {
            if (t.typeKind) { t.typeKind = ''; H().remove(R(path)).catch(() => {}); }
            return;
        }
        const nowT = Date.now();
        if (t.typeKind !== kind || nowT - t.typeAt > TYPE_EVERY) {
            t.typeKind = kind; t.typeAt = nowT;
            H().set(R(path), { s: kind, at: now() }).catch(() => {});
            if (!t.typeDisc) { try { t.typeDisc = H().onDisconnect(R(path)); t.typeDisc.remove(); } catch (e) {} }
        }
        if (kind === 't') t.timers.ti = setTimeout(() => typing(null, t), TYPE_IDLE);
    }

    // ---------- sending ----------
    function sendText() {
        if (!T) return;
        const i = $('chatMessageInput'); if (!i) return;
        const raw = i.value.replace(/\s+$/g, '').replace(/^\s+/g, '');
        if (!raw) return;
        if (T.blockedByOther) { app.showToast('لا يمكنك مراسلة هذا المستخدم'); return; }
        const f = filterBadWords(raw);
        if (f.filtered) app.showToast('تم حذف كلمات غير لائقة من رسالتك');
        i.value = ''; autosize(); updateSendMode(); typing(null);
        send({ type: 'text', text: f.clean.slice(0, 4000) });
        i.focus();
    }
    // One message: its own id (so a retry can never double it), shown at once, confirmed by the server.
    function send(extra) {
        if (!T || !DB()) return;
        const id = nextId();
        const payload = Object.assign({ id, from: me(), to: T.uid, createdAt: id }, extra);
        if (extra.type === 'text') delete payload.type;
        if (T.replyTo) { payload.rep = T.replyTo; T.replyTo = null; replyBar(); }
        T.out[id] = { payload, st: 'sending', t0: Date.now(), tries: 0, notified: false };
        obAdd({ id, to: T.uid, p: payload });
        reconcile();
        write(id);
        return id;
    }
    function write(id) {
        const t = T; const o = t && t.out[id]; if (!o || o.busy) return;
        o.busy = true; o.tries++; o.st = 'sending'; o.t0 = Date.now();
        const m = o.payload, uid = t.uid, co = app.currentChatOther || {}, pv = preview(m);
        const u = {};
        u['privateChats/' + t.chat + '/messages/' + id] = m;
        const mine = { otherUid: uid, lastMessage: pv, lastAt: id, unread: false };
        if (co.known || (co.name && co.name !== 'طالب')) mine.otherName = co.name;
        if (co.avatar && app._liteImg(co.avatar)) mine.otherAvatar = app._liteImg(co.avatar);
        if (co.studentNumber) mine.otherStudentNumber = co.studentNumber;
        const cu = app.currentUser || {};
        const theirs = { otherUid: me(), otherName: cu.fullName || 'طالب', otherAvatar: app._avatarLite(), otherStudentNumber: cu.studentNumber || '', lastMessage: pv, lastAt: id, unread: true };
        Object.keys(mine).forEach((k) => { u['userChats/' + me() + '/' + uid + '/' + k] = mine[k]; });
        Object.keys(theirs).forEach((k) => { u['userChats/' + uid + '/' + me() + '/' + k] = theirs[k]; });
        clearTimeout(o.stuckT);
        o.stuckT = setTimeout(() => { if (T === t && t.out[id] && t.out[id].st === 'sending' && Date.now() - o.t0 >= STUCK_MS - 200) { o.st = 'stuck'; o.busy = false; sync(id); } }, STUCK_MS);
        H().update(R(''), u).then(() => {
            clearTimeout(o.stuckT); o.busy = false;
            delete (T === t ? t.out : {})[id]; obDel(id);
            if (!o.notified) { o.notified = true; app._notifyPush('msg', uid, id); }
            if (T === t) sync(id);
        }).catch((err) => {
            console.warn('Send message failed:', err);
            clearTimeout(o.stuckT); o.busy = false;
            if (T === t && t.out[id]) { o.st = 'failed'; sync(id); }
        });
    }
    // redraw one message after its state changed
    function sync(id) { if (!T) return; const n = T.nodes.get(id); if (!n) { reconcile(); return; } const i = T.list.findIndex((m) => m.id === id); if (i < 0) { reconcile(); return; } n.sig = ''; reconcile(); }
    function resendPending() {
        if (!T || !DB()) return;
        // messages from an earlier session that never reached the server
        obLoad().forEach((x) => {
            if (x.to !== T.uid || T.out[x.id] || T.raw[x.id]) return;
            if (Date.now() - (x.id - svOff) > 36 * 3600000) { obDel(x.id); return; }
            T.out[x.id] = { payload: x.p, st: 'sending', t0: Date.now(), tries: 0, notified: false };
            reconcile(); write(x.id);
        });
        Object.keys(T.out).forEach((k) => { const o = T.out[k]; if (o && !o.busy && (o.st === 'failed' || o.st === 'stuck') && o.tries < 4 && navigator.onLine !== false) write(Number(k)); });
        // a message that did reach the server is no longer pending
        Object.keys(T.out).forEach((k) => { if (T.raw[k] && !T.out[k].busy && T.out[k].st === 'sending' && Date.now() - T.out[k].t0 > 4000) { delete T.out[k]; obDel(Number(k)); } });
    }

    // ---------- reading ----------
    function markReadSoon() { if (!T) return; clearTimeout(T.timers.mr); T.timers.mr = setTimeout(markRead, 350); }
    function markRead() {
        if (!T || !DB() || !me() || document.hidden || app.currentView !== 'chatThreadView') return;
        const entry = (typeof userChatsList !== 'undefined' ? userChatsList : []).find((c) => c.otherUid === T.uid);
        // only an existing conversation gets its flag changed (a write under a deleted one would bring it back)
        if (entry && entry.unread) H().update(R('userChats/' + me() + '/' + T.uid), { unread: false }).catch(() => {});
        const last = T.list.length ? T.list[T.list.length - 1] : null;
        if (!last || last.from !== me() || !T.readSent) {
            if (T.readSent && now() - T.readSent < 1500) return;
            T.readSent = now();
            H().set(R('privateChats/' + T.chat + '/readReceipts/' + me()), now()).catch(() => {});
        }
    }

    // ---------- clearing the conversation for good ----------
    async function clear() {
        if (!T || !DB() || !me()) return;
        if (!(await app.ask({ icon: 'trash-2', title: 'تحذف المحادثة؟', text: 'تنحذف من عندك وما ترجع. الطرف الثاني تبقى عنده نسخته، وإذا انتو الاثنين حذفتوها تنمسح من النظام.', ok: 'احذف' }))) return;
        const t = T, other = t.uid, chat = t.chat, at = now();
        // the phone remembers it at once (so it holds even with no network), then the server
        try { localStorage.setItem(keyCC(other), String(at)); } catch (e) {}
        try { obSave(obLoad().filter((x) => x.to !== other)); } catch (e) {}
        t.clearAt = at;
        const up = {};
        up['userChats/' + me() + '/' + other] = null;
        up['privateChats/' + chat + '/cleared/' + me()] = at;
        up['chatClearedAt/' + me() + '/' + other] = at;
        up['privateChats/' + chat + '/deletedFor/' + me()] = null;
        up['privateChats/' + chat + '/readReceipts/' + me()] = null;
        up['chatTyping/' + chat + '/' + me()] = null;
        typing(null);
        app.closeWalletModal();
        app.showToast('تم حذف المحادثة');
        try { await H().update(R(''), up); } catch (err) { console.warn('Clear chat failed:', err); app.showToast('انحذفت عندك، وراح تتزامن لما يرجع النت'); }
        purgeOld(chat, other);
        app.goBack();
    }
    // Messages older than both clear marks are removed from the database for good (the rules allow it only then).
    async function purgeOld(chat, other) {
        try {
            chat = chat || (T && T.chat); other = other || (T && T.uid); if (!chat || !DB()) return;
            const s = (await H().get(R('privateChats/' + chat + '/cleared'))).val() || {};
            const a = Number(s[me()]) || 0, b = Number(s[other]) || 0;
            if (!a || !b) return;
            const upto = Math.min(a, b), { query, orderByKey, endAt, limitToFirst } = H();
            const old = (await H().get(query(R('privateChats/' + chat + '/messages'), orderByKey(), endAt(String(upto)), limitToFirst(200)))).val() || {};
            const up = {}; Object.keys(old).forEach((k) => { if ((old[k] && old[k].createdAt || Number(k)) <= upto) up['privateChats/' + chat + '/messages/' + k] = null; });
            if (Object.keys(up).length) await H().update(R(''), up);
        } catch (e) { /* purging is only housekeeping */ }
    }

    // ---------- photos, from the gallery or the camera ----------
    async function prepImage(file) {
        let bmp = null;
        try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { try { bmp = await createImageBitmap(file); } catch (e2) { return null; } }
        const make = (side, q) => {
            const sc = Math.min(1, side / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * sc)), h = Math.max(1, Math.round(bmp.height * sc));
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h);
            return { url: c.toDataURL('image/jpeg', q), w, h };
        };
        let r = make(1280, 0.74);
        if (r.url.length > 330000) r = make(1024, 0.62);
        if (r.url.length > 330000) r = make(800, 0.55);
        try { bmp.close && bmp.close(); } catch (e) {}
        return r.url && r.url.length < 600000 ? r : null;
    }
    async function pickImages(files) {
        files = Array.from(files || []).filter((f) => /^image\//.test(f.type)).slice(0, 6);
        if (!files.length || !T) return;
        app.showToast('جاري تجهيز الصور...');
        const out = [];
        for (const f of files) { const r = await prepImage(f); if (r) out.push(r); }
        if (!T) return;
        if (!out.length) { app.showToast('تعذرت معالجة الصورة'); return; }
        T.pending = out;
        previewSheet();
    }
    function previewSheet() {
        const items = (T && T.pending) || [];
        if (!items.length) { closeSheet(); return; }
        sheet(`<div class="ct-sh-h"><b>${items.length === 1 ? 'صورة' : items.length + ' صور'}</b><button class="ct-x" onclick="app.chatPreviewClose()" aria-label="إلغاء">${'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'}</button></div>
            <div class="ct-pv ${items.length === 1 ? 'one' : ''}">${items.map((p, i) => `<div><img src="${p.url}" alt=""><button onclick="app.chatPreviewRemove(${i})" aria-label="إزالة"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`).join('')}</div>
            <button class="ct-send-big" onclick="app.chatPreviewSend()">إرسال${items.length > 1 ? ' (' + items.length + ')' : ''}</button>`);
    }
    function sendPending() {
        const items = (T && T.pending) || []; T.pending = null; closeSheet();
        items.forEach((p) => send({ type: 'image', imageUrl: p.url, w: p.w, h: p.h }));
    }
    function pickPdf(file) {
        if (!file || !T) return;
        if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) { app.showToast('نوع الملف غير مدعوم، صور أو PDF فقط'); return; }
        if (file.size > 5 * 1024 * 1024) { app.showToast('حجم الملف يجب ألا يتجاوز 5MB'); return; }
        const rd = new FileReader();
        rd.onload = () => { if (T) send({ type: 'file', fileUrl: rd.result, fileName: String(file.name).slice(0, 80), fileSize: file.size }); };
        rd.onerror = () => app.showToast('تعذرت قراءة الملف');
        rd.readAsDataURL(file);
    }

    // ---------- voice messages (hold the mic) ----------
    let V = null;
    function voiceMime() { try { for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} return ''; }
    function voiceUi(show) {
        $('chatAttachmentBtn')?.classList.toggle('hidden', show);
        $('chatTextInputWrap')?.classList.toggle('hidden', show);
        $('chatVoiceRecordingBar')?.classList.toggle('hidden', !show);
        if (!show) updateSendMode(); else { $('chatSendBtn')?.classList.add('hidden'); $('chatMicBtn')?.classList.remove('hidden'); }
    }
    function startVoice(e) {
        if (e.type === 'mousedown' && app._voiceTouchActive) return;
        if (V) return;
        if (e.type === 'touchstart') app._voiceTouchActive = true;
        e.preventDefault();
        if (!T) return;
        if (T.blockedByOther) { app.showToast('لا يمكنك مراسلة هذا المستخدم'); return; }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') { app.showToast('التسجيل الصوتي غير مدعوم بهذا المتصفح'); return; }
        const p = e.touches ? e.touches[0] : e;
        const v = V = { held: true, cancel: false, x: p.clientX, y: p.clientY, chunks: [], start: 0, send: false };
        // inside the phone app the phone records the voice itself (clear, full-band), the web view's recorder is the fallback
        if (app._isNative() && window.IspNative && window.IspNative.recStart) {
            const r = String(window.IspNative.recStart());
            if (r === 'ok') {
                v.native = true; v.start = Date.now();
                voiceUi(true); tickVoice(v); v.timer = setInterval(() => tickVoice(v), 400);
                typing('r'); v.tt = setInterval(() => typing('r'), TYPE_EVERY);
                return;
            }
            if (r === 'perm') { V = null; app._voiceTouchActive = false; app.showToast('اسمح للتطبيق باستخدام المايكروفون ثم اضغط مرة ثانية'); return; }
        }
        // Clear voice: one 48 kHz channel, the phone's auto gain keeps the level even, and no echo/noise "cleaning" (that processing is meant for calls and
        // makes a recording sound thin and watery). Opus at 64 kbps is far above what speech needs, so it comes out clean.
        navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: { ideal: 48000 }, echoCancellation: false, noiseSuppression: false, autoGainControl: true } }).catch(() => navigator.mediaDevices.getUserMedia({ audio: true })).then((stream) => {
            if (V !== v || !v.held) { stream.getTracks().forEach((t) => t.stop()); if (V === v) V = null; return; }
            v.stream = stream;
            const mime = voiceMime();
            let rec;
            try { rec = new MediaRecorder(stream, Object.assign({ audioBitsPerSecond: 64000 }, mime ? { mimeType: mime } : {})); }
            catch (er) { try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch (er2) { rec = new MediaRecorder(stream); } }
            v.rec = rec; v.mime = rec.mimeType || mime || 'audio/webm';
            rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) v.chunks.push(ev.data); };
            rec.onstop = () => finishVoice(v);
            rec.start(250); v.start = Date.now();
            voiceUi(true); tickVoice(v);
            v.timer = setInterval(() => tickVoice(v), 400);
            typing('r'); v.tt = setInterval(() => typing('r'), TYPE_EVERY);
        }).catch(() => { if (V === v) V = null; app.showToast('تعذر الوصول للمايكروفون — تحقق من الأذونات'); });
    }
    function moveVoice(e) {
        if (!V || !V.held) return;
        const p = e.touches ? e.touches[0] : e; if (!p) return;
        V.cancel = (V.y - p.clientY) > 60 || Math.abs(V.x - p.clientX) > 60;
        const h = $('chatVoiceCancelHint'); if (h) { h.textContent = V.cancel ? 'اترك للإلغاء' : 'اسحب للأعلى للإلغاء'; h.style.color = V.cancel ? 'var(--error)' : 'var(--text2)'; }
    }
    function endVoice(e, release) {
        if (e.type === 'touchend' || e.type === 'touchcancel') app._voiceTouchActive = false;
        if (!V || !V.held) return;
        V.held = false;
        stopVoice(release && !V.cancel);
    }
    function tickVoice(v) {
        const el = $('chatVoiceRecordingTime'); if (!el || !v.start) return;
        const s = Math.floor((Date.now() - v.start) / 1000);
        if (s >= MAX_VOICE) { v.held = false; stopVoice(true); return; }
        el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
    function stopVoice(send) {
        const v = V; if (!v) return;
        v.send = !!send; v.held = false;
        clearInterval(v.timer); clearInterval(v.tt);
        typing(null);
        if (v.native) {
            NV = v;
            try { window.IspNative.recStop(!!send); } catch (e) { NV = null; V = null; voiceUi(false); return; }
            if (!send) { NV = null; V = null; voiceUi(false); }
            return;
        }
        try { if (v.rec && v.rec.state === 'recording') v.rec.stop(); else finishVoice(v); } catch (e) { finishVoice(v); }
        if (v.stream) v.stream.getTracks().forEach((t) => t.stop());
    }
    let NV = null;
    // the phone's recorder answers here
    window.__ispRec = (ok, data) => {
        const v = NV; NV = null; if (!v) return;
        if (V === v) V = null;
        voiceUi(false);
        const secs = v.start ? Math.round((Date.now() - v.start) / 1000) : 0;
        if (!ok || !T) { if (!ok && T) app.showToast('الرسالة الصوتية قصيرة جداً أو ما انسجلت'); return; }
        if (secs < 1) { app.showToast('الرسالة الصوتية قصيرة جداً'); return; }
        if (String(data).length > 7000000) { app.showToast('التسجيل طويل جداً، حاول رسالة أقصر'); return; }
        send({ type: 'voice', audioUrl: data, duration: secs });
    };
    function finishVoice(v) {
        if (V !== v) return;
        V = null; voiceUi(false);
        const secs = v.start ? Math.round((Date.now() - v.start) / 1000) : 0;
        if (!v.send || !T) return;
        if (!v.chunks.length || secs < 1) { app.showToast('الرسالة الصوتية قصيرة جداً'); return; }
        const blob = new Blob(v.chunks, { type: v.mime || 'audio/webm' });
        const rd = new FileReader();
        rd.onload = () => {
            if (rd.result.length > 7000000) { app.showToast('التسجيل طويل جداً، حاول رسالة أقصر'); return; }
            if (T) send({ type: 'voice', audioUrl: rd.result, duration: secs });
        };
        rd.onerror = () => app.showToast('تعذر معالجة التسجيل');
        rd.readAsDataURL(blob);
    }

    // ---------- chat background: 10 ready themes, or a picture from the gallery (kept on this phone, per student) ----------
    const BGS = [['', 'الأساسي', '#e5e7eb'], ['night', 'ليل النجوم', '#1b2a5a'], ['sea', 'البحر', '#5fc4b8'], ['sunset', 'الغروب', '#ff9f80'], ['forest', 'الغابة', '#7bc47f'],
        ['rose', 'الورد', '#ffc4d8'], ['sand', 'الرمل', '#ecdcb8'], ['geo', 'هندسي', '#7c8cf0'], ['dots', 'نقاط', '#cfd8dc'], ['paper', 'دفتر', '#f6efd9']];
    const bgKey = () => 'isp:cbg:' + me(), bgImgKey = () => 'isp:cbgi:' + me();
    function bgGet() { try { return localStorage.getItem(bgKey()) || ''; } catch (e) { return ''; } }
    function applyBg() {
        const el = $('chatScroller'); if (!el) return;
        const k = bgGet();
        el.removeAttribute('data-bg'); el.style.removeProperty('--ct-img');
        if (k === 'img') {
            let u = ''; try { u = localStorage.getItem(bgImgKey()) || ''; } catch (e) {}
            if (u && /^data:image\//.test(u)) { el.setAttribute('data-bg', 'img'); el.style.setProperty('--ct-img', 'url("' + u + '")'); }
        } else if (BGS.some((b) => b[0] === k && k)) el.setAttribute('data-bg', k);
    }
    function bgSheet() {
        if (!T) return;
        const cur = bgGet();
        const sw = BGS.map((b) => `<button class="ct-bgsw${cur === b[0] ? ' on' : ''}" onclick="app.chatBgSet('${b[0]}')" aria-label="${b[1]}"><i data-bg="${b[0]}"${b[0] ? '' : ' style="background:' + b[2] + '"'}></i><span>${b[1]}</span></button>`).join('');
        const title = $('walletModalTitle'); if (title) title.textContent = 'خلفية المحادثة';
        const cEl = $('walletModalContent'); if (!cEl) return;
        cEl.innerHTML = `<div class="ct-bgs">${sw}</div>
            <button class="ct-bgpick${cur === 'img' ? ' on' : ''}" onclick="app.chatBgPick()"><i data-lucide="image-plus" class="w-5 h-5"></i><span>اختر صورة من الاستوديو</span></button>
            <p class="ct-bgnote">الخلفية تظهر عندك أنت بس، وتنحفظ بهالجهاز.</p>`;
        $('walletModal')?.classList.remove('hidden'); try { lucide.createIcons(); } catch (e) {}
    }
    async function bgFromFile(file) {
        if (!file || !/^image\//.test(file.type)) return;
        let bmp = null;
        try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { try { bmp = await createImageBitmap(file); } catch (e2) { app.showToast('تعذرت معالجة الصورة'); return; } }
        // a portrait-sized picture, light enough to keep on the phone
        const sc = Math.min(1, 900 / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * sc)), h = Math.max(1, Math.round(bmp.height * sc));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
        let url = cv.toDataURL('image/jpeg', 0.7);
        if (url.length > 400000) url = cv.toDataURL('image/jpeg', 0.5);
        try { bmp.close && bmp.close(); } catch (e) {}
        try { localStorage.setItem(bgImgKey(), url); localStorage.setItem(bgKey(), 'img'); }
        catch (e) { app.showToast('ما كدرت أحفظ الصورة (المساحة ممتلئة)'); return; }
        applyBg(); $('walletModal')?.classList.add('hidden');
        app.showToast('تم تغيير خلفية المحادثة');
    }

    // ---------- public ----------
    Object.assign(app, {
        _chatOpen: open,
        chatStopVoice() { try { stopVoice(false); } catch (e) {} },
        chatClose() { teardown(); },
        chatBgSheet() { bgSheet(); },
        chatBgSet(k) { try { localStorage.setItem(bgKey(), k); } catch (e) {} applyBg(); bgSheet(); },
        chatBgPick() {
            const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.style.display = 'none';
            i.onchange = () => { const f = i.files && i.files[0]; i.remove(); bgFromFile(f); };
            document.body.appendChild(i); i.click();
        },
        chatBack() { if ($('ctSheet')) { closeSheet(); return; } if (T && T.replyTo) { T.replyTo = null; replyBar(); return; } app.goBack(); },
        chatSheetClose() { closeSheet(); },
        sendChatMessage() { sendText(); },
        updateChatSendMode() { updateSendMode(); },
        chatToBottom() { toBottom(true); },
        loadOlderChat() { if (!T) return; T.limit += PAGE; listenMsgs(); },
        chatReply(id) { reply(id); },
        chatReplyCancel() { if (T) { T.replyTo = null; replyBar(); } },
        chatJump(id) { jump(id); },
        retryChatMsg(id) { if (!T || !T.out[id]) return; T.out[id].tries = 0; T.out[id].busy = false; write(id); sync(id); },
        cancelChatMsg(id) { if (!T) return; delete T.out[id]; obDel(id); reconcile(); },
        updateChatHeaderPresence() { paintHead(); },
        chatAttachMenu() {
            if (!T) return;
            const row = (ic, l, fn) => `<button class="ct-act" onclick="${fn}"><i data-lucide="${ic}"></i><span>${l}</span></button>`;
            sheet(`<div class="ct-sh-h"><b>إرفاق</b></div>${row('image', 'صورة من الاستديو', "app.chatSheetClose(); document.getElementById('chatImgInput').click()")}${row('camera', 'التقاط صورة', "app.chatSheetClose(); document.getElementById('chatCamInput').click()")}${row('file-text', 'ملف PDF', "app.chatSheetClose(); document.getElementById('chatPdfInput').click()")}`);
        },
        handleChatImages(ev) { const f = ev.target.files; const arr = Array.from(f || []); ev.target.value = ''; pickImages(arr); },
        handleChatPdf(ev) { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; pickPdf(f); },
        chatPreviewClose() { if (T) T.pending = null; closeSheet(); },
        chatPreviewRemove(i) { if (!T || !T.pending) return; T.pending.splice(i, 1); previewSheet(); },
        chatPreviewSend() { if (T && T.pending) sendPending(); },
        openChatImage(id) { const m = msgById(id); if (m && m.imageUrl) app.openImageViewer({ src: safeImage(m.imageUrl) }); },
        copyMessageText(id) {
            const m = msgById(id); if (!m) return;
            const done = () => app.showToast('تم نسخ النص');
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.text || '').then(done).catch(() => app.showToast('تعذر النسخ'));
            else { const ta = document.createElement('textarea'); ta.value = m.text || ''; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { app.showToast('تعذر النسخ'); } ta.remove(); }
        },
        openMessageDeleteChoice(id) {
            const m = msgById(id); if (!m || !T) return;
            const mine = m.from === me(), win = mine && (now() - (m.createdAt || 0) < 3600000) && !T.out[id];
            const title = $('walletModalTitle'); if (title) title.textContent = 'حذف الرسالة';
            const c = $('walletModalContent'); if (!c) return;
            c.innerHTML = `<div class="flex flex-col gap-2">
                <button onclick="app.deleteChatMessage(${jsNum(id)}, false)" class="w-full h-12 rounded-xl font-bold text-sm theme-transition btn-press text-right px-4" style="background-color: var(--input-bg); color: var(--text);">حذف عندي فقط</button>
                ${win ? `<button onclick="app.deleteChatMessage(${jsNum(id)}, true)" class="w-full h-12 rounded-xl font-bold text-sm text-error btn-press text-right px-4" style="background-color: var(--input-bg);">حذف لدى الطرفين</button>` : ''}
                <button onclick="app.closeWalletModal()" class="w-full h-12 rounded-xl font-bold text-sm theme-transition btn-press" style="background-color: var(--input-bg); color: var(--text2);">إلغاء</button></div>`;
            $('walletModal')?.classList.remove('hidden');
        },
        deleteChatMessage(id, both) {
            if (!T || !DB()) return;
            const t = T;
            if (t.out[id]) { delete t.out[id]; obDel(id); app.closeWalletModal(); reconcile(); return; }
            const done = () => { app.closeWalletModal(); if (T === t) { if (both) delete t.raw[id]; else t.deletedFor[id] = true; reconcile(); } };
            if (both) H().remove(R('privateChats/' + t.chat + '/messages/' + id)).then(done).catch(() => app.showToast('تعذر حذف الرسالة'));
            else H().set(R('privateChats/' + t.chat + '/deletedFor/' + me() + '/' + id), true).then(done).catch(() => app.showToast('تعذر حذف الرسالة'));
        },
        openEditMessageModal(id) {
            const m = msgById(id); if (!m) return;
            app._pendingEditMsgId = id;
            const title = $('walletModalTitle'); if (title) title.textContent = 'تعديل الرسالة';
            const c = $('walletModalContent'); if (!c) return;
            c.innerHTML = `<div class="flex flex-col gap-3"><textarea id="editMessageInput" rows="3" class="w-full px-4 py-3 rounded-xl auth-input text-sm" style="resize: none;">${esc(m.text)}</textarea><button onclick="app.saveEditedMessage()" class="w-full h-12 bg-primary text-white rounded-xl font-bold text-sm btn-press">حفظ</button></div>`;
            $('walletModal')?.classList.remove('hidden');
        },
        saveEditedMessage() {
            const i = $('editMessageInput'); if (!i || !app._pendingEditMsgId || !T || !DB()) return;
            const text = i.value.trim(); if (!text) { app.showToast('اكتب نص الرسالة'); return; }
            const f = filterBadWords(text), id = app._pendingEditMsgId, t = T;
            H().update(R('privateChats/' + t.chat + '/messages/' + id), { text: f.clean.slice(0, 4000), edited: true }).then(() => { if (T === t && t.raw[id]) { t.raw[id].text = f.clean; t.raw[id].edited = true; reconcile(); } app.closeWalletModal(); }).catch(() => app.showToast('تعذر تعديل الرسالة'));
        },
        deleteEntireChat() { return clear(); },
        openChatOptionsMenu() {
            if (!T) return;
            const entry = (typeof userChatsList !== 'undefined' ? userChatsList : []).find((c) => c.otherUid === T.uid);
            const row = (ic, l, fn, bad) => `<button onclick="${fn}" class="w-full h-12 rounded-xl font-bold text-sm theme-transition btn-press text-right px-4 flex items-center gap-2 ${bad ? 'text-error' : ''}" style="background-color: var(--input-bg); ${bad ? '' : 'color: var(--text);'}"><i data-lucide="${ic}" class="w-4 h-4"></i>${l}</button>`;
            const title = $('walletModalTitle'); if (title) title.textContent = 'خيارات المحادثة';
            const c = $('walletModalContent'); if (!c) return;
            c.innerHTML = `<div class="flex flex-col gap-2">
                ${entry ? row('pin', entry.pinned ? 'إلغاء التثبيت' : 'تثبيت المحادثة', 'app.togglePinChat()') + row(entry.muted ? 'bell' : 'bell-off', entry.muted ? 'إلغاء الكتم' : 'كتم المحادثة', 'app.toggleMuteChat()') + row('archive', entry.archived ? 'إلغاء الأرشفة' : 'أرشفة المحادثة', 'app.toggleArchiveChat()') : ''}
                ${row('palette', 'خلفية المحادثة', 'app.chatBgSheet()')}
                ${row('flag', 'الإبلاغ عن المستخدم', `app.openReportModal(${jsArg(T.uid)}, null)`)}
                ${entry || T.list.length ? row('trash-2', 'حذف المحادثة', 'app.deleteEntireChat()', true) : ''}</div>`;
            $('walletModal')?.classList.remove('hidden'); try { lucide.createIcons(); } catch (e) {}
        },
        togglePinChat() { flag('pinned', 'تم تثبيت المحادثة', 'تم إلغاء التثبيت'); },
        toggleMuteChat() { flag('muted', 'تم كتم المحادثة', 'تم إلغاء الكتم'); },
        toggleArchiveChat() { flag('archived', 'تم أرشفة المحادثة', 'تم إلغاء الأرشفة', true); },
        startVoiceHold: startVoice, trackVoiceHoldMove: moveVoice, endVoiceHold: endVoice,
        stopVoiceRecording(send) { stopVoice(!!send); },
        toggleVoicePlayback(id) {
            const a = $('voiceAudio-' + id); if (!a) return;
            document.querySelectorAll('audio.voice-message-audio').forEach((x) => { if (x !== a && !x.paused) x.pause(); });
            if (a.paused) a.play().catch(() => app.showToast('تعذر تشغيل الرسالة الصوتية')); else a.pause();
        },
        onVoicePlay(id) { const b = $('voicePlayBtn-' + id); if (b) { b.innerHTML = '<i data-lucide="pause" class="w-4 h-4"></i>'; try { lucide.createIcons({ root: b }); } catch (e) {} } },
        onVoicePause(id) { const b = $('voicePlayBtn-' + id); if (b) { b.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i>'; try { lucide.createIcons({ root: b }); } catch (e) {} } },
        onVoiceEnded(id) {
            app.onVoicePause(id);
            const p = $('voiceProgress-' + id); if (p) p.style.width = '0%';
            const a = $('voiceAudio-' + id); if (a) a.currentTime = 0;
            const d = $('voiceDuration-' + id); if (d && d.dataset.total) { const t = Number(d.dataset.total) || 0; d.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
        },
        onVoiceError(id) { app.onVoicePause(id); app.showToast('تعذر تشغيل الرسالة الصوتية'); },
        onVoiceTimeUpdate(id) {
            const a = $('voiceAudio-' + id), p = $('voiceProgress-' + id), d = $('voiceDuration-' + id); if (!a) return;
            const total = Number(a.dataset.duration) || 0; if (total <= 0) return;
            if (p) p.style.width = Math.min(100, (a.currentTime / total) * 100) + '%';
            if (d) { const r = Math.max(0, Math.round(total - a.currentTime)); d.textContent = Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0'); }
        },
        cycleVoiceSpeed(id) {
            const a = $('voiceAudio-' + id), b = $('voiceSpeedBtn-' + id); if (!a) return;
            const sp = [1, 1.5, 2], n = sp[(sp.indexOf(a.playbackRate || 1) + 1) % sp.length]; a.playbackRate = n; if (b) b.textContent = n + 'x';
        },
    });
    // pin / mute / archive change only a conversation that exists (never bring back a deleted one)
    function flag(key, onMsg, offMsg, leave) {
        if (!T || !DB()) return;
        const entry = (typeof userChatsList !== 'undefined' ? userChatsList : []).find((c) => c.otherUid === T.uid);
        if (!entry) { app.showToast('ابدأ المحادثة أول'); app.closeWalletModal(); return; }
        const val = !entry[key];
        H().update(R('userChats/' + me() + '/' + T.uid), { [key]: val }).then(() => { app.showToast(val ? onMsg : offMsg); app.closeWalletModal(); if (val && leave) app.goBack(); }).catch(() => app.showToast('تعذر تنفيذ العملية'));
    }
})();
