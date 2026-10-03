#!/usr/bin/env python3
"""Build step for the student app. Run it after every change, before committing:

    python3 tools/build.py

1. Builds css/tw.css (Tailwind) from the classes used in index.html and js/*.js, so phones
   don't compile the styles on every launch (the old Tailwind CDN did).
2. Stamps short content hashes into index.html (?v=... and window.APP_VER), so phones fetch
   the new files after an update instead of an old saved copy.
"""
import hashlib, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

r = subprocess.run(['npx', '-y', 'tailwindcss@3.4.17', '-c', 'tools/tailwind.config.js', '-i', 'tools/tw.in.css', '-o', 'css/tw.css', '--minify'], capture_output=True, text=True)
if r.returncode:
    sys.exit('Tailwind build failed:\n' + r.stderr)

def h(*paths):
    m = hashlib.sha1()
    for p in paths:
        with open(p, 'rb') as f:
            m.update(f.read())
    return m.hexdigest()[:10]

v = {
    'css/app.css': h('css/app.css'),
    'css/tw.css': h('css/tw.css'),
    'js/app.js': h('js/app.js'),
    'js/vendor/lucide.min.js': h('js/vendor/lucide.min.js'),
    'js/pickers.js': h('js/pickers.js'),
    'js/vendor/swiper-bundle.min.js': h('js/vendor/swiper-bundle.min.js'),
    'css/swiper-bundle.min.css': h('css/swiper-bundle.min.css'),
}
import glob
v_all = h('css/app.css', 'css/tw.css', 'js/app.js', 'js/maps.js', 'js/dreams.js', 'js/cards.js', 'js/uni.js', 'js/ytroom.js', 'js/garden.js', 'js/gardenui.js', 'js/tutor.js', 'js/moodmap.js', 'js/mistakes.js', 'js/shop.js', 'js/spots.js', 'js/ventfilter.js', 'js/vent.js', 'js/ideas.js', 'js/calls.js', 'js/food.js', 'js/dhikr.js', 'js/weekly.js', 'js/hall.js', 'js/table.js', 'js/forum.js', 'js/money.js', 'js/timer.js', 'js/invite.js', 'js/sroom.js', 'js/room3d.js', 'js/anime.js', *sorted(glob.glob('js/bio/*.js')))

with open('index.html', encoding='utf-8') as f:
    s = f.read()
for path, hv in v.items():
    s, n = re.subn(re.escape(path) + r'\?v=[\w_]+', path + '?v=' + hv, s)
    if n != 1:
        sys.exit('index.html: expected one reference to ' + path)
s, n = re.subn(r"window\.APP_VER = '[\w_]*'", "window.APP_VER = '" + v_all + "'", s)
if n != 1:
    sys.exit('index.html: window.APP_VER not found')
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(s)
print('built css/tw.css (%d KB), version %s' % (os.path.getsize('css/tw.css') // 1024, v_all))
