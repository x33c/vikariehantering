import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const context = { exports: {}, Request, Response, console,
    Deno: { env: { get: () => 'test' } }, require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.exports;
}
const authorization = load('../supabase/functions/_shared/authorization.ts');
function client({ role = 'vikarie', active = true, valid = true, owner = false, requested = false, fail = false } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: valid ? { id: 'user', email: 'test@example.test' } : null }, error: null }) },
    from(table) {
      const result = { error: fail ? { message: 'unavailable' } : null,
        data: table === 'profiler' ? { id: 'user', roll: role, aktiv: active } :
          table === 'vikarier' ? [{ id: 'sub' }] :
          table === 'vikariepass' ? { vikarie_id: owner ? 'sub' : 'other' } :
          table === 'pass_forfragningar' ? (requested ? [{ id: 'request' }] : []) : [] };
      const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
      for (const method of ['select', 'eq', 'in', 'limit', 'maybeSingle']) query[method] = () => query;
      return query;
    },
  };
}
const request = (token = 'test') => new Request('https://example.test', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
assert.equal((await authorization.authenticate(request(''), client())).status, 401);
assert.equal((await authorization.authenticate(request(), client({ valid: false }))).status, 401);
assert.equal((await authorization.authenticate(request(), client({ active: false }))).status, 403);
assert.equal((await authorization.authenticate(request(), client({ fail: true }))).status, 403);
assert.equal((await authorization.authenticate(request(), client())).profile.roll, 'vikarie');
const profile = { id: 'user', roll: 'vikarie' };
const notify = (body, options) => authorization.mayNotify(client(options), profile, { pass_id: 'pass', ...body });
assert.equal(await notify({ typ: 'massmeddelande_vikarier' }), false);
assert.equal(await notify({ typ: 'bokat_pass_andrat' }), false);
assert.equal(await notify({}), false);
assert.equal(await notify({ typ: 'pass_meddelande', avsandare_roll: 'admin' }, { owner: true }), false);
assert.equal(await notify({ typ: 'pass_meddelande', avsandare_roll: 'vikarie' }, { owner: true }), true);
assert.equal(await notify({ typ: 'pass_meddelande', avsandare_roll: 'vikarie' }), false);
assert.equal(await notify({ typ: 'admin_avbokning' }, { owner: true }), true);
assert.equal(await notify({ typ: 'admin_avbokning' }, { requested: true }), false);
assert.equal(await notify({ typ: 'admin_vikarie_svar', vikarie_id: 'other' }, { requested: true }), false);
assert.equal(await notify({ typ: 'admin_vikarie_svar', vikarie_id: 'sub' }, { requested: true }), true);
assert.equal(await notify({ typ: 'admin_vikarie_svar', vikarie_id: 'sub' }), false);
assert.equal(await notify({ typ: 'test_push' }), true);
assert.equal(await authorization.mayNotify(client(), { ...profile, roll: 'admin' }, { typ: 'massmeddelande_vikarier' }), true);

// Verify account creation and role edits both pass through the shared admin gate.
for (const role of ['vikarie', 'admin']) {
  let handler;
  load('../supabase/functions/hantera-anvandare/index.ts', {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: fn => { handler = fn; } },
    'https://esm.sh/@supabase/supabase-js@2': { createClient: () => client({ role }) },
    '../_shared/authorization.ts': authorization,
  });
  for (const action of ['skapa', 'uppdatera_roll']) {
    const response = await handler(new Request('https://example.test', {
      method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ åtgärd: action }),
    }));
    assert.equal(response.status, role === 'admin' ? 400 : 403);
  }
  assert.equal((await handler(new Request('https://example.test'))).status, 405);
}
console.log('24 edge authorization regression checks passed');
