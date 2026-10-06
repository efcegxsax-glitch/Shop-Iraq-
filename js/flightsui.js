// رحلة الطالب الجوية (the page): choose where from and where to, how long, and fly it. A flight HUD in a draggable bottom sheet
// (a side panel on a big screen), a camera that follows the plane or not, other students' flights, my flights, and a replay.
// The map, the plane and the clock are in js/flights.js (window.FlightCore) and the maths in js/flightmath.js.
// Loaded by app.goToFlights() after those two.
(function () {
    const FM = window.FlightMath, C = window.FlightCore;
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const $ = (id) => document.getElementById(id);
    const STAT = {
        prepare: ['تجهيز', 'st-prep'], boarding: ['صعود الركاب', 'st-board'], flying: ['بالجو', 'st-fly'], landing: ['هبوط', 'st-land'], done: ['وصلت', 'st-done'],
    };
    const STY = { modern: 'عصري', classic: 'كلاسيكي', minimal: 'بسيط' };
    // the student's choices while making a flight
    const W = { o: null, d: null, minutes: 90, touched: false, mode: 'solo', sty: 'modern' };
    const U = { view: 'home', h: 0, snap: 'mid', finished: false, card: null, tick: 0, built: false, searchT: {}, seq: {} };

    Object.assign(app, {
        // ---------- opening and leaving ----------
        async flOpen() {
            const root = $('flRoot');
            if (!root) return;
            if (!this.isLoggedIn || !this.authUid) {
                root.innerHTML = '<div class="fl-gate"><i data-lucide="plane"></i><b>سجّل دخولك حتى تبدأ رحلتك</b><button onclick="app.goToAuth(\'login\')">تسجيل الدخول</button></div>';
                lucide.createIcons(); return;
            }
            this._flBuild(root);
            if (U.ready) { C.run(); this._flFill(); return; }
            U.ready = false;
            $('flLoad').classList.remove('hidden');
            // the panel's settings (the Maps key is one of them) may still be on their way from the server: wait a moment for them
            for (let i = 0; i < 12 && !this._siteCfgLive && navigator.onLine !== false; i++) await new Promise((r) => setTimeout(r, 200));
            const saved = C.loadSaved(), cfg = (this.siteConfig && this.siteConfig.maps) || {};
            let start = { lat: 32.5, lng: 44.5, z: 5.6 };
            if (saved && saved.o) start = { lat: (saved.o[0] + saved.d[0]) / 2, lng: (saved.o[1] + saved.d[1]) / 2, z: 6 };
            try {
                C.onEvent = (n, d) => this._flEvent(n, d);
                C.onFrame = () => this.currentView === 'flightsView' && !document.hidden;
                await C.init({ host: $('flMap'), canvas: $('flCv'), key: cfg.key || '', start });
            } catch (e) {
                console.warn('flights map failed', e);
                $('flLoad').classList.add('hidden');
                $('flErr').classList.remove('hidden'); $('flErr').innerHTML = '<i data-lucide="wifi-off"></i><b>ما انحملت الخريطة</b><small>تأكد من النت وحاول مرة ثانية</small><button onclick="app.flRetry()">إعادة المحاولة</button>'; lucide.createIcons();
                return;
            }
            U.ready = true;
            $('flLoad').classList.add('hidden');
            if (C.gmError) { this.showToast('ما اشتغلت خرائط Google (المفتاح أو الصلاحيات)، استخدمنا الخريطة العادية'); C.gmError = ''; }
            C.setShowOthers(C.showOthers);
            this._flFill();
            await this._flResume(saved);
        },
        flRetry() { $('flErr').classList.add('hidden'); this.flLeave(true); this.flOpen(); },
        flLeave(hard) {
            clearInterval(U.tick); U.tick = 0;
            C.stop(); C.unsubAll();
            if (hard || !(C.hero)) { C.destroy(); U.ready = false; }
            else { C.destroy(); U.ready = false; }
            this._flightOn = !!C.hero && !U.finished;
        },
        flBack() { if (U.view === 'wizard' || U.view === 'history' || U.view === 'replay') { if (U.view === 'replay') this.flReplayClose(); else this._flHomeOrHud(); return; } this.goBack(); },

        // ---------- the page skeleton (built once) ----------
        _flBuild(root) {
            if (U.built && root.firstChild) return;
            U.built = true;
            root.innerHTML = `
                <div class="fl-map" id="flMap"></div>
                <canvas class="fl-cv" id="flCv" aria-hidden="true"></canvas>
                <div class="fl-top">
                    <button class="fl-ic" onclick="app.flBack()" aria-label="رجوع"><i data-lucide="chevron-right"></i></button>
                    <div class="fl-title"><b>رحلة الطالب الجوية</b><small id="flSub">اختار رحلتك وخلّ الوقت يمر وانت تدرس</small></div>
                    <button class="fl-ic" id="flBtnOthers" onclick="app.flToggleOthers()" aria-label="رحلات الطلاب"><i data-lucide="users"></i></button>
                    <button class="fl-ic" id="flBtnPerf" onclick="app.flTogglePerf()" aria-label="وضع الأداء"><i data-lucide="gauge"></i></button>
                </div>
                <div class="fl-chips hidden" id="flChips"></div>
                <div class="fl-net hidden" id="flNet"><i data-lucide="wifi-off"></i>جاري إعادة الاتصال...</div>
                <div class="fl-banner hidden" id="flBanner"></div>
                <div class="fl-cam hidden" id="flCam">
                    <button data-cam="follow" onclick="app.flCam('follow')" aria-label="تتبع الطائرة"><i data-lucide="navigation"></i></button>
                    <button data-cam="overview" onclick="app.flCam('overview')" aria-label="عرض الرحلة كاملة"><i data-lucide="maximize"></i></button>
                    <button data-cam="free" onclick="app.flCam('free')" aria-label="تحريك حر"><i data-lucide="hand"></i></button>
                    <button onclick="app.flCam('follow')" aria-label="ارجع للطائرة"><i data-lucide="crosshair"></i></button>
                </div>
                <div class="fl-card hidden" id="flCard"></div>
                <div class="fl-sheet" id="flSheet"><div class="fl-grab" id="flGrab" aria-label="اسحب لفتح اللوحة"><span></span></div><div class="fl-body" id="flBody"></div></div>
                <div class="fl-load" id="flLoad"><span></span><b>جاري تحضير الرحلة...</b></div>
                <div class="fl-err hidden" id="flErr"></div>`;
            this._flGrab();
            lucide.createIcons();
        },
        _flFill() {
            $('flBtnOthers').classList.toggle('on', C.showOthers);
            $('flBtnPerf').classList.toggle('on', C.perf);
            if (C.hero || C.replay) this._flHud(); else this._flHome();
            this._flPad();
        },
        _flEvent(n, d) {
            if (n === 'net') $('flNet')?.classList.toggle('hidden', !!d);
            else if (n === 'cam') this._flCamMark(d);
            else if (n === 'tap-flight') this._flShowFlight(d);
            else if (n === 'tap-hero') this._flHeroTap();
            else if (n === 'tap-empty') { this._flCardClose(); if (U.view === 'hud') this._flSnap('min'); }
            else if (n === 'perf') { $('flBtnPerf')?.classList.toggle('on', !!d.on); if (d.auto) this.showToast('تم تفعيل وضع الأداء لأن الجهاز بطيء شوية'); }
            else if (n === 'gm-auth') { this.showToast('مفتاح خرائط Google مو صالح لهذا الموقع. افتح لوحة التحكم وتأكد من صلاحياته'); }
        },

        // ---------- the bottom sheet ----------
        _flGrab() {
            const sh = $('flSheet'), g = $('flGrab'); let y0 = 0, h0 = 0, drag = false;
            g.addEventListener('pointerdown', (e) => { if (window.innerWidth >= 900) return; drag = true; y0 = e.clientY; h0 = sh.offsetHeight; sh.classList.add('drag'); g.setPointerCapture(e.pointerId); });
            g.addEventListener('pointermove', (e) => { if (!drag) return; const H = $('flRoot').clientHeight; sh.style.height = Math.max(96, Math.min(H * 0.9, h0 - (e.clientY - y0))) + 'px'; });
            const end = () => {
                if (!drag) return; drag = false; sh.classList.remove('drag');
                const H = $('flRoot').clientHeight, h = sh.offsetHeight, snaps = { min: 120, mid: H * 0.48, max: H * 0.88 };
                let best = 'mid', bd = 1e9; Object.keys(snaps).forEach((k) => { const d = Math.abs(snaps[k] - h); if (d < bd) { bd = d; best = k; } });
                this._flSnap(best);
            };
            g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
            g.addEventListener('click', () => { if (window.innerWidth < 900) this._flSnap(U.snap === 'min' ? 'mid' : U.snap === 'mid' ? 'max' : 'min'); });
        },
        _flSnap(k) {
            const sh = $('flSheet'), H = $('flRoot').clientHeight; U.snap = k;
            if (window.innerWidth >= 900) { sh.style.height = ''; this._flPad(); return; }
            const h = k === 'min' ? 124 : k === 'mid' ? Math.round(H * 0.46) : Math.round(H * 0.88);
            sh.style.height = h + 'px';
            this._flPad(h);                                  // the camera plans for where the sheet will be, not where it is now
        },
        // the part of the screen the sheet covers is not where the route should be drawn
        _flPad(h) {
            const sh = $('flSheet'); if (!sh) return;
            const wide = window.innerWidth >= 900, H = $('flRoot').clientHeight;
            C.pad = wide ? { t: 90, b: 60, l: 420, r: 40 } : { t: 96, b: Math.min(h || sh.offsetHeight, H * 0.6) + 24, l: 28, r: 28 };
        },
        _flSet(view, snap, html) {
            U.view = view; const b = $('flBody'); b.innerHTML = html; b.scrollTop = 0; lucide.createIcons(); this._flSnap(snap || 'mid');
        },

        // ---------- home: start, my flights, badges ----------
        _flHome() {
            clearInterval(U.tick); U.tick = 0; U.finished = false;
            C.clearLines(); C.setPins([]); $('flCam').classList.add('hidden'); this._flCardClose();
            const hist = C.history(), done = hist.filter((x) => x.st === 'done'), km = done.reduce((a, x) => a + (x.dist || 0), 0), mins = done.reduce((a, x) => a + (x.du || 0), 0) / 60000;
            const B = FM.badges(hist);
            this._flSet('home', 'mid', `
                <div class="fl-hero"><div class="fl-hero-ic"><i data-lucide="plane"></i></div><div><b>خلّي دراستك رحلة</b><p>اختار من وين لوين وكم ساعة، وشوف طيارتك تطير على الخريطة الحقيقية وانت تدرس.</p></div></div>
                <button class="fl-go" onclick="app.flNew()"><i data-lucide="plane-takeoff"></i>ابدأ رحلة جديدة</button>
                <div class="fl-row2">
                    <button onclick="app.flHistory()"><i data-lucide="history"></i>رحلاتي<small>${done.length}</small></button>
                    <button onclick="app.flToggleOthers()" class="${C.showOthers ? 'on' : ''}"><i data-lucide="users"></i>رحلات الطلاب<small>${C.showOthers ? 'شغّالة' : 'مطفية'}</small></button>
                </div>
                <div class="fl-stats"><div><b>${done.length}</b><span>رحلة</span></div><div><b>${Math.round(km)}</b><span>كم</span></div><div><b>${Math.round(mins)}</b><span>دقيقة</span></div></div>
                <div class="fl-sub">الأوسمة</div>
                <div class="fl-badges">${B.map((b) => `<div class="${b.ok ? 'ok' : ''}" title="${esc(b.d)}"><span><i data-lucide="${b.ok ? 'badge-check' : 'lock'}"></i></span><b>${esc(b.n)}</b><i class="bar"><u style="width:${Math.round(b.v * 100)}%"></u></i></div>`).join('')}</div>
                <p class="fl-note">طيرانك محاكاة بصرية لرحلتك على الخريطة، وما يعطيك بيانات طيران حقيقية.</p>`);
            $('flSub').textContent = 'اختار رحلتك وخلّ الوقت يمر وانت تدرس';
        },
        _flHomeOrHud() { if (C.hero && !U.finished) this._flHud(); else this._flHome(); },

        // ---------- the new flight ----------
        flNew() {
            if (C.hero && !U.finished) { this.showToast('عندك رحلة شغّالة هسه'); this._flHud(); return; }
            W.o = null; W.d = null; W.touched = false; W.minutes = 90; W.mode = 'solo'; W.sty = C.style();
            C.setPreview(null); C.setPins([]);
            const field = (k, label) => `
                <div class="flw-sec" id="flSec_${k}"><label>${label}</label>
                    <div class="flw-sel" id="flSel_${k}"><i data-lucide="${k === 'o' ? 'plane-takeoff' : 'plane-landing'}"></i><span>اختار المكان</span></div>
                    <div class="flw-in"><i data-lucide="search"></i><input id="flIn_${k}" type="search" autocomplete="off" placeholder="ابحث عن مدينة أو محافظة أو مكان" oninput="app.flSearch('${k}', this.value)" onfocus="app.flSearch('${k}', this.value)"></div>
                    <div class="flw-res" id="flRes_${k}"></div>
                    <div class="flw-btns"><button onclick="app.flUseMe('${k}')"><i data-lucide="locate-fixed"></i>موقعي الحالي</button><button onclick="app.flPickMap('${k}')"><i data-lucide="map-pin"></i>اختر من الخريطة</button></div>
                </div>`;
            this._flSet('wizard', 'max', `
                <div class="fl-h"><b>رحلة جديدة</b><button class="fl-x" onclick="app.flBack()" aria-label="سد"><i data-lucide="x"></i></button></div>
                ${field('o', 'من')}${field('d', 'إلى')}
                <div class="flw-sec"><label>مدة الرحلة</label>
                    <div class="flw-dur"><button onclick="app.flDur(-15)" aria-label="أقل"><i data-lucide="minus"></i></button><b id="flDurV" dir="ltr">01:30</b><button onclick="app.flDur(15)" aria-label="أكثر"><i data-lucide="plus"></i></button></div>
                    <div class="flw-q">${[[30, '30 د'], [60, 'ساعة'], [120, 'ساعتين'], [180, '3 ساعات'], [240, '4 ساعات']].map(([m, t]) => `<button onclick="app.flDurSet(${m})">${t}</button>`).join('')}</div>
                    <small id="flSum" class="flw-sum">اختار مكان المغادرة والوجهة حتى أحسب المسافة</small>
                </div>
                <div class="flw-sec"><label>نوع الرحلة</label>
                    <div class="flw-mode" id="flMode">
                        <button data-m="solo" onclick="app.flMode('solo')" class="on"><i data-lucide="user"></i><b>رحلة فردية</b><small>طيارتك بس، خريطة نظيفة</small></button>
                        <button data-m="shared" onclick="app.flMode('shared')"><i data-lucide="users"></i><b>اطير وياهم</b><small>تشوف طيارات طلاب العراق وتشوفك (بدون اسمك)</small></button>
                    </div>
                </div>
                <div class="flw-sec"><label>شكل الطائرة</label><div class="flw-sty" id="flSty">${Object.keys(STY).map((k) => `<button data-s="${k}" onclick="app.flSty('${k}')" class="${W.sty === k ? 'on' : ''}"><img alt="" data-sty="${k}"><span>${STY[k]}</span></button>`).join('')}</div></div>
                <button class="fl-go" id="flGo" onclick="app.flStart()"><i data-lucide="plane-takeoff"></i>ابدأ الرحلة</button>
                <p class="fl-note">المسافة بخط مستقيم على سطح الكرة الأرضية (مسار طيران)، وزمن الرحلة هو اللي تحدده انت.</p>`);
            this._flDurShow(); this._flStyThumbs(); this._flFieldsShow();
            $('flSub').textContent = 'رحلة جديدة';
        },
        _flStyThumbs() {
            const tryShow = () => { if (!C.sprites) return false; document.querySelectorAll('#flSty img').forEach((im) => { const sp = C.sprites[im.dataset.sty]; if (sp) im.src = sp[3].toDataURL('image/png'); }); return true; };
            if (!tryShow()) { let n = 0; const t = setInterval(() => { if (tryShow() || ++n > 20) clearInterval(t); }, 300); }
        },
        flSearch(k, q) {
            clearTimeout(U.searchT[k]);
            const box = $('flRes_' + k); if (!box) return;
            const render = (list, note) => {
                box.innerHTML = (list.length ? list.map((r, i) => `<button onclick="app.flPick('${k}', ${i})"><i data-lucide="${r.preset ? 'building-2' : 'map-pin'}"></i><span><b>${esc(r.name)}</b>${r.sub ? '<small>' + esc(r.sub) + '</small>' : ''}</span></button>`).join('') : '') + (note ? `<p>${esc(note)}</p>` : '');
                U[k + 'Res'] = list; lucide.createIcons();
            };
            const pre = C.searchPresets(q);
            render(pre.slice(0, q ? 5 : 8));
            if (String(q).trim().length < 2) return;
            const my = (U.seq[k] = (U.seq[k] || 0) + 1);
            U.searchT[k] = setTimeout(async () => {
                try {
                    const on = await C.searchOnline(q);
                    if (on === null || my !== U.seq[k]) return;
                    const seen = new Set(pre.map((p) => p.name));
                    render(pre.slice(0, 4).concat(on.filter((r) => !seen.has(r.name))).slice(0, 8));
                } catch (e) { render(pre.slice(0, 5), 'البحث ما اشتغل هسه. اختار من القائمة أو من الخريطة.'); }
            }, 320);
        },
        async flPick(k, i) {
            const r = (U[k + 'Res'] || [])[i]; if (!r) return;
            try { if (r.resolve) { const p = await r.resolve(); r.lat = p.lat; r.lng = p.lng; } } catch (e) { this.showToast('ما كدرت أحدد هذا المكان، جرب مكان ثاني'); return; }
            W[k] = { lat: r.lat, lng: r.lng, name: String(r.name).slice(0, 40) };
            const inp = $('flIn_' + k); if (inp) inp.value = ''; $('flRes_' + k).innerHTML = '';
            this._flFieldsShow(true);
        },
        flUseMe(k) {
            this.showToast('دا أحدد موقعك...');
            C.locate().then(([la, lo]) => { W[k] = { lat: la, lng: lo, name: C.labelFor(la, lo, true).slice(0, 40), my: true }; this._flFieldsShow(true); })
                .catch((e) => this.showToast(e && e.code === 1 ? 'ما انعطت صلاحية الموقع. تكدر تبحث عن مكانك أو تختاره من الخريطة' : 'ما كدرت أحدد موقعك هسه، اختار من القائمة'));
        },
        flPickMap(k) {
            const bn = $('flBanner'); this._flSnap('min');
            bn.classList.remove('hidden'); bn.innerHTML = `<i data-lucide="map-pin"></i><span>اضغط على الخريطة لتحديد ${k === 'o' ? 'مكان المغادرة' : 'الوجهة'}</span><button onclick="app.flPickCancel()">إلغاء</button>`; lucide.createIcons();
            C.setCam('free');
            C.pick = (la, lo) => { bn.classList.add('hidden'); W[k] = { lat: la, lng: lo, name: C.labelFor(la, lo).slice(0, 40) }; this._flSnap('max'); this._flFieldsShow(true); };
        },
        flPickCancel() { C.pick = null; $('flBanner').classList.add('hidden'); this._flSnap('max'); },
        _flFieldsShow(fit) {
            ['o', 'd'].forEach((k) => { const s = $('flSel_' + k); if (!s) return; s.classList.toggle('set', !!W[k]); s.querySelector('span').textContent = W[k] ? W[k].name : 'اختار المكان'; });
            const pins = []; if (W.o) pins.push({ lat: W.o.lat, lng: W.o.lng, label: W.o.name, color: '#0ea5e9' }); if (W.d) pins.push({ lat: W.d.lat, lng: W.d.lng, label: W.d.name, color: '#22c55e' });
            C.setPins(pins);
            if (W.o && W.d) {
                const o = [W.o.lat, W.o.lng], d = [W.d.lat, W.d.lng], km = FM.haversine(o, d);
                C.setPreview(o, d);
                if (fit && C.adapter) { C.cam = 'free'; const g = FM.fitView([o, d], C.w, C.h, C.pad, 12); C.adapter.setView(g.lat, g.lng, g.z); }
                const sug = FM.suggestMinutes(km);
                if (!W.touched) W.minutes = sug;
                $('flSum').innerHTML = `المسافة <b>${FM.fmtKm(km)}</b> · وقت طيران تقريبي <b>${FM.fmtDur(sug * 60000)}</b>${C.adapter && C.adapter.kind === 'google' ? ' · <a href="#" onclick="app.flRoadTime(event)">وقت السيارة (Google)</a>' : ''}`;
                this._flDurShow();
            } else if (fit && C.adapter && (W.o || W.d)) { const p = W.o || W.d; C.cam = 'free'; C.adapter.setView(p.lat, p.lng, Math.max(C.view().z, 7)); }
        },
        // the road time Google gives, only as a hint for the duration (asked only when the student taps it)
        async flRoadTime(e) {
            if (e) e.preventDefault();
            try {
                const { Route } = await window.google.maps.importLibrary('routes');
                const r = await Route.computeRoutes({ origin: { lat: W.o.lat, lng: W.o.lng }, destination: { lat: W.d.lat, lng: W.d.lng }, travelMode: 'DRIVING', fields: ['durationMillis', 'distanceMeters'] });
                const rt = r.routes && r.routes[0]; if (!rt) throw new Error('none');
                this.showToast('بالسيارة: ' + FM.fmtDur(rt.durationMillis) + ' (' + Math.round(rt.distanceMeters / 1000) + ' كم)');
            } catch (er) { this.showToast('ما كدرت أجيب وقت الطريق من Google (تأكد من تفعيل Routes API)'); }
        },
        flDur(d) { W.touched = true; W.minutes = Math.max(5, Math.min(720, W.minutes + d)); this._flDurShow(); },
        flDurSet(m) { W.touched = true; W.minutes = m; this._flDurShow(); },
        _flDurShow() { const el = $('flDurV'); if (el) el.textContent = String(Math.floor(W.minutes / 60)).padStart(2, '0') + ':' + String(W.minutes % 60).padStart(2, '0'); },
        flMode(m) { W.mode = m; document.querySelectorAll('#flMode button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); },
        flSty(s) { W.sty = s; C.setStyle(s); document.querySelectorAll('#flSty button').forEach((b) => b.classList.toggle('on', b.dataset.s === s)); },

        // ---------- take off ----------
        async flStart() {
            if (!W.o || !W.d) { this.showToast('اختار مكان المغادرة والوجهة'); return; }
            const o = [FM.coarse(W.o.lat, W.o.my), FM.coarse(W.o.lng, W.o.my)], d = [FM.coarse(W.d.lat, W.d.my), FM.coarse(W.d.lng, W.d.my)];
            if (FM.haversine(o, d) < 3) { this.showToast('المكانين قريبين جداً، اختار وجهة أبعد'); return; }
            if (W.minutes < 5) { this.showToast('أقل مدة 5 دقايق'); return; }
            const btn = $('flGo'); if (btn) btn.disabled = true;
            const f = { fid: C.newId(), s: C.now(), du: W.minutes * 60000, o, d, on: W.o.name, dn: W.d.name, sty: W.sty, sh: W.mode === 'shared' };
            try { await C.createFlight(f); }
            catch (e) {
                const denied = e && (e.code === 'PERMISSION_DENIED' || /permission/i.test(String(e.message)));
                f.sh = false; f.s = C.now();
                this.showToast(denied ? 'الرحلات المشتركة تحتاج تحديث قواعد قاعدة البيانات من الإدارة، بدأت رحلتك كفردية' : 'ما اتصلنا بالسيرفر، بدأت رحلتك كفردية وتنحفظ بالهاتف');
            }
            C.saveActive(f); C.hero = f; U.finished = false; this._flightOn = true;
            C.setPreview(null); C.setPins([]); C.clearLines();
            C.setShowOthers(f.sh); $('flBtnOthers').classList.toggle('on', C.showOthers);
            this._flHud(); C.intro();
        },
        async _flResume(saved) {
            let f = saved;
            if (!f && window.firebaseDb) {
                try {
                    const { ref, get } = window.firebaseDbHelpers, s = await get(ref(window.firebaseDb, 'flightActive/' + this.authUid)), v = s.val();
                    if (v && v.s + v.du > C.now() - 3600000) f = { fid: v.f, s: v.s, du: v.du, o: [v.oa, v.oo], d: [v.da, v.do], on: v.on, dn: v.dn, sty: v.sty, sh: !!v.sh };
                } catch (e) {}
            }
            if (!f || !f.o) { this._flHome(); return; }
            C.hero = f; this._flightOn = true; U.finished = false;
            C.setShowOthers(!!f.sh); $('flBtnOthers').classList.toggle('on', C.showOthers);
            this._flHud();
            const hs = C.heroState();
            if (hs.status === 'done') { await this._flFinish(true); return; }
            C.cam = 'follow'; C.emit('cam', 'follow'); const sc = C.shiftCenter(hs.pos, 7.5); C.adapter.setView(sc.lat, sc.lng, 7.5);
        },

        // ---------- the flight HUD ----------
        _flHud() {
            const f = C.heroFlight(), rep = !!C.replay;
            if (!f) { this._flHome(); return; }
            U.view = rep ? 'replay' : 'hud'; $('flCam').classList.remove('hidden'); this._flCamMark(C.cam);
            this._flSet(rep ? 'replay' : 'hud', 'mid', `
                <div class="hud-top"><span class="hud-no"><i data-lucide="plane"></i>${esc(FM.flightNo(f.fid))}</span><span class="hud-chip" id="hStat">تجهيز</span></div>
                <div class="hud-route"><b>${esc(f.on)}</b><i data-lucide="arrow-left"></i><b>${esc(f.dn)}</b></div>
                <div class="hud-time" id="hLeft" dir="ltr">--:--:--</div>
                <div class="hud-cap">الوقت المتبقي</div>
                <div class="hud-bar"><i id="hBar"></i><span id="hPct">0%</span></div>
                <div class="hud-grid">
                    <div><small>مرّ</small><b id="hEl" dir="ltr">00:00:00</b></div>
                    <div><small>المسافة المتبقية</small><b id="hDist">-</b></div>
                    <div><small>وقت الوصول</small><b id="hEta" dir="ltr">--:--</b></div>
                    <div><small>الطقس</small><b id="hWx">-</b></div>
                </div>
                <div class="hud-sim"><div><small>الارتفاع</small><b id="hAlt">0 م</b></div><div><small>السرعة</small><b id="hSpd">0 كم/س</b></div><div><small>الاتجاه</small><b id="hHead">0°</b></div><em>محاكاة بصرية، مو بيانات طيران حقيقية</em></div>
                ${rep ? `<div class="hud-rep"><button onclick="app.flReplayPlay()" id="hRepPlay"><i data-lucide="pause"></i></button><button onclick="app.flReplaySpeed(1)" data-sp="1" class="on">1x</button><button onclick="app.flReplaySpeed(2)" data-sp="2">2x</button><button onclick="app.flReplaySpeed(4)" data-sp="4">4x</button><button onclick="app.flReplaySpeed(8)" data-sp="8">8x</button><button onclick="app.flReplayRestart()" aria-label="من البداية"><i data-lucide="rotate-ccw"></i></button></div><button class="fl-sec-btn" onclick="app.flReplayClose()">إغلاق الإعادة</button>`
                    : `<div class="hud-acts"><button onclick="app.flCancel()" class="danger"><i data-lucide="octagon-x"></i>إنهاء الرحلة</button>${f.sh ? '<span class="hud-pub"><i data-lucide="users"></i>رحلة مشتركة (باسم مجهول #' + FM.anonNo(f.fid) + ')</span>' : '<span class="hud-pub"><i data-lucide="lock"></i>رحلة فردية</span>'}</div>`}`);
            $('flSub').textContent = rep ? 'إعادة الرحلة' : 'رحلتك شغّالة';
            clearInterval(U.tick); U.tick = setInterval(() => this._flTick(), 250); this._flTick();
        },
        _flTick() {
            if (this.currentView !== 'flightsView') return;
            const f = C.heroFlight(), hs = C.heroState(); if (!f || !hs) return;
            const st = STAT[hs.status] || STAT.flying, chip = $('hStat'); if (!chip) return;
            if (chip.textContent !== st[0]) { chip.textContent = st[0]; chip.className = 'hud-chip ' + st[1]; }
            const sim = FM.sim(hs), total = f.du;
            $('hLeft').textContent = FM.fmtHMS(hs.left); $('hEl').textContent = FM.fmtHMS(hs.el);
            const pct = Math.min(100, Math.floor(hs.x * 100));
            $('hBar').style.width = (hs.x * 100).toFixed(2) + '%'; $('hPct').textContent = pct + '%';
            $('hDist').textContent = FM.fmtKm(hs.distLeft); $('hEta').textContent = FM.fmtClock(hs.end);
            $('hAlt').textContent = sim.alt.toLocaleString('en-US') + ' م'; $('hSpd').textContent = sim.spd + ' كم/س'; $('hHead').textContent = Math.round(hs.head) + '°';
            if (C.replay) { const r = C.replay; $('hLeft').textContent = FM.fmtHMS(Math.max(0, total - r.base)); $('hEl').textContent = FM.fmtHMS(r.base); }
            const wx = C.weather; if (wx) $('hWx').textContent = wx.text + ' ' + wx.t + '°';
            if (!C.replay && (Date.now() - C.weatherAt > 8 * 60000)) C.loadWeather(hs.pos).then(() => {});
            if (this._flCardId) this._flCardRefresh();
            if (!C.replay && !U.finished && hs.status === 'done') this._flFinish(false);
            if (C.replay && C.replay.base >= total + 1500 && !C.replay.paused) { C.replay.paused = true; const b = $('hRepPlay'); if (b) b.innerHTML = '<i data-lucide="play"></i>'; lucide.createIcons(); }
        },
        _flCamMark(m) { document.querySelectorAll('#flCam [data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === m || (m === 'intro' && b.dataset.cam === 'follow'))); },
        flCam(m) { C.setCam(m); if (m === 'follow' && C.heroState() && C.adapter) { const hs = C.heroState(), z = Math.max(C.view().z, 6), sc = C.shiftCenter(hs.pos, z); C.adapter.setView(sc.lat, sc.lng, z); } },
        _flHeroTap() { this._flSnap(U.snap === 'min' ? 'mid' : 'min'); },
        flCancel() {
            if (!confirm('تنهي الرحلة هسه؟ ما تنحسب بين رحلاتك المكتملة.')) return;
            const f = C.hero; if (!f) return;
            C.endFlight(f, 'cancel'); C.hero = null; this._flightOn = false; U.finished = false;
            C.clearLines(); this.showToast('انتهت الرحلة'); this._flHome();
        },
        async _flFinish(silent) {
            const f = C.hero; if (!f || U.finished || f._done) return; U.finished = true; f._done = true; this._flightOn = false;
            const before = FM.badges(C.history()).filter((b) => b.ok).map((b) => b.id);
            const rec = await C.endFlight(f, 'done');
            const mins = Math.round(f.du / 60000);
            try { this.logDailyActivity({ studySessions: 1, minutes: mins }); } catch (e) {}
            const after = FM.badges(C.history()).filter((b) => b.ok), gained = after.filter((b) => before.indexOf(b.id) < 0);
            clearInterval(U.tick); U.tick = 0;
            $('flCam').classList.remove('hidden');
            this._flSet('done', 'mid', `
                <div class="fl-done"><div class="ring"><i data-lucide="check"></i></div><b>وصلت بالسلامة</b><p>${esc(f.on)} ← ${esc(f.dn)}</p>
                    <div class="fl-stats"><div><b>${FM.fmtDur(f.du)}</b><span>مدة الرحلة</span></div><div><b>${rec.dist}</b><span>كم</span></div><div><b>${esc(FM.flightNo(f.fid))}</b><span>رقم الرحلة</span></div></div>
                    ${gained.length ? '<div class="fl-new">' + gained.map((b) => `<span><i data-lucide="badge-check"></i>وسام جديد: ${esc(b.n)}</span>`).join('') + '</div>' : ''}
                    <button class="fl-go" onclick="app.flNew()"><i data-lucide="plane-takeoff"></i>رحلة جديدة</button>
                    <div class="fl-row2"><button onclick="app.flReplayId('${esc(f.fid)}')"><i data-lucide="rotate-ccw"></i>أعد الرحلة</button><button onclick="app.flHistory()"><i data-lucide="history"></i>رحلاتي</button></div>
                </div>`);
            if (!silent) this.showToast('انحفظت رحلتك');
            $('flSub').textContent = 'وصلت';
        },

        // ---------- my flights, replay ----------
        async flHistory() {
            clearInterval(U.tick); U.tick = 0;
            this._flSet('history', 'max', '<div class="fl-h"><b>رحلاتي</b><button class="fl-x" onclick="app.flBack()" aria-label="سد"><i data-lucide="x"></i></button></div><div class="fl-load2"><span></span></div>');
            const list = await C.loadHistory();
            this._flSet('history', 'max', `
                <div class="fl-h"><b>رحلاتي</b><button class="fl-x" onclick="app.flBack()" aria-label="سد"><i data-lucide="x"></i></button></div>
                ${list.length ? list.map((x) => `
                    <article class="fl-his ${x.st === 'done' ? '' : 'cx'}">
                        <div class="r"><b>${esc(x.on)}</b><i data-lucide="arrow-left"></i><b>${esc(x.dn)}</b></div>
                        <div class="m"><span class="${x.st === 'done' ? 'okc' : 'cxc'}">${x.st === 'done' ? 'وصلت' : 'انتهت قبل الوصول'}</span><span>${FM.fmtDur(x.du)}</span><span>${x.dist} كم</span><span>${new Date(x.s).toLocaleDateString('ar-IQ')}</span></div>
                        <div class="a">${x.st === 'done' ? `<button onclick="app.flReplayId('${esc(x.id)}')"><i data-lucide="rotate-ccw"></i>إعادة</button>` : ''}<button class="dl" onclick="app.flHisDel('${esc(x.id)}')" aria-label="حذف"><i data-lucide="trash-2"></i></button></div>
                    </article>`).join('') : '<div class="fl-empty"><i data-lucide="plane"></i><b>ما عندك رحلات بعد</b><small>أول رحلة تكملها تطلع هنا</small></div>'}`);
            $('flSub').textContent = 'رحلاتي';
        },
        flHisDel(id) { if (!confirm('تحذف هاي الرحلة من سجلك؟')) return; C.deleteHistory(id).then(() => this.flHistory()); },
        flReplayId(id) {
            const x = C.history().find((h) => h.id === id); if (!x) { this.showToast('الرحلة مو موجودة'); return; }
            const rec = { fid: x.id, s: x.s, du: x.du, o: [x.oa, x.oo], d: [x.da, x.do], on: x.on, dn: x.dn, sty: x.sty || 'modern', sh: false };
            C.stashHero = C.hero; C.hero = null; C.clearLines(); C.setShowOthers(false);
            C.replay = { rec, speed: 1, base: 0, paused: false }; this._flHud(); C._lineP = null; C.intro();
        },
        flReplayPlay() { const r = C.replay; if (!r) return; if (r.base >= r.rec.du) r.base = 0; r.paused = !r.paused; $('hRepPlay').innerHTML = '<i data-lucide="' + (r.paused ? 'play' : 'pause') + '"></i>'; lucide.createIcons(); },
        flReplaySpeed(s) { if (C.replay) C.replay.speed = s; document.querySelectorAll('.hud-rep [data-sp]').forEach((b) => b.classList.toggle('on', Number(b.dataset.sp) === s)); },
        flReplayRestart() { const r = C.replay; if (!r) return; r.base = 0; r.paused = false; C._lineP = null; $('hRepPlay').innerHTML = '<i data-lucide="pause"></i>'; lucide.createIcons(); C.intro(); },
        flReplayClose() { C.replay = null; C.clearLines(); C._lineP = null; const h = C.stashHero || null; C.stashHero = null; C.hero = h && !h._done ? h : null; U.finished = !C.hero; if (C.hero) { C.setShowOthers(!!C.hero.sh); this._flHud(); C.setCam('follow'); } else { C.setCam('free'); this.flHistory(); } },

        // ---------- the others ----------
        flToggleOthers() {
            C.setShowOthers(!C.showOthers);
            $('flBtnOthers').classList.toggle('on', C.showOthers);
            $('flChips').classList.toggle('hidden', !C.showOthers);
            if (C.showOthers) this._flChips();
            this.showToast(C.showOthers ? 'ظهرت رحلات طلاب العراق (بدون أسماء)' : 'انطفت رحلات الطلاب');
            if (U.view === 'home') this._flHome();
        },
        _flChips() {
            const L = [['all', 'الكل'], ['iraq', 'طلاب العراق'], ['mine', 'رحلتي'], ['near', 'القريبة'], ['active', 'الشغّالة'], ['done', 'المكتملة']];
            $('flChips').innerHTML = L.map(([k, t]) => `<button data-f="${k}" class="${C.filter === k ? 'on' : ''}" onclick="app.flFilter('${k}')">${t}</button>`).join('');
        },
        flFilter(k) {
            C.filter = k; this._flChips();
            if (k === 'near' && !C.me) C.locate().catch(() => this.showToast('ما انعطت صلاحية الموقع، رح أستخدم مركز الخريطة'));
        },
        _flShowFlight(id) { this._flCardId = id; this._flCardRefresh(true); },
        _flCardRefresh(open) {
            const o = C.others.get(this._flCardId), box = $('flCard'); if (!o) { this._flCardClose(); return; }
            const st = FM.stateAt(o.f, C.now()), s = STAT[st.status] || STAT.flying;
            if (open || box.classList.contains('hidden')) box.classList.remove('hidden');
            box.innerHTML = `<div class="c-h"><b><i data-lucide="plane"></i>رحلة طالب #${o.f.n || FM.anonNo(o.id)}</b><button onclick="app.flCardClose()" aria-label="سد"><i data-lucide="x"></i></button></div>
                <div class="c-r"><span>${esc(o.f.on)}</span><i data-lucide="arrow-left"></i><span>${esc(o.f.dn)}</span></div>
                <div class="c-g"><div><small>التقدم</small><b>${Math.floor(st.x * 100)}%</b></div><div><small>المتبقي</small><b>${st.status === 'done' ? '-' : FM.fmtDur(st.left)}</b></div><div><small>الحالة</small><b class="${s[1]}">${s[0]}</b></div></div>
                <small class="c-n">${esc(FM.flightNo(o.id))} · موقع تقريبي، بدون أي معلومة شخصية</small>`;
            lucide.createIcons();
        },
        flCardClose() { this._flCardClose(); },
        _flCardClose() { this._flCardId = null; const b = $('flCard'); if (b) b.classList.add('hidden'); },
        flTogglePerf() { C.setPerf(!C.perf); this.showToast(C.perf ? 'وضع الأداء شغّال: جودة أقل وسلاسة أكثر' : 'وضع الأداء مطفي'); },
    });

    // a tiny reminder on the other pages while a flight is running (see app.js: _flChip)
})();
