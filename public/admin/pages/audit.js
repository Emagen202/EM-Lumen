import { h, t, icon, GET, clear, fmtDateTime } from '../lib.js';

export default async function auditPage(root) {
  let offset = 0;
  const PAGE = 100;
  const box = h('div');
  const pager = h('div.row', { style: { marginTop: '12px' } });
  const load = async () => {
    const rows = await GET(`/api/audit?limit=${PAGE}&offset=${offset}`);
    clear(box);
    box.appendChild(rows.length ? h('table.t', h('thead', h('tr', h('th', t('audit.when')), h('th', t('audit.user')), h('th', t('audit.action')), h('th', t('audit.details')))),
      h('tbody', rows.map(r => h('tr', h('td.small.nowrap', fmtDateTime(r.ts)), h('td.small.ltr', r.actor || ''), h('td', h('span.badge', r.action)), h('td.small.mono', { style: { maxWidth: '520px', overflow: 'hidden', textOverflow: 'ellipsis' } }, r.details || ''))))) : h('div.empty', t('audit.none')));
    clear(pager);
    pager.append(h('button.btn.sm', { disabled: offset === 0, onclick: () => { offset = Math.max(0, offset - PAGE); load(); } }, t('audit.newer')), h('span.sp'),
      h('button.btn.sm', { disabled: rows.length < PAGE, onclick: () => { offset += PAGE; load(); } }, t('audit.older')));
  };
  root.append(h('div.page-head', h('div', h('h2', t('nav.audit')), h('p', t('audit.sub')))), h('div.card', box), pager);
  await load();
}
