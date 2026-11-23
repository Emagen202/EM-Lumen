import { h, t, icon, lang, GET, uploadFile, modal, toast, fmtSize, clear, uid, store, catName, todayStr } from './lib.js';
import { renderSlide, layoutStage } from '/shared/render.js';

// ---------------- Small inputs ----------------
export function switchEl(checked, onchange, { disabled } = {}) {
  const input = h('input', { type: 'checkbox', checked, disabled, onchange: (e) => onchange(e.target.checked) });
  return h('label.switch', input, h('span'));
}

function parseColor(c) {
  if (!c) return { hex: '#000000', a: 1 };
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return { hex: c.toLowerCase(), a: 1 };
  m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return { hex: '#' + m[1].split('').map(x => x + x).join('').toLowerCase(), a: 1 };
  m = /^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)$/i.exec(c);
  if (m) return { hex: '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join(''), a: m[4] != null ? Number(m[4]) : 1 };
  return { hex: '#000000', a: 1 };
}
function toColor(hex, a) {
  if (a >= 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(a * 100) / 100})`;
}

/** Color picker with optional alpha and "none". */
export function colorField(value, onchange, { alpha = true, allowNone = false } = {}) {
  let { hex, a } = parseColor(value);
  const none = allowNone && !value;
  const picker = h('input', { type: 'color', value: hex });
  const text = h('input', { type: 'text', value: value || '', placeholder: allowNone ? t('none') : '#000000' });
  const range = alpha ? h('input', { type: 'range', min: 0, max: 100, value: Math.round(a * 100), title: t('opacity'), style: { width: '70px' } }) : null;
  const emit = () => { const v = toColor(hex, a); text.value = v; onchange(v); };
  picker.addEventListener('input', () => { hex = picker.value; if (none && a === 0) a = 1; emit(); });
  range?.addEventListener('input', () => { a = Number(range.value) / 100; emit(); });
  text.addEventListener('change', () => {
    const v = text.value.trim();
    if (!v && allowNone) { onchange(''); return; }
    const p = parseColor(v); hex = p.hex; a = p.a; picker.value = hex; if (range) range.value = Math.round(a * 100); onchange(v);
  });
  return h('div.colorf', picker, range, text);
}

export function selectEl(value, options, onchange, attrs = {}) {
  return h('select', { ...attrs, onchange: (e) => onchange(e.target.value) },
    options.map(o => (Array.isArray(o) ? h('option', { value: o[0], selected: String(o[0]) === String(value) }, o[1]) : h('option', { value: o, selected: String(o) === String(value) }, o))));
}

export function segButtons(value, options, onchange) {
  const wrap = h('div.seg-btns');
  for (const [v, label, ic] of options) {
    wrap.appendChild(h('button', { type: 'button', class: v === value ? 'on' : '', title: label, onclick: () => { [...wrap.children].forEach(b => b.classList.remove('on')); wrap.children[options.findIndex(o => o[0] === v)].classList.add('on'); onchange(v); } }, ic ? icon(ic) : label));
  }
  return wrap;
}

// ---------------- Rules (schedule) editor ----------------
export const DOW_SHORT = () => (lang === 'he' ? ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
const MONTHS = () => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { month: 'long' }).format(new Date(2024, i, 1)));
const holidayName = (k) => { const x = store.meta?.holidays?.find(hh => hh.key === k); return x ? (lang === 'he' ? x.he : x.en) : k; };

export function ruleSummary(r) {
  const tw = (r.startTime || r.endTime) ? ` ${r.startTime || '00:00'}–${r.endTime || '24:00'}` : '';
  const days = r.days?.length && r.days.length < 7 ? ` (${r.days.map(d => DOW_SHORT()[d]).join(' ')})` : '';
  let s;
  switch (r.type) {
    case 'always': s = t('rule.always') + tw + days; break;
    case 'weekly': s = `${t('rule.weekly')}${days || ' ' + t('rule.everyday')}${tw}`; break;
    case 'dateRange': s = `${r.startDate || '…'} ${r.startTime || ''} → ${r.endDate || '…'} ${r.endTime || ''}${days}`; break;
    case 'yearly': s = `${t('rule.yearly')}: ${r.day || '?'}/${r.month || '?'}${r.endMonth ? ` → ${r.endDay}/${r.endMonth}` : ''}${tw}`; break;
    case 'holiday': s = `${holidayName(r.holiday)}${r.fromEve ? ` (${t('rule.fromEve')} ${r.startTime || '18:00'})` : tw}${r.extraDays ? ` +${r.extraDays}` : ''}`; break;
    case 'dates': s = `${(r.dates || []).length} ${t('rule.datesN')}${tw}`; break;
    default: s = r.type;
  }
  return (r.exclude ? `${t('rule.except')}: ` : '') + s;
}

export function ruleEditor(rules, onchange, { title } = {}) {
  rules = (rules || []).map(r => ({ ...r }));
  const wrap = h('div.rules');
  const commit = () => { onchange(rules.map(r => ({ ...r }))); };
  const render = () => {
    clear(wrap);
    if (!rules.length) wrap.appendChild(h('div.hint', t('rule.none')));
    rules.forEach((r, i) => wrap.appendChild(ruleCard(r, () => { commit(); sum(); }, () => { rules.splice(i, 1); commit(); render(); }, () => render())));
    wrap.appendChild(h('div.row', h('button.btn.sm', { type: 'button', onclick: () => { rules.push({ type: 'weekly', days: [0, 1, 2, 3, 4], startTime: '08:00', endTime: '18:00' }); commit(); render(); } }, icon('plus'), t('rule.add')),
      h('button.btn.sm.ghost', { type: 'button', onclick: () => { rules.push({ type: 'holiday', holiday: 'yom_hazikaron', fromEve: true, startTime: '19:00', endTime: '20:00' }); commit(); render(); } }, icon('calendar'), t('rule.addHoliday'))));
  };
  const sum = () => wrap.querySelectorAll('.rule').forEach((el, i) => { const s = el.querySelector('.sum'); if (s && rules[i]) s.textContent = ruleSummary(rules[i]); });
  render();
  return wrap;
}

function ruleCard(r, changed, remove, rerender) {
  const set = (k, v) => { r[k] = v; changed(); };
  const body = h('div.col');
  const timeRow = (labelA = t('rule.from'), labelB = t('rule.to')) => h('div.grid2',
    h('label.f', h('span', labelA), h('input', { type: 'time', value: r.startTime || '', onchange: (e) => set('startTime', e.target.value) })),
    h('label.f', h('span', labelB), h('input', { type: 'time', value: r.endTime || '', onchange: (e) => set('endTime', e.target.value) })));
  const daysRow = () => {
    const d = h('div.days');
    DOW_SHORT().forEach((name, i) => d.appendChild(h('button', { type: 'button', class: (r.days || []).includes(i) ? 'on' : '', onclick: (e) => {
      const set2 = new Set(r.days || []); set2.has(i) ? set2.delete(i) : set2.add(i); r.days = [...set2].sort(); e.currentTarget.classList.toggle('on'); changed();
    } }, name)));
    return h('label.f', h('span', t('rule.days')), d);
  };
  const build = () => {
    clear(body);
    switch (r.type) {
      case 'always': body.append(h('div.hint', t('rule.alwaysHint')), timeRow(), daysRow()); break;
      case 'weekly': body.append(daysRow(), timeRow(), h('div.hint', t('rule.overnightHint'))); break;
      case 'dateRange': body.append(
        h('div.grid2', h('label.f', h('span', t('rule.startDate')), h('input', { type: 'date', value: r.startDate || '', onchange: (e) => set('startDate', e.target.value) })),
          h('label.f', h('span', t('rule.startTime')), h('input', { type: 'time', value: r.startTime || '', onchange: (e) => set('startTime', e.target.value) }))),
        h('div.grid2', h('label.f', h('span', t('rule.endDate')), h('input', { type: 'date', value: r.endDate || '', onchange: (e) => set('endDate', e.target.value) })),
          h('label.f', h('span', t('rule.endTime')), h('input', { type: 'time', value: r.endTime || '', onchange: (e) => set('endTime', e.target.value) }))),
        h('div.hint', t('rule.rangeHint'))); break;
      case 'yearly': {
        const ms = MONTHS().map((m, i) => [i + 1, m]);
        body.append(
          h('div.grid2', h('label.f', h('span', t('rule.fromDay')), h('div.row', h('input', { type: 'number', min: 1, max: 31, value: r.day || 1, style: { width: '70px' }, onchange: (e) => set('day', Number(e.target.value)) }), selectEl(r.month || 1, ms, (v) => set('month', Number(v))))),
            h('label.f', h('span', t('rule.toDay')), h('div.row', h('input', { type: 'number', min: 1, max: 31, value: r.endDay || r.day || 1, style: { width: '70px' }, onchange: (e) => set('endDay', Number(e.target.value)) }), selectEl(r.endMonth || r.month || 1, ms, (v) => set('endMonth', Number(v)))))),
          timeRow(t('rule.startTime'), t('rule.endTime')));
        break;
      }
      case 'holiday': {
        const opts = (store.meta?.holidays || []).map(x => [x.key, lang === 'he' ? x.he : x.en]);
        const next = (store.meta?.holidayDates?.[r.holiday] || []).find(o => o.start >= todayStr());
        body.append(
          h('label.f', h('span', t('rule.holiday')), selectEl(r.holiday, opts, (v) => { set('holiday', v); build(); })),
          h('label.chk', h('input', { type: 'checkbox', checked: !!r.fromEve, onchange: (e) => { set('fromEve', e.target.checked); } }), t('rule.fromEveLong')),
          timeRow(t('rule.startTime'), t('rule.endTime')),
          h('label.f', h('span', t('rule.extraDays')), h('input', { type: 'number', min: 0, max: 30, value: r.extraDays || 0, style: { width: '90px' }, onchange: (e) => set('extraDays', Number(e.target.value)) })),
          next ? h('div.hint', `${t('rule.nextDate')}: ${next.start}${next.days > 1 ? ` (${next.days} ${t('days')})` : ''}`) : null);
        break;
      }
      case 'dates': {
        const list = h('textarea', { value: (r.dates || []).join('\n'), placeholder: 'YYYY-MM-DD', rows: 3, class: 'mono', onchange: (e) => set('dates', e.target.value.split(/[\s,]+/).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x))) });
        body.append(h('label.f', h('span', t('rule.datesList')), list), timeRow());
        break;
      }
    }
  };
  build();
  const types = [['weekly', t('rule.t.weekly')], ['dateRange', t('rule.t.dateRange')], ['holiday', t('rule.t.holiday')], ['yearly', t('rule.t.yearly')], ['dates', t('rule.t.dates')], ['always', t('rule.t.always')]];
  const card = h('div', { class: `rule ${r.exclude ? 'exclude' : ''}` },
    h('div.rh',
      selectEl(r.type, types, (v) => { r.type = v; changed(); build(); }, { style: { maxWidth: '200px' } }),
      h('label.chk.small', h('input', { type: 'checkbox', checked: !!r.exclude, onchange: (e) => { r.exclude = e.target.checked; card.classList.toggle('exclude', r.exclude); changed(); } }), t('rule.excludeLbl')),
      h('span.sp'),
      h('button.btn.ghost.icon.sm', { type: 'button', title: t('delete'), onclick: remove }, icon('trash'))),
    body,
    h('div.sum', ruleSummary(r)));
  return card;
}

// ---------------- Media metadata + upload UI ----------------
export function readMediaMeta(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    let finished = false, timer = null;
    const done = (m) => { if (finished) return; finished = true; clearTimeout(timer); URL.revokeObjectURL(url); resolve(m); };
    if (file.type.startsWith('image/')) {
      const img = new Image(); img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight }); img.onerror = () => done({}); img.src = url;
    } else if (file.type.startsWith('video/')) {
      const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
      v.onerror = () => done({}); v.src = url;
    } else done({});
    timer = setTimeout(() => done({}), 15000);
  });
}

/** Upload several files, showing progress in `container`. Resolves with created assets. */
export async function uploadMany(files, kind, container) {
  const created = [];
  for (const file of files) {
    const bar = h('div', { style: { width: '0%' } });
    const row = h('div.col', { style: { gap: '4px', marginTop: '8px' } }, h('div.row.small', h('span.ellipsis', file.name), h('span.sp'), h('span.muted', fmtSize(file.size))), h('div.progress', bar));
    container?.appendChild(row);
    try {
      if (file.size > 300 * 1024 * 1024) toast(t('media.bigWarn', { name: file.name }));
      const meta = await readMediaMeta(file);
      const a = await uploadFile(file, { kind, meta, onProgress: (p) => { bar.style.width = `${Math.round(p * 100)}%`; } });
      created.push(a);
      row.remove();
    } catch (e) {
      bar.style.background = 'var(--bad)';
      toast(`${t('media.uploadFailed')}: ${file.name} (${e.message})`, 'err');
    }
  }
  return created;
}

export function fileInput(accept, multiple, onfiles) {
  const inp = h('input', { type: 'file', accept, multiple, style: { display: 'none' }, onchange: () => { onfiles([...inp.files]); inp.value = ''; } });
  return inp;
}

export const ACCEPT = { media: 'image/*,video/mp4,video/webm,.svg', logo: 'image/*,.svg', font: '.ttf,.otf,.woff,.woff2', image: 'image/*,.svg', video: 'video/mp4,video/webm' };

/** Asset picker modal. kinds: ['media'] | ['logo'] ; filter: 'image'|'video'|null. Resolves asset or null. */
export function pickAsset({ kind = 'media', filter = null, title } = {}) {
  return new Promise(async (resolve) => {
    let picked = null;
    let tab = kind;
    const grid = h('div.media-grid');
    const prog = h('div');
    const load = async () => {
      clear(grid);
      const list = (await GET(`/api/assets?kind=${tab}`)).filter(a => !filter || a.mime.startsWith(filter));
      if (!list.length) grid.appendChild(h('div.empty', { style: { gridColumn: '1/-1' } }, t('media.emptyPick')));
      for (const a of list) grid.appendChild(assetCard(a, { pick: () => { picked = a; m.close(); } }));
    };
    const inp = fileInput(tab === 'logo' ? ACCEPT.logo : filter === 'video' ? ACCEPT.video : filter === 'image' ? ACCEPT.image : ACCEPT.media, true, async (files) => {
      const created = await uploadMany(files, tab, prog);
      if (created.length === 1) { picked = created[0]; m.close(); return; }
      load();
    });
    const tabs = h('div.tabs',
      ...[['media', t('media.tabMedia')], ['logo', t('media.tabLogos')]].map(([k, l]) => h('button', { type: 'button', class: k === tab ? 'on' : '', onclick: (e) => { tab = k; [...tabs.children].forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); load(); } }, l)));
    const m = modal({
      title: title || t('media.pick'), xwide: true,
      body: h('div', tabs, h('div.row', { style: { marginBottom: '12px' } }, h('button.btn.primary', { type: 'button', onclick: () => inp.click() }, icon('upload'), t('media.upload')), inp, h('span.hint', t('media.pickHint'))), prog, grid),
      onClose: () => resolve(picked),
    });
    load();
  });
}

export function assetCard(a, { pick, actions } = {}) {
  const isVid = a.mime.startsWith('video/');
  const thumb = h('div.mthumb');
  if (a.kind === 'font') thumb.appendChild(h('div.fontprev', { style: { fontFamily: `"${a.name}"` } }, 'אבג Abc'));
  else if (isVid) thumb.appendChild(h('video', { src: a.url + '#t=1', muted: true, preload: 'metadata' }));
  else thumb.appendChild(h('img', { src: a.url, alt: '', loading: 'lazy' }));
  const dims = a.width ? `${a.width}×${a.height}` : '';
  const dur = a.duration ? ` · ${Math.round(a.duration)}s` : '';
  return h('div', { class: `media-card ${a.kind} ${pick ? 'pick' : ''}`, onclick: pick ? () => pick(a) : null, title: a.name },
    isVid ? h('span.badge.kind-badge', icon('video'), t('video')) : null,
    thumb,
    h('div.mmeta', h('div.mname.ellipsis', a.name), h('div.small.muted.ltr', [dims, fmtSize(a.size)].filter(Boolean).join(' · ') + dur)),
    actions ? h('div.mact', actions) : null);
}

// ---------------- Slide thumbnail ----------------
export function slideThumb(slide, assets, settings, width = 280) {
  const canvas = settings?.canvas || { width: 1920, height: 1080 };
  const scale = width / canvas.width;
  const box = h('div.thumbbox', { style: { width: `${width}px`, height: `${Math.round(canvas.height * scale)}px` } });
  try {
    const view = renderSlide(slide, { assets, settings, mode: 'thumb' });
    view.stage.style.transform = `scale(${scale})`;
    box.appendChild(view.stage);
    requestAnimationFrame(() => layoutStage(view.stage));
    box._destroy = () => view.destroy();
  } catch (e) { console.error(e); }
  return box;
}

/** Fluid thumbnail that fills its container width. */
export function fluidThumb(slide, assets, settings) {
  const canvas = settings?.canvas || { width: 1920, height: 1080 };
  const box = h('div.thumbbox', { style: { width: '100%', aspectRatio: `${canvas.width} / ${canvas.height}` } });
  const view = renderSlide(slide, { assets, settings, mode: 'thumb' });
  box.appendChild(view.stage);
  const ro = new ResizeObserver(() => { const s = box.clientWidth / canvas.width; view.stage.style.transform = `scale(${s})`; });
  ro.observe(box);
  requestAnimationFrame(() => layoutStage(view.stage));
  return box;
}

export function assetsMap(list) { return Object.fromEntries(list.map(a => [a.id, a])); }

// ---------------- Preview modal ----------------
export function previewModal(query, title) {
  const src = `/player/preview?preview=1&${query}`;
  const frame = h('iframe.preview-frame', { src, allow: 'autoplay; fullscreen' });
  modal({ title: title || t('preview'), xwide: true, body: h('div.col', frame, h('div.row', h('span.hint', t('preview.hint')), h('span.sp'),
    h('button.btn.sm', { onclick: () => frame.requestFullscreen?.() }, t('fullscreen')), h('a.btn.sm', { href: src, target: '_blank' }, t('openNewTab')))) });
}

// ---------------- Slide templates ----------------
export function templates(settings) {
  const W = settings?.canvas?.width || 1920, H = settings?.canvas?.height || 1080;
  const id = uid;
  const txt = (o) => ({ id: id(), type: 'text', size: 72, weight: 700, color: '#ffffff', align: 'center', valign: 'middle', lineHeight: 1.2, ...o });
  const list = [
    { key: 'blank', name: t('tpl.blank'), background: { type: 'color', color: '#0b2545' }, elements: [] },
    { key: 'title', name: t('tpl.title'), background: { type: 'gradient', color: '#0b2545', gradient: { from: '#0b2545', to: '#0a6ebd', angle: 135 } }, elements: [
      txt({ x: W * 0.08, y: H * 0.3, w: W * 0.84, h: H * 0.2, text: 'כותרת ראשית', size: 120, anim: { type: 'slide-up', duration: 900, delay: 200 } }),
      txt({ x: W * 0.12, y: H * 0.52, w: W * 0.76, h: H * 0.14, text: 'כותרת משנה — ערכו את הטקסט', size: 56, weight: 400, color: '#dbe7f5', anim: { type: 'fade', duration: 900, delay: 700 } }),
      { id: id(), type: 'logo', x: W - 340, y: H - 170, w: 280, h: 120, fit: 'contain' },
    ] },
    { key: 'image', name: t('tpl.image'), background: { type: 'color', color: '#000000' }, elements: [
      { id: id(), type: 'image', x: 0, y: 0, w: W, h: H, fit: 'cover', kenburns: true },
      { id: id(), type: 'shape', shape: 'rect', x: 0, y: H * 0.78, w: W, h: H * 0.22, fill: 'rgba(0, 0, 0, 0.55)' },
      txt({ x: W * 0.25, y: H * 0.8, w: W * 0.7, h: H * 0.18, text: 'כיתוב לתמונה', size: 64, align: 'start', anim: { type: 'slide-left', duration: 800, delay: 400 } }),
      { id: id(), type: 'logo', x: W * 0.04, y: H * 0.82, w: W * 0.16, h: H * 0.13, fit: 'contain' },
    ] },
    { key: 'video', name: t('tpl.video'), useVideoLength: true, background: { type: 'color', color: '#000000' }, elements: [
      { id: id(), type: 'video', x: 0, y: 0, w: W, h: H, fit: 'cover', loop: true },
    ] },
    { key: 'announce', name: t('tpl.announce'), background: { type: 'gradient', color: '#0a6ebd', gradient: { from: '#0a6ebd', to: '#0b2545', angle: 160 } }, elements: [
      txt({ x: W * 0.44, y: H * 0.06, w: W * 0.5, h: 90, text: 'הודעה לעובדים', size: 48, weight: 600, align: 'start', color: '#9cc9f0' }),
      { id: id(), type: 'clock', x: W * 0.06, y: H * 0.05, w: W * 0.32, h: 100, format: 'time', size: 64, weight: 300, color: '#ffffff', align: 'end' },
      txt({ x: W * 0.06, y: H * 0.25, w: W * 0.88, h: H * 0.5, text: 'כתבו כאן את תוכן ההודעה.\nאפשר כמה שורות.', size: 84, align: 'start', autoFit: true, anim: { type: 'fade', duration: 1000, delay: 300 } }),
      { id: id(), type: 'shape', shape: 'line', x: W * 0.06, y: H * 0.82, w: W * 0.88, h: 10, stroke: 'rgba(255,255,255,0.35)', strokeWidth: 3 },
      { id: id(), type: 'logo', x: W * 0.06, y: H * 0.85, w: 260, h: 110, fit: 'contain' },
    ] },
    { key: 'welcome', name: t('tpl.welcome'), background: { type: 'color', color: '#ffffff' }, elements: [
      { id: id(), type: 'shape', shape: 'rect', x: 0, y: 0, w: W * 0.36, h: H, fill: '#0a6ebd', gradient: true, fill2: '#0b2545', gradientAngle: 180 },
      { id: id(), type: 'logo', x: W * 0.05, y: H * 0.38, w: W * 0.26, h: H * 0.24, fit: 'contain' },
      txt({ x: W * 0.41, y: H * 0.26, w: W * 0.54, h: H * 0.16, text: 'ברוכים הבאים', size: 110, color: '#0b2545', align: 'start', anim: { type: 'slide-up', duration: 800 } }),
      txt({ x: W * 0.41, y: H * 0.44, w: W * 0.54, h: H * 0.14, text: 'שם האורח / החברה', size: 72, weight: 400, color: '#0a6ebd', align: 'start', anim: { type: 'slide-up', duration: 800, delay: 300 } }),
      txt({ x: W * 0.41, y: H * 0.6, w: W * 0.54, h: H * 0.1, text: 'Welcome to Eitan Medical', size: 44, weight: 400, color: '#657085', align: 'start', dir: 'ltr', anim: { type: 'fade', duration: 800, delay: 700 } }),
    ] },
    { key: 'memorial', name: t('tpl.memorial'), transition: { type: 'fade', duration: 2500 }, background: { type: 'color', color: '#000000' }, elements: [
      txt({ x: W * 0.1, y: H * 0.22, w: W * 0.8, h: H * 0.18, text: 'יזכור', size: 140, weight: 300, color: '#ffffff', anim: { type: 'fade', duration: 2500 } }),
      { id: id(), type: 'shape', shape: 'line', x: W * 0.4, y: H * 0.43, w: W * 0.2, h: 10, stroke: 'rgba(255,255,255,0.5)', strokeWidth: 2 },
      txt({ x: W * 0.1, y: H * 0.48, w: W * 0.8, h: H * 0.28, text: 'לזכר חללי מערכות ישראל ונפגעי פעולות האיבה', size: 60, weight: 300, color: '#d1d5db', anim: { type: 'fade', duration: 2500, delay: 1200 } }),
    ] },
    { key: 'countdown', name: t('tpl.countdown'), background: { type: 'gradient', color: '#1e1b4b', gradient: { from: '#1e1b4b', to: '#0a6ebd', angle: 135 } }, elements: [
      txt({ x: W * 0.1, y: H * 0.2, w: W * 0.8, h: H * 0.16, text: 'האירוע מתחיל בעוד', size: 80, weight: 600 }),
      { id: id(), type: 'countdown', x: W * 0.08, y: H * 0.42, w: W * 0.84, h: H * 0.2, target: new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 16), size: 80, weight: 700, color: '#ffffff', align: 'center', lang: 'he' },
      { id: id(), type: 'ticker', x: 0, y: H - 110, w: W, h: 110, text: 'הצטרפו אלינו! פרטים נוספים אצל משאבי אנוש', size: 52, color: '#ffffff', bg: 'rgba(0, 0, 0, 0.45)', speed: 140, direction: 'rtl' },
    ] },
  ];
  for (const tpl of list) for (const e of tpl.elements) for (const k of ['x', 'y', 'w', 'h']) e[k] = Math.round(e[k]);
  return list;
}
