// تلكرام المدرسين: the posts of the teachers' public Telegram channels inside the app. The admin panel picks the channels
// (tgChannels/{name} = {u, n, a, s, o}: user name, title, picture, subject, order). The tutor Worker reads each channel's public
// preview page (mode "tgfeed" / "tgchan"), so the phone never talks to Telegram and nothing is downloaded: a post is its text,
// pictures that stay on Telegram's servers, and for a file only its NAME and SIZE (the file itself opens in Telegram).
// The same file has the "ask for a channel" sheet (students send a link, the admin approves it), used by this page and the
// YouTube teachers page. Loaded by app._need('tgroom').
(function () {
    document.addEventListener('error', (e) => {
        const im = e.target;
        if (!im || im.tagName !== 'IMG' || !im.dataset || !im.dataset.ini || !im.closest('#tgView, #tgSheet')) return;
        const sp = document.createElement('span'); sp.textContent = im.dataset.ini; im.replaceWith(sp);
    }, true);
    const K_FEED = 'isp_tg_feed', K_MUTE = 'isp_tg_mute', K_SEEN = 'isp_tg_seen', K_SEL = 'isp_tg_sel', K_MINE = 'isp_tg_mine', FEED_TTL = 5 * 60000, PAGE = 12;
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const H = () => window.firebaseDbHelpers;
    const $ = (id) => document.getElementById(id);
    const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
    const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const views = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' مليون' : n >= 1000 ? Math.round(n / 1000) + ' ألف' : String(n || 0));
    const ini = (c) => esc(String((c && c.n) || 'أ').trim().charAt(0));
    let CH = [], POSTS = [], FRESH = {}, MORE = {}, S = { subj: 'all', ch: '', shown: PAGE }, err = '', netBusy = false, un = null, OPEN = new Set(), failed = [];

    // a pasted link or @name -> the channel's user name ('' if it is not a public channel link)
    const tgName = (x) => { let s = String(x || '').trim().replace(/^@/, ''); s = s.replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me|telegram\.dog)\//i, '').replace(/^s\//i, ''); if (/^(\+|joinchat)/i.test(s)) return ''; s = s.split(/[/?#]/)[0]; return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(s) ? s : ''; };
    const muted = () => new Set(load(K_MUTE, []));
    // "my teachers": once chosen, only those channels are shown (and pushed); the rest stay hidden until the student edits the choice
    const mine = () => new Set(load(K_MINE, []).map((x) => String(x).toLowerCase()));
    const picked = () => { try { return localStorage.getItem(K_SEL) === '1'; } catch (e) { return false; } };
    const shownCh = () => { if (!picked()) return CH; const m = mine(); return CH.filter((c) => m.has(String(c.u).toLowerCase())); };
    const chOf = (u) => CH.find((c) => String(c.u).toLowerCase() === String(u).toLowerCase()) || null;
    const picOf = (c) => { const f = FRESH[c.u]; const u = (f && f.a) || c.a; return /^https:\/\/[^\s"'<>]+$/.test(u || '') ? u : ''; };
    const avatar = (c) => { const u = picOf(c); return u ? `<img src="${esc(u)}" alt="" referrerpolicy="no-referrer" data-ini="${ini(c)}">` : `<span>${ini(c)}</span>`; };

    // ---------- data ----------
    function listenChannels() {
        if (un || !window.firebaseDb) return;
        const { ref, onValue } = H();
        un = onValue(ref(window.firebaseDb, 'tgChannels'), (snap) => {
            const v = snap.exists() ? snap.val() : {};
            CH = Object.keys(v).map((k) => ({ k, ...v[k] })).filter((c) => c && /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(String(c.u || ''))).sort((a, b) => (Number(a.o) || 0) - (Number(b.o) || 0));
            if (S.ch && !shownCh().some((c) => String(c.u).toLowerCase() === S.ch.toLowerCase())) S.ch = '';
            app._tgTagSync && app._tgTagSync(CH.map((c) => String(c.u).toLowerCase()));
            paint(); fetchFeed(false);
        }, () => { err = 'ما كدرت أجيب قائمة القنوات'; paint(); });
    }
    async function workerCall(body) {
        const cu = String((app.siteConfig && app.siteConfig.tutorUrl) || '').trim().replace(/\/+$/, '');
        const base = /^https:\/\/[^\s]+$/.test(cu) ? cu : 'https://isp-tutor.efceg-xsax.workers.dev', user = window.firebaseAuth && window.firebaseAuth.currentUser;
        if (!user) throw new Error('signin');
        const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await user.getIdToken()) }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
    }
    // the posts are kept on the phone in a small copy (text cut short) so the page opens at once
    const slim = (p) => ({ c: p.c, i: p.i, p: p.p, t: String(p.t || '').slice(0, 700), im: (p.im || []).slice(0, 4), d: (p.d || []).slice(0, 4), vd: p.vd ? { th: p.vd.th || '', du: p.vd.du || '', u: p.vd.u || '' } : null, vo: p.vo && typeof p.vo === 'object' ? { u: p.vo.u || '', du: p.vo.du || '' } : (p.vo ? { u: '', du: '' } : 0), w: p.w || 0 });
    async function fetchFeed(force) {
        const names = shownCh().map((c) => c.u), sig = names.join(',').toLowerCase();
        if (!names.length) { POSTS = []; paint(); return; }
        const cache = load(K_FEED, null);
        if (cache && cache.sig === sig && Array.isArray(cache.v)) {
            if (!POSTS.length) { POSTS = cache.v; FRESH = cache.f || {}; paint(); }
            if (!force && Date.now() - (cache.at || 0) < FEED_TTL) return;
        }
        if (netBusy) return;
        netBusy = true; err = '';
        try {
            const j = await workerCall({ mode: 'tgfeed', names: names.slice(0, 12) });
            POSTS = (j.posts || []).filter((x) => x && x.c && Number.isFinite(x.i)).map(slim);
            FRESH = j.chans || {}; failed = j.fail || [];
            save(K_FEED, { sig, at: Date.now(), v: POSTS.slice(0, 80), f: FRESH });
        } catch (e) {
            if (!POSTS.length) err = app.authUid ? 'ما كدرت أجيب المنشورات، تأكد من النت وجرّب مرة ثانية' : 'سجّل دخولك حتى تشوف منشورات المدرسين';
        }
        netBusy = false; paint();
    }
    async function loadOlder(u) {
        const m = MORE[u] = MORE[u] || { list: [], next: -1, busy: false, fail: false, done: false };
        if (m.busy || m.done) return;
        m.busy = true; m.fail = false; paint();
        try {
            // the first "older" page starts below the oldest post we already have for this channel
            let before = m.next;
            if (before < 0) { const own = POSTS.filter((x) => String(x.c).toLowerCase() === u.toLowerCase()).map((x) => x.i); before = own.length ? Math.min.apply(null, own) : 0; }
            const j = await workerCall({ mode: 'tgchan', u, before });
            const seen = new Set(POSTS.concat(m.list).filter((x) => String(x.c).toLowerCase() === u.toLowerCase()).map((x) => x.i));
            (j.posts || []).forEach((x) => { if (x && Number.isFinite(x.i) && !seen.has(x.i)) m.list.push(slim(x)); });
            m.next = j.next || 0; if (!j.posts || !j.posts.length || !m.next) m.done = true;
        } catch (e) { m.fail = true; }
        m.busy = false; paint();
    }

    // ---------- the page ----------
    function subjects() { const s = []; shownCh().forEach((c) => { const x = String(c.s || '').trim(); if (x && s.indexOf(x) === -1) s.push(x); }); return s; }
    function visible() {
        const base = S.ch && MORE[S.ch] ? POSTS.concat(MORE[S.ch].list) : POSTS;
        const q = String(($('tgSearch') || {}).value || '').trim();
        return base.filter((x) => {
            const c = chOf(x.c); if (!c) return false;
            if (picked() && !mine().has(String(c.u).toLowerCase())) return false;
            if (S.ch && String(c.u).toLowerCase() !== S.ch.toLowerCase()) return false;
            if (S.subj !== 'all' && String(c.s || '') !== S.subj) return false;
            if (q && ((x.t || '') + ' ' + (x.d || []).map((d) => d.n).join(' ') + ' ' + c.n).indexOf(q) === -1) return false;
            return true;
        }).sort((a, b) => (b.p || 0) - (a.p || 0));
    }
    const FILE_IC = { pdf: 'file-text', doc: 'file-text', docx: 'file-text', ppt: 'presentation', pptx: 'presentation', xls: 'sheet', xlsx: 'sheet', zip: 'file-archive', rar: 'file-archive', mp3: 'music', ogg: 'music', mp4: 'film', jpg: 'image', jpeg: 'image', png: 'image' };
    const fileIc = (n) => FILE_IC[String(n).split('.').pop().toLowerCase()] || 'file';
    // a paragraph's links stay inert text: nothing in a post can send the student somewhere by accident
    const body = (x) => {
        const t = String(x.t || ''); if (!t) return '';
        const long = t.length > 260 || t.split('\n').length > 5, open = OPEN.has(x.c + '/' + x.i);
        return `<div class="tg-tx${long && !open ? ' clip' : ''}" dir="auto">${esc(t)}</div>${long ? `<button class="tg-more" onclick="app.tgExpand('${esc(x.c)}', ${x.i})">${open ? 'أقل' : 'المزيد'}</button>` : ''}`;
    };
    function card(x) {
        const c = chOf(x.c) || { n: x.c, u: x.c };
        const seen = load(K_SEEN, {})[String(c.u).toLowerCase()] || 0;
        const media = (x.im && x.im.length ? `<div class="tg-im n${x.im.length}">${x.im.map((u) => `<button onclick="app.tgImg(${jsArg(u)})" aria-label="صورة"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join('')}</div>` : '')
            + (x.vd ? (x.vd.u ? `<button class="tg-vd" onclick="app.tgPlayVideo(this, ${jsArg(x.vd.u)})" aria-label="شغّل الفيديو">${x.vd.th ? `<img src="${esc(x.vd.th)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span class="tg-play"><i data-lucide="play"></i></span>${x.vd.du ? `<em>${esc(x.vd.du)}</em>` : ''}</button>`
                : `<button class="tg-vd" onclick="app.tgOpenPost('${esc(x.c)}', ${x.i})">${x.vd.th ? `<img src="${esc(x.vd.th)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span class="tg-play"><i data-lucide="play"></i></span>${x.vd.du ? `<em>${esc(x.vd.du)}</em>` : ''}<span class="tg-vdn">فيديو كبير، ينفتح بتلكرام</span></button>`) : '')
            + (x.vo ? (x.vo.u ? `<div class="tg-voice"><i data-lucide="mic"></i><audio controls preload="none" controlsList="nodownload" src="${esc(x.vo.u)}"></audio>${x.vo.du ? `<em dir="ltr">${esc(x.vo.du)}</em>` : ''}</div>`
                : `<button class="tg-file" onclick="app.tgOpenPost('${esc(x.c)}', ${x.i})"><i data-lucide="mic"></i><span><b>رسالة صوتية${x.vo.du ? ' ' + esc(x.vo.du) : ''}</b><small>ما تتشغل هنا، تنفتح بتلكرام</small></span><i data-lucide="external-link"></i></button>`) : '')
            + (x.d || []).map((d) => `<button class="tg-file" onclick="app.tgOpenPost('${esc(x.c)}', ${x.i})"><i data-lucide="${fileIc(d.n)}"></i><span><b dir="auto">${esc(d.n)}</b><small dir="ltr">${esc(d.z)}</small></span><i data-lucide="external-link"></i></button>`).join('');
        return `<article class="tg-card">
            <div class="tg-hd"><span class="tu-av">${avatar(c)}</span><span class="tu-tx"><b>${esc(c.n)}</b><small>${x.p ? timeAgo(x.p) : ''}${x.w ? ' . ' + views(x.w) + ' مشاهدة' : ''}</small></span>${x.p > seen ? '<i class="tg-new">جديد</i>' : ''}</div>
            ${body(x)}${media}
            <div class="tg-ft"><button onclick="app.tgOpenPost('${esc(x.c)}', ${x.i})"><i data-lucide="send"></i>افتح بتلكرام</button></div>
        </article>`;
    }
    function pickList() {
        const box = $('tgPickList'); if (!box) return;
        const m = mine(), sel = picked(), q = String((($('tgPickQ') || {}).value) || '').trim().toLowerCase();
        box.innerHTML = CH.filter((c) => !q || (String(c.n) + ' ' + String(c.s || '') + ' ' + String(c.u)).toLowerCase().indexOf(q) !== -1).map((c) => `<button class="${sel && m.has(String(c.u).toLowerCase()) ? 'on' : ''}" onclick="app.tgPickToggle('${esc(String(c.u).toLowerCase())}', this)"><i>${avatar(c)}</i><span><b>${esc(c.n)}</b><small>${esc(c.s || '')}</small></span><em><i data-lucide="check"></i></em></button>`).join('');
        try { lucide.createIcons(); } catch (e) {}
    }
    function paint() {
        const box = $('tgContent'); if (!box) return;
        const subs = subjects(), list = visible();
        const chips = ['all'].concat(subs).map((s) => `<button class="tu-chip${S.subj === s ? ' on' : ''}" onclick="app.tgSubj(${jsArg(s)})">${s === 'all' ? 'الكل' : esc(s)}</button>`).join('');
        const mu = muted();
        // a subject chip narrows the strip to that subject's teachers (and only the student's own teachers once he has chosen them)
        const teachers = shownCh().filter((c) => S.subj === 'all' || String(c.s || '') === S.subj).map((c) => `<button class="tu-tch${S.ch && S.ch.toLowerCase() === String(c.u).toLowerCase() ? ' on' : ''}${mu.has(String(c.u).toLowerCase()) ? ' tg-mu' : ''}" onclick="app.tgChan('${esc(c.u)}')"><i>${avatar(c)}</i><small>${esc(c.n)}</small></button>`).join('');
        let feed;
        const M = S.ch && MORE[S.ch];
        if (picked() && CH.length && !shownCh().length) feed = '<div class="tu-empty"><i data-lucide="users"></i><b>ما اخترت أي أستاذ</b><p>اختار أساتذتك وتطلع منشوراتهم هنا بس.</p><button class="tu-btn" onclick="app.tgPick()">اختيار أساتذتي</button></div>';
        else if (!CH.length) feed = '<div class="tu-empty"><i data-lucide="send"></i><b>ما انضافت أي قناة بعد</b><p>الإدارة تضيف قنوات تلكرام من لوحة التحكم، أو اطلب إضافة قناة أستاذك من زر + فوق.</p></div>';
        else if (!POSTS.length && !err && netBusy) feed = '<div class="tu-skel">' + '<i></i>'.repeat(3) + '</div>';
        else if (err && !POSTS.length) feed = `<div class="tu-empty"><i data-lucide="wifi-off"></i><b>${esc(err)}</b><button class="tu-btn" onclick="app.tgRefresh()">إعادة المحاولة</button></div>`;
        else if (!list.length) feed = `<div class="tu-empty"><i data-lucide="search-x"></i><b>${POSTS.length ? 'ما لكيت منشورات' : 'ما كدرت أقرأ منشورات هذه القنوات'}</b>${POSTS.length ? '' : '<p>تأكد إن القناة عامة وتفتح بالمتصفح، أو جرّب بعد شوية.</p>'}</div>`;
        else feed = list.slice(0, S.shown).map(card).join('')
            + (list.length > S.shown ? `<button class="tu-more" onclick="app.tgMore()">عرض المزيد</button>`
                : S.ch ? (M && M.busy ? '<div class="tu-more dim">دا يحمّل المنشورات القديمة...</div>' : M && M.fail ? '<button class="tu-more" onclick="app.tgMore()">تعذر التحميل، أعد المحاولة</button>' : M && M.done ? '' : '<button class="tu-more" onclick="app.tgMore()">منشورات أقدم</button>') : '');
        const warn = failed.length && !S.ch ? `<div class="tg-warn">ما انقرأت منشورات: ${failed.map((u) => esc((chOf(u) || { n: u }).n)).join('، ')} (يمكن القناة مو عامة)</div>` : '';
        box.innerHTML = `${CH.length ? `<div class="tu-chips">${chips}</div>
            <div class="tu-h"><span>القنوات</span><span class="tu-hb"><button onclick="app.tgPick()"><i data-lucide="users"></i>أساتذتي${picked() ? ' (' + shownCh().length + ')' : ''}</button><button onclick="app.tgSettings()"><i data-lucide="bell"></i>الإشعارات</button></span></div>
            <div class="tu-tchs">${teachers}</div>` : ''}${warn}<div class="tg-feed">${feed}</div>
            <div class="tg-ask"><button onclick="app.chReqOpen('tg')"><i data-lucide="plus-circle"></i>اطلب إضافة قناة أستاذك</button></div>`;
        try { lucide.createIcons(); } catch (e) {}
    }
    // everything the student has now seen on a channel is "old" the next time
    function markSeen() {
        const seen = load(K_SEEN, {});
        POSTS.forEach((x) => { const k = String(x.c).toLowerCase(); if ((x.p || 0) > (seen[k] || 0)) seen[k] = x.p; });
        save(K_SEEN, seen);
    }

    // ---------- the "ask for a channel" sheet (Telegram and YouTube) ----------
    const KIND = { tg: { t: 'قناة تلكرام', ph: 'https://t.me/اسم_القناة', ok: (x) => !!tgName(x) }, yt: { t: 'قناة يوتيوب', ph: 'https://youtube.com/@اسم_القناة', ok: (x) => /^(https?:\/\/)?((www|m)\.)?(youtube\.com|youtu\.be)\/\S{2,}$/i.test(String(x).trim()) || /^@[\w.-]{3,}$/.test(String(x).trim()) } };
    const ST = { new: ['بانتظار الإدارة', '#b45309'], ok: ['انقبلت', '#16a34a'], no: ['انرفضت', '#dc2626'] };
    function closeSheet(id) { const w = $(id); if (!w) return; w.classList.remove('on'); setTimeout(() => w.remove(), 250); }
    function mineList(k) {
        const { ref, get } = H(); const box = $('tgReqMine'); if (!box || !app.authUid) return;
        get(ref(window.firebaseDb, 'chanReq/' + app.authUid)).then((s) => {
            const v = s.exists() ? s.val() : {}, rows = Object.keys(v).map((id) => ({ id, ...v[id] })).filter((r) => r.k === k).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 5);
            box.innerHTML = rows.length ? '<div class="tu-h"><span>طلباتي</span></div>' + rows.map((r) => `<div class="tg-rq"><span dir="ltr">${esc(r.l)}</span><em style="color:${(ST[r.st] || ST.new)[1]}">${(ST[r.st] || ST.new)[0]}${r.st === 'no' && r.r ? ' . ' + esc(r.r) : ''}</em></div>`).join('') : '';
        }).catch(() => {});
    }

    // only one voice note / video plays at a time
    document.addEventListener('play', (e) => { const t = e.target; if (!t || !t.closest || !t.closest('#tgView')) return; document.querySelectorAll('#tgView video, #tgView audio').forEach((m) => { if (m !== t) { try { m.pause(); } catch (x) {} } }); }, true);

    Object.assign(app, {
        tgOpen() {
            S = { subj: 'all', ch: '', shown: PAGE };
            const q = $('tgSearch'); if (q) q.value = '';
            $('tgSearchBar')?.classList.add('hidden');
            listenChannels(); paint();
            if (CH.length) fetchFeed(false);
            // what the student sees now stops being "new" when they leave the page
        },
        tgClose() { document.querySelectorAll('#tgView video, #tgView audio').forEach((m) => { try { m.pause(); } catch (e) {} }); markSeen(); },
        tgSubj(s) { S.subj = s; S.shown = PAGE; const c = S.ch && chOf(S.ch); if (c && s !== 'all' && String(c.s || '') !== s) S.ch = ''; paint(); },
        tgChan(u) {
            S.ch = S.ch.toLowerCase() === String(u).toLowerCase() ? '' : u; S.shown = PAGE; paint();
            if (S.ch) loadOlder(S.ch);
        },
        tgMore() {
            const list = visible();
            if (list.length > S.shown) { S.shown += PAGE; paint(); return; }
            if (S.ch) { const m = MORE[S.ch]; if (m) { m.fail = false; } loadOlder(S.ch); }
        },
        tgRefresh() { err = ''; paint(); fetchFeed(true); },
        tgSearchToggle() { const b = $('tgSearchBar'); if (!b) return; b.classList.toggle('hidden'); if (!b.classList.contains('hidden')) $('tgSearch')?.focus(); else { $('tgSearch').value = ''; paint(); } },
        tgSearchInput() { S.shown = PAGE; paint(); },
        tgExpand(c, i) { const k = c + '/' + i; if (OPEN.has(k)) OPEN.delete(k); else OPEN.add(k); paint(); },
        // the real post (and its files) open in Telegram; the app never stores them
        tgOpenPost(c, i) { try { window.open('https://t.me/' + encodeURIComponent(c) + '/' + Number(i), '_blank', 'noopener'); } catch (e) { app.showToast('ما انفتح تلكرام'); } },
        // a video plays right here (streamed from Telegram's servers, nothing is saved on the phone)
        tgPlayVideo(btn, u) {
            if (!/^https:\/\/[^\s"'<>]+$/.test(u || '') || !btn) return;
            document.querySelectorAll('#tgView video, #tgView audio').forEach((m) => { try { m.pause(); } catch (e) {} });
            const v = document.createElement('video'); v.className = 'tg-vp'; v.controls = true; v.autoplay = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('controlsList', 'nodownload'); v.setAttribute('referrerpolicy', 'no-referrer'); v.src = u;
            v.addEventListener('error', () => { app.showToast('ما اشتغل الفيديو هنا'); }, { once: true });
            btn.replaceWith(v);
        },
        tgImg(u) {
            if (!/^https:\/\/[^\s"'<>]+$/.test(u || '')) return;
            const w = document.createElement('div'); w.id = 'tgLight'; w.className = 'tg-light';
            w.innerHTML = `<button class="tg-lx" onclick="document.getElementById('tgLight').remove()" aria-label="إغلاق"><i data-lucide="x"></i></button><img src="${esc(u)}" alt="" referrerpolicy="no-referrer">`;
            w.addEventListener('click', (e) => { if (e.target === w) w.remove(); });
            document.body.appendChild(w); try { lucide.createIcons(); } catch (e) {}
        },
        // which pushes reach this phone: all of them, or per channel
        tgSettings() {
            $('tgSheet')?.remove();
            const mu = muted(), on = app.notifPrefs.tg !== false;
            const w = document.createElement('div'); w.id = 'tgSheet'; w.className = 'tu-sheetw';
            w.innerHTML = `<div class="tu-sbd" onclick="app.tgSheetClose()"></div><div class="tu-sheet"><div class="tu-grab"></div><div class="tu-sh"><b>إشعارات قنوات تلكرام</b><button onclick="app.tgSheetClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div>
                <p>اطفي الإشعار لقناة معينة، أو لكل القنوات، إذا تزعجك. المنشورات تبقى تطلع بالصفحة.</p>
                <button class="tu-pushsw ${on ? 'on' : ''}" onclick="app.tgPushAll(this)"><i data-lucide="bell"></i><span><b>إشعارات كل القنوات</b><small>يوصلك إشعار لما أستاذ ينزل منشور جديد</small></span><em><i data-lucide="check"></i></em></button>
                <div class="tg-chs">${shownCh().map((c) => { const k = String(c.u).toLowerCase(); return `<button class="tu-pushsw ${!mu.has(k) && on ? 'on' : ''}" onclick="app.tgPushOne('${esc(k)}', this)"><i class="tg-chav">${avatar(c)}</i><span><b>${esc(c.n)}</b></span><em><i data-lucide="check"></i></em></button>`; }).join('')}</div></div>`;
            document.body.appendChild(w); try { lucide.createIcons(); } catch (e) {}
            requestAnimationFrame(() => w.classList.add('on'));
        },
        tgSheetClose() { closeSheet('tgSheet'); },
        // ----- my teachers -----
        tgPick() {
            $('tgPick')?.remove();
            const w = document.createElement('div'); w.id = 'tgPick'; w.className = 'tu-sheetw';
            w.innerHTML = `<div class="tu-sbd" onclick="app.tgPickClose()"></div><div class="tu-sheet"><div class="tu-grab"></div><div class="tu-sh"><b>اختيار أساتذتي</b><button onclick="app.tgPickClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div>
                <p>ابحث واختار الأساتذة اللي تريدهم وتطلع لك منشوراتهم بس. الباقي يختفون، وترجعهم من هنا بأي وقت.</p>
                <input id="tgPickQ" class="tg-in" type="search" placeholder="ابحث عن أستاذ..." oninput="app.tgPickFilter()">
                <div class="tu-pkact"><button onclick="app.tgPickAll(true)">اختيار الكل</button><button onclick="app.tgPickAll(false)">مسح الكل</button></div>
                <div class="tu-pick" id="tgPickList"></div>
                <button class="tu-btn wide" onclick="app.tgPickClose()">تم</button></div>`;
            document.body.appendChild(w); pickList();
            requestAnimationFrame(() => w.classList.add('on'));
        },
        tgPickFilter() { pickList(); },
        tgPickToggle(k, btn) {
            const first = !picked(); if (first) { try { localStorage.setItem(K_SEL, '1'); } catch (e) {} save(K_MINE, []); }
            const m = mine(); if (m.has(k)) m.delete(k); else m.add(k); save(K_MINE, Array.from(m));
            if (first) pickList(); else btn && btn.classList.toggle('on', m.has(k));
            paint();
        },
        tgPickAll(on) { try { localStorage.setItem(K_SEL, '1'); } catch (e) {} save(K_MINE, on ? CH.map((c) => String(c.u).toLowerCase()) : []); pickList(); paint(); },
        tgPickClose() {
            closeSheet('tgPick'); S.shown = PAGE;
            if (S.ch && !shownCh().some((c) => String(c.u).toLowerCase() === S.ch.toLowerCase())) S.ch = '';
            app._tgTagSync && app._tgTagSync(CH.map((c) => String(c.u).toLowerCase()));
            fetchFeed(false); paint();
        },
        tgPushAll(btn) {
            const on = app.notifPrefs.tg === false; // toggling: it is switched on now if it was off
            app.notifPrefs.tg = on; app.saveNotifPrefs && app.saveNotifPrefs();
            btn && btn.classList.toggle('on', on);
            document.querySelectorAll('#tgSheet .tg-chs .tu-pushsw').forEach((b) => b.classList.toggle('on', on && !muted().has(b.getAttribute('onclick').match(/'([^']+)'/)[1])));
            app._tgTagSync && app._tgTagSync(CH.map((c) => String(c.u).toLowerCase()));
            paint();
        },
        tgPushOne(k, btn) {
            const m = muted(); if (m.has(k)) m.delete(k); else m.add(k);
            save(K_MUTE, Array.from(m));
            btn && btn.classList.toggle('on', !m.has(k) && app.notifPrefs.tg !== false);
            app._tgTagSync && app._tgTagSync(CH.map((c) => String(c.u).toLowerCase()));
            paint();
        },
        // ----- asking for a channel -----
        chReqOpen(kind) {
            if (!app.authUid) { app.showToast('سجّل دخولك حتى تطلب إضافة قناة'); app.goToAuth && app.goToAuth('login'); return; }
            const K = KIND[kind] || KIND.tg;
            $('tgReq')?.remove();
            const w = document.createElement('div'); w.id = 'tgReq'; w.className = 'tu-sheetw';
            w.innerHTML = `<div class="tu-sbd" onclick="app.chReqClose()"></div><div class="tu-sheet"><div class="tu-grab"></div><div class="tu-sh"><b>طلب إضافة ${K.t}</b><button onclick="app.chReqClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div>
                <p>الصق رابط قناة أستاذك وترسله للإدارة. إذا انقبلت تنضاف للصفحة وتوصل منشوراتها لكل الطلاب.${kind === 'tg' ? ' لازم القناة تكون عامة.' : ''}</p>
                <input id="tgReqIn" class="tg-in" dir="ltr" inputmode="url" autocomplete="off" placeholder="${K.ph}">
                <button class="tu-btn wide" id="tgReqGo" onclick="app.chReqSend('${kind}')"><i data-lucide="send"></i>أرسل الطلب</button>
                <div id="tgReqMine"></div></div>`;
            document.body.appendChild(w); try { lucide.createIcons(); } catch (e) {}
            requestAnimationFrame(() => w.classList.add('on'));
            mineList(kind);
        },
        chReqClose() { closeSheet('tgReq'); },
        async chReqSend(kind) {
            const K = KIND[kind] || KIND.tg, inp = $('tgReqIn'), v = String((inp || {}).value || '').trim();
            if (!K.ok(v)) { app.showToast(kind === 'tg' ? 'الرابط مو صحيح، لازم رابط قناة عامة مثل t.me/اسم_القناة' : 'الرابط مو صحيح، الصق رابط القناة أو @اسمها'); return; }
            const { ref, update, serverTimestamp } = H(), id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), u = app.currentUser || {};
            const o = { uid: app.authUid, k: kind, l: (kind === 'tg' ? 'https://t.me/' + tgName(v) : v).slice(0, 150), st: 'new', at: serverTimestamp(), n: String(u.fullName || 'طالب').split(' ')[0].slice(0, 30), s: String(u.studentNumber || '').slice(0, 12) };
            const b = $('tgReqGo'); if (b) b.disabled = true;
            try {
                await update(ref(window.firebaseDb), { ['chanReq/' + app.authUid + '/' + id]: o, ['chanReqLast/' + app.authUid]: serverTimestamp() });
                app.showToast('وصل طلبك للإدارة، تشوف الرد بنفس الشاشة'); if (inp) inp.value = ''; mineList(kind);
            } catch (e) {
                app.showToast(String(e && e.message || e).includes('ermission') ? 'ما انرسل. تكدر ترسل طلب كل دقيقتين' : 'ما انرسل، تأكد من النت');
            }
            if (b) b.disabled = false;
        },
        // a push opened the app on a channel (?tg=<name>)
        tgGo(u) { app.goToTg && app.goToTg(); setTimeout(() => { if (u && chOf(u)) app.tgChan(u); }, 1200); },
    });
})();
