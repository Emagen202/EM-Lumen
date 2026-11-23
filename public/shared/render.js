// Slide renderer — shared by the player, the editor and thumbnails.
// Never uses innerHTML with user content: all text goes through textContent.

export const ELEMENT_TYPES = ['text', 'image', 'logo', 'video', 'shape', 'clock', 'ticker', 'countdown'];

let timeOffset = 0;
/** Correct clocks/countdowns by the server-device clock difference (ms). */
export function setTimeOffset(ms) { timeOffset = Number(ms) || 0; }
const nowDate = () => new Date(Date.now() + timeOffset);

const css = (el, styles) => { for (const k in styles) if (styles[k] != null) el.style[k] = styles[k]; return el; };
const px = (n) => `${Number(n) || 0}px`;
const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

export function installFonts(fonts = [], doc = document) {
  let style = doc.getElementById('emtv-fonts');
  if (!style) { style = doc.createElement('style'); style.id = 'emtv-fonts'; doc.head.appendChild(style); }
  const safe = (s) => String(s).replace(/["\\\n]/g, '');
  style.textContent = fonts.map(f => `@font-face{font-family:"${safe(f.family)}";src:url("${safe(f.url)}");font-display:block}`).join('\n');
}

export function fontStack(font) {
  const base = '"Segoe UI", "Heebo", "Assistant", Arial, "Noto Sans Hebrew", sans-serif';
  return font ? `"${String(font).replace(/"/g, '')}", ${base}` : base;
}

function backgroundCss(bg = {}, assets = {}) {
  if (bg.type === 'gradient' && bg.gradient) {
    const g = bg.gradient;
    if (g.kind === 'radial') return `radial-gradient(circle at center, ${g.from || '#000'}, ${g.to || '#333'})`;
    return `linear-gradient(${Number(g.angle ?? 135)}deg, ${g.from || '#0b2545'}, ${g.to || '#0a6ebd'})`;
  }
  return null;
}

/** Epoch ms for a local "YYYY-MM-DDTHH:MM" in time zone tz. */
export function zonedToEpoch(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || '');
  if (!m) return NaN;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return guess - (asUtc - guess);
  } catch { return new Date(local).getTime(); }
}

function formatClock(el, now, tz) {
  const lang = el.lang === 'en' ? 'en-GB' : 'he-IL';
  const o = { timeZone: tz };
  try {
    switch (el.format) {
      case 'date': return new Intl.DateTimeFormat(lang, { ...o, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
      case 'shortdate': return new Intl.DateTimeFormat(lang, { ...o, day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
      case 'hebrew': return new Intl.DateTimeFormat(el.lang === 'en' ? 'en-u-ca-hebrew' : 'he-u-ca-hebrew', { ...o, day: 'numeric', month: 'long', year: 'numeric' }).format(now);
      case 'weekday': return new Intl.DateTimeFormat(lang, { ...o, weekday: 'long' }).format(now);
      case 'datetime': return new Intl.DateTimeFormat(lang, { ...o, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
      default: return new Intl.DateTimeFormat(lang, { ...o, hour: '2-digit', minute: '2-digit', second: el.seconds ? '2-digit' : undefined, hourCycle: 'h23' }).format(now);
    }
  } catch { return now.toLocaleString(); }
}

function formatCountdown(el, tz) {
  const target = zonedToEpoch(el.target, tz);
  let diff = Math.max(0, Math.floor((target - (Date.now() + timeOffset)) / 1000));
  if (!Number.isFinite(target)) return '—';
  if (diff === 0 && el.doneText) return el.doneText;
  const d = Math.floor(diff / 86400); diff -= d * 86400;
  const h = Math.floor(diff / 3600); diff -= h * 3600;
  const m = Math.floor(diff / 60); const s = diff - m * 60;
  const L = el.lang === 'en' ? { d: 'days', h: 'hrs', m: 'min', s: 'sec' } : { d: 'ימים', h: 'שעות', m: 'דקות', s: 'שניות' };
  const p2 = (n) => String(n).padStart(2, '0');
  const parts = [];
  if (d > 0 || el.showDays !== false) parts.push(`${d} ${L.d}`);
  parts.push(`${p2(h)} ${L.h}`, `${p2(m)} ${L.m}`);
  if (el.seconds !== false) parts.push(`${p2(s)} ${L.s}`);
  return parts.join('  ·  ');
}

function textStyles(node, el) {
  css(node, {
    fontFamily: fontStack(el.font), fontSize: px(el.size || 64), fontWeight: el.weight || 400, fontStyle: el.italic ? 'italic' : 'normal',
    textDecoration: el.underline ? 'underline' : 'none', color: el.color || '#ffffff', lineHeight: String(el.lineHeight || 1.2),
    letterSpacing: el.letterSpacing ? px(el.letterSpacing) : null, textAlign: el.align || 'center',
    textShadow: el.shadow ? `0 ${Math.round((el.size || 64) / 16)}px ${Math.round((el.size || 64) / 6)}px ${el.shadowColor || 'rgba(0,0,0,.55)'}` : 'none',
    textTransform: el.uppercase ? 'uppercase' : null,
    WebkitTextStroke: el.strokeWidth ? `${el.strokeWidth}px ${el.strokeColor || '#000'}` : null,
  });
}

/**
 * Render one element. ctx = { assets, settings, mode: 'player'|'edit'|'thumb', timers: [] }
 * Returns the element's DOM node (absolutely positioned inside the stage).
 */
export function renderElement(el, ctx) {
  const { assets = {}, settings = {}, mode = 'player' } = ctx;
  const tz = settings.timezone || 'Asia/Jerusalem';
  const box = mk('div', `el el-${el.type}`);
  box.dataset.id = el.id;
  css(box, {
    left: px(el.x), top: px(el.y), width: px(el.w), height: px(el.h), opacity: el.opacity ?? 1,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : null, display: el.hidden ? 'none' : null,
    borderRadius: el.radius ? px(el.radius) : null,
  });
  if (el.anim?.type && el.anim.type !== 'none' && mode === 'player') {
    box.dataset.anim = el.anim.type;
    box.style.setProperty('--ad', `${el.anim.duration ?? 900}ms`);
    box.style.setProperty('--adelay', `${el.anim.delay ?? 0}ms`);
  }
  if (el.dropShadow) box.style.filter = 'drop-shadow(0 12px 24px rgba(0,0,0,.45))';

  switch (el.type) {
    case 'text': {
      const inner = mk('div', 'txt');
      inner.textContent = el.text ?? '';
      inner.dir = el.dir || 'auto';
      textStyles(inner, el);
      css(box, { background: el.bg || null, padding: el.padding ? px(el.padding) : null, display: 'flex', flexDirection: 'column',
        justifyContent: el.valign === 'top' ? 'flex-start' : el.valign === 'bottom' ? 'flex-end' : 'center' });
      if (el.autoFit) box.dataset.fit = '1';
      box.appendChild(inner);
      break;
    }
    case 'image':
    case 'logo': {
      const a = assets[el.assetId];
      if (a) {
        const img = mk('img');
        img.src = a.url; img.alt = ''; img.draggable = false; img.decoding = 'async';
        css(img, { objectFit: el.fit || (el.type === 'logo' ? 'contain' : 'cover'), borderRadius: el.radius ? px(el.radius) : null });
        if (el.kenburns && mode === 'player') img.classList.add('kb');
        box.appendChild(img);
      } else box.appendChild(placeholder(el.type === 'logo' ? 'LOGO' : 'IMAGE'));
      if (el.border) box.style.border = `${el.borderWidth || 4}px solid ${el.borderColor || '#fff'}`;
      break;
    }
    case 'video': {
      const a = assets[el.assetId];
      if (a) {
        const v = mk('video');
        v.src = a.url; v.muted = settings.allowAudio ? !!el.muted : true; v.playsInline = true; v.preload = mode === 'thumb' ? 'metadata' : 'auto';
        v.loop = el.loop !== false; v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
        v.disablePictureInPicture = true;
        css(v, { objectFit: el.fit || 'cover', borderRadius: el.radius ? px(el.radius) : null });
        if (mode !== 'player') { v.addEventListener('loadeddata', () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch {} }, { once: true }); }
        box.appendChild(v);
      } else box.appendChild(placeholder('VIDEO'));
      break;
    }
    case 'shape': {
      const s = mk('div', 'shape');
      const fill = el.gradient ? `linear-gradient(${el.gradientAngle ?? 135}deg, ${el.fill || '#0a6ebd'}, ${el.fill2 || '#0b2545'})` : (el.fill || '#0a6ebd');
      css(s, {
        background: el.shape === 'line' ? (el.stroke || el.fill || '#ffffff') : fill,
        border: el.strokeWidth && el.shape !== 'line' ? `${el.strokeWidth}px solid ${el.stroke || '#fff'}` : null,
        borderRadius: el.shape === 'ellipse' ? '50%' : el.radius ? px(el.radius) : null,
      });
      if (el.shape === 'line') css(s, { height: px(Math.max(1, el.strokeWidth || 6)), top: '50%', position: 'absolute', width: '100%', transform: 'translateY(-50%)' });
      box.appendChild(s);
      break;
    }
    case 'clock': {
      const inner = mk('div', 'txt');
      textStyles(inner, el);
      inner.dir = el.lang === 'en' ? 'ltr' : 'rtl';
      css(box, { background: el.bg || null, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: el.padding ? px(el.padding) : null });
      if (el.autoFit !== false) box.dataset.fit = '1';
      const tick = () => { inner.textContent = formatClock(el, nowDate(), tz); };
      tick();
      if (mode !== 'thumb') ctx.timers?.push(setInterval(tick, 1000));
      box.appendChild(inner);
      break;
    }
    case 'countdown': {
      const inner = mk('div', 'txt');
      textStyles(inner, el);
      inner.dir = el.lang === 'en' ? 'ltr' : 'rtl';
      css(box, { background: el.bg || null, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: el.padding ? px(el.padding) : null });
      if (el.autoFit !== false) box.dataset.fit = '1';
      const tick = () => { inner.textContent = formatCountdown(el, tz); };
      tick();
      if (mode !== 'thumb') ctx.timers?.push(setInterval(tick, 1000));
      box.appendChild(inner);
      break;
    }
    case 'ticker': {
      css(box, { background: el.bg || 'rgba(0,0,0,.6)', overflow: 'hidden', display: 'flex', alignItems: 'center' });
      const track = mk('div', 'ticker-track');
      const rtl = (el.direction || 'rtl') === 'rtl';
      const txt = (el.text || '').trim() || ' ';
      const sep = el.separator ?? '   •   ';
      for (let i = 0; i < 2; i++) {
        const span = mk('span', 'ticker-item');
        span.textContent = Array(4).fill(txt).join(sep) + sep;
        span.dir = rtl ? 'rtl' : 'ltr';
        textStyles(span, { ...el, align: 'start' });
        track.appendChild(span);
      }
      track.dataset.dir = rtl ? 'rtl' : 'ltr';
      if (mode === 'player' || mode === 'edit') {
        // Speed is applied after layout, once the width is known
        track.dataset.speed = String(el.speed || 120);
      }
      box.appendChild(track);
      break;
    }
    default:
      box.appendChild(placeholder(el.type));
  }
  return box;
}

function placeholder(label) {
  const p = mk('div', 'ph');
  p.textContent = label;
  return p;
}

/** Shrink text to fit its box (elements marked data-fit) and start tickers. Call after the stage is in the DOM. */
export function layoutStage(stage) {
  for (const box of stage.querySelectorAll('.el[data-fit="1"]')) {
    const inner = box.firstElementChild;
    if (!inner) continue;
    let size = parseFloat(inner.style.fontSize) || 64;
    let guard = 60;
    while (guard-- > 0 && size > 8 && (inner.scrollHeight > box.clientHeight + 1 || inner.scrollWidth > box.clientWidth + 1)) {
      size *= 0.93; inner.style.fontSize = `${size}px`;
    }
  }
  for (const track of stage.querySelectorAll('.ticker-track[data-speed]')) {
    const item = track.firstElementChild;
    const w = item?.offsetWidth || 1000;
    const speed = Number(track.dataset.speed) || 120;
    track.style.setProperty('--tick-dur', `${Math.max(4, w / speed)}s`);
    track.classList.add(track.dataset.dir === 'rtl' ? 'run-rtl' : 'run-ltr');
  }
}

/**
 * Render a full slide into a new stage element sized to the canvas.
 * Returns { stage, start, stop, destroy, ready }.
 */
export function renderSlide(slide, { assets = {}, settings = {}, mode = 'player' } = {}) {
  const canvas = settings.canvas || { width: 1920, height: 1080 };
  const stage = mk('div', 'emtv-stage');
  css(stage, { width: px(canvas.width), height: px(canvas.height) });
  const ctx = { assets, settings, mode, timers: [] };
  const bg = slide.background || {};
  stage.style.background = bg.color || '#000';
  const g = backgroundCss(bg, assets);
  if (g) stage.style.background = g;
  if ((bg.type === 'image' || bg.type === 'video') && assets[bg.assetId]) {
    const a = assets[bg.assetId];
    let m;
    if (bg.type === 'image') {
      m = mk('img', 'bg-media'); m.src = a.url; m.alt = ''; m.draggable = false;
      if (bg.kenburns && mode === 'player') m.classList.add('kb');
    } else {
      m = mk('video', 'bg-media'); m.src = a.url; m.muted = true; m.loop = true; m.playsInline = true; m.setAttribute('muted', ''); m.setAttribute('playsinline', '');
      m.preload = mode === 'thumb' ? 'metadata' : 'auto';
    }
    m.style.objectFit = bg.fit || 'cover';
    stage.appendChild(m);
  }
  if (bg.overlay) { const o = mk('div', 'bg-overlay'); o.style.background = bg.overlay; stage.appendChild(o); }
  for (const el of slide.elements || []) stage.appendChild(renderElement(el, ctx));

  const media = () => [...stage.querySelectorAll('video')];
  const ready = new Promise((resolve) => {
    const waits = [];
    for (const img of stage.querySelectorAll('img')) {
      if (!img.complete) waits.push(new Promise(r => { img.onload = img.onerror = r; }));
    }
    if (mode === 'player') for (const v of media()) {
      if (v.readyState < 3) waits.push(new Promise(r => { v.addEventListener('canplay', r, { once: true }); v.addEventListener('error', r, { once: true }); }));
    }
    Promise.all(waits).then(resolve);
    setTimeout(resolve, 6000); // never block the loop
  });

  return {
    stage, ready,
    start(durationSec) {
      if (durationSec) stage.style.setProperty('--slide-dur', `${durationSec}s`);
      stage.classList.add('playing');
      for (const v of media()) { try { v.currentTime = 0; const p = v.play(); if (p) p.catch(() => {}); } catch {} }
    },
    stop() { for (const v of media()) { try { v.pause(); } catch {} } },
    destroy() {
      ctx.timers.forEach(clearInterval);
      for (const v of media()) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch {} }
      stage.remove();
    },
    videos: media,
    ctx,
  };
}

/** Keyframes for slide transitions (Web Animations API). */
export function transitionKeyframes(type) {
  switch (type) {
    case 'none': return null;
    case 'slide-left': return { in: [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], out: [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }] };
    case 'slide-right': return { in: [{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }], out: [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }] };
    case 'slide-up': return { in: [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], out: [{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }] };
    case 'slide-down': return { in: [{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }], out: [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }] };
    case 'zoom-in': return { in: [{ opacity: 0, transform: 'scale(1.18)' }, { opacity: 1, transform: 'scale(1)' }], out: [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.9)' }] };
    case 'zoom-out': return { in: [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'scale(1)' }], out: [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.15)' }] };
    case 'blur': return { in: [{ opacity: 0, filter: 'blur(40px)' }, { opacity: 1, filter: 'blur(0)' }], out: [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(40px)' }] };
    case 'wipe': return { in: [{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0)' }], out: [{ opacity: 1 }, { opacity: 1 }] };
    case 'dissolve': return { in: [{ opacity: 0 }, { opacity: 1 }], out: [{ opacity: 1 }, { opacity: 1 }] };
    case 'flip': return {
      in: [{ transform: 'perspective(2400px) rotateY(90deg)', opacity: 0, offset: 0 }, { transform: 'perspective(2400px) rotateY(90deg)', opacity: 0, offset: 0.5 }, { transform: 'perspective(2400px) rotateY(0)', opacity: 1, offset: 1 }],
      out: [{ transform: 'perspective(2400px) rotateY(0)', opacity: 1, offset: 0 }, { transform: 'perspective(2400px) rotateY(-90deg)', opacity: 0, offset: 0.5 }, { transform: 'perspective(2400px) rotateY(-90deg)', opacity: 0, offset: 1 }],
    };
    case 'cube': return {
      in: [{ transform: 'perspective(2400px) translateX(100%) rotateY(-90deg)', transformOrigin: 'left center' }, { transform: 'perspective(2400px) translateX(0) rotateY(0)', transformOrigin: 'left center' }],
      out: [{ transform: 'perspective(2400px) translateX(0) rotateY(0)', transformOrigin: 'right center' }, { transform: 'perspective(2400px) translateX(-100%) rotateY(90deg)', transformOrigin: 'right center' }],
    };
    case 'fade':
    default: return { in: [{ opacity: 0 }, { opacity: 1 }], out: [{ opacity: 1 }, { opacity: 0 }] };
  }
}

export const EASING = 'cubic-bezier(.65,0,.35,1)';
