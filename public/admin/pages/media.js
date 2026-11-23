import { h, t, icon, GET, PATCH, DEL, can, clear, toast, confirmDlg, promptDlg, copyText, changed, fmtSize } from '../lib.js';
import { assetCard, uploadMany, fileInput, ACCEPT } from '../components.js';
import { installFonts } from '/shared/render.js';

export default async function mediaPage(root) {
  let tab = sessionStorage.getItem('emtv.mediaTab') || 'media';
  let query = '';
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
    const list = (await GET(`/api/assets?kind=${tab}`)).filter(a => !query || a.name.toLowerCase().includes(query));
    if (tab === 'font') installFonts(list.map(a => ({ family: a.name, url: a.url })));
    clear(grid);
    if (!list.length) grid.appendChild(h('div.empty', { style: { gridColumn: '1/-1' } }, icon('image'), h('div', t('media.empty'))));
    for (const a of list) {
      const actions = can('editor') ? [
        h('button.btn.ghost.icon.sm', { title: t('rename'), onclick: async () => { const n = await promptDlg(t('rename'), a.name); if (n && n !== a.name) { await PATCH(`/api/assets/${a.id}`, { name: n }); load(); } } }, icon('edit')),
        a.kind !== 'font' ? h('button.btn.ghost.icon.sm', { title: a.kind === 'logo' ? t('media.toMedia') : t('media.toLogos'), onclick: async () => { await PATCH(`/api/assets/${a.id}`, { kind: a.kind === 'logo' ? 'media' : 'logo' }); toast(t('media.movedOk'), 'ok'); load(); } }, icon(a.kind === 'logo' ? 'image' : 'logo')) : null,
        h('button.btn.ghost.icon.sm', { title: t('media.copyUrl'), onclick: () => copyText(location.origin + a.url) }, icon('link')),
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
    tabs, can('editor') ? h('div', { style: { marginBottom: '16px' } }, dz, inp, prog) : null, grid);
  renderTabs(); load();
}
