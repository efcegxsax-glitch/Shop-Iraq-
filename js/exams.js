// الامتحانات: (1) ورقة أسئلة A4 تنعمل من ملزمة (الذكاء يسويها من لوحة التحكم، تنحفظ بـ exams/{id} بـ k:'gen')،
// تنعرض بنمط الوزاري وبلوكو التطبيق، وتنحفظ صورة أو PDF أو تنطبع. (2) أسئلة وزارية سابقة PDF (k:'past') حسب السنة،
// الملف مقطّع بـ examFiles/{id}/{i}، والطالب يفتحه أو يمتحن نفسه بالوقت. Loaded by app._need('exams').
(function () {
    const SUBJ = [
        { n: 'الأحياء', c: '#16A34A', i: 'dna' }, { n: 'الفيزياء', c: '#2563EB', i: 'atom' }, { n: 'الكيمياء', c: '#DC2626', i: 'flask-conical' },
        { n: 'الرياضيات', c: '#7C3AED', i: 'sigma' }, { n: 'اللغة العربية', c: '#B45309', i: 'languages' }, { n: 'اللغة الإنجليزية', c: '#0891B2', i: 'book-a' },
        { n: 'التربية الإسلامية', c: '#0F766E', i: 'moon-star' },
    ];
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const $ = (id) => document.getElementById(id);
    const H = () => window.firebaseDbHelpers;
    const AR = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
    const W = 794, PH = 1123, PAD_X = 56, PAD_T = 44, FOOT = 46;
    let EX = [], S = { sub: '', tab: 'gen', year: 'all' }, un = null, loaded = false, cur = null, pages = [], logo = '', timer = null;

    const PAPER_CSS = `.exp-page{box-sizing:border-box;width:${W}px;height:${PH}px;padding:${PAD_T}px ${PAD_X}px ${FOOT}px;background:#fff;color:#111;direction:rtl;text-align:right;font-family:"Traditional Arabic","Noto Naskh Arabic","Droid Arabic Naskh","Amiri",Tahoma,serif;font-size:19px;line-height:1.75;position:relative;overflow:hidden}
.exp-bsm{text-align:center;font-weight:700;font-size:20px;margin-bottom:6px}
.exp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:8px}
.exp-brand{display:flex;align-items:center;gap:10px}.exp-brand img{width:64px;height:64px;border-radius:14px}
.exp-brand b{display:block;font-size:24px;line-height:1.2}.exp-brand small{display:block;font-size:14px;color:#444}
.exp-meta{font-size:17px;line-height:1.55;min-width:250px}.exp-meta div{white-space:nowrap}
.exp-title{text-align:center;font-weight:700;font-size:22px;margin:8px 0 10px;text-decoration:underline}
.exp-mini{display:flex;align-items:center;justify-content:space-between;border-bottom:1.5px solid #111;padding-bottom:6px;margin-bottom:10px;font-size:15px}
.exp-mini span{display:flex;align-items:center;gap:8px}.exp-mini img{width:28px;height:28px;border-radius:8px}
.exp-sh{font-weight:700;font-size:20px;margin-top:10px;display:flex;justify-content:space-between;gap:12px}
.exp-sh i,.exp-p i{font-style:normal;white-space:nowrap}
.exp-p{display:flex;justify-content:space-between;gap:14px;margin:4px 0 4px 0;padding-inline-start:14px}
.exp-p span{flex:1}.exp-p b{margin-inline-end:4px}
.exp-end{text-align:center;margin-top:16px;font-weight:700}
.exp-foot{position:absolute;left:${PAD_X}px;right:${PAD_X}px;bottom:14px;display:flex;justify-content:space-between;align-items:center;font-size:15px;color:#333}
.exp-foot em{font-style:normal;font-weight:700}`;

    // ---------- the paper ----------
    function headBlock(x) {
        return `<div class="exp-bsm">بسم الله الرحمن الرحيم</div>
<div class="exp-head"><div class="exp-brand"><img src="${logo}" alt="" /><div><b>أكاديمي السادس</b><small>تطبيق الطالب العراقي</small></div></div>
<div class="exp-meta"><div>الدراسة: الإعدادية / السادس</div><div>المادة: ${esc(x.sub)}</div><div>الموضوع: ${esc(x.ch || x.t)}</div><div>الوقت: ${AR(x.dur || 180)} دقيقة</div><div>الدرجة الكلية: ${AR(x.tot || 100)}</div></div></div>
<div class="exp-title">${esc(x.t)}</div>`;
    }
    const miniBlock = (x) => `<div class="exp-mini"><span><img src="${logo}" alt="" />أكاديمي السادس</span><span>${esc(x.sub)} - ${esc(x.ch || x.t)}</span></div>`;
    function blocks(x) {
        const out = [{ h: headBlock(x), first: true }];
        (x.secs || []).forEach((s) => {
            const head = `<div class="exp-sh"><span><b>${esc(s.n)}:</b> ${esc(s.head)}</span><i>(${AR(s.marks)} درجة)</i></div>`;
            (s.parts || []).forEach((p, i) => {
                const part = `<div class="exp-p"><span><b>${esc(p.l)}-</b> ${esc(p.q)}</span><i>(${AR(p.m)} ${p.m >= 3 && p.m <= 10 ? 'درجات' : 'درجة'})</i></div>`;
                out.push({ h: (i === 0 ? head : '') + part });
            });
        });
        out.push({ h: '<div class="exp-end">انتهت الأسئلة، مع تمنياتنا لكم بالتوفيق</div>' });
        return out;
    }
    // split into A4 pages by measuring each block in a hidden box
    function paginate(x) {
        const probe = document.createElement('div');
        probe.style.cssText = `position:fixed;left:-9999px;top:0;width:${W - PAD_X * 2}px;visibility:hidden`;
        probe.innerHTML = `<style>${PAPER_CSS}</style><div class="exp-page" style="height:auto;width:${W - PAD_X * 2}px;padding:0"></div>`;
        document.body.appendChild(probe);
        const box = probe.querySelector('.exp-page');
        const hh = (h) => { box.innerHTML = h; return box.scrollHeight; };
        const room = PH - PAD_T - FOOT - 20, res = [[]];
        let used = 0;
        blocks(x).forEach((b) => {
            const h = hh(b.h) + 2;
            if (used + h > room && res[res.length - 1].length) { res.push([]); used = hh(miniBlock(x)) + 12; }
            res[res.length - 1].push(b.h); used += h;
        });
        probe.remove();
        const n = res.length;
        return res.map((list, i) => `<div class="exp-page">${i === 0 ? '' : miniBlock(x)}${list.join('')}<div class="exp-foot"><span>${i < n - 1 ? 'قلّب الصفحة' : ''}</span><em dir="ltr">${AR(i + 1)} / ${AR(n)}</em><span>${esc(x.sub)}</span></div></div>`);
    }
    async function logoData() {
        if (logo) return;
        try {
            const b = await (await fetch('icons/icon-192.png')).blob();
            logo = await new Promise((res) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = () => res(''); f.readAsDataURL(b); });
        } catch (e) { logo = ''; }
    }
    async function openPaper(id) {
        const x = EX.find((e) => e.id === id); if (!x) return;
        await logoData();
        cur = x; pages = paginate(x);
        let w = $('exPaper'); if (w) w.remove();
        w = document.createElement('div'); w.id = 'exPaper'; w.className = 'ex-paper';
        w.innerHTML = `<div class="ex-bar"><button onclick="app.exClosePaper()" aria-label="رجوع"><i data-lucide="chevron-right"></i></button><b>${esc(x.t)}</b></div>
            <div class="ex-acts"><button onclick="app.exSave('png')"><i data-lucide="image"></i>صورة</button><button onclick="app.exSave('pdf')"><i data-lucide="file-down"></i>PDF</button><button onclick="app.exPrint()"><i data-lucide="printer"></i>طباعة</button><button onclick="app.exStart('${esc(x.id)}')"><i data-lucide="timer"></i>امتحن نفسي</button></div>
            <div class="ex-pages" id="exPages"></div>`;
        document.body.appendChild(w);
        const box = $('exPages'), k = Math.min(1, (box.clientWidth - 16) / W);
        box.innerHTML = pages.map((p) => `<div class="ex-pw" style="width:${Math.round(W * k)}px;height:${Math.round(PH * k)}px"><div class="ex-pi" style="transform:scale(${k})"><style>${PAPER_CSS}</style>${p}</div></div>`).join('');
        try { lucide.createIcons(); } catch (e) {}
    }
    function pageCanvas(html, scale) {
        return new Promise((res, rej) => {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PH}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${PAPER_CSS}</style>${html.replace(/ \/>/g, '/>')}</div></foreignObject></svg>`;
            const im = new Image();
            im.onload = () => { const cv = document.createElement('canvas'); cv.width = W * scale; cv.height = PH * scale; const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height); res(cv); };
            im.onerror = () => rej(new Error('draw'));
            im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        });
    }
    const blobOf = (cv, type, q) => new Promise((res) => cv.toBlob(res, type, q));
    function makePdf(jpgs) {
        const enc = new TextEncoder(), parts = [], off = [];
        let pos = 0;
        const push = (u) => { parts.push(u); pos += u.length; };
        const txt = (s) => push(enc.encode(s));
        txt('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
        const n = jpgs.length, kids = jpgs.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
        off[1] = pos; txt('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
        off[2] = pos; txt(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`);
        jpgs.forEach((j, i) => {
            const p = 3 + i * 3, c = p + 1, m = p + 2, content = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
            off[p] = pos; txt(`${p} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${m} 0 R >> >> /Contents ${c} 0 R >>\nendobj\n`);
            off[c] = pos; txt(`${c} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
            off[m] = pos; txt(`${m} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.b.length} >>\nstream\n`); push(j.b); txt('\nendstream\nendobj\n');
        });
        const total = 3 + n * 3, xr = pos;
        let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
        for (let i = 1; i < total; i++) x += String(off[i]).padStart(10, '0') + ' 00000 n \n';
        txt(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
        return new Blob(parts, { type: 'application/pdf' });
    }
    async function deliver(blob, name) {
        try {
            const f = new File([blob], name, { type: blob.type });
            if (navigator.canShare && navigator.canShare({ files: [f] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ files: [f], title: name }); return; }
        } catch (e) { if (e && e.name === 'AbortError') return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    const fname = () => 'امتحان-' + String((cur && (cur.ch || cur.t)) || 'ورقة').replace(/[^؀-ۿa-zA-Z0-9]+/g, '-').slice(0, 40);

    // ---------- the list ----------
    function listen() {
        if (un || !window.firebaseDb) return;
        const { ref, onValue } = H();
        un = onValue(ref(window.firebaseDb, 'exams'), (snap) => {
            const v = snap.exists() ? snap.val() : {};
            EX = Object.values(v).filter((x) => x && x.id && (x.k === 'gen' || x.k === 'past')).sort((a, b) => (b.at || 0) - (a.at || 0));
            loaded = true; paint();
        }, () => { loaded = true; paint(); });
    }
    function paint() {
        const box = $('exContent'); if (!box) return;
        const sub = $('exSub'); if (sub) sub.textContent = S.sub || 'اختر المادة';
        if (!loaded) { box.innerHTML = '<div class="ex-empty"><span class="yr-spin"></span></div>'; return; }
        if (!S.sub) {
            box.innerHTML = `<div class="ex-grid">${SUBJ.map((s) => { const g = EX.filter((x) => x.sub === s.n); return `<button class="ex-sj" style="--c:${s.c}" onclick="app.exSubj(${jsArg(s.n)})"><i><i data-lucide="${s.i}"></i></i><b>${esc(s.n)}</b><small>${g.length ? g.length + ' امتحان' : 'ما بعد'}</small></button>`; }).join('')}</div>`;
        } else {
            const mine = EX.filter((x) => x.sub === S.sub), gen = mine.filter((x) => x.k === 'gen'), past = mine.filter((x) => x.k === 'past');
            const yrs = Array.from(new Set(past.map((x) => x.yr))).sort((a, b) => b - a);
            let body;
            if (S.tab === 'gen') body = gen.length ? gen.map((x) => `<button class="ex-card" onclick="app.exOpen2('${esc(x.id)}')"><i><i data-lucide="file-text"></i></i><span><b>${esc(x.t)}</b><small>${esc(x.ch || '')} . ${AR(x.tot || 100)} درجة . ${AR(x.dur || 180)} دقيقة</small></span><em><i data-lucide="chevron-left"></i></em></button>`).join('') : '<div class="ex-empty"><i data-lucide="file-question"></i><b>ما أكو امتحانات من الملازم لهذه المادة بعد</b></div>';
            else {
                const list = past.filter((x) => S.year === 'all' || String(x.yr) === String(S.year));
                body = (yrs.length ? `<div class="ex-chips"><button class="${S.year === 'all' ? 'on' : ''}" onclick="app.exYear('all')">الكل</button>${yrs.map((y) => `<button class="${String(S.year) === String(y) ? 'on' : ''}" onclick="app.exYear('${y}')">${y}</button>`).join('')}</div>` : '')
                    + (list.length ? list.map((x) => `<div class="ex-card past"><i><i data-lucide="landmark"></i></i><span><b>${esc(x.yr)} - ${esc(x.rd || '')}</b><small>${AR(x.dur || 180)} دقيقة . ${Math.round((x.size || 0) / 1048576 * 10) / 10} MB</small></span><div><button onclick="app.exPastOpen('${esc(x.id)}')">افتح</button><button class="go" onclick="app.exStart('${esc(x.id)}')">امتحن نفسي</button></div></div>`).join('') : '<div class="ex-empty"><i data-lucide="file-question"></i><b>ما أكو أسئلة وزارية لهذه المادة بعد</b></div>');
            }
            box.innerHTML = `<div class="ex-tabs"><button class="${S.tab === 'gen' ? 'on' : ''}" onclick="app.exTab('gen')">امتحانات الملازم (${gen.length})</button><button class="${S.tab === 'past' ? 'on' : ''}" onclick="app.exTab('past')">أسئلة وزارية (${past.length})</button></div>${body}`;
        }
        try { lucide.createIcons(); } catch (e) {}
    }

    // ---------- a timed sitting ----------
    function stopTimer() { clearInterval(timer); timer = null; $('exTimer')?.remove(); }
    const clock = (s) => { s = Math.max(0, Math.floor(s)); return (s >= 3600 ? Math.floor(s / 3600) + ':' : '') + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
    function startTimer(x) {
        stopTimer();
        const end = Date.now() + (x.dur || 180) * 60000, w = document.createElement('div');
        w.id = 'exTimer'; w.className = 'ex-timer';
        w.innerHTML = `<span><i data-lucide="timer"></i><b id="exTL"></b></span><button onclick="app.exFinish()">انتهيت</button>`;
        document.body.appendChild(w); try { lucide.createIcons(); } catch (e) {}
        timer = setInterval(() => {
            const left = (end - Date.now()) / 1000, t = $('exTL'); if (t) t.textContent = clock(left);
            if (left <= 0) { stopTimer(); app.showToast('انتهى وقت الامتحان'); }
        }, 500);
        app._exSat = { x, at: Date.now() };
    }
    async function pastBlob(x) {
        const { ref, get } = H(), parts = [];
        for (let i = 0; i < (x.n || 1); i++) {
            const v = (await get(ref(window.firebaseDb, 'examFiles/' + x.id + '/' + i))).val();
            if (typeof v !== 'string') throw new Error('missing');
            const bin = atob(v), u = new Uint8Array(bin.length);
            for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
            parts.push(u);
            const t = $('exLoad'); if (t) t.textContent = 'دا يحمّل ' + Math.round((i + 1) / (x.n || 1) * 100) + '%';
        }
        return new Blob(parts, { type: 'application/pdf' });
    }

    Object.assign(app, {
        exOpen() { S = { sub: S.sub, tab: S.tab, year: 'all' }; listen(); paint(); },
        exSubj(n) { S.sub = n; S.tab = 'gen'; S.year = 'all'; paint(); },
        exTab(t) { S.tab = t; paint(); },
        exYear(y) { S.year = y; paint(); },
        exBack() { if (S.sub) { S.sub = ''; paint(); return true; } return false; },
        exOpen2(id) { openPaper(id).catch((e) => { console.warn(e); this.showToast('ما انفتحت الورقة'); }); },
        exClosePaper() { $('exPaper')?.remove(); pages = []; },
        async exSave(kind) {
            if (!pages.length) return;
            this.showToast('دا يجهّز الملف...');
            try {
                const cvs = []; for (const p of pages) cvs.push(await pageCanvas(p, 2));
                if (kind === 'png') {
                    if (cvs.length === 1) await deliver(await blobOf(cvs[0], 'image/png'), fname() + '.png');
                    else for (let i = 0; i < cvs.length; i++) await deliver(await blobOf(cvs[i], 'image/png'), fname() + '-' + (i + 1) + '.png');
                } else {
                    const js = [];
                    for (const cv of cvs) { const b = await blobOf(cv, 'image/jpeg', 0.92); js.push({ w: cv.width, h: cv.height, b: new Uint8Array(await b.arrayBuffer()) }); }
                    await deliver(makePdf(js), fname() + '.pdf');
                }
            } catch (e) { console.warn(e); this.showToast('ما كدرت أسوي الملف، جرّب مرة ثانية'); }
        },
        exPrint() {
            if (!pages.length) return;
            if (window.IspNative) { this.showToast('احفظ الورقة PDF من زر PDF، وافتحها واطبعها من تطبيق الملفات'); return; }
            let f = $('exPrintBox'); f?.remove();
            f = document.createElement('div'); f.id = 'exPrintBox';
            f.innerHTML = `<style>${PAPER_CSS}@media screen{#exPrintBox{display:none}}@media print{body>*:not(#exPrintBox){display:none!important}#exPrintBox{display:block!important}.exp-page{page-break-after:always;margin:0;width:210mm;height:296mm;zoom:.9}@page{size:A4;margin:0}}</style>${pages.join('')}`;
            document.body.appendChild(f);
            setTimeout(() => { try { window.print(); } catch (e) {} setTimeout(() => f.remove(), 1500); }, 150);
        },
        exStart(id) {
            const x = EX.find((e) => e.id === id); if (!x) return;
            startTimer(x);
            if (x.k === 'past') this.exPastOpen(id); else this.showToast('بدأ الوقت: ' + (x.dur || 180) + ' دقيقة. بالتوفيق');
        },
        exFinish() {
            const s = this._exSat; stopTimer();
            if (s) this.showToast('خلصت بـ ' + Math.max(1, Math.round((Date.now() - s.at) / 60000)) + ' دقيقة من ' + (s.x.dur || 180));
            this._exSat = null;
        },
        async exPastOpen(id) {
            const x = EX.find((e) => e.id === id); if (!x) return;
            const win = window.open('', '_blank');
            this.showToast('دا يحمّل الأسئلة...');
            const t = document.createElement('div'); t.id = 'exLoad'; t.className = 'ex-load'; document.body.appendChild(t);
            try {
                const url = URL.createObjectURL(await pastBlob(x));
                if (win) win.location.href = url; else { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.download = x.t + '.pdf'; document.body.appendChild(a); a.click(); a.remove(); }
                setTimeout(() => URL.revokeObjectURL(url), 120000);
            } catch (e) { if (win) win.close(); this.showToast('ما كدرت أحمّل الملف، تأكد من النت'); }
            t.remove();
        },
    });
})();
