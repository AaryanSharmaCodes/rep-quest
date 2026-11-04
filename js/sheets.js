'use strict';
/* Bottom sheets. Each returns its inner HTML; app.js handles what the buttons do. */
const sheetHead = (title, sub = '') => `<div class="sh-head">${ui.sheetStack.length ? `<button class="ic-btn" data-a="closeSheet" aria-label="Back">${i('back')}</button>` : ''}<div class="sh-title"><h2>${esc(title)}</h2>${sub ? `<p class="dim sm">${esc(sub)}</p>` : ''}</div><button class="ic-btn" data-a="closeAll" aria-label="Close">${i('close')}</button></div>`;
const field = (label, id, value, attrs = '') => `<label>${esc(label)}<input id="${id}" value="${esc(value ?? '')}" ${attrs}></label>`;
const slotName = s => (SLOTS.find(x => x[0] === s) || [s, s])[1];

const SHEETS = {
  weight(s) {
    const date = s.date || today();
    const cur = peekDay(date).weight;
    const start = cur ?? latestWeight() ?? '';
    const yest = addDays(today(), -1);
    return `${sheetHead('Log weight', 'Morning, after the bathroom, before food')}
      <div class="seg">${[[today(), 'Today'], [yest, 'Yesterday']].map(([k, l]) => `<button class="${k === date ? 'on' : ''}" data-a="weightDate" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="big-input"><button class="step" data-a="bump" data-t="w-val" data-by="-0.1" aria-label="Down 0.1">−</button>
        <input id="w-val" inputmode="decimal" value="${esc(start)}" aria-label="Weight in kg"><button class="step" data-a="bump" data-t="w-val" data-by="0.1" aria-label="Up 0.1">+</button></div>
      <p class="center dim">kg</p>
      <button class="btn solid wide" data-a="saveWeight" data-k="${date}">Save weight</button>
      ${cur != null ? `<button class="link danger block-link" data-a="clearWeight" data-k="${date}">Remove this weigh-in</button>` : ''}`;
  },
  log(s) {
    const date = s.date || today(), d = peekDay(date), t = state.targets;
    return `${sheetHead(`Log for ${niceDate(date)}`)}
      <div class="datebar slim"><button class="ic-btn" data-a="logDay" data-n="-1" aria-label="Previous day">${i('back')}</button><b>${niceDate(date)}</b>${date < today() ? `<button class="ic-btn" data-a="logDay" data-n="1" aria-label="Next day">${i('next')}</button>` : '<span class="ic-btn"></span>'}</div>
      <div class="form">
        ${field(`Steps, goal ${fmt(t.steps)}`, 'l-steps', d.steps, 'inputmode="numeric"')}
        <div class="two">${field(`Sleep, h`, 'l-sleep', d.sleep, 'inputmode="decimal"')}${field('Water, L', 'l-water', d.water, 'inputmode="decimal"')}</div>
        ${field('Cardio, minutes', 'l-cardio', d.cardio, 'inputmode="numeric"')}
        ${state.settings.showWaist ? field('Waist, cm', 'l-waist', d.waist, 'inputmode="decimal"') : ''}
        <label>Note<textarea id="l-note" rows="2">${esc(d.note || '')}</textarea></label>
        <button class="btn solid wide" data-a="saveLog" data-k="${date}">Save</button>
      </div>`;
  },

  /* ---------- Food ---------- */
  food(s) {
    const tab = s.tab || 'all';
    return `<div class="sh-head"><div class="sh-title"><h2>${esc(slotName(s.slot))}</h2><p class="dim sm" id="food-added">${s.added ? `${s.added} added` : niceDate(s.date || today())}</p></div><button class="btn solid small" data-a="closeAll">Done</button></div>
      <div class="searchbar">${i('search')}<input id="food-q" type="search" placeholder="Roti, Big Mac, Amul..." value="${esc(s.q || '')}" autocomplete="off" autocorrect="off" data-f="foodSearch" enterkeyhint="search"></div>
      <div class="seg">${[['all', 'Search'], ['recent', 'Recent'], ['meals', 'Meals'], ['mine', 'My foods']].map(([id, l]) => `<button class="${tab === id ? 'on' : ''}" data-a="foodTab" data-v="${id}">${l}</button>`).join('')}</div>
      <div class="food-tools"><button class="pill" data-a="openSheet" data-type="macros">Type macros</button><button class="pill" data-a="scanBarcode">${i('scan')} Scan barcode</button></div>
      <input type="file" id="scan-file" accept="image/*" capture="environment" hidden><div id="scan-host"></div>
      <div id="food-results">${foodResults(s)}</div>`;
  },
  amount(s) {
    const f = ui.foodIndex[s.foodId];
    if (!f) return `${sheetHead('Food not found')}`;
    const parent = ui.sheetStack[ui.sheetStack.length - 1];
    const slot = s.slot || parent?.slot || slotNow();
    const unit = s.unit ?? (f.servings[0] ? 0 : -1); // index of a serving, or -1 for grams
    const qty = s.qty ?? (unit === -1 ? 100 : 1);
    const grams = unit === -1 ? qty : qty * f.servings[unit].g;
    const m = macrosFor(f, grams);
    const chips = [...f.servings.map((x, n) => `<button class="pill${unit === n ? ' solid' : ''}" data-a="foodUnit" data-v="${n}">${esc(x.label)}</button>`), `<button class="pill${unit === -1 ? ' solid' : ''}" data-a="foodUnit" data-v="-1">Grams</button>`].join('');
    return `${sheetHead(f.name, [f.brand, SOURCE_NAMES[f.src]].filter(Boolean).join(', '))}
      <div class="pills scrollx">${chips}</div>
      <div class="big-input small"><button class="step" data-a="foodQty" data-by="${unit === -1 ? -10 : -0.5}" aria-label="Less">−</button><input id="food-qty" inputmode="decimal" value="${round(qty, 2)}" data-f="foodQty" aria-label="Amount"><button class="step" data-a="foodQty" data-by="${unit === -1 ? 10 : 0.5}" aria-label="More">+</button></div>
      <p class="center dim sm" id="food-grams">${unit === -1 ? 'grams' : `${round(grams, 1)} g in total`}</p>
      <dl class="macros" id="food-macros">${macroCells(m)}</dl>
      <label class="plain">Meal<select id="food-slot">${SLOTS.map(([k, l]) => `<option value="${k}" ${k === slot ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="btn solid wide" data-a="addFood">Add food</button>
      ${f.src === 'm' ? `<button class="link danger block-link" data-a="deleteCustomFood" data-id="${esc(f.id)}">Delete from my foods</button>` : ''}`;
  },
  macros() {
    return `${sheetHead('Type macros', 'For a label, a restaurant, or a quick guess')}
      <div class="form">${field('Name', 'c-name', '', 'placeholder="Mess lunch"')}
      <div class="two">${field('Calories', 'c-kcal', '', 'inputmode="decimal"')}${field('Protein, g', 'c-p', '', 'inputmode="decimal"')}</div>
      <div class="two">${field('Carbs, g', 'c-c', '', 'inputmode="decimal"')}${field('Fat, g', 'c-f', '', 'inputmode="decimal"')}</div>
      <label class="row-check"><input type="checkbox" class="sw" id="c-save" checked><span>Save to my foods</span></label>
      <button class="btn solid wide" data-a="saveMacros">Add food</button></div>`;
  },
  entry(s) {
    const list = peekDay(ui.foodDate).meals?.[s.slot] || [];
    const e = list.find(x => x.id === s.id);
    if (!e) return sheetHead('Removed');
    return `${sheetHead(e.name, e.amount || e.label || '')}
      <div class="pills">${[0.5, 0.75, 1.5, 2].map(n => `<button class="pill" data-a="scaleEntry" data-by="${n}">× ${n}</button>`).join('')}</div>
      <div class="form"><div class="two">${field('Calories', 'e-kcal', round(e.kcal), 'inputmode="decimal"')}${field('Protein, g', 'e-p', round(e.p, 1), 'inputmode="decimal"')}</div>
      <div class="two">${field('Carbs, g', 'e-c', round(e.c, 1), 'inputmode="decimal"')}${field('Fat, g', 'e-f', round(e.f, 1), 'inputmode="decimal"')}</div>
      <button class="btn solid wide" data-a="saveEntry">Save</button></div>
      <button class="link danger block-link" data-a="deleteEntry">Remove from ${esc(slotName(s.slot))}</button>`;
  },
  saveMeal(s) {
    const items = peekDay(ui.foodDate).meals?.[s.slot] || [];
    return `${sheetHead('Save as a meal', `${items.length} foods, ${fmt(sum(items.map(e => e.kcal)))} kcal`)}
      <div class="form">${field('Name', 'meal-name', '', 'placeholder="Usual breakfast"')}<button class="btn solid wide" data-a="saveMeal">Save meal</button></div>`;
  },
  usda() {
    return `${sheetHead('USDA search key', 'Optional. Lifts the online limit of about 10 searches an hour')}
      <p class="sm dim">Get a free key from api.data.gov. The bundled database doesn't need one.</p>
      <div class="form">${field('Key', 'usda-key', state.settings.usdaKey, 'autocomplete="off" autocapitalize="off"')}<button class="btn solid wide" data-a="saveUsda">Save</button></div>`;
  },

  /* ---------- Training ---------- */
  summary(s) {
    const w = state.workouts.find(x => x.id === s.id);
    if (!w) return '';
    const sets = sum(w.exercises.map(e => e.sets.filter(isWorking).length));
    const vol = sum(w.exercises.flatMap(e => e.sets.filter(isWorking).map(x => (x.w || 0) * (x.r || 0))));
    const mins = Math.round((w.finishedAt - w.startedAt) / 60000);
    return `${sheetHead('Workout done')}
      <p class="done-num"><b>${fmt(vol)}</b> kg lifted</p>
      <dl class="tally"><div><dd>${sets}</dd><dt>Sets</dt></div><div><dd>${mins}</dd><dt>Minutes</dt></div><div><dd>${(w.prs || []).length}</dd><dt>New bests</dt></div></dl>
      ${(w.prs || []).length ? `<ul class="prs">${w.prs.map(p => `<li><i class="chip" style="background:var(--yellow)"></i><span>${esc(p.name)}</span><b>${esc(setText(p, p.unit))}</b></li>`).join('')}</ul>` : '<p class="dim">No new bests today, and that still counts. Next session\'s targets are ready.</p>'}
      <button class="btn line wide" data-a="logWalk">Log a 20-minute incline walk</button>
      <button class="btn solid wide" data-a="closeAll">Done</button>`;
  },
  workout(s) {
    const w = state.workouts.find(x => x.id === s.id);
    if (!w) return sheetHead('Removed');
    return `${sheetHead(w.name, niceDate(w.date))}
      ${w.exercises.map((e, ei) => `<div class="hist-ex"><h3>${esc(e.name)}</h3>
        <table class="sets compact"><tbody>${e.sets.map((x, si) => `<tr><td class="dim">${x.type === 'warmup' ? 'W' : si + 1}</td><td><input inputmode="decimal" value="${x.w ?? 0}" data-f="histSet" data-e="${ei}" data-j="${si}" data-k="w" aria-label="Weight"></td><td class="dim">kg</td><td><input inputmode="numeric" value="${x.r ?? 0}" data-f="histSet" data-e="${ei}" data-j="${si}" data-k="r" aria-label="Reps"></td><td class="dim">${e.unit === 'sec' ? 's' : 'reps'}</td></tr>`).join('')}</tbody></table></div>`).join('')}
      <button class="link danger block-link" data-a="deleteWorkout">Delete this workout</button>`;
  },
  exercise(s) {
    const e = sheetRow(s);
    if (!e) return sheetHead('Removed');
    const mode = OVERLOAD_MODES[e.mode || 'double'];
    const inWorkout = s.i != null;
    return `${sheetHead(e.name, MUSCLE_NAMES[e.p] || '')}
      <h3 class="sh-sub">How it progresses</h3>
      <div class="choice">${Object.entries(OVERLOAD_MODES).map(([k, m]) => `<button class="${(e.mode || 'double') === k ? 'on' : ''}" data-a="rowSet" data-k="mode" data-v="${k}">${esc(m.label)}</button>`).join('')}</div>
      <p class="sm dim">${esc(mode.says)} ${refLinks(mode.refs)}</p>
      <div class="form">
        <div class="three">${inWorkout ? '' : rowField('Sets', 'sets', e.sets)}${rowField(`Low ${unitWord(e)}`, 'lo', e.lo)}${rowField(`High ${unitWord(e)}`, 'hi', e.hi)}</div>
        <div class="three">${rowField('Weight jump, kg', 'inc', e.inc, 'decimal')}${rowField('Rest, sec', 'rest', e.rest)}${e.mode === 'rir' ? rowField('Target RIR', 'rirGoal', e.rirGoal ?? 2) : ''}</div>
        <label>Note<input data-f="row" data-k="note" value="${esc(e.note || '')}" placeholder="Seat 4, slow on the way down"></label>
        <label class="row-check"><input type="checkbox" class="sw" data-f="rowBool" data-k="superset" ${e.superset ? 'checked' : ''}><span>Superset with the next exercise</span></label>
        ${inWorkout ? `<label class="row-check"><input type="checkbox" class="sw" id="mirror-plan" data-f="mirror" ${ui.mirrorPlan !== false ? 'checked' : ''}><span>Save these to my plan too</span></label>` : ''}
      </div>
      ${inWorkout ? `<ul class="rows">
        <li><button class="row" data-a="addWarmups"><span>Add warm-up sets</span><span class="dim">50%, then 75%</span></button></li>
        <li><button class="row" data-a="openSheet" data-type="swap" data-i="${s.i}"><span>Swap for an alternate</span></button></li>
        <li><button class="row" data-a="moveEx" data-by="-1"><span>Move up</span></button></li>
        <li><button class="row" data-a="moveEx" data-by="1"><span>Move down</span></button></li>
      </ul>` : ''}
      <button class="link danger block-link" data-a="removeEx">${inWorkout ? 'Remove from this workout' : 'Remove from this day'}</button>`;
  },
  swap(s) {
    const e = s.i != null ? state.active.exercises[s.i] : sheetRow(s);
    if (!e) return sheetHead('Removed');
    const pref = (state.altPrefs[e.name] || []).map(libOrCustom).filter(Boolean);
    const alts = alternatesFor(e.name, e.p);
    const list = [...pref, ...alts.filter(a => !pref.some(p => p.name === a.name))];
    return `${sheetHead(`Swap ${e.name}`, 'Machine busy, or something hurts? Pick another')}
      ${s.i != null ? `<div class="seg">${[['today', 'Just today'], ['plan', 'Change my plan']].map(([v, l]) => `<button class="${ui.swapScope === v ? 'on' : ''}" data-a="swapScope" data-v="${v}">${l}</button>`).join('')}</div>` : ''}
      <div class="searchbar">${i('search')}<input id="ex-q" type="search" placeholder="Search 800+ exercises" data-f="exSearch" autocomplete="off"></div>
      <div id="ex-results">${exerciseList(list, 'swapTo')}</div>`;
  },
  addExercise(s) {
    return `${sheetHead('Add exercise')}
      <div class="searchbar">${i('search')}<input id="ex-q" type="search" placeholder="Search 800+ exercises" data-f="exSearch" autocomplete="off"></div>
      <div id="ex-results">${exerciseList(LIBRARY.slice(0, 40), 'addEx')}</div>
      <button class="btn line wide" data-a="openSheet" data-type="newExercise">Create my own</button>`;
  },
  newExercise() {
    return `${sheetHead('Create an exercise')}
      <div class="form">${field('Name', 'nx-name', '')}
      <label>Main muscle<select id="nx-muscle">${Object.entries(MUSCLE_NAMES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Type<select id="nx-kind"><option value="compound">Compound, longer rest</option><option value="isolation">Isolation, shorter rest</option></select></label>
      <button class="btn solid wide" data-a="createExercise">Add exercise</button></div>`;
  },
  lift(s) {
    const name = s.name;
    const lib = libEntry(name);
    const hist = exerciseHistory(state.workouts, name, 40);
    const byDate = {};
    hist.forEach(h => { byDate[h.date] = Math.max(byDate[h.date] || 0, bestScore(h.sets)); });
    const pts = Object.keys(byDate).sort().map(date => ({ date, v: byDate[date] }));
    const best = hist.flatMap(h => h.sets.filter(isWorking)).sort((a, b) => setScore(b) - setScore(a))[0];
    return `${sheetHead(name, MUSCLE_NAMES[lib?.p] || '')}
      ${lib?.cue ? `<p>${esc(lib.cue)}</p>` : ''}
      <div id="howto" data-name="${esc(name)}"></div>
      ${best ? `<p class="dim">Best set: ${esc(setText(best, lib?.unit))}</p>` : ''}
      ${pts.length ? lineChart({ id: 'liftSheet', points: pts, unit: 'kg', height: 150 }) : '<p class="empty">No sets logged yet.</p>'}
      ${hist.length ? `<h3 class="sh-sub">Recent sessions</h3><ul class="rows">${hist.slice(0, 8).map(h => `<li><div class="row"><span>${niceDate(h.date)}</span><span class="dim">${h.sets.filter(isWorking).map(x => (x.w ? `${round(x.w, 2)}×${x.r}` : x.r)).join(', ')}</span></div></li>`).join('')}</ul>` : ''}`;
  },
  programs() {
    return `${sheetHead('Programs', 'Switching keeps your history. Your edits are kept if you switch back')}
      <ul class="prog">${PROGRAMS.map(p => {
        const on = state.program.key === p.key;
        return `<li class="${on ? 'on' : ''}"><div><h3>${esc(p.name)}</h3><p class="sm dim">${esc(p.source)}</p><p class="sm">${esc(p.says)}</p></div>${on ? `<span class="dim sm">${state.program.edited ? 'In use, edited' : 'In use'}</span>` : `<button class="btn line small" data-a="switchProgram" data-key="${p.key}">Use</button>`}</li>`;
      }).join('')}
      ${state.program.key === 'mine' || state.programArchive?.mine ? `<li class="${state.program.key === 'mine' ? 'on' : ''}"><div><h3>My plan</h3><p class="sm dim">Your edited plan</p></div>${state.program.key === 'mine' ? '<span class="dim sm">In use</span>' : '<button class="btn line small" data-a="switchProgram" data-key="mine">Use</button>'}</li>` : ''}
      </ul>
      <button class="btn line wide" data-a="openSheet" data-type="schedule">Edit weekly schedule</button>`;
  },
  schedule() {
    const p = state.program;
    return `${sheetHead('Weekly schedule', 'Any workout on any day')}
      <ul class="rows">${WEEK_ORDER.map(wd => `<li><label class="row"><span>${DAY_SHORT[wd]}</span><select class="pick inline" data-f="schedule" data-d="${wd}"><option value="">Rest</option>${p.days.map(d => `<option value="${d.id}" ${p.schedule[wd] === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label></li>`).join('')}</ul>
      <h3 class="sh-sub">Workouts</h3>
      <ul class="rows">${p.days.map(d => `<li><button class="row" data-a="openSheet" data-type="dayEdit" data-id="${d.id}"><span>${esc(d.name)}</span><span class="dim">${d.exercises.length} exercises</span></button></li>`).join('')}</ul>
      <button class="btn line wide" data-a="newDay">${i('plus')} New workout</button>`;
  },
  dayEdit(s) {
    const id = s.id || state.program.schedule[ui.planDay] || state.program.schedule[new Date().getDay()] || state.program.days[0]?.id;
    const day = findDay(id);
    if (!day) return `${sheetHead('No workouts yet')}<button class="btn line wide" data-a="newDay">New workout</button>`;
    s.id = day.id;
    return `${sheetHead('Edit workout')}
      <div class="form">${`<label>Name<input data-f="dayName" value="${esc(day.name)}"></label>`}</div>
      <ol class="edit-list">${day.exercises.map((e, n) => `<li>
        <button class="edit-name" data-a="openSheet" data-type="exercise" data-day="${day.id}" data-row="${e.id}"><b>${esc(e.name)}</b><span>${e.sets} × ${e.lo} to ${e.hi}, ${esc(OVERLOAD_MODES[e.mode || 'double'].label.toLowerCase())}</span></button>
        <button class="ic-btn" data-a="openSheet" data-type="swap" data-day="${day.id}" data-row="${e.id}" aria-label="Swap">${i('swap')}</button>
        <button class="ic-btn" data-a="moveRow" data-n="${n}" data-by="-1" aria-label="Move up">${i('up')}</button>
        <button class="ic-btn" data-a="moveRow" data-n="${n}" data-by="1" aria-label="Move down">${i('down')}</button>
      </li>`).join('')}</ol>
      <button class="btn line wide" data-a="openSheet" data-type="addExercise" data-target="day" data-day="${day.id}">${i('plus')} Add exercise</button>
      <button class="link danger block-link" data-a="deleteDay">Delete this workout</button>`;
  },

  /* ---------- Settings ---------- */
  profile(s) {
    const p = state.profile, w = latestWeight();
    const intro = state.justUpgraded ? `<p>Rep Quest has a new look, a bigger food database and a smarter coach. All your data came across. Check these details so the coach can start from a sensible estimate.</p>` : '';
    const b = bmr({ ...p, sex: p.sex }, w);
    return `${sheetHead(state.justUpgraded ? 'Welcome back' : 'Your details')}${intro}
      <div class="form">
        <div class="two">${field('Height, cm', 'p-height', p.heightCm ?? (state.justUpgraded ? 183 : ''), 'inputmode="numeric"')}${field('Age', 'p-age', p.age ?? (state.justUpgraded ? 20 : ''), 'inputmode="numeric"')}</div>
        <label>Sex, for the formula<select id="p-sex"><option value="">Choose</option><option value="male" ${p.sex === 'male' ? 'selected' : ''}>Male</option><option value="female" ${p.sex === 'female' ? 'selected' : ''}>Female</option></select></label>
        <label>Typical activity<select id="p-activity">${ACTIVITY.map(a => `<option value="${a.id}" ${p.activity === a.id ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select></label>
        ${field('First name', 'p-name', p.name)}
        ${b ? `<p class="sm dim">Resting burn by the Mifflin-St Jeor formula: about ${fmt(b)} kcal a day. ${refLinks(['mifflin90'])}</p>` : ''}
        <button class="btn solid wide" data-a="saveProfile">Save</button></div>`;
  },
  targets() {
    const t = state.targets, w = latestWeight();
    const pr = w ? proteinRange(w) : null, fr = w ? fatRange(w) : null;
    return `${sheetHead('Daily targets')}
      <div class="form">
        ${field('Calories', 't-kcal', t.kcal, 'inputmode="numeric" data-f="targetCheck"')}
        <div class="three">${field('Protein, g', 't-protein', t.protein, 'inputmode="numeric" data-f="targetCheck"')}${field('Carbs, g', 't-carbs', t.carbs, 'inputmode="numeric" data-f="targetCheck"')}${field('Fat, g', 't-fat', t.fat, 'inputmode="numeric" data-f="targetCheck"')}</div>
        <p class="sm dim" id="macro-sum">${macroSumText(t.protein, t.carbs, t.fat, t.kcal)}</p>
        <button class="link" type="button" data-a="balanceCarbs">Set carbs to fit the calories</button>
        ${pr ? `<p class="sm dim">At ${round(w, 1)} kg, research suggests ${pr[0]} to ${pr[1]} g protein ${refLinks(['morton18', 'iraki19'])} and ${fr[0]} to ${fr[1]} g fat ${refLinks(['iraki19'])}.</p>` : ''}
        <div class="three">${field('Steps', 't-steps', t.steps, 'inputmode="numeric"')}${field('Sleep, h', 't-sleep', t.sleep, 'inputmode="decimal"')}${field('Water, L', 't-water', t.water, 'inputmode="decimal"')}</div>
        <button class="btn solid wide" data-a="saveTargets">Save targets</button></div>`;
  },
  goal(s) {
    const mode = s.mode || state.goal.mode;
    const g = mode === state.goal.mode ? state.goal : GOALS[mode];
    return `${sheetHead('Goal', 'Set by how fast weight should move, with no goal weight needed')}
      <div class="choice col">${Object.entries(GOALS).map(([k, x]) => `<button class="${mode === k ? 'on' : ''}" data-a="goalMode" data-v="${k}"><b>${esc(x.label)}</b>${k !== 'custom' ? `<span>${signed(x.lo, 2)} to ${signed(x.hi, 2)}% a week</span>` : ''}</button>`).join('')}</div>
      <p class="sm dim">${esc(GOALS[mode].says)} ${refLinks(GOALS[mode].refs)}</p>
      <div class="form"><div class="two">${field('Weekly change from, %', 'g-lo', g.lo, 'inputmode="text"')}${field('Weekly change to, %', 'g-hi', g.hi, 'inputmode="text"')}</div>
      <button class="btn solid wide" data-a="saveGoal" data-mode="${mode}">Save goal</button></div>`;
  },
  method() {
    const c = coachNow();
    const list = Object.values(REFS);
    const numbers = c.status !== 'collecting' ? `<ol class="steps">
      <li>Your weight changes at <b>${signed(c.rateKgWk, 2)} kg a week</b> (best-fit line through ${c.weighIns} weigh-ins, give or take ${round(c.seWk, 2)}).</li>
      <li>You ate <b>${fmt(c.intake)} kcal a day</b>${c.hasIntake ? ` (${c.loggedDays} logged days)` : ' (assumed from your target, since few days are logged)'}.</li>
      <li>So your food plus weight change says you burn <b>${fmt(c.measured)} kcal</b>.</li>
      ${c.formula ? `<li>The formula alone says <b>${fmt(c.formula)} kcal</b>. The two are blended by how reliable each is, giving <b>${fmt(c.tdee)} kcal</b>.</li>` : ''}
      <li>The coach only suggests a change when it's about 90% sure your rate is outside your range. Steps are limited to ${MAX_STEP} kcal, and each new target gets its own ${UNLOCK_WEIGH_INS} days.</li></ol>` : '<p class="dim">Your own numbers will appear here once the coach starts.</p>';
    return `${sheetHead('The science behind the numbers')}
      <h3 class="sh-sub">Your numbers right now</h3>${numbers}
      <h3 class="sh-sub">Why 10 days is the minimum, not a promise</h3>
      <p class="sm">Scale weight swings by about ${DAILY_NOISE_PCT}% a day from water alone. Over 10 days that hides changes under roughly 0.3 kg a week, so early on the coach only reacts to big trends. Small ones need 2 to 3 weeks, and the likely range above tightens as you log.</p>
      <h3 class="sh-sub">Choices made in this app</h3>
      <ul class="plain-list sm">
        <li>${fmt(KCAL_PER_KG)} kcal per kg of weight change. The classic 7,700 assumes pure fat, while measured values run lower.</li>
        <li>The recomp range comes from your plan, not a study, since none pins an exact rate.</li>
        <li>Reliability numbers (formula within about ${PRIOR_SD} kcal, food logs within 120 to 350) are reasoned estimates.</li>
        <li>Estimated one-rep max uses the Epley formula, widely used but less accurate at high reps.</li></ul>
      <h3 class="sh-sub">Research used</h3>
      <ul class="papers">${list.map(r => `<li><a href="https://doi.org/${r.doi}" target="_blank" rel="noopener"><b>${esc(r.who)}</b> ${esc(r.title)}${r.title.endsWith('?') ? '' : '.'} <em>${esc(r.where)}</em></a><p class="sm dim">${esc(r.says)}</p></li>`).join('')}</ul>`;
  },
  about() {
    return `${sheetHead('Data sources and credits')}
      <ul class="papers">
        <li><b>USDA FoodData Central</b><p class="sm dim">SR Legacy, FNDDS and Foundation Foods. Public domain.</p></li>
        <li><b>Indian Nutrient Databank</b><p class="sm dim">Vijayakumar A, Dubasi HB, Awasthi A, Jaacks LM. Development of an Indian Food Composition Database. Curr Dev Nutr, 2024. Over 1,000 Indian recipes.</p></li>
        <li><b>Open Food Facts</b><p class="sm dim">Packaged foods from the Open Food Facts contributors, under the Open Database License. The extract in this app is shared under the same licence. Labels are crowd-sourced, so check odd values.</p></li>
        <li><b>Typical estimates</b><p class="sm dim">About 240 everyday dishes written by hand. Oil and portion size can change them a lot.</p></li>
        <li><b>free-exercise-db</b><p class="sm dim">Exercise instructions and images, released into the public domain under the Unlicense.</p></li>
        <li><b>html5-qrcode</b><p class="sm dim">Barcode reading, Apache 2.0.</p></li>
        <li><b>Big Shoulders Display and Instrument Sans</b><p class="sm dim">Typefaces under the SIL Open Font License.</p></li>
      </ul>
      <p class="sm dim">This app gives general fitness guidance, not medical advice. If neck or shoulder symptoms return, stop that exercise and get it checked.</p>`;
  },
};

const macroCells = m => `<div><dd>${fmt(m.kcal)}</dd><dt>kcal</dt></div><div><dd>${round(m.p, 1)}</dd><dt>protein</dt></div><div><dd>${round(m.c, 1)}</dd><dt>carbs</dt></div><div><dd>${round(m.f, 1)}</dd><dt>fat</dt></div>`;
function macroSumText(p, c, f, kcal) {
  const s = p * 4 + c * 4 + f * 9;
  const gap = s - kcal;
  return `Macros add up to ${fmt(s)} kcal${Math.abs(gap) > 50 ? `, ${fmt(Math.abs(gap))} ${gap > 0 ? 'over' : 'under'} your calories` : ''}.`;
}
const rowField = (label, k, v, mode = 'numeric') => `<label>${esc(label)}<input inputmode="${mode}" data-f="row" data-k="${k}" value="${esc(v ?? '')}"></label>`;

function foodRow(f, opts = {}) {
  const id = rememberFood(f);
  const n = ui.foodIndex[id];
  const serv = n.servings[0];
  const g = serv ? serv.g : 100;
  const m = macrosFor(n, g);
  const sub = [n.brand, serv ? serv.label : '100 g', `${round(m.p, 1)} g protein`].filter(Boolean).join(', ');
  return `<li class="food-row"><button class="food-main" data-a="openFood" data-id="${esc(id)}"><span class="fr-name">${esc(n.name)}</span><span class="fr-sub">${esc(sub)}</span></button><span class="fr-kcal">${fmt(m.kcal)}</span><button class="ic-btn add" data-a="quickAdd" data-id="${esc(id)}" aria-label="Add ${esc(n.name)}">${i('plus')}</button></li>`;
}
function foodResults(s) {
  const tab = s.tab || 'all';
  if (tab === 'recent') return state.recentFoods.length ? `<ul class="food-list">${state.recentFoods.map(f => foodRow(f)).join('')}</ul>` : '<p class="empty">Foods you add show up here.</p>';
  if (tab === 'mine') return state.customFoods.length ? `<ul class="food-list">${state.customFoods.map(f => foodRow({ ...f, src: 'm' })).join('')}</ul>` : '<p class="empty">Foods you save with typed macros show up here.</p>';
  if (tab === 'meals') {
    return state.savedMeals.length ? `<ul class="rows">${state.savedMeals.map(m => `<li class="saved-meal"><button class="row" data-a="logMeal" data-id="${m.id}"><span>${esc(m.name)}<em>${m.items.length} foods, ${fmt(sum(m.items.map(e => e.p)))} g protein</em></span><span class="dim">${fmt(sum(m.items.map(e => e.kcal)))}</span></button><button class="ic-btn" data-a="deleteMeal" data-id="${m.id}" aria-label="Delete meal">${i('close')}</button></li>`).join('')}</ul>` : '<p class="empty">Add foods to a meal, then choose "Save as a meal" to repeat it in one tap.</p>';
  }
  if (!s.q) return foodSuggestions(s);
  const parts = [];
  if (s.corrected) parts.push(`<p class="sm dim">Showing results for "${esc(s.corrected)}"</p>`);
  if (s.results?.length) parts.push(`<ul class="food-list">${s.results.map(f => foodRow(f)).join('')}</ul>`);
  else if (!s.searching) parts.push(`<p class="empty">No match in ${ui.foodDb.loaded ? fmt(ui.foodDb.loaded) : 'the'} foods here.</p>`);
  if (s.online?.length) parts.push(`<h3 class="sh-sub">From online databases</h3><ul class="food-list">${s.online.map(f => foodRow(f)).join('')}</ul>`);
  if (s.onlineNote) parts.push(`<p class="sm dim">${esc(s.onlineNote)}</p>`);
  if (!s.online && !s.onlineLoading) parts.push(`<button class="btn line wide" data-a="searchOnline">Search USDA and Open Food Facts online</button>`);
  if (s.onlineLoading) parts.push('<p class="sm dim center">Searching online...</p>');
  if (ui.foodDb.total && !ui.foodDb.done) parts.push(`<p class="sm dim center">${fmt(ui.foodDb.loaded)} of ${fmt(ui.foodDb.total)} foods ready. More are loading.</p>`);
  return parts.join('');
}
// Before you type: what fits what's left today.
function foodSuggestions(s) {
  const k = s.date || today(), t = dayTotals(k), tg = targetsOn(k);
  const left = { kcal: tg.kcal - t.kcal, p: tg.protein - t.p };
  const pool = [...state.recentFoods].map(normaliseFood).filter(f => f.servings[0]);
  const score = f => { const m = macrosFor(f, f.servings[0].g); return m.kcal > left.kcal + 60 ? -1 : m.p / Math.max(m.kcal, 40); };
  const fits = pool.filter(f => score(f) >= 0).sort((a, b) => score(b) - score(a)).slice(0, 5);
  const staples = ['Chicken breast, cooked', 'Egg, whole', 'Whey protein', 'Roti / chapati / phulka, no ghee', 'White rice / chawal, cooked', 'Dal, home-cooked (toor / arhar)', 'Paneer', 'Banana'];
  return `${fits.length ? `<h3 class="sh-sub">Fits what's left: ${fmt(Math.max(left.kcal, 0))} kcal, ${Math.max(Math.round(left.p), 0)} g protein</h3><ul class="food-list">${fits.map(f => foodRow(f)).join('')}</ul>` : ''}
    <h3 class="sh-sub">Quick search</h3><div class="pills">${staples.map(x => `<button class="pill" data-a="foodQuery" data-q="${esc(x.split(/[,/(]/)[0].trim())}">${esc(x.split(/[,/(]/)[0].trim())}</button>`).join('')}</div>`;
}
function libOrCustom(name) {
  return libEntry(name) || (state.customExercises || []).find(x => x.name === name) || null;
}
function exerciseList(list, action) {
  if (!list.length) return '<p class="empty">No exercise with that name. You can create your own.</p>';
  return `<ul class="rows">${list.map(e => {
    const n = exerciseHistory(state.workouts, e.name, 1)[0];
    const lastText = n ? `Last: ${n.sets.filter(isWorking).slice(0, 1).map(x => setText(x, e.unit)).join('')}` : '';
    return `<li><button class="row" data-a="${action}" data-name="${esc(e.name)}"><span>${esc(e.name)}<em>${esc(MUSCLE_NAMES[e.p] || e.p)}, ${esc(e.equip || e.e || '')}</em></span><span class="dim sm">${esc(lastText)}</span></button></li>`;
  }).join('')}</ul>`;
}
function sheetRow(s) {
  if (s.i != null) return state.active?.exercises[s.i] || null;
  const day = findDay(s.day);
  return day?.exercises.find(e => e.id === s.row) || null;
}
