// Premium helpers for the Worker (tested in tools/prem-test.mjs). The Worker reads premium/{uid} and premCfg with the student's own token
// (the database rules let any signed-in student read both) and decides here; the app only shows locks.

export const premActive = (rec, now) => !!rec && typeof rec === 'object' && (typeof rec.until !== 'number' || rec.until > now);
// a part of Premium the panel switched off is off for everybody
export const featOn = (cfg, f) => !(cfg && cfg.f && cfg.f[f] === false);
// the month a free use is counted in: Iraq time (UTC+3)
export const monthKey = (now) => { const d = new Date(now + 3 * 3600000); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; };
export const freeLimit = (cfg) => { const n = Number(cfg && cfg.freeExams); return cfg && cfg.freeExams != null && Number.isFinite(n) && n >= 0 ? Math.min(100, Math.round(n)) : 2; };

// One free use of a part this month, kept in the Worker's key-value store (a counter per student, part and month, forgotten after 40 days).
// -> { ok, used, limit, undo() }: ok false when the month's free uses are gone; undo() gives the use back when the work failed.
export async function takeQuota(kv, uid, kind, limit, now) {
    if (!kv) return { ok: false, used: 0, limit, undo: async () => {}, nokv: true };
    const key = 'pq:' + uid + ':' + kind + ':' + monthKey(now);
    const used = Number(await kv.get(key)) || 0;
    if (used >= limit) return { ok: false, used, limit, undo: async () => {} };
    await kv.put(key, String(used + 1), { expirationTtl: 40 * 86400 });
    return { ok: true, used: used + 1, limit, undo: async () => { try { const n = Number(await kv.get(key)) || 0; await kv.put(key, String(Math.max(0, n - 1)), { expirationTtl: 40 * 86400 }); } catch { /* the use stays counted */ } } };
}

// ---------- grading ----------
export const GRADE_SYSTEM = `أنت مصحح امتحانات عراقي دقيق وعادل للسادس الإعدادي. تُعطى أسئلة الامتحان (لكل فرع درجته) وإجابات الطالب. صحّح كل فرع على حدة: اعطِ درجة من 0 إلى درجة الفرع (يجوز نصف درجة)، واشرح بالعراقي المبسّط وبجملة أو جملتين شنو الغلط وشنو الجواب الصحيح. إذا الطالب ما جاوب اعطه صفر واكتب الجواب الصحيح باختصار. لا تعطِ الدرجة الكاملة إلا لإجابة صحيحة وكاملة. بعدها اكتب نصيحة وحدة تفيد الطالب بالمراجعة. لا تخرج عن مادة الأسئلة المكتوبة.`;

export function gradePrompt(exam, answers) {
    const ans = new Map();
    (Array.isArray(answers) ? answers : []).forEach((a) => { if (a && typeof a === 'object') ans.set(String(a.n) + '|' + String(a.l), String(a.a == null ? '' : a.a).slice(0, 1500)); });
    const lines = [];
    (exam && Array.isArray(exam.sections) ? exam.sections : []).slice(0, 12).forEach((s) => (Array.isArray(s.parts) ? s.parts : []).slice(0, 10).forEach((p) => {
        lines.push('[' + s.n + ' - ' + p.l + '] (الدرجة ' + (Number(p.m) || 0) + ')\nالسؤال: ' + String(p.q || '').slice(0, 900) + '\nجواب الطالب: ' + (ans.get(String(s.n) + '|' + String(p.l)) || '(بدون جواب)'));
    }));
    return 'عنوان الامتحان: ' + String(exam && exam.title || '').slice(0, 100) + '\n\n' + lines.join('\n\n') + '\n\nصحّح كل فرع، وارجع العناصر بنفس الترتيب ونفس رمز السؤال والفرع.';
}

// the model's marks cut down to what the app shows: one item per part of the exam, a mark between 0 and the part's mark in halves
export function cleanGrade(g, exam) {
    const src = g && Array.isArray(g.items) ? g.items : [];
    const by = new Map(); src.forEach((x) => { if (x && typeof x === 'object') by.set(String(x.n) + '|' + String(x.l), x); });
    let total = 0, max = 0;
    const items = [];
    (exam && Array.isArray(exam.sections) ? exam.sections : []).slice(0, 12).forEach((s) => (Array.isArray(s.parts) ? s.parts : []).slice(0, 10).forEach((p) => {
        const m = Math.max(0, Math.min(100, Number(p.m) || 0)), x = by.get(String(s.n) + '|' + String(p.l));
        const raw = x ? Number(x.got) : 0, got = Number.isFinite(raw) ? Math.round(Math.max(0, Math.min(m, raw)) * 2) / 2 : 0;
        total += got; max += m;
        items.push({ n: String(s.n).slice(0, 12), l: String(p.l).slice(0, 6), m, got, fb: x ? String(x.fb || '').slice(0, 500) : 'ما انصحح هذا الفرع' });
    }));
    return items.length ? { total, max, items, tip: String(g && g.tip || '').slice(0, 400) } : null;
}

// ---------- summary ----------
export const SUMMARY_SYSTEM = `أنت مدرس عراقي يلخّص للطالب المادة المعطاة بالعربية المبسّطة، معتمداً على النص فقط وبدون ما تضيف معلومات من برّه. ارجع: عنواناً قصيراً، ونقاطاً رئيسية مرتبة وقصيرة (من 6 إلى 12)، والمصطلحات المهمة مع تعريف قصير لكل وحدة (حتى 8)، وأسئلة مراجعة (من 5 إلى 8) لكل سؤال جوابه القصير. اكتب المعادلات بالرموز العادية.`;
export function cleanSummary(s) {
    if (!s || typeof s !== 'object') return null;
    const arr = (a, n) => (Array.isArray(a) ? a.filter((x) => x != null).slice(0, n) : []);
    const points = arr(s.points, 14).map((x) => String(x).slice(0, 400)).filter((x) => x.trim());
    const terms = arr(s.terms, 10).filter((x) => x && typeof x === 'object').map((x) => ({ t: String(x.t || '').slice(0, 80), d: String(x.d || '').slice(0, 300) })).filter((x) => x.t && x.d);
    const questions = arr(s.questions, 10).filter((x) => x && typeof x === 'object').map((x) => ({ q: String(x.q || '').slice(0, 300), a: String(x.a || '').slice(0, 500) })).filter((x) => x.q && x.a);
    return points.length ? { title: String(s.title || 'ملخص').slice(0, 100), points, terms, questions } : null;
}

// ---------- the words of a YouTube video (best effort: only when the video has captions and YouTube answers the Worker) ----------
export const ytIdOf = (s) => { const m = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(String(s || '')) || /^([A-Za-z0-9_-]{11})$/.exec(String(s || '').trim()); return m ? m[1] : ''; };
export function captionTracks(html) {
    const i = String(html || '').indexOf('"captionTracks":');
    if (i < 0) return [];
    let j = html.indexOf('[', i), depth = 0, k = j;
    for (; k < html.length; k++) { const c = html[k]; if (c === '[') depth++; else if (c === ']' && --depth === 0) break; }
    try { const a = JSON.parse(html.slice(j, k + 1)); return Array.isArray(a) ? a.filter((t) => t && typeof t.baseUrl === 'string' && /^https:\/\/www\.youtube\.com\//.test(t.baseUrl)) : []; } catch { return []; }
}
// Arabic first, then English, then whatever is there; spoken (automatic) captions last
export function pickTrack(tracks) {
    const rank = (t) => (/^ar/.test(t.languageCode || '') ? 0 : /^en/.test(t.languageCode || '') ? 1 : 2) * 2 + (t.kind === 'asr' ? 1 : 0);
    return tracks.slice().sort((a, b) => rank(a) - rank(b))[0] || null;
}
export function json3Text(j) {
    const ev = j && Array.isArray(j.events) ? j.events : [];
    return ev.map((e) => (Array.isArray(e.segs) ? e.segs.map((s) => s.utf8 || '').join('') : '')).join(' ').replace(/\s+/g, ' ').trim();
}
export async function ytTranscript(id, fetchFn, headers) {
    const r = await fetchFn('https://www.youtube.com/watch?v=' + id + '&hl=ar', { headers });
    if (!r.ok) return '';
    const t = pickTrack(captionTracks(await r.text()));
    if (!t) return '';
    const c = await fetchFn(t.baseUrl + '&fmt=json3', { headers });
    if (!c.ok) return '';
    return json3Text(await c.json().catch(() => null)).slice(0, 30000);
}
