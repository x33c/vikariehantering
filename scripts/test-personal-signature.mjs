import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let payload;
const query = { select() { return query; }, eq() { return query; }, single() { return { data: payload, error: null }; } };
const supabase = { from(table) {
  assert.equal(table, 'personal');
  return { insert(data) { payload = data; return query; }, update(data) { payload = data; return query; } };
} };
const context = { exports: {}, require: name => name === '../supabase' ? { supabase } : {} };
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/api/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
const api = context.exports.personalApi;
for (const signatur of ['', '   ', null]) {
  await api.skapa({ namn: 'Test', signatur });
  assert.equal(payload.signatur, null);
  await api.uppdatera('person', { arbetslag_id: 'year-1', signatur });
  assert.equal(payload.signatur, null);
  assert.equal(payload.arbetslag_id, 'year-1');
}
await api.uppdatera('person', { arbetslag_id: 'year-2' });
assert.equal(Object.hasOwn(payload, 'signatur'), false);
await api.uppdatera('person', { signatur: ' SG ' });
assert.equal(payload.signatur, 'SG');
for (const skola24_id of ['', '   ', null]) {
  await api.skapa({ namn: 'Test', skola24_id });
  assert.equal(payload.skola24_id, null);
  await api.uppdatera('person', { arbetslag_id: 'year-1', skola24_id });
  assert.equal(payload.skola24_id, null);
  assert.equal(payload.arbetslag_id, 'year-1');
}
await api.uppdatera('person', { arbetslag_id: 'year-2', signatur: '' });
assert.equal(Object.hasOwn(payload, 'skola24_id'), false);
await api.uppdatera('person', { skola24_id: ' imported-123 ', signatur: 'SG' });
assert.equal(payload.skola24_id, 'imported-123');
assert.equal(payload.signatur, 'SG');
const formSource = readFileSync('src/pages/admin/Arbetslag.tsx', 'utf8');
assert(!formSource.includes("skola24_id: personal?.signatur"));
assert(formSource.includes('personalApi.uppdatera(personal.id, redigerbaraFält)'));
console.log('Personal signature normalization checks passed');
