"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),express=require("express");
const {openDb}=require("../src/db"),{ensureAdmin}=require("../src/seed"),{attachRoutes}=require("../src/routes");
const {cookieSecure,trustProxySetting,setSessionCookie,clientIp}=require("../src/auth");
const registration=require("../src/registration");

function isolateEnv(t, patch) {
  const keys=["PUBLIC_URL","TRUST_PROXY","COOKIE_SECURE","VERCEL"];
  const prior={};
  for (const key of keys) prior[key]=process.env[key];
  for (const [key,value] of Object.entries(patch)) {
    if (value===undefined) delete process.env[key];
    else process.env[key]=value;
  }
  t.after(()=>{
    for (const key of keys) {
      if (prior[key]===undefined) delete process.env[key];
      else process.env[key]=prior[key];
    }
  });
}

async function appWithDb(t, env={}) {
  isolateEnv(t, env);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nexus-auth-sec-"));
  const db=openDb(path.join(dir,"test.db"));
  ensureAdmin(db);
  const app=express();
  app.set("trust proxy", trustProxySetting());
  app.use(express.json());
  attachRoutes(app,db);
  const server=app.listen(0,"127.0.0.1");
  await new Promise(r=>server.once("listening",r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {db,base:`http://127.0.0.1:${server.address().port}/api`};
}

test("session cookies are HttpOnly and gain Secure on HTTPS public URL",async t=>{
  const {base}=await appWithDb(t,{PUBLIC_URL:"https://game.example.org",COOKIE_SECURE:undefined,TRUST_PROXY:undefined,VERCEL:undefined});
  const res=await fetch(base+"/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:"Admin",password:"Wurm4444"})});
  assert.equal(res.status,200);
  const cookie=res.headers.get("set-cookie")||"";
  assert.match(cookie,/HttpOnly/i);
  assert.match(cookie,/SameSite=Lax/i);
  assert.match(cookie,/Secure/i);
});

test("local HTTP sessions omit Secure unless COOKIE_SECURE is forced",()=>{
  const prior=process.env.PUBLIC_URL,secure=process.env.COOKIE_SECURE,vercel=process.env.VERCEL;
  delete process.env.PUBLIC_URL;delete process.env.COOKIE_SECURE;delete process.env.VERCEL;
  const headers={};
  setSessionCookie({setHeader:(n,v)=>{headers[n]=v;}},"abc123",{secure:false,headers:{}});
  assert.match(headers["Set-Cookie"],/HttpOnly/);
  assert.doesNotMatch(headers["Set-Cookie"],/Secure/);
  process.env.COOKIE_SECURE="1";
  setSessionCookie({setHeader:(n,v)=>{headers[n]=v;}},"abc123",{secure:false,headers:{}});
  assert.match(headers["Set-Cookie"],/Secure/);
  if (prior===undefined) delete process.env.PUBLIC_URL; else process.env.PUBLIC_URL=prior;
  if (secure===undefined) delete process.env.COOKIE_SECURE; else process.env.COOKIE_SECURE=secure;
  if (vercel===undefined) delete process.env.VERCEL; else process.env.VERCEL=vercel;
});

test("trusted proxy uses forwarded client IP; untrusted forwarded headers are ignored",()=>{
  const vercel=process.env.VERCEL;delete process.env.VERCEL;
  const trusted={app:{get:()=>1},headers:{"x-forwarded-for":"203.0.113.9, 10.0.0.1"},ip:"10.0.0.1"};
  assert.equal(clientIp(trusted),"203.0.113.9");
  const untrusted={app:{get:()=>false},headers:{"x-forwarded-for":"203.0.113.9"},ip:"127.0.0.1"};
  assert.equal(clientIp(untrusted),"127.0.0.1");
  if (vercel===undefined) delete process.env.VERCEL; else process.env.VERCEL=vercel;
});

test("login rate limit is per forwarded IP when the proxy is trusted",async t=>{
  const {base}=await appWithDb(t,{TRUST_PROXY:"1",PUBLIC_URL:"https://game.example.org"});
  const post=(ip,user="Admin",password="wrong")=>fetch(base+"/auth/login",{method:"POST",headers:{"content-type":"application/json","x-forwarded-for":ip},body:JSON.stringify({username:user,password})});
  let blocked=0;
  for (let i=0;i<21;i++) {
    const res=await post("198.51.100.10","Nobody","wrong");
    if (res.status===429) blocked+=1;
  }
  assert.ok(blocked>=1,"Same client IP is throttled");
  const ok=await post("198.51.100.11","Admin","Wurm4444");
  assert.equal(ok.status,200,"A second client IP can still sign in");
});

test("new registrations reject short passwords",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nexus-pw-"));
  const db=openDb(path.join(dir,"test.db"));
  const t={after:fn=>fn};
  try {
    const challenge=registration.challenge(db,"192.0.2.80");
    const n=challenge.question.match(/\d+/g).map(Number);
    assert.throws(()=>registration.request(db,"192.0.2.80",{
      username:"ShortPw",password:"1234567",empire:"Short Empire",species:"terran",
      email:"short@example.org",human:"on",terms:"on",privacy:"on",age16:"on",
      challengeId:challenge.id,answer:String(n[0]+n[1])
    }),/8–72/);
  } finally {
    db.close();fs.rmSync(dir,{recursive:true,force:true});
  }
});

test("HTTPS public URL enables the Secure cookie flag",()=>{
  const prior=process.env.PUBLIC_URL,secure=process.env.COOKIE_SECURE,vercel=process.env.VERCEL;
  delete process.env.COOKIE_SECURE;delete process.env.VERCEL;
  process.env.PUBLIC_URL="https://nexus.example";
  assert.equal(cookieSecure({headers:{},secure:false}),true);
  process.env.PUBLIC_URL="http://localhost:3000";
  assert.equal(cookieSecure({headers:{},secure:false}),false);
  if (prior===undefined) delete process.env.PUBLIC_URL; else process.env.PUBLIC_URL=prior;
  if (secure===undefined) delete process.env.COOKIE_SECURE; else process.env.COOKIE_SECURE=secure;
  if (vercel===undefined) delete process.env.VERCEL; else process.env.VERCEL=vercel;
});
