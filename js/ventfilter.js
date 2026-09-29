// فضفضة's word filter: insults, swearing, sexual and explicit words, in standard Arabic, Iraqi
// dialect, English and Arabizi, written straight or hidden (dots or spaces between letters,
// repeated letters, diacritics, letter look-alikes). It also notices when a post sounds like
// the student might hurt themselves, so the admin hears about it. Used by js/vent.js; kept in
// its own file so it can be tested on its own.
(function (root) {
    // same letters, one form: no diacritics or tatweel; alef, ya, ta marbuta, hamza and Persian
    // letters unified; letters repeated for emphasis collapsed
    function normAr(s) {
        return String(s || '').toLowerCase()
            .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
            .replace(/[إأآٱا]/g, 'ا').replace(/[ىئ]/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ء/g, '')
            .replace(/[گك]/g, 'ك').replace(/ڤ/g, 'ف').replace(/چ/g, 'ج').replace(/پ/g, 'ب').replace(/ژ/g, 'ز').replace(/ڨ/g, 'ق')
            .replace(/([ء-ي])\1+/g, '$1');
    }
    function normLat(s) {
        return String(s || '').toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/!/g, 'i').replace(/\|/g, 'l').replace(/4/g, 'a').replace(/\$/g, 's').replace(/@/g, 'a')
            .replace(/([a-z])\1{2,}/g, '$1$1');
    }

    // whole words (after taking off prefixes and endings)
    const SEX = ['نيك', 'ينيك', 'انيك', 'تنيك', 'نيكه', 'ناك', 'منيوك', 'منيك', 'نياك', 'نياكه', 'نيج', 'ينيج', 'انيج', 'منيوج', 'منيوجه', 'نياجه',
        'كس', 'كسس', 'كساس', 'زب', 'زبر', 'ازبار', 'عير', 'عيور', 'طيز', 'طيزه', 'طيزي', 'بزاز', 'بزازها', 'بعبص', 'بعبوص',
        'سكس', 'سكسي', 'اباحي', 'اباحيه', 'اباحيات', 'بورن', 'شرموط', 'شرموطه', 'شراميط', 'قحبه', 'قحاب', 'قحب', 'كحبه', 'كحاب',
        'عاهر', 'عاهره', 'عاهرات', 'عهر', 'داعر', 'داعره', 'دعاره', 'لوطي', 'لواط', 'مخنث', 'خول', 'منيوكه', 'تنيج', 'مفشخ', 'فشخ', 'ممحون', 'ممحونه',
        'مصمص', 'لحاس', 'كسخت', 'كسخ', 'كسختك', 'زبي', 'كسي', 'نهد', 'بزها', 'ديوث', 'قواد', 'كواد', 'قواده', 'كواده', 'عرص', 'معرص', 'منيوكين'];
    const BAD = ['خنزير', 'خنازير', 'حمار', 'حمير', 'زمال', 'زمايل', 'مطي', 'مطايه', 'جحش', 'سرسري', 'سرسريه', 'سافل', 'سفله', 'حقير', 'حقيره', 'منحط', 'منحطه',
        'واطي', 'واطيه', 'نغل', 'نغول', 'لقيط', 'زربه', 'زرب', 'خرا', 'خره', 'خرى', 'تفو', 'يلعن', 'يلعنك', 'انعل', 'نعلبوك', 'ملعون', 'ملعونه', 'كلب', 'كلاب', 'جلاب',
        'حيوان', 'حيوانه', 'غبي', 'غبيه', 'تافه', 'تافهه', 'زباله', 'وسخ', 'وسخه', 'قذر', 'قذره', 'منافق', 'كذاب', 'دايح', 'دايحه', 'فرخ', 'فروخ', 'طرطور', 'اهبل', 'مسخره',
        'زعطوط', 'زعاطيط', 'هايشه', 'بهيمه', 'بهايم', 'معاق', 'متخلف', 'متخلفه', 'شاذ'];
    // words that are only bad as an insult, e.g. "يا كلب" but not "الكلب بالحديقة"
    const SOFT = new Set(['كلب', 'كلاب', 'حيوان', 'حيوانه', 'غبي', 'غبيه', 'تافه', 'تافهه', 'زباله', 'وسخ', 'وسخه', 'قذر', 'قذره', 'منافق', 'كذاب', 'دايح', 'دايحه', 'فرخ', 'فروخ',
        'حمار', 'حمير', 'جحش', 'مطي', 'مطايه', 'اهبل', 'مسخره', 'بهيمه', 'بهايم', 'معاق', 'متخلف', 'متخلفه', 'شاذ', 'خنزير', 'خنازير', 'ملعون', 'ملعونه', 'نهد']);
    // phrases (checked on the whole text)
    const PHRASES = [
        [/(^| )(يا|ياا|انت|انتي|انتو|هذا|هذي|هاي|ابن|بنت|ولد|ابو|ام) ?(ال)?(كلب|جلب|حيوان|غبي|غبيه|تافه|زباله|وسخ|قذر|حمار|جحش|فرخ|دايح|منافق|كذاب|اهبل|بهيمه|متخلف|معاق|شاذ|خنزير|ملعون|سافل|حقير|نغل)( |$)/, 'bad'],
        [/(^| )(ابن|بنت|ولد|يا) ?ال?(حرام|قحبه|كحبه|شرموطه|منيوكه|منيوجه|عاهره|كلب|جلب|زنا)( |$)/, 'bad'],
        [/(كس|طيز|عير|زب) ?(ام|امك|اختك|ابوك|ابوه|امه|اخته|اهلك|اهلها)/, 'sex'],
        [/(انعل|نعل|يلعن|الله يلعن|لعنه على|لعنة على|تبا ل) ?(ابوك|ابو|امك|اهلك|اخوك|اختك|دينك|ربك|والديك|شرفك|ابوكم|امكم)/, 'bad'],
        [/(اخلي|اريد|راح|يريد) ?(اني|انيك|انيج|اصعد عليك|انام وياك|انام وياكي)/, 'sex'],
        [/صور (عاريه|سكس|اباحيه)|فيديو (سكس|اباحي)|مقاطع (سكس|اباحيه)/, 'sex'],
    ];
    // English and Arabizi, as whole words
    const LAT = ['fuck', 'fucking', 'fucker', 'fck', 'fuk', 'fk', 'wtf', 'shit', 'bitch', 'dick', 'dicks', 'pussy', 'porn', 'porno', 'sex', 'sexy', 'nude', 'nudes', 'xxx', 'xnxx', 'xvideos', 'pornhub',
        'boobs', 'boob', 'tits', 'slut', 'whore', 'cock', 'cum', 'horny', 'bastard', 'asshole', 'ass', 'motherfucker', 'mf', 'nigga', 'nigger', 'faggot', 'fag', 'retard',
        'nik', 'nayek', 'nayk', 'kos', 'kus', 'koss', 'kuss', 'kosomak', 'kusumak', 'zeb', 'zebi', 'zib', 'teez', 'tiz', 'sharmoota', 'sharmouta', 'sharmota', 'charmouta',
        '9a7ba', 'ga7ba', 'qa7ba', 'kha7ba', '3ahra', '3ahira', 'manyok', 'manyak', 'manyouk', 'zaml', 'zmal', 'khara', 'kharra', 'ayr', '3ayr', 'teezak', 'ebn el kalb', 'kawad', 'gawad', 'qawad', 'ma7noon'];
    // said by someone who may hurt themselves
    const DANGER = [/انتحر|انتحار|اقتل نفسي|اموت نفسي|اذبح نفسي|اذي نفسي|اجرح نفسي|اشنق نفسي|احرق نفسي|اريد اموت|ابي اموت|ما اريد اعيش|ما ابي اعيش|تعبت من الحياه|انهي حياتي|اخلص من حياتي|اخلص على نفسي|ارمي نفسي|الموت احسن|اتمنى اموت|اريد اختفي من الدنيا/, /\b(suicide|kill myself|end my life)\b/];

    const norm = (list) => new Set(list.map(normAr));
    const SEXS = norm(SEX), BADS = norm(BAD), SOFTS = new Set([...SOFT].map(normAr));
    const LATS = new Set(LAT.map((w) => w.replace(/ /g, '')));
    const PRE = ['وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ل', 'يا'];
    // everyday words that contain a bad one once a letter is taken off
    const FINE = new Set(['بكس', 'بكسات', 'بعير', 'بعيري', 'زربيه', 'زربيات', 'فكس', 'وكس', 'لكس', 'بزبز', 'زبون', 'زبونه', 'زباين', 'زبونات']);
    const SUF = ['كم', 'كن', 'هم', 'هن', 'ها', 'نا', 'ني', 'ين', 'ون', 'ات', 'ك', 'ه', 'ي', 'ا', 'ت'];
    // a word and its shorter forms without prefixes and endings
    function forms(w) {
        const out = new Set([w]);
        const strip = (x) => {
            for (const p of PRE) if (x.length - p.length >= 2 && x.startsWith(p)) out.add(x.slice(p.length));
        };
        strip(w);
        [...out].forEach((x) => { for (const s of SUF) if (x.length - s.length >= 2 && x.endsWith(s)) { out.add(x.slice(0, -s.length)); strip(x.slice(0, -s.length)); } });
        [...out].forEach((x) => { for (const s of SUF) if (x.length - s.length >= 2 && x.endsWith(s)) out.add(x.slice(0, -s.length)); });
        return out;
    }

    // { kind: 'sex' | 'bad' | null, words: [...], danger: true/false }
    function check(text) {
        const raw = String(text || '');
        const ar = normAr(raw);
        const found = { sex: new Set(), bad: new Set() };
        // Arabic words, with dots, dashes or digits inside a word taken out ("ك.ل.ب")
        const tokens = ar.split(/\s+/).map((t) => t.replace(/[^ء-ي]/g, '')).filter(Boolean);
        // letters written one by one ("ك ل ب") joined back
        const joined = [];
        for (let i = 0; i < tokens.length;) {
            if (tokens[i].length === 1) { let j = i, w = ''; while (j < tokens.length && tokens[j].length === 1) w += tokens[j++]; if (w.length >= 2) joined.push(w); i = j; } else i++;
        }
        const insult = (i) => i > 0 && /^(يا|انت|انتي|انتو|هذا|هذي|هاي|ابن|بنت|ولد|ابو|ام)$/.test(tokens[i - 1]);
        tokens.forEach((t, i) => {
            const fs = forms(t);
            for (const f of fs) if (FINE.has(f)) return;
            for (const f of fs) {
                if (SEXS.has(f)) { if (!SOFTS.has(f) || insult(i)) found.sex.add(f); }
                else if (BADS.has(f)) { if (!SOFTS.has(f) || insult(i) || t.startsWith('يا')) found.bad.add(f); }
            }
        });
        joined.forEach((t) => { for (const f of forms(t)) { if (SEXS.has(f)) found.sex.add(f); else if (BADS.has(f) && !SOFTS.has(f)) found.bad.add(f); } });
        const flat = ' ' + tokens.join(' ') + ' ';
        PHRASES.forEach(([re, kind]) => { const m = flat.match(re); if (m) found[kind].add(m[0].trim()); });
        // Latin and Arabizi
        const lat = normLat(raw).split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
        const latJoined = normLat(raw).replace(/[^a-z0-9]/g, '');
        lat.forEach((w) => { if (LATS.has(w)) found[/^(fuck|fucking|fucker|fck|fuk|fk|wtf|shit|bitch|bastard|asshole|ass|mf|retard|zaml|zmal|khara|kharra|nigga|nigger|faggot|fag)$/.test(w) ? 'bad' : 'sex'].add(w); });
        ['xnxx', 'pornhub', 'xvideos', 'sharmoot', 'sharmout', 'motherfuck', 'fuck'].forEach((w) => { if (latJoined.includes(w)) found.sex.add(w); });
        const danger = DANGER.some((re) => re.test(ar) || re.test(raw.toLowerCase()));
        const kind = found.sex.size ? 'sex' : found.bad.size ? 'bad' : null;
        return { kind, words: [...found.sex, ...found.bad].slice(0, 6), danger };
    }

    root.ventCheck = check;
    if (typeof module !== 'undefined') module.exports = { check, normAr };
})(typeof window !== 'undefined' ? window : globalThis);
