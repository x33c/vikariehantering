import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve(process.env.PGLITE_MODULE || '../feedback-test-runtime/package/dist/index.js')));
function sql(file) {
  return readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.startsWith('\\ir ') ? sql(resolve(dirname(file), line.slice(4).trim())) : line).join('\n');
}
const db = new PGlite();
try {
  await db.exec(sql(resolve('scripts/test-feedback.sql')));
  console.log('PASS: isolated PostgreSQL feedback permissions, validation, notifications and retries');
} finally { await db.close(); }
