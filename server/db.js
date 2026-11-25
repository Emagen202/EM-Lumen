// Database layer with two interchangeable backends:
//   • SQLite (node:sqlite, built into Node) — on-prem installs
//   • Postgres over HTTP (Neon serverless driver) — Vercel
// All access is async. SQL is written with "?" placeholders; the Postgres adapter converts them to $1..$n.
import crypto from 'node:crypto';
import { config } from './config.js';
import { log } from './log.js';

// Columns that must come back as JS numbers (Postgres returns BIGINT / COUNT / SUM as strings).
const NUMERIC = new Set(['id', 'user_id', 'category_id', 'sort', 'priority', 'is_default', 'manual_override', 'active', 'enabled', 'duration', 'use_video_length',
  'width', 'height', 'size', 'created_at', 'updated_at', 'expires', 'last_seen', 'last_login', 'ts', 'version', 'v', 'n', 'e', 'm']);
function normalize(rows) {
  for (const r of rows) for (const k in r) if (NUMERIC.has(k) && typeof r[k] === 'string') r[k] = Number(r[k]);
  return rows;
}
const clean = (params) => params.map(p => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

// ------------------------------------------------------------------ SQLite adapter
async function sqliteAdapter() {
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(config.dbFile);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const stmtCache = new Map();
  const prep = (sql) => { let s = stmtCache.get(sql); if (!s) { s = d.prepare(sql); stmtCache.set(sql, s); } return s; };
  return {
    dialect: 'sqlite',
    raw: d,
    async all(sql, params) { return prep(sql).all(...clean(params)); },
    async run(sql, params) {
      if (/\breturning\b/i.test(sql)) return { rows: prep(sql).all(...clean(params)) };
      const r = prep(sql).run(...clean(params));
      return { rows: [], changes: Number(r.changes) };
    },
    async batch(stmts) {
      d.exec('BEGIN');
      try { for (const [sql, params = []] of stmts) prep(sql).run(...clean(params)); d.exec('COMMIT'); }
      catch (e) { d.exec('ROLLBACK'); throw e; }
    },
    async exec(sql) { d.exec(sql); },
  };
}

// ------------------------------------------------------------------ Postgres (Neon HTTP) adapter
async function postgresAdapter() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is not set');
  // Literal import so Vercel's file tracer bundles the driver (the env override is for tests only).
  const mod = process.env.EMTV_NEON_MODULE ? await import(process.env.EMTV_NEON_MODULE) : await import('@neondatabase/serverless');
  const sql = mod.neon(config.databaseUrl);
  const toPg = (s) => { let i = 0; return s.replace(/\?/g, () => `$${++i}`); };
  const rowsOf = (r) => (Array.isArray(r) ? r : r?.rows || []);
  return {
    dialect: 'postgres',
    async all(s, params) { return normalize(rowsOf(await sql.query(toPg(s), clean(params)))); },
    async run(s, params) { const rows = normalize(rowsOf(await sql.query(toPg(s), clean(params)))); return { rows }; },
    async batch(stmts) { if (stmts.length) await sql.transaction(stmts.map(([s, p = []]) => sql.query(toPg(s), clean(p)))); },
    async exec(s) { await sql.query(s, []); },
  };
}

// ------------------------------------------------------------------ Schema
const T = (dialect) => ({
  ID: dialect === 'postgres' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT',
  BIG: dialect === 'postgres' ? 'BIGINT' : 'INTEGER',
  REAL: dialect === 'postgres' ? 'DOUBLE PRECISION' : 'REAL',
});
function migrations(dialect) {
  const { ID, BIG, REAL } = T(dialect);
  return [
    // v1 — initial schema
    [
      `CREATE TABLE IF NOT EXISTS users (id ${ID}, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'viewer',
        provider TEXT NOT NULL DEFAULT 'oidc', active INTEGER NOT NULL DEFAULT 1, lang TEXT NOT NULL DEFAULT 'he', created_at ${BIG} NOT NULL, last_login ${BIG})`,
      `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires ${BIG} NOT NULL,
        created_at ${BIG} NOT NULL, ip TEXT)`,
      `CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires)`,
      `CREATE TABLE IF NOT EXISTS categories (id ${ID}, name_he TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#0a6ebd',
        mode TEXT NOT NULL DEFAULT 'merge', priority INTEGER NOT NULL DEFAULT 10, is_default INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
        rules TEXT NOT NULL DEFAULT '[]', screens TEXT NOT NULL DEFAULT '[]', sort INTEGER NOT NULL DEFAULT 0, created_at ${BIG} NOT NULL, updated_at ${BIG} NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS slides (id ${ID}, category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE, sort INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, duration ${REAL} NOT NULL DEFAULT 15, use_video_length INTEGER NOT NULL DEFAULT 0,
        transition TEXT NOT NULL DEFAULT '{}', background TEXT NOT NULL DEFAULT '{}', elements TEXT NOT NULL DEFAULT '[]', schedule TEXT NOT NULL DEFAULT '{}',
        created_at ${BIG} NOT NULL, updated_at ${BIG} NOT NULL, updated_by TEXT)`,
      `CREATE INDEX IF NOT EXISTS slides_cat ON slides(category_id, sort)`,
      `CREATE TABLE IF NOT EXISTS assets (id ${ID}, kind TEXT NOT NULL DEFAULT 'media', name TEXT NOT NULL, filename TEXT NOT NULL, url TEXT, mime TEXT NOT NULL,
        size ${BIG} NOT NULL, width INTEGER, height INTEGER, duration ${REAL}, tags TEXT NOT NULL DEFAULT '', created_at ${BIG} NOT NULL, created_by TEXT)`,
      `CREATE TABLE IF NOT EXISTS screens (id ${ID}, name TEXT NOT NULL, key TEXT NOT NULL UNIQUE, notes TEXT NOT NULL DEFAULT '', last_seen ${BIG}, last_ip TEXT,
        status TEXT NOT NULL DEFAULT '{}', command TEXT, created_at ${BIG} NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS publications (version ${dialect === 'postgres' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'}, created_at ${BIG} NOT NULL,
        created_by TEXT, note TEXT NOT NULL DEFAULT '', manifest TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS audit (id ${ID}, ts ${BIG} NOT NULL, actor TEXT, action TEXT NOT NULL, details TEXT)`,
      `CREATE INDEX IF NOT EXISTS audit_ts ON audit(ts)`,
    ],
    [`ALTER TABLE categories ADD COLUMN ${dialect === 'postgres' ? 'IF NOT EXISTS ' : ''}manual_override INTEGER NOT NULL DEFAULT 0`],
  ];
}

// ------------------------------------------------------------------ Init (once per process / serverless instance)
let impl = null;
let initPromise = null;

export function initDb() {
  if (!initPromise) initPromise = (async () => {
    if (config.isVercel && config.dbKind !== 'postgres') {
      throw new Error('No database configured: connect a Neon Postgres database to the Vercel project (DATABASE_URL).');
    }
    impl = config.dbKind === 'postgres' ? await postgresAdapter() : await sqliteAdapter();
    await migrate();
    await seed();
    if (!config.sessionSecret) config.sessionSecret = await persistentSecret();
    log.info(`[db] ready (${impl.dialect})`);
  })().catch((e) => { initPromise = null; throw e; });
  return initPromise;
}

const LOCK = (id) => ['SELECT pg_advisory_xact_lock(?)', [id]];

async function migrate() {
  await impl.exec('CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)');
  const rows = await impl.all('SELECT v FROM schema_version', []);
  let v = rows.length ? Number(rows[0].v) : 0;
  if (!rows.length) await impl.run('INSERT INTO schema_version (v) VALUES (0)', []);
  const list = migrations(impl.dialect);
  while (v < list.length) {
    const stmts = list[v].map(s => [s, []]);
    // Postgres: serialize concurrent cold starts with an advisory lock; the DDL is idempotent.
    if (impl.dialect === 'postgres') stmts.unshift(LOCK(715101));
    stmts.push(['UPDATE schema_version SET v = ? WHERE v < ?', [v + 1, v + 1]]);
    await impl.batch(stmts);
    v++;
    log.info(`[db] migrated to v${v}`);
  }
}

const lit = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

async function seed() {
  const now = Date.now();
  const cats = await impl.all('SELECT COUNT(*) n FROM categories', []);
  if (!Number(cats[0].n)) {
    const rows = [
      ['ימים רגילים', 'Regular days', '#0a6ebd', 'merge', 0, 1, '[]', 0],
      ['יום הזיכרון', 'Memorial Day', '#3b3b3b', 'replace', 100, 0, JSON.stringify([{ type: 'holiday', holiday: 'yom_hazikaron', fromEve: true, startTime: '19:00', endTime: '20:00' }]), 1],
      ['יום השואה', 'Holocaust Remembrance Day', '#5a5a5a', 'replace', 100, 0, JSON.stringify([{ type: 'holiday', holiday: 'yom_hashoah', fromEve: true, startTime: '19:00', endTime: '20:00' }]), 2],
      ['יום העצמאות', 'Independence Day', '#1f5fbf', 'replace', 90, 0, JSON.stringify([{ type: 'holiday', holiday: 'yom_haatzmaut', fromEve: true, startTime: '20:00', endTime: '23:59' }]), 3],
    ];
    const stmts = rows.map(r => [`INSERT INTO categories (name_he, name_en, color, mode, priority, is_default, active, rules, sort, created_at, updated_at)
      SELECT ${[r[0], r[1], r[2], r[3], r[4], r[5], 1, r[6], r[7], now, now].map(lit).join(', ')}
      WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name_he = ${lit(r[0])})`, []]);
    if (impl.dialect === 'postgres') stmts.unshift(LOCK(715102));
    await impl.batch(stmts);
    log.info('[db] seeded default categories');
  }
  const scr = await impl.all('SELECT COUNT(*) n FROM screens', []);
  if (!Number(scr[0].n)) {
    const stmts = [[`INSERT INTO screens (name, key, created_at) SELECT ${lit('מסך כניסה / Lobby')}, ${lit(newScreenKey())}, ${now} WHERE NOT EXISTS (SELECT 1 FROM screens)`, []]];
    if (impl.dialect === 'postgres') stmts.unshift(LOCK(715103));
    await impl.batch(stmts);
  }
}

async function persistentSecret() {
  const row = (await impl.all('SELECT value FROM settings WHERE key = ?', ['sessionSecret']))[0];
  if (row) return JSON.parse(row.value);
  const s = crypto.randomBytes(48).toString('hex');
  await impl.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING', ['sessionSecret', JSON.stringify(s)]);
  const again = (await impl.all('SELECT value FROM settings WHERE key = ?', ['sessionSecret']))[0];
  log.warn('[config] SESSION_SECRET not set — using a secret stored in the database');
  return JSON.parse(again.value);
}

// ------------------------------------------------------------------ Public API
export const db = {
  get dialect() { return impl?.dialect; },
  get raw() { return impl?.raw; },
  all: (sql, ...params) => impl.all(sql, params),
  get: async (sql, ...params) => (await impl.all(sql, params))[0],
  run: (sql, ...params) => impl.run(sql, params),
  /** Insert and return the new row's key column (default "id"). */
  insert: async (sql, params, key = 'id') => { const r = await impl.run(`${sql} RETURNING ${key}`, params); return Number(r.rows[0][key]); },
  /** Run several write statements atomically: [[sql, params], ...] */
  batch: (stmts) => impl.batch(stmts),
};

export const DEFAULT_SETTINGS = {
  orgName: 'Eitan Medical',
  defaultLang: 'he',
  timezone: 'Asia/Jerusalem',
  canvas: { width: 1920, height: 1080 },
  defaultDuration: 15,
  minDuration: 3,
  defaultTransition: { type: 'fade', duration: 1200 },
  dailyReload: '04:30',
  showStatusDot: false,
  allowAudio: false,
  idleLogoAssetId: null,
  idleBackground: '#0b2545',
  pollSeconds: config.realtime ? 60 : 20,
  alert: { active: false, text_he: '', text_en: '', style: 'banner', level: 'info', until: null, updated_at: 0 },
  holidayGreetings: { enabled: false, daysBefore: 3, duration: 12, logoAssetId: null },
};

export async function getSetting(key) {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return structuredClone(DEFAULT_SETTINGS[key]);
  try { return JSON.parse(row.value); } catch { return structuredClone(DEFAULT_SETTINGS[key]); }
}
export async function getAllSettings() {
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const r of await db.all('SELECT key, value FROM settings')) {
    if (r.key === 'sessionSecret') continue;
    try { out[r.key] = JSON.parse(r.value); } catch {}
  }
  return out;
}
export const setSettingStmt = (key, value) => ['INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]];
export async function setSetting(key, value) { const [s, p] = setSettingStmt(key, value); await db.run(s, ...p); }

export async function audit(actor, action, details) {
  try {
    await db.run('INSERT INTO audit (ts, actor, action, details) VALUES (?, ?, ?, ?)', Date.now(), actor || null, action,
      details == null ? null : (typeof details === 'string' ? details : JSON.stringify(details)));
  } catch (e) { log.warn('[audit] failed', e.message); }
}

export const markDirty = () => setSetting('contentChangedAt', Date.now());
export const newScreenKey = () => crypto.randomBytes(12).toString('base64url');

/** Periodic housekeeping (timer on-prem, Vercel Cron in the cloud). */
export async function housekeeping() {
  const now = Date.now();
  await db.run('DELETE FROM sessions WHERE expires < ?', now);
  await db.run('DELETE FROM audit WHERE ts < ?', now - 400 * 86400e3);
  await db.run('DELETE FROM publications WHERE version <= (SELECT MAX(version) - 200 FROM publications)');
}

/** Full JSON export of all tables (cloud backup download). */
export async function exportAll() {
  const out = { exportedAt: new Date().toISOString(), dialect: impl.dialect, tables: {} };
  for (const t of ['users', 'categories', 'slides', 'assets', 'screens', 'settings', 'publications', 'audit']) {
    out.tables[t] = await db.all(`SELECT * FROM ${t}${t === 'settings' ? " WHERE key <> 'sessionSecret'" : ''}`);
  }
  return out;
}
