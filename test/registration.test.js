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
