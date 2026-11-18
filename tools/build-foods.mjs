// Builds the bundled food database in foods/ from public datasets, with calories, macros and micronutrients.
// Usage: node build-foods.mjs <usda-dir> <indb-tsv> <ifct-csv> <off.tsv> <out-dir>
//   usda-dir: unzipped FoodData Central JSON (SR Legacy, Survey/FNDDS, Foundation)
//   indb-tsv: INDB.xlsx converted to tab-separated text with a header row
//   ifct-csv: compositions/index.csv from the ifct2017 npm package (Indian Food Composition Tables 2017, NIN)
//   off.tsv:  output of filter-off.mjs
// Writes core.txt (curated, INDB, IFCT, USDA), india.txt (Open Food Facts products tagged India), india-brands*.txt
// (other Indian products: 890 barcodes, Indian brands), world-N.txt, meta.json and synonyms.json. tools/food-data-log.md lists the data fixes.
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
// Servings under 1 g are label typos ("0.04 g") and would show as 0 g, so they're left out.
const serving = (label, g) => (r1(g) >= 1 ? `${tidy(label).replace(/:/g, ' ').slice(0, 28)}:${r1(g)}` : null);

const seen = new Set();
const key = (name, brand) => (name + '|' + brand).toLowerCase().replace(/[^a-z0-9|]/g, '');
const sane = (kcal, p, c, f) => {
  if (![kcal, p, c, f].every(Number.isFinite)) return false;
  if (kcal < 0 || kcal > 902 || p < 0 || c < 0 || f < 0 || p + c + f > 105) return false;
  return Math.abs(4 * p + 4 * c + 9 * f - kcal) <= Math.max(45, kcal * 0.4);
};

// Every source's micronutrients (and protein, to scale them), so hand-written foods can borrow from a match.
const vectors = {};
const putVector = (src, name, values, protein) => { (vectors[src] ||= {})[tidy(name).toLowerCase()] ||= { values, protein }; };

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
    putVector(src, food.description, values, usdaValue(food, ['203']));
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
    putVector('i', text('food_name'), values, cell('protein_g'));
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
  const objs = rows.slice(1).filter(x => x.length > 5).map(x => Object.fromEntries(head.map((h, i) => [h, x[i]])));
  // The ifct2017 package writes 0 where a nutrient wasn't analysed, so a column that is 0 for every food in a group
  // (folate in all meat and fish, retinol in milk, everything in oils) means "not measured", not "none".
  // These all-zero columns really are zero in those foods, so they stay: no D3, K2, EPA/DHA or retinol in plants; no fibre or carotene in meat.
  const PLANT = /Cereals|Legumes|Vegetables|Fruits|Roots|Condiments|Nuts|Sugars|Mushrooms|Miscellaneous/;
  const TRUE_ZERO = grp => PLANT.test(grp) ? ['chocal', 'vitk2', 'f20d5n3', 'f22d6n3', 'retol', 'carta', 'crypxb', 'cartb'] : ['fibtg', 'ergcal', 'cartb', 'carta', 'crypxb', 'vitc'];
  const unmeasured = {};
  for (const grp of new Set(objs.map(o => o.grup))) {
    const list = objs.filter(o => o.grup === grp);
    unmeasured[grp] = new Set(head.filter(h => !TRUE_ZERO(grp).includes(h) && list.every(o => !(parseFloat(o[h]) > 0))));
  }
  // Fish B6 is printed in mg where every other IFCT value is in g (1000x too high: 194 mg in a fish that has 0.19 mg).
  const B6_IN_MG = /Marine Fish|Marine Shellfish|Marine Mollusks|Fresh Water Fish/;
  // IFCT stores every nutrient in grams per 100 g and energy in kJ.
  return objs.map(o => {
    const g = k => { if (unmeasured[o.grup].has(k)) return null; const n = parseFloat(o[k]); return Number.isFinite(n) ? n : null; };
    const sum = (ks, mul) => { const xs = ks.map(g); return xs.every(n => n == null) ? null : xs.reduce((s, n) => s + (n || 0), 0) * mul; };
    const values = {
      fib: sum(['fibtg'], 1), ca: sum(['ca'], 1e3), fe: sum(['fe'], 1e3), mg: sum(['mg'], 1e3), zn: sum(['zn'], 1e3), k: sum(['k'], 1e3), na: sum(['na'], 1e3),
      se: sum(['se'], 1e6), vc: sum(['vitc'], 1e3), vd: sum(['ergcal', 'chocal'], 1e6), ve: sum(['vite'], 1e3), vk: sum(['vitk1', 'vitk2'], 1e6),
      b1: sum(['thia'], 1e3), b2: sum(['ribf'], 1e3), b3: sum(['nia'], 1e3), b6: sum(['vitb6c'], B6_IN_MG.test(o.grup) ? 1 : 1e3), b12: null, fol: sum(['folsum'], 1e6),
      o3: sum(['f20d5n3', 'f22d6n3'], 1e3), ala: sum(['f18d3n3'], 1),
      // Retinol activity equivalents, so plant foods aren't counted at full carotene. Animal foods without a retinol figure have no vitamin A figure.
      va: g('retol') == null && (g('cartb') == null || !PLANT.test(o.grup)) ? null : ((g('retol') || 0) + (g('cartb') || 0) / 12 + ((g('carta') || 0) + (g('crypxb') || 0)) / 24) * 1e6,
    };
    const vec = KEYS.map(k => values[k]);
    const r = { name: o.name, group: o.grup, kcal: parseFloat(o.enerc) / 4.184, p: parseFloat(o.protcnt), c: parseFloat(o.choavldf), f: parseFloat(o.fatce), values: vec };
    putVector('n', o.name, vec, r.p);
    return r;
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
let curatedScaled = 0;
CURATED.forEach(([name, kcal, p, c, f, g, label]) => {
  const entry = CURATED_MICROS[name];
  let values = KEYS.map(() => null);
  if (entry) {
    // An entry is 'src:name', or ['src:name', { key: value or null }] to replace values the match gets wrong for this food.
    const [ref, override = {}] = Array.isArray(entry) ? entry : [entry];
    const [rsrc, ...rest] = ref.split(':');
    const hit = vectors[rsrc]?.[rest.join(':').toLowerCase()];
    if (!hit) throw new Error(`curated-micros: no match for ${name} -> ${ref}`);
    // The match is often wetter or drier than the dish (dry dal vs cooked, a 200 kcal recipe roti vs a 235 kcal one), so its
    // per-100 g values are scaled by the protein ratio: a stand-in for how much of the same food is in 100 g. Added sugar or
    // fat don't change protein, so lassi doesn't get double the calcium of curd. Foods with almost no protein aren't scaled.
    const scale = p >= 1.5 && hit.protein >= 1.5 ? Math.min(3, Math.max(1 / 3, p / hit.protein)) : 1;
    if (Math.abs(scale - 1) > 0.05) curatedScaled++;
    values = hit.values.map(x => x == null ? null : x * scale);
    for (const [k, v] of Object.entries(override)) {
      if (!KEYS.includes(k)) throw new Error(`curated-micros: unknown key ${k} for ${name}`);
      values[KEYS.indexOf(k)] = v;
    }
    curatedMatched++;
  }
  pushCore(name, '', kcal, p, c, f, serving(label, g) || '', 'c', encode(values, groupFor(name), name));
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
  // The same frying-oil error in dishes under 450 kcal: nearly all the energy from fat with little else left
  // (vegetable samosa 443 kcal with 42 g fat and 2 g protein, vegetable yakhni 406 kcal, 805 kcal mathri).
  const fatIsTheFood = /dressing|tartare|mayonnaise|baghar|tadka|pickle|achaar|achar|aachar|chutney|\bdip\b|^(white|cheese|mustard|mushroom) sauce/i;
  if (!fatIsTheFood.test(name) && (f * 9 / kcal > 0.86 || (f > 28 && p + c < 20) || f > 45)) continue;
  // A few cooked dishes are given per 100 g of dry ingredients (plain dosa 381 kcal, khichdi 383 kcal, tamarind rice 373 kcal).
  if (kcal > 280 && /\b(dosa|pesarattu|khichdi|khichri|porridge|upma|tamarind rice|maa chaane ki dal|namkeen daliya)\b/i.test(name) && !/premix|powder|mix\b/i.test(name)) continue;
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

// Open Food Facts packaged foods: Indian products first (tagged as sold in India, then other India-linked products),
// then the most scanned products worldwide. Crowd-entered, so each row is checked before it goes in.
const titleCase = s => (s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase())
  : s === s.toLowerCase() && /[a-z]{3}/.test(s) ? s.replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : s);
const MIN_SCANS_WORLD = Number(process.env.MIN_SCANS_WORLD || 3);
const MIN_SCANS_WEST = Number(process.env.MIN_SCANS_WEST || 1);

// Per-serving or per-pack figures typed into the per-100 g boxes: these foods can't physically be that light.
// A slip shrinks every number by the same factor, so the macros keep the food's usual shape (nuts stay mostly fat,
// whey mostly protein). The shape test keeps real products that merely share the name: almond milk, Magnum Almond,
// ready-to-drink whey, potato "chips" as in fries.
const share = (x, p, c, f) => (p + c + f > 0 ? x / (p + c + f) : 1);
const SLIPS = [
  ['oil or ghee under 700 kcal', 700, /\b(ghee|(sunflower|mustard|groundnut|peanut|olive|coconut|rice bran|soyabean|soybean|sesame|gingelly|til|vegetable|cooking|canola|palm|cottonseed|safflower|corn|refined|edible) oil)\b/i, /\b(spread|margarine|light|lite|(?<!(ghee|clarified).*)butter|mayo|mayonnaise|dressing|spray|in oil|with|tuna|sardines?|fish|chips|biscuits?|cookies?|rice|roti|paratha|sweets?|ladd?oo|halwa|mysore pak)\b/i, (p, c, f) => share(f, p, c, f) > 0.9],
  ['nuts under 450 kcal', 450, /^([\w']+\s){0,2}(almonds?|badam|cashews?( nuts?)?|kaju|walnuts?( kernels?)?|akhrot|pistachios?|pista|peanuts?|groundnuts?|hazelnuts?|pecans?|macadamias?)$/i, /\b(inshell|in shell|shell|milk|drink|beverage|butter|ice cream|cream|chocolate|bar|cookies?)\b/i, (p, c, f) => share(f, p, c, f) > 0.45],
  ['sugar or honey under 250 kcal', 250, /^((pure|raw|organic|natural|white|brown|cane|wild|forest|multiflora)\s)*(sugar|honey|jaggery|gur|shakkar|khand)$/i, null, (p, c, f) => share(c, p, c, f) > 0.9],
  ['biscuits under 280 kcal', 280, /\b(biscuits?|cookies?|crackers?|rusks?)\b/i, /\b(mix|dough|cake|ice cream|pudding|shake|drink|milk|spread|sauce|gravy|dog|cat|pet|tea|dessert|d[ée]lice)\b/i, (p, c, f) => share(c, p, c, f) > 0.5],
  ['chips or namkeen under 300 kcal', 300, /\b(chips|crisps|namkeen|bhujia|mixture|wafers?|sev|chivda|chiwda|nachos|kurkure)\b/i, /\b(fresh|apple|fruit|salsa|dip|sauce|frozen|oven|fries|fish|meal|cookie|chocolate chips?|choco chips?|pickles?|dill|gherkins?|pan[ée]e?|breaded|nuggets|ice cream|cone|kulfi|sundae)\b/i, (p, c, f) => share(f, p, c, f) >= 0.2],
  ['flour under 250 kcal', 250, /^((whole|chakki|fresh|organic|multigrain|wheat|gram|rice|ragi|jowar|bajra|maize|corn)\s)*(atta|flour|besan|maida|suji|sooji|rava|semolina)$/i, /\b(pudding|ambrosia|dessert|ready)\b/i, (p, c, f) => share(c, p, c, f) > 0.55],
  ['protein powder under 200 kcal', 200, /\b(whey|mass gainer|protein powder|isolate)\b/i, /\b(shake|drink|bar|water|milk|ready|rtd|cookie|wafer|coffee|bites?|chips|yog(h)?urt|curd|lassi|ice cream|cereal|bread)\b/i, (p, c, f) => share(p, p, c, f) > 0.5],
];
const servingSlip = (name, brand, kcal, p, c, f) => SLIPS.find(([, min, re, not, shape]) => kcal < min && re.test(name) && !(not && not.test(`${name} ${brand}`)) && shape(p, c, f))?.[0];

// Values above these per 100 g are almost always a unit slip (mg typed as g, IU as µg) for foods that aren't
// supplements, salt or the few naturally extreme foods each line allows. The value is dropped, not the food.
// Salt itself, stock cubes, tastemakers and chaat masala really are 15-39 g sodium per 100 g; other savoury foods stay under 12 g,
// and sweet or dairy foods under 2.5 g unless they're one of the salty kinds.
const VERY_SALTY = /\b(salt|namak|stock|bouillon|cubes?|seasoning|tastemaker|masala|soy sauce|fish sauce|soup|pickle|achaa?r|papad|miso)\b/i;
const SALTY = /\b(salt|namak|stock|bouillon|cubes?|seasoning|masala|tastemaker|soy sauce|fish sauce|powder|mix|premix|papad|pickle|achaa?r|spice|chutney|ketchup|sauce|miso|olives?|anchov|cured|salted|dried fish|soup|noodles|ramen|pasta sauce|gravy|cheese|feta|butter)\b/i;
const SUPPLEMENT = /\b(supplement|tablets?|capsules?|softgels?|multivit|vitamins?|premix|fortif|gummies|effervescent|sachet|drops)\b/i;
const MICRO_LIMITS = {
  na: [(g, n) => (VERY_SALTY.test(n) ? 39400 : ['milk', 'chocolate', 'fruit', 'juice', 'beverages', 'plantmilk', 'sweets', 'alcohol', 'eggs', 'sweetbake', 'cereal'].includes(g) && !SALTY.test(n) ? 2500 : 12000)],
  va: [() => 6000, /\b(liver|cod|fish oil|carrot powder|red palm)\b/i],
  b12: [() => 50, /\b(yeast|marmite|vegemite|liver|clams?)\b/i],
  se: [() => 300, /\b(brazil|yeast)\b/i],
  vd: [() => 60, /\b(mushrooms?|cod|liver|fish oil)\b/i],
  fol: [() => 1500, /\b(yeast|marmite|vegemite)\b/i],
  fe: [() => 60, /\b(spice|masala|jeera|cumin|thyme|basil|oregano|herbs?|mint|pudina|spirulina|cereal|flakes|haldi|turmeric|seasoning|powder|dried|amchur|kasuri|methi|bran)\b/i],
  ca: [() => 2500, /\b(powder|calcium)\b/i],
  vk: [() => 1700, /\b(dried|herbs?|basil|sage|parsley|matcha|greens|kale|moringa)\b/i],
  vc: [() => 2000, /\b(acerola|amla|camu|powder|vitamin c)\b/i],
  k: [() => 5000, /\b(powder|salt|seasoning|coffee|cocoa|spice|dried|tea|cream of tartar)\b/i],
  mg: [() => 800, /\b(seeds?|bran|cocoa|powder|spirulina)\b/i],
  zn: [() => 30, /\b(oysters?)\b/i],
  b1: [() => 10, /\b(yeast|powder|horlicks|bournvita|complan|boost|drink mix|malt)\b/i],
  b2: [() => 10, /\b(yeast|powder|horlicks|bournvita|complan|boost|drink mix|malt|marmite)\b/i],
  b6: [() => 10, /\b(yeast|powder|horlicks|bournvita|complan|boost|drink mix|malt)\b/i],
  b3: [() => 100, /\b(yeast|powder|marmite|vegemite)\b/i],
  ve: [() => 100, /\b(oil|wheat germ)\b/i],
  o3: [() => 5000, /\b(oil|omega|krill|cod liver)\b/i],
  ala: [() => 25, /\b(oil|flax|linseed|alsi|chia)\b/i],
  fib: [() => 50, /\b(psyllium|isabgol|husk|bran|inulin|fib(re|er) (supplement|powder))\b/i],
};
const microDrops = {};
const checkMicros = (values, group, name) => {
  if (SUPPLEMENT.test(name)) return values;
  return values.map((x, i) => {
    const lim = MICRO_LIMITS[KEYS[i]];
    if (x == null || !lim) return x;
    const [cap, allow] = lim;
    if (x > cap(group, name) && !(allow && allow.test(name))) { microDrops[KEYS[i]] = (microDrops[KEYS[i]] || 0) + 1; return null; }
    return x;
  });
};

// Brand spellings: "Haldiram's", "HALDIRAMS", "haldiram" become one brand, written the way most products write it.
const brandKey = b => b.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
const offRows = [];
const spellings = new Map();
for await (const line of readline.createInterface({ input: fs.createReadStream(offPath), crlfDelay: Infinity })) {
  const [code, rawName, rawBrand, kcal, p, c, f, servingG, servingLabel, scans, tier, isWest, micros = '', pnns = ''] = line.split('\t');
  const n = Number(scans);
  if (tier === '0' && n < MIN_SCANS_WORLD && !(isWest === '1' && n >= MIN_SCANS_WEST)) continue;
  offRows.push({ code, rawName, rawBrand, kcal: Number(kcal), p: Math.min(100, Number(p)), c: Math.min(100, Number(c)), f: Math.min(100, Number(f)), servingG: Number(servingG), servingLabel, n, tier: Number(tier), micros, pnns });
  if (rawBrand) {
    const k = brandKey(rawBrand);
    if (k.length >= 3) { const m = spellings.get(k) || new Map(); m.set(rawBrand, (m.get(rawBrand) || 0) + 1); spellings.set(k, m); }
  }
}
const brandName = new Map();
const mixedCase = x => x !== x.toUpperCase() && x !== x.toLowerCase();
for (const [k, m] of spellings) {
  // The commonest spelling, except that a short ALL-CAPS acronym stays (MTR, ITC, MDH) and otherwise a mixed-case
  // spelling ("Haldiram's") beats SHOUTING or lower case when it's reasonably common.
  const list = [...m].sort((a, b) => b[1] - a[1]);
  const [top, n] = list[0];
  const mixed = list.find(([x, c]) => mixedCase(x) && c * 3 >= n);
  const best = top === top.toUpperCase() && top.replace(/[^A-Za-z]/g, '').length <= 4 ? top : mixedCase(top) ? top : mixed ? mixed[0] : top;
  brandName.set(k, titleCase(best));
}

const india = [], indiaLinked = [], world = [];
const dropped = {};
const seenCodes = new Set();
let offWithLabelMicros = 0;
// India first, so a product both tagged India and sold elsewhere lands in the India file; most scanned first within each.
offRows.sort((a, b) => (a.tier || 9) - (b.tier || 9) || b.n - a.n);
for (const r of offRows) {
  const name = tidy(titleCase(r.rawName));
  const brand = r.rawBrand ? tidy(brandName.get(brandKey(r.rawBrand)) || titleCase(r.rawBrand)) : '';
  const slip = servingSlip(name, brand, r.kcal, r.p, r.c, r.f);
  if (slip) { dropped[slip] = (dropped[slip] || 0) + 1; continue; }
  const k = key(name, brand);
  if (seen.has(k)) { dropped['same name and brand'] = (dropped['same name and brand'] || 0) + 1; continue; }
  if (/^\d{8,14}$/.test(r.code)) {
    if (seenCodes.has(r.code)) { dropped['same barcode'] = (dropped['same barcode'] || 0) + 1; continue; }
    seenCodes.add(r.code);
  }
  seen.add(k);
  const label = Object.fromEntries(r.micros.split(',').filter(Boolean).map(kv => { const [mk, mv] = kv.split('='); return [mk, Number(mv)]; }));
  const group = groupFor(name, r.pnns);
  // Labels often print only sodium; a printed 0 for fibre or a vitamin is kept as 0.
  const values = checkMicros(KEYS.map(mk => label[mk] ?? null), group, `${name} ${brand}`);
  if (values.some((x, i) => x != null && KEYS[i] !== 'na')) offWithLabelMicros++;
  const s = r.servingG > 0 ? serving(r.servingLabel || `${r.servingG} g`, r.servingG) || '' : '';
  // Indian products keep their barcode so a scan finds them offline.
  const code = r.tier && /^\d{8,14}$/.test(r.code) ? r.code : '';
  const text = row(name, brand, r.kcal, r.p, r.c, r.f, s, 'o', code, encode(values, group, name));
  (r.tier === 1 ? india : r.tier === 2 ? indiaLinked : world).push(text);
}
offRows.length = 0;

// Split big lists so a phone can load them piece by piece, most-scanned first.
for (const old of fs.readdirSync(outDir)) if (/^(world|india-brands)(-\d+)?\.txt$/.test(old)) fs.unlinkSync(path.join(outDir, old));
const writeParts = (rows, base, size) => {
  const names = [];
  for (let i = 0; i < rows.length; i += size) {
    const name = rows.length > size ? `${base}-${names.length + 1}.txt` : `${base}.txt`;
    fs.writeFileSync(path.join(outDir, name), rows.slice(i, i + size).join('\n') + '\n');
    names.push(name);
  }
  return names;
};
fs.writeFileSync(path.join(outDir, 'india.txt'), india.join('\n') + '\n');
const brandParts = writeParts(indiaLinked, 'india-brands', 60000);
const parts = writeParts(world, 'world', 60000);

const meta = {
  // Date and time: food file URLs carry this, so a second build on the same day still reaches phones.
  built: new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-'),
  files: ['core.txt', 'india.txt', ...brandParts, ...parts],
  counts: { curated: curatedCount, indb: indbCount, ifct: ifctCount, usdaSurvey: usdaCounts.s, usdaFoundation: usdaCounts.f, usdaLegacy: usdaCounts.l, offIndia: india.length, offIndiaLinked: indiaLinked.length, offWorld: world.length },
  total: core.length + india.length + indiaLinked.length + world.length,
  microKeys: KEYS,
  microGroups,
};
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 1));
fs.writeFileSync(path.join(outDir, 'synonyms.json'), JSON.stringify(SYNONYMS));
console.log({ ...meta, microGroups: microGroups.map(g => `${g.name}:${g.n}`).join(' '), curatedMatched, curatedScaled, offWithLabelMicros, dropped, microDrops });
