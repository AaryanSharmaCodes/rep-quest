'use strict';
// Every number the app recommends is worked out here, with no interface code, so it can be tested alone.

const REFS = {
  hall08: { who: 'Hall 2008', title: 'What is the required energy deficit per unit weight loss?', where: 'Int J Obes', doi: '10.1038/sj.ijo.0803720', says: 'The energy in a kilo of weight change is not fixed. Leaner people need less per kilo because more of the change is lean tissue.' },
  heymsfield12: { who: 'Heymsfield et al. 2012', title: 'Energy content of weight loss: kinetic features during voluntary caloric restriction', where: 'Metabolism', doi: '10.1016/j.metabol.2011.11.012', says: 'Measured energy per kilo was about 4,900 kcal at week 4 and 6,000 to 6,800 later, well under the classic 7,700.' },
  schneditz23: { who: 'Schneditz et al. 2023', title: 'Day-to-day variability in euvolemic body mass', where: 'Ren Fail', doi: '10.1080/0886022x.2023.2273421', says: 'Over 9,521 days of weigh-ins from one healthy man, day-to-day changes had a standard deviation of 0.53%.' },
  mifflin90: { who: 'Mifflin et al. 1990', title: 'A new predictive equation for resting energy expenditure in healthy individuals', where: 'Am J Clin Nutr', doi: '10.1093/ajcn/51.2.241', says: 'Resting energy = 10 × kg + 6.25 × cm − 5 × age, + 5 for men or − 161 for women.' },
  iraki19: { who: 'Iraki et al. 2019', title: 'Nutrition recommendations for bodybuilders in the off-season', where: 'Sports', doi: '10.3390/sports7070154', says: 'Gain about 0.25 to 0.5% of body weight a week. Protein 1.6 to 2.2 g/kg, fat 0.5 to 1.5 g/kg.' },
  helms14: { who: 'Helms et al. 2014', title: 'Evidence-based recommendations for natural bodybuilding contest preparation', where: 'J Int Soc Sports Nutr', doi: '10.1186/1550-2783-11-20', says: 'When dieting, lose about 0.5 to 1% of body weight a week to keep muscle.' },
  murphy22: { who: 'Murphy & Koehler 2022', title: 'Energy deficiency impairs resistance training gains in lean mass but not strength', where: 'Scand J Med Sci Sports', doi: '10.1111/sms.14075', says: 'A deficit of about 500 kcal a day prevented lean mass gains. Strength gains were similar.' },
  morton18: { who: 'Morton et al. 2018', title: 'Effect of protein supplementation on resistance training-induced gains', where: 'Br J Sports Med', doi: '10.1136/bjsports-2017-097608', says: 'Across 49 trials, extra protein stopped adding fat-free mass at about 1.6 g/kg a day.' },
  schoenfeld17: { who: 'Schoenfeld et al. 2017', title: 'Dose-response relationship between weekly resistance training volume and increases in muscle mass', where: 'J Sports Sci', doi: '10.1080/02640414.2016.1210197', says: 'More weekly sets gave more growth, with groups compared at under 5, 5 to 9, and 10 or more sets per muscle.' },
  pelland26: { who: 'Pelland et al. 2026', title: 'The resistance training dose response', where: 'Sports Med', doi: '10.1007/s40279-025-02344-w', says: 'Growth rises with volume, with diminishing returns. Counting indirect sets as half a set predicted results best.' },
  plotkin22: { who: 'Plotkin et al. 2022', title: 'Progressive overload without progressing load?', where: 'PeerJ', doi: '10.7717/peerj.14142', says: 'Adding reps and adding weight both worked over 8 weeks, with similar muscle growth.' },
  refalo23: { who: 'Refalo et al. 2023', title: 'Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy', where: 'Sports Med', doi: '10.1007/s40279-022-01784-y', says: 'No clear growth advantage from always training to momentary failure.' },
  robinson24: { who: 'Robinson et al. 2024', title: 'Dose-response between estimated proximity to failure, strength gain and hypertrophy', where: 'Sports Med', doi: '10.1007/s40279-024-02069-2', says: 'Meta-regressions of reps left in reserve against strength and muscle gains.' },
  zourdos16: { who: 'Zourdos et al. 2016', title: 'Novel resistance training-specific RPE scale measuring repetitions in reserve', where: 'J Strength Cond Res', doi: '10.1519/jsc.0000000000001049', says: 'Defines the reps-in-reserve scale: RPE 10 is 0 reps left, RPE 9 is 1 left, and so on.' },
  singer24: { who: 'Singer et al. 2024', title: 'Give it a rest: effect of inter-set rest interval duration on muscle hypertrophy', where: 'Front Sports Act Living', doi: '10.3389/fspor.2024.1429789', says: 'A small growth benefit from resting over 60 s, with no clear extra benefit beyond 90 s.' },
  bell23: { who: 'Bell et al. 2023', title: 'Integrating deloading into strength and physique sports training programmes', where: 'Sports Med Open', doi: '10.1186/s40798-023-00633-0', says: 'Coach consensus defines a deload as a period of reduced training stress to manage fatigue and prepare for what follows.' },
  kreider17: { who: 'Kreider et al. 2017', title: 'ISSN position stand: safety and efficacy of creatine supplementation', where: 'J Int Soc Sports Nutr', doi: '10.1186/s12970-017-0173-z', says: 'Creatine consistently improves high-intensity performance and training adaptations.' },
};

/* ---------- Constants, each with where it comes from ---------- */
// Between the 6,000 to 6,800 kcal/kg measured in Heymsfield 2012 and the classic 7,700. A judgement call:
// Hall 2008 predicts lower values for lean people, and recomp is mostly small changes.
const KCAL_PER_KG = 7000;
const DAILY_NOISE_PCT = 0.53;      // Schneditz 2023: floor for how noisy a daily weigh-in is
const AUTOCORRELATION = 1.25;      // weigh-ins aren't independent (their 7-day SD is above their 1-day SD), so widen the error
const PRIOR_SD = 450;              // how far formula-based expenditure can reasonably miss
const UNLOCK_WEIGH_INS = 10;       // the coach starts after 10 days of weight and workout data
const UNLOCK_WORKOUTS = 4;         // about two weeks of training at 2 to 5 sessions a week
const CONFIDENCE_Z = 1.28;         // act when about 90% sure the rate is outside the band
const MAX_STEP = 200, MIN_STEP = 75; // the plan's rule: adjust by 150 to 200 kcal at a time

const GOALS = {
  cut: { label: 'Lose weight', aim: 'to lose weight', plain: 'Eat less than you burn, so your body uses stored fat. Also called a cut.', lo: -1, hi: -0.5, says: 'Lose fat while keeping muscle.', refs: ['helms14', 'murphy22'] },
  bulk: { label: 'Bulk', aim: 'for a bulk', plain: 'Eat well above what you burn to build muscle faster. You will gain some fat too.', lo: 0.5, hi: 1, says: 'Gain faster to build muscle, accepting more fat. No study pins an exact rate, so this band is a working choice you can edit.', refs: [] },
  gain: { label: 'Lean gain', aim: 'for a lean gain', plain: 'Eat slightly more than you burn. Muscle comes slower than a bulk, with less fat.', lo: 0.25, hi: 0.5, says: 'Gain slowly to keep fat low.', refs: ['iraki19'] },
  recomp: { label: 'Recomp', aim: 'for a recomp', plain: 'Short for body recomposition. Eat about what you burn to build muscle and lose fat at the same time.', lo: -0.25, hi: 0.1, says: 'Build muscle while your weight stays about the same or falls slowly. No study pins an exact rate, so this band is a working choice you can edit.', refs: [] },
  custom: { label: 'Custom', lo: -0.1, hi: 0.1, says: 'Pick your own weekly range.', refs: [] },
};
const ACTIVITY = [
  { id: 'light', pal: 1.4, label: 'Not very active', brief: 'Mostly sitting, little exercise', plain: 'You sit for most of the day, like at a desk or in class, and rarely work out.' },
  { id: 'moderate', pal: 1.6, label: 'Fairly active', brief: 'Desk day, lifting 3 to 5 times', plain: 'You sit for most of the day, but work out 3 to 5 times a week.' },
  { id: 'high', pal: 1.85, label: 'Very active', brief: 'Active job or daily hard training', plain: 'You are on your feet at work, like a waiter or labourer, or you train hard nearly every day.' },
];
const LEVELS = [
  { id: 'beginner', label: 'Beginner', plain: 'New to the gym, or under 6 months of regular training. We will suggest starting weights for you.' },
  { id: 'intermediate', label: 'Intermediate', plain: 'You have trained regularly for 6 months to 2 years and roughly know your weights.' },
  { id: 'advanced', label: 'Advanced', plain: 'More than 2 years of serious training. You know what to lift.' },
];

/* ---------- Body weight ---------- */
// Smoothed weight. About a 10% daily weight on the newest reading, corrected for skipped days.
function weightTrend(points, tau = 9.5) {
  let t = null, prev = null;
  return points.map(p => {
    if (t == null) t = p.v;
    else t += (p.v - t) * (1 - Math.exp(-daysBetween(prev, p.date) / tau));
    prev = p.date;
    return { ...p, t };
  });
}
function fitLine(points) {
  const n = points.length;
  if (n < 2) return null;
  const x0 = points[0].date, xs = points.map(p => daysBetween(x0, p.date)), ys = points.map(p => p.v);
  const mx = avg(xs), my = avg(ys);
  const sxx = sum(xs.map(x => (x - mx) ** 2));
  if (!sxx) return null;
  const slope = sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sxx;
  const resid = ys.map((y, i) => y - (my + slope * (xs[i] - mx)));
  const sd = n > 2 ? Math.sqrt(sum(resid.map(r => r * r)) / (n - 2)) : 0;
  const floor = my * DAILY_NOISE_PCT / 100;
  const sigma = Math.max(sd, floor);
  return { slope, se: sigma / Math.sqrt(sxx) * AUTOCORRELATION, sigma, mean: my, n, last: my + slope * (xs[n - 1] - mx) };
}
const bmr = (p, weight) => (p.heightCm && p.age && p.sex && weight
  ? 10 * weight + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'female' ? -161 : 5) : null);
function formulaTDEE(p, weight) {
  const b = bmr(p, weight);
  const a = ACTIVITY.find(x => x.id === p.activity) || ACTIVITY[1];
  return b ? b * a.pal : null;
}

/* ---------- Strength ---------- */
// Epley estimate. Sets with no weight compare on reps or seconds instead.
const setScore = s => (s.w > 0 ? s.w * (1 + s.r / 30) : s.r);
const isWorking = s => s.type !== 'warmup';
const bestScore = sets => Math.max(0, ...sets.filter(isWorking).map(setScore));

function exerciseHistory(workouts, name, limit = 12) {
  const out = [];
  for (let i = workouts.length - 1; i >= 0 && out.length < limit; i--) {
    const e = workouts[i].exercises.find(x => x.name === name);
    if (e && e.sets.length) out.push({ date: workouts[i].date, sets: e.sets, deload: !!workouts[i].deload });
  }
  return out;
}
function strengthTrend(workouts, fromDate) {
  const byName = {};
  workouts.filter(w => w.date >= fromDate && !w.deload).forEach(w => w.exercises.forEach(e => {
    const b = bestScore(e.sets);
    if (b > 0) (byName[e.name] = byName[e.name] || []).push(b);
  }));
  let up = 0, down = 0, flat = 0;
  Object.values(byName).filter(a => a.length >= 2).forEach(a => {
    const change = a[a.length - 1] / a[0] - 1;
    if (change >= 0.01) up++; else if (change <= -0.025) down++; else flat++;
  });
  const total = up + down + flat;
  const state = !total ? 'unknown' : up >= down + flat ? 'up' : down > up && down >= flat ? 'down' : 'flat';
  return { up, down, flat, total, state };
}

/* ---------- Calorie coach ---------- */
// days: [{date, weight, kcal}] and kcal only counts when the day was properly logged.
function runCoach({ today: now, days, workouts, targets, goal, profile, lastChange }) {
  const from = lastChange && lastChange > addDays(now, -34) ? lastChange : addDays(now, -34);
  const inWindow = days.filter(d => d.date >= from && d.date <= now);
  const weights = inWindow.filter(d => d.weight != null).map(d => ({ date: d.date, v: d.weight }));
  const sessions = workouts.filter(w => w.date >= from && w.date <= now).length;
  const base = { from, weighIns: weights.length, sessions, needWeighIns: UNLOCK_WEIGH_INS, needSessions: UNLOCK_WORKOUTS, kcal: targets.kcal };
  const line = fitLine(weights);

  const windowDays = Math.max(1, daysBetween(from, now) + 1, weights.length ? daysBetween(weights[0].date, now) + 1 : 1);
  const spanDays = weights.length ? daysBetween(weights[0].date, now) + 1 : 1;
  const logged = inWindow.filter(d => d.kcal >= targets.kcal * 0.5);
  const coverage = logged.length / Math.max(1, Math.min(windowDays, spanDays));
  const hasIntake = coverage >= 0.4;
  const intake = hasIntake ? avg(logged.map(d => d.kcal)) : targets.kcal;
  const sdIntake = coverage >= 0.7 ? 120 : coverage >= 0.4 ? 220 : 350;

  const weight = line ? line.last : (days.filter(d => d.weight != null).pop() || {}).weight;
  const formula = formulaTDEE(profile, weight);

  if (weights.length < UNLOCK_WEIGH_INS || sessions < UNLOCK_WORKOUTS || !line) {
    return { ...base, status: 'collecting', formula, weight, coverage,
      title: lastChange && lastChange > addDays(now, -34) ? 'Measuring your new target' : 'Learning your numbers',
      body: `The coach starts after ${UNLOCK_WEIGH_INS} weigh-ins and ${UNLOCK_WORKOUTS} workouts. Until then, eat to target and log.` };
  }

  const rateKgDay = line.slope, seDay = line.se;
  const rateKgWk = rateKgDay * 7, seWk = seDay * 7;
  const toPct = kg => kg / line.mean * 100;
  const ratePct = toPct(rateKgWk), sePct = toPct(seWk);

  // What you burn: weight change plus logged food, blended with the formula by how much each can be trusted.
  const measured = intake - rateKgDay * KCAL_PER_KG;
  const sdMeasured = Math.hypot(seDay * KCAL_PER_KG, sdIntake);
  let tdee = measured, sdTdee = sdMeasured;
  if (formula) {
    const wM = 1 / sdMeasured ** 2, wP = 1 / PRIOR_SD ** 2;
    tdee = (measured * wM + formula * wP) / (wM + wP);
    sdTdee = Math.sqrt(1 / (wM + wP));
  }

  const midPct = (goal.lo + goal.hi) / 2;
  const midKcalDay = line.mean * midPct / 100 / 7 * KCAL_PER_KG;
  const aimKcal = tdee + midKcalDay;
  const zAbove = (ratePct - goal.hi) / sePct, zBelow = (goal.lo - ratePct) / sePct;
  const strength = strengthTrend(workouts, from);
  const out = { ...base, weight, formula, measured, tdee, tdeeLo: tdee - CONFIDENCE_Z * sdTdee, tdeeHi: tdee + CONFIDENCE_Z * sdTdee,
    rateKgWk, seWk, ratePct, sePct, intake, hasIntake, coverage, loggedDays: logged.length, strength, aimKcal, band: [goal.lo, goal.hi], deltaKcal: 0 };

  // Days of data until a gap of this size can be told apart from noise.
  const daysToKnow = gapPct => {
    if (gapPct <= 0) return null;
    const needSeWk = gapPct / CONFIDENCE_Z / 100 * line.mean;
    const sigmaWk = line.sigma * AUTOCORRELATION * 7;
    const n = Math.cbrt(12 * (sigmaWk / needSeWk) ** 2);
    return Math.max(0, Math.ceil(n - spanDays));
  };
  const finish = (status, delta, title, body) => {
    const baseline = targets.kcal;
    const step = Math.round(delta / 25) * 25;
    const b = bmr(profile, line.mean);
    const next = b ? Math.max(baseline + step, Math.round(b)) : baseline + step;
    const applied = next - baseline;
    const deficitAfter = tdee - next;
    return { ...out, status, deltaKcal: applied, newKcal: next, title, body, warnDeficit: deficitAfter > 500 };
  };
  const rateText = `${signed(rateKgWk, 2)} kg a week`;

  if (zAbove >= CONFIDENCE_Z) {
    const raw = aimKcal - intake;
    const delta = -clamp(raw < 0 ? -raw : MIN_STEP, MIN_STEP, MAX_STEP);
    return finish('lower', delta, `Drop ${Math.abs(Math.round(delta / 25) * 25)} kcal`,
      `Your weight is moving ${rateText}, above your ${signed(goal.hi, 2)}% limit, and the data is clear enough to act on.`);
  }
  if (zBelow >= CONFIDENCE_Z) {
    const raw = aimKcal - intake;
    const delta = clamp(raw > 0 ? raw : MIN_STEP, MIN_STEP, MAX_STEP);
    const strengthNote = strength.state === 'down' ? ' Your lifts are slipping too, which makes this more urgent.' : '';
    return finish('raise', delta, `Add ${Math.round(delta / 25) * 25} kcal`,
      `Your weight is moving ${rateText}, below your ${signed(goal.lo, 2)}% limit.${strengthNote}`);
  }
  const edgeGap = ratePct > goal.hi ? ratePct - goal.hi : ratePct < goal.lo ? goal.lo - ratePct : 0;
  if (edgeGap > 0) {
    const wait = daysToKnow(edgeGap);
    const days = wait == null ? '' : ` About ${Math.max(3, Math.min(wait, 21))} more days should settle it.`;
    return { ...out, status: 'watch', title: 'Hold steady for now', body: `It looks like ${rateText}, slightly outside your range, but daily water swings could explain that.${days}` };
  }
  if (spanDays >= 21 && strength.total >= 3 && strength.state !== 'up') {
    return { ...out, status: 'review', title: 'Calories look right, lifts are flat',
      body: 'Weight is on track but most lifts have not moved in 3 weeks. Check sleep, protein and whether your sets are close enough to failure before changing food.' };
  }
  return { ...out, status: 'hold', title: 'Keep this target', body: `${signed(rateKgWk, 2)} kg a week sits inside your range. No change needed.` };
}

// Keeps protein and fat, moves carbs. If carbs would go too low, fat gives way down to 0.5 g/kg (Iraki 2019).
function adjustMacros(targets, newKcal, weight) {
  const out = { ...targets, kcal: newKcal };
  out.carbs = Math.round((newKcal - targets.protein * 4 - targets.fat * 9) / 4);
  const minCarbs = 100;
  if (out.carbs < minCarbs) {
    out.carbs = minCarbs;
    const fat = (newKcal - targets.protein * 4 - minCarbs * 4) / 9;
    out.fat = Math.round(Math.max(fat, weight ? 0.5 * weight : 40));
  }
  return out;
}
// Starting targets for someone new: what they burn, nudged toward their goal, then protein and fat first (Morton 2018, Iraki 2019).
function suggestTargets(profile, weight, goal) {
  const burn = formulaTDEE(profile, weight);
  const b = bmr(profile, weight);
  if (!burn) return null;
  const change = weight * (goal.lo + goal.hi) / 2 / 100 / 7 * KCAL_PER_KG;
  const kcal = Math.round(Math.max(burn + change, b) / 25) * 25;
  const protein = Math.round(1.8 * weight), fat = Math.round(0.8 * weight);
  return { kcal, protein, fat, carbs: Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)) };
}
const proteinRange = w => [Math.round(1.6 * w), Math.round(2.2 * w)];
const fatRange = w => [Math.round(0.5 * w), Math.round(1.5 * w)];

/* ---------- Progressive overload ---------- */
const OVERLOAD_MODES = {
  double: { label: 'Reps, then weight', says: 'Work up to the top of your rep range on every set, then add weight.', refs: ['plotkin22'] },
  load: { label: 'Add weight', says: 'Keep reps the same and add weight whenever every set hits the target.', refs: ['plotkin22'] },
  rir: { label: 'By effort', says: 'Log reps left in reserve. Weight goes up when sets feel easier than your target.', refs: ['zourdos16', 'refalo23'] },
  manual: { label: 'My own call', says: 'No automatic target. You still see last time and can pick any option.', refs: [] },
};
const roundTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);
const fixW = w => round(w, 2);

/* ---------- Starting weights for beginners ---------- */
// First-session guesses as a share of body weight, for a man new to lifting. These are deliberately light judgement
// calls, not from a study: strength varies widely and machines differ, so the app always says to adjust by feel.
// Dumbbell shares are per hand. Kept out: anything where a share would mislead, such as assisted pull-ups.
const START_SHARE = {
  'chest press': { machine: 0.3, cable: 0.2, barbell: 0.3, 'smith machine': 0.25, dumbbell: 0.1, kettlebell: 0.1 },
  'incline press': { machine: 0.25, cable: 0.06, barbell: 0.25, 'smith machine': 0.2, dumbbell: 0.08 },
  'chest fly': { machine: 0.2, cable: 0.06, dumbbell: 0.05 },
  'vertical pull': { machine: 0.35, cable: 0.35, dumbbell: 0.1, kettlebell: 0.1 },
  row: { machine: 0.3, cable: 0.3, barbell: 0.3, dumbbell: 0.12, kettlebell: 0.12 },
  'shoulder press': { machine: 0.2, barbell: 0.25, 'smith machine': 0.2, dumbbell: 0.07, kettlebell: 0.08 },
  'lateral raise': { machine: 0.1, cable: 0.03, dumbbell: 0.03, kettlebell: 0.05 },
  'rear delt': { machine: 0.15, cable: 0.04, dumbbell: 0.03, kettlebell: 0.12 },
  'biceps curl': { machine: 0.12, cable: 0.1, 'ez bar': 0.15, dumbbell: 0.06, kettlebell: 0.08 },
  triceps: { machine: 0.15, cable: 0.12, barbell: 0.25, 'ez bar': 0.1, dumbbell: 0.08, kettlebell: 0.08 },
  squat: { machine: 0.6, barbell: 0.3, 'smith machine': 0.3, dumbbell: 0.12, kettlebell: 0.12 },
  'single leg': { machine: 0.25, dumbbell: 0.05, kettlebell: 0.08 },
  'leg extension': { machine: 0.25 },
  'leg curl': { machine: 0.2 },
  hinge: { barbell: 0.35, dumbbell: 0.12, kettlebell: 0.2 },
  glute: { machine: 0.4, barbell: 0.4, cable: 0.05, dumbbell: 0.2, kettlebell: 0.12 },
  calf: { machine: 0.4, dumbbell: 0.08, kettlebell: 0.1 },
  abs: { machine: 0.2, cable: 0.2 },
};
const START_SHARE_BY_NAME = {
  'Assisted pull-up': null, 'Barbell curl': null, 'T-bar row': null,
  'Straight-arm pulldown': 0.15, 'Face pull': 0.12, 'Hack squat': 0.3, 'Hack squat or leg press': 0.3,
  'Overhead cable triceps extension': 0.1, 'Hip abductor machine': 0.3, 'Seated calf raises': 0.2, 'Leg press calf raise': 0.5,
};
const ONE_DUMBBELL = new Set(['Goblet squat', 'Overhead triceps extension', 'Dumbbell pullover', 'Dumbbell hip thrust', 'Single-arm dumbbell row']);
const LOWER_BODY = new Set(['squat', 'single leg', 'leg extension', 'leg curl', 'hinge', 'glute', 'calf']);
const START_MAX_BODY_WEIGHT = 90; // extra body weight isn't extra strength for someone new to lifting

function startingWeight(lib, weight, sex) {
  if (!lib || !weight || !sex || !lib.inc) return null;
  const named = lib.name in START_SHARE_BY_NAME;
  const share = named ? START_SHARE_BY_NAME[lib.name] : START_SHARE[lib.pattern]?.[lib.equip];
  if (!share) return null;
  const sexScale = sex === 'female' ? (LOWER_BODY.has(lib.pattern) ? 0.8 : 0.6) : 1;
  const kg = Math.min(weight, START_MAX_BODY_WEIGHT) * share * sexScale;
  // Round down to something the gym actually has. An empty barbell is 20 kg.
  return fixW(Math.max(Math.floor(kg / lib.inc) * lib.inc, lib.equip === 'barbell' ? 20 : lib.inc));
}

function suggestNext(pe, history, start = null) {
  const unit = pe.unit === 'sec' ? 'sec' : 'reps';
  // In a live workout sets is the list of sets; in a plan it's a count.
  const planned = Array.isArray(pe.sets) ? Math.max(pe.sets.filter(s => isWorking(s) && s.type !== 'drop').length, 1) : pe.sets || 3;
  const lo = pe.lo || 8, hi = pe.hi || 12, inc = pe.inc ?? 2.5;
  const mode = pe.mode || 'double';
  const rirGoal = pe.rirGoal ?? 2;
  const last = history[0];
  if (!last) {
    if (inc === 0) return { kind: 'first', w: null, reps: Array(planned).fill(hi), headline: `Aim for ${lo} to ${hi} ${unit}`, why: `Stop with 1 to 3 ${unit} in reserve.`, options: [], stalled: false };
    if (start) return { kind: 'first', w: start.w, reps: Array(planned).fill(hi), headline: `Try about ${start.w} kg${start.each ? ' in each hand' : ''} for ${lo} to ${hi} ${unit}`, why: 'A starting guess from your body weight, and machines vary. Go lighter if it feels too heavy, or heavier if it feels easy. Stop with 2 to 3 reps left.', options: [], stalled: false };
    return { kind: 'first', w: null, reps: Array(planned).fill(hi), headline: `Find a weight for ${lo} to ${hi} ${unit}`, why: `Pick a load that leaves 1 to 3 ${unit} in reserve.`, options: [], stalled: false };
  }
  const sets = last.sets.filter(isWorking);
  if (!sets.length) return { kind: 'first', w: null, reps: Array(planned).fill(hi), headline: 'Repeat last session', why: '', options: [], stalled: false };
  const counts = {};
  sets.forEach(s => { counts[s.w] = (counts[s.w] || 0) + 1; });
  const w = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a] || b - a)[0]);
  const atW = sets.filter(s => s.w === w);
  const repsLast = sets.map(s => s.r);
  const bodyweight = !w || inc === 0;
  const allTop = atW.length >= Math.min(planned, sets.length) && atW.every(s => s.r >= hi) && atW.length >= planned;
  const heavier = fixW(w + inc);
  // Same estimated strength at the heavier weight, kept inside the range.
  const repsAfterJump = (() => {
    const score = Math.max(...atW.map(setScore));
    return clamp(Math.floor((score / Math.max(heavier, 1) - 1) * 30), lo, hi);
  })();
  const plusOne = Array.from({ length: planned }, (_, i) => Math.min((repsLast[i] ?? repsLast[repsLast.length - 1]) + 1, hi));
  const same = Array.from({ length: planned }, (_, i) => repsLast[i] ?? repsLast[repsLast.length - 1]);
  const deloadW = fixW(Math.max(roundTo(w * 0.9, inc || 1), 0));

  const scores = history.slice(0, 4).filter(h => !h.deload).map(h => bestScore(h.sets));
  const stalled = scores.length >= 4 && scores[0] <= Math.max(...scores.slice(1)) * 1.005;

  const options = [];
  if (!bodyweight) options.push({ id: 'weight', label: `Add weight`, w: heavier, reps: Array(planned).fill(repsAfterJump) });
  options.push({ id: 'rep', label: bodyweight ? `Add ${unit === 'sec' ? 'time' : 'a rep'}` : 'Add a rep', w, reps: unit === 'sec' ? same.map(r => r + 5) : same.map(r => r + 1) });
  options.push({ id: 'same', label: 'Repeat', w, reps: same });
  if (!bodyweight) options.push({ id: 'lighter', label: 'Go 10% lighter', w: deloadW, reps: same });

  const pick = id => options.find(o => o.id === id) || options[0];
  const result = (kind, opt, headline, why) => ({ kind, w: opt.w, reps: opt.reps, headline, why, options, stalled, chosen: opt.id });

  if (mode === 'manual') return result('repeat', pick('same'), 'Your call today', 'Last session is filled in. Pick any option below.');
  if (mode === 'load') {
    const target = Math.max(lo, Math.min(hi, atW[0]?.r || lo));
    if (!bodyweight && atW.every(s => s.r >= target) && atW.length >= planned) {
      const opt = { ...pick('weight'), reps: Array(planned).fill(target) };
      return result('weight', opt, `Add ${inc} kg`, `All sets hit ${target} last time.`);
    }
    return result('repeat', pick('same'), 'Finish every set', `Hit ${target} on all ${planned} sets before adding weight.`);
  }
  if (mode === 'rir') {
    const rirs = sets.map(s => s.rir).filter(v => v != null);
    const rir = rirs.length ? avg(rirs) : null;
    if (rir == null) return result('rep', pick('rep'), 'Log effort to steer this', 'Add reps in reserve to your sets and targets will follow them.');
    if (rir >= rirGoal + 1 && !bodyweight) return result('weight', pick('weight'), `Add ${inc} kg`, `Sets felt easy: about ${round(rir, 1)} reps left, against a target of ${rirGoal}.`);
    if (rir < rirGoal - 0.5) return result('repeat', pick('same'), 'Match last time', `Sets were very hard: about ${round(rir, 1)} reps left. Own this weight first.`);
    return result('rep', pick('rep'), 'Add a rep', `Effort is on target at about ${round(rir, 1)} reps left.`);
  }
  // Double progression: reps first, then weight.
  if (allTop && !bodyweight) {
    return result('weight', pick('weight'), `Add ${inc} kg`, `Every set reached ${hi}. Time for more weight.`);
  }
  const opt = { ...pick('rep'), reps: unit === 'sec' ? same.map(r => r + 5) : plusOne };
  const firstBelow = same.findIndex(r => r < hi);
  return result('rep', opt, bodyweight ? `Beat last time` : 'Add a rep', firstBelow >= 0 ? `Aim for ${plusOne.join(', ')} at ${w ? w + ' kg' : 'bodyweight'}. Weight goes up when every set hits ${hi}.` : `Top of the range on every set you did. Add the missing set.`);
}

// Warm-up ramp for heavy compounds, based on the first working weight.
function warmupSets(w, inc) {
  if (!w || w < 20) return [];
  const step = inc || 2.5;
  return [{ w: fixW(roundTo(w * 0.5, step)), r: 8 }, { w: fixW(roundTo(w * 0.75, step)), r: 4 }];
}

/* ---------- Weekly volume ---------- */
function weeklyVolume(workouts, weekFrom, lookup) {
  const out = {};
  const end = addDays(weekFrom, 6);
  workouts.filter(w => w.date >= weekFrom && w.date <= end).forEach(w => w.exercises.forEach(e => {
    const n = e.sets.filter(isWorking).length;
    if (!n) return;
    const info = lookup(e);
    out[info.p] = (out[info.p] || 0) + n;
    // Indirect sets count as half (Pelland 2026).
    (info.s || []).forEach(m => { out[m] = (out[m] || 0) + n / 2; });
  }));
  return out;
}

/* ---------- Game layer: daily quests earn XP ---------- */
const QUESTS = [
  { id: 'train', xp: 50 },
  { id: 'protein', xp: 40 },
  { id: 'calories', xp: 30 },
  { id: 'weigh', xp: 10 },
];
const SHOW_UP_XP = 20; // any logged day earns this
const dayXp = quests => SHOW_UP_XP + 2 * sum(quests.map(q => q.xp));
function levelFor(totalXp) {
  let level = 1, need = 1500, left = totalXp;
  while (left >= need) { left -= need; level++; need = 1500 + (level - 1) * 400; }
  return { level, into: left, need };
}
