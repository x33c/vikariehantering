import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/absenceSchedule.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context);
const clip = (rows, absence) => JSON.parse(JSON.stringify(context.exports.absenceSchedule(rows, absence)));
const rows = [
  { id: 'morning', tid_från: '08:00:00', tid_till: '10:00:00' },
  { id: 'partial', tid_från: '11:00:00', tid_till: '12:00:00' },
  { id: 'afternoon', tid_från: '13:00:00', tid_till: '16:30:00' },
];
const part = { hel_dag: false, tid_från: '11:30', tid_till: '15:00' };
assert.deepEqual(clip(rows, part), [
  { id: 'partial', tid_från: '11:30', tid_till: '12:00' },
  { id: 'afternoon', tid_från: '13:00', tid_till: '15:00' },
]);
assert.equal(clip(rows, { hel_dag: true }).length, 3);
assert.equal(clip(rows, { ...part, tid_från: '16:30', tid_till: '17:00' }).length, 0);
assert.equal(clip(rows, { ...part, tid_till: null }).at(-1).tid_till, '16:30');
assert.equal(rows[1].tid_från, '11:00:00', 'Source schedule is not mutated');
const page = readFileSync('src/pages/admin/Franvaro.tsx', 'utf8');
assert.equal((page.match(/absenceSchedule\(sorteraOchRensaSchemarader/g) || []).length, 2);
console.log('PASS: partial absence clips both creation flows, boundary lessons and open-ended absence');
