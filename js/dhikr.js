// روحانيات: prayer beads (tap to count, a ring of beads that fills, a round per target),
// a daily istighfar goal, duas from the Quran and well-known narrations that calm the heart,
// small deeds that ease the soul (with a guided "breathe and remember" exercise), and
// Ramadan: deeds, a daily checklist and a 30-part Quran tracker. The panel can switch the whole
// page off (siteConfig/features/dhikr = false). Kept on the phone: isp:dk:<uid>.
// Loaded on demand by app._need('dhikr').
(function () {
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const DHIKR = [
        ['istighfar', 'أستغفر الله وأتوب إليه', 100],
        ['subhan', 'سبحان الله', 33],
        ['hamd', 'الحمد لله', 33],
        ['akbar', 'الله أكبر', 34],
        ['tahlil', 'لا إله إلا الله', 100],
        ['hawqala', 'لا حول ولا قوة إلا بالله', 33],
        ['salawat', 'اللهم صل على محمد وآل محمد', 100],
        ['subhanbi', 'سبحان الله وبحمده سبحان الله العظيم', 100],
    ];
    const TABS = [['beads', 'المسبحة', 'circle-dot'], ['duas', 'أدعية', 'hand-heart'], ['calm', 'تريح النفس', 'leaf'], ['ramadan', 'رمضان', 'moon-star']];
    // [text, source]
    const VERSES = [
        ['ألا بذكر الله تطمئن القلوب', 'الرعد 28'],
        ['فإن مع العسر يسرا، إن مع العسر يسرا', 'الشرح 5-6'],
        ['لا يكلف الله نفسا إلا وسعها', 'البقرة 286'],
        ['ومن يتوكل على الله فهو حسبه', 'الطلاق 3'],
        ['ولا تيأسوا من روح الله', 'يوسف 87'],
        ['وما توفيقي إلا بالله عليه توكلت وإليه أنيب', 'هود 88'],
        ['واصبر وما صبرك إلا بالله', 'النحل 127'],
        ['ادعوني أستجب لكم', 'غافر 60'],
    ];
    const DUAS = [
        ['study', 'للدراسة والامتحان', 'graduation-cap', [
            ['رب اشرح لي صدري، ويسر لي أمري، واحلل عقدة من لساني، يفقهوا قولي', 'طه 25-28'],
            ['رب زدني علما', 'طه 114'],
            ['اللهم لا سهل إلا ما جعلته سهلا، وأنت تجعل الحزن إذا شئت سهلا', 'دعاء مأثور'],
            ['وما توفيقي إلا بالله عليه توكلت وإليه أنيب', 'هود 88'],
        ]],
        ['worry', 'للهم والضيق', 'cloud-rain', [
            ['لا إله إلا أنت سبحانك إني كنت من الظالمين', 'الأنبياء 87'],
            ['اللهم إني أعوذ بك من الهم والحزن، والعجز والكسل', 'دعاء مأثور عن النبي (ص)'],
            ['يا حي يا قيوم برحمتك أستغيث', 'دعاء مأثور عن النبي (ص)'],
            ['حسبنا الله ونعم الوكيل', 'آل عمران 173'],
            ['وأفوض أمري إلى الله إن الله بصير بالعباد', 'غافر 44'],
        ]],
        ['peace', 'للطمأنينة والثبات', 'heart', [
            ['ربنا لا تزغ قلوبنا بعد إذ هديتنا وهب لنا من لدنك رحمة إنك أنت الوهاب', 'آل عمران 8'],
            ['حسبي الله لا إله إلا هو عليه توكلت وهو رب العرش العظيم', 'التوبة 129'],
            ['ربنا أفرغ علينا صبرا وتوفنا مسلمين', 'الأعراف 126'],
            ['رب إني لما أنزلت إلي من خير فقير', 'القصص 24'],
        ]],
        ['family', 'للأهل والخير', 'users', [
            ['رب ارحمهما كما ربياني صغيرا', 'الإسراء 24'],
            ['ربنا آتنا في الدنيا حسنة وفي الآخرة حسنة وقنا عذاب النار', 'البقرة 201'],
            ['رب أوزعني أن أشكر نعمتك التي أنعمت علي وعلى والدي', 'النمل 19'],
            ['ربنا تقبل منا إنك أنت السميع العليم', 'البقرة 127'],
        ]],
    ];
    const CALM = [
        ['breathe', 'تنفّس وذكر', 'wind', 'دقيقتين: تاخذ نفس ويا "سبحان الله"، تثبت ويا "الحمد لله"، وتطلعه بهدوء ويا "الله أكبر". يهدي القلب قبل الدراسة أو الامتحان.', 'breathe'],
        ['istighfar', '100 استغفار', 'sparkles', 'الاستغفار يريح القلب ويفتح الأبواب. خلّصها بالمسبحة.', 'istighfar'],
        ['wudu', 'توضّا', 'droplets', 'الماي البارد والوضوء يجددون نشاطك ويهدون أعصابك.', ''],
        ['pray', 'صلّي ركعتين بهدوء', 'sunrise', 'خذلك دقايق بعيد عن التلفون، وحجي ويا الله باللي بقلبك.', ''],
        ['sharh', 'اقرأ سورة الشرح', 'book-open', 'سورة قصيرة نزلت لتطمين القلب.', 'sharh'],
        ['sadaqa', 'تصدّق ولو بالقليل', 'hand-coins', 'الصدقة تريح النفس قبل ما تفيد غيرك.', ''],
        ['parents', 'اسأل على أهلك', 'phone', 'كلمة حلوة لأمك أو أبوك تفرق ويا يومك ويومهم.', ''],
        ['walk', 'امشِ وتأمل', 'footprints', 'عشر دقايق مشي وتفكر بخلق الله تصفّي الذهن.', ''],
        ['kind', 'كلمة طيبة وابتسامة', 'smile', 'الكلمة الطيبة صدقة، وأول من يرتاح بيها انت.', ''],
    ];
    const SHARH = ['ألم نشرح لك صدرك', 'ووضعنا عنك وزرك', 'الذي أنقض ظهرك', 'ورفعنا لك ذكرك', 'فإن مع العسر يسرا', 'إن مع العسر يسرا', 'فإذا فرغت فانصب', 'وإلى ربك فارغب'];
    const RMD_DAY = [['fast', 'صمت اليوم', 'moon'], ['quran', 'قريت جزء من القرآن', 'book-open'], ['prayer', 'صليت بوقتها', 'sunrise'], ['dua', 'دعيت عند الإفطار', 'hand-heart'], ['give', 'تصدقت أو فطّرت صائم', 'hand-coins'], ['family', 'ساعدت أهلي', 'house']];
    const RMD_DEEDS = [
        ['الصيام بحفظ اللسان والعين', 'مو بس عن الأكل، حتى عن الكلام الجارح والغيبة.'],
        ['ختمة القرآن', 'جزء باليوم يخلصلك ختمة كاملة بالشهر. علّمها تحت.'],
        ['الصلاة وقيام الليل', 'ركعات بالليل ولو قليلة، والقلب حاضر.'],
        ['الدعاء', 'للصائم دعوة ما ترد، خصوصاً وقت الإفطار.'],
        ['الصدقة وإفطار الصائم', 'ولو بتمرة أو كوب ماي.'],
        ['صلة الرحم', 'زور أهلك وأقاربك، واتصل بالبعيدين.'],
        ['السحور', 'ولو بتمرة وماي، يقويك على الصيام والدراسة.'],
        ['العشر الأواخر وليلة القدر', 'اجتهد بيها بالدعاء والعبادة، خير من ألف شهر.'],
    ];
    const RMD_DUAS = [
        ['اللهم لك صمت وعلى رزقك أفطرت', 'دعاء الإفطار، مأثور'],
        ['اللهم إنك عفو تحب العفو فاعف عني', 'دعاء ليلة القدر، مأثور عن النبي (ص)'],
        ['ربنا تقبل منا إنك أنت السميع العليم', 'البقرة 127'],
    ];

    // the Hijri date from the phone's calendar (Umm al-Qura); the start of Ramadan is by sighting
    function hijri(d) {
        try {
            const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
            const g = (t) => Number((parts.find((p) => p.type === t) || {}).value);
            return { d: g('day'), m: g('month'), y: g('year') };
        } catch (e) { return null; }
    }

    Object.assign(app, {
        dkOpen() {
            this._dk = this._dk || { tab: 'beads', dua: 'study' };
            this._dkRender();
        },
        dkClose() { this._dkStopBreath(); },
        dkTab(t) { this._dk.tab = t; this._dkStopBreath(); this._dkRender(); window.scrollTo(0, 0); },

        _dkKey() { return 'isp:dk:' + (this.authUid || 'guest'); },
        _dkGet() {
            let o = null;
            try { o = JSON.parse(localStorage.getItem(this._dkKey()) || 'null'); } catch (e) {}
            o = o && typeof o === 'object' ? o : {};
            o.mode = DHIKR.some((x) => x[0] === o.mode) ? o.mode : 'istighfar';
            o.cur = Number(o.cur) || 0; o.rounds = Number(o.rounds) || 0;
            o.total = o.total || {}; o.days = o.days || {}; o.deeds = o.deeds || {}; o.rmd = o.rmd || {};
            return o;
        },
        _dkSave(o) {
            const keep = Object.keys(o.days).sort().slice(-30);
            Object.keys(o.days).forEach((d) => { if (!keep.includes(d)) delete o.days[d]; });
            const keepD = Object.keys(o.deeds).sort().slice(-7);
            Object.keys(o.deeds).forEach((d) => { if (!keepD.includes(d)) delete o.deeds[d]; });
            try { localStorage.setItem(this._dkKey(), JSON.stringify(o)); } catch (e) {}
        },
        _dkToday() { return this.localDateStr(new Date()); },

        _dkRender() {
            const box = document.getElementById('dkContent');
            if (!box || !this._dk) return;
            const t = this._dk.tab;
            const v = VERSES[Number(this._dkToday().replace(/-/g, '')) % VERSES.length];
            box.innerHTML = `<div class="dk-wrap">
                <div class="dk-verse"><span class="dk-star"></span><p>${esc(v[0])}</p><small>${esc(v[1])}</small></div>
                <div class="dk-tabs">${TABS.map(([k, n, ic]) => `<button class="${t === k ? 'on' : ''}" onclick="app.dkTab('${k}')"><i data-lucide="${ic}"></i>${n}</button>`).join('')}</div>
                <div class="dk-body">${t === 'beads' ? this._dkBeads() : t === 'duas' ? this._dkDuas() : t === 'calm' ? this._dkCalm() : this._dkRamadan()}</div>
            </div>`;
            lucide.createIcons();
        },

        // ---------- the prayer beads ----------
        _dkBeads() {
            const o = this._dkGet(), D = DHIKR.find((x) => x[0] === o.mode);
            const target = D[2], n = 33, today = o.days[this._dkToday()] || {};
            const inRound = o.cur % target, lit = Math.round((inRound / target) * n);
            const beads = Array.from({ length: n }, (_, i) => {
                const a = (i / n) * Math.PI * 2 - Math.PI / 2, x = 50 + 42 * Math.cos(a), y = 50 + 42 * Math.sin(a);
                return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.3" class="${i < lit ? 'on' : ''}${i === lit % n ? ' next' : ''}"/>`;
            }).join('');
            const isg = today.istighfar || 0;
            const sumToday = Object.values(today).reduce((a, b) => a + b, 0);
            const all = Object.values(o.total).reduce((a, b) => a + b, 0);
            return `
                <div class="dk-chips">${DHIKR.map(([k, txt]) => `<button class="${o.mode === k ? 'on' : ''}" onclick="app.dkMode('${k}')">${esc(txt)}</button>`).join('')}</div>
                <button class="dk-tap" id="dkTap" onpointerdown="app.dkCount(event)" aria-label="سبّح">
                    <svg viewBox="0 0 100 100" class="dk-ring"><circle cx="50" cy="50" r="42" class="dk-thread"/>${beads}</svg>
                    <span class="dk-mid">
                        <b id="dkNum">${inRound}</b>
                        <small>من ${target}</small>
                        <em>${esc(D[1])}</em>
                    </span>
                    <span class="dk-done" id="dkDone">تقبّل الله</span>
                </button>
                <p class="dk-hint">اضغط بأي مكان على الدائرة${o.rounds ? ' · الدورات: ' + o.rounds : ''}</p>
                <div class="dk-row">
                    <button class="dk-soft" onclick="app.dkReset()"><i data-lucide="rotate-ccw"></i>صفّر</button>
                </div>
                <div class="dk-goal">
                    <div><b>ورد الاستغفار اليومي</b><small>${isg >= 100 ? 'كمّلت وردك اليوم، تقبّل الله' : 'باقي ' + (100 - isg) + ' من 100'}</small></div>
                    <div class="dk-bar"><i style="width:${Math.min(100, isg)}%"></i></div>
                </div>
                <div class="dk-stats"><div><b>${sumToday}</b><small>ذكر اليوم</small></div><div><b>${all}</b><small>من البداية</small></div><div><b>${this._dkStreak(o)}</b><small>أيام متتالية</small></div></div>`;
        },
        _dkStreak(o) {
            let n = 0;
            for (let i = 0; i < 30; i++) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const x = o.days[this.localDateStr(d)];
                if (x && Object.values(x).some((v) => v > 0)) n++; else if (i > 0) break;
            }
            return n;
        },
        dkMode(k) {
            const o = this._dkGet();
            if (o.mode !== k) { o.mode = k; o.cur = 0; o.rounds = 0; this._dkSave(o); }
            this._dkRender();
        },
        dkCount(e) {
            if (e) e.preventDefault();
            const o = this._dkGet(), D = DHIKR.find((x) => x[0] === o.mode), d = this._dkToday();
            o.cur += 1;
            o.total[o.mode] = (o.total[o.mode] || 0) + 1;
            o.days[d] = o.days[d] || {};
            o.days[d][o.mode] = (o.days[d][o.mode] || 0) + 1;
            const done = o.cur % D[2] === 0;
            if (done) o.rounds += 1;
            this._dkSave(o);
            // light touch on each bead, a longer one at the end of a round
            try { if (navigator.vibrate) navigator.vibrate(done ? [60, 60, 120] : 12); } catch (er) {}
            if (done) {
                this._dkRender();
                const el = document.getElementById('dkDone'), tap = document.getElementById('dkTap');
                if (el) { el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1600); }
                if (tap) tap.classList.add('burst');
                return;
            }
            // only the changed bits, so fast tapping stays smooth
            const num = document.getElementById('dkNum');
            if (num) { num.textContent = o.cur % D[2]; num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop'); }
            const n = 33, lit = Math.round(((o.cur % D[2]) / D[2]) * n);
            document.querySelectorAll('#dkTap .dk-ring circle:not(.dk-thread)').forEach((c, i) => {
                c.classList.toggle('on', i < lit);
                c.classList.toggle('next', i === lit % n);
            });
            const g = document.querySelector('.dk-goal');
            if (g && o.mode === 'istighfar') {
                const isg = o.days[d].istighfar;
                const bar = g.querySelector('.dk-bar i'); if (bar) bar.style.width = Math.min(100, isg) + '%';
                const sm = g.querySelector('small'); if (sm) sm.textContent = isg >= 100 ? 'كمّلت وردك اليوم، تقبّل الله' : 'باقي ' + (100 - isg) + ' من 100';
            }
        },
        async dkReset() {
            const o = this._dkGet();
            if (!o.cur) return;
            if (this.ask && !(await this.ask({ icon: 'rotate-ccw', title: 'تصفّر العداد؟', text: 'العدد الكلي ما يتأثر.', ok: 'صفّر', cancel: 'لا' }))) return;
            o.cur = 0; o.rounds = 0;
            this._dkSave(o);
            this._dkRender();
        },

        // ---------- duas ----------
        _dkDuas() {
            const cur = DUAS.find((x) => x[0] === this._dk.dua) || DUAS[0];
            return `<div class="dk-chips">${DUAS.map(([k, n, ic]) => `<button class="${cur[0] === k ? 'on' : ''}" onclick="app.dkDua('${k}')"><i data-lucide="${ic}"></i>${n}</button>`).join('')}</div>
                <div class="dk-list">${cur[3].map(([t, src], i) => `<div class="dk-dua" style="animation-delay:${i * 0.05}s">
                    <p>${esc(t)}</p>
                    <div><small>${esc(src)}</small><button onclick="app.dkCopy(this)" data-t="${esc(t)}" aria-label="نسخ"><i data-lucide="copy"></i></button></div>
                </div>`).join('')}</div>`;
        },
        dkDua(k) { this._dk.dua = k; this._dkRender(); },
        dkCopy(btn) {
            const t = btn.dataset.t || '';
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => this.showToast('انسخ الدعاء')).catch(() => {});
        },

        // ---------- deeds that ease the soul ----------
        _dkCalm() {
            const o = this._dkGet(), done = o.deeds[this._dkToday()] || [];
            return `<div class="dk-goal"><div><b>اليوم</b><small>سويت ${done.length} من ${CALM.length}</small></div><div class="dk-bar"><i style="width:${(done.length / CALM.length) * 100}%"></i></div></div>
                <div id="dkBreath"></div>
                <div class="dk-list">${CALM.map(([k, t, ic, why, act], i) => `<div class="dk-deed${done.includes(k) ? ' done' : ''}" style="animation-delay:${i * 0.04}s">
                    <span class="dk-di"><i data-lucide="${ic}"></i></span>
                    <div><b>${esc(t)}</b><small>${esc(why)}</small>
                    ${act ? `<button class="dk-act" onclick="app.dkAct('${act}')">${act === 'breathe' ? 'ابدأ' : act === 'sharh' ? 'اقرأها' : 'افتح المسبحة'}</button>` : ''}</div>
                    <button class="dk-check" onclick="app.dkDeed('${k}')" aria-label="سويتها"><i data-lucide="check"></i></button>
                </div>`).join('')}</div>`;
        },
        dkDeed(k) {
            const o = this._dkGet(), d = this._dkToday();
            const list = o.deeds[d] = o.deeds[d] || [];
            const i = list.indexOf(k);
            if (i < 0) list.push(k); else list.splice(i, 1);
            this._dkSave(o);
            this._dkRender();
        },
        dkAct(a) {
            if (a === 'istighfar') { const o = this._dkGet(); if (o.mode !== 'istighfar') { o.mode = 'istighfar'; o.cur = 0; o.rounds = 0; this._dkSave(o); } this.dkTab('beads'); return; }
            const box = document.getElementById('dkBreath');
            if (!box) return;
            if (a === 'sharh') {
                box.innerHTML = `<div class="dk-surah"><b>سورة الشرح</b>${SHARH.map((x, i) => `<p style="animation-delay:${i * 0.12}s">${esc(x)} <span>${i + 1}</span></p>`).join('')}<button class="dk-soft" onclick="document.getElementById('dkBreath').innerHTML=''">سد</button></div>`;
                box.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            this._dkStopBreath();
            const steps = [['خذ نفس', 'سبحان الله', 4000, 'in'], ['اثبت', 'الحمد لله', 2000, 'hold'], ['طلّعه بهدوء', 'الله أكبر', 6000, 'out']];
            box.innerHTML = `<div class="dk-breath"><div class="dk-orb" id="dkOrb"><span id="dkWord">سبحان الله</span></div><b id="dkStep">خذ نفس</b><small id="dkLeft">10 مرات</small><button class="dk-soft" onclick="app._dkStopBreath(true)">وكّف</button></div>`;
            box.scrollIntoView({ behavior: 'smooth', block: 'center' });
            let i = 0, rounds = 10;
            const run = () => {
                const orb = document.getElementById('dkOrb');
                if (!orb) return;
                const [lbl, word, ms, cls] = steps[i % 3];
                orb.className = 'dk-orb ' + cls;
                orb.style.transitionDuration = ms + 'ms';
                document.getElementById('dkWord').textContent = word;
                document.getElementById('dkStep').textContent = lbl;
                if (i % 3 === 0) document.getElementById('dkLeft').textContent = 'باقي ' + rounds + ' مرات';
                if (i % 3 === 2) rounds -= 1;
                i += 1;
                if (rounds < 0) { this._dkStopBreath(); this.dkDeedOn('breathe'); this.showToast('أحسنت، قلبك هدأ إن شاء الله'); return; }
                this._dkBT = setTimeout(run, ms);
            };
            requestAnimationFrame(run);
        },
        dkDeedOn(k) {
            const o = this._dkGet(), d = this._dkToday();
            const list = o.deeds[d] = o.deeds[d] || [];
            if (!list.includes(k)) { list.push(k); this._dkSave(o); }
            if (this._dk && this._dk.tab === 'calm') this._dkRender();
        },
        _dkStopBreath(clear) {
            if (this._dkBT) { clearTimeout(this._dkBT); this._dkBT = null; }
            if (clear) { const b = document.getElementById('dkBreath'); if (b) b.innerHTML = ''; }
        },

        // ---------- Ramadan ----------
        _dkRamadan() {
            const h = hijri(new Date());
            const o = this._dkGet();
            const inR = h && h.m === 9;
            let head;
            if (inR) {
                head = `<div class="dk-rmd on"><span class="dk-moon"></span><div><b>رمضان كريم</b><small>اليوم ${h.d} من رمضان ${h.y} حسب التقويم</small></div></div>`;
            } else {
                let days = 0;
                if (h) { for (let i = 1; i < 400; i++) { const d = new Date(); d.setDate(d.getDate() + i); const x = hijri(d); if (x && x.m === 9 && x.d === 1) { days = i; break; } } }
                head = `<div class="dk-rmd"><span class="dk-moon"></span><div><b>${days ? 'باقي تقريباً ' + days + ' يوم على رمضان' : 'شهر رمضان'}</b><small>حسب التقويم، والبداية تتحدد بالرؤية</small></div></div>`;
            }
            const yr = h ? String(h.y) : 'x';
            const R = o.rmd[yr] = o.rmd[yr] || { days: {}, juz: [] };
            const dayKey = inR ? String(h.d) : '';
            const ticks = inR ? (R.days[dayKey] || []) : [];
            const juz = R.juz || [];
            return `${head}
                ${inR ? `<div class="dk-h"><b>يومي برمضان</b><small>${ticks.length} من ${RMD_DAY.length}</small></div>
                <div class="dk-checks">${RMD_DAY.map(([k, t, ic]) => `<button class="${ticks.includes(k) ? 'on' : ''}" onclick="app.dkRmd('${k}')"><i data-lucide="${ic}"></i><span>${esc(t)}</span></button>`).join('')}</div>` : ''}
                <div class="dk-h"><b>ختمتي</b><small>${juz.filter(Boolean).length} من 30 جزء</small></div>
                <div class="dk-juz">${Array.from({ length: 30 }, (_, i) => `<button class="${juz[i] ? 'on' : ''}" onclick="app.dkJuz(${i})">${i + 1}</button>`).join('')}</div>
                <div class="dk-h"><b>أعمال الشهر</b></div>
                <div class="dk-list">${RMD_DEEDS.map(([t, why]) => `<div class="dk-deed slim"><span class="dk-di"><i data-lucide="star"></i></span><div><b>${esc(t)}</b><small>${esc(why)}</small></div></div>`).join('')}</div>
                <div class="dk-h"><b>أدعية رمضان</b></div>
                <div class="dk-list">${RMD_DUAS.map(([t, src]) => `<div class="dk-dua"><p>${esc(t)}</p><div><small>${esc(src)}</small><button onclick="app.dkCopy(this)" data-t="${esc(t)}" aria-label="نسخ"><i data-lucide="copy"></i></button></div></div>`).join('')}</div>`;
        },
        dkRmd(k) {
            const h = hijri(new Date());
            if (!h || h.m !== 9) return;
            const o = this._dkGet(), R = o.rmd[String(h.y)] = o.rmd[String(h.y)] || { days: {}, juz: [] };
            const list = R.days[String(h.d)] = R.days[String(h.d)] || [];
            const i = list.indexOf(k);
            if (i < 0) list.push(k); else list.splice(i, 1);
            this._dkSave(o);
            this._dkRender();
        },
        dkJuz(i) {
            const h = hijri(new Date());
            const o = this._dkGet(), yr = h ? String(h.y) : 'x';
            const R = o.rmd[yr] = o.rmd[yr] || { days: {}, juz: [] };
            R.juz[i] = !R.juz[i];
            this._dkSave(o);
            this._dkRender();
            if (R.juz.filter(Boolean).length === 30) this.showToast('ختمت القرآن، تقبّل الله منك');
        },
    });
})();
