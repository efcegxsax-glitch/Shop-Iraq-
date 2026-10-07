// أخبار تلكرام: one round of the news bot. Dependencies are passed in so the whole round can be tested with fakes:
//   db    = makeDb(env)                 deps.page(name) -> { info, posts }     deps.img(url) -> a data: URL, or the URL itself
//   deps.push(item) -> bool             deps.now()
// Database layout (all of it under newsBot/, which only the admin and this Worker can touch):
//   cfg {on, th, words, notify}   chans/{name} {u, n, on, mode: 'auto'|'review', since}   seen/{name}/{postId} = time
//   idx/{newsId} {k, t, at} (word lists of what the bot published)   queue/{name_postId}, ignored/{name_postId}   status
import { cleanPost, splitNews, pickCategory, adCheck, findDup, itemTokens, tokens, newsDoc, notifDoc } from './newsbot.js';
import { isTgName, isServiceText } from './tg.js';

const DEFAULT_CHANNELS = [['iraqedu', 'iraqedu'], ['iraqed4', 'iraqed4']];
const LOCK_MS = 75000, DAY = 86400000, MAX_CHANNELS = 10, MAX_PER_CHANNEL = 6, MAX_PER_RUN = 8;   // a Worker run may make about 50 calls: 2 per channel + 3 per published news
const rec = (c, x, it, why, extra) => ({ c, pid: x.i, t: it.title, d: it.excerpt, img: it.image || '', urg: it.urgent ? 1 : 0, cat: it.category, link: it.link || '', why, at: it.now, ...(extra || {}) });

async function lastId(db, now) {
    // ids are times (the app asks for "newer than the newest I have"), so a new one must be above every id already used
    try { const j = await db.get('news', '&orderBy=%22%24key%22&limitToLast=1'); const k = j ? Math.max(...Object.keys(j).map(Number).filter(Number.isFinite), 0) : 0; return Math.max(now, k + 1); } catch { return now; }
}

// publishes one item (news + in-app notification + word list) and pushes it
async function publish(db, deps, cfg, it, ctx) {
    const now = deps.now();
    const id = ctx.next = Math.max(ctx.next || now, now);
    ctx.next = id + 1;
    const image = it.img ? await deps.img(it.img) : '';
    const notify = cfg.notify !== false;
    const doc = { id, title: it.t, excerpt: it.d, image, category: it.cat, urgent: !!it.urg, link: it.link, notify };
    const t = itemTokens(it.t, it.d);
    const up = { ['news/' + id]: newsDoc(doc, now), ['newsBot/idx/' + id]: { k: t.k.join(' '), t: t.t.join(' '), at: now } };
    if (notify) up['notifications/' + id] = notifDoc(doc);
    await db.update(up);
    ctx.pool && ctx.pool.push({ id, ...t, title: it.t });
    if (notify) { try { await deps.push({ id, title: it.t, excerpt: it.d, urgent: !!it.urg }); } catch { /* the news is in; the push is best effort */ } }
    return id;
}

async function loadPool(db, now) {
    const pool = [];
    try { const idx = (await db.get('newsBot/idx')) || {}; for (const [id, v] of Object.entries(idx)) if (v && v.at > now - 4 * DAY) pool.push({ id, k: String(v.k || '').split(' ').filter(Boolean), t: String(v.t || '').split(' ').filter(Boolean), title: '' }); } catch { /* none */ }
    // what the admin published by hand lately (a few, newest): their text is compared too
    try {
        const j = (await db.get('news', '&orderBy=%22%24key%22&startAt=%22' + (now - 3 * DAY) + '%22&limitToLast=10')) || {};
        for (const [id, n] of Object.entries(j)) if (n && n.title && !n.auto) pool.push({ id, ...itemTokens(n.title, n.excerpt), title: n.title });
    } catch { /* none */ }
    return pool;
}

export async function newsRun(db, deps, opt = {}) {
    const now = deps.now(), out = { pub: 0, queue: 0, ign: 0, err: [] }, mem = opt.mem || null;
    let cfg = mem && mem.cfg !== undefined ? mem.cfg : undefined;
    try { if (cfg === undefined) cfg = await db.get('newsBot/cfg'); } catch (e) { return { state: String(e.message) === 'no_sa' ? 'no_sa' : 'db', ...out }; }
    // the very first round ever: switch the bot on with the two news channels, publishing by themselves (only what they post from now on)
    if (cfg === null && !opt.noSeed) {
        cfg = { on: true, th: 60, notify: true, words: '' };
        const up = { 'newsBot/cfg': cfg };
        for (const [u, n] of DEFAULT_CHANNELS) up['newsBot/chans/' + u] = { u, n, a: '', on: true, mode: 'auto', since: now };
        try { await db.update(up); } catch { return { state: 'db', ...out }; }
    }
    cfg = cfg || {};
    if (mem) mem.cfg = cfg;
    if (!cfg.on) return { state: 'off', ...out };
    let chans = mem && mem.chans ? mem.chans : {};
    try { if (!(mem && mem.chans)) chans = (await db.get('newsBot/chans')) || {}; } catch { return { state: 'db', ...out }; }
    if (mem) mem.chans = chans;
    const list = Object.values(chans).filter((c) => c && c.on !== false && isTgName(c.u)).slice(0, MAX_CHANNELS);
    const up = {}, ctx = { next: 0, pool: null };
    let budget = MAX_PER_RUN;
    for (const c of list) {
        const key = c.u.toLowerCase();
        let pg; try { pg = await deps.page(c.u); } catch { out.err.push(c.u); continue; }
        // what was seen on the channel this time (for the panel: why did nothing come?), written only when it changed or at the end of the minute
        const top = pg.posts[0], cs = { at: now, n: pg.posts.length, id: top ? top.i : 0, last: top ? top.p : 0 };
        if (mem) mem.chstat = mem.chstat || {};
        if (!mem || opt.last || !mem.chstat[key] || mem.chstat[key].id !== cs.id) up['newsBot/chstat/' + key] = cs;
        if (mem) mem.chstat[key] = cs;
        let seen = mem && mem.seen[key]; try { if (!seen) seen = (await db.get('newsBot/seen/' + key)) || {}; } catch { continue; }
        if (mem) mem.seen[key] = seen;
        const posts = pg.posts.slice(0, 12).filter((x) => !seen[x.i]).sort((a, b) => a.i - b.i);
        let did = 0;
        for (const x of posts) {
            // posts from before the channel was added are never published
            if (!x.p || x.p < (Number(c.since) || 0)) { up['newsBot/seen/' + key + '/' + x.i] = now; continue; }
            if (did >= MAX_PER_CHANNEL || budget <= 0) break;
            did++; budget--;
            up['newsBot/seen/' + key + '/' + x.i] = now;
            if (x.vo) continue;                                       // a voice message: never published (even with a caption)
            const cl = cleanPost(x.t);
            if (!cl.text) continue;                                   // a picture or file with no words
            if (isServiceText(cl.text)) continue;                     // "channel photo updated" and the like
            const sp = splitNews(cl.text);
            if (!sp.title) continue;
            const it = { title: sp.title, excerpt: sp.excerpt, image: (x.im && x.im[0]) || (x.vd && x.vd.th) || '', urgent: cl.urgent, category: pickCategory(cl.text), link: cl.links[0] || '', now };
            const qk = key + '_' + x.i;
            const ad = adCheck(cl.text, cfg.words, cl.links);
            if (x.fw) { up['newsBot/ignored/' + qk] = rec(key, x, it, 'fwd'); out.ign++; continue; }
            if (ad.block) { up['newsBot/ignored/' + qk] = rec(key, x, it, 'ad', { w: ad.block }); out.ign++; continue; }
            ctx.pool = ctx.pool || (await loadPool(db, now));
            const dup = findDup(itemTokens(it.title, it.excerpt), ctx.pool, (Number(cfg.th) || 60) / 100);
            if (dup) { up['newsBot/ignored/' + qk] = rec(key, x, it, 'dup', { of: dup.title || '' }); out.ign++; continue; }
            if (ad.flag || c.mode !== 'auto') { up['newsBot/queue/' + qk] = rec(key, x, it, ad.flag || 'review'); out.queue++; continue; }
            if (!ctx.next) ctx.next = await lastId(db, now);
            try { await publish(db, deps, cfg, { t: it.title, d: it.excerpt, img: it.image, urg: it.urgent, cat: it.category, link: it.link }, ctx); out.pub++; }
            catch { delete up['newsBot/seen/' + key + '/' + x.i]; out.err.push(c.u); }   // not saved: look at it again next time
        }
        // forget old marks so the list stays short
        for (const [pid, t] of Object.entries(seen)) if (now - Number(t) > 10 * DAY) up['newsBot/seen/' + key + '/' + pid] = null;
    }
    // what this round marked as seen is remembered in memory for the next round of the same minute
    if (mem) for (const [path, v] of Object.entries(up)) { const m = /^newsBot\/seen\/([^/]+)\/(.+)$/.exec(path); if (m && mem.seen[m[1]]) { if (v === null) delete mem.seen[m[1]][m[2]]; else mem.seen[m[1]][m[2]] = v; } }
    // the status line is written when something happened (or, in a minute of many rounds, on the last one)
    // (a minute's numbers are added up, so the line says what the whole minute did)
    const tot = mem ? (mem.tot = mem.tot || { pub: 0, queue: 0, ign: 0, err: [] }) : out;
    if (mem) { tot.pub += out.pub; tot.queue += out.queue; tot.ign += out.ign; for (const e of out.err) if (!tot.err.includes(e)) tot.err.push(e); }
    if (!mem || opt.last || out.pub || out.queue || out.ign || out.err.length) up['newsBot/status'] = { at: now, pub: tot.pub, queue: tot.queue, ign: tot.ign, err: tot.err.slice(0, 5).join(',') };
    if (Object.keys(up).length) { try { await db.update(up); } catch { out.err.push('save'); } }
    return { state: 'ok', ...out };
}

// One minute of watching: a round every `gap` ms (10 s), the channels, switches and "seen" marks are read once and kept in memory.
export async function newsLoop(db, deps, opt = {}) {
    const polls = opt.polls || 6, gap = opt.gap == null ? 10000 : opt.gap, mem = { cfg: undefined, chans: null, seen: {}, chstat: {} };
    const tot = { state: 'ok', pub: 0, queue: 0, ign: 0, err: [] };
    // one watcher at a time: a minute that is still running (or a manual round) must not be doubled by the next one
    try { const lk = await db.get('newsBot/lock'); if (lk && deps.now() - Number(lk) < LOCK_MS) return { ...tot, state: 'busy' }; await db.put('newsBot/lock', deps.now()); }
    catch (e) { return { ...tot, state: String(e.message) === 'no_sa' ? 'no_sa' : 'db' }; }
    try {
        for (let i = 0; i < polls; i++) {
            const r = await newsRun(db, deps, { mem, last: i === polls - 1 });
            if (r.state !== 'ok') { tot.state = r.state; break; }
            tot.pub += r.pub; tot.queue += r.queue; tot.ign += r.ign; for (const e of r.err) if (!tot.err.includes(e)) tot.err.push(e);
            if (i < polls - 1) await deps.sleep(gap);
        }
    } finally { try { await db.del('newsBot/lock'); } catch { /* it expires by itself */ } }
    return tot;
}

// the admin's decision on a held item: 'approve' (queue -> news), 'reject' (drop from the queue), 'restore' (ignored -> news), 'clear'
export async function newsAct(db, deps, act, key) {
    if (!/^[a-z0-9_]{4,32}_\d{1,12}$/i.test(String(key))) return { error: 'bad' };
    const from = act === 'approve' || act === 'reject' ? 'queue' : 'ignored';
    const it = await db.get('newsBot/' + from + '/' + key);
    if (!it) return { error: 'gone' };
    if (act === 'reject' || act === 'clear') { await db.del('newsBot/' + from + '/' + key); return { ok: true }; }
    const cfg = (await db.get('newsBot/cfg')) || {}, ctx = { next: await lastId(db, deps.now()), pool: null };
    const id = await publish(db, deps, cfg, it, ctx);
    await db.del('newsBot/' + from + '/' + key);
    return { ok: true, id };
}

export const _t = { tokens };
