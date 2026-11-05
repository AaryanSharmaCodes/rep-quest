'use strict';
// The gym exercises the app knows well: which muscles each works, sensible weight jumps, and what can replace it.
// A pattern groups exercises that do the same job, which is what makes one-tap swaps possible.
// Rest: compound 150 s and isolation 90 s (Singer 2024 found no clear extra benefit past 90 s).
const MUSCLE_NAMES = {
  chest: 'Chest', lats: 'Lats', 'upper back': 'Upper back', 'side delts': 'Side delts', 'front delts': 'Front delts', 'rear delts': 'Rear delts',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', abs: 'Abs', 'lower back': 'Lower back',
};
const MUSCLE_ORDER = ['chest', 'lats', 'upper back', 'side delts', 'rear delts', 'front delts', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'];
// Extra attention for an aesthetic physique: side and rear delts, upper chest, lats and upper back, arms.
const PRIORITY_MUSCLES = ['side delts', 'rear delts', 'chest', 'lats', 'upper back', 'biceps', 'triceps'];
const INC = { barbell: 2.5, dumbbell: 2, kettlebell: 4, cable: 2.5, machine: 5, bodyweight: 0, 'smith machine': 2.5, 'ez bar': 2.5, band: 0 };

const X = (name, pattern, p, s, equip, kind, extra = {}) => ({ name, pattern, p, s, equip, kind, inc: extra.inc ?? INC[equip] ?? 2.5, unit: extra.unit || 'reps', rest: extra.rest || (kind === 'compound' ? 150 : 90), lo: extra.lo, hi: extra.hi, cue: extra.cue });

const LIBRARY = [
  // Flat and general pressing
  X('Machine chest press', 'chest press', 'chest', ['triceps', 'front delts'], 'machine', 'compound', { lo: 6, hi: 10, cue: 'Handles at mid-chest. Shoulder blades stay back.' }),
  X('Flat machine chest press', 'chest press', 'chest', ['triceps', 'front delts'], 'machine', 'compound', { cue: 'Control the way back. Stop before your shoulders roll forward.' }),
  X('Barbell bench press', 'chest press', 'chest', ['triceps', 'front delts'], 'barbell', 'compound', { cue: 'Touch mid-chest. Feet planted.' }),
  X('Dumbbell bench press', 'chest press', 'chest', ['triceps', 'front delts'], 'dumbbell', 'compound', { cue: 'Weight is per hand. Lower to a deep comfortable stretch.' }),
  X('Smith machine bench press', 'chest press', 'chest', ['triceps', 'front delts'], 'smith machine', 'compound'),
  X('Cable chest press', 'chest press', 'chest', ['triceps', 'front delts'], 'cable', 'compound'),
  X('Push-up', 'chest press', 'chest', ['triceps', 'front delts'], 'bodyweight', 'compound', { lo: 10, hi: 25 }),
  X('Chest dip', 'chest press', 'chest', ['triceps', 'front delts'], 'bodyweight', 'compound', { cue: 'Lean forward. Skip if shoulders complain.' }),
  // Upper chest
  X('Incline machine chest press', 'incline press', 'chest', ['front delts', 'triceps'], 'machine', 'compound', { cue: 'Seat low enough that the handles travel toward your upper chest.' }),
  X('Incline dumbbell press', 'incline press', 'chest', ['front delts', 'triceps'], 'dumbbell', 'compound', { cue: 'Bench at about 30 degrees. Weight is per hand.' }),
  X('Incline barbell bench press', 'incline press', 'chest', ['front delts', 'triceps'], 'barbell', 'compound'),
  X('Incline Smith machine press', 'incline press', 'chest', ['front delts', 'triceps'], 'smith machine', 'compound'),
  X('Low-to-high cable fly', 'incline press', 'chest', ['front delts'], 'cable', 'isolation', { lo: 12, hi: 15 }),
  // Fly
  X('Pec deck', 'chest fly', 'chest', [], 'machine', 'isolation', { lo: 12, hi: 15, inc: 2.5, cue: 'Soft elbows. Squeeze without pressing.' }),
  X('Cable fly', 'chest fly', 'chest', [], 'cable', 'isolation', { lo: 12, hi: 15 }),
  X('Dumbbell fly', 'chest fly', 'chest', [], 'dumbbell', 'isolation', { lo: 10, hi: 15 }),
  // Vertical pull
  X('Lat pulldown', 'vertical pull', 'lats', ['biceps', 'upper back'], 'cable', 'compound', { cue: 'Drive elbows to your ribs. Avoid leaning way back.' }),
  X('Wide or medium-grip lat pulldown', 'vertical pull', 'lats', ['biceps', 'upper back'], 'cable', 'compound', { cue: 'Drive elbows down and slightly back.' }),
  X('Neutral-grip lat pulldown', 'vertical pull', 'lats', ['biceps', 'upper back'], 'cable', 'compound'),
  X('Machine pulldown', 'vertical pull', 'lats', ['biceps', 'upper back'], 'machine', 'compound'),
  X('Pull-up', 'vertical pull', 'lats', ['biceps', 'upper back'], 'bodyweight', 'compound', { lo: 5, hi: 12 }),
  X('Assisted pull-up', 'vertical pull', 'lats', ['biceps', 'upper back'], 'machine', 'compound', { cue: 'Log the assistance as your weight. Less is progress.' }),
  X('Straight-arm pulldown', 'vertical pull', 'lats', [], 'cable', 'isolation', { lo: 12, hi: 15 }),
  // Rows
  X('Chest-supported row', 'row', 'upper back', ['lats', 'biceps', 'rear delts'], 'machine', 'compound', { cue: 'Chest stays on the pad. Pull elbows back, no jerking.' }),
  X('Chest-supported machine row', 'row', 'upper back', ['lats', 'biceps', 'rear delts'], 'machine', 'compound', { cue: 'Chest stays on the pad.' }),
  X('Seated cable row', 'row', 'upper back', ['lats', 'biceps', 'rear delts'], 'cable', 'compound', { cue: 'Stay tall. Pull to your lower ribs.' }),
  X('Single-arm cable row', 'row', 'lats', ['upper back', 'biceps'], 'cable', 'compound', { cue: 'Reach long, then pull toward your hip.' }),
  X('Single-arm dumbbell row', 'row', 'lats', ['upper back', 'biceps'], 'dumbbell', 'compound'),
  X('T-bar row', 'row', 'upper back', ['lats', 'biceps', 'rear delts'], 'barbell', 'compound'),
  X('Barbell row', 'row', 'upper back', ['lats', 'biceps', 'rear delts'], 'barbell', 'compound'),
  // Overhead
  X('Machine shoulder press', 'shoulder press', 'front delts', ['side delts', 'triceps'], 'machine', 'compound', { cue: 'Stop if neck or shoulder symptoms return.' }),
  X('Seated machine shoulder press', 'shoulder press', 'front delts', ['side delts', 'triceps'], 'machine', 'compound', { cue: 'Stop if neck or shoulder symptoms return.' }),
  X('Seated dumbbell shoulder press', 'shoulder press', 'front delts', ['side delts', 'triceps'], 'dumbbell', 'compound'),
  X('Smith machine shoulder press', 'shoulder press', 'front delts', ['side delts', 'triceps'], 'smith machine', 'compound'),
  // Side delts
  X('Cable lateral raises', 'lateral raise', 'side delts', [], 'cable', 'isolation', { lo: 12, hi: 20, inc: 1.25, cue: 'Lead with the elbow. No swinging.' }),
  X('Machine lateral raises', 'lateral raise', 'side delts', [], 'machine', 'isolation', { lo: 12, hi: 20, inc: 2.5, cue: 'Slow on the way down.' }),
  X('Dumbbell lateral raises', 'lateral raise', 'side delts', [], 'dumbbell', 'isolation', { lo: 12, hi: 20, inc: 1, cue: 'Weight is per hand. Stop at shoulder height.' }),
  X('Lean-away cable lateral raise', 'lateral raise', 'side delts', [], 'cable', 'isolation', { lo: 12, hi: 20, inc: 1.25 }),
  // Rear delts
  X('Reverse pec deck', 'rear delt', 'rear delts', ['upper back'], 'machine', 'isolation', { lo: 12, hi: 20, inc: 2.5, cue: 'Sweep your arms wide. Keep shoulders low.' }),
  X('Cable rear delt fly', 'rear delt', 'rear delts', ['upper back'], 'cable', 'isolation', { lo: 12, hi: 20, inc: 1.25 }),
  X('Dumbbell rear delt fly', 'rear delt', 'rear delts', ['upper back'], 'dumbbell', 'isolation', { lo: 12, hi: 20, inc: 1 }),
  X('Face pull', 'rear delt', 'rear delts', ['upper back'], 'cable', 'isolation', { lo: 12, hi: 20 }),
  // Biceps
  X('EZ-bar biceps curls', 'biceps curl', 'biceps', ['forearms'], 'ez bar', 'isolation', { lo: 10, hi: 12 }),
  X('Dumbbell curls', 'biceps curl', 'biceps', ['forearms'], 'dumbbell', 'isolation', { lo: 10, hi: 15, inc: 1 }),
  X('Cable biceps curls', 'biceps curl', 'biceps', ['forearms'], 'cable', 'isolation', { lo: 12, hi: 15 }),
  X('Preacher curls', 'biceps curl', 'biceps', [], 'ez bar', 'isolation', { lo: 10, hi: 12 }),
  X('Machine preacher curl', 'biceps curl', 'biceps', [], 'machine', 'isolation', { lo: 10, hi: 15, inc: 2.5 }),
  X('Incline dumbbell curl', 'biceps curl', 'biceps', [], 'dumbbell', 'isolation', { lo: 10, hi: 15, inc: 1 }),
  X('Hammer curls', 'biceps curl', 'biceps', ['forearms'], 'dumbbell', 'isolation', { lo: 10, hi: 15, inc: 1 }),
  X('Dumbbell hammer curls', 'biceps curl', 'biceps', ['forearms'], 'dumbbell', 'isolation', { lo: 10, hi: 12, inc: 1 }),
  X('Rope hammer curl', 'biceps curl', 'biceps', ['forearms'], 'cable', 'isolation', { lo: 10, hi: 15 }),
  // Triceps
  X('Rope triceps pushdown', 'triceps', 'triceps', [], 'cable', 'isolation', { lo: 10, hi: 15, cue: 'Elbows pinned. Split the rope at the bottom.' }),
  X('Rope pushdown', 'triceps', 'triceps', [], 'cable', 'isolation', { lo: 10, hi: 15 }),
  X('Triceps pushdowns', 'triceps', 'triceps', [], 'cable', 'isolation', { lo: 12, hi: 15 }),
  X('Straight-bar pushdown', 'triceps', 'triceps', [], 'cable', 'isolation', { lo: 10, hi: 15 }),
  X('Overhead cable triceps extension', 'triceps', 'triceps', [], 'cable', 'isolation', { lo: 10, hi: 15, cue: 'Deep stretch overhead. Keep elbows forward.' }),
  X('Overhead triceps extension', 'triceps', 'triceps', [], 'dumbbell', 'isolation', { lo: 10, hi: 15 }),
  X('Skull crusher', 'triceps', 'triceps', [], 'ez bar', 'isolation', { lo: 10, hi: 12 }),
  X('Machine triceps extension', 'triceps', 'triceps', [], 'machine', 'isolation', { lo: 10, hi: 15, inc: 2.5 }),
  X('Close-grip bench press', 'triceps', 'triceps', ['chest'], 'barbell', 'compound', { lo: 6, hi: 10 }),
  // Quads
  X('Leg press', 'squat', 'quads', ['glutes'], 'machine', 'compound', { cue: 'Lower until your hips start to tuck, then stop.' }),
  X('Hack squat or leg press', 'squat', 'quads', ['glutes'], 'machine', 'compound', { lo: 10, hi: 12 }),
  X('Hack squat', 'squat', 'quads', ['glutes'], 'machine', 'compound'),
  X('Smith machine squat', 'squat', 'quads', ['glutes'], 'smith machine', 'compound'),
  X('Barbell back squat', 'squat', 'quads', ['glutes', 'lower back'], 'barbell', 'compound'),
  X('Goblet squat', 'squat', 'quads', ['glutes'], 'dumbbell', 'compound', { lo: 10, hi: 15 }),
  X('Bulgarian split squat', 'single leg', 'quads', ['glutes'], 'dumbbell', 'compound', { cue: 'Weight is per hand. Reps are per leg.' }),
  X('Walking lunge', 'single leg', 'quads', ['glutes'], 'dumbbell', 'compound'),
  X('Step-up', 'single leg', 'quads', ['glutes'], 'dumbbell', 'compound'),
  X('Single-leg press', 'single leg', 'quads', ['glutes'], 'machine', 'compound', { inc: 2.5 }),
  X('Leg extension', 'leg extension', 'quads', [], 'machine', 'isolation', { lo: 10, hi: 15, inc: 2.5 }),
  // Hamstrings and glutes
  X('Seated leg curl', 'leg curl', 'hamstrings', [], 'machine', 'isolation', { lo: 10, hi: 15, inc: 2.5 }),
  X('Lying leg curl', 'leg curl', 'hamstrings', [], 'machine', 'isolation', { lo: 10, hi: 15, inc: 2.5 }),
  X('Romanian deadlift', 'hinge', 'hamstrings', ['glutes', 'lower back'], 'barbell', 'compound', { cue: 'Push hips back. Try this only if your back feels good.' }),
  X('Dumbbell Romanian deadlift', 'hinge', 'hamstrings', ['glutes', 'lower back'], 'dumbbell', 'compound'),
  X('45-degree back extension', 'hinge', 'hamstrings', ['glutes', 'lower back'], 'bodyweight', 'compound', { lo: 10, hi: 20 }),
  X('Hip thrust machine', 'glute', 'glutes', ['hamstrings'], 'machine', 'compound', { lo: 10, hi: 12 }),
  X('Barbell hip thrust', 'glute', 'glutes', ['hamstrings'], 'barbell', 'compound', { lo: 8, hi: 12 }),
  X('Cable kickback', 'glute', 'glutes', [], 'cable', 'isolation', { lo: 12, hi: 15 }),
  X('Hip abductor machine', 'glute', 'glutes', [], 'machine', 'isolation', { lo: 12, hi: 20, inc: 2.5 }),
  // Calves
  X('Standing calf raises', 'calf', 'calves', [], 'machine', 'isolation', { lo: 12, hi: 15, cue: 'Pause in the deep stretch at the bottom.' }),
  X('Seated calf raises', 'calf', 'calves', [], 'machine', 'isolation', { lo: 12, hi: 15, inc: 2.5 }),
  X('Leg press calf raise', 'calf', 'calves', [], 'machine', 'isolation', { lo: 12, hi: 15 }),
  // Abs
  X('Cable crunches', 'abs', 'abs', [], 'cable', 'isolation', { lo: 12, hi: 15 }),
  X('Hanging knee raises', 'abs', 'abs', [], 'bodyweight', 'isolation', { lo: 10, hi: 15 }),
  X('Captain\'s chair knee raise', 'abs', 'abs', [], 'bodyweight', 'isolation', { lo: 10, hi: 15 }),
  X('Machine crunch', 'abs', 'abs', [], 'machine', 'isolation', { lo: 12, hi: 15, inc: 2.5 }),
  X('Reverse crunch', 'abs', 'abs', [], 'bodyweight', 'isolation', { lo: 10, hi: 20 }),
  X('Plank', 'abs', 'abs', [], 'bodyweight', 'isolation', { lo: 30, hi: 60, unit: 'sec' }),
  // Home: little or no equipment. Rep ranges run higher because the load is fixed.
  X('Dumbbell floor press', 'chest press', 'chest', ['triceps', 'front delts'], 'dumbbell', 'compound', { cue: 'Lie on the floor. Weight is per hand. Elbows touch down softly.' }),
  X('Band chest press', 'chest press', 'chest', ['triceps', 'front delts'], 'band', 'compound', { lo: 12, hi: 20, cue: 'Anchor the band behind you at chest height.' }),
  X('Decline push-up', 'incline press', 'chest', ['front delts', 'triceps'], 'bodyweight', 'compound', { lo: 8, hi: 20, cue: 'Feet on a chair or bed. Body stays in one straight line.' }),
  X('Band incline press', 'incline press', 'chest', ['front delts', 'triceps'], 'band', 'compound', { lo: 12, hi: 20, cue: 'Anchor the band low and press up and forward.' }),
  X('Wide push-up', 'chest fly', 'chest', ['triceps'], 'bodyweight', 'compound', { lo: 10, hi: 25 }),
  X('Band chest fly', 'chest fly', 'chest', [], 'band', 'isolation', { lo: 12, hi: 20 }),
  X('Band lat pulldown', 'vertical pull', 'lats', ['biceps', 'upper back'], 'band', 'compound', { lo: 12, hi: 20, cue: 'Anchor the band high on a door. Drive elbows to your ribs.' }),
  X('Prone lat pull', 'vertical pull', 'lats', ['upper back'], 'bodyweight', 'isolation', { lo: 12, hi: 20, cue: 'Lie face down. Pull elbows to your ribs and squeeze.' }),
  X('Band row', 'row', 'upper back', ['lats', 'biceps', 'rear delts'], 'band', 'compound', { lo: 12, hi: 20 }),
  X('Under-table row', 'row', 'upper back', ['lats', 'biceps'], 'bodyweight', 'compound', { lo: 8, hi: 15, cue: 'Lie under a sturdy table, grip the edge and pull your chest up. Test that it holds you first.' }),
  X('Pike push-up', 'shoulder press', 'front delts', ['side delts', 'triceps'], 'bodyweight', 'compound', { lo: 6, hi: 15, cue: 'Hips high. Lower your head toward the floor.' }),
  X('Band overhead press', 'shoulder press', 'front delts', ['side delts', 'triceps'], 'band', 'compound', { lo: 12, hi: 20 }),
  X('Band lateral raise', 'lateral raise', 'side delts', [], 'band', 'isolation', { lo: 15, hi: 25 }),
  X('Water bottle lateral raise', 'lateral raise', 'side delts', [], 'bodyweight', 'isolation', { lo: 15, hi: 30, cue: 'Full bottles or any light household weight. Stop at shoulder height.' }),
  X('Band pull-apart', 'rear delt', 'rear delts', ['upper back'], 'band', 'isolation', { lo: 15, hi: 25 }),
  X('Prone Y raise', 'rear delt', 'rear delts', ['upper back'], 'bodyweight', 'isolation', { lo: 12, hi: 20, cue: 'Lie face down and lift your arms in a Y.' }),
  X('Band curl', 'biceps curl', 'biceps', ['forearms'], 'band', 'isolation', { lo: 12, hi: 20 }),
  X('Backpack curl', 'biceps curl', 'biceps', ['forearms'], 'bodyweight', 'isolation', { lo: 10, hi: 20, cue: 'Load a backpack with books. Elbows stay at your sides.' }),
  X('Band pushdown', 'triceps', 'triceps', [], 'band', 'isolation', { lo: 12, hi: 20 }),
  X('Diamond push-up', 'triceps', 'triceps', ['chest'], 'bodyweight', 'compound', { lo: 6, hi: 20 }),
  X('Bodyweight squat', 'squat', 'quads', ['glutes'], 'bodyweight', 'compound', { lo: 15, hi: 30 }),
  X('Band squat', 'squat', 'quads', ['glutes'], 'band', 'compound', { lo: 12, hi: 20 }),
  X('Reverse lunge', 'single leg', 'quads', ['glutes'], 'bodyweight', 'compound', { lo: 10, hi: 20, cue: 'Reps are per leg.' }),
  X('Bodyweight split squat', 'single leg', 'quads', ['glutes'], 'bodyweight', 'compound', { lo: 8, hi: 20, cue: 'Back foot on a chair. Reps are per leg.' }),
  X('Sissy squat', 'leg extension', 'quads', [], 'bodyweight', 'isolation', { lo: 8, hi: 20, cue: 'Hold a door frame. Knees travel forward, hips stay open.' }),
  X('Band leg curl', 'leg curl', 'hamstrings', [], 'band', 'isolation', { lo: 12, hi: 20 }),
  X('Sliding leg curl', 'leg curl', 'hamstrings', [], 'bodyweight', 'isolation', { lo: 8, hi: 15, cue: 'Heels on a towel on a smooth floor. Hips up, slide out slowly.' }),
  X('Single-leg hip hinge', 'hinge', 'hamstrings', ['glutes'], 'bodyweight', 'isolation', { lo: 10, hi: 20, cue: 'Reps are per leg.' }),
  X('Dumbbell hip thrust', 'glute', 'glutes', ['hamstrings'], 'dumbbell', 'compound', { lo: 10, hi: 15, cue: 'Back on a sofa edge, dumbbell on your hips.' }),
  X('Band kickback', 'glute', 'glutes', [], 'band', 'isolation', { lo: 12, hi: 20 }),
  X('Glute bridge', 'glute', 'glutes', ['hamstrings'], 'bodyweight', 'isolation', { lo: 15, hi: 30 }),
  X('Dumbbell calf raise', 'calf', 'calves', [], 'dumbbell', 'isolation', { lo: 12, hi: 20, inc: 1 }),
  X('Single-leg calf raise', 'calf', 'calves', [], 'bodyweight', 'isolation', { lo: 10, hi: 20, cue: 'On a step. Pause at the bottom. Reps are per leg.' }),
  X('Leg raise', 'abs', 'abs', [], 'bodyweight', 'isolation', { lo: 10, hi: 20 }),
  X('Barbell floor press', 'chest press', 'chest', ['triceps', 'front delts'], 'barbell', 'compound', { cue: 'Lie on the floor. Upper arms touch down softly, then press.' }),
  X('Barbell overhead press', 'shoulder press', 'front delts', ['side delts', 'triceps'], 'barbell', 'compound', { lo: 6, hi: 10, cue: 'Squeeze your glutes. Press straight up, head through at the top.' }),
  X('Barbell curl', 'biceps curl', 'biceps', ['forearms'], 'barbell', 'isolation', { lo: 8, hi: 12 }),
  X('Dumbbell pullover', 'vertical pull', 'lats', ['chest'], 'dumbbell', 'isolation', { lo: 10, hi: 15, cue: 'Lie down, arms long. Lower behind your head and pull back with your lats.' }),
  X('Bench-supported dumbbell row', 'row', 'upper back', ['lats', 'biceps', 'rear delts'], 'dumbbell', 'compound', { cue: 'One knee and hand on the bench. Pull toward your hip.' }),
  X('Kettlebell floor press', 'chest press', 'chest', ['triceps', 'front delts'], 'kettlebell', 'compound', { cue: 'Lie on the floor. One side at a time if you only have one.' }),
  X('Kettlebell pullover', 'vertical pull', 'lats', ['chest'], 'kettlebell', 'isolation', { lo: 10, hi: 15 }),
  X('Kettlebell row', 'row', 'upper back', ['lats', 'biceps', 'rear delts'], 'kettlebell', 'compound', { cue: 'Hinge forward with a flat back. Reps are per arm.' }),
  X('Kettlebell overhead press', 'shoulder press', 'front delts', ['side delts', 'triceps'], 'kettlebell', 'compound', { cue: 'Reps are per arm.' }),
  X('Kettlebell lateral raise', 'lateral raise', 'side delts', [], 'kettlebell', 'isolation', { lo: 12, hi: 20, cue: 'Light only. Reps are per arm.' }),
  X('Kettlebell high pull', 'rear delt', 'rear delts', ['upper back'], 'kettlebell', 'compound', { lo: 10, hi: 15, cue: 'Hinge, then pull with the elbows high and wide.' }),
  X('Kettlebell curl', 'biceps curl', 'biceps', ['forearms'], 'kettlebell', 'isolation', { lo: 10, hi: 15 }),
  X('Kettlebell overhead extension', 'triceps', 'triceps', [], 'kettlebell', 'isolation', { lo: 10, hi: 15 }),
  X('Kettlebell goblet squat', 'squat', 'quads', ['glutes'], 'kettlebell', 'compound', { lo: 10, hi: 20 }),
  X('Kettlebell lunge', 'single leg', 'quads', ['glutes'], 'kettlebell', 'compound', { lo: 8, hi: 15, cue: 'Reps are per leg.' }),
  X('Kettlebell deadlift', 'hinge', 'hamstrings', ['glutes', 'lower back'], 'kettlebell', 'compound', { lo: 8, hi: 15, cue: 'Push your hips back. Flat back throughout.' }),
  X('Kettlebell swing', 'glute', 'glutes', ['hamstrings'], 'kettlebell', 'compound', { lo: 12, hi: 20, cue: 'Snap your hips forward. Arms just guide the bell.' }),
  X('Kettlebell calf raise', 'calf', 'calves', [], 'kettlebell', 'isolation', { lo: 12, hi: 20 }),
  X('Chin-up', 'vertical pull', 'lats', ['biceps', 'upper back'], 'bodyweight', 'compound', { lo: 5, hi: 12 }),
  X('Bench dip', 'triceps', 'triceps', ['chest'], 'bodyweight', 'compound', { lo: 8, hi: 20, cue: 'Hands on the bench. Stop if your shoulders complain.' }),
];
// Home moves stay out of the gym's swap lists, but search still finds them.
const GYM_LIBRARY = LIBRARY.slice(0, LIBRARY.findIndex(e => e.name === 'Dumbbell floor press'));
const LIB_BY_NAME = Object.fromEntries(LIBRARY.map(e => [e.name.toLowerCase(), e]));
const libEntry = name => LIB_BY_NAME[String(name || '').toLowerCase()] || null;

// Old saves used broad muscle groups.
const OLD_MUSCLES = { shoulders: 'side delts', back: 'lats', arms: 'biceps', legs: 'quads', core: 'abs', chest: 'chest' };

const muscleInfo = e => {
  const lib = libEntry(e.name);
  if (lib) return { p: lib.p, s: lib.s };
  return { p: e.p || OLD_MUSCLES[e.muscle] || e.muscle || 'abs', s: e.s || [] };
};

function alternatesFor(name, primary) {
  const me = libEntry(name);
  if (!me) return GYM_LIBRARY.filter(e => e.p === primary).slice(0, 10);
  const sameEquip = e => (e.equip === me.equip ? 1 : 0);
  const same = GYM_LIBRARY.filter(e => e.pattern === me.pattern && e.name !== me.name).sort((a, b) => sameEquip(b) - sameEquip(a));
  const also = GYM_LIBRARY.filter(e => e.p === me.p && e.pattern !== me.pattern && e.kind === me.kind);
  return [...same, ...also].slice(0, 12);
}

// Home versions of a gym workout: each exercise is replaced by one that does the same job with what you own.
const HOME_GEAR = [['dumbbell', 'Dumbbells'], ['barbell', 'Barbell'], ['kettlebell', 'Kettlebell'], ['bench', 'Bench'], ['rack', 'Squat rack'], ['band', 'Resistance bands'], ['pullup', 'Pull-up bar'], ['dips', 'Dip bars']];
// Gym-list exercises that also work at home, and everything the home-list ones need beyond their main equipment.
const HOME_NEEDS = {
  'Push-up': [], 'Reverse crunch': [], 'Plank': [], 'Chest dip': ['dips'], 'Pull-up': ['pullup'], 'Chin-up': ['pullup'], 'Hanging knee raises': ['pullup'], 'Bench dip': ['bench'],
  'Barbell bench press': ['barbell', 'bench', 'rack'], 'Incline barbell bench press': ['barbell', 'bench', 'rack'], 'Close-grip bench press': ['barbell', 'bench', 'rack'],
  'Barbell back squat': ['barbell', 'rack'], 'Barbell row': ['barbell'], 'Romanian deadlift': ['barbell'], 'Barbell hip thrust': ['barbell', 'bench'], 'Skull crusher': ['barbell', 'bench'],
  'Dumbbell bench press': ['dumbbell', 'bench'], 'Incline dumbbell press': ['dumbbell', 'bench'], 'Incline dumbbell curl': ['dumbbell', 'bench'], 'Bench-supported dumbbell row': ['dumbbell', 'bench'],
  'Dumbbell fly': ['dumbbell'], 'Single-arm dumbbell row': ['dumbbell'], 'Seated dumbbell shoulder press': ['dumbbell'], 'Dumbbell lateral raises': ['dumbbell'], 'Dumbbell rear delt fly': ['dumbbell'],
  'Dumbbell curls': ['dumbbell'], 'Hammer curls': ['dumbbell'], 'Overhead triceps extension': ['dumbbell'], 'Goblet squat': ['dumbbell'], 'Bulgarian split squat': ['dumbbell'],
  'Walking lunge': ['dumbbell'], 'Step-up': ['dumbbell'], 'Dumbbell Romanian deadlift': ['dumbbell'],
};
const homeNeeds = e => HOME_NEEDS[e.name] ?? (GYM_LIBRARY.includes(e) ? null : e.equip === 'bodyweight' ? [] : [e.equip]);
const canDoAtHome = (e, gear) => { const needs = homeNeeds(e); return !!needs && needs.every(n => gear[n]); };
// Heaviest and most effective options first, bodyweight as the fallback.
const GEAR_RANK = { pullup: 0, barbell: 1, dips: 1, dumbbell: 2, kettlebell: 3, band: 4, bench: 5 };
const homeRank = e => Math.min(6, ...homeNeeds(e).map(n => GEAR_RANK[n] ?? 6));
function homeOptions(name, primary, gear) {
  const me = libEntry(name);
  const fit = LIBRARY.filter(e => canDoAtHome(e, gear));
  const same = me ? fit.filter(e => e.pattern === me.pattern) : [];
  const also = fit.filter(e => e.p === (me?.p || primary) && !same.includes(e));
  const byGear = (a, b) => homeRank(a) - homeRank(b);
  return [...same.sort(byGear), ...also.sort(byGear)];
}
function homeDay(rows, gear, choices = {}) {
  const out = [];
  rows.forEach(r => {
    const options = homeOptions(r.name, r.p, gear);
    const me = libEntry(r.name);
    const samePattern = options.filter(o => o.pattern === me?.pattern);
    const free = (samePattern.length ? samePattern : options).find(o => !out.some(x => x.name === o.name));
    const mine = choices[r.name] && libEntry(choices[r.name]);
    const pick = (mine && canDoAtHome(mine, gear) ? mine : null) || free || samePattern[0] || options[0];
    if (!pick) { out.push({ ...r }); return; }
    // Two gym exercises can share one home move, so its sets add up instead of listing it twice.
    const already = out.find(x => x.name === pick.name);
    if (already) already.sets += r.sets;
    else out.push({ ...planRow(pick.name, r.sets), id: r.id, swappedFrom: r.name });
  });
  return out;
}

// Turn "name, sets, low, high" into a full plan row using what the library knows.
function planRow(name, sets, lo, hi) {
  const lib = libEntry(name);
  return {
    id: uid(), name, sets, lo: lo ?? lib?.lo ?? 8, hi: hi ?? lib?.hi ?? 12,
    p: lib?.p || 'abs', s: lib?.s || [], kind: lib?.kind || 'isolation', unit: lib?.unit || 'reps',
    inc: lib?.inc ?? 2.5, rest: lib?.rest ?? 90, mode: 'double', rirGoal: 2, superset: false,
  };
}
const D = (name, rows) => ({ id: uid(), name, exercises: rows.map(r => planRow(...r)) });

// Pre-built programs. New people pick one during setup, and anyone can switch later.
const PROGRAMS = [
  {
    key: 'final', name: "Founder's plan", source: '5 days a week', says: 'Upper, lower, push, pull, then legs and arms. Extra attention on shoulders and upper chest.',
    make() {
      const mon = D('Upper body', [['Machine chest press', 3, 6, 10], ['Lat pulldown', 3, 8, 12], ['Chest-supported row', 3, 8, 12], ['Incline dumbbell press', 2, 8, 12], ['Cable lateral raises', 3, 12, 20], ['EZ-bar biceps curls', 2, 10, 12], ['Rope triceps pushdown', 2, 10, 15]]);
      const tue = D('Lower body', [['Leg press', 3, 8, 12], ['Seated leg curl', 3, 10, 15], ['Leg extension', 3, 10, 15], ['Bulgarian split squat', 2, 8, 12], ['Standing calf raises', 3, 12, 15], ['Cable crunches', 3, 12, 15]]);
      const thu = D('Push', [['Incline machine chest press', 3, 8, 12], ['Flat machine chest press', 3, 8, 12], ['Pec deck', 2, 12, 15], ['Machine lateral raises', 4, 12, 20], ['Cable lateral raises', 2, 12, 20], ['Overhead cable triceps extension', 2, 10, 15], ['Rope pushdown', 2, 10, 15]]);
      const fri = D('Pull', [['Wide or medium-grip lat pulldown', 3, 8, 12], ['Chest-supported machine row', 3, 8, 12], ['Single-arm cable row', 2, 10, 12], ['Reverse pec deck', 3, 12, 20], ['Preacher curls', 3, 10, 12], ['Hammer curls', 2, 10, 15]]);
      const sat = D('Legs, arms and abs', [['Hack squat or leg press', 3, 10, 12], ['Lying leg curl', 3, 10, 15], ['Hip thrust machine', 2, 10, 12], ['Seated calf raises', 3, 12, 15], ['Cable biceps curls', 2, 12, 15], ['Triceps pushdowns', 2, 12, 15], ['Hanging knee raises', 3, 10, 15], ['Plank', 2, 30, 60]]);
      return { days: [mon, tue, thu, fri, sat], schedule: { 1: mon.id, 2: tue.id, 4: thu.id, 5: fri.id, 6: sat.id } };
    },
  },
  {
    key: 'ul4', name: 'Upper / lower, 4 days', source: '4 days a week', says: 'Four good sessions beat five rushed ones. A good fit when recovery or time is short.',
    make() {
      const a = D('Upper 1', [['Machine chest press', 3, 6, 10], ['Lat pulldown', 3, 8, 12], ['Chest-supported row', 3, 8, 12], ['Machine shoulder press', 2, 8, 12], ['Cable lateral raises', 4, 12, 20], ['EZ-bar biceps curls', 2, 10, 12], ['Rope triceps pushdown', 2, 10, 15]]);
      const b = D('Lower 1', [['Leg press', 3, 8, 12], ['Seated leg curl', 3, 10, 15], ['Leg extension', 2, 10, 15], ['Standing calf raises', 3, 12, 15], ['Cable crunches', 3, 12, 15]]);
      const c = D('Upper 2', [['Incline machine chest press', 3, 8, 12], ['Wide or medium-grip lat pulldown', 3, 8, 12], ['Seated cable row', 3, 10, 12], ['Pec deck', 2, 12, 15], ['Machine lateral raises', 3, 12, 20], ['Reverse pec deck', 3, 12, 20], ['Hammer curls', 2, 10, 15], ['Overhead cable triceps extension', 2, 10, 15]]);
      const d = D('Lower 2', [['Hack squat', 3, 8, 12], ['Lying leg curl', 3, 10, 15], ['Hip thrust machine', 2, 10, 12], ['Bulgarian split squat', 2, 8, 12], ['Seated calf raises', 3, 12, 15], ['Hanging knee raises', 3, 10, 15]]);
      return { days: [a, b, c, d], schedule: { 1: a.id, 2: b.id, 4: c.id, 5: d.id } };
    },
  },
  {
    key: 'ppl6', name: 'Push, pull, legs, 6 days', source: '6 days a week', says: 'Each muscle twice a week with more total sets. Only worth it if sleep and recovery are solid.',
    make() {
      const push = n => D(`Push ${n}`, [[n === 1 ? 'Incline machine chest press' : 'Flat machine chest press', 3, 8, 12], [n === 1 ? 'Machine chest press' : 'Incline dumbbell press', 3, 8, 12], ['Machine shoulder press', 2, 8, 12], ['Cable lateral raises', 4, 12, 20], ['Rope pushdown', 3, 10, 15]]);
      const pull = n => D(`Pull ${n}`, [[n === 1 ? 'Lat pulldown' : 'Neutral-grip lat pulldown', 3, 8, 12], [n === 1 ? 'Chest-supported row' : 'Seated cable row', 3, 8, 12], ['Single-arm cable row', 2, 10, 12], ['Reverse pec deck', 3, 12, 20], ['Preacher curls', 3, 10, 12]]);
      const legs = n => D(`Legs ${n}`, [[n === 1 ? 'Leg press' : 'Hack squat', 3, 8, 12], [n === 1 ? 'Seated leg curl' : 'Lying leg curl', 3, 10, 15], ['Leg extension', 3, 10, 15], ['Standing calf raises', 3, 12, 15], ['Cable crunches', 3, 12, 15]]);
      const [a, b, c, d, e, f] = [push(1), pull(1), legs(1), push(2), pull(2), legs(2)];
      return { days: [a, b, c, d, e, f], schedule: { 1: a.id, 2: b.id, 3: c.id, 4: d.id, 5: e.id, 6: f.id } };
    },
  },
  {
    key: 'fb3', name: 'Full body, 3 days', source: '3 days a week', says: 'For busy weeks or travel. Every muscle three times a week in fewer sessions.',
    make() {
      const a = D('Full body A', [['Machine chest press', 3, 8, 12], ['Lat pulldown', 3, 8, 12], ['Leg press', 3, 8, 12], ['Cable lateral raises', 3, 12, 20], ['Seated leg curl', 2, 10, 15], ['Rope pushdown', 2, 10, 15]]);
      const b = D('Full body B', [['Incline dumbbell press', 3, 8, 12], ['Chest-supported row', 3, 8, 12], ['Hack squat', 3, 8, 12], ['Reverse pec deck', 3, 12, 20], ['Dumbbell curls', 2, 10, 15], ['Cable crunches', 3, 12, 15]]);
      const c = D('Full body C', [['Machine shoulder press', 3, 8, 12], ['Seated cable row', 3, 10, 12], ['Bulgarian split squat', 2, 8, 12], ['Pec deck', 2, 12, 15], ['Machine lateral raises', 3, 12, 20], ['Lying leg curl', 2, 10, 15], ['Standing calf raises', 3, 12, 15]]);
      return { days: [a, b, c], schedule: { 1: a.id, 3: b.id, 5: c.id } };
    },
  },
];
const makeProgram = key => { const p = PROGRAMS.find(x => x.key === key) || PROGRAMS[0]; return { key: p.key, name: p.name, ...p.make() }; };
