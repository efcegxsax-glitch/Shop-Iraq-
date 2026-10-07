// Checks the shape recogniser and the mind-map layout in js/notegeom.js.
//   node tools/note-test.mjs
import { createRequire } from 'module';
const G = createRequire(import.meta.url)('../js/notegeom.js');
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const jit = (p, a) => [p[0] + rnd() * a, p[1] + rnd() * a];
const seg = (a, b, n) => Array.from({ length: n }, (_, i) => [a[0] + (b[0] - a[0]) * i / (n - 1), a[1] + (b[1] - a[1]) * i / (n - 1)]);
// a wobbly hand-drawn line
const line = seg([100, 100], [400, 108], 60).map((p, i) => [p[0], p[1] + Math.sin(i / 4) * 5 + rnd() * 2]);
let r = G.recognize(line);
t('wobbly line -> line', r && r.k === 'line');
t('a nearly horizontal line is made exactly horizontal', r && r.y1 === r.y2 && Math.abs(r.x2 - r.x1) > 290);
r = G.recognize(seg([100, 100], [330, 260], 50).map((p) => jit(p, 4)));
t('a slanted line stays slanted', r && r.k === 'line' && r.y1 !== r.y2 && r.x1 !== r.x2);
r = G.recognize(seg([200, 100], [205, 380], 50).map((p) => jit(p, 3)));
t('a nearly vertical line becomes vertical', r && r.k === 'line' && r.x1 === r.x2);
// a circle drawn with a gap and wobble
const circ = Array.from({ length: 90 }, (_, i) => { const a = i / 90 * 6.1; return jit([300 + 90 * Math.cos(a), 300 + 88 * Math.sin(a)], 6); });
r = G.recognize(circ);
t('circle -> circle (equal radii)', r && r.k === 'ellipse' && r.rx === r.ry && Math.abs(r.rx - 89) < 8 && Math.abs(r.cx - 300) < 8);
const ell = Array.from({ length: 90 }, (_, i) => { const a = i / 90 * 6.2; return jit([300 + 140 * Math.cos(a), 300 + 60 * Math.sin(a)], 5); });
r = G.recognize(ell);
t('ellipse -> ellipse', r && r.k === 'ellipse' && r.rx > r.ry * 1.8);
// a rectangle drawn in four strokes with rounded-off corners
const rect = [...seg([100, 100], [320, 102], 30), ...seg([320, 102], [318, 240], 25), ...seg([318, 240], [102, 238], 30), ...seg([102, 238], [101, 106], 25)].map((p) => jit(p, 3));
r = G.recognize(rect);
t('rectangle -> rect', r && r.k === 'rect' && Math.abs(r.x2 - r.x1 - 218) < 12 && Math.abs(r.y2 - r.y1 - 138) < 12);
// triangle
const tri = [...seg([200, 100], [320, 300], 30), ...seg([320, 300], [80, 300], 40), ...seg([80, 300], [203, 104], 30)].map((p) => jit(p, 3));
r = G.recognize(tri);
t('triangle -> 3-point polygon', r && r.k === 'poly' && r.closed && r.pts.length === 3);
// a tilted square
const a = 0.5, rot = (p) => [300 + (p[0] - 300) * Math.cos(a) - (p[1] - 300) * Math.sin(a), 300 + (p[0] - 300) * Math.sin(a) + (p[1] - 300) * Math.cos(a)];
const sq = [[220, 220], [380, 220], [380, 380], [220, 380], [220, 222]];
const tilted = [];
for (let i = 0; i < 4; i++) tilted.push(...seg(sq[i], sq[i + 1], 25));
r = G.recognize(tilted.map(rot).map((p) => jit(p, 3)));
t('a tilted square keeps its tilt with exact corners', r && r.k === 'poly' && r.pts.length === 4 && Math.abs(G.angleAt(r.pts[0], r.pts[1], r.pts[2]) - 90) < 0.01);
// a check mark / L (open, two straight pieces)
const L2 = [...seg([100, 100], [100, 300], 30), ...seg([100, 300], [300, 300], 30)].map((p) => jit(p, 3));
r = G.recognize(L2);
t('an L shape -> open polyline with 3 points', r && r.k === 'poly' && !r.closed && r.pts.length === 3);
// a scribble is left alone
const scr = Array.from({ length: 80 }, (_, i) => [100 + i * 3 + rnd() * 60, 100 + Math.sin(i * 1.7) * 60 + rnd() * 40]);
t('a scribble is not turned into anything', G.recognize(scr) === null);
t('too short / too few points', G.recognize([[0, 0], [1, 1]]) === null && G.recognize(seg([0, 0], [10, 4], 20)) === null);
// helpers
t('rdp keeps the corner', G.rdp([[0, 0], [5, 0], [10, 0], [10, 5], [10, 10]], 1).length === 3);
t('distToSeg', Math.abs(G.distToSeg([5, 3], [0, 0], [10, 0]) - 3) < 1e-9 && Math.abs(G.distToSeg([-4, 3], [0, 0], [10, 0]) - 5) < 1e-9);
t('thin keeps the first and last', (() => { const p = G.thin(seg([0, 0], [100, 0], 101), 10); return p[0][0] === 0 && p[p.length - 1][0] === 100 && p.length < 20; })());
t('snapLine keeps a diagonal', (() => { const s = G.snapLine([0, 0], [100, 100]); return s.x2 === 100 && s.y2 === 100; })());
// mind map layout
const nodes = [{ id: 'r', p: '', w: 120, h: 50 }, { id: 'a', p: 'r', w: 100, h: 40 }, { id: 'b', p: 'r', w: 100, h: 40 }, { id: 'c', p: 'r', w: 100, h: 40 }, { id: 'a1', p: 'a', w: 90, h: 36 }, { id: 'a2', p: 'a', w: 90, h: 36 }];
const L3 = G.mindLayout(nodes, 'r');
t('root at the centre', L3.r[0] === 0 && L3.r[1] === 0);
t('children split to both sides', L3.a[0] > 0 && L3.b[0] < 0 && L3.c[0] > 0);
t('a grandchild is further out on the same side', L3.a1[0] > L3.a[0] && L3.a2[0] > L3.a[0] && L3.a1[1] !== L3.a2[1]);
t('no two nodes overlap', (() => { const ids = Object.keys(L3), bx = (id) => { const n = nodes.find((x) => x.id === id); return [L3[id][0] - n.w / 2, L3[id][1] - n.h / 2, L3[id][0] + n.w / 2, L3[id][1] + n.h / 2]; }; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const A = bx(ids[i]), B = bx(ids[j]); if (A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]) return false; } return true; })());
console.log('note tests passed', ok, 'failed', bad);
process.exit(bad ? 1 : 0);
