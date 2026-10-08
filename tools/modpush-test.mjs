// Checks a moderator's push (tutor-worker/src/modpush.js) with a fake database and a fake OneSignal.
//   node tools/modpush-test.mjs
import { modPush, MOD_PUSH_GAP } from '../tutor-worker/src/modpush.js';
let ok = 0, bad = 0;
const t = (name, cond, info) => { if (cond) ok++; else { bad++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } };
const U = 'u'.repeat(28), NOW = 1790000000000, ID = String(NOW - 60000);
const mk = (over = {}) => {
    const st = { ['mods/' + U]: { on: true, p: { pubNews: true, pushNews: true } }, ['news/' + ID]: { id: Number(ID), title: '  عنوان   الخبر ', excerpt: 'نص الخبر', byMod: U }, ['pub/' + U + '/n']: 'علي', ...over };
    const sent = [];
    const deps = {
        get: async (p) => (p in st ? st[p] : null),
        db: { ok: true, get: async (p) => (p in st ? st[p] : null), put: async (p, v) => { st[p] = v; }, update: async (u) => { for (const k of Object.keys(u)) { if (k.includes('/pushedAt')) { st['news/' + ID] = { ...st['news/' + ID], pushedAt: u[k] === null ? undefined : u[k] }; } else if (u[k] === null) delete st[k]; else st[k] = u[k]; } } },
        send: async (x) => { sent.push(x); return { ok: deps.fail ? false : true, recipients: 120 }; },
    };
    return { st, sent, deps };
};
let m = mk(), r = await modPush(U, { id: ID }, NOW, m.deps);
t('a switched-on moderator with both permissions pushes his fresh news', r.status === 200 && r.body.ok && r.body.recipients === 120, r);
t('the push text is the news title (cleaned), not anything from the request', m.sent.length === 1 && m.sent[0].title === 'عنوان الخبر' && m.sent[0].text === 'نص الخبر' && m.sent[0].id === ID, m.sent);
t('the gap and the "pushed" mark are written', m.st['modPushLast/' + U] === NOW && m.st['news/' + ID].pushedAt === NOW);
t('the push is logged with the moderator name', Object.values(m.st).some((v) => v && v.k === 'newsPush' && v.by.u === U && v.by.n === 'علي' && v.id === Number(ID)));
r = await modPush(U, { id: ID }, NOW + 1000, m.deps);
t('the same news cannot be pushed twice', r.status === 409 && m.sent.length === 1, r);
m = mk({ ['news/' + ID]: { id: Number(ID), title: 'x', byMod: U } }); m.st['modPushLast/' + U] = NOW - 10 * 60000;
r = await modPush(U, { id: ID }, NOW, m.deps);
t('a second push within half an hour is refused with the minutes left', r.status === 429 && r.body.minutes === 20 && m.sent.length === 0, r);
m.st['modPushLast/' + U] = NOW - MOD_PUSH_GAP - 1; r = await modPush(U, { id: ID }, NOW, m.deps);
t('after the gap it works again', r.status === 200, r);
m = mk({ ['mods/' + U]: { on: true, p: { pubNews: true, pushNews: false } } }); r = await modPush(U, { id: ID }, NOW, m.deps);
t('without the push permission: refused', r.status === 403 && !m.sent.length, r);
m = mk({ ['mods/' + U]: { on: true, p: { pubNews: false, pushNews: true } } }); r = await modPush(U, { id: ID }, NOW, m.deps);
t('without the publish permission: refused', r.status === 403, r);
m = mk({ ['mods/' + U]: { on: false, p: { pubNews: true, pushNews: true } } }); r = await modPush(U, { id: ID }, NOW, m.deps);
t('a switched-off moderator: refused', r.status === 403, r);
m = mk({ ['mods/' + U]: null }); delete m.st['mods/' + U]; r = await modPush(U, { id: ID }, NOW, m.deps);
t('not a moderator at all: refused', r.status === 403, r);
m = mk({ ['news/' + ID]: { id: Number(ID), title: 'x', byMod: 'z'.repeat(28) } }); r = await modPush(U, { id: ID }, NOW, m.deps);
t('someone else\'s news: refused', r.status === 403 && !m.sent.length, r);
m = mk({ ['news/' + ID]: { id: Number(ID), title: 'x' } }); r = await modPush(U, { id: ID }, NOW, m.deps);
t('an admin\'s news (no byMod): refused', r.status === 403, r);
m = mk(); r = await modPush(U, { id: String(NOW - 20 * 60000) }, NOW, m.deps);
t('a missing news: refused', r.status === 403, r);
m = mk({ ['news/' + (NOW - 20 * 60000)]: { id: NOW - 20 * 60000, title: 'x', byMod: U } }); r = await modPush(U, { id: String(NOW - 20 * 60000) }, NOW, m.deps);
t('an old news (over 15 minutes): refused', r.status === 400 && !m.sent.length, r);
for (const id of ['', 'abc', '1', undefined, null, '12345678901234567', '../x']) { m = mk(); r = await modPush(U, { id }, NOW, m.deps); t('bad id ' + JSON.stringify(id), r.status === 400 && !m.sent.length, r); }
m = mk(); m.deps.fail = true; r = await modPush(U, { id: ID }, NOW, m.deps);
t('OneSignal failing gives 502 and frees the slot and the mark', r.status === 502 && !('modPushLast/' + U in m.st) && !m.st['news/' + ID].pushedAt, { r, last: m.st['modPushLast/' + U] });
m = mk(); m.deps.db.ok = false; r = await modPush(U, { id: ID }, NOW, m.deps);
t('no service account: 503, nothing sent', r.status === 503 && !m.sent.length, r);
console.log('modpush tests passed ' + ok + ' failed ' + bad); process.exit(bad ? 1 : 0);
