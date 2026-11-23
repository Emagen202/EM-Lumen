import { h, t, icon, GET, store, can, relTime, catName, clear, fmtDateTime } from '../lib.js';
import { publishNow } from '../app.js';
import { resolvePlaylist, localParts } from '/shared/schedule.js';

export default async function dashboard(root) {
  const [screens, cats, manifest] = await Promise.all([GET('/api/screens'), GET('/api/categories'), GET('/api/preview-manifest')]);
  const tz = store.meta.settings.timezone;
  const now = resolvePlaylist(manifest, localParts(new Date(), tz), {});
  const online = screens.filter(s => s.online).length;
  const pub = store.meta.publish;
  const totalSlides = cats.reduce((a, c) => a + c.slideCount, 0);

  const stat = (v, l, cls = '') => h('div.card.stat', h('div', { class: `v ${cls}` }, v), h('div.l', l));
  root.append(
    h('div.page-head', h('div', h('h2', t('dash.hello', { name: (store.me.name || '').split(' ')[0] || '' })), h('p', t('dash.sub')))),
    h('div.grid4', { style: { marginBottom: '16px' } },
      stat(`${online}/${screens.length}`, t('dash.screensOnline')),
      stat(String(now.slides.length), t('dash.playingNow')),
      stat(String(totalSlides), t('dash.totalSlides')),
      stat(`v${pub.version}`, pub.hasChanges ? t('pub.dirty') : t('dash.published'), pub.hasChanges ? 'warn' : '')),
  );

  const nowCard = h('div.card',
    h('div.hd', h('h2', t('dash.nowPlaying')), h('span.sp'), now.mode === 'replace' ? h('span.badge.warn', t('dash.override')) : null,
      h('span.badge', t('dash.draftNote'))),
    h('div.bd.col',
      h('iframe.preview-frame', { src: '/player/preview?preview=1', allow: 'autoplay' }),
      h('div.row.wrap', now.categories.length ? now.categories.map(c => h('span.badge', { style: { background: c.color + '22', color: c.color } }, catName(c))) : h('span.muted', t('dash.idle'))),
      pub.hasChanges && can('editor') ? h('div.row', h('span.hint', t('dash.unpublishedHint')), h('span.sp'), h('button.btn.primary', { onclick: publishNow }, icon('send'), t('pub.publish'))) : null));

  const scr = h('div.card', h('div.hd', h('h2', t('nav.screens')), h('span.sp'), h('a.btn.sm', { href: '#/screens' }, t('manage'))),
    screens.length ? h('table.t', h('tbody', screens.map(s => h('tr',
      h('td', h('div.row', h('span', { class: `dot ${s.online ? 'ok' : 'bad'}` }), h('b', s.name))),
      h('td.small.muted', s.online ? (s.status?.slideName || (s.status?.idle ? t('dash.idle') : '—')) : t('screens.lastSeen', { t: relTime(s.lastSeen) })),
      h('td', s.status?.version != null ? h('span', { class: `badge ${s.status.version === pub.version ? 'ok' : 'warn'}` }, `v${s.status.version}`) : null))))) : h('div.empty', t('screens.none')));

  const upcoming = upcomingEvents(cats);
  const up = h('div.card', h('div.hd', h('h2', t('dash.upcoming'))), h('div.bd', upcoming.length ? h('div.col', upcoming.slice(0, 6).map(u =>
    h('div.row', h('span.dot', { style: { background: u.cat.color } }), h('b', catName(u.cat)), h('span.sp'), h('span.muted.small', u.date)))) : h('div.muted', t('dash.noUpcoming'))));

  root.append(h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: '16px', alignItems: 'start' } },
    nowCard, h('div.cards', scr, up)));

  const timer = setInterval(async () => {
    try {
      const fresh = await GET('/api/screens', { quiet: true });
      const rows = scr.querySelectorAll('tbody tr');
      fresh.forEach((s, i) => { const d = rows[i]?.querySelector('.dot'); if (d) d.className = `dot ${s.online ? 'ok' : 'bad'}`; });
    } catch {}
  }, 15000);
  return () => clearInterval(timer);
}

function upcomingEvents(cats) {
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const c of cats) {
    if (!c.active || c.isDefault) continue;
    for (const r of c.rules || []) {
      if (r.exclude) continue;
      if (r.type === 'holiday') {
        const occ = (store.meta.holidayDates?.[r.holiday] || []).find(o => o.start >= today);
        if (occ) out.push({ cat: c, date: occ.start });
      } else if (r.type === 'dateRange' && r.startDate && (r.endDate || r.startDate) >= today) out.push({ cat: c, date: r.startDate });
      else if (r.type === 'dates') { const d = (r.dates || []).filter(x => x >= today).sort()[0]; if (d) out.push({ cat: c, date: d }); }
      else if (r.type === 'yearly' && r.month && r.day) {
        const y = new Date().getFullYear();
        let d = `${y}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`;
        if (d < today) d = `${y + 1}${d.slice(4)}`;
        out.push({ cat: c, date: d });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
