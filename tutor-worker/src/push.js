// Who an admin push goes to (tested in tools/push-test.mjs), and when (a OneSignal "send_after" time).
// The app sets the tag off_<kind> only while the student has that kind of notification switched off, so "tag off_<kind> does not
// exist" keeps everybody who never touched it (older installs too). Only plain AND filters are used, so nothing depends on how
// OneSignal ranks OR against AND; each governorate is its own send.
export const KINDS = ['urgent', 'announcement', 'weather', 'res', 'general', 'holiday', 'motiv', 'tgnews'];

// `also`: more kinds a push belongs to (the news bot's pushes are an urgent / official news AND a Telegram news): a student who switched any of them off is skipped
export function pushTargets(govs, cat, uids, also) {
    // named students (prize winners): only them, whatever their governorate or switches
    if (Array.isArray(uids) && uids.length) return { kind: '', targets: [{ include_aliases: { external_id: uids } }] };
    const kind = KINDS.includes(cat) ? cat : '';
    const kinds = (kind ? [kind] : []).concat((Array.isArray(also) ? also : []).filter((k) => KINDS.includes(k) && k !== kind));
    const offOk = kinds.map((k) => ({ field: 'tag', key: 'off_' + k, relation: 'not_exists' }));
    const targets = govs.length
        ? govs.map((g) => ({ filters: [{ field: 'tag', key: 'gov', relation: '=', value: g }, ...offOk] }))
        : [offOk.length ? { filters: offOk } : { included_segments: ['Total Subscriptions'] }];
    return { kind, targets };
}

// Where a tapped notification should land in the app: { go: 'news' | 'res' | 'holiday', id? } (validated: only these places, a number for the id)
export const GO_PLACES = ['news', 'res', 'holiday'];
export function goData(go, id) {
    if (!GO_PLACES.includes(go)) return null;
    const n = /^\d{1,16}$/.test(String(id == null ? '' : id)) ? String(id) : '';
    return { go, ...(n ? { id: n } : {}) };
}
export const goUrl = (base, g) => (g ? base + '?go=' + g.go + (g.id ? '&id=' + g.id : '') : base);

// OneSignal wants a scheduled time as "YYYY-MM-DD HH:mm:ss GMT+0000"; null when it is not a sensible moment (1 minute to 30 days ahead)
export function sendAfter(at, now) {
    at = Number(at); now = Number(now);
    if (!Number.isFinite(at) || at < now + 60000 || at > now + 30 * 86400000) return null;
    const d = new Date(at), p = (n) => String(n).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':00 GMT+0000';
}

// Pushes about one teacher's channel (a YouTube video, a Telegram post) go ONLY to phones that said "on" (positive opt-in) and belong to a signed-in
// student (tag member = 1). Before, "tag does not exist OR tag = on" also reached a phone that never synced its switch, and a web visitor with
// the default "on". Two plain AND filters: nothing depends on how OneSignal ranks OR against AND.
export const optInFilters = (tag) => [{ field: 'tag', key: tag, relation: '=', value: 'on' }, { field: 'tag', key: 'member', relation: '=', value: '1' }];

// What the panel's "فحص إشعارات الطالب" shows from OneSignal's answer for one account: the switches (tags) and the phones (subscriptions), without tokens
export function diagTrim(u) {
    const tags = (u && u.properties && u.properties.tags) || {}, keep = {};
    for (const k of Object.keys(tags)) if (/^(tube|tg_[a-z0-9_]{2,40}|off_[a-z]+|coach|member|gov)$/.test(k)) keep[k] = String(tags[k]).slice(0, 20);
    const subs = ((u && u.subscriptions) || []).slice(0, 10).map((x) => ({
        type: String(x.type || '').slice(0, 20), on: x.enabled !== false && Number(x.notification_types) !== -2 && Number(x.notification_types) !== 0 ? 1 : 0,
        os: String(x.device_os || '').slice(0, 20), model: String(x.device_model || '').slice(0, 40), app: String(x.app_version || '').slice(0, 20), sdk: String(x.sdk || '').slice(0, 20),
    }));
    return { tags: keep, subs, last: Number(u && u.properties && u.properties.last_active) || 0 };
}
