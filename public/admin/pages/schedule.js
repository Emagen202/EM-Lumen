import { h, t, icon, GET, store, catName, clear, todayStr, minToHHMM, lang } from '../lib.js';
import { selectEl, previewModal } from '../components.js';
import { dayTimeline, resolvePlaylist, makeParts, addDaysStr, localParts } from '/shared/schedule.js';

export default async function schedulePage(root) {
  const [manifest, screens] = await Promise.all([GET('/api/preview-manifest'), GET('/api/screens')]);
  const catById = Object.fromEntries(manifest.categories.map(c => [c.id, c]));
  let date = todayStr();
  let screenId = 0;
  let time = minToHHMM(localParts(new Date(), store.meta.settings.timezone).minutes);
  const weekBox = h('div.col');
  const nowBox = h('div');
  const legend = h('div.legend');

  const dayRow = (d) => {
    const segs = dayTimeline(manifest, d, { screenId, step: 5 });
    const bar = h('div.timeline');
    for (const s of segs) {
      const cats = s.categories.map(id => catById[id]).filter(Boolean);
      const seg = h('div', { class: `seg ${s.mode === 'idle' ? 'idle' : ''}`, style: { width: `${((s.end - s.start) / 1440) * 100}%` },
        title: `${minToHHMM(s.start)}–${minToHHMM(s.end === 1440 ? 0 : s.end)}  ${cats.map(catName).join(' + ') || t('dash.idle')} (${s.count} ${t('slides')})${s.mode === 'replace' ? ' · ' + t('dash.override') : ''}`,
        onclick: () => { date = d; time = minToHHMM(s.start); render(); } });
      cats.forEach(c => seg.appendChild(h('div', { style: { background: c.color } })));
      bar.appendChild(seg);
    }
    if (d === todayStr()) {
      const m = localParts(new Date(), store.meta.settings.timezone).minutes;
      bar.appendChild(h('div.now', { style: { left: `${(m / 1440) * 100}%` } }));
    }
    const label = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(d + 'T12:00:00'));
    return h('div', { style: { display: 'grid', gridTemplateColumns: '90px 1fr', gap: '10px', alignItems: 'center' } }, h('div.small', { style: { fontWeight: d === date ? 700 : 400 } }, label), h('div', { dir: 'ltr' }, bar));
  };

  function render() {
    clear(weekBox);
    for (let i = 0; i < 7; i++) weekBox.appendChild(dayRow(addDaysStr(date, i)));
    weekBox.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '90px 1fr', gap: '10px' } }, h('div'), h('div.hours', ...[0, 3, 6, 9, 12, 15, 18, 21, 24].map(x => h('span', `${x}:00`)))));
    clear(legend);
    for (const c of manifest.categories) legend.appendChild(h('span', h('i', { style: { background: c.color } }), catName(c)));
    legend.appendChild(h('span', h('i', { style: { background: 'repeating-linear-gradient(45deg,#e5e7eb 0 3px,#f3f4f6 3px 6px)' } }), t('dash.idle')));

    const [hh, mm] = time.split(':').map(Number);
    const pl = resolvePlaylist(manifest, makeParts(date, hh * 60 + mm), { screenId });
    clear(nowBox);
    nowBox.append(
      h('div.row.wrap', { style: { marginBottom: '10px' } }, pl.categories.length ? pl.categories.map(c => h('span.badge', { style: { background: c.color + '22', color: c.color } }, catName(c))) : h('span.badge', t('dash.idle')),
        pl.mode === 'replace' ? h('span.badge.warn', t('dash.override')) : null, h('span.sp'),
        h('button.btn.sm', { onclick: () => previewModal(`at=${date}T${time}&screen=${screenId}`, `${date} ${time}`) }, icon('play'), t('sched.simulate'))),
      pl.slides.length ? h('table.t', h('tbody', pl.slides.map((s, i) => h('tr', h('td.muted', String(i + 1)), h('td', h('a', { href: `#/editor/${s.id}` }, s.name)), h('td.small.muted', catName(catById[s.categoryId])), h('td.small', s.useVideoLength ? t('slide.videoLength') : `${s.duration || store.meta.settings.defaultDuration} ${t('sec')}`))))) : h('div.empty', t('sched.nothing')));
  }

  const today = new Date().toISOString().slice(0, 10);
  const holidayRows = [];
  for (const c of manifest.categories) for (const r of c.rules || []) {
    if (r.type !== 'holiday' || r.exclude) continue;
    for (const o of (manifest.holidays?.[r.holiday] || []).filter(o => o.start >= today).slice(0, 2)) holidayRows.push({ c, o, r });
  }
  holidayRows.sort((a, b) => a.o.start.localeCompare(b.o.start));
  const hname = (k) => { const x = store.meta.holidays.find(y => y.key === k); return x ? (lang === 'he' ? x.he : x.en) : k; };

  root.append(
    h('div.page-head', h('div', h('h2', t('nav.schedule')), h('p', t('sched.sub')))),
    h('div.card', { style: { marginBottom: '16px' } }, h('div.hd', h('h3', t('sched.week')), h('span.sp'),
      h('input', { type: 'date', value: date, style: { width: '170px' }, onchange: (e) => { date = e.target.value || todayStr(); render(); } }),
      screens.length > 1 ? selectEl(screenId, [[0, t('sched.allScreens')], ...screens.map(s => [s.id, s.name])], (v) => { screenId = Number(v); render(); }, { style: { width: '200px' } }) : null),
      h('div.bd.col', weekBox, legend, h('div.hint', t('sched.clickHint')))),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: '16px', alignItems: 'start' } },
      h('div.card', h('div.hd', h('h3', t('sched.atTime')), h('span.sp'), h('input', { type: 'time', value: time, style: { width: '130px' }, onchange: (e) => { time = e.target.value || '00:00'; render(); } })), h('div.bd', nowBox)),
      h('div.card', h('div.hd', h('h3', t('sched.holidays'))), h('div.bd', holidayRows.length ? h('table.t', h('tbody', holidayRows.map(({ c, o, r }) => h('tr', h('td', h('span.dot', { style: { background: c.color } })), h('td', hname(r.holiday)), h('td', catName(c)), h('td.ltr.small', o.start))))) : h('div.muted', t('sched.noHolidays'))))));
  render();
}
