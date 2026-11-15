'use strict';
// Weekly check-ins with Claude, who acts as the coach instead of a formula. The app gathers the numbers and
// reminds; the decisions about calories, protein and lifts are made in the check-in conversation.
const MONTHLY_EVERY = 4;   // every 4th check-in is a monthly review
const MIN_GAP_DAYS = 4;    // an early or late check-in doesn't make the next one land a day later

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const nextWeekday = (from, wd) => { let k = from; while (parseKey(k).getDay() !== wd) k = addDays(k, 1); return k; };

function checkInStatus() {
  const c = state.checkIn, now = today();
  const last = c.done[c.done.length - 1] || null;
  const due = last ? nextWeekday(addDays(last.date, MIN_GAP_DAYS), c.weekday) : nextWeekday(addDays(c.start || now, 1), c.weekday);
  const number = c.done.length + 1;
  const monthly = number % MONTHLY_EVERY === 0;
  const from = monthly ? addDays(now, -27) : last ? addDays(last.date, 1) : (c.start || addDays(now, -6));
  return { due, isDue: now >= due, late: daysBetween(due, now), number, monthly, last, from: from > now ? now : from, to: now };
}
const checkInName = s => (s.monthly ? 'Monthly review' : 'Weekly check-in');

/* ---------- The report ---------- */
const dayLabel = k => parseKey(k).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
function datesIn(from, to) { const out = []; for (let k = from; k <= to; k = addDays(k, 1)) out.push(k); return out; }
function periodNumbers(from, to) {
  const days = datesIn(from, to);
  const weights = days.filter(k => peekDay(k).weight != null).map(k => ({ k, v: peekDay(k).weight }));
  // Today's food isn't finished yet, so it only counts once it's close to target.
  const food = days.filter(k => dayTotals(k).items > 0 && (k < today() || dayTotals(k).kcal >= targetsOn(k).kcal * 0.8));
  return {
    days, weights, food,
    weight: weights.length ? avg(weights.map(w => w.v)) : null,
    kcal: food.length ? avg(food.map(k => dayTotals(k).kcal)) : null,
    protein: food.length ? avg(food.map(k => dayTotals(k).p)) : null,
    workouts: state.workouts.filter(w => w.date >= from && w.date <= to),
  };
}
function plannedRow(name) {
  for (const d of state.program.days) { const e = d.exercises.find(x => x.name === name); if (e) return e; }
  return null;
}
// Each lift trained in the period: last session, best set against before, and what the app would load next.
function liftReport(from, to) {
  const names = [...new Set(state.workouts.filter(w => w.date >= from && w.date <= to).flatMap(w => w.exercises.map(e => e.name)))];
  return names.map(name => {
    const hist = exerciseHistory(state.workouts, name, 40).filter(h => !h.deload);
    const inP = hist.filter(h => h.date >= from && h.date <= to), before = hist.filter(h => h.date < from);
    if (!inP.length) return null;
    const unit = libEntry(name)?.unit || 'reps';
    const best = list => Math.max(0, ...list.map(h => bestScore(h.sets)));
    const now = best(inP), was = before.length ? best(before.slice(0, 4)) : null;
    const loaded = inP[0].sets.some(s => isWorking(s) && s.w > 0);
    // Lifts outside the plan (home versions, added ones) keep the range they were trained with.
    const entry = state.workouts.filter(w => w.date >= from && w.date <= to).flatMap(w => w.exercises).filter(e => e.name === name).pop() || {};
    const lib = libEntry(name);
    const pe = plannedRow(name) || { name, sets: inP[0].sets.filter(isWorking).length, lo: entry.lo ?? lib?.lo ?? 8, hi: entry.hi ?? lib?.hi ?? 12, unit, inc: lib?.inc ?? 2.5 };
    const next = suggestNext(pe, hist);
    return {
      name, unit, loaded, sessions: inP.length,
      last: `${lastTimeText(inP[0].sets, unit)} (${dayLabel(inP[0].date)})`,
      range: `${pe.lo} to ${pe.hi} ${unit === 'sec' ? 's' : 'reps'}`,
      now, was, pct: was ? round((now / was - 1) * 100, 1) : null,
      ready: next.chosen === 'weight' && next.kind !== 'first', stalled: next.stalled,
      next: next.w != null && next.reps?.length ? `${next.w ? `${round(next.w, 2)} kg × ` : ''}${next.reps.join(', ')}` : next.headline,
    };
  }).filter(Boolean);
}

/* ---------- Report details: every food, every set ---------- */
// micros.js loads after this file, so its keys are looked up when a report is built.
const entryMicro = key => e => { const m = entryMicros(e), i = MICRO_KEYS.indexOf(key); return m && m.value[i] != null ? m.value[i] : null; };
const entryNa = e => entryMicro('na')(e), entryFib = e => entryMicro('fib')(e);
function foodDetail(now) {
  const out = [];
  const logged = now.days.filter(k => dayTotals(k).items);
  if (!logged.length) return out;
  const all = logged.flatMap(k => Object.values(peekDay(k).meals || {}).flat());
  const avgOf = f => all.some(e => f(e) != null) ? sum(logged.map(k => sum(Object.values(peekDay(k).meals || {}).flat().map(e => f(e) || 0)))) / logged.length : null;
  const show = (v, unit, big) => v == null ? `– ${unit}` : `${big ? fmt(v) : Math.round(v)} ${unit}`;
  out.push(`Average macros on logged days: ${show(avgOf(e => e.kcal), 'kcal', 1)}, ${show(avgOf(e => e.p), 'g protein')}, ${show(avgOf(e => e.c), 'g carbs')}, ${show(avgOf(e => e.f), 'g fat')}, ${show(avgOf(entryFib), 'g fibre')}, ${show(avgOf(entryNa), 'mg sodium', 1)}.`);
  out.push('', 'FOOD LOG (every item: kcal, protein/carbs/fat in g, sodium in mg)');
  logged.forEach(k => {
    const d = dayTotals(k), tg = targetsOn(k), meals = peekDay(k).meals || {};
    const nas = Object.values(meals).flat().map(entryNa).filter(x => x != null);
    out.push(`${dayLabel(k)}: ${fmt(d.kcal)}/${fmt(tg.kcal)} kcal, P ${Math.round(d.p)}/${tg.protein}, C ${Math.round(d.c)}/${tg.carbs}, F ${Math.round(d.f)}/${tg.fat}, sodium ${nas.length ? `${fmt(sum(nas))} mg` : 'no data'}`);
    SLOTS.forEach(([slot, label]) => {
      const list = meals[slot] || [];
      if (!list.length) return;
      out.push(`  ${label}: ${list.map(e => { const n = entryNa(e); return `${e.at != null ? `${clock24(e.at)} ` : ''}${e.name} (${e.amount || `${round(e.grams || 0)} g`}) ${Math.round(e.kcal)} kcal ${Math.round(e.p)}/${Math.round(e.c)}/${Math.round(e.f)}${n != null ? `, Na ${Math.round(n)}` : ''}`; }).join('; ')}`);
    });
  });
  const top = (f, unit, n = 6) => {
    const by = {};
    all.forEach(e => { const v = f(e); if (!v) return; const x = (by[e.name] = by[e.name] || { v: 0, times: 0 }); x.v += v; x.times++; });
    return Object.entries(by).sort((a, b) => b[1].v - a[1].v).slice(0, n).map(([name, x]) => `${name} ${fmt(x.v / logged.length)} ${unit}/day (${x.times}×)`).join(', ');
  };
  out.push('', `Biggest sodium sources: ${top(entryNa, 'mg') || 'no data'}`);
  out.push(`Biggest calorie sources: ${top(e => e.kcal, 'kcal')}`);
  out.push(`Biggest fat sources: ${top(e => e.f, 'g')}`);
  return out;
}
const setLine = (sets, unit) => sets.map(x => `${x.type === 'warmup' ? 'W ' : x.type === 'drop' ? 'D ' : ''}${x.w ? `${round(x.w, 2)}×${x.r}` : `${x.r}${unit === 'sec' ? 's' : ''}`}`).join(', ');
function trainingDetail(from, to, now) {
  const out = [];
  const missed = now.days.filter(k => plannedDay(k) && !workoutsOn(k).length && k < today());
  if (missed.length) out.push(`Missed planned days: ${missed.map(k => `${dayLabel(k)} ${plannedDay(k).name}`).join(' | ')}`);
  out.push('', 'EVERY SESSION (kg×reps, W = warm-up, D = drop set)');
  now.workouts.forEach(w => {
    const mins = w.finishedAt && w.startedAt && w.finishedAt > w.startedAt ? Math.round((w.finishedAt - w.startedAt) / 60000) : null;
    const plan = w.dayId ? findDay(w.dayId) : null;
    const done = new Set(w.exercises.flatMap(e => [e.name, e.swappedFrom].filter(Boolean)));
    const skipped = w.place === 'home' ? [] : (plan?.exercises || []).filter(e => !done.has(e.name)).map(e => e.name);
    out.push(`${dayLabel(w.date)} ${w.name}${w.place === 'home' ? ' (at home)' : ''}${mins && mins < 300 ? `, ${mins} min` : ''}${w.deload ? ', lighter week' : ''}`);
    w.exercises.forEach(e => out.push(`  ${e.name}${e.swappedFrom ? ` (instead of ${e.swappedFrom})` : ''}: ${setLine(e.sets, e.unit)}`));
    if (skipped.length) out.push(`  Skipped from the plan: ${skipped.join(', ')}`);
  });
  // Hard sets per muscle: a working set counts fully for the main muscle and half for helpers.
  const vol = {};
  now.workouts.forEach(w => w.exercises.forEach(e => {
    const n = e.sets.filter(x => isWorking(x)).length;
    if (e.p) vol[e.p] = (vol[e.p] || 0) + n;
    (e.s || []).forEach(m => { vol[m] = (vol[m] || 0) + n / 2; });
  }));
  const target = state.muscleGoal || { lo: 10, hi: 20 };
  const muscles = [...new Set([...Object.keys(MUSCLE_NAMES), ...Object.keys(vol)])];
  out.push('', `SETS PER MUSCLE THIS WEEK (main muscle 1, helper ½; target ${target.lo} to ${target.hi}; warm-ups not counted)`);
  const minor = new Set(['forearms', 'lower back', 'front delts']); // trained enough by the big lifts
  out.push(muscles.map(m => `${MUSCLE_NAMES[m] || m} ${round(vol[m] || 0, 1)}${(vol[m] || 0) < target.lo && !minor.has(m) ? ' [LOW]' : (vol[m] || 0) > target.hi ? ' [HIGH]' : ''}`).join(' | '));
  // How the coach's targets went.
  const c = state.coach;
  if (c?.lifts && c.from <= to) {
    const res = Object.entries(c.lifts).map(([name, t]) => {
      const sess = state.workouts.find(w => w.date >= c.from && w.date <= to && w.exercises.some(e => e.name === name));
      if (!sess) return null;
      const e = sess.exercises.find(x => x.name === name), work = e.sets.filter(isWorking);
      const hit = t.reps.every((r, i) => work[i] && work[i].r >= r && (t.w == null || work[i].w >= t.w));
      return `- ${name}: target ${t.w ? `${t.w} kg × ` : ''}${t.reps.join(', ')} → did ${setLine(e.sets, e.unit)} ${hit ? '[HIT]' : '[MISSED]'}`;
    }).filter(Boolean);
    const planNames = new Set(state.program.days.flatMap(d => d.exercises.map(e => e.name)));
    const notDone = Object.keys(c.lifts).filter(n => planNames.has(n) && !state.workouts.some(w => w.date >= c.from && w.date <= to && w.exercises.some(e => e.name === n)));
    out.push('', `COACH TARGETS (set ${dayLabel(c.date)})`);
    out.push(...(res.length ? res : ['None trained yet.']));
    if (notDone.length) out.push(`Plan lifts with a target that were not done: ${notDone.join(', ')}`);
  }
  return out;
}

function checkInReport(s = checkInStatus()) {
  const p = state.profile, t = state.targets, now = periodNumbers(s.from, s.to);
  const prevTo = addDays(s.from, -1), prevFrom = addDays(s.from, -Math.max(now.days.length, 7));
  const prev = periodNumbers(prevFrom, prevTo);
  const r1 = v => (v == null ? '–' : round(v, 1));
  const lines = [];
  lines.push(`REPSOLUTE ${checkInName(s).toUpperCase()} #${s.number}: ${dayLabel(s.from)} to ${dayLabel(s.to)}`);
  lines.push(`Goal: ${GOALS[state.goal.mode]?.label || state.goal.mode}. Targets: ${fmt(t.kcal)} kcal, ${t.protein} g protein${Object.entries(t.dayProtein || {}).map(([wd, g]) => ` (${g} g on ${DAY_NAMES[wd]}s)`).join('')}, ${t.carbs} g carbs, ${t.fat} g fat.`);
  const lastSet = state.targetLog[state.targetLog.length - 1];
  if (lastSet) lines.push(`Targets last changed ${dayLabel(lastSet.date)}: ${lastSet.reason || 'edited'}.`);
  lines.push(`Me: ${[p.heightCm && `${p.heightCm} cm`, p.age && `${p.age} y`, p.sex].filter(Boolean).join(', ') || 'details not set'}. Plan: ${state.program.name}, ${Object.keys(state.program.schedule).length} days a week.`);

  lines.push('', 'WEIGHT (kg, morning)');
  lines.push(now.weights.length ? now.weights.map(w => `${dayLabel(w.k)} ${w.v}`).join(' | ') : 'No weigh-ins.');
  lines.push(`Average ${r1(now.weight)} from ${now.weights.length} weigh-ins. Previous ${prev.days.length} days: ${r1(prev.weight)} from ${prev.weights.length}.${now.weight != null && prev.weight != null ? ` Change ${signed(round(now.weight - prev.weight, 2), 2)} kg.` : ''}`);

  const waist = series('waist', 0).filter(w => w.date <= s.to);
  lines.push('', 'WAIST (cm, at the belly button)');
  lines.push(waist.length ? waist.slice(-6).map(w => `${dayLabel(w.date)} ${round(w.v, 1)}`).join(' | ') : 'Not measured yet.');

  lines.push('', 'FOOD');
  lines.push(`Logged ${now.food.length} of ${now.days.length} days. Average on logged days: ${now.kcal == null ? '–' : fmt(now.kcal)} kcal, ${now.protein == null ? '–' : Math.round(now.protein)} g protein. Previous period: ${prev.kcal == null ? '–' : fmt(prev.kcal)} kcal, ${prev.protein == null ? '–' : Math.round(prev.protein)} g protein.`);
  lines.push(now.days.map(k => {
    const d = dayTotals(k), tg = targetsOn(k);
    return d.items ? `${dayLabel(k)} ${fmt(d.kcal)} kcal, ${Math.round(d.p)}/${tg.protein} g P` : `${dayLabel(k)} not logged`;
  }).join(' | '));
  lines.push(...foodDetail(now));

  if (s.monthly) {
    lines.push('', 'WEEK BY WEEK');
    for (let n = 0; n < 4; n++) {
      const a = addDays(s.from, n * 7), b = n === 3 ? s.to : addDays(a, 6), w = periodNumbers(a, b);
      const wst = waist.filter(x => x.date >= a && x.date <= b).pop();
      const rw = rhythmWeek(w.days);
      lines.push(`${dayLabel(a)}: weight ${r1(w.weight)}, ${w.kcal == null ? '–' : fmt(w.kcal)} kcal, ${w.protein == null ? '–' : Math.round(w.protein)} g P, ${w.workouts.length} workouts${wst ? `, waist ${round(wst.v, 1)}` : ''}${rw ? `, ${rw}` : ''}`);
    }
  }

  const planned = now.days.filter(k => plannedDay(k)).length;
  lines.push('', 'TRAINING');
  lines.push(`${now.workouts.length} workouts, ${planned} planned. ${now.workouts.map(w => `${dayLabel(w.date)} ${w.name}`).join(' | ')}`);
  lines.push(...trainingDetail(s.from, s.to, now));
  const lifts = liftReport(s.from, s.to);
  if (lifts.length) {
    lines.push('', 'LIFTS (best set as estimated 1-rep max, against the 4 sessions before this period)');
    lifts.forEach(l => {
      const change = l.pct == null ? 'first time' : l.loaded ? `e1RM ${round(l.was, 1)} → ${round(l.now, 1)} kg (${signed(l.pct, 1)}%)` : `${round(l.was)} → ${round(l.now)} ${l.unit} (${signed(l.pct, 1)}%)`;
      lines.push(`- ${l.name}: ${l.last}. Range ${l.range}. ${change}. App's next: ${l.next}${l.ready ? ' [READY TO ADD WEIGHT]' : ''}${l.stalled ? ' [STALLED 4 SESSIONS]' : ''}`);
    });
  }

  lines.push('', ...microReport(s.from, s.to));

  if (state.coach?.others) lines.push(`Also taken daily, not in the numbers above (no vitamins or minerals): ${state.coach.others}`);
  const cardio = now.days.map(k => peekDay(k).cardio).filter(x => x != null);
  const water = now.days.map(k => peekDay(k).water).filter(x => x != null);
  lines.push(...rhythmReport(now.days.filter(k => k <= today())));
  lines.push('', 'RECOVERY');
  lines.push(cardio.length ? `Cardio ${fmt(sum(cardio))} minutes in total.` : 'No cardio logged.');
  if (water.length) lines.push(`Water ${round(avg(water), 1)} L a day (${water.length} days logged).`);
  const changes = sortedTargetLog().filter(x => x.date >= addDays(s.from, -7) && x.date <= s.to);
  if (changes.length) lines.push('', 'TARGET CHANGES', ...changes.map(x => `${dayLabel(x.date)}: ${fmt(x.kcal)} kcal, ${x.protein} g P, ${x.carbs} g C, ${x.fat} g F (${x.reason || 'edited'})`));
  lines.push('', 'HOW THE WEEK FELT', state.checkIn.notes?.trim() || '(nothing written)');
  return lines.join('\n');
}

/* ---------- Where it shows ---------- */
function checkInCard() {
  const s = checkInStatus();
  if (!s.isDue) return '';
  return `<button class="card checkin-due" data-a="openSheet" data-type="checkIn">
    <span><b>${checkInName(s)} ${s.late > 0 ? `was due ${s.late === 1 ? 'yesterday' : `${s.late} days ago`}` : 'is due today'}</b>
    <em>Measure your waist, then copy your report for Claude.</em></span>${i('next')}</button>`;
}
function checkInPanel() {
  const s = checkInStatus(), t = state.targets;
  const when = s.isDue ? (s.late > 0 ? `Overdue since ${dayLabel(s.due)}` : 'Due today') : `${DAY_NAMES[parseKey(s.due).getDay()]} ${shortDate(s.due)}`;
  const vegDays = Object.entries(t.dayProtein || {}).map(([wd, g]) => `${g} g on ${DAY_NAMES[wd]}s`).join(', ');
  return `<section class="block coach${s.isDue ? ' hot' : ''}"><h2>Your coach</h2>
    <h3>${s.isDue ? `${checkInName(s)} ${s.late > 0 ? 'overdue' : 'due'}` : `Next: ${checkInName(s).toLowerCase()}`}</h3>
    <p>Every ${DAY_NAMES[state.checkIn.weekday]}, copy your report and send it to Claude. Your calories, protein and lifts get set from how the week went, and every ${MONTHLY_EVERY}th check-in looks back over the month.</p>
    <dl class="kv">
      <div><dt>Check-in</dt><dd>${when}</dd></div>
      <div><dt>Calories</dt><dd>${fmt(t.kcal)} kcal a day</dd></div>
      <div><dt>Protein</dt><dd>${t.protein} g${vegDays ? `, ${vegDays}` : ''}</dd></div>
      <div><dt>Last check-in</dt><dd>${s.last ? dayLabel(s.last.date) : 'None yet'}</dd></div>
    </dl>
    <div class="coach-act"><button class="btn ${s.isDue ? 'solid' : 'line'}" data-a="openSheet" data-type="checkIn">${s.isDue ? 'Check in now' : 'Preview report'}</button></div>
    <div class="adv-foot"><button class="link strong" data-a="openSheet" data-type="goal">Goal: ${esc(GOALS[state.goal.mode].label)}</button><button class="link" data-a="openSheet" data-type="targets">Daily targets</button></div></section>`;
}
function checkInSheet() {
  const s = checkInStatus();
  const waistToday = peekDay(today()).waist;
  const lastWaist = latestMetric('waist');
  return `${sheetHead(`${checkInName(s)} #${s.number}`, `${dayLabel(s.from)} to ${dayLabel(s.to)}`)}
    <ol class="steps ci-steps"><li>Measure your waist and add how the week felt.</li><li>Copy the report and paste it to Claude.</li><li>Claude puts your new targets and next lifts into the app. Close and reopen it to get them.</li></ol>
    <div class="form">
      <label>Waist today, ${waistUnit()}<input id="ci-waist" inputmode="decimal" value="${esc(waistToday != null ? waistIn(waistToday) : '')}" placeholder="${lastWaist ? `Last: ${waistIn(lastWaist.v)}` : 'At the belly button'}"></label>
      <p class="sm dim">First thing in the morning, relaxed, tape level at the belly button.</p>
      <label>How did the week feel?<textarea id="ci-notes" rows="3" placeholder="Energy, hunger, sleep, anything that hurt">${esc(state.checkIn.notes || '')}</textarea></label>
    </div>
    <pre class="ci-report">${esc(checkInReport(s))}</pre>
    <div class="form sheet-foot">
      <button class="btn solid wide" data-a="copyCheckIn">Copy report</button>
      ${s.isDue ? '<button class="btn line wide" data-a="finishCheckIn">I sent it, mark as done</button>' : `<p class="sm dim center">Next check-in: ${DAY_NAMES[parseKey(s.due).getDay()]} ${shortDate(s.due)}. You can copy the report any time.</p>`}
    </div>`;
}
