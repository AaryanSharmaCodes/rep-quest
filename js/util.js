'use strict';

const pad = n => String(n).padStart(2, '0');
// Local dates on purpose: toISOString() is UTC and would roll over at 5:30 am in India.
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
const today = () => dateKey();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const round = (n, p = 0) => { const f = 10 ** p; return Math.round(n * f) / f; };
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const fmt = n => Math.round(n).toLocaleString('en-IN');
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sum = a => a.reduce((x, y) => x + y, 0);
const clone = o => JSON.parse(JSON.stringify(o));
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const weekStart = k => { const d = parseKey(k); return addDays(k, -((d.getDay() + 6) % 7)); };
function niceDate(k) {
  if (k === today()) return 'Today';
  if (k === addDays(today(), -1)) return 'Yesterday';
  return parseKey(k).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
const shortDate = k => parseKey(k).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const signed = (n, p = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(round(n, p))}`;
