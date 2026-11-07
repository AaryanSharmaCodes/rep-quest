'use strict';
// Small hand-drawn charts. Text stays in ink colours; only marks carry colour. One axis per chart.
// Page gutters are 16 px and most charts sit inside a panel with 14 px of padding.
const chartWidth = () => clamp((document.documentElement.clientWidth || window.innerWidth || 375) - 60, 240, 620);

// A vertical scale that starts and ends on round numbers, so every gridline has a label and nothing floats off the top.
function niceScale(lo, hi, minSpan = 0, count = 4) {
  if (hi - lo < minSpan) { const mid = (lo + hi) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  if (hi === lo) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw - 1e-9) || raw;
  const bottom = Math.floor(lo / step + 1e-9) * step, top = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let n = 0; bottom + n * step <= top + step * 0.001; n++) ticks.push(round(bottom + n * step, 3));
  return { lo: bottom, hi: top, ticks };
}
const smoothPath = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
const chartDate = k => (k === today() ? 'Today' : shortDate(k));

// A line over real time: `to` is the right edge and the axis always covers at least `minDays`, so two readings
// sit a day apart instead of stretching across the whole chart. Touch and drag to read any day.
function lineChart({ id, points, height = 190, unit = '', decimals = 1, showRaw = false, lineKey = 'v', minSpan = 0, minDays = 0, from = null, to = null, emptyText = 'Nothing logged yet.' }) {
  if (!points.length) return `<p class="empty">${esc(emptyText)}</p>`;
  const W = chartWidth(), H = height, padR = 38, padT = 10, padB = 22, padL = 2;
  const vals = points.flatMap(p => [p.v, p[lineKey]]).filter(v => v != null);
  const { lo, hi, ticks } = niceScale(Math.min(...vals), Math.max(...vals), minSpan);
  const last = to || points[points.length - 1].date;
  let first = from && from < points[0].date ? from : points[0].date;
  if (minDays && daysBetween(first, last) < minDays) first = addDays(last, -minDays);
  const span = Math.max(daysBetween(first, last), 1);
  const x = date => padL + (daysBetween(first, date) / span) * (W - padL - padR);
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const grid = ticks.map(t => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="c-grid"/><text x="${W - padR + 6}" y="${y(t) + 4}" class="c-axis">${t}</text>`).join('');
  const line = points.length > 1 ? `<path d="${smoothPath(points.map(p => [x(p.date), y(p[lineKey])]))}" class="c-line" pathLength="1"/>` : '';
  // Dots shrink as readings pile up. The newest is always the clear one, so you can see where you are now.
  const r = points.length > 60 ? 1.5 : points.length > 21 ? 2.2 : 3;
  const raw = showRaw ? points.slice(0, -1).map(p => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${r}" class="c-dot"/>`).join('') : '';
  const end = points[points.length - 1];
  const now = showRaw || points.length === 1 ? `<circle cx="${x(end.date).toFixed(1)}" cy="${y(end.v).toFixed(1)}" r="5" class="c-dot-on"/>` : '';
  const mid = addDays(first, Math.round(span / 2));
  const xl = [[first, padL, 'start'], ...(span >= 4 ? [[mid, (padL + W - padR) / 2, 'middle']] : []), [last, W - padR, 'end']]
    .map(([d, px, anchor]) => `<text x="${px}" y="${H - 5}" class="c-axis" text-anchor="${anchor}">${chartDate(d)}</text>`).join('');
  ui.charts[id] = { points, W, padL, padR, lineKey, unit, decimals, xy: points.map(p => [x(p.date), y(p[lineKey])]), H, padT, padB, first, span };
  return `<div class="chart" data-chart="${id}" style="height:${H}px">
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(id)} chart with ${points.length} readings">${grid}${line}${raw}${now}${xl}<g class="c-cursor" hidden><line class="c-cross" y1="${padT}" y2="${H - padB}"/><circle r="5" class="c-dot-on"/></g></svg>
    <div class="c-tip" hidden></div></div>`;
}
function moveCursor(el, clientX) {
  const c = ui.charts[el.dataset.chart];
  if (!c) return;
  const box = el.getBoundingClientRect();
  const px = clamp(clientX - box.left, c.padL, c.W - c.padR);
  let best = 0, gap = Infinity;
  c.xy.forEach((p, i) => { const g = Math.abs(p[0] - px); if (g < gap) { gap = g; best = i; } });
  const p = c.points[best], [cx, cy] = c.xy[best];
  const g = el.querySelector('.c-cursor'), tip = el.querySelector('.c-tip');
  g.removeAttribute('hidden');
  g.querySelector('line').setAttribute('x1', cx);
  g.querySelector('line').setAttribute('x2', cx);
  g.querySelector('circle').setAttribute('cx', cx);
  g.querySelector('circle').setAttribute('cy', cy);
  tip.hidden = false;
  // The scale reading is the number people remember, so it leads. The trend sits beside it.
  const main = round(p.v, c.decimals);
  const trendNote = c.lineKey !== 'v' && p[c.lineKey] != null ? `<span>trend ${round(p[c.lineKey], 1)}</span>` : '';
  tip.innerHTML = `<b>${main}${c.unit ? ' ' + c.unit : ''}</b>${trendNote}<span>${chartDate(p.date)}</span>`;
  const tw = tip.offsetWidth;
  tip.style.left = `${clamp(cx - tw / 2, 0, c.W - tw)}px`;
}
function hideCursor(el) {
  el.querySelector('.c-cursor')?.setAttribute('hidden', '');
  const tip = el.querySelector('.c-tip');
  if (tip) tip.hidden = true;
}

// Daily bars with a target line. Today is brighter so it reads as still in progress.
function barChart({ id, days, get, target, color = 'var(--accent)', height = 120, unit = '' }) {
  const W = chartWidth(), H = height, padB = 20, padT = 8, padR = 34;
  const vals = days.map(d => get(d) || 0);
  const peak = Math.max(...vals, target || 0, 1) * 1.08;
  const y = v => padT + (1 - v / peak) * (H - padT - padB);
  const gap = 2, bw = Math.max(2, (W - padR - gap * (days.length - 1)) / days.length);
  const bars = days.map((d, i) => {
    const v = vals[i], bx = i * (bw + gap);
    if (!v) return `<rect x="${bx}" y="${H - padB - 2}" width="${bw}" height="2" class="c-nil" data-i="${i}"/>`;
    const top = y(v), h = H - padB - top, r = Math.min(4, bw / 2);
    return `<path d="M${bx} ${H - padB}V${top + r}Q${bx} ${top} ${bx + r} ${top}H${bx + bw - r}Q${bx + bw} ${top} ${bx + bw} ${top + r}V${H - padB}Z" fill="${color}" opacity="${d === today() ? 1 : 0.72}" class="c-bar" style="--n:${i}"/>`;
  }).join('');
  const line = target ? `<line x1="0" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}" class="c-target"/><text x="${W - padR + 6}" y="${y(target) + 4}" class="c-axis">${fmt(target)}</text>` : '';
  ui.charts[id] = { bars: true, days, vals, unit, bw, gap, W, padR };
  return `<div class="chart" data-chart="${id}" style="height:${H}px"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(id)} bars">${bars}${line}
    <text x="0" y="${H - 5}" class="c-axis">${shortDate(days[0])}</text><text x="${W - padR}" y="${H - 5}" class="c-axis" text-anchor="end">Today</text></svg><div class="c-tip" hidden></div></div>`;
}
function moveBarCursor(el, clientX) {
  const c = ui.charts[el.dataset.chart];
  if (!c) return;
  const box = el.getBoundingClientRect();
  const i = clamp(Math.floor((clientX - box.left) / (c.bw + c.gap)), 0, c.days.length - 1);
  const tip = el.querySelector('.c-tip');
  tip.hidden = false;
  tip.innerHTML = `<b>${c.vals[i] ? fmt(c.vals[i]) + (c.unit ? ' ' + c.unit : '') : 'Not logged'}</b><span>${chartDate(c.days[i])}</span>`;
  tip.style.left = `${clamp(i * (c.bw + c.gap) - tip.offsetWidth / 2, 0, c.W - tip.offsetWidth)}px`;
}

// Recent weeks, Monday at the top. Tap any square to open that day.
function heatmap(weeks = 14) {
  const end = today(), start = addDays(weekStart(end), -7 * (weeks - 1));
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const k = addDays(start, i);
    if (k > end) { cells += '<i class="h-off"></i>'; continue; }
    const trained = workoutsOn(k).length > 0;
    const logged = trained || peekDay(k).weight != null || dayTotals(k).items > 0;
    const full = questsFor(k).every(q => q.done) && logged;
    const kind = full ? 'h-full' : trained ? 'h-train' : logged ? 'h-log' : '';
    cells += `<button class="${kind}" data-a="dayOpen" data-k="${k}" aria-label="${niceDate(k)}"></button>`;
  }
  return `<div class="heat" style="--w:${weeks}">${cells}</div>`;
}
