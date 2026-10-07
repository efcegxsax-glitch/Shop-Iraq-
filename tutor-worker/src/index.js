// المعلم الذكي (AI tutor): the app sends a signed-in student's request here; this Worker
// checks the Firebase sign-in, limits how often one student can ask, and asks the model.
// Keys stay in the Worker's secrets. The model: Claude when ANTHROPIC_API_KEY is set,
// otherwise Gemini (GEMINI_API_KEY, which has a free daily allowance).
//
// POST /  Authorization: Bearer <Firebase ID token>
//   mode "chat" (default): { messages: [{ role, content }...], image?: { type, data }, context? }
//     -> server-sent events: data: {"t": "..."} per text chunk, then data: {"done": true, "stop": "..."}
//        or data: {"error": "..."}
//   mode "quiz": { subject, topic?, context? } -> JSON { title, questions: [{ q, choices[4], answer, why }] }
//   mode "nudge": { reasons: [...], context? } -> JSON { text }  (a short message the tutor sends first)
//   mode "cards": { image: { type, data }, subject? } -> JSON { title, cards: [{ q, a }] }  (review cards from a page)
//   mode "food": { text, meal? } -> JSON { items: [{ name, v, why }], score, brain, tip, next[] }  (what the
//     student ate, judged for a student's focus and memory); { ideas: true, meal? } -> varied meal ideas
//   cron (wrangler.toml): the tutor's push messages to every student, see coachPush
//   mode "turn": {} -> JSON { iceServers }  (short-lived Cloudflare TURN credentials for voice calls,
//     when the TURN_KEY_ID and TURN_KEY_API_TOKEN secrets are set; works without a model key)
// context: a short report of the student's studying, written by the app, used to hold them to it.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { GoogleGenAI, ApiError as GeminiError } from '@google/genai';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { cleanExam, uuidOf } from './exam.js';
import { pushTargets, sendAfter } from './push.js';
import { PLAN_SYSTEM, PLAN_JSON_SCHEMA, cleanDays, planPrompt, cleanPlan } from './plan.js';
import { parseFeed, parseChannelPage, parseSearch, plan as ytPlan, ytHeaders, isChannelId , initialData, parseUploads, uploadsUrl } from './yt.js';
import { motivDue } from './motiv.js';
import { isTgName, tgNameOf, parseTgInfo, parseTgPosts, tgOldest, tgPushText } from './tg.js';
import { makeDb } from './fbadmin.js';
import { routeCron } from './cron.js';
import { newsRun, newsLoop, newsAct } from './newsrun.js';

const CLAUDE_MODEL = 'claude-opus-5-5';
// tried in order: when one is overloaded (503), out of free quota (429) or retired (404), the next answers
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-lite-latest', 'gemini-3.8-flash-lite'];
const MAX_TURNS = 20, MAX_CHARS = 4000, MAX_CONTEXT = 3400, MAX_IMAGE_B64 = 2_000_000;
// How a push looks and behaves on Android: big app icon, the app's green, high priority (it shows on the lock screen
// and pops up), visible on the lock screen. No `url` on purpose: a `url` opens the browser; without it a tap opens the
// app itself (web push uses web_url instead).
const PUSH_LOOK = (env) => ({
    large_icon: (env.APP_URL || 'https://efcegxsax-glitch.github.io/Shop-Iraq-/') + 'icons/notif-large.png',
    android_accent_color: 'FF0F766E', priority: 10, android_visibility: 1,
    web_url: env.APP_URL || 'https://efcegxsax-glitch.github.io/Shop-Iraq-/',
});
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const SYSTEM = `أنت "المعلم"، مدرس خصوصي لطلاب المدارس العراقية داخل تطبيق أكـادمي السادس، وأغلبهم بالسادس الإعدادي.

- اشرح بالعربي الواضح، ويصير تستخدم كلمات عراقية خفيفة حتى يحس الطالب قريب منك، بس المصطلحات العلمية تبقى مثل ما مكتوبة بالمنهج العراقي.
- إذا الطالب طلب حل سؤال، حلّه خطوة بخطوة وبيّن ليش كل خطوة، وبالنهاية اكتب الجواب النهائي بوضوح. إذا السؤال يحتمل أكثر من فهم، اسأله شنو يقصد.
- إذا دز صورة، اقرأها وافهمها أول (سؤال، رسم، ملزمة، جدول)، وإذا جزء منها ما مقروء گوله.
- الرياضيات والفيزياء والكيمياء: اكتب المعادلات بسطر واضح بالرموز العادية (مثل x^2 و √ و →) بدون LaTeX.
- خلي الجواب بقد السؤال: السؤال السريع جوابه قصير، والشرح يكون مرتب بعناوين قصيرة ونقاط.
- إذا ما متأكد من معلومة، گول هذا بصراحة واطلب منه يتأكد من الملزمة أو المدرس.
- أنت مسؤول عن تقدمه مثل مدرس حقيقي: إذا تقرير الطالب يبين إنه مقصّر (ما يدرس، الأيام المتتالية انقطعت، درجة نزلت، امتحان قريب وهو ما يراجع)، حاسبه بحزم ولطف: اسأله ليش، اسمع عذره، واقترح خطوة صغيرة يسويها اليوم. لا تهينه ولا تبالغ، وإذا متحسن امدحه بصدق.
- إذا بتقرير الطالب جدول محاضراته، امشي وياه عليه مثل مدرس يتابعه: بيّن له شكد محاضرة عنده اليوم وباچر وبالأسبوع وشنو المحاضرة الجاية، واقترح شنو يراجع من محاضرات باچر، وإذا سألك عن جدوله جاوبه منه بالضبط وما تخترع محاضرات مو مكتوبة.
- تكدر تقترح عليه "اختبار مفاجئ" بالمادة اللي ضعيف بيها.
- ركز على الدراسة. إذا طلب شي بعيد عن الدراسة، جاوبه بلطف وبجملة وحدة ورجّعه للدراسة.
- لا تستخدم إيموجي.`;

const QUIZ_SYSTEM = `أنت مدرس عراقي تكتب اختبار قصير للسادس الإعدادي حسب المنهج العراقي. اكتب 5 أسئلة اختيار من متعدد، لكل سؤال 4 خيارات وخيار واحد صحيح، وشرح قصير (جملة أو جملتين) ليش هذا الجواب الصحيح. خلي الأسئلة متدرجة من السهل للأصعب، وواضحة ومرتبطة بالمادة والموضوع المطلوب، وبدون LaTeX. رقم الجواب الصحيح يبدأ من 0.`;

const NUDGE_SYSTEM = `أنت "المعلم" بتطبيق أكـادمي السادس، وتكتب رسالة قصيرة تبدي بيها المحادثة ويا الطالب من نفسك، مثل مدرس يهتم بيه. جملتين أو ثلاث بالكثير، بلهجة عراقية خفيفة، حازمة ولطيفة، تذكر السبب الحقيقي من تقريره (مثلاً صارله أيام ما يدرس، أو درجته نزلت، أو امتحانه قريب)، وتنتهي بسؤال أو اقتراح خطوة صغيرة. لا تهينه ولا تستخدم إيموجي.`;

const CARDS_SYSTEM = `أنت مدرس عراقي تحول صفحة من ملزمة أو كتاب للسادس الإعدادي إلى بطاقات مراجعة. اقرأ الصورة كلها أول، وبعدين اكتب من 5 إلى 15 بطاقة تغطي أهم ما بيها: تعاريف، قوانين، علاقات، أسباب ونتائج، مقارنات، وأمثلة. كل بطاقة: سؤال قصير واضح بوجه، وجواب دقيق ومختصر بالوجه الثاني بنفس كلمات المنهج. اكتب المعادلات بالرموز العادية بدون LaTeX. لا تخترع شي مو موجود بالصورة. إذا الصورة ما بيها محتوى دراسي أو ما مقروءة، رجع قائمة بطاقات فارغة. العنوان: موضوع الصفحة بكلمات قليلة.`;
const Cards = z.object({ title: z.string(), cards: z.array(z.object({ q: z.string(), a: z.string() })) });
const CARDS_JSON_SCHEMA = {
    type: 'object',
    properties: { title: { type: 'string' }, cards: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' } }, required: ['q', 'a'] } } },
    required: ['title', 'cards'],
};
function cleanCards(r) {
    const cards = (r && Array.isArray(r.cards) ? r.cards : []).filter((c) => c && typeof c.q === 'string' && typeof c.a === 'string' && c.q.trim() && c.a.trim())
        .slice(0, 20).map((c) => ({ q: c.q.trim().slice(0, 300), a: c.a.trim().slice(0, 600) }));
    return { title: String((r && r.title) || '').slice(0, 80), cards };
}

const FOOD_SYSTEM = `أنت "المعلم" بتطبيق أكـادمي السادس، وهنا تساعد الطالب بأكله حتى يركز ويحفظ أحسن. الطالب يكتبلك شنو أكل (أكل عراقي غالباً). لكل أكلة: اسمها، وحكمك عليها (good زين، ok عادي، bad يضر إذا يكثر منه) وسبب قصير بجملة وحدة بلهجة عراقية خفيفة عن تأثيرها على التركيز والذاكرة والطاقة والنوم. بعدين: درجة الوجبة من 1 إلى 10، وجملة عن تأثيرها على الدماغ والدراسة، ونصيحة وحدة عملية، و3 اقتراحات متنوعة لأكلات عراقية بسيطة ورخيصة تقوي الذاكرة يكدر يجربها بالوجبة الجاية. كن واقعي ولطيف وبدون تخويف، ولا تعطي نصائح طبية أو حمية قاسية، ولا تستخدم إيموجي. إذا اللي كتبه مو أكل، رجع قائمة أكلات فارغة.`;
const FOOD_IDEAS_SYSTEM = `أنت "المعلم" بتطبيق أكـادمي السادس. اقترح على الطالب 5 وجبات عراقية بسيطة ورخيصة ومتنوعة للوجبة المطلوبة، تقوي الذاكرة والتركيز وتعطي طاقة ثابتة للدراسة. لكل وجبة: اسمها بكلمات قليلة، والحكم good، وسبب قصير بجملة وحدة شنو تفيد بالدراسة. نوّع بين البروتين والخضرة والحبوب الكاملة والفواكه والمكسرات، وتجنب التكرار. الدرجة 10، وجملة عامة عن الأكل والدراسة، ونصيحة وحدة، والاقتراحات next فارغة. بلهجة عراقية خفيفة وبدون إيموجي.`;
const Food = z.object({
    items: z.array(z.object({ name: z.string(), v: z.enum(['good', 'ok', 'bad']), why: z.string() })),
    score: z.number().int(), brain: z.string(), tip: z.string(), next: z.array(z.string()),
});
const FOOD_JSON_SCHEMA = {
    type: 'object',
    properties: {
        items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, v: { type: 'string', enum: ['good', 'ok', 'bad'] }, why: { type: 'string' } }, required: ['name', 'v', 'why'] } },
        score: { type: 'integer' }, brain: { type: 'string' }, tip: { type: 'string' }, next: { type: 'array', items: { type: 'string' } },
    },
    required: ['items', 'score', 'brain', 'tip', 'next'],
};
function cleanFood(r) {
    const items = (r && Array.isArray(r.items) ? r.items : []).filter((x) => x && typeof x.name === 'string' && x.name.trim())
        .slice(0, 12).map((x) => ({ name: x.name.trim().slice(0, 60), v: ['good', 'ok', 'bad'].includes(x.v) ? x.v : 'ok', why: String(x.why || '').trim().slice(0, 240) }));
    const sc = Math.round(Number(r && r.score));
    return {
        items, score: sc >= 1 && sc <= 10 ? sc : 0,
        brain: String((r && r.brain) || '').trim().slice(0, 300), tip: String((r && r.tip) || '').trim().slice(0, 300),
        next: (r && Array.isArray(r.next) ? r.next : []).map((x) => String(x).trim().slice(0, 100)).filter(Boolean).slice(0, 5),
    };
}

const Plan = z.object({
    summary: z.string(),
    days: z.array(z.object({ tasks: z.array(z.object({ s: z.string(), t: z.string(), m: z.number().int() })) })),
});
const Quiz = z.object({
    title: z.string(),
    questions: z.array(z.object({ q: z.string(), choices: z.array(z.string()), answer: z.number().int(), why: z.string() })),
});
const QUIZ_JSON_SCHEMA = {
    type: 'object',
    properties: {
        title: { type: 'string' },
        questions: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' }, why: { type: 'string' } }, required: ['q', 'choices', 'answer', 'why'] } },
    },
    required: ['title', 'questions'],
};

let jwks;
async function verifyStudent(req, env, out) {
    const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
    if (!m) return null;
    jwks = jwks || createRemoteJWKSet(new URL(env.JWKS_URL || 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
    try {
        const { payload } = await jwtVerify(m[1], jwks, { issuer: 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID, audience: env.FIREBASE_PROJECT_ID });
        if (out) out.email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
        return payload.sub || null;
    } catch {
        return null;
    }
}

function cors(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    return {
        'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}
const json = (status, body, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n).trim() : '');

// Plain text turns, alternating, starting with the student; one optional photo on the last one.
function cleanMessages(body) {
    const list = Array.isArray(body && body.messages) ? body.messages.slice(-MAX_TURNS) : [];
    const out = [];
    for (const msg of list) {
        const role = msg && (msg.role === 'user' || msg.role === 'assistant') ? msg.role : null;
        const text = str(msg && msg.content, MAX_CHARS);
        if (!role || !text) continue;
        if (out.length && out[out.length - 1].role === role) out[out.length - 1].text += '\n\n' + text;
        else out.push({ role, text });
    }
    // the tutor may have written first (a nudge); the model needs the chat to start with the student
    if (out.length && out[0].role !== 'user') out.unshift({ role: 'user', text: '(فتحت المحادثة)' });
    if (!out.length || out[out.length - 1].role !== 'user') return null;
    const img = body.image;
    const image = img && IMAGE_TYPES.includes(img.type) && typeof img.data === 'string' && img.data.length <= MAX_IMAGE_B64 && /^[A-Za-z0-9+/=]+$/.test(img.data) ? { type: img.type, data: img.data } : null;
    return { turns: out, image };
}

// A quiz from the model is checked before it reaches the app.
function cleanQuiz(q) {
    const questions = (q && Array.isArray(q.questions) ? q.questions : []).filter((x) => x && typeof x.q === 'string' && Array.isArray(x.choices) && x.choices.length >= 2 && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.choices.length)
        .slice(0, 6).map((x) => ({ q: x.q.slice(0, 500), choices: x.choices.slice(0, 5).map((c) => String(c).slice(0, 200)), answer: x.answer, why: String(x.why || '').slice(0, 500) }));
    return questions.length ? { title: String((q && q.title) || 'اختبار مفاجئ').slice(0, 100), questions } : null;
}

// ---------- Claude ----------
function claudeClient(env) { return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) }); }
function claudeSystem(base, context) {
    // the stable instructions are cached; the student's report changes, so it comes after
    const sys = [{ type: 'text', text: base, cache_control: { type: 'ephemeral' } }];
    if (context) sys.push({ type: 'text', text: 'تقرير الطالب من التطبيق:\n' + context });
    return sys;
}
async function claudeChat(env, { turns, image }, context, uid, send) {
    const messages = turns.map((t, i) => ({
        role: t.role,
        content: i === turns.length - 1 && image
            ? [{ type: 'image', source: { type: 'base64', media_type: image.type, data: image.data } }, { type: 'text', text: t.text }]
            : t.text,
    }));
    const stream = claudeClient(env).beta.messages.stream({
        model: CLAUDE_MODEL, max_tokens: 8000, system: claudeSystem(SYSTEM, context), messages,
        output_config: { effort: 'medium' },
        // if the model declines a question, another model answers it instead
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        metadata: { user_id: uid },
    });
    stream.on('text', (t) => { send({ t }); });
    const final = await stream.finalMessage();
    return final.stop_reason;
}
async function claudeQuiz(env, prompt, context, uid) {
    const res = await claudeClient(env).messages.parse({
        model: CLAUDE_MODEL, max_tokens: 8000, system: claudeSystem(QUIZ_SYSTEM, context),
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort: 'low', format: zodOutputFormat(Quiz) },
        metadata: { user_id: uid },
    });
    if (res.stop_reason === 'refusal') return null;
    return res.parsed_output;
}
async function claudeNudge(env, prompt, context, uid) {
    const res = await claudeClient(env).messages.create({
        model: CLAUDE_MODEL, max_tokens: 2000, system: claudeSystem(NUDGE_SYSTEM, context),
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort: 'low' },
        metadata: { user_id: uid },
    });
    if (res.stop_reason === 'refusal') return '';
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

async function claudeCards(env, image, prompt, uid) {
    const res = await claudeClient(env).messages.parse({
        model: CLAUDE_MODEL, max_tokens: 8000, system: CARDS_SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: image.type, data: image.data } }, { type: 'text', text: prompt }] }],
        output_config: { effort: 'low', format: zodOutputFormat(Cards) },
        metadata: { user_id: uid },
    });
    if (res.stop_reason === 'refusal') return null;
    return res.parsed_output;
}

async function claudePlan(env, prompt, context, uid) {
    const res = await claudeClient(env).messages.parse({
        model: CLAUDE_MODEL, max_tokens: 6000, system: claudeSystem(PLAN_SYSTEM, context),
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort: 'low', format: zodOutputFormat(Plan) },
        metadata: { user_id: uid },
    });
    if (res.stop_reason === 'refusal') return null;
    return res.parsed_output;
}

async function claudeFood(env, system, prompt, context, uid) {
    const res = await claudeClient(env).messages.parse({
        model: CLAUDE_MODEL, max_tokens: 4000, system: claudeSystem(system, context),
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort: 'low', format: zodOutputFormat(Food) },
        metadata: { user_id: uid },
    });
    if (res.stop_reason === 'refusal') return null;
    return res.parsed_output;
}

// ---------- exams from a handout (admin only) ----------
const EXAM_SYSTEM = `أنت أستاذ عراقي خبير بأسئلة الامتحانات الوزارية للسادس الإعدادي. تكتب ورقة امتحان كاملة من مادة الملزمة المعطاة فقط، بنفس أسلوب الأسئلة الوزارية العراقية: أسئلة رقمها س1 وس2 وهكذا، كل سؤال بيه فروع (أ، ب، ج...) ولكل فرع درجة، وتحت كل س جملة توجيه مثل "أجب عن فرعين فقط" أو "أجب عن الفروع كلها". نوّع الأسئلة: عرّف، علّل، ماذا يحدث عند، قارن، اختر الإجابة الصحيحة، صح وخطأ، أكمل الفراغ، مسائل وحسابات. اكتب بعربية فصحى سهلة ودقيقة. لا تسأل عن شي مو موجود بمادة الملزمة. اكتب المعادلات بالرموز العادية بدون LaTeX. مجموع درجات الفروع المطلوبة لازم يساوي الدرجة الكلية. لا تكتب الإجابات.`;
const Exam = z.object({
    title: z.string(),
    sections: z.array(z.object({ n: z.string(), head: z.string(), marks: z.number(), parts: z.array(z.object({ l: z.string(), q: z.string(), m: z.number() })) })),
});
async function claudeExam(env, prompt, uid) {
    const res = await claudeClient(env).messages.parse({
        model: CLAUDE_MODEL, max_tokens: 16000, system: EXAM_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort: 'medium', format: zodOutputFormat(Exam) },
        metadata: { user_id: uid },
    });
    if (res.stop_reason === 'refusal') return null;
    return res.parsed_output;
}
async function claudeRead(env, images, uid) {
    const res = await claudeClient(env).messages.create({
        model: CLAUDE_MODEL, max_tokens: 12000,
        system: 'انسخ نص هذه الصفحات من ملزمة دراسية حرفياً وبالترتيب، بالعربية كما هي. اكتب المعادلات بالرموز العادية. الجداول والرسوم: وصفها بجملة قصيرة. لا تضيف شرح من عندك. إذا صفحة فاضية اكتب (فارغة).',
        messages: [{ role: 'user', content: [...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.type, data: im.data } })), { type: 'text', text: 'انسخ النص.' }] }],
        output_config: { effort: 'low' },
        metadata: { user_id: uid },
    });
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}
// ---------- Gemini ----------
function geminiClient(env) { return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, ...(env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: env.GEMINI_BASE_URL } } : {}) }); }
const geminiSystem = (base, context) => (context ? base + '\n\nتقرير الطالب من التطبيق:\n' + context : base);
const geminiModels = (env) => (env.GEMINI_MODEL ? [env.GEMINI_MODEL, ...GEMINI_MODELS.filter((m) => m !== env.GEMINI_MODEL)] : GEMINI_MODELS);
const geminiRetry = (err) => err instanceof GeminiError && [404, 429, 500, 503].includes(err.status);
async function geminiTry(env, fn) {
    let last;
    for (const model of geminiModels(env)) {
        try { return await fn(model); } catch (err) {
            last = err;
            if (!geminiRetry(err)) throw err;
            console.warn('gemini', model, err.status);
        }
    }
    throw last;
}
async function geminiChat(env, { turns, image }, context, uid, send) {
    const contents = turns.map((t, i) => ({
        role: t.role === 'assistant' ? 'model' : 'user',
        parts: i === turns.length - 1 && image ? [{ inlineData: { mimeType: image.type, data: image.data } }, { text: t.text }] : [{ text: t.text }],
    }));
    let finish = '', sent = false;
    // another model may answer only while nothing has been sent yet
    await geminiTry(env, async (model) => {
        if (sent) return;
        const stream = await geminiClient(env).models.generateContentStream({
            model, contents,
            config: { systemInstruction: geminiSystem(SYSTEM, context), maxOutputTokens: 8000 },
        });
        try {
            for await (const chunk of stream) {
                if (chunk.text) { sent = true; send({ t: chunk.text }); }
                const f = chunk.candidates && chunk.candidates[0] && chunk.candidates[0].finishReason;
                if (f) finish = f;
            }
        } catch (err) {
            if (sent) throw Object.assign(new Error('cut'), { status: 0 });
            throw err;
        }
    });
    return finish === 'MAX_TOKENS' ? 'max_tokens' : finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' ? 'refusal' : 'end_turn';
}
async function geminiQuiz(env, prompt, context) {
    const res = await geminiTry(env, (model) => geminiClient(env).models.generateContent({
        model, contents: prompt,
        config: { systemInstruction: geminiSystem(QUIZ_SYSTEM, context), responseMimeType: 'application/json', responseJsonSchema: QUIZ_JSON_SCHEMA, maxOutputTokens: 8000 },
    }));
    try { return JSON.parse(res.text || ''); } catch { return null; }
}
async function geminiNudge(env, prompt, context) {
    const res = await geminiTry(env, (model) => geminiClient(env).models.generateContent({
        model, contents: prompt,
        config: { systemInstruction: geminiSystem(NUDGE_SYSTEM, context), maxOutputTokens: 2000 },
    }));
    return String(res.text || '').trim();
}

async function geminiCards(env, image, prompt) {
    const res = await geminiTry(env, (model) => geminiClient(env).models.generateContent({
        model, contents: [{ role: 'user', parts: [{ inlineData: { mimeType: image.type, data: image.data } }, { text: prompt }] }],
        config: { systemInstruction: CARDS_SYSTEM, responseMimeType: 'application/json', responseJsonSchema: CARDS_JSON_SCHEMA, maxOutputTokens: 8000 },
    }));
    try { return JSON.parse(res.text || ''); } catch { return null; }
}

async function geminiPlan(env, prompt, context) {
    const res = await geminiTry(env, (model) => geminiClient(env).models.generateContent({
        model, contents: prompt,
        config: { systemInstruction: geminiSystem(PLAN_SYSTEM, context), responseMimeType: 'application/json', responseJsonSchema: PLAN_JSON_SCHEMA, maxOutputTokens: 6000 },
    }));
    try { return JSON.parse(res.text || ''); } catch { return null; }
}

async function geminiFood(env, system, prompt, context) {
    const res = await geminiTry(env, (model) => geminiClient(env).models.generateContent({
        model, contents: prompt,
        config: { systemInstruction: geminiSystem(system, context), responseMimeType: 'application/json', responseJsonSchema: FOOD_JSON_SCHEMA, maxOutputTokens: 4000 },
    }));
    try { return JSON.parse(res.text || ''); } catch { return null; }
}

function errorCode(err) {
    if (err instanceof Anthropic.APIError || err instanceof GeminiError) {
        const s = err.status;
        return s === 429 || s === 503 || s === 500 || s === 529 ? 'busy' : s === 401 || s === 403 ? 'key' : s === 400 ? 'bad_request' : 'api_' + (s || 'error');
    }
    return 'network';
}

// Voice calls: a TURN relay lets two phones behind carrier NAT reach each other. The media stays
// encrypted end to end (DTLS-SRTP); the relay only forwards packets it can't read.
async function turnServers(env) {
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return null;
    const base = (env.TURN_API_BASE || 'https://rtc.live.cloudflare.com') + '/v1/turn/keys/' + encodeURIComponent(env.TURN_KEY_ID) + '/credentials/';
    const ask = (path) => fetch(base + path, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.TURN_KEY_API_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 6 * 3600 }),
    });
    try {
        let res = await ask('generate-ice-servers');
        if (res.status === 404) res = await ask('generate');
        if (!res.ok) { console.error('turn', res.status); return null; }
        const r = await res.json();
        const list = (Array.isArray(r.iceServers) ? r.iceServers : [r.iceServers]).filter((x) => x && x.urls);
        // browsers refuse port 53, so those addresses only slow the connection down
        return list.map((x) => ({ ...x, urls: [].concat(x.urls).filter((u) => !/:53(\?|$)/.test(u)) })).filter((x) => x.urls.length);
    } catch (err) {
        console.error('turn', err && err.message);
        return null;
    }
}

// ---------- the tutor's messages to every student (cron, through OneSignal web push) ----------
// Four times a day (wrangler.toml [triggers]); only when the panel hasn't switched them off
// (siteConfig/features/coach) and only to students who didn't switch them off (tag coach=off).
// A tap opens the app with the message, which then joins the student's chat with the tutor.
// (js/tutor.js COACH_PUSHED keeps the same texts: the app only accepts these from a link)
const COACH_PUSH = [
    'هذا مستقبلك انت، مو مستقبل أحد غيرك. محد راح يفيدك غير تعبك.',
    'بالامتحان محد راح يكون وياك. لا صديق ولا تلفون. بس انت واللي حفظته.',
    'هاي شدة وتخلص. تعب نفسك هسه، وترتاح باچر.',
    'التلفون يكدر ينتظر، الامتحان ما ينتظر أحد.',
    'كل ساعة تضيعها هسه راح تتمناها ليلة الامتحان، وما راح ترجع.',
    'أهلك تعبوا عليك سنين. ردلهم التعب بنتيجة يرفعون بيها راسهم.',
    'شكد مرة كلت باچر أبدي؟ باچر ما يجي. ابدي هسه ولو بعشر دقايق.',
    'ليش متكاسل؟ وراك ناس تنتظر تشوفك تطيح حتى تشمت. لا تنطيهم هالفرحة.',
    'التعب يروح، بس النتيجة تبقى وياك العمر كله.',
    'محد يشيل همك. شيل همك انت وافتح الكتاب.',
    'الندم أصعب من الدراسة بهواية. اختار التعب اللي ينفعك.',
    'الناس راح تسأل شجبت، محد راح يسأل شكد تعبت. خلي الجواب يرفع راسك.',
    'اللي يزرع هسه يحصد باچر. شنو زرعت اليوم؟',
    'الأيام تركض، والامتحان يقرب يوم بعد يوم. وانت وين؟',
    'حتى خطوة صغيرة اليوم تفرق. افتح كتابك ولو عشر دقايق.',
    'ترضى تشوف زملاءك بالكلية اللي تحلم بيها وانت لا؟ يلا گوم.',
];
const COACH_NIGHT = [
    'صار الليل. إذا درست اليوم نام زين، النوم يثبت الحفظ. وإذا ما درست، ربع ساعة قبل النوم وباچر صفحة جديدة.',
    'لا تسهر على التلفون. نومك المبكر نص نجاحك باچر.',
];
async function coachPush(env, when) {
    if (!env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_APP_ID) return 'no_key';
    if (env.FIREBASE_DB_URL) {
        try {
            const r = await fetch(env.FIREBASE_DB_URL.replace(/\/$/, '') + '/siteConfig/features/coach.json');
            if (r.ok && (await r.json()) === false) return 'off';
        } catch { /* the panel switch couldn't be read: send anyway */ }
    }
    const hour = (new Date(when).getUTCHours() + 3) % 24; // Baghdad
    const list = hour >= 20 ? COACH_NIGHT : COACH_PUSH;
    const text = list[Math.floor(Math.random() * list.length)];
    const res = await fetch('https://api.onesignal.com/notifications?c=push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Key ' + env.ONESIGNAL_REST_API_KEY },
        body: JSON.stringify({
            app_id: env.ONESIGNAL_APP_ID,
            target_channel: 'push',
            filters: [{ field: 'tag', key: 'coach', relation: 'not_exists' }, { operator: 'OR' }, { field: 'tag', key: 'coach', relation: '=', value: 'on' }],
            headings: { en: 'المعلم', ar: 'المعلم' },
            contents: { en: text, ar: text },
            ...PUSH_LOOK(env),
            web_url: (env.APP_URL || 'https://efcegxsax-glitch.github.io/Shop-Iraq-/') + '?coach=' + encodeURIComponent(text),
            data: { coach: text },
            web_push_topic: 'isp-coach',
            ttl: 3 * 3600,
            // one push per slot (Baghdad date and hour): a repeated run of the same slot is answered with the first one
            idempotency_key: await uuidOf('coach-' + new Date(when + 3 * 3600000).toISOString().slice(0, 13)),
        }),
    });
    if (!res.ok) console.error('coach push', res.status, await res.text().catch(() => ''));
    return res.ok ? 'sent' : 'error_' + res.status;
}

// ---------- a push for a call or a message (the app asks right after writing it) ----------
// The Worker never trusts the request: it reads the call or the message from the database with the caller's own
// sign-in (so the database rules decide what the caller may see) and only pushes when that record really exists, is
// from this caller to this person, and is fresh. The push goes to the receiver only (OneSignal external id = uid).
const UID_RE = /^[A-Za-z0-9]{20,40}$/;
async function dbGet(env, path, token) {
    if (!env.FIREBASE_DB_URL) return null;
    try {
        const r = await fetch(env.FIREBASE_DB_URL.replace(/\/$/, '') + '/' + path + '.json?auth=' + encodeURIComponent(token));
        return r.ok ? await r.json() : null;
    } catch { return null; }
}
async function notifyPush(env, uid, token, body, headers, origin) {
    const kind = body.kind === 'call' ? 'call' : body.kind === 'msg' ? 'msg' : '';
    const to = typeof body.to === 'string' ? body.to : '';
    if (!kind || !UID_RE.test(to) || to === uid) return json(400, { error: 'bad' }, headers);
    if (!env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_APP_ID) return json(503, { error: 'no_key' }, headers);
    if (env.PER_NOTIFY) {
        const { success } = await env.PER_NOTIFY.limit({ key: uid + ':' + to + ':' + kind });
        if (!success) return json(429, { error: 'slow_down' }, headers);
    }
    const chat = [uid, to].sort().join('_'), now = Date.now();
    // the receiver has this very chat open on screen right now (the app refreshes this every 25 s): no phone notification
    if (kind === 'msg') {
        const pr = await dbGet(env, 'chatNow/' + to, token);
        if (pr && pr.c === uid && now - Number(pr.at || 0) < 70000) return json(200, { ok: true, skipped: 'in_chat' }, headers);
    }
    // the receiver switched this kind of notification off in the app's settings
    if ((await dbGet(env, 'pushPrefs/' + to + '/' + kind, token)) === false) return json(200, { ok: true, skipped: 'off' }, headers);
    let title, text;
    const name = str(await dbGet(env, 'pub/' + uid + '/n', token), 60) || 'طالب';
    let photoUrl = '';
    if (env.AVATARS) { try { const m = await env.AVATARS.getWithMetadata('a:' + uid); if (m && m.value) photoUrl = origin + '/a/' + uid + '.jpg?v=' + ((m.metadata && m.metadata.t) || 1); } catch {} }
    if (kind === 'call') {
        const c = await dbGet(env, 'calls/' + chat, token);
        const at = Number(c && c.at);
        if (!c || c.from !== uid || c.to !== to || c.st !== 'ring' || !(now - at < 90000 && at - now < 60000)) return json(409, { error: 'no_call' }, headers);
        title = 'مكالمة صوتية'; text = name + ' يتصل بيك';
    } else {
        const mid = Math.floor(Number(body.mid));
        if (!Number.isFinite(mid) || mid < 1) return json(400, { error: 'bad' }, headers);
        const m = await dbGet(env, 'privateChats/' + chat + '/messages/' + mid, token);
        if (!m || m.from !== uid || m.to !== to || !(now - mid < 180000 && mid - now < 60000)) return json(409, { error: 'no_msg' }, headers);
        title = name;
        text = typeof m.text === 'string' && m.text ? str(m.text, 90) : m.type === 'image' ? 'أرسل صورة' : m.type === 'voice' ? 'أرسل رسالة صوتية' : m.type === 'file' ? 'أرسل ملف' : 'رسالة جديدة';
    }
    const r = await fetch('https://api.onesignal.com/notifications?c=push', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Key ' + env.ONESIGNAL_REST_API_KEY },
        body: JSON.stringify({
            app_id: env.ONESIGNAL_APP_ID, target_channel: 'push', include_aliases: { external_id: [to] },
            headings: { en: title, ar: title }, contents: { en: text, ar: text },
            ...PUSH_LOOK(env), ...(photoUrl ? { large_icon: photoUrl } : {}), data: { kind, from: uid, fromName: name }, ttl: kind === 'call' ? 45 : 3600,
            ...(kind === 'msg' ? { collapse_id: 'chat-' + uid, web_push_topic: 'chat-' + uid.slice(0, 20) } : {}),
        }),
    });
    if (!r.ok) console.error('notify', r.status, (await r.text().catch(() => '')).slice(0, 200));
    return json(r.ok ? 200 : 502, { ok: r.ok }, headers);
}

// ---------- lecture reminders (timetable): scheduled pushes that arrive even when the app is closed ----------
// The app sends the student's next lectures (a few lines each); this schedules one OneSignal push per
// lecture for that student only (external id = Firebase uid) and returns the ids so the app can
// cancel them when the timetable changes. Nothing is stored here.
async function tbSync(env, uid, body) {
    if (!env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_APP_ID) return { error: 'no_key' };
    const H = { 'Content-Type': 'application/json', Authorization: 'Key ' + env.ONESIGNAL_REST_API_KEY };
    const cancel = (Array.isArray(body.cancel) ? body.cancel : []).filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 16);
    await Promise.all(cancel.map((id) => fetch('https://api.onesignal.com/notifications/' + id + '?app_id=' + encodeURIComponent(env.ONESIGNAL_APP_ID), { method: 'DELETE', headers: H }).catch(() => null)));
    const now = Date.now();
    const items = (Array.isArray(body.items) ? body.items : []).map((i) => ({ at: Number(i && i.at), title: str(i && i.title, 80), body: str(i && i.body, 200) }))
        .filter((i) => i.title && i.at > now + 20000 && i.at < now + 8 * 86400000).sort((a, b) => a.at - b.at).slice(0, 14);
    const pad = (n) => String(n).padStart(2, '0');
    const ids = [];
    await Promise.all(items.map(async (i) => {
        const d = new Date(i.at);
        const when = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':00 GMT+0000';
        try {
            const r = await fetch('https://api.onesignal.com/notifications?c=push', {
                method: 'POST', headers: H,
                body: JSON.stringify({
                    app_id: env.ONESIGNAL_APP_ID, target_channel: 'push', include_aliases: { external_id: [uid] },
                    headings: { en: i.title, ar: i.title }, contents: { en: i.body, ar: i.body },
                    send_after: when, ttl: 900, data: { tb: 1 }, ...PUSH_LOOK(env),
                }),
            });
            const j = await r.json().catch(() => ({}));
            if (r.ok && j.id) ids.push(j.id); else console.error('tbsync', r.status, JSON.stringify(j).slice(0, 200));
        } catch (e) { console.error('tbsync', e && e.message); }
    }));
    return { ids, scheduled: ids.length, wanted: items.length };
}


// ---- the teachers' videos page: newest videos of the channels the admin picked (cached for 10 minutes) ----
async function ytChannelFeed(id, ctx) {
    const url = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + id;
    const cache = caches.default, key = new Request('https://yt-cache.invalid/f/' + id);
    const hit = await cache.match(key);
    if (hit) return hit.json();
    const r = await fetch(url, { headers: ytHeaders, cf: { cacheTtl: 300 } });
    if (!r.ok) return { name: '', videos: [] };
    const f = parseFeed(await r.text());
    const res = new Response(JSON.stringify(f), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=600' } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return f;
}

// ---- a teacher posted a new video: a push to the students with the video's own title ----
// Every 15 minutes (cron): read the channels the admin added, look at each channel's newest videos and push the ones
// published in the last window. With the KV store each video is pushed once (and a channel's first look never pushes
// its old videos); without it only the last 20 minutes count, so a repeat is unlikely.
async function ytNotify(env, ctx, when) {
    if (!env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_APP_ID || !env.FIREBASE_DB_URL) return 'no_key';
    const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
    let chans = {};
    try {
        const sw = await fetch(base + '/siteConfig/features/tube.json');
        if (sw.ok && (await sw.json()) === false) return 'off';
        const r = await fetch(base + '/ytChannels.json');
        if (r.ok) chans = (await r.json()) || {};
    } catch { return 'db'; }
    const list = Object.values(chans).filter((c) => c && isChannelId(c.id)).slice(0, 30);
    const kv = env.AVATARS, now = Date.now();
    let sent = 0;
    for (const c of list) {
        let f; try { f = await ytChannelFeed(c.id, ctx); } catch { continue; }
        const vids = (f.videos || []).slice(0, 6);
        let fresh;
        if (kv) {
            const first = !(await kv.get('yt:init:' + c.id));
            if (first) { await kv.put('yt:init:' + c.id, '1'); for (const v of vids) await kv.put('yt:sent:' + v.v, '1', { expirationTtl: 30 * 86400 }); continue; }
            fresh = [];
            for (const v of vids) if (v.p > now - 6 * 3600000 && !(await kv.get('yt:sent:' + v.v))) fresh.push(v);
        } else fresh = vids.filter((v) => v.p > when - 15 * 60000 && v.p <= when + 60000);
        for (const v of fresh.slice(0, 2)) {
            if (kv) await kv.put('yt:sent:' + v.v, '1', { expirationTtl: 30 * 86400 });
            const res = await fetch('https://api.onesignal.com/notifications?c=push', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Key ' + env.ONESIGNAL_REST_API_KEY },
                body: JSON.stringify({
                    app_id: env.ONESIGNAL_APP_ID, target_channel: 'push',
                    filters: [{ field: 'tag', key: 'tube', relation: 'not_exists' }, { operator: 'OR' }, { field: 'tag', key: 'tube', relation: '=', value: 'on' }],
                    headings: { en: str(c.n, 40) || 'محاضرة جديدة', ar: str(c.n, 40) || 'محاضرة جديدة' }, contents: { en: v.t, ar: v.t },
                    ...PUSH_LOOK(env), web_url: (env.APP_URL || 'https://efcegxsax-glitch.github.io/Shop-Iraq-/') + '?tube=' + v.v,
                    data: { tube: v.v }, web_push_topic: 'isp-tube-' + v.v.slice(0, 20), ttl: 12 * 3600,
                    // OneSignal answers a second send with the same key by returning the first, so a video is never pushed twice
                    idempotency_key: await uuidOf('yt-' + v.v),
                }),
            });
            if (res.ok) sent++; else console.error('yt push', res.status, (await res.text().catch(() => '')).slice(0, 200));
        }
    }
    return 'sent_' + sent;
}

// ---- Telegram channels (the teachers' Telegram page): the public preview page of a channel, read here ----
// a channel's newest page of posts (cached for 5 minutes), or an older page (?before=<post id>, not cached)
async function tgPage(name, before, ctx, fresh) {
    const cache = caches.default, key = before || fresh ? null : new Request('https://tg-cache.invalid/p/' + name.toLowerCase());
    if (key) { const hit = await cache.match(key); if (hit) return hit.json(); }
    const go = (init) => fetch('https://t.me/s/' + name + (before ? '?before=' + before : ''), { headers: { ...ytHeaders, 'Accept-Language': 'ar,en;q=0.8' }, redirect: 'follow', ...init });
    // a live read: no copy kept (if this runtime does not know the cache option, a plain read is used)
    const r = await (fresh ? go({ cache: 'no-store' }).catch(() => go({})) : go({ cf: { cacheTtl: 120 } }));
    if (!r.ok) throw new Error('http' + r.status);
    const html = await r.text();
    const out = { info: parseTgInfo(html), posts: parseTgPosts(html, name).sort((a, b) => b.i - a.i) };
    if (key) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' } })));
    return out;
}

// ---- a teacher posted on Telegram: a push to the students who did not mute that channel ----
// Same plan as the YouTube pushes: every 15 minutes, a channel's first look never pushes its old posts, with the KV store each post
// goes out once, without it only the last 20 minutes count. A student mutes a channel in the app: the tag tg_<channel> = off.
async function tgNotify(env, ctx, when) {
    if (!env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_APP_ID || !env.FIREBASE_DB_URL) return 'no_key';
    const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
    let chans = {};
    try {
        const sw = await fetch(base + '/siteConfig/features/tgteachers.json');
        if (sw.ok && (await sw.json()) === false) return 'off';
        const r = await fetch(base + '/tgChannels.json');
        if (r.ok) chans = (await r.json()) || {};
    } catch { return 'db'; }
    const list = Object.values(chans).filter((c) => c && isTgName(c.u)).slice(0, 30);
    const kv = env.AVATARS, now = Date.now();
    let sent = 0;
    for (const c of list) {
        let pg; try { pg = await tgPage(c.u, 0, ctx); } catch { continue; }
        const posts = pg.posts.slice(0, 6), nm = c.u.toLowerCase();
        let fresh;
        if (kv) {
            const first = !(await kv.get('tg:init:' + nm));
            if (first) { await kv.put('tg:init:' + nm, '1'); for (const x of posts) await kv.put('tg:sent:' + nm + '/' + x.i, '1', { expirationTtl: 30 * 86400 }); continue; }
            fresh = [];
            for (const x of posts) if (x.p > now - 6 * 3600000 && !(await kv.get('tg:sent:' + nm + '/' + x.i))) fresh.push(x);
        } else fresh = posts.filter((x) => x.p > when - 20 * 60000 && x.p <= when + 60000);
        fresh.sort((a, b) => a.i - b.i);
        for (const x of fresh.slice(-2)) {
            if (kv) await kv.put('tg:sent:' + nm + '/' + x.i, '1', { expirationTtl: 30 * 86400 });
            const tag = 'tg_' + nm;
            const res = await fetch('https://api.onesignal.com/notifications?c=push', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Key ' + env.ONESIGNAL_REST_API_KEY },
                body: JSON.stringify({
                    app_id: env.ONESIGNAL_APP_ID, target_channel: 'push',
                    filters: [{ field: 'tag', key: tag, relation: 'not_exists' }, { operator: 'OR' }, { field: 'tag', key: tag, relation: '=', value: 'on' }],
                    headings: { en: str(c.n, 40) || 'قناة مدرس', ar: str(c.n, 40) || 'قناة مدرس' }, contents: { en: tgPushText(x), ar: tgPushText(x) },
                    ...PUSH_LOOK(env), web_url: (env.APP_URL || 'https://efcegxsax-glitch.github.io/Shop-Iraq-/') + '?tg=' + c.u,
                    data: { tg: c.u }, web_push_topic: ('isp-tg-' + nm).slice(0, 30), ttl: 12 * 3600,
                    idempotency_key: await uuidOf('tg-' + nm + '-' + x.i),
                }),
            });
            if (res.ok) sent++; else console.error('tg push', res.status, (await res.text().catch(() => '')).slice(0, 200));
        }
    }
    return 'sent_' + sent;
}

// ---- أخبار تلكرام: the news bot (src/newsbot.js cleans, src/newsrun.js decides). It has its own cron because one round makes many calls. ----
function newsDeps(env, ctx) {
    return {
        now: () => Date.now(),
        page: (name) => tgPage(name, 0, ctx, true),                // always the live page: no copy kept for minutes
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        // the picture goes into the news record itself (like the pictures the admin uploads); a big one stays a link to Telegram's copy
        img: async (url) => {
            try {
                if (!/^https:\/\//.test(url)) return url;
                const r = await fetch(url, { headers: ytHeaders });
                const type = (r.headers.get('content-type') || '').split(';')[0];
                if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return url;
                const buf = new Uint8Array(await r.arrayBuffer());
                if (buf.length > 220000) return url;
                let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
                return 'data:' + type + ';base64,' + btoa(s);
            } catch { return url; }
        },
        push: async (x) => {
            if (!env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_APP_ID) return false;
            const { kind, targets } = pushTargets([], x.urgent ? 'urgent' : 'announcement');
            const title = str((x.urgent ? 'عاجل: ' : '') + x.title, 80), text = str(x.excerpt || x.title, 300);
            for (const target of targets) {
                const res = await fetch('https://api.onesignal.com/notifications?c=push', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Key ' + env.ONESIGNAL_REST_API_KEY },
                    body: JSON.stringify({
                        app_id: env.ONESIGNAL_APP_ID, target_channel: 'push', ...target, headings: { en: title, ar: title }, contents: { en: text, ar: text },
                        ...PUSH_LOOK(env), ...(kind ? { data: { cat: kind } } : {}), idempotency_key: await uuidOf('nb-' + x.id),
                    }),
                });
                if (!res.ok) console.error('news push', res.status, (await res.text().catch(() => '')).slice(0, 200));
            }
            return true;
        },
    };
}
async function newsCron(env, ctx) {
    const db = makeDb(env);
    if (!db.ok) return 'no_sa';
    try { return (await newsLoop(db, newsDeps(env, ctx))).state; } catch (e) { return 'error ' + String(e && e.message || e).slice(0, 60); }
}

// ---- motivation pushes (قسم تحفيز في اللوحة): plans the admin scheduled (motivPlans/{id}); see src/motiv.js ----
// Every 15 minutes: each plan that falls due in the next minutes goes to OneSignal with its exact send time. The student's own
// switch for this kind is the tag off_motiv (like the other kinds), so a student who switched them off gets nothing.
async function motivNotify(env, ctx, when) {
    if (!env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_APP_ID || !env.FIREBASE_DB_URL) return 'no_key';
    const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
    let plans = {};
    try {
        const sw = await fetch(base + '/siteConfig/features/motiv.json');
        if (sw.ok && (await sw.json()) === false) return 'off';
        const r = await fetch(base + '/motivPlans.json');
        if (r.ok) plans = (await r.json()) || {};
    } catch { return 'db'; }
    const now = Date.now(), { targets } = pushTargets([], 'motiv'), target = targets[0];
    let sent = 0;
    for (const [id, p] of Object.entries(plans).slice(0, 120)) {
        for (const d of motivDue(p, now)) {
            const title = str(p.t, 80), text = str(p.b, 300) || title, wait = d.ts - now, sa = wait >= 90000 ? sendAfter(d.ts, now) : '';
            const res = await fetch('https://api.onesignal.com/notifications?c=push', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Key ' + env.ONESIGNAL_REST_API_KEY },
                body: JSON.stringify({
                    app_id: env.ONESIGNAL_APP_ID, target_channel: 'push', ...target,
                    headings: { en: title, ar: title }, contents: { en: text, ar: text }, ...PUSH_LOOK(env),
                    ...(sa ? { send_after: sa } : {}), data: { motiv: 1 }, ttl: 6 * 3600,
                    // a repeat of the same plan on the same day is answered with the first one
                    idempotency_key: await uuidOf('mv-' + id + '-' + d.date),
                }),
            });
            if (res.ok) sent++; else console.error('motiv push', res.status, (await res.text().catch(() => '')).slice(0, 200));
        }
    }
    return 'sent_' + sent;
}

// a channel's uploads, 100 at a time (the first page is cached for 30 minutes). Three ways, tried in turn:
// YouTube's own app endpoint (no page to parse), the playlist web page, and (if the key secret exists) the official API.
// YouTube's own app endpoint, asked the way its apps ask (the public web key and each client's headers); tried as the web client, then as the Android app.
const IT_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const IT_CLIENTS = [
    ['web', { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'ar', gl: 'IQ' }, { 'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': '2.20250101.00.00', Origin: 'https://www.youtube.com', Referer: 'https://www.youtube.com/' }],
    ['android', { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'ar', gl: 'IQ' }, { 'X-YouTube-Client-Name': '3', 'X-YouTube-Client-Version': '19.09.37', 'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip' }],
];
async function itBrowse(extra, i) {
    const [, client, hdr] = IT_CLIENTS[i];
    const r = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false&key=' + IT_KEY, {
        method: 'POST', headers: { ...ytHeaders, ...hdr, 'Content-Type': 'application/json' }, body: JSON.stringify({ context: { client }, ...extra }),
    });
    if (!r.ok) throw new Error(IT_CLIENTS[i][0] + r.status);
    return r.json();
}
async function apiUploads(id, cont, key) {
    const u = 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=UU' + id.slice(2) + (cont ? '&pageToken=' + encodeURIComponent(cont) : '') + '&key=' + encodeURIComponent(key);
    const r = await fetch(u);
    if (!r.ok) throw new Error('api' + r.status);
    const j = await r.json();
    return { videos: (j.items || []).map((i) => ({ v: i.snippet && i.snippet.resourceId && i.snippet.resourceId.videoId, t: str(i.snippet && i.snippet.title, 140), a: '', w: '', p: Date.parse(i.snippet && i.snippet.publishedAt) || 0 })).filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x.v || '')), next: j.nextPageToken || '' };
}
async function ytUploads(id, cont, ctx, env) {
    const cache = caches.default, key = new Request('https://yt-cache.invalid/u/' + id);
    if (!cont) { const hit = await cache.match(key); if (hit) return hit.json(); }
    const why = [];
    const tries = [];
    if (env.YT_API_KEY) tries.push(['api', () => apiUploads(id, cont, env.YT_API_KEY)]);
    IT_CLIENTS.forEach(([n], i) => tries.push([n, async () => parseUploads(await itBrowse(cont ? { continuation: cont } : { browseId: 'VLUU' + id.slice(2) }, i))]));
    if (!cont) tries.push(['web', async () => {
        const r = await fetch(uploadsUrl(id), { headers: ytHeaders, redirect: 'follow' });
        if (!r.ok) throw new Error('web' + r.status);
        const html = await r.text(), d = initialData(html);
        if (!d) throw new Error(/consent\.youtube|Before you continue/i.test(html) ? 'webconsent' : 'webparse');
        return parseUploads(d);
    }]);
    for (const [name, run] of tries) {
        try {
            const out = await run();
            if (out && out.videos.length) {
                if (!cont) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=1800' } })));
                return out;
            }
            why.push(name + ':empty');
        } catch (e) { why.push(name + ':' + String(e && e.message || e).slice(0, 30)); }
    }
    return { fail: why.join(',') };
}

export default {
    async scheduled(event, env, ctx) {
        // each schedule is named in src/cron.js; one that is not named does nothing
        const job = routeCron(event.cron);
        if (job === 'poll') { ctx.waitUntil(ytNotify(env, ctx, event.scheduledTime).then((r) => console.log('yt notify', r))); ctx.waitUntil(tgNotify(env, ctx, event.scheduledTime).then((r) => console.log('tg notify', r))); ctx.waitUntil(motivNotify(env, ctx, event.scheduledTime).then((r) => console.log('motiv notify', r))); }
        else if (job === 'news') ctx.waitUntil(newsCron(env, ctx).then((r) => console.log('news bot', r)));
        else if (job === 'coach') ctx.waitUntil(coachPush(env, event.scheduledTime).then((r) => console.log('coach push', r)));
        else console.log('unknown schedule, nothing done:', event.cron);
    },

    async fetch(req, env, ctx) {
        const headers = cors(req, env);
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        // a student's small photo, shown in the push notification (public on purpose: the phone fetches it without signing in)
        if (req.method === 'GET') {
            const m = /^\/a\/([A-Za-z0-9]{20,40})\.jpg$/.exec(new URL(req.url).pathname);
            const b64 = m && env.AVATARS ? await env.AVATARS.get('a:' + m[1]) : null;
            if (!b64) return new Response('not found', { status: 404 });
            const bin = atob(b64), bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' } });
        }
        if (req.method !== 'POST') return json(405, { error: 'method' }, headers);
        const who = {};
        const uid = await verifyStudent(req, env, who);
        if (!uid) return json(401, { error: 'signin' }, headers);
        let body;
        try { body = await req.json(); } catch { return json(400, { error: 'bad_json' }, headers); }
        if (body.mode === 'turn') {
            if (env.PER_CALL) {
                const { success } = await env.PER_CALL.limit({ key: uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            const iceServers = await turnServers(env);
            return iceServers ? json(200, { iceServers }, headers) : json(503, { error: 'turn' }, headers);
        }

        // the admin panel's own push to phones (all students, or one governorate by its tag)
        if (body.mode === 'adminpush') {
            if (!env.ADMIN_EMAIL || who.email !== String(env.ADMIN_EMAIL).toLowerCase()) return json(403, { error: 'admin' }, headers);
            if (env.PER_CALL) {
                const { success } = await env.PER_CALL.limit({ key: uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            if (!env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_APP_ID) return json(503, { error: 'no_key' }, headers);
            const title = str(body.title, 80), text = str(body.body, 300);
            if (!title) return json(400, { error: 'empty' }, headers);
            const govs = (Array.isArray(body.govs) ? body.govs : []).map((g) => str(g, 20)).filter((g) => /^[a-z_]+$/.test(g)).slice(0, 19);
            // The student's own switch for this kind of notification: the app sets the tag off_<kind> only while the kind is switched off,
            // so "tag off_<kind> does not exist" keeps everybody who never touched it (older installs too). Only plain AND filters are used,
            // so nothing depends on how OneSignal ranks OR against AND; each governorate is its own send.
            const uids = (Array.isArray(body.uids) ? body.uids : []).filter((u) => typeof u === 'string' && UID_RE.test(u)).slice(0, 50);
            const { kind, targets } = pushTargets(govs, body.cat, uids);
            const when = body.sendAt ? sendAfter(body.sendAt, Date.now()) : '';
            if (body.sendAt && !when) return json(400, { error: 'time' }, headers);
            const sends = await Promise.all(targets.map(async (target) => {
                const r = await fetch('https://api.onesignal.com/notifications?c=push', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Key ' + env.ONESIGNAL_REST_API_KEY },
                    body: JSON.stringify({ app_id: env.ONESIGNAL_APP_ID, target_channel: 'push', ...target, headings: { en: title, ar: title }, contents: { en: text || title, ar: text || title }, ...PUSH_LOOK(env), ...(kind ? { data: { cat: kind } } : {}), ...(when ? { send_after: when } : {}) }),
                });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) console.error('adminpush', r.status, JSON.stringify(j).slice(0, 300));
                return { ok: r.ok, status: r.status, j };
            }));
            const bad = sends.find((x) => !x.ok);
            if (bad) return json(502, { error: 'onesignal', status: bad.status, detail: bad.j.errors || null }, headers);
            // OneSignal answers an empty audience with no id (or an "all players are not subscribed" error): say so, do not call it sent
            const got = sends.filter((x) => x.j.id);
            const recipients = sends.reduce((n, x) => n + (Number(x.j.recipients) || 0), 0);
            return json(200, { id: got.map((x) => x.j.id).join(',') || '', ids: got.map((x) => x.j.id), sent: got.length, of: sends.length, recipients: got.length ? recipients : 0, errors: sends.map((x) => x.j.errors).filter(Boolean)[0] || null }, headers);
        }

        // admin only: cancel pushes that were scheduled for later (their OneSignal ids)
        if (body.mode === 'admincancel') {
            if (!env.ADMIN_EMAIL || who.email !== String(env.ADMIN_EMAIL).toLowerCase()) return json(403, { error: 'admin' }, headers);
            if (!env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_APP_ID) return json(503, { error: 'no_key' }, headers);
            const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 25);
            const res = await Promise.all(ids.map((id) => fetch('https://api.onesignal.com/notifications/' + id + '?app_id=' + encodeURIComponent(env.ONESIGNAL_APP_ID), { method: 'DELETE', headers: { Authorization: 'Key ' + env.ONESIGNAL_REST_API_KEY } }).then((r) => r.ok).catch(() => false)));
            return json(200, { cancelled: res.filter(Boolean).length, of: ids.length }, headers);
        }

        // the student's own small photo (a 192px JPEG, at most ~40KB) for the push notification
        if (body.mode === 'avatar') {
            if (!env.AVATARS) return json(503, { error: 'no_store' }, headers);
            if (env.PER_CALL) {
                const { success } = await env.PER_CALL.limit({ key: 'av' + uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            const img = typeof body.img === 'string' ? body.img.replace(/^data:image\/jpeg;base64,/, '') : '';
            if (!img || img.length > 60000 || !/^\/9j\/[A-Za-z0-9+\/=]+$/.test(img)) return json(400, { error: 'bad_image' }, headers);
            await env.AVATARS.put('a:' + uid, img, { metadata: { t: Date.now() } });
            return json(200, { ok: true }, headers);
        }

        // the teachers' videos: the newest ones of up to 12 channels, merged, newest first
        if (body.mode === 'ytfeed') {
            if (env.PER_NOTIFY) {
                const { success } = await env.PER_NOTIFY.limit({ key: 'yt' + uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            const ids = (Array.isArray(body.ids) ? body.ids : []).filter(isChannelId).slice(0, 12);
            if (!ids.length) return json(200, { videos: [] }, headers);
            const feeds = await Promise.all(ids.map((id) => ytChannelFeed(id, ctx).then((f) => ({ id, f })).catch(() => ({ id, f: { videos: [] } }))));
            const videos = [];
            for (const { id, f } of feeds) for (const v of f.videos.slice(0, 15)) videos.push({ ...v, c: id });
            videos.sort((a, b) => b.p - a.p);
            return json(200, { videos: videos.slice(0, 120) }, headers);
        }

        // a test push to this student only ("فحص الإشعارات" in the app): tells whether OneSignal knows the phone at all
        if (body.mode === 'selftest') {
            if (env.PER_NOTIFY) {
                const { success } = await env.PER_NOTIFY.limit({ key: 'st' + uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            if (!env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_APP_ID) return json(503, { error: 'no_key' }, headers);
            const r = await fetch('https://api.onesignal.com/notifications?c=push', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Key ' + env.ONESIGNAL_REST_API_KEY },
                body: JSON.stringify({
                    app_id: env.ONESIGNAL_APP_ID, target_channel: 'push', include_aliases: { external_id: [uid] },
                    headings: { en: 'تجربة الإشعارات', ar: 'تجربة الإشعارات' }, contents: { en: 'إذا وصلك هذا الإشعار فالإشعارات تشتغل عندك', ar: 'إذا وصلك هذا الإشعار فالإشعارات تشتغل عندك' },
                    ...PUSH_LOOK(env), ttl: 300,
                }),
            });
            const j = await r.json().catch(() => ({}));
            return json(200, { ok: r.ok, id: j.id || '', recipients: Number(j.recipients) || 0, errors: j.errors || null }, headers);
        }

        // the teachers' Telegram channels: the newest posts of up to 12 channels, merged, newest first
        if (body.mode === 'tgfeed') {
            if (env.PER_NOTIFY) {
                const { success } = await env.PER_NOTIFY.limit({ key: 'tg' + uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            const names = (Array.isArray(body.names) ? body.names : []).filter(isTgName).slice(0, 12);
            if (!names.length) return json(200, { posts: [] }, headers);
            const pages = await Promise.all(names.map((u) => tgPage(u, 0, ctx).then((f) => ({ u, f })).catch(() => ({ u, f: null }))));
            const posts = [], fail = [], chans = {};
            for (const { u, f } of pages) { if (!f) { fail.push(u); continue; } chans[u] = { n: f.info.n, a: f.info.a }; for (const x of f.posts.slice(0, 15)) posts.push(x); }
            posts.sort((a, b) => b.p - a.p);
            return json(200, { posts: posts.slice(0, 150), fail, chans }, headers);
        }

        // one Telegram channel's older posts, a page at a time
        if (body.mode === 'tgchan') {
            if (env.PER_NOTIFY) {
                const { success } = await env.PER_NOTIFY.limit({ key: 'tc' + uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            const u = String(body.u || ''), before = Number.isInteger(body.before) && body.before > 0 ? body.before : 0;
            if (!isTgName(u)) return json(400, { error: 'bad' }, headers);
            try { const f = await tgPage(u, before, ctx); return json(200, { posts: f.posts, next: f.posts.length ? tgOldest(f.posts) : 0 }, headers); } catch (e) { return json(502, { error: 'telegram', why: String(e && e.message || e).slice(0, 30) }, headers); }
        }

        // admin only: a Telegram channel's name and picture from its link (also tells whether its public preview works)
        if (body.mode === 'tginfo') {
            if (!env.ADMIN_EMAIL || who.email !== String(env.ADMIN_EMAIL).toLowerCase()) return json(403, { error: 'admin' }, headers);
            if (env.PER_CALL) {
                const { success } = await env.PER_CALL.limit({ key: uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            const u = tgNameOf(body.q);
            if (!u) return json(400, { error: 'empty' }, headers);
            try { const f = await tgPage(u, 0, ctx); return json(200, { u, n: f.info.n, a: f.info.a, subs: f.info.subs, preview: f.info.preview, count: f.posts.length }, headers); } catch (e) { return json(502, { error: 'telegram', why: String(e && e.message || e).slice(0, 30) }, headers); }
        }

        // admin only: the news bot. "newsrun" = a round now; "newsact" = approve / reject a held post, or publish an ignored one anyway
        if (body.mode === 'newsrun' || body.mode === 'newsact') {
            if (!env.ADMIN_EMAIL || who.email !== String(env.ADMIN_EMAIL).toLowerCase()) return json(403, { error: 'admin' }, headers);
            if (env.PER_CALL) {
                const { success } = await env.PER_CALL.limit({ key: uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            const db = makeDb(env);
            if (!db.ok) return json(503, { error: 'no_sa' }, headers);
            try {
                if (body.mode === 'newsrun') return json(200, await newsLoop(db, newsDeps(env, ctx), { polls: 1 }), headers);
                const act = ['approve', 'reject', 'restore', 'clear'].includes(body.act) ? body.act : '';
                if (!act) return json(400, { error: 'bad' }, headers);
                const r = await newsAct(db, newsDeps(env, ctx), act, String(body.key || ''));
                return json(r.error ? 400 : 200, r, headers);
            } catch (e) { return json(502, { error: 'db', why: String(e && e.message || e).slice(0, 40) }, headers); }
        }

        // admin only: the pages of a handout as pictures -> their text (for scanned PDFs)
        if (body.mode === 'examread' || body.mode === 'examgen') {
            if (!env.ADMIN_EMAIL || who.email !== String(env.ADMIN_EMAIL).toLowerCase()) return json(403, { error: 'admin' }, headers);
            if (!env.ANTHROPIC_API_KEY) return json(503, { error: 'no_key' }, headers);
            try {
                if (body.mode === 'examread') {
                    const imgs = (Array.isArray(body.images) ? body.images : []).filter((im) => im && IMAGE_TYPES.includes(im.type) && typeof im.data === 'string' && im.data.length <= MAX_IMAGE_B64 && /^[A-Za-z0-9+/=]+$/.test(im.data)).slice(0, 6);
                    if (!imgs.length) return json(400, { error: 'image' }, headers);
                    return json(200, { text: await claudeRead(env, imgs, uid) }, headers);
                }
                const text = typeof body.text === 'string' ? body.text.slice(0, 300000) : '';
                if (text.trim().length < 200) return json(400, { error: 'short' }, headers);
                const o = { subject: str(body.subject, 60), chapter: str(body.chapter, 120) };
                const total = Math.max(10, Math.min(100, Math.round(Number(body.total) || 100)));
                const nq = Math.max(2, Math.min(8, Math.round(Number(body.nq) || 5)));
                const prompt = `المادة: ${o.subject || 'غير محددة'}${o.chapter ? '\nالفصل/الموضوع: ' + o.chapter : ''}\nالدرجة الكلية: ${total}\nعدد الأسئلة الرئيسية: ${nq}${str(body.note, 300) ? '\nتعليمات إضافية من المدرس: ' + str(body.note, 300) : ''}\n\nمادة الملزمة:\n${text}`;
                // Writing a whole exam can take longer than the 100 seconds Cloudflare waits for the first byte of an answer, so the
                // answer is streamed: a space every 8 seconds keeps the connection open (JSON ignores leading spaces), then the
                // exam, or {"error": ...} (the status is already 200 by then).
                const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder();
                const keep = setInterval(() => { w.write(enc.encode(' ')).catch(() => {}); }, 8000);
                ctx.waitUntil((async () => {
                    let out;
                    try { const ex = cleanExam(await claudeExam(env, prompt, uid), o); out = ex || { error: 'exam' }; } catch (err) { console.error('exam', err && err.message); out = { error: errorCode(err) }; }
                    clearInterval(keep);
                    try { await w.write(enc.encode(JSON.stringify(out))); await w.close(); } catch { /* the admin closed the page */ }
                })());
                return new Response(readable, { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
            } catch (err) {
                console.error('exam', err && err.message);
                return json(502, { error: errorCode(err) }, headers);
            }
        }

        // one teacher's whole channel, page by page (old videos, not just the newest)
        if (body.mode === 'ytchan') {
            if (env.PER_NOTIFY) {
                const { success } = await env.PER_NOTIFY.limit({ key: 'yc' + uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            const id = String(body.id || ''), cont = typeof body.cont === 'string' ? body.cont.slice(0, 2000) : '';
            if (!isChannelId(id)) return json(400, { error: 'bad' }, headers);
            const out = await ytUploads(id, cont, ctx, env).catch((e) => ({ fail: String(e && e.message || e).slice(0, 40) }));
            return out.fail ? json(502, { error: 'youtube', why: out.fail }, headers) : json(200, out, headers);
        }

        // admin only: find a channel by name, @handle or link
        if (body.mode === 'ytfind') {
            if (!env.ADMIN_EMAIL || who.email !== String(env.ADMIN_EMAIL).toLowerCase()) return json(403, { error: 'admin' }, headers);
            if (env.PER_CALL) {
                const { success } = await env.PER_CALL.limit({ key: uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            const p = ytPlan(body.q);
            if (!p) return json(400, { error: 'empty' }, headers);
            let html = '';
            try { const r = await fetch(p.url, { headers: ytHeaders, redirect: 'follow' }); if (r.ok) html = await r.text(); } catch { /* handled below */ }
            if (!html) return json(502, { error: 'youtube' }, headers);
            const found = p.kind === 'page' ? [parseChannelPage(html)].filter(Boolean) : parseSearch(html);
            return json(200, { channels: found }, headers);
        }

        // admin only: a channel's picture, fetched here so the panel can shrink it and keep it inside the database
        // (a picture linked from YouTube's servers can fail to load in the app)
        if (body.mode === 'ytimg') {
            if (!env.ADMIN_EMAIL || who.email !== String(env.ADMIN_EMAIL).toLowerCase()) return json(403, { error: 'admin' }, headers);
            if (env.PER_CALL) {
                const { success } = await env.PER_CALL.limit({ key: 'yi' + uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            const u = str(body.url, 400);
            if (!/^https:\/\/(yt3\.googleusercontent\.com|yt3\.ggpht\.com|lh3\.googleusercontent\.com|i\.ytimg\.com)\/[^\s"'<>]+$/.test(u)) return json(400, { error: 'host' }, headers);
            try {
                const r = await fetch(u, { headers: ytHeaders });
                const type = (r.headers.get('content-type') || '').split(';')[0];
                if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return json(502, { error: 'image', status: r.status }, headers);
                const buf = new Uint8Array(await r.arrayBuffer());
                if (buf.length > 700000) return json(413, { error: 'big' }, headers);
                let bin = ''; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
                return json(200, { type, data: btoa(bin) }, headers);
            } catch { return json(502, { error: 'image' }, headers); }
        }

        if (body.mode === 'notify') {
            const tok = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
            return notifyPush(env, uid, tok ? tok[1] : '', body, headers, new URL(req.url).origin);
        }

        if (body.mode === 'tbsync') {
            if (env.PER_CALL) {
                const { success } = await env.PER_CALL.limit({ key: uid });
                if (!success) return json(429, { error: 'slow_down' }, headers);
            }
            const r = await tbSync(env, uid, body);
            return r.error ? json(503, r, headers) : json(200, r, headers);
        }

        const useClaude = !!env.ANTHROPIC_API_KEY;
        if (!useClaude && !env.GEMINI_API_KEY) return json(503, { error: 'key' }, headers);
        if (env.PER_MINUTE) {
            const { success } = await env.PER_MINUTE.limit({ key: uid });
            if (!success) return json(429, { error: 'slow_down' }, headers);
        }
        const context = str(body.context, MAX_CONTEXT);

        if (body.mode === 'quiz') {
            const subject = str(body.subject, 60) || 'الفيزياء', topic = str(body.topic, 200);
            const prompt = `سويلي اختبار مفاجئ بمادة ${subject}${topic ? ' عن ' + topic : ''}. إذا تقريري يبين موضوع أنا ضعيف بيه بهذه المادة ركّز عليه.`;
            try {
                const quiz = cleanQuiz(useClaude ? await claudeQuiz(env, prompt, context, uid) : await geminiQuiz(env, prompt, context));
                return quiz ? json(200, quiz, headers) : json(502, { error: 'quiz' }, headers);
            } catch (err) {
                console.error('quiz', err && err.message);
                return json(502, { error: errorCode(err) }, headers);
            }
        }

        if (body.mode === 'cards') {
            const img = body.image;
            const image = img && IMAGE_TYPES.includes(img.type) && typeof img.data === 'string' && img.data.length <= MAX_IMAGE_B64 && /^[A-Za-z0-9+/=]+$/.test(img.data) ? img : null;
            if (!image) return json(400, { error: 'image' }, headers);
            const subject = str(body.subject, 60);
            const prompt = 'حول هذه الصفحة إلى بطاقات مراجعة' + (subject ? ' بمادة ' + subject : '') + '.';
            try {
                const r = cleanCards(useClaude ? await claudeCards(env, image, prompt, uid) : await geminiCards(env, image, prompt));
                return json(200, r, headers);
            } catch (err) {
                console.error('cards', err && err.message);
                return json(502, { error: errorCode(err) }, headers);
            }
        }

        // the weekly study plan: from the student's report (context) for the days the app names
        if (body.mode === 'plan') {
            const days = cleanDays(body.days);
            if (!days.length) return json(400, { error: 'days' }, headers);
            const prompt = planPrompt(days, body.hours, str(body.note, 200));
            try {
                const plan = cleanPlan(useClaude ? await claudePlan(env, prompt, context, uid) : await geminiPlan(env, prompt, context), days, body.hours);
                return plan ? json(200, plan, headers) : json(502, { error: 'plan' }, headers);
            } catch (err) {
                console.error('plan', err && err.message);
                return json(502, { error: errorCode(err) }, headers);
            }
        }

        if (body.mode === 'food') {
            const meals = { breakfast: 'الفطور', lunch: 'الغدا', dinner: 'العشا', snack: 'وجبة خفيفة' };
            const meal = meals[body.meal] || '';
            const ideas = body.ideas === true;
            const text = str(body.text, 400);
            if (!ideas && !text) return json(400, { error: 'empty' }, headers);
            const system = ideas ? FOOD_IDEAS_SYSTEM : FOOD_SYSTEM;
            const prompt = ideas ? 'اقترحلي وجبات ' + (meal ? 'لل' + meal.replace(/^ال/, '') : 'لليوم') + ' تقوي الذاكرة.'
                : 'أكلت' + (meal ? ' بال' + meal.replace(/^ال/, '') : '') + ': ' + text;
            try {
                const r = cleanFood(useClaude ? await claudeFood(env, system, prompt, context, uid) : await geminiFood(env, system, prompt, context));
                return json(200, r, headers);
            } catch (err) {
                console.error('food', err && err.message);
                return json(502, { error: errorCode(err) }, headers);
            }
        }

        if (body.mode === 'nudge') {
            const reasons = (Array.isArray(body.reasons) ? body.reasons : []).map((r) => str(r, 200)).filter(Boolean).slice(0, 5);
            if (!reasons.length) return json(400, { error: 'empty' }, headers);
            const prompt = 'اكتب رسالة للطالب تبدي بيها المحادثة. السبب:\n- ' + reasons.join('\n- ');
            try {
                const text = str(useClaude ? await claudeNudge(env, prompt, context, uid) : await geminiNudge(env, prompt, context), 600);
                return text ? json(200, { text }, headers) : json(502, { error: 'empty' }, headers);
            } catch (err) {
                console.error('nudge', err && err.message);
                return json(502, { error: errorCode(err) }, headers);
            }
        }

        const chat = cleanMessages(body);
        if (!chat) return json(400, { error: 'empty' }, headers);
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter(), enc = new TextEncoder();
        const send = (obj) => writer.write(enc.encode('data: ' + JSON.stringify(obj) + '\n\n'));
        const run = async () => {
            try {
                const stop = useClaude ? await claudeChat(env, chat, context, uid, send) : await geminiChat(env, chat, context, uid, send);
                await send({ done: true, stop });
            } catch (err) {
                const code = errorCode(err);
                console.error('tutor error', code, err && err.message);
                await send({ error: code });
            } finally {
                await writer.close();
            }
        };
        // keep the Worker alive until the answer has been sent in full
        if (ctx && ctx.waitUntil) ctx.waitUntil(run()); else run();
        return new Response(readable, { headers: { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' } });
    },
};
