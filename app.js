'use strict';

/* ---------- Small helpers ---------- */
const pad = n => String(n).padStart(2, '0');
// Local dates on purpose: toISOString() is UTC and would roll over at 5:30 am in India.
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
const today = () => dateKey();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const round = (n, p = 0) => { const f = 10 ** p; return Math.round(n * f) / f; };
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const fmt = n => Math.round(n).toLocaleString('en-IN');
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const clone = o => JSON.parse(JSON.stringify(o));
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PICK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function niceDate(k) {
  if (k === today()) return 'Today';
  if (k === addDays(today(), -1)) return 'Yesterday';
  return parseKey(k).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
const weekStart = k => { const d = parseKey(k); return addDays(k, -((d.getDay() + 6) % 7)); };

const SLOTS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['preworkout', 'Pre-workout'], ['dinner', 'Dinner'], ['snack', 'Snack']];
const MUSCLES = [['shoulders', 'Shoulders'], ['chest', 'Chest'], ['back', 'Back'], ['arms', 'Arms'], ['legs', 'Legs'], ['core', 'Core']];
const REST_SECONDS = { compound: 150, isolation: 75 };

const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M12 3l2.7 5.8 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3.1 1.2-6.2L3 9.600l6.300-.8z"/></svg>',
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M8 12h8M5 7.500v9M8 6v12M16 6v12M19 7.500v9M2.500 10v4M21.500 10v4"/></svg>',
  fuel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21v-7h-3V8c0-3 1.500-5 3-5z"/></svg>',
  body: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M8 9a5.500 5.500 0 0 1 8 0l-2.500 2.500h-3zM12 11.500l1.500-3"/></svg>',
  hero: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M12 3l7.500 2.800v5.700c0 4.500-3 7.700-7.500 9.500-4.500-1.800-7.500-5-7.500-9.500V5.800z"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="#1b2230" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4.500 4.500L19 7"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="#ff5d47" stroke="#1b2230" stroke-width="2.200" stroke-linejoin="round"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 1.500-4.500 2.500-6 .5 2 1.500 2.500 2 2.500C11 8 10.500 5 12 2z"/></svg>',
};

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
async function readSave() {
  try {
    idb = await openDB();
    const saved = await new Promise((resolve, reject) => {
      const r = idb.transaction('kv').objectStore('kv').get('state');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (saved) return saved;
  } catch (e) { idb = null; }
  try { return JSON.parse(localStorage.getItem(DB_NAME)); } catch (e) { return null; }
}
function writeIDB(json) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(json, 'state');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function writeSave() {
  const copy = clone(state);
  let ok = false;
  try {
    if (!idb) idb = await openDB();
    await writeIDB(copy);
    ok = true;
  } catch (e) {
    // iOS can drop the database connection while the app is in the background.
    try { idb = await openDB(); await writeIDB(copy); ok = true; } catch (e2) { idb = null; }
  }
  try { localStorage.setItem(DB_NAME, JSON.stringify(copy)); ok = true; } catch (e) { /* quota: IndexedDB still has it */ }
  if (!ok) toast('Could not save. Export a backup from the Hero tab.');
}
let saveTimer = null;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(writeSave, 150); }
function flushSave() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; writeSave(); } }

/* ---------- State ---------- */
function defaultState() {
  return {
    v: 1,
    onboarded: false,
    profile: { name: '', startWaist: null, goalWaist: null, startDate: null },
    targets: { kcal: 2500, protein: 160, carbs: 300, fat: 70, steps: 8000, sleep: 7.5, water: 3 },
    targetLog: [],
    plan: clone(DEFAULT_PLAN),
    workouts: [],
    active: null,
    days: {},
    customFoods: [],
    recentFoods: [],
    savedMeals: [],
    settings: { usdaKey: '', sound: true },
    lastBackup: null,
  };
}
let state = defaultState();
const ui = { tab: 'home', openedOn: today(), fuelDate: today(), bodyDate: today(), planDay: new Date().getDay(), sheet: null, foodIndex: {}, lastXP: null, lastLevel: null, rest: null, bossHit: false, searchToken: 0 };

const peekDay = k => state.days[k] || {};
const getDay = k => (state.days[k] = state.days[k] || {});
const planFor = k => { const p = state.plan[parseKey(k).getDay()]; return p && p.exercises.length ? p : null; };
const workoutsOn = k => state.workouts.filter(w => w.date === k);

function dayTotals(k) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, items: 0 };
  const meals = peekDay(k).meals || {};
  Object.values(meals).forEach(list => list.forEach(e => { t.kcal += e.kcal; t.p += e.p; t.c += e.c; t.f += e.f; t.items++; }));
  return t;
}
function targetsOn(k) {
  let found = null;
  state.targetLog.forEach(x => { if (x.date <= k) found = x; });
  return found || state.targetLog[0] || state.targets;
}
function latestMetric(field, upTo = today()) {
  const keys = Object.keys(state.days).filter(k => k <= upTo && state.days[k][field] != null).sort();
  if (!keys.length) return null;
  const date = keys[keys.length - 1];
  return { date, v: state.days[date][field] };
}
function series(field, days = 90) {
  const from = addDays(today(), -days);
  return Object.keys(state.days).filter(k => k >= from && state.days[k][field] != null).sort().map(k => ({ date: k, v: state.days[k][field] }));
}

/* ---------- Game layer. All XP is worked out from your logs, so deleting a log can't leave stale points. ---------- */
const setScore = s => (s.w > 0 ? s.w * (1 + s.r / 30) : s.r); // estimated one-rep max
const workoutXP = w => 100 + w.exercises.reduce((n, e) => n + e.sets.length, 0) * 5 + (w.prs || []).length * 50;

function questsFor(k) {
  const d = peekDay(k), t = dayTotals(k), tg = targetsOn(k), plan = planFor(k), now = state.targets;
  const quests = [];
  if (plan) quests.push({ id: 'train', label: `Finish ${plan.name}`, done: workoutsOn(k).length > 0, tab: 'train' });
  quests.push(
    { id: 'protein', label: `Eat ${tg.protein} g protein`, note: `${Math.round(t.p)} g`, done: t.p >= tg.protein - 5, tab: 'fuel' },
    { id: 'kcal', label: `Land near ${fmt(tg.kcal)} kcal`, note: `${fmt(t.kcal)}`, done: t.kcal > 0 && Math.abs(t.kcal - tg.kcal) <= 150, tab: 'fuel' },
    { id: 'weigh', label: 'Log morning weight', note: d.weight != null ? `${d.weight} kg` : '', done: d.weight != null, tab: 'body' },
    { id: 'steps', label: `Walk ${fmt(now.steps)} steps`, note: d.steps != null ? fmt(d.steps) : '', done: (d.steps || 0) >= now.steps, tab: 'body' },
    { id: 'sleep', label: `Sleep ${now.sleep} hours`, note: d.sleep != null ? `${d.sleep} h` : '', done: (d.sleep || 0) >= now.sleep, tab: 'body' },
    { id: 'water', label: `Drink ${now.water} litres`, note: `${d.water || 0} L`, done: (d.water || 0) >= now.water, tab: 'body' },
  );
  return quests;
}
function levelInfo(xp) {
  let level = 1, need = 500, left = xp;
  while (left >= need) { left -= need; level++; need = 500 + (level - 1) * 250; }
  return { level, into: left, need };
}
const TITLES = ['Rookie', 'Regular', 'Grinder', 'Plate Collector', 'Iron Apprentice', 'Set Slayer', 'Delt Hunter', 'Iron Veteran', 'Gym Legend', 'Mythic Lifter'];

function computeStats() {
  let xp = 0, sets = 0, prs = 0, volume = 0, perfectDays = 0, proteinDays = 0;
  const muscleAll = Object.fromEntries(MUSCLES.map(([m]) => [m, 0]));
  const muscleWeek = Object.fromEntries(MUSCLES.map(([m]) => [m, 0]));
  const thisWeek = weekStart(today());
  state.workouts.forEach(w => {
    xp += workoutXP(w);
    prs += (w.prs || []).length;
    w.exercises.forEach(e => e.sets.forEach(s => {
      sets++;
      volume += (s.w || 0) * (s.r || 0);
      if (muscleAll[e.muscle] != null) {
        muscleAll[e.muscle]++;
        if (w.date >= thisWeek) muscleWeek[e.muscle]++;
      }
    }));
  });
  const waistWeeks = new Set(), cardioWeeks = {};
  Object.keys(state.days).forEach(k => {
    const quests = questsFor(k), done = quests.filter(q => q.done).length;
    xp += done * 15;
    if (done === quests.length) { xp += 50; perfectDays++; }
    if (quests.find(q => q.id === 'protein')?.done) proteinDays++;
    const d = state.days[k];
    if (d.waist != null) waistWeeks.add(weekStart(k));
    if ((d.cardio || 0) >= 20) { const wk = weekStart(k); cardioWeeks[wk] = (cardioWeeks[wk] || 0) + 1; }
  });
  xp += waistWeeks.size * 40;
  xp += Object.values(cardioWeeks).reduce((n, c) => n + Math.min(c, 3) * 25, 0);

  let streak = 0, cursor = today();
  const scored = k => questsFor(k).filter(q => q.done).length >= 3;
  if (!scored(cursor)) cursor = addDays(cursor, -1); // today isn't over yet, so it can't break a streak
  while (state.days[cursor] && scored(cursor)) { streak++; cursor = addDays(cursor, -1); }

  const lv = levelInfo(xp);
  const muscleLv = m => Math.floor(Math.sqrt(muscleAll[m] / 6)) + 1;
  return { xp, sets, prs, volume, perfectDays, proteinDays, streak, muscleAll, muscleWeek, muscleLv, workouts: state.workouts.length, ...lv, title: TITLES[Math.min(Math.floor((lv.level - 1) / 3), TITLES.length - 1)] };
}
function bossInfo() {
  const p = state.profile;
  if (!p.startWaist || !p.goalWaist || p.goalWaist >= p.startWaist) return null;
  const latest = latestMetric('waist')?.v ?? p.startWaist;
  const max = p.startWaist - p.goalWaist;
  const hp = clamp(latest - p.goalWaist, 0, max);
  return { hp, max, ratio: hp / max, latest };
}
const BADGES = [
  ['First Blood', 'Finish a workout', s => s.workouts >= 1],
  ['New Record', 'Beat a personal best', s => s.prs >= 1],
  ['Ten Down', '10 workouts', s => s.workouts >= 10],
  ['Fifty Club', '50 workouts', s => s.workouts >= 50],
  ['Hot Streak', '7-day streak', s => s.streak >= 7],
  ['Month Strong', '30-day streak', s => s.streak >= 30],
  ['Protein Pro', '30 protein days', s => s.proteinDays >= 30],
  ['Perfect Day', 'Clear every quest', s => s.perfectDays >= 1],
  ['Ten Tonnes', 'Lift 10,000 kg total', s => s.volume >= 10000],
  ['Boss Hit', 'Lose 1 cm off your waist', () => { const b = bossInfo(); return !!b && b.max - b.hp >= 1; }],
  ['Boss Down', 'Reach your waist goal', () => { const b = bossInfo(); return !!b && b.hp === 0; }],
  ['Twelve Weeks', '12 weeks on the plan', () => !!state.profile.startDate && (parseKey(today()) - parseKey(state.profile.startDate)) / 864e5 >= 84],
];

/* ---------- Drawings ---------- */
function heroSVG(stats) {
  const b = bossInfo();
  const belly = b ? 25 + b.ratio * 7 : 28;
  const sh = 29 + Math.min(stats.muscleLv('shoulders') + stats.muscleLv('chest') + stats.muscleLv('back') - 3, 15) * 1.1;
  const arm = 9 + Math.min(stats.muscleLv('arms') - 1, 7) * 1.1;
  const leg = 12 + Math.min(stats.muscleLv('legs') - 1, 7) * 1.1;
  const skin = '#e3aa7c', ink = '#1b2230';
  const limb = (d, w, c) => `<path d="${d}" stroke="${ink}" stroke-width="${w + 5}" stroke-linecap="round" fill="none"/><path d="${d}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
  return `<svg viewBox="0 0 120 150" role="img" aria-label="Your hero">
    ${limb('M47 104L44 136', leg, skin)}${limb('M73 104L76 136', leg, skin)}
    ${limb(`M${60 - sh} 57L${58 - sh} 84L${48 - sh} 96`, arm, skin)}${limb(`M${60 + sh} 57L${62 + sh} 84L${72 + sh} 96`, arm, skin)}
    <path d="M${60 - sh} 52Q60 42 ${60 + sh} 52L${60 + belly * .95} 86Q${60 + belly * 1.05} 100 ${60 + belly * .85} 106H${60 - belly * .85}Q${60 - belly * 1.05} 100 ${60 - belly * .95} 86Z" fill="#ff5d47" stroke="${ink}" stroke-width="2.800" stroke-linejoin="round"/>
    <path d="M${60 - belly * .86} 102H${60 + belly * .86}L${60 + belly * .95} 118H64L60 110L56 118H${60 - belly * .95}Z" fill="#1b2230"/>
    <circle cx="60" cy="27" r="16" fill="${skin}" stroke="${ink}" stroke-width="2.800"/>
    <path d="M44.500 23Q60 17 75.500 23L75.500 29Q60 23 44.500 29Z" fill="#fff6df" stroke="${ink}" stroke-width="2"/>
    <circle cx="54" cy="33" r="2.200" fill="${ink}"/><circle cx="66" cy="33" r="2.200" fill="${ink}"/>
    <path d="M55 38.500Q60 42.500 65 38.500" stroke="${ink}" stroke-width="2.200" fill="none" stroke-linecap="round"/>
  </svg>`;
}
function bossSVG(ratio) {
  const s = 0.55 + ratio * 0.45;
  return `<svg viewBox="0 0 100 100" role="img" aria-label="Belly Boss"><g transform="translate(50 54) scale(${s}) translate(-50 -54)">
    <path d="M50 12C78 12 94 34 92 58C90 82 72 92 50 92C28 92 10 82 8 58C6 34 22 12 50 12Z" fill="#ff5d47" stroke="#1b2230" stroke-width="5"/>
    <path d="M28 36L44 44M72 36L56 44" stroke="#1b2230" stroke-width="5" stroke-linecap="round"/>
    <circle cx="36" cy="50" r="6" fill="#fff6df" stroke="#1b2230" stroke-width="3"/><circle cx="64" cy="50" r="6" fill="#fff6df" stroke="#1b2230" stroke-width="3"/>
    <circle cx="37" cy="51" r="2.200" fill="#1b2230"/><circle cx="63" cy="51" r="2.200" fill="#1b2230"/>
    ${ratio > 0 ? '<path d="M36 72Q50 62 64 72" stroke="#1b2230" stroke-width="5" fill="none" stroke-linecap="round"/>' : '<path d="M34 68L44 76M44 68L34 76M56 68L66 76M66 68L56 76" stroke="#1b2230" stroke-width="4" stroke-linecap="round"/>'}
  </g></svg>`;
}
const badgeSVG = won => `<svg viewBox="0 0 40 40"><path d="M20 3l14 6v10c0 8-6 14-14 18C12 33 6 27 6 19V9z" fill="${won ? '#ff5d47' : '#cdbd97'}" stroke="#1b2230" stroke-width="2.500" stroke-linejoin="round"/><path d="M20 11l2.600 5.400 5.900.8-4.300 4.100 1 5.900-5.200-2.800-5.200 2.800 1-5.900-4.300-4.100 5.900-.8z" fill="${won ? '#ffc933' : '#f6e8c6'}" stroke="#1b2230" stroke-width="1.500" stroke-linejoin="round"/></svg>`;

function lineChart(points, { unit = '', showAvg = false, height = 130 } = {}) {
  if (points.length < 2) return '<p class="muted">Log this on two different days to see your trend.</p>';
  const W = 340, H = height, L = 38, R = 8, T = 10, B = 22;
  const t0 = parseKey(points[0].date), t1 = parseKey(points[points.length - 1].date);
  const span = Math.max(1, t1 - t0);
  const vals = points.map(p => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1) { const m = (hi + lo) / 2; lo = m - .5; hi = m + .5; }
  const x = d => L + ((parseKey(d) - t0) / span) * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = points.map(p => `${round(x(p.date), 1)},${round(y(p.v), 1)}`).join(' ');
  let trend = '';
  if (showAvg) {
    const smooth = points.map(p => {
      const near = points.filter(q => q.date <= p.date && q.date > addDays(p.date, -7)).map(q => q.v);
      return `${round(x(p.date), 1)},${round(y(avg(near)), 1)}`;
    }).join(' ');
    trend = `<polyline points="${smooth}" fill="none" stroke="#ff5d47" stroke-width="3.500" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  const label = d => parseKey(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend from ${vals[0]} to ${vals[vals.length - 1]} ${esc(unit)}">
    <line x1="${L}" x2="${W - R}" y1="${y(hi)}" y2="${y(hi)}" stroke="#cdbd97" stroke-dasharray="4 4"/>
    <line x1="${L}" x2="${W - R}" y1="${y(lo)}" y2="${y(lo)}" stroke="#cdbd97" stroke-dasharray="4 4"/>
    <text x="${L - 5}" y="${y(hi) + 4}" text-anchor="end" font-size="11" font-weight="800" fill="#5d5a55">${round(hi, 1)}</text>
    <text x="${L - 5}" y="${y(lo) + 4}" text-anchor="end" font-size="11" font-weight="800" fill="#5d5a55">${round(lo, 1)}</text>
    <text x="${L}" y="${H - 5}" font-size="11" font-weight="800" fill="#5d5a55">${label(points[0].date)}</text>
    <text x="${W - R}" y="${H - 5}" text-anchor="end" font-size="11" font-weight="800" fill="#5d5a55">${label(points[points.length - 1].date)}</text>
    <polyline points="${pts}" fill="none" stroke="${showAvg ? '#7a9b9b' : '#0b3a44'}" stroke-width="${showAvg ? 2 : 3.500}" stroke-linejoin="round" stroke-linecap="round"/>
    ${trend}
    <circle cx="${x(points[points.length - 1].date)}" cy="${y(vals[vals.length - 1])}" r="5" fill="#ffc933" stroke="#1b2230" stroke-width="2.500"/>
  </svg>`;
}
function kcalBars() {
  const keys = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13));
  const vals = keys.map(k => dayTotals(k).kcal);
  if (!vals.some(Boolean)) return '<p class="muted">Log food to see your last two weeks here.</p>';
  const W = 340, H = 120, T = 8, B = 20, target = state.targets.kcal;
  const max = Math.max(target * 1.2, ...vals);
  const bw = (W - 8) / 14;
  const y = v => T + (1 - v / max) * (H - T - B);
  const bars = vals.map((v, i) => {
    const ok = Math.abs(v - targetsOn(keys[i]).kcal) <= 150;
    return v ? `<rect x="${4 + i * bw + 2}" y="${y(v)}" width="${bw - 4}" height="${H - B - y(v)}" rx="3" fill="${ok ? '#36d39b' : '#ffc933'}" stroke="#1b2230" stroke-width="1.500"/>` : '';
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories over the last 14 days">${bars}
    <line x1="4" x2="${W - 4}" y1="${y(target)}" y2="${y(target)}" stroke="#ff5d47" stroke-width="2.500" stroke-dasharray="6 4"/>
    <text x="4" y="${H - 5}" font-size="11" font-weight="800" fill="#5d5a55">14 days ago</text>
    <text x="${W - 4}" y="${H - 5}" text-anchor="end" font-size="11" font-weight="800" fill="#5d5a55">Today · target ${fmt(target)}</text></svg>`;
}

/* ---------- Calorie coach: the plan's adjustment rules, applied to your actual trend ---------- */
function weightAvg(fromBack, toBack) {
  const vals = [];
  for (let i = fromBack; i <= toBack; i++) { const v = peekDay(addDays(today(), -i)).weight; if (v != null) vals.push(v); }
  return vals.length >= 3 ? avg(vals) : null;
}
function coach() {
  const weights = series('weight', 3650);
  const first = weights[0]?.date;
  const daysIn = first ? Math.round((parseKey(today()) - parseKey(first)) / 864e5) + 1 : 0;
  const recent = weightAvg(0, 6), prior = weightAvg(7, 13);
  const weekly = recent != null && prior != null ? recent - prior : null;

  const foodDays = Array.from({ length: 14 }, (_, i) => dayTotals(addDays(today(), -i)).kcal).filter(Boolean);
  const avgKcal = avg(foodDays);
  const maintenance = weekly != null && foodDays.length >= 10 ? Math.round((avgKcal - (weekly * 7700) / 7) / 10) * 10 : null;

  const waists = series('waist', 3650);
  const lastWaist = waists[waists.length - 1];
  let waistDelta = null;
  if (lastWaist) {
    const old = [...waists].reverse().find(w => w.date <= addDays(lastWaist.date, -14));
    if (old) waistDelta = lastWaist.v - old.v;
  }
  const recentPR = state.workouts.some(w => w.date >= addDays(today(), -21) && (w.prs || []).length);
  const base = { weekly, waistDelta, maintenance, avgKcal, foodDays: foodDays.length, delta: 0 };

  if (daysIn < 21) return { ...base, title: `Baseline: day ${daysIn} of 21`, body: 'Eat your target consistently and weigh in each morning. The coach needs 3 weeks of data before judging anything.' };
  const lastChange = [...state.targetLog].reverse().find((x, i, log) => log[i + 1] && log[i + 1].kcal !== x.kcal)?.date;
  if (lastChange && lastChange > addDays(today(), -21)) return { ...base, title: 'Hold steady', body: 'You changed your target within the last 3 weeks. Give it the full 3 weeks before changing it again.' };
  if (weekly == null || waistDelta == null) return { ...base, title: 'Need more check-ins', body: 'To make a call, the coach needs 3 weigh-ins in each of the last 2 weeks and two waist measurements at least 14 days apart.' };

  if (weekly > 0.25 && waistDelta >= 0.5) {
    if (state.targets.kcal <= 2100) return { ...base, title: 'Check tracking first', body: 'Weight and waist are rising, but your target is already low. Check your portions and step count before cutting further.' };
    return { ...base, delta: -150, title: 'Drop 150 kcal', body: 'Your weight and waist are both climbing. A small cut should bring your waist back down.' };
  }
  if (weekly < -0.5 && !recentPR) return { ...base, delta: 150, title: 'Add 150 kcal', body: 'Your weight is dropping quickly and you have no new personal best in 3 weeks. Extra carbs should help your training.' };
  if (waistDelta <= -0.5) return { ...base, title: 'Keep going', body: 'Your waist is shrinking. Do not change anything.' };
  if (Math.abs(weekly) <= 0.25 && !recentPR) return { ...base, title: 'Time to review', body: 'Weight, waist and strength have all stalled. Check your actual intake, steps, sleep and whether you are adding reps.' };
  return { ...base, title: 'Keep going', body: 'Nothing in your trend calls for a change. Stay on target.' };
}

/* ---------- Workout logic ---------- */
function lastSessionOf(name) {
  for (let i = state.workouts.length - 1; i >= 0; i--) {
    const e = state.workouts[i].exercises.find(x => x.name === name);
    if (e && e.sets.length) return { date: state.workouts[i].date, sets: e.sets };
  }
  return null;
}
function bestScoreOf(name) {
  let best = 0;
  state.workouts.forEach(w => w.exercises.forEach(e => { if (e.name === name) e.sets.forEach(s => { best = Math.max(best, setScore(s)); }); }));
  return best;
}
function progressHint(e, last) {
  const u = e.unit === 'sec' ? 'seconds' : 'reps';
  if (!last) return { up: false, text: `First time: pick a weight that leaves 1 to 3 ${u} in the tank at ${e.lo} to ${e.hi}.` };
  if (last.sets.length >= e.sets.length && last.sets.every(s => s.r >= e.hi)) return { up: true, text: `You hit ${e.hi} on every set last time. Add a little weight today.` };
  return { up: false, text: `Goal: beat last time by 1 ${u.slice(0, -1)} on any set. Range ${e.lo} to ${e.hi}.` };
}
function startWorkout(dayIndex) {
  const p = state.plan[dayIndex];
  state.active = {
    id: uid(), date: today(), name: p.name, startedAt: Date.now(),
    exercises: p.exercises.map(e => ({ ...clone(e), sets: Array.from({ length: e.sets }, () => ({ w: '', r: '', done: false })) })),
  };
  requestWake();
  commit();
  window.scrollTo(0, 0);
}
function finishWorkout() {
  const a = state.active;
  const exercises = a.exercises.map(e => ({
    name: e.name, muscle: e.muscle, kind: e.kind, unit: e.unit, lo: e.lo, hi: e.hi,
    sets: e.sets.filter(s => s.done).map(s => ({ w: Number(s.w) || 0, r: Number(s.r) || 0 })),
  })).filter(e => e.sets.length);
  if (!exercises.length) {
    if (confirm('No sets are ticked off. Throw this workout away?')) { state.active = null; stopRest(); commit(); }
    return;
  }
  const prs = [];
  exercises.forEach(e => {
    const before = bestScoreOf(e.name);
    const top = e.sets.reduce((b, s) => (setScore(s) > setScore(b) ? s : b), e.sets[0]);
    if (before > 0 && setScore(top) > before + 0.001) prs.push({ name: e.name, w: top.w, r: top.r, unit: e.unit });
  });
  const w = { id: a.id, date: a.date, name: a.name, startedAt: a.startedAt, finishedAt: Date.now(), exercises, prs };
  state.workouts.push(w);
  state.active = null;
  stopRest();
  releaseWake();
  ui.sheet = { type: 'summary', id: w.id };
  commit();
  confetti();
}

/* ---------- Rest timer ---------- */
function startRest(seconds) { ui.rest = { endsAt: Date.now() + seconds * 1000, beeped: false }; tickRest(); }
function stopRest() { ui.rest = null; tickRest(); }
function beep() {
  if (!state.settings.sound) return;
  try {
    const ctx = window.__audio || (window.__audio = new (window.AudioContext || window.webkitAudioContext)());
    ctx.resume();
    [0, .18].forEach(at => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = .15;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + .12);
    });
  } catch (e) { /* sound is optional */ }
}
function tickRest() {
  const el = document.getElementById('rest');
  const on = ui.rest && state.active;
  el.hidden = !on;
  if (on) {
    const left = Math.ceil((ui.rest.endsAt - Date.now()) / 1000);
    const over = left <= 0;
    if (over && !ui.rest.beeped) { ui.rest.beeped = true; beep(); }
    const sec = Math.abs(left);
    el.className = over ? 'over' : '';
    el.innerHTML = `<span class="grow row"><span class="time">${over ? '+' : ''}${Math.floor(sec / 60)}:${pad(sec % 60)}</span><span style="font-size:13px">${over ? 'Next set' : 'Rest'}</span></span>
      <button data-a="restAdd" data-s="-15">−15</button><button data-a="restAdd" data-s="15">+15</button><button data-a="restSkip">Skip</button>`;
  }
  const clock = document.getElementById('elapsed');
  if (clock && state.active) {
    const m = Math.floor((Date.now() - state.active.startedAt) / 60000);
    clock.textContent = `${m} min`;
  }
}
let wakeLock = null;
async function requestWake() { try { if (state.active && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* optional */ } }
function releaseWake() { try { wakeLock?.release(); } catch (e) { /* optional */ } wakeLock = null; }

/* ---------- Food logic ---------- */
const builtinFoods = BUILTIN_FOODS.map(([name, kcal, p, c, f, servingG, servingLabel]) => ({ id: 'b:' + name, name, kcal, p, c, f, servingG, servingLabel, src: 'Built-in estimate' }));
function localFoodSearch(q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = f => terms.every(t => `${f.name} ${f.brand || ''}`.toLowerCase().includes(t));
  return [...state.customFoods, ...builtinFoods].filter(match).slice(0, 25);
}
const withTimeout = (url, ms = 12000) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
};
async function searchUSDA(q) {
  const key = state.settings.usdaKey || 'DEMO_KEY';
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(q)}&pageSize=20&dataType=${encodeURIComponent('Foundation,SR Legacy,Survey (FNDDS),Branded')}`;
  const res = await withTimeout(url);
  if (res.status === 429) throw new Error('limit');
  if (!res.ok) throw new Error('down');
  const data = await res.json();
  return (data.foods || []).map(f => {
    const n = {};
    (f.foodNutrients || []).forEach(x => { n[x.nutrientId] = x.value; });
    const kcal = n[1008] ?? n[2047] ?? n[2048];
    if (kcal == null) return null;
    const grams = f.servingSizeUnit && /^g/i.test(f.servingSizeUnit) ? f.servingSize : null;
    return {
      id: 'u:' + f.fdcId, name: titleCase(f.description), brand: f.brandName || f.brandOwner || '',
      kcal, p: n[1003] || 0, c: n[1005] || 0, f: n[1004] || 0,
      servingG: grams || 100, servingLabel: grams ? `1 serving (${round(grams)} g)` : '100 g', src: 'USDA',
    };
  }).filter(Boolean);
}
async function searchOFF(q) {
  const query = `/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=code,product_name,brands,nutriments,serving_quantity`;
  // This service goes down now and then, so fall back from the India site to the global one.
  let data = null;
  for (const host of ['https://in.openfoodfacts.org', 'https://world.openfoodfacts.org']) {
    try {
      const res = await withTimeout(host + query, 8000);
      if (res.ok) { data = await res.json(); break; }
    } catch (e) { /* try the next host */ }
  }
  if (!data) throw new Error('down');
  return (data.products || []).map(x => {
    const n = x.nutriments || {};
    if (!x.product_name || n['energy-kcal_100g'] == null) return null;
    const grams = Number(x.serving_quantity) || null;
    return {
      id: 'o:' + (x.code || x.product_name), name: x.product_name, brand: Array.isArray(x.brands) ? x.brands.join(', ') : (x.brands || ''),
      kcal: Number(n['energy-kcal_100g']), p: Number(n.proteins_100g) || 0, c: Number(n.carbohydrates_100g) || 0, f: Number(n.fat_100g) || 0,
      servingG: grams || 100, servingLabel: grams ? `1 serving (${round(grams)} g)` : '100 g', src: 'Open Food Facts',
    };
  }).filter(Boolean);
}
const titleCase = s => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s,(])\w/g, c => c.toUpperCase()) : s);

function macrosFor(food, mode, qty) {
  const grams = mode === 'serving' ? qty * food.servingG : qty;
  const k = grams / 100;
  return { grams, kcal: food.kcal * k, p: food.p * k, c: food.c * k, f: food.f * k };
}
function amountLabel(food, mode, qty) {
  if (mode === 'grams') return `${round(qty, 1)} g`;
  return qty === 1 ? food.servingLabel : `${round(qty, 2)} × ${food.servingLabel}`;
}
function logEntry(date, slot, entry) {
  const d = getDay(date);
  d.meals = d.meals || {};
  (d.meals[slot] = d.meals[slot] || []).push({ ...entry, id: uid() });
}
function rememberFood(food) {
  state.recentFoods = [food, ...state.recentFoods.filter(f => f.id !== food.id)].slice(0, 25);
}
const mealTotals = items => items.reduce((t, e) => ({ kcal: t.kcal + e.kcal, p: t.p + e.p }), { kcal: 0, p: 0 });

/* ---------- Feedback ---------- */
function toast(text, cls = '') {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = text;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 2400);
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.getElementById('fx'), g = c.getContext('2d');
  const dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  g.scale(dpr, dpr);
  const colors = ['#ffc933', '#ff5d47', '#36d39b', '#5ec4ff', '#b58cff', '#fff6df'];
  const bits = Array.from({ length: 90 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .35,
    vx: (Math.random() - .5) * 11, vy: -Math.random() * 11 - 3,
    s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4, col: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  (function frame(now) {
    g.clearRect(0, 0, innerWidth, innerHeight);
    bits.forEach(b => {
      b.vy += .32; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.col; g.fillRect(-b.s / 2, -b.s / 2, b.s, b.s * .6); g.restore();
    });
    if (now - start < 1900) requestAnimationFrame(frame); else g.clearRect(0, 0, innerWidth, innerHeight);
  })(start);
}

/* ---------- Render ---------- */
const bar = (value, max, color, thin) => {
  const pct = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  return `<div class="bar ${thin ? 'thin' : ''}" style="--c:${color}"><i class="${pct === 0 || pct === 100 ? 'empty' : ''}" style="width:${pct}%"></i></div>`;
};
const heroStrip = s => `
  <section class="card hero-card">
    <div class="hero-art">${heroSVG(s)}</div>
    <div class="grow" style="display:flex;flex-direction:column;gap:6px">
      <div class="hero-name">${esc(state.profile.name || 'Hero')}</div>
      <div class="row" style="flex-wrap:wrap;gap:5px">
        <span class="chip">Level ${s.level} · ${esc(s.title)}</span>
        <span class="chip">${ICON.flame}${s.streak} day${s.streak === 1 ? '' : 's'}</span>
      </div>
      ${bar(s.into, s.need, '#36d39b')}
      <div style="font-size:12px;font-weight:900" class="num">${fmt(s.into)} / ${fmt(s.need)} XP</div>
    </div>
  </section>`;
function bossCard() {
  const b = bossInfo();
  if (!b) return '';
  const hit = ui.bossHit; ui.bossHit = false;
  return `<button class="card boss ${hit ? 'hit' : ''}" data-a="go" data-tab="body" style="text-align:left;width:100%">
    <div class="boss-art">${bossSVG(b.ratio)}</div>
    <div class="grow" style="display:flex;flex-direction:column;gap:5px">
      <div class="row between"><h3>${b.hp === 0 ? 'Belly Boss defeated' : 'Belly Boss'}</h3><span class="num" style="font-weight:900;font-size:13px">${round(b.latest, 1)} cm</span></div>
      ${bar(b.hp, b.max, '#ff5d47')}
      <div class="muted num">${b.hp === 0 ? `You reached ${state.profile.goalWaist} cm.` : `${round(b.hp, 1)} cm of HP left. Measure weekly to hit it.`}</div>
    </div>
  </button>`;
}
const macroLine = (label, value, target, color) => `<div class="macro-row"><span>${label}</span>${bar(value, target, color)}<span class="num">${Math.round(value)} / ${target}</span></div>`;

function viewHome() {
  const s = computeStats(), k = today(), quests = questsFor(k), t = dayTotals(k), tg = state.targets, plan = planFor(k), d = peekDay(k);
  const doneToday = workoutsOn(k).length > 0;
  const needsBackup = state.workouts.length + Object.keys(state.days).length > 3 && (!state.lastBackup || state.lastBackup <= addDays(k, -14));
  const waistDue = !latestMetric('waist') || latestMetric('waist').date <= addDays(k, -7);
  const wk = weekStart(k);
  let cardio = 0;
  for (let i = 0; i < 7; i++) if ((peekDay(addDays(wk, i)).cardio || 0) >= 20) cardio++;
  return `
    ${heroStrip(s)}
    ${bossCard()}
    ${state.active ? `<button class="btn big tomato" data-a="go" data-tab="train">Back to ${esc(state.active.name)}</button>`
      : plan && !doneToday ? `<button class="btn big tomato" data-a="start" data-day="${parseKey(k).getDay()}">Start ${esc(plan.name)}</button>` : ''}
    <section class="card">
      <div class="row between"><h2>Today's quests</h2><span class="chip num">${quests.filter(q => q.done).length} / ${quests.length}</span></div>
      <div class="list">
        ${quests.map(q => `<button class="quest ${q.done ? 'done' : ''}" data-a="go" data-tab="${q.tab}">
          <span class="tick">${ICON.tick}</span><span class="grow">${esc(q.label)}</span><span class="xp">${esc(q.note || '')}${q.note ? ' · ' : ''}+${q.id === 'train' ? '100' : '15'} XP</span></button>`).join('')}
      </div>
      <div class="row between">
        <span class="muted num">Water: ${d.water || 0} L</span>
        <button class="btn small plain" data-a="water" data-l="0.25">+250 ml</button>
      </div>
    </section>
    <section class="card">
      <div class="row between"><h2>This week</h2></div>
      <div class="list">
        <button class="quest ${cardio >= 3 ? 'done' : ''}" data-a="go" data-tab="body"><span class="tick">${ICON.tick}</span><span class="grow">3 incline walks, 20 minutes each</span><span class="xp num">${cardio} / 3</span></button>
        <button class="quest ${waistDue ? '' : 'done'}" data-a="go" data-tab="body"><span class="tick">${ICON.tick}</span><span class="grow">Measure your waist</span><span class="xp">+40 XP</span></button>
      </div>
    </section>
    <button class="card" data-a="go" data-tab="fuel" style="text-align:left;width:100%">
      <div class="row between"><h2>Fuel</h2><span class="num" style="font-weight:900">${fmt(t.kcal)} / ${fmt(tg.kcal)} kcal</span></div>
      ${macroLine('Protein', t.p, tg.protein, '#36d39b')}
    </button>
    ${needsBackup ? `<section class="card banner"><h3>Time for a backup</h3><p>Your progress lives only on this phone. Save a copy to iCloud Drive.</p><button class="btn small plain" data-a="export">Save backup</button></section>` : ''}
  `;
}

function viewTrain() {
  return state.active ? viewActive() : viewPlan();
}
function viewPlan() {
  const p = state.plan[ui.planDay], isRest = !p.exercises.length, todayDay = new Date().getDay();
  const recent = [...state.workouts].reverse().slice(0, 12);
  return `
    <div class="screen-title"><h1>Train</h1></div>
    <div class="day-picker">
      ${PICK_ORDER.map(d => `<button class="day-pick ${d === ui.planDay ? 'on' : ''} ${d === todayDay ? 'today' : ''}" data-a="pickDay" data-day="${d}">${DAY_SHORT[d]}<small>${state.plan[d].exercises.length ? state.plan[d].exercises.length + ' ex' : 'rest'}</small></button>`).join('')}
    </div>
    <section class="card">
      <div class="row between"><h2>${esc(isRest ? 'Rest day' : p.name)}</h2><button class="link" data-a="editPlan">Edit</button></div>
      ${isRest ? '<p>Walk, eat normally and recover. Muscle grows when you rest.</p>' : `<div>${p.exercises.map(e => `<div class="plan-line"><span>${esc(e.name)}</span><span class="num">${e.sets} × ${e.lo}–${e.hi}${e.unit === 'sec' ? ' s' : ''}</span></div>`).join('')}</div>`}
      ${isRest ? '' : `<button class="btn big tomato" data-a="start" data-day="${ui.planDay}">Start workout</button>`}
    </section>
    <div class="section-label">Workout history</div>
    <section class="card">
      ${recent.length ? recent.map(w => {
        const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
        return `<button class="food-row" data-a="openWorkout" data-id="${w.id}"><span class="grow"><b>${esc(w.name)}</b><span class="muted">${niceDate(w.date)} · ${sets} sets${w.prs?.length ? ` · ${w.prs.length} new best` : ''}</span></span><span class="kcal num">+${workoutXP(w)} XP</span></button>`;
      }).join('') : '<p class="muted">Finished workouts show up here, along with your personal bests.</p>'}
    </section>`;
}
function viewActive() {
  const a = state.active;
  const total = a.exercises.reduce((n, e) => n + e.sets.length, 0);
  const done = a.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
  return `
    <div class="workout-head">
      <div class="row between"><h1 style="color:var(--sun);font-size:26px;min-width:0">${esc(a.name)}</h1><span class="chip num" id="elapsed">${Math.floor((Date.now() - a.startedAt) / 60000)} min</span></div>
      ${bar(done, total, '#36d39b')}
    </div>
    ${a.exercises.map((e, i) => {
      const last = lastSessionOf(e.name), hint = progressHint(e, last);
      return `<section class="card">
        <div class="row between"><button style="text-align:left;min-width:0" data-a="exHistory" data-name="${esc(e.name)}"><h3>${esc(e.name)}</h3><span class="tag">${esc(e.muscle)} · ${e.sets.length} × ${e.lo}–${e.hi} · history</span></button>
          <button class="link danger" data-a="removeEx" data-i="${i}" aria-label="Remove ${esc(e.name)}">Remove</button></div>
        <div class="hint ${hint.up ? 'up' : ''}">${esc(hint.text)}</div>
        <div class="sets">
          <span class="h">#</span><span class="h">Last</span><span class="h">Kg</span><span class="h">${e.unit === 'sec' ? 'Sec' : 'Reps'}</span><span></span>
          ${e.sets.map((s, j) => {
            const prev = last && (last.sets[j] || last.sets[last.sets.length - 1]);
            return `<span class="n">${j + 1}</span>
              <span class="prev">${prev ? `${prev.w || 'BW'}×${prev.r}` : '–'}</span>
              <input id="w-${i}-${j}" class="${s.done ? 'done' : ''}" type="number" inputmode="decimal" step="0.5" aria-label="Set ${j + 1} kilograms" placeholder="${prev ? prev.w || '' : ''}" value="${esc(s.w)}" data-bind="set" data-i="${i}" data-j="${j}" data-f="w">
              <input id="r-${i}-${j}" class="${s.done ? 'done' : ''}" type="number" inputmode="numeric" aria-label="Set ${j + 1} ${e.unit === 'sec' ? 'seconds' : 'reps'}" placeholder="${prev ? prev.r : ''}" value="${esc(s.r)}" data-bind="set" data-i="${i}" data-j="${j}" data-f="r">
              <button class="set-check ${s.done ? 'on' : ''}" data-a="toggleSet" data-i="${i}" data-j="${j}" aria-label="Mark set ${j + 1} done" aria-pressed="${s.done}">${ICON.tick}</button>`;
          }).join('')}
        </div>
        <div class="row between"><button class="btn small plain" data-a="addSet" data-i="${i}">+ Add set</button>${e.sets.length > 1 ? `<button class="link" data-a="dropSet" data-i="${i}">Remove last set</button>` : ''}</div>
      </section>`;
    }).join('')}
    <button class="btn block plain" data-a="addExActive">+ Add exercise</button>
    <button class="btn big mint" data-a="finish">Finish workout</button>
    <button class="link" style="color:var(--on-bg-soft);align-self:center" data-a="discard">Throw away this workout</button>
    <div style="height:56px"></div>`;
}

function dateNav(key, act) {
  return `<div class="date-nav"><button class="round" data-a="${act}" data-n="-1" aria-label="Previous day">‹</button><strong>${niceDate(key)}</strong><button class="round" data-a="${act}" data-n="1" aria-label="Next day" ${key >= today() ? 'disabled' : ''}>›</button></div>`;
}
function viewFuel() {
  const k = ui.fuelDate, t = dayTotals(k), tg = targetsOn(k), left = tg.kcal - t.kcal;
  const meals = peekDay(k).meals || {};
  const yesterday = peekDay(addDays(k, -1)).meals || {};
  return `
    <div class="screen-title"><h1>Fuel</h1></div>
    ${dateNav(k, 'fuelDay')}
    <section class="card">
      <div class="row between" style="align-items:flex-end">
        <div><div class="big-num num">${fmt(Math.abs(left))}</div><div class="muted">kcal ${left >= 0 ? 'left' : 'over'} of ${fmt(tg.kcal)}</div></div>
        <span class="chip num">${fmt(t.kcal)} eaten</span>
      </div>
      ${macroLine('Protein', t.p, tg.protein, '#36d39b')}
      ${macroLine('Carbs', t.c, tg.carbs, '#5ec4ff')}
      ${macroLine('Fat', t.f, tg.fat, '#b58cff')}
    </section>
    ${SLOTS.map(([slot, label]) => {
      const list = meals[slot] || [], sum = mealTotals(list);
      const quick = state.savedMeals.filter(m => m.slot === slot).slice(0, 3);
      return `<section class="card">
        <div class="meal-head"><h3>${label}</h3><span class="row"><span class="muted num">${list.length ? `${fmt(sum.kcal)} kcal · ${Math.round(sum.p)} g P` : ''}</span><button class="btn small" data-a="addFood" data-slot="${slot}">+ Add</button></span></div>
        ${list.length ? `<div>${list.map(e => `<button class="entry" data-a="editEntry" data-slot="${slot}" data-id="${e.id}"><span class="grow"><b>${esc(e.name)}</b><span class="muted">${esc(e.label)}</span></span><span class="side num">${fmt(e.kcal)}<br><span class="muted">${round(e.p)} g P</span></span></button>`).join('')}</div>
          <div class="row"><button class="link" data-a="saveMeal" data-slot="${slot}">Save as repeat meal</button></div>` : ''}
        ${!list.length && (quick.length || yesterday[slot]?.length) ? `<div class="chips">
          ${quick.map(m => `<button class="chip-btn" data-a="logMeal" data-id="${m.id}" data-slot="${slot}">Repeat ${esc(m.name)}<br><span class="muted num">${fmt(mealTotals(m.items).kcal)} kcal</span></button>`).join('')}
          ${yesterday[slot]?.length ? `<button class="chip-btn" data-a="repeatYesterday" data-slot="${slot}">Same as yesterday<br><span class="muted num">${fmt(mealTotals(yesterday[slot]).kcal)} kcal</span></button>` : ''}
        </div>` : ''}
      </section>`;
    }).join('')}`;
}

function viewBody() {
  const k = ui.bodyDate, d = peekDay(k), c = coach();
  const field = (id, label, value, step, mode) => `<div class="field"><label for="b-${id}">${label}</label><input id="b-${id}" type="number" inputmode="${mode}" step="${step}" value="${value ?? ''}" data-bind="metric" data-f="${id}"></div>`;
  const row = (label, fn, unit = '') => {
    const week = o => { const from = addDays(weekStart(today()), -7 * o); return Array.from({ length: 7 }, (_, i) => addDays(from, i)); };
    const a = fn(week(0)), b = fn(week(1));
    const show = v => (v == null ? '–' : `${v.toLocaleString('en-IN')}${unit}`);
    return `<tr><td>${label}</td><td>${show(b)}</td><td>${show(a)}</td></tr>`;
  };
  const avgOf = (field2, p = 1) => keys => { const v = keys.map(x => peekDay(x)[field2]).filter(x => x != null); return v.length ? round(avg(v), p) : null; };
  const avgFood = (pick) => keys => { const v = keys.map(x => dayTotals(x)).filter(t => t.kcal > 0).map(pick); return v.length ? Math.round(avg(v)) : null; };
  const liftCount = keys => state.workouts.filter(w => keys.includes(w.date)).length;
  return `
    <div class="screen-title"><h1>Body</h1></div>
    ${bossCard()}
    ${dateNav(k, 'bodyDay')}
    <section class="card">
      <h2>Check-in</h2>
      <div class="grid2">
        ${field('weight', 'Morning weight (kg)', d.weight, '0.1', 'decimal')}
        ${field('waist', 'Waist at belly button (cm)', d.waist, '0.1', 'decimal')}
        ${field('steps', 'Steps', d.steps, '100', 'numeric')}
        ${field('sleep', 'Sleep (hours)', d.sleep, '0.25', 'decimal')}
        ${field('water', 'Water (litres)', d.water, '0.25', 'decimal')}
        ${field('cardio', 'Incline walk (minutes)', d.cardio, '5', 'numeric')}
      </div>
    </section>
    <section class="card coach ${c.delta ? 'act' : ''}">
      <div><span class="tag">Calorie coach</span><h2>${esc(c.title)}</h2></div>
      <p>${esc(c.body)}</p>
      ${c.delta ? `<button class="btn" data-a="applyCoach" data-d="${c.delta}">Change target to ${fmt(state.targets.kcal + c.delta)} kcal</button>` : ''}
      <div class="tile-grid">
        <div class="tile"><b>${c.weekly == null ? '–' : `${c.weekly > 0 ? '+' : ''}${round(c.weekly, 2)} kg`}</b><span>Weight change, week on week</span></div>
        <div class="tile"><b>${c.waistDelta == null ? '–' : `${c.waistDelta > 0 ? '+' : ''}${round(c.waistDelta, 1)} cm`}</b><span>Waist change, 2+ weeks</span></div>
        <div class="tile"><b>${c.avgKcal == null ? '–' : fmt(c.avgKcal)}</b><span>Average kcal on ${c.foodDays} logged days</span></div>
        <div class="tile"><b>${c.maintenance == null ? '–' : `~${fmt(c.maintenance)}`}</b><span>Your estimated maintenance</span></div>
      </div>
    </section>
    <section class="card chart"><div class="row between"><h3>Weight</h3><span class="muted">Red line is your 7-day average</span></div>${lineChart(series('weight'), { unit: 'kg', showAvg: true })}</section>
    <section class="card chart"><h3>Waist</h3>${lineChart(series('waist'), { unit: 'cm' })}</section>
    <section class="card chart"><h3>Calories</h3>${kcalBars()}</section>
    <section class="card">
      <h3>Weekly report</h3>
      <div style="overflow-x:auto"><table class="compare">
        <thead><tr><th></th><th>Last week</th><th>This week</th></tr></thead>
        <tbody>
          ${row('Average weight', avgOf('weight'), ' kg')}
          ${row('Waist', avgOf('waist'), ' cm')}
          ${row('Average steps', avgOf('steps', 0))}
          ${row('Average sleep', avgOf('sleep'), ' h')}
          ${row('Average kcal', avgFood(t => t.kcal))}
          ${row('Average protein', avgFood(t => t.p), ' g')}
          ${row('Workouts', liftCount)}
        </tbody>
      </table></div>
    </section>`;
}

function viewHero() {
  const s = computeStats(), tg = state.targets;
  const target = (id, label, step) => `<div class="field"><label for="t-${id}">${label}</label><input id="t-${id}" type="number" inputmode="decimal" step="${step}" value="${tg[id]}" data-bind="target" data-f="${id}"></div>`;
  const lifts = [...new Set(state.workouts.flatMap(w => w.exercises.map(e => e.name)))]
    .map(name => {
      let best = null;
      state.workouts.forEach(w => w.exercises.forEach(e => { if (e.name === name) e.sets.forEach(x => { if (!best || setScore(x) > setScore(best)) best = x; }); }));
      return { name, best };
    }).sort((a, b) => setScore(b.best) - setScore(a.best)).slice(0, 8);
  return `
    <div class="screen-title"><h1>Hero</h1></div>
    ${heroStrip(s)}
    <section class="card">
      <div><h2>Muscle stats</h2><p class="muted">Bars show hard sets this week. Aim for 10 to 15 per muscle. Your hero grows as these level up.</p></div>
      ${MUSCLES.map(([m, label]) => `<div class="muscle"><span>${label} <span class="muted">L${s.muscleLv(m)}</span></span>${bar(s.muscleWeek[m], 15, s.muscleWeek[m] >= 10 ? '#36d39b' : '#ffc933')}<span class="num">${s.muscleWeek[m]} sets</span></div>`).join('')}
    </section>
    <section class="card">
      <h2>Career</h2>
      <div class="tile-grid">
        <div class="tile"><b>${fmt(s.xp)}</b><span>Total XP</span></div>
        <div class="tile"><b>${s.workouts}</b><span>Workouts</span></div>
        <div class="tile"><b>${s.prs}</b><span>Personal bests</span></div>
        <div class="tile"><b>${fmt(s.volume)} kg</b><span>Total lifted</span></div>
      </div>
    </section>
    <section class="card">
      <h2>Badges</h2>
      <div class="badges">${BADGES.map(([name, desc, test]) => { const won = test(s); return `<div class="badge ${won ? 'won' : ''}">${badgeSVG(won)}<strong>${esc(name)}</strong><br>${esc(desc)}</div>`; }).join('')}</div>
    </section>
    <section class="card">
      <h2>Personal bests</h2>
      ${lifts.length ? lifts.map(l => `<button class="food-row" data-a="exHistory" data-name="${esc(l.name)}"><span class="grow"><b>${esc(l.name)}</b></span><span class="kcal num">${l.best.w || 'BW'} × ${l.best.r}</span></button>`).join('') : '<p class="muted">Your best set on each exercise will appear here.</p>'}
    </section>
    <section class="card">
      <h2>Daily targets</h2>
      <div class="grid2">
        ${target('kcal', 'Calories', 50)}${target('protein', 'Protein (g)', 5)}
        ${target('carbs', 'Carbs (g)', 5)}${target('fat', 'Fat (g)', 5)}
        ${target('steps', 'Steps', 500)}${target('sleep', 'Sleep (hours)', 0.5)}
        ${target('water', 'Water (litres)', 0.5)}
      </div>
    </section>
    <section class="card">
      <h2>Waist goal</h2>
      <div class="grid2">
        <div class="field"><label for="p-start">Starting waist (cm)</label><input id="p-start" type="number" inputmode="decimal" value="${state.profile.startWaist ?? ''}" data-bind="profile" data-f="startWaist"></div>
        <div class="field"><label for="p-goal">Goal waist (cm)</label><input id="p-goal" type="number" inputmode="decimal" value="${state.profile.goalWaist ?? ''}" data-bind="profile" data-f="goalWaist"></div>
      </div>
    </section>
    <section class="card">
      <h2>Your save</h2>
      <p class="muted">Everything stays on this phone. Removing the app from your Home Screen can erase it, so keep a backup in iCloud Drive.${state.lastBackup ? ` Last backup: ${niceDate(state.lastBackup)}.` : ''}</p>
      <div class="grid2">
        <button class="btn" data-a="export">Save backup</button>
        <label class="btn plain" for="import-file">Restore backup</label>
      </div>
      <input id="import-file" type="file" accept=".json,application/json" hidden>
    </section>
    <section class="card">
      <h2>Settings</h2>
      <div class="field"><label for="usda-key">USDA food search key (optional)</label><input id="usda-key" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(state.settings.usdaKey)}" data-bind="usda" placeholder="Using the shared demo key"></div>
      <p class="muted">The shared key allows about 10 online searches an hour. A free key from api.data.gov removes that limit. Your key stays on this phone.</p>
      <button class="row between" data-a="toggleSound" style="width:100%;min-height:44px;font-weight:800"><span>Rest timer beep</span><span class="tick ${state.settings.sound ? 'on' : ''}">${ICON.tick}</span></button>
    </section>`;
}

function viewWelcome() {
  return `
    <div class="welcome"><h1>Rep Quest</h1><p style="margin-top:8px">Train, eat and shrink the Belly Boss. Set up your save.</p></div>
    <section class="card">
      <form id="welcome-form" style="display:flex;flex-direction:column;gap:12px">
        <div class="field"><label for="w-name">Hero name</label><input id="w-name" type="text" autocomplete="off" maxlength="24" required></div>
        <div class="grid2">
          <div class="field"><label for="w-weight">Weight (kg)</label><input id="w-weight" type="number" inputmode="decimal" step="0.1" required></div>
          <div class="field"><label for="w-waist">Waist at belly button (cm)</label><input id="w-waist" type="number" inputmode="decimal" step="0.1" required></div>
        </div>
        <div class="field"><label for="w-goal">Goal waist (cm)</label><input id="w-goal" type="number" inputmode="decimal" step="0.1" required></div>
        <p class="muted">Your starting plan is the 5-day split at 2,500 kcal and 160 g protein. You can edit all of it later.</p>
        <button class="btn big tomato" type="submit">Start the quest</button>
      </form>
    </section>
    <label class="link" style="color:var(--on-bg);align-self:center" for="import-file">Restore a backup instead</label>
    <input id="import-file" type="file" accept=".json,application/json" hidden>`;
}

const VIEWS = { home: viewHome, train: viewTrain, fuel: viewFuel, body: viewBody, hero: viewHero };
const TABS = [['home', 'Quests', ICON.home], ['train', 'Train', ICON.train], ['fuel', 'Fuel', ICON.fuel], ['body', 'Body', ICON.body], ['hero', 'Hero', ICON.hero]];

function render() {
  const app = document.getElementById('app'), nav = document.getElementById('tabs');
  if (!state.onboarded) {
    nav.hidden = true;
    app.innerHTML = viewWelcome();
    return;
  }
  const y = window.scrollY;
  app.innerHTML = VIEWS[ui.tab]();
  nav.hidden = false;
  nav.innerHTML = TABS.map(([id, label, icon]) => `<button class="tab ${ui.tab === id ? 'on' : ''}" data-a="go" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>${icon}${label}</button>`).join('');
  window.scrollTo(0, y);
  tickRest();
}

/* ---------- Sheets ---------- */
function openSheet(s) { ui.sheet = s; renderSheet(); }
function closeSheet() { ui.sheet = null; renderSheet(); }
function renderSheet() {
  const el = document.getElementById('sheet');
  document.body.classList.toggle('locked', !!ui.sheet);
  el.hidden = !ui.sheet;
  if (!ui.sheet) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="sheet-body" role="dialog" aria-modal="true">${SHEETS[ui.sheet.type](ui.sheet)}</div>`;
  if (ui.sheet.type === 'food' && ui.sheet.tab === 'search') renderFoodResults();
}
const sheetHead = (title, sub = '') => `<div class="sheet-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div><button class="close" data-a="closeSheet" aria-label="Close">×</button></div>`;
const slotName = slot => SLOTS.find(s => s[0] === slot)?.[1] || slot;

const SHEETS = {
  food(s) {
    const tabs = [['search', 'Search'], ['meals', 'Repeat meals'], ['create', 'Enter macros']];
    let body = '';
    if (s.tab === 'search') {
      body = `<form id="food-search" class="row"><input id="food-q" class="search grow" type="search" placeholder="Roti, chicken, Amul paneer…" value="${esc(s.q || '')}" autocomplete="off" aria-label="Search foods" data-input="foodq"></form><div id="food-results"></div>`;
    } else if (s.tab === 'meals') {
      body = state.savedMeals.length ? `<div>${state.savedMeals.map(m => {
        const t = mealTotals(m.items);
        return `<div class="food-row"><span class="grow"><b>${esc(m.name)}</b><span class="muted num">${fmt(t.kcal)} kcal · ${Math.round(t.p)} g protein · ${m.items.length} item${m.items.length === 1 ? '' : 's'}</span></span>
          <span class="row"><button class="link danger" data-a="deleteMeal" data-id="${m.id}">Delete</button><button class="btn small" data-a="logMeal" data-id="${m.id}" data-slot="${s.slot}">Log</button></span></div>`;
      }).join('')}</div>` : '<p class="muted">Log a meal, then tap "Save as repeat meal" under it. Next time, one tap logs the whole thing.</p>';
    } else {
      body = `<form id="food-create" style="display:flex;flex-direction:column;gap:10px">
        <div class="field"><label for="c-name">Food name</label><input id="c-name" type="text" required maxlength="80" autocomplete="off"></div>
        <div class="field"><label for="c-label">This is for</label><input id="c-label" type="text" value="1 serving" maxlength="40" autocomplete="off"></div>
        <div class="grid4">
          <div class="field"><label for="c-kcal">Kcal</label><input id="c-kcal" type="number" inputmode="decimal" required></div>
          <div class="field"><label for="c-p">Protein</label><input id="c-p" type="number" inputmode="decimal"></div>
          <div class="field"><label for="c-c">Carbs</label><input id="c-c" type="number" inputmode="decimal"></div>
          <div class="field"><label for="c-f">Fat</label><input id="c-f" type="number" inputmode="decimal"></div>
        </div>
        <button class="btn block" type="submit">Save and add to ${esc(slotName(s.slot))}</button>
      </form>`;
    }
    return `${sheetHead(`Add to ${slotName(s.slot)}`)}
      <div class="seg">${tabs.map(([id, l]) => `<button class="${s.tab === id ? 'on' : ''}" data-a="foodTab" data-tab="${id}">${l}</button>`).join('')}</div>
      ${body}`;
  },
  amount(s) {
    const f = s.food;
    const m = macrosFor(f, s.mode, s.qty);
    return `${sheetHead(f.name, [f.brand, f.src].filter(Boolean).join(' · '))}
      ${f.noGrams ? '' : `<div class="seg">
        <button class="${s.mode === 'serving' ? 'on' : ''}" data-a="amtMode" data-mode="serving">${esc(f.servingLabel)}</button>
        <button class="${s.mode === 'grams' ? 'on' : ''}" data-a="amtMode" data-mode="grams">Grams</button>
      </div>`}
      <div class="field"><label for="amt-qty">${s.mode === 'grams' ? 'How many grams?' : 'How many servings?'}</label>
        <input id="amt-qty" type="number" inputmode="decimal" step="${s.mode === 'grams' ? 5 : 0.5}" value="${round(s.qty, 2)}" data-input="amt"></div>
      ${s.mode === 'serving' ? `<div class="chips">${[0.5, 1, 1.5, 2, 3].map(q => `<button class="chip-btn" data-a="amtSet" data-q="${q}">${q}</button>`).join('')}</div>` : ''}
      <div class="preview" id="amt-preview">${previewHTML(m)}</div>
      <button class="btn big" data-a="amtSave">${s.entryId ? 'Save' : `Add to ${esc(slotName(s.slot))}`}</button>
      ${s.entryId ? '<button class="link danger" data-a="amtDelete" style="align-self:center">Delete from this meal</button>' : ''}`;
  },
  saveMeal(s) {
    return `${sheetHead('Save as repeat meal', 'Name it and you can log it again in one tap.')}
      <form id="meal-form" style="display:flex;flex-direction:column;gap:12px">
        <div class="field"><label for="meal-name">Meal name</label><input id="meal-name" type="text" required maxlength="40" autocomplete="off" value="${esc(s.suggest)}"></div>
        <button class="btn big" type="submit">Save meal</button>
      </form>`;
  },
  summary(s) {
    const w = state.workouts.find(x => x.id === s.id);
    if (!w) return sheetHead('Workout saved');
    const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
    const volume = w.exercises.reduce((n, e) => n + e.sets.reduce((v, x) => v + x.w * x.r, 0), 0);
    const mins = Math.max(1, Math.round((w.finishedAt - w.startedAt) / 60000));
    return `${sheetHead('Workout cleared', w.name)}
      <div class="tile-grid">
        <div class="tile"><b>+${workoutXP(w)} XP</b><span>Earned</span></div>
        <div class="tile"><b>${w.prs.length}</b><span>New personal bests</span></div>
        <div class="tile"><b>${sets}</b><span>Sets</span></div>
        <div class="tile"><b>${fmt(volume)} kg</b><span>Lifted in ${mins} min</span></div>
      </div>
      ${w.prs.length ? `<div>${w.prs.map(p => `<div class="plan-line"><span>${esc(p.name)}</span><span class="num">${p.w || 'BW'} × ${p.r}</span></div>`).join('')}</div>` : ''}
      <button class="btn big mint" data-a="closeSheet">Done</button>`;
  },
  workout(s) {
    const w = state.workouts.find(x => x.id === s.id);
    return `${sheetHead(w.name, niceDate(w.date))}
      ${w.exercises.map(e => `<div class="plan-line"><span>${esc(e.name)}</span><span class="num">${e.sets.map(x => `${x.w || 'BW'}×${x.r}`).join(', ')}</span></div>`).join('')}
      <button class="link danger" style="align-self:center" data-a="deleteWorkout" data-id="${w.id}">Delete this workout</button>`;
  },
  exercise(s) {
    const sessions = state.workouts.map(w => ({ date: w.date, e: w.exercises.find(x => x.name === s.name) })).filter(x => x.e);
    const points = sessions.map(x => ({ date: x.date, v: round(Math.max(...x.e.sets.map(setScore)), 1) }));
    return `${sheetHead(s.name, 'Line shows your estimated strength')}
      <div class="chart">${lineChart(points, { height: 120 })}</div>
      ${sessions.length ? [...sessions].reverse().slice(0, 10).map(x => `<div class="plan-line"><span>${niceDate(x.date)}</span><span class="num">${x.e.sets.map(q => `${q.w || 'BW'}×${q.r}`).join(', ')}</span></div>`).join('') : '<p class="muted">No sets logged yet.</p>'}`;
  },
  addExercise(s) {
    const names = [...new Set([...Object.values(state.plan).flatMap(p => p.exercises.map(e => e.name)), ...state.workouts.flatMap(w => w.exercises.map(e => e.name))])];
    return `${sheetHead('Add exercise')}
      <form id="ex-form" style="display:flex;flex-direction:column;gap:10px">
        <div class="field"><label for="ex-name">Exercise</label><input id="ex-name" type="text" list="ex-names" required maxlength="60" autocomplete="off"><datalist id="ex-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
        <div class="grid2">
          <div class="field"><label for="ex-muscle">Muscle</label><select id="ex-muscle">${MUSCLES.map(([m, l]) => `<option value="${m}">${l}</option>`).join('')}</select></div>
          <div class="field"><label for="ex-kind">Type (sets rest time)</label><select id="ex-kind"><option value="isolation">Isolation</option><option value="compound">Compound</option></select></div>
        </div>
        <div class="grid4" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <div class="field"><label for="ex-sets">Sets</label><input id="ex-sets" type="number" inputmode="numeric" value="3" min="1" required></div>
          <div class="field"><label for="ex-lo">Reps from</label><input id="ex-lo" type="number" inputmode="numeric" value="8" min="1" required></div>
          <div class="field"><label for="ex-hi">Reps to</label><input id="ex-hi" type="number" inputmode="numeric" value="12" min="1" required></div>
        </div>
        <button class="btn big" type="submit">Add</button>
      </form>`;
  },
  editPlan(s) {
    const p = state.plan[s.day];
    return `${sheetHead(`Edit ${DAY_SHORT[s.day]}`, 'Changes apply to future workouts. Your history stays.')}
      <div class="field"><label for="plan-name">Workout name</label><input id="plan-name" type="text" maxlength="30" value="${esc(p.name)}" data-bind="planName" data-day="${s.day}"></div>
      <div>${p.exercises.map((e, i) => `<div class="food-row"><span class="grow"><b>${esc(e.name)}</b><span class="muted num">${e.sets} × ${e.lo}–${e.hi} · ${esc(e.muscle)}</span></span>
        <span class="row">${i > 0 ? `<button class="round" style="width:36px;height:36px;font-size:16px" data-a="planUp" data-i="${i}" aria-label="Move ${esc(e.name)} up">↑</button>` : ''}<button class="link danger" data-a="planRemove" data-i="${i}">Remove</button></span></div>`).join('') || '<p class="muted">No exercises, so this is a rest day.</p>'}</div>
      <button class="btn block" data-a="planAdd">+ Add exercise</button>`;
  },
};
function previewHTML(m) {
  return `<div><b class="num">${fmt(m.kcal)}</b><span>kcal</span></div><div><b class="num">${round(m.p, 1)}</b><span>protein</span></div><div><b class="num">${round(m.c, 1)}</b><span>carbs</span></div><div><b class="num">${round(m.f, 1)}</b><span>fat</span></div>`;
}
function foodRow(f) {
  ui.foodIndex[f.id] = f;
  const per = f.noGrams ? esc(f.servingLabel) : `${esc(f.servingLabel)} · per 100 g: ${Math.round(f.kcal)} kcal`;
  const m = macrosFor(f, 'serving', 1);
  return `<button class="food-row" data-a="pickFood" data-id="${esc(f.id)}"><span class="grow"><b>${esc(f.name)}</b><span class="muted">${f.brand ? `${esc(f.brand)} · ` : ''}${per}</span></span><span class="kcal num">${fmt(m.kcal)}<br><span class="muted">${round(m.p, 1)} g P</span></span></button>`;
}
function renderFoodResults() {
  const box = document.getElementById('food-results');
  if (!box || !ui.sheet || ui.sheet.type !== 'food') return;
  const s = ui.sheet, q = (s.q || '').trim();
  let html = '';
  if (!q) {
    const list = state.recentFoods.length ? state.recentFoods : builtinFoods.slice(0, 12);
    html += `<p class="tag" style="margin-top:4px">${state.recentFoods.length ? 'Recent foods' : 'Common foods'}</p>${list.map(foodRow).join('')}`;
  } else {
    html += localFoodSearch(q).map(foodRow).join('');
    if (s.online) html += s.online.map(foodRow).join('');
    if (s.loading) html += '<p class="muted" style="padding:12px 0">Searching food databases…</p>';
    if (s.error) html += `<p class="muted" style="padding:10px 0">${esc(s.error)}</p>`;
    if (!s.loading && !s.online?.length && !localFoodSearch(q).length && !s.error) html += '<p class="muted" style="padding:10px 0">Nothing saved here yet. Search online or enter the macros yourself.</p>';
    if (!s.loading && s.onlineFor !== q) html += `<button class="btn block plain" style="margin-top:10px" data-a="searchOnline">Search online for "${esc(q)}"</button>`;
    if (!s.loading && s.onlineFor === q) html += '<p class="muted" style="padding:10px 0">Online nutrition data can have mistakes. Compare it with the pack label when you can.</p>';
  }
  box.innerHTML = html;
}
async function searchOnline() {
  const s = ui.sheet, q = (s.q || '').trim();
  if (!q) return;
  const token = ++ui.searchToken;
  s.loading = true; s.error = ''; s.online = [];
  renderFoodResults();
  const [usda, off] = await Promise.allSettled([searchUSDA(q), searchOFF(q)]);
  if (token !== ui.searchToken || ui.sheet !== s) return;
  const seen = new Set();
  // Open Food Facts first because it covers Indian packaged brands better.
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = f => { const text = `${f.name} ${f.brand}`.toLowerCase(); return terms.filter(t => text.includes(t)).length; };
  const merged = [...(off.value || []), ...(usda.value || [])].filter(f => {
    const key = `${f.name}|${f.brand}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => hits(b) - hits(a));
  s.online = merged.slice(0, 30);
  s.loading = false; s.onlineFor = q;
  if (usda.reason?.message === 'limit' && off.status === 'rejected') s.error = 'The hourly search limit is used up. Add a free USDA key under Hero > Settings, or enter the macros yourself.';
  else if (usda.status === 'rejected' && off.status === 'rejected') s.error = 'Could not reach the food databases. Check your connection, or enter the macros yourself.';
  else if (!merged.length) s.error = 'No online match. Try a simpler name, or enter the macros yourself.';
  else if (off.status === 'rejected') s.error = 'The Indian packaged-food database is down right now, so brands may be missing. Try again later or copy the macros from the pack.';
  renderFoodResults();
}

/* ---------- Backup ---------- */
async function exportBackup() {
  const stamp = today();
  const prev = state.lastBackup;
  state.lastBackup = stamp;
  const file = new File([JSON.stringify(state)], `rep-quest-backup-${stamp}.json`, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Rep Quest backup' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    toast('Backup ready');
    commit();
  } catch (e) {
    state.lastBackup = prev;
    if (e.name !== 'AbortError') toast('Could not create the backup. Try again.');
  }
}
async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data?.v !== 1 || !data.plan || !data.days) throw new Error('bad');
    if (state.onboarded && !confirm('Replace everything on this phone with this backup?')) return;
    state = { ...defaultState(), ...data, settings: { ...defaultState().settings, ...data.settings } };
    ui.lastXP = null;
    toast('Backup restored');
    commit();
  } catch (e) {
    toast('That file is not a Rep Quest backup.');
  }
}

/* ---------- commit: save, redraw, and announce any XP or level change ---------- */
function commit() {
  scheduleSave();
  if (state.onboarded) {
    const s = computeStats();
    if (ui.lastXP != null && s.xp > ui.lastXP) toast(`+${s.xp - ui.lastXP} XP`, 'xp');
    if (ui.lastLevel != null && s.level > ui.lastLevel) { toast(`Level ${s.level}: ${s.title}`, 'xp'); confetti(); }
    ui.lastXP = s.xp; ui.lastLevel = s.level;
  }
  render();
  renderSheet();
}

/* ---------- Actions ---------- */
const actions = {
  go(d) { ui.tab = d.tab; render(); window.scrollTo(0, 0); },
  start(d) {
    if (state.active) { ui.tab = 'train'; render(); return; }
    ui.tab = 'train';
    startWorkout(Number(d.day));
  },
  pickDay(d) { ui.planDay = Number(d.day); render(); },
  water(d) {
    const day = getDay(today());
    day.water = round((day.water || 0) + Number(d.l), 2);
    commit();
  },
  toggleSet(d) {
    const e = state.active.exercises[d.i], s = e.sets[d.j];
    if (s.done) { s.done = false; commit(); return; }
    const last = lastSessionOf(e.name);
    const prev = last && (last.sets[d.j] || last.sets[last.sets.length - 1]);
    // An empty box means "same as last time", so a repeat set takes one tap.
    if (s.r === '' && prev) s.r = prev.r;
    if (s.w === '' && prev) s.w = prev.w;
    if (s.r === '' || Number(s.r) <= 0) {
      toast(`Enter your ${e.unit === 'sec' ? 'seconds' : 'reps'} first`);
      document.getElementById(`r-${d.i}-${d.j}`)?.focus();
      return;
    }
    s.done = true;
    const score = setScore({ w: Number(s.w) || 0, r: Number(s.r) });
    const best = bestScoreOf(e.name);
    const earlier = e.sets.filter(x => x.done && x !== s).map(x => setScore({ w: Number(x.w) || 0, r: Number(x.r) }));
    if (best > 0 && score > Math.max(best, ...earlier) + 0.001) { toast(`New personal best: ${e.name}`, 'xp'); beep(); }
    startRest(REST_SECONDS[e.kind] || 75);
    commit();
  },
  addSet(d) {
    const e = state.active.exercises[d.i];
    const tail = e.sets[e.sets.length - 1];
    e.sets.push({ w: tail?.w ?? '', r: '', done: false });
    commit();
  },
  dropSet(d) { state.active.exercises[d.i].sets.pop(); commit(); },
  removeEx(d) {
    const e = state.active.exercises[d.i];
    if (e.sets.some(s => s.done) && !confirm(`Remove ${e.name} and its logged sets?`)) return;
    state.active.exercises.splice(Number(d.i), 1);
    commit();
  },
  addExActive() { openSheet({ type: 'addExercise', target: 'active' }); },
  finish() { finishWorkout(); },
  discard() {
    if (confirm('Throw away this workout? Its sets will not be saved.')) { state.active = null; stopRest(); releaseWake(); commit(); }
  },
  restAdd(d) { if (ui.rest) { ui.rest.endsAt += Number(d.s) * 1000; ui.rest.beeped = false; tickRest(); } },
  restSkip() { stopRest(); },
  exHistory(d) { openSheet({ type: 'exercise', name: d.name }); },
  openWorkout(d) { openSheet({ type: 'workout', id: d.id }); },
  deleteWorkout(d) {
    if (!confirm('Delete this workout? Its XP will be removed too.')) return;
    state.workouts = state.workouts.filter(w => w.id !== d.id);
    ui.sheet = null;
    commit();
  },
  editPlan() { openSheet({ type: 'editPlan', day: ui.planDay }); },
  planAdd() { openSheet({ type: 'addExercise', target: 'plan', day: ui.planDay }); },
  planRemove(d) { state.plan[ui.planDay].exercises.splice(Number(d.i), 1); commit(); },
  planUp(d) {
    const list = state.plan[ui.planDay].exercises, i = Number(d.i);
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
    commit();
  },
  fuelDay(d) { ui.fuelDate = addDays(ui.fuelDate, Number(d.n)); render(); },
  bodyDay(d) { ui.bodyDate = addDays(ui.bodyDate, Number(d.n)); render(); },
  addFood(d) { openSheet({ type: 'food', slot: d.slot, date: ui.fuelDate, tab: 'search', q: '' }); },
  foodTab(d) { ui.sheet.tab = d.tab; renderSheet(); },
  searchOnline() { searchOnline(); },
  pickFood(d) {
    const food = ui.foodIndex[d.id];
    openSheet({ type: 'amount', food, slot: ui.sheet.slot, date: ui.sheet.date, mode: 'serving', qty: 1 });
  },
  amtMode(d) {
    const s = ui.sheet;
    if (s.mode === d.mode) return;
    s.qty = d.mode === 'grams' ? round(s.qty * s.food.servingG) : round(s.qty / s.food.servingG, 2);
    s.mode = d.mode;
    renderSheet();
  },
  amtSet(d) {
    ui.sheet.qty = Number(d.q);
    document.getElementById('amt-qty').value = d.q;
    document.getElementById('amt-preview').innerHTML = previewHTML(macrosFor(ui.sheet.food, ui.sheet.mode, ui.sheet.qty));
  },
  amtSave() {
    const s = ui.sheet;
    if (!(s.qty > 0)) { toast('Enter an amount above zero'); return; }
    const m = macrosFor(s.food, s.mode, s.qty);
    const entry = { name: s.food.name, food: s.food, mode: s.mode, qty: s.qty, label: amountLabel(s.food, s.mode, s.qty), kcal: m.kcal, p: m.p, c: m.c, f: m.f };
    if (s.entryId) {
      const list = getDay(s.date).meals[s.slot];
      const i = list.findIndex(e => e.id === s.entryId);
      if (i >= 0) list[i] = { ...entry, id: s.entryId };
    } else {
      logEntry(s.date, s.slot, entry);
      rememberFood(s.food);
    }
    ui.sheet = null;
    commit();
  },
  amtDelete() {
    const s = ui.sheet, day = getDay(s.date);
    day.meals[s.slot] = day.meals[s.slot].filter(e => e.id !== s.entryId);
    ui.sheet = null;
    commit();
  },
  editEntry(d) {
    const e = (peekDay(ui.fuelDate).meals?.[d.slot] || []).find(x => x.id === d.id);
    if (e) openSheet({ type: 'amount', food: e.food, slot: d.slot, date: ui.fuelDate, mode: e.mode, qty: e.qty, entryId: e.id });
  },
  saveMeal(d) { openSheet({ type: 'saveMeal', slot: d.slot, date: ui.fuelDate, suggest: slotName(d.slot) }); },
  logMeal(d) {
    const m = state.savedMeals.find(x => x.id === d.id);
    if (!m) return;
    const date = ui.sheet?.date || ui.fuelDate;
    clone(m.items).forEach(e => logEntry(date, d.slot, e));
    toast(`${m.name} logged`);
    ui.sheet = null;
    commit();
  },
  deleteMeal(d) {
    if (!confirm('Delete this repeat meal? Days you already logged stay as they are.')) return;
    state.savedMeals = state.savedMeals.filter(m => m.id !== d.id);
    commit();
  },
  repeatYesterday(d) {
    const items = peekDay(addDays(ui.fuelDate, -1)).meals?.[d.slot] || [];
    clone(items).forEach(e => logEntry(ui.fuelDate, d.slot, e));
    commit();
  },
  applyCoach(d) {
    const delta = Number(d.d), t = state.targets;
    t.kcal += delta;
    t.carbs = Math.round(t.carbs + delta / 4); // calories come out of carbs, so protein and fat hold steady
    logTargets();
    toast(`Target is now ${fmt(t.kcal)} kcal`);
    commit();
  },
  export() { exportBackup(); },
  toggleSound() { state.settings.sound = !state.settings.sound; commit(); },
  closeSheet() { closeSheet(); },
};
function logTargets() {
  const k = today(), t = state.targets;
  state.targetLog = state.targetLog.filter(x => x.date !== k);
  state.targetLog.push({ date: k, kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat });
}

document.addEventListener('click', e => {
  if (e.target.id === 'sheet') { closeSheet(); return; }
  const el = e.target.closest('[data-a]');
  if (el && actions[el.dataset.a]) actions[el.dataset.a](el.dataset, el);
});

/* Typing updates the data without a redraw, so the keyboard stays open. */
document.addEventListener('input', e => {
  const el = e.target, d = el.dataset;
  if (d.bind === 'set') {
    state.active.exercises[d.i].sets[d.j][d.f] = el.value;
    scheduleSave();
  } else if (d.bind === 'usda') {
    state.settings.usdaKey = el.value.trim();
    scheduleSave();
  } else if (d.bind === 'planName') {
    state.plan[d.day].name = el.value || 'Workout';
    scheduleSave();
  } else if (d.input === 'foodq') {
    const s = ui.sheet;
    s.q = el.value;
    if (s.onlineFor !== s.q.trim()) { s.online = null; s.error = ''; s.onlineFor = null; s.loading = false; ui.searchToken++; }
    renderFoodResults();
  } else if (d.input === 'amt') {
    const s = ui.sheet;
    s.qty = num(el.value) || 0;
    document.getElementById('amt-preview').innerHTML = previewHTML(macrosFor(s.food, s.mode, s.qty));
  }
});
document.addEventListener('change', e => {
  const el = e.target, d = el.dataset;
  if (el.id === 'import-file' && el.files[0]) { importBackup(el.files[0]); el.value = ''; return; }
  if (d.bind === 'metric') {
    const day = getDay(ui.bodyDate), value = num(el.value);
    const before = bossInfo()?.hp;
    if (value == null || value < 0) delete day[d.f]; else day[d.f] = value;
    if (d.f === 'waist' && before != null && bossInfo()?.hp < before) { ui.bossHit = true; toast(`Boss hit for ${round(before - bossInfo().hp, 1)} cm`, 'xp'); }
    commit();
  } else if (d.bind === 'target') {
    const value = num(el.value);
    if (value > 0) {
      state.targets[d.f] = value;
      if (['kcal', 'protein', 'carbs', 'fat'].includes(d.f)) logTargets();
    }
    commit();
  } else if (d.bind === 'profile') {
    state.profile[d.f] = num(el.value);
    commit();
  }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const v = id => document.getElementById(id)?.value ?? '';
  if (e.target.id === 'welcome-form') {
    const k = today(), waist = num(v('w-waist')), goal = num(v('w-goal'));
    if (goal >= waist) { toast('Set a goal waist smaller than your current waist'); return; }
    state.profile = { name: v('w-name').trim(), startWaist: waist, goalWaist: goal, startDate: k };
    const day = getDay(k);
    day.weight = num(v('w-weight'));
    day.waist = waist;
    state.onboarded = true;
    logTargets();
    navigator.storage?.persist?.();
    commit();
  } else if (e.target.id === 'food-search') {
    document.getElementById('food-q').blur();
    searchOnline();
  } else if (e.target.id === 'food-create') {
    const s = ui.sheet, label = v('c-label').trim() || '1 serving';
    const food = { id: 'c:' + uid(), name: v('c-name').trim(), kcal: num(v('c-kcal')) || 0, p: num(v('c-p')) || 0, c: num(v('c-c')) || 0, f: num(v('c-f')) || 0, servingG: 100, servingLabel: label, noGrams: true, src: 'My food' };
    state.customFoods.unshift(food);
    openSheet({ type: 'amount', food, slot: s.slot, date: s.date, mode: 'serving', qty: 1 });
    scheduleSave();
  } else if (e.target.id === 'meal-form') {
    const s = ui.sheet, items = peekDay(s.date).meals?.[s.slot] || [];
    state.savedMeals.unshift({ id: uid(), name: v('meal-name').trim(), slot: s.slot, items: clone(items) });
    toast('Meal saved. It now shows up as a one-tap repeat.');
    ui.sheet = null;
    commit();
  } else if (e.target.id === 'ex-form') {
    const s = ui.sheet;
    const lo = Number(v('ex-lo')), hi = Number(v('ex-hi')), sets = Number(v('ex-sets'));
    const base = { name: v('ex-name').trim(), sets, lo: Math.min(lo, hi), hi: Math.max(lo, hi), muscle: v('ex-muscle'), kind: v('ex-kind'), unit: 'reps' };
    if (s.target === 'active') {
      state.active.exercises.push({ ...base, sets: Array.from({ length: sets }, () => ({ w: '', r: '', done: false })) });
      ui.sheet = null;
    } else {
      state.plan[s.day].exercises.push(base);
      if (state.plan[s.day].name === 'Rest') state.plan[s.day].name = 'Workout';
      ui.sheet = { type: 'editPlan', day: s.day };
    }
    commit();
  }
});
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
  else {
    // The app can sit open overnight, so jump to the new day on return.
    if (ui.openedOn !== today()) {
      ui.openedOn = today();
      ui.fuelDate = ui.bodyDate = today();
      ui.planDay = new Date().getDay();
    }
    requestWake();
    if (!document.activeElement || document.activeElement === document.body) render();
  }
});

/* ---------- Boot ---------- */
(async function boot() {
  const saved = await readSave();
  if (saved) state = { ...defaultState(), ...saved, settings: { ...defaultState().settings, ...saved.settings } };
  if (state.onboarded) { const s = computeStats(); ui.lastXP = s.xp; ui.lastLevel = s.level; }
  if (state.active) requestWake();
  render();
  setInterval(tickRest, 500);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
