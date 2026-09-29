// المعلم الذكي (AI tutor): the app sends a signed-in student's question here; this Worker
// checks the Firebase sign-in, limits how often one student can ask, and streams Claude's
// answer back as server-sent events. The Anthropic API key stays in the Worker's secrets.
//
// POST /  Authorization: Bearer <Firebase ID token>
//   { messages: [{ role: "user" | "assistant", content: string }...], image?: { type, data } }
//   image (a photo of a question) is attached to the last user message.
// Stream: data: {"t": "..."} per text chunk, then data: {"done": true, "stop": "..."}
//         or data: {"error": "..."}.
import Anthropic from '@anthropic-ai/sdk';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 20;           // messages kept from the conversation
const MAX_CHARS = 4000;         // per message
const MAX_IMAGE_B64 = 2_000_000; // ~1.5 MB photo
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const SYSTEM = `أنت "المعلم"، مدرس خصوصي لطلاب المدارس العراقية داخل تطبيق منصة الطالب العراقي، وأغلبهم بالسادس الإعدادي.

- اشرح بالعربي الواضح، ويصير تستخدم كلمات عراقية خفيفة حتى يحس الطالب قريب منك، بس المصطلحات العلمية تبقى مثل ما مكتوبة بالمنهج العراقي.
- إذا الطالب طلب حل سؤال، حلّه خطوة بخطوة وبيّن ليش كل خطوة، وبالنهاية اكتب الجواب النهائي بوضوح. إذا السؤال يحتمل أكثر من فهم، اسأله شنو يقصد.
- إذا دز صورة سؤال، اقرأ السؤال من الصورة أول، وإذا ما واضح كله گوله شنو الجزء اللي ما مقروء.
- الرياضيات والفيزياء والكيمياء: اكتب المعادلات بسطر واضح بالرموز العادية (مثل x^2 و √ و →) بدون LaTeX.
- خلي الجواب بقد السؤال: السؤال السريع جوابه قصير، والشرح يكون مرتب بعناوين قصيرة ونقاط.
- إذا ما متأكد من معلومة، گول هذا بصراحة واطلب منه يتأكد من الملزمة أو المدرس.
- ركز على الدراسة. إذا طلب شي بعيد عن الدراسة، جاوبه بلطف وبجملة وحدة ورجّعه للدراسة.
- لا تستخدم إيموجي.`;

let jwks;
async function verifyStudent(req, env) {
    const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
    if (!m) return null;
    jwks = jwks || createRemoteJWKSet(new URL(env.JWKS_URL || 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
    try {
        const { payload } = await jwtVerify(m[1], jwks, {
            issuer: 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID,
            audience: env.FIREBASE_PROJECT_ID,
        });
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

// Only plain text turns, alternating, starting with the student; one optional photo.
function cleanMessages(body) {
    const list = Array.isArray(body && body.messages) ? body.messages.slice(-MAX_TURNS) : [];
    const out = [];
    for (const msg of list) {
        const role = msg && (msg.role === 'user' || msg.role === 'assistant') ? msg.role : null;
        const text = typeof (msg && msg.content) === 'string' ? msg.content.slice(0, MAX_CHARS).trim() : '';
        if (!role || !text) continue;
        if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n\n' + text;
        else out.push({ role, content: text });
    }
    while (out.length && out[0].role !== 'user') out.shift();
    if (!out.length || out[out.length - 1].role !== 'user') return null;
    const img = body.image;
    if (img && IMAGE_TYPES.includes(img.type) && typeof img.data === 'string' && img.data.length <= MAX_IMAGE_B64 && /^[A-Za-z0-9+/=]+$/.test(img.data)) {
        const last = out[out.length - 1];
        last.content = [
            { type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } },
            { type: 'text', text: last.content },
        ];
    }
    return out;
}

export default {
    async fetch(req, env, ctx) {
        const headers = cors(req, env);
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        if (req.method !== 'POST') return json(405, { error: 'method' }, headers);

        const uid = await verifyStudent(req, env);
        if (!uid) return json(401, { error: 'signin' }, headers);
        if (env.PER_MINUTE) {
            const { success } = await env.PER_MINUTE.limit({ key: uid });
            if (!success) return json(429, { error: 'slow_down' }, headers);
        }
        let body;
        try { body = await req.json(); } catch { return json(400, { error: 'bad_json' }, headers); }
        const messages = cleanMessages(body);
        if (!messages) return json(400, { error: 'empty' }, headers);

        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter(), enc = new TextEncoder();
        const send = (obj) => writer.write(enc.encode('data: ' + JSON.stringify(obj) + '\n\n'));

        const run = async () => {
            try {
                const stream = client.beta.messages.stream({
                    model: MODEL,
                    max_tokens: 8000,
                    system: SYSTEM,
                    messages,
                    output_config: { effort: 'medium' },
                    // cache the conversation so each follow-up question re-reads it cheaply
                    cache_control: { type: 'ephemeral' },
                    // if the model declines a question, another model answers it instead
                    betas: ['server-side-fallback-2026-07-01'],
                    fallbacks: 'default',
                    metadata: { user_id: uid },
                });
                stream.on('text', (t) => { send({ t }); });
                const final = await stream.finalMessage();
                await send({ done: true, stop: final.stop_reason });
            } catch (err) {
                const code = err instanceof Anthropic.RateLimitError ? 'busy'
                    : err instanceof Anthropic.AuthenticationError ? 'key'
                    : err instanceof Anthropic.BadRequestError ? 'bad_request'
                    : err instanceof Anthropic.APIError ? 'api_' + (err.status || 'error')
                    : 'network';
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
