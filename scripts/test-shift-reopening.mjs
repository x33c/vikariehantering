import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/api/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function api(results) {
  const calls = [];
  const supabase = { from(table) {
    const call = { table, filters: [] };
    calls.push(call);
    const result = results.shift();
    const query = {
      update(data) { call.data = data; return query; },
      eq(key, value) { call.filters.push([key, value]); return query; },
      select() { return query; },
      single() { return Promise.resolve(result); },
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    };
    return query;
  } };
  const context = { exports: {}, require: () => ({ supabase }) };
  vm.runInNewContext(compiled, context);
  return { calls, passApi: context.exports.passApi };
}
const ok = api([{ error: null }, { data: { id: 'shift', status: 'obokat' }, error: null }]);
assert.equal((await ok.passApi['återöppna']('shift')).data.status, 'obokat');
assert.equal(ok.calls.length, 2);
assert.equal(ok.calls[0].table, 'pass_forfragningar');
assert.equal(ok.calls[0].data.status, 'aterkallad');
assert.deepEqual(JSON.parse(JSON.stringify(ok.calls[0].filters)), [['pass_id', 'shift'], ['status', 'vantar']]);
assert.deepEqual(JSON.parse(JSON.stringify(ok.calls[1].filters)), [['id', 'shift'], ['status', 'avbokat']]);
assert.deepEqual(JSON.parse(JSON.stringify(ok.calls[1].data)), {
  status: 'obokat', publicerad: false, vikarie_id: null, riktad_till_vikarie_id: null,
});
const blocked = api([{ error: { message: 'denied' } }]);
assert.equal((await blocked.passApi['återöppna']('shift')).error.message, 'denied');
assert.equal(blocked.calls.length, 1);
const stale = api([{ error: null }, { error: { message: 'no cancelled shift' }, data: null }]);
assert.equal((await stale.passApi['återöppna']('shift')).data, null);
console.log('10 shift reopening checks passed');
