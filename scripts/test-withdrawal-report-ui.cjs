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
        if (path.endsWith('/vikariepass')) data = [{ id: 'p', datum: date, tid_från: '09:00', tid_till: '17:00', status: 'bokat', vikarie_id: 'new', personal: person, förfrågningar: [] }];
        if (path.endsWith('/passhistorik')) {
          assert.equal(url.searchParams.get('metadata->>åtgärd'), 'eq.registrerade_aterbud');
          if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'History unavailable' }) });
          data = [{ pass_id: 'p', metadata: { vikarie_id: 'old', datum: date, tid_från: '08:00', tid_till: '16:00' } }];
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
      assert(await page.locator('div:visible').evaluateAll(nodes => nodes.some(n => n.innerHTML === 'Gordana<br><br>Daren')));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('s:visible').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `../withdrawal-report-${width}.png` });
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
