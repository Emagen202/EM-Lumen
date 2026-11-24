import { h, t, icon, GET, POST, PATCH, DEL, can, clear, toast, confirmDlg, promptDlg, copyText, changed, fmtSize, modal, catName, store } from '../lib.js';
import { assetCard, uploadMany, fileInput, ACCEPT, selectEl } from '../components.js';
import { installFonts } from '/shared/render.js';

export default async function mediaPage(root) {
  let tab = sessionStorage.getItem('emtv.mediaTab') || 'media';
  let query = '';
  let folder = '';
  const folderPrefix = 'folder:';
  const folderOf = a => (a.tags || '').split(',').find(t => t.trim().startsWith(folderPrefix))?.trim().slice(folderPrefix.length) || '';
  const folderBar = h('div.row.wrap.media-folders');
  const categories = await GET('/api/categories');
  function chooseSlide(a) {
    let categoryId = String(categories[0]?.id || '');
    const m = modal({ title: t('media.selectCategory'), body: selectEl(categoryId, categories.map(c => [c.id, catName(c)]), v => { categoryId = v; }), footer: close => [
      h('button.btn', { onclick: close }, t('cancel')),
      h('button.btn.primary', { disabled: !categoryId, onclick: async () => {
        await POST('/api/slides', { categoryId: Number(categoryId), name: a.name, duration: store.meta.playerSettings.defaultDuration,
          background: { type: 'image', assetId: a.id, fit: 'contain', color: '#101820' }, elements: [] });
        changed(); close(); toast(t('media.addedSlide'), 'ok');
      } }, t('media.createSlide'))
    ] });
  }
  async function moveFolder(a) {
    const name = await promptDlg(t('media.folderName'), folderOf(a));
    if (name === null) return;
    const tags = (a.tags || '').split(',').filter(t => t && !t.trim().startsWith(folderPrefix));
    if (name.trim()) tags.push(folderPrefix + name.trim().replaceAll(',', ' ').slice(0, 70));
    await PATCH(`/api/assets/${a.id}`, { tags: tags.join(',') }); load();
  }
  const tabs = h('div.tabs');
  const grid = h('div.media-grid');
  const prog = h('div');
  const search = h('input', { type: 'search', placeholder: t('search'), style: { maxWidth: '260px' }, oninput: (e) => { query = e.target.value.toLowerCase(); load(); } });

  const hint = h('div.hint');
  const inp = fileInput('', true, (files) => doUpload(files));
  const dz = h('div.dropzone', { onclick: () => inp.click() }, icon('upload'), h('div', { style: { fontWeight: 600, marginTop: '6px' } }, t('media.drop')), hint);
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); doUpload([...e.dataTransfer.files]); });

  async function doUpload(files) {
    if (!can('editor')) return;
    const created = await uploadMany(files, tab === 'font' ? 'media' : tab, prog);
    if (folder && folder !== '__none') for (const a of created) await PATCH(`/api/assets/${a.id}`, { tags: folderPrefix + folder });
    if (created.length) { toast(t('media.uploaded', { n: created.length }), 'ok'); if (tab === 'font') changed(); }
    load();
  }

  const renderTabs = () => {
    clear(tabs);
    for (const [k, l] of [['media', t('media.tabMedia')], ['logo', t('media.tabLogos')], ['font', t('media.tabFonts')]]) {
      tabs.appendChild(h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; sessionStorage.setItem('emtv.mediaTab', k); renderTabs(); load(); } }, l));
    }
    inp.accept = ACCEPT[tab];
    hint.textContent = t(`media.hint.${tab}`);
  };

  async function load() {
    const all = await GET(`/api/assets?kind=${tab}`);
    const folders = [...new Set(all.map(folderOf).filter(Boolean).concat(folder && folder !== '__none' ? [folder] : []))].sort();
    clear(folderBar);
    folderBar.append(selectEl(folder, [['', t('media.allFolders')], ['__none', t('media.uncategorized')], ...folders.map(f => [f, f])], v => { folder = v; load(); }),
      can('editor') ? h('button.btn', { onclick: async () => { const name = await promptDlg(t('media.folderName')); if (name?.trim()) { folder = name.trim().replaceAll(',', ' ').slice(0, 70); load(); } } }, icon('plus'), t('media.newFolder')) : null);
    const list = all.filter(a => (!query || a.name.toLowerCase().includes(query)) && (!folder || (folder === '__none' ? !folderOf(a) : folderOf(a) === folder)));
    if (tab === 'font') installFonts(list.map(a => ({ family: a.name, url: a.url })));
    clear(grid);
    if (!list.length) grid.appendChild(h('div.empty', { style: { gridColumn: '1/-1' } }, icon('image'), h('div', t('media.empty'))));
    for (const a of list) {
      const actions = can('editor') ? [
        h('button.btn.ghost.icon.sm', { title: t('media.folder'), onclick: () => moveFolder(a) }, icon('layers')),
        a.mime.startsWith('image/') ? h('button.btn.ghost.icon.sm', { title: t('media.createSlide'), onclick: () => chooseSlide(a) }, icon('plus')) : null,
        h('button.btn.ghost.icon.sm', { title: t('rename'), onclick: async () => { const n = await promptDlg(t('rename'), a.name); if (n && n !== a.name) { await PATCH(`/api/assets/${a.id}`, { name: n }); load(); } } }, icon('edit')),
        a.kind !== 'font' ? h('button.btn.ghost.icon.sm', { title: a.kind === 'logo' ? t('media.toMedia') : t('media.toLogos'), onclick: async () => { await PATCH(`/api/assets/${a.id}`, { kind: a.kind === 'logo' ? 'media' : 'logo' }); toast(t('media.movedOk'), 'ok'); load(); } }, icon(a.kind === 'logo' ? 'image' : 'logo')) : null,
        h('button.btn.ghost.icon.sm', { title: t('media.copyUrl'), onclick: () => copyText(new URL(a.url, location.origin).href) }, icon('link')),
        h('span.sp'),
        h('button.btn.ghost.icon.sm', { title: t('delete'), onclick: async () => {
          const usage = await GET(`/api/assets/${a.id}/usage`);
          const msg = usage.length ? t('media.inUse', { n: usage.length, names: usage.map(u => u.name).slice(0, 5).join(', ') }) : t('media.deleteConfirm', { name: a.name });
          if (!await confirmDlg(msg)) return;
          await DEL(`/api/assets/${a.id}${usage.length ? '?force=1' : ''}`); changed(); load();
        } }, icon('trash')),
      ] : null;
      grid.appendChild(assetCard(a, { actions }));
    }
  }

  root.append(
    h('div.page-head', h('div', h('h2', t('nav.media')), h('p', t('media.sub'))), h('span.sp'), search),
    tabs, folderBar, can('editor') ? h('div', { style: { marginBottom: '16px' } }, dz, inp, prog) : null, grid);
  renderTabs(); load();
}
