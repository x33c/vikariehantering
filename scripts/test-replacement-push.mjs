import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('supabase/functions/skicka-epost/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
for (const [reply, assigned, duplicate, notice, expected] of [
  ['ja', 'new', false, true, 1], ['nej', 'old', false, true, 0],
  ['ja', 'new', true, true, 0], ['ja', 'other', false, true, 0],
  ['ja', 'new', false, false, 0],
]) {
  let handler;
  const pushes = [];
  const client = { from(table) {
    let fields = '';
    const filters = {};
    const query = {
      select(value) { fields = value; return query; },
      eq(key, value) { filters[key] = value; return query; },
      then(resolve, reject) {
        const data = table === 'vikariepass' ? { id: 'pass', vikarie_id: assigned, datum: '2026-10-01', tid_från: '08:00', tid_till: '16:00' }
          : table === 'vikarier' ? (fields === 'profil_id' ? { profil_id: 'previous-profile' } : { namn: 'New substitute' })
          : table === 'profiler' ? []
          : table === 'notiser' && filters.mottagare === 'vikarie' ? (notice ? { vikarie_id: 'previous', ämne: 'Din bokning har ersatts', innehåll: 'Saved transaction message' } : null)
          : table === 'notiser' && fields === 'id' ? (duplicate ? [{ id: 'saved' }] : []) : null;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    for (const method of ['neq', 'gte', 'order', 'limit', 'maybeSingle', 'single', 'insert']) query[method] = () => query;
    return query;
  } };
  const dependencies = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: fn => { handler = fn; } },
    'https://esm.sh/@supabase/supabase-js@2': { createClient: () => client },
    '../_shared/authorization.ts': { authenticate: async () => ({ user: {}, profile: {} }), mayNotify: async () => true },
    'npm:@pushforge/builder': {},
  };
  const context = vm.createContext({ exports: {}, Request, Response, console,
    Deno: { env: { get: () => '' } }, require: name => dependencies[name],
    recordPush: (...args) => pushes.push(args),
  });
  vm.runInContext(source, context);
  vm.runInContext('skickaPush = recordPush', context);
  const response = await handler(new Request('https://example.test', {
    method: 'POST', body: JSON.stringify({ typ: 'admin_vikarie_svar', pass_id: 'pass', vikarie_id: 'new', svar: reply, previous_vikarie_id: 'untrusted-id' }),
  }));
  assert.equal(response.status, 200);
  assert.equal(pushes.length, expected);
  if (expected) {
    assert.equal(pushes[0][1], 'previous-profile');
    assert.equal(pushes[0][3], 'Saved transaction message');
  }
}
console.log('5 replacement push routing checks passed');
