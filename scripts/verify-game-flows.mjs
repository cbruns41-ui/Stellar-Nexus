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
  assert.equal(await evaluate(`document.querySelector('#map-filters').hidden`),true,'Filters start collapsed');
  await evaluate(`document.querySelector('.map-filter-toggle').click()`);
  for(const filter of ['own','hostile','free'])assert.ok(await evaluate(`(()=>{const e=document.querySelector('[data-map-filter="${filter}"]').closest('label'),r=e.getBoundingClientRect();return r.top>=0 && r.right<=innerWidth && e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`),'Visible first-tap filter '+filter);
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
  await until(`document.querySelector('[data-ship-budget="fighter"]')?.innerText.includes('Mit Ressourcen bezahlbar:')`);
  await evaluate(`window.__budgetIdentity=document.querySelector('[data-ship-budget="fighter"]')`);
  await pause(1200);
  assert.ok(await evaluate(`window.__budgetIdentity===document.querySelector('[data-ship-budget="fighter"]')`),'Live ship budget keeps its DOM identity');
  const max=await evaluate(`Number(document.querySelector('.yard-sheet [data-qty="fighter"]').max)`);
  assert.ok(max>0 && max<=50,'Ship order limit matches available capacity');
  await evaluate(`{const q=document.querySelector('.yard-sheet [data-qty="fighter"]');q.value=Number(q.max)+1;q.dispatchEvent(new Event('input',{bubbles:true}));}`);
  assert.ok(await evaluate(`document.querySelector('.yard-sheet [data-ship="fighter"]').disabled`),'Order exceeding current maximum is disabled');
  await evaluate(`{const q=document.querySelector('.yard-sheet [data-qty="fighter"]');q.value=1;q.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.yard-sheet [data-ship="fighter"]').click();}`);
  await until(`document.querySelector('.yard-sheet .queue-slot-note') && document.querySelector('[data-ship-budget="fighter"]')`);
  console.log('Live per-ship affordability, order validation and refresh after purchase passed');
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
  await until(`document.querySelector('#group-launch')`);
  await evaluate(`document.querySelector('[data-group-max="${home.id}"]').click()`);
  await pause(1600);
  await evaluate(`document.querySelector('#group-launch').click()`);
  await until(`!document.querySelector('#group-launch')`);
  await evaluate(`document.querySelector('#nav [data-view="reports"]').click()`);
  await until(`document.querySelector('[data-news="combat"]')`);
  await evaluate(`document.querySelector('[data-news="combat"]').click()`);
  await until(`document.querySelector('#report-list')?.innerText.includes('Piraten') && !document.querySelector('#report-list')?.innerText.includes('Lade…')`);
  console.log("Mobile map search, stable taps, colonization, deployment dialog, yard sheet, Orbit touch and raid combat report passed");
  const created=await fetch(base+'/api/alliances',{method:'POST',headers,body:JSON.stringify({tag:'TST',name:'Playtest Allianz',color:'#00ffff'})});assert.ok(created.ok);
  const alliance=(await created.json()).alliance;
  await evaluate(`document.querySelector('#nav [data-view="alliance"]').click()`);await until(`document.querySelector('#ally-colonize')`);
  const allyDb=new DatabaseSync(databasePath);
  try {allyDb.exec('PRAGMA busy_timeout=5000');allyDb.prepare("UPDATE planets SET alliance_id=?,name='Allianz Testbasis',metal=1000,helium=0,energy=0,titan=0,crystal=0 WHERE id=?").run(alliance.id,target.id);}
  finally{allyDb.close();}
  await send('Page.reload');await until(`document.querySelector('.living-colony.is-unity')`);
  await evaluate(`document.querySelector('#nav [data-view="alliance"]').click()`);await until(`document.querySelector('[data-ally-research-open]')`);
  await evaluate(`document.querySelector('[data-ally-research-open]').click()`);
  await until(`document.querySelector('#command-panel[data-panel="research"] [data-ally-fund="supply_grid"]')`);
  assert.match(await evaluate(`document.querySelector('#command-panel').innerText`),/Allianz-Labor/);
  await evaluate(`document.querySelector('[data-ally-fund="supply_grid"]').click()`);
  await until(`document.querySelector('[data-ally-fund="supply_grid"]').disabled`);
  await pause(700);
  const fundedDb=new DatabaseSync(databasePath);
  try{
    fundedDb.exec('PRAGMA busy_timeout=5000');assert.equal(fundedDb.prepare("SELECT metal FROM alliance_research WHERE alliance_id=? AND research_id='supply_grid'").get(alliance.id).metal,1000);
    fundedDb.prepare('UPDATE planets SET metal=99000,helium=70000,titan=35000,energy=50000,crystal=25000 WHERE id=?').run(target.id);
  }finally{fundedDb.close();}
  // Reopen through the personal focus to exercise atomic switching into the alliance lab again.
  await evaluate(`{const s=document.querySelector('#planet-select');s.value='${home.id}';s.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await until(`!document.querySelector('#game').classList.contains('focus-pending') && document.querySelector('#command-panel').dataset.planetId==='${home.id}'`);
  await evaluate(`{const s=document.querySelector('#planet-select');s.value='${target.id}';s.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await until(`document.querySelector('[data-ally-tech="supply_grid"]') && !document.querySelector('[data-ally-tech="supply_grid"]').disabled`);
  await evaluate(`document.querySelector('[data-ally-tech="supply_grid"]').click()`);
  await until(`document.querySelector('#panel-view').innerText.includes('Forschung läuft')`);
  console.log('Alliance colonization entry, correct laboratory, partial funding and research start passed');
  await send("Network.clearBrowserCookies");await send("Page.navigate",{url:base+"/"});
  await until(`document.querySelector('#register-form')?.onsubmit && document.querySelector('#boot')?.hidden && !document.querySelector('#landing').hidden`);
  await evaluate(`document.querySelector('[data-gate="register"]').click()`);
  await until(`document.querySelector('#register-form [name="challengeId"]').value`);
  await evaluate(`(()=>{const f=document.querySelector('#register-form');for(const [k,v] of Object.entries({username:'BrowserPilot',email:'browser@example.org',empire:'Browser Empire',password:'secret123'}))f.elements[k].value=v;f.elements.human.checked=true;f.elements.answer.value=document.querySelector('#human-question').textContent.match(/[0-9]+/g).map(Number).reduce((a,b)=>a+b,0);f.requestSubmit();})()`);
  await until(`document.querySelector('#auth-error')?.innerText.includes('Registrierung eingegangen')`);
  const regDb=new DatabaseSync(databasePath);try {assert.equal(regDb.prepare("SELECT status FROM registration_requests WHERE email='browser@example.org'").get()?.status,'pending');} finally {regDb.close();}
  console.log("Landing registration form submits human challenge and waits for admin approval");
}
