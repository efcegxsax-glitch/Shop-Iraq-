// Copies the Firebase web SDK into js/vendor/fb/ so the site and the phone app no longer download it from
// gstatic.com (blocked or slow on some mobile networks). The pieces share their common code, so one
// initializeApp serves them all. Run again (npm run vendor) only when the firebase version in package.json changes,
// then change the ?v= on the imports in index.html to the new version.
import { build } from 'esbuild';
import fs from 'fs';
const out = new URL('../js/vendor/fb/', import.meta.url).pathname;
fs.rmSync(out, { recursive: true, force: true });
await build({
  entryPoints: {
    'firebase-app': 'tools/fb-entry/app.js',
    'firebase-auth': 'tools/fb-entry/auth.js',
    'firebase-database': 'tools/fb-entry/database.js',
    'firebase-storage': 'tools/fb-entry/storage.js',
    'firebase-messaging': 'tools/fb-entry/messaging.js',
  },
  bundle: true, splitting: true, format: 'esm', minify: true, target: 'es2020', platform: 'browser',
  outdir: out, chunkNames: 'chunk-[hash]', legalComments: 'none', logLevel: 'info',
});
const size = fs.readdirSync(out).reduce((a, f) => a + fs.statSync(out + f).size, 0);
console.log('firebase copied:', fs.readdirSync(out).length, 'files,', (size / 1024).toFixed(0), 'KB');
