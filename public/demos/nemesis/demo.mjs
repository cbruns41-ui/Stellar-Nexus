import {createCombat,startCombat,configureCombat,stepCombat,dodge,bossPose,weakpoints,localPoint,toBodyLocal,targetAt,raidSnapshot,restoreRaid,BODY_X,BODY_Y,CORE_LAYOUT,clamp} from './combat.mjs';
import * as live from './live.mjs';

const $=id=>document.getElementById(id),stage=$('stage'),canvas=$('combat'),ctx=canvas.getContext('2d',{alpha:false});
const state=createCombat(),art={},particles=[],beams=[],chunks=[],rings=[],numbers=[],scars=[];
const raidKey='nemesis-demo-alliance-v2';
if(!live.allianceId)try{restoreRaid(state,JSON.parse(localStorage.getItem(raidKey)));}catch{/* A blocked or invalid store leaves a fresh local raid. */}
let pendingDodge=0,liveFinishing=false,liveFinished=false,recovering=false,launching=false;
let lastSave=0,lastSavedHp=state.hp,storageAvailable=true;
function saveRaid(){if(live.allianceId){live.persist();lastSavedHp=state.hp;return;}try{localStorage.setItem(raidKey,JSON.stringify(raidSnapshot(state)));lastSavedHp=state.hp;}catch{storageAvailable=false;}}
window.addEventListener('pagehide',saveRaid);
const input={fire:false,move:0},firePointers=new Set(),keys=new Set();
let fireAim=null;
let w=1000,h=1500,dpr=1,ready=false,last=performance.now(),idle=0,flash=0,shake=0,alertLife=0,finishedAt=-1,shotSide=1,paused=false,stickId=null,aimId=null,stickMove=0,soundOn=false,audio=null,frames=0,frameMs=16;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand=(a,b)=>a+Math.random()*(b-a),Y=v=>v*h/1500;
const fmt=n=>Math.round(n).toLocaleString('de-DE');

function resize(){const r=stage.getBoundingClientRect();w=1000;h=1000*r.height/r.width;state.viewRatio=h/1500;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);stage.style.setProperty('--hud-bottom',(document.querySelector('.hud').getBoundingClientRect().bottom-r.top)+'px');}
new ResizeObserver(resize).observe(stage);resize();
async function load(){try{await Promise.all(['arena','body','leg','arm','armor','ship'].map(async name=>{const img=new Image();const version=['body','leg','arm','armor'].includes(name)?'-v3':'';img.src=`./assets/${name}${version}.png`;await img.decode();art[name]=img;}));if(live.allianceId)await setupLive();ready=true;if(!live.allianceId){$('start').disabled=false;$('start').textContent=state.hp<=0?'NEUEN TESTBOSS STARTEN':state.attempt?'NÄCHSTEN ANGRIFF STARTEN':'ANGRIFF STARTEN';}}catch(err){$('load-error').hidden=false;console.error('Nemesis assets:',err);}}
load();
async function setupLive(){
 document.title='NEMESIS · Allianz-Bosskampf';stage.setAttribute('aria-label','NEMESIS Allianz-Bosskampf');document.querySelector('.brand span').textContent='ALLIANZ-OPERATION';document.querySelector('.intro-card>small').textContent='STELLAR NEXUS / ALLIANZ-ANGRIFF';document.querySelector('.bottom-note').textContent='ZWEI FEUERFREIGABEN PRO TAG · RESET 00:00 UTC';
 $('reset-raid').hidden=true;$('reset').textContent='ANGRIFF BEENDEN';
 const exit=document.createElement('button');exit.id='exit-live';exit.className='exit-live';exit.textContent='ZURÜCK ZUR ALLIANZ';exit.onclick=()=>{if(live.session&&!liveFinished){if(state.mode==='playing'){state.mode='retreated';state.attack=null;}completeLive(true);}else live.closeLive();};stage.append(exit);
 document.querySelector('#result a').onclick=e=>{e.preventDefault();exit.click();};
 const data=await live.preview(),boss=data.alliance?.boss||data.boss;
 if(!boss)throw new Error('Allianz-Boss nicht verfügbar.');
 live.selectCommander(boss.combat.empireId);recovering=live.pending();
 configureCombat(state,boss.combat);$('start').disabled=!recovering&&!boss.attemptsLeft;
 $('start').textContent=recovering?'OFFENEN ANGRIFF ABSCHLIESSEN':boss.attemptsLeft?'ANGRIFF STARTEN':'HEUTE KEINE FEUERFREIGABE MEHR';
 $('storage-note').textContent=`Stufe ${boss.level} · ${boss.attemptsLeft}/2 Feuerfreigaben. Start verbraucht eine Freigabe, auch bei Abbruch. Sieg: automatische Ressourcen für alle Mitglieder. Belohnung je Mitglied: `+Object.entries(boss.reward).map(([k,v])=>`${{metal:'Metall',energy:'Energie',crystal:'Kristall',helium:'Helium',titan:'Titan',diamond:'Diamanten'}[k]} ${fmt(v)}`).join(' · ');
}
async function completeLive(close=false){
 if(liveFinishing)return;liveFinishing=true;paused=true;clearInput();$('pause-screen').hidden=true;$('intro').hidden=true;$('result').hidden=false;$('restart').disabled=true;$('result-title').textContent='ANGRIFF WIRD GEWERTET';$('result-detail').textContent='Dein Kampfbeitrag wird gespeichert.';
 try{const result=await live.finishLive();liveFinished=true;$('result-title').textContent=result?.defeated?'NEMESIS BESIEGT':result?.stale?'BOSSSTUFE BEREITS BESIEGT':'ANGRIFF BEENDET';$('result-detail').textContent=`Bestätigter Beitrag: ${fmt(result?.damage||0)} Schaden. `+(result?.defeated?'Die Ressourcen wurden allen Mitgliedern gutgeschrieben. Die nächste Stufe ist bereit.':'Der gemeinsame Bosszustand bleibt für eure nächsten Angriffe erhalten.');$('restart').textContent='ZURÜCK ZUR ALLIANZ';$('restart').onclick=live.closeLive;if(close)live.closeLive();}
 catch(err){if(/abgelaufen|unbekannt|nicht mehr zu dieser Allianz/.test(err.message)){live.discardPending();liveFinished=true;$('result-title').textContent='ANGRIFF NICHT MEHR WERTBAR';$('result-detail').textContent=err.message;$('restart').textContent='ZURÜCK ZUR ALLIANZ';$('restart').onclick=live.closeLive;}else{$('result-title').textContent='SPEICHERN AUSSTEHEND';$('result-detail').textContent=err.message+' Dein Kampfverlauf bleibt für einen erneuten Versuch gespeichert.';$('restart').textContent='SPEICHERN ERNEUT VERSUCHEN';$('restart').onclick=()=>completeLive(close);}}
 finally{liveFinishing=false;$('restart').disabled=false;}
}

function resetFireAim(){fireAim=null;$('fire').style.removeProperty('--aim-x');$('fire').style.removeProperty('--aim-y');}
function clearInput(){firePointers.clear();resetFireAim();keys.clear();input.fire=false;input.move=0;pendingDodge=0;stickMove=0;stickId=aimId=null;$('fire').classList.remove('active');$('stick-knob').style.transform='translate(-50%,-50%)';}
function requestDodge(){if(paused||state.mode!=='playing')return;if(live.allianceId)pendingDodge=Math.sign(input.move)||2;else dodge(state,Math.sign(input.move));}
async function begin(resetBoss=false){if(launching)return;if(live.allianceId){if(recovering){await completeLive();return;}launching=true;$('start').disabled=true;try{const session=await live.beginLive();configureCombat(state,session.config);}catch(err){showAlert(err.message,6);$('storage-note').textContent=err.message;$('start').disabled=false;launching=false;return;}launching=false;}startCombat(state,{resetBoss:!live.allianceId&&(resetBoss||state.hp<=0)});saveRaid();particles.length=beams.length=chunks.length=rings.length=numbers.length=scars.length=0;flash=shake=0;finishedAt=-1;paused=false;clearInput();$('intro').hidden=true;$('result').hidden=true;$('pause-screen').hidden=true;last=performance.now();showAlert(state.broken?'DER BOSS BLEIBT VERWUNDET · ANGRIFF FORTSETZEN':'VISIERE DIE SCHULTERPANZERUNG AN',2.8);}
$('start').onclick=()=>begin();$('restart').onclick=()=>begin();$('reset').onclick=()=>live.allianceId?completeLive():begin();$('reset-raid').onclick=()=>begin(true);
function pause(value){if(state.mode!=='playing')return;paused=value;clearInput();$('pause-screen').hidden=!value;$('pause').setAttribute('aria-label',value?'Kampf fortsetzen':'Kampf pausieren');last=performance.now();}
$('pause').onclick=()=>pause(!paused);$('resume').onclick=()=>pause(false);
document.addEventListener('visibilitychange',()=>{if(document.hidden){saveRaid();pause(true);clearInput();}});window.addEventListener('blur',()=>{clearInput();pause(true);});

function pointer(e){const r=stage.getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width*1000,0,1000),y:clamp((e.clientY-r.top)/r.height*1500,0,1500)};}
canvas.addEventListener('pointerdown',e=>{if(state.mode!=='playing'||paused)return;e.preventDefault();aimId=e.pointerId;canvas.setPointerCapture(e.pointerId);state.aim=pointer(e);firePointers.add(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||e.pointerId===aimId)state.aim=pointer(e);});
const release=e=>{firePointers.delete(e.pointerId);if(fireAim?.id===e.pointerId)resetFireAim();if(aimId===e.pointerId)aimId=null;if(stickId===e.pointerId){stickId=null;stickMove=0;$('stick-knob').style.transform='translate(-50%,-50%)';}};
window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
$('fire').addEventListener('pointerdown',e=>{e.preventDefault();if(state.mode!=='playing'||paused||fireAim)return;e.currentTarget.setPointerCapture(e.pointerId);fireAim={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};firePointers.add(e.pointerId);});
$('fire').addEventListener('pointermove',e=>{
 if(e.pointerId!==fireAim?.id||state.mode!=='playing'||paused)return;
 const r=stage.getBoundingClientRect(),gain=1.6;
 state.aim={x:clamp(state.aim.x+(e.clientX-fireAim.x)/r.width*1000*gain,0,1000),y:clamp(state.aim.y+(e.clientY-fireAim.y)/r.height*1500*gain,0,1500)};
 fireAim.x=e.clientX;fireAim.y=e.clientY;
 $('fire').style.setProperty('--aim-x',clamp(e.clientX-fireAim.startX,-18,18)+'px');
 $('fire').style.setProperty('--aim-y',clamp(e.clientY-fireAim.startY,-18,18)+'px');
});$('fire').addEventListener('lostpointercapture',release);
$('stick').addEventListener('pointerdown',e=>{e.preventDefault();if(state.mode!=='playing'||paused)return;stickId=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);moveStick(e);});
function moveStick(e){if(e.pointerId!==stickId)return;const r=$('stick').getBoundingClientRect(),x=clamp((e.clientX-r.left-r.width/2)/(r.width*.32),-1,1);stickMove=x;$('stick-knob').style.transform=`translate(calc(-50% + ${x*22}px),-50%)`;}
$('stick').addEventListener('pointermove',moveStick);$('stick').addEventListener('lostpointercapture',release);
$('dodge').addEventListener('pointerdown',e=>{e.preventDefault();requestDodge();});
window.addEventListener('keydown',e=>{if(['Space','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyA','KeyD','Escape'].includes(e.code)){e.preventDefault();if(e.code==='Escape'&&!e.repeat){pause(!paused);return;}if(state.mode!=='playing'||paused)return;keys.add(e.code);if(e.code.startsWith('Shift')&&!e.repeat)requestDodge();}});
window.addEventListener('keyup',e=>keys.delete(e.code));
$('sound').onclick=async()=>{soundOn=!soundOn;if(soundOn){try{audio??=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();}catch{soundOn=false;}}$('sound').textContent=soundOn?'TON AN':'TON AUS';$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label',soundOn?'Ton ausschalten':'Ton einschalten');};
function tone(type){if(!soundOn||!audio)return;const o=audio.createOscillator(),g=audio.createGain(),now=audio.currentTime;const impact=['break','impact','victory','hurt'].includes(type);o.type=impact?'sawtooth':'sine';o.frequency.setValueAtTime(impact?80:type==='warning'?440:680,now);o.frequency.exponentialRampToValueAtTime(impact?24:120,now+.15);g.gain.setValueAtTime(impact?.065:.025,now);g.gain.exponentialRampToValueAtTime(.001,now+(impact?.45:.13));o.connect(g);g.connect(audio.destination);o.start();o.stop(now+.5);o.onended=()=>{o.disconnect();g.disconnect();};}

function showAlert(text,life=1.8){$('alert').textContent=text;alertLife=life;}
function burst(x,y,color,count=25,power=1){for(let i=0;i<count&&particles.length<360;i++){const a=rand(0,Math.PI*2),v=rand(40,290)*power;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.25,.8),max:.8,color,size:rand(1,3.7),trail:true});}}
function smoke(x,y,count=8){for(let i=0;i<count&&particles.length<360;i++)particles.push({x:x+rand(-12,12),y:y+rand(-12,12),vx:rand(-22,22),vy:rand(-70,-30),life:rand(.5,1.5),max:1.5,color:'#80969d',size:rand(13,34),smoke:true});}
function processEvents(){for(const e of state.events.splice(0)){
 if(e.type==='shot'){shotSide*=-1;beams.push({x1:e.from.x+shotSide*74,y1:e.from.y,x2:e.to.x,y2:e.to.y,life:.14,max:.14,critical:e.critical});tone('shot');}
 if(e.type==='hit'){burst(e.x,e.y,e.critical?'#ffb54b':'#9eeaff',e.critical?20:8);rings.push({x:e.x,y:e.y,life:.24,max:.24,r:e.critical?40:18,color:e.critical?'#ffb44b':'#a8eaff'});shake=Math.max(shake,e.critical?3:1);if(state.hits%3===0)numbers.push({x:e.x+rand(-20,20),y:e.y-25,life:.6,text:e.critical?'KRITISCH +'+fmt(e.amount):'+ '+fmt(e.amount),color:e.critical?'#ffc079':'#a0dff5'});
  if(state.hits%4===0&&scars.length<32){scars.push({...toBodyLocal(state,e),size:rand(8,16),seed:rand(0,10)});}
 }
 if(e.type==='break'){shake=11;flash=.2;burst(e.x,e.y,'#ffc16e',65,1.4);smoke(e.x,e.y,15);rings.push({x:e.x,y:e.y,r:160,life:.5,max:.5,color:'#ffe0a7'});for(let i=0;i<4;i++)chunks.push({x:e.x,y:e.y,vx:(e.index?1:-1)*rand(80,200),vy:rand(-340,-120),angle:rand(-1,1),spin:rand(-4,4),life:1.8,size:i===0?150:rand(38,80)});showAlert(state.broken===2?'REAKTOREN OFFEN · ÜBERLASTUNG':'PANZERUNG GEBROCHEN · REAKTOR TREFFEN',2.6);tone('break');}
 if(e.type==='warning'){showAlert(['PLASMAEINSCHLAG · MARKIERUNG VERLASSEN','BREITSEITE · AUSWEICHEN','BODENSCHLAG · GEFAHRENZONE VERLASSEN'][e.kind],2);tone('warning');}
 if(e.type==='impact'){shake=8;rings.push({x:e.x,y:e.y,r:230,life:.55,max:.55,color:'#ff8c55'});burst(e.x,e.y,'#ff793e',45,1.4);smoke(e.x,e.y,10);tone('impact');}
 if(e.type==='hurt'){flash=.5;shake=14;tone('hurt');}
 if(e.type==='avoided'){showAlert('AUSGEWICHEN',.8);numbers.push({x:state.playerX,y:state.playerY-80,life:.8,text:'AUSGEWICHEN',color:'#9deaff'});}
 if(e.type==='dodge'){burst(e.x,e.y,'#70eaff',22,.4);tone('shot');}
 if(e.type==='victory'){finishedAt=idle;shake=20;flash=.35;burst(e.x,e.y,'#ffc17d',100,1.7);smoke(e.x,e.y,30);tone('victory');showAlert('NEMESIS NEUTRALISIERT',2);}
 if(e.type==='defeat'||e.type==='retreat')finishedAt=idle;
 if(['defeat','retreat','victory'].includes(e.type))saveRaid();
}}
function stepEffects(dt){for(const list of [particles,beams,chunks,rings,numbers])for(let i=list.length-1;i>=0;i--){const p=list[i];p.life-=dt;if(p.life<=0){list.splice(i,1);continue;}if(p.vx!==undefined){p.x+=p.vx*dt;p.y+=p.vy*dt;if(!p.smoke)p.vy+=dt*(p.spin!==undefined?440:190);}if(p.spin!==undefined)p.angle+=p.spin*dt;if(p.text)p.y-=dt*30;}flash=Math.max(0,flash-dt*1.8);shake=Math.max(0,shake-dt*30);alertLife-=dt;
 if(state.mode==='playing'&&state.broken&&frames%7===0){const core=weakpoints(state).find(a=>a.open);smoke(core.x,core.y,1);if(frames%14===0)burst(core.x,core.y,'#ffb368',2,.3);}
}

function sprite(name,x,y,width,angle=0,alpha=1,flip=false){const a=art[name];if(!a)return;const height=width*a.height/a.width;ctx.save();ctx.translate(x,Y(y));ctx.rotate(angle);ctx.scale(flip?-1:1,1);ctx.globalAlpha*=alpha;ctx.drawImage(a,-width/2,-height/2,width,height);ctx.restore();}
function glow(x,y,r,color,alpha=1){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(x,Y(y),0,x,Y(y),r);g.addColorStop(0,color);g.addColorStop(.15,color+'bb');g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fillRect(x-r,Y(y)-r,r*2,r*2);ctx.restore();}
function line(x1,y1,x2,y2,color,width){ctx.beginPath();ctx.moveTo(x1,Y(y1));ctx.lineTo(x2,Y(y2));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function renderBackground(){const image=art.arena;if(!image){ctx.fillStyle='#061321';ctx.fillRect(0,0,w,h);return;}const scale=Math.max(w/image.width,h/image.height)*1.025,bw=image.width*scale,bh=image.height*scale;ctx.drawImage(image,(w-bw)/2-Math.sin(idle*.15)*5,(h-bh)/2,bw,bh);const groundShade=ctx.createLinearGradient(0,Y(800),0,h);groundShade.addColorStop(0,'#05213500');groundShade.addColorStop(1,'#03111b55');ctx.fillStyle=groundShade;ctx.fillRect(0,0,w,h);}
function renderDanger(){const a=state.attack;if(!a)return;const progress=clamp(a.t/a.windup,0,1),left=a.x-a.width/2,right=a.x+a.width/2;ctx.save();ctx.globalAlpha=a.done?.5:.18+progress*.18;ctx.fillStyle='#ff3d17';ctx.beginPath();ctx.moveTo(500+(left-500)*.48,Y(800));ctx.lineTo(500+(right-500)*.48,Y(800));ctx.lineTo(right+30,Y(1390));ctx.lineTo(left-30,Y(1390));ctx.closePath();ctx.fill();ctx.globalAlpha=.65;ctx.strokeStyle='#ff6f48';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.moveTo(a.x-a.width*.4,Y(1235));ctx.lineTo(a.x+a.width*.4,Y(1235));ctx.strokeStyle='#ff5b35';ctx.lineWidth=4;ctx.stroke();
 ctx.globalAlpha=.45+Math.sin(a.t*12)*.25;for(let i=0;i<5;i++){const y=900+i*75+a.t*35%75;ctx.beginPath();ctx.moveTo(a.x-14,Y(y));ctx.lineTo(a.x,Y(y+9));ctx.lineTo(a.x+14,Y(y));ctx.stroke();}ctx.restore();
 if(a.done){glow(a.x,1130,135,'#ff632c',.7);if(a.kind!==2){const origin=localPoint(state,120,-130);line(origin.x,origin.y,a.x,1130,'#ff541a77',22);line(origin.x,origin.y,a.x,1130,'#ffc889',5);}}
}
function drawLeg(x,y,width,flip,phase,opacity=1,angle=0){
 const a=art.leg,height=width*a.height/a.width;ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(flip?-1:1,1);ctx.rotate(Math.sin(phase)*.07);ctx.globalAlpha*=opacity;ctx.translate(-width*.87,-height*.20);
 // Polygon overlap follows the new high knee; the wide thigh must stay on the hip.
 ctx.save();ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(width,0);ctx.lineTo(width,height*.38);ctx.lineTo(width*.52,height*.38);ctx.lineTo(width*.38,height*.25);ctx.lineTo(0,height*.25);ctx.closePath();ctx.clip();ctx.drawImage(a,0,0,width,height);ctx.restore();
 ctx.translate(width*.38,height*.21);ctx.rotate(Math.sin(phase+1.1)*.08);ctx.translate(-width*.38,-height*.21);
 ctx.beginPath();ctx.moveTo(0,height*.22);ctx.lineTo(width*.40,height*.22);ctx.lineTo(width*.52,height*.37);ctx.lineTo(width*.53,height);ctx.lineTo(0,height);ctx.closePath();ctx.clip();ctx.drawImage(a,0,0,width,height);ctx.restore();
}
function drawArm(x,y,width,flip,time,strike,raised=false){
 const a=art.arm,height=width*a.height/a.width;ctx.save();ctx.translate(x,y);ctx.scale(flip?-1:1,1);ctx.rotate((raised?2:-.15)+Math.sin(time*2.1)*.07+strike*.65);ctx.translate(-width*.84,-height*.14);
 ctx.drawImage(a,0,0,a.width,a.height*.35,0,0,width,height*.35);ctx.translate(width*.69,height*.33);ctx.rotate((raised?-1.8:.06)+Math.sin(time*2.3)*.07-strike*.5);ctx.drawImage(a,0,a.height*.32,a.width,a.height*.68,-width*.69,-height*.01,width,height*.68);ctx.restore();
}
function renderBoss(){const p=bossPose(state),t=state.time,death=state.mode==='won'?Math.min(1,(idle-finishedAt)/1.6):0;ctx.save();ctx.translate(p.x,Y(p.y));ctx.rotate(p.rotation+death*.16);ctx.scale(p.scale*(1-death*.06),p.scale);ctx.globalAlpha=1-death*.6;
 // Grounding shadow remains under the feet, never attached to the camera.
 ctx.save();ctx.translate(10,355);ctx.scale(1,.18);const shadow=ctx.createRadialGradient(0,0,0,0,0,330);shadow.addColorStop(0,'#000c');shadow.addColorStop(1,'#0000');ctx.fillStyle=shadow;ctx.fillRect(-330,-330,660,660);ctx.restore();
 // Exactly two walking legs. Arms end in fists and swing from the shoulders.
 drawLeg(65,156,220,true,p.step+Math.PI,.86,.4);drawLeg(-52,155,285,false,p.step);
 const strike=state.attack?.kind===2&&!state.attack.done?Math.sin(clamp(state.attack.t/state.attack.windup,0,1)*Math.PI*.5):0;
 drawArm(-175,-100,240,false,t,0,true);
 ctx.save();ctx.scale(BODY_X,BODY_Y);
 const drawLocal=(name,x,y,size,rot=0,flip=false)=>{const a=art[name];ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.scale(flip?-1:1,1);ctx.drawImage(a,-size/2,-size*a.height/a.width/2,size,size*a.height/a.width);ctx.restore();};
 const bodySize=620,bodyHeight=bodySize*art.body.height/art.body.width;ctx.drawImage(art.body,-bodySize/2,-bodyHeight/2,bodySize,bodyHeight);
 for(const scar of scars){ctx.save();ctx.translate(scar.x,scar.y);ctx.rotate(scar.seed);ctx.fillStyle='#090e15c0';ctx.beginPath();ctx.ellipse(0,0,scar.size,scar.size*.7,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ff814788';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-scar.size,2);ctx.lineTo(-2,-3);ctx.lineTo(scar.size,4);ctx.stroke();ctx.restore();}
 for(let i=0;i<2;i++){const {x,y,r}=CORE_LAYOUT[i];
  if(state.armor[i]>0){drawLocal('armor',x,y,i?172:124,i?.22:-.1,i===0);
   if(state.armor[i]<75){ctx.strokeStyle='#ffb04b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-r*.6,y-r*.6);ctx.lineTo(x-r*.1,y-3);ctx.lineTo(x+5,y+r*.65);ctx.stroke();}
  }else{ctx.save();ctx.globalCompositeOperation='lighter';const g=ctx.createRadialGradient(x,y,2,x,y,r*1.65);g.addColorStop(0,'#fff0ae');g.addColorStop(.2,'#ff933bcc');g.addColorStop(1,'#ff642000');ctx.globalAlpha=.55+Math.sin(t*8)*.18;ctx.fillStyle=g;ctx.fillRect(x-r*2,y-r*2,r*4,r*4);ctx.translate(x,y);ctx.rotate(t*(i?2:-1.7));ctx.strokeStyle='#ffd38b';ctx.lineWidth=1.5;for(let k=0;k<3;k++){ctx.beginPath();ctx.arc(0,0,r*.72,k*2.1,k*2.1+1.1);ctx.stroke();}ctx.restore();}
 }
 ctx.restore();
 drawArm(178,6,345,true,t+.9,strike);
 ctx.restore();
}
function renderShip(){const bank=clamp(state.velocity/1500,-.3,.3),x=state.playerX,y=state.playerY+Math.sin(idle*3)*3;ctx.save();ctx.translate(x,Y(y));ctx.rotate(bank);ctx.scale(1.22,1.22);const sh=ctx.createRadialGradient(0,75,0,0,75,110);sh.addColorStop(0,'#0009');sh.addColorStop(1,'#0000');ctx.fillStyle=sh;ctx.fillRect(-120,-40,240,230);
 ctx.globalCompositeOperation='lighter';for(const ex of [-48,0,48]){const len=85+Math.sin(idle*31+ex)*12+(state.dodgeLeft>0?90:0),g=ctx.createLinearGradient(ex,70,ex,70+len);g.addColorStop(0,'#caffff');g.addColorStop(.16,'#49d8ffcc');g.addColorStop(1,'#258dff00');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(ex-9,70);ctx.quadraticCurveTo(ex-13,110,ex+bank*-90,70+len);ctx.quadraticCurveTo(ex+14,105,ex+9,70);ctx.fill();}ctx.globalCompositeOperation='source-over';ctx.drawImage(art.ship,-155,-155,310,310);if(state.dodgeLeft>0){ctx.strokeStyle='#77ebffaa';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,165,145,0,0,Math.PI*2);ctx.stroke();}ctx.restore();}
function renderEffects(){ctx.save();for(const b of beams){const a=b.life/b.max;ctx.globalAlpha=a;ctx.globalCompositeOperation='lighter';line(b.x1,b.y1,b.x2,b.y2,'#058cde',9);line(b.x1,b.y1,b.x2,b.y2,'#74dcff',3);line(b.x1,b.y1,b.x2,b.y2,'#e9ffff',1);glow(b.x1,b.y1,23,'#7ce8ff',a);glow(b.x2,b.y2,28,b.critical?'#ffb957':'#8decff',a);}
 ctx.globalCompositeOperation='source-over';for(const c of chunks)sprite('armor',c.x,c.y,c.size,c.angle,clamp(c.life/.3,0,1));
 for(const r of rings){ctx.globalAlpha=r.life/r.max;ctx.strokeStyle=r.color;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(r.x,Y(r.y),r.r*(1-r.life/r.max),r.r*(1-r.life/r.max)*.55,0,0,Math.PI*2);ctx.stroke();}
 for(const p of particles){ctx.globalAlpha=Math.min(1,p.life/p.max)*(p.smoke?.17:1);ctx.globalCompositeOperation=p.smoke?'source-over':'lighter';ctx.fillStyle=p.color;if(p.smoke){ctx.beginPath();ctx.arc(p.x,Y(p.y),p.size*(1.8-p.life/p.max),0,Math.PI*2);ctx.fill();}else{line(p.x,p.y,p.x-p.vx*.025,p.y-p.vy*.025,p.color,p.size);}}
 ctx.globalCompositeOperation='source-over';ctx.textAlign='center';for(const n of numbers){ctx.globalAlpha=Math.min(1,n.life*3);ctx.font=n.text.startsWith('KRITISCH')?'bold 17px Arial':'14px Arial';ctx.fillStyle=n.color;ctx.fillText(n.text,n.x,Y(n.y));}ctx.restore();}
function render(){ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);ctx.globalAlpha=1;renderBackground();if(!ready)return;ctx.save();if(!reduced&&shake>0)ctx.translate(Math.sin(idle*83)*shake,Math.cos(idle*69)*shake*.6);renderDanger();renderBoss();renderShip();renderEffects();ctx.restore();
 if(flash>0){ctx.fillStyle=state.hurt>0?`rgba(255,55,26,${flash*.25})`:`rgba(255,200,130,${flash*.11})`;ctx.fillRect(0,0,w,h);}
}
function hud(){
 const hp=state.hp/state.maxHp*100;
 $('boss-fill').style.width=hp+'%';$('boss-percent').textContent=hp.toLocaleString('de-DE',{maximumFractionDigits:2})+' %';
 $('raid-hull').textContent='ALLIANZHÜLLE '+fmt(state.hp)+' / '+fmt(state.maxHp);
 $('attempt').textContent=live.allianceId?'STUFE '+(state.config?.level||1):'ANGRIFF '+(state.mode==='intro'?state.attempt+1:state.attempt);
 const shieldPercent=state.shield/(state.config?.playerHp||100)*100;$('shield-fill').style.width=shieldPercent+'%';$('shield-value').textContent=live.allianceId?fmt(state.shield)+' / '+fmt(state.config?.playerHp||100):state.shield+' %';
 $('damage').textContent=fmt(state.damage);$('combo').textContent=state.combo>=3?'TREFFERSERIE ×'+state.combo:'PRÄZISION ZÄHLT';
 $('phase').textContent=['01 / PANZERUNG BRECHEN','02 / REAKTOR FREIGELEGT','03 / KRITISCHE ÜBERLASTUNG'][state.phase-1];
 $('armor-status').textContent=state.broken===2?'◈ REAKTOREN OFFEN':'◈ '+(2-state.broken)+' PANZERPLATTE'+(state.broken?'':'N');
 $('clock').textContent='00:'+Math.ceil(state.left).toString().padStart(2,'0');
 $('crosshair').style.left=state.aim.x/10+'%';$('crosshair').style.top=state.aim.y/15+'%';
 const index=targetAt(state),open=index>=0&&state.armor[index]===0;
 $('crosshair').classList.toggle('critical',open);$('target-label').textContent=index>=0?(open?'REAKTOR':'PANZERUNG'):'';
 $('fire').classList.toggle('active',input.fire&&!paused&&state.mode==='playing');
 $('dodge').classList.toggle('cooldown',state.dodgeCooldown>0);$('dodge').querySelector('small').textContent=state.dodgeCooldown>0?state.dodgeCooldown.toFixed(1)+' s':'AUSWEICHEN';
 $('alert').classList.toggle('show',alertLife>0);
 if(!storageAvailable)$('storage-note').textContent='Speichern ist im Browser blockiert. Der Demo-Schaden bleibt nur bis zum Neuladen erhalten.';
 if(finishedAt>=0&&idle-finishedAt>1.6&&$('result').hidden){
  if(live.allianceId){completeLive();return;}
  $('result-title').textContent=state.mode==='won'?'TITAN GEFALLEN.':state.shield<=0?'SCHIFF AUSGEFALLEN.':'ANGRIFF BEENDET.';
  $('result-detail').textContent='Dein Beitrag: '+fmt(state.damage)+' Schaden · '+state.hits+' Treffer. Gesamtschaden: '+fmt(state.maxHp-state.hp)+'. '+(state.hp>0?'Der nächste Angriff beginnt bei '+fmt(state.hp)+' Hüllenpunkten.':'Der Titan wurde über '+state.attempt+' Angriffe zerstört.');
  $('restart').textContent=state.hp>0?'NÄCHSTER ANGRIFF':'NEUEN TESTBOSS STARTEN';$('result').hidden=false;clearInput();
 }
}
function frame(now){const raw=(now-last)/1000;last=now;let dt=Math.min(.05,raw);frameMs=frameMs*.98+raw*1000*.02;if(!paused){idle+=dt;input.fire=firePointers.size>0||keys.has('Space');input.move=clamp(stickMove+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),-1,1);if(state.mode==='intro')state.time=idle;
 if(live.allianceId&&state.mode==='playing'&&dt>0){
  const q=n=>Math.round(n*1000000)/1000000;dt=Math.max(.000001,q(dt));state.aim={x:q(state.aim.x),y:q(state.aim.y)};state.viewRatio=q(state.viewRatio);input.move=q(input.move);
  live.record([dt,input.fire?1:0,input.move,state.aim.x,state.aim.y,pendingDodge,state.viewRatio]);if(pendingDodge)dodge(state,pendingDodge===2?0:pendingDodge);pendingDodge=0;
 }
 stepCombat(state,dt,input);processEvents();stepEffects(dt);frames++;}if(state.hp!==lastSavedHp&&idle-lastSave>.5){saveRaid();lastSave=idle;}render();hud();requestAnimationFrame(frame);}
requestAnimationFrame(frame);

// Read-only inspection used by the browser check; control remains through actual input.
window.nemesisDemo={snapshot:()=>({ready,aim:{...state.aim},firing:input.fire,moving:input.move,mode:state.mode,paused,time:state.time,hp:state.hp,shield:state.shield,maxHp:state.maxHp,attempt:state.attempt,limbs:{legs:2,arms:2},hits:state.hits,misses:state.misses,damage:state.damage,armor:[...state.armor],phase:state.phase,playerX:state.playerX,dodgeLeft:state.dodgeLeft,dodgeCooldown:state.dodgeCooldown,boss:bossPose(state),weakpoints:weakpoints(state),attack:state.attack?{...state.attack}:null,effects:{particles:particles.length,chunks:chunks.length,beams:beams.length,scars:scars.length},fps:Math.round(1000/frameMs),frames})};
