// دفتر الملاحظات: the maths of the handwriting notes, kept apart from the screen code so it can be tested (tools/note-test.mjs).
// Points are [x, y] in the page's own units. Everything here is pure.
(function (root) {
    'use strict';
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const pathLen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]); return L; };
    const bboxOf = (p) => { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const q of p) { if (q[0] < x1) x1 = q[0]; if (q[0] > x2) x2 = q[0]; if (q[1] < y1) y1 = q[1]; if (q[1] > y2) y2 = q[1]; } return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 }; };
    // distance from point p to the segment a-b
    function distToSeg(p, a, b) {
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        if (!l2) return dist(p, a);
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
        return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    }
    // Ramer-Douglas-Peucker: the fewest points that keep the path within eps
    function rdp(p, eps) {
        if (p.length < 3) return p.slice();
        let m = 0, at = 0;
        for (let i = 1; i < p.length - 1; i++) { const d = distToSeg(p[i], p[0], p[p.length - 1]); if (d > m) { m = d; at = i; } }
        if (m <= eps) return [p[0], p[p.length - 1]];
        const a = rdp(p.slice(0, at + 1), eps), b = rdp(p.slice(at), eps);
        return a.slice(0, -1).concat(b);
    }
    // the same for a path that comes back to where it started: split at the point farthest from the start
    function rdpClosed(p, eps) {
        let m = 0, at = 0;
        for (let i = 1; i < p.length; i++) { const d = dist(p[i], p[0]); if (d > m) { m = d; at = i; } }
        const a = rdp(p.slice(0, at + 1), eps), b = rdp(p.slice(at).concat([p[0]]), eps);
        const out = a.slice(0, -1).concat(b.slice(0, -1));
        return out;
    }
    // keep a point only when it is at least `min` away from the last kept one (the last point is always kept)
    function thin(p, min) {
        if (p.length < 3) return p.slice();
        const out = [p[0]];
        for (let i = 1; i < p.length - 1; i++) if (dist(p[i], out[out.length - 1]) >= min) out.push(p[i]);
        out.push(p[p.length - 1]);
        return out;
    }
    const angleAt = (a, b, c) => { const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]]; const l = Math.hypot(...v1) * Math.hypot(...v2); if (!l) return 0; return Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / l))) * 180 / Math.PI; };
    const axisAligned = (a, b, tol) => { const ang = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI) % 180; return Math.min(ang, Math.abs(ang - 90), Math.abs(ang - 180)) <= tol; };

    // a straight line from a to b, nudged to exactly horizontal or vertical when it is within `tol` degrees of it
    function snapLine(a, b, tol) {
        tol = tol == null ? 7 : tol;
        const dx = b[0] - a[0], dy = b[1] - a[1], ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 180;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, half = Math.hypot(dx, dy) / 2;
        if (Math.min(ang, Math.abs(ang - 180)) <= tol) return { x1: mx - half * Math.sign(dx || 1), y1: my, x2: mx + half * Math.sign(dx || 1), y2: my };
        if (Math.abs(ang - 90) <= tol) return { x1: mx, y1: my - half * Math.sign(dy || 1), x2: mx, y2: my + half * Math.sign(dy || 1) };
        return { x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
    }

    // What did the hand try to draw? pts: [[x, y], ...]. Returns null (leave it as it is) or
    //   { k: 'line', x1, y1, x2, y2 } | { k: 'ellipse', cx, cy, rx, ry } | { k: 'rect', x1, y1, x2, y2 } | { k: 'poly', pts, closed }
    function recognize(pts0) {
        if (!pts0 || pts0.length < 4) return null;
        const pts = thin(pts0, 1.5), L = pathLen(pts), bb = bboxOf(pts), diag = Math.hypot(bb.w, bb.h);
        if (L < 24 || diag < 18) return null;
        const first = pts[0], last = pts[pts.length - 1], gap = dist(first, last);
        // a straight line: every point close to the chord
        if (gap > 0.7 * L) {
            let dev = 0; for (const q of pts) dev = Math.max(dev, distToSeg(q, first, last));
            if (dev / gap < 0.08) return Object.assign({ k: 'line' }, snapLine(first, last));
        }
        const closed = gap < 0.22 * L && L > 60;
        if (closed) {
            const cx = (bb.x1 + bb.x2) / 2, cy = (bb.y1 + bb.y2) / 2, rx = bb.w / 2, ry = bb.h / 2;
            if (rx > 8 && ry > 8) {
                let s = 0; for (const q of pts) s += Math.abs(Math.hypot((q[0] - cx) / rx, (q[1] - cy) / ry) - 1);
                if (s / pts.length < 0.13) { const r = Math.abs(rx - ry) / Math.max(rx, ry) < 0.16 ? (rx + ry) / 2 : 0; return r ? { k: 'ellipse', cx, cy, rx: r, ry: r } : { k: 'ellipse', cx, cy, rx, ry }; }
            }
            const v = rdpClosed(pts, 0.075 * diag);
            if (v.length === 3) return { k: 'poly', pts: v, closed: true };
            if (v.length === 4) {
                const right = [0, 1, 2, 3].every((i) => Math.abs(angleAt(v[(i + 3) % 4], v[i], v[(i + 1) % 4]) - 90) < 24);
                if (right) {
                    if (axisAligned(v[0], v[1], 16) && axisAligned(v[1], v[2], 16)) { const b = bboxOf(v); return { k: 'rect', x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 }; }
                    // a tilted rectangle: keep its direction, make the corners exact
                    const ang = Math.atan2(v[1][1] - v[0][1], v[1][0] - v[0][0]), c = Math.cos(-ang), s2 = Math.sin(-ang);
                    const mx = (v[0][0] + v[1][0] + v[2][0] + v[3][0]) / 4, my = (v[0][1] + v[1][1] + v[2][1] + v[3][1]) / 4;
                    const rot = v.map((q) => [(q[0] - mx) * c - (q[1] - my) * s2, (q[0] - mx) * s2 + (q[1] - my) * c]), rb = bboxOf(rot);
                    const back = (x, y) => [mx + x * Math.cos(ang) - y * Math.sin(ang), my + x * Math.sin(ang) + y * Math.cos(ang)];
                    return { k: 'poly', pts: [back(rb.x1, rb.y1), back(rb.x2, rb.y1), back(rb.x2, rb.y2), back(rb.x1, rb.y2)], closed: true };
                }
                return { k: 'poly', pts: v, closed: true };
            }
            if (v.length === 5 || v.length === 6) return { k: 'poly', pts: v, closed: true };
            return null;
        }
        // an open path with a few straight pieces (a zig-zag, an L, a check mark)
        const v = rdp(pts, 0.06 * L);
        if (v.length >= 3 && v.length <= 5) {
            let ok = true; for (let i = 1; i < v.length; i++) if (dist(v[i - 1], v[i]) < 0.14 * L) ok = false;
            if (ok) return { k: 'poly', pts: v, closed: false };
        }
        return null;
    }

    // ----- mind map: where do the nodes go? nodes: [{ id, p (parent id or ''), w, h }] -----
    // The root sits at (0, 0); its children are split between the two sides, each subtree gets as much height as its leaves need.
    function mindLayout(nodes, rootId, opt) {
        opt = Object.assign({ gapX: 70, gapY: 22 }, opt || {});
        const by = {}, kids = {}; nodes.forEach((n) => { by[n.id] = n; kids[n.id] = []; });
        nodes.forEach((n) => { if (n.p && kids[n.p]) kids[n.p].push(n.id); });
        const out = {}, root = by[rootId]; if (!root) return out;
        const need = {};
        const height = (id) => { const c = kids[id]; if (!c.length) return (need[id] = by[id].h + opt.gapY); let s = 0; c.forEach((k) => { s += height(k); }); return (need[id] = Math.max(s, by[id].h + opt.gapY)); };
        height(rootId);
        out[rootId] = [0, 0];
        const place = (id, side, x, yTop) => {          // x = the node's inner edge; side: +1 right, -1 left
            const n = by[id], cx = side > 0 ? x + n.w / 2 : x - n.w / 2, cy = yTop + need[id] / 2;
            out[id] = [cx, cy];
            let y = yTop;
            kids[id].forEach((k) => { place(k, side, side > 0 ? x + n.w + opt.gapX : x - n.w - opt.gapX, y); y += need[k]; });
        };
        const rk = kids[rootId], right = [], left = [];
        rk.forEach((k, i) => (i % 2 === 0 ? right : left).push(k));
        const sum = (a) => a.reduce((s, k) => s + need[k], 0);
        let y = -sum(right) / 2; right.forEach((k) => { place(k, 1, root.w / 2 + opt.gapX, y); y += need[k]; });
        y = -sum(left) / 2; left.forEach((k) => { place(k, -1, -root.w / 2 - opt.gapX, y); y += need[k]; });
        return out;
    }

    const api = { dist, pathLen, bboxOf, distToSeg, rdp, rdpClosed, thin, angleAt, snapLine, recognize, mindLayout };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NoteGeom = api;
})(typeof window !== 'undefined' ? window : globalThis);
