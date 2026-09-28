import { readFile } from 'node:fs/promises';
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const ref = (process.env.SUPABASE_PROJECT_REF || process.env.SUPABASE_PROJECT_ID)?.trim();
if (!token || !ref || !/^[a-z0-9]+$/.test(ref)) throw new Error('Supabase secrets saknas.');
const query = (await Promise.all([
  '../supabase/migrations/20260928090000_accept_replacement_request.sql',
  '../supabase/migrations/20260928100000_register_substitute_withdrawal.sql',
].map(path => readFile(new URL(path, import.meta.url), 'utf8')))).join('\n');
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }), signal: AbortSignal.timeout(120000),
});
if (!response.ok) throw new Error(`Replacement migration failed (HTTP ${response.status}).`);
console.log('Replacement request transaction activated.');
