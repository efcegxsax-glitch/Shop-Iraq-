// "My tree" (شجرتي): the page and the session. A solo focus timer: the student plants a
// seed, and while they stay on this page the 3D tree (js/garden.js) grows with the session,
// from seed to fruit. Leaving the app for more than a few seconds, leaving the page, closing
// the app or missing a "still studying?" check kills the tree and its points.
// Points: one a minute (plus golden-hour minutes), paid at the end. Loaded by app._need('gardenui').
(function () {
    const KEY = 'isp_garden_session', DURS = [15, 25, 45, 60, 90], GRACE = 3000, CHECK = 60;
    const WORDS = ['شجرة', 'نخلة', 'غيمة', 'نجمة', 'وردة', 'قمر', 'نهر', 'جبل', 'بذرة', 'ثمرة'];
    const SP = [['pom', 'رمان', '#B91C1C'], ['orange', 'برتقال', '#EA7A0C'], ['apple', 'تفاح', '#DC2626']];
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

    Object.assign(app, {
        gdMinutes: 25,
        gdSpecies: 'pom',

        async gdOpen() {
            const root = document.getElementById('gdRoot');
            if (!root) return;
            if (!this._gd3) {
                root.classList.add('loading');
                try {
                    const mod = await import(new URL('js/garden.js?v=' + (window.APP_VER || '1'), document.baseURI).href);
                    if (this.currentView !== 'gardenView') return;
                    this._gdMod = mod;
                    this._gd3 = new mod.Garden(root);
                } catch (e) {
                    console.warn('garden 3D failed', e);
                    root.classList.remove('loading');
                    this.showToast('ما انحمل المشهد، تأكد من النت وحاول مرة ثانية');
                    return;
                } finally { root.classList.remove('loading'); }
            }
            this._gd3.start(() => this.currentView === 'gardenView' && !document.hidden);
            this._gd3.setDaytime(new Date());
            clearInterval(this._gdSky);
            this._gdSky = setInterval(() => this._gd3 && this._gd3.setDaytime(new Date()), 60000);
            if (!this._garden) {
                if (!this._gdResult) this._gd3.reset(this.gdSpecies, 1 + Math.floor(Math.random() * 1e6));
                this._gdRenderSetup();
            }
        },

        _gdStats() {
            const u = this.currentUser || {};
            return { trees: numOr0(u.gardenTrees), dead: numOr0(u.gardenDead), mins: numOr0(u.gardenMinutes), pom: numOr0(u.garden_pom), orange: numOr0(u.garden_orange), apple: numOr0(u.garden_apple) };
        },

        _gdRenderSetup() {
            const box = document.getElementById('gdSheet');
            if (!box) return;
            if (this._gdResult) { this._gdRenderResult(); return; }
            const st = this._gdStats(), m = this.gdMinutes;
            this._gdStage('');
            box.className = 'gd-sheet';
            box.innerHTML = `
                <div class="gd-h"><b>ازرع بذرة وادرس</b><small>تكبر شجرتك ويا وقت دراستك وتطلع ثمارها بالنهاية</small></div>
                <div class="gd-sp">${SP.map(([k, n, c]) => `<button class="${this.gdSpecies === k ? 'on' : ''}" style="--c:${c}" onclick="app.gdPickSpecies('${k}')"><span class="dot"></span>${n}${st[k] ? `<em>${st[k]}</em>` : ''}</button>`).join('')}</div>
                <div class="gd-durs">${DURS.map((d) => `<button class="${m === d ? 'on' : ''}" onclick="app.gdPickMinutes(${d})"><b>${d}</b><small>دقيقة</small></button>`).join('')}</div>
                <button class="gd-go" onclick="app.gdStart()"><i data-lucide="sprout"></i>ازرع البذرة<em>+${m} نقطة</em></button>
                <div class="gd-rules"><i data-lucide="shield-alert"></i>لا تطلع من التطبيق ولا من هاي الصفحة لحد ما تخلص، الطلعة تذبّل شجرتك</div>
                ${st.trees || st.dead ? `<div class="gd-mine"><span><b>${st.trees}</b>شجرة أثمرت</span><span><b>${Math.round(st.mins / 6) / 10}</b>ساعة دراسة</span><span><b>${st.dead}</b>ذبلت</span></div>` : ''}`;
            lucide.createIcons();
            this._gdInset();
        },

        gdPickSpecies(k) {
            if (this._garden) return;
            this.gdSpecies = k;
            if (this._gd3) this._gd3.reset(k, 1 + Math.floor(Math.random() * 1e6));
            this._gdRenderSetup();
        },
        gdPickMinutes(d) { if (this._garden) return; this.gdMinutes = d; this._gdRenderSetup(); },

        _gdInset() {
            const box = document.getElementById('gdSheet');
            if (this._gd3 && box) requestAnimationFrame(() => { const r = box.getBoundingClientRect(); this._gd3.setInset(r.height ? window.innerHeight - r.top : 0); });
        },
        _gdStage(t) { const el = document.getElementById('gdStage'); if (el) { el.textContent = t; el.classList.toggle('hidden', !t); } },

        async gdStart() {
            if (this._garden || this._gdStarting) return;
            if (!this.isLoggedIn || !this.currentUser) { this.goToAuth('login'); return; }
            if (this._focus || this._gwar || this._forest) { this.showToast('عندك جلسة شغالة، كمّلها أول'); return; }
            if (!this._gd3) { this.showToast('دا يتحمل المشهد، ثواني'); return; }
            this._gdStarting = true;
            const free = await this._sessionFree();
            this._gdStarting = false;
            if (!free || this._garden) return;
            const minutes = this.gdMinutes, now = this.trueNow(), seed = 1 + Math.floor(Math.random() * 1e6);
            this._garden = { start: now, mono: performance.now(), dur: minutes * 60000, minutes, sp: this.gdSpecies, seed, next: now + this._gdGap(true), check: null };
            try { localStorage.setItem(KEY, JSON.stringify({ start: now, dur: minutes * 60000 })); } catch (e) {}
            this._gdResult = null;
            this._gdBind();
            this._requestWakeLock();
            // the same lock as the other study sessions: one at a time on this account
            if (window.firebaseDb && this.authUid) {
                const { ref, set, onDisconnect } = window.firebaseDbHelpers, r = ref(window.firebaseDb, 'focusLive/' + this.authUid);
                set(r, { gov: this._myGov() || '', until: now + minutes * 60000 + 60000, dev: this._deviceId() }).catch(() => {});
                try { onDisconnect(r).remove(); } catch (e) {}
            }
            document.body.classList.add('garden-running');
            this._gd3.reset(this.gdSpecies, seed);
            this._gd3.plant();
            this._gdRenderRunning();
            clearInterval(this._gdTimer);
            this._gdTimer = setInterval(() => this._gdTick(), 500);
            this._gdTick();
        },

        // minutes until the next "still studying?" check (the first one sooner)
        _gdGap(first) { return (first ? 5 + Math.random() * 4 : 7 + Math.random() * 6) * 60000; },

        _gdRenderRunning() {
            const box = document.getElementById('gdSheet'), f = this._garden;
            if (!box || !f) return;
            const C = 2 * Math.PI * 44;
            box.className = 'gd-sheet run';
            box.innerHTML = `
                <div class="gd-run">
                    <div class="gd-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="bg"/><circle cx="50" cy="50" r="44" class="fg" id="gdArc" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/></svg><b id="gdClock" dir="ltr">--:--</b></div>
                    <div class="gd-run-tx"><b>شجرة ${esc(SP.find((x) => x[0] === f.sp)[1])} تكبر</b><small>بالنهاية تثمر وتكسب <em>+${f.minutes} نقطة</em></small><div class="gd-warn"><i data-lucide="shield-alert"></i>الطلعة من الصفحة تذبّلها</div></div>
                </div>
                <button class="gd-quit" onclick="app.gdQuit()">انسحاب</button>`;
            lucide.createIcons();
            this._gdInset();
        },

        _gdTick() {
            const f = this._garden;
            if (!f || f.hiddenAt) return;
            const now = this.trueNow();
            if (f.check && now > f.check.until) { this.gdFail('ما رديت على سؤال "لسه تدرس؟"'); return; }
            // the device clock moved (forward to finish early, or back): the wall-clock time since
            // the start no longer matches the page's own steady timer
            const wall = now - f.start, steady = performance.now() - f.mono;
            if (Math.abs(wall - steady) > 20000) { this.gdFail('تغيّر وقت الجهاز أثناء الجلسة'); return; }
            const left = f.dur - Math.min(wall, steady + 2000);
            if (left <= 0) { this.gdComplete(); return; }
            if (!f.check && now >= f.next && left > 60000) this._gdAsk();
            const p = 1 - left / f.dur;
            if (this._gd3) { this._gd3.grow(p); this._gdStage(this._gd3.stageName()); }
            const clock = document.getElementById('gdClock');
            if (clock) clock.textContent = fmt(left);
            const arc = document.getElementById('gdArc');
            if (arc) arc.setAttribute('stroke-dashoffset', (2 * Math.PI * 44 * (1 - p)).toFixed(1));
            if (f.check) { const el = document.getElementById('gdCkSec'); if (el) el.textContent = Math.max(0, Math.ceil((f.check.until - now) / 1000)); }
        },

        // "still studying?": three words, one right, placed differently each time
        _gdAsk() {
            const f = this._garden;
            if (!f) return;
            const words = WORDS.slice().sort(() => Math.random() - 0.5).slice(0, 3), right = words[Math.floor(Math.random() * 3)];
            f.check = { until: this.trueNow() + CHECK * 1000, right };
            const box = document.getElementById('gdCheck');
            if (box) {
                box.innerHTML = `<div class="gd-ck"><b id="gdCkSec">${CHECK}</b><strong>لسه تدرس؟</strong><p>اضغط على كلمة <em>${esc(right)}</em> حتى تبقى شجرتك عايشة</p>
                    <div class="gd-ck-b" style="flex-direction:${Math.random() < 0.5 ? 'row' : 'row-reverse'}">${words.map((w, i) => `<button style="margin-top:${[0, 16, 6][i]}px" onclick="app.gdAnswer(this, ${jsArg(w)})">${esc(w)}</button>`).join('')}</div></div>`;
                box.classList.remove('hidden');
            }
            this.playNotifySound();
            try { navigator.vibrate && navigator.vibrate([220, 120, 220]); } catch (e) {}
        },
        gdAnswer(btn, w) {
            const f = this._garden;
            if (!f || !f.check) return;
            if (w !== f.check.right) { btn.classList.remove('no'); void btn.offsetWidth; btn.classList.add('no'); return; }
            f.check = null;
            f.next = this.trueNow() + this._gdGap(false);
            document.getElementById('gdCheck')?.classList.add('hidden');
            this.showToast('تمام، كمّل دراستك');
        },

        async gdQuit() {
            if (!this._garden) return;
            if (!(await this.ask({ icon: 'leaf', title: 'تنسحب؟', text: 'إذا انسحبت هسه تذبل شجرتك وتروح نقاط الجلسة.', ok: 'انسحب', cancel: 'أكمل الدراسة' }))) return;
            this.gdFail('انسحبت قبل ما يخلص الوقت');
        },
        async gdBack() {
            if (this._garden) {
                if (!(await this.ask({ icon: 'leaf', title: 'تطلع من الصفحة؟', text: 'إذا طلعت هسه تذبل شجرتك وتروح نقاط الجلسة.', ok: 'اطلع', cancel: 'أكمل الدراسة' }))) return;
                this.gdFail('طلعت من صفحة شجرتي', true);
            }
            this._gdResult = null;
            this.goBack();
        },

        _gdBind() {
            if (this._gdBound) return;
            this._gdBound = true;
            document.addEventListener('visibilitychange', () => {
                const f = this._garden;
                if (!f) return;
                if (document.hidden) { f.hiddenAt = performance.now(); f.hiddenWall = Date.now(); return; }
                if (!f.hiddenAt) return;
                const away = Math.max(performance.now() - f.hiddenAt, Date.now() - (f.hiddenWall || 0));
                delete f.hiddenAt;
                if (away > GRACE) this.gdFail('طلعت من التطبيق أثناء الجلسة', true);
                else { this._requestWakeLock(); this._gdTick(); }
            });
        },

        _gdStop() {
            clearInterval(this._gdTimer);
            this._gdTimer = null;
            try { localStorage.removeItem(KEY); } catch (e) {}
            if (this._wakeLock) { this._wakeLock.release().catch(() => {}); this._wakeLock = null; }
            if (window.firebaseDb && this.authUid) { const { ref, set } = window.firebaseDbHelpers; set(ref(window.firebaseDb, 'focusLive/' + this.authUid), null).catch(() => {}); }
            document.body.classList.remove('garden-running');
            document.getElementById('gdCheck')?.classList.add('hidden');
            const f = this._garden;
            this._garden = null;
            return f;
        },

        gdComplete() {
            const f = this._gdStop();
            if (!f) return;
            if (this._gd3) { this._gd3.grow(1); this._gd3.finish(true); }
            this._gdStage('أثمرت');
            this.playNotifySound();
            try { navigator.vibrate && navigator.vibrate([80, 60, 80, 60, 160]); } catch (e) {}
            const u = this.currentUser || {};
            f.golden = this._goldenCredit(f);
            const pts = f.minutes + f.golden;
            this.saveFocusStats({ gardenTrees: numOr0(u.gardenTrees) + 1, gardenMinutes: numOr0(u.gardenMinutes) + f.minutes, ['garden_' + f.sp]: numOr0(u['garden_' + f.sp]) + 1 });
            this.addPointsAtomic(pts).then(() => this.logDailyActivity({ points: pts, studySessions: 1, minutes: f.minutes }));
            this._gdResult = { ok: true, f, pts };
            this._gdRenderResult();
        },

        gdFail(reason, away) {
            const f = this._gdStop();
            if (!f) return;
            if (this._gd3) this._gd3.finish(false);
            this._gdStage('ذبلت');
            const u = this.currentUser || {};
            this.saveFocusStats({ gardenDead: numOr0(u.gardenDead) + 1 });
            try { navigator.vibrate && navigator.vibrate(400); } catch (e) {}
            this._gdResult = { ok: false, f, reason };
            this._gdRenderResult();
            if (away || this.currentView !== 'gardenView') this.showToast('ذبلت شجرتك: ' + reason);
        },

        _gdRenderResult() {
            const box = document.getElementById('gdSheet'), r = this._gdResult;
            if (!box || !r) return;
            const name = (SP.find((x) => x[0] === r.f.sp) || SP[0])[1];
            box.className = 'gd-sheet res ' + (r.ok ? 'ok' : 'bad');
            box.innerHTML = r.ok ? `
                <span class="gd-res-ic"><i data-lucide="apple"></i></span>
                <b class="gd-res-t">أثمرت شجرة ال${esc(name)}</b>
                <p class="gd-res-p">كملت ${r.f.minutes} دقيقة دراسة وكسبت <em>+${r.pts} نقطة</em>${r.f.golden ? ` (منها ${r.f.golden} نقطة ذهبية)` : ''}.</p>
                <button class="gd-go" onclick="app.gdAgain()"><i data-lucide="sprout"></i>ازرع بذرة ثانية</button>` : `
                <span class="gd-res-ic"><i data-lucide="leaf"></i></span>
                <b class="gd-res-t">ذبلت شجرتك</b>
                <p class="gd-res-p">${esc(r.reason || '')}. راحت ${r.f.minutes} نقطة كانت تنتظرك.</p>
                <button class="gd-go" onclick="app.gdAgain()"><i data-lucide="rotate-ccw"></i>حاول مرة ثانية</button>`;
            lucide.createIcons();
            this._gdInset();
        },
        gdAgain() {
            this._gdResult = null;
            if (this._gd3) this._gd3.reset(this.gdSpecies, 1 + Math.floor(Math.random() * 1e6));
            this._gdRenderSetup();
        }
    });
})();
