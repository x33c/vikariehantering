const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      let sends = 0;
      let status = 200;
      let saves = 0;
      const user = { id: 'test-user', aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', user_metadata: {} };
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname !== 'pass-bilagor-test.supabase.co') return route.abort();
        if (url.pathname === '/auth/v1/user') {
          if (route.request().method() === 'PUT') saves++;
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
        }
        if (url.pathname === '/rest/v1/profiler') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: user.id, roll: 'admin', aktiv: true }) });
        if (url.pathname === '/auth/v1/recover') {
          sends++;
          assert.equal(route.request().postDataJSON().email, 'admin@example.test');
          assert.equal(url.searchParams.get('redirect_to'), 'http://127.0.0.1:5178/nytt-losenord');
          return route.fulfill({ status, contentType: 'application/json', body: status === 200 ? '{}' : '{"message":"rate limited"}' });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:5178/login');
      await page.getByRole('link', { name: 'Glömt lösenord?' }).click();
      await page.locator('input[type=email]').fill('admin@example.test');
      status = 429;
      await page.getByRole('button', { name: 'Skicka återställningslänk' }).click();
      await page.getByText('För många försök.', { exact: false }).waitFor();
      status = 200;
      await page.getByRole('button', { name: 'Skicka återställningslänk' }).click();
      await page.getByRole('status').waitFor();
      assert.equal(sends, 2);
      assert.equal(await page.getByRole('button', { name: 'Skicka återställningslänk' }).count(), 0);
      await page.goto('http://127.0.0.1:5178/nytt-losenord');
      await page.getByRole('link', { name: 'Begär en ny länk' }).waitFor();
      assert.equal(await page.locator('input[type=password]').count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url'), 'fake'].join('.');
      await context.addInitScript(({ user, token }) => localStorage.setItem('sb-pass-bilagor-test-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'fake', expires_at: 4102444800, token_type: 'bearer' })), { user, token });
      await page.goto('http://127.0.0.1:5178/nytt-losenord');
      const inputs = page.locator('input[type=password]');
      await inputs.nth(0).fill('test-password-only');
      await inputs.nth(1).fill('different-test-password');
      await page.getByRole('button', { name: 'Spara lösenord' }).click();
      await page.getByText('Lösenorden matchar inte.').waitFor();
      assert.equal(saves, 0);
      await inputs.nth(1).fill('test-password-only');
      await page.getByRole('button', { name: 'Spara lösenord' }).click();
      await page.getByRole('link', { name: 'Fortsätt till appen' }).waitFor();
      assert.equal(saves, 1);
      await context.close();
    }
    console.log('Recovery request, rate limit, neutral confirmation, invalid session and mobile width passed. No real email sent.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
