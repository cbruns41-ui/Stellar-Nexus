const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), express = require('express');
const {openDb} = require('../src/db'), {ensureAdmin,ensurePlayer} = require('../src/seed');
const {attachRoutes} = require('../src/routes'), settings = require('../src/settings');

test('admin and moderation actions validate roles, inputs, state changes and atomic audit logging', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-admin-check-')),db=openDb(path.join(dir,'test.db'));
  ensureAdmin(db);
  for (const name of ['Pilot_1','PilotX1','ModOne','ModTwo']) ensurePlayer(db,name,'secret123',name+' Empire','#00ffff');
  const user=name=>db.prepare('SELECT * FROM users WHERE username=?').get(name);
  for(const name of ['ModOne','ModTwo']) db.prepare('UPDATE users SET is_mod=1 WHERE id=?').run(user(name).id);
  const target=user('Pilot_1'), mod=user('ModOne'), other=user('ModTwo');
  const app=express();app.use(express.json());attachRoutes(app,db);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const post=(route,body,cookie='')=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)});
  const get=(route,cookie)=>fetch(base+route,{headers:{cookie}});
  const login=async(name,password='secret123')=>(await post('/auth/login',{username:name,password})).headers.get('set-cookie');
  const admin=await login('Admin','Wurm4444'), moderator=await login('ModOne'), member=await login('Pilot_1');
  for(const route of ['/admin/overview','/admin/registrations','/mod/overview','/mod/search?q=Pilot']) assert.equal((await get(route,member)).status,403);
  assert.equal((await get('/mod/overview',moderator)).status,200);
  for(const route of ['/admin/settings','/admin/player','/admin/world']) assert.equal((await post(route,{},moderator)).status,403);
  const search=await (await get('/mod/search?q=Pilot_1',admin)).json();
  assert.deepEqual(search.players.map(p=>p.username),['Pilot_1'],'Underscore search must be literal');
  assert.equal((await post('/mod/moderator',{userId:target.id,on:'false'},admin)).status,400);
  for(const on of [true,false]) {assert.equal((await post('/mod/moderator',{userId:target.id,on},admin)).status,200);assert.equal(!!user('Pilot_1').is_mod,on);}
  for(const kind of ['mute','ban']) {
    assert.equal((await post('/mod/sanction',{userId:target.id,kind,duration:'1h',reason:'Fixture'},moderator)).status,200);
    assert.ok(user('Pilot_1')[kind==='mute'?'muted_until':'banned_until']>Date.now());
    assert.equal((await post('/mod/lift',{userId:target.id,kind},moderator)).status,200);
    assert.equal(user('Pilot_1')[kind==='mute'?'muted_until':'banned_until'],0);
    assert.equal((await post('/mod/sanction',{userId:other.id,kind,duration:'1h'},admin)).status,200);
    assert.equal((await post('/mod/lift',{userId:other.id,kind},moderator)).status,400);
    assert.equal((await post('/mod/lift',{userId:other.id,kind},admin)).status,200);
  }
  assert.equal((await post('/mod/sanction',{userId:target.id,kind:'typo',duration:'1h'},admin)).status,400);
  assert.equal((await post('/mod/lift',{userId:target.id,kind:'typo'},admin)).status,400);
  assert.equal((await post('/mod/sanction',{userId:mod.id,kind:'mute',duration:'1h'},moderator)).status,400);
  assert.equal((await post('/admin/settings',{announcement:'Admin fixture',prodPct:110},admin)).status,200);
  assert.equal(settings.get(db).prodPct,110);
  assert.equal((await post('/admin/settings',{announcement:'Must not save',betaEmail:'bad'},admin)).status,400);
  assert.equal(settings.get(db).announcement,'Admin fixture');
  for(const action of ['nex','vip','credit','fighters']) {
    assert.equal((await post('/admin/player',{userId:target.id,action,amount:1},admin)).status,200);
    for(const amount of [0,-1,1.5,'bad']) assert.equal((await post('/admin/player',{userId:target.id,action,amount},admin)).status,400);
  }
  assert.equal((await post('/admin/player',{userId:target.id,action:'kit'},admin)).status,200);
  for(const body of [{action:'pirate',level:'bad'},{action:'rift',hours:0},{action:'broadcast',body:'x'},{action:'unknown'}]) assert.equal((await post('/admin/world',body,admin)).status,400);
  for(const body of [{action:'rift',hours:2},{action:'pirate',level:3},{action:'expand'},{action:'broadcast',body:'Isolated admin audit'}]) assert.equal((await post('/admin/world',body,admin)).status,200);
  const message=db.prepare("SELECT id FROM chat_messages WHERE body='[NEXUS] Isolated admin audit'").get();
  assert.ok(message);
  assert.equal((await post('/mod/chat/delete',{id:message.id},moderator)).status,200);
  assert.equal(db.prepare('SELECT id FROM chat_messages WHERE id=?').get(message.id),undefined);
  const before=settings.get(db).announcement;
  db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON mod_log BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  assert.equal((await post('/admin/settings',{announcement:'Rollback'},admin)).status,400);
  assert.equal(settings.get(db).announcement,before);
  assert.equal((await post('/mod/sanction',{userId:target.id,kind:'ban',duration:'perm'},admin)).status,400);
  assert.equal(user('Pilot_1').banned_until,0);
});
