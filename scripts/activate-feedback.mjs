import { readFile } from 'node:fs/promises';
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const ref = (process.env.SUPABASE_PROJECT_REF || process.env.SUPABASE_PROJECT_ID)?.trim();
if (!token || !ref || !/^[a-z0-9]+$/.test(ref)) throw new Error('Supabase secrets saknas.');
const query = await readFile(new URL('../supabase/migrations/20261109120000_feedback.sql', import.meta.url), 'utf8');
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }), signal: AbortSignal.timeout(120000),
});
if (!response.ok) throw new Error(`Feedback migration failed (HTTP ${response.status}).`);
console.log('Feedback migration activated.');
