        // ==================== SECURITY HELPERS ====================
        function escapeHtml(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // FIX (XSS): database values used to be pasted raw into inline onclick="..."
        // handlers and element ids (message ids, product ids, user ids...). Anyone who can
        // write a chat message, forum post, friend request or store product could put a
        // quote in that value and run script in other students' browsers. jsArg() emits a
        // JSON string literal and HTML-escapes it for the attribute; jsNum() only lets a
        // finite number through.
        function jsArg(value) {
            return escapeHtml(JSON.stringify(value == null ? '' : String(value)));
        }
        function jsNum(value) {
            const n = Number(value);
            return Number.isFinite(n) ? String(n) : '0';
        }
        function numOr0(value) {
            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
        }
        // Records whose `id` isn't a finite number are dropped and numeric-string ids are
        // coerced, so every `x.id === id` lookup and every id="...-${x.id}" stays safe.
        function withNumericIds(list, key) {
            const k = key || 'id';
            return list.filter((x) => x && typeof x === 'object' && Number.isFinite(Number(x[k])))
                .map((x) => (typeof x[k] === 'number' ? x : { ...x, [k]: Number(x[k]) }));
        }

        function isSafeImageUrl(value) {
            try {
                const str = String(value);
                // Data URLs: protocol is always 'data:' — must check the MIME prefix explicitly
                if (str.startsWith('data:')) {
                    return /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(str);
                }
                const url = new URL(str, window.location.href);
                return url.protocol === 'https:';
            } catch (e) {
                return false;
            }
        }

        const FALLBACK_IMAGE = 'icons/icon-192.png';

        function safeImage(value) {
            return isSafeImageUrl(value) ? value : FALLBACK_IMAGE;
        }

        // A news without a usable picture shows one of three pictures of the site: a red "عاجل" card (urgent), the parliament building (about the
        // parliament) or the ministry building (everything else). The same goes for the old stock photo that earlier news were saved with and for a
        // picture that does not load (a dead link): see newsImg / app.newsImgFb. They sit in assets/news/ with the app.
        const NEWS_DEFAULT = { urgent: 'assets/news/urgent.jpg', parl: 'assets/news/parliament.jpg', gen: 'assets/news/ministry.jpg' };
        const OLD_STOCK = /photo-1562774053-701939374585/;
        function newsDefault(n) {
            if (n && n.isUrgent) return NEWS_DEFAULT.urgent;
            const t = String((n && n.title) || '') + ' ' + String((n && n.excerpt) || '');
            return /(مجلس\s*النواب|البرلمان|برلمان|النيابي[ةه])/.test(t) ? NEWS_DEFAULT.parl : NEWS_DEFAULT.gen;
        }
        function newsImg(n) {
            const v = n && n.image;
            if (!v || OLD_STOCK.test(String(v)) || !isSafeImageUrl(v)) return newsDefault(n);
            return v;
        }

        function isSafeVideoUrl(value) {
            try {
                const str = String(value);
                if (str.startsWith('data:')) {
                    return /^data:video\/(mp4|webm|ogg|quicktime);base64,/i.test(str);
                }
                const url = new URL(str, window.location.href);
                return url.protocol === 'https:';
            } catch (e) {
                return false;
            }
        }

        function safeVideo(value) {
            return isSafeVideoUrl(value) ? value : '';
        }

        // FIX (XSS): voice/file chat messages used to put m.audioUrl / m.fileUrl straight
        // into src="..." / href="..." — a crafted message could break out of the attribute
        // or use a javascript: link. Only base64 data URLs of the expected type or https
        // links are accepted now.
        function safeAudioUrl(value) {
            const str = String(value || '');
            if (/^data:audio\/[a-z0-9.+-]+(;[a-z0-9=.+-]+)*;base64,/i.test(str)) return str;
            try { return new URL(str).protocol === 'https:' ? str : ''; } catch (e) { return ''; }
        }
        function safeFileUrl(value) {
            const str = String(value || '');
            if (/^data:application\/pdf;base64,/i.test(str)) return str;
            try { return new URL(str).protocol === 'https:' ? str : ''; } catch (e) { return ''; }
        }

        function personAvatarSrc(avatar, name) {
            return isSafeImageUrl(avatar) ? avatar : ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name || 'Student') + '&background=2563EB&color=fff&size=200');
        }

        function compressForumImage(file, maxWidth, quality) {
            return new Promise((resolve) => {
                createImageBitmap(file).then((bitmap) => {
                    const maxW = maxWidth || 1280;
                    const scale = Math.min(1, maxW / bitmap.width);
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(bitmap.width * scale);
                    canvas.height = Math.round(bitmap.height * scale);
                    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => {
                        if (!blob) { resolve(null); return; }
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(blob);
                    }, 'image/jpeg', quality || 0.88);
                }).catch((e) => {
                    console.warn('Image compression failed:', e);
                    resolve(null);
                });
            });
        }

        function timeAgo(ts) {
            if (!ts) return '';
            const diff = Date.now() - ts;
            if (diff < 60000) return 'الآن';
            if (diff < 3600000) return 'قبل ' + Math.floor(diff / 60000) + ' د';
            if (diff < 86400000) return 'قبل ' + Math.floor(diff / 3600000) + ' س';
            return 'قبل ' + Math.floor(diff / 86400000) + ' يوم';
        }

        function hexToRgb(hex) {
            const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
            if (!m) return null;
            const int = parseInt(m[1], 16);
            return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
        }

        // every appearance: name, whether it is a dark one (adds the .dark class so Tailwind's dark: utilities apply), its own class, the page colour, and the swatch
        const APP_THEMES = {
        colored: { n: 'لوني', dark: false, cls: [], bg: '#F1F5F3', sw: 'linear-gradient(135deg, #F1F5F3 50%, #0D7C6E 50%)' },
        pink: { n: 'وردي فاتح', dark: false, cls: ["theme-pink"], bg: '#FFF4F8', sw: '#F9A8D4' },
        blue: { n: 'أزرق', dark: true, cls: ["theme-blue"], bg: '#0B1322', sw: '#0F172A' },
        black: { n: 'أسود', dark: true, cls: [], bg: '#000000', sw: '#000000' },
        desert: { n: 'صحراوي', dark: false, cls: ['theme-desert'], bg: '#F7EEDC', sw: 'linear-gradient(135deg, #F7EEDC 50%, #AD5119 50%)' },
        mint: { n: 'نعناع', dark: false, cls: ['theme-mint'], bg: '#EEF8F2', sw: 'linear-gradient(135deg, #EEF8F2 50%, #17784F 50%)' },
        sky: { n: 'سماء', dark: false, cls: ['theme-sky'], bg: '#EEF6FD', sw: 'linear-gradient(135deg, #EEF6FD 50%, #1D6FC4 50%)' },
        lavender: { n: 'لافندر', dark: false, cls: ['theme-lavender'], bg: '#F5F1FD', sw: 'linear-gradient(135deg, #F5F1FD 50%, #6D3FC8 50%)' },
        dune: { n: 'ليل الصحراء', dark: true, cls: ['theme-dune'], bg: '#16100A', sw: 'linear-gradient(135deg, #16100A 50%, #B26110 50%)' },
        sunset: { n: 'غروب', dark: true, cls: ['theme-sunset'], bg: '#1C0F1F', sw: 'linear-gradient(135deg, #1C0F1F 50%, #D13F6B 50%)' },
        forest: { n: 'غابة', dark: true, cls: ['theme-forest'], bg: '#0A1712', sw: 'linear-gradient(135deg, #0A1712 50%, #1C8758 50%)' },
        ocean: { n: 'محيط', dark: true, cls: ['theme-ocean'], bg: '#061A22', sw: 'linear-gradient(135deg, #061A22 50%, #0D8195 50%)' },
        coffee: { n: 'قهوة', dark: true, cls: ['theme-coffee'], bg: '#1A120E', sw: 'linear-gradient(135deg, #1A120E 50%, #A66739 50%)' },
        royal: { n: 'ملكي', dark: true, cls: ['theme-royal'], bg: '#120E26', sw: 'linear-gradient(135deg, #120E26 50%, #7C5CE0 50%)' },
        };

        function applyCustomThemeColor(hex) {
            const rgb = hexToRgb(hex);
            if (!rgb) return;
            const { r, g, b } = rgb;
            document.documentElement.style.setProperty('--p', `${r} ${g} ${b}`);
            let styleEl = document.getElementById('customThemeStyle');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'customThemeStyle';
                document.head.appendChild(styleEl);
            }
            styleEl.textContent = `
                .bg-primary { background-color: ${hex} !important; }
                .bg-primary\\/10 { background-color: rgba(${r}, ${g}, ${b}, 0.1) !important; }
                .text-primary { color: ${hex} !important; }
                .border-primary { border-color: ${hex} !important; }
                .border-r-primary { border-right-color: ${hex} !important; }
                .fill-primary { fill: ${hex} !important; }
                .ring-primary { --tw-ring-color: ${hex} !important; }
                .ring-primary\\/20 { --tw-ring-color: rgba(${r}, ${g}, ${b}, 0.2) !important; }
                .shadow-primary\\/25 { --tw-shadow-color: rgba(${r}, ${g}, ${b}, 0.25) !important; }
            `;
        }

        // News carry their photos inside the record, so a few of them overflowed localStorage and the
        // saved copy silently failed. IndexedDB holds them (and keeps every news ever seen).
        const newsStore = {
            _p: null,
            open() {
                if (!this._p) this._p = new Promise((resolve) => {
                    try {
                        const rq = indexedDB.open('isp-news', 2);
                        rq.onupgradeneeded = () => {
                            if (!rq.result.objectStoreNames.contains('n')) rq.result.createObjectStore('n', { keyPath: 'id' });
                            if (!rq.result.objectStoreNames.contains('k')) rq.result.createObjectStore('k', { keyPath: 'k' });
                        };
                        rq.onsuccess = () => resolve(rq.result);
                        rq.onerror = () => resolve(null);
                        rq.onblocked = () => resolve(null);
                    } catch (e) { resolve(null); }
                });
                return this._p;
            },
            async all() {
                const db = await this.open();
                if (!db) return [];
                return new Promise((resolve) => {
                    try { const r = db.transaction('n').objectStore('n').getAll(); r.onsuccess = () => resolve(r.result || []); r.onerror = () => resolve([]); } catch (e) { resolve([]); }
                });
            },
            async put(items) {
                const db = await this.open();
                if (!db || !items.length) return;
                return new Promise((resolve) => {
                    try {
                        const tx = db.transaction('n', 'readwrite'), st = tx.objectStore('n');
                        items.forEach((it) => { try { st.put(it); } catch (e) {} });
                        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
                    } catch (e) { resolve(); }
                });
            },
            async kvGet(k) {
                const db = await this.open();
                if (!db) return null;
                return new Promise((resolve) => {
                    try { const r = db.transaction('k').objectStore('k').get(k); r.onsuccess = () => resolve(r.result ? r.result.v : null); r.onerror = () => resolve(null); } catch (e) { resolve(null); }
                });
            },
            async kvPut(k, v) {
                const db = await this.open();
                if (!db) return;
                return new Promise((resolve) => {
                    try { const tx = db.transaction('k', 'readwrite'); tx.objectStore('k').put({ k, v }); tx.oncomplete = tx.onerror = tx.onabort = () => resolve(); } catch (e) { resolve(); }
                });
            },
            async remove(ids) {
                const db = await this.open();
                if (!db || !ids.length) return;
                return new Promise((resolve) => {
                    try {
                        const tx = db.transaction('n', 'readwrite'), st = tx.objectStore('n');
                        ids.forEach((id) => { try { st.delete(id); } catch (e) {} });
                        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
                    } catch (e) { resolve(); }
                });
            },
        };

        function loadNewsCache() {
            try {
                const raw = localStorage.getItem('isp_news_cache');
                return raw ? JSON.parse(raw) : [];
            } catch (e) {
                return [];
            }
        }

        // ==================== OFFLINE RESOURCES (IndexedDB) ====================
        // Resource PDFs/thumbnails arrive from Firebase already as base64 data: URLs
        // (see the admin panel's uploadFile()), so "saving for offline" needs no network
        // fetch — the full record (metadata + the data: URL itself) is just written to
        // IndexedDB as-is. localStorage isn't used here because a single PDF can be
        // several MB, well past localStorage's ~5-10MB per-origin quota.
        const OFFLINE_DB_NAME = 'iraqiStudentOfflineDB';
        const OFFLINE_STORE = 'resources';
        function openOfflineDB() {
            return new Promise((resolve, reject) => {
                if (!('indexedDB' in window)) { reject(new Error('IndexedDB غير مدعوم في هذا المتصفح')); return; }
                const req = indexedDB.open(OFFLINE_DB_NAME, 1);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(OFFLINE_STORE)) db.createObjectStore(OFFLINE_STORE, { keyPath: 'id' });
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        const offlineResourcesDB = {
            async save(res) {
                const db = await openOfflineDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(OFFLINE_STORE, 'readwrite');
                    tx.objectStore(OFFLINE_STORE).put({
                        id: res.id, title: res.title || '', description: res.description || '',
                        thumbnail: res.thumbnail || '', fileUrl: res.fileUrl || '', fileSize: res.fileSize || '',
                        stage: res.stage || '', subject: res.subject || '', year: res.year || '',
                        isOfficial: !!res.isOfficial, savedAt: Date.now()
                    });
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
            },
            async get(id) {
                const db = await openOfflineDB();
                return new Promise((resolve, reject) => {
                    const req = db.transaction(OFFLINE_STORE, 'readonly').objectStore(OFFLINE_STORE).get(id);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => reject(req.error);
                });
            },
            async getAll() {
                const db = await openOfflineDB();
                return new Promise((resolve, reject) => {
                    const req = db.transaction(OFFLINE_STORE, 'readonly').objectStore(OFFLINE_STORE).getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                });
            },
            async remove(id) {
                const db = await openOfflineDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(OFFLINE_STORE, 'readwrite');
                    tx.objectStore(OFFLINE_STORE).delete(id);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
            }
        };

        // ==================== FORUM CONTENT FILTER ====================
        // Blocks common Arabic/Iraqi and English profanity, insults, and sexual terms
        // before a question/answer is ever saved to the shared database.
        const bannedWordsList = [
            'كلب', 'حمار', 'غبي', 'احمق', 'أحمق', 'خرا', 'خره', 'قحبة', 'قحبه', 'عاهرة', 'عاهره',
            'كس', 'كسم', 'طيز', 'زبي', 'زبك', 'نيك', 'ناك', 'منيك', 'شرموط', 'شرموطة', 'شرموطه',
            'لوطي', 'خول', 'متناك', 'ابن كلب', 'ابن الكلب', 'يلعن', 'لعنة', 'وسخ', 'زفت',
            'حقير', 'تافه', 'خنيث', 'عرص', 'منيوك',
            'fuck', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'porn', 'whore', 'slut', 'cunt'
        ];

        // FIX: lookbehind/lookahead regex syntax (?<!...)/(?!...) throws a SyntaxError on
        // browsers that don't support it (Safari < 16.4), which previously crashed every
        // caller of filterBadWords with an uncaught exception (registration, profile edit,
        // forum posts, chat messages, store names...). The construction is now wrapped in
        // try/catch with a plain substring-replace fallback so those callers keep working
        // (with slightly less precise word-boundary matching) instead of throwing.
        // FIX: the old fallback for browsers without lookbehind (Safari < 16.4) matched
        // plain substrings, so ordinary words were starred out ("هناك" contains "ناك",
        // "عكس" contains "كس"...). The start boundary is now a captured group, which every
        // browser supports, so word-boundary matching is the same everywhere.
        function filterBadWords(text) {
            if (!text) return { clean: text || '', filtered: false };
            let result = String(text);
            let filtered = false;
            const letter = '\\u0600-\\u06FF\\u0750-\\u077Fa-zA-Z0-9';
            bannedWordsList.forEach((word) => {
                if (!word) return;
                const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp('(^|[^' + letter + '])(' + escaped + ')(?![' + letter + '])', 'gi');
                result = result.replace(re, (m, pre, bad) => {
                    filtered = true;
                    return pre + '*'.repeat(bad.length);
                });
            });
            return { clean: result, filtered };
        }

        // ==================== DATA MODEL ====================
        const categories = [
            { id: 'all', label: 'الكل', icon: 'layout-grid' },
            { id: 'exams', label: 'الامتحانات', icon: 'file-text' },
            { id: 'results', label: 'النتائج', icon: 'trending-up' },
            { id: 'admission', label: 'القبول', icon: 'user-plus' },
            { id: 'grants', label: 'المنح', icon: 'award' },
            { id: 'schools', label: 'المدارس', icon: 'school' },
            { id: 'decisions', label: 'القرارات', icon: 'gavel' },
            { id: 'weather', label: 'الأنواء الجوية', icon: 'cloud-sun' },
            { id: 'environment', label: 'البيئة', icon: 'leaf' },
            { id: 'other', label: 'أخرى', icon: 'more-horizontal' }
        ];

        const newsData = [];

        const notificationTypes = {
            urgent: { label: 'عاجل', bg: 'bg-urgent-bg', border: 'border-urgent-border', iconBg: 'bg-error/10', iconColor: 'text-error', icon: 'megaphone' },
            announcement: { label: 'إعلان رسمي', bg: 'bg-announcement-bg', border: 'border-announcement-border', iconBg: 'bg-primary/10', iconColor: 'text-primary', icon: 'file-text' },
            circular: { label: 'تعميم', bg: 'bg-circular-bg', border: 'border-circular-border', iconBg: 'bg-success/10', iconColor: 'text-success', icon: 'building-2' },
            update: { label: 'تحديث', bg: 'bg-update-bg', border: 'border-update-border', iconBg: 'bg-warning/10', iconColor: 'text-warning', icon: 'calendar' },
            reminder: { label: 'تذكير', bg: 'bg-reminder-bg', border: 'border-reminder-border', iconBg: 'bg-purple-500/10', iconColor: 'text-purple-500', icon: 'clock' },
            holiday: { label: 'الدوام والعطل', bg: 'bg-general-bg', border: 'border-general-border', iconBg: 'bg-secondary/10', iconColor: 'text-secondary', icon: 'calendar-days' },
            weather: { label: 'الأنواء الجوية', bg: 'bg-general-bg', border: 'border-general-border', iconBg: 'bg-secondary/10', iconColor: 'text-secondary', icon: 'cloud-sun' },
            general: { label: 'أخبار عامة', bg: 'bg-general-bg', border: 'border-general-border', iconBg: 'bg-secondary/10', iconColor: 'text-secondary', icon: 'monitor' }
        };

        const notifications = [];

        const leaderboardStudents = [];

        const subjectsData = {
            'sixth-science': [
                { id: 'arabic', name: 'اللغة العربية', icon: 'book-open', color: 'bg-purple/10', textColor: 'text-purple', iconColor: '#8B5CF6' },
                { id: 'english', name: 'اللغة الإنجليزية', icon: 'languages', color: 'bg-info/10', textColor: 'text-info', iconColor: '#0EA5E9' },
                { id: 'math', name: 'الرياضيات', icon: 'calculator', color: 'bg-success/10', textColor: 'text-success', iconColor: '#10B981' },
                { id: 'chemistry', name: 'الكيمياء', icon: 'flask-conical', color: 'bg-error/10', textColor: 'text-error', iconColor: '#EF4444' },
                { id: 'physics', name: 'الفيزياء', icon: 'atom', color: 'bg-purple/10', textColor: 'text-purple', iconColor: '#8B5CF6' },
                { id: 'biology', name: 'الأحياء', icon: 'leaf', color: 'bg-success/10', textColor: 'text-success', iconColor: '#22C55E' },
            ],
            'sixth-literary': [
                { id: 'arabic', name: 'اللغة العربية', icon: 'book-open', color: 'bg-purple/10', textColor: 'text-purple', iconColor: '#8B5CF6' },
                { id: 'english', name: 'اللغة الإنجليزية', icon: 'languages', color: 'bg-info/10', textColor: 'text-info', iconColor: '#0EA5E9' },
                { id: 'history', name: 'التاريخ', icon: 'landmark', color: 'bg-warning/10', textColor: 'text-warning', iconColor: '#F59E0B' },
                { id: 'geography', name: 'الجغرافية', icon: 'globe', color: 'bg-primary/10', textColor: 'text-primary', iconColor: '#3B82F6' },
                { id: 'economics', name: 'الاقتصاد', icon: 'trending-up', color: 'bg-accent/10', textColor: 'text-accent', iconColor: '#EC4899' },
                { id: 'islamic', name: 'العلوم الإسلامية', icon: 'moon', color: 'bg-success/10', textColor: 'text-success', iconColor: '#10B981' },
                { id: 'philosophy', name: 'الفلسفة', icon: 'brain', color: 'bg-purple/10', textColor: 'text-purple', iconColor: '#A855F7' },
                { id: 'social', name: 'علم الاجتماع', icon: 'users', color: 'bg-indigo/10', textColor: 'text-indigo', iconColor: '#6366F1' },
            ],
            'fifth-science': [
                { id: 'arabic', name: 'اللغة العربية', icon: 'book-open', color: 'bg-purple/10', textColor: 'text-purple', iconColor: '#8B5CF6' },
                { id: 'english', name: 'اللغة الإنجليزية', icon: 'languages', color: 'bg-info/10', textColor: 'text-info', iconColor: '#0EA5E9' },
                { id: 'math', name: 'الرياضيات', icon: 'calculator', color: 'bg-success/10', textColor: 'text-success', iconColor: '#10B981' },
                { id: 'chemistry', name: 'الكيمياء', icon: 'flask-conical', color: 'bg-error/10', textColor: 'text-error', iconColor: '#EF4444' },
                { id: 'physics', name: 'الفيزياء', icon: 'atom', color: 'bg-purple/10', textColor: 'text-purple', iconColor: '#8B5CF6' },
                { id: 'biology', name: 'الأحياء', icon: 'leaf', color: 'bg-success/10', textColor: 'text-success', iconColor: '#22C55E' },
            ],
            'fifth-literary': [
                { id: 'arabic', name: 'اللغة العربية', icon: 'book-open', color: 'bg-purple/10', textColor: 'text-purple', iconColor: '#8B5CF6' },
                { id: 'english', name: 'اللغة الإنجليزية', icon: 'languages', color: 'bg-info/10', textColor: 'text-info', iconColor: '#0EA5E9' },
                { id: 'history', name: 'التاريخ', icon: 'landmark', color: 'bg-warning/10', textColor: 'text-warning', iconColor: '#F59E0B' },
                { id: 'geography', name: 'الجغرافية', icon: 'globe', color: 'bg-primary/10', textColor: 'text-primary', iconColor: '#3B82F6' },
                { id: 'economics', name: 'الاقتصاد', icon: 'trending-up', color: 'bg-accent/10', textColor: 'text-accent', iconColor: '#EC4899' },
                { id: 'islamic', name: 'العلوم الإسلامية', icon: 'moon', color: 'bg-success/10', textColor: 'text-success', iconColor: '#10B981' },
            ]
        };

        const resourcesData = [];

        const walletTransactions = [];


        const examSchedule = [];

        const holidays = [];

        const monthlyActivity = {};

        const userChatsList = [];


        const friendsList = [];
        const incomingFriendRequests = [];
        const sentFriendRequestsList = [];
        const blockedUsersList = [];
        const friendsPresence = {};

        const storeProductsList = [];
        const storeCart = [];
        const myStoreProducts = [];
        const storeCategories = { all: 'الكل', stationery: 'قرطاسية', books: 'كتب', notes: 'ملازم', supplies: 'مستلزمات' };


        const pointsStoreOffers = [
            { points: 5000, iqd: 500 },
            { points: 10000, iqd: 1000 },
            { points: 20000, iqd: 2000 },
            { points: 50000, iqd: 5000 }
        ];

        const studyRoomStudents = [];

        const dailyTips = [
            'ابدأ بالمادة الأصعب عليك وأنت بأعلى تركيز، وأجّل السهلة لوقت التعب.',
            'قسّم وقت المذاكرة إلى جلسات قصيرة مع فواصل راحة بدل جلسة طويلة متواصلة.',
            'راجع ما درسته بالأمس لمدة 5 دقائق قبل البدء بمادة اليوم — يثبّت المعلومة أكثر.',
            'اكتب ملخصًا بخط يدك بعد كل درس، الكتابة تساعد الدماغ يتذكر أفضل من القراءة فقط.',
            'حل أسئلة سنوات سابقة أهم من إعادة قراءة الكتاب عدة مرات.',
            'نام عدد ساعات كافي قبل الامتحان، السهر يقلل التركيز أكثر مما يزيد المذاكرة.',
            'اشرح الدرس لشخص ثاني بصوت عالي — لو قدرت تشرحه فهذا دليل إنك فهمته فعلاً.',
            'رتّب مكان مذاكرتك وابعد هاتفك عنك وقت التركيز.',
            'اشرب ماء كافي أثناء المذاكرة، الجفاف يقلل التركيز والانتباه.',
            'حدد هدف واضح لكل جلسة مذاكرة قبل ما تبدأ (مثلاً: إنهاء فصل معين) بدل المذاكرة بدون خطة.',
            'لا تقارن سرعتك بزملائك، كل شخص له وتيرة مختلفة بالفهم والحفظ.',
            'راجع أخطاءك بالأسئلة السابقة بدل تجاهلها، أغلب الأسئلة تتكرر بصيغة مشابهة.',
            'خذ نفس عميق قبل الامتحان، القلق الزائد يشتت التركيز أكثر مما يساعد.',
            'ذاكر بترتيب منطقي: افهم القاعدة أولاً، وبعدين حل الأمثلة عليها.',
            'كافئ نفسك بعد إنهاء هدف مذاكرة — التحفيز الذاتي يزيد الاستمرارية.'
        ];

        const userTasks = [];

        // 18 governorates + Halabja. Older records may say "الموصل" — that's Nineveh.
        const IRAQ_GOVERNORATES = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'السليمانية', 'دهوك', 'حلبجة', 'كركوك', 'الأنبار', 'صلاح الدين', 'ديالى', 'بابل', 'كربلاء', 'النجف', 'واسط', 'القادسية', 'ذي قار', 'ميسان', 'المثنى'];
        const GOVERNORATE_ALIASES = { 'الموصل': 'نينوى', 'الديوانية': 'القادسية', 'الناصرية': 'ذي قار', 'العمارة': 'ميسان', 'السماوة': 'المثنى', 'الكوت': 'واسط', 'الرمادي': 'الأنبار', 'الحلة': 'بابل', 'بعقوبة': 'ديالى', 'تكريت': 'صلاح الدين' };

        // Verified badge (like Instagram's): a scalloped blue rosette with a white check.
        const VERIFIED_SVG = (() => {
            let d = '';
            for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2, r = 10.2 + 1.35 * Math.cos(a * 8); d += (i ? 'L' : 'M') + (12 + Math.cos(a) * r).toFixed(2) + ' ' + (12 + Math.sin(a) * r).toFixed(2); }
            return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + 'Z" fill="#0095F6"/><path d="M7.4 12.4l3.1 3.1 6.1-6.4" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        })();

        const IRAQI_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

        const forumThreads = [];
        const forumAnswers = {};

        // ==================== APP STATE ====================
        const app = {
            currentView: 'homeView',
            previousView: null,
            activeCategory: 'all',
            myStoreInfo: null,
            activeNotifFilter: 'all',
            activeStage: 'sixth-science',
            activeSubject: null,
            resourceFilter: 'newest',
            offlineResourceIds: new Set(),
            offlineResourcesMeta: [],
            currentResourceId: null,
            currentNewsId: null,
            studyTimerDuration: 25 * 60,
            studyTimerRemaining: 25 * 60,
            studyTimerRunning: false,
            studyTimerInterval: null,
            youtubeStudyVideoId: null,
            youtubeStudySessionActive: false,
            youtubeStudyCheckTimer: null,
            youtubeStudyResponseTimer: null,
            youtubeStudyCountdownInterval: null,
            youtubeStudySessionPoints: 0,
            viewHistory: [],
            _skipHistory: false,
            isOnline: navigator.onLine,
            themeMode: 'colored',
            isLoggedIn: false,
            currentUser: null,
            authMode: 'login',
            swiper: null,
            authUid: null,
            userRead: {},
            userBookmarks: {},
            userDeletedNotifs: {},
            calendarMonthOffset: 0,
            notifPrefs: { urgent: true, announcement: true, circular: true, update: true, reminder: true, general: true, weather: true, res: true, tube: true, tg: true, tgnews: true, msg: true, call: true, lec: true, holiday: true, motiv: true },
            currentChatUid: null,
            currentChatOther: null,
            sentFriendRequests: {},
            _notifiedOverdueTaskIds: null,

            // ===== Error reports =====
            // Errors on students' phones go to errors/{day_key}: one entry per distinct error per
            // day with a counter, so the admin panel shows what breaks before anyone complains.
            // A photo that cannot load (offline, a bad link) becomes a round letter instead of a broken image.
            initImageFallback() {
                if (this._imgFb) return;
                this._imgFb = true;
                const colors = ['#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#16A34A'];
                document.addEventListener('error', (e) => {
                    const im = e.target;
                    if (!im || im.tagName !== 'IMG' || im.dataset.fb || !/rounded-full|avatar|fm-av|lb-/.test(im.className + ' ' + (im.id || ''))) return;
                    im.dataset.fb = '1';
                    const name = String(im.alt || '').trim() || '؟';
                    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
                    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="' + colors[h % colors.length] + '"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="Tahoma,Arial,sans-serif" font-size="46" font-weight="700" fill="#fff">' + escapeHtml(Array.from(name)[0]) + '</text></svg>';
                    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
                }, true);
                // every image added later loads only when it is near the screen (saves data on mobile)
                const lazy = (im) => { if (im.tagName === 'IMG' && !im.hasAttribute('loading')) { im.loading = 'lazy'; im.decoding = 'async'; } };
                new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
                    if (n.nodeType !== 1) return;
                    lazy(n); if (n.querySelectorAll) n.querySelectorAll('img').forEach(lazy);
                }))).observe(document.body, { childList: true, subtree: true });
            },
            initErrorReporting() {
                this._errSent = 0;
                window.__errReport = (e) => this._reportError(e);
                (window.__errq || []).splice(0).forEach((e) => this._reportError(e));
            },
            _reportError(e) {
                try {
                    if (!e || !e.msg || this._errSent >= 12) return;
                    const msg = String(e.msg).slice(0, 300);
                    // noise that says nothing about the app: other sites' scripts and dropped connections
                    if (/^Script error\.?$|ResizeObserver loop|Load failed|NetworkError|Failed to fetch|AbortError|The operation was aborted/i.test(msg)) return;
                    if (!window.firebaseDb || !window.firebaseDbHelpers) {
                        (this._errWait = this._errWait || []).push(e);
                        if (!this._errWaitT) this._errWaitT = setTimeout(() => { const q = this._errWait || []; this._errWait = []; this._errWaitT = null; if (window.firebaseDb) q.forEach((x) => this._reportError(x)); }, 8000);
                        return;
                    }
                    const src = String(e.src || '').replace(location.origin, '').replace(/\?v=\w+/, '').slice(0, 120);
                    const d = new Date(), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                    let h = 0;
                    const k = msg + '|' + src + '|' + (e.line || 0);
                    for (let i = 0; i < k.length; i++) h = (Math.imul(h, 31) + k.charCodeAt(i)) | 0;
                    const key = day + '_' + (h >>> 0).toString(36);
                    this._errKeys = this._errKeys || {};
                    if (this._errKeys[key]) return;
                    this._errKeys[key] = 1;
                    this._errSent++;
                    const ua = navigator.userAgent;
                    const dev = (/iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : 'كمبيوتر') + ' · ' + (/SamsungBrowser/.test(ua) ? 'Samsung' : /wv\)|WebView/.test(ua) ? 'تطبيق' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'متصفح آخر');
                    const { ref, runTransaction } = window.firebaseDbHelpers;
                    runTransaction(ref(window.firebaseDb, 'errors/' + key), (cur) => {
                        const c = cur || { msg, src, line: e.line || 0, col: e.col || 0, stack: String(e.stack || '').slice(0, 1200), first: Date.now(), n: 0 };
                        c.n = (Number(c.n) || 0) + 1; c.last = Date.now(); c.view = this.currentView || ''; c.dev = dev; c.ver = window.APP_VER || '';
                        return c;
                    }).catch(() => {});
                } catch (er) { /* reporting must never break the app */ }
            },

            // An old saved index.html can end up next to a newer app.js (the files are cached separately). When the page
            // lacks something this script needs, clear the saved copies and load everything fresh, once.
            _skewCheck() {
                const h = window.firebaseDbHelpers;
                if (!h || (h.orderByKey && h.endBefore)) return;
                try { if (sessionStorage.getItem('isp_skew')) return; sessionStorage.setItem('isp_skew', '1'); } catch (e) { return; }
                const done = () => location.reload();
                Promise.all([
                    navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))) : null,
                    window.caches ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))) : null,
                ].map((p) => (p ? p.catch(() => {}) : p))).then(done, done);
            },

            // If the database hasn't connected 12 seconds after the start although the phone says it is online, a network in
            // between is probably blocking WebSockets: remember that (isp_lp) and restart once talking over plain HTTPS.
            _connWatch() {
                if (!window.firebaseDb || !window.firebaseDbHelpers || this._connWatching) return;
                this._connWatching = true;
                const { ref, onValue } = window.firebaseDbHelpers;
                let ok = false;
                onValue(ref(window.firebaseDb, '.info/connected'), (snap) => { if (snap.val() === true) ok = true; });
                setTimeout(() => {
                    if (ok || !navigator.onLine) return;
                    try {
                        if (localStorage.getItem('isp_lp') === '1' || sessionStorage.getItem('isp_lp_try')) return;
                        localStorage.setItem('isp_lp', '1'); sessionStorage.setItem('isp_lp_try', '1');
                    } catch (e) { return; }
                    location.reload();
                }, 15000);
            },

            // ===== Offline =====
            // The service worker (OneSignalSDKWorker.js: push + saved copy of the app) lets the app
            // open without internet; a thin bar says when there is no connection.
            initOffline() {
                // inside the Android / iPhone app the files are already on the phone, no service worker needed
                if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !this._isNative()) {
                    const reg = () => navigator.serviceWorker.register('OneSignalSDKWorker.js', { scope: './' }).catch(() => {});
                    if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
                    // a newer version was saved in the background (the app itself opened from the saved copy)
                    navigator.serviceWorker.addEventListener('message', (e) => {
                        if (e.data && e.data.type === 'isp-update' && e.data.ver !== window.APP_VER) this._updateReady();
                        // a tap on one of the app's notifications
                        if (e.data && e.data.type === 'isp-open') {
                            if (e.data.tag === 'isp-coach') this.setTab('tutor');
                            else if (/^isp-nut-/.test(e.data.tag)) this.goToFood();
                        }
                    });
                    setTimeout(() => this._warmParts(), 6000);
                }
                const bar = () => document.body.classList.toggle('is-offline', navigator.onLine === false);
                window.addEventListener('online', () => { bar(); this.showToast('رجع النت'); });
                window.addEventListener('offline', bar);
                bar();
            },

            // The pages that load their own file are saved on the phone ahead of time, so the first
            // time one opens it comes from the phone, not the network (skipped on data saver).
            _warmParts() {
                try {
                    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
                    const cn = navigator.connection || {};
                    if (cn.saveData || /(^|-)2g$/.test(cn.effectiveType || '')) return;
                    const parts = ['calls', 'food', 'dhikr', 'weekly', 'tutor', 'cards', 'shop', 'spots', 'vent', 'ventfilter', 'ideas', 'mistakes', 'moodmap', 'uni', 'ytroom', 'garden', 'gardenui', 'dreams'];
                    navigator.serviceWorker.controller.postMessage({ type: 'isp-warm', urls: parts.map((n) => 'js/' + n + '.js?v=' + (window.APP_VER || '1')) });
                } catch (e) { /* only a speed-up */ }
            },

            // A new version is ready: it is used the next time the app opens. If the student is on
            // the home page when they leave the app, it is put in place quietly; otherwise a small
            // bar offers it.
            _updateReady() {
                if (this._updShown) return;
                this._updShown = true;
                const busy = () => !!(this._cl || this._focus || this._forest || this._gwar || this._garden || this._duelOn || this._flightOn);
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden && this.currentView === 'homeView' && !busy()) location.reload();
                });
                setTimeout(() => {
                    if (busy() || document.getElementById('updBar')) return;
                    const b = document.createElement('div');
                    b.id = 'updBar'; b.className = 'upd-bar';
                    b.innerHTML = '<span>صار تحديث جديد للتطبيق</span><button type="button">حدّث هسه</button><button type="button" class="upd-x" aria-label="بعدين">بعدين</button>';
                    b.children[1].onclick = () => location.reload();
                    b.children[2].onclick = () => b.remove();
                    document.body.appendChild(b);
                }, 1500);
            },

            // Like an installed app: opening it again soon after (the phone may have closed it in
            // the background) goes back to the page the student was on.
            _rememberView(viewId) {
                if (!this._restored) return; // start-up pages don't count until the last one is restored
                try {
                    const o = { v: viewId, at: Date.now() };
                    if (viewId === 'chatThreadView' && this.currentChatUid) {
                        const c = this.currentChatOther || {};
                        o.chat = { uid: this.currentChatUid, n: c.name || '', s: c.studentNumber || '' };
                    }
                    localStorage.setItem('isp:lastView', JSON.stringify(o));
                } catch (e) {}
            },
            _restoreView() {
                if (this._restored) return;
                this._restored = true;
                let o = null;
                try { o = JSON.parse(localStorage.getItem('isp:lastView') || 'null'); } catch (e) {}
                if (!o || Date.now() - (o.at || 0) > 30 * 60000 || this.currentView !== 'homeView') return;
                const tabs = { dhikrView: 'dhikr', foodView: 'food', resourcesView: 'resources', holidaysView: 'holidays', leaderboardView: 'leaderboard', storeView: 'store', messagesView: 'messages', profileView: 'profile', moreView: 'more', tutorView: 'tutor' };
                const needsLogin = { messagesView: 1, profileView: 1, chatThreadView: 1, tutorView: 1 };
                if (needsLogin[o.v] && !this.isLoggedIn) return;
                try {
                    if (o.v === 'chatThreadView' && o.chat && o.chat.uid) {
                        // the chat itself opens once the sign-in is back (_restoreChat)
                        this._pendingChatRestore = o.chat;
                        this.setTab('messages');
                    } else if (tabs[o.v]) {
                        this.setTab(tabs[o.v]);
                    }
                } catch (e) { /* stay on the home page */ }
            },
            _restoreChat() {
                const c = this._pendingChatRestore;
                this._pendingChatRestore = null;
                if (!c || this.currentView !== 'messagesView') return;
                try { this.openChat(c.uid, c.n, undefined, c.s); } catch (e) {}
            },

            // Loads a part of the app that only some pages need (js/<name>.js), once.
            _need(name) {
                this._loads = this._loads || {};
                if (!this._loads[name]) {
                    this._loads[name] = new Promise((resolve, reject) => {
                        const sc = document.createElement('script');
                        sc.src = 'js/' + name + '.js?v=' + (window.APP_VER || '1');
                        sc.onload = resolve;
                        sc.onerror = () => { delete this._loads[name]; sc.remove(); reject(new Error('Could not load ' + name)); };
                        document.head.appendChild(sc);
                    });
                }
                return this._loads[name];
            },
            // Opens a page whose engine is in a separate file: show the page, load, then build it.
            _withPart(name, ready, view, go) {
                if (ready()) return false;
                this._need(name).then(() => { if (this.currentView === view) go(); })
                    .catch(() => this.showToast('ما انحملت الصفحة، تأكد من النت وحاول مرة ثانية'));
                return true;
            },

            init() {
                this.initErrorReporting();
                this.initImageFallback();
                setTimeout(() => this.renderInviteBanner(), 0);
                setTimeout(() => { if (!(this.siteConfig && this.siteConfig.features && this.siteConfig.features.mascot === false)) this._need('mascot').catch(() => {}); }, 6000);
                this.initOffline();
                // a shared room link (?yr=...) opens that room once the student is signed in
                try { const m = location.search.match(/[?&]yr=([a-z0-9]{6,20})/i); if (m) this._yrPending = m[1].toLowerCase(); } catch (e) {}
                // a push about a teacher's new video (?tube=<video id>) opens that video
                try { const m = location.search.match(/[?&]tube=([A-Za-z0-9_-]{11})(?:&|$)/); if (m) this._tubePending = m[1]; } catch (e) {}
                try { const m = location.search.match(/[?&]tg=([A-Za-z][A-Za-z0-9_]{3,31})(?:&|$)/); if (m) this._tgPending = m[1]; } catch (e) {}
                try { const m = location.search.match(/[?&]ch=(UC[\w-]{22})(?:&|$)/); if (m) this._tuWant = m[1]; } catch (e) {}
                // a notification about a news, new handouts or the day-off page (?go=news&id=...)
                try { const q = new URLSearchParams(location.search), g = q.get('go'); if (g && /^(news|res|holiday)$/.test(g)) this._goPending = { go: g, id: String(q.get('id') || '') }; } catch (e) {}
                setTimeout(() => { if (!this._pushReady) { this._pushReady = true; this._pushRun(); } }, 6000);   // a visitor who is not signed in
                try { const m = location.search.match(/[?&]rm=([a-z0-9]{4,12})/i); if (m) this._rmPending = m[1].toLowerCase(); } catch (e) {}
                try { const m = location.search.match(/[?&]dl=([a-z0-9]{6})(?![a-z0-9])/i); if (m) this._dlPending = m[1].toLowerCase(); } catch (e) {}
                // an invite link (?ref=<uid>) is remembered until the visitor creates an account
                try { const m = location.search.match(/[?&]ref=([A-Za-z0-9]{20,40})/); if (m && !localStorage.getItem('isp_ref')) localStorage.setItem('isp_ref', JSON.stringify({ c: m[1], t: Date.now() })); } catch (e) {}
                try {
                    const q = new URLSearchParams(location.search).get('coach');
                    if (q) {
                        this._coachPending = q.replace(/[<>]/g, '').trim().slice(0, 300);
                        history.replaceState(null, '', location.pathname);
                    }
                } catch (e) {}
                // Opened from the phone's file manager (content:// or file://) Firebase sign-in,
                // notifications and saved data don't work — the page needs to be served over https.
                if (!/^https?:$/.test(location.protocol)) {
                    setTimeout(() => this.showToast('افتح التطبيق من رابط https وليس كملف من الجهاز — تسجيل الدخول والإشعارات لا تعمل بهذه الطريقة'), 1500);
                }
                this.loadTheme();
                this.loadCustomThemeColor();
                this.loadUserData();
                this._devInit();
                this._banBoot();
                this.checkInterruptedFocus();
                this.checkInterruptedForest();
                this.checkInterruptedGarden();
                this.checkInterruptedGovWar();
                this.loadNotifPrefs();
                this.watchAuthState();
                this._newsBootP = this._newsBoot();
                setTimeout(() => this.listenForReactions(), 600);
                this.hydrateOfflineResources();
                this.loadData();
                window.addEventListener('online', () => {
                    this.isOnline = true;
                    this.checkNetwork();
                    this.showToast('تم استعادة الاتصال بالإنترنت');
                    this.loadData();
                });
                window.addEventListener('offline', () => {
                    this.isOnline = false;
                    this.checkNetwork();
                    this.showToast('انقطع الاتصال بالإنترنت');
                });
                this.renderCategories();
                this.renderNotificationsList();
                this.renderNewsTicker();
                this.renderDailyTip();
                this.listenForTicker();
                this.listenForVoiceNote();
                this.listenForSiteConfig();
                this.listenForAdminNotifications();
                this.listenForSiteImages();
                this.listenForExamSchedule();
                this.listenForHolidays();
                this.listenForDayStatus();
                this.initNativeApp();
                this.initWebPush();
                this.listenForPolls();
                this.listenForVerified();
                this.listenForMods();
                this._clockSync();
                this.initGolden();
                setTimeout(() => this.pingDevice(), 3000);
                this.initInstallBar();
                setTimeout(() => { if ('Notification' in window && Notification.permission === 'granted') this.initPushNotifications(); this.syncNativePush(); }, 4000);
                setTimeout(() => this._skewCheck(), 6000);
                setTimeout(() => this._connWatch(), 3000);
                this.setupPullToRefresh();
                lucide.createIcons();
                this._restoreView();
                this._nutStart();
                this._dateStripStart();
                setInterval(() => this.checkNetwork(), 5000);
                setInterval(() => { if (this.currentView === 'homeView') this.renderExamCountdown(); }, 1000);
                setInterval(() => this.checkTaskReminders(), 120000);
                setInterval(() => this._newsPendTick(), 20000);
                setInterval(() => this._flChipTick(), 1000);
                setInterval(() => {
                    this.refreshTimeAgoLabels();
                    // the card switches from "today" to "tomorrow" at noon
                    const t = this.localDateStr(this._dsTarget());
                    if (t !== this._dsLastTarget) { this._dsLastTarget = t; this.updateHolidayNavDot(); this.renderDayStatus(); }
                }, 30000);
            },

            // ==================== THEME / APPEARANCE (3 modes) ====================
            // FIX/FEATURE: "الوضع الليلي" was a plain on/off dark toggle. It's now a 3-way
            // appearance picker — 'colored' (the original light theme, unchanged), 'black'
            // (a true near-black dark theme — reuses the .dark class so Tailwind's dark:
            // utilities still apply), and 'pink' (a new soft light-pink theme). Old
            // localStorage values ('dark'/'light') are migrated on load.
            loadTheme() {
                let saved = localStorage.getItem('iraqiStudentTheme');
                if (saved === 'dark') saved = 'blue';
                else if (saved === 'light' || !saved) saved = 'colored';
                this.themeMode = saved;
                this.applyThemeMode(saved, false);
                this.updateThemeIcon();
            },

            setThemeMode(mode) {
                if (!APP_THEMES[mode]) return;
                this.themeMode = mode;
                this.applyThemeMode(mode, true);
                this.updateThemeIcon();
                lucide.createIcons();
            },

            applyThemeMode(mode, persist) {
                if (!APP_THEMES[mode]) mode = 'colored';
                const cl = document.documentElement.classList;
                cl.remove('dark');
                Object.keys(APP_THEMES).forEach((k) => APP_THEMES[k].cls.forEach((c) => cl.remove(c)));
                if (APP_THEMES[mode].dark) cl.add('dark');
                APP_THEMES[mode].cls.forEach((c) => cl.add(c));
                if (persist) {
                    try { localStorage.setItem('iraqiStudentTheme', mode); } catch (e) {}
                }
                // the page's own colour, also kept by the Android code so the next start has no white flash before the page draws
                try {
                    const bg = APP_THEMES[mode].bg;
                    document.documentElement.style.backgroundColor = bg;
                    if (window.IspNative && window.IspNative.bg) window.IspNative.bg(bg);
                } catch (e) {}
                setTimeout(() => this._nativeBars(), 30);
            },
            // Android app: the bar icons are dark on a light page and light on a dark one
            _nativeBars() {
                try {
                    if (!this._isNative()) return;
                    const lum = document.documentElement.classList.contains('dark') ? 0 : 255;
                    if (window.IspNative) window.IspNative.bars(lum > 140);
                    else if (window.Capacitor.Plugins.StatusBar) window.Capacitor.Plugins.StatusBar.setStyle({ style: lum > 140 ? 'LIGHT' : 'DARK' });
                } catch (e) {}
            },

            // Kept as a thin alias: some flows still call the old name.
            toggleDarkMode() {
                const order = ['colored', 'blue', 'black', 'pink'];
                const next = order[(order.indexOf(this.themeMode) + 1) % order.length];
                this.setThemeMode(next);
            },

            loadCustomThemeColor() {
                try {
                    const saved = localStorage.getItem('iraqiStudentThemeColor');
                    if (saved) {
                        this.customThemeColor = saved;
                        applyCustomThemeColor(saved);
                    }
                } catch (e) {}
            },

            saveCustomThemeColor(hex) {
                if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
                this.customThemeColor = hex;
                try { localStorage.setItem('iraqiStudentThemeColor', hex); } catch (e) {}
                applyCustomThemeColor(hex);
                this.showToast('تم تغيير لون التطبيق');
            },

            resetCustomThemeColor() {
                this.customThemeColor = null;
                try { localStorage.removeItem('iraqiStudentThemeColor'); } catch (e) {}
                const styleEl = document.getElementById('customThemeStyle');
                if (styleEl) styleEl.textContent = '';
                document.documentElement.style.removeProperty('--p');
                const input = document.getElementById('customThemeColorInput');
                if (input) input.value = '#0D7C6E';
                this.showToast('تم استعادة اللون الافتراضي');
            },

            updateThemeIcon() {
                document.querySelectorAll('[data-theme-swatch]').forEach((btn) => {
                    btn.classList.toggle('theme-swatch-active', btn.dataset.themeSwatch === this.themeMode);
                });
            },

            // ==================== USER / AUTH ====================
            loadUserData() {
                const saved = localStorage.getItem('iraqiStudentUser');
                if (saved) {
                    try {
                        this.currentUser = JSON.parse(saved);
                        this.isLoggedIn = true;
                    } catch (e) {
                        this.isLoggedIn = false;
                        this.currentUser = null;
                    }
                }
            },

            saveUserData() {
                if (this.currentUser) {
                    try {
                        localStorage.setItem('iraqiStudentUser', JSON.stringify(this.currentUser));
                    } catch (e) {
                        console.warn('Save user data failed (localStorage quota?):', e);
                    }
                }
            },

            // FIX: every listenForX() below guards itself with `if (this._xListener) return;`
            // so it only ever attaches once. Those flags used to survive logout, so logging
            // in as a *different* account in the same tab left friends/requests/chats/wallet/
            // presence/duels/store all silently stuck on the previous account's data (the
            // guard saw a truthy leftover value and refused to re-subscribe). Resetting every
            // per-user listener flag here lets each one re-arm cleanly for the new account.
            // FIX: the flags were only set to null — the old account's onValue listeners
            // stayed attached and kept overwriting friendsList / chats / wallet with the
            // previous account's data whenever it changed. They're unsubscribed now.
            resetUserScopedListeners() {
                if (this._cl && this._clEnd) this._clEnd('end');
                ['_tasksListener', '_walletTxListener', '_friendsListener', '_friendRequestsListener',
                    '_sentFriendRequestsListener', '_blockedUsersListener', '_presenceListener',
                    '_userChatsListener', 
                    '_myStoreListener', '_myStoreProductsListener', '_ownUserListener', '_banUnsub',
                    '_incomingListener', '_yrInvListener', '_twinOfListener', '_twinPairListener', '_twinPairId', '_twinData', '_twinSearching', '_gwMine', '_gwClaimed', '_gwWeek', '_clRingOff'].forEach((key) => {
                    if (typeof this[key] === 'function') {
                        try { this[key](); } catch (e) { /* already detached */ }
                    }
                    this[key] = null;
                });
                setTimeout(() => { if (this.listenForReactions) this.listenForReactions(); }, 0);
            },

            // Keeps balance/points in sync with the database (incoming transfers, other
            // tabs) and keeps the record in Firebase's local cache so transactions on it
            // start from the real value.
            listenForOwnUserRecord() {
                if (!window.firebaseDb || !this.authUid || this._ownUserListener) return;
                this._twinAttach();
                this._listenPtsRate();
                this.listenForIncoming();
                const { ref, onValue } = window.firebaseDbHelpers;
                this._ownUserListener = onValue(ref(window.firebaseDb, 'users/' + this.authUid), (snap) => {
                    if (!snap.exists() || !this.currentUser) return;
                    const v = snap.val();
                    if (typeof v.balance === 'number') this.currentUser.balance = v.balance;
                    if (typeof v.points === 'number') this.currentUser.points = v.points;
                    // the profile fields the admin panel can edit (name, phone, governorate, branch, student number): taken from the server, so this phone
                    // does not write its old copy back at the next sync
                    let edited = false;
                    ['fullName', 'governorate', 'phone', 'grade', 'studentNumber'].forEach((k) => { if (typeof v[k] === 'string' && (v[k] !== '' || k === 'phone' || k === 'governorate') && v[k] !== (this.currentUser[k] || '')) { this.currentUser[k] = v[k]; edited = true; } });
                    this._adoptServerGradesMoods(v);
                    this.saveUserData();
                    if (edited) { try { this.updateProfileView(); } catch (e) {} }
                    if (this.currentView === 'walletView') { this.renderWalletBalance(); this.renderWalletPoints(); }
                    if (this.currentView === 'pointsStoreView') this.renderPointsStore();
                });
            },

            watchAuthState() {
                if (!window.firebaseAuth || !window.firebaseAuthHelpers) return;
                const { onAuthStateChanged } = window.firebaseAuthHelpers;
                onAuthStateChanged(window.firebaseAuth, (user) => {
                    this._nativeAuth(user);
                    if (user) {
                        this.authUid = user.uid;
                        // FIX: Firebase fires this observer *before* the promise returned by
                        // signInWithEmailAndPassword/createUserWithEmailAndPassword resolves.
                        // Both paths used to load the profile: on registration the observer
                        // could write an empty profile (no name) and a second student number,
                        // and every per-user listener got attached twice. handleLogin/
                        // handleRegister now own that flow while it's in progress.
                        if (this._authFlowInProgress) return;
                        if (this._stateLoadedFor !== user.uid) {
                            this._stateLoadedFor = user.uid;
                            this.resetUserScopedListeners();
                            this.loadUserFromDatabase(user.uid);
                        }
                    } else {
                        this.authUid = null;
                        this._stateLoadedFor = null;
                        // the ban watch belongs to the account that just signed out
                        this._guardOk = null;
                        if (this._banLive) { try { this._banLive(); } catch (e) {} this._banLive = null; }
                        this.resetUserScopedListeners();
                        userTasks.length = 0;
                        if (this.isLoggedIn) {
                            this.isLoggedIn = false;
                            this.currentUser = null;
                            this.userRead = {};
                            this.userBookmarks = {};
                            this.userDeletedNotifs = {};
                            localStorage.removeItem('iraqiStudentUser');
                            if (this.currentView !== 'authView') this.goToAuth('register');
                        }
                    }
                });
            },

            currentUid() {
                if (window.firebaseAuth && window.firebaseAuth.currentUser) return window.firebaseAuth.currentUser.uid;
                return String((this.currentUser && (this.currentUser.email || this.currentUser.phone)) || 'anonymous').replace(/[.#$\[\]]/g, '_');
            },

            async generateUniqueStudentNumber() {
                for (let i = 0; i < 10; i++) {
                    const num = String(Math.floor(10000 + Math.random() * 90000));
                    if (!window.firebaseDb) return num;
                    try {
                        const { ref, get } = window.firebaseDbHelpers;
                        const snap = await get(ref(window.firebaseDb, 'numIndex/' + num));
                        if (!snap.exists()) return num;
                    } catch (e) {
                        return num;
                    }
                }
                return String(Date.now()).slice(-5);
            },

            goToAuth(mode) {
                this.authMode = mode || 'login';
                this.setAuthMode(this.authMode);
                this.switchView('authView');
            },

            // FIX (UI/UX): the avatar picker used to show above the form regardless of mode
            // — a camera icon and "اضغط لإضافة صورة" sitting over the LOGIN form makes no
            // sense (you don't set an avatar to log into an existing account) and was
            // confusing about what the screen was even asking for. It's now shown only in
            // register mode.
            setAuthMode(mode) {
                this.authMode = mode;
                const loginTab = document.getElementById('authTabLogin');
                const registerTab = document.getElementById('authTabRegister');
                const loginForm = document.getElementById('loginForm');
                const registerForm = document.getElementById('registerForm');
                const avatarSection = document.getElementById('authAvatarSection');

                if (!loginTab || !registerTab || !loginForm || !registerForm) return;
                if (avatarSection) avatarSection.classList.toggle('hidden', mode !== 'register');

                if (mode === 'login') {
                    loginTab.classList.add('bg-primary', 'text-white');
                    loginTab.classList.remove('theme-transition');
                    loginTab.style.color = '';
                    loginTab.style.backgroundColor = '';

                    registerTab.classList.remove('bg-primary', 'text-white');
                    registerTab.classList.add('theme-transition');
                    registerTab.style.backgroundColor = 'transparent';
                    registerTab.style.color = 'var(--text2)';

                    loginForm.classList.remove('hidden');
                    registerForm.classList.add('hidden');
                } else {
                    registerTab.classList.add('bg-primary', 'text-white');
                    registerTab.classList.remove('theme-transition');
                    registerTab.style.color = '';
                    registerTab.style.backgroundColor = '';

                    loginTab.classList.remove('bg-primary', 'text-white');
                    loginTab.classList.add('theme-transition');
                    loginTab.style.backgroundColor = 'transparent';
                    loginTab.style.color = 'var(--text2)';

                    registerForm.classList.toggle('hidden', !this._emailSignupOn());
                    loginForm.classList.add('hidden');
                }
                // on the long register form the Google button comes first, on the login form it sits under the fields
                const gw = document.getElementById('googleAuth');
                if (gw) { if (mode === 'register') registerForm.before(gw); else loginForm.after(gw); gw.classList.toggle('top', mode === 'register'); }
                document.getElementById('regGoogleOnly')?.classList.toggle('hidden', !(mode === 'register' && !this._emailSignupOn()));
            },

            handleAvatarUpload(event) {
                const file = event.target.files?.[0];
                if (file) {
                    if (file.size > 2 * 1024 * 1024) {
                        this.showToast('حجم الصورة يجب ألا يتجاوز 2MB');
                        return;
                    }
                    // a smaller picture (480 px) so the record and everything copied from it stays light
                    compressForumImage(file, 480, 0.82).then((dataUrl) => {
                        if (!dataUrl) { this.showToast('تعذر قراءة الصورة'); return; }
                        const preview = document.getElementById('authAvatarPreview');
                        if (preview) preview.src = dataUrl;
                        this.tempAvatar = dataUrl;
                    });
                }
            },

            togglePasswordVisibility(btn) {
                if (!btn || !btn.parentElement) return;
                const input = btn.parentElement.querySelector('input');
                if (!input) return;
                if (input.type === 'password') {
                    input.type = 'text';
                    btn.innerHTML = '<i data-lucide="eye-off" class="w-5 h-5"></i>';
                } else {
                    input.type = 'password';
                    btn.innerHTML = '<i data-lucide="eye" class="w-5 h-5"></i>';
                }
                lucide.createIcons();
            },

            // FIX: the login field placeholder promises "رقم الهاتف أو الإيميل" (phone OR
            // email), but this used to hard-reject any identifier without '@' — phone-number
            // login never actually worked. Firebase Auth here is email/password only, so a
            // phone identifier is now resolved to its registered email by looking up the
            // `users` node for a matching `phone` field first, then signing in with that email.
            // what happens after a successful sign-in (password or Google): the account checks, then the profile loads
            async _completeLogin(user, loginEmail, displayName) {
                this.authUid = user.uid;
                if (!(await this._accountGuard(user.uid))) return false;
                this._stateLoadedFor = user.uid;
                this.resetUserScopedListeners();
                this.currentUser = {
                    fullName: displayName || loginEmail,
                    governorate: '',
                    phone: '',
                    email: loginEmail,
                    avatar: this.tempAvatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(loginEmail) + '&background=2563EB&color=fff&size=200',
                    school: 'طالب',
                    location: '',
                    grade: 'scientific',
                    points: 0,
                    weeklyChange: 0,
                    balance: 0,
                    studentNumber: ''
                };
                this.isLoggedIn = true;
                this.saveUserData();
                this.loadUserFromDatabase(user.uid);
                this.showToast('تم تسجيل الدخول بنجاح');
                this.goToProfile();
                return true;
            },


            // creates the student's record after a new sign-in account was made (email + password, or Google)
            async _completeRegistration(user, { fullName, governorate, phone, email }) {
                this.authUid = user.uid;
                if (!(await this._accountGuard(user.uid))) return false;
                this._stateLoadedFor = user.uid;
                this.resetUserScopedListeners();
                this.currentUser = {
                    fullName: fullName,
                    governorate: governorate,
                    phone: phone || '',
                    email: email || '',
                    avatar: this.tempAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=2563EB&color=fff&size=200`,
                    school: 'طالب في المرحلة الإعدادية',
                    location: governorate,
                    grade: 'scientific',
                    points: 0,
                    weeklyChange: 0,
                    balance: 0,
                    studentNumber: await this.generateUniqueStudentNumber()
                };
                this.isLoggedIn = true;
                this.saveUserData();
                const savedToDb = await this.syncUserToDatabase({ includeCounters: true });
                this._refRegister(user.uid);
                this.initPushNotifications();
                this.syncNativePush();
                if (savedToDb) {
                    this.showToast('تم إنشاء الحساب بنجاح');
                } else {
                    this.showToast('تم إنشاء الحساب، لكن تعذر حفظ بياناتك في قاعدة البيانات — تحقق من صلاحيات (Rules) قاعدة بيانات Firebase');
                }
                this.listenForOwnUserRecord(); this.listenForMods(); this._npPull();
                this.checkDailyStreak();
                this._ttNudgeSoon();
                this._smPing();
                this._clRingListen();
                this.listenForUserTasks();
                this.listenForUserChats();
                this.listenForReactions();
                this.listenForFriends();
                this.listenForYtInvites(); this.listenForRmInvites(); this.listenForDuelInv();
                this.listenForFriendRequests();
                this.listenForSentFriendRequests();
                this.listenForBlockedUsers();
                this.setupPresence();
                this.listenForPresence();
                this.goToProfile();
                return true;
            },

            // ===== Sign in with Google (a real Gmail address, so nobody can make accounts with made-up emails) =====
            // On the website it is Firebase's Google pop-up. Inside the phone app Google refuses to open in the web view,
            // so the Android code (MainActivity: IspNative.googleSignIn) asks the phone's own Google account picker for an ID
            // token and Firebase signs in with it. That needs the Web client ID, which the admin panel keeps in siteConfig/google.
            _emailSignupOn() { const f = this.siteConfig && this.siteConfig.features; return !(f && f.emailSignup === false); },
            _googleClientId() { const g = this.siteConfig && this.siteConfig.google; return String((g && g.webClientId) || window.GOOGLE_WEB_CLIENT_ID || '').trim(); },
            _googleViaOnly(user) { const p = (user && user.providerData) || []; return p.some((x) => x.providerId === 'google.com') && !p.some((x) => x.providerId === 'password'); },
            // the iPhone app added from Safari ("Add to Home Screen"): Google's pop-up cannot open there (the page just hangs)
            _iosStandalone() { try { return navigator.standalone === true || (/iPhone|iPad|iPod/.test(navigator.userAgent) && window.matchMedia('(display-mode: standalone)').matches); } catch (e) { return false; } },
            async _googleCredential(reauthUser) {
                const h = window.firebaseAuthHelpers, auth = window.firebaseAuth;
                if (this._isNative()) {
                    if (!window.IspNative || !window.IspNative.googleSignIn) throw { code: 'isp/native-old' };
                    const cid = this._googleClientId();
                    if (!cid) throw { code: 'isp/no-client-id' };
                    const idToken = await new Promise((res, rej) => {
                        window.__ispGoogle = (ok, v) => (ok ? res(v) : rej({ code: 'isp/native', message: String(v || '') }));
                        window.IspNative.googleSignIn(cid);
                    });
                    const cred = h.GoogleAuthProvider.credential(idToken);
                    return reauthUser ? h.reauthenticateWithCredential(reauthUser, cred) : h.signInWithCredential(auth, cred);
                }
                if (this._iosStandalone()) throw { code: 'isp/ios-standalone' };
                const provider = new h.GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                const run = reauthUser ? h.reauthenticateWithPopup(reauthUser, provider, h.browserPopupRedirectResolver) : h.signInWithPopup(auth, provider, h.browserPopupRedirectResolver);
                // a pop-up that never answers must not leave the page waiting for ever
                return Promise.race([run, new Promise((_, rej) => setTimeout(() => rej({ code: 'isp/popup-timeout' }), 120000))]);
            },
            _googleBtns(busy) {
                document.querySelectorAll('.g-btn').forEach((b) => { b.disabled = !!busy; b.classList.toggle('busy', !!busy); });
            },
            _googleErr(error) {
                const code = (error && error.code) || '', msg = String((error && error.message) || '');
                if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') return;
                if (code === 'auth/popup-blocked') this.showToast('المتصفح منع نافذة Google، اسمح بالنوافذ المنبثقة وحاول مرة ثانية');
                else if (code === 'auth/operation-not-allowed') this.showToast('الدخول بحساب Google ما انفعّل بعد من إعدادات Firebase');
                else if (code === 'auth/unauthorized-domain') this.showToast('هذا الموقع غير مضاف لقائمة المواقع المسموحة بـ Firebase (Authorized domains)');
                else if (code === 'auth/network-request-failed') this.showToast('تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت');
                else if (code === 'auth/account-exists-with-different-credential') this.showToast('هذا الإيميل مسجل بطريقة ثانية، سجّل دخول بكلمة المرور أول');
                else if (code === 'isp/no-client-id') this.showToast('الدخول بـ Google على التطبيق ما انفعّل بعد (ينقص Client ID من لوحة الإدارة)');
                else if (code === 'isp/ios-standalone') this.showToast('الدخول بـ Google ما يشتغل بتطبيق الآيفون المثبّت. سجّل بالبريد وكلمة المرور (الحقول تحت)');
                else if (code === 'isp/popup-timeout') this.showToast('نافذة Google ما ردّت. سجّل بالبريد وكلمة المرور، أو حاول مرة ثانية');
                else if (code === 'isp/native-old') this.showToast('حدّث التطبيق لآخر نسخة حتى يشتغل الدخول بـ Google');
                else if (code === 'isp/native') this.showToast('Google: ' + msg.replace(/androidx\.credentials\.|android\.credentials\./g, '').slice(0, 140));
                else this.showToast('تعذر الدخول بحساب Google (' + (code || msg.slice(0, 60) || 'خطأ') + ')');
            },
            async googleSignIn() {
                if (this._googleBusy) return;
                if (!window.firebaseAuth || !window.firebaseAuthHelpers || !window.firebaseAuthHelpers.GoogleAuthProvider) { this.showToast('لا يوجد اتصال بخدمة المصادقة'); return; }
                this._googleBusy = true; this._authFlowInProgress = true; this._googleBtns(true);
                let handedOver = false;
                try {
                    const cred = await this._googleCredential();
                    const user = cred.user;
                    const { ref, get } = window.firebaseDbHelpers;
                    let known = false;
                    try { known = (await get(ref(window.firebaseDb, 'users/' + user.uid))).exists(); }
                    catch (e) { await this._signOutHere(); this.showToast('تعذر قراءة الحساب (' + ((e && e.code) || 'خطأ') + ')'); return; }
                    if (known) { await this._completeLogin(user, user.email || '', user.displayName || ''); return; }
                    if (!(await this._deviceFreeForNewAccount())) {
                        await this._signOutHere();
                        if (!document.getElementById('banWall')) this._wall('lock', 'هذا الجهاز عليه حساب مسجّل', 'كل جهاز يفتح حساب واحد بس. سجّل دخول بحسابك القديم (بالإيميل وكلمة المرور)، أو تواصل مع الإدارة إذا تريد تغيّر الحساب.', 'تمام');
                        return;
                    }
                    handedOver = true;
                    this._googleProfileSheet(user);
                } catch (error) {
                    console.warn('Google sign-in failed:', error);
                    this._googleErr(error);
                } finally {
                    this._googleBusy = false; this._googleBtns(false);
                    if (!handedOver) this._authFlowInProgress = false;
                }
            },
            // a brand new Google account: the student's name and governorate, then the same record as any new account
            _googleProfileSheet(user) {
                document.getElementById('gpSheet')?.remove();
                const first = document.querySelector('#registerForm select[name="governorate"]');
                const opts = first ? first.innerHTML.replace(/ selected/g, '') : '';
                const el = document.createElement('div');
                el.id = 'gpSheet'; el.className = 'gp-w'; el._user = user;
                el.innerHTML = `<div class="gp-bd"></div><div class="gp-card" role="dialog" aria-modal="true">
                    <div class="gp-top"><span class="gp-g"><svg viewBox="0 0 48 48" width="22" height="22"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.1z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg></span>
                        <div><b>أهلاً، أكمل بياناتك</b><small dir="ltr">${escapeHtml(user.email || '')}</small></div></div>
                    <label>الاسم الثلاثي<input id="gpName" type="text" maxlength="60" value="${escapeHtml(user.displayName || '')}" placeholder="مثال: أحمد محمد علي"></label>
                    <label>المحافظة<select id="gpGov"><option value="" selected disabled>اختر المحافظة</option>${opts.replace(/<option value="" disabled>[^<]*<\/option>/, '')}</select></label>
                    <label>رقم الهاتف (اختياري)<input id="gpPhone" type="tel" dir="ltr" placeholder="0770 123 4567"></label>
                    <button class="gp-go" id="gpGo" onclick="app.googleProfileSubmit()">إنشاء الحساب</button>
                    <button class="gp-no" onclick="app.googleProfileCancel()">إلغاء</button></div>`;
                document.body.appendChild(el);
                requestAnimationFrame(() => el.classList.add('on'));
            },
            async googleProfileSubmit() {
                const el = document.getElementById('gpSheet'); if (!el || el._busy) return;
                const user = el._user;
                const fullName = filterBadWords(String((document.getElementById('gpName') || {}).value || '').trim()).clean;
                const governorate = (document.getElementById('gpGov') || {}).value || '';
                const phone = String((document.getElementById('gpPhone') || {}).value || '').trim();
                if (!fullName) { this.showToast('أدخل اسمك الثلاثي'); return; }
                if (!governorate) { this.showToast('اختر محافظتك'); return; }
                el._busy = true;
                const btn = document.getElementById('gpGo'); if (btn) { btn.disabled = true; btn.textContent = 'جاري الإنشاء...'; }
                try {
                    await this._completeRegistration(user, { fullName, governorate, phone, email: user.email || '' });
                    el.remove();
                } catch (e) {
                    console.warn('Google registration failed:', e);
                    el._busy = false; if (btn) { btn.disabled = false; btn.textContent = 'إنشاء الحساب'; }
                    this.showToast('تعذر إنشاء الحساب، حاول مرة ثانية');
                    return;
                } finally { this._authFlowInProgress = false; }
            },
            async googleProfileCancel() {
                document.getElementById('gpSheet')?.remove();
                this._authFlowInProgress = false;
                await this._signOutHere();
            },

            async handleLogin(event) {
                event.preventDefault();
                const formData = new FormData(event.target);
                const identifier = (formData.get('loginIdentifier') || '').trim();
                const password = formData.get('loginPassword') || '';

                if (!window.firebaseAuth) {
                    this.showToast('لا يوجد اتصال بخدمة المصادقة');
                    return;
                }

                let loginEmail = identifier;
                if (!identifier.includes('@')) {
                    if (!window.firebaseDb) {
                        this.showToast('يرجى استخدام البريد الإلكتروني لتسجيل الدخول');
                        return;
                    }
                    try {
                        const pk = this._phoneKey(identifier);
                        const foundEmail = pk ? await this._phoneToEmail(pk) : null;
                        if (!foundEmail) {
                            this.showToast('لا يوجد حساب مرتبط برقم الهاتف هذا، جرّب البريد الإلكتروني');
                            return;
                        }
                        loginEmail = foundEmail;
                    } catch (err) {
                        console.warn('Phone lookup failed:', err);
                        this.showToast('تعذر البحث عن الحساب برقم الهاتف، جرّب البريد الإلكتروني');
                        return;
                    }
                }

                this._authFlowInProgress = true;
                try {
                    const { signInWithEmailAndPassword } = window.firebaseAuthHelpers;
                    const credential = await signInWithEmailAndPassword(window.firebaseAuth, loginEmail, password);
                    await this._completeLogin(credential.user, loginEmail);
                } catch (error) {
                    console.warn('Login failed:', error);
                    const code = error && error.code;
                    if (code === 'auth/invalid-email') {
                        this.showToast('صيغة البريد الإلكتروني غير صحيحة');
                    } else if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
                        this.showToast('البريد أو كلمة المرور غير صحيحة');
                    } else if (code === 'auth/configuration-not-found') {
                        this.showToast('خدمة تسجيل الدخول غير مُفعّلة على الخادم حالياً، تواصل مع الدعم');
                    } else if (code === 'auth/network-request-failed') {
                        this.showToast('تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت');
                    } else if (code === 'auth/too-many-requests') {
                        this.showToast('محاولات كثيرة جداً، يرجى المحاولة لاحقاً');
                    } else {
                        this.showToast('تعذر تسجيل الدخول، يرجى المحاولة مرة أخرى');
                    }
                } finally {
                    this._authFlowInProgress = false;
                }
            },

            async handleRegister(event) {
                event.preventDefault();
                const formData = new FormData(event.target);
                const fullName = filterBadWords(String(formData.get('fullName') || '').trim()).clean;
                const governorate = formData.get('governorate');
                const phone = String(formData.get('phone') || '').trim();
                if (!this._emailSignupOn()) { this.showToast('التسجيل بالبريد متوقف حالياً، استخدم حساب Google'); return; }
                const email = String(formData.get('email') || '').trim();
                const password = formData.get('password');
                const confirmPassword = formData.get('confirmPassword');

                if (!fullName) {
                    this.showToast('أدخل اسمك الثلاثي');
                    return;
                }
                if (password !== confirmPassword) {
                    this.showToast('كلمتا المرور غير متطابقتين');
                    return;
                }
                if (!password || password.length < 6) {
                    this.showToast('كلمة المرور يجب ألا تقل عن 6 أحرف');
                    return;
                }
                if (!email) {
                    this.showToast('البريد الإلكتروني مطلوب لإنشاء الحساب');
                    return;
                }
                if (!window.firebaseAuth) {
                    this.showToast('لا يوجد اتصال بخدمة المصادقة');
                    return;
                }
                if (!(await this._deviceFreeForNewAccount())) return;
                this._authFlowInProgress = true;
                try {
                    const { createUserWithEmailAndPassword } = window.firebaseAuthHelpers;
                    const credential = await createUserWithEmailAndPassword(window.firebaseAuth, email, password);
                    await this._completeRegistration(credential.user, { fullName, governorate, phone, email });
                } catch (error) {
                    console.warn('Register failed:', error);
                    const code = error && error.code;
                    if (code === 'auth/email-already-in-use') {
                        this.showToast('هذا البريد الإلكتروني مستخدم بالفعل، جرّب تسجيل الدخول');
                    } else if (code === 'auth/invalid-email') {
                        this.showToast('صيغة البريد الإلكتروني غير صحيحة');
                    } else if (code === 'auth/weak-password') {
                        this.showToast('كلمة المرور ضعيفة، يجب ألا تقل عن 6 أحرف');
                    } else if (code === 'auth/operation-not-allowed') {
                        this.showToast('تسجيل الدخول بالبريد وكلمة المرور غير مُفعّل في إعدادات Firebase (Authentication → Sign-in method)');
                    } else if (code === 'auth/configuration-not-found') {
                        this.showToast('خطأ auth/configuration-not-found: تأكد أنك فعّلت Email/Password وضغطت Save في نفس مشروع Firebase المستخدم بالكود');
                    } else if (code === 'auth/network-request-failed') {
                        this.showToast('تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت');
                    } else if (code === 'auth/too-many-requests') {
                        this.showToast('محاولات كثيرة جداً، يرجى المحاولة لاحقاً');
                    } else {
                        this.showToast('تعذر إنشاء الحساب (' + (code || 'خطأ غير معروف') + ')، يرجى المحاولة مرة أخرى');
                    }
                } finally {
                    this._authFlowInProgress = false;
                }
            },

            // ===== Delete my account (required by the app stores, and the student's right) =====
            // The password is asked again (Firebase needs a recent sign-in to delete an account), then
            // everything kept under the student's account is removed, the phone is freed for a new
            // account, and the sign-in account itself is deleted. Messages already sent stay with the
            // person they were sent to, like any messaging app (see privacy.html).
            openDeleteAccount() {
                if (!this.isLoggedIn || !this.authUid) { this.goToAuth('login'); return; }
                document.getElementById('fdSheet')?.remove();
                const el = document.createElement('div');
                el.id = 'fdSheet'; el.className = 'fd-sheet';
                el.innerHTML = `<div class="fd-back" onclick="app.closeDeleteAccount()"></div><div class="fd-card">
                    <div class="fd-grab"></div>
                    <div class="fd-sh"><span class="fd-mi" style="background:linear-gradient(135deg,#EF4444,#B91C1C)"><i data-lucide="user-x"></i></span><div><b>حذف حسابي نهائياً</b><small>ما يرجع بعد ما ينحذف</small></div></div>
                    <div class="fd-note" style="background:rgba(239,68,68,.08)"><i data-lucide="triangle-alert" style="color:#DC2626"></i><p>راح تنحذف معلوماتك ونقاطك ورصيدك ودرجاتك ومهامك وأصدقاؤك ومحادثاتك من قائمتك. الرسائل اللي دزيتها لغيرك تبقى عنده مثل أي تطبيق مراسلة.</p></div>
                    <label class="fd-times" style="grid-template-columns:1fr"><label><span>اكتب كلمة السر للتأكيد</span><input type="password" id="delPass" autocomplete="current-password" placeholder="كلمة السر"></label></label>
                    <button class="fd-main" id="delGo" style="background:linear-gradient(135deg,#EF4444,#B91C1C);box-shadow:0 10px 24px rgba(220,38,38,.3)" onclick="app.deleteAccount()"><i data-lucide="trash-2"></i>احذف حسابي</button>
                    <button class="fd-perm" style="background:var(--input-bg);color:var(--text2)" onclick="app.closeDeleteAccount()">لا، رجعني</button>
                </div>`;
                document.body.appendChild(el);
                requestAnimationFrame(() => el.classList.add('on'));
                lucide.createIcons();
            },
            closeDeleteAccount() {
                const el = document.getElementById('fdSheet');
                if (!el) return;
                el.classList.remove('on');
                setTimeout(() => el.remove(), 280);
            },
            async deleteAccount() {
                const pass = (document.getElementById('delPass') || {}).value || '';
                const btn = document.getElementById('delGo');
                const fa = window.firebaseAuth, h = window.firebaseAuthHelpers;
                const user = fa && fa.currentUser;
                if (!user || !h || !h.deleteUser) { this.showToast('سجّل دخول أول'); return; }
                const viaG = this._googleViaOnly(user);
                if (!pass && !viaG) { this.showToast('اكتب كلمة السر'); return; }
                if (btn) { btn.disabled = true; btn.innerHTML = '<span class="tt-typing"><i></i><i></i><i></i></span> جاي ينحذف'; }
                const fail = (msg) => { this.showToast(msg); if (btn) { btn.disabled = false; btn.innerHTML = 'احذف حسابي'; } };
                try {
                    if (viaG) await this._googleCredential(user);
                    else await h.reauthenticateWithCredential(user, h.EmailAuthProvider.credential(user.email, pass));
                } catch (e) {
                    const c = e && e.code;
                    fail(c === 'auth/wrong-password' || c === 'auth/invalid-credential' ? 'كلمة السر غلط' : c === 'auth/too-many-requests' ? 'محاولات كثيرة، جرب بعد شوية' : 'ما كدرت أتأكد منك، تأكد من النت');
                    return;
                }
                const uid = user.uid, db = window.firebaseDb;
                if (db) {
                    const { ref, get, set } = window.firebaseDbHelpers;
                    const del = (p) => set(ref(db, p), null).catch(() => {});
                    // friends and inbox entries that point at this account, on the other side
                    try {
                        const [fr, ch] = await Promise.all([get(ref(db, 'friends/' + uid)), get(ref(db, 'userChats/' + uid))]);
                        await Promise.all([
                            ...Object.keys(fr.val() || {}).map((o) => del('friends/' + o + '/' + uid)),
                            ...Object.keys(ch.val() || {}).map((o) => del('userChats/' + o + '/' + uid)),
                        ]);
                    } catch (e) {}
                    const u = this.currentUser || {};
                    const pk = this._phoneKey ? this._phoneKey(u.phone || '') : '';
                    const paths = ['pub/', 'leaderboard/', 'presence/', 'studyRoom/', 'focusLive/', 'studentMap/', 'userNewsState/', 'userTasks/', 'userActivity/', 'tokens/',
                        'walletTransactions/', 'chatClearedAt/', 'userCards/', 'blockedUsers/', 'friends/', 'userChats/', 'ideaMine/', 'shopMine/', 'twinOf/', 'stores/', 'complaints/', 'complaintLast/', 'ideaLast/', 'userMoney/', 'pushPrefs/', 'userNewsReact/',
                        // added after the first release audit: everything else the account owns (see tools/rules.py; prizeClaims, bannedUsers and ventBan stay: they are the admin's records)
                        'hall/', 'chatNow/', 'npref/', 'sentFriendRequests/', 'duelMatch/', 'rmMe/', 'ventLast/', 'ventLastR/', 'chanReq/', 'chanReqLast/', 'noteBackup/']
                        .map((p) => p + uid);
                    if (/^[0-9]{3,12}$/.test(String(u.studentNumber || ''))) paths.push('numIndex/' + u.studentNumber);
                    if (pk) paths.push('phoneIndex/' + pk);
                    try { await this._need('flightmath'); await this._need('flights'); await this._flPurge(uid, db); } catch (e) {}
                    await Promise.all(paths.map(del));
                    await del('users/' + uid);
                    // the phone can take a new account once this one is gone
                    try { await this._devInit(); await del('deviceOwners/' + this._devId()); } catch (e) {}
                }
                try {
                    await h.deleteUser(user);
                } catch (e) {
                    console.warn('Delete account failed:', e);
                    fail('ما كدرت أحذف الحساب، جرب مرة ثانية');
                    return;
                }
                // what this phone kept for the account
                try {
                    Object.keys(localStorage).filter((k) => k.indexOf(uid) >= 0 || k === 'iraqiStudentUser').forEach((k) => localStorage.removeItem(k));
                } catch (e) {}
                this.closeDeleteAccount();
                this._guardOk = null;
                this.resetUserScopedListeners();
                this.isLoggedIn = false;
                this.currentUser = null;
                this.authUid = null;
                this._wall('circle-check', 'انحذف حسابك', 'انحذفت معلوماتك من المنصة. شكراً لأنك جنت ويانا، وبالتوفيق بدراستك.', 'تمام');
                const w = document.getElementById('banWall');
                if (w) { w.style.background = 'radial-gradient(120% 90% at 50% 0%, #0F766E, #134E4A 60%, #0B2E2B)'; const b = w.querySelector('button'); if (b) b.onclick = () => { w.remove(); this.goToAuth('register'); }; }
            },

            async logout() {
                if (await this.ask({ icon: 'log-out', title: 'تسجيل الخروج', text: 'متأكد تريد تطلع من حسابك؟', ok: 'اطلع', cancel: 'ابقَ' })) {
                    this.leaveStudyRoom();
                    if (window.firebaseDb && this.authUid) {
                        const { ref, set } = window.firebaseDbHelpers;
                        set(ref(window.firebaseDb, 'presence/' + this.authUid), { online: false, lastSeen: Date.now() }).catch(() => {});
                    }
                    this.isLoggedIn = false;
                    this.currentUser = null;
                    this.tempAvatar = null;
                    this.authUid = null;
                    this._stateLoadedFor = null;
                    this.resetUserScopedListeners();
                    userTasks.length = 0;
                    this.userRead = {};
                    this.userBookmarks = {};
                    this.userDeletedNotifs = {};
                    if (this._banUnsub) { this._banUnsub(); this._banUnsub = null; }
                    localStorage.removeItem('iraqiStudentUser');
                    if (window.firebaseAuth && window.firebaseAuth.currentUser && window.firebaseAuthHelpers) {
                        const { signOut } = window.firebaseAuthHelpers;
                        signOut(window.firebaseAuth).catch((err) => {
                            console.warn('Sign out failed:', err);
                        });
                    }
                    this.showToast('تم تسجيل الخروج بنجاح');
                    this.goToAuth('register');
                }
            },

            updateProfileView() {
                const notLoggedEl = document.getElementById('profileNotLogged');
                const loggedInEl = document.getElementById('profileLoggedIn');

                if (!notLoggedEl || !loggedInEl) return;

                if (this.isLoggedIn && this.currentUser) {
                    notLoggedEl.classList.add('hidden');
                    loggedInEl.classList.remove('hidden');

                    const nameEl = document.getElementById('profileName');
                    const locEl = document.getElementById('profileLocation');
                    const avatarEl = document.getElementById('profileAvatar');

                    if (nameEl) nameEl.innerHTML = escapeHtml(this.currentUser.fullName || '') + this.vb(this.authUid, 'lg');
                    if (locEl) locEl.textContent = this.currentUser.location || this.currentUser.governorate;
                    if (avatarEl) avatarEl.src = personAvatarSrc(this.currentUser.avatar, this.currentUser.fullName);
                    const schoolEl = document.getElementById('profileSchool');
                    if (schoolEl) schoolEl.textContent = this.currentUser.school || 'طالب في المرحلة الإعدادية';
                    const gradeValueEl = document.getElementById('profileGradeValue');
                    if (gradeValueEl) gradeValueEl.textContent = this.currentUser.grade === 'literary' ? 'سادس أدبي' : 'سادس علمي';
                    const studentNumberEl = document.getElementById('profileStudentNumberValue');
                    if (studentNumberEl) studentNumberEl.textContent = this.currentUser.studentNumber || '—';
                    const setNum = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = numOr0(v).toLocaleString('en-US'); };
                    setNum('profilePointsValue', this.currentUser.points);
                    setNum('profileStreakValue', this.currentUser.loginStreak);
                    setNum('profileSessionsValue', this.currentUser.studySessions);

                    const phoneDisplay = document.getElementById('profilePhoneDisplay');
                    if (phoneDisplay) {
                        if (this.currentUser.phone) {
                            phoneDisplay.classList.remove('hidden');
                            const span = phoneDisplay.querySelector('span');
                            if (span) span.textContent = this.currentUser.phone;
                        } else {
                            phoneDisplay.classList.add('hidden');
                        }
                    }

                    const emailDisplay = document.getElementById('profileEmailDisplay');
                    if (emailDisplay) {
                        if (this.currentUser.email) {
                            emailDisplay.classList.remove('hidden');
                            const span = emailDisplay.querySelector('span');
                            if (span) span.textContent = this.currentUser.email;
                        } else {
                            emailDisplay.classList.add('hidden');
                        }
                    }
                } else {
                    notLoggedEl.classList.remove('hidden');
                    loggedInEl.classList.add('hidden');
                }
                const savedCountEl = document.getElementById('profileSavedCount');
                if (savedCountEl) {
                    const savedCount = newsData.filter(n => n.isBookmarked).length;
                    savedCountEl.classList.toggle('hidden', savedCount === 0);
                    savedCountEl.textContent = savedCount;
                }
                this.updateNotifBadges();
                this.updateThemeIcon();
            },

            // ==================== NEWS ====================
            loadData() {
                this.showLoading();
                this.loadNewsFromDatabase();
                setTimeout(() => {
                    if (this.isOnline || newsData.length > 0) {
                        this.renderNews();
                        this.renderCarousel();
                        this.initSwiper();
                    } else {
                        this.showError();
                    }
                    lucide.createIcons();
                }, 800);
            },

            showLoading() {
                document.getElementById('loadingState')?.classList.remove('hidden');
                document.getElementById('newsListState')?.classList.add('hidden');
                document.getElementById('emptyState')?.classList.add('hidden');
                document.getElementById('errorState')?.classList.add('hidden');
            },
            showNewsList() {
                document.getElementById('loadingState')?.classList.add('hidden');
                document.getElementById('newsListState')?.classList.remove('hidden');
                document.getElementById('emptyState')?.classList.add('hidden');
                document.getElementById('errorState')?.classList.add('hidden');
            },
            showEmpty() {
                document.getElementById('loadingState')?.classList.add('hidden');
                document.getElementById('newsListState')?.classList.add('hidden');
                document.getElementById('emptyState')?.classList.remove('hidden');
                document.getElementById('errorState')?.classList.add('hidden');
            },
            showError() {
                document.getElementById('loadingState')?.classList.add('hidden');
                document.getElementById('newsListState')?.classList.add('hidden');
                document.getElementById('emptyState')?.classList.add('hidden');
                document.getElementById('errorState')?.classList.remove('hidden');
            },

            renderCategories() {
                const container = document.getElementById('categoryTabs');
                if (!container) return;
                // FIX: rebuilding the chips on every tap reset the row's scroll back to the
                // start. Once built, only the active styling is updated and the chosen chip is
                // scrolled into view.
                if (container.children.length === categories.length) {
                    container.querySelectorAll('.cat-tab').forEach((btn) => {
                        const on = btn.dataset.category === this.activeCategory;
                        btn.classList.toggle('bg-primary', on);
                        btn.classList.toggle('text-white', on);
                        btn.classList.toggle('shadow-lg', on);
                        btn.classList.toggle('theme-transition', !on);
                        btn.style.cssText = on ? '' : 'background-color: var(--input-bg); color: var(--text2);';
                        if (on) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                    });
                    return;
                }
                container.innerHTML = categories.map(cat => `
                    <button onclick="app.setCategory(${jsArg(cat.id)})"
                        class="cat-tab flex-shrink-0 px-5 py-2.5 rounded-pill text-sm font-medium transition-all whitespace-nowrap ${
                            this.activeCategory === cat.id
                            ? 'bg-primary text-white shadow-lg shadow-primary/25'
                            : 'theme-transition'
                        }"
                        data-category="${cat.id}"
                        style="${this.activeCategory !== cat.id ? 'background-color: var(--input-bg); color: var(--text2);' : ''}">
                        ${cat.label}
                    </button>
                `).join('');
            },

            setCategory(id) {
                if (id === 'results') {
                    this.goToResults();
                    return;
                }
                this.activeCategory = id;
                this.renderCategories();
                this.renderNews();
                lucide.createIcons();
            },

            goToResults() {
                const iframe = document.getElementById('resultsIframe');
                if (iframe && !iframe.src) iframe.src = 'https://results.mlazemna.com/ntbth/';
                this.switchView('resultsView');
                lucide.createIcons();
            },

            openResultsExternally() {
                window.open('https://results.mlazemna.com/ntbth/', '_blank', 'noopener');
            },

            renderDailyTip() {
                const section = document.getElementById('dailyTipSection');
                const track = document.getElementById('dailyTipList');
                const vp = document.getElementById('dailyTipViewport');
                if (!track || !vp) return;
                const todayStr = this.localDateStr ? this.localDateStr() : new Date().toISOString().slice(0, 10);
                let dismissed = '';
                try { dismissed = localStorage.getItem('isp_tip_dismissed') || ''; } catch (e) {}
                if (section && dismissed === todayStr) {
                    section.classList.add('hidden');
                    this._stripStop('tips', 'dailyTipList');
                    return;
                }
                if (section) section.classList.remove('hidden');
                // Today's tip first, then the rest in order — the strip steps through them.
                const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
                const n = dailyTips.length;
                const start = dayOfYear % n;
                const width = vp.clientWidth || 340;
                track.innerHTML = dailyTips.map((_, k) => {
                    const i = (start + k) % n;
                    return `<div class="tip-slide" data-n="${k + 1}" style="width: ${width}px;"><span class="tip-ic" aria-hidden="true"><i data-lucide="lightbulb"></i></span><div class="tip-text">${escapeHtml(dailyTips[i])}</div></div>`;
                }).join('');
                const countEl = document.getElementById('dailyTipCount');
                const setCount = (slide) => { if (countEl && slide) countEl.textContent = slide.dataset.n + '/' + n; };
                setCount(track.firstElementChild);
                lucide.createIcons();
                this._stripStart('tips', 'dailyTipViewport', 'dailyTipList', setCount);
                // slides are sized to the card — resize them when the screen width changes
                if (!this._tipResizeBound && 'ResizeObserver' in window) {
                    this._tipResizeBound = true;
                    let lastW = vp.clientWidth;
                    new ResizeObserver(() => {
                        const w = vp.clientWidth;
                        if (!w || w === lastW) return;
                        lastW = w;
                        track.querySelectorAll('.tip-slide').forEach((sl) => { sl.style.width = w + 'px'; });
                    }).observe(vp);
                }
            },

            dismissDailyTip() {
                const todayStr = this.localDateStr ? this.localDateStr() : new Date().toISOString().slice(0, 10);
                try { localStorage.setItem('isp_tip_dismissed', todayStr); } catch (e) {}
                document.getElementById('dailyTipSection')?.classList.add('hidden');
                this._stripStop('tips', 'dailyTipList');
            },

            renderNewsTicker() {
                const bar = document.getElementById('tickerBar');
                if (!bar) return;
                const now = Date.now();
                const items = (this.adminTicker || [])
                    .filter(t => t && t.text && t.active !== false && !(Number(t.expiresAt) && Number(t.expiresAt) <= now))
                    .sort((a, b) => (Number(b.order ?? b.id) || 0) - (Number(a.order ?? a.id) || 0));
                // re-render when the next headline expires
                clearTimeout(this._tkExpiry);
                const nextExp = (this.adminTicker || []).map(t => Number(t && t.expiresAt) || 0).filter(x => x > now).sort((x, y) => x - y)[0];
                if (nextExp) this._tkExpiry = setTimeout(() => this.renderNewsTicker(), Math.min(nextExp - now + 500, 2147483000));
                this._tickerInit();
                const tk = this._tk;
                if (items.length === 0) {
                    bar.classList.add('hidden');
                    tk.items = []; tk.key = '';
                    return;
                }
                bar.classList.remove('hidden');
                const tcfg = (this.siteConfig && this.siteConfig.ticker) || {};
                const key = items.map(t => (t.id || '') + '|' + (t.text || '')).join('␞') + '␞' + (Number(tcfg.duration) || 0) + (tcfg.autoplay === false ? 'm' : 'a');
                if (key === tk.key) return; // same headlines and settings: keep the marquee where it is
                const autoplayChanged = tk.autoplay !== (tcfg.autoplay !== false);
                tk.autoplay = tcfg.autoplay !== false;
                if (autoplayChanged) tk.userPaused = !tk.autoplay; // admin "autoplay off" = starts paused
                tk.key = key;
                tk.items = items.slice();
                tk.speed = ({ 4: 85, 6: 65, 8: 48, 12: 34 })[Number(tcfg.duration)] || 48; // px per second
                const sr = document.getElementById('tkSr');
                if (sr) sr.textContent = items.length + ' خبر عاجل: ' + items.map(t => t.text).join(' — ');
                const countEl = document.getElementById('tkCount');
                if (countEl) countEl.textContent = items.length === 1 ? 'خبر واحد' : (items.length === 2 ? 'خبران' : items.length + (items.length <= 10 ? ' أخبار' : ' خبراً'));
                this._tickerRenderList();
                this._tickerBuild();
                this._tickerSync();
            },

            _tickerInit() {
                if (this._tk) return;
                const bar = document.getElementById('tickerBar');
                const viewport = document.getElementById('tkViewport');
                const reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
                const tk = this._tk = { items: [], key: '', hover: false, hold: false, focus: false, open: false, userPaused: false, autoplay: true, speed: 55, builtWidth: 0, reduced };
                const sync = () => {
                    const paused = tk.hover || tk.hold || tk.focus || tk.open || tk.userPaused;
                    bar.classList.toggle('tk-paused', paused);
                    const btn = document.getElementById('tkToggle');
                    if (btn) {
                        btn.setAttribute('aria-label', tk.userPaused ? 'تشغيل الشريط' : 'إيقاف الشريط');
                        btn.innerHTML = tk.userPaused
                            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17 5.5v13a1 1 0 0 1-1.5.86l-11-6.5a1 1 0 0 1 0-1.72l11-6.5A1 1 0 0 1 17 5.5z"/></svg>'
                            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';
                    }
                };
                this._tickerSync = sync;
                document.getElementById('tkToggle').addEventListener('click', () => { tk.userPaused = !tk.userPaused; sync(); });
                document.getElementById('tkMore').addEventListener('click', () => this._tickerToggleList());
                // Tap a headline → open the full list with that headline highlighted.
                viewport.addEventListener('click', (e) => {
                    const chip = e.target.closest && e.target.closest('.tk-chip');
                    this._tickerToggleList(true, chip ? Number(chip.dataset.i) : null);
                });
                viewport.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._tickerToggleList(); }
                });
                // Press and hold to read a headline without it running away.
                viewport.addEventListener('pointerdown', () => { tk.hold = true; sync(); });
                ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => viewport.addEventListener(ev, () => { if (tk.hold) { tk.hold = false; sync(); } }));
                bar.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { tk.hover = true; sync(); } });
                bar.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { tk.hover = false; sync(); } });
                bar.addEventListener('focusin', (e) => {
                    let kb = false; try { kb = e.target.matches(':focus-visible'); } catch (_) {}
                    if (kb) { tk.focus = true; sync(); }
                });
                bar.addEventListener('focusout', (e) => { if (!bar.contains(e.relatedTarget)) { tk.focus = false; sync(); } });
                bar.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && tk.open) { this._tickerToggleList(false); document.getElementById('tkMore').focus(); }
                });
                // The track is sized from real pixel widths, which are 0 while the home screen
                // is hidden — rebuild whenever the visible width changes (rotation, returning home).
                if ('ResizeObserver' in window) {
                    new ResizeObserver(() => {
                        if (tk.items.length && viewport.clientWidth && viewport.clientWidth !== tk.builtWidth) this._tickerBuild();
                    }).observe(viewport);
                }
                if (tk.reduced.matches) tk.userPaused = true;
            },

            // Builds [sequence × n][sequence × n] so translating by -50% → 0 loops seamlessly.
            // The row is laid out LTR with the headlines in reverse, so while it moves right
            // the first headline is the one that enters (and is read) first.
            _tickerBuild() {
                const tk = this._tk;
                const track = document.getElementById('tkTrack');
                const viewport = document.getElementById('tkViewport');
                if (!tk || !track || !viewport) return;
                const now = Date.now();
                const chip = (t, k) => {
                    const ts = Number(t.id);
                    const isNew = ts > 1e11 && now - ts < 3600000;
                    const time = ts > 1e11 ? `<span class="tk-time" data-timeago="${jsNum(ts)}">${timeAgo(ts)}</span>` : '';
                    return `<span class="tk-chip" data-i="${k}">${isNew ? '<span class="tk-new">جديد</span>' : ''}<span>${escapeHtml(t.text)}</span>${time}</span><span class="tk-sep"></span>`;
                };
                const seq = tk.items.map((t, k) => chip(t, k)).reverse().join('');
                track.innerHTML = seq;
                const seqWidth = track.scrollWidth;
                const viewWidth = viewport.clientWidth;
                tk.builtWidth = viewWidth;
                if (!seqWidth || !viewWidth) return; // hidden right now — ResizeObserver rebuilds later
                const reps = Math.max(1, Math.ceil(viewWidth / seqWidth));
                const half = seq.repeat(reps);
                track.innerHTML = half + half;
                const secs = Math.max(8, (seqWidth * reps) / (tk.speed || 55));
                track.style.setProperty('--tk-dur', secs.toFixed(2) + 's');
                // restart the animation so the new content starts from the beginning
                track.style.animation = 'none';
                void track.offsetWidth;
                track.style.animation = '';
            },

            _tickerRenderList() {
                const list = document.getElementById('tkList');
                if (!list) return;
                const tk = this._tk;
                list.innerHTML = tk.items.map((t, k) => {
                    const ts = Number(t.id);
                    const time = ts > 1e11 ? `<span class="tk-item-time" data-timeago="${jsNum(ts)}">${timeAgo(ts)}</span>` : '';
                    return `<li><button type="button" class="tk-item" data-i="${k}">
                        <span class="tk-item-mark" aria-hidden="true"></span>
                        <span class="tk-item-body">${escapeHtml(t.text)}${time}</span>
                    </button></li>`;
                }).join('');
                list.querySelectorAll('.tk-item').forEach(btn => btn.addEventListener('click', () => this._tickerToggleList(false)));
            },

            _tickerToggleList(force, highlight) {
                const tk = this._tk;
                const list = document.getElementById('tkList');
                const bar = document.getElementById('tickerBar');
                tk.open = typeof force === 'boolean' ? force : !tk.open;
                list.hidden = !tk.open;
                bar.classList.toggle('tk-open', tk.open);
                ['tkMore', 'tkViewport'].forEach(id => document.getElementById(id)?.setAttribute('aria-expanded', String(tk.open)));
                list.querySelectorAll('.tk-item').forEach((el, k) => el.classList.toggle('is-current', tk.open && k === highlight));
                if (tk.open && highlight != null) list.querySelector('.tk-item.is-current')?.scrollIntoView({ block: 'nearest' });
                this._tickerSync();
            },

            renderNews() {
                this.renderNewsTicker();
                this.applyUserNewsState();
                const filtered = this.activeCategory === 'all' ? newsData : newsData.filter(n => n.category === this.activeCategory);
                const container = document.getElementById('newsList');
                const newsCountEl = document.getElementById('newsCount');
                if (newsCountEl) newsCountEl.textContent = `${filtered.length} خبر`;
                if (filtered.length === 0) {
                    // not an empty list yet: the server hasn't answered, so show the placeholders
                    if (!this._newsGot && !newsData.length) { this.showLoading(); this._newsWatch(); return; }
                    this.showEmpty();
                    this._newsMoreBtn();
                    return;
                }
                this.showNewsList();
                if (container) container.innerHTML = filtered.map(news => this.createNewsCard(news)).join(''); if (window.lucide) lucide.createIcons();
                this._newsMoreBtn();
            },

            // "عرض أخبار أقدم" under the list while there may be more on the server
            _newsMoreBtn() {
                const wrap = document.getElementById('newsMore');
                if (wrap) wrap.classList.toggle('hidden', !!this._newsAllLoaded || !newsData.length);
            },

            // News card v2: photo on the right, bold title, 2-line excerpt, divider, then
            // source · time and a bookmark. Keeps swipe-to-delete (the red layer must stay the
            // article's previous sibling).
            // ===== Reactions on news: like, love, laugh, sad, angry (drawn icons, not emoji) =====
            // userNewsReact/{uid}/{newsId} = the student's own choice; newsReactCounts/{newsId}/{type} = the public counters,
            // which the database rules only let move by one together with that student's own choice.
            RX_TYPES: ['like', 'love', 'laugh', 'sad', 'angry'],
            RX_LABEL: { like: 'إعجاب', love: 'حب', laugh: 'ضحك', sad: 'حزن', angry: 'غضب' },
            RX_COLOR: { like: '#2563EB', love: '#EF4444', laugh: '#F59E0B', sad: '#F59E0B', angry: '#EA580C' },
            _rxIcon(t, size) {
                const z = size || 24, id = 'rx' + t + z + Math.floor(Math.random() * 1e6);
                const face = (g1, g2) => `<defs><radialGradient id="${id}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${g1}"/><stop offset="1" stop-color="${g2}"/></radialGradient></defs><circle cx="16" cy="16" r="16" fill="url(#${id})"/>`;
                const ink = '#4A2C00';
                const parts = {
                    like: face('#5B9DFF', '#1D4ED8') + '<path transform="translate(7.2 6.6) scale(.78)" fill="#fff" d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>',
                    love: face('#FF7A7A', '#DC2626') + '<path fill="#fff" d="M16 25.5C7.5 19 6 14.6 6 12c0-2.6 2-4.5 4.4-4.5 2.4 0 4.2 1.7 5.6 3.7 1.4-2 3.2-3.7 5.6-3.7C24 7.5 26 9.4 26 12c0 2.6-1.5 7-10 13.5z"/>',
                    laugh: face('#FFE27A', '#F59E0B') + `<path d="M8.5 13.2q2.3-3 4.6 0M18.9 13.2q2.3-3 4.6 0" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/><path d="M8 17.5h16c0 5-3.6 8.5-8 8.5s-8-3.5-8-8.5z" fill="${ink}"/><path d="M11.5 23.4q4.5-3 9 0c-1 1.4-2.7 2.1-4.5 2.1s-3.5-.7-4.5-2.1z" fill="#F87171"/>`,
                    sad: face('#FFE27A', '#F59E0B') + `<circle cx="11" cy="13.5" r="1.9" fill="${ink}"/><circle cx="21" cy="13.5" r="1.9" fill="${ink}"/><path d="M10.5 24q5.5-5 11 0" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/><path d="M24.5 16.2q2.7 3.2 0 5.2-2.7-2-0-5.2z" fill="#4FA3F7"/>`,
                    angry: face('#FF9A62', '#DC2626') + `<path d="M7.5 9.5l6.5 3.2M24.5 9.5l-6.5 3.2" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round"/><circle cx="11.2" cy="15.2" r="1.9" fill="${ink}"/><circle cx="20.8" cy="15.2" r="1.9" fill="${ink}"/><path d="M10.5 24.5q5.5-5 11 0" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`,
                };
                return `<svg class="rx-ic" width="${z}" height="${z}" viewBox="0 0 32 32" aria-hidden="true">${parts[t] || ''}</svg>`;
            },
            _rxState() { return this._rx || (this._rx = { counts: {}, mine: {} }); },
            listenForReactions() {
                if (!window.firebaseDb) return;
                const { ref, onValue, query, orderByKey, limitToLast } = window.firebaseDbHelpers;
                const R = this._rxState();
                if (!this._rxPubListener) {
                    this._rxPubListener = onValue(query(ref(window.firebaseDb, 'newsReactCounts'), orderByKey(), limitToLast(60)), (snap) => {
                        R.counts = snap.exists() ? snap.val() : {};
                        this.rxRefresh();
                    }, () => {});
                }
                if (this.authUid && R.uid !== this.authUid) {
                    if (typeof this._rxMine === 'function') { try { this._rxMine(); } catch (e) {} }
                    R.uid = this.authUid; R.mine = {};
                    this._rxMine = onValue(ref(window.firebaseDb, 'userNewsReact/' + this.authUid), (snap) => { R.mine = snap.exists() ? snap.val() : {}; this.rxRefresh(); }, () => {});
                } else if (!this.authUid && R.uid) {
                    if (typeof this._rxMine === 'function') { try { this._rxMine(); } catch (e) {} }
                    this._rxMine = null; R.uid = null; R.mine = {}; this.rxRefresh();
                }
            },
            _rxTotals(id) {
                const c = (this._rxState().counts || {})[id] || {};
                const list = this.RX_TYPES.map((t) => [t, Number(c[t]) || 0]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
                return { list, total: list.reduce((a, x) => a + x[1], 0) };
            },
            // the small "icons + number" shown on a news card, and the bar in the news page
            rxSummaryHtml(id) {
                const t = this._rxTotals(id);
                if (!t.total) return '';
                return '<span class="rx-stack">' + t.list.slice(0, 3).map((x) => this._rxIcon(x[0], 17)).join('') + '</span><b>' + t.total + '</b>';
            },
            rxBarHtml(id) {
                const R = this._rxState(), mine = R.mine[id], t = this._rxTotals(id);
                const btn = mine
                    ? `<button class="rx-me on" style="--c:${this.RX_COLOR[mine]}" onclick="app.rxOpen(${id}, event)">${this._rxIcon(mine, 24)}<span>${this.RX_LABEL[mine]}</span></button>`
                    : `<button class="rx-me" onclick="app.rxOpen(${id}, event)"><i data-lucide="smile-plus"></i><span>تفاعل</span></button>`;
                const detail = t.total
                    ? t.list.map((x) => `<span class="rx-chip">${this._rxIcon(x[0], 18)}<b>${x[1]}</b></span>`).join('')
                    : '<span class="rx-none">كن أول من يتفاعل</span>';
                return `<div class="rx-bar" data-rxbar="${id}">${btn}<div class="rx-chips">${detail}</div></div>`;
            },
            rxRefresh() {
                document.querySelectorAll('[data-rx]').forEach((el) => { el.innerHTML = this.rxSummaryHtml(Number(el.dataset.rx)); });
                document.querySelectorAll('[data-rxbar]').forEach((el) => {
                    const id = Number(el.dataset.rxbar);
                    el.outerHTML = this.rxBarHtml(id);
                });
                if (window.lucide && document.querySelector('.rx-me i[data-lucide]')) lucide.createIcons();
            },
            rxOpen(id, ev) {
                if (ev) { ev.stopPropagation(); ev.preventDefault(); }
                this.rxClose();
                const el = ev && (ev.currentTarget || ev.target);
                const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { top: 200, left: 100, width: 40, bottom: 240 };
                const mine = this._rxState().mine[id];
                const pop = document.createElement('div');
                pop.className = 'rx-pop'; pop.id = 'rxPop';
                pop.innerHTML = this.RX_TYPES.map((t, i) => `<button class="${mine === t ? 'on' : ''}" style="animation-delay:${i * 45}ms" onclick="app.rxReact(${id}, '${t}'); app.rxClose();" aria-label="${this.RX_LABEL[t]}">${this._rxIcon(t, 38)}<small>${this.RX_LABEL[t]}</small></button>`).join('');
                document.body.appendChild(pop);
                const w = pop.offsetWidth, vw = window.innerWidth;
                let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), vw - w - 8);
                const below = r.top < 90;
                pop.style.left = left + 'px';
                pop.style.top = (below ? r.bottom + 8 : r.top - pop.offsetHeight - 8) + 'px';
                setTimeout(() => document.addEventListener('click', this._rxOut = () => this.rxClose(), { once: true }), 0);
            },
            rxClose() { const p = document.getElementById('rxPop'); if (p) p.remove(); if (this._rxOut) { document.removeEventListener('click', this._rxOut); this._rxOut = null; } },
            async rxReact(id, type) {
                if (!this.isLoggedIn || !this.authUid) { this.showToast('سجّل دخولك حتى تتفاعل'); this.goToAuth('login'); return; }
                if (!window.firebaseDb) return;
                const R = this._rxState(), { ref, update, get } = window.firebaseDbHelpers, uid = this.authUid;
                const prev = R.mine[id] || null, next = prev === type ? null : type;
                const counts0 = JSON.parse(JSON.stringify(R.counts[id] || {}));
                // show it straight away; the write below confirms (or puts it back)
                const c = R.counts[id] = Object.assign({}, R.counts[id]);
                if (prev) c[prev] = Math.max(0, (c[prev] || 0) - 1);
                if (next) c[next] = (c[next] || 0) + 1;
                if (next) R.mine[id] = next; else delete R.mine[id];
                this.rxRefresh();
                let base = counts0;
                for (let k = 0; k < 3; k++) {
                    const up = { ['userNewsReact/' + uid + '/' + id]: next };
                    if (prev) up['newsReactCounts/' + id + '/' + prev] = Math.max(0, (Number(base[prev]) || 0) - 1);
                    if (next) up['newsReactCounts/' + id + '/' + next] = (Number(base[next]) || 0) + 1;
                    try { await update(ref(window.firebaseDb), up); return; } catch (e) {
                        // someone else changed the counter in between: read it again and retry
                        try { base = (await get(ref(window.firebaseDb, 'newsReactCounts/' + id))).val() || {}; } catch (e2) { break; }
                    }
                }
                R.counts[id] = counts0; if (prev) R.mine[id] = prev; else delete R.mine[id];
                this.rxRefresh();
                this.showToast('ما انحسب تفاعلك، حاول مرة ثانية');
            },

            createNewsCard(news) {
                const isRead = news.isRead;
                const isBookmarked = news.isBookmarked;
                const id = jsNum(news.id);
                const cat = (categories.find(c => c.id === news.category) || {}).label || '';
                return `
                    <div class="nw-wrap relative overflow-hidden">
                        <div class="absolute inset-0 bg-error flex items-center" style="opacity: 0; transition: opacity 0.15s ease; border-radius: 22px;">
                            <button onclick="event.stopPropagation(); app.deleteNewsCard(${id})" class="btn-press absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center" aria-label="حذف الخبر">
                                <i data-lucide="trash-2" class="w-5 h-5 text-white"></i>
                            </button>
                        </div>
                        <article class="nw-card${!isRead ? ' is-unread' : ''}" onclick="app.openNews(${id})" ontouchstart="app.swipeStart(event, 'news-${id}')" ontouchmove="app.swipeMove(event, 'news-${id}')" ontouchend="app.swipeEnd(event, 'news-${id}')" data-swipe-card data-tx="0">
                            <div class="nw-img">
                                <img src="${escapeHtml(newsImg(news))}" alt="${escapeHtml(news.title)}" loading="lazy" onerror="app.newsImgFb(this, ${jsNum(news.id)})">
                                ${news.isUrgent ? '<span class="nw-flag nw-urgent">عاجل</span>' : (cat ? `<span class="nw-flag">${escapeHtml(cat)}</span>` : '')}
                            </div>
                            <div class="nw-body">
                                <h3 class="nw-title"><span class="nw-dot${isRead ? ' read' : ''}" aria-label="${isRead ? 'مقروء' : 'جديد'}"></span>${news.isPinned ? '<i data-lucide="pin" class="nw-pin"></i>' : ''}${escapeHtml(news.title)}</h3>
                                ${news.excerpt ? `<p class="nw-excerpt">${escapeHtml(news.excerpt)}</p>` : ''}
                                <span class="rx-sum" data-rx="${id}">${this.rxSummaryHtml(news.id)}</span>
                                <div class="nw-foot">
                                    <span class="nw-meta"><i data-lucide="user"></i><span>${escapeHtml(news.source || 'وزارة التربية العراقية')}</span></span>
                                    <span class="nw-sep" aria-hidden="true"></span>
                                    <span class="nw-meta"><i data-lucide="clock"></i><span data-timeago="${id}">${timeAgo(news.id)}</span></span>
                                    <button style="margin-inline-start:auto" onclick="app.rxOpen(${id}, event)" class="nw-bm" aria-label="تفاعل"><i data-lucide="smile-plus"></i></button>
                                    <button onclick="event.stopPropagation(); app.toggleBookmark(${id})" class="nw-bm${isBookmarked ? ' on' : ''}" aria-label="${isBookmarked ? 'إزالة من المحفوظات' : 'حفظ الخبر'}">
                                        <i data-lucide="bookmark"></i>
                                    </button>
                                </div>
                            </div>
                        </article>
                    </div>
                `;
            },

            renderCarousel() {
                const wrapper = document.getElementById('carouselWrapper');
                const section = document.getElementById('carouselSection');
                if (!wrapper) return;
                const slides = (this.adminCarousel && this.adminCarousel.length) ? this.adminCarousel : [
                    { image: 'icons/icon-192.png', title: 'أكـادمي السادس' }
                ];
                if (section) section.classList.remove('hidden');
                wrapper.innerHTML = slides.map(sl => `
                    <div class="swiper-slide relative bg-black">
                        <img src="${safeImage(sl.image)}" class="w-full h-full object-contain" alt="${escapeHtml(sl.title || '')}">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                        <div class="absolute bottom-0 right-0 left-0 p-4 text-white">
                            ${sl.title ? `<h3 class="text-base font-bold leading-snug">${escapeHtml(sl.title)}</h3>` : ''}
                        </div>
                    </div>
                `).join('');
            },

            initSwiper() {
                if (typeof Swiper === 'undefined') {
                    console.warn('Swiper غير متوفر');
                    return;
                }
                if (this.swiper) {
                    this.swiper.destroy(true, true);
                    this.swiper = null;
                }
                const el = document.querySelector('.mySwiper');
                if (!el) return;
                // FIX (UI/UX): Swiper's default transition speed is 300ms, which reads as an
                // abrupt jump-cut between slides rather than a slide. Slowed it to 700ms with
                // an eased curve so the motion feels smooth instead of snappy.
                // FIX: loop/autoplay with a single slide (the default logo slide when the admin
                // hasn't added carousel images) triggers Swiper's "not enough slides for loop
                // mode" warning — they're only enabled when there are 2+ slides.
                const multi = el.querySelectorAll('.swiper-slide').length > 1;
                this.swiper = new Swiper(el, {
                    slidesPerView: 1, spaceBetween: 0, loop: multi,
                    speed: 700,
                    effect: 'slide',
                    cssMode: false,
                    autoplay: multi ? { delay: 5000, disableOnInteraction: false } : false,
                    direction: 'horizontal'
                });
            },

            // a news picture that does not load (a dead link, a broken file): swap it for the default one, once
            newsImgFb(img, id) {
                if (!img || img.dataset.fb) return;
                img.dataset.fb = '1';
                const n = newsData.find((x) => x.id === Number(id)) || null;
                img.src = newsDefault(n);
            },

            // full-screen photo viewer: tap the news photo, pinch or double-tap to zoom, tap outside or the X to close
            openImageViewer(id) {
                const news = (id && typeof id === 'object') ? null : newsData.find(n => n.id === id);
                const src = (id && typeof id === 'object') ? String(id.src || '') : (news ? newsImg(news) : '');
                if (!src) return;
                this.closeImageViewer();
                const v = document.createElement('div');
                v.id = 'imgViewer';
                v.innerHTML = '<button class="iv-x" aria-label="إغلاق" onclick="app.closeImageViewer()"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button><img alt="">';
                const im = v.querySelector('img'); im.src = src;
                let scale = 1, x = 0, y = 0, d0 = 0, s0 = 1, sx = 0, sy = 0, lastTap = 0, moved = false;
                const apply = () => { im.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')'; };
                const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
                v.addEventListener('touchstart', (e) => {
                    moved = false;
                    if (e.touches.length === 2) { d0 = dist(e.touches); s0 = scale; }
                    else if (e.touches.length === 1) { sx = e.touches[0].clientX - x; sy = e.touches[0].clientY - y; }
                }, { passive: true });
                v.addEventListener('touchmove', (e) => {
                    moved = true;
                    if (e.touches.length === 2 && d0) { scale = Math.min(5, Math.max(1, s0 * dist(e.touches) / d0)); apply(); }
                    else if (e.touches.length === 1 && scale > 1) { x = e.touches[0].clientX - sx; y = e.touches[0].clientY - sy; apply(); }
                }, { passive: true });
                v.addEventListener('touchend', (e) => {
                    if (scale <= 1.02) { scale = 1; x = 0; y = 0; apply(); }
                    if (!moved && e.touches.length === 0) {
                        const now = Date.now();
                        if (now - lastTap < 300) { scale = scale > 1 ? 1 : 2.5; x = 0; y = 0; apply(); lastTap = 0; }
                        else lastTap = now;
                    }
                });
                v.addEventListener('click', (e) => { if (e.target === v) this.closeImageViewer(); });
                document.body.appendChild(v);
                this._ivKey = (e) => { if (e.key === 'Escape') this.closeImageViewer(); };
                document.addEventListener('keydown', this._ivKey);
            },
            closeImageViewer() {
                const v = document.getElementById('imgViewer');
                if (v) v.remove();
                if (this._ivKey) { document.removeEventListener('keydown', this._ivKey); this._ivKey = null; }
            },

            // News details v2: full-bleed photo with category chips, big bold headline, source
            // row with date + reading time, the text in a large readable size, action buttons,
            // then related news using the same cards as the home list.
            openNews(id) {
                const news = newsData.find(n => n.id === id);
                if (!news) return;
                this.currentNewsId = id;
                this._countNewsView(id);
                news.isRead = true;
                this.saveReadState(id);
                this.renderNews();
                const relatedNotif = notifications.find(n => n.id === id);
                if (relatedNotif && !relatedNotif.read) {
                    relatedNotif.read = true;
                    this.updateNotifBadges();
                }
                const content = document.getElementById('detailsContent');
                if (!content) return;
                const cat = (categories.find(c => c.id === news.category) || {}).label || '';
                const text = String(news.excerpt || '');
                const words = (String(news.title || '') + ' ' + text).trim().split(/\s+/).length;
                const readMin = Math.max(1, Math.round(words / 180));
                // tidy text: no repeated title as the first line, no stacks of blank lines, one paragraph per block
                let clean = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
                const firstLine = clean.split('\n')[0].trim();
                if (firstLine && firstLine === String(news.title || '').trim()) clean = clean.slice(clean.indexOf('\n') < 0 ? clean.length : clean.indexOf('\n')).trim();
                const body = clean ? clean.split(/\n{2,}/).map((para) => '<p>' + escapeHtml(para.trim()).replace(/\n/g, '<br>') + '</p>').join('') : '';
                const d = new Date(Number(news.id));
                const dateLabel = isNaN(d) ? escapeHtml(news.date || '') : d.getDate() + ' ' + IRAQI_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
                const related = newsData.filter(n => n.id !== id && n.category === news.category).slice(0, 3);
                content.innerHTML = `
                    <article class="nd">
                        <div class="nd-hero" onclick="app.openImageViewer(${jsNum(news.id)})" role="button" aria-label="فتح الصورة">
                            <img src="${escapeHtml(newsImg(news))}" alt="${escapeHtml(news.title)}" onerror="app.newsImgFb(this, ${jsNum(news.id)})">
                            <span class="nd-zoom" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span>
                            <div class="nd-hero-shade"></div>
                            <div class="nd-tags">
                                ${news.isUrgent ? '<span class="nd-tag nd-tag-urgent"><span class="tk-dot" aria-hidden="true"></span>عاجل</span>' : ''}
                                ${cat ? `<span class="nd-tag">${escapeHtml(cat)}</span>` : ''}
                                ${news.isPinned ? '<span class="nd-tag"><i data-lucide="pin"></i>مثبت</span>' : ''}
                            </div>
                        </div>
                        <div class="nd-body">
                            <h1 class="nd-title">${escapeHtml(news.title)}</h1>
                            <div class="nd-src">
                                <img class="nd-flag" src="assets/news/iraq-flag.png" alt="" width="38" height="38" decoding="async">
                                <div>
                                    <b>${escapeHtml(news.source || 'وزارة التربية العراقية')}</b>
                                    <span>${dateLabel}</span><span><span data-timeago="${jsNum(news.id)}">${timeAgo(news.id)}</span> · ${readMin} د قراءة</span>
                                </div>
                            </div>
                            ${body ? `<div class="nd-text">${body}</div>` : ''}
                            ${this.rxBarHtml(Number(news.id))}
                            <div class="nd-actions">
                                <button onclick="app.shareCurrentNews()" class="nd-btn"><i data-lucide="share-2"></i>مشاركة</button>
                                <button onclick="app.shareNewsStory()" class="nd-btn"><i data-lucide="image"></i>ستوري</button>
                                <button onclick="app.toggleBookmarkDetail()" class="nd-btn${news.isBookmarked ? ' on' : ''}"><i data-lucide="bookmark"></i>${news.isBookmarked ? 'محفوظ' : 'حفظ الخبر'}</button>
                                ${this.modCan('delNews') ? `<button onclick="app.modDelNews(${jsNum(news.id)})" class="nd-btn" style="color:#dc2626;white-space:nowrap;font-size:12.5px"><i data-lucide="trash-2"></i>حذف للكل</button>` : ''}
                            ${/^https:\/\/[^\s"'<>]{4,300}$/.test(String(news.link || '')) ? `<a href="${escapeHtml(news.link)}" target="_blank" rel="noopener noreferrer" class="nd-btn" style="text-decoration:none;"><i data-lucide="external-link"></i>المصدر الرسمي</a>` : ''}
                            </div>
                            ${related.length ? `
                            <h3 class="nd-rel-title">أخبار ذات صلة</h3>
                            <div class="flex flex-col gap-3">${related.map(n => this.createNewsCard(n)).join('')}</div>` : ''}
                        </div>
                    </article>
                `;
                this.switchView('detailsView');
                lucide.createIcons();
            },

            toggleBookmark(id) {
                const news = newsData.find(n => n.id === id);
                if (news) {
                    news.isBookmarked = !news.isBookmarked;
                    this.saveBookmarkState(id, news.isBookmarked);
                    this.renderNews();
                    this.showToast(news.isBookmarked ? 'تم حفظ الخبر' : 'تم إزالة الخبر من المحفوظات');
                    lucide.createIcons();
                }
            },
            toggleBookmarkDetail() {
                if (this.currentNewsId) {
                    this.toggleBookmark(this.currentNewsId);
                    this.openNews(this.currentNewsId);
                }
            },
            async shareCurrentNews() {
                const news = newsData.find(n => n.id === this.currentNewsId);
                const url = this._isNative() ? 'https://efcegxsax-glitch.github.io/Shop-Iraq-/' : window.location.href;
                const title = (news && news.title) || 'أكـادمي السادس';
                const text = (news && news.excerpt) ? (news.title + '\n' + news.excerpt) : title;
                try {
                    if (navigator.share) {
                        await navigator.share({ title, text, url });
                    } else if (navigator.clipboard) {
                        await navigator.clipboard.writeText(url);
                        this.showToast('تم نسخ رابط الخبر — المشاركة المباشرة غير مدعومة بهذا المتصفح');
                    } else {
                        this.showToast('المشاركة غير مدعومة في هذا المتصفح');
                    }
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        this.showToast('تعذر تنفيذ المشاركة');
                    }
                }
            },
            showMoreOptions() { this.showToast('خيارات إضافية'); },

            handleSearch(query) {
                const value = (query || '').trim();
                const suggestions = document.getElementById('searchSuggestions');
                if (!value) {
                    if (suggestions) suggestions.classList.add('hidden');
                    return;
                }
                if (suggestions) suggestions.classList.remove('hidden');
            },
            showSearchFocus() { document.getElementById('searchFocusBtn')?.classList.remove('hidden'); },
            hideSearchFocus() {
                setTimeout(() => {
                    document.getElementById('searchFocusBtn')?.classList.add('hidden');
                    document.getElementById('searchSuggestions')?.classList.add('hidden');
                }, 200);
            },
            clearSearch() {
                const input = document.getElementById('searchInput');
                if (input) input.value = '';
                document.getElementById('searchSuggestions')?.classList.add('hidden');
                this.renderNews();
                if (this.currentView === 'searchView') this.switchView('homeView');
                lucide.createIcons();
            },
            setSearch(term) {
                const input = document.getElementById('searchInput');
                if (input) input.value = term;
                document.getElementById('searchSuggestions')?.classList.add('hidden');
                this.performSearch(term);
            },
            performSearch(query) {
                const results = newsData.filter(n => String(n.title || '').includes(query) || String(n.excerpt || '').includes(query));
                const container = document.getElementById('searchResults');
                if (!container) return;
                if (results.length === 0) {
                    container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-16 text-center">
                            <div class="w-16 h-16 rounded-full flex items-center justify-center mb-3 theme-transition" style="background-color: var(--input-bg);">
                                <i data-lucide="search-x" class="w-8 h-8 theme-transition" style="color: var(--text2);"></i>
                            </div>
                            <h3 class="font-bold mb-1 theme-transition" style="color: var(--text);">لا توجد نتائج</h3>
                            <p class="text-sm theme-transition" style="color: var(--text2);">جرب كلمات بحث أخرى</p>
                        </div>`;
                } else {
                    container.innerHTML = results.map(n => this.createNewsCard(n)).join(''); if (window.lucide) lucide.createIcons();
                }
                this._skipHistory = true;
                this.switchView('searchView');
                this._skipHistory = false;
                lucide.createIcons();
            },

            // ==================== NOTIFICATIONS ====================
            // A banner that drops from the top like WhatsApp / Instagram while the app is open: tap = open, swipe up or wait = gone.
            _heads(title, body, onTap) {
                document.getElementById('hdsUp')?.remove(); clearTimeout(this._hdsT);
                const el = document.createElement('div');
                el.id = 'hdsUp'; el.className = 'hds'; el.setAttribute('role', 'alert');
                el.innerHTML = `<img src="icons/icon-192.png" alt=""><div><small>أكاديمي السادس · الآن</small><b>${escapeHtml(String(title || '').slice(0, 90))}</b>${body ? `<span>${escapeHtml(String(body).slice(0, 140))}</span>` : ''}</div>`;
                let y0 = null;
                const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 250); };
                el.addEventListener('click', () => { close(); try { onTap && onTap(); } catch (e) { console.warn(e); } });
                el.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; clearTimeout(this._hdsT); }, { passive: true });
                el.addEventListener('touchend', (e) => { if (y0 != null && y0 - e.changedTouches[0].clientY > 24) { e.preventDefault(); close(); } y0 = null; });
                document.body.appendChild(el);
                requestAnimationFrame(() => el.classList.add('on'));
                this._hdsT = setTimeout(close, 6500);
            },

            goToNotifications() {
                this.loadNotifications();
                this.switchView('notificationsView');
            },
            loadNotifications() {
                this.showNotifLoading();
                setTimeout(() => {
                    if (this.isOnline) { this.showNotifList(); this.renderNotificationsList(); }
                    else { this.showNotifOffline(); }
                    lucide.createIcons();
                }, 400);
            },
            showNotifLoading() {
                document.getElementById('notifListState')?.classList.add('hidden');
                document.getElementById('notifLoadingState')?.classList.remove('hidden');
                document.getElementById('notifEmptyState')?.classList.add('hidden');
                document.getElementById('notifErrorState')?.classList.add('hidden');
                document.getElementById('notifOfflineState')?.classList.add('hidden');
                document.getElementById('notifNewState')?.classList.add('hidden');
            },
            showNotifList() {
                document.getElementById('notifListState')?.classList.remove('hidden');
                document.getElementById('notifLoadingState')?.classList.add('hidden');
                document.getElementById('notifEmptyState')?.classList.add('hidden');
                document.getElementById('notifErrorState')?.classList.add('hidden');
                document.getElementById('notifOfflineState')?.classList.add('hidden');
                document.getElementById('notifNewState')?.classList.add('hidden');
            },
            showNotifEmpty() {
                document.getElementById('notifListState')?.classList.add('hidden');
                document.getElementById('notifLoadingState')?.classList.add('hidden');
                document.getElementById('notifEmptyState')?.classList.remove('hidden');
                document.getElementById('notifErrorState')?.classList.add('hidden');
                document.getElementById('notifOfflineState')?.classList.add('hidden');
                document.getElementById('notifNewState')?.classList.add('hidden');
            },
            showNotifError() {
                document.getElementById('notifListState')?.classList.add('hidden');
                document.getElementById('notifLoadingState')?.classList.add('hidden');
                document.getElementById('notifEmptyState')?.classList.add('hidden');
                document.getElementById('notifErrorState')?.classList.remove('hidden');
                document.getElementById('notifOfflineState')?.classList.add('hidden');
                document.getElementById('notifNewState')?.classList.add('hidden');
            },
            showNotifOffline() {
                document.getElementById('notifListState')?.classList.add('hidden');
                document.getElementById('notifLoadingState')?.classList.add('hidden');
                document.getElementById('notifEmptyState')?.classList.add('hidden');
                document.getElementById('notifErrorState')?.classList.add('hidden');
                document.getElementById('notifOfflineState')?.classList.remove('hidden');
                document.getElementById('notifNewState')?.classList.add('hidden');
            },
            showNotifNew() {
                document.getElementById('notifListState')?.classList.add('hidden');
                document.getElementById('notifLoadingState')?.classList.add('hidden');
                document.getElementById('notifEmptyState')?.classList.add('hidden');
                document.getElementById('notifErrorState')?.classList.add('hidden');
                document.getElementById('notifOfflineState')?.classList.add('hidden');
                document.getElementById('notifNewState')?.classList.remove('hidden');
            },

            renderNotificationsList() {
                const notifHex = { urgent: '#EF4444', announcement: '#3B82F6', circular: '#22C55E', update: '#F59E0B', reminder: '#8B5CF6', general: '#64748B' };
                let filtered = notifications.filter(n => !this.isNotifDeleted(n.id) && this._notifOn(n));
                if (this.activeNotifFilter === 'urgent') filtered = filtered.filter(n => n.type === 'urgent');
                else if (this.activeNotifFilter === 'unread') filtered = filtered.filter(n => !n.read);

                const container = document.getElementById('notifListState');
                if (!container) return;
                if (filtered.length === 0) { this.showNotifEmpty(); return; }
                this.showNotifList();

                container.innerHTML = filtered.map(notif => {
                    const typeStyle = notificationTypes[notif.type] || notificationTypes.general;
                    const hex = notifHex[notif.type] || notifHex.general;
                    const id = jsNum(notif.id);
                    return `
                        <div class="ng-sw">
                            <div class="ng-act ng-read"><i data-lucide="check-check"></i><span>تم القراءة</span></div>
                            <div class="ng-act ng-del"><button onclick="event.stopPropagation(); app.deleteNotification(${id})" aria-label="حذف الإشعار"><i data-lucide="trash-2"></i><span>حذف</span></button></div>
                            <div class="ng-card${notif.read ? '' : ' un'}" style="--c:${hex}" onclick="app.ngTap(event, ${id})" ontouchstart="app.ngStart(event)" ontouchmove="app.ngMove(event)" ontouchend="app.ngEnd(event, ${id})" data-ng data-tx="0">
                                <div class="ng-rg"><i><i data-lucide="${typeStyle.icon}"></i></i></div>
                                <div class="ng-tx">
                                    <b>${escapeHtml(notif.title)}</b>
                                    <p>${escapeHtml(notif.description)}</p>
                                </div>
                                <time data-timeago="${id}">${timeAgo(notif.id)}</time>
                            </div>
                        </div>
                    `;
                }).join('') + '<div class="ng-hint">اسحب الإشعار لليمين لتعليمه مقروء، ولليسار للحذف</div>';
                this.updateNotifBadges();
            },

            filterNotifs(filter) {
                this.activeNotifFilter = filter;
                document.querySelectorAll('.notif-tab').forEach(btn => {
                    const btnFilter = btn.dataset.filter;
                    if (btnFilter === filter) {
                        btn.classList.add('bg-primary', 'text-white');
                        btn.classList.remove('theme-transition');
                        btn.style.backgroundColor = '';
                        btn.style.color = '';
                    } else {
                        btn.classList.remove('bg-primary', 'text-white');
                        btn.classList.add('theme-transition');
                        btn.style.backgroundColor = 'var(--input-bg)';
                        btn.style.color = 'var(--text2)';
                    }
                });
                this.renderNotificationsList();
                lucide.createIcons();
            },

            openNotification(id) {
                const notif = notifications.find(n => n.id === id);
                if (!notif) return;
                notif.read = true;
                this.updateNotifBadges();
                const news = newsData.find(n => n.id === id);
                if (news) {
                    this.renderNotificationsList();
                    this.openNews(id);
                } else {
                    this.renderNotificationsList();
                    lucide.createIcons();
                    this.showToast('تم فتح الإشعار');
                }
            },

            deleteNotification(id) {
                this.saveDeletedNotif(id);
                const i = notifications.findIndex(n => n.id === id);
                if (i > -1) notifications.splice(i, 1);
                this.updateNotifBadges();
                this.renderNotificationsList();
                lucide.createIcons();
                this.showToast('تم حذف الإشعار');
            },
            // FIX (UI/UX): a bare, always-red, always-visible "delete all" button paired
            // with a browser confirm() (which people tap through on reflex) made it too easy
            // to wipe every notification by accident. The button is now icon-only and neutral
            // until pressed, and confirmation is an in-app card with a clearly labeled
            // destructive action — a deliberate second tap instead of a dialog nobody reads.
            clearAllNotifications() {
                if (notifications.length === 0) {
                    this.showToast('لا توجد إشعارات');
                    return;
                }
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'حذف جميع الإشعارات';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                content.innerHTML = `
                    <div class="flex flex-col items-center text-center py-2">
                        <div class="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center mb-3">
                            <i data-lucide="trash-2" class="w-7 h-7 text-error"></i>
                        </div>
                        <p class="text-sm mb-5 theme-transition" style="color: var(--text2);">راح تنحذف كل الإشعارات (${notifications.length}) ولا تكدر تسترجعها. متأكد؟</p>
                        <div class="w-full flex gap-2">
                            <button onclick="app.closeWalletModal()" class="flex-1 h-11 rounded-xl font-bold text-sm theme-transition btn-press" style="background-color: var(--input-bg); color: var(--text);">إلغاء</button>
                            <button onclick="app.confirmClearAllNotifications()" class="flex-1 h-11 rounded-xl font-bold text-sm text-white bg-error btn-press">نعم، احذف الكل</button>
                        </div>
                    </div>
                `;
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
            },
            confirmClearAllNotifications() {
                notifications.forEach((n) => this.saveDeletedNotif(n.id));
                notifications.length = 0;
                this.updateNotifBadges();
                this.renderNotificationsList();
                this.closeWalletModal();
                lucide.createIcons();
                this.showToast('تم حذف جميع الإشعارات');
            },

            // glass notification cards: drag right = mark read, drag left = reveal delete
            ngStart(e) {
                const card = e.currentTarget;
                document.querySelectorAll('[data-ng]').forEach((c) => {
                    if (c !== card && parseFloat(c.dataset.tx || '0') !== 0) { c.style.transition = 'transform .2s'; c.style.transform = ''; c.dataset.tx = '0'; }
                });
                const t = e.touches[0];
                this._ng = { x: t.clientX, y: t.clientY, base: parseFloat(card.dataset.tx || '0'), lock: '', moved: false };
                card.style.transition = 'none';
            },
            ngMove(e) {
                const g = this._ng; if (!g) return;
                const card = e.currentTarget, t = e.touches[0];
                const dx0 = t.clientX - g.x, dy0 = t.clientY - g.y;
                if (!g.lock) {
                    if (Math.abs(dx0) < 8 && Math.abs(dy0) < 8) return;
                    g.lock = Math.abs(dx0) > Math.abs(dy0) ? 'x' : 'y';
                }
                if (g.lock !== 'x') return;
                g.moved = true;
                const dx = Math.max(-100, Math.min(130, dx0 + g.base));
                card.style.transform = 'translateX(' + dx + 'px)';
                card.dataset.tx = String(dx);
                const sw = card.parentElement;
                sw.classList.toggle('r', dx > 0);
                sw.classList.toggle('l', dx < 0);
            },
            ngEnd(e, id) {
                const g = this._ng; this._ng = null;
                const card = e.currentTarget;
                const tx = parseFloat(card.dataset.tx || '0');
                card.style.transition = 'transform .2s';
                if (g && g.moved) card.dataset.swiped = String(Date.now());
                if (tx > 70) {
                    card.style.transform = ''; card.dataset.tx = '0';
                    const n = notifications.find(x => x.id === id);
                    if (n && !n.read) { n.read = true; this.updateNotifBadges(); setTimeout(() => { this.renderNotificationsList(); lucide.createIcons(); }, 180); }
                } else if (tx < -50) {
                    card.style.transform = 'translateX(-90px)'; card.dataset.tx = '-90';
                } else {
                    card.style.transform = ''; card.dataset.tx = '0';
                }
            },
            ngTap(e, id) {
                const card = e.currentTarget;
                if (Date.now() - parseInt(card.dataset.swiped || '0', 10) < 400) return;
                if (parseFloat(card.dataset.tx || '0') !== 0) { card.style.transition = 'transform .2s'; card.style.transform = ''; card.dataset.tx = '0'; return; }
                this.openNotification(id);
            },

            // ==================== SWIPE-TO-DELETE (modern apps behavior) ====================
            swipeStart(e, key) {
                document.querySelectorAll('[data-swipe-card]').forEach((c) => {
                    if (c !== e.currentTarget && parseFloat(c.dataset.tx || '0') !== 0) {
                        c.style.transition = 'transform 0.2s ease';
                        c.style.transform = 'translateX(0)';
                        c.dataset.tx = '0';
                        if (c.previousElementSibling) c.previousElementSibling.style.opacity = '0';
                    }
                });
                const card = e.currentTarget;
                this._swipe = { key: key, x: e.touches[0].clientX, base: parseFloat(card.dataset.tx || '0') };
                card.style.transition = 'none';
            },
            swipeMove(e, key) {
                if (!this._swipe || this._swipe.key !== key) return;
                const card = e.currentTarget;
                let dx = e.touches[0].clientX - this._swipe.x + this._swipe.base;
                if (dx > 0) dx = 0;
                if (dx < -130) dx = -130;
                card.style.transform = 'translateX(' + dx + 'px)';
                card.dataset.tx = String(dx);
                if (dx !== 0 && card.previousElementSibling) card.previousElementSibling.style.opacity = '1';
            },
            swipeEnd(e, key) {
                const card = e.currentTarget;
                const tx = parseFloat(card.dataset.tx || '0');
                card.style.transition = 'transform 0.2s ease';
                if (tx < -55) {
                    card.style.transform = 'translateX(-110px)';
                    card.dataset.tx = '-110';
                    if (card.previousElementSibling) card.previousElementSibling.style.opacity = '1';
                } else {
                    card.style.transform = 'translateX(0)';
                    card.dataset.tx = '0';
                    if (card.previousElementSibling) card.previousElementSibling.style.opacity = '0';
                }
                this._swipe = null;
            },
            getDeletedNewsIds() {
                const set = new Set(this._deletedNewsMem || []);
                try {
                    const raw = localStorage.getItem('isp_deleted_news');
                    const arr = raw ? JSON.parse(raw) : [];
                    if (Array.isArray(arr)) arr.forEach((id) => set.add(id));
                } catch (e) {}
                return set;
            },
            markNewsDeleted(id) {
                if (!this._deletedNewsMem) this._deletedNewsMem = new Set();
                this._deletedNewsMem.add(id);
                try {
                    const raw = localStorage.getItem('isp_deleted_news');
                    const arr = raw ? JSON.parse(raw) : [];
                    if (!arr.includes(id)) arr.push(id);
                    localStorage.setItem('isp_deleted_news', JSON.stringify(arr));
                } catch (e) {}
            },
            deleteNewsCard(id) {
                this.markNewsDeleted(id);
                const i = newsData.findIndex(n => n.id === id);
                if (i > -1) newsData.splice(i, 1);
                const ni = notifications.findIndex(n => n.id === id);
                if (ni > -1) notifications.splice(ni, 1);
                this.updateNotifBadges();
                this.renderNews();
                this.renderNewsTicker();
                this.showToast('تم حذف الخبر');
                lucide.createIcons();
            },
            showNewNotifications() {
                notifications.forEach(n => n.read = true);
                this.showNotifList();
                this.renderNotificationsList();
                this.showToast('تم عرض جميع الإشعارات');
                lucide.createIcons();
            },
            updateNotifBadges() {
                const visible = notifications.filter(n => !this.isNotifDeleted(n.id) && this._notifOn(n));
                const unreadCount = visible.filter(n => !n.read).length;
                const urgentCount = visible.filter(n => n.type === 'urgent').length;

                const notifBadge = document.getElementById('notifBadge');
                if (notifBadge) {
                    notifBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
                    notifBadge.textContent = unreadCount;
                }
                // FIX: the profile screen showed hard-coded numbers (1, 3, 12) that never changed.
                ['profileHeaderNotifBadge', 'profileNotifCount'].forEach((badgeId) => {
                    const el = document.getElementById(badgeId);
                    if (!el) return;
                    el.classList.toggle('hidden', unreadCount === 0);
                    el.textContent = unreadCount;
                });
                document.querySelectorAll('.notif-tab').forEach(tab => {
                    const countEl = tab.querySelector('.notif-count');
                    if (!countEl) return;
                    const filter = tab.dataset.filter;
                    if (filter === 'all') countEl.textContent = visible.length;
                    else if (filter === 'urgent') countEl.textContent = urgentCount;
                    else if (filter === 'unread') countEl.textContent = unreadCount;
                });
            },

            // ==================== FIREBASE SYNC ====================
            // FIX: this used to set() the whole users/{uid} record from the local cached
            // copy — including `balance` and `points`. Those two are changed atomically with
            // runTransaction (and `balance` by *other* students' transfers), so any profile
            // edit, streak or study-session sync could overwrite a newer balance with a stale
            // one (lost or duplicated money). Now it's an update() of the profile fields only;
            // the counters are written just once, when the record is first created.
            syncUserToDatabase(options) {
                if (!window.firebaseDb || !this.currentUser) return Promise.resolve(false);
                const includeCounters = !!(options && options.includeCounters);
                const { ref, update, serverTimestamp } = window.firebaseDbHelpers;
                const uid = this.currentUid();
                const payload = {
                    fullName: this.currentUser.fullName || '',
                    governorate: this.currentUser.governorate || '',
                    phone: this.currentUser.phone || '',
                    email: this.currentUser.email || '',
                    avatar: this.currentUser.avatar || '',
                    grade: this.currentUser.grade || 'scientific',
                    weeklyChange: this.currentUser.weeklyChange || 0,
                    studentNumber: this.currentUser.studentNumber || '',
                    studySessions: this.currentUser.studySessions || 0,
                    youtubeStudyCooldownUntil: this.currentUser.youtubeStudyCooldownUntil || 0,
                    loginStreak: this.currentUser.loginStreak || 0,
                    lastLoginDate: this.currentUser.lastLoginDate || '',
                    updatedAt: serverTimestamp()
                };
                // Only for a record that doesn't exist yet: the rules let a new record start at 0.
                if (includeCounters) {
                    payload.points = 0;
                    payload.balance = 0;
                }
                this._pubSync(uid, payload);
                const userWrite = update(ref(window.firebaseDb, 'users/' + uid), payload).then(() => {
                    console.log('User synced to Realtime Database');
                    return true;
                }).catch((err) => {
                    console.warn('Realtime Database sync failed:', err);
                    return false;
                });
                // Points on the leaderboard are written together with users/{uid}/points
                // (addPointsAtomic); here only the profile part, and 0 for a new record.
                const lb = { name: payload.fullName, avatar: this._avatarLite(), grade: payload.grade, weeklyChange: payload.weeklyChange };
                if (includeCounters) lb.points = 0;
                userWrite.then(async (ok) => { if (!ok) return; await this._thumbEnsure(); lb.avatar = this._avatarLite(); return update(ref(window.firebaseDb, 'leaderboard/' + uid), lb); }).catch((err) => {
                    console.warn('Leaderboard sync failed:', err);
                });
                // Phone -> email, so signing in with a phone number doesn't need to read every
                // student's record. Each number can only be claimed by one account.
                const pk = this._phoneKey(payload.phone);
                if (pk && payload.email && window.firebaseAuth && window.firebaseAuth.currentUser) {
                    update(ref(window.firebaseDb, 'phoneIndex/' + pk), { e: payload.email, u: uid }).catch(() => {});
                }
                return userWrite;
            },

            // ===== A small copy of the student's photo for everything public (leaderboard, friends, chats, study room) =====
            // The full photo stays in the student's own record; the copies other students download are ~96 px (about 3 KB),
            // so a list of hundreds of students stays light (the full photos used to travel with every list).
            // a photo copy from a record that may hold an old big one: kept only when it is small
            _liteImg(v) { return this._isDataImg(v) && v.length > 9000 ? '' : (v || ''); },
            _isDataImg(s) { return typeof s === 'string' && s.indexOf('data:image') === 0; },
            async _makeThumb(src, px) {
                const img = new Image(); img.src = src; await img.decode();
                const cv = document.createElement('canvas'); cv.width = cv.height = px || 96;
                const m = Math.min(img.width, img.height), cx = cv.getContext('2d');
                cx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, cv.width, cv.height);
                return cv.toDataURL('image/jpeg', 0.55);
            },
            _avSig(a) { return a.length + ':' + a.slice(-24); },
            // what to put in a public record right now: a web address as it is, a photo as its small copy ('' until it is made)
            _avatarLite() {
                const a = (this.currentUser && this.currentUser.avatar) || '';
                if (!this._isDataImg(a)) return a;
                return this._thumbC && this._thumbC.sig === this._avSig(a) ? this._thumbC.v : '';
            },
            async _thumbEnsure() {
                try {
                    const a = (this.currentUser && this.currentUser.avatar) || '', uid = this.authUid;
                    if (!uid || !this._isDataImg(a)) return;
                    const sig = this._avSig(a);
                    if (!this._thumbC || this._thumbC.sig !== sig) {
                        let c = null; try { c = JSON.parse(localStorage.getItem('isp_thumb:' + uid) || 'null'); } catch (e) {}
                        if (!(c && c.sig === sig && typeof c.v === 'string')) {
                            c = { sig, v: await this._makeThumb(a, 96) };
                            try { localStorage.setItem('isp_thumb:' + uid, JSON.stringify(c)); } catch (e) {}
                        }
                        this._thumbC = c;
                    }
                    // the leaderboard keeps the small copy (older big copies are replaced once)
                    let sent = ''; try { sent = localStorage.getItem('isp_thumb_sent:' + uid) || ''; } catch (e) {}
                    if (sent !== sig && window.firebaseDb) {
                        const { ref, get, set } = window.firebaseDbHelpers;
                        const ex = await get(ref(window.firebaseDb, 'leaderboard/' + uid + '/name'));
                        if (ex.exists()) { await set(ref(window.firebaseDb, 'leaderboard/' + uid + '/avatar'), this._thumbC.v); }
                        try { localStorage.setItem('isp_thumb_sent:' + uid, sig); } catch (e) {}
                    }
                } catch (e) { /* the photo copy is an optimisation: initials show instead */ }
            },

            // phone number -> the account's email, for signing in with a phone. It goes through the Worker (one number per
            // request, rate limited) so the database no longer has to be readable by everyone. If the Worker cannot be
            // reached or is not ready, the old direct read is tried (it works until the database rules close it).
            async _phoneToEmail(pk) {
                const url = this._tutorUrl();
                if (url) {
                    try {
                        const r = await fetch(url + '/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'phonelogin', pk }) });
                        if (r.ok) { const j = await r.json(); return typeof j.e === 'string' ? j.e : null; }
                        if (r.status === 429) throw new Error('slow_down');
                    } catch (e) { if (e && e.message === 'slow_down') throw e; }
                }
                const { ref, get } = window.firebaseDbHelpers;
                const snap = await get(ref(window.firebaseDb, 'phoneIndex/' + pk));
                const v = snap && snap.exists() ? snap.val() : null;
                return v && typeof v.e === 'string' ? v.e : null;
            },
            // Android only: gives the phone app's call screen what it needs to decline a call or see a hang-up while the app is closed
            // (the signed-in student's refresh token, kept in the app's private storage; empty values on sign-out clear it)
            _nativeAuth(user) {
                try {
                    const N = window.IspNative;
                    if (!N || !N.setAuth) return;
                    if (!user) { N.setAuth('', '', '', ''); return; }
                    const o = (window.firebaseAuth && window.firebaseAuth.app && window.firebaseAuth.app.options) || {};
                    const db = o.databaseURL || (o.projectId ? 'https://' + o.projectId + '-default-rtdb.firebaseio.com' : '');
                    N.setAuth(user.uid, user.refreshToken || '', o.apiKey || '', db);
                } catch (e) {}
            },

            _phoneKey(p) {
                const d = String(p || '').replace(/[^0-9]/g, '');
                return d.length >= 7 && d.length <= 20 ? d : '';
            },

            async loadUserFromDatabase(uid) {
                const safeUid = String(uid || this.currentUid() || 'anonymous').replace(/[.#$\[\]]/g, '_');
                if (!window.firebaseDb) {
                    this.saveUserData();
                    this.updateProfileView();
                    return;
                }
                const { ref, get } = window.firebaseDbHelpers;
                if (!(await this._accountGuard(safeUid))) return;
                try {
                    const snap = await get(ref(window.firebaseDb, 'users/' + safeUid));
                    if (snap.exists()) {
                        this.currentUser = { ...this.currentUser, ...snap.val() };
                        this.isLoggedIn = true;
                        this.saveUserData();
                        this._thumbEnsure();
                        this._pubSync(safeUid, this.currentUser);
                    } else {
                        const fu = window.firebaseAuth && window.firebaseAuth.currentUser;
                        if (fu && fu.uid === safeUid && this._googleViaOnly(fu) && !(this.currentUser && this.currentUser.fullName)) { this._authFlowInProgress = true; this._googleProfileSheet(fu); return; }
                        if (!this.currentUser) this.currentUser = {};
                        if (!this.currentUser.studentNumber) {
                            this.currentUser.studentNumber = await this.generateUniqueStudentNumber();
                        }
                        this.syncUserToDatabase({ includeCounters: true });
                    }
                    try {
                        const readSnap = await get(ref(window.firebaseDb, 'userNewsState/' + safeUid + '/readNews'));
                        this.userRead = readSnap.exists() ? readSnap.val() : {};
                        const bmSnap = await get(ref(window.firebaseDb, 'userNewsState/' + safeUid + '/bookmarks'));
                        this.userBookmarks = bmSnap.exists() ? bmSnap.val() : {};
                        const dnSnap = await get(ref(window.firebaseDb, 'userNewsState/' + safeUid + '/deletedNotifs'));
                        this.userDeletedNotifs = dnSnap.exists() ? dnSnap.val() : {};
                        this.applyUserNewsState();
                        this.updateNotifBadges();
                    } catch (stateErr) {
                        console.warn('User news state load failed:', stateErr);
                    }
                    this.updateProfileView();
                    this.listenForOwnUserRecord(); this.listenForMods(); this._npPull();
                    this.initPushNotifications();
                    this.syncNativePush();
                    this.checkDailyStreak();
                    this._ttNudgeSoon();
                    this._smPing();
                    this._restoreChat();
                    this._coachOpen();
                    if (this.currentView === 'tutorView' && this._ttRender) this._ttRender();
                    this._coachTag(this._coachGet().on);
                    this._pnSync();
                    this._prizeListen();
                    if (this._tgPending) { const u = this._tgPending; this._tgPending = null; try { history.replaceState(history.state, '', location.pathname); } catch (e) {} setTimeout(() => { this._need('tgroom').then(() => this.tgGo(u)).catch(() => {}); }, 900); }
                    this._pushReady = true; this._pushRun();
                    if (this._tubePending) { const v = this._tubePending; this._tubePending = null; try { history.replaceState(history.state, '', location.pathname); } catch (e) {} setTimeout(() => { this.goToTube(); this._need('ytube').then(() => this.tuPlay && this.tuPlay(v)).catch(() => {}); }, 900); }
                    this._clRingListen();
                    this.listenForUserTasks();
                    this.listenForUserChats();
                    this.listenForReactions();
                    this.listenForFriends();
                    this.listenForYtInvites(); this.listenForRmInvites(); this.listenForDuelInv();
                    this.listenForFriendRequests();
                    this.listenForSentFriendRequests();
                    this.listenForBlockedUsers();
                    this.setupPresence();
                    this.listenForPresence();
                    this.renderNews();
                    if (this.currentView === 'walletView') { this.renderWalletBalance(); this.renderWalletPoints(); }
                    if (this.currentView === 'leaderboardView') { this.renderLeaderboard(); lucide.createIcons(); }
                } catch (err) {
                    console.warn('Realtime Database read failed:', err);
                    this.saveUserData();
                }
            },

            // ===== Bans and one account per phone =====
            // A ban is on the account (bannedUsers/{uid}) and on the phones it used
            // (bannedDevices/{id}); the phone's id is random and kept in three places (local storage,
            // a cookie and IndexedDB) so clearing one doesn't change it. The first account used on a
            // phone owns it (deviceOwners/{id}); another account can't sign in or sign up there unless
            // the panel frees the phone or switches the rule off (siteConfig/features/oneAccount).
            _devId() {
                if (this._did) return this._did;
                let id = '';
                try { id = localStorage.getItem('isp_did') || ''; } catch (e) {}
                if (!/^[a-z0-9]{16,40}$/.test(id)) { const m = document.cookie.match(/(?:^|; )isp_did=([a-z0-9]{16,40})/); id = m ? m[1] : ''; }
                if (!/^[a-z0-9]{16,40}$/.test(id)) {
                    const b = new Uint8Array(16);
                    (window.crypto || window.msCrypto).getRandomValues(b);
                    id = Array.from(b, (x) => (x % 36).toString(36)).join('') + Date.now().toString(36).slice(-6);
                }
                this._did = id;
                this._devStore(id);
                return id;
            },
            _devStore(id) {
                try { localStorage.setItem('isp_did', id); } catch (e) {}
                try { document.cookie = 'isp_did=' + id + '; max-age=34560000; path=/; SameSite=Lax'; } catch (e) {}
                try {
                    const rq = indexedDB.open('isp-dev', 1);
                    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
                    rq.onsuccess = () => { try { rq.result.transaction('kv', 'readwrite').objectStore('kv').put(id, 'did'); } catch (e) {} };
                } catch (e) {}
            },
            // the id kept in IndexedDB wins when local storage and the cookie were cleared
            _devInit() {
                if (this._devReady) return this._devReady;
                this._devReady = new Promise((resolve) => {
                    let had = '';
                    try { had = localStorage.getItem('isp_did') || ''; } catch (e) {}
                    if (!had) { const m = document.cookie.match(/(?:^|; )isp_did=([a-z0-9]{16,40})/); had = m ? m[1] : ''; }
                    if (/^[a-z0-9]{16,40}$/.test(had)) { this._devId(); resolve(); return; }
                    const done = (v) => { if (/^[a-z0-9]{16,40}$/.test(v || '')) { this._did = v; this._devStore(v); } else this._devId(); resolve(); };
                    try {
                        const rq = indexedDB.open('isp-dev', 1);
                        rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
                        rq.onsuccess = () => {
                            try { const g = rq.result.transaction('kv').objectStore('kv').get('did'); g.onsuccess = () => done(g.result); g.onerror = () => done(''); } catch (e) { done(''); }
                        };
                        rq.onerror = () => done('');
                    } catch (e) { done(''); }
                    setTimeout(() => done(''), 1500);
                });
                return this._devReady;
            },

            // At start: a phone that was banned shows the ban at once (even offline), then the server
            // is asked again, so a ban the panel lifted goes away.
            async _banBoot() {
                let saved = null;
                try { saved = JSON.parse(localStorage.getItem('isp_ban') || 'null'); } catch (e) {}
                if (saved) this._banScreen(saved.r || '', true);
                await this._devInit();
                if (!window.firebaseDb) return;
                try {
                    const { ref, get } = window.firebaseDbHelpers;
                    const d = await get(ref(window.firebaseDb, 'bannedDevices/' + this._devId()));
                    if (d.exists()) { this._banScreen((d.val() || {}).reason || (saved && saved.r) || ''); return; }
                    if (saved) {
                        // the phone isn't banned any more; the account is checked again when it signs in
                        try { localStorage.removeItem('isp_ban'); } catch (e) {}
                        document.getElementById('banWall')?.remove();
                        document.body.classList.remove('is-banned');
                    }
                } catch (e) { /* offline: the saved ban stays */ }
            },

            // Before a new account is made on this phone.
            async _deviceFreeForNewAccount() {
                await this._devInit();
                if (!window.firebaseDb) return true;
                try {
                    const { ref, get } = window.firebaseDbHelpers;
                    const id = this._devId();
                    const [ban, owner] = await Promise.all([get(ref(window.firebaseDb, 'bannedDevices/' + id)), get(ref(window.firebaseDb, 'deviceOwners/' + id))]);
                    if (ban.exists()) { this._banScreen((ban.val() || {}).reason || ''); return false; }
                    const cfg = this.siteConfig || {};
                    if (owner.exists() && !(cfg.features && cfg.features.oneAccount === false)) {
                        this.showToast('هذا الجهاز بيه حساب مسجل من قبل. سجّل دخول بحسابك');
                        this.setAuthMode && this.setAuthMode('login');
                        return false;
                    }
                } catch (e) { /* can't check now: let it through, the sign-in check runs anyway */ }
                return true;
            },

            // After every sign-in (and when a saved session comes back). False = this account
            // can't be used here; it has been signed out.
            async _accountGuard(uid) {
                if (!uid || !window.firebaseDb) return true;
                if (this._guardOk === uid) return true;
                await this._devInit();
                const { ref, get, set, onValue, serverTimestamp } = window.firebaseDbHelpers;
                const db = window.firebaseDb, id = this._devId();
                try {
                    const [ban, dban, owner] = await Promise.all([
                        get(ref(db, 'bannedUsers/' + uid)), get(ref(db, 'bannedDevices/' + id)), get(ref(db, 'deviceOwners/' + id)),
                    ]);
                    if (ban.exists() || dban.exists()) {
                        const reason = ((ban.exists() ? ban.val() : dban.val()) || {}).reason || '';
                        if (ban.exists() && !dban.exists()) await set(ref(db, 'bannedDevices/' + id), { uid, reason: String(reason).slice(0, 200), at: serverTimestamp() }).catch(() => {});
                        this._banScreen(reason);
                        return false;
                    }
                    const cfg = this.siteConfig || {};
                    const one = !(cfg.features && cfg.features.oneAccount === false);
                    if (one && owner.exists() && owner.val() !== uid) {
                        this._signOutHere();
                        this._wall('lock', 'هذا الجهاز مربوط بحساب ثاني', 'كل جهاز يشتغل بيه حساب واحد بس. سجّل دخول بحسابك الأصلي، وإذا تحتاج تغيره تواصل ويا إدارة المنصة.', 'سجّل دخول بحسابي');
                        return false;
                    }
                    if (!owner.exists()) await set(ref(db, 'deviceOwners/' + id), uid).catch(() => {});
                    set(ref(db, 'users/' + uid + '/dev/' + id), serverTimestamp()).catch(() => {});
                } catch (e) {
                    console.warn('Account check failed:', e);
                    return true;
                }
                this._guardOk = uid;
                // a ban from the panel while the app is open takes effect at once
                if (this._banLive) { try { this._banLive(); } catch (e) {} }
                this._banLive = onValue(ref(db, 'bannedUsers/' + uid), async (snap) => {
                    if (!snap.exists()) return;
                    const reason = (snap.val() || {}).reason || '';
                    // the panel usually banned this phone already; if not, the app reports it (before signing out)
                    try {
                        if (!(await get(ref(db, 'bannedDevices/' + id))).exists()) await set(ref(db, 'bannedDevices/' + id), { uid, reason: String(reason).slice(0, 200), at: serverTimestamp() });
                    } catch (e) {}
                    this._banScreen(reason);
                }, () => {});
                return true;
            },
            _signOutHere() {
                this._guardOk = null;
                if (this._banLive) { try { this._banLive(); } catch (e) {} this._banLive = null; }
                this.resetUserScopedListeners();
                this.isLoggedIn = false;
                this.currentUser = null;
                this.authUid = null;
                this._stateLoadedFor = null;
                try { localStorage.removeItem('iraqiStudentUser'); } catch (e) {}
                if (window.firebaseAuth && window.firebaseAuth.currentUser && window.firebaseAuthHelpers) {
                    window.firebaseAuthHelpers.signOut(window.firebaseAuth).catch(() => {});
                }
            },
            // the red screen: no way past it until the panel lifts the ban
            _banScreen(reason, fromSaved) {
                if (!fromSaved) {
                    try { localStorage.setItem('isp_ban', JSON.stringify({ r: String(reason || '').slice(0, 200), at: Date.now() })); } catch (e) {}
                    this._signOutHere();
                }
                this._wall('ban', 'تم حظرك', (reason ? 'السبب: ' + reason + '. ' : '') + 'ما تكدر تستخدم المنصة من هذا الجهاز، ولا تسوي حساب جديد. إذا تشوف إن الحظر غلط تواصل ويا إدارة المنصة.', '', true);
            },
            _wall(icon, title, text, btn, red) {
                document.getElementById('banWall')?.remove();
                const w = document.createElement('div');
                w.id = 'banWall';
                w.className = 'ban-wall' + (red ? ' red' : '');
                w.innerHTML = `<div class="ban-in"><span class="ban-ic"><i data-lucide="${red ? 'shield-ban' : icon}"></i></span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>${btn ? `<button type="button">${escapeHtml(btn)}</button>` : ''}</div>`;
                document.body.appendChild(w);
                if (red) document.body.classList.add('is-banned');
                if (btn) w.querySelector('button').onclick = () => { w.remove(); this.goToAuth('login'); };
                lucide.createIcons();
            },

            // FIX: the admin panel promises a banned student is "logged out automatically",
            // but the ban was only checked once at login — an already-open session kept
            // working. This listens for the student's ban record while they're signed in.
            watchBanStatus(studentNumber) {
                if (!studentNumber || !window.firebaseDb) return;
                if (this._banUnsub) { this._banUnsub(); this._banUnsub = null; }
                const { ref, onValue } = window.firebaseDbHelpers;
                this._banUnsub = onValue(ref(window.firebaseDb, 'bannedStudents/' + studentNumber), (snap) => {
                    if (!snap.exists()) return;
                    if (this._banUnsub) { this._banUnsub(); this._banUnsub = null; }
                    this.checkIfBanned(studentNumber);
                });
            },

            async checkIfBanned(studentNumber) {
                if (!studentNumber || !window.firebaseDb) return false;
                try {
                    const { ref, get } = window.firebaseDbHelpers;
                    const snap = await get(ref(window.firebaseDb, 'bannedStudents/' + studentNumber));
                    if (!snap.exists()) return false;
                    const info = snap.val() || {};
                    this.resetUserScopedListeners();
                    this.isLoggedIn = false;
                    this.currentUser = null;
                    this.authUid = null;
                    localStorage.removeItem('iraqiStudentUser');
                    if (window.firebaseAuth && window.firebaseAuth.currentUser && window.firebaseAuthHelpers) {
                        const { signOut } = window.firebaseAuthHelpers;
                        signOut(window.firebaseAuth).catch((e) => console.warn('Sign out after ban failed:', e));
                    }
                    this.showToast('تم حظرك من المنصة' + (info.reason ? ': ' + info.reason : ''));
                    this.goToAuth('login');
                    return true;
                } catch (err) {
                    console.warn('Ban check failed:', err);
                    return false;
                }
            },

            // FIX: `toISOString().slice(0,10)` always reads the UTC calendar date, not the
            // student's local one. For Iraq (UTC+3) that shifted the "daily" boundary 3 hours
            // before local midnight, so the streak could break or double-count around
            // 00:00–03:00 Baghdad time. Build the date string from local getFullYear/Month/Date
            // instead so the boundary matches the device's actual midnight.
            localDateStr(date) {
                const d = date || new Date();
                const pad = (n) => String(n).padStart(2, '0');
                return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
            },

            checkDailyStreak() {
                if (!this.currentUser) return;
                const todayStr = this.localDateStr();
                const last = this.currentUser.lastLoginDate;
                if (last === todayStr) return;
                let newStreak = 1;
                if (last) {
                    const lastDate = new Date(last + 'T00:00:00');
                    const todayDate = new Date(todayStr + 'T00:00:00');
                    const diffDays = Math.round((todayDate - lastDate) / 86400000);
                    newStreak = diffDays === 1 ? (this.currentUser.loginStreak || 0) + 1 : 1;
                }
                const bonus = 20 + Math.min(newStreak - 1, 10) * 5;
                this.currentUser.loginStreak = newStreak;
                this.currentUser.lastLoginDate = todayStr;
                this.saveUserData();
                this.addPointsAtomic(bonus).then(() => {
                    this.syncUserToDatabase();
                    this.logDailyActivity({ points: bonus });
                    this.showToast('تحدي يومي: يوم ' + newStreak + ' متتالي! +' + bonus + ' نقطة');
                    if (this.currentView === 'walletView') this.renderWalletPoints();
                });
            },

            applyUserNewsState() {
                newsData.forEach((n) => {
                    if (this.userRead && this.userRead[n.id]) n.isRead = true;
                    if (this.userBookmarks && this.userBookmarks[n.id]) n.isBookmarked = true;
                });
            },

            saveReadState(id) {
                if (this.userRead) this.userRead[id] = true;
                if (!window.firebaseDb || !this.authUid) return;
                const { ref, set } = window.firebaseDbHelpers;
                set(ref(window.firebaseDb, 'userNewsState/' + this.authUid + '/readNews/' + id), true).catch((err) => {
                    console.warn('Save read state failed:', err);
                });
            },

            isNotifDeleted(id) {
                if (!this._deletedNotifsMem) {
                    this._deletedNotifsMem = new Set();
                    try {
                        const raw = localStorage.getItem('isp_deleted_notifs');
                        const arr = raw ? JSON.parse(raw) : [];
                        if (Array.isArray(arr)) arr.forEach((x) => this._deletedNotifsMem.add(x));
                    } catch (e) {}
                }
                if (this._deletedNotifsMem.has(id)) return true;
                return !!(this.userDeletedNotifs && this.userDeletedNotifs[id]);
            },

            saveDeletedNotif(id) {
                if (!this._deletedNotifsMem) this._deletedNotifsMem = new Set();
                this._deletedNotifsMem.add(id);
                if (!this.userDeletedNotifs) this.userDeletedNotifs = {};
                this.userDeletedNotifs[id] = true;
                try {
                    const raw = localStorage.getItem('isp_deleted_notifs');
                    const arr = raw ? JSON.parse(raw) : [];
                    if (!arr.includes(id)) {
                        arr.push(id);
                        localStorage.setItem('isp_deleted_notifs', JSON.stringify(arr));
                    }
                } catch (e) {}
                if (!window.firebaseDb || !this.authUid) return;
                const { ref, set } = window.firebaseDbHelpers;
                set(ref(window.firebaseDb, 'userNewsState/' + this.authUid + '/deletedNotifs/' + id), true).catch((err) => {
                    console.warn('Save deleted notification failed:', err);
                });
            },

            saveBookmarkState(id, bookmarked) {
                if (!this.userBookmarks) this.userBookmarks = {};
                if (bookmarked) this.userBookmarks[id] = true;
                else delete this.userBookmarks[id];
                if (!window.firebaseDb || !this.authUid) return;
                const { ref, set } = window.firebaseDbHelpers;
                set(ref(window.firebaseDb, 'userNewsState/' + this.authUid + '/bookmarks/' + id), bookmarked ? true : null).catch((err) => {
                    console.warn('Save bookmark state failed:', err);
                });
            },

            // ==================== NEWS PUSH NOTIFICATIONS ====================
            playNotifySound() {
                try {
                    const AudioCtx = window.AudioContext || window.webkitAudioContext;
                    if (!AudioCtx) return;
                    const ctx = new AudioCtx();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(880, ctx.currentTime);
                    gain.gain.setValueAtTime(0.08, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.4);
                    setTimeout(() => { ctx.close(); }, 600);
                } catch (e) {
                    console.warn('Notify sound failed:', e);
                }
            },

            // Retry / back online: listen again (only what is new is asked for).
            loadNewsFromDatabase() {
                if (!window.firebaseDb) return;
                if (this._newsListener) { try { this._newsListener(); } catch (e) {} this._newsListener = null; }
                this.listenForNews();
            },

            // FIX: the previous "is this item new" check was `seenIds.size > 0` inside the
            // forEach that first populates `seenIds`. On the very first snapshot (initial page
            // load) with 2+ existing news items that condition is true for every item after the
            // first, and each one overwrites `newItem` in turn — so it ends up pointing at the
            // OLDEST item in the initial batch, which then fires a spurious "new news" sound/
            // toast/notification for an article that isn't new at all. Fixed by tracking a
            // separate `isFirstSnapshot` flag: nothing is treated as "new" during the very
            // first callback, only on snapshots after that (and only the single newest id that
            // wasn't seen before).
            // News the panel scheduled for later (publishAt) or aimed at some governorates only (govs): a student sees them
            // only when the time has come and only if their governorate is listed. Scheduled ones wait in _newsPend.
            // (until the student's governorate is known nothing is hidden; the tick below removes what is aimed elsewhere once it is)
            _newsAimed(n) { const g = this._dsGov(); return !g || !(Array.isArray(n.govs) && n.govs.length && n.govs.indexOf(g) === -1); },
            _newsReady(n) { return !(Number(n.publishAt) > Date.now()); },
            _newsPendTick() {
                // news aimed at other governorates that came in before the governorate was known
                if (this._dsGov()) {
                    const off = newsData.filter((n) => !this._newsAimed(n));
                    if (off.length) {
                        off.forEach((n) => { const i = newsData.indexOf(n); if (i > -1) newsData.splice(i, 1); });
                        newsStore.remove(off.map((n) => n.id));
                        this.renderNews(); this.renderNewsTicker();
                    }
                }
                // scheduled in-app notifications whose time has come
                const np = this._notifPend;
                if (np && np.length) {
                    const due = np.filter((x) => !(Number(x.publishAt) > Date.now()));
                    if (due.length) {
                        this._notifPend = np.filter((x) => Number(x.publishAt) > Date.now());
                        due.forEach((val) => {
                            if (this.isNotifDeleted(val.id) || notifications.some((n) => n.id === val.id)) return;
                            notifications.unshift({ id: val.id, title: val.title, description: val.description || '', time: 'الآن', read: false, type: val.type || 'announcement', src: val.src || '' });
                            if (this._notifOn(val)) { this.playNotifySound(); this._heads(val.title, val.description, () => this.goToNotifications()); }
                        });
                        this.updateNotifBadges();
                        if (this.currentView === 'notificationsView') this.renderNotificationsList();
                    }
                }
                const p = this._newsPend; if (!p || !p.length) return;
                const ready = p.filter((n) => this._newsReady(n));
                if (!ready.length) return;
                this._newsPend = p.filter((n) => !this._newsReady(n));
                ready.forEach((item) => { if (!newsData.some((n) => n.id === item.id)) newsData.push(item); });
                newsData.sort((a, b) => b.id - a.id);
                newsStore.put(ready);
                this.applyUserNewsState(); this.renderNews(); this.renderNewsTicker();
                const top = ready[0];
                if (top && !top.notifHandled && !notifications.some((n) => n.id === top.id) && !this.isNotifDeleted(top.id)) {
                    notifications.unshift({ id: top.id, title: top.title, description: top.excerpt || '', time: 'الآن', read: false, type: top.isUrgent ? 'urgent' : 'announcement', src: top.auto ? 'tg' : '' });
                    this.updateNotifBadges(); this.showToast('خبر جديد: ' + top.title);
                }
                if (this.currentView === 'notificationsView') this.renderNotificationsList();
                try { lucide.createIcons(); } catch (e) {}
            },

            listenForNews() {
                if (!window.firebaseDb || this._newsListener) return;
                // the saved copy is read first, so that only what is new is downloaded
                if (!this._newsBootDone) { if (this._newsBootP) this._newsBootP.then(() => this.listenForNews()); return; }
                const { ref, onValue, query, orderByKey, limitToLast, startAt } = window.firebaseDbHelpers;
                const known = newsData.map((n) => n.id).filter((id) => Number.isFinite(id));
                const maxId = known.length ? Math.max(...known) : 0;
                const base = ref(window.firebaseDb, 'news');
                // returning student: only news newer than the newest they already have; first time: the newest page
                const q = maxId ? query(base, orderByKey(), startAt(String(maxId + 1))) : query(base, orderByKey(), limitToLast(this.NEWS_PAGE));
                const seenIds = new Set(known);
                let isFirstSnapshot = true, windowStart = maxId + 1;
                this._newsWatch();
                this._newsListener = onValue(q, (snap) => {
                    this._newsGot = true;
                    const rawList = snap.exists() ? withNumericIds(Object.values(snap.val())) : [];
                    // aimed at other governorates: never shown; scheduled for later: kept aside until its time
                    const aimed = rawList.filter((n) => this._newsAimed(n));
                    this._newsPend = (this._newsPend || []).filter((n) => !aimed.some((a) => a.id === n.id)).concat(aimed.filter((n) => !this._newsReady(n)));
                    const list = aimed.filter((n) => this._newsReady(n));
                    list.sort((a, b) => b.id - a.id);
                    if (!maxId && isFirstSnapshot) windowStart = list.length ? list[list.length - 1].id : Infinity;
                    let newItem = null;
                    if (!isFirstSnapshot) {
                        newItem = list.find((item) => !seenIds.has(item.id)) || null;
                    }
                    list.forEach((item) => seenIds.add(item.id));
                    isFirstSnapshot = false;
                    const deletedIds = this.getDeletedNewsIds();
                    const present = new Set(rawList.map((n) => n.id));
                    const changed = [];
                    list.forEach((item) => {
                        if (deletedIds.has(item.id)) return;
                        const old = newsData.find((n) => n.id === item.id);
                        if (old) Object.assign(old, item); else newsData.push(item);
                        changed.push(item);
                    });
                    // news inside the window that the admin removed
                    const gone = newsData.filter((n) => n.id >= windowStart && (!present.has(n.id) || !aimed.some((a) => a.id === n.id)));
                    gone.forEach((n) => { const i = newsData.indexOf(n); if (i > -1) newsData.splice(i, 1); });
                    newsData.sort((a, b) => b.id - a.id);
                    newsStore.put(changed);
                    newsStore.remove(gone.map((n) => n.id));
                    this.applyUserNewsState();
                    this.renderNews();
                    this.renderNewsTicker();
                    clearTimeout(this._nt); this._nt = setTimeout(() => this._newsPendTick(), 3000); // by then the governorate is usually known
                    if (newItem) {
                        if (!newItem.notifHandled && !notifications.some(n => n.id === newItem.id) && !this.isNotifDeleted(newItem.id)) {
                            notifications.unshift({
                                id: newItem.id,
                                title: newItem.title,
                                description: newItem.excerpt || '',
                                time: 'الآن',
                                read: false,
                                type: newItem.isUrgent ? 'urgent' : 'announcement',
                                src: newItem.auto ? 'tg' : ''
                            });
                            this.updateNotifBadges();
                            this.playNotifySound();
                            this.showToast('خبر جديد: ' + newItem.title);
                            if (this.currentView === 'notificationsView') this.renderNotificationsList();
                        } else {
                            this.updateNotifBadges();
                        }
                    }
                    if (this.currentView === 'homeView' || this.currentView === 'notificationsView') lucide.createIcons();
                });
            },

            // FIX: same "is this new" bug as listenForNews() — fixed the same way.
            listenForResources() {
                if (!window.firebaseDb || this._resListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                const seenIds = new Set();
                let isFirstSnapshot = true;
                this._resListener = onValue(ref(window.firebaseDb, 'resources'), (snap) => {
                    const list = snap.exists() ? withNumericIds(Object.values(snap.val())) : [];
                    list.sort((a, b) => b.id - a.id);
                    let newItem = null;
                    if (!isFirstSnapshot) {
                        newItem = list.find((item) => !seenIds.has(item.id)) || null;
                    }
                    list.forEach((item) => seenIds.add(item.id));
                    isFirstSnapshot = false;
                    resourcesData.length = 0;
                    resourcesData.push(...list);
                    if (newItem) {
                        this.playNotifySound();
                        this.showToast('ملزمة جديدة: ' + newItem.title);
                    }
                    if (this.currentView === 'resourcesView' || this.currentView === 'resourceDetailView') { this.renderResourcesList(); lucide.createIcons(); }
                });
            },

            // FIX: onChildAdded fires once for every existing child on initial attach (not
            // just for genuinely new ones), and the old `seenIds.size > 0` check treated every
            // pre-existing notification after the first as "new" — so opening the app with, say,
            // 5 admin notifications already in the database used to fire a toast + sound for
            // notifications #2 through #5 on startup. An explicit `isFirstBatch` flag (cleared
            // shortly after the listener attaches, once the initial synchronous flush of
            // existing children has had a chance to run) now suppresses all of that.
            // FIX (again): the setTimeout(0) above never worked — existing children reach
            // onChildAdded asynchronously from the network, long after a 0ms timer fires, so
            // every existing notification still toasted + beeped on every app start. The
            // ids that already exist are now read once with get() before listening; only
            // ids missing from that snapshot count as new.
            listenForAdminNotifications() {
                if (!window.firebaseDb || this._adminNotifListener) return;
                this._adminNotifListener = true;
                const { ref, get, onChildAdded } = window.firebaseDbHelpers;
                const seenIds = new Set();
                const { query, orderByKey, limitToLast } = window.firebaseDbHelpers;
                // the newest ones only (the whole history used to come down at every start)
                const notifRef = query(ref(window.firebaseDb, 'notifications'), orderByKey(), limitToLast(60));
                get(notifRef).then((snap) => {
                    if (snap.exists()) Object.values(snap.val()).forEach((v) => { if (v) seenIds.add(Number(v.id)); });
                }).catch(() => {}).then(() => {
                this._adminNotifListener = onChildAdded(notifRef, (snap) => {
                    const raw = snap.val();
                    if (!raw || !Number.isFinite(Number(raw.id))) return;
                    if (Array.isArray(raw.govs) && raw.govs.length && raw.govs.indexOf(this._dsGov()) === -1) return;
                    if (Number(raw.publishAt) > Date.now()) { this._notifPend = this._notifPend || []; if (!this._notifPend.some((x) => x.id === Number(raw.id))) this._notifPend.push({ ...raw, id: Number(raw.id) }); return; }
                    const val = { ...raw, id: Number(raw.id) };
                    const isNew = !seenIds.has(val.id);
                    seenIds.add(val.id);
                    if (this.isNotifDeleted(val.id)) return;
                    if (!notifications.some(n => n.id === val.id)) {
                        notifications.unshift({
                            id: val.id,
                            title: val.title,
                            description: val.description || '',
                            time: val.time || 'الآن',
                            read: false,
                            type: val.type || 'announcement',
                            src: val.src || ''
                        });
                    }
                    if (!isNew) {
                        this.updateNotifBadges();
                        lucide.createIcons();
                        return;
                    }
                    this.updateNotifBadges();
                    if (this._notifOn(val)) {
                        this.playNotifySound();
                        this._heads(val.title, val.description, () => this.goToNotifications());
                        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                            try { new Notification(val.title, { body: val.description || '', icon: 'icons/icon-192.png' }); } catch (e) { /* not allowed outside a service worker */ }
                        }
                    }
                    if (raw.govs) { this.renderDayStatus(); this.updateHolidayNavDot(); }
                    if (this.currentView === 'notificationsView') this.renderNotificationsList();
                    lucide.createIcons();
                });
                });
            },

            // ==================== SITE CONFIG (from admin dashboard) ====================
            // Everything under `siteConfig` in the database is written by the admin
            // dashboard. Missing keys mean "leave as default", so a fresh database
            // shows the site exactly as before.
            listenForSiteConfig() {
                try {
                    const cached = JSON.parse(localStorage.getItem('isp_site_config') || 'null');
                    if (cached) this.applySiteConfig(cached);
                } catch (e) {}
                if (!window.firebaseDb || this._siteCfgListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._siteCfgListener = onValue(ref(window.firebaseDb, 'siteConfig'), (snap) => {
                    const cfg = snap.exists() ? snap.val() : {};
                    try { localStorage.setItem('isp_site_config', JSON.stringify(cfg)); } catch (e) {}
                    this._siteCfgLive = true;
                    this.applySiteConfig(cfg);
                });
            },

            applySiteConfig(cfg) {
                cfg = cfg || {};
                this.siteConfig = cfg;
                if (this.currentView === 'tutorView' && this._ttRender) this._ttRender();
                this._ttNudgeSoon();
                const on = (group, key) => !(cfg[group] && cfg[group][key] === false);
                const $ = (id) => document.getElementById(id);

                // Home sections
                const sections = { search: 'searchSection', categories: 'categoriesSection', carousel: 'carouselSection', ticker: 'tickerSection', dateStrip: 'dateStripSection', examCountdown: 'examCountdownSection', dailyTip: 'dailyTipSection' };
                Object.keys(sections).forEach(k => $(sections[k])?.classList.toggle('cfg-off', !on('sections', k)));

                // Pages the panel can switch off for everyone (siteConfig/features/<name> = false)
                this._MORE_ALL = this._MORE_ALL || this.MORE_ITEMS;
                this._moreFeat = (x) => !x.feat || on('features', x.feat);
                this._moreRefilter();
                this.renderPollCard(); this.renderInviteBanner(); this._promoSoon();
                if (this.currentView === 'authView') this.setAuthMode(this.authMode || 'login');
                if (this.currentView === 'dhikrView' && !on('features', 'dhikr')) this.setTab('home');

                // Bottom navigation
                ['resources', 'holidays', 'store', 'leaderboard', 'wallet', 'messages'].forEach(k => {
                    document.querySelector(`#bottomNav .nav-item[data-tab="${k}"]`)?.classList.toggle('cfg-off', !on('nav', k));
                });
                window.dispatchEvent(new Event('resize')); // re-seat the nav indicator

                // Branding
                const b = cfg.branding || {};
                if ($('appTitle')) $('appTitle').textContent = (b.name || '').trim() || 'أكـادمي السادس';
                if ($('appTagline')) $('appTagline').textContent = (b.tagline || '').trim() || 'أخبار وزارة التربية أولاً بأول';
                document.title = (b.name || '').trim() || document.title;

                // Announcement banner (dismissal is remembered per text)
                const a = cfg.announcement || {};
                const aText = String(a.text || '').trim();
                const aKey = 'isp_announce_closed';
                let closed = '';
                try { closed = localStorage.getItem(aKey) || ''; } catch (e) {}
                const showA = !!a.enabled && !!aText && closed !== aText;
                $('announceSection')?.classList.toggle('hidden', !showA);
                if (showA) {
                    $('siteAnnounce').dataset.tone = ['info', 'warn', 'alert'].includes(a.tone) ? a.tone : 'info';
                    $('siteAnnounceText').textContent = aText;
                    $('siteAnnounceClose').onclick = () => {
                        try { localStorage.setItem(aKey, aText); } catch (e) {}
                        $('announceSection').classList.add('hidden');
                    };
                }

                // Maintenance mode
                this._mtApply(cfg.maintenance || {});

                // Ticker settings
                const t = cfg.ticker || {};
                if ($('tkLabel')) $('tkLabel').textContent = (t.label || '').trim() || 'عاجل';
                if (this._tk) this._tk.key = ''; // force the marquee to pick up new speed/label settings
                this.renderNewsTicker();
            },

            // ===== Maintenance screen (the admin's switch: siteConfig/maintenance = {enabled, title, message, until}) =====
            // An apology with gears that turn, a wrench that swings and stars that drift. Touching it makes sparks and speeds the gears up for a moment;
            // an optional "back at" time shows a live countdown. ?mtpreview=1 shows it without the switch (the panel's preview button).
            _mtApply(m) {
                const mt = document.getElementById('maintenanceOverlay'); if (!mt) return;
                const preview = /[?&]mtpreview=1\b/.test(location.search);
                const on = !!m.enabled || preview;
                const was = !mt.classList.contains('hidden');
                mt.classList.toggle('hidden', !on);
                const t = document.getElementById('mtTitle'), g = document.getElementById('mtMsg');
                if (t) t.textContent = (m.title || '').trim() || 'المنصة تحت الصيانة';
                if (g) g.textContent = (m.message || '').trim() || 'نعمل على تحسين المنصة، ونرجع لكم قريباً. نعتذر عن أي إزعاج، ونشكر صبركم.';
                this._mtUntil = Number(m.until) > Date.now() - 86400000 ? Number(m.until) : 0;
                if (on && !was) this._mtStart(); else if (!on && was) this._mtStop();
                if (on) this._mtClock();
            },
            _mtStart() {
                const mt = document.getElementById('maintenanceOverlay'); if (!mt) return;
                if (!this._mtBuilt) this._mtBuild();
                this._mtTaps = 0; this._mtSpd = 1; mt.style.setProperty('--spd', 1);
                const hint = document.getElementById('mtHint'); if (hint) hint.textContent = 'المس الدواليب وساعدنا نخلّص أسرع';
                this._mtStopped = false;
                const cv = document.getElementById('mtFx');
                this._mtParts = []; this._mtFit();
                const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
                const loop = (ts) => {
                    if (this._mtStopped) return;
                    this._mtRaf = requestAnimationFrame(loop);
                    if (document.hidden || !cv) return;
                    const c = cv.getContext('2d'), w = cv.width, h = cv.height; c.clearRect(0, 0, w, h);
                    const P = this._mtParts;
                    for (let i = P.length - 1; i >= 0; i--) {
                        const p = P[i]; p.life -= 1; p.x += p.vx; p.y += p.vy; p.vy += p.g;
                        if (p.life <= 0) { P.splice(i, 1); continue; }
                        c.globalAlpha = Math.max(0, p.life / p.max); c.fillStyle = p.c;
                        c.beginPath(); c.arc(p.x, p.y, p.r * (0.4 + 0.6 * p.life / p.max), 0, 6.283); c.fill();
                    }
                    c.globalAlpha = 1;
                    // calm the gears down again after a touch
                    if (this._mtSpd > 1) { this._mtSpd = Math.max(1, this._mtSpd - 0.012); mt.style.setProperty('--spd', this._mtSpd.toFixed(2)); }
                };
                if (!calm) this._mtRaf = requestAnimationFrame(loop);
                this._mtOnResize = () => this._mtFit(); window.addEventListener('resize', this._mtOnResize);
                this._mtTick = setInterval(() => this._mtClock(), 1000);
                // touching anywhere: sparks; touching a gear: the gears speed up
                this._mtDown = (e) => {
                    if (e.target.closest && e.target.closest('.mt-retry')) return;
                    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
                    this._mtBurst((e.clientX - r.left) * k, (e.clientY - r.top) * k, e.target.closest && e.target.closest('.mt-gear') ? 22 : 8);
                    if (e.target.closest && e.target.closest('.mt-gear')) this._mtTurbo();
                };
                this._mtMove = (e) => { mt.style.setProperty('--px', ((e.clientX / innerWidth) - 0.5).toFixed(3)); mt.style.setProperty('--py', ((e.clientY / innerHeight) - 0.5).toFixed(3)); };
                mt.addEventListener('pointerdown', this._mtDown); mt.addEventListener('pointermove', this._mtMove);
            },
            _mtStop() {
                this._mtStopped = true; cancelAnimationFrame(this._mtRaf); clearInterval(this._mtTick);
                const mt = document.getElementById('maintenanceOverlay');
                if (mt) { mt.removeEventListener('pointerdown', this._mtDown); mt.removeEventListener('pointermove', this._mtMove); }
                window.removeEventListener('resize', this._mtOnResize);
            },
            _mtFit() { const cv = document.getElementById('mtFx'); if (!cv) return; const d = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(innerWidth * d); cv.height = Math.round(innerHeight * d); this._mtD = d; },
            _mtBurst(x, y, n) {
                const cols = ['#fde68a', '#34d399', '#fb7185', '#60a5fa', '#fff'], d = this._mtD || 1, P = this._mtParts || (this._mtParts = []);
                for (let i = 0; i < n && P.length < 220; i++) { const a = Math.random() * 6.283, v = (1 + Math.random() * 3.6) * d; P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2 * d, g: 0.09 * d, r: (1.6 + Math.random() * 2.6) * d, c: cols[(Math.random() * cols.length) | 0], life: 38 + (Math.random() * 30 | 0), max: 68 }); }
            },
            _mtTurbo() {
                this._mtTaps = (this._mtTaps || 0) + 1; this._mtSpd = Math.min(7, (this._mtSpd || 1) + 1.1);
                try { navigator.vibrate && navigator.vibrate(12); } catch (e) {}
                const hint = document.getElementById('mtHint'); if (!hint) return;
                const n = this._mtTaps;
                hint.textContent = n >= 30 ? 'صرت مهندس صيانة فخري عندنا' : n >= 15 ? 'ما شاء الله، شغلك أسرع من الفريق كله' : n >= 6 ? 'كمل! الدواليب تدور أسرع بسببك' : 'شكراً، ساعدتنا نخلّص أسرع';
            },
            _mtClock() {
                const box = document.getElementById('mtEta'), clk = document.getElementById('mtClock'), retry = document.getElementById('mtRetry'); if (!box || !clk) return;
                const left = (this._mtUntil || 0) - Date.now();
                if (!this._mtUntil) { box.classList.add('hidden'); if (retry) retry.classList.remove('glow'); return; }
                box.classList.remove('hidden');
                const lbl = document.getElementById('mtEtaLbl');
                if (left > 0) {
                    const s = Math.floor(left / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60, p = (n) => String(n).padStart(2, '0');
                    clk.textContent = p(h) + ':' + p(m) + ':' + p(x); if (lbl) lbl.textContent = 'نرجع لكم بعد';
                    if (retry) retry.classList.remove('glow');
                } else { clk.textContent = 'قريباً'; if (lbl) lbl.textContent = 'اقتربنا من الانتهاء'; if (retry) retry.classList.add('glow'); }
            },
            mtRetry() { const b = document.getElementById('mtRetry'); if (b) { b.disabled = true; b.textContent = 'جاري التحقق...'; } setTimeout(() => location.reload(), 500); },
            // the scene: three meshing gears, a wrench and a few sparkles (built once)
            _mtBuild() {
                this._mtBuilt = true;
                const sc = document.getElementById('mtScene'), st = document.querySelector('#maintenanceOverlay .mt-stars'); if (!sc) return;
                const gear = (cx, cy, n, ro, ri, hole, fill, rev, t, id) => {
                    let d = ''; const step = 6.283185 / n;
                    for (let i = 0; i < n; i++) { const a = i * step, f = (x) => x.toFixed(1); const p = (r, o) => [f(cx + r * Math.cos(a + o * step)), f(cy + r * Math.sin(a + o * step))]; const pts = [p(ri, 0), p(ro, 0.18), p(ro, 0.42), p(ri, 0.6)]; d += (i ? 'L' : 'M') + pts[0].join(' ') + 'L' + pts[1].join(' ') + 'L' + pts[2].join(' ') + 'L' + pts[3].join(' '); }
                    return `<g class="mt-gear${rev ? ' rev' : ''}" style="--t:${t}s" id="${id}"><path d="${d}Z" fill="${fill}" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-linejoin="round"/><circle cx="${cx}" cy="${cy}" r="${hole}" fill="#061d22" stroke="rgba(255,255,255,.4)" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${hole * 0.4}" fill="rgba(255,255,255,.55)"/></g>`;
                };
                sc.innerHTML = `<svg viewBox="0 0 300 210" role="img" aria-label="دواليب صيانة تدور"><defs><linearGradient id="mtg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#0d9488"/></linearGradient><linearGradient id="mtg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient><linearGradient id="mtg3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#93c5fd"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>
                    ${gear(110, 105, 12, 62, 50, 16, 'url(#mtg1)', false, 9, 'mtG1')}${gear(196, 70, 9, 42, 33, 11, 'url(#mtg2)', true, 6.75, 'mtG2')}${gear(188, 152, 8, 36, 28, 10, 'url(#mtg3)', true, 6, 'mtG3')}
                    <g class="mt-wrench"><path d="M240 196 L262 174 a22 22 0 0 0 -3 -30 l-13 13 -9 -3 -3 -9 13 -13 a22 22 0 0 0 -30 3 22 22 0 0 0 5 25 l-24 24 a8 8 0 0 0 11 11 l24 -24 a22 22 0 0 0 24 -2" transform="translate(-14 -6) scale(.8)" fill="#e2e8f0" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></g>
                    <g fill="#fde68a"><path class="mt-spark" style="animation-delay:.2s" d="M60 30 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z"/><path class="mt-spark" style="animation-delay:.9s" d="M248 24 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"/><path class="mt-spark" style="animation-delay:1.3s" d="M26 160 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"/></g></svg>`;
                if (st) { let h = ''; for (let i = 0; i < 26; i++) h += `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;animation-delay:${(Math.random() * 4).toFixed(2)}s;animation-duration:${(3 + Math.random() * 3).toFixed(1)}s;transform:scale(${(0.6 + Math.random()).toFixed(2)})"></i>`; st.innerHTML = h; }
            },

            // ===== Voice note from the admin (بصمة صوتية), shown under the news ticker =====
            // voiceNote = {id, title, dur, peaks[], mime, at}; the audio itself (a base64 data URL)
            // is in voiceNoteAudio/{id}, fetched in the background as soon as the note appears and
            // kept in the browser cache, so the play button answers at once. Plays and full
            // listens are counted in voiceNoteStats/{id}, and signed-in listeners in voiceListeners.
            listenForVoiceNote() {
                if (!window.firebaseDb || this._vnListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._vnListener = onValue(ref(window.firebaseDb, 'voiceNote'), (snap) => {
                    const v = snap.val();
                    const note = v && v.id && v.dur ? v : null;
                    if (this._vn && (!note || note.id !== this._vn.id)) this._vnStop(true);
                    this._vn = note ? Object.assign({}, note, { peaks: Array.isArray(note.peaks) ? note.peaks : [] }) : null;
                    this._vnRender();
                    if (note) this._vnPrefetch(note);
                    else this._vnCacheClear();
                }, () => {});
            },

            async _vnPrefetch(note) {
                if (this._vnSrc && this._vnSrc.id === note.id) return;
                const key = '/voice-note/' + note.id;
                let blob = null;
                try {
                    if (window.caches) { const c = await caches.open('isp-voice'); const hit = await c.match(key); if (hit) blob = await hit.blob(); }
                } catch (e) {}
                if (!blob) {
                    try {
                        const { ref, get } = window.firebaseDbHelpers;
                        const snap = await get(ref(window.firebaseDb, 'voiceNoteAudio/' + note.id));
                        const data = String(snap.val() || '');
                        const m = data.match(/^data:(audio\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i);
                        if (!m) return;
                        const bin = atob(m[2]), buf = new Uint8Array(bin.length);
                        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
                        blob = new Blob([buf], { type: m[1] });
                        try { if (window.caches) { const c = await caches.open('isp-voice'); await c.put(key, new Response(blob, { headers: { 'Content-Type': m[1] } })); } } catch (e) {}
                    } catch (e) { console.warn('voice note download failed', e); return; }
                }
                if (!this._vn || this._vn.id !== note.id) return;
                if (this._vnSrc) URL.revokeObjectURL(this._vnSrc.url);
                this._vnSrc = { id: note.id, url: URL.createObjectURL(blob) };
                const a = this._vnAudio || (this._vnAudio = new Audio());
                a.preload = 'auto';
                a.src = this._vnSrc.url;
                a.load();
                a.ontimeupdate = () => this._vnTick();
                a.onended = () => { this._vnTick(true); this._vnStop(); };
                this._vnRender();
            },

            _vnCacheClear() {
                try { if (window.caches) caches.delete('isp-voice'); } catch (e) {}
            },

            _vnRender() {
                const sec = document.getElementById('voiceSection'), card = document.getElementById('vnCard'), n = this._vn;
                if (!sec || !card) return;
                sec.classList.toggle('hidden', !n);
                if (!n) { card.innerHTML = ''; return; }
                let heard = {};
                try { heard = JSON.parse(localStorage.getItem('isp_vn_heard') || '{}') || {}; } catch (e) {}
                const ready = this._vnSrc && this._vnSrc.id === n.id, playing = this._vnAudio && !this._vnAudio.paused && ready;
                const peaks = n.peaks.length ? n.peaks : Array.from({ length: 40 }, () => 0.4);
                const fmt = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
                card.classList.toggle('new', !heard[n.id]);
                card.classList.toggle('playing', !!playing);
                card.innerHTML = `
                    <button class="vn-play btn-press" onclick="app.vnToggle()" aria-label="${playing ? 'إيقاف' : 'تشغيل'}" ${ready ? '' : 'data-wait="1"'}>
                        ${ready ? (playing ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>' : '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>') : '<span class="vn-spin"></span>'}
                    </button>
                    <div class="vn-body">
                        <div class="vn-top"><b>${escapeHtml(n.title || 'بصمة صوتية من الإدارة')}</b>${heard[n.id] ? '' : '<em>جديد</em>'}</div>
                        <div class="vn-wave" onclick="app.vnSeek(event)">${peaks.map((p, i) => `<i style="height:${Math.round(18 + Math.max(0, Math.min(1, p)) * 82)}%" data-i="${i}"></i>`).join('')}</div>
                        <div class="vn-foot"><span id="vnTime">${fmt(this._vnAudio && ready ? this._vnAudio.currentTime : 0)} / ${fmt(n.dur)}</span><button class="vn-rate" onclick="app.vnRate()">${(this._vnRateV || 1)}x</button></div>
                    </div>`;
                this._vnTick();
            },

            vnToggle() {
                const n = this._vn, a = this._vnAudio;
                if (!n) return;
                if (!this._vnSrc || this._vnSrc.id !== n.id || !a) { this.showToast('دا تتحمل البصمة، ثواني'); this._vnPrefetch(n); return; }
                if (!a.paused) { a.pause(); this._vnRender(); return; }
                a.playbackRate = this._vnRateV || 1;
                a.play().then(() => {
                    this._vnRender();
                    this._vnCount('plays');
                }).catch(() => this.showToast('ما اشتغلت البصمة، حاول مرة ثانية'));
            },
            vnRate() {
                const r = [1, 1.5, 2], i = r.indexOf(this._vnRateV || 1);
                this._vnRateV = r[(i + 1) % r.length];
                if (this._vnAudio) this._vnAudio.playbackRate = this._vnRateV;
                this._vnRender();
            },
            vnSeek(e) {
                const n = this._vn, a = this._vnAudio, w = e.currentTarget;
                if (!n || !a || !this._vnSrc) return;
                const r = w.getBoundingClientRect(), frac = Math.max(0, Math.min(1, (r.right - e.clientX) / r.width));
                a.currentTime = frac * n.dur;
                if (a.paused) this.vnToggle(); else this._vnTick();
            },
            _vnStop(reset) {
                const a = this._vnAudio;
                if (a) { try { a.pause(); if (reset) a.removeAttribute('src'); } catch (e) {} }
                if (reset && this._vnSrc) { URL.revokeObjectURL(this._vnSrc.url); this._vnSrc = null; }
                this._vnRender();
            },
            // the waveform fills as it plays; a full listen is counted once per device
            _vnTick(ended) {
                const n = this._vn, a = this._vnAudio;
                if (!n || !a) return;
                const t = ended ? n.dur : a.currentTime || 0, frac = Math.min(1, t / n.dur);
                const bars = document.querySelectorAll('#vnCard .vn-wave i'), lit = Math.round(frac * bars.length);
                bars.forEach((b, i) => b.classList.toggle('on', i < lit));
                const tm = document.getElementById('vnTime');
                if (tm) { const f = (x) => Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0'); tm.textContent = f(t) + ' / ' + f(n.dur); }
                if (frac >= 0.9) this._vnCount('done');
            },
            _vnCount(kind) {
                const n = this._vn;
                if (!n || !window.firebaseDb) return;
                let heard = {};
                try { heard = JSON.parse(localStorage.getItem('isp_vn_heard') || '{}') || {}; } catch (e) {}
                const h = heard[n.id] || (heard[n.id] = {});
                if (h[kind]) return;
                h[kind] = 1;
                try { localStorage.setItem('isp_vn_heard', JSON.stringify(heard)); } catch (e) {}
                const { ref, runTransaction, set } = window.firebaseDbHelpers;
                runTransaction(ref(window.firebaseDb, 'voiceNoteStats/' + n.id + '/' + kind), (c) => numOr0(c) + 1).catch(() => {});
                if (this.authUid && this.currentUser) set(ref(window.firebaseDb, 'voiceListeners/' + n.id + '/' + this.authUid), { n: String(this.currentUser.fullName || 'طالب').slice(0, 60), at: Date.now(), done: kind === 'done' || !!h.done }).catch(() => {});
                if (kind === 'plays') { const c = document.getElementById('vnCard'); if (c) { c.classList.remove('new'); c.querySelector('.vn-top em')?.remove(); } }
            },

            listenForTicker() {
                if (!window.firebaseDb || this._tickerListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                // the last list this phone saw is shown at once, so the bar is not added (and the page pushed down) seconds after the start
                try { const c = JSON.parse(localStorage.getItem('isp_ticker') || 'null'); if (Array.isArray(c) && c.length && !(this.adminTicker && this.adminTicker.length)) { this.adminTicker = c; if (this.currentView === 'homeView') { this.renderNewsTicker(); } } } catch (e) {}
                this._tickerListener = onValue(ref(window.firebaseDb, 'ticker'), (snap) => {
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((k) => list.push(vals[k]));
                        list.sort((a, b) => (b.id || 0) - (a.id || 0));
                    }
                    this.adminTicker = list;
                    try { localStorage.setItem('isp_ticker', JSON.stringify(list.slice(0, 40))); } catch (e) {}
                    if (this.currentView === 'homeView') {
                        this.renderNewsTicker();
                        lucide.createIcons();
                    }
                });
            },

            _dbBase() {
                return String((window.firebaseDb && window.firebaseDb.app && window.firebaseDb.app.options && window.firebaseDb.app.options.databaseURL) || 'https://iraqi-student-platform-9918d-default-rtdb.firebaseio.com').replace(/\/$/, '');
            },
            // The logo and the slider hold photos, so they are kept on the phone and checked with tiny
            // requests (the logo's update time, the slider's list of keys); a photo is downloaded only
            // when it is new. Checked at start and whenever the app comes back after a while.
            async listenForSiteImages() {
                if (!window.firebaseDb || this._siteImgsOn) return;
                this._siteImgsOn = true;
                try {
                    const [logo, car] = await Promise.all([newsStore.kvGet('logo'), newsStore.kvGet('carousel')]);
                    if (logo && logo.url) this._applyLogo(logo.url);
                    if (Array.isArray(car) && car.length && !(this.adminCarousel && this.adminCarousel.length)) this._applyCarousel(car);
                } catch (e) {}
                this._siteImgsSync();
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden && Date.now() - (this._siteSyncAt || 0) > 120000) this._siteImgsSync();
                });
            },
            _applyLogo(url) {
                const img = document.getElementById('appLogoImg');
                if (url && img) img.src = safeImage(url);
            },
            _applyCarousel(list) {
                this.adminCarousel = list;
                if (this.currentView === 'homeView') {
                    this.renderCarousel();
                    if (this.swiper) { this.swiper.destroy(true, true); this.swiper = null; }
                    this.initSwiper();
                    lucide.createIcons();
                }
            },
            async _siteImgsSync() {
                this._siteSyncAt = Date.now();
                const base = this._dbBase();
                const get = async (path, q) => {
                    const ctl = new AbortController();
                    const t = setTimeout(() => ctl.abort(), 20000);
                    try {
                        const r = await fetch(base + '/' + path + '.json' + (q ? '?' + q : ''), { signal: ctl.signal });
                        if (!r.ok) throw new Error('http ' + r.status);
                        return await r.json();
                    } finally { clearTimeout(t); }
                };
                try {
                    // logo: its update time decides
                    const t = await get('settings/logo/updatedAt');
                    const saved = await newsStore.kvGet('logo');
                    if (t !== null && (!saved || saved.t !== t)) {
                        const url = await get('settings/logo/url');
                        if (url) { await newsStore.kvPut('logo', { t, url }); this._applyLogo(url); }
                    }
                } catch (e) { /* offline: the saved logo stays */ }
                try {
                    // slider: the keys decide; only photos that aren't on the phone yet are downloaded
                    const keys = Object.keys((await get('carousel', 'shallow=true')) || {});
                    const cached = (await newsStore.kvGet('carousel')) || [];
                    const have = new Map(cached.map((c) => [c._k, c]));
                    if (keys.length === cached.length && keys.every((k) => have.has(k))) {
                        if (!(this.adminCarousel && this.adminCarousel.length) && cached.length) this._applyCarousel(cached);
                        return;
                    }
                    const list = [];
                    for (const k of keys) {
                        if (have.has(k)) { list.push(have.get(k)); continue; }
                        const item = await get('carousel/' + encodeURIComponent(k));
                        if (item && typeof item === 'object') list.push(Object.assign({ _k: k }, item));
                    }
                    list.sort((a, b) => (b.id || 0) - (a.id || 0));
                    await newsStore.kvPut('carousel', list);
                    this._applyCarousel(list);
                } catch (e) { /* offline: the saved slider stays */ }
            },

            // ==================== EXAM COUNTDOWN ====================
            listenForExamSchedule() {
                if (!window.firebaseDb || this._examListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._examListener = onValue(ref(window.firebaseDb, 'examSchedule'), (snap) => {
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((k) => list.push(vals[k]));
                    }
                    examSchedule.length = 0;
                    examSchedule.push(...list);
                    if (this.currentView === 'homeView') this.renderExamCountdown();
                });
            },

            refreshTimeAgoLabels() {
                document.querySelectorAll('[data-timeago]').forEach((el) => {
                    const ts = parseInt(el.getAttribute('data-timeago'), 10);
                    if (!isNaN(ts)) el.textContent = timeAgo(ts);
                });
            },

            // Compact chips in the same stop-and-go strip as the holidays. The chips are built
            // only when the exam list changes; the every-second tick just rewrites the numbers,
            // so the strip keeps sliding instead of being rebuilt 60 times a minute.
            renderExamCountdown() {
                const section = document.getElementById('examCountdownSection');
                const list = document.getElementById('examCountdownList');
                if (!section || !list) return;
                const now = Date.now();
                const upcoming = examSchedule
                    .map((ex) => ({ ex, t: new Date(ex.date).getTime() }))
                    .filter((x) => !isNaN(x.t) && x.t > now)
                    .sort((a, b) => a.t - b.t);
                if (upcoming.length === 0) {
                    section.classList.add('hidden');
                    list.innerHTML = '';
                    this._exKey = '';
                    this._stripStop('exams', 'examCountdownList');
                    return;
                }
                section.classList.remove('hidden');
                const key = upcoming.map((x) => x.t + '|' + (x.ex.subject || '')).join('␞');
                if (key !== this._exKey) {
                    this._exKey = key;
                    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                    list.innerHTML = upcoming.map(({ ex, t }) => {
                        const d = new Date(t);
                        const when = days[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
                        return `
                            <div class="hl-chip ex-chip" data-t="${jsNum(t)}">
                                <span class="hl-dot" aria-hidden="true"></span>
                                <div class="hl-body">
                                    <div class="hl-gov"><span class="hl-pin" aria-hidden="true"><i data-lucide="notebook-pen"></i></span><span>${escapeHtml(ex.subject || 'امتحان')}</span><span class="ex-date">${when}</span></div>
                                    <div class="ex-clock"></div>
                                </div>
                            </div>`;
                    }).join('');
                    const countEl = document.getElementById('examCountdownCount');
                    if (countEl) countEl.textContent = upcoming.length === 1 ? 'امتحان واحد' : (upcoming.length === 2 ? 'امتحانان' : upcoming.length + (upcoming.length <= 10 ? ' امتحانات' : ' امتحاناً'));
                    lucide.createIcons();
                    this._stripStart('exams', 'examCountdownViewport', 'examCountdownList');
                }
                const pad = (n) => String(n).padStart(2, '0');
                list.querySelectorAll('.ex-chip').forEach((chip) => {
                    const diff = Number(chip.dataset.t) - now;
                    const clock = chip.querySelector('.ex-clock');
                    if (!clock) return;
                    if (diff <= 0) { clock.innerHTML = 'بدأ الامتحان'; return; }
                    const dd = Math.floor(diff / 86400000);
                    const hh = Math.floor((diff % 86400000) / 3600000);
                    const mm = Math.floor((diff % 3600000) / 60000);
                    const ss = Math.floor((diff % 60000) / 1000);
                    chip.classList.toggle('is-urgent', diff < 86400000);
                    chip.classList.toggle('is-soon', diff >= 86400000 && diff < 7 * 86400000);
                    clock.innerHTML = (dd > 0 ? `${dd} <small>يوم</small> ` : '') + `<span dir="ltr">${pad(hh)}:${pad(mm)}:${pad(ss)}</span>`;
                });
            },

            // ===== Tomorrow: school or holiday? (باچر دوام لو عطلة؟) =====
            // The answer for a day and governorate comes from, in order: an announcement the
            // admin published in dayStatus/{date}/{governorate | all} (holiday, waiting for a
            // decision, or school confirmed), the holidays calendar, the weekend (Friday and
            // Saturday) and the summer break; otherwise it is a school day. From noon on the
            // card talks about tomorrow, in the morning about today.
            DS_DAYS: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],

            listenForDayStatus() {
                if (!window.firebaseDb || this._dayStatusListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._dayStatusListener = onValue(ref(window.firebaseDb, 'dayStatus'), (snap) => {
                    this._dayStatus = snap.val() || {};
                    this.renderDayStatus();
                    this.updateHolidayNavDot();
                });
            },

            _dsGov() {
                if (this._dsPick) return this._dsPick;
                const mine = this._myGov();
                if (mine) return mine;
                let s = '';
                try { s = localStorage.getItem('isp_day_gov') || ''; } catch (e) {}
                return IRAQ_GOVERNORATES.indexOf(s) !== -1 ? s : '';
            },

            // The day the strip talks about: tomorrow from noon on; in the morning it is today, unless the panel has announced
            // something for tomorrow and nothing for today (so an announcement made at 10am still shows up straight away).
            _dsTarget() {
                const d = new Date(), t = new Date(d.getTime());
                t.setDate(t.getDate() + 1);
                d.setHours(0, 0, 0, 0); t.setHours(0, 0, 0, 0);
                if (new Date().getHours() >= 12) return t;
                const gov = this._dsGov && this._dsGov(), all = this._dayStatus || {};
                const has = (day) => { const x = all[this.localDateStr(day)] || {}; return !!((gov && x[gov]) || x.all); };
                return !has(d) && has(t) ? t : d;
            },

            _dsStatus(date, gov) {
                const day = (this._dayStatus || {})[this.localDateStr(date)] || {};
                const ex = (gov && day[gov]) || day.all;
                if (ex && ['off', 'pending', 'on'].indexOf(ex.s) !== -1) return { s: ex.s, reason: String(ex.reason || ''), at: numOr0(ex.at), kind: 'admin' };
                const mid = date.getTime() + 12 * 3600000;
                const norm = (g) => { const v = String(g || '').trim(); return GOVERNORATE_ALIASES[v] || v; };
                const h = holidays.find((x) => {
                    const r = this.holidayRange(x), g = norm(x.governorate);
                    return !isNaN(r.start) && mid >= r.start && mid <= r.end && (!g || g === gov);
                });
                if (h) return { s: 'off', reason: String(h.title || 'عطلة'), kind: 'holiday' };
                const wd = date.getDay();
                if (wd === 5 || wd === 6) return { s: 'off', reason: 'عطلة نهاية الأسبوع', kind: 'weekend' };
                const m = date.getMonth();
                if (m === 6 || m === 7 || (m === 8 && date.getDate() < 15)) return { s: 'off', reason: 'العطلة الصيفية', kind: 'summer' };
                return { s: 'on', reason: '', kind: 'default' };
            },

            _dsDayLabel(date) {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
                return diff === 0 ? 'اليوم' : diff === 1 ? 'باچر' : diff === 2 ? 'عكب باچر' : this.DS_DAYS[date.getDay()];
            },

            toggleDsPicker() { this._dsPickerOpen = !this._dsPickerOpen; this._dsMore = false; this.renderDayStatus(); },

            pickDsGov(g) {
                if (IRAQ_GOVERNORATES.indexOf(g) === -1) return;
                if (this._myGov()) this._dsPick = g === this._myGov() ? null : g;
                else {
                    try { localStorage.setItem('isp_day_gov', g); } catch (e) {}
                    if ('Notification' in window && Notification.permission === 'granted') this.initPushNotifications();
                    this.syncNativePush();
                }
                this._dsPickerOpen = false;
                this.renderDayStatus();
                this.updateHolidayNavDot();
            },

            toggleDsMore() { this._dsMore = !this._dsMore; this._dsPickerOpen = false; this.renderDayStatus(); },

            // A slim strip (same height as the news ticker): dot, day, answer, reason, governorate.
            // Tapping it shows the next five days; tapping the governorate lets you pick another.
            renderDayStatus() {
                const box = document.getElementById('dayStatusWrap');
                if (!box) return;
                const gov = this._dsGov();
                const picker = `
                    <div class="ds-pick">
                        <p>${this._myGov() ? 'شوف محافظة ثانية (محافظتك تبقى ' + escapeHtml(this._myGov()) + ')' : 'اختار محافظتك'}</p>
                        <div>${IRAQ_GOVERNORATES.map((g) => `<button class="${g === gov ? 'on' : ''}" onclick="app.pickDsGov(${jsArg(g)})">${escapeHtml(g)}</button>`).join('')}</div>
                    </div>`;
                if (!gov) {
                    box.innerHTML = `<button class="dsb ask" onclick="app.toggleDsPicker()"><span class="dsb-dot"></span><b class="dsb-st">باچر دوام لو عطلة؟</b><span class="dsb-why">اختار محافظتك</span><span class="dsb-gov"><i data-lucide="map-pin"></i>اختار</span></button>` + (this._dsPickerOpen ? picker : '');
                    lucide.createIcons();
                    return;
                }
                const target = this._dsTarget();
                const st = this._dsStatus(target, gov);
                const head = st.s === 'on' ? (st.kind === 'admin' ? 'دوام، مؤكد' : 'دوام رسمي')
                    : st.s === 'pending' ? 'بانتظار القرار'
                    : st.kind === 'weekend' ? 'عطلة الأسبوع' : st.kind === 'summer' ? 'العطلة الصيفية' : 'عطلة';
                const why = st.s === 'pending' ? 'راح نبلغك أول ما يطلع القرار' : (st.s === 'off' && (st.kind === 'admin' || st.kind === 'holiday') ? st.reason : (st.kind === 'admin' ? st.reason : ''));
                let more = '';
                if (this._dsMore) {
                    const days = [];
                    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
                    for (let i = 0; i < 5; i++) {
                        const d = new Date(d0.getTime()); d.setDate(d0.getDate() + i);
                        const x = this._dsStatus(d, gov);
                        days.push(`<div class="dsb-day${d.getTime() === target.getTime() ? ' sel' : ''}"><span>${this._dsDayLabel(d)}</span><i class="${x.s}"></i><span>${x.s === 'on' ? 'دوام' : x.s === 'off' ? 'عطلة' : 'بانتظار'}</span></div>`);
                    }
                    const note = st.s === 'pending' ? 'لحد هسه ما انعلن قرار رسمي. راح نبلغك أول ما يطلع' + (st.reason ? ' — ' + escapeHtml(st.reason) : '')
                        : st.reason ? escapeHtml(st.reason) : 'ما انعلنت أي عطلة لمحافظتك';
                    more = `<div class="dsb-more"><p>${note}${st.kind === 'admin' && st.at ? ' · إعلان من إدارة المنصة ' + timeAgo(st.at) : ''}</p><div class="dsb-days">${days.join('')}</div>${this._dsPushRow()}</div>`;
                }
                box.innerHTML = `
                    <button class="dsb ${st.s}" onclick="app.toggleDsMore()" aria-expanded="${this._dsMore ? 'true' : 'false'}">
                        <span class="dsb-dot"></span>
                        <span class="dsb-when">${this._dsDayLabel(target)} ${this.DS_DAYS[target.getDay()]}</span>
                        <b class="dsb-st">${head}</b>
                        <span class="dsb-why">${why ? '· ' + escapeHtml(why) : ''}</span>
                        <span class="dsb-gov" onclick="event.stopPropagation(); app.toggleDsPicker()"><i data-lucide="map-pin"></i>${escapeHtml(gov)}<i data-lucide="chevron-down"></i></span>
                    </button>
                    ${more}
                    ${this._dsPickerOpen ? picker : ''}`;
                lucide.createIcons();
            },

            // ===== سما الأحلام (dreams page) =====
            // dreams/{id} = { id, t, c, g, n, o, at, amen }: text, category, governorate, optional first
            // name, owner key (uid or device), time, and how many said "آمين". Up to 3 dreams per student.
            DREAM_CATS: [['study', 'دراسة', 'graduation-cap'], ['career', 'مهنة', 'briefcase'], ['family', 'عائلة', 'heart-handshake'], ['travel', 'سفر', 'plane'], ['other', 'حلم آخر', 'sparkles']],

            _dreamOwner() { return this.isLoggedIn && this.authUid ? String(this.authUid) : 'd_' + this._deviceId(); },

            listenForDreams() {
                if (!window.firebaseDb || this._dreamsListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._dreamsListener = onValue(ref(window.firebaseDb, 'dreams'), (snap) => {
                    const v = snap.val() || {};
                    this._dreams = Object.keys(v).map((k) => v[k]).filter((d) => d && typeof d.t === 'string' && d.t.trim() && /^[A-Za-z0-9_-]{1,40}$/.test(String(d.id || '')))
                        .map((d) => {
                            const gov = IRAQ_GOVERNORATES.indexOf(d.g) !== -1 ? d.g : '';
                            const name = String(d.n || '').trim().slice(0, 20);
                            return { id: String(d.id), t: d.t.trim().slice(0, 120), c: String(d.c || 'other'), g: gov, o: String(d.o || ''), at: numOr0(d.at), amen: numOr0(d.amen), by: (name || 'طالب') + (gov ? ' من ' + gov : '') };
                        })
                        .sort((a, b) => b.at - a.at).slice(0, 150);
                    if (this._sky) this._sky.setPool(this._dreamPool());
                    this._renderDreamCount();
                    if (this._drMineOpen) this.openMyDreams();
                });
            },

            // Newest first, then shuffled a little so the sky doesn't always start the same way.
            _dreamPool() {
                const list = (this._dreams || []).slice();
                const fresh = list.slice(0, 6), rest = list.slice(6);
                for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
                return fresh.concat(rest);
            },

            _renderDreamCount() {
                const el = document.getElementById('drCount');
                const n = (this._dreams || []).length;
                if (el) el.textContent = n ? n + ' حلم من طلاب العراق' : 'كون أول واحد يطلق حلمه';
                document.getElementById('drEmpty')?.classList.toggle('hidden', n > 0);
            },

            // ===== غابة العراق =====
            // A study session on this page grows a tree on the student's governorate. Leaving the
            // page or the app (more than a few seconds), or missing a "still studying?" check,
            // kills the tree and the session's points. Data: forest/govs/{gov} {t: trees, m:
            // minutes}, forest/last (the latest planting, animated for everyone), focusLive/{uid}
            // (shared with focus mode: who is studying right now).
            FOREST_KEY: 'isp_forest_session',
            FOREST_DURS: [25, 45, 60, 90],
            FOREST_GRACE_MS: 3000,
            FOREST_CHECK_SECS: 60,
            FOREST_WORDS: ['شجرة', 'نخلة', 'غيمة', 'نجمة', 'وردة', 'قمر', 'نهر', 'جبل'],
            forestMinutes: 25,

            listenForForest() {
                if (this._frListening || !window.firebaseDb) return;
                this._frListening = true;
                const { ref, onValue } = window.firebaseDbHelpers;
                onValue(ref(window.firebaseDb, 'forest/govs'), (snap) => { this._frGovs = snap.val() || {}; this._frSync(); });
                onValue(ref(window.firebaseDb, 'focusLive'), (snap) => { this._frLiveRaw = snap.val() || {}; this._frSync(); });
                onValue(ref(window.firebaseDb, 'forest/gold'), (snap) => { this._frGold = snap.val() || {}; if (this._f3d) this._f3d.setGold(this._frGold); });
                onValue(ref(window.firebaseDb, 'forestConfig/weather'), (snap) => { const v = snap.val(); this._frWxMode = (v && v.mode) || 'real'; if (this._f3d) this._f3d.wxMode = this._frWxMode; });
                onValue(ref(window.firebaseDb, 'forestConfig/bots'), (snap) => { this._frBots = snap.val(); this._frSeen = Date.now(); this._frSync(); });
                // companions finish sessions over time: refresh and announce them while the page is open
                setInterval(() => {
                    if (this.currentView !== 'forestView' || !this._frBots || !this._frBots.on) return;
                    this._frSync();
                    const ev = (this._frSim.recent || []).filter((e) => e.at > (this._frSeen || 0));
                    if (ev.length) { const e = ev[ev.length - 1]; this._frSeen = e.at; this._frTicker(e); }
                }, 5000);
                let firstLast = true;
                onValue(ref(window.firebaseDb, 'forest/last'), (snap) => {
                    const v = snap.val();
                    if (!firstLast && v && v.at && Date.now() - v.at < 120000 && v.u !== this.authUid) this._frTicker(v);
                    firstLast = false;
                });
            },

            _frLiveCounts() {
                const now = Date.now(), c = Object.assign({}, (this._frSim && this._frSim.live) || {});
                Object.values(this._frLiveRaw || {}).forEach((v) => {
                    if (v && IRAQ_GOVERNORATES.indexOf(v.gov) !== -1 && numOr0(v.until) > now) c[v.gov] = (c[v.gov] || 0) + 1;
                });
                return c;
            },

            // Real trees and minutes plus the companions' ones.
            _frGovData() {
                const real = this._frGovs || {}, sim = this._frSim || {}, out = {};
                IRAQ_GOVERNORATES.forEach((g) => {
                    const t = numOr0(real[g] && real[g].t) + numOr0(sim.trees && sim.trees[g]), m = numOr0(real[g] && real[g].m) + numOr0(sim.mins && sim.mins[g]);
                    if (t || m) out[g] = { t, m };
                });
                return out;
            },

            _frSync() {
                this._frSim = typeof forestBotSim === 'function' ? forestBotSim(this._frBots, Date.now()) : { live: {}, trees: {}, mins: {}, recent: [], liveTotal: 0, treeTotal: 0 };
                const govs = this._frGovData(), live = this._frLiveCounts();
                const trees = Object.values(govs).reduce((s, g) => s + numOr0(g && g.t), 0), studying = Object.values(live).reduce((s, n) => s + n, 0);
                const sub = document.getElementById('frSub');
                if (sub) sub.innerHTML = `<span>${trees} شجرة</span><span class="dot"></span><span class="live"><i></i>${studying} يدرسون هسه</span>`;
                const mine = document.getElementById('frMineN');
                if (mine) mine.textContent = numOr0(this.currentUser && this.currentUser.forestTrees);
                if (this._f3d) this._f3d.setForest(govs, live, this._myGov());
                else if (this._f3dFail) this._frFlat();
                this._frFit();
                if (this._frPick) this._frGovCard(this._frPick);
            },

            goToForest() {
                this.listenForForest();
                this.switchView('forestView');
                if (this._withPart('maps', () => typeof IraqForest3D !== 'undefined', 'forestView', () => this.goToForest())) { this._frRenderSetup(); return; }
                const wrap = document.getElementById('fr3d');
                if (wrap && !this._f3d && !this._f3dFail && IRAQ_DEM === null) {
                    loadIraqDem().then(() => { if (this.currentView === 'forestView') this.goToForest(); });
                } else if (wrap && !this._f3d && !this._f3dFail) {
                    try {
                        this._f3d = new IraqForest3D(wrap, (g) => this.pickForestGov(g));
                        this._f3d.windEl = document.getElementById('frWind');
                        this._f3d.windKm = document.getElementById('frWindKm');
                        this._f3d.wxEl = document.getElementById('frWx');
                        this._f3d.dimEl = document.getElementById('frDim');
                        this._f3d.flashEl = document.getElementById('frFlash');
                        this._f3d.compassEl = document.getElementById('frCompass');
                        this._f3d.onUserMove = () => { if (!this._forest && !this._frResult && !this._frMini) this.frSheetToggle(false); };
                        this._f3d.wxMode = this._frWxMode || 'real';
                        this._f3d.setGold(this._frGold || {});
                        this._f3d.goldNow = this.goldenState().active;
                        if (this._wxData) this._f3d.setRealWeather(this._wxData);
                    } catch (e) {
                        console.warn('3D forest unavailable:', e);
                        this._f3dFail = true;
                    }
                }
                if (this._f3d) this._f3d.start(() => this.currentView === 'forestView' && !document.hidden);
                this._frLoadWx();
                this._frSync();
                if (this._forest) this._frRenderRunning(); else if (!this._frResult) this._frRenderSetup();
                lucide.createIcons();
            },

            // Real weather for the forest: loaded on opening and every 15 minutes while it is open.
            _frLoadWx() {
                if (this._wxLoading || (this._wxData && Date.now() - this._wxData.at < 15 * 60000)) return;
                this._wxLoading = true;
                loadIraqWeather().then((d) => {
                    this._wxData = d;
                    if (this._f3d) this._f3d.setRealWeather(d);
                    if (this._frPick) this._frGovCard(this._frPick);
                }).catch((e) => console.warn('Weather unavailable:', e)).finally(() => { this._wxLoading = false; });
                if (!this._wxTimer) this._wxTimer = setInterval(() => { if (this.currentView === 'forestView') this._frLoadWx(); }, 60000);
            },

            // Map buttons: zoom, north up, all of Iraq, my governorate.
            mapCtl(k) {
                const f = this._f3d;
                if (!f) return;
                f.lastTouch = performance.now(); f.userMoved = true; f.vel = null;
                if (k === 'in') f.camZ = Math.min(9, f.camZ * 1.6);
                else if (k === 'out') f.camZ = Math.max(0.7, f.camZ / 1.6);
                else if (k === 'north') f.northUp();
                else if (k === 'home') { this.pickForestGov(null); f.flyTo(''); }
                else if (k === 'mine') {
                    const g = this._myGov();
                    if (!g) { this.showToast('حدد محافظتك من حسابك'); return; }
                    if (this._frPick !== g) this.pickForestGov(g); else f.flyTo(g, 2.6);
                }
            },

            // Keeps the map centred in the space between the top bar and the bottom panel.
            _frFit() {
                if (!this._f3d) return;
                requestAnimationFrame(() => {
                    const sh = document.getElementById('frSheet'), H = window.innerHeight || 800;
                    if (this._f3d) this._f3d.offT = Math.max(0, ((sh ? sh.offsetHeight + 12 : 0) - 70) / H);
                    document.getElementById('frRoot')?.style.setProperty('--sh', (sh ? sh.offsetHeight + 12 : 0) + 'px');
                });
            },

            // Flat list when WebGL is not available.
            _frFlat() {
                const wrap = document.getElementById('fr3d');
                if (!wrap) return;
                const govs = this._frGovData(), live = this._frLiveCounts();
                wrap.className = 'fr-flat';
                wrap.innerHTML = IRAQ_GOVERNORATES.map((g) => ({ g, t: numOr0(govs[g] && govs[g].t) })).sort((a, b) => b.t - a.t).map((r) =>
                    `<button onclick="app.pickForestGov(${jsArg(r.g)})"><b>${escapeHtml(r.g)}</b><span>${r.t} شجرة${live[r.g] ? ' · ' + live[r.g] + ' يدرسون' : ''}</span></button>`).join('');
            },

            async forestBack() {
                if (this._forest) {
                    if (!(await this.ask({ icon: 'leaf', title: 'تطلع من الغابة؟', text: 'إذا طلعت هسه تذبل شجرتك وتروح نقاط الجلسة.', ok: 'اطلع', cancel: 'أكمل الدراسة' }))) return;
                    this.failForest('طلعت من صفحة الغابة', true);
                }
                this._frResult = null;
                this.goBack();
            },

            pickForestGov(g) {
                if (!g || g === this._frPick) {
                    this._frPick = null;
                    document.getElementById('frGov')?.classList.add('hidden');
                    if (this._f3d) this._f3d.select('');
                    return;
                }
                this._frPick = g;
                if (this._f3d) this._f3d.select(g);
                this._frGovCard(g);
            },

            _frGovCard(g) {
                const box = document.getElementById('frGov');
                if (!box) return;
                const govs = this._frGovData(), live = this._frLiveCounts(), d = govs[g] || {};
                const rank = IRAQ_GOVERNORATES.map((x) => ({ x, t: numOr0(govs[x] && govs[x].t) })).sort((a, b) => b.t - a.t).findIndex((r) => r.x === g) + 1;
                const t = numOr0(d.t), m = numOr0(d.m), l = live[g] || 0;
                box.innerHTML = `
                    <div class="fr-gov-h">
                        <div><small>${g === this._myGov() ? 'محافظتك' : 'محافظة'}</small><b>${escapeHtml(g)}</b></div>
                        <span class="fr-rank">#${rank}</span>
                        <button onclick="app.pickForestGov(null)" aria-label="إغلاق"><i data-lucide="x"></i></button>
                    </div>
                    <div class="fr-gov-s">
                        <div><b>${t}</b><span>شجرة</span></div>
                        <div><b>${m >= 60 ? Math.round(m / 6) / 10 : m}</b><span>${m >= 60 ? 'ساعة دراسة' : 'دقيقة دراسة'}</span></div>
                        <div class="${l ? 'on' : ''}"><b>${l}</b><span>يدرسون هسه</span></div>
                    </div>${(() => {
                        const v = this._wxData && this._wxData.govs[g];
                        if (!v) return '';
                        const lb = wxCodeInfo(v);
                        return `<div class="fr-gov-w"><span><i data-lucide="${lb[0]}"></i></span><b>${lb[1]}</b><em>${Math.round(v.t)}°</em><small>رياح ${Math.round(v.ws)} كم/س · رطوبة ${Math.round(v.rh)}%</small></div>`;
                    })()}`;
                if (box.classList.contains('hidden')) { box.classList.remove('hidden'); box.classList.remove('in'); void box.offsetWidth; box.classList.add('in'); }
                lucide.createIcons();
            },

            _frTicker(v) {
                const el = document.getElementById('frTicker');
                if (!el) return;
                el.innerHTML = `<i data-lucide="sprout"></i><span>${escapeHtml(v.n || 'طالب')} من ${escapeHtml(v.g || 'العراق')} زرع شجرة بعد ${numOr0(v.m)} دقيقة دراسة</span>`;
                lucide.createIcons();
                el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
                clearTimeout(this._frTickT);
                this._frTickT = setTimeout(() => el.classList.remove('on'), 5200);
            },

            setForestMinutes(m) { this.forestMinutes = m; this._frRenderSetup(); },

            _frRenderSetup() {
                const box = document.getElementById('frSheet');
                if (!box) return;
                const gov = this._myGov();
                let body;
                if (!this.isLoggedIn || !this.currentUser) {
                    body = `<div class="fr-need"><b>سجّل دخولك حتى تزرع شجرتك</b><small>كل جلسة دراسة تكملها تصير شجرة بمحافظتك، وتكسب نقاط</small><button class="fr-go" onclick="app.goToAuth('login')"><i data-lucide="log-in"></i>تسجيل الدخول</button></div>`;
                } else if (!gov) {
                    body = `<div class="fr-need"><b>حدد محافظتك أول</b><small>شجرتك تنزرع بمحافظتك، فلازم تكون محددة بحسابك</small><button class="fr-go" onclick="app.goToProfile ? app.goToProfile() : app.switchView('profileView')"><i data-lucide="map-pin"></i>حسابي</button></div>`;
                } else {
                    body = `
                        <div class="fr-head"><b>ازرع شجرة ب${escapeHtml(gov)}</b><small>ادرس بهاي الصفحة لحد ما يخلص الوقت، وشجرتك تكبر قدامك على الخارطة</small></div>
                        <div class="gold-hint"><i data-lucide="sparkles"></i>الساعة الذهبية شغالة: كل دقيقة بنقطتين وشجرتك تطلع ذهبية</div>
                        <div class="fr-durs">${this.FOREST_DURS.map((m) => `<button class="${m === this.forestMinutes ? 'on' : ''}" onclick="app.setForestMinutes(${jsNum(m)})"><b>${m}</b><span>دقيقة</span><em>+${m} نقطة</em></button>`).join('')}</div>
                        <button class="fr-go" onclick="app.startForest()"><i data-lucide="sprout"></i>ابدأ وازرع</button>
                        <div class="fr-rules">
                            <span><i data-lucide="log-out"></i>تطلع من الصفحة أو التطبيق؟ تذبل شجرتك وتروح النقاط</span>
                            <span><i data-lucide="hand"></i>كل شوية يسألك "لسه تدرس؟" وعندك دقيقة ترد</span>
                        </div>`;
                }
                const title = !this.isLoggedIn || !this.currentUser ? 'سجّل دخولك حتى تزرع' : !gov ? 'حدد محافظتك حتى تزرع' : 'ازرع شجرة ب' + gov;
                box.className = 'fr-sheet' + (this._frMini ? ' mini' : '');
                box.innerHTML = `<button class="fr-grab" onclick="app.frSheetToggle()" aria-label="تصغير وتكبير"><i></i></button>
                    <button class="fr-minibar" onclick="app.frSheetToggle(false)"><i data-lucide="sprout"></i><b>${escapeHtml(title)}</b><span><i data-lucide="chevron-up"></i></span></button>
                    <div class="fr-full">${body}</div>`;
                this._frFit();
                lucide.createIcons();
            },

            // The bottom panel folds into a thin bar so the whole map is free to explore.
            frSheetToggle(open) {
                const box = document.getElementById('frSheet');
                if (!box || !box.querySelector('.fr-full')) return;
                this._frMini = open === undefined ? !box.classList.contains('mini') : !open;
                box.classList.toggle('mini', this._frMini);
                this._frFit();
                setTimeout(() => this._frFit(), 320);
            },

            async startForest() {
                if (this._forest || this._starting) return;
                if (!this.isLoggedIn || !this.currentUser) { this.goToAuth('login'); return; }
                const gov = this._myGov();
                if (!gov) { this.showToast('حدد محافظتك من حسابك أول'); return; }
                if (this._focus || this._gwar || this._garden) { this.showToast('عندك جلسة شغالة، كمّلها أول'); return; }
                this._starting = true;
                const free = await this._sessionFree();
                this._starting = false;
                if (!free || this._forest) return;
                const minutes = this.forestMinutes, now = this.trueNow();
                this._forest = { start: now, dur: minutes * 60000, minutes, g: gov, next: now + this._frGap(true), check: null };
                try { localStorage.setItem(this.FOREST_KEY, JSON.stringify({ start: now, dur: minutes * 60000 })); } catch (e) {}
                this._frResult = null;
                this._bindForestEvents();
                this._requestWakeLock();
                this._govLiveJoin(minutes);
                document.body.classList.add('forest-running');
                this.pickForestGov(null);
                if (this._f3d) this._f3d.plant(gov, minutes);
                this._frRenderRunning();
                clearInterval(this._frTimer);
                this._frTimer = setInterval(() => this._frTick(), 500);
                this._frTick();
            },

            // Minutes until the next "still studying?" check: the first comes sooner.
            // (more often during the golden hour, when minutes are worth double)
            _frGap(first) { return (this.goldenState().active ? 4 + Math.random() * 3 : first ? 4 + Math.random() * 4 : 6 + Math.random() * 5) * 60000; },

            _frStage(p) { return p < 0.1 ? 'بذرة' : p < 0.35 ? 'برعم' : p < 0.7 ? 'شتلة' : p < 1 ? 'شجرة صغيرة' : 'شجرة'; },

            _frRenderRunning() {
                const box = document.getElementById('frSheet');
                const f = this._forest;
                if (!box || !f) return;
                const C = 2 * Math.PI * 44;
                box.className = 'fr-sheet run';
                box.innerHTML = `
                    <div class="fr-run">
                        <div class="fr-ring">
                            <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="bg"/><circle cx="50" cy="50" r="44" class="fg" id="frArc" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/></svg>
                            <div><b id="frClock" dir="ltr">--:--</b><span id="frStage">بذرة</span><em class="gold-x2">×2</em></div>
                        </div>
                        <div class="fr-run-tx">
                            <b>شجرتك تكبر ب${escapeHtml(f.g)}</b>
                            <small>ابقَ بهاي الصفحة. بنهاية الجلسة تكسب <em>+${f.minutes} نقطة</em></small>
                            <div class="fr-run-warn"><i data-lucide="shield-alert"></i>الطلعة من الصفحة تذبّل الشجرة</div>
                        </div>
                    </div>
                    <button class="fr-quit" onclick="app.quitForest()">انسحاب</button>`;
                this._frFit();
                lucide.createIcons();
                this._frTick();
            },

            _frTick() {
                const f = this._forest;
                if (!f) return;
                const now = this.trueNow();
                if (f.hiddenAt) return;
                if (f.check && now > f.check.until) { this.failForest('ما رديت على سؤال "لسه تدرس؟"'); return; }
                const left = f.start + f.dur - now;
                if (left <= 0) { this.completeForest(); return; }
                if (!f.check && now >= f.next && left > 60000) this._frAsk();
                const p = 1 - left / f.dur, secs = Math.ceil(left / 1000);
                if (this._f3d) this._f3d.grow(p);
                const clock = document.getElementById('frClock');
                if (clock) clock.textContent = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
                const st = document.getElementById('frStage');
                if (st) st.textContent = this._frStage(p);
                const arc = document.getElementById('frArc');
                if (arc) arc.setAttribute('stroke-dashoffset', (2 * Math.PI * 44 * (1 - p)).toFixed(1));
                if (f.check) {
                    const s = Math.max(0, Math.ceil((f.check.until - now) / 1000));
                    const el = document.getElementById('frCkSec');
                    if (el) el.textContent = s;
                    const ring = document.getElementById('frCkArc');
                    if (ring) ring.setAttribute('stroke-dashoffset', (2 * Math.PI * 30 * (1 - s / this.FOREST_CHECK_SECS)).toFixed(1));
                }
            },

            // "Still studying?": three words, only one is right, and the buttons move around,
            // so it can't be answered without looking at the screen.
            _frAsk() {
                const f = this._forest;
                if (!f) return;
                const words = this.FOREST_WORDS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
                const right = words[Math.floor(Math.random() * 3)];
                f.check = { until: this.trueNow() + this.FOREST_CHECK_SECS * 1000, right };
                const box = document.getElementById('frCheck');
                if (box) {
                    const C = 2 * Math.PI * 30;
                    box.innerHTML = `
                        <div class="fr-ck">
                            <div class="fr-ck-ring"><svg viewBox="0 0 70 70" aria-hidden="true"><circle cx="35" cy="35" r="30" class="bg"/><circle cx="35" cy="35" r="30" class="fg" id="frCkArc" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="0"/></svg><b id="frCkSec">${this.FOREST_CHECK_SECS}</b></div>
                            <b class="fr-ck-t">لسه تدرس؟</b>
                            <p>اضغط على كلمة <em>${escapeHtml(right)}</em> حتى تبقى شجرتك عايشة</p>
                            <div class="fr-ck-btns" style="flex-direction:${Math.random() < 0.5 ? 'row' : 'row-reverse'}">${words.map((w, i) => `<button style="margin-top:${[0, 18, 8][i]}px" onclick="app.answerForestCheck(this, ${jsArg(w)})">${escapeHtml(w)}</button>`).join('')}</div>
                        </div>`;
                    box.classList.remove('hidden');
                }
                this.playNotifySound();
                try { navigator.vibrate && navigator.vibrate([220, 120, 220]); } catch (e) {}
                this._frTick();
            },

            answerForestCheck(btn, w) {
                const f = this._forest;
                if (!f || !f.check) return;
                if (w !== f.check.right) {
                    btn.classList.remove('no'); void btn.offsetWidth; btn.classList.add('no');
                    return;
                }
                f.check = null;
                f.next = this.trueNow() + this._frGap(false);
                document.getElementById('frCheck')?.classList.add('hidden');
                this.showToast('تمام، كمّل دراستك');
            },

            async quitForest() {
                if (!this._forest) return;
                if (!(await this.ask({ icon: 'leaf', title: 'تنسحب من الجلسة؟', text: 'إذا انسحبت هسه تذبل شجرتك وتروح نقاط الجلسة.', ok: 'انسحب', cancel: 'أكمل الدراسة' }))) return;
                this.failForest('انسحبت قبل ما يخلص الوقت');
            },

            _bindForestEvents() {
                if (this._frBound) return;
                this._frBound = true;
                document.addEventListener('visibilitychange', () => {
                    const f = this._forest;
                    if (!f) return;
                    if (document.hidden) { f.hiddenAt = performance.now(); f.hiddenWall = Date.now(); return; }
                    if (!f.hiddenAt) return;
                    const away = Math.max(performance.now() - f.hiddenAt, Date.now() - (f.hiddenWall || 0));
                    delete f.hiddenAt;
                    if (away > this.FOREST_GRACE_MS) this.failForest('طلعت من التطبيق أثناء الجلسة');
                    else { this._requestWakeLock(); this._frTick(); }
                });
            },

            _frStop() {
                clearInterval(this._frTimer);
                this._frTimer = null;
                try { localStorage.removeItem(this.FOREST_KEY); } catch (e) {}
                if (this._wakeLock) { this._wakeLock.release().catch(() => {}); this._wakeLock = null; }
                this._govLiveLeave();
                document.body.classList.remove('forest-running');
                document.getElementById('frCheck')?.classList.add('hidden');
                const f = this._forest;
                this._forest = null;
                return f;
            },

            completeForest() {
                const f = this._frStop();
                if (!f) return;
                if (this._f3d) this._f3d.finish(true);
                this.playNotifySound();
                const u = this.currentUser || {};
                f.golden = this._goldenCredit(f);
                const pts = f.minutes + f.golden;
                this.saveFocusStats({ forestTrees: numOr0(u.forestTrees) + 1, forestMinutes: numOr0(u.forestMinutes) + f.minutes });
                this.addPointsAtomic(pts).then(() => this.logDailyActivity({ points: pts, studySessions: 1, minutes: f.minutes }));
                this._govWarAdd(f.minutes);
                if (window.firebaseDb) {
                    const { ref, runTransaction, set } = window.firebaseDbHelpers;
                    runTransaction(ref(window.firebaseDb, 'forest/govs/' + f.g), (cur) => {
                        const c = cur || {};
                        return { t: numOr0(c.t) + 1, m: numOr0(c.m) + f.minutes };
                    }).then((res) => {
                        // a tree planted with golden minutes stays golden on the map
                        const t = res && res.committed && res.snapshot.val() ? numOr0(res.snapshot.val().t) : 0;
                        if (f.golden && t) set(ref(window.firebaseDb, 'forest/gold/' + f.g + '/' + (t - 1)), true).catch(() => {});
                    }).catch((e) => console.warn('Forest update failed:', e));
                    const first = String(u.fullName || '').trim().split(/\s+/)[0] || '';
                    set(ref(window.firebaseDb, 'forest/last'), { g: f.g, n: filterBadWords(first).clean.slice(0, 20), m: f.minutes, at: Date.now(), u: this.authUid || '' }).catch(() => {});
                }
                this._frResult = { ok: true, f };
                this._frRenderResult();
                this._frSync();
            },

            failForest(reason, away) {
                const f = this._frStop();
                if (!f) return;
                if (this._f3d) this._f3d.finish(false);
                const u = this.currentUser || {};
                this.saveFocusStats({ forestDead: numOr0(u.forestDead) + 1 });
                try { navigator.vibrate && navigator.vibrate(400); } catch (e) {}
                this._frResult = { ok: false, f, reason };
                this._frRenderResult();
                if (away || this.currentView !== 'forestView') this.showToast('ذبلت شجرتك: ' + reason);
            },

            _frRenderResult() {
                const box = document.getElementById('frSheet'), r = this._frResult;
                if (!box || !r) return;
                box.className = 'fr-sheet res ' + (r.ok ? 'ok' : 'bad');
                box.innerHTML = r.ok ? `
                    <span class="fr-res-ic"><i data-lucide="trees"></i></span>
                    <b class="fr-res-t">انزرعت شجرتك ب${escapeHtml(r.f.g)}</b>
                    <p class="fr-res-p">كملت ${r.f.minutes} دقيقة دراسة وكسبت <em>+${r.f.minutes + (r.f.golden || 0)} نقطة</em>${r.f.golden ? ` (منها <em class="gold-t">${r.f.golden} نقطة ذهبية</em>، وشجرتك طلعت ذهبية)` : ''}. شجرتك صارت جزء من غابة العراق.</p>
                    <button class="fr-go" onclick="app._frResult = null; app._frRenderSetup()"><i data-lucide="sprout"></i>ازرع شجرة ثانية</button>` : `
                    <span class="fr-res-ic"><i data-lucide="leaf"></i></span>
                    <b class="fr-res-t">ذبلت شجرتك</b>
                    <p class="fr-res-p">${escapeHtml(r.reason || '')}. راحت ${r.f.minutes} نقطة كانت تنتظرك.</p>
                    <button class="fr-go" onclick="app._frResult = null; app._frRenderSetup()"><i data-lucide="rotate-ccw"></i>حاول مرة ثانية</button>`;
                this._frFit();
                lucide.createIcons();
            },

            // A session still saved when the app starts means the app was closed mid-session.
            checkInterruptedForest() {
                let saved = null;
                try { saved = JSON.parse(localStorage.getItem(this.FOREST_KEY) || 'null'); } catch (e) {}
                if (!saved) return;
                try { localStorage.removeItem(this.FOREST_KEY); } catch (e) {}
                const u = this.currentUser || {};
                this.saveFocusStats({ forestDead: numOr0(u.forestDead) + 1 });
                setTimeout(() => this.showToast('ذبلت شجرتك لأن التطبيق انسد قبل ما تخلص الجلسة'), 1500);
            },

            // ===== المعلم الذكي (engine in js/tutor.js, server in tutor-worker/) =====
            goToTutor() {
                this.switchView('tutorView');
                if (this._withPart('tutor', () => typeof this.tutorOpen === 'function', 'tutorView', () => this.goToTutor())) return;
                this.tutorOpen();
            },
            tutorBack() { this.setTab('home'); },

            // Once a day the tutor may write to the student first; js/tutor.js decides whether
            // there is a reason to (days without studying, a grade that fell, an exam soon).
            _ttNudgeSoon() {
                if (this.authUid) this._ttBadge();
                if (this._ttNudgeT || !this.isLoggedIn || !this.authUid || !this._tutorUrl()) return;
                try { if (localStorage.getItem('isp_tutor_nudge_' + this.authUid) === this.localDateStr()) return; } catch (e) {}
                this._ttNudgeT = setTimeout(() => {
                    this._need('tutor').then(() => this._ttNudge && this._ttNudge()).catch(() => {});
                }, 8000);
            },

            // a dot on the tutor's tab while it has a message the student hasn't opened
            _ttBadge(on) {
                const k = 'isp_tutor_unread_' + (this.authUid || '');
                try {
                    if (on === undefined) on = localStorage.getItem(k) === '1';
                    else if (on) localStorage.setItem(k, '1');
                    else localStorage.removeItem(k);
                } catch (e) {}
                document.querySelector('#bottomNav .nav-ai')?.classList.toggle('has-msg', !!on);
            },

            // The student's own record, for the tutor to hold them to it.
            _ttStudyData() {
                if (!this._ttActP || this._ttActUid !== this.authUid) {
                    this._ttActUid = this.authUid;
                    this._ttActP = (async () => {
                        if (!window.firebaseDb || !this.authUid || this._moodActLoaded) return;
                        const { ref, get } = window.firebaseDbHelpers;
                        const snap = await get(ref(window.firebaseDb, 'userActivity/' + this.authUid));
                        if (snap.exists()) { const vals = snap.val(); Object.keys(vals).forEach((d) => { monthlyActivity[d] = vals[d]; }); }
                    })().catch(() => { this._ttActP = null; });
                }
                return this._ttActP.then(() => ({ activity: monthlyActivity, exams: examSchedule.slice(), grades: this._gradesLoad() }));
            },

            // ===== دفتر الغلطات: every wrong answer comes back after 1, 3 and 7 days until it is
            // answered right three times in a row (js/mistakes.js). The list lives on the device:
            // localStorage isp_mistakes_<uid>; photos in IndexedDB.
            _mkKey() { return 'isp_mistakes_' + (this.authUid || 'guest'); },
            _mkList() { try { const v = JSON.parse(localStorage.getItem(this._mkKey()) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
            _mkStore(list) { try { localStorage.setItem(this._mkKey(), JSON.stringify(list.slice(-400))); } catch (e) { console.warn('Mistakes save failed:', e); } },
            // the start of the day `days` from now, so an item is due all of that day
            _mkDay(days) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days); return d.getTime(); },
            // a multiple-choice question answered wrong (tutor quiz, duel), or a photo the student adds
            _mkAdd(it) {
                const list = this._mkList(), q = String(it.q || '').slice(0, 600);
                const same = q && list.find((x) => x.q === q && !x.done);
                if (same) { same.ok = 0; same.due = this._mkDay(1); same.miss = (same.miss || 1) + 1; this._mkStore(list); return same; }
                const item = Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), due: this._mkDay(1), ok: 0, miss: 1 }, it, { q });
                list.push(item);
                this._mkStore(list);
                return item;
            },
            _mkDueCount() { const now = Date.now(); return this._mkList().filter((x) => !x.done && x.due <= now).length; },
            goToMistakes() {
                this.switchView('mistakesView');
                if (this._withPart('mistakes', () => typeof this.mkOpen === 'function', 'mistakesView', () => this.goToMistakes())) return;
                this.mkOpen();
            },

            // ===== غذائي ومائي: meals judged for focus and memory, water, and their reminders =====
            // The page is js/food.js; the reminders live here so they run on any page. Everything is
            // kept on the phone: isp:nut:<uid> = { set, days: { 'YYYY-MM-DD': { m: [meals], w: [cup times], g } }, sent }.
            NUT_MEALS: { breakfast: ['الفطور', '07:30', 'sunrise'], lunch: ['الغدا', '14:00', 'sun'], dinner: ['العشا', '20:30', 'moon'], snack: ['وجبة خفيفة', '17:00', 'apple'] },
            _nutKey() { return 'isp:nut:' + (this.authUid || 'guest'); },
            _nutGet() {
                let o = null;
                try { o = JSON.parse(localStorage.getItem(this._nutKey()) || 'null'); } catch (e) {}
                o = o && typeof o === 'object' ? o : {};
                o.set = Object.assign({ meals: {}, mealOn: true, waterOn: true, goal: 8, cup: 250, every: 90, from: '08:00', to: '23:00' }, o.set || {});
                Object.keys(this.NUT_MEALS).forEach((k) => { if (!/^\d\d:\d\d$/.test(o.set.meals[k] || '')) o.set.meals[k] = this.NUT_MEALS[k][1]; });
                o.days = o.days || {};
                o.sent = o.sent || {};
                return o;
            },
            _nutSave(o) {
                // two weeks are enough for the page and the tutor
                const keep = Object.keys(o.days).sort().slice(-14);
                Object.keys(o.days).forEach((d) => { if (!keep.includes(d)) delete o.days[d]; });
                Object.keys(o.sent).forEach((k) => { if (k.slice(0, 10) < keep[0]) delete o.sent[k]; });
                try { localStorage.setItem(this._nutKey(), JSON.stringify(o)); } catch (e) {}
            },
            _nutToday() { return this.localDateStr(new Date()); },
            _nutDayOf(o, d) { o.days[d] = o.days[d] || { m: [], w: [] }; return o.days[d]; },
            _nutMin(hhmm) { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); },

            // A cup of water (n = -1 takes the last one back). Reaching the day's goal gives 5 points once.
            nutDrink(n) {
                const o = this._nutGet(), day = this._nutDayOf(o, this._nutToday());
                if (n < 0) day.w.pop(); else day.w.push(Date.now());
                const reached = day.w.length >= o.set.goal && !day.g;
                if (reached) day.g = 1;
                this._nutSave(o);
                if (reached && this.isLoggedIn) {
                    this.addPointsAtomic(5).then((p) => { if (p != null) this.showToast('كمّلت ماي اليوم، +5 نقاط'); });
                }
                if (this.currentView === 'foodView' && this._fdRender) this._fdRender();
                return day.w.length;
            },

            // Once a minute (and whenever the app comes back): is a meal coming up, or time for water?
            _nutStart() {
                if (this._nutT) return;
                this._nutT = setInterval(() => { this._nutTick(); this._coachTick(); this._tbTick(); }, 60000);
                document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => { this._nutTick(); this._tbTick(); }, 1500); });
                setTimeout(() => this._nutTick(), 20000);
            },
            _nutTick() {
                const o = this._nutGet(), s = o.set, now = new Date(), d = this._nutToday();
                const min = now.getHours() * 60 + now.getMinutes();
                const day = o.days[d] || { m: [], w: [] };
                // a call, a focus session or a forest session is never interrupted
                if (this._cl || this._focus || this._forest || this._gwar || this._duelOn) return;
                if (s.mealOn) {
                    for (const k of ['breakfast', 'lunch', 'dinner']) {
                        const t = this._nutMin(s.meals[k]);
                        const key = d + ':' + k;
                        if (min >= t - 15 && min <= t + 45 && !o.sent[key] && !day.m.some((x) => x.meal === k)) {
                            o.sent[key] = 1;
                            this._nutSave(o);
                            this._nutNotify('meal', k, t - min);
                            return;
                        }
                    }
                }
                if (s.waterOn && day.w.length < s.goal) {
                    const from = this._nutMin(s.from), to = this._nutMin(s.to);
                    if (min < from || min > to) return;
                    const start = new Date(now); start.setHours(Math.floor(from / 60), from % 60, 0, 0);
                    const last = Math.max(day.w.length ? day.w[day.w.length - 1] : 0, o.sent[d + ':w'] || 0, start.getTime());
                    if (Date.now() - last >= s.every * 60000) {
                        o.sent[d + ':w'] = Date.now();
                        this._nutSave(o);
                        this._nutNotify('water', null, 0, day.w.length, s.goal);
                    }
                }
            },
            _nutNotify(kind, meal, inMin, cups, goal) {
                if (document.body.classList.contains('mdr-on')) return;   // not on top of the moderators' room
                const M = this.NUT_MEALS[meal] || [];
                const title = kind === 'water' ? 'وكت الماي' : 'قرب موعد ' + M[0];
                const body = kind === 'water'
                    ? 'شربت ' + (cups || 0) + ' من ' + goal + ' أكواب اليوم. كوب ماي هسه يصحّي مخك ويرجعلك التركيز.'
                    : (inMin > 0 ? 'باقي ' + inMin + ' دقيقة على ' + M[0] + '. ' : '') + 'لا تفوّت ' + M[0] + '، الأكل الزين يقوي ذاكرتك. سجّل شنو أكلت حتى أكلك رأيي بيه.';
                if (document.hidden) {
                    if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
                        navigator.serviceWorker.ready.then((r) => r.showNotification(title, { body, tag: 'isp-nut-' + kind, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './' } })).catch(() => {});
                    }
                    return;
                }
                const old = document.getElementById('ntPop');
                if (old) old.remove();
                const p = document.createElement('div');
                p.id = 'ntPop';
                p.className = 'nt-pop ' + kind;
                p.innerHTML = `<span class="nt-ic"><i data-lucide="${kind === 'water' ? 'glass-water' : M[2] || 'utensils'}"></i></span>
                    <div class="nt-tx"><b>${escapeHtml(title)}</b><small>${escapeHtml(body)}</small>
                    <div class="nt-btns"><button type="button" class="nt-ok">${kind === 'water' ? 'شربت كوب' : 'سجّل أكلي'}</button><button type="button" class="nt-no">بعدين</button></div></div>`;
                document.body.appendChild(p);
                lucide.createIcons();
                const close = () => { p.classList.add('out'); setTimeout(() => p.remove(), 300); };
                p.querySelector('.nt-ok').onclick = () => { close(); if (kind === 'water') this.nutDrink(1); else this.goToFood(meal); };
                p.querySelector('.nt-no').onclick = close;
                setTimeout(() => { if (p.isConnected) close(); }, 15000);
            },
            // ----- the tutor's own messages (texts and choice in js/tutor.js _coachSend) -----
            // isp:coach:<uid> = { on, every (minutes), tone, from, to, last, used }. Every 4 hours by
            // default, only between from and to, never during a call or a study/focus session.
            _coachGet() {
                let c = null;
                try { c = JSON.parse(localStorage.getItem('isp:coach:' + (this.authUid || 'guest')) || 'null'); } catch (e) {}
                return Object.assign({ on: true, every: 240, tone: 'mix', from: '09:00', to: '23:00', last: 0, used: [] }, c && typeof c === 'object' ? c : {});
            },
            _coachSave(c) { try { localStorage.setItem('isp:coach:' + (this.authUid || 'guest'), JSON.stringify(c)); } catch (e) {} },
            // the push service skips students who switched the messages off (tag coach=off)
            _coachTag(on) { this._pnTags({ coach: on ? 'on' : 'off' }); },
            // new-video pushes from teachers: on unless the student switched them off in the teachers page
            // Telegram channel pushes: a tag per channel (tg_<name> = on / off). The server pushes a channel's post to the phones that
            // did not mute it (or switch every channel off). `names` is known when the teachers' page is open; otherwise it is read once.
            async _tgTagSync(names) {
                try {
                    const all = this.notifPrefs.tg === false; let mu = []; try { mu = JSON.parse(localStorage.getItem('isp_tg_mute') || '[]'); } catch (e) {}
                    if (!names) {
                        // every channel gets its tag, "on" or "off": the server now sends a teacher's post only to phones that said "on" (positive opt-in)
                        if (this._tgNames && Date.now() - (this._tgNamesAt || 0) < 3600000) names = this._tgNames;
                        else { const { ref, get } = window.firebaseDbHelpers, s = await get(ref(window.firebaseDb, 'tgChannels')); const v = s.exists() ? s.val() : {}; names = Object.keys(v).map((k) => (v[k] && v[k].u) || k); }   // the tag is made from the channel's user name, like the server does
                    }
                    this._tgNames = names; this._tgNamesAt = Date.now();
                    const set = new Set(mu), t = {}; let anyOff = false;
                    // hidden channels (the student's "أساتذتي" choice) get no pushes either; an older version saved the opposite list
                    const lcn = (x) => String(x).toLowerCase(); let hide = null;
                    try { const r = localStorage.getItem('isp_tg_hide'); if (r != null) hide = new Set(JSON.parse(r).map(lcn)); else if (localStorage.getItem('isp_tg_sel') === '1') { const m = new Set(JSON.parse(localStorage.getItem('isp_tg_mine') || '[]').map(lcn)); hide = new Set(names.map(lcn).filter((n) => !m.has(n))); } } catch (e) {}
                    names.forEach((n) => { const off = all || set.has(lcn(n)) || (hide && hide.has(lcn(n))); if (off) anyOff = true; t['tg_' + lcn(n)] = off ? 'off' : 'on'; });
                    const sig = JSON.stringify(t);
                    if (Object.keys(t).length && sig !== this._tgSig && this._pnTags(t) !== false) this._tgSig = sig;
                    try { localStorage.setItem('isp_tg_dirty', anyOff ? '1' : '0'); } catch (e) {}
                } catch (e) {}
            },
            _tubeTag() { this._pnTags({ tube: this.notifPrefs.tube === false ? 'off' : 'on' }); },
            _coachTick() {
                const cfg = this.siteConfig || {};
                if ((cfg.features && cfg.features.coach === false) || !this.isLoggedIn || !this.authUid) return;
                const c = this._coachGet();
                if (!c.on || this._cl || this._focus || this._forest || this._gwar || this._duelOn || this.studyTimerRunning) return;
                const now = new Date(), min = now.getHours() * 60 + now.getMinutes();
                if (min < this._nutMin(c.from) || min > this._nutMin(c.to)) return;
                // the first message comes a while after the app opens, not straight away
                if (!c.last) { c.last = Date.now() - c.every * 60000 + 20 * 60000; this._coachSave(c); return; }
                if (Date.now() - c.last < c.every * 60000) return;
                c.last = Date.now();
                this._coachSave(c);
                this._need('tutor').then(() => this._coachSend && this._coachSend()).catch(() => {});
            },
            // a push from the tutor opened the app (?coach=<text>): it joins the chat with the tutor
            _coachOpen() {
                const t = this._coachPending;
                this._coachPending = null;
                if (!t || !this.isLoggedIn) return;
                this._need('tutor').then(() => {
                    if (!this._coachKnown || !this._coachKnown(t)) return; // not one of the tutor's own messages
                    this._coachDeliver(t);
                    this.setTab('tutor');
                }).catch(() => {});
            },

            // A short line for the tutor's report on the student.
            _nutSummary() {
                const o = this._nutGet(), d = o.days[this._nutToday()];
                if (!d) return '';
                const L = [];
                L.push('شرب ماي اليوم: ' + d.w.length + ' من ' + o.set.goal + ' أكواب.');
                const meals = d.m.filter((x) => x.r && x.r.items && x.r.items.length);
                if (meals.length) L.push('أكله اليوم: ' + meals.map((x) => (this.NUT_MEALS[x.meal] || [''])[0] + ': ' + x.r.items.map((i) => i.name + (i.v === 'bad' ? ' (يضر)' : '')).join('، ')).join(' / '));
                return L.join(' ');
            },
            // ===== The date under the news ticker (e.g. الأحد 2026/1/1) =====
            // Shown for 30 seconds, the first time the home page is seen each day, then it slips away.
            // It comes back for another 30 seconds the next day, or when the student taps three times
            // where it was (the thin strip stays tappable under the ticker).
            _dateText() {
                const d = new Date();
                return ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][d.getDay()] + ' ' + d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
            },
            _dateStripShow() {
                const el = document.getElementById('dateStrip'), tx = document.getElementById('dateStripText');
                if (!el || !tx) return;
                tx.textContent = this._dateText();
                el.classList.remove('off');
                lucide.createIcons();
                clearTimeout(this._dsTimer);
                this._dsTimer = setTimeout(() => el.classList.add('off'), 30000);
            },
            // a new day (or the very first time) and the home page in front of the student
            _dateStripCheck() {
                if (document.hidden || this.currentView !== 'homeView') return;
                const cfg = this.siteConfig || {};
                if (cfg.sections && cfg.sections.dateStrip === false) return;
                const today = this.localDateStr();
                let last = '';
                try { last = localStorage.getItem('isp_date_shown') || ''; } catch (e) {}
                if (last === today) return;
                try { localStorage.setItem('isp_date_shown', today); } catch (e) {}
                this._dateStripShow();
            },
            dateStripTap() {
                const now = Date.now();
                this._dsTaps = (this._dsTaps || []).filter((t) => now - t < 900);
                this._dsTaps.push(now);
                if (this._dsTaps.length >= 3) { this._dsTaps = []; this._dateStripShow(); }
            },
            _dateStripStart() {
                if (this._dsStarted) return;
                this._dsStarted = true;
                // a day that turns while the app stays open
                setInterval(() => this._dateStripCheck(), 30000);
                document.addEventListener('visibilitychange', () => { if (!document.hidden) this._dateStripCheck(); });
                setTimeout(() => this._dateStripCheck(), 1200);
            },

            // ===== ملخص الأسبوع للأهل (js/weekly.js) =====
            goToWeekly() {
                if (!this.isLoggedIn || !this.authUid) { this.showToast('سجّل دخول حتى يطلعلك ملخصك'); this.goToAuth('login'); return; }
                this.switchView('weeklyView');
                if (this._withPart('weekly', () => typeof this.wkOpen === 'function', 'weeklyView', () => this.goToWeekly())) return;
                this.wkOpen();
            },

            // ===== روحانيات: prayer beads, istighfar, duas, Ramadan deeds (js/dhikr.js) =====
            goToDhikr() {
                const cfg = this.siteConfig || {};
                if (cfg.features && cfg.features.dhikr === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                this.switchView('dhikrView');
                if (this._withPart('dhikr', () => typeof this.dkOpen === 'function', 'dhikrView', () => this.goToDhikr())) return;
                this.dkOpen();
            },

            goToHall() {
                const cfg = this.siteConfig || {};
                if (cfg.features && cfg.features.hall === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                this.switchView('hallView');
                if (this._withPart('hall', () => typeof this.hlOpen === 'function', 'hallView', () => this.goToHall())) return;
                this.hlOpen();
            },

            goToPlan() {
                if ((this.siteConfig || {}).features && this.siteConfig.features.plan === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                if (!this.isLoggedIn || !this.authUid) { this.showToast('سجّل دخولك حتى يرتبلك المعلم خطتك'); this.goToAuth('login'); return; }
                this.switchView('planView');
                if (this._withPart('plan', () => typeof this.plOpen === 'function', 'planView', () => this.goToPlan())) return;
                this.plOpen();
            },

            goToExams() {
                const cfg = this.siteConfig || {};
                if (cfg.features && cfg.features.exams === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                this.switchView('examsView');
                if (this._withPart('exams', () => typeof this.exOpen === 'function', 'examsView', () => this.goToExams())) return;
                this.exOpen();
            },
            exBackBtn() {
                if (document.getElementById('exPaper')) { this.exClosePaper(); return; }
                if (this.exBack && this.exBack()) return;
                this.goBack();
            },

            goToNotes() {
                const cfg = this.siteConfig || {};
                if (cfg.features && cfg.features.notes === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                this.switchView('notesView');
                if (typeof this.ntOpen !== 'function') {
                    this._need('notegeom').then(() => this._need('notes')).then(() => { if (this.currentView === 'notesView') this.goToNotes(); })
                        .catch(() => this.showToast('ما انحملت الصفحة، تأكد من النت وحاول مرة ثانية'));
                    return;
                }
                this.ntOpen();
            },

            goToTg() {
                const cfg = this.siteConfig || {};
                if (cfg.features && cfg.features.tgteachers === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                this.switchView('tgView');
                if (this._withPart('tgroom', () => typeof this.tgOpen === 'function', 'tgView', () => this.goToTg())) return;
                this.tgOpen();
            },

            goToTube() {
                const cfg = this.siteConfig || {};
                if (cfg.features && cfg.features.tube === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                this.switchView('tubeView');
                if (this._withPart('ytube', () => typeof this.tuOpen === 'function', 'tubeView', () => this.goToTube())) return;
                this.tuOpen();
            },

            goToTable() {
                const cfg = this.siteConfig || {};
                if (cfg.features && cfg.features.table === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                this.switchView('tableView');
                if (this._withPart('table', () => typeof this.tbOpen === 'function', 'tableView', () => this.goToTable())) return;
                this.tbOpen();
            },

            goToTimer() {
                const cfg = this.siteConfig || {};
                if (cfg.features && cfg.features.timer === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                this.switchView('tmView');
                if (this._withPart('timer', () => typeof this.tmOpen === 'function', 'tmView', () => this.goToTimer())) return;
                this.tmOpen();
            },

            // the owl advisor (js/mascot.js) is loaded a few seconds after the start; these two are its doors
            _mcExams() { return examSchedule.slice(); },
            openMascot() { this._need('mascot').then(() => this.mcSettings()).catch(() => this.showToast('ما انحملت الصفحة، حاول مرة ثانية')); },

            // live duel (js/duel.js): the page, and the card that pops up when a friend challenges you
            goToDuel(rid) {
                const cfg = this.siteConfig || {};
                if (cfg.features && cfg.features.duel === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                if (!this.isLoggedIn || !this.authUid) { this.showToast('سجّل دخولك حتى تتحدى'); this.goToAuth('login'); return; }
                this.switchView('duelView');
                if (this._withPart('duel', () => typeof this.dlOpen === 'function', 'duelView', () => this.goToDuel(rid))) return;
                this.dlOpen(rid);
            },
            listenForDuelInv() {
                if (!window.firebaseDb || !this.authUid || this._dlInvListener) return;
                const { ref, onValue } = window.firebaseDbHelpers, since = Date.now() - 5000;
                this._dlInvListener = onValue(ref(window.firebaseDb, 'duelInv/' + this.authUid), (snap) => {
                    const v = snap.val() || {}, lim = Date.now() - 10 * 60000;
                    this._dlInvites = Object.keys(v).map((rid) => Object.assign({ rid }, v[rid])).filter((x) => (x.at || 0) > lim).sort((a, b) => (b.at || 0) - (a.at || 0));
                    const fresh = this._dlInvites.find((x) => (x.at || 0) > since && !(this._dlShown || {})[x.rid]);
                    if (fresh && !(this.currentView === 'duelView')) {
                        this._dlShown = this._dlShown || {}; this._dlShown[fresh.rid] = 1;
                        document.getElementById('dlInvCard')?.remove();
                        const el = document.createElement('div'); el.id = 'dlInvCard'; el.className = 'yr-pop rm-pop';
                        el.innerHTML = `<i data-lucide="swords"></i><div><b>${escapeHtml(fresh.fn || 'صديقك')} يتحداك بتحدي مباشر</b><small>اقبل وابدأ هسه</small></div>
                            <button class="go" onclick="document.getElementById('dlInvCard').remove(); app.goToDuel(${jsArg(fresh.rid)})">اقبل</button>
                            <button onclick="document.getElementById('dlInvCard').remove()" aria-label="بعدين"><i data-lucide="x"></i></button>`;
                        document.body.appendChild(el); lucide.createIcons(); this.playNotifySound && this.playNotifySound(); setTimeout(() => el.remove(), 20000);
                    }
                    if (this.currentView === 'duelView' && this.dlRefresh) this.dlRefresh();
                }, () => {});
                if (this._dlPending) { const rid = this._dlPending; this._dlPending = null; try { history.replaceState(history.state, '', location.pathname); } catch (e) {} setTimeout(() => this.goToDuel(rid), 800); }
            },

            goToInvite() {
                const cfg = this.siteConfig || {};
                if (cfg.features && cfg.features.invite === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                this.switchView('inviteView');
                if (this._withPart('invite', () => typeof this.ivOpen === 'function', 'inviteView', () => this.goToInvite())) return;
                this.ivOpen();
            },

            // home banner that sends students to the invite page; closing it hides it for 10 days
            renderInviteBanner() {
                const sec = document.getElementById('inviteSection'), box = document.getElementById('inviteBanner');
                if (!sec || !box) return;
                let hide = false;
                try { hide = Date.now() - numOr0(localStorage.getItem('isp_inv_hide')) < 864e6; } catch (e) {}
                const off = !!(this.siteConfig && this.siteConfig.features && this.siteConfig.features.invite === false);
                sec.classList.toggle('hidden', hide || off);
                if (hide || off || box.dataset.on) return;
                box.dataset.on = '1';
                box.innerHTML = '<button class="iv-ban-go btn-press" onclick="app.goToInvite()"><span class="iv-ban-ic"><i data-lucide="megaphone"></i></span><span class="iv-ban-t"><b>ادعُ زملاءك للتطبيق</b><small>شارك رابطك على واتساب وتلغرام وانستغرام</small></span></button><button class="iv-ban-x" aria-label="إخفاء" onclick="app.hideInviteBanner()"><i data-lucide="x"></i></button>';
                try { lucide.createIcons(); } catch (e) {}
            },
            hideInviteBanner() { try { localStorage.setItem('isp_inv_hide', String(Date.now())); } catch (e) {} document.getElementById('inviteSection')?.classList.add('hidden'); },

            // a new student who arrived through a friend's link (?ref=<uid>) is written under that friend once
            _refRegister(uid) {
                try {
                    const o = JSON.parse(localStorage.getItem('isp_ref') || 'null');
                    if (!o || !o.c || o.c === uid || Date.now() - o.t > 30 * 864e5 || !window.firebaseDb) { localStorage.removeItem('isp_ref'); return; }
                    const { ref, set } = window.firebaseDbHelpers;
                    set(ref(window.firebaseDb, 'refJoin/' + o.c + '/' + uid), Date.now()).catch(() => {}).then(() => { try { localStorage.removeItem('isp_ref'); } catch (e) {} });
                } catch (e) {}
            },

            goToMoney() {
                const cfg = this.siteConfig || {};
                if (cfg.features && cfg.features.money === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                this.switchView('moneyView');
                if (this._withPart('money', () => typeof this.mnOpen === 'function', 'moneyView', () => this.goToMoney())) return;
                this.mnOpen();
            },
            // the money page (js/money.js) keeps a one-line summary next to its data; the tutor reads it
            _mnSummary() {
                try {
                    const o = JSON.parse(localStorage.getItem('isp:mn:sum:' + (this.authUid || 'guest')) || 'null');
                    if (!o || !o.t) return '';
                    const days = Math.floor((Date.now() - o.at) / 864e5);
                    return o.t + (days >= 2 ? ' (آخر تحديث قبل ' + days + ' أيام)' : '');
                } catch (e) { return ''; }
            },

            // the weekly lecture timetable (js/table.js) is kept on the phone; the tutor reads this summary
            _tbKey() { return 'isp:tb:' + (this.authUid || 'guest'); },
            _tbGet() {
                try { const o = JSON.parse(localStorage.getItem(this._tbKey()) || 'null'); return o && o.v === 1 && Array.isArray(o.times) && o.subs && o.days && o.cells ? o : null; } catch (e) { return null; }
            },
            _tbSummary() {
                const d = this._tbGet();
                if (!d) return '';
                const NM = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                const nm = (id) => { const s = d.subs.find((x) => x.id === id); return s ? s.n : ''; };
                const day = (g) => (d.cells[g] || []).map((c, i) => (c && nm(c.s) ? nm(c.s) + ' (' + d.times[i][0] + ')' : '')).filter(Boolean);
                const work = [6, 0, 1, 2, 3, 4, 5].filter((g) => d.days[g] === 1);
                const per = {}; let total = 0;
                work.forEach((g) => (d.cells[g] || []).forEach((c) => { if (c && nm(c.s)) { per[nm(c.s)] = (per[nm(c.s)] || 0) + 1; total++; } }));
                if (!total) return '';
                const L = ['جدول محاضراته الأسبوعي (' + total + ' محاضرة): ' + work.map((g) => NM[g] + ': ' + (day(g).map((x) => x.replace(/ \(.*\)/, '')).join('، ') || 'فاضي')).join(' | ')];
                L.push('عدد محاضرات كل مادة بالأسبوع: ' + Object.keys(per).map((k) => k + ' ' + per[k]).join('، '));
                const off = [0, 1, 2, 3, 4, 5, 6].filter((g) => d.days[g] === 2).map((g) => NM[g]);
                if (off.length) L.push('أيام العطلة: ' + off.join('، '));
                const now = new Date(), g = now.getDay(), tm = new Date(now.getTime() + 86400000).getDay();
                const t = (x) => (d.days[x] === 2 ? 'عطلة' : d.days[x] === 1 ? (day(x).join('، ') || 'ماكو محاضرات') : 'مو من أيام جدوله');
                L.push('اليوم (' + NM[g] + '): ' + t(g) + '. باچر (' + NM[tm] + '): ' + t(tm) + '. الساعة هسه ' + now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') + '.');
                return L.join('\n').slice(0, 1000);
            },

            // A reminder a few minutes before each lecture (settings d.rem = { on, before } in the timetable).
            // It runs while the app is open or in the background; a closed app can't wake itself.
            // Tell the server a call or a message was just written, so it can push to the receiver's phone (the server
            // checks the record itself, see notifyPush in the Worker). Fire and forget.
            async _notifyPush(kind, to, mid) {
                let step = 'start';
                try {
                    const url = this._tutorUrl();
                    if (!/^https:\/\/[^\s]+$/.test(String(url || '')) || !window.firebaseAuth || !window.firebaseAuth.currentUser) return;
                    step = 'token';
                    const token = await window.firebaseAuth.currentUser.getIdToken();
                    step = 'request';
                    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ mode: 'notify', kind, to, mid }) });
                    if (!res.ok) {
                        let code = '';
                        try { code = (await res.json()).error || ''; } catch (e) {}
                        // a call or message that is already over (declined, answered or taken back before the request arrived) is normal, not an error
                        if (res.status === 409 && (code === 'no_call' || code === 'no_msg')) return;
                        // shows in the panel's error page, so a push that does not go out is not a silent failure
                        this._reportError({ msg: 'push ' + kind + ' refused: ' + res.status + ' ' + code, src: 'notify', line: 0 });
                    }
                } catch (e) {
                    this._reportError({ msg: 'push ' + kind + ' could not be asked (' + step + '): ' + String(e && e.message || e).replace(/Failed to fetch|Load failed|NetworkError/gi, 'network error').slice(0, 80), src: 'notify', line: 0 });
                }
            },
            // a tap on a call or message push: open that chat once the student is signed in
            // A tapped notification lands where it is about: a teacher's new video (on that teacher), a Telegram channel, a news, new handouts,
            // the day-off page, the timetable. `x` = the notification's own data. It waits until the app is ready, then opens.
            _pushOpen(x) {
                x = x || {};
                if (typeof x.tube === 'string' && /^[A-Za-z0-9_-]{11}$/.test(x.tube)) this._goPending = { go: 'tube', id: x.tube, ch: String(x.ch || '') };
                else if (typeof x.tg === 'string' && x.tg) this._goPending = { go: 'tg', id: x.tg };
                else if (x.tb) this._goPending = { go: 'table' };
                else if (typeof x.go === 'string' && /^(news|res|holiday)$/.test(x.go)) this._goPending = { go: x.go, id: String(x.id || '') };
                else return false;
                this._pushRun();
                return true;
            },
            _pushRun() {
                const g = this._goPending; if (!g || !this._pushReady) return;
                this._goPending = null;
                try { history.replaceState(history.state, '', location.pathname); } catch (e) {}
                const id = String(g.id || '');
                setTimeout(() => {
                    try {
                        if (g.go === 'news' && /^\d{6,16}$/.test(id)) this._pushOpenNews(Number(id));
                        else if (g.go === 'tube' && /^[A-Za-z0-9_-]{11}$/.test(id)) { this._tuWant = /^UC[\w-]{22}$/.test(g.ch || '') ? g.ch : ''; this.goToTube(); this._need('ytube').then(() => this.tuPlay && this.tuPlay(id)).catch(() => {}); }
                        else if (g.go === 'tg' && /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(id)) this._need('tgroom').then(() => this.tgGo(id)).catch(() => {});
                        else if (g.go === 'res') this.goToResources();
                        else if (g.go === 'holiday') this.goToHolidays();
                        else if (g.go === 'table') this.goToTable();
                    } catch (e) { console.warn('push open failed', e); }
                }, 700);
            },
            // the news may not have been downloaded yet (a fresh one, a cold start): ask for it, then open it
            async _pushOpenNews(id) {
                if (!newsData.some((n) => n.id === id)) {
                    try {
                        const { ref, get } = window.firebaseDbHelpers, s = await get(ref(window.firebaseDb, 'news/' + id));
                        if (s.exists()) { const n = withNumericIds([s.val()])[0]; if (n && !newsData.some((x) => x.id === id)) { newsData.push(n); newsData.sort((a, b) => b.id - a.id); try { this.applyUserNewsState(); this.renderNews(); } catch (e) {} } }
                    } catch (e) { /* offline: the toast below */ }
                }
                if (newsData.some((n) => n.id === id)) this.openNews(id); else this.showToast('ما لكيت هذا الخبر');
            },
            _openChatFromPush(uid, name) {
                if (!uid) return;
                let n = 0;
                const go = () => {
                    if (this.isLoggedIn && this.authUid) { try { this.openChat(uid, name || undefined); } catch (e) {} return; }
                    if (++n < 30) setTimeout(go, 500);
                };
                go();
            },
            // while the app is open the call rings by itself and a chat that is open shows its message
            _pushIsRedundant(extra) {
                if (!extra || !extra.kind) return false;
                if (extra.kind === 'call') return true;
                return this.currentView === 'chatThreadView' && this.currentChatUid === extra.from;
            },
            // The tutor Worker's address: the panel's value when it is a real https address, otherwise the Worker this
            // project deploys (an empty or broken value used to switch the tutor, the call relay and the pushes off
            // without anyone noticing). The tutor itself can be switched off from the panel (features.tutor).
            _tutorUrl() {
                const c = this.siteConfig || {};
                if (c.features && c.features.tutor === false) return '';
                const u = typeof c.tutorUrl === 'string' ? c.tutorUrl.trim().replace(/\/+$/, '') : '';
                return /^https:\/\/[^\s]+$/.test(u) ? u : 'https://isp-tutor.efceg-xsax.workers.dev';
            },
            _tbPushOn() {
                try { return !!(JSON.parse(localStorage.getItem('isp:tb:push:' + (this.authUid || 'guest')) || '{}').ids || []).length; } catch (e) { return false; }
            },
            // Schedules the next two days of lecture reminders on the server (through the tutor Worker and
            // OneSignal) so they arrive even when the app is closed; cancels the old ones first. Cheap
            // when nothing changed: it only talks to the server when the schedule differs or 12 hours passed.
            async _tbPushSync(force) {
                if (this._tbPB) { this._tbPQ = this._tbPQ || !!force || 1; return; }
                this._tbPB = true;
                try {
                    await this._tbPushRun(force);
                } finally {
                    this._tbPB = false;
                    const q = this._tbPQ; this._tbPQ = 0;
                    if (q) this._tbPushSync(q === true);
                }
            },
            async _tbPushRun(force) {
                try {
                    const url = this._tutorUrl();
                    if (!/^https:\/\/[^\s]+$/.test(String(url || '')) || !this.isLoggedIn || !this.authUid || !window.firebaseAuth || !window.firebaseAuth.currentUser) return;
                    const d = this._tbGet(), key = 'isp:tb:push:' + this.authUid;
                    let st = {};
                    try { st = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) {}
                    st.ids = st.ids || [];
                    const on = !!(d && d.rem && d.rem.on && this._pushPerm() === 'granted' && this._os && this._pnOn('lec'));
                    const items = [];
                    if (on) {
                        const now = Date.now();
                        for (let k = 0; k < 3; k++) {
                            const day = new Date(now + k * 86400000), g = day.getDay();
                            if (d.days[g] !== 1) continue;
                            (d.cells[g] || []).forEach((c, p) => {
                                const sb = c && d.subs.find((x) => x.id === c.s);
                                if (!sb || !d.times[p]) return;
                                const t = String(d.times[p][0]).split(':'), at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +t[0], +t[1] - d.rem.before, 0, 0).getTime();
                                if (at > now + 30000) items.push({ at, title: 'محاضرة ' + sb.n + ' بعد ' + d.rem.before + ' دقيقة', body: 'الساعة ' + d.times[p][0] + (c.t ? ' - ' + c.t : '') + '. جهّز كتابك ودفترك.' });
                            });
                        }
                        items.sort((a, b) => a.at - b.at);
                        items.length = Math.min(items.length, 14);
                    }
                    const sig = JSON.stringify(items.map((i) => [i.at, i.title]));
                    if (st.sig === sig && Date.now() - (st.t || 0) < 12 * 3600000) return;
                    if (!items.length && !st.ids.length) { st = { ids: [], sig, t: Date.now() }; localStorage.setItem(key, JSON.stringify(st)); return; }
                    const token = await window.firebaseAuth.currentUser.getIdToken();
                    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ mode: 'tbsync', items, cancel: st.ids }) });
                    if (!res.ok) return;
                    const j = await res.json();
                    localStorage.setItem(key, JSON.stringify({ ids: Array.isArray(j.ids) ? j.ids : [], sig, t: Date.now() }));
                } catch (e) { /* the in-app reminders still work */ }
            },
            _tbTick() {
                this._tbPushSync();
                const d = this._tbGet();
                if (!d || !d.rem || !d.rem.on || !this._pnOn('lec') || this._cl || this._focus || this._forest || this._gwar || this._duelOn) return;
                const now = new Date(), g = now.getDay(), min = now.getHours() * 60 + now.getMinutes();
                if (d.days[g] !== 1) return;
                const day = this.localDateStr(), key = 'isp:tb:sent:' + (this.authUid || 'guest');
                let sent = {};
                try { sent = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) {}
                if (sent.d !== day) sent = { d: day, p: {} };
                for (let p = 0; p < d.times.length; p++) {
                    const c = (d.cells[g] || [])[p], sb = c && d.subs.find((x) => x.id === c.s);
                    if (!sb || sent.p[p]) continue;
                    const t = String(d.times[p][0]).split(':'), at = (+t[0]) * 60 + (+t[1]);
                    if (min >= at - d.rem.before && min < at) {
                        sent.p[p] = 1;
                        try { localStorage.setItem(key, JSON.stringify(sent)); } catch (e) {}
                        this._tbNotify(sb.n, at - min, d.times[p][0], c.t);
                        return;
                    }
                }
            },
            _tbNotify(name, left, at, note) {
                const title = 'محاضرة ' + name + (left > 0 ? ' بعد ' + left + ' دقيقة' : ' هسه');
                const body = 'الساعة ' + at + (note ? ' - ' + note : '') + '. جهّز كتابك ودفترك.';
                if (document.hidden) {
                    if (this._tbPushOn()) return; // the server's push shows it
                    if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
                        navigator.serviceWorker.ready.then((r) => r.showNotification(title, { body, tag: 'isp-tb', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './' } })).catch(() => {});
                    }
                    return;
                }
                const old = document.getElementById('ntPop'); if (old) old.remove();
                const p = document.createElement('div');
                p.id = 'ntPop'; p.className = 'nt-pop tb';
                p.innerHTML = `<span class="nt-ic"><i data-lucide="calendar-clock"></i></span><div class="nt-tx"><b>${escapeHtml(title)}</b><small>${escapeHtml(body)}</small><div class="nt-btns"><button type="button" class="nt-ok">جدولي</button><button type="button" class="nt-no">تمام</button></div></div>`;
                document.body.appendChild(p);
                lucide.createIcons();
                const close = () => { p.classList.add('out'); setTimeout(() => p.remove(), 300); };
                p.querySelector('.nt-ok').onclick = () => { close(); this.goToTable(); };
                p.querySelector('.nt-no').onclick = close;
                setTimeout(() => { if (p.isConnected) close(); }, 15000);
            },

            goToFood(meal) {
                this._fdMeal = typeof meal === 'string' ? meal : null;
                this.switchView('foodView');
                if (this._withPart('food', () => typeof this.fdOpen === 'function', 'foodView', () => this.goToFood(meal))) return;
                this.fdOpen();
            },

            // ===== صندوق الأفكار: students suggest features and vote (js/ideas.js) =====
            goToIdeas() {
                this.switchView('ideasView');
                if (typeof this.idOpen === 'function' && window.ventCheck) { this.idOpen(); return; }
                this._need('ventfilter').then(() => this._need('ideas')).then(() => { if (this.currentView === 'ideasView') this.idOpen(); })
                    .catch(() => this.showToast('ما انحملت الصفحة، تأكد من النت وحاول مرة ثانية'));
            },

            // ===== فضفضة: anonymous venting with a word filter (js/ventfilter.js + js/vent.js) =====
            goToVent() {
                this.switchView('ventView');
                if (typeof this.vtOpen === 'function' && window.ventCheck) { this.vtOpen(); return; }
                this._need('ventfilter').then(() => this._need('vent')).then(() => { if (this.currentView === 'ventView') this.vtOpen(); })
                    .catch(() => this.showToast('ما انحملت الصفحة، تأكد من النت وحاول مرة ثانية'));
            },

            // ===== أماكن الدراسة: study places on a street map (js/spots.js) =====
            goToSpots() {
                this.switchView('spotsView');
                if (this._withPart('spots', () => typeof this.spOpen === 'function', 'spotsView', () => this.goToSpots())) return;
                this.spOpen();
            },

            // ===== خارطة الطلاب: students per governorate, today's moods, floating reactions (js/moodmap.js) =====
            goToMoodMap() {
                this.switchView('moodMapView');
                if (typeof this.mmOpen !== 'function' || typeof IRAQ_GEO === 'undefined') {
                    this._need('maps').then(() => this._need('moodmap')).then(() => { if (this.currentView === 'moodMapView') this.mmOpen(); })
                        .catch(() => this.showToast('ما انحملت الخارطة، تأكد من النت وحاول مرة ثانية'));
                    return;
                }
                this.mmOpen();
            },

            // studentMap/{uid}: the student's governorate and today's mood, for the students' map.
            // Once a day on its own; `force` after a change or while the map is open.
            // Voice calls (js/calls.js): a ring for this student opens the incoming-call screen.
            _clRingListen() {
                if (this._clRingOff || !window.firebaseDb || !this.authUid) return;
                const { ref, onChildAdded } = window.firebaseDbHelpers;
                this._clRingOff = onChildAdded(ref(window.firebaseDb, 'callRing/' + this.authUid), (snap) => {
                    const r = snap.val();
                    if (!r || !r.id) return;
                    this._need('calls').then(() => this._clIncoming(snap.key, r)).catch(() => {});
                });
            },
            goCall() {
                if (typeof this.clCall === 'function') { this.clCall(); return; }
                this._need('calls').then(() => this.clCall()).catch(() => this.showToast('ما انحمل الاتصال، تأكد من النت'));
            },

            _smPing(force) {
                if (!window.firebaseDb || !this.authUid) return Promise.resolve();
                const g = this._myGov();
                if (!g) return Promise.resolve();
                const today = this.localDateStr(), k = 'isp_sm_' + this.authUid;
                let last = '';
                try { last = localStorage.getItem(k) || ''; } catch (e) {}
                if (!force && last === today + '|' + g) return Promise.resolve();
                const mood = this._moodsLoad()[today];
                const { ref, update, serverTimestamp } = window.firebaseDbHelpers;
                const o = { g, t: serverTimestamp() };
                if (mood) { o.m = mood; o.d = today; }
                return update(ref(window.firebaseDb, 'studentMap/' + this.authUid), o)
                    .then(() => { try { localStorage.setItem(k, today + '|' + g); } catch (e) {} })
                    .catch((e) => console.warn('Students map update failed:', e));
            },

            // ===== شجرتي: a solo focus timer with a 3D tree (js/gardenui.js + js/garden.js) =====
            // ===== رحلة الطالب الجوية: a real map, a real route, a plane that flies it while the student studies (js/flights.js, js/flightsui.js) =====
            goToFlights() {
                if (this.siteConfig && this.siteConfig.features && this.siteConfig.features.flights === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                this.switchView('flightsView');
                this._need('flightmath').then(() => this._need('flights')).then(() => this._need('flightsui'))
                    .then(() => { if (this.currentView === 'flightsView') this.flOpen(); })
                    .catch(() => this.showToast('ما انحملت الصفحة، تأكد من النت وحاول مرة ثانية'));
            },
            // a small reminder on the other pages while a flight is running (the flight itself is only a start time and a length, kept on the phone)
            _flChipTick() {
                let f = null; try { f = JSON.parse(localStorage.getItem('isp_fl_active') || 'null'); } catch (e) {}
                let el = document.getElementById('flChip');
                const on = f && f.s && f.du && this.isLoggedIn && f.uid === this.authUid && this.currentView !== 'flightsView';
                if (!on) { if (el) el.remove(); return; }
                const left = f.s + f.du - Date.now(), t = Math.max(0, Math.ceil(left / 1000)), p2 = (n) => String(n).padStart(2, '0');
                const txt = left > 0 ? p2(Math.floor(t / 3600)) + ':' + p2(Math.floor((t % 3600) / 60)) + ':' + p2(t % 60) : 'وصلت الرحلة';
                if (!el) { el = document.createElement('button'); el.id = 'flChip'; el.className = 'fl-chip'; el.setAttribute('aria-label', 'رحلتك الجوية'); el.onclick = () => this.goToFlights(); el.innerHTML = '<i data-lucide="plane"></i><span></span>'; document.body.appendChild(el); try { lucide.createIcons(); } catch (e) {} }
                const sp = el.querySelector('span'); if (sp && sp.textContent !== txt) sp.textContent = txt;
            },

            goToGarden() {
                this.switchView('gardenView');
                if (this._withPart('gardenui', () => typeof this.gdOpen === 'function', 'gardenView', () => this.goToGarden())) return;
                this.gdOpen();
            },
            // a session still saved at start-up means the app was closed during it
            checkInterruptedGarden() {
                let saved = null;
                try { saved = JSON.parse(localStorage.getItem('isp_garden_session') || 'null'); } catch (e) {}
                if (!saved) return;
                try { localStorage.removeItem('isp_garden_session'); } catch (e) {}
                const u = this.currentUser || {};
                this.saveFocusStats({ gardenDead: numOr0(u.gardenDead) + 1 });
                setTimeout(() => this.showToast('ذبلت شجرتك لأن التطبيق انسد قبل ما تخلص الجلسة'), 1500);
            },

            goToDreams() {
                this.listenForDreams();
                this.switchView('dreamsView');
                if (this._withPart('dreams', () => typeof DreamSky !== 'undefined', 'dreamsView', () => this.goToDreams())) return;
                const root = document.getElementById('drRoot');
                if (!this._sky && root) {
                    this._sky = new DreamSky(root, (id) => this.openDream(id));
                    this._sky.onMode = (m) => document.querySelectorAll('.dr-modes button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-m') === m));
                }
                if (this._sky) {
                    this._sky.setPool(this._dreamPool());
                    this._sky.start(() => this.currentView === 'dreamsView' && !document.hidden);
                }
                this._renderDreamCount();
                lucide.createIcons();
            },

            dreamMode(m) { if (this._sky) this._sky.setMode(m, true); },

            _drClose() { ['drSheet', 'drView', 'drMine'].forEach((id) => document.getElementById(id)?.classList.add('hidden')); this._drMineOpen = false; },

            openDreamWriter() {
                if (!this.isLoggedIn || !this.authUid) { this.showToast('سجّل دخولك حتى تطلق حلمك'); this.goToAuth('login'); return; }
                this._drClose();
                const mine = (this._dreams || []).filter((d) => d.o === this._dreamOwner());
                const box = document.getElementById('drSheet');
                if (!box) return;
                if (mine.length >= 3) {
                    box.innerHTML = `<div class="dr-panel"><b class="dr-h">عندك 3 أحلام بالسما</b><p class="dr-p">احذف واحد من "أحلامي" حتى تكدر تطلق حلم جديد.</p><div class="dr-btns"><button class="pri" onclick="app.openMyDreams()">أحلامي</button><button onclick="app._drClose()">رجوع</button></div></div>`;
                } else {
                    this._drCat = this._drCat || 'study';
                    box.innerHTML = `
                        <div class="dr-panel">
                            <b class="dr-h">شنو حلمك؟</b>
                            <p class="dr-p">اكتبه بجملة وحدة، وخلي طلاب العراق يشوفونه ويكولون "آمين"</p>
                            <textarea id="drText" maxlength="120" rows="3" placeholder="مثلاً: أصير طبيبة وأفتح عيادة مجانية بمدينتي" oninput="document.getElementById('drLen').textContent = this.value.length + '/120'"></textarea>
                            <div class="dr-len" id="drLen">0/120</div>
                            <div class="dr-cats">${this.DREAM_CATS.map(([k, l, ic]) => `<button class="${k === this._drCat ? 'on' : ''}" onclick="app._drCat='${k}';this.parentNode.querySelectorAll('button').forEach(b=>b.classList.remove('on'));this.classList.add('on')"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div>
                            <label class="dr-name"><input type="checkbox" id="drShowName"><span>يطلع اسمي الأول${this.currentUser && this.currentUser.fullName ? ' (' + escapeHtml(String(this.currentUser.fullName).split(/\s+/)[0]) + ')' : ''}، وإلا يطلع "طالب${this._dsGov() ? ' من ' + escapeHtml(this._dsGov()) : ''}"</span></label>
                            <div class="dr-btns"><button class="pri" id="drSend" onclick="app.postDream()"><i data-lucide="send"></i>أطلق حلمي</button><button onclick="app._drClose()">رجوع</button></div>
                        </div>`;
                }
                box.classList.remove('hidden');
                lucide.createIcons();
                setTimeout(() => document.getElementById('drText')?.focus(), 250);
            },

            postDream() {
                const ta = document.getElementById('drText');
                const raw = String(ta ? ta.value : '').replace(/\s+/g, ' ').trim();
                if (raw.length < 4) { this.showToast('اكتب حلمك أول'); return; }
                const f = filterBadWords(raw);
                if (f.filtered) { this.showToast('حلمك بيه كلمات غير مناسبة، عدّله'); return; }
                let lastAt = 0;
                try { lastAt = Number(localStorage.getItem('isp_dream_last')) || 0; } catch (e) {}
                if (Date.now() - lastAt < 5 * 60000) { this.showToast('انتظر شوية قبل ما تطلق حلم ثاني'); return; }
                if (!window.firebaseDb) { this.showToast('تحتاج إنترنت حتى تطلق حلمك'); return; }
                const showName = !!document.getElementById('drShowName')?.checked;
                const first = showName && this.currentUser && this.currentUser.fullName ? filterBadWords(String(this.currentUser.fullName).split(/\s+/)[0]).clean.slice(0, 20) : '';
                const id = 'd' + Date.now() + Math.random().toString(36).slice(2, 6);
                const rec = { id, t: raw.slice(0, 120), c: this.DREAM_CATS.some((x) => x[0] === this._drCat) ? this._drCat : 'other', g: this._myGov() || this._dsGov() || '', n: first, o: this._dreamOwner(), at: Date.now(), amen: 0 };
                const { ref, set } = window.firebaseDbHelpers;
                const btn = document.getElementById('drSend');
                if (btn) btn.disabled = true;
                set(ref(window.firebaseDb, 'dreams/' + id), rec).then(() => {
                    try { localStorage.setItem('isp_dream_last', String(Date.now())); } catch (e) {}
                    this._drClose();
                    const fab = document.querySelector('.dr-fab');
                    const r = fab ? fab.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight - 120, width: 0, height: 0 };
                    const root = document.getElementById('drRoot').getBoundingClientRect();
                    if (this._sky) {
                        this._sky.launch(r.left - root.left + r.width / 2, r.top - root.top + r.height / 2);
                        setTimeout(() => {
                            const d = (this._dreams || []).find((x) => x.id === id) || { ...rec, by: (first || 'طالب') + (rec.g ? ' من ' + rec.g : '') };
                            this._sky.featured(d);
                        }, 1150);
                    }
                    this.showToast('حلمك طار للسما');
                }).catch(() => { if (btn) btn.disabled = false; this.showToast('تعذر الإرسال، حاول مرة ثانية'); });
            },

            openDream(id) {
                const d = (this._dreams || []).find((x) => x.id === id);
                const box = document.getElementById('drView');
                if (!d || !box) return;
                this._drClose();
                const cat = this.DREAM_CATS.find((x) => x[0] === d.c) || this.DREAM_CATS[4];
                let said = false;
                try { said = (JSON.parse(localStorage.getItem('isp_amen') || '[]') || []).indexOf(d.id) !== -1; } catch (e) {}
                box.innerHTML = `
                    <div class="dr-panel dr-one">
                        <span class="dr-cat"><i data-lucide="${cat[2]}"></i>${cat[1]}</span>
                        <p class="dr-big">${escapeHtml(d.t)}</p>
                        <small class="dr-by">${escapeHtml(d.by)} · ${timeAgo(d.at)}</small>
                        <div class="dr-btns">
                            <button class="pri amen${said ? ' done' : ''}" id="drAmen" onclick="app.sayAmen(${jsArg(d.id)})"><i data-lucide="hand-heart"></i>آمين <b id="drAmenN">${d.amen}</b></button>
                            <button onclick="app.shareDream(${jsArg(d.id)})"><i data-lucide="image"></i>شارك</button>
                            ${d.o && d.o === this.authUid ? '' : `<button onclick="app.reportContent({ type: 'dream', targetUid: ${jsArg(d.o || '')}, ref: ${jsArg('dreams/' + d.id)}, snippet: ${jsArg(d.t)} })" aria-label="إبلاغ"><i data-lucide="flag"></i></button>`}
                            <button class="x" onclick="app._drClose()" aria-label="إغلاق"><i data-lucide="x"></i></button>
                        </div>
                    </div>`;
                box.classList.remove('hidden');
                lucide.createIcons();
            },

            sayAmen(id) {
                let list = [];
                try { list = JSON.parse(localStorage.getItem('isp_amen') || '[]') || []; } catch (e) {}
                if (!Array.isArray(list)) list = [];
                const btn = document.getElementById('drAmen');
                if (list.indexOf(id) !== -1) { this.showToast('كلت آمين قبل، الله يحققلهم'); return; }
                list.push(id);
                try { localStorage.setItem('isp_amen', JSON.stringify(list.slice(-500))); } catch (e) {}
                if (btn) {
                    btn.classList.add('done');
                    const n = document.getElementById('drAmenN');
                    if (n) n.textContent = numOr0(n.textContent) + 1;
                    const r = btn.getBoundingClientRect(), root = document.getElementById('drRoot').getBoundingClientRect();
                    if (this._sky) { this._sky._burst(r.left - root.left + r.width / 2, r.top - root.top, [255, 214, 120], 36); }
                }
                if (!window.firebaseDb) return;
                const { ref, runTransaction } = window.firebaseDbHelpers;
                runTransaction(ref(window.firebaseDb, 'dreams/' + id + '/amen'), (c) => numOr0(c) + 1).catch(() => {});
            },

            shareDream(id) {
                const d = (this._dreams || []).find((x) => x.id === id);
                if (!d) return;
                this.openStory({ badge: 'حلم من سما الأحلام', badgeColor: '#7C3AED', title: d.t, sub: d.by + (d.amen ? ' · ' + d.amen + ' طالب كالوا آمين' : ''), foot: 'اكتب حلمك إنت هم بأكـادمي السادس' });
            },

            openMyDreams() {
                const box = document.getElementById('drMine');
                if (!box) return;
                ['drSheet', 'drView'].forEach((i) => document.getElementById(i)?.classList.add('hidden'));
                this._drMineOpen = true;
                const mine = (this._dreams || []).filter((d) => d.o === this._dreamOwner());
                box.innerHTML = `
                    <div class="dr-panel">
                        <b class="dr-h">أحلامي</b>
                        ${mine.length ? mine.map((d) => `
                            <div class="dr-mine">
                                <div><p>${escapeHtml(d.t)}</p><small>${d.amen} آمين · ${timeAgo(d.at)}</small></div>
                                <button onclick="app.deleteDream(${jsArg(d.id)})" aria-label="حذف"><i data-lucide="trash-2"></i></button>
                            </div>`).join('') : '<p class="dr-p">لحد هسه ما أطلقت أي حلم.</p>'}
                        <div class="dr-btns">${mine.length < 3 ? '<button class="pri" onclick="app.openDreamWriter()"><i data-lucide="plus"></i>حلم جديد</button>' : ''}<button onclick="app._drClose()">رجوع</button></div>
                    </div>`;
                box.classList.remove('hidden');
                lucide.createIcons();
            },

            async deleteDream(id) {
                const d = (this._dreams || []).find((x) => x.id === id);
                if (!d || d.o !== this._dreamOwner()) return;
                if (!(await this.ask({ icon: 'trash-2', title: 'تحذف حلمك؟', text: 'يختفي من سما الأحلام وما يرجع.', ok: 'احذف' }))) return;
                const { ref, set } = window.firebaseDbHelpers;
                set(ref(window.firebaseDb, 'dreams/' + id), null).then(() => this.showToast('انحذف الحلم')).catch(() => this.showToast('تعذر الحذف'));
            },

            // ===== Usage signal for the admin statistics =====
            // Once per app start each device updates devices/{deviceId} (governorate code, installed,
            // notifications permission, last open) and, once a day, adds 1 to stats/daily/{date}/opens.
            // No name, phone or content is sent.
            _deviceId() {
                let d = '';
                try { d = localStorage.getItem('isp_device_id') || ''; } catch (e) {}
                if (!/^[a-z0-9]{8,32}$/.test(d)) {
                    d = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
                    try { localStorage.setItem('isp_device_id', d); } catch (e) {}
                }
                return d;
            },

            pingDevice() {
                if (!window.firebaseDb) return;
                const { ref, update, runTransaction } = window.firebaseDbHelpers;
                const id = this._deviceId(), today = this.localDateStr();
                const gov = this._myGov() || this._dsGov();
                const standalone = !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone);
                const w = this._wtn();
                update(ref(window.firebaseDb, 'devices/' + id), {
                    gov: this.GOV_CODES[gov] || '',
                    last: Date.now(),
                    installed: standalone || !!w,
                    push: this._pushPerm(),
                    app: w ? w.os : (standalone ? 'pwa' : 'web'),
                    member: this.isLoggedIn ? 1 : 0
                }).catch(() => {});
                let last = '';
                try { last = localStorage.getItem('isp_ping_day') || ''; } catch (e) {}
                if (last !== today) {
                    try { localStorage.setItem('isp_ping_day', today); } catch (e) {}
                    runTransaction(ref(window.firebaseDb, 'stats/daily/' + today + '/opens'), (c) => numOr0(c) + 1).catch(() => {});
                }
            },

            // One view per device per news item, for "most read" in the admin panel.
            _countNewsView(id) {
                if (!window.firebaseDb) return;
                const key = String(id).replace(/[.#$\[\]\/]/g, '_');
                let seen = [];
                try { seen = JSON.parse(localStorage.getItem('isp_news_seen') || '[]'); } catch (e) {}
                if (!Array.isArray(seen)) seen = [];
                if (seen.indexOf(key) !== -1) return;
                seen.push(key);
                try { localStorage.setItem('isp_news_seen', JSON.stringify(seen.slice(-300))); } catch (e) {}
                const { ref, runTransaction } = window.firebaseDbHelpers;
                runTransaction(ref(window.firebaseDb, 'newsViews/' + key), (c) => numOr0(c) + 1).catch(() => {});
            },

            // ===== Polls (استطلاع رأي) =====
            // polls/{id} = { q, opts[], counts{i}, createdAt, endsAt (0 = open), closed } is written by the
            // admin; one vote per student (uid, or the device id when not signed in) in pollVotes/{id}/{key}.
            listenForPolls() {
                if (!window.firebaseDb || this._pollsListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._pollsListener = onValue(ref(window.firebaseDb, 'polls'), (snap) => {
                    const v = snap.val() || {};
                    this._polls = Object.keys(v).map((k) => v[k]).filter((p) => p && typeof p.q === 'string' && Array.isArray(p.opts) && p.opts.length >= 2 && /^[A-Za-z0-9_-]{1,40}$/.test(String(p.id || '')))
                        .map((p) => ({ id: String(p.id), q: p.q.slice(0, 200), opts: p.opts.slice(0, 5).map((o) => String(o).slice(0, 80)), counts: p.counts || {}, createdAt: numOr0(p.createdAt), endsAt: numOr0(p.endsAt), closed: !!p.closed }))
                        .sort((a, b) => b.createdAt - a.createdAt);
                    this.renderPollCard();
                    if (this.currentView === 'pollsView') this.renderPolls();
                });
            },

            _pollOpen(p) { return !p.closed && (!p.endsAt || p.endsAt > Date.now()); },
            _pollVotes() { try { const v = JSON.parse(localStorage.getItem('isp_poll_votes') || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } },
            _pollTotal(p) { return p.opts.reduce((s, _, i) => s + numOr0(p.counts[i]), 0); },

            _pollResultsHtml(p, mine) {
                const total = this._pollTotal(p);
                const max = Math.max(0, ...p.opts.map((_, i) => numOr0(p.counts[i])));
                return p.opts.map((o, i) => {
                    const c = numOr0(p.counts[i]), pct = total ? Math.round((c / total) * 100) : 0;
                    return `<div class="pl-res${i === mine ? ' me' : ''}${c === max && c > 0 ? ' top' : ''}"><i style="--w:${pct}%"></i><span>${i === mine ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : ''}${escapeHtml(o)}</span><b>${pct}%</b></div>`;
                }).join('');
            },

            _pollHtml(p, compact) {
                const votes = this._pollVotes();
                const mine = votes[p.id];
                const open = this._pollOpen(p);
                const showResults = mine !== undefined || !open;
                const total = this._pollTotal(p);
                const left = open && p.endsAt ? Math.max(0, Math.ceil((p.endsAt - Date.now()) / 3600000)) : 0;
                const status = !open ? 'انتهى' : left ? (left >= 24 ? 'باقي ' + Math.ceil(left / 24) + ' يوم' : 'باقي ' + left + ' ساعة') : 'مفتوح';
                return `
                    <div class="pl${compact ? ' compact' : ''}">
                        <div class="pl-head"><span class="pl-tag${open ? '' : ' off'}"><i data-lucide="vote"></i>استطلاع · ${status}</span><small>${total} صوت</small></div>
                        <b class="pl-q">${escapeHtml(p.q)}</b>
                        <div class="pl-body">${showResults ? this._pollResultsHtml(p, mine) : p.opts.map((o, i) => `<button class="pl-opt btn-press" onclick="app.votePoll(${jsArg(p.id)}, ${i})">${escapeHtml(o)}</button>`).join('')}</div>
                        ${compact ? `<button class="pl-all" onclick="app.goToPolls()">${showResults ? 'النتيجة تتحدث مباشرة · كل الاستطلاعات' : 'كل الاستطلاعات'}</button>` : ''}
                    </div>`;
            },

            // Home: the newest open poll the student hasn't answered (or just answered, to show the result).
            renderPollCard() {
                const sec = document.getElementById('pollSection'), box = document.getElementById('pollCard');
                if (!sec || !box) return;
                this.renderInviteBanner();
                const off = !!(this.siteConfig && this.siteConfig.features && this.siteConfig.features.poll === false);
                const p = off ? null : (this._polls || []).find((x) => this._pollOpen(x));
                sec.classList.toggle('hidden', !p);
                box.innerHTML = p ? this._pollHtml(p, true) : '';
                if (p) lucide.createIcons();
            },

            goToPolls() {
                this.renderPolls();
                this.switchView('pollsView');
            },

            renderPolls() {
                const box = document.getElementById('pollsContent');
                if (!box) return;
                const list = this._polls || [];
                const open = list.filter((p) => this._pollOpen(p)), done = list.filter((p) => !this._pollOpen(p));
                box.innerHTML = list.length ? `
                    ${open.length ? `<div class="lv-sec">مفتوحة<small>${open.length}</small></div>${open.map((p) => this._pollHtml(p, false)).join('')}` : ''}
                    ${done.length ? `<div class="lv-sec">منتهية<small>${done.length}</small></div>${done.map((p) => this._pollHtml(p, false)).join('')}` : ''}`
                    : '<div class="lv-empty"><i data-lucide="vote"></i><b>ماكو استطلاعات بعد</b>أول ما تنشر الإدارة استطلاع يطلعلك هنا وبالرئيسية</div>';
                lucide.createIcons();
            },

            votePoll(pid, i) {
                const p = (this._polls || []).find((x) => x.id === pid);
                if (!p || !this._pollOpen(p) || !(i >= 0 && i < p.opts.length) || !window.firebaseDb) return;
                const votes = this._pollVotes();
                if (votes[pid] !== undefined) return;
                const voter = this.isLoggedIn && this.authUid ? String(this.authUid) : 'd_' + this._deviceId();
                const { ref, runTransaction } = window.firebaseDbHelpers;
                const save = (idx) => {
                    votes[pid] = idx;
                    try { localStorage.setItem('isp_poll_votes', JSON.stringify(votes)); } catch (e) {}
                    this._pollJust = pid;
                    this.renderPollCard();
                    if (this.currentView === 'pollsView') this.renderPolls();
                };
                runTransaction(ref(window.firebaseDb, 'pollVotes/' + pid + '/' + voter), (cur) => (cur === null || cur === undefined ? i : undefined))
                    .then((res) => {
                        if (!res.committed) { const prev = res.snapshot.val(); save(typeof prev === 'number' ? prev : i); this.showToast('صوّتت قبل بهذا الاستطلاع'); return; }
                        save(i);
                        return runTransaction(ref(window.firebaseDb, 'polls/' + pid + '/counts/' + i), (c) => numOr0(c) + 1);
                    }).catch(() => this.showToast('تعذر التصويت، حاول مرة ثانية'));
            },

            // ===== Web push (OneSignal) and "install the app" (PWA) =====
            // On the https site (and the app installed from it) notifications come from OneSignal's
            // free web push. The student is tagged like in the native app (gov=<code>, gov_name),
            // so one governorate can be targeted from the OneSignal dashboard.
            ONESIGNAL_APP_ID: '6ab91884-6fd7-43a1-a318-a4975260944e',

            // ===== The Android / iPhone app (Capacitor wraps this same site; see tools/mobile-build.py) =====
            _isNative() {
                return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
            },
            // 'granted' | 'denied' | 'default': the system's answer, from OneSignal in the app and the browser otherwise
            _pushPerm() {
                if (this._isNative()) return this._nativePerm || 'default';
                return 'Notification' in window ? Notification.permission : 'denied';
            },
            initNativeApp() {
                if (!this._isNative() || this._nativeInit) return;
                this._nativeInit = true;
                document.documentElement.classList.add('is-native');
                // the size of the status bar and navigation bar, from the Android code
                window.__ispInsets = (t, b) => { const r = document.documentElement.style; r.setProperty('--sat', t + 'px'); r.setProperty('--sab', b + 'px'); };
                try { if (window.IspNative) { const [t, b] = String(window.IspNative.insets()).split(','); window.__ispInsets(t, b); this._nativeBars(); } } catch (e) {}
                const P = (window.Capacitor && window.Capacitor.Plugins) || {};
                // The app's web view has no navigator.share, so every Share button used to fall back to copying a link.
                // This hands the same call to the phone's own share sheet (WhatsApp, Telegram, ...).
                try {
                    if (P.Share && typeof navigator.share !== 'function') {
                        navigator.share = (d) => {
                            d = d || {};
                            return P.Share.share({ title: d.title || undefined, text: d.text || undefined, url: d.url || undefined, dialogTitle: 'مشاركة' })
                                .then(() => {}, (e) => { const err = new Error('cancelled'); err.name = 'AbortError'; throw err; });
                        };
                        navigator.canShare = (d) => !(d && d.files && d.files.length);
                    }
                } catch (e) {}
                try {
                    if (P.App) {
                        // the phone's back button works like the page's back arrow, and leaves the app from the home page
                        P.App.addListener('backButton', () => { if (!this.nativeBack()) P.App.exitApp(); });
                        P.App.addListener('appStateChange', (st) => { if (st && st.isActive) setTimeout(() => { this._nutTick(); this._tbTick(); }, 800); });
                    }
                    if (P.StatusBar && !window.IspNative) { P.StatusBar.setStyle({ style: 'DARK' }); }
                } catch (e) { console.warn('Native setup failed:', e); }
            },
            // true when it handled the press (closed a sheet or went back a page)
            nativeBack() {
                const close = [
                    ['#ntSheet', () => this.ntSheetClose()],
                    ['#ntEd', () => this.ntBack()],
                    ['#tuSheet', () => this.tuPickClose()],
                    ['#tuPlayer', () => this.tuBack()],
                ['#exPaper', () => this.exClosePaper()],
                    ['#imgViewer', () => this.closeImageViewer()],
                    ['#ctSheet', () => this.chatSheetClose()],
                    ['#dlRoot', () => this.dlBack()],
                    ['#mcSet', () => this.mcSetClose()],
                    ['#rpSheet', () => this.rpClose()],
                    ['#rmSheet', () => this._rmCloseSheet()],
                    ['#rmScene', () => this.rmBack()],
                    ['#tmSheet', () => this.tmSheetClose()],
                    ['.pk-sheet', (el) => { const b = el.querySelector('.pk-back'); if (b) b.click(); }],
                    ['.fm-sheet.on', () => this.fmCloseCompose && this.fmCloseCompose()],
                    ['.tb-sheet.on', () => this._tbSheetClose && this._tbSheetClose()],
                    ['.fd-sheet.on', () => this._fdCloseSheet && this._fdCloseSheet()],
                    ['#walletModal:not(.hidden)', () => this.closeWalletModal && this.closeWalletModal()],
                ];
                for (const [sel, fn] of close) { const el = document.querySelector(sel); if (el) { fn(el); return true; } }
                if (this.viewHistory && this.viewHistory.length) { this.goBack(); return true; }
                if (this.currentView && this.currentView !== 'homeView') { this.setTab('home'); return true; }
                return false;
            },
            // OneSignal's own app plugin stands in for the web SDK; the rest of the code keeps using the same calls
            initNativePush() {
                if (this._osInit) return;
                this._osInit = true;
                let tries = 0;
                const start = () => {
                    const O = window.plugins && window.plugins.OneSignal;
                    if (!O) { if (++tries < 40) setTimeout(start, 500); else this.showToast('الإشعارات ما تهيّأت بهذا الجهاز'); return; }
                    try {
                        O.initialize(this.ONESIGNAL_APP_ID);
                        const refresh = () => Promise.resolve(O.Notifications.getPermissionAsync()).then((g) => {
                            this._nativePerm = g ? 'granted' : (this._nativePerm === 'denied' ? 'denied' : 'default');
                            this.syncWebPush();
                        }).catch(() => {});
                        O.Notifications.addEventListener('permissionChange', (g) => { this._nativePerm = g ? 'granted' : 'denied'; this.syncWebPush(); if (this.currentView === 'holidaysView') this.renderDayStatus(); });
                        // a lecture reminder pushed by the server: while the app is open its own popup shows it
                        O.Notifications.addEventListener('foregroundWillDisplay', (ev) => {
                            try {
                                const n = ev.getNotification ? ev.getNotification() : ev.notification;
                                if (n && n.additionalData && (n.additionalData.tb || this._pushIsRedundant(n.additionalData))) { ev.preventDefault(); return; }
                                if (ev.getNotification) ev.getNotification().display();
                            } catch (e) {}
                        });
                        O.Notifications.addEventListener('click', (ev) => {
                            try {
                                const n = ev.notification || {}, extra = n.additionalData || {};
                                const url = String(n.launchURL || n.launchUrl || '');
                                const m = /[?&]coach=([^&#]+)/.exec(url);
                                const text = typeof extra.coach === 'string' ? extra.coach : (m ? decodeURIComponent(m[1]) : '');
                                if (text) { this._coachPending = text; this._coachOpen(); }
                                if (extra.kind === 'call' || extra.kind === 'msg') this._openChatFromPush(extra.from, extra.fromName);
                                else this._pushOpen(extra);
                            } catch (e) {}
                        });
                        this._os = {
                            login: (id) => O.login(String(id)),
                            User: { addTags: (t) => O.User.addTags(t), addTag: (k, v) => O.User.addTag(k, v), removeTags: (k) => O.User.removeTags(k) },
                            Notifications: { requestPermission: () => Promise.resolve(O.Notifications.requestPermission(true)).then((g) => { this._nativePerm = g ? 'granted' : 'denied'; return g; }) },
                            Slidedown: { promptPush: () => this._os.Notifications.requestPermission() },
                        };
                        refresh();
                        this.syncWebPush();
                        this._maybePromptPush();
                    } catch (e) { console.warn('Native OneSignal failed:', e); }
                };
                document.addEventListener('deviceready', start, { once: true });
                start();
            },

            _webPushOk() {
                return (location.protocol === 'https:' || location.hostname === 'localhost') && 'Notification' in window && 'serviceWorker' in navigator && !this._wtn();
            },

            initWebPush() {
                if (this._isNative()) { this.initNativePush(); return; }
                if (this._osInit || !this._webPushOk()) return;
                this._osInit = true;
                const base = location.pathname.replace(/[^/]*$/, ''); // e.g. /Shop-Iraq-/
                window.OneSignalDeferred = window.OneSignalDeferred || [];
                window.OneSignalDeferred.push(async (OneSignal) => {
                    try {
                        await OneSignal.init({
                            appId: this.ONESIGNAL_APP_ID,
                            safari_web_id: 'web.onesignal.auto.4463433a-b41c-4a34-809b-879a9d93883b', // for Safari on a Mac (iPhone uses the standard web push)
                            serviceWorkerPath: base.replace(/^\//, '') + 'OneSignalSDKWorker.js',
                            serviceWorkerParam: { scope: base },
                            notifyButton: { enable: false },
                            welcomeNotification: { title: 'أكـادمي السادس', message: 'تفعّلت الإشعارات، يوصلك خبر العطلة أول بأول' },
                            promptOptions: { slidedown: { prompts: [{ type: 'push', autoPrompt: false, text: { actionMessage: 'تريد يوصلك خبر العطلة والأخبار المهمة حتى لو التطبيق مسدود؟', acceptButton: 'نعم، فعّلها', cancelButton: 'لاحقاً' } }] } }
                        });
                        this._os = OneSignal;
                        // a lecture reminder pushed by the server: while the app is open its own popup shows it
                        try { OneSignal.Notifications.addEventListener('foregroundWillDisplay', (e) => { try { if (e.notification && e.notification.additionalData && (e.notification.additionalData.tb || this._pushIsRedundant(e.notification.additionalData))) e.preventDefault(); } catch (x) {} }); } catch (x) {}
                        OneSignal.Notifications.addEventListener('permissionChange', () => {
                            this.syncWebPush();
                            if (this.currentView === 'holidaysView') this.renderDayStatus();
                        });
                        this.syncWebPush();
                        if (this.currentView === 'holidaysView') this.renderDayStatus();
                        this._maybePromptPush();
                    } catch (e) {
                        console.warn('OneSignal init failed:', e);
                        this._osErr = String((e && e.message) || e || 'error').slice(0, 160);
                    }
                });
                const sc = document.createElement('script');
                sc.onerror = () => { this._osErr = 'السكربت ما انحمّل (النت أو حاجب)'; };
                sc.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
                sc.defer = true;
                document.head.appendChild(sc);
            },

            syncWebPush() {
                const OS = this._os;
                if (!OS) return;
                const gov = this._myGov() || this._dsGov();
                try {
                    if (this.isLoggedIn && this.authUid) Promise.resolve(OS.login(String(this.authUid))).catch(() => {});
                    OS.User.addTags({ gov: this.GOV_CODES[gov] || '', gov_name: gov || '', member: this.isLoggedIn ? '1' : '0' });
                    this._pnSync();
                } catch (e) {
                    console.warn('OneSignal tags failed:', e);
                }
            },

            // Asks once, a little after the visit starts, and not again for a week if dismissed.
            _maybePromptPush() {
                if (!this._os || this._pushPerm() !== 'default') return;
                const native = this._isNative();
                let asked = 0;
                try { asked = Number(localStorage.getItem('isp_push_asked')) || 0; } catch (e) {}
                // in the phone app the question comes a few seconds after opening, every time until the student answers
                if (!native && Date.now() - asked < 7 * 86400000) return;
                setTimeout(() => {
                    if (!this._os || this._pushPerm() !== 'default') return;
                    try { localStorage.setItem('isp_push_asked', String(Date.now())); } catch (e) {}
                    Promise.resolve(this._os.Slidedown.promptPush()).catch(() => {});
                }, native ? 4000 : 25000);
            },

            enableWebPush() {
                if (!this._os) { this.showToast('الإشعارات تشتغل من رابط الموقع أو من التطبيق المثبت'); return; }
                Promise.resolve(this._os.Notifications.requestPermission()).then(() => {
                    this.syncWebPush();
                    this.renderDayStatus();
                }).catch(() => {});
            },

            // "Install" bar: Android / Chrome show the real install dialog; iPhone Safari has no such
            // dialog, so it gets a one-line hint (Share, then Add to Home Screen).
            initInstallBar() {
                const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
                if (standalone || this._wtn()) return;
                let later = 0;
                try { later = Number(localStorage.getItem('isp_install_later')) || 0; } catch (e) {}
                if (Date.now() - later < 14 * 86400000) return;
                window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this._installEvt = e; this.showInstallBar(false); });
                window.addEventListener('appinstalled', () => { this.hideInstallBar(); this.showToast('تثبّت التطبيق على شاشتك'); });
                const ua = navigator.userAgent;
                if (/iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua) && location.protocol === 'https:') {
                    setTimeout(() => this.showInstallBar(true), 8000);
                }
            },

            showInstallBar(ios) {
                if (document.getElementById('installBar')) return;
                const x = '<button class="inb-x" onclick="app.installLater()" aria-label="إغلاق"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
                const bar = document.createElement('div');
                bar.id = 'installBar';
                bar.className = 'inb';
                bar.innerHTML = ios
                    ? `<img src="icons/icon-192.png" alt=""><span><b>ثبّت أكـادمي السادس</b>اضغط زر المشاركة، بعدين "إضافة إلى الشاشة الرئيسية"</span>${x}`
                    : `<img src="icons/icon-192.png" alt=""><span><b>ثبّت أكـادمي السادس</b>تنفتح أسرع ويوصلك إشعار العطل</span><button class="inb-go btn-press" onclick="app.installApp()">تثبيت</button>${x}`;
                document.body.appendChild(bar);
            },

            hideInstallBar() { document.getElementById('installBar')?.remove(); },

            installApp() {
                const e = this._installEvt;
                if (!e) return;
                this._installEvt = null;
                e.prompt();
                Promise.resolve(e.userChoice).then(() => this.hideInstallBar()).catch(() => this.hideInstallBar());
            },

            installLater() {
                try { localStorage.setItem('isp_install_later', String(Date.now())); } catch (e) {}
                this.hideInstallBar();
            },

            // ===== Push in the native app (WebToNative) =====
            // Inside the Android / iPhone app built with WebToNative, web push doesn't exist; the
            // app's own OneSignal or Firebase does it. This tells whichever one is enabled who the
            // student is and their governorate:
            //   OneSignal: external user id = uid, tags gov=<code> and gov_name=<Arabic name>
            //   Firebase:  topics "all" and "gov_<code>"
            // so a notification can be sent to one governorate from the OneSignal / Firebase
            // dashboard. Outside the app (a normal browser) this does nothing.
            GOV_CODES: { 'بغداد': 'baghdad', 'البصرة': 'basra', 'نينوى': 'nineveh', 'أربيل': 'erbil', 'السليمانية': 'sulaymaniyah', 'دهوك': 'duhok', 'حلبجة': 'halabja', 'كركوك': 'kirkuk', 'الأنبار': 'anbar', 'صلاح الدين': 'salahaddin', 'ديالى': 'diyala', 'بابل': 'babil', 'كربلاء': 'karbala', 'النجف': 'najaf', 'واسط': 'wasit', 'القادسية': 'qadisiyah', 'ذي قار': 'dhiqar', 'ميسان': 'maysan', 'المثنى': 'muthanna' },

            _wtn() {
                const a = window.WebToNativeInterface;
                if (a && typeof a.getAndroidVersion === 'function') return { os: 'android', a };
                const i = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.webToNativeInterface;
                return i ? { os: 'ios', i } : null;
            },

            syncNativePush() {
                this.syncWebPush();
                this.pingDevice();
                const w = this._wtn();
                if (!w) return;
                const gov = this._myGov() || this._dsGov();
                const code = this.GOV_CODES[gov] || '';
                let prev = '';
                try { prev = localStorage.getItem('isp_native_gov') || ''; } catch (e) {}
                const uid = this.isLoggedIn && this.authUid ? String(this.authUid) : '';
                const tags = { gov: code, gov_name: gov || '', member: uid ? '1' : '0' };
                // Each call on its own: a method the enabled provider doesn't have must not stop the rest.
                const call = (fn) => { try { fn(); } catch (e) { console.warn('Native push call failed:', e); } };
                if (w.os === 'android') {
                    const a = w.a;
                    if (uid && typeof a.setExternalUserId === 'function') call(() => a.setExternalUserId(uid));
                    if (typeof a.setUserTags === 'function') call(() => a.setUserTags(JSON.stringify(tags)));
                    if (typeof a.subscribeToTopic === 'function') {
                        call(() => a.subscribeToTopic('all'));
                        if (code) call(() => a.subscribeToTopic('gov_' + code));
                    }
                    if (prev && prev !== code && typeof a.unsubscribeFromTopic === 'function') call(() => a.unsubscribeFromTopic('gov_' + prev));
                } else {
                    const post = (m) => call(() => w.i.postMessage(m));
                    if (uid) post({ action: 'setExternalUserId', userId: uid });
                    post({ action: 'setUserTags', tags });
                    post({ action: 'firebaseSubscribeToTopic', topic: 'all' });
                    if (code) post({ action: 'firebaseSubscribeToTopic', topic: 'gov_' + code });
                    if (prev && prev !== code) post({ action: 'firebaseUnsubscribeFromTopic', topic: 'gov_' + prev });
                }
                try { localStorage.setItem('isp_native_gov', code); } catch (e) {}
            },

            // Push notifications need https, a supported browser and the VAPID key in the config.
            _dsPushRow() {
                if (!this._webPushOk() && !this._isNative()) return '';
                if (this._pushPerm() === 'granted') return '<div class="ds-push on"><i data-lucide="bell-ring"></i>الإشعارات مفعّلة: يوصلك خبر العطلة حتى لو التطبيق مسدود</div>';
                if (this._pushPerm() === 'denied') return '<div class="ds-push"><i data-lucide="bell-off"></i>الإشعارات مسدودة. فعّلها من إعدادات المتصفح حتى يوصلك خبر العطلة</div>';
                return '<button class="ds-push btn-press" onclick="app.enableWebPush()"><i data-lucide="bell-plus"></i>فعّل الإشعارات حتى يوصلك خبر العطلة أول بأول</button>';
            },

            // A pulsing dot on the "العطل" button when the coming day is an announced / calendar
            // holiday (red) or waiting for a decision (amber) for the student's governorate.
            // Weekends and the summer break don't count; the dot clears once the page is seen.
            updateHolidayNavDot() {
                // the holidays page moved from the bottom bar to "More": the dot sits on the header's More button
                const ic = document.querySelector('#bottomNav .nav-item[data-tab="holidays"] .nav-ic') || document.getElementById('hdrMoreBtn');
                if (!ic) return;
                let dot = document.getElementById('navHolidayDot');
                const gov = this._myGov() || (() => { try { return localStorage.getItem('isp_day_gov') || ''; } catch (e) { return ''; } })();
                const t = this._dsTarget();
                const st = gov ? this._dsStatus(t, gov) : null;
                const key = st ? this.localDateStr(t) + '|' + st.s + '|' + st.reason : '';
                let seen = '';
                try { seen = localStorage.getItem('isp_ds_seen') || ''; } catch (e) {}
                const show = st && ((st.s === 'off' && (st.kind === 'admin' || st.kind === 'holiday')) || st.s === 'pending') && seen !== key;
                if (this.currentView === 'holidaysView' && st) { try { localStorage.setItem('isp_ds_seen', key); } catch (e) {} }
                if (!show || this.currentView === 'holidaysView') { if (dot) dot.remove(); return; }
                if (!dot) { dot = document.createElement('span'); dot.id = 'navHolidayDot'; ic.appendChild(dot); }
                dot.className = 'nav-dot' + (st.s === 'pending' ? ' amber' : '');
            },

            // ==================== HOLIDAYS CALENDAR ====================
            listenForHolidays() {
                if (!window.firebaseDb || this._holidaysListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._holidaysListener = onValue(ref(window.firebaseDb, 'holidays'), (snap) => {
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((k) => list.push(vals[k]));
                    }
                    holidays.length = 0;
                    holidays.push(...list);
                    if (this.currentView === 'holidaysView') { this.renderHolidaysPage(); this.renderDayStatus(); }
                    this.updateHolidayNavDot();
                });
            },

            // FIX: new Date('2025-03-21') is UTC midnight (03:00 in Baghdad), and the end
            // date was compared as the *start* of that day — a holiday disappeared from the
            // list at 03:00 on its last day and "days left" was off by the UTC offset.
            // Dates are now read as local days, and the end date covers the whole day.
            holidayRange(h) {
                const parse = (str, endOfDay) => {
                    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
                    if (!m) return new Date(str).getTime();
                    return endOfDay ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999).getTime() : new Date(+m[1], +m[2] - 1, +m[3]).getTime();
                };
                return { start: parse(h.startDate, false), end: parse(h.endDate || h.startDate, true) };
            },

            // ==================== FOCUS MODE (وضع التركيز) ====================
            // Leaving the app (another app, home screen, locking the phone) for more than a
            // short grace period breaks the session and its points are lost. Timing is based
            // on the wall clock, so background throttling can't stretch or shrink a session.
            // The screen is kept awake (Wake Lock API) so it doesn't auto-lock mid-session.
            focusDurations: [15, 25, 45, 60],
            focusMinutes: 25,
            FOCUS_KEY: 'isp_focus_session',
            FOCUS_GRACE_MS: 5000,

            goToFocus() {
                this._bindFocusEvents();
                if (this._focus) this.renderFocusRunning(); else this.renderFocusSetup();
                this.switchView('focusView');
                lucide.createIcons();
            },

            focusBack() {
                if (this._focus) { this.giveUpFocus(); return; }
                this.goBack();
            },

            focusStats() {
                const u = this.currentUser || {};
                return { done: numOr0(u.focusDone), broken: numOr0(u.focusBroken), minutes: numOr0(u.focusMinutes) };
            },

            saveFocusStats(patch) {
                if (!this.currentUser) return;
                Object.assign(this.currentUser, patch);
                this.saveUserData();
                if (window.firebaseDb && this.authUid) {
                    const { ref, update } = window.firebaseDbHelpers;
                    update(ref(window.firebaseDb, 'users/' + this.authUid), patch).catch((e) => console.warn('Focus stats save failed:', e));
                }
            },

            setFocusMinutes(m) { this.focusMinutes = m; this.renderFocusSetup(); },

            renderFocusSetup() {
                const box = document.getElementById('focusContent');
                if (!box) return;
                const st = this.focusStats();
                const total = st.done + st.broken;
                const rate = total ? Math.round((st.done / total) * 100) : 0;
                box.innerHTML = `
                    <section class="fc-hero">
                        <span class="fc-hero-ic"><i data-lucide="smartphone"></i></span>
                        <div><b>لا تلمس الهاتف</b><small>اختر مدة، ابدأ، وخلي الهاتف على جنب. إذا كملت الجلسة تكسب نقاط، وإذا طلعت من التطبيق تنكسر وتخسرها.</small></div>
                    </section>

                    <div class="fc-sec">مدة الجلسة</div>
                    <div class="fc-durs">
                        ${this.focusDurations.map((m, i) => `
                            <button class="fc-dur${m === this.focusMinutes ? ' on' : ''}" style="animation-delay:${i * 0.05}s" onclick="app.setFocusMinutes(${jsNum(m)})">
                                <b>${m}</b><span>دقيقة</span><em>+${m} نقطة</em>
                            </button>`).join('')}
                    </div>

                    <div class="fc-sec">القواعد</div>
                    <div class="fc-rules">
                        <div class="fc-rule"><span style="--c:#E5484D"><i data-lucide="log-out"></i></span>إذا طلعت من التطبيق أكثر من 5 ثواني تنكسر الجلسة</div>
                        <div class="fc-rule"><span style="--c:#F59E0B"><i data-lucide="lock"></i></span>قفل الشاشة يكسر الجلسة — الشاشة تبقى شغالة وحدها طول الجلسة</div>
                        <div class="fc-rule"><span style="--c:#16A34A"><i data-lucide="users"></i></span>تظهر بغرفة المذاكرة الجماعية حتى يشوفك زملاءك تركّز</div>
                        <button class="fc-rule btn-press" style="width:100%;text-align:right;cursor:pointer;font:inherit" onclick="app.goToGovWar()"><span style="--c:#DC2626"><i data-lucide="swords"></i></span>دقائقك تنحسب لمحافظتك بحرب المحافظات، شوف الترتيب</button>
                    </div>

                    <button class="fc-start btn-press" onclick="app.startFocus()"><i data-lucide="play"></i>ابدأ ${this.focusMinutes} دقيقة تركيز</button>

                    <div class="fc-sec">إنجازاتك</div>
                    <div class="fc-stats">
                        <div class="fc-stat" style="--c:#16A34A"><b>${st.done}</b><span>جلسة مكتملة</span></div>
                        <div class="fc-stat" style="--c:#E5484D"><b>${st.broken}</b><span>جلسة منكسرة</span></div>
                        <div class="fc-stat" style="--c:rgb(var(--p))"><b>${st.minutes}</b><span>دقيقة تركيز</span></div>
                    </div>
                    ${total ? `<div class="fc-rate">نسبة نجاحك ${rate}% من ${total} جلسة<div><i style="--w:${Math.max(3, rate)}%"></i></div></div>` : ''}
                    ${!this.isLoggedIn ? '<div class="fc-rate">سجّل دخولك حتى تنحسب نقاطك وإنجازاتك</div>' : ''}
                `;
                lucide.createIcons();
            },

            async startFocus() {
                if (this._focus || this._starting) return;
                if (this._gwar || this._forest || this._garden) { this.showToast('عندك جلسة شغالة، كمّلها أول'); return; }
                this._starting = true;
                const free = await this._sessionFree();
                this._starting = false;
                if (!free || this._focus) return;
                const minutes = this.focusMinutes;
                this._focus = { start: this.trueNow(), dur: minutes * 60000, minutes };
                try { localStorage.setItem(this.FOCUS_KEY, JSON.stringify(this._focus)); } catch (e) {}
                document.body.classList.add('focus-mode');
                this._requestWakeLock();
                this.joinStudyRoom('focus');
                this._govLiveJoin(minutes);
                this.renderFocusRunning();
                clearInterval(this._focusTimer);
                this._focusTimer = setInterval(() => this._focusTick(), 500);
                this._focusTick();
            },

            renderFocusRunning() {
                const box = document.getElementById('focusContent');
                if (!box || !this._focus) return;
                const C = 2 * Math.PI * 116;
                box.innerHTML = `
                    <div class="fc-run">
                        <div class="fc-ring">
                            <svg viewBox="0 0 260 260" aria-hidden="true">
                                <defs><linearGradient id="fcGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgb(var(--p))"/><stop offset="1" stop-color="#F59E0B"/></linearGradient></defs>
                                <circle class="bg" cx="130" cy="130" r="116" fill="none" stroke-width="14"/>
                                <circle class="fg" id="fcArc" cx="130" cy="130" r="116" fill="none" stroke-width="14" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="0"/>
                            </svg>
                            <div class="fc-time"><b id="fcClock" dir="ltr">--:--</b><span>متبقي من ${this._focus.minutes} دقيقة</span><em class="gold-x2">×2 ذهبية</em></div>
                        </div>
                        <h3>ركّز… الهاتف على جنب</h3>
                        <p>كمّل الجلسة وتكسب <b>${this._focus.minutes} نقطة</b>. التطبيق مفتوح لحد ما يخلص الوقت.</p>
                        <div class="fc-warn"><i data-lucide="alert-triangle"></i>إذا طلعت من التطبيق تنكسر الجلسة</div>
                        <button class="fc-quit btn-press" onclick="app.giveUpFocus()">إنهاء الجلسة الآن</button>
                    </div>`;
                lucide.createIcons();
                this._focusTick();
            },

            _focusTick() {
                const f = this._focus;
                if (!f) return;
                const left = f.start + f.dur - this.trueNow();
                if (left <= 0) { this.completeFocus(); return; }
                const secs = Math.ceil(left / 1000);
                const clock = document.getElementById('fcClock');
                if (clock) clock.textContent = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
                const arc = document.getElementById('fcArc');
                if (arc) {
                    const C = 2 * Math.PI * 116;
                    arc.setAttribute('stroke-dashoffset', (C * (1 - left / f.dur)).toFixed(1));
                }
            },

            _stopFocus() {
                clearInterval(this._focusTimer);
                this._focusTimer = null;
                try { localStorage.removeItem(this.FOCUS_KEY); } catch (e) {}
                document.body.classList.remove('focus-mode');
                if (this._wakeLock) { this._wakeLock.release().catch(() => {}); this._wakeLock = null; }
                this.leaveStudyRoom();
                this._govLiveLeave();
                const f = this._focus;
                this._focus = null;
                return f;
            },

            completeFocus() {
                const f = this._stopFocus();
                if (!f) return;
                const st = this.focusStats();
                this.saveFocusStats({ focusDone: st.done + 1, focusMinutes: st.minutes + f.minutes });
                this.playNotifySound();
                let golden = 0;
                if (this.isLoggedIn && this.currentUser) {
                    golden = this._goldenCredit(f);
                    this.addPointsAtomic(f.minutes + golden).then(() => {
                        this.logDailyActivity({ points: f.minutes + golden, studySessions: 1, minutes: f.minutes });
                    });
                    this._govWarAdd(f.minutes);
                }
                this.renderFocusResult(true, f.minutes, f.minutes, null, golden);
            },

            breakFocus(reason) {
                const f = this._stopFocus();
                if (!f) return;
                const done = Math.max(0, Math.floor((this.trueNow() - f.start) / 60000));
                const st = this.focusStats();
                this.saveFocusStats({ focusBroken: st.broken + 1 });
                this.renderFocusResult(false, f.minutes, done, reason);
            },

            async giveUpFocus() {
                if (!this._focus) return;
                if (!(await this.ask({ icon: 'timer-off', title: 'تنهي الجلسة؟', text: 'إذا أنهيتها هسه تنكسر وما تاخذ نقاطها.', ok: 'أنهِ الجلسة', cancel: 'أكمل' }))) return;
                this.breakFocus('أنهيت الجلسة قبل وقتها');
            },

            renderFocusResult(ok, minutes, done, reason, golden) {
                const box = document.getElementById('focusContent');
                if (!box) return;
                box.innerHTML = ok ? `
                    <div class="fc-res ok">
                        <span class="fc-res-ic"><i data-lucide="check"></i></span>
                        <h3>أحسنت! كملت الجلسة</h3>
                        <p>ركّزت ${minutes} دقيقة بدون ما تلمس هاتفك</p>
                        ${this.isLoggedIn ? `<span class="fc-pts">+${minutes + (golden || 0)} نقطة</span>${golden ? `<p class="gold-t">منها ${golden} نقطة ذهبية من الساعة الذهبية</p>` : ''}` : '<p>سجّل دخولك المرة الجاية حتى تنحسب نقاطك</p>'}
                        ${this.isLoggedIn && this._myGov() ? `<p class="fc-gov">+${minutes} دقيقة لمحافظة ${escapeHtml(this._myGov())} بحرب المحافظات</p>` : ''}
                        <div class="fc-res-btns"><button class="pri" onclick="app.startFocus()">جلسة ثانية</button><button onclick="app.shareFocusStory(${jsNum(minutes)})">شارك إنجازك</button></div>
                        <button class="fc-quit" style="color:var(--text2);border-color:var(--border);background:none" onclick="app.renderFocusSetup()">رجوع</button>
                    </div>` : `
                    <div class="fc-res bad">
                        <span class="fc-res-ic"><i data-lucide="x"></i></span>
                        <h3>انكسرت الجلسة</h3>
                        <p>${escapeHtml(reason || 'طلعت من التطبيق')}${done ? ' — ركّزت ' + done + ' دقيقة من ' + minutes : ''}</p>
                        <p>ما تنحسب نقاط الجلسة. جرّب مرة ثانية وخلي الهاتف على جنب.</p>
                        <div class="fc-res-btns"><button class="pri" onclick="app.startFocus()">حاول مرة ثانية</button><button onclick="app.renderFocusSetup()">رجوع</button></div>
                    </div>`;
                lucide.createIcons();
            },

            async _requestWakeLock() {
                try {
                    if ('wakeLock' in navigator && !this._wakeLock) {
                        this._wakeLock = await navigator.wakeLock.request('screen');
                        this._wakeLock.addEventListener('release', () => { this._wakeLock = null; });
                    }
                } catch (e) { /* not supported / not allowed — session still works */ }
            },

            _bindFocusEvents() {
                if (this._focusBound) return;
                this._focusBound = true;
                document.addEventListener('visibilitychange', () => {
                    const f = this._focus;
                    if (!f) return;
                    if (document.hidden) {
                        f.hiddenAt = performance.now(); f.hiddenWall = Date.now();
                    } else if (f.hiddenAt) {
                        const away = Math.max(performance.now() - f.hiddenAt, Date.now() - (f.hiddenWall || 0));
                        delete f.hiddenAt;
                        if (away > this.FOCUS_GRACE_MS) this.breakFocus('طلعت من التطبيق أثناء الجلسة');
                        else { this._requestWakeLock(); this._focusTick(); }
                    }
                });
            },

            // A session that was still saved when the app starts means the app was closed
            // (or the page reloaded) mid-session — that counts as broken.
            // ===== Shared helpers for the live pages =====
            // The study week runs Saturday to Friday.
            _weekStart(d) {
                const x = new Date(d || Date.now());
                x.setHours(0, 0, 0, 0);
                x.setDate(x.getDate() - ((x.getDay() + 1) % 7));
                return x;
            },
            _weekKey(d) { return this.localDateStr(this._weekStart(d)); },
            _myGov() {
                const g = String((this.currentUser && this.currentUser.governorate) || '').trim();
                const n = GOVERNORATE_ALIASES[g] || g;
                return IRAQ_GOVERNORATES.indexOf(n) !== -1 ? n : '';
            },
            _fmtLeft(ms) {
                const s = Math.max(0, Math.floor(ms / 1000));
                const d = Math.floor(s / 86400), p = (n) => String(n).padStart(2, '0');
                return (d ? d + ' يوم ' : '') + '<span dir="ltr">' + p(Math.floor((s % 86400) / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60) + '</span>';
            },
            // One 1-second ticker shared by the live pages; it stops when fn returns false.
            _liveTick(fn) {
                clearInterval(this._liveTimer);
                this._liveTimer = setInterval(() => { if (!fn()) { clearInterval(this._liveTimer); this._liveTimer = null; } }, 1000);
            },

            // ===== Governorate war (حرب المحافظات) =====
            // Completed focus minutes are added to govWar/{week}/{governorate}; focusLive/{uid}
            // marks who is focusing right now. The winning governorate's students who took part
            // claim a prize once the week is over.
            GOV_TILES: { 'دهوك': [2, 0], 'نينوى': [1, 1], 'أربيل': [2, 1], 'السليمانية': [3, 1], 'حلبجة': [4, 1], 'الأنبار': [0, 2, 2], 'صلاح الدين': [1, 2], 'كركوك': [2, 2], 'بغداد': [1, 3], 'ديالى': [2, 3], 'كربلاء': [0, 4], 'بابل': [1, 4], 'واسط': [2, 4], 'النجف': [0, 5], 'القادسية': [1, 5], 'ذي قار': [2, 5], 'ميسان': [3, 5], 'المثنى': [1, 6], 'البصرة': [3, 6] },
            GOV_WAR_PRIZE: 50,

            goToGovWar() {
                this._gwAttach();
                this._gwListenBots();
                this.renderGovWar();
                this.switchView('govWarView');
                this._liveTick(() => {
                    if (this.currentView !== 'govWarView') return false;
                    if (this._weekKey() !== this._gwWeek) { this._gwAttach(); return true; }
                    const el = document.getElementById('gwClock');
                    if (el) el.innerHTML = this._fmtLeft(this._weekStart().getTime() + 7 * 86400000 - Date.now());
                    return true;
                });
            },

            _gwAttach() {
                if (!window.firebaseDb) return;
                const { ref, onValue, get } = window.firebaseDbHelpers;
                const wk = this._weekKey();
                if (this._gwWeek !== wk) {
                    if (typeof this._gwWeekUnsub === 'function') this._gwWeekUnsub();
                    this._gwWeek = wk;
                    this._gwData = {};
                    this._gwWeekUnsub = onValue(ref(window.firebaseDb, 'govWar/' + wk), (snap) => {
                        this._gwData = snap.val() || {};
                        if (this.currentView === 'govWarView') this.renderGovWar();
                    });
                    const last = this._weekKey(this._weekStart().getTime() - 86400000);
                    get(ref(window.firebaseDb, 'govWar/' + last)).then((snap) => {
                        this._gwLast = { key: last, data: snap.val() || {} };
                        if (this.currentView === 'govWarView') this.renderGovWar();
                    }).catch(() => {});
                    this._gwMineLoad(last);
                }
                if (!this._gwLiveUnsub) {
                    this._gwLiveUnsub = onValue(ref(window.firebaseDb, 'focusLive'), (snap) => {
                        this._gwLive = snap.val() || {};
                        if (this.currentView === 'govWarView') this.renderGovWar();
                    });
                }
            },

            _gwMineLoad(lastKey) {
                if (!this.authUid || !window.firebaseDb) return;
                const { ref, get } = window.firebaseDbHelpers;
                Promise.all([
                    get(ref(window.firebaseDb, 'users/' + this.authUid + '/govWarMine')),
                    get(ref(window.firebaseDb, 'users/' + this.authUid + '/govWarClaimed/' + lastKey))
                ]).then(([mine, claimed]) => {
                    this._gwMine = mine.val() || {};
                    this._gwClaimed = !!claimed.val();
                    if (this.currentView === 'govWarView') this.renderGovWar();
                }).catch(() => {});
            },

            _gwLiveCounts() {
                const now = Date.now(), c = {};
                let total = 0;
                Object.values(this._gwLive || {}).forEach((v) => {
                    if (v && IRAQ_GOVERNORATES.indexOf(v.gov) !== -1 && numOr0(v.until) > now) { c[v.gov] = (c[v.gov] || 0) + 1; total++; }
                });
                return { c, total };
            },

            _gwHrs(m) { return m >= 60 ? (Math.round(m / 6) / 10) + ' ساعة' : m + ' دقيقة'; },

            renderGovWar() {
                const box = document.getElementById('govWarContent');
                if (!box) return;
                if (!document.getElementById('gwTop')) {
                    box.innerHTML = `
                        <div id="gwTop"></div>
                        <div class="gw3d" id="gw3d">
                            <canvas aria-label="خريطة العراق ثلاثية الأبعاد"></canvas>
                            <div class="gw3d-labels"></div>
                            <span class="gw3d-c tl"></span><span class="gw3d-c tr"></span><span class="gw3d-c bl"></span><span class="gw3d-c br"></span>
                            <div class="gw3d-hud"><span class="gw3d-rec"><i></i>بث مباشر</span><span>القمر الصناعي · العراق</span></div>
                            <div class="gw3d-foot"><span class="gw3d-coord"></span><span>اسحب لتدوير الخريطة</span></div>
                            <div class="gw3d-load"><span class="gw3d-radar"></span><b>جاري الاتصال بالقمر الصناعي...</b></div>
                            <div class="gw-ticker" id="gwTicker"></div>
                            <div class="gw-attack-hud" id="gwHud"></div>
                        </div>
                        <div id="gwBattle"></div>
                        <div id="gwBottom"></div>
                        <div class="fr-check gw-check hidden" id="gwCheck"></div>`;
                    this._gwRenderBattle();
                }
                const data = this._gwData || {};
                const live = this._gwLiveCounts();
                const mine = this._myGov();
                const sim = this._gwSimNow();
                this._gwSeenReal(data);
                const rows = IRAQ_GOVERNORATES.map((g) => ({ g, m: numOr0(data[g] && data[g].minutes) + numOr0(sim.mins[g]), s: numOr0(data[g] && data[g].sessions) + numOr0(sim.trees[g]), l: (live.c[g] || 0) + numOr0(sim.live[g]) }))
                    .sort((a, b) => b.m - a.m || b.l - a.l || a.g.localeCompare(b.g, 'ar'));
                const max = rows[0].m;
                const leader = max > 0 ? rows[0] : null;
                const rankOf = (g) => rows.findIndex((r) => r.g === g) + 1;
                const hrs = (m) => this._gwHrs(m);
                const ws = this._weekStart(), we = new Date(ws.getTime() + 6 * 86400000);
                const endMs = ws.getTime() + 7 * 86400000;
                let lastWin = null;
                if (this._gwLast) {
                    const ld = this._gwLast.data, ls = this._gwSimLast();
                    const lr = IRAQ_GOVERNORATES.map((g) => ({ g, m: numOr0(ld[g] && ld[g].minutes) + numOr0(ls.mins[g]) })).sort((a, b) => b.m - a.m)[0];
                    if (lr && lr.m > 0) lastWin = lr;
                }
                const took = lastWin && numOr0(this._gwMine && this._gwMine[this._gwLast.key]) > 0;
                const canClaim = !!(lastWin && this.isLoggedIn && mine === lastWin.g && took && !this._gwClaimed);
                const myWeek = numOr0(this._gwMine && this._gwMine[this._gwWeek]);
                const pick = rows.find((r) => r.g === this._gwPick);

                document.getElementById('gwTop').innerHTML = `
                    <section class="gw-hero">
                        <div class="gw-hero-top"><span class="gw-live"><i></i>${live.total + numOr0(sim.liveTotal)} طالب يحارب هسه</span><span class="gw-clock">تنتهي الجولة بعد <b id="gwClock">${this._fmtLeft(endMs - Date.now())}</b></span></div>
                        <div class="gw-lead">
                            <span class="gw-crown"><i data-lucide="crown"></i></span>
                            <div>${leader ? `<small>المتصدرة هالأسبوع</small><b>${escapeHtml(leader.g)}</b><em>${hrs(leader.m)} تركيز · ${leader.s} جلسة</em>` : '<small>الجولة بدت</small><b>ولا محافظة سجلت بعد</b><em>أول جلسة تكمّلها تحط محافظتك بالصدارة</em>'}</div>
                        </div>
                    </section>
                    ${lastWin ? `<div class="gw-last${canClaim ? ' win' : ''}"><i data-lucide="trophy"></i><div><b>بطلة الأسبوع الماضي: ${escapeHtml(lastWin.g)}</b><span>${canClaim ? 'محافظتك فازت وإنت شاركت بيها' : hrs(lastWin.m) + ' تركيز' + (mine === lastWin.g && this._gwClaimed ? ' · استلمت جائزتك' : '')}</span></div>${canClaim ? `<button class="btn-press" onclick="app.claimGovWar()">استلم ${this.GOV_WAR_PRIZE} نقطة</button>` : ''}</div>` : ''}
                    <div class="lv-sec">ساحة المعركة<small>العمود يطول ويا دقائق التركيز</small></div>`;

                this._gw3dSync(rows, mine, leader ? leader.g : '', max);
                // the attack panel only changes with the student's state (signed in, governorate)
                const sig = [this.isLoggedIn ? 1 : 0, mine, this._gwar ? 1 : 0, this._gwResult ? 1 : 0].join('|');
                if (!this._gwar && sig !== this._gwSig) this._gwRenderBattle();
                this._gwSig = sig;

                document.getElementById('gwBottom').innerHTML = `
                    <div class="gw3d-legend">
                        <span><i style="background:#FFC738"></i>المتصدرة</span>
                        <span><i style="background:#FF8029"></i>محافظتك</span>
                        <span><i style="background:#33DBC7"></i>باقي المحافظات</span>
                        <span><i class="ring"></i>يركزون هسه</span>
                        <span><i class="arc"></i>هجمات: المحافظة اللي تركز أكثر تهاجم أكثر</span>
                    </div>
                    ${pick ? `
                    <div class="gw-pick">
                        <span class="gw-me-rank" style="background:${pick.g === (leader && leader.g) ? 'linear-gradient(135deg,#F59E0B,#B45309)' : pick.g === mine ? 'linear-gradient(135deg,#FB923C,#EA580C)' : 'linear-gradient(135deg,#2DD4BF,#0F766E)'}">${rankOf(pick.g)}</span>
                        <div><b>${escapeHtml(pick.g)}${pick.g === mine ? ' · محافظتك' : ''}</b><small>${pick.m ? hrs(pick.m) + ' تركيز · ' + pick.s + ' جلسة' : 'ما سجلت دقائق هالأسبوع'}${pick.l ? ' · ' + pick.l + ' يركزون هسه' : ''}</small></div>
                        <button onclick="app._gwPick = null; app.renderGovWar()" aria-label="إغلاق"><i data-lucide="x"></i></button>
                    </div>` : ''}

                    <section class="gw-me">
                        ${!this.isLoggedIn ? '<p>سجّل دخولك حتى تحارب لمحافظتك</p><button class="lv-btn btn-press" onclick="app.goToAuth(\'login\')"><i data-lucide="log-in"></i>تسجيل الدخول</button>'
                        : !mine ? '<p>حدد محافظتك بالملف الشخصي حتى تنحسب دقائقك إلها</p><button class="lv-btn btn-press" onclick="app.openEditProfileModal()"><i data-lucide="map-pin"></i>تحديد المحافظة</button>'
                        : `<div class="gw-me-row"><span class="gw-me-rank">${rankOf(mine)}</span><div><b>محافظتك: ${escapeHtml(mine)}</b><small>المركز ${rankOf(mine)} من ${rows.length} · مساهمتك هالأسبوع ${myWeek} دقيقة</small></div></div>`}
                    </section>

                    <div class="lv-sec">الترتيب<small>${ws.getDate()} ${IRAQI_MONTHS[ws.getMonth()]} - ${we.getDate()} ${IRAQI_MONTHS[we.getMonth()]}</small></div>
                    <div class="gw-rank">
                        ${rows.map((r, i) => ({ r, i })).filter(({ r, i }) => this._gwAll || i < 5 || r.g === mine).map(({ r, i }) => `
                            <div class="gw-row${r.g === mine ? ' me' : ''}" style="animation-delay:${Math.min(i, 10) * 0.03}s" onclick="app.pickGov(${jsArg(r.g)})">
                                <span class="gw-n${i < 3 && r.m ? ' top' + (i + 1) : ''}">${i + 1}</span>
                                <div class="gw-row-main">
                                    <div class="gw-row-top"><b>${escapeHtml(r.g)}</b>${r.l ? `<span class="gw-row-live"><i></i>${r.l} هسه</span>` : ''}<em>${r.m ? hrs(r.m) + ' · ' + r.s + ' جلسة' : '-'}</em></div>
                                    <div class="gw-bar"><i style="--w:${max ? (r.m ? Math.max(3, (r.m / max) * 100) : 0) : 0}%"></i></div>
                                </div>
                            </div>`).join('')}
                    </div>
                    <button class="gw-more btn-press" onclick="app._gwAll = !app._gwAll; app.renderGovWar()">${this._gwAll ? 'عرض أول 5 بس' : 'عرض كل المحافظات (' + rows.length + ')'}</button>

                    <div class="lv-rules">
                        <div><i data-lucide="swords"></i>ابدأ هجوم بهاي الصفحة: كل دقيقة دراسة تكمّلها تنحسب لمحافظتك، والهجوم اللي ينقطع ما ينحسب</div>
                        <div><i data-lucide="timer"></i>جلسات وضع التركيز وغابة العراق هم تنحسب لمحافظتك</div>
                        <div><i data-lucide="calendar-range"></i>الجولة من السبت للجمعة، وكل سبت تبدي جولة جديدة</div>
                        <div><i data-lucide="gift"></i>طلاب المحافظة الفائزة اللي شاركوا ياخذون ${this.GOV_WAR_PRIZE} نقطة</div>
                    </div>
                `;
                lucide.createIcons();
            },

            pickGov(g) {
                this._gwPick = this._gwPick === g ? null : g;
                this.renderGovWar();
                if (this._gwPick) document.getElementById('gw3d')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            },

            // Hands the standings to the 3D map; without WebGL the flat tile map is drawn instead.
            _gw3dSync(rows, mine, leader, max) {
                const wrap = document.getElementById('gw3d');
                if (!wrap) return;
                if (this._withPart('maps', () => typeof GovWar3D !== 'undefined', 'govWarView', () => this.renderGovWar())) return;
                if (!this._gw3d && !this._gw3dFail && IRAQ_DEM === null) {
                    loadIraqDem().then(() => { if (this.currentView === 'govWarView') this.renderGovWar(); });
                    return;
                }
                if (!this._gw3d && !this._gw3dFail) {
                    try {
                        this._gw3d = new GovWar3D(wrap, (g) => this.pickGov(g));
                        this._gw3d.coordEl = wrap.querySelector('.gw3d-coord');
                    } catch (e) {
                        console.warn('3D map unavailable, using the flat map:', e);
                        this._gw3dFail = true;
                    }
                }
                if (this._gw3dFail) {
                    const lvl = (m) => (!m || !max ? 0 : Math.max(1, Math.ceil((m / max) * 4)));
                    wrap.className = 'gw-map';
                    wrap.innerHTML = IRAQ_GOVERNORATES.map((g, i) => {
                        const t = this.GOV_TILES[g], r = rows.find((x) => x.g === g);
                        if (!t || !r) return '';
                        return `<div class="gw-tile lv${lvl(r.m)}${g === mine ? ' me' : ''}${r.l ? ' on' : ''}" style="grid-column:${t[0] + 1};grid-row:${t[1] + 1}${t[2] ? ' / span ' + t[2] : ''};animation-delay:${i * 0.025}s">
                            ${leader === g ? '<i data-lucide="crown" class="gw-t-crown"></i>' : ''}<b>${escapeHtml(g)}</b><span>${r.m ? this._gwHrs(r.m) : '-'}</span>${r.l ? `<em>${r.l}</em>` : ''}
                        </div>`;
                    }).join('');
                    return;
                }
                this._gw3d.setData(rows, mine, leader);
                this._gw3d.start(() => this.currentView === 'govWarView' && !document.hidden);
            },


            // ===== War companions: students simulated from govWarConfig/bots (set in the admin
            // panel) so the war never feels empty. Same schedule engine as the forest companions
            // (forestBotSim), counted from the start of each week; nothing is written for them.
            _gwListenBots() {
                if (this._gwBotsOn || !window.firebaseDb) return;
                this._gwBotsOn = true;
                const { ref, onValue } = window.firebaseDbHelpers;
                onValue(ref(window.firebaseDb, 'govWarConfig/bots'), (snap) => {
                    this._gwBots = snap.val();
                    this._gwSimLastCache = null;
                    this._gwSeen = Date.now();
                    if (this.currentView === 'govWarView') this.renderGovWar();
                });
                setInterval(() => {
                    if (this.currentView !== 'govWarView' || !this._gwBots || !this._gwBots.on) return;
                    this.renderGovWar();
                    const ev = (this._gwSim && this._gwSim.recent || []).filter((e) => e.at > (this._gwSeen || 0));
                    if (ev.length) { const e = ev[ev.length - 1]; this._gwSeen = e.at; this._gwTicker(e.g, e.m, e.n); }
                }, 6000);
            },
            _gwSimFor(from, to) {
                const cfg = this._gwBots;
                if (!cfg || !cfg.on || typeof forestBotSim !== 'function' || to <= from) return { live: {}, trees: {}, mins: {}, recent: [], liveTotal: 0 };
                return forestBotSim(Object.assign({}, cfg, { since: Math.max(numOr0(cfg.since), from) }), to);
            },
            _gwSimNow() {
                this._gwSim = this._gwSimFor(this._weekStart().getTime(), Date.now());
                return this._gwSim;
            },
            _gwSimLast() {
                const ws = this._weekStart().getTime();
                if (!this._gwSimLastCache || this._gwSimLastCache.ws !== ws) this._gwSimLastCache = { ws, sim: this._gwSimFor(this._weekStart(ws - 86400000).getTime(), ws) };
                return this._gwSimLastCache.sim;
            },
            // A real governorate's minutes going up = someone finished an attack: announce it.
            _gwSeenReal(data) {
                const prev = this._gwPrevReal;
                this._gwPrevReal = {};
                IRAQ_GOVERNORATES.forEach((g) => { this._gwPrevReal[g] = numOr0(data[g] && data[g].minutes); });
                if (!prev || prev._wk !== this._gwWeek) { this._gwPrevReal._wk = this._gwWeek; return; }
                this._gwPrevReal._wk = this._gwWeek;
                IRAQ_GOVERNORATES.forEach((g) => {
                    const d = this._gwPrevReal[g] - numOr0(prev[g]);
                    if (d > 0 && !(this._gwJustDone && g === this._myGov())) this._gwTicker(g, d);
                });
                this._gwJustDone = false;
            },
            _gwTicker(g, m, who) {
                const el = document.getElementById('gwTicker');
                if (!el) return;
                el.innerHTML = `<i data-lucide="flame"></i><span>${who ? escapeHtml(who) + ' من ' : ''}<b>${escapeHtml(g)}</b> نفّذ${who ? '' : 'ت'} هجوم بـ ${numOr0(m)} دقيقة دراسة</span>`;
                try { lucide.createIcons(); } catch (e) {}
                el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
                clearTimeout(this._gwTickT);
                this._gwTickT = setTimeout(() => el.classList.remove('on'), 5200);
                if (this._gw3d) for (let i = 0; i < 4; i++) this._gw3d.salvo.push([g, i * 0.2]);
            },

            // ===== Attack mode: a study session right on the war page =====
            // Same rules as the forest: stay on the page (leaving the app for more than a few
            // seconds ends it), answer "still studying?" in time, and only a finished session
            // counts. While it runs your governorate keeps firing at the others on the map.
            GW_KEY: 'isp_gwar_session',
            GW_DURS: [25, 45, 60, 90],
            gwMinutes: 25,

            _gwRenderBattle() {
                const box = document.getElementById('gwBattle');
                if (!box) return;
                const gov = this._myGov(), w = this._gwar, r = this._gwResult;
                document.body.classList.toggle('gw-running', !!w);
                this._gwSig = [this.isLoggedIn ? 1 : 0, gov, w ? 1 : 0, r ? 1 : 0].join('|');
                if (!this.isLoggedIn || !this.currentUser || !gov) { box.innerHTML = ''; return; }
                if (w) {
                    const C = 2 * Math.PI * 44;
                    box.innerHTML = `
                        <section class="gw-bt run">
                            <div class="gw-bt-run">
                                <div class="gw-ring">
                                    <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="bg"/><circle cx="50" cy="50" r="44" class="fg" id="gwArc" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/></svg>
                                    <div><b id="gwClockRun" dir="ltr">--:--</b><span id="gwStage">تجهيز</span><em class="gold-x2">×2</em></div>
                                </div>
                                <div class="gw-bt-tx">
                                    <b>${escapeHtml(w.g)} تهاجم</b>
                                    <small>ابقَ بهاي الصفحة. بالنهاية تنضاف <em>${w.minutes} دقيقة</em> لمحافظتك و<em>+${w.minutes} نقطة</em> إلك</small>
                                    <div class="gw-power"><i id="gwPower"></i></div>
                                    <div class="gw-bt-warn"><i data-lucide="shield-alert"></i>الطلعة من الصفحة توقف الهجوم</div>
                                </div>
                            </div>
                            <button class="gw-quit" onclick="app.quitGovWar()">انسحاب</button>
                        </section>`;
                } else if (r) {
                    box.innerHTML = r.ok ? `
                        <section class="gw-bt res ok">
                            <span class="gw-res-ic"><i data-lucide="trophy"></i></span>
                            <b class="gw-res-t">نجح الهجوم!</b>
                            <p>انضافت <em>${r.w.minutes} دقيقة</em> ${escapeHtml(this._li(r.w.g))} وكسبت <em>+${r.w.minutes + (r.w.golden || 0)} نقطة</em>${r.w.golden ? ` (منها <em class="gold-t">${r.w.golden} ذهبية</em>)` : ''}.</p>
                            <button class="gw-go" onclick="app._gwResult = null; app._gwRenderBattle()"><i data-lucide="swords"></i>هجوم جديد</button>
                        </section>` : `
                        <section class="gw-bt res bad">
                            <span class="gw-res-ic"><i data-lucide="flag"></i></span>
                            <b class="gw-res-t">انقطع الهجوم</b>
                            <p>${escapeHtml(r.reason || '')}. ما انحسبت دقائق هالهجوم.</p>
                            <button class="gw-go" onclick="app._gwResult = null; app._gwRenderBattle()"><i data-lucide="rotate-ccw"></i>حاول مرة ثانية</button>
                        </section>`;
                } else {
                    box.innerHTML = `
                        <section class="gw-bt">
                            <div class="gw-bt-h"><span class="gw-bt-ic"><i data-lucide="swords"></i></span><div><b>هاجم ${escapeHtml(this._li(gov))}</b><small>ادرس بهاي الصفحة، ومحافظتك تقصف المحافظات طول ما إنت تدرس</small></div></div>
                            <div class="gold-hint"><i data-lucide="sparkles"></i>الساعة الذهبية شغالة: كل دقيقة بنقطتين</div>
                            <div class="gw-durs">${this.GW_DURS.map((m) => `<button class="${m === this.gwMinutes ? 'on' : ''}" onclick="app.gwMinutes = ${jsNum(m)}; app._gwRenderBattle()"><b>${m}</b><span>دقيقة</span><em>+${m} نقطة</em></button>`).join('')}</div>
                            <button class="gw-go" onclick="app.startGovWar()"><i data-lucide="crosshair"></i>ابدأ الهجوم</button>
                            <div class="gw-bt-rules"><span><i data-lucide="log-out"></i>تطلع من الصفحة أو التطبيق؟ يوكف الهجوم وما ينحسب</span><span><i data-lucide="hand"></i>كل شوية يسألك "لسه تدرس؟" وعندك دقيقة ترد</span></div>
                        </section>`;
                }
                try { lucide.createIcons(); } catch (e) {}
                this._gwHud();
            },

            // "ل" + name, joining "ال" the Arabic way (للبصرة, not لالبصرة)
            _li(g) { g = String(g || ''); return g.indexOf('ال') === 0 ? 'لل' + g.slice(2) : 'ل' + g; },

            _gwHud() {
                const el = document.getElementById('gwHud'), w = this._gwar;
                if (!el) return;
                el.classList.toggle('on', !!w);
                if (w) el.innerHTML = `<span class="gw-hud-dot"></span><b>${escapeHtml(w.g)}</b><span>تقصف هسه</span>`;
            },

            async startGovWar() {
                if (this._gwar || this._starting) return;
                if (!this.isLoggedIn || !this.currentUser) { this.goToAuth('login'); return; }
                const gov = this._myGov();
                if (!gov) { this.showToast('حدد محافظتك من حسابك أول'); return; }
                if (this._focus || this._forest || this._garden) { this.showToast('عندك جلسة شغالة، كمّلها أول'); return; }
                this._starting = true;
                const free = await this._sessionFree();
                this._starting = false;
                if (!free || this._gwar) return;
                const minutes = this.gwMinutes, now = this.trueNow();
                this._gwar = { start: now, dur: minutes * 60000, minutes, g: gov, next: now + this._frGap(true), check: null, shot: 0 };
                try { localStorage.setItem(this.GW_KEY, JSON.stringify({ start: now, dur: minutes * 60000 })); } catch (e) {}
                this._gwResult = null;
                this._bindGwEvents();
                this._requestWakeLock();
                this._govLiveJoin(minutes);
                if (this._gw3d) { this._gw3d.attacking = gov; for (let i = 0; i < 6; i++) this._gw3d.salvo.push([gov, i * 0.15]); }
                this._gwRenderBattle();
                document.getElementById('gw3d')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                clearInterval(this._gwTimer);
                this._gwTimer = setInterval(() => this._gwTickRun(), 500);
                this._gwTickRun();
                try { navigator.vibrate && navigator.vibrate([60, 40, 120]); } catch (e) {}
            },

            _gwStageName(p) { return p < 0.15 ? 'تجهيز' : p < 0.4 ? 'قصف' : p < 0.75 ? 'تقدّم' : p < 1 ? 'اقتحام' : 'نصر'; },

            _gwTickRun() {
                const w = this._gwar;
                if (!w || w.hiddenAt) return;
                const now = this.trueNow();
                if (w.check && now > w.check.until) { this.failGovWar('ما رديت على سؤال "لسه تدرس؟"'); return; }
                const left = w.start + w.dur - now;
                if (left <= 0) { this.completeGovWar(); return; }
                if (!w.check && now >= w.next && left > 60000) this._gwAsk();
                const p = 1 - left / w.dur, secs = Math.ceil(left / 1000);
                // the longer you study, the heavier the fire
                if (this._gw3d && now >= w.shot) {
                    const n = 1 + Math.floor(p * 3);
                    for (let i = 0; i < n; i++) this._gw3d.salvo.push([w.g, i * 0.22]);
                    w.shot = now + (7000 - p * 4000) * (0.7 + Math.random() * 0.6);
                }
                const clock = document.getElementById('gwClockRun');
                if (clock) clock.textContent = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
                const st = document.getElementById('gwStage');
                if (st) st.textContent = this._gwStageName(p);
                const arc = document.getElementById('gwArc');
                if (arc) arc.setAttribute('stroke-dashoffset', (2 * Math.PI * 44 * (1 - p)).toFixed(1));
                const pw = document.getElementById('gwPower');
                if (pw) pw.style.width = Math.max(4, p * 100).toFixed(1) + '%';
                if (w.check) {
                    const s = Math.max(0, Math.ceil((w.check.until - now) / 1000));
                    const el = document.getElementById('gwCkSec');
                    if (el) el.textContent = s;
                    const ring = document.getElementById('gwCkArc');
                    if (ring) ring.setAttribute('stroke-dashoffset', (2 * Math.PI * 30 * (1 - s / this.FOREST_CHECK_SECS)).toFixed(1));
                }
            },

            _gwAsk() {
                const w = this._gwar;
                if (!w) return;
                const words = ['قلعة', 'راية', 'درع', 'سيف', 'حصن', 'نجمة', 'نسر', 'برج'].sort(() => Math.random() - 0.5).slice(0, 3);
                const right = words[Math.floor(Math.random() * 3)];
                w.check = { until: this.trueNow() + this.FOREST_CHECK_SECS * 1000, right };
                const box = document.getElementById('gwCheck');
                if (box) {
                    const C = 2 * Math.PI * 30;
                    box.innerHTML = `
                        <div class="fr-ck gw-ck">
                            <div class="fr-ck-ring"><svg viewBox="0 0 70 70" aria-hidden="true"><circle cx="35" cy="35" r="30" class="bg"/><circle cx="35" cy="35" r="30" class="fg" id="gwCkArc" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="0"/></svg><b id="gwCkSec">${this.FOREST_CHECK_SECS}</b></div>
                            <b class="fr-ck-t">لسه تدرس؟</b>
                            <p>اضغط على كلمة <em>${escapeHtml(right)}</em> حتى يستمر الهجوم</p>
                            <div class="fr-ck-btns" style="flex-direction:${Math.random() < 0.5 ? 'row' : 'row-reverse'}">${words.map((x, i) => `<button style="margin-top:${[0, 18, 8][i]}px" onclick="app.answerGwCheck(this, ${jsArg(x)})">${escapeHtml(x)}</button>`).join('')}</div>
                        </div>`;
                    box.classList.remove('hidden');
                }
                this.playNotifySound();
                try { navigator.vibrate && navigator.vibrate([220, 120, 220]); } catch (e) {}
            },

            answerGwCheck(btn, x) {
                const w = this._gwar;
                if (!w || !w.check) return;
                if (x !== w.check.right) { btn.classList.remove('no'); void btn.offsetWidth; btn.classList.add('no'); return; }
                w.check = null;
                w.next = this.trueNow() + this._frGap(false);
                document.getElementById('gwCheck')?.classList.add('hidden');
                this.showToast('تمام، الهجوم مستمر');
            },

            async quitGovWar() {
                if (!this._gwar) return;
                if (!(await this.ask({ icon: 'flag', title: 'تنسحب من الهجوم؟', text: 'إذا انسحبت هسه ما تنحسب دقائق هالهجوم ولا نقاطه.', ok: 'انسحب', cancel: 'أكمل الهجوم' }))) return;
                this.failGovWar('انسحبت قبل ما يخلص الوقت');
            },

            async govWarBack() {
                if (this._gwar) {
                    if (!(await this.ask({ icon: 'flag', title: 'تطلع من ساحة الحرب؟', text: 'إذا طلعت هسه يوكف الهجوم وما ينحسب.', ok: 'اطلع', cancel: 'أكمل الهجوم' }))) return;
                    this.failGovWar('طلعت من صفحة الحرب', true);
                }
                this._gwResult = null;
                this.goBack();
            },

            _bindGwEvents() {
                if (this._gwBound) return;
                this._gwBound = true;
                document.addEventListener('visibilitychange', () => {
                    const w = this._gwar;
                    if (!w) return;
                    if (document.hidden) { w.hiddenAt = performance.now(); w.hiddenWall = Date.now(); return; }
                    if (!w.hiddenAt) return;
                    const away = Math.max(performance.now() - w.hiddenAt, Date.now() - (w.hiddenWall || 0));
                    delete w.hiddenAt;
                    if (away > this.FOREST_GRACE_MS) this.failGovWar('طلعت من التطبيق أثناء الهجوم');
                    else { this._requestWakeLock(); this._gwTickRun(); }
                });
            },

            _gwStop() {
                clearInterval(this._gwTimer);
                this._gwTimer = null;
                try { localStorage.removeItem(this.GW_KEY); } catch (e) {}
                if (this._wakeLock) { this._wakeLock.release().catch(() => {}); this._wakeLock = null; }
                this._govLiveLeave();
                document.getElementById('gwCheck')?.classList.add('hidden');
                if (this._gw3d) this._gw3d.attacking = '';
                const w = this._gwar;
                this._gwar = null;
                return w;
            },

            completeGovWar() {
                const w = this._gwStop();
                if (!w) return;
                this.playNotifySound();
                if (this._gw3d) { for (let i = 0; i < 16; i++) this._gw3d.salvo.push([w.g, i * 0.12]); this._gw3d.victory = { g: w.g, t0: performance.now() / 1000 }; }
                const u = this.currentUser || {};
                w.golden = this._goldenCredit(w);
                const pts = w.minutes + w.golden;
                this.saveFocusStats({ warWins: numOr0(u.warWins) + 1, warMinutes: numOr0(u.warMinutes) + w.minutes });
                this.addPointsAtomic(pts).then(() => this.logDailyActivity({ points: pts, studySessions: 1, minutes: w.minutes }));
                this._gwJustDone = true;
                this._govWarAdd(w.minutes);
                try { navigator.vibrate && navigator.vibrate([100, 60, 100, 60, 300]); } catch (e) {}
                this._gwResult = { ok: true, w };
                this._gwRenderBattle();
                if (this.currentView !== 'govWarView') this.showToast('نجح هجومك! +' + pts + ' نقطة');
            },

            failGovWar(reason, away) {
                const w = this._gwStop();
                if (!w) return;
                const u = this.currentUser || {};
                this.saveFocusStats({ warLost: numOr0(u.warLost) + 1 });
                try { navigator.vibrate && navigator.vibrate(400); } catch (e) {}
                this._gwResult = { ok: false, w, reason };
                this._gwRenderBattle();
                if (away || this.currentView !== 'govWarView') this.showToast('انقطع الهجوم: ' + reason);
            },

            checkInterruptedGovWar() {
                let saved = null;
                try { saved = JSON.parse(localStorage.getItem(this.GW_KEY) || 'null'); } catch (e) {}
                if (!saved) return;
                try { localStorage.removeItem(this.GW_KEY); } catch (e) {}
                setTimeout(() => this.showToast('انقطع هجومك بحرب المحافظات لأن التطبيق انسد قبل ما يخلص'), 1800);
            },

            claimGovWar() {
                if (!this._gwLast || !this.authUid || !window.firebaseDb) return;
                const { ref, runTransaction } = window.firebaseDbHelpers;
                runTransaction(ref(window.firebaseDb, 'users/' + this.authUid + '/govWarClaimed/' + this._gwLast.key), (cur) => (cur ? undefined : Date.now()))
                    .then((res) => {
                        this._gwClaimed = true;
                        if (!res.committed) { this.showToast('استلمت هاي الجائزة من قبل'); this.renderGovWar(); return; }
                        this.addPointsAtomic(this.GOV_WAR_PRIZE).then(() => {
                            this.showToast('مبروك! انضافت ' + this.GOV_WAR_PRIZE + ' نقطة لرصيدك');
                            this.renderGovWar();
                        });
                    }).catch(() => this.showToast('تعذر استلام الجائزة'));
            },

            _govLiveJoin(minutes) {
                if (!this._myGov() || !window.firebaseDb || !this.authUid) return;
                const { ref, set, onDisconnect } = window.firebaseDbHelpers;
                const r = ref(window.firebaseDb, 'focusLive/' + this.authUid);
                set(r, { gov: this._myGov(), until: this.trueNow() + minutes * 60000 + 60000, dev: this._deviceId() }).catch(() => {});
                try { onDisconnect(r).remove(); } catch (e) {}
            },

            _govLiveLeave() {
                if (!window.firebaseDb || !this.authUid) return;
                const { ref, set } = window.firebaseDbHelpers;
                set(ref(window.firebaseDb, 'focusLive/' + this.authUid), null).catch(() => {});
            },

            _govWarAdd(minutes) {
                const gov = this._myGov();
                if (!gov || !window.firebaseDb || !this.authUid) return;
                const { ref, runTransaction } = window.firebaseDbHelpers;
                const wk = this._weekKey();
                runTransaction(ref(window.firebaseDb, 'govWar/' + wk + '/' + gov), (cur) => {
                    const c = cur || {};
                    return { minutes: numOr0(c.minutes) + minutes, sessions: numOr0(c.sessions) + 1 };
                }).catch((e) => console.warn('Gov war update failed:', e));
                runTransaction(ref(window.firebaseDb, 'users/' + this.authUid + '/govWarMine/' + wk), (cur) => numOr0(cur) + minutes)
                    .then((res) => { if (res.committed) { this._gwMine = this._gwMine || {}; this._gwMine[wk] = res.snapshot.val(); } })
                    .catch(() => {});
            },

            // ===== Study twin (توأم المذاكرة) =====
            // twinQueue/{stage}/{uid} holds students waiting for a twin; a match writes
            // twins/{pairId} and twinOf/{uid} for both. Daily progress goes to
            // twins/{pairId}/days/{date}/{uid}; cheers are picked from a fixed list (no free
            // text, so nobody can pass on a phone number or anything personal).
            TWIN_STAGES: [['sixth-science', 'سادس علمي'], ['sixth-literary', 'سادس أدبي'], ['fifth-science', 'خامس علمي'], ['fifth-literary', 'خامس أدبي'], ['fourth', 'رابع إعدادي'], ['third-mid', 'ثالث متوسط']],
            TWIN_CHEERS: ['كمّل يا بطل', 'يلا نذاكر سوا', 'خلصت جلستي، دورك هسه', 'لا تستسلم هسه', 'فخور بيك اليوم', 'ارجع، أنتظرك'],
            TWIN_NOUNS: ['صقر', 'نجم', 'قمر', 'أسد', 'نسر', 'برق', 'جبل', 'سهم', 'نهر', 'فارس'],
            TWIN_ADJS: ['الهادئ', 'المثابر', 'السريع', 'الذكي', 'الصامد', 'المتألق', 'الطموح', 'الواثق', 'الشجاع', 'النشيط'],

            _twinStage() {
                let s = '';
                try { s = localStorage.getItem('isp_twin_stage') || ''; } catch (e) {}
                if (!this.TWIN_STAGES.some((x) => x[0] === s)) s = (this.currentUser && this.currentUser.grade === 'literary') ? 'sixth-literary' : 'sixth-science';
                return s;
            },

            setTwinStage(s) {
                if (this._twinSearching || !this.TWIN_STAGES.some((x) => x[0] === s)) return;
                try { localStorage.setItem('isp_twin_stage', s); } catch (e) {}
                this.renderTwin();
            },

            _newAlias() { const p = (l) => l[Math.floor(Math.random() * l.length)]; return p(this.TWIN_NOUNS) + ' ' + p(this.TWIN_ADJS); },

            _twinAlias() {
                let a = '';
                try { a = localStorage.getItem('isp_twin_alias') || ''; } catch (e) {}
                if (!a) { a = this._newAlias(); try { localStorage.setItem('isp_twin_alias', a); } catch (e) {} }
                return a;
            },

            rerollTwinAlias() {
                if (this._twinSearching) return;
                try { localStorage.setItem('isp_twin_alias', this._newAlias()); } catch (e) {}
                this.renderTwin();
            },

            goToTwin() {
                this._twinAttach();
                this.renderTwin();
                this.switchView('twinView');
            },

            _twinAttach() {
                if (!window.firebaseDb || !this.authUid || this._twinOfListener) return;
                const { ref, onValue, get } = window.firebaseDbHelpers;
                this._twinOfListener = onValue(ref(window.firebaseDb, 'twinOf/' + this.authUid), (snap) => {
                    const pid = typeof snap.val() === 'string' ? snap.val() : null;
                    if (pid === this._twinPairId && (pid || this._twinPairId === null)) { if (this.currentView === 'twinView') this.renderTwin(); return; }
                    if (typeof this._twinPairListener === 'function') this._twinPairListener();
                    this._twinPairListener = null;
                    this._twinPairId = pid;
                    this._twinData = null;
                    if (pid) {
                        this._twinSearching = false;
                        this._twinPairListener = onValue(ref(window.firebaseDb, 'twins/' + pid), (s2) => {
                            this._twinData = s2.val();
                            if (this._twinData && this._twinData.ended) {
                                const { set } = window.firebaseDbHelpers;
                                set(ref(window.firebaseDb, 'twinOf/' + this.authUid), null).catch(() => {});
                                return;
                            }
                            this._twinCheerToast();
                            if (this.currentView === 'twinView') this.renderTwin();
                        });
                    }
                    if (this.currentView === 'twinView') this.renderTwin();
                });
                get(ref(window.firebaseDb, 'twinQueue/' + this._twinStage() + '/' + this.authUid)).then((s) => {
                    const v = s.val();
                    this._twinSearching = !!(v && v.alias && !this._twinPairId);
                    if (this.currentView === 'twinView') this.renderTwin();
                }).catch(() => {});
            },

            _twinOther() {
                const d = this._twinData;
                const uid = d && d.members ? Object.keys(d.members).find((u) => u !== this.authUid) : null;
                const m = uid ? d.members[uid] || {} : {};
                return { uid: uid || '', alias: String(m.alias || 'توأمك'), gov: String(m.gov || '') };
            },

            async findTwin() {
                if (!this.isLoggedIn || !this.authUid || !window.firebaseDb) { this.showToast('سجّل دخولك أول'); this.goToAuth('login'); return; }
                if (this._twinPairId || this._twinBusy) return;
                this._twinBusy = true;
                this.renderTwin();
                const { ref, get, set, update, runTransaction } = window.firebaseDbHelpers;
                const db = window.firebaseDb, me = this.authUid, stage = this._twinStage(), gov = this._myGov(), alias = this._twinAlias();
                const qp = 'twinQueue/' + stage + '/';
                try {
                    // If I'm waiting in the queue, lock my own entry first so nobody pairs me while I search.
                    const mineQ = await get(ref(db, qp + me));
                    if (mineQ.exists()) {
                        const lock = await runTransaction(ref(db, qp + me + '/claimedBy'), (cur) => (cur && cur !== me ? undefined : me));
                        if (!lock.committed || lock.snapshot.val() !== me) { this._twinBusy = false; this.renderTwin(); return; }
                    }
                    const q = (await get(ref(db, 'twinQueue/' + stage))).val() || {};
                    const fresh = Date.now() - 7 * 86400000;
                    const cands = Object.keys(q)
                        .filter((u) => u !== me && q[u] && q[u].alias && !q[u].claimedBy && numOr0(q[u].at) > fresh && (!gov || !q[u].gov || q[u].gov !== gov))
                        .sort((a, b) => numOr0(q[a].at) - numOr0(q[b].at));
                    for (const u of cands) {
                        const res = await runTransaction(ref(db, qp + u + '/claimedBy'), (cur) => (cur ? undefined : me));
                        if (!res.committed || res.snapshot.val() !== me) continue;
                        const c = (await get(ref(db, qp + u))).val();
                        const busy = (await get(ref(db, 'twinOf/' + u))).val();
                        if (!c || !c.alias || busy) { await set(ref(db, qp + u), null); continue; }
                        const pid = 'p' + Date.now() + '_' + me.slice(0, 6);
                        await update(ref(db), {
                            ['twins/' + pid]: { stage, created: Date.now(), members: { [me]: { alias, gov }, [u]: { alias: String(c.alias).slice(0, 30), gov: String(c.gov || '') } } },
                            ['twinOf/' + me]: pid,
                            ['twinOf/' + u]: pid,
                            [qp + u]: null,
                            [qp + me]: null
                        });
                        this._twinBusy = false;
                        this.showToast('لكينالك توأم! تعرّف على ' + c.alias);
                        return;
                    }
                    await set(ref(db, qp + me), { alias, gov, at: Date.now() });
                    this._twinSearching = true;
                } catch (e) {
                    console.warn('Twin match failed:', e);
                    this.showToast('تعذر البحث، حاول مرة ثانية');
                }
                this._twinBusy = false;
                this.renderTwin();
            },

            cancelTwinSearch() {
                if (!window.firebaseDb || !this.authUid) return;
                const { ref, set } = window.firebaseDbHelpers;
                set(ref(window.firebaseDb, 'twinQueue/' + this._twinStage() + '/' + this.authUid), null).catch(() => {});
                this._twinSearching = false;
                this.renderTwin();
            },

            async endTwin() {
                if (!this._twinPairId) return;
                if (!(await this.ask({ icon: 'user-x', title: 'تنهي التوأمة؟', text: 'يختفي تقدمكم المشترك وتكدر تدور على توأم جديد.', ok: 'أنهِ التوأمة' }))) return;
                if (!this._twinPairId) return;
                const { ref, update } = window.firebaseDbHelpers;
                const other = this._twinOther();
                const upd = { ['twins/' + this._twinPairId + '/ended']: Date.now(), ['twinOf/' + this.authUid]: null };
                if (other.uid) upd['twinOf/' + other.uid] = null;
                update(ref(window.firebaseDb), upd).then(() => this.showToast('انتهت التوأمة')).catch(() => this.showToast('تعذر إنهاء التوأمة'));
            },

            sendTwinCheer(i) {
                if (!this.TWIN_CHEERS[i] || !this._twinPairId || !window.firebaseDb) return;
                const key = 'isp_twin_cheers_' + this.localDateStr();
                let n = 0;
                try { n = Number(localStorage.getItem(key)) || 0; } catch (e) {}
                if (n >= 5) { this.showToast('وصلت حد التشجيعات لليوم (5)'); return; }
                const { ref, set } = window.firebaseDbHelpers;
                set(ref(window.firebaseDb, 'twins/' + this._twinPairId + '/cheers/' + Date.now() + '_' + this.authUid.slice(0, 6)), { from: this.authUid, i, at: Date.now() })
                    .then(() => {
                        try { localStorage.setItem(key, String(n + 1)); } catch (e) {}
                        this.showToast('وصل تشجيعك لتوأمك');
                    }).catch(() => this.showToast('تعذر الإرسال'));
            },

            _twinCheerToast() {
                const d = this._twinData;
                if (!d || !d.cheers) return;
                let seen = 0;
                try { seen = Number(localStorage.getItem('isp_twin_seen')) || 0; } catch (e) {}
                const got = Object.values(d.cheers).filter((c) => c && c.from !== this.authUid && numOr0(c.at) > seen && this.TWIN_CHEERS[c.i]).sort((a, b) => b.at - a.at);
                if (!got.length) return;
                this.showToast('توأمك بعثلك: ' + this.TWIN_CHEERS[got[0].i]);
                try { localStorage.setItem('isp_twin_seen', String(got[0].at)); } catch (e) {}
            },

            // Called from logDailyActivity: mirrors today's points / sessions to the twin pair.
            _twinReport(deltas) {
                const pts = numOr0(deltas.points), ses = numOr0(deltas.studySessions);
                if ((pts <= 0 && ses <= 0) || !window.firebaseDb || !this.authUid) return;
                const { ref, get, runTransaction } = window.firebaseDbHelpers;
                const go = (pid) => {
                    if (typeof pid !== 'string' || !pid) return;
                    runTransaction(ref(window.firebaseDb, 'twins/' + pid + '/days/' + this.localDateStr() + '/' + this.authUid), (cur) => {
                        const c = cur || {};
                        return { points: numOr0(c.points) + Math.max(0, pts), sessions: numOr0(c.sessions) + Math.max(0, ses) };
                    }).catch(() => {});
                };
                if (this._twinPairId) go(this._twinPairId);
                else get(ref(window.firebaseDb, 'twinOf/' + this.authUid)).then((s) => go(s.val())).catch(() => {});
            },

            renderTwin() {
                const box = document.getElementById('twinContent');
                if (!box) return;
                const hero = `
                    <section class="tw-hero">
                        <div class="tw-orbs"><span class="tw-orb"><i data-lucide="user-round"></i></span><span class="tw-link"></span><span class="tw-orb b"><i data-lucide="user-round"></i></span></div>
                        <b>توأم المذاكرة</b>
                        <p>نربطك بطالب بنفس مرحلتك من محافظة ثانية. تشوفون تقدم بعض كل يوم، وكل واحد يشجع الثاني.</p>
                    </section>`;
                if (!this.isLoggedIn) {
                    box.innerHTML = hero + '<button class="lv-btn btn-press" onclick="app.goToAuth(\'login\')"><i data-lucide="log-in"></i>سجّل دخولك حتى تلكه توأم</button>';
                    lucide.createIcons();
                    return;
                }
                const d = this._twinData;
                if (this._twinPairId && d && d.members && !d.ended) { box.innerHTML = this._twinPairedHtml(d); lucide.createIcons(); return; }
                if (this._twinPairId && !d) { box.innerHTML = hero + '<div class="lv-empty">جاري تحميل توأمك...</div>'; lucide.createIcons(); return; }
                const stage = this._twinStage();
                const stageLabel = (this.TWIN_STAGES.find((x) => x[0] === stage) || [])[1] || '';
                box.innerHTML = hero + `
                    <div class="tw-points">
                        <div><i data-lucide="venetian-mask"></i><span>أسماء مستعارة، بدون صور ولا أرقام</span></div>
                        <div><i data-lucide="shield-check"></i><span>ماكو رسائل مكتوبة، بس تشجيعات جاهزة</span></div>
                        <div><i data-lucide="bell-ring"></i><span>إذا توأمك غاب يوم تنتبه، وتشجعه حتى يرجع</span></div>
                    </div>
                    ${this._twinSearching ? `
                    <div class="tw-search">
                        <div class="tw-radar"><i></i><i></i><i></i><span><i data-lucide="search"></i></span></div>
                        <b>دا ندورلك على توأم...</b>
                        <p>أول ما يدور طالب من ${escapeHtml(stageLabel)} بمحافظة ثانية تنربطون، وتلكه هنا.<br>اسمك المستعار: <b style="display:inline;font-size:13px;color:#7C3AED">${escapeHtml(this._twinAlias())}</b></p>
                        <button class="tw-cancel" onclick="app.cancelTwinSearch()">إلغاء البحث</button>
                    </div>` : `
                    <div class="lv-sec">مرحلتك</div>
                    <div class="tw-stages">${this.TWIN_STAGES.map(([k, l]) => `<button class="${k === stage ? 'on' : ''}" onclick="app.setTwinStage('${k}')">${l}</button>`).join('')}</div>
                    <div class="tw-alias"><span>اسمك المستعار</span><b>${escapeHtml(this._twinAlias())}</b><button onclick="app.rerollTwinAlias()" aria-label="اسم ثاني"><i data-lucide="refresh-cw"></i></button></div>
                    <button class="lv-btn btn-press" onclick="app.findTwin()" ${this._twinBusy ? 'disabled' : ''}><i data-lucide="search"></i>${this._twinBusy ? 'دا ندور...' : 'دوّر لي على توأم'}</button>`}
                `;
                lucide.createIcons();
            },

            _twinPairedHtml(d) {
                const me = this.authUid;
                const other = this._twinOther();
                const mine = (d.members && d.members[me]) || { alias: this._twinAlias() };
                const days = d.days || {};
                const act = (key, uid) => { const v = uid && days[key] && days[key][uid]; return v ? { p: numOr0(v.points), s: numOr0(v.sessions) } : null; };
                const DAY = 86400000;
                const today = this.localDateStr(), yest = this.localDateStr(new Date(Date.now() - DAY));
                const tMe = act(today, me) || { p: 0, s: 0 }, tHim = act(today, other.uid) || { p: 0, s: 0 };
                const since = Math.max(1, Math.floor((Date.now() - numOr0(d.created)) / DAY) + 1);
                let streak = 0;
                for (let i = 0; i < 400; i++) {
                    const k = this.localDateStr(new Date(Date.now() - i * DAY));
                    if (act(k, me) && act(k, other.uid)) streak++;
                    else if (i > 0) break;
                }
                const names = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
                const week = [];
                for (let i = 6; i >= 0; i--) {
                    const dt = new Date(Date.now() - i * DAY), k = this.localDateStr(dt);
                    week.push({ n: i === 0 ? 'اليوم' : names[dt.getDay()], a: !!act(k, me), b: !!act(k, other.uid) });
                }
                const startYest = new Date(new Date().setHours(0, 0, 0, 0) - DAY).getTime();
                const missed = numOr0(d.created) < startYest && !act(yest, other.uid);
                const diff = tMe.p - tHim.p;
                const cheers = Object.values(d.cheers || {}).filter((c) => c && c.from === other.uid && this.TWIN_CHEERS[c.i]).sort((a, b) => b.at - a.at).slice(0, 5);
                return `
                    <section class="tw-pair">
                        <div class="tw-p"><span class="tw-av"><i data-lucide="user-round"></i></span><b>${escapeHtml(mine.alias || '')}</b><small>إنت${mine.gov ? ' · ' + escapeHtml(mine.gov) : ''}</small></div>
                        <div class="tw-mid"><span class="tw-beat"></span><em>${since} يوم سوا</em></div>
                        <div class="tw-p him"><span class="tw-av"><i data-lucide="user-round"></i></span><b>${escapeHtml(other.alias)}</b><small>توأمك${other.gov ? ' · ' + escapeHtml(other.gov) : ''}</small></div>
                    </section>
                    ${missed ? '<div class="tw-alert"><i data-lucide="bell-ring"></i><div><b>توأمك غاب البارحة</b><span>ابعثله تشجيع من تحت حتى يرجع يذاكر وياك</span></div></div>' : ''}

                    <div class="lv-sec">اليوم</div>
                    <div class="tw-today">
                        <div class="tw-col"><small>إنت</small><b>${tMe.p}</b><span>نقطة · ${tMe.s} جلسة</span></div>
                        <div class="tw-vs">ضد</div>
                        <div class="tw-col him"><small>توأمك</small><b>${tHim.p}</b><span>نقطة · ${tHim.s} جلسة</span></div>
                    </div>
                    <p class="tw-note">${diff > 0 ? 'إنت متقدم اليوم بـ ' + diff + ' نقطة، كمّل' : diff < 0 ? 'توأمك متقدم عليك بـ ' + (-diff) + ' نقطة، دورك هسه' : (tMe.p ? 'متعادلين اليوم' : 'محد بدى اليوم، كون إنت الأول')}</p>
                    ${diff <= 0 ? '<button class="lv-btn btn-press" onclick="app.goToFocus()"><i data-lucide="timer"></i>ابدأ جلسة تركيز</button>' : ''}

                    <div class="lv-sec">آخر 7 أيام<small>سلسلة سوا: ${streak} يوم</small></div>
                    <div class="tw-week">
                        <div class="tw-wk-lbl"><span>إنت</span><span>توأمك</span></div>
                        ${week.map((w) => `<div class="tw-wk-day${w.a && w.b ? ' both' : ''}"><i class="${w.a ? 'on' : ''}"></i><i class="him${w.b ? ' on' : ''}"></i><span>${w.n}</span></div>`).join('')}
                    </div>

                    <div class="lv-sec">شجّع توأمك<small>5 تشجيعات باليوم</small></div>
                    <div class="tw-cheers">${this.TWIN_CHEERS.map((c, i) => `<button class="btn-press" onclick="app.sendTwinCheer(${i})">${escapeHtml(c)}</button>`).join('')}</div>
                    ${cheers.length ? `<div class="lv-sec">وصلك من توأمك</div><div class="tw-got">${cheers.map((c) => `<div><i data-lucide="heart"></i><b>${escapeHtml(this.TWIN_CHEERS[c.i])}</b><span>${timeAgo(c.at)}</span></div>`).join('')}</div>` : ''}
                    <button class="tw-end" onclick="app.endTwin()">إنهاء التوأمة</button>
                `;
            },

            // ===== Wasted time calculator (حاسبة الوقت الضايع) =====
            WASTE_CATS: [['reels', 'فيديوهات قصيرة', 'clapperboard', '#E5484D'], ['social', 'سوشيال ميديا', 'users', '#8B5CF6'], ['games', 'ألعاب', 'gamepad-2', '#0EA5E9'], ['series', 'مسلسلات ويوتيوب', 'tv', '#F59E0B'], ['chat', 'دردشة', 'message-circle', '#16A34A']],
            wasteCut: 50,

            _wasteLoad() {
                const def = { reels: 1.5, social: 1, games: 1, series: 1, chat: 0.5 };
                try {
                    const v = JSON.parse(localStorage.getItem('isp_waste') || 'null');
                    if (v && typeof v === 'object') this.WASTE_CATS.forEach(([k]) => { const n = Number(v[k]); if (!isNaN(n)) def[k] = Math.max(0, Math.min(8, n)); });
                } catch (e) {}
                return def;
            },

            goToWaste() {
                this.renderWaste();
                this.switchView('wasteView');
            },

            setWaste(k, v) {
                const w = this._wasteLoad();
                w[k] = Math.max(0, Math.min(8, Number(v) || 0));
                try { localStorage.setItem('isp_waste', JSON.stringify(w)); } catch (e) {}
                const lbl = document.getElementById('wsV_' + k);
                if (lbl) lbl.textContent = this._wasteH(w[k]);
                this._renderWasteOut(false);
            },

            setWasteCut(p) { this.wasteCut = p; this._renderWasteOut(false); },

            _wasteH(h) { return h === 0 ? 'ولا دقيقة' : (h < 1 ? Math.round(h * 60) + ' دقيقة' : (Math.round(h * 10) / 10) + ' ساعة'); },

            _wasteHorizon() {
                const now = Date.now();
                const ex = (typeof examSchedule !== 'undefined' ? examSchedule : [])
                    .map((e) => ({ e, t: new Date(e.date).getTime() })).filter((x) => !isNaN(x.t) && x.t > now).sort((a, b) => a.t - b.t)[0];
                if (ex) return { days: Math.max(1, Math.ceil((ex.t - now) / 86400000)), label: 'امتحان ' + (ex.e.subject || 'الجاي') };
                const d = new Date();
                let t = new Date(d.getFullYear(), 5, 10).getTime();
                if (t <= now) t = new Date(d.getFullYear() + 1, 5, 10).getTime();
                return { days: Math.max(1, Math.ceil((t - now) / 86400000)), label: 'الامتحانات الوزارية' };
            },

            _wasteCalc() {
                const w = this._wasteLoad();
                const daily = this.WASTE_CATS.reduce((a, [k]) => a + w[k], 0);
                const hz = this._wasteHorizon();
                const horizon = daily * hz.days;
                return { w, daily, month: Math.round(daily * 30), yearDays: Math.round((daily * 365) / 24), hz, horizon, chapters: Math.floor(horizon / 3), malazim: Math.floor(horizon / 25), sessions: Math.floor((horizon * 60) / 25) };
            },

            renderWaste() {
                const box = document.getElementById('wasteContent');
                if (!box) return;
                const w = this._wasteLoad();
                box.innerHTML = `
                    <section class="ws-hero" id="wsHero"></section>
                    <div class="lv-sec">شكد تقضي باليوم على<small>حرّك الشريط</small></div>
                    <div class="ws-sliders">
                        ${this.WASTE_CATS.map(([k, l, ic, c]) => `
                            <div class="ws-sl" style="--c:${c}">
                                <div class="ws-sl-top"><span><i data-lucide="${ic}"></i></span>${l}<b id="wsV_${k}">${this._wasteH(w[k])}</b></div>
                                <input type="range" min="0" max="8" step="0.25" value="${w[k]}" oninput="app.setWaste('${k}', this.value)" aria-label="${l}">
                            </div>`).join('')}
                    </div>
                    <div class="ws-total">المجموع باليوم<b id="wsDaily"></b></div>
                    <div class="lv-sec" id="wsConvTitle"></div>
                    <div class="ws-conv" id="wsConv"></div>
                    <div class="lv-sec">لو قللتها</div>
                    <div class="ws-cut" id="wsCut"></div>
                    <div class="ws-acts">
                        <button class="lv-btn btn-press" onclick="app.wasteToFocus(60)"><i data-lucide="timer"></i>حوّل ساعة لتركيز</button>
                        <button class="lv-btn ghost btn-press" onclick="app.shareWasteStory()"><i data-lucide="image"></i>شارك كصورة</button>
                    </div>
                `;
                this._renderWasteOut(true);
            },

            _renderWasteOut(first) {
                const r = this._wasteCalc();
                const fmt = (n) => Math.round(n).toLocaleString('en-US');
                const hero = document.getElementById('wsHero');
                if (hero) {
                    hero.innerHTML = `<small>الوقت اللي يروح على الهاتف</small><b class="ws-big" id="wsBig">0</b><p>ساعة بالشهر، يعني <b>${fmt(r.yearDays)} يوم كامل</b> من سنتك</p>`;
                    this._countUp(document.getElementById('wsBig'), first ? 0 : (this._wsLast || 0), r.month);
                    this._wsLast = r.month;
                }
                const dl = document.getElementById('wsDaily');
                if (dl) dl.textContent = this._wasteH(r.daily);
                const ct = document.getElementById('wsConvTitle');
                if (ct) ct.innerHTML = `لحد ${escapeHtml(r.hz.label)}<small>بعد ${r.hz.days} يوم · ${fmt(r.horizon)} ساعة</small>`;
                const conv = document.getElementById('wsConv');
                if (conv) conv.innerHTML = [
                    ['book-open', '#0EA5E9', r.chapters, 'فصل تكدر تخلصه بهالوقت'],
                    ['library', '#8B5CF6', r.malazim, 'ملزمة كاملة من البداية للنهاية'],
                    ['timer', 'rgb(var(--p))', r.sessions, 'جلسة تركيز 25 دقيقة'],
                    ['star', '#F59E0B', Math.round(r.horizon * 60), 'نقطة لو حولتها كلها لتركيز']
                ].map(([ic, c, n, l], i) => `<div class="ws-c" style="--c:${c};animation-delay:${i * 0.05}s"><span><i data-lucide="${ic}"></i></span><b>${fmt(n)}</b><small>${l}</small></div>`).join('');
                const cut = document.getElementById('wsCut');
                if (cut) {
                    const saved = (r.horizon * this.wasteCut) / 100;
                    cut.innerHTML = `
                        <div class="ws-cut-opts">${[25, 50, 75].map((p) => `<button class="${p === this.wasteCut ? 'on' : ''}" onclick="app.setWasteCut(${p})">${p}%</button>`).join('')}</div>
                        <p>لو قللت وقت الهاتف ${this.wasteCut}% بس، توفر <b>${fmt(saved)} ساعة</b> لحد ${escapeHtml(r.hz.label)}.<br>هذا يكفي تخلص <b>${fmt(saved / 3)} فصل</b> زيادة وتكسب <b>${fmt(saved * 60)} نقطة</b> من جلسات التركيز.</p>`;
                }
                lucide.createIcons();
            },

            _countUp(el, from, to) {
                if (!el) return;
                const t0 = performance.now(), dur = 600;
                const step = (t) => {
                    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
                    el.textContent = Math.round(from + (to - from) * e).toLocaleString('en-US');
                    if (k < 1) requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            },

            wasteToFocus(m) {
                if (!this._focus) this.focusMinutes = m;
                this.goToFocus();
            },

            shareWasteStory() {
                const r = this._wasteCalc();
                this.openStory({
                    badge: 'الوقت الضايع', badgeColor: '#DC2626',
                    title: 'كنت أضيع ' + r.month + ' ساعة بالشهر على الهاتف',
                    sub: 'قررت أحول هالوقت للمذاكرة. احسب وقتك إنت هم',
                    stats: [[r.month, 'ساعة بالشهر'], [r.chapters, 'فصل ممكن أخلصه'], [r.yearDays, 'يوم بالسنة']]
                });
            },

            // ===== Points auction (مزاد النقاط) =====
            // The admin publishes auction/current; the highest bid sits in auctionBids/{id}/top.
            // Bidding holds the points right away; the outbid student gets them back from the
            // client that outbid them (a transaction on their points plus a refund notice).
            goToAuction() {
                this._auAttach();
                this._auAmount = 0;
                this.renderAuction();
                this.switchView('auctionView');
                this._liveTick(() => {
                    if (this.currentView !== 'auctionView') return false;
                    const a = this._auCur;
                    const el = document.getElementById('auClock');
                    if (a && el) {
                        const left = numOr0(a.endsAt) - Date.now();
                        if (left <= 0) this.renderAuction(); else el.innerHTML = this._fmtLeft(left);
                    }
                    return true;
                });
            },

            _auAttach() {
                if (!window.firebaseDb || this._auCurUnsub) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._auCurUnsub = onValue(ref(window.firebaseDb, 'auction/current'), (snap) => {
                    const cur = snap.val();
                    this._auCur = cur && typeof cur.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(cur.id) ? cur : null;
                    const id = this._auCur ? this._auCur.id : null;
                    if (id !== this._auBidsId) {
                        if (typeof this._auBidsUnsub === 'function') this._auBidsUnsub();
                        this._auBidsUnsub = null;
                        this._auBids = null;
                        this._auBidsId = id;
                        this._auAmount = 0;
                        if (id) {
                            this._auBidsUnsub = onValue(ref(window.firebaseDb, 'auctionBids/' + id), (s2) => {
                                this._auBids = s2.val() || {};
                                this._auRefundCheck();
                                if (this.currentView === 'auctionView') this.renderAuction();
                            });
                        }
                    }
                    if (this.currentView === 'auctionView') this.renderAuction();
                });
            },

            // When someone outbids me, their bid leaves my points in auctionBids/{id}/refunds/{me}/{amount};
            // I add them back to my own points myself, once each (the rules check the claim).
            _auRefundCheck() {
                const mine = this._auBids && this._auBids.refunds && this.authUid && this._auBids.refunds[this.authUid];
                if (!mine || typeof mine !== 'object') return;
                const id = this._auBidsId, me = this.authUid;
                const { ref, set } = window.firebaseDbHelpers;
                if (typeof mine.amount === 'number') { set(ref(window.firebaseDb, 'auctionBids/' + id + '/refunds/' + me), null).catch(() => {}); return; }
                this._auClaiming = this._auClaiming || {};
                Object.keys(mine).forEach((k) => {
                    const r = mine[k], amt = numOr0(r && r.amount);
                    if (!r || r.c || amt <= 0 || this._auClaiming[id + '/' + k]) return;
                    this._auClaiming[id + '/' + k] = true;
                    const path = 'auctionBids/' + id + '/refunds/' + me + '/' + k;
                    this.addPointsAtomic(amt, { claim: true, extra: { [path + '/c']: true, ['users/' + me + '/pc']: path } }).then((np) => {
                        if (np === null) return;
                        this.addWalletTransaction({ title: 'إرجاع مزايدة', amount: '+' + amt + ' نقطة', isNegative: false, icon: 'undo-2', iconColor: '#10B981', iconBg: 'bg-success/10' });
                        this.showToast('أحد زايد أعلى منك، رجعتلك ' + amt + ' نقطة');
                    });
                });
            },

            _auName(n) {
                const parts = String(n || 'طالب').trim().split(/\s+/);
                return parts[0] + (parts[1] ? ' ' + parts[1].charAt(0) + '.' : '');
            },

            _auState() {
                const a = this._auCur;
                const bids = this._auBids || {};
                const top = bids.top && numOr0(bids.top.amount) > 0 ? bids.top : null;
                const step = Math.max(1, Math.floor(numOr0(a && a.step)) || 10);
                const minNext = top ? numOr0(top.amount) + step : Math.max(1, Math.floor(numOr0(a && a.minBid)) || 1);
                return { a, bids, top, step, minNext };
            },

            renderAuction() {
                const box = document.getElementById('auctionContent');
                if (!box) return;
                const myPts = numOr0(this.currentUser && this.currentUser.points);
                const { a, bids, top, step, minNext } = this._auState();
                if (!a) {
                    box.innerHTML = `<div class="lv-empty"><i data-lucide="gavel"></i><b>ماكو مزاد هسه</b>كل أسبوع تنعرض جائزة جديدة، جمّع نقاطك من جلسات التركيز وترقب المزاد الجاي.<br>نقاطك هسه: <b style="display:inline">${myPts.toLocaleString('en-US')}</b></div>`;
                    lucide.createIcons();
                    return;
                }
                const ended = Date.now() >= numOr0(a.endsAt);
                const isMe = !!(top && top.uid === this.authUid);
                if (!this._auAmount || this._auAmount < minNext) this._auAmount = minNext;
                const log = Object.values(bids.log || {}).filter((b) => b && numOr0(b.amount) > 0).sort((x, y) => numOr0(y.at) - numOr0(x.at)).slice(0, 8);
                box.innerHTML = `
                    <section class="au-hero${ended ? ' ended' : ''}">
                        <div class="au-hero-top"><span class="au-tag"><i data-lucide="gavel"></i>مزاد الأسبوع</span><span class="au-clock">${ended ? 'انتهى المزاد' : `ينتهي بعد <b id="auClock">${this._fmtLeft(numOr0(a.endsAt) - Date.now())}</b>`}</span></div>
                        <h2>${escapeHtml(a.title || '')}</h2>
                        ${a.desc ? `<p>${escapeHtml(a.desc)}</p>` : ''}
                        <div class="au-top">
                            <small>${ended ? 'المزايدة الفائزة' : 'أعلى مزايدة'}</small>
                            <b>${top ? numOr0(top.amount).toLocaleString('en-US') : '-'}<em>نقطة</em></b>
                            <span>${top ? (isMe ? 'إنت' : escapeHtml(this._auName(top.name))) : 'محد زايد بعد، البداية من ' + minNext + ' نقطة'}</span>
                        </div>
                    </section>

                    ${ended ? `
                    <div class="au-win${isMe ? ' me' : ''}">
                        <i data-lucide="${top ? 'trophy' : 'circle-slash'}"></i>
                        <b>${!top ? 'انتهى المزاد بدون مزايدات' : isMe ? 'مبروك! فزت بالمزاد' : 'الفائز: ' + escapeHtml(this._auName(top.name))}</b>
                        <p>${!top ? 'ترقب المزاد الجاي' : isMe ? 'الإدارة راح تتواصل وياك حتى تستلم الجائزة' : 'فاز بـ ' + numOr0(top.amount).toLocaleString('en-US') + ' نقطة. حظ أوفر بالمزاد الجاي'}</p>
                    </div>` : `
                    <section class="au-bid">
                        <div class="au-mine"><span>نقاطك</span><b>${myPts.toLocaleString('en-US')}</b>${isMe ? `<em>+ ${numOr0(top.amount).toLocaleString('en-US')} محجوزة بالمزاد</em>` : ''}</div>
                        ${isMe ? '<div class="au-lead"><i data-lucide="crown"></i>إنت الأعلى هسه</div>' : ''}
                        <div class="au-step">
                            <button class="btn-press" onclick="app.auAdjust(-1)" aria-label="أقل"><i data-lucide="minus"></i></button>
                            <div><b id="auAmount">${this._auAmount}</b><small>أقل مزايدة ${minNext}</small></div>
                            <button class="btn-press" onclick="app.auAdjust(1)" aria-label="أكثر"><i data-lucide="plus"></i></button>
                        </div>
                        <div class="au-quick">${[1, 5, 10].map((k) => `<button class="btn-press" onclick="app.auAdjust(${k})">+${k * step}</button>`).join('')}</div>
                        <button class="lv-btn btn-press" id="auGo" onclick="app.placeBid()"><i data-lucide="gavel"></i>زايد بـ <span id="auGoAmt">${this._auAmount}</span> نقطة</button>
                        <p class="au-note">نقاطك تنحجز، وإذا أحد زايد أعلى منك ترجعلك كاملة.</p>
                    </section>`}

                    ${log.length ? `<div class="lv-sec">آخر المزايدات<small>${Object.keys(bids.log || {}).length} مزايدة</small></div>
                    <div class="au-log">${log.map((b) => `<div><i data-lucide="gavel"></i><b>${b.uid === this.authUid ? 'إنت' : escapeHtml(this._auName(b.name))}</b><em>${numOr0(b.amount).toLocaleString('en-US')}</em><span>${timeAgo(b.at)}</span></div>`).join('')}</div>` : ''}

                    <div class="lv-rules">
                        <div><i data-lucide="lock"></i>لما تزايد تنحجز نقاطك، وإذا أحد زايد أعلى منك ترجعلك كاملة</div>
                        <div><i data-lucide="clock"></i>إذا انحطت مزايدة بآخر دقيقتين، ينمدد المزاد دقيقتين حتى محد يخطف بآخر ثانية</div>
                        <div><i data-lucide="trophy"></i>أعلى مزايد لما يخلص الوقت ياخذ الجائزة، ونقاطه تنصرف</div>
                    </div>
                `;
                lucide.createIcons();
            },

            auAdjust(k) {
                const { step, minNext } = this._auState();
                const max = numOr0(this.currentUser && this.currentUser.points) + (this._auState().top && this._auState().top.uid === this.authUid ? numOr0(this._auState().top.amount) : 0);
                this._auAmount = Math.max(minNext, (this._auAmount || minNext) + k * step);
                if (k > 0 && this._auAmount > max && max >= minNext) this._auAmount = max;
                const a = document.getElementById('auAmount'), b = document.getElementById('auGoAmt');
                if (a) a.textContent = this._auAmount;
                if (b) b.textContent = this._auAmount;
            },

            async placeBid() {
                if (!this.isLoggedIn || !this.authUid || !window.firebaseDb) { this.showToast('سجّل دخولك أول'); this.goToAuth('login'); return; }
                const { a, step, minNext } = this._auState();
                if (!a || Date.now() >= numOr0(a.endsAt)) { this.showToast('المزاد منتهي'); return; }
                if (this._auBusy) return;
                const amount = Math.floor(numOr0(this._auAmount));
                if (amount < minNext) { this.showToast('أقل مزايدة ' + minNext + ' نقطة'); return; }
                const me = this.authUid, id = a.id, db = window.firebaseDb;
                const { ref, get, runTransaction, set } = window.firebaseDbHelpers;
                const name = String((this.currentUser && this.currentUser.fullName) || 'طالب').slice(0, 40);
                this._auBusy = true;
                const btn = document.getElementById('auGo');
                if (btn) btn.disabled = true;
                try {
                    // My points, the new top bid and the previous bidder's refund go in one write,
                    // so the rules can check that the bid is paid for and nobody loses points.
                    let ok = null;
                    for (let i = 0; i < 3 && ok === null; i++) {
                        const cur = (await get(ref(db, 'auctionBids/' + id + '/top'))).val();
                        const curAmt = cur && numOr0(cur.amount) > 0 ? numOr0(cur.amount) : 0;
                        if (curAmt && amount < curAmt + step) { ok = 'outbid'; break; }
                        const heldNow = cur && cur.uid === me ? curAmt : 0;
                        const extra = { ['auctionBids/' + id + '/top']: { uid: me, name, num: String((this.currentUser && this.currentUser.studentNumber) || ''), amount, at: Date.now() } };
                        if (curAmt && cur.uid && cur.uid !== me) extra['auctionBids/' + id + '/refunds/' + cur.uid + '/' + curAmt] = { amount: curAmt, at: Date.now() };
                        const left = await this.addPointsAtomic(-(amount - heldNow), { reject: true, spend: 'a:' + id + ':' + amount, extra });
                        if (left !== null) { ok = amount - heldNow; break; }
                        if (numOr0(this.currentUser && this.currentUser.points) < amount - heldNow) { ok = 'poor'; break; }
                    }
                    if (ok === 'poor' || ok === null) { this.showToast(ok === 'poor' ? 'نقاطك ما تكفي لهاي المزايدة' : 'تعذرت المزايدة، حاول مرة ثانية'); return; }
                    if (ok === 'outbid') { this.showToast('في واحد زايد قبلك، شوف السعر الجديد وحاول مرة ثانية'); return; }
                    set(ref(db, 'auctionBids/' + id + '/log/' + Date.now() + '_' + me.slice(0, 6)), { uid: me, name, amount, at: Date.now() }).catch(() => {});
                    if (numOr0(a.endsAt) - Date.now() < 120000) {
                        runTransaction(ref(db, 'auction/current/endsAt'), (cur) => Math.max(numOr0(cur), Date.now() + 120000)).catch(() => {});
                    }
                    this.addWalletTransaction({ title: 'مزايدة: ' + String(a.title || '').slice(0, 40), amount: '-' + ok + ' نقطة', isNegative: true, icon: 'gavel', iconColor: '#F59E0B', iconBg: 'bg-warning/10' });
                    this.showToast('صرت الأعلى بـ ' + amount + ' نقطة');
                } catch (e) {
                    console.warn('Bid failed:', e);
                    this.showToast('تعذرت المزايدة');
                } finally {
                    this._auBusy = false;
                    this._auAmount = 0;
                    this.renderAuction();
                }
            },

            // ===== Grades progress (تطور درجاتي) =====
            // Marks (0-100) per subject across the Iraqi school-year periods. Kept on the
            // device (isp_grades) and mirrored to users/{uid}/grades when signed in.
            GRADE_PERIODS: [['ش1', 'الشهر الأول'], ['ش2', 'الشهر الثاني'], ['نصف', 'نصف السنة'], ['ش3', 'الشهر الأول ف2'], ['ش4', 'الشهر الثاني ف2'], ['السعي', 'السعي السنوي'], ['النهائي', 'الامتحان النهائي']],
            GRADE_DEFAULT_SUBJECTS: ['الإسلامية', 'العربي', 'الإنكليزي', 'الرياضيات', 'الفيزياء', 'الكيمياء', 'الأحياء'],
            gradesSubject: null,

            _gradesLoad() {
                try {
                    const g = JSON.parse(localStorage.getItem('isp_grades') || 'null');
                    if (g && Array.isArray(g.subjects) && g.marks && typeof g.marks === 'object') return g;
                } catch (e) {}
                return { subjects: this.GRADE_DEFAULT_SUBJECTS.slice(), marks: {} };
            },

            _gradesSave(g) {
                try { localStorage.setItem('isp_grades', JSON.stringify(g)); } catch (e) {}
                if (!window.firebaseDb || !this.authUid) return;
                clearTimeout(this._grSaveT);
                this._grSaveT = setTimeout(() => {
                    const { ref, update } = window.firebaseDbHelpers;
                    update(ref(window.firebaseDb, 'users/' + this.authUid), { grades: g }).catch((e) => console.warn('Grades save failed:', e));
                }, 800);
            },

            _gradeSeries(g, subj) {
                const m = (g.marks && g.marks[subj]) || {};
                return this.GRADE_PERIODS.map((_, i) => {
                    const v = Number(m['p' + i]);
                    return m['p' + i] === undefined || m['p' + i] === null || m['p' + i] === '' || isNaN(v) ? null : Math.max(0, Math.min(100, v));
                });
            },

            _gradeLast(series) {
                for (let i = series.length - 1; i >= 0; i--) if (series[i] !== null) return { v: series[i], i };
                return null;
            },

            // ===== 3D biology diagrams (رسومات الأحياء) =====
            // The engine (three.js) and the models load only when this page opens:
            // js/bio/viewer.js and one file per chapter in js/bio/.
            BIO_CHAPTERS: [
                { f: 'cell', t: 'الخلية', c: '#10B981', icon: 'microscope' },
                { f: 'transport', t: 'نقل المواد عبر الغشاء', c: '#0EA5E9', icon: 'arrow-left-right' },
                { f: 'division', t: 'الانقسام الخيطي', c: '#8B5CF6', icon: 'git-fork' },
                { f: 'tissues', t: 'الأنسجة', c: '#F43F5E', icon: 'layers' },
                { f: 'repro', t: 'التكاثر', c: '#EC4899', icon: 'flower-2' }
            ],

            _bioImport(name) {
                this._bioMods = this._bioMods || {};
                if (!this._bioMods[name]) {
                    this._bioMods[name] = import(new URL('js/bio/' + name + '.js?v=' + (window.APP_VER || '1'), document.baseURI).href).catch((e) => { delete this._bioMods[name]; throw e; });
                }
                return this._bioMods[name];
            },

            goToBio() {
                this.switchView('bioView');
                this._bioScr = { s: 'list' };
                this._bioRender();
            },

            bioBack() {
                if (this._bioScr && this._bioScr.s === 'view') { this._bioClose(); this._bioScr = { s: 'list' }; this._bioRender(); return; }
                this.goBack();
            },

            _bioClose() {
                if (this._b3) { this._b3.dispose(); this._b3 = null; }
                document.body.classList.remove('b3-on');
            },

            async _bioRender() {
                const box = document.getElementById('bioContent');
                if (!box) return;
                const scr = this._bioScr || { s: 'list' };
                const t = document.getElementById('bioTitle'), sub = document.getElementById('bioSub');
                if (scr.s === 'list') {
                    if (t) t.textContent = 'رسومات الأحياء 3D';
                    if (sub) sub.textContent = 'السادس العلمي · اختار رسمة';
                    box.innerHTML = '<div class="b3-list"><div class="kd-loading"><span></span><span></span><span></span></div></div>';
                    let mods;
                    try { mods = await Promise.all(this.BIO_CHAPTERS.map((c) => this._bioImport(c.f))); }
                    catch (e) { box.innerHTML = '<p class="b3-err">ما انحملت الرسومات، تأكد من النت وحاول مرة ثانية</p>'; return; }
                    if (this.currentView !== 'bioView' || this._bioScr !== scr) return;
                    box.innerHTML = `<div class="b3-list">
                        <div class="b3-hero"><i data-lucide="rotate-3d"></i><div><b>كل رسمة مجسّمة</b><small>دوّرها بإصبعك، قرّب وبعّد، واضغط على أي جزء حتى تعرف اسمه ووظيفته. وبوضع "اختبر نفسك" تنخفي الأسماء وإنت تتذكرها.</small></div></div>
                        ${this.BIO_CHAPTERS.map((c, ci) => {
                            const list = mods[ci].MODELS;
                            return `<div class="b3-ch" style="--c:${c.c}"><b><i data-lucide="${c.icon}"></i>${escapeHtml(c.t)}</b><span>${list.length} رسمة</span></div>
                            <div class="b3-grid">${list.map((m, i) => `<button class="b3-card" style="--c:${c.c};--i:${i}" onclick="app.bioOpen(${jsArg(c.f)}, ${jsArg(m.id)})"><span class="b3-card-ic"><i data-lucide="${m.icon || 'box'}"></i></span><b>${escapeHtml(m.title)}</b><em><i data-lucide="rotate-3d"></i>3D</em></button>`).join('')}</div>`;
                        }).join('')}
                        
                    </div>`;
                    lucide.createIcons();
                    return;
                }
                // viewer
                const mod = await this._bioImport(scr.f).catch(() => null);
                const model = mod && mod.MODELS.find((m) => m.id === scr.id);
                if (!model) { this._bioScr = { s: 'list' }; this._bioRender(); return; }
                if (t) t.textContent = model.title;
                if (sub) sub.textContent = 'دوّرها بإصبعك واضغط على أي جزء';
                document.body.classList.add('b3-on');
                box.innerHTML = `<div class="b3-wrap">
                    <div class="b3" id="b3Root"><canvas></canvas><svg class="b3-lines"></svg><div class="b3-labels"></div><div class="b3-load"><div class="kd-loading"><span></span><span></span><span></span></div></div></div>
                    <div class="b3-bar">
                        <button id="b3Lb" class="on" onclick="app.bioTool('labels')"><i data-lucide="tag"></i>الأسماء</button>
                        <button id="b3Ex" onclick="app.bioTool('exam')"><i data-lucide="brain"></i>اختبر نفسك</button>
                        <button onclick="app.bioTool('reset')"><i data-lucide="rotate-ccw"></i>إعادة</button>
                    </div>
                    <div class="b3-info" id="b3Info"><i data-lucide="hand"></i><span>اضغط على أي جزء أو اسم حتى تعرف وظيفته</span></div>
                </div>`;
                lucide.createIcons();
                let V;
                try { V = await this._bioImport('viewer'); } catch (e) { box.innerHTML = '<p class="b3-err">ما انحمل العارض، تأكد من النت وحاول مرة ثانية</p>'; return; }
                if (this.currentView !== 'bioView' || this._bioScr !== scr) return;
                const host = document.getElementById('b3Root');
                try {
                    this._b3 = new V.Bio3D(host, (l) => this._bioInfo(l));
                    this._b3.show(model);
                } catch (e) {
                    console.warn('3D viewer failed:', e);
                    host.innerHTML = '<p class="b3-err">جهازك ما يدعم العرض ثلاثي الأبعاد</p>';
                    return;
                }
                host.querySelector('.b3-load')?.remove();
                if (this._b3.steps) {
                    const bar = document.createElement('div');
                    bar.className = 'b3-steps';
                    bar.id = 'b3Steps';
                    host.parentNode.insertBefore(bar, host.nextSibling);
                    this.bioStep(0, true);
                }
            },

            // Models with stages: previous / next and a dot per stage.
            bioStep(d, abs) {
                const v = this._b3, bar = document.getElementById('b3Steps');
                if (!v || !v.steps || !bar) return;
                v.setStep(abs ? d : v.step + d);
                const i = v.step, st = v.steps[i];
                bar.innerHTML = `<button onclick="app.bioStep(-1)" ${i ? '' : 'disabled'} aria-label="السابق"><i data-lucide="chevron-right"></i></button>
                    <div class="b3-steps-tx"><b>${escapeHtml(st[0])}</b><span>${v.steps.map((_, j) => `<i class="${j === i ? 'on' : j < i ? 'done' : ''}" onclick="app.bioStep(${j}, true)"></i>`).join('')}</span></div>
                    <button onclick="app.bioStep(1)" ${i < v.steps.length - 1 ? '' : 'disabled'} aria-label="التالي"><i data-lucide="chevron-left"></i></button>`;
                lucide.createIcons();
                const el = document.getElementById('b3Info');
                if (el && v.sel < 0) { el.classList.remove('on'); el.innerHTML = `<i data-lucide="info"></i><span><b style="display:inline;color:var(--text)">${escapeHtml(st[0])}: </b>${escapeHtml(st[1])}</span>`; lucide.createIcons(); }
            },

            bioOpen(f, id) {
                this._bioClose();
                this._bioScr = { s: 'view', f, id };
                this._bioRender();
            },

            bioTool(k) {
                const v = this._b3;
                if (!v) return;
                if (k === 'labels') { v.setLabels(!v.showLabels); document.getElementById('b3Lb')?.classList.toggle('on', v.showLabels); }
                else if (k === 'exam') {
                    v.setExam(!v.examMode);
                    document.getElementById('b3Ex')?.classList.toggle('on', v.examMode);
                    if (v.examMode && !v.showLabels) { v.setLabels(true); document.getElementById('b3Lb')?.classList.add('on'); }
                    this._bioInfo(null, v.examMode ? 'الأسماء مخفية. اضغط على أي رقم وتذكر اسمه، بعدها يطلعلك الجواب' : null);
                }
                else if (k === 'reset') { v.reset(); if (v.sel >= 0) v.select(v.sel); }
            },

            _bioInfo(l, msg) {
                const el = document.getElementById('b3Info');
                if (!el) return;
                el.classList.toggle('on', !!l);
                el.innerHTML = l ? `<b>${escapeHtml(l.name)}</b><span>${escapeHtml(l.desc)}</span>` : `<i data-lucide="${msg ? 'brain' : 'hand'}"></i><span>${escapeHtml(msg || 'اضغط على أي جزء أو اسم حتى تعرف وظيفته')}</span>`;
                if (!l) lucide.createIcons();
            },

            // ===== Review cards (بطاقات المراجعة) — the engine is in js/cards.js =====
            goToCards() {
                this.switchView('cardsView');
                if (this._withPart('cards', () => typeof this.kdOpen === 'function', 'cardsView', () => this.goToCards())) {
                    const box = document.getElementById('cardsContent');
                    if (box) box.innerHTML = '<div class="kd-loading"><span></span><span></span><span></span></div>';
                    return;
                }
                this.kdOpen();
            },

            goToUni() {
                this.switchView('uniView');
                if (this._withPart('uni', () => typeof this.uniOpen === 'function', 'uniView', () => this.goToUni())) {
                    const box = document.getElementById('uniContent');
                    if (box) box.innerHTML = '<div class="kd-loading"><span></span><span></span><span></span></div>';
                    return;
                }
                this.uniOpen();
            },

            goToGrades() {
                const g = this._gradesLoad();
                if (!this.gradesSubject || g.subjects.indexOf(this.gradesSubject) === -1) {
                    this.gradesSubject = g.subjects.find((s) => this._gradeLast(this._gradeSeries(g, s))) || g.subjects[0] || null;
                }
                this._grAdding = false;
                this.renderGrades();
                this.switchView('gradesView');
            },

            renderGrades() {
                const box = document.getElementById('gradesContent');
                if (!box) return;
                const g = this._gradesLoad();
                const subj = this.gradesSubject;
                const series = subj ? this._gradeSeries(g, subj) : [];
                box.innerHTML = `
                    <div class="gr-tiles" id="grTiles"></div>

                    <div class="gr-sec">المواد<small>${g.subjects.length} مادة</small></div>
                    <div class="gr-chips">
                        ${g.subjects.map((s) => `<button class="gr-chip${s === subj ? ' on' : ''}" onclick="app.selectGradeSubject(${jsArg(s)})">${escapeHtml(s)}</button>`).join('')}
                        <button class="gr-chip" onclick="app.toggleGradeAdd()"><i data-lucide="plus"></i>مادة</button>
                    </div>
                    ${this._grAdding ? `
                    <div class="gr-add">
                        <input id="grAddInput" maxlength="24" placeholder="اسم المادة، مثلاً الحاسوب" onkeydown="if(event.key==='Enter')app.addGradeSubject()">
                        <button onclick="app.addGradeSubject()">إضافة</button>
                    </div>` : ''}

                    ${subj ? `
                    <div class="gr-card">
                        <h4>${escapeHtml(subj)} خلال السنة</h4>
                        <div id="grTrend"></div>
                        <div class="gr-chart" id="grChart"></div>
                    </div>

                    <div class="gr-sec">درجات ${escapeHtml(subj)}<small>من 100</small></div>
                    <div class="gr-inputs">
                        ${this.GRADE_PERIODS.map(([, full], i) => `
                            <div class="gr-in${series[i] !== null && series[i] < 50 ? ' low' : ''}" id="grIn${i}">
                                <label for="grInput${i}">${escapeHtml(full)}</label>
                                <input id="grInput${i}" type="number" inputmode="numeric" min="0" max="100" placeholder="-" value="${series[i] === null ? '' : jsNum(series[i])}" onchange="app.setGrade(${i}, this.value)">
                            </div>`).join('')}
                    </div>

                    <div class="gr-acts">
                        <button class="pri" onclick="app.shareGradesStory()"><i data-lucide="image"></i>شارك تطوري كصورة</button>
                        <button class="del" onclick="app.removeGradeSubject()" aria-label="حذف المادة"><i data-lucide="trash-2"></i></button>
                    </div>` : '<div class="gr-empty">ضيف مادة حتى تبدي تسجّل درجاتك</div>'}

                    <div class="gr-sec">آخر درجة بكل مادة</div>
                    <div id="grBars"></div>
                `;
                this._renderGradesDynamic();
                if (this._grAdding) setTimeout(() => document.getElementById('grAddInput')?.focus(), 50);
            },

            // Everything that depends on the marks, redrawn after each input without
            // touching the inputs themselves (so focus moves normally between them).
            _renderGradesDynamic() {
                const g = this._gradesLoad();
                const subj = this.gradesSubject;
                const lasts = g.subjects.map((s) => ({ s, last: this._gradeLast(this._gradeSeries(g, s)) })).filter((x) => x.last);

                const tiles = document.getElementById('grTiles');
                if (tiles) {
                    const avg = lasts.length ? Math.round(lasts.reduce((a, x) => a + x.last.v, 0) / lasts.length * 10) / 10 : null;
                    const sorted = lasts.slice().sort((a, b) => b.last.v - a.last.v);
                    const best = sorted[0], weak = sorted.length > 1 ? sorted[sorted.length - 1] : null;
                    tiles.innerHTML = `
                        <div class="gr-tile" style="--c:rgb(var(--p))"><span><i data-lucide="gauge"></i>المعدل</span><b>${avg === null ? '-' : avg}</b><small>${lasts.length} مادة مسجّلة</small></div>
                        <div class="gr-tile" style="--c:#16A34A;animation-delay:.05s"><span><i data-lucide="trophy"></i>الأقوى</span><b>${best ? best.last.v : '-'}</b><small>${best ? escapeHtml(best.s) : 'ماكو بعد'}</small></div>
                        <div class="gr-tile" style="--c:#DC2626;animation-delay:.1s"><span><i data-lucide="triangle-alert"></i>تحتاج اهتمام</span><b>${weak ? weak.last.v : '-'}</b><small>${weak ? escapeHtml(weak.s) : 'ماكو بعد'}</small></div>`;
                }

                const chart = document.getElementById('grChart');
                const trend = document.getElementById('grTrend');
                if (chart && subj) {
                    const series = this._gradeSeries(g, subj);
                    const pts = series.map((v, i) => (v === null ? null : { v, i })).filter(Boolean);
                    if (trend) {
                        if (pts.length >= 2) {
                            const a = pts[pts.length - 2], b = pts[pts.length - 1], d = Math.round((b.v - a.v) * 10) / 10;
                            trend.className = 'gr-trend ' + (d > 0 ? 'up' : d < 0 ? 'down' : '');
                            trend.innerHTML = d === 0 ? `<i data-lucide="minus"></i>نفس درجة ${this.GRADE_PERIODS[a.i][1]}`
                                : `<i data-lucide="${d > 0 ? 'trending-up' : 'trending-down'}"></i>${d > 0 ? 'ارتفعت' : 'نزلت'} <span dir="ltr">${d > 0 ? '+' : ''}${d}</span> عن ${this.GRADE_PERIODS[a.i][1]}`;
                        } else {
                            trend.className = 'gr-trend';
                            trend.textContent = pts.length ? 'سجّل درجة ثانية حتى يطلع اتجاهك' : 'سجّل درجاتك تحت حتى يطلع الرسم';
                        }
                    }
                    chart.innerHTML = this._gradeChartSvg(series);
                }

                const bars = document.getElementById('grBars');
                if (bars) {
                    const sorted = lasts.slice().sort((a, b) => b.last.v - a.last.v);
                    const low = sorted.filter((x) => x.last.v < 50);
                    bars.innerHTML = sorted.length ? `
                        <div class="gr-bars">
                            ${sorted.map((x, i) => `
                                <button class="gr-bar${x.last.v < 50 ? ' low' : ''}${x.s === subj ? ' on' : ''}" onclick="app.selectGradeSubject(${jsArg(x.s)})">
                                    <span>${escapeHtml(x.s)}</span>
                                    <span class="gr-bar-track"><i style="--w:${Math.max(2, x.last.v)}%;animation-delay:${i * 0.05}s"></i></span>
                                    <b>${x.last.v}</b>
                                </button>`).join('')}
                            ${low.length ? `<div class="gr-flag"><i data-lucide="triangle-alert"></i>${low.map((x) => escapeHtml(x.s)).join('، ')} تحت درجة النجاح (50)، تحتاج اهتمام أكثر</div>` : ''}
                        </div>` : '<div class="gr-empty">لحد هسه ما مسجّل ولا درجة</div>';
                }
                lucide.createIcons();
            },

            // Single-series line chart, time flowing right-to-left (RTL), 0-100 scale with a
            // dashed pass line at 50. Only the latest value is labelled; tapping a point
            // shows its period and mark.
            _gradeChartSvg(series) {
                const W = 340, top = 18, bot = 160, xR = 300, xL = 22;
                const X = (i) => xR - (i * (xR - xL)) / (this.GRADE_PERIODS.length - 1);
                const Y = (v) => bot - (v / 100) * (bot - top);
                const pts = series.map((v, i) => (v === null ? null : { v, i, x: X(i), y: Y(v) })).filter(Boolean);
                const grid = [0, 50, 100].map((v) => `<line class="${v === 50 ? 'pass' : 'grid'}" x1="${xL - 8}" x2="${xR + 8}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${W - 2}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`).join('');
                const xl = this.GRADE_PERIODS.map(([short], i) => `<text class="ax" x="${X(i)}" y="182" text-anchor="middle">${escapeHtml(short)}</text>`).join('');
                let body = '';
                if (pts.length) {
                    const d = pts.map((p, k) => (k ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
                    const area = pts.length > 1 ? `<path class="area" d="${d} L${pts[pts.length - 1].x.toFixed(1)} ${bot} L${pts[0].x.toFixed(1)} ${bot} Z"/>` : '';
                    const last = pts[pts.length - 1];
                    body = `${area}${pts.length > 1 ? `<path class="ln" d="${d}"/>` : ''}
                        ${pts.map((p) => `<circle class="pt${p.v < 50 ? ' low' : ''}" cx="${p.x}" cy="${p.y}" r="5"/>`).join('')}
                        <text class="lbl" x="${last.x}" y="${last.y - 11}" text-anchor="middle">${last.v}</text>
                        ${pts.map((p) => `<circle class="hit" cx="${p.x}" cy="${p.y}" r="16" onclick="app.gradeTip(${p.i})"/>`).join('')}`;
                }
                return `<svg viewBox="0 0 ${W} 192" role="img" aria-label="رسم تطور الدرجات">
                    <defs><linearGradient id="grArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(var(--p))" stop-opacity=".22"/><stop offset="1" stop-color="rgb(var(--p))" stop-opacity="0"/></linearGradient></defs>
                    ${grid}<text class="ax" x="${xL - 8}" y="${Y(50) - 4}" style="fill:#DC2626">نجاح</text>${xl}${body}
                </svg><div class="gr-tip hidden" id="grTip"></div>`;
            },

            gradeTip(i) {
                const tip = document.getElementById('grTip');
                const g = this._gradesLoad();
                const v = this._gradeSeries(g, this.gradesSubject)[i];
                if (!tip || v === null || v === undefined) return;
                const xR = 300, xL = 22, top = 18, bot = 160;
                const x = xR - (i * (xR - xL)) / (this.GRADE_PERIODS.length - 1);
                const y = bot - (v / 100) * (bot - top);
                tip.innerHTML = `${escapeHtml(this.GRADE_PERIODS[i][1])}: <b>${v}</b>`;
                tip.style.left = (x / 340 * 100) + '%';
                tip.style.top = (y / 192 * 100) + '%';
                tip.style.transform = 'translate(' + (x < 60 ? '-10%' : x > 280 ? '-90%' : '-50%') + ', calc(-100% - 12px))';
                tip.classList.remove('hidden');
                clearTimeout(this._grTipT);
                this._grTipT = setTimeout(() => tip.classList.add('hidden'), 2600);
            },

            selectGradeSubject(s) { this.gradesSubject = s; this.renderGrades(); },

            toggleGradeAdd() { this._grAdding = !this._grAdding; this.renderGrades(); },

            addGradeSubject() {
                const inp = document.getElementById('grAddInput');
                const name = String(inp ? inp.value : '').replace(/[.#$\[\]\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
                if (!name) { this.showToast('اكتب اسم المادة'); return; }
                const g = this._gradesLoad();
                if (g.subjects.indexOf(name) !== -1) { this.showToast('المادة موجودة'); return; }
                if (g.subjects.length >= 15) { this.showToast('الحد الأعلى 15 مادة'); return; }
                g.subjects.push(name);
                this._gradesSave(g);
                this.gradesSubject = name;
                this._grAdding = false;
                this.renderGrades();
            },

            async removeGradeSubject() {
                const s = this.gradesSubject;
                if (!s) return;
                if (!(await this.ask({ icon: 'trash-2', title: 'تحذف المادة؟', text: 'تنحذف مادة ' + s + ' وكل درجاتها.', ok: 'احذف' }))) return;
                const g = this._gradesLoad();
                g.subjects = g.subjects.filter((x) => x !== s);
                delete g.marks[s];
                this._gradesSave(g);
                this.gradesSubject = g.subjects[0] || null;
                this.renderGrades();
            },

            setGrade(i, raw) {
                const s = this.gradesSubject;
                if (!s) return;
                const g = this._gradesLoad();
                g.marks[s] = g.marks[s] || {};
                const txt = String(raw).trim();
                const v = Number(txt);
                if (txt === '' || isNaN(v)) delete g.marks[s]['p' + i];
                else g.marks[s]['p' + i] = Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
                const inp = document.getElementById('grInput' + i);
                if (inp && txt !== '' && !isNaN(v)) inp.value = g.marks[s]['p' + i];
                document.getElementById('grIn' + i)?.classList.toggle('low', g.marks[s]['p' + i] !== undefined && g.marks[s]['p' + i] < 50);
                this._gradesSave(g);
                this._renderGradesDynamic();
            },

            // A fresh device adopts the grades / moods already stored in the account.
            _adoptServerGradesMoods(v) {
                try {
                    if (v.grades && Array.isArray(v.grades.subjects) && !localStorage.getItem('isp_grades')) {
                        localStorage.setItem('isp_grades', JSON.stringify({ subjects: v.grades.subjects, marks: v.grades.marks || {} }));
                        if (this.currentView === 'gradesView') this.renderGrades();
                    }
                    if (v.moods && typeof v.moods === 'object') {
                        const local = this._moodsLoad();
                        let changed = false;
                        Object.keys(v.moods).forEach((d) => { if (!local[d] && this.MOODS.some((m) => m.k === v.moods[d])) { local[d] = v.moods[d]; changed = true; } });
                        if (changed) { localStorage.setItem('isp_moods', JSON.stringify(local)); this.renderMood(); }
                    }
                } catch (e) {}
            },

            // ===== Mood of the day (مزاجي اليوم) =====
            MOODS: [
                { k: 'happy', l: 'متحمس', ic: 'zap', c: '#F59E0B' },
                { k: 'ok', l: 'عادي', ic: 'smile', c: '#0EA5E9' },
                { k: 'tired', l: 'تعبان', ic: 'battery-low', c: '#64748B' },
                { k: 'stress', l: 'متوتر', ic: 'cloud-lightning', c: '#E5484D' }
            ],
            MOOD_TIPS: {
                happy: ['طاقتك عالية اليوم، استغلها بأصعب مادة عندك', 'وكت ممتاز تحل أسئلة وزارية، الحماس يخلي الحفظ أسرع', 'خلي هالحماس بجلسة تركيز طويلة وشوف شكد تنجز'],
                ok: ['يوم عادي يعني يوم مناسب للمراجعة الهادئة', 'قسّم مذاكرتك لجلسات قصيرة وراح تمشي بسهولة', 'ابدأ بمادة تحبها حتى تسخن وبعدين انتقل للأصعب'],
                tired: ['جسمك يحتاج راحة، نام شوية أو اشرب ماي وتمشى', 'لا تضغط على نفسك، جلسة قصيرة 15 دقيقة تكفي اليوم', 'راجع شي خفيف مثل ملخص أو قوانين بدل مادة ثقيلة'],
                stress: ['التوتر طبيعي، نفس عميق ودقيقة تمرين تفرق وياك', 'اكتب الشي اللي مضايقك بورقة، يخف ثقله', 'جزّء الشغل لخطوات صغيرة، خطوة وحدة هسه تكفي']
            },
            MOOD_ACTIONS: { happy: ['ابدأ 45 دقيقة تركيز', 'timer', 45], ok: ['ابدأ 25 دقيقة تركيز', 'timer', 25], tired: ['جلسة خفيفة 15 دقيقة', 'timer', 15], stress: ['تمرين تنفّس دقيقة وحدة', 'wind', 0] },

            _moodsLoad() {
                try { const v = JSON.parse(localStorage.getItem('isp_moods') || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; }
            },

            setMood(k) {
                if (!this.MOODS.some((m) => m.k === k)) return;
                const moods = this._moodsLoad();
                const today = this.localDateStr();
                moods[today] = k;
                const cutoff = this.localDateStr(new Date(Date.now() - 60 * 86400000));
                Object.keys(moods).forEach((d) => { if (d < cutoff) delete moods[d]; });
                try { localStorage.setItem('isp_moods', JSON.stringify(moods)); } catch (e) {}
                if (window.firebaseDb && this.authUid) {
                    const { ref, update } = window.firebaseDbHelpers;
                    update(ref(window.firebaseDb, 'users/' + this.authUid + '/moods'), { [today]: k }).catch((e) => console.warn('Mood save failed:', e));
                }
                this._moodEditing = false;
                this._smPing(true);
                this.renderMood();
            },

            editMood() { this._moodEditing = true; this.renderMood(); },

            moodAction(k) {
                const a = this.MOOD_ACTIONS[k];
                if (!a) return;
                if (!a[2]) {
                    if (this.currentView !== 'calmView') this.goToCalm();
                    document.getElementById('calmBreath')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    if (!this._breath) setTimeout(() => this.toggleBreath(), 400);
                    return;
                }
                if (!this._focus) this.focusMinutes = a[2];
                this.goToFocus();
            },

            _moodStudied(dateStr) {
                const a = monthlyActivity[dateStr];
                return !!(a && ((a.studySessions || 0) > 0 || (a.points || 0) > 0 || (a.tasksDone || 0) > 0));
            },

            async _moodLoadActivity() {
                if (this._moodActLoaded || !window.firebaseDb || !this.authUid) return;
                this._moodActLoaded = true;
                try {
                    const { ref, get } = window.firebaseDbHelpers;
                    const snap = await get(ref(window.firebaseDb, 'userActivity/' + this.authUid));
                    if (snap.exists()) { const vals = snap.val(); Object.keys(vals).forEach((d) => { monthlyActivity[d] = vals[d]; }); }
                    this.renderMood();
                } catch (e) { console.warn('Mood activity load failed:', e); }
            },

            renderMood() {
                const card = document.getElementById('moodCard');
                if (!card) return;
                const moods = this._moodsLoad();
                const today = this.localDateStr();
                const cur = this.MOODS.find((m) => m.k === moods[today]);
                this._moodLoadActivity();
                card.style.setProperty('--mc', cur ? cur.c : 'rgb(var(--p))');

                if (!cur || this._moodEditing) {
                    card.innerHTML = `
                        <div class="mo-q">شلونك اليوم؟<small>اختار مزاجك</small></div>
                        <div class="mo-opts">
                            ${this.MOODS.map((m, i) => `<button class="mo-opt" style="animation-delay:${i * 0.05}s" onclick="app.setMood('${m.k}')"><span class="mo-ic" style="--c:${m.c}"><i data-lucide="${m.ic}"></i></span>${m.l}</button>`).join('')}
                        </div>`;
                    lucide.createIcons();
                    return;
                }

                const tips = this.MOOD_TIPS[cur.k];
                const tip = tips[new Date().getDate() % tips.length];
                const act = this.MOOD_ACTIONS[cur.k];
                const names = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
                const days = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(Date.now() - i * 86400000);
                    const key = this.localDateStr(d);
                    days.push({ key, name: i === 0 ? 'اليوم' : names[d.getDay()], mood: this.MOODS.find((m) => m.k === moods[key]), studied: this._moodStudied(key) });
                }
                // Insight over the last 30 days: the most common mood on study days.
                const counts = {};
                let n = 0;
                for (let i = 0; i < 30; i++) {
                    const key = this.localDateStr(new Date(Date.now() - i * 86400000));
                    if (moods[key] && this._moodStudied(key)) { counts[moods[key]] = (counts[moods[key]] || 0) + 1; n++; }
                }
                const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
                const topMood = this.MOODS.find((m) => m.k === top);
                card.innerHTML = `
                    <div class="mo-now">
                        <span class="mo-ic" style="--c:${cur.c}"><i data-lucide="${cur.ic}"></i></span>
                        <div><b>مزاجك اليوم: ${cur.l}</b><span>${escapeHtml(tip)}</span></div>
                        <button class="mo-chg" onclick="app.editMood()">غيّر</button>
                    </div>
                    <button class="mo-act btn-press" onclick="app.moodAction('${cur.k}')"><i data-lucide="${act[1]}"></i>${act[0]}</button>
                    <div class="mo-week">
                        ${days.map((d, i) => `
                            <div class="mo-day${i === 6 ? ' today' : ''}">
                                <span>${d.name}</span>
                                ${d.mood ? `<span class="mo-dot" style="--c:${d.mood.c};animation-delay:${i * 0.04}s" title="${d.mood.l}"><i data-lucide="${d.mood.ic}"></i></span>` : '<span class="mo-dot none"></span>'}
                                <span class="mo-st${d.studied ? ' on' : ''}"></span>
                            </div>`).join('')}
                    </div>
                    <div class="mo-legend">${this.MOODS.map((m) => `<span><span class="mo-dot" style="--c:${m.c};width:16px;height:16px;animation:none"><i data-lucide="${m.ic}" style="width:9px;height:9px"></i></span>${m.l}</span>`).join('')}<span><span class="mo-lg-st"></span>ذاكرت</span></div>
                    ${n >= 3 && topMood ? `<div class="mo-ins">بالأيام اللي ذاكرت بيها كنت غالباً <b style="color:${topMood.c}">${topMood.l}</b></div>` : ''}
                `;
                lucide.createIcons();
            },

            // ===== Story share card (بطاقة ستوري) =====
            // Draws a 1080x1920 image on a canvas (news, focus result, profile, grades) and
            // offers it to the system share sheet, or saves it when sharing files isn't supported.
            async openStory(opts) {
                let modal = document.getElementById('storyModal');
                if (!modal) {
                    modal = document.createElement('div');
                    modal.id = 'storyModal';
                    modal.className = 'sc-modal hidden';
                    modal.innerHTML = `
                        <div class="sc-sheet" onclick="event.stopPropagation()">
                            <div class="sc-head">بطاقة ستوري<button onclick="app.closeStory()" aria-label="إغلاق"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
                            <div class="sc-prev" id="storyPrev"></div>
                            <div class="sc-btns">
                                <button class="pri" onclick="app.shareStoryImage()"><i data-lucide="share-2"></i>مشاركة</button>
                                <button onclick="app.saveStoryImage()"><i data-lucide="download"></i>حفظ الصورة</button>
                            </div>
                            <div class="sc-note">بقياس الستوري، جاهزة للإنستغرام والواتساب</div>
                        </div>`;
                    modal.addEventListener('click', () => this.closeStory());
                    document.body.appendChild(modal);
                }
                const prev = document.getElementById('storyPrev');
                prev.innerHTML = '<span class="sc-wait">جاري تجهيز الصورة...</span>';
                modal.classList.remove('hidden');
                lucide.createIcons();
                this._storyBlob = null;
                this._storyTitle = opts.title || '';
                try {
                    const blob = await this._drawStory(opts, true);
                    this._storyBlob = blob;
                    if (this._storyUrl) URL.revokeObjectURL(this._storyUrl);
                    this._storyUrl = URL.createObjectURL(blob);
                    prev.innerHTML = `<img src="${this._storyUrl}" alt="بطاقة ستوري">`;
                } catch (e) {
                    console.warn('Story render failed:', e);
                    prev.innerHTML = '<span class="sc-wait">تعذر تجهيز الصورة</span>';
                }
            },

            closeStory() { document.getElementById('storyModal')?.classList.add('hidden'); },

            async shareStoryImage() {
                const blob = this._storyBlob;
                if (!blob) return;
                const file = new File([blob], 'iraqi-student-story.png', { type: 'image/png' });
                try {
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: this._storyTitle });
                        return;
                    }
                } catch (e) {
                    if (e.name === 'AbortError') return;
                }
                this.saveStoryImage();
                this.showToast('انحفظت الصورة، شاركها من المعرض');
            },

            saveStoryImage() {
                if (!this._storyUrl) return;
                const a = document.createElement('a');
                a.href = this._storyUrl;
                a.download = 'iraqi-student-story.png';
                document.body.appendChild(a);
                a.click();
                a.remove();
            },

            _loadStoryImg(src) {
                return new Promise((res) => {
                    const im = new Image();
                    im.crossOrigin = 'anonymous';
                    const t = setTimeout(() => res(null), 4000);
                    im.onload = () => { clearTimeout(t); res(im); };
                    im.onerror = () => { clearTimeout(t); res(null); };
                    im.src = src;
                });
            },

            async _drawStory(o, allowImg) {
                const W = 1080, H = 1920;
                const cv = document.createElement('canvas');
                cv.width = W; cv.height = H;
                let ctx = cv.getContext('2d');
                try { if (document.fonts) await Promise.race([document.fonts.load('800 60px "Readex Pro"'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) {}
                const F = (w, sz) => `${w} ${sz}px "Readex Pro", Tahoma, "Segoe UI", sans-serif`;
                const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
                const wrap = (text, maxW, maxLines) => {
                    const words = String(text || '').split(/\s+/).filter(Boolean);
                    const lines = []; let cur = '', k = 0;
                    for (; k < words.length; k++) {
                        const t = cur ? cur + ' ' + words[k] : words[k];
                        if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = words[k]; if (lines.length === maxLines) break; } else cur = t;
                    }
                    if (lines.length < maxLines && cur) { lines.push(cur); k = words.length; }
                    if (k < words.length && lines.length) {
                        let l = lines[lines.length - 1];
                        while (l.length > 1 && ctx.measureText(l + '...').width > maxW) l = l.slice(0, -1);
                        lines[lines.length - 1] = l + '...';
                    }
                    return lines;
                };
                const glow = (x, y, r, c) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };

                // Background
                const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
                bg.addColorStop(0, '#0F766E'); bg.addColorStop(0.55, '#0B3B3A'); bg.addColorStop(1, '#0F172A');
                ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
                glow(930, 180, 460, 'rgba(94,234,212,0.32)');
                glow(120, 1760, 520, 'rgba(245,158,11,0.20)');

                // Brand
                ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
                const brand = (document.getElementById('appTitle')?.textContent || '').trim() || 'أكـادمي السادس';
                ctx.fillStyle = 'rgba(255,255,255,0.14)'; rr(W - 90 - 110, 105, 110, 110, 32); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = F(800, 58); ctx.fillText('ط', W - 145, 180);
                ctx.textAlign = 'right'; ctx.font = F(800, 50); ctx.fillText(brand, W - 230, 158);
                ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = F(500, 32); ctx.fillText(o.tagline || (document.getElementById('appTagline')?.textContent || '').trim() || 'أخبار وزارة التربية أولاً بأول', W - 230, 206);

                // Card content is drawn on its own canvas first, so the white card can be sized
                // to fit it and centred between the brand row and the footer.
                const cw = W - 140, pad = 60, inner = cw - pad * 2, R = cw - pad;
                const cc = document.createElement('canvas');
                cc.width = cw; cc.height = 1400;
                const main = ctx;
                ctx = cc.getContext('2d');
                ctx.direction = 'rtl'; ctx.textAlign = 'right';
                let y = pad;

                if (o.image && allowImg) {
                    const im = await this._loadStoryImg(o.image);
                    if (im && im.naturalWidth) {
                        const ih = 520, s = Math.max(cw / im.naturalWidth, ih / im.naturalHeight);
                        const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
                        ctx.save(); rr(0, 0, cw, ih + 56, 56); ctx.clip();
                        ctx.beginPath(); ctx.rect(0, 0, cw, ih); ctx.clip();
                        ctx.drawImage(im, (cw - dw) / 2, (ih - dh) / 2, dw, dh); ctx.restore();
                        y = ih + 50;
                    }
                }

                // Badge
                ctx.font = F(800, 32);
                const bw = ctx.measureText(o.badge || '').width + 56;
                ctx.fillStyle = o.badgeColor || '#0F766E'; rr(R - bw, y, bw, 64, 32); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(o.badge || '', R - bw / 2, y + 44);
                ctx.textAlign = 'right'; y += 64 + 44;

                // Title
                ctx.fillStyle = '#0F172A'; ctx.font = F(800, 66);
                wrap(o.title, inner, o.image ? 3 : 4).forEach((l) => { y += 66; ctx.fillText(l, R, y); y += 24; });
                y += 10;

                // Subtitle
                if (o.sub) {
                    ctx.fillStyle = '#475569'; ctx.font = F(500, 38);
                    wrap(o.sub, inner, o.image ? 4 : 5).forEach((l) => { y += 40; ctx.fillText(l, R, y); y += 22; });
                    y += 20;
                }

                // Line chart (grades), same RTL layout as the in-app chart
                if (o.series) {
                    const top = y + 60, bot = y + 480, xR = R - 60, xL = pad + 20, n = o.series.length;
                    const X = (i) => xR - (i * (xR - xL)) / (n - 1), Y = (v) => bot - (v / 100) * (bot - top);
                    ctx.lineWidth = 2;
                    [0, 50, 100].forEach((v) => {
                        ctx.strokeStyle = v === 50 ? 'rgba(220,38,38,0.6)' : '#E2E8F0';
                        ctx.setLineDash(v === 50 ? [12, 12] : []);
                        ctx.beginPath(); ctx.moveTo(xL - 10, Y(v)); ctx.lineTo(xR + 10, Y(v)); ctx.stroke();
                        ctx.fillStyle = '#94A3B8'; ctx.font = F(600, 26); ctx.textAlign = 'right'; ctx.fillText(String(v), R, Y(v) + 9);
                    });
                    ctx.setLineDash([]);
                    const pts = o.series.map((v, i) => (v === null ? null : { v, x: X(i), y: Y(v) })).filter(Boolean);
                    if (pts.length > 1) {
                        const ag = ctx.createLinearGradient(0, top, 0, bot);
                        ag.addColorStop(0, 'rgba(15,118,110,0.22)'); ag.addColorStop(1, 'rgba(15,118,110,0)');
                        ctx.fillStyle = ag; ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
                        ctx.lineTo(pts[pts.length - 1].x, bot); ctx.lineTo(pts[0].x, bot); ctx.closePath(); ctx.fill();
                        ctx.strokeStyle = '#0F766E'; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
                        ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
                    }
                    pts.forEach((p) => {
                        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = p.v < 50 ? '#DC2626' : '#0F766E'; ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#0F172A'; ctx.font = F(800, 30); ctx.textAlign = 'center'; ctx.fillText(String(p.v), p.x, p.y - 30);
                    });
                    ctx.fillStyle = '#64748B'; ctx.font = F(600, 26); ctx.textAlign = 'center';
                    (o.labels || []).forEach((l, i) => ctx.fillText(l, X(i), bot + 50));
                    ctx.textAlign = 'right';
                    y = bot + 90;
                }

                // Stats
                if (o.stats && o.stats.length) {
                    const n = o.stats.length, gap = 20, sw = (inner - gap * (n - 1)) / n, sh = 200;
                    const sy = y + 20;
                    o.stats.forEach(([val, lbl], i) => {
                        const sx = R - sw - i * (sw + gap);
                        ctx.fillStyle = '#F1F5F9'; rr(sx, sy, sw, sh, 36); ctx.fill();
                        ctx.fillStyle = i === 0 ? '#0F766E' : i === 1 ? '#D97706' : '#7C3AED';
                        ctx.textAlign = 'center'; ctx.direction = 'ltr'; ctx.font = F(900, 76); ctx.fillText(String(val), sx + sw / 2, sy + 108);
                        ctx.direction = 'rtl'; ctx.fillStyle = '#64748B'; ctx.font = F(600, 30); ctx.fillText(lbl, sx + sw / 2, sy + 160);
                    });
                    y = sy + sh;
                }

                // Place the fitted card
                ctx = main;
                const ch = Math.min(cc.height, Math.ceil(y + pad));
                const areaTop = 290, areaBot = 1680;
                const cy = Math.max(areaTop, Math.round(areaTop + (areaBot - areaTop - ch) / 2));
                ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
                ctx.fillStyle = '#FFFFFF'; rr(70, cy, cw, ch, 56); ctx.fill(); ctx.restore();
                ctx.save(); rr(70, cy, cw, ch, 56); ctx.clip();
                ctx.drawImage(cc, 0, 0, cw, ch, 70, cy, cw, ch); ctx.restore();

                // Footer
                ctx.textAlign = 'center';
                ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = F(700, 36);
                ctx.fillText(o.foot || 'تابع دراستك وأخبارك أولاً بأول', W / 2, 1768);
                const d = new Date();
                ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = F(500, 28);
                ctx.fillText(d.getDate() + ' ' + IRAQI_MONTHS[d.getMonth()] + ' ' + d.getFullYear(), W / 2, 1822);

                try {
                    return await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('empty'))), 'image/png'));
                } catch (e) {
                    if (allowImg && o.image) return this._drawStory(o, false); // tainted by the photo: redraw without it
                    throw e;
                }
            },

            shareNewsStory() {
                const news = newsData.find((n) => n.id === this.currentNewsId);
                if (!news) return;
                const cat = (categories.find((c) => c.id === news.category) || {}).label || '';
                const img = /^https?:\/\//i.test(String(news.image || '')) ? news.image : null;
                this.openStory({
                    badge: news.isUrgent ? 'عاجل' : (cat || 'خبر'),
                    badgeColor: news.isUrgent ? '#DC2626' : '#0F766E',
                    title: news.title,
                    sub: news.excerpt,
                    image: img,
                    foot: 'المصدر: ' + (news.source || 'وزارة التربية العراقية')
                });
            },

            shareFocusStory(minutes) {
                const st = this.focusStats();
                this.openStory({
                    badge: 'وضع التركيز', badgeColor: '#0F766E',
                    title: 'ركّزت ' + minutes + ' دقيقة بدون ما ألمس هاتفي',
                    sub: 'كملت جلسة تركيز كاملة، وهاي إنجازاتي لحد هسه',
                    stats: [[st.done, 'جلسة مكتملة'], [st.minutes, 'دقيقة تركيز'], ['+' + minutes, 'نقطة']]
                });
            },

            shareProfileStory() {
                if (!this.isLoggedIn || !this.currentUser) { this.showToast('سجّل دخولك أول'); return; }
                const u = this.currentUser;
                const txt = (id) => (document.getElementById(id)?.textContent || '0').trim();
                this.openStory({
                    badge: 'إنجازاتي', badgeColor: '#7C3AED',
                    title: u.fullName || 'طالب',
                    sub: 'هاي إنجازاتي على المنصة' + (u.governorate ? ' — ' + u.governorate : ''),
                    stats: [[numOr0(u.points), 'نقطة'], [txt('profileStreakValue'), 'يوم متتالي'], [txt('profileSessionsValue'), 'جلسة مذاكرة']]
                });
            },

            shareGradesStory() {
                const s = this.gradesSubject;
                if (!s) return;
                const series = this._gradeSeries(this._gradesLoad(), s);
                const pts = series.filter((v) => v !== null);
                if (!pts.length) { this.showToast('سجّل درجاتك أول'); return; }
                const last = pts[pts.length - 1];
                const avg = Math.round(pts.reduce((a, v) => a + v, 0) / pts.length * 10) / 10;
                const d = pts.length > 1 ? Math.round((last - pts[pts.length - 2]) * 10) / 10 : 0;
                this.openStory({
                    badge: 'تطور درجاتي', badgeColor: '#16A34A',
                    title: 'درجاتي في ' + s,
                    series, labels: this.GRADE_PERIODS.map((p) => p[0]),
                    stats: [[last, 'آخر درجة'], [avg, 'المعدل'], [(d > 0 ? '+' : '') + d, 'التغيير']]
                });
            },

            // ===== Before the exam (قبل الامتحان) =====
            // A quiet page: a dua carousel, a guided one-minute breathing exercise
            // (inhale 4s, hold 2s, exhale 6s, 5 rounds), a same-day readiness checklist
            // saved on the device, and short in-hall tips.
            CALM_DUAS: [
                { t: 'رَبِّ اشْرَحْ لِي صَدْرِي، وَيَسِّرْ لِي أَمْرِي، وَاحْلُلْ عُقْدَةً مِنْ لِسَانِي، يَفْقَهُوا قَوْلِي', s: 'سورة طه' },
                { t: 'اللَّهُمَّ لا سَهْلَ إِلَّا مَا جَعَلْتَهُ سَهْلًا، وَأَنْتَ تَجْعَلُ الْحَزْنَ إِذَا شِئْتَ سَهْلًا', s: 'دعاء' },
                { t: 'رَبِّ زِدْنِي عِلْمًا', s: 'سورة طه' },
                { t: 'حَسْبِيَ اللَّهُ لا إِلَهَ إِلَّا هُوَ، عَلَيْهِ تَوَكَّلْتُ', s: 'سورة التوبة' },
                { t: 'اللَّهُمَّ إِنِّي أَسْتَوْدِعُكَ مَا قَرَأْتُ وَمَا حَفِظْتُ، فَرُدَّهُ عَلَيَّ عِنْدَ حَاجَتِي إِلَيْهِ', s: 'دعاء' }
            ],
            CALM_CHECKS: ['نمت زين البارحة', 'فطرت وشربت ماي', 'القلم والهوية والآلة الحاسبة وياي', 'راجعت الملخص مرة أخيرة بس', 'أطلع من البيت بدري'],
            CALM_TIPS: [
                ['اقرأ الأسئلة كلها أول', '#0EA5E9'],
                ['ابدأ بالسؤال الأسهل', '#16A34A'],
                ['راقب الوقت كل ربع ساعة', '#F59E0B'],
                ['لا توكف على سؤال واحد', '#E5484D'],
                ['اكتب بخط واضح ومرتب', '#7C3AED'],
                ['راجع ورقتك قبل التسليم', 'rgb(var(--p))']
            ],
            CALM_QUOTES: ['تعبك طول السنة ما يروح، إنت أجهز مما تتصور', 'التوتر طبيعي، يعني إنت مهتم، وهذا شي زين', 'سؤال صعب ما يعني امتحان صعب، كمّل وارجعله', 'نفس عميق، وتوكل على الله، وابدأ'],
            CALM_PHASES: [{ k: 'in', l: 'شهيق', d: 4000 }, { k: 'hold', l: 'احبس', d: 2000 }, { k: 'out', l: 'زفير', d: 6000 }],
            CALM_ROUNDS: 5,
            calmDua: 0,

            goToCalm() {
                this.calmDua = Math.floor(Math.random() * this.CALM_DUAS.length);
                this._calmQuote = this.CALM_QUOTES[Math.floor(Math.random() * this.CALM_QUOTES.length)];
                this.renderCalm();
                this.switchView('calmView');
            },

            calmBack() {
                this._stopBreath();
                this.goBack();
            },

            _calmChecksKey() {
                const d = new Date();
                return 'isp_calm_checks_' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
            },

            _calmChecks() {
                try { const v = JSON.parse(localStorage.getItem(this._calmChecksKey()) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
            },

            toggleCalmCheck(i) {
                const on = this._calmChecks();
                const at = on.indexOf(i);
                if (at === -1) on.push(i); else on.splice(at, 1);
                try {
                    Object.keys(localStorage).forEach((k) => { if (k.indexOf('isp_calm_checks_') === 0 && k !== this._calmChecksKey()) localStorage.removeItem(k); });
                    localStorage.setItem(this._calmChecksKey(), JSON.stringify(on));
                } catch (e) {}
                const btn = document.querySelector('.cm-chk[data-i="' + i + '"]');
                if (btn) btn.classList.toggle('on', at === -1);
                const cnt = document.getElementById('calmChkCount');
                if (cnt) cnt.textContent = on.length + ' من ' + this.CALM_CHECKS.length;
            },

            calmNextDua(step) {
                const n = this.CALM_DUAS.length;
                this.calmDua = (this.calmDua + step + n) % n;
                const d = this.CALM_DUAS[this.calmDua];
                const p = document.getElementById('calmDuaText');
                const s = document.getElementById('calmDuaSrc');
                if (p) { p.textContent = d.t; p.style.animation = 'none'; void p.offsetWidth; p.style.animation = ''; }
                if (s) s.textContent = d.s;
                document.querySelectorAll('#calmDuaDots i').forEach((el, i) => el.classList.toggle('on', i === this.calmDua));
            },

            _calmNextExam() {
                const now = Date.now();
                const up = (typeof examSchedule !== 'undefined' ? examSchedule : [])
                    .map((ex) => ({ ex, t: new Date(ex.date).getTime() }))
                    .filter((x) => !isNaN(x.t) && x.t > now)
                    .sort((a, b) => a.t - b.t)[0];
                if (!up) return '';
                const diff = up.t - now;
                const days = Math.floor(diff / 86400000);
                const hrs = Math.floor(diff / 3600000);
                const when = days >= 1 ? (days === 1 ? 'باچر' : 'بعد ' + days + ' يوم') : (hrs >= 1 ? 'بعد ' + hrs + ' ساعة' : 'بعد شوية');
                const d = new Date(up.t);
                return `
                    <div class="cm-next">
                        <span class="cm-next-ic"><i data-lucide="notebook-pen"></i></span>
                        <div><b>${escapeHtml(up.ex.subject || 'امتحان')}</b><span>امتحانك الجاي — ${d.getDate()}/${d.getMonth() + 1}</span></div>
                        <em>${when}</em>
                    </div>`;
            },

            renderCalm() {
                const box = document.getElementById('calmContent');
                if (!box) return;
                this._stopBreath();
                const d = this.CALM_DUAS[this.calmDua] || this.CALM_DUAS[0];
                const on = this._calmChecks();
                box.innerHTML = `
                    ${this._calmNextExam()}

                    <div class="mo" id="moodCard" style="margin-top:12px"></div>

                    <section class="cm-dua">
                        <span class="cm-dua-lbl"><i data-lucide="moon-star"></i>دعاء قبل الامتحان</span>
                        <p id="calmDuaText">${escapeHtml(d.t)}</p>
                        <small id="calmDuaSrc">${escapeHtml(d.s)}</small>
                        <div class="cm-dua-nav">
                            <button class="btn-press" onclick="app.calmNextDua(-1)" aria-label="السابق"><i data-lucide="chevron-right"></i></button>
                            <span class="cm-dots" id="calmDuaDots">${this.CALM_DUAS.map((_, i) => `<i class="${i === this.calmDua ? 'on' : ''}"></i>`).join('')}</span>
                            <button class="btn-press" onclick="app.calmNextDua(1)" aria-label="التالي"><i data-lucide="chevron-left"></i></button>
                        </div>
                    </section>

                    <div class="cm-sec">تمرين تنفّس<small>دقيقة وحدة</small></div>
                    <section class="cm-br" id="calmBreath">
                        <div class="cm-orb-wrap"><div class="cm-orb idle" id="calmOrb"></div><span class="cm-orb-txt"><b id="calmPhase">جاهز؟</b><small id="calmSec"></small></span></div>
                        <h4 id="calmBrTitle">هدّي أعصابك بدقيقة</h4>
                        <p id="calmBrText">اتبع الدائرة: شهيق لما تكبر، احبس لما توكف، وزفير لما تصغر.</p>
                        <div class="cm-bar"><i id="calmBar"></i></div>
                        <button class="cm-btn btn-press" id="calmBrBtn" onclick="app.toggleBreath()"><i data-lucide="wind"></i>ابدأ التمرين</button>
                    </section>

                    <div class="cm-sec">جهّز نفسك<small id="calmChkCount">${on.length} من ${this.CALM_CHECKS.length}</small></div>
                    <div class="cm-list">
                        ${this.CALM_CHECKS.map((c, i) => `
                            <button class="cm-chk${on.indexOf(i) !== -1 ? ' on' : ''}" data-i="${i}" style="animation-delay:${i * 0.04}s" onclick="app.toggleCalmCheck(${jsNum(i)})">
                                <span class="cm-chk-box"><i data-lucide="check"></i></span><span>${escapeHtml(c)}</span>
                            </button>`).join('')}
                    </div>

                    <div class="cm-sec">داخل القاعة</div>
                    <div class="cm-tips">
                        ${this.CALM_TIPS.map(([t, c], i) => `<div class="cm-tip" style="--c:${c};animation-delay:${i * 0.05}s"><b><i>${i + 1}</i></b>${escapeHtml(t)}</div>`).join('')}
                    </div>

                    <div class="cm-quote">${escapeHtml(this._calmQuote || this.CALM_QUOTES[0])}</div>
                `;
                this.renderMood();
                lucide.createIcons();
            },

            toggleBreath() {
                if (this._breath) { this._stopBreath(); this._breathIdle('وكفت التمرين', 'تكدر تبدي من جديد بأي وقت.'); return; }
                const cycle = this.CALM_PHASES.reduce((a, p) => a + p.d, 0);
                this._breath = { start: Date.now(), total: cycle * this.CALM_ROUNDS, cycle, phase: -1 };
                const btn = document.getElementById('calmBrBtn');
                if (btn) { btn.classList.add('ghost'); btn.innerHTML = '<i data-lucide="square"></i>إيقاف'; lucide.createIcons(); }
                const t = document.getElementById('calmBrTitle');
                if (t) t.textContent = 'تنفّس ويا الدائرة';
                this._breathTick();
                this._breath.timer = setInterval(() => this._breathTick(), 100);
            },

            _breathTick() {
                const b = this._breath;
                if (!b) return;
                if (this.currentView !== 'calmView') { this._stopBreath(); return; }
                const el = Date.now() - b.start;
                const bar = document.getElementById('calmBar');
                if (bar) bar.style.width = Math.min(100, (el / b.total) * 100) + '%';
                if (el >= b.total) {
                    this._stopBreath();
                    this._breathIdle('أحسنت، هسه إنت أهدأ', 'خذ هالهدوء وياك للقاعة. تكدر تعيده قبل ما تدخل.');
                    if (bar) bar.style.width = '100%';
                    return;
                }
                let inCycle = el % b.cycle, idx = 0;
                while (inCycle >= this.CALM_PHASES[idx].d) { inCycle -= this.CALM_PHASES[idx].d; idx++; }
                const ph = this.CALM_PHASES[idx];
                const orb = document.getElementById('calmOrb');
                if (idx !== b.phase) {
                    b.phase = idx;
                    if (orb) {
                        orb.classList.remove('idle', 'in', 'hold');
                        orb.style.transitionDuration = ph.d + 'ms';
                        if (ph.k === 'in') orb.classList.add('in');
                        else if (ph.k === 'hold') orb.classList.add('hold');
                    }
                    const lbl = document.getElementById('calmPhase');
                    if (lbl) lbl.textContent = ph.l;
                    try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) {}
                    const txt = document.getElementById('calmBrText');
                    if (txt) txt.textContent = 'الجولة ' + (Math.floor(el / b.cycle) + 1) + ' من ' + this.CALM_ROUNDS;
                }
                const sec = document.getElementById('calmSec');
                if (sec) sec.textContent = Math.ceil((ph.d - inCycle) / 1000);
            },

            _breathIdle(title, text) {
                const orb = document.getElementById('calmOrb');
                if (orb) { orb.classList.remove('in', 'hold'); orb.style.transitionDuration = '1200ms'; orb.classList.add('idle'); }
                const lbl = document.getElementById('calmPhase'); if (lbl) lbl.textContent = 'جاهز؟';
                const sec = document.getElementById('calmSec'); if (sec) sec.textContent = '';
                const t = document.getElementById('calmBrTitle'); if (t) t.textContent = title;
                const p = document.getElementById('calmBrText'); if (p) p.textContent = text;
                const btn = document.getElementById('calmBrBtn');
                if (btn) { btn.classList.remove('ghost'); btn.innerHTML = '<i data-lucide="wind"></i>ابدأ التمرين'; lucide.createIcons(); }
            },

            _stopBreath() {
                if (this._breath && this._breath.timer) clearInterval(this._breath.timer);
                this._breath = null;
            },

            checkInterruptedFocus() {
                let saved = null;
                try { saved = JSON.parse(localStorage.getItem(this.FOCUS_KEY) || 'null'); } catch (e) {}
                if (!saved) return;
                try { localStorage.removeItem(this.FOCUS_KEY); } catch (e) {}
                const finished = Date.now() >= saved.start + saved.dur;
                const st = this.focusStats();
                this.saveFocusStats({ focusBroken: st.broken + 1 });
                setTimeout(() => this.showToast(finished ? 'جلسة التركيز السابقة انكسرت لأن التطبيق انسد قبل ما تخلص' : 'انكسرت جلسة التركيز لأنك طلعت من التطبيق'), 1200);
            },

            // ==================== HOLIDAYS CALENDAR PAGE ====================
            holidayPageFilter: 'all',
            holidayPageGov: 'all',

            goToHolidays() {
                this.switchView('holidaysView');
                this._hpAnimateCounts = true;
                this.renderHolidaysPage();
                lucide.createIcons();
            },

            setHolidayPageFilter(f) { this.holidayPageFilter = f; this.renderHolidaysPage(); },
            setHolidayPageGov(g) {
                this.holidayPageGov = this.holidayPageGov === g ? 'all' : g;
                this.renderHolidaysPage();
                document.getElementById('hpListTitle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            },

            renderHolidaysPage() {
                const box = document.getElementById('holidaysPageContent');
                if (!box) return;
                const now = Date.now();
                const DAY = 86400000;
                const norm = (g) => { const v = String(g || '').trim(); return GOVERNORATE_ALIASES[v] || v; };
                const all = holidays
                    .map((h) => {
                        const r = this.holidayRange(h);
                        const ongoing = now >= r.start && now <= r.end;
                        const daysTo = Math.ceil((r.start - now) / DAY);
                        return { h, ...r, gov: norm(h.governorate), ongoing, state: ongoing ? 'is-now' : (daysTo <= 7 ? 'is-soon' : 'is-later'), daysTo };
                    })
                    .filter((x) => !isNaN(x.end) && x.end >= now)
                    .sort((a, b) => a.start - b.start);
                const applies = (x, g) => !x.gov || x.gov === g;
                const rank = { 'is-now': 3, 'is-soon': 2, 'is-later': 1, 'is-none': 0 };
                const govInfo = IRAQ_GOVERNORATES.map((g) => {
                    const mine = all.filter((x) => applies(x, g));
                    const best = mine.reduce((m, x) => (rank[x.state] > rank[m] ? x.state : m), 'is-none');
                    return { g, count: mine.length, state: mine.length ? best : 'is-none', ongoing: mine.some((x) => x.ongoing) };
                });
                const ongoingCount = all.filter((x) => x.ongoing).length;
                const upcomingCount = all.length - ongoingCount;
                const govsOff = govInfo.filter((x) => x.ongoing).length;

                const sel = this.holidayPageGov;
                let list = sel === 'all' ? all : all.filter((x) => applies(x, sel));
                const f = this.holidayPageFilter;
                if (f === 'now') list = list.filter((x) => x.ongoing);
                else if (f === 'soon') list = list.filter((x) => !x.ongoing);
                else if (f === 'gov') list = list.filter((x) => x.h.type === 'government');
                else if (f === 'school') list = list.filter((x) => x.h.type !== 'government');

                const fmt = (t) => { const d = new Date(t); return d.getDate() + ' ' + IRAQI_MONTHS[d.getMonth()]; };
                const plural = (n, one, two, many) => n === 1 ? one : (n === 2 ? two : n + ' ' + many);
                const filters = [['all', 'الكل'], ['now', 'جارية الآن'], ['soon', 'قادمة'], ['gov', 'رسمية'], ['school', 'مدرسية']];

                const cards = list.map((x, i) => {
                    const sd = new Date(x.start);
                    const isGov = x.h.type === 'government';
                    const totalDays = Math.max(1, Math.round((x.end - x.start) / DAY));
                    const sameDay = new Date(x.start).toDateString() === new Date(x.end).toDateString();
                    let status, bar = '';
                    if (x.ongoing) {
                        const left = Math.max(0, Math.ceil((x.end - now) / DAY));
                        const pct = Math.min(100, Math.max(4, ((now - x.start) / (x.end - x.start)) * 100));
                        status = '<span class="hl-dot" style="background:#16A34A"></span>' + (left <= 1 ? 'جارية الآن · آخر يوم' : 'جارية الآن · باقي ' + left + ' يوم');
                        bar = `<div class="hp-bar"><i style="--w:${pct.toFixed(1)}%"></i></div>`;
                    } else {
                        status = '<i data-lucide="hourglass"></i>' + (x.daysTo <= 1 ? 'تبدأ غداً' : 'تبدأ بعد ' + x.daysTo + ' يوم');
                    }
                    return `
                        <div class="hp-card ${x.state}" style="animation-delay:${Math.min(i, 10) * 0.06}s">
                            <div class="hp-date"><b>${sd.getDate()}</b><span>${IRAQI_MONTHS[sd.getMonth()]}</span></div>
                            <div class="hp-body">
                                <div class="hp-title">${escapeHtml(x.h.title)}<span class="hl-tag ${isGov ? 'gov' : 'school'}">${isGov ? 'رسمية' : 'مدرسية'}</span></div>
                                <div class="hp-where"><i data-lucide="map-pin"></i>${x.gov ? escapeHtml(x.gov) : 'كل المحافظات'}</div>
                                <div class="hp-range">${sameDay ? fmt(x.start) + ' · يوم واحد' : 'من ' + fmt(x.start) + ' إلى ' + fmt(x.end) + ' · ' + plural(totalDays, 'يوم واحد', 'يومان', 'أيام')}</div>
                                <div class="hp-status">${status}</div>
                                ${bar}
                            </div>
                        </div>`;
                }).join('');

                box.innerHTML = `
                    <div class="hp-hero">
                        <div class="hp-hero-top">
                            <div><div class="hp-hero-title">العطل في العراق</div><div class="hp-hero-sub">اختر محافظتك وشوف عطلها الجارية والقادمة</div></div>
                            <div class="hp-hero-ic" aria-hidden="true"><i data-lucide="calendar-days"></i></div>
                        </div>
                        <div class="hp-stats">
                            <div class="hp-stat"><b data-count="${ongoingCount}">${ongoingCount}</b><span>جارية الآن</span></div>
                            <div class="hp-stat"><b data-count="${upcomingCount}">${upcomingCount}</b><span>قادمة</span></div>
                            <div class="hp-stat"><b data-count="${govsOff}">${govsOff}</b><span>محافظة معطّلة</span></div>
                        </div>
                    </div>

                    <div class="hp-sec-title">المحافظات <small class="hp-legend"><i class="g"></i>عطلة الآن <i class="o"></i>قريبة <i class="r"></i>ماكو</small></div>
                    <div class="hp-govs">
                        <button class="hp-gov all ${sel === 'all' ? 'sel' : ''}" onclick="app.setHolidayPageGov('all')">
                            <span class="hp-gov-name"><i data-lucide="map"></i>كل المحافظات</span><span class="hp-gov-meta">${plural(all.length, 'عطلة واحدة', 'عطلتان', 'عطل')}</span>
                        </button>
                        ${govInfo.map((x, i) => `
                            <button class="hp-gov ${x.state} ${sel === x.g ? 'sel' : ''}" style="animation-delay:${(i * 0.025).toFixed(3)}s" onclick="app.setHolidayPageGov(${jsArg(x.g)})">
                                <span class="hp-gov-name"><span class="hl-dot" aria-hidden="true"></span>${escapeHtml(x.g)}</span>
                                <span class="hp-gov-meta">${x.count ? plural(x.count, 'عطلة واحدة', 'عطلتان', 'عطل') : 'لا عطل'}</span>
                            </button>`).join('')}
                    </div>

                    <div class="hp-sec-title" id="hpListTitle">${sel === 'all' ? 'كل العطل' : 'عطل ' + escapeHtml(sel)} <small>${plural(list.length, 'عطلة واحدة', 'عطلتان', 'عطل')}</small></div>
                    <div class="hp-filters no-scrollbar">
                        ${filters.map(([k, l]) => `<button class="hp-filter ${f === k ? 'on' : ''}" onclick="app.setHolidayPageFilter(${jsArg(k)})">${l}</button>`).join('')}
                    </div>
                    <div class="hp-list mt-3">
                        ${cards || `<div class="hp-empty"><div><i data-lucide="calendar-x"></i></div>ما كو عطل ${f === 'all' ? '' : 'بهذا التصنيف '}${sel === 'all' ? 'حالياً' : 'في ' + escapeHtml(sel) + ' حالياً'}</div>`}
                    </div>`;

                lucide.createIcons();
                // count-up on the hero numbers when the page is opened
                if (this._hpAnimateCounts) {
                    this._hpAnimateCounts = false;
                    box.querySelectorAll('[data-count]').forEach((el) => {
                        const target = Number(el.dataset.count) || 0;
                        if (!target) return;
                        const t0 = performance.now();
                        const step = (t) => {
                            const k = Math.min(1, (t - t0) / 900);
                            el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
                            if (k < 1) requestAnimationFrame(step);
                        };
                        el.textContent = '0';
                        requestAnimationFrame(step);
                    });
                }
            },

            // Stop-and-go strip (holidays, exam countdown): every few seconds slide the track by
            // the first chip's width, then move that chip to the end so the loop never runs
            // out. Only moves when the chips don't all fit; press/hover or leaving the home
            // screen pauses it.
            _stripStart(name, vpId, trackId, onStep) {
                this._stripStop(name, trackId);
                const vp = document.getElementById(vpId);
                const track = document.getElementById(trackId);
                if (!vp || !track) return;
                this._strips = this._strips || {};
                const st = this._strips[name] = this._strips[name] || { paused: false, busy: false, timer: null, bound: false };
                if (!st.bound) {
                    st.bound = true;
                    const hold = (v) => () => { st.paused = v; };
                    vp.addEventListener('pointerdown', hold(true));
                    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => vp.addEventListener(ev, hold(false)));
                    vp.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') st.paused = true; });
                }
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                st.timer = setInterval(() => {
                    if (st.paused || st.busy || document.hidden || this.currentView !== 'homeView') return;
                    if (track.scrollWidth <= vp.clientWidth + 4) return; // everything fits — stay still
                    const first = track.firstElementChild;
                    if (!first) return;
                    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
                    const shift = first.getBoundingClientRect().width + gap; // chip + gap
                    st.busy = true;
                    track.classList.add('hl-sliding');
                    track.style.transform = `translateX(${shift}px)`; // RTL: chips move to the right
                    setTimeout(() => {
                        track.classList.remove('hl-sliding');
                        first.style.animation = 'none';
                        track.appendChild(first);
                        track.style.transform = '';
                        void track.offsetWidth;
                        st.busy = false;
                        if (onStep) onStep(track.firstElementChild);
                    }, 720);
                }, ({ exams: 3100, tips: 7000 })[name] || 2600);
            },

            _stripStop(name, trackId) {
                const st = this._strips && this._strips[name];
                if (st) { if (st.timer) clearInterval(st.timer); st.timer = null; st.busy = false; }
                const track = document.getElementById(trackId);
                if (track) { track.classList.remove('hl-sliding'); track.style.transform = ''; }
            },

            // (kept for old callers) the resources list is one live listener now, started on the page
            loadResourcesFromDatabase() { this.listenForResources(); },

            publishNews(item) {
                if (!window.firebaseDb) {
                    this.showToast('لا يوجد اتصال بقاعدة البيانات');
                    return;
                }
                if (!item || !item.title) {
                    this.showToast('أدخل عنوان الخبر');
                    return;
                }
                const { ref, set, serverTimestamp } = window.firebaseDbHelpers;
                const id = Date.now();
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const payload = {
                    id: id,
                    title: item.title,
                    excerpt: item.excerpt || '',
                    image: item.image || "",
                    category: item.category || 'other',
                    date: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()),
                    time: 'الآن',
                    source: item.source || 'وزارة التربية العراقية',
                    isUrgent: !!item.isUrgent,
                    isRead: false,
                    isBookmarked: false,
                    isPinned: !!item.isPinned,
                    views: 0,
                    publishedAt: serverTimestamp()
                };
                set(ref(window.firebaseDb, 'news/' + id), payload).then(() => {
                    this.showToast('تم نشر الخبر');
                    this.sendPushToAll(payload.title);
                }).catch((err) => {
                    console.warn('Publish failed:', err);
                    this.showToast('فشل نشر الخبر');
                });
            },

            async sendPushToAll(title) {
                // أمان: إرسال الإشعارات الجماعية لا يتم من المتصفح نهائياً.
                // يجب تنفيذه في Cloud Functions أو Backend آمن باستخدام Firebase Admin SDK (FCM HTTP v1).
                console.warn('إرسال الإشعارات الجماعية يجب أن يتم من الخادم (Cloud Functions) وليس من الواجهة');
            },

            // ==================== PUSH TOKEN REGISTRATION ====================
            initPushNotifications() {
                if (this._webPushOk()) return; // OneSignal handles web push on the site
                if (!window.firebaseMessaging || !('Notification' in window) || !('serviceWorker' in navigator)) return;
                const vapidKey = window.FIREBASE_VAPID_KEY || '';
                if (!vapidKey || vapidKey.indexOf('ضع') === 0) return;
                if (Notification.permission === 'default') {
                    Notification.requestPermission().then((permission) => {
                        if (permission === 'granted') this.registerPushToken(vapidKey);
                    }).catch((err) => {
                        console.warn('Permission request failed:', err);
                    });
                } else if (Notification.permission === 'granted') {
                    this.registerPushToken(vapidKey);
                }
            },

            registerPushToken(vapidKey) {
                navigator.serviceWorker.register('firebase-messaging-sw.js').then((registration) => {
                    const { getToken } = window.firebaseMessagingHelpers;
                    return getToken(window.firebaseMessaging, { vapidKey: vapidKey, serviceWorkerRegistration: registration });
                }).then((token) => {
                    if (!token || !window.firebaseDb) return;
                    this._pushOn = true;
                    if (this.currentView === 'holidaysView') this.renderDayStatus();
                    const safeToken = token.replace(/[.#$\[\]]/g, '_');
                    const uid = (window.firebaseAuth && window.firebaseAuth.currentUser) ? window.firebaseAuth.currentUser.uid : 'anonymous';
                    const { ref, set, serverTimestamp } = window.firebaseDbHelpers;
                    this._fcmPath = 'tokens/' + uid + '/' + safeToken;
                    set(ref(window.firebaseDb, this._fcmPath), {
                        token: token,
                        off: this._pnOff(),
                        gov: this._dsGov() || '',
                        name: (this.currentUser && this.currentUser.fullName) || '',
                        studentNumber: (this.currentUser && this.currentUser.studentNumber) || '',
                        savedAt: serverTimestamp()
                    });
                }).catch((err) => {
                    console.warn('Push registration failed:', err);
                });
            },

            // ==================== PROFILE ====================
            goToProfile() {
                this.updateProfileView();
                this.switchView('profileView');
                lucide.createIcons();
            },
            copyStudentNumber() {
                const num = this.currentUser && this.currentUser.studentNumber;
                if (!num) return;
                const done = () => this.showToast('تم نسخ رقمك التعريفي: ' + num);
                if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(String(num)).then(done).catch(() => this.showToast('رقمك التعريفي: ' + num));
                else this.showToast('رقمك التعريفي: ' + num);
            },
            triggerAvatarUpload() {
                const input = document.getElementById('profileAvatarInput');
                if (input) input.click();
                else this.showToast('فتح نافذة اختيار الصورة');
            },
            handleProfileAvatarUpload(event) {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file || !this.currentUser) return;
                if (!file.type.startsWith('image/')) {
                    this.showToast('يرجى اختيار صورة صحيحة');
                    return;
                }
                compressForumImage(file, 480).then((dataUrl) => {
                    if (!dataUrl) {
                        this.showToast('تعذرت معالجة الصورة');
                        return;
                    }
                    this.currentUser.avatar = dataUrl;
                    this.saveUserData();
                    this.updateProfileView();
                    this.syncUserToDatabase();
                    this._avatarPush(this.authUid, this.currentUser);
                    this.showToast('تم تحديث الصورة الشخصية');
                });
            },
            openEditProfileModal() {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول');
                    return;
                }
                this._pendingAvatarUrl = null;
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'تعديل الملف الشخصي';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                // FIX: "الموصل" is the capital of نينوى, not a separate governorate, and حلبجة
                // was missing. A value saved earlier that isn't in the list is kept as an
                // option so saving the form doesn't silently switch it to بغداد.
                const governorates = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'السليمانية', 'الأنبار', 'بابل', 'كربلاء', 'النجف', 'واسط', 'صلاح الدين', 'كركوك', 'ديالى', 'دهوك', 'حلبجة', 'ذي قار', 'ميسان', 'المثنى', 'القادسية'];
                const currentGov = this.currentUser.governorate || '';
                if (currentGov && !governorates.includes(currentGov)) governorates.unshift(currentGov);
                content.innerHTML = `
                    <div class="flex flex-col items-center mb-4">
                        <div class="avatar-container relative w-20 h-20 mb-2 cursor-pointer" onclick="app.triggerAvatarUpload()">
                            <img id="editProfileAvatarPreview" src="${personAvatarSrc(this.currentUser.avatar, this.currentUser.fullName)}" class="w-full h-full rounded-full object-cover border-2" style="border-color: var(--border);">
                            <div class="avatar-overlay absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                                <i data-lucide="camera" class="w-5 h-5 text-white"></i>
                            </div>
                        </div>
                        <span class="text-xs theme-transition" style="color: var(--text2);">اضغط على الصورة لرفع صورة من جهازك</span>
                    </div>
                    <div class="flex flex-col gap-3">
                        <div>
                            <label class="block text-xs font-bold mb-1.5 theme-transition" style="color: var(--text2);">أو ضع رابط صورة مباشر (اختياري)</label>
                            <div class="flex gap-2">
                                <input type="text" id="editProfileAvatarUrl" placeholder="https://..." class="flex-1 h-10 px-3 rounded-lg auth-input text-xs" dir="ltr">
                                <button onclick="app.applyAvatarUrlPreview()" class="px-3 h-10 rounded-lg font-bold text-xs flex-shrink-0 theme-transition" style="background-color: var(--input-bg); color: var(--text);">تطبيق</button>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1.5 theme-transition" style="color: var(--text);">الاسم الثلاثي</label>
                            <input type="text" id="editProfileName" value="${escapeHtml(this.currentUser.fullName || '')}" class="w-full h-12 px-4 rounded-xl auth-input text-sm">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1.5 theme-transition" style="color: var(--text);">المحافظة</label>
                            <select id="editProfileGovernorate" class="w-full h-12 px-4 rounded-xl auth-input text-sm appearance-none cursor-pointer">
                                ${governorates.map(g => `<option value="${escapeHtml(g)}" ${g === currentGov ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1.5 theme-transition" style="color: var(--text);">المرحلة الدراسية</label>
                            <select id="editProfileGrade" class="w-full h-12 px-4 rounded-xl auth-input text-sm appearance-none cursor-pointer">
                                <option value="scientific" ${(this.currentUser.grade || 'scientific') === 'scientific' ? 'selected' : ''}>سادس علمي</option>
                                <option value="literary" ${this.currentUser.grade === 'literary' ? 'selected' : ''}>سادس أدبي</option>
                            </select>
                        </div>
                        <button id="editProfileSaveBtn" onclick="app.saveProfileEdits()" class="w-full h-12 bg-primary text-white rounded-xl font-bold text-sm btn-press mt-1">حفظ التعديلات</button>
                    </div>
                `;
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
            },
            saveProfileEdits() {
                const nameEl = document.getElementById('editProfileName');
                const govEl = document.getElementById('editProfileGovernorate');
                const gradeEl = document.getElementById('editProfileGrade');
                if (!nameEl || !govEl || !gradeEl || !this.currentUser) return;
                const name = nameEl.value.trim();
                const governorate = govEl.value;
                const grade = gradeEl.value;
                if (!name) {
                    this.showToast('أدخل اسمك الثلاثي');
                    return;
                }
                const nameFilter = filterBadWords(name);
                if (nameFilter.filtered) this.showToast('تم حذف كلمات غير لائقة من الاسم');
                this.currentUser.fullName = nameFilter.clean;
                this.currentUser.governorate = governorate;
                this.currentUser.location = governorate;
                this.currentUser.grade = grade;
                if (this._pendingAvatarUrl) {
                    this.currentUser.avatar = this._pendingAvatarUrl;
                    this._pendingAvatarUrl = null;
                }
                this.saveUserData();
                this.updateProfileView();
                this.syncUserToDatabase();
                this.closeWalletModal();
                this.showToast('تم تحديث الملف الشخصي');
                if ('Notification' in window && Notification.permission === 'granted') this.initPushNotifications();
                this.syncNativePush();
            },

            applyAvatarUrlPreview() {
                const input = document.getElementById('editProfileAvatarUrl');
                if (!input) return;
                const url = input.value.trim();
                if (!url) return;
                if (!isSafeImageUrl(url)) {
                    this.showToast('الرابط غير صالح — يجب أن يكون رابط صورة يبدأ بـ https');
                    return;
                }
                this._pendingAvatarUrl = url;
                const preview = document.getElementById('editProfileAvatarPreview');
                if (preview) preview.src = url;
                this.showToast('تم تطبيق الصورة — اضغط "حفظ التعديلات" لتثبيتها');
            },

            openSupportChannel() {
                window.open('https://t.me/Iraqistudentplatfor', '_blank', 'noopener');
            },
            openAppearanceSettings() {
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'اللغة والمظهر';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                const currentColor = this.customThemeColor || '#0D7C6E';
                content.innerHTML = `
                    <div class="flex flex-col gap-4">
                        <div>
                            <div class="text-sm font-bold mb-2 theme-transition" style="color: var(--text);">مظهر التطبيق</div>
                            ${[['فاتحة', false], ['داكنة', true]].map(([t, d]) => `
                            <div class="text-[11px] font-bold mb-1.5 mt-2 theme-transition" style="color: var(--text2);">${t}</div>
                            <div class="grid grid-cols-4 gap-2">${Object.keys(APP_THEMES).filter((k) => APP_THEMES[k].dark === d).map((k) => `
                                <button onclick="app.setThemeMode('${k}')" data-theme-swatch="${k}" class="theme-swatch-btn flex flex-col items-center gap-1.5 p-2 rounded-xl" style="background-color: var(--input-bg);">
                                    <span class="w-8 h-8 rounded-full" style="background: ${APP_THEMES[k].sw}; box-shadow: inset 0 0 0 1px var(--border);"></span>
                                    <span class="text-[11px] font-bold theme-transition" style="color: var(--text);">${APP_THEMES[k].n}</span>
                                </button>`).join('')}
                            </div>`).join('')}
                        </div>
                        <div>
                            <div class="text-sm font-bold mb-2 theme-transition" style="color: var(--text);">لون التطبيق الخاص فيك</div>
                            <p class="text-xs mb-3 theme-transition" style="color: var(--text2);">اختر اللون اللي يعجبك — يظهر بس عندك بهذا الجهاز، وتكدر ترجعه للون الافتراضي بأي وقت إذا ما عجبك</p>
                            <div class="flex items-center gap-3">
                                <input type="color" id="customThemeColorInput" value="${currentColor}" class="w-14 h-12 rounded-xl border cursor-pointer" style="border-color: var(--border);" onchange="app.saveCustomThemeColor(this.value)">
                                <button onclick="app.resetCustomThemeColor()" class="flex-1 h-12 rounded-xl font-bold text-sm theme-transition" style="background-color: var(--input-bg); color: var(--text);">استعادة اللون الافتراضي</button>
                            </div>
                        </div>
                        <div>
                            <div class="text-sm font-bold mb-2 theme-transition" style="color: var(--text);">لغة التطبيق</div>
                            <div class="flex gap-2">
                                <button class="flex-1 h-11 rounded-xl font-bold text-sm bg-primary text-white">العربية</button>
                                <button onclick="app.showToast('الترجمة الكاملة للإنكليزي قيد التطوير حالياً')" class="flex-1 h-11 rounded-xl font-bold text-sm theme-transition" style="background-color: var(--input-bg); color: var(--text2);">English</button>
                            </div>
                        </div>
                    </div>
                `;
                document.getElementById('walletModal')?.classList.remove('hidden');
                this.updateThemeIcon();
                lucide.createIcons();
            },
            openAboutApp() {
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'حول التطبيق';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                content.innerHTML = `
                    <div class="flex flex-col items-center text-center mb-4">
                        <div class="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                            <i data-lucide="graduation-cap" class="w-8 h-8 text-primary"></i>
                        </div>
                        <h3 class="font-bold text-lg theme-transition" style="color: var(--text);">أكـادمي السادس</h3>
                    </div>
                    <p class="text-sm leading-relaxed mb-3 theme-transition" style="color: var(--text);">أكـادمي السادس تطبيق مجاني يهدف لخدمة طلاب المرحلة الإعدادية بالعراق (وخصوصاً السادس)، من خلال توفير أخبار وقرارات وزارة التربية أول بأول، ملازم ومصادر دراسية، تنبيهات مواعيد الامتحانات، وتتبع يومي لأدائك الدراسي.</p>
                    <p class="text-sm leading-relaxed mb-3 theme-transition" style="color: var(--text);">كذلك يوفر منتدى للأسئلة والنقاش بين الطلاب، نظام أصدقاء ودردشة خاصة، تحديات ومسابقات تحفزك على المذاكرة، ونظام نقاط ومكافآت.</p>
                    <p class="text-xs theme-transition" style="color: var(--text2);">تواصل معنا عبر قناة الدعم على تلغرام لأي استفسار أو اقتراح.</p>
                `;
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
            },
            goToSettings() { this.showToast('الإعدادات'); },
            goToHome() { this.setTab('home'); },
            // ===== The More page: every section in one place =====
            // Grouped by kind, searchable, with favourites the student picks and orders (saved on
            // the device and in users/{uid}/moreFavs) and the last few sections they opened.
            MORE_ITEMS: [
                { id: 'wallet', fn: 'goToWallet', t: 'رصيدي', d: 'محفظتك ونقاطك', ic: 'wallet', c: '#10B981', g: 'tools' },
                { id: 'weekly', fn: 'goToWeekly', t: 'ملخص للأهل', d: 'ملخص دراستك الأسبوعي ترسله لأهلك', ic: 'file-heart', c: '#0EA5E9', g: 'study' },
                { id: 'dhikr', fn: 'goToDhikr', t: 'روحانيات', d: 'مسبحة وأدعية تريح القلب وأعمال رمضان', ic: 'moon-star', c: '#0D9488', g: 'tools', feat: 'dhikr' },
                { id: 'food', fn: 'goToFood', t: 'غذائي ومائي', d: 'أكل يقوي ذاكرتك وتذكير بالماي', ic: 'apple', c: '#16A34A', g: 'study' },
                { id: 'mistakes', fn: 'goToMistakes', t: 'دفتر الغلطات', d: 'غلطاتك ترجعلك لحد ما تتقنها', ic: 'notebook-pen', c: '#E11D48', g: 'study' },
                { id: 'uni', fn: 'goToUni', t: 'حاسبة القبول', d: 'وين يدخلك معدلك', ic: 'school', c: '#0F766E', g: 'study' },
                { id: 'bio', fn: 'goToBio', t: 'رسومات الأحياء 3D', d: 'رسومات السادس مجسّمة بأسمائها', ic: 'microscope', c: '#10B981', g: 'study' },
                { id: 'cards', fn: 'goToCards', t: 'بطاقات المراجعة', d: 'سؤال وجواب ومراجعة ذكية', ic: 'layers', c: '#8B5CF6', g: 'study' },
                { id: 'res', fn: 'goToResources', t: 'الملازم', d: 'ملازم رسمية لكل المراحل', ic: 'book-open', c: '#2563EB', g: 'study' },
                { id: 'flights', fn: 'goToFlights', t: 'رحلة جوية', d: 'طيارة تطير على الخريطة وانت تدرس', ic: 'plane', c: '#0284C7', g: 'study', feat: 'flights' },
                { id: 'garden', fn: 'goToGarden', t: 'شجرتي', d: 'ازرع بذرة وادرس لحد ما تثمر', ic: 'sprout', c: '#15803D', g: 'study' },
                { id: 'focus', fn: 'goToFocus', t: 'وضع التركيز', d: 'لا تلمس الهاتف واكسب نقاط', ic: 'smartphone', c: '#0EA5E9', g: 'study' },
                { id: 'timer', fn: 'goToStudyTimer', t: 'مؤقت المذاكرة', d: 'جلسات مذاكرة بنقاط', ic: 'timer', c: '#14B8A6', g: 'study' },
                { id: 'ideas', fn: 'goToIdeas', t: 'صندوق الأفكار', d: 'اقترح إضافات وصوّت عليها', ic: 'lightbulb', c: '#F59E0B', g: 'people' },
                { id: 'modroom', fn: 'goToModRoom', t: 'غرفة المشرفين', d: 'دردشة صوتية وكتابية للمشرفين بس', ic: 'shield-check', c: '#16a34a', g: 'people', mod: true },
                { id: 'vent', fn: 'goToVent', t: 'فضفضة', d: 'قول اللي بقلبك بدون اسم', ic: 'feather', c: '#8B5CF6', g: 'people' },
                { id: 'spots', fn: 'goToSpots', t: 'أماكن الدراسة', d: 'مكتبات ومقاهي هادئة بمحافظتك', ic: 'library-big', c: '#2563EB', g: 'people' },
                { id: 'moodmap', fn: 'goToMoodMap', t: 'خارطة الطلاب', d: 'مزاج طلاب العراق وتفاعلاتهم هسه', ic: 'map', c: '#0284C7', g: 'people' },
                { id: 'ytroom', fn: 'goToYtRooms', t: 'غرفة يوتيوب جماعية', d: 'شوفوا الشرح سوا وكل واحد بسرعته', ic: 'tv', c: '#E11D48', g: 'people' },
                { id: 'plan', fn: 'goToPlan', t: 'خطة الأسبوع', d: 'المعلم يرتب لك شنو تدرس كل يوم من جدولك وامتحاناتك', ic: 'calendar-check', c: '#0EA5E9', g: 'study', feat: 'plan' },
                { id: 'exams', fn: 'goToExams', t: 'الامتحانات', d: 'امتحانات من الملازم وأسئلة وزارية سابقة تحمّلها وتطبعها', ic: 'file-check-2', c: '#7C3AED', g: 'study', feat: 'exams' },
                { id: 'tube', fn: 'goToTube', t: 'تيوب المدرسين', d: 'محاضرات أساتذتك بدون تشتيت وبنقاط', ic: 'youtube', c: '#DC2626', g: 'study', feat: 'tube' },
                { id: 'notes', fn: 'goToNotes', t: 'دفتر الملاحظات', d: 'اكتب ورسم بالقلم، خرائط ذهنية وأوراق لاصقة', ic: 'pen-tool', c: '#7C3AED', g: 'study', feat: 'notes' },
                { id: 'tgteach', fn: 'goToTg', t: 'تلكرام المدرسين', d: 'منشورات وملازم قنوات أساتذتك بتلكرام، داخل التطبيق', ic: 'send', c: '#0284C7', g: 'study', feat: 'tgteachers' },
                { id: 'yt', fn: 'goToYoutubeStudy', t: 'يوتيوب دراسة', d: 'ادرس بفيديو واكسب نقاط', ic: 'video', c: '#EF4444', g: 'study' },
                { id: 'tasks', fn: 'goToTasks', t: 'مهامي اليومية', d: 'مهام وتذكيرات', ic: 'list-checks', c: '#F59E0B', g: 'study' },
                { id: 'cal', fn: 'goToCalendar', t: 'التقويم الشهري', d: 'تقدمك يوم بيوم', ic: 'calendar-days', c: '#6366F1', g: 'study' },
                { id: 'grades', fn: 'goToGrades', t: 'تطور درجاتي', d: 'درجاتك برسم بياني', ic: 'chart-line', c: '#22C55E', g: 'study' },
                { id: 'forest', fn: 'goToForest', t: 'غابة العراق', d: 'ادرس وازرع شجرة بمحافظتك', ic: 'trees', c: '#16A34A', g: 'play' },
                { id: 'war', fn: 'goToGovWar', t: 'حرب المحافظات', d: 'هاجم لمحافظتك بالدراسة', ic: 'swords', c: '#DC2626', g: 'play' },
                { id: 'duels', fn: 'goToDuel', t: 'تحدي مباشر', d: 'سباق أسئلة لحظة بلحظة ويا صديقك', ic: 'swords', c: '#F97316', g: 'play', feat: 'duel' },
                { id: 'auction', fn: 'goToAuction', t: 'مزاد النقاط', d: 'زايد على جائزة الأسبوع', ic: 'gavel', c: '#D97706', g: 'play' },
                { id: 'pstore', fn: 'goToPointsStore', t: 'متجر النقاط', d: 'استبدل نقاطك برصيد', ic: 'gift', c: '#EC4899', g: 'play' },
                { id: 'polls', fn: 'goToPolls', t: 'الاستطلاعات', d: 'صوّت وشوف النتيجة', ic: 'vote', c: '#0891B2', g: 'play', feat: 'poll' },
                { id: 'forum', fn: 'goToForum', t: 'المنتدى', d: 'اسأل وجاوب زملاءك', ic: 'message-circle', c: '#3B82F6', g: 'people' },
                { id: 'msgs', fn: 'goToMessages', t: 'الرسائل', d: 'راسل أي طالب', ic: 'mail', c: '#0EA5E9', g: 'people' },
                { id: 'twin', fn: 'goToTwin', t: 'توأم المذاكرة', d: 'زميل يشجعك وتشجعه', ic: 'users-round', c: '#A855F7', g: 'people' },
                { id: 'sroom', fn: 'goToStudyRoom', t: 'غرفة المذاكرة', d: 'منو يذاكر هسه', ic: 'users', c: '#0D9488', g: 'people' },
                { id: 'hall', fn: 'goToHall', t: 'قاعة الهمّة', d: 'ادخل وشوف طلاب العراق ويّاك', ic: 'flame', c: '#F97316', g: 'people', feat: 'hall' },
                { id: 'money', fn: 'goToMoney', t: 'مصاريفي', d: 'محفظتك وميزانيتك وأهدافك، والمعلم يراقب', ic: 'wallet', c: '#0F766E', g: 'study', feat: 'money' },
                { id: 'room', fn: 'goToRoom', t: 'غرفتنا', d: 'ادرس ويا أصدقائك بغرفة 3D وشخصيات أنمي', ic: 'door-open', c: '#EC4899', g: 'people', feat: 'room' },
                { id: 'mascot', fn: 'openMascot', t: 'أبو الهمّة', d: 'مرشد يحثك على الدراسة', ic: 'bird', c: '#B45309', g: 'study', feat: 'mascot' },
                { id: 'invite', fn: 'goToInvite', t: 'ادعُ زملاءك', d: 'شارك التطبيق وخلّي الكل يدرس', ic: 'megaphone', c: '#E11D48', g: 'people', feat: 'invite' },
                { id: 'timer', fn: 'goToTimer', t: 'المؤقت', d: 'بومودورو وعد تنازلي و40 خلفية', ic: 'timer', c: '#7C3AED', g: 'study', feat: 'timer' },
                { id: 'table', fn: 'goToTable', t: 'جدولي', d: 'جدول محاضراتك الأسبوعي تطبعه وتشاركه', ic: 'calendar-range', c: '#2563EB', g: 'study', feat: 'table' },
                { id: 'dreams', fn: 'goToDreams', t: 'سما الأحلام', d: 'أحلام طلاب العراق', ic: 'sparkles', c: '#7C3AED', g: 'people' },
                { id: 'calm', fn: 'goToCalm', t: 'قبل الامتحان', d: 'تنفّس ودعاء وتجهيز', ic: 'heart-handshake', c: '#DB2777', g: 'tools' },
                { id: 'waste', fn: 'goToWaste', t: 'الوقت الضايع', d: 'شكد يروح وقتك بالهاتف', ic: 'hourglass', c: '#E5484D', g: 'tools' },
                { id: 'saved', fn: 'goToSaved', t: 'الأخبار المحفوظة', d: 'اللي حفظتها للقراءة', ic: 'bookmark', c: '#64748B', g: 'tools' },
                { id: 'cats', fn: 'goToCategories', t: 'تصنيفات الأخبار', d: 'الأخبار حسب النوع', ic: 'layout-grid', c: '#475569', g: 'tools' },
                { id: 'profile', fn: 'goToProfile', t: 'حسابي', d: 'معلوماتك الشخصية', ic: 'user', c: '#2563EB', g: 'tools' }
            ],
            MORE_GROUPS: [['study', 'الدراسة', 'graduation-cap'], ['play', 'المنافسة والنقاط', 'trophy'], ['people', 'الطلاب', 'users-round'], ['tools', 'أدوات', 'wrench']],
            MORE_DEFAULT_FAVS: ['vent', 'spots', 'moodmap', 'garden'],

            _moreState() {
                if (this._mr) return this._mr;
                let d = null;
                try { d = JSON.parse(localStorage.getItem('isp_more') || 'null'); } catch (e) {}
                const ok = (a) => Array.isArray(a) ? a.filter((id) => this.MORE_ITEMS.some((x) => x.id === id)) : null;
                this._mr = { favs: (d && ok(d.favs)) || this.MORE_DEFAULT_FAVS.slice(), recent: (d && ok(d.recent)) || [] };
                const srv = this.currentUser && this.currentUser.moreFavs;
                if (typeof srv === 'string' && srv && !(d && d.local)) this._mr.favs = ok(srv.split(',')) || this._mr.favs;
                return this._mr;
            },
            _moreSave(favsChanged) {
                const m = this._moreState();
                try { localStorage.setItem('isp_more', JSON.stringify({ favs: m.favs, recent: m.recent, local: 1 })); } catch (e) {}
                if (favsChanged && this.authUid && window.firebaseDb) {
                    const { ref, set } = window.firebaseDbHelpers;
                    set(ref(window.firebaseDb, 'users/' + this.authUid + '/moreFavs'), m.favs.join(',')).catch(() => {});
                    if (this.currentUser) this.currentUser.moreFavs = m.favs.join(',');
                }
            },

            // ===== The promo pop-up: siteConfig/promo from the admin panel (title, text, picture, button + link) =====
            _promoSoon() {
                clearTimeout(this._promoT);
                this._promoT = setTimeout(() => this._promoShow(), 2800);
            },
            _promoShow() {
                if (document.getElementById('promoPop')) return;
                let p = null, preview = false;
                try { const pv = localStorage.getItem('isp_promo_preview'); if (pv) { p = JSON.parse(pv); preview = true; localStorage.removeItem('isp_promo_preview'); } } catch (e) {}
                const cfg = this.siteConfig && this.siteConfig.promo;
                if (!p && cfg && cfg.on === true) p = cfg;
                if (!p || (!p.title && !p.text && !p.img)) return;
                if (this.currentView !== 'homeView' || document.hidden || document.querySelector('#mcSet, .rp-w, #maintenanceOverlay:not(.hidden), #walletModal:not(.hidden)')) { if (preview) { try { localStorage.setItem('isp_promo_preview', JSON.stringify(p)); } catch (e) {} } return; }
                if (!preview) {
                    const v = String(p.v || 0), day = new Date().toDateString();
                    let seen = null; try { seen = JSON.parse(localStorage.getItem('isp_promo_seen') || 'null'); } catch (e) {}
                    if (p.freq === 'always') { try { if (sessionStorage.getItem('isp_promo_sess') === v) return; } catch (e) {} }
                    else if (seen && seen.v === v && (p.freq !== 'day' || seen.d === day)) return;
                    try { localStorage.setItem('isp_promo_seen', JSON.stringify({ v, d: day })); sessionStorage.setItem('isp_promo_sess', v); } catch (e) {}
                }
                const url = /^https:\/\/[^\s"'<>]+$/i.test(String(p.url || '')) ? p.url : '';
                const img = p.img && isSafeImageUrl(p.img) ? p.img : '';
                const w = document.createElement('div');
                w.id = 'promoPop'; w.className = 'pp-w'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true');
                w.innerHTML = `<div class="pp-bd" onclick="app.promoClose()"></div>
                    <div class="pp-card">
                        <button class="pp-x" onclick="app.promoClose()" aria-label="إغلاق"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                        ${img ? `<div class="pp-img"><img src="${img}" alt="" decoding="async"></div>` : '<div class="pp-glow" aria-hidden="true"></div>'}
                        <div class="pp-body">
                            ${p.title ? `<h3>${escapeHtml(p.title)}</h3>` : ''}
                            ${p.text ? `<p>${escapeHtml(p.text)}</p>` : ''}
                            ${url ? `<button class="pp-go" onclick="app.promoGo()">${escapeHtml(p.btn || 'افتح الرابط')}</button>` : ''}
                            <button class="pp-later" onclick="app.promoClose()">${url ? 'لاحقاً' : 'تمام'}</button>
                        </div>
                    </div>`;
                w._url = url;
                document.body.appendChild(w);
                requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('on')));
            },
            promoGo() { const w = document.getElementById('promoPop'); const u = w && w._url; this.promoClose(); if (u) window.open(u, '_blank', 'noopener'); },
            promoClose() { const w = document.getElementById('promoPop'); if (!w) return; w.classList.remove('on'); setTimeout(() => w.remove(), 280); },

            goToMore() {
                this._mrEdit = false;
                this._mrQ = '';
                this.switchView('moreView');
                this.renderMore(true);
            },
            goToMoreExtra() { this.goToMore(); },

            moreOpen(id) {
                const it = this.MORE_ITEMS.find((x) => x.id === id);
                if (!it) return;
                if (this._mrEdit) { this.moreFav(id); return; }
                const m = this._moreState();
                m.recent = [id].concat(m.recent.filter((x) => x !== id)).slice(0, 6);
                this._moreSave(false);
                if (typeof this[it.fn] === 'function') this[it.fn]();
            },

            moreEdit() {
                this._mrEdit = !this._mrEdit;
                if (this._mrEdit) this._mrQ = '';
                this.renderMore(false);
                try { navigator.vibrate && navigator.vibrate(10); } catch (e) {}
            },

            moreFav(id) {
                const m = this._moreState(), i = m.favs.indexOf(id);
                if (i >= 0) m.favs.splice(i, 1);
                else { if (m.favs.length >= 12) { this.showToast('المفضلة تتسع لـ 12 قسم'); return; } m.favs.push(id); }
                this._moreSave(true);
                this.renderMore(false);
            },

            moreMove(id, d) {
                const m = this._moreState(), i = m.favs.indexOf(id), j = i + d;
                if (i < 0 || j < 0 || j >= m.favs.length) return;
                [m.favs[i], m.favs[j]] = [m.favs[j], m.favs[i]];
                this._moreSave(true);
                this.renderMore(false);
            },

            moreSearch(q) {
                this._mrQ = q;
                const box = document.getElementById('mrBody');
                if (box) { box.innerHTML = this._moreBody(); lucide.createIcons(); }
            },

            _moreTile(it, i, o = {}) {
                const m = this._moreState(), fav = m.favs.indexOf(it.id) !== -1, e = this._mrEdit;
                return `<button class="mr-tile${o.big ? ' big' : ''}${e ? ' edit' : ''}${e && fav ? ' on' : ''}" style="--c:${it.c};--i:${i}" onclick="app.moreOpen(${jsArg(it.id)})">
                    <span class="mr-ic"><i data-lucide="${it.ic}"></i></span>
                    <b>${escapeHtml(it.t)}</b>${o.big || o.desc ? `<small>${escapeHtml(it.d)}</small>` : ''}
                    ${e ? `<em class="mr-star"><i data-lucide="${fav ? 'star' : 'plus'}"></i></em>` : ''}
                </button>`;
            },

            _moreBody() {
                const q = String(this._mrQ || '').trim(), items = this.MORE_ITEMS;
                if (q) {
                    const hit = items.filter((x) => (x.t + ' ' + x.d).indexOf(q) !== -1);
                    return hit.length ? `<div class="mr-grid list">${hit.map((it, i) => this._moreTile(it, i, { desc: 1 })).join('')}</div>` : '<p class="mr-none">ما لكيت قسم بهالاسم</p>';
                }
                return this.MORE_GROUPS.map(([g, t, ic], gi) => `
                    <div class="mr-sec" style="--i:${gi + 2}"><i data-lucide="${ic}"></i><b>${t}</b></div>
                    <div class="mr-grid">${items.filter((x) => x.g === g).map((it, i) => this._moreTile(it, i)).join('')}</div>`).join('');
            },

            renderMore(anim) {
                const box = document.getElementById('moreContent');
                if (!box) return;
                const m = this._moreState(), e = this._mrEdit, byId = (id) => this.MORE_ITEMS.find((x) => x.id === id);
                const favs = m.favs.map(byId).filter(Boolean), recent = m.recent.map(byId).filter(Boolean).filter((x) => m.favs.indexOf(x.id) === -1).slice(0, 4);
                const btn = document.getElementById('mrEditBtn');
                if (btn) { btn.classList.toggle('on', !!e); btn.innerHTML = e ? '<i data-lucide="check"></i><span>تم</span>' : '<i data-lucide="sliders-horizontal"></i><span>تخصيص</span>'; }
                box.classList.toggle('anim', !!anim);
                box.innerHTML = `
                    ${e ? '<div class="mr-hint"><i data-lucide="hand"></i>اضغط على أي قسم حتى تضيفه للمفضلة أو تشيله، ورتّب المفضلة بالأسهم</div>' : `<label class="mr-search"><i data-lucide="search"></i><input type="search" placeholder="دوّر على قسم..." value="${escapeHtml(this._mrQ || '')}" oninput="app.moreSearch(this.value)"></label>`}
                    <div class="mr-fav-h"><b><i data-lucide="star"></i>المفضلة</b>${favs.length ? '' : '<span>فارغة</span>'}</div>
                    ${favs.length ? `<div class="mr-favs">${favs.map((it, i) => `<div class="mr-fav-w" style="--i:${i}">${this._moreTile(it, i, { big: 1 })}${e ? `<div class="mr-mv"><button onclick="app.moreMove(${jsArg(it.id)}, -1)" ${i ? '' : 'disabled'} aria-label="قبل"><i data-lucide="chevron-right"></i></button><button onclick="app.moreMove(${jsArg(it.id)}, 1)" ${i < favs.length - 1 ? '' : 'disabled'} aria-label="بعد"><i data-lucide="chevron-left"></i></button></div>` : ''}</div>`).join('')}</div>` : `<button class="mr-empty" onclick="app.moreEdit()"><i data-lucide="star"></i>اضغط "تخصيص" واختار الأقسام اللي تستخدمها أكثر</button>`}
                    ${!e && recent.length ? `<div class="mr-sec"><i data-lucide="history"></i><b>استخدمتها مؤخراً</b></div><div class="mr-recent">${recent.map((it, i) => `<button style="--c:${it.c};--i:${i}" onclick="app.moreOpen(${jsArg(it.id)})"><span class="mr-ic sm"><i data-lucide="${it.ic}"></i></span>${escapeHtml(it.t)}</button>`).join('')}</div>` : ''}
                    <div id="mrBody">${this._moreBody()}</div>`;
                lucide.createIcons();
            },

            // ==================== RESOURCES ====================
            goToResources() {
                this.loadResources();
                this.switchView('resourcesView');
            },
            loadResources() {
                this.listenForResources();
                this.showResourcesNormal();
                this.renderStageTabs();
                this.renderSubjects();
                this.renderResourcesList();
                lucide.createIcons();
            },
            showResourcesNormal() {
                document.getElementById('resourcesContent')?.classList.remove('hidden');
                document.getElementById('resourcesStates')?.classList.add('hidden');
            },
            showResourcesLoading() {
                document.getElementById('resourcesContent')?.classList.add('hidden');
                document.getElementById('resourcesStates')?.classList.remove('hidden');
                document.getElementById('resourcesLoadingState')?.classList.remove('hidden');
                document.getElementById('resourcesEmptyState')?.classList.add('hidden');
                document.getElementById('resourcesErrorState')?.classList.add('hidden');
                document.getElementById('resourcesOfflineState')?.classList.add('hidden');
                document.getElementById('resourcesSearchResults')?.classList.add('hidden');
            },
            showResourcesEmpty() {
                document.getElementById('resourcesContent')?.classList.add('hidden');
                document.getElementById('resourcesStates')?.classList.remove('hidden');
                document.getElementById('resourcesLoadingState')?.classList.add('hidden');
                document.getElementById('resourcesEmptyState')?.classList.remove('hidden');
                document.getElementById('resourcesErrorState')?.classList.add('hidden');
                document.getElementById('resourcesOfflineState')?.classList.add('hidden');
                document.getElementById('resourcesSearchResults')?.classList.add('hidden');
            },
            showResourcesError() {
                document.getElementById('resourcesContent')?.classList.add('hidden');
                document.getElementById('resourcesStates')?.classList.remove('hidden');
                document.getElementById('resourcesLoadingState')?.classList.add('hidden');
                document.getElementById('resourcesEmptyState')?.classList.add('hidden');
                document.getElementById('resourcesErrorState')?.classList.remove('hidden');
                document.getElementById('resourcesOfflineState')?.classList.add('hidden');
                document.getElementById('resourcesSearchResults')?.classList.add('hidden');
            },
            showResourcesOffline() {
                document.getElementById('resourcesContent')?.classList.add('hidden');
                document.getElementById('resourcesStates')?.classList.remove('hidden');
                document.getElementById('resourcesLoadingState')?.classList.add('hidden');
                document.getElementById('resourcesEmptyState')?.classList.add('hidden');
                document.getElementById('resourcesErrorState')?.classList.add('hidden');
                document.getElementById('resourcesOfflineState')?.classList.remove('hidden');
                document.getElementById('resourcesSearchResults')?.classList.add('hidden');
            },
            showResourcesSearch() {
                document.getElementById('resourcesContent')?.classList.add('hidden');
                document.getElementById('resourcesStates')?.classList.remove('hidden');
                document.getElementById('resourcesLoadingState')?.classList.add('hidden');
                document.getElementById('resourcesEmptyState')?.classList.add('hidden');
                document.getElementById('resourcesErrorState')?.classList.add('hidden');
                document.getElementById('resourcesOfflineState')?.classList.add('hidden');
                document.getElementById('resourcesSearchResults')?.classList.remove('hidden');
            },

            renderStageTabs() {
                document.querySelectorAll('.stage-tab').forEach(tab => tab.classList.toggle('on', tab.dataset.stage === this.activeStage));
                // hero numbers for the chosen stage
                const inStage = resourcesData.filter(r => r.stage === this.activeStage);
                const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
                set('rsStatTotal', inStage.length);
                set('rsStatSubjects', (subjectsData[this.activeStage] || []).length);
                set('rsStatOffline', this.offlineResourceIds.size);
            },

            setStage(stage) {
                this.activeStage = stage;
                this.activeSubject = null;
                this.renderStageTabs();
                this.renderSubjects();
                this.renderResourcesList();
                lucide.createIcons();
            },

            // FIX (UI/UX): the full 3-column subject grid used to stay expanded even after a
            // subject was picked, permanently eating vertical space that the file list below
            // needed. Once a subject is selected the grid collapses into a compact horizontal
            // strip of pills (same tap targets, a fraction of the height) — tapping the active
            // pill again (via setSubject's toggle) or picking another still works the same way.
            // Subject tiles with a live count of notes per subject (admin saves the Arabic name,
            // older records may hold the id — both count).
            resourceMatchesSubject(r, subj) {
                return r.subject === subj.id || r.subject === subj.name;
            },

            renderSubjects() {
                const subjects = subjectsData[this.activeStage] || [];
                const container = document.getElementById('subjectsGrid');
                if (!container) return;
                const inStage = resourcesData.filter(r => r.stage === this.activeStage);
                container.innerHTML = subjects.map((subj, i) => {
                    const n = inStage.filter(r => this.resourceMatchesSubject(r, subj)).length;
                    return `
                        <button onclick="app.setSubject(${jsArg(subj.id)})" class="rs-subj${this.activeSubject === subj.id ? ' on' : ''}" style="--c:${subj.iconColor};animation-delay:${(i * 0.03).toFixed(2)}s">
                            ${n ? `<span class="rs-n">${n}</span>` : ''}
                            <span class="rs-subj-ic"><i data-lucide="${subj.icon}"></i></span>
                            <b>${escapeHtml(subj.name)}</b>
                            <small>${n ? n + ' ملزمة' : 'قريباً'}</small>
                        </button>`;
                }).join('');
            },

            setSubject(subjectId) {
                this.activeSubject = this.activeSubject === subjectId ? null : subjectId;
                this.renderSubjects();
                this.renderResourcesList();
                lucide.createIcons();
            },

            renderResourcesList() {
                const container = document.getElementById('resourcesList');
                if (!container) return;

                // "المحفوظة بدون نت" ignores the stage/subject tabs on purpose — it should
                // always show every resource actually sitting in IndexedDB on this device,
                // regardless of what's currently loaded from Firebase.
                if (this.resourceFilter === 'offline') {
                    const offlineList = [...this.offlineResourcesMeta].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
                    const t = document.getElementById('rsListTitle'); if (t) t.textContent = 'المحفوظة بدون نت';
                    const m = document.getElementById('rsListMeta'); if (m) m.textContent = offlineList.length + ' ملزمة';
                    document.getElementById('rsShowAll')?.classList.remove('hidden');
                    if (offlineList.length === 0) {
                        container.innerHTML = `
                            <div class="flex flex-col items-center justify-center py-8 text-center">
                                <div class="w-16 h-16 rounded-full flex items-center justify-center mb-3 theme-transition" style="background-color: var(--input-bg);">
                                    <i data-lucide="wifi-off" class="w-8 h-8 theme-transition" style="color: var(--text2);"></i>
                                </div>
                                <h3 class="font-bold mb-1 theme-transition" style="color: var(--text);">ما عندك ملازم محفوظة بدون نت</h3>
                                <p class="text-sm theme-transition" style="color: var(--text2);">اضغط على أيقونة التحميل بأي ملزمة لحفظها واستخدامها بدون إنترنت</p>
                            </div>`;
                    } else {
                        container.innerHTML = offlineList.map(res => this.createResourceCard(res)).join('');
                    }
                    lucide.createIcons();
                    return;
                }

                let filtered = resourcesData.filter(r => r.stage === this.activeStage);
                // FIX: the admin panel saves the subject's Arabic *name* ("الكيمياء") while the
                // subject tabs here use ids ("chemistry"), so picking any subject always showed
                // "لا توجد ملازم". Both forms are accepted now.
                if (this.activeSubject) {
                    const subj = (subjectsData[this.activeStage] || []).find(s => s.id === this.activeSubject);
                    filtered = filtered.filter(r => r.subject === this.activeSubject || (subj && r.subject === subj.name));
                }
                if (this.resourceFilter === 'official') filtered = filtered.filter(r => r.isOfficial);
                if (this.resourceFilter === 'downloads') filtered = [...filtered].sort((a, b) => (Number(b.downloads) || 0) - (Number(a.downloads) || 0));
                else filtered = [...filtered].sort((a, b) => (b.id || 0) - (a.id || 0));

                // header above the list: which subject, how many, how it's sorted
                const subjObj = (subjectsData[this.activeStage] || []).find(s => s.id === this.activeSubject);
                const sortLabel = { newest: 'الأحدث أولاً', downloads: 'الأكثر تحميلاً', official: 'الرسمية فقط' }[this.resourceFilter] || '';
                const titleEl = document.getElementById('rsListTitle');
                if (titleEl) titleEl.textContent = subjObj ? 'ملازم ' + subjObj.name : 'كل الملازم';
                const metaEl = document.getElementById('rsListMeta');
                if (metaEl) metaEl.textContent = filtered.length + ' ملزمة · ' + sortLabel;
                document.getElementById('rsShowAll')?.classList.toggle('hidden', !this.activeSubject && this.resourceFilter === 'newest');
                const hint = document.getElementById('rsSubjectHint');
                if (hint) hint.textContent = subjObj ? 'اضغط مرة ثانية لإلغاء الاختيار' : 'اضغط على مادة لعرض ملازمها';
                this.renderStageTabs();

                if (filtered.length === 0) {
                    setTimeout(() => lucide.createIcons(), 0);
                    container.innerHTML = `<div class="hp-empty"><div><i data-lucide="inbox"></i></div>${subjObj ? 'ما كو ملازم لمادة ' + escapeHtml(subjObj.name) + ' بعد' : 'ما كو ملازم لهذي المرحلة بعد'}<br><small>تابعنا، راح تنضاف قريباً</small></div>`;
                    return;
                }
                container.innerHTML = filtered.map((res, i) => this.createResourceCard(res, i)).join('');
                lucide.createIcons();
            },

            createResourceCard(res, i) {
                const downloads = numOr0(res.downloads);
                const dl = downloads >= 1000 ? (downloads / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : downloads;
                const subj = (subjectsData[res.stage] || []).find(sb => this.resourceMatchesSubject(res, sb));
                const saved = this.offlineResourceIds.has(res.id);
                const id = jsNum(res.id);
                return `
                    <div class="rs-card" style="animation-delay:${Math.min(i || 0, 10) * 0.05}s" onclick="app.openResource(${id})">
                        <div class="rs-cover"><img src="${safeImage(res.thumbnail)}" alt="${escapeHtml(res.title)}" loading="lazy"><span class="rs-pdf">PDF</span></div>
                        <div class="rs-info">
                            <h4>${escapeHtml(res.title)}</h4>
                            ${res.description ? `<p>${escapeHtml(res.description)}</p>` : ''}
                            <div class="rs-tags">
                                ${subj ? `<span class="rs-tag subj" style="--c:${subj.iconColor}">${escapeHtml(subj.name)}</span>` : ''}
                                <span class="rs-tag"><i data-lucide="file-text"></i>${escapeHtml(res.fileSize || '—')}</span>
                                <span class="rs-tag"><i data-lucide="download"></i>${dl}</span>
                                ${res.isOfficial ? '<span class="rs-tag ok"><i data-lucide="badge-check"></i>رسمي</span>' : ''}
                            </div>
                        </div>
                        ${saved
                            ? `<button onclick="event.stopPropagation(); app.openOfflineResource(${id})" class="rs-dl saved" title="محفوظة بدون نت — اضغط للفتح" aria-label="فتح الملزمة المحفوظة"><i data-lucide="book-open-check"></i></button>`
                            : `<button onclick="event.stopPropagation(); app.downloadResourceOffline(${id})" class="rs-dl" title="حفظ للاستخدام بدون نت" aria-label="تحميل الملزمة"><i data-lucide="download"></i></button>`}
                    </div>
                `;
            },

            openResource(id) {
                const res = resourcesData.find(r => r.id === id);
                if (!res) return;
                this.currentResourceId = id;

                const content = document.getElementById('resourceDetailContent');
                if (!content) return;
                content.innerHTML = `
                    <div class="px-4 pt-6 pb-4 flex flex-col items-center">
                        <div class="w-32 h-[176px] rounded-xl overflow-hidden shadow-elevated mb-4 relative">
                            <img src="${safeImage(res.thumbnail)}" class="w-full h-full object-cover" alt="${escapeHtml(res.title)}">
                            <div class="absolute bottom-2 left-2 pdf-badge text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                                <i data-lucide="file-text" class="w-3 h-3"></i>PDF
                            </div>
                        </div>
                        <h1 class="text-lg font-bold text-center mb-1 theme-transition" style="color: var(--text);">${escapeHtml(res.title)}</h1>
                        <p class="text-sm text-center mb-4 theme-transition" style="color: var(--text2);">${escapeHtml(res.description)} - الطبعة ${escapeHtml(res.year || '')}</p>

                        <div class="flex items-center gap-4 text-xs mb-6 theme-transition" style="color: var(--text2);">
                            <span class="flex items-center gap-1"><i data-lucide="file-text" class="w-3.5 h-3.5"></i>${escapeHtml(res.fileSize || '—')}</span>
                            <span class="flex items-center gap-1"><i data-lucide="download" class="w-3.5 h-3.5"></i>${(Number(res.downloads) || 0).toLocaleString()} تحميل</span>
                            ${res.isOfficial ? '<span class="flex items-center gap-1 text-success"><i data-lucide="badge-check" class="w-3.5 h-3.5"></i>معتمدة من أساتذة الوزارة</span>' : ''}
                        </div>

                        ${this.offlineResourceIds.has(res.id) ? `
                        <button onclick="app.openOfflineResource(${jsNum(res.id)})" id="downloadBtn" class="w-full flex items-center justify-center gap-2 py-3.5 bg-success text-white rounded-xl font-bold text-sm btn-press mb-2">
                            <i data-lucide="wifi-off" class="w-5 h-5"></i>فتح الملزمة (محفوظة بدون نت)
                        </button>
                        <button onclick="app.removeOfflineResource(${jsNum(res.id)})" class="w-full text-center text-xs font-medium mb-4 btn-press" style="color: var(--text2);">
                            إزالة من التخزين بدون نت
                        </button>` : `
                        <button onclick="app.downloadResourceOffline(${jsNum(res.id)})" id="downloadBtn" class="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-white rounded-xl font-bold text-sm btn-press mb-4">
                            <i data-lucide="download" class="w-5 h-5"></i>تحميل للاستخدام بدون نت
                        </button>`}

                        <div class="w-full flex gap-3 mb-6">
                            <button onclick="app.shareCurrentResource()" class="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium btn-press text-sm theme-transition" style="background-color: var(--input-bg); color: var(--text);">
                                <i data-lucide="share-2" class="w-4 h-4"></i>مشاركة
                            </button>
                            <button onclick="app.toggleResourceBookmark()" class="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium btn-press text-sm theme-transition" style="background-color: var(--input-bg); color: var(--text);">
                                <i data-lucide="bookmark" class="w-4 h-4 ${res.isBookmarked ? 'fill-primary text-primary' : ''}"></i>${res.isBookmarked ? 'محفوظ' : 'حفظ'}
                            </button>
                        </div>

                        <div class="w-full border-t pt-4 theme-transition" style="border-color: var(--border);">
                            <h3 class="text-sm font-bold mb-3 theme-transition" style="color: var(--text);">معلومات إضافية</h3>
                            <div class="space-y-3">
                                <div class="flex justify-between text-sm">
                                    <span class="theme-transition" style="color: var(--text2);">المرحلة</span>
                                    <span class="font-medium theme-transition" style="color: var(--text);">${String(res.stage || '').includes('sixth') ? 'السادس' : 'الخامس'} ${String(res.stage || '').includes('science') ? 'علمي' : 'أدبي'}</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="theme-transition" style="color: var(--text2);">السنة</span>
                                    <span class="font-medium theme-transition" style="color: var(--text);">${escapeHtml(res.year || '')}</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="theme-transition" style="color: var(--text2);">الحالة</span>
                                    <span class="font-medium text-success">${this.offlineResourceIds.has(res.id) ? 'محفوظة بدون إنترنت' : 'متاحة للتحميل'}</span>
                                </div>
                            </div>
                        </div>

                        <div class="w-full border-t pt-4 mt-4 theme-transition" style="border-color: var(--border);">
                            <h3 class="text-sm font-bold mb-3 theme-transition" style="color: var(--text);">وصف الملزمة</h3>
                            <p class="text-sm leading-relaxed theme-transition" style="color: var(--text2);">
                                ملزمة شاملة ومحدثة حسب المنهج الوزاري 2025 تحتوي على شرح مفصل وأمثلة وتمارين محلولة.
                            </p>
                        </div>
                    </div>
                `;
                this.switchView('resourceDetailView');
                lucide.createIcons();
            },


            toggleResourceBookmark() {
                if (this.currentResourceId) {
                    const res = resourcesData.find(r => r.id === this.currentResourceId);
                    if (res) {
                        res.isBookmarked = !res.isBookmarked;
                        this.showToast(res.isBookmarked ? 'تم حفظ الملزمة' : 'تم إزالة الملزمة من المحفوظات');
                        this.openResource(this.currentResourceId);
                    }
                }
            },

            async shareCurrentResource() {
                const res = resourcesData.find(r => r.id === this.currentResourceId);
                const url = this._isNative() ? 'https://efcegxsax-glitch.github.io/Shop-Iraq-/' : window.location.href;
                const title = (res && res.title) || 'أكـادمي السادس';
                const text = (res && res.description) ? (res.title + '\n' + res.description) : title;
                try {
                    if (navigator.share) {
                        await navigator.share({ title, text, url });
                    } else if (navigator.clipboard) {
                        await navigator.clipboard.writeText(url);
                        this.showToast('تم نسخ رابط الملزمة — المشاركة المباشرة غير مدعومة بهذا المتصفح');
                    } else {
                        this.showToast('المشاركة غير مدعومة في هذا المتصفح');
                    }
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        this.showToast('تعذر تنفيذ المشاركة');
                    }
                }
            },
            showResourceMore() { this.showToast('خيارات إضافية'); },
            // FIX: "عرض الكل" used to only show a toast — it now clears the subject and filter.
            showAllResources() {
                this.activeSubject = null;
                this.resourceFilter = 'newest';
                this.renderSubjects();
                this.renderResourcesList();
                lucide.createIcons();
            },

            handleResourceSearch(query) {
                const val = (query || '').trim();
                if (!val) { this.showResourcesNormal(); return; }
                const results = resourcesData.filter(r => String(r.title || '').includes(val) || String(r.description || '').includes(val) || String(r.subject || '').includes(val));
                const container = document.getElementById('resourcesSearchResults');
                if (!container) return;
                if (results.length === 0) {
                    container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-16 text-center">
                            <div class="w-16 h-16 rounded-full flex items-center justify-center mb-3 theme-transition" style="background-color: var(--input-bg);">
                                <i data-lucide="search-x" class="w-8 h-8 theme-transition" style="color: var(--text2);"></i>
                            </div>
                            <h3 class="font-bold mb-1 theme-transition" style="color: var(--text);">لا توجد نتائج</h3>
                            <p class="text-sm theme-transition" style="color: var(--text2);">جرب كلمات بحث أخرى</p>
                        </div>`;
                } else {
                    container.innerHTML = results.map(r => this.createResourceCard(r)).join('');
                }
                this.showResourcesSearch();
                lucide.createIcons();
            },

            // FIX (UI/UX): this button used to just show a toast ("فلتر التصنيفات") and do
            // nothing — a dead control that looks interactive erodes trust in the rest of the
            // app. It now opens a real filter/sort sheet that actually changes what
            // renderResourcesList() shows.
            toggleResourceFilter() {
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'ترتيب وفلترة الملازم';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                const options = [
                    { id: 'newest', label: 'الأحدث أولاً', icon: 'clock' },
                    { id: 'downloads', label: 'الأكثر تحميلاً', icon: 'trending-up' },
                    { id: 'official', label: 'الرسمية فقط', icon: 'badge-check' },
                    { id: 'offline', label: 'المحفوظة بدون نت', icon: 'wifi-off' }
                ];
                content.innerHTML = options.map(opt => `
                    <button onclick="app.setResourceFilter(${jsArg(opt.id)})" class="w-full flex items-center gap-3 p-3.5 rounded-2xl border theme-transition text-right btn-press" style="background-color: ${this.resourceFilter === opt.id ? 'var(--primary)' : 'var(--surface)'}; border-color: var(--border); color: ${this.resourceFilter === opt.id ? '#fff' : 'var(--text)'};">
                        <i data-lucide="${opt.icon}" class="w-5 h-5"></i>
                        <span class="flex-1 font-bold text-sm">${opt.label}</span>
                        ${this.resourceFilter === opt.id ? '<i data-lucide="check" class="w-5 h-5"></i>' : ''}
                    </button>
                `).join('');
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
            },
            setResourceFilter(id) {
                this.resourceFilter = id;
                this.renderResourcesList();
                this.closeWalletModal();
                lucide.createIcons();
            },

            // ==================== WALLET ====================
            walletBalanceVisible: true,

            // points value: the admin sets shop/rate = points per 1 dinar (default 10, so 10,000 points = 1,000 د.ع)
            ptsRate() { const r = Number(this._ptsRate); return r > 0 ? r : 10; },
            ptsToIqd(p) { return Math.round(numOr0(p) / this.ptsRate()); },
            _listenPtsRate() {
                if (this._ptsRateOn || !window.firebaseDb) return;
                this._ptsRateOn = true;
                const { ref, onValue } = window.firebaseDbHelpers;
                onValue(ref(window.firebaseDb, 'shop/rate'), (snap) => {
                    this._ptsRate = Number(snap.val()) || 10;
                    if (this.currentView === 'walletView') { this.renderWalletBalance(); this.renderWalletPoints(); }
                    if (this.currentView === 'pointsStoreView') this.renderPointsStore();
                }, () => { this._ptsRateOn = false; });
            },

            goToWallet() {
                this._listenPtsRate();
                this.loadWallet();
                this.switchView('walletView');
            },

            loadWallet() {
                this.showWalletNormal();
                this.renderWalletBalance();
                this.renderWalletPoints();
                this.renderWalletTransactions();
                this.listenForWalletTransactions();
                lucide.createIcons();
            },

            listenForWalletTransactions() {
                if (!window.firebaseDb || !this.authUid || this._walletTxListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._walletTxListener = onValue(ref(window.firebaseDb, 'walletTransactions/' + this.authUid), (snap) => {
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((k) => list.push(vals[k]));
                        list.sort((a, b) => (b.id || 0) - (a.id || 0));
                    }
                    walletTransactions.length = 0;
                    walletTransactions.push(...list);
                    if (this.currentView === 'walletView') this.renderWalletTransactions();
                });
            },

            addWalletTransaction(tx) {
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const record = {
                    id: Date.now(),
                    title: tx.title,
                    date: now.getFullYear() + '/' + pad(now.getMonth() + 1) + '/' + pad(now.getDate()) + ' - ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
                    amount: tx.amount,
                    isNegative: !!tx.isNegative,
                    icon: tx.icon,
                    iconColor: tx.iconColor,
                    iconBg: tx.iconBg
                };
                walletTransactions.unshift(record);
                this.renderWalletTransactions();
                if (window.firebaseDb && this.authUid) {
                    const { ref, set } = window.firebaseDbHelpers;
                    set(ref(window.firebaseDb, 'walletTransactions/' + this.authUid + '/' + record.id), record).catch((err) => {
                        console.warn('Wallet transaction save failed:', err);
                    });
                }
            },

            renderWalletPoints() {
                const pointsEl = document.getElementById('walletPointsValue');
                const iqdEl = document.getElementById('walletPointsIqd');
                const streakEl = document.getElementById('walletStreakInfo');
                if (!pointsEl || !iqdEl) return;
                const points = (this.isLoggedIn && this.currentUser && typeof this.currentUser.points === 'number') ? this.currentUser.points : 0;
                pointsEl.textContent = points.toLocaleString('en-US') + ' نقطة';
                iqdEl.textContent = '≈ ' + this.ptsToIqd(points).toLocaleString('en-US') + ' د.ع · كل 10,000 نقطة = ' + this.ptsToIqd(10000).toLocaleString('en-US') + ' د.ع';
                // progress toward the next points-store offer
                const goalBar = document.getElementById('walletGoalBar');
                const goalText = document.getElementById('walletGoalText');
                if (goalBar && goalText) {
                    const next = pointsStoreOffers.find(o => o.points > points);
                    if (next) {
                        goalBar.style.setProperty('--w', Math.max(3, Math.min(100, (points / next.points) * 100)).toFixed(1) + '%');
                        goalText.textContent = 'باقي ' + (next.points - points).toLocaleString('en-US') + ' نقطة وتقدر تستبدلها بـ ' + this.ptsToIqd(next.points).toLocaleString('en-US') + ' د.ع';
                    } else {
                        goalBar.style.setProperty('--w', '100%');
                        goalText.textContent = 'نقاطك تكفي لأكبر عرض بمتجر النقاط — استبدلها الآن';
                    }
                }
                if (streakEl) {
                    const streak = (this.isLoggedIn && this.currentUser && this.currentUser.loginStreak) || 0;
                    if (streak > 0) {
                        streakEl.innerHTML = '<span class="flame"></span><span>' + streak + ' يوم</span>';
                        streakEl.classList.remove('hidden');
                    } else {
                        streakEl.classList.add('hidden');
                    }
                }
            },

            showWalletNormal() {
                document.getElementById('walletContent')?.classList.remove('hidden');
                document.getElementById('walletStates')?.classList.add('hidden');
            },
            showWalletLoading() {
                document.getElementById('walletContent')?.classList.add('hidden');
                document.getElementById('walletStates')?.classList.remove('hidden');
                document.getElementById('walletLoadingState')?.classList.remove('hidden');
                document.getElementById('walletEmptyState')?.classList.add('hidden');
                document.getElementById('walletErrorState')?.classList.add('hidden');
            },
            showWalletEmpty() {
                document.getElementById('walletContent')?.classList.add('hidden');
                document.getElementById('walletStates')?.classList.remove('hidden');
                document.getElementById('walletLoadingState')?.classList.add('hidden');
                document.getElementById('walletEmptyState')?.classList.remove('hidden');
                document.getElementById('walletErrorState')?.classList.add('hidden');
            },
            showWalletError() {
                document.getElementById('walletContent')?.classList.add('hidden');
                document.getElementById('walletStates')?.classList.remove('hidden');
                document.getElementById('walletLoadingState')?.classList.add('hidden');
                document.getElementById('walletEmptyState')?.classList.add('hidden');
                document.getElementById('walletErrorState')?.classList.remove('hidden');
            },

            renderWalletBalance() {
                const balanceEl = document.getElementById('walletBalanceValue');
                const iqdEl = document.getElementById('walletBalanceIqd');
                const nameEl = document.getElementById('walletCardName');
                if (!balanceEl || !iqdEl) return;
                if (nameEl && this.isLoggedIn && this.currentUser) {
                    nameEl.textContent = this.currentUser.fullName || 'الطالب';
                }
                const numEl = document.getElementById('walletCardNumber');
                if (numEl) numEl.textContent = (this.isLoggedIn && this.currentUser && this.currentUser.studentNumber) ? '#' + this.currentUser.studentNumber : '—';
                const balance = (this.isLoggedIn && this.currentUser && typeof this.currentUser.balance === 'number') ? this.currentUser.balance : 0;
                // the card shows the two parts: cash balance and points (with their value in dinar), and the total
                const pts = (this.isLoggedIn && this.currentUser) ? numOr0(this.currentUser.points) : 0, balIqd = Math.round(balance * 1325), ptsIqd = this.ptsToIqd(pts);
                const sb = document.getElementById('walletSplitBal'), sp = document.getElementById('walletSplitPts'), spi = document.getElementById('walletSplitPtsIqd'), st = document.getElementById('walletSplitTotal');
                const n = (v) => v.toLocaleString('en-US');
                if (this.walletBalanceVisible) {
                    balanceEl.textContent = '$ ' + balance.toFixed(2);
                    iqdEl.textContent = '≈ ' + n(balIqd) + ' د.ع';
                    if (sb) sb.textContent = n(balIqd) + ' د.ع';
                    if (sp) sp.textContent = n(pts) + ' نقطة';
                    if (spi) spi.textContent = '≈ ' + n(ptsIqd) + ' د.ع';
                    if (st) st.textContent = n(balIqd + ptsIqd) + ' د.ع';
                } else {
                    balanceEl.textContent = '$ ****';
                    iqdEl.textContent = '≈ **** د.ع';
                    [sb, spi, st].forEach((e) => { if (e) e.textContent = '****'; });
                    if (sp) sp.textContent = '**** نقطة';
                }
            },

            toggleBalanceVisibility() {
                this.walletBalanceVisible = !this.walletBalanceVisible;
                const btn = document.getElementById('balanceEyeBtn');
                if (btn) btn.innerHTML = `<i data-lucide="${this.walletBalanceVisible ? 'eye' : 'eye-off'}"></i>`;
                this.renderWalletBalance();
                lucide.createIcons();
            },

            // One row style for the wallet list: green = money in, red = money out.
            walletTxRow(t, i) {
                const out = !!t.isNegative;
                const icon = /^[a-z0-9-]+$/.test(String(t.icon || '')) ? t.icon : (out ? 'arrow-up-right' : 'arrow-down-left');
                return `
                    <div class="wl-row ${out ? 'out' : 'in'}" style="animation-delay:${Math.min(i, 8) * 0.04}s">
                        <span class="wl-row-ic"><i data-lucide="${icon}"></i></span>
                        <div class="wl-row-body"><b>${escapeHtml(t.title)}</b><span>${escapeHtml(t.date)}</span></div>
                        <span class="wl-amt" dir="ltr">${escapeHtml(t.amount)}</span>
                    </div>`;
            },

            renderWalletTransactions() {
                const container = document.getElementById('walletTransactionsList');
                if (!container) return;
                container.innerHTML = walletTransactions.length === 0
                    ? '<div class="wl-empty"><div><i data-lucide="receipt"></i></div>لا توجد معاملات بعد — أول إيداع أو استبدال نقاط راح يظهر هنا</div>'
                    : walletTransactions.slice(0, 6).map((t, i) => this.walletTxRow(t, i)).join('');
                lucide.createIcons();
            },

            showAllTransactions() {
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'سجل المعاملات';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                content.innerHTML = walletTransactions.length === 0
                    ? '<div class="wl-empty"><div><i data-lucide="receipt"></i></div>لا توجد معاملات بعد</div>'
                    : '<div class="wl-tx" style="max-height:60vh;overflow-y:auto">' + walletTransactions.map((t, i) => this.walletTxRow(t, i)).join('') + '</div>';
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
            },

            openRedeemCodeModal() {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول');
                    this.goToAuth('login');
                    return;
                }
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'تعبئة بكود';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                content.innerHTML = `
                    <p class="text-xs mb-3 theme-transition" style="color: var(--text2);">أدخل الكود اللي حصلت عليه. كود التعبئة يضيف رصيد، وكود النقاط (يبدأ بـ PT-) يضيف نقاط لحسابك</p>
                    <input type="text" id="topupCodeInput" placeholder="مثال: ABCD-1234-EFGH" class="w-full h-12 px-4 rounded-xl auth-input text-sm mb-3" dir="ltr" style="text-transform: uppercase;">
                    <button id="topupRedeemBtn" onclick="app.redeemTopupCode()" class="w-full h-12 bg-primary text-white rounded-xl font-bold text-sm btn-press">تأكيد الإيداع</button>
                `;
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
            },

            // a points code from the panel (pointCodes/{PT-...} = { points, used }): marked used and the points added in one write
            async _redeemPointCode(code, btn) {
                const reset = () => { if (btn) { btn.disabled = false; btn.textContent = 'تأكيد الإيداع'; } };
                const { ref, get } = window.firebaseDbHelpers, uid = this.currentUid(), path = 'pointCodes/' + code;
                try {
                    const snap = await get(ref(window.firebaseDb, path));
                    if (!snap.exists()) { this.showToast('الكود غير موجود، تأكد من كتابته صح'); reset(); return; }
                    const d = snap.val();
                    if (d.used) { this.showToast('هذا الكود مستخدم مسبقاً'); reset(); return; }
                    const pts = Math.round(Number(d.points) || 0);
                    if (pts < 1) { this.showToast('الكود غير صالح'); reset(); return; }
                    const np = await this.addPointsAtomic(pts, { claim: true, extra: {
                        [path + '/used']: true, [path + '/usedBy']: uid, [path + '/usedAt']: Date.now(), ['users/' + uid + '/pc']: path,
                    } });
                    if (np === null) { this.showToast('هذا الكود مستخدم مسبقاً أو تعذر التحقق منه'); reset(); return; }
                    this.addWalletTransaction({ title: 'نقاط بكود', amount: '+' + pts + ' نقطة', isNegative: false, icon: 'coins', iconColor: '#F59E0B', iconBg: 'bg-warning/10' });
                    this.renderWalletBalance();
                    this.closeWalletModal();
                    this.showToast('تمت إضافة ' + pts.toLocaleString('en-US') + ' نقطة لحسابك');
                } catch (err) {
                    console.warn('Redeem points code failed:', err);
                    this.showToast('تعذر التحقق من الكود — تحقق من اتصالك وحاول مجدداً');
                    reset();
                }
            },

            redeemTopupCode() {
                const input = document.getElementById('topupCodeInput');
                if (!input || !this.currentUser) return;
                const code = input.value.trim().toUpperCase().replace(/\s+/g, '');
                if (!code) {
                    this.showToast('أدخل كود التعبئة');
                    return;
                }
                // FIX: characters like "/", "." or "#" made ref() throw before the promise
                // chain started, leaving the button stuck on "جاري التحقق...".
                if (!/^[A-Z0-9-]{4,24}$/.test(code)) {
                    this.showToast('الكود غير صحيح، تأكد من كتابته صح');
                    return;
                }
                if (!window.firebaseDb) {
                    this.showToast('لا يوجد اتصال بقاعدة البيانات');
                    return;
                }
                if (!this.authUid) {
                    this.showToast('يجب تسجيل الدخول');
                    return;
                }
                const btn = document.getElementById('topupRedeemBtn');
                if (btn) { btn.disabled = true; btn.textContent = 'جاري التحقق...'; }
                if (code.indexOf('PT-') === 0) { this._redeemPointCode(code, btn); return; }
                const { ref, get } = window.firebaseDbHelpers;
                const uid = this.currentUid();
                const codeRef = ref(window.firebaseDb, 'topupCodes/' + code);
                let codeValueIqd = 0;
                get(codeRef).then((snap) => {
                    if (!snap.exists()) {
                        this.showToast('الكود غير موجود، تأكد من كتابته صح');
                        return Promise.reject('handled');
                    }
                    const data = snap.val();
                    if (data.used) {
                        this.showToast('هذا الكود مستخدم مسبقاً');
                        return Promise.reject('handled');
                    }
                    codeValueIqd = Number(data.value) || 0;
                    const usdAmount = codeValueIqd / 1325;
                    // The code is marked used and the balance credited in the same write; the
                    // rules only accept the credit when this code was unused a moment before.
                    return this.addBalanceAtomic(usdAmount, {
                        claim: ['bt', code],
                        extra: {
                            ['topupCodes/' + code + '/used']: true,
                            ['topupCodes/' + code + '/usedBy']: uid,
                            ['topupCodes/' + code + '/usedAt']: Date.now()
                        }
                    }).then((newBalance) => {
                        if (newBalance === null) {
                            this.showToast('هذا الكود مستخدم مسبقاً أو تعذر التحقق منه');
                            if (btn) { btn.disabled = false; btn.textContent = 'تأكيد الإيداع'; }
                            return undefined;
                        }
                        return usdAmount;
                    });
                }).then((usdAmount) => {
                    if (usdAmount === undefined) return;
                    this.addWalletTransaction({
                        title: 'إيداع بكود تعبئة',
                        amount: '+$' + usdAmount.toFixed(2),
                        isNegative: false,
                        icon: 'ticket',
                        iconColor: 'text-success',
                        iconBg: 'bg-success/10'
                    });
                    this.renderWalletBalance();
                    this.closeWalletModal();
                    this.showToast('تم إيداع ' + codeValueIqd.toLocaleString('en-US') + ' د.ع لرصيدك بنجاح');
                }).catch((err) => {
                    if (err !== 'handled') {
                        console.warn('Redeem code failed:', err);
                        this.showToast('تعذر التحقق من الكود — تحقق من اتصالك وحاول مجدداً');
                    }
                    if (btn) { btn.disabled = false; btn.textContent = 'تأكيد الإيداع'; }
                });
            },

            // The wallet has no cash-out: points and balance only live inside the app (store, auction, transfers between friends).
            // The old "withdraw to Mastercard / bank / Zain Cash" screens only took the money off the balance and paid nothing, so they are gone.
            openWithdrawModal() { this.showToast('الرصيد والنقاط تنصرف داخل التطبيق فقط (المتجر والمزاد)'); },
            closeWalletModal() {
                document.getElementById('walletModal')?.classList.add('hidden');
            },

            // ==================== LEADERBOARD ====================
            leaderboardStage: 'all',
            leaderboardPeriod: 'month',
            leaderboardSort: 'points',
            leaderboardQuery: '',

            // ===== Weekly prizes: weeklyPrizes/{week} (the winners, public) and prizeClaims/{uid}/{week} = { pts, rank, c } (mine) =====
            _prizeListen() {
                const uid = this.authUid;
                if (!window.firebaseDb || !uid || this._prizeOn === uid) return;
                (this._prizeOff || []).forEach((f) => { try { f(); } catch (e) {} });
                this._prizeOn = uid; this._prizeMine = {}; this._prizeLast = null;
                const { ref, onValue, query, orderByKey, limitToLast } = window.firebaseDbHelpers, db = window.firebaseDb;
                this._prizeOff = [
                    onValue(query(ref(db, 'weeklyPrizes'), orderByKey(), limitToLast(1)), (snap) => { const v = snap.exists() ? Object.values(snap.val())[0] : null; this._prizeLast = v && Array.isArray(v.winners) ? v : null; this.renderPrizeCard(); }, () => {}),
                    onValue(ref(db, 'prizeClaims/' + uid), (snap) => { this._prizeMine = snap.exists() ? snap.val() : {}; this.renderPrizeCard(); this.updateNotifBadges && this.updateNotifBadges(); }, () => {}),
                ];
            },
            renderPrizeCard() {
                const box = document.getElementById('lbPrizeBox'); if (!box) return;
                const last = this._prizeLast, mine = this._prizeMine || {};
                const open = Object.keys(mine).filter((wk) => mine[wk] && mine[wk].c !== true).sort().reverse();
                if (!last && !open.length) { box.innerHTML = ''; return; }
                const rank = ['الأول', 'الثاني', 'الثالث'];
                const claim = open.map((wk) => `<button class="btn-press w-full mb-2 py-3 rounded-xl text-sm font-bold text-white" style="background: linear-gradient(135deg,#F59E0B,#D97706);" onclick="app.claimPrize(${jsArg(wk)})">فزت بالمركز ${rank[(numOr0(mine[wk].rank) || 1) - 1] || ''} - استلم ${numOr0(mine[wk].pts).toLocaleString('en-US')} نقطة</button>`).join('');
                const list = last ? `<div class="text-xs font-bold mb-2" style="color: var(--text2);">فائزو الأسبوع (يبدأ ${escapeHtml(last.wk)})</div>` + last.winners.slice(0, 3).map((w) => `<div class="flex items-center gap-2 py-1 text-sm" style="color: var(--text);"><b style="min-width:54px">${rank[numOr0(w.rank) - 1] || ''}</b><span class="flex-1 truncate">${escapeHtml(w.n)}</span><span class="text-xs" style="color: var(--text2);">${numOr0(w.pts).toLocaleString('en-US')} نقطة</span></div>`).join('') : '';
                box.innerHTML = `<div class="rounded-2xl p-3 theme-transition" style="background-color: var(--surface); border: 1px solid var(--border);"><div class="flex items-center gap-2 mb-2 font-bold" style="color: var(--text);"><i data-lucide="trophy" class="w-5 h-5" style="color:#F59E0B"></i>جوائز الأسبوع</div>${claim}${list}</div>`;
                try { lucide.createIcons(); } catch (e) {}
            },
            // marks the prize claimed and adds its points in one write (the rules accept it only for this student's own unclaimed prize)
            async claimPrize(wk) {
                const uid = this.authUid, p = (this._prizeMine || {})[wk];
                if (!uid || !p || p.c === true || !/^\d{4}-\d{2}-\d{2}$/.test(String(wk))) return;
                const path = 'prizeClaims/' + uid + '/' + wk, pts = Math.round(Number(p.pts) || 0);
                const np = await this.addPointsAtomic(pts, { claim: true, extra: { [path + '/c']: true, ['users/' + uid + '/pc']: path } });
                if (np === null) { this.showToast('تعذر استلام الجائزة، حاول مرة ثانية'); return; }
                this.addWalletTransaction({ title: 'جائزة الأسبوع', amount: '+' + pts + ' نقطة', isNegative: false, icon: 'trophy', iconColor: '#F59E0B', iconBg: 'bg-warning/10' });
                this.showToast('مبروك! انضافت ' + pts.toLocaleString('en-US') + ' نقطة لحسابك');
            },

            goToLeaderboard() {
                this._prizeListen();
                this.loadLeaderboard();
                this.switchView('leaderboardView');
            },

            listenForLeaderboard() {
                if (!window.firebaseDb || this._leaderboardListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._leaderboardListener = onValue(ref(window.firebaseDb, 'leaderboard'), (snap) => {
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        const myUid = (window.firebaseAuth && window.firebaseAuth.currentUser) ? window.firebaseAuth.currentUser.uid : null;
                        Object.keys(vals).forEach((uid) => {
                            const entry = vals[uid];
                            if (!entry) return;
                            list.push({
                                id: uid,
                                name: entry.name || 'طالب',
                                grade: entry.grade || 'scientific',
                                points: Number(entry.points) || 0,
                                weeklyChange: Number(entry.weeklyChange) || 0,
                                avatar: entry.avatar || '',
                                wm: entry.wm && typeof entry.wm === 'object' ? entry.wm : null,
                                sm: entry.sm && typeof entry.sm === 'object' ? entry.sm : null,
                                isCurrentUser: !!(myUid && myUid === uid)
                            });
                        });
                    }
                    leaderboardStudents.length = 0;
                    leaderboardStudents.push(...list);
                    this._lbGot = true;
                    if (this.currentView === 'leaderboardView') { this.showLeaderboardList(); this.renderLeaderboard(); lucide.createIcons(); }
                });
            },

            loadLeaderboard() {
                this.showLeaderboardLoading();
                setTimeout(() => {
                    if (this.isOnline) {
                        // the list comes with the first answer from the server (see listenForLeaderboard)
                        if (this._lbGot) { this.showLeaderboardList(); this.renderLeaderboard(); }
                    } else {
                        this.showLeaderboardError();
                    }
                    lucide.createIcons();
                }, 800);
                clearTimeout(this._lbWatch);
                this._lbWatch = setTimeout(() => { if (!this._lbGot && this.currentView === 'leaderboardView') this.showLeaderboardError(); }, 20000);
            },

            showLeaderboardList() {
                document.getElementById('leaderboardContent')?.classList.remove('hidden');
                document.getElementById('leaderboardStates')?.classList.add('hidden');
                document.getElementById('leaderboardLoadingState')?.classList.add('hidden');
                document.getElementById('leaderboardEmptyState')?.classList.add('hidden');
                document.getElementById('leaderboardErrorState')?.classList.add('hidden');
            },
            showLeaderboardLoading() {
                document.getElementById('leaderboardContent')?.classList.add('hidden');
                document.getElementById('leaderboardStates')?.classList.remove('hidden');
                document.getElementById('leaderboardLoadingState')?.classList.remove('hidden');
                document.getElementById('leaderboardEmptyState')?.classList.add('hidden');
                document.getElementById('leaderboardErrorState')?.classList.add('hidden');
            },
            showLeaderboardEmpty() {
                document.getElementById('leaderboardContent')?.classList.add('hidden');
                document.getElementById('leaderboardStates')?.classList.remove('hidden');
                document.getElementById('leaderboardLoadingState')?.classList.add('hidden');
                document.getElementById('leaderboardEmptyState')?.classList.remove('hidden');
                document.getElementById('leaderboardErrorState')?.classList.add('hidden');
            },
            showLeaderboardError() {
                document.getElementById('leaderboardContent')?.classList.add('hidden');
                document.getElementById('leaderboardStates')?.classList.remove('hidden');
                document.getElementById('leaderboardLoadingState')?.classList.add('hidden');
                document.getElementById('leaderboardEmptyState')?.classList.add('hidden');
                document.getElementById('leaderboardErrorState')?.classList.remove('hidden');
            },

            renderLeaderboard() {
                this.renderLeaderboardTabs();
                this.renderLeaderboardPodium();
                this.renderLeaderboardMe();
                this.renderLeaderboardChampion();
                const hp = document.getElementById('lbHoursPeriod');
                if (hp) { hp.classList.toggle('hidden', this.leaderboardSort !== 'hours'); hp.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.p === this.leaderboardHoursPeriod)); }
                this.renderLeaderboardList();
            },

            renderLeaderboardTabs() {
                const base = this.getLeaderboardBaseList();
                document.querySelectorAll('.lb-stage-tab').forEach(tab => {
                    tab.classList.toggle('on', tab.dataset.stage === this.leaderboardStage);
                    const countEl = tab.querySelector('.lb-count');
                    if (countEl) countEl.textContent = tab.dataset.stage === 'all' ? base.length : base.filter(s => s.grade === tab.dataset.stage).length;
                });
                document.querySelectorAll('.lb-sort-tab').forEach(tab => tab.classList.toggle('on', tab.dataset.sort === this.leaderboardSort));
            },

            // Everyone from the live leaderboard + the signed-in student's own (freshest) entry.
            getLeaderboardBaseList() {
                const mine = leaderboardStudents.find(s => s.isCurrentUser) || {};
                const list = leaderboardStudents.filter(s => !s.isCurrentUser);
                if (this.isLoggedIn && this.currentUser && typeof this.currentUser.points === 'number') {
                    list.push({
                        id: 'current-user',
                        name: this.currentUser.fullName || 'أنا',
                        grade: this.currentUser.grade || 'scientific',
                        points: numOr0(this.currentUser.points),
                        weeklyChange: numOr0(this.currentUser.weeklyChange),
                        wm: mine.wm || null, sm: mine.sm || null,
                        isCurrentUser: true,
                        avatar: this.currentUser.avatar || '',
                        studentNumber: this.currentUser.studentNumber || ''
                    });
                }
                return list;
            },

            // Ranked by points within the chosen stage (ties keep a stable order).
            getLeaderboardRanked() {
                let list = this.getLeaderboardBaseList();
                if (this.leaderboardStage !== 'all') list = list.filter(s => s.grade === this.leaderboardStage);
                const hours = this.leaderboardSort === 'hours';
                const wk = this._weekKey(), sn = this._lbSeason();
                list = list.map(s => ({ ...s, wmin: numOr0(s.wm && s.wm[wk]), smin: numOr0(s.sm && s.sm[sn]) }));
                const val = (s) => hours ? (this.leaderboardHoursPeriod === 'season' ? s.smin : s.wmin) : s.points;
                return list.map(s => ({ ...s, _v: val(s) }))
                    .sort((a, b) => (b._v - a._v) || (b.points - a.points) || String(a.name).localeCompare(String(b.name), 'ar'))
                    .map((s, i) => ({ ...s, rank: i + 1 }));
            },

            // ----- study hours: this week / this season (a season is a calendar month) -----
            leaderboardHoursPeriod: 'week',
            _lbSeason(d) { const x = new Date(d || Date.now()); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); },
            _lbPrevSeason() { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - 1); return this._lbSeason(x); },
            _lbSeasonName(key) { const m = Number(String(key).slice(5, 7)); return ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'][m - 1] || ''; },
            _lbFmtMin(m) { m = Math.max(0, Math.round(m || 0)); const h = Math.floor(m / 60), r = m % 60; return h ? (h + ' س' + (r ? ' ' + r + ' د' : '')) : (r + ' د'); },
            _lbFmt(s) { return this.leaderboardSort === 'hours' ? this._lbFmtMin(s._v) : s.points.toLocaleString('en-US') + ' نقطة'; },
            // the winner of the season that just ended, and who leads the current one
            _lbChampions() {
                const base = this.getLeaderboardBaseList();
                const best = (key) => base.map(s => ({ s, m: numOr0(s.sm && s.sm[key]) })).filter(x => x.m > 0)
                    .sort((a, b) => (b.m - a.m) || String(a.s.name).localeCompare(String(b.s.name), 'ar'))[0] || null;
                const prevKey = this._lbPrevSeason(), curKey = this._lbSeason();
                return { prevKey, curKey, prev: best(prevKey), cur: best(curKey) };
            },
            renderLeaderboardChampion() {
                const box = document.getElementById('lbChampion');
                if (!box) return;
                const c = this._lbChampions();
                if (!c.prev && !c.cur) { box.innerHTML = ''; return; }
                const row = (x, label, key) => x ? `<div class="lb-champ-row" onclick="app.openAuthorProfileFromLeaderboard(${jsArg(x.s.id)})">
                    <img src="${personAvatarSrc(x.s.avatar, x.s.name)}" alt="">
                    <div><small>${label} ${this._lbSeasonName(key)}</small><b>${escapeHtml(x.s.name)}</b></div>
                    <span>${this._lbFmtMin(x.m)}</span></div>` : '';
                box.innerHTML = `<section class="lb-champ"><div class="lb-champ-h"><i data-lucide="crown"></i><b>بطل الموسم</b><small>أكثر ساعات دراسة بالشهر</small></div>
                    ${row(c.prev, 'بطل موسم', c.prevKey) || '<div class="lb-champ-none">أول بطل يتوج بنهاية هذا الشهر</div>'}
                    ${row(c.cur, 'المتصدر الآن بموسم', c.curKey)}</section>`;
            },
            setLeaderboardHoursPeriod(p) {
                this.leaderboardHoursPeriod = p === 'season' ? 'season' : 'week';
                this.renderLeaderboard();
                lucide.createIcons();
            },
            // adds real study minutes to this week's and this season's public totals (self-reported, capped by the rules)
            _lbStudy(minutes) {
                const uid = this.authUid, m = Math.round(Math.min(300, minutes || 0));
                if (!uid || !window.firebaseDb || m <= 0) return;
                const { ref, runTransaction } = window.firebaseDbHelpers;
                const bump = (node, key, keep) => runTransaction(ref(window.firebaseDb, 'leaderboard/' + uid + '/' + node), (cur) => {
                    const o = cur && typeof cur === 'object' ? { ...cur } : {};
                    o[key] = numOr0(o[key]) + m;
                    Object.keys(o).sort().reverse().slice(keep).forEach((k) => { delete o[k]; });
                    return o;
                }).catch(() => {});
                bump('wm', this._weekKey(), 6);
                bump('sm', this._lbSeason(), 4);
            },

            getLeaderboardStudents() {
                let list = this.getLeaderboardRanked();
                const q = this.leaderboardQuery.trim();
                if (q) list = list.filter(s => String(s.name || '').includes(q));
                if (this.leaderboardSort === 'improvement') list = [...list].sort((a, b) => (b.weeklyChange - a.weeklyChange) || (a.rank - b.rank));
                return list;
            },

            renderLeaderboardPodium() {
                const podium = document.getElementById('leaderboardPodium');
                if (!podium) return;
                const top = this.getLeaderboardRanked().slice(0, 3);
                if (top.length === 0) {
                    podium.innerHTML = '<div class="lb-podium-empty"><i data-lucide="trophy"></i>ما كو طلاب بالترتيب بعد — اكسب نقاط وكن الأول!</div>';
                    lucide.createIcons();
                    return;
                }
                const col = (s) => `
                    <div class="lb-col r${s.rank}${s.isCurrentUser ? ' is-me' : ''}" onclick="app.openAuthorProfileFromLeaderboard(${jsArg(s.id)})">
                        <div class="lb-ava">
                            ${s.rank === 1 ? '<span class="lb-crown" aria-hidden="true"><i data-lucide="crown"></i></span>' : ''}
                            <img src="${personAvatarSrc(s.avatar, s.name)}" alt="${escapeHtml(s.name)}">
                            <span class="lb-medal">${s.rank}</span>
                        </div>
                        <div class="lb-name">${escapeHtml(s.name)}${this.vb(s.id)}</div>
                        <div class="lb-pts">${this._lbFmt(s)}</div>
                        <div class="lb-step">${s.rank}</div>
                    </div>`;
                // visual order: 2nd · 1st · 3rd (RTL puts the first child on the right)
                const order = [top[1], top[0], top[2]].filter(Boolean);
                podium.innerHTML = `<div class="lb-podium">${order.map(col).join('')}</div>`;
                lucide.createIcons();
            },

            // "Where am I" card: my rank, points and how far the next student is.
            renderLeaderboardMe() {
                const box = document.getElementById('lbMe');
                if (!box) return;
                if (!this.isLoggedIn || !this.currentUser) {
                    box.innerHTML = `<div class="lb-me"><div class="lb-me-rank"><small>ترتيبك</small><b>؟</b></div>
                        <div class="lb-me-body"><b>سجّل دخولك وشوف ترتيبك</b><span>اكسب نقاط من المذاكرة والتحديات اليومية</span></div>
                        <button class="lb-me-cta" onclick="app.goToAuth('login')">دخول</button></div>`;
                    return;
                }
                const ranked = this.getLeaderboardRanked();
                const me = ranked.find(s => s.isCurrentUser);
                if (!me) { box.innerHTML = ''; return; }
                const ahead = ranked[me.rank - 2];
                let line, pct;
                if (!ahead) { line = 'أنت بالمركز الأول — حافظ على صدارتك'; pct = 100; }
                else {
                    const gap = Math.max(1, ahead._v - me._v + 1);
                    line = this.leaderboardSort === 'hours' ? `باقي ${this._lbFmtMin(gap)} وتتجاوز ${escapeHtml(ahead.name)}` : `باقي ${gap.toLocaleString('en-US')} نقطة وتتجاوز ${escapeHtml(ahead.name)}`;
                    pct = ahead._v > 0 ? Math.max(4, Math.min(100, (me._v / ahead._v) * 100)) : 100;
                }
                box.innerHTML = `<div class="lb-me">
                    <div class="lb-me-rank"><small>ترتيبك</small><b>#${me.rank}</b></div>
                    <div class="lb-me-body"><b>${this._lbFmt(me)} · من ${ranked.length} طالب</b><span>${line}</span>
                        <div class="lb-me-bar"><i style="--w:${pct.toFixed(1)}%"></i></div></div>
                </div>`;
            },

            renderLeaderboardList() {
                const container = document.getElementById('leaderboardListState');
                if (!container) return;
                const q = this.leaderboardQuery.trim();
                let students = this.getLeaderboardStudents();
                // the podium already shows the top 3 in the default view
                const hideTop = !q && this.leaderboardSort !== 'improvement';
                if (hideTop) students = students.filter(s => s.rank > 3);
                const titleEl = document.getElementById('lbListTitle');
                if (titleEl) titleEl.textContent = q ? 'نتائج البحث' : (this.leaderboardSort === 'improvement' ? 'الأكثر تحسناً هذا الأسبوع' : this.leaderboardSort === 'hours' ? (this.leaderboardHoursPeriod === 'season' ? 'الأكثر دراسة هذا الموسم' : 'الأكثر دراسة هذا الأسبوع') : 'باقي الترتيب');
                const countEl = document.getElementById('leaderboardCount');
                const total = this.getLeaderboardRanked().length;
                if (countEl) countEl.textContent = total + ' طالب';
                if (q && students.length === 0) { this.showLeaderboardEmpty(); return; }
                this.showLeaderboardList();
                if (students.length === 0) {
                    setTimeout(() => lucide.createIcons(), 0);
                    container.innerHTML = `<div class="hp-empty" style="padding:18px"><div><i data-lucide="users"></i></div>${total ? 'كل الطلاب ظاهرين بالمنصة فوق' : 'ما كو طلاب بعد'}</div>`;
                    return;
                }
                const leader = Math.max(1, ...this.getLeaderboardRanked().slice(0, 1).map(s => s._v));
                container.innerHTML = students.slice(0, 100).map((s, i) => this.createStudentCard(s, i, leader)).join('');
            },

            createStudentCard(s, i, leader) {
                const rings = ['linear-gradient(135deg,#FDE68A,#F59E0B)', 'linear-gradient(135deg,#E2E8F0,#94A3B8)', 'linear-gradient(135deg,#FDBA74,#B45309)'];
                const chg = s.weeklyChange;
                const chgCls = chg > 0 ? 'up' : (chg < 0 ? 'down' : 'flat');
                const chgTxt = chg > 0 ? '▲ ' + chg.toLocaleString('en-US') : (chg < 0 ? '▼ ' + Math.abs(chg).toLocaleString('en-US') : '—');
                const pct = Math.max(3, Math.min(100, (s._v / (leader || 1)) * 100));
                const hoursMode = this.leaderboardSort === 'hours';
                return `
                    <div class="lb-row${s.isCurrentUser ? ' is-me' : ''}${s.rank <= 3 ? ' top' : ''}" style="animation-delay:${Math.min(i, 12) * 0.04}s;${s.rank <= 3 ? '--ring:' + rings[s.rank - 1] : ''}" onclick="app.openAuthorProfileFromLeaderboard(${jsArg(s.id)})">
                        <span class="lb-rank">${s.rank}</span>
                        <img src="${personAvatarSrc(s.avatar, s.name)}" alt="${escapeHtml(s.name)}" loading="lazy">
                        <div class="lb-row-body">
                            <div class="lb-row-name"><span>${escapeHtml(s.name)}${s.isCurrentUser ? ' (أنت)' : ''}</span>${this.vb(s.id)}<span class="lb-grade">${s.grade === 'literary' ? 'أدبي' : 'علمي'}</span></div>
                            <div class="lb-row-bar"><i style="--w:${pct.toFixed(1)}%"></i></div>
                        </div>
                        <div class="lb-row-end">
                            <span class="lb-row-pts">${hoursMode ? this._lbFmtMin(s._v) : s.points.toLocaleString('en-US') + ' <small>نقطة</small>'}</span>
                            ${hoursMode ? `<span class="lb-chg flat">${s.points.toLocaleString('en-US')} نقطة</span>` : `<span class="lb-chg ${chgCls}" title="تغيّر هذا الأسبوع">${chgTxt}</span>`}
                        </div>
                    </div>`;
            },

            setLeaderboardStage(stage) {
                this.leaderboardStage = stage;
                this.renderLeaderboard();
                lucide.createIcons();
            },

            setLeaderboardPeriod(period) {
                this.leaderboardPeriod = period;
                this.renderLeaderboard();
                lucide.createIcons();
            },

            setLeaderboardSort(sort) {
                this.leaderboardSort = sort;
                this.renderLeaderboard();
                lucide.createIcons();
            },

            handleLeaderboardSearch(query) {
                this.leaderboardQuery = query || '';
                this.renderLeaderboard();
                lucide.createIcons();
            },

            resetLeaderboardSearch() {
                this.leaderboardQuery = '';
                const input = document.getElementById('leaderboardSearchInput');
                if (input) input.value = '';
                this.showLeaderboardList();
                this.renderLeaderboard();
                lucide.createIcons();
            },

            // ==================== TRANSFER ====================
            transferReceiver: null,

            openTransferModal() {
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'تحويل الرصيد';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                this.transferReceiver = null;
                content.innerHTML = `
                    <div class="flex flex-col gap-3">
                        <label class="text-sm font-bold theme-transition" style="color: var(--text);">أدخل الرقم التعريفي للطالب (5 أرقام)</label>
                        <div class="flex gap-2">
                            <input type="text" id="transferSearchInput" inputmode="numeric" maxlength="5" placeholder="مثال: 48321"
                                class="flex-1 h-12 px-4 rounded-xl auth-input text-sm" dir="ltr">
                            <button onclick="app.searchTransferStudent()" class="btn-press px-5 h-12 bg-primary text-white rounded-xl font-bold text-sm flex items-center gap-2 flex-shrink-0">
                                <i data-lucide="search" class="w-4 h-4"></i>بحث
                            </button>
                        </div>
                        <div id="transferResult"></div>
                    </div>
                `;
                document.getElementById('walletModal').classList.remove('hidden');
                lucide.createIcons();
            },

            async searchTransferStudent() {
                const input = document.getElementById('transferSearchInput');
                const result = document.getElementById('transferResult');
                if (!input || !result) return;
                const query = (input.value || '').trim();
                if (!/^\d{5}$/.test(query)) {
                    result.innerHTML = '<p class="text-xs font-bold text-error">الرجاء إدخال رقم تعريفي مكوّن من 5 أرقام</p>';
                    return;
                }
                if (!this.isLoggedIn || !this.currentUser) {
                    result.innerHTML = '<p class="text-xs font-bold text-error">يجب تسجيل الدخول أولاً</p>';
                    return;
                }
                if (query === String(this.currentUser.studentNumber)) {
                    result.innerHTML = '<p class="text-xs font-bold text-error">لا يمكن التحويل إلى نفسك</p>';
                    return;
                }
                if (!window.firebaseDb) {
                    result.innerHTML = '<p class="text-xs font-bold text-error">لا يوجد اتصال بقاعدة البيانات</p>';
                    return;
                }
                result.innerHTML = `
                    <div class="flex items-center justify-center gap-2 py-3">
                        <i data-lucide="loader-2" class="w-5 h-5 animate-spin" style="color: rgb(var(--p));"></i>
                        <span class="text-sm theme-transition" style="color: var(--text2);">جاري البحث عن الطالب...</span>
                    </div>`;
                lucide.createIcons();
                try {
                    const hit = await this.findStudentByNumber(query);
                    const found = hit ? hit.data : null;
                    const foundUid = hit ? hit.uid : null;
                    if (!found) {
                        result.innerHTML = `
                            <div class="rounded-xl border border-error/30 bg-error/10 p-3 text-center">
                                <p class="text-xs font-bold text-error">لم يتم العثور على طالب بهذا الرقم التعريفي</p>
                            </div>`;
                        return;
                    }
                    this.transferReceiver = { uid: foundUid, data: found };
                    result.innerHTML = `
                        <div class="rounded-xl border p-3 theme-transition" style="background-color: var(--surface); border-color: var(--border);">
                            <div class="flex items-center gap-3">
                                <img src="${safeImage(found.avatar) !== FALLBACK_IMAGE ? found.avatar : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(found.fullName || 'Student') + '&background=2563EB&color=fff&size=200'}" alt="${escapeHtml(found.fullName || '')}" class="w-12 h-12 rounded-full object-cover flex-shrink-0">
                                <div class="flex-1 min-w-0">
                                    <div class="text-sm font-bold theme-transition" style="color: var(--text);">${escapeHtml(found.fullName || 'طالب')}</div>
                                    <div class="text-xs theme-transition" style="color: var(--text2);">${escapeHtml(found.governorate || '—')} • رقم: ${escapeHtml(found.studentNumber || '—')}</div>
                                </div>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <input type="number" id="transferAmountInput" min="1" step="0.01" placeholder="المبلغ $"
                                class="flex-1 h-12 px-4 rounded-xl auth-input text-sm" dir="ltr">
                            <button onclick="app.confirmTransfer()" class="btn-press px-5 h-12 bg-primary text-white rounded-xl font-bold text-sm flex items-center gap-2 flex-shrink-0">
                                <i data-lucide="send" class="w-4 h-4"></i>تحويل
                            </button>
                        </div>`;
                    lucide.createIcons();
                } catch (err) {
                    console.warn('Transfer search failed:', err);
                    result.innerHTML = '<p class="text-xs font-bold text-error">تعذر البحث، تحقق من الاتصال وحاول مجدداً</p>';
                }
            },

            // FIX: this used to subtract the same USD `amount` from BOTH `balance` and
            // `points` on each side, treating points and dollars as a 1:1 currency even
            // though the rest of the app relates them very differently (e.g. 5,000 points
            // = 500 IQD ≈ $0.38 in the points store). A wallet transfer now only moves
            // `balance` — points are left untouched, since this is a money transfer, not a
            // points transfer.
            confirmTransfer() {
                const amountInput = document.getElementById('transferAmountInput');
                const content = document.getElementById('walletModalContent');
                if (!amountInput || !content) return;
                if (!this.transferReceiver) {
                    this.showToast('ابحث عن الطالب أولاً');
                    return;
                }
                const amount = Math.round(parseFloat(amountInput.value) * 100) / 100;
                if (isNaN(amount) || amount <= 0) {
                    this.showToast('أدخل مبلغاً صحيحاً أكبر من صفر');
                    return;
                }
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول أولاً');
                    return;
                }
                const senderUid = this.currentUid();
                const receiver = this.transferReceiver;
                if (senderUid === receiver.uid) {
                    this.showToast('لا يمكن التحويل إلى نفسك');
                    return;
                }
                if (!window.firebaseDb || !window.firebaseAuth || !window.firebaseAuth.currentUser) {
                    this.showToast('لا يوجد اتصال موثوق بقاعدة البيانات');
                    return;
                }
                const { serverTimestamp } = window.firebaseDbHelpers;
                const transactionId = 'tr_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
                content.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-6 text-center">
                        <i data-lucide="loader-2" class="w-10 h-10 animate-spin mb-3" style="color: rgb(var(--p));"></i>
                        <p class="text-sm theme-transition" style="color: var(--text2);">جاري تنفيذ التحويل...</p>
                    </div>`;
                lucide.createIcons();

                const finishFailure = (err) => {
                    if (err) console.warn('Transfer failed:', err);
                    content.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-6 text-center">
                            <div class="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center mb-3">
                                <i data-lucide="alert-triangle" class="w-7 h-7 text-error"></i>
                            </div>
                            <h4 class="font-bold mb-1 theme-transition" style="color: var(--text);">فشل التحويل</h4>
                            <p class="text-sm mb-4 theme-transition" style="color: var(--text2);">${err ? 'حدث خطأ أثناء التحويل، لم يُخصم أي مبلغ' : 'رصيدك غير كافٍ لهذا التحويل'}</p>
                            <button onclick="app.closeWalletModal()" class="px-10 py-2.5 bg-primary text-white rounded-xl font-medium btn-press">إغلاق</button>
                        </div>`;
                    lucide.createIcons();
                };

                // The sender only takes money out of their own balance and, in the same write,
                // leaves it in incoming/{receiver}; the receiver's app adds it to their own
                // balance (claimIncoming), so nobody ever writes someone else's balance.
                const senderName = String(this.currentUser.fullName || 'طالب').slice(0, 60);
                this.addBalanceAtomic(-amount, {
                    reject: true,
                    extra: {
                        ['incoming/' + receiver.uid + '/' + transactionId]: { from: senderUid, name: senderName, amount, at: Date.now(), claimed: false },
                        ['transfers/' + transactionId]: { from: senderUid, to: receiver.uid, amount, createdAt: serverTimestamp() },
                        ['users/' + senderUid + '/bs']: transactionId
                    }
                }).then((newBalance) => {
                    if (newBalance === null) { finishFailure(null); return; }
                    this.addWalletTransaction({
                        title: 'تحويل إلى ' + (receiver.data.fullName || 'طالب'),
                        amount: '-$' + amount.toFixed(2),
                        isNegative: true,
                        icon: 'send',
                        iconColor: 'text-error',
                        iconBg: 'bg-error/10'
                    });
                    this.renderWalletBalance();
                    this.transferReceiver = null;
                    content.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-6 text-center">
                            <div class="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mb-3">
                                <i data-lucide="check" class="w-7 h-7 text-success"></i>
                            </div>
                            <h4 class="font-bold mb-1 theme-transition" style="color: var(--text);">تم التحويل بنجاح</h4>
                            <p class="text-sm mb-4 theme-transition" style="color: var(--text2);">تم خصم $${amount.toFixed(2)} من رصيدك وإضافتها إلى ${escapeHtml(receiver.data.fullName || 'الطالب')}</p>
                            <button onclick="app.closeWalletModal()" class="px-10 py-2.5 bg-primary text-white rounded-xl font-medium btn-press">حسناً</button>
                        </div>`;
                    lucide.createIcons();
                    this.showToast('تم التحويل بنجاح');
                }).catch((err) => finishFailure(err || 'error'));
            },

            // Adds transfers waiting in incoming/{me} to my balance, each one once.
            listenForIncoming() {
                if (!window.firebaseDb || !this.authUid || this._incomingListener) return;
                const { ref, onChildAdded } = window.firebaseDbHelpers;
                const me = this.authUid;
                this._incomingListener = onChildAdded(ref(window.firebaseDb, 'incoming/' + me), (snap) => {
                    const t = snap.val(), id = snap.key;
                    if (!t || t.claimed || !(numOr0(t.amount) > 0)) return;
                    this._incomingBusy = this._incomingBusy || {};
                    if (this._incomingBusy[id]) return;
                    this._incomingBusy[id] = true;
                    const amount = numOr0(t.amount);
                    this.addBalanceAtomic(amount, { claim: ['bi', id], extra: { ['incoming/' + me + '/' + id + '/claimed']: true } }).then((nb) => {
                        if (nb === null || this.authUid !== me) return;
                        this.addWalletTransaction({
                            title: 'تحويل من ' + String(t.name || 'طالب').slice(0, 60),
                            amount: '+$' + amount.toFixed(2),
                            isNegative: false,
                            icon: 'download',
                            iconColor: 'text-success',
                            iconBg: 'bg-success/10'
                        });
                        if (this.currentView === 'walletView') this.renderWalletBalance();
                        this.showToast('وصلك تحويل $' + amount.toFixed(2) + ' من ' + String(t.name || 'طالب').slice(0, 60));
                    });
                });
            },

            // ==================== FORUM ====================
            // The page itself (feed, tabs, composer, thread, best answer, votes) is js/forum.js. Here is only
            // the live list of the newest posts it reads, started when the page opens.
            goToForum() {
                this.switchView('forumView');
                if (this._withPart('forum', () => typeof this.fmOpen === 'function', 'forumView', () => this.goToForum())) return;
                this.fmOpen();
            },

            listenForForumThreads() {
                if (!window.firebaseDb || this._forumListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                const { query, orderByKey, limitToLast } = window.firebaseDbHelpers;
                this._forumListener = onValue(query(ref(window.firebaseDb, 'forumThreads'), orderByKey(), limitToLast(40)), (snap) => {
                    const list = snap.exists() ? withNumericIds(Object.values(snap.val())) : [];
                    list.sort((a, b) => b.id - a.id);
                    forumThreads.length = 0;
                    forumThreads.push(...list);
                    this._forumGot = true;
                    if (this.currentView === 'forumView' && this.fmRender) this.fmRender();
                    if (this.currentView === 'forumThreadView' && this.fmThreadRender) this.fmThreadRender();
                });
            },

            openProfileFromChatsList(uid) {
                if (!uid) return;
                const found = userChatsList.find(c => c.otherUid === uid);
                if (!found) return;
                this.openAuthorProfile(uid, found.otherName, found.otherAvatar, found.otherStudentNumber);
            },

            openProfileFromFriendsList(uid) {
                if (!uid) return;
                let found = friendsList.find(f => f.uid === uid);
                if (found) { this.openAuthorProfile(uid, found.name, found.avatar, found.studentNumber); return; }
                found = incomingFriendRequests.find(r => r.fromUid === uid);
                if (found) { this.openAuthorProfile(uid, found.fromName, found.fromAvatar, found.fromStudentNumber); return; }
                found = sentFriendRequestsList.find(r => r.toUid === uid || r.uid === uid);
                if (found) { this.openAuthorProfile(uid, found.toName || found.name, found.toAvatar || found.avatar, found.toStudentNumber || found.studentNumber); return; }
                found = blockedUsersList.find(b => b.uid === uid);
                if (found) { this.openAuthorProfile(uid, found.name, found.avatar, found.studentNumber); return; }
            },

            openAuthorProfileFromLeaderboard(uid) {
                if (!uid) return;
                const realUid = uid === 'current-user' ? this.authUid : uid;
                if (!realUid) return;
                const student = this.getLeaderboardBaseList().find(s => s.id === uid);
                if (!student) return;
                this.openAuthorProfile(realUid, student.name, student.avatar, student.studentNumber);
            },

            openAuthorProfileFromThread(threadId) {
                const t = forumThreads.find(x => x.id === threadId);
                if (!t) return;
                this.openAuthorProfile(t.authorUid, t.authorName, t.authorAvatar, t.authorStudentNumber);
            },

            openAuthorProfileFromAnswer(threadId, answerId) {
                const list = forumAnswers[threadId] || [];
                const a = list.find(x => x.id === answerId);
                if (!a) return;
                this.openAuthorProfile(a.authorUid, a.authorName, a.authorAvatar, a.authorStudentNumber);
            },

            openAuthorProfile(uid, name, avatar, studentNumber) {
                if (!uid) return;
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'الملف الشخصي';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                const isMe = uid === this.authUid;
                const status = isMe ? 'me' : (this.isBlocked(uid) ? 'blocked' : this.getFriendStatus(uid));
                let actionHtml = '';
                if (isMe) {
                    actionHtml = '';
                } else if (status === 'blocked') {
                    actionHtml = `<button onclick="app.unblockUser(${jsArg(uid)})" class="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-error theme-transition btn-press" style="background-color: var(--input-bg);"><i data-lucide="ban" class="w-4 h-4"></i>محظور — رفع الحظر</button>`;
                } else if (status === 'friends') {
                    actionHtml = `
                        <div class="flex flex-col gap-2">
                            <button onclick="app.closeWalletModal(); app.openChat(${jsArg(uid)})" class="w-full h-11 bg-primary text-white rounded-xl font-bold text-sm btn-press flex items-center justify-center gap-2"><i data-lucide="message-circle" class="w-4 h-4"></i>دردشة</button>
                            <div class="flex gap-2">
                                <button onclick="app.removeFriend(${jsArg(uid)})" class="flex-1 h-10 rounded-xl font-bold text-xs theme-transition btn-press" style="background-color: var(--input-bg); color: var(--text2);">إلغاء الصداقة</button>
                                <button onclick="app.blockUser(${jsArg(uid)})" class="flex-1 h-10 rounded-xl font-bold text-xs text-error btn-press" style="background-color: var(--input-bg);">حظر</button>
                            </div>
                        </div>`;
                } else if (status === 'sent') {
                    actionHtml = `<div class="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-bold theme-transition" style="background-color: var(--input-bg); color: var(--text2);"><i data-lucide="clock" class="w-4 h-4"></i>بانتظار الرد</div>`;
                } else if (status === 'incoming') {
                    actionHtml = `
                        <div class="flex gap-2">
                            <button onclick="app.acceptFriendRequest(${jsArg(uid)})" class="flex-1 h-11 bg-primary text-white rounded-xl font-bold text-sm btn-press">قبول الصداقة</button>
                            <button onclick="app.rejectFriendRequest(${jsArg(uid)})" class="flex-1 h-11 rounded-xl font-bold text-sm theme-transition btn-press" style="background-color: var(--input-bg); color: var(--text2);">رفض</button>
                        </div>`;
                } else {
                    actionHtml = `<button onclick="app.sendFriendRequestTo(${jsArg(uid)})" class="w-full h-11 bg-primary text-white rounded-xl font-bold text-sm btn-press flex items-center justify-center gap-2"><i data-lucide="user-plus" class="w-4 h-4"></i>إضافة صديق</button>`;
                }
                content.innerHTML = `
                    <div class="flex flex-col items-center text-center py-2">
                        <img src="${personAvatarSrc(avatar, name)}" class="w-20 h-20 rounded-full object-cover mb-3">
                        <div class="text-base font-bold theme-transition" style="color: var(--text);">${escapeHtml(name || 'طالب')}${this.vb(uid, 'md')}</div>
                        ${this.isVerified(uid) ? '<div class="vb-note">حساب موثّق</div>' : ''}
                        ${studentNumber ? `<div class="text-xs mt-1 theme-transition" style="color: var(--text2);">رقم: ${escapeHtml(studentNumber)}</div>` : ''}
                        <div class="w-full mt-4">${actionHtml}</div>
                        ${isMe ? '' : `<button onclick="app.reportContent({ type: 'user', targetUid: ${jsArg(uid)}, snippet: ${jsArg(name || 'طالب')} })" class="rp-link"><i data-lucide="flag" class="w-3.5 h-3.5"></i>إبلاغ عن هذا الطالب</button>`}
                    </div>
                `;
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
                this._pendingProfileTarget = { uid, name, avatar, studentNumber };
            },

            // ==================== FRIENDS ====================
            getFriendStatus(uid) {
                if (friendsList.some(f => f.uid === uid)) return 'friends';
                if (incomingFriendRequests.some(r => r.fromUid === uid)) return 'incoming';
                if (this.sentFriendRequests[uid]) return 'sent';
                return 'none';
            },

            sendFriendRequestTo(uid) {
                if (!this._pendingProfileTarget || this._pendingProfileTarget.uid !== uid) return;
                const t = this._pendingProfileTarget;
                this.closeWalletModal();
                this.sendFriendRequest(t.uid, t.name, t.avatar, t.studentNumber);
            },

            sendFriendRequest(uid, name, avatar, studentNumber) {
                if (!window.firebaseDb || !this.authUid || !this.isLoggedIn) {
                    this.showToast('يجب تسجيل الدخول لإضافة أصدقاء');
                    return;
                }
                if (uid === this.authUid) {
                    this.showToast('ما تكدر تضيف نفسك');
                    return;
                }
                if (this.isBlocked(uid)) {
                    this.showToast('هذا المستخدم محظور من طرفك');
                    return;
                }
                const { ref, set, get } = window.firebaseDbHelpers;
                get(ref(window.firebaseDb, 'blockedUsers/' + uid + '/' + this.authUid)).then((blockedSnap) => {
                    if (blockedSnap.exists()) {
                        this.showToast('لا يمكن إرسال طلب صداقة لهذا المستخدم');
                        return;
                    }
                    const payload = {
                        fromUid: this.authUid,
                        fromName: this.currentUser.fullName || 'طالب',
                        fromAvatar: this._avatarLite(),
                        fromStudentNumber: this.currentUser.studentNumber || '',
                        createdAt: Date.now()
                    };
                    const sentPayload = { toUid: uid, toName: name || 'طالب', toAvatar: avatar || '', toStudentNumber: studentNumber || '', createdAt: Date.now() };
                    set(ref(window.firebaseDb, 'friendRequests/' + uid + '/' + this.authUid), payload).then(() => {
                        set(ref(window.firebaseDb, 'sentFriendRequests/' + this.authUid + '/' + uid), sentPayload).catch(() => {});
                        this.sentFriendRequests[uid] = true;
                        this.showToast('تم إرسال طلب الصداقة');
                    }).catch((err) => {
                        console.warn('Send friend request failed:', err);
                        this.showToast('تعذر إرسال الطلب');
                    });
                }).catch((err) => {
                    console.warn('Block check failed:', err);
                    this.showToast('تعذر إرسال الطلب');
                });
            },

            cancelFriendRequest(uid) {
                if (!window.firebaseDb || !this.authUid) return;
                const { ref, remove } = window.firebaseDbHelpers;
                Promise.all([
                    remove(ref(window.firebaseDb, 'friendRequests/' + uid + '/' + this.authUid)),
                    remove(ref(window.firebaseDb, 'sentFriendRequests/' + this.authUid + '/' + uid))
                ]).then(() => {
                    this.showToast('تم إلغاء الطلب');
                    if (this.currentView === 'friendsView') this.searchAddFriendStudent();
                }).catch((err) => {
                    console.warn('Cancel request failed:', err);
                    this.showToast('تعذر إلغاء الطلب');
                });
            },

            // FIX: Firebase's set()/update() reject the write outright if any field is
            // `undefined` (it must be `null` or simply omitted). If neither the incoming
            // request list nor the profile-card target had the sender's avatar/studentNumber
            // loaded yet (a narrow timing window), `avatar`/`studentNumber` fell through to
            // `undefined` here and the whole "accept friend request" write failed with a
            // generic error even though nothing was actually wrong. Defaulting them to '' any
            // time they'd otherwise be missing keeps the write valid.
            acceptFriendRequest(fromUid) {
                if (!window.firebaseDb || !this.authUid) return;
                const req = incomingFriendRequests.find(r => r.fromUid === fromUid);
                const pending = (this._pendingProfileTarget && this._pendingProfileTarget.uid === fromUid) ? this._pendingProfileTarget : null;
                const name = (req && req.fromName) || (pending && pending.name) || 'طالب';
                const avatar = (req && req.fromAvatar) || (pending && pending.avatar) || '';
                const studentNumber = (req && req.fromStudentNumber) || (pending && pending.studentNumber) || '';
                const { ref, set, remove } = window.firebaseDbHelpers;
                const myEntry = { uid: fromUid, name, avatar, studentNumber, since: Date.now() };
                const theirEntry = { uid: this.authUid, name: this.currentUser.fullName || 'طالب', avatar: this._avatarLite(), studentNumber: this.currentUser.studentNumber || '', since: Date.now() };
                Promise.all([
                    set(ref(window.firebaseDb, 'friends/' + this.authUid + '/' + fromUid), myEntry),
                    set(ref(window.firebaseDb, 'friends/' + fromUid + '/' + this.authUid), theirEntry),
                    remove(ref(window.firebaseDb, 'friendRequests/' + this.authUid + '/' + fromUid)),
                    remove(ref(window.firebaseDb, 'sentFriendRequests/' + fromUid + '/' + this.authUid))
                ]).then(() => {
                    this.showToast('صرتوا أصدقاء');
                    this.closeWalletModal();
                }).catch((err) => {
                    console.warn('Accept friend request failed:', err);
                    this.showToast('تعذر قبول الطلب');
                });
            },

            rejectFriendRequest(fromUid) {
                if (!window.firebaseDb || !this.authUid) return;
                const { ref, remove } = window.firebaseDbHelpers;
                remove(ref(window.firebaseDb, 'friendRequests/' + this.authUid + '/' + fromUid)).catch(() => {});
                remove(ref(window.firebaseDb, 'sentFriendRequests/' + fromUid + '/' + this.authUid)).catch(() => {});
                this.closeWalletModal();
            },

            listenForFriends() {
                if (!window.firebaseDb || !this.authUid || this._friendsListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._friendsListener = onValue(ref(window.firebaseDb, 'friends/' + this.authUid), (snap) => {
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((uid) => list.push(vals[uid]));
                        list.sort((a, b) => (b.since || 0) - (a.since || 0));
                    }
                    friendsList.length = 0;
                    friendsList.push(...list);
                    this._presenceSync();
                    const countEl = document.getElementById('profileFriendsCount');
                    if (countEl) countEl.textContent = list.length;
                    if (this.currentView === 'friendsView') this.renderFriendsView();
                });
            },

            listenForFriendRequests() {
                if (!window.firebaseDb || !this.authUid || this._friendRequestsListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._friendRequestsListener = onValue(ref(window.firebaseDb, 'friendRequests/' + this.authUid), (snap) => {
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((fromUid) => { if (!this.isBlocked(fromUid)) list.push({ fromUid, ...vals[fromUid] }); });
                        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                    }
                    incomingFriendRequests.length = 0;
                    incomingFriendRequests.push(...list);
                    const badge = document.getElementById('friendRequestsBadge');
                    if (badge) {
                        badge.classList.toggle('hidden', list.length === 0);
                        badge.textContent = list.length;
                    }
                    if (this.currentView === 'friendsView') { this.renderFriendsView(); lucide.createIcons(); }
                });
            },

            listenForSentFriendRequests() {
                if (!window.firebaseDb || !this.authUid || this._sentFriendRequestsListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._sentFriendRequestsListener = onValue(ref(window.firebaseDb, 'sentFriendRequests/' + this.authUid), (snap) => {
                    const map = {};
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((uid) => { map[uid] = true; list.push({ uid, ...vals[uid] }); });
                        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                    }
                    this.sentFriendRequests = map;
                    sentFriendRequestsList.length = 0;
                    sentFriendRequestsList.push(...list);
                    if (this.currentView === 'friendsView') { this.renderFriendsView(); lucide.createIcons(); }
                });
            },

            goToFriends() {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول لعرض الأصدقاء');
                    this.goToAuth('login');
                    return;
                }
                this.switchView('friendsView');
                this.listenForFriends();
                this.listenForFriendRequests();
                this.listenForSentFriendRequests();
                this.listenForBlockedUsers();
                this.listenForPresence();
                this.renderFriendsView();
                lucide.createIcons();
            },

            renderFriendsView() {
                const reqContainer = document.getElementById('friendRequestsList');
                const sentContainer = document.getElementById('sentFriendRequestsListContainer');
                const listContainer = document.getElementById('friendsListContainer');
                const empty = document.getElementById('friendsEmptyState');
                if (!reqContainer || !listContainer || !empty) return;
                reqContainer.innerHTML = incomingFriendRequests.length === 0
                    ? '<p class="text-xs theme-transition" style="color: var(--text2);">لا توجد طلبات حالياً</p>'
                    : incomingFriendRequests.map(r => `
                        <div class="flex items-center gap-3 p-3 rounded-2xl border theme-transition" style="background-color: var(--surface); border-color: var(--border);">
                            <img src="${personAvatarSrc(r.fromAvatar, r.fromName)}" class="w-10 h-10 rounded-full object-cover flex-shrink-0 cursor-pointer" onclick="app.openProfileFromFriendsList(${jsArg(r.fromUid)})">
                            <div class="flex-1 min-w-0 text-sm font-bold theme-transition cursor-pointer" style="color: var(--text);" onclick="app.openProfileFromFriendsList(${jsArg(r.fromUid)})">${escapeHtml(r.fromName || 'طالب')}</div>
                            <button onclick="app.acceptFriendRequest(${jsArg(r.fromUid)})" class="btn-press px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold">قبول</button>
                            <button onclick="app.rejectFriendRequest(${jsArg(r.fromUid)})" class="btn-press px-3 py-1.5 rounded-lg text-xs font-bold" style="background-color: var(--input-bg); color: var(--text2);">رفض</button>
                        </div>
                    `).join('');
                if (sentContainer) {
                    sentContainer.innerHTML = sentFriendRequestsList.length === 0
                        ? '<p class="text-xs theme-transition" style="color: var(--text2);">لا توجد طلبات مرسلة</p>'
                        : sentFriendRequestsList.map(r => `
                            <div class="flex items-center gap-3 p-3 rounded-2xl border theme-transition" style="background-color: var(--surface); border-color: var(--border);">
                                <img src="${personAvatarSrc(r.toAvatar, r.toName)}" class="w-10 h-10 rounded-full object-cover flex-shrink-0 cursor-pointer" onclick="app.openProfileFromFriendsList(${jsArg(r.uid)})">
                                <div class="flex-1 min-w-0 text-sm font-bold theme-transition cursor-pointer" style="color: var(--text);" onclick="app.openProfileFromFriendsList(${jsArg(r.uid)})">${escapeHtml(r.toName || 'طالب')}</div>
                                <button onclick="app.cancelFriendRequest(${jsArg(r.uid)})" class="btn-press px-3 py-1.5 rounded-lg text-xs font-bold" style="background-color: var(--input-bg); color: var(--text2);">إلغاء</button>
                            </div>
                        `).join('');
                }
                if (friendsList.length === 0) {
                    listContainer.innerHTML = '';
                    listContainer.classList.add('hidden');
                    empty.classList.remove('hidden');
                } else {
                    listContainer.classList.remove('hidden');
                    empty.classList.add('hidden');
                    listContainer.innerHTML = friendsList.map(f => `
                        <div class="flex items-center gap-3 p-3 rounded-2xl border theme-transition" style="background-color: var(--surface); border-color: var(--border);">
                            <img src="${personAvatarSrc(f.avatar, f.name)}" class="w-10 h-10 rounded-full object-cover flex-shrink-0 cursor-pointer" onclick="app.openProfileFromFriendsList(${jsArg(f.uid)})">
                            <div class="flex-1 min-w-0 cursor-pointer" onclick="app.openProfileFromFriendsList(${jsArg(f.uid)})">
                                <div class="text-sm font-bold theme-transition" style="color: var(--text);">${escapeHtml(f.name || 'طالب')}${this.vb(f.uid)}</div>
                                <div class="text-xs theme-transition" style="color: ${(friendsPresence[f.uid] && friendsPresence[f.uid].online) ? '#16A34A' : 'var(--text2)'};">${this.presenceLabel(f.uid) || (f.studentNumber ? 'رقم: ' + escapeHtml(f.studentNumber) : '')}</div>
                            </div>
                            <button onclick="app.openChat(${jsArg(f.uid)})" class="btn-press w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background-color: var(--input-bg);" aria-label="دردشة"><i data-lucide="message-circle" class="w-4 h-4 text-primary"></i></button>
                            <button onclick="app.removeFriend(${jsArg(f.uid)})" class="btn-press w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background-color: var(--input-bg);" aria-label="إلغاء الصداقة"><i data-lucide="user-minus" class="w-4 h-4" style="color: var(--text2);"></i></button>
                            <button onclick="app.blockUser(${jsArg(f.uid)})" class="btn-press w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background-color: var(--input-bg);" aria-label="حظر"><i data-lucide="ban" class="w-4 h-4 text-error"></i></button>
                        </div>
                    `).join('');
                }
                const blockedSection = document.getElementById('blockedUsersSection');
                const blockedList = document.getElementById('blockedUsersList');
                if (blockedSection && blockedList) {
                    blockedSection.classList.toggle('hidden', blockedUsersList.length === 0);
                    blockedList.innerHTML = blockedUsersList.map(b => `
                        <div class="flex items-center gap-3 p-3 rounded-2xl border theme-transition" style="background-color: var(--surface); border-color: var(--border);">
                            <img src="${personAvatarSrc(b.avatar, b.name)}" class="w-10 h-10 rounded-full object-cover flex-shrink-0 cursor-pointer" onclick="app.openProfileFromFriendsList(${jsArg(b.uid)})">
                            <div class="flex-1 min-w-0 text-sm font-bold theme-transition cursor-pointer" style="color: var(--text);" onclick="app.openProfileFromFriendsList(${jsArg(b.uid)})">${escapeHtml(b.name || 'طالب')}</div>
                            <button onclick="app.unblockUser(${jsArg(b.uid)})" class="btn-press px-3 py-1.5 rounded-lg text-xs font-bold" style="background-color: var(--input-bg); color: var(--text2);">رفع الحظر</button>
                        </div>
                    `).join('');
                }
            },

            async removeFriend(uid) {
                if (!window.firebaseDb || !this.authUid) return;
                if (!(await this.ask({ icon: 'user-minus', title: 'تلغي الصداقة؟', text: 'ما يبقى بقائمة أصدقائك، وتكدرون ترجعون أصدقاء بطلب جديد.', ok: 'ألغِ الصداقة' }))) return;
                const { ref, set } = window.firebaseDbHelpers;
                Promise.all([
                    set(ref(window.firebaseDb, 'friends/' + this.authUid + '/' + uid), null),
                    set(ref(window.firebaseDb, 'friends/' + uid + '/' + this.authUid), null)
                ]).then(() => {
                    this.showToast('تم إلغاء الصداقة');
                    this.closeWalletModal();
                }).catch((err) => {
                    console.warn('Remove friend failed:', err);
                    this.showToast('تعذر إلغاء الصداقة');
                });
            },

            async blockUser(uid) {
                if (!window.firebaseDb || !this.authUid) return;
                const friend = friendsList.find(f => f.uid === uid);
                const name = (friend && friend.name) || (this._pendingProfileTarget && this._pendingProfileTarget.uid === uid ? this._pendingProfileTarget.name : '') || 'هذا الطالب';
                const avatar = (friend && friend.avatar) || (this._pendingProfileTarget && this._pendingProfileTarget.uid === uid ? this._pendingProfileTarget.avatar : '') || '';
                if (!(await this.ask({ icon: 'ban', title: 'تحظر ' + name + '؟', text: 'الحظر يلغي الصداقة ويمنعه من مراسلتك.', ok: 'احظر' }))) return;
                const { ref, set, remove } = window.firebaseDbHelpers;
                const payload = { uid, name, avatar, blockedAt: Date.now() };
                Promise.all([
                    set(ref(window.firebaseDb, 'blockedUsers/' + this.authUid + '/' + uid), payload),
                    set(ref(window.firebaseDb, 'friends/' + this.authUid + '/' + uid), null),
                    set(ref(window.firebaseDb, 'friends/' + uid + '/' + this.authUid), null),
                    remove(ref(window.firebaseDb, 'friendRequests/' + this.authUid + '/' + uid)),
                    remove(ref(window.firebaseDb, 'friendRequests/' + uid + '/' + this.authUid)),
                    remove(ref(window.firebaseDb, 'sentFriendRequests/' + this.authUid + '/' + uid)),
                    remove(ref(window.firebaseDb, 'sentFriendRequests/' + uid + '/' + this.authUid))
                ]).then(() => {
                    this.showToast('تم حظر المستخدم');
                    this.closeWalletModal();
                }).catch((err) => {
                    console.warn('Block user failed:', err);
                    this.showToast('تعذر تنفيذ الحظر');
                });
            },

            unblockUser(uid) {
                if (!window.firebaseDb || !this.authUid) return;
                const { ref, set } = window.firebaseDbHelpers;
                set(ref(window.firebaseDb, 'blockedUsers/' + this.authUid + '/' + uid), null).then(() => {
                    this.showToast('تم رفع الحظر');
                }).catch((err) => {
                    console.warn('Unblock user failed:', err);
                    this.showToast('تعذر رفع الحظر');
                });
            },

            listenForBlockedUsers() {
                if (!window.firebaseDb || !this.authUid || this._blockedUsersListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._blockedUsersListener = onValue(ref(window.firebaseDb, 'blockedUsers/' + this.authUid), (snap) => {
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((uid) => list.push(vals[uid]));
                    }
                    blockedUsersList.length = 0;
                    blockedUsersList.push(...list);
                    if (this.currentView === 'friendsView') { this.renderFriendsView(); lucide.createIcons(); }
                });
            },

            isBlocked(uid) {
                return blockedUsersList.some(b => b.uid === uid);
            },

            // ==================== PRESENCE (online / last seen) ====================
            setupPresence() {
                if (!window.firebaseDb || !this.authUid) return;
                const { ref, set, onDisconnect } = window.firebaseDbHelpers;
                const myRef = ref(window.firebaseDb, 'presence/' + this.authUid);
                set(myRef, { online: true, lastSeen: Date.now() }).catch(() => {});
                if (!this._chatVis) { this._chatVis = true; document.addEventListener('visibilitychange', () => this._chatNow()); }
                this._avatarPush(this.authUid, this.currentUser);
                try {
                    onDisconnect(myRef).set({ online: false, lastSeen: Date.now() });
                } catch (e) {
                    console.warn('Presence onDisconnect setup failed:', e);
                }
            },

            // Tells the server which chat this student has open right now (and that they are looking at it), so the server
            // does not send a phone notification for a message they are reading live. Refreshed every 25 s while the chat is open.
            _chatNow() {
                try {
                    if (!window.firebaseDb || !this.authUid || !window.firebaseDbHelpers) return;
                    const inChat = this.currentView === 'chatThreadView' && this.currentChatUid && document.visibilityState !== 'hidden';
                    const want = inChat ? this.currentChatUid : '';
                    if (!want && !this._chatNowSent) return;
                    const { ref, set, remove } = window.firebaseDbHelpers;
                    (want ? set(ref(window.firebaseDb, 'chatNow/' + this.authUid), { c: want, at: Date.now() }) : remove(ref(window.firebaseDb, 'chatNow/' + this.authUid))).catch(() => {});
                    this._chatNowSent = !!want;
                    if (want && !this._chatNowT) this._chatNowT = setInterval(() => this._chatNow(), 25000);
                    if (!want && this._chatNowT) { clearInterval(this._chatNowT); this._chatNowT = null; }
                } catch (e) {}
            },

            // Presence is followed per person (friends, the people in the chat list, the open chat) instead of
            // downloading everyone's presence every time anyone goes online or offline.
            listenForPresence() {
                if (!window.firebaseDb || this._presenceListener) return;
                this._presUn = new Map();
                this._presenceListener = () => { if (this._presUn) { this._presUn.forEach((un) => { try { un(); } catch (e) {} }); this._presUn = null; } Object.keys(friendsPresence).forEach((k) => delete friendsPresence[k]); };
                this._presenceSync();
            },
            _presenceSync() {
                if (!window.firebaseDb || !this._presUn || !this.authUid) return;
                const { ref, onValue } = window.firebaseDbHelpers, want = new Set();
                if (this.currentChatUid && this.currentView === 'chatThreadView') want.add(this.currentChatUid);
                userChatsList.slice(0, 40).forEach((c) => { if (c && c.otherUid) want.add(c.otherUid); });
                friendsList.forEach((f) => { if (f && f.uid && want.size < 160) want.add(f.uid); });
                want.forEach((uid) => {
                    if (this._presUn.has(uid)) return;
                    this._presUn.set(uid, onValue(ref(window.firebaseDb, 'presence/' + uid), (snap) => {
                        if (snap.exists()) friendsPresence[uid] = snap.val(); else delete friendsPresence[uid];
                        this._presChanged();
                    }, () => {}));
                });
                this._presUn.forEach((un, uid) => { if (!want.has(uid)) { try { un(); } catch (e) {} this._presUn.delete(uid); delete friendsPresence[uid]; } });
            },
            _presChanged() {
                clearTimeout(this._presT);
                this._presT = setTimeout(() => {
                    if (this.currentView === 'friendsView') this.renderFriendsView();
                    if (this.currentView === 'chatThreadView') this.updateChatHeaderPresence();
                    if (this.currentView === 'messagesView') this.renderChatsList();
                }, 150);
            },

            presenceLabel(uid) {
                const p = friendsPresence[uid];
                if (!p) return '';
                if (p.online) return 'متصل الآن';
                if (p.lastSeen) return 'آخر ظهور ' + timeAgo(p.lastSeen);
                return '';
            },

            updateChatHeaderPresence() {
                const el = document.getElementById('chatThreadPresence');
                if (!el || !this.currentChatUid) return;
                el.textContent = this.presenceLabel(this.currentChatUid);
            },

            openAddFriendModal() {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول لإضافة أصدقاء');
                    this.goToAuth('login');
                    return;
                }
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'إضافة صديق';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                content.innerHTML = `
                    <div class="flex flex-col gap-3">
                        <label class="text-sm font-bold theme-transition" style="color: var(--text);">ابحث بالاسم أو الرقم التعريفي (5 أرقام)</label>
                        <div class="flex gap-2">
                            <input type="text" id="addFriendSearchInput" placeholder="مثال: أحمد أو 48321" class="flex-1 h-12 px-4 rounded-xl auth-input text-sm" onkeydown="if(event.key==='Enter'){event.preventDefault(); app.searchAddFriendStudent();}">
                            <button onclick="app.searchAddFriendStudent()" class="btn-press px-5 h-12 bg-primary text-white rounded-xl font-bold text-sm flex items-center gap-2 flex-shrink-0"><i data-lucide="search" class="w-4 h-4"></i>بحث</button>
                        </div>
                        <div id="addFriendResult"></div>
                    </div>
                `;
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
            },

            async findStudentsByName(query) {
                if (!window.firebaseDb) return [];
                const { ref, get } = window.firebaseDbHelpers;
                try {
                    const snap = await get(ref(window.firebaseDb, 'pub'));
                    if (!snap.exists()) return [];
                    const all = snap.val();
                    const q = query.toLowerCase();
                    const uids = Object.keys(all).filter((uid) => all[uid] && String(all[uid].n || '').toLowerCase().includes(q)).slice(0, 15);
                    return Promise.all(uids.map((uid) => this._pubData(uid, all[uid])));
                } catch (err) {
                    console.warn('Name search failed:', err);
                    return [];
                }
            },

            async searchAddFriendStudent() {
                const input = document.getElementById('addFriendSearchInput');
                const result = document.getElementById('addFriendResult');
                if (!input || !result) return;
                const query = (input.value || '').trim();
                if (!query) {
                    result.innerHTML = '<p class="text-xs font-bold text-error">اكتب اسم أو رقم تعريفي للبحث</p>';
                    return;
                }
                result.innerHTML = '<div class="flex items-center justify-center gap-2 py-3"><i data-lucide="loader-2" class="w-5 h-5 animate-spin" style="color: rgb(var(--p));"></i><span class="text-sm theme-transition" style="color: var(--text2);">جاري البحث...</span></div>';
                lucide.createIcons();
                let matches = [];
                if (/^\d{5}$/.test(query)) {
                    const found = await this.findStudentByNumber(query);
                    if (found) matches = [found];
                } else {
                    matches = await this.findStudentsByName(query);
                }
                matches = matches.filter(m => m.uid !== this.authUid);
                if (matches.length === 0) {
                    result.innerHTML = '<div class="rounded-xl border border-error/30 bg-error/10 p-3 text-center"><p class="text-xs font-bold text-error">ما لقينا أي طالب مطابق</p></div>';
                    return;
                }
                this._addFriendMatches = matches;
                result.innerHTML = matches.map((m, i) => this.renderAddFriendResultRow(m, i)).join('');
                lucide.createIcons();
            },

            renderAddFriendResultRow(found, index) {
                const status = this.isBlocked(found.uid) ? 'blocked' : this.getFriendStatus(found.uid);
                let actionHtml = '';
                if (status === 'friends') actionHtml = '<span class="text-xs font-bold text-success flex-shrink-0">أصدقاء</span>';
                else if (status === 'sent') actionHtml = `<button onclick="app.cancelFriendRequest(${jsArg(found.uid)})" class="px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0" style="background-color: var(--input-bg); color: var(--text2);">إلغاء الطلب</button>`;
                else if (status === 'incoming') actionHtml = `<button onclick="app.acceptFriendRequest(${jsArg(found.uid)})" class="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold flex-shrink-0">قبول</button>`;
                else if (status === 'blocked') actionHtml = '<span class="text-xs font-bold text-error flex-shrink-0">محظور</span>';
                else actionHtml = `<button onclick="app.sendFriendRequestFromSearch(${jsNum(index)})" class="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold flex-shrink-0">إضافة</button>`;
                return `
                    <div class="flex items-center gap-3 p-3 rounded-2xl border theme-transition mb-2" style="background-color: var(--surface); border-color: var(--border);">
                        <img src="${personAvatarSrc(found.data.avatar, found.data.fullName)}" class="w-10 h-10 rounded-full object-cover flex-shrink-0">
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-bold theme-transition" style="color: var(--text);">${escapeHtml(found.data.fullName || 'طالب')}${this.vb(found.uid)}</div>
                            <div class="text-xs theme-transition" style="color: var(--text2);">رقم: ${escapeHtml(found.data.studentNumber || '—')}</div>
                        </div>
                        ${actionHtml}
                    </div>
                `;
            },

            sendFriendRequestFromSearch(index) {
                const m = this._addFriendMatches && this._addFriendMatches[index];
                if (!m) return;
                this.sendFriendRequest(m.uid, m.data.fullName, m.data.avatar, m.data.studentNumber);
                this.searchAddFriendStudent();
            },

            // Points and wallet balance. Each change is one multi-path update that the database
            // rules (database.rules.json) can check against what is really stored: the value is
            // read fresh from the server and written together with whatever justifies it.
            // Spending is always allowed down to 0. Points may only go up by at most 200 per
            // write and one write per 20 seconds (users/{uid}/pAt), unless an auction refund is
            // being claimed (users/{uid}/pc). The balance may only go up through a top-up code
            // (bt), an incoming transfer (bi) or a points redemption in the same write.
            // Changes from this device run one after another so they never race each other.
            _walletQueue(fn) {
                const p = (this._wq || Promise.resolve()).then(fn, fn);
                this._wq = p.catch(() => {});
                return p;
            },

            // build(cur) gets the fresh {points, balance, pAt} and returns {upd, points?, balance?},
            // {wait: ms} to try again later, or null to give up.
            async _walletWrite(build) {
                const { ref, get, update } = window.firebaseDbHelpers;
                const db = window.firebaseDb, base = 'users/' + this.authUid + '/';
                let tries = 0, waits = 0;
                while (tries < 4) {
                    const [p, b, a] = await Promise.all(['points', 'balance', 'pAt'].map((k) => get(ref(db, base + k)).then((s) => s.val())));
                    const plan = build({ points: numOr0(p), balance: numOr0(b), pAt: numOr0(a) });
                    if (!plan) return null;
                    if (plan.wait) {
                        if (++waits > 3) return null;
                        await new Promise((r) => setTimeout(r, Math.min(25000, plan.wait)));
                        continue;
                    }
                    try {
                        await update(ref(db), plan.upd);
                        if ('points' in plan) this.currentUser.points = plan.points;
                        if ('balance' in plan) this.currentUser.balance = plan.balance;
                        this.saveUserData();
                        return plan;
                    } catch (e) {
                        if (++tries >= 4) throw e;
                        await new Promise((r) => setTimeout(r, 400 * tries));
                    }
                }
                return null;
            },

            _pointsPlan(cur, delta, opts) {
                const min = typeof opts.min === 'number' ? opts.min : 0;
                const uid = this.authUid;
                let next = cur.points + delta;
                if (next < min) {
                    if (opts.reject) return null;
                    next = Math.max(min, Math.min(cur.points, next));
                }
                const upd = Object.assign({}, opts.extra || {});
                upd['users/' + uid + '/points'] = next;
                upd['leaderboard/' + uid + '/points'] = next;
                // what the points are spent on (users/{uid}/ps), so one payment can't pay for two things
                if (opts.spend) upd['users/' + uid + '/ps'] = opts.spend;
                if (next > cur.points && !opts.claim) {
                    const now = Math.round(this.trueNow()), at = Math.max(now, cur.pAt + 20000);
                    if (at > now + 8000) return { wait: at - now - 7000 };
                    upd['users/' + uid + '/pAt'] = at;
                }
                return { upd, points: next };
            },

            // options: reject (fail instead of clamping at 0), extra (more paths written in the
            // same update), claim (the extra paths hold an auction refund claim), spend (what
            // the points pay for: 'a:<auction>:<bid>', 'o:<order>' or 'r:<time>').
            addPointsAtomic(delta, options) {
                const opts = options || {};
                const reject = !!opts.reject;
                const min = typeof opts.min === 'number' ? opts.min : 0;
                delta = Math.round(Number(delta) || 0);
                if (!this.currentUser) return Promise.resolve(null);
                if (!window.firebaseDb || !this.authUid) {
                    let next = (this.currentUser.points || 0) + delta;
                    if (next < min) {
                        if (reject) return Promise.resolve(null);
                        next = min;
                    }
                    this.currentUser.points = next;
                    this.saveUserData();
                    return Promise.resolve(next);
                }
                return this._walletQueue(() => this._walletWrite((cur) => this._pointsPlan(cur, delta, opts)))
                    .then((r) => (r ? r.points : null))
                    .catch((err) => {
                        console.warn('addPointsAtomic failed:', err);
                        return null;
                    });
            },

            // Same idea for the wallet balance (USD, 2 decimals). options: reject, extra, and
            // claim: [field, value] naming what pays for an increase ('bt' code / 'bi' transfer).
            addBalanceAtomic(delta, options) {
                const opts = options || {};
                const round2 = (n) => Math.round(n * 100) / 100;
                if (!this.currentUser || !window.firebaseDb || !this.authUid) return Promise.resolve(null);
                const uid = this.authUid;
                return this._walletQueue(() => this._walletWrite((cur) => {
                    let next = round2(cur.balance + delta);
                    if (next < 0) {
                        if (opts.reject) return null;
                        next = 0;
                    }
                    const upd = Object.assign({}, opts.extra || {});
                    upd['users/' + uid + '/balance'] = next;
                    if (opts.claim) upd['users/' + uid + '/' + opts.claim[0]] = opts.claim[1];
                    return { upd, balance: next };
                })).then((r) => (r ? r.balance : null)).catch((err) => {
                    console.warn('addBalanceAtomic failed:', err);
                    return null;
                });
            },

            // ==================== STUDY TIMER ====================
            goToStudyTimer() {
                this.renderStudyTimerPresets();
                this.updateStudyTimerDisplay();
                const countEl = document.getElementById('studyTimerSessionsCount');
                if (countEl) countEl.textContent = (this.currentUser && this.currentUser.studySessions) || 0;
                this.switchView('studyTimerView');
                lucide.createIcons();
            },

            renderStudyTimerPresets() {
                document.querySelectorAll('.study-preset-tab').forEach(tab => {
                    const minutes = parseInt(tab.dataset.minutes, 10);
                    if (minutes * 60 === this.studyTimerDuration) {
                        tab.classList.add('bg-primary', 'text-white');
                        tab.classList.remove('theme-transition');
                        tab.style.backgroundColor = '';
                        tab.style.color = '';
                    } else {
                        tab.classList.remove('bg-primary', 'text-white');
                        tab.classList.add('theme-transition');
                        tab.style.backgroundColor = 'var(--input-bg)';
                        tab.style.color = 'var(--text2)';
                    }
                });
            },

            setStudyTimerDuration(minutes) {
                if (this.studyTimerRunning) {
                    this.showToast('أوقف المؤقت أولاً لتغيير المدة');
                    return;
                }
                this.studyTimerDuration = minutes * 60;
                this.studyTimerRemaining = minutes * 60;
                this.renderStudyTimerPresets();
                this.updateStudyTimerDisplay();
            },

            updateStudyTimerDisplay() {
                const display = document.getElementById('studyTimerDisplay');
                if (!display) return;
                const minutes = Math.floor(this.studyTimerRemaining / 60);
                const seconds = this.studyTimerRemaining % 60;
                display.textContent = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
            },

            toggleStudyTimer() {
                if (this.studyTimerRunning) this.pauseStudyTimer();
                else this.startStudyTimer();
            },

            startStudyTimer() {
                if (this.studyTimerRunning) return;
                if (this.studyTimerRemaining <= 0) this.studyTimerRemaining = this.studyTimerDuration;
                this.studyTimerRunning = true;
                this.joinStudyRoom('timer');
                const btn = document.getElementById('studyTimerToggleBtn');
                if (btn) btn.textContent = 'إيقاف';
                this.studyTimerInterval = setInterval(() => {
                    this.studyTimerRemaining--;
                    this.updateStudyTimerDisplay();
                    if (this.studyTimerRemaining <= 0) this.completeStudyTimer();
                }, 1000);
            },

            pauseStudyTimer() {
                if (this.studyTimerInterval) {
                    clearInterval(this.studyTimerInterval);
                    this.studyTimerInterval = null;
                }
                this.studyTimerRunning = false;
                this.leaveStudyRoom();
                const btn = document.getElementById('studyTimerToggleBtn');
                if (btn) btn.textContent = 'ابدأ';
            },

            resetStudyTimer() {
                if (this.studyTimerInterval) {
                    clearInterval(this.studyTimerInterval);
                    this.studyTimerInterval = null;
                }
                this.studyTimerRunning = false;
                this.leaveStudyRoom();
                this.studyTimerRemaining = this.studyTimerDuration;
                this.updateStudyTimerDisplay();
                const btn = document.getElementById('studyTimerToggleBtn');
                if (btn) btn.textContent = 'ابدأ';
            },

            completeStudyTimer() {
                if (this.studyTimerInterval) {
                    clearInterval(this.studyTimerInterval);
                    this.studyTimerInterval = null;
                }
                this.studyTimerRunning = false;
                this.leaveStudyRoom();
                this.studyTimerRemaining = this.studyTimerDuration;
                this.updateStudyTimerDisplay();
                const btn = document.getElementById('studyTimerToggleBtn');
                if (btn) btn.textContent = 'ابدأ';
                this.playNotifySound();
                if (this.isLoggedIn && this.currentUser) {
                    this.addPointsAtomic(10).then(() => {
                        this.currentUser.studySessions = (this.currentUser.studySessions || 0) + 1;
                        this.saveUserData();
                        this.syncUserToDatabase();
                        this.logDailyActivity({ points: 10, studySessions: 1, minutes: Math.round((this.studyTimerDuration || 0) / 60) });
                        const countEl = document.getElementById('studyTimerSessionsCount');
                        if (countEl) countEl.textContent = this.currentUser.studySessions;
                        this.showToast('أحسنت! جلسة مذاكرة مكتملة (+10 نقاط)');
                    });
                } else {
                    this.showToast('أحسنت! جلسة مذاكرة مكتملة — سجّل دخولك لكسب نقاط');
                }
            },

            // ==================== YOUTUBE STUDY ROOMS (engine in js/ytroom.js) ====================
            goToYtRooms(rid) {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('سجّل دخولك حتى تدخل غرف يوتيوب');
                    this.goToAuth('login');
                    return;
                }
                this.switchView('ytRoomView');
                if (this._withPart('ytroom', () => typeof this.yrHome === 'function', 'ytRoomView', () => this.goToYtRooms(rid))) {
                    const box = document.getElementById('yrContent');
                    if (box) box.innerHTML = '<div class="kd-loading"><span></span><span></span><span></span></div>';
                    return;
                }
                if (rid) this.yrJoin(rid); else this.yrHome();
            },
            yrBack() {
                if (this._yr && this.yrHome) { this.yrHome(); return; }
                this.goBack();
            },

            // غرفتنا: the shared 3D study room (js/sroom.js + js/room3d.js)
            goToRoom(rid) {
                const cfg = this.siteConfig || {};
                if (cfg.features && cfg.features.room === false) { this.showToast('هذه الصفحة مو متاحة هسه'); return; }
                if (!this.isLoggedIn || !this.currentUser) { this.showToast('سجّل دخولك حتى تدخل الغرفة'); this.goToAuth('login'); return; }
                this.switchView('rmView');
                if (this._withPart('sroom', () => typeof this.rmOpen === 'function', 'rmView', () => this.goToRoom(rid))) return;
                if (rid) this.rmJoin(rid); else this.rmOpen();
            },
            listenForRmInvites() {
                if (!window.firebaseDb || !this.authUid || this._rmInvListener) return;
                const { ref, onValue } = window.firebaseDbHelpers, since = Date.now() - 5000;
                this._rmInvListener = onValue(ref(window.firebaseDb, 'rmInvites/' + this.authUid), (snap) => {
                    const v = snap.val() || {}, day = Date.now() - 86400000;
                    this._rmInvites = Object.keys(v).map((rid) => Object.assign({ rid }, v[rid])).filter((x) => (x.at || 0) > day).sort((a, b) => (b.at || 0) - (a.at || 0));
                    const fresh = this._rmInvites.find((x) => (x.at || 0) > since && !(this._rmShown || {})[x.rid]);
                    if (fresh) {
                        this._rmShown = this._rmShown || {}; this._rmShown[fresh.rid] = 1;
                        document.getElementById('rmInvCard')?.remove();
                        const el = document.createElement('div'); el.id = 'rmInvCard'; el.className = 'yr-pop rm-pop';
                        el.innerHTML = `<i data-lucide="door-open"></i><div><b>${escapeHtml(fresh.fn || 'صديقك')} يدعوك لغرفة دراسة</b><small>${escapeHtml(fresh.t || 'غرفتنا')}</small></div>
                            <button class="go" onclick="document.getElementById('rmInvCard').remove(); app.goToRoom(${jsArg(fresh.rid)})">ادخل</button>
                            <button onclick="document.getElementById('rmInvCard').remove()" aria-label="بعدين"><i data-lucide="x"></i></button>`;
                        document.body.appendChild(el); lucide.createIcons(); this.playNotifySound && this.playNotifySound(); setTimeout(() => el.remove(), 20000);
                    }
                    if (this.currentView === 'rmView' && this.rmOpen && !document.getElementById('rmScene')) this.rmOpen();
                }, () => {});
                if (this._rmPending) { const rid = this._rmPending; this._rmPending = null; try { history.replaceState(history.state, '', location.pathname); } catch (e) {} setTimeout(() => this.goToRoom(rid), 800); }
            },
            // Invites to YouTube rooms: a card pops up when a friend invites you while the app is open.
            listenForYtInvites() {
                if (!window.firebaseDb || !this.authUid || this._yrInvListener) return;
                const { ref, onValue } = window.firebaseDbHelpers, since = Date.now() - 5000;
                this._yrInvListener = onValue(ref(window.firebaseDb, 'ytInvites/' + this.authUid), (snap) => {
                    const v = snap.val() || {}, day = Date.now() - 86400000;
                    this._yrInvites = Object.keys(v).map((rid) => Object.assign({ rid }, v[rid])).filter((x) => (x.at || 0) > day).sort((a, b) => (b.at || 0) - (a.at || 0));
                    const fresh = this._yrInvites.find((x) => (x.at || 0) > since && !(this._yrShown || {})[x.rid]);
                    if (fresh && !(this._yr && this._yr.rid === fresh.rid)) this._yrInviteCard(fresh);
                    if (this.currentView === 'ytRoomView' && !this._yr && this.yrHome) this.yrHome();
                }, () => {});
                if (this._yrPending) { const rid = this._yrPending; this._yrPending = null; try { history.replaceState(history.state, '', location.pathname); } catch (e) {} setTimeout(() => this.goToYtRooms(rid), 800); }
            },
            _yrInviteCard(x) {
                this._yrShown = this._yrShown || {};
                this._yrShown[x.rid] = 1;
                document.getElementById('yrInvCard')?.remove();
                const el = document.createElement('div');
                el.id = 'yrInvCard';
                el.className = 'yr-pop';
                el.innerHTML = `<i data-lucide="tv"></i><div><b>${escapeHtml(x.fn || 'صديقك')} يدعوك</b><small>${escapeHtml(x.t || 'غرفة يوتيوب')}</small></div>
                    <button class="go" onclick="document.getElementById('yrInvCard').remove(); app.goToYtRooms(${jsArg(x.rid)})">ادخل</button>
                    <button onclick="document.getElementById('yrInvCard').remove()" aria-label="بعدين"><i data-lucide="x"></i></button>`;
                document.body.appendChild(el);
                lucide.createIcons();
                this.playNotifySound && this.playNotifySound();
                setTimeout(() => el.remove(), 20000);
            },

            // ==================== YOUTUBE STUDY ====================
            goToYoutubeStudy() {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول لاستخدام هذه الميزة');
                    this.goToAuth('login');
                    return;
                }
                document.getElementById('youtubeStudySetup')?.classList.remove('hidden');
                document.getElementById('youtubeStudyPlayer')?.classList.add('hidden');
                const input = document.getElementById('youtubeStudyUrlInput');
                if (input) input.value = '';
                this.renderYoutubeStudyCooldown();
                this.switchView('youtubeStudyView');
                lucide.createIcons();
            },

            renderYoutubeStudyCooldown() {
                const notice = document.getElementById('youtubeStudyCooldownNotice');
                const text = document.getElementById('youtubeStudyCooldownText');
                if (!notice || !text) return;
                const until = (this.currentUser && this.currentUser.youtubeStudyCooldownUntil) || 0;
                if (until > Date.now()) {
                    const minutesLeft = Math.ceil((until - Date.now()) / 60000);
                    text.textContent = 'تم إيقاف احتساب نقاط المشاهدة مؤقتاً بسبب تجاهل سؤال التحقق. يمكنك مشاهدة فيديو لكن بدون نقاط لمدة ' + minutesLeft + ' دقيقة إضافية.';
                    notice.classList.remove('hidden');
                } else {
                    notice.classList.add('hidden');
                }
            },

            extractYoutubeId(input) {
                const value = (input || '').trim();
                if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
                const match = value.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
                return match ? match[1] : null;
            },

            loadYoutubeVideo() {
                const input = document.getElementById('youtubeStudyUrlInput');
                if (!input) return;
                const videoId = this.extractYoutubeId(input.value);
                if (!videoId) {
                    this.showToast('الرجاء إدخال رابط يوتيوب صحيح');
                    return;
                }
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول لاستخدام هذه الميزة');
                    this.goToAuth('login');
                    return;
                }
                this.youtubeStudyVideoId = videoId;
                const iframe = document.getElementById('youtubeStudyIframe');
                if (iframe) iframe.src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1';
                document.getElementById('youtubeStudySetup')?.classList.add('hidden');
                document.getElementById('youtubeStudyPlayer')?.classList.remove('hidden');
                this.youtubeStudySessionPoints = 0;
                const pointsEl = document.getElementById('youtubeStudySessionPoints');
                if (pointsEl) pointsEl.textContent = '0';
                this.youtubeStudySessionActive = true;
                this.joinStudyRoom('youtube');
                const inCooldown = (this.currentUser.youtubeStudyCooldownUntil || 0) > Date.now();
                if (!inCooldown) {
                    this.scheduleNextYoutubePresenceCheck();
                } else {
                    this.showToast('الفيديو يعمل، لكن لن تُحتسب نقاط بسبب فترة الإيقاف المؤقت');
                }
                lucide.createIcons();
            },

            toggleYoutubeFullscreen() {
                const wrap = document.getElementById('youtubeStudyPlayerWrap');
                if (!wrap) return;
                const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
                if (fsElement) {
                    (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
                } else {
                    const request = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
                    if (request) request.call(wrap);
                    else this.showToast('ملء الشاشة غير مدعوم بهذا المتصفح');
                }
            },

            scheduleNextYoutubePresenceCheck() {
                if (!this.youtubeStudySessionActive) return;
                const delayMs = (3 + Math.random() * 3) * 60 * 1000;
                this.youtubeStudyCheckTimer = setTimeout(() => this.showYoutubePresenceCheck(), delayMs);
            },

            showYoutubePresenceCheck() {
                if (!this.youtubeStudySessionActive) return;
                const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
                if (fsElement) (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'تحقق من الحضور';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                let remaining = 30;
                content.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-4 text-center">
                        <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                            <i data-lucide="eye" class="w-8 h-8 text-primary"></i>
                        </div>
                        <h4 class="font-bold mb-2 theme-transition" style="color: var(--text);">هل ما زلت هنا؟</h4>
                        <p class="text-sm mb-4 theme-transition" style="color: var(--text2);">أكّد حضورك خلال <span id="youtubeStudyCountdown" class="font-bold text-error">30</span> ثانية وإلا يُخصم 1000 نقطة</p>
                        <button onclick="app.confirmYoutubePresence()" class="px-10 py-3 bg-primary text-white rounded-xl font-bold text-sm btn-press">نعم، موجود</button>
                    </div>
                `;
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
                this.youtubeStudyCountdownInterval = setInterval(() => {
                    remaining--;
                    const el = document.getElementById('youtubeStudyCountdown');
                    if (el) el.textContent = remaining;
                    if (remaining <= 0 && this.youtubeStudyCountdownInterval) {
                        clearInterval(this.youtubeStudyCountdownInterval);
                        this.youtubeStudyCountdownInterval = null;
                    }
                }, 1000);
                this.youtubeStudyResponseTimer = setTimeout(() => this.failYoutubePresenceCheck(), 30000);
            },

            confirmYoutubePresence() {
                if (this.youtubeStudyResponseTimer) { clearTimeout(this.youtubeStudyResponseTimer); this.youtubeStudyResponseTimer = null; }
                if (this.youtubeStudyCountdownInterval) { clearInterval(this.youtubeStudyCountdownInterval); this.youtubeStudyCountdownInterval = null; }
                this.closeWalletModal();
                if (this.isLoggedIn && this.currentUser) {
                    this.addPointsAtomic(10).then(() => {
                        this.youtubeStudySessionPoints += 10;
                        this.syncUserToDatabase();
                        this.logDailyActivity({ points: 10 });
                        const pointsEl = document.getElementById('youtubeStudySessionPoints');
                        if (pointsEl) pointsEl.textContent = this.youtubeStudySessionPoints;
                        this.showToast('أحسنت! +10 نقاط');
                    });
                }
                this.scheduleNextYoutubePresenceCheck();
            },

            failYoutubePresenceCheck() {
                if (this.youtubeStudyCountdownInterval) { clearInterval(this.youtubeStudyCountdownInterval); this.youtubeStudyCountdownInterval = null; }
                this.closeWalletModal();
                if (this.isLoggedIn && this.currentUser) {
                    this.addPointsAtomic(-1000).then(() => {
                        this.currentUser.youtubeStudyCooldownUntil = Date.now() + 24 * 60 * 60 * 1000;
                        this.saveUserData();
                        this.syncUserToDatabase();
                        this.showToast('تم خصم 1000 نقطة لعدم تأكيد الحضور، وتوقف احتساب النقاط 24 ساعة');
                    });
                }
                this.stopYoutubeStudySession();
            },

            stopYoutubeStudySession() {
                this.youtubeStudySessionActive = false;
                this.leaveStudyRoom();
                if (this.youtubeStudyCheckTimer) { clearTimeout(this.youtubeStudyCheckTimer); this.youtubeStudyCheckTimer = null; }
                if (this.youtubeStudyResponseTimer) { clearTimeout(this.youtubeStudyResponseTimer); this.youtubeStudyResponseTimer = null; }
                if (this.youtubeStudyCountdownInterval) { clearInterval(this.youtubeStudyCountdownInterval); this.youtubeStudyCountdownInterval = null; }
                const iframe = document.getElementById('youtubeStudyIframe');
                if (iframe) iframe.src = '';
                document.getElementById('youtubeStudySetup')?.classList.remove('hidden');
                document.getElementById('youtubeStudyPlayer')?.classList.add('hidden');
                this.renderYoutubeStudyCooldown();
                lucide.createIcons();
            },

            // ==================== POINTS STORE ====================
            goToPointsStore() {
                this._listenPtsRate();
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول لاستخدام هذه الميزة');
                    this.goToAuth('login');
                    return;
                }
                this.renderPointsStore();
                this.switchView('pointsStoreView');
                lucide.createIcons();
            },

            renderPointsStore() {
                const balanceEl = document.getElementById('pointsStoreBalance');
                const container = document.getElementById('pointsStoreOffers');
                if (!balanceEl || !container) return;
                const points = numOr0(this.currentUser && this.currentUser.points);
                balanceEl.textContent = points.toLocaleString('en-US') + ' نقطة';
                container.innerHTML = pointsStoreOffers.map(o => ({ points: o.points, iqd: this.ptsToIqd(o.points) })).filter(o => o.iqd > 0).map(offer => {
                    const canRedeem = points >= offer.points;
                    return `
                        <div class="rounded-2xl border p-4 flex items-center justify-between theme-transition" style="background-color: var(--surface); border-color: var(--border); ${canRedeem ? '' : 'opacity: 0.5;'}">
                            <div>
                                <div class="font-bold theme-transition" style="color: var(--text);">${offer.points.toLocaleString('en-US')} نقطة</div>
                                <div class="text-xs theme-transition" style="color: var(--text2);">= ${offer.iqd.toLocaleString('en-US')} د.ع رصيد محفظة</div>
                            </div>
                            <button onclick="app.redeemPointsOffer(${jsNum(offer.points)}, ${jsNum(offer.iqd)})" ${canRedeem ? '' : 'disabled'} class="btn-press px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm ${canRedeem ? '' : 'pointer-events-none'}">استبدال</button>
                        </div>
                    `;
                }).join('');
            },

            // FIX: see addPointsAtomic() above — redemption now debits points through an
            // atomic, rejecting transaction (reject:true) instead of a plain local
            // subtraction, so a double tap or a second tab can't redeem the same points twice
            // or leave the deduction unsynced if the write failed.
            redeemPointsOffer(points, iqd) {
                if (!this.isLoggedIn || !this.currentUser) return;
                const currentPoints = this.currentUser.points || 0;
                if (currentPoints < points) {
                    this.showToast('نقاطك غير كافية لهذا العرض');
                    return;
                }
                if (!window.firebaseDb || !this.authUid) return;
                // Points out and balance in, in one write, so the rules can see the points paid.
                // the money is worked out here from the current rate (the rules check it against shop/rate): rounded to cents, but never more than the points are worth
                const uid = this.authUid, rate = this.ptsRate();
                iqd = this.ptsToIqd(points);
                let usdAmount = Math.round(iqd / 1325 * 100) / 100;
                if (usdAmount * 1325 * rate > points * 1.02) usdAmount = Math.floor(iqd / 1325 * 100) / 100;
                if (!(usdAmount > 0)) { this.showToast('النقاط قليلة لهذا العرض'); return; }
                this._walletQueue(() => this._walletWrite((cur) => {
                    if (cur.points < points) return null;
                    const np = cur.points - points, nb = Math.round((cur.balance + usdAmount) * 100) / 100;
                    return { upd: { ['users/' + uid + '/points']: np, ['leaderboard/' + uid + '/points']: np, ['users/' + uid + '/balance']: nb, ['users/' + uid + '/ps']: 'r:' + Date.now() }, points: np, balance: nb };
                })).catch((err) => { console.warn('Redeem failed:', err); return 'err'; }).then((r) => {
                    if (!r || r === 'err') {
                        this.showToast(r ? 'تعذر الاستبدال، حاول مجدداً' : 'نقاطك غير كافية لهذا العرض');
                        return;
                    }
                    this.addWalletTransaction({
                        title: 'استبدال ' + points.toLocaleString('en-US') + ' نقطة',
                        amount: '+$' + usdAmount.toFixed(2),
                        isNegative: false,
                        icon: 'gift',
                        iconColor: 'text-warning',
                        iconBg: 'bg-warning/10'
                    });
                    this.renderPointsStore();
                    this.showToast('تم استبدال النقاط بنجاح! أُضيف ' + iqd.toLocaleString('en-US') + ' د.ع لرصيدك');
                });
            },

            // ==================== STUDY ROOM ====================
            goToStudyRoom() {
                this.renderStudyRoom();
                this.switchView('studyRoomView');
                lucide.createIcons();
            },

            listenForStudyRoom() {
                if (!window.firebaseDb || this._studyRoomListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._studyRoomListener = onValue(ref(window.firebaseDb, 'studyRoom'), (snap) => {
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((uid) => {
                            const entry = vals[uid];
                            if (!entry) return;
                            list.push({
                                uid: uid,
                                name: entry.name || 'طالب',
                                avatar: entry.avatar || '',
                                activity: entry.activity || 'timer',
                                startedAt: entry.startedAt || 0
                            });
                        });
                        list.sort((a, b) => b.startedAt - a.startedAt);
                    }
                    studyRoomStudents.length = 0;
                    studyRoomStudents.push(...list);
                    if (this.currentView === 'studyRoomView') { this.renderStudyRoom(); lucide.createIcons(); }
                });
            },

            renderStudyRoom() {
                const countEl = document.getElementById('studyRoomCount');
                const listEl = document.getElementById('studyRoomList');
                const emptyEl = document.getElementById('studyRoomEmptyState');
                if (!countEl || !listEl || !emptyEl) return;
                countEl.textContent = studyRoomStudents.length + ' طالب يذاكرون الآن';
                if (studyRoomStudents.length === 0) {
                    listEl.innerHTML = '';
                    listEl.classList.add('hidden');
                    emptyEl.classList.remove('hidden');
                    return;
                }
                listEl.classList.remove('hidden');
                emptyEl.classList.add('hidden');
                listEl.innerHTML = studyRoomStudents.map((s) => {
                    const activityLabel = s.activity === 'youtube' ? 'يوتيوب دراسة' : (s.activity === 'focus' ? 'وضع التركيز' : 'مؤقت المذاكرة');
                    const activityIcon = s.activity === 'youtube' ? 'video' : (s.activity === 'focus' ? 'smartphone' : 'timer');
                    const minutes = s.startedAt ? Math.max(0, Math.round((Date.now() - s.startedAt) / 60000)) : 0;
                    return `
                        <div class="rounded-2xl border p-3 flex flex-col items-center justify-center text-center relative theme-transition" style="background-color: var(--surface); border-color: var(--border); aspect-ratio: 1;">
                            <div class="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-success unread-dot"></div>
                            <img src="${safeImage(s.avatar)}" alt="${escapeHtml(s.name)}" class="w-14 h-14 rounded-full object-cover mb-2">
                            <div class="text-sm font-bold line-clamp-1 w-full theme-transition" style="color: var(--text);">${escapeHtml(s.name)}${this.vb(s.uid)}</div>
                            <div class="flex items-center gap-1 text-[10px] mt-1 theme-transition" style="color: var(--text2);">
                                <i data-lucide="${activityIcon}" class="w-3 h-3"></i>${activityLabel}
                            </div>
                            <div class="text-[10px] mt-0.5 theme-transition" style="color: var(--text2);">منذ ${minutes} دقيقة</div>
                        </div>
                    `;
                }).join('');
            },

            joinStudyRoom(activity) {
                if (!window.firebaseDb || !this.isLoggedIn || !this.currentUser) return;
                const uid = this.currentUid();
                const { ref, set, onDisconnect } = window.firebaseDbHelpers;
                const roomRef = ref(window.firebaseDb, 'studyRoom/' + uid);
                set(roomRef, {
                    name: this.currentUser.fullName || 'طالب',
                    avatar: this._avatarLite(),
                    activity: activity,
                    startedAt: Date.now()
                }).catch((err) => console.warn('Join study room failed:', err));
                try {
                    onDisconnect(roomRef).remove();
                } catch (e) {
                    console.warn('onDisconnect setup failed:', e);
                }
            },

            leaveStudyRoom() {
                if (!window.firebaseDb || !this.isLoggedIn || !this.currentUser) return;
                const uid = this.currentUid();
                const { ref, set } = window.firebaseDbHelpers;
                set(ref(window.firebaseDb, 'studyRoom/' + uid), null).catch((err) => console.warn('Leave study room failed:', err));
            },

            // ==================== DAILY TASKS ====================
            goToTasks() {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول لاستخدام هذه الميزة');
                    this.goToAuth('login');
                    return;
                }
                this.renderTasksList();
                this.switchView('tasksView');
                lucide.createIcons();
            },

            listenForUserTasks() {
                if (!window.firebaseDb || !this.authUid || this._tasksListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._tasksListener = onValue(ref(window.firebaseDb, 'userTasks/' + this.authUid), (snap) => {
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((k) => list.push(vals[k]));
                    }
                    userTasks.length = 0;
                    userTasks.push(...withNumericIds(list));
                    if (this.currentView === 'tasksView') { this.renderTasksList(); lucide.createIcons(); }
                });
            },

            renderTasksList() {
                const listEl = document.getElementById('tasksList');
                const emptyEl = document.getElementById('tasksEmptyState');
                if (!listEl || !emptyEl) return;
                const sorted = [...userTasks].sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
                if (sorted.length === 0) {
                    listEl.innerHTML = '';
                    listEl.classList.add('hidden');
                    emptyEl.classList.remove('hidden');
                    return;
                }
                listEl.classList.remove('hidden');
                emptyEl.classList.add('hidden');
                const now = Date.now();
                listEl.innerHTML = sorted.map((t) => {
                    const overdue = !t.done && t.dueAt && t.dueAt <= now;
                    const timeLabel = t.dueAt ? new Date(t.dueAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '';
                    return `
                        <div class="rounded-xl border p-3 flex items-center gap-3 theme-transition" style="background-color: var(--surface); border-color: ${overdue ? '#DC2626' : 'var(--border)'};">
                            <button onclick="app.toggleTaskDone(${jsNum(t.id)})" class="btn-press w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0" style="border-color: ${t.done ? '#16A34A' : 'var(--border)'}; background-color: ${t.done ? '#16A34A' : 'transparent'};">
                                ${t.done ? '<i data-lucide="check" class="w-4 h-4 text-white"></i>' : ''}
                            </button>
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-bold ${t.done ? 'line-through' : ''} theme-transition" style="color: ${t.done ? 'var(--text2)' : 'var(--text)'};">${escapeHtml(t.text)}</div>
                                <div class="text-xs mt-0.5" style="color: ${overdue ? '#DC2626' : 'var(--text2)'};">${overdue ? 'متأخرة • ' : ''}الساعة ${escapeHtml(timeLabel)}</div>
                            </div>
                            <button onclick="app.deleteTask(${jsNum(t.id)})" class="btn-press w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background-color: var(--input-bg);">
                                <i data-lucide="trash-2" class="w-4 h-4" style="color: #DC2626;"></i>
                            </button>
                        </div>
                    `;
                }).join('');
            },

            addTask() {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول لإضافة مهام');
                    this.goToAuth('login');
                    return;
                }
                const textInput = document.getElementById('taskTextInput');
                const timeInput = document.getElementById('taskTimeInput');
                if (!textInput || !timeInput) return;
                const text = textInput.value.trim();
                const time = timeInput.value;
                if (!text) {
                    this.showToast('اكتب نص المهمة');
                    return;
                }
                if (!time) {
                    this.showToast('حدد وقت إنجاز المهمة');
                    return;
                }
                const [hours, minutes] = time.split(':').map(Number);
                const due = new Date();
                due.setHours(hours, minutes, 0, 0);
                const id = Date.now();
                const task = { id, text, dueAt: due.getTime(), done: false };
                userTasks.push(task);
                this.renderTasksList();
                lucide.createIcons();
                textInput.value = '';
                timeInput.value = '';
                if ('Notification' in window && Notification.permission === 'default') {
                    Notification.requestPermission().catch((err) => console.warn('Notification permission request failed:', err));
                }
                if (window.firebaseDb) {
                    const { ref, set } = window.firebaseDbHelpers;
                    set(ref(window.firebaseDb, 'userTasks/' + this.currentUid() + '/' + id), task).catch((err) => {
                        console.warn('Save task failed:', err);
                    });
                }
            },

            toggleTaskDone(id) {
                const task = userTasks.find(t => t.id === id);
                if (!task) return;
                task.done = !task.done;
                // FIX: re-opening a task should let it nag again if it's still overdue.
                if (!task.done && this._notifiedOverdueTaskIds) this._notifiedOverdueTaskIds.delete(id);
                this.logDailyActivity({ tasksDone: task.done ? 1 : -1 });
                this.renderTasksList();
                lucide.createIcons();
                if (window.firebaseDb && this.currentUser) {
                    const { ref, set } = window.firebaseDbHelpers;
                    set(ref(window.firebaseDb, 'userTasks/' + this.currentUid() + '/' + id + '/done'), task.done).catch((err) => {
                        console.warn('Update task failed:', err);
                    });
                }
            },

            deleteTask(id) {
                const i = userTasks.findIndex(t => t.id === id);
                if (i > -1) userTasks.splice(i, 1);
                if (this._notifiedOverdueTaskIds) this._notifiedOverdueTaskIds.delete(id);
                this.renderTasksList();
                lucide.createIcons();
                if (window.firebaseDb && this.currentUser) {
                    const { ref, set } = window.firebaseDbHelpers;
                    set(ref(window.firebaseDb, 'userTasks/' + this.currentUid() + '/' + id), null).catch((err) => {
                        console.warn('Delete task failed:', err);
                    });
                }
            },

            // FIX: this fired every 2 minutes for every still-overdue task with no memory
            // of having already notified for it — the same reminder (toast + sound + system
            // notification) kept repeating indefinitely until the task was checked off.
            // `_notifiedOverdueTaskIds` now tracks which overdue tasks have already been
            // announced once; toggling a task back to "not done" clears its entry so it can
            // notify again if it becomes overdue once more.
            checkTaskReminders() {
                if (!this.isLoggedIn || userTasks.length === 0) return;
                if (!this._notifiedOverdueTaskIds) this._notifiedOverdueTaskIds = new Set();
                const now = Date.now();
                const overdue = userTasks.filter(t => !t.done && t.dueAt && t.dueAt <= now && !this._notifiedOverdueTaskIds.has(t.id));
                if (overdue.length === 0) return;
                overdue.forEach((t) => this._notifiedOverdueTaskIds.add(t.id));
                this.playNotifySound();
                const summary = overdue.length === 1 ? overdue[0].text : (overdue.length + ' مهام متأخرة');
                this.showToast('تذكير: ' + summary + ' — لسه ما خلّصتها');
                if ('Notification' in window && Notification.permission === 'granted') {
                    try {
                        new Notification('تذكير بمهامك', { body: summary, icon: 'icons/icon-192.png' });
                    } catch (e) {
                        console.warn('Task notification failed:', e);
                    }
                }
            },

            // ==================== MONTHLY CALENDAR / PROGRESS ====================
            logDailyActivity(deltas) {
                if (!window.firebaseDb || !this.authUid) return;
                this._twinReport(deltas);
                if (deltas.minutes > 0) this._lbStudy(deltas.minutes);
                const dateStr = this.localDateStr();
                const { ref, runTransaction } = window.firebaseDbHelpers;
                const path = 'userActivity/' + this.authUid + '/' + dateStr;
                runTransaction(ref(window.firebaseDb, path), (cur) => {
                    const c = cur || { date: dateStr, points: 0, studySessions: 0, tasksDone: 0 };
                    c.date = dateStr;
                    c.points = (c.points || 0) + (deltas.points || 0);
                    c.studySessions = (c.studySessions || 0) + (deltas.studySessions || 0);
                    c.tasksDone = (c.tasksDone || 0) + (deltas.tasksDone || 0);
                    // minutes of real study (timer, focus, forest, war, garden), for the weekly summary
                    if (deltas.minutes) c.minutes = Math.max(0, (c.minutes || 0) + deltas.minutes);
                    return c;
                }).then((result) => {
                    if (result && result.committed && result.snapshot.exists()) {
                        monthlyActivity[dateStr] = result.snapshot.val();
                        if (this.currentView === 'calendarView') this.renderCalendar();
                    }
                }).catch((err) => {
                    console.warn('Activity log failed:', err);
                });
            },

            async loadMonthlyActivity() {
                if (!window.firebaseDb || !this.authUid) { this.renderCalendar(); return; }
                const { ref, get } = window.firebaseDbHelpers;
                try {
                    const snap = await get(ref(window.firebaseDb, 'userActivity/' + this.authUid));
                    Object.keys(monthlyActivity).forEach((k) => delete monthlyActivity[k]);
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((d) => { monthlyActivity[d] = vals[d]; });
                    }
                } catch (err) {
                    console.warn('Activity load failed:', err);
                }
                this.renderCalendar();
            },

            goToCalendar() {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول لعرض تقويم أدائك');
                    this.goToAuth('login');
                    return;
                }
                this.calendarMonthOffset = 0;
                this.switchView('calendarView');
                this.loadMonthlyActivity();
                lucide.createIcons();
            },

            changeCalendarMonth(delta) {
                this.calendarMonthOffset += delta;
                this.renderCalendar();
                lucide.createIcons();
            },

            renderCalendar() {
                const grid = document.getElementById('calendarGrid');
                const label = document.getElementById('calendarMonthLabel');
                const statsEl = document.getElementById('calendarStats');
                const chartEl = document.getElementById('calendarChart');
                if (!grid) return;
                const now = new Date();
                const target = new Date(now.getFullYear(), now.getMonth() + this.calendarMonthOffset, 1);
                const year = target.getFullYear();
                const month = target.getMonth();
                const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
                if (label) label.textContent = monthNames[month] + ' ' + year;
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const startWeekday = new Date(year, month, 1).getDay();
                const todayStr = this.localDateStr(now);

                let cells = '';
                for (let i = 0; i < startWeekday; i++) cells += '<div></div>';
                let monthPoints = 0, monthSessions = 0, monthTasks = 0, activeDays = 0;
                for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
                    const act = monthlyActivity[dateStr];
                    const hasActivity = !!(act && ((act.points || 0) > 0 || (act.studySessions || 0) > 0 || (act.tasksDone || 0) > 0));
                    if (act) {
                        monthPoints += act.points || 0;
                        monthSessions += act.studySessions || 0;
                        monthTasks += act.tasksDone || 0;
                    }
                    if (hasActivity) activeDays++;
                    const isToday = dateStr === todayStr;
                    cells += `
                        <button onclick="app.openCalendarDay(${jsArg(dateStr)})" class="aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 relative theme-transition ${isToday ? 'border-2 border-primary' : ''}" style="background-color: ${hasActivity ? 'var(--input-bg)' : 'transparent'};">
                            <span class="text-xs font-bold theme-transition" style="color: ${isToday ? 'var(--text)' : 'var(--text2)'};">${d}</span>
                            ${hasActivity ? '<span class="w-1.5 h-1.5 rounded-full bg-success"></span>' : ''}
                        </button>
                    `;
                }
                grid.innerHTML = cells;

                if (chartEl) {
                    let maxPoints = 1;
                    for (let d = 1; d <= daysInMonth; d++) {
                        const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
                        const pts = (monthlyActivity[dateStr] && monthlyActivity[dateStr].points) || 0;
                        if (pts > maxPoints) maxPoints = pts;
                    }
                    let bars = '';
                    for (let d = 1; d <= daysInMonth; d++) {
                        const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
                        const pts = (monthlyActivity[dateStr] && monthlyActivity[dateStr].points) || 0;
                        const heightPct = pts > 0 ? Math.max(6, Math.round((pts / maxPoints) * 100)) : 3;
                        bars += `<div class="flex-1 rounded-t-sm ${pts > 0 ? 'bg-primary' : 'theme-transition'}" style="height: ${heightPct}%; ${pts === 0 ? 'background-color: var(--border);' : ''}" title="${dateStr}: ${pts} نقطة"></div>`;
                    }
                    chartEl.innerHTML = bars;
                }

                if (statsEl) {
                    statsEl.innerHTML = `
                        <div class="text-center"><div class="text-lg font-bold text-primary">${monthPoints}</div><div class="text-[10px] theme-transition" style="color: var(--text2);">نقطة هذا الشهر</div></div>
                        <div class="text-center"><div class="text-lg font-bold text-primary">${monthSessions}</div><div class="text-[10px] theme-transition" style="color: var(--text2);">جلسة مذاكرة</div></div>
                        <div class="text-center"><div class="text-lg font-bold text-primary">${monthTasks}</div><div class="text-[10px] theme-transition" style="color: var(--text2);">مهمة منجزة</div></div>
                        <div class="text-center"><div class="text-lg font-bold text-primary">${activeDays}</div><div class="text-[10px] theme-transition" style="color: var(--text2);">يوم نشاط</div></div>
                    `;
                }
            },

            openCalendarDay(dateStr) {
                const act = monthlyActivity[dateStr];
                if (!act || ((act.points || 0) === 0 && (act.studySessions || 0) === 0 && (act.tasksDone || 0) === 0)) {
                    this.showToast(dateStr + ': لا يوجد نشاط مسجل بهذا اليوم');
                    return;
                }
                this.showToast(dateStr + ': ' + (act.points || 0) + ' نقطة • ' + (act.studySessions || 0) + ' جلسة مذاكرة • ' + (act.tasksDone || 0) + ' مهمة منجزة');
            },

            // ==================== NOTIFICATION PREFERENCES ====================
            loadNotifPrefs() {
                try {
                    const raw = localStorage.getItem('iraqiStudentNotifPrefs');
                    if (raw) this.notifPrefs = { ...this.notifPrefs, ...JSON.parse(raw) };
                    // the teachers page used to keep its own switch
                    if (localStorage.getItem('isp_tube_push') === '0') { this.notifPrefs.tube = false; localStorage.removeItem('isp_tube_push'); this.saveNotifPrefs(); }
                } catch (e) {
                    console.warn('Load notif prefs failed:', e);
                }
            },

            saveNotifPrefs(fromServer) {
                try {
                    localStorage.setItem('iraqiStudentNotifPrefs', JSON.stringify(this.notifPrefs));
                    if (!fromServer) localStorage.setItem('iraqiStudentNotifPrefsAt', String(Date.now()));
                } catch (e) {
                    console.warn('Save notif prefs failed:', e);
                }
                if (!fromServer) this._npPush();
            },
            // ----- the notification switches follow the ACCOUNT (npref/{uid}), not the phone -----
            // They used to live only on the phone, so a second phone / the website / a reinstall started with everything on and wrote "on" over the
            // switches (the push tags are kept per account on the push service). Now the newest choice wins everywhere.
            _NP_KINDS: ['urgent', 'motiv', 'holiday', 'announcement', 'tgnews', 'weather', 'res', 'tube', 'tg', 'general', 'lec', 'msg', 'call'],
            _npLocalAt() { try { return Number(localStorage.getItem('iraqiStudentNotifPrefsAt')) || 0; } catch (e) { return 0; } },
            _npCollect() {
                const p = {}; this._NP_KINDS.forEach((k) => { if (this.notifPrefs[k] === false) p[k] = false; });
                const rd = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
                const arr = (k) => { try { const a = JSON.parse(rd(k) || 'null'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string' && /^[A-Za-z0-9_]{2,40}$/.test(x)).map((x) => x.toLowerCase()) : null; } catch (e) { return null; } };
                const out = { p, at: this._npLocalAt() || Date.now() };
                const tm = arr('isp_tg_mute'), th = arr('isp_tg_hide');
                if (tm && tm.length) out.tm = tm.join(',').slice(0, 1400);
                if (th) out.th = th.join(',').slice(0, 2900);
                if (rd('isp_tg_sel') === '1') out.ts = true;
                return out;
            },
            _npPush() {
                if (!this.isLoggedIn || !this.authUid || !window.firebaseDb) return;
                clearTimeout(this._npT);
                this._npT = setTimeout(() => {
                    const { ref, set } = window.firebaseDbHelpers;
                    set(ref(window.firebaseDb, 'npref/' + this.authUid), this._npCollect()).catch(() => {});
                }, 1500);
            },
            async _npPull() {
                const uid = this.authUid;
                if (!this.isLoggedIn || !uid || !window.firebaseDb || this._npUid === uid) return;
                this._npUid = uid; this._npDone = false;
                const finish = () => { this._npDone = true; try { this._pnSync(); } catch (e) {} };
                const guard = setTimeout(() => { if (!this._npDone) finish(); }, 8000);   // offline: carry on with this phone's own choices
                try {
                    const { ref, get } = window.firebaseDbHelpers;
                    const r = (await get(ref(window.firebaseDb, 'npref/' + uid))).val(), mine = this._npLocalAt();
                    if (r && typeof r === 'object' && Number(r.at) > mine) {
                        const np = { ...this.notifPrefs }; this._NP_KINDS.forEach((k) => { np[k] = !(r.p && r.p[k] === false); });
                        this.notifPrefs = np;
                        try {
                            localStorage.setItem('iraqiStudentNotifPrefs', JSON.stringify(np)); localStorage.setItem('iraqiStudentNotifPrefsAt', String(Number(r.at)));
                            localStorage.setItem('isp_tg_mute', JSON.stringify(r.tm ? String(r.tm).split(',').filter(Boolean) : []));
                            if (typeof r.th === 'string') localStorage.setItem('isp_tg_hide', JSON.stringify(r.th.split(',').filter(Boolean))); else localStorage.removeItem('isp_tg_hide');
                            if (r.ts === true) localStorage.setItem('isp_tg_sel', '1'); else localStorage.removeItem('isp_tg_sel');
                            localStorage.setItem('isp_tg_dirty', '1');
                        } catch (e) {}
                        this.updateNotifBadges && this.updateNotifBadges();
                    } else if (mine > 0 && (!r || mine > Number(r.at || 0))) {
                        set_(this, uid);
                    }
                } catch (e) { /* offline: the phone's own choices stay */ }
                clearTimeout(guard); finish();
                function set_(app, u) { const { ref, set } = window.firebaseDbHelpers; set(ref(window.firebaseDb, 'npref/' + u), app._npCollect()).catch(() => {}); }
            },

            // Every kind of notification the student can switch off. "push" ones are also read by the server before it
            // sends to the phone: broadcast kinds through OneSignal tags (pn_<kind>, coach, tube), person-to-person kinds
            // (msg, call) through pushPrefs/{uid} in the database, and lecture reminders by not scheduling them at all.
            PN_LIST: [
                ['urgent', 'الأخبار العاجلة', 'خبر مهم ومستعجل من الوزارة', 'siren', '#DC2626'],
                ['motiv', 'رسائل التحفيز', 'رسائل تحفيز لدراستك بأوقات الدوام', 'flame', '#F97316'],
                ['holiday', 'الدوام والعطل', 'باچر دوام لو عطلة؟ وقرارات الدوام لمحافظتك', 'calendar-days', '#0EA5E9'],
                ['announcement', 'الأخبار والإعلانات الرسمية', 'القرارات والنتائج والإعلانات', 'newspaper', '#2563EB'],
                ['tgnews', 'أخبار عامة', 'الأخبار اللي تنزل لحالها خلال اليوم', 'newspaper', '#0891B2'],
                ['weather', 'الأنواء الجوية', 'حالة الطقس والتنبيهات الجوية', 'cloud-sun', '#0891B2'],
                ['res', 'ملازم جديدة', 'لما تنزل ملزمة جديدة', 'book-open', '#16A34A'],
                ['tube', 'محاضرات المدرسين', 'لما أستاذ ينزل فيديو جديد', 'clapperboard', '#EF4444'],
                ['tg', 'قنوات تلكرام المدرسين', 'لما أستاذ ينزل منشور أو ملف بقناته', 'send', '#0284C7'],
                ['general', 'إعلانات عامة من الإدارة', 'أخبار ومناسبات عامة', 'megaphone', '#7C3AED'],
                ['coach', 'رسائل المعلم', 'تشجيع وتذكير بالدراسة', 'message-circle-warning', '#6366F1'],
                ['lec', 'تذكير المحاضرات', 'قبل موعد محاضرتك بجدولك', 'alarm-clock', '#F59E0B'],
                ['msg', 'رسائل الأصدقاء', 'لما يراسلك صديق', 'message-circle', '#EC4899'],
                ['call', 'المكالمات', 'لما أحد يتصل بيك', 'phone-call', '#0D9488'],
            ],
            // the kinds the student switched off, saved next to a Firebase push token so the Cloud Function can skip them
            _pnOff() { return this.PN_LIST.map((x) => x[0]).filter((k) => !this._pnOn(k)); },
            // is this in-app notification wanted: its kind is on, and (for the news that came by themselves from Telegram channels) so is that switch
            _notifOn(n) { return this.notifPrefs[(n && n.type) || 'announcement'] !== false && !(n && n.src === 'tg' && this.notifPrefs.tgnews === false); },
            _pnOn(k) { return k === 'coach' ? !!this._coachGet().on : this.notifPrefs[k] !== false; },
            // sets tags (t = {key: value}) and removes others (rm = [key]) on the push service; the removed ones are written as "" where removal is not offered
            _pnTags(t, rm) {
                rm = rm || [];
                try {
                    const U = (this._os && this._os.User && this._os.User.addTags && this._os.User) || (window.OneSignal && OneSignal.User && OneSignal.User.addTags && OneSignal.User);
                    if (U) {
                        if (Object.keys(t).length) U.addTags(t);
                        if (rm.length) { if (U.removeTags) U.removeTags(rm); else U.addTags(Object.fromEntries(rm.map((k) => [k, '']))); }
                        return true;
                    }
                    const w = this._wtn && this._wtn(), all = Object.assign({}, t, Object.fromEntries(rm.map((k) => [k, ''])));
                    if (w && w.os === 'android' && typeof w.a.setUserTags === 'function') { w.a.setUserTags(JSON.stringify(all)); return true; }
                    else if (w && w.i) { w.i.postMessage({ action: 'setUserTags', tags: all }); return true; }
                    return false;   // the push service is not ready yet: the caller may try again
                } catch (e) { console.warn('push tags failed', e); return false; }
            },
            // pushes the student's choices to the places that decide what reaches the phone
            _pnSync() {
                if (this.isLoggedIn && this.authUid && this._npDone !== true) {   // the account's own choices are not read yet: read them first (it comes back here)
                    if (this._npUid !== this.authUid) this._npPull();
                    return;
                }
                const t = {};
                if (this._fcmPath && window.firebaseDb) { const { ref, update } = window.firebaseDbHelpers; update(ref(window.firebaseDb, this._fcmPath), { off: this._pnOff() }).catch(() => {}); }
                // the broadcast kinds the server filters on: the tag off_<kind> exists only while the kind is switched off
                const rm = [];
                ['urgent', 'announcement', 'weather', 'res', 'general', 'holiday', 'motiv', 'tgnews'].forEach((k) => { if (this._pnOn(k)) rm.push('off_' + k); else t['off_' + k] = '1'; });
                rm.push('pn_urgent', 'pn_announcement', 'pn_weather', 'pn_res', 'pn_general'); // the first version of these tags
                t.tube = this._pnOn('tube') ? 'on' : 'off'; t.coach = this._pnOn('coach') ? 'on' : 'off';
                this._pnTags(t, rm);
                this._tgTagSync();
                if (this.isLoggedIn && this.authUid && window.firebaseDb) {
                    const off = {}; ['msg', 'call'].forEach((k) => { if (!this._pnOn(k)) off[k] = false; });
                    const sig = JSON.stringify(off);
                    if (this._pnSig === this.authUid + sig) return;
                    this._pnSig = this.authUid + sig;
                    const { ref, set } = window.firebaseDbHelpers;
                    set(ref(window.firebaseDb, 'pushPrefs/' + this.authUid), Object.keys(off).length ? off : null).catch(() => { this._pnSig = ''; });
                }
            },
            // the notification tone (Android app only): picked here, played by the phone itself when a push arrives, even with the app closed
            NOTIF_SOUNDS: [['default', 'الافتراضي (نغمة الهاتف)'], ['chime', 'رنين'], ['drop', 'قطرة'], ['harp', 'قيثارة'], ['bell', 'جرس'], ['marimba', 'ماريمبا'], ['pop', 'فقاعة'], ['crystal', 'كريستال'], ['dingdong', 'دينغ دونغ'], ['beep', 'تنبيه خفيف'], ['silent', 'بدون صوت (اهتزاز فقط)']],
            _nsOk() { const N = window.IspNative; return !!(N && typeof N.setSound === 'function'); },
            _nsGet() { try { const v = localStorage.getItem('isp:notifSound'); return this.NOTIF_SOUNDS.some((x) => x[0] === v) ? v : 'default'; } catch (e) { return 'default'; } },
            _nsRow() {
                if (!this._nsOk()) return '';
                const cur = this.NOTIF_SOUNDS.find((x) => x[0] === this._nsGet());
                return `<button class="btn-press w-full mb-3 py-3 px-3 rounded-xl text-sm font-bold flex items-center gap-3 theme-transition" style="background-color: var(--input-bg); color: var(--text); border: 1px solid var(--border);" onclick="app.nsOpen()">
                    <i data-lucide="music" class="w-5 h-5"></i><span class="flex-1 text-right">نغمة الإشعار</span><span class="text-xs font-normal" style="color: var(--text2);">${escapeHtml(cur[1])}</span></button>`;
            },
            nsOpen() {
                const titleEl = document.getElementById('walletModalTitle'), content = document.getElementById('walletModalContent');
                if (!content) return;
                if (titleEl) titleEl.textContent = 'نغمة الإشعار';
                const cur = this._nsGet();
                content.innerHTML = `<p class="text-xs mb-3" style="color: var(--text2);">دوس على النغمة تسمعها وتنختار. تشتغل لما يوصلك إشعار وانت خارج التطبيق. اختيارك يخصك أنت بهذا الجهاز.</p>
                    <div class="flex flex-col gap-2">${this.NOTIF_SOUNDS.map(([id, n]) => `
                        <div class="flex items-center gap-3 p-3 rounded-xl theme-transition" style="background-color: var(--input-bg); ${id === cur ? 'box-shadow: inset 0 0 0 2px rgb(var(--p));' : ''}">
                            <button class="btn-press flex-1 min-w-0 flex items-center gap-3 text-right" onclick="app.nsPick('${id}')">
                                <span class="w-5 h-5 rounded-full flex-shrink-0" style="border: 2px solid rgb(var(--p)); ${id === cur ? 'background: rgb(var(--p));' : ''}"></span>
                                <span class="text-sm font-bold" style="color: var(--text);">${n}</span>
                            </button>
                            ${id !== 'default' && id !== 'silent' ? `<button class="btn-press w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style="background: rgb(var(--p)); color: #fff;" onclick="app.nsPreview('${id}')" aria-label="استمع"><i data-lucide="play" class="w-4 h-4"></i></button>` : ''}
                        </div>`).join('')}</div>
                    <button class="btn-press w-full mt-3 py-2 rounded-xl text-xs" style="color: var(--text2);" onclick="app.openNotifPreferences()">رجوع</button>`;
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
            },
            nsPreview(id) {
                try {
                    if (this._nsAudio) { this._nsAudio.pause(); }
                    this._nsAudio = new Audio('assets/notif/' + id + '.wav');
                    this._nsAudio.play().catch(() => {});
                } catch (e) { /* no preview */ }
            },
            nsPick(id) {
                if (!this.NOTIF_SOUNDS.some((x) => x[0] === id)) return;
                try { localStorage.setItem('isp:notifSound', id); } catch (e) { /* kept natively anyway */ }
                try { window.IspNative.setSound(id); } catch (e) { /* older app */ }
                if (id !== 'default' && id !== 'silent') this.nsPreview(id);
                this.nsOpen();
            },
            // inside the phone app: is the system switch on, and a button to the phone's page where the pop-up on the screen is switched on
            _notifHelp() {
                const N = window.IspNative;
                if (!N || typeof N.notifSettings !== 'function') return '';
                let on = true; try { on = N.notifOn(); } catch (e) {}
                return `<div class="p-3 mb-3 rounded-xl" style="background-color: var(--input-bg); border: 1px solid ${on ? 'var(--border)' : '#DC2626'};">
                    <div class="text-sm font-bold mb-1" style="color: var(--text);">${on ? 'حتى ينبثق الإشعار على الشاشة وانت خارج التطبيق' : 'إشعارات التطبيق مطفية من إعدادات الهاتف'}</div>
                    <div class="text-xs mb-2" style="color: var(--text2);">${on ? 'افتح إعدادات إشعارات التطبيق، واختار الأهمية "عالية"، وفعّل "عرض منبثق" أو "الإشعارات العائمة" (الاسم يختلف حسب نوع الهاتف).' : 'فعّل الإشعارات حتى توصلك.'}</div>
                    <button class="btn-press w-full py-2.5 rounded-xl text-sm font-bold text-white" style="background: rgb(var(--p));" onclick="window.IspNative.notifSettings()">افتح إعدادات إشعارات التطبيق</button>
                </div>`;
            },
            // "why do the notifications not arrive?": what the phone says, and a test push sent to this student only
            async pushCheck(result) {
                const content = document.getElementById('walletModalContent'); if (!content) return;
                const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua), native = this._isNative();
                const standalone = this._iosStandalone() || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
                const perm = this._pushPerm(), os = this._os, sub = os && os.User && os.User.PushSubscription;
                let opted = false, sid = ''; try { opted = !!(sub && sub.optedIn); sid = (sub && sub.id) || ''; } catch (e) {}
                const rows = [];
                if (ios && !native) rows.push([standalone, 'التطبيق مفتوح من أيقونة الشاشة الرئيسية', 'افتحه من الأيقونة اللي أضفتها، مو من Safari. إشعارات الآيفون تشتغل بس من الأيقونة']);
                rows.push([native || 'Notification' in window, 'الجهاز يدعم الإشعارات', ios ? 'تحتاج iOS 16.4 أو أحدث، وتفتحه من الأيقونة' : 'المتصفح ما يدعم الإشعارات']);
                if (!native) rows.push([!!os, 'خدمة الإشعارات (OneSignal) تحمّلت', 'ما تحمّلت' + (this._osErr ? ': ' + this._osErr : ' بعد. انتظر شوية وافتح الفحص ثاني. إذا بقت كذا فالموقع غير مضاف بإعدادات OneSignal (منصة Web)')]);
                rows.push([perm === 'granted', 'إذن الإشعارات', perm === 'denied' ? (ios ? 'مسدود. من إعدادات الآيفون ثم الإشعارات اختار التطبيق وفعّله. أو احذف الأيقونة وأضفها من جديد' : 'مسدود من إعدادات الجهاز، فعّله من هناك') : 'لسه ما انمنح، اضغط "تفعيل الإشعارات" تحت وبعدين "سماح"']);
                rows.push([native ? perm === 'granted' : (opted && !!sid), 'تسجيل الجهاز بخدمة الإشعارات', 'ما تسجل بعد. سكّر التطبيق وافتحه ثاني وانتظر دقيقة، أو اضغط تفعيل الإشعارات']);
                const li = rows.map(([ok, t, h]) => `<div class="flex items-start gap-3 p-3 rounded-xl" style="background-color: var(--input-bg);"><span style="font-size:18px;line-height:1.2;color:${ok ? '#16A34A' : '#DC2626'}">${ok ? '&#10003;' : '&#10007;'}</span><div class="flex-1 min-w-0"><div class="text-sm font-bold" style="color: var(--text);">${t}</div>${ok ? '' : `<div class="text-xs mt-1" style="color: var(--text2);">${h}</div>`}</div></div>`).join('');
                const msg = result ? `<p class="text-xs mt-3 p-3 rounded-xl" style="background-color: var(--input-bg); color: var(--text);">${escapeHtml(result)}</p>` : '';
                content.innerHTML = `<p class="text-sm font-bold mb-3" style="color: var(--text);">فحص الإشعارات</p><div class="flex flex-col gap-2">${li}</div>${msg}
                    <div class="flex flex-col gap-2 mt-3">
                        ${perm === 'default' ? '<button class="btn-press w-full py-3 rounded-xl text-sm font-bold text-white" style="background: rgb(var(--p));" onclick="app.pushCheckEnable()">تفعيل الإشعارات</button>' : ''}
                        <button class="btn-press w-full py-3 rounded-xl text-sm font-bold" style="background-color: var(--input-bg); color: var(--text); border: 1px solid var(--border);" onclick="app.pushCheckTest()">أرسل لي إشعار تجريبي</button>
                        <button class="btn-press w-full py-2 rounded-xl text-xs" style="color: var(--text2);" onclick="app.openNotifPreferences()">رجوع</button>
                    </div>`;
                const t = document.getElementById('walletModalTitle'); if (t) t.textContent = 'فحص الإشعارات';
            },
            pushCheckEnable() {
                if (!this._os && !this._isNative()) { this.pushCheck('الإشعارات تشتغل من رابط الموقع المثبّت أو من التطبيق. إذا أنت على الآيفون افتحه من الأيقونة'); return; }
                Promise.resolve(this._os.Notifications.requestPermission()).then(() => { try { this.syncWebPush(); } catch (e) {} setTimeout(() => this.pushCheck(), 1500); }).catch(() => this.pushCheck());
            },
            async pushCheckTest() {
                try {
                    const user = window.firebaseAuth && window.firebaseAuth.currentUser; if (!user) { this.pushCheck('سجّل دخولك أول'); return; }
                    const cu = String((this.siteConfig && this.siteConfig.tutorUrl) || '').trim().replace(/\/+$/, '');
                    const base = /^https:\/\/[^\s]+$/.test(cu) ? cu : 'https://isp-tutor.efceg-xsax.workers.dev';
                    const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await user.getIdToken()) }, body: JSON.stringify({ mode: 'selftest' }) });
                    const j = await r.json().catch(() => ({}));
                    if (r.status === 429) { this.pushCheck('اصبر شوية وجرّب ثاني'); return; }
                    if (!r.ok) { this.pushCheck('تعذر الإرسال (' + (j.error || r.status) + ')'); return; }
                    this.pushCheck(j.id && j.recipients > 0 ? 'انرسل لك إشعار. إذا ما وصل خلال دقيقة، شوف إعدادات الإشعارات بالتلفون.' : 'الخدمة ما لكت جهازك مسجّل، فما كو وين تدز الإشعار. يعني الإذن ما انمنح أو الجهاز ما تسجل بعد. اضغط "تفعيل الإشعارات"، وإذا بعدها ما اشتغل فإعداد الويب بخدمة OneSignal ناقص (يسويه صاحب المنصة).');
                } catch (e) { this.pushCheck('تعذر الاتصال بالخادم'); }
            },
            openNotifPreferences() {
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'تفضيلات الإشعارات';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                const row = ([k, t, d, ic, c]) => `
                    <div class="flex items-center gap-3 p-3 rounded-xl theme-transition" style="background-color: var(--input-bg);">
                        <span class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background:${c}22;color:${c}"><i data-lucide="${ic}" class="w-5 h-5"></i></span>
                        <div class="flex-1 min-w-0"><div class="text-sm font-bold theme-transition" style="color: var(--text);">${t}</div><div class="text-xs theme-transition" style="color: var(--text2);">${d}</div></div>
                        <label class="toggle-switch flex-shrink-0"><input type="checkbox" ${this._pnOn(k) ? 'checked' : ''} onchange="app.toggleNotifPref(${jsArg(k)})"><span class="toggle-slider"></span></label>
                    </div>`;
                const rest = ['circular', 'update', 'reminder'];
                const perm = this._pushPerm && this._pushPerm();
                content.innerHTML = `
                    <p class="text-xs mb-3 theme-transition" style="color: var(--text2);">اختر الإشعارات اللي تريد توصلك، واللي طفيتها ما توصلك بالهاتف ولا تظهر بقائمة الإشعارات.</p>
                    ${this._notifHelp()}
                    ${this._nsRow()}
                    <button class="btn-press w-full mb-3 py-3 rounded-xl text-sm font-bold theme-transition" style="background-color: var(--input-bg); color: var(--text); border: 1px solid var(--border);" onclick="app.pushCheck()">فحص الإشعارات وإرسال تجربة</button>
                    ${perm === 'denied' ? '<p class="text-xs mb-3" style="color:#DC2626">إشعارات الهاتف مسدودة من إعدادات الجهاز، فعّلها من هناك حتى توصلك: إعدادات الهاتف ثم التطبيقات ثم أكاديمي السادس ثم الإشعارات.</p>'
                        : perm === 'default' ? '<button class="btn-press w-full mb-3 py-3 rounded-xl text-sm font-bold text-white" style="background: rgb(var(--p));" onclick="app.enableWebPush()">فعّل إشعارات الهاتف حتى توصلك وانت خارج التطبيق</button>' : ''}
                    <div class="flex flex-col gap-2">${this.PN_LIST.map(row).join('')}</div>
                    <p class="text-xs mt-4 mb-2 font-bold theme-transition" style="color: var(--text2);">تظهر داخل التطبيق فقط</p>
                    <div class="flex flex-col gap-2">${rest.map((type) => `
                        <div class="flex items-center gap-3 p-3 rounded-xl theme-transition" style="background-color: var(--input-bg);">
                            <div class="flex-1 min-w-0 text-sm font-bold theme-transition" style="color: var(--text);">${escapeHtml(notificationTypes[type].label)}</div>
                            <label class="toggle-switch flex-shrink-0"><input type="checkbox" ${this.notifPrefs[type] !== false ? 'checked' : ''} onchange="app.toggleNotifPref(${jsArg(type)})"><span class="toggle-slider"></span></label>
                        </div>`).join('')}</div>`;
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
            },

            toggleNotifPref(type) {
                if (type === 'coach') {
                    const c = this._coachGet(); c.on = !c.on; this._coachSave(c); this._coachTag(c.on);
                } else {
                    this.notifPrefs[type] = this.notifPrefs[type] === false ? true : false;
                    this.saveNotifPrefs();
                    if (type === 'lec' && this._tbPushSync) this._tbPushSync(true);
                }
                this._pnSync();
                this.updateNotifBadges();
                if (this.currentView === 'notificationsView') this.renderNotificationsList();
            },

            // ==================== SHARED: FIND STUDENT BY NUMBER ====================
            // Students' full records (email, phone, balance...) are only readable by their owner and
            // the panel. Others are found through a small public directory: pub/{uid} = { n, s, g }
            // (name, student number, governorate) and numIndex/{number} = uid; the photo and points
            // come from the leaderboard, which is public anyway.
            // this student's own entry in the directory
            _pubSync(uid, u) {
                if (!window.firebaseDb || !uid || !u) return;
                const { ref, update, get, set } = window.firebaseDbHelpers;
                const rec = { n: String(u.fullName || 'طالب').slice(0, 80), s: String(u.studentNumber || '').slice(0, 12), g: String(u.governorate || '').slice(0, 30) };
                const key = JSON.stringify(rec);
                if (this._pubLast === uid + key) return;
                this._pubLast = uid + key;
                update(ref(window.firebaseDb, 'pub/' + uid), rec).catch(() => {});
                this._avatarPush(uid, u);
                if (/^[0-9]{3,12}$/.test(rec.s)) {
                    get(ref(window.firebaseDb, 'numIndex/' + rec.s)).then((sn) => { if (!sn.exists()) return set(ref(window.firebaseDb, 'numIndex/' + rec.s), uid); }).catch(() => {});
                }
            },
            // a small copy of the student's photo goes to the tutor server once (free Cloudflare KV), so a push notification
            // to a friend can show this student's photo: a push needs a web address, not stored image data
            async _avatarPush(uid, u) {
                try {
                    const src = u && u.avatar;
                    if (!uid || typeof src !== 'string' || src.indexOf('data:image') !== 0 || !this._tutorUrl) return;
                    const sig = uid + ':' + src.length + ':' + src.slice(-24);
                    let seen = ''; try { seen = localStorage.getItem('isp_avp') || ''; } catch (e) {}
                    if (seen === sig || this._avpBusy) return;
                    this._avpBusy = true;
                    try {
                        const base = this._tutorUrl();
                        const user = window.firebaseAuth && window.firebaseAuth.currentUser;
                        if (!base || !user) return;
                        const img = new Image(); img.src = src; await img.decode();
                        const cv = document.createElement('canvas'); cv.width = cv.height = 192;
                        const cx = cv.getContext('2d'), m = Math.min(img.width, img.height);
                        cx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 192, 192);
                        let data = cv.toDataURL('image/jpeg', 0.75);
                        if (data.length > 58000) data = cv.toDataURL('image/jpeg', 0.5);
                        const tok = await user.getIdToken();
                        const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ mode: 'avatar', img: data }) });
                        if (r.ok) { try { localStorage.setItem('isp_avp', sig); } catch (e) {} }
                        else { let code = ''; try { code = (await r.json()).error || ''; } catch (e) {} this._reportError({ msg: 'avatar upload refused: ' + r.status + ' ' + code, src: 'avatar', line: 0 }); }
                    } finally { this._avpBusy = false; }
                } catch (e) { /* the photo in the push is a bonus; the app image shows instead */ }
            },
            async _pubData(uid, p) {
                let lb = {};
                try { lb = (await window.firebaseDbHelpers.get(window.firebaseDbHelpers.ref(window.firebaseDb, 'leaderboard/' + uid))).val() || {}; } catch (e) {}
                return { uid, data: { fullName: p.n || 'طالب', studentNumber: p.s || '', governorate: p.g || '', avatar: lb.avatar || '', points: lb.points || 0 } };
            },
            async findStudentByNumber(number) {
                if (!window.firebaseDb) return null;
                const { ref, get } = window.firebaseDbHelpers;
                try {
                    const num = String(number || '').trim();
                    if (!/^[0-9]{3,12}$/.test(num)) return null;
                    const snap = await get(ref(window.firebaseDb, 'numIndex/' + num));
                    const uid = snap.val();
                    if (typeof uid !== 'string') return null;
                    const p = await get(ref(window.firebaseDb, 'pub/' + uid));
                    return p.exists() ? this._pubData(uid, p.val()) : null;
                } catch (err) {
                    console.warn('Student search failed:', err);
                    return null;
                }
            },

            // ==================== PRIVATE MESSAGES ====================
            getChatId(otherUid) {
                return [this.authUid, otherUid].sort().join('_');
            },

            goToMessages() {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول لاستخدام الرسائل');
                    this.goToAuth('login');
                    return;
                }
                this.switchView('messagesView');
                this._need('chat').catch(() => {});
                this.listenForUserChats();
                this.renderChatsList();
                lucide.createIcons();
            },

            listenForUserChats() {
                if (!window.firebaseDb || !this.authUid || this._userChatsListener) { this.renderChatsList(); return; }
                const { ref, onValue } = window.firebaseDbHelpers;
                let firstLoad = true;
                const lastSeenAt = {};
                this._userChatsListener = onValue(ref(window.firebaseDb, 'userChats/' + this.authUid), (snap) => {
                    const list = [], ghosts = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        // a conversation always has the other student's id and a last message; anything else is a leftover
                        // (an old version wrote a read flag or a pin under a conversation that had been deleted)
                        Object.keys(vals).forEach((k) => { const e = vals[k]; if (e && typeof e === 'object' && e.otherUid && e.lastAt) list.push(e); else ghosts.push(k); });
                        list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.lastAt || 0) - (a.lastAt || 0));
                    }
                    if (ghosts.length) {
                        const up = {}; ghosts.forEach((k) => { up['userChats/' + this.authUid + '/' + k] = null; });
                        window.firebaseDbHelpers.update(ref(window.firebaseDb), up).catch(() => {});
                    }
                    if (!firstLoad) {
                        list.forEach((entry) => {
                            const prevAt = lastSeenAt[entry.otherUid] || 0;
                            const isNewMessage = entry.unread && (entry.lastAt || 0) > prevAt;
                            const viewingThisChat = this.currentView === 'chatThreadView' && this.currentChatUid === entry.otherUid;
                            if (isNewMessage && !entry.muted && !viewingThisChat && !this.isBlocked(entry.otherUid)) {
                                this.playNotifySound();
                                this.showToast('رسالة جديدة من ' + (entry.otherName || 'طالب'));
                            }
                        });
                    }
                    list.forEach((entry) => { lastSeenAt[entry.otherUid] = entry.lastAt || 0; });
                    firstLoad = false;
                    userChatsList.length = 0;
                    userChatsList.push(...list);
                    this.updateMessagesBadge();
                    if (this.currentView === 'messagesView') this.renderChatsList();
                    this._presenceSync();
                });
            },

            chatFilter: 'all',
            chatSearch: '',

            setChatFilter(f) {
                this.chatFilter = f;
                this.showingArchivedChats = f === 'archived';
                this.renderChatsList();
            },
            setChatSearch(q) { this.chatSearch = String(q || '').trim(); this.renderChatsList(); },
            // kept for older buttons: flips between the inbox and the archive
            toggleArchivedView() { this.setChatFilter(this.chatFilter === 'archived' ? 'all' : 'archived'); },

            renderChatsList() {
                const container = document.getElementById('chatsList');
                const empty = document.getElementById('chatsEmptyState');
                const emptyTitle = document.getElementById('chatsEmptyTitle');
                if (!container || !empty) return;
                const base = userChatsList.filter(c => !this.isBlocked(c.otherUid));
                const inbox = base.filter(c => !c.archived);
                const unread = inbox.filter(c => c.unread && !c.muted);
                const archived = base.filter(c => c.archived);
                const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n ? n : ''; };
                setCount('msCountAll', 0); setCount('msCountUnread', unread.length); setCount('msCountArchived', archived.length);
                document.querySelectorAll('.ms-tab').forEach(t => t.classList.toggle('on', t.dataset.f === this.chatFilter));
                const sub = document.getElementById('msgSubtitle');
                if (sub) sub.textContent = unread.length ? unread.length + ' محادثة فيها رسائل جديدة' : 'دردشاتك الخاصة مع زملائك';

                // online friends strip
                const onlineWrap = document.getElementById('msOnlineWrap');
                const onlineBox = document.getElementById('msOnline');
                const online = friendsList.filter(f => friendsPresence[f.uid] && friendsPresence[f.uid].online && !this.isBlocked(f.uid));
                if (onlineWrap && onlineBox) {
                    onlineWrap.classList.toggle('hidden', online.length === 0);
                    onlineBox.innerHTML = online.map((f, i) => `
                        <button class="ms-on" style="animation-delay:${Math.min(i, 8) * 0.04}s" onclick="app.openChat(${jsArg(f.uid)})">
                            <span class="ms-on-ava"><img src="${personAvatarSrc(f.avatar, f.name)}" alt=""><i></i></span>
                            <span>${escapeHtml(String(f.name || 'طالب').split(' ')[0])}</span>
                        </button>`).join('');
                    const oc = document.getElementById('msOnlineCount');
                    if (oc) oc.textContent = online.length + ' صديق';
                }

                let visible = this.chatFilter === 'archived' ? archived : (this.chatFilter === 'unread' ? unread : inbox);
                const q = this.chatSearch;
                if (q) visible = visible.filter(c => String(c.otherName || '').includes(q) || String(c.lastMessage || '').includes(q) || String(c.otherStudentNumber || '') === q);
                if (visible.length === 0) {
                    container.innerHTML = '';
                    container.classList.add('hidden');
                    empty.classList.remove('hidden');
                    if (emptyTitle) emptyTitle.textContent = q ? 'ما لقينا محادثة مطابقة' : ({ archived: 'لا توجد محادثات مؤرشفة', unread: 'ما عندك رسائل غير مقروءة' }[this.chatFilter] || 'لا توجد رسائل بعد');
                    lucide.createIcons();
                    return;
                }
                container.classList.remove('hidden');
                empty.classList.add('hidden');
                const clock = (ts) => {
                    if (!ts) return '';
                    const d = new Date(ts), now = new Date();
                    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit' });
                    const y = new Date(now); y.setDate(now.getDate() - 1);
                    if (d.toDateString() === y.toDateString()) return 'أمس';
                    return d.getDate() + ' ' + IRAQI_MONTHS[d.getMonth()];
                };
                container.innerHTML = visible.map((c, i) => {
                    const isUnread = c.unread && !c.muted;
                    const isOnline = friendsPresence[c.otherUid] && friendsPresence[c.otherUid].online;
                    return `
                        <div class="ms-row${isUnread ? ' unread' : ''}${c.pinned ? ' pinned' : ''}" style="animation-delay:${Math.min(i, 10) * 0.04}s" onclick="app.openChat(${jsArg(c.otherUid)})">
                            <span class="ms-ava" onclick="event.stopPropagation(); app.openProfileFromChatsList(${jsArg(c.otherUid)})">
                                <img src="${personAvatarSrc(c.otherAvatar, c.otherName)}" alt="${escapeHtml(c.otherName || '')}">${isOnline ? '<i title="متصل الآن"></i>' : ''}
                            </span>
                            <div class="ms-body">
                                <div class="ms-top"><span class="ms-name">${escapeHtml(c.otherName || 'طالب')}${this.vb(c.otherUid)}</span><span class="ms-time">${clock(c.lastAt)}</span></div>
                                <div class="ms-bottom">
                                    <span class="ms-last">${escapeHtml(c.lastMessage || '')}</span>
                                    <span class="ms-icons">${c.pinned ? '<i data-lucide="pin"></i>' : ''}${c.muted ? '<i data-lucide="bell-off"></i>' : ''}</span>
                                    ${isUnread ? '<span class="ms-dot" aria-label="رسالة جديدة"></span>' : ''}
                                </div>
                            </div>
                        </div>`;
                }).join('');
                lucide.createIcons();
            },

            updateMessagesBadge() {
                const count = userChatsList.filter(c => c.unread && !c.muted && !this.isBlocked(c.otherUid)).length;
                const badge = document.getElementById('messagesUnreadBadge');
                if (badge) {
                    badge.classList.toggle('hidden', count === 0);
                    badge.textContent = count;
                }
                const navBadge = document.getElementById('navMessagesBadge');
                if (navBadge) {
                    navBadge.classList.toggle('hidden', count === 0);
                    navBadge.textContent = count;
                }
            },

            openNewChatModal() {
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'رسالة جديدة';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                content.innerHTML = `
                    <div class="flex flex-col gap-3">
                        <label class="text-sm font-bold theme-transition" style="color: var(--text);">أدخل الرقم التعريفي للطالب (5 أرقام)</label>
                        <div class="flex gap-2">
                            <input type="text" id="newChatSearchInput" inputmode="numeric" maxlength="5" placeholder="مثال: 48321" class="flex-1 h-12 px-4 rounded-xl auth-input text-sm" dir="ltr">
                            <button onclick="app.searchNewChatStudent()" class="btn-press px-5 h-12 bg-primary text-white rounded-xl font-bold text-sm flex items-center gap-2 flex-shrink-0"><i data-lucide="search" class="w-4 h-4"></i>بحث</button>
                        </div>
                        <div id="newChatResult"></div>
                    </div>
                `;
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
            },

            async searchNewChatStudent() {
                const input = document.getElementById('newChatSearchInput');
                const result = document.getElementById('newChatResult');
                if (!input || !result) return;
                const query = (input.value || '').trim();
                if (!/^\d{5}$/.test(query)) {
                    result.innerHTML = '<p class="text-xs font-bold text-error">أدخل رقماً تعريفياً مكوّناً من 5 أرقام</p>';
                    return;
                }
                if (query === String(this.currentUser.studentNumber)) {
                    result.innerHTML = '<p class="text-xs font-bold text-error">لا يمكن مراسلة نفسك</p>';
                    return;
                }
                result.innerHTML = '<div class="flex items-center justify-center gap-2 py-3"><i data-lucide="loader-2" class="w-5 h-5 animate-spin" style="color: rgb(var(--p));"></i><span class="text-sm theme-transition" style="color: var(--text2);">جاري البحث...</span></div>';
                lucide.createIcons();
                const found = await this.findStudentByNumber(query);
                if (!found) {
                    result.innerHTML = '<div class="rounded-xl border border-error/30 bg-error/10 p-3 text-center"><p class="text-xs font-bold text-error">لم يتم العثور على طالب بهذا الرقم</p></div>';
                    return;
                }
                this._pendingChatTarget = found;
                result.innerHTML = `
                    <div class="rounded-xl border p-3 theme-transition cursor-pointer" onclick="app.startPendingChat()" style="background-color: var(--surface); border-color: var(--border);">
                        <div class="flex items-center gap-3">
                            <img src="${personAvatarSrc(found.data.avatar, found.data.fullName)}" class="w-12 h-12 rounded-full object-cover flex-shrink-0">
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-bold theme-transition" style="color: var(--text);">${escapeHtml(found.data.fullName || 'طالب')}${this.vb(found.uid)}</div>
                                <div class="text-xs theme-transition" style="color: var(--text2);">رقم: ${escapeHtml(found.data.studentNumber || '—')}</div>
                            </div>
                            <i data-lucide="chevron-left" class="w-5 h-5" style="color: var(--text2);"></i>
                        </div>
                    </div>
                `;
                lucide.createIcons();
            },

            startPendingChat() {
                if (!this._pendingChatTarget) return;
                const t = this._pendingChatTarget;
                this.closeWalletModal();
                this.openChat(t.uid, t.data.fullName, t.data.avatar, t.data.studentNumber);
            },

            // The conversation screen lives in js/chat.js (loaded on first use, and warmed up while the list is open).
            openChat(otherUid, otherName, otherAvatar, otherStudentNumber) {
                if (!this.isLoggedIn || !this.currentUser) { this.showToast('يجب تسجيل الدخول لاستخدام الرسائل'); this.goToAuth('login'); return; }
                if (typeof this._chatOpen === 'function') { this._chatOpen(otherUid, otherName, otherAvatar, otherStudentNumber); return; }
                this._need('chat').then(() => this._chatOpen(otherUid, otherName, otherAvatar, otherStudentNumber)).catch(() => this.showToast('ما انحملت المحادثة، تأكد من النت وحاول مرة ثانية'));
            },

            // ===== Reports: one sheet for every kind of content (message, forum post, idea, dream, student) =====
            // reports/{id} is written by the reporter and read by the admin panel only (البلاغات).
            RP_REASONS: [['abuse', 'شتائم وإساءة'], ['bully', 'تنمر أو تحرش'], ['inappropriate', 'محتوى غير لائق'], ['cheat', 'غش أو معلومات مضللة'], ['spam', 'إعلان أو إزعاج'], ['fake', 'انتحال شخصية'], ['other', 'سبب ثاني']],
            openReportModal(targetUid, messageId, text) {
                this.reportContent({ type: messageId ? 'message' : 'user', targetUid, ref: messageId ? 'msg' + messageId : '', snippet: text || '' });
            },
            reportContent(o) {
                if (!this.isLoggedIn || !this.authUid) { this.showToast('سجّل دخولك حتى تبلّغ'); return; }
                if (o.targetUid && o.targetUid === this.authUid) { this.showToast('هذا المحتوى مالتك'); return; }
                this.closeWalletModal && this.closeWalletModal();
                this.rpClose();
                this._rp = { type: String(o.type || 'user'), targetUid: String(o.targetUid || '').slice(0, 80), ref: String(o.ref || '').slice(0, 120), snippet: String(o.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 300), reason: '' };
                const w = document.createElement('div');
                w.id = 'rpSheet'; w.className = 'rp-w';
                w.innerHTML = '<div class="rp-bd" onclick="app.rpClose()"></div><div class="rp-sheet" role="dialog">' + this._rpBody() + '</div>';
                document.body.appendChild(w);
                requestAnimationFrame(() => w.classList.add('on'));
                lucide.createIcons();
            },
            _rpBody() {
                const r = this._rp;
                return `<div class="rp-h"><span class="rp-ic"><i data-lucide="flag"></i></span><div><b>إبلاغ للإدارة</b><small>ما يعرف الشخص إنك بلّغت</small></div><button class="rp-x" onclick="app.rpClose()" aria-label="إغلاق"><i data-lucide="x"></i></button></div>
                    ${r.snippet ? `<div class="rp-sn">${escapeHtml(r.snippet)}</div>` : ''}
                    <div class="rp-lab">شنو المشكلة؟</div>
                    <div class="rp-chips">${this.RP_REASONS.map((x) => `<button class="${r.reason === x[0] ? 'on' : ''}" onclick="app.rpPick('${x[0]}')">${x[1]}</button>`).join('')}</div>
                    <textarea id="rpNote" rows="2" maxlength="300" placeholder="تفاصيل إضافية (اختياري)"></textarea>
                    <button class="rp-go" id="rpGo" onclick="app.rpSend()"><i data-lucide="send"></i>أرسل البلاغ</button>
                    <p class="rp-foot">الإدارة تراجع البلاغات وتحذف المحتوى المخالف وتحظر اللي يكرر الإساءة.</p>`;
            },
            // small helper for modules that build HTML strings: registers the report data and returns the button
            rpBtn(o, cls, label) {
                this._rpReg = this._rpReg || {};
                const k = 'r' + (this._rpN = (this._rpN || 0) + 1);
                const keys = Object.keys(this._rpReg);
                if (keys.length > 300) delete this._rpReg[keys[0]];
                this._rpReg[k] = o;
                return '<button class="' + (cls || 'fm-act') + '" onclick="event.stopPropagation(); app.reportContent(app._rpReg.' + k + ')" aria-label="إبلاغ"><i data-lucide="flag"></i>' + (label || '') + '</button>';
            },
            rpPick(code) {
                if (!this._rp) return;
                this._rp.reason = code;
                document.querySelectorAll('#rpSheet .rp-chips button').forEach((b, i) => b.classList.toggle('on', this.RP_REASONS[i][0] === code));
            },
            rpClose() { document.getElementById('rpSheet')?.remove(); },
            rpSend() {
                const r = this._rp;
                if (!r || !window.firebaseDb || !this.authUid) return;
                if (!r.reason) { this.showToast('اختار نوع المشكلة'); return; }
                let sent = [];
                try { sent = JSON.parse(localStorage.getItem('isp_rp_sent') || '[]') || []; } catch (e) {}
                const key = r.type + '|' + (r.ref || r.targetUid);
                if (sent.indexOf(key) !== -1) { this.showToast('بلّغت عن هذا من قبل، الإدارة راح تراجعه'); this.rpClose(); return; }
                let last = 0;
                try { last = numOr0(localStorage.getItem('isp_rp_at')); } catch (e) {}
                if (Date.now() - last < 15000) { this.showToast('استنى شوية وبلّغ مرة ثانية'); return; }
                const note = (document.getElementById('rpNote')?.value || '').trim().slice(0, 300);
                const label = (this.RP_REASONS.find((x) => x[0] === r.reason) || ['', 'أخرى'])[1];
                const id = Date.now();
                const payload = { id, reporterUid: this.authUid, reporterName: String((this.currentUser && this.currentUser.fullName) || 'طالب').slice(0, 60), type: r.type, reason: label, createdAt: id, status: 'open' };
                if (r.targetUid) payload.targetUid = r.targetUid;
                if (/^[A-Za-z0-9_\/-]{1,120}$/.test(r.ref)) payload.ref = r.ref;
                if (r.snippet) payload.snippet = r.snippet;
                if (note) payload.note = note;
                const btn = document.getElementById('rpGo'); if (btn) btn.disabled = true;
                const { ref, set } = window.firebaseDbHelpers;
                set(ref(window.firebaseDb, 'reports/' + id), payload).then(() => {
                    try { sent.push(key); localStorage.setItem('isp_rp_sent', JSON.stringify(sent.slice(-200))); localStorage.setItem('isp_rp_at', String(Date.now())); } catch (e) {}
                    const sh = document.querySelector('#rpSheet .rp-sheet');
                    if (sh) { sh.innerHTML = `<div class="rp-done"><span><i data-lucide="check"></i></span><b>وصل بلاغك، شكراً</b><p>الإدارة تراجعه وتتصرف.</p>${r.targetUid && !this.isBlocked(r.targetUid) ? `<button class="rp-blk" onclick="app.rpClose(); app.blockUser(${jsArg(r.targetUid)})"><i data-lucide="ban"></i>احظره عندي</button>` : ''}<button class="rp-ok" onclick="app.rpClose()">تمام</button></div>`; lucide.createIcons(); }
                }).catch(() => { if (btn) btn.disabled = false; this.showToast('تعذر إرسال البلاغ، حاول مرة ثانية'); });
            },

            // ==================== STORE (reels-style marketplace) ====================
            // The store: categories and products the admin publishes from the panel (js/shop.js).
            goToStore() {
                this.switchView('storeView');
                if (this._withPart('shop', () => typeof this.shOpen === 'function', 'storeView', () => this.goToStore())) return;
                this.shOpen();
            },

            listenForStoreProducts() {
                if (!window.firebaseDb || this._storeProductsListener) { this.renderStoreFeed(); return; }
                const { ref, onValue } = window.firebaseDbHelpers;
                this._storeProductsListener = onValue(ref(window.firebaseDb, 'storeProducts'), (snap) => {
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((id) => {
                            const p = vals[id];
                            if (p && p.status === 'approved') list.push(p);
                        });
                        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                    }
                    storeProductsList.length = 0;
                    storeProductsList.push(...withNumericIds(list));
                    this._storeProductsLoaded = true;
                    if (this.currentView === 'storeView') this.renderStoreFeed();
                });
            },

            renderStoreFeed() {
                const container = document.getElementById('storeFeed');
                const empty = document.getElementById('storeEmptyState');
                if (!container || !empty) return;
                if (storeProductsList.length === 0) {
                    container.innerHTML = '';
                    container.classList.add('hidden');
                    empty.classList.remove('hidden');
                    return;
                }
                container.classList.remove('hidden');
                empty.classList.add('hidden');
                container.innerHTML = storeProductsList.map(p => this.createStoreProductCard(p)).join('');
                lucide.createIcons();
                this.setupStoreFeedVideoAutoplay();
                this.updateStoreCartBadge();
            },

            setupStoreFeedVideoAutoplay() {
                const container = document.getElementById('storeFeed');
                if (!container) return;
                if (this._storeVideoObserver) this._storeVideoObserver.disconnect();
                const videos = container.querySelectorAll('video.store-card-media');
                if (videos.length > 0) {
                    this._storeVideoObserver = new IntersectionObserver((entries) => {
                        entries.forEach((entry) => {
                            const video = entry.target;
                            if (entry.isIntersecting) {
                                video.play().catch(() => {});
                            } else {
                                video.pause();
                                video.currentTime = 0;
                            }
                        });
                    }, { threshold: 0.6 });
                    videos.forEach((v) => this._storeVideoObserver.observe(v));
                }
                this.setupStoreFeedPositionCounter();
            },

            setupStoreFeedPositionCounter() {
                const container = document.getElementById('storeFeed');
                const counter = document.getElementById('storeFeedCounter');
                if (!container || !counter) return;
                if (this._storePositionObserver) this._storePositionObserver.disconnect();
                const cards = Array.from(container.querySelectorAll('.store-card'));
                const total = cards.length;
                if (total === 0) { counter.classList.add('hidden'); return; }
                counter.classList.remove('hidden');
                counter.textContent = '1 / ' + total;
                this._storePositionObserver = new IntersectionObserver((entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                            const idx = cards.indexOf(entry.target);
                            if (idx > -1) counter.textContent = (idx + 1) + ' / ' + total;
                        }
                    });
                }, { threshold: 0.6 });
                cards.forEach((c) => this._storePositionObserver.observe(c));
            },

            createStoreProductCard(p) {
                const iLiked = !!(p.likes && this.authUid && p.likes[this.authUid]);
                const likesCount = p.likes ? Object.keys(p.likes).length : 0;
                const inCart = storeCart.some(c => c.productId === p.id);
                const isVideo = p.mediaType === 'video';
                const media = isVideo
                    ? `<video class="store-card-media" src="${safeVideo(p.imageUrl)}" muted loop playsinline preload="metadata"></video>`
                    : `<img src="${safeImage(p.imageUrl)}" class="store-card-media" alt="${escapeHtml(p.title)}">`;
                return `
                    <div class="store-card" data-product-id="${jsNum(p.id)}">
                        ${media}
                        <div class="store-card-gradient"></div>
                        <div class="store-card-actions">
                            <button class="store-action-btn" onclick="app.openStoreOwnerProfile(${jsNum(p.id)})">
                                <img src="${personAvatarSrc(p.storeLogo, p.storeName)}" class="w-11 h-11 rounded-full object-cover" style="border: 2px solid #fff;">
                            </button>
                            <button class="store-action-btn" onclick="app.toggleProductLike(${jsNum(p.id)})">
                                <div class="store-action-circle"><i data-lucide="heart" class="w-6 h-6 ${iLiked ? 'fill-error' : ''}" style="color: ${iLiked ? '#DC2626' : '#fff'};"></i></div>
                                <span class="text-white text-[11px] font-bold">${likesCount}</span>
                            </button>
                            <button class="store-action-btn" onclick="app.addToCart(${jsNum(p.id)})">
                                <div class="store-action-circle"><i data-lucide="${inCart ? 'check-circle-2' : 'shopping-cart'}" class="w-6 h-6" style="color: ${inCart ? '#4ADE80' : '#fff'};"></i></div>
                                <span class="text-white text-[11px] font-bold">${inCart ? 'مضافة' : 'أضف'}</span>
                            </button>
                            <button class="store-action-btn" onclick="app.openStoreCart()">
                                <div class="store-action-circle" style="position: relative;">
                                    <i data-lucide="shopping-bag" class="w-6 h-6 text-white"></i>
                                    <span class="store-card-cart-badge hidden absolute -top-1 -right-1 w-4 h-4 bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center">0</span>
                                </div>
                                <span class="text-white text-[11px] font-bold">السلة</span>
                            </button>
                            <button class="store-action-btn" onclick="app.buyProductNow(${jsNum(p.id)})">
                                <div class="w-11 h-11 rounded-full bg-primary flex items-center justify-center"><i data-lucide="zap" class="w-5 h-5 text-white"></i></div>
                                <span class="text-white text-[11px] font-bold">شراء</span>
                            </button>
                        </div>
                        <div class="store-card-info">
                            <div class="text-white font-bold text-sm mb-1">${escapeHtml(p.storeName || 'متجر')}</div>
                            <div class="text-white text-sm mb-1 line-clamp-2">${escapeHtml(p.title)}</div>
                            ${p.description ? `<div class="text-white/80 text-xs mb-2 line-clamp-2">${escapeHtml(p.description)}</div>` : ''}
                            <div class="inline-flex items-center gap-1 text-white text-xs font-bold px-2.5 py-1 rounded-lg" style="background: rgb(var(--p) / 0.9);"><i data-lucide="star" class="w-3 h-3"></i>${numOr0(p.pricePoints).toLocaleString('en-US')} نقطة</div>
                        </div>
                    </div>
                `;
            },

            openStoreOwnerProfile(productId) {
                const p = storeProductsList.find(x => x.id === productId);
                if (!p) return;
                this.openAuthorProfile(p.ownerUid, p.storeName, p.storeLogo, '');
            },

            toggleProductLike(productId) {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول');
                    this.goToAuth('login');
                    return;
                }
                if (!window.firebaseDb) return;
                const p = storeProductsList.find(x => x.id === productId);
                if (!p) return;
                const alreadyLiked = !!(p.likes && p.likes[this.authUid]);
                const { ref, set } = window.firebaseDbHelpers;
                set(ref(window.firebaseDb, 'storeProducts/' + productId + '/likes/' + this.authUid), alreadyLiked ? null : true).catch(() => {
                    this.showToast('تعذر تنفيذ العملية');
                });
            },

            saveStoreCart() {
                try { localStorage.setItem('iraqiStudentStoreCart', JSON.stringify(storeCart)); } catch (e) {}
            },

            loadStoreCart() {
                try {
                    const raw = localStorage.getItem('iraqiStudentStoreCart');
                    const arr = raw ? JSON.parse(raw) : [];
                    storeCart.length = 0;
                    if (Array.isArray(arr)) storeCart.push(...withNumericIds(arr, 'productId'));
                } catch (e) {}
                this.updateStoreCartBadge();
            },

            updateStoreCartBadge() {
                const count = storeCart.length;
                const badges = document.querySelectorAll('.store-card-cart-badge');
                badges.forEach((badge) => { badge.classList.toggle('hidden', count === 0); badge.textContent = count; });
            },

            addToCart(productId) {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول');
                    this.goToAuth('login');
                    return;
                }
                const p = storeProductsList.find(x => x.id === productId);
                if (!p) return;
                if (p.ownerUid === this.authUid) {
                    this.showToast('لا يمكنك شراء منتج من متجرك أنت');
                    return;
                }
                if (storeCart.some(c => c.productId === productId)) {
                    this.showToast('المنتج موجود بالسلة أصلاً');
                    return;
                }
                storeCart.push({ productId: p.id, storeId: p.storeId, ownerUid: p.ownerUid, title: p.title, imageUrl: p.imageUrl, mediaType: p.mediaType || 'image', pricePoints: p.pricePoints, storeName: p.storeName });
                this.saveStoreCart();
                this.renderStoreFeed();
                this.showToast('أُضيف للسلة');
            },

            removeFromCart(productId) {
                const idx = storeCart.findIndex(c => c.productId === productId);
                if (idx === -1) return;
                storeCart.splice(idx, 1);
                this.saveStoreCart();
                this.updateStoreCartBadge();
                this.renderStoreCart();
            },

            openStoreCart() {
                this.switchView('storeCartView');
                this.loadStoreCart();
                this.renderStoreCart();
                lucide.createIcons();
            },

            renderStoreCart() {
                const list = document.getElementById('storeCartList');
                const empty = document.getElementById('storeCartEmptyState');
                const summary = document.getElementById('storeCartSummary');
                const totalEl = document.getElementById('storeCartTotal');
                if (!list || !empty || !summary) return;
                if (storeCart.length === 0) {
                    list.innerHTML = '';
                    empty.classList.remove('hidden');
                    summary.classList.add('hidden');
                    return;
                }
                empty.classList.add('hidden');
                summary.classList.remove('hidden');
                list.innerHTML = storeCart.map(c => `
                    <div class="flex items-center gap-3 p-3 rounded-2xl border theme-transition" style="background-color: var(--surface); border-color: var(--border);">
                        ${c.mediaType === 'video'
                            ? `<video src="${safeVideo(c.imageUrl)}" class="w-16 h-16 rounded-xl object-cover flex-shrink-0" muted preload="metadata"></video>`
                            : `<img src="${safeImage(c.imageUrl)}" class="w-16 h-16 rounded-xl object-cover flex-shrink-0">`}
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-bold line-clamp-1 theme-transition" style="color: var(--text);">${escapeHtml(c.title)}</div>
                            <div class="text-xs theme-transition" style="color: var(--text2);">${escapeHtml(c.storeName || 'متجر')}</div>
                            <div class="text-xs font-bold mt-1 text-primary">${numOr0(c.pricePoints).toLocaleString('en-US')} نقطة</div>
                        </div>
                        <button onclick="app.removeFromCart(${jsNum(c.productId)})" class="btn-press w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background-color: var(--input-bg);" aria-label="حذف"><i data-lucide="trash-2" class="w-4 h-4 text-error"></i></button>
                    </div>
                `).join('');
                const total = storeCart.reduce((sum, c) => sum + numOr0(c.pricePoints), 0);
                if (totalEl) totalEl.textContent = total.toLocaleString('en-US') + ' نقطة';
                lucide.createIcons();
            },

            // FIX: this used to only guard against self-purchase in addToCart()/buyProductNow(),
            // not here — a stale cart item for a product the seller later became the owner of
            // (or any cart entry added through another path) could still be checked out and
            // charged. Cart items owned by the current user are now filtered out and skipped
            // before computing the total/placing the order.
            // FIX (see addPointsAtomic above): checkout now debits points atomically via a
            // rejecting transaction instead of a plain local subtraction + fire-and-forget
            // sync, so it can no longer double-spend across tabs or leave points "refunded"
            // by a dropped connection after the order already placed.
            checkoutStoreCart() {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول');
                    return;
                }
                if (storeCart.length === 0) return;
                const ownCartItems = storeCart.filter(c => c.ownerUid === this.authUid);
                if (ownCartItems.length > 0) {
                    ownCartItems.forEach((c) => this.removeFromCart(c.productId));
                    this.showToast('تمت إزالة منتجاتك الخاصة من السلة — لا يمكنك شراءها');
                    if (storeCart.length === 0) return;
                }
                if (!window.firebaseDb) { this.showToast('لا يوجد اتصال بقاعدة البيانات'); return; }
                // FIX: the cart lives in localStorage, and checkout used to charge whatever
                // price was stored there — editable by the student, and stale if the seller
                // changed the price or the product was removed/rejected. Prices now come from
                // the live approved product list, and unavailable items are dropped.
                if (!this._storeProductsLoaded) { this.listenForStoreProducts(); this.showToast('جاري تحميل المنتجات، حاول بعد لحظات'); return; }
                const live = storeCart.map(c => storeProductsList.find(p => p.id === c.productId)).filter(Boolean);
                if (live.length !== storeCart.length) {
                    storeCart.splice(0, storeCart.length, ...storeCart.filter(c => live.some(p => p.id === c.productId)));
                    this.saveStoreCart();
                    this.updateStoreCartBadge();
                    this.renderStoreCart();
                    this.showToast('بعض المنتجات لم تعد متوفرة وتمت إزالتها من السلة — راجع السلة وأكمل الشراء');
                    return;
                }
                const total = live.reduce((sum, p) => sum + numOr0(p.pricePoints), 0);
                if (total <= 0) { this.showToast('تعذر حساب سعر السلة'); return; }
                const orderId = Date.now();
                const items = live.map(p => ({ productId: p.id, storeId: p.storeId || '', ownerUid: p.ownerUid || '', title: p.title || '', pricePoints: numOr0(p.pricePoints) }));
                const order = { id: orderId, buyerUid: this.authUid, buyerName: this.currentUser.fullName || 'طالب', items, totalPoints: total, status: 'placed', createdAt: Date.now() };
                // The order and the points it costs are written together.
                this.addPointsAtomic(-total, { reject: true, spend: 'o:' + orderId, extra: { ['storeOrders/' + orderId]: order } }).then((newPoints) => {
                    if (newPoints === null) {
                        this.showToast('نقاطك غير كافية أو تعذر إتمام الشراء');
                        return;
                    }
                    storeCart.length = 0;
                    this.saveStoreCart();
                    this.updateStoreCartBadge();
                    this.showToast('تم الشراء بنجاح! خُصم ' + total.toLocaleString('en-US') + ' نقطة');
                    this.goBack();
                });
            },

            buyProductNow(productId) {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول');
                    this.goToAuth('login');
                    return;
                }
                const p = storeProductsList.find(x => x.id === productId);
                if (!p) return;
                if (p.ownerUid === this.authUid) {
                    this.showToast('لا يمكنك شراء منتج من متجرك أنت');
                    return;
                }
                if (!window.firebaseDb) { this.showToast('لا يوجد اتصال بقاعدة البيانات'); return; }
                const orderId = Date.now();
                const price = numOr0(p.pricePoints);
                if (price <= 0) { this.showToast('سعر المنتج غير صالح'); return; }
                const order = { id: orderId, buyerUid: this.authUid, buyerName: this.currentUser.fullName || 'طالب', items: [{ productId: p.id, storeId: p.storeId, ownerUid: p.ownerUid, title: p.title, pricePoints: price }], totalPoints: price, status: 'placed', createdAt: Date.now() };
                this.addPointsAtomic(-price, { reject: true, spend: 'o:' + orderId, extra: { ['storeOrders/' + orderId]: order } }).then((newPoints) => {
                    if (newPoints === null) {
                        this.showToast('نقاطك غير كافية أو تعذر إتمام الشراء');
                        return;
                    }
                    this.showToast('تم شراء "' + p.title + '" بنجاح!');
                });
            },

            // ---- My Store (seller dashboard) ----
            goToMyStore() {
                if (!this.isLoggedIn || !this.currentUser) {
                    this.showToast('يجب تسجيل الدخول');
                    this.goToAuth('login');
                    return;
                }
                this.switchView('myStoreView');
                this.listenForMyStore();
                lucide.createIcons();
            },

            listenForMyStore() {
                if (!window.firebaseDb || !this.authUid || this._myStoreListener) { this.renderMyStoreView(); return; }
                const { ref, onValue } = window.firebaseDbHelpers;
                this._myStoreListener = onValue(ref(window.firebaseDb, 'stores/' + this.authUid), (snap) => {
                    this.myStoreInfo = snap.exists() ? snap.val() : null;
                    if (this.myStoreInfo && this.myStoreInfo.status === 'approved') this.listenForMyStoreProducts();
                    if (this.currentView === 'myStoreView') this.renderMyStoreView();
                });
            },

            listenForMyStoreProducts() {
                if (!window.firebaseDb || !this.authUid || this._myStoreProductsListener) return;
                const { ref, onValue } = window.firebaseDbHelpers;
                this._myStoreProductsListener = onValue(ref(window.firebaseDb, 'storeProducts'), (snap) => {
                    const list = [];
                    if (snap.exists()) {
                        const vals = snap.val();
                        Object.keys(vals).forEach((id) => {
                            const p = vals[id];
                            if (p && p.ownerUid === this.authUid) list.push(p);
                        });
                        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                    }
                    myStoreProducts.length = 0;
                    myStoreProducts.push(...withNumericIds(list));
                    if (this.currentView === 'myStoreView') this.renderMyStoreView();
                });
            },

            renderMyStoreView() {
                const content = document.getElementById('myStoreContent');
                if (!content) return;
                const store = this.myStoreInfo;
                if (!store) {
                    content.innerHTML = `
                        <div class="flex flex-col items-center text-center py-8">
                            <div class="w-20 h-20 rounded-full flex items-center justify-center mb-4 theme-transition" style="background-color: var(--input-bg);">
                                <i data-lucide="store" class="w-10 h-10 theme-transition" style="color: var(--text2);"></i>
                            </div>
                            <h3 class="text-lg font-bold mb-2 theme-transition" style="color: var(--text);">ما عندك متجر بعد</h3>
                            <p class="text-sm mb-6 max-w-[280px] theme-transition" style="color: var(--text2);">افتح متجرك الخاص وابدأ ببيع القرطاسية والكتب والملازم لزملائك — يحتاج موافقة الإدارة أول ما تنشئه</p>
                            <button onclick="app.openStoreApplicationModal()" class="px-6 py-2.5 bg-primary text-white rounded-xl font-medium btn-press">افتح متجرك</button>
                        </div>
                    `;
                    lucide.createIcons();
                    return;
                }
                if (store.status === 'pending') {
                    content.innerHTML = `
                        <div class="flex flex-col items-center text-center py-8">
                            <div class="w-20 h-20 rounded-full flex items-center justify-center mb-4" style="background-color: var(--update-bg, #FFFBEB);">
                                <i data-lucide="clock" class="w-10 h-10 text-warning"></i>
                            </div>
                            <h3 class="text-lg font-bold mb-2 theme-transition" style="color: var(--text);">طلبك بانتظار الموافقة</h3>
                            <p class="text-sm max-w-[280px] theme-transition" style="color: var(--text2);">متجر "${escapeHtml(store.name)}" قيد المراجعة من الإدارة، راح نخبرك أول ما ينتهي</p>
                        </div>
                    `;
                    lucide.createIcons();
                    return;
                }
                if (store.status === 'rejected') {
                    content.innerHTML = `
                        <div class="flex flex-col items-center text-center py-8">
                            <div class="w-20 h-20 rounded-full flex items-center justify-center mb-4 bg-error/10">
                                <i data-lucide="x-circle" class="w-10 h-10 text-error"></i>
                            </div>
                            <h3 class="text-lg font-bold mb-2 theme-transition" style="color: var(--text);">تم رفض طلب متجرك</h3>
                            ${store.rejectionReason ? `<p class="text-sm mb-4 max-w-[280px] theme-transition" style="color: var(--text2);">السبب: ${escapeHtml(store.rejectionReason)}</p>` : ''}
                            <button onclick="app.openStoreApplicationModal()" class="px-6 py-2.5 bg-primary text-white rounded-xl font-medium btn-press">إعادة التقديم</button>
                        </div>
                    `;
                    lucide.createIcons();
                    return;
                }
                const pendingCount = myStoreProducts.filter(p => p.status === 'pending').length;
                content.innerHTML = `
                    <div class="flex items-center gap-3 p-4 rounded-2xl border mb-4 theme-transition" style="background-color: var(--surface); border-color: var(--border);">
                        <img src="${personAvatarSrc(store.logo, store.name)}" class="w-14 h-14 rounded-2xl object-cover flex-shrink-0">
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-bold theme-transition" style="color: var(--text);">${escapeHtml(store.name)}</div>
                            <div class="text-xs theme-transition" style="color: var(--text2);">${escapeHtml(storeCategories[store.category] || '')}</div>
                        </div>
                        <span class="text-[10px] font-bold px-2 py-1 rounded-full bg-success/10 text-success">مفعّل</span>
                    </div>
                    <button onclick="app.openAddProductModal()" class="w-full h-12 bg-primary text-white rounded-xl font-bold text-sm btn-press mb-4 flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>أضف منتج جديد</button>
                    ${pendingCount > 0 ? `<p class="text-xs mb-3 theme-transition" style="color: var(--text2);">لديك ${pendingCount} منتج قيد المراجعة</p>` : ''}
                    <h3 class="text-sm font-bold mb-2 theme-transition" style="color: var(--text);">منتجاتك</h3>
                    <div class="flex flex-col gap-2">
                        ${myStoreProducts.length === 0 ? `<p class="text-sm text-center py-8 theme-transition" style="color: var(--text2);">لم تنشر أي منتج بعد</p>` : myStoreProducts.map(p => this.createMyStoreProductRow(p)).join('')}
                    </div>
                `;
                lucide.createIcons();
            },

            createMyStoreProductRow(p) {
                const statusMap = { pending: { label: 'قيد المراجعة', color: '#F59E0B' }, approved: { label: 'منشور', color: '#16A34A' }, rejected: { label: 'مرفوض', color: '#DC2626' } };
                const st = statusMap[p.status] || statusMap.pending;
                return `
                    <div class="flex items-center gap-3 p-3 rounded-2xl border theme-transition" style="background-color: var(--surface); border-color: var(--border);">
                        ${p.mediaType === 'video'
                            ? `<video src="${safeVideo(p.imageUrl)}" class="w-14 h-14 rounded-xl object-cover flex-shrink-0" muted preload="metadata"></video>`
                            : `<img src="${safeImage(p.imageUrl)}" class="w-14 h-14 rounded-xl object-cover flex-shrink-0">`}
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-bold line-clamp-1 theme-transition" style="color: var(--text);">${escapeHtml(p.title)}</div>
                            <div class="text-xs font-bold mt-0.5" style="color: ${st.color};">${st.label}</div>
                            <div class="text-xs theme-transition" style="color: var(--text2);">${numOr0(p.pricePoints).toLocaleString('en-US')} نقطة</div>
                        </div>
                        <button onclick="app.deleteMyStoreProduct(${jsNum(p.id)})" class="btn-press w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background-color: var(--input-bg);" aria-label="حذف"><i data-lucide="trash-2" class="w-4 h-4 text-error"></i></button>
                    </div>
                `;
            },

            deleteMyStoreProduct(productId) {
                if (!window.firebaseDb) return;
                const { ref, remove } = window.firebaseDbHelpers;
                remove(ref(window.firebaseDb, 'storeProducts/' + productId)).then(() => {
                    this.showToast('تم حذف المنتج');
                }).catch(() => { this.showToast('تعذر الحذف'); });
            },

            openStoreApplicationModal() {
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'افتح متجرك';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                this._pendingStoreLogo = null;
                content.innerHTML = `
                    <div class="flex flex-col gap-3">
                        <div class="flex flex-col items-center mb-1">
                            <div class="avatar-container relative w-20 h-20 mb-2 cursor-pointer" onclick="document.getElementById('storeApplyLogoInput').click()">
                                <img id="storeApplyLogoPreview" src="https://ui-avatars.com/api/?name=Store&background=2563EB&color=fff&size=200" class="w-full h-full rounded-2xl object-cover border-2" style="border-color: var(--border);">
                                <div class="avatar-overlay absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center"><i data-lucide="camera" class="w-5 h-5 text-white"></i></div>
                            </div>
                            <input type="file" id="storeApplyLogoInput" accept="image/*" class="hidden" onchange="app.previewStoreLogo(event)">
                            <span class="text-xs theme-transition" style="color: var(--text2);">شعار المتجر (اختياري)</span>
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1.5 theme-transition" style="color: var(--text);">اسم المتجر</label>
                            <input type="text" id="storeApplyName" placeholder="مثال: مكتبة الأمل" class="w-full h-12 px-4 rounded-xl auth-input text-sm">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1.5 theme-transition" style="color: var(--text);">وصف قصير</label>
                            <textarea id="storeApplyDesc" rows="3" placeholder="شنو تبيع بمتجرك؟" class="w-full px-4 py-3 rounded-xl auth-input text-sm" style="resize: none;"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1.5 theme-transition" style="color: var(--text);">التصنيف الرئيسي</label>
                            <select id="storeApplyCategory" class="w-full h-12 px-4 rounded-xl auth-input text-sm appearance-none cursor-pointer">
                                ${Object.keys(storeCategories).filter(k => k !== 'all').map(k => `<option value="${k}">${storeCategories[k]}</option>`).join('')}
                            </select>
                        </div>
                        <button id="storeApplySubmitBtn" onclick="app.submitStoreApplication()" class="w-full h-12 bg-primary text-white rounded-xl font-bold text-sm btn-press mt-1">إرسال طلب فتح المتجر</button>
                    </div>
                `;
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
            },

            previewStoreLogo(event) {
                const file = event.target.files && event.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    const preview = document.getElementById('storeApplyLogoPreview');
                    if (preview) preview.src = e.target.result;
                    this._pendingStoreLogo = e.target.result;
                };
                reader.readAsDataURL(file);
            },

            submitStoreApplication() {
                const nameEl = document.getElementById('storeApplyName');
                const descEl = document.getElementById('storeApplyDesc');
                const catEl = document.getElementById('storeApplyCategory');
                if (!nameEl || !descEl || !catEl || !this.currentUser) return;
                const name = nameEl.value.trim();
                if (!name) {
                    this.showToast('أدخل اسم المتجر');
                    return;
                }
                if (!window.firebaseDb) {
                    this.showToast('لا يوجد اتصال بقاعدة البيانات');
                    return;
                }
                const nameFilter = filterBadWords(name);
                const descFilter = filterBadWords(descEl.value.trim());
                const btn = document.getElementById('storeApplySubmitBtn');
                if (btn) { btn.disabled = true; btn.textContent = 'جاري الإرسال...'; }
                const { ref, set, serverTimestamp } = window.firebaseDbHelpers;
                const payload = {
                    ownerUid: this.authUid,
                    ownerName: this.currentUser.fullName || 'طالب',
                    name: nameFilter.clean,
                    description: descFilter.clean,
                    category: catEl.value,
                    logo: this._pendingStoreLogo || '',
                    status: 'pending',
                    createdAt: serverTimestamp()
                };
                set(ref(window.firebaseDb, 'stores/' + this.authUid), payload).then(() => {
                    this._pendingStoreLogo = null;
                    this.closeWalletModal();
                    this.showToast('تم إرسال طلبك، بانتظار موافقة الإدارة');
                }).catch((err) => {
                    console.warn('Store application failed:', err);
                    this.showToast('تعذر إرسال الطلب — حاول مجدداً');
                    if (btn) { btn.disabled = false; btn.textContent = 'إرسال طلب فتح المتجر'; }
                });
            },

            openAddProductModal() {
                if (!this.myStoreInfo || this.myStoreInfo.status !== 'approved') {
                    this.showToast('متجرك لازم يكون مفعّل أول');
                    return;
                }
                const titleEl = document.getElementById('walletModalTitle');
                if (titleEl) titleEl.textContent = 'منتج جديد';
                const content = document.getElementById('walletModalContent');
                if (!content) return;
                content.innerHTML = `
                    <div class="flex flex-col gap-3">
                        <div>
                            <label class="block text-sm font-bold mb-1.5 theme-transition" style="color: var(--text);">صورة أو فيديو قصير للمنتج</label>
                            <input type="file" id="storeProductImage" accept="image/*,video/*" onchange="app.previewStoreProductImage(event)" class="w-full text-sm">
                            <p class="text-xs mt-1 theme-transition" style="color: var(--text2);">فيديو قصير أفضل لعرض المنتج — بحد أقصى 15MB</p>
                            <img id="storeProductImagePreview" class="hidden mt-2 rounded-xl w-full max-h-48 object-cover" alt="معاينة">
                            <video id="storeProductVideoPreview" class="hidden mt-2 rounded-xl w-full max-h-48 object-cover" muted playsinline controls></video>
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1.5 theme-transition" style="color: var(--text);">اسم المنتج</label>
                            <input type="text" id="storeProductTitle" placeholder="مثال: دفتر 100 ورقة" class="w-full h-12 px-4 rounded-xl auth-input text-sm">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1.5 theme-transition" style="color: var(--text);">الوصف</label>
                            <textarea id="storeProductDesc" rows="3" placeholder="تفاصيل المنتج..." class="w-full px-4 py-3 rounded-xl auth-input text-sm" style="resize: none;"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1.5 theme-transition" style="color: var(--text);">التصنيف</label>
                            <select id="storeProductCategory" class="w-full h-12 px-4 rounded-xl auth-input text-sm appearance-none cursor-pointer">
                                ${Object.keys(storeCategories).filter(k => k !== 'all').map(k => `<option value="${k}">${storeCategories[k]}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1.5 theme-transition" style="color: var(--text);">السعر بالنقاط</label>
                            <input type="number" id="storeProductPrice" min="1" placeholder="مثال: 500" class="w-full h-12 px-4 rounded-xl auth-input text-sm" dir="ltr">
                        </div>
                        <button id="storeProductSubmitBtn" onclick="app.submitStoreProduct()" class="w-full h-12 bg-primary text-white rounded-xl font-bold text-sm btn-press mt-1">نشر المنتج (للمراجعة)</button>
                    </div>
                `;
                document.getElementById('walletModal')?.classList.remove('hidden');
                lucide.createIcons();
            },

            previewStoreProductImage(event) {
                const file = event.target.files && event.target.files[0];
                const imgPreview = document.getElementById('storeProductImagePreview');
                const vidPreview = document.getElementById('storeProductVideoPreview');
                if (!file || !imgPreview || !vidPreview) return;
                imgPreview.classList.add('hidden');
                vidPreview.pause();
                vidPreview.removeAttribute('src');
                vidPreview.classList.add('hidden');
                const url = URL.createObjectURL(file);
                if (file.type.startsWith('video/')) {
                    vidPreview.src = url;
                    vidPreview.classList.remove('hidden');
                } else {
                    imgPreview.src = url;
                    imgPreview.classList.remove('hidden');
                }
            },

            // FIX: product images/videos used to be embedded as base64 data URLs directly in
            // the Realtime Database record (a 15MB video becomes ~20MB of base64 text). Every
            // client subscribed to `storeProducts` — i.e. everyone who opens the store —
            // downloaded that entire blob as part of the JSON payload on every listener update,
            // even if they never opened that product. Media now uploads to Firebase Storage
            // (already configured via `storageBucket` in firebaseConfig) and only the resulting
            // download URL — a short string — is stored in the database record.
            async submitStoreProduct() {
                const imageEl = document.getElementById('storeProductImage');
                const titleEl = document.getElementById('storeProductTitle');
                const descEl = document.getElementById('storeProductDesc');
                const catEl = document.getElementById('storeProductCategory');
                const priceEl = document.getElementById('storeProductPrice');
                if (!titleEl || !descEl || !catEl || !priceEl || !this.currentUser || !this.myStoreInfo) return;
                const title = titleEl.value.trim();
                const price = parseInt(priceEl.value, 10);
                const mediaFile = imageEl && imageEl.files && imageEl.files[0];
                if (!title) { this.showToast('أدخل اسم المنتج'); return; }
                if (!mediaFile) { this.showToast('أضف صورة أو فيديو للمنتج'); return; }
                if (!price || price < 1) { this.showToast('أدخل سعر صحيح بالنقاط'); return; }
                if (!window.firebaseDb) { this.showToast('لا يوجد اتصال بقاعدة البيانات'); return; }
                const isVideo = mediaFile.type.startsWith('video/');
                if (isVideo && mediaFile.size > 15 * 1024 * 1024) {
                    this.showToast('الفيديو كبير جداً — اختر فيديو أقصر (أقل من 15MB)');
                    return;
                }
                if (!isVideo && mediaFile.size > 8 * 1024 * 1024) {
                    this.showToast('الصورة كبيرة جداً — اختر صورة أصغر (أقل من 8MB)');
                    return;
                }
                if (window.firebaseEnsureStorage) { try { await window.firebaseEnsureStorage(); } catch (e) {} }
                if (!window.firebaseStorage || !window.firebaseStorageHelpers) {
                    this.showToast('خدمة تخزين الملفات غير متاحة حالياً، حاول لاحقاً');
                    return;
                }
                const btn = document.getElementById('storeProductSubmitBtn');
                if (btn) { btn.disabled = true; btn.textContent = 'جاري الرفع...'; }
                const titleFilter = filterBadWords(title);
                const descFilter = filterBadWords(descEl.value.trim());
                const id = Date.now();
                let mediaUrl = '';
                try {
                    const { storageRef, uploadBytes, getDownloadURL } = window.firebaseStorageHelpers;
                    const safeName = (mediaFile.name || 'file').replace(/[^a-zA-Z0-9.\-_]/g, '_');
                    const sRef = storageRef(window.firebaseStorage, 'storeProducts/' + this.authUid + '/' + id + '_' + safeName);
                    await uploadBytes(sRef, mediaFile);
                    mediaUrl = await getDownloadURL(sRef);
                } catch (err) {
                    console.warn('Store media upload failed:', err);
                    this.showToast('تعذر رفع الملف — حاول مجدداً');
                    if (btn) { btn.disabled = false; btn.textContent = 'نشر المنتج (للمراجعة)'; }
                    return;
                }
                const { ref, set, serverTimestamp } = window.firebaseDbHelpers;
                const payload = {
                    id, storeId: this.authUid, ownerUid: this.authUid,
                    storeName: this.myStoreInfo.name, storeLogo: this.myStoreInfo.logo || '',
                    title: titleFilter.clean, description: descFilter.clean,
                    category: catEl.value, pricePoints: price,
                    imageUrl: mediaUrl, mediaType: isVideo ? 'video' : 'image',
                    status: 'pending', likes: {}, createdAt: serverTimestamp()
                };
                set(ref(window.firebaseDb, 'storeProducts/' + id), payload).then(() => {
                    this.closeWalletModal();
                    this.showToast('تم إرسال منتجك للمراجعة');
                }).catch((err) => {
                    console.warn('Product publish failed:', err);
                    this.showToast('تعذر النشر — حاول مجدداً');
                    if (btn) { btn.disabled = false; btn.textContent = 'نشر المنتج (للمراجعة)'; }
                });
            },

            // ==================== NAVIGATION ====================
            setTab(tab) {
                document.querySelectorAll('.nav-item').forEach(el => {
                    el.classList.remove('active', 'text-primary');
                    el.classList.add('theme-transition');
                    el.style.color = 'var(--text2)';
                });
                const activeBtn = document.querySelector(`#bottomNav [data-tab="${tab}"]`);
                if (activeBtn) {
                    activeBtn.classList.add('active', 'text-primary');
                    activeBtn.classList.remove('theme-transition');
                    activeBtn.style.color = '';
                }
                if (tab === 'home') this.switchView('homeView');
                else if (tab === 'resources') this.goToResources();
                else if (tab === 'leaderboard') this.goToLeaderboard();
                else if (tab === 'wallet') this.goToWallet();
                else if (tab === 'store') this.goToStore();
                else if (tab === 'saved') this.goToSaved();
                else if (tab === 'notifications') this.goToNotifications();
                else if (tab === 'messages') this.goToMessages();
                else if (tab === 'profile') this.goToProfile();
                else if (tab === 'holidays') this.goToHolidays();
                else if (tab === 'more') this.goToMore();
                else if (tab === 'tutor') this.goToTutor();
                else if (tab === 'food') this.goToFood();
                else if (tab === 'dhikr') this.goToDhikr();
                this.viewHistory = [];
            },

            goToSaved() {
                const saved = newsData.filter(n => n.isBookmarked);
                const container = document.getElementById('savedList');
                if (!container) return;
                if (saved.length === 0) {
                    container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-16 text-center">
                            <div class="w-16 h-16 rounded-full flex items-center justify-center mb-3 theme-transition" style="background-color: var(--input-bg);">
                                <i data-lucide="bookmark-x" class="w-8 h-8 theme-transition" style="color: var(--text2);"></i>
                            </div>
                            <h3 class="font-bold mb-1 theme-transition" style="color: var(--text);">لا توجد أخبار محفوظة</h3>
                            <p class="text-sm theme-transition" style="color: var(--text2);">قم بحفظ الأخبار المهمة للاطلاع عليها لاحقاً</p>
                        </div>`;
                } else {
                    container.innerHTML = saved.map(n => this.createNewsCard(n)).join(''); if (window.lucide) lucide.createIcons();
                }
                this.switchView('savedView');
                lucide.createIcons();
            },

            goToCategories() {
                const container = document.getElementById('categoriesGrid');
                if (!container) return;
                container.innerHTML = categories.slice(1).map(cat => {
                    const count = newsData.filter(n => n.category === cat.id).length;
                    return `
                        <button onclick="app.setCategoryAndGoHome(${jsArg(cat.id)})" class="p-4 rounded-2xl border hover:shadow-card transition-all text-right theme-transition" style="background-color: var(--surface); border-color: var(--border);">
                            <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                                <i data-lucide="${cat.icon}" class="w-6 h-6 text-primary"></i>
                            </div>
                            <div class="font-bold theme-transition" style="color: var(--text);">${cat.label}</div>
                            <div class="text-xs mt-1 theme-transition" style="color: var(--text2);">${count} خبر</div>
                        </button>
                    `;
                }).join('');
                this.switchView('categoriesView');
                lucide.createIcons();
            },

            setCategoryAndGoHome(catId) {
                if (catId === 'results') {
                    this.goToResults();
                    return;
                }
                this.activeCategory = catId;
                this.renderCategories();
                this.renderNews();
                this.setTab('home');
                lucide.createIcons();
            },

            // Pages whose data is big (every student's photo, forum photos, the PDFs): downloaded when the
            // page is opened, not every time the app starts.
            LAZY_LISTEN: { leaderboardView: 'listenForLeaderboard', forumView: 'listenForForumThreads', forumThreadView: 'listenForForumThreads', studyRoomView: 'listenForStudyRoom', resourcesView: 'listenForResources', resourceDetailView: 'listenForResources' },

            switchView(viewId) {
                const lazy = this.LAZY_LISTEN[viewId];
                if (lazy && typeof this[lazy] === 'function') this[lazy]();
                if (this._forest && viewId !== 'forestView') this.failForest('طلعت من صفحة الغابة', true);
                if (this._garden && viewId !== 'gardenView' && this.gdFail) this.gdFail('طلعت من صفحة شجرتي', true);
                if (this.currentView === 'gardenView' && viewId !== 'gardenView') clearInterval(this._gdSky);
                if (this.currentView === 'flightsView' && viewId !== 'flightsView' && this.flLeave) this.flLeave();
                if (this.currentView === 'tutorView' && viewId !== 'tutorView' && this.tutorClose) this.tutorClose();
                if (this.currentView === 'moodMapView' && viewId !== 'moodMapView' && this.mmClose) this.mmClose();
                if (this.currentView === 'storeView' && viewId !== 'storeView' && this.shClose) this.shClose();
                if (this.currentView === 'spotsView' && viewId !== 'spotsView' && this.spClose) this.spClose();
                if (this.currentView === 'ventView' && viewId !== 'ventView' && this.vtClose) this.vtClose();
                if (this.currentView === 'foodView' && viewId !== 'foodView' && this.fdClose) this.fdClose();
                if (this.currentView === 'dhikrView' && viewId !== 'dhikrView' && this.dkClose) this.dkClose();
                if (this.currentView === 'hallView' && viewId !== 'hallView' && this.hlClose) this.hlClose();
                if (this.currentView === 'tubeView' && viewId !== 'tubeView' && this.tuClose) this.tuClose();
                if (this.currentView === 'tgView' && viewId !== 'tgView' && this.tgClose) this.tgClose();
                if (this.currentView === 'notesView' && viewId !== 'notesView' && this.ntClose) this.ntClose();
                if (this.currentView === 'examsView' && viewId !== 'examsView' && this.exClosePaper) this.exClosePaper();
                if (this.currentView === 'tableView' && viewId !== 'tableView' && this.tbClose) this.tbClose();
                if (this.currentView === 'moneyView' && viewId !== 'moneyView' && this.mnClose) this.mnClose();
                if (this.currentView === 'tmView' && viewId !== 'tmView' && this.tmClose) this.tmClose();
                if (this.currentView === 'duelView' && viewId !== 'duelView' && this.dlClose) this.dlClose();
                if (this.currentView === 'inviteView' && viewId !== 'inviteView' && this.ivClose) this.ivClose();
                if (this.currentView === 'chatThreadView' && viewId !== 'chatThreadView' && this.chatClose) this.chatClose();
                if (viewId === 'homeView' && this.currentView !== 'homeView') this._promoSoon();
                if (this.currentView === 'rmView' && viewId !== 'rmView' && this.rmClose) this.rmClose();
                if (this.currentView === 'mdrView' && viewId !== 'mdrView' && this._mdrTeardown) this._mdrTeardown();
                if (this.currentView === 'forumThreadView' && viewId !== 'forumThreadView' && this.fmThreadClose) this.fmThreadClose();
                if (this._gwar && viewId !== 'govWarView') this.failGovWar('طلعت من صفحة الحرب', true);
                if (this.currentView === 'govWarView' && viewId !== 'govWarView') document.body.classList.remove('gw-running');
                if (this.currentView === 'bioView' && viewId !== 'bioView') { this._bioClose(); this._bioScr = null; }
                if (this.currentView === 'cardsView' && viewId !== 'cardsView' && this._kdEndReview) { this._kdEndReview(); this._kdCloseSheet(true); this._kdScr = null; }
                if (this.currentView === 'ytRoomView' && viewId !== 'ytRoomView' && this._yrLeaveView) this._yrLeaveView();
                document.querySelectorAll('#mainContent > div').forEach(el => el.classList.add('hidden'));
                const view = document.getElementById(viewId);
                if (!view) return;
                view.classList.remove('hidden');
                view.classList.add(viewId === 'notificationsView' || viewId === 'profileView' || viewId === 'resourcesView' || viewId === 'resourceDetailView' || viewId === 'authView' || viewId === 'walletView' || viewId === 'leaderboardView' || viewId === 'forumView' || viewId === 'forumThreadView' || viewId === 'studyTimerView' || viewId === 'calmView' || viewId === 'gradesView' || viewId === 'cardsView' || viewId === 'uniView' || viewId === 'bioView' || viewId === 'pollsView' || viewId === 'govWarView' || viewId === 'twinView' || viewId === 'wasteView' || viewId === 'auctionView' || viewId === 'youtubeStudyView' || viewId === 'ytRoomView' || viewId === 'pointsStoreView' || viewId === 'studyRoomView' || viewId === 'tasksView' || viewId === 'calendarView' || viewId === 'messagesView' || viewId === 'chatThreadView' || viewId === 'friendsView' || viewId === 'resultsView' || viewId === 'storeView' || viewId === 'storeCartView' || viewId === 'myStoreView' ? 'page-slide-rtl' : 'page-enter');
                if (!this._skipHistory && viewId !== this.currentView) {
                    const last = this.viewHistory[this.viewHistory.length - 1];
                    if (last !== this.currentView) this.viewHistory.push(this.currentView);
                    if (this.viewHistory.length > 50) this.viewHistory.shift();
                }
                this.previousView = this.currentView;
                this.currentView = viewId;
                this._rememberView(viewId);
                document.body.classList.toggle('header-hidden', viewId !== 'homeView');
                document.body.classList.toggle('chat-nav-hidden', viewId === 'chatThreadView');
                this._chatNow();
                document.body.classList.toggle('results-nav-hidden', viewId === 'resultsView');
                // the bottom bar only belongs to the main pages; inside any other page it hides to give room
                document.body.classList.toggle('sub-nav-hidden', !['homeView','holidaysView','resourcesView','leaderboardView','tutorView','storeView','messagesView','profileView','moreView'].includes(viewId));
                document.body.classList.toggle('forest-on', viewId === 'forestView');
                window.scrollTo(0, 0);

                if (viewId === 'homeView') { this._dateStripCheck(); this.updateNavActive('home'); this.renderExamCountdown(); }
                else if (viewId === 'resourcesView') this.updateNavActive('resources');
                else if (viewId === 'leaderboardView') this.updateNavActive('leaderboard');
                else if (viewId === 'savedView') this.updateNavActive('saved');
                else if (viewId === 'notificationsView') this.updateNavActive('notifications');
                else if (viewId === 'messagesView') this.updateNavActive('messages');
                else if (viewId === 'profileView') this.updateNavActive('profile');
                else if (viewId === 'moreView') this.updateNavActive('more');
                else if (viewId === 'storeView' || viewId === 'storeCartView' || viewId === 'myStoreView') this.updateNavActive('store');
                else if (viewId === 'holidaysView') { this.updateNavActive('holidays'); this.renderDayStatus(); this.updateHolidayNavDot(); }
                else if (viewId === 'walletView') this.updateNavActive('wallet');
            },

            updateNavActive(tab) {
                document.querySelectorAll('.nav-item').forEach(el => {
                    el.classList.remove('active', 'text-primary');
                    el.classList.add('theme-transition');
                    el.style.color = 'var(--text2)';
                });
                const activeBtn = document.querySelector(`#bottomNav [data-tab="${tab}"]`);
                if (activeBtn) {
                    activeBtn.classList.add('active', 'text-primary');
                    activeBtn.classList.remove('theme-transition');
                    activeBtn.style.color = '';
                }
            },

            goBack() {
                let target = this.viewHistory.pop() || 'homeView';
                if (!document.getElementById(target)) target = 'homeView';
                if (target === 'authView' && this.isLoggedIn) target = 'homeView';
                this._skipHistory = true;
                this.switchView(target);
                this._skipHistory = false;
            },

            // ===== Trusted clock =====
            // Server time (Firebase's offset) carried forward by the phone's monotonic timer, so
            // changing the phone's clock can't end a session early or move the golden hour.
            _clockSync() {
                if (this._clkBound || !window.firebaseDb) return;
                this._clkBound = true;
                const { ref, onValue } = window.firebaseDbHelpers;
                onValue(ref(window.firebaseDb, '.info/serverTimeOffset'), (s) => { this._srvOff = Number(s.val()) || 0; if (!this._focus && !this._forest) this._clk = null; });
                document.addEventListener('visibilitychange', () => { if (!document.hidden && !this._focus && !this._forest) this._clk = null; });
            },
            trueNow() {
                if (!this._clk) this._clk = { wall: Date.now() + (this._srvOff || 0), perf: performance.now() };
                return this._clk.wall + (performance.now() - this._clk.perf);
            },

            // ===== الساعة الذهبية =====
            // One hour a day, the same for every student, starting at a time picked from the date
            // between 4 and 10 pm (Iraq time). Minutes of focus / forest sessions (25 minutes or
            // longer) inside it earn double points; forest trees planted with it grow golden.
            _goldenWin(t) {
                const ir = new Date((t || this.trueNow()) + 3 * 3600000);
                const y = ir.getUTCFullYear(), mo = ir.getUTCMonth(), d = ir.getUTCDate();
                let h = (y * 372 + mo * 31 + d + 7919) | 0;
                h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917);
                const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
                const start = Date.UTC(y, mo, d) - 3 * 3600000 + (16 * 60 + Math.floor(r * 72) * 5) * 60000;
                return { start, end: start + 3600000, key: y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0') };
            },
            goldenState(t) {
                const now = t || this.trueNow(), w = this._goldenWin(now);
                return Object.assign(w, { now, active: now >= w.start && now < w.end, soon: now < w.start && w.start - now <= 600000, before: now < w.start, after: now >= w.end });
            },
            // Golden minutes in a session that ran from a to b (ms), only for sessions of 25+ minutes.
            _goldenMinutes(a, b, minutes) {
                if (minutes < 25) return 0;
                const w = this._goldenWin(a);
                return Math.max(0, Math.floor((Math.min(b, w.end) - Math.max(a, w.start)) / 60000));
            },
            // After a session: the golden minutes it earned, counted once a day in golden/{day}/n.
            _goldenCredit(f) {
                const g = this._goldenMinutes(f.start, f.start + f.dur, f.minutes);
                if (g > 0 && window.firebaseDb) {
                    const key = this._goldenWin(f.start).key, mark = 'isp_golden_' + key;
                    let seen = false;
                    try { seen = !!localStorage.getItem(mark); localStorage.setItem(mark, '1'); } catch (e) {}
                    const { ref, runTransaction } = window.firebaseDbHelpers;
                    if (!seen) runTransaction(ref(window.firebaseDb, 'golden/' + key + '/n'), (c) => (Number(c) || 0) + 1).catch(() => {});
                    this._goldenToday = (this._goldenToday || 0) + g;
                }
                return g;
            },
            // The same account can't run two sessions at once (two phones = double golden points).
            async _sessionFree() {
                if (!window.firebaseDb || !this.authUid) return true;
                try {
                    const { ref, get } = window.firebaseDbHelpers;
                    const v = (await get(ref(window.firebaseDb, 'focusLive/' + this.authUid))).val();
                    if (v && numOr0(v.until) > this.trueNow() && v.dev && v.dev !== this._deviceId()) {
                        this.showToast('عندك جلسة شغالة بجهاز ثاني. خلّصها أو انتظرها تنتهي');
                        return false;
                    }
                } catch (e) { /* offline: allow */ }
                return true;
            },
            initGolden() {
                if (this._goldT) return;
                const tick = () => this._goldenTick();
                this._goldT = setInterval(tick, 1000);
                tick();
                if (window.firebaseDb) {
                    const { ref, onValue } = window.firebaseDbHelpers;
                    let key = '', unsub = null;
                    const watch = () => {
                        const k = this._goldenWin().key;
                        if (k === key) return;
                        key = k;
                        if (typeof unsub === 'function') unsub();
                        unsub = onValue(ref(window.firebaseDb, 'golden/' + k + '/n'), (s) => { this._goldenCount = Number(s.val()) || 0; });
                    };
                    watch();
                    setInterval(watch, 60000);
                }
            },
            _goldenTick() {
                const g = this.goldenState(), was = this._goldWas || '';
                const st = g.active ? 'on' : g.soon ? 'soon' : g.before ? 'before' : 'after';
                document.body.classList.toggle('golden-on', g.active);
                if (this._f3d) this._f3d.goldNow = g.active;
                // one heads-up when it is 10 minutes away and one when it starts (app open)
                if (was && st !== was) {
                    if (st === 'soon') { this.showToast('الساعة الذهبية تبدي بعد 10 دقايق، جهّز كتبك'); try { navigator.vibrate && navigator.vibrate([120, 80, 120]); } catch (e) {} }
                    if (st === 'on') { this.showToast('بدت الساعة الذهبية! كل دقيقة دراسة بنقطتين'); this.playNotifySound && this.playNotifySound(); try { navigator.vibrate && navigator.vibrate([200, 100, 200, 100, 300]); } catch (e) {} }
                }
                this._goldWas = st;
                const sec = document.getElementById('goldenSection'), bar = document.getElementById('goldenBar');
                if (!sec || !bar) return;
                // on the home page only from 10 minutes before it starts until it ends
                const show = st === 'soon' || st === 'on';
                sec.classList.toggle('hidden', !show);
                if (!show) { bar.dataset.st = ''; return; }
                const clock = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
                if (bar.dataset.st !== st) {
                    bar.dataset.st = st;
                    bar.className = 'gold-bar ' + st;
                    const btn = st === 'on' ? '<button class="gold-go" onclick="app.goToForest()">ادرس هسه</button>' : '';
                    bar.innerHTML = `<span class="gold-ic"><i data-lucide="sparkles"></i></span><div class="gold-tx"><b></b><small></small></div>${btn}`;
                    try { lucide.createIcons(); } catch (e) {}
                }
                const b = bar.querySelector('b'), sm = bar.querySelector('small'), n = this._goldenCount || 0;
                if (st === 'on') { b.textContent = 'الساعة الذهبية شغالة · باقي ' + clock(g.end - g.now); sm.textContent = 'كل دقيقة دراسة بنقطتين، وشجرتك تطلع ذهبية' + (n ? ' · ' + n.toLocaleString('en-US') + ' طالب درسوا بيها اليوم' : ''); }
                else { b.textContent = 'الساعة الذهبية تبدي بعد ' + clock(g.start - g.now); sm.textContent = 'جهّز كتبك، كل دقيقة بيها بنقطتين'; }
            },

            // ===== Verified accounts =====
            // verified/{uid} is set from the admin panel; a blue badge follows the name everywhere.
            listenForVerified() {
                if (this._vfListening || !window.firebaseDb) return;
                this._vfListening = true;
                const { ref, onValue } = window.firebaseDbHelpers;
                onValue(ref(window.firebaseDb, 'verified'), (snap) => {
                    this._verified = snap.val() || {};
                    this._refreshVerifiedViews();
                });
            },
            isVerified(uid) { return !!(uid && this._verified && this._verified[uid]); },
            vb(uid, size) { return this.modBadge(uid) + (this.isVerified(uid) ? `<span class="vbadge${size ? ' ' + size : ''}" title="حساب موثّق" role="img" aria-label="حساب موثّق">${VERIFIED_SVG}</span>` : ''); },

            // ===== Moderators =====
            // the list of pages in "more": the panel's page switches, and the moderators' room only for a moderator who may enter it
            _moreRefilter() {
                if (!this._MORE_ALL) return;
                const f = this._moreFeat || (() => true);
                this.MORE_ITEMS = this._MORE_ALL.filter((x) => f(x) && (!x.mod || this.modRoomOk()));
                if (this.currentView === 'moreView' && this.renderMore) this.renderMore();
            },
            // the room: the admin's switch is on, and I am a moderator who is on with the room permission
            modRoomOk() { return !!(this._modRoomOn === true && this.modCan('room')); },
            goToModRoom() {
                if (!this.isLoggedIn || !this.currentUser) { this.showToast('سجّل دخولك أول'); this.goToAuth('login'); return; }
                if (!this.modRoomOk()) { this.showToast('الغرفة مو متاحة لك هسه'); return; }
                this.switchView('mdrView');
                if (typeof this.mdrOpen === 'function') { this.mdrOpen(); return; }
                this._need('modroom').then(() => { if (this.currentView === 'mdrView') this.mdrOpen(); })
                    .catch(() => this.showToast('ما انحملت الصفحة، تأكد من النت وحاول مرة ثانية'));
            },
            // mods/{uid} = {on, p:{pubNews, delNews, delVent}} is set from the admin panel; the rules decide what a moderator may really do.
            listenForMods() {
                if (this._modListening || !window.firebaseDb || !this.authUid) return; // mods/ is for signed-in students; called again after sign-in
                this._modListening = true;
                const { ref, onValue } = window.firebaseDbHelpers;
                onValue(ref(window.firebaseDb, 'mods'), (snap) => { this._mods = snap.val() || {}; this._refreshVerifiedViews(); this._modUiRefresh(); }, () => { this._modListening = false; });
                onValue(ref(window.firebaseDb, 'newsGone'), (snap) => { this._newsGone = snap.val() || {}; this._applyNewsGone(); }, () => {});
                onValue(ref(window.firebaseDb, 'modRoom/cfg/on'), (snap) => { this._modRoomOn = snap.val() === true; this._moreRefilter(); this._modRoomCheck(); }, () => {});
            },
            isMod(uid) { const m = uid && this._mods && this._mods[uid]; return !!(m && m.on === true); },
            modCan(perm) { const m = this._mods && this.authUid && this._mods[this.authUid]; return !!(m && m.on === true && m.p && m.p[perm] === true); },
            modBadge(uid) { return this.isMod(uid) ? '<span class="modbadge" title="مشرف" role="img" aria-label="مشرف"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.5l8 3v6c0 4.9-3.3 8.9-8 10-4.7-1.1-8-5.1-8-10v-6l8-3z" fill="#16a34a"/><path d="M8.2 12.2l2.6 2.6 5-5.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><b>مشرف</b></span>' : ''; },
            _modRoomCheck() {
                if (this.currentView === 'mdrView' && !this.modRoomOk()) { this.showToast('الغرفة مو متاحة لك هسه'); if (this._mdrTeardown) this._mdrTeardown(); this.goBack(); }
            },
            _modUiRefresh() {
                try {
                    this._moreRefilter(); this._modRoomCheck();
                    const b = document.getElementById('modPubBtn'); if (b) b.classList.toggle('hidden', !this.modCan('pubNews'));
                    if (this.currentView === 'detailsView' && this.currentNewsId) this.openNews(this.currentNewsId);
                    if (this.currentView === 'ventView' && this._vtRender) this._vtRender();
                } catch (e) {}
            },
            // a deleted news is dropped from this phone, also when an older copy was saved here
            _applyNewsGone() {
                const g = this._newsGone || {};
                const gone = newsData.filter((n) => g[n.id] === true);
                if (!gone.length) return;
                gone.forEach((n) => { const i = newsData.indexOf(n); if (i > -1) newsData.splice(i, 1); });
                try { newsStore.remove(gone.map((n) => n.id)); } catch (e) {}
                this.renderNews();
                if (this.currentView === 'detailsView' && gone.some((n) => n.id === this.currentNewsId)) { this.showToast('هذا الخبر انحذف'); this.goBack(); }
            },
            async _modLog(k, extra) {
                const { ref, set, serverTimestamp } = window.firebaseDbHelpers;
                const me = this.currentUser || {};
                const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                return { path: 'auditLog/' + id, val: Object.assign({ at: serverTimestamp(), k, by: { t: 'mod', u: this.authUid, n: String(me.fullName || '').slice(0, 40), num: String(me.studentNumber || '') } }, extra || {}) };
            },
            async modDelNews(id) {
                if (!this.modCan('delNews')) return;
                const n = newsData.find((x) => x.id === id); if (!n) return;
                if (!confirm('تحذف هذا الخبر من كل المستخدمين؟\n\n' + String(n.title || '').slice(0, 80))) return;
                const { ref, update } = window.firebaseDbHelpers;
                try {
                    const lg = await this._modLog('newsDel', { id, title: String(n.title || '').slice(0, 100) });
                    await update(ref(window.firebaseDb), { ['news/' + id]: null, ['notifications/' + id]: null, ['newsGone/' + id]: true, [lg.path]: lg.val });
                    this.showToast('انحذف الخبر من الكل');
                } catch (e) { this.showToast('ما انحذف، صلاحيتك مطفية أو انقطع النت'); }
            },
            modPubOpen() {
                if (!this.modCan('pubNews')) return;
                document.getElementById('modPubSheet')?.remove();
                const el = document.createElement('div'); el.id = 'modPubSheet';
                el.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center';
                const cats = categories.filter((c) => c.id !== 'all');
                el.innerHTML = `<div style="width:100%;max-width:520px;background:var(--surface);color:var(--text);border-radius:20px 20px 0 0;padding:16px;max-height:90vh;overflow:auto" dir="rtl">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><b style="font-size:16px">نشر خبر</b><button type="button" onclick="document.getElementById('modPubSheet').remove()" style="font-size:22px;line-height:1;padding:4px 10px" aria-label="سد">&times;</button></div>
                    <input id="mpT" maxlength="150" placeholder="عنوان الخبر" style="width:100%;padding:11px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text);margin-bottom:8px">
                    <textarea id="mpX" rows="6" maxlength="3000" placeholder="نص الخبر" style="width:100%;padding:11px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text);margin-bottom:8px"></textarea>
                    <select id="mpC" style="width:100%;padding:11px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text);margin-bottom:8px">${cats.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('')}</select>
                    <input id="mpS" maxlength="60" placeholder="المصدر (اختياري)" style="width:100%;padding:11px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text);margin-bottom:10px">
                    ${this.modCan('pushNews') ? '<label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:14px"><input type="checkbox" id="mpP" style="width:18px;height:18px"> أرسل إشعار لكل التلفونات (مرة كل نص ساعة)</label>' : ''}
                    <button type="button" id="mpGo" onclick="app.modPublish()" class="btn-press" style="width:100%;padding:12px;border-radius:12px;background:#16a34a;color:#fff;font-weight:700">نشر للكل</button>
                </div>`;
                el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
                document.body.appendChild(el);
            },
            // asks the Worker to push the news just published (it checks the permission, the news and the half-hour gap itself)
            async _modPush(id) {
                try {
                    const user = window.firebaseAuth && window.firebaseAuth.currentUser; if (!user) return;
                    const cu = String((this.siteConfig && this.siteConfig.tutorUrl) || '').trim().replace(/\/+$/, '');
                    const base = /^https:\/\/[^\s]+$/.test(cu) ? cu : 'https://isp-tutor.efceg-xsax.workers.dev';
                    const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await user.getIdToken()) }, body: JSON.stringify({ mode: 'modpush', id: String(id) }) });
                    const j = await r.json().catch(() => ({}));
                    if (r.ok) this.showToast('انرسل الإشعار لكل التلفونات');
                    else if (r.status === 429) this.showToast('الخبر اننشر، بس الإشعار ما انرسل: انتظر ' + (j.minutes || 30) + ' دقيقة بين إشعار وإشعار');
                    else this.showToast('الخبر اننشر، بس الإشعار ما انرسل');
                } catch (e) { this.showToast('الخبر اننشر، بس الإشعار ما انرسل'); }
            },
            async modPublish() {
                if (!this.modCan('pubNews')) return;
                const g = (i) => String((document.getElementById(i) || {}).value || '').trim();
                const title = g('mpT'), excerpt = g('mpX');
                if (title.length < 3) { this.showToast('اكتب عنوان الخبر'); return; }
                if (excerpt.length < 3) { this.showToast('اكتب نص الخبر'); return; }
                const btn = document.getElementById('mpGo'); if (btn) { btn.disabled = true; btn.textContent = 'جاري النشر...'; }
                const { ref, update, serverTimestamp } = window.firebaseDbHelpers;
                const id = Date.now();
                const d = new Date(id), pad = (x) => String(x).padStart(2, '0');
                const rec = { id, title, excerpt, image: '', category: g('mpC') || 'other', date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), time: 'الآن', source: g('mpS') || 'إدارة المنصة', isUrgent: false, isPinned: false, notifHandled: false, isRead: false, isBookmarked: false, views: 0, publishedAt: serverTimestamp(), byMod: this.authUid };
                try {
                    const lg = await this._modLog('newsPub', { id, title: title.slice(0, 100) });
                    await update(ref(window.firebaseDb), { ['news/' + id]: rec, [lg.path]: lg.val });
                    const wantPush = !!(document.getElementById('mpP') || {}).checked && this.modCan('pushNews');
                    document.getElementById('modPubSheet')?.remove();
                    this.showToast('اننشر الخبر');
                    if (wantPush) this._modPush(id);
                } catch (e) { this.showToast('ما اننشر، صلاحيتك مطفية أو انقطع النت'); if (btn) { btn.disabled = false; btn.textContent = 'نشر للكل'; } }
            },
            _refreshVerifiedViews() {
                const v = this.currentView;
                try {
                    if (v === 'profileView') this.updateProfileView && this.updateProfileView();
                    else if (v === 'leaderboardView') this.renderLeaderboard && this.renderLeaderboard();
                    else if (v === 'messagesView') this.renderChatsList && this.renderChatsList();
                    else if (v === 'friendsView') this.renderFriendsView && this.renderFriendsView();
                    if (this.currentChatUid) { const el = document.getElementById('chatThreadName'); if (el && this.currentChatOther) el.innerHTML = escapeHtml(this.currentChatOther.name) + this.vb(this.currentChatUid); }
                } catch (e) { /* the next render picks it up */ }
            },

            // The app's own confirmation window (instead of the browser's confirm(), which shows
            // the site address and can't be styled). Resolves true when the main button is pressed.
            ask(o) {
                const opt = typeof o === 'string' ? { text: o } : (o || {});
                if (this._askDone) this._askDone(false);
                return new Promise((resolve) => {
                    const bg = document.createElement('div');
                    bg.className = 'ax-bg';
                    bg.innerHTML = `<div class="ax ${opt.tone || 'danger'}" role="alertdialog" aria-modal="true">
                        <span class="ax-ic"><i data-lucide="${escapeHtml(opt.icon || 'alert-triangle')}"></i></span>
                        ${opt.title ? `<b class="ax-t">${escapeHtml(opt.title)}</b>` : ''}
                        ${opt.text ? `<p class="ax-p">${escapeHtml(opt.text)}</p>` : ''}
                        <div class="ax-btns"><button class="ax-ok">${escapeHtml(opt.ok || 'تأكيد')}</button><button class="ax-no">${escapeHtml(opt.cancel || 'إلغاء')}</button></div>
                    </div>`;
                    const done = (v) => {
                        if (this._askDone !== done) return;
                        this._askDone = null;
                        document.removeEventListener('keydown', key);
                        bg.classList.add('out');
                        setTimeout(() => bg.remove(), 200);
                        resolve(v);
                    };
                    const key = (e) => { if (e.key === 'Escape') done(false); else if (e.key === 'Enter') done(true); };
                    this._askDone = done;
                    bg.addEventListener('click', (e) => { if (e.target === bg) done(false); });
                    bg.querySelector('.ax-ok').addEventListener('click', () => done(true));
                    bg.querySelector('.ax-no').addEventListener('click', () => done(false));
                    document.addEventListener('keydown', key);
                    document.body.appendChild(bg);
                    try { lucide.createIcons(); } catch (e) {}
                    setTimeout(() => bg.querySelector('.ax-no')?.focus(), 50);
                });
            },

            showToast(message) {
                const container = document.getElementById('toastContainer');
                if (!container) return;
                const toast = document.createElement('div');
                toast.className = 'toast-enter px-4 py-3 rounded-xl shadow-elevated text-sm font-medium text-center theme-transition';
                toast.style.backgroundColor = 'var(--text)';
                toast.style.color = 'var(--surface)';
                toast.textContent = message;
                container.appendChild(toast);
                setTimeout(() => {
                    toast.classList.remove('toast-enter');
                    toast.classList.add('toast-exit');
                    setTimeout(() => toast.remove(), 300);
                }, 2500);
            },

            // FIX: the touchmove listener used to be registered with `{ passive: true }`,
            // which means the browser is told upfront that preventDefault() will never be
            // called on it — so even attempting to suppress the native overscroll/refresh
            // gesture while the custom pull-to-refresh UI is active was silently impossible.
            // On some Android/PWA contexts both the custom indicator and the native bounce
            // could visibly fire together. The listener is now `{ passive: false }`, and
            // preventDefault() is called while an intentional downward pull is in progress at
            // the top of the page, so only the custom indicator responds.
            setupPullToRefresh() {
                let startY = 0, isPulling = false, pullDistance = 0;
                const main = document.getElementById('mainContent');
                const indicator = document.getElementById('ptrIndicator');
                if (!main || !indicator) return;
                // FIX: any downward movement at the top of the page used to count as a pull —
                // even 1px of drift during a sideways swipe on the category chips — and
                // preventDefault() then cancelled the native horizontal scroll, so the chips
                // stuck and wouldn't scroll back. The gesture is now only claimed once it's
                // clearly vertical (downward and taller than wide, past a 12px dead zone).
                let startX = 0, decided = false;
                main.addEventListener('touchstart', (e) => {
                    decided = false;
                    if (window.scrollY === 0 && this.currentView === 'homeView') { startY = e.touches[0].clientY; startX = e.touches[0].clientX; isPulling = true; pullDistance = 0; }
                    else isPulling = false;
                }, { passive: true });
                main.addEventListener('touchmove', (e) => {
                    if (!isPulling) return;
                    pullDistance = e.touches[0].clientY - startY;
                    if (!decided) {
                        const dx = Math.abs(e.touches[0].clientX - startX);
                        if (dx < 12 && Math.abs(pullDistance) < 12) return; // not sure yet
                        decided = true;
                        if (dx >= Math.abs(pullDistance) || pullDistance <= 0) { isPulling = false; return; }
                    }
                    if (pullDistance > 0 && window.scrollY === 0) {
                        if (e.cancelable) e.preventDefault();
                        if (pullDistance < 150) {
                            indicator.style.opacity = Math.min(pullDistance / 100, 1);
                            indicator.style.transform = `translateY(${pullDistance * 0.3}px)`;
                        }
                    } else if (pullDistance <= 0) {
                        isPulling = false;
                    }
                }, { passive: false });
                main.addEventListener('touchend', () => {
                    if (!isPulling) return;
                    isPulling = false;
                    if (pullDistance > 40) {
                        indicator.style.opacity = '1';
                        this.loadData();
                        setTimeout(() => {
                            indicator.style.opacity = '0';
                            indicator.style.transform = 'translateY(0)';
                            this.showToast('تم تحديث الأخبار');
                        }, 1500);
                    } else {
                        indicator.style.opacity = '0';
                        indicator.style.transform = 'translateY(0)';
                    }
                    pullDistance = 0;
                });
            },

            checkNetwork() {
                this.isOnline = navigator.onLine;
                const bar = document.getElementById('networkBar');
                if (!bar) return;
                if (!this.isOnline) bar.classList.remove('hidden-bar');
                else bar.classList.add('hidden-bar');
            },

            // The home page shows what this phone saved last time at once (no waiting for the network), then
            // the server is asked only for what is new since (see listenForNews).
            NEWS_PAGE: 10,
            async _newsBoot() {
                let items = [];
                try { items = await newsStore.all(); } catch (e) {}
                if (!items.length) {
                    // the copy the app kept in localStorage before: moved over once
                    const legacy = loadNewsCache();
                    if (Array.isArray(legacy) && legacy.length) { items = withNumericIds(legacy); await newsStore.put(items); }
                }
                try { localStorage.removeItem('isp_news_cache'); } catch (e) {}
                if (items.length && newsData.length === 0) {
                    const deleted = this.getDeletedNewsIds();
                    withNumericIds(items).filter((n) => !deleted.has(n.id)).sort((a, b) => b.id - a.id).forEach((n) => newsData.push(n));
                }
                this._newsBootDone = true;
                if (newsData.length) {
                    this.applyUserNewsState();
                    this.renderNews();
                    this.renderNewsTicker();
                    lucide.createIcons();
                }
                this.listenForNews();
                this._newsPrune();
            },
            // News the admin deleted while this phone was away: a keys-only request (a few bytes).
            async _newsPrune() {
                if (!newsData.length || !window.firebaseDb) return;
                try {
                    const base = String((window.firebaseDb.app && window.firebaseDb.app.options && window.firebaseDb.app.options.databaseURL) || 'https://iraqi-student-platform-9918d-default-rtdb.firebaseio.com').replace(/\/$/, '');
                    const ctl = new AbortController();
                    const t = setTimeout(() => ctl.abort(), 10000);
                    const r = await fetch(base + '/news.json?shallow=true', { signal: ctl.signal });
                    clearTimeout(t);
                    if (!r.ok) return;
                    const keys = await r.json();
                    const have = new Set(Object.keys(keys || {}).map(Number));
                    const gone = newsData.filter((n) => !have.has(n.id));
                    if (!gone.length) return;
                    gone.forEach((n) => { const i = newsData.indexOf(n); if (i > -1) newsData.splice(i, 1); });
                    newsStore.remove(gone.map((n) => n.id));
                    this.renderNews();
                    this.renderNewsTicker();
                    lucide.createIcons();
                } catch (e) { /* offline: the saved copy stays */ }
            },
            // Older news, a page at a time (the home page starts with the newest ones only).
            async loadOlderNews() {
                if (this._newsOlderBusy || !window.firebaseDb || !newsData.length) return;
                this._newsOlderBusy = true;
                const btn = document.getElementById('newsMoreBtn');
                if (btn) { btn.disabled = true; btn.textContent = 'جاري التحميل...'; }
                try {
                    const { ref, get, query, orderByKey, endBefore, limitToLast } = window.firebaseDbHelpers;
                    const minId = Math.min(...newsData.map((n) => n.id));
                    const snap = await get(query(ref(window.firebaseDb, 'news'), orderByKey(), endBefore(String(minId)), limitToLast(this.NEWS_PAGE)));
                    const list = snap.exists() ? withNumericIds(Object.values(snap.val())) : [];
                    const deleted = this.getDeletedNewsIds();
                    const added = list.filter((n) => !deleted.has(n.id) && this._newsAimed(n) && this._newsReady(n) && !newsData.some((x) => x.id === n.id));
                    added.forEach((n) => newsData.push(n));
                    newsData.sort((a, b) => b.id - a.id);
                    newsStore.put(added);
                    if (list.length < this.NEWS_PAGE) this._newsAllLoaded = true;
                    this.applyUserNewsState();
                    this.renderNews();
                    lucide.createIcons();
                } catch (e) {
                    console.warn('Older news failed:', e);
                    this.showToast('ما كدرت أجيب الأخبار الأقدم، تأكد من النت');
                } finally {
                    this._newsOlderBusy = false;
                    const b2 = document.getElementById('newsMoreBtn');
                    if (b2) { b2.disabled = false; b2.textContent = 'عرض أخبار أقدم'; }
                }
            },
            // If the server hasn't answered after a while and there is nothing to show, say so
            _newsWatch() {
                if (this._newsWatchT || this._newsGot) return;
                this._newsWatchT = setTimeout(() => {
                    this._newsWatchT = null;
                    if (!this._newsGot && !newsData.length) this.showError();
                }, 15000);
            },

            // ==================== OFFLINE RESOURCES ====================
            // Loads whatever the student already saved for offline use, straight from
            // IndexedDB — independent of Firebase, so it works even on a fully offline
            // cold start where listenForResources() never gets a snapshot to hydrate from.
            async hydrateOfflineResources() {
                try {
                    const all = await offlineResourcesDB.getAll();
                    this.offlineResourcesMeta = all;
                    this.offlineResourceIds = new Set(all.map(r => r.id));
                    all.forEach((res) => {
                        if (!resourcesData.some(r => r.id === res.id)) resourcesData.push(res);
                    });
                    if (this.currentView === 'resourcesView') { this.renderResourcesList(); lucide.createIcons(); }
                } catch (e) {
                    console.warn('تعذر تحميل الملازم المحفوظة بدون نت:', e);
                }
            },

            // The PDF itself: inside the record for old resources (a data: URL), or in resourceFiles/{id}
            // for new ones (fileUrl 'db:<id>'), so the list of resources stays light and the file is
            // downloaded only when the student asks for it.
            async _resFile(res) {
                const f = String(res.fileUrl || '');
                if (f.indexOf('data:') === 0) return f;
                // a big handout is saved in pieces (resourceFiles/{id}/{0..n-1}, 1 MiB of Base64 each): fetched four at a time, joined in order
                const n = Number(res.fileParts) || 0;
                if (f.indexOf('db:') === 0 && n > 0 && window.firebaseDb) {
                    const { ref, get } = window.firebaseDbHelpers, id = f.slice(3), out = new Array(n);
                    let next = 0, done = 0, failed = false, shown = 0;
                    const worker = async () => {
                        while (!failed) {
                            const i = next++;
                            if (i >= n) return;
                            let v = null;
                            for (let t = 0; t < 3 && typeof v !== 'string'; t++) {
                                try { v = (await get(ref(window.firebaseDb, 'resourceFiles/' + id + '/' + i))).val(); }
                                catch (e) { await new Promise((r) => setTimeout(r, 500 * (t + 1))); }
                            }
                            if (typeof v !== 'string') { failed = true; return; }
                            out[i] = v; done++;
                            const pct = Math.floor(done * 100 / n / 25) * 25;
                            if (pct > shown && pct < 100) { shown = pct; this.showToast('جاري تحميل الملزمة ' + pct + '%'); }
                        }
                    };
                    await Promise.all([worker(), worker(), worker(), worker()]);
                    return failed ? '' : 'data:application/pdf;base64,' + out.join('');
                }
                if (f.indexOf('db:') === 0 && window.firebaseDb) {
                    const { ref, get } = window.firebaseDbHelpers;
                    const v = (await get(ref(window.firebaseDb, 'resourceFiles/' + f.slice(3)))).val();
                    if (typeof v === 'string' && v.indexOf('data:') === 0) return v;
                }
                return '';
            },
            async downloadResourceOffline(id) {
                const res0 = resourcesData.find(r => r.id === id) || this.offlineResourcesMeta.find(r => r.id === id);
                if (!res0) { this.showToast('الملف غير متوفر'); return; }
                if (!res0.fileUrl) { this.showToast('رابط الملف غير متوفر لهذه الملزمة'); return; }
                this.showToast('جاري الحفظ للاستخدام بدون نت...');
                try {
                    const fileUrl = await this._resFile(res0);
                    if (!fileUrl) { this.showToast('تعذر تحميل الملف، تأكد من النت وحاول مرة ثانية'); return; }
                    const res = Object.assign({}, res0, { fileUrl });
                    await offlineResourcesDB.save(res);
                    this.offlineResourceIds.add(id);
                    if (!this.offlineResourcesMeta.some(r => r.id === id)) {
                        this.offlineResourcesMeta = [...this.offlineResourcesMeta, { ...res, savedAt: Date.now() }];
                    }
                    this.showToast('تم حفظ الملزمة — متاحة الآن بدون إنترنت');
                    if (this.currentView === 'resourceDetailView' && this.currentResourceId === id) this.openResource(id);
                    if (this.currentView === 'resourcesView') this.renderResourcesList();
                    lucide.createIcons();
                } catch (e) {
                    console.warn('Offline resource save failed:', e);
                    this.showToast('تعذر الحفظ — تأكد من توفر مساحة تخزين كافية بالجهاز');
                }
            },

            async openOfflineResource(id) {
                // FIX: window.open() after two awaits is no longer tied to the tap, so mobile
                // browsers blocked it as a pop-up and the saved PDF never opened. The tab is
                // opened synchronously first and pointed at the file once it's ready.
                const win = window.open('', '_blank');
                try {
                    const res = await offlineResourcesDB.get(id);
                    if (!res || !res.fileUrl) {
                        if (win) win.close();
                        this.showToast('الملزمة غير محفوظة على هذا الجهاز');
                        return;
                    }
                    // fileUrl is a data: URL; converting to a blob: URL avoids the browsers
                    // that refuse to navigate a top-level tab directly to a data: URL.
                    const blob = await (await fetch(res.fileUrl)).blob();
                    const blobUrl = URL.createObjectURL(blob);
                    if (win) win.location.href = blobUrl;
                    else this.showToast('اسمح للمتصفح بفتح النوافذ حتى تنفتح الملزمة');
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                } catch (e) {
                    if (win) win.close();
                    console.warn('Offline resource open failed:', e);
                    this.showToast('تعذر فتح الملف المحفوظ');
                }
            },

            async removeOfflineResource(id) {
                try {
                    await offlineResourcesDB.remove(id);
                    this.offlineResourceIds.delete(id);
                    this.offlineResourcesMeta = this.offlineResourcesMeta.filter(r => r.id !== id);
                    this.showToast('تم حذف الملزمة من التخزين بدون نت');
                    if (this.currentView === 'resourceDetailView' && this.currentResourceId === id) this.openResource(id);
                    if (this.currentView === 'resourcesView') this.renderResourcesList();
                    lucide.createIcons();
                } catch (e) {
                    console.warn('Offline resource remove failed:', e);
                    this.showToast('تعذر الحذف');
                }
            }
        };

        document.addEventListener('DOMContentLoaded', () => { app.init(); });
        window.app = app;

        // ================= UI/UX 2026: motion + navigation polish =================
        (function () {
            const TAB_VIEWS = ['homeView', 'resourcesView', 'holidaysView', 'leaderboardView', 'walletView', 'storeView', 'messagesView', 'profileView'];
            const ANIMS = ['view-in-fwd', 'view-in-back', 'view-in-tab'];

            // Re-run the entrance animation on every navigation (before, it only played once),
            // and pick a direction: tab ↔ tab crossfades, push slides in, back slides out.
            const originalSwitchView = app.switchView;
            app.switchView = function (viewId) {
                const from = this.currentView;
                const isBack = !!this._skipHistory;
                const result = originalSwitchView.apply(this, arguments);
                const view = document.getElementById(viewId);
                if (view && from !== viewId) {
                    const cls = isBack ? 'view-in-back'
                        : (TAB_VIEWS.includes(viewId) && TAB_VIEWS.includes(from)) ? 'view-in-tab'
                        : 'view-in-fwd';
                    view.classList.remove(...ANIMS);
                    void view.offsetWidth;
                    view.classList.add(cls);
                    // Drop the class when done so the view never keeps a transform that
                    // would re-anchor fixed children (chat input bar, store feed).
                    view.addEventListener('animationend', function done(e) {
                        if (e.target !== view) return;
                        view.classList.remove(...ANIMS);
                        view.removeEventListener('animationend', done);
                    });
                }
                return result;
            };

            // Springy capsule that glides to the active tab.
            function placeIndicator() {
                const nav = document.getElementById('bottomNav');
                const track = nav && nav.querySelector('.nav-track');
                const pill = track && track.querySelector('.nav-indicator');
                if (!pill) return;
                const active = track.querySelector('.nav-item.active');
                if (!active || nav.getClientRects().length === 0) { pill.classList.remove('is-ready'); return; }
                const icon = active.firstElementChild;
                const t = track.getBoundingClientRect();
                const r = (icon || active).getBoundingClientRect();
                const x = r.left - t.left + r.width / 2 - pill.offsetWidth / 2;
                const y = r.top - t.top + r.height / 2 - pill.offsetHeight / 2;
                if (!pill.classList.contains('is-ready')) {
                    pill.style.transition = 'none';
                    pill.style.transform = `translate(${x}px, ${y}px)`;
                    void pill.offsetWidth;
                    pill.style.transition = '';
                    pill.classList.add('is-ready');
                } else {
                    pill.style.transform = `translate(${x}px, ${y}px)`;
                }
            }
            let raf = 0;
            const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(placeIndicator); };

            function initUx() {
                const track = document.querySelector('#bottomNav .nav-track');
                if (track) {
                    new MutationObserver(schedule).observe(track, { attributes: true, subtree: true, attributeFilter: ['class'] });
                }
                new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
                window.addEventListener('resize', schedule);
                if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
                setTimeout(schedule, 60);
                setTimeout(schedule, 400);

                // Header gains a hairline + shadow only once content scrolls beneath it.
                const onScroll = () => document.body.classList.toggle('is-scrolled', window.scrollY > 6);
                window.addEventListener('scroll', onScroll, { passive: true });
                onScroll();
            }
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUx);
            else initUx();
        })();

    
