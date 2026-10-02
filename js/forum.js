// المنتدى: the students' board, rebuilt as a question-and-answer feed. Posts are questions, discussions
// or tips; the asker marks the answer that solved it, answers get "helpful" votes, posts can be
// searched, sorted (newest, hot, unanswered), saved and filtered by subject, and older posts load on
// demand. Data (unchanged shape): forumThreads/{id}, forumAnswers/{threadId}/{id}; new optional fields
// kind, title, authorGov, best (thread) and likes (answers). The newest 40 posts are listened to in
// js/app.js (listenForForumThreads); everything else is here. Loaded by app._need('forum').
(function () {
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const SUBJECTS = [
        ['all', 'الكل', 'layout-grid', '#475569'],
        ['arabic', 'العربي', 'languages', '#0D9488'],
        ['english', 'الإنكليزي', 'globe', '#7C3AED'],
        ['math', 'الرياضيات', 'sigma', '#2563EB'],
        ['chemistry', 'الكيمياء', 'flask-conical', '#16A34A'],
        ['physics', 'الفيزياء', 'atom', '#EA580C'],
        ['biology', 'الأحياء', 'dna', '#DB2777'],
        ['other', 'أخرى', 'shapes', '#64748B'],
    ];
    const KINDS = { q: ['سؤال', 'circle-help'], chat: ['نقاش', 'messages-square'], tip: ['نصيحة', 'lightbulb'] };
    const TABS = [['new', 'الأحدث'], ['hot', 'الرائج'], ['open', 'بلا إجابة'], ['saved', 'محفوظاتي'], ['mine', 'منشوراتي']];
    const subj = (id) => SUBJECTS.find((x) => x[0] === id) || SUBJECTS[SUBJECTS.length - 1];
    const F = { tab: 'new', subj: 'all', q: '', older: [], oldLoading: false, oldEnd: false, seen: {}, ans: {}, ansUn: null, kind: 'q', csubj: 'math', img: '' };

    const likesOf = (o) => (o && o.likes ? Object.keys(o.likes).length : 0);
    const all = () => {
        const m = {}; forumThreads.forEach((t) => { m[t.id] = t; }); F.older.forEach((t) => { if (!m[t.id]) m[t.id] = t; });
        return Object.values(m).sort((a, b) => b.id - a.id);
    };
    const byId = (id) => all().find((t) => t.id === id);

    Object.assign(app, {
        // ---------- the feed ----------
        fmOpen() {
            const box = document.getElementById('fmContent');
            if (!box) return;
            if (!document.getElementById('fmList')) {
                box.innerHTML = '<div class="fm-wrap">'
                    + '<div class="fm-hero"><div class="fm-hero-t">منتدى الطلاب</div><div class="fm-hero-p">اسأل، جاوب، وشارك اللي يفيد زملاءك</div><div class="fm-stats" id="fmStats"></div>'
                    + '<label class="fm-search"><i data-lucide="search"></i><input id="fmQ" type="search" maxlength="60" placeholder="دوّر بالمنشورات..." oninput="app.fmSearch(this.value)"></label></div>'
                    + '<div class="fm-tabs" id="fmTabs"></div><div class="fm-subjs" id="fmSubjs"></div>'
                    + '<div id="fmList" class="fm-list"></div><div class="fm-more" id="fmMore"></div></div>'
                    + '<button class="fm-fab" onclick="app.fmCompose()" aria-label="منشور جديد"><i data-lucide="pen-line"></i><span>اكتب</span></button>';
            }
            this._fmChips();
            this.fmRender();
            if (window.lucide) lucide.createIcons();
        },

        _fmChips() {
            const tabs = document.getElementById('fmTabs'), sj = document.getElementById('fmSubjs');
            if (tabs) tabs.innerHTML = TABS.map((t) => '<button class="' + (F.tab === t[0] ? 'on' : '') + '" onclick="app.fmTab(\'' + t[0] + '\')">' + t[1] + '</button>').join('');
            if (sj) sj.innerHTML = SUBJECTS.map((s) => '<button class="' + (F.subj === s[0] ? 'on' : '') + '" style="--c:' + s[3] + '" onclick="app.fmSubj(\'' + s[0] + '\')"><i data-lucide="' + s[2] + '"></i>' + s[1] + '</button>').join('');
        },
        fmTab(t) { F.tab = t; this._fmChips(); this.fmRender(); if (window.lucide) lucide.createIcons(); },
        fmSubj(s) { F.subj = s; this._fmChips(); this.fmRender(); if (window.lucide) lucide.createIcons(); },
        fmSearch(v) { clearTimeout(F.st); F.st = setTimeout(() => { F.q = String(v || '').trim().toLowerCase(); this.fmRender(); if (window.lucide) lucide.createIcons(); }, 200); },

        _fmSaved() { try { return JSON.parse(localStorage.getItem('isp:fm:saved:' + (this.authUid || 'guest')) || '[]') || []; } catch (e) { return []; } },
        fmSave(id, ev) {
            if (ev) ev.stopPropagation();
            let l = this._fmSaved();
            if (l.includes(id)) { l = l.filter((x) => x !== id); this.showToast('انشالت من محفوظاتك'); } else { l.unshift(id); this.showToast('انحفظ المنشور'); }
            try { localStorage.setItem('isp:fm:saved:' + (this.authUid || 'guest'), JSON.stringify(l.slice(0, 200))); } catch (e) {}
            this.fmRender(); if (this.currentView === 'forumThreadView') this.fmThreadRender();
            if (window.lucide) lucide.createIcons();
        },

        _fmScore(t) {
            const hours = Math.max(0, (Date.now() - t.id) / 3600000);
            return (likesOf(t) * 2 + (Number(t.answersCount) || 0) * 3 + 1) / Math.pow(hours + 2, 1.2);
        },

        fmRender() {
            const list = document.getElementById('fmList');
            if (!list) return;
            let rows = all();
            const me = this.authUid, saved = this._fmSaved();
            if (F.subj !== 'all') rows = rows.filter((t) => t.subject === F.subj);
            if (F.q) rows = rows.filter((t) => (String(t.title || '') + ' ' + String(t.body || '') + ' ' + String(t.authorName || '')).toLowerCase().includes(F.q));
            if (F.tab === 'open') rows = rows.filter((t) => (t.kind === 'q' || (!t.kind && false)) && !t.best && !(Number(t.answersCount) > 0));
            if (F.tab === 'mine') rows = rows.filter((t) => me && t.authorUid === me);
            if (F.tab === 'saved') rows = rows.filter((t) => saved.includes(t.id));
            if (F.tab === 'hot') rows = rows.slice().sort((a, b) => this._fmScore(b) - this._fmScore(a));
            // hero numbers
            const st = document.getElementById('fmStats'), a = all();
            if (st) {
                const open = a.filter((t) => t.kind === 'q' && !t.best && !(Number(t.answersCount) > 0)).length, solved = a.filter((t) => t.best).length;
                st.innerHTML = '<div><b>' + a.length + '</b><span>منشور</span></div><div><b>' + open + '</b><span>بلا إجابة</span></div><div><b>' + solved + '</b><span>انحلّت</span></div>';
            }
            if (!rows.length && !this._forumGot) { list.innerHTML = '<div class="fm-sk"></div><div class="fm-sk"></div><div class="fm-sk"></div>'; return; }
            if (!rows.length) {
                const msg = F.tab === 'saved' ? 'ما محفوظ عندك شي بعد. اضغط علامة الحفظ بأي منشور.' : F.tab === 'mine' ? 'ما نشرت شي بعد.' : F.q ? 'ما لقيت منشور يطابق بحثك.' : F.tab === 'open' ? 'كل الأسئلة إلها إجابات. شاطر!' : 'ماكو منشورات هنا بعد، كون أول واحد.';
                list.innerHTML = '<div class="fm-empty"><div class="fm-empty-i"><i data-lucide="messages-square"></i></div><p>' + msg + '</p><button onclick="app.fmCompose()">اكتب منشور</button></div>';
            } else {
                let i = 0;
                list.innerHTML = rows.map((t) => this._fmCard(t, saved, F.seen[t.id] ? -1 : i++)).join('');
                rows.forEach((t) => { F.seen[t.id] = 1; });
            }
            const more = document.getElementById('fmMore');
            if (more) more.innerHTML = F.oldEnd ? '' : '<button class="fm-older" onclick="app.fmOlder()">' + (F.oldLoading ? 'جاري التحميل...' : 'عرض منشورات أقدم') + '</button>';
            if (window.lucide) lucide.createIcons();
        },

        _fmWho(o, big) {
            const g = o.authorGov ? ' - ' + esc(o.authorGov) : '';
            return '<img class="fm-av' + (big ? ' big' : '') + '" src="' + personAvatarSrc(o.authorAvatar, o.authorName) + '" alt="">'
                + '<div class="fm-who"><b>' + esc(o.authorName || 'طالب') + this.vb(o.authorUid) + '</b><small>' + timeAgo(o.id) + g + '</small></div>';
        },

        _fmCard(t, saved, idx) {
            const sj = subj(t.subject), kd = KINDS[t.kind] || KINDS.chat, n = Number(t.answersCount) || 0, lk = likesOf(t);
            const mine = this.authUid && t.likes && t.likes[this.authUid], sv = saved.includes(t.id);
            const badge = t.best ? '<span class="fm-b ok"><i data-lucide="badge-check"></i>انحلّ</span>' : (t.kind === 'q' && !n ? '<span class="fm-b wait"><i data-lucide="clock"></i>بانتظار إجابة</span>' : '');
            const title = t.title ? '<h3>' + esc(t.title) + '</h3>' : '';
            return '<article class="fm-card' + (t.best ? ' solved' : '') + (idx >= 0 ? ' in' : '') + '" style="--c:' + sj[3] + (idx >= 0 ? ';animation-delay:' + Math.min(idx, 8) * 55 + 'ms' : '') + '" onclick="app.fmThread(' + t.id + ')">'
                + '<div class="fm-top"><div class="fm-au" onclick="event.stopPropagation();app.openAuthorProfileFromThread(' + t.id + ')">' + this._fmWho(t) + '</div>'
                + '<span class="fm-kind"><i data-lucide="' + kd[1] + '"></i>' + kd[0] + '</span></div>'
                + '<div class="fm-tags"><span class="fm-sj"><i data-lucide="' + sj[2] + '"></i>' + sj[1] + '</span>' + badge + '</div>'
                + title + (t.body ? '<p class="fm-body">' + esc(t.body) + '</p>' : '')
                + (t.imageUrl ? '<img class="fm-img" loading="lazy" src="' + safeImage(t.imageUrl) + '" alt="">' : '')
                + '<div class="fm-foot"><button class="fm-act' + (mine ? ' on' : '') + '" onclick="event.stopPropagation();app.fmLike(' + t.id + ')"><i data-lucide="lightbulb"></i>مفيد' + (lk ? '<b>' + lk + '</b>' : '') + '</button>'
                + '<span class="fm-act"><i data-lucide="message-circle"></i>' + (n ? n + ' ' + (n === 1 ? 'إجابة' : 'إجابات') : 'جاوب') + '</span>'
                + '<button class="fm-act sv' + (sv ? ' on' : '') + '" onclick="app.fmSave(' + t.id + ', event)" aria-label="حفظ"><i data-lucide="bookmark"></i></button></div></article>';
        },

        async fmOlder() {
            if (F.oldLoading || F.oldEnd || !window.firebaseDb) return;
            F.oldLoading = true; this.fmRender();
            try {
                const { ref, get, query, orderByKey, endBefore, limitToLast } = window.firebaseDbHelpers;
                const a = all(), min = a.length ? a[a.length - 1].id : Date.now();
                const snap = await get(query(ref(window.firebaseDb, 'forumThreads'), orderByKey(), endBefore(String(min)), limitToLast(30)));
                const got = snap.exists() ? withNumericIds(Object.values(snap.val())) : [];
                F.older.push(...got);
                if (got.length < 30) F.oldEnd = true;
            } catch (e) { this.showToast('ما كدرت أحمّل المنشورات الأقدم'); }
            F.oldLoading = false; this.fmRender();
        },

        // ---------- likes ("helpful"), best answer ----------
        _fmNeedLogin(msg) {
            if (this.isLoggedIn && this.currentUser) return false;
            this.showToast(msg || 'سجّل دخولك حتى تتفاعل'); this.goToAuth('login'); return true;
        },
        fmLike(id) {
            if (this._fmNeedLogin('سجّل دخولك حتى تتفاعل') || !window.firebaseDb) return;
            const t = byId(id); if (!t) return;
            const uid = this.currentUid(); t.likes = t.likes || {};
            const had = !!t.likes[uid];
            if (had) delete t.likes[uid]; else t.likes[uid] = true;
            this.fmRender(); if (this.currentView === 'forumThreadView') this.fmThreadRender();
            const { ref, set } = window.firebaseDbHelpers;
            set(ref(window.firebaseDb, 'forumThreads/' + id + '/likes/' + uid), had ? null : true).catch(() => {
                if (had) t.likes[uid] = true; else delete t.likes[uid];
                this.fmRender(); this.showToast('ما انحسبت، حاول مرة ثانية');
            });
        },
        fmAnsLike(tid, aid) {
            if (this._fmNeedLogin() || !window.firebaseDb) return;
            const a = (F.ans[tid] || []).find((x) => x.id === aid); if (!a) return;
            const uid = this.currentUid(); a.likes = a.likes || {};
            const had = !!a.likes[uid];
            if (had) delete a.likes[uid]; else a.likes[uid] = true;
            this.fmThreadRender();
            const { ref, set } = window.firebaseDbHelpers;
            set(ref(window.firebaseDb, 'forumAnswers/' + tid + '/' + aid + '/likes/' + uid), had ? null : true).catch(() => {
                if (had) a.likes[uid] = true; else delete a.likes[uid];
                this.fmThreadRender(); this.showToast('ما انحسبت، حاول مرة ثانية');
            });
        },
        fmBest(tid, aid) {
            const t = byId(tid); if (!t || !window.firebaseDb || t.authorUid !== this.authUid) return;
            const prev = t.best, next = prev === aid ? null : aid;
            if (next) t.best = next; else delete t.best;
            this.fmThreadRender(); this.fmRender();
            const { ref, set } = window.firebaseDbHelpers;
            set(ref(window.firebaseDb, 'forumThreads/' + tid + '/best'), next).then(() => this.showToast(next ? 'تم اعتماد الإجابة كحل' : 'انلغى اعتماد الحل')).catch(() => {
                if (prev) t.best = prev; else delete t.best;
                this.fmThreadRender(); this.fmRender(); this.showToast('ما كدرت أعتمدها، حاول مرة ثانية');
            });
        },
        fmDelete(id) {
            const t = byId(id); if (!t || !window.firebaseDb || (t.authorUid !== this.authUid)) return;
            if (!confirm('تحذف منشورك؟')) return;
            const { ref, set } = window.firebaseDbHelpers;
            set(ref(window.firebaseDb, 'forumThreads/' + id), null).then(() => {
                F.older = F.older.filter((x) => x.id !== id);
                const i = forumThreads.findIndex((x) => x.id === id); if (i >= 0) forumThreads.splice(i, 1);
                this.showToast('انحذف منشورك'); this.goBack(); this.fmRender();
            }).catch(() => this.showToast('ما كدرت أحذفه، حاول مرة ثانية'));
        },

        // ---------- one post ----------
        fmThread(id) {
            const t = byId(id); if (!t) return;
            F.cur = id;
            this.switchView('forumThreadView');
            F.ans[id] = F.ans[id] || [];
            this.fmThreadRender();
            this._fmListenAnswers(id);
            if (window.lucide) lucide.createIcons();
        },
        _fmListenAnswers(id) {
            this.fmThreadClose();
            if (!window.firebaseDb) return;
            const { ref, onValue } = window.firebaseDbHelpers;
            F.ansUn = onValue(ref(window.firebaseDb, 'forumAnswers/' + id), (snap) => {
                F.ans[id] = snap.exists() ? withNumericIds(Object.values(snap.val())) : [];
                if (F.cur === id) { this.fmThreadRender(); if (window.lucide) lucide.createIcons(); }
            }, () => {});
        },
        fmThreadClose() { if (F.ansUn) { try { F.ansUn(); } catch (e) {} F.ansUn = null; } },

        fmThreadRender() {
            const box = document.getElementById('forumThreadContent'), t = byId(F.cur);
            if (!box || !t) return;
            const sj = subj(t.subject), kd = KINDS[t.kind] || KINDS.chat, lk = likesOf(t), mine = this.authUid && t.likes && t.likes[this.authUid];
            const sv = this._fmSaved().includes(t.id), isMine = this.authUid && t.authorUid === this.authUid;
            const ans = (F.ans[t.id] || []).slice().sort((a, b) => (t.best === b.id) - (t.best === a.id) || likesOf(b) - likesOf(a) || a.id - b.id);
            box.innerHTML = '<div class="fm-wrap fm-det">'
                + '<article class="fm-card big" style="--c:' + sj[3] + '">'
                + '<div class="fm-top"><div class="fm-au" onclick="app.openAuthorProfileFromThread(' + t.id + ')">' + this._fmWho(t, true) + '</div><span class="fm-kind"><i data-lucide="' + kd[1] + '"></i>' + kd[0] + '</span></div>'
                + '<div class="fm-tags"><span class="fm-sj"><i data-lucide="' + sj[2] + '"></i>' + sj[1] + '</span>' + (t.best ? '<span class="fm-b ok"><i data-lucide="badge-check"></i>انحلّ</span>' : '') + '</div>'
                + (t.title ? '<h3>' + esc(t.title) + '</h3>' : '') + (t.body ? '<p class="fm-body full">' + esc(t.body) + '</p>' : '')
                + (t.imageUrl ? '<img class="fm-img full" src="' + safeImage(t.imageUrl) + '" alt="">' : '')
                + '<div class="fm-foot"><button class="fm-act' + (mine ? ' on' : '') + '" onclick="app.fmLike(' + t.id + ')"><i data-lucide="lightbulb"></i>مفيد' + (lk ? '<b>' + lk + '</b>' : '') + '</button>'
                + '<button class="fm-act sv' + (sv ? ' on' : '') + '" onclick="app.fmSave(' + t.id + ', event)"><i data-lucide="bookmark"></i>' + (sv ? 'محفوظ' : 'حفظ') + '</button>'
                + (isMine ? '<button class="fm-act del" onclick="app.fmDelete(' + t.id + ')"><i data-lucide="trash-2"></i>حذف</button>' : '') + '</div></article>'
                + '<div class="fm-ah"><b>' + (ans.length ? ans.length + (ans.length === 1 ? ' إجابة' : ' إجابات') : 'الإجابات') + '</b></div>'
                + (ans.length ? ans.map((a) => this._fmAnswer(t, a, isMine)).join('') : '<div class="fm-noans"><i data-lucide="message-circle-question"></i>ماكو إجابات بعد. كون أول واحد يجاوب.</div>')
                + '</div>';
            if (window.lucide) lucide.createIcons();
        },

        _fmAnswer(t, a, isMine) {
            const best = t.best === a.id, lk = likesOf(a), mine = this.authUid && a.likes && a.likes[this.authUid];
            return '<div class="fm-ans' + (best ? ' best' : '') + '">'
                + (best ? '<div class="fm-ribbon"><i data-lucide="badge-check"></i>الحل المعتمد</div>' : '')
                + '<div class="fm-top"><div class="fm-au" onclick="app.openAuthorProfileFromAnswer(' + t.id + ',' + a.id + ')">' + this._fmWho(a) + '</div></div>'
                + '<p class="fm-body full">' + esc(a.body) + '</p>'
                + '<div class="fm-foot"><button class="fm-act' + (mine ? ' on' : '') + '" onclick="app.fmAnsLike(' + t.id + ',' + a.id + ')"><i data-lucide="thumbs-up"></i>مفيدة' + (lk ? '<b>' + lk + '</b>' : '') + '</button>'
                + (isMine && t.kind === 'q' ? '<button class="fm-act ok" onclick="app.fmBest(' + t.id + ',' + a.id + ')"><i data-lucide="check-check"></i>' + (best ? 'إلغاء الاعتماد' : 'هذا حلّ سؤالي') + '</button>' : '') + '</div></div>';
        },

        submitForumAnswer() {
            const input = document.getElementById('forumAnswerInput');
            if (!input) return;
            const body = input.value.trim();
            if (!body) return;
            if (this._fmNeedLogin('سجّل دخولك حتى تجاوب')) return;
            if (!window.firebaseDb || !F.cur) return;
            const f = filterBadWords(body);
            if (f.filtered) this.showToast('انحذفت كلمات مو لائقة من جوابك');
            const tid = F.cur, u = this.currentUser, { ref, set, runTransaction, serverTimestamp } = window.firebaseDbHelpers, id = Date.now();
            const payload = { id, body: f.clean.slice(0, 2000), authorName: u.fullName || 'طالب', authorAvatar: u.avatar || '', authorStudentNumber: u.studentNumber || '', authorGov: String(u.governorate || '').slice(0, 30), authorUid: this.currentUid(), createdAt: serverTimestamp() };
            input.value = '';
            set(ref(window.firebaseDb, 'forumAnswers/' + tid + '/' + id), payload).then(() => {
                runTransaction(ref(window.firebaseDb, 'forumThreads/' + tid + '/answersCount'), (c) => (c || 0) + 1).catch(() => {});
                const t = byId(tid); if (t) t.answersCount = (Number(t.answersCount) || 0) + 1;
            }).catch(() => { input.value = body; this.showToast('ما انرسل جوابك، حاول مرة ثانية'); });
        },

        // ---------- writing a post ----------
        fmCompose() {
            if (this._fmNeedLogin('سجّل دخولك حتى تنشر')) return;
            let d = {}; try { d = JSON.parse(localStorage.getItem('isp:fm:draft') || '{}') || {}; } catch (e) {}
            F.kind = KINDS[d.kind] ? d.kind : 'q'; F.csubj = d.subj || (F.subj !== 'all' ? F.subj : 'math'); F.img = '';
            const sh = document.createElement('div'); sh.className = 'fm-sheet'; sh.id = 'fmSheet';
            sh.innerHTML = '<div class="fm-back" onclick="app.fmCloseCompose()"></div><div class="fm-sh"><div class="fm-grab"></div>'
                + '<div class="fm-sh-t">منشور جديد</div>'
                + '<div class="fm-pk" id="fmKinds"></div>'
                + '<div class="fm-pk sj" id="fmCSubj"></div>'
                + '<input id="fmTitle" class="fm-in" maxlength="120" placeholder="العنوان (مثلاً: شلون أحل هالمسألة؟)" value="' + esc(d.title || '') + '" oninput="app._fmDraft()">'
                + '<textarea id="fmBody" class="fm-in" rows="5" maxlength="2500" placeholder="اكتب تفاصيل أكثر..." oninput="app._fmDraft()">' + esc(d.body || '') + '</textarea>'
                + '<div class="fm-prev hidden" id="fmPrev"><img alt=""><button type="button" onclick="app.fmImgClear()" aria-label="شيل الصورة">&times;</button></div>'
                + '<div class="fm-row"><label class="fm-attach"><i data-lucide="image-plus"></i>أضف صورة<input type="file" id="fmFile" accept="image/*" hidden onchange="app.fmImg(event)"></label><button id="fmPost" class="fm-post" onclick="app.fmPublish()">نشر</button></div></div>';
            document.body.appendChild(sh);
            this._fmComposeChips();
            requestAnimationFrame(() => sh.classList.add('on'));
            if (window.lucide) lucide.createIcons();
        },
        _fmComposeChips() {
            const k = document.getElementById('fmKinds'), s = document.getElementById('fmCSubj');
            if (k) k.innerHTML = Object.keys(KINDS).map((x) => '<button class="' + (F.kind === x ? 'on' : '') + '" onclick="app.fmPickKind(\'' + x + '\')"><i data-lucide="' + KINDS[x][1] + '"></i>' + KINDS[x][0] + '</button>').join('');
            if (s) s.innerHTML = SUBJECTS.filter((x) => x[0] !== 'all').map((x) => '<button class="' + (F.csubj === x[0] ? 'on' : '') + '" style="--c:' + x[3] + '" onclick="app.fmPickSubj(\'' + x[0] + '\')">' + x[1] + '</button>').join('');
            if (window.lucide) lucide.createIcons();
        },
        fmPickKind(k) { F.kind = k; this._fmComposeChips(); this._fmDraft(); },
        fmPickSubj(s) { F.csubj = s; this._fmComposeChips(); this._fmDraft(); },
        _fmDraft() {
            try { localStorage.setItem('isp:fm:draft', JSON.stringify({ kind: F.kind, subj: F.csubj, title: (document.getElementById('fmTitle') || {}).value || '', body: (document.getElementById('fmBody') || {}).value || '' })); } catch (e) {}
        },
        fmCloseCompose() { const s = document.getElementById('fmSheet'); if (s) { s.classList.remove('on'); setTimeout(() => s.remove(), 260); } },
        async fmImg(ev) {
            const f = ev.target.files && ev.target.files[0]; if (!f) return;
            const url = await compressForumImage(f, 640);
            if (!url) { this.showToast('ما كدرت أقرا الصورة'); return; }
            if (url.length > 550000) { this.showToast('الصورة كبيرة، اختار صورة أصغر'); return; }
            F.img = url;
            const p = document.getElementById('fmPrev'); p.classList.remove('hidden'); p.querySelector('img').src = url;
        },
        fmImgClear() { F.img = ''; const p = document.getElementById('fmPrev'); if (p) p.classList.add('hidden'); const f = document.getElementById('fmFile'); if (f) f.value = ''; },
        fmPublish() {
            const title = (document.getElementById('fmTitle').value || '').trim(), body = (document.getElementById('fmBody').value || '').trim();
            if (!title && !body && !F.img) { this.showToast('اكتب شي أو أضف صورة'); return; }
            if (F.kind === 'q' && !title && body.length < 8) { this.showToast('اكتب سؤالك بوضوح أكثر'); return; }
            if (!window.firebaseDb) { this.showToast('ماكو اتصال'); return; }
            const ft = filterBadWords(title), fb = filterBadWords(body);
            if (ft.filtered || fb.filtered) this.showToast('انحذفت كلمات مو لائقة من منشورك');
            const btn = document.getElementById('fmPost'); btn.disabled = true; btn.textContent = 'جاري النشر...';
            const u = this.currentUser, { ref, set, serverTimestamp } = window.firebaseDbHelpers, id = Date.now();
            const payload = { id, kind: F.kind, subject: F.csubj, title: ft.clean.slice(0, 150), body: fb.clean.slice(0, 3000), imageUrl: F.img || '', authorName: u.fullName || 'طالب', authorAvatar: u.avatar || '', authorStudentNumber: u.studentNumber || '', authorGov: String(u.governorate || '').slice(0, 30), authorUid: this.currentUid(), answersCount: 0, likes: {}, createdAt: serverTimestamp() };
            set(ref(window.firebaseDb, 'forumThreads/' + id), payload).then(() => {
                try { localStorage.removeItem('isp:fm:draft'); } catch (e) {}
                this.fmCloseCompose(); this.showToast('اننشر منشورك');
                F.tab = 'new'; F.subj = 'all'; this._fmChips();
            }).catch(() => { btn.disabled = false; btn.textContent = 'نشر'; this.showToast('ما انرسل المنشور، حاول مرة ثانية'); });
        },
    });
})();
