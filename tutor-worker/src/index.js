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

const CLAUDE_MODEL = 'claude-opus-5-5';
// tried in order: when one is overloaded (503), out of free quota (429) or retired (404), the next answers
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-lite-latest', 'gemini-3.8-flash-lite'];
const MAX_TURNS = 20, MAX_CHARS = 4000, MAX_CONTEXT = 3400, MAX_IMAGE_B64 = 2_000_000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const SYSTEM = `أنت "المعلم"، مدرس خصوصي لطلاب المدارس العراقية داخل تطبيق منصة الطالب العراقي، وأغلبهم بالسادس الإعدادي.

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

const NUDGE_SYSTEM = `أنت "المعلم" بتطبيق منصة الطالب العراقي، وتكتب رسالة قصيرة تبدي بيها المحادثة ويا الطالب من نفسك، مثل مدرس يهتم بيه. جملتين أو ثلاث بالكثير، بلهجة عراقية خفيفة، حازمة ولطيفة، تذكر السبب الحقيقي من تقريره (مثلاً صارله أيام ما يدرس، أو درجته نزلت، أو امتحانه قريب)، وتنتهي بسؤال أو اقتراح خطوة صغيرة. لا تهينه ولا تستخدم إيموجي.`;

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

const FOOD_SYSTEM = `أنت "المعلم" بتطبيق منصة الطالب العراقي، وهنا تساعد الطالب بأكله حتى يركز ويحفظ أحسن. الطالب يكتبلك شنو أكل (أكل عراقي غالباً). لكل أكلة: اسمها، وحكمك عليها (good زين، ok عادي، bad يضر إذا يكثر منه) وسبب قصير بجملة وحدة بلهجة عراقية خفيفة عن تأثيرها على التركيز والذاكرة والطاقة والنوم. بعدين: درجة الوجبة من 1 إلى 10، وجملة عن تأثيرها على الدماغ والدراسة، ونصيحة وحدة عملية، و3 اقتراحات متنوعة لأكلات عراقية بسيطة ورخيصة تقوي الذاكرة يكدر يجربها بالوجبة الجاية. كن واقعي ولطيف وبدون تخويف، ولا تعطي نصائح طبية أو حمية قاسية، ولا تستخدم إيموجي. إذا اللي كتبه مو أكل، رجع قائمة أكلات فارغة.`;
const FOOD_IDEAS_SYSTEM = `أنت "المعلم" بتطبيق منصة الطالب العراقي. اقترح على الطالب 5 وجبات عراقية بسيطة ورخيصة ومتنوعة للوجبة المطلوبة، تقوي الذاكرة والتركيز وتعطي طاقة ثابتة للدراسة. لكل وجبة: اسمها بكلمات قليلة، والحكم good، وسبب قصير بجملة وحدة شنو تفيد بالدراسة. نوّع بين البروتين والخضرة والحبوب الكاملة والفواكه والمكسرات، وتجنب التكرار. الدرجة 10، وجملة عامة عن الأكل والدراسة، ونصيحة وحدة، والاقتراحات next فارغة. بلهجة عراقية خفيفة وبدون إيموجي.`;
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
async function verifyStudent(req, env) {
    const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
    if (!m) return null;
    jwks = jwks || createRemoteJWKSet(new URL(env.JWKS_URL || 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
    try {
        const { payload } = await jwtVerify(m[1], jwks, { issuer: 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID, audience: env.FIREBASE_PROJECT_ID });
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
            url: (env.APP_URL || 'https://efcegxsax-glitch.github.io/Shop-Iraq-/') + '?coach=' + encodeURIComponent(text),
            web_push_topic: 'isp-coach',
            ttl: 3 * 3600,
        }),
    });
    if (!res.ok) console.error('coach push', res.status, await res.text().catch(() => ''));
    return res.ok ? 'sent' : 'error_' + res.status;
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
                    send_after: when, ttl: 900, data: { tb: 1 }, url: (env.APP_URL || 'https://efcegxsax-glitch.github.io/Shop-Iraq-/'),
                }),
            });
            const j = await r.json().catch(() => ({}));
            if (r.ok && j.id) ids.push(j.id); else console.error('tbsync', r.status, JSON.stringify(j).slice(0, 200));
        } catch (e) { console.error('tbsync', e && e.message); }
    }));
    return { ids, scheduled: ids.length, wanted: items.length };
}

export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil(coachPush(env, event.scheduledTime).then((r) => console.log('coach push', r)));
    },

    async fetch(req, env, ctx) {
        const headers = cors(req, env);
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        if (req.method !== 'POST') return json(405, { error: 'method' }, headers);
        const uid = await verifyStudent(req, env);
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
