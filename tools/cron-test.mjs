// Every schedule in tutor-worker/wrangler.toml must be named in src/cron.js, and only the tutor's own schedule may reach the tutor's push.
//   node tools/cron-test.mjs
import fs from 'node:fs';
import { routeCron, COACH_CRON, POLL_CRON, NEWS_CRON } from '../tutor-worker/src/cron.js';
let pass = 0, fail = 0;
const t = (n, ok, info) => { if (ok) pass++; else { fail++; console.log('FAIL', n, info === undefined ? '' : JSON.stringify(info)); } };
const toml = fs.readFileSync(new URL('../tutor-worker/wrangler.toml', import.meta.url), 'utf8');
const m = /crons\s*=\s*\[([^\]]*)\]/.exec(toml);
const crons = m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
t('wrangler.toml lists the schedules', crons.length === 3, crons);
t('every schedule in wrangler.toml is named', crons.every((c) => routeCron(c) !== ''), crons.map((c) => [c, routeCron(c)]));
t('each job has exactly one schedule', ['coach', 'poll', 'news'].every((j) => crons.filter((c) => routeCron(c) === j).length === 1));
t('the tutor\'s push only comes from its own schedule', routeCron(COACH_CRON) === 'coach' && routeCron(POLL_CRON) === 'poll' && routeCron(NEWS_CRON) === 'news');
t('the minute-by-minute schedule never reaches the tutor', routeCron('* * * * *') === 'news');
t('an odd schedule text runs only the news watcher, never the tutor', ['2-59/5 * * * *', '5,20,35,50 * * * *', '*/1 * * * *', '0 * * * *'].every((c) => routeCron(c) === 'news'));
t('no schedule text, nothing', routeCron('') === '' && routeCron(undefined) === '');
t('spacing differences are tolerated', routeCron('  *  *  *  *  * ') === 'news');
console.log(`cron tests passed ${pass} failed ${fail}`);
process.exit(fail ? 1 : 0);
