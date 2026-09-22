const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openDb}=require('../src/db'),{ensurePlayer}=require('../src/seed'),{withTx}=require('../src/tx');
const game=require('../src/game'),social=require('../src/social'),{RESOURCE_IDS}=require('../src/catalog');
function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-alliance-logistics-')),db=openDb(path.join(dir,'test.db'));
 t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 for(const name of ['Leader','Member','Outsider'])ensurePlayer(db,name,'secret123',name+' Empire','#00ffff');
 const [leader,member,outsider]=['Leader','Member','Outsider'].map(name=>db.prepare('SELECT e.* FROM empires e JOIN users u ON u.id=e.user_id WHERE u.username=?').get(name));
 const home=game.homePlanetOf(db,leader.id),memberHome=game.homePlanetOf(db,member.id);
 const alliance=social.createAlliance(db,leader,'QA','Logistics Alliance','','#00ffff');
 db.prepare("INSERT INTO alliance_members VALUES(?,?,'member',?)").run(alliance.id,member.id,Date.now());
 const target=db.prepare('SELECT * FROM planets WHERE empire_id IS NULL AND system_id=? LIMIT 1').get(home.system_id);
 db.prepare('UPDATE planets SET empire_id=?,alliance_id=?,metal=0,helium=0,titan=0,energy=0,crystal=0,diamond=0 WHERE id=?').run(leader.id,alliance.id,target.id);
 db.prepare('UPDATE planets SET system_id=? WHERE id=?').run(home.system_id,memberHome.id);
 for(const p of [home,memberHome]){db.prepare('UPDATE planets SET metal=1000000,helium=1000000,titan=1000000,energy=1000000,crystal=1000000,diamond=1000,last_tick=? WHERE id=?').run(Date.now(),p.id);game.addShips(db,p.id,{cargo:4});}
 const planet=id=>db.prepare('SELECT * FROM planets WHERE id=?').get(id),store=()=>planet(target.id);
 const send=(empire,origin,mission,cargo)=>withTx(db,()=>game.sendFleet(db,empire,planet(origin.id),store(),mission,{cargo:1},cargo));
 const arrive=id=>{db.prepare('UPDATE fleets SET arrives_at=1 WHERE id=?').run(id);game.tickWorld(db);};
 return {db,leader,member,outsider,home,memberHome,alliance,target,planet,store,send,arrive};
}
test('member delivers all resources to alliance storage once; transports return and helium cargo reserves fuel',t=>{
 const {db,leader,member,home,memberHome,store,send,arrive}=fixture(t);
 const cargo={metal:100,helium:20,titan:10,energy:30,crystal:15,diamond:1};
 const shipment=send(member,memberHome,'transport',cargo);
 assert.equal(store().metal,0);
 arrive(shipment.fleetId);
 for(const id of RESOURCE_IDS)assert.equal(store()[id],cargo[id]);
 arrive(shipment.fleetId);
 for(const id of RESOURCE_IDS)assert.equal(store()[id],cargo[id],'No duplicate cargo on return');
 assert.equal(db.prepare('SELECT id FROM fleets WHERE id=?').get(shipment.fleetId),undefined);
 db.prepare('UPDATE planets SET helium=100,last_tick=? WHERE id=?').run(Date.now(),home.id);
 const before=game.shipsMap(db,home.id);
 assert.throws(()=>send(leader,home,'transport',{helium:100}),/Fracht und Treibstoff/);
 assert.deepEqual(game.shipsMap(db,home.id),before);
 assert.ok(db.prepare('SELECT helium FROM planets WHERE id=?').get(home.id).helium>=100);
});
test('collection preserves requested cargo, rechecks access and never creates cargo on recall',t=>{
 const {db,leader,member,home,memberHome,target,store,send,arrive}=fixture(t);
 db.prepare('UPDATE planets SET metal=500,helium=100 WHERE id=?').run(target.id);
 assert.throws(()=>send(member,memberHome,'collect',{metal:80}),/Lagerzugang/);
 social.setPlanetAccess(db,leader,member.id,true);
 const collection=send(member,memberHome,'collect',{metal:80,helium:10});
 const outbound=db.prepare('SELECT * FROM fleets WHERE id=?').get(collection.fleetId);
 assert.equal(JSON.parse(outbound.cargo).metal,0);assert.equal(JSON.parse(outbound.cargo).requestedCargo.metal,80);
 arrive(collection.fleetId);
 assert.equal(store().metal,420);assert.equal(store().helium,90);
 assert.equal(JSON.parse(db.prepare('SELECT cargo FROM fleets WHERE id=?').get(collection.fleetId).cargo).metal,80);
 arrive(collection.fleetId);
 const recalled=send(leader,home,'collect',{metal:100});
 game.recallFleet(db,leader,recalled.fleetId);
 assert.equal(JSON.parse(db.prepare('SELECT cargo FROM fleets WHERE id=?').get(recalled.fleetId).cargo).metal,0);
 arrive(recalled.fleetId);assert.equal(store().metal,420);
 const revoked=send(member,memberHome,'collect',{metal:80});
 social.setPlanetAccess(db,leader,member.id,false);
 arrive(revoked.fleetId);
 assert.equal(store().metal,420);assert.equal(JSON.parse(db.prepare('SELECT cargo FROM fleets WHERE id=?').get(revoked.fleetId).cargo).metal,0);
});
test('alliance research uses shared funds, refunds once on cancellation and applies completed bonuses to every member',t=>{
 const {db,leader,member,outsider,alliance,target,store}=fixture(t);
 db.prepare('UPDATE planets SET metal=100 WHERE id=?').run(target.id);
 assert.throws(()=>game.fundAllianceResearch(db,member,store(),'supply_grid'),/Zugang/);
 game.fundAllianceResearch(db,leader,store(),'supply_grid');
 assert.equal(store().metal,0);
 const research=()=>social.researchRows(db,alliance.id,leader.id).find(r=>r.id==='supply_grid');
 assert.equal(research().funded.metal,100);
 for(const [id,n] of Object.entries(research().remaining))db.prepare(`UPDATE planets SET ${id}=? WHERE id=?`).run(n,target.id);
 withTx(db,()=>game.enqueueAllianceResearch(db,leader,store(),'supply_grid'));
 assert.equal(research().progress,1);assert.equal(store().metal,0);
 const job=db.prepare("SELECT id FROM queue WHERE kind='ally_research'").get();
 assert.throws(()=>withTx(db,()=>game.enqueueAllianceResearch(db,leader,store(),'warp_network')),/läuft bereits/);
 assert.throws(()=>game.cancelQueue(db,member,job.id),/Berechtigung/);
 social.setPlanetAccess(db,leader,member.id,true);
 game.cancelQueue(db,member,job.id);
 assert.equal(store().metal,50000);assert.equal(research().funded.metal,0);
 assert.throws(()=>game.cancelQueue(db,member,job.id),/nicht gefunden/);
 assert.throws(()=>withTx(db,()=>game.enqueueAllianceResearch(db,leader,store(),'supply_grid')),/Nicht genug Ressourcen/);
 for(const def of Object.values(social.ALLIANCE_RESEARCH)) {
   for(const [id,n] of Object.entries(def.cost))db.prepare(`UPDATE planets SET ${id}=? WHERE id=?`).run(n,target.id);
   withTx(db,()=>game.enqueueAllianceResearch(db,member,store(),def.id));
   db.prepare("UPDATE queue SET completes_at=1 WHERE planet_id=? AND kind='ally_research'").run(target.id);
   game.tickWorld(db);
   assert.equal(social.allianceBonuses(db,leader.id)[def.effect],def.perLevel);
   assert.equal(social.allianceBonuses(db,member.id)[def.effect],def.perLevel);
   assert.equal(social.allianceBonuses(db,outsider.id)[def.effect],0);
 }
});
