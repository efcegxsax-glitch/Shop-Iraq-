// Who an admin push goes to (tested in tools/push-test.mjs).
// The app sets the tag off_<kind> only while the student has that kind of notification switched off, so "tag off_<kind> does not
// exist" keeps everybody who never touched it (older installs too). Only plain AND filters are used, so nothing depends on how
// OneSignal ranks OR against AND; each governorate is its own send.
export const KINDS = ['urgent', 'announcement', 'weather', 'res', 'general', 'holiday'];

export function pushTargets(govs, cat) {
    const kind = KINDS.includes(cat) ? cat : '';
    const offOk = kind ? [{ field: 'tag', key: 'off_' + kind, relation: 'not_exists' }] : [];
    const targets = govs.length
        ? govs.map((g) => ({ filters: [{ field: 'tag', key: 'gov', relation: '=', value: g }, ...offOk] }))
        : [offOk.length ? { filters: offOk } : { included_segments: ['Total Subscriptions'] }];
    return { kind, targets };
}
