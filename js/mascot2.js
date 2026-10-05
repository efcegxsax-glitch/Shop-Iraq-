// أبو الهمّة: surprise stunts. Besides the talking owl (js/mascot.js) he now sneaks in on his own: he peeks from a screen edge, watches the
// student, hides, comes back, tells jokes. Every stunt is built from parts: an entrance x a behaviour x an exit x a spot on the edge, so
// thousands of different motions come out of a few dozen pieces (app.mcStuntCount()), plus a set of scripted skits. Tap him to catch him,
// tap his bubble to hear another joke. Switched on/off from his settings; shares the "may I talk now" rules of js/mascot.js (window.MascotAPI).
(function () {
    const A = window.MascotAPI;
    if (!A) return;
    const $ = (id) => document.getElementById(id);
    const rnd = A.rnd;
    const K = () => (typeof window.__mcsK === 'number' ? window.__mcsK : 1);
    const ABORT = { abort: true };
    const KEY = 'isp:mcs:v1';
    let el = null, bub = null, geo = null, run = 0, active = false, forced = false, pst = null, watch = 0, ptrFn = null, bubT = 0, nextAt = 0, lastCombo = '', count = 0;
    let CS = { d: '', n: 0, caught: 0 };

    const pad = (n) => String(n).padStart(2, '0');
    const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    function cload() { try { CS = JSON.parse(localStorage.getItem(KEY) || 'null') || CS; } catch (e) {} if (CS.d !== today()) CS = { d: today(), n: 0, caught: 0 }; }
    const csave = () => { try { localStorage.setItem(KEY, JSON.stringify(CS)); } catch (e) {} };

    // ---------- the things he says ----------
    const L = {
        peek: ['شششش... ما شفتني؟', 'أني هنا من ساعة أراقبك!', 'لا تلتفت... أني مو موجود.', 'شفتك شفتك! تتصفح بدل ما تدرس؟', 'أني أبو الهمّة المخابراتي، مهمتي: أنت.', 'وصلني خبر انك ما درست... صحيح؟', 'أراقب أراقب أراقب!'],
        hide: ['لبدت... محد يشوفني.', 'ششش اسكت، هسه راح يروح.', 'أني صخرة، ما أتحرك.', 'هذا مو أني، هذا أثاث.'],
        back: ['بوووو!', 'رجعت! اشتقتلي؟', 'ها؟ شفتني؟', 'ما كدرت أبتعد عنك!'],
        caught: ['انمسكت! طيب طيب، أدرس وياك!', 'آآخ كشفتني! أني بريء!', 'ليش مسكتني؟ كنت أمزح!', 'خلاص استسلمت، لا تضربني!', 'مسكتني! هسه تعال ادرس مثل ما وعدتني.'],
        joke: [
            'واحد كال لصاحبه: دراستك شلونها؟ كاله: مثل الإنترنت، كلما أحتاجها تنقطع!',
            'المعلم: ليش متأخر؟ الطالب: شفت لافتة "المدرسة قدّام، سوق على مهلك" فمشيت على مهلي.',
            'ليش البومة ما تنام بالليل؟ لأنها تدرس! وانت ليش تنام؟',
            'طالب نام بالامتحان وحلم إنه يحل، يوم صحي ورقته فاضية بس بكامل الأحلام.',
            'الطالب الذكي يدرس قبل الامتحان بشهر، والطالب المؤمن بالمعجزات يدرس قبله بليلة.',
            'قال الأستاذ: اللي يعرف الجواب يرفع إيده. محد رفع... حتى أني خفت أنطي الجواب!',
            'الكتاب مثل الصديق، تحجي وياه شوية وتكتشف إنه أصدق من البقية.',
            'سألوا الطالب: شنو هوايتك؟ كال: النوم بالمحاضرة. كالوا: هذا مو هواية، هذا موهبة!',
            'أني بومة، وما أسهر بالغلط، أني أسهر بقصد... وانت؟',
            'ليش الطالب يحب الجمعة؟ لأنها الوحيدة اللي ما فيها امتحان مفاجئ.',
            'سالفة الدفتر الفاضي: ينطيك أمل بس ما ينطيك علامة.',
            'قال لي واحد: الدراسة صعبة. كلتله: صعبة لو ما بدأت؟ سكت.',
            'شلون تعرف إن الطالب يدرس؟ يكول "هسه هسه" من ثلاث ساعات.',
            'اللي يكول باجر أدرس، باجر يكول باجر. هذي السلسلة ما تنتهي!',
            'المنبّه مثل المعلم: كل يوم يصيح وأنت ما تسمع.',
        ],
        chat: ['شلونك اليوم؟', 'الجو حلو للدراسة اليوم، تدري؟', 'أني أحب أسولف وياك، بس بعد الدراسة.', 'شكد صار لك تتصفح؟ أني عديت!', 'أحب الشاي مع الدراسة، أنت؟', 'اليوم شنو أكلت؟ الدماغ يريد غدا حلو.', 'أسمع صوت معدتك... روح كل شي ورجّع ادرس.'],
        silly: ['أكلت ملزمة اليوم... طعمها مو حلو.', 'سمعت شخير؟ لا لا أني ما أنام!', 'عندي مشكلة: كل ما أقرا أنعس. شنو أسوي؟', 'شفت شكد أنا أنيق بالقبعة؟', 'أحاول أحفظ جدول الضرب من يومين... بعدني على الاثنين.'],
    };
    const lineOf = (k) => rnd(L[k]);

    // ---------- geometry and the little animation engine ----------
    const tf = (p) => `translate(${p.x}px,${p.y}px) rotate(${p.r}deg) scale(${(p.f ? -1 : 1) * p.s},${p.s})`;
    const mix = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, r: a.r + (b.r - a.r) * k, s: a.s + (b.s - a.s) * k, o: 1, f: b.f });
    function measure() {
        const vw = window.innerWidth, vh = window.innerHeight, W = Math.max(78, Math.min(112, vw * 0.27));
        geo = { vw, vh, W, H: W * 232 / 200 };
    }
    function pose(edge, t, k) {
        const { W, H, vw, vh } = geo, ty = 90 + t * Math.max(40, vh - H - 260), tx = 14 + t * Math.max(20, vw - W - 28);
        const m = {
            L: { hid: { x: -W - 8, y: ty, r: 10, f: 0 }, peek: { x: -W * 0.56, y: ty, r: 10, f: 0 }, out: { x: 10, y: ty, r: -4, f: 0 } },
            R: { hid: { x: vw + 8, y: ty, r: -10, f: 1 }, peek: { x: vw - W * 0.44, y: ty, r: -10, f: 1 }, out: { x: vw - W - 10, y: ty, r: 4, f: 1 } },
            T: { hid: { x: tx, y: -H - 8, r: 180, f: 0 }, peek: { x: tx, y: -H * 0.5, r: 180, f: 0 }, out: { x: tx, y: 74, r: 360, f: 0 } },
            B: { hid: { x: tx, y: vh + 8, r: 0, f: 0 }, peek: { x: tx, y: vh - H * 0.52, r: 0, f: 0 }, out: { x: tx, y: vh - H - 96, r: 0, f: 0 } },
        };
        return Object.assign({ s: 1, o: 1 }, m[edge][k]);
    }
    async function wait(ms) { const t = run; await new Promise((r) => setTimeout(r, ms * K())); if (t !== run) throw ABORT; }
    async function go(frames, ms, ease) {
        const t = run, list = [Object.assign({}, pst)]; let c = pst;
        frames.forEach((f) => { c = Object.assign({}, c, f); list.push(c); });
        pst = Object.assign({}, c);
        const an = el.animate(list.map((p) => ({ transform: tf(p), opacity: p.o })), { duration: Math.max(1, ms * K()), easing: ease || 'ease-in-out', fill: 'forwards' });
        try { await an.finished; } catch (e) {}
        if (t !== run) { an.cancel(); throw ABORT; }
        el.style.transform = tf(pst); el.style.opacity = String(pst.o); an.cancel();
    }
    const put = (p) => { pst = Object.assign({ s: 1, o: 1 }, p); el.style.transform = tf(pst); el.style.opacity = String(pst.o); };
    const mood = (m) => { const ob = el && el.querySelector('.mc-ob'); if (ob) ob.innerHTML = A.owl(m); };
    const look = (dx, dy) => { el && el.querySelectorAll('.mc-pu').forEach((g) => { g.style.transform = `translate(${dx}px,${dy}px)`; }); };
    const act = (c, ms) => { if (!el) return; el.classList.add(c); setTimeout(() => el && el.classList.remove(c), ms * K()); };
    function place() {
        if (!bub || !el) return;
        const r = el.getBoundingClientRect(), vw = geo.vw, vh = geo.vh;
        const cx = Math.max(20, Math.min(vw - 20, r.left + r.width / 2)), h = bub.offsetHeight, below = r.top < h + 30;
        bub.style.left = Math.max(8, Math.min(vw - bub.offsetWidth - 8, cx - bub.offsetWidth / 2)) + 'px';
        bub.style.top = Math.max(8, Math.min(vh - h - 8, below ? Math.max(r.bottom, 40) + 10 : r.top - h - 10)) + 'px';
    }
    async function say(text, hold) {
        if (!bub) { bub = document.createElement('div'); bub.className = 'ms-b'; bub.dir = 'rtl'; bub.addEventListener('click', jokeTime); document.body.appendChild(bub); }
        bub.textContent = text; place(); requestAnimationFrame(() => bub && bub.classList.add('on'));
        el.classList.add('talk'); setTimeout(() => el && el.classList.remove('talk'), Math.min(2400, text.length * 55) * K());
        await wait(hold || 900 + text.length * 60);
    }
    const hush = () => { if (bub) bub.classList.remove('on'); };

    // ---------- 12 ways in, 12 ways out ----------
    const ENTER = {
        slide: (h, p) => go([p], 650, 'cubic-bezier(.2,.9,.3,1)'),
        pop: (h, p) => go([mix(h, p, 1.25), p], 520, 'cubic-bezier(.3,1.6,.5,1)'),
        bounce: (h, p) => go([mix(h, p, 1.5), mix(h, p, 0.8), mix(h, p, 1.2), p], 1000),
        tiptoe: async (h, p) => { for (let i = 1; i <= 5; i++) { await go([mix(h, p, i / 5)], 240); await wait(200); } },
        zoom: async (h, p) => { put(Object.assign({}, p, { s: 0, o: 0 })); await go([{ s: 1.2, o: 1 }, { s: 1 }], 520); },
        spin: (h, p) => go([Object.assign(mix(h, p, 0.5), { r: h.r + 360 }), Object.assign({}, p, { r: p.r + 720 })], 850),
        drop: async (h, p) => { put(Object.assign({}, p, { y: p.y - geo.vh * 0.7 })); await go([{ y: p.y + 16 }, { y: p.y - 12 }, { y: p.y }], 950, 'cubic-bezier(.5,0,1,.6)'); },
        swing: (h, p) => go([Object.assign(mix(h, p, 0.6), { r: h.r + 35 }), Object.assign(mix(h, p, 0.9), { r: h.r - 25 }), p], 900),
        flutter: async (h, p) => { el.classList.add('fly'); await go([Object.assign(mix(h, p, 0.3), { y: p.y - 60 }), Object.assign(mix(h, p, 0.6), { y: p.y + 30 }), Object.assign(mix(h, p, 0.85), { y: p.y - 20 }), p], 1200); el && el.classList.remove('fly'); },
        shakein: async (h, p) => { await go([p], 380); for (let i = 0; i < 4; i++) await go([{ r: p.r + (i % 2 ? 8 : -8) }], 70); await go([{ r: p.r }], 70); },
        roll: (h, p) => go([Object.assign(mix(h, p, 0.5), { r: h.r - 360 }), Object.assign({}, p, { r: p.r - 720 })], 900),
        creep: (h, p) => go([p], 1500, 'ease-in'),
    };
    const EXIT = {
        slide: (h) => go([h], 550, 'ease-in'),
        pop: (h) => go([h], 220, 'cubic-bezier(.6,0,1,.5)'),
        dash: async (h) => { await go([{ x: pst.x + (h.x < pst.x ? 14 : -14) }], 180); await go([h], 260, 'cubic-bezier(.7,0,1,.4)'); },
        spin: (h) => go([Object.assign({}, h, { r: pst.r + 540 })], 800),
        fall: (h) => go([{ y: geo.vh + 140, r: pst.r + 50 }], 800, 'ease-in'),
        fly: async (h) => { el.classList.add('fly'); await go([{ y: -geo.H - 80, x: pst.x + (pst.x < geo.vw / 2 ? -40 : 40), r: pst.r - 14, s: 0.7 }], 1000, 'ease-in'); el && el.classList.remove('fly'); },
        vanish: async () => { await go([{ s: 0.2, o: 0 }], 550); },
        tiptoe: async (h) => { const a = Object.assign({}, pst); for (let i = 1; i <= 4; i++) { await go([mix(a, h, i / 4)], 220); await wait(160); } },
        bounce: (h) => go([Object.assign(mix(pst, h, 0.1), { y: pst.y - 40 }), h], 700, 'ease-in'),
        shrink: async (h) => { await go([{ s: 0.3 }], 450); put(Object.assign({}, h, { s: 0.3 })); await wait(10); },
        catapult: async (h) => { await go([mix(pst, h, -0.25)], 300); await go([h], 260, 'cubic-bezier(.8,0,1,.5)'); },
        roll: (h) => go([Object.assign({}, h, { r: pst.r + 720 })], 800, 'ease-in'),
    };

    // ---------- behaviours: what he does while he is there ----------
    // each gets the spot (edge e, place t) and works from the "peek" pose; some come out fully first
    const BEH = {
        watch: async () => { say(lineOf('peek'), 4000).catch(() => {}); for (const d of [[-6, 0], [6, 1], [0, -4], [-5, 3]]) { look(d[0], d[1]); await wait(600); } },
        follow: async () => { mood('stern'); await say('عيوني وراك وين ما تروح!', 3600); },
        hideseek: async (s) => { await say(lineOf('peek'), 1800); hush(); await go([pose(s.e, s.t, 'hid')], 380); await wait(1400); say(lineOf('back'), 1500).catch(() => {}); await go([pose(s.e, s.t, 'peek')], 260, 'cubic-bezier(.3,1.6,.5,1)'); act('act-shake', 600); },
        spy: async () => { mood('stern'); look(-6, 2); await say('أراقب... أراقب...', 1500); look(6, 2); await wait(1000); look(0, 5); await say('شفتك تتصفح! يلا للكتاب.', 2600); },
        wave: async (s) => { await go([pose(s.e, s.t, 'out')], 500); mood('happy'); act('act-flap', 900); await say('هلا بيك! شلونك؟', 2200); },
        yawn: async () => { mood('sleepy'); await say('آآآآه... نعسان. هسه أنام شوية.', 2600); mood('stern'); await say('لا لا، ما أنام! الدراسة أولاً.', 2000); },
        sneeze: async () => { mood('shock'); await say('أأأأ... أأأتشووو!', 1500); act('act-shake', 700); await wait(700); mood('happy'); await say('غبار الكتب اللي ما تفتحها!', 2400); },
        sleep: async () => { mood('sleepy'); await say('زززز... خمس دقايق بس...', 2800); look(0, 6); await wait(1200); mood('shock'); act('act-hop', 600); await say('مو نايم! كنت أفكر.', 1800); },
        dance: async (s) => { await go([pose(s.e, s.t, 'out')], 450); mood('happy'); for (let i = 0; i < 4; i++) { await go([{ r: pst.r + 12 }], 160); await go([{ r: pst.r - 24 }], 160); await go([{ r: pst.r + 12 }], 160); act('act-hop', 400); } await say('ما أعرف أدبك، بس أحاول!', 2200); },
        whistle: async () => { mood('happy'); look(4, -3); await say('♪ ♫ ♪ ما ... ما ... ♫', 2000); look(-4, -3); await say('ما أصفر، أسمع هواي!', 2000); },
        munch: async () => { el.classList.add('talk'); await say('طق طق... أكل الملزمة', 1800); mood('cry'); await say('ما حلوة! حطيت عليها ملح.', 2200); },
        joke: async () => { await say(lineOf('joke'), 5200); mood('laugh'); act('act-hop', 700); await wait(900); },
        scare: async (s) => { hush(); await go([pose(s.e, s.t, 'hid')], 300); await wait(900); mood('shock'); await go([Object.assign(pose(s.e, s.t, 'out'), { s: 1.35 })], 220, 'cubic-bezier(.2,2,.4,1)'); await say('بووو! خفت؟', 1800); await go([{ s: 1 }], 300); },
        knock: async () => { for (let i = 0; i < 3; i++) { await go([{ r: pst.r - 6 }], 90); await go([{ r: pst.r + 6 }], 90); await wait(200); } await say('طق طق طق... محد بالبيت؟ آخ، هذا بيتي!', 2800); },
        stare: async () => { mood('shock'); look(0, 0); await say('شنو كاعد تسوي هسه؟ ليش ما تدرس!', 3200); },
        count: async () => { look(-5, -5); await say('واحد... اثنين... ثلاثة...', 1800); look(5, -5); await say('... أحسب كم دقيقة ما درست!', 2200); },
        cool: async () => { mood('cool'); await say('أني سوبر أبو الهمّة، سري للغاية.', 2800); },
        love: async () => { mood('love'); await say('أحبك، بس لازم تدرس!', 2400); },
        angry: async () => { mood('angry'); act('act-shake', 900); await say('وين الدراسة يا بطل؟!', 2600); },
        cry: async () => { mood('cry'); await say('ما تحبني... ما تدرس ولا تسولف وياي.', 3000); mood('happy'); await say('لا لا أمزح، أني سعيد!', 1800); },
        wink: async () => { mood('wink'); await say('ولا كلمة لأحد: أنت أشطر طالب.', 2800); },
        point: async (s) => { await go([pose(s.e, s.t, 'out')], 500); mood('stern'); look(0, 6); await say('المؤقت هناك تحت، شغّله!', 2600); },
        ball: async (s) => { await go([pose(s.e, s.t, 'out')], 450); mood('happy'); for (let i = 0; i < 4; i++) { await go([{ y: pst.y - 40 }], 200, 'ease-out'); await go([{ y: pst.y + 40 }], 200, 'ease-in'); } await say('تلعب وياي؟ بعد الدراسة!', 2200); },
        peekaboo: async (s) => { for (let i = 0; i < 3; i++) { await go([pose(s.e, s.t, 'hid')], 230); await wait(350); await go([pose(s.e, s.t, 'peek')], 230); await wait(300); } await say('كوكو! ' + lineOf('back'), 1900); },
        chat: async () => { for (let i = 0; i < 3; i++) await say(lineOf('chat'), 2400); },
        silly: async () => { await say(lineOf('silly'), 3200); mood('laugh'); await wait(500); },
        sneak: async (s) => { await say('أتسلل... أتسلل...', 1400); const to = pose(s.e, s.t > 0.5 ? 0 : 1, 'peek'); for (let i = 1; i <= 4; i++) { await go([mix(pose(s.e, s.t, 'peek'), to, i / 4)], 400); await wait(200); } look(5, 0); await say(lineOf('hide'), 2000); },
        slideAlong: async (s) => { await go([pose(s.e, s.t, 'out')], 450); await go([pose(s.e, s.t > 0.5 ? 0 : 1, 'out')], 900, 'ease-in-out'); mood('happy'); await say('وووو! أنزلق!', 1800); },
    };
    // a few scripted skits with a story, built out of the same pieces
    const SKIT = {
        seek3: async (s) => {
            await say(lineOf('hide'), 1500); hush(); await go([pose(s.e, s.t, 'hid')], 300); await wait(1200);
            const e2 = s.e === 'L' ? 'R' : 'L'; put(pose(e2, 0.35, 'hid')); await go([pose(e2, 0.35, 'peek')], 450); look(-5, 0); await say('شفتك! ما تكدر تهرب مني!', 2200);
            hush(); await go([pose(e2, 0.35, 'hid')], 260); await wait(900); put(pose('B', 0.5, 'hid')); await go([pose('B', 0.5, 'out')], 280, 'cubic-bezier(.2,2,.4,1)'); mood('laugh'); await say('بووو! هههه.', 1800);
        },
        spy2: async (s) => {
            mood('stern'); await say('عميل أبو الهمّة لقى الهدف... الهدف يتصفح!', 3000); look(6, 0); await wait(600); await go([pose(s.e, s.t, 'hid')], 250);
            await wait(1000); await go([pose(s.e, s.t, 'peek')], 300); mood('angry'); await say('الهدف ما درس اليوم. أمر: يلا ادرس!', 3000);
        },
        sneezeJoke: async () => { mood('shock'); await say('أأأأتشووو!', 1300); act('act-shake', 700); await wait(500); mood('laugh'); await say(lineOf('joke'), 5200); },
        fakeExit: async (s) => {
            await say('خلاص خلاص، أني رايح...', 1600); await go([pose(s.e, s.t, 'hid')], 400); await wait(1200);
            await go([pose(s.e, s.t, 'peek')], 250); mood('happy'); await say('كنت أمزح! ما أروح.', 2000); await go([pose(s.e, s.t, 'hid')], 300); await wait(800); await go([pose(s.e, s.t, 'peek')], 250); await say('هسه فعلاً أروح.', 1600);
        },
        gift: async (s) => {
            await go([pose(s.e, s.t, 'out')], 500); mood('happy'); act('act-flap', 800); await say('جبتلك نصيحة: ادرس 25 دقيقة وارتاح 5، ولا تسألني ليش.', 4200); mood('wink'); await say('هذي بدون مقابل!', 1800);
        },
        marathon: async (s) => {
            await go([pose(s.e, s.t, 'out')], 450); for (let i = 0; i < 6; i++) { await go([pose(s.e, i % 2 ? 0.1 : 0.9, 'out')], 420, 'ease-in-out'); } mood('dizzy'); await say('ركضت ركضت... تعبت! أنت تدرس وأني أركض؟', 3200);
        },
    };
    const SKIT_KEYS = Object.keys(SKIT);

    // ---------- running one ----------
    const spots = () => { const a = []; ['L', 'R', 'T', 'B'].forEach((e) => [0.15, 0.5, 0.85].forEach((t) => a.push({ e, t }))); return a; };
    function stuntCount() { return Object.keys(ENTER).length * Object.keys(BEH).length * Object.keys(EXIT).length * spots().length + SKIT_KEYS.length * 8; }
    function build() {
        measure();
        el = document.createElement('div'); el.id = 'mcSt'; el.className = 'mc-owl ms-owl';
        el.style.width = geo.W + 'px'; el.style.height = geo.H + 'px';
        el.innerHTML = '<div class="mc-ob">' + A.owl('stern') + '</div>';
        document.body.appendChild(el);
        el.addEventListener('pointerdown', caught);
        ptrFn = (e) => { if (!el) return; const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.4), d = Math.max(60, Math.hypot(dx, dy)); look(Math.round(dx / d * 7), Math.round(dy / d * 6)); };
        document.addEventListener('pointermove', ptrFn, { passive: true });
        watch = setInterval(() => { if (!active) return; if (A.isCur() || document.hidden || (!forced && A.busy(false))) abort(); }, 500);
    }
    function finish() {
        clearInterval(watch); clearTimeout(bubT);
        if (ptrFn) { document.removeEventListener('pointermove', ptrFn); ptrFn = null; }
        if (el) el.remove(); if (bub) bub.remove(); el = bub = null; active = false; forced = false;
    }
    function abort() { run++; finish(); }
    async function caught() {
        if (!active) return;
        run++; CS.caught++; csave();
        hush(); mood('shock'); act('act-shake', 700);
        try {
            await say(CS.caught > 2 ? 'مسكتني ' + CS.caught + ' مرات اليوم! أنت شاطر، بس ادرس هسه!' : lineOf('caught'), 2600);
            mood('laugh'); await wait(500);
            const e = (pst.x < 0 || pst.x < geo.vw / 2) ? 'L' : 'R'; await EXIT.dash(pose(e, 0.5, 'hid'));
        } catch (e) { if (e !== ABORT) throw e; return; }
        finish();
    }
    async function jokeTime() {
        if (!active) return;
        run++; hush(); mood('laugh');
        try { await say(lineOf('joke'), 5600); mood('happy'); await wait(600); hush(); await EXIT[rnd(Object.keys(EXIT))](pose(pst.x < geo.vw / 2 ? 'L' : 'R', 0.5, 'hid')); } catch (e) { if (e !== ABORT) throw e; return; }
        finish();
    }
    async function stunt(force) {
        if (active) return false;
        active = true; forced = !!force; run++;
        let key = '';
        try {
            build();
            const s = rnd(spots()), hid = pose(s.e, s.t, 'hid'), pk = pose(s.e, s.t, 'peek');
            put(hid);
            const skit = Math.random() < 0.3;
            if (skit) {
                const k = rnd(SKIT_KEYS); key = 'skit:' + k + s.e;
                await ENTER.slide(hid, pk); await SKIT[k](s);
            } else {
                const en = rnd(Object.keys(ENTER)), bh = rnd(Object.keys(BEH)), ex = rnd(Object.keys(EXIT)); key = [en, bh, ex, s.e, s.t].join('/');
                await ENTER[en](hid, pk); await wait(250); await BEH[bh](s); hush(); await wait(200);
                await EXIT[ex](pose(s.e, s.t, 'hid'));
            }
            lastCombo = key; count++;
            hush(); await wait(300);
        } catch (e) { if (e !== ABORT) { console.warn(e); finish(); } return true; }
        CS.n++; csave(); finish(); return true;
    }

    // ---------- when he comes by himself ----------
    const RANGE = { rare: [16, 30], normal: [8, 18], often: [4, 9] }, CAP = { rare: 4, normal: 8, often: 14 };
    function tick() {
        const S = A.S(); if (!S || S.stunts === false || !A.enabled() || active || A.isCur() || A.quiet()) return;
        if (!nextAt) { nextAt = Date.now() + (3 + Math.random() * 3) * 60000; return; }
        if (Date.now() < nextAt) return;
        cload();
        const f = S.freq || 'normal', r = RANGE[f] || RANGE.normal;
        if (CS.n >= (CAP[f] || 8) || A.busy(false) || Date.now() - A.bornAt() < 120000) { nextAt = Date.now() + 90000; return; }
        nextAt = Date.now() + (r[0] + Math.random() * (r[1] - r[0])) * 60000;
        stunt(false);
    }
    Object.assign(app, {
        mcStunt() { A.dismissMain && A.dismissMain(); try { app.mcSetClose && app.mcSetClose(); } catch (e) {} setTimeout(() => stunt(true), 400); },
        mcStuntCount: stuntCount,
        _mcStuntTest: () => ({ ENTER: Object.keys(ENTER), BEH: Object.keys(BEH), EXIT: Object.keys(EXIT), SKIT: SKIT_KEYS, play: stunt, abort, last: () => lastCombo, done: () => count }),
    });
    cload(); setInterval(tick, 30000);
})();
