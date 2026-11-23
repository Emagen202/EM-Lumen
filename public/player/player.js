// EM Lumen — display player.
// Offline-first: the last good manifest and every media file are kept in the browser cache,
// the schedule is evaluated locally, and several watchdogs recover from any failure.
import { renderSlide, transitionKeyframes, EASING, installFonts, layoutStage, setTimeOffset } from '/shared/render.js';
import { resolvePlaylist, localParts, makeParts, slideDuration, slideTransition } from '/shared/schedule.js';

const PLAYER_VERSION = '1.0.0';
const MEDIA_CACHE = 'emtv-media-v1';
const qs = new URLSearchParams(location.search);
const PREVIEW = qs.get('preview') === '1';
const KEY = PREVIEW ? 'preview' : (location.pathname.split('/').filter(Boolean)[1] || qs.get('key') || '');
const STORE_KEY = `emtv.manifest.${KEY}`;
const OFFSET_KEY = 'emtv.timeOffset';

const $ = (id) => document.getElementById(id);
const viewport = $('viewport'), layers = $('layers'), overlay = $('overlay'), dot = $('status-dot'), info = $('info');

const state = {
  manifest: null,        // the manifest currently playing
  pending: null,         // a newer manifest whose media is still downloading
  current: null,         // { slide, view, layer, startedAt, duration }
  timer: null,
  lastAdvance: Date.now(),
  expectedNext: Date.now() + 60e3,
  online: navigator.onLine,
  lastFetchOk: 0,
  cache: { total: 0, cached: 0, syncing: false },
  errors: [],
  bootAt: Date.now(),
  timeOffset: Number(localStorage.getItem(OFFSET_KEY)) || 0,
  idle: false,
  etag: null,
  lastReloadDay: localStorage.getItem('emtv.lastReloadDay') || '',
};
setTimeOffset(state.timeOffset);

const now = () => new Date(Date.now() + state.timeOffset);
const settings = () => state.manifest?.settings || {};
const tz = () => settings().timezone || 'Asia/Jerusalem';

function logError(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  state.errors.push(line);
  if (state.errors.length > 30) state.errors.shift();
  console.warn('[player]', msg);
}

// ------------------------------------------------------------------ Layout / scaling
function fit() {
  const c = settings().canvas || { width: 1920, height: 1080 };
  const W = window.innerWidth, H = window.innerHeight;
  const s = Math.min(W / c.width, H / c.height);
  viewport.style.width = `${c.width}px`;
  viewport.style.height = `${c.height}px`;
  viewport.style.transform = `translate(${(W - c.width * s) / 2}px, ${(H - c.height * s) / 2}px) scale(${s})`;
}
window.addEventListener('resize', fit);

// ------------------------------------------------------------------ Storage
function saveManifest(m) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(m)); } catch (e) { logError('localStorage save failed ' + e.message); }
  if (self.caches) caches.open('emtv-data').then(c => c.put(`/__emtv/manifest/${KEY}`, new Response(JSON.stringify(m), { headers: { 'Content-Type': 'application/json' } }))).catch(() => {});
}
async function loadSavedManifest() {
  try { const s = localStorage.getItem(STORE_KEY); if (s) return JSON.parse(s); } catch {}
  try {
    if (self.caches) { const r = await (await caches.open('emtv-data')).match(`/__emtv/manifest/${KEY}`); if (r) return await r.json(); }
  } catch {}
  return null;
}

function assetUrls(m) {
  const urls = new Set();
  for (const a of Object.values(m.assets || {})) if (a?.url) urls.add(a.url);
  for (const f of m.fonts || []) urls.add(f.url);
  if (m.settings?.idleLogo) urls.add(m.settings.idleLogo);
  return [...urls];
}

/** Download every media file of manifest `m` into the cache. Returns true when all are cached. */
async function syncAssets(m) {
  if (!self.caches || PREVIEW) return true;
  const cache = await caches.open(MEDIA_CACHE);
  const urls = assetUrls(m);
  state.cache = { total: urls.length, cached: 0, syncing: true };
  let ok = true;
  for (const url of urls) {
    if (await cache.match(url)) { state.cache.cached++; continue; }
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      try {
        let r;
        try { r = await fetch(url, { cache: 'no-store', mode: 'cors' }); }
        catch (corsErr) {
          // Cross-origin media without CORS headers: keep an opaque copy (images still work offline).
          if (new URL(url, location.href).origin === location.origin) throw corsErr;
          r = await fetch(url, { cache: 'no-store', mode: 'no-cors' });
          logError(`asset ${url} cached without CORS (opaque)`);
        }
        if (!r.ok && r.type !== 'opaque') throw new Error(`HTTP ${r.status}`);
        await cache.put(url, r);
        done = true; state.cache.cached++;
      } catch (e) {
        logError(`asset ${url} attempt ${attempt + 1}: ${e.message}`);
        await sleep(1500 * (attempt + 1));
      }
    }
    if (!done) ok = false;
  }
  state.cache.syncing = false;
  return ok;
}

async function pruneMedia() {
  if (!self.caches || PREVIEW) return;
  try {
    const keep = new Set([...(state.manifest ? assetUrls(state.manifest) : []), ...(state.pending ? assetUrls(state.pending) : [])].map(u => new URL(u, location.href).href));
    const cache = await caches.open(MEDIA_CACHE);
    for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
  } catch (e) { logError('prune ' + e.message); }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ Network
async function fetchManifest() {
  const url = PREVIEW ? '/api/preview-manifest' : `/api/player/${encodeURIComponent(KEY)}/manifest`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const headers = {};
    if (state.etag && state.manifest && !PREVIEW) headers['If-None-Match'] = state.etag;
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal, headers, credentials: 'same-origin' });
    if (r.headers.get('X-EMTV-Offline')) { markOnline(false); return state.manifest ? null : await r.json(); }
    if (r.status === 503) throw new Error('offline');
    const st = Number(r.headers.get('X-Server-Time'));
    if (st) updateOffset(st);
    if (r.status === 304) { markOnline(true); return null; }
    if (r.status === 404) { markOnline(true); showSystem('unknown'); return null; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const m = await r.json();
    state.etag = r.headers.get('ETag');
    markOnline(true);
    return m;
  } catch (e) {
    markOnline(false);
    if (e.name !== 'AbortError') logError('manifest fetch: ' + e.message);
    return null;
  } finally { clearTimeout(t); }
}

function updateOffset(serverTime) {
  const off = serverTime - Date.now();
  // Only correct meaningful drift (network latency makes small values noisy)
  state.timeOffset = Math.abs(off) > 3000 ? off : 0;
  setTimeOffset(state.timeOffset);
  try { localStorage.setItem(OFFSET_KEY, String(state.timeOffset)); } catch {}
}

function markOnline(ok) {
  state.online = ok;
  if (ok) state.lastFetchOk = Date.now();
  updateDot();
}

function updateDot() {
  dot.hidden = !settings().showStatusDot;
  dot.className = state.online ? (state.errors.length > 10 ? 'error' : 'ok') : 'offline';
}

let applying = false;
async function refresh() {
  if (applying) return;
  applying = true;
  try {
    const m = await fetchManifest();
    if (m) await applyManifest(m);
  } finally { applying = false; }
}

async function applyManifest(m) {
  const cur = state.manifest;
  if (cur && cur.version === m.version) {
    // Same content — refresh live parts (settings, alert, holidays) immediately.
    const settingsChanged = JSON.stringify(cur.settings) !== JSON.stringify(m.settings);
    state.manifest = { ...cur, settings: m.settings, alert: m.alert, holidays: m.holidays, screen: m.screen };
    saveManifest(state.manifest);
    renderAlert(); updateDot();
    if (settingsChanged) { fit(); if (state.idle) advance(); }
    return;
  }
  if (!cur) {
    // First run: play immediately, cache in the background.
    adopt(m);
    syncAssets(m).then(pruneMedia);
    return;
  }
  state.pending = m;
  const ok = await syncAssets(m);
  if (state.pending !== m) return; // superseded by a newer manifest
  if (ok) {
    state.pending = null;
    adopt(m);
    pruneMedia();
  } else {
    logError('media sync incomplete — keeping previous content until next attempt');
  }
}

function adopt(m) {
  const first = !state.manifest;
  state.manifest = m;
  saveManifest(m);
  installFonts(m.fonts || []);
  fit(); renderAlert(); updateDot();
  connectEvents();
  if (first || state.idle || !state.current) advance();
  // Otherwise the new content starts at the next slide change (smooth, no interruption).
}

// ------------------------------------------------------------------ Playback
function currentParts() {
  const at = PREVIEW && qs.get('at');
  if (at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at)) {
    const [d, t] = at.split('T'); const [h, mi] = t.split(':').map(Number);
    return makeParts(d, h * 60 + mi);
  }
  return localParts(now(), tz());
}

function playlist() {
  const m = state.manifest;
  if (!m) return { mode: 'idle', slides: [], categories: [] };
  if (PREVIEW && qs.get('slide')) {
    const s = m.slides.find(x => String(x.id) === qs.get('slide'));
    return { mode: 'normal', slides: s ? [s] : [], categories: [] };
  }
  if (PREVIEW && qs.get('category')) {
    const slides = m.slides.filter(x => String(x.categoryId) === qs.get('category')).sort((a, b) => a.sort - b.sort);
    return { mode: 'normal', slides, categories: [] };
  }
  const screenId = PREVIEW ? Number(qs.get('screen') || 0) : m.screen?.id;
  return resolvePlaylist(m, currentParts(), { screenId });
}

function pickNext(slides) {
  if (!slides.length) return null;
  const curId = state.current?.slide?.id;
  const i = slides.findIndex(s => s.id === curId);
  return slides[(i + 1) % slides.length] || slides[0];
}

function slideSeconds(slide) {
  const s = settings();
  let d = slideDuration(slide, s);
  if (slide.useVideoLength) {
    const durs = [];
    for (const el of slide.elements || []) if (el.type === 'video' && el.assetId) durs.push(Number(state.manifest.assets?.[el.assetId]?.duration) || 0);
    if (slide.background?.type === 'video') durs.push(Number(state.manifest.assets?.[slide.background.assetId]?.duration) || 0);
    const max = Math.max(0, ...durs);
    if (max > 0) d = Math.max(max, 1);
  }
  return d;
}

let advancing = false;
async function advance() {
  if (advancing) return;
  advancing = true;
  clearTimeout(state.timer);
  try {
    const pl = playlist();
    if (!pl.slides.length) {
      showIdle();
      // Keep the stall watchdog informed, otherwise an idle screen counts as "stalled" and reloads every ~2 minutes.
      state.lastAdvance = Date.now(); state.expectedNext = Date.now() + 10000;
      state.timer = setTimeout(advance, 10000);
      return;
    }
    const slide = pickNext(pl.slides);
    const sameSingle = pl.slides.length === 1 && state.current && state.current.slide.id === slide.id && state.current.version === state.manifest.version && !state.idle;
    const seconds = slideSeconds(slide);
    if (sameSingle) {
      // One slide only: keep it on screen without re-running the transition.
      schedule(seconds, slide);
      return;
    }
    await show(slide, seconds);
    schedule(seconds, slide);
  } catch (e) {
    logError('advance: ' + (e?.stack || e));
    state.timer = setTimeout(advance, 5000);
  } finally { advancing = false; }
}

function schedule(seconds, slide) {
  clearTimeout(state.timer);
  state.lastAdvance = Date.now();
  state.expectedNext = Date.now() + seconds * 1000;
  state.timer = setTimeout(advance, seconds * 1000);
  // If "use video length" and the asset duration was unknown, advance when the video ends.
  if (slide.useVideoLength && state.current?.view) {
    for (const v of state.current.view.videos()) {
      v.loop = false;
      v.addEventListener('ended', () => { if (state.current?.slide.id === slide.id) advance(); }, { once: true });
    }
  }
}

async function show(slide, seconds) {
  const m = state.manifest;
  const view = renderSlide(slide, { assets: m.assets || {}, settings: m.settings || {}, mode: 'player' });
  const layer = document.createElement('div');
  layer.className = 'layer';
  layer.style.opacity = '0';
  layer.appendChild(view.stage);
  layers.appendChild(layer);
  for (const v of view.videos()) {
    v.addEventListener('error', () => { logError(`video error on slide ${slide.id}`); if (state.current?.slide.id === slide.id) setTimeout(advance, 1500); }, { once: true });
  }
  await view.ready;
  layoutStage(view.stage);
  const prev = state.current;
  const tr = slideTransition(slide, m.settings || {});
  const kf = transitionKeyframes(tr.type);
  const dur = Math.max(0, Number(tr.duration) || 0);
  layer.style.opacity = '';
  view.start(seconds);
  hideSystem();
  state.idle = false;
  state.current = { slide, view, layer, version: m.version, startedAt: Date.now(), duration: seconds };
  if (kf && dur > 0 && prev) {
    const opts = { duration: dur, easing: EASING, fill: 'both' };
    const aIn = layer.animate(kf.in, opts);
    const aOut = prev.layer.animate(kf.out, opts);
    await Promise.race([Promise.all([aIn.finished, aOut.finished]).catch(() => {}), sleep(dur + 500)]);
    aIn.cancel?.();
  } else if (kf && dur > 0 && !prev) {
    await Promise.race([layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: EASING }).finished.catch(() => {}), sleep(dur + 500)]);
  }
  if (prev) { prev.view.destroy(); prev.layer.remove(); }
  // Safety: never let stray layers accumulate
  while (layers.children.length > 2) layers.firstElementChild.remove();
}

// ------------------------------------------------------------------ System screens (idle / connecting / unknown screen)
function showIdle() {
  if (state.current) { state.current.view.destroy(); state.current.layer.remove(); state.current = null; }
  state.idle = true;
  showSystem('idle');
}

let sysTimer = null;
function showSystem(kind) {
  hideSystem();
  const s = settings();
  const el = document.createElement('div');
  el.className = 'sys-screen';
  el.id = 'sys';
  el.style.background = s.idleBackground || '#0b2545';
  if (kind === 'idle') {
    if (s.idleLogo) { const img = document.createElement('img'); img.src = s.idleLogo; img.alt = ''; el.appendChild(img); }
    else { const o = document.createElement('div'); o.className = 'org'; o.textContent = s.orgName || 'Eitan Medical'; el.appendChild(o); }
    const c = document.createElement('div'); c.className = 'clock';
    const d = document.createElement('div'); d.className = 'date';
    el.append(c, d);
    const tick = () => {
      try {
        c.textContent = new Intl.DateTimeFormat('he-IL', { timeZone: tz(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now());
        d.textContent = new Intl.DateTimeFormat('he-IL', { timeZone: tz(), weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now());
      } catch { c.textContent = now().toLocaleTimeString(); }
    };
    tick(); sysTimer = setInterval(tick, 1000);
  } else {
    const sp = document.createElement('div'); sp.className = 'spinner';
    const msg = document.createElement('div'); msg.className = 'msg';
    msg.textContent = kind === 'unknown'
      ? 'המסך אינו רשום במערכת. יש להוסיף אותו בממשק הניהול (מסכים).\nThis screen is not registered.'
      : 'מתחבר לשרת התוכן…\nConnecting to the content server…';
    msg.style.whiteSpace = 'pre-line';
    const code = document.createElement('div'); code.className = 'code'; code.textContent = `screen: ${KEY || '(none)'} · v${PLAYER_VERSION}`;
    el.append(sp, msg, code);
  }
  document.body.appendChild(el);
}
function hideSystem() { clearInterval(sysTimer); $('sys')?.remove(); }

// ------------------------------------------------------------------ Alerts
function renderAlert() {
  overlay.textContent = '';
  const a = state.manifest?.alert;
  if (!a?.active || (a.until && a.until < now().getTime())) return;
  const box = document.createElement('div');
  box.className = `emtv-alert ${a.style || 'banner'} ${a.level || 'info'}`;
  const he = document.createElement('span'); he.textContent = a.text_he || ''; he.dir = 'rtl';
  const en = document.createElement('span'); en.className = 'alert-en'; en.textContent = a.text_en || ''; en.dir = 'ltr';
  if (a.style === 'ticker') {
    const track = document.createElement('div'); track.className = 'alert-track';
    const t = [a.text_he, a.text_en].filter(Boolean).join('   •   ');
    track.textContent = Array(6).fill(t).join('      •      ');
    box.appendChild(track);
  } else {
    box.appendChild(he);
    if (a.text_en) box.appendChild(en);
  }
  overlay.appendChild(box);
}

// ------------------------------------------------------------------ Heartbeat, live updates, watchdogs
async function heartbeat() {
  if (PREVIEW) return;
  const cur = state.current;
  const body = {
    playerVersion: PLAYER_VERSION, version: state.manifest?.version || 0, pendingVersion: state.pending?.version || null,
    slideId: cur?.slide?.id || null, slideName: cur?.slide?.name || null, categoryId: cur?.slide?.categoryId || null,
    idle: state.idle, cache: state.cache, resolution: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
    uptime: Math.round((Date.now() - state.bootAt) / 1000), errors: state.errors.slice(-5), ua: navigator.userAgent,
    lastOnline: state.lastFetchOk, sw: !!navigator.serviceWorker?.controller, timeOffset: state.timeOffset,
  };
  try {
    const r = await fetch(`/api/player/${encodeURIComponent(KEY)}/heartbeat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout?.(10000) });
    if (r.ok) {
      const j = await r.json();
      markOnline(true);
      if (j.command === 'reload') reload('remote command');
    }
  } catch { markOnline(false); }
}

let eventsStarted = false;
function connectEvents() {
  if (PREVIEW || !window.EventSource || eventsStarted || settings().realtime === false) return;
  eventsStarted = true;
  let es;
  const open = () => {
    try { es?.close(); } catch {}
    es = new EventSource(`/api/player/${encodeURIComponent(KEY)}/events`);
    es.addEventListener('update', () => refresh());
    es.addEventListener('command', (e) => { try { if (JSON.parse(e.data).command === 'reload') reload('remote command'); } catch {} });
    es.addEventListener('hello', () => markOnline(true));
    es.onerror = () => { /* EventSource reconnects by itself; polling covers the gap */ };
  };
  open();
  // Recreate the stream every 30 minutes to survive silent proxy timeouts.
  setInterval(open, 30 * 60e3);
}

function reload(reason) {
  logError('reload: ' + reason);
  try { localStorage.setItem('emtv.lastReload', `${new Date().toISOString()} ${reason}`); } catch {}
  location.reload();
}

function watchdogs() {
  // 1. Playback stall detector
  setInterval(() => {
    if (!state.manifest) return;
    const late = Date.now() - state.expectedNext;
    if (late > 30000) {
      logError(`playback stalled (${Math.round(late / 1000)}s late) — restarting loop`);
      advancing = false;
      advance();
    }
    if (late > 120000) reload('playback stalled');
  }, 10000);

  // 2. Schedule watcher: switch immediately when the active category changes (e.g. Memorial Day siren at 20:00)
  setInterval(() => {
    if (!state.manifest || advancing) return;
    const pl = playlist();
    if (state.idle && pl.slides.length) return advance();
    if (state.current && !pl.slides.some(s => s.id === state.current.slide.id)) advance();
    renderAlert();
  }, 5000);

  // 3. Daily reload (memory hygiene) at the configured local time
  setInterval(() => {
    const t = settings().dailyReload;
    if (!t || PREVIEW) return;
    const p = localParts(now(), tz());
    const [h, m] = t.split(':').map(Number);
    if (p.minutes === h * 60 + m && state.lastReloadDay !== p.date && Date.now() - state.bootAt > 10 * 60e3) {
      state.lastReloadDay = p.date;
      try { localStorage.setItem('emtv.lastReloadDay', p.date); } catch {}
      reload('daily');
    }
  }, 30000);

  // 4. Memory guard (Chromium only)
  setInterval(() => {
    const mem = performance.memory;
    if (mem && mem.usedJSHeapSize > mem.jsHeapSizeLimit * 0.8) reload('memory');
  }, 60000);

  // 5. Error storm guard
  let errCount = 0;
  const onErr = (msg) => {
    logError(String(msg));
    if (++errCount > 25) reload('error storm');
  };
  setInterval(() => { errCount = 0; }, 10 * 60e3);
  window.addEventListener('error', (e) => onErr(e.message || 'error'));
  window.addEventListener('unhandledrejection', (e) => onErr(e.reason?.message || e.reason || 'rejection'));
}

function infoOverlay() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'i' || e.key === 'I') {
      info.hidden = !info.hidden;
      if (!info.hidden) {
        const upd = () => {
          if (info.hidden) return;
          const c = state.current;
          info.textContent = [
            `EM Lumen player v${PLAYER_VERSION}`, `screen: ${state.manifest?.screen?.name || KEY}`, `content version: ${state.manifest?.version ?? '-'}${state.pending ? ` (downloading v${state.pending.version})` : ''}`,
            `online: ${state.online}  sw: ${!!navigator.serviceWorker?.controller}`, `cache: ${state.cache.cached}/${state.cache.total}${state.cache.syncing ? ' syncing' : ''}`,
            `slide: ${c ? `${c.slide.id} ${c.slide.name}` : state.idle ? 'idle' : '-'}`, `time offset: ${state.timeOffset}ms`, `errors: ${state.errors.length}`,
            ...state.errors.slice(-3),
          ].join('\n');
          setTimeout(upd, 1000);
        };
        upd();
      }
    }
    if (e.key === 'r' && e.ctrlKey && e.shiftKey) reload('manual');
  });
}

// ------------------------------------------------------------------ Boot
async function boot() {
  fit();
  if (!PREVIEW && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/player/sw.js', { scope: '/player/' }).catch(e => logError('sw register: ' + e.message));
    navigator.storage?.persist?.().catch(() => {});
  }
  if ('wakeLock' in navigator) {
    const lock = () => navigator.wakeLock.request('screen').catch(() => {});
    lock(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lock(); });
  }
  if (!KEY) { showSystem('unknown'); return; }

  const saved = PREVIEW ? null : await loadSavedManifest();
  if (saved) adopt(saved);
  else showSystem('connecting');

  await refresh();
  if (!state.manifest) {
    // No network and nothing cached yet — keep trying.
    const retry = setInterval(async () => { await refresh(); if (state.manifest) clearInterval(retry); }, 10000);
  }
  const poll = () => setTimeout(async () => { await refresh(); poll(); }, (settings().pollSeconds || 60) * 1000);
  poll();
  if (!PREVIEW) {
    const hb = () => setTimeout(async () => { await heartbeat(); hb(); }, (settings().heartbeatSeconds || 30) * 1000);
    heartbeat(); hb();
    window.addEventListener('online', () => { markOnline(true); refresh(); heartbeat(); });
    window.addEventListener('offline', () => markOnline(false));
    // Retry an incomplete media download every 2 minutes.
    setInterval(() => { if (state.pending && !state.cache.syncing) applyManifest(state.pending); }, 120000);
  }
  watchdogs();
  infoOverlay();
}

boot().catch(e => { logError('boot: ' + (e?.stack || e)); setTimeout(() => location.reload(), 15000); });
