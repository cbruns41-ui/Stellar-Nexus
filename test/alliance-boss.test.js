"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),express=require("express");
const {bossFixture}=require("../scripts/lib/boss-fixture.cjs"),boss=require("../src/allianceBoss"),{attachRoutes}=require("../src/routes"),{createSession}=require("../src/auth");
function fixture(t){const f=bossFixture();t.after(()=>f.close());return f;}
async function replay(config,seconds=1,ratio=1){
 const sim=await import("../public/demos/nemesis/combat.mjs"),s=sim.createCombat(),frames=[];sim.configureCombat(s,config);sim.startCombat(s);s.viewRatio=ratio;
 for(let n=0;n<Math.ceil(seconds*60)&&s.mode==="playing";n++){
  const target=sim.weakpoints(s)[1],direction=s.attack&&!s.attack.done&&s.attack.t>.65&&s.dodgeCooldown===0?2:0;
  s.aim={x:target.x,y:target.y};const f=[1/60,1,0,target.x,target.y,direction,ratio];frames.push(f);if(direction)sim.dodge(s);sim.stepCombat(s,1/60,{fire:true,move:0});s.events.length=0;
 }return {frames,state:s};
}
test("NEMESIS: attempts are reserved on start, global per commander/day, including abandoned sessions",t=>{
 const {db,alliance,empires:[a,b]}=fixture(t),now=Date.now();
 const first=boss.start(db,alliance.id,a.id,now);assert.equal(first.attemptsLeft,1);
 boss.start(db,alliance.id,a.id,now);assert.throws(()=>boss.start(db,alliance.id,a.id,now),/zwei Feuerfreigaben/);
 assert.equal(boss.start(db,alliance.id,b.id,now).attemptsLeft,1);
 db.prepare("UPDATE alliance_bosses SET hp=0,defeated_at=1").run();assert.throws(()=>boss.start(db,alliance.id,a.id,now),/zwei Feuerfreigaben/);
 assert.equal(boss.start(db,alliance.id,a.id,now+86400000).attemptsLeft,1);
});
test("NEMESIS: legacy hits and alliance changes cannot reset daily releases",t=>{
 const {db,alliance,empires:[a,b,c]}=fixture(t),social=require("../src/social"),now=Date.now();
 boss.start(db,alliance.id,a.id,now);
 db.prepare("INSERT INTO alliance_boss_hits(alliance_id,week,boss_level,empire_id,day,damage,created_at) VALUES(?,?,1,?,?,1,?)").run(alliance.id,"old",a.id,boss.dayKey(now),now);
 const second=social.createAlliance(db,c,"TWO","Second","","#ffffff");
 db.prepare("UPDATE alliance_members SET alliance_id=? WHERE empire_id=?").run(second.id,a.id);
 assert.throws(()=>boss.start(db,second.id,a.id,now),/zwei Feuerfreigaben/);
 assert.throws(()=>boss.start(db,alliance.id,a.id,now),/gehörst nicht/);
});
test("NEMESIS: persistent level does not reset with week or heal after recruitment",t=>{
 const {db,alliance,empires:[a,b,c]}=fixture(t),first=boss.publicBoss(db,alliance.id,a.id);
 db.prepare("UPDATE alliance_bosses SET week='2020-W01',hp=hp-123").run();
 db.prepare("INSERT INTO alliance_members(alliance_id,empire_id,rank,joined_at) VALUES(?,?,'member',0)").run(alliance.id,c.id);
 const next=boss.publicBoss(db,alliance.id,a.id);assert.equal(next.level,1);assert.equal(next.hp,first.hp-123);assert.equal(next.maxHp,first.maxHp);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM alliance_bosses").get().n,1);
});
test("NEMESIS: server replay matches scaled client hits, armor, shield and mobile geometry",async t=>{
 const {db,alliance,empires:[a]}=fixture(t),now=Date.now(),session=boss.start(db,alliance.id,a.id,now),run=await replay(session.config,4,1.44);
 const result=await boss.finish(db,a.id,session.id,run.frames,now+5000);
 assert.equal(result.damage,run.state.damage);assert.equal(result.hits,run.state.hits);assert.equal(result.shield,run.state.shield);
 assert.deepEqual(JSON.parse(db.prepare("SELECT armor FROM alliance_bosses").get().armor),run.state.armor);
 assert.equal(boss.publicBoss(db,alliance.id,a.id).attemptsLeft,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM alliance_boss_rewards").get().n,0);
});
test("NEMESIS: complete victory automatically rewards every member once, sends receipts and advances immediately",async t=>{
 const {db,alliance,empires:[a,b,c]}=fixture(t),now=Date.now(),first=boss.publicBoss(db,alliance.id,a.id);
 const resources=id=>db.prepare("SELECT metal,energy,crystal,helium,titan,diamond FROM planets WHERE empire_id=? AND IFNULL(alliance_id,0)=0 ORDER BY id LIMIT 1").get(id);
 const before=[resources(a.id),resources(b.id),resources(c.id)];
 db.prepare("UPDATE alliance_bosses SET hp=1,armor='[0,0]'").run();
 const session=boss.start(db,alliance.id,a.id,now),run=await replay(session.config);
 const result=await boss.finish(db,a.id,session.id,run.frames,now+1000);assert.equal(result.defeated,true);assert.equal(result.damage,1);assert.deepEqual(result.reward,first.reward);
 for(const [i,empire] of [a,b].entries())for(const [key,value] of Object.entries(first.reward))assert.equal(resources(empire.id)[key],before[i][key]+value);
 assert.deepEqual(resources(c.id),before[2]);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reports WHERE kind='alliance_boss'").get().n,2);
 const mail=JSON.parse(db.prepare("SELECT body FROM reports WHERE empire_id=? AND kind='alliance_boss'").get(b.id).body);assert.deepEqual(mail.loot,first.reward);assert.match(mail.text,/automatisch/);assert.equal(mail.bossReward,undefined);
 const next=boss.publicBoss(db,alliance.id,a.id);assert.equal(next.level,2);assert.ok(next.hp>=Math.ceil(first.maxHp*1.7));for(const [k,v] of Object.entries(first.reward))assert.ok(next.reward[k]>=Math.ceil(v*1.25));
 const duplicate=await boss.finish(db,a.id,session.id,[],now+2000);assert.deepEqual(duplicate,result);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM alliance_boss_rewards").get().n,2);
 assert.equal(resources(b.id).metal,before[1].metal+first.reward.metal);
 // A full warehouse must not silently erase the advertised reward at the next tick.
 const game=require('../src/game');db.prepare('UPDATE planets SET metal=999999,last_tick=last_tick-3600000 WHERE empire_id=?').run(b.id);
 const home=db.prepare('SELECT * FROM planets WHERE empire_id=? ORDER BY id LIMIT 1').get(b.id);game.accruePlanet(db,home);assert.equal(home.metal,999999);
});
test("NEMESIS: concurrent lethal sessions reward only once and cannot damage the next level",async t=>{
 const {db,alliance,empires:[a,b]}=fixture(t),now=Date.now();boss.publicBoss(db,alliance.id,a.id);db.exec("UPDATE alliance_bosses SET hp=1,armor='[0,0]'");
 const s1=boss.start(db,alliance.id,a.id,now),s2=boss.start(db,alliance.id,b.id,now),r1=await replay(s1.config),r2=await replay(s2.config);
 const results=await Promise.all([boss.finish(db,a.id,s1.id,r1.frames,now+1000),boss.finish(db,b.id,s2.id,r2.frames,now+1000)]);
 assert.equal(results.filter(r=>r.defeated).length,1);assert.equal(results.find(r=>r.stale).damage,0);
 const current=boss.publicBoss(db,alliance.id,a.id);assert.equal(current.hp,current.maxHp);assert.equal(current.level,2);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM alliance_boss_rewards").get().n,2);
});
test("NEMESIS: invalid, foreign, expired and impossible-time combat submissions cannot alter the boss",async t=>{
 const {db,alliance,empires:[a,b]}=fixture(t),now=Date.now(),session=boss.start(db,alliance.id,a.id,now),run=await replay(session.config,1);
 await assert.rejects(boss.finish(db,b.id,session.id,run.frames,now+2000),/unbekannt/);
 await assert.rejects(boss.finish(db,a.id,session.id,run.frames,now),/Kampfzeit/);
 await assert.rejects(boss.finish(db,a.id,session.id,[[1,1,0,500,500,0,1]],now+2000),/Kampfeingabe/);
 await assert.rejects(boss.finish(db,a.id,session.id,[[.02,1,0,NaN,500,0,1]],now+2000),/Kampfeingabe/);
 await assert.rejects(boss.finish(db,a.id,session.id,run.frames,now+1800001),/abgelaufen/);
 assert.equal(boss.publicBoss(db,alliance.id,a.id).hp,session.config.hp);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM alliance_boss_hits").get().n,0);
});
test("NEMESIS: simultaneous hits add their hull and armor damage without overwriting contributions",async t=>{
 const {db,alliance,empires:[a,b]}=fixture(t),now=Date.now(),s1=boss.start(db,alliance.id,a.id,now),s2=boss.start(db,alliance.id,b.id,now);
 const r1=await replay(s1.config,.02),r2=await replay(s2.config,.02);
 await Promise.all([boss.finish(db,a.id,s1.id,r1.frames,now+1000),boss.finish(db,b.id,s2.id,r2.frames,now+1000)]);
 const current=db.prepare('SELECT hp,armor FROM alliance_bosses').get();
 assert.equal(current.hp,s1.config.hp-r1.state.damage-r2.state.damage);
 assert.equal(JSON.parse(current.armor)[1],100-(100-r1.state.armor[1])-(100-r2.state.armor[1]));
});
test("NEMESIS: HP growth exceeds the legacy cap and rewards increase despite a smaller alliance",t=>{
 const {db,alliance,empires:[a,b]}=fixture(t);boss.publicBoss(db,alliance.id,a.id);
 db.exec("UPDATE alliance_bosses SET max_hp=25000000,hp=0,defeated_at=1");
 const second=boss.publicBoss(db,alliance.id,a.id);assert.ok(second.maxHp>=42500000);
 db.prepare("DELETE FROM alliance_members WHERE empire_id=?").run(b.id);db.exec("UPDATE alliance_bosses SET hp=0,defeated_at=1");
 const third=boss.publicBoss(db,alliance.id,a.id);assert.ok(third.maxHp>=Math.ceil(second.maxHp*1.7));for(const [k,v] of Object.entries(second.reward))assert.ok(third.reward[k]>=Math.ceil(v*1.25));
 assert.ok(third.combat.enemyDamage>second.combat.enemyDamage*.7);assert.ok(third.combat.playerHp>0);
});
test("NEMESIS: API requires auth, rejects old score endpoint and enforces two releases even on localhost",async t=>{
 const {db,alliance,empires:[a,b]}=fixture(t),app=express();app.use(express.json({limit:"700kb"}));attachRoutes(app,db);
 const server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const base="http://127.0.0.1:"+server.address().port+"/api",cookie="sn_session="+createSession(db,a.user_id);
 const post=(route,body={},auth=cookie)=>fetch(base+route,{method:"POST",headers:{"Content-Type":"application/json",cookie:auth},body:JSON.stringify(body)});
 assert.equal((await post("/alliances/boss/start",{},"")).status,401);
 assert.equal((await post("/alliances/boss/attack",{score:999999})).status,410);
 const startResponse=await post("/alliances/boss/start");assert.equal(startResponse.status,200);const session=await startResponse.json();
 assert.equal((await post("/alliances/boss/finish",{id:session.id,frames:[]})).status,200);
 assert.equal((await post("/alliances/boss/start")).status,200);assert.equal((await post("/alliances/boss/start")).status,400);
 const detail=await fetch(base+"/alliances/"+alliance.id,{headers:{cookie}}).then(r=>r.json());assert.equal(detail.alliance.boss.attemptsLeft,0);assert.ok(detail.alliance.boss.reward.metal>0);
});
