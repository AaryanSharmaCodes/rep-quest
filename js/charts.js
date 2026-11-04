'use strict';
// Small hand-drawn charts. Text stays in ink colours; only marks carry colour. One axis per chart.
const chartWidth = () => clamp((document.documentElement.clientWidth || window.innerWidth || 375) - 40, 260, 640);

function niceTicks(lo, hi, count = 3) {
  const span = hi - lo || 1;
  const raw = span / (count - 1 || 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const start = Math.floor(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + step * 0.001; v += step) out.push(round(v, 3));
  return out;
}
const smoothPath = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');

// Line chart with optional raw dots behind a smoothed line. Touch and drag to read any day.
function lineChart({ id, points, height = 190, unit = '', decimals = 1, showRaw = false, lineKey = 'v', dashed = null, emptyText = 'Nothing logged yet.' }) {
  if (!points.length) return `<p class="empty">${esc(emptyText)}</p>`;
  const W = chartWidth(), H = height, padR = 34, padT = 10, padB = 22, padL = 2;
  const vals = points.flatMap(p => [p.v, p[lineKey]]).filter(v => v != null);
  if (dashed != null) vals.push(dashed);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.14, lo * 0.0025, 0.2);
  lo -= pad; hi += pad;
  const ticks = niceTicks(lo, hi, 3);
  const first = points[0].date, span = Math.max(daysBetween(first, points[points.length - 1].date), 1);
  const x = date => padL + (daysBetween(first, date) / span) * (W - padL - padR);
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const grid = ticks.filter(t => t >= lo && t <= hi).map(t => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="c-grid"/><text x="${W - padR + 6}" y="${y(t) + 4}" class="c-axis">${t}</text>`).join('');
  const line = smoothPath(points.map(p => [x(p.date), y(p[lineKey])]));
  const raw = showRaw ? points.map(p => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.2" class="c-dot"/>`).join('') : '';
  const single = points.length === 1 ? `<circle cx="${x(points[0].date)}" cy="${y(points[0].v)}" r="4" class="c-dot-on"/>` : '';
  const target = dashed != null ? `<line x1="${padL}" x2="${W - padR}" y1="${y(dashed)}" y2="${y(dashed)}" class="c-target"/>` : '';
  const labels = [points[0].date, points[points.length - 1].date];
  const xl = labels.map((d, i) => `<text x="${i ? W - padR : padL}" y="${H - 5}" class="c-axis" text-anchor="${i ? 'end' : 'start'}">${shortDate(d)}</text>`).join('');
  ui.charts[id] = { points, W, padL, padR, lineKey, unit, decimals, xy: points.map(p => [x(p.date), y(p[lineKey])]), H, padT, padB, first, span };
  return `<div class="chart" data-chart="${id}" style="height:${H}px">
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(id)} chart with ${points.length} readings">${grid}${target}${raw}<path d="${line}" class="c-line"/>${single}${xl}<g class="c-cursor" hidden><line class="c-cross" y1="${padT}" y2="${H - padB}"/><circle r="5" class="c-dot-on"/></g></svg>
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
  g.hidden = false;
  g.querySelector('line').setAttribute('x1', cx);
  g.querySelector('line').setAttribute('x2', cx);
  g.querySelector('circle').setAttribute('cx', cx);
  g.querySelector('circle').setAttribute('cy', cy);
  tip.hidden = false;
  const main = round(p[c.lineKey], c.decimals);
  const rawNote = c.lineKey !== 'v' && p.v != null ? `<span>scale ${round(p.v, 1)}</span>` : '';
  tip.innerHTML = `<b>${main}${c.unit ? ' ' + c.unit : ''}</b>${rawNote}<span>${shortDate(p.date)}</span>`;
  const tw = tip.offsetWidth;
  tip.style.left = `${clamp(cx - tw / 2, 0, c.W - tw)}px`;
}
function hideCursor(el) {
  el.querySelector('.c-cursor')?.setAttribute('hidden', '');
  const tip = el.querySelector('.c-tip');
  if (tip) tip.hidden = true;
}

// Daily bars with a target line. Today is brighter so it reads as still in progress.
function barChart({ id, days, get, target, color = 'var(--chalk)', height = 120, unit = '' }) {
  const W = chartWidth(), H = height, padB = 20, padT = 8, padR = 34;
  const vals = days.map(d => get(d) || 0);
  const peak = Math.max(...vals, target || 0, 1) * 1.08;
  const y = v => padT + (1 - v / peak) * (H - padT - padB);
  const gap = 2, bw = Math.max(2, (W - padR - gap * (days.length - 1)) / days.length);
  const bars = days.map((d, i) => {
    const v = vals[i], bx = i * (bw + gap);
    if (!v) return `<rect x="${bx}" y="${H - padB - 2}" width="${bw}" height="2" class="c-nil" data-i="${i}"/>`;
    const top = y(v), h = H - padB - top, r = Math.min(4, bw / 2);
    return `<path d="M${bx} ${H - padB}V${top + r}Q${bx} ${top} ${bx + r} ${top}H${bx + bw - r}Q${bx + bw} ${top} ${bx + bw} ${top + r}V${H - padB}Z" fill="${color}" opacity="${d === today() ? 1 : 0.72}"/>`;
  }).join('');
  const line = target ? `<line x1="0" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}" class="c-target"/><text x="${W - padR + 6}" y="${y(target) + 4}" class="c-axis">${fmt(target)}</text>` : '';
  ui.charts[id] = { bars: true, days, vals, unit, bw, gap, W, padR };
  return `<div class="chart" data-chart="${id}" style="height:${H}px"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(id)} bars">${bars}${line}
    <text x="0" y="${H - 5}" class="c-axis">${shortDate(days[0])}</text><text x="${W - padR}" y="${H - 5}" class="c-axis" text-anchor="end">Today</text></svg><div class="c-tip" hidden></div></div>`;
}
function moveBarCursor(el, clientX) {
  const c = ui.charts[el.dataset.chart];
  const box = el.getBoundingClientRect();
  const i = clamp(Math.floor((clientX - box.left) / (c.bw + c.gap)), 0, c.days.length - 1);
  const tip = el.querySelector('.c-tip');
  tip.hidden = false;
  tip.innerHTML = `<b>${c.vals[i] ? fmt(c.vals[i]) + (c.unit ? ' ' + c.unit : '') : 'Not logged'}</b><span>${shortDate(c.days[i])}</span>`;
  tip.style.left = `${clamp(i * (c.bw + c.gap) - tip.offsetWidth / 2, 0, c.W - tip.offsetWidth)}px`;
}

// 18 weeks of training days, like a contribution graph. Red is trained, grey is any other logged day.
function heatmap(weeks = 18) {
  const end = today(), start = addDays(weekStart(end), -7 * (weeks - 1));
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const k = addDays(start, i);
    if (k > end) { cells += '<i class="h-off"></i>'; continue; }
    const trained = workoutsOn(k).length > 0;
    const logged = trained || peekDay(k).weight != null || dayTotals(k).items > 0;
    const full = platesFor(k).every(p => p.done) && logged;
    cells += `<i class="${full ? 'h-full' : trained ? 'h-train' : logged ? 'h-log' : ''}" title="${shortDate(k)}"></i>`;
  }
  return `<div class="heat" style="--w:${weeks}">${cells}</div>`;
}

// The hero: a loaded barbell seen from the side. Plates drop on as the day's jobs get done.
function barbellSVG(plates, justLoaded = []) {
  const W = chartWidth(), H = 96, mid = H / 2, cx = W / 2;
  const on = plates.filter(p => p.done);
  const thick = 13, gap = 2;
  const sleeveStart = cx * 0.26;
  const draw = (side) => on.map((p, i) => {
    const offset = sleeveStart + i * (thick + gap);
    const x = side < 0 ? cx - offset - thick : cx + offset;
    const fresh = justLoaded.includes(p.id);
    return `<rect class="plate${fresh ? ' drop' : ''}" x="${x}" y="${mid - p.h / 2}" width="${thick}" height="${p.h}" rx="2.5" fill="${p.color}" style="--from:${side * 26}px"/>`;
  }).join('');
  const sleeveEnd = sleeveStart + 5 * (thick + gap) + 10;
  return `<svg class="bar-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Barbell with ${on.length} of 5 plates loaded">
    <rect x="${cx - sleeveStart}" y="${mid - 2.5}" width="${sleeveStart * 2}" height="5" rx="1" fill="#74767d"/>
    <rect x="${cx - sleeveEnd}" y="${mid - 4.5}" width="${sleeveEnd - sleeveStart}" height="9" rx="2" fill="#a2a4aa"/>
    <rect x="${cx + sleeveStart}" y="${mid - 4.5}" width="${sleeveEnd - sleeveStart}" height="9" rx="2" fill="#a2a4aa"/>
    <rect x="${cx - sleeveStart - 3}" y="${mid - 9}" width="3" height="18" rx="1" fill="#a2a4aa"/><rect x="${cx + sleeveStart}" y="${mid - 9}" width="3" height="18" rx="1" fill="#a2a4aa"/>
    ${draw(-1)}${draw(1)}</svg>`;
}
