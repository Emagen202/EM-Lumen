// Vercel build step:
//  1. bundles the Vercel Blob browser client (direct uploads of large videos) into public/admin/vendor/
//  2. checks that the required environment variables are present and prints clear warnings
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/admin/vendor/blob-client.js');
fs.mkdirSync(path.dirname(out), { recursive: true });

const { build } = await import('esbuild');
await build({
  stdin: { contents: "export { upload } from '@vercel/blob/client';", resolveDir: root, sourcefile: 'blob-client-entry.js', loader: 'js' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  outfile: out,
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  logLevel: 'info',
});
console.log(`[build] Blob client bundled → ${path.relative(root, out)} (${fs.statSync(out).size} bytes)`);

const warn = (m) => console.warn(`\n⚠️  [EM-Lumen] ${m}`);
const has = (k) => Boolean(process.env[k]);
if (!has('DATABASE_URL') && !has('POSTGRES_URL')) warn('DATABASE_URL is missing — connect a Neon Postgres database (Storage → Neon) to this project.');
if (!has('BLOB_READ_WRITE_TOKEN')) warn('BLOB_READ_WRITE_TOKEN is missing — connect a PUBLIC Blob store and tick "Add a read-write token env var" (needed for browser uploads).');
if (!has('SESSION_SECRET')) warn('SESSION_SECRET is not set — a secret will be generated and stored in the database. Setting it explicitly is recommended.');
if (!has('OIDC_ISSUER') && !has('LOCAL_ADMIN_PASSWORD')) warn('No login method: set OIDC_ISSUER/OIDC_CLIENT_ID/OIDC_CLIENT_SECRET (Entra ID SSO) or LOCAL_ADMIN_PASSWORD.');
if (!has('BASE_URL')) warn(`BASE_URL is not set — using https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || '<production domain>'}. Set it to the fixed address once the domain is attached.`);
if (!has('CRON_SECRET')) warn('CRON_SECRET is not set — the nightly housekeeping cron will be rejected (set any long random string).');
