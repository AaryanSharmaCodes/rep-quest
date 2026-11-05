'use strict';
// Sign in with Google and keep each person's data in their own account.
// The phone stays the working copy, so the app is just as fast and works offline. Changes upload a few seconds later.
// Firebase's REST APIs keep this small: its SDK leans on helper pages that iPhone Safari's storage rules can block.

// These identify the project and are safe to publish. The database rules are what keep each person's data private.
const FIREBASE = { apiKey: '', projectId: '', googleClientId: '' };

const Cloud = (() => {
  const AUTH_KEY = 'rq-auth', SYNC_KEY = 'rq-sync', NONCE_KEY = 'rq-nonce';
  const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* keeps working in memory */ } };

  let auth = read(AUTH_KEY);
  let sync = read(SYNC_KEY) || { pulled: false, chunks: {} };
  let status = 'idle', savedAt = null, pushTimer = null, pushing = false, pushAgain = false, lastPull = 0;

  const enabled = () => !!(FIREBASE.apiKey && FIREBASE.projectId && FIREBASE.googleClientId);
  const home = () => location.origin + location.pathname.replace(/index\.html$/, '');
  const dbUrl = () => `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
  const hash = text => { let h = 5381; for (let n = 0; n < text.length; n++) h = (h * 33 + text.charCodeAt(n)) | 0; return `${h}:${text.length}`; };

  function setStatus(next) {
    status = next;
    const el = document.getElementById('cloud-status');
    if (el) el.textContent = statusText();
  }
  function statusText() {
    if (status === 'loading') return 'Loading your data...';
    if (status === 'saving') return 'Saving...';
    if (status === 'offline') return 'Saved on this phone. Uploads when you have signal.';
    if (status === 'expired') return 'Please sign in again to keep saving.';
    return savedAt ? `Saved to your account at ${new Date(savedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : 'Saved to your account';
  }

  /* ---------- Signing in ---------- */
  function signIn() {
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    write(NONCE_KEY, nonce);
    flushSave();
    const q = new URLSearchParams({ client_id: FIREBASE.googleClientId, redirect_uri: home(), response_type: 'id_token', scope: 'openid email profile', nonce, prompt: 'select_account' });
    location.href = `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  const decodeJwt = t => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
  function keepAuth(data) {
    auth = { uid: data.uid, email: data.email ?? auth?.email, idToken: data.idToken, refreshToken: data.refreshToken, expiresAt: Date.now() + Number(data.expiresIn) * 1000 };
    write(AUTH_KEY, auth);
  }
  // Google comes back to the app with the sign-in in the address.
  async function finishSignIn() {
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.get('error')) {
      history.replaceState(null, '', home());
      if (params.get('error') !== 'access_denied') toast('Google sign-in did not work. Please try again.');
      return;
    }
    const token = params.get('id_token');
    if (!token) return;
    history.replaceState(null, '', home());
    const nonce = read(NONCE_KEY);
    write(NONCE_KEY, null);
    try {
      if (!nonce || decodeJwt(token).nonce !== nonce) throw new Error('nonce');
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE.apiKey}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(token)}&providerId=google.com`, requestUri: home(), returnSecureToken: true }),
      });
      if (!res.ok) throw new Error(`sign-in ${res.status}`);
      const d = await res.json();
      // Coming back after an expired sign-in as a different person must not mix their data.
      if (auth && auth.uid !== d.localId) { state = defaultState(); await writeSave(); }
      sync = { pulled: false, chunks: {} };
      write(SYNC_KEY, sync);
      keepAuth({ uid: d.localId, email: d.email, idToken: d.idToken, refreshToken: d.refreshToken, expiresIn: d.expiresIn });
      toast(`Signed in as ${d.email}`);
    } catch (e) {
      toast('Google sign-in did not work. Please try again.');
    }
  }
  async function token() {
    if (auth.expiresAt - 60000 > Date.now()) return auth.idToken;
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE.apiKey}`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refreshToken }),
    });
    if (res.status === 400 || res.status === 401 || res.status === 403) { const e = new Error('expired'); e.expired = true; throw e; }
    if (!res.ok) throw new Error(`token ${res.status}`);
    const d = await res.json();
    keepAuth({ uid: auth.uid, idToken: d.id_token, refreshToken: d.refresh_token, expiresIn: d.expires_in });
    return auth.idToken;
  }
  async function api(path, init = {}) {
    const res = await fetch(`${dbUrl()}${path}`, { ...init, headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' } });
    if (res.status === 401 || res.status === 403) { const e = new Error('expired'); e.expired = true; throw e; }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const e = new Error(`database ${res.status}`);
      e.conflict = body?.error?.status === 'FAILED_PRECONDITION' || body?.error?.status === 'ABORTED';
      throw e;
    }
    return res.json();
  }
  function failed(e) {
    if (e.expired) {
      setStatus('expired');
      if (ui.tab === 'you') render();
      return;
    }
    setStatus('offline');
  }

  /* ---------- Splitting the save into pieces ---------- */
  // One document holds at most 1 MB, so data is stored by month and only the months that changed get uploaded.
  function toChunks(s) {
    const { days = {}, workouts = [], ...meta } = s;
    const out = { meta };
    Object.keys(days).forEach(k => { (out[`days-${k.slice(0, 7)}`] = out[`days-${k.slice(0, 7)}`] || {})[k] = days[k]; });
    workouts.forEach(w => { (out[`workouts-${w.date.slice(0, 7)}`] = out[`workouts-${w.date.slice(0, 7)}`] || []).push(w); });
    return out;
  }
  function fromChunks(chunks) {
    const s = { ...chunks.meta, days: {}, workouts: [] };
    Object.entries(chunks).forEach(([key, value]) => {
      if (key.startsWith('days-')) Object.assign(s.days, value);
      if (key.startsWith('workouts-')) s.workouts.push(...(value || []));
    });
    s.workouts.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    return s;
  }
  function mergeEntries(a = [], b = []) {
    const ids = new Set(a.map(x => x.id));
    return [...a, ...b.filter(x => !ids.has(x.id))];
  }
  // Both sides changed the same month, usually two phones used offline: keep everything from both.
  function merge(key, local, remote) {
    if (key.startsWith('workouts-')) return mergeEntries(remote, local);
    if (key.startsWith('days-')) {
      const out = { ...remote };
      Object.entries(local).forEach(([date, day]) => {
        const other = out[date];
        if (!other) { out[date] = day; return; }
        const meals = { ...other.meals };
        Object.entries(day.meals || {}).forEach(([slot, list]) => { meals[slot] = mergeEntries(meals[slot], list); });
        out[date] = { ...other, ...day, meals };
      });
      return out;
    }
    // Settings and plan: a phone that hasn't been set up takes the account's, otherwise the newest wins,
    // and the very first sign-in keeps what's on this phone. A running workout is never dropped.
    const firstLink = !sync.chunks.meta;
    const chosen = !local.onboarded || !firstLink ? remote : local;
    return { ...chosen, active: local.active || chosen.active || null };
  }

  /* ---------- Download ---------- */
  async function pull() {
    if (!auth || Date.now() - lastPull < 30000) return;
    lastPull = Date.now();
    try {
      const docs = [];
      let pageToken = '';
      do {
        const page = await api(`/users/${auth.uid}/chunks?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`);
        docs.push(...(page.documents || []));
        pageToken = page.nextPageToken || '';
      } while (pageToken);
      // A workout may have been ticked while this was downloading, so start from the latest state.
      const local = toChunks(state);
      let changed = false;
      docs.forEach(doc => {
        const key = doc.name.split('/').pop();
        const text = doc.fields?.json?.stringValue;
        if (!text) return;
        const known = sync.chunks[key];
        // Compare contents rather than timestamps, so a phone with a wrong clock can't hide changes.
        if (known && known.h === hash(text)) { known.rev = doc.updateTime; return; }
        const remote = JSON.parse(text);
        const mine = local[key];
        const untouched = mine === undefined || (known && hash(JSON.stringify(mine)) === known.h);
        local[key] = untouched ? remote : merge(key, mine, remote);
        sync.chunks[key] = { h: hash(text), rev: doc.updateTime };
        changed = true;
      });
      sync.pulled = true;
      write(SYNC_KEY, sync);
      savedAt = savedAt || Date.now();
      setStatus('saved');
      if (changed) {
        const running = state.active;
        const next = migrate(fromChunks(local));
        if (running) next.active = running;
        state = next;
        applyTheme(state.settings.theme);
        writeSave();
        ui.enter = true;
        render();
      }
      changedSoon();
    } catch (e) {
      lastPull = 0;
      failed(e);
    }
  }

  /* ---------- Upload ---------- */
  function changedSoon() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 3000);
  }
  async function push() {
    clearTimeout(pushTimer);
    // Never upload an empty phone over an account we haven't read yet.
    if (!auth || !sync.pulled || !state.onboarded) return true;
    if (pushing) { pushAgain = true; return false; }
    const chunks = toChunks(state);
    const at = Date.now();
    const writes = [];
    const done = [];
    new Set([...Object.keys(chunks), ...Object.keys(sync.chunks)]).forEach(key => {
      const text = JSON.stringify(chunks[key] ?? (key.startsWith('workouts-') ? [] : {}));
      const h = hash(text);
      if (sync.chunks[key]?.h === h) return;
      done.push([key, h]);
      // Only overwrite the version this phone last read. If another phone got in first, this fails and the two are merged.
      const rev = sync.chunks[key]?.rev;
      writes.push({
        update: { name: `projects/${FIREBASE.projectId}/databases/(default)/documents/users/${auth.uid}/chunks/${key}`, fields: { json: { stringValue: text }, at: { integerValue: String(at) } } },
        currentDocument: rev ? { updateTime: rev } : { exists: false },
      });
    });
    if (!writes.length) return true;
    pushing = true;
    setStatus('saving');
    try {
      const body = JSON.stringify({ writes });
      // keepalive lets the upload finish as the app closes, but browsers cap it at 64 KB.
      const result = await api(':commit', { method: 'POST', body, keepalive: body.length < 60000 });
      done.forEach(([key, h], n) => { sync.chunks[key] = { h, rev: result.writeResults?.[n]?.updateTime || result.commitTime }; });
      write(SYNC_KEY, sync);
      savedAt = Date.now();
      setStatus('saved');
      return true;
    } catch (e) {
      if (e.conflict) {
        pushing = false;
        lastPull = 0;
        await pull(); // merges both sides, then uploads the result
        return false;
      }
      failed(e);
      return false;
    } finally {
      pushing = false;
      if (pushAgain) { pushAgain = false; changedSoon(); }
    }
  }

  async function signOut() {
    if (auth) {
      while (pushing) await new Promise(r => setTimeout(r, 100));
      if (!(await push())) return false;
    }
    auth = null;
    sync = { pulled: false, chunks: {} };
    write(AUTH_KEY, null);
    write(SYNC_KEY, null);
    state = defaultState();
    await writeSave();
    applyTheme(state.settings.theme);
    return true;
  }

  async function start() {
    if (!enabled()) return;
    await finishSignIn();
    if (!auth) return;
    if (!sync.pulled) setStatus('loading');
    render();
    await pull();
    addEventListener('online', () => { pull(); changedSoon(); });
  }

  return {
    enabled, signIn, signOut, start, pull, statusText,
    user: () => auth,
    expired: () => status === 'expired',
    changed() { if (auth) changedSoon(); },
    pushNow() { if (auth) push(); },
  };
})();
