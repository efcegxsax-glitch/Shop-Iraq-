// المتجر: categories and products the admin publishes from the panel (admin.html, المتجر).
// shop/cats/{id} = { n, o }; shop/items/{id} = { n, d?, cat, img, price?, tt?, buy?, h?, o?, at };
// shop/imgs/{id} = the full picture, read only when a product is opened. Products show in
// columns under their category; a product opens with a clear picture, its description, its
// TikTok video (played inside the app when the link names the video) and an order link.
// Loaded on demand by app._need('shop').
(function () {
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const https = (u) => (/^https:\/\/[^\s"'<>]+$/.test(String(u || '')) ? String(u) : '');
    const imgSrc = (u) => (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(u || '')) ? u : https(u));
    const ttId = (u) => { const m = String(u || '').match(/\/video\/(\d{6,25})/); return m ? m[1] : ''; };
    const PER_SECTION = 6;

    Object.assign(app, {
        shOpen() {
            this._sh = this._sh || { cats: [], items: [], cat: '', q: '', full: {}, cl: false, il: false };
            this._shListen();
            this._shRender();
        },

        _shListen() {
            const s = this._sh;
            if (s.off || !window.firebaseDb) { if (!window.firebaseDb) { s.cl = s.il = true; } return; }
            const { ref, onValue } = window.firebaseDbHelpers;
            const offC = onValue(ref(window.firebaseDb, 'shop/cats'), (snap) => {
                const v = snap.val() || {};
                s.cats = Object.keys(v).filter((id) => v[id] && v[id].n).map((id) => ({ id, n: String(v[id].n), o: Number(v[id].o) || 0 }))
                    .sort((a, b) => a.o - b.o || a.n.localeCompare(b.n, 'ar'));
                s.cl = true;
                if (this.currentView === 'storeView') this._shRender();
            }, () => { s.cl = true; this._shRender(); });
            const offI = onValue(ref(window.firebaseDb, 'shop/items'), (snap) => {
                const v = snap.val() || {};
                s.items = Object.keys(v).map((id) => Object.assign({ id }, v[id])).filter((x) => x && x.n && imgSrc(x.img) && !x.h)
                    .sort((a, b) => (Number(a.o) || 0) - (Number(b.o) || 0) || (Number(b.at) || 0) - (Number(a.at) || 0));
                s.il = true;
                if (this.currentView === 'storeView') this._shRender();
            }, () => { s.il = true; this._shRender(); });
            s.off = () => { offC(); offI(); };
        },

        _shRender() {
            const s = this._sh, body = document.getElementById('shBody'), chips = document.getElementById('shCats');
            if (!body || !s) return;
            if (!s.cl || !s.il) { body.innerHTML = '<div class="sh-load">' + '<i></i>'.repeat(4) + '</div>'; return; }
            const byCat = {};
            s.items.forEach((x) => { (byCat[x.cat] = byCat[x.cat] || []).push(x); });
            const cats = s.cats.filter((c) => byCat[c.id]);
            const other = s.items.filter((x) => !s.cats.some((c) => c.id === x.cat));
            if (other.length) { cats.push({ id: '_other', n: 'منتجات ثانية' }); byCat._other = other; }
            if (s.cat && !byCat[s.cat]) s.cat = '';
            const sub = document.getElementById('shSub');
            if (sub) sub.textContent = s.items.length ? s.items.length + ' منتج' + (cats.length ? ' · ' + cats.length + ' أقسام' : '') : '';
            if (chips) {
                chips.innerHTML = cats.length > 1 ? `<button class="${s.cat ? '' : 'on'}" onclick="app.shCat('')">الكل</button>` + cats.map((c) =>
                    `<button class="${s.cat === c.id ? 'on' : ''}" onclick="app.shCat(${jsArg(c.id)})">${esc(c.n)}<small>${byCat[c.id].length}</small></button>`).join('') : '';
                chips.classList.toggle('hidden', cats.length < 2);
            }
            if (!s.items.length) {
                body.innerHTML = `<div class="sh-empty"><span><i data-lucide="store"></i></span><b>المتجر يتجهز</b><p>المنتجات راح تنزل قريباً إن شاء الله.</p></div>`;
                lucide.createIcons();
                return;
            }
            const q = s.q.trim().toLowerCase();
            let html;
            if (q) {
                const found = s.items.filter((x) => (x.n + ' ' + (x.d || '')).toLowerCase().includes(q));
                html = found.length ? `<div class="sh-grid">${found.map((x) => this._shCard(x)).join('')}</div>` : `<p class="sh-none">ماكو منتج بهذا الاسم.</p>`;
            } else if (s.cat) {
                html = `<div class="sh-grid">${byCat[s.cat].map((x) => this._shCard(x)).join('')}</div>`;
            } else {
                html = cats.map((c) => {
                    const list = byCat[c.id], more = list.length > PER_SECTION;
                    return `<section class="sh-sec"><div class="sh-sec-h"><b>${esc(c.n)}</b>${more || cats.length > 1 ? `<button onclick="app.shCat(${jsArg(c.id)})">${more ? 'الكل (' + list.length + ')' : list.length + ' منتج'}<i data-lucide="chevron-left"></i></button>` : ''}</div>
                        <div class="sh-grid">${list.slice(0, PER_SECTION).map((x) => this._shCard(x)).join('')}</div></section>`;
                }).join('');
            }
            body.innerHTML = html;
            lucide.createIcons();
        },

        _shCard(x) {
            return `<button class="sh-card" onclick="app.shShow(${jsArg(x.id)})">
                <span class="sh-img"><img src="${esc(imgSrc(x.img))}" alt="${esc(x.n)}" loading="lazy" decoding="async">${https(x.tt) ? '<span class="sh-tt"><i data-lucide="play"></i>فيديو</span>' : ''}</span>
                <span class="sh-info"><b dir="auto">${esc(x.n)}</b>${x.d ? `<small dir="auto">${esc(x.d)}</small>` : ''}${x.price ? `<em>${esc(x.price)}</em>` : ''}</span>
            </button>`;
        },

        shCat(id) {
            this._sh.cat = id; this._sh.q = '';
            const inp = document.getElementById('shSearch'); if (inp) inp.value = '';
            this._shRender();
            const bar = document.getElementById('shCats');
            bar?.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        shSearch(v) { this._sh.q = String(v || ''); clearTimeout(this._shT); this._shT = setTimeout(() => this._shRender(), 150); },

        // ---------- one product ----------
        async shShow(id) {
            const s = this._sh, x = s.items.find((y) => y.id === id);
            if (!x) return;
            const cat = s.cats.find((c) => c.id === x.cat), tt = https(x.tt), buy = https(x.buy), vid = ttId(tt);
            this.shClose();
            const el = document.createElement('div');
            el.id = 'shSheet'; el.className = 'sh-sheet';
            el.innerHTML = `<div class="sh-panel" role="dialog" aria-label="${esc(x.n)}">
                <button class="sh-x" onclick="app.shClose()" aria-label="سد"><i data-lucide="x"></i></button>
                <button class="sh-hero" onclick="app.shZoom()" aria-label="كبّر الصورة"><img id="shFull" src="${esc(imgSrc(x.img))}" alt="${esc(x.n)}"></button>
                <div class="sh-d">
                    ${cat ? `<small class="sh-cat">${esc(cat.n)}</small>` : ''}
                    <h2 dir="auto">${esc(x.n)}</h2>
                    ${x.price ? `<span class="sh-price">${esc(x.price)}</span>` : ''}
                    ${x.d ? `<p dir="auto">${esc(x.d)}</p>` : ''}
                    ${tt ? `<div class="sh-vid" id="shVid">${vid ? `<button class="sh-play" onclick="app.shPlay(${jsArg(vid)})"><span><i data-lucide="play"></i></span><b>شوف فيديو المنتج</b><small>من تيك توك</small></button>`
                        : `<a class="sh-play" href="${esc(tt)}" target="_blank" rel="noopener noreferrer"><span><i data-lucide="play"></i></span><b>شوف فيديو المنتج</b><small>يفتح بتيك توك</small></a>`}</div>` : ''}
                    ${buy ? `<a class="sh-buy" href="${esc(buy)}" target="_blank" rel="noopener noreferrer"><i data-lucide="shopping-bag"></i>اطلب المنتج</a>` : ''}
                </div>
            </div>`;
            el.addEventListener('click', (e) => { if (e.target === el) this.shClose(); });
            document.body.appendChild(el);
            document.body.classList.add('sh-open');
            lucide.createIcons();
            requestAnimationFrame(() => el.classList.add('in'));
            s.open = id;
            // the full picture, once
            if (s.full[id] === undefined && window.firebaseDb) {
                try {
                    const { ref, get } = window.firebaseDbHelpers;
                    const snap = await get(ref(window.firebaseDb, 'shop/imgs/' + id));
                    s.full[id] = imgSrc(snap.val()) || '';
                } catch (e) { s.full[id] = ''; }
            }
            const img = document.getElementById('shFull');
            if (img && s.open === id && s.full[id]) img.src = s.full[id];
        },

        shPlay(vid) {
            const box = document.getElementById('shVid'), x = this._sh.items.find((y) => y.id === this._sh.open);
            if (!box || !/^\d+$/.test(vid)) return;
            box.innerHTML = `<div class="sh-frame"><iframe src="https://www.tiktok.com/embed/v2/${vid}?lang=ar" allow="encrypted-media; fullscreen; autoplay; picture-in-picture" allowfullscreen title="فيديو المنتج"></iframe></div>
                ${x && https(x.tt) ? `<a class="sh-open-tt" href="${esc(https(x.tt))}" target="_blank" rel="noopener noreferrer">افتحه بتطبيق تيك توك</a>` : ''}`;
        },

        shZoom() {
            const img = document.getElementById('shFull');
            if (!img) return;
            const lb = document.createElement('div');
            lb.className = 'sh-lb';
            lb.innerHTML = `<img src="${esc(img.src)}" alt=""><button aria-label="سد"><i data-lucide="x"></i></button>`;
            lb.addEventListener('click', (e) => {
                const im = lb.querySelector('img');
                if (e.target === im) { im.classList.toggle('big'); return; }
                lb.remove();
            });
            document.body.appendChild(lb);
            lucide.createIcons();
        },

        shClose() {
            document.querySelectorAll('#shSheet, .sh-lb').forEach((n) => n.remove());
            document.body.classList.remove('sh-open');
            if (this._sh) this._sh.open = '';
        },
    });
})();
