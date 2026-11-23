import { h, t, icon, GET, POST, PATCH, DEL, store, clear, toast, confirmDlg, modal, fmtDateTime, relTime } from '../lib.js';
import { selectEl, switchEl } from '../components.js';

export default async function usersPage(root) {
  const box = h('div');
  const roles = () => [['viewer', t('role.viewer')], ['editor', t('role.editor')], ['admin', t('role.admin')]];
  const load = async () => {
    const users = await GET('/api/users');
    clear(box);
    box.appendChild(h('table.t', h('thead', h('tr', h('th', t('users.user')), h('th', t('users.role')), h('th', t('users.provider')), h('th', t('users.lastLogin')), h('th', t('users.active')), h('th', ''))),
      h('tbody', users.map(u => h('tr',
        h('td', h('div', h('b', u.name || u.email)), h('div.small.muted.ltr', u.email)),
        h('td', selectEl(u.role, roles(), async (v) => { await PATCH(`/api/users/${u.id}`, { role: v }); toast(t('saved'), 'ok'); }, { disabled: u.id === store.me.id, style: { width: '150px' } })),
        h('td', h('span.badge', u.provider === 'local' ? t('users.local') : 'SSO')),
        h('td.small', u.last_login ? relTime(u.last_login) : t('users.neverLogged')),
        h('td', switchEl(!!u.active, async (v) => { await PATCH(`/api/users/${u.id}`, { active: v }); toast(t('saved'), 'ok'); }, { disabled: u.id === store.me.id })),
        h('td', u.id !== store.me.id ? h('button.btn.ghost.icon.sm', { title: t('delete'), onclick: async () => { if (await confirmDlg(t('users.deleteConfirm', { email: u.email }))) { await DEL(`/api/users/${u.id}`); load(); } } }, icon('trash')) : h('span.badge.brand', t('users.you'))))))));
  };
  const add = () => {
    const d = { email: '', name: '', role: 'editor' };
    modal({
      title: t('users.add'),
      body: h('div.col',
        h('label.f', h('span', t('users.email')), h('input', { type: 'email', dir: 'ltr', placeholder: 'name@eitanmedical.com', oninput: (e) => { d.email = e.target.value; } })),
        h('label.f', h('span', t('users.name')), h('input', { type: 'text', oninput: (e) => { d.name = e.target.value; } })),
        h('label.f', h('span', t('users.role')), selectEl(d.role, roles(), (v) => { d.role = v; })),
        h('div.hint', t('users.addHint'))),
      footer: (close) => [h('button.btn', { onclick: close }, t('cancel')), h('button.btn.primary', { onclick: async () => { await POST('/api/users', d); close(); load(); } }, t('users.add'))],
    });
  };
  root.append(
    h('div.page-head', h('div', h('h2', t('nav.users')), h('p', t('users.sub'))), h('span.sp'), h('button.btn.primary', { onclick: add }, icon('plus'), t('users.add'))),
    h('div.card', box),
    h('div.card', { style: { marginTop: '16px' } }, h('div.bd.col', h('b', t('users.rolesTitle')),
      h('div.hint', `${t('role.viewer')}: ${t('users.r.viewer')}`), h('div.hint', `${t('role.editor')}: ${t('users.r.editor')}`), h('div.hint', `${t('role.admin')}: ${t('users.r.admin')}`),
      h('div.hint', t('users.ssoHint')))));
  await load();
}
