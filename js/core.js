'use strict';

const SLOTS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['preworkout', 'Pre-workout'], ['dinner', 'Dinner'], ['snack', 'Snacks']];

/* ---------- Saving: IndexedDB, with localStorage as a second copy ---------- */
const DB_NAME = 'rep-quest';
let idb = null;
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGet(key) {
  return new Promise((resolve, reject) => {
    const r = idb.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function idbPut(key, value) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
// Both copies are read and the newer one wins: if one of them stopped saving (a full localStorage,
// a dropped database), the stale copy must never be loaded over newer data.
async function readSave() {
  let fromDb = null, fromLs = null;
  try {
    idb = await openDB();
    fromDb = await idbGet('state');
  } catch (e) { idb = null; }
  try { fromLs = JSON.parse(localStorage.getItem(DB_NAME)); } catch (e) { fromLs = null; }
  if (fromDb && fromLs) return (fromLs.editedAt || 0) > (fromDb.editedAt || 0) ? fromLs : fromDb;
  return fromDb || fromLs;
}
async function writeSave() {
  const copy = clone(state);
  let ok = false;
  try {
    if (!idb) idb = await openDB();
    await idbPut('state', copy);
    ok = true;
  } catch (e) {
    // iOS can drop the database connection while the app is in the background.
    try { idb = await openDB(); await idbPut('state', copy); ok = true; } catch (e2) { idb = null; }
  }
  try { localStorage.setItem(DB_NAME, JSON.stringify(copy)); ok = true; } catch (e) { /* quota: IndexedDB still has it */ }
  if (!ok) toast('Could not save on this phone. Try freeing up some storage.');
  else Cloud.changed();
}
let saveTimer = null;
function scheduleSave() { if (state) state.editedAt = Date.now(); clearTimeout(saveTimer); saveTimer = setTimeout(writeSave, 150); }
function flushSave() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; writeSave(); } }

/* ---------- State ---------- */
const APP_VERSION = 24; // matches CACHE in sw.js
const THEMES = [
  { id: 'game', name: 'Quest', bar: '#170e33', fx: ['#b78eff', '#dfceff', '#ffffff', '#7f5cff'], shapes: ['star', 'circle'], burst: 1 },
  { id: 'light', name: 'Minimal', bar: '#f7f7f4', fx: ['#17171a', '#8a8a8e', '#c9c9c5'], shapes: ['circle'], burst: 0.6 },
  { id: 'dark', name: 'Dark', bar: '#0f0f11', fx: ['#ffffff', '#a1a1aa', '#52525b'], shapes: ['circle'], burst: 0.6 },
  { id: 'arcade', name: 'Arcade', bar: '#0b1026', fx: ['#ffe14d', '#ff3d81', '#29e6ff', '#7cff6b'], shapes: ['square'], burst: 1.2 },
];
// His daily supplements, from the labels (per serving).
const DEFAULT_SUPPLEMENTS = [
  { id: 'fishoil', name: 'Fish oil', detail: 'Citrus lemon, 2 softgels', kcal: 29.3, n: { o3: 1500, va: 840, vd: 15, ve: 10 }, extra: 'EPA 900 mg, DHA 600 mg, other omega-3 90 mg' },
  { id: 'magnesium', name: 'Magnesium glycinate', detail: 'Maginova, 2 tablets', kcal: 0.5, n: { mg: 440 }, extra: '2,000 mg magnesium glycinate = 440 mg magnesium' },
  { id: 'limcee', name: 'Limcee vitamin C', detail: '1 chewable tablet', kcal: 0, n: { vc: 500 }, extra: 'Vitamin C 500 mg' },
];
// Raised whenever the defaults change, so saved lists pick up additions once.
const SUPPLEMENTS_VERSION = 4;
// Only supplements that add vitamins, minerals or calories belong here (removed 11 Nov 2026).
const DROPPED_SUPPLEMENTS = ['glutathione', 'creatine'];
function defaultState() {
  return {
    v: 2,
    onboarded: false,
    profile: { name: '', sex: null, age: null, heightCm: null, activity: 'moderate', level: null, startDate: null },
    goal: { mode: 'recomp', lo: GOALS.recomp.lo, hi: GOALS.recomp.hi },
    // dayProtein overrides protein on one weekday (0 is Sunday): no meat or eggs on Tuesdays.
    targets: { kcal: 2825, protein: 160, carbs: 389, fat: 70, sleep: 7.5, water: 3, dayProtein: { 2: 120 } },
    targetLog: [],
    // Weekly check-ins with Claude replace the formula coach. Every 4th one is a monthly review.
    checkIn: { weekday: 0, start: null, done: [], notes: '' },
    // Ticked each day under Micros; their vitamins and minerals add to the day's food.
    supplements: clone(DEFAULT_SUPPLEMENTS),
    suppVersion: SUPPLEMENTS_VERSION,
    program: makeProgram('final'),
    muscleGoal: { lo: 10, hi: 20 },
    workouts: [],
    active: null,
    days: {},
    customFoods: [],
    customExercises: [],
    recentFoods: [],
    savedMeals: [],
    altPrefs: {},
    homeChoice: {},
    deloadUntil: null,
    dismissed: {},
    settings: { usdaKey: '', sound: true, showRir: false, showWaist: false, waistUnit: 'cm', theme: 'game', animations: true, place: 'gym', placeOn: null, homeGear: {} },
  };
}

// Old saves stay readable forever: every field is carried over, and the v1 copy is kept in the database.
function migrate(saved) {
  if (!saved) return null;
  if (saved.v >= 2) {
    const d = defaultState();
    // Older saves named the built-in plan after where it came from.
    if (saved.program?.key === 'final') saved.program.name = "Founder's plan";
    if (saved.program?.key === 'first') saved.program.name = "Founder's plan, earlier version";
    if (saved.programArchive?.final) saved.programArchive.final.name = "Founder's plan";
    const s = { ...d, ...saved, settings: { ...d.settings, ...saved.settings }, profile: { ...d.profile, ...saved.profile }, goal: { ...d.goal, ...saved.goal }, targets: { ...d.targets, ...saved.targets }, muscleGoal: { ...d.muscleGoal, ...saved.muscleGoal }, checkIn: { ...d.checkIn, ...saved.checkIn } };
    // Supplements added to the defaults after a save was made join its list once.
    if ((saved.suppVersion || 1) < SUPPLEMENTS_VERSION) {
      DEFAULT_SUPPLEMENTS.forEach(x => { if (!s.supplements.some(y => y.id === x.id)) s.supplements.push(clone(x)); });
      s.supplements = s.supplements.filter(x => !DROPPED_SUPPLEMENTS.includes(x.id));
      Object.values(s.days).forEach(d => {
        if (!d.supps) return;
        d.supps = d.supps.filter(id => !DROPPED_SUPPLEMENTS.includes(id));
        if (!d.supps.length) delete d.supps;
      });
      s.dismissed = { ...s.dismissed, creatine: true }; // he already takes it, so no tip suggesting it
      s.suppVersion = SUPPLEMENTS_VERSION;
    }
    // Repair (13 Nov 2026): no check-in has changed the plan yet, so every day from the plan's start is 2,825 kcal / 160 g.
    // Something later logged an older 2,500 target from Thursday 12 Nov on. Drop changes after the plan and restore it.
    if (saved.checkIn && !saved.targetsFixed && !(s.checkIn.done || []).length && s.onboarded) {
      const log = (s.targetLog || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const plan = log.filter(x => /start of weekly check-ins/.test(x.reason || '')).pop();
      if (plan) {
        s.targetLog = log.filter(x => x.date <= plan.date && (x.date < plan.date || x === plan));
        s.targets = { ...s.targets, kcal: plan.kcal, protein: plan.protein, carbs: plan.carbs, fat: plan.fat, dayProtein: { ...s.targets.dayProtein, 2: 120 } };
      }
      s.targetsFixed = true;
    }
    // The first check-in plan (9 Nov 2026): recomp at maintenance, 2,825 kcal and 160 g protein, 120 g on Tuesdays.
    if (!saved.checkIn) {
      const t = s.targets, fat = t.fat || 70;
      s.targets = { ...t, kcal: 2825, protein: 160, fat, carbs: Math.round((2825 - 160 * 4 - fat * 9) / 4), dayProtein: { 2: 120 } };
      s.goal = { mode: 'recomp', lo: GOALS.recomp.lo, hi: GOALS.recomp.hi };
      s.checkIn = { ...d.checkIn, start: today() };
      s.targetLog = (s.targetLog || []).filter(x => x.date !== today());
      // Past days keep being judged against what the target was then.
      if (!s.targetLog.length && s.onboarded) s.targetLog.push({ date: s.profile.startDate || addDays(today(), -14), kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, reason: 'Starting target' });
      if (s.onboarded) s.targetLog.push({ date: today(), kcal: s.targets.kcal, protein: 160, carbs: s.targets.carbs, fat, reason: 'Coach: start of weekly check-ins' });
      s.kcalChangedOn = today();
      s.targetsFixed = true;
    }
    return s;
  }
  const s = defaultState();
  s.onboarded = !!saved.onboarded;
  s.profile = { ...s.profile, name: saved.profile?.name || '', startDate: saved.profile?.startDate || null, oldStartWaist: saved.profile?.startWaist ?? null };
  s.targets = { ...s.targets, ...saved.targets };
  s.targetLog = (saved.targetLog || []).map(x => ({ ...x }));
  s.needsDetails = true;
  s.justUpgraded = true;

  const toRow = e => {
    const r = planRow(e.name, e.sets, e.lo, e.hi);
    const info = muscleInfo(e);
    return { ...r, p: info.p, s: info.s, kind: e.kind || r.kind, unit: e.unit || r.unit };
  };
  const days = [], schedule = {};
  Object.entries(saved.plan || {}).forEach(([weekday, p]) => {
    if (!p || !p.exercises || !p.exercises.length) return;
    const day = { id: uid(), name: p.name, exercises: p.exercises.map(toRow) };
    days.push(day);
    schedule[weekday] = day.id;
  });
  // Monday-first looks right in the day list.
  days.sort((a, b) => {
    const wd = id => WEEK_ORDER.indexOf(Number(Object.keys(schedule).find(k => schedule[k] === id)));
    return wd(a.id) - wd(b.id);
  });
  if (days.length) s.program = { key: 'mine', name: 'My plan', days, schedule };

  s.workouts = (saved.workouts || []).map(w => ({
    ...w,
    exercises: (w.exercises || []).map(e => {
      const info = muscleInfo(e);
      return { ...e, p: info.p, s: info.s, sets: (e.sets || []).map(x => ({ w: x.w, r: x.r })) };
    }),
  }));
  if (saved.active) {
    const dayId = schedule[parseKey(saved.active.date).getDay()] || null;
    s.active = {
      ...saved.active, dayId,
      exercises: saved.active.exercises.map(e => ({ ...toRow({ ...e, sets: e.sets.length }), sets: e.sets.map(x => ({ w: x.w, r: x.r, done: !!x.done })) })),
    };
  }
  s.days = saved.days || {};
  s.customFoods = saved.customFoods || [];
  s.recentFoods = saved.recentFoods || [];
  s.savedMeals = saved.savedMeals || [];
  s.settings = { ...s.settings, usdaKey: saved.settings?.usdaKey || '', sound: saved.settings?.sound ?? true };
  s.settings.showWaist = Object.values(s.days).some(d => d.waist != null);
  return s;
}

const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const guideSeen = () => { try { return localStorage.getItem('rq-guide-seen') === '1'; } catch (e) { return true; } };
const CALC_MS = 1800; // the short "calculating" pause before someone's targets appear
const freshSetup = () => ({ step: 0, name: '', weight: '', height: '', age: '', sex: '', goal: 'recomp', activity: 'moderate', level: 'beginner', plan: 'final', kcal: '', protein: '', carbs: '', fat: '' });
let state = defaultState();
const ui = {
  tab: 'today', openedOn: today(), foodDate: today(), logDate: today(), planDay: new Date().getDay(), sheet: null, sheetStack: [],
  range: 90, rest: null, day: null, dayBack: null, foodChart: 'kcal', showMuscles: false, showAllLifts: false, setup: freshSetup(), guideOs: null, installEvent: null, lastCleared: {}, bars: {}, nums: {}, enter: true, searchToken: 0, foodIndex: {}, foodDb: { loaded: 0, total: 0, done: false },
  charts: {}, swapScope: 'today', foodTab: 'all', fresh: true,
};

const peekDay = k => state.days[k] || {};
const getDay = k => (state.days[k] = state.days[k] || {});
const findDay = id => state.program.days.find(d => d.id === id) || null;
const plannedDay = k => { const id = state.program.schedule[parseKey(k).getDay()]; return id ? findDay(id) : null; };
const workoutsOn = k => state.workouts.filter(w => w.date === k);
// Home is chosen per day, so the normal workout is what shows up tomorrow.
const atHome = () => state.settings.place === 'home' && state.settings.placeOn === today();
const inDeload = () => !!state.deloadUntil && state.deloadUntil >= today();

function dayTotals(k) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, items: 0 };
  Object.values(peekDay(k).meals || {}).forEach(list => list.forEach(e => { t.kcal += e.kcal; t.p += e.p; t.c += e.c; t.f += e.f; t.items++; }));
  return t;
}
const sortedTargetLog = () => state.targetLog.map((x, n) => ({ x, n })).sort((a, b) => (a.x.date < b.x.date ? -1 : a.x.date > b.x.date ? 1 : a.n - b.n)).map(o => o.x);
function targetsOn(k) {
  // The newest change on or before this day wins, whatever order the log ended up in.
  let found = null;
  state.targetLog.forEach(x => { if (x.date <= k && (!found || x.date >= found.date)) found = x; });
  const base = found ? { ...state.targets, ...found } : state.targets;
  const dayP = state.targets.dayProtein?.[parseKey(k).getDay()];
  return dayP != null ? { ...base, protein: dayP } : base;
}
const isVegDay = k => state.targets.dayProtein?.[parseKey(k).getDay()] != null;
function latestMetric(field, upTo = today()) {
  const keys = Object.keys(state.days).filter(k => k <= upTo && state.days[k][field] != null).sort();
  if (!keys.length) return null;
  const date = keys[keys.length - 1];
  return { date, v: state.days[date][field] };
}
// Waist is always stored in cm; these show and read it in whichever unit he picked.
const waistUnit = () => state.settings.waistUnit === 'in' ? 'in' : 'cm';
const waistIn = cm => waistUnit() === 'in' ? round(cm / 2.54, 1) : round(cm, 1);
const waistText = cm => `${waistIn(cm)} ${waistUnit()}`;
const waistToCm = n => n == null ? null : waistUnit() === 'in' ? round(n * 2.54, 2) : round(n, 1);
const waistValid = cm => cm != null && cm >= 30 && cm <= 250;
function series(field, days = 90) {
  const from = days ? addDays(today(), -days) : '0000';
  return Object.keys(state.days).filter(k => k >= from && state.days[k][field] != null).sort().map(k => ({ date: k, v: state.days[k][field] }));
}
const latestWeight = () => latestMetric('weight')?.v ?? null;
// What to do next for an exercise. Beginners get a starting weight the first time they meet one.
function nextFor(e, history) {
  if (history.length || state.profile.level !== 'beginner') return suggestNext(e, history);
  const lib = libEntry(e.name);
  const w = startingWeight(lib, latestWeight(), state.profile.sex);
  return suggestNext(e, history, w ? { w, each: lib.equip === 'dumbbell' && !ONE_DUMBBELL.has(lib.name) } : null);
}

// Records a new calorie target. Only calorie and macro changes restart the coach's measuring window.
function logTargets(reason) {
  const t = state.targets;
  const entry = { date: today(), kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, reason: reason || 'Edited' };
  state.targetLog = state.targetLog.filter(x => x.date !== today());
  state.targetLog.push(entry);
}
function lastCalorieChange() {
  if (state.kcalChangedOn) return state.kcalChangedOn;
  const log = state.targetLog;
  for (let i = log.length - 1; i > 0; i--) {
    if (log[i].kcal !== log[i - 1].kcal) return log[i].date;
  }
  return null;
}
function coachNow() {
  const days = Object.keys(state.days).sort().map(date => {
    const d = state.days[date], t = dayTotals(date);
    return { date, weight: d.weight ?? null, kcal: t.items ? t.kcal : 0 };
  });
  return runCoach({ today: today(), days, workouts: state.workouts, targets: state.targets, goal: state.goal, profile: state.profile, lastChange: lastCalorieChange() });
}

/* ---------- Quests for one day ---------- */
function questsFor(k) {
  const d = peekDay(k), t = dayTotals(k), tg = targetsOn(k);
  const planned = plannedDay(k), trained = workoutsOn(k).length > 0;
  const restDay = !planned && !trained;
  const done = {
    train: trained || restDay,
    protein: t.p >= tg.protein - 5,
    calories: t.items > 0 && Math.abs(t.kcal - tg.kcal) <= 150,
    weigh: d.weight != null,
  };
  return QUESTS.map(q => ({ ...q, done: done[q.id] }));
}
function dayCounts(k) {
  // A rest day's free quest alone doesn't keep a streak alive: something has to be logged.
  const d = peekDay(k), t = dayTotals(k);
  const logged = d.weight != null || t.items > 0 || workoutsOn(k).length > 0;
  return logged && questsFor(k).filter(q => q.done).length >= 3;
}
function computeStats() {
  let xp = 0, volume = 0, sets = 0, prs = 0, clearedDays = 0;
  Object.keys(state.days).forEach(k => {
    if (k > today()) return;
    const d = state.days[k], t = dayTotals(k);
    const logged = d.weight != null || t.items > 0;
    if (!logged) return;
    const quests = questsFor(k);
    xp += dayXp(quests.filter(q => q.done));
    if (quests.every(q => q.done)) clearedDays++;
  });
  state.workouts.forEach(w => {
    prs += (w.prs || []).length;
    xp += 100 + (w.prs || []).length * 50;
    w.exercises.forEach(e => e.sets.forEach(s => { if (isWorking(s)) { sets++; volume += (s.w || 0) * (s.r || 0); } }));
  });
  let streak = 0, cursor = today();
  if (!dayCounts(cursor)) cursor = addDays(cursor, -1); // today isn't over yet, so it can't break a streak
  while (dayCounts(cursor)) { streak++; cursor = addDays(cursor, -1); }
  return { xp, volume, sets, prs, clearedDays, streak, workouts: state.workouts.length, ...levelFor(xp) };
}

const MILESTONES = [
  ['First session', 'Finish a workout', s => s.workouts >= 1],
  ['New best', 'Beat a personal best', s => s.prs >= 1],
  ['All clear', 'Clear every quest in a day', s => s.clearedDays >= 1],
  ['Ten sessions', '10 workouts', s => s.workouts >= 10],
  ['Week straight', '7-day streak', s => s.streak >= 7],
  ['Ten tonnes', 'Lift 10,000 kg in total', s => s.volume >= 10000],
  ['Fifty sessions', '50 workouts', s => s.workouts >= 50],
  ['Month straight', '30-day streak', s => s.streak >= 30],
  ['100 tonnes', 'Lift 100,000 kg in total', s => s.volume >= 100000],
  ['Twelve weeks', 'Stay on it for 12 weeks', () => !!state.profile.startDate && daysBetween(state.profile.startDate, today()) >= 84],
];
