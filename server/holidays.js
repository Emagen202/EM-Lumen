// Israeli / Jewish holiday dates, computed from the Hebrew calendar using Intl (full ICU ships with Node).
// Dates are pre-computed on the server and embedded in the manifest, so the player never depends
// on the TV browser's calendar support.

export const HOLIDAYS = {
  rosh_hashana:   { he: 'ראש השנה',            en: 'Rosh Hashana',            month: ['Tishri'], day: 1, days: 2 },
  yom_kippur:     { he: 'יום כיפור',            en: 'Yom Kippur',              month: ['Tishri'], day: 10, days: 1 },
  sukkot:         { he: 'סוכות',                en: 'Sukkot',                  month: ['Tishri'], day: 15, days: 7 },
  simchat_torah:  { he: 'שמחת תורה',            en: 'Simchat Torah',           month: ['Tishri'], day: 22, days: 1 },
  hanukkah:       { he: 'חנוכה',                en: 'Hanukkah',                month: ['Kislev'], day: 25, days: 8 },
  tu_bishvat:     { he: 'ט״ו בשבט',             en: 'Tu BiShvat',              month: ['Shevat'], day: 15, days: 1 },
  purim:          { he: 'פורים',                en: 'Purim',                   month: ['Adar', 'Adar II'], day: 14, days: 1 },
  pesach:         { he: 'פסח',                  en: 'Passover',                month: ['Nisan'], day: 15, days: 7 },
  yom_hashoah:    { he: 'יום השואה',            en: 'Holocaust Remembrance Day', month: ['Nisan'], day: 27, days: 1, shift: 'shoah' },
  yom_hazikaron:  { he: 'יום הזיכרון',          en: 'Memorial Day',            month: ['Iyar'], day: 5, days: 1, shift: 'zikaron' },
  yom_haatzmaut:  { he: 'יום העצמאות',          en: 'Independence Day',        month: ['Iyar'], day: 5, days: 1, shift: 'atzmaut' },
  lag_baomer:     { he: 'ל״ג בעומר',            en: 'Lag BaOmer',              month: ['Iyar'], day: 18, days: 1 },
  yom_yerushalayim:{ he: 'יום ירושלים',         en: 'Jerusalem Day',           month: ['Iyar'], day: 28, days: 1 },
  shavuot:        { he: 'שבועות',               en: 'Shavuot',                 month: ['Sivan'], day: 6, days: 1 },
  tisha_bav:      { he: 'תשעה באב',             en: "Tisha B'Av",              month: ['Av'], day: 9, days: 1, shift: 'tishabav' },
};

const fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { month: 'long', day: 'numeric', timeZone: 'UTC' });
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400e3);

function hebParts(d) {
  let month = '', day = 0;
  for (const p of fmt.formatToParts(d)) {
    if (p.type === 'month') month = p.value;
    else if (p.type === 'day') day = Number(p.value);
  }
  return { month, day };
}

function applyShift(kind, d) {
  const w = d.getUTCDay(); // 0=Sun ... 6=Sat
  switch (kind) {
    case 'atzmaut': // d = 5 Iyar
      if (w === 5) return addDays(d, -1);
      if (w === 6) return addDays(d, -2);
      if (w === 1) return addDays(d, 1);
      return d;
    case 'zikaron':
      return addDays(applyShift('atzmaut', d), -1);
    case 'shoah': // d = 27 Nisan
      if (w === 5) return addDays(d, -1);
      if (w === 0) return addDays(d, 1);
      return d;
    case 'tishabav':
      if (w === 6) return addDays(d, 1);
      return d;
    default: return d;
  }
}

const cache = new Map();

/** Returns { holidayKey: [{ start: 'YYYY-MM-DD', days: n }, ...] } for the given Gregorian years. */
export function computeHolidays(fromYear, toYear) {
  const ck = `${fromYear}-${toYear}`;
  if (cache.has(ck)) return cache.get(ck);
  const out = Object.fromEntries(Object.keys(HOLIDAYS).map(k => [k, []]));
  // Start a bit earlier so holidays starting in late December of the previous year are included.
  let d = new Date(Date.UTC(fromYear - 1, 11, 1, 12));
  const end = new Date(Date.UTC(toYear, 11, 31, 12));
  while (d <= end) {
    const { month, day } = hebParts(d);
    for (const [key, h] of Object.entries(HOLIDAYS)) {
      if (h.day === day && h.month.includes(month)) {
        const start = h.shift ? applyShift(h.shift, d) : d;
        out[key].push({ start: iso(start), days: h.days });
      }
    }
    d = addDays(d, 1);
  }
  cache.set(ck, out);
  return out;
}

export function holidaysForManifest(now = new Date()) {
  const y = now.getUTCFullYear();
  return computeHolidays(y - 1, y + 3);
}

export function holidayList() {
  return Object.entries(HOLIDAYS).map(([key, h]) => ({ key, he: h.he, en: h.en, days: h.days }));
}
