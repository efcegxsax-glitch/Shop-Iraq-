// Service worker for push notifications (Firebase Cloud Messaging).
// It must sit next to index.html on the same https site: it shows the notification
// when the app is closed or in the background, and opens the app when it is tapped.
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyBTb8xXZka320h1vS9Przl4ygzHXwesUWI',
    authDomain: 'iraqi-student-platform-9918d.firebaseapp.com',
    projectId: 'iraqi-student-platform-9918d',
    storageBucket: 'iraqi-student-platform-9918d.firebasestorage.app',
    messagingSenderId: '16734952715',
    appId: '1:16734952715:web:6c11e771fb86f9d185960e',
    databaseURL: 'https://iraqi-student-platform-9918d-default-rtdb.firebaseio.com/'
});

const messaging = firebase.messaging();

// Messages sent by the Cloud Function carry a `notification` block, which the browser
// displays by itself. This only covers data-only messages, so nothing shows twice.
messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const d = payload.data || {};
    if (!d.title) return;
    self.registration.showNotification(d.title, {
        body: d.body || '',
        icon: d.icon || 'https://i.postimg.cc/kGn7bhGL/images-(14).jpg',
        dir: 'rtl',
        lang: 'ar',
        tag: d.id ? 'isp-' + d.id : undefined,
        data: { link: d.link || '/' }
    });
});

// Tapping a notification focuses the open app, or opens it.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const fcm = event.notification.data && event.notification.data.FCM_MSG;
    const link = (fcm && fcm.fcmOptions && fcm.fcmOptions.link) || (event.notification.data && event.notification.data.link) || '/';
    event.waitUntil((async () => {
        const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of all) {
            if (new URL(c.url).origin === self.location.origin && 'focus' in c) return c.focus();
        }
        return clients.openWindow(link);
    })());
});
