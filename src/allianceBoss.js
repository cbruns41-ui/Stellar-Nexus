"use strict";
const {randomUUID}=require("node:crypto");
const {SHIPS}=require("./catalog");
const {withTx}=require("./tx");
const DAILY_ATTEMPTS=2;
function weekKey(date=new Date()){
 const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
 return `${d.getUTCFullYear()}-W${String(Math.ceil(((d-new Date(Date.UTC(d.getUTCFullYear(),0,1)))/86400000+1)/7)).padStart(2,"0")}`;
}
const dayKey=(now=Date.now())=>new Date(now).toISOString().slice(0,10);
function fleetPower(db,id){
 const rows=db.prepare("SELECT sh.ship_id,SUM(sh.count) AS n FROM (SELECT * FROM ships UNION ALL SELECT * FROM ship_reserves) sh JOIN planets p ON p.id=sh.planet_id WHERE p.empire_id=? AND IFNULL(p.alliance_id,0)=0 GROUP BY sh.ship_id").all(id);
 let power=rows.reduce((sum,r)=>sum+(SHIPS[r.ship_id]?.attack||0)*r.n,0);
 for(const f of db.prepare("SELECT ships FROM fleets WHERE empire_id=?").all(id))for(const [ship,n] of Object.entries(JSON.parse(f.ships)))power+=(SHIPS[ship]?.attack||0)*n;
 return Math.floor(power);
}
function scaling(db,id){
 const members=db.prepare("SELECT empire_id FROM alliance_members WHERE alliance_id=?").all(id);
 const scale={members:Math.max(1,members.length),power:members.reduce((sum,m)=>sum+fleetPower(db,m.empire_id),0)};
 scale.rewardFactor=1+Math.min(4,Math.sqrt(scale.power/scale.members)/100);return scale;
}
function safeHp(value){const hp=Math.ceil(value);if(!Number.isSafeInteger(hp))throw new Error("Die nächste Bossstufe überschreitet den unterstützten Zahlenbereich.");return hp;}
function ensure(db,id){
 // Persist across calendar weeks; frozen per-level scaling never heals a wounded boss.
 const boss=db.prepare("SELECT * FROM alliance_bosses WHERE alliance_id=? ORDER BY rowid DESC LIMIT 1").get(id);
 if(!boss){
  const scale=scaling(db,id),hp=safeHp(Math.max(100000,scale.power*24+scale.members*12000));
  db.prepare("INSERT INTO alliance_bosses(alliance_id,week,hp,max_hp,level,scaling) VALUES(?,?,?,?,1,?)").run(id,weekKey(),hp,hp,JSON.stringify(scale));
 }else if(boss.hp<=0||boss.defeated_at){
  const scale=scaling(db,id),level=boss.level+1,hp=safeHp(Math.max(boss.max_hp*1.7,(scale.power*24+scale.members*12000)*Math.pow(1.7,level-1)));
  scale.rewardFactor=Math.max(scale.rewardFactor,JSON.parse(boss.scaling).rewardFactor||1)*1.25;
  scale.rewardFloor=Object.fromEntries(Object.entries(rewardFor(boss)).map(([k,v])=>[k,Math.ceil(v*1.25)]));
  db.prepare("UPDATE alliance_bosses SET level=?,hp=?,max_hp=?,armor='[100,100]',scaling=?,defeated_at=0,available_at=0 WHERE alliance_id=? AND week=?").run(level,hp,hp,JSON.stringify(scale),id,boss.week);
 }else if(!JSON.parse(boss.scaling).members)db.prepare("UPDATE alliance_bosses SET scaling=? WHERE alliance_id=? AND week=?").run(JSON.stringify(scaling(db,id)),id,boss.week);
 return db.prepare("SELECT * FROM alliance_bosses WHERE alliance_id=? ORDER BY rowid DESC LIMIT 1").get(id);
}
function attemptsUsed(db,id,now){
 return db.prepare("SELECT COUNT(*) AS n FROM alliance_boss_sessions WHERE empire_id=? AND day=?").get(id,dayKey(now)).n+
 db.prepare("SELECT COUNT(*) AS n FROM alliance_boss_hits WHERE empire_id=? AND day=? AND session_id IS NULL").get(id,dayKey(now)).n;
}
function combatConfig(db,boss,id){
 const scale=JSON.parse(boss.scaling),own=fleetPower(db,id),average=scale.power/scale.members,level=boss.level;
 const playerHp=Math.round(100+Math.sqrt(own)*1.6+Math.sqrt(average)*.25+Math.log2(scale.members+1)*8+(level-1)*5);
 return {empireId:id,hp:boss.hp,maxHp:boss.max_hp,armor:JSON.parse(boss.armor),level,playerHp,
 damageScale:Math.max(1,(own+average*.15+100)/900)*(1+(level-1)*.08),
 enemyDamage:(100+Math.sqrt(average)*1.6+Math.log2(scale.members+1)*8)/100*(1+(level-1)*.18),
 speed:1+Math.min(.6,(level-1)*.045),fleetPower:own,alliancePower:scale.power,members:scale.members};
}
function publicBoss(db,id,empireId){
 return withTx(db,()=>{
  const b=ensure(db,id),contributors=db.prepare("SELECT h.empire_id AS empireId,e.name,SUM(h.damage) AS damage FROM alliance_boss_hits h JOIN empires e ON e.id=h.empire_id WHERE h.alliance_id=? AND h.week=? AND h.boss_level=? GROUP BY h.empire_id ORDER BY damage DESC LIMIT 8").all(id,b.week,b.level);
  const mine=db.prepare("SELECT COALESCE(SUM(damage),0) AS n FROM alliance_boss_hits WHERE alliance_id=? AND week=? AND boss_level=? AND empire_id=?").get(id,b.week,b.level,empireId).n;
  return {week:b.week,level:b.level,name:"NEMESIS",hp:b.hp,maxHp:b.max_hp,defeated:false,reward:rewardFor(b),attemptsLeft:Math.max(0,DAILY_ATTEMPTS-attemptsUsed(db,empireId,Date.now())),dailyLimit:DAILY_ATTEMPTS,resetTimezone:"UTC",mine,contributors,combat:combatConfig(db,b,empireId)};
 });
}
function start(db,id,empireId,now=Date.now()){
 return withTx(db,()=>{
  if(!db.prepare("SELECT 1 FROM alliance_members WHERE alliance_id=? AND empire_id=?").get(id,empireId))throw new Error("Du gehörst nicht zu dieser Allianz.");
  if(attemptsUsed(db,empireId,now)>=DAILY_ATTEMPTS)throw new Error("Heute sind bereits zwei Feuerfreigaben verbraucht. Neue Freigaben um 00:00 UTC.");
  const b=ensure(db,id),token=randomUUID(),config=combatConfig(db,b,empireId);
  db.prepare("INSERT INTO alliance_boss_sessions(id,empire_id,alliance_id,week,boss_level,day,started_at,expires_at,config) VALUES(?,?,?,?,?,?,?,?,?)").run(token,empireId,id,b.week,b.level,dayKey(now),now,now+30*60*1000,JSON.stringify(config));
  return {id:token,config,attemptsLeft:DAILY_ATTEMPTS-attemptsUsed(db,empireId,now),expiresAt:now+30*60*1000};
 });
}
function rewardFor(boss){
 const scale=JSON.parse(boss.scaling),factor=scale.rewardFactor||1;
 return Object.fromEntries(Object.entries({metal:3600,energy:2400,crystal:1400,helium:1000,titan:500,diamond:20}).map(([k,v])=>[k,Math.max(Math.floor(v*factor),scale.rewardFloor?.[k]||0)]));
}
function grantRewards(db,boss,now){
 const resources=rewardFor(boss);
 for(const m of db.prepare("SELECT empire_id FROM alliance_members WHERE alliance_id=?").all(boss.alliance_id)){
  const r=db.prepare("INSERT OR IGNORE INTO alliance_boss_rewards(alliance_id,week,boss_level,empire_id,resources,granted_at) VALUES(?,?,?,?,?,?)").run(boss.alliance_id,boss.week,boss.level,m.empire_id,JSON.stringify(resources),now);
  if(!r.changes)continue;
  const home=db.prepare("SELECT id FROM planets WHERE empire_id=? AND IFNULL(alliance_id,0)=0 ORDER BY id LIMIT 1").get(m.empire_id);
  if(!home)throw new Error("Ein Allianzmitglied hat keinen eigenen Planeten für die Belohnung.");
  db.prepare("UPDATE planets SET metal=metal+?,energy=energy+?,crystal=crystal+?,helium=helium+?,titan=titan+?,diamond=diamond+? WHERE id=?").run(resources.metal,resources.energy,resources.crystal,resources.helium,resources.titan,resources.diamond,home.id);
  db.prepare("INSERT INTO reports(empire_id,kind,title,body,created_at,seen) VALUES(?,'alliance_boss',?,?,?,0)").run(m.empire_id,`NEMESIS Stufe ${boss.level} besiegt`,JSON.stringify({text:`Eure Allianz hat NEMESIS Stufe ${boss.level} besiegt. Diese Ressourcen wurden automatisch auf deinen Heimatplaneten geliefert. Stufe ${boss.level+1} wartet bereits.`,loot:resources,planetId:home.id}),now);
 }
 return resources;
}
async function finish(db,empireId,id,frames,now=Date.now()){
 const sim=await import("../public/demos/nemesis/combat.mjs");
 return withTx(db,()=>{
  const session=db.prepare("SELECT * FROM alliance_boss_sessions WHERE id=? AND empire_id=?").get(id,empireId);
  if(!session)throw new Error("Feuerfreigabe unbekannt.");
  if(session.finished_at)return JSON.parse(session.result);
  if(now>session.expires_at)throw new Error("Diese Feuerfreigabe ist abgelaufen.");
  if(!db.prepare("SELECT 1 FROM alliance_members WHERE alliance_id=? AND empire_id=?").get(session.alliance_id,empireId))throw new Error("Du gehörst nicht mehr zu dieser Allianz.");
  if(!Array.isArray(frames)||frames.length>12000)throw new Error("Ungültiger Kampfverlauf.");
  const s=sim.createCombat();sim.configureCombat(s,JSON.parse(session.config));sim.startCombat(s);let elapsed=0;
  for(const f of frames){
   if(!Array.isArray(f)||f.length!==7||!f.every(Number.isFinite))throw new Error("Ungültige Kampfeingabe.");
   const [dt,fire,move,x,y,direction,ratio]=f;
   if(dt<=0||dt>.05||![0,1].includes(fire)||Math.abs(move)>1||x<0||x>1000||y<0||y>1500||![-1,0,1,2].includes(direction)||ratio<.2||ratio>5||s.mode!=="playing")throw new Error("Ungültige Kampfeingabe.");
   elapsed+=dt;if(elapsed>40.06||elapsed*1000>now-session.started_at+500)throw new Error("Kampfzeit ist nicht plausibel.");
   s.viewRatio=ratio;s.aim={x,y};if(direction)sim.dodge(s,direction===2?0:direction);sim.stepCombat(s,dt,{fire:!!fire,move});s.events.length=0;
  }
  const boss=db.prepare("SELECT * FROM alliance_bosses WHERE alliance_id=? AND week=?").get(session.alliance_id,session.week);
  const current=boss&&boss.level===session.boss_level&&!boss.defeated_at&&boss.hp>0,damage=current?Math.min(boss.hp,s.damage):0,defeated=!!(current&&damage===boss.hp);let reward=null;
  if(current){
   const initialArmor=JSON.parse(session.config).armor;
   const armor=JSON.parse(boss.armor).map((v,i)=>Math.max(0,v-(initialArmor[i]-s.armor[i])));
   db.prepare("UPDATE alliance_bosses SET hp=hp-?,armor=?,defeated_at=? WHERE alliance_id=? AND week=?").run(damage,JSON.stringify(armor),defeated?now:0,boss.alliance_id,boss.week);
   if(defeated)reward=grantRewards(db,boss,now);
  }
  db.prepare("INSERT INTO alliance_boss_hits(alliance_id,week,boss_level,empire_id,day,damage,created_at,session_id) VALUES(?,?,?,?,?,?,?,?)").run(session.alliance_id,session.week,session.boss_level,empireId,session.day,damage,now,id);
  const result={damage,defeated,level:session.boss_level,hp:current?boss.hp-damage:0,stale:!current,hits:s.hits,shield:s.shield,reward};
  db.prepare("UPDATE alliance_boss_sessions SET finished_at=?,result=? WHERE id=?").run(now,JSON.stringify(result),id);
  if(defeated)ensure(db,session.alliance_id);
  return result;
 });
}
module.exports={weekKey,dayKey,publicBoss,start,finish,fleetPower,DAILY_ATTEMPTS};
