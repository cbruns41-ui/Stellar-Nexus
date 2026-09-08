import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { writeFile } from 'node:fs/promises';

export async function verifyNavigation({base,databasePath,send,evaluate,until,pause}) {
  const db=new DatabaseSync(databasePath);
  let home,colony;
  try {
    db.exec("PRAGMA busy_timeout=5000");
    const planet=db.prepare("SELECT p.* FROM planets p JOIN empires e ON e.id=p.empire_id JOIN users u ON u.id=e.user_id WHERE u.username='Admin' ORDER BY p.id LIMIT 1").get();home=planet;
    colony=db.prepare('SELECT * FROM planets WHERE empire_id IS NULL AND system_id=? LIMIT 1').get(home.system_id);
    db.prepare("UPDATE planets SET empire_id=?,name='Kael Testkolonie',metal=10000,energy=10000,helium=10000,crystal=10000 WHERE id=?").run(home.empire_id,colony.id);
    db.prepare("INSERT INTO buildings VALUES(?,'shipyard',2) ON CONFLICT(planet_id,building_id) DO UPDATE SET level=2").run(colony.id);
    db.prepare("INSERT INTO ships VALUES(?,'fighter',3) ON CONFLICT(planet_id,ship_id) DO UPDATE SET count=3").run(colony.id);
    for(const id of ['archive','quantum_lab']) db.prepare("INSERT INTO buildings VALUES(?,?,1) ON CONFLICT(planet_id,building_id) DO UPDATE SET level=1").run(planet.id,id);
  } finally {db.close();}
  await send('Page.reload');await until(`document.querySelector('.living-colony.is-unity')`);
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await evaluate(`(()=>{const e=document.querySelector('#planet-select'),r=e.getBoundingClientRect();return r.width>100 && r.height>=38 && e===document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)})()`),'Planet switcher visible and hittable on phone');
  const tap=async selector=>{
    const p=await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:r.x+r.width/2,y:r.y+r.height/2,hit:b.contains(hit),actual:hit?.outerHTML.slice(0,200),nav:document.querySelector('#game').className};})()`);
    assert.ok(p.hit,'First tap reaches '+selector+' '+JSON.stringify(p));await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:p.x,y:p.y});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:p.x,y:p.y});
  };
  await evaluate(`window.__worldCanvas=document.querySelector('#colony-unity-canvas');window.__worldRoot=document.querySelector('.living-colony')`);
  assert.equal(await evaluate(`document.querySelectorAll('#tabbar button').length`),3);
  for(const panel of ['infra','yard','research','activity','alliance','reports']){
    console.log('Checking command panel:',panel);
    await tap('#tabbar [data-open-nav]');await tap('#nav [data-view="'+panel+'"]');
    await until(`document.querySelector('#command-panel')?.dataset.panel===${JSON.stringify(panel)}`);
    assert.ok(await evaluate(`window.__worldRoot===document.querySelector('.living-colony')`),'Opening a command panel preserves the city');
    if(panel==='infra'){await evaluate(`window.__buildButton=document.querySelector('#command-panel [data-build]')`);await pause(1800);assert.ok(await evaluate(`window.__buildButton===document.querySelector('#command-panel [data-build]')`),'Timer keeps button identity');}
    await tap('[data-panel-close]');assert.ok(await evaluate(`!document.querySelector('#command-panel')&&!document.querySelector('#colony-unity-layer').hidden`));
  }
  await tap('#tabbar [data-open-nav]');await tap('#nav [data-view="yard"]');
  console.log('Checking planet switch with open yard');
  await evaluate(`{document.querySelector('[data-qty="fighter"]').value='7';const s=document.querySelector('#planet-select');s.value='${colony.id}';s.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await until(`document.querySelector('#command-panel')?.dataset.planetId==='${colony.id}' && !document.querySelector('#game').classList.contains('focus-pending')`);
  assert.equal(await evaluate(`document.querySelector('#planet-select').value`),String(colony.id));
  assert.match(await evaluate(`document.querySelector('#command-panel').innerText`),/Kael Testkolonie/);
  assert.equal(await evaluate(`document.querySelector('[data-qty="fighter"]').value`),'1','Quantity never leaks between planets');
  assert.ok(await evaluate(`window.__worldCanvas===document.querySelector('#colony-unity-canvas')`),'Planet switch keeps the actual Unity canvas');
  await tap('#tabbar [data-view="command"]');assert.ok(await evaluate(`!document.querySelector('#command-panel')&&!document.querySelector('#colony-unity-layer').hidden`));
  await evaluate(`{const s=document.querySelector('#planet-select');s.value='${home.id}';s.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await until(`document.querySelector('#planet-select').value==='${home.id}' && !document.querySelector('#game').classList.contains('focus-pending')`);
  await evaluate(`window.stellarNexusColony.onSelect('quantum_lab')`);
  console.log('Checking laboratory city action');
  await until(`document.querySelector('[data-colony-work="research"]')`);
  await evaluate(`document.querySelector('[data-colony-work="research"]').click()`);
  await until(`document.querySelector('#command-panel[data-panel="research"] [data-tech]')`);
  assert.equal(await evaluate(`document.querySelector('#game').dataset.view`),"command");
  for(let n=0;n<3;n++) {
    await evaluate(`document.querySelector('[data-view="defense"]').click()`);
    await until(`document.querySelector('#command-panel').dataset.panel==='defense'`);
    await pause(300);
    await tap('#tabbar [data-view="command"]');
    await until(`document.querySelector('.living-colony.is-unity') && !document.querySelector('#colony-unity-layer').hidden && document.querySelectorAll('.colony-marker:not([hidden])').length>=5`);
    const size=await evaluate(`(()=>{const c=document.querySelector('#colony-unity-canvas');return {width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight};})()`);
    assert.ok(size.width>100 && size.height>100 && size.cssWidth>100 && size.cssHeight>100,"Canvas restored after defense: "+JSON.stringify(size));
  }
  for(const [width,height] of [[1440,960],[390,844],[844,390]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
    await tap('#tabbar [data-open-nav]');
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('#nav .nav-group')).slice(0,3).map(e=>e.textContent)`),['Bauen','Kommando','Reich']);
    await tap('#nav [data-view="infra"]');await until(`document.querySelector('#command-panel[data-panel="infra"]')`);await tap('[data-panel-close]');
    await tap('#tabbar [data-open-nav]');await tap('#nav [data-view="moderation"]');
    await until(`document.querySelector('#command-panel[data-panel="moderation"]')`);await tap('[data-panel-close]');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await tap('#tabbar [data-open-nav]');
  await pause(200);
  await writeFile(new URL('../tmp/colony-review/command-menu-mobile.png',import.meta.url),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await send("Page.navigate",{url:base+"/help.html"});
  await until(`document.querySelector('.help-topbar > .btn')`);
  for(const [width,height] of [[320,568],[390,844],[844,390]]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:true});
    await evaluate(`document.body.style.setProperty('--safe-top','44px');window.scrollTo(0,400)`);
    await pause(200);
    const link=await evaluate(`(()=>{const b=document.querySelector('.help-topbar > .btn'),r=b.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),position:getComputedStyle(b.parentElement).position,padding:getComputedStyle(b.parentElement).paddingTop};})()`);
    assert.ok(link.top>=44 && link.left>=0 && link.right<=width && link.bottom<=height && link.hit,"Help return link visible and hittable at "+width+": "+JSON.stringify(link));
  }
  await evaluate(`document.querySelector('.help-topbar > .btn').click()`);
  await until(`document.querySelector('.living-colony.is-unity')`);
  console.log("Laboratory research, repeated defense-to-base navigation and mobile help return passed");
}
