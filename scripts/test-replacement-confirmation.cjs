// Uses a fake backend only. Start Vite with the pass-bilagor-test Supabase URL.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const user = { id: 'user', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', user_metadata: {} };
const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url'), 'fake'].join('.');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      await context.addInitScript(({ user, token }) => {
        localStorage.setItem(`notis_lathund_visad_${user.id}`, 'true');
        localStorage.setItem('sb-pass-bilagor-test-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'fake', expires_at: 4102444800, token_type: 'bearer' }));
      }, { user, token });
      let writes = 0;
      const shift = { id: 'pass', datum: new Date().toLocaleDateString('sv-SE'), tid_från: '08:00:00', tid_till: '16:00:00', vikarie_id: 'old', status: 'bokat', publicerad: false, personal_id: 'person', personal: { id: 'person', namn: 'Lärare' }, förfrågningar: [] };
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname !== 'pass-bilagor-test.supabase.co') return route.abort();
        let data = [];
        if (url.pathname.includes('/auth/v1/')) data = user;
        if (url.pathname.endsWith('/profiler')) data = [{ ...user, roll: 'admin', aktiv: true }];
        if (url.pathname.endsWith('/vikarier')) data = [{ id: 'old', namn: 'Amanda', aktiv: true }, { id: 'new', namn: 'Benyamin', aktiv: true }];
        if (url.pathname.endsWith('/vikariepass')) data = [shift];
        if (url.pathname.endsWith('/personal')) data = [shift.personal];
        if (['POST', 'PATCH', 'DELETE'].includes(request.method()) && url.pathname.startsWith('/rest/')) writes++;
        if (Array.isArray(data) && request.headers().accept?.includes('vnd.pgrst.object')) data = data[0] || null;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:5178/admin/vikariepass?pass=pass');
      const dialog = page.getByRole('dialog').last();
      const button = dialog.getByRole('button', { name: 'Begär vikariebyte', exact: true });
      await button.waitFor();
      assert(await button.isDisabled(), 'Must not request replacement by current substitute');
      await dialog.getByRole('button', { name: /Benyamin/ }).first().click();
      assert(await button.isEnabled());
      const before = writes;
      page.once('dialog', async confirmation => {
        assert(confirmation.message().includes('Benyamin'));
        assert(confirmation.message().includes('Amanda'));
        await confirmation.dismiss();
      });
      await button.click();
      assert.equal(writes, before, 'Cancel must not write any booking or request');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `../replacement-confirmation-${width}.png` });
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}: explicit replacement, same-sub guard, names, cancellation, no overflow`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
