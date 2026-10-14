const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const user = { id: 'user', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', user_metadata: {} };
const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url'), 'fake'].join('.');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 850 } });
      await context.addInitScript(({ user, token }) => {
        localStorage.setItem(`notis_lathund_visad_${user.id}`, 'true');
        localStorage.setItem('sb-pass-bilagor-test-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'fake', expires_at: 4102444800, token_type: 'bearer' }));
      }, { user, token });
      const day = new Date();
      day.setDate(day.getDate() + (day.getDay() === 0 ? 1 : day.getDay() === 6 ? 2 : 0));
      const date = day.toLocaleDateString('sv-SE');
      let fail = false;
      let failRemove = false;
      const removals = [];
      const person = { id: 'person', namn: 'Gordana', aktiv: true };
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname !== 'pass-bilagor-test.supabase.co') return route.abort();
        const path = decodeURIComponent(url.pathname);
        let data = [];
        if (path.includes('/auth/v1/')) data = user;
        if (path.endsWith('/profiler')) data = [{ ...user, roll: 'admin', aktiv: true }];
        if (path.endsWith('/personal')) data = [person];
        if (path.endsWith('/vikarier')) data = [{ id: 'old', namn: 'Daren' }, { id: 'new', namn: 'Amanda' }];
        if (path.endsWith('/frånvaro')) data = [{ id: 'a', personal_id: 'person', personal: person, datum_från: date, datum_till: date, hel_dag: true }];
        if (path.endsWith('/vikariepass')) data = [{ id: 'p', datum: date, tid_från: '09:00', tid_till: '17:00', grupp: 'Åk.6', status: 'bokat', vikarie_id: 'new', personal: person, förfrågningar: [] }];
        if (path.endsWith('/passhistorik')) {
          if (route.request().method() === 'POST') {
            if (failRemove) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Remove failed' }) });
            const row = route.request().postDataJSON();
            assert.equal(row.metadata.åtgärd, 'dolde_aterbud_i_utskick');
            assert.deepEqual(row.metadata.återbud_ids, ['withdrawal']);
            removals.push(row);
            return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
          }
          assert.equal(url.searchParams.get('metadata->>åtgärd'), 'in.(registrerade_aterbud,dolde_aterbud_i_utskick)');
          if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'History unavailable' }) });
          data = [{ id: 'withdrawal', pass_id: 'p', metadata: { åtgärd: 'registrerade_aterbud', vikarie_id: 'old', datum: date, tid_från: '08:00', tid_till: '16:00', grupp: 'FSK' } }, ...removals];
        }
        if (Array.isArray(data) && route.request().headers().accept?.includes('vnd.pgrst.object')) data = data[0] || null;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:5178/admin/utskick');
      await page.locator('s:visible').first().waitFor();
      assert.equal(await page.locator('s:visible').count(), 1);
      assert((await page.locator('s:visible').textContent()).includes('Daren'));
      assert(!(await page.locator('s:visible').textContent()).includes('Amanda'));
      const cellText = await page.locator('s:visible').locator('..').textContent();
      assert(cellText.indexOf('Daren') < cellText.indexOf('Amanda'), 'Withdrawn FSK must precede active year 6');
      assert(await page.locator('div:visible').evaluateAll(nodes => nodes.some(n => n.innerHTML === 'Gordana<br><br>Daren')));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('s:visible').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `../withdrawal-report-${width}.png` });
      await page.getByText('Återbudsmarkeringar (1)', { exact: true }).click();
      const remove = page.getByRole('button', { name: 'Ta bort återbudsmarkering', exact: true });
      page.once('dialog', d => d.dismiss());
      await remove.click();
      assert.equal(removals.length, 0);
      failRemove = true;
      page.once('dialog', d => d.accept());
      await remove.click();
      await page.getByText('Remove failed', { exact: true }).waitFor();
      assert.equal(await page.locator('s:visible').count(), 1);
      failRemove = false;
      page.once('dialog', d => d.accept());
      await remove.click();
      await remove.waitFor({ state: 'hidden' });
      assert.equal(removals.length, 1);
      assert.equal(await page.locator('s').count(), 0);
      await page.reload();
      await page.getByRole('button', { name: 'Uppdatera', exact: true }).waitFor();
      assert.equal(await page.locator('s').count(), 0);
      assert.equal(await page.getByText('Daren', { exact: true }).count(), 0);
      await page.locator('strong:visible').filter({ hasText: 'Amanda - Åk.6' }).waitFor();
      fail = true;
      await page.getByRole('button', { name: 'Uppdatera', exact: true }).click();
      await page.getByText('History unavailable', { exact: true }).waitFor();
      assert(await page.getByRole('button', { name: 'Skicka mail', exact: true }).isDisabled());
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${width}: withdrawn row struck, replacement unstruck, absence blank line, history errors block copying`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
