"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {openDb}=require("../src/db"),game=require("../src/game"),{withTx}=require("../src/tx"),{ensurePlayer}=require("../src/seed");
function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nexus-fleet-")),db=openDb(path.join(dir,"test.db"));
 t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 ensurePlayer(db,"Pilot","secret123","Pilot Empire","#00ffff");
 const empire=db.prepare("SELECT * FROM empires LIMIT 1").get(),home=db.prepare("SELECT * FROM planets WHERE empire_id=?").get(empire.id);
 db.prepare("UPDATE planets SET helium=8000,metal=8000,energy=8000,titan=4000 WHERE id=?").run(home.id);
 for(const [id,level] of [["shipyard",3],["colony_dock",1],["command",4]]) db.prepare("INSERT INTO buildings(planet_id,building_id,level) VALUES(?,?,?) ON CONFLICT(planet_id,building_id) DO UPDATE SET level=excluded.level").run(home.id,id,level);
 db.prepare("INSERT INTO research(empire_id,tech_id,level) VALUES(?,'colonization',3)").run(empire.id);
 db.prepare("UPDATE systems SET pirate=0,remnant=0 WHERE id=?").run(home.system_id);
 const target=db.prepare("SELECT * FROM planets WHERE empire_id IS NULL AND system_id=? LIMIT 1").get(home.system_id);
 assert.ok(target);return {db,empire,home:db.prepare("SELECT * FROM planets WHERE id=?").get(home.id),target};
}
test("colonization launches real colony ship, consumes exactly one and deployment moves ships",t=>{
 const {db,empire,home,target}=fixture(t);
 game.addShips(db,home.id,{colony:1,fighter:2});
 const before=game.shipsMap(db,home.id);
 withTx(db,()=>game.sendFleet(db,empire,home,target,"colonize",{colony:1},{}));
 db.exec("UPDATE fleets SET arrives_at=1");game.tickWorld(db);
 assert.equal(db.prepare("SELECT empire_id FROM planets WHERE id=?").get(target.id).empire_id,empire.id);
 assert.equal(game.shipsMap(db,home.id).colony||0,(before.colony||0)-1);
 const colony=db.prepare("SELECT * FROM planets WHERE id=?").get(target.id);
 withTx(db,()=>game.sendFleet(db,empire,home,colony,"deploy",{fighter:2},{}));
 db.exec("UPDATE fleets SET arrives_at=1");game.tickWorld(db);
 assert.equal(game.shipsMap(db,target.id).fighter,2);
 assert.equal(game.shipsMap(db,home.id).fighter,(before.fighter||0)-2);
});
test("unengaged raids cannot silently consume ships; engaged raid and its report are atomic",t=>{
 const {db,empire,home}=fixture(t);game.addShips(db,home.id,{fighter:8});
 const before=game.shipsMap(db,home.id);
 const raid=db.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind) VALUES(?,?,1,'pirates')").run(home.id,JSON.stringify({fighter:80}));
 game.tickWorld(db);assert.deepEqual(game.shipsMap(db,home.id),before);
 db.prepare("INSERT INTO raid_engagements VALUES(?,?)").run(Number(raid.lastInsertRowid),Date.now());
 game.tickWorld(db);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM raids WHERE id=?").get(Number(raid.lastInsertRowid)).n,0);
 const report=db.prepare("SELECT * FROM reports WHERE empire_id=? AND kind='combat' ORDER BY id DESC LIMIT 1").get(empire.id);
 assert.ok(report);assert.equal(JSON.parse(report.body).planetId,home.id);
 for(let n=0;n<220;n++) game.addReport(db,empire.id,"event","Other event",{text:"test"});
 assert.ok(db.prepare("SELECT id FROM reports WHERE id=?").get(report.id),"Combat report survives unrelated event traffic");
});

test("fully funded alliance supply grid starts once and its queue is visible to members",t=>{
 const {db,empire,target}=fixture(t),social=require("../src/social");
 const alliance=social.createAlliance(db,empire,"TST","Test Alliance","","#00ffff");
 db.prepare("UPDATE planets SET empire_id=?,alliance_id=? WHERE id=?").run(empire.id,alliance.id,target.id);
 const planet=db.prepare("SELECT * FROM planets WHERE id=?").get(target.id);
 db.prepare("INSERT INTO alliance_research(alliance_id,research_id,metal,helium,titan,energy,crystal) VALUES(?,'supply_grid',100000,70000,35000,50000,25000)").run(alliance.id);
 withTx(db,()=>game.enqueueAllianceResearch(db,empire,planet,"supply_grid"));
 assert.throws(()=>withTx(db,()=>game.enqueueAllianceResearch(db,empire,planet,"supply_grid")),/läuft bereits/);
 ensurePlayer(db,"Member","secret123","Member Empire","#ffffff");
 const member=db.prepare("SELECT * FROM users WHERE username='Member'").get();
 const memberEmpire=db.prepare("SELECT id FROM empires WHERE user_id=?").get(member.id);
 db.prepare("INSERT INTO alliance_members(alliance_id,empire_id,rank,joined_at) VALUES(?,?,'member',?)").run(alliance.id,memberEmpire.id,Date.now());
 assert.ok(game.snapshot(db,member).queue.some(q=>q.kind==="ally_research"));
 db.exec("UPDATE queue SET completes_at=1 WHERE kind='ally_research'");game.tickWorld(db);
 assert.equal(db.prepare("SELECT level FROM alliance_research WHERE alliance_id=? AND research_id='supply_grid'").get(alliance.id).level,1);
});

test("overflow and later recovery are retained and recorded in the fleet ledger",t=>{
 const {db,home}=fixture(t),hangar=require("../src/hangar");
 const before=Object.values(game.shipsMap(db,home.id)).reduce((n,c)=>n+c,0);
 game.addShips(db,home.id,{fighter:150});
 const total=()=>Object.values(game.shipsMap(db,home.id)).reduce((n,c)=>n+c,0)+Object.values(hangar.reserveMap(db,home.id)).reduce((n,c)=>n+c,0);
 assert.equal(total(),before+150);
 assert.ok(db.prepare("SELECT id FROM fleet_ledger WHERE planet_id=? AND cause LIKE 'Reserve:%'").get(home.id));
 db.prepare("UPDATE buildings SET level=10 WHERE planet_id=? AND building_id='shipyard'").run(home.id);hangar.reconcile(db,home.id);
 assert.equal(total(),before+150);assert.deepEqual(hangar.reserveMap(db,home.id),{});
});
