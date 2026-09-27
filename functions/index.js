// Sends every notification the admin panel writes to /notifications/{id} as a push
// notification (Firebase Cloud Messaging), so it reaches students whose app is closed.
// If the notification has a `govs` list (the "باچر دوام لو عطلة؟" announcements), only
// students of those governorates receive it.
const { onValueCreated } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const APP_URL = 'https://iraqi-student-platform-9918d.web.app/';
const ICON = 'https://i.postimg.cc/kGn7bhGL/images-(14).jpg';
// Guard while the database rules are open: anyone who can write /notifications could
// otherwise push-spam every student. Extra notifications past this limit are skipped.
const MAX_PUSHES_PER_HOUR = 20;

const GOVERNORATE_ALIASES = { 'الموصل': 'نينوى', 'الديوانية': 'القادسية', 'الناصرية': 'ذي قار', 'العمارة': 'ميسان', 'السماوة': 'المثنى', 'الكوت': 'واسط', 'الرمادي': 'الأنبار', 'الحلة': 'بابل', 'بعقوبة': 'ديالى', 'تكريت': 'صلاح الدين' };
const normGov = (g) => { const v = String(g || '').trim(); return GOVERNORATE_ALIASES[v] || v; };

exports.pushNotification = onValueCreated(
    { ref: '/notifications/{id}', instance: 'iraqi-student-platform-9918d-default-rtdb', region: 'us-central1' },
    async (event) => {
        const n = event.data.val();
        const id = event.params.id;
        if (!n || !n.title) return;
        const db = getDatabase();

        // Rate limit (see MAX_PUSHES_PER_HOUR)
        const hour = Math.floor(Date.now() / 3600000);
        const quota = await db.ref('pushQuota/' + hour).transaction((c) => (c || 0) + 1);
        db.ref('pushQuota/' + (hour - 24)).remove().catch(() => {});
        if (quota.snapshot.val() > MAX_PUSHES_PER_HOUR) {
            logger.warn('Push skipped: hourly limit reached', { id });
            await db.ref('notifications/' + id + '/pushed').set({ at: Date.now(), skipped: 'hourly-limit' });
            return;
        }

        const govs = Array.isArray(n.govs) ? n.govs : (n.govs && typeof n.govs === 'object' ? Object.values(n.govs) : []);
        const target = new Set(govs.map(normGov).filter(Boolean));

        // tokens/{uid}/{key} = { token, gov, ... } written by the student app
        const all = (await db.ref('tokens').get()).val() || {};
        const entries = [];
        Object.keys(all).forEach((uid) => Object.keys(all[uid] || {}).forEach((key) => {
            const t = all[uid][key];
            if (t && typeof t.token === 'string') entries.push({ uid, key, token: t.token, gov: normGov(t.gov) });
        }));

        // Old tokens saved before the governorate was stored: read it from the profile.
        if (target.size) {
            const missing = [...new Set(entries.filter((e) => !e.gov && e.uid !== 'anonymous').map((e) => e.uid))];
            const found = {};
            await Promise.all(missing.map(async (uid) => { found[uid] = normGov((await db.ref('users/' + uid + '/governorate').get()).val()); }));
            entries.forEach((e) => { if (!e.gov) e.gov = found[e.uid] || ''; });
        }

        const list = target.size ? entries.filter((e) => target.has(e.gov)) : entries;
        const seen = new Set();
        const unique = list.filter((e) => (seen.has(e.token) ? false : seen.add(e.token)));
        if (!unique.length) {
            await db.ref('notifications/' + id + '/pushed').set({ at: Date.now(), sent: 0, failed: 0 });
            return;
        }

        const body = String(n.description || '').slice(0, 180);
        let sent = 0, failed = 0;
        const dead = [];
        for (let i = 0; i < unique.length; i += 500) {
            const chunk = unique.slice(i, i + 500);
            const res = await getMessaging().sendEachForMulticast({
                tokens: chunk.map((e) => e.token),
                notification: { title: String(n.title).slice(0, 120), body },
                data: { id: String(id), type: String(n.type || 'announcement'), src: 'isp-admin' },
                webpush: {
                    notification: { icon: ICON, dir: 'rtl', lang: 'ar', tag: 'isp-' + id },
                    fcmOptions: { link: APP_URL }
                }
            });
            sent += res.successCount;
            failed += res.failureCount;
            res.responses.forEach((r, k) => {
                const code = r.error && r.error.code;
                if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-argument') dead.push(chunk[k]);
            });
        }
        // Tokens of uninstalled apps / revoked permissions are removed.
        await Promise.all(dead.map((e) => db.ref('tokens/' + e.uid + '/' + e.key).remove()));
        await db.ref('notifications/' + id + '/pushed').set({ at: Date.now(), sent, failed, removed: dead.length });
        logger.info('Push sent', { id, sent, failed, removed: dead.length, targeted: target.size ? [...target] : 'all' });
    }
);
