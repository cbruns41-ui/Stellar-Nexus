import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createPreviewServer} from './serve.mjs';
const root=new URL('../../',import.meta.url),out=new URL('./review/',import.meta.url);
await mkdir(out,{recursive:true});
const server=createPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,port=9453;
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check',`--user-data-dir=${fileURLToPath(new URL('tmp/werft-preview-chrome/',root))}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;
const errors=[],requests=[];
try{
  let page;for(let n=0;n<60;n++){try{page=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());break;}catch{await sleep(200);}}
  assert.ok(page,'Browser started');ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
  let id=0;const pending=new Map();
  ws.addEventListener('message',ev=>{const d=JSON.parse(ev.data);if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text);if(d.method==='Network.requestWillBeSent')requests.push(d.params.request.url);if(pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);clearTimeout(p.timer);d.error?p.reject(new Error(d.error.message)):p.resolve(d.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(new Error(method+' timed out'));},15000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));});
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const snap=()=>ev('werftPreview.snapshot()');
  const click=async selector=>{const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await sleep(70);};
  const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(new URL(name+'.png',out),Buffer.from(r.data,'base64'));};
  const slide=async value=>{await ev(`(()=>{const e=document.getElementById('opening');e.value=${value};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(80);};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base});
  for(let n=0;n<100;n++){if(await ev('window.werftPreview?.snapshot().ready'))break;await sleep(100);}assert.ok((await snap()).ready,'Textures loaded');
  await slide(0);await shot('werft-geschlossen');await slide(50);await shot('werft-halb');await slide(100);await shot('werft-offen');
  // With the shutter retracted, the panorama must match the original pixels exactly.
  await ev('window.openPixels=document.getElementById("scene").getContext("2d").getImageData(0,0,document.getElementById("scene").width,document.getElementById("scene").height).data; true');
  await click('#original');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const diff=await ev('(()=>{const c=document.getElementById("scene"),p=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let count=0,max=0;for(let i=0;i<p.length;i++){if(p[i]!==openPixels[i]){count++;max=Math.max(max,Math.abs(p[i]-openPixels[i]));}}return {count,max,width:c.width,height:c.height,state:werftPreview.snapshot()};})()');
  await shot('werft-original');assert.equal(diff.count,0,'Fully open paused preview equals approved original pixels: '+JSON.stringify(diff));await click('#original');
  await slide(0);await click('#door');await sleep(1100);const a=await snap();assert.ok(a.opening>0&&a.opening<1,'Door moves through intermediate positions');await click('#play');const held=(await snap()).opening;await sleep(150);assert.equal((await snap()).opening,held,'Pause freezes door');
  await click('#overview');await shot('basis-gesamt');assert.ok((await snap()).overview);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await sleep(150);
  const p=await ev('(()=>{const e=document.getElementById("detail");e.scrollIntoView({block:"nearest"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...p}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(150);assert.equal((await snap()).overview,false,'Mobile touch switches view');
  assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'),'No horizontal overflow');await slide(30);await shot('werft-handy');
  assert.equal(requests.some(url=>url.includes('/api/')),false,'No game APIs used');assert.deepEqual(errors,[],'No browser errors');
  await writeFile(new URL('verification.json',out),JSON.stringify({passed:true,checkedAt:new Date().toISOString(),checks:['textures loaded','door has intermediate animation positions','pause','open view pixel-identical to original','overview','mobile first touch','no horizontal overflow','no game APIs'],errors},null,2));
  console.log('Werft preview checks passed. Screenshots: design/werft-animation/review/');
}finally{ws?.close();chrome.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}
