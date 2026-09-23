import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/absenceSuggestions.ts', import.meta.url), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { absenceSuggestions } = context.exports;
const date = '2026-09-25';
const absence = { id: 'a', personal_id: 'gill', datum_från: date, datum_till: date, hel_dag: true };
const shift = { datum: date, personal_id: 'gill', frånvaro_id: 'old', status: 'obokat', tid_från: '08:00', tid_till: '16:30' };
const count = (absences, shifts = []) => absenceSuggestions(absences, shifts, date).length;
assert.equal(count([absence, { ...absence, id: 'b' }]), 1);
assert.equal(count([absence], [shift]), 0);
assert.equal(count([absence], [{ ...shift, status: 'avbokat' }]), 1);
assert.equal(count([{ ...absence, anteckning: `[admin:franvaro-lost:${date}]` }]), 0);
assert.equal(count([{ ...absence, anteckning: '[admin:franvaro-lost]' }]), 0);
assert.equal(count([{ ...absence, datum_från: '2026-09-24', anteckning: '[admin:franvaro-lost:2026-09-24]' }]), 1);
assert.equal(count([absence, { ...absence, id: 'other', personal_id: 'someone-else' }]), 2);
assert.equal(count([{ ...absence, ingen_vikarie_behövs: true }]), 0);
assert.equal(count([{ ...absence, anteckning: 'Ingen vikarie behövs' }]), 0);
assert.equal(count([{ ...absence, datum_från: '2026-09-26' }]), 0);
const morning = { ...absence, hel_dag: false, tid_från: '08:00', tid_till: '10:00' };
const afternoon = { ...morning, id: 'afternoon', tid_från: '13:00', tid_till: '15:00' };
assert.equal(count([morning, afternoon]), 2);
assert.equal(count([morning, afternoon], [{ ...shift, tid_till: '10:00' }]), 1);
assert.equal(count([morning, { ...morning, id: 'duplicate', tid_från: '08:00:00' }]), 1);
console.log('13 absence suggestion regression checks passed');
