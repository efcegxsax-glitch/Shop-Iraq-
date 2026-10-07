// رسائل التحفيز: the admin schedules a motivation push once, for some days, or every day, at a time of day (Baghdad time, UTC+3).
// A plan is { t: title, b: body, time: 'HH:MM', mode: 'forever' | 'days', n: number of days, start: 'YYYY-MM-DD', wd: [weekdays 0-6, 0 = Sunday], on: false to pause }.
// "Once" is 'days' with n = 1. Nothing is stored per send: the Worker asks, every 15 minutes, which plans fall due in the next
// minutes (motivDue) and gives OneSignal an exact send time; a stable idempotency key per plan and day stops a repeat.
const OFFSET = 3 * 3600000;                 // Iraq has no daylight saving time
const DAY = 86400000;
export const MOTIV_WINDOW = { back: 5 * 60000, ahead: 17 * 60000 };

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const dayNo = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / DAY);          // days since 1970 for a calendar date
const dateOf = (no) => new Date(no * DAY).toISOString().slice(0, 10);

// a plan the Worker accepts (everything else is ignored)
export function okPlan(p) {
    return !!p && typeof p === 'object' && typeof p.t === 'string' && p.t.trim().length > 0 && isTime(p.time) && isDate(p.start)
        && (p.mode === 'forever' || (p.mode === 'days' && Number.isInteger(p.n) && p.n >= 1 && p.n <= 366)) && p.on !== false;
}

// the sends of one plan that fall in [now - back, now + ahead): [{ ts (UTC ms), date }]
export function motivDue(p, now, win) {
    if (!okPlan(p)) return [];
    win = win || MOTIV_WINDOW;
    const wd = Array.isArray(p.wd) && p.wd.length ? p.wd : [0, 1, 2, 3, 4, 5, 6];
    const [hh, mm] = p.time.split(':').map(Number), local = now + OFFSET, today = Math.floor(local / DAY), out = [], s0 = dayNo(p.start);
    for (let d = today - 1; d <= today + 1; d++) {
        if (d < s0) continue;
        if (p.mode === 'days' && d >= s0 + p.n) continue;
        if (!wd.includes(new Date(d * DAY).getUTCDay())) continue;
        const ts = d * DAY + (hh * 60 + mm) * 60000 - OFFSET;
        if (ts >= now - win.back && ts < now + win.ahead) out.push({ ts, date: dateOf(d) });
    }
    return out;
}

// what the schedule list shows: "every day at 14:30", "3 days from 2026-10-08 at 14:30"
export function motivSummary(p) {
    if (!okPlan(p)) return '';
    const wd = Array.isArray(p.wd) && p.wd.length && p.wd.length < 7 ? ' (أيام محددة)' : '';
    if (p.mode === 'forever') return 'كل يوم الساعة ' + p.time + wd;
    return p.n === 1 ? 'يوم ' + p.start + ' الساعة ' + p.time : p.n + ' أيام من ' + p.start + ' الساعة ' + p.time + wd;
}
