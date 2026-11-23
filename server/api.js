import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { config } from './config.js';
import { db, audit, markDirty, getAllSettings, setSetting, setSettingStmt, getSetting, DEFAULT_SETTINGS, newScreenKey, housekeeping, exportAll } from './db.js';
import { json, send, readJson, HttpError, clientIp, serveFile } from './http.js';
import { getUser, requireRole, ROLE_LEVEL } from './auth.js';
import { buildManifest, publish, playerManifest, rowToAsset, rowToCategory, rowToSlide, playerSettings } from './manifest.js';
import { holidayList, holidaysForManifest } from './holidays.js';
import { isBlob, isBlobUrl, deleteMedia, handleBlobUpload } from './storage.js';
import { log } from './log.js';

const viewer = requireRole('viewer');
const editor = requireRole('editor');
const admin = requireRole('admin');
const now = () => Date.now();
const str = (v, max = 500) => (v == null ? '' : String(v)).slice(0, max);
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const bool = (v) => (v ? 1 : 0);
const jsonStr = (v, d) => JSON.stringify(v ?? d);

// ------------------------------------------------------------------ SSE hub (on-prem only; on Vercel players poll)
const playerStreams = new Map(); // screenId -> Set<res>
export function notifyPlayers(event, data = {}, screenId = null) {
  if (!config.realtime) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [sid, set] of playerStreams) {
    if (screenId && sid !== screenId) continue;
    for (const res of set) { try { res.write(msg); } catch {} }
  }
}
export function startRealtimePing() {
  setInterval(() => {
    for (const set of playerStreams.values()) for (const res of set) { try { res.write(': ping\n\n'); } catch {} }
  }, 25000).unref();
}

async function screenByKey(key) {
  const s = await db.get('SELECT * FROM screens WHERE key = ?', String(key || ''));
  if (!s) throw new HttpError(404, 'Unknown screen');
  return s;
}

function screenOut(s, heartbeatSeconds) {
  let status = {}; try { status = JSON.parse(s.status); } catch {}
  return {
    id: s.id, name: s.name, key: s.key, notes: s.notes, lastSeen: s.last_seen, lastIp: s.last_ip, status,
    online: !!s.last_seen && now() - s.last_seen < heartbeatSeconds * 3000, connected: (playerStreams.get(s.id)?.size || 0) > 0,
    url: `${config.baseUrl}/player/${s.key}`, pendingCommand: s.command, createdAt: s.created_at,
  };
}
const HB = () => (config.realtime ? 30 : 60);

async function publishStatus() {
  const last = await db.get('SELECT version, created_at, created_by FROM publications ORDER BY version DESC LIMIT 1');
  const changedAt = (await getSetting('contentChangedAt')) || 0;
  return { version: last?.version || 0, publishedAt: last?.created_at || null, publishedBy: last?.created_by || null, changedAt, hasChanges: !last || changedAt > last.created_at };
}

// ------------------------------------------------------------------ Sanitizers
const TRANSITIONS = ['none', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom-in', 'zoom-out', 'blur', 'wipe', 'flip', 'cube', 'dissolve'];
function cleanTransition(t) {
  if (!t || typeof t !== 'object') return {};
  const out = {};
  if (t.type && TRANSITIONS.includes(t.type)) out.type = t.type;
  if (t.duration != null) out.duration = Math.min(5000, Math.max(0, int(t.duration, 1200)));
  return out;
}
function cleanRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.slice(0, 50).map(r => ({
    type: ['always', 'dateRange', 'weekly', 'yearly', 'holiday', 'dates'].includes(r?.type) ? r.type : 'always',
    startDate: str(r.startDate, 10), endDate: str(r.endDate, 10),
    month: int(r.month, 0), day: int(r.day, 0), endMonth: int(r.endMonth, 0), endDay: int(r.endDay, 0),
    days: Array.isArray(r.days) ? r.days.map(d => int(d)).filter(d => d >= 0 && d <= 6) : [],
    dates: Array.isArray(r.dates) ? r.dates.map(d => str(d, 10)).slice(0, 366) : [],
    startTime: str(r.startTime, 5), endTime: str(r.endTime, 5),
    holiday: str(r.holiday, 40), fromEve: !!r.fromEve, extraDays: Math.max(0, Math.min(30, int(r.extraDays, 0))),
    exclude: !!r.exclude,
  }));
}
function cleanElements(els) {
  if (!Array.isArray(els)) return [];
  return els.slice(0, 200).map(e => (e && typeof e === 'object' ? JSON.parse(JSON.stringify(e)) : null)).filter(Boolean);
}
function cleanSchedule(s) {
  if (!s || typeof s !== 'object') return {};
  return { rules: cleanRules(s.rules || []) };
}

// ------------------------------------------------------------------ Uploads
const UPLOAD_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
function classify(name, requestedKind) {
  let ext = path.extname(name).toLowerCase();
  if (ext === '.jpeg') ext = '.jpg';
  const mime = UPLOAD_TYPES[ext];
  if (!mime) throw new HttpError(415, 'Unsupported file type');
  let kind = str(requestedKind || 'media', 10);
  if (mime.startsWith('font/')) kind = 'font';
  else if (!['media', 'logo'].includes(kind)) kind = 'media';
  return { ext, mime, kind };
}

async function insertAsset({ kind, name, filename, url, mime, size, meta, user }) {
  const baseName = kind === 'font' ? name.replace(/\.[^.]+$/, '') : name;
  const id = await db.insert('INSERT INTO assets (kind, name, filename, url, mime, size, width, height, duration, tags, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [kind, baseName, filename, url || null, mime, size, int(meta.width) || null, int(meta.height) || null, Number(meta.duration) || null, str(meta.tags, 200), now(), user.email]);
  await audit(user.email, 'asset.upload', { id, name, kind, size });
  if (kind === 'font') await markDirty();
  return rowToAsset(await db.get('SELECT * FROM assets WHERE id = ?', id));
}

/** On-prem: stream the request body to the media folder. */
async function handleLocalUpload(req, res, url) {
  const u = await editor(req);
  if (isBlob()) throw new HttpError(400, 'This server stores media in Vercel Blob — use the blob upload flow');
  const name = str(url.searchParams.get('name') || 'file', 200);
  const { ext, mime, kind } = classify(name, url.searchParams.get('kind'));
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > config.maxUploadBytes) throw new HttpError(413, 'File too large');
  let meta = {};
  try { meta = JSON.parse(decodeURIComponent(req.headers['x-asset-meta'] || '%7B%7D')); } catch {}

  const tmp = path.join(config.tmpDir, crypto.randomBytes(8).toString('hex'));
  const hash = crypto.createHash('sha256');
  let size = 0;
  const counter = new Transform({
    transform(chunk, _e, cb) {
      size += chunk.length;
      if (size > config.maxUploadBytes) return cb(new HttpError(413, 'File too large'));
      hash.update(chunk); cb(null, chunk);
    },
  });
  try {
    await pipeline(req, counter, fs.createWriteStream(tmp));
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e instanceof HttpError ? e : new HttpError(400, 'Upload failed');
  }
  if (!size) { fs.rmSync(tmp, { force: true }); throw new HttpError(400, 'Empty file'); }
  const filename = hash.digest('hex').slice(0, 32) + ext;
  const dest = path.join(config.mediaDir, filename);
  if (fs.existsSync(dest)) fs.rmSync(tmp, { force: true });
  else fs.renameSync(tmp, dest);
  json(res, await insertAsset({ kind, name, filename, mime, size, meta, user: u }), 201);
}

async function assetUsage(id) {
  const used = [];
  for (const s of await db.all('SELECT id, name, category_id, background, elements FROM slides')) {
    let hit = false;
    try { if (Number(JSON.parse(s.background).assetId) === id) hit = true; } catch {}
    try { if (JSON.parse(s.elements).some(e => Number(e.assetId) === id)) hit = true; } catch {}
    if (hit) used.push({ id: s.id, name: s.name, categoryId: s.category_id });
  }
  return used;
}

// ------------------------------------------------------------------ Routes
export function registerApi(r) {
  // ---------- Player (public, key-authenticated) ----------
  r.get('/api/player/:key/manifest', async (req, res, { params }) => {
    const s = await screenByKey(params.key);
    const m = await playerManifest(s);
    const serverTime = m.serverTime; delete m.serverTime;
    const body = JSON.stringify(m);
    const etag = `"${crypto.createHash('sha1').update(body).digest('base64url')}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache', 'X-Server-Time': String(serverTime) }); return res.end(); }
    send(res, 200, body.slice(0, -1) + `,"serverTime":${serverTime}}`, { 'Content-Type': 'application/json; charset=utf-8', ETag: etag, 'Cache-Control': 'no-cache', 'X-Server-Time': String(serverTime) });
  });

  r.get('/api/player/:key/events', async (req, res, { params }) => {
    const s = await screenByKey(params.key);
    if (!config.realtime) { res.writeHead(204, { 'Cache-Control': 'no-store' }); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`retry: 5000\nevent: hello\ndata: ${JSON.stringify({ serverTime: now() })}\n\n`);
    if (!playerStreams.has(s.id)) playerStreams.set(s.id, new Set());
    playerStreams.get(s.id).add(res);
    req.on('close', () => playerStreams.get(s.id)?.delete(res));
  });

  // Used by the kiosk watchdog on the screen PC to detect a frozen/crashed browser page.
  r.get('/api/player/:key/status', async (req, res, { params }) => {
    const s = await screenByKey(params.key);
    json(res, { ok: true, lastSeen: s.last_seen, ageSeconds: s.last_seen ? Math.round((now() - s.last_seen) / 1000) : null, serverTime: now() });
  });

  r.post('/api/player/:key/heartbeat', async (req, res, { params }) => {
    const s = await screenByKey(params.key);
    const body = await readJson(req);
    const status = JSON.stringify(body).length < 20000 ? body : {};
    await db.run('UPDATE screens SET last_seen = ?, last_ip = ?, status = ?, command = NULL WHERE id = ?', now(), clientIp(req), JSON.stringify(status), s.id);
    json(res, { ok: true, command: s.command || null, serverTime: now() });
  });

  // ---------- Session ----------
  r.get('/api/me', async (req, res) => {
    const u = await getUser(req);
    if (!u) return json(res, { error: 'unauthenticated' }, 401);
    json(res, { ...u, level: ROLE_LEVEL[u.role] });
  });
  r.patch('/api/me', async (req, res) => {
    const u = await viewer(req);
    const b = await readJson(req);
    if (['he', 'en'].includes(b.lang)) await db.run('UPDATE users SET lang = ? WHERE id = ?', b.lang, u.id);
    json(res, { ok: true });
  });

  r.get('/api/meta', async (req, res) => {
    await viewer(req);
    const settings = await getAllSettings();
    json(res, {
      holidays: holidayList(), holidayDates: holidaysForManifest(), settings, playerSettings: await playerSettings(settings),
      transitions: TRANSITIONS, serverTime: now(), publish: await publishStatus(),
      auth: { oidc: config.oidcEnabled, local: config.localEnabled }, baseUrl: config.baseUrl,
      platform: { vercel: config.isVercel, db: db.dialect, media: config.mediaKind, realtime: config.realtime, maxUploadMB: Math.round(config.maxUploadBytes / 1048576) },
    });
  });

  // ---------- Categories ----------
  r.get('/api/categories', async (req, res) => {
    await viewer(req);
    const counts = Object.fromEntries((await db.all('SELECT category_id, COUNT(*) n, SUM(enabled) e FROM slides GROUP BY category_id')).map(x => [x.category_id, x]));
    json(res, (await db.all('SELECT * FROM categories ORDER BY sort, id')).map(c => ({ ...rowToCategory(c), slideCount: counts[c.id]?.n || 0, enabledCount: counts[c.id]?.e || 0 })));
  });
  r.post('/api/categories', async (req, res) => {
    const u = await editor(req); const b = await readJson(req);
    const sort = ((await db.get('SELECT MAX(sort) m FROM categories'))?.m || 0) + 1;
    const id = await db.insert('INSERT INTO categories (name_he, name_en, color, mode, priority, is_default, active, rules, screens, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [str(b.name_he || 'קטגוריה חדשה', 100), str(b.name_en, 100), str(b.color || '#0a6ebd', 20), b.mode === 'replace' ? 'replace' : 'merge', int(b.priority, 10), 0, 1, jsonStr(cleanRules(b.rules), []), jsonStr(b.screens, []), sort, now(), now()]);
    await audit(u.email, 'category.create', { id, name: b.name_he });
    await markDirty();
    json(res, rowToCategory(await db.get('SELECT * FROM categories WHERE id = ?', id)), 201);
  });
  r.patch('/api/categories/:id', async (req, res, { params }) => {
    const u = await editor(req); const b = await readJson(req); const id = int(params.id);
    const c = await db.get('SELECT * FROM categories WHERE id = ?', id);
    if (!c) throw new HttpError(404, 'Not found');
    const stmts = [];
    if (b.isDefault) stmts.push(['UPDATE categories SET is_default = 0', []]);
    stmts.push(['UPDATE categories SET name_he=?, name_en=?, color=?, mode=?, priority=?, is_default=?, active=?, rules=?, screens=?, updated_at=? WHERE id=?', [
      b.name_he != null ? str(b.name_he, 100) : c.name_he, b.name_en != null ? str(b.name_en, 100) : c.name_en,
      b.color != null ? str(b.color, 20) : c.color, b.mode != null ? (b.mode === 'replace' ? 'replace' : 'merge') : c.mode,
      b.priority != null ? int(b.priority) : c.priority, b.isDefault != null ? bool(b.isDefault) : c.is_default,
      b.active != null ? bool(b.active) : c.active, b.rules != null ? jsonStr(cleanRules(b.rules)) : c.rules,
      b.screens != null ? jsonStr((Array.isArray(b.screens) ? b.screens : []).map(Number)) : c.screens, now(), id]]);
    await db.batch(stmts);
    await audit(u.email, 'category.update', { id, name: b.name_he || c.name_he });
    await markDirty();
    json(res, rowToCategory(await db.get('SELECT * FROM categories WHERE id = ?', id)));
  });
  r.delete('/api/categories/:id', async (req, res, { params }) => {
    const u = await editor(req); const id = int(params.id);
    const c = await db.get('SELECT * FROM categories WHERE id = ?', id);
    if (!c) throw new HttpError(404, 'Not found');
    if (c.is_default) throw new HttpError(409, 'Cannot delete the default category');
    await db.batch([['DELETE FROM slides WHERE category_id = ?', [id]], ['DELETE FROM categories WHERE id = ?', [id]]]);
    await audit(u.email, 'category.delete', { id, name: c.name_he });
    await markDirty();
    json(res, { ok: true });
  });
  r.post('/api/categories/reorder', async (req, res) => {
    const u = await editor(req); const b = await readJson(req);
    await db.batch((b.ids || []).map((id, i) => ['UPDATE categories SET sort = ? WHERE id = ?', [i, int(id)]]));
    await audit(u.email, 'category.reorder'); await markDirty();
    json(res, { ok: true });
  });

  // ---------- Slides ----------
  r.get('/api/slides', async (req, res, { url }) => {
    await viewer(req);
    const cat = url.searchParams.get('category');
    const rows = cat ? await db.all('SELECT * FROM slides WHERE category_id = ? ORDER BY sort, id', int(cat)) : await db.all('SELECT * FROM slides ORDER BY category_id, sort, id');
    json(res, rows.map(rowToSlide));
  });
  r.get('/api/slides/:id', async (req, res, { params }) => {
    await viewer(req);
    const s = await db.get('SELECT * FROM slides WHERE id = ?', int(params.id));
    if (!s) throw new HttpError(404, 'Not found');
    json(res, rowToSlide(s));
  });
  r.post('/api/slides', async (req, res) => {
    const u = await editor(req); const b = await readJson(req);
    const cat = await db.get('SELECT id FROM categories WHERE id = ?', int(b.categoryId));
    if (!cat) throw new HttpError(400, 'Invalid category');
    const sort = ((await db.get('SELECT MAX(sort) m FROM slides WHERE category_id = ?', cat.id))?.m ?? -1) + 1;
    const dur = Number(b.duration) || (await getSetting('defaultDuration')) || 15;
    const id = await db.insert('INSERT INTO slides (category_id, sort, name, enabled, duration, use_video_length, transition, background, elements, schedule, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [cat.id, sort, str(b.name || 'שקופית חדשה', 120), 1, dur, bool(b.useVideoLength), jsonStr(cleanTransition(b.transition), {}), jsonStr(b.background, {}), jsonStr(cleanElements(b.elements), []), jsonStr(cleanSchedule(b.schedule), {}), now(), now(), u.email]);
    await audit(u.email, 'slide.create', { id, name: b.name });
    await markDirty();
    json(res, rowToSlide(await db.get('SELECT * FROM slides WHERE id = ?', id)), 201);
  });
  r.patch('/api/slides/:id', async (req, res, { params }) => {
    const u = await editor(req); const b = await readJson(req); const id = int(params.id);
    const s = await db.get('SELECT * FROM slides WHERE id = ?', id);
    if (!s) throw new HttpError(404, 'Not found');
    const minD = Number(await getSetting('minDuration')) || 1;
    await db.run('UPDATE slides SET category_id=?, name=?, enabled=?, duration=?, use_video_length=?, transition=?, background=?, elements=?, schedule=?, updated_at=?, updated_by=? WHERE id=?',
      b.categoryId != null ? int(b.categoryId) : s.category_id, b.name != null ? str(b.name, 120) : s.name,
      b.enabled != null ? bool(b.enabled) : s.enabled, b.duration != null ? Math.max(minD, Math.min(3600, Number(b.duration) || 15)) : s.duration,
      b.useVideoLength != null ? bool(b.useVideoLength) : s.use_video_length, b.transition != null ? jsonStr(cleanTransition(b.transition)) : s.transition,
      b.background != null ? jsonStr(b.background) : s.background, b.elements != null ? jsonStr(cleanElements(b.elements)) : s.elements,
      b.schedule != null ? jsonStr(cleanSchedule(b.schedule)) : s.schedule, now(), u.email, id);
    if (b._audit !== false) await audit(u.email, 'slide.update', { id, name: b.name || s.name });
    await markDirty();
    json(res, rowToSlide(await db.get('SELECT * FROM slides WHERE id = ?', id)));
  });
  r.delete('/api/slides/:id', async (req, res, { params }) => {
    const u = await editor(req); const id = int(params.id);
    const s = await db.get('SELECT name FROM slides WHERE id = ?', id);
    if (!s) throw new HttpError(404, 'Not found');
    await db.run('DELETE FROM slides WHERE id = ?', id);
    await audit(u.email, 'slide.delete', { id, name: s.name }); await markDirty();
    json(res, { ok: true });
  });
  r.post('/api/slides/:id/duplicate', async (req, res, { params }) => {
    const u = await editor(req); const b = await readJson(req);
    const s = await db.get('SELECT * FROM slides WHERE id = ?', int(params.id));
    if (!s) throw new HttpError(404, 'Not found');
    const catId = b.categoryId ? int(b.categoryId) : s.category_id;
    const same = catId === s.category_id;
    if (same) await db.run('UPDATE slides SET sort = sort + 1 WHERE category_id = ? AND sort > ?', catId, s.sort);
    const sort = same ? s.sort + 1 : ((await db.get('SELECT MAX(sort) m FROM slides WHERE category_id = ?', catId))?.m ?? -1) + 1;
    const id = await db.insert('INSERT INTO slides (category_id, sort, name, enabled, duration, use_video_length, transition, background, elements, schedule, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [catId, sort, str(s.name + (same ? ' (עותק)' : ''), 120), s.enabled, s.duration, s.use_video_length, s.transition, s.background, s.elements, s.schedule, now(), now(), u.email]);
    await audit(u.email, 'slide.duplicate', { from: s.id, id }); await markDirty();
    json(res, rowToSlide(await db.get('SELECT * FROM slides WHERE id = ?', id)), 201);
  });
  r.post('/api/slides/reorder', async (req, res) => {
    const u = await editor(req); const b = await readJson(req);
    await db.batch((b.ids || []).map((id, i) => ['UPDATE slides SET sort = ? WHERE id = ?', [i, int(id)]]));
    await audit(u.email, 'slide.reorder'); await markDirty();
    json(res, { ok: true });
  });

  // ---------- Assets ----------
  r.get('/api/assets', async (req, res, { url }) => {
    await viewer(req);
    const kind = url.searchParams.get('kind');
    const rows = kind ? await db.all('SELECT * FROM assets WHERE kind = ? ORDER BY created_at DESC', kind) : await db.all('SELECT * FROM assets ORDER BY created_at DESC');
    json(res, rows.map(rowToAsset));
  });
  r.put('/api/assets', (req, res, { url }) => handleLocalUpload(req, res, url));

  // Vercel Blob: token exchange for direct browser uploads (and Blob's completion callback).
  r.post('/api/blob/upload', async (req, res) => {
    if (!isBlob()) throw new HttpError(400, 'Blob storage is not enabled');
    const body = await readJson(req);
    if (body?.type !== 'blob.upload-completed') {
      // JSON-only endpoint: a cross-site form cannot send application/json without a CORS preflight.
      if (!(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'JSON required');
      await editor(req);
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(`${config.baseUrl}${req.url}`, { method: 'POST', headers });
    try {
      json(res, await handleBlobUpload({ body, request, authorize: () => editor(req) }));
    } catch (e) {
      log.warn('[blob] upload token error', e.message);
      throw e instanceof HttpError ? e : new HttpError(400, e.message);
    }
  });
  // Register a file the browser has just uploaded to Vercel Blob.
  r.post('/api/assets/register', async (req, res) => {
    const u = await editor(req); const b = await readJson(req);
    if (!isBlob()) throw new HttpError(400, 'Blob storage is not enabled');
    if (!isBlobUrl(b.url)) throw new HttpError(400, 'Invalid blob URL');
    const name = str(b.name || 'file', 200);
    const { mime, kind } = classify(name, b.kind);
    const pathname = str(b.pathname || new URL(b.url).pathname.slice(1), 400);
    json(res, await insertAsset({ kind, name, filename: pathname, url: b.url, mime: str(b.contentType || mime, 100), size: int(b.size), meta: b.meta || {}, user: u }), 201);
  });

  r.patch('/api/assets/:id', async (req, res, { params }) => {
    const u = await editor(req); const b = await readJson(req); const id = int(params.id);
    const a = await db.get('SELECT * FROM assets WHERE id = ?', id);
    if (!a) throw new HttpError(404, 'Not found');
    const kind = a.kind === 'font' ? 'font' : (['media', 'logo'].includes(b.kind) ? b.kind : a.kind);
    await db.run('UPDATE assets SET name=?, kind=?, tags=?, width=COALESCE(?, width), height=COALESCE(?, height), duration=COALESCE(?, duration) WHERE id=?',
      b.name != null ? str(b.name, 200) : a.name, kind, b.tags != null ? str(b.tags, 200) : a.tags, int(b.width) || null, int(b.height) || null, Number(b.duration) || null, id);
    await audit(u.email, 'asset.update', { id, name: b.name || a.name });
    if (a.kind === 'font') await markDirty();
    json(res, rowToAsset(await db.get('SELECT * FROM assets WHERE id = ?', id)));
  });
  r.get('/api/assets/:id/usage', async (req, res, { params }) => { await viewer(req); json(res, await assetUsage(int(params.id))); });
  r.delete('/api/assets/:id', async (req, res, { params, url }) => {
    const u = await editor(req); const id = int(params.id);
    const a = await db.get('SELECT * FROM assets WHERE id = ?', id);
    if (!a) throw new HttpError(404, 'Not found');
    const used = await assetUsage(id);
    if (used.length && url.searchParams.get('force') !== '1') return json(res, { error: 'in_use', used }, 409);
    await db.run('DELETE FROM assets WHERE id = ?', id);
    // Delete the file only when no other asset row points to it and no kept publication references it.
    const stillRef = await db.get('SELECT 1 x FROM assets WHERE filename = ?', a.filename);
    const inPub = await db.get('SELECT 1 x FROM publications WHERE manifest LIKE ? LIMIT 1', `%${a.filename}%`);
    if (!stillRef && !inPub) await deleteMedia(a);
    await audit(u.email, 'asset.delete', { id, name: a.name }); await markDirty();
    json(res, { ok: true });
  });

  // ---------- Screens ----------
  r.get('/api/screens', async (req, res) => { await viewer(req); json(res, (await db.all('SELECT * FROM screens ORDER BY id')).map(s => screenOut(s, HB()))); });
  r.post('/api/screens', async (req, res) => {
    const u = await admin(req); const b = await readJson(req);
    const id = await db.insert('INSERT INTO screens (name, key, notes, created_at) VALUES (?, ?, ?, ?)', [str(b.name || 'מסך חדש', 100), newScreenKey(), str(b.notes, 500), now()]);
    await audit(u.email, 'screen.create', { id, name: b.name });
    json(res, screenOut(await db.get('SELECT * FROM screens WHERE id = ?', id), HB()), 201);
  });
  r.patch('/api/screens/:id', async (req, res, { params }) => {
    const u = await admin(req); const b = await readJson(req); const id = int(params.id);
    const s = await db.get('SELECT * FROM screens WHERE id = ?', id);
    if (!s) throw new HttpError(404, 'Not found');
    await db.run('UPDATE screens SET name = ?, notes = ? WHERE id = ?', b.name != null ? str(b.name, 100) : s.name, b.notes != null ? str(b.notes, 500) : s.notes, id);
    await audit(u.email, 'screen.update', { id });
    json(res, screenOut(await db.get('SELECT * FROM screens WHERE id = ?', id), HB()));
  });
  r.delete('/api/screens/:id', async (req, res, { params }) => {
    const u = await admin(req); const id = int(params.id);
    await db.run('DELETE FROM screens WHERE id = ?', id);
    for (const res2 of playerStreams.get(id) || []) { try { res2.end(); } catch {} }
    playerStreams.delete(id);
    await audit(u.email, 'screen.delete', { id });
    json(res, { ok: true });
  });
  r.post('/api/screens/:id/reload', async (req, res, { params }) => {
    const u = await editor(req); const id = int(params.id);
    await db.run("UPDATE screens SET command = 'reload' WHERE id = ?", id);
    notifyPlayers('command', { command: 'reload' }, id);
    await audit(u.email, 'screen.reload', { id });
    json(res, { ok: true });
  });
  r.post('/api/screens/:id/rekey', async (req, res, { params }) => {
    const u = await admin(req); const id = int(params.id);
    await db.run('UPDATE screens SET key = ? WHERE id = ?', newScreenKey(), id);
    for (const res2 of playerStreams.get(id) || []) { try { res2.end(); } catch {} }
    await audit(u.email, 'screen.rekey', { id });
    json(res, screenOut(await db.get('SELECT * FROM screens WHERE id = ?', id), HB()));
  });

  // ---------- Publishing ----------
  r.get('/api/publish/status', async (req, res) => { await viewer(req); json(res, await publishStatus()); });
  r.get('/api/preview-manifest', async (req, res) => {
    await viewer(req);
    json(res, { version: 0, ...(await buildManifest()), settings: await playerSettings(), holidays: holidaysForManifest(), alert: { active: false }, screen: { id: 0, name: 'preview' }, serverTime: now() });
  });
  r.post('/api/publish', async (req, res) => {
    const u = await editor(req); const b = await readJson(req);
    const v = await publish(u.email, str(b.note, 300));
    await audit(u.email, 'publish', { version: v, note: b.note });
    notifyPlayers('update', { version: v });
    json(res, { ok: true, version: v, status: await publishStatus() });
  });
  r.get('/api/publications', async (req, res) => {
    await viewer(req);
    json(res, await db.all('SELECT version, created_at, created_by, note, length(manifest) size FROM publications ORDER BY version DESC LIMIT 100'));
  });
  r.post('/api/publications/:v/rollback', async (req, res, { params }) => {
    const u = await editor(req);
    const p = await db.get('SELECT * FROM publications WHERE version = ?', int(params.v));
    if (!p) throw new HttpError(404, 'Not found');
    const v = await db.insert('INSERT INTO publications (created_at, created_by, note, manifest) VALUES (?, ?, ?, ?)', [now(), u.email, `Rollback → v${p.version}`, p.manifest], 'version');
    await audit(u.email, 'publish.rollback', { to: p.version, version: v });
    notifyPlayers('update', { version: v });
    json(res, { ok: true, version: v });
  });

  // ---------- Emergency / announcement alert (live, no publish needed) ----------
  r.get('/api/alert', async (req, res) => { await viewer(req); json(res, await getSetting('alert')); });
  r.put('/api/alert', async (req, res) => {
    const u = await editor(req); const b = await readJson(req);
    const alert = {
      active: !!b.active, text_he: str(b.text_he, 500), text_en: str(b.text_en, 500),
      style: ['banner', 'fullscreen', 'ticker'].includes(b.style) ? b.style : 'banner',
      level: ['info', 'warning', 'emergency'].includes(b.level) ? b.level : 'info',
      until: b.until ? int(b.until) : null, updated_at: now(), updated_by: u.email,
    };
    await setSetting('alert', alert);
    await audit(u.email, alert.active ? 'alert.on' : 'alert.off', { text: alert.text_he, style: alert.style });
    notifyPlayers('update', { alert: true });
    json(res, alert);
  });

  // ---------- Settings ----------
  r.get('/api/settings', async (req, res) => { await viewer(req); json(res, await getAllSettings()); });
  r.put('/api/settings', async (req, res) => {
    const u = await admin(req); const b = await readJson(req);
    const allowed = Object.keys(DEFAULT_SETTINGS).filter(k => k !== 'alert');
    const stmts = [];
    for (const k of allowed) {
      if (!(k in b)) continue;
      let v = b[k];
      if (k === 'defaultDuration') v = Math.max(1, Math.min(3600, Number(v) || 15));
      if (k === 'minDuration') v = Math.max(1, Math.min(3600, Number(v) || 3));
      if (k === 'canvas') v = { width: Math.max(320, Math.min(7680, int(v?.width, 1920))), height: Math.max(320, Math.min(7680, int(v?.height, 1080))) };
      if (k === 'defaultTransition') v = { type: 'fade', duration: 1200, ...cleanTransition(v) };
      if (k === 'pollSeconds') v = Math.max(15, Math.min(3600, int(v, 60)));
      stmts.push(setSettingStmt(k, v));
    }
    await db.batch(stmts);
    await audit(u.email, 'settings.update', Object.keys(b));
    notifyPlayers('update', { settings: true });
    json(res, await getAllSettings());
  });

  // ---------- Users ----------
  r.get('/api/users', async (req, res) => {
    await admin(req);
    json(res, await db.all('SELECT id, email, name, role, provider, active, created_at, last_login FROM users ORDER BY email'));
  });
  r.post('/api/users', async (req, res) => {
    const u = await admin(req); const b = await readJson(req);
    const email = str(b.email, 200).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new HttpError(400, 'Invalid email');
    if (await db.get('SELECT 1 x FROM users WHERE email = ?', email)) throw new HttpError(409, 'User exists');
    const role = ROLE_LEVEL[b.role] ? b.role : 'viewer';
    await db.run('INSERT INTO users (email, name, role, provider, created_at) VALUES (?, ?, ?, ?, ?)', email, str(b.name || email, 100), role, 'oidc', now());
    await audit(u.email, 'user.create', { email, role });
    json(res, { ok: true }, 201);
  });
  r.patch('/api/users/:id', async (req, res, { params }) => {
    const u = await admin(req); const b = await readJson(req); const id = int(params.id);
    const t = await db.get('SELECT * FROM users WHERE id = ?', id);
    if (!t) throw new HttpError(404, 'Not found');
    if (t.id === u.id && (b.role && b.role !== 'admin' || b.active === false)) throw new HttpError(409, 'You cannot demote or disable yourself');
    await db.run('UPDATE users SET role = ?, active = ?, name = ? WHERE id = ?', ROLE_LEVEL[b.role] ? b.role : t.role, b.active != null ? bool(b.active) : t.active, b.name != null ? str(b.name, 100) : t.name, id);
    if (b.active === false) await db.run('DELETE FROM sessions WHERE user_id = ?', id);
    await audit(u.email, 'user.update', { email: t.email, role: b.role, active: b.active });
    json(res, { ok: true });
  });
  r.delete('/api/users/:id', async (req, res, { params }) => {
    const u = await admin(req); const id = int(params.id);
    if (id === u.id) throw new HttpError(409, 'You cannot delete yourself');
    const t = await db.get('SELECT email FROM users WHERE id = ?', id);
    await db.batch([['DELETE FROM sessions WHERE user_id = ?', [id]], ['DELETE FROM users WHERE id = ?', [id]]]);
    await audit(u.email, 'user.delete', { email: t?.email });
    json(res, { ok: true });
  });

  // ---------- Audit ----------
  r.get('/api/audit', async (req, res, { url }) => {
    await admin(req);
    const limit = Math.min(500, int(url.searchParams.get('limit'), 200));
    const offset = int(url.searchParams.get('offset'), 0);
    json(res, await db.all('SELECT * FROM audit ORDER BY id DESC LIMIT ? OFFSET ?', limit, offset));
  });

  // ---------- Backup ----------
  r.get('/api/backup/download', async (req, res) => {
    const u = await admin(req);
    await audit(u.email, 'backup.download');
    if (db.dialect === 'sqlite') {
      const { runBackup } = await import('./backup.js');
      const file = runBackup('manual');
      return serveFile(req, res, file, { extraHeaders: { 'Content-Disposition': `attachment; filename="${path.basename(file)}"` } });
    }
    const data = await exportAll();
    send(res, 200, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="lumen-export-${new Date().toISOString().slice(0, 10)}.json"` });
  });

  // ---------- Cron (Vercel Cron / external scheduler) ----------
  r.get('/api/cron/housekeeping', async (req, res) => {
    const auth = req.headers.authorization || '';
    if (!config.cronSecret || auth !== `Bearer ${config.cronSecret}`) throw new HttpError(401, 'Unauthorized');
    await housekeeping();
    json(res, { ok: true });
  });
}
