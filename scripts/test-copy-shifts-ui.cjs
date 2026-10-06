const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const addDays = (date, days) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [320, 390, 1280]) for (const retain of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const user = { id: 'user', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', user_metadata: {} };
      const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url'), 'fake'].join('.');
      await context.addInitScript(({ user, token }) => {
        localStorage.setItem(`notis_lathund_visad_${user.id}`, 'true');
        localStorage.setItem('sb-pass-bilagor-test-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'fake', expires_at: 4102444800, token_type: 'bearer' }));
      }, { user, token });
      const today = new Date().toLocaleDateString('sv-SE');
      const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
      const start = addDays(today, weekday > 5 ? 8 - weekday : 1 - weekday);
      const person = { id: 'teacher', namn: 'Testpersonal Med Långt Efternamn', aktiv: true, arbetslag: { namn: 'Åk.1' } };
      const sub = { id: 'sub', namn: 'Testvikarie', aktiv: true };
      const originals = [0, 1].map((day, i) => ({ id: `source-${i}`, datum: addDays(start, day), tid_från: i ? '09:00:00' : '08:00:00', tid_till: '16:30:00', personal_id: person.id, personal: person, vikarie_id: sub.id, status: 'bokat', grupp: 'Åk.1', typ: 'del_av_dag', frånvaro_id: 'absence', schemarad_id: 'schedule', anteckning: 'Do not copy', publicerad: true, förfrågningar: [] }));
      const writes = [];
      let conflict = false, queryFail = false, insertFail = false;
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname !== 'pass-bilagor-test.supabase.co') return route.abort();
        let data = [], status = 200;
        if (url.pathname.includes('/auth/v1/')) data = user;
        if (url.pathname.endsWith('/profiler')) data = [{ ...user, roll: 'admin', aktiv: true }];
        if (url.pathname.endsWith('/personal')) data = [person];
        if (url.pathname.endsWith('/vikarier')) data = [sub];
        if (url.pathname.endsWith('/vikariepass') && req.method() === 'GET') {
          const isCheck = url.searchParams.get('select')?.startsWith('id,datum,');
          data = isCheck ? (conflict ? [{ ...originals[0], datum: addDays(start, 7) }] : []) : originals;
          if (isCheck && queryFail) { status = 500; data = { message: 'test query error' }; }
        }
        if (req.method() === 'POST' && url.pathname.startsWith('/rest/')) {
          const body = req.postDataJSON();
          writes.push({ path: url.pathname, body });
          if (url.pathname.endsWith('/vikariepass') && insertFail) { status = 400; data = { message: 'test insert error' }; }
          else data = body;
        }
        if (Array.isArray(data) && req.headers().accept?.includes('vnd.pgrst.object')) data = data[0] || null;
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:5178/admin/vikariepass');
      for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Markera pass', exact: true }).first().click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No toolbar overflow');
      await page.screenshot({ path: `../copy-toolbar-${width}.png` });
      await page.getByRole('button', { name: 'Kopiera till fler veckor', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Kopiera till fler veckor' });
      await dialog.getByRole('checkbox').nth(1).check();
      if (retain) await dialog.getByLabel('Boka samma vikarier direkt').check();
      queryFail = true;
      await dialog.getByRole('button', { name: 'Förhandsgranska', exact: true }).click();
      await dialog.getByText('Kunde inte kontrollera befintliga pass. Försök igen.').waitFor();
      assert.equal(writes.length, 0);
      queryFail = false;
      await dialog.getByRole('button', { name: 'Förhandsgranska', exact: true }).click();
      await dialog.getByRole('button', { name: 'Skapa 4 pass', exact: true }).waitFor();
      const preview = dialog.getByRole('region', { name: 'Förhandsgranskning' });
      assert.equal(await preview.locator('li').count(), 4);
      assert.equal(await preview.getByText(retain ? 'Bokas: Testvikarie' : 'Obokat', { exact: true }).count(), 4);
      assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), 'No modal horizontal overflow');
      const save = dialog.getByRole('button', { name: 'Skapa 4 pass', exact: true });
      await save.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `../copy-shifts-${width}-${retain}.png` });
      conflict = true;
      await save.click();
      await dialog.getByText(/personalen har redan ett överlappande pass/).waitFor();
      assert.equal(writes.length, 0, 'Fresh conflict check before save');
      conflict = false;
      await dialog.getByRole('button', { name: 'Förhandsgranska', exact: true }).click();
      insertFail = true;
      await save.click();
      await dialog.getByText(/Kopieringen kunde inte bekräftas/).waitFor();
      assert.equal(writes.length, 1);
      const firstIds = writes[0].body.map(p => p.id);
      insertFail = false;
      await save.click();
      await dialog.waitFor({ state: 'hidden' });
      await page.getByText(/4 pass kopierade/).waitFor();
      assert.equal(writes.length, 3, 'Two insert attempts, one history batch, no notifications');
      assert.deepEqual(writes[1].body.map(p => p.id), firstIds, 'Stable retry IDs');
      const rows = writes[1].body;
      assert.equal(rows.length, 4);
      rows.forEach((p, i) => {
        assert.equal(p.tid_från, originals[i % 2].tid_från);
        assert.equal(p.status, retain ? 'bokat' : 'obokat');
        assert.equal(p.vikarie_id, retain ? 'sub' : null);
        assert.equal(p.publicerad, false);
        for (const field of ['frånvaro_id', 'schemarad_id', 'riktad_till_vikarie_id', 'anteckning']) assert.equal(p[field], null);
      });
      assert(writes[2].path.endsWith('/passhistorik'));
      assert.deepEqual(errors, []);
      console.log(`PASS ${width} retain=${retain}: selection, preview, failure handling, fresh conflicts, atomic batch and safe retry`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
