# Working on the app

- `index.html` holds the page markup; the code is in `js/app.js`, the styles in `css/app.css`.
- `js/maps.js` (governorate war + Iraq Forest + weather) and `js/dreams.js` (dreams sky) load
  only when their page opens (`app._need(name)`).
- After any change run `python3 tools/build.py`: it rebuilds `css/tw.css` (Tailwind classes used
  in index.html and js/*.js) and stamps new version numbers so phones fetch the update.
- `OneSignalSDKWorker.js` is the service worker: push notifications (OneSignal) and the saved
  copy that lets the app open without internet.
- Errors on students' phones are saved in `errors/` and shown in the admin panel (الأخطاء).
