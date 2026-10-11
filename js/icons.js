// Faster icons. lucide.createIcons() rebuilds EVERY icon on the page each time it is called (a drawn <svg> keeps its data-lucide
// attribute, so it is found and drawn again), and the app calls it after almost every render: hundreds of icons, hidden screens
// included, rebuilt on each tap. This version draws only the icons that are not drawn yet, and each icon's picture is built once
// and then copied. The result is the same <svg> lucide makes.
(function () {
    'use strict';
    const L = window.lucide;
    if (!L || typeof L.createIcons !== 'function' || !L.icons || typeof L.createElement !== 'function' || L.__fast) return;
    const orig = L.createIcons.bind(L);
    const pascal = (s) => String(s).replace(/(^\w|-\w)/g, (m) => m.replace('-', '').toUpperCase());
    const tpl = new Map();
    L.__fast = true;
    L.createIcons = function (opts) {
        // anything special (other icons, other attributes, another name attribute) goes to lucide itself
        if (opts && Object.keys(opts).some((k) => k !== 'icons' || opts.icons !== L.icons)) return orig(opts);
        const els = document.querySelectorAll('[data-lucide]:not(svg)');
        for (let i = 0; i < els.length; i++) {
            const el = els[i], name = el.getAttribute('data-lucide');
            let t = tpl.get(name);
            if (t === undefined) {
                const node = L.icons[pascal(name)];
                t = node ? L.createElement(node) : null;
                if (t) { t.removeAttribute('class'); t.setAttribute('aria-hidden', 'true'); }
                tpl.set(name, t);
            }
            if (!t || !el.parentNode) continue;
            const svg = t.cloneNode(true);
            svg.setAttribute('data-lucide', name);
            const own = el.getAttribute('class');
            svg.setAttribute('class', 'lucide lucide-' + name + (own ? ' ' + own : ''));
            for (const a of el.attributes) if (a.name !== 'class' && a.name !== 'data-lucide') svg.setAttribute(a.name, a.value);
            el.parentNode.replaceChild(svg, el);
        }
    };
})();
