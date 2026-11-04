'use strict';

/* ---------- Feedback ---------- */
function toast(text, cls = '') {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = text;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
let audio = null;
function tone(freq, dur, type = 'sine', gain = 0.12, when = 0) {
  if (!state.settings.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch (e) { /* sound is optional */ }
}
// Iron on iron: two detuned metallic partials with a fast decay.
function playClang() { tone(1250, 0.22, 'triangle', 0.05); tone(1873, 0.16, 'sine', 0.03); tone(180, 0.09, 'sine', 0.14); }
function playTick() { tone(880, 0.05, 'sine', 0.05); }
function playBeep() { tone(880, 0.16, 'sine', 0.16); tone(1175, 0.2, 'sine', 0.16, 0.2); }
function playBest() { tone(784, 0.1, 'triangle', 0.1); tone(1175, 0.2, 'triangle', 0.1, 0.1); }
// iOS 18 gives a haptic tap when a native switch toggles. Harmless everywhere else.
const haptic = (() => {
  let label = null;
  return () => {
    if (navigator.vibrate) { navigator.vibrate(8); return; }
    if (!label) {
      label = document.createElement('label');
      label.style.display = 'none';
      label.innerHTML = '<input type="checkbox" switch>';
      document.body.appendChild(label);
    }
    label.click();
  };
})();

/* ---------- Render ---------- */
const VIEWS = { today: viewToday, train: viewTrain, food: viewFood, progress: viewProgress, you: viewYou };
function render() {
  const app = document.getElementById('app');
  const onWelcome = !state.onboarded;
  app.innerHTML = onWelcome ? viewWelcome() : VIEWS[ui.tab]();
  document.getElementById('tabs').innerHTML = onWelcome ? '' : [['today', 'Today'], ['train', 'Train'], ['food', 'Food'], ['progress', 'Progress'], ['you', 'You']]
    .map(([id, l]) => `<button class="${ui.tab === id ? 'on' : ''}${id === 'train' && state.active ? ' live' : ''}" data-a="go" data-tab="${id}" aria-current="${ui.tab === id ? 'page' : 'false'}">${i(id)}<span>${l}</span></button>`).join('');
  renderSheet();
  tickRest();
  tickClock();
}
function renderSheet() {
  const el = document.getElementById('sheet');
  const s = ui.sheet;
  if (!s) {
    el.hidden = true;
    el.innerHTML = '';
    document.body.classList.remove('locked');
    return;
  }
  const old = el.querySelector('.panel');
  const scroll = old && el.dataset.type === s.type ? old.scrollTop : 0;
  const first = el.hidden;
  el.hidden = false;
  el.dataset.type = s.type;
  document.body.classList.add('locked');
  const tall = ['food', 'swap', 'addExercise', 'method', 'dayEdit', 'workout', 'lift', 'exercise', 'programs', 'schedule'].includes(s.type);
  el.innerHTML = `<div class="scrim" data-a="closeAll"></div><div class="panel${tall ? ' tall' : ''}${first ? ' enter' : ''}" role="dialog" aria-modal="true">${SHEETS[s.type](s)}</div>`;
  el.querySelector('.panel').scrollTop = scroll;
  if (s.type === 'lift') fillHowTo(s.name);
}
const commit = () => { scheduleSave(); render(); };
const v = id => document.getElementById(id)?.value ?? '';

function onFoodProgress() {
  if (ui.sheet?.type === 'food' && ui.sheet.q && (ui.sheet.tab || 'all') === 'all') refreshFoodResults();
}
function refreshFoodResults() {
  const el = document.getElementById('food-results');
  if (el && ui.sheet?.type === 'food') el.innerHTML = foodResults(ui.sheet);
}

/* ---------- Food logging ---------- */
function logEntry(date, slot, entry) {
  const d = getDay(date);
  d.meals = d.meals || {};
  (d.meals[slot] = d.meals[slot] || []).push({ ...entry, id: uid() });
}
function addToRecent(food) {
  state.recentFoods = [food, ...state.recentFoods.filter(f => f.id !== food.id)].slice(0, 40);
}
function compactFood(f) {
  return { id: f.id, name: f.name, brand: f.brand || '', kcal: f.kcal, p: f.p, c: f.c, f: f.f, servings: f.servings, src: f.src };
}
function targetSlotAndDate() {
  const parent = ui.sheet?.type === 'food' ? ui.sheet : ui.sheetStack.find(x => x.type === 'food');
  return { parent, date: parent?.date || ui.foodDate, slot: parent?.slot || slotNow() };
}
function bumpAdded(parent) { if (parent) parent.added = (parent.added || 0) + 1; }

let foodTimer = null;
function runFoodSearch() {
  const s = ui.sheet;
  if (!s || s.type !== 'food') return;
  const q = (s.q || '').trim();
  s.online = null; s.onlineNote = ''; s.onlineLoading = false; s.corrected = null;
  if (!q) { s.results = []; refreshFoodResults(); return; }
  const token = ++ui.searchToken;
  s.searching = true;
  const lower = q.toLowerCase();
  const mine = [...state.customFoods.map(f => ({ ...f, src: 'm' })), ...state.recentFoods].filter(f => lower.split(/\s+/).every(t => `${f.name} ${f.brand || ''}`.toLowerCase().includes(t)));
  Foods.search(q).then(res => {
    if (token !== ui.searchToken || ui.sheet !== s) return;
    s.searching = false;
    s.corrected = res.corrected || null;
    const seen = new Set();
    s.results = [...mine, ...(res.results || [])].filter(f => {
      const key = `${f.name}|${f.brand || ''}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 60);
    refreshFoodResults();
  });
}
async function onlineSearch() {
  const s = ui.sheet;
  if (!s || !s.q) return;
  s.onlineLoading = true;
  refreshFoodResults();
  const [usda, off] = await Promise.allSettled([searchUSDA(s.q), searchOFF(s.q)]);
  if (ui.sheet !== s) return;
  s.onlineLoading = false;
  s.online = [...(off.value || []), ...(usda.value || [])];
  const notes = [];
  if (usda.status === 'rejected') notes.push(usda.reason?.message === 'limit' ? 'USDA hit its hourly limit. Add a free key in You to lift it.' : 'USDA is not reachable right now.');
  if (off.status === 'rejected') notes.push('Open Food Facts is not reachable right now.');
  s.onlineNote = notes.join(' ');
  refreshFoodResults();
}

/* ---------- Workouts ---------- */
function rowsToActive(rows, deload) {
  return rows.map(e => {
    const count = deload ? Math.max(1, Math.ceil(e.sets / 2)) : e.sets;
    return { ...clone(e), planRow: e.id, chosen: deload ? 'lighter' : undefined, sets: Array.from({ length: count }, () => ({ w: '', r: '', done: false })) };
  });
}
function startWorkout(day) {
  const deload = inDeload();
  state.active = { id: uid(), date: today(), name: day ? day.name : 'Workout', dayId: day?.id || null, startedAt: Date.now(), deload, exercises: day ? rowsToActive(day.exercises, deload) : [] };
  ui.tab = 'train';
  requestWake();
  haptic();
  commit();
  window.scrollTo(0, 0);
}
function targetsForSet(e, si) {
  const hist = exerciseHistory(state.workouts, e.name, 6);
  const n = suggestNext(e, hist);
  const opt = n.options.find(o => o.id === (e.chosen || n.chosen));
  let idx = 0;
  for (let x = 0; x < si; x++) if (isWorking(e.sets[x]) && e.sets[x].type !== 'drop') idx++;
  return { w: opt?.w ?? n.w ?? null, r: opt?.reps?.[idx] ?? n.reps?.[idx] ?? null };
}
function recomputePRs() {
  const best = {};
  state.workouts.slice().sort((a, b) => a.startedAt - b.startedAt).forEach(w => {
    w.prs = [];
    w.exercises.forEach(e => {
      const work = e.sets.filter(isWorking);
      if (!work.length) return;
      const top = work.reduce((b, s) => (setScore(s) > setScore(b) ? s : b), work[0]);
      if (best[e.name] > 0 && setScore(top) > best[e.name] + 0.001) w.prs.push({ name: e.name, w: top.w, r: top.r, unit: e.unit });
      best[e.name] = Math.max(best[e.name] || 0, setScore(top));
    });
  });
}
function finishWorkout() {
  const a = state.active;
  const exercises = a.exercises.map(e => ({
    name: e.name, p: e.p, s: e.s, kind: e.kind, unit: e.unit, lo: e.lo, hi: e.hi, note: e.note || undefined, swappedFrom: e.swappedFrom || undefined,
    sets: e.sets.filter(s => s.done).map(s => {
      const out = { w: Number(s.w) || 0, r: Number(s.r) || 0 };
      if (s.type) out.type = s.type;
      if (s.rir !== '' && s.rir != null) out.rir = Number(s.rir);
      return out;
    }),
  })).filter(e => e.sets.length);
  if (!exercises.length) {
    if (confirm('No sets are ticked off. Throw this workout away?')) { state.active = null; stopRest(); releaseWake(); commit(); }
    return;
  }
  const open = a.exercises.flatMap(e => e.sets).filter(s => !s.done).length;
  if (open && !confirm(`${open} sets aren't ticked off and won't be saved. Finish anyway?`)) return;
  const w = { id: a.id, date: a.date, name: a.name, dayId: a.dayId, startedAt: a.startedAt, finishedAt: Date.now(), deload: a.deload || undefined, exercises, prs: [] };
  state.workouts.push(w);
  recomputePRs();
  if (!state.profile.startDate) state.profile.startDate = a.date;
  state.active = null;
  stopRest();
  releaseWake();
  ui.sheet = { type: 'summary', id: w.id };
  ui.sheetStack = [];
  if (w.prs.length) playBest(); else playClang();
  commit();
}
function bestBefore(name) {
  return Math.max(0, ...state.workouts.flatMap(w => w.exercises.filter(e => e.name === name).map(e => bestScore(e.sets))));
}
function saveSwapPref(from, to) {
  const list = state.altPrefs[from] || [];
  state.altPrefs[from] = [to, ...list.filter(x => x !== to)].slice(0, 5);
}
// Works for library exercises, your own, and anything from the big list.
async function rowFromName(name, keep = {}) {
  const lib = libOrCustom(name);
  if (lib) {
    const r = planRow(name, keep.sets ?? 3, keep.lo ?? lib.lo, keep.hi ?? lib.hi);
    return { ...r, p: lib.p, s: lib.s || [], kind: lib.kind, unit: lib.unit || 'reps', inc: lib.inc ?? 2.5, rest: lib.rest ?? 90 };
  }
  const db = await loadExerciseDb();
  const x = db.find(e => e.n === name);
  const kind = x?.c ? 'compound' : 'isolation';
  const equip = x?.e || 'other';
  const inc = /dumbbell/.test(equip) ? 2 : /body/.test(equip) ? 0 : /machine/.test(equip) ? 5 : 2.5;
  return { ...planRow(name, keep.sets ?? 3, keep.lo ?? (kind === 'compound' ? 8 : 10), keep.hi ?? (kind === 'compound' ? 12 : 15)), p: x?.p || 'abs', s: x?.s || [], kind, inc, rest: kind === 'compound' ? 150 : 90 };
}

/* ---------- Rest timer and clocks ---------- */
let restInterval = null;
function startRest(seconds) {
  ui.rest = { endsAt: Date.now() + seconds * 1000, total: seconds, beeped: false };
  if (!restInterval) restInterval = setInterval(tickRest, 250);
  tickRest();
}
function stopRest() {
  ui.rest = null;
  clearInterval(restInterval);
  restInterval = null;
  const el = document.getElementById('rest');
  el.hidden = true;
  el.innerHTML = '';
}
function tickRest() {
  const el = document.getElementById('rest');
  if (!ui.rest || !state.active) { if (el) el.hidden = true; return; }
  const left = Math.ceil((ui.rest.endsAt - Date.now()) / 1000);
  if (left <= 0 && !ui.rest.beeped) { ui.rest.beeped = true; playBeep(); haptic(); }
  if (left <= -8) { stopRest(); return; }
  const shown = Math.max(left, 0);
  const pct = clamp((ui.rest.endsAt - Date.now()) / (ui.rest.total * 1000) * 100, 0, 100);
  const time = `${Math.floor(shown / 60)}:${pad(shown % 60)}`;
  if (el.hidden || !el.firstChild) {
    el.hidden = false;
    el.innerHTML = `<i class="rest-fill"></i><button class="rest-b" data-a="restAdd" data-by="-15" aria-label="15 seconds less">−15</button><b class="rest-t"></b><button class="rest-b" data-a="restAdd" data-by="15" aria-label="15 seconds more">+15</button><button class="rest-b" data-a="restSkip">Skip</button>`;
  }
  el.querySelector('.rest-t').textContent = left <= 0 ? 'Go' : time;
  el.querySelector('.rest-fill').style.width = `${pct}%`;
}
function tickClock() {
  const clock = document.getElementById('clock');
  if (clock && state.active) clock.textContent = `${Math.floor((Date.now() - state.active.startedAt) / 60000)} min`;
}
setInterval(tickClock, 15000);
let wakeLock = null;
async function requestWake() { try { if (state.active && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* optional */ } }
function releaseWake() { try { wakeLock?.release(); } catch (e) { /* optional */ } wakeLock = null; }

async function fillHowTo(name) {
  const el = document.getElementById('howto');
  if (!el) return;
  try {
    const db = await loadExerciseDb();
    const low = name.toLowerCase();
    const hit = db.find(e => e.n.toLowerCase() === low);
    if (!hit || !hit.h?.length || !document.getElementById('howto')) return;
    el.innerHTML = `<details class="howto"><summary>How to do it</summary>${hit.i ? `<img loading="lazy" alt="" src="https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${esc(hit.i)}">` : ''}<ol>${hit.h.map(x => `<li>${esc(x)}</li>`).join('')}</ol></details>`;
  } catch (e) { /* offline: the cue above is still there */ }
}

/* ---------- Backup ---------- */
async function exportData() {
  const stamp = today();
  const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() })], { type: 'application/json' });
  const name = `rep-quest-backup-${stamp}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Rep Quest backup' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    state.lastBackup = stamp;
    toast('Backup saved');
    commit();
  } catch (e) {
    if (e.name !== 'AbortError') toast('Could not save the backup');
  }
}
async function importFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || !data.days || !(data.workouts || data.plan)) throw new Error('bad');
    if (state.onboarded && !confirm('Replace everything on this phone with this backup?')) return;
    state = migrate(data);
    state.onboarded = true;
    ui.sheet = null; ui.sheetStack = [];
    toast('Backup restored');
    commit();
  } catch (e) { toast('That file is not a Rep Quest backup'); }
}

/* ---------- Actions ---------- */
function closeSheet() {
  ui.sheet = ui.sheetStack.pop() || null;
  scheduleSave();
  render();
}
function closeAll() { ui.sheet = null; ui.sheetStack = []; ui.mirrorPlan = undefined; commit(); }
function mirrorRowToPlan(e, key, value) {
  if (ui.mirrorPlan === false || !e.planRow) return;
  state.program.days.forEach(d => d.exercises.forEach(r => { if (r.id === e.planRow) r[key] = value; }));
  markEdited();
}
// The first edit of a built-in program becomes "My plan" so the original stays available.
function markEdited() {
  if (state.program.key !== 'mine' && !state.program.edited) state.program.edited = true;
}
function restoreFromArchive(key) {
  return state.programArchive?.[key] || null;
}

const A = {
  go(d) { ui.tab = d.tab; ui.foodDate = d.tab === 'food' ? ui.foodDate : today(); render(); window.scrollTo(0, 0); },
  openSheet(d, el) {
    const s = { ...d, type: d.type };
    delete s.a;
    ['i', 'j'].forEach(k => { if (s[k] != null) s[k] = Number(s[k]); });
    if (ui.sheet) ui.sheetStack.push(ui.sheet);
    ui.sheet = s;
    if (s.type === 'food') Foods.start();
    render();
    if (s.type === 'food' && !s.q) setTimeout(() => document.getElementById('food-q')?.focus(), 250);
  },
  closeSheet,
  closeAll,
  adviceGo(d) {
    const payload = JSON.parse(d.payload || '{}');
    if (d.kind === 'go') A.go(payload);
    else if (d.kind === 'sheet') A.openSheet(payload);
    else A[d.kind](payload);
  },
  dismiss(d) {
    state.dismissed[d.id] = d.once ? '9999-12-31' : addDays(today(), 7);
    commit();
  },

  /* Daily log */
  bump(d) {
    const el = document.getElementById(d.t);
    const cur = num(el.value) ?? 0;
    el.value = round(cur + Number(d.by), 1);
    haptic();
  },
  weightDate(d) { ui.sheet.date = d.k; render(); },
  saveWeight(d) {
    const w = num(v('w-val'));
    if (w == null || w < 20 || w > 400) { toast('Enter a weight in kg'); return; }
    getDay(d.k).weight = round(w, 2);
    if (!state.profile.startDate) state.profile.startDate = d.k;
    ui.sheet = ui.sheetStack.pop() || null;
    haptic();
    commit();
  },
  clearWeight(d) { delete getDay(d.k).weight; closeSheet(); },
  logDay(d) { ui.sheet.date = addDays(ui.sheet.date || today(), Number(d.n)); render(); },
  saveLog(d) {
    const day = getDay(d.k);
    [['steps', 'l-steps'], ['sleep', 'l-sleep'], ['water', 'l-water'], ['cardio', 'l-cardio'], ['waist', 'l-waist']].forEach(([key, id]) => {
      if (!document.getElementById(id)) return;
      const n = num(v(id));
      if (n == null) delete day[key]; else day[key] = n;
    });
    const note = v('l-note').trim();
    if (note) day.note = note; else delete day.note;
    closeSheet();
  },

  /* Food */
  foodDay(d) {
    const next = addDays(ui.foodDate, Number(d.n));
    if (next <= today()) { ui.foodDate = next; render(); }
  },
  foodTab(d) { ui.sheet.tab = d.v; render(); },
  foodQuery(d) { ui.sheet.q = d.q; ui.sheet.tab = 'all'; render(); runFoodSearch(); },
  searchOnline: onlineSearch,
  openFood(d) { A.openSheet({ type: 'amount', foodId: d.id, slot: targetSlotAndDate().slot }); },
  quickAdd(d, el) {
    const f = ui.foodIndex[d.id];
    if (!f) return;
    const { parent, date, slot } = targetSlotAndDate();
    const g = f.servings[0]?.g || 100;
    const m = macrosFor(f, g);
    logEntry(date, slot, { name: f.name, ...m, grams: g, amount: f.servings[0]?.label || '100 g', source: f.src });
    addToRecent(compactFood(f));
    bumpAdded(parent);
    haptic();
    playTick();
    scheduleSave();
    const addedEl = document.getElementById('food-added');
    if (addedEl && parent) addedEl.textContent = `${parent.added} added`;
    const row = el.closest('.food-row');
    row?.classList.add('flash');
    setTimeout(() => row?.classList.remove('flash'), 500);
  },
  foodUnit(d) {
    const s = ui.sheet, f = ui.foodIndex[s.foodId];
    s.unit = Number(d.v);
    s.qty = s.unit === -1 ? (f.servings[0]?.g && s.qty == null ? f.servings[0].g : 100) : 1;
    render();
  },
  foodQty(d) {
    const el = document.getElementById('food-qty');
    const n = Math.max(0, (num(el.value) || 0) + Number(d.by));
    ui.sheet.qty = n;
    el.value = round(n, 2);
    refreshAmount();
    haptic();
  },
  addFood() {
    const s = ui.sheet, f = ui.foodIndex[s.foodId];
    const unit = s.unit ?? (f.servings[0] ? 0 : -1);
    const qty = num(v('food-qty')) ?? s.qty ?? (unit === -1 ? 100 : 1);
    if (!(qty > 0)) { toast('Enter an amount'); return; }
    const grams = unit === -1 ? qty : qty * f.servings[unit].g;
    const slot = v('food-slot');
    const { parent, date } = targetSlotAndDate();
    const amount = unit === -1 ? `${round(qty, 1)} g` : qty === 1 ? f.servings[unit].label : `${round(qty, 2)} × ${f.servings[unit].label}`;
    logEntry(date, slot, { name: f.name, ...macrosFor(f, grams), grams, amount, source: f.src });
    addToRecent(compactFood(f));
    bumpAdded(parent);
    ui.sheet = ui.sheetStack.pop() || null;
    haptic();
    playTick();
    commit();
  },
  deleteCustomFood(d) {
    state.customFoods = state.customFoods.filter(f => f.id !== d.id);
    state.recentFoods = state.recentFoods.filter(f => f.id !== d.id);
    closeSheet();
  },
  saveMacros() {
    const name = v('c-name').trim() || 'Quick add';
    const kcal = num(v('c-kcal')), p = num(v('c-p')) || 0, c = num(v('c-c')) || 0, f = num(v('c-f')) || 0;
    const total = kcal ?? p * 4 + c * 4 + f * 9;
    if (!total) { toast('Enter calories or macros'); return; }
    const { parent, date, slot } = targetSlotAndDate();
    logEntry(date, slot, { name, kcal: total, p, c, f, amount: '1 serving', source: 'm' });
    if (document.getElementById('c-save')?.checked && name !== 'Quick add') {
      // Stored per 100 g with a 100 g "serving", so one tap logs exactly what was typed.
      state.customFoods.unshift({ id: `m:${uid()}`, name, kcal: total, p, c, f, servings: [{ label: '1 serving', g: 100 }], src: 'm' });
    }
    bumpAdded(parent);
    ui.sheet = ui.sheetStack.pop() || null;
    commit();
  },
  scaleEntry(d) {
    ['e-kcal', 'e-p', 'e-c', 'e-f'].forEach(id => {
      const el = document.getElementById(id);
      el.value = round((num(el.value) || 0) * Number(d.by), 1);
    });
  },
  saveEntry() {
    const s = ui.sheet;
    const e = peekDay(ui.foodDate).meals[s.slot].find(x => x.id === s.id);
    e.kcal = num(v('e-kcal')) || 0; e.p = num(v('e-p')) || 0; e.c = num(v('e-c')) || 0; e.f = num(v('e-f')) || 0;
    closeSheet();
  },
  deleteEntry() {
    const s = ui.sheet, meals = getDay(ui.foodDate).meals;
    meals[s.slot] = meals[s.slot].filter(x => x.id !== s.id);
    closeSheet();
  },
  copyMeal(d) {
    const items = peekDay(d.from).meals?.[d.slot] || [];
    items.forEach(e => { const { id, ...rest } = e; logEntry(ui.foodDate, d.slot, rest); });
    toast(`${items.length} foods added`);
    haptic();
    commit();
  },
  saveMeal() {
    const s = ui.sheet;
    const items = peekDay(ui.foodDate).meals?.[s.slot] || [];
    const name = v('meal-name').trim();
    if (!name) { toast('Give the meal a name'); return; }
    state.savedMeals.unshift({ id: uid(), name, slot: s.slot, items: clone(items) });
    toast('Meal saved');
    closeSheet();
  },
  logMeal(d) {
    const m = state.savedMeals.find(x => x.id === d.id);
    if (!m) return;
    const { parent, date, slot } = ui.sheet ? targetSlotAndDate() : { date: ui.foodDate, slot: d.slot || m.slot };
    m.items.forEach(e => { const { id, ...rest } = e; logEntry(date, slot, rest); });
    bumpAdded(parent);
    toast(`${m.name} added`);
    haptic();
    playTick();
    commit();
  },
  deleteMeal(d) {
    if (!confirm('Delete this saved meal?')) return;
    state.savedMeals = state.savedMeals.filter(x => x.id !== d.id);
    commit();
  },
  scanBarcode() { document.getElementById('scan-file')?.click(); },
  saveUsda() { state.settings.usdaKey = v('usda-key').trim(); closeSheet(); },

  /* Training */
  pickDay(d) { ui.planDay = Number(d.d); render(); },
  startDay(d) {
    if (state.active && !confirm('You already have a workout running. Replace it?')) return;
    startWorkout(findDay(d.id));
  },
  startEmpty() { startWorkout(null); },
  startDeload() {
    state.deloadUntil = addDays(today(), 6);
    state.lastDeloadDate = today();
    toast('Lighter week started');
    commit();
  },
  endDeload() { state.deloadUntil = null; commit(); },
  toggleSet(d) {
    const e = state.active.exercises[d.i], s = e.sets[d.j];
    if (s.done) { s.done = false; commit(); return; }
    const hint = targetsForSet(e, Number(d.j));
    if (s.w === '' || s.w == null) s.w = isWorking(s) && s.type !== 'drop' && hint.w != null ? hint.w : (e.sets[d.j - 1]?.w ?? 0);
    if (s.r === '' || s.r == null) s.r = isWorking(s) && s.type !== 'drop' && hint.r != null ? hint.r : (e.sets[d.j - 1]?.r ?? 0);
    if (!Number(s.r)) { toast(`Enter ${unitWord(e)} first`); return; }
    s.done = true;
    haptic();
    playTick();
    const before = bestBefore(e.name);
    const score = setScore({ w: Number(s.w) || 0, r: Number(s.r) || 0 });
    if (isWorking(s) && before > 0 && score > before + 0.001) {
      const seen = state.active.exercises.flatMap(x => (x.name === e.name ? x.sets.filter(y => y !== s && y.done) : [])).map(y => setScore({ w: Number(y.w) || 0, r: Number(y.r) || 0 }));
      if (!seen.some(x => x >= score)) { toast(`New best: ${setText({ w: Number(s.w), r: Number(s.r) }, e.unit)}`, 'best'); playBest(); }
    }
    const moreInLinked = e.superset && d.i < state.active.exercises.length - 1;
    if (!moreInLinked) startRest(s.type === 'warmup' ? 60 : e.rest || 90);
    commit();
  },
  cycleType(d) {
    const s = state.active.exercises[d.i].sets[d.j];
    const order = [undefined, 'warmup', 'drop', 'failure'];
    s.type = order[(order.indexOf(s.type) + 1) % order.length];
    if (!s.type) delete s.type;
    haptic();
    commit();
  },
  chooseOption(d) {
    const e = state.active.exercises[d.i];
    e.chosen = d.o;
    // Clear values you haven't ticked, so the new targets show.
    e.sets.forEach(s => { if (!s.done) { s.w = ''; s.r = ''; } });
    haptic();
    commit();
  },
  addSet(d) {
    const e = state.active.exercises[d.i], last = e.sets[e.sets.length - 1];
    e.sets.push({ w: last ? last.w : '', r: last ? last.r : '', done: false });
    commit();
  },
  dropSet(d) { state.active.exercises[d.i].sets.pop(); commit(); },
  finishWorkout,
  logWalk() {
    const d = getDay(today());
    d.cardio = (d.cardio || 0) + 20;
    toast(`${d.cardio} min of cardio today`);
    closeAll();
  },
  cancelWorkout() {
    if (confirm('Discard this workout? Its sets will not be saved.')) { state.active = null; stopRest(); releaseWake(); commit(); }
  },
  restAdd(d) { if (ui.rest) { ui.rest.endsAt += Number(d.by) * 1000; ui.rest.beeped = false; tickRest(); } },
  restSkip() { stopRest(); },
  swapScope(d) { ui.swapScope = d.v; render(); },
  async swapTo(d) {
    const s = ui.sheet;
    const fromActive = s.i != null;
    const old = fromActive ? state.active.exercises[s.i] : sheetRow(s);
    const row = await rowFromName(d.name, { sets: old.sets?.length ?? old.sets, lo: libOrCustom(d.name)?.lo, hi: libOrCustom(d.name)?.hi });
    saveSwapPref(old.name, d.name);
    if (fromActive) {
      const planId = old.planRow;
      const doneSets = old.sets.filter(x => x.done).length;
      if (doneSets && !confirm(`${old.name} has ${doneSets} finished sets. They won't be saved if you swap. Continue?`)) return;
      state.active.exercises[s.i] = { ...row, id: old.id, planRow: planId, swappedFrom: old.swappedFrom || old.name, superset: old.superset, sets: old.sets.map(() => ({ w: '', r: '', done: false })) };
      if (ui.swapScope === 'plan' && planId) {
        state.program.days.forEach(day => { day.exercises = day.exercises.map(r => (r.id === planId ? { ...row, id: r.id, sets: r.sets } : r)); });
        state.active.exercises[s.i].swappedFrom = undefined;
        markEdited();
      }
      toast(ui.swapScope === 'plan' ? 'Swapped and saved to your plan' : 'Swapped for today');
    } else {
      const day = findDay(s.day);
      day.exercises = day.exercises.map(r => (r.id === s.row ? { ...row, id: r.id, sets: r.sets } : r));
      markEdited();
    }
    ui.swapScope = 'today';
    while (ui.sheetStack.length && ui.sheetStack[ui.sheetStack.length - 1].type === 'exercise') ui.sheetStack.pop();
    ui.sheet = ui.sheetStack.pop() || null;
    commit();
  },
  async addEx(d) {
    const s = ui.sheet;
    const row = await rowFromName(d.name, {});
    if (s.target === 'active') {
      state.active.exercises.push({ ...row, sets: Array.from({ length: row.sets }, () => ({ w: '', r: '', done: false })) });
    } else {
      findDay(s.day).exercises.push(row);
      markEdited();
    }
    ui.sheet = ui.sheetStack.pop() || null;
    commit();
    if (s.target === 'active') setTimeout(() => document.getElementById(`ex-${state.active.exercises.length - 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  },
  createExercise() {
    const name = v('nx-name').trim();
    if (!name) { toast('Give it a name'); return; }
    const kind = v('nx-kind');
    const entry = { name, p: v('nx-muscle'), s: [], equip: 'custom', kind, unit: 'reps', inc: 2.5, rest: kind === 'compound' ? 150 : 90 };
    state.customExercises = [entry, ...(state.customExercises || []).filter(x => x.name !== name)];
    ui.sheet = ui.sheetStack.pop() || null;
    A.addEx({ name });
  },
  rowSet(d) {
    const e = sheetRow(ui.sheet);
    e[d.k] = d.v;
    if (ui.sheet.i != null) { mirrorRowToPlan(e, d.k, d.v); e.chosen = undefined; } else markEdited();
    commit();
  },
  addWarmups() {
    const e = state.active.exercises[ui.sheet.i];
    const hint = targetsForSet(e, e.sets.findIndex(s => isWorking(s)));
    const w = num(e.sets.find(isWorking)?.w) || hint.w;
    const ramp = warmupSets(w, e.inc);
    if (!ramp.length) { toast('Warm-ups are added once there is a working weight of 20 kg or more'); return; }
    e.sets.unshift(...ramp.map(x => ({ ...x, type: 'warmup', done: false })));
    closeAll();
  },
  moveEx(d) {
    const list = state.active.exercises, from = ui.sheet.i, to = from + Number(d.by);
    if (to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    ui.sheet.i = to;
    commit();
  },
  removeEx() {
    const s = ui.sheet;
    if (s.i != null) {
      if (state.active.exercises[s.i].sets.some(x => x.done) && !confirm('This exercise has finished sets. Remove it?')) return;
      state.active.exercises.splice(s.i, 1);
    } else {
      const day = findDay(s.day);
      day.exercises = day.exercises.filter(e => e.id !== s.row);
      markEdited();
    }
    closeSheet();
  },
  moveRow(d) {
    const day = findDay(ui.sheet.id), n = Number(d.n), to = n + Number(d.by);
    if (to < 0 || to >= day.exercises.length) return;
    [day.exercises[n], day.exercises[to]] = [day.exercises[to], day.exercises[n]];
    markEdited();
    commit();
  },
  newDay() {
    const day = { id: uid(), name: 'New workout', exercises: [] };
    state.program.days.push(day);
    markEdited();
    A.openSheet({ type: 'dayEdit', id: day.id });
  },
  deleteDay() {
    const id = ui.sheet.id;
    if (!confirm('Delete this workout from your plan? Past sessions stay in your history.')) return;
    state.program.days = state.program.days.filter(x => x.id !== id);
    Object.keys(state.program.schedule).forEach(k => { if (state.program.schedule[k] === id) delete state.program.schedule[k]; });
    markEdited();
    closeSheet();
  },
  switchProgram(d) {
    if (state.active) { toast('Finish your workout first'); return; }
    state.programArchive = state.programArchive || {};
    state.programArchive[state.program.key] = state.program;
    state.program = restoreFromArchive(d.key) || makeProgram(d.key);
    toast(`Now using ${state.program.name}`);
    commit();
  },
  deleteWorkout() {
    if (!confirm('Delete this workout? This cannot be undone.')) return;
    state.workouts = state.workouts.filter(w => w.id !== ui.sheet.id);
    recomputePRs();
    closeSheet();
  },

  /* Coach and settings */
  applyCoach() {
    const c = coachNow();
    if (!c.newKcal) return;
    if (!state.targetLog.length) state.targetLog.push({ date: state.profile.startDate || addDays(today(), -14), ...state.targets, reason: 'Starting target' });
    state.targets = adjustMacros(state.targets, c.newKcal, c.weight);
    state.kcalChangedOn = today();
    logTargets(`Coach: ${c.title}`);
    toast(`Target set to ${fmt(c.newKcal)} kcal`);
    commit();
  },
  setRange(d) { ui.range = Number(d.v); render(); },
  saveProfile() {
    const p = state.profile;
    p.heightCm = num(v('p-height')); p.age = num(v('p-age'));
    p.sex = v('p-sex') || null; p.activity = v('p-activity'); p.name = v('p-name').trim();
    if (p.heightCm && p.age && p.sex) state.needsDetails = false;
    state.justUpgraded = false;
    closeSheet();
  },
  balanceCarbs() {
    const k = num(v('t-kcal')) || 0, p = num(v('t-protein')) || 0, f = num(v('t-fat')) || 0;
    document.getElementById('t-carbs').value = Math.max(0, Math.round((k - p * 4 - f * 9) / 4));
    refreshMacroSum();
  },
  saveTargets() {
    const t = state.targets, before = `${t.kcal}/${t.protein}/${t.carbs}/${t.fat}`;
    const next = { kcal: num(v('t-kcal')), protein: num(v('t-protein')), carbs: num(v('t-carbs')), fat: num(v('t-fat')), steps: num(v('t-steps')), sleep: num(v('t-sleep')), water: num(v('t-water')) };
    if (Object.values(next).some(x => x == null || x < 0)) { toast('Fill in every target'); return; }
    if (!state.targetLog.length) state.targetLog.push({ date: state.profile.startDate || addDays(today(), -14), kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, reason: 'Starting target' });
    if (next.kcal !== t.kcal) state.kcalChangedOn = today();
    state.targets = { ...t, ...next };
    if (before !== `${next.kcal}/${next.protein}/${next.carbs}/${next.fat}`) logTargets('Edited by you');
    closeSheet();
  },
  goalMode(d) { ui.sheet.mode = d.v; render(); },
  saveGoal(d) {
    const lo = num(v('g-lo').replace('−', '-')), hi = num(v('g-hi').replace('−', '-'));
    if (lo == null || hi == null || lo >= hi) { toast('The first number must be lower than the second'); return; }
    state.goal = { mode: d.mode, lo, hi };
    closeSheet();
  },
  exportData,
  importData() { document.getElementById('restore-file')?.click(); },
};

function refreshAmount() {
  const s = ui.sheet, f = ui.foodIndex[s.foodId];
  if (!f) return;
  const unit = s.unit ?? (f.servings[0] ? 0 : -1);
  const qty = s.qty ?? 0;
  const grams = unit === -1 ? qty : qty * f.servings[unit].g;
  document.getElementById('food-macros').innerHTML = macroCells(macrosFor(f, grams));
  if (unit !== -1) document.getElementById('food-grams').textContent = `${round(grams, 1)} g in total`;
}
function refreshMacroSum() {
  document.getElementById('macro-sum').textContent = macroSumText(num(v('t-protein')) || 0, num(v('t-carbs')) || 0, num(v('t-fat')) || 0, num(v('t-kcal')) || 0);
}

let exTimer = null;
const FIELD = {
  set(d, el) { state.active.exercises[d.i].sets[d.j][d.k] = el.value; scheduleSave(); },
  histSet(d, el) {
    const w = state.workouts.find(x => x.id === ui.sheet.id);
    w.exercises[d.e].sets[d.j][d.k] = num(el.value) ?? 0;
    recomputePRs();
    scheduleSave();
  },
  foodSearch(d, el) {
    ui.sheet.q = el.value;
    ui.sheet.tab = 'all';
    clearTimeout(foodTimer);
    foodTimer = setTimeout(runFoodSearch, 130);
    document.querySelectorAll('#sheet .seg button').forEach((b, n) => b.classList.toggle('on', n === 0));
  },
  foodQty(d, el) { ui.sheet.qty = num(el.value) ?? 0; refreshAmount(); },
  exSearch(d, el) {
    clearTimeout(exTimer);
    const q = el.value.trim().toLowerCase();
    exTimer = setTimeout(async () => {
      const action = ui.sheet.type === 'swap' ? 'swapTo' : 'addEx';
      const box = document.getElementById('ex-results');
      if (!box) return;
      const match = n => q.split(/\s+/).every(t => n.toLowerCase().includes(t));
      const own = [...(state.customExercises || []), ...LIBRARY].filter(e => match(e.name));
      if (!q) { box.innerHTML = exerciseList(LIBRARY.slice(0, 40), action); return; }
      box.innerHTML = exerciseList(own, action);
      try {
        const db = await loadExerciseDb();
        const more = db.filter(e => match(e.n) && !libEntry(e.n)).slice(0, 40).map(e => ({ name: e.n, p: e.p, equip: e.e }));
        if (document.getElementById('ex-results') === box) box.innerHTML = exerciseList([...own, ...more], action);
      } catch (err) { /* offline: the core list is enough */ }
    }, 120);
  },
  row(d, el) {
    const e = sheetRow(ui.sheet);
    if (!e) return;
    const text = d.k === 'note';
    const val = text ? el.value : num(el.value);
    if (!text && val == null) return;
    const inWorkout = ui.sheet.i != null;
    if (inWorkout && d.k === 'sets') return; // sets in a live workout change with Add set
    e[d.k] = val;
    if (inWorkout) mirrorRowToPlan(e, d.k, val); else markEdited();
    scheduleSave();
  },
  rowBool(d, el) {
    const e = sheetRow(ui.sheet);
    e[d.k] = el.checked;
    if (ui.sheet.i != null) mirrorRowToPlan(e, d.k, el.checked); else markEdited();
    scheduleSave();
  },
  mirror(d, el) { ui.mirrorPlan = el.checked; },
  dayName(d, el) { findDay(ui.sheet.id).name = el.value; markEdited(); scheduleSave(); },
  schedule(d, el) {
    if (el.value) state.program.schedule[d.d] = el.value; else delete state.program.schedule[d.d];
    markEdited();
    scheduleSave();
  },
  setting(d, el) { state.settings[d.k] = el.checked; scheduleSave(); },
  liftChart(d, el) { ui.liftChart = el.value; render(); },
  targetCheck() { refreshMacroSum(); },
};

/* ---------- Events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const fn = A[el.dataset.a];
  if (fn) fn(el.dataset, el);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-f]');
  if (el && FIELD[el.dataset.f]) FIELD[el.dataset.f](el.dataset, el);
});
document.addEventListener('change', async e => {
  if (e.target.id === 'restore-file' && e.target.files[0]) importFile(e.target.files[0]);
  if (e.target.id === 'scan-file' && e.target.files[0]) {
    toast('Reading barcode...');
    try {
      const code = await readBarcodeFromPhoto(e.target.files[0]);
      const food = await lookupBarcode(code);
      if (food) A.openSheet({ type: 'amount', foodId: rememberFood(food), slot: targetSlotAndDate().slot });
      else toast(`No product found for ${code}. Type its macros instead.`);
    } catch (err) {
      toast('No barcode found. Try again closer, with more light.');
    }
    e.target.value = '';
  }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id !== 'welcome-form') return;
  const w = num(v('w-weight'));
  if (w == null) { toast('Enter your weight'); return; }
  const start = today();
  state.profile = { ...state.profile, name: v('w-name').trim(), heightCm: num(v('w-height')), age: num(v('w-age')), sex: v('w-sex') || null, startDate: start };
  getDay(start).weight = round(w, 2);
  state.targetLog = [{ date: start, kcal: state.targets.kcal, protein: state.targets.protein, carbs: state.targets.carbs, fat: state.targets.fat, reason: 'Starting target' }];
  state.onboarded = true;
  haptic();
  commit();
  window.scrollTo(0, 0);
});
// Touch and drag on any chart to read values.
let chartEl = null;
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.chart');
  if (!el) return;
  chartEl = el;
  const c = ui.charts[el.dataset.chart];
  if (c?.bars) moveBarCursor(el, e.clientX); else moveCursor(el, e.clientX);
});
document.addEventListener('pointermove', e => {
  if (!chartEl) return;
  const c = ui.charts[chartEl.dataset.chart];
  if (c?.bars) moveBarCursor(chartEl, e.clientX); else moveCursor(chartEl, e.clientX);
});
const endChart = () => {
  if (!chartEl) return;
  const el = chartEl;
  chartEl = null;
  setTimeout(() => { if (ui.charts[el.dataset.chart]?.bars) el.querySelector('.c-tip').hidden = true; else hideCursor(el); }, 1800);
};
document.addEventListener('pointerup', endChart);
document.addEventListener('pointercancel', endChart);
window.addEventListener('resize', () => { if (state.onboarded && !document.activeElement?.matches('input,textarea,select')) render(); });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
  else {
    if (ui.openedOn !== today()) { ui.openedOn = today(); ui.foodDate = today(); ui.planDay = new Date().getDay(); }
    if (state.active) requestWake();
    if (!document.activeElement || document.activeElement === document.body) render();
  }
});
window.addEventListener('pagehide', flushSave);

/* ---------- Start ---------- */
async function boot() {
  const saved = await readSave();
  if (saved && (saved.v || 1) < 2) {
    // Keep an untouched copy of the old save before changing anything.
    try { if (idb) await idbPut('state-v1', saved); } catch (e) { /* the migrated copy still has everything */ }
  }
  state = migrate(saved) || defaultState();
  if (state.justUpgraded) ui.sheet = { type: 'profile' };
  if (state.active) ui.tab = 'train'; // reopened mid-workout: go straight back to it
  try { await navigator.storage?.persist?.(); } catch (e) { /* optional */ }
  render();
  if (saved && (saved.v || 1) < 2) writeSave();
  if (state.active) requestWake();
  if (state.onboarded) {
    // Fetch the database in the background so the first search is instant.
    setTimeout(() => Foods.start(), 1500);
  }
  // Skipped on localhost unless asked for, so edits show up without a stale copy in the way.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.search.includes('sw'))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
