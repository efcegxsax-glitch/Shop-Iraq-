// Premium: the four parts that use the AI tutor (the Worker, modes pexam / pgrade / psummary, and cards / plan with a Premium flag):
//  - an exam made from the student's own handout, answered here and marked with an explanation of the mistakes (a few free a month, then Premium);
//  - a summary of a handout, a lecture link or photos, with review questions (Premium);
//  - review cards made from the student's own notebook pages (Premium);
//  - the week's plan re-ordered after missed sessions (Premium).
// The Worker decides who may use what from the database (premium/{uid}, premCfg); this file only shows the screens and the Worker's answers.
// Loaded by app._need('premai').
(function () {
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const $ = (id) => document.getElementById(id);
    const AR = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
    const SUBJ = ['الأحياء', 'الفيزياء', 'الكيمياء', 'الرياضيات', 'اللغة العربية', 'اللغة الإنجليزية', 'التربية الإسلامية'];
    const MAX_B64 = 1900000;
    const exKey = () => 'isp_pexams_' + (app.authUid || 'guest');
    const loadEx = () => { try { const a = JSON.parse(localStorage.getItem(exKey()) || '[]'); return Array.isArray(a) ? a.filter((x) => x && x.id && Array.isArray(x.secs)) : []; } catch (e) { return []; } };
    const saveEx = (a) => { try { localStorage.setItem(exKey(), JSON.stringify(a.slice(0, 10))); } catch (e) { /* the phone is full: the exam is simply not kept */ } };
    const month = () => { const d = new Date(Date.now() + 3 * 3600000); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; };
    const leftKey = (k) => 'isp_pq_' + k + '_' + (app.authUid || '') + '_' + month();
    const getLeft = (k) => { try { const v = localStorage.getItem(leftKey(k)); return v == null ? null : Number(v); } catch (e) { return null; } };
    const setLeft = (k, v) => { try { if (v == null) localStorage.removeItem(leftKey(k)); else localStorage.setItem(leftKey(k), String(v)); } catch (e) {} };
    let imgs = { exam: [], summary: [] }, busy = false, lastSum = null;

    // ---------- the full-screen box these parts live in ----------
    function overlay(title, html, back) {
        let w = $('pmFull');
        if (!w) {
            w = document.createElement('div'); w.id = 'pmFull'; w.className = 'pa-ov';
            w.innerHTML = '<div class="pa-top"><button class="pa-x" aria-label="رجوع"><i data-lucide="chevron-right"></i></button><b class="pa-t"></b></div><div class="pa-body"></div>';
            document.body.appendChild(w);
        }
        w.querySelector('.pa-x').onclick = back || closeOv;
        w.querySelector('.pa-t').textContent = title;
        w.querySelector('.pa-body').innerHTML = html;
        w.querySelector('.pa-body').scrollTop = 0;
        try { lucide.createIcons(); } catch (e) {}
    }
    function closeOv() { $('pmFull')?.remove(); imgs = { exam: [], summary: [] }; busy = false; }
    const spinner = (t, s) => `<div class="pa-wait"><span class="yr-spin"></span><b>${esc(t)}</b>${s ? `<small>${esc(s)}</small>` : ''}</div>`;

    // photos of pages -> JPEGs of at most 1600px that fit what the Worker takes
    function pickImages(max) {
        return new Promise((resolve) => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
            inp.onchange = async () => {
                const out = [];
                for (const f of Array.from(inp.files || []).slice(0, max)) {
                    try {
                        const url = URL.createObjectURL(f);
                        const d = await new Promise((res, rej) => {
                            const im = new Image();
                            im.onload = () => {
                                let side = 1600, q = 0.82, data = '';
                                for (let i = 0; i < 4; i++) {
                                    const k = Math.min(1, side / Math.max(im.width, im.height)), c = document.createElement('canvas');
                                    c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
                                    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
                                    data = c.toDataURL('image/jpeg', q).split(',')[1];
                                    if (data.length <= MAX_B64) break;
                                    side = Math.round(side * 0.75); q = 0.7;
                                }
                                URL.revokeObjectURL(url); data.length <= MAX_B64 ? res(data) : rej(new Error('big'));
                            };
                            im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
                            im.src = url;
                        });
                        out.push({ type: 'image/jpeg', data: d });
                    } catch (e) { /* a file that is not a picture is skipped */ }
                }
                resolve(out);
            };
            inp.click();
        });
    }

    // the Worker (through the tutor's own request helper); the answer's error becomes a sentence
    async function post(body) {
        await app._need('tutor');
        return app._ttPost(body);
    }
    function errText(e, part) {
        const c = e && e.code, st = e && e.status;
        if (st === 402 && c === 'quota') return { m: 'خلصت الامتحانات المجانية هالشهر. اشترك Premium وكمّل بدون حد.', pay: true };
        if (st === 402) return { m: 'هذا الجزء من Premium. اشترك حتى ينفتح.', pay: true };
        if (st === 403) return { m: 'هذا الجزء مو متاح هسه.' };
        if (c === 'no_captions') return { m: 'هذا الفيديو ما بيه ترجمة أكدر أقراها. الصق نص المحاضرة أو ملاحظاتك بدالها.' };
        if (c === 'url') return { m: 'الرابط مو رابط فيديو يوتيوب.' };
        if (c === 'short') return { m: 'المادة قصيرة. الصق نص أطول (أكثر من 200 حرف) أو صوّر صفحات.' };
        if (st === 429 || c === 'slow_down') return { m: 'على كيفك، انتظر دقيقة وجرب مرة ثانية.' };
        if (c === 'busy') return { m: 'المعلم مشغول هسه، جرب بعد دقيقة.' };
        if (navigator.onLine === false) return { m: 'ماكو نت، تأكد من الاتصال.' };
        return { m: part === 'grade' ? 'ما كدرت أصحح، جرب مرة ثانية.' : 'ما كدرت أكمل، جرب مرة ثانية.' };
    }
    const showErr = (e, part, feature) => {
        const x = errText(e, part), el = $('paErr');
        if (el) el.innerHTML = esc(x.m) + (x.pay ? ` <button class="pa-lnk" onclick="app.premPaywall('${feature}')">اشترك</button>` : '');
    };

    // ====================== an exam from the student's handout ======================
    function examsList() {
        const list = loadEx();
        if (!list.length) return '';
        return `<h4 class="pa-h">امتحاناتي</h4>` + list.map((x) => `<div class="pa-ex"><div class="pa-ext"><b>${esc(x.t)}</b><small>${esc(x.sub || '')} · ${new Date(x.at || 0).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short' })}${x.grade ? ' · درجتك ' + AR(x.grade.total) + '/' + AR(x.grade.max) : ''}</small></div>
            <div class="pa-exa"><button onclick="app.pmExamOpen('${x.id}')">افتح</button><button class="g" onclick="app.pmAnswer('${x.id}')">${x.grade ? 'صحّح من جديد' : 'جاوب وصحّح'}</button>${x.grade ? `<button onclick="app.pmGradeShow('${x.id}')">نتيجتي</button>` : ''}<button class="d" onclick="app.pmExamDel('${x.id}')" aria-label="حذف"><i data-lucide="trash-2"></i></button></div></div>`).join('');
    }
    function examForm() {
        const prem = app.premActive(), l = getLeft('exam'), lim = Math.max(0, Math.round(Number(app.premCfg().freeExams)) >= 0 && app.premCfg().freeExams != null ? Math.round(Number(app.premCfg().freeExams)) : 2);
        const hint = prem ? 'مشترك Premium: امتحانات بدون حد.' : 'الطالب العادي ' + AR(lim) + ' امتحان بالشهر' + (l != null ? '، وباقي لك ' + AR(l) : '') + '. مع Premium بدون حد.';
        overlay('امتحان من ملزمتي', `<div class="pa-form">
            <p class="pa-hint">${esc(hint)}</p>
            <label>المادة<select id="paSub">${SUBJ.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
            <label>الفصل أو الموضوع<input id="paCh" maxlength="120" placeholder="مثلاً: الفصل الثالث، الخلية"></label>
            <label>مادة الملزمة<textarea id="paTx" rows="7" maxlength="40000" placeholder="الصق نص الملزمة هنا، أو صوّر صفحاتها بالزر اللي تحت"></textarea></label>
            <button class="pa-b" onclick="app.pmPick('exam')"><i data-lucide="camera"></i><span>صوّر صفحات الملزمة (حد أقصى 4)</span><em id="paImgN">${imgs.exam.length ? AR(imgs.exam.length) + ' صور' : ''}</em></button>
            <div class="pa-row"><label>الدرجة<select id="paTot"><option>50</option><option>100</option></select></label><label>عدد الأسئلة<select id="paNq">${[3, 4, 5, 6].map((n) => `<option${n === 4 ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
            <button class="pa-go" id="paGo" onclick="app.pmExamGo()"><i data-lucide="sparkles"></i>سوّي الامتحان</button>
            <p id="paErr" class="pa-err"></p>
        </div>${examsList()}`);
    }

    // ====================== summary ======================
    function sumForm() {
        overlay('ملخص ذكي', `<div class="pa-form">
            <p class="pa-hint">الصق نص ملزمة أو محاضرة، أو رابط فيديو يوتيوب (يشتغل إذا الفيديو بيه ترجمة)، أو صوّر صفحات. يطلعلك ملخص وأسئلة مراجعة.</p>
            <label>المادة (اختياري)<select id="paSub"><option value="">بدون</option>${SUBJ.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
            <label>النص<textarea id="paTx" rows="7" maxlength="30000" placeholder="الصق النص هنا"></textarea></label>
            <label>أو رابط فيديو يوتيوب<input id="paUrl" dir="ltr" placeholder="https://youtu.be/..."></label>
            <button class="pa-b" onclick="app.pmPick('summary')"><i data-lucide="camera"></i><span>صوّر صفحات (حد أقصى 4)</span><em id="paImgN">${imgs.summary.length ? AR(imgs.summary.length) + ' صور' : ''}</em></button>
            <button class="pa-go" id="paGo" onclick="app.pmSummaryGo()"><i data-lucide="sparkles"></i>لخّص</button>
            <p id="paErr" class="pa-err"></p>
        </div>`);
    }
    function sumView(s) {
        overlay(s.title || 'الملخص', `<div class="pa-sum">
            <h4 class="pa-h">النقاط الرئيسية</h4><ul class="pa-pts">${s.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
            ${s.terms.length ? `<h4 class="pa-h">مصطلحات مهمة</h4>${s.terms.map((x) => `<div class="pa-term"><b>${esc(x.t)}</b><span>${esc(x.d)}</span></div>`).join('')}` : ''}
            ${s.questions.length ? `<h4 class="pa-h">أسئلة مراجعة</h4>${s.questions.map((x, i) => `<button class="pa-q" onclick="this.classList.toggle('open')"><b>${esc(x.q)}</b><span>${esc(x.a)}</span></button>`).join('')}` : ''}
            <div class="pa-acts"><button class="pa-go" onclick="app.pmSumCards()"><i data-lucide="layers"></i>حوّلها لبطاقات مراجعة</button><button class="pa-b" onclick="app.pmSumCopy()"><i data-lucide="copy"></i><span>انسخ الملخص</span></button><button class="pa-b" onclick="app.pmSummary()"><i data-lucide="plus"></i><span>ملخص جديد</span></button></div>
        </div>`, () => sumForm());
    }

    // review cards: the screen of the cards page that lets him pick which to keep and into which deck
    async function toCards(cards, title) {
        const list = cards.filter((c) => c && c.q && c.a);
        if (!list.length) { app.showToast('ما كو شي أسويه بطاقات'); return; }
        closeOv();
        await app._need('cards');
        app.goToCards();
        app._kdScr = { s: 'snap', from: null, deck: '', busy: false, cards: list, pick: list.map(() => true), title: title || '' };
        app._kdRender();
    }

    Object.assign(app, {
        // ---------- exam ----------
        pmExam() { imgs.exam = []; examForm(); },
        pmPick(kind) {
            pickImages(4).then((a) => { if (!a.length) return; imgs[kind] = a; const n = $('paImgN'); if (n) n.textContent = AR(a.length) + ' صور'; });
        },
        async pmExamGo() {
            if (busy) return;
            const text = String($('paTx')?.value || '').trim();
            if (text.length < 200 && !imgs.exam.length) { const e = $('paErr'); if (e) e.textContent = 'الصق نص الملزمة (أكثر من 200 حرف) أو صوّر صفحات.'; return; }
            const meta = { subject: $('paSub').value, chapter: String($('paCh')?.value || '').trim(), total: Number($('paTot').value) || 50, nq: Number($('paNq').value) || 4 };
            busy = true;
            const photos = imgs.exam.slice();
            overlay('امتحان من ملزمتي', spinner('المعلم دا يكتب الامتحان...', 'تاخذ حدود دقيقة، لا تطلع من الصفحة'));
            try {
                const r = await post({ mode: 'pexam', text, images: photos, ...meta });
                if (!r || r.error || !Array.isArray(r.sections)) throw Object.assign(new Error('x'), { code: r && r.error, status: 200 });
                const secs = r.sections, tot = secs.reduce((n, s) => n + (s.parts || []).reduce((m, p) => m + (Number(p.m) || 0), 0), 0);
                const x = { id: 'p' + Date.now().toString(36), k: 'gen', at: Date.now(), sub: meta.subject, ch: meta.chapter, t: r.title || 'امتحان', tot: tot || meta.total, dur: Math.max(30, Math.min(180, Math.round((tot || meta.total) * 1.2))), secs };
                saveEx([x, ...loadEx()]);
                setLeft('exam', typeof r.left === 'number' ? r.left : null);
                busy = false; imgs.exam = [];
                this.pmExamOpen(x.id);
                examForm();
            } catch (e) {
                busy = false; examForm(); showErr(e, 'exam', 'exam');
            }
        },
        async pmExamOpen(id) {
            const x = loadEx().find((e) => e.id === id); if (!x) return;
            try { await this._need('exams'); } catch (e) { this.showToast('ما انحملت الصفحة، حاول مرة ثانية'); return; }
            this.exOpenLocal(x);
        },
        pmExamDel(id) { saveEx(loadEx().filter((x) => x.id !== id)); examForm(); },
        pmAnswer(id) {
            const x = loadEx().find((e) => e.id === id); if (!x) return;
            const old = (x.grade && x.grade.answers) || {};
            overlay('جاوب وصحّح', `<div class="pa-form">
                <p class="pa-hint">اكتب جوابك لكل فرع (اللي ما تعرفه خليه فاضي). بعدها المعلم يصحّح ويشرح أخطاءك.</p>
                ${x.secs.map((s) => `<div class="pa-sec"><b>${esc(s.n)}: ${esc(s.head)}</b>${(s.parts || []).map((p) => `<label>${esc(p.l)}- ${esc(p.q)} <small>(${AR(p.m)} درجة)</small><textarea rows="3" maxlength="1500" data-n="${esc(s.n)}" data-l="${esc(p.l)}">${esc(old[s.n + '|' + p.l] || '')}</textarea></label>`).join('')}</div>`).join('')}
                <button class="pa-go" id="paGo" onclick="app.pmGradeGo('${id}')"><i data-lucide="check-check"></i>صحّح لي</button>
                <p id="paErr" class="pa-err"></p></div>`, () => examForm());
        },
        async pmGradeGo(id) {
            if (busy) return;
            const list = loadEx(), x = list.find((e) => e.id === id); if (!x) return;
            const answers = Array.from(document.querySelectorAll('#pmFull textarea[data-n]')).map((t) => ({ n: t.dataset.n, l: t.dataset.l, a: t.value.trim() }));
            if (!answers.some((a) => a.a)) { const e = $('paErr'); if (e) e.textContent = 'اكتب جواب واحد على الأقل.'; return; }
            busy = true;
            overlay('جاوب وصحّح', spinner('المعلم دا يصحّح...', 'ثواني'));
            try {
                const r = await post({ mode: 'pgrade', exam: { title: x.t, sections: x.secs }, answers: answers.filter((a) => a.a) });
                if (!r || r.error || !Array.isArray(r.items)) throw Object.assign(new Error('x'), { code: r && r.error, status: 200 });
                const map = {}; answers.forEach((a) => { map[a.n + '|' + a.l] = a.a; });
                x.grade = { total: r.total, max: r.max, items: r.items, tip: r.tip, answers: map, at: Date.now() };
                saveEx(list);
                setLeft('grade', typeof r.left === 'number' ? r.left : null);
                busy = false; this.pmGradeShow(id);
            } catch (e) { busy = false; this.pmAnswer(id); showErr(e, 'grade', 'exam'); }
        },
        pmGradeShow(id) {
            const x = loadEx().find((e) => e.id === id); if (!x || !x.grade) return;
            const g = x.grade, pct = g.max ? Math.round(g.total / g.max * 100) : 0, col = pct >= 80 ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626';
            overlay('نتيجتي', `<div class="pa-sum">
                <div class="pa-score" style="--c:${col}"><b>${AR(g.total)}<small>/${AR(g.max)}</small></b><span>${AR(pct)}%</span></div>
                ${g.tip ? `<p class="pa-tip"><i data-lucide="lightbulb"></i>${esc(g.tip)}</p>` : ''}
                ${g.items.map((it) => { const part = ((x.secs.find((s) => s.n === it.n) || {}).parts || []).find((p) => p.l === it.l) || {}; const full = it.got >= it.m, ans = (g.answers || {})[it.n + '|' + it.l];
                    return `<div class="pa-it ${full ? 'ok' : it.got > 0 ? 'mid' : 'bad'}"><div class="pa-ith"><b>${esc(it.n)} - ${esc(it.l)}</b><em>${AR(it.got)}/${AR(it.m)}</em></div>
                        <p class="pa-iq">${esc(part.q || '')}</p>${ans ? `<p class="pa-ia"><small>جوابك:</small> ${esc(ans)}</p>` : '<p class="pa-ia"><small>ما جاوبت</small></p>'}<p class="pa-ifb">${esc(it.fb)}</p></div>`; }).join('')}
                <div class="pa-acts"><button class="pa-go" onclick="app.pmAnswer('${id}')"><i data-lucide="rotate-ccw"></i>جاوب من جديد</button><button class="pa-b" onclick="app.pmExam()"><i data-lucide="list"></i><span>امتحاناتي</span></button></div></div>`, () => examForm());
        },

        // ---------- summary ----------
        pmSummary() { imgs.summary = []; sumForm(); },
        async pmSummaryGo() {
            if (busy) return;
            const text = String($('paTx')?.value || '').trim(), url = String($('paUrl')?.value || '').trim(), subject = $('paSub')?.value || '';
            if (text.length < 200 && !url && !imgs.summary.length) { const e = $('paErr'); if (e) e.textContent = 'الصق نص (أكثر من 200 حرف) أو رابط يوتيوب أو صوّر صفحات.'; return; }
            busy = true;
            const photos = imgs.summary.slice();
            overlay('ملخص ذكي', spinner('المعلم دا يلخّص...', 'ثواني'));
            try {
                const r = await post({ mode: 'psummary', text, url: text.length >= 200 ? '' : url, images: photos, subject });
                if (!r || r.error || !Array.isArray(r.points)) throw Object.assign(new Error('x'), { code: r && r.error, status: 200 });
                busy = false; lastSum = r; imgs.summary = [];
                sumView(r);
            } catch (e) { busy = false; sumForm(); showErr(e, 'summary', 'summary'); }
        },
        pmSumCopy() {
            const s = lastSum; if (!s) return;
            const t = [s.title, '', ...s.points.map((p) => '- ' + p), '', ...s.terms.map((x) => x.t + ': ' + x.d), '', ...s.questions.map((x) => 'س: ' + x.q + '\nج: ' + x.a)].join('\n');
            (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => this.showToast('اننسخ الملخص'), () => this.showToast('ما كدرت أنسخ'));
        },
        pmSumCards() {
            const s = lastSum; if (!s) return;
            toCards([...s.questions.map((x) => ({ q: x.q, a: x.a })), ...s.terms.map((x) => ({ q: 'شنو معنى: ' + x.t + '؟', a: x.d }))], s.title);
        },

        // ---------- cards from the student's notebooks ----------
        async pmCards() {
            overlay('بطاقات من ملاحظاتي', spinner('دا أجيب دفاترك...'));
            let list = [];
            try { await this._need('notegeom'); await this._need('notes'); list = await this.ntNotesForCards(); } catch (e) { /* no notebooks */ }
            if (!list.length) { overlay('بطاقات من ملاحظاتي', '<div class="pa-form"><p class="pa-hint">ما عندك دفاتر بعد. اكتب ملاحظاتك بدفتر الملاحظات وبعدها حوّلها لبطاقات من هنا.</p><button class="pa-go" onclick="app.premClose();app.goToNotes()"><i data-lucide="pen-tool"></i>افتح دفتر الملاحظات</button></div>'); return; }
            overlay('بطاقات من ملاحظاتي', `<div class="pa-form"><p class="pa-hint">اختار دفتر. المعلم يقرا أول 4 صفحات مكتوبة بيه ويسويها بطاقات (سؤال وجواب). بعدها تختار منها اللي تريده وتنضاف لمراجعتك الذكية.</p>
                ${list.map((n) => `<button class="pa-nb" onclick="app.pmCardsGo('${n.id}')"><i data-lucide="notebook-pen"></i><span><b>${esc(n.title)}</b><small>${AR(n.pages)} ${n.pages === 1 ? 'صفحة' : 'صفحات'}</small></span><i data-lucide="chevron-left"></i></button>`).join('')}<p id="paErr" class="pa-err"></p></div>`);
        },
        async pmCardsGo(id) {
            if (busy) return;
            busy = true;
            const all = [];
            let title = '';
            try {
                const n = (await this.ntNotesForCards()).find((x) => x.id === id), pages = n ? Math.min(n.pages, 8) : 0;
                let done = 0;
                for (let i = 0; i < pages && done < 4; i++) {
                    const data = await this.ntPageJpeg(id, i);
                    if (!data) continue;
                    done++;
                    overlay('بطاقات من ملاحظاتي', spinner('المعلم دا يقرا الصفحة ' + AR(done) + '...', 'تاخذ ثواني لكل صفحة'));
                    const r = await post({ mode: 'cards', src: 'notes', image: { type: 'image/jpeg', data }, subject: '' });
                    if (r && r.error) throw Object.assign(new Error('x'), { code: r.error, status: 200 });
                    title = title || (r && r.title) || '';
                    (r && r.cards || []).forEach((c) => { if (c && c.q && c.a && all.length < 40) all.push(c); });
                }
                busy = false;
                if (!all.length) { await this.pmCards(); const e = $('paErr'); if (e) e.textContent = 'ما لكيت بالدفتر كتابة أسويها بطاقات. اكتب ملاحظات أكثر وجرب.'; return; }
                toCards(all, title || (n && n.title) || '');
            } catch (e) { busy = false; await this.pmCards(); showErr(e, 'cards', 'cards'); }
        },

        // ---------- the week's plan, re-ordered ----------
        async pmReplan() {
            const key = 'isp_plan_' + (this.authUid || 'guest');
            let p = null;
            try { p = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
            if (!p || !Array.isArray(p.days) || !p.days.length) { this.showToast('سوّي خطة الأسبوع أول، وبعدها أعيد ترتيبها'); this.goToPlan(); return; }
            const today = this.localDateStr(), done = p.done || {};
            const missed = [];
            p.days.forEach((d, i) => { if (d.date < today) (d.tasks || []).forEach((t, j) => { if (!done[i + '_' + j]) missed.push((t.s ? t.s + ': ' : '') + t.t); }); });
            const keep = p.days.filter((d) => d.date < today);
            const NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
            const days = [];
            for (let i = 0; i < 7; i++) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i); days.push({ date: this.localDateStr(d), name: NAMES[d.getDay()] }); }
            if (!missed.length && !(await this.ask({ icon: 'calendar-sync', tone: 'primary', title: 'أعيد ترتيب خطتك؟', text: 'ما فاتتك مهام. المعلم يسوي خطة جديدة للأيام الجاية ويحسب ما خلصته.', ok: 'أعد الترتيب' }))) return;
            this.showToast('المعلم دا يعيد ترتيب خطتك...');
            try {
                const context = this._ttContext ? await this._ttContext().catch(() => '') : '';
                const note = (missed.length ? 'فاتتني هذي المهام وأريد توزيعها على الأيام الباقية مع مهامي: ' + missed.slice(0, 8).join('؛ ') : 'أعد ترتيب الخطة حسب جدولي') + (p.note ? '. ' + p.note : '');
                const r = await post({ mode: 'plan', replan: true, days, hours: p.hours || 2, note, context });
                if (!r || !Array.isArray(r.days)) throw new Error('bad');
                const fresh = r.days.map((d) => ({ date: String(d.date), d: String(d.d), tasks: Array.isArray(d.tasks) ? d.tasks : [] }));
                const keptDone = {}; keep.forEach((_, i) => { (p.days[i].tasks || []).forEach((__, j) => { if (done[i + '_' + j]) keptDone[i + '_' + j] = 1; }); });
                localStorage.setItem(key, JSON.stringify({ at: Date.now(), summary: String(r.summary || p.summary || ''), hours: p.hours || 2, days: [...keep, ...fresh], done: keptDone, note: p.note || '' }));
                this.showToast(missed.length ? 'وزّع المعلم المهام اللي فاتتك على الأيام الجاية' : 'انرتبت الخطة من جديد');
                if (this.currentView === 'planView') this.plOpen(); else this.goToPlan();
            } catch (e) { const x = errText(e, 'plan'); this.showToast(x.m); if (x.pay) this.premPaywall('plan'); }
        },
        premClose() { closeOv(); },
    });
})();
