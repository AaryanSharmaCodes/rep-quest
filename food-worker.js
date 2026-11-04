'use strict';
// Searches half a million foods off the main thread so typing stays smooth.
// Files stay as plain text and are scanned directly, which uses far less memory than an object per food on a phone.
const chunks = [];
let meta = null, loaded = 0, stopped = false;
const synonyms = new Map();
let vocab = null;

const isWord = c => (c >= 97 && c <= 122) || (c >= 48 && c <= 57);
const SRC_RANK = { c: 60, i: 48, s: 42, f: 40, l: 30, o: 10 };
const PINS = {
  rice: 'White rice / chawal', chawal: 'White rice / chawal', egg: 'Egg, whole', eggs: 'Egg, whole', anda: 'Egg, whole', dahi: 'Curd / dahi', curd: 'Curd / dahi', milk: 'Milk, toned', doodh: 'Milk, toned',
  chicken: 'Chicken breast, cooked', dal: 'Dal, home-cooked', daal: 'Dal, home-cooked', roti: 'Roti / chapati', chapati: 'Roti / chapati', bread: 'Whole wheat bread', potato: 'Potato, boiled', aloo: 'Potato, boiled',
  oil: 'Cooking oil', sugar: 'Sugar', tea: 'Chai with milk', chai: 'Chai with milk', coffee: 'Black coffee', oats: 'Oats, dry', dosa: 'Dosa, plain', paratha: 'Paratha, plain', naan: 'Naan, plain', biryani: 'Chicken biryani',
  fish: 'Fish curry', mutton: 'Mutton curry', burger: 'Burger, chicken', pizza: 'Pizza, margherita', fries: 'French fries', pasta: 'Pasta, cooked plain', salad: 'Salad (cucumber', noodles: 'Veg noodles', soya: 'Soya chunks, dry',
};

async function getText(name) {
  const res = await fetch(`foods/${name}?v=${meta.built}`);
  if (!res.ok) throw new Error(`Could not load ${name}`);
  return res.text();
}
// Must keep every character at the same position as the original, because matches are read back from it.
// Plain toLowerCase can change the length (İ becomes two characters), and accents are dropped so "nestle" finds "Nestlé".
function foldText(text) {
  const low = text.replace(/İ/g, 'I').toLowerCase().replace(/[à-ɏ]/g, c => {
    const base = c.normalize('NFD')[0];
    return base.length === 1 ? base : c;
  });
  return low.length === text.length ? low : text.replace(/[A-Z]/g, c => c.toLowerCase());
}
function addChunk(name, text) {
  chunks.push({ name, raw: text, low: foldText(text), lines: (text.match(/\n/g) || []).length });
  loaded += chunks[chunks.length - 1].lines;
  vocab = null;
  postMessage({ type: 'progress', loaded, total: meta.total, done: chunks.length === meta.files.length });
}
async function boot() {
  try {
    meta = await (await fetch('foods/meta.json', { cache: 'no-cache' })).json();
    const syn = await (await fetch(`foods/synonyms.json?v=${meta.built}`)).json();
    syn.forEach(group => group.forEach(word => {
      const others = group.filter(w => w !== word);
      synonyms.set(word, others);
    }));
    addChunk('core.txt', await getText('core.txt'));
    postMessage({ type: 'ready' });
    for (const name of meta.files.slice(1)) {
      if (stopped) return;
      try {
        addChunk(name, await getText(name));
      } catch (e) {
        postMessage({ type: 'partial', loaded, total: meta.total });
        return;
      }
      await new Promise(r => setTimeout(r, 150));
    }
  } catch (e) {
    postMessage({ type: 'error', message: String(e.message || e) });
  }
}

function wordAt(low, needle, from, end) {
  let i = from;
  while (true) {
    i = low.indexOf(needle, i);
    if (i < 0 || i >= end) return -1;
    if (i === 0 || !isWord(low.charCodeAt(i - 1))) return i;
    i += 1;
  }
}
function parseLine(line) {
  const [name, brand, kcal, p, c, f, servings, src, code] = line.split('\t');
  return {
    name, brand, kcal: +kcal, p: +p, c: +c, f: +f, src, code: code || '',
    servings: servings ? servings.split('|').map(s => { const [label, g] = s.split(':'); return { label, g: +g }; }).filter(s => s.g > 0) : [],
  };
}
const forms = token => [token, ...(synonyms.get(token) || [])];

function run(tokens, limit) {
  const groups = tokens.map(forms);
  // Anchor on the longest typed word: it has the fewest matches to walk through.
  let anchorIdx = 0;
  tokens.forEach((t, i) => { if (t.length > tokens[anchorIdx].length) anchorIdx = i; });
  const phrase = tokens.join(' ');
  const best = [];
  let floor = -Infinity;

  for (const chunk of chunks) {
    const { low, raw } = chunk;
    const size = low.length;
    const done = new Set();
    for (const needle of groups[anchorIdx]) {
      let i = 0;
      while (true) {
        i = wordAt(low, needle, i, size);
        if (i < 0) break;
        const start = low.lastIndexOf('\n', i) + 1;
        let end = low.indexOf('\n', i);
        if (end < 0) end = size;
        const nextFrom = i + needle.length;
        if (done.has(start)) { i = nextFrom; continue; }
        const tab1 = low.indexOf('\t', start);
        const tab2 = low.indexOf('\t', tab1 + 1);
        if (i >= tab2) { i = end + 1; continue; } // matched a serving label, not the food
        done.add(start);

        let inName = 0, all = true, exactWords = 0;
        for (let g = 0; g < groups.length && all; g++) {
          let found = -1;
          for (const form of groups[g]) {
            found = wordAt(low, form, start, tab2);
            if (found >= 0) {
              if (found < tab1) inName++;
              const after = low.charCodeAt(found + form.length);
              if (!isWord(after)) exactWords++;
              break;
            }
          }
          if (found < 0) all = false;
        }
        if (!all) { i = end + 1; continue; }

        const nameLen = tab1 - start;
        const srcCode = raw.charAt(raw.lastIndexOf('\t', raw.lastIndexOf('\t', end - 1) - 1) + 1);
        let score = SRC_RANK[srcCode] ?? 10;
        if (chunk.name === 'india.txt') score += 14;
        if (inName === tokens.length) score += 22;
        score += exactWords * 8;
        const nameStart = low.slice(start, start + phrase.length);
        if (nameStart === phrase) score += 34;
        else if (wordAt(low, phrase, start, tab1) >= 0) score += 20;
        else if (forms(tokens[0]).some(f => low.startsWith(f, start))) score += 12;
        score -= Math.min(nameLen, 90) * 0.42;
        score -= (start / size) * 6; // packaged files are sorted most-scanned first

        if (best.length < limit || score > floor) {
          best.push({ score, line: raw.slice(start, end) });
          if (best.length > limit * 3) {
            best.sort((a, b) => b.score - a.score);
            best.length = limit;
            floor = best[best.length - 1].score;
          }
        }
        i = end + 1;
      }
    }
  }
  best.sort((a, b) => b.score - a.score);
  return best.slice(0, limit).map(b => ({ ...parseLine(b.line), score: Math.round(b.score) }));
}

// Typos: match against words that exist in the everyday foods.
function buildVocab() {
  vocab = new Set();
  const take = chunk => chunk.low.split('\n').forEach(line => {
    const name = line.slice(0, line.indexOf('\t'));
    name.split(/[^a-z0-9]+/).forEach(w => { if (w.length >= 3) vocab.add(w); });
  });
  // Curated and government data only: crowd-sourced names contain the typos we're trying to fix.
  chunks.filter(c => c.name === 'core.txt').forEach(take);
  synonyms.forEach((_, w) => { if (!w.includes(' ')) vocab.add(w); });
}
function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev[j - 1]);
      cur[j] = v;
      if (v < low) low = v;
    }
    if (low > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}
function correct(token) {
  if (token.length < 4) return token;
  if (!vocab) buildVocab();
  if (vocab.has(token)) return token;
  const limit = token.length >= 7 ? 2 : 1;
  let best = token, bestD = limit + 1;
  for (const w of vocab) {
    if (Math.abs(w.length - token.length) > limit) continue;
    if (w[0] !== token[0] && limit === 1) continue;
    const d = distance(token, w, limit);
    if (d < bestD) { bestD = d; best = w; if (d === 1) break; }
  }
  return best;
}

function search(query) {
  const tokens = query.toLowerCase().replace(/[^a-z0-9% ]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!tokens.length) return { results: [] };
  let results = run(tokens, 60);
  let corrected = null;
  // A bare staple word should show the plain food first, not a dish that starts with it.
  const pin = PINS[tokens.join(' ')];
  if (pin) {
    const hit = results.findIndex(r => r.name.startsWith(pin));
    if (hit > 0) results.unshift(results.splice(hit, 1)[0]);
  }
  if (results.length < 5) {
    const fixed = tokens.map(correct);
    if (fixed.join(' ') !== tokens.join(' ')) {
      const again = run(fixed, 60);
      if (again.length > results.length) { results = again; corrected = fixed.join(' '); }
    }
  }
  return { results, corrected };
}
function byBarcode(code) {
  for (const chunk of chunks) {
    const i = chunk.raw.indexOf('\t' + code + '\n');
    if (i >= 0) {
      const start = chunk.raw.lastIndexOf('\n', i) + 1;
      return parseLine(chunk.raw.slice(start, i + code.length + 1));
    }
  }
  return null;
}

onmessage = ({ data }) => {
  if (data.type === 'search') postMessage({ type: 'results', id: data.id, ...search(data.q) });
  if (data.type === 'barcode') postMessage({ type: 'barcode', id: data.id, food: byBarcode(data.code) });
};
boot();
