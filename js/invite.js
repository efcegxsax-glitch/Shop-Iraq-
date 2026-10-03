// ادعُ زملاءك: the student's own invite link, ready-made messages in several styles, one-tap share buttons
// (WhatsApp, Telegram, Facebook, X, SMS, any app), a picture card for Instagram / TikTok / Snapchat stories,
// and a counter of the friends who signed up through the link (refJoin/{me}/{friend}, written by the new student).
// Loaded on demand by app._need('invite').
(function () {
    const BASE = 'https://efcegxsax-glitch.github.io/Shop-Iraq-/';
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const $ = (id) => document.getElementById(id);
    const MILES = [[1, 'أول صديق', 'user-plus'], [3, 'سفير', 'megaphone'], [5, 'نجم المدرسة', 'star'], [10, 'قائد', 'crown'], [25, 'أسطورة', 'flame'], [50, 'بطل العراق', 'trophy']];
    const MSG = [
        ['ودّي', (u) => 'شباب وبنات الإعدادية، لكيت تطبيق يفيدكم هواي: أخبار وزارة التربية أولاً بأول، مؤقت دراسة بخلفيات حلوة، غرفة تدرسون بيها وياي أصدقائكم، وإدارة مصاريف ومحاضرات.. كله ببلاش \n' + u],
        ['مختصر', (u) => 'جرّب تطبيق أكـادمي السادس للطلاب، أخبار ودراسة وتحدي ونقاط، ببلاش:\n' + u],
        ['للمجموعات', (u) => 'إعلان للطلاب\nتطبيق "أكـادمي السادس" يجمع لك: أخبار وزارة التربية، مؤقت المذاكرة، جدول المحاضرات، غرفة دراسة جماعية، ومعلم ذكي يساعدك.\nسجّل هسه من هنا:\n' + u],
        ['ستوري', (u) => 'دراستي صارت أحلى مع أكـادمي السادس، حمّله وادرس وياي:\n' + u],
    ];
    const PAL = [['#0f172a', '#2563eb', '#7c3aed'], ['#052e2b', '#0d9488', '#34d399'], ['#3b0764', '#c026d3', '#fb7185'], ['#1c1917', '#ea580c', '#fbbf24'], ['#0c1a3d', '#0891b2', '#60a5fa']];
    const S = { n: null, style: 0, pal: 0, blob: null };

    const link = () => BASE + (app.authUid ? '?ref=' + app.authUid : '');
    const text = () => { const t = $('ivText'); return (t && t.value.trim()) || MSG[S.style][1](link()); };
    const full = () => { const t = text(), l = link(); return t.indexOf(l) >= 0 ? t : t + '\n' + l; };

    function open(url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { location.href = url; } }

    function render() {
        const root = $('ivContent'); if (!root) return;
        const n = S.n == null ? 0 : S.n;
        const next = MILES.find((m) => m[0] > n), prev = MILES.filter((m) => m[0] <= n).pop();
        const pct = next ? Math.round(((n - (prev ? prev[0] : 0)) / (next[0] - (prev ? prev[0] : 0))) * 100) : 100;
        const chans = [
            ['wa', 'واتساب', '#25D366', '<path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-.8.8c-1-.4-2-1.4-2.4-2.4l.8-.8-1-2z"/>'],
            ['tg', 'تلغرام', '#229ED9', '<path d="M21 4 3 11l5 2 2 6 3-4 5 4z"/><path d="m8 13 9-6"/>'],
            ['fb', 'فيسبوك', '#1877F2', '<path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V9H6v3.5h3V21h3.5v-8.5H15L16 9h-3.5V7a1 1 0 0 1 1-1H15z"/>'],
            ['x', 'إكس', '#111827', '<path d="M4 4l16 16M20 4 4 20"/>'],
            ['sms', 'رسالة', '#16A34A', '<path d="M4 5h16v11H9l-5 4z"/>'],
            ['sh', 'تطبيقات ثانية', '#7C3AED', '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.9 7.6-3.8M8.2 13.1l7.6 3.8"/>'],
        ];
        root.innerHTML = `<div class="iv-wrap">
            <div class="iv-hero">
                <div class="iv-hero-ic"><i data-lucide="megaphone"></i></div>
                <b>خلّي زملاءك يدرسون وياك</b>
                <p>كل ما يدخل صديق من رابطك يزيد عدد المسجلين عن طريقك، وتحصل على ألقاب.</p>
                <div class="iv-count"><b>${n}</b><span>صديق دخل من رابطك</span></div>
                <div class="iv-bar"><i style="width:${pct}%"></i></div>
                <small>${next ? 'باقي ' + (next[0] - n) + ' لتصير "' + next[1] + '"' : 'وصلت لأعلى لقب، شكراً لك'}</small>
            </div>
            <div class="iv-box"><div class="iv-lab">رابطك الخاص</div>
                <div class="iv-link"><span dir="ltr" id="ivLink">${esc(link())}</span><button class="btn-press" onclick="app.ivCopy('link')">نسخ</button></div>
            </div>
            <div class="iv-box"><div class="iv-lab">اختار أسلوب الرسالة</div>
                <div class="iv-chips">${MSG.map((m, i) => `<button class="${S.style === i ? 'on' : ''}" onclick="app.ivStyle(${i})">${m[0]}</button>`).join('')}</div>
                <textarea id="ivText" rows="5">${esc(MSG[S.style][1](link()))}</textarea>
                <div class="iv-hint">تكدر تعدل الرسالة قبل ما ترسلها</div>
                <div class="iv-grid">${chans.map((c) => `<button class="iv-ch btn-press" onclick="app.ivShare('${c[0]}')" style="--c:${c[2]}"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c[3]}</svg></span>${c[1]}</button>`).join('')}
                    <button class="iv-ch btn-press" onclick="app.ivCopy('msg')" style="--c:#475569"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></span>نسخ الرسالة</button>
                </div>
            </div>
            <div class="iv-box"><div class="iv-lab">صورة للستوري</div>
                <p class="iv-p">صورة جاهزة تنزلها على انستغرام أو تيك توك أو سناب، وبيها رابطك.</p>
                <div class="iv-card"><canvas id="ivCv" width="540" height="960"></canvas></div>
                <div class="iv-row"><button class="iv-b2 btn-press" onclick="app.ivPal()">غيّر الألوان</button><button class="iv-b2 btn-press pri" onclick="app.ivImg('share')">شارك الصورة</button><button class="iv-b2 btn-press" onclick="app.ivImg('save')">حفظ</button></div>
            </div>
            <div class="iv-box"><div class="iv-lab">الألقاب</div>
                <div class="iv-miles">${MILES.map((m) => `<div class="iv-mi${n >= m[0] ? ' on' : ''}"><i data-lucide="${m[2]}"></i><b>${m[1]}</b><small>${m[0]} صديق</small></div>`).join('')}</div>
            </div>
        </div>`;
        try { lucide.createIcons(); } catch (e) {}
        card();
    }

    function card() {
        const cv = $('ivCv'); if (!cv) return;
        const c = cv.getContext('2d'), W = 1080, H = 1920, p = PAL[S.pal % PAL.length];
        cv.width = W; cv.height = H;
        const g = c.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, p[0]); g.addColorStop(0.55, p[1]); g.addColorStop(1, p[2]);
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        [[0.85, 0.12, 420, 0.16], [0.1, 0.45, 360, 0.1], [0.9, 0.82, 460, 0.14]].forEach((b) => { const rg = c.createRadialGradient(W * b[0], H * b[1], 0, W * b[0], H * b[1], b[2]); rg.addColorStop(0, 'rgba(255,255,255,' + b[3] + ')'); rg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = rg; c.beginPath(); c.arc(W * b[0], H * b[1], b[2], 0, 7); c.fill(); });
        let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        for (let i = 0; i < 70; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.15 + r() * 0.5).toFixed(2) + ')'; c.beginPath(); c.arc(r() * W, r() * H * 0.6, 1.5 + r() * 3, 0, 7); c.fill(); }
        c.direction = 'rtl'; c.textAlign = 'center'; c.fillStyle = '#fff';
        const font = (px, w) => { c.font = (w || 800) + ' ' + px + 'px system-ui, "Segoe UI", Tahoma, Arial, sans-serif'; };
        const draw = (img) => {
            if (img) { c.save(); c.beginPath(); c.arc(W / 2, 360, 140, 0, 7); c.closePath(); c.clip(); c.drawImage(img, W / 2 - 140, 220, 280, 280); c.restore(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 8; c.beginPath(); c.arc(W / 2, 360, 144, 0, 7); c.stroke(); }
            else { c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.arc(W / 2, 360, 140, 0, 7); c.fill(); c.fillStyle = '#fff'; font(150, 900); c.fillText('6', W / 2, 410); }
            c.fillStyle = '#fff'; font(96, 900); c.fillText('أكـادمي السادس', W / 2, 640);
            font(46, 600); c.fillStyle = 'rgba(255,255,255,.88)'; c.fillText('تطبيق طلاب العراق', W / 2, 715);
            const items = ['أخبار وزارة التربية أولاً بأول', 'مؤقت دراسة بـ40 خلفية', 'غرفة دراسة وياي أصدقائك', 'معلم ذكي ومصاريف وجدول', 'مجاني بالكامل'];
            items.forEach((t, i) => {
                const y = 880 + i * 130; c.fillStyle = 'rgba(255,255,255,.16)'; const x0 = 110, w = W - 220; c.beginPath(); c.roundRect ? c.roundRect(x0, y - 62, w, 100, 50) : c.rect(x0, y - 62, w, 100); c.fill();
                c.fillStyle = '#fff'; c.beginPath(); c.arc(W - 170, y - 12, 22, 0, 7); c.fill(); c.strokeStyle = p[1]; c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(W - 181, y - 12); c.lineTo(W - 173, y - 3); c.lineTo(W - 158, y - 22); c.stroke();
                c.fillStyle = '#fff'; font(48, 700); c.textAlign = 'right'; c.fillText(t, W - 215, y + 2); c.textAlign = 'center';
            });
            c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.roundRect ? c.roundRect(120, 1590, W - 240, 130, 65) : c.rect(120, 1590, W - 240, 130); c.fill();
            c.fillStyle = p[0]; font(52, 900); c.fillText('حمّله وادرس وياي', W / 2, 1672);
            c.direction = 'ltr'; c.fillStyle = 'rgba(255,255,255,.9)'; font(30, 600);
            let u = BASE.replace('https://', ''); c.fillText(u, W / 2, 1790);
        };
        const im = new Image(); im.onload = () => { draw(im); }; im.onerror = () => draw(null); im.src = 'icons/icon-192.png';
        draw(null);
    }

    Object.assign(app, {
        ivOpen() {
            S.n = null; render();
            const { ref, get } = window.firebaseDbHelpers || {};
            if (window.firebaseDb && this.authUid && get) {
                get(ref(window.firebaseDb, 'refJoin/' + this.authUid)).then((snap) => { S.n = Object.keys(snap.val() || {}).length; if (this.currentView === 'inviteView') render(); }).catch(() => { S.n = 0; });
            } else S.n = 0;
        },
        ivClose() { const c = $('ivContent'); if (c) c.innerHTML = ''; },
        ivStyle(i) { S.style = i; const t = $('ivText'); if (t) t.value = MSG[i][1](link()); document.querySelectorAll('.iv-chips button').forEach((b, k) => b.classList.toggle('on', k === i)); },
        ivPal() { S.pal++; card(); },
        ivCopy(what) {
            const v = what === 'link' ? link() : full();
            const done = () => this.showToast(what === 'link' ? 'اننسخ رابطك' : 'اننسخت الرسالة، الصقها وين ما تريد');
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done).catch(() => this.showToast('تعذر النسخ'));
            else { const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { this.showToast('تعذر النسخ'); } t.remove(); }
        },
        async ivShare(ch) {
            const m = full(), enc = encodeURIComponent, l = link();
            if (ch === 'wa') open('https://wa.me/?text=' + enc(m));
            else if (ch === 'tg') open('https://t.me/share/url?url=' + enc(l) + '&text=' + enc(m.replace(l, '').trim()));
            else if (ch === 'fb') open('https://www.facebook.com/sharer/sharer.php?u=' + enc(l) + '&quote=' + enc(m.replace(l, '').trim()));
            else if (ch === 'x') open('https://twitter.com/intent/tweet?text=' + enc(m.replace(l, '').trim()) + '&url=' + enc(l));
            else if (ch === 'sms') location.href = 'sms:?&body=' + enc(m);
            else {
                try { if (navigator.share) await navigator.share({ title: 'أكـادمي السادس', text: m.replace(l, '').trim(), url: l }); else this.ivCopy('msg'); } catch (e) { if (e && e.name !== 'AbortError') this.showToast('تعذرت المشاركة'); }
            }
        },
        ivImg(mode) {
            const cv = $('ivCv'); if (!cv) return;
            cv.toBlob(async (blob) => {
                if (!blob) { this.showToast('تعذر تجهيز الصورة'); return; }
                const file = new File([blob], 'academy6-invite.png', { type: 'image/png' });
                if (mode === 'share' && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try { await navigator.share({ files: [file], title: 'أكـادمي السادس', text: full() }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
                }
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'academy6-invite.png'; document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 4000);
                this.showToast(mode === 'share' ? 'نزلت الصورة، انشرها من المعرض' : 'انحفظت الصورة');
            }, 'image/png');
        },
    });
})();
