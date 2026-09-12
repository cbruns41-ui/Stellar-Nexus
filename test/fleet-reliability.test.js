"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),express=require("express");
const {openDb}=require("../src/db"),game=require("../src/game"),{withTx}=require("../src/tx"),{ensurePlayer}=require("../src/seed"),{attachRoutes}=require("../src/routes");
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
test("research and archive are locked to the home planet and apply empire-wide",t=>{
 const {db,empire,home,target}=fixture(t);
 game.addShips(db,home.id,{colony:1});
 withTx(db,()=>game.sendFleet(db,empire,home,target,"colonize",{colony:1},{}));
 db.exec("UPDATE fleets SET arrives_at=1");game.tickWorld(db);
 const colony=db.prepare("SELECT * FROM planets WHERE id=?").get(target.id);
 assert.equal(colony.empire_id,empire.id);
 db.prepare("INSERT INTO buildings(planet_id,building_id,level) VALUES(?,?,?) ON CONFLICT(planet_id,building_id) DO UPDATE SET level=excluded.level").run(home.id,"archive",1);
 db.prepare("INSERT INTO buildings(planet_id,building_id,level) VALUES(?,?,?) ON CONFLICT(planet_id,building_id) DO UPDATE SET level=excluded.level").run(colony.id,"command",4);
 db.prepare("UPDATE planets SET metal=8000,helium=8000,energy=8000,titan=8000,crystal=8000 WHERE id IN (?,?)").run(home.id,colony.id);
 assert.throws(()=>game.enqueueResearch(db,empire,colony,"extraction"),/Hauptplanet|alle Kolonien/);
 assert.throws(()=>game.enqueueBuilding(db,empire,colony,"archive"),/Hauptplanet|Forschungsarchiv/);
 const started=game.enqueueResearch(db,empire,home,"extraction");
 assert.ok(started.completesAt);
 const user=db.prepare("SELECT * FROM users WHERE username='Pilot'").get();
 const colonySnap=game.snapshot(db,user,colony.id);
 const homeSnap=game.snapshot(db,user,home.id);
 assert.equal(colonySnap.planet.isHome,false);
 assert.equal(homeSnap.planet.isHome,true);
 assert.equal(colonySnap.planets.find(p=>p.id===home.id).isHome,true);
 assert.equal(homeSnap.techs.extraction||0,0);
});

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

test("displayed ship resource maximum agrees with the server at the purchase boundary",async t=>{
 const {db,empire,home}=fixture(t),{shipBudget}=await import('../public/js/ship-budget.mjs');
 const {SHIPS,RESOURCE_IDS}=require('../src/catalog');
 for(const qty of [0,-1,1.5,51,NaN])assert.throws(()=>withTx(db,()=>game.enqueueShip(db,empire,home,'fighter',qty)),/1 bis 50/);
 const cost=SHIPS.fighter.cost,resources=Object.fromEntries(RESOURCE_IDS.map(id=>[id,(cost[id]||0)*3]));
 for(const id of RESOURCE_IDS) db.prepare(`UPDATE planets SET ${id}=? WHERE id=?`).run(resources[id],home.id);
 const planet=db.prepare('SELECT * FROM planets WHERE id=?').get(home.id);
 const budget=shipBudget(cost,resources,{cap:110,stationed:20});
 assert.equal(budget.affordable,3);
 assert.throws(()=>withTx(db,()=>game.enqueueShip(db,empire,planet,'fighter',4)),/Ressourcen/);
 withTx(db,()=>game.enqueueShip(db,empire,planet,'fighter',budget.buildable));
 assert.equal(db.prepare("SELECT qty FROM queue WHERE kind='ship' AND planet_id=?").get(home.id).qty,3);
});
test("unengaged raids cannot silently consume ships; engaged raid and its report are atomic",t=>{
 const {db,empire,home}=fixture(t);game.addShips(db,home.id,{fighter:8});
 const before=game.shipsMap(db,home.id);
 const raid=db.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind,expires_at) VALUES(?,?,1,'pirates',unixepoch('now')*1000+7200000)").run(home.id,JSON.stringify({fighter:80}));
 game.tickWorld(db);assert.deepEqual(game.shipsMap(db,home.id),before);
 db.prepare("INSERT INTO raid_engagements VALUES(?,?)").run(Number(raid.lastInsertRowid),Date.now());
 game.tickWorld(db);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM raids WHERE id=?").get(Number(raid.lastInsertRowid)).n,0);
 const report=db.prepare("SELECT * FROM reports WHERE empire_id=? AND kind='combat' ORDER BY id DESC LIMIT 1").get(empire.id);
 assert.ok(report);assert.equal(JSON.parse(report.body).planetId,home.id);
 for(let n=0;n<220;n++) game.addReport(db,empire.id,"event","Other event",{text:"test"});
 assert.ok(db.prepare("SELECT id FROM reports WHERE id=?").get(report.id),"Combat report survives unrelated event traffic");
});

test('overdue raid accepts reinforcement once and resolves with a loss report at arrival',t=>{
 const {db,empire,home,target}=fixture(t);
 db.prepare('UPDATE planets SET empire_id=? WHERE id=?').run(empire.id,target.id);
 game.addShips(db,home.id,{fighter:8});
 const before=game.shipsMap(db,home.id).fighter;
 const id=Number(db.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind,expires_at) VALUES(?,?,1,'pirates',unixepoch('now')*1000+7200000)").run(target.id,JSON.stringify({fighter:80})).lastInsertRowid);
 const result=game.defendRaid(db,empire,id,[{planetId:home.id,ships:{fighter:8}}]);
 assert.equal(result.launched.length,1);assert.ok(result.commonArrival>Date.now());
 assert.equal(game.shipsMap(db,home.id).fighter,before-8);
 assert.equal(game.defendRaid(db,empire,id,[{planetId:home.id,ships:{fighter:8}}]).launched.length,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM fleets').get().n,1);
 assert.equal(db.prepare('SELECT arrives_at FROM raids WHERE id=?').get(id).arrives_at,result.commonArrival);
 db.exec('UPDATE fleets SET arrives_at=1;UPDATE raids SET arrives_at=1');game.tickWorld(db);
 assert.equal(db.prepare('SELECT id FROM raids WHERE id=?').get(id),undefined);
 const report=db.prepare("SELECT body FROM reports WHERE kind='combat' AND empire_id=? ORDER BY id DESC LIMIT 1").get(empire.id);
 assert.equal(JSON.parse(report.body).planetId,target.id);assert.ok(JSON.parse(report.body).defLost.fighter>0);
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

test('alliance funding persists partial deposits and spends only the missing amount on start',t=>{
 const {db,empire,target}=fixture(t),social=require('../src/social');
 const alliance=social.createAlliance(db,empire,'FND','Funding Alliance','','#00ffff');
 db.prepare('UPDATE planets SET empire_id=?,alliance_id=?,metal=100,helium=0,titan=0,energy=0,crystal=0 WHERE id=?').run(empire.id,alliance.id,target.id);
 const planet=()=>db.prepare('SELECT * FROM planets WHERE id=?').get(target.id);
 const paid=game.fundAllianceResearch(db,empire,planet(),'supply_grid');assert.equal(paid.metal,100);
 assert.equal(planet().metal,0);
 assert.throws(()=>withTx(db,()=>game.enqueueAllianceResearch(db,empire,planet(),'supply_grid')),/Ressourcen/);
 let row=social.researchRows(db,alliance.id,empire.id).find(r=>r.id==='supply_grid');assert.equal(row.funded.metal,100);assert.ok(row.progress>0 && row.progress<1);
 for(const [id,n] of Object.entries(row.remaining))db.prepare(`UPDATE planets SET ${id}=? WHERE id=?`).run(n,target.id);
 withTx(db,()=>game.enqueueAllianceResearch(db,empire,planet(),'supply_grid'));
 assert.equal(planet().metal,0);assert.equal(social.researchRows(db,alliance.id,empire.id).find(r=>r.id==='supply_grid').funded.metal,100);
});

test("orbit fire keeps a personal highscore until it is beaten and lists it in ranks",t=>{
 const {db,empire,home}=fixture(t);
 db.prepare("UPDATE users SET is_admin=1 WHERE id=?").run(empire.user_id);
 const first=game.startOrbitSiege(db,empire,home);
 db.prepare("UPDATE orbit_siege_sessions SET started_at=? WHERE id=?").run(Date.now()-120000,first.id);
 const a=game.claimOrbitSiege(db,empire,first.id,5,20);
 assert.equal(a.best.waves,5);
 assert.equal(a.best.kills,20);
 assert.equal(a.best.improved,true);
 const second=game.startOrbitSiege(db,empire,home);
 db.prepare("UPDATE orbit_siege_sessions SET started_at=? WHERE id=?").run(Date.now()-120000,second.id);
 const b=game.claimOrbitSiege(db,empire,second.id,2,90);
 assert.equal(b.best.waves,5);
 assert.equal(b.best.improved,false);
 const third=game.startOrbitSiege(db,empire,home);
 db.prepare("UPDATE orbit_siege_sessions SET started_at=? WHERE id=?").run(Date.now()-120000,third.id);
 const c=game.claimOrbitSiege(db,empire,third.id,6,1);
 assert.equal(c.best.waves,6);
 assert.equal(c.best.improved,true);
 const me=game.listRanks(db).find(r=>r.id===empire.id);
 assert.equal(me.orbitWaves,6);
 assert.equal(me.orbitKills,1);
 assert.ok(me.orbitScore>5000);
});

test("admin can start orbit fire without the daily cap",t=>{
 const {db,empire,home}=fixture(t);
 db.prepare("UPDATE users SET is_admin=1 WHERE id=?").run(empire.user_id);
 const first=game.startOrbitSiege(db,empire,home);
 const second=game.startOrbitSiege(db,empire,home);
 const third=game.startOrbitSiege(db,empire,home);
 assert.ok(first.id && second.id && third.id);
 const orbitSiege=require("../src/orbitSiege");
 const status=orbitSiege.publicStatus(db,empire,home);
 assert.equal(status.unlimited,true);
 assert.ok(status.playsLeft>0);
});

test('orbit siege allows one run per day unless a bonus task is complete',t=>{
 const {db,empire,home}=fixture(t);
 const first=game.startOrbitSiege(db,empire,home);
 assert.ok(first.id);
 assert.throws(()=>game.startOrbitSiege(db,empire,home),/kein Einsatz|verbraucht|weiteren/);
 const row=db.prepare('SELECT orbit_siege FROM empires WHERE id=?').get(empire.id);
 const data=JSON.parse(row.orbit_siege);
 data.tasks=[{id:'mine_bonus',title:'Erz',blurb:'Mine',view:'infra',check:{type:'building',id:'matter_mine',min:2}}];
 db.prepare('UPDATE empires SET orbit_siege=? WHERE id=?').run(JSON.stringify(data),empire.id);
 empire.orbit_siege=JSON.stringify(data);
 db.prepare("INSERT INTO buildings(planet_id,building_id,level) VALUES(?,?,?) ON CONFLICT(planet_id,building_id) DO UPDATE SET level=excluded.level").run(home.id,'matter_mine',2);
 const again=game.startOrbitSiege(db,empire,home);
 assert.ok(again.id);
});

test('activity badge counts free slots and exposes rewards',t=>{
 const {db,home}=fixture(t);
 const user=db.prepare("SELECT * FROM users WHERE username='Pilot'").get();
 const snap=game.snapshot(db,user,home.id);
 assert.equal((snap.activities||[]).length,6);
 assert.ok((snap.activities||[]).every(a=>a.ready && !a.running && a.reward));
 assert.equal(snap.hints.activity,6);
});

test("galaxy payload exposes alliance members for the map filter",async t=>{
 const {db,empire,home}=fixture(t);
 const social=require("../src/social");
 ensurePlayer(db,"Ally","secret123","Ally Empire","#ff55aa");
 const ally=db.prepare("SELECT * FROM empires WHERE name='Ally Empire'").get();
 const allyHome=db.prepare("SELECT * FROM planets WHERE empire_id=?").get(ally.id);
 const created=social.createAlliance(db,empire,"NXS","Nexus Wing","", "#3ee8c4");
 db.prepare("INSERT INTO alliance_members(alliance_id,empire_id,rank,joined_at) VALUES(?,?,'member',?)").run(created.id,ally.id,Date.now());
 const app=express();app.use(express.json());attachRoutes(app,db);
 const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const login=await fetch(base+"/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:"Pilot",password:"secret123"})});
 assert.equal(login.status,200);
 const cookie=login.headers.get("set-cookie");
 const galaxy=await fetch(base+"/galaxy",{headers:{cookie}}).then((r)=>r.json());
 assert.equal(galaxy.self.allianceId,created.id);
 const ownSys=galaxy.systems.find((s)=>s.id===home.system_id);
 const allySys=galaxy.systems.find((s)=>s.id===allyHome.system_id);
 assert.ok(ownSys.owners.some((o)=>o.empireId===empire.id && o.allianceId===created.id));
 assert.ok(allySys.owners.some((o)=>o.empireId===ally.id && o.allianceId===created.id));
});

test("orbit-fire start alias returns a session instead of 404",async t=>{
 const {db,home}=fixture(t);
 const app=express();app.use(express.json());attachRoutes(app,db);
 const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const login=await fetch(base+"/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:"Pilot",password:"secret123"})});
 assert.equal(login.status,200);
 const cookie=login.headers.get("set-cookie");
 const fire=await fetch(base+"/orbit-fire/start",{method:"POST",headers:{"content-type":"application/json",cookie},body:JSON.stringify({planetId:home.id})});
 assert.equal(fire.status,200);
 const body=await fire.json();
 assert.ok(body.orbitSiege?.id);
 assert.equal(body.orbitFire?.id,body.orbitSiege.id);
 const missing=await fetch(base+"/orbit-missing/start",{method:"POST",headers:{"content-type":"application/json",cookie},body:"{}"});
 assert.equal(missing.status,404);
});

test('colony slots include outbound missions; rejected launch keeps ships and fuel',t=>{
 const {db,empire,home,target}=fixture(t);
 db.prepare("UPDATE research SET level=1 WHERE empire_id=? AND tech_id='colonization'").run(empire.id);
 game.addShips(db,home.id,{colony:2});
 withTx(db,()=>game.sendFleet(db,empire,home,target,'colonize',{colony:1},{}));
 const other=db.prepare('SELECT * FROM planets WHERE empire_id IS NULL AND id!=? LIMIT 1').get(target.id);
 db.prepare('UPDATE planets SET system_id=? WHERE id=?').run(home.system_id,other.id);other.system_id=home.system_id;
 const stock=game.shipsMap(db,home.id),fuel=db.prepare('SELECT helium FROM planets WHERE id=?').get(home.id).helium;
 assert.throws(()=>withTx(db,()=>game.sendFleet(db,empire,home,other,'colonize',{colony:1},{})),/Planet-Limit.*1 Kolonisationen unterwegs/);
 assert.deepEqual(game.shipsMap(db,home.id),stock);assert.equal(db.prepare('SELECT helium FROM planets WHERE id=?').get(home.id).helium,fuel);
 db.exec('UPDATE fleets SET arrives_at=1');game.tickWorld(db);
 const report=db.prepare("SELECT id,body FROM reports WHERE kind='colony' ORDER BY id DESC LIMIT 1").get(),body=JSON.parse(report.body);
 assert.equal(body.targetPlanetId,target.id);assert.equal(body.shipsConsumed.colony,1);
 assert.ok(db.prepare('SELECT id FROM fleet_ledger WHERE report_id=? AND planet_id=? AND before_count-after_count=1').get(report.id,home.id));
});

test('raid reinforcement can exceed destination cap, fights in orbit and returns to source',t=>{
 const {db,empire,home,target}=fixture(t);
 db.prepare('UPDATE planets SET empire_id=? WHERE id=?').run(empire.id,target.id);
 game.addShips(db,home.id,{fighter:90});game.addShips(db,target.id,{fighter:60});
 const originalHome=game.shipsMap(db,home.id),originalTarget=game.shipsMap(db,target.id);
 const raid=Number(db.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind,expires_at) VALUES(?,?,1,'pirates',unixepoch('now')*1000+7200000)").run(target.id,JSON.stringify({fighter:20})).lastInsertRowid);
 const defense=game.defendRaid(db,empire,raid,[{planetId:home.id,ships:{fighter:90}}]);assert.equal(defense.launched.length,1);
 assert.deepEqual(game.shipsMap(db,target.id),originalTarget);
 db.exec('UPDATE fleets SET arrives_at=1;UPDATE raids SET arrives_at=1');game.tickWorld(db);
 const report=JSON.parse(db.prepare("SELECT body FROM reports WHERE kind='combat' ORDER BY id DESC LIMIT 1").get().body);
 assert.equal(report.defShips.fighter,originalTarget.fighter+90);
 const party=report.defenders.find(p=>p.originPlanetId===home.id);assert.ok(party);assert.equal(party.left.fighter+party.lost.fighter,90);
 assert.ok(Object.values(game.shipsMap(db,target.id)).reduce((a,n)=>a+n,0)<=80);
 const returning=db.prepare('SELECT * FROM fleets WHERE raid_id=?').get(raid);
 if(party.left.fighter){assert.equal(returning.is_return,1);assert.equal(returning.target_planet_id,home.id);}
 db.exec('UPDATE fleets SET arrives_at=1');game.tickWorld(db);
 assert.equal(game.shipsMap(db,home.id).fighter,originalHome.fighter-party.lost.fighter);
});

test('ordinary intercept waves cannot collect a waiting raid reinforcement',t=>{
 const {db,empire,home,target}=fixture(t);
 db.prepare('UPDATE planets SET empire_id=? WHERE id=?').run(empire.id,target.id);game.addShips(db,home.id,{fighter:8});
 const raid=Number(db.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind,expires_at) VALUES(?,?,1,'pirates',unixepoch('now')*1000+7200000)").run(target.id,'{"fighter":5}').lastInsertRowid);
 const sent=game.defendRaid(db,empire,raid,[{planetId:home.id,ships:{fighter:8}}]).launched[0];
 db.prepare('UPDATE fleets SET arrives_at=1 WHERE id=?').run(sent.fleetId);
 db.prepare("INSERT INTO fleets(empire_id,origin_planet_id,target_planet_id,mission,ships,cargo,departed_at,arrives_at,is_return) VALUES(?,?,?,'intercept','{\"probe\":1}','{}',0,1,0)").run(empire.id,home.id,target.id);
 game.tickWorld(db);
 const reinforcement=db.prepare('SELECT * FROM fleets WHERE id=?').get(sent.fleetId);
 assert.equal(reinforcement.is_return,0);assert.deepEqual(JSON.parse(reinforcement.ships),{fighter:8});
});
