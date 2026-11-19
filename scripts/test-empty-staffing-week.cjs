// Run with the fake Supabase Vite environment used by test-admin-mobile.cjs.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [320, 390, 440, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const user = { id: 'user', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', user_metadata: {} };
      const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url'), 'fake'].join('.');
      await context.addInitScript(({ user, token }) => {
        localStorage.setItem(`notis_lathund_visad_${user.id}`, 'true');
        localStorage.setItem('sb-pass-bilagor-test-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'fake', expires_at: 4102444800, token_type: 'bearer' }));
      }, { user, token });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname !== 'pass-bilagor-test.supabase.co') return route.abort();
        let data = [];
        if (url.pathname.includes('/auth/v1/')) data = user;
        if (url.pathname.endsWith('/profiler')) data = [{ ...user, roll: 'admin', aktiv: true }];
        if (Array.isArray(data) && route.request().headers().accept?.includes('vnd.pgrst.object')) data = data[0] || null;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:5178/admin/vikariepass');
      const addButtons = page.getByRole('button', { name: '+ Pass', exact: true });
      await addButtons.first().waitFor();
      assert.equal(await addButtons.count(), width < 768 ? 1 : 5);
      await page.getByRole('button', { name: /Nästa/ }).click();
      assert.equal(await addButtons.count(), width < 768 ? 1 : 5);
      const dates = [];
      for (let day = 0; day < 5; day++) {
        if (width < 768) {
          await page.getByRole('group', { name: 'Välj dag' }).getByRole('button').nth(day).click();
          await page.waitForFunction(index => document.querySelectorAll('[aria-label="Välj dag"] button')[index]?.getAttribute('aria-pressed') === 'true', day);
        }
        await addButtons.nth(width < 768 ? 0 : day).click();
        const dialog = page.getByRole('dialog').last();
        await dialog.waitFor();
        await page.waitForFunction(expected => {
          const input = document.querySelector('[role="dialog"] input[type="date"]');
          return input && new Date(`${input.value}T12:00:00`).getDay() === expected;
        }, day + 1);
        dates.push(await dialog.locator('input[type=date]').first().inputValue());
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
      }
      assert.equal(new Set(dates).size, 5, JSON.stringify(dates));
      dates.forEach((date, i) => assert.equal(new Date(`${date}T12:00:00`).getDay(), i + 1));
      assert.equal(await page.getByText('Inga vikariepass matchar filtret.', { exact: true }).count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `../empty-week-${width}.png`, fullPage: true });
      await page.goto('http://127.0.0.1:5178/admin/franvaro');
      const newAbsence = page.getByRole('button', { name: '+ Ny frånvaro', exact: true });
      await newAbsence.waitFor();
      if (width < 768) {
        const picker = page.getByRole('group', { name: 'Välj dag' });
        await picker.getByRole('button').nth(2).click();
        await newAbsence.click();
        const dialog = page.getByRole('dialog').last();
        await dialog.waitFor();
        const date = await dialog.locator('input[type=date]').first().inputValue();
        assert.equal(new Date(`${date}T12:00:00`).getDay(), 3);
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await page.getByRole('button', { name: /Registrera frånvaro/ }).count(), 1);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `../absence-day-${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}: empty week, five days, navigation and correctly prefilled creation dates`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
