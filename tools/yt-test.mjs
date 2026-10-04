// Checks the YouTube page readers in tutor-worker/src/yt.js against small saved samples.
//   node tools/yt-test.mjs
import { parseFeed, parseChannelPage, parseSearch, plan, isChannelId } from '../tutor-worker/src/yt.js';
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
const feed = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
<title>أستاذ تجربة</title><author><name>أستاذ &amp; تجربة</name></author>
<entry><id>yt:video:AAAAAAAAAAA</id><yt:videoId>AAAAAAAAAAA</yt:videoId><yt:channelId>UCabcdefghijklmnopqrstuv</yt:channelId><title>المحاضرة 1 &quot;الفيزياء&quot;</title><published>2026-10-01T10:00:00+00:00</published><media:group><media:community><media:statistics views="1234"/></media:community></media:group></entry>
<entry><yt:videoId>BBBBBBBBBBB</yt:videoId><title>المحاضرة 2</title><published>2026-09-30T10:00:00+00:00</published></entry></feed>`;
const f = parseFeed(feed);
t('feed name', f.name === 'أستاذ & تجربة'); t('feed count', f.videos.length === 2); t('feed first', f.videos[0].v === 'AAAAAAAAAAA' && f.videos[0].w === 1234 && f.videos[0].t.includes('"الفيزياء"') && f.videos[0].p > 1.7e12);
t('feed empty', parseFeed('').videos.length === 0);
const page = '<link rel="canonical" href="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"><meta property="og:title" content="حسين محمد"><meta property="og:image" content="https://yt3.googleusercontent.com/abc=s900">';
const p = parseChannelPage(page);
t('page id', p && p.id === 'UCabcdefghijklmnopqrstuv' && p.n === 'حسين محمد' && p.a.startsWith('https://yt3.'));
t('page none', parseChannelPage('<html></html>') === null);
const data = { contents: { x: [{ channelRenderer: { channelId: 'UCabcdefghijklmnopqrstuv', title: { simpleText: 'سجاد عكيلي' }, thumbnail: { thumbnails: [{ url: '//yt3.ggpht.com/a=s88' }, { url: '//yt3.ggpht.com/a=s176' }] }, subscriberCountText: { simpleText: '120 ألف مشترك' } } }, { videoRenderer: { videoId: 'x' } }] } };
const sr = parseSearch(`<script>var ytInitialData = ${JSON.stringify(data)};</script>`);
t('search', sr.length === 1 && sr[0].n === 'سجاد عكيلي' && sr[0].a === 'https://yt3.ggpht.com/a=s176' && sr[0].s.includes('120'));
t('search none', parseSearch('<html></html>').length === 0);
t('plan handle', plan('@Hussein').kind === 'page' && plan('https://www.youtube.com/@Hussein/videos').url === 'https://www.youtube.com/@Hussein');
t('plan channel', plan('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv').url.endsWith('UCabcdefghijklmnopqrstuv'));
t('plan name', plan('فاضل هاشم').kind === 'search' && plan('فاضل هاشم').url.includes('search_query='));
t('plan empty', plan('  ') === null); t('id check', isChannelId('UCabcdefghijklmnopqrstuv') && !isChannelId('abc'));
console.log(bad ? bad + ' failed' : 'all ' + ok + ' passed'); process.exit(bad ? 1 : 0);
