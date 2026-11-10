'use strict';

/* ---------- Feedback ---------- */
function toast(text, cls = '') {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = text;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2300);
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
// Climbs a little with each set of an exercise, so finishing one sounds like getting somewhere.
function playSetDone(n) { const f = 523 * 2 ** (Math.min(n, 8) * 2 / 12); tone(f, 0.09, 'triangle', 0.09); tone(f * 1.5, 0.14, 'sine', 0.05, 0.06); }
function playExerciseDone() { [523, 659, 784, 1047].forEach((f, n) => tone(f, 0.16, 'triangle', 0.08, n * 0.07)); }
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
const VIEWS = { today: viewToday, train: viewTrain, food: viewFood, micros: viewMicros, progress: viewProgress, you: viewYou };
function render() {
  const app = document.getElementById('app');
  const onWelcome = !state.onboarded;
  const entering = ui.enter;
  ui.enter = false;
  app.classList.remove('enter'); // a re-render mid-entrance must not replay it
  const html = onWelcome ? viewWelcome() : VIEWS[ui.tab]();
  const screen = onWelcome ? `setup-${ui.setup.step}-${!!ui.setup.calculating}-${guideSeen()}-${ui.guideOs}` : `${ui.tab}-${!!state.active}`;
  // Same screen: change only what changed. New screen: draw it fresh.
  if (!entering && ui.screen === screen && app.firstChild) Motion.morph(app, html);
  else app.innerHTML = html;
  ui.screen = screen;
  renderTabs(onWelcome);
  renderSheet();
  tickRest();
  tickClock();
  Motion.afterRender(app, entering);
}
// The bar stays in the page between renders, so its marker can slide from tab to tab.
const TAB_LIST = [['today', 'Today'], ['train', 'Train'], ['food', 'Food'], ['micros', 'Micros'], ['progress', 'Progress'], ['you', 'You']];
function renderTabs(onWelcome) {
  const el = document.getElementById('tabs');
  if (onWelcome) { el.innerHTML = ''; return; }
  if (!el.firstChild) el.innerHTML = `<i class="tab-ind"></i>${TAB_LIST.map(([id, l]) => `<button data-a="go" data-tab="${id}">${i(id)}<span>${l}</span></button>`).join('')}`;
  el.querySelector('.tab-ind').style.setProperty('--n', TAB_LIST.findIndex(t => t[0] === ui.tab));
  el.querySelectorAll('button').forEach(b => {
    const on = b.dataset.tab === ui.tab;
    b.classList.toggle('on', on);
    b.classList.toggle('live', b.dataset.tab === 'train' && !!state.active);
    b.classList.toggle('alert', b.dataset.tab === 'progress' && !!ui.coachAlert);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
}
function renderSheet() {
  const el = document.getElementById('sheet');
  const s = ui.sheet;
  document.body.classList.toggle('sheet-open', !!s);
  if (!s) {
    document.body.classList.remove('locked');
    if (!el.hidden) Motion.closeSheet(el, () => { if (!ui.sheet) { el.hidden = true; el.innerHTML = ''; } });
    return;
  }
  el.style.pointerEvents = '';
  const old = el.querySelector('.panel');
  const first = el.hidden || !!el.dataset.closing || !old;
  const sameSheet = !first && el.dataset.type === s.type;
  delete el.dataset.closing;
  el.hidden = false;
  el.dataset.type = s.type;
  // The page behind sinks back as the sheet rises, scaling around what you were looking at.
  if (first) document.getElementById('app').style.setProperty('--oy', `${window.scrollY + innerHeight * 0.4}px`);
  document.body.classList.add('locked');
  const tall = ['food', 'swap', 'addExercise', 'method', 'dayEdit', 'workout', 'lift', 'exercise', 'programs', 'schedule'].includes(s.type);
  const inner = SHEETS[s.type](s);
  if (first) {
    el.innerHTML = `<div class="scrim" data-a="closeAll"></div><div class="panel${tall ? ' tall' : ''} enter" role="dialog" aria-modal="true">${inner}</div>`;
  } else if (sameSheet) {
    Motion.morph(old, inner);
  } else {
    old.className = `panel${tall ? ' tall' : ''}`;
    old.innerHTML = inner;
    old.scrollTop = 0;
    Motion.sheetPush(old);
  }
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
  if (entry.mi === undefined && entry.source !== 'm') setTimeout(backfillMicros, 0);
}
function addToRecent(food) {
  state.recentFoods = [food, ...state.recentFoods.filter(f => f.id !== food.id)].slice(0, 40);
}
function compactFood(f) {
  return { id: f.id, name: f.name, brand: f.brand || '', kcal: f.kcal, p: f.p, c: f.c, f: f.f, servings: f.servings, src: f.src, mi: f.mi, mk: f.mk ?? f.kcal };
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
// A date in the past means logging a session after the fact. It sits at midday on that day, so history stays in order.
function startWorkout(day, date = today()) {
  const past = date !== today();
  const deload = !past && inDeload();
  const place = !past && atHome() && day ? 'home' : 'gym';
  // A home version isn't a plan row, so changes to it never touch the gym plan.
  const exercises = !day ? [] : place === 'home' ? rowsToActive(homeRows(day), deload).map(e => ({ ...e, planRow: undefined })) : rowsToActive(day.exercises, deload);
  state.active = { id: uid(), date, name: day ? day.name : 'Workout', dayId: day?.id || null, place, startedAt: past ? parseKey(date).getTime() : Date.now(), deload, exercises };
  ui.tab = 'train';
  ui.enter = true;
  requestWake();
  haptic();
  commit();
  window.scrollTo(0, 0);
}
// A workout picked from the list of other days, at the place chosen for it.
function startDayAt(id, place) {
  if (state.active && !confirm('You already have a workout running. Replace it?')) return;
  state.settings.place = place;
  state.settings.placeOn = today();
  ui.sheet = null;
  ui.sheetStack = [];
  startWorkout(findDay(id));
}
function targetsForSet(e, si) {
  const hist = exerciseHistory(state.workouts, e.name, 6);
  const n = nextFor(e, hist);
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
  const w = { id: a.id, date: a.date, name: a.name, dayId: a.dayId, place: a.place === 'home' ? 'home' : undefined, startedAt: a.startedAt, finishedAt: Date.now(), deload: a.deload || undefined, exercises, prs: [] };
  state.workouts.push(w);
  state.workouts.sort((x, y) => (x.startedAt || 0) - (y.startedAt || 0)); // a session logged late belongs on its own day
  recomputePRs();
  if (!state.profile.startDate || a.date < state.profile.startDate) state.profile.startDate = a.date;
  state.active = null;
  stopRest();
  releaseWake();
  if (a.date !== today()) { ui.tab = 'today'; ui.day = a.date; ui.enter = true; }
  ui.sheet = { type: 'summary', id: w.id };
  ui.sheetStack = [];
  if (w.prs.length) playBest(); else playClang();
  Motion.after(() => Motion.workoutDone(w.prs.length));
  refreshCoachAlert();
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
  if (!clock || !state.active) return;
  clock.textContent = state.active.date === today() ? `${Math.floor((Date.now() - state.active.startedAt) / 60000)} min` : `For ${niceDate(state.active.date)}`;
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

/* ---------- Restoring an old backup file ---------- */
async function importFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || !data.days || !(data.workouts || data.plan)) throw new Error('bad');
    if (state.onboarded && !confirm('Replace everything on this phone with this backup?')) return;
    state = migrate(data);
    state.onboarded = true;
    applyTheme(state.settings.theme);
    ui.sheet = null; ui.sheetStack = [];
    toast('Backup restored');
    commit();
  } catch (e) { toast('That file is not a Repsolute backup'); }
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
  go(d) {
    if (d.tab === ui.tab) {
      if (d.tab === 'today' && ui.day) { ui.day = null; haptic(); render(); }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    Motion.tabFrom(ui.tab, d.tab);
    ui.tab = d.tab;
    ui.foodDate = today();
    // Back from a day's food, you land on that day. Otherwise Today means today.
    ui.day = d.tab === 'today' ? ui.dayBack : null;
    ui.dayBack = null;
    if (d.tab === 'train') ui.planDay = new Date().getDay();
    ui.enter = true;
    if (d.tab === 'progress') ui.coachAlert = false;
    render();
    window.scrollTo(0, 0);
  },
  /* Any day's page */
  dayOpen(d) {
    ui.day = d.k === today() ? null : d.k;
    ui.dayBack = null;
    haptic();
    if (ui.tab !== 'today') { Motion.tabFrom(ui.tab, 'today'); ui.tab = 'today'; ui.enter = true; ui.foodDate = today(); }
    render();
    window.scrollTo(0, 0);
  },
  dayWeek(d) {
    const next = addDays(ui.day || today(), Number(d.by));
    ui.day = next >= today() ? null : next; // never past today by arrow: tap a day this week to look ahead
    haptic();
    render();
  },
  dayFood(d) {
    ui.dayBack = d.k;
    ui.foodDate = d.k;
    Motion.tabFrom(ui.tab, 'food');
    ui.tab = 'food';
    ui.enter = true;
    render();
    window.scrollTo(0, 0);
  },
  dayEntry(d) {
    ui.foodDate = d.k;
    A.openSheet({ type: 'entry', slot: d.slot, id: d.id });
  },
  foodToday() { ui.foodDate = today(); ui.dayBack = null; haptic(); render(); window.scrollTo(0, 0); },
  logPast(d) {
    if (state.active && !confirm('You already have a workout running. Replace it?')) return;
    ui.sheet = null;
    ui.sheetStack = [];
    startWorkout(d.id ? findDay(d.id) : null, d.k);
  },
  setFoodChart(d) { ui.foodChart = d.v; haptic(); render(); },
  toggleUi(d) { ui[d.k] = !ui[d.k]; haptic(); render(); },
  guideOs(d) { ui.guideOs = d.v; ui.enter = true; haptic(); render(); window.scrollTo(0, 0); },
  guideSheetOs(d) { ui.sheet.os = d.v; ui.sheet.q = null; haptic(); render(); },
  guideSkip() {
    try { localStorage.setItem('rq-guide-seen', '1'); } catch (e) { /* the guide just shows again next time */ }
    ui.enter = true;
    render();
    window.scrollTo(0, 0);
  },
  async installNow() {
    const prompt = ui.installEvent;
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    ui.installEvent = null;
    if (outcome === 'accepted') toast('Installed. Open Repsolute from your home screen.');
    render();
  },
  setupGo(d) { ui.setup.step = Number(d.n); ui.enter = true; haptic(); render(); window.scrollTo(0, 0); },
  setupBack() { A.setupGo({ n: ui.setup.step - 1 }); },
  setupPick(d) {
    ui.setup[d.k] = d.v;
    if (d.k === 'plan') ui.setup.planPicked = true;
    haptic(); render();
  },
  setupEdit() {
    ui.setup.editing = !ui.setup.editing;
    if (!ui.setup.editing) document.activeElement?.blur(); // updates skip the box in focus, so let go of it first
    haptic(); render();
    if (ui.setup.editing) document.getElementById('s-kcal')?.focus();
  },
  setupNext() {
    const s = ui.setup, weight = num(s.weight), height = num(s.height), age = num(s.age);
    if (s.step === 1) {
      if (weight == null || weight < 20 || weight > 400) { toast('Enter your weight in kg'); return; }
      if (height == null || height < 100 || height > 250) { toast('Enter your height in cm'); return; }
      if (age == null || age < 10 || age > 110) { toast('Enter your age'); return; }
      if (!s.sex) { toast('Choose one so the formula can work'); return; }
    }
    if (s.calculating) return;
    if (s.step === SETUP_STEPS - 1) {
      const profile = { heightCm: height, age, sex: s.sex, activity: s.activity };
      const t = suggestTargets(profile, weight, GOALS[s.goal]);
      Object.assign(s, t, { burn: Math.round(formulaTDEE(profile, weight) / 50) * 50, suggested: t.kcal, editing: false, calculating: true });
      ui.enter = true; haptic(); render(); window.scrollTo(0, 0);
      setTimeout(() => { if (ui.setup !== s) return; s.calculating = false; A.setupGo({ n: SETUP_STEPS }); }, CALC_MS);
      return;
    }
    // The plan page comes next: start beginners on the plan that suits them, unless they already chose.
    if (s.step === SETUP_STEPS - 2 && !s.planPicked) s.plan = s.level === 'beginner' ? 'fb3' : 'final';
    if (s.step < SETUP_STEPS) { A.setupGo({ n: s.step + 1 }); return; }
    const kcal = num(s.kcal), protein = num(s.protein), carbs = num(s.carbs), fat = num(s.fat);
    if ([kcal, protein, carbs, fat].some(x => x == null || x < 0)) { toast('Fill in every target'); return; }
    const start = today();
    state.profile = { ...state.profile, name: s.name.trim(), heightCm: height, age, sex: s.sex, activity: s.activity, level: s.level, startDate: start };
    state.goal = { mode: s.goal, lo: GOALS[s.goal].lo, hi: GOALS[s.goal].hi };
    state.program = makeProgram(s.plan);
    state.targets = { ...state.targets, kcal, protein, carbs, fat };
    state.targetLog = [{ date: start, kcal, protein, carbs, fat, reason: 'Starting target' }];
    getDay(start).weight = round(weight, 2);
    state.onboarded = true;
    ui.setup = freshSetup();
    ui.tab = 'today';
    ui.enter = true;
    haptic();
    Motion.after(() => Motion.floatMid("Let's go"));
    commit();
    window.scrollTo(0, 0);
  },
  cloudRetry() { Cloud.pull(); },
  homeInstead(d) { A.openSheet({ type: 'homeGear', id: d.id }); },
  toggleGear(d, el) {
    state.settings.homeGear[d.k] = !state.settings.homeGear[d.k];
    haptic();
    Motion.after(() => { Motion.pop(document.querySelector(`.gear-chip[data-k="${d.k}"]`), 1.06); Motion.stagger('.gear-preview > li'); });
    commit();
  },
  useHome() {
    state.settings.place = 'home';
    state.settings.placeOn = today();
    ui.sheet = null;
    ui.sheetStack = [];
    haptic();
    Motion.after(() => Motion.stagger('.plan-list > li'));
    commit();
  },
  backToGym() {
    state.settings.place = 'gym';
    haptic();
    Motion.after(() => Motion.stagger('.plan-list > li'));
    commit();
  },
  setTheme(d, el) { Motion.switchTheme(d.v, el); },
  cloudSignIn() { Cloud.signIn(); },
  async cloudSignOut() {
    if (!confirm('Sign out? Your data stays in your Google account and comes back when you sign in. It will be removed from this phone.')) return;
    if (!(await Cloud.signOut())) { toast('Could not reach your account, so you are still signed in. Nothing was lost.'); return; }
    ui.tab = 'today';
    ui.enter = true;
    ui.setup = freshSetup();
    commit();
  },
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
    Motion.pop(el);
  },
  weightDate(d) {
    ui.sheet.date = d.k;
    document.activeElement?.blur(); // updates skip the box in focus, and it must show this day's weight
    haptic(); render();
    document.querySelector('#sheet .panel')?.scrollTo({ top: 0, behavior: 'smooth' });
  },
  weightShowAll() { ui.sheet.showAll = true; haptic(); render(); },
  saveWeight(d) {
    const w = num(v('w-val'));
    if (w == null || w < 20 || w > 400) { toast('Enter a weight in kg'); return; }
    getDay(d.k).weight = round(w, 2);
    if (!state.profile.startDate) state.profile.startDate = d.k;
    ui.sheet = ui.sheetStack.pop() || null;
    haptic();
    Motion.after(() => Motion.floatMid(`${round(w, 2)} kg logged`));
    refreshCoachAlert();
    commit();
  },
  clearWeight(d) { delete getDay(d.k).weight; refreshCoachAlert(); closeSheet(); },
  logDay(d) { ui.sheet.date = addDays(ui.sheet.date || today(), Number(d.n)); render(); },
  async checkUpdate() {
    if (!swReg) { toast('Updates are off here'); return; }
    try {
      await swReg.update();
      toast(swReg.installing || swReg.waiting ? 'Update found, installing' : `You're on the latest version`);
    } catch (e) { toast('No connection, try again with signal'); }
  },
  waistUnit(d) {
    if (waistUnit() === d.v) return;
    const typed = waistToCm(num(v('wa-val')));
    state.settings.waistUnit = d.v === 'in' ? 'in' : 'cm';
    if (waistValid(typed)) ui.sheet.draft = typed;
    document.activeElement?.blur();
    commit(); haptic();
  },
  saveWaist() {
    const w = waistToCm(num(v('wa-val')));
    if (!waistValid(w)) { toast(`Enter your waist in ${waistUnit() === 'in' ? 'inches' : 'cm'}`); return; }
    getDay(today()).waist = w;
    haptic();
    closeSheet();
  },
  /* Check-ins with Claude */
  saveCheckInInputs() {
    const w = waistToCm(num(v('ci-waist')));
    const day = getDay(today());
    if (waistValid(w)) day.waist = w; else if (document.getElementById('ci-waist') && !v('ci-waist').trim()) delete day.waist;
    state.checkIn.notes = v('ci-notes') ?? state.checkIn.notes;
  },
  async copyCheckIn() {
    A.saveCheckInInputs();
    const text = checkInReport();
    commit();
    try {
      await navigator.clipboard.writeText(text);
      toast('Report copied. Paste it to Claude.');
    } catch (e) {
      if (navigator.share) { try { await navigator.share({ text }); return; } catch (err) { /* cancelled */ } }
      toast('Copy didn\'t work. Press and hold the report to select it.');
    }
    haptic();
  },
  finishCheckIn() {
    A.saveCheckInInputs();
    const s = checkInStatus();
    state.checkIn.done.push({ date: today(), kind: s.monthly ? 'monthly' : 'weekly', number: s.number });
    state.checkIn.notes = '';
    const next = checkInStatus();
    toast(`Check-in done. Next one ${DAY_NAMES[parseKey(next.due).getDay()]} ${shortDate(next.due)}.`);
    haptic();
    closeSheet();
  },
  saveLog(d) {
    const day = getDay(d.k);
    [['sleep', 'l-sleep'], ['water', 'l-water'], ['cardio', 'l-cardio'], ['waist', 'l-waist']].forEach(([key, id]) => {
      if (!document.getElementById(id)) return;
      const n = key === 'waist' ? waistToCm(num(v(id))) : num(v(id));
      if (n == null) delete day[key]; else day[key] = n;
    });
    const note = v('l-note').trim();
    if (note) day.note = note; else delete day.note;
    closeSheet();
  },

  /* Micronutrients and supplements */
  toggleSupp(d) {
    const day = getDay(d.k || today());
    const list = day.supps || [];
    day.supps = list.includes(d.id) ? list.filter(x => x !== d.id) : [...list, d.id];
    if (!day.supps.length) delete day.supps;
    haptic();
    commit();
  },
  allSupps(d) {
    getDay(d.k || today()).supps = state.supplements.map(s => s.id);
    haptic();
    toast('Supplements ticked');
    commit();
  },
  microRange(d) { ui.microRange = d.v; render(); },

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
    logEntry(date, slot, { name: f.name, ...m, grams: g, amount: f.servings[0]?.label || '100 g', source: f.src, mi: f.mi, mk: f.mk ?? f.kcal });
    addToRecent(compactFood(f));
    bumpAdded(parent);
    haptic();
    playTick();
    scheduleSave();
    const addedEl = document.getElementById('food-added');
    if (addedEl && parent) { addedEl.textContent = `${parent.added} added`; Motion.pop(addedEl); }
    Motion.foodAdded(el, m.kcal);
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
    const logged = macrosFor(f, grams);
    logEntry(date, slot, { name: f.name, ...logged, grams, amount, source: f.src, mi: f.mi, mk: f.mk ?? f.kcal });
    addToRecent(compactFood(f));
    bumpAdded(parent);
    ui.sheet = ui.sheetStack.pop() || null;
    haptic();
    playTick();
    Motion.after(() => Motion.floatMid(`+${fmt(logged.kcal)} kcal`));
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
    logEntry(date, slot, { name, kcal: total, p, c, f, amount: '1 serving', source: 'm', mi: '' });
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
  startAtGym(d) { startDayAt(d.id, 'gym'); },
  startAtHome(d) { startDayAt(d.id, 'home'); },
  startEmpty() { startWorkout(null); },
  startDeload() {
    state.deloadUntil = addDays(today(), 6);
    state.lastDeloadDate = today();
    toast('Lighter week started');
    commit();
  },
  endDeload() { state.deloadUntil = null; commit(); },
  toggleLoad(d) {
    const e = state.active.exercises[d.i];
    e.loaded = !e.loaded;
    if (!e.loaded) e.sets.forEach(s => { if (!s.done) s.w = ''; });
    haptic(); commit();
  },
  toggleSet(d) {
    const e = state.active.exercises[d.i], s = e.sets[d.j];
    if (s.done) { s.done = false; commit(); return; }
    const hint = targetsForSet(e, Number(d.j)), useHint = isWorking(s) && s.type !== 'drop';
    const blank = x => x === '' || x == null;
    const filled = (val, hinted, before) => (!blank(val) ? val : useHint && hinted != null ? hinted : blank(before) ? '' : before);
    const w = filled(s.w, hint.w, e.sets[d.j - 1]?.w), r = filled(s.r, hint.r, e.sets[d.j - 1]?.r);
    // Nothing is stored until the set is valid.
    if (!Number(r)) { toast(`Enter ${unitWord(e)} first`); return; }
    // A loaded exercise needs a weight on purpose: a stray 0 would become "last time" and steer every future target.
    if (w === '' && (e.inc ?? 0) > 0) { toast('Enter the weight first. Type 0 if you used none.'); return; }
    s.w = w === '' ? 0 : w;
    s.r = r;
    s.done = true;
    haptic();
    playTick();
    const now = { w: Number(s.w) || 0, r: Number(s.r) || 0 };
    const before = bestBefore(e.name);
    const score = setScore(now);
    let best = false;
    if (isWorking(s) && before > 0 && score > before + 0.001) {
      const seen = state.active.exercises.flatMap(x => (x.name === e.name ? x.sets.filter(y => y !== s && y.done) : [])).map(y => setScore({ w: Number(y.w) || 0, r: Number(y.r) || 0 }));
      if (!seen.some(x => x >= score)) { best = true; toast(`New best: ${setText(now, e.unit)}`, 'best'); playBest(); }
    }
    const moreInLinked = e.superset && d.i < state.active.exercises.length - 1;
    if (!moreInLinked) startRest(s.type === 'warmup' ? 60 : e.rest || 90);
    const finished = e.sets.every(x => x.done);
    const lastSets = exerciseHistory(state.workouts, e.name, 1)[0]?.sets.filter(isWorking) || [];
    const prevSet = isWorking(s) && s.type !== 'drop' ? lastSets[e.sets.slice(0, Number(d.j)).filter(x => isWorking(x) && x.type !== 'drop').length] : null;
    const beat = !!prevSet && score > setScore(prevSet) + 0.001;
    if (finished) playExerciseDone(); else if (!best) playSetDone(e.sets.filter(x => x.done).length - 1);
    Motion.after(() => Motion.setDone(d.i, d.j, { finished, best, beat, text: now.w ? `+${fmt(now.w * now.r)} kg` : `+${now.r} ${unitWord(e)}` }));
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
      if (state.active.place === 'home') state.homeChoice[old.swappedFrom || old.name] = d.name;
      state.active.exercises[s.i] = { ...row, id: old.id, planRow: planId, swappedFrom: old.swappedFrom || old.name, superset: old.superset, sets: old.sets.map(() => ({ w: '', r: '', done: false })) };
      if (ui.swapScope === 'plan' && planId) {
        state.program.days.forEach(day => { day.exercises = day.exercises.map(r => (r.id === planId ? { ...row, id: r.id, sets: r.sets } : r)); });
        state.active.exercises[s.i].swappedFrom = undefined;
        markEdited();
      }
      toast(state.active.place === 'home' ? 'Swapped, and remembered for home' : ui.swapScope === 'plan' ? 'Swapped and saved to your plan' : 'Swapped for today');
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
    if (state.active) {
      const logged = state.active.exercises.some(e => e.sets.some(x => x.done));
      if (logged && !confirm('Switch plans and discard this workout? The sets you logged will not be saved.')) return;
      state.active = null;
      stopRest();
      releaseWake();
    }
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
    ui.coachAlert = false;
    toast(`Target set to ${fmt(c.newKcal)} kcal`);
    commit();
  },
  setRange(d) { ui.range = Number(d.v); render(); },
  saveProfile() {
    const p = state.profile;
    p.heightCm = num(v('p-height')); p.age = num(v('p-age'));
    p.sex = v('p-sex') || null; p.activity = v('p-activity'); p.level = v('p-level') || null; p.name = v('p-name').trim();
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
    const next = { kcal: num(v('t-kcal')), protein: num(v('t-protein')), carbs: num(v('t-carbs')), fat: num(v('t-fat')), sleep: num(v('t-sleep')), water: num(v('t-water')) };
    if (Object.values(next).some(x => x == null || x < 0)) { toast('Fill in every target'); return; }
    const tue = num(v('t-tue-protein'));
    next.dayProtein = tue != null && tue >= 0 && tue !== next.protein ? { ...t.dayProtein, 2: tue } : (({ 2: _, ...rest }) => rest)(t.dayProtein || {});
    if (!state.targetLog.length) state.targetLog.push({ date: state.profile.startDate || addDays(today(), -14), kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, reason: 'Starting target' });
    if (next.kcal !== t.kcal) state.kcalChangedOn = today();
    state.targets = { ...t, ...next };
    if (before !== `${next.kcal}/${next.protein}/${next.carbs}/${next.fat}`) logTargets('Edited by you');
    closeSheet();
  },
  goalMode(d) { ui.sheet.mode = d.v; render(); },
  saveGoal(d) {
    const known = d.mode === state.goal.mode ? state.goal : GOALS[d.mode];
    const lo = d.mode === 'custom' ? num(v('g-lo').replace('−', '-')) : known.lo, hi = d.mode === 'custom' ? num(v('g-hi').replace('−', '-')) : known.hi;
    if (lo == null || hi == null || lo >= hi) { toast('The first number must be lower than the second'); return; }
    state.goal = { mode: d.mode, lo, hi };
    haptic();
    closeSheet();
  },
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
  setupField(d, el) { ui.setup[d.k] = el.value; },
  weightDay(d, el) { if (el.value && el.value <= today()) { ui.sheet.date = el.value; render(); } },
  setting(d, el) { state.settings[d.k] = el.checked; scheduleSave(); if (d.k === 'animations') Motion.refresh(); },
  liftChart(d, el) { ui.liftChart = el.value; render(); },
  targetCheck() { refreshMacroSum(); },
};

/* ---------- Events ---------- */
// iPhone Safari only shows :active press effects once the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });
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
    let code = null;
    try {
      code = await readBarcodeFromPhoto(e.target.files[0]);
      const food = await lookupBarcode(code);
      if (food) A.openSheet({ type: 'amount', foodId: rememberFood(food), slot: targetSlotAndDate().slot });
      else toast(`No product found for ${code}. Type its macros instead.`);
    } catch (err) {
      toast(code ? 'Could not look that product up. Check your connection.' : 'No barcode found. Try again closer, with more light.');
    }
    e.target.value = '';
  }
});
document.addEventListener('submit', e => e.preventDefault());
// Touch and drag on any chart to read values.
let chartEl = null, chartHide = null;
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.chart');
  if (!el) return;
  clearTimeout(chartHide); // an earlier tap's timer must not hide this one
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
  chartHide = setTimeout(() => { if (ui.charts[el.dataset.chart]?.bars) el.querySelector('.c-tip').hidden = true; else hideCursor(el); }, 2200);
};
document.addEventListener('pointerup', endChart);
document.addEventListener('pointercancel', endChart);
window.addEventListener('resize', () => { if (state.onboarded && !document.activeElement?.matches('input,textarea,select')) render(); });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { flushSave(); Cloud.pushNow(); }
  else {
    Cloud.pull();
    if (ui.openedOn !== today()) { ui.openedOn = today(); ui.foodDate = today(); ui.planDay = new Date().getDay(); ui.day = null; ui.dayBack = null; }
    if (state.active) requestWake();
    Foods.check();
    if (!document.activeElement || document.activeElement === document.body) render();
    swReg?.update().catch(() => {});
    applyUpdate();
    dailyQuote();
  }
});
window.addEventListener('pagehide', flushSave);

// A dot on the Progress tab when a check-in with Claude is due.
function refreshCoachAlert() {
  ui.coachAlert = state.onboarded && ui.tab !== 'progress' && checkInStatus().isDue;
}

/* ---------- Themes ---------- */
function applyTheme(id) {
  const theme = THEMES.find(t => t.id === id) || THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  try { localStorage.setItem('rq-theme', theme.id); } catch (e) { /* the inline script just falls back to the default */ }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme.bar);
}

/* ---------- App updates ---------- */
let swReg = null, updateReady = false;
// A new release has taken over. Reload now unless that would interrupt something.
function applyUpdate() {
  if (!updateReady || state.active || ui.sheet || ui.rest || document.activeElement?.matches('input,textarea,select')) return;
  updateReady = false;
  flushSave();
  location.reload();
}
function startUpdates() {
  const hadWorker = !!navigator.serviceWorker.controller; // false on a first install, which needs no reload
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadWorker) return;
    updateReady = true;
    applyUpdate();
  });
  navigator.serviceWorker.register('sw.js').then(reg => { swReg = reg; return reg.update(); }).catch(() => {});
}

/* ---------- Installing, and the quote of the day ---------- */
// Chrome on Android lets the app offer its own Install button.
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  ui.installEvent = e;
  if (!state.onboarded) render();
});
function dailyQuote() {
  const k = today();
  let seen = null;
  try { seen = localStorage.getItem('rq-quote-day'); } catch (e) { return; }
  // Never interrupt a workout, and let a Google sign-in land first.
  if (seen === k || state.active || location.hash.includes('id_token')) return;
  try { localStorage.setItem('rq-quote-day', k); } catch (e) { return; }
  Motion.quoteSplash(quoteFor(k), parseKey(k).toLocaleDateString('en-IN', { weekday: 'long' }), () => { ui.enter = true; render(); });
}

/* ---------- Start ---------- */
async function boot() {
  const saved = await readSave();
  if (saved && (saved.v || 1) < 2) {
    // Keep an untouched copy of the old save before changing anything.
    try { if (idb) await idbPut('state-v1', saved); } catch (e) { /* the migrated copy still has everything */ }
  }
  state = migrate(saved) || defaultState();
  applyTheme(state.settings.theme);
  Motion.refresh();
  refreshCoachAlert();
  if (state.justUpgraded) ui.sheet = { type: 'profile' };
  if (state.active) ui.tab = 'train'; // reopened mid-workout: go straight back to it
  try { await navigator.storage?.persist?.(); } catch (e) { /* optional */ }
  render();
  dailyQuote();
  if (saved && (saved.v || 1) < 2) writeSave();
  if (state.active) requestWake();
  Cloud.start();
  if (state.onboarded) {
    // Fetch the database in the background so the first search is instant.
    setTimeout(() => Foods.start(), 1500);
  }
  // Skipped on localhost unless asked for, so edits show up without a stale copy in the way.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.search.includes('sw'))) {
    startUpdates();
  }
}
boot();
