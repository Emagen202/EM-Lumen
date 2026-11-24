import { h, t, icon, setLang, lang, GET, POST, PATCH, store, emit, can, clear, toast, promptDlg, relTime } from './lib.js';

const ROUTES = [
  { re: /^\/?$/, page: () => import('./pages/dashboard.js'), title: 'nav.dashboard', nav: 'dashboard' },
  { re: /^\/categories$/, page: () => import('./pages/categories.js'), title: 'nav.categories', nav: 'categories' },
  { re: /^\/category\/(\d+)$/, page: () => import('./pages/category.js'), title: 'nav.categories', nav: 'categories' },
  { re: /^\/editor\/(\d+)$/, page: () => import('./pages/editor.js'), title: 'nav.editor', nav: 'categories', full: true },
  { re: /^\/media$/, page: () => import('./pages/media.js'), title: 'nav.media', nav: 'media' },
  { re: /^\/schedule$/, page: () => import('./pages/schedule.js'), title: 'nav.schedule', nav: 'schedule' },
  { re: /^\/screens$/, page: () => import('./pages/screens.js'), title: 'nav.screens', nav: 'screens' },
  { re: /^\/alert$/, page: () => import('./pages/alert.js'), title: 'nav.alert', nav: 'alert' },
  { re: /^\/publish$/, page: () => import('./pages/publish.js'), title: 'nav.publish', nav: 'publish' },
  { re: /^\/users$/, page: () => import('./pages/users.js'), title: 'nav.users', nav: 'users', role: 'admin' },
  { re: /^\/settings$/, page: () => import('./pages/settings.js'), title: 'nav.settings', nav: 'settings' },
  { re: /^\/audit$/, page: () => import('./pages/audit.js'), title: 'nav.audit', nav: 'audit', role: 'admin' },
];

const NAV = [
  ['dashboard', '#/', 'dashboard'], ['categories', '#/categories', 'layers'], ['media', '#/media', 'image'], ['schedule', '#/schedule', 'calendar'],
  ['screens', '#/screens', 'monitor'], ['alert', '#/alert', 'ticker'], ['publish', '#/publish', 'send'], null,
  ['users', '#/users', 'users', 'admin'], ['settings', '#/settings', 'settings'], ['audit', '#/audit', 'history', 'admin'],
];

let els = {};
let cleanup = null;
let leaveGuard = null;
export function setLeaveGuard(fn) { leaveGuard = fn; }

function layout() {
  const app = document.getElementById('app');
  clear(app);
  const side = h('nav.side',
    h('div.brand', h('img', { src: '/admin/img/icon.svg', alt: '' }), h('div', 'EM Lumen', h('small', store.meta?.settings?.orgName || 'Eitan Medical'))),
    NAV.map(n => (n === null ? h('div.sep') : (n[3] && !can(n[3]) ? null : h('a.nav', { href: n[1], dataset: { nav: n[0] } }, icon(n[2]), t(`nav.${n[0]}`))))),
    h('div.grow'),
    h('div.foot', t('auditNotice')));
  els.title = h('h1');
  els.pub = h('div.pubbar');
  const initial = (store.me.name || store.me.email || '?').trim().charAt(0).toUpperCase();
  const menu = h('button.btn.ghost.icon.mobile-menu', { title: t('nav.menu'), 'aria-label': t('nav.menu'), 'aria-expanded': 'false', onclick: () => { const open = app.querySelector('.shell').classList.toggle('menu-open'); menu.setAttribute('aria-expanded', String(open)); } }, icon('list'));
  const top = h('header.top', menu, els.title, h('div.sp'),
    h('button.btn.ghost.sm', { title: 'Language', onclick: switchLang }, icon('globe'), lang === 'he' ? 'English' : 'עברית'),
    h('div.usermenu', h('div.avatar', { title: `${store.me.email} · ${t('role.' + store.me.role)}` }, initial),
      h('div.small', h('div', { style: { fontWeight: 600 } }, store.me.name), h('div.muted', t('role.' + store.me.role))),
      h('a.btn.ghost.icon', { href: '/auth/logout', title: t('logout') }, icon('logout'))));
  els.main = h('main.main');
  app.appendChild(h('div.shell', side, top, els.main, els.pub));
  renderPubBar();
}

async function switchLang() {
  const nl = lang === 'he' ? 'en' : 'he';
  setLang(nl);
  PATCH('/api/me', { lang: nl }, { quiet: true }).catch(() => {});
  layout();
  route(true);
}

export async function refreshPublish() {
  try { store.meta.publish = await GET('/api/publish/status', { quiet: true }); renderPubBar(); } catch {}
}

function renderPubBar() {
  const p = store.meta?.publish;
  if (!els.pub || !p) return;
  clear(els.pub);
  els.pub.classList.toggle('dirty', !!p.hasChanges);
  els.pub.append(h('span.dotx'),
    h('span', p.hasChanges ? t('pub.dirty') : t('pub.clean', { v: p.version })),
    p.hasChanges && can('editor') ? h('button.btn.primary.sm.round', { onclick: () => publishNow() }, icon('send'), t('pub.publish')) : null);
}

export async function publishNow() {
  const note = await promptDlg(t('pub.notePrompt'), '', { placeholder: t('pub.notePh') });
  if (note === null) return;
  const r = await POST('/api/publish', { note });
  store.meta.publish = r.status;
  renderPubBar();
  toast(t('pub.done', { v: r.version }), 'ok');
  emit({ type: 'published' });
}

async function route(force = false) {
  document.querySelector('.shell')?.classList.remove('menu-open');
  document.querySelector('.mobile-menu')?.setAttribute('aria-expanded', 'false');
  const path = location.hash.replace(/^#/, '') || '/';
  const r = ROUTES.find(x => x.re.test(path)) || ROUTES[0];
  if (r.role && !can(r.role)) { location.hash = '#/'; return; }
  if (cleanup) { try { await cleanup(); } catch {} cleanup = null; }
  leaveGuard = null;
  els.main.className = r.full ? 'main full' : 'main';
  els.main.parentElement.classList.toggle('collapsed', !!r.full);
  clear(els.main);
  document.querySelectorAll('.side a.nav').forEach(a => a.classList.toggle('on', a.dataset.nav === r.nav));
  els.title.textContent = t(r.title);
  document.title = `${t(r.title)} · EM Lumen`;
  try {
    const mod = await r.page();
    const params = path.match(r.re).slice(1);
    cleanup = (await mod.default(els.main, params, { setTitle: (s) => { els.title.textContent = s; } })) || null;
  } catch (e) {
    console.error(e);
    els.main.appendChild(h('div.empty', `${t('err.generic')}: ${e.message}`));
  }
}

window.addEventListener('beforeunload', (e) => { if (leaveGuard && leaveGuard()) { e.preventDefault(); e.returnValue = ''; } });

async function boot() {
  try {
    store.me = await GET('/api/me');
  } catch { return; }
  if (!localStorage.getItem('emtv.lang') && store.me.lang) setLang(store.me.lang); else setLang(lang);
  store.meta = await GET('/api/meta');
  layout();
  window.addEventListener('hashchange', () => route());
  store.listeners.add((e) => { if (e.type === 'changed') refreshPublish(); });
  setInterval(refreshPublish, 20000);
  route();
}
boot();
