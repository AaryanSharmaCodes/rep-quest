'use strict';
// Talks to the search worker, plus online lookups for anything the bundled database misses.
const SOURCE_NAMES = { c: 'Typical estimate', i: 'Indian Nutrient Databank', s: 'USDA FNDDS', f: 'USDA Foundation', l: 'USDA SR Legacy', o: 'Open Food Facts', u: 'USDA online', m: 'My food' };

const Foods = {
  worker: null, pending: new Map(), nextId: 1, ready: false, waiting: [],
  start() {
    if (this.worker) return;
    try {
      this.worker = new Worker('food-worker.js');
    } catch (e) { return; }
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'ready') { this.ready = true; this.waiting.splice(0).forEach(f => f()); }
      if (data.type === 'progress') { ui.foodDb = { loaded: data.loaded, total: data.total, done: data.done }; onFoodProgress(); }
      if (data.type === 'partial') { ui.foodDb = { ...ui.foodDb, partial: true }; onFoodProgress(); }
      if (data.type === 'results' || data.type === 'barcode') {
        const cb = this.pending.get(data.id);
        if (cb) { this.pending.delete(data.id); cb(data); }
      }
      if (data.type === 'error') { this.ready = false; ui.foodDb = { ...ui.foodDb, failed: true }; onFoodProgress(); }
    };
  },
  send(msg) {
    return new Promise(resolve => {
      const go = () => { const id = this.nextId++; this.pending.set(id, resolve); this.worker.postMessage({ ...msg, id }); };
      this.start();
      if (!this.worker) { resolve({ results: [] }); return; }
      if (this.ready) go(); else this.waiting.push(go);
    });
  },
  search(q) { return this.send({ type: 'search', q }); },
  barcode(code) { return this.send({ type: 'barcode', code }); },
};

const withTimeout = (url, ms = 12000) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
};
async function searchUSDA(q) {
  const key = state.settings.usdaKey || 'DEMO_KEY';
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(q)}&pageSize=25`;
  const res = await withTimeout(url);
  if (res.status === 429) throw new Error('limit');
  if (!res.ok) throw new Error('down');
  const data = await res.json();
  return (data.foods || []).map(f => {
    const n = {};
    (f.foodNutrients || []).forEach(x => { n[x.nutrientId] = x.value; });
    const kcal = n[1008] ?? n[2047] ?? n[2048];
    if (kcal == null) return null;
    const servings = f.servingSize > 0 && /g|ml/i.test(f.servingSizeUnit || '') ? [{ label: f.householdServingFullText || `${f.servingSize} g`, g: f.servingSize }] : [];
    return { name: f.description, brand: f.brandName || f.brandOwner || '', kcal, p: n[1003] || 0, c: n[1005] || 0, f: n[1004] || 0, servings, src: 'u' };
  }).filter(Boolean);
}
const offToFood = p => {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null);
  if (kcal == null || !p.product_name) return null;
  const g = parseFloat(p.serving_quantity);
  return { name: p.product_name, brand: (p.brands || '').split(',')[0], kcal, p: n.proteins_100g || 0, c: n.carbohydrates_100g || 0, f: n.fat_100g || 0, servings: g > 0 ? [{ label: p.serving_size || `${g} g`, g }] : [], src: 'o', code: p.code || '' };
};
async function searchOFF(q) {
  const fields = 'code,product_name,brands,nutriments,serving_size,serving_quantity';
  for (const host of ['in', 'world']) {
    try {
      const res = await withTimeout(`https://${host}.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=1&page_size=25&fields=${fields}`);
      if (!res.ok) continue;
      const data = await res.json();
      const list = (data.products || []).map(offToFood).filter(Boolean);
      if (list.length) return list;
    } catch (e) { /* try the next host */ }
  }
  throw new Error('down');
}
async function lookupBarcode(code) {
  const local = await Foods.barcode(code);
  if (local.food) return local.food;
  const res = await withTimeout(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,nutriments,serving_size,serving_quantity`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.status === 1 ? offToFood(data.product) : null;
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the scanner'));
    document.head.appendChild(s);
  });
}
async function readBarcodeFromPhoto(file) {
  if (!window.Html5Qrcode) await loadScript('vendor/html5-qrcode.min.js');
  const host = document.getElementById('scan-host');
  const reader = new Html5Qrcode(host.id, { verbose: false });
  try {
    return await reader.scanFile(file, false);
  } finally {
    try { reader.clear(); } catch (e) { /* nothing to clear */ }
  }
}
let exerciseDb = null;
async function loadExerciseDb() {
  if (exerciseDb) return exerciseDb;
  exerciseDb = await (await fetch('exercises-db.json')).json();
  return exerciseDb;
}

// One shape for every food, whatever its source: values per 100 g plus servings.
function normaliseFood(f) {
  const servings = (f.servings || []).slice();
  if (f.servingG && !servings.length) servings.push({ label: f.servingLabel || `${f.servingG} g`, g: f.servingG });
  return { ...f, servings, id: f.id || `${f.src || 'x'}:${(f.name + (f.brand || '')).toLowerCase()}` };
}
const rememberFood = f => { const n = normaliseFood(f); ui.foodIndex[n.id] = n; return n.id; };
const macrosFor = (f, grams) => { const k = grams / 100; return { kcal: f.kcal * k, p: f.p * k, c: f.c * k, f: f.f * k }; };
