// Builds the bundled food database in foods/ from public datasets, with calories, macros and micronutrients.
// Usage: node build-foods.mjs <usda-dir> <indb-tsv> <ifct-csv> <off.tsv> <out-dir>
//   usda-dir: unzipped FoodData Central JSON (SR Legacy, Survey/FNDDS, Foundation)
//   indb-tsv: INDB.xlsx converted to tab-separated text with a header row
//   ifct-csv: compositions/index.csv from the ifct2017 npm package (Indian Food Composition Tables 2017, NIN)
//   off.tsv:  output of filter-off.mjs
//
// Each row: name, brand, kcal, protein, carbs, fat (per 100 g), servings, source, barcode, micros.
// Micros are letter + number pairs per 100 g in the order of MICROS (a = fibre ... u = ALA), then "#n", the food's group.
// A missing letter means the source doesn't list it; the app then estimates it from the group's typical values
// per calorie (meta.json microGroups, medians of USDA foods in that group) and says it's an estimate.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { CURATED, SYNONYMS } from './curated-foods.js';
import { CURATED_MICROS } from './curated-micros.js';

const [usdaDir, indbPath, ifctPath, offPath, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

// [key, USDA nutrient numbers (first found wins; '+' sums; '/n' divides), INDB columns summed]
const MICROS = [
  ['fib', ['291'], ['fibre_g']],
  ['ca', ['301'], ['calcium_mg']],
  ['fe', ['303'], ['iron_mg']],
  ['mg', ['304'], ['magnesium_mg']],
  ['zn', ['309'], ['zinc_mg']],
  ['k', ['306'], ['potassium_mg']],
  ['na', ['307'], ['sodium_mg']],
  ['se', ['317'], ['selenium_ug']],
  ['va', ['320'], ['vita_ug']],
  ['vc', ['401'], ['vitc_mg']],
  ['vd', ['328', '324/40'], ['vitd2_ug', 'vitd3_ug']],
  ['ve', ['323'], ['vite_mg']],
  ['vk', ['430'], ['vitk1_ug', 'vitk2_ug']],
  ['b1', ['404'], ['vitb1_mg']],
  ['b2', ['405'], ['vitb2_mg']],
  ['b3', ['406'], ['vitb3_mg']],
  ['b6', ['415'], ['vitb6_mg']],
  ['b12', ['418'], []],
  ['fol', ['435', '417'], ['folate_ug']],
  ['o3', ['629+621*1000'], []], // EPA + DHA, g -> mg
  ['ala', ['851', '619'], []],
];
const KEYS = MICROS.map(m => m[0]);
const LETTER = 'abcdefghijklmnopqrstu';
const VD = KEYS.indexOf('vd');

// Groups used to estimate what a source leaves out.
const GROUPS = ['milk', 'cheese', 'eggs', 'poultry', 'fish', 'redmeat', 'processed', 'legumes', 'nuts', 'fats', 'bread', 'sweetbake', 'grains', 'cereal', 'sweets', 'chocolate', 'snacks', 'fruit', 'juice', 'veg', 'beverages', 'plantmilk', 'alcohol', 'sauces', 'fastfood', 'mixed'];
const ANIMAL = new Set(['milk', 'cheese', 'eggs', 'poultry', 'fish', 'redmeat', 'processed']);
const PNNS = {
  'Milk and yogurt': 'milk', 'Dairy desserts': 'milk', 'Ice cream': 'milk', Cheese: 'cheese', Eggs: 'eggs', Meat: 'redmeat', Offals: 'redmeat',
  'Processed meat': 'processed', 'Fish and seafood': 'fish', 'Fish & Seafood': 'fish', Legumes: 'legumes', Nuts: 'nuts', Fats: 'fats',
  'Dressings and sauces': 'sauces', Soups: 'sauces', Bread: 'bread', 'Biscuits and cakes': 'sweetbake', Pastries: 'sweetbake',
  'Breakfast cereals': 'cereal', Cereals: 'grains', Potatoes: 'veg', Vegetables: 'veg', Fruits: 'fruit', 'Dried fruits': 'fruit',
  'Fruit juices': 'juice', 'Fruit nectars': 'juice', Sweets: 'sweets', 'Chocolate products': 'chocolate', 'Salty and fatty products': 'snacks',
  Appetizers: 'snacks', Sandwiches: 'fastfood', 'Pizza pies and quiche': 'fastfood', 'One-dish meals': 'mixed', 'Sweetened beverages': 'beverages',
  'Artificially sweetened beverages': 'beverages', 'Unsweetened beverages': 'beverages', 'Teas and herbal teas and coffees': 'beverages',
  'Waters and flavored waters': 'beverages', 'Plant-based milk substitutes': 'plantmilk', 'Alcoholic beverages': 'alcohol',
};
const SR_CATEGORY = {
  'Poultry Products': 'poultry', 'Finfish and Shellfish Products': 'fish', 'Beef Products': 'redmeat', 'Pork Products': 'redmeat',
  'Lamb, Veal, and Game Products': 'redmeat', 'Sausages and Luncheon Meats': 'processed', 'Legumes and Legume Products': 'legumes',
  'Nut and Seed Products': 'nuts', 'Fats and Oils': 'fats', 'Cereal Grains and Pasta': 'grains', 'Breakfast Cereals': 'cereal', Snacks: 'snacks',
  'Vegetables and Vegetable Products': 'veg', 'Soups, Sauces, and Gravies': 'sauces', 'Spices and Herbs': 'sauces', 'Fast Foods': 'fastfood',
  'Restaurant Foods': 'fastfood', 'Meals, Entrees, and Side Dishes': 'mixed',
};
// Checked in order; the first match wins. English and common Hindi words.
const KEYWORDS = [
  ['veg', /\b(sweet potato|sweet corn|sweetcorn)\b/],
  ['nuts', /\b(peanut|almond|cashew) butter\b/],
  ['bread', /\b(roti|chapati|paratha|naan)\b/],
  ['plantmilk', /\b(soy ?milk|almond (milk|drink)|oat (milk|drink)|rice (milk|drink)|coconut milk)\b/],
  ['alcohol', /\b(beer|wine|whisk(e)?y|vodka|rum|gin|alcoholic)\b/],
  ['cheese', /\b(paneer|cheese|cheddar|mozzarella)\b/],
  ['chocolate', /\b(chocolate|cocoa|nutella)\b/],
  ['juice', /\b(juice|nectar)\b/],
  ['milk', /\b(milk|curd|dahi|yog(h)?urt|lassi|chaas|buttermilk|raita|kheer|ice cream|shrikhand|khoa|khoya|kulfi|custard)\b/],
  ['eggs', /\b(egg|eggs|anda|omelet(te)?|bhurji)\b/],
  ['processed', /\b(sausage|salami|ham|bacon|pepperoni|hot dog|frankfurter|luncheon)\b/],
  ['fish', /\b(fish|machli|prawn|shrimp|salmon|tuna|rohu|sardine|mackerel|crab|seafood|surimi)\b/],
  ['poultry', /\b(chicken|murgh|turkey|duck)\b/],
  ['redmeat', /\b(mutton|lamb|goat|keema|beef|pork|veal)\b/],
  ['fats', /\b(ghee|butter|oil|margarine|mayonnaise|lard)\b/],
  ['legumes', /\b(dal|daal|lentils?|rajma|chana|chole|chickpeas?|beans?|soya|soy|tofu|moong|mung|urad|masoor|toor|arhar|sprouts|hummus|besan)\b/],
  ['nuts', /\b(almonds?|cashews?|peanuts?|walnuts?|pistachios?|nuts?|seeds?|makhana|chikki)\b/],
  ['cereal', /\b(cereal|corn ?flakes|muesli|granola|chocos|flakes)\b/],
  ['sweetbake', /\b(biscuits?|cookies?|cakes?|muffins?|brownies?|pastr(y|ies)|croissants?|doughnuts?|donuts?|rusk|wafers?)\b/],
  ['bread', /\b(bread|bun|pav|naan|roti|chapati|paratha|parantha|kulcha|puri|poori|bhatura|tortilla|bagel|wrap|pita)\b/],
  ['sweets', /\b(sweet|candy|toffee|jalebi|ladd?oo|halwa|barfi|burfi|jamun|rasgulla|mithai|sugar|jaggery|gur|honey|jam|syrup|gummy|dessert)\b/],
  ['snacks', /\b(chips|crisps|namkeen|bhujia|mixture|popcorn|nachos|puffs|sev|mathri|khakhra|snack)\b/],
  ['fastfood', /\b(pizza|burger|sandwich|fries|hot dog|nuggets|subway|mcdonald|kfc)\b/],
  ['grains', /\b(rice|chawal|oats|pasta|noodles?|maggi|poha|upma|idli|dosa|wheat|atta|flour|millet|bajra|jowar|ragi|quinoa|semolina|suji|rava|vermicelli|couscous)\b/],
  ['fruit', /\b(fruit|apple|banana|mango|orange|grapes?|guava|papaya|dates|pomegranate|berr(y|ies)|melon|pineapple|raisins?|figs?)\b/],
  ['beverages', /\b(tea|chai|coffee|cola|soda|drink|beverage|water|energy)\b/],
  ['sauces', /\b(soup|sauce|ketchup|chutney|pickle|achaar|gravy|dressing|masala powder|spice)\b/],
  ['veg', /\b(potato|aloo|vegetables?|veg|sabzi|palak|spinach|gobi|cauliflower|bhindi|okra|tomato|onion|salad|mushroom|lauki|baingan|brinjal|carrot|peas|matar|cabbage|beans)\b/],
  ['mixed', /\b(biryani|curry|masala|pulao|khichdi|thali|meal|bowl|dish|korma|tikka)\b/],
];
const groupFor = (name, hint) => {
  const n = name.toLowerCase();
  let g = null;
  if (hint === 'Dairy and Egg Products') g = /\bcheese\b/.test(n) ? 'cheese' : /\begg/.test(n) ? 'eggs' : 'milk';
  if (!g && hint === 'Baked Products') g = /\b(bread|rolls?|bagels?|tortillas?|pita|naan)\b/.test(n) ? 'bread' : 'sweetbake';
  if (!g && hint === 'Sweets' && /^candies|chocolate/.test(n)) g = /chocolate/.test(n) ? 'chocolate' : 'sweets';
  if (!g && hint === 'Fruits and Fruit Juices') g = /juice|nectar/.test(n) ? 'juice' : 'fruit';
  if (!g && hint === 'Beverages') g = /alcoholic/.test(n) ? 'alcohol' : /\b(soy|almond|oat|rice) (milk|beverage|drink)/.test(n) ? 'plantmilk' : 'beverages';
  if (!g) g = PNNS[hint] || SR_CATEGORY[hint];
  if (!g) g = KEYWORDS.find(([, re]) => re.test(n))?.[0] || 'mixed';
  return g;
};

const r1 = n => Math.round(n * 10) / 10;
const tidy = s => String(s).replace(/[\t\r\n|]/g, ' ').replace(/\s+/g, ' ').trim();
const sig = x => Math.abs(x) >= 100 ? Math.round(x) : Math.abs(x) >= 1 ? Math.round(x * 10) / 10 : Math.round(x * 1000) / 1000;
// Plant foods in IFCT and INDB list vitamin D2 values far above anything else measured (13 µg in wheat flour), so plants count as none.
const encode = (values, group, name) => {
  const v = values.slice();
  if (!ANIMAL.has(group) && !/mushroom/i.test(name) && v[VD] != null) v[VD] = 0;
  return v.map((x, i) => x == null || !Number.isFinite(x) || x < 0 ? '' : LETTER[i] + sig(x)).join('') + '#' + GROUPS.indexOf(group);
};
const row = (name, brand, kcal, p, c, f, servings, src, code, micros) =>
  [tidy(name), tidy(brand), Math.round(kcal), r1(p), r1(c), r1(f), servings, src, code, micros].join('\t');
const serving = (label, g) => `${tidy(label).replace(/:/g, ' ').slice(0, 28)}:${r1(g)}`;

const seen = new Set();
const key = (name, brand) => (name + '|' + brand).toLowerCase().replace(/[^a-z0-9|]/g, '');
const sane = (kcal, p, c, f) => {
  if (![kcal, p, c, f].every(Number.isFinite)) return false;
  if (kcal < 0 || kcal > 902 || p < 0 || c < 0 || f < 0 || p + c + f > 105) return false;
  return Math.abs(4 * p + 4 * c + 9 * f - kcal) <= Math.max(45, kcal * 0.4);
};

// Every source's micronutrients, so hand-written foods can borrow from a match.
const vectors = {};
const putVector = (src, name, values) => { (vectors[src] ||= {})[tidy(name).toLowerCase()] ||= values; };

/* Read the sources */
const usdaValue = (food, specs) => {
  for (const spec of specs) {
    const [body, mul] = spec.split('*');
    const [nums, div] = body.split('/');
    const parts = nums.split('+').map(n => food.foodNutrients.find(x => x.nutrient?.number === n && x.amount != null)?.amount);
    if (parts.every(p => p == null)) continue;
    return parts.reduce((s, p) => s + (p || 0), 0) / (div ? Number(div) : 1) * (mul ? Number(mul) : 1);
  }
  return null;
};
const usdaFiles = [
  ['surveyDownload.json', 'SurveyFoods', 's'],
  ['FoodData_Central_foundation_food_json_2026-10-29.json', 'FoundationFoods', 'f'],
  ['FoodData_Central_sr_legacy_food_json_2018-04.json', 'SRLegacyFoods', 'l'],
].map(([file, listKey, src]) => {
  const list = JSON.parse(fs.readFileSync(path.join(usdaDir, file), 'utf8'))[listKey];
  const foods = list.map(food => {
    const values = MICROS.map(([, nums]) => usdaValue(food, nums));
    putVector(src, food.description, values);
    return { food, values, hint: food.foodCategory?.description || '' };
  });
  return { src, foods };
});

const indbRows = (() => {
  const lines = fs.readFileSync(indbPath, 'utf8').split('\n').filter(Boolean);
  const head = lines[0].split('\t');
  return lines.slice(1).map(line => {
    const v = line.split('\t');
    const cell = n => { const x = parseFloat(v[head.indexOf(n)]); return Number.isFinite(x) ? x : null; };
    const text = n => v[head.indexOf(n)] || '';
    const values = MICROS.map(([, , cols]) => {
      if (!cols.length) return null;
      const xs = cols.map(cell);
      return xs.every(x => x == null) ? null : xs.reduce((s, x) => s + (x || 0), 0);
    });
    putVector('i', text('food_name'), values);
    return { cell, text, values };
  });
})();

const ifctRows = (() => {
  const raw = fs.readFileSync(ifctPath, 'utf8');
  const rows = []; let r = [], cell = '', q = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (q) { if (ch === '"' && raw[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { r.push(cell); cell = ''; } else if (ch === '\n') { r.push(cell); rows.push(r); r = []; cell = ''; } else if (ch !== '\r') cell += ch;
  }
  const head = rows[0];
  // IFCT stores every nutrient in grams per 100 g and energy in kJ.
  return rows.slice(1).filter(x => x.length > 5).map(x => {
    const o = Object.fromEntries(head.map((h, i) => [h, x[i]]));
    const g = k => { const n = parseFloat(o[k]); return Number.isFinite(n) ? n : null; };
    const sum = (ks, mul) => { const xs = ks.map(g); return xs.every(n => n == null) ? null : xs.reduce((s, n) => s + (n || 0), 0) * mul; };
    const values = {
      fib: sum(['fibtg'], 1), ca: sum(['ca'], 1e3), fe: sum(['fe'], 1e3), mg: sum(['mg'], 1e3), zn: sum(['zn'], 1e3), k: sum(['k'], 1e3), na: sum(['na'], 1e3),
      se: sum(['se'], 1e6), vc: sum(['vitc'], 1e3), vd: sum(['ergcal', 'chocal'], 1e6), ve: sum(['vite'], 1e3), vk: sum(['vitk1', 'vitk2'], 1e6),
      b1: sum(['thia'], 1e3), b2: sum(['ribf'], 1e3), b3: sum(['nia'], 1e3), b6: sum(['vitb6c'], 1e3), b12: null, fol: sum(['folsum'], 1e6),
      o3: sum(['f20d5n3', 'f22d6n3'], 1e3), ala: sum(['f18d3n3'], 1),
      // Retinol activity equivalents, so plant foods aren't counted at full carotene.
      va: g('retol') == null && g('cartb') == null ? null : ((g('retol') || 0) + (g('cartb') || 0) / 12 + ((g('carta') || 0) + (g('crypxb') || 0)) / 24) * 1e6,
    };
    const vec = KEYS.map(k => values[k]);
    putVector('n', o.name, vec);
    return { name: o.name, group: o.grup, kcal: g('enerc') / 4.184, p: g('protcnt'), c: g('choavldf'), f: g('fatce'), values: vec };
  });
})();

/* Typical values per calorie for each group: the median of USDA SR Legacy and Foundation foods. */
const microGroups = (() => {
  const per = Object.fromEntries(GROUPS.map(g => [g, KEYS.map(() => [])]));
  for (const { src, foods } of usdaFiles) {
    if (src === 's') continue;
    for (const { food, values, hint } of foods) {
      const kcal = usdaValue(food, ['208', '957', '958']);
      if (!(kcal >= 10)) continue;
      const g = groupFor(food.description, hint);
      values.forEach((x, i) => { if (x != null) per[g][i].push(x / kcal); });
    }
  }
  const median = a => { if (a.length < 5) return null; const s = a.sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  return GROUPS.map(g => ({ name: g, n: per[g][0].length, perKcal: per[g].map(a => { const m = median(a); return m == null ? 0 : Number(m.toPrecision(3)); }) }));
})();

/* Build */
const core = [];
const pushCore = (name, brand, kcal, p, c, f, servings, src, micros) => {
  const k = key(name, brand);
  if (seen.has(k)) return;
  seen.add(k);
  core.push(row(name, brand, kcal, p, c, f, servings, src, '', micros));
};

// Curated everyday foods; vitamins and minerals come from a close match in INDB or USDA (curated-micros.js).
let curatedMatched = 0;
CURATED.forEach(([name, kcal, p, c, f, g, label]) => {
  const ref = CURATED_MICROS[name];
  let values = KEYS.map(() => null);
  if (ref) {
    const [rsrc, ...rest] = ref.split(':');
    const hit = vectors[rsrc]?.[rest.join(':').toLowerCase()];
    if (!hit) throw new Error(`curated-micros: no match for ${name} -> ${ref}`);
    values = hit;
    curatedMatched++;
  }
  pushCore(name, '', kcal, p, c, f, serving(label, g), 'c', encode(values, groupFor(name), name));
});
const curatedCount = core.length;

// Indian Nutrient Databank recipes.
for (const { cell, text, values } of indbRows) {
  const kcal = cell('energy_kcal'), p = cell('protein_g'), c = cell('carb_g'), f = cell('fat_g');
  if (!sane(kcal, p, c, f)) continue;
  const name = text('food_name');
  // Recipes for deep-fried dishes count all the frying oil as eaten, giving impossible values like 668 kcal for dahi vada.
  const naturallyFatty = /ghee|butter|oil|nut|almond|cashew|peanut|chikki|coconut|seed|pickle|mayonnaise|chocolate|halwa|ladoo|laddu|burfi|barfi|mathri|murukku|chips|dressing|sauce/i;
  if (kcal >= 450 && f * 9 / kcal > 0.55 && !naturallyFatty.test(name)) continue;
  const unitKcal = cell('unit_serving_energy_kcal'), unit = tidy(text('servings_unit'));
  const g = unit && unitKcal > 0 && kcal > 0 ? unitKcal / kcal * 100 : 0;
  const servings = g >= 10 && g <= 700 ? serving(`1 ${unit}`, g) : '';
  pushCore(name, '', kcal, p, c, f, servings, 'i', encode(values, groupFor(name), name));
}
const indbCount = core.length - curatedCount;

// Indian Food Composition Tables 2017: raw ingredients with lab-measured nutrients.
const IFCT_GROUP = {
  'Milk and Milk Products': 'milk', 'Egg and Egg Products': 'eggs', Poultry: 'poultry', 'Animal Meat': 'redmeat', 'Marine Fish': 'fish',
  'Marine Shellfish': 'fish', 'Marine Mollusks': 'fish', 'Fresh Water Fish and Shellfish': 'fish', 'Grain Legumes': 'legumes',
  'Nuts and Oil Seeds': 'nuts', 'Cereals and Millets': 'grains', Fruits: 'fruit', 'Green Leafy Vegetables': 'veg', 'Other Vegetables': 'veg',
  'Roots and Tubers': 'veg', Mushrooms: 'veg', 'Condiments and Spices': 'sauces', Sugars: 'sweets', 'Edible Oils and Fats': 'fats',
};
const ifctBefore = core.length;
for (const r of ifctRows) {
  if (!sane(r.kcal, r.p, r.c, r.f)) continue;
  const group = IFCT_GROUP[r.group] || groupFor(r.name);
  pushCore(r.name, '', r.kcal, r.p, r.c, r.f, '', 'n', encode(r.values, group, r.name));
}
const ifctCount = core.length - ifctBefore;

// USDA FoodData Central.
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
for (const { src, foods } of usdaFiles) {
  const before = core.length;
  for (const { food, values, hint } of foods) {
    const cat = food.foodCategory?.description || '';
    if (/Alaska Native|Baby Foods/i.test(cat) || /^Baby |infant formula/i.test(food.description)) continue;
    const kcal = usdaValue(food, ['208', '957', '958']), p = usdaValue(food, ['203']), c = usdaValue(food, ['205', '205.2']), f = usdaValue(food, ['204', '298']);
    if (!sane(kcal, p, c, f)) continue;
    pushCore(food.description, '', kcal, p, c, f, portions(food), src, encode(values, groupFor(food.description, hint), food.description));
  }
  usdaCounts[src] = core.length - before;
}
fs.writeFileSync(path.join(outDir, 'core.txt'), core.join('\n') + '\n');

// Open Food Facts packaged foods: every Indian product, then the most scanned products worldwide.
const titleCase = s => (s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : s);
const MIN_SCANS_WORLD = Number(process.env.MIN_SCANS_WORLD || 3);
const MIN_SCANS_WEST = Number(process.env.MIN_SCANS_WEST || 1);
const india = [], world = [];
let offWithLabelMicros = 0;
for await (const line of readline.createInterface({ input: fs.createReadStream(offPath), crlfDelay: Infinity })) {
  const [code, rawName, rawBrand, kcal, p, c, f, servingG, servingLabel, scans, isIndia, isWest, micros = '', pnns = ''] = line.split('\t');
  const n = Number(scans);
  if (isIndia !== '1' && n < MIN_SCANS_WORLD && !(isWest === '1' && n >= MIN_SCANS_WEST)) continue;
  const name = titleCase(rawName), brand = titleCase(rawBrand);
  const k = key(name, brand);
  if (seen.has(k)) continue;
  seen.add(k);
  const label = Object.fromEntries(micros.split(',').filter(Boolean).map(kv => { const [mk, mv] = kv.split('='); return [mk, Number(mv)]; }));
  // Labels often print only sodium; a printed 0 for fibre or a vitamin is kept as 0.
  const values = KEYS.map(mk => label[mk] ?? null);
  if (values.some((x, i) => x != null && KEYS[i] !== 'na')) offWithLabelMicros++;
  const s = Number(servingG) > 0 ? serving(servingLabel || `${servingG} g`, Number(servingG)) : '';
  const text = row(name, brand, Number(kcal), Number(p), Number(c), Number(f), s, 'o', isIndia === '1' && /^\d{8,14}$/.test(code) ? code : '', encode(values, groupFor(name, pnns), name));
  (isIndia === '1' ? india : world).push([n, text]);
}
const sorted = a => a.sort((x, y) => y[0] - x[0]).map(x => x[1]);
fs.writeFileSync(path.join(outDir, 'india.txt'), sorted(india).join('\n') + '\n');

// Split the world list so a phone can load it piece by piece, most-scanned first.
const worldRows = sorted(world);
const PART = 60000;
const parts = [];
for (const old of fs.readdirSync(outDir)) if (/^world-\d+\.txt$/.test(old)) fs.unlinkSync(path.join(outDir, old));
for (let i = 0; i < worldRows.length; i += PART) {
  const name = `world-${parts.length + 1}.txt`;
  fs.writeFileSync(path.join(outDir, name), worldRows.slice(i, i + PART).join('\n') + '\n');
  parts.push(name);
}

const meta = {
  built: new Date().toISOString().slice(0, 10),
  files: ['core.txt', 'india.txt', ...parts],
  counts: { curated: curatedCount, indb: indbCount, ifct: ifctCount, usdaSurvey: usdaCounts.s, usdaFoundation: usdaCounts.f, usdaLegacy: usdaCounts.l, offIndia: india.length, offWorld: world.length },
  total: core.length + india.length + world.length,
  microKeys: KEYS,
  microGroups,
};
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 1));
fs.writeFileSync(path.join(outDir, 'synonyms.json'), JSON.stringify(SYNONYMS));
console.log({ ...meta, microGroups: microGroups.map(g => `${g.name}:${g.n}`).join(' '), curatedMatched, offWithLabelMicros });
