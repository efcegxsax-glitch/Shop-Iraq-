# Working on the app

- `index.html` holds the page markup; the code is in `js/app.js`, the styles in `css/app.css`.
- `js/maps.js` (governorate war + Iraq Forest + weather) and `js/dreams.js` (dreams sky) load
  only when their page opens (`app._need(name)`).
- After any change run `python3 tools/build.py`: it rebuilds `css/tw.css` (Tailwind classes used
  in index.html and js/*.js) and stamps new version numbers so phones fetch the update.
- `OneSignalSDKWorker.js` is the service worker: push notifications (OneSignal) and the saved
  copy that lets the app open without internet.
- Errors on students' phones are saved in `errors/` and shown in the admin panel (الأخطاء).
- Database security rules: edit `tools/rules.py`, run `python3 tools/rules.py` to write
  `database.rules.json`, then paste that file into Firebase console -> Realtime Database -> Rules
  -> Publish. `tools/rules-test.mjs` checks them against the Firebase emulator (steps at its top).
- Points and balance only change through `addPointsAtomic` / `addBalanceAtomic` (one update the
  rules can check). Points go up at most 200 per write, one write per 20 seconds; the balance only
  goes up through a top-up code, an incoming transfer (`incoming/{uid}`) or redeeming points.
- The admin panel needs signing in; `admins/{uid}` lists who may. The first account to sign in
  while that list is empty becomes the admin.
