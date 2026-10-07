// Checks the Telegram page readers in tutor-worker/src/tg.js against a small saved sample of a channel's public preview page.
//   node tools/tg-test.mjs
import { isTgName, tgNameOf, parseTgInfo, parseTgPosts, tgOldest, tgPushText } from '../tutor-worker/src/tg.js';
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
t('names', isTgName('mr_ali_math') && !isTgName('ab') && !isTgName('1abc') && !isTgName('a-b-c-d'));
t('link forms', ['https://t.me/mr_ali_math', 't.me/mr_ali_math', '@mr_ali_math', 'https://t.me/s/mr_ali_math', 'http://telegram.me/mr_ali_math?start=1', 'mr_ali_math', 'https://t.me/mr_ali_math/55'].every((x) => tgNameOf(x) === 'mr_ali_math'));
t('private links refused', tgNameOf('https://t.me/+AbCdEfGhIjK') === '' && tgNameOf('https://t.me/joinchat/AAAA') === '' && tgNameOf('hello world') === '' && tgNameOf('') === '' && tgNameOf(null) === '');
const page = `<html><body>
<div class="tgme_channel_info_header_title"><span dir="auto">الأستاذ علي &amp; الرياضيات</span></div>
<i class="tgme_page_photo_image bgsized"><img src="https://cdn4.cdn-telegram.org/file/avatar.jpg"></i>
<div class="tgme_channel_info_counter"><span class="counter_value">12.3K</span> <span class="counter_type">subscribers</span></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="mr_ali_math/101" data-view="x"><div class="tgme_widget_message_bubble">
<div class="tgme_widget_message_text js-message_text" dir="auto">محاضرة اليوم <b>مهمة</b><br/>الساعة 8 مساءً &quot;الفصل الثالث&quot;</div>
<div class="tgme_widget_message_footer"><div class="tgme_widget_message_info"><span class="tgme_widget_message_views">1.2K</span> <span class="tgme_widget_message_meta"><a class="tgme_widget_message_date" href="https://t.me/mr_ali_math/101"><time datetime="2026-10-01T17:00:00+00:00" class="time">20:00</time></a></span></div></div></div></div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="mr_ali_math/102"><div class="tgme_widget_message_bubble">
<a class="tgme_widget_message_photo_wrap 5456 js-message_photo" href="https://t.me/mr_ali_math/102" style="width:453px;background-image:url('https://cdn4.cdn-telegram.org/file/p1.jpg')"></a>
<a class="tgme_widget_message_photo_wrap 5457 js-message_photo" href="https://t.me/mr_ali_math/102" style="width:453px;background-image:url('https://evil.example.com/x.jpg')"></a>
<div class="tgme_widget_message_text js-message_text" dir="auto">ملزمة الفصل</div>
<div class="tgme_widget_message_document_wrap"><div class="tgme_widget_message_document"><div class="tgme_widget_message_document_icon accent_bg"></div><div class="tgme_widget_message_document_title accent_color" dir="auto">ملزمة_الفصل_3.pdf</div><div class="tgme_widget_message_document_extra">48.2 MB</div></div></div>
<div class="tgme_widget_message_footer"><div class="tgme_widget_message_info"><span class="tgme_widget_message_views">900</span> <a class="tgme_widget_message_date"><time datetime="2026-10-02T09:30:00+00:00" class="time">12:30</time></a></div></div></div></div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="mr_ali_math/103"><div class="tgme_widget_message_bubble">
<div class="tgme_widget_message_reply"><div class="tgme_widget_message_text js-message_reply_text">نص مقتبس</div></div>
<a class="tgme_widget_message_video_player not_supported js-message_video_player" href="https://t.me/mr_ali_math/103"><i class="tgme_widget_message_video_thumb" style="background-image:url('https://cdn4.cdn-telegram.org/file/v.jpg')"></i><time class="message_video_duration js-message_video_duration">1:23:05</time></a>
<div class="tgme_widget_message_text js-message_text">شرح الدرس</div>
<div class="tgme_widget_message_footer"><div class="tgme_widget_message_info"><a class="tgme_widget_message_date"><time datetime="2026-10-03T10:00:00+00:00" class="time">13:00</time></a></div></div></div></div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="mr_ali_math/105"><div class="tgme_widget_message_bubble">
<div class="tgme_widget_message_voice_player"><audio class="tgme_widget_message_voice js-message_voice" src="https://cdn5.telesco.pe/file/voice1.ogg" preload="none"></audio><time class="tgme_widget_message_voice_duration js-message_voice_duration">0:45</time></div>
<div class="tgme_widget_message_footer"><div class="tgme_widget_message_info"><a class="tgme_widget_message_date"><time datetime="2026-10-04T10:00:00+00:00" class="time">13:00</time></a></div></div></div></div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="mr_ali_math/106"><div class="tgme_widget_message_bubble">
<div class="tgme_widget_message_voice_player"><audio class="tgme_widget_message_voice js-message_voice" src="https://evil.example.com/v.ogg"></audio><time class="tgme_widget_message_voice_duration">1:02</time></div>
<div class="tgme_widget_message_footer"><div class="tgme_widget_message_info"><a class="tgme_widget_message_date"><time datetime="2026-10-04T11:00:00+00:00" class="time">14:00</time></a></div></div></div></div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message service_message" data-post="mr_ali_math/104"><div class="tgme_widget_message_service tgme_widget_message_text">Channel created</div></div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="other_chan/9"><div class="tgme_widget_message_text js-message_text">ليس من القناة</div></div></div>
</body></html>`;
const info = parseTgInfo(page);
t('info name', info.n === 'الأستاذ علي & الرياضيات'); t('info picture', info.a === 'https://cdn4.cdn-telegram.org/file/avatar.jpg'); t('info subs', info.subs === 12300); t('info preview', info.preview === true);
t('info none', parseTgInfo('<html></html>').n === '' && parseTgInfo('<html></html>').preview === false);
const posts = parseTgPosts(page, 'mr_ali_math');
t('post count (service and other channel skipped)', posts.length === 5);
t('post 1 text', posts[0].i === 101 && posts[0].t === 'محاضرة اليوم مهمة\nالساعة 8 مساءً "الفصل الثالث"');
t('post 1 meta', posts[0].p === Date.parse('2026-10-01T17:00:00+00:00') && posts[0].w === 1200 && posts[0].im.length === 0 && posts[0].d.length === 0 && !posts[0].vd);
t('post 2 pictures only from Telegram', posts[1].im.length === 1 && posts[1].im[0] === 'https://cdn4.cdn-telegram.org/file/p1.jpg');
t('post 2 file name and size, no file link', posts[1].d.length === 1 && posts[1].d[0].n === 'ملزمة_الفصل_3.pdf' && posts[1].d[0].z === '48.2 MB' && posts[1].t === 'ملزمة الفصل');
t('post 3 video cover and length; the quoted reply text is not the post text', posts[2].vd && posts[2].vd.u === '' && posts[2].vd.du === '1:23:05' && posts[2].vd.th === 'https://cdn4.cdn-telegram.org/file/v.jpg' && posts[2].t === 'شرح الدرس');
t('oldest id', tgOldest(posts) === 101 && tgOldest([]) === 0);
t('voice note: its own address and length, played inside the app', posts[3].vo && posts[3].vo.u === 'https://cdn5.telesco.pe/file/voice1.ogg' && posts[3].vo.du === '0:45' && posts[3].t === '');
t('voice note from a foreign host gets no address', posts[4].vo && posts[4].vo.u === '' && posts[4].vo.du === '1:02');
t('voice push text', tgPushText(posts[3]) === 'رسالة صوتية جديدة');
t('no voice on a normal post', posts[0].vo === null);
t('push text', tgPushText(posts[0]) === 'محاضرة اليوم مهمة' && tgPushText(posts[1]) === 'ملزمة الفصل' && tgPushText({ t: '', d: [{ n: 'a.pdf' }] }) === 'ملف جديد: a.pdf' && tgPushText({ t: '', vd: {} }) === 'فيديو جديد' && tgPushText({ t: '', im: ['x'], d: [] }) === 'صورة جديدة');
t('empty page', parseTgPosts('', 'x').length === 0 && parseTgPosts('<html></html>', 'x').length === 0);
t('script text is not kept as markup', !/[<>]/.test(parseTgPosts('<div class="tgme_widget_message_wrap"><div data-post="abcd/5"><div class="tgme_widget_message_text js-message_text">a <script>alert(1)</script> b</div><time datetime="2026-10-01T00:00:00+00:00"></time>', 'abcd')[0].t.replace('alert(1)', '')));
console.log('tg tests passed', ok, 'failed', bad);
process.exit(bad ? 1 : 0);
