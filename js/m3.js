// Material 3 behaviour (the look is at the end of css/app.css): top app bars that tint when the page scrolls under them, bottom
// sheets that slide away and can be dragged down to close, and the smoothness guard (endless decorations stop after a few seconds,
// a modest phone gets a light mode).
(function () {
    'use strict';
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------- top app bars tint once the page scrolls under them ----------
    let scrolled = false, ticking = false;
    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            const s = (window.scrollY || document.documentElement.scrollTop) > 6;
            if (s !== scrolled) { scrolled = s; document.body.classList.toggle('m3-scrolled', s); }
        });
    };
    addEventListener('scroll', onScroll, { passive: true });

    // ---------- the bottom sheet: slides down when closed, and can be dragged down to close ----------
    const modal = () => document.getElementById('walletModal');
    function hookSheet() {
        if (!window.app || app.__m3Sheet) return !!(window.app && app.__m3Sheet);
        app.__m3Sheet = true;
        const close0 = app.closeWalletModal;
        app.closeWalletModal = function () {
            const m = modal();
            if (!m || m.classList.contains('hidden') || reduce) return close0.apply(this, arguments);
            if (m.classList.contains('m3-closing')) return undefined;
            m.classList.add('m3-closing');
            const args = arguments;
            // a page that closes the sheet and at once fills it again (a next step) keeps it open: the slide-out is cancelled
            let reopened = false;
            const box = document.getElementById('walletModalContent'), mo = new MutationObserver(() => { reopened = true; });
            if (box) mo.observe(box, { childList: true, subtree: true, characterData: true });
            setTimeout(() => {
                mo.disconnect();
                m.classList.remove('m3-closing');
                const s = m.querySelector('div.relative'); if (s) { s.style.transform = ''; s.classList.remove('m3-snap'); }
                if (!reopened) close0.apply(app, args);
            }, 190);
            return undefined;
        };
        return true;
    }
    if (!hookSheet()) { const t = setInterval(() => { if (hookSheet()) clearInterval(t); }, 200); setTimeout(() => clearInterval(t), 15000); }
    // reopening must not keep the "closing" state or a dragged position (only the sheet itself is watched)
    const watchSheet = () => {
        const m = modal();
        if (!m) return false;
        new MutationObserver(() => {
            if (!m.classList.contains('hidden')) { const s = m.querySelector('div.relative'); if (s && !s.classList.contains('m3-drag')) s.style.transform = ''; }
        }).observe(m, { attributes: true, attributeFilter: ['class'] });
        return true;
    };
    if (!watchSheet()) document.addEventListener('DOMContentLoaded', watchSheet, { once: true });

    let drag = null;
    document.addEventListener('touchstart', (e) => {
        const m = modal();
        if (!m || m.classList.contains('hidden')) return;
        const sheet = m.querySelector('div.relative');
        if (!sheet || !sheet.contains(e.target) || e.touches.length !== 1) return;
        const body = sheet.querySelector('.p-4');
        const onTop = e.touches[0].clientY - sheet.getBoundingClientRect().top < 70;   // the handle and the title row
        if (!onTop && body && body.scrollTop > 0) return;
        if (e.target.closest('input, textarea, select, .toggle-switch, [data-nodrag]')) return;
        drag = { sheet, y0: e.touches[0].clientY, t0: performance.now(), dy: 0, on: false };
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (!drag) return;
        const dy = e.touches[0].clientY - drag.y0;
        if (!drag.on) { if (dy > 8) { drag.on = true; drag.sheet.classList.add('m3-drag'); } else if (dy < -4) { drag = null; return; } else return; }
        drag.dy = Math.max(0, dy);
        drag.sheet.style.transform = 'translateY(' + drag.dy + 'px)';
    }, { passive: true });
    const end = () => {
        if (!drag) return;
        const d = drag; drag = null;
        if (!d.on) return;
        d.sheet.classList.remove('m3-drag');
        const v = d.dy / Math.max(1, performance.now() - d.t0);
        if (d.dy > Math.min(140, d.sheet.offsetHeight * 0.3) || v > 0.6) {
            d.sheet.classList.add('m3-snap'); d.sheet.style.transform = 'translateY(100%)';
            setTimeout(() => { modal()?.classList.add('hidden'); d.sheet.classList.remove('m3-snap'); d.sheet.style.transform = ''; }, 260);
        } else {
            d.sheet.classList.add('m3-snap'); d.sheet.style.transform = '';
            setTimeout(() => d.sheet.classList.remove('m3-snap'), 320);
        }
    };
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });

    // ---------- smoothness ----------
    // Decorations that loop for ever (glows, floats, shines) cost every frame, and on a modest phone
    // they take the time the page needs to scroll and open screens. Each one plays for a few seconds when its screen appears, then
    // it is stopped and the element keeps its normal look. Loops that tell something is happening (loading, a call ringing,
    // recording, typing, a timer running, the news ticker moving), and the light running round the bottom bar and the news frame
    // (a small layer the graphics chip turns by itself), keep playing.
    const KEEP = new Set(['spin', 'pulse', 'flspin', 'kdLoad', 'rmBounce', 'rmSk', 'rmSp', 'shShim', 'shimmer', 'tuSk', 'yrSpin', 'fmShim',
        'ct-pulse', 'ct-shimmer', 'ct-dot', 'clSpin', 'clBlink', 'clBreath', 'clDot', 'clRipple', 'clBlob', 'clBounce', 'cmIdle', 'mdrTalk',
        'mc-talk', 'mc-nod', 'ttDot', 'ttListen', 'ttSay', 'voiceRecBarPulse', 'vnRing', 'tkMarquee', 'tm-pulse', 'dl-blink', 'dl-ping',
        'gwBlink', 'mtSpin', 'mtBar', 'mrJig', 'tkBorderSpin']);
    // a modest phone (or one that asks for less motion / data) gets the light mode: no live blur, and the loops stop almost at once
    const mem = Number(navigator.deviceMemory) || 8, cores = Number(navigator.hardwareConcurrency) || 8;
    let lite = reduce || mem <= 4 || cores <= 4 || !!(navigator.connection && navigator.connection.saveData);
    const setLite = (on) => { lite = on; document.documentElement.classList.toggle('lite', on); };
    if (lite) setLite(true);
    const tame = () => {
        if (document.hidden || typeof document.getAnimations !== 'function') return;
        const limit = lite ? 1200 : 4000;
        let list;
        try { list = document.getAnimations(); } catch (e) { return; }
        for (const a of list) {
            try {
                if (!a.animationName || a.playState !== 'running' || KEEP.has(a.animationName)) continue;
                if (a.effect.getTiming().iterations !== Infinity) continue;
                if ((a.currentTime || 0) >= limit) a.cancel();
            } catch (e) { /* an animation that went away meanwhile */ }
        }
    };
    setInterval(tame, 1000);
    // a phone that drops many frames in its first seconds is switched to the light mode too
    if (!lite && window.requestAnimationFrame) {
        let n = 0, slow = 0, last = 0;
        const t0 = setTimeout(() => {
            const step = (now) => {
                if (last) { n++; if (now - last > 34) slow++; }
                last = now;
                if (n < 180) requestAnimationFrame(step);
                else if (slow / n > 0.2) setLite(true);
            };
            requestAnimationFrame(step);
        }, 2500);
        document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(t0); n = 999; } }, { once: true });
    }
})();
