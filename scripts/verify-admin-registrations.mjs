import assert from 'node:assert/strict';
export async function verifyAdminRegistrations({db,send,evaluate,until,click,shot}) {
  const insertUser = db.prepare('INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)');
  const insert = db.prepare('INSERT INTO registration_requests(user_id,email,ip_hash,empire,species,token_hash,status,player_mail_status,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  let failedId;
  for (let i=0;i<125;i++) {
    const userId = Number(insertUser.run(`Inbox_${i}`, 'fixture-only', Date.now()).lastInsertRowid);
    const entry=insert.run(userId,`inbox${i}@example.org`,`fixture-${i}`,'Inbox Empire','terran',`token-${i}`,i<12?'pending':'approved',i<12?'pending':i===12?'failed':'sent',Date.now()+100000,Date.now());
    if(i===12) failedId=Number(entry.lastInsertRowid);
  }
  await evaluate(`document.querySelector('[data-view="moderation"]').click()`);
  await until(`document.querySelector('[data-registration-counts]')?.textContent.includes('13 offen')`);
  assert.equal(await evaluate(`document.querySelector('.registration-overview').open`),false,'Compact by default');
  await evaluate(`document.querySelector('.registration-overview>summary').scrollIntoView({block:'center'})`);
  await click('.registration-overview>summary');
  await until(`document.querySelectorAll('.registration-entry').length===10`);
  await evaluate(`document.querySelector('[data-registration-next]').scrollIntoView({block:'center'})`);
  await click('[data-registration-next]');
  await until(`document.querySelectorAll('.registration-entry').length===3`);
  await evaluate(`{const f=document.querySelector('.registration-tools');f.elements.q.value='inbox12@example.org';f.requestSubmit();}`);
  await until(`document.querySelectorAll('.registration-entry').length===1`);
  await evaluate(`document.querySelector('.registration-entry').open=true`);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`document.querySelector('[data-registration-action]').scrollIntoView({block:'center'})`);
  await shot('admin-registration-retry-mobile');
  // Simulate SMTP completion only; list, filter and paging use the real isolated API/database.
  await evaluate(`window.__registrationFetch=window.fetch;window.fetch=(url,options)=>String(url).endsWith('/registrations/${failedId}/confirmation')?new Promise(resolve=>{window.__finishRegistrationMail=()=>resolve(new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}}));}):window.__registrationFetch(url,options);`);
  await click('[data-registration-action]');
  await until(`!!window.__finishRegistrationMail`);
  db.prepare("UPDATE registration_requests SET player_mail_status='sent',player_mail_error='' WHERE id=?").run(failedId);
  await evaluate(`window.__finishRegistrationMail();window.fetch=window.__registrationFetch;`);
  await until(`document.querySelectorAll('.registration-entry').length===0 && document.querySelector('[data-registration-counts]').textContent.includes('12 offen')`);
  assert.match(await evaluate(`document.querySelector('[data-registration-message]').textContent`),/erledigt/);
  await evaluate(`{const f=document.querySelector('.registration-tools');f.elements.filter.value='done';f.requestSubmit();}`);
  await until(`document.querySelectorAll('.registration-entry').length===1`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-registration-action]').length`),0,'Completed mail has no outstanding send action');
  assert.match(await evaluate(`document.querySelector('.registration-entry').textContent`),/Bestätigung versandt/);
  await shot('admin-registration-completed-mobile');
  console.log('Admin registrations passed: 125 records, compact overview, paging, search, delivery completion leaves inbox and remains in archive');
}
