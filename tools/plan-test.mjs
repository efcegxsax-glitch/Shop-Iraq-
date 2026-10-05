// Checks the weekly study plan helpers (tutor-worker/src/plan.js).
//   node tools/plan-test.mjs
import { cleanDays, planPrompt, cleanPlan } from '../tutor-worker/src/plan.js';
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
const days = cleanDays([{ date: '2026-10-10', name: 'السبت' }, { date: 'x', name: 'bad' }, null, { date: '2026-10-11', name: 'الأحد' }]);
t('days: junk dropped', days.length === 2 && days[1].name === 'الأحد');
t('days: at most 7', cleanDays(Array.from({ length: 12 }, (_, i) => ({ date: '2026-10-' + String(10 + i), name: 'd' }))).length === 7);
t('days: not an array', cleanDays('x').length === 0 && cleanDays(null).length === 0);
const pr = planPrompt(days, 3, 'ضعيف بالفيزياء');
t('prompt: days, minutes and the note', pr.includes('1. السبت 2026-10-10') && pr.includes('180 دقيقة') && pr.includes('ضعيف بالفيزياء'));
t('prompt: hours are clamped', planPrompt(days, 99).includes('480') && planPrompt(days, 0).includes('120') && planPrompt(days, 'x').includes('120'));
const raw = { summary: 'ركزنا على الفيزياء', days: [{ tasks: [{ s: 'الفيزياء', t: 'حل أسئلة الفصل الثاني', m: 60 }, { s: 'الكيمياء', t: 'مراجعة', m: 70 }, { s: 'x', t: '', m: 20 }, null] }, { tasks: [{ s: 'عربي', t: 'قواعد', m: 5 }] }] };
const p = cleanPlan(raw, days, 2);
t('plan: dates and names come from the app, not the model', p.days[0].date === '2026-10-10' && p.days[0].d === 'السبت' && p.days[1].d === 'الأحد');
t('plan: empty and null tasks dropped, minutes within the day limit', p.days[0].tasks.length === 1 && p.days[0].tasks[0].m === 60);
t('plan: minutes clamped to 10..180', p.days[1].tasks[0].m === 10);
t('plan: summary kept', p.summary === 'ركزنا على الفيزياء');
t('plan: nothing usable gives null', cleanPlan({ days: [{ tasks: [] }] }, days, 2) === null && cleanPlan(null, days, 2) === null && cleanPlan({ days: 'x' }, days, 2) === null);
const big = cleanPlan({ summary: 's'.repeat(999), days: [{ tasks: Array.from({ length: 20 }, () => ({ s: 'a'.repeat(99), t: 't'.repeat(999), m: 10 })) }] }, [days[0]], 8);
t('plan: limits (5 tasks, text cut)', big.days[0].tasks.length === 5 && big.days[0].tasks[0].t.length === 160 && big.days[0].tasks[0].s.length === 30 && big.summary.length === 240);
console.log(bad ? bad + ' failed' : 'all ' + ok + ' passed'); process.exit(bad ? 1 : 0);
