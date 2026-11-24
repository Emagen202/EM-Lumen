import { h, t, icon, GET, POST, PATCH, DEL, store, can, clear, toast, confirmDlg, promptDlg, copyText, relTime, catName } from '../lib.js';

export default async function screensPage(root) {
  const list = h('div.cards');
  const load = async () => {
    const [screens, cats] = await Promise.all([GET('/api/screens'), GET('/api/categories')]);
    const latest = store.meta.publish?.version;
    clear(list);
    if (!screens.length) list.appendChild(h('div.card', h('div.empty', t('screens.none'))));
    for (const s of screens) {
      const st = s.status || {};
      const cat = cats.find(c => c.id === st.categoryId);
      list.appendChild(h('div.card',
        h('div.hd', h('span', { class: `dot ${s.online ? 'ok' : 'bad'}` }), h('h3', s.name),
          s.online ? h('span.badge.ok', t('screens.online')) : h('span.badge.bad', t('screens.offline')),
          st.version != null ? h('span', { class: `badge ${st.version === latest ? 'ok' : 'warn'}` }, `${t('screens.content')} v${st.version}${st.version !== latest ? ` / v${latest}` : ''}`) : null,
          st.sw === false && s.online ? h('span.badge.warn', { title: t('screens.noSwHint') }, t('screens.noSw')) : null,
          h('span.sp'),
          can('editor') ? h('button.btn.sm', { onclick: async () => { await POST(`/api/screens/${s.id}/reload`); toast(t('screens.reloadSent'), 'ok'); } }, icon('refresh'), t('screens.reload')) : null,
          can('admin') ? [
            h('button.btn.ghost.icon.sm', { title: t('rename'), onclick: async () => { const n = await promptDlg(t('rename'), s.name); if (n) { await PATCH(`/api/screens/${s.id}`, { name: n }); load(); } } }, icon('edit')),
            h('button.btn.ghost.icon.sm', { title: t('delete'), onclick: async () => { if (await confirmDlg(t('screens.deleteConfirm', { name: s.name }))) { await DEL(`/api/screens/${s.id}`); load(); } } }, icon('trash')),
          ] : null),
        h('div.bd.screen-details',
          h('div.col',
            h('label.f', h('span', t('screens.url')), h('div.row', h('input', { type: 'text', value: s.url, readOnly: true, class: 'mono', onclick: (e) => e.target.select() }),
              h('button.btn.icon', { title: t('copy'), onclick: () => copyText(s.url) }, icon('copy')), h('a.btn.icon', { href: s.url, target: '_blank', title: t('openNewTab') }, icon('link')))),
            h('div.row.wrap', h('span.hint', t('screens.installHint')), h('span.sp'), can('editor') ? h('a.btn.primary', { href: `/api/screens/${s.id}/kiosk-installer`, download: '' }, icon('download'), t('screens.download')) : null)),
          h('div.kv',
            h('span', t('screens.lastSeen2')), h('span', s.lastSeen ? relTime(s.lastSeen) : t('never')),
            h('span', t('screens.nowShowing')), h('span', st.idle ? t('dash.idle') : st.slideName ? `${st.slideName}${cat ? ` · ${catName(cat)}` : ''}` : '—'),
            h('span', t('screens.cache')), h('span', st.cache ? `${st.cache.cached}/${st.cache.total}${st.cache.syncing ? ' ⟳' : ''}` : '—'),
            h('span', t('screens.resolution')), h('span.ltr', st.resolution || '—'),
            h('span', t('screens.uptime')), h('span', st.uptime ? `${Math.floor(st.uptime / 3600)}h ${Math.floor(st.uptime % 3600 / 60)}m` : '—'),
            h('span', 'IP'), h('span.ltr', s.lastIp || '—'),
            h('span', t('screens.player')), h('span.ltr', st.playerVersion ? `v${st.playerVersion}` : '—'),
            st.errors?.length ? [h('span', t('screens.errors')), h('span.small.mono', { style: { color: 'var(--bad)' } }, st.errors.slice(-2).join('\n'))] : null))));
    }
  };
  root.append(
    h('div.page-head', h('div', h('h2', t('nav.screens')), h('p', t('screens.sub'))), h('span.sp'),
      can('admin') ? h('button.btn.primary', { onclick: async () => { const n = await promptDlg(t('screens.new'), '', { placeholder: t('screens.namePh') }); if (n) { await POST('/api/screens', { name: n }); load(); } } }, icon('plus'), t('screens.new')) : null),
    list);
  await load();
  const timer = setInterval(() => load().catch(() => {}), 15000);
  return () => clearInterval(timer);
}
