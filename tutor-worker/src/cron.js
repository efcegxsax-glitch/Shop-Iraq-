// Which job a scheduled run is for. The Worker's schedules live in wrangler.toml. Only the tutor's own schedule and the 15-minute one are
// recognised by their exact text; any other schedule text is the news watcher (it is safe to run: one watcher at a time, nothing is sent
// twice), so a schedule can never make the AI tutor, "المعلم", send a push by mistake. tools/cron-test.mjs checks this.
export const COACH_CRON = '7 6,10,14,18 * * *';   // the tutor's own messages: 9:07, 13:07, 17:07, 21:07 Baghdad
export const POLL_CRON = '*/15 * * * *';          // teachers' videos / Telegram posts, motivation pushes
export const NEWS_CRON = '* * * * *';             // the Telegram news bot: every minute, 3 looks inside it
export const routeCron = (c) => {
    const s = String(c || '').trim().replace(/\s+/g, ' ');
    return !s ? '' : s === COACH_CRON ? 'coach' : s === POLL_CRON ? 'poll' : 'news';
};
