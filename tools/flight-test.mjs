// Tests for js/flightmath.js (the flight maths). Run: node tools/flight-test.mjs
import { createRequire } from 'module';
const FM = createRequire(import.meta.url)('../js/flightmath.js');
let pass = 0, fail = 0;
const ok = (name, c, info) => { if (c) pass++; else { fail++; console.log('FAIL:', name, info === undefined ? '' : JSON.stringify(info)); } };
const near = (a, b, e) => Math.abs(a - b) <= e;
const BAS = [30.5085, 47.7835], BGD = [33.3152, 44.3661], IST = [41.0082, 28.9784];

// distance
ok('Basra-Baghdad about 450-470 km', near(FM.haversine(BAS, BGD), 459, 15), FM.haversine(BAS, BGD));
ok('Baghdad-Istanbul about 1600 km', FM.haversine(BGD, IST) > 1550 && FM.haversine(BGD, IST) < 1650, FM.haversine(BGD, IST));
ok('zero distance', FM.haversine(BGD, BGD) === 0);
// great circle ends and middle
const p0 = FM.gcPoint(BAS, BGD, 0), p1 = FM.gcPoint(BAS, BGD, 1), pm = FM.gcPoint(BAS, BGD, 0.5);
ok('gc start', near(p0[0], BAS[0], 1e-6) && near(p0[1], BAS[1], 1e-6));
ok('gc end', near(p1[0], BGD[0], 1e-6) && near(p1[1], BGD[1], 1e-6));
ok('gc middle is half the distance', near(FM.haversine(BAS, pm), FM.haversine(BAS, BGD) / 2, 0.5));
ok('gc same point', FM.gcPoint(BGD, BGD, 0.4)[0] === BGD[0]);
ok('gc writes into out', (() => { const o = [0, 0]; return FM.gcPoint(BAS, BGD, 0.3, o) === o; })());
// heading
const h = FM.gcHeading(BAS, BGD, 0.5);
ok('Basra to Baghdad heads north-west (290-350)', h > 290 && h < 350, h);
ok('Baghdad to Basra heads south-east (110-170)', (() => { const x = FM.gcHeading(BGD, BAS, 0.5); return x > 110 && x < 170; })());
ok('due east', near(FM.gcHeading([0, 0], [0, 10], 0.5), 90, 0.5));
// warp
ok('warp ends', FM.warp(0) === 0 && FM.warp(1) === 1 && FM.warp(-1) === 0 && FM.warp(2) === 1);
let mono = true, prev = -1; for (let i = 0; i <= 1000; i++) { const w = FM.warp(i / 1000); if (w < prev) mono = false; prev = w; }
ok('warp is monotonic', mono);
ok('warp is slow at the ends and fast in the middle', FM.warp(0.05) < 0.05 && FM.warp(0.5) === 0.5 && (FM.warp(0.55) - FM.warp(0.45)) > 0.1);
// state
const f = { s: 1e12, du: 7200000, o: BAS, d: BGD };
let st = FM.stateAt(f, f.s - 5000);
ok('before the start: prepare, plane at origin', st.status === 'prepare' && near(st.pos[0], BAS[0], 1e-6) && st.x === 0);
st = FM.stateAt(f, f.s + 1000);
ok('first seconds: boarding', st.status === 'boarding', st.status);
st = FM.stateAt(f, f.s + 3600000);
ok('half way: flying, 50%, half the time left', st.status === 'flying' && near(st.x, 0.5, 1e-9) && near(st.left, 3600000, 1) && near(st.distLeft, st.dist / 2, st.dist * 0.01), st);
st = FM.stateAt(f, f.s + 7200000 * 0.98);
ok('last minutes: landing', st.status === 'landing', st.status);
st = FM.stateAt(f, f.s + 7200000 + 99999);
ok('after the end: done, plane at destination, nothing left', st.status === 'done' && st.left === 0 && st.distLeft < 1e-6 && near(st.pos[0], BGD[0], 1e-6), st);
ok('elapsed + left = duration', (() => { const a = FM.stateAt(f, f.s + 1234567); return near(a.el + a.left, 7200000, 1); })());
ok('bank stays in range', (() => { let m = 0; for (let i = 0; i < 400; i++) m = Math.max(m, Math.abs(FM.stateAt(f, f.s + i * 18000).bank)); return m <= 28; })());
ok('plane never jumps (steps of 1 s stay small)', (() => { let last = FM.stateAt(f, f.s + 5000).pos, big = 0; for (let t = 6000; t < 7200000; t += 1000) { const p = FM.stateAt(f, f.s + t).pos; big = Math.max(big, FM.haversine(last, p)); last = p; } return big < 0.45; })());
ok('a 2:30 flight over a 1:45 road trip still ends at 2:30', (() => { const g = { s: 0, du: 9000000, o: BAS, d: BGD }; return FM.stateAt(g, 9000000).status === 'done' && FM.stateAt(g, 8999000).status !== 'done'; })());
// sim
const s1 = FM.sim(FM.stateAt(f, f.s + 3600000)), s0 = FM.sim(FM.stateAt(f, f.s));
ok('cruise altitude/speed, ground at the start', s1.alt > 9000 && s1.spd > 700 && s0.alt === 0 && s0.spd < 200, [s0, s1]);
// cells
ok('cell key', FM.cellKey(33.3, 44.4) === '30_56', FM.cellKey(33.3, 44.4));
ok('path cells include both ends', (() => { const c = FM.cellsForPath(BAS, BGD); return c.includes(FM.cellKey(...BAS)) && c.includes(FM.cellKey(...BGD)); })());
ok('path cells are capped', FM.cellsForPath([0, -170], [0, 170], 14).length <= 14);
ok('bounds of Iraq need only a few cells', (() => { const c = FM.cellsForBounds({ s: 29, n: 37.5, w: 38.8, e: 48.6 }); return c.length >= 4 && c.length <= 12; })());
ok('the whole world is capped', FM.cellsForBounds({ s: -80, n: 80, w: -180, e: 180 }, 16).length <= 16);
ok('a capped view keeps the cells around its middle', (() => { const c = FM.cellsForBounds({ s: 20, n: 50, w: 30, e: 60 }, 6); return c.length === 6 && c.includes(FM.cellKey(35, 45)); })());
// mercator round trip
const v = { lat: 33, lng: 44, z: 7, w: 390, h: 800 }, px = [0, 0], back = [0, 0];
FM.project(v, 31, 47, px); FM.unproject(v, px[0], px[1], back);
ok('project/unproject round trip', near(back[0], 31, 1e-6) && near(back[1], 47, 1e-6), back);
ok('centre projects to the middle', (() => { FM.project(v, 33, 44, px); return near(px[0], 195, 1e-6) && near(px[1], 400, 1e-6); })());
ok('east is right, north is up', (() => { FM.project(v, 33, 45, px); const a = px[0]; FM.project(v, 34, 44, px); return a > 195 && px[1] < 400; })());
const fv = FM.fitView([BAS, BGD], 390, 600, { t: 80, b: 220, l: 30, r: 30 });
ok('fitView keeps both ends on screen', (() => { const vv = { ...fv, w: 390, h: 600 }; const q = [0, 0]; FM.project(vv, BAS[0], BAS[1], q); const a = q.slice(); FM.project(vv, BGD[0], BGD[1], q); return [a, q].every((p) => p[0] >= 0 && p[0] <= 390 && p[1] >= 0 && p[1] <= 600); })(), fv);
// names and privacy
ok('anon number is 3 digits and stable', FM.anonNo('abc123') >= 100 && FM.anonNo('abc123') <= 999 && FM.anonNo('abc123') === FM.anonNo('abc123'));
ok('flight number format', /^IRQ-\d{4}$/.test(FM.flightNo('abc123')));
ok('coords are coarsened', FM.coarse(33.31527, false) === 33.32 && FM.coarse(33.31527, true) === 33.3);
ok('formatting', FM.fmtHMS(5538000) === '01:32:18' && FM.fmtHMS(0) === '00:00:00' && FM.fmtDur(8040000) === '2 س 14 د');
ok('suggested duration is sane', FM.suggestMinutes(460) >= 40 && FM.suggestMinutes(460) <= 70 && FM.suggestMinutes(2000) > FM.suggestMinutes(460));
ok('nearest place', FM.nearestPlace(30.52, 47.8).place.name === 'البصرة' && FM.nearestPlace(0, 0) === null);
// badges
const hist = [{ st: 'done', dist: 1500, du: 8000000, s: new Date(2026, 0, 1, 23).getTime(), on: 'البصرة', dn: 'بغداد' }];
const b = FM.badges(hist);
ok('badges', b.find((x) => x.id === 'first').ok && b.find((x) => x.id === 'far').ok && b.find((x) => x.id === 'night').ok && b.find((x) => x.id === 'marathon').ok && !b.find((x) => x.id === 'ten').ok);
console.log('flight tests passed', pass, 'failed', fail);
process.exit(fail ? 1 : 0);
