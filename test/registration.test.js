"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {openDb}=require("../src/db"),registration=require("../src/registration"),settings=require("../src/settings"),auth=require("../src/auth"),{ensureAdmin,ensurePlayer}=require("../src/seed");
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nexus-registration-"));const db=openDb(path.join(dir,"test.db"));
  t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});return db;
}
function body(db,ip,username="NewPilot") {
  const challenge=registration.challenge(db,ip),numbers=challenge.question.match(/\d+/g).map(Number);
  return {username,password:"validpassword",empire:"New Empire",species:"terran",email:`${username}@example.org`,human:"on",terms:"on",privacy:"on",age16:"on",challengeId:challenge.id,answer:String(numbers[0]+numbers[1])};
}

test('registration inbox pages all records, keeps failed confirmations open and archives sent ones', t => {
  const db = fixture(t);
  const user = db.prepare('INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)');
  const insert = db.prepare('INSERT INTO registration_requests(user_id,email,ip_hash,empire,species,token_hash,status,player_mail_status,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 125; i++) {
    const id = Number(user.run(`Inbox_${i}`, 'fixture-only', Date.now()).lastInsertRowid);
    insert.run(id, `inbox${i}@example.org`, `fixture-${i}`, 'Inbox Empire', 'terran', `token-${i}`, i < 12 ? 'pending' : 'approved', i < 12 ? 'pending' : i === 12 ? 'failed' : 'sent', Date.now() + 100000, Date.now());
  }
  const open = registration.listPage(db);
  assert.deepEqual(open.counts, {open: 13, done: 112, all: 125});
  assert.equal(open.total, 13); assert.equal(open.pages, 2); assert.equal(open.registrations.length, 10);
  assert.equal(open.registrations[0].username, 'Inbox_12');
  const second = registration.listPage(db, {page: 2});
  assert.equal(second.registrations.length, 3);
  assert.equal(new Set([...open.registrations, ...second.registrations].map(r => r.id)).size, 13);
  assert.equal(registration.listPage(db, {filter:'done'}).total, 112);
  assert.equal(registration.listPage(db, {filter:'all', page: 999}).page, 13);
  assert.equal(registration.listPage(db, {filter:'all', q:'inbox124@example.org'}).registrations[0].username, 'Inbox_124');
  assert.equal(registration.listPage(db, {filter:'all', q:'%'}).total, 0, 'Search treats SQL wildcards as literal text');
  assert.equal(registration.listPage(db, {filter:'all', q:'Inbox_1'}).total, 36);
  db.prepare("UPDATE registration_requests SET player_mail_status='sent',player_mail_error='' WHERE id=?").run(open.registrations[0].id);
  assert.equal(registration.listPage(db).counts.open, 12);
  assert.equal(registration.listPage(db, {filter:'done', q:'inbox12@example.org'}).total, 1);
});

test("registration mail defaults to the support admin, including previously blank settings", t=>{
  const db=fixture(t);
  assert.equal(settings.get(db).betaEmail,"mail.nexus@gmx.net");
  db.prepare("INSERT OR REPLACE INTO world_meta(key,value) VALUES('admin_settings',?)").run(JSON.stringify({betaEmail:""}));
  assert.equal(settings.get(db).betaEmail,"mail.nexus@gmx.net");
  assert.throws(()=>settings.set(db,{betaEmail:"invalid"}),/E-Mail/);
  settings.set(db,{betaEmail:" mail.nexus@gmx.net "});
  assert.equal(settings.get(db).betaEmail,"mail.nexus@gmx.net");
});
test("registration requires human proof, one IP and explicit one-use admin approval",async t=>{
  const db=fixture(t),ip="192.0.2.1";
  assert.throws(()=>registration.request(db,ip,{}),/Mensch/);
  assert.throws(()=>registration.request(db,ip,{...body(db,ip),terms:""}),/AGB|Datenschutz|Mindestalter/);
  const input=body(db,ip),entry=registration.request(db,ip,input);
  const user=db.prepare("SELECT * FROM users WHERE username=?").get(input.username);
  assert.ok(auth.verifyPassword(input.password,user.password_hash));
  assert.ok(registration.pending(db,user.id));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM empires WHERE user_id=?").get(user.id).n,0);
  assert.throws(()=>registration.request(db,ip,input),/Mensch/);
  assert.throws(()=>registration.request(db,ip,body(db,ip,"OtherPilot")),/IP-Adresse/);
  assert.equal(registration.ipKey(db,"::ffff:192.0.2.1"),registration.ipKey(db,ip));
  settings.set(db,{betaEmail:"admin@example.org"});
  const prev={...process.env};Object.assign(process.env,{SMTP_HOST:"smtp.example.org",SMTP_FROM:"game@example.org",PUBLIC_URL:"https://game.example.org"});
  t.after(()=>{for(const key of ["SMTP_HOST","SMTP_FROM","PUBLIC_URL"]) if(prev[key]===undefined) delete process.env[key];else process.env[key]=prev[key];});
  const sent=[];
  assert.equal(await registration.notifyAdmin(db,entry,{sendMail:async message=>sent.push(message)}),true);
  assert.equal(sent[0].to,"admin@example.org");assert.ok(sent[0].text.includes(`/approve.html#${entry.token}`));
  assert.equal(registration.review(db,entry.token).status,"pending");
  assert.ok(registration.pending(db,user.id),"Preview does not approve");
  registration.approve(db,entry.token);
  assert.equal(registration.pending(db,user.id),false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM empires WHERE user_id=?").get(user.id).n,1);
  assert.throws(()=>registration.approve(db,entry.token),/ungültig/);
});
test("failed mail remains pending and is recoverable; seed never resets existing passwords",async t=>{
  const db=fixture(t),entry=registration.request(db,"192.0.2.2",body(db,"192.0.2.2"));
  assert.equal(await registration.notifyAdmin(db,entry,{sendMail:async()=>{throw new Error("SMTP unavailable");}}),false);
  assert.equal(registration.list(db)[0].mail_status,"failed");
  ensureAdmin(db);const admin=db.prepare("SELECT * FROM users WHERE username='Admin'").get();
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(auth.hashPassword("ChangedSecret"),admin.id);
  ensureAdmin(db);assert.ok(auth.verifyPassword("ChangedSecret",db.prepare("SELECT password_hash FROM users WHERE id=?").get(admin.id).password_hash));
  ensurePlayer(db,"NewPilot","OverwriteSecret","Other Empire","#ffffff");
  assert.ok(registration.pending(db,db.prepare("SELECT id FROM users WHERE username='NewPilot'").get().id));
});

test("missing SMTP configuration identifies the missing settings and resend recovers the pending account",async t=>{
  const db=fixture(t),entry=registration.request(db,"192.0.2.3",body(db,"192.0.2.3"));
  const keys=["SMTP_HOST","SMTP_FROM","PUBLIC_URL","SMTP_PORT","SMTP_SECURE","SMTP_USER","SMTP_PASSWORD"];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  t.after(()=>{for(const key of keys) if(previous[key]===undefined) delete process.env[key];else process.env[key]=previous[key];});
  for(const key of keys) delete process.env[key];
  process.env.SMTP_HOST="smtp.example.org";
  assert.equal(await registration.notifyAdmin(db,entry),false);
  const error=registration.list(db)[0].mail_error;
  assert.match(error,/SMTP_FROM, PUBLIC_URL/);
  assert.doesNotMatch(error,/SMTP_HOST/);
  Object.assign(process.env,{SMTP_FROM:"game@example.org",PUBLIC_URL:"https://game.example.org",SMTP_PORT:"465",SMTP_SECURE:"false"});
  assert.equal(await registration.notifyAdmin(db,entry),false);
  assert.match(registration.list(db)[0].mail_error,/465.*SMTP_SECURE=true/);
  delete process.env.SMTP_SECURE;
  settings.set(db,{betaEmail:"admin@example.org"});
  const messages=[];
  await registration.resend(db,entry.id,{sendMail:async message=>messages.push(message)});
  assert.equal(messages.length,1);
  assert.equal(messages[0].to,"admin@example.org");
  assert.equal(registration.list(db)[0].mail_status,"sent");
  assert.equal(registration.list(db)[0].mail_error,"");
  assert.equal(registration.list(db)[0].status,"pending");
  assert.throws(()=>registration.review(db,entry.token),/ungültig/);
  const token=/approve\.html#([a-f0-9]+)/.exec(messages[0].text)[1];
  registration.approve(db,token);
  assert.equal(registration.list(db)[0].status,"approved");
});

test("player confirmation is only sent after approval, failures do not revoke access, retries are deduplicated",async t=>{
  const db=fixture(t),entry=registration.request(db,"192.0.2.4",body(db,"192.0.2.4"));
  const keys=["SMTP_HOST","SMTP_FROM","PUBLIC_URL","SMTP_USER","SMTP_PASSWORD","SMTP_PORT","SMTP_SECURE"];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  t.after(()=>{for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];});
  for(const key of keys) delete process.env[key];
  Object.assign(process.env,{SMTP_HOST:"smtp.example.org",SMTP_FROM:"game@example.org",PUBLIC_URL:"https://game.example.org"});
  const sent=[];
  await assert.rejects(registration.notifyPlayer(db,entry.id,{sendMail:async message=>sent.push(message)}),/noch nicht freigegeben/);
  assert.equal(sent.length,0);
  const approved=registration.approve(db,entry.token);
  assert.equal(await registration.notifyPlayer(db,approved.id,{sendMail:async()=>{throw new Error('SMTP unavailable');}}),false);
  const row=registration.list(db)[0];
  assert.equal(row.status,'approved');assert.equal(row.player_mail_status,'failed');assert.equal(row.player_mail_error,'SMTP unavailable');
  const userId=db.prepare('SELECT user_id FROM registration_requests WHERE id=?').get(entry.id).user_id;
  assert.equal(registration.pending(db,userId),false);
  let release;
  const delivery=registration.notifyPlayer(db,entry.id,{sendMail:message=>{sent.push(message);return new Promise(resolve=>{release=resolve;});}});
  await assert.rejects(registration.notifyPlayer(db,entry.id,{sendMail:async message=>sent.push(message)}),/bereits versendet/);
  release();assert.equal(await delivery,true);
  assert.equal(await registration.notifyPlayer(db,entry.id,{sendMail:async message=>sent.push(message)}),true);
  assert.equal(sent.length,1);
  assert.equal(sent[0].to,entry.email);assert.equal(sent[0].replyTo,'mail.nexus@gmx.net');
  assert.match(sent[0].text,/https:\/\/game.example.org\//);assert.ok(sent[0].text.includes(registration.SUPPORT_SIGNATURE));
  assert.equal(registration.list(db)[0].player_mail_error,'');
});
