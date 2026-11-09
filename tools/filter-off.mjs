// Reads the Open Food Facts CSV export from stdin (gunzipped) and writes usable rows to stdout.
// Usage: curl -sL <export.csv.gz> | gunzip | node filter-off.mjs > off.tsv
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let cols = null, seen = 0, kept = 0;
const idx = {};
const WANT = ['code', 'product_name', 'brands', 'countries_en', 'unique_scans_n', 'energy-kcal_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'serving_size', 'serving_quantity', 'pnns_groups_2'];
// Vitamins and minerals printed on the label, as [app key, OFF columns summed (grams per 100 g), multiplier to the app's unit, highest believable value].
const MICRO_COLS = [
  ['fib', ['fiber_100g'], 1, 90], ['ca', ['calcium_100g'], 1000, 4000], ['fe', ['iron_100g'], 1000, 150], ['mg', ['magnesium_100g'], 1000, 1500],
  ['zn', ['zinc_100g'], 1000, 120], ['k', ['potassium_100g'], 1000, 15000], ['na', ['sodium_100g'], 1000, 40000], ['se', ['selenium_100g'], 1e6, 2000],
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
  const name = clean(row[idx.product_name]);
  if (!readable(name)) continue;
  const kcal = num(row[idx['energy-kcal_100g']]), p = num(row[idx.proteins_100g]), c = num(row[idx.carbohydrates_100g]), f = num(row[idx.fat_100g]);
  if (kcal == null || p == null || c == null || f == null) continue;
  if (kcal < 0 || kcal > 902 || p < 0 || c < 0 || f < 0 || p + c + f > 105) continue;
  // Label energy should roughly match the macros, which throws out most data-entry errors.
  const est = 4 * p + 4 * c + 9 * f;
  if (Math.abs(est - kcal) > Math.max(40, kcal * 0.35)) continue;
  const code = clean(row[idx.code]);
  const brand = clean((row[idx.brands] || '').split(',')[0]);
  const countries = (row[idx.countries_en] || '').toLowerCase();
  const scans = Math.round(num(row[idx.unique_scans_n]) || 0);
  const servingG = num(row[idx.serving_quantity]);
  const servingLabel = clean(row[idx.serving_size]).slice(0, 24);
  const india = countries.includes('india') ? 1 : 0;
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
  process.stdout.write([code, name, readable(brand) ? brand : '', kcal, p, c, f, servingG > 0 && servingG < 2000 ? servingG : '', servingLabel, scans, india, west, micros.join(','), group === 'unknown' ? '' : group].join('\t') + '\n');
  kept++;
}
console.error(`done: seen ${seen}, kept ${kept}`);
