// Checks the schedule maths of the motivation pushes in tutor-worker/src/motiv.js.
//   node tools/motiv-test.mjs
import { motivDue, okPlan, isTime, isDate, motivSummary } from '../tutor-worker/src/motiv.js';
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
// Baghdad = UTC+3: 14:30 in Baghdad is 11:30 UTC
const at = (s) => Date.parse(s);
const P = { t: 'رجعتو من المدرسة؟', b: 'ارتاحوا وتغدّوا', time: '14:30', mode: 'forever', start: '2026-10-07' };
t('time/date checks', isTime('00:00') && isTime('23:59') && !isTime('24:00') && !isTime('9:30') && isDate('2026-10-07') && !isDate('2026-13-01') && !isDate('x'));
t('plan checks', okPlan(P) && !okPlan({ ...P, t: ' ' }) && !okPlan({ ...P, time: '25:00' }) && !okPlan({ ...P, mode: 'days', n: 0 }) && !okPlan({ ...P, mode: 'days', n: 1.5 }) && !okPlan({ ...P, mode: 'x' }) && !okPlan({ ...P, on: false }) && !okPlan(null));
t('due 10 minutes ahead (exact time kept)', (() => { const d = motivDue(P, at('2026-10-07T11:20:00Z')); return d.length === 1 && d[0].ts === at('2026-10-07T11:30:00Z') && d[0].date === '2026-10-07'; })());
t('not due 30 minutes ahead', motivDue(P, at('2026-10-07T11:00:00Z')).length === 0);
t('just missed (2 minutes ago) is still sent', motivDue(P, at('2026-10-07T11:32:00Z')).length === 1);
t('missed by 10 minutes is dropped', motivDue(P, at('2026-10-07T11:40:00Z')).length === 0);
t('before the start date: nothing', motivDue(P, at('2026-10-06T11:20:00Z')).length === 0);
t('every day: the next day too', motivDue(P, at('2026-10-20T11:20:00Z')).length === 1);
// the Baghdad day is not the UTC day: 00:10 Baghdad is 21:10 UTC the day before
const N = { ...P, time: '00:10' };
t('just after midnight Baghdad time', (() => { const d = motivDue(N, at('2026-10-07T21:05:00Z')); return d.length === 1 && d[0].date === '2026-10-08'; })());
// N days from the start date
const D3 = { ...P, mode: 'days', n: 3 };
t('3 days: day 1, 2, 3 yes, day 4 no', ['2026-10-07', '2026-10-08', '2026-10-09'].every((d) => motivDue(D3, at(d + 'T11:20:00Z')).length === 1) && motivDue(D3, at('2026-10-10T11:20:00Z')).length === 0);
const ONE = { ...P, mode: 'days', n: 1 };
t('one day: only that day', motivDue(ONE, at('2026-10-07T11:20:00Z')).length === 1 && motivDue(ONE, at('2026-10-08T11:20:00Z')).length === 0);
// chosen weekdays (2026-10-07 is a Wednesday = 3)
const W = { ...P, wd: [6, 0, 1, 2, 3, 4] };               // Saturday to Thursday: no Friday (5)
t('no Friday', motivDue(W, at('2026-10-07T11:20:00Z')).length === 1 && motivDue(W, at('2026-10-09T11:20:00Z')).length === 0);
t('paused plan sends nothing', motivDue({ ...P, on: false }, at('2026-10-07T11:20:00Z')).length === 0);
t('summary', motivSummary(P) === 'كل يوم الساعة 14:30' && /3 أيام من 2026-10-07/.test(motivSummary(D3)) && /يوم 2026-10-07/.test(motivSummary(ONE)) && motivSummary(null) === '');
console.log('motiv tests passed', ok, 'failed', bad);
process.exit(bad ? 1 : 0);
