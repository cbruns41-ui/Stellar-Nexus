'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openDb}=require('../src/db'),{ensurePlayer}=require('../src/seed'),game=require('../src/game'),{withTx}=require('../src/tx');
const {maxPlanets,requiredLevel,colonySlots,MAX_PLANETS}=require('../src/colonization');
const {TECHS,SHIPS,scaledCost,scaledTime,colonyShipCost}=require('../src/catalog');
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-slots-')),db=openDb(path.join(dir,'test.db'));
  t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
  ensurePlayer(db,'SlotPilot','local-test-password','Slots','#00ffff');
  const empire=db.prepare('SELECT * FROM empires LIMIT 1').get(),user=db.prepare('SELECT * FROM users WHERE id=?').get(empire.user_id);
  let home=db.prepare('SELECT * FROM planets WHERE empire_id=?').get(empire.id);
  db.prepare('UPDATE planets SET helium=100000 WHERE id=?').run(home.id);
  db.prepare("INSERT INTO buildings VALUES(?,'colony_dock',1)").run(home.id);
  db.prepare('UPDATE systems SET remnant=0,pirate=0 WHERE id=?').run(home.system_id);
  db.prepare("INSERT INTO research VALUES(?,'astrophysics',22)").run(empire.id);
  const level=n=>db.prepare("INSERT INTO research VALUES(?,'colonization',?) ON CONFLICT(empire_id,tech_id) DO UPDATE SET level=excluded.level").run(empire.id,n);
  const targets=db.prepare('SELECT * FROM planets WHERE empire_id IS NULL LIMIT 3').all();
  for (const target of targets) { db.prepare('UPDATE planets SET system_id=? WHERE id=?').run(home.system_id,target.id); target.system_id=home.system_id; }
  home=db.prepare('SELECT * FROM planets WHERE id=?').get(home.id);
  game.addShips(db,home.id,{colony:4});
  return {db,empire,user,home,targets,level};
}
test('nonlinear slots use Colonization alone at every boundary through the existing 36-planet limit',()=>{
  assert.deepEqual(Array.from({length:8},(_,i)=>requiredLevel(i+1)),[0,3,7,12,18,25,33,42]);
  assert.equal(maxPlanets(0,22),1);assert.equal(maxPlanets(2,22),1);
  for(let slot=2;slot<=MAX_PLANETS;slot++){
    assert.equal(maxPlanets(requiredLevel(slot)-1),slot-1);
    assert.equal(maxPlanets(requiredLevel(slot)),slot);
  }
  assert.equal(TECHS.colonization.max,requiredLevel(MAX_PLANETS));
  assert.equal(maxPlanets(10000),36);
});
test('research cost/time growth and colony ship prices are unchanged',()=>{
  const c=TECHS.colonization;
  assert.equal(c.factor,1.95);assert.equal(c.baseTime,140);
  assert.equal(c.baseCost.metal,180);assert.equal(c.baseCost.diamond,8);
  assert.equal(scaledCost(c.baseCost,c.factor,2).metal,Math.floor(180*1.95**2));
  assert.equal(scaledTime(c.baseTime,c.factor,2,0),Math.floor(140*1.95**2));
  assert.deepEqual(colonyShipCost(1),SHIPS.colony.cost);
  assert.equal(colonyShipCost(2).metal,Math.floor(SHIPS.colony.cost.metal*1.85));
});
test('below level 3 no second planet; level 3 reserves exactly one extra slot; level 7 opens the third',t=>{
  const {db,empire,user,home,targets,level}=fixture(t);
  for(const n of [0,1,2]){
    level(n);const stock=game.shipsMap(db,home.id),fuel=db.prepare('SELECT helium FROM planets WHERE id=?').get(home.id).helium;
    assert.throws(()=>withTx(db,()=>game.sendFleet(db,empire,home,targets[0],'colonize',{colony:1},{})),/Kolonisation Stufe 3/);
    assert.deepEqual(game.shipsMap(db,home.id),stock);assert.equal(db.prepare('SELECT helium FROM planets WHERE id=?').get(home.id).helium,fuel);
  }
  level(3);withTx(db,()=>game.sendFleet(db,empire,home,targets[0],'colonize',{colony:1},{}));
  let s=game.snapshot(db,user,home.id);assert.equal(s.empire.colonySlots.pending,1);assert.equal(s.empire.colonySlots.free,0);assert.match(s.empire.colonySlots.blocker,/Stufe 7/);
  assert.throws(()=>withTx(db,()=>game.sendFleet(db,empire,home,targets[1],'colonize',{colony:1},{})),/Stufe 7/);
  db.exec('UPDATE fleets SET arrives_at=1');game.tickWorld(db);
  s=game.snapshot(db,user,home.id);assert.equal(s.empire.planetCount,2);assert.equal(s.empire.planetCap,2);
  level(6);assert.throws(()=>withTx(db,()=>game.sendFleet(db,empire,home,targets[1],'colonize',{colony:1},{})),/Stufe 7/);
  level(7);withTx(db,()=>game.sendFleet(db,empire,home,targets[1],'colonize',{colony:1},{}));
  assert.throws(()=>withTx(db,()=>game.sendFleet(db,empire,home,targets[2],'colonize',{colony:1},{})),/Stufe 12/);
});
test('arrival rechecks slot cap and returns the colony ship when an old flight exceeds it',t=>{
  const {db,empire,user,home,targets,level}=fixture(t);
  level(3);withTx(db,()=>game.sendFleet(db,empire,home,targets[0],'colonize',{colony:1},{}));
  level(2);db.exec('UPDATE fleets SET arrives_at=1');game.tickWorld(db);
  assert.equal(db.prepare('SELECT empire_id FROM planets WHERE id=?').get(targets[0].id).empire_id,null);
  const returning=db.prepare('SELECT ships FROM fleets WHERE empire_id=? AND is_return=1').get(empire.id);
  assert.equal(JSON.parse(returning.ships).colony,1);
  assert.equal(game.snapshot(db,user,home.id).empire.planetCount,1);
});
test('existing planets are retained above the new cap and next expansion names the actual required level',t=>{
  const {db,user,empire,home,targets,level}=fixture(t);level(2);
  for(const target of targets.slice(0,2))db.prepare('UPDATE planets SET empire_id=?,founded_at=? WHERE id=?').run(empire.id,Date.now()+1,target.id);
  const s=game.snapshot(db,user,home.id);
  assert.equal(s.empire.planetCount,3);assert.equal(s.empire.planetCap,1);assert.equal(s.empire.colonySlots.nextLevel,12);
  assert.match(s.empire.colonySlots.blocker,/Planet 4.*Stufe 12/);
  assert.equal(colonySlots(3,1,1).free,0);
});
