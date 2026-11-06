import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function handler(file, name, context) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert(found);
  vm.runInNewContext(ts.transpileModule(found, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return context[name];
}
const pass = { id: 'p', datum: '2026-12-01', tid_från: '08:00', tid_till: '16:00' };
for (const changed of [false, true]) {
  let refreshed = false;
  let message = '';
  const check = handler('src/pages/vikarie/LedigaPass.tsx', 'kontrolleraAktuellaTider', {
    passApi: { hämta: async () => ({ data: { ...pass, tid_från: changed ? '11:30' : '08:00:00' } }) },
    ladda: async () => { refreshed = true; }, setFel: text => { message = text; },
  });
  assert.equal(await check({ pass: [pass] }), !changed);
  assert.equal(refreshed, changed);
  assert.equal(!!message, changed);
}
for (const scenario of ['success', 'save-error', 'notify-error', 'network-error']) {
  let info = '', error = '', busy = false, notified = false;
  const cancel = handler('src/pages/vikarie/MinaPass.tsx', 'beOmAvbokning', {
    valtPass: pass, sparar: false,
    setSparar: value => { busy = value; }, setModalFel: value => { error = value; }, setModalInfo: value => { info = value; },
    passmeddelandeApi: { skapa: async () => {
      if (scenario === 'network-error') throw new Error('offline');
      return { error: scenario === 'save-error' ? { message: 'denied' } : null };
    } },
    notisApi: { skickaAdminAvbokning: async () => { notified = true; return { error: scenario === 'notify-error' ? {} : null }; } },
    uppdateraMeddelanden: async () => {},
  });
  await cancel();
  assert.equal(busy, false);
  assert.equal(notified, ['success', 'notify-error'].includes(scenario));
  assert.equal(!!error, scenario !== 'success');
  assert.equal(!!info, ['success', 'notify-error'].includes(scenario));
}
console.log('PASS: stale times require review; cancellation handles save, notification and network failure');
