// دفتر الملاحظات: handwriting notebooks. Every note has pages; each page is an endless canvas (pan / zoom) with a paper
// (plain, ruled, squares, dots, graph, cornell). Tools: pen (pressure), pencil, highlighter, stroke eraser, select / lasso,
// shapes, text, sticky notes and mind maps. A wobbly stroke is straightened by holding still for a moment (line, circle,
// rectangle, triangle ...). The maths of that lives in notegeom.js. Notes are saved on the phone (IndexedDB), nothing is uploaded.
// Loaded by app._need('notes') after notegeom.
(function () {
    'use strict';
    const G = window.NoteGeom;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const COLS = ['#111827', '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#ffffff'];
    const HLC = ['#facc15', '#4ade80', '#f472b6', '#38bdf8'];
    const STK = ['#fde68a', '#bbf7d0', '#fbcfe8', '#bae6fd', '#ddd6fe', '#fed7aa'];
    const BRANCH = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777'];
    const PAPERS = [['blank', 'سادة'], ['ruled', 'مسطر'], ['grid', 'مربعات'], ['dots', 'نقاط'], ['axes', 'بياني'], ['cornell', 'كورنيل']];
    const PCOL = ['#ffffff', '#fbf6e9', '#fff7c2', '#e8f1ff', '#e9f9ee', '#1f2430'];
    const SIZES = { pen: [1.6, 2.8, 5], pencil: [1.4, 2.2, 3.4], hl: [10, 16, 28], eraser: [10, 18, 32] };
    const TEXTSZ = [18, 26, 40];
    const SHAPES = [['line', 'خط', 'minus'], ['arrow', 'سهم', 'arrow-up-right'], ['rect', 'مستطيل', 'square'], ['ellipse', 'دائرة', 'circle'], ['tri', 'مثلث', 'triangle']];
    const TOOLS = [['pen', 'قلم', 'pen-tool'], ['pencil', 'رصاص', 'pencil'], ['hl', 'ماركر', 'highlighter'], ['eraser', 'ممحاة', 'eraser'], ['select', 'تحديد', 'lasso-select'], ['shape', 'أشكال', 'shapes'], ['text', 'نص', 'type'], ['sticky', 'ورقة لاصقة', 'sticky-note'], ['mind', 'خريطة ذهنية', 'network'], ['hand', 'تحريك', 'hand']];
    const GRID = 36;
    const rep = (k, v) => (k[0] === '_' ? undefined : v);
    const clone = (o) => JSON.parse(JSON.stringify(o, rep));
    const lum = (hex) => { const n = parseInt(String(hex).slice(1), 16) || 0; return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
    const rtlOf = (s) => /[؀-ۿ]/.test(s || '');
    const FONT = "'Readex Pro','IBM Plex Sans Arabic',Tahoma,sans-serif";
    const setLoad = () => { try { return JSON.parse(localStorage.getItem('isp_nt_set') || '{}') || {}; } catch (e) { return {}; } };
    const SET = Object.assign({ finger: 'auto', auto: false, hold: true, tool: 'pen', col: COLS[0], hlc: HLC[0], sz: { pen: 1, pencil: 1, hl: 1, eraser: 1, shape: 1 }, shape: 'line', tsz: 1, stk: STK[0] }, setLoad());
    const setSave = () => { try { localStorage.setItem('isp_nt_set', JSON.stringify(SET)); } catch (e) {} };

    // ---------- storage: IndexedDB (falls back to memory) ----------
    const Store = {
        db: null, mem: new Map(), p: null,
        open() {
            if (this.p) return this.p;
            this.p = new Promise((res) => {
                try {
                    const r = indexedDB.open('isp_notes', 1);
                    r.onupgradeneeded = () => r.result.createObjectStore('notes', { keyPath: 'id' });
                    r.onsuccess = () => { this.db = r.result; res(true); };
                    r.onerror = () => res(false); r.onblocked = () => res(false);
                } catch (e) { res(false); }
            });
            return this.p;
        },
        async all() {
            await this.open();
            if (!this.db) return [...this.mem.values()];
            return new Promise((res) => { try { const o = this.db.transaction('notes').objectStore('notes').getAll(); o.onsuccess = () => res(o.result || []); o.onerror = () => res([]); } catch (e) { res([]); } });
        },
        async put(n) {
            await this.open();
            const c = clone(n);
            if (!this.db) { this.mem.set(n.id, c); return true; }
            return new Promise((res) => { try { const t = this.db.transaction('notes', 'readwrite'); t.objectStore('notes').put(c); t.oncomplete = () => res(true); t.onerror = () => res(false); t.onabort = () => res(false); } catch (e) { res(false); } });
        },
        async del(id) {
            await this.open();
            if (!this.db) { this.mem.delete(id); return true; }
            return new Promise((res) => { try { const t = this.db.transaction('notes', 'readwrite'); t.objectStore('notes').delete(id); t.oncomplete = () => res(true); t.onerror = () => res(false); t.onabort = () => res(false); } catch (e) { res(false); } });
        },
    };

    // ---------- state ----------
    let NOTES = [], N = null, PG = null, V = { x: 0, y: 0, z: 1 };
    let H = { u: [], r: [] }, SEL = [], ST = null, MODE = '', ptrs = new Map(), rect = null, saveT = 0, dirty = false, penSeen = false, penDown = false;
    let stageEl = null, baseC = null, liveC = null, bctx = null, lctx = null, dpr = 1, W = 0, Hh = 0, raf = 0, rafL = 0, ro = null, TAP = null, lastTap = null, spaceDown = false, taEl = null;
    const mctx = document.createElement('canvas').getContext('2d');

    // ---------- drawing ----------
    function paper(ctx, pg, w, h, v) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = pg.col || '#fff'; ctx.fillRect(0, 0, w * dpr, h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const dark = lum(pg.col || '#fff') < 0.4, bg = pg.bg || 'blank';
        const ln = dark ? 'rgba(255,255,255,.13)' : 'rgba(40,80,140,.18)', ln2 = dark ? 'rgba(255,255,255,.26)' : 'rgba(40,80,140,.32)';
        if (bg === 'blank') return;
        const s = GRID * v.z;
        const mod = (a, m) => ((a % m) + m) % m;
        const hline = (y, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw || 1; ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); ctx.stroke(); };
        const vline = (x, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw || 1; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); ctx.stroke(); };
        if (s < 7) return;
        if (bg === 'ruled' || bg === 'cornell') {
            for (let y = mod(v.y, s); y < h; y += s) hline(y, ln);
            vline(v.x, dark ? 'rgba(255,120,120,.5)' : 'rgba(220,60,60,.45)', 1.5);
            if (bg === 'cornell') { vline(v.x + 6 * GRID * v.z, ln2, 1.5); hline(v.y, ln2, 1.5); }
        } else if (bg === 'grid' || bg === 'axes') {
            const i0 = Math.floor(-v.x / s), j0 = Math.floor(-v.y / s);
            for (let x = mod(v.x, s), i = i0; x < w; x += s, i++) vline(x, i % 5 === 0 ? ln2 : ln);
            for (let y = mod(v.y, s), j = j0; y < h; y += s, j++) hline(y, j % 5 === 0 ? ln2 : ln);
            if (bg === 'axes') {
                const ax = dark ? 'rgba(255,255,255,.8)' : 'rgba(17,24,39,.8)';
                vline(v.x, ax, 2); hline(v.y, ax, 2);
                ctx.fillStyle = ax; ctx.font = '10px ' + FONT; ctx.textAlign = 'center';
                let step = 1; const steps = [1, 5, 10, 50, 100]; for (const t of steps) { step = t; if (t * s >= 38) break; }
                for (let k = Math.ceil(-v.x / s / step) * step; k * s + v.x < w; k += step) if (k) ctx.fillText(String(k), v.x + k * s, Math.min(h - 4, Math.max(12, v.y + 12)));
                ctx.textAlign = 'right';
                for (let k = Math.ceil(-v.y / s / step) * step; k * s + v.y < h; k += step) if (k) ctx.fillText(String(-k), Math.min(w - 4, Math.max(18, v.x - 4)), v.y + k * s + 3);
            }
        } else if (bg === 'dots') {
            ctx.fillStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(40,80,140,.4)';
            const r = Math.max(1, 1.1 * v.z);
            for (let x = mod(v.x, s); x < w; x += s) for (let y = mod(v.y, s); y < h; y += s) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
        }
    }

    function tdim(o) {
        if (o._d) return o._d;
        let d;
        if (o.t === 't') {
            mctx.font = o.sz + 'px ' + FONT;
            const ls = String(o.s || '').split('\n'); let w = 20; ls.forEach((l) => { w = Math.max(w, mctx.measureText(l).width); });
            d = { w: w + 4, h: ls.length * o.sz * 1.4, ls };
        } else if (o.t === 'k') {
            mctx.font = '17px ' + FONT;
            d = { ls: wrap(o.s || '', o.w - 24) };
        } else { // mind node
            mctx.font = (o.r ? 'bold 22px ' : '18px ') + FONT;
            const ls = String(o.s || ' ').split('\n'); let w = 40; ls.forEach((l) => { w = Math.max(w, mctx.measureText(l).width); });
            d = { ls, w: Math.max(o.r ? 110 : 76, w + 30), h: ls.length * (o.r ? 28 : 23) + (o.r ? 24 : 16) };
        }
        o._d = d; return d;
    }
    function wrap(s, maxW) {
        const out = [];
        String(s).split('\n').forEach((para) => {
            let line = '';
            para.split(' ').forEach((w) => { const t = line ? line + ' ' + w : w; if (line && mctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t; });
            out.push(line);
        });
        return out;
    }
    function nodeSize(o) { o._d = null; const d = tdim(o); o.w = d.w; o.h = d.h; o._b = null; }
    function bb(o) {
        if (o._b) return o._b;
        let b;
        if (o.t === 's') { const q = G.bboxOf(o.p); const r = o.w * 0.8 + 1; b = { x1: q.x1 - r, y1: q.y1 - r, x2: q.x2 + r, y2: q.y2 + r }; }
        else if (o.t === 't') { const d = tdim(o); b = rtlOf(o.s) ? { x1: o.x - d.w, y1: o.y, x2: o.x, y2: o.y + d.h } : { x1: o.x, y1: o.y, x2: o.x + d.w, y2: o.y + d.h }; }
        else if (o.t === 'k') b = { x1: o.x, y1: o.y, x2: o.x + o.w, y2: o.y + o.h };
        else b = { x1: o.x - o.w / 2, y1: o.y - o.h / 2, x2: o.x + o.w / 2, y2: o.y + o.h / 2 };
        o._b = b; return b;
    }
    const invalid = (o) => { o._b = null; o._d = null; };

    function drawStroke(ctx, o, pred) {
        let P = o.p; if (pred && pred.length) P = P.concat(pred);
        const n = P.length; if (!n) return;
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = ctx.fillStyle = o.c;
        if (o.k === 'hl') ctx.globalAlpha = 0.38; else if (o.k === 'pencil') ctx.globalAlpha = 0.85;
        const dot = n === 1 || (n === 2 && P[0][0] === P[1][0] && P[0][1] === P[1][1]);
        if (dot) { ctx.beginPath(); ctx.arc(P[0][0], P[0][1], Math.max(0.5, o.w * (o.k === 'pen' && !o.g ? 0.4 + 1.2 * (P[0][2] || 0.5) : 1) / 2), 0, 6.2832); ctx.fill(); ctx.restore(); return; }
        if (o.g) {
            ctx.lineWidth = o.w; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
            for (let i = 1; i < n; i++) ctx.lineTo(P[i][0], P[i][1]);
            if (o.cl) ctx.closePath();
            ctx.stroke(); ctx.restore(); return;
        }
        const pm = (k) => (k <= 0 ? P[0] : k >= n ? P[n - 1] : [(P[k - 1][0] + P[k][0]) / 2, (P[k - 1][1] + P[k][1]) / 2]);
        if (o.k !== 'pen') {
            ctx.lineWidth = o.w; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
            for (let k = 0; k < n; k++) { const e = pm(k + 1); ctx.quadraticCurveTo(P[k][0], P[k][1], e[0], e[1]); }
            ctx.stroke(); ctx.restore(); return;
        }
        // the pen: width follows pressure, drawn in runs of equal width
        const wq = (k) => Math.max(0.3, Math.round(o.w * (0.4 + 1.2 * (P[k][2] == null ? 0.5 : P[k][2])) * 4) / 4);
        let a = 0;
        while (a < n) {
            const w = wq(a); let b = a;
            while (b + 1 < n && wq(b + 1) === w) b++;
            ctx.lineWidth = w; ctx.beginPath();
            const s0 = pm(a); ctx.moveTo(s0[0], s0[1]);
            for (let k = a; k <= b; k++) { const e = pm(k + 1); ctx.quadraticCurveTo(P[k][0], P[k][1], e[0], e[1]); }
            ctx.stroke(); a = b + 1;
        }
        ctx.restore();
    }
    function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function drawEdge(ctx, p, c) {
        const right = c.x >= p.x, x1 = p.x + (right ? p.w / 2 : -p.w / 2), x2 = c.x + (right ? -c.w / 2 : c.w / 2), mx = (x1 + x2) / 2;
        ctx.strokeStyle = c.c; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, p.y); ctx.bezierCurveTo(mx, p.y, mx, c.y, x2, c.y); ctx.stroke();
    }
    function drawObj(ctx, o, dark) {
        if (o.t === 's') return drawStroke(ctx, o);
        if (o.t === 't') {
            const d = tdim(o), rtl = rtlOf(o.s);
            ctx.fillStyle = o.c; ctx.font = o.sz + 'px ' + FONT; ctx.textBaseline = 'top'; ctx.textAlign = rtl ? 'right' : 'left'; ctx.direction = rtl ? 'rtl' : 'ltr';
            d.ls.forEach((l, i) => ctx.fillText(l, o.x, o.y + i * o.sz * 1.4 + o.sz * 0.1));
            return;
        }
        if (o.t === 'k') {
            ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
            ctx.fillStyle = o.c; rrect(ctx, o.x, o.y, o.w, o.h, 6); ctx.fill(); ctx.restore();
            const d = tdim(o), rtl = rtlOf(o.s);
            ctx.save(); rrect(ctx, o.x, o.y, o.w, o.h, 6); ctx.clip();
            ctx.fillStyle = '#1f2937'; ctx.font = '17px ' + FONT; ctx.textBaseline = 'top'; ctx.textAlign = rtl ? 'right' : 'left'; ctx.direction = rtl ? 'rtl' : 'ltr';
            d.ls.forEach((l, i) => ctx.fillText(l, rtl ? o.x + o.w - 12 : o.x + 12, o.y + 12 + i * 24));
            ctx.restore(); return;
        }
        if (o.t === 'm') {
            const d = tdim(o), x = o.x - o.w / 2, y = o.y - o.h / 2;
            ctx.save();
            if (o.r) { ctx.fillStyle = o.c; rrect(ctx, x, y, o.w, o.h, o.h / 2); ctx.fill(); }
            else { ctx.fillStyle = dark ? '#2b3140' : '#ffffff'; rrect(ctx, x, y, o.w, o.h, 12); ctx.fill(); ctx.strokeStyle = o.c; ctx.lineWidth = 3; ctx.stroke(); }
            const rtl = rtlOf(o.s); ctx.fillStyle = o.r ? '#fff' : (dark ? '#f3f4f6' : '#111827'); ctx.font = (o.r ? 'bold 22px ' : '18px ') + FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.direction = rtl ? 'rtl' : 'ltr';
            const lh = o.r ? 28 : 23; d.ls.forEach((l, i) => ctx.fillText(l, o.x, o.y + (i - (d.ls.length - 1) / 2) * lh));
            ctx.restore();
        }
    }
    // paper + every object, for the screen, the thumbnail and the exported picture
    function renderPage(ctx, pg, w, h, v, only) {
        paper(ctx, pg, w, h, v);
        ctx.setTransform(dpr * v.z, 0, 0, dpr * v.z, dpr * v.x, dpr * v.y);
        const dark = lum(pg.col || '#fff') < 0.4;
        const x1 = -v.x / v.z, y1 = -v.y / v.z, x2 = (w - v.x) / v.z, y2 = (h - v.y) / v.z;
        const vis = (o) => { if (o._gone) return false; const b = bb(o); return !(b.x2 < x1 || b.x1 > x2 || b.y2 < y1 || b.y1 > y2); };
        const byId = {}; pg.objs.forEach((o) => { if (o.t === 'm') byId[o.id] = o; });
        pg.objs.forEach((o) => { if (o.t === 'm' && o.p && byId[o.p] && !o._gone) { const p = byId[o.p]; const bx = bb(p), bc = bb(o); if (!(Math.max(bx.x2, bc.x2) < x1 || Math.min(bx.x1, bc.x1) > x2 || Math.max(bx.y2, bc.y2) < y1 || Math.min(bx.y1, bc.y1) > y2)) drawEdge(ctx, p, o); } });
        for (const o of pg.objs) if (vis(o) && (!only || only(o))) drawObj(ctx, o, dark);
    }
    function redraw() {
        if (raf || !bctx) return;
        raf = requestAnimationFrame(() => { raf = 0; if (!bctx || !PG) return; renderPage(bctx, PG, W, Hh, V); drawLive(true); zoomLabel(); });
    }
    function redrawLive() { if (rafL || !lctx) return; rafL = requestAnimationFrame(() => { rafL = 0; drawLive(); }); }

    const toS = (x, y) => [x * V.z + V.x, y * V.z + V.y];
    const toW = (sx, sy) => [(sx - V.x) / V.z, (sy - V.y) / V.z];
    function selBox() {
        if (!SEL.length) return null;
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        SEL.forEach((o) => { const b = bb(o); x1 = Math.min(x1, b.x1); y1 = Math.min(y1, b.y1); x2 = Math.max(x2, b.x2); y2 = Math.max(y2, b.y2); });
        return { x1, y1, x2, y2 };
    }
    const canScale = () => SEL.length && SEL.every((o) => o.t !== 'm');
    function drawLive() {
        if (!lctx) return;
        lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, liveC.width, liveC.height);
        lctx.setTransform(dpr * V.z, 0, 0, dpr * V.z, dpr * V.x, dpr * V.y);
        if (ST) {
            if (ST.snap) drawStroke(lctx, ST.snap);
            else if (ST.o && ST.o.p.length) drawStroke(lctx, ST.o, ST.pred);
            if (ST.lasso && ST.lasso.length > 1) {
                lctx.save(); lctx.setLineDash([6 / V.z, 5 / V.z]); lctx.lineWidth = 1.6 / V.z; lctx.strokeStyle = '#2563eb'; lctx.fillStyle = 'rgba(37,99,235,.08)';
                lctx.beginPath(); lctx.moveTo(ST.lasso[0][0], ST.lasso[0][1]); ST.lasso.forEach((p) => lctx.lineTo(p[0], p[1])); lctx.closePath(); lctx.fill(); lctx.stroke(); lctx.restore();
            }
            if (ST.eraser) { lctx.save(); lctx.lineWidth = 1.5 / V.z; lctx.strokeStyle = 'rgba(100,100,100,.8)'; lctx.fillStyle = 'rgba(255,255,255,.35)'; lctx.beginPath(); lctx.arc(ST.eraser[0], ST.eraser[1], ST.er, 0, 6.2832); lctx.fill(); lctx.stroke(); lctx.restore(); }
        }
        const b = selBox();
        if (b) {
            const pad = 6 / V.z;
            lctx.save(); lctx.setLineDash([7 / V.z, 5 / V.z]); lctx.lineWidth = 1.8 / V.z; lctx.strokeStyle = '#2563eb';
            lctx.strokeRect(b.x1 - pad, b.y1 - pad, b.x2 - b.x1 + 2 * pad, b.y2 - b.y1 + 2 * pad); lctx.setLineDash([]);
            if (canScale()) { lctx.fillStyle = '#fff'; lctx.lineWidth = 2 / V.z; lctx.beginPath(); lctx.arc(b.x2 + pad, b.y2 + pad, 9 / V.z, 0, 6.2832); lctx.fill(); lctx.stroke(); }
            lctx.restore();
        }
    }
    function zoomLabel() { const z = $('ntZoom'); if (z) z.textContent = Math.round(V.z * 100) + '%'; }

    // ---------- history ----------
    function mark() { dirty = true; clearTimeout(saveT); saveT = setTimeout(saveNow, 1200); histBtns(); }
    function push(ops) { if (!ops.length) return; H.u.push(ops); if (H.u.length > 100) H.u.shift(); H.r = []; mark(); redraw(); optsRender(); }
    function restore(o, s) { Object.keys(o).forEach((k) => { if (k[0] !== '_') delete o[k]; }); Object.assign(o, clone(s)); invalid(o); }
    function applyOps(ops, undo) {
        const list = undo ? ops.slice().reverse() : ops;
        for (const op of list) {
            const objs = PG.objs;
            if (op.k === 'add') { if (undo) { const i = objs.indexOf(op.o); if (i >= 0) objs.splice(i, 1); } else objs.splice(Math.min(op.i == null ? objs.length : op.i, objs.length), 0, op.o); }
            else if (op.k === 'del') { if (undo) objs.splice(Math.min(op.i, objs.length), 0, op.o); else { const i = objs.indexOf(op.o); if (i >= 0) objs.splice(i, 1); } }
            else if (op.k === 'mod') restore(op.o, undo ? op.a : op.b);
        }
        SEL = SEL.filter((o) => PG.objs.includes(o));
    }
    function undo() { const ops = H.u.pop(); if (!ops) return; applyOps(ops, true); H.r.push(ops); mark(); redraw(); optsRender(); }
    function redo() { const ops = H.r.pop(); if (!ops) return; applyOps(ops, false); H.u.push(ops); mark(); redraw(); optsRender(); }
    function histBtns() { const u = $('ntUndo'), r = $('ntRedo'); if (u) u.disabled = !H.u.length; if (r) r.disabled = !H.r.length; }
    // change objects with fn and record one undo step
    function change(objs, fn) {
        const before = objs.map((o) => clone(o)); fn(); objs.forEach(invalid);
        const ops = []; objs.forEach((o, i) => { const a = before[i], b = clone(o); if (JSON.stringify(a) !== JSON.stringify(b)) ops.push({ k: 'mod', o, a, b }); });
        push(ops);
    }
    function addObj(o) {
        let i = PG.objs.length;
        if (o.t === 's' && o.k === 'hl') { i = PG.objs.findIndex((q) => !(q.t === 's' && q.k === 'hl')); if (i < 0) i = PG.objs.length; }
        PG.objs.splice(i, 0, o); return { k: 'add', o, i };
    }
    function delObjs(list) {
        const idx = list.map((o) => [PG.objs.indexOf(o), o]).filter((x) => x[0] >= 0).sort((a, b) => b[0] - a[0]);
        const ops = idx.map(([i, o]) => { PG.objs.splice(i, 1); return { k: 'del', o, i }; });
        SEL = SEL.filter((o) => !list.includes(o)); push(ops);
    }

    // ---------- geometry helpers ----------
    function hitStroke(o, x, y, r) {
        const b = bb(o); if (x < b.x1 - r || x > b.x2 + r || y < b.y1 - r || y > b.y2 + r) return false;
        const p = o.p, rr = r + o.w / 2;
        if (p.length === 1) return Math.hypot(p[0][0] - x, p[0][1] - y) <= rr;
        for (let i = 1; i < p.length; i++) if (G.distToSeg([x, y], p[i - 1], p[i]) <= rr) return true;
        return o.cl ? G.distToSeg([x, y], p[p.length - 1], p[0]) <= rr : false;
    }
    function hitAt(x, y, only) {
        const r = 9 / V.z;
        for (let i = PG.objs.length - 1; i >= 0; i--) {
            const o = PG.objs[i]; if (o._gone || (only && !only(o))) continue;
            if (o.t === 's') { if (hitStroke(o, x, y, r)) return o; }
            else { const b = bb(o); if (x >= b.x1 - 4 / V.z && x <= b.x2 + 4 / V.z && y >= b.y1 - 4 / V.z && y <= b.y2 + 4 / V.z) return o; }
        }
        return null;
    }
    const inPoly = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    function kids(o) { const out = []; const walk = (id) => PG.objs.forEach((q) => { if (q.t === 'm' && q.p === id) { out.push(q); walk(q.id); } }); walk(o.id); return out; }
    function shift(o, dx, dy) { if (o.t === 's') o.p.forEach((q) => { q[0] += dx; q[1] += dy; }); else { o.x += dx; o.y += dy; } o._b = null; }
    function scaleObj(o, ax, ay, f) {
        if (o.t === 's') { o.p.forEach((q) => { q[0] = ax + (q[0] - ax) * f; q[1] = ay + (q[1] - ay) * f; }); o.w = Math.max(0.5, o.w * f); }
        else if (o.t === 't') { o.x = ax + (o.x - ax) * f; o.y = ay + (o.y - ay) * f; o.sz = Math.max(8, o.sz * f); }
        else if (o.t === 'k') { o.x = ax + (o.x - ax) * f; o.y = ay + (o.y - ay) * f; o.w = Math.max(80, o.w * f); o.h = Math.max(60, o.h * f); }
        invalid(o);
    }

    // ---------- shapes ----------
    function shapePts(kind, a, b) {
        let dx = b[0] - a[0], dy = b[1] - a[1];
        if (kind === 'line' || kind === 'arrow') {
            const L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), snap = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
            if (Math.abs(ang - snap) < 0.07) { b = [a[0] + Math.cos(snap) * L, a[1] + Math.sin(snap) * L]; dx = b[0] - a[0]; dy = b[1] - a[1]; }
            if (kind === 'line') return { p: [a, b], cl: false };
            const hl = Math.min(30, L * 0.35), an = Math.atan2(dy, dx), h1 = [b[0] - Math.cos(an - 0.5) * hl, b[1] - Math.sin(an - 0.5) * hl], h2 = [b[0] - Math.cos(an + 0.5) * hl, b[1] - Math.sin(an + 0.5) * hl];
            return { p: [a, b, h1, b, h2], cl: false };
        }
        if (kind === 'rect') return { p: [a, [b[0], a[1]], b, [a[0], b[1]]], cl: true };
        if (kind === 'tri') return { p: [[(a[0] + b[0]) / 2, a[1]], b, [a[0], b[1]]], cl: true };
        const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, rx = Math.abs(dx) / 2, ry = Math.abs(dy) / 2, p = [];
        for (let i = 0; i < 72; i++) { const t = (i / 72) * 6.2832; p.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
        return { p, cl: true };
    }
    // a shape found by recognize() -> points
    function recPts(r) {
        if (r.k === 'line') return { p: [[r.x1, r.y1], [r.x2, r.y2]], cl: false };
        if (r.k === 'rect') return { p: [[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]], cl: true };
        if (r.k === 'ellipse') { const p = []; for (let i = 0; i < 72; i++) { const t = (i / 72) * 6.2832; p.push([r.cx + r.rx * Math.cos(t), r.cy + r.ry * Math.sin(t)]); } return { p, cl: true }; }
        return { p: r.pts.map((q) => [q[0], q[1]]), cl: !!r.closed };
    }
    const gStroke = (src, pts, cl) => ({ t: 's', k: src.k, c: src.c, w: src.w, g: 1, cl: cl ? 1 : 0, p: pts.map((q) => [round(q[0]), round(q[1]), 0.5]) });
    const round = (n) => Math.round(n * 10) / 10;

    // ---------- pointer input ----------
    const fingerBlocked = () => SET.finger === 'no' || (SET.finger === 'auto' && penSeen);
    function evPt(e) { return [(e.clientX - rect.left - V.x) / V.z, (e.clientY - rect.top - V.y) / V.z]; }
    function onDown(e) {
        if (!PG) return;
        if (taEl) { taEl.blur(); }
        if (e.pointerType === 'touch' && penDown) return;                       // a palm while the pen is writing
        if (e.pointerType === 'pen') { penDown = true; if (!penSeen) { penSeen = true; if (SET.finger === 'auto') app.showToast('تم التعرف على القلم. الإصبع هسه يحرّك الصفحة بس'); } }
        rect = stageEl.getBoundingClientRect();
        try { stageEl.setPointerCapture(e.pointerId); } catch (x) {}
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.pointerType, d: performance.now(), sx: e.clientX, sy: e.clientY });
        e.preventDefault();
        const touches = [...ptrs.values()].filter((p) => p.t === 'touch');
        if (touches.length >= 2) { cancelStroke(); startPinch(); return; }
        if (ptrs.size > 1) return;
        const isPan = e.pointerType === 'mouse' ? (e.button === 1 || e.button === 2 || spaceDown || SET.tool === 'hand') : (SET.tool === 'hand' || (e.pointerType === 'touch' && fingerBlocked()));
        if (isPan) { MODE = 'pan'; return; }
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const w = evPt(e);
        let tool = SET.tool;
        if (e.pointerType === 'pen' && (e.buttons & 32)) tool = 'eraser';       // the pencil's / pen's eraser end
        beginTool(tool, w, e);
    }
    function onMove(e) {
        const p = ptrs.get(e.pointerId); if (!p) return;
        const px = p.x, py = p.y; p.x = e.clientX; p.y = e.clientY;
        e.preventDefault();
        if (MODE === 'pinch') { doPinch(); return; }
        if (MODE === 'pan') { V.x += p.x - px; V.y += p.y - py; redraw(); return; }
        if (!ST) return;
        const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
        const list = evs.length ? evs : [e];
        for (const ev of list) moveTool(evPt(ev), ev);
        if (ST && ST.o && e.getPredictedEvents && ST.o.k && !ST.snap) { try { ST.pred = e.getPredictedEvents().slice(0, 3).map((q) => { const w = evPt(q); return [w[0], w[1], ST.pr]; }); } catch (x) { ST.pred = null; } }
        redrawLive();
    }
    function onUp(e) {
        const p = ptrs.get(e.pointerId); if (!p) return;
        ptrs.delete(e.pointerId);
        if (e.pointerType === 'pen') penDown = false;
        try { stageEl.releasePointerCapture(e.pointerId); } catch (x) {}
        if (MODE === 'pinch') {
            const left = [...ptrs.values()].filter((q) => q.t === 'touch').length;
            if (e.type === 'pointerup' && PINCH && performance.now() - PINCH.t0 < 280 && !PINCH.moved) {      // two-finger tap = undo, three = redo
                if (PINCH.n >= 3) redo(); else undo();
            }
            if (left < 2) { MODE = ''; PINCH = null; }
            return;
        }
        if (MODE === 'pan') { if (!ptrs.size) MODE = ''; return; }
        if (!ST) return;
        if (e.type === 'pointercancel') { cancelStroke(); return; }
        endTool(evPt(e), e, p);
    }
    let PINCH = null;
    function startPinch() {
        const t = [...ptrs.values()].filter((p) => p.t === 'touch');
        if (t.length < 2) return;
        MODE = 'pinch';
        PINCH = { d0: Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1, z0: V.z, cx: (t[0].x + t[1].x) / 2, cy: (t[0].y + t[1].y) / 2, vx: V.x, vy: V.y, t0: performance.now(), moved: false, n: t.length };
    }
    function doPinch() {
        const t = [...ptrs.values()].filter((p) => p.t === 'touch');
        if (t.length < 2 || !PINCH) return;
        PINCH.n = Math.max(PINCH.n, t.length);
        const d = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y), cx = (t[0].x + t[1].x) / 2, cy = (t[0].y + t[1].y) / 2;
        if (Math.abs(d - PINCH.d0) > 8 || Math.hypot(cx - PINCH.cx, cy - PINCH.cy) > 8) PINCH.moved = true;
        const z = Math.max(0.15, Math.min(6, PINCH.z0 * d / PINCH.d0));
        const wx = (PINCH.cx - rect.left - PINCH.vx) / PINCH.z0, wy = (PINCH.cy - rect.top - PINCH.vy) / PINCH.z0;
        V.z = z; V.x = cx - rect.left - wx * z; V.y = cy - rect.top - wy * z; redraw();
    }
    function onWheel(e) {
        e.preventDefault(); rect = stageEl.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey) {
            const z = Math.max(0.15, Math.min(6, V.z * Math.exp(-e.deltaY * 0.01))), mx = e.clientX - rect.left, my = e.clientY - rect.top;
            const wx = (mx - V.x) / V.z, wy = (my - V.y) / V.z; V.z = z; V.x = mx - wx * z; V.y = my - wy * z;
        } else { V.x -= e.deltaX; V.y -= e.deltaY; }
        redraw();
    }
    function cancelStroke() { if (ST && ST.er) ST.hit.forEach((o) => { o._gone = false; }); if (ST && ST.moveBefore) ST.moveBefore.forEach((b, i) => restore(ST.moveObjs[i], b)); clearTimeout(ST && ST.holdT); ST = null; redraw(); redrawLive(); }

    // ---------- tools ----------
    function penStyle(tool) {
        if (tool === 'hl') return { k: 'hl', c: SET.hlc, w: SIZES.hl[SET.sz.hl] };
        if (tool === 'pencil') return { k: 'pencil', c: SET.col, w: SIZES.pencil[SET.sz.pencil] };
        return { k: 'pen', c: SET.col, w: tool === 'shape' ? SIZES.pen[SET.sz.shape] : SIZES.pen[SET.sz.pen] };
    }
    function beginTool(tool, w, e) {
        TAP = { x: w[0], y: w[1], sx: e.clientX, sy: e.clientY, t: performance.now() };
        if (tool === 'pen' || tool === 'pencil' || tool === 'hl') {
            const s = penStyle(tool), pr = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
            ST = { tool, o: Object.assign({ t: 's', p: [[round(w[0]), round(w[1]), pr]] }, s), pr, ptype: e.pointerType, hx: e.clientX, hy: e.clientY, holdT: 0, snap: null };
            armHold();
        } else if (tool === 'eraser') {
            ST = { tool, er: SIZES.eraser[SET.sz.eraser] / V.z, eraser: w, hit: [] }; eraseAt(w);
        } else if (tool === 'shape') {
            ST = { tool, a: w, s: penStyle('shape'), snap: null };
        } else if (tool === 'select' || tool === 'mind') {
            beginSelect(tool, w);
        } else if (tool === 'text' || tool === 'sticky') {
            ST = { tool, tap: true };
        }
        redrawLive();
    }
    function armHold() {
        if (!ST || ST.tool === 'eraser' || SET.hold === false) return;
        clearTimeout(ST.holdT);
        ST.holdT = setTimeout(() => {
            if (!ST || !ST.o || ST.snap || ST.o.p.length < 5) return;
            const r = G.recognize(ST.o.p.map((q) => [q[0], q[1]]));
            if (!r) return;
            const rp = recPts(r);
            ST.snap = gStroke(ST.o, rp.p, rp.cl); ST.snapKind = r.k;
            if (r.k === 'line') ST.snapFrom = rp.p[0];
            try { navigator.vibrate && navigator.vibrate(12); } catch (x) {}
            redrawLive();
        }, 560);
    }
    function moveTool(w, ev) {
        const t = ST.tool;
        if (t === 'pen' || t === 'pencil' || t === 'hl') {
            if (ST.snap) {
                if (ST.snapKind === 'line') { const sh = shapePts('line', ST.snapFrom, w); ST.snap = gStroke(ST.o, sh.p, false); }
                return;
            }
            const p = ST.o.p, last = p[p.length - 1], a = ST.ptype === 'pen' ? 1 : 0.72;
            const x = last[0] + (w[0] - last[0]) * a, y = last[1] + (w[1] - last[1]) * a;
            if (Math.hypot(x - last[0], y - last[1]) * V.z < 0.5) return;
            const pr = ST.ptype === 'pen' ? ST.pr + ((ev.pressure || ST.pr) - ST.pr) * 0.5 : 0.5; ST.pr = pr;
            p.push([round(x), round(y), Math.round(pr * 100) / 100]);
            if (Math.hypot(ev.clientX - ST.hx, ev.clientY - ST.hy) > 3.5) { ST.hx = ev.clientX; ST.hy = ev.clientY; armHold(); }
        } else if (t === 'eraser') { ST.eraser = w; eraseAt(w); }
        else if (t === 'shape') { const sh = shapePts(SET.shape, ST.a, w); ST.snap = gStroke(ST.s, sh.p, sh.cl); }
        else if (t === 'select' || t === 'mind') moveSelect(w);
        else if (ST.tap && TAP && Math.hypot(ev.clientX - TAP.sx, ev.clientY - TAP.sy) > 9) ST.tap = false;
    }
    function endTool(w, e) {
        const s = ST; clearTimeout(s.holdT); ST = null;
        const t = s.tool;
        if (t === 'pen' || t === 'pencil' || t === 'hl') {
            let o = s.o;
            if (s.snap) o = s.snap;
            else {
                if (o.p.length === 1) o.p.push([o.p[0][0], o.p[0][1], o.p[0][2]]);
                if (SET.auto && o.p.length > 6 && o.k !== 'hl') {
                    const r = G.recognize(o.p.map((q) => [q[0], q[1]]));
                    if (r) { const rp = recPts(r); o = gStroke(o, rp.p, rp.cl); }
                }
            }
            push([addObj(o)]);
        } else if (t === 'eraser') {
            const list = s.hit; list.forEach((o) => { o._gone = false; });
            if (list.length) delObjs(list); else redraw();
        } else if (t === 'shape') {
            if (s.snap && G.pathLen(s.snap.p) * V.z > 14) push([addObj(s.snap)]);
        } else if (t === 'select' || t === 'mind') endSelect(s, w);
        else if (s.tap) tapAt(t, [TAP.x, TAP.y]);
        redrawLive();
    }
    function eraseAt(w) {
        const r = ST.er;
        for (const o of PG.objs) if (o.t === 's' && !o._gone && hitStroke(o, w[0], w[1], r)) { o._gone = true; ST.hit.push(o); redraw(); }
    }

    // ---------- select / lasso / move / scale ----------
    function beginSelect(tool, w) {
        const only = tool === 'mind' ? (o) => o.t === 'm' : null;
        ST = { tool };
        const b = selBox();
        if (tool === 'select' && b && canScale()) {
            const pad = 6 / V.z; if (Math.hypot(w[0] - (b.x2 + pad), w[1] - (b.y2 + pad)) < 20 / V.z) { ST.mode = 'scale'; ST.ax = b.x1; ST.ay = b.y1; ST.d0 = Math.max(1, Math.hypot(w[0] - b.x1, w[1] - b.y1)); begin(SEL); return; }
        }
        if (b && SEL.length && w[0] >= b.x1 - 8 / V.z && w[0] <= b.x2 + 8 / V.z && w[1] >= b.y1 - 8 / V.z && w[1] <= b.y2 + 8 / V.z && (!only || SEL.every(only))) {
            ST.mode = 'move'; ST.last = w; begin(withKids(SEL)); return;
        }
        const h = hitAt(w[0], w[1], only);
        if (h) { SEL = [h]; ST.mode = 'move'; ST.last = w; ST.fresh = h; begin(withKids(SEL)); optsRender(); return; }
        SEL = []; optsRender();
        if (tool === 'mind') { ST.mode = 'tapmind'; return; }
        ST.mode = 'lasso'; ST.lasso = [w];
        function begin(list) { ST.moveObjs = list; ST.moveBefore = list.map(clone); }
    }
    const withKids = (list) => { const s = new Set(list); list.forEach((o) => { if (o.t === 'm') kids(o).forEach((k) => s.add(k)); }); return [...s]; };
    function moveSelect(w) {
        if (ST.mode === 'lasso') { ST.lasso.push(w); return; }
        if (ST.mode === 'move') { const dx = w[0] - ST.last[0], dy = w[1] - ST.last[1]; ST.last = w; ST.moved = true; ST.moveObjs.forEach((o) => shift(o, dx, dy)); redraw(); }
        else if (ST.mode === 'scale') { const f = Math.max(0.1, Math.min(8, Math.hypot(w[0] - ST.ax, w[1] - ST.ay) / ST.d0)); ST.moveObjs.forEach((o, i) => { restore(o, ST.moveBefore[i]); scaleObj(o, ST.ax, ST.ay, f); }); ST.moved = true; redraw(); }
    }
    function endSelect(s, w) {
        if (s.mode === 'lasso') {
            const poly = s.lasso;
            if (poly.length < 5 || G.pathLen(poly) * V.z < 24) { SEL = []; }
            else SEL = PG.objs.filter((o) => {
                if (o._gone) return false;
                if (o.t === 's') { let n = 0; o.p.forEach((q) => { if (inPoly(q, poly)) n++; }); return n / o.p.length >= 0.5; }
                const b = bb(o); return inPoly([(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2], poly);
            });
            optsRender(); return;
        }
        if (s.mode === 'tapmind') {
            if (!PG.objs.some((o) => o.t === 'm')) newNode(null, [w[0], w[1]]);
            return;
        }
        if (s.mode === 'move' || s.mode === 'scale') {
            if (s.moved) {
                const ops = []; s.moveObjs.forEach((o, i) => { const a = s.moveBefore[i], b = clone(o); invalid(o); ops.push({ k: 'mod', o, a, b }); });
                push(ops);
            } else {
                // a tap on the already chosen thing: double tap edits it
                const now = performance.now(), o = s.fresh || (SEL.length === 1 ? SEL[0] : null);
                if (o && lastTap && lastTap.o === o && now - lastTap.t < 420 && o.t !== 's') { editText(o, false); lastTap = null; } else lastTap = { o, t: now };
                optsRender();
            }
        }
    }

    // ---------- text / sticky / mind ----------
    function tapAt(tool, w) {
        if (tool === 'text') {
            const h = hitAt(w[0], w[1], (o) => o.t === 't'); if (h) { editText(h, false); return; }
            editText({ t: 't', x: w[0], y: w[1] - TEXTSZ[SET.tsz] / 2, s: '', c: SET.col === '#ffffff' && lum(PG.col) > 0.5 ? '#111827' : SET.col, sz: TEXTSZ[SET.tsz] }, true);
        } else if (tool === 'sticky') {
            const h = hitAt(w[0], w[1], (o) => o.t === 'k'); if (h) { editText(h, false); return; }
            editText({ t: 'k', x: w[0] - 95, y: w[1] - 80, w: 190, h: 160, s: '', c: SET.stk }, true);
        }
    }
    function editText(o, isNew) {
        closeTa();
        rect = stageEl.getBoundingClientRect();
        const ta = document.createElement('textarea'); ta.className = 'nt-ta'; ta.dir = 'auto'; ta.value = o.s || ''; ta.setAttribute('autocomplete', 'off');
        const z = V.z;
        const place = () => {
            const b = o.t === 'm' ? { x1: o.x - (o.w || 100) / 2, y1: o.y - (o.h || 40) / 2, x2: o.x + (o.w || 100) / 2, y2: o.y + (o.h || 40) / 2 } : isNew ? { x1: o.x, y1: o.y, x2: o.x + (o.w || 140), y2: o.y + (o.h || o.sz * 1.4) } : bb(o);
            ta.style.left = b.x1 * z + V.x + 'px'; ta.style.top = b.y1 * z + V.y + 'px';
            ta.style.minWidth = Math.max(110, (b.x2 - b.x1) * z) + 'px';
            if (o.t === 'k') { ta.style.width = o.w * z + 'px'; ta.style.height = o.h * z + 'px'; ta.style.background = o.c; ta.style.fontSize = 17 * z + 'px'; ta.style.color = '#1f2937'; ta.style.padding = 12 * z + 'px'; }
            else if (o.t === 't') { ta.style.fontSize = o.sz * z + 'px'; ta.style.color = o.c; ta.style.background = 'rgba(255,255,255,.6)'; }
            else { ta.style.fontSize = 18 * z + 'px'; ta.style.color = '#111827'; ta.style.background = '#fff'; ta.style.textAlign = 'center'; ta.style.borderColor = o.c; }
        };
        place();
        stageEl.appendChild(ta); taEl = ta; ta.focus(); try { ta.select(); } catch (x) {}
        let done = false;
        const finish = () => {
            if (done) return; done = true; taEl = null;
            const v = ta.value.replace(/\s+$/, ''); ta.remove();
            if (o.t === 'm') return nodeDone(o, isNew, v);
            if (isNew) { if (v) { o.s = v; invalid(o); if (o.t === 'k') { o._d = null; } push([addObj(o)]); } return; }
            if (!v) { delObjs([o]); return; }
            if (v !== o.s) change([o], () => { o.s = v; });
        };
        ta.addEventListener('blur', finish);
        ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ta.value = isNew ? '' : o.s; ta.blur(); } else if (e.key === 'Enter' && !e.shiftKey && o.t === 'm') { e.preventDefault(); ta.blur(); } });
    }
    function closeTa() { if (taEl) taEl.blur(); }
    function rootOf(o) { let q = o, g = 0; while (q && q.p && g++ < 60) q = PG.objs.find((x) => x.t === 'm' && x.id === q.p); return q; }
    function newNode(parent, at) {
        const root = !parent;
        const o = { t: 'm', id: uid(), p: parent ? parent.id : '', x: at[0], y: at[1], w: 100, h: 40, s: '', c: root ? '#0f766e' : BRANCH[0], r: root ? 1 : 0 };
        if (parent) {
            const top = rootOf(parent), par = parent;
            if (par.r) { const nk = PG.objs.filter((q) => q.t === 'm' && q.p === par.id).length; o.c = BRANCH[nk % BRANCH.length]; } else o.c = par.c;
            o.x = parent.x + (parent.x >= (top ? top.x : parent.x) ? 160 : -160); o.y = parent.y;
        }
        editText(o, true);
    }
    function nodeDone(o, isNew, v) {
        if (isNew && !v) return;
        if (isNew) {
            o.s = v; nodeSize(o); PG.objs.push(o);
            const ops = [{ k: 'add', o, i: PG.objs.length - 1 }];
            relayout(rootOf(o), ops, o); SEL = [o]; push(ops);
        } else if (v && v !== o.s) {
            const before = [clone(o)]; o.s = v; nodeSize(o);
            const ops = [{ k: 'mod', o, a: before[0], b: clone(o) }]; relayout(rootOf(o), ops, null); push(ops);
        } else if (!v) {
            delNode(o);
        }
    }
    function relayout(root, ops, skip) {
        if (!root) return;
        const all = [root].concat(kids(root));
        const pos = G.mindLayout(all.map((n) => ({ id: n.id, p: n.p, w: n.w, h: n.h })), root.id);
        all.forEach((n) => {
            if (n === root || !pos[n.id]) return;
            const nx = root.x + pos[n.id][0], ny = root.y + pos[n.id][1];
            if (Math.abs(nx - n.x) < 0.5 && Math.abs(ny - n.y) < 0.5) return;
            if (n === skip) { n.x = nx; n.y = ny; n._b = null; return; }
            const a = clone(n); n.x = nx; n.y = ny; n._b = null; ops.push({ k: 'mod', o: n, a, b: clone(n) });
        });
    }
    function delNode(o) { delObjs([o].concat(kids(o))); }

    // ---------- selection actions ----------
    const A = {
        del() { const l = SEL.slice(); const all = new Set(); l.forEach((o) => { all.add(o); if (o.t === 'm') kids(o).forEach((k) => all.add(k)); }); delObjs([...all]); },
        dup() {
            const src = withKids(SEL), map = {}, copies = src.map((o) => { const c = clone(o); if (c.t === 'm') { map[o.id] = uid(); } return c; });
            src.forEach((o, i) => { const c = copies[i]; if (c.t === 'm') { c.id = map[o.id]; c.p = map[o.p] || ''; if (!map[o.p]) c.r = c.r; } shift(c, 28, 28); });
            const ops = copies.map((c) => addObj(c)); SEL = copies; push(ops);
        },
        edit() { const o = SEL[0]; if (o && o.t !== 's') editText(o, false); },
        col(c) { const l = SEL; if (!l.length) return; change(l, () => l.forEach((o) => { if (o.t === 's' && o.k === 'hl') o.c = HLC.includes(c) ? c : o.c; else o.c = c; })); },
        child() { const o = SEL[0]; if (o && o.t === 'm') newNode(o, [o.x, o.y]); },
        sib() { const o = SEL[0]; if (o && o.t === 'm') { const par = PG.objs.find((q) => q.t === 'm' && q.id === o.p); if (par) newNode(par, [par.x, par.y]); else app.showToast('الجذر ما إله أخ، اضغط فرع'); } },
        tidy() { const o = SEL[0] || PG.objs.find((q) => q.t === 'm' && q.r); const r = o && rootOf(o); if (!r) return; const ops = []; relayout(r, ops, null); push(ops); },
        root() { const c = toW(W / 2, Hh / 2); newNode(null, c); },
    };

    // ---------- toolbar / options ----------
    function toolsRender() {
        const bar = $('ntBar'); if (!bar) return;
        bar.innerHTML = TOOLS.map(([id, t, ic]) => `<button class="nt-tb${SET.tool === id ? ' on' : ''}" onclick="app.ntTool('${id}')" aria-label="${t}"><i data-lucide="${ic}"></i><span>${t}</span></button>`).join('');
        try { lucide.createIcons(); } catch (e) {}
    }
    const dotRow = (list, cur, fn) => list.map((c) => `<button class="nt-c${c === cur ? ' on' : ''}" style="background:${c}" onclick="${fn}('${c}')" aria-label="لون"></button>`).join('');
    const sizeRow = (key, n) => [0, 1, 2].map((i) => `<button class="nt-s${SET.sz[key] === i ? ' on' : ''}" onclick="app.ntSize('${key}',${i})" aria-label="حجم"><i style="width:${6 + i * 5}px;height:${6 + i * 5}px"></i></button>`).join('');
    function optsRender() {
        const el = $('ntOpts'); if (!el) return;
        const t = SET.tool; let h = '';
        const sel = SEL.length ? SEL : null;
        if ((t === 'select' || t === 'mind') && sel) {
            const one = sel.length === 1 ? sel[0] : null, isNode = one && one.t === 'm';
            h += `<button class="nt-a" onclick="app.ntAct('del')"><i data-lucide="trash-2"></i>حذف</button><button class="nt-a" onclick="app.ntAct('dup')"><i data-lucide="copy"></i>نسخ</button>`;
            if (one && one.t !== 's') h += `<button class="nt-a" onclick="app.ntAct('edit')"><i data-lucide="pencil-line"></i>تعديل</button>`;
            if (isNode) h += `<button class="nt-a pri" onclick="app.ntAct('child')"><i data-lucide="git-branch-plus"></i>فرع</button><button class="nt-a" onclick="app.ntAct('sib')"><i data-lucide="corner-down-right"></i>أخ</button><button class="nt-a" onclick="app.ntAct('tidy')"><i data-lucide="wand-2"></i>ترتيب</button>`;
            h += `<span class="nt-sep"></span>` + dotRow(isNode ? BRANCH : sel.every((o) => o.t === 's' && o.k === 'hl') ? HLC : sel.some((o) => o.t === 'k') ? STK : COLS, '', 'app.ntSelCol');
        } else if (t === 'pen' || t === 'pencil') h = dotRow(COLS, SET.col, 'app.ntCol') + '<span class="nt-sep"></span>' + sizeRow(t);
        else if (t === 'hl') h = dotRow(HLC, SET.hlc, 'app.ntHlc') + '<span class="nt-sep"></span>' + sizeRow('hl');
        else if (t === 'eraser') h = '<span class="nt-hint">يمسح الخط كله بلمسة وحدة</span><span class="nt-sep"></span>' + sizeRow('eraser');
        else if (t === 'shape') h = SHAPES.map(([id, n, ic]) => `<button class="nt-a${SET.shape === id ? ' pri' : ''}" onclick="app.ntShape('${id}')"><i data-lucide="${ic}"></i>${n}</button>`).join('') + '<span class="nt-sep"></span>' + dotRow(COLS, SET.col, 'app.ntCol') + sizeRow('shape');
        else if (t === 'text') h = dotRow(COLS, SET.col, 'app.ntCol') + '<span class="nt-sep"></span>' + [0, 1, 2].map((i) => `<button class="nt-s${SET.tsz === i ? ' on' : ''}" onclick="app.ntTsz(${i})"><b style="font-size:${12 + i * 5}px">أ</b></button>`).join('') + '<span class="nt-hint">اضغط وين تريد تكتب</span>';
        else if (t === 'sticky') h = dotRow(STK, SET.stk, 'app.ntStk') + '<span class="nt-hint">اضغط وين تريد الورقة</span>';
        else if (t === 'mind') h = `<button class="nt-a pri" onclick="app.ntAct('root')"><i data-lucide="plus"></i>فكرة رئيسية</button><span class="nt-hint">${PG && PG.objs.some((o) => o.t === 'm') ? 'اضغط عقدة وبعدين فرع' : 'اضغط الورقة لتبدأ الخريطة'}</span>`;
        else if (t === 'select') h = '<span class="nt-hint">اسحب حول الرسم لتحديده، أو اضغط عليه</span>';
        else if (t === 'hand') h = '<span class="nt-hint">اسحب لتحريك الصفحة، وبإصبعين تكبّر وتصغّر</span>';
        el.innerHTML = h; try { lucide.createIcons(); } catch (e) {}
    }

    // ---------- save / thumbnail / export ----------
    function contentBox(pg) {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        pg.objs.forEach((o) => { const b = bb(o); x1 = Math.min(x1, b.x1); y1 = Math.min(y1, b.y1); x2 = Math.max(x2, b.x2); y2 = Math.max(y2, b.y2); });
        return x1 === Infinity ? null : { x1, y1, x2, y2 };
    }
    function snapshot(pg, maxSide, type, pad) {
        const b = contentBox(pg) || { x1: -200, y1: -150, x2: 200, y2: 150 };
        pad = pad == null ? 30 : pad;
        const bw = b.x2 - b.x1 + pad * 2, bh = b.y2 - b.y1 + pad * 2, s = Math.min(2.5, maxSide / Math.max(bw, bh));
        const c = document.createElement('canvas'); const od = dpr; dpr = 1;
        const w = Math.max(40, Math.round(bw * s)), h = Math.max(40, Math.round(bh * s)); c.width = w; c.height = h;
        const x = c.getContext('2d'); renderPage(x, pg, w, h, { x: (-b.x1 + pad) * s, y: (-b.y1 + pad) * s, z: s });
        dpr = od; return c;
    }
    async function saveNow() {
        clearTimeout(saveT); if (!N || !dirty) return;
        dirty = false;
        try { PG.v = { x: Math.round(V.x), y: Math.round(V.y), z: Math.round(V.z * 100) / 100 }; N.ts = Date.now(); N.th = snapshot(N.pages[0], 360, 'jpeg').toDataURL('image/jpeg', 0.6); } catch (e) {}
        const ok = await Store.put(N);
        if (!ok) app.showToast('ما انحفظ الدفتر، المساحة ممتلئة؟');
        const i = NOTES.findIndex((x) => x.id === N.id); if (i < 0) NOTES.unshift(N);
    }
    async function exportPage() {
        const c = snapshot(PG, 2400, 'png', 40);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        if (!blob) { app.showToast('ما قدرت أسوي الصورة'); return; }
        const name = 'notebook-' + new Date().toISOString().slice(0, 10) + '-p' + (N.pages.indexOf(PG) + 1) + '.png';
        try {
            const f = new File([blob], name, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: N.title || 'دفتر' }); return; }
        } catch (e) { if (e && e.name === 'AbortError') return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        app.showToast('نزلت الصورة');
    }

    // ---------- the editor screen ----------
    function edBuild() {
        $('ntEd')?.remove();
        const d = document.createElement('div'); d.id = 'ntEd'; d.className = 'nt-ed';
        d.innerHTML = `<div class="nt-top">
            <button class="nt-ib" onclick="app.ntBack()" aria-label="رجوع"><i data-lucide="chevron-right"></i></button>
            <input id="ntTitle" class="nt-title" maxlength="60" placeholder="اسم الدفتر" oninput="app.ntTitle(this.value)">
            <button class="nt-ib" id="ntUndo" onclick="app.ntUndo()" aria-label="تراجع"><i data-lucide="undo-2"></i></button>
            <button class="nt-ib" id="ntRedo" onclick="app.ntRedo()" aria-label="إعادة"><i data-lucide="redo-2"></i></button>
            <button class="nt-pg" id="ntPgBtn" onclick="app.ntPages()"><i data-lucide="layers"></i><span id="ntPgN">1/1</span></button>
            <button class="nt-ib" onclick="app.ntMenu()" aria-label="المزيد"><i data-lucide="more-horizontal"></i></button>
        </div>
        <div class="nt-stage" id="ntStage"><canvas id="ntBase"></canvas><canvas id="ntLive"></canvas><button class="nt-zoom" id="ntZoom" onclick="app.ntFit()">100%</button></div>
        <div class="nt-opts" id="ntOpts"></div>
        <div class="nt-bar" id="ntBar"></div>`;
        document.body.appendChild(d);
        stageEl = $('ntStage'); baseC = $('ntBase'); liveC = $('ntLive');
        bctx = baseC.getContext('2d'); try { lctx = liveC.getContext('2d', { desynchronized: true }); } catch (e) { lctx = null; } if (!lctx) lctx = liveC.getContext('2d');
        stageEl.addEventListener('pointerdown', onDown); stageEl.addEventListener('pointermove', onMove);
        stageEl.addEventListener('pointerup', onUp); stageEl.addEventListener('pointercancel', onUp);
        stageEl.addEventListener('wheel', onWheel, { passive: false });
        stageEl.addEventListener('contextmenu', (e) => e.preventDefault());
        ro = new ResizeObserver(sizeCanvas); ro.observe(stageEl);
        document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKeyUp);
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('pagehide', onHide);
    }
    function sizeCanvas() {
        if (!stageEl) return;
        const r = stageEl.getBoundingClientRect(); if (!r.width) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2.5); W = r.width; Hh = r.height; rect = r;
        [baseC, liveC].forEach((c) => { c.width = Math.round(W * dpr); c.height = Math.round(Hh * dpr); c.style.width = W + 'px'; c.style.height = Hh + 'px'; });
        redraw(); redrawLive();
    }
    function onHide() { if (document.visibilityState === 'hidden' || !document.visibilityState) saveNow(); }
    function onKey(e) {
        if (!$('ntEd') || (taEl && e.target === taEl) || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
        const k = e.key.toLowerCase();
        if (e.key === ' ') { spaceDown = true; e.preventDefault(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
        else if ((e.key === 'Delete' || e.key === 'Backspace') && SEL.length) { e.preventDefault(); A.del(); }
        else if (e.key === 'Escape') { SEL = []; optsRender(); redrawLive(); }
    }
    function onKeyUp(e) { if (e.key === ' ') spaceDown = false; }
    function pageLabel() { const p = $('ntPgN'); if (p) p.textContent = (N.pages.indexOf(PG) + 1) + '/' + N.pages.length; }
    function showPage(i) {
        closeTa(); if (PG) PG.v = { x: V.x, y: V.y, z: V.z };
        PG = N.pages[i]; V = PG.v ? { x: PG.v.x, y: PG.v.y, z: PG.v.z } : { x: (W || 360) / 2, y: (Hh || 600) / 3, z: 1 };
        if (!PG.v) { const b = contentBox(PG); if (b) { V.x = (W || 360) / 2 - ((b.x1 + b.x2) / 2) * V.z; V.y = (Hh || 600) / 2 - ((b.y1 + b.y2) / 2) * V.z; } }
        H = { u: [], r: [] }; SEL = []; ST = null; pageLabel(); histBtns(); optsRender(); redraw(); redrawLive();
    }
    function newPage(bg, col) { return { id: uid(), bg: bg || 'ruled', col: col || '#ffffff', objs: [], v: null }; }

    // ---------- sheets ----------
    function sheet(html) {
        $('ntSheet')?.remove();
        const w = document.createElement('div'); w.id = 'ntSheet'; w.className = 'tu-sheetw nt-sheetw';
        w.innerHTML = `<div class="tu-sbd" onclick="app.ntSheetClose()"></div><div class="tu-sheet"><div class="tu-grab"></div>${html}</div>`;
        document.body.appendChild(w); try { lucide.createIcons(); } catch (e) {}
        requestAnimationFrame(() => w.classList.add('on'));
    }
    const paperChips = (cur, fn) => PAPERS.map(([id, n]) => `<button class="nt-pp${cur === id ? ' on' : ''}" onclick="${fn}('${id}')"><i class="nt-pv nt-pv-${id}"></i>${n}</button>`).join('');
    const pcolChips = (cur, fn) => PCOL.map((c) => `<button class="nt-c${cur === c ? ' on' : ''}" style="background:${c};border-color:#9ca3af" onclick="${fn}('${c}')" aria-label="لون الورقة"></button>`).join('');

    const nowNew = { bg: 'ruled', col: '#ffffff' };
    // ---------- the list of notebooks ----------
    function listRender() {
        const el = $('ntList'); if (!el) return;
        const items = NOTES.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
        const date = (t) => { try { return new Date(t).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short' }); } catch (e) { return ''; } };
        el.innerHTML = `<button class="nt-new" onclick="app.ntNewSheet()"><i data-lucide="plus"></i><span>دفتر جديد</span></button>` +
            (items.length ? `<div class="nt-grid">${items.map((n) => `<div class="nt-card" onclick="app.ntOpenNote('${n.id}')"><div class="nt-th">${n.th ? `<img alt="" src="${n.th}">` : '<i data-lucide="notebook-pen"></i>'}</div><div class="nt-ct"><b>${esc(n.title || 'دفتر بدون اسم')}</b><small>${n.pages.length} ${n.pages.length === 1 ? 'صفحة' : 'صفحات'} - ${date(n.ts)}</small></div><button class="nt-dots" onclick="event.stopPropagation();app.ntNoteMenu('${n.id}')" aria-label="خيارات"><i data-lucide="more-horizontal"></i></button></div>`).join('')}</div>` :
                `<div class="nt-empty"><i data-lucide="pen-tool"></i><b>دفترك الأول يبدي من هنا</b><p>اكتب بالقلم أو بإصبعك، ارسم، سوّي خرائط ذهنية وأوراق لاصقة، وكل شي ينحفظ بجهازك.</p></div>`);
        try { lucide.createIcons(); } catch (e) {}
    }
    function openNote(n) {
        N = n; dirty = false; H = { u: [], r: [] }; SEL = []; PG = null;
        if (!N.pages || !N.pages.length) N.pages = [newPage()];
        edBuild(); $('ntTitle').value = N.title || ''; toolsRender(); sizeCanvas();
        requestAnimationFrame(() => { sizeCanvas(); showPage(0); });
        const nb = $('ntEd'); if (nb) nb.classList.add('on');
    }
    function closeEd() {
        closeTa(); clearTimeout(saveT);
        const p = saveNow();
        document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide);
        try { ro && ro.disconnect(); } catch (e) {} ro = null;
        $('ntSheet')?.remove(); $('ntEd')?.remove();
        stageEl = baseC = liveC = bctx = lctx = null; ST = null; ptrs.clear(); MODE = ''; PG = null;
        return p;
    }

    Object.assign(app, {
        async ntOpen() {
            const el = $('ntList'); if (!el) return;
            el.innerHTML = '<div class="nt-empty"><b>لحظة...</b></div>';
            NOTES = await Store.all(); listRender();
        },
        // leaving the page
        ntClose() { if ($('ntEd')) closeEd(); },
        ntHasEditor() { return !!$('ntEd'); },
        ntBack() { if ($('ntSheet')) { this.ntSheetClose(); return; } closeEd().then(() => { N = null; this.ntOpen(); }); },
        ntSheetClose() { const w = $('ntSheet'); if (!w) return; w.classList.remove('on'); setTimeout(() => w.remove(), 250); },
        ntTitle(v) { if (N) { N.title = v; dirty = true; clearTimeout(saveT); saveT = setTimeout(saveNow, 1200); } },
        ntNewSheet() {
            nowNew.bg = nowNew.bg || 'ruled';
            const draw = () => { const el = $('ntNewBody'); if (!el) return; el.innerHTML = `<div class="nt-lbl">نوع الورقة</div><div class="nt-pps">${paperChips(nowNew.bg, 'app.ntNewBg')}</div><div class="nt-lbl">لون الورقة</div><div class="nt-cols">${pcolChips(nowNew.col, 'app.ntNewCol')}</div>`; };
            sheet(`<div class="tu-sh"><b>دفتر جديد</b><button onclick="app.ntSheetClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div><div id="ntNewBody"></div><button class="tu-btn wide" onclick="app.ntCreate(false)"><i data-lucide="pen-tool"></i>ابدأ الكتابة</button><button class="tu-btn wide nt-alt" onclick="app.ntCreate(true)"><i data-lucide="network"></i>ابدأ بخريطة ذهنية</button>`);
            this._ntNewDraw = draw; draw();
        },
        ntNewBg(id) { nowNew.bg = id; this._ntNewDraw && this._ntNewDraw(); },
        ntNewCol(c) { nowNew.col = c; this._ntNewDraw && this._ntNewDraw(); },
        ntCreate(mind) {
            this.ntSheetClose();
            const n = { id: uid(), title: '', ts: Date.now(), pages: [newPage(nowNew.bg, nowNew.col)], th: '' };
            if (mind) { n.pages[0].bg = 'blank'; SET.tool = 'mind'; } else if (SET.tool === 'mind') SET.tool = 'pen';
            dirty = true; openNote(n);
            if (mind) setTimeout(() => { const c = toW(W / 2, Hh / 2); newNode(null, c); }, 450);
        },
        ntOpenNote(id) { const n = NOTES.find((x) => x.id === id); if (n) { openNote(n); } },
        ntNoteMenu(id) {
            const n = NOTES.find((x) => x.id === id); if (!n) return;
            sheet(`<div class="tu-sh"><b>${esc(n.title || 'دفتر بدون اسم')}</b><button onclick="app.ntSheetClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div>
                <button class="nt-row" onclick="app.ntDup('${id}')"><i data-lucide="copy"></i>نسخ الدفتر</button>
                <button class="nt-row" onclick="app.ntDelAsk('${id}')" style="color:#dc2626"><i data-lucide="trash-2"></i>حذف الدفتر</button>`);
        },
        async ntDup(id) {
            this.ntSheetClose(); const n = NOTES.find((x) => x.id === id); if (!n) return;
            const c = clone(n); c.id = uid(); c.title = (n.title || 'دفتر') + ' (نسخة)'; c.ts = Date.now(); c.pages.forEach((p) => { p.id = uid(); });
            await Store.put(c); NOTES.unshift(c); listRender(); this.showToast('انعمل نسخة');
        },
        ntDelAsk(id) {
            this.ntSheetClose();
            setTimeout(() => sheet(`<div class="tu-sh"><b>حذف الدفتر؟</b></div><p style="color:var(--text2);margin:8px 0 14px">الدفتر ينمسح من جهازك نهائياً وما ترجعه.</p><button class="tu-btn wide" style="background:#dc2626" onclick="app.ntDel('${id}')"><i data-lucide="trash-2"></i>نعم احذف</button><button class="tu-btn wide nt-alt" onclick="app.ntSheetClose()">لا</button>`), 280);
        },
        async ntDel(id) { this.ntSheetClose(); await Store.del(id); NOTES = NOTES.filter((x) => x.id !== id); listRender(); },
        // editor actions
        ntTool(id) { closeTa(); SET.tool = id; if (id !== 'select' && id !== 'mind') SEL = []; setSave(); toolsRender(); optsRender(); redrawLive(); },
        ntCol(c) { SET.col = c; setSave(); optsRender(); },
        ntHlc(c) { SET.hlc = c; setSave(); optsRender(); },
        ntStk(c) { SET.stk = c; setSave(); optsRender(); },
        ntSize(k, i) { SET.sz[k] = i; setSave(); optsRender(); },
        ntTsz(i) { SET.tsz = i; setSave(); optsRender(); },
        ntShape(id) { SET.shape = id; setSave(); optsRender(); },
        ntSelCol(c) { A.col(c); },
        ntAct(a) { if (A[a]) A[a](); },
        ntUndo() { undo(); }, ntRedo() { redo(); },
        ntFit() {
            const b = contentBox(PG);
            if (!b) { V = { x: W / 2, y: Hh / 3, z: 1 }; } else {
                const z = Math.max(0.15, Math.min(2, Math.min((W - 40) / (b.x2 - b.x1 || 1), (Hh - 40) / (b.y2 - b.y1 || 1))));
                V = { z, x: W / 2 - ((b.x1 + b.x2) / 2) * z, y: Hh / 2 - ((b.y1 + b.y2) / 2) * z };
            }
            redraw();
        },
        ntPages() {
            const draw = () => {
                const el = $('ntPgBody'); if (!el) return;
                el.innerHTML = `<div class="nt-pgs">${N.pages.map((p, i) => `<button class="nt-pgc${p === PG ? ' on' : ''}" onclick="app.ntGo(${i})">${i + 1}</button>`).join('')}<button class="nt-pgc add" onclick="app.ntAddPage()" aria-label="صفحة جديدة"><i data-lucide="plus"></i></button></div>
                    <div class="nt-lbl">ورقة هذي الصفحة</div><div class="nt-pps">${paperChips(PG.bg, 'app.ntBg')}</div><div class="nt-lbl">لون الورقة</div><div class="nt-cols">${pcolChips(PG.col, 'app.ntPcol')}</div>
                    ${N.pages.length > 1 ? '<button class="nt-row" onclick="app.ntDelPage()" style="color:#dc2626"><i data-lucide="trash-2"></i>حذف هذي الصفحة</button>' : ''}`;
                try { lucide.createIcons(); } catch (e) {}
            };
            sheet(`<div class="tu-sh"><b>الصفحات والورق</b><button onclick="app.ntSheetClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div><div id="ntPgBody"></div>`);
            this._ntPgDraw = draw; draw();
        },
        ntGo(i) { showPage(i); this._ntPgDraw && this._ntPgDraw(); },
        ntAddPage() { const p = newPage(PG.bg, PG.col); N.pages.splice(N.pages.indexOf(PG) + 1, 0, p); mark(); showPage(N.pages.indexOf(p)); this._ntPgDraw && this._ntPgDraw(); },
        ntDelPage() { if (N.pages.length < 2) return; const i = N.pages.indexOf(PG); N.pages.splice(i, 1); PG = null; mark(); showPage(Math.max(0, i - 1)); this._ntPgDraw && this._ntPgDraw(); },
        ntBg(id) { PG.bg = id; mark(); redraw(); this._ntPgDraw && this._ntPgDraw(); },
        ntPcol(c) { PG.col = c; mark(); redraw(); this._ntPgDraw && this._ntPgDraw(); },
        ntMenu() {
            const draw = () => {
                const el = $('ntMenuBody'); if (!el) return;
                const chip = (k, v, n) => `<button class="nt-pp${SET[k] === v ? ' on' : ''}" onclick="app.ntSet('${k}','${v}')">${n}</button>`;
                el.innerHTML = `<button class="nt-row" onclick="app.ntExport()"><i data-lucide="share-2"></i>حفظ الصفحة صورة / مشاركة</button>
                    <button class="nt-row" onclick="app.ntClear()"><i data-lucide="eraser"></i>مسح كل الصفحة</button>
                    <div class="nt-lbl">الإصبع</div><div class="nt-pps">${chip('finger', 'auto', 'تلقائي')}${chip('finger', 'yes', 'يرسم')}${chip('finger', 'no', 'يحرّك بس (قلم فقط)')}</div>
                    <div class="nt-lbl">تقويم الخط</div>
                    <button class="nt-row" onclick="app.ntTog('hold')"><i data-lucide="${SET.hold !== false ? 'check-square' : 'square'}"></i>ثبّت القلم لحظة بعد الرسم ويتقوّم الخط (مستقيم، دائرة، مستطيل...)</button>
                    <button class="nt-row" onclick="app.ntTog('auto')"><i data-lucide="${SET.auto ? 'check-square' : 'square'}"></i>تقويم تلقائي بعد رفع القلم (قد يغيّر خط يدك بالكتابة)</button>`;
                try { lucide.createIcons(); } catch (e) {}
            };
            sheet(`<div class="tu-sh"><b>خيارات الدفتر</b><button onclick="app.ntSheetClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div><div id="ntMenuBody"></div>`);
            this._ntMenuDraw = draw; draw();
        },
        ntSet(k, v) { SET[k] = v; setSave(); this._ntMenuDraw && this._ntMenuDraw(); },
        ntTog(k) { SET[k] = k === 'hold' ? SET.hold === false : !SET[k]; setSave(); this._ntMenuDraw && this._ntMenuDraw(); },
        ntClear() {
            if (!PG.objs.length) return; this.ntSheetClose();
            const all = PG.objs.slice(); setTimeout(() => delObjs(all), 100); this.showToast('انمسحت الصفحة. تكدر تتراجع');
        },
        ntExport() { this.ntSheetClose(); exportPage(); },
    });
    // test hooks
    window.__nt = { get PG() { return PG; }, get V() { return V; }, get N() { return N; }, SET, Store, undo, redo };
})();
