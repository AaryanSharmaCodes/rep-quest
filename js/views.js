'use strict';
const ICON = {
  today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.500"/></svg>',
  train: '<svg viewBox="0 0 24 24"><path d="M7 12h10M7 6.500v11M4 9v6M17 6.500v11M20 9v6"/></svg>',
  food: '<svg viewBox="0 0 24 24"><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M18 21v-7h-3V8c0-3 1.500-5 3-5z"/></svg>',
  progress: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18M7 15l4-5 3 3 6-7"/></svg>',
  you: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.500 4-6.500 8-6.500s7 2 8 6.500"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8h13l-4-4M20 16H7l4 4"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.200"/><circle cx="12" cy="12" r="1.200"/><circle cx="19" cy="12" r="1.200"/></svg>',
  tick: '<svg viewBox="0 0 24 24"><path d="M5 13l4.500 4.500L19 7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4M7 8v8M11 8v8M14 8v8M17 8v8"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
};
const i = name => `<span class="ic">${ICON[name]}</span>`;
const refLinks = keys => (keys || []).filter(k => REFS[k]).map(k => `<a class="ref" href="https://doi.org/${REFS[k].doi}" target="_blank" rel="noopener">${esc(REFS[k].who)}</a>`).join(' ');
const fmtKg = w => (w === 0 || w == null ? 'BW' : `${round(w, 2)}`);
const setText = (s, unit) => (unit === 'sec' ? `${s.w ? fmtKg(s.w) + ' kg × ' : ''}${s.r} s` : `${fmtKg(s.w)}${s.w ? ' kg' : ''} × ${s.r}`);
const unitWord = e => (e.unit === 'sec' ? 'sec' : 'reps');
const repRange = e => `${e.lo} to ${e.hi} ${unitWord(e)}`;

/* ---------- Advice: what to do next, and why ---------- */
function plannedSetsLeftThisWeek() {
  const left = {};
  const now = today(), wk = weekStart(now);
  for (let n = 0; n < 7; n++) {
    const k = addDays(wk, n);
    if (k < now || (k === now && workoutsOn(k).length)) continue;
    const day = plannedDay(k);
    if (!day) continue;
    day.exercises.forEach(e => {
      left[e.p] = (left[e.p] || 0) + e.sets;
      (e.s || []).forEach(m => { left[m] = (left[m] || 0) + e.sets / 2; });
    });
  }
  return left;
}
function stalledLifts() {
  const names = [...new Set(state.program.days.flatMap(d => d.exercises.map(e => e.name)))];
  return names.filter(n => {
    const h = exerciseHistory(state.workouts, n, 4).filter(x => !x.deload);
    if (h.length < 4) return false;
    const scores = h.map(x => bestScore(x.sets));
    return scores[0] <= Math.max(...scores.slice(1)) * 1.005;
  });
}
function adviceList() {
  const list = [];
  const now = today(), d = peekDay(now), t = dayTotals(now), tg = state.targets;
  const hour = new Date().getHours();
  const skip = id => state.dismissed[id] && state.dismissed[id] > now;
  const add = o => { if (!skip(o.id)) list.push(o); };

  if (state.needsDetails || !bmr(state.profile, 70)) {
    add({ id: 'details', title: 'Add your height and age', body: 'The coach uses them for its first estimate of what you burn.', action: ['Add details', 'sheet', { type: 'profile' }], hold: true });
  }
  const c = coachNow();
  if (c.status === 'raise' || c.status === 'lower') {
    add({ id: 'coach', tone: 'hot', title: c.title, body: `${c.body} New target: ${fmt(c.newKcal)} kcal.`, action: ['Review', 'go', { tab: 'progress' }], refs: ['hall08'], hold: true });
  } else if (c.status === 'review') {
    add({ id: 'review', title: c.title, body: c.body, action: ['See lifts', 'go', { tab: 'progress' }] });
  }
  if (d.weight == null) add({ id: 'weigh', title: 'Weigh in', body: 'Morning, after the bathroom, before food. One reading never matters, but the trend does.', action: ['Log weight', 'sheet', { type: 'weight' }], hold: true });

  const leftP = tg.protein - t.p;
  if (leftP > 20 && hour >= 11) {
    const picks = proteinPicks(leftP);
    add({ id: `protein`, title: `${Math.round(leftP)} g protein left`, body: picks.length ? `Easy ways to get there: ${picks.join(', ')}.` : 'Protein is your biggest lever on this plan.', action: ['Log food', 'sheet', { type: 'food', slot: slotNow(), date: now }], refs: ['morton18'] });
  }

  const vol = weeklyVolume(state.workouts, weekStart(now), muscleInfo);
  const left = plannedSetsLeftThisWeek();
  const short = PRIORITY_MUSCLES.map(m => ({ m, done: vol[m] || 0, end: (vol[m] || 0) + (left[m] || 0) })).filter(x => x.end < state.muscleGoal.lo).sort((a, b) => a.end - b.end)[0];
  if (short && state.workouts.length) {
    add({ id: `vol-${short.m}`, title: `${MUSCLE_NAMES[short.m]}: ${round(short.end, 1)} sets this week`, body: `That's what your plan will reach, under the ${state.muscleGoal.lo}-set mark. Add a set or two where it fits.`, action: ['Edit plan', 'sheet', { type: 'dayEdit' }], refs: ['schoenfeld17', 'pelland26'] });
  }

  const stalled = stalledLifts();
  const todaysPlan = plannedDay(now);
  const stalledToday = stalled.find(n => todaysPlan?.exercises.some(e => e.name === n)) || stalled[0];
  const lastDeload = state.lastDeloadDate || state.profile.startDate;
  const weeksOn = lastDeload ? daysBetween(lastDeload, now) / 7 : 0;
  if (!inDeload() && weeksOn >= 5 && (stalled.length >= 3 || strengthTrend(state.workouts, addDays(now, -21)).state === 'down')) {
    add({ id: 'deload', title: 'Consider a lighter week', body: `${Math.floor(weeksOn)} weeks in and ${stalled.length} lifts have stalled. A week at half the sets and 10% less weight clears fatigue. Your plan suggests one every 5 to 8 hard weeks.`, action: ['Start lighter week', 'startDeload', {}], refs: ['bell23'] });
  } else if (stalledToday) {
    add({ id: `stall-${stalledToday}`, title: `${stalledToday} has stalled`, body: 'No progress across 4 sessions. Try a small jump, an extra set, or swap it for a close alternative during your workout.', action: ['See history', 'sheet', { type: 'lift', name: stalledToday }], refs: ['plotkin22'] });
  }
  const sleep = series('sleep', 7).map(x => x.v);
  if (sleep.length >= 4 && avg(sleep) < 7) add({ id: 'sleep', title: `Sleep is averaging ${round(avg(sleep), 1)} h`, body: `Your plan asks for ${tg.sleep} to 9 hours. Recovery shows up in your lifts before anywhere else.` });

  if (!state.dismissed.creatine) add({ id: 'creatine', title: 'Creatine is the one supplement your plan prioritises', body: '3 to 5 g every day, including rest days. You can log it as a food to remember it.', refs: ['kreider17'], once: true });
  const backedUp = state.lastBackup ? daysBetween(state.lastBackup, now) : 999;
  if (backedUp >= 14 && (state.workouts.length || Object.keys(state.days).length > 3)) add({ id: 'backup', title: 'Save a backup', body: 'Your data lives only on this phone. Keep a copy in Files or iCloud Drive.', action: ['Save backup', 'exportData', {}] });
  return list;
}
function proteinPicks(left) {
  const staples = [['Whey', 30, 24], ['150 g chicken breast', 150, 46], ['3 eggs', 150, 19], ['Greek yogurt', 150, 14], ['100 g paneer', 100, 19], ['Soya chunks', 50, 26]];
  const fits = staples.filter(s => s[2] <= left + 12).sort((a, b) => b[2] - a[2]).slice(0, 2);
  return fits.map(s => `${s[0]} (${s[2]} g)`);
}
function slotNow() {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'preworkout' : h < 23 ? 'dinner' : 'snack';
}
function adviceRow(o) {
  const payload = o.action ? esc(JSON.stringify(o.action[2])) : '';
  return `<li class="adv${o.tone === 'hot' ? ' hot' : ''}">
    <h3>${esc(o.title)}</h3><p>${esc(o.body)}</p>
    <div class="adv-foot">${o.action ? `<button class="link strong" data-a="adviceGo" data-kind="${o.action[1]}" data-payload="${payload}">${esc(o.action[0])}</button>` : ''}
    ${o.hold ? '' : `<button class="link" data-a="dismiss" data-id="${esc(o.id)}" data-once="${o.once ? 1 : ''}">${o.once ? 'Got it' : 'Hide for a week'}</button>`}
    <span class="refs">${refLinks(o.refs)}</span></div></li>`;
}

/* ---------- Today ---------- */
function questCard(q, info, fresh) {
  const pct = info.pct == null ? null : clamp(info.pct, 0, 1);
  return `<li><button ${info.open} class="quest${q.done ? ' done' : ''}${fresh.includes(q.id) ? ' fresh' : ''}">
    <span class="q-main"><span class="q-name">${info.label}</span><span class="q-sub">${info.sub}</span></span>
    <span class="q-val">[${info.value}]</span>
    <span class="q-mark">${q.done ? i('tick') : i('next')}</span>
    ${pct != null && !q.done ? `<i class="q-fill" style="width:${pct * 100}%"></i>` : ''}
  </button></li>`;
}
function viewToday() {
  const k = today(), quests = questsFor(k), cleared = quests.filter(q => q.done), open = quests.filter(q => !q.done);
  const prev = ui.lastCleared[k];
  const fresh = prev ? cleared.filter(q => !prev.includes(q.id)).map(q => q.id) : [];
  ui.lastCleared[k] = cleared.map(q => q.id);
  if (fresh.length) setTimeout(playClang, 120);
  const s = computeStats(), d = peekDay(k), t = dayTotals(k), tg = state.targets;
  const plan = plannedDay(k), trained = workoutsOn(k), a = state.active;
  const date = parseKey(k);
  const setsDone = a ? sum(a.exercises.map(e => e.sets.filter(x => x.done && isWorking(x)).length)) : 0;
  const setsAll = a ? sum(a.exercises.map(e => e.sets.filter(isWorking).length)) : 0;
  const kcalLeft = tg.kcal - t.kcal, proteinLeft = Math.max(0, tg.protein - t.p);
  const info = {
    train: {
      label: plan || trained.length ? 'Train' : 'Recover',
      value: a ? 'In progress' : trained.length ? esc(trained[0].name) : plan ? esc(plan.name) : 'Rest day',
      sub: a ? `${setsDone} of ${setsAll} sets` : trained.length ? 'Workout finished' : plan ? `${plan.exercises.length} exercises, ${sum(plan.exercises.map(e => e.sets))} sets` : 'Eat normally, recover',
      pct: a && setsAll ? setsDone / setsAll : null,
      open: 'data-a="go" data-tab="train"',
    },
    protein: {
      label: 'Protein', value: `${Math.round(t.p)} / ${tg.protein} g`,
      sub: proteinLeft > 0 ? `${Math.round(proteinLeft)} g left` : 'Target reached',
      pct: t.p / tg.protein, open: 'data-a="go" data-tab="food"',
    },
    calories: {
      label: 'Calories', value: `${fmt(t.kcal)} / ${fmt(tg.kcal)}`,
      sub: kcalLeft >= 0 ? `${fmt(kcalLeft)} kcal left` : `${fmt(-kcalLeft)} kcal over`,
      pct: t.kcal / tg.kcal, open: 'data-a="go" data-tab="food"',
    },
    weigh: {
      label: 'Weigh in', value: d.weight != null ? `${d.weight} kg` : 'Not yet',
      sub: d.weight != null ? 'Logged today' : 'Morning, before food',
      pct: null, open: 'data-a="openSheet" data-type="weight"',
    },
  };
  const wkStart = weekStart(k);
  const week = WEEK_ORDER.map((wd, n) => {
    const day = addDays(wkStart, n), future = day > k;
    const count = future ? 0 : questsFor(day).filter(q => q.done).length;
    const hasLog = !future && (peekDay(day).weight != null || dayTotals(day).items > 0 || workoutsOn(day).length > 0 || day === k);
    const shown = hasLog ? count : 0;
    return `<div class="wk${day === k ? ' now' : ''}${shown === QUESTS.length ? ' all' : ''}" aria-label="${DAY_SHORT[wd]}: ${shown} of ${QUESTS.length} quests"><i style="--p:${shown / QUESTS.length}"></i><span>${DAY_SHORT[wd][0]}</span></div>`;
  }).join('');
  // Weighing in is already a quest, so it doesn't need a second reminder here.
  const advice = adviceList().filter(x => x.id !== 'weigh').slice(0, 2);
  const startBtn = !a && plan && !trained.length ? `<button class="btn solid wide" data-a="startDay" data-id="${plan.id}">Start ${esc(plan.name)}</button>` : '';
  return `
  <header class="top">
    <div><h1>${date.toLocaleDateString('en-IN', { weekday: 'long' })}</h1><p class="dim">${shortDate(k)}${s.streak > 1 ? `, ${s.streak}-day streak` : ''}</p></div>
    <button class="level" data-a="go" data-tab="you" aria-label="Level ${s.level}"><b>${s.level}</b><span>Level</span></button>
  </header>
  <div class="xp"><div class="xp-track"><i style="width:${s.into / s.need * 100}%"></i></div><p>${fmt(s.into)} / ${fmt(s.need)} XP</p></div>
  <section class="block first">
    <div class="q-head"><h2>Daily Quests</h2><span class="q-count">[${cleared.length} / ${quests.length}]</span></div>
    ${open.length ? `<ul class="quests">${open.map(q => questCard(q, info[q.id], fresh)).join('')}</ul>` : '<p class="all-clear">All quests cleared today.</p>'}
    ${startBtn}
  </section>
  ${cleared.length ? `<section class="block"><h2>Completed</h2><ul class="quests">${cleared.map(q => questCard(q, info[q.id], fresh)).join('')}</ul></section>` : ''}
  <section class="block"><div class="week">${week}</div></section>
  ${advice.length ? `<section class="block"><h2>Next up</h2><ul class="advice">${advice.map(adviceRow).join('')}</ul></section>` : ''}`;
}

/* ---------- Train ---------- */
function targetFor(e) { return suggestNext(e, exerciseHistory(state.workouts, e.name, 6)); }
function viewTrain() { return state.active ? viewActive() : viewPlan(); }
function viewPlan() {
  const p = state.program;
  const sel = ui.planDay;
  const dayId = p.schedule[sel];
  const day = dayId ? findDay(dayId) : null;
  const strip = WEEK_ORDER.map(wd => {
    const id = p.schedule[wd], dd = id ? findDay(id) : null;
    return `<button class="dpick${wd === sel ? ' on' : ''}${wd === new Date().getDay() ? ' tod' : ''}" data-a="pickDay" data-d="${wd}"><b>${DAY_SHORT[wd]}</b><span>${dd ? esc(dd.name.split(/[ ,]/)[0]) : 'Rest'}</span></button>`;
  }).join('');
  const body = day ? `
    <div class="session-head"><div><h2>${esc(day.name)}</h2><p class="dim">${day.exercises.length} exercises, ${sum(day.exercises.map(e => e.sets))} sets, about ${Math.round(sum(day.exercises.map(e => e.sets * (e.rest + 45))) / 60)} min</p></div>
      <button class="link strong" data-a="openSheet" data-type="dayEdit" data-id="${day.id}">Edit</button></div>
    <ol class="plan-list">${day.exercises.map(e => {
      const n = targetFor(e);
      return `<li><button data-a="openSheet" data-type="lift" data-name="${esc(e.name)}"><span class="pl-name">${esc(e.name)}</span><span class="pl-sub">${e.sets} × ${e.lo} to ${e.hi}${e.unit === 'sec' ? ' s' : ''}</span><span class="pl-next">${n.w ? `${esc(n.headline)}: ${round(n.w, 2)} kg` : esc(n.headline)}</span></button></li>`;
    }).join('')}</ol>
    <button class="btn solid wide" data-a="startDay" data-id="${day.id}">${inDeload() ? 'Start lighter session' : 'Start workout'}</button>
  ` : `<div class="session-head"><div><h2>Rest day</h2><p class="dim">Eat normally, recover.</p></div></div>
       <button class="btn line wide" data-a="openSheet" data-type="schedule">Put a workout on this day</button>`;
  const others = p.days.filter(d => d.id !== dayId);
  const recent = state.workouts.slice(-8).reverse();
  return `
  <header class="top"><div><h1>Train</h1><button class="crumb" data-a="openSheet" data-type="programs">${esc(p.name)} ${i('next')}</button></div></header>
  ${inDeload() ? `<p class="banner">Lighter week until ${shortDate(state.deloadUntil)}: half the sets, 10% less weight. <button class="link strong" data-a="endDeload">End it</button></p>` : ''}
  <div class="dstrip">${strip}</div>
  ${body}
  <section class="block"><h2>Train something else</h2>
    <div class="pills">${others.map(d => `<button class="pill" data-a="startDay" data-id="${d.id}">${esc(d.name)}</button>`).join('')}<button class="pill" data-a="startEmpty">Empty workout</button></div></section>
  <section class="block"><h2>Cardio</h2>
    <button class="row" data-a="openSheet" data-type="log"><span>Incline walk or other cardio</span><span class="dim">${peekDay(today()).cardio ? `${peekDay(today()).cardio} min today` : 'Log minutes'}</span></button></section>
  <section class="block"><h2>History</h2>
    ${recent.length ? `<ul class="rows">${recent.map(w => `<li><button class="row" data-a="openSheet" data-type="workout" data-id="${w.id}"><span>${esc(w.name)}<em>${niceDate(w.date)}</em></span><span class="dim">${sum(w.exercises.map(e => e.sets.filter(isWorking).length))} sets${w.prs?.length ? `, ${w.prs.length} new best` : ''}</span></button></li>`).join('')}</ul>` : '<p class="empty">Your finished workouts land here.</p>'}
  </section>`;
}

function viewActive() {
  const a = state.active;
  const total = sum(a.exercises.map(e => e.sets.filter(isWorking).length));
  const done = sum(a.exercises.map(e => e.sets.filter(s => s.done && isWorking(s)).length));
  return `
  <header class="work-top">
    <div><h1>${esc(a.name)}</h1><p class="dim"><span id="clock">0 min</span>, ${done} of ${total} sets</p></div>
    <button class="btn solid small" data-a="finishWorkout">Finish</button>
    <i class="work-prog" style="width:${total ? done / total * 100 : 0}%"></i>
  </header>
  ${a.exercises.map((e, ei) => exerciseBlock(e, ei)).join('') || '<p class="empty">Add your first exercise below.</p>'}
  <div class="work-foot">
    <button class="btn line wide" data-a="openSheet" data-type="addExercise" data-target="active">${i('plus')} Add exercise</button>
    <button class="link danger" data-a="cancelWorkout">Discard workout</button>
  </div>`;
}
function exerciseBlock(e, ei) {
  const hist = exerciseHistory(state.workouts, e.name, 6);
  const last = hist[0];
  const n = suggestNext(e, hist);
  const chosen = e.chosen || n.chosen;
  const showRir = state.settings.showRir || e.mode === 'rir';
  const prevWork = last ? last.sets.filter(isWorking) : [];
  let workingIndex = 0;
  const rows = e.sets.map((s, si) => {
    const work = isWorking(s) && s.type !== 'drop';
    const wIdx = work ? workingIndex++ : -1;
    const prev = work ? prevWork[wIdx] : null;
    const opt = n.options.find(o => o.id === chosen);
    const hintW = s.type === 'warmup' || s.type === 'drop' ? '' : (opt?.w ?? n.w ?? '');
    const hintR = s.type === 'warmup' || s.type === 'drop' ? '' : (opt?.reps?.[wIdx] ?? n.reps?.[wIdx] ?? '');
    const tag = s.type === 'warmup' ? 'W' : s.type === 'drop' ? 'D' : s.type === 'failure' ? 'F' : wIdx + 1;
    return `<tr class="${s.done ? 'set-done' : ''}">
      <td><button class="set-tag t-${s.type || 'work'}" data-a="cycleType" data-i="${ei}" data-j="${si}" aria-label="Set type">${tag}</button></td>
      <td class="prev">${prev ? `${prev.w ? round(prev.w, 2) : 'BW'} × ${prev.r}` : ''}</td>
      <td><input inputmode="decimal" enterkeyhint="next" aria-label="Weight" value="${esc(s.w)}" placeholder="${hintW === 0 ? '' : hintW}" data-f="set" data-i="${ei}" data-j="${si}" data-k="w"></td>
      <td><input inputmode="numeric" enterkeyhint="done" aria-label="${unitWord(e)}" value="${esc(s.r)}" placeholder="${hintR}" data-f="set" data-i="${ei}" data-j="${si}" data-k="r"></td>
      ${showRir ? `<td><input inputmode="numeric" aria-label="Reps in reserve" value="${esc(s.rir ?? '')}" placeholder="${e.rirGoal ?? 2}" data-f="set" data-i="${ei}" data-j="${si}" data-k="rir"></td>` : ''}
      <td><button class="tick${s.done ? ' on' : ''}" data-a="toggleSet" data-i="${ei}" data-j="${si}" aria-label="Mark set done" aria-pressed="${!!s.done}">${ICON.tick}</button></td>
    </tr>`;
  }).join('');
  const options = n.options.length ? `<div class="opts">${n.options.map(o => `<button class="opt${o.id === chosen ? ' on' : ''}" data-a="chooseOption" data-i="${ei}" data-o="${o.id}"><b>${esc(o.label)}</b><span>${o.w ? `${round(o.w, 2)} kg` : 'BW'} × ${o.reps[0]}</span></button>`).join('')}</div>` : '';
  const allDone = e.sets.length && e.sets.every(s => s.done);
  const linked = e.superset && ei < state.active.exercises.length - 1;
  return `<article class="ex${allDone ? ' ex-done' : ''}${linked ? ' ex-linked' : ''}" id="ex-${ei}">
    <div class="ex-head">
      <button class="ex-name" data-a="openSheet" data-type="lift" data-name="${esc(e.name)}">${esc(e.name)}</button>
      <button class="ic-btn" data-a="openSheet" data-type="swap" data-i="${ei}" aria-label="Swap exercise">${i('swap')}</button>
      <button class="ic-btn" data-a="openSheet" data-type="exercise" data-i="${ei}" aria-label="Exercise options">${i('more')}</button>
    </div>
    <p class="ex-sub">${repRange(e)}${e.swappedFrom ? `, in place of ${esc(e.swappedFrom)}` : ''}${e.superset ? ', superset with next' : ''}</p>
    <p class="ex-next"><b>${esc(n.headline)}.</b> ${esc(n.why)}${n.stalled ? ' <em>Stalled for 4 sessions. A swap may help.</em>' : ''}</p>
    ${options}
    <table class="sets"><thead><tr><th>Set</th><th>Last</th><th>kg</th><th>${e.unit === 'sec' ? 'Sec' : 'Reps'}</th>${showRir ? '<th>RIR</th>' : ''}<th></th></tr></thead><tbody>${rows}</tbody></table>
    <div class="ex-foot"><button class="link" data-a="addSet" data-i="${ei}">${i('plus')} Add set</button>${e.sets.length ? `<button class="link" data-a="dropSet" data-i="${ei}">Remove set</button>` : ''}${e.note ? `<span class="ex-note">${esc(e.note)}</span>` : ''}</div>
  </article>`;
}

/* ---------- Food ---------- */
function viewFood() {
  const k = ui.foodDate, t = dayTotals(k), tg = targetsOn(k);
  const meals = peekDay(k).meals || {};
  const left = tg.kcal - t.kcal;
  const bar = (label, got, of, color) => `<div class="mac"><div class="mac-top"><span>${label}</span><span>[${Math.round(got)}<em> / ${of} g</em>]</span></div><div class="mac-track"><i style="width:${clamp(got / of * 100, 0, 100)}%;background:${color}"></i></div></div>`;
  const yesterday = addDays(k, -1);
  const yMeals = peekDay(yesterday).meals || {};
  return `
  <header class="top"><div class="datebar">
    <button class="ic-btn" data-a="foodDay" data-n="-1" aria-label="Previous day">${i('back')}</button>
    <h1>${niceDate(k)}</h1>
    ${k < today() ? `<button class="ic-btn" data-a="foodDay" data-n="1" aria-label="Next day">${i('next')}</button>` : '<span class="ic-btn"></span>'}
  </div></header>
  <section class="hero left">
    <p class="big-num"><b data-count="${Math.abs(Math.round(left))}">${fmt(Math.abs(left))}</b></p>
    <p class="dim">${left >= 0 ? 'kcal left' : 'kcal over'} of ${fmt(tg.kcal)}</p>
    ${bar('Protein', t.p, tg.protein, 'var(--protein)')}${bar('Carbs', t.c, tg.carbs, 'var(--carbs)')}${bar('Fat', t.f, tg.fat, 'var(--fat)')}
  </section>
  ${SLOTS.map(([slot, name]) => {
    const list = meals[slot] || [];
    const kcal = sum(list.map(e => e.kcal)), p = sum(list.map(e => e.p));
    const saved = state.savedMeals.filter(m => m.slot === slot).slice(0, 2);
    const y = yMeals[slot] || [];
    return `<section class="meal">
      <div class="meal-head"><h2>${name}</h2><span class="dim">${list.length ? `${fmt(kcal)} kcal, ${Math.round(p)} g protein` : ''}</span></div>
      ${list.length ? `<ul class="rows">${list.map(e => `<li><button class="row" data-a="openSheet" data-type="entry" data-slot="${slot}" data-id="${e.id}"><span>${esc(e.name)}<em>${esc(e.amount || e.label || '')}</em></span><span class="dim">${fmt(e.kcal)}</span></button></li>`).join('')}</ul>` : ''}
      <div class="meal-acts">
        <button class="pill solid" data-a="openSheet" data-type="food" data-slot="${slot}" data-date="${k}">${i('plus')} Add</button>
        ${!list.length && y.length ? `<button class="pill" data-a="copyMeal" data-slot="${slot}" data-from="${yesterday}">Same as yesterday</button>` : ''}
        ${!list.length ? saved.map(m => `<button class="pill" data-a="logMeal" data-id="${m.id}" data-slot="${slot}">${esc(m.name)}</button>`).join('') : ''}
        ${list.length ? `<button class="pill" data-a="openSheet" data-type="saveMeal" data-slot="${slot}">Save as a meal</button>` : ''}
      </div></section>`;
  }).join('')}`;
}

/* ---------- Progress ---------- */
function viewProgress() {
  const range = ui.range;
  const allW = series('weight', range || 0);
  const trended = weightTrend(series('weight', 0));
  const shown = range ? trended.filter(p => p.date >= addDays(today(), -range)) : trended;
  const now = shown[shown.length - 1];
  const last7 = series('weight', 6).map(x => x.v), prev7 = Object.keys(state.days).filter(k => k >= addDays(today(), -13) && k < addDays(today(), -6) && state.days[k].weight != null).map(k => state.days[k].weight);
  const weekChange = last7.length && prev7.length ? avg(last7) - avg(prev7) : null;
  const ranges = [[14, '2W'], [30, '1M'], [90, '3M'], [365, '1Y'], [0, 'All']];
  const c = coachNow();

  const days14 = Array.from({ length: 21 }, (_, n) => addDays(today(), n - 20));
  const vol = weeklyVolume(state.workouts, weekStart(today()), muscleInfo);
  const goal = state.muscleGoal;
  const liftNames = [...new Set(state.workouts.flatMap(w => w.exercises.map(e => e.name)))];
  const lift = ui.liftChart && liftNames.includes(ui.liftChart) ? ui.liftChart : liftNames[liftNames.length - 1] || null;
  const liftPts = lift ? exerciseHistory(state.workouts, lift, 40).reverse().map(h => ({ date: h.date, v: bestScore(h.sets) })) : [];
  // Two sets of a lift on one date would break the time axis, so keep the best.
  const liftByDate = {};
  liftPts.forEach(p => { liftByDate[p.date] = Math.max(liftByDate[p.date] || 0, p.v); });
  const liftSeries = Object.entries(liftByDate).map(([date, v]) => ({ date, v }));
  const waist = series('waist', 0);

  return `
  <header class="top"><div><h1>Progress</h1></div><button class="btn line small" data-a="openSheet" data-type="weight">Log weight</button></header>
  <section class="hero left">
    <p class="big-num">${now ? `<b>${round(now.t, 1)}</b><small> kg trend</small>` : '<b>No weigh-ins</b>'}</p>
    <p class="dim">${now && weekChange != null ? `${signed(weekChange, 2)} kg against last week's average` : now ? 'A week-on-week number shows up after 8 days.' : 'Log your first weight to start the graph.'}</p>
    <div class="seg" role="tablist">${ranges.map(([v, l]) => `<button class="${v === range ? 'on' : ''}" data-a="setRange" data-v="${v}">${l}</button>`).join('')}</div>
    ${lineChart({ id: 'weight', points: shown, lineKey: 't', showRaw: true, unit: 'kg', height: 210, emptyText: 'Your weight line appears here.' })}
    <p class="legend"><i class="lg-line"></i> Trend <i class="lg-dot"></i> Scale readings</p>
  </section>
  ${coachPanel(c)}
  <section class="block card"><h2>This week's sets by muscle</h2>
    <p class="dim sm">Direct sets count as 1, indirect as 0.5. Aim for ${goal.lo} to ${goal.hi}. ${refLinks(['schoenfeld17', 'pelland26'])}</p>
    <ul class="volume">${MUSCLE_ORDER.map(m => {
      const v = vol[m] || 0, pctV = clamp(v / goal.hi * 100, 0, 100), lo = goal.lo / goal.hi * 100;
      return `<li><span>${MUSCLE_NAMES[m]}${PRIORITY_MUSCLES.includes(m) ? '<sup>*</sup>' : ''}</span><div class="vol-track"><i class="vol-zone" style="left:${lo}%"></i><i class="vol-fill${v >= goal.lo ? ' met' : ''}" style="width:${pctV}%"></i></div><b>${round(v, 1)}</b></li>`;
    }).join('')}</ul><p class="dim sm">* Priority in your plan</p></section>
  <section class="block card"><h2>Strength</h2>
    ${liftNames.length ? `<select class="pick" data-f="liftChart" aria-label="Choose an exercise">${liftNames.slice().sort().map(n => `<option ${n === lift ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    ${lineChart({ id: 'lift', points: liftSeries, unit: libEntry(lift)?.unit === 'sec' ? 's' : 'kg', height: 150, decimals: 1 })}<p class="dim sm">Estimated one-rep max from your best set, using the Epley formula. Treat it as a trend, not a true max.</p>` : '<p class="empty">Finish a workout to see strength trends.</p>'}
  </section>
  <section class="block card"><h2>Calories, 3 weeks</h2>
    ${barChart({ id: 'kcal', days: days14, get: d => dayTotals(d).kcal, target: state.targets.kcal, color: 'var(--accent)', unit: 'kcal' })}</section>
  <section class="block card"><h2>Protein, 3 weeks</h2>
    ${barChart({ id: 'protein', days: days14, get: d => dayTotals(d).p, target: state.targets.protein, color: 'var(--protein)', unit: 'g' })}</section>
  <section class="block card"><h2>Consistency</h2>
    ${heatmap()}<p class="legend"><i class="h-swatch h-full"></i> All quests <i class="h-swatch h-train"></i> Trained <i class="h-swatch h-log"></i> Logged</p></section>
  ${waist.length ? `<section class="block card"><h2>Waist</h2>${lineChart({ id: 'waist', points: waist, unit: 'cm', height: 130 })}</section>` : ''}`;
}
function coachPanel(c) {
  const goal = state.goal;
  if (c.status === 'collecting') {
    const pw = clamp(c.weighIns / c.needWeighIns, 0, 1), ps = clamp(c.sessions / c.needSessions, 0, 1);
    return `<section class="block coach"><h2>Calorie coach</h2>
      <h3>${esc(c.title)}</h3><p>${esc(c.body)}</p>
      <div class="unlock"><span>Weigh-ins</span><div class="mac-track"><i style="width:${pw * 100}%;background:var(--accent)"></i></div><b>${Math.min(c.weighIns, c.needWeighIns)} of ${c.needWeighIns}</b></div>
      <div class="unlock"><span>Workouts</span><div class="mac-track"><i style="width:${ps * 100}%;background:var(--accent)"></i></div><b>${Math.min(c.sessions, c.needSessions)} of ${c.needSessions}</b></div>
      ${c.formula ? `<p class="dim sm">Formula estimate of what you burn: about ${fmt(c.formula)} kcal a day. Your own data will replace this guess.</p>` : ''}
      <div class="adv-foot"><button class="link strong" data-a="openSheet" data-type="goal">Goal: ${esc(GOALS[goal.mode].label)}</button><button class="link" data-a="openSheet" data-type="method">How this works</button></div></section>`;
  }
  const act = c.status === 'raise' || c.status === 'lower';
  return `<section class="block coach${act ? ' hot' : ''}"><h2>Calorie coach</h2>
    <h3>${esc(c.title)}</h3><p>${esc(c.body)}</p>
    <dl class="stats">
      <div><dt>You burn about</dt><dd>${fmt(c.tdee)}<small> kcal</small></dd><dd class="dim sm">likely ${fmt(c.tdeeLo)} to ${fmt(c.tdeeHi)}</dd></div>
      <div><dt>Weight rate</dt><dd>${signed(c.rateKgWk, 2)}<small> kg/wk</small></dd><dd class="dim sm">${signed(c.ratePct, 2)}%, range ${signed(goal.lo, 2)} to ${signed(goal.hi, 2)}%</dd></div>
      <div><dt>Average eaten</dt><dd>${c.hasIntake ? fmt(c.intake) : 'Too few logs'}<small>${c.hasIntake ? ' kcal' : ''}</small></dd><dd class="dim sm">${c.loggedDays} days logged</dd></div>
      <div><dt>Lifts</dt><dd>${c.strength.total ? `${c.strength.up} up` : 'Not enough'}</dd><dd class="dim sm">${c.strength.total ? `${c.strength.flat} flat, ${c.strength.down} down` : 'Needs repeat sessions'}</dd></div>
    </dl>
    ${!c.hasIntake ? '<p class="dim sm">Log food on more days and this estimate gets much sharper.</p>' : ''}
    ${c.warnDeficit ? `<p class="warn">This target is over 500 kcal below what you burn, where muscle gain stops in the research. ${refLinks(['murphy22'])}</p>` : ''}
    ${act ? `<div class="coach-act"><button class="btn solid" data-a="applyCoach">Set ${fmt(c.newKcal)} kcal</button><button class="btn line" data-a="openSheet" data-type="targets">Choose my own</button></div>` : ''}
    <div class="adv-foot"><button class="link strong" data-a="openSheet" data-type="goal">Goal: ${esc(GOALS[goal.mode].label)}</button><button class="link" data-a="openSheet" data-type="method">How this works</button></div></section>`;
}

/* ---------- You ---------- */
function viewYou() {
  const s = computeStats(), p = state.profile, t = state.targets, w = latestWeight();
  const db = ui.foodDb;
  const earned = MILESTONES.filter(m => m[2](s));
  const backup = state.lastBackup ? `Last saved ${niceDate(state.lastBackup)}` : 'Not saved yet';
  return `
  <header class="top"><div><h1>${esc(p.name || 'You')}</h1><p class="dim">Level ${s.level}, ${fmt(s.xp)} XP in total</p></div></header>
  <div class="level-track"><i style="width:${s.into / s.need * 100}%"></i></div>
  <dl class="tally"><div><dd>${s.workouts}</dd><dt>Workouts</dt></div><div><dd>${s.prs}</dd><dt>New bests</dt></div><div><dd>${(s.volume / 1000).toFixed(1)}</dd><dt>Tonnes lifted</dt></div><div><dd>${s.clearedDays}</dd><dt>Days cleared</dt></div></dl>
  <section class="block"><h2>Plan</h2><ul class="rows">
    <li><button class="row" data-a="openSheet" data-type="targets"><span>Daily targets</span><span class="dim">${fmt(t.kcal)} kcal, ${t.protein} g protein</span></button></li>
    <li><button class="row" data-a="openSheet" data-type="goal"><span>Goal</span><span class="dim">${esc(GOALS[state.goal.mode].label)}</span></button></li>
    <li><button class="row" data-a="openSheet" data-type="programs"><span>Workout program</span><span class="dim">${esc(state.program.name)}</span></button></li>
    <li><button class="row" data-a="openSheet" data-type="schedule"><span>Weekly schedule</span><span class="dim">${Object.keys(state.program.schedule).length} days</span></button></li>
    <li><button class="row" data-a="openSheet" data-type="profile"><span>Height, age and activity</span><span class="dim">${p.heightCm ? `${p.heightCm} cm, ${p.age}` : 'Add details'}</span></button></li>
  </ul></section>
  <section class="block"><h2>Options</h2><ul class="rows">
    <li><label class="row"><span>Log reps in reserve</span><input type="checkbox" class="sw" data-f="setting" data-k="showRir" ${state.settings.showRir ? 'checked' : ''}></label></li>
    <li><label class="row"><span>Track waist too</span><input type="checkbox" class="sw" data-f="setting" data-k="showWaist" ${state.settings.showWaist ? 'checked' : ''}></label></li>
    <li><label class="row"><span>Sounds</span><input type="checkbox" class="sw" data-f="setting" data-k="sound" ${state.settings.sound ? 'checked' : ''}></label></li>
  </ul></section>
  <section class="block"><h2>Your data</h2><ul class="rows">
    <li><button class="row" data-a="exportData"><span>Save backup</span><span class="dim">${backup}</span></button></li>
    <li><button class="row" data-a="importData"><span>Restore from backup</span></button></li>
  </ul><input type="file" id="restore-file" accept="application/json,.json" hidden></section>
  <section class="block"><h2>Food database</h2>
    <p class="dim sm">${db.total ? `${fmt(db.loaded)} of ${fmt(db.total)} foods ready on this phone${db.done ? ', and they work offline.' : db.partial ? '. The rest will download when you have signal.' : '.'}` : 'Loads when you first search.'}</p>
    <ul class="rows"><li><button class="row" data-a="openSheet" data-type="usda"><span>USDA online search key</span><span class="dim">${state.settings.usdaKey ? 'Added' : 'Optional'}</span></button></li></ul></section>
  <section class="block card"><h2>Milestones</h2>
    <ul class="miles">${MILESTONES.map(m => `<li class="${m[2](s) ? 'got' : ''}"><b>${esc(m[0])}</b><span>${esc(m[1])}</span></li>`).join('')}</ul>
    <p class="dim sm">${earned.length} of ${MILESTONES.length} reached.</p></section>
  <section class="block"><ul class="rows"><li><button class="row" data-a="openSheet" data-type="method"><span>The science behind the numbers</span></button></li>
    <li><button class="row" data-a="openSheet" data-type="about"><span>Data sources and credits</span></button></li>
    <li><button class="row" data-a="checkUpdate"><span>Check for updates</span><span class="dim">Version ${APP_VERSION}</span></button></li></ul></section>`;
}

function viewWelcome() {
  return `<section class="welcome">
    <h1>Rep Quest</h1>
    <p>Clear your quests every day: train, hit protein and calories, weigh in. Your numbers steer the plan.</p>
    <form id="welcome-form" class="form">
      <label>First name<input id="w-name" autocomplete="given-name"></label>
      <div class="two"><label>Weight, kg<input id="w-weight" inputmode="decimal" required></label><label>Height, cm<input id="w-height" inputmode="numeric" value="183"></label></div>
      <div class="two"><label>Age<input id="w-age" inputmode="numeric" value="20"></label><label>Sex, for the formula<select id="w-sex"><option value="">Choose</option><option value="male">Male</option><option value="female">Female</option></select></label></div>
      <button class="btn solid wide" type="submit">Start</button>
    </form>
    <button class="link" data-a="importData">Restore from a backup</button>
    <input type="file" id="restore-file" accept="application/json,.json" hidden>
  </section>`;
}
