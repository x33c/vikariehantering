import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual handlers with isolated services; never contact production.
function functions(file, names, context) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) found.push(node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(found.length, names.length);
  vm.runInNewContext(ts.transpileModule(found.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return context;
}
const admin = 'src/pages/admin/Vikariepass.tsx';
function setup({ invalid = false, failSave = false, pending = false } = {}) {
  const events = [];
  const pass = { id: 'p', datum: '2026-10-20', tid_från: '08:00', tid_till: '16:00', status: 'notifierat', vikarie_id: null, riktad_till_vikarie_id: 'sub', förfrågningar: [{ id: 'r', vikarie_id: 'sub', status: pending ? 'vantar' : 'aterkallad' }] };
  let updated;
  const c = {
    pass, sparar: false, dagLast: false, valdVikarieId: 'sub', valdVikarie: { namn: 'Test' },
    tidFrån: '09:00', tidTill: invalid ? '08:00' : '17:00',
    harPassÄndringar: true, tiderÄndrade: true, gruppÄndrad: false, normaliseradGrupp: '',
    skickaNotis: true, confirmDeclines: async () => true,
    setSparar: value => { c.sparar = value; }, setFel: value => { c.error = value; },
    uppdateraPass: async data => { events.push('save'); if (failSave) return false; Object.assign(pass, data); return true; },
    passApi: { läggTillFörfrågningar: async () => {
      events.push('request'); assert.equal(pass.tid_från, '09:00'); assert.equal(pass.tid_till, '17:00');
      return { data: [{ id: 'r', vikarie_id: 'sub', status: 'vantar' }] };
    } },
    notisApi: { skickaNotiser: async () => { events.push('notify'); return {}; } },
    historikApi: { skapa: async () => {} }, laddaHistorikFörPass: async () => {},
    onUppdaterad: value => { updated = value; },
  };
  functions(admin, ['väntandeFörfrågningar', 'harVäntandeFörfråganTill', 'sparaPassÄndringar', 'skickaFörfrågan'], c);
  return { c, events, updated: () => updated };
}
let s = setup();
await s.c.skickaFörfrågan();
assert.deepEqual(s.events, ['save', 'request', 'notify']);
assert.equal(s.updated().tid_från, '09:00');
assert.equal(s.updated().förfrågningar.length, 1, 'Reopened request replaces the old version');
assert.equal(s.updated().förfrågningar[0].status, 'vantar');
assert.equal(s.c.sparar, false);
for (const options of [{ invalid: true }, { failSave: true }, { pending: true }]) {
  s = setup(options);
  await s.c.skickaFörfrågan();
  assert(!s.events.includes('request'));
  assert(!s.events.includes('notify'));
  assert.equal(s.c.sparar, false);
}
const offers = functions('src/pages/vikarie/LedigaPass.tsx', ['harVäntandeFörfrågan', 'harNågonVäntandeFörfrågan'], {});
const calendar = functions('src/pages/vikarie/MinaPass.tsx', ['ärFörfrågan'], {});
for (const status of ['ja', 'nej', 'aterkallad', 'vantar']) {
  const shift = { status: 'notifierat', riktad_till_vikarie_id: 'sub', förfrågningar: [{ vikarie_id: 'sub', status }] };
  assert.equal(offers.harVäntandeFörfrågan(shift, 'sub'), status === 'vantar');
  assert.equal(offers.harNågonVäntandeFörfrågan(shift), status === 'vantar');
  assert.equal(calendar.ärFörfrågan(shift, 'sub'), status === 'vantar');
}
assert.equal(offers.harVäntandeFörfrågan({ riktad_till_vikarie_id: 'sub' }, 'sub'), false);
console.log('PASS: save before request/notification, failed-save and invalid-time guards, request deduplication, authoritative pending status in both substitute views');
