// The weekly study plan the tutor writes (tested in tools/plan-test.mjs): the prompt, the JSON shape asked from the model,
// and the clean-up that cuts whatever comes back down to what the app can show.

export const PLAN_SYSTEM = `أنت "المعلم"، مدرس عراقي يرتب خطة دراسة أسبوعية لطالب سادس إعدادي من تقريره بالتطبيق (امتحاناته القريبة، درجاته، جدول محاضراته، دفتر غلطاته، آخر دراسته).
- وزع الدراسة على الأيام اللي انعطيت. كل يوم من 2 إلى 4 مهام، ومجموع دقائقه ما يزيد على الوقت المتاح بذاك اليوم.
- ابدأ بالمواد اللي امتحانها أقرب، ثم الأضعف بالدرجات، ثم الباقي. لا تحط مادة وحدة كل الأيام.
- كل مهمة محددة وقابلة للتنفيذ: شنو يسوي بالضبط ("حل أسئلة الفصل الثاني وراجع الأخطاء"، "مراجعة سريعة لقوانين الباب"، "راجع أسئلة دفتر الغلطات") مو "ادرس فيزياء" فقط.
- راعي جدول المحاضرات: اليوم اللي بي محاضرات كثيرة خفف عليه، وخلي يوم واحد خفيف للراحة والمراجعة.
- إذا دفتر الغلطات بي أسئلة مستحقة، خصص لها 10 إلى 15 دقيقة بأول أيام الخطة.
- لا تخترع امتحانات ولا درجات مو موجودة بالتقرير. إذا التقرير قليل المعلومات، سوي خطة متوازنة للمواد العلمية والأدبية الأساسية.
- اكتب بلهجة عراقية بسيطة ومشجعة، وبالملخص جملة وحدة تقول شنو ركزت عليه.`;

export const PLAN_JSON_SCHEMA = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        days: { type: 'array', items: { type: 'object', properties: { tasks: { type: 'array', items: { type: 'object', properties: { s: { type: 'string' }, t: { type: 'string' }, m: { type: 'integer' } }, required: ['s', 't', 'm'] } } }, required: ['tasks'] } },
    },
    required: ['summary', 'days'],
};

// days = [{ date: 'YYYY-MM-DD', name: 'السبت' }, ...] (1 to 7, from today); hours = study hours the student has each day
export function cleanDays(days) {
    return (Array.isArray(days) ? days : []).filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) && typeof d.name === 'string').slice(0, 7)
        .map((d) => ({ date: String(d.date), name: String(d.name).slice(0, 12) }));
}

export function planPrompt(days, hours, note) {
    const h = Math.max(1, Math.min(8, Math.round(Number(hours) || 2)));
    return 'سوي لي خطة دراسة لـ ' + days.length + ' أيام، من أول يوم بالقائمة:\n' + days.map((d, i) => (i + 1) + '. ' + d.name + ' ' + d.date).join('\n')
        + '\nالوقت المتاح للدراسة بكل يوم: ' + h + ' ساعة (' + h * 60 + ' دقيقة كحد أعلى).'
        + (note ? '\nملاحظة الطالب: ' + note : '') + '\nرجع الأيام بنفس الترتيب بالضبط.';
}

export function cleanPlan(r, days, hours) {
    const cap = Math.max(1, Math.min(8, Math.round(Number(hours) || 2))) * 60;
    const src = r && Array.isArray(r.days) ? r.days : [];
    const out = days.map((d, i) => {
        let left = cap;
        const tasks = ((src[i] && Array.isArray(src[i].tasks)) ? src[i].tasks : []).filter((x) => x && typeof x === 'object' && String(x.t || '').trim()).slice(0, 5).map((x) => {
            const m = Math.max(10, Math.min(180, Math.round(Number(x.m) || 30)));
            return { s: String(x.s || '').trim().slice(0, 30), t: String(x.t).trim().slice(0, 160), m };
        }).filter((x) => { if (x.m > left) return false; left -= x.m; return true; });
        return { date: d.date, d: d.name, tasks };
    });
    return out.some((d) => d.tasks.length) ? { summary: String((r && r.summary) || '').trim().slice(0, 240), days: out } : null;
}
