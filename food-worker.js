'use strict';
// Searches half a million foods off the main thread so typing stays smooth.
// Files stay as plain text and are scanned directly, which uses far less memory than an object per food on a phone.
const chunks = [];
let meta = null, loaded = 0, stopped = false;
const synonyms = new Map();
let vocab = null;

const isWord = c => (c >= 97 && c <= 122) || (c >= 48 && c <= 57);
const SRC_RANK = { c: 60, i: 48, n: 45, s: 42, f: 40, l: 30, o: 10 };
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
// Search looks only at each food's name and brand, so those are copied out (lower-cased) into a smaller text,
// one food per line in file order. starts[i] is where line i begins in that text, src[i] the line's source letter.
// Scanning this instead of the whole file is about 3x less text, and it keeps memory lower than a lower-cased copy of everything.
function addChunk(name, text) {
  const parts = [], rawStarts = [], srcs = [];
  let at = 0;
  while (at < text.length) {
    let end = text.indexOf('\n', at);
    if (end < 0) end = text.length;
    if (end > at) {
      const tab1 = text.indexOf('\t', at), tab2 = text.indexOf('\t', tab1 + 1);
      parts.push(text.slice(at, tab2));
      rawStarts.push(at);
      // Columns: name, brand, kcal, p, c, f, servings, src, ... The source is the letter after the 7th tab.
      let t = tab2;
      for (let n = 2; n < 7; n++) t = text.indexOf('\t', t + 1);
      srcs.push(text.charCodeAt(t + 1));
    }
    at = end + 1;
  }
  const low = foldText(parts.join('\n'));
  const lines = parts.length;
  const starts = new Int32Array(lines);
  for (let i = 0, pos = 0; i < lines; i++) { starts[i] = pos; pos += parts[i].length + 1; }
  chunks.push({ name, raw: text, low, starts, rawStarts: Int32Array.from(rawStarts), src: Uint8Array.from(srcs), lines, india: name.startsWith('india') });
  loaded += lines;
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
  const [name, brand, kcal, p, c, f, servings, src, code, mi] = line.split('\t');
  return {
    name, brand, kcal: +kcal, p: +p, c: +c, f: +f, src, code: code || '', mi: mi || '', mk: +kcal,
    servings: servings ? servings.split('|').map(s => { const [label, g] = s.split(':'); return { label, g: +g }; }).filter(s => s.g > 0) : [],
  };
}
// Words a typed token can match. Matching is by word start, so a form that begins with another form adds nothing
// ("egg" already finds "eggs") and is dropped, which saves a scan. Longer plurals also match the singular
// ("biscuits" finds "biscuit", "haldirams" finds "Haldiram's").
const forms = token => {
  const list = [token, ...(synonyms.get(token) || [])];
  if (token.length >= 6 && /[^s]s$/.test(token)) { const base = token.slice(0, -1); list.push(base, ...(synonyms.get(base) || [])); }
  return [...new Set(list)].filter((f, i, all) => !all.some((g, j) => j !== i && g.length < f.length && f.startsWith(g)));
};

// Line number of a position in a chunk's search text.
function lineAt(starts, pos) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
  return lo;
}
function run(tokens, limit) {
  const groups = tokens.map(forms);
  // Anchor on the longest typed word: it has the fewest matches to walk through.
  let anchorIdx = 0;
  tokens.forEach((t, i) => { if (t.length > tokens[anchorIdx].length) anchorIdx = i; });
  const phrase = tokens.join(' ');
  const firstForms = forms(tokens[0]);
  const best = [];
  let floor = -Infinity;

  for (const chunk of chunks) {
    const { low, starts, src, lines } = chunk;
    const size = low.length;
    const done = new Set();
    for (const needle of groups[anchorIdx]) {
      let i = 0;
      while (true) {
        i = wordAt(low, needle, i, size);
        if (i < 0) break;
        const line = lineAt(starts, i);
        const start = starts[line];
        const end = line + 1 < lines ? starts[line + 1] - 1 : size;
        if (done.has(line)) { i = end + 1; continue; }
        done.add(line);
        // Look only inside this food's name and brand. Searching on from the match made two-word
        // searches crawl through megabytes for every line that matched the first word.
        const seg = low.slice(start, end);
        let nameEnd = seg.indexOf('\t');
        if (nameEnd < 0) nameEnd = seg.length;

        let inName = 0, all = true, exactWords = 0;
        for (let g = 0; g < groups.length && all; g++) {
          let found = -1;
          for (const form of groups[g]) {
            found = wordAt(seg, form, 0, seg.length);
            if (found >= 0) {
              if (found < nameEnd) inName++;
              const after = seg.charCodeAt(found + form.length);
              if (!isWord(after)) exactWords++;
              break;
            }
          }
          if (found < 0) all = false;
        }
        if (!all) { i = end + 1; continue; }

        let score = SRC_RANK[String.fromCharCode(src[line])] ?? 10;
        if (chunk.india) score += 14;
        if (inName === tokens.length) score += 22;
        score += exactWords * 8;
        if (seg.startsWith(phrase)) score += 34;
        else if (wordAt(seg, phrase, 0, nameEnd) >= 0) score += 20;
        else if (firstForms.some(f => seg.startsWith(f))) score += 12;
        score -= Math.min(nameEnd, 90) * 0.42;
        score -= (line / lines) * 6; // packaged files are sorted most-scanned first

        if (best.length < limit || score > floor) {
          best.push({ score, chunk, line });
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
  return best.slice(0, limit).map(b => {
    const { raw, rawStarts } = b.chunk;
    const from = rawStarts[b.line];
    let to = raw.indexOf('\n', from);
    if (to < 0) to = raw.length;
    return { ...parseLine(raw.slice(from, to)), score: Math.round(b.score) };
  });
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
  // Plus words from Indian brand names on at least 3 products ("Uncle Chipps" is not a typo; a one-off misspelt brand is).
  const brandWords = new Map();
  chunks.filter(c => c.india).forEach(chunk => chunk.low.split('\n').forEach(line => {
    line.slice(line.indexOf('\t') + 1).split(/[^a-z0-9]+/).forEach(w => { if (w.length >= 3) brandWords.set(w, (brandWords.get(w) || 0) + 1); });
  }));
  brandWords.forEach((n, w) => { if (n >= 3) vocab.add(w); });
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
    const i = chunk.raw.indexOf('\t' + code + '\t');
    if (i >= 0) {
      const start = chunk.raw.lastIndexOf('\n', i) + 1;
      let end = chunk.raw.indexOf('\n', i);
      if (end < 0) end = chunk.raw.length;
      return parseLine(chunk.raw.slice(start, end));
    }
  }
  return null;
}

// Finds foods by source + exact name (and brand when given), for entries logged before foods carried micronutrients.
function lookup(items) {
  const found = {};
  for (const item of items) {
    const [src, name, brand] = item.split('\t');
    for (const chunk of chunks) {
      const raw = chunk.raw;
      let i = raw.startsWith(name + '\t') ? 0 : raw.indexOf('\n' + name + '\t');
      while (i >= 0) {
        const start = i === 0 && raw.startsWith(name + '\t') ? 0 : i + 1;
        let end = raw.indexOf('\n', start);
        if (end < 0) end = raw.length;
        const f = parseLine(raw.slice(start, end));
        if (f.src === src && (!brand || f.brand === brand)) { found[item] = { mi: f.mi, kcal: f.kcal }; break; }
        i = raw.indexOf('\n' + name + '\t', end - 1);
      }
      if (found[item]) break;
    }
  }
  return found;
}

onmessage = ({ data }) => {
  if (data.type === 'ping') postMessage({ type: 'pong', id: data.id });
  if (data.type === 'lookup') postMessage({ type: 'lookup', id: data.id, found: lookup(data.items) });
  if (data.type === 'search') postMessage({ type: 'results', id: data.id, ...search(data.q) });
  if (data.type === 'barcode') postMessage({ type: 'barcode', id: data.id, food: byBarcode(data.code) });
};
boot();
