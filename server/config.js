import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  try { process.loadEnvFile(envFile); } catch (e) { console.error('[config] failed to load .env:', e.message); }
}

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();
const list = (k) => env(k).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/** Running as a Vercel Function (serverless, read-only filesystem). */
export const IS_VERCEL = Boolean(process.env.VERCEL);

const databaseUrl = env('DATABASE_URL') || env('POSTGRES_URL') || env('NEON_DATABASE_URL');
// Storage backends: "sqlite" + local files (on-prem) or "postgres" + Vercel Blob (cloud).
const dbKind = env('DB_KIND') || (databaseUrl ? 'postgres' : 'sqlite');
const mediaKind = env('MEDIA_STORAGE') || (IS_VERCEL || env('BLOB_READ_WRITE_TOKEN') ? 'blob' : 'local');

const dataDir = path.resolve(ROOT, env('DATA_DIR', './data'));
if (!IS_VERCEL) {
  for (const d of ['', 'media', 'tmp', 'backups', 'logs']) fs.mkdirSync(path.join(dataDir, d), { recursive: true });
}

let sessionSecret = env('SESSION_SECRET');
if (!sessionSecret && !IS_VERCEL) {
  // Persist a generated secret so sessions survive restarts even without configuration.
  const f = path.join(dataDir, '.session-secret');
  if (fs.existsSync(f)) sessionSecret = fs.readFileSync(f, 'utf8').trim();
  else { sessionSecret = crypto.randomBytes(48).toString('hex'); fs.writeFileSync(f, sessionSecret, { mode: 0o600 }); }
}
// On Vercel without SESSION_SECRET a secret is generated once and stored in the database (see db.js).

const vercelUrl = env('VERCEL_PROJECT_PRODUCTION_URL') || env('VERCEL_URL');
const baseUrl = (env('BASE_URL') || (vercelUrl ? `https://${vercelUrl}` : `http://localhost:${env('PORT', '8080')}`)).replace(/\/+$/, '');

export const config = {
  isVercel: IS_VERCEL,
  dbKind,
  databaseUrl,
  mediaKind,
  baseUrl,
  secureCookies: baseUrl.startsWith('https://'),
  port: Number(env('PORT', '8080')),
  host: env('HOST', '0.0.0.0'),
  trustProxy: IS_VERCEL || env('TRUST_PROXY', '0') === '1',
  dataDir,
  mediaDir: path.join(dataDir, 'media'),
  tmpDir: path.join(dataDir, 'tmp'),
  backupDir: path.join(dataDir, 'backups'),
  logDir: path.join(dataDir, 'logs'),
  dbFile: path.join(dataDir, 'lumen.db'),
  sessionSecret,
  sessionHours: Number(env('SESSION_HOURS', '12')) || 12,
  cronSecret: env('CRON_SECRET'),
  realtime: !IS_VERCEL, // Server-Sent Events need a long-lived process; on Vercel the player polls.
  oidc: {
    issuer: env('OIDC_ISSUER').replace(/\/+$/, ''),
    clientId: env('OIDC_CLIENT_ID'),
    clientSecret: env('OIDC_CLIENT_SECRET'),
    scopes: env('OIDC_SCOPES', 'openid profile email'),
    displayName: env('OIDC_DISPLAY_NAME', 'Microsoft'),
    roleClaims: {
      admin: env('OIDC_ROLE_ADMIN', 'Lumen.Admin'),
      editor: env('OIDC_ROLE_EDITOR', 'Lumen.Editor'),
      viewer: env('OIDC_ROLE_VIEWER', 'Lumen.Viewer'),
    },
  },
  allowedDomains: list('ALLOWED_EMAIL_DOMAINS'),
  adminEmails: list('ADMIN_EMAILS'),
  newUserRole: env('NEW_USER_ROLE', 'viewer').toLowerCase(),
  localAdmin: { user: env('LOCAL_ADMIN_USER', 'admin'), password: env('LOCAL_ADMIN_PASSWORD') },
  maxUploadBytes: (Number(env('MAX_UPLOAD_MB', '1024')) || 1024) * 1024 * 1024,
  backupKeep: Number(env('BACKUP_KEEP', '30')) || 30,
};

config.oidcEnabled = Boolean(config.oidc.issuer && config.oidc.clientId);
config.localEnabled = Boolean(config.localAdmin.password);
