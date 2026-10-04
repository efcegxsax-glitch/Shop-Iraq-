// أبو الهمّة: the owl who pops up from the bottom of the screen (like the advisors in strategy games), talks in a bubble,
// and nags the student to study: now and then while the app is open (not while studying, calling, typing or at night),
// and whenever the phone is shaken. It knows how long the student studied today, the next exam and the time of day,
// backs off if it is ignored, and can be switched off or made rarer from its settings (or by the admin panel).
// It also watches the chats: after a while of chatting it scolds, and when the student overdoes it, it pauses the conversation
// (a lock that survives closing and reopening the chat) and sends them to study, unless they switch that watch off.
// Tapping it plays one of 30 little reactions. State is kept on the phone: isp:mc:v1 (settings), isp:mcc:v1 (chat time and lock). Loaded a few seconds after the app starts by app._need('mascot').
(function () {
    const KEY = 'isp:mc:v1';
    const $ = (id) => document.getElementById(id);
    const rnd = (a) => a[Math.floor(Math.random() * a.length)];
    const pad = (n) => String(n).padStart(2, '0');
    const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const FREQ = { rare: [90, 3], normal: [38, 7], often: [16, 14] }; // minutes between talks, talks per day
    let S = null, timer = 0, next = 0, hideT = 0, typeT = 0, bornAt = Date.now(), ignored = 0, cur = null, lastShake = 0;

    function load() {
        try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === 1) S = o; } catch (e) {}
        if (!S) S = { v: 1, on: true, shake: true, chat: true, voice: false, freq: 'normal', day: { d: today(), m: 0, n: 0 }, mute: '', used: [] };
        if (!S.day || S.day.d !== today()) S.day = { d: today(), m: 0, n: 0 };
        if (!Array.isArray(S.used)) S.used = [];
        if (typeof S.chat !== 'boolean') S.chat = true;
    }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

    // ---------- the character (SVG, a few moods) ----------
    function owl(mood) {
        const love = mood === 'love', cry = mood === 'cry', wink = mood === 'wink', dizzy = mood === 'dizzy', laugh = mood === 'laugh', cool = mood === 'cool';
        const angry = mood === 'angry', happy = mood === 'happy' || laugh, sleepy = mood === 'sleepy', shock = mood === 'shock', stern = mood === 'stern';
        const eye = (cx, side) => {
            const cy = 100;
            let s = `<g class="mc-eye"><circle cx="${cx}" cy="${cy}" r="27" fill="#fff6e0" stroke="#e0b070" stroke-width="4"/>`;
            if (wink && side === 1) return s + `</g><path d="M${cx - 15} ${cy} L${cx + 15} ${cy}" stroke="#3b2412" stroke-width="7" fill="none" stroke-linecap="round"/>`;
            if (dizzy) return s + `</g><path d="M${cx - 14} ${cy - 14} L${cx + 14} ${cy + 14} M${cx + 14} ${cy - 14} L${cx - 14} ${cy + 14}" stroke="#3b2412" stroke-width="7" fill="none" stroke-linecap="round"/>`;
            if (love) return s + `<path d="M${cx} ${cy + 16} C${cx - 26} ${cy - 2} ${cx - 12} ${cy - 20} ${cx} ${cy - 6} C${cx + 12} ${cy - 20} ${cx + 26} ${cy - 2} ${cx} ${cy + 16}Z" fill="#f43f5e"/></g>`;
            if (happy) return s + `</g><path d="M${cx - 15} ${cy + 6} Q${cx} ${cy - 14} ${cx + 15} ${cy + 6}" stroke="#3b2412" stroke-width="7" fill="none" stroke-linecap="round"/>`;
            s += `<g class="mc-pu"><circle cx="${cx + side * -2}" cy="${cy + 2}" r="${shock ? 6 : 12.5}" fill="#2a1a0e"/><circle cx="${cx + side * -2 - 4}" cy="${cy - 3}" r="${shock ? 2 : 4}" fill="#fff"/></g></g>`;
            if (angry || stern) s += `<clipPath id="mcc${cx}"><circle cx="${cx}" cy="${cy}" r="25"/></clipPath><g clip-path="url(#mcc${cx})"><rect x="${cx - 32}" y="${cy - 34}" width="64" height="${angry ? 30 : 22}" fill="#7a4d27" transform="rotate(${side * (angry ? 22 : 8)} ${cx} ${cy - 8})"/></g>`;
            if (sleepy) s += `<clipPath id="mcc${cx}"><circle cx="${cx}" cy="${cy}" r="25"/></clipPath><g clip-path="url(#mcc${cx})"><rect x="${cx - 30}" y="${cy - 30}" width="60" height="40" fill="#7a4d27"/></g>`;
            return s;
        };
        const brows = cry ? '<path d="M44 80 L88 70 M156 80 L112 70" stroke="#2a1a0e" stroke-width="7" stroke-linecap="round"/>' : angry ? '<path d="M38 72 L90 90 M162 72 L110 90" stroke="#2a1a0e" stroke-width="9" stroke-linecap="round"/>'
            : stern ? '<path d="M40 80 L90 88 M160 80 L110 88" stroke="#2a1a0e" stroke-width="8" stroke-linecap="round"/>'
            : shock ? '<path d="M44 66 Q68 54 92 66 M156 66 Q132 54 108 66" stroke="#2a1a0e" stroke-width="6" fill="none" stroke-linecap="round"/>' : '';
        const glasses = cool ? '<rect x="36" y="84" width="58" height="30" rx="10" fill="#111827"/><rect x="106" y="84" width="58" height="30" rx="10" fill="#111827"/><path d="M94 94 H106" stroke="#111827" stroke-width="5"/><path d="M44 92 l14 0 M114 92 l14 0" stroke="#9ca3af" stroke-width="3" stroke-linecap="round"/>' : '';
        const extra = cry ? '<path d="M52 124 q-6 14 0 22 q8 -8 0 -22z M148 124 q-6 14 0 22 q8 -8 0 -22z" fill="#60a5fa" stroke="#2563eb" stroke-width="2"/>' : laugh ? '<path d="M30 112 q-8 10 -2 16 q8 -6 2 -16z M170 112 q8 10 2 16 q-8 -6 -2 -16z" fill="#60a5fa"/>' : angry ? '<g stroke="#ef4444" stroke-width="5" stroke-linecap="round" fill="none"><path d="M150 38 q8 0 8 8 M170 40 q-8 0 -8 8 M150 62 q8 0 8 -8 M170 62 q-8 0 -8 -8"/></g>'
            : shock ? '<path d="M164 64 q-9 14 0 22 q9 -8 0 -22z" fill="#60a5fa" stroke="#2563eb" stroke-width="2"/>'
            : sleepy ? '<text x="150" y="52" font-size="26" font-weight="900" fill="#93c5fd" font-family="sans-serif">Z</text><text x="168" y="34" font-size="18" font-weight="900" fill="#bfdbfe" font-family="sans-serif">z</text>'
            : happy ? '<g fill="#fbbf24"><path d="M158 44 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z"/><path d="M34 52 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"/></g><ellipse cx="46" cy="124" rx="12" ry="7" fill="#fb7185" opacity=".5"/><ellipse cx="154" cy="124" rx="12" ry="7" fill="#fb7185" opacity=".5"/>' : '';
        const wing = angry || stern ? '<g class="mc-wr mc-wingup"><path d="M146 168 Q198 160 192 108 Q176 132 142 142 Z" fill="#6b4220"/><path d="M192 108 q6 -12 12 -6 q-2 10 -12 6z" fill="#8a5a2d"/></g>'
            : '<g class="mc-wr"><path d="M146 146 Q182 156 170 196 Q150 184 140 160 Z" fill="#6b4220"/></g>';
        return `<svg viewBox="0 0 200 232" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs><linearGradient id="mcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a6633"/><stop offset="1" stop-color="#6b4220"/></linearGradient>
            <linearGradient id="mcv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0cf"/><stop offset="1" stop-color="#f0cf96"/></linearGradient></defs>
            <ellipse cx="100" cy="224" rx="52" ry="7" fill="rgba(0,0,0,.18)"/>
            <path d="M84 206 q-8 14 6 16 q6 -6 4 -16z M116 206 q8 14 -6 16 q-6 -6 -4 -16z" fill="#f59e0b" stroke="#d97706" stroke-width="2"/>
            <ellipse cx="100" cy="152" rx="62" ry="68" fill="url(#mcb)"/>
            <path d="M146 146 Q182 156 170 196 Q150 184 140 160 Z" fill="none"/>
            <g class="mc-wl"><path d="M54 146 Q18 156 30 196 Q50 184 60 160 Z" fill="#6b4220"/></g>
            ${wing}
            <ellipse cx="100" cy="166" rx="40" ry="46" fill="url(#mcv)"/>
            <g fill="none" stroke="#d9ac6a" stroke-width="3" stroke-linecap="round"><path d="M76 150 q8 8 16 0 M92 150 q8 8 16 0 M108 150 q8 8 16 0 M80 170 q8 8 16 0 M104 170 q8 8 16 0 M92 190 q8 8 16 0"/></g>
            <ellipse cx="100" cy="92" rx="70" ry="60" fill="url(#mcb)"/>
            <path d="M44 56 L52 34 L72 48Z M156 56 L148 34 L128 48Z" fill="#7a4d27"/>
            ${eye(68, 1)}${eye(132, -1)}
            <g fill="none" stroke="#2b2b33" stroke-width="3"><circle cx="68" cy="100" r="32"/><circle cx="132" cy="100" r="32"/><path d="M99 98 q1 -6 2 0"/></g>
            <path d="M52 86 q10 -14 26 -16" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".5"/>
            ${brows}${glasses}
            <path d="M91 114 L109 114 L100 134Z" fill="#f59e0b" stroke="#d97706" stroke-width="2" stroke-linejoin="round"/>
            <path class="mc-jaw" d="M93 130 L107 130 L100 142Z" fill="#e8890c" stroke="#d97706" stroke-width="2" stroke-linejoin="round"/>
            <g><path d="M30 44 L100 8 L170 44 L100 70Z" fill="#161b26"/><path d="M30 44 L100 70 L100 76 L30 50Z" fill="#0b0f18"/><path d="M70 58 L70 74 Q100 88 130 74 L130 58 L100 70Z" fill="#232b3b"/>
            <path d="M100 38 L158 50 L158 78" stroke="#f5b82e" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="100" cy="38" r="4.5" fill="#f5b82e"/><path d="M153 78 h10 l-2 20 h-6z" fill="#f5b82e"/></g>
            ${extra}</svg>`;
    }

    // ---------- the things it says ----------
    const T = {
        nag: [
            '{name}، شكد صار لك فاتح التطبيق؟ يلا ادرس شوية، 25 دقيقة بس!',
            'الملزمة تشتكي عليك، صار لها وقت ما انفتحت.',
            'ادرس ادرس ادرس! بعدين تفرح بالنتيجة.',
            'ضميرك مرتاح؟ لا؟ خلّيه يرتاح وافتح الكتاب.',
            'الوقت ما يرجع يا {name}. 25 دقيقة تركيز وبعدها ارتاح.',
            'اللي يدرس اليوم يفتخر بيه أهله باجر.',
            'أني أنتظرك، شغّل المؤقت وخلّ نبدي.',
            'كل دقيقة تدرسها هسه تخفف عليك سهر الامتحان.',
            'فتحت التطبيق وما درست؟ هذا مو عدل، يلا!',
            'لا تضيّع الوقت بالتنقل، ادرس شوية وبعدها سوي اللي تريده.',
            'تريدني أعاتبك أكثر لو تقوم تدرس؟ أنت اختار.',
            'النجاح ما ينزل من السما، يريد جلسة تركيز وحدة هسه.',
        ],
        scold: [
            'اليوم كله وما درست ولا دقيقة! وين ضميرك يا {name}؟',
            'صفر دقيقة دراسة اليوم. أني زعلان منك مرة.',
            'ما أريد أعاتبك بس دراسة اليوم صفر... يلا بسرعة!',
            'كل يوم تأجل لباجر، وباجر يصير بعد باجر. ابدأ هسه!',
            '{name}! الكتب مشتاقتلك وانت لاهي بالموبايل؟',
            'لا تكسل. حتى 15 دقيقة تفرق، يلا المؤقت.',
            'أسكت عنك لين متى؟ ادرس ولو شوية وارتاحني.',
        ],
        praise: [
            'ما شاء الله عليك! درست {m} دقيقة اليوم، كمّل يا بطل.',
            'هيج الشغل، {m} دقيقة تركيز اليوم. أني فخور بيك.',
            'أحسنت يا {name}! خذ راحة قصيرة وارجع كمل.',
            'اليوم يومك، دراسة {m} دقيقة. لا توقف!',
        ],
        late: [
            'الساعة صارت {t} وما درست؟ طيب هسه شوية وبعدها نام بدري.',
            'تأخر الوقت يا {name}. ارتاح، النوم يثبّت المعلومات.',
            'موبايل بالليل ما يدرّس. ادرس 15 دقيقة وبعدها نام.',
        ],
        exam: [
            'باقي {d} على امتحان {s}. هسه وقت المراجعة مو اللعب!',
            'امتحان {s} يقرّب ({d}). كل دقيقة تفرق يا {name}.',
            '{s} باقي له {d}، وانت وين وصلت بالمراجعة؟',
        ],
        fun: [
            '{name}، حلو التسلية بس الدراسة أحلى! ارجع للمؤقت.',
            'خلصت لعب؟ يلا نرجع للدراسة شوية.',
            'استراحة قصيرة تمام، بس لا تطوّلها. ادرس!',
        ],
        shake: [
            'آآآخ! لا تهزني، هز الموبايل ما يدرّس عنك!',
            'شنو هالهز؟ بدل ما تهز التلفون، هز عقلك وادرس!',
            'دوّختني! خلاص خلاص، ادرس وأني أسكت.',
            'تريد تتخلص مني بالهز؟ ما أروح لين تدرس.',
            'زلزال؟ لا لا، هذا {name} ويا هاتفه. يلا للدراسة!',
            'هيه! صحّيت ضميرك لو لا؟ يلا ادرس.',
        ],
    };
    const MOODS = { nag: ['stern', 'angry', 'stern'], scold: ['angry'], praise: ['happy'], late: ['sleepy', 'stern'], exam: ['stern', 'angry'], fun: ['stern'], shake: ['shock', 'angry'] };

    function minutesToday() {
        let m = (S.day && S.day.d === today() ? S.day.m : 0) || 0;
        try { const t = JSON.parse(localStorage.getItem('isp:tm:v1') || 'null'); if (t && t.stats && t.stats.d === today()) m += Number(t.stats.m) || 0; } catch (e) {}
        return m;
    }
    function nextExam() {
        try {
            const list = (app._mcExams ? app._mcExams() : []).map((ex) => ({ s: ex.subject || 'الامتحان', t: new Date(ex.date).getTime() })).filter((x) => !isNaN(x.t) && x.t > Date.now()).sort((a, b) => a.t - b.t);
            return list[0] || null;
        } catch (e) { return null; }
    }
    const daysText = (ms) => { const d = Math.ceil(ms / 864e5); return d <= 1 ? 'يوم واحد' : d === 2 ? 'يومين' : d <= 10 ? d + ' أيام' : d + ' يوم'; };
    const firstName = () => { const n = String((app.currentUser && app.currentUser.fullName) || '').trim().split(/\s+/)[0]; return n || 'بطل'; };

    function compose(kind) {
        const m = minutesToday(), h = new Date().getHours(), ex = nextExam(), view = app.currentView || '';
        let cat = kind;
        if (!cat) {
            const r = Math.random();
            if (ex && ex.t - Date.now() < 10 * 864e5 && r < 0.4) cat = 'exam';
            else if ((h >= 22 || h < 5) && m < 30) cat = 'late';
            else if (/^(vent|dreams|polls|hall|ideas|duels|calm|garden)/.test(view) && m < 30 && r < 0.55) cat = 'fun';
            else if (m >= 45 && r < 0.7) cat = 'praise';
            else if (m === 0 && r < 0.6) cat = 'scold';
            else cat = 'nag';
        }
        const list = T[cat];
        let i = 0, tries = 0;
        do { i = Math.floor(Math.random() * list.length); tries++; } while (S.used.indexOf(cat + i) !== -1 && tries < 12);
        S.used.push(cat + i); if (S.used.length > 12) S.used.shift();
        let t = list[i].replace(/\{name\}/g, firstName()).replace('{m}', m).replace('{t}', (h % 12 || 12) + (h >= 12 ? ' بالليل' : ' الصبح'));
        if (cat === 'exam' && ex) t = t.replace('{d}', daysText(ex.t - Date.now())).replace(/\{s\}/g, ex.s);
        else if (cat === 'exam') { t = rnd(T.nag).replace(/\{name\}/g, firstName()); cat = 'nag'; }
        return { cat, t, mood: rnd(MOODS[cat]) };
    }

    // ---------- when it may talk ----------
    function busy(forShake) {
        if (!app.isLoggedIn) return true;
        if (document.hidden) return true;
        if (app._cl || app._focus || app._forest || app._gwar || app._garden || app._duelOn) return true;
        const v = app.currentView || '';
        if (/auth|login/i.test(v) || v === 'rmView') return true;
        if (!forShake && v === 'tmView') return true;
        if (document.querySelector('#clCall, #rmScene, .rp-w, #mcSet')) return true;
        const a = document.activeElement;
        if (!forShake && a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return true;
        return false;
    }
    const enabled = () => !!S.on && !(app.siteConfig && app.siteConfig.features && app.siteConfig.features.mascot === false);
    const quiet = () => { const h = new Date().getHours(); return h >= 23 || h < 6; };
    function schedule(first) {
        const f = FREQ[S.freq] || FREQ.normal, back = 1 + Math.min(ignored, 3) * 0.6;
        const mins = first ? 4 + Math.random() * 4 : f[0] * back * (0.75 + Math.random() * 0.5);
        next = Date.now() + mins * 60000;
    }
    function tick() {
        if (!S || !enabled()) return;
        if (S.day.d !== today()) { S.day = { d: today(), m: 0, n: 0 }; ignored = 0; save(); }
        if (!next) schedule(true);
        if (Date.now() < next || cur) return;
        const f = FREQ[S.freq] || FREQ.normal;
        if (S.mute === today() || S.day.n >= f[1] || quiet() || busy(false) || Date.now() - bornAt < 150000) { next = Date.now() + 90000; return; }
        say(compose(null), 'auto');
        schedule(false);
    }

    // ---------- showing it ----------
    function speak(t) { try { if (S.voice && window.speechSynthesis) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'ar-SA'; u.rate = 1.02; speechSynthesis.speak(u); } } catch (e) {} }
    function chime() {
        try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const c = new AC(), o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(520, c.currentTime); o.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.12); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.22); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.24); setTimeout(() => c.close && c.close(), 400); } catch (e) {}
    }
    const FROMS = ['bl', 'br', 'tl', 'tr', 'l', 'r', 'fly'];
    let lastFrom = '', idleT = 0, glanceAt = 0, pokes = 0, pokeT = 0, ptrFn = null, petT = 0;
    const LOVE = ['حلو حلو، بس بعدين تدرس!', 'أحبك، يلا ادرس!', 'مرة طيب، هسه افتح الكتاب.'];
    let forceFrom = '';
    function pickFrom(how) {
        if (forceFrom) { const g = forceFrom; forceFrom = ''; lastFrom = g; return g; }
        let f; do { f = rnd(FROMS); } while (f === lastFrom && FROMS.length > 1);
        if (how === 'shake' && Math.random() < 0.6) f = 'fly';
        lastFrom = f; return f;
    }
    function setMood(m) { const ob = document.querySelector('#mcOwl .mc-ob'); if (ob) ob.innerHTML = owl(m); }
    function look(dx, dy) { document.querySelectorAll('#mcOwl .mc-pu').forEach((g) => { g.style.transform = `translate(${dx}px,${dy}px)`; }); }
    function act(cls, ms) { const o = $('mcOwl'); if (!o) return; o.classList.add(cls); setTimeout(() => o && o.classList.remove(cls), ms); }
    function say(msg, how) {
        clearTimeout(hideT); clearInterval(typeT); clearInterval(idleT);
        let w = $('mcWrap');
        if (w) { w.remove(); }
        w = document.createElement('div'); w.id = 'mcWrap';
        const from = pickFrom(how), right = from === 'br' || from === 'tr' || from === 'r' || (from === 'fly' && Math.random() < 0.5);
        const pos = from === 'fly' ? (right ? 'br' : 'bl') : from;
        w.className = 'mc-wrap' + (how === 'shake' ? ' mc-shk' : '') + (from === 'fly' ? ' mc-fly' : '');
        w.dataset.from = pos; w.dataset.side = right ? 'r' : 'l';
        w.innerHTML = `<div class="mc-bub" id="mcBub"><div class="mc-nm"><b>أبو الهمّة</b><button class="mc-gear" onclick="app.mcSettings()" aria-label="إعدادات"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.4"/><circle cx="8" cy="17" r="2.4"/></svg></button></div><p id="mcTx" dir="rtl"></p>
            <div class="mc-btns"><button class="mc-go" onclick="app.mcStudy()">يلا أدرس</button><button class="mc-no" onclick="app.mcLater()">بعدين</button><button class="mc-mu" onclick="app.mcMuteToday()">سكّتني اليوم</button></div></div>
            <div class="mc-owl${from === 'fly' ? ' fly' : ''}" id="mcOwl"><div class="mc-ob">${owl(msg.mood)}</div><div class="mc-hearts" id="mcHearts"></div></div>`;
        document.body.appendChild(w);
        cur = msg; cur.mood0 = msg.mood;
        requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('on')));
        if (from === 'fly') setTimeout(() => $('mcOwl') && $('mcOwl').classList.remove('fly'), 1300);
        const delay = from === 'fly' ? 900 : 450;
        setTimeout(() => { if (cur === msg) { chime(); speak(msg.t); } }, delay);
        if (how !== 'shake') { S.day.n++; save(); }
        // typing, with the beak moving and a little head bob
        const tx = $('mcTx'), owlEl = $('mcOwl'); let i = 0;
        setTimeout(() => {
            if (cur !== msg) return;
            owlEl.classList.add('talk');
            typeT = setInterval(() => {
                i += 2; if (tx) tx.textContent = msg.t.slice(0, i);
                if (i >= msg.t.length) { clearInterval(typeT); owlEl && owlEl.classList.remove('talk'); }
            }, 34);
        }, delay);
        wire(w);
        // idle life: glances, hops, tilts, wing flaps
        idleT = setInterval(() => {
            if (!$('mcOwl')) return;
            const r = Math.random();
            if (Date.now() - glanceAt > 2500 && r < 0.45) look(Math.round((Math.random() - 0.5) * 12), Math.round((Math.random() - 0.4) * 8));
            else if (r < 0.62) act('act-hop', 700);
            else if (r < 0.76) act('act-tilt', 1200);
            else if (r < 0.9) act('act-flap', 900);
        }, 2300);
        hideT = setTimeout(() => dismiss(true), Math.max(8000, msg.t.length * 120 + 4500) + delay);
    }
    // touch: poke, pet (hold), swipe away, eyes follow the finger
    function wire(w) {
        const owlEl = $('mcOwl'), bub = $('mcBub');
        if (ptrFn) { document.removeEventListener('pointermove', ptrFn); ptrFn = null; }
        ptrFn = (e) => {
            if (!owlEl.isConnected) return;
            const r = owlEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.4;
            const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.max(60, Math.hypot(dx, dy));
            glanceAt = Date.now(); look(Math.round((dx / d) * 7), Math.round((dy / d) * 6));
        };
        document.addEventListener('pointermove', ptrFn, { passive: true });
        let sx = 0, sy = 0, moved = false, down = 0;
        const start = (e) => { sx = e.clientX; sy = e.clientY; moved = false; down = Date.now(); clearTimeout(petT); if (e.currentTarget === owlEl) petT = setTimeout(() => { if (!moved) pet(); }, 650); };
        const move = (e) => { const dx = e.clientX - sx; if (Math.abs(dx) > 14) { moved = true; clearTimeout(petT); } w.style.setProperty('--dx', (moved ? dx : 0) + 'px'); };
        const end = (e) => {
            clearTimeout(petT);
            const dx = e.clientX - sx, dy = e.clientY - sy;
            w.style.setProperty('--dx', '0px');
            if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.4) { w.dataset.fling = dx > 0 ? 'r' : 'l'; dismiss(true); return; }
            if (e.currentTarget === owlEl && !moved && Date.now() - down < 600) poke();
        };
        [owlEl, bub].forEach((el) => { el.addEventListener('pointerdown', start); el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', () => { clearTimeout(petT); w.style.setProperty('--dx', '0px'); }); });
    }
    function quip(t, mood, ms) {
        if (!cur) return;
        const tx = $('mcTx'); if (!tx) return;
        clearInterval(typeT); tx.textContent = t;
        const back = cur.mood0; setMood(mood); act('act-hop', 600);
        clearTimeout(hideT); hideT = setTimeout(() => dismiss(true), 9000);
        setTimeout(() => { if (cur && cur.mood0 === back) setMood(back); }, ms || 1400);
    }
    // 30 reactions to a tap: [motion class, mood, particles, what it says]
    const REACT = [
        ['laugh', 'laugh', 'tears', 'هههههه دغدغتني!'], ['mad', 'angry', 'anger', 'لا تلمسني وأني أدرّس!'], ['flip', 'happy', 'stars', 'شفت؟ أني أقلب بعد!'],
        ['spin', 'dizzy', 'stars', 'دوخة... الدنيا تلف'], ['dizzy', 'dizzy', 'stars', 'ويييي شكو؟ أشوف نجوم!'], ['sleep', 'sleepy', 'zzz', 'زززز... خمس دقايق بس...'],
        ['wink', 'wink', 'sparks', 'سرّي بيني وبينك: ادرس!'], ['cry', 'cry', 'tears', 'تبجّيني؟ ادرس وفرّحني!'], ['love', 'love', 'hearts', 'حبيبي أنت، بس لا تنسى الدراسة'],
        ['jump', 'happy', 'stars', 'هوووب! شفت شكد أطفر؟'], ['grow', 'angry', '', 'أني كبير وكلمتي مسموعة: ادرس!'], ['shrink', 'shock', '', 'ضيّقتني! ما أكدر أتنفس'],
        ['wings', 'happy', 'sparks', 'أطير أطير! تريد تطير وياي للنجاح؟'], ['peek', 'stern', '', 'ششش... أراقبك من الجنب'], ['salute', 'stern', '', 'أمرك سيدي! بس انت وين ملزمتك؟'],
        ['sneeze', 'shock', 'steam', 'أتشوووو! الغبار من الكتب اللي ما تفتحها'], ['yawn', 'sleepy', 'zzz', 'آآآه... مملل. هات مادة نذاكرها'], ['party', 'laugh', 'confetti', 'مبروك! لأنك رجعت للدراسة... رجعت؟'],
        ['facepalm', 'cry', '', 'يا ربي... ما درست ولا شي!'], ['think', 'stern', 'dots', 'ممم... أفكر، الجواب: ادرس'], ['shock', 'shock', 'sparks', 'واااااو! خوفتني!'],
        ['kiss', 'love', 'hearts', 'مواااح! هذا حتى تدرس'], ['super', 'cool', 'sparks', 'أني سوبر أبو الهمّة! أنقذ علاماتك'], ['cold', 'cry', 'drops', 'برررد! سكّر الشباك'],
        ['hot', 'angry', 'steam', 'حااار! وأنت لاهي وما تدرس'], ['roll', 'happy', 'stars', 'أتدحرج للمستقبل، تعال وياي'], ['stretch', 'sleepy', '', 'مطّ مطّ... هسه جاهز للدراسة'],
        ['dance', 'happy', 'notes', 'تعال ندبك وبعدها ندرس'], ['pop', 'shock', 'confetti', 'بووم! طلعتلك من الشاشة'], ['teach', 'stern', 'sparks', 'اسمع يا ولدي: ساعة وحدة تركيز وتفرح'],
    ];
    const FXC = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
    let bag = [], reactT = 0;
    function fx(kind) {
        const box = $('mcHearts'); if (!box || !kind) return;
        const n = { hearts: 6, stars: 7, tears: 6, anger: 4, zzz: 3, sparks: 8, steam: 5, confetti: 16, dots: 3, notes: 5, drops: 6 }[kind] || 5;
        for (let i = 0; i < n; i++) {
            const e = document.createElement('i'); e.className = 'mc-fx f-' + kind;
            e.style.setProperty('--x', (Math.random() * 90 - 45) + 'px'); e.style.setProperty('--y', (Math.random() * 30 - 10) + 'px');
            e.style.setProperty('--c', FXC[i % FXC.length]); e.style.animationDelay = (i * 0.09) + 's';
            if (kind === 'zzz') e.textContent = i % 2 ? 'z' : 'Z'; else if (kind === 'notes') e.textContent = i % 2 ? '♪' : '♫'; else if (kind === 'dots') e.textContent = '.';
            box.appendChild(e); setTimeout(() => e.remove(), 2600);
        }
    }
    function react() {
        if (!bag.length) { bag = REACT.map((_, i) => i).sort(() => Math.random() - 0.5); }
        const r = REACT[bag.pop()], o = $('mcOwl'); if (!o || !cur) return;
        clearTimeout(reactT);
        o.className = o.className.replace(/\br-\w+/g, '').trim();
        void o.offsetWidth; o.classList.add('r-' + r[0]);
        fx(r[2]); quip(r[3], r[1], 2000);
        reactT = setTimeout(() => { const oo = $('mcOwl'); if (oo) oo.className = oo.className.replace(/\br-\w+/g, '').trim(); }, 2300);
    }
    function poke() {
        pokes++; clearTimeout(pokeT); pokeT = setTimeout(() => { pokes = 0; }, 2600);
        if (pokes >= 6) { pokes = 0; quip('خلاص! تلعب وياي لو تدرس؟ اختار!', 'angry', 2200); act('act-shake', 700); return; }
        react();
    }
    function pet() {
        const hb = $('mcHearts'); if (!hb) return;
        for (let i = 0; i < 6; i++) { const h = document.createElement('i'); h.style.setProperty('--x', (Math.random() * 70 - 35) + 'px'); h.style.animationDelay = (i * 0.12) + 's'; hb.appendChild(h); setTimeout(() => h.remove(), 2200); }
        quip(rnd(LOVE), 'happy', 2200);
    }
    function dismiss(auto) {
        clearTimeout(hideT); clearInterval(typeT); clearInterval(idleT); clearTimeout(petT);
        if (ptrFn) { document.removeEventListener('pointermove', ptrFn); ptrFn = null; }
        const w = $('mcWrap'); if (!w) { cur = null; return; }
        if (auto && cur) ignored++;
        try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {}
        const fly = w.classList.contains('mc-fly');
        w.classList.remove('on'); w.classList.add('off'); if (fly && !w.dataset.fling) w.classList.add('mc-fly-out'); cur = null;
        setTimeout(() => { if (!cur && w.parentNode) w.remove(); }, fly ? 1100 : 600);
    }
    function onShake() {
        if (!S || !enabled() || !S.shake) return;
        const now = Date.now();
        if (now - lastShake < 9000 || busy(true)) return;
        lastShake = now;
        say(compose('shake'), 'shake');
    }
    let lx = 0, ly = 0, lz = 0, lastT = 0, cnt = 0;
    function motion(e) {
        const a = e.accelerationIncludingGravity || e.acceleration; if (!a) return;
        const x = a.x || 0, y = a.y || 0, z = a.z || 0, d = Math.abs(x - lx) + Math.abs(y - ly) + Math.abs(z - lz);
        lx = x; ly = y; lz = z;
        if (d < 28) return;
        const t = Date.now(); if (t - lastT < 90) return;
        cnt = t - lastT < 900 ? cnt + 1 : 1; lastT = t;
        if (cnt >= 3) { cnt = 0; onShake(); }
    }
    function sensors() {
        if (typeof DeviceMotionEvent === 'undefined') return;
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            // iPhone: the sensor must be allowed after a tap, once
            const ask = () => { document.removeEventListener('click', ask, true); DeviceMotionEvent.requestPermission().then((r) => { if (r === 'granted') window.addEventListener('devicemotion', motion); }).catch(() => {}); };
            document.addEventListener('click', ask, true);
        } else window.addEventListener('devicemotion', motion);
    }

    function patchActivity() {
        if (app.logDailyActivity && !app._mcPatched) {
            const orig = app.logDailyActivity; app._mcPatched = true;
            app.logDailyActivity = function (d) {
                try { if (d && d.minutes > 0) { if (S.day.d !== today()) S.day = { d: today(), m: 0, n: 0 }; S.day.m += d.minutes; save(); } } catch (e) {}
                return orig.apply(this, arguments);
            };
        }
    }

    // ---------- watching the chats ----------
    // Chat time is counted across closings and reopenings (isp:mcc:v1), so leaving for 30 seconds changes nothing. After 8 and 14
    // minutes it scolds; at 20 minutes the chats are paused for 10, 20 and then 30 minutes (45 once the day's chatting passed an hour).
    const CK = 'isp:mcc:v1', WARN1 = 480, WARN2 = 840, LOCK = 1200;
    let C = null, lastChatAt = 0, lockClock = 0;
    T.chat1 = ['{name}، صار لك ٨ دقايق تدردش. المحادثة حلوة بس الدراسة أهم!', 'الدردشة تاخذك والوقت يضيع... ٨ دقايق مضت، رجّع انتباهك للكتاب.', 'أني شايفك تراسل من شوية. جاوب الرسالة وارجع ادرس.'];
    T.chat2 = ['{name}! هذي ١٤ دقيقة دردشة! بعد شوية أوقف المحادثة بنفسي.', 'آخر تنبيه: الدردشة صارت أكثر من اللازم. اختصر وروح ادرس.', 'ما أريد أوقفها عليك... بس إذا تطوّل أضطر. ادرس!'];
    T.lock = ['كافي دردشة يا {name}! وقفت المحادثة، روح ادرس وبعدها ارجع.', 'وقت الدراسة! المحادثات مقفولة لين ترتاح عيونك من الشاشة.', 'خلصت حصتك من الدردشة اليوم. يلا للدراسة، الأصحاب ينتظرون.'];
    MOODS.chat1 = ['stern']; MOODS.chat2 = ['angry']; MOODS.lock = ['angry'];
    function cload() {
        try { C = JSON.parse(localStorage.getItem(CK) || 'null'); } catch (e) { C = null; }
        if (!C || typeof C !== 'object') C = { d: today(), sec: 0, tot: 0, locks: 0, until: 0, last: 0, w: 0 };
        if (C.d !== today()) { C.d = today(); C.tot = 0; C.locks = 0; }
        C.until = Number(C.until) || 0; C.sec = Number(C.sec) || 0; C.tot = Number(C.tot) || 0; C.locks = Number(C.locks) || 0; C.w = Number(C.w) || 0; C.last = Number(C.last) || 0;
    }
    const csave = () => { try { localStorage.setItem(CK, JSON.stringify(C)); } catch (e) {} };
    const chatOn = () => !!(S && S.on && S.chat && enabled() && app.isLoggedIn);
    const inChat = () => app.currentView === 'chatThreadView' && !document.hidden;
    const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return pad(Math.floor(t / 60)) + ':' + pad(t % 60); };
    function lockShow() {
        const root = document.querySelector('#chatThreadView .ct-root'); if (!root || !C || C.until <= Date.now()) return;
        let el = document.getElementById('mcLock');
        if (!el) {
            try { app.chatStopVoice && app.chatStopVoice(); } catch (e) {}
            try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
            const head = root.querySelector('.ct-head');
            el = document.createElement('div'); el.id = 'mcLock'; el.className = 'mc-lock';
            el.style.top = ((head && head.offsetHeight) || 64) + 'px';
            el.innerHTML = `<div class="mc-lk-owl">${owl('angry')}</div><h3>وقف أبو الهمّة المحادثة</h3>
                <p>${rnd(T.lock).replace(/\{name\}/g, firstName())}</p><div class="mc-lk-t" id="mcLockT" dir="ltr">${mmss(C.until - Date.now())}</div><small>تنفتح الدردشة بعد هذا الوقت، حتى لو طلعت ورجعت</small>
                <div class="mc-lk-b"><button class="mc-go" onclick="app.mcLockStudy()">يلا أدرس</button><button class="mc-no" onclick="app.chatBack && app.chatBack()">طلعني من المحادثة</button></div>
                <button class="mc-lk-off" onclick="app.mcLockOff()">إيقاف هالميزة (ما أريد أحد يوقف دردشتي)</button>`;
            root.appendChild(el);
        }
        clearInterval(lockClock);
        lockClock = setInterval(() => { const t = document.getElementById('mcLockT'); if (!t || !C) { clearInterval(lockClock); return; } const left = C.until - Date.now(); if (left <= 0) { chatTick(); return; } t.textContent = mmss(left); }, 1000);
    }
    function lockHide() { clearInterval(lockClock); const el = document.getElementById('mcLock'); if (el) el.remove(); }
    function chatTick() {
        if (!S) return;
        if (!C) cload();
        const now = Date.now();
        if (!chatOn()) { lockHide(); lastChatAt = 0; return; }
        if (C.until > now) { if (inChat()) lockShow(); else lockHide(); lastChatAt = 0; return; }
        if (C.until) { C.until = 0; C.sec = 0; C.w = 0; csave(); lockHide(); if (inChat()) { try { app.showToast('رجعت الدردشة، لا تطوّل!'); } catch (e) {} } }
        if (C.d !== today()) { C.d = today(); C.tot = 0; C.locks = 0; }
        if (!inChat()) { lastChatAt = 0; if (C.last && now - C.last > 20 * 60000 && C.sec) { C.sec = 0; C.w = 0; csave(); } return; }
        const dt = lastChatAt ? Math.min(15, (now - lastChatAt) / 1000) : 0;
        lastChatAt = now; C.sec += dt; C.tot += dt; C.last = now;
        if (C.sec >= LOCK) {
            const mins = C.tot >= 3600 ? 45 : [10, 20, 30][Math.min(C.locks, 2)];
            C.locks++; C.until = now + mins * 60000; csave(); dismiss(false); lockShow(); return;
        }
        if (C.sec >= WARN2 && C.w < 2) { C.w = 2; csave(); forceFrom = 'tr'; say(compose('chat2'), 'chat'); }
        else if (C.sec >= WARN1 && C.w < 1) { C.w = 1; csave(); forceFrom = 'tr'; say(compose('chat1'), 'chat'); }
        else if (Math.round(C.sec) % 30 < 6) csave();
    }

    // ---------- settings ----------
    function sheet() {
        const f = S.freq, tg = (k, l, d) => `<div class="mc-row"><span>${l}<small>${d}</small></span><button class="mc-tg${S[k] ? ' on' : ''}" onclick="app.mcFlag('${k}')" role="switch" aria-checked="${S[k] ? 'true' : 'false'}"><i></i></button></div>`;
        return `<div class="rp-h"><span class="mc-mini">${owl('happy')}</span><div><b>أبو الهمّة</b><small>مرشدك اللي يحثك على الدراسة</small></div><button class="rp-x" onclick="app.mcSetClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div>
            ${tg('on', 'تشغيل أبو الهمّة', 'يطلع ويحجي وياك من وقت لوقت')}
            ${tg('shake', 'يطلع إذا هزّيت الموبايل', 'هز الهاتف وشوف شنو يكول')}
            ${tg('chat', 'يراقب الدردشة', 'يعاتبك إذا طوّلت دردشة، ويوقف المحادثة مؤقتاً ويرجعك للدراسة')}
            ${tg('voice', 'صوت (يقرا الكلام)', 'يعتمد على صوت عربي بهاتفك')}
            <div class="rp-lab">شكد يطلع؟</div>
            <div class="rp-chips">${[['rare', 'قليل'], ['normal', 'عادي'], ['often', 'كثير']].map((x) => `<button class="${f === x[0] ? 'on' : ''}" onclick="app.mcFreq('${x[0]}')">${x[1]}</button>`).join('')}</div>
            <p class="rp-foot">ما يطلع وانت تدرس أو تحجي أو تكتب، وما يزعجك بالليل. وإذا تتجاهله يقلل نفسه. المكالمات ما تنوقف أبداً. وتكدر تطفّي مراقبة الدردشة من فوق.</p>
            <button class="rp-ok" onclick="app.mcTest()">جرّبه هسه</button>`;
    }
    function drawSheet() { const s = document.querySelector('#mcSet .rp-sheet'); if (s) { s.innerHTML = sheet(); try { lucide.createIcons(); } catch (e) {} } }

    Object.assign(app, {
        mcSettings() {
            load(); dismiss(false);
            document.getElementById('mcSet')?.remove();
            const w = document.createElement('div'); w.id = 'mcSet'; w.className = 'rp-w';
            w.innerHTML = '<div class="rp-bd" onclick="app.mcSetClose()"></div><div class="rp-sheet" role="dialog">' + sheet() + '</div>';
            document.body.appendChild(w); requestAnimationFrame(() => w.classList.add('on')); try { lucide.createIcons(); } catch (e) {}
        },
        mcSetClose() { document.getElementById('mcSet')?.remove(); },
        mcFlag(k) { S[k] = !S[k]; save(); if (k === 'on' && S.on) { ignored = 0; next = 0; } if (k === 'chat' || k === 'on') chatTick(); drawSheet(); },
        mcChatEnter() { chatTick(); },
        mcLockStudy() { lockHide(); this.mcStudy(); },
        mcLockOff() { S.chat = false; save(); lockHide(); this.showToast('تمام، طفّيت مراقبة الدردشة. تكدر ترجّعها من إعدادات أبو الهمّة'); },
        mcFreq(f) { S.freq = f; ignored = 0; next = 0; save(); drawSheet(); },
        mcTest() { this.mcSetClose(); setTimeout(() => say(compose(Math.random() < 0.5 ? 'nag' : 'scold'), 'test'), 350); },
        mcSay(cat, from) { forceFrom = from || ''; say(compose(cat || 'nag'), 'test'); },
        mcTap() {
            const tx = $('mcTx'); if (tx && cur && tx.textContent.length < cur.t.length) { clearInterval(typeT); tx.textContent = cur.t; $('mcOwl')?.classList.remove('talk'); return; }
            dismiss(false);
        },
        mcStudy() {
            ignored = 0; dismiss(false); next = Date.now() + 45 * 60000;
            this.goToTimer();
            setTimeout(() => { const sc = $('tmScene'); if (sc && !sc.classList.contains('tm-run') && this.tmToggle) this.tmToggle(); }, 1100);
        },
        mcLater() { dismiss(true); next = Date.now() + 25 * 60000; },
        mcMuteToday() { S.mute = today(); save(); dismiss(false); this.showToast('تمام، سكتّ اليوم. باجر أرجع أذكّرك'); },
    });

    load(); patchActivity(); sensors();
    if (!timer) timer = setInterval(tick, 30000);
    cload(); setInterval(chatTick, 5000);
    window.MascotOwl = owl;
})();
