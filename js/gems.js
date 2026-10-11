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
    let CFG = null, cfgUn = null, logList = [], logUn = null, idState = { n: '', st: '' }, off = 0, busy = false;
    const gem = (px) => app.gemIcon(px);
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const myGems = () => num(app.currentUser && app.currentUser.gems);
    const srvNow = () => Date.now() + off;
    const digits = (s) => String(s == null ? '' : s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6F0)).replace(/[^0-9]/g, '');
    const newId = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
    const date = (t) => new Date(t).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });
    const price = (k) => (CFG && Number.isFinite(Number(CFG[k])) ? Number(CFG[k]) : null);
    const idPrice = (len) => (CFG && CFG.idp && Number.isFinite(Number(CFG.idp[len])) ? Number(CFG.idp[len]) : null);
    const rate = () => (CFG && Number(CFG.rate) > 0 ? Number(CFG.rate) : 3000);
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
        const tiers = ID_LENS.map((l) => `<span class="gm-tier${idPrice(l) == null ? ' off' : ''}"><b>${l}</b> أرقام ${idPrice(l) == null ? '' : gem(13) + AR(idPrice(l))}</span>`).join('');
        const sn = (app.currentUser && app.currentUser.studentNumber) || '';
        box.innerHTML = `
            <section class="gm-hero">
                <span class="gm-orb" aria-hidden="true">${gem(46)}</span>
                <div><small>رصيدك من الماس</small><b>${AR(myGems())}</b></div>
                <button class="gm-top" onclick="app.gmTopup()"><i data-lucide="plus"></i>اشحن الماس</button>
            </section>
            <section class="gm-card">
                <div class="gm-ch"><span class="gm-ci" style="--c:#0095F6">${badge}</span><div><b>توثيق الحساب</b><small>العلامة الزرقاء جنب اسمك بكل مكان: الرسائل، الأوائل، المنتدى والغرف</small></div></div>
                <div class="gm-prev"><span>${esc(name)}</span>${badge}</div>
                <div class="gm-meta"><span>المدة: <b>${vdays()} يوم</b></span>${vStatus}</div>
                ${vBtn}
                <p class="gm-note">إذا خلصت المدة تختفي العلامة، وتكدر تجددها وقت ما تريد. التجديد قبل ما تخلص يضيف الأيام على الباقي.</p>
            </section>
            <section class="gm-card">
                <div class="gm-ch"><span class="gm-ci" style="--c:#7C3AED"><i data-lucide="hash"></i></span><div><b>ايدي مميز</b><small>رقم قصير وأنيق يصير رقمك بالتطبيق، وما يكدر أحد غيرك ياخذه</small></div></div>
                <div class="gm-now">رقمك الحالي: <b dir="ltr">${esc(sn || '-')}</b></div>
                <div class="gm-tiers">${tiers}</div>
                <div class="gm-in"><input id="gmId" inputmode="numeric" maxlength="8" dir="ltr" placeholder="اكتب الرقم اللي تريده" oninput="app.gmCheckId()" value="${esc(idState.n)}"></div>
                <div id="gmIdMsg" class="gm-idmsg"></div>
                <button class="gm-btn" id="gmIdBtn" disabled onclick="app.gmBuyId()">${gem(18)}<span>اشتري الرقم</span></button>
                <p class="gm-note">الرقم من 3 إلى 8 أرقام. رقمك القديم يتحرر. كل تغيير له سعره.</p>
            </section>
            ${logList.length ? `<section class="gm-card"><div class="gm-ch"><span class="gm-ci" style="--c:#16A34A"><i data-lucide="receipt"></i></span><div><b>آخر مشترياتك</b></div></div>
                ${logList.map((l) => `<div class="gm-log"><span>${l.k === 'verify' ? 'توثيق الحساب' : 'ايدي مميز ' + esc(l.x || '')}</span><b>${gem(13)}${AR(l.g)}</b><small>${esc(date(l.at))}</small></div>`).join('')}</section>` : ''}
            <p class="gm-foot">الماس عملة داخل التطبيق بس، وما ينسحب نقداً.</p>`;
        try { lucide.createIcons(); } catch (e) {}
        if (idState.n) check();
    }

    Object.assign(app, {
        gmOpen() { listen(); paint(); app._gmRefresh = () => { if (app.currentView === 'gemsView') paint(); }; },

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

        // ---------- the special ID ----------
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
                idState = { n: '', st: '' };
                app.showToast('صار رقمك ' + n);
            } catch (e) {
                console.warn('gem id', e);
                app.showToast(/permission|denied/i.test(String(e && (e.code || e.message))) ? 'ما تمت العملية. الرقم انأخذ أو الماس ما يكفي' : 'ما تمت العملية، حاول مرة ثانية');
            }
            busy = false; paint();
        },

        // ---------- getting diamonds: a code from the panel, or points ----------
        gmTopup() {
            const t = $('walletModalTitle'), c = $('walletModalContent');
            if (!c) return;
            if (t) t.textContent = 'اشحن الماس';
            const pts = num(app.currentUser && app.currentUser.points), r = rate();
            c.innerHTML = `<div class="gm-sheet">
                <div class="gm-bal">${gem(26)}<b>${AR(myGems())}</b><small>رصيدك الحالي</small></div>
                <h4>عندك كود ماس؟</h4>
                <div class="gm-in"><input id="gmCode" dir="ltr" placeholder="GM-XXXX-XXXX-XXXX" autocapitalize="characters"><button class="gm-btn s" id="gmCodeBtn" onclick="app.gmRedeemCode()">فعّل</button></div>
                <h4>أو بدّل نقاطك بماس</h4>
                <p class="gm-note">كل ${gem(13)} 1 = ${AR(r)} نقطة. نقاطك: ${AR(pts)}</p>
                <div class="gm-ex">${[1, 5, 10, 50].map((n) => `<button ${pts >= n * r ? '' : 'disabled'} onclick="app.gmExchange(${n})"><span>${gem(16)}${n}</span><small>${AR(n * r)} نقطة</small></button>`).join('')}</div>
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
        async gmExchange(n) {
            const uid = app.authUid, r = rate();
            if (!uid || !(n >= 1)) return;
            const cost = n * r;
            const ok = await app.ask({ icon: 'repeat', tone: 'primary', title: 'تبدّل ' + AR(cost) + ' نقطة؟', text: 'تاخذ ' + n + ' ماس بدالها.', ok: 'بدّل' });
            if (!ok) return;
            try {
                await (app._walletQueue ? app._walletQueue(async () => {
                    const [ps, gs] = await Promise.all([H().get(R('users/' + uid + '/points')), H().get(R('users/' + uid + '/gems'))]);
                    const p = num(ps.val()), g = num(gs.val());
                    if (p < cost) throw new Error('points');
                    await H().update(H().ref(window.firebaseDb), { ['users/' + uid + '/points']: p - cost, ['leaderboard/' + uid + '/points']: p - cost, ['users/' + uid + '/gems']: g + n, ['users/' + uid + '/ps']: 'x:' + Date.now() });
                    app.currentUser.points = p - cost; app.currentUser.gems = g + n; app.saveUserData && app.saveUserData();
                }) : Promise.reject(new Error('queue')));
                app.showToast('انضاف ' + n + ' ماس');
                this.gmTopup();
                if (app.currentView === 'gemsView') paint(); else if (app.currentView === 'walletView') { app.renderWalletBalance(); app.renderWalletPoints(); }
            } catch (e) {
                console.warn('gem exchange', e);
                app.showToast(String(e && e.message) === 'points' ? 'نقاطك ما تكفي' : 'ما تمت العملية، حاول مرة ثانية');
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
