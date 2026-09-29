// المعلم الذكي (AI tutor): a chat with Claude through our own server (tutor-worker/), whose
// address the admin sets in siteConfig/tutorUrl. The student can type a question or send a
// photo of one; the answer streams in as it is written. The conversation is kept on the
// device (isp_tutor_<uid>). Loaded on demand by app._need('tutor').
(function () {
    const KEEP = 40, SEND = 20, IMG_MAX = 1280;
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const STARTERS = [
        ['book-open', 'اشرحلي درس', 'اشرحلي '],
        ['camera', 'حل سؤال بالصورة', ''],
        ['list-checks', 'اسألني أسئلة مراجعة', 'اسألني 5 أسئلة مراجعة عن '],
        ['file-text', 'لخصلي فصل', 'لخصلي فصل '],
    ];

    // light markdown: headings, bold, lists, inline code; everything escaped first
    function md(text) {
        const lines = esc(text).split('\n'), out = [];
        let list = null;
        const inline = (s) => s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code dir="ltr">$1</code>');
        const close = () => { if (list) { out.push('</' + list + '>'); list = null; } };
        lines.forEach((l) => {
            const t = l.trim();
            let m;
            if (!t) { close(); return; }
            if ((m = t.match(/^#{1,3}\s+(.*)$/))) { close(); out.push('<h4 dir="auto">' + inline(m[1]) + '</h4>'); return; }
            if ((m = t.match(/^[-•*]\s+(.*)$/))) { if (list !== 'ul') { close(); list = 'ul'; out.push('<ul>'); } out.push('<li dir="auto">' + inline(m[1]) + '</li>'); return; }
            if ((m = t.match(/^(\d+)[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); list = 'ol'; out.push('<ol>'); } out.push('<li dir="auto">' + inline(m[2]) + '</li>'); return; }
            close();
            out.push('<p dir="auto">' + inline(t) + '</p>');
        });
        close();
        return out.join('');
    }

    // a photo, made smaller: max 1280 px, JPEG; plus a small thumbnail for the history
    function shrink(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file), img = new Image();
            img.onload = () => {
                const k = Math.min(1, IMG_MAX / Math.max(img.width, img.height));
                const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                const big = c.toDataURL('image/jpeg', 0.82);
                const t = document.createElement('canvas'), tk = Math.min(1, 220 / Math.max(img.width, img.height));
                t.width = Math.round(img.width * tk); t.height = Math.round(img.height * tk);
                t.getContext('2d').drawImage(img, 0, 0, t.width, t.height);
                URL.revokeObjectURL(url);
                resolve({ data: big.split(',')[1], type: 'image/jpeg', thumb: t.toDataURL('image/jpeg', 0.7) });
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
            img.src = url;
        });
    }

    Object.assign(app, {
        tutorOpen() {
            this._tt = this._tt || { msgs: this._ttLoad(), busy: false, img: null };
            document.body.classList.add('tutor-on');
            this._ttRender();
            setTimeout(() => document.getElementById('ttInput')?.focus({ preventScroll: true }), 300);
        },
        tutorClose() { document.body.classList.remove('tutor-on'); if (this._tt && this._tt.abort) this._tt.abort.abort(); },

        _ttKey() { return 'isp_tutor_' + (this.authUid || 'guest'); },
        _ttLoad() { try { return (JSON.parse(localStorage.getItem(this._ttKey()) || '[]') || []).slice(-KEEP); } catch (e) { return []; } },
        _ttSave() {
            const list = this._tt.msgs.filter((m) => !m.pending).slice(-KEEP);
            try { localStorage.setItem(this._ttKey(), JSON.stringify(list)); } catch (e) {
                // storage full: drop the thumbnails first
                try { localStorage.setItem(this._ttKey(), JSON.stringify(list.map((m) => Object.assign({}, m, { thumb: undefined })))); } catch (err) {}
            }
        },

        _ttUrl() { const c = this.siteConfig || {}; return /^https:\/\/[^\s]+$/.test(String(c.tutorUrl || '')) ? c.tutorUrl : ''; },

        _ttRender() {
            const box = document.getElementById('ttBody');
            if (!box || !this._tt) return;
            const t = this._tt;
            if (!this._ttUrl()) {
                box.innerHTML = `<div class="tt-off"><span class="tt-orb big"><i data-lucide="sparkles"></i></span><b>المعلم الذكي بعده ما مفعّل</b><p>راح يشتغل قريباً إن شاء الله.</p></div>`;
                document.getElementById('ttComposer')?.classList.add('hidden');
                lucide.createIcons();
                return;
            }
            document.getElementById('ttComposer')?.classList.remove('hidden');
            box.innerHTML = t.msgs.length ? t.msgs.map((m, i) => this._ttBubble(m, i)).join('') : `
                <div class="tt-hello">
                    <span class="tt-orb big"><i data-lucide="sparkles"></i></span>
                    <b>هلا ${esc(((this.currentUser || {}).fullName || '').split(' ')[0] || 'بيك')}، شنو نذاكر اليوم؟</b>
                    <p>اسألني بأي مادة، أو صوّر السؤال وأحله وياك خطوة بخطوة.</p>
                    <div class="tt-starts">${STARTERS.map(([ic, label, text], i) => `<button onclick="app.ttStarter(${i})"><i data-lucide="${ic}"></i>${label}</button>`).join('')}</div>
                </div>`;
            lucide.createIcons();
            this._ttScroll();
            this._ttComposer();
        },

        _ttBubble(m, i) {
            if (m.role === 'user') return `<div class="tt-msg me">${m.thumb ? `<img src="${esc(m.thumb)}" alt="صورة السؤال">` : ''}${m.content ? `<p dir="auto">${esc(m.content)}</p>` : ''}</div>`;
            const body = (m.content ? md(m.content) : m.error ? '' : '<span class="tt-typing"><i></i><i></i><i></i></span>') + (m.error ? `<p class="tt-err">${esc(m.error)}</p>` : '');
            return `<div class="tt-msg ai${m.pending ? ' live' : ''}" id="ttMsg${i}"><span class="tt-orb"><i data-lucide="sparkles"></i></span><div class="tt-txt">${body}</div></div>`;
        },

        _ttScroll() { const box = document.getElementById('ttBody'); if (box) box.scrollTop = box.scrollHeight; },

        _ttComposer() {
            const t = this._tt, send = document.getElementById('ttSend'), prev = document.getElementById('ttPreview');
            if (send) { send.innerHTML = t.busy ? '<i data-lucide="square"></i>' : '<i data-lucide="send"></i>'; send.classList.toggle('stop', t.busy); send.setAttribute('aria-label', t.busy ? 'أوقف' : 'إرسال'); }
            if (prev) { prev.innerHTML = t.img ? `<img src="${esc(t.img.thumb)}" alt=""><button onclick="app.ttDropImage()" aria-label="شيل الصورة"><i data-lucide="x"></i></button>` : ''; prev.classList.toggle('hidden', !t.img); }
            lucide.createIcons();
        },

        ttStarter(i) {
            const s = STARTERS[i];
            if (!s) return;
            if (!s[2]) { document.getElementById('ttFile')?.click(); return; }
            const inp = document.getElementById('ttInput');
            if (inp) { inp.value = s[2]; inp.focus(); this.ttAutosize(inp); }
        },
        ttAutosize(el) { el.style.height = 'auto'; el.style.height = Math.min(140, el.scrollHeight) + 'px'; },
        ttKey(e) { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); this.ttSend(); } },

        async ttPickImage(input) {
            const f = input.files && input.files[0];
            input.value = '';
            if (!f) return;
            if (!/^image\//.test(f.type)) { this.showToast('اختار صورة'); return; }
            try { this._tt.img = await shrink(f); this._ttComposer(); } catch (e) { this.showToast('ما كدرت أقرا الصورة'); }
        },
        ttDropImage() { this._tt.img = null; this._ttComposer(); },

        ttNew() {
            if (!this._tt || this._tt.busy) return;
            this._tt.msgs = [];
            this._ttSave();
            this._ttRender();
        },

        async ttSend() {
            const t = this._tt;
            if (!t) return;
            if (t.busy) { if (t.abort) t.abort.abort(); return; }
            const inp = document.getElementById('ttInput'), text = String(inp && inp.value || '').trim().slice(0, 4000);
            if (!text && !t.img) return;
            if (!this.isLoggedIn || !window.firebaseAuth || !window.firebaseAuth.currentUser) { this.showToast('سجّل دخولك حتى تسأل المعلم'); this.goToAuth('login'); return; }
            const url = this._ttUrl();
            if (!url) return;
            const img = t.img;
            t.msgs.push({ role: 'user', content: text || 'حل هذا السؤال', thumb: img ? img.thumb : undefined });
            const ans = { role: 'assistant', content: '', pending: true };
            t.msgs.push(ans);
            t.img = null; t.busy = true;
            if (inp) { inp.value = ''; this.ttAutosize(inp); }
            this._ttRender();
            const idx = t.msgs.length - 1;
            const history = t.msgs.slice(0, -1).filter((m) => !m.error && m.content).slice(-SEND).map((m) => ({ role: m.role, content: m.content }));
            t.abort = new AbortController();
            let stop = '';
            try {
                const token = await window.firebaseAuth.currentUser.getIdToken();
                const res = await fetch(url, {
                    method: 'POST', signal: t.abort.signal,
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ messages: history, image: img ? { type: img.type, data: img.data } : undefined }),
                });
                if (!res.ok || !res.body) throw Object.assign(new Error('http'), { status: res.status });
                // server-sent events: data: {"t": "..."} ... data: {"done": true, "stop": "..."}
                const reader = res.body.getReader(), dec = new TextDecoder();
                let buf = '', last = 0;
                for (;;) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buf += dec.decode(value, { stream: true });
                    let cut;
                    while ((cut = buf.indexOf('\n\n')) >= 0) {
                        const line = buf.slice(0, cut).trim(); buf = buf.slice(cut + 2);
                        if (!line.startsWith('data:')) continue;
                        let ev; try { ev = JSON.parse(line.slice(5)); } catch (e) { continue; }
                        if (ev.t) ans.content += ev.t;
                        if (ev.error) throw Object.assign(new Error(ev.error), { code: ev.error });
                        if (ev.done) stop = ev.stop || '';
                    }
                    // redraw the answer at most ~12 times a second
                    const now = performance.now();
                    if (now - last > 80) { last = now; this._ttLive(idx); }
                }
                if (stop === 'refusal') ans.error = 'ما أكدر أجاوب على هذا السؤال. جرّب تسأله بطريقة ثانية.';
                else if (!ans.content) ans.error = 'ما وصل جواب، حاول مرة ثانية.';
                else if (stop === 'max_tokens') ans.content += '\n\n(الجواب طويل وانقطع، اكتب "كمّل" حتى أكمله)';
            } catch (e) {
                if (e.name === 'AbortError') { if (!ans.content) ans.error = 'وكفت الجواب.'; }
                else {
                    const s = e.status, c = e.code || '';
                    ans.error = s === 401 ? 'انتهت جلستك، سجّل دخول مرة ثانية.'
                        : s === 429 || c === 'slow_down' ? 'على كيفك، سألت هواية بدقيقة وحدة. انتظر شوية وارجع اسأل.'
                        : c === 'busy' ? 'المعلم مشغول هسه، حاول بعد دقيقة.'
                        : c === 'key' ? 'المعلم بعده ما مضبوط، بلّغ الإدارة.'
                        : !navigator.onLine ? 'ماكو نت، تأكد من الاتصال.'
                        : 'صار خلل، حاول مرة ثانية.';
                }
            }
            delete ans.pending;
            t.busy = false; t.abort = null;
            this._ttSave();
            this._ttRender();
        },

        _ttLive(idx) {
            const el = document.getElementById('ttMsg' + idx), m = this._tt && this._tt.msgs[idx];
            if (!el || !m) return;
            const box = document.getElementById('ttBody'), near = box && box.scrollHeight - box.scrollTop - box.clientHeight < 120;
            el.querySelector('.tt-txt').innerHTML = md(m.content) + '<span class="tt-caret"></span>';
            if (near) this._ttScroll();
        }
    });
})();
