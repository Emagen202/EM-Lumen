// Slide editor: canvas with drag / resize / snapping, layers, properties, undo/redo, autosave.
import { h, t, icon, GET, PATCH, store, can, clear, toast, uid, debounce, catName, confirmDlg, changed, lang } from '../lib.js';
import { setLeaveGuard } from '../app.js';
import { renderSlide, renderElement, layoutStage, installFonts } from '/shared/render.js';
import { colorField, selectEl, segButtons, switchEl, ruleEditor, pickAsset, assetsMap, previewModal, ruleSummary } from '../components.js';

const SYSTEM_FONTS = ['', 'Segoe UI', 'Arial', 'Tahoma', 'Calibri', 'David', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New'];
const ANIMS = ['none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom', 'pop', 'blur', 'typewriter', 'float'];

export default async function editorPage(root, [idStr], { setTitle }) {
  const id = Number(idStr);
  const [slideData, assetList, cats] = await Promise.all([GET(`/api/slides/${id}`), GET('/api/assets'), GET('/api/categories')]);
  const settings = store.meta.playerSettings;
  const W = settings.canvas?.width || 1920, H = settings.canvas?.height || 1080;
  let assets = assetsMap(assetList);
  installFonts(assetList.filter(a => a.kind === 'font').map(a => ({ family: a.name, url: a.url })));
  const fonts = [...SYSTEM_FONTS, ...assetList.filter(a => a.kind === 'font').map(a => a.name)];
  const cat = cats.find(c => c.id === slideData.categoryId);
  const readOnly = !can('editor');
  setTitle(`${t('nav.editor')} · ${catName(cat)}`);

  // ---------------- State ----------------
  const slide = slideData;
  slide.elements = (slide.elements || []).map(e => ({ ...e, x: Math.round(e.x || 0), y: Math.round(e.y || 0), w: Math.round(e.w || 100), h: Math.round(e.h || 100) }));
  slide.background = slide.background || { type: 'color', color: '#000000' };
  let selId = null;
  let scale = 1, zoom = 'fit';
  let view = null;
  const undo = [], redo = [];
  let lastSnap = JSON.stringify(snapshot());
  let dirty = false, saving = false, audited = false;

  function snapshot() { return { name: slide.name, enabled: slide.enabled, duration: slide.duration, useVideoLength: slide.useVideoLength, transition: slide.transition, background: slide.background, elements: slide.elements, schedule: slide.schedule }; }
  const sel = () => slide.elements.find(e => e.id === selId) || null;

  // ---------------- DOM skeleton ----------------
  const saveState = h('span.save-state', t('ed.saved'));
  const titleInput = h('input.title', { type: 'text', value: slide.name, disabled: readOnly, oninput: (e) => { slide.name = e.target.value; commit('name'); } });
  const undoBtn = h('button.btn.ghost.icon', { title: `${t('ed.undo')} (Ctrl+Z)`, onclick: () => doUndo() }, icon('undo'));
  const redoBtn = h('button.btn.ghost.icon', { title: `${t('ed.redo')} (Ctrl+Y)`, onclick: () => doRedo() }, icon('redo'));
  const top = h('div.ed-top',
    h('a.btn.ghost.icon', { href: `#/category/${slide.categoryId}`, title: t('back') }, icon(document.dir === 'rtl' ? 'fwd' : 'back')),
    titleInput, saveState, h('span.sp'),
    readOnly ? h('span.badge.warn', t('ed.readOnly')) : [undoBtn, redoBtn],
    h('button.btn', { onclick: async () => { await save.flush(); previewModal(`slide=${id}`, slide.name); } }, icon('play'), t('preview')),
    h('a.btn.primary', { href: `#/category/${slide.categoryId}` }, icon('check'), t('ed.done')));

  const left = h('div.ed-left');
  const right = h('div.ed-right.props');
  const center = h('div.ed-center', { dir: 'ltr' });
  const wrap = h('div.canvas-wrap');
  const selLayer = h('div.sel-layer', { style: { width: `${W}px`, height: `${H}px` } });
  center.appendChild(wrap);
  const zoomSel = selectEl(zoom, [['fit', t('ed.fit')], ['0.25', '25%'], ['0.5', '50%'], ['0.75', '75%'], ['1', '100%']], (v) => { zoom = v; fit(); });
  center.appendChild(h('div.zoom-ctl', zoomSel));
  root.appendChild(h('div.editor', top, left, center, right));

  // ---------------- Rendering ----------------
  function rebuild() {
    view?.destroy();
    clear(wrap);
    view = renderSlide(slide, { assets, settings, mode: 'edit' });
    wrap.append(view.stage, selLayer);
    fit();
    requestAnimationFrame(() => layoutStage(view.stage));
    drawSel();
  }
  function updateEl(el) {
    const old = view.stage.querySelector(`.el[data-id="${CSS.escape(el.id)}"]`);
    const node = renderElement(el, view.ctx);
    if (old) old.replaceWith(node); else view.stage.appendChild(node);
    layoutStage(view.stage);
    drawSel();
  }
  function fit() {
    const cw = center.clientWidth - 80, ch = center.clientHeight - 80;
    scale = zoom === 'fit' ? Math.max(0.05, Math.min(cw / W, ch / H)) : Number(zoom);
    wrap.style.width = `${W * scale}px`; wrap.style.height = `${H * scale}px`;
    if (view) view.stage.style.transform = `scale(${scale})`;
    selLayer.style.transform = `scale(${scale})`;
    selLayer.style.setProperty('--inv', String(1 / scale));
  }
  const ro = new ResizeObserver(() => fit());
  ro.observe(center);

  // ---------------- Selection overlay ----------------
  function drawSel(guides = []) {
    clear(selLayer);
    const el = sel();
    if (el && !el.hidden) {
      const box = h('div', { class: `sel-box ${el.locked ? 'locked' : ''}`, style: { left: `${el.x}px`, top: `${el.y}px`, width: `${el.w}px`, height: `${el.h}px`, transform: el.rotation ? `rotate(${el.rotation}deg)` : '' } });
      if (!el.locked && !readOnly) for (const [d, l, tp] of [['nw', 0, 0], ['n', 50, 0], ['ne', 100, 0], ['e', 100, 50], ['se', 100, 100], ['s', 50, 100], ['sw', 0, 100], ['w', 0, 50]]) {
        box.appendChild(h('div', { class: `handle ${d}`, dataset: { dir: d }, style: { left: `${l}%`, top: `${tp}%` } }));
      }
      selLayer.appendChild(box);
    }
    for (const g of guides) selLayer.appendChild(h('div', { class: `guide ${g.v ? 'v' : 'h'}`, style: g.v ? { left: `${g.pos}px` } : { top: `${g.pos}px` } }));
  }

  // ---------------- Pointer interactions ----------------
  wrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const handle = e.target.closest('.handle');
    const node = e.target.closest('.el');
    if (handle) return startResize(e, handle.dataset.dir);
    if (!node) { select(null); return; }
    const el = slide.elements.find(x => x.id === node.dataset.id);
    if (!el) return;
    if (selId !== el.id) select(el.id);
    if (!el.locked && !readOnly) startMove(e, el);
  });
  wrap.addEventListener('dblclick', (e) => {
    // Pointer capture retargets events to the wrapper, so resolve the element under the cursor.
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const node = hit?.closest?.('.el');
    const el = (node && slide.elements.find(x => x.id === node.dataset.id)) || sel();
    if (!el || readOnly) return;
    if (['image', 'logo', 'video'].includes(el.type)) chooseAsset(el);
    else right.querySelector('textarea')?.focus();
  });

  function snapLines(exclude) {
    const xs = [0, W / 2, W], ys = [0, H / 2, H];
    for (const o of slide.elements) {
      if (o.id === exclude || o.hidden) continue;
      xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    return { xs, ys };
  }

  function startMove(e, el) {
    e.preventDefault();
    wrap.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, ox = el.x, oy = el.y;
    const lines = snapLines(el.id);
    const node = view.stage.querySelector(`.el[data-id="${CSS.escape(el.id)}"]`);
    let moved = false;
    const onMove = (ev) => {
      let nx = ox + (ev.clientX - sx) / scale, ny = oy + (ev.clientY - sy) / scale;
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
      moved = true;
      const guides = [];
      if (!ev.altKey) {
        const th = 7 / scale;
        let best = null;
        for (const [off, ref] of [[0, 'l'], [el.w / 2, 'c'], [el.w, 'r']]) for (const x of lines.xs) { const d = Math.abs(nx + off - x); if (d < th && (!best || d < best.d)) best = { d, v: x - off, pos: x }; }
        if (best) { nx = best.v; guides.push({ v: true, pos: best.pos }); }
        best = null;
        for (const off of [0, el.h / 2, el.h]) for (const y of lines.ys) { const d = Math.abs(ny + off - y); if (d < th && (!best || d < best.d)) best = { d, v: y - off, pos: y }; }
        if (best) { ny = best.v; guides.push({ v: false, pos: best.pos }); }
      }
      el.x = Math.round(nx); el.y = Math.round(ny);
      if (node) { node.style.left = `${el.x}px`; node.style.top = `${el.y}px`; }
      drawSel(guides);
    };
    const onUp = () => {
      wrap.removeEventListener('pointermove', onMove); wrap.removeEventListener('pointerup', onUp); wrap.removeEventListener('pointercancel', onUp);
      drawSel();
      if (moved) { commit(); renderProps(); }
    };
    wrap.addEventListener('pointermove', onMove); wrap.addEventListener('pointerup', onUp); wrap.addEventListener('pointercancel', onUp);
  }

  function startResize(e, dir) {
    const el = sel(); if (!el) return;
    e.preventDefault(); e.stopPropagation();
    wrap.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY;
    const o = { x: el.x, y: el.y, w: el.w, h: el.h };
    const ratio = o.w / o.h;
    const media = ['image', 'logo', 'video'].includes(el.type);
    const node = view.stage.querySelector(`.el[data-id="${CSS.escape(el.id)}"]`);
    const onMove = (ev) => {
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      let { x, y, w, h: hh } = o;
      if (dir.includes('e')) w = o.w + dx;
      if (dir.includes('w')) { w = o.w - dx; x = o.x + dx; }
      if (dir.includes('s')) hh = o.h + dy;
      if (dir.includes('n')) { hh = o.h - dy; y = o.y + dy; }
      const keep = dir.length === 2 && (media !== ev.shiftKey);
      if (keep) {
        if (Math.abs(w - o.w) / o.w > Math.abs(hh - o.h) / o.h) { const nh = w / ratio; if (dir.includes('n')) y = o.y + o.h - nh; hh = nh; }
        else { const nw = hh * ratio; if (dir.includes('w')) x = o.x + o.w - nw; w = nw; }
      }
      if (w < 10) { if (dir.includes('w')) x -= 10 - w; w = 10; }
      if (hh < 10) { if (dir.includes('n')) y -= 10 - hh; hh = 10; }
      Object.assign(el, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) });
      if (node) Object.assign(node.style, { left: `${el.x}px`, top: `${el.y}px`, width: `${el.w}px`, height: `${el.h}px` });
      drawSel();
    };
    const onUp = () => {
      wrap.removeEventListener('pointermove', onMove); wrap.removeEventListener('pointerup', onUp); wrap.removeEventListener('pointercancel', onUp);
      updateEl(el); commit(); renderProps();
    };
    wrap.addEventListener('pointermove', onMove); wrap.addEventListener('pointerup', onUp); wrap.addEventListener('pointercancel', onUp);
  }

  // ---------------- History / save ----------------
  let coalesceKey = null, coalesceTimer = null;
  function commit(key = null) {
    const snap = JSON.stringify(snapshot());
    if (snap === lastSnap) return;
    if (!(key && key === coalesceKey)) { undo.push(lastSnap); if (undo.length > 100) undo.shift(); redo.length = 0; }
    coalesceKey = key; clearTimeout(coalesceTimer); coalesceTimer = setTimeout(() => { coalesceKey = null; }, 800);
    lastSnap = snap;
    dirty = true; setSaveState('pending');
    save();
    updateHistoryBtns();
  }
  function restore(snapStr) {
    Object.assign(slide, JSON.parse(snapStr));
    lastSnap = snapStr;
    titleInput.value = slide.name;
    if (selId && !sel()) selId = null;
    rebuild(); renderLayers(); renderProps();
    dirty = true; setSaveState('pending'); save(); updateHistoryBtns();
  }
  function doUndo() { if (!undo.length || readOnly) return; redo.push(lastSnap); restore(undo.pop()); }
  function doRedo() { if (!redo.length || readOnly) return; undo.push(lastSnap); restore(redo.pop()); }
  function updateHistoryBtns() { undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length; }
  updateHistoryBtns();

  function setSaveState(s) {
    saveState.className = `save-state ${s === 'error' ? 'err' : ''}`;
    clear(saveState);
    saveState.append(s === 'saving' ? t('ed.saving') : s === 'pending' ? t('ed.unsaved') : s === 'error' ? t('ed.saveError') : t('ed.saved'));
  }
  const save = debounce(async () => {
    if (readOnly || !dirty) return;
    if (saving) { save(); return; }
    saving = true; setSaveState('saving');
    const payload = snapshot();
    const sentSnap = lastSnap;
    try {
      await PATCH(`/api/slides/${id}`, { ...payload, _audit: !audited }, { quiet: true });
      audited = true;
      if (lastSnap === sentSnap) { dirty = false; setSaveState('saved'); }
      changed();
    } catch (e) {
      setSaveState('error');
      toast(`${t('ed.saveError')}: ${e.message}`, 'err');
    } finally { saving = false; }
  }, 700);
  setLeaveGuard(() => dirty);

  // ---------------- Element operations ----------------
  function select(eid) { selId = eid; drawSel(); renderLayers(); renderProps(); }
  function addElement(el) {
    el.id = uid();
    slide.elements.push(el);
    updateEl(el); select(el.id); commit();
  }
  function removeSelected() {
    const el = sel(); if (!el || readOnly) return;
    slide.elements = slide.elements.filter(x => x.id !== el.id);
    view.stage.querySelector(`.el[data-id="${CSS.escape(el.id)}"]`)?.remove();
    select(null); commit();
  }
  function duplicateSelected() {
    const el = sel(); if (!el || readOnly) return;
    const copy = { ...structuredClone(el), x: el.x + 30, y: el.y + 30 };
    addElement(copy);
  }
  function reorder(delta) {
    const el = sel(); if (!el) return;
    const i = slide.elements.indexOf(el);
    let j = delta === 'front' ? slide.elements.length - 1 : delta === 'back' ? 0 : i + delta;
    j = Math.max(0, Math.min(slide.elements.length - 1, j));
    if (i === j) return;
    slide.elements.splice(i, 1); slide.elements.splice(j, 0, el);
    rebuild(); renderLayers(); commit();
  }
  function setProp(el, key, value, { rebuildAll = false, props = false } = {}) {
    if (value === '' || value == null) delete el[key]; else el[key] = value;
    rebuildAll ? rebuild() : updateEl(el);
    commit(`${el.id}.${key}`);
    if (props) renderProps();
    if (['hidden', 'locked', 'text', 'name'].includes(key)) renderLayers();
  }
  async function chooseAsset(el) {
    const a = await pickAsset({ kind: el.type === 'logo' ? 'logo' : 'media', filter: el.type === 'video' ? 'video' : el.type === 'image' ? 'image' : null });
    if (!a) return;
    assets[a.id] = a;
    el.assetId = a.id;
    if (a.width && a.height && ['image', 'logo', 'video'].includes(el.type)) {
      // keep the box width, adapt height to the media aspect ratio unless it is a full-bleed element
      const full = el.w >= W * 0.98 && el.h >= H * 0.98;
      if (!full) el.h = Math.round(el.w * a.height / a.width);
    }
    if (a.mime.startsWith('video/') && a.duration && !slide.useVideoLength && slide.duration < a.duration && slide.elements.filter(x => x.type === 'video').length === 1) {
      toast(t('ed.videoLonger', { s: Math.round(a.duration) }));
    }
    updateEl(el); commit(); renderProps(); renderLayers();
  }
  const newSize = (a, maxW, maxH) => {
    if (!a?.width) return { w: maxW, h: maxH };
    const r = Math.min(maxW / a.width, maxH / a.height);
    return { w: Math.round(a.width * r), h: Math.round(a.height * r) };
  };
  const center2 = (w, hh) => ({ x: Math.round((W - w) / 2), y: Math.round((H - hh) / 2), w, h: hh });

  async function add(type) {
    if (readOnly) return;
    switch (type) {
      case 'text': return addElement({ type: 'text', ...center2(1100, 220), text: t('ed.newText'), size: 88, weight: 700, color: '#ffffff', align: 'center', valign: 'middle', lineHeight: 1.2 });
      case 'image': case 'logo': case 'video': {
        const a = await pickAsset({ kind: type === 'logo' ? 'logo' : 'media', filter: type === 'video' ? 'video' : type === 'image' ? 'image' : null });
        if (!a) return;
        assets[a.id] = a;
        const isVid = a.mime.startsWith('video/');
        const sz = type === 'logo' ? newSize(a, 520, 260) : newSize(a, W * 0.6, H * 0.6);
        addElement({ type: isVid ? 'video' : type, assetId: a.id, ...center2(sz.w, sz.h), fit: type === 'logo' ? 'contain' : 'cover', ...(isVid ? { loop: true } : {}) });
        if (isVid && a.duration && a.duration > slide.duration && !slide.useVideoLength) toast(t('ed.videoLonger', { s: Math.round(a.duration) }));
        return;
      }
      case 'rect': return addElement({ type: 'shape', shape: 'rect', ...center2(700, 340), fill: '#0a6ebd', radius: 24 });
      case 'ellipse': return addElement({ type: 'shape', shape: 'ellipse', ...center2(420, 420), fill: '#0a6ebd' });
      case 'line': return addElement({ type: 'shape', shape: 'line', ...center2(900, 24), stroke: '#ffffff', strokeWidth: 6 });
      case 'clock': return addElement({ type: 'clock', format: 'time', ...center2(620, 160), size: 110, weight: 300, color: '#ffffff', align: 'center', lang: 'he' });
      case 'date': return addElement({ type: 'clock', format: 'date', ...center2(1100, 110), size: 56, weight: 400, color: '#ffffff', align: 'center', lang: 'he' });
      case 'countdown': return addElement({ type: 'countdown', ...center2(1500, 170), target: new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 16), size: 90, weight: 700, color: '#ffffff', align: 'center', lang: 'he' });
      case 'ticker': return addElement({ type: 'ticker', x: 0, y: H - 120, w: W, h: 120, text: t('ed.tickerText'), size: 56, color: '#ffffff', bg: 'rgba(0, 0, 0, 0.6)', speed: 120, direction: lang === 'he' ? 'rtl' : 'ltr' });
    }
  }

  // ---------------- Left panel: tools + layers ----------------
  const layersBox = h('div.layers');
  const toolBtn = (type, ic, label) => h('button', { type: 'button', onclick: () => add(type), disabled: readOnly }, icon(ic), label);
  left.append(
    h('div.ed-section', h('h4', t('ed.add')), h('div.tools',
      toolBtn('text', 'text', t('el.text')), toolBtn('image', 'image', t('el.image')), toolBtn('logo', 'logo', t('el.logo')), toolBtn('video', 'video', t('el.video')),
      toolBtn('rect', 'square', t('el.rect')), toolBtn('ellipse', 'circle', t('el.ellipse')), toolBtn('line', 'list', t('el.line')), toolBtn('clock', 'clock', t('el.clock')),
      toolBtn('date', 'calendar', t('el.date')), toolBtn('countdown', 'timer', t('el.countdown')), toolBtn('ticker', 'ticker', t('el.ticker')))),
    h('div.ed-section', h('h4', icon('layers'), t('ed.layers')), layersBox),
    h('div.ed-section', h('div.hint', t('ed.shortcuts'))));

  const elLabel = (el) => {
    if (el.name) return el.name;
    if (el.type === 'text' || el.type === 'ticker') return (el.text || '').split('\n')[0].slice(0, 30) || t(`el.${el.type}`);
    if (['image', 'logo', 'video'].includes(el.type)) return assets[el.assetId]?.name || t(`el.${el.type}`);
    if (el.type === 'shape') return t(`el.${el.shape === 'ellipse' ? 'ellipse' : el.shape === 'line' ? 'line' : 'rect'}`);
    return t(`el.${el.type}`);
  };
  const elIcon = (el) => ({ text: 'text', image: 'image', logo: 'logo', video: 'video', shape: el.shape === 'ellipse' ? 'circle' : 'square', clock: 'clock', countdown: 'timer', ticker: 'ticker' }[el.type] || 'square');
  function renderLayers() {
    clear(layersBox);
    if (!slide.elements.length) layersBox.appendChild(h('div.hint', t('ed.noLayers')));
    [...slide.elements].reverse().forEach(el => {
      layersBox.appendChild(h('div', { class: `layer-row ${el.id === selId ? 'on' : ''}`, onclick: () => select(el.id) },
        icon(elIcon(el)), h('span.ln', elLabel(el)),
        h('button', { title: el.hidden ? t('ed.show') : t('ed.hide'), onclick: (e) => { e.stopPropagation(); if (readOnly) return; el.hidden = !el.hidden; updateEl(el); commit(); renderLayers(); } }, icon(el.hidden ? 'eyeoff' : 'eye')),
        h('button', { title: el.locked ? t('ed.unlock') : t('ed.lock'), onclick: (e) => { e.stopPropagation(); if (readOnly) return; el.locked = !el.locked; drawSel(); commit(); renderLayers(); } }, icon(el.locked ? 'lock' : 'unlock'))));
    });
  }

  // ---------------- Right panel: properties ----------------
  const fld = (label, control, full = false) => h('div', { class: `fld ${full ? 'full' : ''}` }, h('span', label), control);
  const section = (title, ...kids) => h('div.ed-section', title ? h('h4', title) : null, ...kids);
  const num = (el, key, { min, max, step = 1, def = '', onSet } = {}) => h('input', { type: 'number', value: el[key] ?? def, min, max, step, disabled: readOnly,
    oninput: (e) => { const v = e.target.value === '' ? '' : Number(e.target.value); onSet ? onSet(v) : setProp(el, key, v); } });
  const chk = (el, key, label, opts = {}) => h('label.chk', h('input', { type: 'checkbox', checked: !!el[key], disabled: readOnly, onchange: (e) => setProp(el, key, e.target.checked, opts) }), label);

  function textControls(el, { textArea = true } = {}) {
    return [
      textArea ? fld(t('p.text'), h('textarea', { value: el.text || '', rows: 4, dir: 'auto', disabled: readOnly, oninput: (e) => setProp(el, 'text', e.target.value) }), true) : null,
      fld(t('p.font'), selectEl(el.font || '', fonts.map(f => [f, f || t('p.defaultFont')]), (v) => setProp(el, 'font', v), { disabled: readOnly })),
      h('div.grid2', fld(t('p.size'), num(el, 'size', { min: 8, max: 1000, def: 64 })), fld(t('p.weight'), selectEl(el.weight || 400, [[300, t('p.w.light')], [400, t('p.w.normal')], [600, t('p.w.semibold')], [700, t('p.w.bold')], [900, t('p.w.black')]], (v) => setProp(el, 'weight', Number(v)), { disabled: readOnly }))),
      fld(t('p.color'), colorField(el.color || '#ffffff', (v) => setProp(el, 'color', v))),
      fld(t('p.align'), segButtons(el.align || 'center', [['start', t('p.a.start'), document.dir === 'rtl' ? 'alignR' : 'alignL'], ['center', t('p.a.center'), 'alignC'], ['end', t('p.a.end'), document.dir === 'rtl' ? 'alignL' : 'alignR'], ['justify', t('p.a.justify'), 'alignJ']], (v) => setProp(el, 'align', v))),
    ];
  }

  function renderProps() {
    clear(right);
    const el = sel();
    if (!el) return renderSlideProps();
    const typeName = t(`el.${el.type === 'shape' ? (el.shape === 'ellipse' ? 'ellipse' : el.shape === 'line' ? 'line' : 'rect') : el.type}`);
    right.append(section(null, h('div.row', icon(elIcon(el)), h('b', typeName), h('span.sp'),
      h('button.btn.ghost.icon.sm', { title: `${t('duplicate')} (Ctrl+D)`, disabled: readOnly, onclick: duplicateSelected }, icon('copy')),
      h('button.btn.ghost.icon.sm', { title: `${t('delete')} (Del)`, disabled: readOnly, onclick: removeSelected }, icon('trash')))));

    // Type-specific
    switch (el.type) {
      case 'text':
        right.append(section(t('p.textSec'), ...textControls(el),
          fld(t('p.valign'), segButtons(el.valign || 'middle', [['top', t('p.v.top'), 'vTop'], ['middle', t('p.v.middle'), 'vMid'], ['bottom', t('p.v.bottom'), 'vBot']], (v) => setProp(el, 'valign', v))),
          h('div.grid2', fld(t('p.lineHeight'), num(el, 'lineHeight', { min: 0.6, max: 3, step: 0.05, def: 1.2 })), fld(t('p.letterSpacing'), num(el, 'letterSpacing', { min: -20, max: 100, def: 0 }))),
          fld(t('p.dir'), selectEl(el.dir || 'auto', [['auto', t('p.dir.auto')], ['rtl', t('p.dir.rtl')], ['ltr', t('p.dir.ltr')]], (v) => setProp(el, 'dir', v), { disabled: readOnly })),
          h('div.row.wrap', chk(el, 'italic', t('p.italic')), chk(el, 'underline', t('p.underline')), chk(el, 'uppercase', t('p.uppercase')), chk(el, 'shadow', t('p.shadow')), chk(el, 'autoFit', t('p.autoFit')))),
          section(t('p.boxSec'), fld(t('p.bg'), colorField(el.bg || '', (v) => setProp(el, 'bg', v), { allowNone: true })),
            h('div.grid2', fld(t('p.padding'), num(el, 'padding', { min: 0, max: 400, def: 0 })), fld(t('p.radius'), num(el, 'radius', { min: 0, max: 1000, def: 0 }))),
            h('div.grid2', fld(t('p.strokeW'), num(el, 'strokeWidth', { min: 0, max: 30, def: 0 })), fld(t('p.strokeC'), colorField(el.strokeColor || '#000000', (v) => setProp(el, 'strokeColor', v), { alpha: false })))));
        break;
      case 'image': case 'logo': case 'video': {
        const a = assets[el.assetId];
        right.append(section(t(`el.${el.type}`),
          h('div.row', a ? h('span.ellipsis.small', { style: { flex: 1 } }, a.name) : h('span.badge.warn', t('p.noAsset')), h('button.btn.sm', { disabled: readOnly, onclick: () => chooseAsset(el) }, icon('image'), a ? t('p.replace') : t('p.choose'))),
          fld(t('p.fit'), selectEl(el.fit || (el.type === 'logo' ? 'contain' : 'cover'), [['cover', t('p.fit.cover')], ['contain', t('p.fit.contain')], ['fill', t('p.fit.fill')]], (v) => setProp(el, 'fit', v), { disabled: readOnly })),
          fld(t('p.radius'), num(el, 'radius', { min: 0, max: 2000, def: 0 })),
          el.type === 'image' ? chk(el, 'kenburns', t('p.kenburns')) : null,
          el.type === 'video' ? h('div.row.wrap', chk(el, 'loop', t('p.loop')), settings.allowAudio ? chk(el, 'muted', t('p.muted')) : h('span.hint', t('p.audioOff'))) : null,
          el.type === 'video' && a?.duration ? h('div.hint', `${t('p.videoLen')}: ${Math.round(a.duration)} ${t('sec')}`) : null,
          h('div.row.wrap', chk(el, 'dropShadow', t('p.dropShadow')), chk(el, 'border', t('p.border'), { props: true })),
          el.border ? h('div.grid2', fld(t('p.strokeW'), num(el, 'borderWidth', { min: 1, max: 60, def: 4 })), fld(t('p.strokeC'), colorField(el.borderColor || '#ffffff', (v) => setProp(el, 'borderColor', v), { alpha: false }))) : null,
          a?.width ? h('button.btn.sm', { disabled: readOnly, onclick: () => { el.h = Math.round(el.w * a.height / a.width); updateEl(el); commit(); renderProps(); } }, t('p.resetAspect')) : null));
        break;
      }
      case 'shape':
        right.append(section(t('p.shapeSec'),
          fld(t('p.shape'), selectEl(el.shape || 'rect', [['rect', t('el.rect')], ['ellipse', t('el.ellipse')], ['line', t('el.line')]], (v) => setProp(el, 'shape', v, { props: true }), { disabled: readOnly })),
          el.shape === 'line' ? [fld(t('p.color'), colorField(el.stroke || '#ffffff', (v) => setProp(el, 'stroke', v))), fld(t('p.thickness'), num(el, 'strokeWidth', { min: 1, max: 200, def: 6 }))] : [
            fld(t('p.fill'), colorField(el.fill || '#0a6ebd', (v) => setProp(el, 'fill', v))),
            chk(el, 'gradient', t('p.gradient'), { props: true }),
            el.gradient ? [fld(t('p.fill2'), colorField(el.fill2 || '#0b2545', (v) => setProp(el, 'fill2', v))), fld(t('p.angle'), num(el, 'gradientAngle', { min: 0, max: 360, def: 135 }))] : null,
            h('div.grid2', fld(t('p.strokeW'), num(el, 'strokeWidth', { min: 0, max: 100, def: 0 })), fld(t('p.strokeC'), colorField(el.stroke || '#ffffff', (v) => setProp(el, 'stroke', v), { alpha: false }))),
            el.shape !== 'ellipse' ? fld(t('p.radius'), num(el, 'radius', { min: 0, max: 2000, def: 0 })) : null,
          ]));
        break;
      case 'clock':
        right.append(section(t('el.clock'),
          fld(t('p.format'), selectEl(el.format || 'time', [['time', t('p.f.time')], ['date', t('p.f.date')], ['shortdate', t('p.f.shortdate')], ['datetime', t('p.f.datetime')], ['weekday', t('p.f.weekday')], ['hebrew', t('p.f.hebrew')]], (v) => setProp(el, 'format', v), { disabled: readOnly })),
          fld(t('p.lang'), selectEl(el.lang || 'he', [['he', 'עברית'], ['en', 'English']], (v) => setProp(el, 'lang', v), { disabled: readOnly })),
          (el.format || 'time') === 'time' ? chk(el, 'seconds', t('p.seconds')) : null,
          ...textControls(el, { textArea: false }), chk(el, 'shadow', t('p.shadow')),
          fld(t('p.bg'), colorField(el.bg || '', (v) => setProp(el, 'bg', v), { allowNone: true }))));
        break;
      case 'countdown':
        right.append(section(t('el.countdown'),
          fld(t('p.target'), h('input', { type: 'datetime-local', value: el.target || '', disabled: readOnly, onchange: (e) => setProp(el, 'target', e.target.value) })),
          fld(t('p.lang'), selectEl(el.lang || 'he', [['he', 'עברית'], ['en', 'English']], (v) => setProp(el, 'lang', v), { disabled: readOnly })),
          h('div.row.wrap', h('label.chk', h('input', { type: 'checkbox', checked: el.seconds !== false, disabled: readOnly, onchange: (e) => setProp(el, 'seconds', e.target.checked) }), t('p.seconds'))),
          fld(t('p.doneText'), h('input', { type: 'text', value: el.doneText || '', disabled: readOnly, oninput: (e) => setProp(el, 'doneText', e.target.value) })),
          ...textControls(el, { textArea: false }), chk(el, 'shadow', t('p.shadow')),
          fld(t('p.bg'), colorField(el.bg || '', (v) => setProp(el, 'bg', v), { allowNone: true }))));
        break;
      case 'ticker':
        right.append(section(t('el.ticker'),
          fld(t('p.text'), h('textarea', { value: el.text || '', rows: 3, dir: 'auto', disabled: readOnly, oninput: (e) => setProp(el, 'text', e.target.value) }), true),
          h('div.grid2', fld(t('p.speed'), num(el, 'speed', { min: 20, max: 1000, def: 120 })), fld(t('p.direction'), selectEl(el.direction || 'rtl', [['rtl', t('p.dir.rtl')], ['ltr', t('p.dir.ltr')]], (v) => setProp(el, 'direction', v), { disabled: readOnly }))),
          fld(t('p.font'), selectEl(el.font || '', fonts.map(f => [f, f || t('p.defaultFont')]), (v) => setProp(el, 'font', v), { disabled: readOnly })),
          h('div.grid2', fld(t('p.size'), num(el, 'size', { min: 8, max: 400, def: 56 })), fld(t('p.weight'), selectEl(el.weight || 400, [[400, t('p.w.normal')], [600, t('p.w.semibold')], [700, t('p.w.bold')]], (v) => setProp(el, 'weight', Number(v)), { disabled: readOnly }))),
          fld(t('p.color'), colorField(el.color || '#ffffff', (v) => setProp(el, 'color', v))),
          fld(t('p.bg'), colorField(el.bg || 'rgba(0, 0, 0, 0.6)', (v) => setProp(el, 'bg', v), { allowNone: true })),
          fld(t('p.separator'), h('input', { type: 'text', value: el.separator ?? '   •   ', disabled: readOnly, oninput: (e) => setProp(el, 'separator', e.target.value) }))));
        break;
    }

    // Common: geometry, appearance, animation, arrange
    const geo = (key) => h('label', key.toUpperCase(), h('input', { type: 'number', value: el[key], disabled: readOnly, oninput: (e) => { el[key] = Number(e.target.value) || 0; updateEl(el); commit(`${el.id}.${key}`); } }));
    right.append(
      section(t('p.position'), h('div.mini', geo('x'), geo('y'), geo('w'), geo('h')),
        h('div.grid2', fld(t('p.rotation'), num(el, 'rotation', { min: -360, max: 360, def: 0 })),
          fld(t('p.opacity'), h('input', { type: 'range', min: 0, max: 100, value: Math.round((el.opacity ?? 1) * 100), disabled: readOnly, oninput: (e) => setProp(el, 'opacity', Number(e.target.value) / 100) }))),
        h('div.row.wrap',
          h('button.btn.sm', { disabled: readOnly, onclick: () => { el.x = Math.round((W - el.w) / 2); updateEl(el); commit(); renderProps(); } }, t('p.centerH')),
          h('button.btn.sm', { disabled: readOnly, onclick: () => { el.y = Math.round((H - el.h) / 2); updateEl(el); commit(); renderProps(); } }, t('p.centerV')),
          h('button.btn.sm', { disabled: readOnly, onclick: () => { Object.assign(el, { x: 0, y: 0, w: W, h: H }); updateEl(el); commit(); renderProps(); } }, t('p.fullscreen')))),
      section(t('p.animation'),
        fld(t('p.animType'), selectEl(el.anim?.type || 'none', ANIMS.map(a => [a, t(`anim.${a}`)]), (v) => { el.anim = { ...(el.anim || {}), type: v }; commit(`${el.id}.anim`); renderProps(); }, { disabled: readOnly })),
        el.anim?.type && el.anim.type !== 'none' ? h('div.grid2',
          fld(t('p.animDur'), h('input', { type: 'number', min: 100, max: 10000, step: 100, value: el.anim.duration ?? 900, disabled: readOnly, oninput: (e) => { el.anim.duration = Number(e.target.value); commit(`${el.id}.animd`); } })),
          fld(t('p.animDelay'), h('input', { type: 'number', min: 0, max: 30000, step: 100, value: el.anim.delay ?? 0, disabled: readOnly, oninput: (e) => { el.anim.delay = Number(e.target.value); commit(`${el.id}.animl`); } }))) : null,
        h('div.hint', t('p.animHint'))),
      section(t('p.arrange'), h('div.row.wrap',
        h('button.btn.sm', { disabled: readOnly, onclick: () => reorder('front') }, t('p.toFront')), h('button.btn.sm', { disabled: readOnly, onclick: () => reorder(1) }, t('p.forward')),
        h('button.btn.sm', { disabled: readOnly, onclick: () => reorder(-1) }, t('p.backward')), h('button.btn.sm', { disabled: readOnly, onclick: () => reorder('back') }, t('p.toBack'))),
        fld(t('p.layerName'), h('input', { type: 'text', value: el.name || '', placeholder: elLabel(el), disabled: readOnly, oninput: (e) => setProp(el, 'name', e.target.value) }))));
  }

  function renderSlideProps() {
    const bg = slide.background;
    const setBg = (k, v, rerender = false) => { if (v === '' || v == null) delete bg[k]; else bg[k] = v; rebuild(); commit(`bg.${k}`); if (rerender) renderProps(); };
    const minD = settings.minDuration || 1;
    const durIn = h('input', { type: 'number', min: minD, max: 3600, step: 1, value: slide.duration, disabled: readOnly || slide.useVideoLength, style: { maxWidth: '110px' },
      oninput: (e) => { const v = Number(e.target.value); if (v >= minD) { slide.duration = v; commit('duration'); } } });
    const bgAsset = assets[bg.assetId];
    right.append(
      section(t('ed.slideSettings'),
        h('div.row', switchEl(slide.enabled, (v) => { slide.enabled = v; commit(); }, { disabled: readOnly }), h('span', t('slide.enabledLbl'))),
        fld(t('slide.duration'), h('div.row', durIn, h('span.muted', t('sec')))),
        h('div.hint', t('slide.durationHint', { d: settings.defaultDuration, m: minD })),
        h('label.chk', h('input', { type: 'checkbox', checked: !!slide.useVideoLength, disabled: readOnly, onchange: (e) => { slide.useVideoLength = e.target.checked; durIn.disabled = e.target.checked; commit(); } }), t('slide.useVideoLength'))),
      section(t('slide.transition'),
        fld(t('slide.trType'), selectEl(slide.transition?.type || '', [['', `${t('default')} (${t(`tr.${settings.defaultTransition?.type || 'fade'}`)})`], ...store.meta.transitions.map(x => [x, t(`tr.${x}`)])], (v) => { slide.transition = { ...(slide.transition || {}), type: v || undefined }; if (!v) delete slide.transition.type; commit(); }, { disabled: readOnly })),
        fld(t('slide.trDur'), h('div.row', h('input', { type: 'number', min: 0, max: 5000, step: 100, value: slide.transition?.duration ?? '', placeholder: String(settings.defaultTransition?.duration ?? 1200), disabled: readOnly, style: { maxWidth: '110px' },
          oninput: (e) => { slide.transition = { ...(slide.transition || {}) }; if (e.target.value === '') delete slide.transition.duration; else slide.transition.duration = Number(e.target.value); commit('trd'); } }), h('span.muted', 'ms'))),
        h('div.hint', t('slide.trHint'))),
      section(t('slide.background'),
        fld(t('slide.bgType'), selectEl(bg.type || 'color', [['color', t('bg.color')], ['gradient', t('bg.gradient')], ['image', t('bg.image')], ['video', t('bg.video')]], (v) => setBg('type', v, true), { disabled: readOnly })),
        fld(t('p.color'), colorField(bg.color || '#000000', (v) => setBg('color', v), { alpha: false })),
        bg.type === 'gradient' ? [
          h('div.grid2', fld(t('bg.from'), colorField(bg.gradient?.from || '#0b2545', (v) => { bg.gradient = { ...(bg.gradient || {}), from: v }; rebuild(); commit('g1'); }, { alpha: false })),
            fld(t('bg.to'), colorField(bg.gradient?.to || '#0a6ebd', (v) => { bg.gradient = { ...(bg.gradient || {}), to: v }; rebuild(); commit('g2'); }, { alpha: false }))),
          h('div.grid2', fld(t('p.angle'), h('input', { type: 'number', min: 0, max: 360, value: bg.gradient?.angle ?? 135, disabled: readOnly, oninput: (e) => { bg.gradient = { ...(bg.gradient || {}), angle: Number(e.target.value) }; rebuild(); commit('g3'); } })),
            fld(t('bg.kind'), selectEl(bg.gradient?.kind || 'linear', [['linear', t('bg.linear')], ['radial', t('bg.radial')]], (v) => { bg.gradient = { ...(bg.gradient || {}), kind: v }; rebuild(); commit(); }, { disabled: readOnly }))),
        ] : null,
        bg.type === 'image' || bg.type === 'video' ? [
          h('div.row', bgAsset ? h('span.ellipsis.small', { style: { flex: 1 } }, bgAsset.name) : h('span.badge.warn', t('p.noAsset')),
            h('button.btn.sm', { disabled: readOnly, onclick: async () => { const a = await pickAsset({ filter: bg.type }); if (a) { assets[a.id] = a; setBg('assetId', a.id, true); } } }, icon('image'), bgAsset ? t('p.replace') : t('p.choose'))),
          fld(t('p.fit'), selectEl(bg.fit || 'cover', [['cover', t('p.fit.cover')], ['contain', t('p.fit.contain')]], (v) => setBg('fit', v), { disabled: readOnly })),
          bg.type === 'image' ? h('label.chk', h('input', { type: 'checkbox', checked: !!bg.kenburns, disabled: readOnly, onchange: (e) => setBg('kenburns', e.target.checked) }), t('p.kenburns')) : null,
        ] : null,
        fld(t('bg.overlay'), colorField(bg.overlay || '', (v) => setBg('overlay', v), { allowNone: true })),
        h('div.hint', t('bg.overlayHint'))),
      section(t('slide.schedule'),
        h('div.hint', t('slide.scheduleHint')),
        ruleEditor(slide.schedule?.rules || [], (rules) => { slide.schedule = { rules }; commit('sched'); })),
      section(null, h('div.small.muted', `${t('slide.updated')}: ${new Date(slide.updatedAt).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB')}${slide.updatedBy ? ` · ${slide.updatedBy}` : ''}`)));
  }

  // ---------------- Keyboard ----------------
  const onKey = (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable) return;
    if (document.querySelector('.modal-bg')) return;
    const el = sel();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save.flush(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (mod && e.key.toLowerCase() === 'c' && el) { localStorage.setItem('emtv.clipboard', JSON.stringify(el)); toast(t('copied')); return; }
    if (mod && e.key.toLowerCase() === 'v' && !readOnly) {
      try { const c = JSON.parse(localStorage.getItem('emtv.clipboard') || 'null'); if (c) { addElement({ ...c, x: c.x + 30, y: c.y + 30 }); } } catch {}
      return;
    }
    if (e.key === 'Escape') { select(null); return; }
    if (!el || readOnly) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
    const step = e.shiftKey ? 10 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key] && !el.locked) {
      e.preventDefault();
      el.x += moves[e.key][0]; el.y += moves[e.key][1];
      updateEl(el); commit(`${el.id}.nudge`);
    }
  };
  document.addEventListener('keydown', onKey);

  rebuild(); renderLayers(); renderProps();

  return async () => {
    document.removeEventListener('keydown', onKey);
    ro.disconnect();
    if (dirty) await save.flush();
    view?.destroy();
  };
}
