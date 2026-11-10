'use strict';
// Talks to the search worker, plus online lookups for anything the bundled database misses.
const SOURCE_NAMES = { c: 'Typical estimate', i: 'Indian Nutrient Databank', s: 'USDA FNDDS', f: 'USDA Foundation', l: 'USDA SR Legacy', o: 'Open Food Facts', u: 'USDA online', m: 'My food', n: 'IFCT 2017 (NIN)' };

// iOS can kill the worker while the app sits in the background, and nothing tells the page.
// So every request has a deadline: a silent worker is replaced and the request is sent again.
const Foods = {
  worker: null, pending: new Map(), nextId: 1, ready: false, waiting: [], gen: 0, revives: 0, bootTimer: null,
  // Nothing may wait forever on a worker that died, and the next search gets a fresh try.
  fail() {
    this.stop();
    ui.foodDb = { ...ui.foodDb, failed: true };
    this.waiting.splice(0).forEach(w => w.resolve({ results: [] }));
    this.pending.forEach(p => p.resolve({ results: [] }));
    this.pending.clear();
    onFoodProgress();
  },
  stop() {
    clearTimeout(this.bootTimer);
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.gen++;
  },
  // Start a fresh worker and resend whatever was still waiting for an answer.
  revive() {
    if (this.revives >= 3) { this.fail(); return; }
    this.revives++;
    const unanswered = [...this.pending.values()];
    this.pending.clear();
    this.stop();
    this.start();
    unanswered.forEach(p => this.queue(p));
  },
  start() {
    if (this.worker) return;
    try {
      this.worker = new Worker('food-worker.js');
    } catch (e) { return; }
    const gen = this.gen;
    // The first file is about 2 MB, so a worker that hasn't said ready after 25 s is stuck.
    clearTimeout(this.bootTimer);
    this.bootTimer = setTimeout(() => { if (gen === this.gen && !this.ready) this.revive(); }, 25000);
    this.worker.onmessage = ({ data }) => {
      if (gen !== this.gen) return;
      if (data.type === 'ready') { clearTimeout(this.bootTimer); this.ready = true; this.waiting.splice(0).forEach(p => this.post(p)); }
      if (data.type === 'progress') { ui.foodDb = { loaded: data.loaded, total: data.total, done: data.done }; onFoodProgress(); if (data.done) backfillMicros(); }
      if (data.type === 'partial') { ui.foodDb = { ...ui.foodDb, partial: true }; onFoodProgress(); }
      if (data.type === 'results' || data.type === 'barcode' || data.type === 'lookup' || data.type === 'pong') {
        const p = this.pending.get(data.id);
        if (p) { this.pending.delete(data.id); clearTimeout(p.timer); this.revives = 0; p.resolve(data); }
      }
      if (data.type === 'error') this.fail();
    };
    this.worker.onerror = () => { if (gen === this.gen) this.revive(); };
    this.worker.onmessageerror = () => { if (gen === this.gen) this.revive(); };
  },
  post(p) {
    const id = this.nextId++, gen = this.gen;
    this.pending.set(id, p);
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      if (!this.pending.has(id) || gen !== this.gen) return;
      if (++p.tries > 2) { this.pending.delete(id); p.resolve({ results: [] }); return; }
      this.revive();
    }, p.msg.type === 'lookup' ? 20000 : 6000);
    try { this.worker.postMessage({ ...p.msg, id }); } catch (e) { this.revive(); }
  },
  queue(p) {
    this.start();
    if (!this.worker) { p.resolve({ results: [] }); return; }
    if (this.ready) this.post(p); else this.waiting.push(p);
  },
  send(msg) { return new Promise(resolve => this.queue({ msg, resolve, tries: 0 })); },
  search(q) { return this.send({ type: 'search', q }); },
  barcode(code) { return this.send({ type: 'barcode', code }); },
  // Coming back to the app: make sure the worker is still alive before the next search needs it.
  check() {
    if (!this.worker || !this.ready) return;
    const gen = this.gen;
    let answered = false;
    this.send({ type: 'ping' }).then(() => { answered = true; });
    setTimeout(() => { if (!answered && gen === this.gen && this.worker) this.revive(); }, 3000);
  },
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
    return { name: f.description, brand: f.brandName || f.brandOwner || '', kcal, p: n[1003] || 0, c: n[1005] || 0, f: n[1004] || 0, servings, src: 'u', mi: usdaMicros(f.foodNutrients), mk: kcal };
  }).filter(Boolean);
}
const offToFood = p => {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null);
  if (kcal == null || !p.product_name) return null;
  const g = parseFloat(p.serving_quantity);
  return { name: p.product_name, brand: (p.brands || '').split(',')[0], kcal, p: n.proteins_100g || 0, c: n.carbohydrates_100g || 0, f: n.fat_100g || 0, servings: g > 0 ? [{ label: p.serving_size || `${g} g`, g }] : [], src: 'o', code: p.code || '', mi: offMicros(n), mk: kcal };
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
