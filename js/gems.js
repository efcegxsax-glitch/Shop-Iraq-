// متجر الماس: the diamond store. A student buys with diamonds (users/{uid}/gems) the blue verification badge (it lasts a number of days, then he renews
// it or lets it go) and a special short student number (an "ID"). The prices are the admin's (gemShop/cfg). Diamonds come from codes made in the panel (GM-...)
// or from exchanging points. Every purchase is ONE write (the diamonds go down and the thing is granted together), and the database rules check the price.
// verified/{uid} = { at, name, until }, numIndex/{number} = uid, gemLog/{uid}/{id} = { k: verify | id, g: price, at, x? }. Loaded by app._need('gems').
(function () {
    const DAY = 86400000, ID_LENS = [3, 4, 6, 7, 8];
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const H = () => window.firebaseDbHelpers;
    const $ = (id) => document.getElementById(id);
    const R = (p) => H().ref(window.firebaseDb, p);
    const AR = (n) => Number(n || 0).toLocaleString('en-US');
    let CFG = null, cfgUn = null, logList = [], logUn = null, idState = { n: '', st: '', len: 0 }, off = 0, busy = false;
    const gem = (px) => app.gemIcon(px);
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const myGems = () => num(app.currentUser && app.currentUser.gems);
    const srvNow = () => Date.now() + off;
    const digits = (s) => String(s == null ? '' : s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6F0)).replace(/[^0-9]/g, '');
    const newId = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
    const date = (t) => new Date(t).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });
    const price = (k) => (CFG && Number.isFinite(Number(CFG[k])) ? Number(CFG[k]) : null);
    const idPrice = (len) => (CFG && CFG.idp && Number.isFinite(Number(CFG.idp[len])) ? Number(CFG.idp[len]) : null);
    const vdays = () => (CFG && Number(CFG.vdays) > 0 ? Math.round(Number(CFG.vdays)) : 30);
    const mine = () => { const v = app._verified && app._verified[app.authUid]; return v && typeof v === 'object' ? v : null; };

    // ---------- the page ----------
    function listen() {
        if (!window.firebaseDb) return;
        if (!cfgUn) cfgUn = H().onValue(R('gemShop/cfg'), (s) => { CFG = s.exists() ? s.val() : {}; paint(); }, () => { CFG = CFG || {}; paint(); });
        if (!logUn && app.authUid) logUn = H().onValue(R('gemLog/' + app.authUid), (s) => { const v = s.val() || {}; logList = Object.keys(v).map((k) => v[k]).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 6); paint(); }, () => {});
        try { H().get(R('.info/serverTimeOffset')).then((s) => { if (typeof s.val() === 'number') off = s.val(); }).catch(() => {}); } catch (e) { /* the phone's own clock */ }
    }
    function stop() { try { cfgUn && cfgUn(); } catch (e) {} try { logUn && logUn(); } catch (e) {} cfgUn = logUn = null; }

    function paint() {
        const box = $('gmContent');
        if (!box || app.currentView !== 'gemsView') return;
        const v = mine(), now = srvNow(), vp = price('verify'), name = (app.currentUser && app.currentUser.fullName) || 'اسمك';
        const permanent = v && typeof v.until !== 'number', active = v && (permanent || v.until > now), left = active && !permanent ? Math.max(1, Math.ceil((v.until - now) / DAY)) : 0;
        const ready = CFG && vp != null;
        const badge = `<span class="vbadge md">${app.verifiedSvg()}</span>`;
        const vStatus = permanent ? '<em class="ok">موثّق دائماً من الإدارة</em>'
            : active ? `<em class="ok">موثّق لحد ${esc(date(v.until))} (باقي ${left} يوم)</em>`
            : v ? '<em class="end">انتهى توثيقك. تريد تجدده؟</em>' : '<em>حسابك مو موثّق</em>';
        const vBtn = permanent ? '<button class="gm-btn" disabled>موثّق دائماً</button>'
            : `<button class="gm-btn" ${ready && !busy ? '' : 'disabled'} onclick="app.gmBuyVerify()">${gem(18)}<span>${vp == null ? 'غير متاح هسه' : (active ? 'جدّد ' : 'وثّق حسابي ') + AR(vp)}</span></button>`;
        const sn = (app.currentUser && app.currentUser.studentNumber) || '';
        const L = idState.len || 0, lp = L ? idPrice(L) : null;
        const tiers = ID_LENS.map((l) => `<button class="gm-seg${L === l ? ' on' : ''}" ${idPrice(l) == null ? 'disabled' : ''} onclick="app.gmPickLen(${l})"><b>${l}</b><small>${idPrice(l) == null ? 'غير متاح' : gem(12) + AR(idPrice(l))}</small></button>`).join('');
        const wOn = app.walletPrice() > 0, wLocked = wOn && app.walletLocked();
        const row = (c, ic, title, sub, right) => `<div class="gm-row"><span class="gm-ci" style="--c:${c}">${ic}</span><div class="gm-rt"><b>${title}</b><small>${sub}</small></div>${right || ''}</div>`;
        box.innerHTML = `
            <section class="gm-hero">
                <div class="gm-hl"><small>رصيدك من الماس</small><b>${gem(30)}<span>${AR(myGems())}</span></b></div>
                <button class="gm-top" onclick="app.gmTopup()"><i data-lucide="plus"></i>اشحن</button>
            </section>
            <h3 class="gm-h">المتجر</h3>
            <section class="gm-card">
                ${row('#0095F6', badge, 'توثيق الحساب', 'علامة زرقاء جنب اسمك لمدة ' + vdays() + ' يوم', vp == null ? '' : `<span class="gm-pill">${gem(14)}${AR(vp)}</span>`)}
                <div class="gm-prev"><span>${esc(name)}</span>${badge}</div>
                <div class="gm-st">${vStatus}</div>
                ${vBtn}
            </section>
            ${wOn ? `<section class="gm-card">
                ${row('#10B981', '<i data-lucide="wallet"></i>', 'تفعيل المحفظة', 'مرة وحدة وتبقى لك للأبد', `<span class="gm-pill">${gem(14)}${AR(app.walletPrice())}</span>`)}
                <div class="gm-st">${wLocked ? '<em>محفظتك مقفولة</em>' : '<em class="ok">محفظتك مفعّلة</em>'}</div>
                <button class="gm-btn" ${wLocked && !busy ? '' : 'disabled'} onclick="app.gmBuyWallet()">${wLocked ? gem(18) + '<span>فعّل المحفظة</span>' : '<span>مفعّلة</span>'}</button>
            </section>` : ''}
            <section class="gm-card">
                ${row('#7C3AED', '<i data-lucide="hash"></i>', 'ايدي مميز', 'رقم قصير يصير رقمك بالتطبيق', `<span class="gm-pill ghost">رقمك <b dir="ltr">${esc(sn || '-')}</b></span>`)}
                <div class="gm-segs">${tiers}</div>
                <div class="gm-in"><input id="gmId" inputmode="numeric" maxlength="${L || 8}" dir="ltr" placeholder="${L ? 'اكتب رقم من ' + L + ' خانات' : 'اختار عدد الخانات فوق'}" ${L ? '' : 'disabled'} oninput="app.gmCheckId()" value="${esc(idState.n)}"></div>
                <div id="gmIdMsg" class="gm-idmsg"></div>
                <button class="gm-btn" id="gmIdBtn" disabled onclick="app.gmBuyId()">${gem(18)}<span>${lp == null ? 'اشتري الرقم' : 'اشتري الرقم ' + AR(lp)}</span></button>
            </section>
            ${logList.length ? `<h3 class="gm-h">آخر مشترياتك</h3><section class="gm-card gm-logs">
                ${logList.map((l) => `<div class="gm-log"><span>${l.k === 'verify' ? 'توثيق الحساب' : l.k === 'wallet' ? 'تفعيل المحفظة' : 'ايدي مميز ' + esc(l.x || '')}<small>${esc(date(l.at))}</small></span><b>${gem(13)}${AR(l.g)}</b></div>`).join('')}</section>` : ''}
            <p class="gm-foot">الماس عملة داخل التطبيق بس، وما ينسحب نقداً.</p>`;
        try { lucide.createIcons(); } catch (e) {}
        if (idState.n) check();
    }

    Object.assign(app, {
        gmOpen() { app._listenGemCfg(); listen(); paint(); app._gmRefresh = () => { if (app.currentView === 'gemsView') paint(); }; },

        // ---------- buying the verification ----------
        async gmBuyVerify() {
            if (busy) return;
            const uid = app.authUid, vp = price('verify');
            if (!uid || vp == null) return;
            const cur = mine();
            if (cur && typeof cur.until !== 'number') { app.showToast('حسابك موثّق دائماً من الإدارة'); return; }
            const days = vdays(), now = srvNow(), base = cur && cur.until > now ? cur.until : now;
            const ok = await app.ask({ icon: 'badge-check', tone: 'primary', title: (cur ? 'تجدد' : 'توثّق') + ' حسابك؟', text: 'تدفع ' + AR(vp) + ' ماس، والتوثيق يستمر ' + days + ' يوم (لحد ' + date(base + days * DAY) + ')', ok: 'تأكيد الدفع' });
            if (!ok) return;
            busy = true; paint();
            try {
                const g = num((await H().get(R('users/' + uid + '/gems'))).val());
                if (g < vp) { app.showToast('ماسك ما يكفي (' + AR(g) + ' من ' + AR(vp) + ')'); busy = false; paint(); this.gmTopup(); return; }
                const until = base + days * DAY - 30000, id = newId(), t = Date.now(), nm = String((app.currentUser && app.currentUser.fullName) || 'طالب').slice(0, 80);
                await H().update(H().ref(window.firebaseDb), { ['users/' + uid + '/gems']: g - vp, ['verified/' + uid]: { at: t, name: nm, until }, ['gemLog/' + uid + '/' + id]: { k: 'verify', g: vp, at: t } });
                app.currentUser.gems = g - vp; app.saveUserData && app.saveUserData();
                app.showToast(cur ? 'تم تجديد التوثيق' : 'تم توثيق حسابك');
            } catch (e) {
                console.warn('gem verify', e);
                app.showToast(/permission|denied/i.test(String(e && (e.code || e.message))) ? 'ما تمت العملية. تأكد إن المتجر مفعّل وإن الماس يكفي' : 'ما تمت العملية، حاول مرة ثانية');
            }
            busy = false; paint();
        },

        // ---------- the wallet (رصيدي) as a paid feature: once, with the panel's price in diamonds ----------
        async gmBuyWallet() {
            if (busy) return;
            const uid = app.authUid, wp = app.walletPrice();
            if (!uid || wp <= 0) return;
            if (!app.walletLocked()) { app.showToast('محفظتك مفعّلة'); return; }
            const ok = await app.ask({ icon: 'wallet', tone: 'primary', title: 'تفعّل محفظتك؟', text: 'تدفع ' + AR(wp) + ' ماس مرة وحدة، وتبقى المحفظة لك دائماً.', ok: 'تأكيد الدفع' });
            if (!ok) return;
            busy = true; paint();
            try {
                const g = num((await H().get(R('users/' + uid + '/gems'))).val());
                if (g < wp) { app.showToast('ماسك ما يكفي (' + AR(g) + ' من ' + AR(wp) + ')'); busy = false; paint(); this.gmTopup(); return; }
                const t = Date.now(), id = newId();
                await H().update(H().ref(window.firebaseDb), { ['users/' + uid + '/gems']: g - wp, ['users/' + uid + '/wa']: t, ['gemLog/' + uid + '/' + id]: { k: 'wallet', g: wp, at: t } });
                app.currentUser.gems = g - wp; app.currentUser.wa = t; app.saveUserData && app.saveUserData();
                app.showToast('تفعّلت محفظتك');
                if (app.currentView === 'walletView') { app._walletLockPaint(); app.renderWalletBalance(); } else if (app.currentView !== 'gemsView') app.goToWallet();
            } catch (e) {
                console.warn('gem wallet', e);
                app.showToast(/permission|denied/i.test(String(e && (e.code || e.message))) ? 'ما تمت العملية. تأكد إن الماس يكفي' : 'ما تمت العملية، حاول مرة ثانية');
            }
            busy = false; paint();
        },

        // ---------- the special ID ----------
        gmPickLen(l) { idState.len = l; idState.n = idState.n.slice(0, l); idState.st = ''; paint(); const i = $('gmId'); if (i) i.focus(); },
        gmCheckId() { idState.n = digits(($('gmId') || {}).value); const i = $('gmId'); if (i && i.value !== idState.n) i.value = idState.n; check(); },
        async gmBuyId() {
            if (busy) return;
            const uid = app.authUid, n = idState.n, p = idPrice(n.length);
            if (!uid || !n || p == null || idState.st !== 'free') return;
            const ok = await app.ask({ icon: 'hash', tone: 'primary', title: 'تاخذ الرقم ' + n + '؟', text: 'تدفع ' + AR(p) + ' ماس، ورقمك القديم يتحرر ويقدر أحد غيرك ياخذه.', ok: 'تأكيد الدفع' });
            if (!ok) return;
            busy = true; paint();
            try {
                // somebody may have taken it while the question was open
                const ex = await H().get(R('numIndex/' + n));
                if (ex.exists()) { app.showToast('الرقم انأخذ من أحد، جرّب رقم ثاني'); busy = false; idState.st = 'taken'; paint(); return; }
                const g = num((await H().get(R('users/' + uid + '/gems'))).val());
                if (g < p) { app.showToast('ماسك ما يكفي (' + AR(g) + ' من ' + AR(p) + ')'); busy = false; paint(); this.gmTopup(); return; }
                const old = String((app.currentUser && app.currentUser.studentNumber) || ''), id = newId(), t = Date.now();
                const up = { ['users/' + uid + '/gems']: g - p, ['users/' + uid + '/studentNumber']: n, ['pub/' + uid + '/s']: n, ['numIndex/' + n]: uid, ['gemLog/' + uid + '/' + id]: { k: 'id', g: p, at: t, x: n } };
                if (old && old !== n && /^[0-9]{3,12}$/.test(old)) up['numIndex/' + old] = null;
                await H().update(H().ref(window.firebaseDb), up);
                app.currentUser.gems = g - p; app.currentUser.studentNumber = n; app.saveUserData && app.saveUserData();
                try { const wn = document.getElementById('walletCardNumber'); if (wn) wn.textContent = '#' + n; } catch (e) { /* the card redraws later */ }
                idState = { n: '', st: '', len: 0 };
                app.showToast('صار رقمك ' + n);
            } catch (e) {
                console.warn('gem id', e);
                app.showToast(/permission|denied/i.test(String(e && (e.code || e.message))) ? 'ما تمت العملية. الرقم انأخذ أو الماس ما يكفي' : 'ما تمت العملية، حاول مرة ثانية');
            }
            busy = false; paint();
        },

        // ---------- getting diamonds: only a code made in the panel ----------
        gmTopup() {
            const t = $('walletModalTitle'), c = $('walletModalContent');
            if (!c) return;
            if (t) t.textContent = 'اشحن الماس';
            c.innerHTML = `<div class="gm-sheet">
                <div class="gm-bal">${gem(26)}<b>${AR(myGems())}</b><small>رصيدك الحالي</small></div>
                <h4>عندك كود ماس؟</h4>
                <div class="gm-in"><input id="gmCode" dir="ltr" placeholder="GM-XXXX-XXXX-XXXX" autocapitalize="characters"><button class="gm-btn s" id="gmCodeBtn" onclick="app.gmRedeemCode()">فعّل</button></div>
            </div>`;
            $('walletModal')?.classList.remove('hidden');
            try { lucide.createIcons(); } catch (e) {}
        },
        async gmRedeemCode(code, btn) {
            const uid = app.authUid;
            const inp = $('gmCode');
            code = String(code || (inp && inp.value) || '').trim().toUpperCase().replace(/\s+/g, '');
            btn = btn || $('gmCodeBtn');
            const reset = () => { if (btn) { btn.disabled = false; if (btn.id === 'gmCodeBtn') btn.textContent = 'فعّل'; else btn.textContent = 'تأكيد الإيداع'; } };
            if (!uid || !/^GM-[A-Z0-9-]{3,21}$/.test(code)) { app.showToast('الكود غير صحيح، تأكد من كتابته'); reset(); return; }
            if (btn) btn.disabled = true;
            const path = 'gemCodes/' + code;
            try {
                const sn = await H().get(R(path));
                if (!sn.exists()) { app.showToast('الكود غير موجود'); reset(); return; }
                const d = sn.val();
                if (d.used) { app.showToast('هذا الكود مستخدم من قبل'); reset(); return; }
                const gain = Math.round(num(d.gems));
                if (gain < 1) { app.showToast('الكود غير صالح'); reset(); return; }
                const g = num((await H().get(R('users/' + uid + '/gems'))).val());
                await H().update(H().ref(window.firebaseDb), { [path + '/used']: true, [path + '/usedBy']: uid, [path + '/usedAt']: Date.now(), ['users/' + uid + '/gems']: g + gain, ['users/' + uid + '/gc']: path });
                app.currentUser.gems = g + gain; app.saveUserData && app.saveUserData();
                app.closeWalletModal && app.closeWalletModal();
                app.showToast('انضاف ' + AR(gain) + ' ماس لحسابك');
                if (app.currentView === 'gemsView') paint(); else if (app.currentView === 'walletView') app.renderWalletBalance();
            } catch (e) {
                console.warn('gem code', e);
                app.showToast('ما تفعّل الكود. تأكد من النت أو إنه ما انستخدم');
                reset();
            }
        },
    });

    // is the number free? shown under the box while he types
    let chkT = 0;
    function check() {
        const msg = $('gmIdMsg'), btn = $('gmIdBtn'), n = idState.n, uid = app.authUid;
        if (!msg || !btn) return;
        const set = (st, t, cls) => { idState.st = st; msg.className = 'gm-idmsg ' + (cls || ''); msg.textContent = t; btn.disabled = st !== 'free' || busy; };
        if (!n) { set('', ''); return; }
        if (idState.len && n.length !== idState.len) { set('bad', 'اكتب ' + idState.len + ' خانات بالضبط', 'bad'); return; }
        if (ID_LENS.indexOf(n.length) < 0) { set('bad', n.length === 5 ? 'الأرقام من 5 خانات ما تنباع، اختار 3 أو 4 أو من 6 إلى 8' : 'اكتب من 3 إلى 8 أرقام', 'bad'); return; }
        if (n[0] === '0') { set('bad', 'الرقم ما يبدأ بصفر', 'bad'); return; }
        if (idPrice(n.length) == null) { set('bad', 'هذا الطول مو متاح هسه', 'bad'); return; }
        set('wait', 'دا نتأكد...', '');
        clearTimeout(chkT);
        chkT = setTimeout(async () => {
            try {
                const s = await H().get(R('numIndex/' + n));
                if (idState.n !== n) return;
                if (s.exists() && s.val() === uid) set('mine', 'هذا رقمك هسه', 'bad');
                else if (s.exists()) set('taken', 'هذا الرقم مأخوذ، جرّب غيره', 'bad');
                else set('free', 'متاح. سعره ' + AR(idPrice(n.length)) + ' ماس', 'ok');
            } catch (e) { if (idState.n === n) set('bad', 'تعذر التأكد، تحقق من النت', 'bad'); }
        }, 350);
    }

    // leaving the page stops the listeners
    const prev = app.switchView;
    app.switchView = function (viewId) { if (this.currentView === 'gemsView' && viewId !== 'gemsView') { stop(); app._gmRefresh = null; } return prev.apply(this, arguments); };
})();
