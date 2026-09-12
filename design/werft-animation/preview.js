/* Isolated visual prototype. No game imports, network API, persistence or game state. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('scene'), ctx = canvas.getContext('2d');
  const W = 1672, H = 941;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {ready:false, opening:0, running:!reduced, original:false, overview:false, time:0};
  let source, closed, last = 0, target = null, manualStart = 0, manualFrom = 0;
  // Coordinates in the approved panorama. The gate is recessed behind the existing frame.
  const gate = [[1197,321],[1327,345],[1325,383],[1196,359]];
  const ship = [[1197,369],[1205,359],[1218,354],[1230,346],[1246,342],[1261,342],[1277,344],[1287,351],[1292,354],[1287,359],[1294,364],[1285,371],[1269,369],[1259,376],[1238,377],[1224,375],[1210,379],[1199,376]];
  const polygon = points => {
    ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));ctx.closePath();
  };
  const ease = n => n*n*(3-2*n);
  const load = src => new Promise((resolve,reject) => {
    const img = new Image(); img.onload = () => resolve(img);img.onerror = () => reject(new Error('Die Vorschaugrafik konnte nicht geladen werden: '+src));img.src = src;
  });
  function crop() {
    if(state.overview)return {x:0,y:0,w:W,h:H};
    const ratio = canvas.clientWidth/canvas.clientHeight;
    const w = ratio>1.5 ? 620 : 465, h = w/ratio;
    return {x:1280-w/2,y:345-h/2,w,h};
  }
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1,2);
    const w = Math.round(canvas.clientWidth*dpr), h = Math.round(canvas.clientHeight*dpr);
    if(canvas.width!==w || canvas.height!==h){canvas.width=w;canvas.height=h;}
  }
  function draw() {
    if(!state.ready)return;
    fit(); ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#090d12';ctx.fillRect(0,0,canvas.width,canvas.height);
    const c=crop(),scale=Math.min(canvas.width/c.w,canvas.height/c.h);
    ctx.translate((canvas.width-c.w*scale)/2,(canvas.height-c.h*scale)/2);ctx.scale(scale,scale);ctx.translate(-c.x,-c.y);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,W,H);
    if(state.original)return;
    // Translate the generated shutter upward behind the original lintel. Only the doorway is composited.
    if(state.opening<1){
      ctx.save();polygon(gate);ctx.clip();
      ctx.translate(state.opening, -38*state.opening);
      polygon(gate);ctx.clip();ctx.drawImage(closed,0,0,W,H);ctx.restore();
      // Preserve the original ship in front of the shutter, including the wing crossing the opening.
      ctx.save();polygon(ship);ctx.clip();ctx.drawImage(source,0,0,W,H);ctx.restore();
    }
    const moving=state.running && state.opening>.01 && state.opening<.99;
    if(moving){
      // Light only the existing warm lamps; no additional fixtures or sprites.
      const strength=.09+.1*(.5+.5*Math.sin(state.time*4));
      ctx.save();ctx.globalCompositeOperation='screen';
      for(const [x,y] of [[1222,316],[1255,322],[1287,329]]){
        const light=ctx.createRadialGradient(x,y,0,x,y,4);
        light.addColorStop(0,`rgba(255,191,108,${strength})`);light.addColorStop(1,'rgba(255,164,77,0)');
        ctx.fillStyle=light;ctx.fillRect(x-4,y-4,8,8);
      }ctx.restore();
    }
  }
  function controls(){
    $('play').textContent=state.running?'Pause':'Animation';$('play').setAttribute('aria-pressed',String(state.running));
    $('original').textContent=state.original?'Zur Animation':'Original ansehen';$('original').setAttribute('aria-pressed',String(state.original));
    $('overview').setAttribute('aria-pressed',String(state.overview));$('detail').setAttribute('aria-pressed',String(!state.overview));
    $('door').textContent=state.opening>=.5?'Tor schließen':'Tor öffnen';
    $('opening').value=String(Math.round(state.opening*100));$('amount').textContent=Math.round(state.opening*100)+' %';
    $('phase').textContent=state.original?'ORIGINALGRAFIK':state.opening<.005?'HANGAR GESCHLOSSEN':state.opening>.995?'HANGAR GEÖFFNET':!state.running?'BEWEGUNG ANGEHALTEN':target!==null?(target?'TOR ÖFFNET':'TOR SCHLIESST'):(state.time%16<7?'TOR ÖFFNET':'TOR SCHLIESST');
  }
  function frame(now){
    const dt=last?Math.min((now-last)/1000,.05):0;last=now;
    if(state.ready && state.running && !state.original && !document.hidden){
      state.time+=dt;
      if(target!==null){
        const progress=Math.min((state.time-manualStart)/3.6,1);
        state.opening=manualFrom+(target-manualFrom)*ease(progress);
        if(progress===1){target=null;state.running=false;}
      }else{
        const t=state.time%16;
        state.opening=t<2?0:t<6?ease((t-2)/4):t<10?1:t<14?1-ease((t-10)/4):0;
      }
    }
    draw();controls();requestAnimationFrame(frame);
  }
  $('play').onclick=()=>{
    state.original=false;
    if(!state.running){target=null;state.time=2+4*inverseEase(state.opening);}
    state.running=!state.running;
  };
  function inverseEase(v){let lo=0,hi=1;for(let i=0;i<16;i++){const m=(lo+hi)/2;if(ease(m)<v)lo=m;else hi=m;}return (lo+hi)/2;}
  $('door').onclick=()=>{target=state.opening>=.5?0:1;manualFrom=state.opening;manualStart=state.time;state.original=false;state.running=true;};
  $('original').onclick=()=>{state.original=!state.original;};
  $('detail').onclick=()=>{state.overview=false;};$('overview').onclick=()=>{state.overview=true;};
  $('opening').oninput=e=>{state.opening=Number(e.target.value)/100;state.running=false;state.original=false;target=null;};
  window.werftPreview=Object.freeze({snapshot:()=>({...state,view:crop(),gate:gate.map(p=>[...p])})});
  Promise.all([load('basis-original.png'),load('tor-hintergrund.png')]).then(images=>{
    [source,closed]=images;state.ready=true;
    for(const id of ['play','door','original','opening'])$(id).disabled=false;
    requestAnimationFrame(frame);
  }).catch(err=>{$('error').textContent=err.message;$('error').hidden=false;$('phase').textContent='GRAFIK FEHLT';});
})();
