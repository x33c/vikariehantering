const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const user = { id: 'user', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', user_metadata: {} };
const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url'), 'fake'].join('.');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [width, height] of [[320,568], [440,956], [956,440]]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
      await context.addInitScript(({ user, token }) => {
        localStorage.setItem('notis_lathund_visad_user', 'true');
        localStorage.setItem('sb-pass-bilagor-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fake', token_type: 'bearer', expires_at: 4102444800, user }));
      }, { user, token });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname !== 'pass-bilagor-test.supabase.co') return route.abort();
        let data = [];
        if (url.pathname.includes('/auth/v1/')) data = user;
        if (url.pathname.endsWith('/profiler')) data = [{ ...user, namn: 'Test', roll: 'vikarie', aktiv: true }];
        if (url.pathname.endsWith('/vikarier')) data = [{ id: 'sub', profil_id: user.id, namn: 'Test', aktiv: true }];
        if (Array.isArray(data) && route.request().headers().accept?.includes('vnd.pgrst.object')) data = data[0] || null;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:5178/vikarie', { timeout: 60000 });
      const header = page.locator('.vikarie-mobile-header');
      await header.waitFor();
      for (const control of await header.locator('a, button').all()) {
        const box = await control.boundingBox();
        assert(box.width >= 44 && box.height >= 44);
        await control.click({ trial: true });
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await header.getByRole('link').tap();
      await page.waitForURL('**/vikarie/notiser');
      await header.getByRole('button', { name: 'Växla tema' }).tap();
      await page.screenshot({ path: `../vikarie-mobile-${width}.png` });
      await context.close();
      console.log(`PASS ${width}x${height}: touch targets, navigation, theme, overflow`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
