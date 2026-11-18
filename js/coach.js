'use strict';
// Changes Claude makes after each weekly check-in. Each update is applied once when the app opens:
// new food targets go into the target history, rep ranges go into the plan, and each lift gets a
// target for its next session. After he logs that lift once, the normal progression takes over again.

const COACH_UPDATES = [
  {
    id: 1, date: '2026-11-15', from: '2026-11-16', title: 'Week of 16 Nov',
    targets: { kcal: 2825, protein: 160, fat: 75, carbs: 377 },
    reason: 'Coach: check-in #1, fat up to 75 g, same calories',
    others: 'Creatine monohydrate 5 g (raised from 3 g on 15 Nov). Nova-Glow replaced liposomal glutathione 600 mg on 18 Nov.',
    rules: [
      'Train all 5 days. Lower body is never the day you skip. If one has to go, drop Push: chest already gets plenty.',
      'Training at home? Start the Lower body day and tap "Do home workout instead". Not Push.',
      'Warm up with 1 or 2 light sets marked W (tap the set number). Then do straight sets at one weight, stopping each set with about 2 reps left.',
      'Go to failure only where a lift says "last set to failure": the final set, until you can\'t do another clean rep. Never on squats, presses or rows.',
      'Lifts marked "Coach target" have this week\'s weight and reps from Claude. After you log a lift once, the app\'s normal progression takes over.',
      'Saturday: leg curl and hip thrust are not optional. Skip the cable kickbacks; 2 sets of pushdowns is enough.',
      'Weigh in every morning, tap last night\'s sleep, and log every meal, Sunday included.',
    ],
    // Light home dumbbells and kettlebells: add reps up to 20 before moving to a heavier weight.
    ranges: {
      'Dumbbell lateral raises': [12, 20], 'Kettlebell lateral raise': [12, 20], 'Dumbbell fly': [12, 20],
      'Overhead triceps extension': [12, 20], 'Kettlebell overhead extension': [12, 20], 'Dumbbell floor press': [12, 20],
    },
    lifts: {
      // Push
      'Incline barbell bench press': { w: 50, reps: [12, 11, 10], note: 'Straight sets at 50 kg. When all 3 reach 12, go to 52.5 kg.' },
      'Dumbbell bench press': { w: 20, reps: [11, 10, 10], note: 'Three sets at 20 kg each hand.' },
      'Pec deck': { fail: 'last', w: 80, reps: [13, 12], note: 'Skip the 60 and 70 kg sets. At 15 and 15, go to 85 kg.' },
      'Machine shoulder press': { w: 40, reps: [9, 8, 8], note: 'All three sets at 40 kg.' },
      'Cable lateral raises': { fail: 'last', w: 10, reps: [15, 14, 14], note: 'Add reps up to 20 before adding weight.' },
      'Machine triceps extension': { w: 40, reps: [10, 10], note: '35 kg × 12 hit the top of the range.' },
      'Rope pushdown': { fail: 'last', w: 40, reps: [10, 10], note: 'Two sets at 40 kg.' },
      // Pull
      'Wide or medium-grip lat pulldown': { w: 52, reps: [11, 11, 11], note: '' },
      'Single-arm cable row': { w: null, reps: [10, 10], note: '27 kg × 8 is below the 10 to 12 range. Use the plate between 20 and 27 kg.' },
      'Seated cable row': { w: null, reps: [10, 10], note: '52 kg × 12 hit the top. Use the next plate up.' },
      'Single-arm dumbbell row': { w: 17.5, reps: [11, 11], note: 'Two sets per arm, not one.' },
      'Reverse pec deck': { fail: 'last', w: 52, reps: [14, 13, 13], note: '' },
      'Preacher curls': { w: 25, reps: [10, 9, 8], note: 'Straight sets at 25 kg.' },
      // Legs, arms and abs
      'Hack squat or leg press': { w: 80, reps: [12, 12, 11], note: 'Three sets. The last one within 1 to 2 reps of failure. If 80 kg is easy, use 90 kg.' },
      'Leg extension': { fail: 'last', w: 50, reps: [12, 11, 11], note: 'Three sets at 50 kg.' },
      'Lying leg curl': { w: null, reps: [12, 12, 12], note: 'You skipped hamstrings last week. Three hard sets.' },
      'Seated leg curl': { w: null, reps: [12, 12, 12], note: 'Three hard sets.' },
      'Hip thrust machine': { w: null, reps: [12, 12], note: 'Two hard sets. Glutes got zero work last week.' },
      'Standing calf raises': { w: null, reps: [15, 15, 15], note: 'Three sets with weight (tap "Add weight"). Pause 1 s at the bottom.' },
      'Seated calf raises': { w: null, reps: [15, 15, 15], note: 'Three loaded sets. Pause 1 s at the bottom.' },
      'Cable biceps curls': { fail: 'last', w: 40, reps: [13, 12], note: '45 kg × 10 is below the 12 to 15 range.' },
      'Rope triceps pushdown': { fail: 'last', w: 45, reps: [11, 10], note: 'Two sets. No kickbacks after.' },
      'Hanging knee raises': { w: null, reps: [13, 13, 13], note: '' },
      'Machine crunch': { fail: 'last', w: 25, reps: [12, 11], note: '' },
      // Home with 8 kg
      'Decline push-up': { w: null, reps: [12, 12, 12], note: 'Feet higher than last time, or a 2 s pause at the bottom.' },
      'Dumbbell lateral raises': { fail: 'last', w: 8, reps: [14, 13, 13], note: 'Lower over 3 seconds. Reach 20 before going heavier.' },
      'Kettlebell lateral raise': { fail: 'last', w: 8, reps: [14, 13], note: 'Lower over 3 seconds.' },
      'Dumbbell fly': { w: 8, reps: [14, 13, 13], note: 'Lower over 3 seconds.' },
      'Dumbbell floor press': { w: 8, reps: [15, 14, 14], note: 'Pause 1 s on the floor.' },
      'Overhead triceps extension': { fail: 'last', w: 8, reps: [16, 15], note: 'Lower over 3 seconds.' },
      'Kettlebell overhead extension': { fail: 'last', w: 8, reps: [16, 15], note: 'Lower over 3 seconds.' },
    },
  },
];

// Runs inside migrate on the loaded save, so it works on any copy (phone, cloud) and only once per update.
function applyCoach(s) {
  if (!s.onboarded) return;
  const done = s.coachDone || [];
  COACH_UPDATES.forEach(u => {
    if (done.includes(u.id)) {
      // Already applied: the notes and lift calls can still be reworded in a later release, so the saved copy follows them.
      if (s.coach?.id === u.id) s.coach = { ...s.coach, title: u.title, rules: u.rules, lifts: u.lifts, others: u.others || s.coach.others || '' };
      return;
    }
    if (u.targets) {
      s.targets = { ...s.targets, ...u.targets };
      const k = today();
      s.targetLog = (s.targetLog || []).filter(x => x.date !== k);
      s.targetLog.push({ date: k, kcal: s.targets.kcal, protein: s.targets.protein, carbs: s.targets.carbs, fat: s.targets.fat, reason: u.reason });
    }
    Object.entries(u.ranges || {}).forEach(([name, [lo, hi]]) => {
      (s.program?.days || []).forEach(d => d.exercises.forEach(e => { if (e.name === name) { e.lo = lo; e.hi = hi; } }));
    });
    s.coach = { id: u.id, date: u.date, from: u.from, title: u.title, rules: u.rules, lifts: u.lifts, ranges: u.ranges || {}, others: u.others || s.coach?.others || '' };
    done.push(u.id);
    s.editedAt = Date.now(); // the coached copy is the newest, so sync keeps it
  });
  s.coachDone = done;
}

// This week's target for a lift, until he has logged that lift since the update.
function coachTarget(name) {
  const c = state.coach, t = c?.lifts?.[name];
  if (!t) return null;
  if (state.workouts.some(w => w.date >= c.from && w.exercises.some(e => e.name === name))) return null;
  return t;
}
function withCoachTarget(name, n) {
  const t = coachTarget(name);
  if (!t) return n;
  const opt = { id: 'coach', label: 'Coach', w: t.w ?? null, reps: t.reps };
  return { ...n, kind: 'coach', w: opt.w, reps: opt.reps, headline: 'Coach target', why: t.note || 'Set by Claude after your check-in.', options: [opt, ...n.options.filter(o => o.id !== 'coach')], chosen: 'coach' };
}
// Rep ranges Claude changed apply to home versions and added exercises too, not just plan rows.
function withCoachRange(row) {
  const r = state.coach?.ranges?.[row.name];
  return r ? { ...row, lo: r[0], hi: r[1] } : row;
}

// A single row on the Train tab; the notes open in a sheet so they don't push the workout down.
function coachButton() {
  const c = state.coach;
  if (!c?.rules?.length || daysBetween(c.from, today()) > 13) return '';
  const planNames = new Set(state.program.days.flatMap(d => d.exercises.map(e => e.name)));
  const fails = Object.entries(c.lifts || {}).filter(([n, t]) => t.fail && planNames.has(n)).length;
  return `<button class="row coach-row" data-a="openSheet" data-type="coachNotes"><span>Coach notes<em>${esc(c.title)}, ${c.rules.length} notes${fails ? `, ${fails} lifts to failure` : ''}</em></span>${i('next')}</button>`;
}
// Registered in rhythm.js, which loads after the sheets.
const COACH_SHEETS = {
  coachNotes() {
    const c = state.coach;
    const fails = Object.entries(c?.lifts || {}).filter(([, t]) => t.fail);
    return `${sheetHead('Coach notes', c ? c.title : '')}
      <ul class="coach-rules">${(c?.rules || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      ${fails.length ? `<h3 class="sh-sub">Go to failure on</h3><ul class="coach-rules">${fails.map(([n, t]) => `<li><b>${esc(n)}</b>: ${t.fail === 'all' ? 'every set' : 'last set only'}</li>`).join('')}</ul>` : ''}
      <p class="sm dim">Everything else: stop each set with about 2 reps left.</p>`;
  },
};
