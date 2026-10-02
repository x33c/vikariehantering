import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
let failed = false;
let accepted = false;
let prompts = 0;
const supabase = { from(table) {
  const q = { select() { return q; }, eq() { return q; }, in(_field, days) {
    assert.deepEqual([...days], ['2026-10-02']);
    return Promise.resolve({ error: failed ? {} : null, data: table === 'passhistorik'
      ? [{ pass_id: 'same-pass', metadata: { vikarie_id: 'sub', datum: '2026-10-02', tid: '08:00-10:00', personal_namn: 'Test' } }]
      : [{ pass_id: 'same-pass', vikarie_id: 'sub', pass: { datum: '2026-10-02', tid_från: '08:00', tid_till: '10:00', grupp: '4A' } }] });
  } }; return q;
} };
const ctx = { exports: {}, require: name => name === '../lib/supabase' ? { supabase } : {}, window: { confirm(text) { prompts++; assert(text.includes('08:00-10:00')); return accepted; } } };
vm.runInNewContext(ts.transpileModule(readFileSync('src/hooks/useDeclinedShifts.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
const { confirmDeclines, loadDeclines } = ctx.exports;
assert.equal((await loadDeclines([])).length, 0);
assert.equal((await loadDeclines(['2026-10-02'])).length, 1, 'One shift must not be duplicated by history');
assert.equal(await confirmDeclines(['2026-10-02'], 'other'), true);
assert.equal(prompts, 0);
assert.equal(await confirmDeclines(['2026-10-02'], 'sub'), false);
accepted = true;
assert.equal(await confirmDeclines(['2026-10-02', '2026-10-02'], 'sub'), true);
failed = true;
await assert.rejects(() => confirmDeclines(['2026-10-02'], 'sub'));
console.log('Decline warning checks passed');
