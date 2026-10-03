// Checks database.rules.json against the Firebase emulator: what must be allowed and what must be refused.
//   npm i --no-save firebase-tools @firebase/rules-unit-testing firebase   (in the repo folder)
//   npx firebase emulators:start --only database --project demo-isp
//   node tools/rules-test.mjs
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import fs from 'fs';
import { ref, get, set, update, runTransaction } from 'firebase/database';
const env = await initializeTestEnvironment({ projectId: 'demo-isp', database: { host: '127.0.0.1', port: 9000, rules: fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8') } });
const db = (u) => (u === 'adm' ? env.authenticatedContext(u, { email: 'panel.admin@iraqi-student-platform.app' }) : u ? env.authenticatedContext(u) : env.unauthenticatedContext()).database();
const seed = async (path, v) => env.withSecurityRulesDisabled(async (c) => { await set(ref(c.database(), path), v); });
let pass = 0, fail = 0;
const ok = async (name, p) => { try { await assertSucceeds(p); pass++; } catch (e) { fail++; console.log('SHOULD PASS:', name, String(e.message || e).slice(0, 200)); } };
const no = async (name, p) => { try { await assertFails(p); pass++; } catch (e) { fail++; console.log('SHOULD FAIL:', name, String(e.message || e).slice(0, 200)); } };
const U = (u, o) => update(ref(db(u)), o);
const now = Date.now();
await env.clearDatabase();

// admin
await no('student makes himself admin', set(ref(db('bob'), 'admins/bob'), true));
await ok('panel adds an admin', set(ref(db('adm'), 'admins/helper'), true));
await ok('listed admin reads root', get(ref(db('helper'), '/')));
await ok('admin reads root', get(ref(db('adm'), '/')));
await no('student reads root', get(ref(db('u1'), '/')));
await ok('admin writes news', set(ref(db('adm'), 'news/1'), { title: 'x' }));
await no('student writes news', set(ref(db('u1'), 'news/2'), { title: 'x' }));
await ok('guest reads news', get(ref(db(null), 'news')));
await ok('admin writes resource file', set(ref(db('adm'), 'resourceFiles/1'), 'data:application/pdf;base64,AAAA'));
await no('student writes resource file', set(ref(db('u1'), 'resourceFiles/2'), 'data:x'));
await ok('guest reads resource file', get(ref(db(null), 'resourceFiles/1')));
await no('resource file must be a string', set(ref(db('adm'), 'resourceFiles/3'), { a: 1 }));
await ok('student joins the hall', set(ref(db('u1'), 'hall/u1'), { n: 'علي', g: 'بغداد', a: 'data:image/jpeg;base64,AAAA', at: now }));
await no('student joins as someone else', set(ref(db('u1'), 'hall/u2'), { n: 'x', at: now }));
await no('hall time in the future', set(ref(db('u1'), 'hall/u1'), { n: 'علي', at: now + 3600000 }));
await no('hall extra field', set(ref(db('u1'), 'hall/u1'), { n: 'علي', at: now, x: 1 }));
await no('hall photo too big', set(ref(db('u1'), 'hall/u1'), { n: 'علي', at: now, a: 'x'.repeat(9000) }));
await ok('signed student reads the hall', get(ref(db('u2'), 'hall')));
await no('guest reads the hall', get(ref(db(null), 'hall')));
await ok('student leaves the hall', set(ref(db('u1'), 'hall/u1'), null));
await ok('post a forum thread', set(ref(db('u1'), 'forumThreads/10'), { id: 10, subject: 'math', kind: 'q', title: 'سؤال', body: 'نص', authorUid: 'u1', authorName: 'a', answersCount: 0 }));
await no('forum thread as someone else', set(ref(db('u1'), 'forumThreads/11'), { id: 11, body: 'x', authorUid: 'u2' }));
await no('forum thread bad kind', set(ref(db('u1'), 'forumThreads/12'), { id: 12, body: 'x', kind: 'spam', authorUid: 'u1' }));
await no('forum thread body too long', set(ref(db('u1'), 'forumThreads/13'), { id: 13, body: 'x'.repeat(3100), authorUid: 'u1' }));
await ok('author marks the best answer', set(ref(db('u1'), 'forumThreads/10/best'), 5));
await no('other marks the best answer', set(ref(db('u2'), 'forumThreads/10/best'), 6));
await no('best answer must be a number', set(ref(db('u1'), 'forumThreads/10/best'), 'x'));
await ok('other answers the thread', set(ref(db('u2'), 'forumAnswers/10/5'), { id: 5, body: 'جواب', authorUid: 'u2' }));
await no('answer too long', set(ref(db('u2'), 'forumAnswers/10/6'), { id: 6, body: 'x'.repeat(2100), authorUid: 'u2' }));
await ok('helpful vote on an answer', set(ref(db('u1'), 'forumAnswers/10/5/likes/u1'), true));
await no('vote as someone else', set(ref(db('u1'), 'forumAnswers/10/5/likes/u2'), true));
await no('edit someone else answer', set(ref(db('u1'), 'forumAnswers/10/5/body'), 'x'));
await ok('author deletes own thread', set(ref(db('u1'), 'forumThreads/10'), null));
await no('other deletes a thread', (async () => { await seed('forumThreads/20', { id: 20, body: 'x', authorUid: 'u1' }); await set(ref(db('u2'), 'forumThreads/20'), null); })());
// news reactions
await ok('student reacts like', U('u1', { 'userNewsReact/u1/5': 'like', 'newsReactCounts/5/like': 1 }));
await no('inflate a counter alone', U('u2', { 'newsReactCounts/5/like': 2 }));
await no('count by two', U('u2', { 'userNewsReact/u2/5': 'like', 'newsReactCounts/5/like': 3 }));
await ok('second student reacts like', U('u2', { 'userNewsReact/u2/5': 'like', 'newsReactCounts/5/like': 2 }));
await ok('student switches to love', U('u1', { 'userNewsReact/u1/5': 'love', 'newsReactCounts/5/like': 1, 'newsReactCounts/5/love': 1 }));
await no('switch without lowering the old count', U('u2', { 'userNewsReact/u2/5': 'sad', 'newsReactCounts/5/sad': 1 }));
await no('unknown reaction', U('u3', { 'userNewsReact/u3/5': 'cry', 'newsReactCounts/5/cry': 1 }));
await ok('student removes the reaction', U('u1', { 'userNewsReact/u1/5': null, 'newsReactCounts/5/love': 0 }));
await no('lower a count of someone else reaction', U('u3', { 'newsReactCounts/5/like': 0 }));
await no('write another student reaction', set(ref(db('u3'), 'userNewsReact/u1/5'), 'angry'));
await ok('guest reads the counts', get(ref(db(null), 'newsReactCounts')));
await no('read another student reactions', get(ref(db('u3'), 'userNewsReact/u1')));
await ok('admin writes admission', set(ref(db('adm'), 'admission/base/med'), 98));
await no('student writes admission', set(ref(db('u1'), 'admission/base/med'), 60));
await ok('guest reads admission', get(ref(db(null), 'admission')));
await no('guest reads users', get(ref(db(null), 'users')));
await no('student reads every record', get(ref(db('u1'), 'users')));
await no('student reads another record', get(ref(db('u1'), 'users/u2')));
await ok('student reads own record', get(ref(db('u1'), 'users/u1')));
await ok('public directory entry', set(ref(db('u1'), 'pub/u1'), { n: 'علي', s: '12345', g: 'بغداد' }));
// غرفتنا
const rm1 = { meta: { host: 'u1', title: 'غرفة', at: Date.now() }, members: { u1: { n: 'علي', c: 'lulu', s: 0, st: 's', at: Date.now(), m: 0, j: Date.now() } } };
await ok('create 3D room', set(ref(db('u1'), 'rmRooms/abc123'), rm1));
await no('create room with someone else as host', set(ref(db('u2'), 'rmRooms/abc999'), { meta: { host: 'u1', title: 'x', at: 1 }, members: { u2: { n: 'x', c: 'lulu', s: 0 } } }));
await ok('join 3D room', set(ref(db('u2'), 'rmRooms/abc123/members/u2'), { n: 'سارة', c: 'mimi', s: 1, st: 's', at: Date.now(), m: 0, j: Date.now() }));
await no('join with a bad character id', set(ref(db('u3'), 'rmRooms/abc123/members/u3'), { n: 'x', c: 'BAD ID!', s: 2 }));
await no('join with a seat out of range', set(ref(db('u3'), 'rmRooms/abc123/members/u3'), { n: 'x', c: 'lulu', s: 9 }));
await no('join as someone else', set(ref(db('u3'), 'rmRooms/abc123/members/u2'), { n: 'x', c: 'lulu', s: 3 }));
await ok('update own state', update(ref(db('u2'), 'rmRooms/abc123/members/u2'), { st: 'r', m: 5, at: Date.now() }));
await no('minutes out of range', update(ref(db('u2'), 'rmRooms/abc123/members/u2'), { m: 999999 }));
await ok('leave the room', set(ref(db('u2'), 'rmRooms/abc123/members/u2'), null));
await ok('rejoin', set(ref(db('u2'), 'rmRooms/abc123/members/u2'), { n: 'سارة', c: 'mimi', s: 1, st: 's', at: Date.now(), m: 0, j: Date.now() }));
await ok('member reaction event', set(ref(db('u2'), 'rmRooms/abc123/ev/e1'), { u: 'u2', t: 'poke', to: 'u1', at: Date.now() }));
await no('reaction by a non member', set(ref(db('u3'), 'rmRooms/abc123/ev/e2'), { u: 'u3', t: 'poke', at: Date.now() }));
await no('reaction with a made up type', set(ref(db('u2'), 'rmRooms/abc123/ev/e3'), { u: 'u2', t: 'hack', at: Date.now() }));
await no('reaction in someone else name', set(ref(db('u2'), 'rmRooms/abc123/ev/e4'), { u: 'u1', t: 'poke', at: Date.now() }));
await ok('member chat', set(ref(db('u2'), 'rmRooms/abc123/chat/c1'), { u: 'u2', m: 'هلا', at: Date.now() }));
await no('chat by a non member', set(ref(db('u3'), 'rmRooms/abc123/chat/c2'), { u: 'u3', m: 'هلا', at: Date.now() }));
await no('chat too long', set(ref(db('u2'), 'rmRooms/abc123/chat/c3'), { u: 'u2', m: 'x'.repeat(200), at: Date.now() }));
await ok('host starts the timer', update(ref(db('u1'), 'rmRooms/abc123/meta'), { pm: { k: 'f', e: Date.now() + 1500000 } }));
await no('member starts the timer', update(ref(db('u2'), 'rmRooms/abc123/meta'), { pm: { k: 'f', e: 1 } }));
await no('timer with a bad phase', update(ref(db('u1'), 'rmRooms/abc123/meta'), { pm: { k: 'x', e: 1 } }));
await ok('host kicks', set(ref(db('u1'), 'rmRooms/abc123/kicked/u3'), true));
await no('member kicks', set(ref(db('u2'), 'rmRooms/abc123/kicked/u1'), true));
await no('kicked student joins', set(ref(db('u3'), 'rmRooms/abc123/members/u3'), { n: 'x', c: 'lulu', s: 2 }));
await ok('invite a friend', set(ref(db('u1'), 'rmInvites/u3/abc123'), { from: 'u1', fn: 'علي', t: 'غرفة', at: Date.now() }));
await no('invite in someone else name', set(ref(db('u2'), 'rmInvites/u3/abc123'), { from: 'u1', fn: 'x', t: 'x', at: 1 }));
await ok('read own invites', get(ref(db('u3'), 'rmInvites/u3')));
await no('read others invites', get(ref(db('u2'), 'rmInvites/u3')));
await ok('own room minutes', set(ref(db('u1'), 'rmMe/u1'), { min: 120, c: 'rio' }));
await no('room minutes of someone else', set(ref(db('u2'), 'rmMe/u1'), { min: 1 }));
await no('negative minutes', set(ref(db('u1'), 'rmMe/u1'), { min: -5 }));
await no('non member closes the room', set(ref(db('u3'), 'rmRooms/abc123'), null));
await ok('host closes the room', set(ref(db('u1'), 'rmRooms/abc123'), null));
await ok('own money notebook', set(ref(db('u1'), 'userMoney/u1'), '{"v":1}'));
await ok('read own money notebook', get(ref(db('u1'), 'userMoney/u1')));
await no('read someone else money notebook', get(ref(db('u2'), 'userMoney/u1')));
await no('write someone else money notebook', set(ref(db('u2'), 'userMoney/u1'), 'x'));
await no('money notebook not a string', set(ref(db('u1'), 'userMoney/u1'), { a: 1 }));
await ok('own open chat', set(ref(db('u1'), 'chatNow/u1'), { c: 'u2', at: Date.now() }));
await ok('chat partner reads open chat', get(ref(db('u2'), 'chatNow/u1')));
await no('third person reads open chat', get(ref(db('u3'), 'chatNow/u1')));
await no('open chat for someone else', set(ref(db('u2'), 'chatNow/u1'), { c: 'u2', at: 1 }));
await ok('directory photo address', set(ref(db('u1'), 'pub/u1'), { n: 'علي', s: '12345', g: 'بغداد', p: 'https://firebasestorage.googleapis.com/v0/b/x/o/avatars%2Fu1.jpg?alt=media&token=abc' }));
await no('directory photo that is not https', set(ref(db('u1'), 'pub/u1'), { n: 'علي', p: 'javascript:alert(1)' }));
await no('directory photo too long', set(ref(db('u1'), 'pub/u1'), { n: 'علي', p: 'https://' + 'a'.repeat(700) }));
await no('directory entry for someone else', set(ref(db('u2'), 'pub/u1'), { n: 'x' }));
await ok('students read the directory', get(ref(db('u2'), 'pub')));
await no('guests read the directory', get(ref(db(null), 'pub')));
await ok('claim own number', set(ref(db('u1'), 'numIndex/12345'), 'u1'));
await no('take a claimed number', set(ref(db('u2'), 'numIndex/12345'), 'u2'));
await no('claim a number for someone else', set(ref(db('u2'), 'numIndex/55555'), 'u1'));
await ok('look up a number', get(ref(db('u2'), 'numIndex/12345')));

// new user
await ok('new user profile', update(ref(db('n1'), 'users/n1'), { fullName: 'a', points: 0, balance: 0 }));
await no('new user with points', update(ref(db('n2'), 'users/n2'), { fullName: 'a', points: 5000 }));
await no('new user with balance', update(ref(db('n3'), 'users/n3'), { balance: 50 }));
await ok('leaderboard 0', update(ref(db('n1'), 'leaderboard/n1'), { name: 'a', points: 0 }));

// points
await seed('users/u1', { points: 100, balance: 5, pAt: 0 });
await seed('users/u2', { points: 1000, balance: 1, pAt: 0 });
await seed('users/u3', { points: 6000, balance: 0 });
await ok('earn 150', U('u1', { 'users/u1/points': 250, 'users/u1/pAt': now, 'leaderboard/u1/points': 250 }));
await no('earn again too soon', U('u1', { 'users/u1/points': 300, 'users/u1/pAt': now + 5000 }));
await no('pAt in the future', U('u1', { 'users/u1/points': 300, 'users/u1/pAt': now + 60000 }));
await no('earn 300 at once', U('u1', { 'users/u1/points': 550, 'users/u1/pAt': now + 20000 }));
await no('earn without pAt', set(ref(db('u1'), 'users/u1/points'), 260));
await no('pAt moved back', set(ref(db('u1'), 'users/u1/pAt'), 1));
await no('delete points', set(ref(db('u1'), 'users/u1/points'), null));
await no('leaderboard wrong points', set(ref(db('u1'), 'leaderboard/u1/points'), 99999));
await ok('leaderboard matching points', set(ref(db('u1'), 'leaderboard/u1/points'), 250));
await ok('spend points', runTransaction(ref(db('u1'), 'users/u1/points'), (c) => (c === null ? 0 : c - 50)));
await no('other user writes my points', set(ref(db('u2'), 'users/u1/points'), 0));
await no('points negative', set(ref(db('u1'), 'users/u1/points'), -5));
await ok('profile field', update(ref(db('u1'), 'users/u1'), { fullName: 'Ali', grades: { a: 1 } }));
await no('profile of someone else', update(ref(db('u2'), 'users/u1'), { fullName: 'x' }));

// balance
await no('raise balance', set(ref(db('u1'), 'users/u1/balance'), 50));
await ok('withdraw', set(ref(db('u1'), 'users/u1/balance'), 4));
await seed('topupCodes/ABCD1', { value: 13250, used: false });
await no('guest reads a code', get(ref(db(null), 'topupCodes/ABCD1')));
await no('student lists codes', get(ref(db('u1'), 'topupCodes')));
await no('top-up too much', U('u1', { 'topupCodes/ABCD1/used': true, 'topupCodes/ABCD1/usedBy': 'u1', 'topupCodes/ABCD1/usedAt': now, 'users/u1/balance': 20, 'users/u1/bt': 'ABCD1' }));
await no('top-up without marking used', U('u1', { 'users/u1/balance': 14, 'users/u1/bt': 'ABCD1' }));
await ok('top-up', U('u1', { 'topupCodes/ABCD1/used': true, 'topupCodes/ABCD1/usedBy': 'u1', 'topupCodes/ABCD1/usedAt': now, 'users/u1/balance': 14, 'users/u1/bt': 'ABCD1' }));
await no('top-up same code again', U('u2', { 'topupCodes/ABCD1/used': true, 'topupCodes/ABCD1/usedBy': 'u2', 'users/u2/balance': 11, 'users/u2/bt': 'ABCD1' }));
await no('re-credit with old bt', U('u1', { 'users/u1/balance': 24 }));
await no('free the code again', set(ref(db('u1'), 'topupCodes/ABCD1/used'), false));

// transfer u1 -> u2
const tr = 'tr_1_1';
await no('transfer without paying', U('u1', { [`incoming/u2/${tr}`]: { from: 'u1', name: 'A', amount: 3, at: now, claimed: false }, 'users/u1/bs': tr }));
await no('transfer paying less', U('u1', { 'users/u1/balance': 13, 'users/u1/bs': tr, [`incoming/u2/${tr}`]: { from: 'u1', name: 'A', amount: 3, at: now, claimed: false } }));
await no('two incoming for one payment', U('u1', { 'users/u1/balance': 11, 'users/u1/bs': tr, [`incoming/u2/${tr}`]: { from: 'u1', amount: 3, at: now, claimed: false }, 'incoming/u2/tr_1_2': { from: 'u1', amount: 3, at: now, claimed: false } }));
await no('incoming pretending another sender', U('u1', { 'users/u1/balance': 11, 'users/u1/bs': tr, [`incoming/u2/${tr}`]: { from: 'u3', amount: 3, at: now, claimed: false } }));
await ok('transfer', U('u1', { 'users/u1/balance': 11, 'users/u1/bs': tr, [`incoming/u2/${tr}`]: { from: 'u1', name: 'A', amount: 3, at: now, claimed: false }, [`transfers/${tr}`]: { from: 'u1', to: 'u2', amount: 3, createdAt: now } }));
await no('u3 reads u2 incoming', get(ref(db('u3'), 'incoming/u2')));
await no('claim too much', U('u2', { [`incoming/u2/${tr}/claimed`]: true, 'users/u2/balance': 10, 'users/u2/bi': tr }));
await ok('claim transfer', U('u2', { [`incoming/u2/${tr}/claimed`]: true, 'users/u2/balance': 4, 'users/u2/bi': tr }));
await no('claim transfer twice', U('u2', { [`incoming/u2/${tr}/claimed`]: true, 'users/u2/balance': 7, 'users/u2/bi': tr }));
await no('unclaim', set(ref(db('u2'), `incoming/u2/${tr}/claimed`), false));

// redeem points -> balance
await no('redeem without ps', U('u3', { 'users/u3/points': 1000, 'users/u3/balance': 0.38 }));
await no('redeem too much money', U('u3', { 'users/u3/points': 1000, 'users/u3/balance': 1, 'users/u3/ps': 'r:1' }));
await no('free cents', U('u3', { 'users/u3/points': 6000, 'users/u3/balance': 0.01, 'users/u3/ps': 'r:2' }));
await ok('redeem 5000', U('u3', { 'users/u3/points': 1000, 'leaderboard/u3/points': 1000, 'users/u3/balance': 0.38, 'users/u3/ps': 'r:3' }));

// auction
await seed('auction/current', { id: 'A1', endsAt: now + 3600000, title: 'x' });
await seed('users/b1', { points: 1000, balance: 0 });
await seed('users/b2', { points: 1000, balance: 0 });
const top = (u, amount) => ({ uid: u, name: u, num: '1', amount, at: now });
await no('bid without paying', U('b1', { 'auctionBids/A1/top': top('b1', 100), 'users/b1/ps': 'a:A1:100' }));
await no('bid paying without ps', U('b1', { 'auctionBids/A1/top': top('b1', 100), 'users/b1/points': 900 }));
await ok('first bid', U('b1', { 'auctionBids/A1/top': top('b1', 100), 'users/b1/points': 900, 'users/b1/ps': 'a:A1:100' }));
await no('outbid without refund', U('b2', { 'auctionBids/A1/top': top('b2', 150), 'users/b2/points': 850, 'users/b2/ps': 'a:A1:150' }));
await no('outbid lower', U('b2', { 'auctionBids/A1/top': top('b2', 90), 'users/b2/points': 910, 'users/b2/ps': 'a:A1:90', 'auctionBids/A1/refunds/b1/100': { amount: 100, at: now } }));
await no('fake refund bigger', U('b2', { 'auctionBids/A1/top': top('b2', 150), 'users/b2/points': 850, 'users/b2/ps': 'a:A1:150', 'auctionBids/A1/refunds/b1/100': { amount: 500, at: now } }));
await ok('outbid', U('b2', { 'auctionBids/A1/top': top('b2', 150), 'users/b2/points': 850, 'users/b2/ps': 'a:A1:150', 'auctionBids/A1/refunds/b1/100': { amount: 100, at: now } }));
await no('refund claim by someone else', U('b2', { 'auctionBids/A1/refunds/b1/100/c': true, 'users/b2/points': 950, 'users/b2/pc': 'auctionBids/A1/refunds/b1/100' }));
await no('refund claim too much', U('b1', { 'auctionBids/A1/refunds/b1/100/c': true, 'users/b1/points': 1500, 'users/b1/pc': 'auctionBids/A1/refunds/b1/100' }));
await ok('refund claim', U('b1', { 'auctionBids/A1/refunds/b1/100/c': true, 'users/b1/points': 1000, 'users/b1/pc': 'auctionBids/A1/refunds/b1/100' }));
await no('refund claim twice', U('b1', { 'auctionBids/A1/refunds/b1/100/c': true, 'users/b1/points': 1100, 'users/b1/pc': 'auctionBids/A1/refunds/b1/100' }));
await ok('raise own bid', U('b2', { 'auctionBids/A1/top': top('b2', 200), 'users/b2/points': 800, 'users/b2/ps': 'a:A1:200' }));
await seed('auction/current/endsAt', Date.now() + 60000);
await ok('extend end', set(ref(db('b2'), 'auction/current/endsAt'), Date.now() + 120000));
await no('extend end by an hour', set(ref(db('b2'), 'auction/current/endsAt'), Date.now() + 3600000));
await no('extend end by non-top', set(ref(db('b1'), 'auction/current/endsAt'), Date.now() + 121000));
await ok('bid log', set(ref(db('b1'), 'auctionBids/A1/log/1_b1'), { uid: 'b1', amount: 1 }));

// store
await seed('users/s1', { points: 500, balance: 0 });
const order = (t) => ({ id: 7, buyerUid: 's1', items: [], totalPoints: t, status: 'placed', createdAt: now });
await no('order without paying', U('s1', { 'storeOrders/7': order(300), 'users/s1/ps': 'o:7' }));
await no('order and redeem with one payment', U('s1', { 'storeOrders/7': order(300), 'users/s1/points': 200, 'users/s1/ps': 'o:7', 'users/s1/balance': 0.02 }));
await ok('order', U('s1', { 'storeOrders/7': order(300), 'users/s1/points': 200, 'users/s1/ps': 'o:7', 'leaderboard/s1/points': 200 }));
await no('student reads orders', get(ref(db('s1'), 'storeOrders')));

// friends, chats
await ok('friend request', set(ref(db('f1'), 'friendRequests/f2/f1'), { from: 'f1' }));
await no('fake friend request', set(ref(db('f3'), 'friendRequests/f2/f1'), { from: 'f1' }));
await ok('accept: my side', set(ref(db('f2'), 'friends/f2/f1'), { uid: 'f1' }));
await ok('accept: their side', set(ref(db('f2'), 'friends/f1/f2'), { uid: 'f2' }));
await no('force a friendship', set(ref(db('f3'), 'friends/f1/f3'), { uid: 'f3' }));
await ok('chat message', U('f1', { 'privateChats/f1_f2/messages/1': { from: 'f1', text: 'hi' }, 'userChats/f1/f2/lastMessage': 'hi', 'userChats/f2/f1/lastMessage': 'hi' }));
await no('outsider reads chat', get(ref(db('f3'), 'privateChats/f1_f2')));
await ok('member reads chat', get(ref(db('f2'), 'privateChats/f1_f2/messages')));
await no('outsider reads inbox', get(ref(db('f3'), 'userChats/f1')));

// duels
await ok('duel create', set(ref(db('d1'), 'duels/5'), { player1Uid: 'd1', player2Uid: 'd2', status: 'pending' }));
await ok('duel invite', set(ref(db('d1'), 'duelInvites/d2/5'), { fromUid: 'd1' }));
await ok('userDuels other', set(ref(db('d1'), 'userDuels/d2/5'), true));
await ok('duel accept', set(ref(db('d2'), 'duels/5/status'), 'active'));
await no('outsider edits duel', set(ref(db('d3'), 'duels/5/scores/d3'), 5));

// twins
await ok('queue', set(ref(db('t1'), 'twinQueue/s/t1'), { alias: 'a', at: now }));
await ok('claim', runTransaction(ref(db('t2'), 'twinQueue/s/t1/claimedBy'), (c) => (c ? undefined : 't2')));
await ok('pair', U('t2', { 'twins/p1': { stage: 's', members: { t1: { alias: 'a' }, t2: { alias: 'b' } } }, 'twinOf/t1': 'p1', 'twinOf/t2': 'p1', 'twinQueue/s/t1': null, 'twinQueue/s/t2': null }));
await no('bogus twinOf', set(ref(db('t3'), 'twinOf/t1'), 'p9'));
await ok('end twin', U('t1', { 'twins/p1/ended': now, 'twinOf/t1': null, 'twinOf/t2': null }));

// public counters and guest writes
await ok('error report', runTransaction(ref(db(null), 'errors/2026-01-01_x'), (c) => ({ msg: 'e', n: (c && c.n || 0) + 1 })));
await ok('device ping', update(ref(db(null), 'devices/abc'), { last: now, gov: '1' }));
await ok('opens +1', runTransaction(ref(db(null), 'stats/daily/d/opens'), (c) => (c || 0) + 1));
await no('opens +5', set(ref(db(null), 'stats/daily/d/opens'), 10));
await ok('forest +1', runTransaction(ref(db('u1'), 'forest/govs/g1'), (c) => ({ t: ((c && c.t) || 0) + 1, m: ((c && c.m) || 0) + 45 })));
await no('forest +100 trees', set(ref(db('u1'), 'forest/govs/g1'), { t: 100, m: 45 }));
await no('forest guest', runTransaction(ref(db(null), 'forest/govs/g1'), (c) => ({ t: ((c && c.t) || 0) + 1, m: ((c && c.m) || 0) + 45 })));
await ok('gov war', runTransaction(ref(db('u1'), 'govWar/w1/g1'), (c) => ({ minutes: ((c && c.minutes) || 0) + 60, sessions: ((c && c.sessions) || 0) + 1 })));
await ok('golden +1', runTransaction(ref(db('u1'), 'golden/d/n'), (c) => (c || 0) + 1));

// dreams and polls
await no('guest dream', set(ref(db(null), 'dreams/1'), { t: 'x', o: 'd_1', amen: 0 }));
await ok('dream', set(ref(db('u1'), 'dreams/2'), { id: 2, t: 'x', o: 'u1', amen: 0 }));
await ok('amen by guest', runTransaction(ref(db(null), 'dreams/2/amen'), (c) => (c || 0) + 1));
await no('amen +10', set(ref(db('u2'), 'dreams/2/amen'), 50));
await no('delete other dream', set(ref(db('u2'), 'dreams/2'), null));
await ok('delete my dream', set(ref(db('u1'), 'dreams/2'), null));
await ok('vote guest', runTransaction(ref(db(null), 'pollVotes/p/d_x'), (c) => (c === null ? 1 : undefined)));
await no('vote as someone else', set(ref(db('u1'), 'pollVotes/p/u2'), 1));
await ok('count +1', runTransaction(ref(db(null), 'polls/p/counts/1'), (c) => (c || 0) + 1));
await no('edit poll', set(ref(db('u1'), 'polls/p/q'), 'x'));
await ok('join through u1 link', set(ref(db('u2'), 'refJoin/u1/u2'), 1700000000000));
await no('join twice', set(ref(db('u2'), 'refJoin/u1/u2'), 1700000000001));
await no('join as someone else', set(ref(db('u1'), 'refJoin/u3/u2'), 1));
await no('join own link', set(ref(db('u1'), 'refJoin/u1/u1'), 1));
await no('guest join', set(ref(db(null), 'refJoin/u1/d_x'), 1));
await ok('inviter reads list', get(ref(db('u1'), 'refJoin/u1')));
await no('other reads list', get(ref(db('u2'), 'refJoin/u1')));

// phone index
await ok('phone claim', set(ref(db('u1'), 'phoneIndex/0770'), { e: 'a@b.c', u: 'u1' }));
await no('phone steal', set(ref(db('u2'), 'phoneIndex/0770'), { e: 'x@b.c', u: 'u2' }));
await ok('guest phone lookup', get(ref(db(null), 'phoneIndex/0770')));
await no('guest lists phones', get(ref(db(null), 'phoneIndex')));

// voice calls
await ok('call offer', set(ref(db('v1'), 'voiceRoom/calls/v2/v1/offer'), { sdp: 'x', type: 'offer' }));
await ok('call answer', set(ref(db('v2'), 'voiceRoom/calls/v2/v1/answer'), { sdp: 'y', type: 'answer' }));
await ok('caller listens', get(ref(db('v1'), 'voiceRoom/calls/v2/v1')));
await no('outsider listens', get(ref(db('v3'), 'voiceRoom/calls/v2')));

// review cards
await ok('own cards', update(ref(db('u1'), 'userCards/u1'), { 'cards/c1': { f: 'q', b: 'a', u: 1 }, 'days/2026-01-01': 3 }));
await ok('read own cards', get(ref(db('u1'), 'userCards/u1')));
await no('read other cards', get(ref(db('u2'), 'userCards/u1')));
await no('write other cards', set(ref(db('u2'), 'userCards/u1/cards/c2'), { f: 'x' }));

// voice note
await ok('admin posts voice note', set(ref(db('adm'), 'voiceNote'), { id: 'v1', dur: 10, at: now }));
await no('student posts voice note', set(ref(db('u1'), 'voiceNote'), { id: 'v2', dur: 10, at: now }));
await ok('guest reads voice audio', get(ref(db(null), 'voiceNoteAudio')));
await ok('guest counts a play', set(ref(db(null), 'voiceNoteStats/v1/plays'), 1));
await no('play count jumps', set(ref(db(null), 'voiceNoteStats/v1/plays'), 50));
await ok('student marks listened', set(ref(db('u1'), 'voiceListeners/v1/u1'), { n: 'U', at: now, done: true }));
await no('student marks someone else', set(ref(db('u1'), 'voiceListeners/v1/u2'), { n: 'U', at: now }));
await no('student reads listeners', get(ref(db('u1'), 'voiceListeners/v1')));
await ok('admin reads listeners', get(ref(db('adm'), 'voiceListeners/v1')));

// YouTube rooms
const room = { meta: { host: 'h1', title: 'فيزياء', at: now }, members: { h1: { n: 'H', j: now } } };
await no('create room for someone else', set(ref(db('x1'), 'ytRooms/r1'), room));
await ok('host creates room', set(ref(db('h1'), 'ytRooms/r1'), room));
await ok('host adds video', set(ref(db('h1'), 'ytRooms/r1/queue/q1'), { v: 'dQw4w9WgXcQ', t: '', by: 'h1', at: now }));
await no('bad video id', set(ref(db('h1'), 'ytRooms/r1/queue/q2'), { v: 'bad', by: 'h1', at: now }));
await ok('host plays for all', set(ref(db('h1'), 'ytRooms/r1/meta/cur'), 'q1'));
await no('member plays for all', set(ref(db('m1'), 'ytRooms/r1/meta/cur'), 'q1'));
await no('stranger writes progress before joining', set(ref(db('m1'), 'ytRooms/r1/prog/m1'), { k: 'q1', t: 1, d: 100, p: 1, at: now }));
await ok('student joins', set(ref(db('m1'), 'ytRooms/r1/members/m1'), { n: 'M', j: now }));
await no('student adds another member', set(ref(db('m1'), 'ytRooms/r1/members/m9'), { n: 'Z', j: now }));
await ok('member progress', set(ref(db('m1'), 'ytRooms/r1/prog/m1'), { k: 'q1', t: 10, d: 100, p: 1, at: now }));
await no('member writes someone else progress', set(ref(db('m1'), 'ytRooms/r1/prog/h1'), { k: 'q1', t: 10, d: 100, p: 1, at: now }));
await ok('member done', set(ref(db('m1'), 'ytRooms/r1/done/m1/q1'), true));
await ok('member chats', set(ref(db('m1'), 'ytRooms/r1/chat/c1'), { u: 'm1', n: 'M', m: 'ما فهمت هنا', at: now, k: 'q1', s: 30 }));
await ok('member reacts', set(ref(db('m1'), 'ytRooms/r1/react/m1'), { r: 'ok', at: now }));
await no('outsider reacts', set(ref(db('o1'), 'ytRooms/r1/react/o1'), { r: 'ok', at: now }));
await no('outsider chats', set(ref(db('o1'), 'ytRooms/r1/chat/c2'), { u: 'o1', n: 'O', m: 'x', at: now }));
await no('member deletes host message', (async () => { await seed('ytRooms/r1/chat/c3', { u: 'h1', n: 'H', m: 'y', at: now }); return set(ref(db('m1'), 'ytRooms/r1/chat/c3'), null); })());
await ok('member invites a friend', set(ref(db('m1'), 'ytInvites/f1/r1'), { from: 'm1', fn: 'M', t: 'فيزياء', at: now }));
await no('outsider invites', set(ref(db('o1'), 'ytInvites/f1/r1'), { from: 'o1', fn: 'O', t: 'x', at: now }));
await ok('friend reads invites', get(ref(db('f1'), 'ytInvites/f1')));
await no('others read invites', get(ref(db('m1'), 'ytInvites/f1')));
await ok('friend declines', set(ref(db('f1'), 'ytInvites/f1/r1'), null));
await ok('host kicks', U('h1', { 'ytRooms/r1/kicked/m1': true, 'ytRooms/r1/members/m1': null, 'ytRooms/r1/prog/m1': null }));
await no('kicked student rejoins', set(ref(db('m1'), 'ytRooms/r1/members/m1'), { n: 'M', j: now }));
await no('member closes room', set(ref(db('m2'), 'ytRooms/r1'), null));
await ok('host closes room', set(ref(db('h1'), 'ytRooms/r1'), null));

// students' map
const TS = { '.sv': 'timestamp' };
await ok('student joins the map', update(ref(db('s1'), 'studentMap/s1'), { g: 'بغداد', t: TS, m: 'happy', d: '2026-09-29' }));
await no('unknown governorate', update(ref(db('s2'), 'studentMap/s2'), { g: 'لندن', t: TS }));
await no('unknown mood', update(ref(db('s1'), 'studentMap/s1'), { m: 'x' }));
await no('extra field', update(ref(db('s1'), 'studentMap/s1'), { name: 'Ali' }));
await no('writes another student', update(ref(db('s1'), 'studentMap/s9'), { g: 'بغداد', t: TS }));
await ok('student reads the map', get(ref(db('s2'), 'studentMap')));
await no('guest reads the map', get(ref(db(null), 'studentMap')));
await ok('reaction from my governorate', U('s1', { 'mapReacts/a1': { u: 's1', g: 'بغداد', e: 'heart', t: TS }, 'studentMap/s1/r': TS }));
await no('reaction again at once', U('s1', { 'mapReacts/a2': { u: 's1', g: 'بغداد', e: 'fire', t: TS }, 'studentMap/s1/r': TS }));
await no('reaction without moving r', set(ref(db('s1'), 'mapReacts/a3'), { u: 's1', g: 'بغداد', e: 'heart', t: TS }));
await ok('student 3 joins', update(ref(db('s3'), 'studentMap/s3'), { g: 'البصرة', t: TS }));
await no('reaction from another governorate', U('s3', { 'mapReacts/a4': { u: 's3', g: 'بغداد', e: 'heart', t: TS }, 'studentMap/s3/r': TS }));
await no('reaction as someone else', U('s3', { 'mapReacts/a5': { u: 's1', g: 'البصرة', e: 'heart', t: TS }, 'studentMap/s3/r': TS }));
await no('unknown reaction', U('s3', { 'mapReacts/a6': { u: 's3', g: 'البصرة', e: 'bomb', t: TS }, 'studentMap/s3/r': TS }));
await no('reaction with a message', U('s3', { 'mapReacts/a7': { u: 's3', g: 'البصرة', e: 'heart', t: TS, x: 'hi' }, 'studentMap/s3/r': TS }));
await ok('reaction from Basra', U('s3', { 'mapReacts/a8': { u: 's3', g: 'البصرة', e: 'laugh', t: TS }, 'studentMap/s3/r': TS }));
await no('clears a fresh reaction', set(ref(db('s1'), 'mapReacts/a8'), null));
await seed('mapReacts/old', { u: 's3', g: 'البصرة', e: 'laugh', t: now - 120000 });
await ok('clears an old reaction', set(ref(db('s1'), 'mapReacts/old'), null));
await ok('student reads reactions', get(ref(db('s2'), 'mapReacts')));

// store
await ok('admin adds a category', set(ref(db('adm'), 'shop/cats/c1'), { n: 'قرطاسية', o: 1 }));
await no('student adds a category', set(ref(db('u1'), 'shop/cats/c2'), { n: 'x', o: 2 }));
await no('category without a name', set(ref(db('adm'), 'shop/cats/c3'), { n: '', o: 3 }));
await ok('admin publishes a product', update(ref(db('adm')), { 'shop/items/p1': { n: 'دفتر', d: 'دفتر 100 ورقة', cat: 'c1', img: 'data:image/jpeg;base64,AAAA', price: '2,000 دينار', tt: 'https://www.tiktok.com/@shop/video/123', buy: 'https://wa.me/964000', at: now }, 'shop/imgs/p1': 'data:image/jpeg;base64,BBBB' }));
await ok('short TikTok link', set(ref(db('adm'), 'shop/items/p2'), { n: 'قلم', cat: 'c1', img: 'https://example.com/a.jpg', tt: 'https://vm.tiktok.com/ZMabc/' }));
await no('video link from another site', set(ref(db('adm'), 'shop/items/p3'), { n: 'قلم', cat: 'c1', img: 'x', tt: 'https://evil.com/tiktok.com/' }));
await no('buy link not https', set(ref(db('adm'), 'shop/items/p4'), { n: 'قلم', cat: 'c1', img: 'x', buy: 'javascript:alert(1)' }));
await no('product without a picture', set(ref(db('adm'), 'shop/items/p5'), { n: 'قلم', cat: 'c1' }));
await no('student publishes a product', set(ref(db('u1'), 'shop/items/p6'), { n: 'قلم', cat: 'c1', img: 'x' }));
await no('student edits a product', set(ref(db('u1'), 'shop/items/p1/price'), '1 دينار'));
await ok('guest reads the store', get(ref(db(null), 'shop')));

// store orders
await ok('admin sets the points rate', set(ref(db('adm'), 'shop/rate'), 10));
await ok('price in dinar', set(ref(db('adm'), 'shop/items/p1/pd'), 10000));
await seed('users/b1', { points: 150000, balance: 0, pAt: 0 });
const ord = (u, pay, extra) => Object.assign({ u, name: 'علي', phone: '07701234567', gov: 'بغداد', addr: 'الكرادة، قرب ساحة كهرمانة', items: { p1: { n: 'دفتر', q: 2, pd: 10000, pp: 100000 } }, totalD: 20000, totalP: 100000, pay, st: 'new', at: TS }, extra || {});
await ok('cash order', U('b1', { 'shopOrders/o1': ord('b1', 'cash'), 'shopMine/b1/o1': true }));
await no('points order without paying', set(ref(db('b1'), 'shopOrders/o2'), ord('b1', 'points')));
await ok('points order paid', U('b1', { 'shopOrders/o3': ord('b1', 'points'), 'shopMine/b1/o3': true, 'users/b1/points': 50000, 'users/b1/ps': 's:o3' }));
await no('same payment for a second order', U('b1', { 'shopOrders/o4': ord('b1', 'points'), 'users/b1/points': 0, 'users/b1/ps': 's:o3' }));
await no('order for someone else', set(ref(db('b1'), 'shopOrders/o5'), ord('b2', 'cash')));
await no('bad phone', set(ref(db('b1'), 'shopOrders/o6'), ord('b1', 'cash', { phone: 'call me' })));
await no('unknown governorate in order', set(ref(db('b1'), 'shopOrders/o7'), ord('b1', 'cash', { gov: 'دبي' })));
await no('order marked done by the student', set(ref(db('b1'), 'shopOrders/o8'), ord('b1', 'cash', { st: 'done' })));
await no('student changes the status', set(ref(db('b1'), 'shopOrders/o1/st'), 'done'));
await ok('student reads own order', get(ref(db('b1'), 'shopOrders/o1')));
await no('another student reads it', get(ref(db('u1'), 'shopOrders/o1')));
await no('student lists all orders', get(ref(db('b1'), 'shopOrders')));
await ok('student reads own list', get(ref(db('b1'), 'shopMine/b1')));
await ok('admin lists orders', get(ref(db('adm'), 'shopOrders')));
await ok('admin moves the order on', set(ref(db('adm'), 'shopOrders/o3/st'), 'sent'));
await no('unknown status', set(ref(db('adm'), 'shopOrders/o3/st'), 'lost'));

// study places
const spot = (by, extra) => Object.assign({ n: 'مكتبة الكرادة', t: 'lib', g: 'بغداد', lat: 33.30, lng: 44.43, by, at: now, addr: 'قرب ساحة كهرمانة', sex: 'all', h: { o: '08:00', c: '22:00', fri: true }, f: { wifi: true, power: true }, img: 'data:image/jpeg;base64,AAAA' }, extra || {});
await ok('student suggests a place', U('s1', { 'spotsPending/sp1': spot('s1'), 'spotsPendingImgs/sp1': 'data:image/jpeg;base64,BBBB' }));
await no('suggest as someone else', set(ref(db('s1'), 'spotsPending/sp2'), spot('s9')));
await no('place outside Iraq', set(ref(db('s1'), 'spotsPending/sp3'), spot('s1', { lat: 51.5, lng: -0.1 })));
await no('unknown place type', set(ref(db('s1'), 'spotsPending/sp4'), spot('s1', { t: 'bar' })));
await no('unknown feature', set(ref(db('s1'), 'spotsPending/sp5'), spot('s1', { f: { pool: true } })));
await no('bad hours', set(ref(db('s1'), 'spotsPending/sp6'), spot('s1', { h: { o: '8am', c: '22:00' } })));
await no('picture for another suggestion', set(ref(db('s2'), 'spotsPendingImgs/sp1x'), 'data:x'));
await ok('student reads own suggestion', get(ref(db('s1'), 'spotsPending/sp1')));
await no('another student reads it', get(ref(db('s2'), 'spotsPending/sp1')));
await no('student lists suggestions', get(ref(db('s1'), 'spotsPending')));
await no('student edits own suggestion', set(ref(db('s1'), 'spotsPending/sp1/n'), 'x'));
await no('student publishes a place', set(ref(db('s1'), 'spots/sp1'), spot('s1')));
await ok('admin approves', update(ref(db('adm')), { 'spots/sp1': spot('s1'), 'spotImgs/sp1': 'data:image/jpeg;base64,BBBB', 'spotsPending/sp1': null, 'spotsPendingImgs/sp1': null }));
await ok('guest reads places', get(ref(db(null), 'spots')));
await ok('student rates', set(ref(db('s2'), 'spotRates/sp1/s2'), { s: 5, c: 'هادئ وبيه مولدة', n: 'زهراء', at: TS }));
await no('rating out of range', set(ref(db('s2'), 'spotRates/sp1/s2'), { s: 9, n: 'زهراء', at: TS }));
await no('rating for someone else', set(ref(db('s2'), 'spotRates/sp1/s3'), { s: 1, n: 'x', at: TS }));
await no('rating a missing place', set(ref(db('s2'), 'spotRates/nope/s2'), { s: 3, n: 'x', at: TS }));
await ok('student is here', set(ref(db('s2'), 'spotHere/sp1/s2'), { n: 'زهراء', t: TS }));
await ok('student leaves', set(ref(db('s2'), 'spotHere/sp1/s2'), null));
await no('marks someone else here', set(ref(db('s2'), 'spotHere/sp1/s3'), { n: 'x', t: TS }));

// فضفضة
const vpost = (u, id, tx, m) => U(u, { ['vent/' + id]: { tx, m: m || 'sad', at: TS }, ['ventOwners/' + id]: u, ['ventLast/' + u]: TS });
await ok('student vents', vpost('v1', 'p1', 'تعبت من الدراسة وما أحس نفسي متقدم'));
await no('vents again at once', vpost('v1', 'p2', 'مرة ثانية'));
await no('post as someone else', U('v2', { 'vent/p3': { tx: 'كلام', m: 'sad', at: TS }, 'ventOwners/p3': 'v1', 'ventLast/v2': TS }));
await no('post with a name field', U('v2', { 'vent/p4': { tx: 'كلام عادي', m: 'sad', at: TS, name: 'علي' }, 'ventOwners/p4': 'v2', 'ventLast/v2': TS }));
await no('post with a bad word', vpost('v3', 'p5', 'انت شرموط'));
await no('post with a bad English word', vpost('v4', 'p6', 'what the FUCK'));
await ok('another student vents', vpost('v5', 'p7', 'خايف من الوزاري'));
await ok('students read posts', get(ref(db('v2'), 'vent')));
await no('guest reads posts', get(ref(db(null), 'vent')));
await no('students read who wrote', get(ref(db('v2'), 'ventOwners/p1')));
await ok('admin reads who wrote', get(ref(db('adm'), 'ventOwners/p1')));
await no('delete someone else\'s post', set(ref(db('v2'), 'vent/p1'), null));
await ok('delete own post', U('v5', { 'vent/p7': null, 'ventOwners/p7': null }));
const vrep = (u, rid, body) => U(u, { ['ventReplies/p1/' + rid]: Object.assign({ at: TS }, body), ['ventReplyOwners/p1/' + rid]: u, ['ventLastR/' + u]: TS, ['ventCount/p1/rc']: 1 });
await ok('ready-made reply', vrep('v2', 'r1', { k: 's1' }));
await no('reply again at once', U('v2', { 'ventReplies/p1/r2': { k: 'm1', at: TS }, 'ventReplyOwners/p1/r2': 'v2', 'ventLastR/v2': TS }));
await ok('written reply', U('v6', { 'ventReplies/p1/r3': { tx: 'الله يوفقك', at: TS }, 'ventReplyOwners/p1/r3': 'v6', 'ventLastR/v6': TS, 'ventCount/p1/rc': 2 }));
await no('reply with a bad word', U('v7', { 'ventReplies/p1/r4': { tx: 'يا منيوك', at: TS }, 'ventReplyOwners/p1/r4': 'v7', 'ventLastR/v7': TS }));
await ok('hug', U('v2', { 'ventReactOwners/p1/v2': 'hug', 'ventCount/p1/hug': 1 }));
await no('second reaction', U('v2', { 'ventReactOwners/p1/v2': 'pray', 'ventCount/p1/pray': 1 }));
await no('counter without reacting', set(ref(db('v8'), 'ventCount/p1/hug'), 2));
await ok('report', U('v8', { 'ventReports/p1/v8': true, 'ventCount/p1/rep': 1 }));
await no('report twice', U('v8', { 'ventReports/p1/v8': true, 'ventCount/p1/rep': 2 }));
await ok('filter alert', set(ref(db('v3'), 'ventAlerts/a1'), { u: 'v3', tx: 'انت شرموط', kind: 'sex', at: TS }));
await no('alert as someone else', set(ref(db('v3'), 'ventAlerts/a2'), { u: 'v1', tx: 'x', kind: 'bad', at: TS }));
await no('students read alerts', get(ref(db('v3'), 'ventAlerts')));
await ok('admin bans', set(ref(db('adm'), 'ventBan/v3'), true));
await no('banned student vents', vpost('v3', 'p8', 'كلام عادي جداً'));
await no('student wipes a post', U('v2', { 'vent/p1': null, 'ventReplies/p1': null, 'ventCount/p1': null }));
await ok('admin deletes a post with everything', U('adm', { 'vent/p1': null, 'ventOwners/p1': null, 'ventReplies/p1': null, 'ventReplyOwners/p1': null, 'ventCount/p1': null, 'ventReports/p1': null, 'ventReactOwners/p1': null }));

// صندوق الأفكار
const idea = (u, id, extra) => U(u, { ['ideas/' + id]: Object.assign({ t: 'وضع ليلي للمتجر', d: 'يكون أريح للعين', c: 'look', by: u, n: 'علي', st: 'new', v: 0, at: TS }, extra || {}), ['ideaLast/' + u]: TS });
await ok('student suggests', idea('i1', 'd1'));
await no('suggests again at once', idea('i1', 'd2'));
await no('suggestion as someone else', U('i2', { 'ideas/d3': { t: 'فكرة حلوة جداً', c: 'study', by: 'i1', n: 'x', st: 'new', v: 0, at: TS }, 'ideaLast/i2': TS }));
await no('starts with votes', idea('i3', 'd4', { v: 50 }));
await no('marks itself done', idea('i4', 'd5', { st: 'done' }));
await no('bad word in an idea', idea('i5', 'd6', { t: 'المدير شرموط' }));
await ok('vote', U('i2', { 'ideaVotes/d1/i2': true, 'ideaMine/i2/d1': true, 'ideas/d1/v': 1 }));
await no('vote twice', U('i2', { 'ideaVotes/d1/i2': true, 'ideas/d1/v': 2 }));
await no('count without voting', set(ref(db('i6'), 'ideas/d1/v'), 2));
await no('vote for someone else', U('i6', { 'ideaVotes/d1/i7': true, 'ideas/d1/v': 2 }));
await ok('take the vote back', U('i2', { 'ideaVotes/d1/i2': null, 'ideaMine/i2/d1': null, 'ideas/d1/v': 0 }));
await no('student sets the status', set(ref(db('i1'), 'ideas/d1/st'), 'done'));
await ok('admin answers', update(ref(db('adm'), 'ideas/d1'), { st: 'doing', r: 'فكرة حلوة، دا نشتغل عليها' }));
await no('author deletes after it moved on', set(ref(db('i1'), 'ideas/d1'), null));
await ok('guest cannot read ideas', assertFails(get(ref(db(null), 'ideas'))).then(() => true));

// voice calls
await seed('blockedUsers/k9/k1', true);
await ok('caller opens a call', set(ref(db('k1'), 'calls/k1_k2'), { id: 'c1', from: 'k1', to: 'k2', at: TS, st: 'ring' }));
await ok('caller writes the offer', update(ref(db('k1'), 'calls/k1_k2'), { offer: { sdp: 'v=0', type: 'offer', v: 1 } }));
await ok('caller writes a candidate', set(ref(db('k1'), 'calls/k1_k2/oc/x1'), { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 }));
await ok('caller rings', set(ref(db('k1'), 'callRing/k2/k1'), { id: 'c1', n: 'علي', at: TS }));
await no('ring as someone else', set(ref(db('k3'), 'callRing/k2/k1'), { id: 'c1', n: 'x', at: TS }));
await no('ring someone who blocked you', set(ref(db('k1'), 'callRing/k9/k1'), { id: 'c2', n: 'x', at: TS }));
await no('ring yourself', set(ref(db('k1'), 'callRing/k1/k1'), { id: 'c2', n: 'x', at: TS }));
await ok('callee reads the ring', get(ref(db('k2'), 'callRing/k2')));
await no('others read the ring', get(ref(db('k3'), 'callRing/k2')));
await ok('callee reads the call', get(ref(db('k2'), 'calls/k1_k2')));
await no('others read the call', get(ref(db('k3'), 'calls/k1_k2')));
await no('others write into the call', update(ref(db('k3'), 'calls/k1_k2'), { st: 'end' }));
await ok('callee answers', update(ref(db('k2'), 'calls/k1_k2'), { answer: { sdp: 'v=0', type: 'answer', v: 1 }, st: 'on' }));
await ok('callee clears the ring', set(ref(db('k2'), 'callRing/k2/k1'), null));
await ok('mute flag', set(ref(db('k2'), 'calls/k1_k2/mute/k2'), true));
await no('call for another pair', set(ref(db('k1'), 'calls/k1_k2'), { id: 'c3', from: 'k1', to: 'k5', at: TS, st: 'ring' }));
await no('huge sdp', update(ref(db('k1'), 'calls/k1_k2'), { offer: { sdp: 'x'.repeat(20001), type: 'offer', v: 2 } }));
await ok('hang up', update(ref(db('k2'), 'calls/k1_k2'), { st: 'end', by: 'k2' }));

// bans by account and phone, one account per phone
const DEV = 'abcdefghij0123456789', DEV2 = 'zzzzzzzzzz0123456789';
await ok('claim a phone', set(ref(db('o1'), 'deviceOwners/' + DEV), 'o1'));
await ok('anyone reads a phone owner', get(ref(db(null), 'deviceOwners/' + DEV)));
await no('take a claimed phone', set(ref(db('o2'), 'deviceOwners/' + DEV), 'o2'));
await seed('users/o1', { fullName: 'o1' });
await no('free a phone yourself', set(ref(db('o1'), 'deviceOwners/' + DEV), null));
await no('claim for someone else', set(ref(db('o2'), 'deviceOwners/' + DEV2), 'o1'));
await no('bad phone id', set(ref(db('o2'), 'deviceOwners/BAD'), 'o2'));
await ok('panel frees a phone', set(ref(db('adm'), 'deviceOwners/' + DEV), null));
await no('student bans someone', set(ref(db('o1'), 'bannedUsers/o2'), { reason: 'x', at: TS }));
await ok('panel bans', set(ref(db('adm'), 'bannedUsers/o2'), { reason: 'سب', at: TS }));
await ok('banned student reads own ban', get(ref(db('o2'), 'bannedUsers/o2')));
await no('others read the ban', get(ref(db('o1'), 'bannedUsers/o2')));
await ok('banned student reports own phone', set(ref(db('o2'), 'bannedDevices/' + DEV2), { uid: 'o2', at: TS }));
await no('unbanned student bans a phone', set(ref(db('o1'), 'bannedDevices/' + DEV), { uid: 'o1', at: TS }));
await no('banned student clears own phone', set(ref(db('o2'), 'bannedDevices/' + DEV2), null));
await ok('guest reads a phone ban', get(ref(db(null), 'bannedDevices/' + DEV2)));
await ok('panel lifts a phone ban', set(ref(db('adm'), 'bannedDevices/' + DEV2), null));
await ok('student records own phone', set(ref(db('o1'), 'users/o1/dev/' + DEV), TS));

// open writes stay small
await ok('device ping', update(ref(db(null), 'devices/d123'), { last: Date.now(), gov: 'baghdad', installed: false, push: 'default', app: 'web', member: 0 }));
await no('device ping with junk', update(ref(db(null), 'devices/d124'), { last: Date.now(), junk: 'x'.repeat(5000) }));
await ok('error report', set(ref(db(null), 'errors/e1'), { msg: 'TypeError', src: 'app.js', line: 1, col: 2, stack: 'at x', first: 1, n: 1, last: 2, view: 'homeView', dev: 'Android', ver: 'abc' }));
await no('error report with junk', set(ref(db(null), 'errors/e2'), { msg: 'x', n: 1, blob: 'x'.repeat(5000) }));
await no('huge stack', set(ref(db(null), 'errors/e3'), { msg: 'x', n: 1, stack: 'x'.repeat(5000) }));

// chats: only your own messages
await ok('send a message', set(ref(db('c1'), 'privateChats/c1_c2/messages/1'), { id: 1, from: 'c1', to: 'c2', text: 'هلو', createdAt: 1 }));
await no('message in the other one\'s name', set(ref(db('c1'), 'privateChats/c1_c2/messages/2'), { id: 2, from: 'c2', to: 'c1', text: 'x', createdAt: 2 }));
await no('edit the other one\'s message', set(ref(db('c2'), 'privateChats/c1_c2/messages/1/text'), 'x'));
await no('delete the other one\'s message', set(ref(db('c2'), 'privateChats/c1_c2/messages/1'), null));
await ok('edit own message', set(ref(db('c1'), 'privateChats/c1_c2/messages/1/text'), 'هلو شلونك'));
await ok('hide for me', set(ref(db('c2'), 'privateChats/c1_c2/deletedFor/c2/1'), true));
await no('hide for the other one', set(ref(db('c2'), 'privateChats/c1_c2/deletedFor/c1/1'), true));
await ok('own read receipt', set(ref(db('c2'), 'privateChats/c1_c2/readReceipts/c2'), 5));
await no('the other one\'s read receipt', set(ref(db('c2'), 'privateChats/c1_c2/readReceipts/c1'), 5));
await no('outsider writes', set(ref(db('c3'), 'privateChats/c1_c2/messages/3'), { id: 3, from: 'c3', text: 'x' }));
await no('outsider reads', get(ref(db('c3'), 'privateChats/c1_c2')));
await ok('delete own message', set(ref(db('c1'), 'privateChats/c1_c2/messages/1'), null));

// deleting my account
await seed('users/z1', { fullName: 'زيد', points: 50, balance: 3 });
await seed('friends/z1/z2', { name: 'x' }); await seed('friends/z2/z1', { name: 'زيد' });
await seed('userChats/z1/z2', { lastMessage: 'x' }); await seed('userChats/z2/z1', { lastMessage: 'x' });
await seed('shopMine/z1/o1', true); await seed('deviceOwners/zzzzzzzzzzzzzzzz1111', 'z1');
await ok('delete my record', set(ref(db('z1'), 'users/z1'), null));
await no('delete someone else record', set(ref(db('z2'), 'users/z3'), null));
await no('replace my record wholesale', set(ref(db('z2'), 'users/z2'), { points: 999999 }));
await ok('delete my friends list', set(ref(db('z1'), 'friends/z1'), null));
await ok('remove me from a friend list', set(ref(db('z1'), 'friends/z2/z1'), null));
await ok('delete my inbox', set(ref(db('z1'), 'userChats/z1'), null));
await ok('remove me from their inbox', set(ref(db('z1'), 'userChats/z2/z1'), null));
await ok('delete my order list', set(ref(db('z1'), 'shopMine/z1'), null));
await ok('free my phone', set(ref(db('z1'), 'deviceOwners/zzzzzzzzzzzzzzzz1111'), null));
await seed('deviceOwners/zzzzzzzzzzzzzzzz2222', 'z2');
await no('free someone else phone', set(ref(db('z1'), 'deviceOwners/zzzzzzzzzzzzzzzz2222'), null));

console.log('passed', pass, 'failed', fail);
await env.cleanup();
process.exit(fail ? 1 : 0);
