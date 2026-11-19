const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const moduleCode = ts.transpileModule(fs.readFileSync('src/lib/recipients.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exported = {};
new Function('exports', moduleCode)(exported);
const { parseRecipients } = exported;
assert.deepEqual(parseRecipients('"Surname, Name" <One@example.se>; ONE@example.se\nTwo@example.se'), { addresses: ['one@example.se','two@example.se'], invalid: [], duplicates: 1 });
assert.equal(parseRecipients('bad; a@@b.se; a..b@c.se; a@-bad.se').invalid.length, 4);
assert.deepEqual(parseRecipients('').addresses, []);
console.log('PASS recipient parsing');

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let saved = '';
  try {
    for (const width of [1280, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const user = { id: 'user', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', user_metadata: {} };
      const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url'), 'fake'].join('.');
      await context.addInitScript(({ user, token }) => {
        localStorage.setItem('notis_lathund_visad_user', 'true');
        localStorage.setItem('sb-pass-bilagor-test-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'fake', expires_at: 4102444800, token_type: 'bearer' }));
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copied = text; if (window.failCopy) throw Error('denied'); } } });
      }, { user, token });
      let failSave = true;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname !== 'pass-bilagor-test.supabase.co') return route.abort();
        let data = [];
        if (url.pathname.includes('/auth/v1/')) data = user;
        if (url.pathname.endsWith('/profiler')) data = [{ ...user, roll: 'admin', aktiv: true }];
        if (url.pathname.endsWith('/utskick_celler')) {
          if (route.request().method() === 'POST') {
            const body = route.request().postDataJSON();
            assert.equal(body.typ, 'mottagare');
            assert.equal(body.datum, '1970-01-01');
            if (failSave) { failSave = false; return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'test failure' }) }); }
            saved = body.text;
            data = [{ text: saved }];
          } else if (url.searchParams.get('typ') === 'eq.mottagare') data = saved ? [{ text: saved }] : [];
        }
        if (Array.isArray(data) && route.request().headers().accept?.includes('vnd.pgrst.object')) data = data[0] || null;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:5178/admin/utskick');
      const panel = page.getByRole('region', { name: 'Mottagarlista' });
      await panel.getByRole('button', { name: 'Redigera lista' }).click();
      if (width !== 1280) assert.equal(await panel.getByLabel('E-postadresser').inputValue(), saved);
      await panel.getByLabel('E-postadresser').fill('felaktig');
      assert(await panel.getByRole('button', { name: 'Spara lista' }).isDisabled());
      await panel.getByLabel('E-postadresser').fill('Person <one@example.se>; ONE@example.se\ntwo@example.se');
      await panel.getByRole('button', { name: 'Spara lista' }).click();
      await panel.getByText('Listan kunde inte sparas. Dina ändringar finns kvar.').waitFor();
      assert((await panel.getByLabel('E-postadresser').inputValue()).includes('Person'));
      await panel.getByRole('button', { name: 'Spara lista' }).click();
      await panel.getByText('Mottagarlistan är sparad.').waitFor();
      await panel.getByRole('button', { name: 'Kopiera mottagare' }).click();
      await panel.getByText('2 mottagare kopierade.').waitFor();
      assert.equal(await page.evaluate(() => window.copied), 'one@example.se; two@example.se');
      await page.evaluate(() => { window.failCopy = true; });
      await panel.getByRole('button', { name: 'Kopiera mottagare' }).click();
      await panel.getByLabel('Mottagare för manuell kopiering').waitFor();
      assert.equal(await panel.getByLabel('Mottagare för manuell kopiering').inputValue(), 'one@example.se; two@example.se');
      assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth));
      await page.screenshot({ path: `../recipients-${width}.png`, fullPage: false });
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}: shared persistence, validation, save failure/retry, deduplication, clipboard/fallback`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
