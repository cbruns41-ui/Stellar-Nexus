"use strict";
// Read the local world's aggregate counts; reproduce mechanics only in a disposable database.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {openDb,resolveDbPath}=require('../src/db'),{ensurePlayer}=require('../src/seed');
const game=require('../src/game'),galaxy=require('../src/galaxy'),pirates=require('../src/pirates'),season=require('../src/sectorSeason');
const count=ships=>Object.values(ships).reduce((a,n)=>a+n,0);
const local=resolveDbPath();
if(fs.existsSync(local)){
 const db=new DatabaseSync(local,{readOnly:true});
 try{console.log('Local world (read only)',db.prepare("SELECT COUNT(*) systems,SUM(remnant=1) guardedSystems,SUM(remnant=1 AND COALESCE(pirate,0)=0) pureRemnants,SUM(COALESCE(pirate,0)>0) pirateSystems FROM systems").get());}
 finally{db.close();}
}
const file=path.resolve(__dirname,`../tmp/pve-audit-${process.pid}.db`),db=openDb(file);
const realNow=Date.now,realRandom=Math.random;
try{
 ensurePlayer(db,'AuditPilot','audit-fixture-only','Audit Empire','#00ffff');
 const empire=db.prepare('SELECT * FROM empires LIMIT 1').get(),user=db.prepare('SELECT * FROM users WHERE id=?').get(empire.user_id);
 const home=db.prepare('SELECT * FROM planets WHERE empire_id=?').get(empire.id);
 db.prepare("INSERT INTO buildings VALUES(?,'shipyard',3) ON CONFLICT(planet_id,building_id) DO UPDATE SET level=3").run(home.id);
 db.prepare('UPDATE planets SET helium=50000 WHERE id=?').run(home.id);game.addShips(db,home.id,{fighter:60});
 const target=db.prepare(`SELECT p.* FROM planets p JOIN links l ON (l.a=p.system_id AND l.b=?) OR (l.b=p.system_id AND l.a=?) WHERE NOT EXISTS(SELECT 1 FROM planets x WHERE x.system_id=p.system_id AND x.empire_id IS NOT NULL) LIMIT 1`).get(home.system_id,home.system_id);
 assert.ok(target);
 db.prepare("UPDATE systems SET remnant=1,pirate=0,warlord='' WHERE id=?").run(target.system_id);
 galaxy.setRemnantFleet(db,target.system_id,{fighter:1});
 db.prepare("INSERT OR REPLACE INTO world_meta VALUES('last_galaxy',?)").run(String(Date.now()));
 const attack=()=>{
   const origin=db.prepare('SELECT * FROM planets WHERE id=?').get(home.id);
   const sent=game.sendFleet(db,empire,origin,target,'attack',{fighter:40},{});
   db.prepare('UPDATE fleets SET arrives_at=1 WHERE id=?').run(sent.fleetId);game.tickWorld(db);
   const report=db.prepare("SELECT body FROM reports WHERE empire_id=? AND kind='combat' ORDER BY id DESC LIMIT 1").get(empire.id);
   db.exec('UPDATE fleets SET arrives_at=1 WHERE is_return=1');game.tickWorld(db);
   return JSON.parse(report.body);
 };
 const cleared=attack();assert.equal(cleared.youWin,true);
 assert.equal(db.prepare('SELECT remnant FROM systems WHERE id=?').get(target.system_id).remnant,0);
 const before=season.data(db,empire).score,empty=attack(),after=season.data(db,empire).score;
 assert.equal(count(empty.defShips),0);assert.equal(empty.youWin,true);assert.equal(after-before,24);
 console.log('Repeated attack on cleared empty planet',{defenders:count(empty.defShips),win:empty.youWin,seasonPoints:after-before,loot:empty.loot});
 const future=realNow()+2*86400000;Date.now=()=>future;Math.random=()=>0.99;
 game.tickWorld(db);
 assert.equal(db.prepare('SELECT remnant FROM systems WHERE id=?').get(target.system_id).remnant,0);
 assert.equal(count(galaxy.remnantFleet(db,target.system_id)),0);
 console.log('After 48 hours and a world tick',{targetGuard:0,totalGuards:db.prepare('SELECT COUNT(*) n FROM systems WHERE remnant=1').get().n});
 Date.now=realNow;Math.random=realRandom;
 db.prepare('UPDATE systems SET remnant=1,pirate=19 WHERE id=?').run(target.system_id);
 const guard=pirates.garrisonFor(19);galaxy.setRemnantFleet(db,target.system_id,guard);
 const preview=game.previewCombat(db,empire,home,target,{fighter:1});
 assert.equal(count(preview.defShips),2*count(guard));
 console.log('Pirate level 19',{oneGarrison:guard,displayedGarrison:count(guard),actualCombatGarrison:count(preview.defShips)});
 galaxy.setRemnantFleet(db,target.system_id,{fighter:1});pirates.grow(db);
 const level=db.prepare('SELECT pirate FROM systems WHERE id=?').get(target.system_id).pirate;
 assert.deepEqual(galaxy.remnantFleet(db,target.system_id),pirates.garrisonFor(level));
 console.log('Damaged pirate garrison after one growth tick',{before:1,after:count(galaxy.remnantFleet(db,target.system_id)),level});
 const score=season.data(db,empire).score;db.prepare("DELETE FROM reports WHERE empire_id=? AND kind='combat'").run(empire.id);
 console.log('Deleting the two combat reports changes season score',{before:score,after:season.data(db,empire).score});
 assert.equal(score-season.data(db,empire).score,48);
 console.log('Season at audit date',season.windowAt(),season.TIERS);
 console.log('Audit reproductions passed; gameplay source and real player data unchanged.');
}finally{
 Date.now=realNow;Math.random=realRandom;db.close();
 for(const suffix of ['', '-wal', '-shm'])fs.rmSync(file+suffix,{force:true});
}
