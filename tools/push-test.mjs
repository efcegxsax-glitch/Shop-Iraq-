// Checks who an admin push goes to (tutor-worker/src/push.js).
//   node tools/push-test.mjs
import { pushTargets, KINDS, sendAfter } from '../tutor-worker/src/push.js';
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
const none = pushTargets([], '');
t('no kind, no governorate: everybody', none.kind === '' && none.targets.length === 1 && none.targets[0].included_segments[0] === 'Total Subscriptions');
const k = pushTargets([], 'weather');
t('a kind: skip those who switched it off', k.kind === 'weather' && k.targets.length === 1 && k.targets[0].filters.length === 1 && k.targets[0].filters[0].key === 'off_weather' && k.targets[0].filters[0].relation === 'not_exists');
const g = pushTargets(['baghdad', 'basra'], 'holiday');
t('governorates: one send each', g.targets.length === 2 && g.targets[0].filters[0].value === 'baghdad' && g.targets[1].filters[0].value === 'basra');
t('each governorate send has only AND filters (no OR operator)', g.targets.every((x) => x.filters.length === 2 && !x.filters.some((f) => f.operator)));
t('each governorate send also skips the switched-off ones', g.targets.every((x) => x.filters[1].key === 'off_holiday'));
t('governorate without a kind: only the governorate', pushTargets(['baghdad'], '').targets[0].filters.length === 1);
t('unknown kind is ignored', pushTargets([], 'zzz').kind === '' && pushTargets([], 'zzz').targets[0].included_segments);
t('every kind the app can switch off exists here', ['urgent', 'announcement', 'weather', 'res', 'general', 'holiday'].every((x) => KINDS.includes(x)));
const u = pushTargets(['baghdad'], 'holiday', ['a'.repeat(28), 'b'.repeat(28)]);
t('named students: only them (no governorate, no kind)', u.kind === '' && u.targets.length === 1 && u.targets[0].include_aliases.external_id.length === 2 && !u.targets[0].filters);
t('an empty list of students is ignored', pushTargets([], 'weather', []).kind === 'weather');
const now = Date.UTC(2026, 9, 5, 12, 0, 0);
t('send time format', sendAfter(Date.UTC(2026, 9, 6, 4, 0, 0), now) === '2026-10-06 04:00:00 GMT+0000');
t('send time too soon', sendAfter(now + 30000, now) === null);
t('send time too far', sendAfter(now + 31 * 86400000, now) === null);
t('send time junk', sendAfter('x', now) === null && sendAfter(undefined, now) === null);
console.log(bad ? bad + ' failed' : 'all ' + ok + ' passed'); process.exit(bad ? 1 : 0);
