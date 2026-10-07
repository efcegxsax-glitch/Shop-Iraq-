// أخبار تلكرام: turns a post of a public Telegram news channel into a clean news item of the app (tested in tools/newsbot-test.mjs).
// Pure functions only: cleaning the text, splitting it into a title and a body, spotting adverts and repeated news.
export const BRAND = 'أكـادمي السادس';
export const DEFAULT_IMG = 'https://images.unsplash.com/photo-1562774053-701939374585?w=600&h=400&fit=crop';

const BIDI = /[​-‏‪-‮⁦-⁩﻿]/g;
const PICTO = /[\p{Extended_Pictographic}︎️⃣\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu;
const AR = '\\u0621-\\u064A';
const LEAD = /^[\s|:\-–—•·.#>»«\[\](){}*_~=+،,]+/;
const EDGE = /^[\s|:\-–—•·▪◾◽■□►▶◀«»>~*_=+،,]+|[\s|\-–—•·▪◾◽■□►▶◀«»<~*_=+،,]+$/g;
// the "share this post / join us" lines channels add under every post
const SHARE = /(شارك(وا)?\s*(المنشور|الخبر|القناة|الرابط|مع|الموضوع)|انشر(وا)?\s*(المنشور|الخبر|الموضوع)|ارسل(وا)?\s*(المنشور|الخبر)|تابع(ونا|نا)|اشترك(وا)?\s*(في|ب|بـ)?\s*(القناة|قناتنا|قناة)|انضم(وا)?\s*(ل|إلى|الى|لـ)?\s*(القناة|قناتنا|مجموعتنا)|قناتنا|رابط\s*القناة|للانضمام|لمتابعة\s*المزيد|join\s*us|share\s*(this|the))/i;

// Arabic-Indic digits -> 0-9, no diacritics / tatweel, one form of alef, ya and ta marbuta
export function norm(s) {
    return String(s || '').replace(BIDI, '').toLowerCase()
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6F0))
        .replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
}

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"')\]]+|\b(?:t\.me|telegram\.me|telegram\.dog)\/[^\s<>"')\]]+/gi;
const isTgLink = (u) => /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\//i.test(u);
const AD_LINK = /(wa\.me|whatsapp\.com|chat\.whatsapp|bit\.ly|tinyurl|cutt\.ly|instagram\.com|tiktok\.com|snapchat\.com|shorturl|linktr\.ee)/i;

// -> { text, urgent, links[] }: the post's own words, without the channel's trimmings
export function cleanPost(raw) {
    let t = String(raw || '').replace(BIDI, '').replace(/\r/g, '').replace(/ـ/g, '').replace(PICTO, ' ');
    // links first: the channel's own are dropped, the others are kept aside (the app can show one as a button)
    const links = [];
    t = t.replace(URL_RE, (u) => { u = u.replace(/[.,;:،؛!؟]+$/, ''); if (!isTgLink(u)) links.push(/^https?:/i.test(u) ? u : 'https://' + u); return ' '; });
    // "عاجل": a label at the very start (or a #عاجل tag near it) becomes the app's red badge
    let urgent = false;
    const lead = t.replace(LEAD, '');
    if (new RegExp('^(?:خبر\\s+)?(?:ال)?عاجل(?![' + AR + '])').test(lead)) { urgent = true; t = lead.replace(new RegExp('^(?:خبر\\s+)?(?:ال)?عاجل(?![' + AR + '])\\s*[:|\\-–—]*'), ''); }
    else if (new RegExp('#عاجل(?![' + AR + '_])').test(t.slice(0, 200))) { urgent = true; t = t.replace(new RegExp('#عاجل(?![' + AR + '_])'), ' '); }
    const out = [];
    for (let line of t.split('\n')) {
        const probe = line.replace(/[#@][\w؀-ۿ]+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
        if (!probe) continue;                                         // symbols, a bare link, only tags
        if (SHARE.test(line) && line.length < 160) continue;
        line = line.replace(/\s@[A-Za-z0-9_]{4,}\s*$/, '').replace(/#([\w؀-ۿ]+)/g, (m, w) => w.replace(/_/g, ' '));
        line = line.replace(EDGE, '').replace(/[ \t]{2,}/g, ' ').trim();
        if (line) out.push(line);
    }
    return { text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), urgent, links };
}

const cut = (s, n) => {
    if (s.length <= n) return s;
    const c = s.slice(0, n - 1), i = c.lastIndexOf(' ');
    return (i > n * 0.6 ? c.slice(0, i) : c).replace(/[\s،,:;.\-–]+$/, '') + '…';
};
// the first line (or sentence) is the title, the rest is the body. Limits are the admin form's: 120 and 500.
export function splitNews(text) {
    const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return { title: '', excerpt: '' };
    let title = lines[0], rest = lines.slice(1).join('\n');
    if (title.length > 120) {
        const m = /^(.{40,118}?[.!؟?:؛])\s+(.*)$/s.exec(title);
        if (m) { rest = m[2] + (rest ? '\n' + rest : ''); title = m[1]; }
        else { const t2 = cut(title, 118); rest = title.slice(t2.replace(/…$/, '').length).trim() + (rest ? '\n' + rest : ''); title = t2; }
    }
    title = title.replace(/[:：]\s*$/, '').trim();
    return { title, excerpt: cut(rest.replace(/\n{2,}/g, '\n'), 500) };
}

const CATS = [
    ['weather', /(انواء|طقس|امطار|عاصفه|درجات الحراره|غبار)/],
    ['results', /(نتايج|نتيجه|نتائج)/],
    ['exams', /(امتحان|امتحانات|جدول|الدور الثاني|الدور الثالث|الامتحان)/],
    ['admission', /(قبول|التقديم|تقديم|الدراسات المسائيه|الجامعات)/],
    ['grants', /(منح|منحه|زمالات|زماله|ابتعاث)/],
    ['decisions', /(قرار|ضوابط|تعليمات|تعميم|كتاب رسمي|امر وزاري)/],
    ['schools', /(مدارس|مدرسه|دوام|عطله|تنقلات|الطلبه|الطلاب|المعلمين|التدريسيين)/],
];
export function pickCategory(text) { const n = norm(text); for (const [c, re] of CATS) if (re.test(n)) return c; return 'other'; }

// ---- adverts ----
const BAD_WORDS = ['للبيع', 'اسعار', 'سعر', 'خصم', 'خصومات', 'تخفيضات', 'عرض خاص', 'عروض خاصه', 'توصيل', 'اطلب', 'واتساب', 'وتساب', 'whatsapp', 'للحجز', 'كوبون', 'ارباح', 'استثمار'];
const PHONE = /(?<!\d)(?:\+?964[\s-]?7|07)\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/;
export const wordList = (s) => String(s || '').split(/[\n,،]+/).map((w) => norm(w).trim()).filter(Boolean).slice(0, 200);
// -> { block: 'the word' } | { flag: 'phone' | 'link' } | {}
export function adCheck(text, extra, links) {
    const n = norm(text);
    for (const w of BAD_WORDS.concat(wordList(extra))) if (n.includes(w)) return { block: w };
    if (PHONE.test(n)) return { flag: 'phone' };
    if ((links || []).some((l) => AD_LINK.test(l))) return { flag: 'link' };
    return {};
}

// ---- repeated news ----
const STOP = new Set(['من', 'في', 'على', 'الى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'ان', 'قد', 'كما', 'بعد', 'قبل', 'او', 'ثم', 'كل', 'بين', 'حتي', 'لقد', 'وقد', 'هو', 'هي', 'تم', 'ما', 'لا', 'به', 'بها', 'له', 'لها']);
export function tokens(text) {
    const set = new Set();
    for (let w of norm(text).split(/[^\p{L}\p{N}]+/u)) {
        if (!w) continue;
        w = w.replace(/^(?:ال|وال|بال|لل)(?=.{2})/, '').replace(/^و(?=.{3})/, '');
        if (w.length < 2 || STOP.has(w)) continue;
        set.add(w);
    }
    return [...set];
}
const jaccard = (a, b) => { if (!a.length || !b.length) return 0; const B = new Set(b); let i = 0; for (const x of a) if (B.has(x)) i++; return i / (a.length + b.length - i); };
const contain = (a, b) => { if (!a.length) return 0; const B = new Set(b); let i = 0; for (const x of a) if (B.has(x)) i++; return i / a.length; };
// cand / pool items: { k: tokens of title + body, t: tokens of the title }. -> the pool item it repeats, or null
export function findDup(cand, pool, th) {
    th = Math.min(0.95, Math.max(0.3, Number(th) || 0.6));
    for (const p of pool) {
        if (jaccard(cand.k, p.k) >= th || (cand.t.length >= 3 && jaccard(cand.t, p.t) >= th)) return p;
        if (cand.t.length >= 5 && contain(cand.t, p.k) >= 0.85) return p;
        if (p.t.length >= 5 && contain(p.t, cand.k) >= 0.85) return p;
    }
    return null;
}
export const itemTokens = (title, excerpt) => ({ k: tokens(title + ' ' + (excerpt || '')), t: tokens(title) });

// ---- the records written to the database ----
const baghdadDate = (ts) => new Date(ts + 3 * 3600000).toISOString().slice(0, 10);
export function newsDoc(it, now) {
    return {
        id: it.id, title: it.title, excerpt: it.excerpt || '', image: it.image || DEFAULT_IMG, category: it.category || 'other',
        date: baghdadDate(now), time: 'الآن', source: BRAND, ...(it.link ? { link: it.link } : {}),
        isUrgent: !!it.urgent, isPinned: false, notifHandled: !!it.notify, isRead: false, isBookmarked: false, views: 0,
        publishedAt: { '.sv': 'timestamp' }, auto: 1,
    };
}
export const notifDoc = (it) => ({
    id: it.id, title: it.title, description: it.excerpt || '', time: 'الآن', read: false,
    type: it.urgent ? 'urgent' : it.category === 'weather' ? 'weather' : 'announcement', createdAt: { '.sv': 'timestamp' },
});
