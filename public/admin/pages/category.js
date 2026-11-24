import { h, t, icon, GET, POST, PATCH, DEL, store, can, catName, clear, toast, confirmDlg, modal, changed } from '../lib.js';
import { uploadMany, fileInput, switchEl, ruleEditor, colorField, selectEl, fluidThumb, assetsMap, previewModal, templates, slideThumb } from '../components.js';
import { rulesMatch, localParts, slideDuration } from '/shared/schedule.js';

export default async function categoryPage(root, [idStr], { setTitle }) {
  const id = Number(idStr);
  let [cat, slides, assets, screens, cats] = await Promise.all([
    GET('/api/categories').then(l => l.find(c => c.id === id)), GET(`/api/slides?category=${id}`), GET('/api/assets'), GET('/api/screens'), GET('/api/categories'),
  ]);
  if (!cat) { root.appendChild(h('div.empty', t('notFound'))); return; }
  store.categories = cats;
  let amap = assetsMap(assets);
  const settings = store.meta.playerSettings;
  setTitle(catName(cat));
  let tab = sessionStorage.getItem('emtv.catTab') || 'slides';

  const progress = h('div');
  let uploading = false;
  const uploadInput = fileInput('image/*', true, async (files) => {
    if (uploading || !can('editor')) return;
    uploading = true;
    try {
      const created = await uploadMany(files.filter(f => f.type.startsWith('image/')), 'media', progress);
      for (const a of created) {
        await POST('/api/slides', { categoryId: id, name: a.name, duration: settings.defaultDuration,
          background: { type: 'image', assetId: a.id, fit: 'contain', color: '#101820' }, elements: [] });
      }
      if (created.length) { assets = await GET('/api/assets'); amap = assetsMap(assets); changed(); await reloadSlides(); }
    } finally { uploading = false; }
  });
  const head = h('div.page-head');
  const tabs = h('div.tabs');
  const body = h('div');

  const renderHead = () => {
    clear(head);
    head.append(
      h('a.btn.ghost.icon', { href: '#/categories', title: t('back') }, icon(document.dir === 'rtl' ? 'fwd' : 'back')),
      h('span.dot', { style: { background: cat.color, width: '14px', height: '14px' } }),
      h('div', h('h2', catName(cat)), h('p', cat.isDefault ? t('cat.defaultHint') : cat.mode === 'replace' ? t('cat.modeReplaceLong') : t('cat.modeMergeLong'))),
      h('span.sp'),
      h('button.btn', { onclick: () => previewModal(`category=${id}`, catName(cat)) }, icon('play'), t('cat.preview')),
      can('editor') ? h('button.btn.primary', { onclick: () => uploadInput.click() }, icon('upload'), t('slide.upload')) : null,
      can('editor') ? h('button.btn', { onclick: () => newSlide() }, icon('plus'), t('slide.new')) : null);
  };
  const renderTabs = () => {
    clear(tabs);
    for (const [k, l] of [['slides', `${t('slidesTab')} (${slides.length})`], ['settings', t('cat.settingsTab')]]) {
      tabs.appendChild(h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; sessionStorage.setItem('emtv.catTab', k); renderTabs(); renderBody(); } }, l));
    }
  };

  const reloadSlides = async () => { slides = await GET(`/api/slides?category=${id}`); renderTabs(); renderBody(); };

  // ------------------------------------------------ Slides grid
  const renderSlides = () => {
    const grid = h('div.slides-grid');
    let dragId = null;
    const parts = localParts(new Date(), store.meta.settings.timezone);
    slides.forEach((s, i) => {
      const scheduled = s.schedule?.rules?.length;
      const activeBySched = !scheduled || rulesMatch(s.schedule.rules, parts, store.meta.holidayDates);
      const dur = slideDuration(s, settings);
      const card = h('div', { class: `slide-card ${s.enabled ? '' : 'off'}`, draggable: can('editor') ? 'true' : null, dataset: { id: s.id } },
        h('span.num', String(i + 1)),
        scheduled ? h('span', { class: `badge sched ${activeBySched ? 'ok' : 'warn'}`, title: t('slide.hasSchedule') }, icon('clock'), activeBySched ? t('slide.inWindow') : t('slide.outWindow')) : null,
        h('div.thumb', { onclick: () => { location.hash = `#/editor/${s.id}`; } }, fluidThumb(s, amap, settings)),
        h('div.meta',
          h('div.row', h('span.name.ellipsis', s.name || t('slide.untitled')), h('span.sp'), can('editor') ? switchEl(s.enabled, async (v) => { await PATCH(`/api/slides/${s.id}`, { enabled: v }); s.enabled = v; card.classList.toggle('off', !v); changed(); }) : null),
          h('div.row.small.muted', icon('timer'), s.useVideoLength ? t('slide.videoLength') : `${dur} ${t('sec')}`, h('span', '·'), t(`tr.${s.transition?.type || settings.defaultTransition?.type || 'fade'}`)),
          h('div.row', { style: { gap: '2px', marginInline: '-6px' } },
            h('button.btn.ghost.icon.sm', { title: t('preview'), onclick: () => previewModal(`slide=${s.id}`, s.name) }, icon('eye')),
            can('editor') ? [
              h('button.btn.ghost.icon.sm', { title: t('edit'), onclick: () => { location.hash = `#/editor/${s.id}`; } }, icon('edit')),
              h('button.btn.ghost.icon.sm', { title: t('slide.duplicateMove'), onclick: () => duplicateDlg(s) }, icon('copy')),
              ...[-1, 1].map(delta => h('button.btn.ghost.icon.sm', { title: t(delta < 0 ? 'slide.earlier' : 'slide.later'), disabled: i + delta < 0 || i + delta >= slides.length, onclick: async () => { const ids = slides.map(x => x.id); [ids[i], ids[i + delta]] = [ids[i + delta], ids[i]]; await POST('/api/slides/reorder', { ids }); changed(); reloadSlides(); } }, icon(delta < 0 ? 'back' : 'fwd'))),
              h('span.sp'),
              h('button.btn.ghost.icon.sm', { title: t('delete'), onclick: async () => {
                if (!await confirmDlg(t('slide.deleteConfirm', { name: s.name }))) return;
                await DEL(`/api/slides/${s.id}`); changed(); reloadSlides();
              } }, icon('trash')),
            ] : null)));
      if (can('editor')) {
        card.addEventListener('dragstart', (e) => { dragId = s.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); grid.querySelectorAll('.drop-before').forEach(x => x.classList.remove('drop-before')); });
        card.addEventListener('dragover', (e) => { if (dragId && dragId !== s.id) { e.preventDefault(); grid.querySelectorAll('.drop-before').forEach(x => x.classList.remove('drop-before')); card.classList.add('drop-before'); } });
        card.addEventListener('drop', async (e) => {
          e.preventDefault();
          const ids = slides.map(x => x.id).filter(x => x !== dragId);
          ids.splice(ids.indexOf(s.id), 0, dragId);
          slides.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
          renderBody();
          await POST('/api/slides/reorder', { ids }); changed();
        });
      }
      grid.appendChild(card);
    });
    if (can('editor')) grid.appendChild(h('button.add-card', { onclick: () => newSlide() }, h('div.col', { style: { alignItems: 'center' } }, icon('plus'), t('slide.new'))));
    if (!slides.length) body.appendChild(h('div.hint', { style: { marginBottom: '12px' } }, t('cat.emptySlides')));
    body.appendChild(grid);
    if (can('editor') && slides.length > 1) body.appendChild(h('div.hint', { style: { marginTop: '12px' } }, t('slide.dragHint')));
  };

  const duplicateDlg = (s) => {
    let target = String(id);
    modal({
      title: t('slide.duplicateMove'),
      body: h('div.col', h('label.f', h('span', t('slide.targetCat')), selectEl(target, store.categories.map(c => [c.id, catName(c)]), (v) => { target = v; }))),
      footer: (close) => [
        h('button.btn', { onclick: close }, t('cancel')),
        Number(target) !== id || true ? h('button.btn', { onclick: async () => {
          if (Number(target) === id) return toast(t('slide.sameCat'), 'err');
          await PATCH(`/api/slides/${s.id}`, { categoryId: Number(target) }); close(); changed(); toast(t('slide.moved'), 'ok'); reloadSlides();
        } }, t('slide.move')) : null,
        h('button.btn.primary', { onclick: async () => { await POST(`/api/slides/${s.id}/duplicate`, { categoryId: Number(target) }); close(); changed(); toast(t('slide.duplicated'), 'ok'); reloadSlides(); } }, t('slide.duplicate')),
      ],
    });
  };

  const newSlide = () => {
    const grid = h('div.tpl-grid');
    const m = modal({ title: t('slide.chooseTemplate'), xwide: true, body: grid });
    for (const tpl of templates(settings)) {
      grid.appendChild(h('div.tpl', { onclick: async () => {
        const s = await POST('/api/slides', { categoryId: id, name: tpl.name, background: tpl.background, elements: tpl.elements, transition: tpl.transition, useVideoLength: !!tpl.useVideoLength, duration: settings.defaultDuration });
        m.close(); changed(); location.hash = `#/editor/${s.id}`;
      } }, fluidThumb({ background: tpl.background, elements: tpl.elements }, {}, settings), h('div.tn', tpl.name)));
    }
  };

  // ------------------------------------------------ Settings form
  const renderSettings = () => {
    const d = structuredClone(cat);
    const ro = !can('editor');
    const screenChecks = h('div.row.wrap', screens.map(s => h('label.chk', h('input', { type: 'checkbox', checked: d.screens.includes(s.id), disabled: ro, onchange: (e) => {
      d.screens = e.target.checked ? [...d.screens, s.id] : d.screens.filter(x => x !== s.id);
    } }), s.name)));
    const form = h('div.cards', { style: { maxWidth: '860px' } },
      h('div.card', h('div.hd', h('h3', t('cat.general'))), h('div.bd.col',
        h('div.grid2',
          h('label.f', h('span', t('cat.nameHe')), h('input', { type: 'text', dir: 'rtl', value: d.name_he, disabled: ro, oninput: (e) => { d.name_he = e.target.value; } })),
          h('label.f', h('span', t('cat.nameEn')), h('input', { type: 'text', dir: 'ltr', value: d.name_en, disabled: ro, oninput: (e) => { d.name_en = e.target.value; } }))),
        h('div.grid2',
          h('label.f', h('span', t('cat.color')), colorField(d.color, (v) => { d.color = v; }, { alpha: false })),
          h('label.f', h('span', t('cat.status')), h('div.row', switchEl(d.active, (v) => { d.active = v; }, { disabled: ro }), h('span', t('cat.activeLbl'))))),
        d.isDefault ? h('div.hint', t('cat.defaultHint')) : h('label.chk', h('input', { type: 'checkbox', disabled: ro, onchange: (e) => { d.isDefault = e.target.checked; } }), t('cat.makeDefault')))),
      !d.isDefault ? h('div.card', h('div.hd', h('h3', t('cat.behavior'))), h('div.bd.col',
        h('label.f', h('span', t('cat.mode')), selectEl(d.mode, [['replace', t('cat.modeReplaceLong')], ['merge', t('cat.modeMergeLong')]], (v) => { d.mode = v; }, { disabled: ro })),
        h('label.f', h('span', t('cat.priority')), h('input', { type: 'number', value: d.priority, min: 0, max: 1000, disabled: ro, style: { maxWidth: '140px' }, oninput: (e) => { d.priority = Number(e.target.value); } })),
        h('div.hint', t('cat.priorityHint')))) : null,
      h('div.card', h('div.hd', h('h3', t('cat.schedule'))), h('div.bd.col',
        h('div.hint', d.isDefault ? t('cat.defaultRulesHint') : t('cat.rulesHint')),
        ruleEditor(d.rules, (r) => { d.rules = r; }))),
      screens.length > 1 ? h('div.card', h('div.hd', h('h3', t('cat.screens'))), h('div.bd.col', h('div.hint', t('cat.screensHint')), screenChecks)) : null,
      !ro ? h('div.row',
        !d.isDefault ? h('button.btn.danger', { onclick: async () => {
          if (!await confirmDlg(t('cat.deleteConfirm', { name: catName(cat), n: slides.length }))) return;
          await DEL(`/api/categories/${id}`); changed(); location.hash = '#/categories';
        } }, icon('trash'), t('cat.delete')) : null,
        h('span.sp'),
        h('button.btn.primary', { onclick: async () => {
          if (!d.name_he.trim()) return toast(t('cat.nameRequired'), 'err');
          cat = await PATCH(`/api/categories/${id}`, { name_he: d.name_he, name_en: d.name_en, color: d.color, active: d.active, mode: d.mode, priority: d.priority, rules: d.rules, screens: d.screens, isDefault: d.isDefault || undefined });
          changed(); toast(t('saved'), 'ok'); setTitle(catName(cat)); renderHead();
        } }, icon('check'), t('save'))) : null);
    body.appendChild(form);
  };

  const renderBody = () => { clear(body); tab === 'settings' ? renderSettings() : renderSlides(); };
  renderHead(); renderTabs(); renderBody();
  root.append(head, h('p.hint', t('slide.uploadHint')), uploadInput, progress, tabs, body);
}
