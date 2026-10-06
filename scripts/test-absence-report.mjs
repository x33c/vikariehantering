import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
function load(file, imports = {}) {
  const ctx = { exports: {}, require: name => imports[name] };
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
  return ctx.exports;
}
const { buildAbsenceReport: report, validReportRange: valid } = load('src/lib/absenceReport.ts', {
  './absenceSuggestions': load('src/lib/absenceSuggestions.ts'),
});
const a = { id: 'a', personal_id: 'p', personal: { namn: 'Anna', arbetslag: { namn: 'Åk.1' } }, datum_från: '2026-09-28', datum_till: '2026-10-06', hel_dag: true, anteckning: null };
let r = report([a], [], '2026-10-01', '2026-10-31', '');
assert.equal(r.rows.length, 4, 'Clip period and exclude weekend');
assert.equal(r.fullDays, 4);
assert.equal(r.people, 1);
assert.equal(r.records, 1);
const partial = { ...a, id: 'b', hel_dag: false, tid_från: '09:00:00', tid_till: '11:00:00' };
r = report([a, partial, { ...partial, id: 'c' }], [], '2026-10-01', '2026-10-06', '');
assert.equal(r.rows.length, 4, 'One person-day despite duplicate or partial records');
assert.equal(r.fullDays, 4, 'Full day wins when records overlap');
r = report([partial], [], '2026-10-01', '2026-10-06', 'ANNA');
assert.equal(r.partialDays, 4);
assert.equal(r.rows[0].time, '09:00–11:00');
assert.equal(report([a], [], '2026-10-01', '2026-10-06', 'unknown').people, 0);
assert.equal(report([a], [], '2026-10-01', '2026-10-06', 'åk.1').people, 1);
assert.equal(report([{ ...a, anteckning: '[admin:franvaro-lost:2026-10-01]' }], [], '2026-10-01', '2026-10-06', 'admin:').people, 0);
const shift = { id: 's', personal_id: 'p', frånvaro_id: 'a', datum: '2026-10-01', tid_från: '08:00', tid_till: '16:30', vikarie_id: 'sub', status: 'bokat' };
assert.equal(report([a], [shift], '2026-10-01', '2026-10-01', '').rows[0].status, 'Alla pass bokade');
assert.equal(report([a], [shift, { ...shift, id: 's2', vikarie_id: null, status: 'obokat' }], '2026-10-01', '2026-10-01', '').rows[0].status, 'Delvis bemannat');
assert.equal(report([a], [{ ...shift, vikarie_id: null, status: 'notifierat' }], '2026-10-01', '2026-10-01', '').rows[0].status, 'Pass utan vikarie');
for (const p of [{ ...shift, status: 'avbokat' }, { ...shift, personal_id: 'wrong' }]) assert.equal(report([a], [p], '2026-10-01', '2026-10-01', '').rows[0].status, 'Saknar pass');
assert.equal(report([{ ...a, anteckning: 'Ingen vikarie behövs' }], [], '2026-10-01', '2026-10-01', '').rows[0].status, 'Vikarie behövs ej');
assert.equal(report([{ ...a, anteckning: '[admin:franvaro-lost:2026-10-01]' }], [], '2026-10-01', '2026-10-01', '').rows[0].status, 'Markerat löst');
assert.equal(report([{ ...a, datum_från: '2026-10-01', datum_till: '2026-10-01', anteckning: '[admin:franvaro-lost]' }], [], '2026-10-01', '2026-10-01', '').rows[0].status, 'Markerat löst');
assert.equal(valid('2026-02-30', '2026-03-01'), false);
assert.equal(valid('2026-10-02', '2026-10-01'), false);
assert.equal(valid('', ''), false);
assert.equal(valid('2025-01-01', '2026-10-01'), false);
assert.equal(report([{ ...a, datum_från: '2026-12-31', datum_till: '2027-01-04' }], [], '2026-12-31', '2027-01-04', '').rows.length, 3);
console.log('PASS: report periods, weekdays, unique person-days, search, full/partial days, staffing, resolved records and validation');
const bookings = [
  { ...shift, vikarie: { namn: 'Vikarie A' } },
  { ...shift, id: 's2', tid_från: '17:00', tid_till: '18:00', vikarie: { namn: 'Vikarie A' } },
  { ...shift, id: 's3', datum: '2026-10-02', vikarie: { namn: 'Vikarie A' } },
  { ...shift, id: 's4', personal_id: null, frånvaro_id: null, vikarie_id: 'sub2', vikarie: { namn: 'Vikarie B' } },
  { ...shift, id: 's5', status: 'notifierat' },
  { ...shift, id: 's6', status: 'avbokat' },
  { ...shift, id: 's7', datum: '2026-10-03' },
];
r = report([a], bookings, '2026-10-01', '2026-10-06', '');
assert.equal(r.substitutes.length, 2, 'Unique substitutes across period, including standalone bookings');
assert.equal(r.bookedShifts, 4, 'Only booked weekday shifts');
assert.equal(r.substituteDays, 3, 'Unique substitute per day');
assert.equal(r.daily[0].substitutes, 2);
assert.equal(r.daily[0].shifts, 3);
assert.equal(r.daily[1].substitutes, 1);
assert.equal(r.daily[2].substitutes, 0, 'Include zero-booking weekdays');
assert.equal(r.substitutes[0].days, 2);
assert.equal(r.substitutes[0].shifts, 3);
assert.equal(r.peopleDetails[0].days, 4);
assert.equal(report([a], bookings, '2026-10-01', '2026-10-06', 'Anna').substitutes.length, 1, 'Search excludes unrelated standalone shifts');
assert.equal(report([], bookings, '2026-10-01', '2026-10-06', '').substitutes.length, 2, 'Bookings do not require absence records');
console.log('PASS: unique substitute counts, per-day totals, standalone shifts, search and person summaries');
