import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createDemoServer} from './serve.mjs';
const here=fileURLToPath(new URL('./',import.meta.url)),out=path.join(here,'review'),profile=path.resolve(here,'../../tmp/orbit-modern-chrome');
await mkdir(out,{recursive:true});await mkdir(profile,{recursive:true});await writeFile(path.join(profile,'.gitignore'),'*\n');
const server=createDemoServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,port=9469;
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run',`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;const errors=[],requests=[],results=[],gpuChecks=[],presentationChecks=[];
try{
 let page;for(let i=0;i<80;i++){try{page=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());break;}catch{await sleep(150);}}assert.ok(page,'Chrome started');
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});let id=0;const pending=new Map();
 ws.addEventListener('message',ev=>{const d=JSON.parse(ev.data);if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text);if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error')errors.push(d.params.args.map(a=>a.description||a.value).join(' '));if(d.method==='Network.requestWillBeSent')requests.push(d.params.request.url);if(d.method==='Network.responseReceived'&&d.params.response.status>=400&&!d.params.response.url.endsWith('favicon.ico'))errors.push(d.params.response.url+' '+d.params.response.status);if(pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);clearTimeout(p.timer);d.error?p.reject(Error(d.error.message)):p.resolve(d.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timeout'));},45000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const touch=async(x,y)=>{await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await sleep(50);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(80);};
 const tap=async selector=>{await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center"})`);const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))};})()`);assert.ok(p.hit,selector+' can be tapped');await touch(p.x,p.y);};
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 for(const [w,h,scale=1] of (process.argv.includes('--desktop-only')?[[1280,720,1.5],[1920,1080]]:[[390,844],[320,568],[844,390],[1280,800],[1280,720,1.5],[1920,1080]])){
  console.log('Testing viewport',w,h);await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:scale,mobile:w<600});await send('Page.navigate',{url:base});await sleep(200);await tap('#launch');
  for(let i=0;i<100;i++){if(await ev(`!!document.querySelector('.orbit-game')`))break;await sleep(100);}await ev(`document.querySelector('.orbit-game').orbitStartFrameAudit(20000)`);await sleep(500);
  console.log('Scene started',w,await ev(`document.querySelector('.orbit-game').orbitGpuAudit()`));const first=await ev(`document.querySelector('.orbit-game').orbitView()`);assert.equal(await ev(`document.querySelector('.orbit-game').dataset.renderer`),'webgl2');assert.equal(first.slotN,6);assert.equal(first.towers.length,3);await shot(`play-${w}-${h}`);
  const geometry=await ev(`(()=>{const r=document.querySelector('.orbit-game').getBoundingClientRect(),hud=document.querySelector('.hud').getBoundingClientRect(),toolbar=document.querySelector('.orbit-toolbar').getBoundingClientRect();return{width:r.width,height:r.height,hudTop:hud.top,toolbarBottom:toolbar.bottom};})()`);assert.equal(Math.round(geometry.width),w);assert.equal(Math.round(geometry.height),h);assert.ok(geometry.toolbarBottom<=geometry.hudTop+1);
  await tap('.orbit-pause');const paused=await ev(`document.querySelector('.orbit-game').orbitGame.time`);await sleep(200);assert.equal(await ev(`document.querySelector('.orbit-game').orbitGame.time`),paused);
  await tap('[data-zoom="out"]');await tap('[data-zoom="out"]');const small=await ev(`document.querySelector('.orbit-game').orbitView()`);assert.ok(small.cameraScale<first.cameraScale);assert.equal(small.planetR,first.planetR);await tap('#pause-resume');await shot(`overview-${w}-${h}`);
  if(w===390){
   await tap('[data-zoom="in"]');await tap('[data-zoom="in"]');const v=await ev(`document.querySelector('.orbit-game').orbitView()`),a=-Math.PI/2+Math.PI/3;
   await touch(v.screenCx+Math.cos(a)*v.ringR*v.cameraScale,v.screenCy+Math.sin(a)*v.ringR*v.cameraScale);assert.ok(await ev(`!document.querySelector('#build-dock').hidden`),'First tap opens free slot');await shot('build-sheet');await tap('[data-shop="laser"]');assert.equal((await ev(`document.querySelector('.orbit-game').orbitView()`)).towers.length,4);assert.ok(await ev(`document.querySelector('#build-dock').hidden`),'Build closes the sheet');
   const beforeAim=await ev(`document.querySelector('.orbit-game').orbitGame.aim`),sp=await ev(`(()=>{const r=document.querySelector('#stick').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:sp.x,y:sp.y}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:sp.x+30,y:sp.y}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notEqual(await ev(`document.querySelector('.orbit-game').orbitGame.aim`),beforeAim);
   const shotsBefore=await ev(`document.querySelector('.orbit-game').orbitGame.shotN`),fp=await ev(`(()=>{const r=document.querySelector('#fire').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...fp}]});await sleep(650);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(await ev(`document.querySelector('.orbit-game').orbitGame.shotN`)>shotsBefore);
   await tap('#aa');assert.ok(await ev(`document.querySelector('.orbit-game').orbitGame.aaCd`)>0);
   const killsBefore=await ev(`document.querySelector('.orbit-game').orbitGame.kills`);await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' '});
   for(let i=0;i<35;i++){await ev(`(()=>{const r=document.querySelector('.orbit-game'),g=r.orbitGame,v=r.orbitView(),t=[...g.enemies,...g.rockets].filter(e=>e.hp>0).sort((a,b)=>Math.hypot(a.x,a.y)-Math.hypot(b.x,b.y))[0];if(t)g.aim=Math.atan2(t.y-v.cy,t.x-v.cx);})()`);await sleep(100);}await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' '});assert.ok(await ev(`document.querySelector('.orbit-game').orbitGame.kills`)>killsBefore,'Real projectiles and turrets destroy enemies');await shot('combat-mobile');const audit=await ev(`(()=>{const r=document.querySelector('.orbit-game');return {gpu:r.orbitGpuAudit(),root:r.getBoundingClientRect().toJSON(),layers:[...r.querySelectorAll('canvas')].map(c=>({rect:c.getBoundingClientRect().toJSON(),width:c.width,height:c.height})),scroll:r.scrollTop};})()`);gpuChecks.push({viewport:[w,h],phase:'combat',...audit.gpu});assert.ok(audit.gpu.healthy,'Consecutive displayed frames stay lit and have no WebGL errors');
  }
  await tap('.orbit-pause');
  if(w===1280){
   for(let i=0;i<7;i++)await tap('[data-zoom="in"]');
   await tap('#pause-resume');await sleep(1200);await shot('detail-desktop');await tap('.orbit-pause');
  }
  await ev(`(()=>{const g=document.querySelector('.orbit-game').orbitGame;for(let i=0;i<18;i++){const x=(i%6-2.5)*150,y=(Math.floor(i/6)-1)*180;g.flashes.push({x,y,life:.3,radius:95});g.rings.push({x,y,r:60,vr:170,life:.3,color:'255,120,60'});for(let k=0;k<6;k++)g.sparks.push({x:x+k*3,y:y+k*2,life:.4,vx:0,vy:0,size:3,color:'#ffcf89'});}})()`);await sleep(100);
  const stress=await ev(`document.querySelector('.orbit-game').orbitGpuAudit()`);gpuChecks.push({viewport:[w,h],phase:'simultaneous-effects',...stress});assert.ok(stress.healthy,'Displayed frames remain intact at '+w+'x'+h);
  await tap('#pause-resume');
  if(w>=1280){console.log('Continuous combat',w);
   await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Digit0',key:'0'});await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Digit0',key:'0'});
   await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' '});
   let minBrightness=255;
   for(let i=0;i<45;i++){
    await ev(`(()=>{const r=document.querySelector('.orbit-game'),g=r.orbitGame;if(g.mode==='build')document.querySelector('#build-go').click();const t=[...g.enemies,...g.rockets].filter(e=>e.hp>0).sort((a,b)=>Math.hypot(a.x,a.y)-Math.hypot(b.x,b.y))[0];if(t)g.aim=Math.atan2(t.y,t.x);})()`);
    await sleep(400);
    const v=await ev(`document.querySelector('.orbit-game').orbitView()`);
    const capture=await send('Page.captureScreenshot',{format:'png',clip:{x:Math.round(v.screenCx)-4,y:Math.round(v.screenCy)-4,width:8,height:8,scale:1}});
    const brightness=await ev(`(async()=>{const im=new Image();im.src='data:image/png;base64,${capture.data}';await im.decode();const c=document.createElement('canvas');c.width=c.height=8;const x=c.getContext('2d');x.drawImage(im,0,0,8,8);const d=x.getImageData(0,0,8,8).data;let total=0;for(let j=0;j<d.length;j+=4)total+=d[j]+d[j+1]+d[j+2];return total/(64*3);})()`);
    minBrightness=Math.min(minBrightness,brightness);
    if(brightness<5)await shot('black-frame-'+w+'-'+i);
    assert.ok(brightness>=5,'Composited Chrome frame '+i+' is visible at '+w);
   }
   await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' '});
   const continuous=await ev(`document.querySelector('.orbit-game').orbitGpuAudit()`);console.log('Continuous audit',w,continuous);assert.ok(continuous.healthy);assert.ok(continuous.samples>=100);
   gpuChecks.push({viewport:[w,h],phase:'continuous-combat',...continuous});presentationChecks.push({w,h,scale,frames:45,minBrightness});await shot('continuous-combat-'+w);
  }
  console.log('Passed viewport',w);results.push({w,h,scale,...geometry});await tap('.orbit-exit');await tap('#again');assert.ok(await ev(`!document.querySelector('.orbit-game')&&!document.querySelector('#lobby').hidden`));await tap('#launch');await sleep(300);assert.equal((await ev(`document.querySelector('.orbit-game').orbitView()`)).towers.length,3,'Restart resets demo');await tap('.orbit-exit');await tap('#again');
  await tap('#campaign');await sleep(400);
  assert.deepEqual(await ev(`(()=>{const g=document.querySelector('.orbit-game').orbitGame;return [g.wave,g.towers.length,g.mode,g.weaponLevels.dmg,g.weaponLevels.rate,g.weaponLevels.missiles];})()`),[0,0,'build',0,0,0],'Full round starts fresh before wave one');
  await tap('#weapon-open');await shot('weapon-shop-'+w+'-'+h);
  await tap('[data-shop="weapon-dmg"]');
  assert.deepEqual(await ev(`(()=>{const g=document.querySelector('.orbit-game').orbitGame;return [g.salvage,g.playerDmg,g.weaponLevels.dmg,g.workUsed];})()`),[75,1.35,1,1],'Damage purchase commits exactly once');
  assert.ok(await ev(`document.querySelector('[data-shop="weapon-rate"]').disabled`),'Shared work order blocks second purchase');
  if(w===390){
   // Isolate progression/cost rules using a funded next-order fixture, buy through real UI.
   await ev(`(()=>{const g=document.querySelector('.orbit-game').orbitGame;g.workUsed=0;g.salvage=500;})()`);await sleep(100);
   assert.ok(await ev(`document.querySelector('[data-shop="weapon-dmg"]').disabled`),'Second damage level waits for held waves');
   await tap('[data-shop="weapon-rate"]');assert.ok(Math.abs(await ev(`document.querySelector('.orbit-game').orbitGame.playerRate`)-.162)<1e-8);
   await ev(`document.querySelector('.orbit-game').orbitGame.workUsed=0`);await sleep(100);await tap('[data-shop="weapon-missiles"]');
   assert.equal(await ev(`document.querySelector('.orbit-game').orbitGame.salvage`),305);
  }
  await tap('#build-close');await tap('#build-go');assert.equal(await ev(`document.querySelector('.orbit-game').orbitGame.wave`),1);
  if(w===390){
   await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' '});await sleep(1120);await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' '});
   const weapon=await ev(`(()=>{const r=document.querySelector('.orbit-game'),g=r.orbitGame;return {shots:g.shotN,missiles:g.interceptors.length,damage:g.shots.filter(s=>s.kind==='player').map(s=>s.dmg),veil:r.orbitGpuAudit().veil};})()`);
   assert.ok(weapon.shots>=6&&weapon.missiles>=1,'Upgraded main weapon launches companion missile');assert.ok(weapon.damage.length&&weapon.damage.every(n=>n===1.35));assert.ok(weapon.veil.peak>0&&weapon.veil.active<=weapon.veil.capacity,'Rocket veil emitted within its limit');
   await shot('weapon-upgraded-combat');
  }
  await tap('.orbit-exit');await tap('#again');
 }
 assert.ok(requests.every(url=>url.startsWith(base)||url.startsWith('data:')),'No external requests');assert.ok(!requests.some(url=>url.includes('/api/')),'No game API calls');assert.deepEqual(errors,[]);
 await writeFile(path.join(out,'verification.json'),JSON.stringify({passed:true,at:new Date().toISOString(),results,gpuChecks,presentationChecks,errors,requests:[...new Set(requests.filter(url=>!url.startsWith("data:")))]},null,2));console.log('Demo: controls, combat, consecutive framebuffer samples and composited Chrome frames passed');
}finally{ws?.close();chrome.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}
