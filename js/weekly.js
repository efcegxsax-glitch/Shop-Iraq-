// ملخص الأسبوع للأهل: the student's own week, from what the app recorded (study days, minutes,
// sessions, tasks, streak, marks, exams, tutor quizzes), as a message in the student's voice and a
// picture card, to send to the family by WhatsApp or any app. It is the student who decides what is
// in it (each part can be switched off, with a note of their own) and who sends it; nothing is
// sent anywhere by the app itself. Marks never leave the phone unless the student shares them.
// Kept on the phone: isp:wk:<uid> = { grades, exams, quiz, note }.
// Loaded on demand by app._need('weekly').
(function () {
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const DAY = 86400000;
    const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
    const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
    const dstr = (d) => d.getDate() + ' ' + MONTHS[d.getMonth()];
    const hm = (m) => {
        m = Math.round(m);
        const h = Math.floor(m / 60), r = m % 60;
        return h ? (h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h + ' ساعات') + (r ? ' و' + r + ' دقيقة' : '') : m + ' دقيقة';
    };

    Object.assign(app, {
        wkOpen() {
            this._wk = this._wk || {};
            this._wkRender(true);
        },

        _wkPrefs() {
            let p = null;
            try { p = JSON.parse(localStorage.getItem('isp:wk:' + (this.authUid || 'guest')) || 'null'); } catch (e) {}
            return Object.assign({ grades: true, exams: true, quiz: true, note: '' }, p && typeof p === 'object' ? p : {});
        },
        _wkSavePrefs(p) { try { localStorage.setItem('isp:wk:' + (this.authUid || 'guest'), JSON.stringify(p)); } catch (e) {} },

        // The week ending today, and the one before it, from the recorded activity.
        async _wkData() {
            const d = await this._ttStudyData();
            const act = d.activity || {}, now = new Date();
            const pick = (offset) => {
                const out = [];
                for (let i = 6; i >= 0; i--) {
                    const dt = new Date(now); dt.setDate(now.getDate() - offset - i);
                    const a = act[this.localDateStr(dt)] || {};
                    out.push({ d: dt, name: DAYS[dt.getDay()], min: a.minutes || 0, ses: a.studySessions || 0, tasks: Math.max(0, a.tasksDone || 0), pts: a.points || 0 });
                }
                return out;
            };
            const days = pick(0), prev = pick(7);
            const sum = (list, k) => list.reduce((a, x) => a + x[k], 0);
            const studied = (x) => x.ses > 0 || x.min > 0 || x.tasks > 0;
            const t = { days: days.filter(studied).length, min: sum(days, 'min'), ses: sum(days, 'ses'), tasks: sum(days, 'tasks'), pts: sum(days, 'pts') };
            const pt = { days: prev.filter(studied).length, min: sum(prev, 'min'), ses: sum(prev, 'ses'), tasks: sum(prev, 'tasks') };
            // marks: the latest mark of each subject, and what changed since the one before
            const g = d.grades || {}, marks = [];
            (g.subjects || []).forEach((s) => {
                const vals = this._gradeSeries(g, s).map((v, i) => (v === null ? null : { v, i })).filter(Boolean);
                if (!vals.length) return;
                const last = vals[vals.length - 1], before = vals[vals.length - 2];
                marks.push({ s, v: last.v, p: this.GRADE_PERIODS[last.i][1], diff: before ? last.v - before.v : null });
            });
            marks.sort((a, b) => b.v - a.v);
            const exams = (d.exams || []).map((x) => ({ s: String(x.subject || ''), days: Math.ceil((new Date(x.date).getTime() - Date.now()) / DAY) }))
                .filter((x) => x.s && x.days >= 0 && x.days <= 21).sort((a, b) => a.days - b.days).slice(0, 3);
            const quizzes = (this._ttQuizLog ? this._ttQuizLog() : []).filter((q) => Date.now() - q.t < 7 * DAY);
            const u = this.currentUser || {};
            return { days, t, pt, marks, exams, quizzes, streak: u.loginStreak || 0, name: u.fullName || '', from: days[0].d, to: days[6].d };
        },

        async _wkRender(first) {
            const box = document.getElementById('wkContent');
            if (!box) return;
            if (!this.isLoggedIn) { box.innerHTML = '<div class="wk-wrap"><p class="wk-empty">سجّل دخول حتى يطلعلك ملخصك.</p></div>'; return; }
            if (first) box.innerHTML = '<div class="wk-wrap"><div class="id-load"><i></i><i></i></div></div>';
            let r;
            try { r = await this._wkData(); } catch (e) { box.innerHTML = '<div class="wk-wrap"><p class="wk-empty">ما كدرت أجيب بياناتك، تأكد من النت وحاول مرة ثانية.</p></div>'; return; }
            if (this.currentView !== 'weeklyView') return;
            this._wk.r = r;
            const p = this._wkPrefs(), t = r.t, pt = r.pt;
            const hasMin = t.min > 0;
            const max = Math.max(1, ...r.days.map((x) => (hasMin ? x.min : x.ses)));
            const delta = hasMin && pt.min > 0 ? t.min - pt.min : null;
            const sec = (key, title, on, body) => `<div class="wk-sec${on ? '' : ' off'}"><label class="wk-sw"><span><b>${title}</b></span><input type="checkbox" ${on ? 'checked' : ''} onchange="app.wkSet('${key}', this.checked)"><i></i></label>${on ? body : ''}</div>`;
            box.innerHTML = `<div class="wk-wrap">
                <div class="wk-card">
                    <div class="wk-top"><b>ملخص أسبوعي</b><small>${dstr(r.from)} إلى ${dstr(r.to)}</small></div>
                    <div class="wk-tiles">
                        <div><b>${t.days}<small>/7</small></b><span>يوم دراسة</span></div>
                        <div><b>${hasMin ? (t.min / 60).toFixed(t.min >= 600 ? 0 : 1).replace(/\.0$/, '') : t.ses}</b><span>${hasMin ? 'ساعة' : 'جلسة'}</span></div>
                        <div><b>${t.tasks}</b><span>مهمة</span></div>
                    </div>
                    <div class="wk-bars">${r.days.map((x) => { const v = hasMin ? x.min : x.ses; return `<div><i style="height:${Math.max(6, (v / max) * 100)}%" class="${v ? 'on' : ''}"></i><small>${x.name}</small></div>`; }).join('')}</div>
                    ${delta !== null ? `<p class="wk-delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? 'أكثر' : 'أقل'} من الأسبوع اللي قبله بـ ${hm(Math.abs(delta))}</p>` : ''}
                    ${!hasMin && t.ses ? '<p class="wk-delta">الدقائق تنحسب من هسه وطالع، وهالأسبوع نعرض الجلسات.</p>' : ''}
                    ${r.streak > 1 ? `<p class="wk-streak">${r.streak} أيام دخول متتالية</p>` : ''}
                </div>

                ${sec('grades', 'الدرجات', p.grades, r.marks.length ? `<div class="wk-list">${r.marks.slice(0, 6).map((m) => `<div><span>${esc(m.s)}</span><b>${m.v}</b>${m.diff ? `<em class="${m.diff > 0 ? 'up' : 'down'}">${m.diff > 0 ? '+' : ''}${m.diff}</em>` : ''}</div>`).join('')}</div>` : '<p class="wk-empty">ما مسجل درجات بصفحة "تطور درجاتي".</p>')}
                ${sec('exams', 'الامتحانات القريبة', p.exams, r.exams.length ? `<div class="wk-list">${r.exams.map((x) => `<div><span>${esc(x.s)}</span><b>${x.days === 0 ? 'اليوم' : 'بعد ' + x.days + ' يوم'}</b></div>`).join('')}</div>` : '<p class="wk-empty">ماكو امتحان خلال 3 أسابيع.</p>')}
                ${sec('quiz', 'اختبارات المعلم', p.quiz, r.quizzes.length ? `<div class="wk-list">${r.quizzes.slice(-4).map((q) => `<div><span>${esc(q.s)}</span><b>${q.r}/${q.n}</b></div>`).join('')}</div>` : '<p class="wk-empty">ما حليت اختبار هالأسبوع.</p>')}

                <div class="wk-sec"><label class="wk-note"><span>تريد تكتب شي لأهلك؟ (اختياري)</span><textarea id="wkNote" rows="2" maxlength="200" placeholder="مثلاً: الأسبوع الجاي راح أركز على الفيزياء" oninput="app.wkNote(this.value)">${esc(p.note)}</textarea></label></div>

                <div class="wk-prev"><b>الرسالة اللي راح تنرسل</b><pre id="wkText">${esc(this._wkText(r, p))}</pre></div>
                <div class="wk-btns">
                    <button class="wk-wa" onclick="app.wkWhatsApp()"><i data-lucide="send"></i>أرسلها بالواتساب</button>
                    <button class="wk-soft" onclick="app.wkShareImage()"><i data-lucide="image"></i>صورة</button>
                    <button class="wk-soft" onclick="app.wkCopy()" aria-label="انسخ"><i data-lucide="copy"></i></button>
                </div>
                <p class="wk-small">ما يتدز شي من التطبيق وحده. انت تختار شنو يطلع وانت تدزه.</p>
            </div>`;
            lucide.createIcons();
        },

        wkSet(k, v) {
            const p = this._wkPrefs();
            p[k] = !!v;
            this._wkSavePrefs(p);
            this._wkRender();
        },
        wkNote(v) {
            const p = this._wkPrefs();
            p.note = String(v || '').slice(0, 200);
            this._wkSavePrefs(p);
            const pre = document.getElementById('wkText');
            if (pre && this._wk && this._wk.r) pre.textContent = this._wkText(this._wk.r, p);
        },

        // The message, in the student's own voice.
        _wkText(r, p) {
            const t = r.t, L = [];
            L.push('السلام عليكم');
            L.push('هذا ملخص دراستي بالأسبوع (من ' + dstr(r.from) + ' إلى ' + dstr(r.to) + ') من تطبيق أكـادمي السادس:');
            L.push('');
            L.push('- درست ' + t.days + (t.days === 1 ? ' يوم' : t.days <= 10 && t.days > 2 ? ' أيام' : ' يوم') + ' من 7');
            if (t.min > 0) L.push('- وكت الدراسة: ' + hm(t.min) + (t.ses ? ' (' + t.ses + (t.ses > 2 && t.ses <= 10 ? ' جلسات' : ' جلسة') + ')' : ''));
            else if (t.ses) L.push('- جلسات الدراسة: ' + t.ses);
            if (t.tasks) L.push('- خلصت ' + t.tasks + (t.tasks > 2 && t.tasks <= 10 ? ' مهام' : ' مهمة'));
            if (r.streak > 1) L.push('- دخلت التطبيق ' + r.streak + ' أيام ورا بعض');
            if (r.pt.min > 0 && t.min > 0) {
                const d = t.min - r.pt.min;
                if (Math.abs(d) >= 10) L.push('- ' + (d > 0 ? 'أكثر' : 'أقل') + ' من الأسبوع اللي قبله بـ ' + hm(Math.abs(d)));
            }
            if (p.quiz && r.quizzes.length) L.push('- حليت ' + r.quizzes.length + (r.quizzes.length > 2 ? ' اختبارات' : ' اختبار') + ' بالمعلم: ' + r.quizzes.slice(-3).map((q) => q.s + ' ' + q.r + '/' + q.n).join('، '));
            if (p.grades && r.marks.length) L.push('- درجاتي: ' + r.marks.slice(0, 5).map((m) => m.s + ' ' + m.v).join('، '));
            if (p.exams && r.exams.length) L.push('- امتحاناتي القريبة: ' + r.exams.map((x) => x.s + (x.days === 0 ? ' اليوم' : ' بعد ' + x.days + ' يوم')).join('، '));
            if (p.note && p.note.trim()) { L.push(''); L.push(p.note.trim()); }
            return L.join('\n');
        },

        wkWhatsApp() {
            if (!this._wk || !this._wk.r) return;
            const text = this._wkText(this._wk.r, this._wkPrefs());
            window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
        },
        wkCopy() {
            if (!this._wk || !this._wk.r) return;
            const text = this._wkText(this._wk.r, this._wkPrefs());
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => this.showToast('انسخت الرسالة')).catch(() => this.showToast('ما كدرت أنسخ'));
            else this.showToast('ما كدرت أنسخ');
        },

        // The picture card (canvas), shared with the phone's own share sheet, or saved.
        async wkShareImage() {
            if (!this._wk || !this._wk.r) return;
            this.showToast('جاي أسوي الصورة...');
            let blob;
            try { blob = await this._wkCanvas(this._wk.r, this._wkPrefs()); } catch (e) { this.showToast('ما كدرت أسوي الصورة'); return; }
            if (!blob) { this.showToast('ما كدرت أسوي الصورة'); return; }
            const file = new File([blob], 'ملخص-الاسبوع.png', { type: 'image/png' });
            try {
                if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: 'ملخص دراستي بالأسبوع' }); return; }
            } catch (e) { if (e && e.name === 'AbortError') return; }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = 'ملخص-الاسبوع.png';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            this.showToast('انحفظت الصورة، ارسلها من المعرض');
        },
        async _wkCanvas(r, p) {
            try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
            const W = 1080, PAD = 64, F = '"Readex Pro", Tahoma, Arial, sans-serif';
            const rows = [];
            if (p.grades && r.marks.length) rows.push(['الدرجات', r.marks.slice(0, 5).map((m) => [m.s, String(m.v)])]);
            if (p.exams && r.exams.length) rows.push(['الامتحانات القريبة', r.exams.map((x) => [x.s, x.days === 0 ? 'اليوم' : 'بعد ' + x.days + ' يوم'])]);
            if (p.quiz && r.quizzes.length) rows.push(['اختبارات المعلم', r.quizzes.slice(-3).map((q) => [q.s, q.r + '/' + q.n])]);
            const note = p.note && p.note.trim() ? p.note.trim() : '';
            const rowCount = rows.reduce((a, x) => a + 1 + x[1].length, 0);
            const H = 1030 + rowCount * 64 + (note ? 170 : 0) + 110;
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            const x = c.getContext('2d');
            x.direction = 'rtl'; x.textBaseline = 'alphabetic';
            const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#F1F5F3'); bg.addColorStop(1, '#E2EEE9');
            x.fillStyle = bg; x.fillRect(0, 0, W, H);
            // header
            const hg = x.createLinearGradient(0, 0, W, 330); hg.addColorStop(0, '#0F766E'); hg.addColorStop(1, '#134E4A');
            x.fillStyle = hg; x.fillRect(0, 0, W, 330);
            x.fillStyle = '#fff'; x.textAlign = 'right';
            x.font = '800 62px ' + F; x.fillText('ملخص الأسبوع', W - PAD, 140);
            x.font = '500 34px ' + F; x.globalAlpha = 0.9;
            x.fillText(dstr(r.from) + ' إلى ' + dstr(r.to), W - PAD, 205);
            if (r.name) x.fillText(r.name, W - PAD, 262);
            x.globalAlpha = 1;
            // tiles
            const t = r.t, hasMin = t.min > 0;
            const tiles = [[String(t.days) + '/7', 'يوم دراسة'], [hasMin ? (t.min / 60).toFixed(1).replace(/\.0$/, '') : String(t.ses), hasMin ? 'ساعة' : 'جلسة'], [String(t.tasks), 'مهمة']];
            const tw = (W - PAD * 2 - 40) / 3;
            tiles.forEach((tl, i) => {
                const tx = W - PAD - (i + 1) * tw - i * 20, ty = 380;
                x.fillStyle = '#fff'; this._wkRound(x, tx, ty, tw, 190, 30); x.fill();
                x.textAlign = 'center'; x.fillStyle = '#0F766E'; x.font = '800 74px ' + F; x.fillText(tl[0], tx + tw / 2, ty + 100);
                x.fillStyle = '#5B6E69'; x.font = '500 30px ' + F; x.fillText(tl[1], tx + tw / 2, ty + 152);
            });
            // week bars
            const by = 620, bh = 230, max = Math.max(1, ...r.days.map((d) => (hasMin ? d.min : d.ses)));
            x.fillStyle = '#fff'; this._wkRound(x, PAD, by - 30, W - PAD * 2, bh + 130, 30); x.fill();
            const bw = (W - PAD * 2 - 80) / 7;
            r.days.forEach((d, i) => {
                const v = hasMin ? d.min : d.ses, h = Math.max(10, (v / max) * bh);
                const bx = W - PAD - 40 - (i + 1) * bw + 14;
                x.fillStyle = v ? '#14B8A6' : '#E2E8F0'; this._wkRound(x, bx, by + bh - h, bw - 28, h, 12); x.fill();
                x.fillStyle = '#5B6E69'; x.textAlign = 'center'; x.font = '500 26px ' + F; x.fillText(d.name, bx + (bw - 28) / 2, by + bh + 48);
            });
            let y = by + bh + 170;
            x.textAlign = 'right';
            if (r.streak > 1) { x.fillStyle = '#B45309'; x.font = '700 34px ' + F; x.fillText(r.streak + ' أيام دخول متتالية', W - PAD, y); y += 70; }
            rows.forEach(([title, list]) => {
                x.fillStyle = '#0F766E'; x.font = '800 36px ' + F; x.textAlign = 'right'; x.fillText(title, W - PAD, y); y += 64;
                list.forEach(([a, b]) => {
                    x.fillStyle = '#0E1F1B'; x.font = '600 34px ' + F; x.textAlign = 'right'; x.fillText(a, W - PAD, y);
                    x.fillStyle = '#0F766E'; x.font = '800 36px ' + F; x.textAlign = 'left'; x.fillText(b, PAD, y); y += 64;
                });
                y += 6;
            });
            if (note) {
                x.fillStyle = '#fff'; this._wkRound(x, PAD, y - 20, W - PAD * 2, 140, 26); x.fill();
                x.fillStyle = '#0E1F1B'; x.font = '500 32px ' + F; x.textAlign = 'right';
                this._wkWrap(x, note, W - PAD * 2 - 60).slice(0, 2).forEach((ln, i) => x.fillText(ln, W - PAD - 30, y + 38 + i * 50));
                y += 150;
            }
            x.fillStyle = '#5B6E69'; x.font = '500 28px ' + F; x.textAlign = 'center';
            x.fillText('أكـادمي السادس', W / 2, H - 50);
            return new Promise((ok) => c.toBlob((b) => ok(b), 'image/png'));
        },
        _wkRound(x, px, py, w, h, r) {
            x.beginPath();
            x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
            x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
        },
        _wkWrap(x, text, maxW) {
            const words = text.split(/\s+/), lines = [];
            let cur = '';
            words.forEach((w) => {
                const t = cur ? cur + ' ' + w : w;
                if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
            });
            if (cur) lines.push(cur);
            return lines;
        },
    });
})();
