// غرفتنا: study together in a shared 3D room (js/room3d.js draws it). A student opens a room with a name and a
// short code, friends join by the code or an invite, and everybody appears as a cute anime character studying at
// a desk. Tap a character and it gets annoyed, hold a finger on it and it gets happy; shake the phone and the whole
// room shakes (papers fly) on every phone. A shared focus timer (25/5) runs on the wall and on the screen. The more
// a student studies in the room, the more characters open up for them. Loaded on demand by app._need('sroom').
//
// rmRooms/{rid}/meta     {host, title, at, pm?}      pm = {k: 'f' focus | 'b' break, e: end time}
//              /members/{uid} {n, c, s, st, at, m, j}  c = character, s = seat, st = s study | r rest | z asleep
//              /kicked/{uid} true
//              /ev/{id}  {u, t, at, to?}              t = poke | pet | shake | hi | cheer (short-lived)
//              /chat/{id} {u, m, at}
// rmInvites/{uid}/{rid} {from, fn, t, at}
// rmMe/{uid} {min, c}                                 minutes studied in rooms and the chosen character
(function () {
    const MAX = 8, RECENT = 'isp:rm:recent', HEART = 25000, GONE = 120000, FOCUS = 25, BREAK = 5, IDLE = 240000;
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const H = () => window.firebaseDbHelpers;
    const R = (p) => H().ref(window.firebaseDb, p);
    const newId = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
    const code = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
    const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60); return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
    const st3 = { s: 'study', r: 'rest', z: 'sleep' };
    const POS = ['حبيبي', 'حبيبتي', 'شكرا', 'شكراً', 'حلو', 'حلوة', 'كيوت', 'تشجع', 'تشجعي', 'شاطر', 'شاطرة', 'شطور', 'احبك', 'أحبك', 'عاشت ايدك', 'يسلمو', 'مبدع', 'مبدعة', 'عسل', 'قمر', 'بطل', 'بطلة', 'ممتاز', 'رائع'];
    const NEG = ['غبي', 'غبية', 'اسكت', 'اسكتي', 'كلب', 'حمار', 'ثقيل', 'ثقيلة', 'كسلان', 'كسولة', 'مزعج', 'مزعجة', 'زفت', 'سخيف'];
    let ST = null; // the room I am in
    let MOD = null; // the 3D module
    let PORT = null; // portraits

    const loadMod = () => MOD ? Promise.resolve(MOD) : import(new URL('js/room3d.js?v=' + (window.APP_VER || '1'), document.baseURI).href).then((m) => (MOD = m));
    const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } };

    Object.assign(app, {
        // ---------- my progress: minutes and chosen character ----------
        _rmMeKey() { return 'isp:rm:me:' + (this.authUid || 'guest'); },
        _rmMe() {
            if (this._rmMeC && this._rmMeC.k === this._rmMeKey()) return this._rmMeC.v;
            let v = { min: 0, c: 'lulu' };
            try { const o = JSON.parse(localStorage.getItem(this._rmMeKey()) || 'null'); if (o && typeof o.min === 'number') v = { min: Math.max(0, Math.floor(o.min)), c: String(o.c || 'lulu') }; } catch (e) {}
            this._rmMeC = { k: this._rmMeKey(), v };
            return v;
        },
        _rmMeSave(push) {
            const v = this._rmMe();
            try { localStorage.setItem(this._rmMeKey(), JSON.stringify(v)); } catch (e) {}
            if (!push || !window.firebaseDb || !this.authUid) return;
            clearTimeout(this._rmMeT);
            this._rmMeT = setTimeout(() => { try { H().set(R('rmMe/' + this.authUid), { min: v.min, c: v.c }).catch(() => {}); } catch (e) {} }, 4000);
        },
        // the cloud copy wins when it has more minutes (new phone)
        async _rmMePull() {
            try {
                if (!window.firebaseDb || !this.authUid || this._rmPulled === this.authUid) return;
                this._rmPulled = this.authUid;
                const s = await H().get(R('rmMe/' + this.authUid)), c = s.val(), v = this._rmMe();
                if (c && typeof c.min === 'number' && c.min > v.min) { v.min = Math.floor(c.min); if (typeof c.c === 'string') v.c = c.c; this._rmMeSave(false); if (!ST && this.currentView === 'rmView') this.rmOpen(); }
                else if (v.min > 0) this._rmMeSave(true);
            } catch (e) {}
        },
        _rmUnlocked(def) { return this._rmMe().min >= def.unlock; },

        // ---------- the lobby ----------
        async rmOpen() {
            const box = document.getElementById('rmContent'); if (!box) return;
            this._rmLeaveScene(true);
            box.innerHTML = '<div class="rm-wrap"><div class="rm-skel"></div><div class="rm-skel"></div></div>';
            this._rmMePull();
            if (!webgl()) { box.innerHTML = '<div class="rm-wrap"><div class="rm-card"><b>جهازك ما يدعم العرض ثلاثي الأبعاد</b><p class="rm-mut">جرّب متصفح ثاني أو حدّث الجهاز.</p></div></div>'; return; }
            try { await loadMod(); } catch (e) { box.innerHTML = '<div class="rm-wrap"><div class="rm-card"><b>ما انحملت الغرفة</b><p class="rm-mut">تأكد من النت وحاول مرة ثانية.</p><button class="rm-btn" onclick="app.rmOpen()">أعد المحاولة</button></div></div>'; return; }
            if (this.currentView !== 'rmView') return;
            const me = this._rmMe(), C = MOD.CHARS, inv = this._rmInvites || [], recent = this._rmRecent();
            const cur = MOD.charById(me.c), unlocked = C.filter((c) => me.min >= c.unlock).length;
            const next = C.filter((c) => c.unlock > me.min).sort((a, b) => a.unlock - b.unlock)[0];
            box.innerHTML = `<div class="rm-wrap">
                <div class="rm-hero"><div class="rm-hero-av" id="rmHeroAv"></div>
                    <div class="rm-hero-t"><b>غرفتنا</b><span>ادرس ويا أصدقائك بغرفة ثلاثية الأبعاد، وشخصياتكم تدرس معاكم</span>
                        <div class="rm-stats"><div><i data-lucide="clock"></i><b>${me.min}</b><small>دقيقة دراسة</small></div><div><i data-lucide="users-round"></i><b>${unlocked}/${C.length}</b><small>شخصيات</small></div></div></div></div>
                ${inv.length ? `<div class="rm-h"><i data-lucide="mail"></i>دعوات إلك</div>${inv.map((x) => `<div class="rm-inv"><div><b>${esc(x.t || 'غرفة دراسة')}</b><small>${esc(x.fn || 'صديقك')} دعاك</small></div><button class="rm-btn" onclick="app.rmJoin(${jsArg(x.rid)})">ادخل</button><button class="rm-x" onclick="app.rmDecline(${jsArg(x.rid)})" aria-label="رفض"><i data-lucide="x"></i></button></div>`).join('')}` : ''}
                <div class="rm-h"><i data-lucide="plus-circle"></i>غرفة جديدة</div>
                <div class="rm-card"><input id="rmTitle" class="rm-in" maxlength="30" placeholder="اسم الغرفة، مثلاً: مذاكرة الفيزياء"><button class="rm-btn wide" id="rmCreate" onclick="app.rmCreate()"><i data-lucide="door-open"></i>افتح الغرفة</button></div>
                <div class="rm-h"><i data-lucide="key-round"></i>عندك رمز غرفة؟</div>
                <div class="rm-card rm-row"><input id="rmCode" class="rm-in rm-code" maxlength="40" placeholder="اكتب الرمز" dir="ltr" autocomplete="off"><button class="rm-btn" onclick="app.rmJoinCode()">ادخل</button></div>
                ${recent.length ? `<div class="rm-h"><i data-lucide="history"></i>غرفك</div>${recent.map((r) => `<button class="rm-recent" onclick="app.rmJoin(${jsArg(r.rid)})"><i data-lucide="door-open"></i><span>${esc(r.t)}</span><em dir="ltr">${esc(r.rid)}</em><i data-lucide="chevron-left"></i></button>`).join('')}` : ''}
                <div class="rm-h"><i data-lucide="sparkles"></i>شخصياتك</div>
                ${next ? `<div class="rm-next"><span>الجاية: <b>${esc(next.n)}</b></span><div class="rm-bar"><i style="width:${Math.min(100, me.min / next.unlock * 100).toFixed(1)}%"></i></div><small>باقي ${next.unlock - me.min} دقيقة دراسة بالغرفة</small></div>` : '<div class="rm-next"><span>فتحت كل الشخصيات، مبروك!</span></div>'}
                <div class="rm-chars" id="rmChars">${C.map((c) => this._rmCharCard(c, me, cur)).join('')}</div>
                <p class="rm-mut rm-c">اختار شخصيتك، وبالغرفة اضغط على أي شخصية واتفرج شنو تسوي!</p>
            </div>`;
            lucide.createIcons();
            this._rmPortraits().then((p) => {
                const av = document.getElementById('rmHeroAv'); if (av) av.innerHTML = '<img alt="" src="' + p[cur.id] + '">';
                document.querySelectorAll('#rmChars [data-ch]').forEach((el) => { const im = el.querySelector('.rm-ph'); if (im && p[el.dataset.ch]) im.src = p[el.dataset.ch]; });
            }).catch(() => {});
        },
        _rmCharCard(c, me, cur) {
            const open = me.min >= c.unlock;
            return `<button class="rm-ch${cur.id === c.id ? ' on' : ''}${open ? '' : ' lock'}" data-ch="${c.id}" onclick="app.rmPick('${c.id}')"><span class="rm-ph-w"><img class="rm-ph" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></span><b>${esc(c.n)}</b><small>${open ? (c.g === 'f' ? 'بنت' : 'ولد') + ' · ' + esc(c.about) : '<i data-lucide="lock"></i> ' + c.unlock + ' دقيقة'}</small></button>`;
        },
        _rmPortraits() {
            if (PORT) return Promise.resolve(PORT);
            return loadMod().then((m) => { try { const s = sessionStorage.getItem('isp:rm:ports:v2'); if (s) { PORT = JSON.parse(s); return PORT; } } catch (e) {} PORT = m.portraits(176); try { sessionStorage.setItem('isp:rm:ports:v2', JSON.stringify(PORT)); } catch (e) {} return PORT; });
        },
        rmPick(id) {
            const def = MOD.charById(id), me = this._rmMe();
            if (me.min < def.unlock) { this.showToast('تفتح بعد ' + (def.unlock - me.min) + ' دقيقة دراسة بالغرفة'); return; }
            me.c = id; this._rmMeSave(true);
            if (ST) { this._rmSelf({ c: id }); this._rmCloseSheet(); this._rmDock(); }
            else this.rmOpen();
        },

        // ---------- recent rooms, create, join ----------
        _rmRecent() { try { return (JSON.parse(localStorage.getItem(RECENT) || '[]') || []).filter((r) => r && r.rid).slice(0, 6); } catch (e) { return []; } },
        _rmRemember(rid, t, drop) {
            const l = this._rmRecent().filter((r) => r.rid !== rid); if (!drop) l.unshift({ rid, t: String(t || 'غرفة').slice(0, 30) });
            try { localStorage.setItem(RECENT, JSON.stringify(l.slice(0, 6))); } catch (e) {}
        },
        async rmCreate() {
            if (!this.authUid || !window.firebaseDb) { this.showToast('سجّل دخولك أول'); return; }
            const btn = document.getElementById('rmCreate'); if (btn && btn.disabled) return;
            const title = filterBadWords(String(document.getElementById('rmTitle')?.value || '').trim()).clean.slice(0, 30) || 'غرفة دراسة';
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="rm-spin"></span>دا تنفتح...'; }
            try {
                let rid = '', tries = 0;
                do { rid = code(); const ex = await H().get(R('rmRooms/' + rid + '/meta')); if (!ex.exists()) break; } while (++tries < 6);
                const u = this.currentUser || {}, me = this._rmMe(), now = Date.now();
                const room = { meta: { host: this.authUid, title, at: now }, members: { [this.authUid]: { n: String(u.fullName || 'طالب').slice(0, 40), c: me.c, s: 0, st: 's', at: now, m: 0, j: now } } };
                await Promise.race([H().set(R('rmRooms/' + rid), room), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))]);
                this._rmRemember(rid, title);
                this.rmEnter(rid, true);
            } catch (e) {
                const msg = String(e && (e.code || e.message) || '');
                this.showToast(/permission|denied/i.test(msg) ? 'قاعدة البيانات رفضت: لازم تنشر قواعد الحماية الجديدة' : /timeout/.test(msg) ? 'النت ضعيف، حاول مرة ثانية' : 'ما انفتحت الغرفة');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="door-open"></i>افتح الغرفة'; lucide.createIcons(); }
            }
        },
        rmJoinCode() {
            const v = String(document.getElementById('rmCode')?.value || '').trim().toLowerCase();
            const m = v.match(/[?&]rm=([a-z0-9]{4,12})/) || v.match(/^([a-z0-9]{4,12})$/);
            if (!m) { this.showToast('الرمز مو صحيح'); return; }
            this.rmJoin(m[1]);
        },
        async rmJoin(rid) {
            if (!this.authUid || !window.firebaseDb) { this.showToast('سجّل دخولك أول'); return; }
            try {
                const [meta, kick] = await Promise.all([H().get(R('rmRooms/' + rid + '/meta')), H().get(R('rmRooms/' + rid + '/kicked/' + this.authUid))]);
                if (!meta.exists()) { this.showToast('هاي الغرفة مو موجودة'); this._rmRemember(rid, '', true); this.rmDecline(rid); if (this.currentView === 'rmView' && !ST) this.rmOpen(); return; }
                if (kick.exists()) { this.showToast('ما تكدر تدخل هاي الغرفة'); this.rmDecline(rid); return; }
                this.rmDecline(rid); this._rmRemember(rid, meta.val().title);
                this.rmEnter(rid, false);
            } catch (e) { this.showToast(/permission|denied/i.test(String(e && (e.code || e.message))) ? 'قاعدة البيانات رفضت: لازم تنشر قواعد الحماية الجديدة' : 'ما كدرت أدخل، تأكد من النت'); }
        },
        rmDecline(rid) { if (this.authUid && window.firebaseDb) H().remove(R('rmInvites/' + this.authUid + '/' + rid)).catch(() => {}); },

        // ---------- inside the room ----------
        async rmEnter(rid, created) {
            if (ST) this._rmLeaveScene();
            if (!webgl()) { this.showToast('جهازك ما يدعم 3D'); return; }
            let mod; try { mod = await loadMod(); } catch (e) { this.showToast('ما انحملت الغرفة، تأكد من النت'); return; }
            if (this.currentView !== 'rmView') return;
            const { ref, onValue, onChildAdded, query, limitToLast, onDisconnect, set, serverTimestamp } = H();
            const u = this.currentUser || {}, me = this._rmMe();
            const el = document.createElement('div'); el.id = 'rmScene'; el.className = 'rm-scene';
            el.innerHTML = '<div class="rm-3d" id="rm3d"></div><div class="rm-hud" id="rmHud"></div><div class="rm-load" id="rmLoad"><span></span><span></span><span></span></div>';
            document.body.appendChild(el); document.body.classList.add('rm-on');
            ST = { rid, el, meta: null, members: {}, chat: [], un: [], seen: {}, off: 0, secs: 0, last: Date.now(), idle: false, me: { c: me.c, st: 's' }, sheet: '', unread: 0, created: !!created, tilt: false };
            let room; try { room = new mod.StudyRoom3D(document.getElementById('rm3d')); } catch (e) { console.warn(e); this.showToast('ما كدرت أشغل العرض ثلاثي الأبعاد'); this._rmLeaveScene(); return; }
            ST.room = room; this._rmRoom = room; room.onTap = (uid) => this._rmPoke(uid); room.onPet = (uid) => this._rmPet(uid);
            room.start(() => !!ST && document.visibilityState !== 'hidden'); room.setDaytime(new Date());
            ST.dayT = setInterval(() => room.setDaytime(new Date()), 60000);
            this._rmHud();
            // clock offset to the server, so everybody's timer agrees
            ST.un.push(onValue(R('.info/serverTimeOffset'), (s) => { ST.off = Number(s.val()) || 0; }, () => {}));
            ST.un.push(onValue(R('rmRooms/' + rid + '/meta'), (s) => {
                if (!ST) return;
                if (!s.exists()) { this.showToast('الغرفة انسدت'); this._rmRemember(rid, '', true); this._rmLeaveScene(); this.rmOpen(); return; }
                const prev = ST.meta; ST.meta = s.val(); this._rmHud(true);
                const a = prev && prev.pm ? prev.pm.k + prev.pm.e : '', b = ST.meta.pm ? ST.meta.pm.k + ST.meta.pm.e : '';
                if (a !== b) this._rmPhase(ST.meta.pm);
            }, () => {}));
            ST.un.push(onValue(R('rmRooms/' + rid + '/members'), (s) => { if (ST) { ST.members = s.val() || {}; this._rmMembers(); } }, () => {}));
            ST.un.push(onChildAdded(query(R('rmRooms/' + rid + '/ev'), limitToLast(15)), (s) => this._rmEvent(s.key, s.val()), () => {}));
            ST.un.push(onChildAdded(query(R('rmRooms/' + rid + '/chat'), limitToLast(40)), (s) => this._rmChatIn(s.key, s.val()), () => {}));
            // join: pick a free seat, announce myself, vanish when the connection drops
            try {
                const cur = (await H().get(R('rmRooms/' + rid + '/members'))).val() || {}, now = Date.now() + ST.off;
                const present = Object.keys(cur).filter((k) => k !== this.authUid && now - (cur[k].at || 0) < GONE);
                if (present.length >= MAX) { this.showToast('الغرفة مليانة (' + MAX + ' طلاب)'); this._rmLeaveScene(); return; }
                const used = new Set(present.map((k) => cur[k].s)); let seat = 0; while (used.has(seat) && seat < MAX - 1) seat++;
                const mref = R('rmRooms/' + rid + '/members/' + this.authUid);
                ST.mref = mref; ST.seat = seat;
                const rec = { n: String(u.fullName || 'طالب').slice(0, 40), c: me.c, s: seat, st: 's', at: serverTimestamp(), m: 0, j: Date.now() };
                await set(mref, rec);
                try { onDisconnect(mref).remove(); } catch (e) {}
                ST.un.push(onValue(R('.info/connected'), (s) => { if (s.val() === true && ST && ST.mref) { H().update(ST.mref, this._rmRec()).catch(() => {}); try { onDisconnect(ST.mref).remove(); } catch (e) {} } }, () => {}));
            } catch (e) {
                this.showToast(/permission|denied/i.test(String(e && (e.code || e.message))) ? 'قاعدة البيانات رفضت: لازم تنشر قواعد الحماية الجديدة' : 'ما كدرت أدخل الغرفة');
                this._rmLeaveScene(); return;
            }
            document.getElementById('rmLoad')?.remove();
            ST.beat = setInterval(() => this._rmBeat(), HEART);
            ST.tick = setInterval(() => this._rmTick(), 1000);
            ST.touch = () => { ST.last = Date.now(); if (ST.idle) { ST.idle = false; this._rmState('s', true); } };
            el.addEventListener('pointerdown', ST.touch, true);
            ST.vis = () => { if (document.visibilityState === 'visible') this._rmBeat(); }; document.addEventListener('visibilitychange', ST.vis);
            this._rmSensors();
            this.showToast(created ? 'انفتحت الغرفة. دز الرمز لأصدقائك' : 'دخلت الغرفة');
            setTimeout(() => { if (ST && ST.rid === rid) this.showToast('اضغط على شخصية تعصّب، وكبسة طويلة تدلّلها'); }, 3500);
            if (created) setTimeout(() => this.rmInvite(), 1200);
        },
        _rmRec() { const me = this._rmMe(); return { c: ST.me.c || me.c, st: ST.me.st === 'r' || ST.me.st === 'z' ? ST.me.st : 's', at: H().serverTimestamp(), m: Math.floor(ST.secs / 60) }; },
        _rmBeat() { if (ST && ST.mref) H().update(ST.mref, this._rmRec()).catch(() => {}); },
        _rmSelf(patch) { if (!ST || !ST.mref) return; Object.assign(ST.me, patch); H().update(ST.mref, Object.assign(this._rmRec(), patch.st ? { st: patch.st } : {}, patch.c ? { c: patch.c } : {})).catch(() => {}); },
        _rmNow() { return Date.now() + (ST ? ST.off : 0); },
        _rmState(s, auto) { if (!ST) return; if (!auto) { ST.last = Date.now(); ST.idle = false; } this._rmSelf({ st: s }); this._rmDock(); this._rmMembers(); },

        // everybody in the room, as the 3D scene wants them
        _rmMembers() {
            if (!ST || !ST.room) return;
            const now = this._rmNow(), list = [];
            Object.keys(ST.members).forEach((uid) => {
                const m = ST.members[uid]; if (!m || typeof m.c !== 'string') return;
                if (uid !== this.authUid && now - (m.at || 0) > GONE) return;
                list.push({ uid, name: m.n || 'طالب', char: m.c, state: st3[m.st] || 'study', mins: m.m || 0, seat: m.s, j: m.j || 0, me: uid === this.authUid });
            });
            list.sort((a, b) => a.j - b.j);
            ST.room.setMembers(list);
            ST.count = list.length; const c = document.getElementById('rmCount'); if (c) c.textContent = list.length;
        },

        // ---------- screen: top bar, timer, dock ----------
        _rmHud(onlyTop) {
            if (!ST) return;
            const hud = document.getElementById('rmHud'); if (!hud) return;
            const t = ST.meta ? ST.meta.title : '...', host = ST.meta && ST.meta.host === this.authUid;
            if (!onlyTop || !document.getElementById('rmTop')) {
                hud.innerHTML = `<div class="rm-top" id="rmTop"><button class="rm-ib" onclick="app.rmBack()" aria-label="خروج"><i data-lucide="chevron-right"></i></button>
                    <div class="rm-tt"><b id="rmTitleTx">${esc(t)}</b><button class="rm-codechip" onclick="app.rmShare()" dir="ltr"><i data-lucide="link"></i>${esc(ST.rid)}</button></div>
                    <span class="rm-cnt"><i data-lucide="users-round"></i><b id="rmCount">${ST.count || 1}</b></span>
                    <button class="rm-ib" onclick="app.rmMenu()" aria-label="القائمة"><i data-lucide="ellipsis"></i></button></div>
                    <button class="rm-timer" id="rmTimer" onclick="app.rmTimerSheet()"><span class="rm-tl" id="rmTl"></span><b id="rmTv">00:00</b><i data-lucide="timer"></i></button>
                    <div class="rm-dock" id="rmDock"></div>`;
            } else { const tt = document.getElementById('rmTitleTx'); if (tt) tt.textContent = t; }
            this._rmDock(); this._rmTick(true); lucide.createIcons();
        },
        _rmDock() {
            const d = document.getElementById('rmDock'); if (!d || !ST) return;
            const s = ST.me.st, sense = ST.needPerm;
            d.innerHTML = `<button class="rm-db" onclick="app.rmChat()"><i data-lucide="message-circle"></i><span>دردشة</span>${ST.unread ? '<em>' + ST.unread + '</em>' : ''}</button>
                <button class="rm-db" onclick="app.rmChars()"><i data-lucide="sparkles"></i><span>شخصيتي</span></button>
                <button class="rm-main ${s === 'r' ? 'rest' : ''}" onclick="app.rmToggle()"><i data-lucide="${s === 'r' ? 'book-open' : 'coffee'}"></i><span>${s === 'r' ? 'ارجع ادرس' : s === 'z' ? 'صحّيت' : 'استراحة'}</span></button>
                <button class="rm-db" onclick="app.rmShakeBtn()"><i data-lucide="vibrate"></i><span>هزّة</span></button>
                <button class="rm-db" onclick="app.rmInvite()"><i data-lucide="user-plus"></i><span>دعوة</span></button>
                ${sense ? '<button class="rm-sense" onclick="app.rmEnableSensors()"><i data-lucide="smartphone-nfc"></i>فعّل حساس الحركة</button>' : ''}`;
            lucide.createIcons();
        },
        rmToggle() { if (!ST) return; this._rmState(ST.me.st === 's' ? 'r' : 's'); },
        rmBack() {
            if (!ST) return;
            if (ST.sheet) { this._rmCloseSheet(); return; }
            this._rmLeaveScene(); this.rmOpen();
        },
        _rmLeaveScene(silent) {
            if (!ST) return;
            const s = ST; ST = null;
            try { clearInterval(s.beat); clearInterval(s.tick); clearInterval(s.dayT); clearTimeout(s.hint); } catch (e) {}
            try { s.un.forEach((u) => { try { u(); } catch (e) {} }); } catch (e) {}
            try { if (s.mref) { H().onDisconnect(s.mref).cancel(); H().remove(s.mref).catch(() => {}); } } catch (e) {}
            try { document.removeEventListener('visibilitychange', s.vis); } catch (e) {}
            this._rmSensorsOff(s);
            try { s.room && s.room.dispose(); } catch (e) {}
            this._rmFlush(s);
            s.el.remove(); document.body.classList.remove('rm-on');
            document.getElementById('rmSheet')?.remove();
        },
        rmClose() { this._rmLeaveScene(true); const c = document.getElementById('rmContent'); if (c) c.innerHTML = ''; },
        _rmFlush(s) { try { this._rmMeSave(true); } catch (e) {} },

        // ---------- the timer: minutes studied, the focus clock, sleeping when idle ----------
        _rmTick(force) {
            if (!ST) return;
            const now = Date.now();
            if (!ST.idle && ST.me.st === 's' && now - ST.last > IDLE) { ST.idle = true; this._rmState('z', true); this.showToast('نمت الشخصية... المس الشاشة وصحّيها'); }
            const counting = ST.me.st === 's' && document.visibilityState === 'visible';
            if (counting && !force) {
                ST.secs++;
                if (ST.secs % 60 === 0) { this._rmMinute(); }
            }
            const pm = ST.meta && ST.meta.pm, n = this._rmNow();
            let txt, label, sub, frac = 0;
            if (pm && pm.e) {
                const left = pm.e - n; txt = clock(left); label = pm.k === 'f' ? 'تركيز جماعي' : 'استراحة'; sub = pm.k === 'f' ? 'ركزوا سوا' : 'ارتاحوا شوية';
                const tot = (pm.k === 'f' ? FOCUS : BREAK) * 60000; frac = Math.max(0, Math.min(1, 1 - left / tot));
                if (left <= -1500 && ST.meta.host === this.authUid && !ST.advancing) this._rmAdvance(pm);
            } else { txt = clock(ST.secs * 1000); label = 'وقت دراستك'; sub = ST.me.st === 's' ? 'دا تدرس' : ST.me.st === 'r' ? 'استراحة' : 'نايم'; }
            const tv = document.getElementById('rmTv'), tl = document.getElementById('rmTl'), tp = document.getElementById('rmTimer');
            if (tv) tv.textContent = txt; if (tl) tl.style.setProperty('--p', (frac * 360).toFixed(1) + 'deg');
            if (tp) tp.className = 'rm-timer' + (pm ? (pm.k === 'f' ? ' f' : ' b') : '');
            if (ST.room) ST.room.setTimer(txt, label, sub);
        },
        _rmMinute() {
            const me = this._rmMe(), before = me.min; me.min++; this._rmMeSave(true);
            const opened = MOD.CHARS.filter((c) => c.unlock > before && c.unlock <= me.min);
            if (opened.length) {
                this.showToast('انفتحت شخصية جديدة: ' + opened.map((c) => c.n).join('، ') + '!');
                if (ST && ST.room) ST.room.react(this.authUid, 'cheer', 'مبروك! شخصية جديدة');
                this.playNotifySound && this.playNotifySound();
            }
        },
        // the host keeps the focus / break cycle going
        _rmAdvance(pm) {
            ST.advancing = true; const n = this._rmNow();
            const p = pm.k === 'f' ? { k: 'b', e: n + BREAK * 60000 } : null;
            H().update(R('rmRooms/' + ST.rid + '/meta'), { pm: p }).catch(() => {}).finally(() => { if (ST) ST.advancing = false; });
        },
        _rmPhase(pm) {
            if (!ST) return;
            if (pm && pm.k === 'f') { this._rmState('s', true); this.showToast('بدأ التركيز الجماعي ' + FOCUS + ' دقيقة'); ST.room && ST.room.react(this.authUid, 'hi', 'يلا نركز!'); }
            else if (pm && pm.k === 'b') { this._rmState('r', true); this.showToast('استراحة ' + BREAK + ' دقائق، ارتاحوا'); ST.room && ST.room.react(this.authUid, 'cheer', 'عاشت ايدكم!'); }
            else if (ST.me.st === 'r' && ST.prevPm && ST.prevPm.k === 'b') { this._rmState('s', true); }
            ST.prevPm = pm;
        },
        rmTimerSheet() {
            if (!ST) return;
            const host = ST.meta && ST.meta.host === this.authUid, pm = ST.meta && ST.meta.pm;
            this._rmSheet(`<div class="rm-sh-t">التركيز الجماعي</div>
                <p class="rm-mut rm-c">${pm ? (pm.k === 'f' ? 'الغرفة بتركيز الحين.' : 'الغرفة باستراحة.') : 'ابدأ جلسة ' + FOCUS + ' دقيقة تركيز و' + BREAK + ' استراحة ويا كل اللي بالغرفة.'}</p>
                ${host ? (pm ? '<button class="rm-btn wide danger" onclick="app.rmPm(0)"><i data-lucide="square"></i>أوقف المؤقت</button>' : '<button class="rm-btn wide" onclick="app.rmPm(1)"><i data-lucide="play"></i>ابدأ تركيز ' + FOCUS + ' دقيقة</button>') : '<p class="rm-mut rm-c">صاحب الغرفة هو اللي يشغل المؤقت.</p>'}`);
        },
        rmPm(on) {
            if (!ST || !ST.meta || ST.meta.host !== this.authUid) return;
            const n = this._rmNow();
            H().update(R('rmRooms/' + ST.rid + '/meta'), { pm: on ? { k: 'f', e: n + FOCUS * 60000 } : null }).catch(() => this.showToast('ما اشتغل المؤقت'));
            this._rmCloseSheet();
        },

        // ---------- reactions: tap, hold, shake ----------
        _rmEmit(t, to) {
            if (!ST || !window.firebaseDb) return;
            const rec = { u: this.authUid, t, at: Date.now() }; if (to) rec.to = to;
            const id = newId(), r = R('rmRooms/' + ST.rid + '/ev/' + id);
            ST.seen[id] = 1; H().set(r, rec).catch(() => {}); setTimeout(() => H().remove(r).catch(() => {}), 30000);
        },
        _rmPoke(uid) {
            if (!ST) return; const n = Date.now(); if (n - (ST.pokeAt || 0) < 450) return; ST.pokeAt = n; ST.last = n;
            ST.room.react(uid, 'poke'); this._rmEmit('poke', uid);
        },
        _rmPet(uid) { if (!ST) return; ST.last = Date.now(); ST.room.react(uid, 'pet'); this._rmEmit('pet', uid); try { navigator.vibrate && navigator.vibrate(20); } catch (e) {} },
        _rmEvent(key, v) {
            if (!ST || !v || ST.seen[key]) return; ST.seen[key] = 1;
            if (this._rmNow() - (v.at || 0) > 12000) return; // old news from before I came in
            if (v.u === this.authUid) return;
            if (v.t === 'shake') { ST.room.shake(1); return; }
            const target = v.t === 'poke' || v.t === 'pet' ? v.to : v.u;
            if (target && ST.room.chars.has(target)) ST.room.react(target, v.t);
        },
        rmShakeBtn() { if (!ST) return; ST.room.shake(1); this._rmEmit('shake'); },
        // quick words for everybody
        _rmCheer() { if (!ST) return; ST.room.react(this.authUid, 'cheer'); this._rmEmit('cheer'); },

        // ---------- chat: words appear as bubbles; kind words make a character cute, rude ones annoy it ----------
        rmChat() {
            if (!ST) return; ST.unread = 0; this._rmDock();
            this._rmSheet(`<div class="rm-sh-t">دردشة الغرفة</div><div class="rm-chat" id="rmChatBox"></div>
                <div class="rm-send"><input id="rmMsg" class="rm-in" maxlength="140" placeholder="اكتب رسالة... جرب تكتب اسم شخصية وكلمة حلوة" autocomplete="off" onkeydown="if(event.key==='Enter')app.rmSend()"><button class="rm-btn" onclick="app.rmSend()"><i data-lucide="send"></i></button></div>`, 'chat');
            this._rmChatDraw();
        },
        _rmChatDraw() {
            const b = document.getElementById('rmChatBox'); if (!b || !ST) return;
            b.innerHTML = ST.chat.length ? ST.chat.map((c) => { const m = ST.members[c.u] || {}, me = c.u === this.authUid; return `<div class="rm-msg${me ? ' me' : ''}"><b>${esc(me ? 'أنت' : (m.n || c.n || 'طالب'))}</b><span>${esc(c.m)}</span></div>`; }).join('') : '<div class="rm-mut rm-c">ماكو رسائل بعد. سلّم على أصدقائك!</div>';
            b.scrollTop = b.scrollHeight;
        },
        rmSend() {
            const i = document.getElementById('rmMsg'); if (!i || !ST) return;
            const m = filterBadWords(String(i.value || '').trim()).clean.slice(0, 140); if (!m) return;
            const n = Date.now(); if (n - (ST.sentAt || 0) < 900) return; ST.sentAt = n; i.value = ''; ST.last = n;
            H().set(R('rmRooms/' + ST.rid + '/chat/' + newId()), { u: this.authUid, m, at: n }).catch(() => this.showToast('ما انرسلت'));
        },
        _rmChatIn(key, v) {
            if (!ST || !v || ST.seen['c' + key]) return; ST.seen['c' + key] = 1;
            ST.chat.push(Object.assign({ k: key }, v)); if (ST.chat.length > 60) ST.chat.shift();
            const fresh = this._rmNow() - (v.at || 0) < 15000;
            if (ST.sheet === 'chat') this._rmChatDraw(); else if (fresh && v.u !== this.authUid) { ST.unread++; this._rmDock(); }
            if (!fresh) return;
            ST.room.say(v.u, String(v.m).slice(0, 60), 3200);
            // who was talked to, and how
            const txt = String(v.m), pos = POS.some((w) => txt.includes(w)), neg = NEG.some((w) => txt.includes(w));
            let hit = false;
            Object.keys(ST.members).forEach((uid) => {
                const mm = ST.members[uid], ch = mm && MOD.charById(mm.c);
                if (!ch || uid === v.u) return;
                if (txt.includes(ch.n) || (mm.n && txt.includes(String(mm.n).split(' ')[0]) && String(mm.n).split(' ')[0].length > 2)) { hit = true; if (neg) ST.room.react(uid, 'poke', 'ليش تكلي هيج؟'), ST.room.react(uid, 'poke'); else if (pos) ST.room.react(uid, 'pet'); else ST.room.react(uid, 'hi'); }
            });
            if (!hit && pos && !neg) ST.room.react(v.u, 'cheer');
        },

        // ---------- sheets: characters, menu, invite, share ----------
        _rmSheet(html, kind) {
            this._rmCloseSheet(true);
            const s = document.createElement('div'); s.id = 'rmSheet'; s.className = 'rm-sheet'; ST && (ST.sheet = kind || 'x');
            s.innerHTML = '<div class="rm-back" onclick="app._rmCloseSheet()"></div><div class="rm-sh"><div class="rm-grab"></div>' + html + '</div>';
            document.body.appendChild(s); requestAnimationFrame(() => s.classList.add('on')); lucide.createIcons();
        },
        _rmCloseSheet(now) { const s = document.getElementById('rmSheet'); if (ST) ST.sheet = ''; if (!s) return; if (now) { s.remove(); return; } s.classList.remove('on'); setTimeout(() => s.remove(), 220); },
        async rmChars() {
            if (!ST) return;
            const me = this._rmMe(), cur = MOD.charById(ST.me.c || me.c);
            this._rmSheet(`<div class="rm-sh-t">اختار شخصيتك</div><div class="rm-chars">${MOD.CHARS.map((c) => this._rmCharCard(c, me, cur)).join('')}</div>`, 'chars');
            this._rmPortraits().then((p) => document.querySelectorAll('#rmSheet [data-ch]').forEach((el) => { const im = el.querySelector('.rm-ph'); if (im && p[el.dataset.ch]) im.src = p[el.dataset.ch]; })).catch(() => {});
        },
        rmMenu() {
            if (!ST) return; const host = ST.meta && ST.meta.host === this.authUid;
            this._rmSheet(`<div class="rm-sh-t">${esc(ST.meta ? ST.meta.title : '')}</div>
                <button class="rm-menu-i" onclick="app.rmShare()"><i data-lucide="share-2"></i>دز رمز الغرفة</button>
                <button class="rm-menu-i" onclick="app.rmInvite()"><i data-lucide="user-plus"></i>ادعُ أصدقاء</button>
                <button class="rm-menu-i" onclick="app._rmCheer();app._rmCloseSheet()"><i data-lucide="party-popper"></i>شجّع الكل</button>
                ${host ? '<button class="rm-menu-i danger" onclick="app.rmEnd()"><i data-lucide="trash-2"></i>سدّ الغرفة للكل</button>' : ''}
                <button class="rm-menu-i" onclick="app.rmBack();app.rmBack()"><i data-lucide="log-out"></i>اطلع من الغرفة</button>`, 'menu');
        },
        rmEnd() {
            if (!ST || !ST.meta || ST.meta.host !== this.authUid) return;
            this._rmSheet('<div class="rm-sh-t">تسد الغرفة؟</div><p class="rm-mut rm-c">كل الطلاب يطلعون منها وتنمسح.</p><button class="rm-btn wide danger" onclick="app.rmEndGo()"><i data-lucide="trash-2"></i>إي، سدها</button><button class="rm-btn wide ghost" onclick="app._rmCloseSheet()">لا، رجوع</button>', 'end');
        },
        rmEndGo() { if (!ST) return; const rid = ST.rid; this._rmRemember(rid, '', true); H().remove(R('rmRooms/' + rid)).catch(() => {}); },
        async rmShare() {
            if (!ST) return; const t = ST.meta ? ST.meta.title : 'غرفة دراسة';
            const url = location.origin + location.pathname + '?rm=' + ST.rid, text = 'ادرس وياي بغرفة "' + t + '" بتطبيق أكـادمي السادس. رمز الغرفة: ' + ST.rid + '\n' + url;
            try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
            try { await navigator.clipboard.writeText(text); this.showToast('انسخ الرمز والرابط'); } catch (e) { this.showToast('الرمز: ' + ST.rid); }
        },
        rmInvite() {
            if (!ST) return; this._rmCloseSheet(true);
            const fr = (typeof friendsList !== 'undefined' ? friendsList : []).filter((f) => f && f.uid);
            ST.invited = ST.invited || {};
            this._rmSheet(`<div class="rm-sh-t">ادعُ أصدقاءك</div>
                ${fr.length ? '<div class="rm-fr">' + fr.map((f) => { const inRoom = !!ST.members[f.uid], sent = ST.invited[f.uid]; return `<div class="rm-fr-i"><b>${esc(f.name || 'طالب')}</b>${inRoom ? '<em>بالغرفة</em>' : `<button class="rm-btn${sent ? ' done' : ''}" ${sent ? 'disabled' : ''} onclick="app.rmSendInvite(${jsArg(f.uid)}, this)">${sent ? 'انرسلت' : 'ادعه'}</button>`}</div>`; }).join('') + '</div>' : '<p class="rm-mut rm-c">ما عندك أصدقاء بالتطبيق بعد. ضيفهم من صفحة الأصدقاء، أو دزلهم الرمز.</p>'}
                <button class="rm-btn wide" onclick="app.rmShare()"><i data-lucide="share-2"></i>دز الرمز والرابط</button>`, 'invite');
        },
        rmSendInvite(uid, btn) {
            if (!ST) return; const u = this.currentUser || {};
            H().set(R('rmInvites/' + uid + '/' + ST.rid), { from: this.authUid, fn: String(u.fullName || 'طالب').slice(0, 40), t: String(ST.meta.title || '').slice(0, 40), at: Date.now() }).then(() => {
                ST.invited[uid] = 1; if (btn) { btn.textContent = 'انرسلت'; btn.disabled = true; btn.classList.add('done'); }
            }).catch(() => this.showToast('ما انرسلت الدعوة'));
        },

        // ---------- the phone's sensors: tilt moves the view, a shake shakes the room ----------
        _rmSensors() {
            if (!ST) return;
            const need = typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
            if (need) { ST.needPerm = true; this._rmDock(); return; }
            this._rmSensorsOn();
        },
        async rmEnableSensors() {
            try { const r = await DeviceMotionEvent.requestPermission(); if (r === 'granted') { try { await DeviceOrientationEvent.requestPermission(); } catch (e) {} ST.needPerm = false; this._rmDock(); this._rmSensorsOn(); this.showToast('اشتغل الحساس، هزّ موبايلك!'); } else this.showToast('ما انسمح بالحساس'); } catch (e) { this.showToast('الحساس مو متاح'); }
        },
        _rmSensorsOn() {
            if (!ST || ST.tilt) return; ST.tilt = true; let lastMag = 0, hits = 0, hitAt = 0, coolAt = 0;
            ST.onMotion = (e) => {
                const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
                const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z), d = Math.abs(mag - lastMag); lastMag = mag; const n = performance.now();
                if (d > 13) { if (n - hitAt < 450) hits++; else hits = 1; hitAt = n; if (hits >= 3 && n - coolAt > 3500) { hits = 0; coolAt = n; this._rmPhoneShake(Math.min(1.5, d / 22)); } }
            };
            ST.onOri = (e) => { if (!ST || e.gamma == null) return; const g = e.gamma || 0, b = (e.beta || 0) - 55; ST.room.setTilt(g / 30, -b / 40); };
            window.addEventListener('devicemotion', ST.onMotion); window.addEventListener('deviceorientation', ST.onOri);
        },
        _rmSensorsOff(s) { if (!s || !s.tilt) return; try { window.removeEventListener('devicemotion', s.onMotion); window.removeEventListener('deviceorientation', s.onOri); } catch (e) {} },
        _rmPhoneShake(p) { if (!ST) return; ST.last = Date.now(); ST.room.shake(p); this._rmEmit('shake'); try { navigator.vibrate && navigator.vibrate(60); } catch (e) {} },
    });
})();
