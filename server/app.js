// The HTTP request handler, shared by the on-prem server (server/index.js) and the Vercel Function (api/index.js).
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { log } from './log.js';
import { initDb, db } from './db.js';
import { Router, HttpError, json, send, redirect, serveFile } from './http.js';
import { getUser, oidcLogin, oidcCallback, localLogin, destroySession, loginPage } from './auth.js';
import { registerApi } from './api.js';

const PUBLIC = path.join(ROOT, 'public');
export const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const router = new Router();

router.get('/healthz', async (req, res) => {
  let dbOk = false;
  try { await db.get('SELECT 1 AS x'); dbOk = true; } catch {}
  json(res, { ok: dbOk, version: PKG.version, db: db.dialect, media: config.mediaKind, vercel: config.isVercel, uptime: Math.round(process.uptime()) }, dbOk ? 200 : 503);
});
router.get('/', (req, res) => redirect(res, '/admin/'));
router.get('/favicon.ico', (req, res) => redirect(res, '/admin/img/icon.svg'));
router.get('/login', (req, res, { url }) => loginPage(req, res, url));
router.get('/auth/login', (req, res, { url }) => oidcLogin(req, res, url));
router.get('/auth/callback', (req, res, { url }) => oidcCallback(req, res, url));
router.post('/auth/local', (req, res) => localLogin(req, res));
router.get('/auth/logout', async (req, res) => { await destroySession(req, res); redirect(res, '/login'); });
router.post('/auth/logout', async (req, res) => { await destroySession(req, res); json(res, { ok: true }); });

registerApi(router);

// Media: local files (on-prem). With Vercel Blob, asset URLs point straight at the Blob CDN.
router.get('/media/*', async (req, res) => {
  const file = req._path.slice('/media/'.length);
  if (/^[a-f0-9]{32}\.[a-z0-9]{2,5}$/.test(file)) {
    const extra = file.endsWith('.svg') ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox" } : {};
    if (serveFile(req, res, path.join(config.mediaDir, file), { cache: 'public, max-age=31536000, immutable', extraHeaders: extra })) return;
  }
  // Blob-stored asset requested through the legacy path: redirect to its public URL.
  const a = await db.get('SELECT url FROM assets WHERE filename = ? AND url IS NOT NULL', file);
  if (a?.url) return redirect(res, a.url);
  throw new HttpError(404, 'Not found');
});

// Static files (on Vercel these are served by the CDN from /public and never reach this handler).
router.get('/player/*', (req, res) => {
  const rel = req._path.slice('/player/'.length);
  if (rel && !rel.includes('/') && rel.includes('.')) {
    return serveStatic(req, res, path.join(PUBLIC, 'player'), rel, rel === 'sw.js' ? { 'Service-Worker-Allowed': '/player/' } : {});
  }
  serveFile(req, res, path.join(PUBLIC, 'player', 'index.html'), { cache: 'no-cache' });
});
router.get('/shared/*', (req, res) => serveStatic(req, res, path.join(PUBLIC, 'shared'), req._path.slice('/shared/'.length)));
router.get('/admin/*', async (req, res) => {
  const rel = req._path.slice('/admin/'.length);
  if (rel.startsWith('img/') || rel.startsWith('vendor/') || /\.(js|css|svg|png|ico|json)$/.test(rel)) return serveStatic(req, res, path.join(PUBLIC, 'admin'), rel);
  if (!(await getUser(req))) return redirect(res, `/login?next=${encodeURIComponent(req._path)}`);
  serveFile(req, res, path.join(PUBLIC, 'admin', 'index.html'), { cache: 'no-cache' });
});

function serveStatic(req, res, base, rel, extraHeaders = {}) {
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) throw new HttpError(404, 'Not found');
  if (!serveFile(req, res, file, { cache: 'no-cache', extraHeaders })) throw new HttpError(404, 'Not found');
}

const BLOB_HOSTS = 'https://*.public.blob.vercel-storage.com';
export const CSP = [
  "default-src 'self'", `img-src 'self' data: blob: ${BLOB_HOSTS}`, `media-src 'self' blob: ${BLOB_HOSTS}`, "style-src 'self' 'unsafe-inline'",
  `font-src 'self' data: ${BLOB_HOSTS}`, "script-src 'self'", `connect-src 'self' ${BLOB_HOSTS} https://*.blob.vercel-storage.com https://blob.vercel-storage.com https://vercel.com`,
  "frame-src 'self'", "frame-ancestors 'self'", "base-uri 'self'", "form-action 'self' https://login.microsoftonline.com",
].join('; ');

export async function handler(req, res) {
  const started = Date.now();
  let url;
  try { url = new URL(req.url, 'http://local'); } catch { return send(res, 400, 'Bad request'); }
  // Vercel: vercel.json rewrites dynamic routes to /api/index and passes the original path in "__p".
  const original = url.searchParams.get('__p');
  if (original && original.startsWith('/')) {
    url.searchParams.delete('__p'); url.searchParams.delete('path');
    url = new URL(original + (url.search || ''), 'http://local');
  }
  req._path = url.pathname.replace(/\/{2,}/g, '/');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (!req._path.startsWith('/media/')) res.setHeader('Content-Security-Policy', CSP);
  if (config.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000');

  try {
    await initDb();
    // CSRF guard: state-changing admin API calls must carry a custom header (blocked cross-site by CORS).
    if (req._path.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method) && !req._path.startsWith('/api/player/') && req._path !== '/api/blob/upload' && req.headers['x-emtv'] !== '1') {
      throw new HttpError(403, 'Missing CSRF header');
    }
    const m = router.match(req.method, req._path);
    if (!m) throw new HttpError(404, 'Not found');
    for (const h of m.route.handlers) await h(req, res, { params: m.params, url });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) log.error(`[http] ${req.method} ${req._path}`, e);
    if (!res.headersSent) {
      if (req._path.startsWith('/api/') || status !== 404) json(res, { error: status >= 500 && config.isVercel ? 'Server error' : (e.message || 'error') }, status);
      else send(res, 404, 'Not found');
    } else { try { res.end(); } catch {} }
  } finally {
    const ms = Date.now() - started;
    if (ms > 3000 && !req._path.includes('/events')) log.warn(`[http] slow ${req.method} ${req._path} ${ms}ms`);
  }
}
