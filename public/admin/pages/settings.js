import { h, t, icon, GET, PUT, store, can, clear, toast, changed } from '../lib.js';
import { selectEl, switchEl, colorField, pickAsset } from '../components.js';

export default async function settingsPage(root) {
  const s = await GET('/api/settings');
  const assets = await GET('/api/assets?kind=logo');
  const ro = !can('admin');
  const d = structuredClone(s);
  const presets = [['1920x1080', 'Full HD 1920×1080 (16:9)'], ['3840x2160', '4K 3840×2160 (16:9)'], ['1080x1920', t('set.portrait') + ' 1080×1920'], ['1280x720', 'HD 1280×720'], ['custom', t('set.custom')]];
  const curPreset = presets.find(p => p[0] === `${d.canvas.width}x${d.canvas.height}`)?.[0] || 'custom';
  const cw = h('input', { type: 'number', value: d.canvas.width, disabled: ro, oninput: (e) => { d.canvas.width = Number(e.target.value); } });
  const chh = h('input', { type: 'number', value: d.canvas.height, disabled: ro, oninput: (e) => { d.canvas.height = Number(e.target.value); } });
  const logoName = h('span.small');
  const updLogo = () => { const a = assets.find(x => x.id === d.idleLogoAssetId); logoName.textContent = a ? a.name : t('none'); };
  updLogo();
  const fld = (label, ctrl, hint) => h('label.f', h('span', label), ctrl, hint ? h('span.hint', hint) : null);

  root.append(
    h('div.page-head', h('div', h('h2', t('nav.settings')), h('p', t('set.sub')))),
    h('div.cards', { style: { maxWidth: '900px' } },
      h('div.card', h('div.hd', h('h3', t('set.general'))), h('div.bd.col',
        h('div.grid2',
          fld(t('set.orgName'), h('input', { type: 'text', value: d.orgName, disabled: ro, oninput: (e) => { d.orgName = e.target.value; } })),
          fld(t('set.timezone'), selectEl(d.timezone, ['Asia/Jerusalem', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC'], (v) => { d.timezone = v; }, { disabled: ro }), t('set.timezoneHint'))),
        fld(t('set.defaultLang'), selectEl(d.defaultLang, [['he', 'עברית'], ['en', 'English']], (v) => { d.defaultLang = v; }, { disabled: ro })))),
      h('div.card', h('div.hd', h('h3', t('set.display'))), h('div.bd.col',
        fld(t('set.canvas'), h('div.col', selectEl(curPreset, presets, (v) => { if (v !== 'custom') { const [w, hh] = v.split('x').map(Number); d.canvas = { width: w, height: hh }; cw.value = w; chh.value = hh; } }, { disabled: ro }), h('div.row', cw, h('span', '×'), chh)), t('set.canvasHint')),
        h('div.grid2',
          fld(t('set.defaultDuration'), h('input', { type: 'number', min: 1, value: d.defaultDuration, disabled: ro, oninput: (e) => { d.defaultDuration = Number(e.target.value); } }), t('set.defaultDurationHint')),
          fld(t('set.minDuration'), h('input', { type: 'number', min: 1, value: d.minDuration, disabled: ro, oninput: (e) => { d.minDuration = Number(e.target.value); } }), t('set.minDurationHint'))),
        h('div.grid2',
          fld(t('set.defaultTransition'), selectEl(d.defaultTransition.type, store.meta.transitions.map(x => [x, t(`tr.${x}`)]), (v) => { d.defaultTransition.type = v; }, { disabled: ro })),
          fld(t('set.transitionDuration'), h('input', { type: 'number', min: 0, max: 5000, step: 100, value: d.defaultTransition.duration, disabled: ro, oninput: (e) => { d.defaultTransition.duration = Number(e.target.value); } }))),
        h('div.row', switchEl(d.allowAudio, (v) => { d.allowAudio = v; }, { disabled: ro }), h('span', t('set.allowAudio'))), h('div.hint', t('set.allowAudioHint')),
        h('div.row', switchEl(d.showStatusDot, (v) => { d.showStatusDot = v; }, { disabled: ro }), h('span', t('set.statusDot'))))),
      h('div.card', h('div.hd', h('h3', t('set.idle'))), h('div.bd.col',
        h('div.hint', t('set.idleHint')),
        h('div.row', h('span', t('set.idleLogo')), logoName, h('span.sp'), !ro ? h('button.btn.sm', { onclick: async () => { const a = await pickAsset({ kind: 'logo' }); if (a) { d.idleLogoAssetId = a.id; assets.push(a); updLogo(); } } }, t('p.choose')) : null,
          !ro ? h('button.btn.sm.ghost', { onclick: () => { d.idleLogoAssetId = null; updLogo(); } }, t('clear')) : null),
        fld(t('set.idleBg'), colorField(d.idleBackground, (v) => { d.idleBackground = v; }, { alpha: false })))),
      h('div.card', h('div.hd', h('h3', t('set.reliability'))), h('div.bd.col',
        h('div.grid2',
          fld(t('set.dailyReload'), h('input', { type: 'time', value: d.dailyReload || '', disabled: ro, onchange: (e) => { d.dailyReload = e.target.value; } }), t('set.dailyReloadHint')),
          fld(t('set.poll'), h('input', { type: 'number', min: 15, max: 3600, value: d.pollSeconds, disabled: ro, oninput: (e) => { d.pollSeconds = Number(e.target.value); } }), t('set.pollHint'))))),
      !ro ? h('div.row', h('a.btn', { href: '/api/backup/download' }, icon('download'), store.meta.platform?.db === 'postgres' ? t('set.export') : t('set.backup')), h('span.sp'),
        h('button.btn.primary', { onclick: async () => {
          const saved = await PUT('/api/settings', d);
          store.meta = await GET('/api/meta');
          toast(t('saved'), 'ok'); changed();
        } }, icon('check'), t('save'))) : null,
      h('div.card', h('div.hd', h('h3', t('set.system'))), h('div.bd.kv',
        h('span', t('set.baseUrl')), h('span.ltr', store.meta.baseUrl),
        h('span', 'SSO'), h('span', store.meta.auth.oidc ? h('span.badge.ok', t('set.enabled')) : h('span.badge.warn', t('set.notConfigured'))),
        h('span', t('set.localAdmin')), h('span', store.meta.auth.local ? h('span.badge.warn', t('set.enabled')) : h('span.badge', t('set.disabled'))),
        h('span', t('set.hosting')), h('span', store.meta.platform?.vercel ? 'Vercel' : t('set.onPrem')),
        h('span', t('set.database')), h('span.ltr', store.meta.platform?.db === 'postgres' ? 'PostgreSQL (Neon)' : 'SQLite'),
        h('span', t('set.mediaStore')), h('span.ltr', store.meta.platform?.media === 'blob' ? 'Vercel Blob' : t('set.localFolder')),
        h('span', t('set.updates')), h('span', store.meta.platform?.realtime ? t('set.realtime') : t('set.polling', { s: store.meta.playerSettings?.pollSeconds || 20 }))))));
}
