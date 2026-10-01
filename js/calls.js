// Voice calls in messages, one to one, like WhatsApp. The audio goes straight between the two
// phones over WebRTC, which always encrypts it (DTLS-SRTP); when the phones can't reach each
// other directly (carrier NAT) it goes through a Cloudflare TURN relay that only forwards the
// encrypted packets. Both sides can compare a security code made from the two phones' keys.
// Clear sound: the phone's echo cancellation, noise suppression and gain control, Opus at a
// steady bitrate with in-band error correction (lost packets are rebuilt instead of cut), and
// the connection is re-established by itself when the network changes.
// Every 25 minutes of talking gives each side 10 points (up to CAP_DAY a day from calls).
//
// Database (see tools/rules.py):
//   callRing/{to}/{from} = { id, n, a?, at }         the ring, removed once answered or ended
//   calls/{chatId} = { id, from, to, at, st, by?, offer, answer, oc/{k}, ac/{k}, mute/{uid} }
//     st: ring -> on -> end | no (declined) | busy | miss (not answered)
// The caller writes the call into the chat as a message ({ type: 'call', dur, st }) at the end.
// Loaded on demand by app._need('calls').
(function () {
    const RING_MS = 45000;          // not answered after this -> missed
    const LOST_MS = 30000;          // no connection for this long -> the call ends
    const BLOCK_S = 25 * 60;        // every 25 minutes of talking ...
    const BLOCK_PTS = 10;           // ... gives each side 10 points
    const CAP_DAY = 120;            // points a day from calls, at most
    const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const mmss = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, '0'); return h ? h + ':' + String(m).padStart(2, '0') + ':' + x : m + ':' + x; };
    const db = () => window.firebaseDb;
    const H = () => window.firebaseDbHelpers;

    // Opus for speech: steady 40 kbps, error correction on, no silence gaps, mono, 20 ms frames.
    function tuneOpus(sdp) {
        const m = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp);
        if (!m) return sdp;
        const pt = m[1];
        const want = { useinbandfec: '1', usedtx: '0', stereo: '0', 'sprop-stereo': '0', maxaveragebitrate: '32000', maxplaybackrate: '48000', cbr: '0' };
        const re = new RegExp('a=fmtp:' + pt + ' ([^\\r\\n]*)');
        if (re.test(sdp)) {
            sdp = sdp.replace(re, (all, params) => {
                const o = {};
                params.split(';').forEach((kv) => { const [k, v] = kv.split('='); if (k && k.trim()) o[k.trim()] = (v || '').trim(); });
                Object.assign(o, want);
                return 'a=fmtp:' + pt + ' ' + Object.keys(o).map((k) => k + '=' + o[k]).join(';');
            });
        } else {
            sdp = sdp.replace(new RegExp('(a=rtpmap:' + pt + ' opus/48000[^\\r\\n]*)'), '$1\r\na=fmtp:' + pt + ' ' + Object.keys(want).map((k) => k + '=' + want[k]).join(';'));
        }
        if (!/a=ptime:/.test(sdp)) sdp = sdp.replace(new RegExp('(a=fmtp:' + pt + ' [^\\r\\n]*)'), '$1\r\na=ptime:20');
        return sdp;
    }

    // The safety number: the same 12 digits on both phones when nobody sits in the middle.
    async function safetyCode(a, b) {
        const fp = (sdp) => ((/a=fingerprint:\S+ ([0-9A-F:]+)/i.exec(sdp || '') || [])[1] || '').toUpperCase();
        const both = [fp(a), fp(b)].sort().join('|');
        if (!both.replace('|', '') || !(window.crypto && crypto.subtle)) return '';
        const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(both)));
        let out = '';
        for (let i = 0; out.length < 12; i += 2) out += String(((h[i] << 8) | h[i + 1]) % 1000).padStart(3, '0');
        return out.slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ');
    }

    // Ring tones made on the fly (no sound files): a soft two-note ring for the one being
    // called, the usual long beep for the caller.
    const tone = {
        ctx: null, timer: null,
        start(kind) {
            this.stop();
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                this.ctx = this.ctx || new AC();
                if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
            } catch (e) { return; }
            const play = () => {
                const c = this.ctx, t = c.currentTime;
                const notes = kind === 'in' ? [[659, 0, 0.18], [784, 0.2, 0.18], [659, 0.6, 0.18], [784, 0.8, 0.18]] : [[440, 0, 1.1]];
                notes.forEach(([f, at, len]) => {
                    const o = c.createOscillator(), g = c.createGain();
                    o.type = 'sine'; o.frequency.value = f;
                    g.gain.setValueAtTime(0, t + at);
                    g.gain.linearRampToValueAtTime(kind === 'in' ? 0.22 : 0.08, t + at + 0.02);
                    g.gain.setValueAtTime(kind === 'in' ? 0.22 : 0.08, t + at + len - 0.04);
                    g.gain.linearRampToValueAtTime(0, t + at + len);
                    o.connect(g); g.connect(c.destination);
                    o.start(t + at); o.stop(t + at + len + 0.02);
                });
                if (kind === 'in' && navigator.vibrate) navigator.vibrate([400, 200, 400]);
            };
            play();
            this.timer = setInterval(play, kind === 'in' ? 2200 : 3000);
        },
        stop() {
            if (this.timer) { clearInterval(this.timer); this.timer = null; }
            if (this.inCall && this.ctx) { try { this.ctx.close(); } catch (e) {} this.ctx = null; }
            if (navigator.vibrate) try { navigator.vibrate(0); } catch (e) {}
        },
        blip(freqs) {
            if (this.inCall) { if (navigator.vibrate) try { navigator.vibrate(freqs.length > 2 ? [60, 60, 60] : 40); } catch (e) {} return; }
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                this.ctx = this.ctx || new AC();
                const c = this.ctx, t = c.currentTime;
                freqs.forEach((f, i) => {
                    const o = c.createOscillator(), g = c.createGain();
                    o.frequency.value = f; g.gain.setValueAtTime(0.1, t + i * 0.16); g.gain.linearRampToValueAtTime(0, t + i * 0.16 + 0.14);
                    o.connect(g); g.connect(c.destination); o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.15);
                });
            } catch (e) {}
        },
    };

    Object.assign(app, {
        // ---------- starting a call (the phone button in a chat) ----------
        async clCall() {
            const uid = this.currentChatUid, o = this.currentChatOther || {};
            if (!this.isLoggedIn || !this.authUid || !db()) { this.showToast('سجل دخول حتى تتصل'); return; }
            if (!uid) return;
            if (this._cl) { this.clMax(); return; }
            if (this.isBlocked(uid) || this.blockedByOtherInChat) { this.showToast('ما تكدر تتصل بهذا الشخص'); return; }
            if (!window.RTCPeerConnection || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { this.showToast('متصفحك ما يدعم الاتصال الصوتي'); return; }
            if (navigator.onLine === false) { this.showToast('ماكو نت، تأكد من الاتصال'); return; }
            const c = this._cl = this._clNew('caller', uid, o.name, o.avatar);
            c.id = rid();
            c.st = 'out';
            this._clRender();
            this._clAvatar(c);
            tone.start('out');
            // the ring goes out straight away; the mic and the relay addresses get ready meanwhile
            const ready = Promise.all([this._clMic(), this._clIce()]);
            const { ref, update, onValue, onDisconnect, serverTimestamp } = H();
            const base = 'calls/' + c.chat;
            const me = this.currentUser || {};
            const ring = { id: c.id, n: String(me.fullName || 'طالب').slice(0, 60), at: serverTimestamp() };
            if (me.avatar && String(me.avatar).length <= 600) ring.a = me.avatar;
            try {
                await update(ref(db()), {
                    [base]: { id: c.id, from: this.authUid, to: uid, at: serverTimestamp(), st: 'ring' },
                    ['callRing/' + uid + '/' + this.authUid]: ring,
                });
                c.disc = [onDisconnect(ref(db(), base + '/st')), onDisconnect(ref(db(), 'callRing/' + uid + '/' + this.authUid))];
                c.disc[0].set('end'); c.disc[1].remove();
            } catch (e) {
                console.warn('call start failed', e);
                ready.then(([st]) => st && st.getTracks().forEach((t) => t.stop()));
                if (this._cl === c) this._clEnd('fail');
                return;
            }
            if (this._cl !== c) return;
            c.offs.push(onValue(ref(db(), base), (snap) => this._clSignal(c, snap.val())));
            this._clCands(c, 'ac');
            c.ringT = setTimeout(() => { if (this._cl === c && c.st === 'out') this._clEnd('miss'); }, RING_MS);
            const [stream, ice] = await ready;
            if (this._cl !== c) { if (stream) stream.getTracks().forEach((t) => t.stop()); return; }
            if (!stream) { this._clEnd('mic'); return; }
            c.stream = stream;
            try {
                this._clPc(ice);
                const offer = await c.pc.createOffer();
                await c.pc.setLocalDescription(offer);
                c.offerV = 1;
                await update(ref(db(), base), { offer: { sdp: tuneOpus(offer.sdp), type: offer.type, v: 1 } });
            } catch (e) {
                console.warn('call offer failed', e);
                if (this._cl === c) this._clEnd('fail');
            }
        },

        // The other person's real photo (the leaderboard keeps every student's photo; full records are private).
        async _clAvatar(c) {
            try {
                const { ref, get } = H();
                const v = (await get(ref(db(), 'leaderboard/' + c.other.uid + '/avatar'))).val();
                if (v && this._cl === c && personAvatarSrc(v, '') === v) { c.other.avatar = v; this._clPaintAv(c); }
            } catch (e) {}
        },
        _clPaintAv(c) {
            const el = document.getElementById('clAv');
            if (!el || !c.other.avatar) return;
            const src = personAvatarSrc(c.other.avatar, c.other.name);
            if (/ui-avatars\.com/.test(src)) return;
            const paint = () => { if (el.isConnected) { el.style.backgroundImage = 'url("' + src.replace(/"/g, '%22') + '")'; el.classList.add('on'); } };
            if (c.avOk === src) { el.classList.add('now'); paint(); return; }
            const img = new Image();
            img.onload = () => { c.avOk = src; paint(); };
            img.src = src;
        },

        // ---------- a ring arrives (app._clRingListen) ----------
        async _clIncoming(from, r) {
            const { ref, get, set, update } = H();
            const chat = [this.authUid, from].sort().join('_');
            const ringRef = ref(db(), 'callRing/' + this.authUid + '/' + from);
            let call = null;
            try { const s = await get(ref(db(), 'calls/' + chat)); call = s.val(); } catch (e) {}
            if (!call || call.st !== 'ring' || call.id !== r.id || call.from !== from) { set(ringRef, null).catch(() => {}); return; }
            if (this.isBlocked(from)) { update(ref(db(), 'calls/' + chat), { st: 'no', by: this.authUid }).catch(() => {}); set(ringRef, null).catch(() => {}); return; }
            if (this._cl) {
                if (this._cl.id === r.id) return;
                update(ref(db(), 'calls/' + chat), { st: 'busy', by: this.authUid }).catch(() => {});
                set(ringRef, null).catch(() => {});
                return;
            }
            const c = this._cl = this._clNew('callee', from, r.n, r.a);
            c.id = r.id;
            c.st = 'in';
            c.offer = call.offer || null;
            this._clRender();
            this._clAvatar(c);
            this._clIce();
            tone.start('in');
            c.offs.push(H().onValue(ref(db(), 'calls/' + chat), (snap) => this._clSignal(c, snap.val())));
            c.ringT = setTimeout(() => { if (this._cl === c && c.st === 'in') this._clEnd('miss', true); }, RING_MS + 5000);
            try {
                if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                    const n = new Notification('مكالمة صوتية', { body: (c.other.name || 'طالب') + ' يتصل بيك', tag: 'call-' + c.id, requireInteraction: true });
                    n.onclick = () => { window.focus(); n.close(); };
                    c.note = n;
                }
            } catch (e) {}
        },

        async clAccept() {
            const c = this._cl;
            if (!c || c.st !== 'in') return;
            tone.stop();
            c.st = 'connecting';
            this._clRender();
            const [stream, ice] = await Promise.all([this._clMic(), this._clIce()]);
            if (this._cl !== c) { if (stream) stream.getTracks().forEach((t) => t.stop()); return; }
            if (!stream) { this._clEnd('mic'); return; }
            c.stream = stream;
            // the caller's phone may still be getting its side ready
            for (let i = 0; !c.offer && i < 150 && this._cl === c; i++) await new Promise((ok) => setTimeout(ok, 100));
            if (this._cl !== c) return;
            if (!c.offer) { this._clEnd('fail'); return; }
            const { ref, update, set, onDisconnect } = H();
            const base = 'calls/' + c.chat;
            try {
                c.disc = [onDisconnect(ref(db(), base + '/st'))];
                c.disc[0].set('end');
                this._clPc(ice);
                await this._clAnswer(c, c.offer, { st: 'on' });
                this._clWait(c);
                set(ref(db(), 'callRing/' + this.authUid + '/' + c.other.uid), null).catch(() => {});
            } catch (e) {
                console.warn('call answer failed', e);
                if (this._cl === c) this._clEnd('fail');
                return;
            }
            this._clCands(c, 'oc');
        },

        clDecline() {
            const c = this._cl;
            if (!c || c.st !== 'in') return;
            this._clEnd('no');
        },

        clHangup() {
            if (!this._cl) return;
            this._clEnd(this._cl.st === 'out' ? 'cancel' : 'end');
        },

        clMute() {
            const c = this._cl;
            if (!c || !c.stream) return;
            c.muted = !c.muted;
            c.stream.getAudioTracks().forEach((t) => { t.enabled = !c.muted; });
            const { ref, set } = H();
            set(ref(db(), 'calls/' + c.chat + '/mute/' + this.authUid), c.muted || null).catch(() => {});
            this._clRender();
        },

        // Out loud or to the ear, where the phone lets the page choose the output.
        async clSpeaker() {
            const c = this._cl;
            if (!c || !c.audio || typeof c.audio.setSinkId !== 'function') return;
            try {
                const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
                if (outs.length < 2) { this.showToast('جهازك ما يسمح بتغيير السماعة من المتصفح'); return; }
                c.spk = !c.spk;
                const pick = c.spk ? outs.find((d) => /speaker|مكبر/i.test(d.label)) || outs[outs.length - 1] : outs.find((d) => d.deviceId === 'default') || outs[0];
                await c.audio.setSinkId(pick.deviceId);
                this._clRender();
            } catch (e) { this.showToast('ما كدرت أغير السماعة'); }
        },

        clMin() { if (this._cl) { this._cl.min = true; this._clRender(); } },
        clMax() { if (this._cl) { this._cl.min = false; this._clRender(); } },

        clCode() {
            const c = this._cl;
            if (!c) return;
            c.showCode = !c.showCode;
            this._clRender();
        },

        // ---------- inside ----------
        _clNew(role, uid, name, avatar) {
            return {
                role, chat: [this.authUid, uid].sort().join('_'), other: { uid, name: name || 'طالب', avatar: avatar || '' },
                offs: [], pend: [], seen: new Set(), offerV: 0, answerV: 0, secs: 0, pts: 0, st: '', q: 3, lvl: 0, myLvl: 0,
            };
        },

        async _clMic() {
            try {
                return await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: { ideal: true }, noiseSuppression: { ideal: true }, autoGainControl: { ideal: true },
                        channelCount: { ideal: 1 },
                        // Chrome: the stronger voice-processing variants
                        googEchoCancellation: true, googNoiseSuppression: true, googHighpassFilter: true, googAutoGainControl: true,
                    },
                    video: false,
                });
            } catch (e) {
                this.showToast(e && e.name === 'NotAllowedError' ? 'اسمح للتطبيق يستخدم المايك حتى تتصل' : 'ما كدرت أشغل المايك');
                return null;
            }
        },

        // TURN addresses from the tutor Worker (siteConfig.tutorUrl, mode "turn"), kept for an hour.
        async _clIce() {
            const keep = this._clIceCache;
            if (keep && Date.now() - keep.at < (keep.ok ? 3600000 : 600000)) return keep.list;
            if (this._clIceWait) return this._clIceWait;
            this._clIceWait = this._clIceFetch().finally(() => { this._clIceWait = null; });
            return this._clIceWait;
        },
        async _clIceFetch() {
            const url = (this.siteConfig || {}).tutorUrl;
            let list = STUN;
            if (/^https:\/\/[^\s]+$/.test(String(url || '')) && window.firebaseAuth && window.firebaseAuth.currentUser) {
                try {
                    const token = await window.firebaseAuth.currentUser.getIdToken();
                    const ctl = new AbortController();
                    const t = setTimeout(() => ctl.abort(), 4000);
                    const res = await fetch(url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ mode: 'turn' }) });
                    clearTimeout(t);
                    const r = res.ok ? await res.json() : null;
                    if (r && Array.isArray(r.iceServers) && r.iceServers.length) {
                        list = STUN.concat(r.iceServers);
                    }
                } catch (e) { /* STUN only */ }
            }
            this._clIceCache = { at: Date.now(), list, ok: list !== STUN };
            return list;
        },

        _clPc(iceServers) {
            const c = this._cl;
            const pc = c.pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require', iceCandidatePoolSize: 2 });
            const { ref, set } = H();
            const mine = c.role === 'caller' ? 'oc' : 'ac';
            c.stream.getAudioTracks().forEach((t) => {
                try { t.contentHint = 'speech'; } catch (e) {}
                const sender = pc.addTrack(t, c.stream);
                c.sender = sender;
            });
            // Opus first
            try {
                const tr = pc.getTransceivers()[0];
                const caps = RTCRtpSender.getCapabilities && RTCRtpSender.getCapabilities('audio');
                if (tr && caps && tr.setCodecPreferences) {
                    // RED first: every packet also carries the one before it, so a lost packet on a
                    // shaky Wi-Fi is filled in instead of heard as a cut; then plain Opus
                    const red = caps.codecs.filter((x) => /audio\/red/i.test(x.mimeType));
                    const opus = caps.codecs.filter((x) => /opus/i.test(x.mimeType));
                    if (opus.length) tr.setCodecPreferences(red.concat(opus, caps.codecs.filter((x) => !/opus|audio\/red/i.test(x.mimeType))));
                }
            } catch (e) {}
            pc.onicecandidate = (ev) => {
                if (!ev.candidate || this._cl !== c) return;
                set(ref(db(), 'calls/' + c.chat + '/' + mine + '/' + rid()), ev.candidate.toJSON()).catch(() => {});
            };
            pc.ontrack = (ev) => {
                let a = c.audio;
                if (!a) {
                    a = c.audio = document.createElement('audio');
                    a.autoplay = true; a.setAttribute('playsinline', ''); a.className = 'cl-audio';
                    document.body.appendChild(a);
                }
                a.srcObject = ev.streams[0] || new MediaStream([ev.track]);
                a.play().catch(() => {});
                try { if ('jitterBufferTarget' in ev.receiver) ev.receiver.jitterBufferTarget = 120; } catch (e) {}
            };
            pc.onconnectionstatechange = () => this._clNet(c);
            pc.oniceconnectionstatechange = () => this._clNet(c);
            c.onHide = () => { if (this._cl === c) this._clEnd(c.st === 'out' ? 'cancel' : c.st === 'in' ? 'no' : 'end'); };
            window.addEventListener('pagehide', c.onHide);
            c.onOnline = () => { if (this._cl === c && c.role === 'caller' && c.st === 'reconnect') this._clRestart(c); };
            window.addEventListener('online', c.onOnline);
        },

        // Speech gets the network's first place, and a steady bitrate.
        async _clSenderTune(c) {
            try {
                const p = c.sender.getParameters();
                p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}];
                p.encodings[0].maxBitrate = 40000;
                p.encodings[0].priority = 'high';
                p.encodings[0].networkPriority = 'high';
                await c.sender.setParameters(p);
            } catch (e) {}
        },

        async _clAnswer(c, offer, extra) {
            const { ref, update } = H();
            await c.pc.setRemoteDescription({ type: offer.type, sdp: offer.sdp });
            c.offerV = offer.v || 1;
            this._clFlush(c);
            const ans = await c.pc.createAnswer();
            await c.pc.setLocalDescription(ans);
            await update(ref(db(), 'calls/' + c.chat), Object.assign({ answer: { sdp: tuneOpus(ans.sdp), type: ans.type, v: c.offerV } }, extra || {}));
        },

        // answered but the two phones never reached each other
        _clWait(c) {
            if (c.connT) return;
            c.connT = setTimeout(() => { c.connT = null; if (this._cl === c && c.st === 'connecting') this._clEnd('fail'); }, 25000);
        },

        _clCands(c, key) {
            const { ref, onChildAdded } = H();
            c.offs.push(onChildAdded(ref(db(), 'calls/' + c.chat + '/' + key), (snap) => {
                if (this._cl !== c || c.seen.has(snap.key)) return;
                c.seen.add(snap.key);
                const cand = snap.val();
                if (!cand || !cand.candidate) return;
                if (c.pc && c.pc.remoteDescription) c.pc.addIceCandidate(cand).catch(() => {});
                else c.pend.push(cand);
            }));
        },
        _clFlush(c) {
            const list = c.pend.splice(0);
            list.forEach((cand) => c.pc.addIceCandidate(cand).catch(() => {}));
        },

        // Everything the other side writes to calls/{chat}.
        async _clSignal(c, v) {
            if (this._cl !== c) return;
            if (!v || v.id !== c.id) { this._clEnd('gone', true); return; }
            if (['end', 'no', 'busy', 'miss'].includes(v.st) && v.by !== this.authUid) {
                this._clEnd(v.st === 'end' ? 'end' : v.st, true);
                return;
            }
            if (c.role === 'callee' && !c.offer && v.offer) c.offer = v.offer;
            const om = !!(v.mute && v.mute[c.other.uid]);
            if (om !== !!c.otherMuted) { c.otherMuted = om; this._clRender(); }
            if (c.role === 'caller') {
                if (v.answer && v.answer.v === c.offerV && c.answerV !== c.offerV && c.pc && c.pc.signalingState === 'have-local-offer') {
                    c.answerV = c.offerV;
                    tone.stop();
                    if (c.st === 'out') { c.st = 'connecting'; this._clRender(); this._clWait(c); }
                    try { await c.pc.setRemoteDescription({ type: v.answer.type, sdp: v.answer.sdp }); this._clFlush(c); } catch (e) { console.warn('answer', e); }
                }
            } else if (c.pc && v.offer && (v.offer.v || 1) > c.offerV && c.pc.signalingState === 'stable') {
                // the caller restarted the connection (new network)
                try { await this._clAnswer(c, v.offer); } catch (e) { console.warn('re-answer', e); }
            }
        },

        _clNet(c) {
            if (this._cl !== c || !c.pc) return;
            const s = c.pc.connectionState || c.pc.iceConnectionState;
            const ice = c.pc.iceConnectionState;
            if (s === 'connected' || ice === 'connected' || ice === 'completed') {
                if (c.lostAt) c.lostAt = 0;
                if (c.blipT) { clearTimeout(c.blipT); c.blipT = null; }
                if (c.restartT) { clearTimeout(c.restartT); c.restartT = null; }
                if (c.st !== 'on') {
                    const first = !c.startedAt;
                    c.st = 'on';
                    if (first) {
                        c.startedAt = Date.now();
                        // from here a lost connection is noticed by the call itself, so a short
                        // drop of the database connection no longer ends a call that still works
                        (c.disc || []).forEach((d) => { try { d.cancel(); } catch (e) {} });
                        if (c.connT) { clearTimeout(c.connT); c.connT = null; }
                        tone.inCall = true;
                        tone.stop();
                        tone.blip([880, 1175]);
                        this._clSenderTune(c);
                        safetyCode(c.pc.localDescription && c.pc.localDescription.sdp, c.pc.remoteDescription && c.pc.remoteDescription.sdp).then((code) => { c.code = code; if (this._cl === c) this._clRender(); });
                        c.tickT = setInterval(() => this._clTick(c), 1000);
                        c.statT = setInterval(() => this._clStats(c), 400);
                    }
                    this._clRender();
                }
                return;
            }
            if (s === 'failed' || ice === 'failed' || s === 'disconnected' || ice === 'disconnected') {
                if (c.st !== 'on' && c.st !== 'reconnect') return;
                const failed = s === 'failed' || ice === 'failed';
                if (!c.lostAt) c.lostAt = Date.now();
                // phones lose a few packets now and then and the connection comes back by itself;
                // only a drop that lasts is shown and repaired
                if (!c.blipT) {
                    c.blipT = setTimeout(() => {
                        c.blipT = null;
                        if (this._cl !== c || !c.lostAt) return;
                        if (c.st === 'on') { c.st = 'reconnect'; this._clRender(); }
                        if (c.role === 'caller' && !c.restartT) this._clRestart(c);
                    }, failed ? 0 : 3500);
                }
            }
        },

        async _clRestart(c) {
            if (this._cl !== c || !c.pc || c.pc.signalingState !== 'stable') return;
            const { ref, update } = H();
            try {
                const offer = await c.pc.createOffer({ iceRestart: true });
                await c.pc.setLocalDescription(offer);
                c.offerV += 1;
                await update(ref(db(), 'calls/' + c.chat), { offer: { sdp: tuneOpus(offer.sdp), type: offer.type, v: c.offerV } });
            } catch (e) { console.warn('ice restart', e); }
            // try again while the network is still out
            c.restartT = setTimeout(() => { c.restartT = null; if (this._cl === c && c.st === 'reconnect') this._clRestart(c); }, 6000);
        },

        // Once a second: the timer, the points, a lost connection that doesn't come back.
        _clTick(c) {
            if (this._cl !== c) return;
            if (c.st === 'on') c.secs += 1;
            if (c.st === 'reconnect' && c.lostAt && Date.now() - c.lostAt > LOST_MS) { this._clEnd('lost'); return; }
            const blocks = Math.floor(c.secs / BLOCK_S);
            if (blocks > (c.blocks || 0)) { c.blocks = blocks; this._clAward(c); }
            const $ = (id) => document.getElementById(id);
            const t = $('clTime'); if (t && c.st === 'on') t.textContent = mmss(c.secs);
            const pill = $('clPillTime'); if (pill) pill.textContent = mmss(c.secs);
            const left = BLOCK_S - (c.secs % BLOCK_S);
            const ring = $('clPtsRing');
            if (ring) ring.style.strokeDashoffset = String(113.1 * (left / BLOCK_S));
            const lt = $('clPtsLeft'); if (lt) lt.textContent = mmss(left);
        },

        _clAward(c) {
            const day = new Date().toISOString().slice(0, 10);
            const key = 'clPts:' + this.authUid + ':' + day;
            let got = 0;
            try { got = Number(localStorage.getItem(key)) || 0; } catch (e) {}
            if (got + BLOCK_PTS > CAP_DAY) { this.showToast('وصلت حد نقاط المكالمات لليوم'); return; }
            this.addPointsAtomic(BLOCK_PTS).then((p) => {
                if (p == null) return;
                try { localStorage.setItem(key, String(got + BLOCK_PTS)); } catch (e) {}
                c.pts += BLOCK_PTS;
                tone.blip([988, 1319, 1568]);
                const box = document.getElementById('clCall');
                if (box) {
                    const f = document.createElement('div');
                    f.className = 'cl-float';
                    f.textContent = '+' + BLOCK_PTS + ' نقاط';
                    box.appendChild(f);
                    setTimeout(() => f.remove(), 2600);
                }
                const e = document.getElementById('clEarned'); if (e) e.textContent = c.pts;
                if (c.min) this.showToast('انضافتلك ' + BLOCK_PTS + ' نقاط من المكالمة');
            });
        },

        // Sound levels for the animation and the network bars, from the connection's own numbers
        // (the other side's audio isn't routed through Web Audio, so echo cancellation keeps working).
        async _clStats(c) {
            if (this._cl !== c || !c.pc) return;
            let lvl = 0, my = 0, loss = 0, rtt = 0, jit = 0;
            try {
                const st = await c.pc.getStats();
                st.forEach((r) => {
                    if (r.type === 'inbound-rtp' && r.kind === 'audio') {
                        lvl = r.audioLevel || 0; jit = r.jitter || 0;
                        const lost = r.packetsLost || 0, rec = r.packetsReceived || 0;
                        const dl = lost - (c.lastLost || 0), dr = rec - (c.lastRec || 0);
                        loss = dl + dr > 0 ? dl / (dl + dr) : 0;
                        c.lastLost = lost; c.lastRec = rec;
                    }
                    if (r.type === 'media-source' && r.kind === 'audio') my = r.audioLevel || 0;
                    if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') rtt = r.currentRoundTripTime || 0;
                    if (r.type === 'candidate-pair' && r.selected) rtt = r.currentRoundTripTime || rtt;
                });
            } catch (e) { return; }
            c.lossA = (c.lossA || 0) * 0.85 + loss * 0.15;
            loss = c.lossA;
            const q = loss > 0.08 || rtt > 0.6 || jit > 0.08 ? 1 : loss > 0.02 || rtt > 0.3 || jit > 0.04 ? 2 : 3;
            const orb = document.getElementById('clOrb');
            if (orb) {
                const s = Math.min(1, Math.sqrt(lvl) * 1.6);
                orb.style.setProperty('--lv', s.toFixed(3));
                orb.classList.toggle('talk', s > 0.12);
            }
            const me = document.getElementById('clMeLv');
            if (me) me.style.setProperty('--lv', Math.min(1, Math.sqrt(my) * 1.6).toFixed(3));
            if (q !== c.q) {
                c.q = q;
                const bars = document.getElementById('clBars');
                if (bars) { bars.dataset.q = q; bars.title = q === 1 ? 'الشبكة ضعيفة' : ''; }
                const w = document.getElementById('clWeak'); if (w) w.classList.toggle('show', q === 1);
            }
        },

        // Ends the call for this side. remote: the other side ended it (so nothing is written back).
        _clEnd(why, remote) {
            const c = this._cl;
            if (!c) return;
            if (why === 'end' && remote && c.st === 'in') why = 'miss';
            this._cl = null;
            tone.stop();
            tone.inCall = false;
            [c.ringT, c.restartT, c.connT, c.blipT].forEach((t) => t && clearTimeout(t));
            if (c.onHide) window.removeEventListener('pagehide', c.onHide);
            [c.tickT, c.statT].forEach((t) => t && clearInterval(t));
            c.offs.forEach((off) => { try { off(); } catch (e) {} });
            if (c.onOnline) window.removeEventListener('online', c.onOnline);
            if (c.note) try { c.note.close(); } catch (e) {}
            if (c.pc) try { c.pc.close(); } catch (e) {}
            if (c.stream) c.stream.getTracks().forEach((t) => t.stop());
            if (c.audio) { try { c.audio.srcObject = null; } catch (e) {} c.audio.remove(); }
            (c.disc || []).forEach((d) => { try { d.cancel(); } catch (e) {} });
            const { ref, set, update } = H();
            if (db()) {
                const st = why === 'no' ? 'no' : why === 'miss' ? 'miss' : why === 'busy' ? 'busy' : 'end';
                if (!remote) update(ref(db(), 'calls/' + c.chat), { st, by: this.authUid }).catch(() => {});
                if (c.role === 'caller') set(ref(db(), 'callRing/' + c.other.uid + '/' + this.authUid), null).catch(() => {});
                else set(ref(db(), 'callRing/' + this.authUid + '/' + c.other.uid), null).catch(() => {});
                if (c.role === 'caller') this._clLog(c, c.startedAt ? 'done' : why === 'no' ? 'no' : why === 'busy' ? 'busy' : why === 'cancel' ? 'cancel' : 'miss');
            }
            const msg = { end: 'انتهت المكالمة', cancel: 'انلغت المكالمة', no: c.role === 'caller' ? 'رفض المكالمة' : 'رفضت المكالمة', busy: 'مشغول بمكالمة ثانية', miss: c.role === 'caller' ? 'ما رد' : 'فاتتك مكالمة', lost: 'انقطع الاتصال', mic: 'ما اشتغل المايك', fail: 'ما كدرت أتصل، جرب مرة ثانية', gone: 'انتهت المكالمة' }[why] || 'انتهت المكالمة';
            this._clBye(c, msg);
        },

        // The call as a message in the chat, like WhatsApp's "voice call 4:12".
        _clLog(c, st) {
            const { ref, update } = H();
            const now = Date.now();
            const me = this.currentUser || {};
            const known = this.currentChatUid === c.other.uid ? this.currentChatOther || {} : {};
            const text = st === 'done' ? 'مكالمة صوتية ' + mmss(c.secs) : 'مكالمة فائتة';
            const u = {};
            u['privateChats/' + c.chat + '/messages/' + now] = { id: now, from: this.authUid, to: c.other.uid, createdAt: now, type: 'call', st, dur: c.secs };
            const mine = { otherUid: c.other.uid, otherName: c.other.name || known.name || 'طالب', otherAvatar: c.other.avatar || known.avatar || '', lastMessage: text, lastAt: now, unread: false };
            const theirs = { otherUid: this.authUid, otherName: me.fullName || 'طالب', otherAvatar: me.avatar || '', otherStudentNumber: me.studentNumber || '', lastMessage: text, lastAt: now, unread: true };
            Object.keys(mine).forEach((k) => { u['userChats/' + this.authUid + '/' + c.other.uid + '/' + k] = mine[k]; });
            Object.keys(theirs).forEach((k) => { u['userChats/' + c.other.uid + '/' + this.authUid + '/' + k] = theirs[k]; });
            update(ref(db()), u).catch((e) => console.warn('call log', e));
        },

        // ---------- the screen ----------
        _clRender() {
            const c = this._cl;
            let box = document.getElementById('clCall');
            let pill = document.getElementById('clPill');
            if (!c) { if (box) box.remove(); if (pill) pill.remove(); return; }
            if (c.min && (c.st === 'on' || c.st === 'reconnect' || c.st === 'out' || c.st === 'connecting')) {
                if (box) box.classList.add('cl-hide');
                if (!pill) {
                    pill = document.createElement('button');
                    pill.id = 'clPill'; pill.className = 'cl-pill';
                    pill.onclick = () => this.clMax();
                    document.body.appendChild(pill);
                }
                pill.innerHTML = `<span class="cl-pill-dot"></span><i data-lucide="phone" class="w-4 h-4"></i><span>${esc(c.other.name)}</span><span id="clPillTime" dir="ltr">${c.st === 'on' ? mmss(c.secs) : '...'}</span>`;
                lucide.createIcons();
                return;
            }
            if (pill) pill.remove();
            if (!box) {
                box = document.createElement('div');
                box.id = 'clCall';
                box.className = 'cl-call';
                // the moving background is made once, so redraws never restart it
                box.innerHTML = '<div class="cl-bg"><span></span><span></span><span></span></div><div class="cl-in"></div>';
                document.body.appendChild(box);
            }
            box.classList.remove('cl-hide', 'cl-bye');
            // buttons slide in only when the call moves to a new stage, not on every redraw
            box.classList.toggle('cl-enter', box.dataset.st !== c.st);
            const ini = String(c.other.name || 'طالب').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('');
            const ringing = c.st === 'out' || c.st === 'in';
            const dots = '<span class="cl-dots"><i></i><i></i><i></i></span>';
            const status = { out: 'جاي يرن' + dots, in: 'مكالمة صوتية واردة', connecting: 'جاي يتصل' + dots, on: mmss(c.secs), reconnect: 'جاي يرجع الاتصال' + dots }[c.st] || '';
            const left = BLOCK_S - (c.secs % BLOCK_S);
            const canSpk = c.audio && typeof c.audio.setSinkId === 'function';
            box.dataset.st = c.st;
            box.querySelector('.cl-in').innerHTML = `
                <div class="cl-top">
                    ${c.st !== 'in' ? `<button class="cl-ic" onclick="app.clMin()" aria-label="تصغير"><i data-lucide="chevron-down" class="w-6 h-6"></i></button>` : '<span></span>'}
                    <button class="cl-lock" onclick="app.clCode()"><i data-lucide="lock" class="w-3.5 h-3.5"></i> مشفّرة بين الطرفين</button>
                    <span class="cl-bars" id="clBars" data-q="${c.q}"><i></i><i></i><i></i></span>
                </div>
                ${c.showCode ? `<div class="cl-code" onclick="app.clCode()">
                    <div class="cl-code-t">رمز الأمان</div>
                    <div class="cl-code-n" dir="ltr">${c.code ? esc(c.code) : 'يطلع بعد ما يرد'}</div>
                    <div class="cl-code-d">الصوت يروح مشفّر من تلفونك لتلفونه مباشرة، ولا أحد بالنص يكدر يسمعه، حتى إحنا. إذا هذا الرقم نفسه عند صاحبك، فمكالمتكم ما يسمعها غيركم.</div>
                </div>` : ''}
                <div class="cl-mid">
                    <div class="cl-orb ${ringing ? 'cl-ringing' : ''}" id="clOrb">
                        <span class="cl-wave"></span><span class="cl-wave"></span><span class="cl-wave"></span>
                        <span class="cl-halo"></span>
                        <div class="cl-avw"><b class="cl-ini">${esc(ini)}</b><div class="cl-av" id="clAv"></div></div>
                    </div>
                    <div class="cl-name">${esc(c.other.name)}</div>
                    <div class="cl-status ${c.st === 'reconnect' ? 'warn' : ''}" id="clTime" dir="${c.st === 'on' ? 'ltr' : 'rtl'}">${status}</div>
                    ${c.otherMuted && c.st === 'on' ? '<div class="cl-chip"><i data-lucide="mic-off" class="w-3.5 h-3.5"></i> كاتم الصوت</div>' : ''}
                    <div class="cl-chip cl-weak ${c.q === 1 && c.st === 'on' ? 'show' : ''}" id="clWeak"><i data-lucide="wifi-low" class="w-3.5 h-3.5"></i> الشبكة ضعيفة</div>
                </div>
                ${c.st === 'on' || c.st === 'reconnect' ? `
                <div class="cl-pts">
                    <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18"></circle><circle id="clPtsRing" cx="20" cy="20" r="18" style="stroke-dashoffset:${(113.1 * left / BLOCK_S).toFixed(1)}"></circle></svg>
                    <div><b>+${BLOCK_PTS} نقاط</b> بعد <span id="clPtsLeft" dir="ltr">${mmss(left)}</span><small>جمعت بهذي المكالمة: <span id="clEarned">${c.pts}</span></small></div>
                </div>` : ''}
                <div class="cl-btns">
                    ${c.st === 'in' ? `
                        <div class="cl-b"><button class="cl-round cl-red" onclick="app.clDecline()" aria-label="رفض"><i data-lucide="phone-off" class="w-7 h-7"></i></button><span>رفض</span></div>
                        <div class="cl-b"><button class="cl-round cl-green cl-bounce" onclick="app.clAccept()" aria-label="رد"><i data-lucide="phone" class="w-7 h-7"></i></button><span>رد</span></div>
                    ` : `
                        ${canSpk ? `<div class="cl-b"><button class="cl-round cl-soft ${c.spk ? 'on' : ''}" onclick="app.clSpeaker()" aria-label="السماعة"><i data-lucide="volume-2" class="w-6 h-6"></i></button><span>السماعة</span></div>` : ''}
                        <div class="cl-b"><button class="cl-round cl-soft ${c.muted ? 'on' : ''}" onclick="app.clMute()" aria-label="كتم" ${c.stream ? '' : 'disabled'}><span class="cl-me" id="clMeLv"></span><i data-lucide="${c.muted ? 'mic-off' : 'mic'}" class="w-6 h-6"></i></button><span>${c.muted ? 'مكتوم' : 'كتم'}</span></div>
                        <div class="cl-b"><button class="cl-round cl-red" onclick="app.clHangup()" aria-label="إنهاء"><i data-lucide="phone-off" class="w-7 h-7"></i></button><span>إنهاء</span></div>
                    `}
                </div>`;
            lucide.createIcons();
            this._clPaintAv(c);
        },

        // The goodbye screen: how long, how many points, then it slides away.
        _clBye(c, msg) {
            const pill = document.getElementById('clPill');
            if (pill) pill.remove();
            const box = document.getElementById('clCall');
            if (!box) { this.showToast(msg); return; }
            box.classList.remove('cl-hide');
            box.dataset.st = 'bye';
            const mid = box.querySelector('.cl-mid');
            const orb = box.querySelector('.cl-orb'); if (orb) orb.classList.remove('cl-ringing', 'talk');
            const st = box.querySelector('#clTime');
            if (st) { st.textContent = msg + (c.secs ? ' · ' + mmss(c.secs) : ''); st.setAttribute('dir', 'rtl'); }
            if (mid && c.pts) { const d = document.createElement('div'); d.className = 'cl-chip cl-gold'; d.textContent = 'ربحت ' + c.pts + ' نقطة من المكالمة'; mid.appendChild(d); }
            box.querySelectorAll('.cl-btns, .cl-pts, .cl-top .cl-ic').forEach((el) => { el.style.pointerEvents = 'none'; el.style.opacity = '0'; });
            tone.blip([660, 440]);
            setTimeout(() => { box.classList.add('cl-bye'); }, 1400);
            setTimeout(() => { if (!this._cl) box.remove(); }, 1900);
        },
    });
})();
