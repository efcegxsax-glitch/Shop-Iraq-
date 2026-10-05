// خطة الأسبوع: the tutor writes a 7-day study plan from the student's own report (exams, marks, timetable, mistakes notebook), through
// the tutor Worker (mode "plan"). The plan is kept on the phone (isp_plan_<uid>) with what has been ticked off. Loaded by app._need('plan').
(function () {
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const $ = (id) => document.getElementById(id);
    const NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const key = () => 'isp_plan_' + (app.authUid || 'guest');
    const load = () => { try { const p = JSON.parse(localStorage.getItem(key()) || 'null'); return p && Array.isArray(p.days) ? p : null; } catch (e) { return null; } };
    const save = (p) => { try { localStorage.setItem(key(), JSON.stringify(p)); } catch (e) {} };
    let S = { busy: false, hours: 2, note: '', err: '' };

    function paint() {
        const box = $('planContent'); if (!box) return;
        const p = load(), today = app.localDateStr();
        const controls = `<div class="pl-ctl">
            <label>كم ساعة تكدر تدرس باليوم؟
                <select id="plHours" onchange="app.plHours(this.value)">${[1, 2, 3, 4, 5, 6].map((h) => `<option value="${h}"${S.hours === h ? ' selected' : ''}>${h}</option>`).join('')}</select>
            </label>
            <input id="plNote" maxlength="200" placeholder="ملاحظة للمعلم (اختياري): مثلاً ضعيف بالفيزياء" value="${esc(S.note)}" oninput="app.plNote(this.value)">
            <button class="pl-go" ${S.busy ? 'disabled' : ''} onclick="app.plMake()">${S.busy ? 'المعلم يرتب خطتك...' : p ? 'سوّي خطة جديدة' : 'سوّي خطتي'}</button>
            ${S.err ? `<p class="pl-err">${esc(S.err)}</p>` : ''}
        </div>`;
        if (!p) { box.innerHTML = controls + '<div class="pl-empty"><i data-lucide="calendar-check"></i><b>ما عندك خطة لسه</b><p>المعلم يقرأ جدول محاضراتك وامتحاناتك ودرجاتك ويكتبلك شنو تدرس كل يوم.</p></div>'; try { lucide.createIcons(); } catch (e) {} return; }
        let total = 0, done = 0;
        p.days.forEach((d, i) => d.tasks.forEach((t, j) => { total++; if (p.done && p.done[i + '_' + j]) done++; }));
        const old = p.days.length && p.days[p.days.length - 1].date < today;
        const pct = total ? Math.round(done / total * 100) : 0;
        box.innerHTML = controls
            + (old ? '<p class="pl-old">هاي الخطة انتهت، سوّي خطة جديدة للأسبوع الجاي.</p>' : '')
            + `<div class="pl-sum"><b>${esc(p.summary || 'خطتك')}</b><div class="pl-bar"><i style="width:${pct}%"></i></div><small>${done} من ${total} مهمة ${pct === 100 ? '- ممتاز، خلصت الخطة' : ''}</small></div>`
            + p.days.map((d, i) => `<div class="pl-day${d.date === today ? ' today' : ''}${d.date < today ? ' past' : ''}"><div class="pl-dh"><b>${esc(d.d)}</b><span>${esc(d.date)}${d.date === today ? ' . اليوم' : ''}</span></div>${d.tasks.length ? d.tasks.map((t, j) => `<label class="pl-t${p.done && p.done[i + '_' + j] ? ' on' : ''}"><input type="checkbox" ${p.done && p.done[i + '_' + j] ? 'checked' : ''} onchange="app.plTick(${i}, ${j}, this.checked)"><span><b>${esc(t.s)}</b>${esc(t.t)}</span><em>${t.m} د</em></label>`).join('') : '<p class="pl-rest">يوم راحة</p>'}</div>`).join('');
        try { lucide.createIcons(); } catch (e) {}
    }

    Object.assign(app, {
        plOpen() { paint(); },
        plHours(v) { S.hours = Math.max(1, Math.min(6, Number(v) || 2)); },
        plNote(v) { S.note = String(v || '').slice(0, 200); },
        plTick(i, j, on) {
            const p = load(); if (!p) return;
            p.done = p.done || {};
            if (on) p.done[i + '_' + j] = 1; else delete p.done[i + '_' + j];
            save(p); paint();
        },
        async plMake() {
            if (S.busy) return;
            S.busy = true; S.err = ''; paint();
            try {
                await this._need('tutor');
                const days = [];
                for (let i = 0; i < 7; i++) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i); days.push({ date: this.localDateStr(d), name: NAMES[d.getDay()] }); }
                const context = await this._ttContext().catch(() => '');
                const r = await this._ttPost({ mode: 'plan', days, hours: S.hours, note: S.note, context });
                if (!r || !Array.isArray(r.days)) throw new Error('bad');
                save({ at: Date.now(), summary: String(r.summary || ''), hours: S.hours, days: r.days.map((d) => ({ date: String(d.date), d: String(d.d), tasks: Array.isArray(d.tasks) ? d.tasks : [] })), done: {} });
            } catch (e) {
                const c = e && e.code;
                S.err = c === 'busy' ? 'المعلم مشغول هسه، جرّب بعد شوية' : c === 'off' ? 'المعلم مو متاح هسه' : navigator.onLine === false ? 'ما أكو نت' : 'ما كدرت أسوي الخطة، جرّب مرة ثانية';
            }
            S.busy = false; paint();
        },
    });
})();
