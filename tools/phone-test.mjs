// Checks the phone-number sign-in lookup (tutor-worker/src/phone.js and its mode in index.js).
//   node tools/phone-test.mjs
import { phoneEmail } from '../tutor-worker/src/phone.js';
import worker from '../tutor-worker/src/index.js';
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
const db = (rec) => ({ get: async (p) => (p === 'phoneIndex/07701234567' ? rec : null) });
t('a number with an account gives its email', (await phoneEmail(db({ e: 'a@b.co', u: 'x' }), '07701234567')) === 'a@b.co');
t('a number without an account gives nothing', (await phoneEmail(db(null), '07709999999')) === '');
t('a record without a proper email gives nothing', (await phoneEmail(db({ e: 'not-an-email', u: 'x' }), '07701234567')) === '' && (await phoneEmail(db({ e: 5 }), '07701234567')) === '');
t('an odd number is refused before any read', (await phoneEmail({ get: async () => { throw new Error('read'); } }, '../x')) === '' && (await phoneEmail({ get: async () => { throw new Error('read'); } }, '123')) === '');
t('a very long email is refused', (await phoneEmail(db({ e: 'a'.repeat(130) + '@b.co', u: 'x' }), '07701234567')) === '');

const call = (env, body, headers = {}) => worker.fetch(new Request('https://w.test/', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://efcegxsax-glitch.github.io', ...headers }, body: JSON.stringify(body) }), env, { waitUntil() {} });
const base = { ALLOWED_ORIGINS: 'https://efcegxsax-glitch.github.io', FIREBASE_DB_URL: 'https://x.firebaseio.com' };
let r = await call({ ...base }, { mode: 'phonelogin', pk: '07701234567' });
t('without the database key: 503 (the app then falls back)', r.status === 503);
r = await call({ ...base, PER_PHONE: { limit: async () => ({ success: false }) } }, { mode: 'phonelogin', pk: '07701234567' });
t('over the limit: 429', r.status === 429);
let key = '';
r = await call({ ...base, PER_PHONE: { limit: async (o) => { key = o.key; return { success: false }; } } }, { mode: 'phonelogin', pk: '1' }, { 'CF-Connecting-IP': '1.2.3.4' });
t('the limit is per caller address', key === 'ph1.2.3.4');
r = await call({ ...base }, { mode: 'ytfeed', ids: [] });
t('every other mode still needs sign-in', r.status === 401);
console.log(`phone tests passed ${ok} failed ${bad}`);
process.exit(bad ? 1 : 0);
