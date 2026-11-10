'use strict';
const ICON = {
  today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.500"/></svg>',
  train: '<svg viewBox="0 0 24 24"><path d="M7 12h10M7 6.500v11M4 9v6M17 6.500v11M20 9v6"/></svg>',
  food: '<svg viewBox="0 0 24 24"><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M18 21v-7h-3V8c0-3 1.500-5 3-5z"/></svg>',
  micros: '<svg viewBox="0 0 24 24"><path d="M10 2.500h4M11 2.500v5.200L5.300 18.400A2 2 0 0 0 7.100 21.500h9.800a2 2 0 0 0 1.800-3.100L13 7.700V2.500M7.500 14h9"/></svg>',
  progress: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18M7 15l4-5 3 3 6-7"/></svg>',
  you: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.500 4-6.500 8-6.500s7 2 8 6.500"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8h13l-4-4M20 16H7l4 4"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4M7 11H5v10h14V11h-2"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.200"/><circle cx="12" cy="12" r="1.200"/><circle cx="19" cy="12" r="1.200"/></svg>',
  tick: '<svg viewBox="0 0 24 24"><path pathLength="1" d="M5 13l4.500 4.500L19 7"/></svg>',
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
const setText = (s, unit) => (unit === 'sec' ? `${s.w ? fmtKg(s.w) + ' kg × ' : ''}${s.r} s` : s.w ? `${fmtKg(s.w)} kg × ${s.r}` : `${s.r} reps`);
// Bodyweight moves log reps only. Weight comes back if you add some on purpose (a backpack, a vest) or logged it before.
const isBodyweight = e => { const lib = libOrCustom(e.name); return lib?.equip === 'bodyweight' || (e.inc ?? lib?.inc) === 0; };
const showKg = e => !isBodyweight(e) || !!e.loaded || (Array.isArray(e.sets) && e.sets.some(s => Number(s.w) > 0));
const GOOGLE_G = '<svg class="g-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.600-.2-2.300H12v4.500h6.500a5.500 5.500 0 0 1-2.400 3.600v3h3.900c2.300-2.100 3.500-5.200 3.500-8.800z"/><path fill="#34A853" d="M12 24c3.200 0 6-1.100 8-2.900l-3.900-3a7.200 7.200 0 0 1-10.800-3.800h-4v3.100A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.300 14.300a7.200 7.200 0 0 1 0-4.600V6.600h-4a12 12 0 0 0 0 10.800z"/><path fill="#EA4335" d="M12 4.800c1.800 0 3.300.6 4.600 1.800l3.400-3.400A12 12 0 0 0 1.300 6.600l4 3.100A7.200 7.200 0 0 1 12 4.800z"/></svg>';
// "40 kg × 9, 8, 8" when the weight stayed the same, otherwise each set in full.
function lastTimeText(sets, unit) {
  const work = sets.filter(isWorking);
  if (!work.length) return '';
  if (new Set(work.map(s => s.w)).size > 1) return work.map(s => setText(s, unit)).join(', ');
  const w = work[0].w, reps = work.map(s => s.r).join(', ');
  return `${w ? `${round(w, 2)} kg × ` : ''}${reps}${unit === 'sec' ? ' s' : w ? '' : ' reps'}`;
}
function daysAgo(k) {
  const n = daysBetween(k, today());
  return n <= 0 ? 'earlier today' : n === 1 ? 'yesterday' : `${n} days ago`;
}
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
  const now = today(), d = peekDay(now), t = dayTotals(now), tg = targetsOn(now);
  const hour = new Date().getHours();
  const skip = id => state.dismissed[id] && state.dismissed[id] > now;
  const add = o => { if (!skip(o.id)) list.push(o); };

  // Calories are set at check-ins with Claude, so there is no formula coach here.
  if (d.weight == null) add({ id: 'weigh', title: 'Weigh in', body: 'First thing in the morning. One reading never matters, but the trend does.', action: ['Log weight', 'sheet', { type: 'weight' }], hold: true });

  const leftP = tg.protein - t.p;
  if (leftP > 20 && hour >= 11) {
    const picks = proteinPicks(leftP, isVegDay(now));
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
    add({ id: 'deload', title: 'Consider a lighter week', body: `${Math.floor(weeksOn)} weeks in and ${stalled.length} lifts have stalled. A week at half the sets and 10% less weight clears fatigue. A common rule of thumb is one every 5 to 8 hard weeks.`, action: ['Start lighter week', 'startDeload', {}], refs: ['bell23'] });
  } else if (stalledToday) {
    add({ id: `stall-${stalledToday}`, title: `${stalledToday} has stalled`, body: 'No progress across 4 sessions. Try a small jump, an extra set, or swap it for a close alternative during your workout.', action: ['See history', 'sheet', { type: 'lift', name: stalledToday }], refs: ['plotkin22'] });
  }
  const sleep = series('sleep', 7).map(x => x.v);
  if (sleep.length >= 4 && avg(sleep) < 7) add({ id: 'sleep', title: `Sleep is averaging ${round(avg(sleep), 1)} h`, body: `Aim for ${tg.sleep} to 9 hours. Recovery shows up in your lifts before anywhere else.` });

  if (!state.dismissed.creatine && !state.supplements.some(x => x.id === 'creatine')) add({ id: 'creatine', title: 'Creatine is the best-supported supplement', body: '3 to 5 g every day, including rest days. You can log it as a food to remember it.', refs: ['kreider17'], once: true });
  if (Cloud.enabled() && !Cloud.user() && (state.workouts.length || Object.keys(state.days).length > 3)) add({ id: 'signin', title: 'Sign in to keep your data safe', body: 'Right now your data lives only on this phone. Signing in with Google saves it to your account.', action: ['Continue with Google', 'cloudSignIn', {}], hold: true });
  return list;
}
function proteinPicks(left, veg = false) {
  const staples = [['Whey', 30, 24], ['150 g chicken breast', 150, 46, 'meat'], ['3 eggs', 150, 19, 'meat'], ['Greek yogurt', 150, 14], ['100 g paneer', 100, 19], ['Soya chunks', 50, 26]];
  const fits = staples.filter(s => !(veg && s[3]) && s[2] <= left + 12).sort((a, b) => b[2] - a[2]).slice(0, 2);
  return fits.map(s => `${s[0]} (${s[2]} g)`);
}
function slotNow() {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'preworkout' : h < 23 ? 'dinner' : 'snack';
}
function adviceRow(o) {
  const payload = o.action ? esc(JSON.stringify(o.action[2])) : '';
  return `<li data-flip data-key="adv-${esc(o.id)}" class="adv${o.tone === 'hot' ? ' hot' : ''}">
    <h3>${esc(o.title)}</h3><p>${esc(o.body)}</p>
    <div class="adv-foot">${o.action ? `<button class="link strong" data-a="adviceGo" data-kind="${o.action[1]}" data-payload="${payload}">${esc(o.action[0])}</button>` : ''}
    ${o.hold ? '' : `<button class="link" data-a="dismiss" data-id="${esc(o.id)}" data-once="${o.once ? 1 : ''}">${o.once ? 'Got it' : 'Hide for a week'}</button>`}
    <span class="refs">${refLinks(o.refs)}</span></div></li>`;
}

/* ---------- Today ---------- */
function questCard(q, info, fresh) {
  const pct = info.pct == null ? null : clamp(info.pct, 0, 1);
  return `<li data-flip data-key="quest-${q.id}"><button ${info.open} class="quest${q.done ? ' done' : ''}${fresh.includes(q.id) ? ' fresh' : ''}">
    <span class="q-main"><span class="q-name">${info.label}</span><span class="q-sub">${info.sub}</span></span>
    <span class="q-val">[${info.value}]</span>
    <span class="q-mark">${q.done ? i('tick') : i('next')}</span>
    ${pct != null && !q.done ? `<i class="q-fill" data-k="q-${q.id}" data-pct="${pct * 100}" style="width:${pct * 100}%"></i>` : ''}
  </button></li>`;
}
// What each quest says for a day. Today speaks in the present; past days just say what happened.
function questInfo(k) {
  const d = peekDay(k), t = dayTotals(k), tg = targetsOn(k), isNow = k === today();
  const plan = plannedDay(k), trained = workoutsOn(k), a = isNow ? state.active : null;
  const setsDone = a ? sum(a.exercises.map(e => e.sets.filter(x => x.done && isWorking(x)).length)) : 0;
  const setsAll = a ? sum(a.exercises.map(e => e.sets.filter(isWorking).length)) : 0;
  const trainedSets = sum(trained.flatMap(w => w.exercises.map(e => e.sets.filter(isWorking).length)));
  const kcalLeft = tg.kcal - t.kcal, proteinLeft = Math.max(0, tg.protein - t.p);
  const foodOpen = isNow ? 'data-a="go" data-tab="food"' : `data-a="dayFood" data-k="${k}"`;
  const trainOpen = isNow ? 'data-a="go" data-tab="train"'
    : trained.length ? `data-a="openSheet" data-type="workout" data-id="${trained[trained.length - 1].id}"`
    : `data-a="openSheet" data-type="pastWorkout" data-date="${k}"`;
  return {
    train: {
      label: plan || trained.length ? 'Train' : 'Recover',
      value: a ? 'In progress' : trained.length ? esc(trained[0].name) : plan ? esc(plan.name) : 'Rest day',
      sub: a ? `${setsDone} of ${setsAll} sets` : trained.length ? `Workout finished, ${trainedSets} sets`
        : !isNow ? (plan ? 'No workout logged. Tap to add one' : 'Rest day. Tap to add a workout')
        : plan ? `${plan.exercises.length} exercises, ${sum(plan.exercises.map(e => e.sets))} sets` : 'Eat normally, recover',
      pct: a && setsAll ? setsDone / setsAll : null,
      open: trainOpen,
    },
    protein: {
      label: 'Protein', value: `${Math.round(t.p)} / ${tg.protein} g`,
      sub: proteinLeft <= 5 && tg.protein > 0 ? 'Target reached' : isNow ? `${Math.round(proteinLeft)} g left` : t.items ? `${Math.round(proteinLeft)} g short` : 'Nothing logged',
      pct: tg.protein > 0 ? t.p / tg.protein : null, open: foodOpen,
    },
    calories: {
      label: 'Calories', value: `${fmt(t.kcal)} / ${fmt(tg.kcal)}`,
      sub: !isNow && !t.items ? 'Nothing logged' : !isNow && Math.abs(kcalLeft) <= 150 ? 'On target' : kcalLeft < 0 ? `${fmt(-kcalLeft)} kcal over` : isNow ? `${fmt(kcalLeft)} kcal left` : `${fmt(kcalLeft)} kcal under`,
      pct: tg.kcal > 0 ? t.kcal / tg.kcal : null, open: foodOpen,
    },
    weigh: {
      label: 'Weigh in', value: d.weight != null ? `${d.weight} kg` : isNow ? 'Not yet' : 'Not logged',
      sub: d.weight != null ? (isNow ? 'Logged today' : 'Tap to change') : isNow ? 'First thing in the morning' : 'Tap to add',
      pct: null, open: `data-a="openSheet" data-type="weight" data-date="${k}"`,
    },
  };
}
// The week across the top of Today. Each day opens its own page, and the arrows reach older weeks.
function weekStrip(sel) {
  const now = today(), start = weekStart(sel);
  const cells = WEEK_ORDER.map((wd, n) => {
    const day = addDays(start, n), future = day > now;
    const count = future ? 0 : questsFor(day).filter(q => q.done).length;
    const hasLog = !future && (peekDay(day).weight != null || dayTotals(day).items > 0 || workoutsOn(day).length > 0 || day === now);
    const shown = hasLog ? count : 0;
    const name = parseKey(day).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    return `<button class="wk${day === now ? ' now' : ''}${day === sel ? ' on' : ''}${shown === QUESTS.length ? ' all' : ''}" data-a="dayOpen" data-k="${day}" aria-label="${name}${future ? '' : `, ${shown} of ${QUESTS.length} quests`}"${day === sel ? ' aria-current="date"' : ''}><i style="--p:${shown / QUESTS.length}"></i><span>${DAY_SHORT[wd][0]}</span><small>${parseKey(day).getDate()}</small></button>`;
  }).join('');
  const later = start < weekStart(now);
  return `<nav class="week-nav" aria-label="Choose a day">
    <button class="wk-arrow" data-a="dayWeek" data-by="-7" aria-label="Previous week">${i('back')}</button>
    <div class="week">${cells}</div>
    ${later ? `<button class="wk-arrow" data-a="dayWeek" data-by="7" aria-label="Next week">${i('next')}</button>` : '<span class="wk-arrow"></span>'}
  </nav>`;
}
function viewToday() {
  const k = ui.day && ui.day !== today() ? ui.day : today();
  if (k > today()) return viewFutureDay(k);
  if (k < today()) return viewPastDay(k);
  const quests = questsFor(k), cleared = quests.filter(q => q.done), open = quests.filter(q => !q.done);
  const prev = ui.lastCleared[k];
  const fresh = prev ? cleared.filter(q => !prev.includes(q.id)).map(q => q.id) : [];
  ui.lastCleared[k] = cleared.map(q => q.id);
  if (fresh.length) { setTimeout(playClang, 120); Motion.after(() => Motion.questCleared(open.length === 0)); }
  const s = computeStats();
  Motion.after(() => Motion.checkLevel(s.level));
  const info = questInfo(k), date = parseKey(k);
  return `
  <header class="top">
    <div><h1>${date.toLocaleDateString('en-IN', { weekday: 'long' })}</h1><p class="dim">${shortDate(k)}${s.streak > 1 ? `, ${s.streak}-day streak` : ''}</p></div>
    <button class="level" data-a="go" data-tab="you" aria-label="Level ${s.level}"><b>${s.level}</b><span>Level</span></button>
  </header>
  <div class="xp"><div class="xp-track"><i data-k="xp" data-pct="${s.into / s.need * 100}" style="width:${s.into / s.need * 100}%"></i></div><p>${fmt(s.into)} / ${fmt(s.need)} XP</p></div>
  ${weekStrip(k)}
  ${checkInCard()}
  ${suppToday()}
  ${waistToday()}
  <p class="day-quote">${esc(quoteFor(k))}</p>
  <section class="block first">
    <div class="q-head"><h2>Daily Quests</h2><span class="q-count">[${cleared.length} / ${quests.length}]</span></div>
    ${open.length ? `<ul class="quests">${open.map(q => questCard(q, info[q.id], fresh)).join('')}</ul>` : '<p class="all-clear">All quests cleared today.</p>'}
  </section>
  ${cleared.length ? `<section class="block"><h2>Completed</h2><ul class="quests">${cleared.map(q => questCard(q, info[q.id], fresh)).join('')}</ul></section>` : ''}`;
}
const dayTop = (k, note = '') => `<header class="top"><div><h1>${parseKey(k).toLocaleDateString('en-IN', { weekday: 'long' })}</h1><p class="dim">${shortDate(k)}${note ? `, ${note}` : ''}</p></div><button class="btn line small" data-a="dayOpen" data-k="${today()}">Back to today</button></header>`;
// A day that has already happened: everything logged on it, and all of it can still be changed.
function viewPastDay(k) {
  const quests = questsFor(k), info = questInfo(k), done = quests.filter(q => q.done).length;
  const meals = peekDay(k).meals || {}, t = dayTotals(k), workouts = workoutsOn(k);
  const filled = SLOTS.filter(([slot]) => (meals[slot] || []).length);
  const food = filled.map(([slot, name]) => {
    const list = meals[slot];
    return `<div class="meal day-meal"><div class="meal-head"><h3>${name}</h3><span class="dim">${fmt(sum(list.map(e => e.kcal)))} kcal, ${Math.round(sum(list.map(e => e.p)))} g protein</span></div>
      <ul class="rows">${list.map(e => `<li><button class="row" data-a="dayEntry" data-k="${k}" data-slot="${slot}" data-id="${e.id}"><span>${esc(e.name)}<em>${esc(e.amount || e.label || '')}</em></span><span class="dim">${fmt(e.kcal)}</span></button></li>`).join('')}</ul></div>`;
  }).join('');
  const train = workouts.map(w => `<button class="card day-workout" data-a="openSheet" data-type="workout" data-id="${w.id}">
      <span class="dw-head"><b>${esc(w.name)}${w.place === 'home' ? ' at home' : ''}</b><span class="dim">Edit</span></span>
      ${w.exercises.map(e => `<span class="dw-row"><span>${esc(e.name)}</span><span class="dim">${esc(lastTimeText(e.sets, e.unit))}</span></span>`).join('')}
    </button>`).join('');
  return `${dayTop(k, k === addDays(today(), -1) ? 'yesterday' : '')}
  ${weekStrip(k)}
  <section class="block first">
    <div class="q-head"><h2>Quests</h2><span class="q-count">[${done} / ${quests.length}]</span></div>
    <ul class="quests">${quests.map(q => questCard(q, info[q.id], [])).join('')}</ul>
  </section>
  <section class="block"><div class="q-head"><h2>Food</h2><button class="link strong" data-a="dayFood" data-k="${k}">${t.items ? 'Edit food' : 'Add food'}</button></div>
    ${food || '<p class="empty">No food logged on this day.</p>'}</section>
  ${workouts.length ? `<section class="block"><h2>Workout</h2><div class="day-workouts">${train}</div></section>` : ''}`;
}
// A day still to come: what's planned, nothing to tick off yet.
function viewFutureDay(k) {
  const plan = plannedDay(k);
  return `${dayTop(k, k === addDays(today(), 1) ? 'tomorrow' : '')}
  ${weekStrip(k)}
  <section class="block first">${plan ? `<div class="session-head"><div><h2>${esc(plan.name)}</h2><p class="dim">${plan.exercises.length} exercises, ${sum(plan.exercises.map(e => e.sets))} sets planned</p></div></div>
    <ol class="plan-list">${plan.exercises.map(e => `<li><button data-a="openSheet" data-type="lift" data-name="${esc(e.name)}"><span class="pl-name">${esc(e.name)}</span><span class="pl-sub">${e.sets} × ${e.lo} to ${e.hi}${e.unit === 'sec' ? ' s' : ''}</span></button></li>`).join('')}</ol>`
    : '<div class="session-head"><div><h2>Rest day</h2><p class="dim">Nothing planned. Eat normally, recover.</p></div></div>'}</section>`;
}

/* ---------- Train ---------- */
function targetFor(e) { return nextFor(e, exerciseHistory(state.workouts, e.name, 6)); }
function viewTrain() { return state.active ? viewActive() : viewPlan(); }
// The normal workout, with the option of swapping it for a home version.
const gearSummary = () => {
  const list = HOME_GEAR.filter(([k]) => state.settings.homeGear[k]).map(([, l]) => l);
  return list.length ? list.join(', ') : 'Bodyweight only';
};
const homeButton = dayId => `<button class="btn line home-btn" data-a="homeInstead" data-id="${dayId}">${i('today')} Do home workout instead</button>`;
const homeBanner = dayId => `<div class="home-on"><span><b>Home workout</b><em>${esc(gearSummary())}</em></span><button class="link strong" data-a="homeInstead" data-id="${dayId}">Equipment</button><button class="link" data-a="backToGym">Back to gym</button></div>`;
const homeRows = day => homeDay(day.exercises, state.settings.homeGear, state.homeChoice);
function nextWorkoutLine() {
  for (let n = 1; n <= 7; n++) {
    const k = addDays(today(), n), day = plannedDay(k);
    if (day) return `Next: ${esc(day.name)}, ${n === 1 ? 'tomorrow' : parseKey(k).toLocaleDateString('en-IN', { weekday: 'long' })}.`;
  }
  return '';
}
function doneCard(list) {
  const sets = sum(list.flatMap(w => w.exercises.map(e => e.sets.filter(isWorking).length)));
  const kg = sum(list.flatMap(w => w.exercises.flatMap(e => e.sets.filter(isWorking).map(x => (x.w || 0) * (x.r || 0)))));
  const bests = sum(list.map(w => (w.prs || []).length));
  const w = list[list.length - 1];
  return `<section class="card done-card"><span class="done-mark">${ICON.tick}</span><h2>Done for the day</h2>
    <p class="dim">${esc(w.name)}${w.place === 'home' ? ' at home' : ''}: ${sets} sets${kg ? `, ${fmt(kg)} kg lifted` : ''}${bests ? `, ${bests} new ${bests === 1 ? 'best' : 'bests'}` : ''}.</p>
    <p class="dim">${nextWorkoutLine()}</p>
    <button class="link strong" data-a="openSheet" data-type="workout" data-id="${w.id}">See workout</button></section>`;
}
function viewPlan() {
  const p = state.program;
  const sel = ui.planDay;
  const dayId = p.schedule[sel];
  const scheduled = dayId ? findDay(dayId) : null;
  const trainedToday = workoutsOn(today());
  const doneToday = trainedToday.length > 0;
  const isHome = atHome();
  const day = scheduled && isHome && !doneToday ? { ...scheduled, exercises: homeRows(scheduled) } : scheduled;
  const strip = WEEK_ORDER.map(wd => {
    const id = p.schedule[wd], dd = id ? findDay(id) : null;
    return `<button class="dpick${wd === sel ? ' on' : ''}${wd === new Date().getDay() ? ' tod' : ''}" data-a="pickDay" data-d="${wd}"><b>${DAY_SHORT[wd]}</b><span>${dd ? esc(dd.name.split(/[ ,]/)[0]) : 'Rest'}</span></button>`;
  }).join('');
  const body = day ? `
    <div class="session-head"><div><h2>${esc(day.name)}</h2><p class="dim">${day.exercises.length} exercises, ${sum(day.exercises.map(e => e.sets))} sets, about ${Math.round(sum(day.exercises.map(e => e.sets * (e.rest + 45))) / 60)} min</p></div>
      ${isHome && !doneToday ? '' : `<button class="link strong" data-a="openSheet" data-type="dayEdit" data-id="${day.id}">Edit</button>`}</div>
    <ol class="plan-list">${day.exercises.map(e => {
      const n = targetFor(e), last = exerciseHistory(state.workouts, e.name, 1)[0];
      const lastLine = last ? `Last: ${esc(lastTimeText(last.sets, e.unit))}` : '';
      return `<li data-flip data-key="plan-${esc(e.id)}"><button data-a="openSheet" data-type="lift" data-name="${esc(e.name)}"><span class="pl-name">${esc(e.name)}</span><span class="pl-sub">${e.sets} × ${e.lo} to ${e.hi}${e.unit === 'sec' ? ' s' : ''}</span>${lastLine ? `<span class="pl-next pl-last">${lastLine}</span>` : ''}<span class="pl-next">${n.w ? `${esc(n.headline)}: ${round(n.w, 2)} kg` : esc(n.headline)}</span></button></li>`;
    }).join('')}</ol>
    ${doneToday ? '' : `<button class="btn solid wide" data-a="startDay" data-id="${day.id}">${inDeload() ? 'Start lighter session' : isHome ? 'Start home workout' : 'Start workout'}</button>${isHome ? '' : homeButton(day.id)}`}
  ` : `<div class="session-head"><div><h2>Rest day</h2><p class="dim">Eat normally, recover.</p></div></div>
       ${doneToday ? '' : '<button class="btn line wide" data-a="openSheet" data-type="schedule">Put a workout on this day</button>'}`;
  const showDone = doneToday && sel === new Date().getDay();
  const others = p.days.filter(d => d.id !== dayId);
  const recent = state.workouts.slice(-8).reverse();
  return `
  <header class="top"><div><h1>Train</h1><button class="crumb" data-a="openSheet" data-type="programs">${esc(p.name)} ${i('next')}</button></div></header>
  ${inDeload() ? `<p class="banner">Lighter week until ${shortDate(state.deloadUntil)}: half the sets, 10% less weight. <button class="link strong" data-a="endDeload">End it</button></p>` : ''}
  <div class="dstrip">${strip}</div>
  ${showDone ? doneCard(trainedToday) : `${isHome && !doneToday && day ? homeBanner(day.id) : ''}${body}`}
  ${`<section class="block"><h2>${doneToday ? 'Do another workout' : 'Train something else'}</h2>
    <div class="pills">${(doneToday ? p.days : others).map(d => `<button class="pill" data-a="openSheet" data-type="startChoice" data-id="${d.id}">${esc(d.name)}</button>`).join('')}<button class="pill" data-a="startEmpty">Empty workout</button></div></section>`}
  <section class="block"><h2>Cardio</h2>
    <button class="row" data-a="openSheet" data-type="log"><span>Incline walk or other cardio</span><span class="dim">${peekDay(today()).cardio ? `${peekDay(today()).cardio} min today` : 'Log minutes'}</span></button></section>
  <section class="block"><h2>History</h2>
    ${recent.length ? `<ul class="rows">${recent.map(w => `<li><button class="row" data-a="openSheet" data-type="workout" data-id="${w.id}"><span>${esc(w.name)}<em>${niceDate(w.date)}${w.place === 'home' ? ', home' : ''}</em></span><span class="dim">${sum(w.exercises.map(e => e.sets.filter(isWorking).length))} sets${w.prs?.length ? `, ${w.prs.length} new best` : ''}</span></button></li>`).join('')}</ul>` : '<p class="empty">Your finished workouts land here.</p>'}
  </section>`;
}

function viewActive() {
  const a = state.active;
  const total = sum(a.exercises.map(e => e.sets.filter(isWorking).length));
  const done = sum(a.exercises.map(e => e.sets.filter(s => s.done && isWorking(s)).length));
  return `
  <header class="work-top">
    <div><h1>${esc(a.name)}</h1><p class="dim"><span id="clock">0 min</span>, ${done} of ${total} sets</p></div>
    <button class="btn solid small${total && done === total ? ' pulse' : ''}" data-a="finishWorkout">Finish</button>
    <i class="work-prog" data-k="work" data-pct="${total ? done / total * 100 : 0}" style="width:${total ? done / total * 100 : 0}%"></i>
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
  const n = nextFor(e, hist);
  const chosen = e.chosen || n.chosen;
  const showRir = state.settings.showRir || e.mode === 'rir';
  const kg = showKg(e), sec = e.unit === 'sec';
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
      <td class="prev${s.done && prev && isWorking(s) && setScore({ w: Number(s.w) || 0, r: Number(s.r) || 0 }) > setScore(prev) + 0.001 ? ' beat' : ''}">${prev ? (prev.w ? `${round(prev.w, 2)} × ${prev.r}` : kg ? `BW × ${prev.r}` : `${prev.r}${sec ? ' s' : ''}`) : ''}</td>
      ${kg ? `<td><input inputmode="decimal" enterkeyhint="next" aria-label="Weight" value="${esc(s.w)}" placeholder="${hintW === 0 ? '' : hintW}" data-f="set" data-i="${ei}" data-j="${si}" data-k="w"></td>` : ''}
      <td><input inputmode="numeric" enterkeyhint="done" aria-label="${unitWord(e)}" value="${esc(s.r)}" placeholder="${hintR}" data-f="set" data-i="${ei}" data-j="${si}" data-k="r"></td>
      ${showRir ? `<td><input inputmode="numeric" aria-label="Reps in reserve" value="${esc(s.rir ?? '')}" placeholder="${e.rirGoal ?? 2}" data-f="set" data-i="${ei}" data-j="${si}" data-k="rir"></td>` : ''}
      <td><button class="tick${s.done ? ' on' : ''}" data-a="toggleSet" data-i="${ei}" data-j="${si}" aria-label="Mark set done" aria-pressed="${!!s.done}">${ICON.tick}</button></td>
    </tr>`;
  }).join('');
  const options = n.options.length ? `<div class="opts">${n.options.map(o => `<button class="opt${o.id === chosen ? ' on' : ''}" data-a="chooseOption" data-i="${ei}" data-o="${o.id}"><b>${esc(o.label)}</b><span>${o.w ? `${round(o.w, 2)} kg × ${o.reps[0]}` : `${o.reps[0]} ${sec ? 's' : 'reps'}`}</span></button>`).join('')}</div>` : '';
  const allDone = e.sets.length && e.sets.every(s => s.done);
  const linked = e.superset && ei < state.active.exercises.length - 1;
  return `<article data-flip data-key="ex-${esc(e.id || ei)}" class="ex${allDone ? ' ex-done' : ''}${linked ? ' ex-linked' : ''}" id="ex-${ei}">
    <div class="ex-head">
      <button class="ex-name" data-a="openSheet" data-type="lift" data-name="${esc(e.name)}">${esc(e.name)}</button>
      <button class="ic-btn" data-a="openSheet" data-type="swap" data-i="${ei}" aria-label="Swap exercise">${i('swap')}</button>
      <button class="ic-btn" data-a="openSheet" data-type="exercise" data-i="${ei}" aria-label="Exercise options">${i('more')}</button>
    </div>
    <p class="ex-sub">${repRange(e)}${e.swappedFrom ? `, in place of ${esc(e.swappedFrom)}` : ''}${e.superset ? ', superset with next' : ''}</p>
    ${last ? `<p class="ex-last"><span>Last time</span> <b>${esc(lastTimeText(last.sets, e.unit))}</b> <em>${daysAgo(last.date)}</em></p>` : ''}
    <p class="ex-next"><b>${esc(n.headline)}.</b> ${esc(n.why)}${n.stalled ? ' <em>Stalled for 4 sessions. A swap may help.</em>' : ''}</p>
    ${options}
    <table class="sets${kg ? '' : ' no-kg'}"><thead><tr><th>Set</th><th>Last</th>${kg ? '<th>kg</th>' : ''}<th>${sec ? 'Sec' : 'Reps'}</th>${showRir ? '<th>RIR</th>' : ''}<th></th></tr></thead><tbody>${rows}</tbody></table>
    <div class="ex-foot"><button class="link" data-a="addSet" data-i="${ei}">${i('plus')} Add set</button>${e.sets.length ? `<button class="link" data-a="dropSet" data-i="${ei}">Remove set</button>` : ''}${isBodyweight(e) && !e.sets.some(s => Number(s.w) > 0) ? `<button class="link" data-a="toggleLoad" data-i="${ei}">${e.loaded ? 'Bodyweight only' : 'Add weight'}</button>` : ''}${e.note ? `<span class="ex-note">${esc(e.note)}</span>` : ''}</div>
  </article>`;
}

/* ---------- Food ---------- */
function viewFood() {
  const k = ui.foodDate, t = dayTotals(k), tg = targetsOn(k);
  const meals = peekDay(k).meals || {};
  const left = tg.kcal - t.kcal;
  const bar = (label, got, of, color) => { const pct = of > 0 ? clamp(got / of * 100, 0, 100) : 0; return `<div class="mac"><div class="mac-top"><span>${label}</span><span>[${Math.round(got)}<em> / ${of} g</em>]</span></div><div class="mac-track"><i data-k="mac-${label}" data-pct="${pct}" style="width:${pct}%;background:${color}"></i></div></div>`; };
  const yesterday = addDays(k, -1);
  const yMeals = peekDay(yesterday).meals || {};
  return `
  <header class="top"><div class="datebar">
    <button class="ic-btn" data-a="foodDay" data-n="-1" aria-label="Previous day">${i('back')}</button>
    <h1>${niceDate(k)}</h1>
    ${k < today() ? `<button class="ic-btn" data-a="foodDay" data-n="1" aria-label="Next day">${i('next')}</button>` : '<span class="ic-btn"></span>'}
  </div></header>
  ${k < today() ? '<p class="center food-back"><button class="link strong" data-a="foodToday">Back to today</button></p>' : ''}
  <section class="hero left">
    <p class="big-num"><b data-count="${Math.abs(Math.round(left))}" data-k="kcal-left">${fmt(Math.abs(left))}</b></p>
    <p class="dim">${left < 0 ? 'kcal over' : k < today() ? 'kcal under' : 'kcal left'} of ${fmt(tg.kcal)}</p>
    ${bar('Protein', t.p, tg.protein, 'var(--protein)')}${bar('Carbs', t.c, tg.carbs, 'var(--carbs)')}${bar('Fat', t.f, tg.fat, 'var(--fat)')}
  </section>
  ${SLOTS.map(([slot, name]) => {
    const list = meals[slot] || [];
    const kcal = sum(list.map(e => e.kcal)), p = sum(list.map(e => e.p));
    const saved = state.savedMeals.filter(m => m.slot === slot).slice(0, 2);
    const y = yMeals[slot] || [];
    return `<section class="meal" data-flip data-key="meal-${slot}" data-slot="${slot}">
      <div class="meal-head"><h2>${name}</h2><span class="dim">${list.length ? `${fmt(kcal)} kcal, ${Math.round(p)} g protein` : ''}</span></div>
      ${list.length ? `<ul class="rows">${list.map(e => `<li data-flip data-key="food-${esc(e.id)}"><button class="row" data-a="openSheet" data-type="entry" data-slot="${slot}" data-id="${e.id}"><span>${esc(e.name)}<em>${esc(e.amount || e.label || '')}</em></span><span class="dim">${fmt(e.kcal)}</span></button></li>`).join('')}</ul>` : ''}
      <div class="meal-acts">
        <button class="pill solid" data-a="openSheet" data-type="food" data-slot="${slot}" data-date="${k}">${i('plus')} Add</button>
        ${!list.length && y.length ? `<button class="pill" data-a="copyMeal" data-slot="${slot}" data-from="${yesterday}">Same as yesterday</button>` : ''}
        ${!list.length ? saved.map(m => `<button class="pill" data-a="logMeal" data-id="${m.id}" data-slot="${slot}">${esc(m.name)}</button>`).join('') : ''}
        ${list.length ? `<button class="pill" data-a="openSheet" data-type="saveMeal" data-slot="${slot}">Save as a meal</button>` : ''}
      </div></section>`;
  }).join('')}`;
}

/* ---------- Progress ---------- */
const TREND_MIN = 7; // a smooth trend means little until there's about a week of readings
const whenWord = k => { const n = daysBetween(k, today()); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; };
const sinceWord = k => (k === addDays(today(), -1) ? 'yesterday' : shortDate(k));
function weightCard() {
  const all = series('weight', 0);
  if (!all.length) {
    return `<section class="hero left weight-card"><p class="big-num"><b>No weigh-ins</b></p><p class="dim">Your weight graph starts with your first reading.</p>
      <button class="btn solid wide" data-a="openSheet" data-type="weight">Log your weight</button></section>`;
  }
  const trended = weightTrend(all), latest = trended[trended.length - 1];
  const useTrend = all.length >= TREND_MIN, key = useTrend ? 't' : 'v';
  const spanAll = daysBetween(all[0].date, today());
  // Only ranges that would show something different from All.
  const ranges = [[14, '2W'], [30, '1M'], [90, '3M'], [365, '1Y']].filter(([d]) => spanAll > d);
  const range = ranges.some(([d]) => d === ui.range) ? ui.range : 0;
  const from = range ? addDays(today(), -range) : null;
  const shown = from ? trended.filter(p => p.date >= from) : trended;
  const a = shown[0], b = shown[shown.length - 1];
  const change = a && b && a !== b ? round(b[key] - a[key], 1) : null;
  const moved = change == null ? '' : change === 0 ? `no change since ${sinceWord(a.date)}` : `${change < 0 ? 'down' : 'up'} ${Math.abs(change)} kg since ${sinceWord(a.date)}`;
  const line = useTrend ? `Trend ${round(latest.t, 1)} kg${moved ? `, ${moved}` : ''}.`
    : moved ? `${moved[0].toUpperCase()}${moved.slice(1)}.`
    : 'Your first weigh-in. Weigh in again tomorrow and the graph takes off.';
  return `<section class="hero left weight-card">
    <div class="w-head"><p class="big-num"><b>${round(latest.v, 1)}</b><small> kg</small></p><span class="dim">${whenWord(latest.date)[0].toUpperCase()}${whenWord(latest.date).slice(1)}</span></div>
    <p class="dim">${line}</p>
    ${ranges.length ? `<div class="seg" role="tablist">${[...ranges, [0, 'All']].map(([v, l]) => `<button class="${v === range ? 'on' : ''}" data-a="setRange" data-v="${v}">${l}</button>`).join('')}</div>` : ''}
    ${lineChart({ id: 'weight', points: shown, lineKey: key, showRaw: true, unit: 'kg', height: 210, minSpan: 1, minDays: 6, from, to: today(), emptyText: 'No weigh-ins in this period.' })}
    <div class="w-foot">${useTrend ? '<p class="legend"><i class="lg-line"></i> Trend <i class="lg-dot"></i> Scale readings</p>' : `<p class="dim sm w-note">A smooth trend line joins in after ${TREND_MIN} weigh-ins.</p>`}<button class="link strong" data-a="openSheet" data-type="weight">Edit past weigh-ins</button></div>
  </section>`;
}
function foodCard() {
  const kcal = ui.foodChart !== 'protein', now = today();
  const days = Array.from({ length: 14 }, (_, n) => addDays(now, n - 13));
  // Finished days only: today's half-eaten numbers would drag the average down every morning.
  const logged = Array.from({ length: 7 }, (_, n) => addDays(now, -1 - n)).filter(d => dayTotals(d).items > 0);
  const value = d => (kcal ? dayTotals(d).kcal : dayTotals(d).p);
  const target = kcal ? state.targets.kcal : state.targets.protein, unit = kcal ? 'kcal' : 'g';
  const hits = logged.filter(d => questsFor(d).find(q => q.id === (kcal ? 'calories' : 'protein')).done).length;
  const text = logged.length
    ? `Last 7 days: ${fmt(avg(logged.map(value)))} ${unit} a day on average, against a target of ${fmt(target)}. On target ${hits} of ${logged.length} logged ${logged.length === 1 ? 'day' : 'days'}.`
    : 'Log food for a few days and your averages appear here.';
  return `<section class="block card"><h2>Food</h2>
    <div class="seg">${[['kcal', 'Calories'], ['protein', 'Protein']].map(([v, l]) => `<button class="${(kcal ? 'kcal' : 'protein') === v ? 'on' : ''}" data-a="setFoodChart" data-v="${v}">${l}</button>`).join('')}</div>
    <p class="dim sm">${text}</p>
    ${barChart({ id: 'food', days, get: value, target, color: kcal ? 'var(--accent)' : 'var(--protein)', unit })}</section>`;
}
// Newest first. "+12%" compares the latest session's best set with the earliest of the last eight.
function liftRows() {
  const names = [...new Set(state.workouts.slice().reverse().flatMap(w => w.exercises.map(e => e.name)))];
  return names.map(name => {
    const hist = exerciseHistory(state.workouts, name, 8).filter(h => !h.deload);
    if (!hist.length) return null;
    const unit = libEntry(name)?.unit || 'reps';
    const top = hist[0].sets.filter(isWorking).sort((x, y) => setScore(y) - setScore(x))[0];
    if (!top) return null;
    const first = bestScore(hist[hist.length - 1].sets), last = bestScore(hist[0].sets);
    const pct = hist.length > 1 && first > 0 ? Math.round((last / first - 1) * 100) : null;
    return { name, text: setText(top, unit), pct };
  }).filter(Boolean);
}
function trainingCard() {
  const wk = weekStart(today()), done = state.workouts.filter(w => w.date >= wk).length;
  const planned = Object.keys(state.program.schedule).length;
  const lifts = liftRows(), shown = ui.showAllLifts ? lifts : lifts.slice(0, 5);
  const vol = weeklyVolume(state.workouts, wk, muscleInfo), goal = state.muscleGoal;
  const hit = MUSCLE_ORDER.filter(m => (vol[m] || 0) >= goal.lo).length;
  const pctDone = planned ? clamp(done / planned * 100, 0, 100) : 0;
  return `<section class="block card"><h2>Training</h2>
    <div class="unlock week-count"><span>This week</span><div class="mac-track"><i style="width:${pctDone}%;background:var(--accent)"></i></div><b>${done} of ${planned}</b></div>
    ${lifts.length ? `<h3 class="card-sub">Your lifts</h3><ul class="lift-list">${shown.map(l => `<li><button class="row" data-a="openSheet" data-type="lift" data-name="${esc(l.name)}"><span>${esc(l.name)}<em>Last session: ${esc(l.text)}</em></span><span class="lift-change${l.pct > 0 ? ' up' : ''}">${l.pct == null ? 'New' : l.pct === 0 ? 'Same' : signed(l.pct) + '%'}</span></button></li>`).join('')}</ul>
      ${lifts.length > shown.length ? `<button class="link strong" data-a="toggleUi" data-k="showAllLifts">See all ${lifts.length} lifts</button>` : ''}
      <p class="dim sm">The percentage is how much stronger your best set has got over your last 8 sessions.</p>` : '<p class="dim sm card-note">Finish a workout and your lifts appear here.</p>'}
    <h3 class="card-sub">Sets per muscle</h3>
    <p class="dim sm">${hit} of ${MUSCLE_ORDER.length} muscles have reached ${goal.lo} sets this week. Aim for ${goal.lo} to ${goal.hi} each.</p>
    ${ui.showMuscles ? `<ul class="volume">${MUSCLE_ORDER.map(m => {
      const v = vol[m] || 0, pctV = clamp(v / goal.hi * 100, 0, 100), lo = goal.lo / goal.hi * 100;
      return `<li><span>${MUSCLE_NAMES[m]}</span><div class="vol-track"><i class="vol-zone" style="left:${lo}%"></i><i class="vol-fill${v >= goal.lo ? ' met' : ''}" style="width:${pctV}%"></i></div><b>${round(v, 1)}</b></li>`;
    }).join('')}</ul><p class="dim sm">A set for the main muscle counts as 1, for a helping muscle as 0.5. ${refLinks(['schoenfeld17', 'pelland26'])}</p>` : ''}
    <button class="link strong" data-a="toggleUi" data-k="showMuscles">${ui.showMuscles ? 'Hide muscles' : 'See every muscle'}</button>
  </section>`;
}
function consistencyCard() {
  const days = Array.from({ length: 30 }, (_, n) => addDays(today(), -n));
  const trained = days.filter(d => workoutsOn(d).length).length;
  const logged = days.filter(d => workoutsOn(d).length || peekDay(d).weight != null || dayTotals(d).items > 0).length;
  if (!logged) return '';
  return `<section class="block card"><h2>Consistency</h2>
    <p class="dim sm">Trained on ${trained} and logged on ${logged} of the last 30 days. Tap a square to open that day.</p>
    ${heatmap()}<p class="legend"><i class="h-swatch h-full"></i> All quests <i class="h-swatch h-train"></i> Trained <i class="h-swatch h-log"></i> Logged</p></section>`;
}
// Always on Today, so a measurement is one tap away.
function waistToday() {
  const waist = series('waist', 0), cur = peekDay(today()).waist, last = waist[waist.length - 1];
  const change = waist.length > 1 ? `, ${signed(round(waistIn(last.v) - waistIn(waist[0].v), 1), 1)} ${waistUnit()} since ${sinceWord(waist[0].date)}` : '';
  return `<section class="block card waist-today"><div class="q-head"><h2>Waist</h2><button class="link strong" data-a="openSheet" data-type="waist">${cur != null ? 'Edit today' : 'Log waist'}</button></div>
    <p class="dim sm">${last ? `${waistText(last.v)} ${whenWord(last.date)}${change}.` : 'Not measured yet. Once a week, in the morning, tape at the belly button.'}</p></section>`;
}
function viewProgress() {
  const waist = series('waist', 0);
  // Weighing in and protein are daily quests and the coach has its own panel, so none of them repeats here.
  const tips = adviceList().filter(x => !['weigh', 'coach', 'review', 'protein'].includes(x.id)).slice(0, 2);
  const needWeight = peekDay(today()).weight == null && series('weight', 0).length > 0;
  return `
  <header class="top"><div><h1>Progress</h1></div>${needWeight ? '<button class="btn solid small" data-a="openSheet" data-type="weight">Log weight</button>' : ''}</header>
  ${weightCard()}
  ${checkInPanel()}
  ${tips.length ? `<section class="block"><h2>Recommendations</h2><ul class="advice">${tips.map(adviceRow).join('')}</ul></section>` : ''}
  ${foodCard()}
  ${trainingCard()}
  ${consistencyCard()}
  <section class="block card"><div class="q-head"><h2>Waist</h2><button class="link strong" data-a="openSheet" data-type="waist">${peekDay(today()).waist != null ? 'Edit today' : 'Log waist'}</button></div>
    <p class="dim sm">${waist.length ? `${waistText(waist[waist.length - 1].v)} ${whenWord(waist[waist.length - 1].date)}${waist.length > 1 ? `, ${signed(round(waistIn(waist[waist.length - 1].v) - waistIn(waist[0].v), 1), 1)} ${waistUnit()} since ${sinceWord(waist[0].date)}` : ''}.` : 'Once a week is enough: first thing in the morning, relaxed, tape level at the belly button.'}</p>
    ${waist.length ? lineChart({ id: 'waist', points: waist.map(p => ({ ...p, v: waistIn(p.v) })), unit: waistUnit(), height: 130, minSpan: 2, minDays: 6, to: today() }) : ''}</section>`;
}
const coachFoot = goal => `<div class="adv-foot"><button class="link strong" data-a="openSheet" data-type="goal">Goal: ${esc(GOALS[goal.mode].label)}</button><button class="link" data-a="openSheet" data-type="method">How this works</button></div>`;
function coachPanel(c) {
  const goal = state.goal;
  if (c.status === 'collecting') {
    const pw = clamp(c.weighIns / c.needWeighIns, 0, 1), ps = clamp(c.sessions / c.needSessions, 0, 1);
    const leftW = Math.max(c.needWeighIns - c.weighIns, 0), leftS = Math.max(c.needSessions - c.sessions, 0);
    const needs = [leftW ? `${leftW} more ${leftW === 1 ? 'weigh-in' : 'weigh-ins'}` : '', leftS ? `${leftS} more ${leftS === 1 ? 'workout' : 'workouts'}` : ''].filter(Boolean).join(' and ');
    return `<section class="block coach"><h2>Calorie coach</h2>
      <h3>${esc(c.title)}</h3><p>${needs ? `Eat to your target and keep logging. After ${needs}, the coach starts adjusting your calories from your real results.` : esc(c.body)}</p>
      <div class="unlock"><span>Weigh-ins</span><div class="mac-track"><i style="width:${pw * 100}%;background:var(--accent)"></i></div><b>${Math.min(c.weighIns, c.needWeighIns)} of ${c.needWeighIns}</b></div>
      <div class="unlock"><span>Workouts</span><div class="mac-track"><i style="width:${ps * 100}%;background:var(--accent)"></i></div><b>${Math.min(c.sessions, c.needSessions)} of ${c.needSessions}</b></div>
      ${coachFoot(goal)}</section>`;
  }
  const act = c.status === 'raise' || c.status === 'lower';
  return `<section class="block coach${act ? ' hot' : ''}"><h2>Calorie coach</h2>
    <h3>${esc(c.title)}</h3><p>${esc(c.body)}</p>
    <dl class="kv">
      <div><dt>You burn about</dt><dd>${fmt(c.tdee)} kcal a day</dd></div>
      <div><dt>You eat about</dt><dd>${c.hasIntake ? `${fmt(c.intake)} kcal a day` : 'Log more food to know'}</dd></div>
      <div><dt>Your weight is moving</dt><dd>${signed(c.rateKgWk, 2)} kg a week</dd></div>
      <div><dt>Your goal</dt><dd>${esc(goalPace(goal, c.weight))}</dd></div>
    </dl>
    ${c.warnDeficit ? `<p class="warn">This target is over 500 kcal below what you burn, where muscle gain stops in the research. ${refLinks(['murphy22'])}</p>` : ''}
    ${act ? `<div class="coach-act"><button class="btn solid" data-a="applyCoach">Set ${fmt(c.newKcal)} kcal</button><button class="btn line" data-a="openSheet" data-type="targets">Choose my own</button></div>` : ''}
    ${coachFoot(goal)}</section>`;
}

/* ---------- You ---------- */
function viewYou() {
  const s = computeStats(), p = state.profile, t = state.targets, w = latestWeight();
  const db = ui.foodDb;
  const earned = MILESTONES.filter(m => m[2](s));
  return `
  <header class="top"><div><h1>${esc(p.name || 'You')}</h1><p class="dim">Level ${s.level}, ${fmt(s.xp)} XP in total</p></div></header>
  <div class="level-track"><i data-k="level" data-pct="${s.into / s.need * 100}" style="width:${s.into / s.need * 100}%"></i></div>
  <dl class="tally"><div><dd data-count="${s.workouts}" data-k="t-workouts">${s.workouts}</dd><dt>Workouts</dt></div><div><dd data-count="${s.prs}" data-k="t-prs">${s.prs}</dd><dt>New bests</dt></div><div><dd>${(s.volume / 1000).toFixed(1)}</dd><dt>Tonnes lifted</dt></div><div><dd data-count="${s.clearedDays}" data-k="t-days">${s.clearedDays}</dd><dt>Days cleared</dt></div></dl>
  <section class="block"><h2>Theme</h2><div class="themes">${THEMES.map(t => `<button class="theme-card${state.settings.theme === t.id ? ' on' : ''}" data-a="setTheme" data-v="${t.id}" aria-pressed="${state.settings.theme === t.id}"><span class="tc tc-${t.id}"><i></i><i></i><i></i></span><b>${t.name}</b></button>`).join('')}</div></section>
  <section class="block"><h2>Plan</h2><ul class="rows">
    <li><button class="row" data-a="openSheet" data-type="targets"><span>Daily targets</span><span class="dim">${fmt(t.kcal)} kcal, ${t.protein} g protein${t.dayProtein?.[2] != null ? ` (${t.dayProtein[2]} g Tue)` : ''}</span></button></li>
    <li><button class="row" data-a="openSheet" data-type="goal"><span>Goal</span><span class="dim">${esc(GOALS[state.goal.mode].label)}</span></button></li>
    <li><button class="row" data-a="openSheet" data-type="programs"><span>Workout program</span><span class="dim">${esc(state.program.name)}</span></button></li>
    <li><button class="row" data-a="openSheet" data-type="schedule"><span>Weekly schedule</span><span class="dim">${Object.keys(state.program.schedule).length} days</span></button></li>
    <li><button class="row" data-a="openSheet" data-type="profile"><span>Your details</span><span class="dim">${p.heightCm && p.age ? `${p.heightCm} cm, ${p.age}` : 'Add details'}</span></button></li>
  </ul></section>
  <section class="block"><h2>Options</h2><ul class="rows">
    ${isInstalled() ? '' : '<li><button class="row" data-a="openSheet" data-type="installGuide"><span>Add to your Home Screen</span></button></li>'}
    <li><label class="row"><span>Log reps in reserve</span><input type="checkbox" class="sw" data-f="setting" data-k="showRir" ${state.settings.showRir ? 'checked' : ''}></label></li>
    <li><label class="row"><span>Animations</span><input type="checkbox" class="sw" data-f="setting" data-k="animations" ${state.settings.animations !== false ? 'checked' : ''}></label></li>
    <li><label class="row"><span>Sounds</span><input type="checkbox" class="sw" data-f="setting" data-k="sound" ${state.settings.sound ? 'checked' : ''}></label></li>
  </ul></section>
  <section class="block"><h2>Your data</h2>
    ${Cloud.expired() ? `<button class="btn google" data-a="cloudSignIn">${GOOGLE_G} Continue with Google</button><p class="dim sm cloud-note">Your sign-in has expired. Everything is safe on this phone and uploads once you are back in.</p>` : ''}
    ${Cloud.user() ? `<ul class="rows"><li><div class="row"><span>${esc(Cloud.user().email)}<em id="cloud-status">${esc(Cloud.statusText())}</em></span></div></li>
      <li><button class="row" data-a="cloudSignOut"><span>Sign out</span></button></li></ul>`
    : `${Cloud.enabled() ? `<button class="btn google" data-a="cloudSignIn">${GOOGLE_G} Continue with Google</button><p class="dim sm cloud-note">Saves your data to your Google account, so it follows you to any phone.</p>` : ''}
`}</section>
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

/* ---------- How to put the app on your Home Screen ---------- */
const guideStep = (n, title, text, img, alt) => `<li class="guide-step"><div class="guide-text"><span class="guide-n">${n}</span><div><h3>${title}</h3><p>${text}</p></div></div>${img ? `<img src="guide/${img}.jpg" alt="${alt}" loading="lazy">` : ''}</li>`;
function guideSteps(os) {
  if (os === 'android') {
    return `${ui.installEvent ? '<button class="btn solid guide-install" data-a="installNow">Install Repsolute</button><p class="dim sm center">One tap. Or do it by hand:</p>' : ''}
      <ol class="guide-steps">
      ${guideStep(1, 'Open the Chrome menu', 'Tap the <b>⋮</b> button at the top right.', 'android-menu', 'Chrome toolbar on Android with the menu button circled')}
      ${guideStep(2, 'Tap Add to Home screen', 'Scroll down the menu if you need to. If you see <b>Install app</b> instead, tap that.', 'android-add', 'Chrome menu on Android with Add to Home screen circled')}
      ${guideStep(3, 'Choose Install', 'Pick <b>Install</b>, not Create shortcut, so it opens full screen like an app.', 'android-choice', 'Add to home screen options on Android with Install circled')}
      ${guideStep(4, 'Tap Install again', 'Confirm on the pop-up.', 'android-install', 'Install app confirmation on Android with Install circled')}
      ${guideStep(5, 'Open it from your home screen', 'Look for the Repsolute icon, which can take a moment to appear. Sign in with Google there too, and your data follows you between the site and the app.')}
      </ol>`;
  }
  return `<ol class="guide-steps">
    ${guideStep(1, 'Tap the Share button', `In Safari, it's the ${i('share')} button at the bottom of the screen. On the newest iPhones, tap ${i('more')} first, then <b>Share</b>.`, 'ios-share', 'Safari toolbar on iPhone with the Share button circled')}
    ${guideStep(2, 'Tap View More', 'It\'s at the bottom right of the menu. If you can already see <b>Add to Home Screen</b>, skip this step.', 'ios-more', 'iPhone share menu with View More circled')}
    ${guideStep(3, 'Tap Add to Home Screen', 'Scroll down the list if you need to.', 'ios-add', 'Expanded iPhone share menu with Add to Home Screen circled')}
    ${guideStep(4, 'Tap Add', 'Leave <b>Open as Web App</b> switched on.', 'ios-confirm', 'Add to Home Screen confirmation on iPhone with Add circled')}
    ${guideStep(5, 'Open it from your Home Screen', 'Look for the Repsolute icon and open it. Sign in with Google there too, and your data follows you between the site and the app.')}
    </ol>`;
}
const guideCredit = '<p class="guide-credit">Your screens may look a little different.</p>';
const guideSwitch = os => `<div class="seg">${[['iphone', 'iPhone'], ['android', 'Android']].map(([k, l]) => `<button class="${os === k ? 'on' : ''}" data-a="guideOs" data-v="${k}">${l}</button>`).join('')}</div>`;
function viewInstallGuide() {
  const os = ui.guideOs;
  if (!os) {
    return `<section class="welcome guide-ask">
      <h1>Make it an app</h1>
      <p>Repsolute lives on your Home Screen, opens full screen and works offline. It takes about 20 seconds, with nothing to download from a store.</p>
      <h3 class="sh-sub">Which phone do you have?</h3>
      <div class="plan-cards">
        <button class="plan-card" data-a="guideOs" data-v="iphone"><b>iPhone</b><span>Using Safari</span></button>
        <button class="plan-card" data-a="guideOs" data-v="android"><b>Android</b><span>Using Chrome</span></button>
      </div>
      <button class="link" data-a="guideSkip">Skip for now</button>
    </section>`;
  }
  return `<section class="guide"><h1>Add to Home Screen</h1>
    ${guideSwitch(os)}
    ${guideSteps(os)}
    ${guideCredit}
    <button class="btn line wide" data-a="guideSkip">Continue in the browser for now</button>
    <p class="dim sm center">You can do this later from the You tab.</p>
  </section>`;
}

/* ---------- First-time setup ---------- */
const SETUP_STEPS = 6;
const setupField = (label, k, attrs = '') => `<label>${label}<input data-f="setupField" data-k="${k}" id="s-${k}" value="${esc(ui.setup[k])}" ${attrs}></label>`;
const setupCard = (k, v, on, title, plain, note = '', side = '') => `<button class="plan-card${on ? ' on' : ''}" data-a="setupPick" data-k="${k}" data-v="${v}"><b>${esc(title)}</b>${side ? `<em>${esc(side)}</em>` : ''}<span>${esc(plain)}</span>${note ? `<small>${esc(note)}</small>` : ''}</button>`;
// The weekly pace for this person, in kg rather than percent.
function goalPace(g, weight) {
  if (g.lo < 0 && g.hi > 0) return 'Your weight stays about the same';
  const [a, b] = [g.lo, g.hi].map(x => Math.abs(x) * weight / 100).sort((x, y) => x - y);
  return `${g.hi < 0 ? 'Lose' : 'Gain'} about ${round(a, 1)} to ${round(b, 1)} kg a week`;
}
function setupStep(s) {
  if (s.step === 1) return `<h1>About you</h1><p>These set your starting calories, and you can change them any time.</p>
    <div class="form">${setupField('First name', 'name', 'autocomplete="given-name"')}
      <div class="two">${setupField('Weight, kg', 'weight', 'inputmode="decimal"')}${setupField('Height, cm', 'height', 'inputmode="numeric"')}</div>
      <div class="two">${setupField('Age', 'age', 'inputmode="numeric"')}<div class="field-label">Sex, for the formula<div class="seg">${[['male', 'Male'], ['female', 'Female']].map(([k, l]) => `<button class="${s.sex === k ? 'on' : ''}" data-a="setupPick" data-k="sex" data-v="${k}">${l}</button>`).join('')}</div></div></div></div>`;
  if (s.step === 2) return `<h1>Your goal</h1><p>What do you want to do right now? You can change this any time.</p>
    <div class="plan-cards">${Object.entries(GOALS).filter(([k]) => k !== 'custom').map(([k, g]) => setupCard('goal', k, s.goal === k, g.label, g.plain, goalPace(g, num(s.weight)))).join('')}</div>`;
  if (s.step === 3) return `<h1>How active are you?</h1><p>This helps work out how many calories you burn. Think about a normal week, including your job and workouts. If you're between two, pick the lower one.</p>
    <div class="plan-cards">${ACTIVITY.map(a => setupCard('activity', a.id, s.activity === a.id, a.label, a.plain)).join('')}</div>`;
  if (s.step === 4) return `<h1>How much have you trained?</h1><p>This changes what we suggest. You can change it any time.</p>
    <div class="plan-cards">${LEVELS.map(l => setupCard('level', l.id, s.level === l.id, l.label, l.plain)).join('')}</div>`;
  if (s.step === 5) return `<h1>Pick a plan</h1><p>Choose by how many days you can train. You can swap exercises or change plan any time.</p>
    <div class="plan-cards">${PROGRAMS.map(p => setupCard('plan', p.key, s.plan === p.key, p.name, p.plain, `Best for: ${p.best}`, p.source)).join('')}</div>`;
  const lock = s.editing ? '' : 'readonly tabindex="-1"';
  return `<h1>Your targets</h1><p>You burn about ${fmt(s.burn)} calories a day, so we suggest ${fmt(s.suggested)} ${esc(GOALS[s.goal].aim)}. The coach fine-tunes this from your real results after ${UNLOCK_WEIGH_INS} weigh-ins and ${UNLOCK_WORKOUTS} workouts.</p>
    <div class="targets-head"><h3 class="sh-sub">Your daily targets</h3><button class="link strong" data-a="setupEdit">${s.editing ? 'Done' : 'Edit'}</button></div>
    <div class="form${s.editing ? '' : ' locked'}">${setupField('Calories', 'kcal', `inputmode="numeric" ${lock}`)}
      <div class="three">${setupField('Protein, g', 'protein', `inputmode="numeric" ${lock}`)}${setupField('Carbs, g', 'carbs', `inputmode="numeric" ${lock}`)}${setupField('Fat, g', 'fat', `inputmode="numeric" ${lock}`)}</div></div>
    <p class="sm dim">Protein builds muscle. Carbs fuel your workouts. Fat supports your hormones.</p>
    <h3 class="sh-sub">Choose a look</h3>
    <div class="themes">${THEMES.map(t => `<button class="theme-card${state.settings.theme === t.id ? ' on' : ''}" data-a="setTheme" data-v="${t.id}"><span class="tc tc-${t.id}"><i></i><i></i><i></i></span><b>${t.name}</b></button>`).join('')}</div>`;
}
function viewWelcome() {
  const me = Cloud.user();
  if (me && !Cloud.pulled()) {
    return `<section class="welcome"><h1>Repsolute</h1><p>Loading your account...</p><button class="link strong" data-a="cloudRetry">Try again</button></section>`;
  }
  const s = ui.setup;
  if (!me && s.step < 1 && !isInstalled() && !guideSeen()) return viewInstallGuide();
  if (me && s.step < 1) { s.step = 1; s.name = s.name || (me.name || '').split(' ')[0]; }
  if (s.step < 1) {
    return `<section class="welcome">
      <h1>Repsolute</h1>
      <p>Clear your quests every day: train, hit protein and calories, weigh in. Your numbers steer the plan.</p>
      ${Cloud.enabled() ? `<button class="btn google" data-a="cloudSignIn">${GOOGLE_G} Continue with Google</button>` : ''}
      <button class="btn line" data-a="setupGo" data-n="1">Start without an account</button>
      <button class="link" data-a="importData">Restore from an old backup</button>
      <input type="file" id="restore-file" accept="application/json,.json" hidden>
    </section>`;
  }
  if (s.calculating) return `<section class="setup-calc" role="status"><div class="calc-ring"></div><h1>Calculating your caloric goals</h1><p>Using your details, goal and activity</p></section>`;
  return `<section class="setup">
    <div class="setup-steps" aria-label="Step ${s.step} of ${SETUP_STEPS}">${Array.from({ length: SETUP_STEPS }, (_, i) => i + 1).map(n => `<i class="${n <= s.step ? 'on' : ''}"></i>`).join('')}</div>
    ${setupStep(s)}
    <div class="setup-foot">${s.step > (me ? 1 : 0) ? '<button class="btn line" data-a="setupBack">Back</button>' : ''}<button class="btn solid" data-a="setupNext">${s.step === SETUP_STEPS ? 'Start' : 'Next'}</button></div>
  </section>`;
}
