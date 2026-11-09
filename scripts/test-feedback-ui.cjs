const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const user = { id: 'user', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', user_metadata: {} };
const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url'), 'fake'].join('.');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [390, 1280]) {
      const tickets = [], messages = [];
      let failSubmit = true;
      for (const role of ['vikarie', 'admin', 'vikarie']) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        await context.addInitScript(({ user, token }) => {
          localStorage.setItem('notis_lathund_visad_user', 'true');
          localStorage.setItem('sb-pass-bilagor-test-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'fake', expires_at: 4102444800, token_type: 'bearer' }));
        }, { user, token });
        await context.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.hostname === '127.0.0.1') return route.continue();
          if (url.hostname !== 'pass-bilagor-test.supabase.co') return route.abort();
          let data = [];
          if (url.pathname.includes('/auth/v1/')) data = user;
          if (url.pathname.endsWith('/profiler')) data = [{ ...user, roll: role, aktiv: true }];
          if (url.pathname.endsWith('/vikarier')) data = [{ id: 'sub', profil_id: user.id, namn: 'Testvikarie', aktiv: true }];
          if (url.pathname.endsWith('/feedback')) data = tickets.filter(t => !url.searchParams.get('status') || `eq.${t.status}` === url.searchParams.get('status'));
          if (url.pathname.endsWith('/feedback_messages')) data = [...messages].reverse();
          if (url.pathname.endsWith('/rpc/submit_feedback')) {
            const p = route.request().postDataJSON();
            assert.equal(p.p_browser, null); assert.equal(p.p_version, null);
            if (!tickets.length) tickets.push({ id: p.p_id, owner_id: user.id, author_name: 'Testvikarie', category: p.p_category, title: p.p_title, description: p.p_description, page: p.p_page, status: 'nytt', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
            if (failSubmit) { failSubmit = false; return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Simulated lost response after commit' }) }); }
            assert.equal(tickets[0].id, p.p_id, 'Retry uses the same id');
            data = p.p_id;
          }
          if (url.pathname.endsWith('/rpc/reply_feedback')) {
            const p = route.request().postDataJSON();
            messages.push({ id: p.p_message_id, feedback_id: p.p_id, body: p.p_body, author_role: role, created_at: new Date().toISOString() });
            if (p.p_status) tickets[0].status = p.p_status;
            data = null;
          }
          if (Array.isArray(data) && route.request().headers().accept?.includes('vnd.pgrst.object')) data = data[0] || null;
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(`http://127.0.0.1:5178/${role}/feedback`, { timeout: 60000 });
        if (!tickets.length) {
          await page.getByRole('button', { name: 'Rapportera problem / lämna förslag' }).click();
          await page.getByLabel('Rubrik', { exact: true }).fill('Knappen svarar inte');
          await page.getByLabel('Beskriv problemet eller förslaget').fill('Knappen svarar inte när jag trycker på den.');
          await page.getByRole('button', { name: 'Skicka feedback', exact: true }).click();
          await page.getByRole('alert').waitFor();
          assert.equal(await page.getByLabel('Rubrik', { exact: true }).inputValue(), 'Knappen svarar inte');
          await page.getByRole('button', { name: 'Skicka feedback', exact: true }).click();
          await page.getByText('Tack! Ditt ärende är inskickat.').waitFor();
        }
        await page.getByRole('button', { name: /Knappen svarar inte/ }).click();
        if (role === 'admin') {
          await page.getByLabel('Status', { exact: true }).selectOption('arbete');
          await page.getByLabel('Ditt svar').fill('Tack, vi undersöker detta.');
          await page.getByRole('button', { name: 'Spara svar / status', exact: true }).click();
          await page.getByText('Tack, vi undersöker detta.', { exact: true }).waitFor();
        } else if (messages.length) {
          await page.getByText('Tack, vi undersöker detta.', { exact: true }).waitFor();
          assert.equal(await page.getByLabel('Status', { exact: true }).count(), 0);
          await page.getByLabel('Ditt svar').fill('Det fungerar nu, tack!');
          await page.getByRole('button', { name: 'Spara svar', exact: true }).click();
          await page.getByText('Det fungerar nu, tack!', { exact: true }).waitFor();
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `../feedback-${role}-${width}.png`, fullPage: true });
        await context.close();
      }
      assert.equal(tickets.length, 1); assert.equal(messages.length, 2);
      console.log(`PASS ${width}: submit/retry, private metadata default, admin reply/status, substitute follow-up, layout`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
