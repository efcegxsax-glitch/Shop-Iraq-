// The phone's own pop-ups for drop-down lists (<select>) and times (<input type="time">) look
// like an old system dialog. This replaces them everywhere, in the app and the panel, with a
// sheet that slides up from the bottom: a list of choices for a <select>, and scroll wheels
// (hour, minute, ص/م) for a time. The original field keeps its value and gets the usual
// input/change events, so every page keeps working as it did. data-native on a field keeps
// the phone's own picker for it.
(function () {
    if (window.__pickers) return;
    window.__pickers = true;
    const ROW = 44;

    const css = `
.pk-sheet { position: fixed; inset: 0; z-index: 99990; display: flex; align-items: flex-end; justify-content: center; font-family: inherit; }
.pk-back { position: absolute; inset: 0; background: rgba(15,23,42,.45); opacity: 0; transition: opacity .25s; }
.pk-card { position: relative; width: 100%; max-width: 520px; max-height: 78vh; display: flex; flex-direction: column; background: var(--bg, #F8FAFC); color: var(--text, #0F172A); border-radius: 26px 26px 0 0; padding: 10px 14px calc(14px + var(--safe-b, 0px)); transform: translateY(100%); transition: transform .32s cubic-bezier(.2,.8,.2,1); box-shadow: 0 -10px 40px rgba(0,0,0,.18); direction: rtl; }
.pk-sheet.on .pk-back { opacity: 1; } .pk-sheet.on .pk-card { transform: none; }
.pk-grab { width: 40px; height: 5px; border-radius: 3px; background: var(--border, #CBD5E1); margin: 0 auto 10px; flex: none; }
.pk-title { font-size: 15px; font-weight: 900; text-align: center; margin-bottom: 10px; flex: none; }
.pk-list { overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 2px 2px 6px; overscroll-behavior: contain; }
.pk-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 14px 16px; border-radius: 16px; background: var(--surface, #fff); border: 1.5px solid var(--border, #E2E8F0); color: var(--text, #0F172A); font-size: 15px; font-weight: 700; text-align: right; transition: transform .12s, border-color .2s, background .2s; animation: pkIn .3s ease backwards; }
.pk-opt:active { transform: scale(.98); }
.pk-opt:disabled { opacity: .45; }
.pk-opt .pk-dot { width: 22px; height: 22px; flex: none; border-radius: 50%; border: 2px solid var(--border, #CBD5E1); display: flex; align-items: center; justify-content: center; transition: all .2s; }
.pk-opt.on { border-color: rgb(var(--p, 15 118 110)); background: rgba(var(--p, 15 118 110) / .07); color: rgb(var(--p, 15 118 110)); }
.pk-opt.on .pk-dot { border-color: rgb(var(--p, 15 118 110)); background: rgb(var(--p, 15 118 110)); }
.pk-opt.on .pk-dot::after { content: ''; width: 9px; height: 5px; border: solid #fff; border-width: 0 0 2.5px 2.5px; transform: rotate(-45deg) translate(1px, -1px); }
.pk-group { font-size: 12px; font-weight: 800; color: var(--text2, #64748B); padding: 8px 6px 2px; }
@keyframes pkIn { from { opacity: 0; transform: translateY(8px); } }
.pk-wheels { position: relative; display: flex; gap: 6px; direction: ltr; height: ${ROW * 5}px; margin: 4px 0 12px; }
.pk-wheels::before { content: ''; position: absolute; left: 0; right: 0; top: ${ROW * 2}px; height: ${ROW}px; border-radius: 14px; background: rgba(var(--p, 15 118 110) / .1); border: 1.5px solid rgba(var(--p, 15 118 110) / .35); pointer-events: none; }
.pk-wheels::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(var(--bg, #F8FAFC), transparent 30%, transparent 70%, var(--bg, #F8FAFC)); }
.pk-col { flex: 1; overflow-y: auto; scroll-snap-type: y mandatory; scrollbar-width: none; padding: ${ROW * 2}px 0; overscroll-behavior: contain; }
.pk-col::-webkit-scrollbar { display: none; }
.pk-col div { height: ${ROW}px; display: flex; align-items: center; justify-content: center; scroll-snap-align: center; font-size: 22px; font-weight: 700; color: var(--text2, #94A3B8); font-variant-numeric: tabular-nums; transition: color .15s, transform .15s; }
.pk-col div.on { color: var(--text, #0F172A); font-weight: 900; transform: scale(1.12); }
.pk-col.pk-ap div { font-size: 18px; }
.pk-sep { display: flex; align-items: center; font-size: 24px; font-weight: 900; color: var(--text, #0F172A); }
.pk-ok { flex: none; padding: 14px; border-radius: 16px; background: rgb(var(--p, 15 118 110)); color: #fff; font-size: 15px; font-weight: 900; border: 0; box-shadow: 0 10px 24px rgba(var(--p, 15 118 110) / .3); }
.pk-ok:active { transform: scale(.98); }
@media (prefers-reduced-motion: reduce) { .pk-card, .pk-back { transition: none; } .pk-opt { animation: none; } }
`;
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let open = null;

    // the name of the field, from its label
    function titleOf(el) {
        const t = el.getAttribute('aria-label') || el.getAttribute('title');
        if (t) return t;
        const lab = el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]'));
        if (lab) {
            const first = lab.querySelector('span, b, strong');
            const txt = (first ? first.textContent : lab.textContent).trim();
            if (txt) return txt.slice(0, 60);
        }
        const prev = el.previousElementSibling;
        if (prev && /^(LABEL|SPAN|B|STRONG|P|DIV)$/.test(prev.tagName) && prev.textContent.trim().length < 60) return prev.textContent.trim();
        return el.tagName === 'SELECT' ? 'اختار' : 'الوقت';
    }

    function setValue(el, v) {
        if (el.value === v) return;
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function sheet(inner, onClose) {
        close(true);
        const w = document.createElement('div');
        w.className = 'pk-sheet';
        w.innerHTML = '<div class="pk-back"></div><div class="pk-card" role="dialog" aria-modal="true"><div class="pk-grab"></div>' + inner + '</div>';
        document.body.appendChild(w);
        w.querySelector('.pk-back').addEventListener('click', () => close());
        // a swipe down on the handle closes it
        let y0 = null;
        const card = w.querySelector('.pk-card');
        w.querySelector('.pk-grab').addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
        card.addEventListener('touchmove', (e) => { if (y0 !== null && e.touches[0].clientY - y0 > 60) { y0 = null; close(); } }, { passive: true });
        requestAnimationFrame(() => w.classList.add('on'));
        open = { w, onClose };
        return w;
    }
    function close(now) {
        if (!open) return;
        const { w, onClose } = open;
        open = null;
        if (onClose) onClose();
        if (now) { w.remove(); return; }
        w.classList.remove('on');
        setTimeout(() => w.remove(), 300);
    }

    function pickSelect(el) {
        let html = '<div class="pk-title">' + esc(titleOf(el)) + '</div><div class="pk-list">';
        let i = 0;
        Array.from(el.children).forEach((node) => {
            const opts = node.tagName === 'OPTGROUP' ? Array.from(node.children) : [node];
            if (node.tagName === 'OPTGROUP') html += '<div class="pk-group">' + esc(node.label) + '</div>';
            opts.forEach((o) => {
                if (o.tagName !== 'OPTION' || o.hidden) return;
                html += '<button type="button" class="pk-opt' + (o.selected ? ' on' : '') + '" data-v="' + esc(o.value) + '" ' + (o.disabled ? 'disabled' : '') + ' style="animation-delay:' + Math.min(i++, 12) * 0.025 + 's"><span>' + esc(o.textContent.trim()) + '</span><span class="pk-dot"></span></button>';
            });
        });
        html += '</div>';
        const w = sheet(html);
        w.querySelectorAll('.pk-opt').forEach((b) => b.addEventListener('click', () => {
            w.querySelectorAll('.pk-opt.on').forEach((x) => x.classList.remove('on'));
            b.classList.add('on');
            setTimeout(() => { close(); setValue(el, b.dataset.v); }, 140);
        }));
        const on = w.querySelector('.pk-opt.on');
        if (on) setTimeout(() => on.scrollIntoView({ block: 'center' }), 60);
    }

    function pickTime(el) {
        const [h0, m0] = (/^\d\d:\d\d/.test(el.value) ? el.value : '08:00').split(':').map(Number);
        const hours = Array.from({ length: 12 }, (_, i) => i + 1);
        const mins = Array.from({ length: 60 }, (_, i) => i);
        const col = (cls, list, fmt) => '<div class="pk-col ' + cls + '">' + list.map((x) => '<div>' + fmt(x) + '</div>').join('') + '</div>';
        const w = sheet('<div class="pk-title">' + esc(titleOf(el)) + '</div><div class="pk-wheels">'
            + col('pk-h', hours, (x) => x) + '<span class="pk-sep">:</span>'
            + col('pk-m', mins, (x) => String(x).padStart(2, '0'))
            + col('pk-ap', ['ص', 'م'], (x) => x)
            + '</div><button type="button" class="pk-ok">تم</button>');
        const cols = { h: w.querySelector('.pk-h'), m: w.querySelector('.pk-m'), ap: w.querySelector('.pk-ap') };
        const idx = (c) => Math.max(0, Math.min(c.children.length - 1, Math.round(c.scrollTop / ROW)));
        const mark = (c) => { const i = idx(c); Array.from(c.children).forEach((d, j) => d.classList.toggle('on', j === i)); };
        const start = { h: (h0 % 12 || 12) - 1, m: m0, ap: h0 >= 12 ? 1 : 0 };
        Object.keys(cols).forEach((k) => {
            const c = cols[k];
            c.scrollTop = start[k] * ROW;
            mark(c);
            c.addEventListener('scroll', () => mark(c), { passive: true });
            // a tap on a row moves the wheel there
            c.addEventListener('click', (e) => {
                const d = e.target.closest('.pk-col > div');
                if (d) c.scrollTo({ top: Array.from(c.children).indexOf(d) * ROW, behavior: 'smooth' });
            });
        });
        w.querySelector('.pk-ok').addEventListener('click', () => {
            let h = idx(cols.h) + 1;
            const m = idx(cols.m), pm = idx(cols.ap) === 1;
            if (h === 12) h = 0;
            if (pm) h += 12;
            close();
            setValue(el, String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
        });
    }

    const target = (e) => {
        const el = e.target && e.target.closest && e.target.closest('select, input[type="time"]');
        if (!el || el.disabled || el.readOnly || el.hasAttribute('data-native') || el.multiple || (el.tagName === 'SELECT' && el.size > 1)) return null;
        return el;
    };
    const go = (el) => {
        try { el.blur(); } catch (er) {}
        if (el.tagName === 'SELECT') pickSelect(el); else pickTime(el);
    };
    // touch: open on lift (so a scroll that starts on the field still scrolls), and keep the
    // phone's own pop-up from opening
    let tStart = null;
    document.addEventListener('touchstart', (e) => { const el = target(e); tStart = el ? { el, y: e.touches[0].clientY, x: e.touches[0].clientX } : null; }, { passive: true, capture: true });
    document.addEventListener('touchend', (e) => {
        const el = target(e);
        if (!el || !tStart || tStart.el !== el) return;
        const t = e.changedTouches[0];
        if (Math.abs(t.clientY - tStart.y) > 10 || Math.abs(t.clientX - tStart.x) > 10) return;
        e.preventDefault();
        go(el);
    }, { passive: false, capture: true });
    document.addEventListener('mousedown', (e) => { const el = target(e); if (!el) return; e.preventDefault(); go(el); }, true);
    document.addEventListener('click', (e) => { if (target(e)) e.preventDefault(); }, true);
    document.addEventListener('keydown', (e) => {
        if (open && e.key === 'Escape') { close(); return; }
        const el = target(e);
        if (el && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) { e.preventDefault(); go(el); }
    }, true);
    window.addEventListener('popstate', () => close(true));
})();
