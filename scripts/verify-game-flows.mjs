import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

export async function verifyGameFlows({base,headers,databasePath,send,evaluate,until,pause}) {
  const db=new DatabaseSync(databasePath);db.exec("PRAGMA busy_timeout=5000");
  let home,target,system;
  try {
    home=db.prepare("SELECT p.* FROM planets p JOIN empires e ON e.id=p.empire_id JOIN users u ON u.id=e.user_id WHERE u.username='Admin' AND p.alliance_id IS NULL ORDER BY p.id LIMIT 1").get();
    target=db.prepare("SELECT * FROM planets WHERE system_id=? AND empire_id IS NULL LIMIT 1").get(home.system_id);
    system=db.prepare("SELECT * FROM systems WHERE id=?").get(home.system_id);
    db.prepare("UPDATE systems SET pirate=0,remnant=0 WHERE id=?").run(system.id);
    db.prepare("UPDATE planets SET helium=50000,metal=50000,energy=50000,titan=10000 WHERE id=?").run(home.id);
    for(const [id,level] of [["command",4],["shipyard",3],["colony_dock",1]]) db.prepare("INSERT INTO buildings VALUES(?,?,?) ON CONFLICT(planet_id,building_id) DO UPDATE SET level=excluded.level").run(home.id,id,level);
    db.prepare("INSERT INTO research VALUES(?,'colonization',3) ON CONFLICT(empire_id,tech_id) DO UPDATE SET level=3").run(home.empire_id);
    db.prepare("INSERT INTO ships VALUES(?,'colony',1) ON CONFLICT(planet_id,ship_id) DO UPDATE SET count=1").run(home.id);
    db.prepare("INSERT INTO ships VALUES(?,'fighter',8) ON CONFLICT(planet_id,ship_id) DO UPDATE SET count=8").run(home.id);
  } finally { db.close(); }
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send("Page.reload");await until(`document.querySelector('.living-colony.is-unity')`);
  await evaluate(`document.querySelector('[data-view="galaxy"]').click()`);
  await until(`document.querySelector('#planet-focus option[value="planet:${home.id}"]')`);
  await evaluate(`document.querySelector('.map-search-toggle').click();const s=document.querySelector('#map-search');s.value=${JSON.stringify(system.name)};s.dispatchEvent(new Event('input',{bubbles:true}));`);
  await until(`document.querySelector('[data-search-system="${system.id}"]')`);
  assert.ok(await evaluate(`(()=>{const e=document.querySelector('#map-search'),r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;})()`),"Search input can be hit");
  await evaluate(`document.querySelector('[data-search-system="${system.id}"]').click();document.querySelector('.map-search-toggle').click()`);
  await until(`document.querySelector('[data-target="${target.id}"][data-mission-kind="colonize"]')`);
  await evaluate(`window.__mapIdentity=document.querySelector('#starmap');window.__planetIdentity=document.querySelector('[data-target="${target.id}"][data-mission-kind="colonize"]')`);
  await pause(2200);
  assert.ok(await evaluate(`window.__mapIdentity===document.querySelector('#starmap') && window.__planetIdentity===document.querySelector('[data-target="${target.id}"][data-mission-kind="colonize"]')`),"Map and actions retain DOM identity across second ticks");
  await evaluate(`document.querySelector('[data-target="${target.id}"][data-mission-kind="colonize"]').click()`);
  await until(`document.querySelector('#mission-origin')`);
  assert.equal(await evaluate(`Number(document.querySelector('#mission-origin').value)`),home.id,"Colony ship source is selected");
  assert.equal(await evaluate(`document.querySelector('#ship-picks [data-ship="colony"]').value`),"1");
  await evaluate(`document.querySelector('#m-go').click()`);
  await until(`!document.querySelector('#m-go')`);
  const arrived=new DatabaseSync(databasePath);try { arrived.exec("PRAGMA busy_timeout=5000;UPDATE fleets SET arrives_at=1 WHERE mission='colonize'"); } finally {arrived.close();}
  await fetch(base+"/api/state",{headers});
  const audit=new DatabaseSync(databasePath);try {assert.equal(audit.prepare("SELECT empire_id FROM planets WHERE id=?").get(target.id).empire_id,home.empire_id);} finally {audit.close();}
  await send("Page.reload");await until(`document.querySelector('.living-colony.is-unity')`);
  await evaluate(`document.querySelector('[data-view="galaxy"]').click()`);
  await until(`document.querySelector('#planet-focus option[value="planet:${target.id}"]')`);
  await evaluate(`const s=document.querySelector('#planet-focus');s.value='planet:${target.id}';s.dispatchEvent(new Event('change',{bubbles:true}));`);
  await until(`document.querySelector('[data-target="${target.id}"][data-mission-kind="deploy"]')`);
  await evaluate(`document.querySelector('[data-target="${target.id}"][data-mission-kind="deploy"]').click()`);
  await until(`document.querySelector('#mission')?.value==='deploy'`);
  await evaluate(`document.querySelector('#m-cancel').click();window.__mapIdentity=document.querySelector('#starmap');document.querySelector('[data-view="yard"]').click()`);
  await until(`document.querySelector('.yard-sheet [data-ship="fighter"]')`);
  assert.equal(await evaluate(`document.querySelector('#game').dataset.view`),"galaxy","Yard is a sheet over Karte");
  await evaluate(`document.querySelector('[data-yard-close]').click()`);
  assert.ok(await evaluate(`window.__mapIdentity===document.querySelector('#starmap')`),"Closing yard preserves map");
  await evaluate(`document.querySelector('#map-orbit-fire').click();document.querySelector('#map-orbit-fire').click()`);
  await until(`document.querySelector('.orbit-game')`);
  assert.equal(await evaluate(`document.querySelectorAll('.orbit-game').length`),1);
  const point=await evaluate(`(()=>{const r=document.querySelector('.orbit-fire').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...point,id:1}]});await pause(600);
  assert.ok(await evaluate(`document.querySelector('.orbit-fire').classList.contains('pressed')`),"Touch fire stays active");
  assert.ok(await evaluate(`parseFloat(document.querySelector('[data-orbit-battery]').style.width)<100`),"Firing consumes battery");
  await send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await evaluate(`document.querySelector('.orbit-exit').click()`);
  assert.equal(await evaluate(`document.querySelector('#game').dataset.view`),"galaxy");
  const raidDb=new DatabaseSync(databasePath);try {raidDb.exec("PRAGMA busy_timeout=5000");raidDb.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind) VALUES(?,?,1,'pirates')").run(home.id,JSON.stringify({fighter:3}));} finally {raidDb.close();}
  await send("Page.reload");await until(`document.querySelector('.living-colony.is-unity')`);
  await evaluate(`document.querySelector('[data-view="galaxy"]').click()`);await until(`document.querySelector('[data-alert-defend]')`);
  await evaluate(`window.__defendIdentity=document.querySelector('[data-alert-defend]')`);await pause(2200);
  assert.ok(await evaluate(`window.__defendIdentity===document.querySelector('[data-alert-defend]')`),"Raid button survives timer updates");
  await evaluate(`document.querySelector('[data-alert-defend]').click()`);
  await until(`document.querySelector('#report-list')?.innerText.includes('Piraten') && !document.querySelector('#report-list')?.innerText.includes('Lade…')`);
  console.log("Mobile map search, stable taps, colonization, deployment dialog, yard sheet, Orbit touch and raid combat report passed");
  await send("Network.clearBrowserCookies");await send("Page.navigate",{url:base+"/"});
  await until(`document.querySelector('#register-form')?.onsubmit && document.querySelector('#boot')?.hidden && !document.querySelector('#landing').hidden`);
  await evaluate(`document.querySelector('[data-gate="register"]').click()`);
  await until(`document.querySelector('#register-form [name="challengeId"]').value`);
  await evaluate(`(()=>{const f=document.querySelector('#register-form');for(const [k,v] of Object.entries({username:'BrowserPilot',email:'browser@example.org',empire:'Browser Empire',password:'secret123'}))f.elements[k].value=v;f.elements.human.checked=true;f.elements.answer.value=document.querySelector('#human-question').textContent.match(/[0-9]+/g).map(Number).reduce((a,b)=>a+b,0);f.requestSubmit();})()`);
  await until(`document.querySelector('#auth-error')?.innerText.includes('Registrierung eingegangen')`);
  const regDb=new DatabaseSync(databasePath);try {assert.equal(regDb.prepare("SELECT status FROM registration_requests WHERE email='browser@example.org'").get()?.status,'pending');} finally {regDb.close();}
  console.log("Landing registration form submits human challenge and waits for admin approval");
}
