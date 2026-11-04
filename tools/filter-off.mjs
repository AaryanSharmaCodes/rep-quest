// Reads the Open Food Facts CSV export from stdin (gunzipped) and writes usable rows to stdout.
// Usage: curl -sL <export.csv.gz> | gunzip | node filter-off.mjs > off.tsv
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let cols = null, seen = 0, kept = 0;
const idx = {};
const WANT = ['code', 'product_name', 'brands', 'countries_en', 'unique_scans_n', 'energy-kcal_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'serving_size', 'serving_quantity'];
const clean = s => (s || '').replace(/\s+/g, ' ').trim();
const num = s => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
// Latin script only: search is typed on an English keyboard.
const readable = s => s.length >= 2 && s.length <= 70 && /^[\x20-\x7eÀ-ɏ]+$/.test(s) && /[a-zA-Z]{2}/.test(s);

for await (const line of rl) {
  const row = line.split('\t');
  if (!cols) {
    cols = row;
    WANT.forEach(w => { idx[w] = cols.indexOf(w); if (idx[w] < 0) console.error('missing column', w); });
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
  process.stdout.write([code, name, readable(brand) ? brand : '', kcal, p, c, f, servingG > 0 && servingG < 2000 ? servingG : '', servingLabel, scans, india, west].join('\t') + '\n');
  kept++;
}
console.error(`done: seen ${seen}, kept ${kept}`);
