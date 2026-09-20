const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openDb}=require('../src/db'),{ensurePlayer}=require('../src/seed'),game=require('../src/game'),chat=require('../src/chat');
const {BUILDINGS}=require('../src/catalog');
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-badges-')),db=openDb(path.join(dir,'test.db'));
  t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
  ensurePlayer(db,'Pilot','testpassword','Pilot Empire','#00ffff');
  const user=db.prepare("SELECT * FROM users WHERE username='Pilot'").get(),empire=db.prepare('SELECT * FROM empires WHERE user_id=?').get(user.id);
  db.prepare('UPDATE empires SET translate=0 WHERE id=?').run(empire.id);
  const home=db.prepare('SELECT * FROM planets WHERE empire_id=?').get(empire.id);
  return {db,user,empire,home};
}
test('task badges count only claimable rewards and activity badges require affordable energy',t=>{
  const {db,user,home}=fixture(t);
  game.snapshot(db,user,home.id); // Apply the one-time daily bonus before testing an empty store.
  db.prepare('UPDATE planets SET energy=0,last_tick=? WHERE id=?').run(Date.now(),home.id);
  const s=game.snapshot(db,user,home.id);
  const daily=s.ops.filter(o=>o.complete&&!o.claimed).length,weekly=s.weekly.filter(o=>o.complete&&!o.claimed).length,campaign=s.contracts.filter(o=>o.complete&&!o.claimed).length;
  assert.ok(s.ops.some(o=>!o.complete&&!o.claimed),'There are unfinished tasks');
  assert.equal(s.hints.command,daily+weekly+campaign);assert.equal(s.hints.daily,daily);assert.equal(s.hints.weekly,weekly);assert.equal(s.hints.campaign,campaign);
  assert.equal(s.hints.activity,s.activities.filter(a=>!a.running&&a.ready&&a.durations.some(d=>d.energy<=s.planet.energy)).length);
  assert.ok(s.hints.activity<s.activities.length,'Unaffordable activities do not advertise availability');
});
test('yard badges respect hangar capacity including queued ships, but allow another affordable queued order',t=>{
  const {db,user,empire,home}=fixture(t);
  let s=game.snapshot(db,user,home.id);assert.equal(s.hints.yard,1);
  game.enqueueShip(db,empire,db.prepare('SELECT * FROM planets WHERE id=?').get(home.id),'probe',1);
  s=game.snapshot(db,user,home.id);assert.equal(s.hints.yard,1,'Ship queue accepts further orders');
  db.prepare('DELETE FROM ships WHERE planet_id=?').run(home.id);
  db.prepare("INSERT INTO ships(planet_id,ship_id,count) VALUES(?,'probe',?)").run(home.id,s.planet.shipCap-1);
  s=game.snapshot(db,user,home.id);assert.equal(s.hints.yard,0,'Queued probe consumes final hangar space');
  db.prepare('DELETE FROM queue WHERE planet_id=?').run(home.id);
  s=game.snapshot(db,user,home.id);assert.equal(s.hints.yard,1);
  db.prepare('UPDATE ships SET count=count+1 WHERE planet_id=?').run(home.id);
  assert.equal(game.snapshot(db,user,home.id).hints.yard,0,'Full hangar');
});
test('secondary colonies never advertise home-only buildings or personal research',t=>{
  const {db,user,empire,home}=fixture(t);
  const colony=db.prepare('SELECT * FROM planets WHERE empire_id IS NULL AND id>? LIMIT 1').get(home.id);
  db.prepare('UPDATE planets SET empire_id=?,founded_at=?,metal=100000,energy=100000,crystal=100000,helium=100000,titan=100000,diamond=100000 WHERE id=?').run(empire.id,Date.now()+1,colony.id);
  for(const b of Object.values(BUILDINGS))db.prepare('INSERT INTO buildings(planet_id,building_id,level) VALUES(?,?,?)').run(colony.id,b.id,['archive','quantum_lab'].includes(b.id)?1:b.max);
  const s=game.snapshot(db,user,colony.id);assert.equal(s.planet.isHome,false);assert.equal(s.hints.research,0);assert.equal(s.hints.infra,0);
});
test('alliance research badge respects funding and its shared research queue',t=>{
  const {db,user,empire,home}=fixture(t),social=require('../src/social');
  const alliance=social.createAlliance(db,empire,'BDG','Badge Alliance','','#00ffff');
  db.prepare('UPDATE planets SET alliance_id=?,metal=0,crystal=0,helium=0,titan=0,diamond=0,energy=0 WHERE id=?').run(alliance.id,home.id);
  game.snapshot(db,user,home.id);
  db.prepare('UPDATE planets SET metal=0,crystal=0,helium=0,titan=0,diamond=0,energy=0 WHERE id=?').run(home.id);
  assert.equal(game.snapshot(db,user,home.id).hints.research,0);
  db.prepare("INSERT INTO alliance_research(alliance_id,research_id,metal,helium,titan,energy,crystal) VALUES(?,'supply_grid',100000,70000,35000,50000,25000)").run(alliance.id);
  assert.equal(game.snapshot(db,user,home.id).hints.research,1);
  game.enqueueAllianceResearch(db,empire,db.prepare('SELECT * FROM planets WHERE id=?').get(home.id),'supply_grid');
  assert.equal(game.snapshot(db,user,home.id).hints.research,0);
});

test('chat counts other commanders only and immediately clears only the channel read',async t=>{
  const {db,empire}=fixture(t);
  ensurePlayer(db,'Other','testpassword','Other Empire','#ff0000');
  const other=db.prepare("SELECT * FROM empires WHERE name='Other Empire'").get();
  const insert=db.prepare("INSERT INTO chat_messages(channel,empire_id,body,lang,created_at) VALUES(?,?,?,'de',?)");
  insert.run('global',empire.id,'Own message',Date.now());assert.equal(chat.unreadChat(db,empire),0);
  insert.run('global',other.id,'Hello',Date.now());insert.run('trade',other.id,'Trade',Date.now());
  assert.equal(chat.unreadChat(db,empire),2);
  const data=await chat.listChat(db,{...empire,translate:0},'global');assert.equal(data.unreadChat,1);
  assert.equal(data.channels.find(c=>c.id==='global').unread,0);assert.equal(data.channels.find(c=>c.id==='trade').unread,1);
});
test('report and private-message read responses contain exact counts without clearing other channels',async t=>{
  const {db,user,empire}=fixture(t),express=require('express'),{attachRoutes}=require('../src/routes'),{createSession}=require('../src/auth');
  ensurePlayer(db,'Other','testpassword','Other Empire','#ff0000');const other=db.prepare("SELECT * FROM empires WHERE name='Other Empire'").get();
  db.prepare('DELETE FROM reports WHERE empire_id=?').run(empire.id);
  const insert=db.prepare("INSERT INTO reports(empire_id,kind,title,body,created_at,seen) VALUES(?,?,?,'{}',?,0)");
  const spy=Number(insert.run(empire.id,'spy','Spy',Date.now()).lastInsertRowid);
  insert.run(empire.id,'combat','Combat',Date.now());insert.run(empire.id,'event','Event',Date.now());
  const foreign=Number(insert.run(other.id,'spy','Foreign',Date.now()).lastInsertRowid);
  db.prepare("INSERT INTO mail(from_id,to_id,subject,body,lang,created_at,seen) VALUES(?,?,'Hello','Hi','de',?,0)").run(other.id,empire.id,Date.now());
  const app=express();app.use(express.json());attachRoutes(app,db);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}/api`,cookie=`sn_session=${createSession(db,user.id)}`;
  const post=body=>fetch(base+'/reports/read',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  assert.deepEqual((await post({ids:[]})).unreadCounts,{messages:1,combat:1,spy:1,mail:1});
  assert.deepEqual((await post({ids:[spy,foreign]})).unreadCounts,{messages:1,combat:1,spy:0,mail:1});
  assert.equal(db.prepare('SELECT seen FROM reports WHERE id=?').get(foreign).seen,0);
  assert.deepEqual((await post({kind:'messages'})).unreadCounts,{messages:0,combat:1,spy:0,mail:1});
  const readMail=await fetch(base+'/mail/'+other.id,{headers:{cookie}}).then(r=>r.json());
  assert.deepEqual(readMail.unreadCounts,{messages:0,combat:1,spy:0,mail:0});
});
