// قاعة الهمّة: students from every governorate enter one hall and see each other (photo, name,
// governorate) in a grid of four columns that grows downwards, each with a timer counting up
// since they came in. Whoever stays long gets a fire around the photo that grows with the time.
// Data: hall/{uid} = { n, g, a (small photo), at (when they came in) }; leaves on its own when
// the student closes the page or the phone goes offline (onDisconnect). Loaded by app._need('hall').
(function () {
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const COLORS = ['#F97316', '#0D9488', '#7C3AED', '#2563EB', '#DB2777', '#16A34A', '#D97706', '#0891B2'];
    const H = { unsub: null, tick: null, rows: {}, nodes: {}, joined: false, joining: false };

    const clock = (ms) => {
        const t = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
        const p = (n) => String(n).padStart(2, '0');
        return h ? h + ':' + p(m) + ':' + p(s) : p(m) + ':' + p(s);
    };
    // fire grows with the time in the hall: 5 min a spark, 20 min a flame, 45 min a blaze
    const tier = (ms) => (ms >= 45 * 60000 ? 3 : ms >= 20 * 60000 ? 2 : ms >= 5 * 60000 ? 1 : 0);
    const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };

    // a 72px copy of the student's photo so the hall stays light (the full photo can be huge)
    function thumb(src) {
        return new Promise((resolve) => {
            if (!src) { resolve(''); return; }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const c = document.createElement('canvas'); c.width = c.height = 72;
                    const k = Math.max(72 / img.width, 72 / img.height);
                    const w = img.width * k, h = img.height * k;
                    c.getContext('2d').drawImage(img, (72 - w) / 2, (72 - h) / 2, w, h);
                    resolve(c.toDataURL('image/jpeg', 0.7));
                } catch (e) { resolve(String(src).length <= 400 && /^https:/.test(src) ? src : ''); }
            };
            img.onerror = () => resolve(String(src).length <= 400 && /^https:/.test(src) ? src : '');
            img.src = src;
        });
    }

    function avatarHtml(r) {
        if (r.a && (/^data:image\//.test(r.a) || /^https:/.test(r.a))) return '<img src="' + esc(safeImage(r.a)) + '" alt="" loading="lazy">';
        const ch = esc(Array.from(r.n || 'ط')[0]);
        return '<span class="hl-init" style="background:' + hue(r.n) + '">' + ch + '</span>';
    }

    Object.assign(app, {
        hlOpen() {
            const box = document.getElementById('hlContent');
            if (!box) return;
            if (!this.isLoggedIn || !window.firebaseDb) {
                box.innerHTML = '<div class="hl-wrap"><div class="hl-hero"><div class="hl-flame-big" aria-hidden="true"><i></i><i></i><i></i></div>'
                    + '<h2>قاعة الهمّة</h2><p>سجّل دخولك حتى تدخل القاعة وتشوف زملاءك من كل المحافظات.</p>'
                    + '<button class="hl-btn" onclick="app.goToAuth(\'login\')">تسجيل الدخول</button></div></div>';
                return;
            }
            if (!document.getElementById('hlGrid')) {
                box.innerHTML = '<div class="hl-wrap">'
                    + '<div class="hl-hero"><div class="hl-embers" aria-hidden="true">' + Array.from({ length: 10 }, (_, i) => '<b style="--i:' + i + '"></b>').join('') + '</div>'
                    + '<div class="hl-flame-big" aria-hidden="true"><i></i><i></i><i></i></div>'
                    + '<div class="hl-count"><span id="hlCount">0</span> طالب بالقاعة</div>'
                    + '<div class="hl-mine" id="hlMine"><small>وقتك بالقاعة</small><b id="hlMyClock">00:00</b></div>'
                    + '<button class="hl-btn" id="hlBtn" onclick="app.hlToggle()">ادخل القاعة</button></div>'
                    + '<div id="hlGrid" class="hl-grid"></div>'
                    + '<div id="hlEmpty" class="hl-empty hidden">القاعة فارغة هسه. كون أول من يدخل وتشعل الهمّة.</div></div>';
            }
            H.rows = H.rows || {};
            if (!H.unsub) {
                const { ref, onValue } = window.firebaseDbHelpers;
                H.unsub = onValue(ref(window.firebaseDb, 'hall'), (snap) => {
                    H.rows = snap.exists() ? snap.val() : {};
                    H.joined = !!H.rows[this.currentUid()];
                    this._hlRender();
                }, () => {});
            }
            if (!H.tick) H.tick = setInterval(() => this._hlTick(), 1000);
            this._hlRender();
        },

        hlClose() {
            if (H.unsub) { try { H.unsub(); } catch (e) {} H.unsub = null; }
            if (H.tick) { clearInterval(H.tick); H.tick = null; }
            this._hlLeave();
            H.nodes = {}; H.rows = {};
            const g = document.getElementById('hlContent'); if (g) g.innerHTML = '';
        },

        hlToggle() {
            if (H.joined) { this._hlLeave(); this.showToast('طلعت من القاعة'); } else this._hlJoin();
        },

        async _hlJoin() {
            if (H.joining || !this.currentUser || !window.firebaseDb) return;
            H.joining = true;
            try {
                const a = await thumb(this.currentUser.avatar);
                const { ref, set, onDisconnect } = window.firebaseDbHelpers;
                const r = ref(window.firebaseDb, 'hall/' + this.currentUid());
                await set(r, { n: String(this.currentUser.fullName || 'طالب').slice(0, 80), g: String(this.currentUser.governorate || '').slice(0, 30), a, at: Date.now() });
                try { onDisconnect(r).remove(); } catch (e) {}
                H.joined = true;
                this.showToast('دخلت القاعة، همّتك تشتعل');
            } catch (e) { this.showToast('ما كدرت أدخل القاعة، حاول مرة ثانية'); }
            H.joining = false;
        },

        _hlLeave() {
            if (!H.joined || !window.firebaseDb || !this.isLoggedIn) return;
            H.joined = false;
            try {
                const { ref, set, onDisconnect } = window.firebaseDbHelpers;
                const r = ref(window.firebaseDb, 'hall/' + this.currentUid());
                try { onDisconnect(r).cancel(); } catch (e) {}
                set(r, null).catch(() => {});
            } catch (e) {}
        },

        _hlRender() {
            const grid = document.getElementById('hlGrid');
            if (!grid) return;
            const me = this.currentUid();
            const list = Object.keys(H.rows || {}).map((u) => Object.assign({ u }, H.rows[u])).filter((r) => r && r.n && r.at)
                .sort((a, b) => a.at - b.at);
            document.getElementById('hlCount').textContent = list.length;
            document.getElementById('hlEmpty').classList.toggle('hidden', list.length > 0);
            const btn = document.getElementById('hlBtn');
            if (btn) { btn.textContent = H.joined ? 'اطلع من القاعة' : 'ادخل القاعة'; btn.classList.toggle('hl-leave', H.joined); }
            const mine = document.getElementById('hlMine'); if (mine) mine.classList.toggle('on', H.joined);
            const seen = {};
            list.forEach((r, i) => {
                seen[r.u] = 1;
                let n = H.nodes[r.u];
                if (!n) {
                    n = document.createElement('div');
                    n.className = 'hl-card hl-in';
                    n.style.animationDelay = Math.min(i, 12) * 45 + 'ms';
                    n.innerHTML = '<div class="hl-av"><div class="hl-fire" aria-hidden="true"><i></i><i></i><i></i></div><div class="hl-ring"></div>' + avatarHtml(r) + '</div>'
                        + '<div class="hl-n">' + esc(r.n) + (this.vb ? this.vb(r.u) : '') + '</div>'
                        + '<div class="hl-g">' + esc(r.g || 'العراق') + '</div><div class="hl-t">00:00</div>';
                    n.dataset.at = r.at;
                    grid.appendChild(n);
                    H.nodes[r.u] = n;
                }
                n.style.order = i;
                n.classList.toggle('me', r.u === me);
            });
            Object.keys(H.nodes).forEach((u) => {
                if (seen[u]) return;
                const n = H.nodes[u]; delete H.nodes[u];
                n.classList.add('hl-out');
                setTimeout(() => n.remove(), 380);
            });
            this._hlTick();
        },

        _hlTick() {
            const now = Date.now();
            Object.keys(H.nodes).forEach((u) => {
                const n = H.nodes[u], r = H.rows[u]; if (!n || !r) return;
                const ms = now - r.at;
                n.querySelector('.hl-t').textContent = clock(ms);
                const t = tier(ms);
                if (n.dataset.tier !== String(t)) { n.dataset.tier = t; n.classList.remove('f0', 'f1', 'f2', 'f3'); n.classList.add('f' + t); }
            });
            const mine = H.rows[this.currentUid()], c = document.getElementById('hlMyClock');
            if (c) c.textContent = mine ? clock(now - mine.at) : '00:00';
        }
    });
})();
