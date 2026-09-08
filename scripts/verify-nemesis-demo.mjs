import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createDemoServer} from './serve-nemesis-demo.mjs';
if(process.argv.includes('--live')) { await import('./verify-nemesis-live.mjs'); } else {
const root=new URL('../',import.meta.url),folder=new URL('tmp/nemesis-review/',root);await mkdir(folder,{recursive:true});
const server=createDemoServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const debug=9449,chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required',`--user-data-dir=${fileURLToPath(new URL('tmp/nemesis-chrome/',root))}`,`--remote-debugging-port=${debug}`,'--window-size=1280,1000','about:blank'],{stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let ws;const errors=[],requests=[];
try{
 let page;for(let n=0;n<60;n++){try{page=await fetch(`http://127.0.0.1:${debug}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());break;}catch{await pause(200);}}assert.ok(page,'Chrome started');
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});let id=0;const pending=new Map();
 ws.addEventListener('message',ev=>{const d=JSON.parse(ev.data);if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text);if(d.method==='Network.requestWillBeSent')requests.push(d.params.request);if(pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);clearTimeout(p.timeout);d.error?p.reject(new Error(d.error.message)):p.resolve(d.result||{});}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;const timeout=setTimeout(()=>{pending.delete(key);reject(new Error('CDP timeout '+method));},15000);pending.set(key,{resolve,reject,timeout});ws.send(JSON.stringify({id:key,method,params}));});
 const ev=async expression=>{const d=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(d.exceptionDetails)throw new Error(d.exceptionDetails.exception?.description||d.exceptionDetails.text);return d.result?.value;};
 const until=async expression=>{for(let n=0;n<100;n++){const v=await ev(expression);if(v)return v;await pause(100);}throw new Error('Timed out: '+expression+'\n'+errors.join('\n'));};
 const snap=()=>ev('nemesisDemo.snapshot()');
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await writeFile(new URL(name+'.png',folder),Buffer.from(r.data,'base64'));};
 const click=async selector=>{const p=await ev(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});};
 const aim=async i=>{const p=await ev(`(()=>{const p=nemesisDemo.snapshot().weakpoints[${i}],r=document.querySelector('#stage').getBoundingClientRect();return{x:r.x+p.x/1000*r.width,y:r.y+p.y/1500*r.height}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});return p;};
 const key=(code,down)=>send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code==='Space'?' ':code==='KeyA'?'a':code==='KeyD'?'d':'Shift',windowsVirtualKeyCode:code==='Space'?32:code==='KeyA'?65:code==='KeyD'?68:16});
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/demos/nemesis/'});await until('window.nemesisDemo?.snapshot().ready');await shot('desktop-intro');await click('#start');await until('nemesisDemo.snapshot().mode === "playing"');
 const pose1=(await snap()).boss;await pause(650);const pose2=(await snap()).boss;assert.notDeepEqual(pose1,pose2,'Boss moves without firing');
 await shot('desktop-fight');
 const hp=(await snap()).hp;const corner=await ev(`(()=>{const r=document.querySelector('#stage').getBoundingClientRect();return{x:r.x+5,y:r.y+r.height*.35}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...corner});await key('Space',true);await pause(220);await key('Space',false);assert.equal((await snap()).hp,hp,'Actual miss does not damage boss');
 await key('Space',true);for(let n=0;n<36;n++){await aim(1);await pause(70);if((await snap()).armor[1]===0)break;}await key('Space',false);assert.equal((await snap()).armor[1],0,'Actual mouse aiming and keyboard shots break armor');await shot('desktop-armor-break');
 await key('Space',true);for(let n=0;n<7;n++){await aim(1);await pause(90);}await shot('desktop-reactor-hit');await key('Space',false);
 await click('#pause');const paused=await snap();await pause(250);assert.equal((await snap()).time,paused.time,'Pause freezes combat');assert.deepEqual((await snap()).effects,paused.effects,'Pause freezes smoke, debris and shots');await click('#resume');
 const beforeX=(await snap()).playerX;await key('KeyD',true);await pause(250);await key('KeyD',false);assert.ok((await snap()).playerX>beforeX,'Keyboard movement');await key('ShiftLeft',true);await key('ShiftLeft',false);assert.ok((await snap()).dodgeCooldown>0,'Keyboard dodge');
 await click('#pause');const firstContribution=await snap();await click('#reset');assert.deepEqual((await snap()).armor,firstContribution.armor,'Next pilot inherits broken armor');assert.equal((await snap()).hp,firstContribution.hp,'Next pilot inherits remaining raid hull');assert.equal((await snap()).shield,100,'Next pilot starts with full player shield');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await pause(250);
 const point=await aim(1);const button=await ev(`(()=>{const r=document.querySelector('#fire').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);const oldHits=(await snap()).hits;
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...point},{id:2,...button}]});for(let n=0;n<15;n++){const p=await ev(`(()=>{const p=nemesisDemo.snapshot().weakpoints[1],r=document.querySelector('#stage').getBoundingClientRect();return{x:r.x+p.x/1000*r.width,y:r.y+p.y/1500*r.height}})()`);await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,...p},{id:2,...button}]});await pause(65);}await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok((await snap()).hits>oldHits+4,'Simultaneous touch aiming and firing');await shot('mobile-fight');
 const afterRelease=(await snap()).hits;await pause(220);assert.equal((await snap()).hits,afterRelease,'Touch release stops fire');
 // A pilot cannot finish the fresh raid. Contributions survive defeat, handoff and reload.
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await key('Space',true);let phaseThree=false;
 for(let n=0;n<70;n++){
  const s=await snap();if(s.mode!=='playing')break;const target=s.armor[0]>0?0:1;await aim(target);phaseThree ||= s.phase===3;
  if(s.attack&&!s.attack.done&&s.attack.t>s.attack.windup-.7&&Math.abs(s.playerX-s.attack.x)<s.attack.width*.5+75&&s.dodgeCooldown===0){await key('ShiftLeft',true);await key('ShiftLeft',false);}
  await pause(65);if(phaseThree)break;
 }
 await key('Space',false);assert.ok(phaseThree,'Both armor plates broken in actual browser');assert.ok((await snap()).hp>90000,'Boss remains much stronger than one pilot');
 await until('nemesisDemo.snapshot().mode === "lost"');await until('!document.getElementById("result").hidden');await shot('mobile-raid-contribution');
 const ended=await snap();await click('#restart');let handoff=await snap();assert.equal(handoff.hits,0,'Next pilot has separate hit statistics');assert.equal(handoff.hp,ended.hp,'Defeat never heals the boss');assert.deepEqual(handoff.armor,ended.armor,'Wounds persist after defeat');assert.equal(handoff.attempt,ended.attempt+1);
 await send('Page.reload');await until('window.nemesisDemo?.snapshot().ready');assert.equal((await snap()).hp,ended.hp,'Raid hull persists across page reload');assert.deepEqual((await snap()).armor,ended.armor,'Broken plates persist across reload');await click('#start');
 for(const [width,height] of [[390,844],[360,640],[844,390]]){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await pause(120);const fit=await ev(`['fire','dodge','pause','sound','stick'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`);assert.ok(fit,`Controls fit ${width}x${height}`);}
 await click('#pause');await click('#reset-raid');assert.equal((await snap()).hp,100000,'Only explicit reset restores the test boss');assert.deepEqual((await snap()).armor,[100,100]);
 assert.deepEqual(errors,[],'No browser exceptions');assert.equal(requests.some(r=>r.url.includes('/api/')),false,'Demo never calls production API');const final=await snap();await writeFile(new URL('verification.json',folder),JSON.stringify({passed:true,checkedAt:new Date().toISOString(),checks:['animated distant boss','smaller accurate targets','breakable armor','reactor hits','pause','movement','dodge','multi-touch aiming/fire','release stops firing','boss survives pilot defeat','hull and armor persist between pilots and after reload','explicit test boss reset','390x844 / 360x640 / landscape controls','no production API'],snapshot:final,errors},null,2));console.log('NEMESIS demo checks passed',JSON.stringify(final));
}finally{ws?.close();chrome.kill();await Promise.race([new Promise(r=>chrome.once('exit',r)),pause(2500)]);server.closeAllConnections();await new Promise(r=>server.close(r));}
}
