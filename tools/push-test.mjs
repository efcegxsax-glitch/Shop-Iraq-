// Checks who an admin push goes to (tutor-worker/src/push.js).
//   node tools/push-test.mjs
import { pushTargets, KINDS, sendAfter, goData, goUrl, GO_PLACES, optInFilters, diagTrim } from '../tutor-worker/src/push.js';
let ok = 0, bad = 0;
// the news bot's pushes: the kind AND the Telegram-news switch, both plain AND filters
const nb = pushTargets([], 'urgent', undefined, ['tgnews']);

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
t('news bot push: skips who switched the kind OR the Telegram news off (two AND filters)', nb.kind === 'urgent' && nb.targets.length === 1 && nb.targets[0].filters.length === 2 && nb.targets[0].filters.map((f) => f.key).join() === 'off_urgent,off_tgnews' && !nb.targets[0].filters.some((f) => f.operator));
t('...with a governorate each send still has only AND filters', pushTargets(['baghdad'], 'announcement', undefined, ['tgnews']).targets[0].filters.length === 3);
t('an unknown extra kind is ignored, a repeated one is not doubled', pushTargets([], 'announcement', undefined, ['nonsense', 'announcement']).targets[0].filters.length === 1);
t('the Telegram news kind exists for admin pushes too', KINDS.includes('tgnews'));
// where a tap on a notification lands
t('goData: a news with its id', JSON.stringify(goData('news', 1791999999999)) === '{"go":"news","id":"1791999999999"}' && JSON.stringify(goData('news', '123')) === '{"go":"news","id":"123"}');
t('goData: a place without an id is fine, an odd id is dropped', JSON.stringify(goData('res')) === '{"go":"res"}' && JSON.stringify(goData('holiday', 'x;DROP')) === '{"go":"holiday"}' && JSON.stringify(goData('news', '1'.repeat(30))) === '{"go":"news"}');
t('goData: only known places', goData('admin') === null && goData('') === null && goData(undefined) === null && GO_PLACES.length === 3);
t('goUrl: the web address carries the place', goUrl('https://x.io/app/', goData('news', 77)) === 'https://x.io/app/?go=news&id=77' && goUrl('https://x.io/app/', goData('holiday')) === 'https://x.io/app/?go=holiday' && goUrl('https://x.io/app/', null) === 'https://x.io/app/');
// teachers' pushes: only phones that said "on" AND belong to a signed-in student; two AND filters, no OR
const of = optInFilters('tg_mathteacher');
t('teacher push: tag on AND member = 1', of.length === 2 && of[0].key === 'tg_mathteacher' && of[0].relation === '=' && of[0].value === 'on' && of[1].key === 'member' && of[1].value === '1');
t('teacher push: no OR, no "not exists" (a phone that never synced is not included)', !of.some((f) => f.operator || f.relation === 'not_exists'));
const dg = diagTrim({ properties: { tags: { tube: 'off', member: '1', tg_a_b: 'on', tg_c: 'off', secret: 'x', off_urgent: '1', gov: 'bg' }, last_active: 1700000000 }, subscriptions: [{ type: 'AndroidPush', enabled: true, notification_types: 1, device_os: '14', device_model: 'Redmi', app_version: '1.0.50', token: 'SECRET-TOKEN', sdk: '5.0' }, { type: 'ChromePush', enabled: false, notification_types: -2 }] });
t('diag: keeps the switches and drops everything else', dg.tags.tube === 'off' && dg.tags.member === '1' && dg.tags.tg_a_b === 'on' && dg.tags.off_urgent === '1' && dg.tags.secret === undefined);
t('diag: the phones are listed, no token', dg.subs.length === 2 && dg.subs[0].type === 'AndroidPush' && dg.subs[0].on === 1 && dg.subs[1].on === 0 && !JSON.stringify(dg).includes('SECRET-TOKEN'));
t('diag: an unknown account gives empty lists', diagTrim(null).subs.length === 0 && Object.keys(diagTrim({}).tags).length === 0);
console.log(bad ? bad + ' failed' : 'all ' + ok + ' passed'); process.exit(bad ? 1 : 0);
