// Self-test for the schedule engine and holiday calendar: `npm run check`
import assert from 'node:assert/strict';
import { resolvePlaylist, makeParts, rulesMatch, ruleMatches, localParts } from '../public/shared/schedule.js';
import { computeHolidays } from './holidays.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

const H = computeHolidays(2025, 2028);
ok('Memorial Day dates', () => assert.deepEqual(H.yom_hazikaron.filter(o => o.start >= '2025').map(o => o.start), ['2025-04-30', '2026-04-21', '2027-05-11', '2028-05-01']));
ok('Independence Day dates', () => assert.deepEqual(H.yom_haatzmaut.filter(o => o.start >= '2025').map(o => o.start), ['2025-05-01', '2026-04-22', '2027-05-12', '2028-05-02']));
ok('Holocaust Day 2025 shifted to Thursday', () => assert.equal(H.yom_hashoah.find(o => o.start.startsWith('2025')).start, '2025-04-24'));

const P = (d, t) => { const [h, m] = t.split(':').map(Number); return makeParts(d, h * 60 + m); };
ok('weekly window', () => {
  const r = { type: 'weekly', days: [0, 1, 2, 3, 4], startTime: '08:00', endTime: '18:00' };
  assert.equal(ruleMatches(r, P('2026-11-23', '09:00')), true);   // Monday
  assert.equal(ruleMatches(r, P('2026-11-23', '18:00')), false);
  assert.equal(ruleMatches(r, P('2026-11-28', '09:00')), false);  // Saturday
});
ok('overnight window', () => {
  const r = { type: 'weekly', days: [4], startTime: '22:00', endTime: '06:00' }; // Thursday night
  assert.equal(ruleMatches(r, P('2026-11-26', '23:00')), true);
  assert.equal(ruleMatches(r, P('2026-11-27', '05:59')), true);  // Friday morning belongs to Thursday night
  assert.equal(ruleMatches(r, P('2026-11-27', '23:00')), false);
});
ok('date range is continuous', () => {
  const r = { type: 'dateRange', startDate: '2026-12-01', startTime: '08:00', endDate: '2026-12-03', endTime: '18:00' };
  assert.equal(ruleMatches(r, P('2026-12-01', '07:59')), false);
  assert.equal(ruleMatches(r, P('2026-12-02', '03:00')), true);
  assert.equal(ruleMatches(r, P('2026-12-03', '18:00')), false);
});
ok('yearly range across new year', () => {
  const r = { type: 'yearly', month: 12, day: 25, endMonth: 1, endDay: 2 };
  assert.equal(ruleMatches(r, P('2026-12-31', '12:00')), true);
  assert.equal(ruleMatches(r, P('2027-01-02', '12:00')), true);
  assert.equal(ruleMatches(r, P('2027-01-03', '12:00')), false);
});
ok('holiday from eve', () => {
  const r = { type: 'holiday', holiday: 'yom_hazikaron', fromEve: true, startTime: '19:00', endTime: '20:00' };
  assert.equal(ruleMatches(r, P('2027-05-10', '18:59'), H), false);
  assert.equal(ruleMatches(r, P('2027-05-10', '19:00'), H), true);
  assert.equal(ruleMatches(r, P('2027-05-11', '19:59'), H), true);
  assert.equal(ruleMatches(r, P('2027-05-11', '20:00'), H), false);
});
ok('exclude rule', () => assert.equal(rulesMatch([{ type: 'always' }, { type: 'weekly', days: [5, 6], exclude: true }], P('2026-11-28', '10:00')), false));

const manifest = {
  holidays: H,
  categories: [
    { id: 1, isDefault: true, active: true, mode: 'merge', priority: 0, sort: 0, rules: [] },
    { id: 2, active: true, mode: 'replace', priority: 100, sort: 1, rules: [{ type: 'holiday', holiday: 'yom_hazikaron', fromEve: true, startTime: '19:00', endTime: '20:00' }] },
    { id: 3, active: true, mode: 'merge', priority: 10, sort: 2, rules: [{ type: 'weekly', days: [0, 1, 2, 3, 4], startTime: '12:00', endTime: '14:00' }] },
    { id: 4, active: true, mode: 'replace', priority: 50, sort: 3, rules: [{ type: 'dateRange', startDate: '2027-05-11', endDate: '2027-05-11' }] },
    { id: 5, active: true, mode: 'replace', priority: 500, sort: 4, rules: [{ type: 'always' }] }, // replace but empty → ignored
  ],
  slides: [
    { id: 11, categoryId: 1, sort: 0, enabled: true }, { id: 12, categoryId: 1, sort: 1, enabled: false },
    { id: 13, categoryId: 1, sort: 2, enabled: true, schedule: { rules: [{ type: 'dateRange', endDate: '2026-11-30' }] } },
    { id: 21, categoryId: 2, sort: 0, enabled: true }, { id: 31, categoryId: 3, sort: 0, enabled: true }, { id: 41, categoryId: 4, sort: 0, enabled: true },
  ],
};
const ids = (d, t) => resolvePlaylist(manifest, P(d, t)).slides.map(s => s.id);
ok('regular day', () => assert.deepEqual(ids('2026-11-23', '09:00'), [11, 13]));
ok('slide expiry', () => assert.deepEqual(ids('2026-12-01', '09:00'), [11]));
ok('merge category at lunch', () => assert.deepEqual(ids('2026-12-01', '12:30'), [11, 31]));
ok('memorial replaces everything, highest priority wins', () => assert.deepEqual(ids('2027-05-11', '10:00'), [21]));
ok('lower-priority replace after memorial ends', () => assert.deepEqual(ids('2027-05-11', '21:00'), [41]));
ok('time zone parts', () => { const p = localParts(new Date('2026-07-01T21:30:00Z'), 'Asia/Jerusalem'); assert.equal(p.date, '2026-07-02'); assert.equal(p.minutes, 30); });
console.log(`\nAll ${n} checks passed.`);
