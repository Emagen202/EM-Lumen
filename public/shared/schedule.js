// Schedule engine — shared by the player (runs offline), the admin preview and the server.
// All evaluation happens on "local parts" in the configured time zone, so the result is identical
// everywhere regardless of the device clock's own time zone.

import { activeGreeting, greetingSlide } from './greetings.js';

const pad = (n) => String(n).padStart(2, '0');

/** Local date/time parts of `date` in time zone `tz`. */
export function localParts(date = new Date(), tz = 'Asia/Jerusalem') {
  let y, mo, d, h, mi, s;
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    for (const p of f.formatToParts(date)) {
      if (p.type === 'year') y = +p.value; else if (p.type === 'month') mo = +p.value; else if (p.type === 'day') d = +p.value;
      else if (p.type === 'hour') h = +p.value % 24; else if (p.type === 'minute') mi = +p.value; else if (p.type === 'second') s = +p.value;
    }
  } catch {
    y = date.getFullYear(); mo = date.getMonth() + 1; d = date.getDate(); h = date.getHours(); mi = date.getMinutes(); s = date.getSeconds();
  }
  return makeParts(`${y}-${pad(mo)}-${pad(d)}`, h * 60 + mi, s);
}

export function makeParts(dateStr, minutes, seconds = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { date: dateStr, y, m, d, minutes, seconds, dow };
}

export function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400e3);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const toMin = (t, def) => {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return def;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
// Comparable key for a local date+minute: YYYYMMDD * 1440 + minutes  (monotonic within the calendar)
const key = (dateStr, minutes) => Number(dateStr.replace(/-/g, '')) * 1440 + minutes;

function inDailyWindow(rule, parts) {
  const start = toMin(rule.startTime, 0);
  const end = toMin(rule.endTime, 1440);
  const days = Array.isArray(rule.days) && rule.days.length ? rule.days : null;
  if (start <= end) {
    if (days && !days.includes(parts.dow)) return false;
    return parts.minutes >= start && parts.minutes < (end === 1439 ? 1440 : end);
  }
  // Overnight window, e.g. 22:00 → 06:00
  if (parts.minutes >= start) return !days || days.includes(parts.dow);
  if (parts.minutes < end) return !days || days.includes((parts.dow + 6) % 7);
  return false;
}

function inSpan(startDate, startTime, endDate, endTime, parts, defStart = 0, defEnd = 1440) {
  const now = key(parts.date, parts.minutes);
  const s = key(startDate, toMin(startTime, defStart));
  let eMin = toMin(endTime, defEnd);
  if (eMin === 1439) eMin = 1440;
  const e = key(endDate, eMin);
  return now >= s && now < e;
}

/** Does a single rule match the given local parts? */
export function ruleMatches(rule, parts, holidays = {}) {
  if (!rule) return false;
  const days = Array.isArray(rule.days) && rule.days.length ? rule.days : null;
  switch (rule.type) {
    case 'always':
      return inDailyWindow(rule, parts);
    case 'weekly':
      return inDailyWindow(rule, parts);
    case 'dates':
      return (rule.dates || []).includes(parts.date) && inDailyWindow({ ...rule, days: null }, parts);
    case 'dateRange': {
      if (!rule.startDate && !rule.endDate) return inDailyWindow(rule, parts);
      if (days && !days.includes(parts.dow)) return false;
      return inSpan(rule.startDate || '1970-01-01', rule.startTime, rule.endDate || '9999-12-31', rule.endTime, parts);
    }
    case 'yearly': {
      if (!rule.month || !rule.day) return false;
      if (days && !days.includes(parts.dow)) return false;
      const em = rule.endMonth || rule.month, ed = rule.endDay || rule.day;
      // Check this year's and last year's occurrence (handles ranges crossing new year)
      for (const y of [parts.y, parts.y - 1]) {
        const s = `${y}-${pad(rule.month)}-${pad(rule.day)}`;
        const endYear = (em < rule.month || (em === rule.month && ed < rule.day)) ? y + 1 : y;
        const e = `${endYear}-${pad(em)}-${pad(ed)}`;
        if (inSpan(s, rule.startTime, e, rule.endTime, parts)) return true;
      }
      return false;
    }
    case 'holiday': {
      const occ = holidays?.[rule.holiday] || [];
      for (const o of occ) {
        const startDate = rule.fromEve ? addDaysStr(o.start, -1) : o.start;
        const endDate = addDaysStr(o.start, (o.days || 1) - 1 + (rule.extraDays || 0));
        const defStart = rule.fromEve ? 18 * 60 : 0;
        if (inSpan(startDate, rule.startTime, endDate, rule.endTime, parts, defStart)) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

/** A rule set matches when: (no include rules OR any include rule matches) AND no exclude rule matches. */
export function rulesMatch(rules, parts, holidays) {
  if (!Array.isArray(rules) || !rules.length) return true;
  const inc = rules.filter(r => !r.exclude);
  const exc = rules.filter(r => r.exclude);
  if (exc.some(r => ruleMatches(r, parts, holidays))) return false;
  return !inc.length || inc.some(r => ruleMatches(r, parts, holidays));
}

const targets = (c, screenId) => !screenId || !Array.isArray(c.screens) || !c.screens.length || c.screens.map(Number).includes(Number(screenId));

/**
 * Resolve what should play right now.
 * @returns {{ mode: 'replace'|'normal'|'idle', categories: object[], slides: object[] }}
 */
export function resolvePlaylist(manifest, parts, { screenId = 0 } = {}) {
  const holidays = manifest.holidays || {};
  const cats = (manifest.categories || []).filter(c => c.active !== false && targets(c, screenId)).sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
  const byCat = new Map();
  for (const s of manifest.slides || []) {
    if (s.enabled === false) continue;
    if (!rulesMatch(s.schedule?.rules, parts, holidays)) continue;
    if (!byCat.has(s.categoryId)) byCat.set(s.categoryId, []);
    byCat.get(s.categoryId).push(s);
  }
  for (const list of byCat.values()) list.sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
  const playable = (c) => byCat.get(c.id) || [];

  const scheduled = cats.filter(c => !c.isDefault && rulesMatch(c.rules, parts, holidays));
  const replace = scheduled.filter(c => c.mode === 'replace' && playable(c).length);
  if (replace.length) {
    const maxP = Math.max(...replace.map(c => c.priority || 0));
    const chosen = replace.filter(c => (c.priority || 0) === maxP);
    return { mode: 'replace', categories: chosen, slides: chosen.flatMap(playable) };
  }
  const def = cats.find(c => c.isDefault);
  const chosen = [];
  if (def && rulesMatch(def.rules, parts, holidays) && playable(def).length) chosen.push(def);
  for (const c of scheduled) if (c.mode !== 'replace' && playable(c).length) chosen.push(c);
  chosen.sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
  const slides = chosen.flatMap(playable);
  // Holiday mode: add the matching "happy holiday" slide to the regular rotation (never during a replace override).
  const g = holidayGreetingFor(manifest, parts);
  if (g) slides.push(g);
  return { mode: slides.length ? 'normal' : 'idle', categories: chosen, slides, greeting: g?._greeting || null };
}

/** The holiday greeting slide due at `parts`, when holiday mode is on. */
export function holidayGreetingFor(manifest, parts) {
  const s = manifest.settings || {};
  const hg = s.holidayGreetings;
  if (!hg?.enabled) return null;
  const key = activeGreeting(manifest.holidays || {}, parts.date, hg.daysBefore ?? 3);
  return key ? greetingSlide(key, { duration: hg.duration }) : null;
}

/** Activity of each category across a day (for the admin timeline), sampled every `step` minutes. */
export function dayTimeline(manifest, dateStr, { screenId = 0, step = 5 } = {}) {
  const segments = [];
  let cur = null;
  for (let m = 0; m < 1440; m += step) {
    const r = resolvePlaylist(manifest, makeParts(dateStr, m), { screenId });
    const sig = r.categories.map(c => c.id).join(',') + '|' + r.mode;
    if (!cur || cur.sig !== sig) {
      if (cur) cur.end = m;
      cur = { sig, start: m, end: 1440, mode: r.mode, categories: r.categories.map(c => c.id), count: r.slides.length };
      segments.push(cur);
    }
  }
  return segments;
}

export function slideDuration(slide, settings = {}) {
  const min = Number(settings.minDuration) || 1;
  const d = Number(slide.duration) || Number(settings.defaultDuration) || 15;
  return Math.max(min, d);
}

export function slideTransition(slide, settings = {}) {
  const def = settings.defaultTransition || { type: 'fade', duration: 1200 };
  const t = slide.transition || {};
  return { type: t.type || def.type || 'fade', duration: t.duration ?? def.duration ?? 1200 };
}
