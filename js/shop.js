// المتجر: categories and products the admin publishes from the panel (admin.html, المتجر).
// shop/cats/{id} = { n, o }; shop/items/{id} = { n, d?, cat, img, pd?, price?, tt?, buy?, h?, o?, at };
// pd is the price in dinar; the price in points is pd x shop/rate (points per dinar), so changing
// the rate reprices everything. The cart (on the device) becomes an order in shopOrders/{id},
// paid in points in the same write or cash on delivery; shopMine/{uid} lists the student's orders.
// shop/imgs/{id} = the full picture, read only when a product is opened. Products show in
// columns under their category; a product opens with a clear picture, its description, its
// TikTok video (played inside the app when the link names the video) and an order link.
// Loaded on demand by app._need('shop').
(function () {
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const https = (u) => (/^https:\/\/[^\s"'<>]+$/.test(String(u || '')) ? String(u) : '');
    const imgSrc = (u) => (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(u || '')) ? u : https(u));
    const ttId = (u) => { const m = String(u || '').match(/\/video\/(\d{6,25})/); return m ? m[1] : ''; };
    const PER_SECTION = 6, RATE = 10;
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
    const PHONE = /^(\+?964|0)?7[0-9]{9}$/;
    const ST = { new: ['جديد', 'clock'], prep: ['يتجهز', 'package'], sent: ['بالطريق', 'truck'], done: ['وصل', 'circle-check'], cancel: ['ملغي', 'circle-x'] };

    Object.assign(app, {
        shOpen() {
            this._sh = this._sh || { cats: [], items: [], cat: '', q: '', full: {}, cl: false, il: false, rate: RATE };
            this._shListen();
            this._shRender();
            this._shCartBadge();
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
            const offR = onValue(ref(window.firebaseDb, 'shop/rate'), (snap) => {
                const r = Number(snap.val());
                s.rate = r > 0 ? r : RATE;
                if (this.currentView === 'storeView') this._shRender();
            }, () => {});
            s.off = () => { offC(); offI(); offR(); };
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

        // price in points, from the price in dinar and the current rate
        _shPts(x) { return x && Number(x.pd) > 0 ? Math.round(Number(x.pd) * (this._sh.rate || RATE)) : 0; },

        _shCard(x) {
            const pts = this._shPts(x);
            return `<div class="sh-card" role="button" tabindex="0" onclick="app.shShow(${jsArg(x.id)})">
                <span class="sh-img"><img src="${esc(imgSrc(x.img))}" alt="${esc(x.n)}" loading="lazy" decoding="async">${https(x.tt) ? '<span class="sh-tt"><i data-lucide="play"></i>فيديو</span>' : ''}
                    ${pts ? `<button class="sh-add" onclick="event.stopPropagation(); app.shAdd(${jsArg(x.id)}, 1, this)" aria-label="أضف للسلة"><i data-lucide="plus"></i></button>` : ''}</span>
                <span class="sh-info"><b dir="auto">${esc(x.n)}</b>${x.d ? `<small dir="auto">${esc(x.d)}</small>` : ''}
                    ${pts ? `<em>${fmt(x.pd)} د.ع</em><i class="sh-pts">${fmt(pts)} نقطة</i>` : x.price ? `<em>${esc(x.price)}</em>` : ''}</span>
            </div>`;
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
                    ${this._shPts(x) ? `<div class="sh-prices"><span class="sh-price">${fmt(x.pd)} د.ع</span><span class="sh-price pts">${fmt(this._shPts(x))} نقطة</span></div>` : x.price ? `<span class="sh-price">${esc(x.price)}</span>` : ''}
                    ${x.d ? `<p dir="auto">${esc(x.d)}</p>` : ''}
                    ${tt ? `<div class="sh-vid" id="shVid">${vid ? `<button class="sh-play" onclick="app.shPlay(${jsArg(vid)})"><span><i data-lucide="play"></i></span><b>شوف فيديو المنتج</b><small>من تيك توك</small></button>`
                        : `<a class="sh-play" href="${esc(tt)}" target="_blank" rel="noopener noreferrer"><span><i data-lucide="play"></i></span><b>شوف فيديو المنتج</b><small>يفتح بتيك توك</small></a>`}</div>` : ''}
                    ${this._shPts(x) ? `<div class="sh-buyrow">
                        <div class="sh-qty"><button onclick="app.shQty(1)" aria-label="زيد"><i data-lucide="plus"></i></button><b id="shQ">1</b><button onclick="app.shQty(-1)" aria-label="نقّص"><i data-lucide="minus"></i></button></div>
                        <button class="sh-buy" onclick="app.shAdd(${jsArg(x.id)}, 0, this)"><i data-lucide="shopping-cart"></i>أضف للسلة</button>
                    </div>
                    <button class="sh-buy ghost" onclick="app.shAdd(${jsArg(x.id)}, 0); app.shCartOpen()">اطلب هسه</button>` : ''}
                    ${buy ? `<a class="sh-buy ${this._shPts(x) ? 'ghost' : ''}" href="${esc(buy)}" target="_blank" rel="noopener noreferrer"><i data-lucide="message-circle"></i>${this._shPts(x) ? 'اسألنا عن المنتج' : 'اطلب المنتج'}</a>` : ''}
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

        shQty(d) { const el = document.getElementById('shQ'); if (el) el.textContent = Math.max(1, Math.min(20, (Number(el.textContent) || 1) + d)); },

        // ---------- the cart (on the device) ----------
        _shCartKey() { return 'isp_shopcart_' + (this.authUid || 'guest'); },
        _shCart() { try { const v = JSON.parse(localStorage.getItem(this._shCartKey()) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } },
        _shCartSave(c) { try { localStorage.setItem(this._shCartKey(), JSON.stringify(c)); } catch (e) {} this._shCartBadge(); },
        // lines of products still for sale, with today's prices
        _shLines() {
            const c = this._shCart(), items = (this._sh && this._sh.items) || [];
            return Object.keys(c).map((id) => ({ x: items.find((y) => y.id === id), q: Math.max(1, Math.min(20, Number(c[id]) || 1)), id })).filter((l) => l.x && this._shPts(l.x));
        },
        _shCartBadge() {
            const n = this._sh ? this._shLines().reduce((a, l) => a + l.q, 0) : Object.values(this._shCart()).reduce((a, q) => a + (Number(q) || 0), 0);
            document.querySelectorAll('#shCartN, #navStoreCartBadge').forEach((b) => { b.textContent = n; b.classList.toggle('hidden', !n); });
        },
        shAdd(id, q, btn) {
            const x = this._sh.items.find((y) => y.id === id);
            if (!x || !this._shPts(x)) return;
            const n = q || Number(document.getElementById('shQ')?.textContent) || 1, c = this._shCart();
            c[id] = Math.min(20, (Number(c[id]) || 0) + n);
            this._shCartSave(c);
            if (btn) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
            this.showToast('انضاف للسلة');
        },

        shCartOpen(step) {
            const s = this._sh;
            this.shClose();
            s.step = step || 'cart';
            const el = document.createElement('div');
            el.id = 'shSheet'; el.className = 'sh-sheet';
            el.innerHTML = '<div class="sh-panel sh-cart" id="shCartBox" role="dialog" aria-label="السلة"></div>';
            el.addEventListener('click', (e) => { if (e.target === el) this.shClose(); });
            document.body.appendChild(el);
            document.body.classList.add('sh-open');
            requestAnimationFrame(() => el.classList.add('in'));
            this._shCartRender();
        },

        _shCartRender() {
            const s = this._sh, box = document.getElementById('shCartBox');
            if (!box) return;
            const lines = this._shLines(), totalD = lines.reduce((a, l) => a + Number(l.x.pd) * l.q, 0), totalP = lines.reduce((a, l) => a + this._shPts(l.x) * l.q, 0);
            const head = (t, back) => `<div class="sh-ch">${back ? `<button class="sh-cx" onclick="app._shStep(${jsArg(back)})" aria-label="رجوع"><i data-lucide="chevron-right"></i></button>` : ''}<b>${t}</b><button class="sh-cx" onclick="app.shClose()" aria-label="سد"><i data-lucide="x"></i></button></div>`;
            let h = '';
            if (s.step === 'done') {
                h = head('تم الطلب') + `<div class="sh-ok"><span><i data-lucide="circle-check"></i></span><b>وصل طلبك</b><p>رقم الطلب ${esc(s.lastOrder || '')}. راح نتواصل وياك على رقمك حتى نأكد التوصيل.</p>
                    <button class="sh-buy" onclick="app.shOrdersOpen()">شوف طلباتي</button></div>`;
            } else if (s.step === 'form') {
                const u = this.currentUser || {}, d = s.form || {};
                const govs = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'السليمانية', 'دهوك', 'حلبجة', 'كركوك', 'الأنبار', 'صلاح الدين', 'ديالى', 'بابل', 'كربلاء', 'النجف', 'واسط', 'القادسية', 'ذي قار', 'ميسان', 'المثنى'];
                const gov = d.gov || this._myGov() || '', pts = Number(u.points) || 0, canPts = pts >= totalP;
                const pay = d.pay || (canPts ? 'points' : 'cash');
                h = head('معلومات التوصيل', 'cart') + `<div class="sh-form">
                    <label>الاسم</label><input id="shfName" maxlength="60" value="${esc(d.name || u.fullName || '')}" placeholder="اسمك الكامل">
                    <label>رقم الهاتف</label><input id="shfPhone" type="tel" dir="ltr" maxlength="16" inputmode="tel" value="${esc(d.phone || u.phone || '')}" placeholder="07XXXXXXXXX">
                    <label>المحافظة</label><select id="shfGov"><option value="">اختار محافظتك</option>${govs.map((g) => `<option ${g === gov ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
                    <label>العنوان</label><textarea id="shfAddr" rows="2" maxlength="300" placeholder="المنطقة، أقرب نقطة دالة">${esc(d.addr || '')}</textarea>
                    <label>ملاحظة (اختياري)</label><input id="shfNote" maxlength="300" value="${esc(d.note || '')}" placeholder="مثلاً: اتصل قبل ما توصل">
                    <label>طريقة الدفع</label>
                    <div class="sh-pay">
                        <button class="${pay === 'points' ? 'on' : ''}" ${canPts ? '' : 'disabled'} onclick="app._shPay('points')"><i data-lucide="star"></i><b>${fmt(totalP)} نقطة</b><small>${canPts ? 'رصيدك ' + fmt(pts) : 'نقاطك ' + fmt(pts) + ' ما تكفي'}</small></button>
                        <button class="${pay === 'cash' ? 'on' : ''}" onclick="app._shPay('cash')"><i data-lucide="banknote"></i><b>${fmt(totalD)} د.ع</b><small>نقداً عند الاستلام</small></button>
                    </div>
                    <button class="sh-buy" id="shSend" onclick="app.shOrder()"><i data-lucide="send"></i>أرسل الطلب</button>
                </div>`;
                s.form = Object.assign({}, d, { pay });
            } else {
                h = head('السلة') + (lines.length ? `<div class="sh-lines">${lines.map((l) => `<div class="sh-line">
                        <img src="${esc(imgSrc(l.x.img))}" alt="">
                        <div class="sh-line-b"><b dir="auto">${esc(l.x.n)}</b><small>${fmt(l.x.pd)} د.ع · ${fmt(this._shPts(l.x))} نقطة</small>
                            <div class="sh-qty sm"><button onclick="app.shLine(${jsArg(l.id)}, 1)" aria-label="زيد"><i data-lucide="plus"></i></button><b>${l.q}</b><button onclick="app.shLine(${jsArg(l.id)}, -1)" aria-label="نقّص"><i data-lucide="${l.q > 1 ? 'minus' : 'trash-2'}"></i></button></div></div>
                    </div>`).join('')}</div>
                    <div class="sh-total"><span>المجموع</span><b>${fmt(totalD)} د.ع</b><small>أو ${fmt(totalP)} نقطة</small></div>
                    <button class="sh-buy" onclick="app._shCheckout()"><i data-lucide="check"></i>إكمال الطلب</button>`
                    : `<div class="sh-ok"><span class="muted"><i data-lucide="shopping-cart"></i></span><b>السلة فارغة</b><p>ضيف منتجات من المتجر وارجع هنا.</p></div>`)
                    + `<button class="sh-link" onclick="app.shOrdersOpen()">طلباتي السابقة</button>`;
            }
            box.innerHTML = h;
            lucide.createIcons();
        },
        _shStep(st) { this._shKeepForm(); this._sh.step = st; this._shCartRender(); },
        shLine(id, d) {
            const c = this._shCart();
            const q = (Number(c[id]) || 0) + d;
            if (q <= 0) delete c[id]; else c[id] = Math.min(20, q);
            this._shCartSave(c);
            this._shCartRender();
        },
        _shCheckout() {
            if (!this.isLoggedIn || !this.authUid) { this.shClose(); this.showToast('سجّل دخولك حتى تطلب'); this.goToAuth('login'); return; }
            this._sh.step = 'form';
            this._shCartRender();
        },
        _shKeepForm() {
            const s = this._sh, v = (id) => (document.getElementById(id) || {}).value;
            if (!document.getElementById('shfName')) return;
            s.form = Object.assign({}, s.form, { name: v('shfName'), phone: v('shfPhone'), gov: v('shfGov'), addr: v('shfAddr'), note: v('shfNote') });
        },
        _shPay(p) { this._shKeepForm(); this._sh.form.pay = p; this._shCartRender(); },

        async shOrder() {
            const s = this._sh;
            this._shKeepForm();
            const f = s.form || {}, lines = this._shLines();
            const name = String(f.name || '').trim(), phone = String(f.phone || '').replace(/[\s-]/g, ''), addr = String(f.addr || '').trim();
            if (!lines.length) { this._sh.step = 'cart'; this._shCartRender(); return; }
            if (!name) return this.showToast('اكتب اسمك');
            if (!PHONE.test(phone)) return this.showToast('رقم الهاتف مو صحيح، اكتبه مثل 07701234567');
            if (!f.gov) return this.showToast('اختار محافظتك');
            if (addr.length < 5) return this.showToast('اكتب عنوانك بالتفصيل');
            const btn = document.getElementById('shSend');
            if (btn) btn.disabled = true;
            const items = {};
            lines.forEach((l) => { items[l.id] = { n: String(l.x.n).slice(0, 80), q: l.q, pd: Number(l.x.pd), pp: this._shPts(l.x) }; });
            const totalD = lines.reduce((a, l) => a + Number(l.x.pd) * l.q, 0), totalP = lines.reduce((a, l) => a + this._shPts(l.x) * l.q, 0);
            const id = 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
            const { serverTimestamp } = window.firebaseDbHelpers;
            const order = { u: this.authUid, name: name.slice(0, 60), phone, gov: f.gov, addr: addr.slice(0, 300), items, totalD, totalP, rate: s.rate || RATE, pay: f.pay === 'points' ? 'points' : 'cash', st: 'new', at: serverTimestamp() };
            if (f.note && String(f.note).trim()) order.note = String(f.note).trim().slice(0, 300);
            const extra = { ['shopOrders/' + id]: order, ['shopMine/' + this.authUid + '/' + id]: true };
            try {
                if (order.pay === 'points') {
                    const np = await this.addPointsAtomic(-totalP, { reject: true, spend: 's:' + id, extra });
                    if (np === null) throw new Error('points');
                    if (this.currentUser) this.currentUser.points = np;
                } else {
                    const { ref, update } = window.firebaseDbHelpers;
                    await update(ref(window.firebaseDb), extra);
                }
                if (this.currentUser && !this.currentUser.phone) this.currentUser.phone = phone;
                this._shCartSave({});
                s.lastOrder = id.slice(-6).toUpperCase();
                s.form = Object.assign({}, f, { note: '' });
                s.step = 'done';
                this._shCartRender();
            } catch (e) {
                console.warn('Order failed:', e);
                this.showToast(e.message === 'points' ? 'نقاطك ما تكفي، اختار الدفع عند الاستلام' : 'ما وصل الطلب، تأكد من النت وحاول مرة ثانية');
                if (btn) btn.disabled = false;
            }
        },

        // ---------- my orders ----------
        async shOrdersOpen() {
            if (!this.isLoggedIn || !this.authUid) { this.showToast('سجّل دخولك حتى تشوف طلباتك'); this.goToAuth('login'); return; }
            if (!document.getElementById('shCartBox')) this.shCartOpen('orders');
            this._sh.step = 'orders';
            const box = document.getElementById('shCartBox');
            const head = `<div class="sh-ch"><button class="sh-cx" onclick="app._shStep('cart')" aria-label="رجوع"><i data-lucide="chevron-right"></i></button><b>طلباتي</b><button class="sh-cx" onclick="app.shClose()" aria-label="سد"><i data-lucide="x"></i></button></div>`;
            box.innerHTML = head + '<div class="sh-load one"><i></i></div>';
            let list = [];
            try {
                const { ref, get } = window.firebaseDbHelpers;
                const ids = Object.keys((await get(ref(window.firebaseDb, 'shopMine/' + this.authUid))).val() || {}).sort().reverse().slice(0, 30);
                list = (await Promise.all(ids.map((id) => get(ref(window.firebaseDb, 'shopOrders/' + id)).then((sn) => (sn.exists() ? Object.assign({ id }, sn.val()) : null)).catch(() => null)))).filter(Boolean);
            } catch (e) {}
            if (!document.getElementById('shCartBox') || this._sh.step !== 'orders') return;
            box.innerHTML = head + (list.length ? `<div class="sh-orders">${list.sort((a, b) => (b.at || 0) - (a.at || 0)).map((o) => {
                const st = ST[o.st] || ST.new, items = Object.values(o.items || {});
                return `<div class="sh-order st-${esc(o.st)}"><div class="sh-order-h"><b>#${esc(o.id.slice(-6).toUpperCase())}</b><span><i data-lucide="${st[1]}"></i>${st[0]}</span></div>
                    <p>${items.map((i) => esc(i.n) + ' ×' + (Number(i.q) || 1)).join('، ')}</p>
                    <small>${o.pay === 'points' ? fmt(o.totalP) + ' نقطة' : fmt(o.totalD) + ' د.ع عند الاستلام'} · ${new Date(o.at || 0).toLocaleDateString('ar-IQ')}</small></div>`;
            }).join('')}</div>` : `<div class="sh-ok"><span class="muted"><i data-lucide="package"></i></span><b>ماكو طلبات بعد</b></div>`);
            lucide.createIcons();
        },

        shClose() {
            document.querySelectorAll('#shSheet, .sh-lb').forEach((n) => n.remove());
            document.body.classList.remove('sh-open');
            if (this._sh) this._sh.open = '';
        },
    });
})();
