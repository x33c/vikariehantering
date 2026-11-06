const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const user = { id: 'user', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', user_metadata: {} };
const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url'), 'fake'].join('.');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const answer of ['ja', 'nej']) {
      const context = await browser.newContext({ viewport: { width: 440, height: 956 } });
      await context.addInitScript(({ user, token }) => {
        localStorage.setItem('notis_lathund_visad_user', 'true');
        localStorage.setItem('sb-pass-bilagor-test-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'fake', expires_at: 4102444800, token_type: 'bearer' }));
      }, { user, token });
      const shift = { id: 'pass', datum: '2099-12-01', tid_från: '08:00', tid_till: '16:00', status: 'notifierat', vikarie_id: null, publicerad: false, personal_id: 'person', personal: { namn: 'Testpersonal' }, förfrågningar: [{ id: 'request', vikarie_id: 'sub', status: 'vantar' }] };
      let calls = 0;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname !== 'pass-bilagor-test.supabase.co') return route.abort();
        let data = [];
        if (url.pathname.includes('/auth/v1/')) data = user;
        if (url.pathname.endsWith('/profiler')) data = [{ ...user, roll: 'vikarie', aktiv: true }];
        if (url.pathname.endsWith('/vikarier')) data = [{ id: 'sub', profil_id: user.id, namn: 'Testvikarie', aktiv: true }];
        if (url.pathname.endsWith('/vikariepass')) data = url.searchParams.get('vikarie_id') === 'eq.sub' && !shift.vikarie_id ? [] : [shift];
        if (url.pathname.includes('/rpc/')) {
          assert(url.pathname.endsWith(answer === 'ja' ? '/accept_shift_request' : '/decline_shift_request'));
          calls++;
          assert.equal(shift.tid_från, '11:30');
          shift.förfrågningar[0].status = answer;
          if (answer === 'ja') { shift.vikarie_id = 'sub'; shift.status = 'bokat'; }
          data = answer === 'ja' ? shift : null;
        }
        if (Array.isArray(data) && route.request().headers().accept?.includes('vnd.pgrst.object')) data = data[0] || null;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:5178/vikarie', { timeout: 60000 });
      await page.getByRole('button', { name: 'Tacka ja', exact: true }).waitFor();
      shift.tid_från = '11:30';
      async function respond() {
        await page.getByRole('button', { name: answer === 'ja' ? 'Tacka ja' : 'Tacka nej', exact: true }).click();
        if (answer === 'nej') await page.getByRole('button', { name: 'Ja, tacka nej', exact: true }).click();
      }
      await respond();
      await page.getByText(/Passets tider har ändrats/).waitFor();
      assert.equal(calls, 0);
      await respond();
      await page.getByText(answer === 'ja' ? /Du tackade ja:/ : /Du tackade nej:/).waitFor();
      assert.equal(calls, 1);
      await context.close();
      console.log(`PASS mobile ${answer}: changed times reviewed, response persisted`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
