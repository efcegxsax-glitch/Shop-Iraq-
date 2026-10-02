// غذائي ومائي: the student writes what they ate and the tutor says, food by food, what helps their
// focus and memory and what harms it (Worker mode "food", or the built-in list below when the
// tutor is off or there is no internet), with varied ideas for memory-friendly meals; and a
// water tracker. The reminders themselves (meals 15 minutes before, water every so often) are in
// js/app.js (_nutTick) so they run on any page; their settings are here.
// Loaded on demand by app._need('food').
(function () {
    const esc = (s) => escapeHtml(String(s == null ? '' : s));
    const V = { good: ['زين', '#16A34A', 'thumbs-up'], ok: ['عادي', '#D97706', 'minus'], bad: ['يضر إذا يكثر', '#DC2626', 'thumbs-down'] };
    const norm = (s) => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/گ/g, 'ك').replace(/چ/g, 'ج').replace(/ڤ/g, 'ف');

    // [words, name, verdict, why]
    const FOODS = [
        [['بيض', 'بيضه', 'عيون'], 'بيض', 'good', 'بيه كولين يحتاجه الدماغ للذاكرة، وبروتين يشبعك لساعات.'],
        [['تمر', 'تمرات'], 'تمر', 'good', 'سكر طبيعي ويا ألياف، يعطيك طاقة هادئة بدون هبوط مفاجئ.'],
        [['جوز', 'عين الجمل'], 'جوز', 'good', 'من أحسن الأكلات للذاكرة، بيه أوميغا 3 للدماغ.'],
        [['لوز', 'فستق', 'كاجو', 'مكسرات', 'حب'], 'مكسرات', 'good', 'دهون مفيدة وفيتامين E يحمي خلايا الدماغ. حفنة صغيرة تكفي.'],
        [['سمك', 'سمج', 'مسكوف', 'تونه', 'سردين'], 'سمك', 'good', 'أوميغا 3 يقوي الذاكرة والتركيز. مرتين بالأسبوع ممتاز.'],
        [['عدس', 'شوربه عدس'], 'عدس', 'good', 'حديد وبروتين، يقلل التعب ويخلي المخ صاحي.'],
        [['باقلاء', 'فول', 'حمص', 'فاصوليا', 'فاصولياء', 'لوبيا'], 'بقوليات', 'good', 'بروتين وألياف، طاقة ثابتة لساعات الدراسة.'],
        [['لبن', 'روب', 'زبادي'], 'لبن', 'good', 'خفيف ومريح للمعدة، وبيه بروتين وكالسيوم.'],
        [['حليب'], 'حليب', 'good', 'كالسيوم وبروتين، وكوب دافي بالليل يساعد على النوم.'],
        [['شوفان'], 'شوفان', 'good', 'فطور ممتاز، يطلق الطاقة شوية شوية فتضل مركز.'],
        [['رمان'], 'رمان', 'good', 'مضادات أكسدة تحمي خلايا الدماغ.'],
        [['موز'], 'موز', 'good', 'طاقة سريعة ومغنيسيوم يهدي الأعصاب قبل الامتحان.'],
        [['تفاح', 'برتقال', 'عنب', 'كيوي', 'فراوله', 'فواكه', 'فاكهه', 'رقي', 'بطيخ', 'مشمش', 'خوخ'], 'فواكه', 'good', 'فيتامينات وماي، تنعشك بين الجلسات.'],
        [['خيار', 'طماطه', 'خس', 'سلطه', 'جزر', 'فلفل', 'خضره', 'خضار', 'كرفس', 'فجل'], 'خضرة', 'good', 'فيتامينات وألياف، خفيفة وتخليك صاحي.'],
        [['سبانخ', 'بروكلي', 'شجر'], 'خضرة ورقية', 'good', 'حديد وفيتامين K، مفيدة للذاكرة.'],
        [['دجاج مشوي', 'دجاج', 'دجاجه', 'تكه'], 'دجاج', 'good', 'بروتين خفيف، أحسن مشوي أو مسلوق من المقلي.'],
        [['عسل'], 'عسل', 'good', 'ملعقة صغيرة تعطي طاقة. لا تكثر.'],
        [['ماي', 'ماء'], 'ماي', 'good', 'قلة الماي تعب وصداع، والماي يرجعلك التركيز.'],
        [['خبز اسمر', 'صمون اسمر', 'خبز شعير', 'اسمر'], 'خبز أسمر', 'good', 'حبوب كاملة، طاقة أثبت من الأبيض.'],
        [['شوربه'], 'شوربة', 'good', 'خفيفة ودافية، ما تثقل عليك.'],
        [['خبز', 'صمون', 'كعك', 'لفه خبز'], 'خبز', 'ok', 'طاقة، بس الأسمر يشبعك أكثر ويخليك مركز أطول.'],
        [['تمن', 'رز', 'تمن ومرق'], 'تمن', 'ok', 'طاقة، بس كمية كبيرة تخليك نعسان بعدها.'],
        [['مرق', 'بامية', 'باميه', 'فاصوليا يابسه'], 'مرق', 'ok', 'وجبة كاملة إذا بيها خضرة، خلي الكمية معتدلة.'],
        [['دولمه', 'محشي'], 'دولمة', 'ok', 'طيبة بس دسمة، صحن صغير وبعدها مشية خفيفة.'],
        [['تشريب', 'باجه', 'باچه', 'كبه', 'قوزي'], 'أكلة دسمة', 'ok', 'ثقيلة على المعدة، بعدها تنعس. خليها للعطلة مو قبل الدراسة.'],
        [['كباب', 'لحم', 'تكه لحم'], 'لحم', 'ok', 'حديد وبروتين، بس المشوي أحسن، ولا تكثر الدهن.'],
        [['جبن', 'جبنه'], 'جبن', 'ok', 'بروتين وكالسيوم، بس مالح، لا تكثر.'],
        [['قيمر', 'كيمر'], 'قيمر', 'ok', 'دسم كلش، شوية بالفطور مو مشكلة.'],
        [['معكرونه', 'باستا'], 'معكرونة', 'ok', 'طاقة، والأحسن ويا خضرة أو دجاج.'],
        [['فلافل', 'عمبه', 'عنبه'], 'فلافل', 'ok', 'بيها بقوليات بس مقلية، لا تكثر.'],
        [['شاي', 'جاي', 'استكان'], 'شاي', 'ok', 'ينبهك شوية، بس كثرته تقلل امتصاص الحديد وتأثر على نومك.'],
        [['قهوه', 'نسكافيه', 'كوفي'], 'قهوة', 'ok', 'كوب وحد ينفع، بعد العصر يخرب نومك والنوم هو اللي يثبت الحفظ.'],
        [['شوكولاته داكنه', 'كاكاو'], 'شوكولاتة داكنة', 'ok', 'قطعة صغيرة تنفع المزاج، الكثير منها سكر.'],
        [['عصير طبيعي', 'عصير برتقال'], 'عصير طبيعي', 'ok', 'فيتامينات، بس الفاكهة نفسها أحسن لأن بيها ألياف.'],
        [['شاورمه', 'شاورما'], 'شاورما', 'bad', 'دهن وصلصات كثيرة، تثقلك وتنعسك.'],
        [['برجر', 'بركر', 'همبركر', 'سندويش', 'سندويج', 'لفه'], 'أكل سريع', 'bad', 'دهون وملح، تشبع شوية وبعدها تعب ونعاس.'],
        [['بيتزا'], 'بيتزا', 'bad', 'دسمة ومالحة، خليها مرة بالأسبوع بالكثير.'],
        [['بطاطا مقليه', 'بطاطه مقليه', 'جبس', 'شيبس', 'جيبس', 'جيتوس', 'شبس'], 'مقليات ومعلبات', 'bad', 'زيت وملح، تثقل الدماغ وما تشبع.'],
        [['سمبوسه', 'سنبوسه', 'مقلي', 'مقليه'], 'مقليات', 'bad', 'زيت كثير، يخليك كسلان.'],
        [['اندومي', 'نودلز', 'اندمي'], 'إندومي', 'bad', 'ملح ودهن وما بيها فايدة، لا تخليها وجبة.'],
        [['بيبسي', 'كولا', 'غازي', 'غازيه', 'سفن', 'ميرندا', 'مشروب غازي'], 'مشروبات غازية', 'bad', 'سكر كثير، طاقة دقايق وبعدها هبوط وتعب.'],
        [['ريد بول', 'مشروب طاقه', 'باور هورس', 'تايكر', 'رد بول'], 'مشروب طاقة', 'bad', 'كافيين وسكر عالي، يخرب نومك ويتعب قلبك. لا تعتمد عليه للسهر.'],
        [['كيك', 'كيكه', 'حلويات', 'حلو', 'بقلاوه', 'زلابيه', 'كنافه', 'دونات', 'بسكت', 'بسكويت', 'شوكولاته', 'كاكاو حليب', 'جكليت', 'نستله'], 'حلويات', 'bad', 'سكر سريع يرفعك وينزلك، وتنعس بعدها. قطعة صغيرة بعد الأكل مو مشكلة.'],
        [['عصير معلب', 'عصير علب', 'رني', 'تانج'], 'عصير معلب', 'bad', 'سكر مضاف كثير، اشرب ماي أو اكل فاكهة.'],
        [['ماكو', 'ما اكلت', 'ما فطرت', 'متريق', 'ما تريقت'], 'ما أكلت', 'bad', 'الدراسة على معدة فاضية تقلل التركيز وتسبب صداع.'],
    ];
    // memory-friendly ideas, a different six every day
    const IDEAS = [
        ['بيض مسلوق ويا خبز أسمر وخيار', 'breakfast', 'بروتين وكولين للذاكرة وطاقة ثابتة'],
        ['شوفان بالحليب ويا موز وجوز', 'breakfast', 'طاقة لساعات وأوميغا 3'],
        ['لبن ويا تمرات وحفنة لوز', 'snack', 'طاقة هادئة ودهون مفيدة'],
        ['شوربة عدس ويا ليمون', 'dinner', 'حديد يقلل التعب، وخفيفة بالليل'],
        ['سمك مشوي ويا سلطة', 'lunch', 'أوميغا 3 من أقوى أكلات الذاكرة'],
        ['باقلاء بالدهن الخفيف ويا بيض', 'breakfast', 'بروتين يشبعك للظهر'],
        ['دجاج مشوي ويا تمن قليل وسلطة', 'lunch', 'بروتين خفيف ما ينعسك'],
        ['رمان أو عنب بين جلسات الدراسة', 'snack', 'مضادات أكسدة وتنعيش'],
        ['حمص ويا خبز أسمر وخضرة', 'dinner', 'بروتين نباتي وألياف'],
        ['جبن قليل ويا طماطة وزيتون', 'breakfast', 'فطور خفيف وسريع'],
        ['تونة ويا خبز أسمر وخس', 'lunch', 'أوميغا 3 وسريعة التحضير'],
        ['حليب دافي ويا عسل قبل النوم', 'dinner', 'نوم أحسن يعني حفظ أثبت'],
        ['جزر وخيار مقطع ويا لبن', 'snack', 'خفيف ويشبع بدون نعاس'],
        ['فاصوليا بيضة ويا تمن قليل', 'lunch', 'بقوليات وطاقة ثابتة'],
        ['سبانخ ويا بيض', 'dinner', 'حديد وفيتامينات للدماغ'],
        ['موز وحفنة جوز', 'snack', 'مغنيسيوم وأوميغا 3 قبل الامتحان'],
        ['كبة حلبية مشوية مو مقلية ويا لبن', 'lunch', 'نفس الطعم وأخف'],
        ['تمر ويا حليب', 'breakfast', 'فطور سريع يصحيك'],
    ];
    const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];
    const CHIPS = ['بيض', 'خبز أسمر', 'لبن', 'تمر', 'شاي', 'تمن ومرق', 'دجاج', 'سلطة', 'شوربة عدس', 'فلافل', 'شاورما', 'بيبسي', 'حلويات', 'فواكه', 'جوز'];
    const fmt12 = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' ص' : ' م'); };

    // what the built-in list says, when the tutor can't be asked
    function localRate(text) {
        let t = ' ' + norm(text) + ' ';
        const hits = [], seen = new Set();
        // longer names first, and a matched name is taken out of the text, so "شوكولاته داكنه" is
        // not also counted as "حلويات"
        const words = [];
        FOODS.forEach((f, i) => f[0].forEach((w) => words.push([norm(w), i])));
        words.sort((a, b) => b[0].length - a[0].length);
        words.forEach(([w, i]) => {
            const at = t.indexOf(w);
            if (at < 0) return;
            t = t.slice(0, at) + ' '.repeat(w.length) + t.slice(at + w.length);
            if (seen.has(i)) return;
            seen.add(i);
            hits.push([at, i]);
        });
        const found = hits.sort((a, b) => a[0] - b[0]).map(([, i]) => ({ name: FOODS[i][1], v: FOODS[i][2], why: FOODS[i][3] }));
        const pts = { good: 9, ok: 6, bad: 3 };
        const score = found.length ? Math.round(found.reduce((a, x) => a + pts[x.v], 0) / found.length) : 0;
        const bad = found.filter((x) => x.v === 'bad').length, good = found.filter((x) => x.v === 'good').length;
        const brain = !found.length ? '' : bad && !good ? 'هالوجبة تعطيك طاقة سريعة وتروح، وبعدها تحس بتعب ونعاس وتركيزك يقل.'
            : bad ? 'بيها زين وبيها شي يثقلك، قلل الثاني وراح تحس الفرق بتركيزك.'
                : good >= 2 ? 'وجبة تخدم دماغك: طاقة ثابتة وتركيز أحسن بالساعات الجاية.' : 'وجبة معقولة، زيد عليها خضرة أو بروتين حتى تكمل.';
        const tip = bad ? 'بدل ' + found.find((x) => x.v === 'bad').name + ' جرب شي من الاقتراحات تحت.' : 'اشرب كوب ماي ويا الأكل.';
        return { items: found, score, brain, tip, next: [], local: true };
    }

    Object.assign(app, {
        fdOpen() {
            this._fd = this._fd || { sheet: null };
            const meal = this._fdMeal;
            this._fdMeal = null;
            this._fdRender();
            if (meal) this.fdLog(meal);
        },
        fdClose() { this._fdCloseSheet(); },

        _fdRender() {
            const box = document.getElementById('fdContent');
            if (!box) return;
            const o = this._nutGet(), s = o.set, today = this._nutToday(), day = o.days[today] || { m: [], w: [] };
            const cups = day.w.length, pct = Math.min(1, cups / s.goal);
            const liters = (cups * s.cup / 1000).toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
            const nextW = this._fdNextWater(o, day);
            const scored = day.m.filter((x) => x.r && x.r.score);
            const avg = scored.length ? Math.round(scored.reduce((a, x) => a + x.r.score, 0) / scored.length) : 0;
            const seed = Number(today.replace(/-/g, '')) % IDEAS.length;
            const ideas = Array.from({ length: 6 }, (_, i) => IDEAS[(seed + i * 5) % IDEAS.length]);
            box.innerHTML = `<div class="fd-wrap">
                <div class="fd-water">
                    <div class="fd-glass" style="--p:${pct.toFixed(3)}">
                        <div class="fd-fill"><svg viewBox="0 0 120 20" preserveAspectRatio="none"><path d="M0 10 Q15 0 30 10 T60 10 T90 10 T120 10 V20 H0Z"/></svg><svg viewBox="0 0 120 20" preserveAspectRatio="none" class="b"><path d="M0 10 Q15 20 30 10 T60 10 T90 10 T120 10 V20 H0Z"/></svg></div>
                        <b>${cups}<small>/${s.goal}</small></b>
                    </div>
                    <div class="fd-wtx">
                        <h3>ماي اليوم</h3>
                        <p>${cups >= s.goal ? 'كمّلت هدفك اليوم، عاشت إيدك.' : 'باقيلك ' + (s.goal - cups) + ' ' + (s.goal - cups === 1 ? 'كوب' : 'أكواب') + ' (' + liters + ' لتر لحد هسه)'}</p>
                        <div class="fd-cups">${Array.from({ length: s.goal }, (_, i) => `<i class="${i < cups ? 'on' : ''}"></i>`).join('')}</div>
                        <div class="fd-wbtn">
                            <button class="fd-add" onclick="app.fdDrink(1)"><i data-lucide="plus"></i>شربت كوب</button>
                            ${cups ? `<button class="fd-undo" onclick="app.fdDrink(-1)" aria-label="رجّع كوب"><i data-lucide="undo-2"></i></button>` : ''}
                        </div>
                        <small class="fd-next"><i data-lucide="${s.waterOn ? 'bell' : 'bell-off'}"></i>${s.waterOn ? (nextW ? 'التذكير الجاي ' + nextW : 'التذكير يرجع باچر من ' + fmt12(s.from)) : 'تذكير الماي طافي'}</small>
                    </div>
                </div>

                <div class="fd-h"><b>وجباتي اليوم</b>${avg ? `<span class="fd-score s${avg >= 7 ? 'g' : avg >= 5 ? 'o' : 'b'}">معدل أكلك ${avg}/10</span>` : ''}</div>
                <div class="fd-meals">${MEAL_ORDER.map((k) => this._fdMealCard(k, day, s)).join('')}</div>

                <div class="fd-h"><b>أكلات تقوي الذاكرة</b><button class="fd-link" onclick="app.fdIdeas()"><i data-lucide="sparkles"></i>اقترحلي</button></div>
                <div class="fd-ideas">${ideas.map(([t, m, why]) => `<div class="fd-idea"><span><i data-lucide="${this.NUT_MEALS[m][2]}"></i>${esc(this.NUT_MEALS[m][0])}</span><b>${esc(t)}</b><small>${esc(why)}</small></div>`).join('')}</div>

                <div class="fd-h"><b>آخر 7 أيام</b></div>
                ${this._fdWeek(o)}
            </div>`;
            lucide.createIcons();
        },

        _fdMealCard(k, day, s) {
            const M = this.NUT_MEALS[k];
            const list = day.m.filter((x) => x.meal === k);
            const time = k === 'snack' ? 'بين الوجبات' : fmt12(s.meals[k]);
            return `<div class="fd-meal${list.length ? ' done' : ''}">
                <div class="fd-mh"><span class="fd-mi"><i data-lucide="${M[2]}"></i></span><div><b>${M[0]}</b><small>${time}</small></div>
                <button onclick="app.fdLog('${k}')"><i data-lucide="${list.length ? 'plus' : 'pencil'}"></i>${list.length ? 'زيد' : 'سجّل'}</button></div>
                ${list.map((x) => `<div class="fd-entry">
                    <p>${esc(x.text)}</p>
                    ${x.r && x.r.items && x.r.items.length ? `<div class="fd-chips">${x.r.items.map((i) => `<span style="--c:${V[i.v][1]}">${esc(i.name)}</span>`).join('')}</div>` : ''}
                    ${x.r && x.r.brain ? `<small>${esc(x.r.brain)}</small>` : ''}
                    <div class="fd-ea">${x.r && x.r.score ? `<span class="fd-score s${x.r.score >= 7 ? 'g' : x.r.score >= 5 ? 'o' : 'b'}">${x.r.score}/10</span>` : ''}<button onclick="app.fdShow('${esc(x.id)}')">التفاصيل</button><button onclick="app.fdDel('${esc(x.id)}')" aria-label="حذف"><i data-lucide="trash-2"></i></button></div>
                </div>`).join('')}
            </div>`;
        },

        _fdWeek(o) {
            const days = [];
            for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
            const names = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
            return `<div class="fd-week">${days.map((d) => {
                const k = this.localDateStr(d), x = o.days[k] || { m: [], w: [] };
                const sc = x.m.filter((m) => m.r && m.r.score);
                const avg = sc.length ? Math.round(sc.reduce((a, m) => a + m.r.score, 0) / sc.length) : 0;
                const h = Math.min(1, x.w.length / o.set.goal);
                return `<div class="fd-wd"><div class="fd-bar"><i style="height:${Math.max(4, h * 100)}%" class="${h >= 1 ? 'full' : ''}"></i></div><span class="fd-dot ${avg ? (avg >= 7 ? 'g' : avg >= 5 ? 'o' : 'b') : ''}"></span><small>${names[d.getDay()]}</small></div>`;
            }).join('')}</div><p class="fd-legend"><span><i class="w"></i>أكواب الماي</span><span><i class="g"></i>أكل زين</span><span><i class="o"></i>عادي</span><span><i class="b"></i>يحتاج تعديل</span></p>`;
        },

        _fdNextWater(o, day) {
            const s = o.set, now = new Date(), min = now.getHours() * 60 + now.getMinutes();
            const from = this._nutMin(s.from), to = this._nutMin(s.to);
            if (!s.waterOn || day.w.length >= s.goal) return '';
            const start = new Date(now); start.setHours(Math.floor(from / 60), from % 60, 0, 0);
            const last = Math.max(day.w.length ? day.w[day.w.length - 1] : 0, o.sent[this._nutToday() + ':w'] || 0, start.getTime());
            const at = new Date(Math.max(last + s.every * 60000, Date.now() + 60000));
            const atMin = at.getHours() * 60 + at.getMinutes();
            if (at.getDate() !== now.getDate() || atMin > to || min > to) return '';
            return fmt12(String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0'));
        },

        fdDrink(n) {
            const before = (this._nutGet().days[this._nutToday()] || { w: [] }).w.length;
            this.nutDrink(n);
            if (n > 0) {
                const g = document.querySelector('.fd-glass');
                if (g) { g.classList.remove('pour'); void g.offsetWidth; g.classList.add('pour'); }
                if (before === 0) this.showToast('بداية حلوة، كمّل');
            }
        },

        // ---------- logging a meal ----------
        fdLog(meal) {
            this._fd.sheet = { kind: 'log', meal, text: '', busy: false, res: null };
            this._fdSheet();
        },
        fdChip(t) {
            const ta = document.getElementById('fdText');
            if (!ta) return;
            ta.value = (ta.value.trim() ? ta.value.trim() + '، ' : '') + t;
            ta.focus();
        },
        async fdRate() {
            const sh = this._fd.sheet;
            const ta = document.getElementById('fdText');
            const text = ta ? ta.value.trim() : '';
            if (!sh || sh.busy) return;
            if (text.length < 2) { this.showToast('اكتب شنو أكلت'); return; }
            sh.text = text.slice(0, 400);
            sh.busy = true;
            this._fdSheet();
            let r = await this._fdAsk({ mode: 'food', text: sh.text, meal: sh.meal });
            if (!r || !r.items || !r.items.length) {
                const loc = localRate(sh.text);
                r = r && r.items ? Object.assign(loc, { brain: r.brain || loc.brain, tip: r.tip || loc.tip, next: r.next || [] }) : loc;
            }
            if (!r.next || !r.next.length) {
                const pool = IDEAS.filter((x) => x[1] === sh.meal || sh.meal === 'snack');
                r.next = (pool.length ? pool : IDEAS).slice().sort(() => Math.random() - 0.5).slice(0, 3).map((x) => x[0]);
            }
            const o = this._nutGet(), day = this._nutDayOf(o, this._nutToday());
            const entry = { id: Date.now().toString(36), meal: sh.meal, text: sh.text, at: Date.now(), r };
            day.m.push(entry);
            this._nutSave(o);
            sh.busy = false;
            sh.res = entry;
            this._fdSheet();
            this._fdRender();
        },
        fdShow(id) {
            const o = this._nutGet(), day = o.days[this._nutToday()] || { m: [] };
            const e = day.m.find((x) => x.id === id);
            if (!e) return;
            this._fd.sheet = { kind: 'log', meal: e.meal, res: e, view: true };
            this._fdSheet();
        },
        fdDel(id) {
            const o = this._nutGet(), day = o.days[this._nutToday()];
            if (!day) return;
            day.m = day.m.filter((x) => x.id !== id);
            this._nutSave(o);
            this._fdRender();
        },

        // the tutor's server; null when it is off, busy or there is no internet
        async _fdAsk(body) {
            const url = (this.siteConfig || {}).tutorUrl;
            if (!/^https:\/\/[^\s]+$/.test(String(url || '')) || !window.firebaseAuth || !window.firebaseAuth.currentUser || navigator.onLine === false) return null;
            try {
                const token = await window.firebaseAuth.currentUser.getIdToken();
                const ctl = new AbortController();
                const t = setTimeout(() => ctl.abort(), 25000);
                const res = await fetch(url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
                clearTimeout(t);
                return res.ok ? await res.json() : null;
            } catch (e) { return null; }
        },

        async fdIdeas() {
            const h = new Date().getHours();
            const meal = h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'snack' : 'dinner';
            this._fd.sheet = { kind: 'ideas', meal, busy: true };
            this._fdSheet();
            const r = await this._fdAsk({ mode: 'food', ideas: true, meal });
            const sh = this._fd.sheet;
            if (!sh || sh.kind !== 'ideas') return;
            sh.busy = false;
            sh.list = r && r.items && r.items.length ? r.items.map((x) => [x.name, x.why])
                : IDEAS.filter((x) => x[1] === meal).concat(IDEAS.filter((x) => x[1] !== meal)).slice(0, 5).map((x) => [x[0], x[2]]);
            sh.tip = (r && r.tip) || 'نوّع: بروتين ويا خضرة ويا حبوب كاملة، وكوب ماي ويا كل وجبة.';
            this._fdSheet();
        },

        // ---------- settings ----------
        fdSettings() {
            this._fd = this._fd || {};
            this._fd.sheet = { kind: 'set' };
            this._fdSheet();
        },
        fdSet(field, value) {
            const o = this._nutGet();
            if (field.indexOf('meal.') === 0) o.set.meals[field.slice(5)] = value;
            else if (['goal', 'cup', 'every'].includes(field)) o.set[field] = Number(value);
            else if (field === 'from' || field === 'to') o.set[field] = value;
            else o.set[field] = !!value;
            // a new time or setting may bring a reminder today again
            Object.keys(o.sent).forEach((k) => { if (k.indexOf(this._nutToday()) === 0 && field.indexOf('meal') === 0) delete o.sent[k]; });
            this._nutSave(o);
            this._fdRender();
            if (field === 'mealOn' || field === 'waterOn') this._fdSheet();
        },
        async fdAllowNotes() {
            let p = 'denied';
            if (this._os) { await this._os.Notifications.requestPermission().catch(() => {}); p = this._pushPerm(); }
            else if ('Notification' in window) p = await Notification.requestPermission().catch(() => 'denied');
            else { this.showToast('متصفحك ما يدعم الإشعارات'); return; }
            this.showToast(p === 'granted' ? 'تمام، راح توصلك التنبيهات حتى والتطبيق بالخلفية' : 'ما انسمحت الإشعارات، فعّلها من إعدادات المتصفح');
            this._fdSheet();
        },

        // ---------- the sheet ----------
        _fdSheet() {
            const sh = this._fd && this._fd.sheet;
            let el = document.getElementById('fdSheet');
            if (!sh) { this._fdCloseSheet(); return; }
            if (!el) {
                el = document.createElement('div');
                el.id = 'fdSheet';
                el.className = 'fd-sheet';
                el.innerHTML = '<div class="fd-back" onclick="app._fdCloseSheet()"></div><div class="fd-card"></div>';
                document.body.appendChild(el);
                requestAnimationFrame(() => el.classList.add('on'));
            }
            const card = el.querySelector('.fd-card');
            const M = this.NUT_MEALS[sh.meal] || [];
            if (sh.kind === 'log' && sh.res) {
                const r = sh.res.r || {};
                card.innerHTML = `<div class="fd-grab"></div>
                    <div class="fd-sh"><span class="fd-mi"><i data-lucide="${M[2]}"></i></span><div><b>${esc(M[0])}</b><small>${esc(sh.res.text)}</small></div>${r.score ? `<span class="fd-big s${r.score >= 7 ? 'g' : r.score >= 5 ? 'o' : 'b'}">${r.score}<small>/10</small></span>` : ''}</div>
                    ${r.items && r.items.length ? `<div class="fd-items">${r.items.map((i) => `<div class="fd-item" style="--c:${V[i.v][1]}"><span><i data-lucide="${V[i.v][2]}"></i></span><div><b>${esc(i.name)} <em>${V[i.v][0]}</em></b><small>${esc(i.why)}</small></div></div>`).join('')}</div>`
                        : '<p class="fd-none">ما عرفت هالأكلات، جرب تكتبها بأسماء أوضح (مثلاً: بيض، تمن ومرق، شاورما).</p>'}
                    ${r.brain ? `<div class="fd-note"><i data-lucide="brain"></i><p>${esc(r.brain)}</p></div>` : ''}
                    ${r.tip ? `<div class="fd-note tip"><i data-lucide="lightbulb"></i><p>${esc(r.tip)}</p></div>` : ''}
                    ${r.next && r.next.length ? `<div class="fd-nexts"><b>جرب بالوجبة الجاية</b>${r.next.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
                    ${r.local ? '<p class="fd-small">تقييم سريع من التطبيق (المعلم ما كان متاح).</p>' : ''}
                    <button class="fd-main" onclick="app._fdCloseSheet()">تمام</button>`;
            } else if (sh.kind === 'log') {
                card.innerHTML = `<div class="fd-grab"></div>
                    <div class="fd-sh"><span class="fd-mi"><i data-lucide="${M[2]}"></i></span><div><b>شنو أكلت بال${esc(String(M[0]).replace(/^ال/, ''))}؟</b><small>اكتب كل شي، وأكلك شنو يفيد مخك وشنو يضره</small></div></div>
                    <textarea id="fdText" rows="3" maxlength="400" placeholder="مثلاً: بيضتين وخبز وشاي" ${sh.busy ? 'disabled' : ''}>${esc(sh.text || '')}</textarea>
                    <div class="fd-quick">${CHIPS.map((c) => `<button type="button" onclick="app.fdChip('${esc(c)}')" ${sh.busy ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>
                    <button class="fd-main" onclick="app.fdRate()" ${sh.busy ? 'disabled' : ''}>${sh.busy ? '<span class="tt-typing"><i></i><i></i><i></i></span> المعلم يقيّم أكلك' : '<i data-lucide="sparkles"></i> قيّم أكلي'}</button>`;
                if (!sh.busy) setTimeout(() => { const t = document.getElementById('fdText'); if (t && !t.value) t.focus(); }, 350);
            } else if (sh.kind === 'ideas') {
                card.innerHTML = `<div class="fd-grab"></div>
                    <div class="fd-sh"><span class="fd-mi"><i data-lucide="sparkles"></i></span><div><b>اقتراحات لل${esc(String(M[0]).replace(/^ال/, ''))}</b><small>أكلات بسيطة تقوي الذاكرة والتركيز</small></div></div>
                    ${sh.busy ? '<div class="fd-wait"><span class="tt-typing"><i></i><i></i><i></i></span><p>المعلم يختارلك...</p></div>'
                        : `<div class="fd-items">${sh.list.map(([n, why]) => `<div class="fd-item" style="--c:#16A34A"><span><i data-lucide="leaf"></i></span><div><b>${esc(n)}</b><small>${esc(why)}</small></div></div>`).join('')}</div>
                        <div class="fd-note tip"><i data-lucide="lightbulb"></i><p>${esc(sh.tip)}</p></div>`}
                    <button class="fd-main" onclick="app._fdCloseSheet()">تمام</button>`;
            } else if (sh.kind === 'set') {
                const s = this._nutGet().set;
                const perm = this._pushPerm();
                const sel = (f, list, cur, lbl) => `<select onchange="app.fdSet('${f}', this.value)">${list.map((v) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${lbl(v)}</option>`).join('')}</select>`;
                card.innerHTML = `<div class="fd-grab"></div>
                    <div class="fd-sh"><span class="fd-mi"><i data-lucide="bell-ring"></i></span><div><b>التنبيهات</b><small>تكدر تطفيها أو تغير أوقاتها</small></div></div>
                    <label class="fd-sw"><span><b>تنبيه الوجبات</b><small>قبل كل وجبة بربع ساعة</small></span><input type="checkbox" ${s.mealOn ? 'checked' : ''} onchange="app.fdSet('mealOn', this.checked)"><i></i></label>
                    ${s.mealOn ? `<div class="fd-times">${['breakfast', 'lunch', 'dinner'].map((k) => `<label><span>${this.NUT_MEALS[k][0]}</span><input type="time" value="${s.meals[k]}" onchange="app.fdSet('meal.${k}', this.value)"></label>`).join('')}</div>` : ''}
                    <label class="fd-sw"><span><b>تذكير الماي</b><small>يذكرك تشرب لحد ما تكمل هدفك</small></span><input type="checkbox" ${s.waterOn ? 'checked' : ''} onchange="app.fdSet('waterOn', this.checked)"><i></i></label>
                    ${s.waterOn ? `<div class="fd-times">
                        <label><span>كل شكد</span>${sel('every', [45, 60, 90, 120, 180], s.every, (v) => v < 60 ? v + ' دقيقة' : v === 60 ? 'ساعة' : v === 90 ? 'ساعة ونص' : v / 60 + ' ساعات')}</label>
                        <label><span>من</span><input type="time" value="${s.from}" onchange="app.fdSet('from', this.value)"></label>
                        <label><span>إلى</span><input type="time" value="${s.to}" onchange="app.fdSet('to', this.value)"></label>
                    </div>` : ''}
                    <div class="fd-times">
                        <label><span>هدف الماي</span>${sel('goal', [6, 7, 8, 9, 10, 12], s.goal, (v) => v + ' أكواب')}</label>
                        <label><span>حجم الكوب</span>${sel('cup', [200, 250, 300, 500], s.cup, (v) => v + ' مل')}</label>
                    </div>
                    ${perm !== 'granted' ? `<button class="fd-perm" onclick="app.fdAllowNotes()"><i data-lucide="bell-plus"></i>خلي التنبيهات توصلني حتى والتطبيق بالخلفية</button>` : '<p class="fd-small">الإشعارات مفعّلة.</p>'}
                    <p class="fd-small">التنبيهات توصل والتطبيق مفتوح أو بالخلفية. إذا سديته تماماً من قائمة التطبيقات ما توصل.</p>
                    <button class="fd-main" onclick="app._fdCloseSheet()">تمام</button>`;
            }
            lucide.createIcons();
        },
        _fdCloseSheet() {
            if (this._fd) this._fd.sheet = null;
            const el = document.getElementById('fdSheet');
            if (!el) return;
            el.classList.remove('on');
            setTimeout(() => el.remove(), 280);
        },
    });
})();
