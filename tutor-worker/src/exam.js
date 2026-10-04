// Small pure helpers for the exams feature and the new-video pushes (tested in tools/exam-test.mjs).

// An exam from the model is cut down to what the app can show: at most 12 questions with 10 parts each, whole-number marks.
export function cleanExam(e, o) {
    const secs = (e && Array.isArray(e.sections) ? e.sections : []).filter((x) => x && typeof x === 'object').slice(0, 12).map((x, i) => ({
        n: String(x.n || 'س' + (i + 1)).slice(0, 12), head: String(x.head || '').slice(0, 200), marks: Math.max(0, Math.min(100, Math.round(Number(x.marks) || 0))),
        parts: (Array.isArray(x.parts) ? x.parts : []).filter((p) => p && typeof p === 'object').slice(0, 10).map((p) => ({ l: String(p.l || '').slice(0, 6), q: String(p.q || '').slice(0, 900), m: Math.max(0, Math.min(100, Math.round(Number(p.m) || 0))) })).filter((p) => p.q),
    })).filter((x) => x.parts.length);
    return secs.length ? { title: String(e.title || o.chapter || 'امتحان').slice(0, 100), sections: secs } : null;
}

// a fixed UUID made from a text (OneSignal wants its idempotency key in UUID form)
export async function uuidOf(text) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).slice(0, 16);
    h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
    const x = Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
    return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
}
