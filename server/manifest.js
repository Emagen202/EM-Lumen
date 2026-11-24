import { db, getAllSettings, getSetting, DEFAULT_SETTINGS } from './db.js';

const DEFAULT_HG = DEFAULT_SETTINGS.holidayGreetings;
import { holidaysForManifest } from './holidays.js';
import { assetUrl } from './storage.js';
import { config } from './config.js';

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

function collectAssetIds(slide, set) {
  const bg = slide.background || {};
  if (bg.assetId) set.add(Number(bg.assetId));
  for (const el of slide.elements || []) if (el.assetId) set.add(Number(el.assetId));
}

export function rowToCategory(r) {
  return {
    id: r.id, name_he: r.name_he, name_en: r.name_en, color: r.color, mode: r.mode, priority: r.priority,
    isDefault: !!r.is_default, active: !!r.active, rules: parse(r.rules, []), screens: parse(r.screens, []), sort: r.sort,
  };
}

export function rowToSlide(r) {
  return {
    id: r.id, categoryId: r.category_id, sort: r.sort, name: r.name, enabled: !!r.enabled, duration: r.duration,
    useVideoLength: !!r.use_video_length, transition: parse(r.transition, {}), background: parse(r.background, {}),
    elements: parse(r.elements, []), schedule: parse(r.schedule, {}), updatedAt: r.updated_at, updatedBy: r.updated_by,
  };
}

export function rowToAsset(r) {
  return { id: r.id, kind: r.kind, name: r.name, url: assetUrl(r), mime: r.mime, size: r.size, width: r.width, height: r.height, duration: r.duration, tags: r.tags, createdAt: r.created_at, createdBy: r.created_by };
}

/** Player-facing settings (live, not part of a publication). */
export async function playerSettings(all) {
  const s = all || await getAllSettings();
  let idleLogo = null;
  if (s.idleLogoAssetId) {
    const a = await db.get('SELECT * FROM assets WHERE id = ?', Number(s.idleLogoAssetId));
    if (a) idleLogo = assetUrl(a);
  }
  // Holiday mode (the Eitan Medical logo is drawn into each greeting artwork).
  const hg = { ...DEFAULT_HG, ...(s.holidayGreetings || {}) };
  return {
    holidayGreetings: { enabled: !!hg.enabled, daysBefore: hg.daysBefore, duration: hg.duration },
    orgName: s.orgName, timezone: s.timezone, canvas: s.canvas, defaultTransition: s.defaultTransition,
    defaultDuration: s.defaultDuration, minDuration: s.minDuration, dailyReload: s.dailyReload,
    showStatusDot: s.showStatusDot, allowAudio: s.allowAudio, idleLogo, idleBackground: s.idleBackground,
    pollSeconds: config.realtime ? s.pollSeconds : Math.min(s.pollSeconds || 20, 30),
    heartbeatSeconds: config.realtime ? 30 : 60,
    realtime: config.realtime, defaultLang: s.defaultLang,
  };
}

/** Build a manifest from the current (draft) database content. */
export async function buildManifest({ includeDisabled = false } = {}) {
  const categories = (await db.all('SELECT * FROM categories ORDER BY sort, id')).map(rowToCategory).filter(c => includeDisabled || c.active);
  const catIds = new Set(categories.map(c => c.id));
  const slides = (await db.all('SELECT * FROM slides ORDER BY category_id, sort, id')).map(rowToSlide)
    .filter(s => catIds.has(s.categoryId) && (includeDisabled || s.enabled));
  const ids = new Set();
  slides.forEach(s => collectAssetIds(s, ids));
  const idle = await getSetting('idleLogoAssetId');
  if (idle) ids.add(Number(idle));
  const assets = {};
  const fonts = [];
  for (const a of await db.all('SELECT * FROM assets')) {
    if (a.kind === 'font') { fonts.push({ family: a.name, url: assetUrl(a), id: a.id }); assets[a.id] = rowToAsset(a); continue; }
    if (ids.has(a.id)) assets[a.id] = rowToAsset(a);
  }
  for (const s of slides) delete s.updatedBy;
  return { categories, slides, assets, fonts };
}

const EMPTY = { version: 0, categories: [], slides: [], assets: {}, fonts: [] };
let pubCache = null;
export async function cachedLatestPublication() {
  const v = (await db.get('SELECT MAX(version) v FROM publications'))?.v || 0;
  if (!v) return EMPTY;
  if (!pubCache || pubCache.version !== v) {
    const row = await db.get('SELECT version, created_at, created_by, note, manifest FROM publications WHERE version = ?', v);
    pubCache = { version: row.version, publishedAt: row.created_at, publishedBy: row.created_by, note: row.note, ...parse(row.manifest, {}) };
  }
  return pubCache;
}

export async function publish(user, note = '') {
  const m = await buildManifest();
  const v = await db.insert('INSERT INTO publications (created_at, created_by, note, manifest) VALUES (?, ?, ?, ?)', [Date.now(), user, note, JSON.stringify(m)], 'version');
  await db.run('DELETE FROM publications WHERE version <= (SELECT MAX(version) - 200 FROM publications)');
  return v;
}

export async function playerManifest(screen) {
  const pub = await cachedLatestPublication();
  const all = await getAllSettings();
  const alert = all.alert;
  const alertActive = alert.active && (!alert.until || alert.until > Date.now());
  return {
    ...pub,
    screen: { id: screen.id, name: screen.name },
    settings: await playerSettings(all),
    alert: alertActive ? alert : { active: false, updated_at: alert.updated_at },
    holidays: holidaysForManifest(),
    serverTime: Date.now(),
  };
}
