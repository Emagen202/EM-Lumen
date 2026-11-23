// EM Lumen — Service Worker for the player.
// Keeps the player shell and all media available offline; serves cached video with HTTP Range support.
const SHELL_CACHE = 'emtv-shell-v2';
const MEDIA_CACHE = 'emtv-media-v1';
const DATA_CACHE = 'emtv-data';
const SHELL = ['/player/index.html', '/player/player.js', '/player/player.css', '/shared/render.js', '/shared/schedule.js', '/shared/render.css'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('emtv-shell-') && k !== SHELL_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

async function networkFirst(req, cacheKey, ms = 5000) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await Promise.race([fetch(req, { cache: 'no-store' }), timeout(ms)]);
    if (res.ok) cache.put(cacheKey, res.clone()).catch(() => {});
    return res;
  } catch {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    throw new Error('offline and not cached');
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const key = new URL(req.url).pathname;
  const hit = await cache.match(key);
  const net = fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok) cache.put(key, res.clone()).catch(() => {}); return res; }).catch(() => null);
  if (hit) { net.catch(() => {}); return hit; }
  const res = await net;
  return res || new Response('offline', { status: 503 });
}

async function media(req) {
  const cache = await caches.open(MEDIA_CACHE);
  const url = new URL(req.url); url.search = '';
  const hit = await cache.match(url.href);
  if (hit) {
    const range = req.headers.get('range');
    if (!range || hit.type === 'opaque') return hit;
    const blob = await hit.blob();
    const size = blob.size;
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = 0, end = size - 1;
    if (m) {
      if (m[1] === '' && m[2] !== '') { start = Math.max(0, size - Number(m[2])); }
      else { start = Number(m[1] || 0); if (m[2] !== '') end = Math.min(size - 1, Number(m[2])); }
    }
    if (start >= size) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new Response(blob.slice(start, end + 1), {
      status: 206, statusText: 'Partial Content',
      headers: { 'Content-Type': hit.headers.get('Content-Type') || 'application/octet-stream', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' },
    });
  }
  try { return await fetch(req); }
  catch { return new Response('', { status: 504, statusText: 'offline' }); }
}

async function manifest(req) {
  const cache = await caches.open(DATA_CACHE);
  const key = new URL(req.url).pathname;
  try {
    const res = await Promise.race([fetch(req), timeout(12000)]);
    if (res.ok) cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return new Response(hit.body, { status: 200, headers: { 'Content-Type': 'application/json', 'X-EMTV-Offline': '1' } });
    return new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Media on Vercel Blob (cross-origin) is served from the same offline cache.
  if (url.origin !== self.location.origin) {
    if (url.hostname.endsWith('.public.blob.vercel-storage.com')) e.respondWith(media(req));
    return;
  }
  const p = url.pathname;
  if (req.mode === 'navigate' && p.startsWith('/player/')) { e.respondWith(networkFirst(req, '/player/index.html')); return; }
  if (SHELL.includes(p)) { e.respondWith(staleWhileRevalidate(req)); return; }
  if (p.startsWith('/media/')) { e.respondWith(media(req)); return; }
  if (/^\/api\/player\/[^/]+\/manifest$/.test(p)) { e.respondWith(manifest(req)); return; }
});
