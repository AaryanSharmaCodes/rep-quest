'use strict';
// Every animation in one place. Only transform and opacity move, so the browser can run them off the main thread,
// and effects clean up after themselves. Respects the Animations switch and the phone's Reduce Motion setting.
const Motion = (() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const on = () => !reduced.matches && state.settings?.animations !== false;
  const SPRING = 'cubic-bezier(.2, 1.4, .4, 1)', OUT = 'cubic-bezier(.2, .8, .3, 1)';
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
    if (on() && el) el.animate([{ transform: 'scale(1)' }, { transform: `scale(${big})` }, { transform: 'scale(1)' }], { duration: 260, easing: SPRING });
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
    pop, burst,
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
      const panel = document.querySelector('#sheet .panel');
      if (panel && live) { syncBars(panel, false); syncNumbers(panel, !!panel.querySelector('.done-num')); }
      const jobs = queue.splice(0);
      if (jobs.length) requestAnimationFrame(() => jobs.forEach(fn => fn()));
    },
    tabFrom(a, b) {
      const order = TAB_LIST.map(t => t[0]);
      document.getElementById('app').style.setProperty('--dx', `${order.indexOf(b) > order.indexOf(a) ? 16 : -16}px`);
      if (!on()) return;
      const icon = document.querySelector(`#tabs [data-tab="${b}"] .ic`);
      if (icon) icon.animate([{ transform: 'scale(1)' }, { transform: 'translateY(-4px) scale(1.2)' }, { transform: 'scale(1)' }], { duration: 340, easing: SPRING });
    },
    stagger(selector) {
      if (!on()) return;
      [...document.querySelectorAll(selector)].slice(0, 9).forEach((el, n) => el.animate([{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: n * 28, easing: OUT, fill: 'backwards' }));
    },
    closeSheet(host, done) {
      const panel = host.querySelector('.panel'), scrim = host.querySelector('.scrim');
      if (!on() || !panel) { done(); return; }
      host.style.pointerEvents = 'none';
      const finish = done;
      done = () => { host.style.pointerEvents = ''; finish(); };
      scrim?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, fill: 'forwards' });
      panel.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).onfinish = done;
    },

    /* ---------- Moments ---------- */
    setDone(i, j, { finished, best, beat, text }) {
      if (!on()) return;
      const btn = document.querySelector(`.tick[data-i="${i}"][data-j="${j}"]`);
      if (!btn) return;
      const [x, y] = center(btn);
      btn.animate([{ transform: 'scale(.55) rotate(-14deg)' }, { transform: 'scale(1.28) rotate(5deg)', offset: 0.55 }, { transform: 'none' }], { duration: 360, easing: 'ease-out' });
      const row = btn.closest('tr');
      if (row) [...row.querySelectorAll('input')].forEach((el, n) => el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }], { duration: 240, delay: n * 34, easing: SPRING }));
      ring(x, y);
      burst(x, y, { count: best ? 34 : 12, velocity: best ? 26 : 15, spread: best ? 110 : 80, ticks: best ? 90 : 46, scalar: 0.7 });
      float(best ? 'New best!' : beat ? 'Beat last time!' : text, x - 44, y - 16, best);
      if (finished) {
        const card = btn.closest('.ex');
        if (card) {
          sweep(card);
          card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.018)' }, { transform: 'scale(1)' }], { duration: 380, easing: SPRING });
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
        if (big) big.animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1.06)', opacity: 1, offset: 0.65 }, { transform: 'none' }], { duration: 520, easing: 'ease-out' });
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
      const a = el.firstChild.animate([{ transform: 'scale(.2) rotate(-40deg)', opacity: 0 }, { transform: 'scale(1.3) rotate(6deg)', opacity: 1, offset: 0.55 }, { transform: 'scale(1)', opacity: 1 }], { duration: 560, easing: 'ease-out' });
      el.lastChild.animate([{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, delay: 260, easing: OUT, fill: 'backwards' });
      a.onfinish = () => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 1000, fill: 'forwards' }).onfinish = () => el.remove();
      burst(innerWidth / 2, innerHeight * 0.42, { count: 70, spread: 360, velocity: 30, ticks: 120, scalar: 1 });
      playBest();
      haptic();
    },
    foodAdded(btn, kcal) {
      if (!on()) return;
      const [x, y] = center(btn);
      btn.animate([{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(180deg) scale(1.3)' }, { transform: 'rotate(360deg) scale(1)' }], { duration: 400, easing: 'ease-out' });
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
