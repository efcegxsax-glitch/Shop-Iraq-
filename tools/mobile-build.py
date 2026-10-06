#!/usr/bin/env python3
"""Assembles www/, the folder the Android and iPhone apps carry inside them.

    python3 tools/mobile-build.py

Runs the normal build (hashes and version), then copies only what the app needs. The admin panel,
the tutor Worker, the rules page and the tools stay out. The apps load these files from the phone
itself, so opening is instant; the data still comes live from Firebase.
"""
import os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'www')
KEEP_FILES = ['index.html', 'privacy.html', 'terms.html', 'delete-account.html', 'manifest.webmanifest']
KEEP_DIRS = ['css', 'js', 'assets', 'icons']

subprocess.check_call([sys.executable, os.path.join(ROOT, 'tools', 'build.py')], cwd=ROOT)
if os.path.isdir(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)
for f in KEEP_FILES:
    shutil.copy(os.path.join(ROOT, f), os.path.join(OUT, f))
for d in KEEP_DIRS:
    # the PDF reader (js/vendor/pdf) is only used by the admin panel, which is not part of the phone app
    shutil.copytree(os.path.join(ROOT, d), os.path.join(OUT, d), ignore=shutil.ignore_patterns('pdf') if d == 'js' else None)
size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
print('www ready: %.1f MB' % (size / 1048576))
