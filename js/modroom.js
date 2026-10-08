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
            ST = { uid: this.authUid, name: String(me.fullName || 'مشرف').slice(0, 40), sid: Date.now(), seat: null, muted: false, deaf: false, members: {}, seats: {}, chat: [], pcs: {}, offs: [], seen: new Set(), timers: [], stream: null, ice: null, an: {}, ctx: null, tab: 'all' };
            this._mdrShell();
            try {
                const [ice] = await Promise.all([this._mdrIce(), this._mdrEnter()]);
                if (!ST) return;
                ST.ice = ice;
                this._mdrListen();
            } catch (e) {
                const full = e && e.message === 'full';
                this.showToast(full ? 'الغرفة ممتلئة' : 'ما كدرت أدخل الغرفة، تأكد من النت');
                this.mdrLeave();
            }
        },
        async _mdrIce() { try { await this._need('calls'); return await this._clIce(); } catch (e) { return [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]; } },
        async _mdrEnter() {
            const { get, set, remove, onDisconnect, serverTimestamp } = H();
            const snap = await get(R('modRoom/members'));
            const val = snap.val() || {}, now = Date.now();
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
                // the last one out clears the chat
                const others = Object.keys(s.members || {}).filter((u) => u !== s.uid && Date.now() - ((s.members[u] || {}).at || 0) < STALE);
                if (!others.length) remove(R('modRoom/chat')).catch(() => {});
            }
            this._mdrExitView();
        },
        _mdrExitView() { document.body.classList.remove('mdr-on'); const r = $('mdrView'); if (r && ST === null) r.innerHTML = ''; },

        // ---------- microphone and seats ----------
        async mdrSit(n) {
            if (!ST || ST.seat !== null) { if (ST && ST.seat === n) this.mdrStand(); return; }
            if (ST.seats[n] && ST.seats[n].u !== ST.uid) { this.showToast('المقعد محجوز'); return; }
            const stream = await this._mdrMic();
            if (!stream || !ST) return;
            const { set, serverTimestamp, onDisconnect } = H();
            try { await set(R('modRoom/seats/' + n), { u: ST.uid, n: ST.name, at: serverTimestamp(), m: false }); }
            catch (e) { stream.getTracks().forEach((t) => t.stop()); this.showToast('المقعد انحجز قبلك'); return; }
            ST.seat = n; ST.muted = false; ST.stream = stream;
            try { ST.seatDisc = onDisconnect(R('modRoom/seats/' + n)); ST.seatDisc.remove(); } catch (e) {}
            this._mdrAttachMic();
            this._mdrWatch(ST.uid, stream);
            this._mdrPaint();
        },
        async mdrStand() {
            if (!ST || ST.seat === null) return;
            const n = ST.seat; ST.seat = null;
            this._mdrStopMic();
            try { ST.seatDisc && ST.seatDisc.cancel(); } catch (e) {}
            H().set(R('modRoom/seats/' + n), null).catch(() => {});
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
            if (tr) tr.enabled = !ST.muted;
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
            ST.muted = !ST.muted;
            const tr = ST.stream && ST.stream.getAudioTracks()[0]; if (tr) tr.enabled = !ST.muted;
            H().set(R('modRoom/seats/' + ST.seat + '/m'), ST.muted).catch(() => {});
            this._mdrPaint();
        },
        mdrDeaf() {
            if (!ST) return;
            ST.deaf = !ST.deaf;
            Object.keys(ST.pcs).forEach((u) => { if (ST.pcs[u].audio) ST.pcs[u].audio.muted = ST.deaf; });
            this._mdrPaint();
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
            const audio = document.createElement('audio'); audio.autoplay = true; audio.setAttribute('playsinline', ''); audio.muted = ST.deaf; audio.style.display = 'none';
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
                const on = Math.sqrt(sum / a.buf.length) > 0.03 && !(u === ST.uid && ST.muted);
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

        // ---------- drawing ----------
        _mdrShell() {
            const root = $('mdrView'); if (!root) return;
            root.innerHTML = `<div class="mdr">
                <div class="mdr-bg" aria-hidden="true"><i></i><i></i></div>
                <div class="mdr-top">
                    <button class="mdr-ic" onclick="app.mdrBack()" aria-label="خروج"><i data-lucide="chevron-right"></i></button>
                    <div class="mdr-title"><b><i data-lucide="shield-check"></i>غرفة المشرفين</b><small id="mdrSub"></small></div>
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
            const sub = $('mdrSub'); if (sub) {
                const talking = Object.keys(ST.seats).filter((k) => ST.seats[k] && now - (ST.seats[k].at || 0) < STALE).length;
                const live = Object.keys(ST.pcs).filter((u) => ST.pcs[u].pc.connectionState === 'connected').length;
                sub.textContent = fresh.length + ' داخل الغرفة • ' + talking + ' على المايك' + (fresh.length > 1 ? ' • اتصال ' + live + '/' + (fresh.length - 1) : '');
            }
            box.innerHTML = [...Array(MAXS).keys()].map((n) => {
                const s = ST.seats[n], live = s && now - (s.at || 0) < STALE * 2;
                if (!s || !live) return `<button class="mdr-seat" onclick="app.mdrSit(${n})" aria-label="مقعد ${n + 1}"><span class="mdr-av empty"><i data-lucide="mic"></i></span><em>${n + 1}</em></button>`;
                const me = s.u === ST.uid, muted = me ? ST.muted : s.m === true;
                return `<button class="mdr-seat on${me ? ' me' : ''}${muted ? ' muted' : ''}" data-u="${esc(s.u)}" onclick="app.mdrSit(${n})" aria-label="مقعد ${n + 1}"><span class="mdr-av" style="--c:${colorOf(s.u)}">${ini(s.n)}${muted ? '<b class="mdr-off"><i data-lucide="mic-off"></i></b>' : ''}</span><em>${esc(me ? 'أنت' : s.n)}</em></button>`;
            }).join('');
            const mic = $('mdrMic'); if (mic) {
                const seated = ST.seat !== null;
                mic.className = 'mdr-b' + (seated ? (ST.muted ? ' off' : ' live') : '');
                mic.innerHTML = `<i data-lucide="${seated && ST.muted ? 'mic-off' : 'mic'}"></i>`;
                mic.setAttribute('aria-label', seated ? (ST.muted ? 'شغّل المايك' : 'اكتم المايك') : 'اجلس وتكلم');
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
            const now = Date.now();
            const list = Object.keys(ST.members).filter((u) => now - (ST.members[u].at || 0) < STALE);
            document.getElementById('mdrSheet')?.remove();
            const el = document.createElement('div'); el.id = 'mdrSheet'; el.className = 'mdr-sheet';
            el.innerHTML = `<div class="mdr-sp"><b>المتواجدون (${list.length})</b>${list.map((u) => `<div class="mdr-mem"><span class="mdr-av sm" style="--c:${colorOf(u)}">${ini(ST.members[u].n)}</span><span>${esc(u === ST.uid ? 'أنت' : ST.members[u].n)}</span>${Object.values(ST.seats).some((s) => s && s.u === u) ? '<i data-lucide="mic"></i>' : ''}</div>`).join('')}<button class="mdr-x" onclick="document.getElementById('mdrSheet').remove()">سد</button></div>`;
            el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
            document.body.appendChild(el);
            try { lucide.createIcons(); } catch (e) {}
        },
    });
})();
