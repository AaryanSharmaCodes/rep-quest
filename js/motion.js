'use strict';
// Every animation in one place. Only transform and opacity move, so the browser can run them off the main thread,
// and effects clean up after themselves. Respects the Animations switch and the phone's Reduce Motion setting.
const Motion = (() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const on = () => !reduced.matches && state.settings?.animations !== false;
  // Real spring physics (from Motion), run by the browser's own animation engine so a busy page can't stutter them.
  const canSpring = !!window.MotionLib && CSS.supports('transition-timing-function', 'linear(0, 1)');
  const springs = {};
  function curve(bounce, dur) {
    const key = `${bounce}/${dur}`;
    if (springs[key]) return springs[key];
    let out = { t: dur * 1000 * 1.4, e: bounce > 0.1 ? 'cubic-bezier(.2, 1.3, .4, 1)' : 'cubic-bezier(.2, .8, .3, 1)' };
    if (canSpring) {
      try {
        const hit = String(MotionLib.spring(dur, bounce)).match(/^(\d+(?:\.\d+)?)ms (linear\(.+\))$/);
        if (hit) out = { t: Number(hit[1]), e: hit[2] };
      } catch (err) { /* the fallback curve above still animates */ }
    }
    springs[key] = out;
    return out;
  }
  const sp = (el, frames, { bounce = 0.2, dur = 0.35, delay = 0, fill = 'none' } = {}) => {
    const c = curve(bounce, dur);
    return el.animate(frames, { duration: c.t, easing: c.e, delay, fill });
  };
  const OUT = curve(0, 0.4).e;
  // The same curves for the stylesheet.
  const root = document.documentElement.style;
  [['soft', 0.12, 0.42], ['bouncy', 0.34, 0.42], ['press', 0.45, 0.32]].forEach(([name, bounce, dur]) => {
    const c = curve(bounce, dur);
    root.setProperty(`--${name}-e`, c.e);
    root.setProperty(`--${name}-t`, `${Math.round(c.t)}ms`);
  });
  const theme = () => THEMES.find(t => t.id === document.documentElement.dataset.theme) || THEMES[0];
  const fxLayer = () => document.getElementById('fx');
  const queue = [];
  let fire = null;

  /* ---------- Confetti ---------- */
  function burst(x, y, opts = {}) {
    if (!on() || !window.confetti) return;
    if (!fire) {
      const canvas = document.createElement('canvas');
      canvas.className = 'fx-canvas';
      fxLayer().appendChild(canvas);
      fire = confetti.create(canvas, { resize: true, useWorker: true, disableForReducedMotion: true });
    }
    const t = theme();
    fire({
      particleCount: Math.round((opts.count || 14) * t.burst), spread: opts.spread || 70, startVelocity: opts.velocity || 22, ticks: opts.ticks || 70,
      gravity: opts.gravity ?? 0.9, scalar: opts.scalar || 0.8, angle: opts.angle ?? 90, colors: opts.colors || t.fx, shapes: t.shapes,
      origin: { x: x / innerWidth, y: y / innerHeight },
    });
  }
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  /* ---------- Small pieces ---------- */
  function pop(el, big = 1.18) {
    if (on() && el) sp(el, [{ transform: `scale(${1 + (big - 1) * 1.6})` }, { transform: 'scale(1)' }], { bounce: 0.5, dur: 0.3 });
  }
  function piece(cls, x, y, text = '') {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    fxLayer().appendChild(el);
    return el;
  }
  function ring(x, y) {
    const el = piece('fx-ring', x, y);
    el.animate([{ transform: 'translate(-50%, -50%) scale(.2)', opacity: 0.9 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 }], { duration: 420, easing: OUT }).onfinish = () => el.remove();
  }
  function float(text, x, y, big = false) {
    const el = piece(`fx-float${big ? ' big' : ''}`, clamp(x, 70, innerWidth - 70), y, text);
    el.animate([
      { transform: 'translate(-50%, 6px) scale(.7)', opacity: 0 },
      { transform: 'translate(-50%, -14px) scale(1.06)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, -22px) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%, -48px) scale(1)', opacity: 0 },
    ], { duration: big ? 1200 : 900, easing: 'ease-out' }).onfinish = () => el.remove();
  }
  function sweep(card) {
    const wrap = document.createElement('span');
    wrap.className = 'fx-sweep';
    wrap.innerHTML = '<i></i>';
    card.appendChild(wrap);
    wrap.firstChild.animate([{ transform: 'translateX(-110%) skewX(-18deg)' }, { transform: 'translateX(320%) skewX(-18deg)' }], { duration: 650, easing: 'ease-out' }).onfinish = () => wrap.remove();
  }

  /* ---------- Bars and numbers move from where they were ---------- */
  function syncBars(root, entering) {
    root.querySelectorAll('[data-k][data-pct]').forEach(el => {
      const cur = Number(el.dataset.pct), prev = entering ? 0 : ui.bars[el.dataset.k];
      ui.bars[el.dataset.k] = cur;
      if (prev == null || prev === cur || cur <= 0) return;
      el.animate([{ transform: `scaleX(${prev / cur})` }, { transform: 'scaleX(1)' }], { duration: entering ? 620 : 420, easing: OUT, delay: entering ? 120 : 0, fill: 'backwards' });
    });
  }
  function syncNumbers(root, entering) {
    root.querySelectorAll('[data-count][data-k]').forEach(el => {
      const end = Number(el.dataset.count), start = entering ? 0 : ui.nums[el.dataset.k];
      ui.nums[el.dataset.k] = end;
      if (start == null || start === end) return;
      const t0 = performance.now(), dur = 520;
      el.textContent = fmt(start);
      const step = now => {
        if (!el.isConnected) return;
        const p = Math.min((now - t0) / dur, 1), eased = 1 - (1 - p) ** 3;
        el.textContent = fmt(start + (end - start) * eased);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- Fluid updates ---------- */
  // Changes only what actually changed, so focus, scroll and running animations survive, then glides anything that moved.
  const nodeKey = n => (n.getAttribute && n.getAttribute('data-key')) || n.id;
  function flipRects(host) {
    const out = new Map();
    host.querySelectorAll('[data-flip]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom > -200 && r.top < innerHeight + 200) out.set(el.getAttribute('data-key'), r);
    });
    return out;
  }
  function flipPlay(host, before) {
    host.querySelectorAll('[data-flip]').forEach(el => {
      const r = el.getBoundingClientRect(), old = before.get(el.getAttribute('data-key'));
      if (r.bottom < 0 || r.top > innerHeight) return;
      if (!old) {
        if (before.size) sp(el, [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { bounce: 0.2, dur: 0.34 });
        return;
      }
      const dx = old.left - r.left, dy = old.top - r.top;
      if (Math.abs(dx) + Math.abs(dy) > 1) sp(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { bounce: 0.16, dur: 0.42 });
    });
  }
  function morph(host, html) {
    const before = on() ? flipRects(host) : null;
    morphdom(host, `<div>${html}</div>`, {
      childrenOnly: true,
      getNodeKey: nodeKey,
      onBeforeElUpdated(from, to) {
        if (from === document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(from.tagName)) return false;
        // Sliding selectors keep their position, so the next change slides from it.
        if (from.classList.contains('seg') || from.classList.contains('dstrip')) {
          to.style.cssText = from.style.cssText;
          if (from.classList.contains('ready')) to.classList.add('ready');
        }
        return !from.isEqualNode(to);
      },
      onBeforeNodeDiscarded: n => !(n.classList && n.classList.contains('fx-sweep')),
    });
    syncThumbs(host);
    if (before) flipPlay(host, before);
  }
  // A pill that slides between options, like iOS segmented controls.
  function syncThumbs(host) {
    host.querySelectorAll('.seg, .dstrip').forEach(box => {
      const onEl = box.querySelector(':scope > .on');
      if (!onEl) { box.style.setProperty('--tw', '0px'); return; }
      box.style.setProperty('--tx', `${onEl.offsetLeft}px`);
      box.style.setProperty('--tw', `${onEl.offsetWidth}px`);
      if (!box.classList.contains('ready')) requestAnimationFrame(() => box.classList.add('ready'));
    });
  }

  /* ---------- Title bar that appears as the big title scrolls away ---------- */
  let titleWatch = null, watched = null;
  function watchTitle(app) {
    const bar = document.getElementById('navbar');
    const title = app.querySelector('.top h1, .datebar h1');
    if (!title) { bar.classList.remove('show'); titleWatch?.disconnect(); watched = null; return; }
    bar.firstElementChild.textContent = title.textContent;
    if (title === watched) return;
    titleWatch?.disconnect();
    watched = title;
    titleWatch = new IntersectionObserver(([e]) => bar.classList.toggle('show', !e.isIntersecting), { rootMargin: '-44px 0px 0px 0px' });
    titleWatch.observe(title);
  }

  /* ---------- Drag a sheet down to dismiss it ---------- */
  function dragSheets() {
    const host = document.getElementById('sheet');
    let panel = null, startY = 0, lastY = 0, lastT = 0, speed = 0, dragging = false;
    host.addEventListener('touchstart', e => {
      panel = e.target.closest('.panel');
      if (!panel || e.touches.length > 1 || e.target.closest('input, textarea, select, .chart, .opts, .scrollx')) { panel = null; return; }
      startY = lastY = e.touches[0].clientY;
      lastT = e.timeStamp;
      speed = 0;
      dragging = false;
    }, { passive: true });
    host.addEventListener('touchmove', e => {
      if (!panel) return;
      const y = e.touches[0].clientY, dy = y - startY;
      if (!dragging) {
        if (dy < -6 || (dy > 6 && panel.scrollTop > 0)) { panel = null; return; }
        if (dy > 6) dragging = true; else return;
      }
      e.preventDefault();
      speed = (y - lastY) / Math.max(e.timeStamp - lastT, 1);
      lastY = y;
      lastT = e.timeStamp;
      panel.style.transform = `translateY(${Math.max(dy, 0)}px)`;
      const scrim = host.querySelector('.scrim');
      if (scrim) scrim.style.opacity = String(clamp(1 - dy / panel.offsetHeight, 0, 1));
    }, { passive: false });
    const end = e => {
      if (!panel || !dragging) { panel = null; return; }
      const dy = lastY - startY, p = panel;
      panel = null;
      dragging = false;
      // A flick only counts if the finger was still moving as it lifted.
      const flicked = speed > 0.55 && e.timeStamp - lastT < 80;
      if (dy > Math.min(140, p.offsetHeight * 0.3) || flicked) { closeAll(); return; }
      p.style.transform = '';
      const scrim = host.querySelector('.scrim');
      if (scrim) scrim.style.opacity = '';
      if (on()) sp(p, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { bounce: 0.22, dur: 0.38 });
    };
    host.addEventListener('touchend', end, { passive: true });
    host.addEventListener('touchcancel', end, { passive: true });
  }
  document.addEventListener('DOMContentLoaded', dragSheets);

  /* ---------- Page entrance ---------- */
  const LISTS = '.quests, .plan-list, .rows, .advice';
  function enter(app) {
    [...app.children].slice(0, 8).forEach((el, n) => el.style.setProperty('--i', n));
    app.querySelectorAll(LISTS).forEach(list => [...list.children].slice(0, 9).forEach((el, n) => el.style.setProperty('--j', n)));
    app.classList.add('enter');
    clearTimeout(enter.timer);
    enter.timer = setTimeout(() => app.classList.remove('enter'), 950);
  }

  return {
    pop, burst, morph,
    refresh() {
      document.documentElement.dataset.motion = on() ? 'on' : 'off';
    },
    after(fn) { queue.push(fn); },
    afterRender(app, entering) {
      const live = on();
      if (entering && live) enter(app);
      if (live) { syncBars(app, entering); syncNumbers(app, entering); } else {
        app.querySelectorAll('[data-k][data-pct]').forEach(el => { ui.bars[el.dataset.k] = Number(el.dataset.pct); });
        app.querySelectorAll('[data-count][data-k]').forEach(el => { ui.nums[el.dataset.k] = Number(el.dataset.count); });
      }
      syncThumbs(app);
      watchTitle(app);
      const panel = document.querySelector('#sheet .panel');
      if (panel) syncThumbs(panel);
      if (panel && live) { syncBars(panel, false); syncNumbers(panel, !!panel.querySelector('.done-num')); }
      const jobs = queue.splice(0);
      if (jobs.length) requestAnimationFrame(() => jobs.forEach(fn => fn()));
    },
    tabFrom(a, b) {
      const order = TAB_LIST.map(t => t[0]);
      document.getElementById('app').style.setProperty('--dx', `${order.indexOf(b) > order.indexOf(a) ? 16 : -16}px`);
      if (!on()) return;
      const icon = document.querySelector(`#tabs [data-tab="${b}"] .ic`);
      if (icon) sp(icon, [{ transform: 'translateY(-5px) scale(.78)' }, { transform: 'none' }], { bounce: 0.55, dur: 0.36 });
    },
    stagger(selector) {
      if (!on()) return;
      [...document.querySelectorAll(selector)].slice(0, 9).forEach((el, n) => el.animate([{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: n * 28, easing: OUT, fill: 'backwards' }));
    },
    closeSheet(host, done) {
      const panel = host.querySelector('.panel'), scrim = host.querySelector('.scrim');
      if (!on() || !panel) { done(); return; }
      if (host.dataset.closing) return;
      host.dataset.closing = '1';
      host.style.pointerEvents = 'none';
      const from = getComputedStyle(panel).transform;
      const startFade = scrim ? Number(getComputedStyle(scrim).opacity) : 1;
      panel.style.transform = '';
      if (scrim) scrim.style.opacity = '';
      scrim?.animate([{ opacity: startFade }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
      sp(panel, [{ transform: from === 'none' ? 'translateY(0)' : from }, { transform: 'translateY(100%)' }], { bounce: 0, dur: 0.24, fill: 'forwards' }).onfinish = () => {
        host.style.pointerEvents = '';
        delete host.dataset.closing;
        done();
      };
    },
    // Moving between sheets slides like a navigation push.
    sheetPush(panel, back) {
      if (on()) [...panel.children].slice(0, 6).forEach(el => sp(el, [{ transform: `translateX(${back ? -26 : 26}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { bounce: 0.1, dur: 0.3 }));
    },

    /* ---------- Moments ---------- */
    setDone(i, j, { finished, best, beat, text }) {
      if (!on()) return;
      const btn = document.querySelector(`.tick[data-i="${i}"][data-j="${j}"]`);
      if (!btn) return;
      const [x, y] = center(btn);
      sp(btn, [{ transform: 'scale(.6)' }, { transform: 'none' }], { bounce: 0.6, dur: 0.38 });
      const row = btn.closest('tr');
      if (row) [...row.querySelectorAll('input')].forEach((el, n) => sp(el, [{ transform: 'translateY(-5px)' }, { transform: 'none' }], { bounce: 0.5, dur: 0.3, delay: n * 30 }));
      ring(x, y);
      burst(x, y, { count: best ? 34 : 12, velocity: best ? 26 : 15, spread: best ? 110 : 80, ticks: best ? 90 : 46, scalar: 0.7 });
      float(best ? 'New best!' : beat ? 'Beat last time!' : text, x - 44, y - 16, best);
      if (finished) {
        const card = btn.closest('.ex');
        if (card) {
          sweep(card);
          sp(card, [{ transform: 'scale(1.025)' }, { transform: 'none' }], { bounce: 0.45, dur: 0.42 });
          const r = card.getBoundingClientRect();
          burst(r.left + r.width / 2, Math.max(r.top + 34, 70), { count: 30, spread: 130, velocity: 24, ticks: 80 });
          setTimeout(() => float('Exercise done', innerWidth / 2, Math.max(r.top + 30, 90), true), 90);
        }
      }
    },
    questCleared(allClear) {
      if (!on()) return;
      const el = document.querySelector('.quest.fresh');
      if (!el) return;
      const [x, y] = center(el);
      burst(x, y, { count: 20, spread: 100, velocity: 20 });
      if (allClear) {
        const big = document.querySelector('.all-clear');
        if (big) sp(big, [{ transform: 'scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { bounce: 0.45, dur: 0.46 });
        setTimeout(() => { burst(innerWidth * 0.1, innerHeight * 0.5, { angle: 60, count: 44, velocity: 42, spread: 60, ticks: 110 }); burst(innerWidth * 0.9, innerHeight * 0.5, { angle: 120, count: 44, velocity: 42, spread: 60, ticks: 110 }); }, 160);
      }
    },
    workoutDone(bests) {
      if (!on()) return;
      burst(0, innerHeight * 0.7, { angle: 58, count: 60, velocity: 52, spread: 58, ticks: 130 });
      burst(innerWidth, innerHeight * 0.7, { angle: 122, count: 60, velocity: 52, spread: 58, ticks: 130 });
      if (bests) setTimeout(() => burst(innerWidth / 2, innerHeight * 0.32, { count: 60, spread: 360, velocity: 24, ticks: 110, scalar: 1 }), 380);
      this.stagger('#sheet .tally > div, #sheet .prs > li');
    },
    checkLevel(level) {
      const seen = state.settings.levelSeen;
      if (seen === level) return;
      state.settings.levelSeen = level;
      scheduleSave();
      if (seen == null || level < seen || !on()) return;
      const el = document.createElement('div');
      el.className = 'fx-level';
      el.innerHTML = `<span class="level fx-badge"><b>${level}</b><span>Level</span></span><strong>Level up</strong>`;
      fxLayer().appendChild(el);
      const a = sp(el.firstChild, [{ transform: 'scale(.2) rotate(-40deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { bounce: 0.5, dur: 0.5 });
      el.lastChild.animate([{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, delay: 260, easing: OUT, fill: 'backwards' });
      a.onfinish = () => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 1000, fill: 'forwards' }).onfinish = () => el.remove();
      burst(innerWidth / 2, innerHeight * 0.42, { count: 70, spread: 360, velocity: 30, ticks: 120, scalar: 1 });
      playBest();
      haptic();
    },
    foodAdded(btn, kcal) {
      if (!on()) return;
      const [x, y] = center(btn);
      sp(btn, [{ transform: 'rotate(-120deg) scale(.7)' }, { transform: 'none' }], { bounce: 0.5, dur: 0.4 });
      ring(x, y);
      burst(x, y, { count: 8, velocity: 13, spread: 90, ticks: 36, scalar: 0.6 });
      float(`+${fmt(kcal)} kcal`, x - 40, y - 12);
    },
    floatMid(text) {
      if (!on()) return;
      float(text, innerWidth / 2, innerHeight * 0.4, true);
      burst(innerWidth / 2, innerHeight * 0.42, { count: 16, spread: 120, velocity: 18, ticks: 56 });
    },
    switchTheme(id, btn) {
      if (state.settings.theme === id) return;
      const change = () => { state.settings.theme = id; applyTheme(id); scheduleSave(); render(); };
      haptic();
      if (!on() || !document.startViewTransition) { change(); return; }
      const [x, y] = center(btn);
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const vt = document.startViewTransition(change);
      vt.ready.then(() => document.documentElement.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 520, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' },
      )).catch(() => {});
    },
  };
})();
