import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/loginError.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context);
const format = context.exports.loginError;
assert.match(format({ code: 'invalid_credentials' }), /Felaktig/);
assert.match(format({ status: 402 }), /spärrad/);
assert.match(format({ status: 429 }), /För många/);
assert.match(format({ code: 'email_not_confirmed' }), /bekräftas/);
assert.match(format({ name: 'AuthRetryableFetchError' }), /anslutningen/);
assert.match(format(new TypeError('Failed to fetch')), /anslutningen/);
for (const error of [null, undefined, { status: 500 }, { message: 'secret server detail' }]) {
  assert.doesNotMatch(format(error), /Felaktig|secret/);
}
console.log('10 login error checks passed');
