'use strict';
// Micronutrients: what each logged food carries plus the supplements taken that day.
// Every food in the database lists them per 100 g as letter + number pairs (see tools/build-foods.mjs).
// Anything a source leaves out is estimated from typical foods of the same kind, per calorie, and marked as an estimate.

const MICRO_KEYS = ['fib', 'ca', 'fe', 'mg', 'zn', 'k', 'na', 'se', 'va', 'vc', 'vd', 've', 'vk', 'b1', 'b2', 'b3', 'b6', 'b12', 'fol', 'o3', 'ala'];
const MICRO_LETTERS = 'abcdefghijklmnopqrstu';
// Daily targets are ICMR-NIN 2020 RDAs for an adult Indian man doing moderate work (the reference on his supplement labels).
// Potassium and sodium are ICMR-NIN's suggested intake and limit. Fibre is ICMR-NIN's 15 g per 1,000 kcal at his calories.
// Omega-3 has no RDA: 500 mg EPA + DHA is the upper end of what WHO and heart associations suggest; ALA is the US adequate intake.
// Upper limits are the US National Academies' tolerable upper intakes; "suppOnly" limits apply to supplements alone.
const MICRO_INFO = {
  fib: { name: 'Fibre', unit: 'g', rda: 40, kind: 'Fibre and fats', ideas: 'dal, chana, rajma, oats, fruit, salad' },
  ca: { name: 'Calcium', unit: 'mg', rda: 1000, ul: 2500, kind: 'Minerals', ideas: 'milk, curd, paneer, ragi, tofu' },
  fe: { name: 'Iron', unit: 'mg', rda: 19, ul: 45, kind: 'Minerals', ideas: 'soya chunks, chana, rajma, spinach with lemon, jaggery' },
  mg: { name: 'Magnesium', unit: 'mg', rda: 440, ul: 350, suppOnly: true, kind: 'Minerals', ideas: 'pumpkin seeds, almonds, dal, bajra' },
  zn: { name: 'Zinc', unit: 'mg', rda: 17, ul: 40, kind: 'Minerals', ideas: 'pumpkin seeds, chana, chicken, paneer, cashews' },
  k: { name: 'Potassium', unit: 'mg', rda: 3510, kind: 'Minerals', ideas: 'banana, potato, coconut water, dal, curd' },
  na: { name: 'Sodium', unit: 'mg', limit: 2000, kind: 'Minerals', ideas: '' },
  se: { name: 'Selenium', unit: 'µg', rda: 40, ul: 400, kind: 'Minerals', ideas: 'eggs, fish, chicken, whole wheat' },
  va: { name: 'Vitamin A', unit: 'µg', rda: 1000, kind: 'Vitamins', ideas: 'carrot, papaya, mango, spinach, eggs' },
  vc: { name: 'Vitamin C', unit: 'mg', rda: 80, ul: 2000, kind: 'Vitamins', ideas: 'guava, amla, orange, lemon, capsicum' },
  vd: { name: 'Vitamin D', unit: 'µg', rda: 15, ul: 100, kind: 'Vitamins', ideas: 'midday sun on arms, eggs, fatty fish, fortified milk' },
  ve: { name: 'Vitamin E', unit: 'mg', rda: 10, ul: 1000, kind: 'Vitamins', ideas: 'almonds, sunflower seeds, peanuts' },
  vk: { name: 'Vitamin K', unit: 'µg', rda: 55, kind: 'Vitamins', ideas: 'spinach, methi, broccoli' },
  b1: { name: 'Thiamin (B1)', unit: 'mg', rda: 1.8, kind: 'Vitamins', ideas: 'whole wheat, dal, peanuts' },
  b2: { name: 'Riboflavin (B2)', unit: 'mg', rda: 2.5, kind: 'Vitamins', ideas: 'milk, curd, eggs, almonds' },
  b3: { name: 'Niacin (B3)', unit: 'mg', rda: 18, kind: 'Vitamins', ideas: 'chicken, peanuts, fish' },
  b6: { name: 'Vitamin B6', unit: 'mg', rda: 2.4, ul: 100, kind: 'Vitamins', ideas: 'banana, chicken, chana, potato' },
  b12: { name: 'Vitamin B12', unit: 'µg', rda: 2.5, kind: 'Vitamins', ideas: 'curd, milk, paneer, eggs, fish' },
  fol: { name: 'Folate', unit: 'µg', rda: 300, kind: 'Vitamins', ideas: 'dal, chana, spinach, rajma' },
  o3: { name: 'Omega-3 (EPA + DHA)', unit: 'mg', rda: 500, kind: 'Fibre and fats', ideas: 'fish, fish oil' },
  ala: { name: 'Omega-3 (ALA, plant)', unit: 'g', rda: 1.6, kind: 'Fibre and fats', ideas: 'flax seeds, walnuts, chia, mustard oil' },
};
const MICRO_KINDS = ['Vitamins', 'Minerals', 'Fibre and fats'];

/* ---------- Reading the database's micronutrient column ---------- */
// The food database description holds the group estimates; it loads once per app start.
const MicroMeta = {
  groups: null, pnns: null, loading: null,
  load() {
    if (this.groups || this.loading) return this.loading;
    this.loading = fetch('foods/meta.json').then(r => r.json()).then(m => {
      this.groups = (m.microGroups || []).map(g => g.perKcal);
      this.names = (m.microGroups || []).map(g => g.name);
      this.loading = null;
      if (ui.tab === 'micros' || ui.sheet?.type === 'checkIn') render();
    }).catch(() => { this.loading = null; });
    return this.loading;
  },
};
const MIXED_GROUP = 25; // "mixed dishes", used for online search results that carry no group

function decodeMicros(str) {
  const own = new Array(MICRO_KEYS.length).fill(null);
  if (!str) return { own, group: null };
  const [body, g] = str.split('#');
  body.replace(/([a-u])([\d.]+)/g, (m, letter, value) => { own[MICRO_LETTERS.indexOf(letter)] = Number(value); return m; });
  return { own, group: g === undefined || g === '' ? null : Number(g) };
}
// Never in exponent form: the letters a to u separate values, and 'e' is one of them.
const plainNum = x => { const v = Math.max(0, Number(x)); return v >= 100 ? String(Math.round(v)) : v >= 1 ? String(Math.round(v * 10) / 10) : String(Math.round(v * 1000) / 1000); };
function encodeMicros(obj, group) {
  return MICRO_KEYS.map((k, i) => obj[k] == null || !Number.isFinite(obj[k]) ? '' : MICRO_LETTERS[i] + plainNum(obj[k])).join('') + (group == null ? '' : `#${group}`);
}
// Online USDA results list nutrients by number, the same numbers the bundled database was built from.
const USDA_MICRO_NUMBERS = { fib: ['291'], ca: ['301'], fe: ['303'], mg: ['304'], zn: ['309'], k: ['306'], na: ['307'], se: ['317'], va: ['320'], vc: ['401'], vd: ['328'], ve: ['323'], vk: ['430'], b1: ['404'], b2: ['405'], b3: ['406'], b6: ['415'], b12: ['418'], fol: ['435', '417'], ala: ['851', '619'] };
function usdaMicros(nutrients) {
  const byNum = {};
  (nutrients || []).forEach(x => { if (x.nutrientNumber && x.value != null) byNum[x.nutrientNumber] = x.value; });
  const out = {};
  Object.entries(USDA_MICRO_NUMBERS).forEach(([k, nums]) => { const n = nums.find(x => byNum[x] != null); if (n) out[k] = byNum[n]; });
  if (byNum['629'] != null || byNum['621'] != null) out.o3 = ((byNum['629'] || 0) + (byNum['621'] || 0)) * 1000;
  return encodeMicros(out, MIXED_GROUP);
}
// Open Food Facts values are grams per 100 g.
const OFF_MICROS = [['fib', ['fiber_100g'], 1], ['ca', ['calcium_100g'], 1e3], ['fe', ['iron_100g'], 1e3], ['mg', ['magnesium_100g'], 1e3], ['zn', ['zinc_100g'], 1e3],
  ['k', ['potassium_100g'], 1e3], ['na', ['sodium_100g'], 1e3], ['se', ['selenium_100g'], 1e6], ['va', ['vitamin-a_100g'], 1e6], ['vc', ['vitamin-c_100g'], 1e3],
  ['vd', ['vitamin-d_100g'], 1e6], ['ve', ['vitamin-e_100g'], 1e3], ['vk', ['vitamin-k_100g'], 1e6], ['b1', ['vitamin-b1_100g'], 1e3], ['b2', ['vitamin-b2_100g'], 1e3],
  ['b3', ['vitamin-pp_100g'], 1e3], ['b6', ['vitamin-b6_100g'], 1e3], ['b12', ['vitamin-b12_100g'], 1e6], ['fol', ['vitamin-b9_100g', 'folates_100g'], 1e6],
  ['ala', ['alpha-linolenic-acid_100g'], 1]];
function offMicros(n) {
  const out = {};
  OFF_MICROS.forEach(([k, cols, mul]) => { const c = cols.find(x => n?.[x] != null && n[x] !== ''); if (c) out[k] = Number(n[c]) * mul; });
  if (n?.['eicosapentaenoic-acid_100g'] != null || n?.['docosahexaenoic-acid_100g'] != null) out.o3 = ((+n['eicosapentaenoic-acid_100g'] || 0) + (+n['docosahexaenoic-acid_100g'] || 0)) * 1000;
  return encodeMicros(out, MIXED_GROUP);
}

/* ---------- Amounts eaten ---------- */
// An entry keeps the food's micros per 100 g (mi) and its calories per 100 g (mk), so editing the
// entry's calories scales everything with it.
function entryMicros(e) {
  if (!e.mi) return null;
  const { own, group } = decodeMicros(e.mi);
  const factor = e.mk > 0 ? e.kcal / e.mk : (e.grams || 0) / 100;
  const perKcal = group != null ? MicroMeta.groups?.[group] : null;
  const value = [], est = [];
  own.forEach((x, i) => {
    if (x != null) { value[i] = x * factor; est[i] = 0; }
    else if (perKcal) { value[i] = perKcal[i] * e.kcal; est[i] = value[i]; }
    else { value[i] = null; est[i] = 0; }
  });
  return { value, est };
}
const suppTaken = k => (peekDay(k).supps || []).filter(id => state.supplements.some(s => s.id === id));
function dayMicros(k) {
  MicroMeta.load();
  const n = MICRO_KEYS.length;
  const r = { food: new Array(n).fill(0), est: new Array(n).fill(0), supp: new Array(n).fill(0), missing: new Array(n).fill(0), kcal: 0, noData: 0, items: 0 };
  Object.values(peekDay(k).meals || {}).forEach(list => list.forEach(e => {
    r.kcal += e.kcal || 0; r.items++;
    const m = entryMicros(e);
    if (!m) { r.noData += e.kcal || 0; MICRO_KEYS.forEach((_, i) => { r.missing[i] += e.kcal || 0; }); return; }
    m.value.forEach((x, i) => { if (x == null) r.missing[i] += e.kcal || 0; else { r.food[i] += x; r.est[i] += m.est[i]; } });
  }));
  const taken = suppTaken(k);
  state.supplements.filter(s => taken.includes(s.id)).forEach(s => MICRO_KEYS.forEach((key, i) => { r.supp[i] += s.n[key] || 0; }));
  return r;
}
// Average day across the days with food logged; supplements count on every one of those days they were ticked.
function periodMicros(days) {
  const n = MICRO_KEYS.length;
  const sum = { food: new Array(n).fill(0), est: new Array(n).fill(0), supp: new Array(n).fill(0), missing: new Array(n).fill(0), kcal: 0, noData: 0 };
  days.forEach(k => {
    const d = dayMicros(k);
    ['food', 'est', 'supp', 'missing'].forEach(f => d[f].forEach((x, i) => { sum[f][i] += x; }));
    sum.kcal += d.kcal; sum.noData += d.noData;
  });
  const c = Math.max(days.length, 1);
  ['food', 'est', 'supp', 'missing'].forEach(f => { sum[f] = sum[f].map(x => x / c); });
  sum.kcal /= c; sum.noData /= c; sum.days = days.length;
  return sum;
}
const microTarget = key => MICRO_INFO[key].rda ?? MICRO_INFO[key].limit;
function microStatus(key, total, suppPart) {
  const info = MICRO_INFO[key];
  if (info.limit) return total > info.limit ? 'over' : 'ok';
  if (info.ul && (info.suppOnly ? suppPart : total) > info.ul) return 'high';
  const pct = total / info.rda;
  return pct >= 1 ? 'ok' : pct >= 0.7 ? 'close' : 'low';
}
const microFmt = (x, unit) => x == null ? '–' : unit === 'g' ? round(x, 1) : x >= 100 ? fmt(Math.round(x)) : x >= 10 ? Math.round(x) : round(x, 1);
// Days that count for averages: any food logged, and today only once it's most of the way to target (same rule as check-ins).
const microDays = (from, to) => datesIn(from, to).filter(k => dayTotals(k).items > 0 && (k < today() || dayTotals(k).kcal >= targetsOn(k).kcal * 0.8));

/* ---------- Filling in micros for entries logged before this existed ---------- */
let backfillRunning = false;
async function backfillMicros() {
  if (backfillRunning || !ui.foodDb?.done) return;
  const want = [];
  Object.entries(state.days).forEach(([k, d]) => Object.values(d.meals || {}).forEach(list => list.forEach(e => {
    if (e.mi === undefined && e.source && e.source !== 'm') want.push(e);
  })));
  [...state.recentFoods, ...state.savedMeals.flatMap(m => m.items)].forEach(f => { if (f.mi === undefined && (f.src || f.source) && (f.src || f.source) !== 'm') want.push(f); });
  if (!want.length) return;
  backfillRunning = true;
  try {
    const names = [...new Set(want.map(e => `${e.src || e.source}\t${e.name}\t${e.brand || ''}`))];
    const found = (await Foods.send({ type: 'lookup', items: names })).found || {};
    want.forEach(e => {
      const hit = found[`${e.src || e.source}\t${e.name}\t${e.brand || ''}`];
      e.mi = hit ? hit.mi : '';
      if (hit) e.mk = hit.kcal;
    });
    scheduleSave();
    if (ui.tab === 'micros') render();
  } finally { backfillRunning = false; }
}

/* ---------- Screens ---------- */
function microRow(key, r, opts = {}) {
  const i = MICRO_KEYS.indexOf(key), info = MICRO_INFO[key];
  const food = r.food[i], supp = r.supp[i], total = food + supp, target = microTarget(key);
  const status = microStatus(key, total, supp);
  const fp = clamp(food / target * 100, 0, 100), sp = clamp(supp / target * 100, 0, 100 - fp);
  const estShare = food > 0 ? r.est[i] / food : 0;
  const pct = Math.round(total / target * 100);
  const note = info.limit ? `limit ${fmt(info.limit)} ${info.unit}` : `${pct}% of ${microFmt(target, info.unit)} ${info.unit}`;
  return `<li class="mi-row ${status}" data-a="openSheet" data-type="micro" data-key="${key}" data-k="${opts.k || ''}" data-range="${opts.range || 'day'}">
    <div class="mi-top"><span>${esc(info.name)}${estShare >= 0.3 ? '<em class="mi-est" title="Mostly estimated">~</em>' : ''}</span><b>${microFmt(total, info.unit)} ${info.unit}</b></div>
    <div class="mac-track mi-track"><i class="mi-food" style="width:${fp}%"></i><i class="mi-supp" style="width:${sp}%"></i></div>
    <div class="mi-foot"><span>${note}</span><span class="mi-tag">${{ ok: info.limit ? 'Under limit' : 'On target', close: 'Close', low: 'Low', over: 'Over limit', high: 'Above upper limit' }[status]}</span></div>
  </li>`;
}
// On Today until all of today's supplements are ticked.
function suppToday() {
  const taken = suppTaken(today()), all = taken.length >= state.supplements.length;
  if (!state.supplements.length) return '';
  return `<section class="block card supp-today"><div class="q-head"><h2>Supplements</h2>${all ? `<span class="dim sm">All ${state.supplements.length} taken</span>` : `<button class="link strong" data-a="allSupps" data-k="${today()}">Took all</button>`}</div>
    <div class="supp-chips">${state.supplements.map(s => `<button class="supp-chip${taken.includes(s.id) ? ' on' : ''}" data-a="toggleSupp" data-id="${s.id}" data-k="${today()}" aria-pressed="${taken.includes(s.id)}">${taken.includes(s.id) ? i('tick') : ''}${esc(s.name)}</button>`).join('')}</div></section>`;
}
function suppCard(k) {
  const taken = suppTaken(k);
  return `<section class="block card"><div class="q-head"><h2>Supplements</h2><span class="dim sm">${taken.length} of ${state.supplements.length} taken</span></div>
    <div class="supp-list">${state.supplements.map(s => `<button class="supp${taken.includes(s.id) ? ' on' : ''}" data-a="toggleSupp" data-id="${s.id}" data-k="${k}" aria-pressed="${taken.includes(s.id)}">
      <i class="supp-tick">${i('tick')}</i><span><b>${esc(s.name)}</b><small>${esc(s.detail)}</small></span></button>`).join('')}</div>
    ${taken.length < state.supplements.length ? `<button class="link strong" data-a="allSupps" data-k="${k}">Took all ${state.supplements.length}</button>` : ''}
  </section>`;
}
function viewMicros() {
  MicroMeta.load();
  if (!ui.microRange) ui.microRange = 'day';
  const k = ui.foodDate, week = ui.microRange === 'week';
  const days = week ? microDays(addDays(today(), -6), today()) : [k];
  const r = week ? periodMicros(days) : dayMicros(k);
  const statuses = MICRO_KEYS.map((key, i) => microStatus(key, r.food[i] + r.supp[i], r.supp[i]));
  const good = statuses.filter(s => s === 'ok').length;
  const lows = MICRO_KEYS.filter((key, i) => statuses[i] === 'low');
  const matched = r.kcal > 0 ? Math.round((1 - r.noData / r.kcal) * 100) : 0;
  const estTotal = MICRO_KEYS.reduce((s, _, i) => s + (r.food[i] > 0 ? r.est[i] / r.food[i] : 0), 0) / MICRO_KEYS.length;
  const empty = week ? !days.length : !dayTotals(k).items;
  return `
  <header class="top"><div class="datebar">
    ${week ? '<span class="ic-btn"></span>' : `<button class="ic-btn" data-a="foodDay" data-n="-1" aria-label="Previous day">${i('back')}</button>`}
    <h1>${week ? 'Last 7 days' : niceDate(k)}</h1>
    ${!week && k < today() ? `<button class="ic-btn" data-a="foodDay" data-n="1" aria-label="Next day">${i('next')}</button>` : '<span class="ic-btn"></span>'}
  </div></header>
  <div class="seg mi-seg" role="tablist">${[['day', 'Day'], ['week', '7-day average']].map(([v, l]) => `<button class="${ui.microRange === v ? 'on' : ''}" data-a="microRange" data-v="${v}">${l}</button>`).join('')}</div>
  ${week ? '' : suppCard(k)}
  <section class="hero left">
    ${week && empty ? '' : `<p class="big-num"><b>${good}</b><span class="dim"> / ${MICRO_KEYS.length}</span></p>`}
    <p class="dim">${empty ? (week ? 'No days with food logged in the last week yet.' : 'Log food to see your vitamins and minerals. Supplements count already.') : `nutrients on target${week ? `, average of ${days.length} ${days.length === 1 ? 'day' : 'days'}` : ''}`}</p>
    ${!empty ? `<p class="sm dim">${matched}% of calories matched to nutrient data${estTotal >= 0.05 ? `, ${Math.round(estTotal * 100)}% of values estimated from similar foods (~)` : ''}.</p>` : ''}
    ${lows.length && !empty ? `<p class="sm">Low: ${lows.map(x => esc(MICRO_INFO[x].name)).join(', ')}. Tap one for food ideas.</p>` : ''}
  </section>
  ${week && empty ? '' : MICRO_KINDS.map(kind => `<section class="block"><h2>${kind}</h2><ul class="mi-list">${MICRO_KEYS.filter(key => MICRO_INFO[key].kind === kind).map(key => microRow(key, r, { k, range: ui.microRange })).join('')}</ul></section>`).join('')}
  <p class="dim sm center mi-legend"><span class="mi-dot food"></span>Food <span class="mi-dot supp"></span>Supplements. Targets: ICMR-NIN 2020, adult man.</p>
  ${week ? suppCard(today()) : ''}`;
}
// What supplied a nutrient, biggest first, plus ideas when it's low.
function microSheet(s) {
  const key = s.key, i = MICRO_KEYS.indexOf(key), info = MICRO_INFO[key];
  const week = s.range === 'week';
  const days = week ? microDays(addDays(today(), -6), today()) : [s.k || today()];
  const by = new Map();
  days.forEach(k => {
    Object.values(peekDay(k).meals || {}).forEach(list => list.forEach(e => {
      const m = entryMicros(e);
      if (!m || m.value[i] == null) return;
      const row = by.get(e.name) || { name: e.name, v: 0, est: 0 };
      row.v += m.value[i]; row.est += m.est[i];
      by.set(e.name, row);
    }));
    const taken = suppTaken(k);
    state.supplements.filter(x => taken.includes(x.id) && x.n[key]).forEach(x => {
      const row = by.get(`supp:${x.id}`) || { name: `${x.name} (supplement)`, v: 0, est: 0 };
      row.v += x.n[key]; by.set(`supp:${x.id}`, row);
    });
  });
  const c = Math.max(days.length, 1);
  const rows = [...by.values()].map(x => ({ ...x, v: x.v / c, est: x.est / c })).sort((a, b) => b.v - a.v).slice(0, 12);
  const total = rows.reduce((t, x) => t + x.v, 0);
  const status = microStatus(key, total, rows.filter(x => /\(supplement\)$/.test(x.name)).reduce((t, x) => t + x.v, 0));
  return `${sheetHead(info.name, week ? 'Average day, last 7 days' : niceDate(days[0]))}
    <p class="big-num center"><b>${microFmt(total, info.unit)}</b><span class="dim"> ${info.unit}</span></p>
    <p class="dim center">${info.limit ? `Keep under ${fmt(info.limit)} ${info.unit} a day` : `Target ${microFmt(info.rda, info.unit)} ${info.unit} a day`}${info.ul ? `. Upper limit ${fmt(info.ul)} ${info.unit}${info.suppOnly ? ' from supplements' : ''}` : ''}.</p>
    ${rows.length ? `<ul class="rows mi-sources">${rows.map(x => `<li><span>${esc(x.name)}${x.v > 0 && x.est / x.v >= 0.5 ? ' <em class="mi-est">~</em>' : ''}</span><b>${microFmt(x.v, info.unit)} ${info.unit}</b></li>`).join('')}</ul>` : '<p class="dim center">Nothing logged with this nutrient yet.</p>'}
    ${info.ideas && status !== 'ok' && status !== 'high' ? `<p class="sm"><b>Good sources:</b> ${esc(info.ideas)}.</p>` : ''}
    ${key === 'mg' ? '<p class="sm dim">The 350 mg upper limit is for supplements alone and is about loose stools. Glycinate is the gentlest form; mention it at a check-in if it bothers you.</p>' : ''}
    <p class="sm dim">~ means the food\'s source didn\'t list this nutrient, so it\'s estimated from similar foods.</p>`;
}

/* ---------- Check-in report ---------- */
function microReport(from, to) {
  const days = microDays(from, to);
  const all = datesIn(from, to).filter(k => k <= today());
  const supps = [
    'Supplements taken: ' + state.supplements.map(s => `${s.name} ${all.filter(k => suppTaken(k).includes(s.id)).length}/${all.length} days`).join(', '),
    'Supplement labels: ' + state.supplements.map(s => `${s.name} (${s.detail}): ${s.extra}`).join('; '),
  ];
  if (!days.length) return ['MICRONUTRIENTS', 'No days with food logged.', ...supps];
  const r = periodMicros(days);
  const lines = ['MICRONUTRIENTS (average day, food + supplements; targets ICMR-NIN 2020 adult man)'];
  const matched = r.kcal > 0 ? Math.round((1 - r.noData / r.kcal) * 100) : 0;
  lines.push(`Based on ${days.length} logged ${days.length === 1 ? 'day' : 'days'}; ${matched}% of calories matched to nutrient data.`);
  MICRO_KEYS.forEach((key, i) => {
    const info = MICRO_INFO[key], total = r.food[i] + r.supp[i], st = microStatus(key, total, r.supp[i]);
    const est = r.food[i] > 0 ? Math.round(r.est[i] / r.food[i] * 100) : 0;
    const target = info.limit ? `limit ${info.limit}` : `${Math.round(total / info.rda * 100)}% of ${info.rda}`;
    const parts = [`food ${microFmt(r.food[i], info.unit)}`, r.supp[i] ? `supplements ${microFmt(r.supp[i], info.unit)}` : ''].filter(Boolean).join(' + ');
    lines.push(`- ${info.name}: ${microFmt(total, info.unit)} ${info.unit} (${parts}), ${target}${est >= 30 ? `, ${est}% estimated` : ''}${st === 'low' ? ' [LOW]' : st === 'over' ? ' [OVER LIMIT]' : st === 'high' ? ' [ABOVE UPPER LIMIT]' : ''}`);
  });
  return [...lines, ...supps];
}
