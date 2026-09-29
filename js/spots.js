// أماكن الدراسة: libraries, quiet cafés, study halls and university libraries in each governorate,
// on a real street map (Leaflet, CARTO / Esri tiles, no key). Students suggest places
// (spotsPending, approved by the admin into spots), rate them (spotRates) and mark that they
// are studying there now (spotHere, for 3 hours). The student's location is only used on the
// phone, to sort by distance; it is never saved. Loaded on demand by app._need('spots').
(function () {
    const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
    const HERE_MS = 3 * 3600000;
    const TYPES = {
        lib: ['مكتبة', 'library-big', '#2563EB'],
        cafe: ['مقهى هادئ', 'coffee', '#B45309'],
        hall: ['قاعة دراسة', 'armchair', '#7C3AED'],
        uni: ['مكتبة جامعة', 'graduation-cap', '#0F766E'],
        other: ['مكان ثاني', 'map-pin', '#E11D48'],
    };
    const FEATS = {
        wifi: ['واي فاي', 'wifi'], power: ['كهرباء دائمة', 'plug-zap'], ac: ['تبريد', 'snowflake'],
        quiet: ['هادئ', 'volume-x'], coffee: ['مشروبات', 'cup-soda'], free: ['مجاني', 'badge-check'],
    };
    const SEX = { all: 'للجميع', f: 'للبنات', m: 'للأولاد' };
    // each governorate's centre
    const GOV_C = {
        'بغداد': [33.3152, 44.3661], 'البصرة': [30.5085, 47.7804], 'نينوى': [36.345, 43.145], 'أربيل': [36.1911, 44.0092],
        'السليمانية': [35.5613, 45.4309], 'دهوك': [36.8671, 42.9885], 'حلبجة': [35.1778, 45.9861], 'كركوك': [35.4681, 44.3922],
        'الأنبار': [33.4206, 43.307], 'صلاح الدين': [34.6071, 43.6782], 'ديالى': [33.75, 44.6333], 'بابل': [32.4637, 44.4196],
        'كربلاء': [32.616, 44.0249], 'النجف': [32.0259, 44.3462], 'واسط': [32.5128, 45.8182], 'القادسية': [31.9929, 44.9253],
        'ذي قار': [31.0439, 46.2575], 'ميسان': [31.8356, 47.144], 'المثنى': [31.3099, 45.2806],
    };
    const GOVS = Object.keys(GOV_C);
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const imgOk = (u) => (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(u || '')) ? u : '');
    const fmtKm = (m) => (m < 1000 ? Math.round(m / 10) * 10 + ' م' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' كم');
    const hav = (a, b) => {
        const R = 6371000, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
        const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(x));
    };
    const toMin = (hm) => { const m = /^(\d\d):(\d\d)$/.exec(hm || ''); return m ? +m[1] * 60 + +m[2] : null; };
    const hm12 = (hm) => {
        const t = toMin(hm); if (t === null) return '';
        const h = Math.floor(t / 60) % 24, mm = String(t % 60).padStart(2, '0');
        return (h % 12 || 12) + ':' + mm + (h < 12 ? ' ص' : ' م');
    };
    // open now, and when that changes
    function openState(h) {
        if (!h) return null;
        const d = new Date();
        if (h.fri && d.getDay() === 5) return { open: false, txt: 'مسدود اليوم (الجمعة)' };
        if (h.a24) return { open: true, txt: 'مفتوح 24 ساعة' };
        const o = toMin(h.o), c = toMin(h.c);
        if (o === null || c === null) return null;
        const now = d.getHours() * 60 + d.getMinutes();
        const open = c > o ? now >= o && now < c : now >= o || now < c;
        const soon = open ? ((c - now + 1440) % 1440) <= 45 : ((o - now + 1440) % 1440) <= 45;
        return { open, soon, txt: open ? (soon ? 'يسد قريب · ' : 'مفتوح هسه · يسد ') + hm12(h.c) : (soon ? 'يفتح قريب · ' : 'مسدود هسه · يفتح ') + hm12(h.o) };
    }
    const stars = (v, size) => {
        let h = '';
        for (let i = 1; i <= 5; i++) h += `<i class="sp-star${v >= i - 0.25 ? ' on' : v >= i - 0.75 ? ' half' : ''}" style="--s:${size || 14}px"></i>`;
        return `<span class="sp-stars">${h}</span>`;
    };

    function loadLeaflet() {
        if (window.L && L.map) return Promise.resolve();
        if (loadLeaflet.p) return loadLeaflet.p;
        loadLeaflet.p = new Promise((res, rej) => {
            const css = document.createElement('link');
            css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css';
            document.head.appendChild(css);
            const sc = document.createElement('script');
            sc.src = LEAFLET + 'leaflet.min.js';
            sc.onload = () => res();
            sc.onerror = () => { loadLeaflet.p = null; rej(new Error('leaflet')); };
            document.head.appendChild(sc);
        });
        return loadLeaflet.p;
    }

    function shrink(file, max, q) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file), im = new Image();
            im.onload = () => {
                const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
                c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
                const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                resolve(c.toDataURL('image/jpeg', q));
            };
            im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
            im.src = url;
        });
    }

    Object.assign(app, {
        spOpen() {
            const saved = (() => { try { return localStorage.getItem('isp_sp_gov') || ''; } catch (e) { return ''; } })();
            this._sp = this._sp || {
                gov: GOV_C[saved] ? saved : this._myGov() || 'بغداد', spots: {}, rates: {}, here: {}, full: {},
                on: {}, sheet: 'peek', layer: 'map', me: null, sel: '', mode: 'list', loaded: false,
            };
            document.body.classList.add('sp-on');
            this._spHead();
            this._spListRender();
            loadLeaflet().then(() => { if (this.currentView === 'spotsView') { this._spMapInit(); this._spListen(); } })
                .catch(() => { const l = document.getElementById('spMap'); if (l) l.innerHTML = '<div class="sp-maperr">ما انحملت الخارطة، تأكد من النت</div>'; this._spListen(); });
        },

        spClose() {
            document.body.classList.remove('sp-on');
            document.querySelectorAll('.sp-detail, .sp-form, .sp-govs, .sp-lb').forEach((n) => n.remove());
            if (this._sp) this._sp.mode = 'list';
        },

        // ---------- data ----------
        _spListen() {
            const s = this._sp;
            if (s.off || !window.firebaseDb) { s.loaded = true; this._spListRender(); return; }
            const { ref, onValue } = window.firebaseDbHelpers;
            const a = onValue(ref(window.firebaseDb, 'spots'), (snap) => {
                const v = snap.val() || {};
                s.spots = {};
                Object.keys(v).forEach((id) => { const x = v[id]; if (x && x.n && GOV_C[x.g] && isFinite(x.lat) && isFinite(x.lng)) s.spots[id] = Object.assign({ id }, x); });
                s.loaded = true;
                this._spRefresh();
            }, () => { s.loaded = true; this._spRefresh(); });
            const b = onValue(ref(window.firebaseDb, 'spotRates'), (snap) => { s.rates = snap.val() || {}; this._spRefresh(); }, () => {});
            const c = onValue(ref(window.firebaseDb, 'spotHere'), (snap) => { s.here = snap.val() || {}; this._spRefresh(); }, () => {});
            s.off = () => { a(); b(); c(); };
        },

        // show all of the governorate's places once they are known
        _spFit(force) {
            const s = this._sp;
            if (!s.map || (!force && s.fitted === s.gov)) return;
            const pts = this._spInGov().map((x) => [x.lat, x.lng]);
            if (!pts.length) { if (force) s.map.flyTo(GOV_C[s.gov], 12, { duration: 0.8 }); return; }
            s.fitted = s.gov;
            const h = s.map.getSize().y;
            if (pts.length === 1) s.map.flyTo(pts[0], 15, { duration: 0.8 });
            else s.map.flyToBounds(pts, { paddingTopLeft: [40, 130], paddingBottomRight: [40, Math.round(h * 0.46)], maxZoom: 16, duration: 0.8 });
        },

        _spRefresh() {
            if (this.currentView !== 'spotsView') return;
            if (this._sp.loaded) this._spFit();
            this._spMarkers();
            this._spListRender();
            this._spHead();
            if (this._sp.mode === 'detail' && this._sp.sel) this._spDetailRender(true);
        },

        _spRate(id) {
            const r = this._sp.rates[id] || {}, list = Object.keys(r).map((u) => Object.assign({ u }, r[u])).filter((x) => x.s >= 1 && x.s <= 5);
            const n = list.length, avg = n ? list.reduce((a, x) => a + x.s, 0) / n : 0;
            return { n, avg, list: list.sort((a, b) => (b.at || 0) - (a.at || 0)) };
        },
        _spHere(id) {
            const h = this._sp.here[id] || {}, now = Date.now();
            return Object.keys(h).map((u) => Object.assign({ u }, h[u])).filter((x) => now - (Number(x.t) || 0) < HERE_MS);
        },
        _spInGov() { const s = this._sp; return Object.values(s.spots).filter((x) => x.g === s.gov); },

        _spFiltered() {
            const s = this._sp, on = s.on;
            const types = Object.keys(TYPES).filter((k) => on['t_' + k]);
            let list = this._spInGov().filter((x) => {
                if (types.length && !types.includes(x.t)) return false;
                for (const k of Object.keys(FEATS)) if (on['f_' + k] && !(x.f && x.f[k])) return false;
                if (on.s_f && x.sex === 'm') return false;
                if (on.s_m && x.sex === 'f') return false;
                if (on.open) { const st = openState(x.h); if (!st || !st.open) return false; }
                return true;
            });
            list.forEach((x) => { x._d = s.me ? hav(s.me, [x.lat, x.lng]) : null; x._r = this._spRate(x.id); x._h = this._spHere(x.id).length; x._o = openState(x.h); });
            list.sort((a, b) => (b.feat ? 1 : 0) - (a.feat ? 1 : 0) || (s.me ? a._d - b._d : 0) || (b._h - a._h) || (b._r.avg - a._r.avg) || a.n.localeCompare(b.n, 'ar'));
            return list;
        },

        // ---------- map ----------
        _spIcons() {
            if (this._spSvg) return this._spSvg;
            const box = document.createElement('div');
            box.style.cssText = 'position:absolute;left:-9999px;top:0';
            box.innerHTML = Object.keys(TYPES).map((k) => `<i data-k="${k}" data-lucide="${TYPES[k][1]}"></i>`).join('')
                + Object.keys(FEATS).map((k) => `<i data-f="${k}" data-lucide="${FEATS[k][1]}"></i>`).join('');
            document.body.appendChild(box);
            lucide.createIcons();
            const svg = { t: {}, f: {} };
            box.querySelectorAll('[data-k]').forEach((n) => { svg.t[n.dataset.k] = n.outerHTML; });
            box.querySelectorAll('[data-f]').forEach((n) => { svg.f[n.dataset.f] = n.outerHTML; });
            box.remove();
            this._spSvg = svg;
            return svg;
        },

        _spTiles() {
            const s = this._sp, dark = document.documentElement.classList.contains('dark');
            if (s.tiles) s.map.removeLayer(s.tiles);
            if (s.labels) { s.map.removeLayer(s.labels); s.labels = null; }
            if (s.layer === 'sat') {
                s.tiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' }).addTo(s.map);
                s.labels = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19 }).addTo(s.map);
            } else {
                s.tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/' + (dark ? 'dark_all' : 'voyager') + '/{z}/{x}/{y}{r}.png',
                    { subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(s.map);
            }
        },

        _spMapInit() {
            const s = this._sp, el = document.getElementById('spMap');
            if (!el) return;
            if (s.map && s.mapEl === el) { s.map.invalidateSize(); this._spMarkers(); return; }
            el.innerHTML = '';
            s.map = L.map(el, { zoomControl: false, attributionControl: true, tap: true }).setView(GOV_C[s.gov], 12);
            s.map.attributionControl.setPrefix('');
            s.mapEl = el;
            this._spTiles();
            s.layerG = L.layerGroup().addTo(s.map);
            s.map.on('click', () => { if (s.mode === 'list' && s.sel) { s.sel = ''; this._spMarkers(); this._spListRender(); } });
            this._spMarkers();
            if (s.loaded) this._spFit();
        },

        _spMarkers() {
            const s = this._sp;
            if (!s.map || !s.layerG) return;
            const svg = this._spIcons();
            s.layerG.clearLayers();
            s.mk = {};
            this._spFiltered().forEach((x) => {
                const ty = TYPES[x.t] || TYPES.other, here = x._h, st = x._o;
                const html = `<div class="sp-pin${s.sel === x.id ? ' sel' : ''}${x.feat ? ' feat' : ''}${st && !st.open ? ' closed' : ''}" style="--c:${ty[2]}">
                    <span class="sp-pin-b">${svg.t[x.t] || svg.t.other}</span>${here ? `<em>${here}</em>` : ''}</div>`;
                const m = L.marker([x.lat, x.lng], { icon: L.divIcon({ html, className: 'sp-pin-w', iconSize: [44, 52], iconAnchor: [22, 50] }), zIndexOffset: s.sel === x.id ? 1000 : x.feat ? 500 : 0 });
                m.on('click', () => this.spSelect(x.id, true));
                m.addTo(s.layerG);
                s.mk[x.id] = m;
            });
            if (s.me) L.marker(s.me, { icon: L.divIcon({ html: '<div class="sp-me"><i></i></div>', className: 'sp-pin-w', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false }).addTo(s.layerG);
        },

        spSelect(id, fromMap) {
            const s = this._sp, x = s.spots[id];
            if (!x) return;
            s.sel = id;
            this._spMarkers();
            if (s.map) s.map.flyTo([x.lat, x.lng], Math.max(s.map.getZoom(), 15), { duration: 0.6 });
            if (fromMap) { s.sheet = 'peek'; this._spListRender(); this._spSheetApply(); document.querySelector('#spList .sp-card.sel')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }
            else this.spDetail(id);
        },

        spLayer() {
            const s = this._sp;
            if (!s.map) return;
            s.layer = s.layer === 'sat' ? 'map' : 'sat';
            this._spTiles();
            document.getElementById('spLayerBtn')?.classList.toggle('on', s.layer === 'sat');
        },

        spLocate() {
            const s = this._sp;
            if (!navigator.geolocation) { this.showToast('موبايلك ما يدعم تحديد الموقع'); return; }
            const btn = document.getElementById('spLocBtn');
            btn?.classList.add('busy');
            navigator.geolocation.getCurrentPosition((p) => {
                btn?.classList.remove('busy');
                s.me = [p.coords.latitude, p.coords.longitude];
                // near another governorate's centre: show that one
                const near = GOVS.map((g) => [g, hav(s.me, GOV_C[g])]).sort((a, b) => a[1] - b[1])[0];
                if (near && near[0] !== s.gov && near[1] < 60000) this.spSetGov(near[0], true);
                if (s.map) s.map.flyTo(s.me, 14, { duration: 0.8 });
                this._spMarkers(); this._spListRender();
            }, (e) => {
                btn?.classList.remove('busy');
                this.showToast(e.code === 1 ? 'اسمح للتطبيق يعرف موقعك من إعدادات المتصفح' : 'ما كدرت أحدد موقعك');
            }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
        },

        // ---------- top bar, filters, sheet ----------
        _spHead() {
            const s = this._sp, g = document.getElementById('spGov');
            if (g) g.innerHTML = `<i data-lucide="map-pin"></i><b>${esc(s.gov)}</b><i data-lucide="chevron-down"></i>`;
            const f = document.getElementById('spFilters');
            if (f) {
                const chip = (k, label, ic) => `<button class="${s.on[k] ? 'on' : ''}" onclick="app.spToggle('${k}')">${ic ? `<i data-lucide="${ic}"></i>` : ''}${label}</button>`;
                f.innerHTML = chip('open', 'مفتوح هسه', 'clock')
                    + Object.keys(TYPES).filter((k) => k !== 'other').map((k) => chip('t_' + k, TYPES[k][0], TYPES[k][1])).join('')
                    + chip('f_wifi', 'واي فاي', 'wifi') + chip('f_power', 'كهرباء', 'plug-zap') + chip('f_ac', 'تبريد', 'snowflake') + chip('f_free', 'مجاني', 'badge-check')
                    + chip('s_f', 'للبنات', '') + chip('s_m', 'للأولاد', '');
            }
            lucide.createIcons();
        },

        spToggle(k) {
            const s = this._sp;
            s.on[k] = !s.on[k];
            if (k === 's_f' && s.on.s_f) s.on.s_m = false;
            if (k === 's_m' && s.on.s_m) s.on.s_f = false;
            this._spHead(); this._spMarkers(); this._spListRender();
        },

        spPickGov() {
            const s = this._sp;
            document.querySelector('.sp-govs')?.remove();
            const counts = {};
            Object.values(s.spots).forEach((x) => { counts[x.g] = (counts[x.g] || 0) + 1; });
            const el = document.createElement('div');
            el.className = 'sp-govs';
            el.innerHTML = `<div class="sp-govs-p"><b>اختار المحافظة</b><div>${GOVS.map((g) => `<button class="${g === s.gov ? 'on' : ''}" onclick="app.spSetGov(${jsArg(g)})">${esc(g)}${counts[g] ? `<small>${counts[g]}</small>` : ''}</button>`).join('')}</div></div>`;
            el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
            document.body.appendChild(el);
            requestAnimationFrame(() => el.classList.add('in'));
        },

        spSetGov(g, keepView) {
            const s = this._sp;
            document.querySelector('.sp-govs')?.remove();
            if (!GOV_C[g]) return;
            s.gov = g; s.sel = '';
            try { localStorage.setItem('isp_sp_gov', g); } catch (e) {}
            if (s.map && !keepView) this._spFit(true);
            this._spHead(); this._spMarkers(); this._spListRender();
        },

        spSheetToggle() { const s = this._sp; s.sheet = s.sheet === 'full' ? 'peek' : 'full'; this._spSheetApply(); },
        _spSheetApply() {
            const sh = document.getElementById('spSheet');
            if (sh) sh.dataset.st = this._sp.sheet;
        },
        _spSheetDrag() {
            const sh = document.getElementById('spSheet'), grip = document.getElementById('spGrip');
            if (!sh || !grip || grip.dataset.on) return;
            grip.dataset.on = '1';
            let y0 = null;
            grip.addEventListener('pointerdown', (e) => { y0 = e.clientY; grip.setPointerCapture(e.pointerId); });
            grip.addEventListener('pointerup', (e) => {
                if (y0 === null) return;
                const dy = e.clientY - y0; y0 = null;
                if (Math.abs(dy) < 8) { this.spSheetToggle(); return; }
                this._sp.sheet = dy < 0 ? 'full' : 'peek';
                this._spSheetApply();
            });
        },

        _spListRender() {
            const s = this._sp, box = document.getElementById('spList'), head = document.getElementById('spCount');
            if (!box || !s) return;
            this._spSheetApply(); this._spSheetDrag();
            if (!s.loaded) { box.innerHTML = '<div class="sp-load"><i></i><i></i></div>'; return; }
            const all = this._spInGov(), list = this._spFiltered(), svg = this._spIcons();
            const nHere = all.reduce((a, x) => a + this._spHere(x.id).length, 0);
            if (head) head.innerHTML = `<b>${list.length} ${list.length === 1 ? 'مكان' : 'أماكن'} للدراسة بـ${esc(s.gov)}</b>${nHere ? `<small><span class="sp-live"></span>${nHere} يدرسون هسه</small>` : `<small>${s.me ? 'مرتبة حسب الأقرب إلك' : 'اضغط زر الموقع حتى ترتب حسب الأقرب'}</small>`}`;
            if (!all.length) {
                box.innerHTML = `<div class="sp-empty"><span>${svg.t.lib}</span><b>بعد ماكو أماكن بـ${esc(s.gov)}</b><p>تعرف مكتبة أو مقهى هادئ تدرس بيه؟ ضيفه وخلي طلاب محافظتك يستفادون، وتاخذ 50 نقطة لمن ينقبل.</p><button onclick="app.spAddOpen()"><i data-lucide="plus"></i>ضيف أول مكان</button></div>`;
                lucide.createIcons();
                return;
            }
            if (!list.length) { box.innerHTML = '<p class="sp-none">ماكو مكان بهاي الفلاتر. شيل بعضها.</p>'; return; }
            box.innerHTML = list.map((x, i) => {
                const ty = TYPES[x.t] || TYPES.other, st = x._o, r = x._r;
                return `<button class="sp-card${s.sel === x.id ? ' sel' : ''}${x.feat ? ' feat' : ''}" style="--c:${ty[2]};--i:${Math.min(i, 10)}" onclick="app.spSelect(${jsArg(x.id)})">
                    <span class="sp-card-img">${imgOk(x.img) ? `<img src="${x.img}" alt="" loading="lazy">` : `<span class="sp-card-ph">${svg.t[x.t] || svg.t.other}</span>`}
                        ${x.feat ? '<em class="sp-feat">مميز</em>' : ''}${x._h ? `<em class="sp-herec"><span class="sp-live"></span>${x._h}</em>` : ''}</span>
                    <span class="sp-card-b">
                        <b dir="auto">${esc(x.n)}</b>
                        <span class="sp-card-m"><span class="sp-type">${svg.t[x.t] || ''}${ty[0]}</span>${x._d !== null ? `<span>${fmtKm(x._d)}</span>` : ''}${x.sex && x.sex !== 'all' ? `<span>${SEX[x.sex]}</span>` : ''}</span>
                        ${r.n ? `<span class="sp-card-r">${stars(r.avg, 12)}<small>${r.avg.toFixed(1)} (${r.n})</small></span>` : '<span class="sp-card-r new"><small>جديد، ما مقيّم بعد</small></span>'}
                        ${st ? `<span class="sp-open ${st.open ? (st.soon ? 'soon' : 'yes') : 'no'}">${esc(st.txt)}</span>` : ''}
                        <span class="sp-card-f">${Object.keys(FEATS).filter((k) => x.f && x.f[k]).map((k) => `<span title="${FEATS[k][0]}">${svg.f[k]}</span>`).join('')}</span>
                    </span>
                </button>`;
            }).join('');
        },

        // ---------- one place ----------
        spDetail(id) {
            const s = this._sp;
            if (!s.spots[id]) return;
            s.sel = id; s.mode = 'detail';
            document.querySelector('.sp-detail')?.remove();
            const el = document.createElement('div');
            el.className = 'sp-detail';
            el.innerHTML = '<div class="sp-dp" id="spDp"></div>';
            el.addEventListener('click', (e) => { if (e.target === el) this.spDetailClose(); });
            document.body.appendChild(el);
            requestAnimationFrame(() => el.classList.add('in'));
            this._spDetailRender();
            this._spFull(id);
        },
        spDetailClose() {
            const el = document.querySelector('.sp-detail');
            if (el) { el.classList.remove('in'); setTimeout(() => el.remove(), 260); }
            if (this._sp) { this._sp.mode = 'list'; this._spListRender(); }
        },

        async _spFull(id) {
            const s = this._sp;
            if (s.full[id] === undefined && window.firebaseDb) {
                s.full[id] = '';
                try { const { ref, get } = window.firebaseDbHelpers; s.full[id] = imgOk((await get(ref(window.firebaseDb, 'spotImgs/' + id))).val()); } catch (e) {}
            }
            const im = document.getElementById('spHeroImg');
            if (im && s.sel === id && s.full[id]) im.src = s.full[id];
        },

        _spDetailRender(soft) {
            const s = this._sp, x = s.spots[s.sel], box = document.getElementById('spDp');
            if (!box) return;
            if (!x) { this.spDetailClose(); return; }
            const ty = TYPES[x.t] || TYPES.other, svg = this._spIcons(), st = openState(x.h), r = this._spRate(x.id), here = this._spHere(x.id);
            const meHere = here.some((h) => h.u === this.authUid), mine = (s.rates[x.id] || {})[this.authUid];
            const d = s.me ? hav(s.me, [x.lat, x.lng]) : null, img = s.full[x.id] || imgOk(x.img);
            const scroll = soft ? box.scrollTop : 0;
            const draft = soft ? (document.getElementById('spRevTx') || {}).value : '';
            const hours = x.h ? (x.h.a24 ? 'مفتوح 24 ساعة' : hm12(x.h.o) + ' – ' + hm12(x.h.c)) + (x.h.fri ? ' · مسدود الجمعة' : '') : '';
            box.innerHTML = `
                <div class="sp-hero" style="--c:${ty[2]}">
                    ${img ? `<img id="spHeroImg" src="${img}" alt="" onclick="app.spZoom()">` : `<span class="sp-hero-ph">${svg.t[x.t] || svg.t.other}</span>`}
                    <button class="sp-x" onclick="app.spDetailClose()" aria-label="رجوع"><i data-lucide="chevron-down"></i></button>
                    ${x.feat ? '<em class="sp-feat big">مكان مميز</em>' : ''}
                </div>
                <div class="sp-db">
                    <div class="sp-dt"><span class="sp-type big" style="--c:${ty[2]}">${svg.t[x.t] || ''}${ty[0]}</span>${x.sex && x.sex !== 'all' ? `<span class="sp-tag">${SEX[x.sex]}</span>` : ''}${d !== null ? `<span class="sp-tag">${fmtKm(d)} منك</span>` : ''}</div>
                    <h2 dir="auto">${esc(x.n)}</h2>
                    ${x.addr ? `<p class="sp-addr"><i data-lucide="map-pinned"></i>${esc(x.addr)}، ${esc(x.g)}</p>` : `<p class="sp-addr"><i data-lucide="map-pinned"></i>${esc(x.g)}</p>`}
                    <div class="sp-rsum">${r.n ? `<b>${r.avg.toFixed(1)}</b>${stars(r.avg, 18)}<small>${r.n} تقييم</small>` : '<small>ما مقيّم بعد، كون أول واحد يقيّمه</small>'}</div>
                    ${st ? `<div class="sp-open big ${st.open ? (st.soon ? 'soon' : 'yes') : 'no'}"><i data-lucide="clock"></i>${esc(st.txt)}</div>` : ''}
                    <div class="sp-acts">
                        <a class="sp-act go" href="https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}" target="_blank" rel="noopener"><i data-lucide="navigation"></i>وديني</a>
                        <button class="sp-act ${meHere ? 'on' : ''}" onclick="app.spHereToggle()"><i data-lucide="${meHere ? 'check' : 'book-open-check'}"></i>${meHere ? 'أنا هنا' : 'أدرس هنا هسه'}</button>
                        ${x.ph ? `<a class="sp-act" href="tel:${esc(x.ph)}"><i data-lucide="phone"></i>اتصل</a>` : ''}
                        <button class="sp-act" onclick="app.spShare()"><i data-lucide="share-2"></i>شارك</button>
                    </div>
                    ${here.length ? `<div class="sp-here"><div class="sp-avs">${here.slice(0, 6).map((h, i) => `<span style="--i:${i}">${esc(String(h.n || '؟').trim().charAt(0))}</span>`).join('')}</div>
                        <p><b>${here.length} ${here.length === 1 ? 'طالب يدرس' : 'طلاب يدرسون'} هنا هسه</b><small>${esc(here.slice(0, 3).map((h) => h.n).join('، '))}${here.length > 3 ? ' وغيرهم' : ''}</small></p></div>` : ''}
                    <h3>الخدمات</h3>
                    <div class="sp-feats">${Object.keys(FEATS).map((k) => `<span class="${x.f && x.f[k] ? 'on' : ''}">${svg.f[k]}${FEATS[k][0]}</span>`).join('')}</div>
                    ${hours || x.price ? `<h3>التفاصيل</h3><div class="sp-info">
                        ${hours ? `<div><i data-lucide="calendar-clock"></i><span>الدوام</span><b>${esc(hours)}</b></div>` : ''}
                        ${x.price ? `<div><i data-lucide="wallet"></i><span>السعر</span><b>${esc(x.price)}</b></div>` : ''}
                    </div>` : ''}
                    <h3>التقييمات</h3>
                    ${this.isLoggedIn && this.authUid ? `<div class="sp-rev-new">
                        <div class="sp-rate-pick">${[1, 2, 3, 4, 5].map((i) => `<button class="${(s.pick || (mine && mine.s) || 0) >= i ? 'on' : ''}" onclick="app.spPick(${i})" aria-label="${i} نجوم"></button>`).join('')}</div>
                        <textarea id="spRevTx" maxlength="200" rows="2" placeholder="شلون المكان؟ مثلاً: هادئ الصبح، الكهرباء ما تنكطع">${esc(draft || (mine && mine.c) || '')}</textarea>
                        <button class="sp-rev-send" onclick="app.spRateSave()">${mine ? 'حدّث تقييمي' : 'أضف تقييمي'}</button></div>` : ''}
                    <div class="sp-revs">${r.list.length ? r.list.slice(0, 30).map((v) => `<div class="sp-rev"><div><b>${esc(v.n || 'طالب')}</b>${stars(v.s, 12)}<small>${new Date(v.at || 0).toLocaleDateString('ar-IQ')}</small></div>${v.c ? `<p dir="auto">${esc(v.c)}</p>` : ''}</div>`).join('') : '<p class="sp-none">ماكو تقييمات بعد.</p>'}</div>
                </div>`;
            lucide.createIcons();
            if (soft) box.scrollTop = scroll;
        },

        spZoom() {
            const im = document.getElementById('spHeroImg');
            if (!im) return;
            const lb = document.createElement('div');
            lb.className = 'sp-lb';
            lb.innerHTML = `<img src="${im.src}" alt="">`;
            lb.addEventListener('click', () => lb.remove());
            document.body.appendChild(lb);
        },

        spPick(i) { this._sp.pick = i; this._spDetailRender(true); },

        async spRateSave() {
            const s = this._sp, x = s.spots[s.sel];
            if (!x || !this.authUid) return;
            const mine = (s.rates[x.id] || {})[this.authUid], v = s.pick || (mine && mine.s);
            if (!v) { this.showToast('اختار عدد النجوم'); return; }
            const c = String((document.getElementById('spRevTx') || {}).value || '').trim().slice(0, 200);
            const { ref, set, serverTimestamp } = window.firebaseDbHelpers;
            const o = { s: v, n: String((this.currentUser || {}).fullName || 'طالب').split(' ')[0].slice(0, 40), at: serverTimestamp() };
            if (c) o.c = c;
            try { await set(ref(window.firebaseDb, 'spotRates/' + x.id + '/' + this.authUid), o); s.pick = 0; this.showToast('شكراً، انحفظ تقييمك'); } catch (e) { this.showToast('ما انحفظ، تأكد من النت'); }
        },

        async spHereToggle() {
            const s = this._sp, x = s.spots[s.sel];
            if (!x) return;
            if (!this.isLoggedIn || !this.authUid) { this.showToast('سجّل دخولك أول'); this.goToAuth('login'); return; }
            const { ref, update, serverTimestamp } = window.firebaseDbHelpers;
            const meHere = this._spHere(x.id).some((h) => h.u === this.authUid), upd = {};
            // one place at a time
            Object.keys(s.here).forEach((sid) => { if (s.here[sid] && s.here[sid][this.authUid]) upd['spotHere/' + sid + '/' + this.authUid] = null; });
            if (!meHere) upd['spotHere/' + x.id + '/' + this.authUid] = { n: String((this.currentUser || {}).fullName || 'طالب').split(' ')[0].slice(0, 40), t: serverTimestamp() };
            try { await update(ref(window.firebaseDb), upd); this.showToast(meHere ? 'انشال اسمك من المكان' : 'انضفت، زملائك يشوفون إنك هنا لـ 3 ساعات'); } catch (e) { this.showToast('ما انحفظ، تأكد من النت'); }
        },

        spShare() {
            const x = this._sp.spots[this._sp.sel];
            if (!x) return;
            const url = 'https://www.google.com/maps/search/?api=1&query=' + x.lat + ',' + x.lng;
            const text = x.n + ' (' + (TYPES[x.t] || TYPES.other)[0] + ') مكان حلو للدراسة بـ' + x.g + '، لكيته بتطبيق منصة الطالب العراقي';
            if (navigator.share) navigator.share({ title: x.n, text, url }).catch(() => {});
            else { try { navigator.clipboard.writeText(text + '\n' + url); this.showToast('انتسخ الرابط'); } catch (e) {} }
        },

        // ---------- suggesting a place ----------
        spAddOpen() {
            const s = this._sp;
            if (!this.isLoggedIn || !this.authUid) { this.showToast('سجّل دخولك حتى تضيف مكان'); this.goToAuth('login'); return; }
            if (!s.map) { this.showToast('انتظر الخارطة تنحمل'); return; }
            s.mode = 'pick';
            s.draft = s.draft || { t: 'lib', sex: 'all', f: {}, h: { o: '08:00', c: '22:00' } };
            document.body.classList.add('sp-picking');
            if (s.me && hav(s.me, GOV_C[s.gov]) < 60000) s.map.flyTo(s.me, 17, { duration: 0.6 });
            else if (s.map.getZoom() < 14) s.map.flyTo(s.map.getCenter(), 15, { duration: 0.6 });
        },
        spPickCancel() { const s = this._sp; s.mode = 'list'; document.body.classList.remove('sp-picking'); },
        spPickDone() {
            const s = this._sp, c = s.map.getCenter();
            if (c.lat < 29 || c.lat > 37.5 || c.lng < 38.5 || c.lng > 48.8) { this.showToast('المكان لازم يكون داخل العراق'); return; }
            s.draft.lat = +c.lat.toFixed(6); s.draft.lng = +c.lng.toFixed(6);
            s.draft.g = s.draft.g || GOVS.map((g) => [g, hav([c.lat, c.lng], GOV_C[g])]).sort((a, b) => a[1] - b[1])[0][0];
            document.body.classList.remove('sp-picking');
            this._spForm();
        },

        _spForm() {
            const s = this._sp, d = s.draft, svg = this._spIcons();
            s.mode = 'form';
            let el = document.querySelector('.sp-form');
            const keep = el && el.querySelector('.sp-fp') ? el.querySelector('.sp-fp').scrollTop : 0;
            if (el) el.classList.add('shown');
            if (!el) {
                el = document.createElement('div');
                el.className = 'sp-form';
                document.body.appendChild(el);
                requestAnimationFrame(() => el.classList.add('in'));
            }
            el.innerHTML = `<div class="sp-fp">
                <div class="sp-fh"><button class="sp-x flat" onclick="app.spFormBack()" aria-label="رجوع"><i data-lucide="chevron-right"></i></button><b>ضيف مكان للدراسة</b><button class="sp-x flat" onclick="app.spFormClose()" aria-label="سد"><i data-lucide="x"></i></button></div>
                <button class="sp-fpic ${d.img ? 'has' : ''}" onclick="app.spPickImg()">${d.img ? `<img src="${d.img.thumb}" alt="">` : '<i data-lucide="camera"></i><b>صورة المكان</b><small>صورة وحدة واضحة من الداخل تفرق هواية</small>'}</button>
                <label>اسم المكان *</label><input id="spfN" maxlength="60" value="${esc(d.n || '')}" placeholder="مثلاً: مكتبة المتنبي العامة">
                <label>النوع</label><div class="sp-fchips">${Object.keys(TYPES).map((k) => `<button class="${d.t === k ? 'on' : ''}" style="--c:${TYPES[k][2]}" onclick="app.spDraft('t', '${k}')">${svg.t[k]}${TYPES[k][0]}</button>`).join('')}</div>
                <label>أقرب نقطة دالة</label><input id="spfA" maxlength="150" value="${esc(d.addr || '')}" placeholder="مثلاً: شارع الربيعي، قرب مطعم ...">
                <label>المحافظة</label><select id="spfG">${GOVS.map((g) => `<option ${g === d.g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
                <label>الدوام</label>
                <div class="sp-fhours ${d.h.a24 ? 'off' : ''}"><span>من</span><input type="time" id="spfO" value="${esc(d.h.o || '08:00')}"><span>إلى</span><input type="time" id="spfC" value="${esc(d.h.c || '22:00')}"></div>
                <div class="sp-fchips"><button class="${d.h.a24 ? 'on' : ''}" onclick="app.spDraftH('a24')">مفتوح 24 ساعة</button><button class="${d.h.fri ? 'on' : ''}" onclick="app.spDraftH('fri')">مسدود الجمعة</button></div>
                <label>الخدمات</label><div class="sp-fchips">${Object.keys(FEATS).map((k) => `<button class="${d.f[k] ? 'on' : ''}" onclick="app.spDraftF('${k}')">${svg.f[k]}${FEATS[k][0]}</button>`).join('')}</div>
                <label>لمن؟</label><div class="sp-fchips">${Object.keys(SEX).map((k) => `<button class="${d.sex === k ? 'on' : ''}" onclick="app.spDraft('sex', '${k}')">${SEX[k]}</button>`).join('')}</div>
                ${d.f.free ? '' : `<label>السعر (اختياري)</label><input id="spfP" maxlength="40" value="${esc(d.price || '')}" placeholder="مثلاً: 2,000 دينار الساعة">`}
                <label>رقم الهاتف (اختياري)</label><input id="spfPh" type="tel" dir="ltr" maxlength="16" value="${esc(d.ph || '')}" placeholder="07XXXXXXXXX">
                <p class="sp-fnote"><i data-lucide="shield-check"></i>المكان يطلع للطلاب بعد ما تراجعه الإدارة، ولمن ينقبل تاخذ 50 نقطة.</p>
                <button class="sp-fsend" id="spfSend" onclick="app.spSubmit()"><i data-lucide="send"></i>أرسل المكان</button>
            </div>`;
            lucide.createIcons();
            if (keep) el.querySelector('.sp-fp').scrollTop = keep;
        },
        _spKeep() {
            const d = this._sp.draft, v = (id) => { const e = document.getElementById(id); return e ? e.value : undefined; };
            if (!d || !document.getElementById('spfN')) return;
            d.n = v('spfN'); d.addr = v('spfA'); d.g = v('spfG') || d.g; d.h.o = v('spfO') || d.h.o; d.h.c = v('spfC') || d.h.c; d.ph = v('spfPh');
            if (v('spfP') !== undefined) d.price = v('spfP');
        },
        spDraft(k, val) { this._spKeep(); this._sp.draft[k] = val; this._spForm(); },
        spDraftH(k) { this._spKeep(); const h = this._sp.draft.h; h[k] = !h[k]; this._spForm(); },
        spDraftF(k) { this._spKeep(); const f = this._sp.draft.f; f[k] = !f[k]; this._spForm(); },
        spFormBack() { this._spKeep(); document.querySelector('.sp-form')?.remove(); this.spAddOpen(); },
        spFormClose() { document.querySelector('.sp-form')?.remove(); this._sp.mode = 'list'; },
        spPickImg() {
            this._spKeep();
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = async () => {
                const f = inp.files && inp.files[0];
                if (!f || !/^image\//.test(f.type)) return;
                try { const [thumb, full] = await Promise.all([shrink(f, 520, 0.78), shrink(f, 1400, 0.82)]); this._sp.draft.img = { thumb, full }; this._spForm(); } catch (e) { this.showToast('ما كدرت أقرا الصورة'); }
            };
            inp.click();
        },

        async spSubmit() {
            const s = this._sp;
            this._spKeep();
            const d = s.draft, n = String(d.n || '').trim(), ph = String(d.ph || '').replace(/[\s-]/g, '');
            if (!n) { this.showToast('اكتب اسم المكان'); return; }
            if (ph && !/^[+]?[0-9]{7,15}$/.test(ph)) { this.showToast('رقم الهاتف مو صحيح'); return; }
            if (!d.h.a24 && (toMin(d.h.o) === null || toMin(d.h.c) === null)) { this.showToast('اكتب أوقات الدوام'); return; }
            const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const o = { n: n.slice(0, 60), t: d.t, g: d.g, lat: d.lat, lng: d.lng, by: this.authUid, at: Date.now(), sex: d.sex, h: {} };
            if (d.h.a24) o.h.a24 = true; else { o.h.o = d.h.o; o.h.c = d.h.c; }
            if (d.h.fri) o.h.fri = true;
            const f = {}; Object.keys(FEATS).forEach((k) => { if (d.f[k]) f[k] = true; }); if (Object.keys(f).length) o.f = f;
            if (d.addr && d.addr.trim()) o.addr = d.addr.trim().slice(0, 150);
            if (!d.f.free && d.price && d.price.trim()) o.price = d.price.trim().slice(0, 40);
            if (ph) o.ph = ph;
            if (d.img) o.img = d.img.thumb;
            const upd = { ['spotsPending/' + id]: o };
            if (d.img) upd['spotsPendingImgs/' + id] = d.img.full;
            const btn = document.getElementById('spfSend');
            if (btn) btn.disabled = true;
            try {
                const { ref, update } = window.firebaseDbHelpers;
                await update(ref(window.firebaseDb), upd);
                s.draft = null;
                document.querySelector('.sp-form')?.remove();
                s.mode = 'list';
                this._spThanks();
            } catch (e) {
                console.warn('Place not sent:', e);
                this.showToast(String(e && e.message || e).includes('ermission') ? 'الإضافة بعدها ما مفعلة، بلّغ الإدارة' : 'ما انرسل، تأكد من النت');
                if (btn) btn.disabled = false;
            }
        },

        _spThanks() {
            const el = document.createElement('div');
            el.className = 'sp-govs in';
            el.innerHTML = `<div class="sp-govs-p sp-thx"><span><i data-lucide="party-popper"></i></span><b>وصل المكان، شكراً إلك</b><p>الإدارة راح تراجعه، ولمن ينقبل يطلع لكل طلاب المحافظة وتاخذ 50 نقطة.</p><button onclick="this.closest('.sp-govs').remove()">تمام</button></div>`;
            el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
            document.body.appendChild(el);
            lucide.createIcons();
        },
    });
})();
