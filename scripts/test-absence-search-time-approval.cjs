const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ channel: 'msedge', headless: true });
 try {
  for (const width of [390, 1280]) {
   const context = await browser.newContext({ viewport: { width, height: 900 } });
   const user = { id:'user', aud:'authenticated', role:'authenticated', email:'test@example.test', user_metadata:{} };
   const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({sub:'user',exp:4102444800})).toString('base64url'),'fake'].join('.');
   await context.addInitScript(({user,token}) => {
    localStorage.setItem('notis_lathund_visad_user','true');
    localStorage.setItem('sb-pass-bilagor-test-auth-token',JSON.stringify({user,access_token:token,refresh_token:'fake',expires_at:4102444800,token_type:'bearer'}));
   },{user,token});
   const day = new Date();
   while ([0,6].includes(day.getDay())) day.setDate(day.getDate()+1);
   const people = [{id:'p1',namn:'Anna Andersson',aktiv:true,arbetslag:{namn:'Åk.1'}},{id:'p2',namn:'Bertil Bengtsson',aktiv:true,arbetslag:{namn:'FSK'}}];
   const shift = {id:'shift',datum:day.toLocaleDateString('sv-SE'),tid_från:'09:00:00',tid_till:'17:30:00',personal_id:'p1',personal:people[0],vikarie_id:'sub',status:'bokat',publicerad:false,grupp:'Åk.1',förfrågningar:[]};
   const proposal = {id:'proposal',pass_id:'shift',vikarie_id:'sub',foreslagen_tid_fran:'09:45:00',foreslagen_tid_till:'17:30:00',status:'vantar',anledning:'Testförslag',created_at:new Date().toISOString(),vikarie:{id:'sub',namn:'Testvikarie'}};
   let failUpdate = true;
   await context.route('**/*',async route => {
    const url = new URL(route.request().url());
    if(url.hostname==='127.0.0.1') return route.continue();
    if(url.hostname!=='pass-bilagor-test.supabase.co') return route.abort();
    const path = decodeURIComponent(url.pathname);
    let data=[];
    if(path.includes('/auth/v1/')) data=user;
    if(path.endsWith('/profiler')) data=[{...user,roll:'admin',aktiv:true}];
    if(path.endsWith('/personal')) data=people;
    if(path.endsWith('/vikarier')) data=[{id:'sub',namn:'Testvikarie',aktiv:true}];
    if(path.endsWith('/vikariepass')) {
     if(route.request().method()==='PATCH') {
      if(failUpdate) { failUpdate=false; return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Test: uppdateringen misslyckades'})}); }
      Object.assign(shift,route.request().postDataJSON());
     }
     data=[shift];
    }
    if(path.endsWith('/pass_tidsandringar')) {
     if(route.request().method()==='PATCH') Object.assign(proposal,route.request().postDataJSON());
     data=url.searchParams.get('status')==='eq.vantar' && proposal.status!=='vantar' ? [] : [proposal];
    }
    if(path.endsWith('/notiser')) data=[{id:'notice',pass_id:'shift',ämne:'Nytt meddelande',innehåll:'Tidsförslag',created_at:new Date().toISOString(),pass:shift}];
    if(Array.isArray(data)&&route.request().headers().accept?.includes('vnd.pgrst.object')) data=data[0]||null;
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   });
   const page=await context.newPage();
   page.setDefaultTimeout(30000);
   page.setDefaultNavigationTimeout(60000);
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:5178/admin/franvaro');
   await page.getByRole('button',{name:'+ Ny frånvaro',exact:true}).click();
   let dialog=page.getByRole('dialog');
   await dialog.getByLabel('Sök personal').fill('FSK');
   await dialog.getByRole('button',{name:/Bertil Bengtsson/}).click();
   assert.equal(await dialog.getByLabel('Vem är frånvarande?',{exact:true}).inputValue(),'p2');
   await dialog.getByLabel('Sök personal').fill('ingen sådan person');
   await dialog.getByText('Ingen personal matchar sökningen.').waitFor();
   assert.equal(await dialog.getByLabel('Vem är frånvarande?',{exact:true}).inputValue(),'p2');
   await dialog.getByLabel('Sök personal').fill('anna');
   await page.screenshot({path:`../absence-search-${width}.png`});
   await dialog.getByRole('button',{name:/Anna Andersson/}).click();
   assert.equal(await dialog.getByLabel('Vem är frånvarande?',{exact:true}).inputValue(),'p1');
   await page.keyboard.press('Escape');
   await page.goto('http://127.0.0.1:5178/admin/vikariepass');
   await page.getByText('09:00–17:30',{exact:true}).filter({visible:true}).first().waitFor();
   await page.getByRole('button',{name:'Adminnotiser',exact:true}).filter({visible:true}).first().click();
   await page.getByRole('button',{name:'Godkänn',exact:true}).click();
   await page.getByText('Test: uppdateringen misslyckades',{exact:true}).waitFor();
   assert.equal(proposal.status,'vantar');
   assert.equal(shift.tid_från,'09:00:00');
   await page.getByRole('button',{name:'Godkänn',exact:true}).click();
   await page.getByText('Tiderna är uppdaterade.',{exact:true}).waitFor();
   assert.equal(proposal.status,'godkand');
   assert.equal(shift.tid_från,'09:45');
   if (width < 640) await page.getByRole('button',{name:'Stäng notiser',exact:true}).first().click({position:{x:2,y:2}});
   else await page.getByRole('button',{name:'Adminnotiser',exact:true}).filter({visible:true}).first().click();
   await page.getByText('09:45–17:30',{exact:true}).filter({visible:true}).first().waitFor();
   await page.screenshot({path:`../time-approval-${width}.png`});
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}: searchable staff selection; failed approval remains pending; successful approval immediately refreshes staffing`);
   await context.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
