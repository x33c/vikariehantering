// Run against Vite with VITE_SUPABASE_URL=https://pass-bilagor-test.supabase.co.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const output = process.env.TEST_SCREENSHOTS || '../admin-mobile-screenshots';
fs.mkdirSync(output, { recursive: true });
const user = { id: 'user', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', user_metadata: {} };
const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url'), 'fake'].join('.');
const testDay = new Date();
if (testDay.getDay() === 6) testDay.setDate(testDay.getDate() + 2);
if (testDay.getDay() === 0) testDay.setDate(testDay.getDate() + 1);
const date = testDay.toLocaleDateString('sv-SE');
const previous = new Date(`${date}T12:00:00`);
do { previous.setDate(previous.getDate() - 1); } while ([0, 6].includes(previous.getDay()));
const followUpPerson = { id: 'follow-up', namn: 'Fortsatt Frånvaro Testperson', aktiv: true };
const people = Array.from({ length: 18 }, (_, i) => ({ id: `person-${i}`, namn: `Testpersonal ${i} Med Ett Längre Efternamn`, aktiv: true, arbetslag_id: 'team', arbetslag: { id: 'team', namn: 'Åk.1' } }));
const shifts = people.map((person, i) => ({ id: `pass-${i}`, datum: date, tid_från: '08:00:00', tid_till: '16:30:00', grupp: 'Åk.1', status: 'bokat', vikarie_id: 'sub', personal_id: person.id, personal: person, frånvaro: null, förfrågningar: [], publicerad: false }));
async function prepare(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 1024 });
  await context.addInitScript(({ user, token }) => {
    localStorage.setItem(`notis_lathund_visad_${user.id}`, 'true');
    localStorage.setItem('sb-pass-bilagor-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fake', token_type: 'bearer', expires_at: 4102444800, user }));
  }, { user, token });
  await context.route('https://pass-bilagor-test.supabase.co/**', async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    let data = [];
    if (path.includes('/auth/v1/')) data = user;
    if (path.endsWith('/profiler')) data = [{ ...user, namn: 'Testadmin', roll: 'admin', aktiv: true }];
    if (path.endsWith('/personal')) data = [...people, followUpPerson];
    if (path.endsWith('/arbetslag')) data = [{ id: 'team', namn: 'Åk.1', aktiv: true }];
    if (path.endsWith('/vikarier')) data = [{ id: 'sub', profil_id: 'sub-profile', namn: 'Testvikarie Med Långt Namn', aktiv: true }];
    if (path.endsWith('/vikariepass')) data = shifts.filter(p => p.personal_id !== 'person-1');
    if (path.endsWith('/frånvaro')) data = [...people.map(p => ({ id: `absence-${p.id}`, personal_id: p.id, personal: p, datum_från: date, datum_till: date, hel_dag: true, anteckning: p.id === 'person-1' ? 'Ingen vikarie behövs' : null })), { id: 'previous-absence', personal_id: followUpPerson.id, personal: followUpPerson, datum_från: previous.toLocaleDateString('sv-SE'), datum_till: previous.toLocaleDateString('sv-SE'), hel_dag: true }];
    if (Array.isArray(data) && route.request().headers().accept?.includes('vnd.pgrst.object')) data = data[0] || null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return context;
}
async function checkDialog(page, name) {
  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor();
  const body = dialog.locator('.app-dialog-body');
  const timeFieldsFit = await dialog.locator('.admin-time-grid').evaluateAll(grids => grids.every(grid => {
    const bounds = grid.getBoundingClientRect();
    const inputs = [...grid.querySelectorAll('input[type="time"]')].map(input => input.getBoundingClientRect());
    return inputs.every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1) &&
      inputs.every((rect, i) => inputs.slice(i + 1).every(other => rect.right <= other.left || other.right <= rect.left || rect.bottom <= other.top || other.bottom <= rect.top));
  }));
  assert(timeFieldsFit, `${name}: time fields overlap`);
  if (await dialog.locator('.admin-time-grid').count()) {
    await dialog.locator('.admin-time-grid').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${name}-times.png` });
  }
  const last = dialog.getByRole('button').last();
  await last.scrollIntoViewIfNeeded();
  await last.click({ trial: true });
  const rect = await dialog.boundingBox();
  assert(rect.y >= -1 && rect.y + rect.height <= page.viewportSize().height + 1, `${name}: dialog outside viewport`);
  const metrics = await body.evaluate(el => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
  if (metrics.max > 4) {
    await body.evaluate(el => { el.scrollTop = 0; });
    await body.hover();
    await page.mouse.wheel(0, 700);
    await page.waitForFunction(() => [...document.querySelectorAll('.app-dialog-body')].some(el => el.scrollTop > 0));
  }
  await last.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/${name}.png` });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [width, height] of [[320, 568], [390, 844], [768, 600], [1440, 500]]) {
      const context = await prepare(browser, width, height);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const route of ['vikariepass', 'franvaro', 'register/vikarier', 'register/personal', 'register/konton', 'import', 'historik', 'utskick', 'export', 'datastadning', 'notiser', 'beta/start', 'beta/franvaro', 'beta/bemanning', 'beta/utskick']) {
        await page.goto(`http://127.0.0.1:5178/admin/${route}`);
        await page.locator('.admin-content').waitFor();
        await page.waitForFunction(() => document.querySelector('.admin-content')?.innerText.trim().length > 15);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${route} ${width}: page overflow`);
        if (route === 'vikariepass') {
          await page.getByRole('button', { name: /^\+ Pass$/ }).first().click();
          await page.getByRole('button', { name: /Veckopass/ }).click();
          await checkDialog(page, `week-${width}`);
          await page.goto('http://127.0.0.1:5178/admin/vikariepass?pass=pass-0');
          await checkDialog(page, `details-${width}`);
        }
        if (route === 'franvaro') {
          await page.locator('article:visible').filter({ hasText: people[0].namn }).getByText('bemannat', { exact: true }).waitFor();
          await page.locator('article:visible').filter({ hasText: people[1].namn }).getByText('Vikarie behövs ej', { exact: true }).waitFor();
          await page.getByRole('button', { name: '+ Ny frånvaro', exact: true }).click();
          await checkDialog(page, `absence-${width}`);
        }
        if (route === 'utskick') {
          await page.getByRole('button', { name: 'Skicka mail', exact: true }).click();
          const review = page.getByRole('dialog', { name: 'Kontrollera fortsatt frånvaro' });
          await review.getByText(followUpPerson.namn, { exact: true }).waitFor();
          const proceed = review.getByRole('button', { name: 'Fortsätt till mail' });
          assert.equal(await proceed.isDisabled(), true);
          await page.screenshot({ path: `${output}/follow-up-${width}.png` });
          await review.getByRole('checkbox').check();
          assert.equal(await proceed.isEnabled(), true);
          await review.getByRole('checkbox').uncheck();
          assert.equal(await proceed.isDisabled(), true);
          await review.getByRole('button', { name: 'Registrera frånvaro' }).click();
          const registration = page.getByRole('dialog', { name: 'Ny frånvaro' });
          await registration.waitFor();
          assert.equal(await registration.locator('select').first().inputValue(), followUpPerson.id);
          assert.equal(await registration.locator('input[type="date"]').first().inputValue(), date);
          await page.keyboard.press('Escape');
        }
        await page.screenshot({ path: `${output}/${route.replaceAll('/', '-')}-${width}.png` });
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}x${height}: 15 admin routes, week/absence/details scrolling and reachable buttons`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
