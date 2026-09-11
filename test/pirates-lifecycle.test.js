'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { openDb } = require('../src/db'), { ensurePlayer } = require('../src/seed');
const game = require('../src/game'), npc = require('../src/npc-sites'), pirates = require('../src/pirates');
const { remnantFleet, setRemnantFleet } = require('../src/galaxy');
const { withTx } = require('../src/tx');
const HOUR = 3600000;

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'nexus-pve-'));
  const file = path.join(dir,'world.db'); let db = openDb(file);
  t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
  let at = Date.now(); t.mock.method(Date,'now',()=>at);
  ensurePlayer(db,'PvePilot','secret123','Pve Empire','#00ffff');
  const empire = db.prepare('SELECT * FROM empires LIMIT 1').get();
  const home = db.prepare('SELECT * FROM planets WHERE empire_id=?').get(empire.id);
  db.prepare('UPDATE planets SET founded_at=?,helium=100000 WHERE id=?').run(at-4*HOUR,home.id);
  const sys = db.prepare(`SELECT * FROM systems s WHERE is_hub=0 AND NOT EXISTS(SELECT 1 FROM planets p WHERE p.system_id=s.id AND p.empire_id IS NOT NULL) LIMIT 1`).get();
  db.prepare("UPDATE systems SET remnant=1,pirate=0,warlord='',ring=3 WHERE id=?").run(sys.id);
  db.prepare('DELETE FROM npc_sites WHERE system_id=?').run(sys.id);
  setRemnantFleet(db,sys.id,{fighter:4,probe:2,interceptor:1});
  db.prepare('INSERT OR IGNORE INTO links(a,b) VALUES(?,?)').run(Math.min(home.system_id,sys.id),Math.max(home.system_id,sys.id));
  const target = db.prepare('SELECT * FROM planets WHERE system_id=? LIMIT 1').get(sys.id);
  const meta = (key,n) => db.prepare('INSERT OR REPLACE INTO world_meta(key,value) VALUES(?,?)').run(key,String(n));
  meta('last_pulse',at+800*24*HOUR);meta('last_galaxy',at+800*24*HOUR);
  return {get db(){return db;},empire,home,target,system:()=>db.prepare('SELECT * FROM systems WHERE id=?').get(sys.id),
    at:()=>at,advance:n=>{at+=n;},meta,reopen:()=>{db.close();db=openDb(file);return db;}};
}

test('PVE: partial losses survive refreshes/restart, recover by elapsed time and never double the escort',t=>{
  const f=fixture(t); let db=f.db;
  db.prepare("UPDATE systems SET warlord='Test captain' WHERE id=?").run(f.system().id);
  npc.tick(db); const base=remnantFleet(db,f.system().id);
  assert.deepEqual(base,{fighter:12,probe:2,interceptor:1,cruiser:2,frigate:2});
  const survivors={fighter:2};npc.recordBattle(db,f.system(),survivors,false);setRemnantFleet(db,f.system().id,survivors);
  for(let i=0;i<20;i++){f.advance(90001);npc.tick(db);}
  assert.deepEqual(remnantFleet(db,f.system().id),survivors);
  db=f.reopen();assert.deepEqual(remnantFleet(db,f.system().id),survivors);
  f.advance(15*HOUR-20*90001);npc.tick(db);
  assert.equal(remnantFleet(db,f.system().id).fighter,7,'half of the missing fleet returns after 15h');
  f.advance(9*HOUR);npc.tick(db);assert.deepEqual(remnantFleet(db,f.system().id),base);
  const preview=game.previewCombat(db,f.empire,f.home,f.target,{fighter:1});assert.deepEqual(preview.defShips,base);
  npc.tick(db);assert.deepEqual(remnantFleet(db,f.system().id),base);
});

test('PVE: liberated systems stay free 72h; colony flights and ownership protect the whole system',t=>{
  const f=fixture(t),db=f.db; npc.tick(db);
  npc.recordBattle(db,f.system(),{},true);db.prepare('UPDATE systems SET remnant=0 WHERE id=?').run(f.system().id);setRemnantFleet(db,f.system().id,{});
  f.advance(71*HOUR);npc.tick(db);assert.equal(f.system().remnant,0);
  db.prepare("INSERT INTO fleets(empire_id,origin_planet_id,target_planet_id,mission,ships,cargo,departed_at,arrives_at) VALUES(?,?,?,'colonize','{\"colony\":1}','{}',?,?)").run(f.empire.id,f.home.id,f.target.id,f.at(),f.at()+10*HOUR);
  f.advance(2*HOUR);npc.tick(db);assert.equal(f.system().remnant,0);
  db.prepare('UPDATE planets SET empire_id=? WHERE id=?').run(f.empire.id,f.target.id);db.exec('DELETE FROM fleets');
  f.advance(730*24*HOUR);npc.tick(db);assert.equal(f.system().remnant,0);
  db.prepare('UPDATE planets SET empire_id=NULL WHERE id=?').run(f.target.id);f.advance(90001);npc.tick(db);
  assert.equal(f.system().remnant,1);assert.deepEqual(remnantFleet(db,f.system().id),{fighter:4,probe:2,interceptor:1});
});

test('PVE: horsts progress on victory, stay bounded for 730 days and preserve beginner levels',t=>{
  const f=fixture(t),db=f.db;db.prepare('UPDATE systems SET pirate=19 WHERE id=?').run(f.system().id);
  setRemnantFleet(db,f.system().id,pirates.garrisonFor(19));npc.tick(db);
  f.advance(365*24*HOUR);npc.tick(db);assert.equal(f.system().pirate,19,'time alone does not inflate existing encounters');
  for(let day=0;day<730;day+=3){
    npc.recordBattle(db,f.system(),{},true);db.prepare('UPDATE systems SET remnant=0,pirate=0 WHERE id=?').run(f.system().id);setRemnantFleet(db,f.system().id,{});
    f.advance(72*HOUR);npc.tick(db);
    assert.ok(f.system().pirate<=99);assert.ok(Object.values(remnantFleet(db,f.system().id)).every(n=>Number.isSafeInteger(n)&&n<=8000));
  }
  assert.equal(f.system().pirate,99);assert.ok(pirates.powerForLevel(99)<100000);
  const {SHIPS}=require('../src/catalog');let previousPower=0;
  for(let level=1;level<=99;level++){
    const power=Object.entries(pirates.garrisonFor(level)).reduce((sum,[id,n])=>sum+n*(SHIPS[id].attack+0.4*(SHIPS[id].hull+SHIPS[id].shield)),0);
    assert.ok(power>=previousPower,`ship class transition at level ${level} must not weaken the garrison`);previousPower=power;
  }
  db.prepare('UPDATE npc_sites SET level=2 WHERE system_id=?').run(f.system().id);
  npc.recordBattle(db,f.system(),{},true);db.prepare('UPDATE systems SET remnant=0,pirate=0 WHERE id=?').run(f.system().id);
  f.advance(72*HOUR);npc.tick(db);assert.equal(f.system().pirate,2);
  const before=remnantFleet(db,f.system().id);for(let i=0;i<100;i++)pirates.grow(db);
  assert.deepEqual(remnantFleet(db,f.system().id),before,'replenishment cannot refill or level an existing horst');
});

test('PVE: every active empire gets its own raid; old 0s raids expire without losses or backlog',t=>{
  const f=fixture(t),db=f.db;
  for(let i=0;i<3;i++)ensurePlayer(db,`RaidPilot${i}`,'secret123',`Raid Empire${i}`,'#ffffff');
  db.prepare('UPDATE empires SET last_seen=?').run(f.at());db.prepare('UPDATE planets SET founded_at=? WHERE empire_id IS NOT NULL').run(f.at()-4*HOUR);
  db.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind) VALUES(?,'{\"fighter\":8000}',?,'pirates')").run(f.home.id,f.at()-48*HOUR);
  const before=game.shipsMap(db,f.home.id);f.meta('last_galaxy',0);game.tickWorld(db);
  assert.deepEqual(game.shipsMap(db,f.home.id),before);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM raids').get().n,4,'no worldwide two-raid lock');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reports WHERE json_extract(body,'$.raidExpired')=1").get().n,1);
  const raid=db.prepare('SELECT * FROM raids WHERE target_planet_id=?').get(f.home.id);
  assert.equal(raid.level,pirates.levelForFleet(JSON.parse(raid.ships)));
  f.advance(3*HOUR);game.tickWorld(db);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM raids').get().n,0);assert.deepEqual(game.shipsMap(db,f.home.id),before);
  f.advance(730*24*HOUR);game.tickWorld(db);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM raids').get().n,0,'offline players get no queued assaults');
  f.meta('last_galaxy',0);game.snapshot(db,db.prepare('SELECT * FROM users WHERE id=?').get(f.empire.user_id));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM raids').get().n,1,'return creates one fresh encounter');
  f.advance(90001);game.tickWorld(db);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM raids').get().n,1);
});

test('PVE: defeated garrison pays once; attacks on the now-empty system return without XP or combat wins',t=>{
  const f=fixture(t),db=f.db;setRemnantFleet(db,f.system().id,{fighter:1});npc.tick(db);
  game.addShips(db,f.home.id,{fighter:50});
  const launch=()=>withTx(db,()=>game.sendFleet(db,f.empire,f.home,f.target,'attack',{fighter:20},{}));
  launch();db.exec('UPDATE fleets SET arrives_at=1');game.tickWorld(db);
  assert.equal(f.system().remnant,0);
  const report=JSON.parse(db.prepare("SELECT body FROM reports WHERE kind='combat' ORDER BY id DESC LIMIT 1").get().body);
  assert.deepEqual(report.defShips,{fighter:1});assert.equal(report.youWin,true);
  const xp=db.prepare('SELECT xp FROM empires WHERE id=?').get(f.empire.id).xp;
  launch();db.exec('UPDATE fleets SET arrives_at=1');game.tickWorld(db);
  assert.equal(db.prepare('SELECT xp FROM empires WHERE id=?').get(f.empire.id).xp,xp);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reports WHERE kind='combat'").get().n,1);
  assert.ok(db.prepare("SELECT id FROM reports WHERE title LIKE 'Ziel bereits frei:%'").get());
  assert.ok(npc.status(db,f.system().id).liberatedUntil>f.at());
});

test('PVE: migration recovers previously cleared systems and preserves its protection across restarts',t=>{
  const f=fixture(t);let db=f.db;
  db.prepare('UPDATE systems SET remnant=0 WHERE id=?').run(f.system().id);setRemnantFleet(db,f.system().id,{});
  game.addReport(db,f.empire.id,'combat','Legacy victory',{planetId:f.target.id,remnant:true,pirate:19,viewer:'attacker',youWin:true});
  npc.tick(db);const deadline=npc.status(db,f.system().id).liberatedUntil;assert.equal(deadline,f.at()+72*HOUR);
  f.advance(24*HOUR);db=f.reopen();npc.tick(db);assert.equal(npc.status(db,f.system().id).liberatedUntil,deadline);
  f.advance(48*HOUR);npc.tick(db);assert.equal(f.system().pirate,20);
});

test('PVE: travelling attacks freeze regeneration; raid rewards use the level saved on spawn',t=>{
  const f=fixture(t),db=f.db;npc.tick(db);game.addShips(db,f.home.id,{fighter:30});
  const remaining={fighter:1};npc.recordBattle(db,f.system(),remaining,false);setRemnantFleet(db,f.system().id,remaining);
  withTx(db,()=>game.sendFleet(db,f.empire,f.home,f.target,'attack',{fighter:1},{}));
  f.advance(25*HOUR);npc.tick(db);assert.deepEqual(remnantFleet(db,f.system().id),remaining);
  db.exec('DELETE FROM fleets');f.advance(90001);npc.tick(db);assert.equal(remnantFleet(db,f.system().id).fighter,4);
  const id=Number(db.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind,expires_at,level) VALUES(?,'{\"fighter\":1}',?,'pirates',?,7)").run(f.home.id,f.at()+HOUR,f.at()+3*HOUR).lastInsertRowid);
  let rewarded=null;t.mock.method(pirates,'rollLoot',(level)=>{rewarded=level;return {loot:{},ships:{},defenses:{},xp:0,title:'Test reward',text:''};});
  db.prepare('UPDATE empires SET xp=9000000 WHERE id=?').run(f.empire.id);
  game.defendRaid(db,f.empire,id,[]);assert.equal(rewarded,7);
  assert.equal(db.prepare('SELECT id FROM raids WHERE id=?').get(id),undefined);
});
