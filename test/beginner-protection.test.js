'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openDb}=require('../src/db'),{ensurePlayer}=require('../src/seed'),game=require('../src/game'),fairplay=require('../src/fairplay'),settings=require('../src/settings');
const DAY=86400000;
function fixture(t){
  let at=Date.now();t.mock.method(Date,'now',()=>at);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-protection-')),db=openDb(path.join(dir,'test.db'));
  t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
  ensurePlayer(db,'Beginner','local-password','Beginner Empire','#00ffff');
  const empire=db.prepare('SELECT * FROM empires LIMIT 1').get(),user=db.prepare('SELECT * FROM users WHERE id=?').get(empire.user_id);
  const home=db.prepare('SELECT * FROM planets WHERE empire_id=?').get(empire.id);
  db.prepare('UPDATE planets SET founded_at=?,helium=100000 WHERE id=?').run(at-4*3600000,home.id);
  const tick=()=>{db.prepare("INSERT OR REPLACE INTO world_meta(key,value) VALUES('last_galaxy','0')").run();db.prepare('UPDATE empires SET last_seen=? WHERE id=?').run(at,empire.id);game.tickWorld(db);};
  return {db,empire,user,home,tick,advance:ms=>{at+=ms;},at:()=>at};
}
test('five-day shield blocks PvP and pirate spawns, expires exactly and supplies a deadline',t=>{
  const f=fixture(t),{db,empire,user,home}=f;
  ensurePlayer(db,'Veteran','local-password','Veteran Empire','#ff0000');const veteran=db.prepare("SELECT * FROM empires WHERE name='Veteran Empire'").get();
  assert.equal(fairplay.inspect(db,veteran,empire).newbie,true);
  f.tick();assert.equal(db.prepare('SELECT COUNT(*) n FROM raids WHERE target_planet_id=?').get(home.id).n,0);
  const s=game.snapshot(db,user,home.id);assert.equal(s.empire.newbieUntil,empire.created_at+5*DAY);assert.equal(s.empire.newbieLeft,5*DAY);
  f.advance(5*DAY-1);f.tick();assert.equal(db.prepare('SELECT COUNT(*) n FROM raids WHERE target_planet_id=?').get(home.id).n,0);
  f.advance(1);f.tick();assert.equal(db.prepare('SELECT COUNT(*) n FROM raids WHERE target_planet_id=?').get(home.id).n,1);
  assert.equal(game.snapshot(db,user,home.id).empire.newbie,false);
});
test('configured duration including zero is respected and fresh colonies keep their own three-hour raid shield',t=>{
  const f=fixture(t),{db,empire,home}=f;
  settings.set(db,{newbieDays:2});assert.equal(fairplay.newbieLeft(empire.created_at,db),2*DAY);
  settings.set(db,{newbieDays:0});assert.equal(fairplay.isNewbie(empire,db),false);
  db.prepare('UPDATE planets SET founded_at=? WHERE id=?').run(f.at(),home.id);
  f.tick();assert.equal(db.prepare('SELECT COUNT(*) n FROM raids').get().n,0);
  f.advance(3*3600000);f.tick();assert.equal(db.prepare('SELECT COUNT(*) n FROM raids').get().n,1);
});
test('legacy raids against a beginner disappear without combat or losses and cannot be confirmed',t=>{
  const f=fixture(t),{db,empire,user,home}=f;
  const id=Number(db.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind,expires_at) VALUES(?,'{\"fighter\":1000}',1,'pirates',?)").run(home.id,f.at()+7200000).lastInsertRowid);
  assert.throws(()=>game.defendRaid(db,empire,id,[]),/Anfängerschutz aktiv/);
  const before=game.shipsMap(db,home.id);f.tick();
  assert.deepEqual(game.shipsMap(db,home.id),before);
  assert.equal(game.snapshot(db,user,home.id).incoming.filter(x=>x.kind==='raid').length,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reports WHERE kind='combat'").get().n,0);
  assert.ok(db.prepare("SELECT id FROM reports WHERE json_extract(body,'$.newbieProtection')=1").get());
});
test('protection also cancels an already confirmed legacy raid and returns its reinforcements intact',t=>{
  const f=fixture(t),{db,empire,home}=f;
  db.prepare('UPDATE empires SET created_at=? WHERE id=?').run(f.at()-6*DAY,empire.id);
  const target=db.prepare('SELECT * FROM planets WHERE empire_id IS NULL AND system_id=? LIMIT 1').get(home.system_id);
  db.prepare('UPDATE planets SET empire_id=? WHERE id=?').run(empire.id,target.id);
  game.addShips(db,home.id,{fighter:20});
  const id=Number(db.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind,expires_at) VALUES(?,'{\"fighter\":1000}',1,'pirates',?)").run(target.id,f.at()+7200000).lastInsertRowid);
  const result=game.defendRaid(db,empire,id,[{planetId:home.id,ships:{fighter:8}}]);assert.equal(result.launched.length,1);
  db.prepare('UPDATE empires SET created_at=? WHERE id=?').run(f.at(),empire.id);
  db.prepare('UPDATE fleets SET arrives_at=1 WHERE raid_id=?').run(id);db.prepare('UPDATE raids SET arrives_at=1 WHERE id=?').run(id);
  f.tick();const back=db.prepare('SELECT * FROM fleets WHERE empire_id=? AND is_return=1').get(empire.id);
  assert.equal(JSON.parse(back.ships).fighter,8);assert.equal(back.target_planet_id,home.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM raid_engagements').get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reports WHERE kind='combat'").get().n,0);
});
