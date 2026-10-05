// YouTube channel helpers for the teachers' videos page (تيوب المدرسين). No API key: a channel's public feed
// (videos.xml) lists its newest videos, and a channel's own page / the search page give its id, name and picture.
// Pure functions only (they are tested with saved pages in tools/yt-test.mjs).

const HDR = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept-Language': 'ar,en;q=0.8',
    Cookie: 'CONSENT=YES+1; SOCS=CAI',
};
const CH_ID = /^UC[A-Za-z0-9_-]{22}$/;
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");
const img = (u) => { u = String(u || ''); if (u.startsWith('//')) u = 'https:' + u; return /^https:\/\/[^\s"'<>]+$/.test(u) ? u : ''; };

// <entry> blocks of a channel feed -> newest first
export function parseFeed(xml) {
    xml = String(xml || '');
    const name = decode((/<author>\s*<name>([^<]*)<\/name>/.exec(xml) || [])[1] || '');
    const out = [];
    for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
        const e = m[1];
        const v = (/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/.exec(e) || [])[1];
        if (!v) continue;
        const t = decode((/<title>([^<]*)<\/title>/.exec(e) || [])[1] || '').slice(0, 140);
        const p = Date.parse((/<published>([^<]+)<\/published>/.exec(e) || [])[1] || '') || 0;
        const w = Number((/<media:statistics[^>]*views="(\d+)"/.exec(e) || [])[1]) || 0;
        out.push({ v, t, p, w });
    }
    return { name, videos: out };
}

// a channel's own page: its id, name and picture
export function parseChannelPage(html) {
    html = String(html || '');
    let id = (/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(html) || [])[1]
        || (/"channelId":"(UC[A-Za-z0-9_-]{22})"/.exec(html) || [])[1]
        || (/"externalId":"(UC[A-Za-z0-9_-]{22})"/.exec(html) || [])[1] || '';
    const name = decode((/<meta property="og:title" content="([^"]*)"/.exec(html) || [])[1] || '').slice(0, 80);
    const a = img(decode((/<meta property="og:image" content="([^"]*)"/.exec(html) || [])[1] || ''));
    return id ? { id, n: name, a } : null;
}

// the search page (channels only): ytInitialData holds channelRenderer objects
export function parseSearch(html) {
    html = String(html || '');
    const m = /var ytInitialData = (\{[\s\S]*?\});\s*<\/script>/.exec(html) || /ytInitialData"\]\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(html);
    if (!m) return [];
    let data; try { data = JSON.parse(m[1]); } catch { return []; }
    const out = [];
    (function walk(o, depth) {
        if (!o || typeof o !== 'object' || depth > 30 || out.length >= 8) return;
        if (o.channelRenderer && CH_ID.test(o.channelRenderer.channelId || '')) {
            const r = o.channelRenderer, th = (r.thumbnail && r.thumbnail.thumbnails) || [];
            const subs = (r.subscriberCountText && (r.subscriberCountText.simpleText || '')) || (r.videoCountText && (r.videoCountText.simpleText || '')) || '';
            out.push({ id: r.channelId, n: String((r.title && (r.title.simpleText || '')) || '').slice(0, 80), a: img((th[th.length - 1] || {}).url), s: String(subs).slice(0, 40) });
            return;
        }
        if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); } else { for (const k of Object.keys(o)) walk(o[k], depth + 1); }
    })(data, 0);
    return out;
}

// what the admin typed -> a lookup plan
export function plan(q) {
    q = String(q || '').trim().slice(0, 200);
    if (!q) return null;
    let m = /(UC[A-Za-z0-9_-]{22})/.exec(q);
    if (m && /youtube\.com\/channel\/|^UC[A-Za-z0-9_-]{22}$/.test(q)) return { kind: 'page', url: 'https://www.youtube.com/channel/' + m[1] };
    m = /youtube\.com\/(@[^/?#\s]+)/.exec(q) || /^(@[^/?#\s]+)$/.exec(q);
    if (m) return { kind: 'page', url: 'https://www.youtube.com/' + encodeURI(m[1]) };
    m = /youtube\.com\/((?:c|user)\/[^/?#\s]+)/.exec(q);
    if (m) return { kind: 'page', url: 'https://www.youtube.com/' + encodeURI(m[1]) };
    return { kind: 'search', url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q) + '&sp=EgIQAg%253D%253D' };
}

export const ytHeaders = HDR;
export const isChannelId = (s) => CH_ID.test(String(s || ''));

// ---- a channel's whole upload list (its "uploads" playlist = the channel id with UC -> UU), page by page ----
export const uploadsUrl = (id) => 'https://www.youtube.com/playlist?list=UU' + String(id).slice(2);
export function initialData(html) {
    html = String(html || '');
    const m = /var ytInitialData = (\{[\s\S]*?\});\s*<\/script>/.exec(html) || /ytInitialData"\]\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(html);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
}
// works on both the first page (ytInitialData) and the answers to a continuation request
export function parseUploads(data) {
    const videos = []; let next = '';
    const txt = (o) => (o && (o.simpleText || (o.runs || []).map((r) => r.text).join(''))) || '';
    (function walk(o, depth) {
        if (!o || typeof o !== 'object' || depth > 40) return;
        if (o.playlistVideoRenderer) {
            const r = o.playlistVideoRenderer;
            if (/^[A-Za-z0-9_-]{11}$/.test(r.videoId || '')) {
                const info = (r.videoInfo && (r.videoInfo.runs || [])) || [];
                videos.push({ v: r.videoId, t: txt(r.title).slice(0, 140), a: info.length ? String(info[info.length - 1].text || '').trim().slice(0, 30) : '', w: info.length > 1 ? String(info[0].text || '').trim().slice(0, 30) : '' });
            }
            return;
        }
        if (o.videoRenderer) {
            const r = o.videoRenderer;
            if (/^[A-Za-z0-9_-]{11}$/.test(r.videoId || '')) videos.push({ v: r.videoId, t: txt(r.title).slice(0, 140), a: txt(r.publishedTimeText).slice(0, 30), w: txt(r.viewCountText).slice(0, 30) });
            return;
        }
        if (o.lockupViewModel && /^[A-Za-z0-9_-]{11}$/.test(o.lockupViewModel.contentId || '') && /VIDEO/.test(o.lockupViewModel.contentType || 'VIDEO')) {
            // the newer page layout: title and the "views . age" line sit in the lockup's metadata
            const m = (o.lockupViewModel.metadata && o.lockupViewModel.metadata.lockupMetadataViewModel) || {}, rows = (((m.metadata || {}).contentMetadataViewModel || {}).metadataRows || []);
            const parts = [].concat(...rows.map((r) => (r.metadataParts || []).map((x) => (x.text && x.text.content) || '')));
            videos.push({ v: o.lockupViewModel.contentId, t: String((m.title && m.title.content) || '').slice(0, 140), a: String(parts[parts.length - 1] || '').slice(0, 30), w: parts.length > 1 ? String(parts[0] || '').slice(0, 30) : '' });
            return;
        }
        if (o.continuationItemRenderer) {
            const tk = o.continuationItemRenderer.continuationEndpoint && o.continuationItemRenderer.continuationEndpoint.continuationCommand && o.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            if (tk && !next) next = String(tk);
            return;
        }
        if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); } else { for (const k of Object.keys(o)) walk(o[k], depth + 1); }
    })(data, 0);
    return { videos, next };
}
