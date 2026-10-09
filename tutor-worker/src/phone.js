// Signing in with a phone number needs the email that belongs to it. That lookup used to be a public read of
// phoneIndex/{number} in the database (anyone who knew a number could read the email). Now it goes through the
// Worker: one number per request, a strict rate limit per caller, and the same answer shape whether the number
// exists or not.
export const PHONE_RE = /^[0-9]{7,20}$/;
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

// db = the Worker's database access ({ get(path) }). Returns the email, or '' when there is none.
export async function phoneEmail(db, pk) {
    if (typeof pk !== 'string' || !PHONE_RE.test(pk)) return '';
    const rec = await db.get('phoneIndex/' + pk);
    const e = rec && typeof rec.e === 'string' ? rec.e : '';
    return e.length <= 120 && EMAIL_RE.test(e) ? e : '';
}
