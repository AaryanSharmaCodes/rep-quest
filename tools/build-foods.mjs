// Builds the bundled food database in foods/ from public datasets.
// Usage: node build-foods.mjs <usda-dir> <indb-csv> <off.tsv> <out-dir>
//   usda-dir: unzipped FoodData Central JSON (SR Legacy, Survey/FNDDS, Foundation)
//   indb-csv: INDB.xlsx converted to tab-separated text with a header row
//   off.tsv:  output of filter-off.mjs
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { CURATED, SYNONYMS } from './curated-foods.js';

const [usdaDir, indbPath, offPath, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const r1 = n => Math.round(n * 10) / 10;
const tidy = s => String(s).replace(/[\t\r\n|]/g, ' ').replace(/\s+/g, ' ').trim();
const row = (name, brand, kcal, p, c, f, servings, src, code = '') =>
  [tidy(name), tidy(brand), Math.round(kcal), r1(p), r1(c), r1(f), servings, src, code].join('\t');
const serving = (label, g) => `${tidy(label).replace(/:/g, ' ').slice(0, 28)}:${r1(g)}`;

const seen = new Set();
const key = (name, brand) => (name + '|' + brand).toLowerCase().replace(/[^a-z0-9|]/g, '');
const sane = (kcal, p, c, f) => {
  if (![kcal, p, c, f].every(Number.isFinite)) return false;
  if (kcal < 0 || kcal > 902 || p < 0 || c < 0 || f < 0 || p + c + f > 105) return false;
  return Math.abs(4 * p + 4 * c + 9 * f - kcal) <= Math.max(45, kcal * 0.4);
};

const core = [];
const pushCore = (name, brand, kcal, p, c, f, servings, src) => {
  const k = key(name, brand);
  if (seen.has(k)) return;
  seen.add(k);
  core.push(row(name, brand, kcal, p, c, f, servings, src));
};

// Curated everyday foods.
CURATED.forEach(([name, kcal, p, c, f, g, label]) => pushCore(name, '', kcal, p, c, f, serving(label, g), 'c'));
const curatedCount = core.length;

// Indian Nutrient Databank recipes.
{
  const lines = fs.readFileSync(indbPath, 'utf8').split('\n').filter(Boolean);
  const head = lines[0].split('\t');
  const col = n => head.indexOf(n);
  for (const line of lines.slice(1)) {
    const v = line.split('\t');
    const num = n => parseFloat(v[col(n)]);
    const kcal = num('energy_kcal'), p = num('protein_g'), c = num('carb_g'), f = num('fat_g');
    if (!sane(kcal, p, c, f)) continue;
    // Recipes for deep-fried dishes count all the frying oil as eaten, giving impossible values like 668 kcal for dahi vada.
    const naturallyFatty = /ghee|butter|oil|nut|almond|cashew|peanut|chikki|coconut|seed|pickle|mayonnaise|chocolate|halwa|ladoo|laddu|burfi|barfi|mathri|murukku|chips|dressing|sauce/i;
    if (kcal >= 450 && f * 9 / kcal > 0.55 && !naturallyFatty.test(v[col('food_name')])) continue;
    const unitKcal = num('unit_serving_energy_kcal'), unit = tidy(v[col('servings_unit')] || '');
    const g = unit && unitKcal > 0 && kcal > 0 ? unitKcal / kcal * 100 : 0;
    const servings = g >= 10 && g <= 700 ? serving(`1 ${unit}`, g) : '';
    pushCore(v[col('food_name')], '', kcal, p, c, f, servings, 'i');
  }
}
const indbCount = core.length - curatedCount;

// USDA FoodData Central.
const nutrient = (food, numbers) => {
  for (const number of numbers) {
    const hit = food.foodNutrients.find(n => n.nutrient?.number === number && n.amount != null);
    if (hit) return hit.amount;
  }
  return NaN;
};
const portions = food => (food.foodPortions || [])
  .filter(x => x.gramWeight > 0 && x.gramWeight <= 1500)
  .map(x => {
    const desc = x.portionDescription && x.portionDescription !== 'Quantity not specified' ? x.portionDescription
      : x.modifier && !/^\d+$/.test(x.modifier) ? `${x.amount || 1} ${x.modifier}`
      : x.measureUnit?.name && x.measureUnit.name !== 'undetermined' ? `${x.amount || 1} ${x.measureUnit.name}` : '';
    return desc ? serving(desc.replace(/^1\.0 /, '1 '), x.gramWeight) : null;
  })
  .filter(Boolean).slice(0, 3).join('|');

const usdaCounts = {};
for (const [file, listKey, src] of [
  ['surveyDownload.json', 'SurveyFoods', 's'],
  ['FoodData_Central_foundation_food_json_2026-10-29.json', 'FoundationFoods', 'f'],
  ['FoodData_Central_sr_legacy_food_json_2018-04.json', 'SRLegacyFoods', 'l'],
]) {
  const list = JSON.parse(fs.readFileSync(path.join(usdaDir, file), 'utf8'))[listKey];
  const before = core.length;
  for (const food of list) {
    const cat = food.foodCategory?.description || '';
    if (/Alaska Native|Baby Foods/i.test(cat) || /^Baby |infant formula/i.test(food.description)) continue;
    const kcal = nutrient(food, ['208', '957', '958']), p = nutrient(food, ['203']), c = nutrient(food, ['205', '205.2']), f = nutrient(food, ['204', '298']);
    if (!sane(kcal, p, c, f)) continue;
    pushCore(food.description, '', kcal, p, c, f, portions(food), src);
  }
  usdaCounts[src] = core.length - before;
}
fs.writeFileSync(path.join(outDir, 'core.txt'), core.join('\n') + '\n');

// Open Food Facts packaged foods: every Indian product, then the most scanned products worldwide.
const titleCase = s => (s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : s);
const MIN_SCANS_WORLD = Number(process.env.MIN_SCANS_WORLD || 3);
const MIN_SCANS_WEST = Number(process.env.MIN_SCANS_WEST || 1);
const india = [], world = [];
for await (const line of readline.createInterface({ input: fs.createReadStream(offPath), crlfDelay: Infinity })) {
  const [code, rawName, rawBrand, kcal, p, c, f, servingG, servingLabel, scans, isIndia, isWest] = line.split('\t');
  const n = Number(scans);
  if (isIndia !== '1' && n < MIN_SCANS_WORLD && !(isWest === '1' && n >= MIN_SCANS_WEST)) continue;
  const name = titleCase(rawName), brand = titleCase(rawBrand);
  const k = key(name, brand);
  if (seen.has(k)) continue;
  seen.add(k);
  const s = Number(servingG) > 0 ? serving(servingLabel || `${servingG} g`, Number(servingG)) : '';
  const text = row(name, brand, Number(kcal), Number(p), Number(c), Number(f), s, 'o', isIndia === '1' && /^\d{8,14}$/.test(code) ? code : '');
  (isIndia === '1' ? india : world).push([n, text]);
}
const sorted = a => a.sort((x, y) => y[0] - x[0]).map(x => x[1]);
fs.writeFileSync(path.join(outDir, 'india.txt'), sorted(india).join('\n') + '\n');

// Split the world list so a phone can load it piece by piece, most-scanned first.
const worldRows = sorted(world);
const PART = 60000;
const parts = [];
for (let i = 0; i < worldRows.length; i += PART) {
  const name = `world-${parts.length + 1}.txt`;
  fs.writeFileSync(path.join(outDir, name), worldRows.slice(i, i + PART).join('\n') + '\n');
  parts.push(name);
}

const meta = {
  built: new Date().toISOString().slice(0, 10),
  files: ['core.txt', 'india.txt', ...parts],
  counts: { curated: curatedCount, indb: indbCount, usdaSurvey: usdaCounts.s, usdaFoundation: usdaCounts.f, usdaLegacy: usdaCounts.l, offIndia: india.length, offWorld: world.length },
  total: core.length + india.length + world.length,
};
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 1));
fs.writeFileSync(path.join(outDir, 'synonyms.json'), JSON.stringify(SYNONYMS));
console.log(meta);
