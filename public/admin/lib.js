// Admin UI core helpers: DOM builder, API client, i18n, modals, toasts, icons, formatting.
import { DICT } from './i18n.js';
import { localParts } from '/shared/schedule.js';

// ---------------- i18n ----------------
export let lang = localStorage.getItem('emtv.lang') || 'he';
export function setLang(l) {
  lang = l === 'en' ? 'en' : 'he';
  localStorage.setItem('emtv.lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
}
export function t(key, vars) {
  let s = DICT[lang]?.[key] ?? DICT.he[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}
export const catName = (c) => (lang === 'en' ? c?.name_en || c?.name_he : c?.name_he || c?.name_en) || '';

// ---------------- DOM ----------------
// Make Element.append() ignore null/false and flatten arrays, like h() does (used throughout the admin UI).
const nativeAppend = Element.prototype.append;
Element.prototype.append = function (...kids) { nativeAppend.apply(this, kids.flat(Infinity).filter(k => k != null && k !== false && k !== true)); };

export function h(tag, props, ...children) {
  const [name, ...cls] = String(tag).split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (props != null && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { children.unshift(props); props = null; }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v; // only for trusted static markup (icons)
      else if (['value', 'checked', 'selected', 'disabled', 'indeterminate', 'multiple', 'readOnly'].includes(k)) el[k] = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ---------------- Icons (static, trusted SVG) ----------------
const P = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  calendar: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18',
  monitor: 'M2 3h20v14H2zM8 21h8M12 17v4',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  plus: 'M12 5v14M5 12h14',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2',
  copy: 'M9 9h13v13H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2M1 1l22 22',
  play: 'M5 3l14 9-14 9z',
  text: 'M4 7V4h16v3M9 20h6M12 4v16',
  video: 'M23 7l-7 5 7 5zM1 5h15v14H1z',
  square: 'M3 3h18v18H3z',
  circle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  ticker: 'M2 12h20M2 7h20M2 17h12',
  timer: 'M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  logo: 'M12 2l3 7h7l-5.5 4.5 2 7.5L12 16.5 5.5 21l2-7.5L2 9h7z',
  undo: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13',
  redo: 'M21 7v6h-6M3 17a9 9 0 0 1 15-6.7L21 13',
  back: 'M19 12H5M12 19l-7-7 7-7',
  fwd: 'M5 12h14M12 5l7 7-7 7',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.9-1',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  alignL: 'M17 10H3M21 6H3M21 14H3M17 18H3', alignC: 'M18 10H6M21 6H3M21 14H3M18 18H6', alignR: 'M21 10H7M21 6H3M21 14H3M21 18H7', alignJ: 'M21 10H3M21 6H3M21 14H3M21 18H3',
  vTop: 'M4 3h16M12 7v14M8 11l4-4 4 4', vMid: 'M4 12h16M12 3v6M12 15v6', vBot: 'M4 21h16M12 3v14M8 13l4 4 4-4',
  front: 'M12 2 2 7l10 5 10-5z', back2: 'M2 17l10 5 10-5',
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  history: 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  font: 'M4 20l6-16h4l6 16M7 14h10',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9z',
};
export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = 'ico ' + cls;
  span.style.display = 'inline-flex';
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[name] || P.square}"/></svg>`;
  return span;
}

// ---------------- API ----------------
export class ApiError extends Error { constructor(status, msg, data) { super(msg); this.status = status; this.data = data; } }
export async function api(method, url, body, { quiet = false } = {}) {
  const opts = { method, headers: { 'X-EMTV': '1' }, credentials: 'same-origin' };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(url, opts); } catch (e) { if (!quiet) toast(t('err.network'), 'err'); throw e; }
  if (r.status === 401) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.hash)}`; throw new ApiError(401, 'unauthenticated'); }
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text();
  if (!r.ok) {
    const msg = data?.error || r.statusText;
    if (!quiet) toast(r.status === 403 ? t('err.forbidden') : `${t('err.generic')}: ${msg}`, 'err');
    throw new ApiError(r.status, msg, data);
  }
  return data;
}
export const GET = (u, o) => api('GET', u, undefined, o);
export const POST = (u, b, o) => api('POST', u, b ?? {}, o);
export const PATCH = (u, b, o) => api('PATCH', u, b, o);
export const PUT = (u, b, o) => api('PUT', u, b, o);
export const DEL = (u, o) => api('DELETE', u, undefined, o);

/** Upload a file with progress. kind: media|logo. Uses Vercel Blob direct upload when the server runs on Vercel. */
export async function uploadFile(file, opts = {}) {
  if (store.meta?.platform?.media === 'blob') return uploadToBlob(file, opts);
  return uploadToServer(file, opts);
}

let blobClient = null;
async function uploadToBlob(file, { kind = 'media', meta = {}, onProgress } = {}) {
  if (!blobClient) blobClient = await import('/admin/vendor/blob-client.js');
  const ext = (file.name.match(/\.[a-z0-9]{2,5}$/i)?.[0] || '').toLowerCase();
  const base = file.name.slice(0, file.name.length - ext.length).normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'file';
  const blob = await blobClient.upload(`${kind}/${base}${ext}`, file, {
    access: 'public',
    handleUploadUrl: '/api/blob/upload',
    clientPayload: JSON.stringify({ kind }),
    multipart: file.size > 50 * 1024 * 1024,
    contentType: file.type || undefined,
    onUploadProgress: (p) => onProgress?.((p?.percentage ?? 0) / 100),
  });
  return POST('/api/assets/register', { url: blob.url, pathname: blob.pathname, contentType: blob.contentType || file.type, name: file.name, size: file.size, kind, meta }, { quiet: true });
}

function uploadToServer(file, { kind = 'media', meta = {}, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/assets?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('X-EMTV', '1');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Asset-Meta', encodeURIComponent(JSON.stringify(meta)));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      let data = {}; try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data.error || xhr.statusText));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network'));
    xhr.send(file);
  });
}

// ---------------- Shared store ----------------
export const store = { me: null, meta: null, categories: [], screens: [], listeners: new Set() };
export function emit(evt) { for (const fn of store.listeners) { try { fn(evt); } catch (e) { console.error(e); } } }
export const can = (role) => ({ viewer: 1, editor: 2, admin: 3 }[role] || 9) <= (store.me?.level || 0);

// ---------------- Toast / modal ----------------
let toasts;
export function toast(msg, kind = '') {
  if (!toasts) { toasts = h('div.toasts'); document.body.appendChild(toasts); }
  const el = h('div', { class: `toast ${kind}` }, msg);
  toasts.appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 6000 : 3000);
}

export function modal({ title, body, footer, wide, xwide, onClose }) {
  const close = () => { bg.remove(); document.removeEventListener('keydown', esc); onClose?.(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: `modal ${wide ? 'wide' : ''} ${xwide ? 'xwide' : ''}` },
    h('div.mh', h('h3', title), h('button.btn.ghost.icon', { onclick: close, title: t('close') }, icon('x'))),
    h('div.mb', body),
    footer ? h('div.mf', typeof footer === 'function' ? footer(close) : footer) : null);
  const bg = h('div.modal-bg', { onmousedown: (e) => { if (e.target === bg) close(); } }, box);
  document.body.appendChild(bg);
  document.addEventListener('keydown', esc);
  setTimeout(() => box.querySelector('input,textarea,select')?.focus(), 50);
  return { close, box };
}

export function confirmDlg(message, { okText, danger = true, title } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title: title || t('confirm'), body: h('p', { style: { margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line' } }, message),
      footer: (close) => [
        h('button.btn', { onclick: () => { close(); } }, t('cancel')),
        h('button', { class: `btn ${danger ? 'solid-danger' : 'primary'}`, onclick: () => { done = true; close(); resolve(true); } }, okText || t('ok')),
      ],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

export function promptDlg(title, value = '', { placeholder = '', multiline = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const input = multiline ? h('textarea', { value, placeholder }) : h('input', { type: 'text', value, placeholder });
    const submit = (close) => { done = true; close(); resolve(input.value); };
    const m = modal({ title, body: input, footer: (close) => [h('button.btn', { onclick: close }, t('cancel')), h('button.btn.primary', { onclick: () => submit(close) }, t('ok'))], onClose: () => { if (!done) resolve(null); } });
    if (!multiline) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(m.close); });
  });
}

// ---------------- Formatting ----------------
export function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts));
}
export function relTime(ts) {
  if (!ts) return t('never');
  const s = Math.round((Date.now() - ts) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'he' ? 'he' : 'en', { numeric: 'auto' });
  if (Math.abs(s) < 60) return rtf.format(-s, 'second');
  if (Math.abs(s) < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (Math.abs(s) < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}
export function fmtSize(b) {
  if (!b && b !== 0) return '';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i ? 1 : 0)} ${u[i]}`;
}
export const uid = () => Math.random().toString(36).slice(2, 10);
export function debounce(fn, ms) { let tm; const d = (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(tm); return fn(...a); }; d.cancel = () => clearTimeout(tm); return d; }
export function copyText(text) {
  (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => toast(t('copied'), 'ok')).catch(() => {
    const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: 0 } }); document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(t('copied'), 'ok'); } catch {} ta.remove();
  });
}
export const pad2 = (n) => String(n).padStart(2, '0');
/** Today's date (YYYY-MM-DD) in the system's configured time zone. */
export const todayStr = () => localParts(new Date(), store.meta?.settings?.timezone || 'Asia/Jerusalem').date;
export const minToHHMM = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
export const changed = () => emit({ type: 'changed' });
