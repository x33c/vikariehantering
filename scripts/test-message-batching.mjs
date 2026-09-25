import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/api/index.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
let calls = [];
let results = [];
const supabase = { from(table) {
  const call = { table }; calls.push(call);
  const query = {
    select(fields) { call.fields = fields; return query; },
    in(key, values) { call.ids = values; return query; },
    eq(key, value) { call.filter = [key, value]; return query; },
    order() { return query; },
    range(start, end) { call.range = [start, end]; return Promise.resolve(results.shift() ?? { data: [], error: null }); },
  };
  return query;
} };
const context = { exports: {}, require: () => ({ supabase }) };
vm.runInNewContext(compiled, context);
const list = context.exports.passmeddelandeApi.listaVikariemeddelanden;
assert.equal((await list([])).data.length, 0);
assert.equal(calls.length, 0);
await list(Array.from({ length: 50 }, (_, i) => `shift-${i}`));
assert.equal(calls.length, 1);
assert.equal(calls[0].fields, 'pass_id, meddelande');
assert.equal(calls[0].filter[1], 'vikarie');
calls = [];
results = [{ data: Array.from({ length: 500 }, () => ({ pass_id: 'shift', meddelande: 'test' })) },
  { data: [{ pass_id: 'shift', meddelande: 'late cancellation' }] }];
assert.equal((await list(['shift', 'shift'])).data.length, 501);
assert.equal(calls.length, 2);
assert.equal(calls[0].ids.length, 1);
assert.equal(calls[1].range[0], 500);
calls = [];
await list(Array.from({ length: 51 }, (_, i) => `shift-${i}`));
assert.equal(calls.length, 2);
results = [{ error: { message: 'denied' } }];
assert.equal((await list(['shift'])).error.message, 'denied');
console.log('11 batching checks passed; 50 shifts use 1 request instead of 50 (short conversations)');
for (const fetch of [context.exports.vikariApi['hämtaTillgänglighetFörFlera'], context.exports.passTidsändringApi['listaVäntandeFörFlera']]) {
  calls = []; results = [];
  await fetch([]);
  assert.equal(calls.length, 0);
  await fetch(['a', 'a', 'b']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ids.length, 2);
  calls = [];
  results = [{ data: Array.from({ length: 500 }, () => ({ id: 'row' })) }, { data: [{ id: 'last' }] }];
  assert.equal((await fetch(['a'])).data.length, 501);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].range[0], 500);
  results = [{ error: { message: 'denied' } }];
  assert.equal((await fetch(['a'])).error.message, 'denied');
}
console.log('14 availability and time-proposal batching checks passed');
