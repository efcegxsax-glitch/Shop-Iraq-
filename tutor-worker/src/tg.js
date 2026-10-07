// Telegram channels for the teachers page: reads the public web preview of a channel (t.me/s/<name>), the same page anyone sees in a
// browser without an account. Nothing is downloaded or stored: a post is its text, the links of its pictures (they stay on Telegram's
// servers), the NAME and SIZE of an attached file, and a video's cover. The app opens the real file in Telegram itself.

export const isTgName = (s) => typeof s === 'string' && /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(s);

// a pasted link or @name -> the channel's user name, or '' (private invite links and numbers cannot be read)
export function tgNameOf(input) {
    let s = String(input || '').trim().replace(/^@/, '');
    s = s.replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me|telegram\.dog)\//i, '').replace(/^s\//i, '');
    if (/^(\+|joinchat)/i.test(s)) return '';
    s = s.split(/[/?#]/)[0];
    return isTgName(s) ? s : '';
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const dec = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m;
});
const plain = (html) => dec(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
// only pictures that Telegram itself serves
const okImg = (u) => /^https:\/\/[a-z0-9.-]*(telesco\.pe|cdn-telegram\.org|telegram\.org|t\.me)\//i.test(u || '');
const bgUrl = (style) => { const m = /url\((['"]?)(https:[^'")]+)\1\)/i.exec(style || ''); return m && okImg(dec(m[2])) ? dec(m[2]) : ''; };
// a media file's address inside the preview (voice notes and short videos are streamed straight from Telegram's servers)
const srcUrl = (html, tag) => { const m = new RegExp('<' + tag + '\\b[^>]*?\\ssrc="([^"]+)"', 'i').exec(html); const u = m ? dec(m[1]) : ''; return okImg(u) ? u : ''; };
// "1.2K", "3M" -> a number
const kmb = (s) => { const m = /^([\d.,]+)\s*([KMkm]?)/.exec(String(s || '').trim()); if (!m) return 0; const n = parseFloat(m[1].replace(',', '.')); return Math.round(n * (/k/i.test(m[2]) ? 1e3 : /m/i.test(m[2]) ? 1e6 : 1)) || 0; };

// the channel's name, picture and subscriber count (from the header of the preview page)
export function parseTgInfo(html) {
    html = String(html || '');
    const t = /class="tgme_channel_info_header_title"[^>]*>([\s\S]*?)<\/div>/i.exec(html) || /<meta property="og:title" content="([^"]*)"/i.exec(html);
    const im = /class="tgme_page_photo_image[^"]*"[^>]*>\s*<img[^>]+src="([^"]+)"/i.exec(html) || /<meta property="og:image" content="([^"]*)"/i.exec(html);
    const sub = /<span class="counter_value">([^<]+)<\/span>\s*<span class="counter_type">subscribers?<\/span>/i.exec(html);
    const n = t ? plain(t[1]).slice(0, 80) : '';
    const a = im && okImg(dec(im[1])) ? dec(im[1]) : '';
    // a user name with no public preview shows only the profile card: it has a title but no messages
    return { n, a, subs: sub ? kmb(sub[1]) : 0, preview: /tgme_widget_message_wrap/.test(html) };
}

// the posts on one page of the preview, oldest to newest as the page lists them
export function parseTgPosts(html, chan) {
    const out = [];
    const parts = String(html || '').split(/<div class="tgme_widget_message_wrap/).slice(1);
    for (const part of parts) {
        const dp = /data-post="([A-Za-z0-9_]+)\/(\d+)"/.exec(part);
        if (!dp || (chan && dp[1].toLowerCase() !== String(chan).toLowerCase())) continue;
        const id = parseInt(dp[2], 10);
        if (/tgme_widget_message_service/.test(part.slice(0, 400))) continue;
        // the post's own text (a quoted reply has its own block with another class)
        const tx = /<div class="tgme_widget_message_text[^"]*js-message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(part);
        const t = tx ? plain(tx[1]).slice(0, 1200) : '';
        const im = [];
        const re = /<a class="tgme_widget_message_photo_wrap[^"]*"[^>]*style="([^"]*)"/gi; let m;
        while ((m = re.exec(part)) && im.length < 4) { const u = bgUrl(m[1]); if (u) im.push(u); }
        const docs = [];
        const dr = /<div class="tgme_widget_message_document_title[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div class="tgme_widget_message_document_extra[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        while ((m = dr.exec(part)) && docs.length < 5) docs.push({ n: plain(m[1]).slice(0, 120), z: plain(m[2]).slice(0, 20) });
        let vd = null;
        const vt = /<i class="tgme_widget_message_video_thumb"[^>]*style="([^"]*)"/i.exec(part) || /<i class="tgme_widget_message_roundvideo_thumb"[^>]*style="([^"]*)"/i.exec(part);
        if (vt || /tgme_widget_message_video_player|tgme_widget_message_roundvideo_player/.test(part)) {
            const du = /<time[^>]*class="message_video_duration[^"]*"[^>]*>([^<]*)<\/time>/i.exec(part) || /class="message_video_duration[^"]*"[^>]*>([^<]*)</i.exec(part);
            vd = { th: vt ? bgUrl(vt[1]) : '', du: du ? du[1].trim().slice(0, 10) : '', u: srcUrl(part, 'video') };
        }
        const isVoice = /tgme_widget_message_voice/.test(part);
        const vdur = /<time[^>]*class="tgme_widget_message_voice_duration[^"]*"[^>]*>([^<]*)<\/time>/i.exec(part) || /class="tgme_widget_message_voice_duration[^"]*"[^>]*>([^<]*)</i.exec(part);
        const voice = isVoice ? { u: srcUrl(part, 'audio'), du: vdur ? vdur[1].trim().slice(0, 10) : '' } : null;
        const tm = /<time[^>]*datetime="([^"]+)"/i.exec(part);
        const p = tm ? Date.parse(tm[1]) || 0 : 0;
        const vw = /<span class="tgme_widget_message_views">([^<]*)<\/span>/i.exec(part);
        if (!t && !im.length && !docs.length && !vd && !voice) continue;
        out.push({ c: dp[1], i: id, p, t, im, d: docs, vd, vo: voice, w: vw ? kmb(vw[1]) : 0, ...(/tgme_widget_message_forwarded_from/.test(part) ? { fw: 1 } : {}) });
    }
    return out;
}

// the id of the oldest post on the page (for "older posts": ?before=<id>)
export const tgOldest = (posts) => posts.reduce((m, x) => (m === 0 || x.i < m ? x.i : m), 0);

// the push text of a post: its first line, or what it carries
export function tgPushText(x) {
    const first = String(x.t || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
    if (first) return first.length > 110 ? first.slice(0, 107) + '...' : first;
    if (x.d && x.d.length) return 'ملف جديد: ' + x.d[0].n;
    if (x.vd) return 'فيديو جديد';
    if (x.im && x.im.length) return 'صورة جديدة';
    if (x.vo) return 'رسالة صوتية جديدة';
    return 'منشور جديد';
}
