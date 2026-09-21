import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export async function verifyRepairs({db,snap,send,evaluate,until,click,shot,snapshot}) {
  const pid=snap.planet.id, eid=snap.empire.id;
  const key=async key=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});};
  const nav=async name=>{await evaluate(`document.querySelector('[data-view="${name}"]').click()`);};
  const closePanel=async()=>{if(await evaluate(`!!document.querySelector('[data-panel-close]')`))await click('[data-panel-close]');};
  const marker=async id=>{
    await until(`document.querySelector('[data-colony-marker="${id}"]:not([hidden])')`);
    console.log('Marker hit', await evaluate(`(()=>{const b=document.querySelector('[data-colony-marker="${id}"]'),r=b.getBoundingClientRect();return {id:'${id}',rect:{x:r.x,y:r.y,w:r.width,h:r.height},pointer:getComputedStyle(b).pointerEvents,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,400)};})()`));
    await shot('repair-marker-before');
    await click(`[data-colony-marker="${id}"]`);
    await until(`document.querySelector('.colony-marker.selected')?.dataset.colonyMarker==='${id}'`);
  };
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  await nav('command'); await closePanel();
  if(await evaluate(`!!document.querySelector('.colony-quests .city-sheet-close')`)) await click('.colony-quests .city-sheet-close');
  await marker('shipyard'); await click('[data-colony-work="yard"]');
  await until(`document.querySelector('.yard-sheet')`); await closePanel();
  await marker('jumpgate');
  const blocked=await evaluate(`document.querySelector('.colony-card-reason').textContent`);
  assert.match(blocked,/Warp-Bake Stufe 3/);assert.match(blocked,/Hyperspace Stufe 1/);
  assert.equal(await evaluate(`document.querySelector('[data-colony-upgrade]').disabled`),true);
  await shot('repair-jumpgate-blocked');
  await click('.colony-card-close');
  // Fulfil actual game prerequisites in this isolated fixture, then click the real build UI.
  db.prepare('DELETE FROM queue WHERE planet_id=?').run(pid);
  for (const [id,level] of [['command',8],['beacon',3]]) db.prepare('INSERT INTO buildings VALUES(?,?,?) ON CONFLICT(planet_id,building_id) DO UPDATE SET level=excluded.level').run(pid,id,level);
  db.prepare("INSERT INTO research VALUES(?,'hyperspace',1) ON CONFLICT(empire_id,tech_id) DO UPDATE SET level=1").run(eid);
  db.prepare('UPDATE planets SET metal=100000,energy=100000,helium=100000,titan=100000,crystal=100000,diamond=10000 WHERE id=?').run(pid);
  await nav('infra');await until(`document.querySelector('[data-build="jumpgate"]:not([disabled])')`);
  await evaluate(`document.querySelector('[data-build="jumpgate"]').scrollIntoView({block:'center'})`);await click('[data-build="jumpgate"]');
  await until(`document.querySelector('#bldg-jumpgate').textContent.includes('IM BAU')`);
  assert.ok(db.prepare("SELECT id FROM queue WHERE planet_id=? AND item_id='jumpgate'").get(pid));
  await closePanel();await marker('shipyard');await click('.colony-card-close');
  // Trigger the real no-freigabe dialog through its launch button.
  const orbit=JSON.parse(db.prepare('SELECT orbit_siege FROM empires WHERE id=?').get(eid).orbit_siege);
  orbit.playsUsed=99; db.prepare('UPDATE empires SET orbit_siege=? WHERE id=?').run(JSON.stringify(orbit),eid);
  db.prepare('UPDATE users SET is_admin=0 WHERE id=?').run(snap.user.id);
  await nav('galaxy');await until(`document.querySelector('#map-orbit-fire')`);
  await send('Page.reload');await until(`document.querySelector('.living-colony')`);await nav('galaxy');await until(`document.querySelector('#map-orbit-fire')`);
  for (const method of ['Escape','x','backdrop']) {
    console.log('Orbit lock close:',method);
    await click('#map-orbit-fire');await until(`document.querySelector('.orbit-lock-close')`);
    assert.equal(await evaluate(`document.querySelector('#game').inert`),true);
    await key('Tab'); assert.ok(await evaluate(`document.querySelector('#modal').contains(document.activeElement)`));
    if(method==='Escape')await key('Escape');
    else if(method==='x')await click('.orbit-lock-close');
    else {
      const point=await evaluate(`(()=>{const r=document.querySelector('#modal').getBoundingClientRect();return {x:r.left+2,y:r.top+2};})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    }
    await until(`document.querySelector('#modal').hidden`);
    assert.equal(await evaluate(`document.querySelector('#game').inert`),false);
    assert.ok(await evaluate(`!!document.querySelector('#map-orbit-fire') && !document.querySelector('#command-panel')`));
  }
  db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(snap.user.id);
  await send('Page.reload');await until(`document.querySelector('.living-colony')`);await nav('galaxy');await until(`document.querySelector('#map-orbit-fire')`);
  for(const method of ['Escape','x']){
    await click('#map-orbit-fire');await until(`document.querySelector('.orbit-game')`);
    await key('Tab');assert.ok(await evaluate(`document.querySelector('.orbit-game').contains(document.activeElement)`));
    if(method==='Escape')await key('Escape');else await click('.orbit-exit');
    await until(`!document.querySelector('.orbit-game')`);
    assert.equal(await evaluate(`document.querySelector('#game').inert`),false);
    await new Promise(r=>setTimeout(r,500));
  }
  // The PvE raid control on the map must open its defense dialog after view changes.
  db.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind,expires_at) VALUES(?,'{\"fighter\":1}',?,'pirates',?)").run(pid,Date.now()-1000,Date.now()+7200000);
  await nav('command');await nav('galaxy');await until(`document.querySelector('[data-alert-defend]')`,45000);await click('[data-alert-defend]');
  await until(`document.querySelector('.group-fleet-sheet')`);await key('Escape');
  assert.equal(await evaluate(`document.querySelector('#modal').hidden`),true);
  // Alliance funding at 89% must give an exact founding path with no alliance planet.
  const social=require('../src/social');
  const empire=db.prepare('SELECT * FROM empires WHERE id=?').get(eid);
  const alliance=social.createAlliance(db,empire,'RPR','Repair Alliance','','#00ffff');
  const cost=social.researchRows(db,alliance.id,eid).find(r=>r.id==='supply_grid').cost;
  db.prepare("INSERT INTO alliance_research(alliance_id,research_id,metal,helium,titan,energy,crystal) VALUES(?,'supply_grid',?,?,?,?,?)").run(alliance.id,...['metal','helium','titan','energy','crystal'].map(k=>Math.floor(cost[k]*.89)));
  await nav('alliance'); await until(`/89\\s*% finanziert/.test(document.querySelector('#command-panel')?.textContent)`,45000);
  const text=await evaluate(`document.querySelector('#command-panel').textContent`);
  assert.match(text,/Ein Allianzplanet fehlt/);assert.match(text,/Kolonieschiff/);assert.match(text,/Als Allianz-Planet besiedeln/);
  await shot('repair-alliance-blocker');
  await closePanel();await nav('command');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const tap=async selector=>{
    const point=await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,id:1};})()`);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  // Narrow screens show a camera crop: locate the shipyard via the real directory.
  await tap('.colony-directory summary');await tap('[data-colony-focus="shipyard"]');
  await until(`document.querySelector('[data-colony-work="yard"]')`);await tap('.colony-card-close');
  await marker('shipyard');await click('[data-colony-work="yard"]');await until(`document.querySelector('.yard-sheet')`);
  await closePanel();await tap('[data-colony-marker="shipyard"]');await until(`document.querySelector('[data-colony-work="yard"]')`);await tap('[data-colony-work="yard"]');await until(`document.querySelector('.yard-sheet')`);
  await shot('repair-mobile-yard');
  console.log('Repair acceptance passed: physical markers/yard desktop + mobile, jumpgate blockers/build, raid dialog, orbit close/focus/backdrop, 89% alliance founding blocker');
}
