import { h, t, icon, GET, PUT, can, clear, toast, fmtDateTime, store } from '../lib.js';
import { selectEl, switchEl } from '../components.js';

export default async function alertPage(root) {
  let a = await GET('/api/alert');
  const d = { ...a, style: a.active ? a.style : 'ticker', durationPreset: a.until ? 'custom' : 'none', customUntil: a.until ? toLocal(a.until) : '' };
  const ro = !can('editor');
  const preview = h('div.alert-preview');
  const status = h('div');

  function renderPreview() {
    clear(preview);
    const box = h('div', { class: `emtv-alert ${d.style} ${d.level}` });
    if (d.style === 'ticker') { const text = [d.text_he, d.text_en].filter(Boolean).join('   •   ') || t('alert.samplePh'); box.appendChild(h('div.alert-track', [0, 1].map(() => h('span.alert-item', { dir: 'auto' }, Array(4).fill(text).join('   •   ') + '   •   ')))); }
    else { box.appendChild(h('span', { dir: 'rtl' }, d.text_he || t('alert.samplePh'))); if (d.text_en) box.appendChild(h('span.alert-en', { dir: 'ltr' }, d.text_en)); }
    preview.appendChild(box);
  }
  function renderStatus() {
    clear(status);
    const active = a.active && (!a.until || a.until > Date.now());
    status.append(h('div.row', h('span', { class: `dot ${active ? 'bad' : ''}` }), h('b', active ? t('alert.isActive') : t('alert.isOff')),
      active && a.until ? h('span.muted', `${t('alert.until')} ${fmtDateTime(a.until)}`) : null,
      a.updated_by ? h('span.muted.small', `· ${a.updated_by} · ${fmtDateTime(a.updated_at)}`) : null));
  }
  const untilFromPreset = () => {
    const now = Date.now();
    switch (d.durationPreset) {
      case '15m': return now + 15 * 60e3; case '1h': return now + 3600e3; case '4h': return now + 4 * 3600e3;
      case 'eod': { const x = new Date(); x.setHours(23, 59, 0, 0); return x.getTime(); }
      case 'custom': return d.customUntil ? new Date(d.customUntil).getTime() : null;
      default: return null;
    }
  };
  async function save(active) {
    if (active && !d.text_he.trim() && !d.text_en.trim()) return toast(t('alert.textRequired'), 'err');
    a = await PUT('/api/alert', { active, text_he: d.text_he, text_en: d.text_en, style: d.style, level: d.level, until: active ? untilFromPreset() : null });
    toast(active ? t('alert.activated') : t('alert.deactivated'), 'ok');
    renderStatus();
  }
  const customInput = h('input', { type: 'datetime-local', value: d.customUntil, disabled: ro, style: { display: d.durationPreset === 'custom' ? '' : 'none' }, onchange: (e) => { d.customUntil = e.target.value; } });

  root.append(
    h('div.page-head', h('div', h('h2', t('nav.alert')), h('p', t('alert.sub')))),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '16px', alignItems: 'start' } },
      h('div.card', h('div.hd', h('h3', t('alert.compose'))), h('div.bd.col',
        status,
        h('label.f', h('span', t('alert.textHe')), h('textarea', { dir: 'rtl', rows: 3, value: d.text_he || '', disabled: ro, oninput: (e) => { d.text_he = e.target.value; renderPreview(); } })),
        h('label.f', h('span', t('alert.textEn')), h('textarea', { dir: 'ltr', rows: 2, value: d.text_en || '', disabled: ro, oninput: (e) => { d.text_en = e.target.value; renderPreview(); } })),
        h('div.grid2',
          h('label.f', h('span', t('alert.style')), selectEl(d.style, [['banner', t('alert.s.banner')], ['ticker', t('alert.s.ticker')], ['fullscreen', t('alert.s.fullscreen')]], (v) => { d.style = v; renderPreview(); }, { disabled: ro })),
          h('label.f', h('span', t('alert.level')), selectEl(d.level, [['info', t('alert.l.info')], ['warning', t('alert.l.warning')], ['emergency', t('alert.l.emergency')]], (v) => { d.level = v; renderPreview(); }, { disabled: ro }))),
        h('label.f', h('span', t('alert.duration')), selectEl(d.durationPreset, [['none', t('alert.d.none')], ['15m', t('alert.d.15m')], ['1h', t('alert.d.1h')], ['4h', t('alert.d.4h')], ['eod', t('alert.d.eod')], ['custom', t('alert.d.custom')]], (v) => { d.durationPreset = v; customInput.style.display = v === 'custom' ? '' : 'none'; }, { disabled: ro })),
        customInput,
        !ro ? h('div.row', h('button.btn', { onclick: () => save(false) }, icon('x'), t('alert.off')), h('span.sp'), h('button.btn.primary', { onclick: () => save(true) }, icon('zap'), t('alert.on'))) : null,
        h('div.hint', t('alert.hint')),
        store.meta.platform?.realtime === false ? h('div.hint', t('alert.pollHint', { s: store.meta.playerSettings?.pollSeconds || 20 })) : null)),
      h('div.card', h('div.hd', h('h3', t('preview'))), h('div.bd', preview))));
  renderPreview(); renderStatus();
}

function toLocal(ts) { const d = new Date(ts); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
