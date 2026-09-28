// Dreams sky engine: loaded on demand by app._need('dreams') the first time its page opens.
        // ===== "سما الأحلام": animated sky of students' dreams =====
        // A canvas paints the night (gradient sky, twinkling stars, aurora ribbons, drifting dust,
        // shooting stars, particle bursts); dreams are DOM cards on top (crisp Arabic text, tappable)
        // moved every frame by one of four scenes that take turns:
        //   lanterns  - warm lanterns rising and swaying at different depths
        //   bubbles   - iridescent bubbles drifting, bouncing and popping into the next dream
        //   stars     - dreams become stars that light up one by one and draw a constellation
        //   spotlight - one dream at a time assembled from particles, then blown away upward
        class DreamSky {
            constructor(root, onPick) {
                this.root = root;
                this.onPick = onPick;
                this.cv = root.querySelector('canvas');
                this.ctx = this.cv.getContext('2d');
                this.layer = root.querySelector('.dr-layer');
                this.pool = [];
                this.idx = 0;
                this.items = [];
                this.sparks = [];
                this.shoot = [];
                this.parts = [];
                this.modes = ['lanterns', 'bubbles', 'stars', 'spotlight'];
                this.mode = 'lanterns';
                this.modeAt = 0;
                this.auto = true;
                this.stars = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random() * 0.85, r: Math.random() * 1.3 + 0.3, p: Math.random() * 6.28, s: 0.6 + Math.random() * 1.8 }));
                this.dust = Array.from({ length: 45 }, () => ({ x: Math.random(), y: Math.random(), v: 0.004 + Math.random() * 0.012, r: Math.random() * 1.6 + 0.4, p: Math.random() * 6.28 }));
                this.layer.addEventListener('click', (e) => {
                    const el = e.target.closest('[data-dream]');
                    if (el) this.onPick(el.getAttribute('data-dream'));
                });
            }

            setPool(list) {
                const had = this.pool.length;
                this.pool = list;
                if (!had && list.length) this._enter(this.mode, performance.now() / 1000);
            }

            _next() {
                if (!this.pool.length) return null;
                const d = this.pool[this.idx % this.pool.length];
                this.idx++;
                return d;
            }

            setMode(m, manual) {
                if (this.modes.indexOf(m) === -1) return;
                if (manual) { this.auto = false; this.manualAt = performance.now(); }
                this._enter(m, performance.now() / 1000);
            }

            _clearItems() {
                this.items.forEach((it) => it.el && it.el.remove());
                if (this.constel) this.constel.pts.forEach((p) => p.el && p.el.remove());
                if (this.spot && this.spot.el) this.spot.el.remove();
                this.items = [];
                this.parts = [];
                this.constel = null;
                this.spot = null;
            }

            _enter(m, now) {
                this._clearItems();
                this.mode = m;
                this.modeAt = now;
                this.root.setAttribute('data-mode', m);
                if (this.onMode) this.onMode(m);
                if (m === 'stars') this._initStars(now);
                if (m === 'bubbles') for (let i = 0; i < 5; i++) this._spawnBubble(now, i);
                if (m === 'lanterns') { this.nextSpawn = now; for (let i = 0; i < 4; i++) this._spawnLantern(now, true); }
                if (m === 'spotlight') this.spot = { phase: 'idle', t: now };
            }

            // Shows one specific dream right away as the big particle dream (after posting one).
            featured(d) {
                this._enter('spotlight', performance.now() / 1000);
                this.forced = d;
                this.auto = false;
                this.manualAt = performance.now();
            }

            _card(d, cls) {
                const el = document.createElement('button');
                el.className = 'dr-card ' + cls;
                el.setAttribute('data-dream', d.id);
                el.innerHTML = `<span class="dr-t">${escapeHtml(d.t)}</span><small>${escapeHtml(d.by)}</small>`;
                this.layer.appendChild(el);
                return el;
            }

            _spawnLantern(now, scatter) {
                const d = this._next();
                if (!d) return;
                const W = this.W, H = this.H;
                const depth = 0.62 + Math.random() * 0.45;
                const el = this._card(d, 'dr-lan');
                const w = Math.min(W * 0.62, 150 + d.t.length * 2.2) * depth;
                el.style.width = w + 'px';
                this.items.push({ el, kind: 'lan', x: 16 + Math.random() * Math.max(10, W - w - 32), y: scatter ? H * (0.25 + Math.random() * 0.7) : H + 30, v: 16 + depth * 26, depth, ph: Math.random() * 6.28, w, born: now });
            }

            _spawnBubble(now, i) {
                const d = this._next();
                if (!d) return;
                const W = this.W, H = this.H;
                const r = Math.min(W * 0.2, 64 + Math.min(40, d.t.length * 0.5));
                const el = this._card(d, 'dr-bub');
                el.style.width = el.style.height = r * 2 + 'px';
                // Picks the free spot farthest from the other bubbles, so they don't pile up.
                let bx = 0, by = 0, best = -1;
                for (let k = 0; k < 14; k++) {
                    const cx = 4 + Math.random() * Math.max(1, W - r * 2 - 8), cy = 70 + Math.random() * Math.max(1, H - r * 2 - 220);
                    const dmin = this.items.reduce((m, o) => Math.min(m, Math.hypot(o.x + o.r - cx - r, o.y + o.r - cy - r) - o.r - r), 1e9);
                    if (dmin > best) { best = dmin; bx = cx; by = cy; }
                }
                const a = Math.random() * 6.28;
                this.items.push({ el, kind: 'bub', x: bx, y: by, vx: Math.cos(a) * (18 + Math.random() * 22), vy: Math.sin(a) * (14 + Math.random() * 18) - 6, r, ph: Math.random() * 6.28, born: now + (i || 0) * 0.12, life: 7 + Math.random() * 5 });
            }

            _initStars(now) {
                const W = this.W, H = this.H, n = Math.min(12, Math.max(1, this.pool.length));
                const pts = [];
                const cols = 3, rows = Math.ceil(n / cols);
                for (let i = 0; i < n; i++) {
                    const c = i % cols, r = Math.floor(i / cols);
                    pts.push({ x: W * (0.16 + (c + 0.5) / cols * 0.68) + (Math.random() - 0.5) * W * 0.16, y: H * (0.14 + (r + 0.5) / Math.max(rows, 1) * 0.6) + (Math.random() - 0.5) * H * 0.08, d: this._next(), on: 0, el: null });
                }
                this.constel = { pts, k: 0, next: now + 0.6, lines: [] };
            }

            _burst(x, y, color, n) {
                for (let i = 0; i < (n || 26); i++) {
                    const a = Math.random() * 6.28, s = 40 + Math.random() * 160;
                    this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: 0.7 + Math.random() * 0.6, t: 0, c: color || [255, 214, 140] });
                }
            }

            _textTargets(text) {
                const W = this.W, H = this.H, dpr = 1;
                const oc = document.createElement('canvas');
                oc.width = W; oc.height = H;
                const x = oc.getContext('2d');
                const size = Math.max(22, Math.min(34, W / 12));
                x.font = `800 ${size}px "Readex Pro", Tahoma, sans-serif`;
                x.direction = 'rtl'; x.textAlign = 'center'; x.fillStyle = '#fff';
                const words = String(text).split(/\s+/), lines = []; let cur = '';
                words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > W * 0.8 && cur) { lines.push(cur); cur = w; } else cur = t; });
                if (cur) lines.push(cur);
                const lh = size * 1.45, top = H * 0.42 - (lines.length * lh) / 2;
                lines.slice(0, 5).forEach((l, i) => x.fillText(l, W / 2, top + i * lh + size));
                const data = x.getImageData(0, 0, W, H).data, pts = [];
                let step = 3;
                for (; step < 9; step++) { let c = 0; for (let yy = 0; yy < H; yy += step) for (let xx = 0; xx < W; xx += step) if (data[(yy * W + xx) * 4 + 3] > 140) c++; if (c < 1500) break; }
                for (let yy = 0; yy < H; yy += step) for (let xx = 0; xx < W; xx += step) if (data[(yy * W + xx) * 4 + 3] > 140) pts.push([xx, yy]);
                return { pts, top, lh, size, lines: Math.min(5, lines.length) };
            }

            frame(ts) {
                const now = ts / 1000;
                const cv = this.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
                const W = this.root.clientWidth, H = this.root.clientHeight;
                if (!W || !H) return;
                if (this.W !== W || this.H !== H) { this.W = W; this.H = H; cv.width = W * dpr; cv.height = H * dpr; if (this.pool.length) this._enter(this.mode, now); }
                const dt = Math.min(0.05, now - (this.last || now));
                this.last = now;
                if (!this.auto && this.manualAt && performance.now() - this.manualAt > 60000) this.auto = true;
                if (this.auto && this.pool.length && now - this.modeAt > (this.mode === 'spotlight' ? 26 : 20)) this._enter(this.modes[(this.modes.indexOf(this.mode) + 1) % this.modes.length], now);
                const x = this.ctx;
                x.setTransform(dpr, 0, 0, dpr, 0, 0);
                this._sky(x, W, H, now);
                if (this.pool.length) {
                    if (this.mode === 'lanterns') this._lanterns(now, dt);
                    else if (this.mode === 'bubbles') this._bubbles(x, now, dt);
                    else if (this.mode === 'stars') this._constellation(x, now, dt);
                    else this._spotlight(x, now, dt);
                }
                // sparks & shooting stars on top
                x.globalCompositeOperation = 'lighter';
                this.sparks = this.sparks.filter((s) => {
                    s.t += dt; if (s.t > s.life) return false;
                    s.vy += 90 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.985;
                    const a = 1 - s.t / s.life;
                    x.fillStyle = `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${a})`;
                    x.beginPath(); x.arc(s.x, s.y, 1.2 + a * 1.8, 0, 6.28); x.fill();
                    return true;
                });
                if (Math.random() < dt * 0.35) this.shoot.push({ x: W * (0.3 + Math.random() * 0.9), y: H * Math.random() * 0.35, t: 0 });
                this.shoot = this.shoot.filter((s) => {
                    s.t += dt; if (s.t > 0.9) return false;
                    const px = s.x - s.t * W * 0.55, py = s.y + s.t * H * 0.22, a = 1 - s.t / 0.9;
                    const g = x.createLinearGradient(px, py, px + 70, py - 28);
                    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
                    x.strokeStyle = g; x.lineWidth = 1.6; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 70, py - 28); x.stroke();
                    return true;
                });
                x.globalCompositeOperation = 'source-over';
            }

            _sky(x, W, H, now) {
                const tint = { lanterns: ['#0B0A24', '#2A1340', '#5A2A3A'], bubbles: ['#051428', '#0B2F4A', '#123E57'], stars: ['#03061A', '#0C1440', '#1D1F5A'], spotlight: ['#0A0620', '#24104A', '#431A5C'] }[this.mode];
                const g = x.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, tint[0]); g.addColorStop(0.6, tint[1]); g.addColorStop(1, tint[2]);
                x.fillStyle = g; x.fillRect(0, 0, W, H);
                // moon glow
                const mg = x.createRadialGradient(W * 0.2, H * 0.12, 0, W * 0.2, H * 0.12, W * 0.35);
                mg.addColorStop(0, 'rgba(255,240,210,.28)'); mg.addColorStop(1, 'rgba(255,240,210,0)');
                x.fillStyle = mg; x.fillRect(0, 0, W, H);
                x.fillStyle = 'rgba(255,246,225,.92)'; x.beginPath(); x.arc(W * 0.2, H * 0.12, Math.min(W, H) * 0.035, 0, 6.28); x.fill();
                x.fillStyle = tint[0]; x.beginPath(); x.arc(W * 0.2 + Math.min(W, H) * 0.014, H * 0.12 - Math.min(W, H) * 0.008, Math.min(W, H) * 0.032, 0, 6.28); x.fill();
                // aurora ribbons
                x.globalCompositeOperation = 'lighter';
                const cols = this.mode === 'lanterns' ? [[255, 150, 90], [255, 90, 140]] : this.mode === 'bubbles' ? [[80, 220, 255], [90, 255, 200]] : this.mode === 'stars' ? [[120, 140, 255], [80, 220, 255]] : [[200, 110, 255], [255, 120, 200]];
                for (let b = 0; b < 3; b++) {
                    const c = cols[b % 2], base = H * (0.22 + b * 0.12), amp = H * 0.05;
                    const ag = x.createLinearGradient(0, base - amp * 2, 0, base + amp * 3);
                    ag.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0)`); ag.addColorStop(0.5, `rgba(${c[0]},${c[1]},${c[2]},${0.09 - b * 0.02})`); ag.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
                    x.fillStyle = ag;
                    x.beginPath(); x.moveTo(0, H);
                    for (let px = 0; px <= W; px += 12) x.lineTo(px, base + Math.sin(px / W * 5 + now * (0.25 + b * 0.1) + b) * amp + Math.sin(px / W * 11 - now * 0.4) * amp * 0.35);
                    x.lineTo(W, H); x.closePath(); x.fill();
                }
                // stars + dust
                this.stars.forEach((s) => {
                    const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * s.s + s.p));
                    x.fillStyle = `rgba(255,255,255,${a * 0.9})`;
                    x.fillRect(s.x * W, s.y * H, s.r, s.r);
                });
                this.dust.forEach((d) => {
                    d.y -= d.v * 0.016; if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
                    const a = 0.25 + 0.25 * Math.sin(now * 1.3 + d.p);
                    x.fillStyle = `rgba(255,220,170,${a})`;
                    x.beginPath(); x.arc(d.x * W + Math.sin(now * 0.6 + d.p) * 8, d.y * H, d.r, 0, 6.28); x.fill();
                });
                x.globalCompositeOperation = 'source-over';
            }

            _lanterns(now, dt) {
                if (now >= this.nextSpawn && this.items.length < 9) { this._spawnLantern(now); this.nextSpawn = now + 1.5 + Math.random() * 0.8; }
                this.items = this.items.filter((it) => {
                    it.y -= it.v * dt;
                    const sway = Math.sin(now * 0.9 + it.ph) * 14 * it.depth;
                    const fadeIn = Math.min(1, (now - it.born) / 1.2), fadeTop = Math.min(1, Math.max(0, (it.y + 60) / (this.H * 0.25)));
                    it.el.style.opacity = (0.55 + it.depth * 0.45) * Math.min(fadeIn, fadeTop);
                    it.el.style.transform = `translate(${it.x + sway}px, ${it.y}px) rotate(${Math.sin(now * 0.9 + it.ph) * 3}deg) scale(${it.depth})`;
                    it.el.style.zIndex = Math.round(it.depth * 10);
                    if (it.y < -120) { it.el.remove(); return false; }
                    return true;
                });
            }

            _bubbles(x, now, dt) {
                const W = this.W, H = this.H, its = this.items;
                // Bubbles push each other apart softly instead of overlapping.
                for (let i = 0; i < its.length; i++) for (let j = i + 1; j < its.length; j++) {
                    const A = its[i], B = its[j];
                    const dx = (B.x + B.r) - (A.x + A.r), dy = (B.y + B.r) - (A.y + A.r), d = Math.hypot(dx, dy) || 1, gap = A.r + B.r + 6 - d;
                    if (gap > 0) { const ux = dx / d, uy = dy / d, m = gap * 0.5; A.x -= ux * m; A.y -= uy * m; B.x += ux * m; B.y += uy * m; A.vx -= ux * 8; A.vy -= uy * 8; B.vx += ux * 8; B.vy += uy * 8; }
                }
                its.forEach((it) => { const sp = Math.hypot(it.vx, it.vy); if (sp > 45) { it.vx *= 45 / sp; it.vy *= 45 / sp; } });
                this.items = this.items.filter((it) => {
                    const age = now - it.born;
                    if (age < 0) { it.el.style.opacity = 0; return true; }
                    it.x += it.vx * dt; it.y += it.vy * dt;
                    if (it.x < 4 || it.x + it.r * 2 > W - 4) { it.vx *= -1; it.x = Math.max(4, Math.min(W - it.r * 2 - 4, it.x)); }
                    if (it.y < 70 || it.y + it.r * 2 > H - 150) { it.vy *= -1; it.y = Math.max(70, Math.min(H - it.r * 2 - 150, it.y)); }
                    const wob = 1 + Math.sin(now * 2.2 + it.ph) * 0.035, grow = Math.min(1, age / 0.6);
                    if (age > it.life) {
                        this._burst(it.x + it.r, it.y + it.r, [170, 230, 255], 22);
                        it.el.remove();
                        setTimeout(() => this.mode === 'bubbles' && this._spawnBubble(performance.now() / 1000), 350);
                        return false;
                    }
                    it.el.style.opacity = grow;
                    it.el.style.transform = `translate(${it.x}px, ${it.y}px) scale(${wob * (0.4 + grow * 0.6)}, ${(2 - wob) * (0.4 + grow * 0.6)})`;
                    return true;
                });
            }

            _constellation(x, now, dt) {
                const c = this.constel;
                if (!c) return;
                if (now >= c.next && c.k < c.pts.length) {
                    const p = c.pts[c.k];
                    p.on = now;
                    if (p.d) {
                        p.el = this._card(p.d, 'dr-star');
                        p.el.style.transform = `translate(${p.x}px, ${p.y + 12}px) translate(-50%, 0)`;
                    }
                    if (c.k > 0) c.lines.push({ a: c.pts[c.k - 1], b: p, t: now });
                    if (c.k > 2 && Math.random() < 0.5) c.lines.push({ a: c.pts[c.k - 3], b: p, t: now + 0.3 });
                    this._burst(p.x, p.y, [200, 210, 255], 14);
                    c.k++; c.next = now + 2.3;
                    c.pts.forEach((q, i) => { if (q.el && i < c.k - 3) q.el.classList.add('dim'); });
                }
                if (c.k >= c.pts.length && now > c.next + 3) { this._enter('stars', now); return; }
                x.globalCompositeOperation = 'lighter';
                c.lines.forEach((l) => {
                    const f = Math.max(0, Math.min(1, (now - l.t) / 1.2));
                    x.strokeStyle = 'rgba(170,190,255,.45)'; x.lineWidth = 1;
                    x.setLineDash([4, 5]); x.lineDashOffset = -now * 12;
                    x.beginPath(); x.moveTo(l.a.x, l.a.y); x.lineTo(l.a.x + (l.b.x - l.a.x) * f, l.a.y + (l.b.y - l.a.y) * f); x.stroke();
                });
                x.setLineDash([]);
                c.pts.forEach((p) => {
                    const lit = p.on ? Math.min(1, (now - p.on) / 0.8) : 0.25;
                    const r = 3 + lit * 3 + Math.sin(now * 3 + p.x) * 0.8;
                    const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 6);
                    g.addColorStop(0, `rgba(255,255,255,${0.9 * lit + 0.1})`); g.addColorStop(0.25, `rgba(160,190,255,${0.5 * lit})`); g.addColorStop(1, 'rgba(160,190,255,0)');
                    x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, r * 6, 0, 6.28); x.fill();
                });
                x.globalCompositeOperation = 'source-over';
            }

            _spotlight(x, now, dt) {
                const s = this.spot;
                if (!s) return;
                const W = this.W, H = this.H;
                if (s.phase === 'idle') {
                    const d = this.forced || this._next();
                    this.forced = null;
                    if (!d) return;
                    const tt = this._textTargets(d.t);
                    const old = this.parts;
                    this.parts = tt.pts.map((p, i) => {
                        const src = old[i] || { x: Math.random() * W, y: H + Math.random() * 80 };
                        const hue = p[0] / W;
                        return { x: src.x, y: src.y, sx: src.x, sy: src.y, tx: p[0], ty: p[1], d: Math.random() * 0.5, c: [Math.round(255 - hue * 60), Math.round(170 + hue * 60), Math.round(120 + hue * 135)] };
                    });
                    if (s.el) s.el.remove();
                    s.el = document.createElement('button');
                    s.el.className = 'dr-spot';
                    s.el.setAttribute('data-dream', d.id);
                    s.el.style.top = (tt.top + tt.lh * tt.lines + 12) + 'px';
                    s.el.innerHTML = `<small>${escapeHtml(d.by)}</small>${d.amen ? `<em>${d.amen} آمين</em>` : ''}`;
                    this.layer.appendChild(s.el);
                    s.phase = 'in'; s.t = now;
                }
                const e = now - s.t;
                if (s.phase === 'in' && e > 2.0) { s.phase = 'hold'; s.t = now; if (s.el) s.el.classList.add('on'); }
                else if (s.phase === 'hold' && e > 3.6) { s.phase = 'out'; s.t = now; if (s.el) s.el.classList.remove('on'); this.parts.forEach((p) => { p.vx = (Math.random() - 0.5) * 160; p.vy = -60 - Math.random() * 220; }); }
                else if (s.phase === 'out' && e > 1.5) { s.phase = 'idle'; s.t = now; }
                x.globalCompositeOperation = 'lighter';
                const ph = s.phase, k = now - s.t;
                this.parts.forEach((p) => {
                    let px, py, a = 1, sz = 1.9;
                    if (ph === 'in') {
                        const f = Math.max(0, Math.min(1, (k - p.d) / 1.4)), ez = 1 - Math.pow(1 - f, 3);
                        px = p.sx + (p.tx - p.sx) * ez + Math.sin(k * 3 + p.tx) * (1 - ez) * 20;
                        py = p.sy + (p.ty - p.sy) * ez;
                        a = 0.35 + 0.65 * f;
                    } else if (ph === 'hold') {
                        px = p.tx + Math.sin(now * 2 + p.ty * 0.1) * 0.6; py = p.ty + Math.cos(now * 2 + p.tx * 0.1) * 0.6;
                        a = 0.8 + 0.2 * Math.sin(now * 4 + p.tx * 0.05);
                    } else {
                        px = p.tx + p.vx * k; py = p.ty + p.vy * k + 40 * k * k;
                        a = Math.max(0, 1 - k / 1.4); sz = 1.9 + k * 1.2;
                    }
                    p.x = px; p.y = py;
                    x.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${a})`;
                    x.fillRect(px - sz / 2, py - sz / 2, sz, sz);
                });
                x.globalCompositeOperation = 'source-over';
            }

            launch(fromX, fromY) {
                // A glowing orb flies from the button into the sky and bursts.
                const W = this.W, H = this.H, t0 = performance.now() / 1000;
                const tx = W / 2, ty = H * 0.3;
                const step = () => {
                    const k = Math.min(1, (performance.now() / 1000 - t0) / 1.1), ez = 1 - Math.pow(1 - k, 3);
                    const x = fromX + (tx - fromX) * ez, y = fromY + (ty - fromY) * ez - Math.sin(ez * Math.PI) * 60;
                    for (let i = 0; i < 3; i++) this.sparks.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.5, t: 0, c: [255, 220, 150] });
                    if (k < 1) requestAnimationFrame(step);
                    else { this._burst(tx, ty, [255, 225, 160], 70); this._burst(tx, ty, [255, 150, 220], 40); }
                };
                requestAnimationFrame(step);
            }

            start(isOn) {
                if (this.raf) return;
                const loop = (ts) => {
                    if (!isOn()) { this.raf = 0; return; }
                    try { this.frame(ts); } catch (e) { console.warn('Dream sky frame failed:', e); }
                    this.raf = requestAnimationFrame(loop);
                };
                this.raf = requestAnimationFrame(loop);
            }
        }


        // Real Iraq for the 3D maps: terrain heights (AWS Terrain Tiles, metres) and a cloud-free
        // satellite picture (Copernicus Sentinel-2 2021 composite by ESA WorldCover), both baked for
        // IRAQ_GEO's bounding box. If they can't load, the maps paint their own terrain.
