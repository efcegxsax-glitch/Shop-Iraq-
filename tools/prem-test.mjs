// Checks the Premium parts of the Worker (tutor-worker/src/premium.js and the modes in index.js): who may use what, the free monthly uses,
// and that nothing the app sends can switch a lock off. The sign-in keys, the database and the model are all local fakes.
//   node tools/prem-test.mjs
import http from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from '../tutor-worker/node_modules/jose/dist/webapi/index.js';
import * as P from '../tutor-worker/src/premium.js';
import worker from '../tutor-worker/src/index.js';
let ok = 0, bad = 0;
const t = (name, cond, info) => { if (cond) ok++; else { bad++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } };

// ---- pure helpers
const NOW = Date.UTC(2026, 9, 11, 12);
t('active: until in the future', P.premActive({ at: 1, until: NOW + 1 }, NOW) && !P.premActive({ at: 1, until: NOW - 1 }, NOW));
t('active: no end date = for good', P.premActive({ at: 1 }, NOW));
t('active: nothing / junk', !P.premActive(null, NOW) && !P.premActive('x', NOW) && !P.premActive(5, NOW));
t('a part is on unless the panel switched it off', P.featOn({}, 'exam') && P.featOn(null, 'exam') && !P.featOn({ f: { exam: false } }, 'exam') && P.featOn({ f: { exam: false } }, 'cards'));
t('the month is Iraq time', P.monthKey(Date.UTC(2026, 9, 31, 22)) === 202611 && P.monthKey(Date.UTC(2026, 9, 31, 20)) === 202610);
t('free limit: default 2, the panel can set 0..100', P.freeLimit({}) === 2 && P.freeLimit({ freeExams: 5 }) === 5 && P.freeLimit({ freeExams: 0 }) === 0 && P.freeLimit({ freeExams: -3 }) === 2 && P.freeLimit({ freeExams: 'x' }) === 2 && P.freeLimit({ freeExams: 999 }) === 100);
const mkKv = () => { const m = new Map(); return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } }; };
{
    const kv = mkKv();
    const a = await P.takeQuota(kv, 'u1', 'exam', 2, NOW), b = await P.takeQuota(kv, 'u1', 'exam', 2, NOW), c = await P.takeQuota(kv, 'u1', 'exam', 2, NOW);
    t('quota: two free uses then refused', a.ok && b.ok && !c.ok && c.used === 2);
    await b.undo(); t('quota: a failed job gives the use back', (await P.takeQuota(kv, 'u1', 'exam', 2, NOW)).ok);
    t('quota: another student / another part / next month are separate', (await P.takeQuota(kv, 'u2', 'exam', 2, NOW)).ok && (await P.takeQuota(kv, 'u1', 'grade', 2, NOW)).ok && (await P.takeQuota(kv, 'u1', 'exam', 2, NOW + 32 * 86400000)).ok);
    t('quota: no store = nothing is free', (await P.takeQuota(null, 'u1', 'exam', 2, NOW)).ok === false);
    t('quota: limit 0 = no free uses', (await P.takeQuota(mkKv(), 'u1', 'exam', 0, NOW)).ok === false);
}
const exam = { title: 'ت', sections: [{ n: 'س1', head: 'h', marks: 10, parts: [{ l: 'أ', q: 'عرّف', m: 5 }, { l: 'ب', q: 'علّل', m: 5 }] }] };
const g = P.cleanGrade({ items: [{ n: 'س1', l: 'أ', got: 99, fb: 'x'.repeat(900) }, { n: 'س1', l: 'ب', got: -4, fb: 'y' }, { n: 'س9', l: 'ز', got: 5, fb: 'z' }], tip: 'نصيحة' }, exam);
t('grade: one item per exam part, marks clamped to 0..part mark', g && g.items.length === 2 && g.items[0].got === 5 && g.items[1].got === 0 && g.total === 5 && g.max === 10 && g.items[0].fb.length === 500, g);
t('grade: halves, junk, a missing part', P.cleanGrade({ items: [{ n: 'س1', l: 'أ', got: 2.3, fb: '' }, { n: 'س1', l: 'ب', got: 'x', fb: '' }] }, exam).items[0].got === 2.5 && P.cleanGrade({ items: [] }, exam).items[1].got === 0 && P.cleanGrade(null, { sections: [] }) === null);
t('grade prompt lists every part with its mark and the answer', /\(الدرجة 5\)/.test(P.gradePrompt(exam, [{ n: 'س1', l: 'أ', a: 'جوابي' }])) && /جوابي/.test(P.gradePrompt(exam, [{ n: 'س1', l: 'أ', a: 'جوابي' }])) && /بدون جواب/.test(P.gradePrompt(exam, [])));
t('summary: cut down and cleaned', (() => { const s = P.cleanSummary({ title: 'x', points: ['a', '', 'b'], terms: [{ t: 'م', d: 'ت' }, { t: '', d: 'x' }], questions: [{ q: 'س', a: 'ج' }, { q: 'س' }] }); return s && s.points.length === 2 && s.terms.length === 1 && s.questions.length === 1; })() && P.cleanSummary({ points: [] }) === null && P.cleanSummary(null) === null);
t('youtube ids', P.ytIdOf('https://youtu.be/dQw4w9WgXcQ') === 'dQw4w9WgXcQ' && P.ytIdOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5') === 'dQw4w9WgXcQ' && P.ytIdOf('dQw4w9WgXcQ') === 'dQw4w9WgXcQ' && P.ytIdOf('https://example.com/x') === '');
const html = 'x"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=1&lang=en","languageCode":"en","kind":"asr"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=1&lang=ar","languageCode":"ar"},{"baseUrl":"https://evil.example/x","languageCode":"ar"}],"audioTracks":[]';
const tr = P.captionTracks(html);
t('captions: only youtube.com tracks, Arabic first', tr.length === 2 && P.pickTrack(tr).languageCode === 'ar' && P.captionTracks('nothing').length === 0);
t('captions text', P.json3Text({ events: [{ segs: [{ utf8: 'مرحبا' }, { utf8: ' بكم' }] }, {}, { segs: [{ utf8: 'يا طلاب' }] }] }) === 'مرحبا بكم يا طلاب');

// ---- the Worker, with fake sign-in keys, database and model
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const DB = {};                       // path -> value
let modelCalls = 0, modelMode = 'ok';
const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/jwks') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ keys: [jwk] })); }
    if (u.pathname.startsWith('/db/')) { res.setHeader('content-type', 'application/json'); const p = decodeURIComponent(u.pathname.slice(4)).replace(/\.json$/, ''); return res.end(JSON.stringify(DB[p] === undefined ? null : DB[p])); }
    if (u.pathname === '/v1/messages') {
        let b = ''; for await (const c of req) b += c;
        const body = JSON.parse(b), sys = JSON.stringify(body.system || '');
        modelCalls++;
        let out;
        if (modelMode === 'bad') out = { nothing: true };
        else if (sys.includes('مصحح امتحانات')) out = { items: [{ n: 'س1', l: 'أ', got: 9, fb: 'ناقص' }, { n: 'س1', l: 'ب', got: 3, fb: 'زين' }], tip: 'راجع' };
        else if (sys.includes('يلخّص للطالب')) out = { title: 'ملخص', points: ['نقطة 1', 'نقطة 2'], terms: [{ t: 'مصطلح', d: 'تعريف' }], questions: [{ q: 'سؤال', a: 'جواب' }] };
        else if (sys.includes('أستاذ عراقي خبير')) out = { title: 'امتحان', sections: [{ n: 'س1', head: 'أجب', marks: 10, parts: [{ l: 'أ', q: 'عرّف', m: 5 }, { l: 'ب', q: 'علّل', m: 5 }] }] };
        else if (sys.includes('بطاقات')) out = { title: 'بطاقات', cards: [{ q: 'س', a: 'ج' }] };
        else out = { summary: 'خطة', days: [{ tasks: [{ s: 'فيزياء', t: 'راجع الفصل', m: 30 }] }, { tasks: [] }, { tasks: [] }, { tasks: [] }, { tasks: [] }, { tasks: [] }, { tasks: [] }] };
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
    }
    res.statusCode = 404; res.end('no');
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const token = (uid) => new SignJWT({ email: uid + '@t.iq' }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setSubject(uid).setIssuer('https://securetoken.google.com/proj').setAudience('proj').setIssuedAt().setExpirationTime('1h').sign(privateKey);
const mkEnv = (extra) => ({ ALLOWED_ORIGINS: 'https://x.test', FIREBASE_PROJECT_ID: 'proj', FIREBASE_DB_URL: base + '/db', JWKS_URL: base + '/jwks', ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: base, AVATARS: mkKv(), ...(extra || {}) });
const call = async (env, uid, body) => {
    const pend = [];
    const r = await worker.fetch(new Request('https://w.test/', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://x.test', ...(uid ? { Authorization: 'Bearer ' + await token(uid) } : {}) }, body: JSON.stringify(body) }), env, { waitUntil: (p) => pend.push(p) });
    const text = await r.text(); await Promise.all(pend);
    let j = null; try { j = JSON.parse(text); } catch {}
    return { s: r.status, j };
};
const LONG = 'نص الملزمة عن الخلية والأنسجة. '.repeat(20);
const FREE = 'abcdefghijklmnopqrstuvwx1', PRO = 'abcdefghijklmnopqrstuvwx2';
DB['premium/' + PRO] = { at: NOW, until: Date.now() + 86400000 };
DB['premCfg'] = { price: 100, days: 30, freeExams: 2 };

let r = await call(mkEnv(), null, { mode: 'pexam', text: LONG });
t('no sign-in: 401', r.s === 401);
// summary: premium only
r = await call(mkEnv(), FREE, { mode: 'psummary', text: LONG }); t('summary, not premium: 402', r.s === 402 && r.j.error === 'premium', r);
let env = mkEnv();
r = await call(env, PRO, { mode: 'psummary', text: LONG }); t('summary, premium: 200 with points/terms/questions', r.s === 200 && r.j.points.length === 2 && r.j.terms.length === 1 && r.j.questions.length === 1, r);
r = await call(env, PRO, { mode: 'psummary', text: 'قصير' }); t('summary, text too short: 400', r.s === 400 && r.j.error === 'short', r);
r = await call(env, PRO, { mode: 'psummary', url: 'https://example.com/x' }); t('summary, a link that is not YouTube: 400', r.s === 400 && r.j.error === 'url', r);
DB['premCfg'] = { price: 100, days: 30, f: { summary: false } };
r = await call(env, PRO, { mode: 'psummary', text: LONG }); t('summary switched off by the panel: 403 even for premium', r.s === 403 && r.j.error === 'off', r);
DB['premCfg'] = { price: 100, days: 30, freeExams: 2 };
// exams: 2 free a month
env = mkEnv();
r = await call(env, FREE, { mode: 'pexam', text: LONG, subject: 'الأحياء' }); t('exam #1 free: 200, one left', r.s === 200 && r.j.sections.length === 1 && r.j.left === 1, r);
r = await call(env, FREE, { mode: 'pexam', text: LONG }); t('exam #2 free: 200, none left', r.s === 200 && r.j.left === 0, r);
const mc = modelCalls;
r = await call(env, FREE, { mode: 'pexam', text: LONG }); t('exam #3 free: 402 quota, the model is not called', r.s === 402 && r.j.error === 'quota' && modelCalls === mc, r);
r = await call(env, FREE, { mode: 'pexam', text: LONG, premium: true, active: true, left: 99 }); t('fields the app adds change nothing', r.s === 402, r);
r = await call(env, PRO, { mode: 'pexam', text: LONG }); t('exam, premium: 200 and no limit', r.s === 200 && r.j.left === null, r);
for (let i = 0; i < 3; i++) r = await call(env, PRO, { mode: 'pexam', text: LONG });
t('exam, premium: still fine after more', r.s === 200, r);
// a failing model gives the use back
env = mkEnv(); modelMode = 'bad';
r = await call(env, FREE, { mode: 'pexam', text: LONG }); t('a failed exam is an error', r.s === 200 && !!r.j.error, r);
modelMode = 'ok';
r = await call(env, FREE, { mode: 'pexam', text: LONG }); const r2 = await call(env, FREE, { mode: 'pexam', text: LONG });
t('and it did not use up a free try (two still work)', r.s === 200 && r2.s === 200 && r2.j.left === 0, [r, r2]);
r = await call(env, FREE, { mode: 'pexam', text: 'قصير' }); t('too short a text: 400 (no use taken either)', r.s === 402 || r.s === 400);
env = mkEnv({ AVATARS: undefined });
r = await call(env, FREE, { mode: 'pexam', text: LONG }); t('no store for counting: a free student gets 402', r.s === 402, r);
DB['premCfg'] = { price: 100, days: 30, freeExams: 0 };
r = await call(mkEnv(), FREE, { mode: 'pexam', text: LONG }); t('the panel sets 0 free exams: 402', r.s === 402 && r.j.error === 'quota', r);
DB['premCfg'] = { price: 100, days: 30, f: { exam: false } };
r = await call(mkEnv(), PRO, { mode: 'pexam', text: LONG }); t('exam switched off: 403', r.s === 403, r);
DB['premCfg'] = { price: 100, days: 30, freeExams: 2 };
// grading
env = mkEnv();
r = await call(env, FREE, { mode: 'pgrade', exam, answers: [{ n: 'س1', l: 'أ', a: 'جواب' }] });
t('grade, free: 200, marks clamped to each part (9 -> 5), total 8 of 10', r.s === 200 && r.j.items[0].got === 5 && r.j.items[1].got === 3 && r.j.total === 8 && r.j.max === 10 && r.j.left === 1, r);
r = await call(env, FREE, { mode: 'pgrade', exam: { sections: 'x' }, answers: [] }); t('grade, a broken exam: 400', r.s === 400, r);
await call(env, FREE, { mode: 'pgrade', exam, answers: [] });
r = await call(env, FREE, { mode: 'pgrade', exam, answers: [] }); t('grade, free: third refused', r.s === 402, r);
r = await call(env, PRO, { mode: 'pgrade', exam, answers: [] }); t('grade, premium: unlimited', r.s === 200 && r.j.left === null, r);
// cards from notes, re-plan
const img = { type: 'image/jpeg', data: 'AAAA' };
r = await call(mkEnv(), FREE, { mode: 'cards', image: img, src: 'notes' }); t('cards from notes, free: 402', r.s === 402, r);
r = await call(mkEnv(), PRO, { mode: 'cards', image: img, src: 'notes' }); t('cards from notes, premium: 200', r.s === 200 && r.j.cards.length === 1, r);
r = await call(mkEnv(), FREE, { mode: 'cards', image: img }); t('a photo of a page to cards stays free', r.s === 200, r);
const days = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ date: '2026-10-' + (11 + i), name: 'يوم' + i }));
r = await call(mkEnv(), FREE, { mode: 'plan', days, hours: 2, replan: true, note: 'فاتتني مهام' }); t('re-plan, free: 402', r.s === 402, r);
r = await call(mkEnv(), PRO, { mode: 'plan', days, hours: 2, replan: true, note: 'فاتتني مهام' }); t('re-plan, premium: 200', r.s === 200 && r.j.days.length === 7, r);
r = await call(mkEnv(), FREE, { mode: 'plan', days, hours: 2 }); t('the normal weekly plan stays free', r.s === 200, r);
DB['premium/' + PRO] = { at: NOW, until: Date.now() - 1000 };
r = await call(mkEnv(), PRO, { mode: 'psummary', text: LONG }); t('an ended subscription locks the parts again', r.s === 402, r);
srv.close();
console.log(bad ? bad + ' failed, ' + ok + ' passed' : 'all ' + ok + ' passed'); process.exit(bad ? 1 : 0);
