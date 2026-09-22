// Real browser/API flow. All accelerated jobs belong to an isolated test database.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { tutorialSteps } from '../public/js/tutorial.mjs';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const base = 'http://localhost:3137', debug = 9357;
const databasePath = fileURLToPath(new URL(`../tmp/tutorial-${process.pid}.db`, import.meta.url));
const folder = new URL('../tmp/tutorial-review/', import.meta.url);
await mkdir(folder, { recursive:true });
const server = spawn(process.execPath, ['server.js'], { cwd, env:{...process.env, PORT:'3137',DATABASE_PATH:databasePath,SMTP_HOST:'',COOKIE_SECURE:'0'}, stdio:['ignore','pipe','pipe'],windowsHide:true });
let ready = false, logs = '';
server.stdout.on('data', data => { if(String(data).includes(base)) ready = true; });
server.stderr.on('data', data => { logs += String(data); });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--no-first-run','--no-default-browser-check','--enable-unsafe-swiftshader','--disable-background-timer-throttling',`--user-data-dir=${cwd}/tmp/tutorial-chrome-${process.pid}`,`--remote-debugging-port=${debug}`,'about:blank'], {stdio:'ignore',windowsHide:true});
const pause = ms => new Promise(r=>setTimeout(r,ms));
let ws, db;
try {
  for(let i=0;i<100&&!ready;i++) await pause(100);
  assert.ok(ready, logs);
  let page;
  for(let i=0;i<60;i++) { try {page=await fetch(`http://127.0.0.1:${debug}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());break;}catch{await pause(200);} }
  assert.ok(page,'Chrome ready');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r));
  const pending=new Map(),errors=[];let counter=0;
  ws.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);if(pending.has(data.id)){const p=pending.get(data.id);pending.delete(data.id);data.error?p.reject(Error(data.error.message)):p.resolve(data.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++counter;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},20000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  async function until(expression,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){const value=await evaluate(expression);if(value)return value;await pause(150);}throw Error('Timeout: '+expression+'\n'+await evaluate(`document.querySelector('.tutorial-card')?.innerText`)+'\n'+errors.join('\n'));}
  async function click(selector){const pos=await until(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;const r=e.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...pos,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...pos,button:'left',clickCount:1});}
  async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});await writeFile(new URL(name+'.png',folder),Buffer.from(r.data,'base64'));}
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'Admin',password:'Wurm4444'})});
  const token=/sn_session=([^;]+)/.exec(login.headers.get('set-cookie')||'')?.[1];assert.ok(token);
  const headers={cookie:`sn_session=${token}`};
  const snapshot=()=>fetch(base+'/api/state',{headers}).then(r=>r.json());
  let snap=await snapshot();const key=`sn-guided-tutorial-v2:${snap.empire.id}`;
  db=new DatabaseSync(databasePath);db.exec('PRAGMA busy_timeout=3000');
  await send('Network.enable');await send('Page.enable');await send('Runtime.enable');
  await send('Network.setCookie',{name:'sn_session',value:token,url:base});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base});
  await until(`document.querySelector('.tutorial-card')?.textContent.includes('Tutorial spielen')`);
  await shot('invitation');
  await click('.tutorial-card .ghost');await until(`!document.querySelector('.guided-tutorial')`);
  await send('Page.reload');await until(`document.querySelector('[data-guide]')`);await pause(800);
  assert.equal(await evaluate(`!!document.querySelector('.guided-tutorial')`),false,'Skip persisted');
  await click('[data-guide]');await until(`document.querySelector('.tutorial-card')?.textContent.includes('Gebäude öffnen')`);
  await click('.tutorial-card .primary');
  await until(`document.querySelector('button[data-build="matter_mine"]') && document.querySelector('.tutorial-ring')?.hidden===false`);
  await pause(500);await shot('desktop-first-build');
  const isolated=await evaluate(`(()=>{const e=document.querySelector('[data-build="energy_array"]');e.click();return true;})()`);
  assert.ok(isolated);assert.equal(db.prepare('SELECT COUNT(*) n FROM queue').get().n,0,'Other actions blocked');
  await click('.tutorial-card .ghost');await until(`!document.querySelector('.guided-tutorial')`);
  await send('Page.reload');await until(`document.querySelector('[data-guide]')`);await pause(500);
  assert.equal(await evaluate(`!!document.querySelector('.guided-tutorial')`),false,'Pause persisted');
  await click('[data-guide]');await click('.tutorial-card .primary');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(500);
  await shot('mobile-first-build');
  const geometry=await evaluate(`(()=>{const a=document.querySelector('.tutorial-card').getBoundingClientRect(),b=document.querySelector('[data-build="matter_mine"]').getBoundingClientRect();return {contained:a.x>=0&&a.right<=innerWidth&&a.y>=0&&a.bottom<=innerHeight,targetVisible:b.top>=0&&b.bottom<=innerHeight&&!document.querySelector('.tutorial-ring').hidden,overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top};})()`);
  assert.ok(geometry.contained,'Mobile card contained');assert.equal(geometry.overlap,false,'Mobile action uncovered');
  assert.ok(geometry.targetVisible,'Mobile action visible');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  for(let attempts=0;attempts<32;attempts++) {
    await pause(400);
    const saved=await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
    const step=tutorialSteps[saved.index];
    if(!step.kind)break;
    const label=await evaluate(`document.querySelector('.tutorial-card .primary')?.textContent`);
    if(label) {await click('.tutorial-card .primary');await pause(500);}
    const attr={building:'build',research:'tech',ship:'ship'}[step.kind];
    await click(`button[data-${attr}="${step.item}"]`);
    for(let i=0;i<80&&!db.prepare('SELECT id FROM queue LIMIT 1').get();i++)await pause(100);
    assert.ok(db.prepare('SELECT id FROM queue LIMIT 1').get(),'Queued '+step.id);
    if(step.id===tutorialSteps[0].id){await pause(500);assert.equal((await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`)).index,0,'Wait for actual completion');await shot('build-countdown');}
    db.prepare('UPDATE queue SET completes_at=?').run(Date.now()-100);
    await evaluate(`window.__tutorialRealNow=Date.now;Date.now=()=>window.__tutorialRealNow()+600000;`);
    for(let i=0;i<150&&db.prepare('SELECT id FROM queue LIMIT 1').get();i++)await pause(100);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM queue').get().n,0,'Finished '+step.id);
    await until(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).index>${saved.index}`,10000);
    await evaluate(`Date.now=window.__tutorialRealNow;`);
    console.log('Completed',step.id);
  }
  await until(`document.querySelector('.tutorial-card')?.textContent.includes('Sternenkarte öffnen')`);
  await click('.tutorial-card .primary');await pause(1000);await click('.tutorial-card .primary');
  await until(`document.querySelector('.tutorial-card') && !document.querySelector('.tutorial-card .primary')`);
  const saved=await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
  assert.ok(saved.targetId);
  await click(`[data-target="${saved.targetId}"][data-mission-kind="spy"]`);
  await until(`document.querySelector('.tutorial-card .primary')?.textContent==='Flug geprüft'`);
  await shot('mission-preview');await click('.tutorial-card .primary');await pause(400);await click('#m-go');
  await until(`document.querySelector('.tutorial-card')?.textContent.includes('Spionageberichte öffnen')`);
  assert.ok(db.prepare("SELECT id FROM fleets WHERE mission='spy'").get(),'Real spy mission');
  db.prepare("UPDATE fleets SET arrives_at=? WHERE mission='spy'").run(Date.now()-100);
  await snapshot();await click('.tutorial-card .primary');
  await until(`document.querySelector('details.report.spy[data-tutorial-target="${saved.targetId}"]')`);
  await pause(500);await click(`details.report.spy[data-tutorial-target="${saved.targetId}"] > summary`);
  await until(`document.querySelector('.tutorial-card .primary')?.textContent==='Bericht verstanden'`);
  await shot('spy-report');await click('.tutorial-card .primary');await pause(400);await click('.tutorial-card .primary');
  await until(`!document.querySelector('.guided-tutorial')`);
  assert.equal((await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`)).status,'done');
  if (process.argv.includes('--notifications')) {
    const { verifyNotifications } = await import('./verify-notifications.mjs');
    await verifyNotifications({db,snap,send,evaluate,until,click,shot});
  }
  if (process.argv.includes('--repairs')) {
    const { verifyRepairs } = await import('./verify-repairs.mjs');
    try { await verifyRepairs({db,snap,send,evaluate,until,click,shot,snapshot}); }
    catch (error) { await shot('repair-failure'); throw error; }
  }
  if (process.argv.includes('--colonization')) {
    const { verifyColonization } = await import('./verify-colonization.mjs');
    try { await verifyColonization({db,snap,send,evaluate,until,click,shot}); }
    catch (error) { await shot('colonization-failure'); throw error; }
  }
  if (process.argv.includes('--protection')) {
    const { verifyProtection } = await import('./verify-protection.mjs');
    try { await verifyProtection({db,snap,send,evaluate,until,click,shot}); }
    catch (error) { await shot('protection-failure'); throw error; }
  }
  assert.deepEqual(errors,[],'No browser exceptions');
  if (process.argv.includes('--alliance-selection')) {
    const { verifyAllianceSelection } = await import('./verify-alliance-selection.mjs');
    try { await verifyAllianceSelection({db,snap,send,evaluate,until,click,shot}); }
    catch (error) { await shot('alliance-selection-failure'); throw error; }
  }
  assert.deepEqual(errors,[],'No browser exceptions after alliance selection');
  if (process.argv.includes('--community')) {
    const {verifyCommunity}=await import('./verify-community.mjs');
    try {await verifyCommunity({db,snap,send,evaluate,until,click,shot});}
    catch(error){await shot('community-failure');throw error;}
  }
  assert.deepEqual(errors,[],'No browser exceptions after community');
  if(process.argv.includes('--raid-input')) {
    const {verifyRaidInput}=await import('./verify-raid-input.mjs');
    try{await verifyRaidInput({db,snap,send,evaluate,until,click,shot});}
    catch(error){await shot('raid-input-failure');throw error;}
  }
  assert.deepEqual(errors,[],'No browser exceptions after raid/input');
  if (process.argv.includes('--admin-ships')) {
    const { verifyAdminShips } = await import('./verify-admin-ships.mjs');
    try { await verifyAdminShips({db,send,evaluate,until,click,shot}); }
    catch (error) { await shot('admin-ships-failure'); throw error; }
  }
  assert.deepEqual(errors,[],'No browser exceptions after admin ship grant');
  await writeFile(new URL('verification.json',folder),JSON.stringify({passed:true,checks:['opt-in and skip','pause and resume','mobile spotlight geometry','blocked unrelated clicks','real building and research jobs','additional probe construction','real scout launch','matching spy report','completion'],errors},null,2));
  console.log('Tutorial browser flow passed');
} catch(err) {console.error(err);process.exitCode=1;}
finally {db?.close();ws?.close();const stop=child=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(r=>{const timer=setTimeout(r,5000);child.once('exit',()=>{clearTimeout(timer);r();});child.kill();});await Promise.all([stop(chrome),stop(server)]);for(const suffix of ['','-wal','-shm'])await rm(databasePath+suffix,{force:true});}
