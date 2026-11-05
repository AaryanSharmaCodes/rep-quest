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
async function readSave() {
  try {
    idb = await openDB();
    const saved = await idbGet('state');
    if (saved) return saved;
  } catch (e) { idb = null; }
  try { return JSON.parse(localStorage.getItem(DB_NAME)); } catch (e) { return null; }
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
  if (!ok) toast('Could not save. Export a backup from the You tab.');
  else Cloud.changed();
}
let saveTimer = null;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(writeSave, 150); }
function flushSave() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; writeSave(); } }

/* ---------- State ---------- */
const APP_VERSION = 6; // matches CACHE in sw.js
const THEMES = [
  { id: 'game', name: 'Quest', bar: '#170e33', fx: ['#b78eff', '#dfceff', '#ffffff', '#7f5cff'], shapes: ['star', 'circle'], burst: 1 },
  { id: 'light', name: 'Minimal', bar: '#f7f7f4', fx: ['#17171a', '#8a8a8e', '#c9c9c5'], shapes: ['circle'], burst: 0.6 },
  { id: 'dark', name: 'Dark', bar: '#0f0f11', fx: ['#ffffff', '#a1a1aa', '#52525b'], shapes: ['circle'], burst: 0.6 },
  { id: 'arcade', name: 'Arcade', bar: '#0b1026', fx: ['#ffe14d', '#ff3d81', '#29e6ff', '#7cff6b'], shapes: ['square'], burst: 1.2 },
];
function defaultState() {
  return {
    v: 2,
    onboarded: false,
    profile: { name: '', sex: null, age: null, heightCm: null, activity: 'moderate', startDate: null },
    goal: { mode: 'recomp', lo: GOALS.recomp.lo, hi: GOALS.recomp.hi },
    targets: { kcal: 2500, protein: 160, carbs: 300, fat: 70, sleep: 7.5, water: 3 },
    targetLog: [],
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
    settings: { usdaKey: '', sound: true, showRir: false, showWaist: false, theme: 'game', animations: true, place: 'gym', placeOn: null, homeGear: {} },
    lastBackup: null,
  };
}

// Old saves stay readable forever: every field is carried over, and the v1 copy is kept in the database.
function migrate(saved) {
  if (!saved) return null;
  if (saved.v >= 2) {
    const d = defaultState();
    return { ...d, ...saved, settings: { ...d.settings, ...saved.settings }, profile: { ...d.profile, ...saved.profile }, goal: { ...d.goal, ...saved.goal }, targets: { ...d.targets, ...saved.targets }, muscleGoal: { ...d.muscleGoal, ...saved.muscleGoal } };
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
  s.lastBackup = saved.lastBackup || null;
  return s;
}

let state = defaultState();
const ui = {
  tab: 'today', openedOn: today(), foodDate: today(), logDate: today(), planDay: new Date().getDay(), sheet: null, sheetStack: [],
  range: 90, rest: null, liftChart: null, lastCleared: {}, bars: {}, nums: {}, enter: true, searchToken: 0, foodIndex: {}, foodDb: { loaded: 0, total: 0, done: false },
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
function targetsOn(k) {
  let found = null;
  state.targetLog.forEach(x => { if (x.date <= k) found = x; });
  return found ? { ...state.targets, ...found } : state.targets;
}
function latestMetric(field, upTo = today()) {
  const keys = Object.keys(state.days).filter(k => k <= upTo && state.days[k][field] != null).sort();
  if (!keys.length) return null;
  const date = keys[keys.length - 1];
  return { date, v: state.days[date][field] };
}
function series(field, days = 90) {
  const from = days ? addDays(today(), -days) : '0000';
  return Object.keys(state.days).filter(k => k >= from && state.days[k][field] != null).sort().map(k => ({ date: k, v: state.days[k][field] }));
}
const latestWeight = () => latestMetric('weight')?.v ?? null;

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
