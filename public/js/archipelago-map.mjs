import{makeModel,matchesFilter,MISSION_COLORS,flightProgress,flightEta}from'./archipelago-model.mjs?v=6';

// Drop-in createMap contract. No API calls, timers mutating the world, or global DOM handlers.
export function createMap(canvas,onSelect,onViewChange,options={}) {
  const ctx=canvas.getContext('2d',{alpha:false}),abort=new AbortController(),signal=abort.signal;
  let model=makeModel(),filter={},selected=null,pending=null,destroyed=false,raf=0,last=0,frames=0,hits=[],labels=[],W=1,H=1,dpr=1,serverAt=Date.now(),receivedAt=performance.now(),regionKey='',mode='';
  const cam={x:0,y:0,scale:.3},target={...cam},pointers=new Map();let gesture=null,route=null;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,textures=[],art=new Image();
  let ready=false,artFailed=false;
  art.src=options.assetUrl||new URL('../assets/map/galaxy-still-v4.jpg',import.meta.url).href;
  // Video 4 as the shared high-detail plate; only a light wash so siblings stay readable.
  const tints=['#8fd4ff14','#d2b8ff16','#efd7a816','#a8d2ff12','#cbb6f514','#efc8a014'];
  const motionSrc=new URL('../assets/map/galaxy-motion-v4.mp4',import.meta.url).href;
  const clips=[0,1,2].map(i=>{
    const v=document.createElement('video');
    v.muted=true;v.loop=true;v.playsInline=true;v.preload='auto';v.src=motionSrc;
    v.playbackRate=[.4,.52,.46][i];
    v.addEventListener('loadedmetadata',()=>{try{v.currentTime=[0,2.6,4.2][i]%(v.duration||1);}catch{}playClip(v);});
    return v;
  });
  function playClip(v){if(reduced||destroyed||document.hidden)return;v.play?.().catch(()=>{});}
  function bakeGalaxy(src,tint){
    const size=1536,c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');
    g.drawImage(src,0,0,size,size);
    g.globalCompositeOperation='source-atop';g.fillStyle=tint;g.fillRect(0,0,size,size);g.globalCompositeOperation='source-over';
    return c;
  }
  const load=art.decode().then(()=>{if(destroyed)return;for(let i=0;i<6;i++)textures.push(bakeGalaxy(art,tints[i]));ready=true;clips.forEach(playClip);}).catch(()=>{artFailed=true;options.onError?.('Die Galaxiegrafik konnte nicht geladen werden. Systeme bleiben erreichbar.');});
  const rect=()=>canvas.getBoundingClientRect(),screen=(x,y)=>({x:(x-cam.x)*cam.scale+W/2,y:(y-cam.y)*cam.scale+H/2});
  const world=(x,y)=>({x:(x-W/2)/cam.scale+cam.x,y:(y-H/2)/cam.scale+cam.y});
  const local=e=>{const r=rect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  const emit=()=>{const next=cam.scale<.72?'sector':cam.scale<2.15?'system':'orbit';if(next!==mode){mode=next;onViewChange?.({mode,scale:cam.scale});}};
  const clock=()=>serverAt+performance.now()-receivedAt;
  const currentNodes=()=>model.systems.filter(n=>matchesFilter(n.source,model.self,filter));
  function resize(){const r=rect();W=Math.max(1,r.width);H=Math.max(1,r.height);dpr=Math.min(devicePixelRatio||1,1.6,Math.sqrt(2200000/(W*H)));canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  canvas.style.touchAction='none';
  function overview(){if(!model.regions.length)return;const g=model.regions,l=Math.min(...g.map(g=>g.x-g.r)),r=Math.max(...g.map(g=>g.x+g.r)),t=Math.min(...g.map(g=>g.y-g.r)),b=Math.max(...g.map(g=>g.y+g.r));Object.assign(target,{x:(l+r)/2,y:(t+b)/2,scale:Math.max(.04,Math.min((W-32)/(r-l),(H-130)/(b-t)))});options.onRegionChange?.(null);}
  function focusRegion(id){const g=model.regions.find(g=>g.id===id);if(!g)return;selected=null;Object.assign(target,{x:g.x,y:g.y,scale:Math.max(.08,Math.min((W-32)/(g.r*1.9),(H-115)/(g.r*1.9)))});options.onRegionChange?.(g);}
  function focus(id,scale=2,opts,open=true){if(!model.systems.length){pending=()=>focus(id,scale,opts,open);return;}const n=model.byId.get(id);if(!n)return;selected=id;Object.assign(target,{x:n.x,y:n.y,scale:Math.min(12,Math.max(.04,scale))});options.onRegionChange?.(model.regions.find(g=>g.id===n.regionId));if(open)onSelect?.(n.source,opts);}
  function zoom(f,x=W/2,y=H/2){const p=world(x,y),scale=Math.max(.04,Math.min(12,target.scale*f));Object.assign(target,{scale,x:p.x-(x-W/2)/scale,y:p.y-(y-H/2)/scale});}
  canvas.addEventListener('wheel',e=>{e.preventDefault();const p=local(e);zoom(Math.exp(-e.deltaY*.0015),p.x,p.y);},{passive:false,signal});
  canvas.addEventListener('pointerdown',e=>{const p=local(e);try{canvas.setPointerCapture(e.pointerId);}catch{}pointers.set(e.pointerId,p);Object.assign(target,cam);if(pointers.size===1)gesture={x:p.x,y:p.y,cx:cam.x,cy:cam.y,moved:false};else{const[a,b]=[...pointers.values()];gesture={pinch:true,d:Math.max(10,Math.hypot(a.x-b.x,a.y-b.y)),scale:cam.scale,anchor:world((a.x+b.x)/2,(a.y+b.y)/2),moved:true};}},{signal});
  canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;const p=local(e);pointers.set(e.pointerId,p);if(gesture.pinch&&pointers.size===2){const[a,b]=[...pointers.values()],scale=Math.max(.04,Math.min(12,gesture.scale*Math.hypot(a.x-b.x,a.y-b.y)/gesture.d));Object.assign(cam,{scale,x:gesture.anchor.x-((a.x+b.x)/2-W/2)/scale,y:gesture.anchor.y-((a.y+b.y)/2-H/2)/scale});}else if(!gesture.pinch){const dx=p.x-gesture.x,dy=p.y-gesture.y;if(Math.hypot(dx,dy)>8)gesture.moved=true;if(gesture.moved)Object.assign(cam,{x:gesture.cx-dx/cam.scale,y:gesture.cy-dy/cam.scale});}Object.assign(target,cam);},{signal});
  function end(e,cancel=false){if(!pointers.has(e.pointerId))return;const p=local(e),tap=!cancel&&gesture&&!gesture.moved&&!gesture.pinch;pointers.delete(e.pointerId);if(tap){const hit=hits.map(h=>({...h,d:Math.hypot(h.x-p.x,h.y-p.y)})).filter(h=>h.d<(e.pointerType==='touch'?28:18)).sort((a,b)=>a.d-b.d)[0];const textHit=!hit&&labels.find(b=>p.x>=b.l&&p.x<=b.r&&p.y>=b.t&&p.y<=b.b&&b.id!=null);const id=hit?.id??textHit?.id;if(id!=null){selected=id;onSelect?.(model.byId.get(id).source);}else{const w=world(p.x,p.y),g=model.regions.find(g=>Math.hypot(w.x-g.x,w.y-g.y)<g.r);if(g)focusRegion(g.id);else{selected=null;onSelect?.(null);}}}if(!pointers.size)gesture=null;else if(pointers.size===1){const a=[...pointers.values()][0];gesture={x:a.x,y:a.y,cx:cam.x,cy:cam.y,moved:true};}}
  canvas.addEventListener('pointerup',e=>end(e),{signal});canvas.addEventListener('pointercancel',e=>end(e,true),{signal});
  function label(text,x,y,color='#b5cbd8',id=null){ctx.font='11px "Segoe UI",sans-serif';const b={l:x-3,r:x+ctx.measureText(text).width+6,t:y-13,b:y+7,id};if(b.l<5||b.r>W-5||b.t<5||b.b>H-5||labels.some(v=>b.l<v.r&&b.r>v.l&&b.t<v.b&&b.b>v.t))return;labels.push(b);ctx.shadowColor='#000';ctx.shadowBlur=5;ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.shadowBlur=0;}
  function glow(x,y,r,color){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
  function drawGalaxyDisk(g,p,r,t){
    const i=Math.abs(Number(g.id)||0)%6,clip=clips[i%3],tint=tints[i],dir=i%2?-1:1,flip=i===1||i===4?-1:1;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(reduced?0:t*.000035*dir);ctx.scale(flip,1);
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();
    const src=(clip&&clip.readyState>=2)?clip:textures[i];
    if(src){ctx.globalAlpha=Math.max(.3,.9/Math.max(1,cam.scale*.65));ctx.drawImage(src,-r,-r,r*2,r*2);ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=1;ctx.fillStyle=tint;ctx.fillRect(-r,-r,r*2,r*2);ctx.globalCompositeOperation='source-over';}
    else{ctx.globalAlpha=1;glow(0,0,r,(g.color||'#83dafa')+'30');}
    ctx.restore();
    const hole=Math.max(2.2,r*.03);ctx.fillStyle='#000';ctx.beginPath();ctx.arc(p.x,p.y,hole,0,Math.PI*2);ctx.fill();
  }
  function drawGate(n,p){
    const g=model.regions.find(r=>r.id===n.regionId),col=g?.color||'#91deee',rad=n.id===selected?8:6;
    glow(p.x,p.y,rad*4.2,col+'55');
    ctx.strokeStyle='#e7fbff';ctx.lineWidth=n.id===selected?2:1.5;ctx.beginPath();
    ctx.moveTo(p.x,p.y-rad*1.7);ctx.lineTo(p.x+rad*1.2,p.y);ctx.lineTo(p.x,p.y+rad*1.7);ctx.lineTo(p.x-rad*1.2,p.y);ctx.closePath();ctx.stroke();
    ctx.strokeStyle=col;ctx.globalAlpha=.9;ctx.beginPath();ctx.arc(p.x,p.y,rad*1.45,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle='#081018';ctx.beginPath();ctx.arc(p.x,p.y,rad*.5,0,Math.PI*2);ctx.fill();
    hits.push({id:n.id,x:p.x,y:p.y});label('Sprungtor',p.x+12,p.y+4,col,n.id);
  }
  function curve(a,b,color,dash=false){const p=screen(a.x,a.y),q=screen(b.x,b.y),bend=Math.min(100,Math.hypot(p.x-q.x,p.y-q.y)*.15),mx=(p.x+q.x)/2,my=(p.y+q.y)/2-bend;ctx.strokeStyle=color;ctx.lineWidth=.8;ctx.setLineDash(dash?[4,6]:[]);ctx.beginPath();ctx.moveTo(p.x,p.y);if(a.id===b.id){ctx.arc(p.x,p.y-17,17,Math.PI/2,Math.PI*2.5);}else ctx.quadraticCurveTo(mx,my,q.x,q.y);ctx.stroke();ctx.setLineDash([]);return{p,q,mx,my};}
  function draw(t){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#03070e';ctx.fillRect(0,0,W,H);hits=[];labels=[];
    for(let i=0;i<280;i++){const x=((i*71.731-cam.x*.02)%W+W)%W,y=((i*i*3.177-cam.y*.02)%H+H)%H;ctx.fillStyle=i%5?'#627a8b80':'#c4dced90';ctx.fillRect(x,y,i%5?.7:1.1,i%5?.7:1.1);}
    for(const g of model.regions){const p=screen(g.x,g.y),r=g.r*cam.scale;if(p.x+r<0||p.x-r>W||p.y+r<0||p.y-r>H)continue;drawGalaxyDisk(g,p,r,t);if(cam.scale<.6)label(g.name,p.x-r*.25,p.y+r*.86,g.color);}
    if(selected!=null)for(const l of model.links){if(l.a===selected||l.b===selected)curve(model.byId.get(l.a),model.byId.get(l.b),'#8bbed34d');}
    const nodes=currentNodes().filter(n=>{const p=screen(n.x,n.y);return p.x>-25&&p.x<W+25&&p.y>-25&&p.y<H+25;});
    const priority=n=>n.id===selected?100:n.id===model.self.homeSystemId?90:n.categories.own?80:n.categories.alliance?60:n.source.isGate?58:n.source.rift?55:n.source.isHub?50:n.source.fleetCount?40:0;
    nodes.sort((a,b)=>priority(b)-priority(a)||a.id-b.id);const occupied=new Set(),cell=cam.scale<.65?55:cam.scale<1.4?30:cam.scale<2.5?20:cam.scale<5?12:0;
    for(const n of nodes){const p=screen(n.x,n.y),key=Math.floor(p.x/Math.max(cell,1))+':'+Math.floor(p.y/Math.max(cell,1));if(n.source.isGate){drawGate(n,p);continue;}if(cell&&occupied.has(key)&&n.id!==selected)continue;occupied.add(key);const s=n.source,c=n.categories,color=c.own?'#8fe6ff':c.alliance?'#8de0ba':s.warlord?'#f4ce76':c.hostile?'#ff9679':s.rift?'#c7adff':s.star?.color||'#d9dce8',rad=n.id===selected?4:c.own?3:2;
      glow(p.x,p.y,rad*3,color+'60');ctx.fillStyle='#edf5ff';ctx.beginPath();ctx.arc(p.x,p.y,rad,0,Math.PI*2);ctx.fill();if(priority(n)>0||c.hostile){ctx.strokeStyle=color;ctx.lineWidth=n.id===selected?1.5:.65;ctx.beginPath();ctx.arc(p.x,p.y,n.id===selected?13:7,0,Math.PI*2);ctx.stroke();}hits.push({id:n.id,x:p.x,y:p.y});if(n.id===selected||cam.scale>.8||c.own||s.isHub)label(s.name,p.x+12,p.y+4,color,n.id);if(s.fleetCount>0&&cam.scale>.7)label('✦ '+s.fleetCount,p.x+12,p.y+21,'#8fe6ff');}
    const now=clock();for(const f of model.flights){const a=model.byId.get(f.originSystemId),b=model.byId.get(f.targetSystemId),color=f.friendly===false?'#ff758c':MISSION_COLORS[f.mission]||'#91d6f5',{p,q,mx,my}=curve(a,b,color+'8c',f.returning),u=flightProgress(f,now);let x=(1-u)**2*p.x+2*(1-u)*u*mx+u*u*q.x,y=(1-u)**2*p.y+2*(1-u)*u*my+u*u*q.y,angle=Math.atan2(q.y-p.y,q.x-p.x);if(a.id===b.id){angle=u*Math.PI*2;x=p.x+Math.sin(angle)*17;y=p.y-17+Math.cos(angle)*17;}ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-4,4);ctx.lineTo(-2,0);ctx.lineTo(-4,-4);ctx.closePath();ctx.fill();ctx.restore();if(cam.scale>.65||a.id===selected||b.id===selected)label(`${f.shipCount||0} · ${f.returning?'Rückflug · ':''}${flightEta(f,now)}`,x+10,y+17,color);}
    if(route){const a=model.byId.get(route.a),b=model.byId.get(route.b);if(a&&b)curve(a,b,'#c7f3ffb0',true);}frames++;
  }
  function loop(t){if(destroyed)return;raf=requestAnimationFrame(loop);if(document.hidden||!canvas.isConnected)return;const frameMs=reduced?100:W<760?33:22;if(t-last<frameMs)return;const dt=Math.min(.1,(t-last)/1000||.02);last=t;if(!pointers.size){const k=reduced?1:1-Math.exp(-dt*10);for(const key of ['x','y','scale'])cam[key]+=(target[key]-cam[key])*k;}emit();draw(t);}
  document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden)clips.forEach(v=>v.pause());else clips.forEach(playClip);},{signal});raf=requestAnimationFrame(loop);
  const api={
    setData(payload){if(destroyed)return;const first=!model.systems.length;model=makeModel(payload);serverAt=Number.isFinite(payload.now)?payload.now:Date.now();receivedAt=performance.now();if(selected!=null&&!model.byId.has(selected)){selected=null;onSelect?.(null);}const key=model.regions.map(g=>g.id+':'+g.name).join('|');if(key!==regionKey){regionKey=key;options.onRegions?.(model.regions);}if(first){overview();Object.assign(cam,target);}if(pending){const fn=pending;pending=null;fn();}},
    setFilter(next){filter={...filter,...next};},
    focusHome(open){const home=model.byId.get(model.self.homeSystemId)||model.systems.find(n=>n.categories.own);if(home)focus(home.id,2.7,undefined,!!open);},
    focusSystem(id,scale){focus(id,scale);},focusPlanet(planetId,systemId){focus(systemId,2.4,{planetId:Number(planetId)||0});},
    setHighlight(id){selected=id;},
    setCenter(x,y,scale){const original=model.systems.find(n=>n.source.x===x&&n.source.y===y);if(original)focus(original.id,scale,undefined,false);else Object.assign(target,{x,y,scale:Math.max(.04,Math.min(12,scale||cam.scale))});},
    setView(next){if(next==='sector')overview();else{const n=model.byId.get(selected)||model.byId.get(model.self.homeSystemId);if(n)focus(n.id,next==='orbit'?2.8:1.2,undefined,false);}},
    overview,focusRegion,zoom,resize,
    setPreviewRoute(a,b){route=a==null?null:{a,b};},
    getRegions:()=>model.regions,
    inspect:()=>({camera:{x:cam.x,y:cam.y,z:cam.scale},selected,frames,hits:hits.map(h=>({...h})),ready,artFailed,destroyed,systems:model.systems.length,flights:model.flights.map(f=>({id:f.id,progress:flightProgress(f,clock()),eta:flightEta(f,clock())}))}),
    ready:load,
    destroy(){if(destroyed)return;destroyed=true;cancelAnimationFrame(raf);abort.abort();observer.disconnect();pointers.clear();for(const v of clips){v.pause();v.removeAttribute('src');v.load();}for(const c of textures){c.width=c.height=1;}textures.length=0;hits=[];}
  };return api;
}
