import { readFile } from 'node:fs/promises';

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const ref = process.env.SUPABASE_PROJECT_REF?.trim();
if (!token || !ref || !/^[a-z0-9]+$/.test(ref)) {
  throw new Error('SUPABASE_ACCESS_TOKEN och SUPABASE_PROJECT_REF maste finnas som Repository secrets.');
}

const query = await readFile(new URL('../supabase/migrations/20260911123000_add_pass_bilagor.sql', import.meta.url), 'utf8');
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
  signal: AbortSignal.timeout(120000),
});
if (!response.ok) {
  const detail = (await response.text()).replaceAll(token, '[redacted]').replaceAll(ref, '[project]');
  throw new Error(`Kunde inte aktivera bilagor (HTTP ${response.status}): ${detail}`);
}
console.log('Bilagor aktiverade: privat lagring, tabell och atkomstregler.');
