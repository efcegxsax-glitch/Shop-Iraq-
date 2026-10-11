// Premium: the paid package (for now: doubled points). The student buys 30 days (or whatever the panel sets) with diamonds, like the verification: ONE write takes the
// diamonds and grants premium/{uid} = { at, until, name }, and the database rules check the price against premCfg (price, days). Which parts exist and
// what they cost is the panel's. Locked parts show a lock; the real checks are on the server (rules for points and rooms, the Worker for the AI parts).
// Loaded by app._need('premium').
(function () {
    const DAY = 86400000;
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const H = () => window.firebaseDbHelpers;
    const $ = (id) => document.getElementById(id);
    const R = (p) => H().ref(window.firebaseDb, p);
    const AR = (n) => Number(n || 0).toLocaleString('en-US');
    const gem = (px) => app.gemIcon(px);
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const date = (t) => new Date(t).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });
    const newId = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
    let busy = false;

    // id, title, what it gives, icon, colour, what opens it (a function of app, loaded from `mod` when it is not there yet)
    // what Premium gives (more parts can be added here later)
    const FEATURES = [
        { id: 'mult', t: 'نقاط مضاعفة', ic: 'zap', c: '#F59E0B', go: null },
    ];
    const byId = (id) => FEATURES.find((f) => f.id === id);
    const left = () => { const v = app._prem; return v && typeof v.until === 'number' ? Math.max(0, Math.ceil((v.until - Date.now()) / DAY)) : 0; };

    function paint() {
        const box = $('pmContent');
        if (!box || app.currentView !== 'premiumView') return;
        const on = app.premActive(), v = app._prem, perm = on && v && typeof v.until !== 'number', price = app.premPrice(), days = app.premDays();
        const ready = price > 0, mult = app.premMult() > 1 ? app.premMult() : (Number(app.premCfg().mult) >= 1 ? Math.round(Number(app.premCfg().mult)) : 2);
        const status = on ? (perm ? 'مشترك دائماً (من الإدارة)' : 'مشترك. باقي ' + left() + ' يوم (لحد ' + esc(date(v.until)) + ')')
            : v && typeof v.until === 'number' ? 'انتهى اشتراكك. جدّد حتى ترجع المزايا' : 'مو مشترك';
        const btn = perm ? '<button class="pm-btn" disabled>اشتراكك دائم</button>'
            : `<button class="pm-btn" ${ready && !busy ? '' : 'disabled'} onclick="app.premBuy()">${ready ? gem(18) + '<span>' + (on ? 'جدّد ' : 'اشترك ') + AR(price) + ' ماس / ' + days + ' يوم</span>' : '<span>الاشتراك غير متاح هسه</span>'}</button>`;
        const tile = (f) => {
            const off = !app.premFeatureOn(f.id);
            const open = (on || f.free) && !off;
            const tx = f.id === 'mult' ? 'نقاطك تتضاعف ×' + mult + ' على كل شي تدرسه' : f.d;
            return `<button class="pm-f${open ? ' open' : ''}${off ? ' off' : ''}" style="--c:${f.c}" onclick="app.premFeature('${f.id}')" ${off ? 'disabled' : ''}>
                <span class="pm-fi"><i data-lucide="${f.ic}"></i></span>
                <span class="pm-ft"><b>${esc(f.t)}</b><small>${esc(tx)}</small></span>
                <span class="pm-lk">${off ? '<small>مو متاح</small>' : open ? '<i data-lucide="chevron-left"></i>' : '<i data-lucide="lock"></i>'}</span>
            </button>`;
        };
        box.innerHTML = `
            <section class="pm-hero${on ? ' on' : ''}">
                <div class="pm-crown"><i data-lucide="crown"></i></div>
                <h2>Premium</h2>
                <p>${status}</p>
                <div class="pm-bal"><small>رصيدك</small><b>${gem(16)}${AR(num(app.currentUser && app.currentUser.gems))}</b></div>
                ${btn}
                <small class="pm-note">تدفع بالماس، وإذا خلصت المدة ترجع المزايا للوضع العادي وتكدر تجدد وقت ما تريد.</small>
            </section>
            <h3 class="gm-h">شنو يشمل الاشتراك</h3>
            <div class="pm-list">${FEATURES.map(tile).join('')}</div>
            <p class="gm-foot">مزايا جديدة تنضاف للاشتراك قريباً. الماس عملة داخل التطبيق بس، تشحنه من متجر الماس.</p>`;
        try { lucide.createIcons(); } catch (e) {}
    }

    Object.assign(app, {
        premOpen() { app._premRefresh = () => { if (app.currentView === 'premiumView') paint(); }; app._listenPrem(); paint(); },

        async premBuy() {
            if (busy) return;
            const uid = app.authUid, price = app.premPrice(), days = app.premDays();
            if (!uid || !(price > 0)) return;
            const cur = app._prem;
            if (cur && typeof cur.until !== 'number') { app.showToast('اشتراكك دائم من الإدارة'); return; }
            const now = Date.now(), base = cur && cur.until > now ? cur.until : now;
            const ok = await app.ask({ icon: 'crown', tone: 'primary', title: (cur && cur.until > now ? 'تجدد' : 'تشترك بـ') + ' Premium؟', text: 'تدفع ' + AR(price) + ' ماس، والاشتراك ' + days + ' يوم (لحد ' + date(base + days * DAY) + ')', ok: 'تأكيد الدفع' });
            if (!ok) return;
            busy = true; paint();
            app._premBusy = true;
            try {
                const g = num((await H().get(R('users/' + uid + '/gems'))).val());
                if (g < price) { app.showToast('ماسك ما يكفي (' + AR(g) + ' من ' + AR(price) + ')'); busy = false; app._premBusy = false; paint(); app._need('gems').then(() => app.gmTopup()).catch(() => {}); return; }
                const until = base + days * DAY - 30000, id = newId(), t = Date.now(), nm = String((app.currentUser && app.currentUser.fullName) || 'طالب').slice(0, 80);
                await H().update(H().ref(window.firebaseDb), { ['users/' + uid + '/gems']: g - price, ['premium/' + uid]: { at: t, name: nm, until }, ['gemLog/' + uid + '/' + id]: { k: 'prem', g: price, at: t } });
                app.currentUser.gems = g - price; app.saveUserData && app.saveUserData();
                app._prem = { at: t, name: nm, until };
                app.showToast(cur ? 'تم تجديد Premium' : 'صرت مشترك Premium');
            } catch (e) {
                console.warn('premium buy', e);
                app.showToast(/permission|denied/i.test(String(e && (e.code || e.message))) ? 'ما تمت العملية. تأكد إن الاشتراك مفعّل وإن الماس يكفي' : 'ما تمت العملية، حاول مرة ثانية');
            }
            app._premBusy = false; busy = false; paint(); app._premRepaint();
        },

        // a tile of the page: open the part when allowed, else the paywall
        async premFeature(id) {
            const f = byId(id);
            if (!f) return;
            if (id === 'mult') { app.showToast(app.premActive() ? 'نقاطك مضاعفة هسه' : 'اشترك حتى تتضاعف نقاطك'); if (!app.premActive()) this.premPaywall(id); return; }
            const run = async () => {
                try { if (f.mod) await app._need(f.mod); } catch (e) { app.showToast('هذا الجزء ينضاف قريباً'); return; }
                if (typeof app[f.fn] === 'function') app[f.fn](); else app.showToast('هذا الجزء ينضاف قريباً');
            };
            // the exam part has free uses a month, counted and refused by the Worker: it opens for everybody and the Worker says when the free ones are gone
            if (f.free && app.premFeatureOn(id)) { if (!app.isLoggedIn || !app.authUid) { app.goToAuth('login'); return; } await run(); return; }
            await app.premGate(id, run);
        },

        // what a locked part shows: the lock, what Premium gives, and the price
        premPaywall(id) {
            const t = $('walletModalTitle'), c = $('walletModalContent');
            if (!c) return;
            const f = byId(id) || {}, price = app.premPrice(), on = app.premActive();
            if (t) t.textContent = 'Premium';
            c.innerHTML = `<div class="pm-pay">
                <div class="pm-crown"><i data-lucide="${on ? 'sliders-horizontal' : 'lock'}"></i></div>
                <h3>${esc(f.t || 'Premium')}</h3>
                <p>${!app.premFeatureOn(id) ? 'هذا الجزء مو متاح هسه.' : on ? 'اشتراكك ما رجّع الجزء، حاول مرة ثانية بعد لحظة.' : esc(f.d || 'جزء من اشتراك Premium') + '.'}</p>
                ${on || price <= 0 ? '' : `<button class="pm-btn" onclick="app.closeWalletModal();app.premBuy()">${gem(18)}<span>اشترك ${AR(price)} ماس / ${app.premDays()} يوم</span></button>`}
                <button class="pm-sub" onclick="app.closeWalletModal();app.goToPremium()">شوف كل المزايا</button>
            </div>`;
            $('walletModal')?.classList.remove('hidden');
            try { lucide.createIcons(); } catch (e) {}
        },
    });
})();
