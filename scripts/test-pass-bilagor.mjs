import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/api/index.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function setup({ insertError = null, uploadError = null, popup = true, signedError = null } = {}) {
  const calls = [];
  const tab = { opener: {}, close: () => calls.push('close'), location: { replace: url => calls.push(['navigate', url]) } };
  let inserted;
  const storage = {
    upload: async (...args) => { calls.push(['upload', ...args]); return { error: uploadError }; },
    remove: async paths => { calls.push(['remove', paths]); return { error: null }; },
    createSignedUrl: async () => { calls.push('sign'); return { data: { signedUrl: 'https://example.test/file' }, error: signedError }; },
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
    storage: { from: () => storage },
    from: () => ({
      insert: value => {
        inserted = value;
        return { select: () => ({ single: async () => ({ data: { id: 'attachment', ...value }, error: insertError }) }) };
      },
      select: () => ({ in: async () => ({ data: null, error: { message: 'Table missing' } }) }),
    }),
  };
  const exports = {};
  runInNewContext(compiled, {
    exports, require: () => ({ supabase }),
    crypto: { randomUUID: () => 'unique-id' },
    window: { open: () => { calls.push('open'); return popup ? tab : null; } },
  });
  return { api: exports.passbilagaApi, calls, tab, inserted: () => inserted };
}

test('Rejects oversized and unsupported files before storage is called', async () => {
  const { api, calls } = setup();
  assert.ok((await api.laddaUpp('pass', { name: 'big.pdf', size: 10485761, type: 'application/pdf' })).error);
  assert.ok((await api.laddaUpp('pass', { name: 'unsafe.html', size: 30, type: 'text/html' })).error);
  assert.equal(calls.length, 0);
});

test('Uploads Office files without browser MIME and preserves Swedish display name', async () => {
  const { api, calls, inserted } = setup();
  const result = await api.laddaUpp('pass', { name: 'Planering åk 4.docx', size: 100, type: '' });
  assert.equal(result.error, null);
  assert.equal(inserted().filnamn, 'Planering åk 4.docx');
  assert.match(inserted().storage_path, /^pass\/unique-id-Planering-ak-4\.docx$/);
  assert.match(calls[0][3].contentType, /wordprocessingml/);
});

test('Removes uploaded object if metadata cannot be saved', async () => {
  const { api, calls } = setup({ insertError: { message: 'Database unavailable' } });
  assert.ok((await api.laddaUpp('pass', { name: 'plan.pdf', size: 100, type: 'application/pdf' })).error);
  assert.equal(calls[1][0], 'remove');
  assert.equal(calls[1][1][0], calls[0][1]);
});

test('Does not insert metadata after storage upload failure', async () => {
  const { api, inserted } = setup({ uploadError: { message: 'Storage unavailable' } });
  assert.ok((await api.laddaUpp('pass', { name: 'plan.pdf', size: 100, type: 'application/pdf' })).error);
  assert.equal(inserted(), undefined);
});

test('Reserves file window before network await and detaches opener', async () => {
  const { api, calls, tab } = setup();
  const result = api.öppna({ storage_path: 'pass/file.pdf' });
  assert.equal(calls[0], 'open');
  assert.equal(tab.opener, null);
  assert.equal((await result).error, null);
  assert.equal(calls[2][0], 'navigate');
});

test('Blocked popups return a visible error without creating a signed URL', async () => {
  const { api, calls } = setup({ popup: false });
  assert.ok((await api.öppna({ storage_path: 'file' })).error);
  assert.equal(calls.length, 1);
});

test('Access denied closes empty file window', async () => {
  const { api, calls } = setup({ signedError: { message: 'Denied' } });
  assert.ok((await api.öppna({ storage_path: 'file' })).error);
  assert.equal(calls.at(-1), 'close');
});

test('Missing attachment migration does not break existing shift list', async () => {
  const { api } = setup();
  const result = await api.kopplaTillPass([{ id: 'pass', datum: '2026-09-14' }]);
  assert.equal(result[0].id, 'pass');
  assert.equal(result[0].datum, '2026-09-14');
  assert.equal(result[0].bilagor.length, 0);
});
