// Tests of the Telegram news bot: text cleaning, titles, adverts, repeated news, the service-account sign-in, and a whole round with a fake database.
//   node tools/newsbot-test.mjs
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { cleanPost, splitNews, adCheck, findDup, itemTokens, pickCategory, newsDoc, notifDoc, BRAND } from '../tutor-worker/src/newsbot.js';
import { makeDb, parseSA } from '../tutor-worker/src/fbadmin.js';
import { newsRun, newsAct } from '../tutor-worker/src/newsrun.js';

let pass = 0, fail = 0;
const t = (name, ok, info) => { if (ok) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } };

// ---------- cleaning ----------
const RAW = '#عـــــاجـــــل 🔔 || التربية تحدد ضوابط تنقلات الطلبة للعام الدراسي 2026–2027\n\n📎شارك المنشور مع اصدقاءك :\n✉️|| https://t.me/iraqedu';
const A = cleanPost(RAW);
t('the real example: clean title', A.text === 'التربية تحدد ضوابط تنقلات الطلبة للعام الدراسي 2026–2027', A.text);
t('the real example: urgent', A.urgent === true);
t('the real example: no links kept (the channel\'s own)', A.links.length === 0, A.links);
t('no عاجل -> not urgent', cleanPost('وزارة التربية تعلن موعد الامتحانات').urgent === false);
t('"خبر عاجل:" label', (() => { const r = cleanPost('خبر عاجل: صدور جدول الامتحانات'); return r.urgent && r.text === 'صدور جدول الامتحانات'; })());
t('"عاجل" inside a sentence is not a label', (() => { const r = cleanPost('عقد اجتماع عاجل لوزير التربية'); return !r.urgent && r.text.includes('عاجل'); })());
t('#عاجل tag after the first words', (() => { const r = cleanPost('إعلان مهم #عاجل للطلبة'); return r.urgent && !r.text.includes('#'); })());
t('hashtags lose the # and the underscore', cleanPost('نتائج السادس\n#وزارة_التربية #نتائج').text === 'نتائج السادس', cleanPost('نتائج السادس\n#وزارة_التربية #نتائج').text);
t('signature handle at the end is removed', cleanPost('موعد الامتحانات يوم السبت @iraqedu_news').text === 'موعد الامتحانات يوم السبت');
t('join lines are removed', cleanPost('خبر مهم للطلبة\nانضم لقناتنا الرسمية\nتابعونا على تلكرام').text === 'خبر مهم للطلبة');
t('an outside link goes aside, the channel\'s link is dropped', (() => { const r = cleanPost('النتائج على الموقع https://results.mohesr.gov.iq/a\nhttps://t.me/x'); return r.links.length === 1 && r.links[0].startsWith('https://results.') && !/http/.test(r.text); })());
t('digits and dashes survive', cleanPost('امتحانات 2026–2027 من 1/6').text === 'امتحانات 2026–2027 من 1/6');
t('only symbols -> nothing', cleanPost('🔔🔔 || ✉️').text === '');

// ---------- title and body ----------
let s = splitNews('تعلن الوزارة موعد الامتحانات\nتبدأ الامتحانات يوم السبت\nوتنتهي بعد أسبوعين');
t('first line is the title, the rest the body', s.title === 'تعلن الوزارة موعد الامتحانات' && s.excerpt === 'تبدأ الامتحانات يوم السبت\nوتنتهي بعد أسبوعين', s);
const longLine = 'أعلنت وزارة التربية العراقية اليوم عن ضوابط جديدة لتنقلات الطلبة بين المحافظات للعام الدراسي القادم. وأكدت أن النقل يتم عبر المديريات العامة للتربية بعد تقديم الطلب الرسمي.';
s = splitNews(longLine);
t('a long single line is split at a sentence', s.title.endsWith('القادم.') && s.title.length <= 120 && s.excerpt.startsWith('وأكدت'), s);
s = splitNews('ا'.repeat(10) + ' ' + 'كلمة '.repeat(60));
t('a very long line is cut under 120 with the rest in the body', s.title.length <= 120 && s.excerpt.length > 0, [s.title.length, s.excerpt.length]);
t('body is at most 500', splitNews('عنوان\n' + 'نص '.repeat(400)).excerpt.length <= 500);
t('empty text', splitNews('').title === '');

// ---------- adverts ----------
t('clean ministry news passes', Object.keys(adCheck(A.text, '', [])).length === 0);
t('a shop post is blocked by a word', adCheck('عرض خاص على الملازم للبيع بسعر مخفض', '', []).block !== undefined);
t('your own words are used', adCheck('كورس تقوية مدفوع', 'مدفوع\nكورس', []).block !== undefined);
t('a phone number sends it to review', adCheck('للاستفسار 07701234567', '', []).flag === 'phone', adCheck('للاستفسار 07701234567', '', []));
t('Arabic-Indic digits are seen too', adCheck('اتصل ٠٧٧٠١٢٣٤٥٦٧', '', []).flag === 'phone');
t('a whatsapp link sends it to review', adCheck('سجل الآن', '', ['https://wa.me/9647701234567']).flag === 'link');
t('a ministry link is fine', Object.keys(adCheck('النتائج', '', ['https://moe.gov.iq/results'])).length === 0);

// ---------- repeated news ----------
const mk = (title, ex) => ({ id: title.slice(0, 8), ...itemTokens(title, ex), title });
const pool = [mk('التربية تحدد ضوابط تنقلات الطلبة للعام الدراسي 2026–2027', '')];
t('the same title from another channel is a repeat', !!findDup(itemTokens('التربية تحدد ضوابط تنقلات الطلبة للعام الدراسي 2026-2027', ''), pool, 0.6));
t('reworded with digits in Arabic-Indic and a ta marbuta', !!findDup(itemTokens('ضوابط تنقلات الطلبه للعام الدراسي ٢٠٢٦–٢٠٢٧ تحددها التربية', ''), pool, 0.6));
t('title inside a longer text is a repeat', !!findDup(itemTokens('وزارة التربية', 'التربية تحدد ضوابط تنقلات الطلبة للعام الدراسي 2026–2027 وتوضح الشروط'), pool, 0.6));
t('a different news is not a repeat', !findDup(itemTokens('تحديد موعد امتحانات الدور الثاني للسادس الاعدادي', ''), pool, 0.6));
t('the same words with another year is not a repeat when the threshold is strict', !findDup(itemTokens('التربية تحدد ضوابط تنقلات الطلبة للعام الدراسي 2030–2031', ''), pool, 0.9));
t('categories', pickCategory('صدور نتائج السادس') === 'results' && pickCategory('جدول امتحانات الدور الثاني') === 'exams' && pickCategory(A.text) === 'decisions' && pickCategory('كلمة عامة') === 'other');
const D = newsDoc({ id: 5, title: 'x', excerpt: '', image: '', category: 'other', urgent: true, notify: true }, Date.UTC(2026, 9, 7, 22, 0));
t('news record: source is the app, time word, urgent, Baghdad date', D.source === BRAND && D.time === 'الآن' && D.isUrgent && D.date === '2026-10-08' && D.notifHandled && D.image.startsWith('https://'), D);
t('notification record', notifDoc({ id: 5, title: 'x', excerpt: 'y', urgent: true }).type === 'urgent');

// ---------- the service account ----------
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'bot@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
t('SA parsing: json, base64 json, garbage', !!parseSA(JSON.stringify(SA)) && !!parseSA(Buffer.from(JSON.stringify(SA)).toString('base64')) && parseSA('nope') === null && parseSA('') === null);
let tokenCalls = 0, calls = [];
const fakeFetch = async (url, init = {}) => {
    if (url === 'https://oauth2.googleapis.com/token') {
        tokenCalls++;
        const jwt = /assertion=([^&]+)/.exec(init.body)[1], [h, c, sg] = jwt.split('.');
        const v = createVerify('RSA-SHA256'); v.update(h + '.' + c);
        const good = v.verify(publicKey, Buffer.from(sg.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
        const claim = JSON.parse(Buffer.from(c, 'base64url').toString());
        if (!good || claim.iss !== SA.client_email || !/firebase\.database/.test(claim.scope)) return new Response('{}', { status: 400 });
        return new Response(JSON.stringify({ access_token: 'tok123', expires_in: 3600 }), { status: 200 });
    }
    calls.push({ url, method: init.method, body: init.body });
    return new Response('{"ok":1}', { status: 200 });
};
const db1 = makeDb({ FIREBASE_SA: JSON.stringify(SA), FIREBASE_DB_URL: 'https://x.firebaseio.com/' }, fakeFetch, () => 1e12);
await db1.get('newsBot/cfg'); await db1.update({ 'a/b': 1 }); await db1.del('c');
t('a signed token is accepted and reused', tokenCalls === 1, tokenCalls);
t('database calls carry the token, multi-path update goes to the root', calls[0].url === 'https://x.firebaseio.com/newsBot/cfg.json?access_token=tok123' && calls[1].url === 'https://x.firebaseio.com/.json?access_token=tok123' && calls[1].method === 'PATCH' && calls[2].method === 'DELETE', calls);
let threw = ''; try { await makeDb({ FIREBASE_DB_URL: 'https://x' }, fakeFetch).get('a'); } catch (e) { threw = e.message; }
t('no secret -> no_sa', threw === 'no_sa');

// ---------- a whole round with a fake database ----------
function fakeDb(init) {
    const root = JSON.parse(JSON.stringify(init || {}));
    const walk = (path, make) => { const p = String(path).split('/').filter(Boolean); let o = root; for (let i = 0; i < p.length - 1; i++) { if (typeof o[p[i]] !== 'object' || o[p[i]] === null) { if (!make) return [null, null]; o[p[i]] = {}; } o = o[p[i]]; } return [o, p[p.length - 1]]; };
    const get = (path) => { const p = String(path).split('/').filter(Boolean); let o = root; for (const k of p) { if (o == null) return null; o = o[k]; } return o === undefined ? null : JSON.parse(JSON.stringify(o)); };
    const setp = (path, v) => { const [o, k] = walk(path, v !== null); if (!o) return; if (v === null) delete o[k]; else o[k] = v; };
    return { root, ok: true, get: async (p) => get(p), put: async (p, v) => setp(p, v), update: async (u) => { for (const [p, v] of Object.entries(u)) setp(p, v); }, del: async (p) => setp(p, null) };
}
const NOW = Date.UTC(2026, 9, 7, 12, 0), SINCE = NOW - 3600000;
const post = (i, text, extra) => ({ c: 'x', i, p: NOW - 600000 + i, t: text, im: [], d: [], vd: null, vo: null, w: 0, ...(extra || {}) });
const pages = {
    iraqedu: [post(10, '#عـــــاجـــــل 🔔 || التربية تحدد ضوابط تنقلات الطلبة للعام الدراسي 2026–2027\n\n📎شارك المنشور مع اصدقاءك :\n✉️|| https://t.me/iraqedu', { im: ['https://cdn4.cdn-telegram.org/file/a.jpg'] }), post(9, 'خبر قديم قبل إضافة القناة', { p: SINCE - 5000 })],
    iraqed4: [post(3, 'التربية تحدد ضوابط تنقلات الطلبة للعام الدراسي 2026-2027 حسب كتاب رسمي'), post(4, 'عرض خاص للبيع ملازم السادس بأسعار مخفضة'), post(5, 'اتصل على 07701234567 لحجز مقعدك بدورة تقوية'), post(6, 'تعلن الوزارة موعد امتحانات الدور الثاني\nتبدأ يوم السبت', { fw: 1 }), post(7, 'موعد امتحانات الدور الثاني للسادس الاعدادي يبدأ يوم السبت')],
};
const pushes = [];
const mkDeps = () => ({ now: () => NOW, page: async (n) => { if (!pages[n]) throw new Error('x'); return { info: {}, posts: pages[n].slice().sort((a, b) => b.i - a.i) }; }, img: async (u) => 'data:image/jpeg;base64,AAAA', push: async (x) => { pushes.push(x); return true; } });
const base = () => ({ newsBot: { cfg: { on: true, th: 60, words: '', notify: true }, chans: { iraqedu: { u: 'iraqedu', on: true, mode: 'auto', since: SINCE }, iraqed4: { u: 'iraqed4', on: true, mode: 'review', since: SINCE } } } });

let db = fakeDb({ ...base(), newsBot: { ...base().newsBot, cfg: { on: false } } });
let r = await newsRun(db, mkDeps());
t('master switch off: nothing happens', r.state === 'off' && !db.root.news);
db = fakeDb({});
r = await newsRun(db, mkDeps());
t('first round ever: the bot switches itself on with the two channels in auto mode, and publishes nothing old', r.state === 'ok' && db.root.newsBot.cfg.on === true && db.root.newsBot.chans.iraqedu.mode === 'auto' && db.root.newsBot.chans.iraqed4.mode === 'auto' && !db.root.news, r);
db = fakeDb(base());
r = await newsRun(db, mkDeps());
const news =Object.values(db.root.news || {});
t('round: state ok', r.state === 'ok', r);
t('auto channel published one news (the old post skipped)', news.length === 1 && r.pub === 1, news.length);
const n0 = news[0];
t('news: clean title, brand source, urgent, app time', n0.title === 'التربية تحدد ضوابط تنقلات الطلبة للعام الدراسي 2026–2027' && n0.source === BRAND && n0.isUrgent === true && n0.time === 'الآن', n0);
t('news: the image was embedded, category from the words', n0.image.startsWith('data:image') && n0.category === 'decisions');
t('news id is a number-like key and matches its record', String(n0.id) in db.root.news && Number.isFinite(n0.id));
t('in-app notification written', db.root.notifications && db.root.notifications[n0.id].type === 'urgent');
t('one push for the news', pushes.length === 1 && pushes[0].urgent === true, pushes);
const ign = Object.values(db.root.newsBot.ignored || {}), que = Object.values(db.root.newsBot.queue || {});
t('the other channel repeating the same news was ignored as a repeat', ign.some((x) => x.why === 'dup' && x.pid === 3), ign.map((x) => [x.pid, x.why]));
t('the shop post was ignored as an advert', ign.some((x) => x.why === 'ad' && x.pid === 4));
t('the forwarded post was ignored', ign.some((x) => x.why === 'fwd' && x.pid === 6));
t('the phone-number post waits in the review list', que.some((x) => x.why === 'phone' && x.pid === 5), que.map((x) => [x.pid, x.why]));
t('a review-mode channel puts a normal post in the review list', que.some((x) => x.pid === 7 && x.why === 'review'), que.map((x) => [x.pid, x.why]));
t('status written', db.root.newsBot.status.pub === 1);
const before = Object.keys(db.root.news).length;
r = await newsRun(db, mkDeps());
t('a second round publishes and queues nothing again', r.pub === 0 && r.queue === 0 && Object.keys(db.root.news).length === before, r);
// approving
const k7 = Object.keys(db.root.newsBot.queue).find((k) => k.endsWith('_7'));
const ap = await newsAct(db, mkDeps(), 'approve', k7);
t('approving publishes it and removes it from the list', ap.ok && Object.keys(db.root.news).length === before + 1 && !db.root.newsBot.queue[k7]);
t('its id is above the first one', ap.id > n0.id, [ap.id, n0.id]);
const kDup = Object.keys(db.root.newsBot.ignored).find((k) => k.endsWith('_3'));
t('restoring an ignored one publishes it', (await newsAct(db, mkDeps(), 'restore', kDup)).ok && !db.root.newsBot.ignored[kDup]);
const kR = Object.keys(db.root.newsBot.queue).find((k) => k.endsWith('_5'));
t('rejecting removes it without publishing', (await newsAct(db, mkDeps(), 'reject', kR)).ok && !db.root.newsBot.queue[kR] && Object.keys(db.root.news).length === before + 2);
t('unknown key', (await newsAct(db, mkDeps(), 'approve', 'zzzz_99999')).error === 'gone' && (await newsAct(db, mkDeps(), 'approve', '../x')).error === 'bad');
// a hand-written news counts for repeats too
db = fakeDb({ ...base(), news: { 1700000000000: { id: 1700000000000, title: 'التربية تحدد ضوابط تنقلات الطلبة للعام الدراسي 2026–2027', excerpt: '' } } });
db.root.newsBot.chans.iraqed4.on = false;
r = await newsRun(db, mkDeps());
t('a news the admin wrote by hand is not published a second time', r.pub === 0 && Object.values(db.root.newsBot.ignored || {}).some((x) => x.why === 'dup'), r);
// channel switched off / notify off / no secret
db = fakeDb(base()); db.root.newsBot.chans.iraqedu.on = false; db.root.newsBot.chans.iraqed4.on = false;
t('channels switched off: nothing', (await newsRun(db, mkDeps())).pub === 0);
db = fakeDb(base()); db.root.newsBot.cfg.notify = false; db.root.newsBot.chans.iraqed4.on = false; pushes.length = 0;
await newsRun(db, mkDeps());
t('notify off: published, no push, no in-app notification', Object.keys(db.root.news).length === 1 && pushes.length === 0 && !db.root.notifications && Object.values(db.root.news)[0].notifHandled === false);
r = await newsRun({ get: async () => { throw new Error('no_sa'); } }, mkDeps());
t('no secret -> no_sa', r.state === 'no_sa');
db = fakeDb(base()); const d2 = mkDeps(); d2.page = async () => { throw new Error('http404'); };
r = await newsRun(db, d2);
t('a channel that cannot be read does not stop the round', r.state === 'ok' && r.err.length === 2, r);

console.log(`newsbot tests passed ${pass} failed ${fail}`);
process.exit(fail ? 1 : 0);
