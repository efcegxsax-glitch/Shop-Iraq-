// خارطة الطلاب: a flat map of Iraq (the real satellite picture from assets/, with the
// governorate borders from IRAQ_GEO in js/maps.js) showing how many of the app's students are in
// each governorate and how they feel today, with reactions that float up from a governorate
// for a moment and fade. Loaded on demand with js/maps.js by app.goToMoodMap().
// Data: studentMap/{uid} = { g, t, m?, d?, r? } (app._smPing keeps it up to date) and
// mapReacts/{key} = { u, g, e, t } (see tools/rules.py).
(function () {
    const B = IRAQ_GEO.b, SX = B[1] - B[0], SY = B[3] - B[2];
    const H = 940, W = Math.round(H * SX * Math.cos(33.3 * Math.PI / 180) / SY);
    const px = (ix, iy) => [ix / 100 / SX * W, (1 - iy / 100 / SY) * H];
    const GOVS = Object.keys(IRAQ_GEO.g);
    const ACTIVE = 30 * 86400000, NOW_MS = 3 * 60000, RX_GAP = 2600;
    const REACTS = [
        { k: 'heart', ic: 'heart', c: '#EF4444', l: 'حب' },
        { k: 'laugh', ic: 'laugh', c: '#F59E0B', l: 'ضحك' },
        { k: 'fire', ic: 'flame', c: '#F97316', l: 'حماس' },
        { k: 'party', ic: 'party-popper', c: '#A855F7', l: 'فرحة' },
        { k: 'support', ic: 'hand-heart', c: '#EC4899', l: 'دعم' },
        { k: 'tired', ic: 'coffee', c: '#A16207', l: 'سهران' },
        { k: 'sad', ic: 'frown', c: '#3B82F6', l: 'زعلان' },
        { k: 'angry', ic: 'angry', c: '#DC2626', l: 'معصب' },
    ];
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const ringPath = (r) => { let d = ''; for (let i = 0; i < r.length; i += 2) { const p = px(r[i], r[i + 1]); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); } return d + 'Z'; };

    Object.assign(app, {
        mmOpen() {
            const m = this._mm = this._mm || { z: 0, x: 0, y: 0, sel: '', stats: {}, rx: {}, mine: new Set(), svg: {}, lastRx: 0 };
            document.body.classList.add('mm-on');
            this._mmBuild();
            this._mmSheet();
            this._mmFit();
            if (!this.isLoggedIn || !this.authUid || !window.firebaseDb) return;
            m.joined = this._smPing(true);
            this._mmLoad();
            this._mmListen();
            this._mmSweep();
            clearInterval(m.tick);
            m.tick = setInterval(() => { this._smPing(true); this._mmLoad(); }, 60000);
        },

        mmClose() {
            const m = this._mm;
            document.body.classList.remove('mm-on');
            if (!m) return;
            clearInterval(m.tick);
            if (m.off) { m.off(); m.off = null; }
            window.removeEventListener('resize', m.onResize);
        },

        // ---------- the map ----------
        _mmBuild() {
            const m = this._mm, root = document.getElementById('mmMap');
            if (!root || root.dataset.built) return;
            root.dataset.built = '1';
            let outline = '';
            GOVS.forEach((g) => (IRAQ_GEO.g[g].r || []).forEach((r) => { outline += ringPath(r); }));
            const paths = GOVS.filter((g) => (IRAQ_GEO.g[g].r || []).length).map((g) =>
                `<path class="mm-g" data-g="${esc(g)}" d="${IRAQ_GEO.g[g].r.map(ringPath).join('')}"/>`).join('');
            const labels = GOVS.map((g) => {
                const p = px(IRAQ_GEO.g[g].c[0], IRAQ_GEO.g[g].c[1]);
                return `<div class="mm-l" data-g="${esc(g)}" style="left:${p[0].toFixed(1)}px;top:${p[1].toFixed(1)}px"><span class="mm-lb"><i class="mm-dot"></i><b>0</b></span><small>${esc(g)}</small></div>`;
            }).join('');
            root.innerHTML = `<div class="mm-stage" id="mmStage" style="width:${W}px;height:${H}px">
                <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
                    <image id="mmSat" href="assets/iraq-sat-2k.jpg" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>
                    <path class="mm-dim" fill-rule="evenodd" d="M-2000 -2000H${W + 2000}V${H + 2000}H-2000Z${outline}"/>
                    ${paths}
                </svg>
                <div class="mm-labels">${labels}</div>
                <div class="mm-floats" id="mmFloats"></div>
            </div>`;
            // the sharper picture once the page has settled, on screens that show it
            if ((window.devicePixelRatio || 1) > 1.5) setTimeout(() => { const im = new Image(); im.onload = () => document.getElementById('mmSat')?.setAttribute('href', im.src); im.src = 'assets/iraq-sat-4k.jpg'; }, 1500);
            this._mmGestures(root);
            m.onResize = () => this._mmFit();
            window.addEventListener('resize', m.onResize);
        },

        _mmFit() {
            const m = this._mm, root = document.getElementById('mmMap');
            if (!root) return;
            const top = 64, bottom = (document.getElementById('mmSheet')?.offsetHeight || 220);
            const vw = root.clientWidth || window.innerWidth, vh = (root.clientHeight || window.innerHeight) - top - bottom;
            m.z0 = Math.min(vw / W, Math.max(120, vh) / H) * 0.96;
            m.z = m.z0;
            m.x = (vw - W * m.z) / 2;
            m.y = top + (Math.max(120, vh) - H * m.z) / 2;
            this._mmApply();
        },

        _mmApply() {
            const m = this._mm, st = document.getElementById('mmStage');
            if (!st) return;
            st.style.transform = `translate(${m.x}px, ${m.y}px) scale(${m.z})`;
            st.style.setProperty('--iz', (1 / m.z).toFixed(4));
            st.classList.toggle('zoomed', m.z > m.z0 * 1.8);
        },

        _mmZoomAt(cx, cy, k) {
            const m = this._mm, nz = Math.max(m.z0 * 0.9, Math.min(m.z0 * 8, m.z * k));
            m.x = cx - (cx - m.x) * nz / m.z;
            m.y = cy - (cy - m.y) * nz / m.z;
            m.z = nz;
            this._mmApply();
        },

        // one finger drags, two fingers pinch, a tap picks a governorate
        _mmGestures(el) {
            const m = this._mm, pts = new Map();
            let start = null, pinch = null;
            const rect = () => el.getBoundingClientRect();
            el.addEventListener('pointerdown', (e) => {
                el.setPointerCapture(e.pointerId);
                pts.set(e.pointerId, [e.clientX, e.clientY]);
                if (pts.size === 1) start = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false, ox: m.x, oy: m.y };
                if (pts.size === 2) {
                    const [a, b] = [...pts.values()];
                    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: m.z };
                    if (start) start.moved = true;
                }
            });
            el.addEventListener('pointermove', (e) => {
                if (!pts.has(e.pointerId)) return;
                pts.set(e.pointerId, [e.clientX, e.clientY]);
                if (pts.size === 2 && pinch) {
                    const [a, b] = [...pts.values()], r = rect();
                    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
                    this._mmZoomAt((a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top, (pinch.z * d / pinch.d) / m.z);
                } else if (pts.size === 1 && start) {
                    const dx = e.clientX - start.x, dy = e.clientY - start.y;
                    if (Math.abs(dx) + Math.abs(dy) > 6) start.moved = true;
                    if (start.moved) { m.x = start.ox + dx; m.y = start.oy + dy; this._mmApply(); }
                }
            });
            const up = (e) => {
                if (!pts.has(e.pointerId)) return;
                pts.delete(e.pointerId);
                if (pts.size < 2) pinch = null;
                if (pts.size === 1) { const [p] = [...pts.values()]; start = { x: p[0], y: p[1], t: Date.now(), moved: true, ox: m.x, oy: m.y }; return; }
                if (!pts.size && start && !start.moved && Date.now() - start.t < 400) {
                    const hit = document.elementFromPoint(e.clientX, e.clientY);
                    const g = hit && hit.closest && hit.closest('[data-g]');
                    this.mmSelect(g ? g.dataset.g : '');
                }
                if (!pts.size) start = null;
            };
            el.addEventListener('pointerup', up);
            el.addEventListener('pointercancel', up);
            el.addEventListener('wheel', (e) => { e.preventDefault(); const r = rect(); this._mmZoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
            el.addEventListener('dblclick', (e) => { const r = rect(); this._mmZoomAt(e.clientX - r.left, e.clientY - r.top, 1.8); });
        },

        mmZoom(k) { const el = document.getElementById('mmMap'); if (el) this._mmZoomAt(el.clientWidth / 2, el.clientHeight / 2, k); },
        mmReset() { this._mmFit(); },

        mmSelect(g) {
            const m = this._mm;
            m.sel = m.sel === g ? '' : g;
            document.querySelectorAll('#mmMap .mm-g, #mmMap .mm-l').forEach((p) => p.classList.toggle('sel', p.dataset.g === m.sel));
            this._mmSheet();
        },

        // ---------- numbers ----------
        async _mmLoad() {
            const m = this._mm;
            try {
                const { ref, get } = window.firebaseDbHelpers;
                const snap = await get(ref(window.firebaseDb, 'studentMap'));
                const all = snap.exists() ? snap.val() : {}, now = Date.now(), today = this.localDateStr();
                const stats = {};
                GOVS.forEach((g) => { stats[g] = { n: 0, now: 0, moods: {} }; });
                let total = 0, online = 0;
                Object.keys(all).forEach((uid) => {
                    const v = all[uid], s = v && stats[v.g];
                    if (!s || !(now - Number(v.t) < ACTIVE)) return;
                    s.n++; total++;
                    if (now - Number(v.t) < NOW_MS) { s.now++; online++; }
                    if (v.m && v.d === today) s.moods[v.m] = (s.moods[v.m] || 0) + 1;
                });
                m.stats = stats; m.total = total; m.online = online; m.loaded = true;
                this._mmPaint();
                this._mmSheet();
            } catch (e) {
                console.warn('Students map load failed:', e);
                if (String(e && e.message || e).includes('ermission')) { m.denied = true; this._mmSheet(); }
            }
        },

        _mmPaint() {
            const m = this._mm, max = Math.max(1, ...GOVS.map((g) => m.stats[g].n));
            document.querySelectorAll('#mmMap .mm-g').forEach((p) => {
                const s = m.stats[p.dataset.g];
                p.style.setProperty('--a', (0.06 + 0.5 * Math.sqrt(s ? s.n / max : 0)).toFixed(3));
            });
            document.querySelectorAll('#mmMap .mm-l').forEach((l) => {
                const s = m.stats[l.dataset.g] || { n: 0, moods: {} };
                l.querySelector('b').textContent = s.n.toLocaleString('en');
                const top = this.MOODS.map((x) => [x, s.moods[x.k] || 0]).sort((a, b) => b[1] - a[1])[0];
                l.querySelector('.mm-dot').style.background = top && top[1] ? top[0].c : 'rgba(255,255,255,.5)';
            });
            const t = document.getElementById('mmTotal');
            if (t) t.innerHTML = `<b>${(m.total || 0).toLocaleString('en')}</b> طالب${m.online ? ` · <span class="mm-live"></span>${m.online} هسه` : ''}`;
        },

        // ---------- the bottom sheet ----------
        _mmSheet() {
            const m = this._mm, el = document.getElementById('mmSheet');
            if (!el) return;
            const mine = this._myGov(), today = this.localDateStr(), myMood = this._moodsLoad()[today];
            let h = '';
            if (m.sel) {
                const s = (m.stats || {})[m.sel] || { n: 0, now: 0, moods: {} }, sum = this.MOODS.reduce((a, x) => a + (s.moods[x.k] || 0), 0);
                h += `<div class="mm-card"><div class="mm-card-h"><div><b>${esc(m.sel)}</b><small>${s.n.toLocaleString('en')} طالب${s.now ? ' · ' + s.now + ' هسه' : ''}${m.rx[m.sel] ? ' · ' + m.rx[m.sel] + ' تفاعل' : ''}</small></div>
                    <button class="mm-x" onclick="app.mmSelect('')" aria-label="سد"><i data-lucide="x"></i></button></div>
                    ${sum ? `<div class="mm-bars">${this.MOODS.map((x) => { const n = s.moods[x.k] || 0; return `<div class="mm-bar"><span style="color:${x.c}"><i data-lucide="${x.ic}"></i>${x.l}</span><i><em style="width:${Math.round(n / sum * 100)}%;background:${x.c}"></em></i><b>${n}</b></div>`; }).join('')}</div>`
                        : '<p class="mm-empty">محد كتب مزاجه اليوم بهاي المحافظة.</p>'}</div>`;
            }
            if (!this.isLoggedIn || !this.authUid) {
                h += `<div class="mm-join"><b>سجّل دخولك حتى تشوف الطلاب وتتفاعل</b><button onclick="app.goToAuth('login')">تسجيل الدخول</button></div>`;
            } else if (m.denied) {
                h += `<div class="mm-join"><b>الخارطة بعدها ما مفعلة</b><small>لازم الإدارة تنشر قواعد قاعدة البيانات الجديدة.</small></div>`;
            } else if (!mine) {
                h += `<div class="mm-join"><b>من يا محافظة انت؟</b><div class="mm-govs">${GOVS.map((g, i) => `<button onclick="app.mmSetGov(${i})">${esc(g)}</button>`).join('')}</div></div>`;
            } else {
                h += `<div class="mm-row"><span class="mm-cap">مزاجك</span><div class="mm-moods">${this.MOODS.map((x) =>
                    `<button class="${myMood === x.k ? 'on' : ''}" style="--c:${x.c}" onclick="app.mmMood('${x.k}')"><i data-lucide="${x.ic}"></i>${x.l}</button>`).join('')}</div></div>
                    <div class="mm-rx" id="mmRx">${REACTS.map((r) => `<button data-k="${r.k}" style="--c:${r.c}" onclick="app.mmReact('${r.k}')" aria-label="${r.l}"><i data-lucide="${r.ic}"></i></button>`).join('')}</div>
                    <small class="mm-hint">تفاعلك يطلع فوق ${esc(mine)} ويختفي بثواني، والكل يشوفه</small>`;
            }
            el.innerHTML = h;
            lucide.createIcons();
            // keep the drawn icons, so floating reactions don't need lucide each time
            el.querySelectorAll('#mmRx button').forEach((b) => { const s = b.querySelector('svg'); if (s) m.svg[b.dataset.k] = s.outerHTML; });
        },

        mmSetGov(i) {
            const g = GOVS[i];
            if (!g || !this.currentUser) return;
            this.currentUser.governorate = g;
            this.currentUser.location = this.currentUser.location || g;
            this.saveUserData();
            if (window.firebaseDb && this.authUid) {
                const { ref, update } = window.firebaseDbHelpers;
                update(ref(window.firebaseDb, 'users/' + this.authUid), { governorate: g }).catch((e) => console.warn('Governorate save failed:', e));
            }
            this._mm.joined = this._smPing(true);
            this._mmSheet();
            setTimeout(() => this._mmLoad(), 800);
        },

        mmMood(k) {
            this.setMood(k);
            this._mmSheet();
            setTimeout(() => this._mmLoad(), 800);
        },

        // ---------- reactions ----------
        async mmReact(k) {
            const m = this._mm, g = this._myGov(), r = REACTS.find((x) => x.k === k);
            if (!r || !g || !this.authUid || !window.firebaseDb) return;
            const btn = document.querySelector(`#mmRx button[data-k="${k}"]`);
            if (Date.now() - m.lastRx < RX_GAP) { btn?.classList.remove('wait'); void (btn && btn.offsetWidth); btn?.classList.add('wait'); return; }
            m.lastRx = Date.now();
            document.getElementById('mmRx')?.classList.add('cool');
            setTimeout(() => document.getElementById('mmRx')?.classList.remove('cool'), RX_GAP);
            const key = Date.now().toString(36) + '_' + this.authUid.slice(0, 6) + Math.random().toString(36).slice(2, 6);
            m.mine.add(key);
            this._mmFloat(g, k);
            try {
                await m.joined;
                const { ref, update, serverTimestamp } = window.firebaseDbHelpers;
                await update(ref(window.firebaseDb), { ['mapReacts/' + key]: { u: this.authUid, g, e: k, t: serverTimestamp() }, ['studentMap/' + this.authUid + '/r']: serverTimestamp() });
            } catch (e) {
                console.warn('Reaction failed:', e);
            }
        },

        _mmListen() {
            const m = this._mm;
            if (m.off) return;
            const { ref, query, orderByChild, startAt, onChildAdded } = window.firebaseDbHelpers;
            m.off = onChildAdded(query(ref(window.firebaseDb, 'mapReacts'), orderByChild('t'), startAt(Date.now() - 8000)), (snap) => {
                const v = snap.val();
                if (!v || m.mine.has(snap.key) || !IRAQ_GEO.g[v.g]) return;
                if (Date.now() - Number(v.t) > 20000) return;
                this._mmFloat(v.g, v.e);
            }, (e) => console.warn('Reactions listen failed:', e));
        },

        // reactions older than two minutes are cleared by whoever opens the map
        async _mmSweep() {
            try {
                const { ref, get, update, query, orderByChild, endAt, limitToFirst } = window.firebaseDbHelpers;
                const snap = await get(query(ref(window.firebaseDb, 'mapReacts'), orderByChild('t'), endAt(Date.now() - 120000), limitToFirst(40)));
                if (!snap.exists()) return;
                const del = {};
                Object.keys(snap.val()).forEach((k) => { del['mapReacts/' + k] = null; });
                await update(ref(window.firebaseDb), del);
            } catch (e) {}
        },

        _mmFloat(g, k) {
            const m = this._mm, layer = document.getElementById('mmFloats'), geo = IRAQ_GEO.g[g], r = REACTS.find((x) => x.k === k);
            if (!layer || !geo || !r || layer.childElementCount > 30 || document.hidden) return;
            m.rx[g] = (m.rx[g] || 0) + 1;
            setTimeout(() => { m.rx[g] = Math.max(0, (m.rx[g] || 0) - 1); }, 60000);
            const p = px(geo.c[0], geo.c[1]), el = document.createElement('div');
            el.className = 'mm-fl';
            el.style.left = (p[0] + (Math.random() - 0.5) * 50).toFixed(1) + 'px';
            el.style.top = (p[1] + (Math.random() - 0.5) * 30).toFixed(1) + 'px';
            el.innerHTML = `<span style="--c:${r.c};--dx:${((Math.random() - 0.5) * 40).toFixed(0)}px">${m.svg[k] || ''}</span>`;
            el.addEventListener('animationend', () => el.remove(), { once: true });
            layer.appendChild(el);
            setTimeout(() => el.remove(), 2600);
            const path = document.querySelector(`#mmMap .mm-g[data-g="${g}"]`);
            if (path) { path.classList.remove('ping'); void path.getBoundingClientRect(); path.classList.add('ping'); }
        },
    });
})();
