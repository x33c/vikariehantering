import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, dependencies = {}) {
  const context = { exports: {}, require: name => dependencies[name] };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return context.exports;
}
const safety = load('../src/lib/cleanupSafety.ts');
const shift = { datum: '2026-09-24', status: 'obokat', vikarie_id: null };
assert.equal(safety.canArchiveDuringCleanup(shift, '2026-09-25'), true);
for (const changed of [{ datum: '2026-09-25' }, { datum: '2026-09-26' }, { status: 'bokat' },
  { status: 'bekräftat' }, { status: 'notifierat' }, { vikarie_id: 'sub' }]) {
  assert.equal(safety.canArchiveDuringCleanup({ ...shift, ...changed }, '2026-09-25'), false);
}
let result;
const api = load('../src/lib/api/index.ts', {
  '../supabase': { supabase: { functions: { invoke: async () => {
    if (result instanceof Error) throw result;
    return result;
  } } } },
  '../cleanupSafety': safety,
});
result = { data: { saved: true }, error: null };
assert.equal((await api.notisApi.skickaAdminSvar('shift', 'sub', 'ja')).error, null);
for (const failure of [{ data: { ok: true }, error: null }, { error: new Error('403') }, new Error('offline')]) {
  result = failure;
  assert.ok((await api.notisApi.skickaAdminSvar('shift', 'sub', 'nej')).error);
}
console.log('11 cleanup and notification failure checks passed');
