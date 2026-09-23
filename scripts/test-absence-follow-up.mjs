import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/absenceFollowUp.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { previousWorkday, absencesToFollowUp } = context.exports;
assert.equal(previousWorkday('2026-09-23'), '2026-09-22');
assert.equal(previousWorkday('2026-09-21'), '2026-09-18');
assert.equal(previousWorkday('2026-03-30'), '2026-03-27');
assert.equal(previousWorkday('2027-01-01'), '2026-12-31');
const prior = { id: 'prior', personal_id: 'person', datum_från: '2026-09-22', datum_till: '2026-09-22', personal: { namn: 'Testperson', aktiv: true } };
const count = rows => absencesToFollowUp(rows, '2026-09-23').length;
assert.equal(count([prior]), 1);
assert.equal(count([prior, { ...prior, id: 'duplicate' }]), 1);
assert.equal(count([prior, { ...prior, id: 'today', datum_från: '2026-09-23', datum_till: '2026-09-23' }]), 0);
assert.equal(count([{ ...prior, datum_till: '2026-09-25' }]), 0);
assert.equal(count([{ ...prior, anteckning: '[admin:franvaro-lost:2026-09-22]\nIngen vikarie behövs' }]), 1);
assert.equal(count([{ ...prior, hel_dag: false, tid_från: '12:00', tid_till: '15:00' }]), 1);
assert.equal(count([{ ...prior, personal: { ...prior.personal, aktiv: false } }]), 0);
assert.equal(count([prior, { ...prior, personal_id: 'other' }]), 2);
assert.equal(count([]), 0);
console.log('13 absence follow-up checks passed');
