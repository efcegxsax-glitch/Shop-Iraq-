// Checks the exam helpers in tutor-worker/src/exam.js.
//   node tools/exam-test.mjs
import { cleanExam, uuidOf } from '../tutor-worker/src/exam.js';
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
const o = { chapter: 'الفصل الأول' };
t('null', cleanExam(null, o) === null && cleanExam({}, o) === null && cleanExam({ sections: 'x' }, o) === null);
t('sections without parts are dropped', cleanExam({ sections: [{ n: 'س1', head: 'h', marks: 20, parts: [] }] }, o) === null);
const e = cleanExam({ title: '', sections: [{ n: 'س1', head: 'أجب', marks: 20.4, parts: [{ l: 'أ', q: 'سؤال', m: 10.6 }, { l: 'ب', q: '', m: 5 }] }] }, o);
t('title falls back to the chapter', e && e.title === 'الفصل الأول');
t('marks are whole numbers and empty questions dropped', e && e.sections[0].marks === 20 && e.sections[0].parts.length === 1 && e.sections[0].parts[0].m === 11);
const big = cleanExam({ title: 'x'.repeat(500), sections: Array.from({ length: 30 }, (_, i) => ({ n: 'س' + i, head: 'h'.repeat(900), marks: 999, parts: Array.from({ length: 40 }, () => ({ l: 'أ'.repeat(30), q: 'q'.repeat(5000), m: -5 })) })) }, o);
t('limits: 12 sections, 10 parts, text cut, marks clamped', big.sections.length === 12 && big.sections[0].parts.length === 10 && big.title.length === 100 && big.sections[0].head.length === 200 && big.sections[0].parts[0].q.length === 900 && big.sections[0].marks === 100 && big.sections[0].parts[0].m === 0 && big.sections[0].parts[0].l.length === 6);
t('junk numbers', cleanExam({ sections: [{ marks: 'x', parts: [{ q: 'q', m: NaN }] }] }, o).sections[0].marks === 0);
t('null entries are skipped', cleanExam({ sections: [null, 5, { parts: [null, { q: 'q', m: 1 }] }] }, o).sections[0].parts.length === 1);
const u = await uuidOf('yt-abc');
t('uuid shape (version 5, variant 8-b)', /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(u));
t('uuid is stable and differs per text', u === await uuidOf('yt-abc') && u !== await uuidOf('yt-abd'));
console.log(bad ? bad + ' failed' : 'all ' + ok + ' passed'); process.exit(bad ? 1 : 0);
