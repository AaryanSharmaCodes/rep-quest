'use strict';
// Sleep and caffeine with clock times, so the weekly report can show whether he sleeps at regular hours
// and how late caffeine lands before bed.
//
// Sleep lives on the day it ends (the morning he wakes, or the day of a nap):
//   day.sleeps = [{ id, kind: 'night' | 'nap', start, end }]
// start and end are minutes from that day's midnight, so a night from 11:30 pm to 7 am is start -30, end 420.
// Older days may still have day.sleep (night hours, no times) and day.naps (nap hours); they still count.
//
// Caffeine: day.caf = [{ id, what, mg, at }] with at in minutes from midnight. Coffee, chai and energy drinks
// logged as food count too, using the time the food was logged (entry.at) and an estimate from its weight.

/* ---------- Clock helpers ---------- */
const MIN_DAY = 1440;
const wrapMin = m => ((Math.round(m) % MIN_DAY) + MIN_DAY) % MIN_DAY;
const clock12 = m => { const t = wrapMin(m), h = Math.floor(t / 60), mm = t % 60; return `${h % 12 || 12}:${pad(mm)} ${h < 12 ? 'am' : 'pm'}`; };
const clock24 = m => { const t = wrapMin(m); return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
const durText = mins => { const h = Math.floor(mins / 60), m = Math.round(mins % 60); return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const round15 = m => Math.round(m / 15) * 15;
const timeToMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const std = a => { if (a.length < 2) return null; const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) ** 2))); };

/* ---------- Sleep ---------- */
const SLEEP_WINDOW = { night: [-360, 960], nap: [360, MIN_DAY] }; // 6 pm the evening before to 4 pm; naps 6 am to midnight
const sleepsOn = k => (peekDay(k).sleeps || []).slice().sort((a, b) => a.start - b.start);
const sleepMins = x => Math.max(0, x.end - x.start);
// Hours for the day: timed sleeps, plus older entries without times.
function sleepParts(k) {
  const d = peekDay(k), timed = sleepsOn(k);
  const nightTimed = timed.filter(x => x.kind === 'night'), napTimed = timed.filter(x => x.kind === 'nap');
  const night = sum(nightTimed.map(sleepMins)) / 60 + (nightTimed.length ? 0 : d.sleep || 0);
  const naps = sum(napTimed.map(sleepMins)) / 60 + sum(d.naps || []);
  const any = timed.length || d.sleep != null || (d.naps || []).length;
  return any ? { night: round(night, 2), naps: round(naps, 2), total: round(night + naps, 2), timed, napCount: napTimed.length + (d.naps || []).length } : null;
}
// The main night sleep of a day (the longest one), for bedtime and wake time.
const mainNight = k => sleepsOn(k).filter(x => x.kind === 'night').sort((a, b) => sleepMins(b) - sleepMins(a))[0] || null;
function sleepDefaults(k, kind) {
  if (kind === 'night') {
    const past = datesIn(addDays(k, -14), addDays(k, -1)).map(mainNight).filter(Boolean);
    return past.length ? { start: round15(avg(past.map(x => x.start))), end: round15(avg(past.map(x => x.end))) } : { start: -60, end: 420 };
  }
  if (k === today()) { const end = clamp(round15(nowMin()), 420, MIN_DAY); return { start: end - 60, end }; }
  return { start: 840, end: 900 };
}
// Bedtime regularity over a set of days: average and spread of falling asleep and waking.
function sleepTiming(days) {
  const nights = days.map(mainNight).filter(Boolean);
  if (!nights.length) return null;
  const bed = nights.map(x => x.start), wake = nights.map(x => x.end);
  return { n: nights.length, bed: avg(bed), bedSd: std(bed), bedLo: Math.min(...bed), bedHi: Math.max(...bed), wake: avg(wake), wakeSd: std(wake), wakeLo: Math.min(...wake), wakeHi: Math.max(...wake) };
}

function sleepCard(k) {
  const p = sleepParts(k), d = peekDay(k);
  const rows = sleepsOn(k).map(x => `<li><button class="row" data-a="openSheet" data-type="sleep" data-k="${k}" data-id="${x.id}">
      <span>${x.kind === 'night' ? 'Night' : 'Nap'}<em>${clock12(x.start)} to ${clock12(x.end)}</em></span><span class="dim">${durText(sleepMins(x))}</span></button></li>`);
  if (d.sleep != null && !sleepsOn(k).some(x => x.kind === 'night')) rows.unshift(`<li><div class="row"><span>Night<em>no times logged</em></span><span class="dim">${d.sleep} h</span></div></li>`);
  (d.naps || []).forEach(h => rows.push(`<li><div class="row"><span>Nap<em>no times logged</em></span><span class="dim">${durText(h * 60)}</span></div></li>`));
  const t = sleepTiming(datesIn(addDays(k, -6), k));
  const hasNight = sleepsOn(k).some(x => x.kind === 'night') || d.sleep != null;
  return `<section class="block card sleep-card"><div class="q-head"><h2>Sleep</h2><span class="dim sm">${p ? `${durText(p.total * 60)} in total` : ''}</span></div>
    ${rows.length ? `<ul class="rows sl-rows">${rows.join('')}</ul>` : `<p class="dim sm">${k === today() ? 'When did you sleep last night?' : 'Nothing logged for this day.'}</p>`}
    <div class="sl-add">${hasNight ? '' : `<button class="btn line small" data-a="openSheet" data-type="sleep" data-k="${k}" data-kind="night">${i('plus')} Night sleep</button>`}<button class="btn line small" data-a="openSheet" data-type="sleep" data-k="${k}" data-kind="nap">${i('plus')} Nap</button></div>
    ${t && t.n >= 3 ? `<p class="dim sm">Last ${t.n} nights: asleep around ${clock12(t.bed)}${t.bedSd != null ? ` (± ${Math.round(t.bedSd)} min)` : ''}, up around ${clock12(t.wake)}${t.wakeSd != null ? ` (± ${Math.round(t.wakeSd)} min)` : ''}.</p>` : ''}</section>`;
}

const tlPct = (m, kind) => { const [lo, hi] = SLEEP_WINDOW[kind]; return clamp((m - lo) / (hi - lo) * 100, 0, 100); };
function sleepSheet(s) {
  const k = s.k || today();
  const existing = s.id ? (peekDay(k).sleeps || []).find(x => x.id === s.id) : null;
  if (s.id && !existing) return sheetHead('Removed');
  if (s.start == null) {
    const kind = existing?.kind || s.kind || 'night';
    Object.assign(s, { kind, ...(existing ? { start: existing.start, end: existing.end } : sleepDefaults(k, kind)) });
  }
  const [lo, hi] = SLEEP_WINDOW[s.kind];
  const ticks = s.kind === 'night' ? [[-360, '6 pm'], [0, '12 am'], [360, '6 am'], [720, '12 pm']] : [[360, '6 am'], [720, '12 pm'], [1080, '6 pm'], [1440, '12 am']];
  const slider = (key, label) => `<div class="rng"><div class="rng-top"><span>${label}</span><span class="rng-step"><button class="step" data-a="sleepStep" data-k="${key}" data-by="-15" aria-label="15 minutes earlier">−</button><b id="sl-${key}">${clock12(s[key])}</b><button class="step" data-a="sleepStep" data-k="${key}" data-by="15" aria-label="15 minutes later">+</button></span></div>
      <input type="range" id="sl-in-${key}" min="${lo}" max="${hi}" step="15" value="${s[key]}" data-f="sleepRange" data-k="${key}" aria-label="${label}"></div>`;
  return `${sheetHead(existing ? `Edit ${s.kind === 'night' ? 'night sleep' : 'nap'}` : s.kind === 'night' ? 'Night sleep' : 'Nap', k === today() ? (s.kind === 'night' ? 'The night that ended this morning' : 'Today') : niceDate(k))}
    ${existing ? '' : `<div class="seg">${[['night', 'Night'], ['nap', 'Nap']].map(([v, l]) => `<button class="${s.kind === v ? 'on' : ''}" data-a="sleepKind" data-v="${v}">${l}</button>`).join('')}</div>`}
    <div class="tl"><div class="tl-track"><i class="tl-fill" id="sl-fill" style="left:${tlPct(s.start, s.kind)}%;width:${tlPct(s.end, s.kind) - tlPct(s.start, s.kind)}%"></i>${ticks.map(([m]) => `<span class="tl-tick" style="left:${tlPct(m, s.kind)}%"></span>`).join('')}</div>
      <div class="tl-labels">${ticks.map(([m, l]) => `<span style="left:${tlPct(m, s.kind)}%">${l}</span>`).join('')}</div></div>
    ${slider('start', 'Fell asleep')}
    ${slider('end', 'Woke up')}
    <p class="sl-dur" id="sl-dur">${durText(s.end - s.start)}</p>
    <div class="form sheet-foot"><button class="btn solid wide" data-a="saveSleep">${existing ? 'Update' : 'Save'}</button>
    ${existing ? '<button class="link danger block-link" data-a="deleteSleep">Remove</button>' : ''}</div>`;
}
// Keeps the two times apart (at least 15 minutes) and redraws only the parts that change while dragging.
let sleepTickAt = 0;
function setSleepTime(key, value) {
  const s = ui.sheet, [lo, hi] = SLEEP_WINDOW[s.kind];
  const before = s[key];
  s[key] = clamp(value, lo, hi);
  // A light tick for every 15 minutes passed, like the iPhone's own time wheels.
  if (s[key] !== before && performance.now() - sleepTickAt > 45) { sleepTickAt = performance.now(); haptic(); }
  if (key === 'start' && s.end < s.start + 15) s.end = Math.min(hi, s.start + 15);
  if (key === 'end' && s.start > s.end - 15) s.start = Math.max(lo, s.end - 15);
  if (s.end - s.start < 15) s.start = s.end - 15;
  ['start', 'end'].forEach(x => {
    const t = document.getElementById(`sl-${x}`), r = document.getElementById(`sl-in-${x}`);
    if (t) t.textContent = clock12(s[x]);
    if (r && Number(r.value) !== s[x]) r.value = s[x];
  });
  const f = document.getElementById('sl-fill');
  if (f) { f.style.left = `${tlPct(s.start, s.kind)}%`; f.style.width = `${tlPct(s.end, s.kind) - tlPct(s.start, s.kind)}%`; }
  const d = document.getElementById('sl-dur');
  if (d) d.textContent = durText(s.end - s.start);
}

/* ---------- Caffeine ---------- */
const CAF_TYPES = [['coffee', 'Coffee', 95], ['espresso', 'Espresso shot', 65], ['chai', 'Chai or tea', 40], ['pill', 'Caffeine pill', 200], ['pre', 'Pre-workout', 200], ['energy', 'Energy drink', 80], ['cola', 'Cola', 35]];
const cafType = id => CAF_TYPES.find(x => x[0] === id) || ['other', 'Caffeine', 100];
// Caffeine per 100 g or ml of a logged food, from its name. Rough, typical values.
function cafPer100(name, grams) {
  const n = String(name || '').toLowerCase();
  if (/decaf|caffeine.?free|herbal/.test(n)) return 0;
  if (/espresso/.test(n)) return 212;
  if (/coffee/.test(n) && /powder|instant|granule|nescafe|bru\b/.test(n) && grams > 0 && grams <= 15) return 3000;
  if (/cold coffee|frapp|iced coffee/.test(n)) return 25;
  if (/cappuccino|latte|flat white|mocha|macchiato/.test(n)) return 30;
  if (/coffee|americano|cold brew/.test(n)) return 40;
  if (/green tea/.test(n)) return 12;
  if (/\bchai\b|masala tea|milk tea|\btea\b/.test(n)) return 15;
  if (/red bull|monster|energy drink|\bsting\b/.test(n)) return 32;
  if (/\bcola\b|coca|\bcoke\b|pepsi|thums up/.test(n)) return 10;
  if (/pre.?workout/.test(n) && grams > 0 && grams <= 30) return 2000;
  return 0;
}
const entryCaf = e => (e.cafMg != null ? e.cafMg : Math.round(cafPer100(e.name, e.grams || 0) * (e.grams || 0) / 100));
// Every caffeine source of a day, in time order. Food entries without a time come last.
function caffeineOn(k) {
  const d = peekDay(k);
  const own = (d.caf || []).map(x => ({ ...x, label: cafType(x.what)[1], src: 'own' }));
  const food = SLOTS.flatMap(([slot]) => (d.meals?.[slot] || []).map(e => ({ e, slot }))).map(({ e, slot }) => ({ id: e.id, slot, mg: entryCaf(e), at: e.at ?? null, label: e.name, src: 'food' })).filter(x => x.mg > 0);
  return [...own, ...food].sort((a, b) => (a.at ?? 9999) - (b.at ?? 9999));
}
function caffeineSummary(k) {
  const list = caffeineOn(k), timed = list.filter(x => x.at != null);
  return { list, mg: sum(list.map(x => x.mg)), last: timed.length ? Math.max(...timed.map(x => x.at)) : null };
}
// Hours from the last caffeine of day k to falling asleep that night (the next day's night sleep).
function cafToBed(k) {
  const c = caffeineSummary(k), n = mainNight(addDays(k, 1));
  return c.last != null && n ? (n.start + MIN_DAY - c.last) / 60 : null;
}
function caffeineCard(k) {
  const c = caffeineSummary(k), isToday = k === today();
  const rows = c.list.map(x => `<li><button class="row" data-a="openSheet" data-type="caffeine" data-k="${k}" data-id="${x.id}" data-src="${x.src}"${x.slot ? ` data-slot="${x.slot}"` : ''}>
      <span>${esc(x.label)}<em>${x.at != null ? clock12(x.at) : 'time not logged, tap to add'}${x.src === 'food' ? ', from food' : ''}</em></span><span class="dim">${x.mg} mg</span></button></li>`).join('');
  const late = c.last != null && c.last >= 14 * 60;
  return `<section class="block card caf-card"><div class="q-head"><h2>Caffeine</h2><span class="dim sm">${c.mg ? `${c.mg} mg${c.last != null ? `, last at ${clock12(c.last)}` : ''}` : ''}</span></div>
    ${rows ? `<ul class="rows caf-rows">${rows}</ul>` : ''}
    <div class="pills caf-add">${CAF_TYPES.map(([id, l]) => `<button class="pill" data-a="openSheet" data-type="caffeine" data-k="${k}" data-what="${id}">+ ${esc(l)}</button>`).join('')}</div>
    <p class="dim sm">${c.mg > 400 ? 'Over 400 mg today, the usual safe daily limit. ' : ''}${late && isToday ? 'Caffeine after 2 pm can still be in you at bedtime. ' : ''}Coffee or chai you log in Food counts here on its own.</p></section>`;
}
function caffeineSheet(s) {
  const k = s.k || today(), d = peekDay(k);
  if (s.src === 'food') {
    const e = (d.meals?.[s.slot] || []).find(x => x.id === s.id);
    if (!e) return sheetHead('Removed');
    return `${sheetHead(e.name, `${e.amount || ''}, logged in Food`)}
      <div class="form"><div class="two">${field('Time', 'caf-at', e.at != null ? clock24(e.at) : '', 'type="time"')}${field('Caffeine, mg', 'caf-mg', entryCaf(e), 'inputmode="numeric"')}</div>
      <p class="sm dim">The amount is estimated from the food's name and weight. Change it if you know better.</p>
      <button class="btn solid wide" data-a="saveCaffeine">Save</button></div>`;
  }
  const existing = s.id ? (d.caf || []).find(x => x.id === s.id) : null;
  if (s.id && !existing) return sheetHead('Removed');
  const what = existing?.what || s.what || 'coffee', [, label, dflt] = cafType(what);
  const mg = existing?.mg ?? state.settings.cafMg?.[what] ?? dflt;
  const at = existing?.at ?? (k === today() ? nowMin() : 9 * 60);
  return `${sheetHead(existing ? `Edit ${label.toLowerCase()}` : label, k === today() ? 'Today' : niceDate(k))}
    <div class="form"><div class="two">${field('Time', 'caf-at', clock24(at), 'type="time"')}${field('Caffeine, mg', 'caf-mg', mg, 'inputmode="numeric"')}</div>
    <p class="sm dim">${what === 'pill' || what === 'pre' ? 'Check the label for the mg per serving. The app remembers it for next time.' : 'A typical amount. Change it if yours is stronger or weaker.'}</p>
    <button class="btn solid wide" data-a="saveCaffeine">${existing ? 'Update' : 'Add'}</button></div>
    ${existing ? '<button class="link danger block-link" data-a="deleteCaffeine">Remove</button>' : ''}`;
}

/* ---------- Report ---------- */
function rhythmReport(days) {
  const out = [];
  const logged = days.filter(k => sleepParts(k));
  out.push('', 'SLEEP (each date = the night before it + naps that day; 24 h clock)');
  if (!logged.length) out.push('Sleep not logged.');
  else {
    days.forEach(k => {
      const p = sleepParts(k);
      if (!p) { out.push(`${dayLabel(k)}: not logged`); return; }
      const d = peekDay(k);
      const bits = p.timed.map(x => `${x.kind} ${clock24(x.start)}–${clock24(x.end)} (${round(sleepMins(x) / 60, 2)} h)`);
      if (d.sleep != null && !p.timed.some(x => x.kind === 'night')) bits.unshift(`night ${d.sleep} h (no times)`);
      (d.naps || []).forEach(h => bits.push(`nap ${h} h (no times)`));
      out.push(`${dayLabel(k)}: ${bits.join(' + ')} = ${p.total} h`);
    });
    const parts = logged.map(sleepParts);
    out.push(`Average ${round(avg(parts.map(p => p.total)), 1)} h a day (night ${round(avg(parts.map(p => p.night)), 1)} + naps ${round(avg(parts.map(p => p.naps)), 1)}), ${logged.length} of ${days.length} days logged. Naps on ${parts.filter(p => p.napCount).length} days.`);
    const t = sleepTiming(days);
    if (t) out.push(`Fell asleep on average ${clock24(t.bed)}${t.bedSd != null ? `, spread ± ${Math.round(t.bedSd)} min` : ''} (earliest ${clock24(t.bedLo)}, latest ${clock24(t.bedHi)}). Woke on average ${clock24(t.wake)}${t.wakeSd != null ? `, spread ± ${Math.round(t.wakeSd)} min` : ''} (earliest ${clock24(t.wakeLo)}, latest ${clock24(t.wakeHi)}). ${t.n} nights with times.`);
  }
  out.push('', 'CAFFEINE (mg at each time; estimates for coffee and tea logged as food)');
  const cdays = days.filter(k => caffeineOn(k).length);
  if (!cdays.length) out.push('No caffeine logged.');
  else {
    days.forEach(k => {
      const c = caffeineSummary(k);
      if (!c.list.length) { out.push(`${dayLabel(k)}: none logged`); return; }
      const gap = cafToBed(k);
      out.push(`${dayLabel(k)}: ${c.mg} mg: ${c.list.map(x => `${x.label} ${x.mg} at ${x.at != null ? clock24(x.at) : 'no time'}`).join(', ')}${gap != null ? `. Last one ${round(gap, 1)} h before falling asleep` : ''}`);
    });
    const mgs = cdays.map(k => caffeineSummary(k).mg), gaps = cdays.map(cafToBed).filter(x => x != null);
    out.push(`Average ${Math.round(avg(mgs))} mg on ${cdays.length} days with caffeine. Days over 400 mg: ${mgs.filter(x => x > 400).length}. Days with caffeine within 8 h of falling asleep: ${gaps.filter(x => x < 8).length} of ${gaps.length}.`);
  }
  return out;
}
// One line per week for the monthly review.
function rhythmWeek(days) {
  const parts = days.map(sleepParts).filter(Boolean), t = sleepTiming(days);
  const c = days.filter(k => caffeineOn(k).length).map(k => caffeineSummary(k).mg);
  return [parts.length ? `sleep ${round(avg(parts.map(p => p.total)), 1)} h` : '', t ? `asleep ${clock24(t.bed)}${t.bedSd != null ? ` ± ${Math.round(t.bedSd)} min` : ''}, up ${clock24(t.wake)}` : '', c.length ? `caffeine ${Math.round(avg(c))} mg` : ''].filter(Boolean).join(', ');
}

/* ---------- Sheets, actions and fields (wired up in sheets.js and app.js) ---------- */
Object.assign(SHEETS, { sleep: sleepSheet, caffeine: caffeineSheet }, COACH_SHEETS);
const RHYTHM_ACTIONS = {
  sleepKind(d) { const s = ui.sheet; s.kind = d.v; Object.assign(s, sleepDefaults(s.k || today(), d.v)); render(); },
  sleepStep(d) { setSleepTime(d.k, ui.sheet[d.k] + Number(d.by)); },
  saveSleep() {
    const s = ui.sheet, day = getDay(s.k || today());
    day.sleeps = day.sleeps || [];
    const entry = { id: s.id || uid(), kind: s.kind, start: s.start, end: s.end };
    const at = day.sleeps.findIndex(x => x.id === entry.id);
    if (at >= 0) day.sleeps[at] = entry; else day.sleeps.push(entry);
    if (entry.kind === 'night') delete day.sleep; // timed night replaces an older hours-only one
    haptic();
    playFood();
    Motion.after(() => Motion.say(`${durText(sleepMins(entry))} of ${entry.kind === 'night' ? 'sleep' : 'nap'}`));
    closeSheet();
  },
  deleteSleep() {
    const s = ui.sheet, day = getDay(s.k || today());
    day.sleeps = (day.sleeps || []).filter(x => x.id !== s.id);
    if (!day.sleeps.length) delete day.sleeps;
    haptic();
    closeSheet();
  },
  saveCaffeine() {
    const s = ui.sheet, day = getDay(s.k || today());
    const at = timeToMin(v('caf-at')), mg = num(v('caf-mg'));
    if (mg == null || mg < 0) { toast('Enter the caffeine in mg'); return; }
    if (s.src === 'food') {
      const e = (day.meals?.[s.slot] || []).find(x => x.id === s.id);
      if (e) { if (at != null) e.at = at; if (mg !== entryCaf(e)) e.cafMg = mg; }
    } else {
      if (at == null) { toast('Pick a time'); return; }
      day.caf = day.caf || [];
      const existing = s.id ? day.caf.find(x => x.id === s.id) : null;
      const what = existing?.what || s.what || 'coffee';
      if (existing) Object.assign(existing, { at, mg }); else day.caf.push({ id: uid(), what, mg, at });
      state.settings.cafMg = { ...(state.settings.cafMg || {}), [what]: mg };
      playFood();
      Motion.after(() => Motion.say(`+${mg} mg caffeine`));
    }
    haptic();
    closeSheet();
  },
  deleteCaffeine() {
    const s = ui.sheet, day = getDay(s.k || today());
    day.caf = (day.caf || []).filter(x => x.id !== s.id);
    if (!day.caf.length) delete day.caf;
    haptic();
    closeSheet();
  },
};
const RHYTHM_FIELDS = {
  sleepRange(d, el) { setSleepTime(d.k, Number(el.value)); },
};
