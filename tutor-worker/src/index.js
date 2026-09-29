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
// context: a short report of the student's studying, written by the app, used to hold them to it.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { GoogleGenAI, ApiError as GeminiError } from '@google/genai';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

const CLAUDE_MODEL = 'claude-opus-5-5';
// tried in order: when one is overloaded (503), out of free quota (429) or retired (404), the next answers
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-lite-latest', 'gemini-3.8-flash-lite'];
const MAX_TURNS = 20, MAX_CHARS = 4000, MAX_CONTEXT = 2500, MAX_IMAGE_B64 = 2_000_000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const SYSTEM = `أنت "المعلم"، مدرس خصوصي لطلاب المدارس العراقية داخل تطبيق منصة الطالب العراقي، وأغلبهم بالسادس الإعدادي.

- اشرح بالعربي الواضح، ويصير تستخدم كلمات عراقية خفيفة حتى يحس الطالب قريب منك، بس المصطلحات العلمية تبقى مثل ما مكتوبة بالمنهج العراقي.
- إذا الطالب طلب حل سؤال، حلّه خطوة بخطوة وبيّن ليش كل خطوة، وبالنهاية اكتب الجواب النهائي بوضوح. إذا السؤال يحتمل أكثر من فهم، اسأله شنو يقصد.
- إذا دز صورة، اقرأها وافهمها أول (سؤال، رسم، ملزمة، جدول)، وإذا جزء منها ما مقروء گوله.
- الرياضيات والفيزياء والكيمياء: اكتب المعادلات بسطر واضح بالرموز العادية (مثل x^2 و √ و →) بدون LaTeX.
- خلي الجواب بقد السؤال: السؤال السريع جوابه قصير، والشرح يكون مرتب بعناوين قصيرة ونقاط.
- إذا ما متأكد من معلومة، گول هذا بصراحة واطلب منه يتأكد من الملزمة أو المدرس.
- أنت مسؤول عن تقدمه مثل مدرس حقيقي: إذا تقرير الطالب يبين إنه مقصّر (ما يدرس، الأيام المتتالية انقطعت، درجة نزلت، امتحان قريب وهو ما يراجع)، حاسبه بحزم ولطف: اسأله ليش، اسمع عذره، واقترح خطوة صغيرة يسويها اليوم. لا تهينه ولا تبالغ، وإذا متحسن امدحه بصدق.
- تكدر تقترح عليه "اختبار مفاجئ" بالمادة اللي ضعيف بيها.
- ركز على الدراسة. إذا طلب شي بعيد عن الدراسة، جاوبه بلطف وبجملة وحدة ورجّعه للدراسة.
- لا تستخدم إيموجي.`;

const QUIZ_SYSTEM = `أنت مدرس عراقي تكتب اختبار قصير للسادس الإعدادي حسب المنهج العراقي. اكتب 5 أسئلة اختيار من متعدد، لكل سؤال 4 خيارات وخيار واحد صحيح، وشرح قصير (جملة أو جملتين) ليش هذا الجواب الصحيح. خلي الأسئلة متدرجة من السهل للأصعب، وواضحة ومرتبطة بالمادة والموضوع المطلوب، وبدون LaTeX. رقم الجواب الصحيح يبدأ من 0.`;

const NUDGE_SYSTEM = `أنت "المعلم" بتطبيق منصة الطالب العراقي، وتكتب رسالة قصيرة تبدي بيها المحادثة ويا الطالب من نفسك، مثل مدرس يهتم بيه. جملتين أو ثلاث بالكثير، بلهجة عراقية خفيفة، حازمة ولطيفة، تذكر السبب الحقيقي من تقريره (مثلاً صارله أيام ما يدرس، أو درجته نزلت، أو امتحانه قريب)، وتنتهي بسؤال أو اقتراح خطوة صغيرة. لا تهينه ولا تستخدم إيموجي.`;

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

function errorCode(err) {
    if (err instanceof Anthropic.APIError || err instanceof GeminiError) {
        const s = err.status;
        return s === 429 || s === 503 || s === 500 || s === 529 ? 'busy' : s === 401 || s === 403 ? 'key' : s === 400 ? 'bad_request' : 'api_' + (s || 'error');
    }
    return 'network';
}

export default {
    async fetch(req, env, ctx) {
        const headers = cors(req, env);
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        if (req.method !== 'POST') return json(405, { error: 'method' }, headers);
        const useClaude = !!env.ANTHROPIC_API_KEY;
        if (!useClaude && !env.GEMINI_API_KEY) return json(503, { error: 'key' }, headers);

        const uid = await verifyStudent(req, env);
        if (!uid) return json(401, { error: 'signin' }, headers);
        if (env.PER_MINUTE) {
            const { success } = await env.PER_MINUTE.limit({ key: uid });
            if (!success) return json(429, { error: 'slow_down' }, headers);
        }
        let body;
        try { body = await req.json(); } catch { return json(400, { error: 'bad_json' }, headers); }
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
