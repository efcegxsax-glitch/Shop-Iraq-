// A moderator's push for a news he has just published ("إرسال إشعار" permission). The Worker never takes the text from the request:
// it reads the news from the database, checks that this moderator published it a moment ago and is switched on with both permissions,
// and sends only that news's own title. One push per moderator per half hour (kept in modPushLast/{uid}, written by the Worker only).
// Tested in tools/modpush-test.mjs.
export const MOD_PUSH_GAP = 30 * 60000;     // between two pushes of the same moderator
export const MOD_PUSH_FRESH = 15 * 60000;   // the news must be this young

const cut = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

// deps: get(path) = read with the caller's own sign-in; db = makeDb(env) (service account); send(payload) -> { ok, id, recipients }; targets(cat) -> OneSignal targets
export async function modPush(uid, body, now, deps) {
    const id = String(body && body.id != null ? body.id : '');
    if (!/^\d{10,16}$/.test(id)) return { status: 400, body: { error: 'bad' } };
    const m = await deps.get('mods/' + uid);
    if (!m || m.on !== true || !m.p || m.p.pubNews !== true || m.p.pushNews !== true) return { status: 403, body: { error: 'perm' } };
    const n = await deps.get('news/' + id);
    if (!n || n.byMod !== uid) return { status: 403, body: { error: 'not_yours' } };
    if (n.pushedAt) return { status: 409, body: { error: 'done' } };
    if (now - Number(id) > MOD_PUSH_FRESH || Number(id) - now > 600000) return { status: 400, body: { error: 'old' } };
    if (!deps.db.ok) return { status: 503, body: { error: 'no_sa' } };
    const last = Number(await deps.db.get('modPushLast/' + uid)) || 0;
    if (now - last < MOD_PUSH_GAP) return { status: 429, body: { error: 'wait', minutes: Math.ceil((MOD_PUSH_GAP - (now - last)) / 60000) } };
    // reserve the slot first: two taps at once cannot both pass
    await deps.db.update({ ['modPushLast/' + uid]: now, ['news/' + id + '/pushedAt']: now });
    const title = cut(n.title, 80), text = cut(n.excerpt, 140);
    let r;
    try { r = await deps.send({ title, text: text || title, id }); } catch (e) { r = { ok: false }; }
    if (!r.ok) {
        await deps.db.update({ ['modPushLast/' + uid]: last || null, ['news/' + id + '/pushedAt']: null }).catch(() => {});
        return { status: 502, body: { error: 'send' } };
    }
    const name = cut(await deps.db.get('pub/' + uid + '/n').catch(() => ''), 40);
    await deps.db.put('auditLog/' + now + '_push', { at: now, by: { t: 'mod', u: uid, n: name }, k: 'newsPush', id: Number(id), title: title.slice(0, 100) }).catch(() => {});
    return { status: 200, body: { ok: true, recipients: Number(r.recipients) || 0 } };
}
