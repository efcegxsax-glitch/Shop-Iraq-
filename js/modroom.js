// غرفة المشرفين: a voice + text room for moderators only (the entry shows only for a moderator who is switched on, holds the "room"
// permission, while the admin's room switch is on). Looks like a voice chat room: 8 mic seats, everyone else listens, and a chat under it.
// No gifts, no games. Messages are deleted when the room empties.
//
// Voice: every phone inside is connected to every other one (WebRTC, audio only, a full mesh; up to MAXM people). A connection is opened
// with a silent audio sender; sitting on a seat just puts the microphone on it (replaceTrack), so nothing is renegotiated.
// The phone with the smaller uid sends the offer. Connection messages travel through modRoom/sig/{to}/{from}/{k} (see tools/rules.py).
//
//   modRoom/cfg/on          the admin's switch
//   modRoom/seats/0..7      {u, n, at, m}   who sits on a mic (at = heartbeat, m = muted)
//   modRoom/members/{uid}   {n, at, s}      who is inside (s = this visit's id)
//   modRoom/chat/{id}       {u, n, tx, at}
//   modRoom/sig/{to}/{from}/{k} {t, d, at}  offer | answer | ice | bye
// Loaded on demand by app._need('modroom') (after app._need('calls') for the relay addresses).
(function () {
    const MAXS = 8, MAXM = 12, HB = 25000, STALE = 90000, CHAT_MAX = 100;
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const H = () => window.firebaseDbHelpers;
    const db = () => window.firebaseDb;
    const R = (p) => (p ? H().ref(db(), p) : H().ref(db()));
    const $ = (id) => document.getElementById(id);
    const newKey = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const COLORS = ['#16a34a', '#0d9488', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#0891b2'];
    const colorOf = (uid) => { let h = 0; for (let i = 0; i < String(uid).length; i++) h = (h * 31 + String(uid).charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; };
    const ini = (n) => esc(String(n || 'م').trim().charAt(0) || 'م');
    let ST = null;

    Object.assign(app, {
        _mdrState() { return ST; },   // read-only peek, for the tests
        // ---------- opening and leaving ----------
        async mdrOpen() {
            const root = $('mdrView'); if (!root) return;
            if (!this.modRoomOk()) { this.showToast('الغرفة مو متاحة لك هسه'); this.goBack(); return; }
            if (!window.RTCPeerConnection || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { this.showToast('متصفحك ما يدعم الاتصال الصوتي'); }
            if (ST) { this._mdrPaint(); return; }
            document.body.classList.add('mdr-on');
            const me = this.currentUser || {};
            ST = { uid: this.authUid, name: String(me.fullName || 'مشرف').slice(0, 40), sid: Date.now(), seat: null, muted: false, deaf: false, members: {}, seats: {}, chat: [], pcs: {}, offs: [], seen: new Set(), timers: [], stream: null, ice: null, an: {}, ctx: null, tab: 'all', ctl: { state: {}, lockSeat: {}, muted: {}, silenced: {}, kicked: {} } };
            this._mdrShell();
            try {
                const [ice] = await Promise.all([this._mdrIce(), this._mdrEnter()]);
                if (!ST) return;
                ST.ice = ice;
                this._mdrListen();
            } catch (e) {
                const why = e && e.message;
                this.showToast(why === 'full' ? 'الغرفة ممتلئة' : why === 'locked' ? 'الغرفة مقفولة من مشرف الغرفة' : why === 'kicked' ? 'انطردت من الغرفة، انتظر 5 دقايق وارجع' : 'ما كدرت أدخل الغرفة، تأكد من النت');
                this.mdrLeave();
            }
        },
        async _mdrIce() { try { await this._need('calls'); return await this._clIce(); } catch (e) { return [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]; } },
        async _mdrEnter() {
            const { get, set, remove, onDisconnect, serverTimestamp } = H();
            const [snap, stS, kS] = await Promise.all([get(R('modRoom/members')), get(R('modRoom/state')), get(R('modRoom/kicked/' + ST.uid))]);
            const val = snap.val() || {}, now = Date.now();
            const stv = stS.val() || {}, kk = kS.val();
            if (kk && now - kk < 300000) throw new Error('kicked');
            if (stv.locked === true && !val[ST.uid] && !this.modCan('roomAdmin')) throw new Error('locked');
            const fresh = Object.keys(val).filter((u) => u !== ST.uid && now - (val[u].at || 0) < STALE);
            if (fresh.length >= MAXM - 1) throw new Error('full');
            // nobody else is here: whatever was left from before goes (old messages, ghost seats and members)
            if (!fresh.length) {
                await set(R('modRoom/chat'), null).catch(() => {});
                const ss = (await get(R('modRoom/seats')).catch(() => null)); const sv = (ss && ss.val()) || {};
                await Promise.all(Object.keys(sv).filter((k) => sv[k].u !== ST.uid).map((k) => set(R('modRoom/seats/' + k), null).catch(() => {})));
                await Promise.all(Object.keys(val).filter((u) => u !== ST.uid).map((u) => set(R('modRoom/members/' + u), null).catch(() => {})));
            }
            const mr = R('modRoom/members/' + ST.uid);
            await set(mr, { n: ST.name, at: serverTimestamp(), s: ST.sid });
            ST.disc = [onDisconnect(mr)]; ST.disc[0].remove();
            ST.timers.push(setInterval(() => this._mdrBeat(), HB));
        },
        _mdrBeat() {
            if (!ST) return;
            const { update, serverTimestamp } = H();
            const up = { ['modRoom/members/' + ST.uid + '/at']: serverTimestamp() };
            if (ST.seat !== null) up['modRoom/seats/' + ST.seat + '/at'] = serverTimestamp();
            update(R(''), up).catch(() => {});
            // a ghost (a phone that died without telling) is cleared by whoever sees it
            const now = Date.now();
            Object.keys(ST.members).forEach((u) => { if (u !== ST.uid && now - (ST.members[u].at || 0) > STALE) H().set(R('modRoom/members/' + u), null).catch(() => {}); });
            Object.keys(ST.seats).forEach((k) => { const s = ST.seats[k]; if (s && s.u !== ST.uid && now - (s.at || 0) > STALE) H().set(R('modRoom/seats/' + k), null).catch(() => {}); });
        },
        _mdrListen() {
            const { onValue, query, limitToLast, orderByKey } = H();
            const off = (f) => ST.offs.push(f);
            off(onValue(R('modRoom/members'), (s) => { if (!ST) return; ST.members = s.val() || {}; if (!ST.members[ST.uid] && ST.joined) { this.showToast('طلعوك من الغرفة'); this.mdrLeave(); return; } ST.joined = !!ST.members[ST.uid]; this._mdrPeers(); this._mdrPaint(); }, () => {}));
            off(onValue(R('modRoom/seats'), (s) => {
                if (!ST) return; ST.seats = s.val() || {};
                const mine = Object.keys(ST.seats).find((k) => ST.seats[k] && ST.seats[k].u === ST.uid);
                if (ST.seat !== null && mine === undefined) { this._mdrStopMic(); ST.seat = null; this.showToast('انشال مقعدك'); }
                this._mdrPaint();
            }, () => {}));
            off(onValue(query(R('modRoom/chat'), orderByKey(), limitToLast(CHAT_MAX)), (s) => {
                if (!ST) return; const v = s.val() || {};
                ST.chat = Object.keys(v).sort().map((k) => Object.assign({ id: k }, v[k]));
                this._mdrPaintChat();
            }, () => {}));
            off(onValue(R('modRoom/sig/' + ST.uid), (s) => this._mdrSignals(s.val() || {}), () => {}));
            ['state', 'lockSeat', 'muted', 'silenced', 'kicked'].forEach((k) => off(onValue(R('modRoom/' + k), (s) => { if (!ST) return; ST.ctl[k] = s.val() || {}; this._mdrCtl(); }, () => {})));
            off(onValue(R('modRoom/cfg/on'), (s) => { if (ST && s.val() !== true) { this.showToast('الإدارة سكّرت الغرفة'); this.mdrLeave(); } }, () => {}));
            ST.timers.push(setInterval(() => this._mdrTalk(), 160));
        },
        // leave the room and go back to where I came from
        mdrLeave() { this._mdrTeardown(); if (this.currentView === 'mdrView') this.goBack(); },
        // leave the room only (switching to another page already moves the view)
        _mdrTeardown() {
            const s = ST; if (!s) { this._mdrExitView(); return; }
            ST = null;
            s.timers.forEach(clearInterval);
            s.offs.forEach((f) => { try { f(); } catch (e) {} });
            Object.keys(s.pcs).forEach((u) => { try { s.pcs[u].pc.close(); } catch (e) {} try { s.pcs[u].audio.remove(); } catch (e) {} });
            if (s.stream) s.stream.getTracks().forEach((t) => t.stop());
            try { s.ctx && s.ctx.close(); } catch (e) {}
            const { remove, update } = H();
            // without the permission (or with the room shut) the database refuses these writes anyway; the others clear a ghost after 90 seconds
            if (db() && s.uid && this.modRoomOk()) {
                const up = { ['modRoom/members/' + s.uid]: null };
                if (s.seat !== null) up['modRoom/seats/' + s.seat] = null;
                update(R(''), up).catch(() => {});
                (s.disc || []).forEach((d) => { try { d.cancel(); } catch (e) {} });
                // the last one out clears the chat (asked from the database, not from what this phone had heard so far)
                H().get(R('modRoom/members')).then((m) => {
                    const v = m.val() || {};
                    if (!Object.keys(v).some((u) => u !== s.uid && Date.now() - (v[u].at || 0) < STALE)) remove(R('modRoom/chat')).catch(() => {});
                }).catch(() => {});
            }
            this._mdrExitView();
        },
        _mdrExitView() { document.body.classList.remove('mdr-on'); const r = $('mdrView'); if (r && ST === null) r.innerHTML = ''; },

        // ---------- microphone and seats ----------
        _mdrMuted(u) { u = u || ST.uid; return !!(ST.ctl.muted[u] || (u === ST.uid && ST.muted)); },
        _mdrAdm() { return this.modCan('roomAdmin'); },
        // takes a mic seat (or moves to another one) and starts the microphone
        async mdrSit(n) {
            if (!ST || ST.seat === n) return;
            if (ST.ctl.silenced[ST.uid]) { this.showToast('مشرف الغرفة سكّتك'); return; }
            if (ST.ctl.lockSeat[n]) { this.showToast('هذا المقعد مقفول'); return; }
            if (ST.seats[n] && ST.seats[n].u !== ST.uid) { this.showToast('المقعد محجوز'); return; }
            const stream = ST.stream || await this._mdrMic();
            if (!stream || !ST) return;
            const { update, serverTimestamp, onDisconnect } = H();
            const old = ST.seat;
            const up = { ['modRoom/seats/' + n]: { u: ST.uid, n: ST.name, at: serverTimestamp(), m: ST.muted } };
            if (old !== null) up['modRoom/seats/' + old] = null;
            try { await update(R(''), up); }
            catch (e) { if (!ST.stream) stream.getTracks().forEach((t) => t.stop()); this.showToast('ما كدرت أجلس، المقعد انحجز أو انقفل'); return; }
            try { ST.seatDisc && ST.seatDisc.cancel(); } catch (e) {}
            ST.seat = n; ST.stream = stream;
            try { ST.seatDisc = onDisconnect(R('modRoom/seats/' + n)); ST.seatDisc.remove(); } catch (e) {}
            this._mdrAttachMic();
            if (!ST.an[ST.uid]) this._mdrWatch(ST.uid, stream);
            this._mdrPaint();
        },
        async mdrStand() {
            if (!ST || ST.seat === null) return;
            const n = ST.seat; ST.seat = null;
            this._mdrStopMic();
            try { ST.seatDisc && ST.seatDisc.cancel(); } catch (e) {}
            if (ST.seats[n] && ST.seats[n].u === ST.uid) H().set(R('modRoom/seats/' + n), null).catch(() => {});   // already taken off by the manager: nothing to clear
            this._mdrPaint();
        },
        async _mdrMic() {
            try {
                return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: { ideal: true }, noiseSuppression: { ideal: true }, autoGainControl: { ideal: true }, channelCount: { ideal: 1 } }, video: false });
            } catch (e) {
                this.showToast(e && e.name === 'NotAllowedError' ? 'اسمح للتطبيق يستخدم المايك حتى تتكلم' : 'ما كدرت أشغل المايك');
                return null;
            }
        },
        _mdrAttachMic() {
            if (!ST || !ST.stream) return;
            const tr = ST.stream.getAudioTracks()[0] || null;
            if (tr) tr.enabled = !this._mdrMuted();
            Object.keys(ST.pcs).forEach((u) => { const p = ST.pcs[u]; if (p.sender) p.sender.replaceTrack(tr).catch(() => {}); });
        },
        _mdrStopMic() {
            if (!ST) return;
            Object.keys(ST.pcs).forEach((u) => { const p = ST.pcs[u]; if (p.sender) p.sender.replaceTrack(null).catch(() => {}); });
            if (ST.stream) ST.stream.getTracks().forEach((t) => t.stop());
            ST.stream = null; delete ST.an[ST.uid];
        },
        mdrMute() {
            if (!ST) return;
            if (ST.seat === null) {
                const free = [...Array(MAXS).keys()].find((i) => !ST.seats[i]);
                if (free === undefined) { this.showToast('كل المقاعد ممتلية'); return; }
                this.mdrSit(free); return;
            }
            if (ST.ctl.muted[ST.uid]) { this.showToast('مشرف الغرفة كتم مايكك'); return; }
            ST.muted = !ST.muted;
            const tr = ST.stream && ST.stream.getAudioTracks()[0]; if (tr) tr.enabled = !this._mdrMuted();
            H().set(R('modRoom/seats/' + ST.seat + '/m'), ST.muted).catch(() => {});
            this._mdrPaint();
        },
        mdrDeaf() {
            if (!ST) return;
            ST.deaf = !ST.deaf;
            this._mdrCtl();
        },

        // ---------- the voice connections ----------
        // one connection per other member that is fresh; the smaller uid offers
        _mdrPeers() {
            if (!ST || !ST.ice) return;
            const now = Date.now();
            const want = Object.keys(ST.members).filter((u) => u !== ST.uid && now - (ST.members[u].at || 0) < STALE);
            want.forEach((u) => {
                const m = ST.members[u], cur = ST.pcs[u];
                if (cur && cur.theirSid !== m.s) { this._mdrDrop(u); }
                if (!ST.pcs[u]) this._mdrConnect(u, m.s);
            });
            Object.keys(ST.pcs).forEach((u) => { if (!want.includes(u)) this._mdrDrop(u); });
        },
        _mdrDrop(u) {
            const p = ST && ST.pcs[u]; if (!p) return;
            try { p.pc.close(); } catch (e) {} try { p.audio.remove(); } catch (e) {}
            delete ST.pcs[u]; delete ST.an[u];
        },
        _mdrConnect(u, theirSid) {
            const pc = new RTCPeerConnection({ iceServers: ST.ice, bundlePolicy: 'max-bundle' });
            const audio = document.createElement('audio'); audio.autoplay = true; audio.setAttribute('playsinline', ''); audio.muted = ST.deaf || !!ST.ctl.muted[u] || !!ST.ctl.silenced[u]; audio.style.display = 'none';
            document.body.appendChild(audio);
            const p = { pc, audio, sender: null, theirSid, queue: [], haveRemote: false, tries: 0 };
            ST.pcs[u] = p;
            // the one who offers opens the audio line (send + receive); the one who answers takes the line that came with the offer (see _mdrSignals)
            if (ST.uid < u) { const tx = pc.addTransceiver('audio', { direction: 'sendrecv' }); this._mdrUseLine(p, tx); }
            pc.ontrack = (ev) => {
                const ms = new MediaStream([ev.track]);
                audio.srcObject = ms; audio.play().catch(() => {});
                this._mdrWatch(u, ms);
            };
            pc.onicecandidate = (ev) => { if (ev.candidate) this._mdrSend(u, 'ice', JSON.stringify(ev.candidate)); };
            pc.onconnectionstatechange = () => {
                if (!ST || ST.pcs[u] !== p) return;
                if (pc.connectionState === 'failed') {
                    // try again with a fresh connection, a few times
                    if (p.tries < 3) { const t = p.tries + 1; this._mdrDrop(u); setTimeout(() => { if (ST && ST.members[u] && !ST.pcs[u]) { this._mdrConnect(u, ST.members[u].s); if (ST.pcs[u]) ST.pcs[u].tries = t; } }, 1500 * t); }
                }
                this._mdrPaint();
            };
            if (ST.uid < u) this._mdrOffer(u, p);
        },
        _mdrUseLine(p, tx) {
            p.sender = tx.sender;
            const tr = ST && ST.stream && ST.stream.getAudioTracks()[0];
            if (tr) tx.sender.replaceTrack(tr).catch(() => {});
        },
        async _mdrOffer(u, p) {
            try {
                const offer = await p.pc.createOffer();
                await p.pc.setLocalDescription(offer);
                this._mdrSend(u, 'offer', offer.sdp);
            } catch (e) { /* the failed state retries */ }
        },
        _mdrSend(to, t, d) {
            if (!ST) return;
            H().set(R('modRoom/sig/' + to + '/' + ST.uid + '/' + newKey()), { t, d: String(d).slice(0, 8000), at: H().serverTimestamp(), s: ST.sid }).catch(() => {});
        },
        async _mdrSignals(box) {
            if (!ST) return;
            const list = [];
            Object.keys(box).forEach((from) => Object.keys(box[from] || {}).forEach((k) => { const key = from + '/' + k; if (!ST.seen.has(key)) list.push({ from, k, key, ...box[from][k] }); }));
            list.sort((a, b) => (a.at || 0) - (b.at || 0));
            for (const m of list) {
                ST.seen.add(m.key);
                H().set(R('modRoom/sig/' + ST.uid + '/' + m.from + '/' + m.k), null).catch(() => {});
                let p = ST.pcs[m.from];
                try {
                    if (m.t === 'offer') {
                        if (p && p.theirSid !== m.s) { this._mdrDrop(m.from); p = null; }
                        if (!p) { const mem = ST.members[m.from]; this._mdrConnect(m.from, mem ? mem.s : m.s); p = ST.pcs[m.from]; }
                        if (!p) continue;
                        p.theirSid = m.s;
                        await p.pc.setRemoteDescription({ type: 'offer', sdp: m.d });
                        p.haveRemote = true;
                        if (!p.sender) { const tx = p.pc.getTransceivers()[0]; if (tx) { tx.direction = 'sendrecv'; this._mdrUseLine(p, tx); } }
                        const ans = await p.pc.createAnswer();
                        await p.pc.setLocalDescription(ans);
                        this._mdrSend(m.from, 'answer', ans.sdp);
                        await this._mdrFlush(p);
                    } else if (m.t === 'answer' && p) {
                        if (p.pc.signalingState === 'have-local-offer') { await p.pc.setRemoteDescription({ type: 'answer', sdp: m.d }); p.haveRemote = true; await this._mdrFlush(p); }
                    } else if (m.t === 'ice' && p) {
                        const c = JSON.parse(m.d);
                        if (p.haveRemote) await p.pc.addIceCandidate(c).catch(() => {}); else p.queue.push(c);
                    } else if (m.t === 'bye') { this._mdrDrop(m.from); }
                } catch (e) { /* a bad message is skipped */ }
            }
            if (ST.seen.size > 400) ST.seen = new Set([...ST.seen].slice(-200));
        },
        async _mdrFlush(p) { const q = p.queue.splice(0); for (const c of q) await p.pc.addIceCandidate(c).catch(() => {}); },

        // ---------- who is talking (a ring around the seat) ----------
        _mdrWatch(uid, stream) {
            try {
                const AC = window.AudioContext || window.webkitAudioContext; if (!AC || !ST) return;
                ST.ctx = ST.ctx || new AC();
                const src = ST.ctx.createMediaStreamSource(stream), an = ST.ctx.createAnalyser(); an.fftSize = 256;
                src.connect(an); ST.an[uid] = { an, buf: new Uint8Array(an.fftSize) };
            } catch (e) {}
        },
        _mdrTalk() {
            if (!ST) return;
            Object.keys(ST.an).forEach((u) => {
                const a = ST.an[u]; a.an.getByteTimeDomainData(a.buf);
                let sum = 0; for (let i = 0; i < a.buf.length; i++) { const v = (a.buf[i] - 128) / 128; sum += v * v; }
                const on = Math.sqrt(sum / a.buf.length) > 0.03 && !this._mdrMuted(u) && !ST.ctl.silenced[u];
                document.querySelectorAll('.mdr-seat[data-u="' + u + '"]').forEach((el) => el.classList.toggle('talk', on));
            });
        },

        // ---------- the text chat ----------
        async mdrSend() {
            const inp = $('mdrIn'); if (!inp || !ST) return;
            const tx = inp.value.trim(); if (!tx) return;
            inp.value = '';
            try { await H().set(R('modRoom/chat/' + newKey()), { u: ST.uid, n: ST.name, tx: tx.slice(0, 300), at: H().serverTimestamp() }); }
            catch (e) { inp.value = tx; this.showToast('ما انرسلت الرسالة'); }
        },

        // ---------- the room's manager (permission "roomAdmin"): lock, mute, silence, kick ----------
        // what the manager set changes this phone at once: a forced mute keeps the mic shut, a silence takes me off my seat, a muted/silenced person is not played here
        _mdrCtl() {
            if (!ST) return;
            const c = ST.ctl;
            if (c.silenced[ST.uid] && ST.seat !== null) { this._mdrStopMic(); ST.seat = null; try { ST.seatDisc && ST.seatDisc.cancel(); } catch (e) {} this.showToast('مشرف الغرفة سكّتك'); }   // the manager took the seat off in the same write
            const tr = ST.stream && ST.stream.getAudioTracks()[0]; if (tr) tr.enabled = !this._mdrMuted();
            Object.keys(ST.pcs).forEach((u) => { if (ST.pcs[u].audio) ST.pcs[u].audio.muted = ST.deaf || !!c.muted[u] || !!c.silenced[u]; });
            this._mdrPaint();
        },
        async _mdrLog(k, extra) { try { const lg = await this._modLog(k, extra); await H().set(R(lg.path), lg.val); } catch (e) {} },
        async mdrAct(kind, uid, n) {
            if (!ST || !this._mdrAdm()) return;
            const { update, serverTimestamp } = H();
            const nm = (u) => String(((ST.members[u] || {}).n) || ((Object.values(ST.seats).find((x) => x && x.u === u) || {}).n) || '').slice(0, 40);
            const seatOf = (u) => Object.keys(ST.seats).find((k) => ST.seats[k] && ST.seats[k].u === u);
            document.getElementById('mdrSheet')?.remove();
            try {
                if (kind === 'mute') {
                    const on = !ST.ctl.muted[uid];
                    await update(R(''), { ['modRoom/muted/' + uid]: on ? true : null });
                    this._mdrLog('roomMute', { uid, name: nm(uid), v: on });
                } else if (kind === 'silence') {
                    const on = !ST.ctl.silenced[uid], k = seatOf(uid);
                    const up = { ['modRoom/silenced/' + uid]: on ? true : null };
                    if (on && k !== undefined) up['modRoom/seats/' + k] = null;
                    await update(R(''), up);
                    this._mdrLog('roomSilence', { uid, name: nm(uid), v: on });
                } else if (kind === 'stand') {
                    const k = seatOf(uid); if (k !== undefined) await update(R(''), { ['modRoom/seats/' + k]: null });
                } else if (kind === 'kick') {
                    const k = seatOf(uid), up = { ['modRoom/members/' + uid]: null, ['modRoom/kicked/' + uid]: serverTimestamp() };
                    if (k !== undefined) up['modRoom/seats/' + k] = null;
                    await update(R(''), up);
                    this._mdrLog('roomKick', { uid, name: nm(uid) });
                } else if (kind === 'lockseat') {
                    const on = !ST.ctl.lockSeat[n];
                    await update(R(''), { ['modRoom/lockSeat/' + n]: on ? true : null });
                    this._mdrLog('seatLock', { seat: n + 1, v: on });
                } else if (kind === 'lockroom') {
                    const on = ST.ctl.state.locked !== true;
                    await update(R(''), { 'modRoom/state/locked': on });
                    this._mdrLog('roomLock', { v: on });
                    this.showToast(on ? 'انقفلت الغرفة، محد جديد يدخل' : 'انفتحت الغرفة');
                }
            } catch (e) { this.showToast('ما تنفذ الأمر، صلاحيتك مطفية أو انقطع النت'); }
        },
        mdrLock() { this.mdrAct('lockroom'); },
        _mdrSheet(html) {
            document.getElementById('mdrSheet')?.remove();
            const el = document.createElement('div'); el.id = 'mdrSheet'; el.className = 'mdr-sheet';
            el.innerHTML = '<div class="mdr-sp">' + html + '<button class="mdr-x" onclick="document.getElementById(\'mdrSheet\').remove()">إلغاء</button></div>';
            el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
            document.body.appendChild(el);
            try { lucide.createIcons(); } catch (e) {}
        },
        // a tap on a seat opens a choice (what the person may do depends on who sits there and on the manager's powers)
        mdrSeatTap(n) {
            if (!ST) return;
            const s = ST.seats[n], live = s && Date.now() - (s.at || 0) < STALE * 2, c = ST.ctl, adm = this._mdrAdm();
            const btn = (ic, t, js, cls) => `<button class="mdr-opt ${cls || ''}" onclick="${js}"><i data-lucide="${ic}"></i>${t}</button>`;
            const close = "document.getElementById('mdrSheet').remove();";
            let h = '';
            if (!s || !live) {
                h = `<b>المقعد ${n + 1}</b>`;
                if (c.lockSeat[n]) h += '<p class="mdr-p">هذا المقعد مقفول من مشرف الغرفة.</p>';
                else if (c.silenced[ST.uid]) h += '<p class="mdr-p">مشرف الغرفة سكّتك، ما تكدر تتكلم هسه.</p>';
                else h += btn('mic', ST.seat !== null ? 'انتقل لهذا المقعد وتكلم' : 'اجلس هنا وتكلم', close + 'app.mdrSit(' + n + ')', 'go');
                if (adm) h += btn(c.lockSeat[n] ? 'lock-open' : 'lock', c.lockSeat[n] ? 'افتح المقعد' : 'اقفل المقعد', "app.mdrAct('lockseat',null," + n + ')');
            } else if (s.u === ST.uid) {
                h = `<b>مقعدك (${n + 1})</b>`;
                if (c.muted[ST.uid]) h += '<p class="mdr-p">مشرف الغرفة كتم مايكك.</p>';
                else h += btn(ST.muted ? 'mic' : 'mic-off', ST.muted ? 'شغّل المايك' : 'اكتم المايك', close + 'app.mdrMute()');
                h += btn('log-out', 'انزل من المقعد (أسمع بس)', close + 'app.mdrStand()');
            } else {
                h = `<b>${esc(s.n)}</b><p class="mdr-p">على المقعد ${n + 1}${(s.m || c.muted[s.u]) ? ' • مكتوم' : ''}</p>`;
                if (adm) {
                    h += btn(c.muted[s.u] ? 'mic' : 'mic-off', c.muted[s.u] ? 'فك الكتم عنه' : 'اكتم مايكه', "app.mdrAct('mute'," + JSON.stringify(s.u).replace(/"/g, '&quot;') + ')');
                    h += btn('volume-x', 'سكّته (ينزل من المقعد وما يتكلم ولا يكتب)', "app.mdrAct('silence'," + JSON.stringify(s.u).replace(/"/g, '&quot;') + ')', 'warn');
                    h += btn('arrow-down-from-line', 'نزّله من المقعد', "app.mdrAct('stand'," + JSON.stringify(s.u).replace(/"/g, '&quot;') + ')');
                    h += btn('user-x', 'اطرده من الغرفة', "app.mdrAct('kick'," + JSON.stringify(s.u).replace(/"/g, '&quot;') + ')', 'bad');
                } else h += '<p class="mdr-p">المقعد محجوز.</p>';
            }
            this._mdrSheet(h);
        },
        // ---------- drawing ----------
        _mdrShell() {
            const root = $('mdrView'); if (!root) return;
            root.innerHTML = `<div class="mdr">
                <div class="mdr-bg" aria-hidden="true"><i></i><i></i></div>
                <div class="mdr-top">
                    <button class="mdr-ic" onclick="app.mdrBack()" aria-label="خروج"><i data-lucide="chevron-right"></i></button>
                    <div class="mdr-title"><b><i data-lucide="shield-check"></i>غرفة المشرفين</b><small id="mdrSub"></small></div>
                    <button class="mdr-ic hidden" id="mdrLockBtn" onclick="app.mdrLock()" aria-label="قفل الغرفة"><i data-lucide="lock-open"></i></button>
                    <button class="mdr-ic" onclick="app.mdrMembers()" aria-label="المتواجدون"><i data-lucide="users"></i><span id="mdrCount">0</span></button>
                </div>
                <div class="mdr-seats" id="mdrSeats"></div>
                <div class="mdr-note"><i data-lucide="lock"></i>هذي الغرفة لمشرفين أكـادمي السادس بس. الرسائل تنمسح لمن تفرغ الغرفة.</div>
                <div class="mdr-chat" id="mdrChat"></div>
                <div class="mdr-bar">
                    <button class="mdr-b" id="mdrMic" onclick="app.mdrMute()" aria-label="المايك"><i data-lucide="mic"></i></button>
                    <button class="mdr-b" id="mdrSpk" onclick="app.mdrDeaf()" aria-label="الصوت"><i data-lucide="volume-2"></i></button>
                    <input id="mdrIn" maxlength="300" placeholder="اكتب رسالة..." autocomplete="off" enterkeyhint="send" onkeydown="if(event.key==='Enter'){app.mdrSend();}">
                    <button class="mdr-b send" onclick="app.mdrSend()" aria-label="إرسال"><i data-lucide="send"></i></button>
                </div>
            </div>`;
            this._mdrPaint();
        },
        mdrBack() { this.mdrLeave(); },
        _mdrPaint() {
            if (!ST) return;
            const box = $('mdrSeats'); if (!box) return;
            const now = Date.now();
            const fresh = Object.keys(ST.members).filter((u) => now - (ST.members[u].at || 0) < STALE);
            const cnt = $('mdrCount'); if (cnt) cnt.textContent = fresh.length;
            const lk = $('mdrLockBtn'); if (lk) { const on = ST.ctl.state.locked === true; lk.classList.toggle('hidden', !this._mdrAdm()); lk.classList.toggle('on', on); lk.innerHTML = `<i data-lucide="${on ? 'lock' : 'lock-open'}"></i>`; lk.setAttribute('aria-label', on ? 'افتح الغرفة' : 'اقفل الغرفة'); }
            const inp = $('mdrIn'); if (inp) { const sl = !!ST.ctl.silenced[ST.uid]; inp.disabled = sl; inp.placeholder = sl ? 'مشرف الغرفة سكّتك' : 'اكتب رسالة...'; }
            const sub = $('mdrSub'); if (sub) {
                const talking = Object.keys(ST.seats).filter((k) => ST.seats[k] && now - (ST.seats[k].at || 0) < STALE).length;
                const live = Object.keys(ST.pcs).filter((u) => ST.pcs[u].pc.connectionState === 'connected').length;
                sub.textContent = (ST.ctl.state.locked === true ? 'مقفولة • ' : '') + fresh.length + ' داخل الغرفة • ' + talking + ' على المايك' + (fresh.length > 1 ? ' • اتصال ' + live + '/' + (fresh.length - 1) : '');
            }
            box.innerHTML = [...Array(MAXS).keys()].map((n) => {
                const s = ST.seats[n], live = s && now - (s.at || 0) < STALE * 2;
                if (!s || !live) return `<button class="mdr-seat" onclick="app.mdrSeatTap(${n})" aria-label="مقعد ${n + 1}"><span class="mdr-av empty${ST.ctl.lockSeat[n] ? ' locked' : ''}"><i data-lucide="${ST.ctl.lockSeat[n] ? 'lock' : 'mic'}"></i></span><em>${n + 1}</em></button>`;
                const me = s.u === ST.uid, muted = me ? this._mdrMuted() : (s.m === true || !!ST.ctl.muted[s.u]);
                return `<button class="mdr-seat on${me ? ' me' : ''}${muted ? ' muted' : ''}" data-u="${esc(s.u)}" onclick="app.mdrSeatTap(${n})" aria-label="مقعد ${n + 1}"><span class="mdr-av" style="--c:${colorOf(s.u)}">${ini(s.n)}${muted ? '<b class="mdr-off"><i data-lucide="mic-off"></i></b>' : ''}</span><em>${esc(me ? 'أنت' : s.n)}</em></button>`;
            }).join('');
            const mic = $('mdrMic'); if (mic) {
                const seated = ST.seat !== null;
                mic.className = 'mdr-b' + (seated ? (this._mdrMuted() ? ' off' : ' live') : '');
                mic.innerHTML = `<i data-lucide="${seated && this._mdrMuted() ? 'mic-off' : 'mic'}"></i>`;
                mic.setAttribute('aria-label', seated ? (this._mdrMuted() ? 'شغّل المايك' : 'اكتم المايك') : 'اجلس وتكلم');
            }
            const spk = $('mdrSpk'); if (spk) { spk.className = 'mdr-b' + (ST.deaf ? ' off' : ''); spk.innerHTML = `<i data-lucide="${ST.deaf ? 'volume-x' : 'volume-2'}"></i>`; }
            try { lucide.createIcons(); } catch (e) {}
        },
        _mdrPaintChat() {
            const box = $('mdrChat'); if (!box || !ST) return;
            const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
            box.innerHTML = ST.chat.map((m) => `<div class="mdr-m${m.u === ST.uid ? ' me' : ''}"><b>${esc(m.u === ST.uid ? 'أنت' : m.n)}</b><span dir="auto">${esc(m.tx)}</span></div>`).join('') || '<div class="mdr-empty">ابدأ النقاش، اكتب أول رسالة</div>';
            if (near || ST.chat.length <= 1) box.scrollTop = box.scrollHeight;
        },
        mdrMembers() {
            if (!ST) return;
            const now = Date.now(), adm = this._mdrAdm(), c = ST.ctl;
            const list = Object.keys(ST.members).filter((u) => now - (ST.members[u].at || 0) < STALE);
            const q = (u) => JSON.stringify(u).replace(/"/g, '&quot;');
            const row = (u) => {
                const seated = Object.values(ST.seats).some((x) => x && x.u === u);
                const acts = adm && u !== ST.uid ? `<span class="mdr-acts"><button onclick="app.mdrAct('mute',${q(u)})" aria-label="كتم"><i data-lucide="${c.muted[u] ? 'mic' : 'mic-off'}"></i></button><button onclick="app.mdrAct('silence',${q(u)})" aria-label="إسكات"><i data-lucide="${c.silenced[u] ? 'volume-2' : 'volume-x'}"></i></button><button class="bad" onclick="app.mdrAct('kick',${q(u)})" aria-label="طرد"><i data-lucide="user-x"></i></button></span>` : '';
                return `<div class="mdr-mem"><span class="mdr-av sm" style="--c:${colorOf(u)}">${ini(ST.members[u].n)}</span><span>${esc(u === ST.uid ? 'أنت' : ST.members[u].n)}${c.silenced[u] ? ' <small>(مسكّت)</small>' : c.muted[u] ? ' <small>(مكتوم)</small>' : ''}</span>${seated ? '<i data-lucide="mic" class="mdr-onmic"></i>' : ''}${acts}</div>`;
            };
            this._mdrSheet(`<b>المتواجدون (${list.length})</b>${list.map(row).join('')}`);
        },
    });
})();
