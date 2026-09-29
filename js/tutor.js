// المعلم الذكي (AI tutor): a chat with an AI model through our own server (tutor-worker/), whose
// address the admin sets in siteConfig/tutorUrl. The student can type a question or send a
// photo of one; the answer streams in as it is written. The conversation is kept on the
// device (isp_tutor_<uid>). Loaded on demand by app._need('tutor').
// Each request carries a short report of the student's own studying (days studied, grades,
// exams soon, quiz results) so the tutor can hold them to it. The tutor can also:
// - give a surprise quiz (multiple choice) answered and marked inside the chat;
// - write first, once a day at most, when there is a real reason (app._ttNudgeSoon).
(function () {
    const KEEP = 40, SEND = 20, IMG_MAX = 1280;
    const QUIZ_PTS = 2, QUIZ_DAY_CAP = 30; // points per right answer, and at most this many a day from quizzes
    const DAY = 86400000;
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const STARTERS = [
        ['book-open', 'اشرحلي درس', 'اشرحلي '],
        ['camera', 'حل سؤال بالصورة', ''],
        ['list-checks', 'اختبار مفاجئ', null],
        ['activity', 'شلون دراستي؟', 'شلون دراستي هالفترة؟ حاسبني بصراحة وگلي شنو لازم أسوي.'],
    ];
    const dayStr = (t) => app.localDateStr(new Date(t));

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
            this._ttBadge(false);
            document.getElementById('ttPop')?.remove();
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
            box.innerHTML = (t.msgs.length ? t.msgs.map((m, i) => this._ttBubble(m, i)).join('') : `
                <div class="tt-hello">
                    <span class="tt-orb big"><i data-lucide="sparkles"></i></span>
                    <b>هلا ${esc(((this.currentUser || {}).fullName || '').split(' ')[0] || 'بيك')}، شنو نذاكر اليوم؟</b>
                    <p>اسألني بأي مادة، أو صوّر السؤال وأحله وياك خطوة بخطوة.</p>
                    <div class="tt-starts">${STARTERS.map(([ic, label, text], i) => `<button onclick="app.ttStarter(${i})"><i data-lucide="${ic}"></i>${label}</button>`).join('')}</div>
                </div>`) + (t.picking ? this._ttPicker() : '');
            lucide.createIcons();
            this._ttScroll();
            this._ttComposer();
        },

        _ttBubble(m, i) {
            if (m.quiz) return `<div class="tt-msg ai" id="ttMsg${i}"><span class="tt-orb"><i data-lucide="list-checks"></i></span><div class="tt-txt tt-quiz">${this._ttQuizHtml(m, i)}</div></div>`;
            if (m.role === 'user') return `<div class="tt-msg me">${m.thumb ? `<img src="${esc(m.thumb)}" alt="صورة السؤال">` : ''}${m.content ? `<p dir="auto">${esc(m.content)}</p>` : ''}</div>`;
            const body = (m.content ? md(m.content) : m.error ? '' : '<span class="tt-typing"><i></i><i></i><i></i></span>') + (m.error ? `<p class="tt-err">${esc(m.error)}</p>` : '');
            const offer = !m.pending && !m.error && i === this._tt.msgs.length - 1 && /اختبار/.test(m.content || '') && !this._tt.busy
                ? `<button class="tt-go" onclick="app.ttQuizPick()"><i data-lucide="list-checks"></i>ابدأ اختبار مفاجئ</button>` : '';
            return `<div class="tt-msg ai${m.pending ? ' live' : ''}${m.nudge ? ' nudge' : ''}" id="ttMsg${i}"><span class="tt-orb"><i data-lucide="sparkles"></i></span><div class="tt-txt">${body}${offer}</div></div>`;
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
            if (s[2] === null) { this.ttQuizPick(); return; }
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
            this._tt.picking = false;
            this._ttSave();
            this._ttRender();
        },

        async ttSend() {
            const t = this._tt;
            if (!t) return;
            if (t.busy) { if (t.abort) t.abort.abort(); return; }
            const inp = document.getElementById('ttInput'), text = String(inp && inp.value || '').trim().slice(0, 4000);
            if (!text && !t.img) return;
            t.picking = false;
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
            const history = t.msgs.slice(0, -1).filter((m) => !m.error && m.content && !m.pending).slice(-SEND).map((m) => ({ role: m.role, content: m.content }));
            t.abort = new AbortController();
            let stop = '';
            try {
                const context = await this._ttContext().catch(() => '');
                const token = await window.firebaseAuth.currentUser.getIdToken();
                const res = await fetch(url, {
                    method: 'POST', signal: t.abort.signal,
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ messages: history, image: img ? { type: img.type, data: img.data } : undefined, context }),
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
                else ans.error = this._ttErr(e);
            }
            delete ans.pending;
            t.busy = false; t.abort = null;
            this._ttSave();
            this._ttRender();
        },

        _ttErr(e) {
            const s = e.status, c = e.code || '';
            return s === 401 ? 'انتهت جلستك، سجّل دخول مرة ثانية.'
                : s === 429 || c === 'slow_down' ? 'على كيفك، سألت هواية بدقيقة وحدة. انتظر شوية وارجع اسأل.'
                : c === 'busy' ? 'المعلم مشغول هسه، حاول بعد دقيقة.'
                : c === 'key' ? 'المعلم بعده ما مضبوط، بلّغ الإدارة.'
                : !navigator.onLine ? 'ماكو نت، تأكد من الاتصال.'
                // the code helps find the cause when a student reports it
                : 'صار خلل، حاول مرة ثانية. (' + (c || s || (e.name === 'TypeError' ? 'net' : 'x')) + ')';
        },

        // a JSON request to the tutor's server (quiz, nudge)
        async _ttPost(body) {
            const url = this._ttUrl();
            if (!url || !window.firebaseAuth || !window.firebaseAuth.currentUser) throw Object.assign(new Error('off'), { code: 'off' });
            const token = await window.firebaseAuth.currentUser.getIdToken();
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
            let data = null;
            try { data = await res.json(); } catch (e) {}
            if (!res.ok || !data) throw Object.assign(new Error('http'), { status: res.status, code: data && data.error });
            return data;
        },

        // ---------- the student's record ----------
        _ttQuizLog() { try { return JSON.parse(localStorage.getItem('isp_tutor_quiz_' + this.authUid) || '[]') || []; } catch (e) { return []; } },

        async _ttFacts() {
            const d = await this._ttStudyData(), u = this.currentUser || {}, now = Date.now();
            const act = d.activity || {};
            const studied = (k) => { const a = act[k]; return !!(a && ((a.studySessions || 0) > 0 || (a.tasksDone || 0) > 0)); };
            const sessions = (k) => (act[k] && act[k].studySessions) || 0;
            let daysSince = null, week = 0, lastWeek = 0, days14 = 0;
            for (let i = 0; i < 60; i++) {
                const k = dayStr(now - i * DAY);
                if (daysSince === null && studied(k)) daysSince = i;
                if (i < 7) week += sessions(k); else if (i < 14) lastWeek += sessions(k);
                if (i < 14 && studied(k)) days14++;
            }
            const g = d.grades, drops = [], marks = [];
            (g.subjects || []).forEach((s) => {
                const vals = this._gradeSeries(g, s).map((v, i) => (v === null ? null : { v, i })).filter(Boolean);
                if (!vals.length) return;
                const last = vals[vals.length - 1], prev = vals[vals.length - 2];
                marks.push({ s, v: last.v, p: this.GRADE_PERIODS[last.i][1], prev: prev ? prev.v : null });
                if (prev && prev.v - last.v >= 5) drops.push({ s, from: prev.v, to: last.v });
            });
            const weakest = marks.slice().sort((a, b) => a.v - b.v)[0] || null;
            const exams = (d.exams || []).map((ex) => ({ s: String(ex.subject || ''), days: Math.ceil((new Date(ex.date).getTime() - now) / DAY) }))
                .filter((x) => x.s && x.days >= 0 && x.days <= 21).sort((a, b) => a.days - b.days);
            const quizzes = this._ttQuizLog().slice(-5), mkDue = this._mkDueCount();
            return { mkDue, name: String(u.fullName || '').split(' ')[0], streak: u.loginStreak || 0, daysSince, week, lastWeek, days14, marks, drops, weakest, exams, quizzes };
        },

        async _ttContext() {
            const f = await this._ttFacts(), L = [];
            if (f.name) L.push('الاسم: ' + f.name);
            L.push('آخر جلسة دراسة مسجلة بالتطبيق: ' + (f.daysSince === null ? 'ماكو بآخر شهرين' : f.daysSince === 0 ? 'اليوم' : 'قبل ' + f.daysSince + ' يوم'));
            L.push('جلسات الدراسة: هالأسبوع ' + f.week + '، الأسبوع اللي قبله ' + f.lastWeek + '. درس ' + f.days14 + ' يوم من آخر 14 يوم.');
            if (f.streak) L.push('أيام الدخول المتتالية: ' + f.streak);
            if (f.marks.length) L.push('درجاته: ' + f.marks.map((m) => m.s + ' ' + m.v + ' (' + m.p + (m.prev !== null ? '، قبلها ' + m.prev : '') + ')').join('، '));
            else L.push('ما مسجل درجات بالتطبيق.');
            if (f.exams.length) L.push('امتحانات قريبة: ' + f.exams.slice(0, 4).map((x) => x.s + (x.days === 0 ? ' اليوم' : ' بعد ' + x.days + ' يوم')).join('، '));
            if (f.mkDue) L.push('بدفتر غلطاته ' + f.mkDue + ' سؤال غلط بيه قبل ومستحق يراجعه اليوم.');
            if (f.quizzes.length) L.push('آخر اختباراته المفاجئة: ' + f.quizzes.map((q) => q.s + ' ' + q.r + '/' + q.n).join('، '));
            return L.join('\n').slice(0, 2400);
        },

        // real reasons for the tutor to write first; none means it stays quiet
        _ttReasons(f) {
            const R = [];
            if (f.daysSince === null) R.push('ما مسجل ولا جلسة دراسة بالتطبيق بآخر شهرين');
            else if (f.daysSince >= 2) R.push('صارله ' + f.daysSince + ' أيام ما مسجل جلسة دراسة بالتطبيق');
            if (f.lastWeek >= 4 && f.week < f.lastWeek / 2) R.push('جلسات دراسته هالأسبوع ' + f.week + ' بس، والأسبوع اللي قبله ' + f.lastWeek);
            f.drops.slice(0, 2).forEach((x) => R.push('درجته بـ' + x.s + ' نزلت من ' + x.from + ' إلى ' + x.to));
            f.exams.filter((x) => x.days <= 3).slice(0, 2).forEach((x) => R.push('امتحان ' + x.s + (x.days === 0 ? ' اليوم' : ' بعد ' + x.days + ' يوم')));
            if (f.mkDue >= 3) R.push('عنده ' + f.mkDue + ' أسئلة غلط بيها قبل ومستحقة المراجعة اليوم بدفتر الغلطات');
            if (!R.length && f.weakest && f.weakest.v < 60) {
                const recent = this._ttQuizLog().some((q) => Date.now() - q.t < 7 * DAY);
                if (!recent) R.push('أضعف مادة عنده ' + f.weakest.s + ' (' + f.weakest.v + ')، وما مسوي اختبار مفاجئ من أسبوع');
            }
            return R;
        },

        // ---------- the tutor writes first ----------
        async _ttNudge() {
            if (this._ttNudging || !this.authUid) return;
            this._ttNudging = true;
            try {
                const k = 'isp_tutor_nudge_' + this.authUid, today = this.localDateStr();
                if (localStorage.getItem(k) === today) return;
                localStorage.setItem(k, today);
                const f = await this._ttFacts(), reasons = this._ttReasons(f);
                if (!reasons.length) return;
                const { text } = await this._ttPost({ mode: 'nudge', reasons, context: await this._ttContext() });
                if (!text) return;
                this._tt = this._tt || { msgs: this._ttLoad(), busy: false, img: null };
                if (this._tt.busy) return;
                this._tt.msgs.push({ role: 'assistant', content: text, nudge: true });
                this._ttSave();
                if (this.currentView === 'tutorView') { this._ttRender(); return; }
                this._ttBadge(true);
                this._ttPop(text);
            } catch (e) {
                console.warn('Tutor nudge failed:', e && (e.code || e.message));
            } finally { this._ttNudging = false; }
        },

        _ttPop(text) {
            document.getElementById('ttPop')?.remove();
            const el = document.createElement('div');
            el.id = 'ttPop'; el.className = 'tt-pop'; el.setAttribute('role', 'dialog');
            el.innerHTML = `<span class="tt-orb"><i data-lucide="sparkles"></i></span>
                <div class="tt-pop-b"><b>المعلم</b><p dir="auto">${esc(text.length > 150 ? text.slice(0, 150) + '...' : text)}</p>
                <div class="tt-pop-a"><button class="go" onclick="app.ttPopOpen()">رد عليه</button><button onclick="app.ttPopClose()">بعدين</button></div></div>`;
            document.body.appendChild(el);
            lucide.createIcons();
        },
        ttPopOpen() { document.getElementById('ttPop')?.remove(); this.setTab('tutor'); },
        ttPopClose() { document.getElementById('ttPop')?.remove(); },

        // ---------- surprise quiz ----------
        ttQuizPick() {
            const t = this._tt;
            if (!t || t.busy) return;
            if (!this.isLoggedIn || !this.authUid) { this.showToast('سجّل دخولك حتى تختبر نفسك'); this.goToAuth('login'); return; }
            t.picking = !t.picking;
            this._ttRender();
            if (t.picking) document.getElementById('ttPick')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        },

        _ttPicker() {
            const g = this._gradesLoad();
            const last = (s) => { const x = this._gradeLast(this._gradeSeries(g, s)); return x ? x.v : null; };
            // the weakest subjects first, those without marks after them
            const subs = (g.subjects || []).map((s) => ({ s, v: last(s) })).sort((a, b) => (a.v === null) - (b.v === null) || (a.v || 0) - (b.v || 0));
            this._ttSubs = subs.map((x) => x.s);
            return `<div class="tt-pick" id="ttPick">
                <b>اختبار مفاجئ</b>
                <p>اختار المادة، وإذا تريد اكتب الموضوع. 5 أسئلة، وكل جواب صح عليه ${QUIZ_PTS} نقطة.</p>
                <input id="ttTopic" maxlength="120" placeholder="الموضوع (اختياري)، مثلاً: الفصل الثالث">
                <div class="tt-chips">${subs.map((x, i) => `<button onclick="app.ttQuizStart(${i})">${esc(x.s)}${x.v !== null ? `<small>${x.v}</small>` : ''}</button>`).join('')}</div>
                <button class="tt-cancel" onclick="app.ttQuizPick()">إلغاء</button>
            </div>`;
        },

        async ttQuizStart(i) {
            const t = this._tt, subject = this._ttSubs && this._ttSubs[i];
            if (!t || t.busy || !subject) return;
            const topic = String(document.getElementById('ttTopic')?.value || '').trim().slice(0, 120);
            t.picking = false;
            t.msgs.push({ role: 'user', content: 'اختبرني بـ' + subject + (topic ? ' عن ' + topic : '') });
            const m = { role: 'assistant', content: '', pending: true };
            t.msgs.push(m);
            t.busy = true;
            this._ttRender();
            try {
                const quiz = await this._ttPost({ mode: 'quiz', subject, topic, context: await this._ttContext().catch(() => '') });
                if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) throw new Error('quiz');
                m.quiz = { s: subject, title: String(quiz.title || 'اختبار مفاجئ'), qs: quiz.questions, picks: quiz.questions.map(() => null) };
                m.content = 'اختبار مفاجئ بـ' + subject + ' (' + quiz.questions.length + ' أسئلة)، بعده ما مخلص.';
            } catch (e) {
                m.error = e.status || e.code ? this._ttErr(e) : 'ما كدرت أسوي الاختبار، حاول مرة ثانية.';
            }
            delete m.pending;
            t.busy = false;
            this._ttSave();
            this._ttRender();
        },

        _ttQuizHtml(m, i) {
            const q = m.quiz, n = q.qs.length, L = ['أ', 'ب', 'ج', 'د', 'هـ'];
            const answered = q.picks.filter((p) => p !== null).length, next = q.picks.indexOf(null);
            const show = next < 0 ? n : next + 1; // the answered questions and the next one
            let h = `<div class="tq-head"><b dir="auto">${esc(q.title)}</b><span>${esc(q.s)} · ${answered}/${n}</span></div>`;
            for (let k = 0; k < show; k++) {
                const x = q.qs[k], pick = q.picks[k], done = pick !== null, ok = pick === x.answer;
                h += `<div class="tq-q" id="tq${i}_${k}"><p dir="auto"><b>${k + 1}.</b> ${esc(x.q)}</p><div class="tq-ch">${x.choices.map((c, j) =>
                    `<button dir="auto" class="${done ? (j === x.answer ? 'ok' : j === pick ? 'bad' : 'off') : ''}"${done ? ' disabled' : ` onclick="app.ttQuizAnswer(${i},${k},${j})"`}><span>${L[j] || j + 1}</span>${esc(c)}</button>`).join('')}</div>`
                    + (done ? `<p class="tq-why ${ok ? 'ok' : 'bad'}" dir="auto"><b>${ok ? 'صح.' : 'غلط.'}</b> ${esc(x.why)}</p>` : '') + '</div>';
            }
            if (next < 0) {
                const right = q.qs.filter((x, k) => q.picks[k] === x.answer).length, pct = right / n;
                const say = pct === 1 ? 'ممتاز، كلها صح. استمر هيج.' : pct >= 0.6 ? 'زين، بس راجع اللي غلطت بيهن.' : 'تحتاج مراجعة لهذا الموضوع، لا تأجلها.';
                h += `<div class="tq-score"><div><b>${right}/${n}</b>${q.pts ? `<small>+${q.pts} نقطة</small>` : ''}</div><p>${say}</p>`
                    + (right < n ? `<button class="tt-go" onclick="app.ttAsk('اشرحلي الأسئلة اللي غلطت بيها بالاختبار')"><i data-lucide="lightbulb"></i>اشرحلي غلطاتي</button>` : '') + '</div>';
            }
            return h;
        },

        ttQuizAnswer(i, k, j) {
            const t = this._tt, m = t && t.msgs[i], q = m && m.quiz;
            if (!q || q.picks[k] !== null || !q.qs[k]) return;
            q.picks[k] = j;
            const x = q.qs[k];
            if (j !== x.answer) this._mkAdd({ src: 'quiz', s: q.s, q: x.q, ch: x.choices, a: x.answer, why: x.why, pick: j });
            if (q.picks.indexOf(null) < 0) this._ttQuizDone(m);
            this._ttSave();
            const el = document.querySelector('#ttMsg' + i + ' .tt-txt');
            if (el) { el.innerHTML = this._ttQuizHtml(m, i); lucide.createIcons(); }
            const nx = document.getElementById('tq' + i + '_' + (k + 1)) || el?.querySelector('.tq-score');
            if (nx) setTimeout(() => nx.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 250);
        },

        _ttQuizDone(m) {
            const q = m.quiz, n = q.qs.length, L = ['أ', 'ب', 'ج', 'د', 'هـ'];
            const right = q.qs.filter((x, k) => q.picks[k] === x.answer).length;
            const wrong = q.qs.map((x, k) => ({ x, k, p: q.picks[k] })).filter((w) => w.p !== w.x.answer);
            // the result as text, so the tutor knows it in the rest of the chat
            m.content = 'نتيجة الاختبار المفاجئ بـ' + q.s + ': ' + right + ' من ' + n + '.'
                + (wrong.length ? '\nالأسئلة اللي غلط بيها:\n' + wrong.map((w) => '- ' + w.x.q.slice(0, 160) + ' (جاوب ' + L[w.p] + ') ' + String(w.x.choices[w.p]).slice(0, 60) + '، والصح ' + L[w.x.answer] + ') ' + String(w.x.choices[w.x.answer]).slice(0, 60)).join('\n') : '');
            try {
                const log = this._ttQuizLog();
                log.push({ s: q.s, r: right, n, t: Date.now() });
                localStorage.setItem('isp_tutor_quiz_' + this.authUid, JSON.stringify(log.slice(-30)));
            } catch (e) {}
            // a few points for right answers, at most QUIZ_DAY_CAP a day
            const today = this.localDateStr(), key = 'isp_tutor_qpts_' + this.authUid;
            let led = { d: today, p: 0 };
            try { const o = JSON.parse(localStorage.getItem(key) || 'null'); if (o && o.d === today) led = o; } catch (e) {}
            const pts = Math.max(0, Math.min(right * QUIZ_PTS, QUIZ_DAY_CAP - led.p));
            if (pts > 0) {
                q.pts = pts;
                led.p += pts;
                try { localStorage.setItem(key, JSON.stringify(led)); } catch (e) {}
                this.addPointsAtomic(pts).then((np) => { if (np !== null) this.logDailyActivity({ points: pts, studySessions: 1 }); });
            }
        },

        ttAsk(text) {
            const inp = document.getElementById('ttInput');
            if (!inp || (this._tt && this._tt.busy)) return;
            inp.value = text;
            this.ttSend();
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
