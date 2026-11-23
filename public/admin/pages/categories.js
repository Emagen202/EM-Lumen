import { h, t, icon, GET, POST, PATCH, DEL, store, can, catName, clear, toast, confirmDlg, modal, changed } from '../lib.js';
import { switchEl, ruleSummary, colorField, selectEl } from '../components.js';
import { rulesMatch, localParts } from '/shared/schedule.js';

export default async function categoriesPage(root) {
  const list = h('div.cards');
  const load = async () => {
    const cats = await GET('/api/categories');
    store.categories = cats;
    clear(list);
    const parts = localParts(new Date(), store.meta.settings.timezone);
    cats.forEach((c, i) => {
      const activeNow = c.active && (c.isDefault ? rulesMatch(c.rules, parts, store.meta.holidayDates) : (c.rules.length ? rulesMatch(c.rules, parts, store.meta.holidayDates) : true));
      list.appendChild(h('div.card.cat-card', { style: { '--c': c.color } },
        h('div.bar'),
        h('div.body', { onclick: () => { location.hash = `#/category/${c.id}`; } },
          h('h3', catName(c),
            c.isDefault ? h('span.badge.brand', t('cat.default')) : null,
            h('span', { class: `badge ${c.mode === 'replace' ? 'warn' : ''}` }, c.mode === 'replace' ? t('cat.modeReplace') : t('cat.modeMerge')),
            activeNow ? h('span.badge.ok', t('cat.activeNow')) : null,
            !c.active ? h('span.badge.bad', t('cat.disabled')) : null),
          h('div.small.muted', `${c.slideCount} ${t('slides')} · ${c.enabledCount} ${t('cat.enabled')}${c.mode === 'replace' ? ` · ${t('cat.priority')} ${c.priority}` : ''}`),
          h('div.small.muted', c.isDefault ? t('cat.defaultHint') : (c.rules.length ? c.rules.map(ruleSummary).join(' · ') : t('cat.noRules')))),
        h('div.side-actions',
          can('editor') ? [
            h('button.btn.ghost.icon.sm', { title: t('moveUp'), disabled: i === 0, onclick: () => move(cats, i, -1) }, icon('up')),
            h('button.btn.ghost.icon.sm', { title: t('moveDown'), disabled: i === cats.length - 1, onclick: () => move(cats, i, 1) }, icon('down')),
            switchEl(c.active, async (v) => { await PATCH(`/api/categories/${c.id}`, { active: v }); changed(); load(); }),
          ] : null)));
    });
  };
  const move = async (cats, i, d) => {
    const ids = cats.map(c => c.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    await POST('/api/categories/reorder', { ids }); changed(); load();
  };
  root.append(
    h('div.page-head', h('div', h('h2', t('nav.categories')), h('p', t('cat.sub'))), h('span.sp'),
      can('editor') ? h('button.btn.primary', { onclick: () => newCategory() }, icon('plus'), t('cat.new')) : null),
    list);
  await load();
}

export function newCategory() {
  const data = { name_he: '', name_en: '', color: '#7c3aed', mode: 'replace', priority: 50 };
  const m = modal({
    title: t('cat.new'),
    body: h('div.col',
      h('div.grid2',
        h('label.f', h('span', t('cat.nameHe')), h('input', { type: 'text', dir: 'rtl', oninput: (e) => { data.name_he = e.target.value; } })),
        h('label.f', h('span', t('cat.nameEn')), h('input', { type: 'text', dir: 'ltr', oninput: (e) => { data.name_en = e.target.value; } }))),
      h('label.f', h('span', t('cat.mode')), selectEl(data.mode, [['replace', t('cat.modeReplaceLong')], ['merge', t('cat.modeMergeLong')]], (v) => { data.mode = v; })),
      h('label.f', h('span', t('cat.color')), colorField(data.color, (v) => { data.color = v; }, { alpha: false })),
      h('div.hint', t('cat.newHint'))),
    footer: (close) => [h('button.btn', { onclick: close }, t('cancel')), h('button.btn.primary', { onclick: async () => {
      if (!data.name_he.trim()) return toast(t('cat.nameRequired'), 'err');
      const c = await POST('/api/categories', data); close(); changed(); location.hash = `#/category/${c.id}`;
    } }, t('create'))],
  });
}
