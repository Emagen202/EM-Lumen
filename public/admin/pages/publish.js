import { h, t, icon, GET, POST, store, can, clear, toast, confirmDlg, fmtDateTime, emit } from '../lib.js';
import { publishNow, refreshPublish } from '../app.js';

export default async function publishPage(root) {
  const statusBox = h('div');
  const table = h('div');
  const load = async () => {
    await refreshPublish();
    const p = store.meta.publish;
    const pubs = await GET('/api/publications');
    clear(statusBox);
    statusBox.append(h('div.row',
      h('div.col', { style: { gap: '4px' } },
        h('b', { style: { fontSize: '16px' } }, p.hasChanges ? t('pub.dirty') : t('pub.allLive')),
        h('span.muted', `${t('pub.current')}: v${p.version} · ${fmtDateTime(p.publishedAt)}${p.publishedBy ? ` · ${p.publishedBy}` : ''}`),
        p.changedAt ? h('span.muted.small', `${t('pub.lastChange')}: ${fmtDateTime(p.changedAt)}`) : null),
      h('span.sp'),
      can('editor') ? h('button.btn.primary', { onclick: async () => { await publishNow(); load(); } }, icon('send'), t('pub.publish')) : null));
    clear(table);
    table.appendChild(pubs.length ? h('table.t', h('thead', h('tr', h('th', t('pub.version')), h('th', t('pub.when')), h('th', t('pub.by')), h('th', t('pub.note')), h('th', ''))),
      h('tbody', pubs.map((x, i) => h('tr',
        h('td', h('b', `v${x.version}`), i === 0 ? h('span.badge.ok', { style: { marginInlineStart: '8px' } }, t('pub.live')) : null),
        h('td.small', fmtDateTime(x.created_at)), h('td.small', x.created_by || ''), h('td.small', x.note || ''),
        h('td', i > 0 && can('editor') ? h('button.btn.sm', { onclick: async () => {
          if (!await confirmDlg(t('pub.rollbackConfirm', { v: x.version }), { danger: false })) return;
          const r = await POST(`/api/publications/${x.version}/rollback`); toast(t('pub.done', { v: r.version }), 'ok'); load();
        } }, icon('history'), t('pub.rollback')) : null))))) : h('div.empty', t('pub.none')));
  };
  root.append(
    h('div.page-head', h('div', h('h2', t('nav.publish')), h('p', t('pub.sub')))),
    h('div.card', { style: { marginBottom: '16px' } }, h('div.bd', statusBox)),
    h('div.card', h('div.hd', h('h3', t('pub.history'))), table));
  await load();
}
