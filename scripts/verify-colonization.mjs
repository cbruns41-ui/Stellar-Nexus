import assert from 'node:assert/strict';

export async function verifyColonization({db,snap,send,evaluate,until,click,shot}) {
  const pid=snap.planet.id,eid=snap.empire.id;
  const home=db.prepare('SELECT * FROM planets WHERE id=?').get(pid);
  const system=db.prepare('SELECT * FROM systems WHERE id=?').get(home.system_id);
  const targets=db.prepare('SELECT * FROM planets WHERE empire_id IS NULL LIMIT 2').all();
  for(const target of targets)db.prepare('UPDATE planets SET system_id=? WHERE id=?').run(home.system_id,target.id);
  db.prepare('UPDATE systems SET pirate=0,remnant=0 WHERE id=?').run(home.system_id);
  for(const [id,level] of [['colonization',2],['astrophysics',22],['warp',1]])db.prepare('INSERT INTO research VALUES(?,?,?) ON CONFLICT(empire_id,tech_id) DO UPDATE SET level=excluded.level').run(eid,id,level);
  for(const [id,level] of [['colony_dock',1],['shipyard',3],['archive',3]])db.prepare('INSERT INTO buildings VALUES(?,?,?) ON CONFLICT(planet_id,building_id) DO UPDATE SET level=excluded.level').run(pid,id,level);
  db.prepare("INSERT INTO ships VALUES(?,'colony',3) ON CONFLICT(planet_id,ship_id) DO UPDATE SET count=3").run(pid);
  db.prepare('UPDATE planets SET helium=100000 WHERE id=?').run(pid);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  await send('Page.reload');await until(`document.querySelector('[data-guide]')`);
  await evaluate(`document.querySelector('[data-view="research"]').click()`);
  await until(`document.querySelector('[data-colony-slots]')`);
  assert.match(await evaluate(`document.querySelector('[data-colony-slots]').textContent`),/1\/1.*Stufe 3/);
  assert.equal(await evaluate(`!!document.querySelector('[data-tech="astrophysics"]')`),false,'No purchase of retired slot research');
  await evaluate(`document.querySelector('[data-view="galaxy"]').click()`);
  await until(`document.querySelector('.map-search-toggle')`);
  await evaluate(`document.querySelector('.map-search-toggle').click();const s=document.querySelector('#map-search');s.value=${JSON.stringify(system.name)};s.dispatchEvent(new Event('input',{bubbles:true}));`);
  await until(`document.querySelector('[data-search-system="${system.id}"]')`);
  await evaluate(`document.querySelector('[data-search-system="${system.id}"]').click();document.querySelector('.map-search-toggle').click()`);
  await until(`document.querySelector('[data-target="${targets[0].id}"][data-mission-kind="colonize"]')`);
  await evaluate(`document.querySelector('[data-target="${targets[0].id}"][data-mission-kind="colonize"]').click()`);
  await until(`document.querySelector('#colony-slot-status')?.textContent.includes('Stufe 3')`);
  assert.equal(await evaluate(`document.querySelector('#m-go').disabled`),true);
  // Let travel preview finish; it must not accidentally re-enable the launch button.
  await until(`document.querySelector('#travel-box')?.textContent.includes('Ankunft')`);
  assert.equal(await evaluate(`document.querySelector('#m-go').disabled`),true);
  await shot('colonization-level2-blocked');
  db.prepare("UPDATE research SET level=3 WHERE empire_id=? AND tech_id='colonization'").run(eid);
  await until(`document.querySelector('#m-go')?.disabled===false`,45000);
  assert.match(await evaluate(`document.querySelector('#colony-slot-status').textContent`),/1 Planetplatz frei/);
  await click('#m-go');await until(`!document.querySelector('#m-go')`);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM fleets WHERE empire_id=? AND mission='colonize' AND is_return=0").get(eid).n,1);
  await evaluate(`document.querySelector('[data-view="research"]').click()`);
  await until(`document.querySelector('[data-colony-slots]')?.textContent.includes('1 unterwegs')`);
  assert.match(await evaluate(`document.querySelector('[data-colony-slots]').textContent`),/Stufe 7/);
  await shot('colonization-slot-reserved');
  console.log('Colonization browser passed: level 2 blocked despite Astro 22, live unlock at level 3 without reload, real launch reserves slot, next requirement level 7 visible');
}
