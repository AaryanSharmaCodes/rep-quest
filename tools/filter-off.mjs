// Reads the Open Food Facts CSV export from stdin (gunzipped) and writes usable rows to stdout.
// Usage: curl -sL <export.csv.gz> | gunzip | node filter-off.mjs > off.tsv
// The export is untrusted text: it is only split and parsed here, never evaluated.
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let cols = null, seen = 0, kept = 0;
const idx = {};
const WANT = ['code', 'product_name', 'abbreviated_product_name', 'generic_name', 'brands', 'countries_en', 'unique_scans_n', 'energy-kcal_100g', 'energy-kj_100g', 'energy_100g',
  'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'fiber_100g', 'alcohol_100g', 'polyols_100g', 'serving_size', 'serving_quantity', 'pnns_groups_2', 'no_nutrition_data'];
// Vitamins and minerals printed on the label, as [app key, OFF columns summed (grams per 100 g), multiplier to the app's unit, highest believable value].
// The app's units: g for fibre and ALA, mg for EPA + DHA and the minerals and vitamins C, E, B1, B2, B3, B6, µg for selenium and vitamins A, D, K, B12 and folate.
const MICRO_COLS = [
  ['fib', ['fiber_100g'], 1, 90], ['ca', ['calcium_100g'], 1000, 4000], ['fe', ['iron_100g'], 1000, 150], ['mg', ['magnesium_100g'], 1000, 1500],
  ['zn', ['zinc_100g'], 1000, 120], ['k', ['potassium_100g'], 1000, 15000], ['na', ['sodium_100g'], 1000, 39400], ['se', ['selenium_100g'], 1e6, 2000],
  ['va', ['vitamin-a_100g'], 1e6, 30000], ['vc', ['vitamin-c_100g'], 1000, 5000], ['vd', ['vitamin-d_100g'], 1e6, 500], ['ve', ['vitamin-e_100g'], 1000, 1000],
  ['vk', ['vitamin-k_100g'], 1e6, 3000], ['b1', ['vitamin-b1_100g'], 1000, 100], ['b2', ['vitamin-b2_100g'], 1000, 100], ['b3', ['vitamin-pp_100g'], 1000, 500],
  ['b6', ['vitamin-b6_100g'], 1000, 100], ['b12', ['vitamin-b12_100g'], 1e6, 1000], ['fol', ['vitamin-b9_100g', 'folates_100g'], 1e6, 5000],
  ['o3', ['eicosapentaenoic-acid_100g', 'docosahexaenoic-acid_100g'], 1000, 60000], ['ala', ['alpha-linolenic-acid_100g'], 1, 60],
];
const microCols = [];
const clean = s => (s || '').replace(/\s+/g, ' ').trim();
const num = s => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
// Latin script only: search is typed on an English keyboard.
const readable = s => s.length >= 2 && s.length <= 70 && /^[\x20-\x7eÀ-ɏ]+$/.test(s) && /[a-zA-Z]{2}/.test(s);
// Names sometimes start with the barcode or are typed as a slug, and phone keyboards type curly quotes ("Lay’s").
const tidyName = s => clean(s.replace(/[’‘´`]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-').replace(/^\d{8,14}\s*[-:,]?\s*/, '').replace(/_/g, ' '));

// Brands sold in India that don't share their name with an unrelated foreign brand. A product of one of these
// counts as Indian even when nobody tagged the country. Global brands (Maggi, Lay's, Kellogg's) are caught by the 890 barcode instead.
const INDIAN_BRANDS = new RegExp('^(' + [
  'amul', 'mother dairy', 'haldiram', 'bikaji', 'bikanervala', 'bikano', 'mtr', 'britannia', 'parle', 'aashirvaad', 'ashirvaad', 'sunfeast',
  'yippee', 'itc', 'saffola', 'tata', 'uncle chipps', 'kurkure', 'paper boat', 'epigamia', 'milky mist', 'yoga ?bar', 'the whole truth',
  'muscle ?blaze', 'sleepy owl', 'id fresh', 'licious', 'too yumm', 'patanjali', 'chitale', 'dabur', 'frooti', 'maaza', 'thums up', 'limca', 'mdh',
  "ching'?s secret", 'gowardhan', 'nandini', 'aavin', 'milma', 'verka', 'gokul', 'priyagold', 'unibic', 'cremica', 'mrs\\.? bector', 'daawat', 'india gate',
  'sundrop', '24 mantra', 'organic india', 'happilo', 'farmley', 'slurrp farm', 'soulfull', 'bagrry', 'true elements', 'vadilal', 'havmor',
  'raw pressery', 'b natural', 'appy fizz', 'rasna', 'bisleri', 'hajmola', 'mapro', 'funfoods', 'veeba', 'wingreens', 'kitchens of india', 'prataap',
  'chheda', 'bournvita', 'horlicks', 'complan', 'nutrela', "mother'?s recipe", 'aachi', 'sakthi', 'eastern condiments', 'kwality wall', 'cream bell',
  'english oven', 'harvest gold', 'brooke bond', 'wagh bakri', 'society tea', 'girnar', 'pillsbury india', 'nestle india', 'cadbury india',
  'kissan', 'jabsons', 'open secret', 'cornitos', 'dmart', 'nature fresh', 'rajdhani', 'shakti bhog', 'pro nature', 'timios', 'kellogg.?s india',
  'max protein', 'ritebite', 'nutrabay', 'as-it-is', 'avvatar', 'big muscles', 'gritzo', 'snackible', 'dr\\.? oetker funfoods', 'heritage foods',
  'akshayakalpa', 'country delight',
].join('|') + ')\\b', 'i');

for await (const line of rl) {
  const row = line.split('\t');
  if (!cols) {
    cols = row;
    WANT.forEach(w => { idx[w] = cols.indexOf(w); if (idx[w] < 0) console.error('missing column', w); });
    MICRO_COLS.forEach(([key, names, mul, max]) => microCols.push([key, names.map(n => cols.indexOf(n)).filter(i => i >= 0), mul, max]));
    continue;
  }
  seen++;
  if (seen % 500000 === 0) console.error(`seen ${seen}, kept ${kept}`);
  const name = [row[idx.product_name], row[idx.abbreviated_product_name], row[idx.generic_name]].map(s => tidyName(s || '')).find(readable);
  if (!name) continue;
  const p = num(row[idx.proteins_100g]), c = num(row[idx.carbohydrates_100g]), f = num(row[idx.fat_100g]);
  if (p == null || c == null || f == null) continue;
  // Labels round, so syrups can show 104 g carbs; up to 105 g in all is accepted and the build clamps each to 100.
  if (p < 0 || c < 0 || f < 0 || p + c + f > 105) continue;
  // Energy: the label figure, checked against the macros. Some products have kJ typed in the kcal box (or the reverse),
  // so each reading is tried in turn and the first one that agrees with the macros wins. None agreeing means a data-entry error.
  const fib = Math.max(0, num(row[idx.fiber_100g]) || 0), alc = Math.max(0, num(row[idx.alcohol_100g]) || 0), polyols = Math.max(0, num(row[idx.polyols_100g]) || 0);
  // Alcohol is % by volume on labels, about 0.79 g per ml.
  const est = 4 * p + 4 * c + 9 * f + 7 * 0.79 * alc;
  // 20% (or 25 kcal) covers label rounding; beyond that one of the numbers is wrong and there's no telling which.
  const tol = Math.max(25, 0.2 * est);
  // Fibre may or may not be inside carbs (US vs EU labels) and counts about 2 kcal/g; polyols count about 2.4 kcal/g, not 4.
  const fits = k => k != null && k >= 0 && k <= 902 && k >= est - 2 * fib - 1.6 * polyols - tol && k <= est + 2 * fib + tol && !(k < 1 && est > 6);
  const kcalF = num(row[idx['energy-kcal_100g']]), kjF = num(row[idx['energy-kj_100g']]) ?? num(row[idx.energy_100g]);
  let kcal = null;
  for (const k of [kcalF, kjF == null ? null : kjF / 4.184, kcalF == null ? null : kcalF / 4.184, kjF]) if (fits(k)) { kcal = k; break; }
  if (kcal == null) continue;
  const code = clean(row[idx.code]);
  const brand = tidyName((row[idx.brands] || '').split(',')[0]);
  const countries = (row[idx.countries_en] || '').toLowerCase();
  const scans = Math.round(num(row[idx.unique_scans_n]) || 0);
  const servingG = num(row[idx.serving_quantity]);
  const servingLabel = clean(row[idx.serving_size]).slice(0, 24);
  // 1: tagged as sold in India. 2: Indian all the same (GS1 India 890 barcode, or an Indian brand) though nobody tagged the country.
  const india = countries.includes('india') ? 1 : /^890\d{10}$/.test(code) || INDIAN_BRANDS.test(brand) ? 2 : 0;
  const west = /united states|united kingdom|canada|australia|ireland|new zealand|united arab emirates|singapore/.test(countries) ? 1 : 0;
  // key=value pairs; 'fol' is either column, the omega-3 pair is summed.
  const micros = [];
  for (const [key, list, mul, max] of microCols) {
    const vals = list.map(i => num(row[i])).filter(x => x != null);
    if (!vals.length) continue;
    const value = (key === 'fol' ? vals[0] : vals.reduce((a, b) => a + b, 0)) * mul;
    if (value >= 0 && value <= max) micros.push(`${key}=${Math.round(value * 1000) / 1000}`);
  }
  const group = clean(row[idx.pnns_groups_2]);
  process.stdout.write([code, name, readable(brand) ? brand : '', Math.round(kcal * 10) / 10, p, c, f, servingG > 0 && servingG <= 1500 ? servingG : '', servingLabel, scans, india, west, micros.join(','), group === 'unknown' ? '' : group].join('\t') + '\n');
  kept++;
}
console.error(`done: seen ${seen}, kept ${kept}`);
