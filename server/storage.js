// Media storage: local folder (on-prem) or Vercel Blob (cloud).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { log } from './log.js';

let blobMod = null;
async function blob() {
  if (!blobMod) blobMod = process.env.EMTV_BLOB_MODULE ? await import(process.env.EMTV_BLOB_MODULE) : await import('@vercel/blob');
  return blobMod;
}
let blobClientMod = null;
async function blobClient() {
  if (!blobClientMod) blobClientMod = process.env.EMTV_BLOB_CLIENT_MODULE ? await import(process.env.EMTV_BLOB_CLIENT_MODULE) : await import('@vercel/blob/client');
  return blobClientMod;
}

export const isBlob = () => config.mediaKind === 'blob';

/** Public URL a browser uses to fetch the asset. */
export function assetUrl(a) {
  if (a.url) return a.url;                // Vercel Blob: absolute public URL
  return `/media/${a.filename}`;          // local file served by this server
}

/** Accept only URLs from a Vercel Blob public store. */
export function isBlobUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && x.hostname.endsWith('.public.blob.vercel-storage.com'); } catch { return false; }
}

export async function deleteMedia(a) {
  try {
    if (a.url) { const { del } = await blob(); await del(a.url); }
    else fs.rmSync(path.join(config.mediaDir, a.filename), { force: true });
  } catch (e) { log.warn('[storage] delete failed', a.filename, e.message); }
}

/**
 * Vercel Blob client-upload token exchange (the browser then uploads straight to Blob, so files
 * of any size bypass the 4.5 MB function body limit).
 */
export async function handleBlobUpload({ body, request, authorize }) {
  const { handleUpload } = await blobClient();
  return handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const user = await authorize();
      return {
        allowedContentTypes: ['image/*', 'video/mp4', 'video/webm', 'font/*', 'application/font-woff', 'application/x-font-ttf', 'application/octet-stream'],
        maximumSizeInBytes: config.maxUploadBytes,
        addRandomSuffix: true,
        cacheControlMaxAge: 31536000,
        tokenPayload: JSON.stringify({ by: user.email, clientPayload }),
      };
    },
    onUploadCompleted: async () => { /* assets are registered by the admin UI right after the upload */ },
  });
}
