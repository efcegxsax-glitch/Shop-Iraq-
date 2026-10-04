// تحدي مباشر: a live head-to-head quiz. Two students see the same 7 questions at the same moment (12 seconds each,
// the faster the right answer the more points), a tug-of-war bar shows who leads, and the winner gets a few points.
// Opponents: a friend (invite card or room code / link), a student searching at the same time (quick match), or the
// computer when nobody is around. The host puts the questions in duelRooms/{rid}, both write only their own answers
// (duelRooms/{rid}/p/{uid}/ans/{k} = {i, t}), and every phone works out the scores itself from the same data and the
// shared server clock, so the two screens stay in step. Stats are kept on the phone: isp:dl:v1.
// Loaded on demand by app._need('duel').
(function () {
    const KEY = 'isp:dl:v1';
    const QN = 7, QMS = 12000, REV = 3200, INTRO = 4500;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const rnd = (a) => a[Math.floor(Math.random() * a.length)];
    const pad = (n) => String(n).padStart(2, '0');
    const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

    // [question, right answer, wrong, wrong, wrong]
    const SUBJ = [
        ['phys', 'الفيزياء', '#2563EB', 'atom', [
            ['وحدة قياس السعة الكهربائية؟', 'الفاراد', 'الهنري', 'الأوم', 'الواط'],
            ['وحدة قياس المحاثة (الحث الذاتي)؟', 'الهنري', 'الفاراد', 'التسلا', 'الجول'],
            ['وحدة قياس كثافة الفيض المغناطيسي؟', 'التسلا', 'الواط', 'الأوم', 'الفولت'],
            ['ينص قانون لنز على أن التيار المحتث يعاكس:', 'التغير في الفيض المغناطيسي المسبب له', 'اتجاه حركة الإلكترونات فقط', 'المقاومة الكهربائية', 'تردد التيار'],
            ['عند الرنين في دائرة RLC على التوالي تكون المعاوقة:', 'أقل ما يمكن', 'أكبر ما يمكن', 'لا نهائية', 'صفراً دائماً'],
            ['الظاهرة التي فسّرها أينشتاين بنظرية الفوتون:', 'الظاهرة الكهروضوئية', 'الحيود', 'الانكسار', 'الاستقطاب'],
            ['سرعة الضوء في الفراغ تقريباً:', '3 × 10⁸ م/ث', '3 × 10⁶ م/ث', '3 × 10⁵ م/ث', '3 × 10¹⁰ م/ث'],
            ['طاقة الفوتون تساوي:', 'h × f', 'h ÷ f', 'h × λ', 'm × g'],
            ['المحولة الرافعة للفولتية يكون عدد لفات ملفها الثانوي:', 'أكبر من الابتدائي', 'أقل من الابتدائي', 'مساوياً للابتدائي', 'صفراً'],
            ['قانون أوم:', 'V = I × R', 'V = I ÷ R', 'V = R ÷ I', 'V = I² × R'],
            ['وحدة قياس التردد:', 'الهرتز', 'الثانية', 'المتر', 'النيوتن'],
            ['ظاهرة تداخل الضوء تثبت أن للضوء طبيعة:', 'موجية', 'جسيمية فقط', 'صوتية', 'مغناطيسية فقط'],
            ['عند ربط مواسعين على التوازي فإن السعة المكافئة:', 'مجموع السعتين', 'حاصل ضربهما', 'أقل من الأصغر', 'تساوي صفراً'],
            ['القوة الدافعة المحتثة في الحث الذاتي تتناسب مع:', 'المعدل الزمني لتغير التيار', 'قيمة التيار نفسه', 'مقاومة الملف فقط', 'طول السلك فقط'],
        ]],
        ['chem', 'الكيمياء', '#16A34A', 'flask-conical', [
            ['الرقم الهيدروجيني للماء النقي عند 25°م:', '7', '1', '14', '0'],
            ['القاعدة تعطي في الماء أيونات:', 'OH⁻', 'H⁺', 'Cl⁻', 'Na⁺'],
            ['الصيغة العامة للألكانات:', 'CₙH₂ₙ₊₂', 'CₙH₂ₙ', 'CₙH₂ₙ₋₂', 'CₙHₙ'],
            ['عدد أفوكادرو يساوي تقريباً:', '6.02 × 10²³', '6.02 × 10¹⁹', '3 × 10⁸', '1.6 × 10⁻¹⁹'],
            ['في الخلية الغلفانية تحدث الأكسدة عند:', 'الأنود', 'الكاثود', 'القنطرة الملحية فقط', 'الوعاء'],
            ['زيادة تركيز المتفاعلات في تفاعل متزن تزيح الاتزان نحو:', 'النواتج', 'المتفاعلات', 'لا تؤثر', 'توقف التفاعل'],
            ['المجموعة الوظيفية للكحولات:', '–OH', '–COOH', '–CHO', '–NH₂'],
            ['المجموعة الوظيفية للأحماض الكربوكسيلية:', '–COOH', '–OH', '–CO–', '–CHO'],
            ['الصيغة الكيميائية للماء:', 'H₂O', 'CO₂', 'O₂', 'NaCl'],
            ['غاز نبيل من الآتي:', 'الهيليوم', 'الأوكسجين', 'النتروجين', 'الهيدروجين'],
            ['المحلول الحامضي رقمه الهيدروجيني:', 'أقل من 7', 'يساوي 7', 'أكبر من 7', 'يساوي 14'],
            ['التفاعل الذي يمتص حرارة يسمى:', 'ماصاً للحرارة', 'باعثاً للحرارة', 'أيونياً', 'متعادلاً'],
            ['العدد الذري يمثل عدد:', 'البروتونات', 'النيوترونات فقط', 'الإلكترونات والنيوترونات', 'الكتلة'],
            ['الرابطة بين الصوديوم والكلور في ملح الطعام:', 'أيونية', 'تساهمية', 'فلزية', 'هيدروجينية'],
        ]],
        ['math', 'الرياضيات', '#F97316', 'sigma', [
            ['مشتقة الدالة x²:', '2x', 'x', 'x²', '2'],
            ['∫ 2x dx =', 'x² + c', '2x² + c', 'x + c', '2 + c'],
            ['log₁₀ 1000 =', '3', '2', '10', '100'],
            ['sin 30° =', '½', '√3 ÷ 2', '1', '√2 ÷ 2'],
            ['i² =', '−1', '1', 'i', '−i'],
            ['lim (x→0) sin x ÷ x =', '1', '0', '∞', '−1'],
            ['مشتقة sin x:', 'cos x', '−cos x', 'sin x', '−sin x'],
            ['e⁰ =', '1', '0', 'e', '∞'],
            ['مجموع زوايا المثلث الداخلية:', '180°', '90°', '360°', '270°'],
            ['مشتقة العدد الثابت:', 'صفر', '1', 'العدد نفسه', '∞'],
            ['إذا كان المميز b² − 4ac أكبر من الصفر فللمعادلة التربيعية:', 'جذران حقيقيان مختلفان', 'جذر واحد مكرر', 'جذران مركبان', 'لا حل لها'],
            ['5! =', '120', '25', '60', '24'],
            ['ميل المستقيم y = 3x + 2:', '3', '2', '5', '1.5'],
            ['cos 0° =', '1', '0', '−1', '½'],
            ['مشتقة ln x:', '1 ÷ x', 'x', 'eˣ', 'ln(1 ÷ x)'],
        ]],
        ['bio', 'الأحياء', '#E11D48', 'dna', [
            ['العضية المسؤولة عن إنتاج الطاقة ATP:', 'المايتوكوندريا', 'الرايبوسوم', 'النواة', 'جهاز كولجي'],
            ['شكل جزيئة DNA:', 'حلزون مزدوج', 'خيط مفرد', 'كرة', 'حلقة مغلقة فقط'],
            ['عدد الكروموسومات في الخلية الجسمية للإنسان:', '46', '23', '44', '48'],
            ['البناء الضوئي يحدث في:', 'البلاستيدات الخضراء', 'المايتوكوندريا', 'الرايبوسوم', 'النواة'],
            ['الغدة التي تفرز الأنسولين:', 'البنكرياس', 'الكبد', 'الغدة الدرقية', 'الكظرية'],
            ['فصيلة الدم المعطي العام:', 'O سالب', 'AB موجب', 'A موجب', 'B سالب'],
            ['وحدة بناء الجهاز العصبي:', 'العصبون', 'النفرون', 'الحويصلة', 'الكرية'],
            ['الوحدة الوظيفية في الكلية:', 'النفرون', 'العصبون', 'الحويصلة', 'السنخ'],
            ['الانقسام المتساوي ينتج:', 'خليتين متشابهتين وراثياً', 'أربع خلايا مختلفة', 'خلية واحدة', 'ثماني خلايا'],
            ['القاعدة المقابلة للأدنين في DNA:', 'الثايمين', 'السايتوسين', 'الغوانين', 'اليوراسيل'],
            ['الفيتامين الذي يُصنع في الجلد بتأثير الشمس:', 'فيتامين D', 'فيتامين C', 'فيتامين A', 'فيتامين B12'],
            ['هرمون الغدة الدرقية:', 'الثايروكسين', 'الأنسولين', 'الأدرينالين', 'الغلوكاجون'],
            ['العالم الذي وضع قوانين الوراثة:', 'مندل', 'داروين', 'باستور', 'واطسون'],
            ['الخلايا التي تنقل الأوكسجين في الدم:', 'كريات الدم الحمراء', 'كريات الدم البيضاء', 'الصفائح', 'البلازما'],
        ]],
        ['arab', 'العربي', '#7C3AED', 'book-open', [
            ['المبتدأ يكون:', 'مرفوعاً', 'منصوباً', 'مجروراً', 'مجزوماً'],
            ['«إنّ» وأخواتها تنصب:', 'المبتدأ ويسمى اسمها', 'الخبر', 'الفاعل', 'الحال'],
            ['صاحب كتاب «الأيام»:', 'طه حسين', 'نجيب محفوظ', 'توفيق الحكيم', 'العقاد'],
            ['قائل «على قدر أهل العزم تأتي العزائم»:', 'المتنبي', 'أبو تمام', 'البحتري', 'الفرزدق'],
            ['ضد كلمة «كرم»:', 'بخل', 'شجاعة', 'حلم', 'صدق'],
            ['جمع كلمة «قلم»:', 'أقلام', 'قلمون', 'قلائم', 'أقالم'],
            ['الفاعل حكمه الإعرابي:', 'الرفع', 'النصب', 'الجر', 'الجزم'],
            ['نوع الجملة «جاء الطالبُ»:', 'فعلية', 'اسمية', 'شبه جملة', 'ظرفية'],
            ['علامة رفع جمع المذكر السالم:', 'الواو', 'الألف', 'الياء', 'الفتحة'],
            ['«كان» وأخواتها ترفع المبتدأ وتنصب:', 'الخبر', 'المبتدأ', 'الفاعل', 'المضاف'],
            ['الجملة الاستفهامية تنتهي بـ:', 'علامة استفهام', 'نقطة', 'فاصلة', 'علامة تعجب'],
            ['مرادف كلمة «الحبور»:', 'السرور', 'الحزن', 'الغضب', 'الخوف'],
            ['المصدر من الفعل «انطلق»:', 'انطلاق', 'منطلق', 'ينطلق', 'انطلقوا'],
            ['الشاعر صاحب ديوان «أنشودة المطر»:', 'بدر شاكر السياب', 'نازك الملائكة', 'الجواهري', 'البياتي'],
        ]],
        ['eng', 'الإنكليزي', '#0891B2', 'languages', [
            ['Past tense of “go”:', 'went', 'goed', 'gone', 'going'],
            ['She ___ to school every day.', 'goes', 'go', 'going', 'gone'],
            ['Plural of “child”:', 'children', 'childs', 'childes', 'childrens'],
            ['Opposite of “increase”:', 'decrease', 'raise', 'improve', 'expand'],
            ['I have lived here ___ 2010.', 'since', 'for', 'from', 'at'],
            ['If it rains tomorrow, we ___ at home.', 'will stay', 'would stay', 'stayed', 'stay'],
            ['Synonym of “big”:', 'large', 'tiny', 'thin', 'weak'],
            ['The book ___ by Ali.', 'was written', 'wrote', 'writes', 'has write'],
            ['He is ___ than his brother.', 'taller', 'tall', 'tallest', 'more tall'],
            ['There ___ a book on the table.', 'is', 'are', 'be', 'were'],
            ['___ do you live? — In Baghdad.', 'Where', 'When', 'Who', 'Why'],
            ['Past participle of “write”:', 'written', 'wrote', 'writed', 'writing'],
            ['She is interested ___ science.', 'in', 'on', 'at', 'for'],
            ['I ___ studying now.', 'am', 'is', 'are', 'be'],
        ]],
        ['isl', 'الإسلامية', '#0F766E', 'moon-star', [
            ['عدد أركان الإسلام:', 'خمسة', 'أربعة', 'ستة', 'سبعة'],
            ['أول سورة في المصحف:', 'الفاتحة', 'البقرة', 'الإخلاص', 'الناس'],
            ['عدد أركان الإيمان:', 'ستة', 'خمسة', 'سبعة', 'أربعة'],
            ['أطول سورة في القرآن الكريم:', 'البقرة', 'آل عمران', 'النساء', 'الكهف'],
            ['عدد سور القرآن الكريم:', '114', '110', '120', '99'],
            ['عدد ركعات صلاة الفجر:', 'ركعتان', 'ثلاث', 'أربع', 'واحدة'],
            ['شهر الصيام:', 'رمضان', 'شعبان', 'شوال', 'رجب'],
            ['وقعت غزوة بدر في السنة:', 'الثانية للهجرة', 'الأولى للهجرة', 'الثالثة للهجرة', 'الخامسة للهجرة'],
            ['أول الخلفاء الراشدين:', 'أبو بكر الصديق', 'عمر بن الخطاب', 'عثمان بن عفان', 'علي بن أبي طالب'],
            ['أولى زوجات النبي ﷺ:', 'خديجة بنت خويلد', 'عائشة', 'حفصة', 'زينب'],
            ['الكتاب المنزل على عيسى عليه السلام:', 'الإنجيل', 'التوراة', 'الزبور', 'صحف إبراهيم'],
            ['يؤدى الحج في شهر:', 'ذي الحجة', 'محرم', 'صفر', 'رجب'],
            ['خاتم الأنبياء والمرسلين:', 'محمد ﷺ', 'عيسى', 'موسى', 'إبراهيم'],
        ]],
        ['gen', 'ثقافة عامة', '#CA8A04', 'globe', [
            ['عاصمة العراق:', 'بغداد', 'البصرة', 'أربيل', 'الموصل'],
            ['عاصمة إقليم كردستان:', 'أربيل', 'السليمانية', 'دهوك', 'كركوك'],
            ['النهران الرئيسان في العراق:', 'دجلة والفرات', 'النيل والفرات', 'الليطاني والعاصي', 'دجلة والأردن'],
            ['أكبر محافظة عراقية مساحةً:', 'الأنبار', 'نينوى', 'البصرة', 'ذي قار'],
            ['يلتقي دجلة والفرات في:', 'القرنة', 'بغداد', 'الموصل', 'سامراء'],
            ['زقورة أور تقع في محافظة:', 'ذي قار', 'بابل', 'النجف', 'ميسان'],
            ['الملك الذي صدرت باسمه شريعة بابلية مشهورة:', 'حمورابي', 'نبوخذنصر', 'سرجون الأكدي', 'جلجامش'],
            ['أكبر كواكب المجموعة الشمسية:', 'المشتري', 'زحل', 'الأرض', 'المريخ'],
            ['عدد قارات العالم:', 'سبع', 'خمس', 'ست', 'ثمان'],
            ['أكبر محيطات العالم:', 'الهادئ', 'الأطلسي', 'الهندي', 'المتجمد الشمالي'],
            ['مدينة سامراء مشهورة بمئذنتها:', 'الملوية', 'الزقورة', 'القبة', 'الشناشيل'],
            ['العملة الرسمية للعراق:', 'الدينار', 'الريال', 'الدرهم', 'الليرة'],
            ['اللغة الرسمية الثانية في العراق مع العربية:', 'الكردية', 'الإنكليزية', 'الفارسية', 'السريانية'],
        ]],
    ];
    const SUBJ_BY = {}; SUBJ.forEach((s) => { SUBJ_BY[s[0]] = s; });
    const OPT_COL = ['#ef4444', '#3b82f6', '#f59e0b', '#22c55e'];
    const OPT_SHAPE = ['M12 4 L21 20 H3 Z', 'M12 3 L21 12 L12 21 L3 12 Z', 'M12 12 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0', 'M5 5 H19 V19 H5 Z'];
    const BOTS = ['سجاد (حاسوب)', 'زهراء (حاسوب)', 'حسن (حاسوب)', 'مريم (حاسوب)', 'كرار (حاسوب)', 'نور (حاسوب)'];

    let ST = null, D = null, off = 0, offUn = null, frameT = 0, sel = 'mix', srchTimers = [], srchUn = [], notice = '';
    const H = () => window.firebaseDbHelpers, DB = () => window.firebaseDb, R = (p) => H().ref(DB(), p);
    const now = () => Date.now() + off;
    const me = () => app.authUid;

    function load() {
        try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === 1) ST = o; } catch (e) {}
        if (!ST) ST = { v: 1, w: 0, l: 0, d: 0, streak: 0, best: 0, mute: false, day: { d: today(), pts: 0 }, paid: [] };
        if (!ST.day || ST.day.d !== today()) ST.day = { d: today(), pts: 0 };
        if (!Array.isArray(ST.paid)) ST.paid = [];
    }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} };
    const hue = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
    const initial = (n) => (String(n || '؟').trim()[0] || '؟');
    const avatar = (n, big) => `<span class="dl-av${big ? ' big' : ''}" style="--h:${hue(String(n))}">${esc(initial(n))}</span>`;

    // ---------- sounds ----------
    let actx = null;
    function tone(f, d, type, vol, at) {
        if (ST.mute) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
            const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + (at || 0);
            o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
        } catch (e) {}
    }
    const sfx = {
        tick: () => tone(660, 0.07, 'square', 0.05), go: () => { tone(523, 0.12, 'triangle', 0.18); tone(784, 0.2, 'triangle', 0.18, 0.12); },
        right: () => { tone(660, 0.1, 'triangle', 0.2); tone(880, 0.18, 'triangle', 0.2, 0.09); }, wrong: () => { tone(220, 0.22, 'sawtooth', 0.12); tone(165, 0.3, 'sawtooth', 0.12, 0.12); },
        win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.2, i * 0.13)), lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.28, 'sine', 0.16, i * 0.17)),
    };

    // ---------- questions ----------
    function buildQs(subj) {
        let pool;
        if (subj === 'mix') { pool = []; SUBJ.forEach((s) => s[4].forEach((q) => pool.push({ s: s[1], q }))); }
        else pool = SUBJ_BY[subj][4].map((q) => ({ s: SUBJ_BY[subj][1], q }));
        return shuffle(pool).slice(0, QN).map((x) => { const opts = shuffle(x.q.slice(1).map((t, i) => ({ t, ok: i === 0 }))); return { q: x.q[0], o: opts.map((o) => o.t), c: opts.findIndex((o) => o.ok), s: x.s }; });
    }
    const subjName = (id) => (id === 'mix' ? 'منوّع' : (SUBJ_BY[id] || [0, 'منوّع'])[1]);

    // ---------- clean up ----------
    function stopSearch() {
        srchTimers.forEach(clearTimeout); srchTimers = [];
        srchUn.forEach((u) => { try { u(); } catch (e) {} }); srchUn = [];
        if (DB() && me() && D && D.queue) { H().remove(R('duelQueue/' + D.queue + '/' + me())).catch(() => {}); H().remove(R('duelMatch/' + me())).catch(() => {}); }
    }
    function endSession(keepRoom) {
        clearInterval(frameT); frameT = 0; app._duelOn = false;
        stopSearch();
        if (D) {
            if (D.un) { try { D.un(); } catch (e) {} }
            if (!keepRoom && D.mode === 'room' && DB() && me()) {
                if (D.started && !D.finished) H().set(R('duelRooms/' + D.rid + '/p/' + me() + '/left'), Date.now()).catch(() => {});
                else if (D.host && !D.started) H().remove(R('duelRooms/' + D.rid)).catch(() => {});
            }
        }
        D = null;
    }

    // ---------- screens ----------
    const root = () => $('dlContent');
    function shell(inner, cls) {
        const r = root(); if (!r) return;
        r.innerHTML = `<div class="dl-root ${cls || ''}" id="dlRoot"><div class="dl-bg"><i></i><i></i><i></i></div>${inner}</div>`;
        try { lucide.createIcons(); } catch (e) {}
    }
    const topBar = (title, sub) => `<div class="dl-top"><button class="dl-ic" onclick="app.dlBack()" aria-label="رجوع"><i data-lucide="chevron-right"></i></button><div class="dl-tt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div><button class="dl-ic" onclick="app.dlMute()" aria-label="الصوت"><i data-lucide="${ST.mute ? 'volume-x' : 'volume-2'}"></i></button></div>`;

    function lobby() {
        endSession(true);
        const inv = (app._dlInvites || []).filter((x) => Date.now() - (x.at || 0) < 10 * 60000);
        const tot = ST.w + ST.l + ST.d;
        shell(`${topBar('تحدي مباشر', 'تنافس وياه لحظة بلحظة')}
            <div class="dl-body">
                <div class="dl-hero">
                    <div class="dl-hero-t"><b>${tot ? Math.round((ST.w / tot) * 100) + '%' : '—'}</b><small>نسبة الفوز</small></div>
                    <div class="dl-stats"><div><b>${ST.w}</b><small>فوز</small></div><div><b>${ST.l}</b><small>خسارة</small></div><div><b>${ST.streak}</b><small>متتالي</small></div><div><b>${ST.best}</b><small>أفضل</small></div></div>
                </div>
                ${notice ? `<div class="dl-note">${esc(notice)}</div>` : ''}
                ${inv.map((x) => `<div class="dl-inv"><i data-lucide="swords"></i><div><b>${esc(x.fn || 'صديقك')} يتحداك</b><small>${esc(subjName(x.subj))}</small></div><button class="go" onclick="app.dlJoin(${jsArg(x.rid)})">اقبل</button><button onclick="app.dlDecline(${jsArg(x.rid)})" aria-label="رفض"><i data-lucide="x"></i></button></div>`).join('')}
                <div class="dl-lab">اختار المادة</div>
                <div class="dl-subj">${[['mix', 'منوّع', '#8B5CF6', 'shuffle']].concat(SUBJ.map((s) => [s[0], s[1], s[2], s[3]])).map((s) => `<button class="${sel === s[0] ? 'on' : ''}" style="--c:${s[2]}" onclick="app.dlSel('${s[0]}')"><i data-lucide="${s[3]}"></i><span>${s[1]}</span></button>`).join('')}</div>
                <button class="dl-main" onclick="app.dlQuick()"><i data-lucide="zap"></i>ابحث عن منافس</button>
                <div class="dl-two"><button onclick="app.dlFriend()"><i data-lucide="user-plus"></i>تحدَّ صديق</button><button onclick="app.dlCode()"><i data-lucide="hash"></i>ادخل برمز</button></div>
                <button class="dl-ghost" onclick="app.dlBot()"><i data-lucide="bot"></i>تدرّب ضد الحاسوب</button>
                <p class="dl-how">${QN} أسئلة، ${QMS / 1000} ثانية لكل سؤال. الجواب الصحيح الأسرع يجيب نقاط أكثر، والأعلى نقاطاً يفوز.</p>
            </div>`);
        notice = '';
    }

    function searching(label, cancel) {
        shell(`${topBar('تحدي مباشر')}
            <div class="dl-center"><div class="dl-radar"><i></i><i></i><i></i><span><i data-lucide="swords"></i></span></div>
                <h3 id="dlSrT">${label}</h3><p id="dlSrP" class="dl-mut">${esc(subjName(sel))}</p>
                <div id="dlSrA"></div>
                <button class="dl-ghost" onclick="app.dlCancel()">إلغاء</button></div>`);
    }

    function waitRoom() {
        shell(`${topBar('تحدي صديق', esc(subjName(D.subj)))}
            <div class="dl-center"><div class="dl-radar small"><i></i><i></i><span><i data-lucide="user-round"></i></span></div>
                <h3>بانتظار صديقك...</h3>
                <div class="dl-code" dir="ltr">${D.rid.toUpperCase()}</div><p class="dl-mut">يدخل بهذا الرمز، أو من الرابط</p>
                <div class="dl-two"><button onclick="app.dlShare()"><i data-lucide="share-2"></i>دز الرابط</button><button onclick="app.dlFriend(true)"><i data-lucide="user-plus"></i>ادعُ من أصدقائك</button></div>
                <button class="dl-ghost" onclick="app.dlCancel()">إلغاء التحدي</button></div>`);
    }

    function intro() {
        shell(`${topBar('تحدي مباشر', esc(subjName(D.subj)))}
            <div class="dl-center vs"><div class="dl-vs"><div class="dl-p me">${avatar(D.myName, true)}<b>أنت</b></div><div class="dl-x">VS</div><div class="dl-p">${avatar(D.opp.name, true)}<b>${esc(D.opp.name)}</b></div></div>
                <div class="dl-cd" id="dlCd">3</div><p class="dl-mut">جهّز نفسك، السؤال الأول يبدأ</p></div>`, 'intro');
    }

    function play() {
        shell(`<div class="dl-top slim"><button class="dl-ic" onclick="app.dlBack()" aria-label="انسحاب"><i data-lucide="x"></i></button>
                <div class="dl-pl me">${avatar(D.myName)}<div><b>أنت</b><span id="dlMyS">0</span></div></div>
                <div class="dl-qn" id="dlQn">1 / ${QN}</div>
                <div class="dl-pl opp"><div><b>${esc(D.opp.name)}</b><span id="dlOpS">0</span></div>${avatar(D.opp.name)}</div></div>
            <div class="dl-body play">
                <div class="dl-tug"><i id="dlBM"></i><i id="dlBO"></i></div>
                <div class="dl-tm"><i id="dlTB"></i><b id="dlTN">12</b></div>
                <div class="dl-q" id="dlQ"></div>
                <div class="dl-opts" id="dlOpts"></div>
                <div class="dl-foot" id="dlFoot"></div>
            </div>`, 'playing');
    }

    // ---------- the match ----------
    const A = (uid, k) => { const m = D.mine && uid === me() ? D.mine[k] : null; if (m) return m; if (D.mode === 'bot') return uid === 'bot' ? D.botAns[k] : (D.mine || {})[k]; const p = (D.room && D.room.p) || {}; return p[uid] && p[uid].ans ? p[uid].ans[k] : undefined; };
    const pts = (a, k) => (a && a.i === D.qs[k].c ? 100 + Math.max(0, Math.round(((QMS - a.t) / QMS) * 100)) : 0);
    const scoreUpTo = (uid, k) => { let s = 0; for (let j = 0; j <= k; j++) s += pts(A(uid, j), j); return s; };
    // a question lasts QMS + REV, or less when both answered: then the reveal starts at the slower answer and lasts 2.2 s
    const bothAns = (k) => { const x = A(me(), k), y = A(D.opp.uid, k); return x && y ? Math.min(QMS, Math.max(x.t, y.t)) : 0; };
    const qEnd = (k) => bothAns(k) || QMS;
    const durOf = (k) => (bothAns(k) ? bothAns(k) + 2200 : QMS + REV);
    function phaseAt(t) {
        if (t < D.startAt) return { ph: 'intro', left: D.startAt - t };
        let acc = D.startAt;
        for (let k = 0; k < QN; k++) {
            const d = durOf(k);
            if (t < acc + d) { const o = t - acc; return o < qEnd(k) ? { ph: 'q', k, o, left: QMS - o } : { ph: 'rev', k, o, left: acc + d - t }; }
            acc += d;
        }
        return { ph: 'end', k: QN - 1 };
    }
    const doneCount = (t) => { if (t < D.startAt) return 0; let acc = D.startAt, n = 0; for (let k = 0; k < QN; k++) { acc += durOf(k); if (t >= acc) n++; else break; } return n; };

    function startMatch() {
        D.started = true; D.cur = ''; D.shown = {}; app._duelOn = true;
        intro();
        clearInterval(frameT); frameT = setInterval(frame, 100);
        sfx.tick();
    }

    function frame() {
        if (!D) return;
        const t = now(), p = phaseAt(t);
        // bot answers when its time comes
        if (D.mode === 'bot' && p.k != null && p.ph !== 'intro' && p.ph !== 'end') {
            for (let k = 0; k <= p.k; k++) if (!D.botAns[k] && (k < p.k || p.o >= D.botPlan[k].t)) D.botAns[k] = { i: D.botPlan[k].i, t: D.botPlan[k].t };
        }
        // the other player left
        if (D.mode === 'room' && D.room && D.room.p && D.room.p[D.opp.uid] && D.room.p[D.opp.uid].left && !D.finished) { finish('left'); return; }
        if (p.ph === 'intro') {
            const n = Math.ceil(p.left / 1000), el = $('dlCd');
            if (el) { const txt = p.left < 700 ? 'ابدأ!' : String(Math.min(3, n)); if (el.textContent !== txt) { el.textContent = txt; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); sfx.tick(); } }
            return;
        }
        if (p.ph === 'end') { finish(); return; }
        const key = p.k + ':' + (p.ph === 'q' ? 'q' : 'r') + (A(me(), p.k) ? 1 : 0) + (A(D.opp.uid, p.k) ? 1 : 0);
        if (!$('dlQ')) { play(); D.cur = ''; }
        if (D.cur !== key) { D.cur = key; drawQ(p); }
        // timer bar and numbers
        const tb = $('dlTB'), tn = $('dlTN'), left = p.ph === 'q' ? p.left : 0;
        if (tb) { tb.style.width = (left / QMS) * 100 + '%'; tb.dataset.low = left < 4000 ? '1' : ''; }
        if (tn) { const s = Math.ceil(left / 1000); if (tn.textContent !== String(s)) { tn.textContent = s; if (p.ph === 'q' && s <= 3 && s > 0) sfx.tick(); } }
        const foot = $('dlFoot');
        if (foot) {
            if (p.ph === 'q') { const oa = A(D.opp.uid, p.k); foot.innerHTML = oa ? `<span class="dl-ok"><i data-lucide="check"></i>${esc(D.opp.name)} جاوب</span>` : `<span class="dl-mut">${esc(D.opp.name)} يفكر...</span>`; }
            else foot.innerHTML = `<span class="dl-mut">${p.k === QN - 1 ? 'النتيجة بعد' : 'السؤال الجاي بعد'} ${Math.ceil(p.left / 1000)}</span>`;
        }
        updateScores(p);
    }

    function updateScores(p) {
        const k = p.ph === 'rev' ? p.k : p.k - 1;
        const ms = k >= 0 ? scoreUpTo(me(), k) : 0, os = k >= 0 ? scoreUpTo(D.opp.uid, k) : 0, tot = Math.max(1, ms + os);
        const a = $('dlMyS'), b = $('dlOpS'); if (a) a.textContent = ms; if (b) b.textContent = os;
        const bm = $('dlBM'), bo = $('dlBO'); if (bm) bm.style.width = (ms + os ? (ms / tot) * 100 : 50) + '%'; if (bo) bo.style.width = (ms + os ? (os / tot) * 100 : 50) + '%';
    }

    function drawQ(p) {
        const k = p.k, q = D.qs[k], qn = $('dlQn'); if (qn) qn.textContent = (k + 1) + ' / ' + QN;
        $('dlQ').innerHTML = `<small>${esc(q.s)}</small><p dir="auto">${esc(q.q)}</p>`;
        const mine = A(me(), k), theirs = A(D.opp.uid, k), rev = p.ph === 'rev';
        $('dlOpts').innerHTML = q.o.map((t, i) => {
            let cls = 'dl-o', badge = '';
            if (rev) {
                if (i === q.c) cls += ' ok'; else if (mine && mine.i === i) cls += ' bad'; else cls += ' dim';
                if (mine && mine.i === i) badge += `<em class="me">أنت</em>`; if (theirs && theirs.i === i) badge += `<em class="op">${esc(D.opp.name.split(' ')[0])}</em>`;
            } else if (mine && mine.i === i) cls += ' sel';
            return `<button class="${cls}" style="--c:${OPT_COL[i]}" onclick="app.dlPick(${i})" ${mine || rev ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="${OPT_SHAPE[i]}" fill="currentColor"/></svg><span dir="auto">${esc(t)}</span>${badge ? `<div class="dl-bd">${badge}</div>` : ''}</button>`;
        }).join('');
        if (rev) {
            const ok = mine && mine.i === q.c, got = pts(mine, k);
            if (!D.shown[k]) {
                D.shown[k] = 1;
                if (mine) { (ok ? sfx.right : sfx.wrong)(); if (!ok) addMistake(q, mine.i); } else sfx.wrong();
                if (navigator.vibrate) { try { navigator.vibrate(ok ? 30 : [60, 40, 60]); } catch (e) {} }
            }
            const f = document.createElement('div'); f.className = 'dl-float ' + (ok ? 'up' : 'no'); f.textContent = ok ? '+' + got : (mine ? 'غلط' : 'انتهى الوقت');
            $('dlOpts').appendChild(f);
        }
        try { lucide.createIcons(); } catch (e) {}
    }
    function addMistake(q, pick) { try { app._mkAdd({ src: 'quiz', s: q.s, q: q.q, ch: q.o, a: q.c, why: '', pick }); } catch (e) {} }

    function pick(i) {
        if (!D || !D.started) return;
        const p = phaseAt(now()); if (p.ph !== 'q') return;
        const k = p.k; if (A(me(), k)) return;
        const t = Math.max(0, Math.min(QMS, Math.round(p.o)));
        D.mine = D.mine || {}; D.mine[k] = { i, t };
        if (D.mode === 'room') H().set(R('duelRooms/' + D.rid + '/p/' + me() + '/ans/' + k), { i, t }).catch(() => {});
        D.cur = ''; // draws the "answered" look, or the reveal right away if the other one is done
        tone(i === D.qs[k].c ? 700 : 300, 0.05, 'sine', 0.06);
        frame();
    }

    function finish(why) {
        if (!D || D.finished) return;
        D.finished = true; clearInterval(frameT); frameT = 0; app._duelOn = false;
        const total = (uid, upto) => { let s = 0; for (let j = 0; j <= upto; j++) s += pts(A(uid, j), j); return s; };
        let upto = QN - 1;
        if (why === 'left') upto = doneCount(now()) - 1;
        const ms = upto >= 0 ? total(me(), upto) : 0, os = upto >= 0 ? total(D.opp.uid, upto) : 0;
        let res = ms > os ? 'win' : ms < os ? 'lose' : 'draw';
        if (why === 'left') res = upto >= 2 ? 'win' : 'void';
        let right = 0, tsum = 0, n = 0; for (let j = 0; j <= upto; j++) { const a = A(me(), j); if (a && a.i === D.qs[j].c) { right++; tsum += a.t; n++; } }
        let reward = 0;
        if (res !== 'void') {
            if (res === 'win') { ST.w++; ST.streak++; ST.best = Math.max(ST.best, ST.streak); } else if (res === 'lose') { ST.l++; ST.streak = 0; } else ST.d++;
            const base = D.mode === 'bot' ? (res === 'win' ? 3 : 0) : res === 'win' ? 10 : res === 'draw' ? 5 : 2;
            const cap = D.mode === 'bot' ? 15 : 60, key = D.mode === 'bot' ? null : D.rid;
            if (base > 0 && ST.day.pts < cap && (!key || ST.paid.indexOf(key) === -1)) { reward = Math.min(base, cap - ST.day.pts); ST.day.pts += reward; if (key) { ST.paid.push(key); if (ST.paid.length > 40) ST.paid.shift(); } }
            save();
            if (reward) app.addPointsAtomic(reward).catch(() => {});
        }
        if (D.mode === 'room' && D.host) { const rid = D.rid; setTimeout(() => H().remove(R('duelRooms/' + rid)).catch(() => {}), 20000); }
        const info = { res, ms, os, right, upto: upto + 1, avg: n ? Math.round(tsum / n / 100) / 10 : 0, reward, opp: D.opp.name, why, subj: D.subj, mode: D.mode, myName: D.myName };
        endSession(true);
        resultView(info);
    }

    function resultView(r) {
        const T = { win: ['فزت!', 'trophy', 'win'], lose: ['خسرت هالمرة', 'frown', 'lose'], draw: ['تعادل!', 'handshake', 'draw'], void: ['انتهى التحدي', 'info', 'draw'] }[r.res];
        (r.res === 'win' ? sfx.win : r.res === 'lose' ? sfx.lose : sfx.tick)();
        if (navigator.vibrate) { try { navigator.vibrate(r.res === 'win' ? [80, 60, 80, 60, 160] : 60); } catch (e) {} }
        const msg = r.res === 'win' ? (r.why === 'left' ? 'خصمك انسحب وانت فزت' : 'أداء ممتاز، هيج الأبطال') : r.res === 'lose' ? 'لا تزعل، راجع أخطاءك بدفتر الغلطات وارجع للثأر' : r.res === 'void' ? 'خصمك غادر بالبداية وما انحسب التحدي' : 'تنافس قوي من الطرفين';
        shell(`${topBar('النتيجة')}
            <div class="dl-center res ${T[2]}">${r.res === 'win' ? '<div class="dl-conf">' + Array.from({ length: 26 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 9) * 0.18}s;--c:${OPT_COL[i % 4]}"></i>`).join('') + '</div>' : ''}
                <div class="dl-trophy"><i data-lucide="${T[1]}"></i></div><h2>${T[0]}</h2><p class="dl-mut">${esc(msg)}</p>
                <div class="dl-final"><div class="${r.res === 'win' ? 'w' : ''}">${avatar(r.myName)}<b>أنت</b><strong>${r.ms}</strong></div><span>ضد</span><div class="${r.res === 'lose' ? 'w' : ''}">${avatar(r.opp)}<b>${esc(r.opp)}</b><strong>${r.os}</strong></div></div>
                <div class="dl-chips"><span><b>${r.right}</b> / ${r.upto}<small>إجابات صحيحة</small></span><span><b>${r.avg || '—'}</b><small>ثانية بالمعدل</small></span>${r.reward ? `<span class="gold"><b>+${r.reward}</b><small>نقطة</small></span>` : ''}</div>
                <button class="dl-main" onclick="app.dlAgain(${jsArg(r.mode)})"><i data-lucide="rotate-ccw"></i>${r.mode === 'bot' ? 'جولة ثانية' : 'تحدي جديد'}</button>
                <button class="dl-ghost" onclick="app.dlLobby()">رجوع للقائمة</button></div>`, 'result');
    }

    // ---------- opponents ----------
    function newRid() { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
    const myName = () => String((app.currentUser && app.currentUser.fullName) || 'طالب').slice(0, 40);

    function needLogin() { if (!app.isLoggedIn || !app.authUid || !DB()) { app.showToast('سجّل دخولك حتى تتحدى'); return true; } return false; }

    async function makeRoom(subj, inviteUid) {
        const rid = newRid(), qs = buildQs(subj);
        D = { mode: 'room', host: true, rid, subj, myName: myName(), qs, opp: null };
        await H().set(R('duelRooms/' + rid), { host: me(), hn: myName(), subj, n: QN, at: Date.now(), qs });
        try { H().onDisconnect(R('duelRooms/' + rid)).remove(); } catch (e) {}
        if (inviteUid) await sendInvite(inviteUid, rid, subj);
        listenRoom();
        return rid;
    }
    function sendInvite(uid, rid, subj) {
        return H().set(R('duelInv/' + uid + '/' + rid), { from: me(), fn: myName(), subj, at: Date.now() });
    }
    async function joinRoom(rid) {
        if (needLogin()) return;
        rid = String(rid || '').trim().toLowerCase();
        if (!/^[a-z0-9]{6}$/.test(rid)) { app.showToast('الرمز غير صحيح'); return; }
        searching('نجهّز التحدي...');
        let room = null;
        try { const s = await H().get(R('duelRooms/' + rid)); room = s.val(); } catch (e) {}
        if (!room || room.startAt || (room.guest && room.guest !== me()) || room.host === me() || Date.now() - (room.at || 0) > 15 * 60000) { notice = 'التحدي غير موجود أو بدأ أو امتلأ'; lobby(); return; }
        D = { mode: 'room', host: false, rid, subj: room.subj, myName: myName(), qs: null, opp: { uid: room.host, name: room.hn || 'خصم' } };
        try { await H().update(R('duelRooms/' + rid), { guest: me(), gn: myName() }); } catch (e) { D = null; notice = 'ما كدرنا ندخل التحدي'; lobby(); return; }
        await H().remove(R('duelInv/' + me() + '/' + rid)).catch(() => {});
        listenRoom();
        const t = setTimeout(() => { if (D && !D.started) { endSession(true); notice = 'المضيف ما بدأ التحدي'; lobby(); } }, 25000); srchTimers.push(t);
    }
    function listenRoom() {
        const un = H().onValue(R('duelRooms/' + D.rid), (snap) => {
            if (!D) return;
            const room = snap.val();
            if (!room) { if (D.started && !D.finished) finish('left'); else if (!D.finished) { endSession(true); notice = 'انتهى التحدي'; if (app.currentView === 'duelView') lobby(); } return; }
            D.room = room;
            if (!D.qs) D.qs = Object.keys(room.qs || {}).sort((a, b) => a - b).map((k) => room.qs[k]);
            if (D.host && room.guest && !D.opp) { D.opp = { uid: room.guest, name: room.gn || 'خصم' }; }
            if (D.host && D.opp && !room.startAt && !D.starting) { D.starting = true; H().set(R('duelRooms/' + D.rid + '/startAt'), now() + INTRO).catch(() => { D.starting = false; }); }
            if (room.startAt && !D.started && D.opp) { D.startAt = room.startAt; srchTimers.forEach(clearTimeout); srchTimers = []; D.queue = null; startMatch(); }
        }, () => {});
        D.un = un;
    }
    function startBot() {
        endSession(false);
        const subj = sel, qs = buildQs(subj), skill = 0.5 + Math.random() * 0.3;
        D = { mode: 'bot', rid: 'bot', subj, myName: myName(), qs, opp: { uid: 'bot', name: rnd(BOTS) }, botAns: {}, botPlan: qs.map((q) => { const right = Math.random() < skill; const wrongs = [0, 1, 2, 3].filter((x) => x !== q.c); return { i: right ? q.c : rnd(wrongs), t: Math.round(2200 + Math.random() * 6800) }; }), startAt: now() + 3500 };
        startMatch();
    }

    // quick match: both write themselves in the queue; the one with the smaller id claims the other
    async function quick() {
        if (needLogin()) return;
        endSession(false);
        const subj = sel, path = 'duelQueue/' + subj + '/' + me();
        D = { queue: subj, subj };
        searching('نبحث عن منافس...');
        const stamp = () => H().set(R(path), { n: myName(), at: now() }).catch(() => {});
        await stamp(); try { H().onDisconnect(R(path)).remove(); } catch (e) {}
        srchTimers.push(setInterval(stamp, 25000));
        const un1 = H().onValue(R('duelMatch/' + me()), (s) => { const rid = s.val(); if (rid && /^[a-z0-9]{6}$/.test(rid) && D && D.queue) { D.queue = null; H().remove(R('duelMatch/' + me())).catch(() => {}); H().remove(R(path)).catch(() => {}); stopSearch(); joinRoom(rid); } }, () => {});
        let claiming = false;
        const un2 = H().onValue(R('duelQueue/' + subj), async (s) => {
            if (!D || !D.queue || claiming) return;
            const v = s.val() || {};
            const cands = Object.keys(v).filter((u) => u > me() && v[u] && now() - (v[u].at || 0) < 60000);
            if (!cands.length) return;
            claiming = true;
            const other = cands[0];
            try {
                const r = await H().runTransaction(R('duelQueue/' + subj + '/' + other), (cur) => (cur ? null : undefined));
                if (r.committed) { D.queue = null; await H().remove(R(path)).catch(() => {}); stopSearch(); D = null; if ($('dlSrT')) $('dlSrT').textContent = 'لكينا منافس!'; const rid = await makeRoom(subj, null); await H().set(R('duelMatch/' + other), rid); }
                else claiming = false;
            } catch (e) { claiming = false; }
        }, () => {});
        srchUn.push(un1, un2);
        srchTimers.push(setTimeout(() => { const a = $('dlSrA'); if ($('dlSrP')) $('dlSrP').textContent = 'ما لكينا أحد هسه، تريد تتدرب ضد الحاسوب؟'; if (a) a.innerHTML = '<button class="dl-main" onclick="app.dlBot()"><i data-lucide="bot"></i>العب ضد الحاسوب</button>'; try { lucide.createIcons(); } catch (e) {} }, 18000));
    }

    function friendSheet(fromWait) {
        const fr = (typeof friendsList !== 'undefined' ? friendsList : []).filter((f) => f && f.uid);
        const w = document.createElement('div'); w.id = 'dlSheet'; w.className = 'dl-sheetw';
        w.innerHTML = `<div class="dl-bd2" onclick="app.dlSheetClose()"></div><div class="dl-sheet"><div class="dl-sh-h"><b>${fromWait ? 'ادعُ من أصدقائك' : 'تحدَّ صديقك'}</b><button class="dl-ic sm" onclick="app.dlSheetClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div>
            ${fr.length ? fr.map((f) => `<div class="dl-fr">${avatar(f.name)}<b>${esc(f.name || 'طالب')}</b><button onclick="app.dlInviteFriend(${jsArg(f.uid)}, this)">${fromWait ? 'ادعُ' : 'تحدَّ'}</button></div>`).join('') : '<p class="dl-mut c">ماكو أصدقاء بعد. ضيف أصدقاء من صفحة الأصدقاء، أو دز رمز التحدي.</p>'}</div>`;
        const r = $('dlRoot') || document.body; r.appendChild(w); requestAnimationFrame(() => w.classList.add('on')); try { lucide.createIcons(); } catch (e) {}
    }
    const sheetClose = () => { $('dlSheet')?.remove(); };

    Object.assign(app, {
        dlOpen(rid) { load(); if (!DB()) { shell(topBar('تحدي مباشر') + '<div class="dl-center"><p class="dl-mut">ما كدرنا نتصل بالسيرفر</p></div>'); return; } if (offUn) { try { offUn(); } catch (e) {} } offUn = H().onValue(R('.info/serverTimeOffset'), (s) => { off = Number(s.val()) || 0; }, () => {}); if (rid) joinRoom(rid); else lobby(); },
        dlClose() { sheetClose(); endSession(false); if (offUn) { try { offUn(); } catch (e) {} offUn = null; } const r = root(); if (r) r.innerHTML = ''; },
        dlLobby() { endSession(false); lobby(); },
        dlRefresh() { if ($('dlRoot') && $('dlRoot').querySelector('.dl-hero') && !D) lobby(); },
        dlSel(id) { sel = id; document.querySelectorAll('.dl-subj button').forEach((b, i) => b.classList.toggle('on', (['mix'].concat(SUBJ.map((s) => s[0])))[i] === id)); },
        dlMute() { ST.mute = !ST.mute; save(); const b = document.querySelector('.dl-top .dl-ic:last-child'); if (b) { b.innerHTML = `<i data-lucide="${ST.mute ? 'volume-x' : 'volume-2'}"></i>`; try { lucide.createIcons(); } catch (e) {} } },
        dlQuick() { quick(); },
        dlBot() { startBot(); },
        dlJoin(rid) { joinRoom(rid); },
        dlDecline(rid) { if (DB() && me()) H().remove(R('duelInv/' + me() + '/' + rid)).catch(() => {}); app._dlInvites = (app._dlInvites || []).filter((x) => x.rid !== rid); lobby(); },
        dlPick(i) { pick(i); },
        async dlFriend(fromWait) {
            if (needLogin()) return; sheetClose();
            if (!D || !D.host) { endSession(false); try { await makeRoom(sel, null); } catch (e) { app.showToast('ما كدرنا ننشئ التحدي'); D = null; lobby(); return; } waitRoom(); }
            friendSheet(!!fromWait);
        },
        async dlInviteFriend(uid, btn) {
            if (!D || !D.rid) return;
            try { await sendInvite(uid, D.rid, D.subj); if (btn) { btn.textContent = 'انرسلت'; btn.disabled = true; } } catch (e) { app.showToast('ما انرسلت الدعوة'); }
        },
        async dlShare() {
            if (!D || !D.rid) return; const link = location.origin + location.pathname + '?dl=' + D.rid;
            const text = 'تحداك ' + myName() + ' بتحدي مباشر (' + subjName(D.subj) + ') بتطبيق أكـادمي السادس. الرمز: ' + D.rid.toUpperCase() + '\n' + link;
            try { if (navigator.share) await navigator.share({ title: 'تحدي مباشر', text }); else if (navigator.clipboard) { await navigator.clipboard.writeText(text); app.showToast('اننسخ الرابط'); } } catch (e) {}
        },
        dlCode() {
            const w = document.createElement('div'); w.id = 'dlSheet'; w.className = 'dl-sheetw';
            w.innerHTML = `<div class="dl-bd2" onclick="app.dlSheetClose()"></div><div class="dl-sheet"><div class="dl-sh-h"><b>ادخل برمز التحدي</b><button class="dl-ic sm" onclick="app.dlSheetClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div>
                <input id="dlCodeIn" class="dl-in" maxlength="6" dir="ltr" placeholder="مثال: AB3K9Z" autocomplete="off" autocapitalize="characters" onkeydown="if(event.key==='Enter')app.dlCodeGo()"><button class="dl-main" onclick="app.dlCodeGo()">ادخل التحدي</button></div>`;
            ($('dlRoot') || document.body).appendChild(w); requestAnimationFrame(() => { w.classList.add('on'); $('dlCodeIn')?.focus(); }); try { lucide.createIcons(); } catch (e) {}
        },
        dlCodeGo() { const v = ($('dlCodeIn') || {}).value || ''; sheetClose(); joinRoom(v); },
        dlSheetClose() { sheetClose(); },
        dlCancel() { endSession(false); lobby(); },
        dlAgain(mode) { endSession(false); if (mode === 'bot') startBot(); else lobby(); },
        async dlBack() {
            if (D && D.started && !D.finished) {
                if (!(await app.ask({ icon: 'log-out', title: 'تنسحب من التحدي؟', text: 'خصمك يفوز إذا انسحبت.', ok: 'انسحب' }))) return;
                endSession(false); lobby(); return;
            }
            if ($('dlSheet')) { sheetClose(); return; }
            if (D) { endSession(false); lobby(); return; }
            if ($('dlRoot') && $('dlRoot').querySelector('.dl-hero')) app.goBack(); else lobby();
        },
    });
})();
