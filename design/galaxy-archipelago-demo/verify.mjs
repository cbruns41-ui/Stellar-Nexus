import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createDemoServer} from './serve.mjs';
const here=fileURLToPath(new URL('./',import.meta.url)),out=path.join(here,'review'),profile=path.resolve(here,'../../tmp/archipelago-chrome');
await mkdir(out,{recursive:true});await mkdir(profile,{recursive:true});await writeFile(path.join(profile,'.gitignore'),'*\n');
const server=createDemoServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,port=9473;
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run',`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;const errors=[],requests=[],results=[],gpuChecks=[],presentationChecks=[];
try{
 let page;for(let i=0;i<80;i++){try{page=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());break;}catch{await sleep(150);}}assert.ok(page,'Chrome started');
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});let id=0;const pending=new Map();
 ws.addEventListener('message',ev=>{const d=JSON.parse(ev.data);if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text);if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error')errors.push(d.params.args.map(a=>a.description||a.value).join(' '));if(d.method==='Network.requestWillBeSent')requests.push(d.params.request.url);if(d.method==='Network.responseReceived'&&d.params.response.status>=400&&!d.params.response.url.endsWith('favicon.ico'))errors.push(d.params.response.url+' '+d.params.response.status);if(pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);clearTimeout(p.timer);d.error?p.reject(Error(d.error.message)):p.resolve(d.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timeout'));},45000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const touch=async(x,y)=>{await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await sleep(50);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(80);};
 const tap=async selector=>{await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center"})`);const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))};})()`);if(!p.hit){const snap=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'failure.png'),Buffer.from(snap.data,'base64'));console.log(selector,p,await ev('document.elementFromPoint('+p.x+','+p.y+')?.outerHTML'),await ev('window.inputLog?.slice(-14)'));}assert.ok(p.hit,selector+' can be tapped');await touch(p.x,p.y);};
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 for(const[w,h]of [[1440,900],[390,844],[320,568],[844,390]]){
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<600});await send('Page.navigate',{url:base});
  for(let i=0;i<100;i++){if(await ev(`!!window.archipelago && document.querySelector('#loading').hidden`))break;await sleep(100);}
  await ev(`window.inputLog=[];for(const k of ['pointerdown','pointerup','click'])document.addEventListener(k,e=>inputLog.push([k,e.target.id,e.clientX,e.clientY]),true)`);const initial=await ev('archipelago.state()');assert.deepEqual([initial.galaxies,initial.systems,initial.planets],[3,2400,9600]);assert.ok(initial.frame>0);await shot('overview-'+w+'-'+h);
  await tap('[data-galaxy="0"]');await sleep(800);await shot('aurelia-'+w+'-'+h);
  const hits=await ev(`archipelago.hits().filter(h=>h.y>135&&h.y<innerHeight-75&&h.x>15&&h.x<innerWidth-15&&document.elementFromPoint(h.x,h.y)?.id==='map')`);assert.ok(hits.length,'Visible stars remain reachable');await touch(hits[0].x,hits[0].y);assert.equal((await ev('archipelago.state()')).selected,hits[0].id,'First tap opens system');await tap('#sheet-close');
  await tap('#search-toggle');await ev(`document.querySelector('#search').value='Pyre Hollow II';document.querySelector('#search').dispatchEvent(new Event('input'))`);await tap('#search-results button');await sleep(700);assert.equal((await ev('archipelago.state()')).selected,3);
  await tap('#planets button:nth-child(2)');assert.equal((await ev('archipelago.state()')).planet,1);await tap('#route');assert.deepEqual((await ev('archipelago.state()')).route,{a:0,b:3});await shot('system-'+w+'-'+h);await tap('#sheet-close');
  assert.equal(await ev("document.querySelectorAll('#zoom-tools,#zoom-in,#zoom-out,#home').length"),0);const before=(await ev('archipelago.state()')).camera.z;await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:w/2,y:h*.4,deltaX:0,deltaY:-300});await sleep(600);assert.ok((await ev('archipelago.state()')).camera.z>before*1.2);await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:w/2,y:h*.4,deltaX:0,deltaY:300});await sleep(600);
  await tap('#filter-toggle');await tap('#filters input[value="pirate"]');assert.ok(!(await ev('archipelago.state()')).filters.includes('pirate'));await tap('#filter-toggle');
  // Two-finger gesture zooms the complete map, with the midpoint anchored.
  const prePinch=(await ev('archipelago.state()')).camera.z;
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:w/2-25,y:h*.4},{id:2,x:w/2+25,y:h*.4}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:w/2-60,y:h*.4},{id:2,x:w/2+60,y:h*.4}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);assert.ok((await ev('archipelago.state()')).camera.z>prePinch*1.4);
  const prePan=(await ev('archipelago.state()')).camera.x;await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:w/2,y:h*.45}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:w/2+55,y:h*.45}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok((await ev('archipelago.state()')).camera.x<prePan);
  await tap('#info-toggle');await tap('#expand');await sleep(700);const expanded=await ev('archipelago.state()');assert.deepEqual([expanded.galaxies,expanded.systems,expanded.planets],[6,4800,19200]);await shot('expanded-'+w+'-'+h);
  const stable=await ev(`(()=>{const w=archipelago.world();return {ids:new Set(w.systems.map(s=>s.id)).size,names:new Set(w.systems.map(s=>s.name)).size,planets:w.systems.reduce((n,s)=>n+s.planets.length,0)};})()`);assert.deepEqual(stable,{ids:4800,names:4800,planets:19200});
  await tap('#search-toggle');await ev(`document.querySelector('#search').value='not-a-system';document.querySelector('#search').dispatchEvent(new Event('input'))`);assert.equal(await ev(`document.querySelector('#search-results').textContent`),'Kein passendes System gefunden.');await tap('#search-toggle');
  assert.ok(await ev(`document.documentElement.scrollWidth<=innerWidth`),'No horizontal page overflow');results.push({w,h,...expanded});console.log('Passed',w,h);
 }

 for(const [w,h] of [[390,844],[844,390]]){
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<600});await send('Page.navigate',{url:base+'/integration-check.html'});
  for(let i=0;i<80;i++){if(await ev('!!window.contract?.ready'))break;await sleep(100);}await sleep(300);
  assert.equal(await ev('document.querySelectorAll(".archipelago-regions").length'),1);
  assert.ok(await ev(`!!document.querySelector('[data-planet-id="102"].sys-planet-alert')`),'Focus preserves planet II');
  await tap('[data-target="102"][data-mission-kind="colonize"]');assert.deepEqual(await ev('contract.actions.at(-1)'),{planet:102,mission:'colonize'});
  const beforeRefresh=await ev('contract.selections');await ev(`window.savedAction=document.querySelector('[data-target="102"][data-mission-kind="colonize"]');contract.map.setData({...contract.data,now:Date.now()})`);
  assert.equal(await ev('contract.selections'),beforeRefresh);assert.ok(await ev(`savedAction===document.querySelector('[data-target="102"][data-mission-kind="colonize"]')`),'Refresh preserves button identity');
  await shot('integration-'+w+'-'+h);await tap('[data-sys-close]');
  await ev('contract.map.focusSystem(2)');await sleep(100);await tap('[data-target="201"][data-mission-kind="deploy"]');assert.deepEqual(await ev('contract.actions.at(-1)'),{planet:201,mission:'deploy'});await tap('[data-sys-close]');
  await ev('contract.map.focusSystem(1)');await sleep(100);await tap('[data-target="101"][data-mission-kind="intercept"]');assert.deepEqual(await ev('contract.actions.at(-1)'),{planet:101,mission:'intercept'});await tap('[data-orbit-mode="manual"]');assert.equal((await ev('contract.actions.at(-1)')).planet,101);await tap('[data-sys-close]');
  await ev('contract.map.focusSystem(3)');await sleep(100);assert.equal(await ev(`document.querySelectorAll('[data-mission-kind="colonize"]').length`),0);await tap('[data-target="301"][data-mission-kind="attack"]');assert.equal((await ev('contract.actions.at(-1)')).planet,301);await tap('[data-sys-close]');
  const destroyed=await ev('contract.map.destroy();contract.map.inspect().frames');await sleep(150);assert.equal(await ev('contract.map.inspect().frames'),destroyed);assert.equal(await ev('document.querySelectorAll(".archipelago-regions").length'),0);
  await ev('contract.mount();contract.mount()');assert.equal(await ev('document.querySelectorAll(".archipelago-regions").length'),1);console.log('Integration passed',w,h);
 }
 assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith(base)||url.startsWith('data:')),'No external services');assert.ok(!requests.some(url=>url.includes('/api/')),'No game API');
 await writeFile(path.join(out,'verification.json'),JSON.stringify({passed:true,at:new Date().toISOString(),results,errors},null,2));console.log('Archipelago: navigation, touch, search, filters, planet selection and expansion passed');
}finally{ws?.close();chrome.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}
