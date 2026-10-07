// Which job a scheduled run is for. The Worker's schedules live in wrangler.toml; each one is named here, and a schedule that is not
// named does nothing (so adding a schedule can never make the AI tutor, "المعلم", send a push by mistake). tools/cron-test.mjs checks
// that every schedule in wrangler.toml is named here.
export const COACH_CRON = '7 6,10,14,18 * * *';   // the tutor's own messages: 9:07, 13:07, 17:07, 21:07 Baghdad
export const POLL_CRON = '*/15 * * * *';          // teachers' videos / Telegram posts, motivation pushes
export const NEWS_CRON = '* * * * *';             // the Telegram news bot: every minute, 3 looks inside it
export const routeCron = (c) => {
    const s = String(c || '').trim().replace(/\s+/g, ' ');
    return s === COACH_CRON ? 'coach' : s === POLL_CRON ? 'poll' : s === NEWS_CRON ? 'news' : '';
};
