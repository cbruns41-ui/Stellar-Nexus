// Independent demo renderer. All ships, shots and effects are moving game objects.
export function createVisuals(ctx, art, view) {
  const TAU=Math.PI*2;
  let seed=81273;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const noise=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
  const smooth=t=>t*t*(3-2*t);
  function value(x,y){const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);return (noise(ix,iy)*(1-fx)+noise(ix+1,iy)*fx)*(1-fy)+(noise(ix,iy+1)*(1-fx)+noise(ix+1,iy+1)*fx)*fy;}
  function cloud(x,y){let n=0,amp=.56;for(let k=0;k<5;k++){n+=value(x,y)*amp;x=x*2.04+17;y=y*2.04-8;amp*=.5;}return n;}
  const nebula=document.createElement('canvas');nebula.width=640;nebula.height=960;
  const nc=nebula.getContext('2d'),data=nc.createImageData(640,960);
  for(let y=0;y<960;y++)for(let x=0;x<640;x++){
    const nx=x/640,ny=y/960;
    const f=cloud(nx*5,ny*7),ridge=Math.pow(Math.max(0,1-Math.abs(f-.53)*4),3);
    const edge=Math.min(1,Math.pow(Math.abs(nx-.5)*2,1.25)+Math.pow(Math.abs(ny-.5)*1.5,3));
    const brightness=Math.pow(f,2)*edge*.9,filament=ridge*edge*.28;
    const violet=smooth(Math.min(1,Math.max(0,(nx+ny-1)*1.4)));
    const i=(y*640+x)*4;
    data.data[i]=3+brightness*(18+violet*34)+filament*17;
    data.data[i+1]=10+brightness*(95-violet*48)+filament*63;
    data.data[i+2]=20+brightness*(120-violet*3)+filament*84;
    data.data[i+3]=255;
  }
  nc.putImageData(data,0,0);
  const stars=Array.from({length:1250},()=>({x:(rand()-.5)*7000,y:(rand()-.5)*10000,r:.6+rand()*2.3,a:.15+rand()*.7,p:rand()*TAU}));
  const rocks=[];
  for(let k=0;k<5;k++){
    const c=document.createElement('canvas');c.width=c.height=192;const g=c.getContext('2d');
    g.save();g.translate(96,96);g.beginPath();
    for(let j=0;j<15;j++){const a=j*TAU/15,r=62+rand()*21;j?g.lineTo(Math.cos(a)*r,Math.sin(a)*r):g.moveTo(Math.cos(a)*r,Math.sin(a)*r);}g.closePath();g.clip();
    const shade=g.createLinearGradient(-65,-75,75,70);shade.addColorStop(0,'#82939d');shade.addColorStop(.45,'#36404b');shade.addColorStop(1,'#0b131b');g.fillStyle=shade;g.fillRect(-96,-96,192,192);
    for(let j=0;j<1700;j++){g.globalAlpha=.05+rand()*.17;g.fillStyle=rand()<.5?'#bbc7cc':'#020610';const s=1+rand()*3;g.fillRect((rand()-.5)*190,(rand()-.5)*190,s,s);}
    g.globalAlpha=1;
    for(let j=0;j<15;j++){const x=(rand()-.5)*120,y=(rand()-.5)*120,r=3+rand()*14;const cr=g.createRadialGradient(x-r*.2,y-r*.3,1,x,y,r);cr.addColorStop(0,'#07121caa');cr.addColorStop(.7,'#19263077');cr.addColorStop(1,'#a0adb533');g.fillStyle=cr;g.beginPath();g.ellipse(x,y,r,r*.8,-.4,0,TAU);g.fill();}
    g.restore();rocks.push(c);
  }
  const asteroids=Array.from({length:65},(_,i)=>{const a=rand()*TAU,r=1040+rand()*1250;return{x:Math.cos(a)*r,y:Math.sin(a)*r*1.5,size:16+rand()*70,angle:rand()*TAU,speed:(rand()-.5)*.015,im:rocks[i%5]};});
  function glow(x,y,r,col,alpha=1){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,col);g.addColorStop(.25,col);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.restore();}
  function sprite(im,x,y,a,w,h){if(!im?.complete||!im.naturalWidth)return;ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.drawImage(im,-w/2,-h/2,w,h);ctx.restore();}
  function background(game){
    const v=view();ctx.fillStyle='#030913';ctx.fillRect(-12000,-16000,24000,32000);
    ctx.drawImage(nebula,-2500,-3750,5000,7500);
    for(const s of stars){ctx.globalAlpha=s.a*(.8+.2*Math.sin(game.time*.5+s.p));ctx.fillStyle=s.r>2.6?'#dcf0ff':'#779cb7';ctx.fillRect(s.x,s.y,s.r,s.r);if(s.r>2.88){ctx.fillStyle='#b9e6ff';ctx.fillRect(s.x-5,s.y+.7,12,1);ctx.fillRect(s.x+.7,s.y-5,1,12);}}
    ctx.globalAlpha=1;
    for(const rock of asteroids)sprite(rock.im,rock.x,rock.y,rock.angle+game.time*rock.speed,rock.size,rock.size);
    // Dust is decorative and cannot block projectiles.
    ctx.globalAlpha=.25;ctx.strokeStyle='#88a8bd';ctx.lineWidth=.65/v.cameraScale;ctx.beginPath();ctx.arc(0,0,view().ringR,0,TAU);ctx.stroke();ctx.globalAlpha=1;
  }
  function planet(game){
    const {planetR}=view();
    glow(0,0,planetR*1.55,'#116a99',.28);
    sprite(art.planet,0,0,0,planetR*2.65,planetR*2.65);
    const ratio=Math.max(0,game.hp/game.maxHp);
    ctx.strokeStyle=ratio>.35?'#77d8f9':'#ff9b65';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.arc(0,0,planetR*1.08,-Math.PI/2,-Math.PI/2+TAU*ratio*.3);ctx.stroke();
    if(game.hitFlash>0){glow(0,0,planetR*1.7,'#fc9b69',game.hitFlash*.18);ctx.globalAlpha=game.hitFlash;ctx.strokeStyle='#b9f4ff';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,planetR*1.23,game.aim-.8,game.aim+.8);ctx.stroke();ctx.globalAlpha=1;}
    ctx.lineCap='butt';
  }
  function slots(game){
    const v=view();ctx.lineWidth=1/v.cameraScale;
    for(let i=0;i<6;i++){const a=-Math.PI/2+i*TAU/6,x=Math.cos(a)*v.ringR,y=Math.sin(a)*v.ringR,t=game.towers.find(t=>t.slot===i);if(t)continue;
      const active=game.pendingSlot?.i===i;ctx.fillStyle='#07121bcc';ctx.strokeStyle=active?'#a6edff':'#a8c3d17a';ctx.beginPath();ctx.arc(x,y,24,0,TAU);ctx.fill();ctx.stroke();ctx.strokeStyle='#81a5bd44';ctx.beginPath();ctx.arc(x,y,29,0,TAU);ctx.stroke();
      ctx.font='20px sans-serif';ctx.fillStyle='#b8d8e377';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('+',x,y);
    }
  }
  function turret(t,player,game){
    const v=view();const a=player?game.aim:-Math.PI/2+t.slot*TAU/6;
    const x=Math.cos(a)*(player?v.planetR*.8:v.ringR),y=Math.sin(a)*(player?v.planetR*.8:v.ringR);
    const angle=player?game.aim:(Number.isFinite(t.ang)?t.ang:a),size=player?52:t.kind==='mine'?72:96;
    const im=player?art.battery:art.turrets[t.kind]||art.turrets.laser;
    sprite(im,x,y,angle+Math.PI/2,size,size);
    const flash=player?game.flash:t.flash||0;
    if(flash>0)glow(x+Math.cos(angle)*size*.37,y+Math.sin(angle)*size*.37,26,'#a5eaff',flash*.7);
    if(t.buildLeft>0){ctx.strokeStyle='#a5eaff';ctx.lineWidth=2/v.cameraScale;ctx.beginPath();ctx.arc(x,y,48,-Math.PI/2,-Math.PI/2+TAU*(1-t.buildLeft/4));ctx.stroke();}
  }
  function enemy(e,game){
    const v=view(),a=Math.atan2(-e.y,-e.x),h=e.heavy?165:105,im=e.heavy?art.frigate:art.interceptor;
    const w=h*(im.naturalWidth/im.naturalHeight||.68);
    const flame=.8+.2*Math.sin(game.time*33+e.wobble);
    glow(e.x-Math.cos(a)*h*.3,e.y-Math.sin(a)*h*.3,e.heavy?35:23,'#ff7336',flame*.32);
    sprite(im,e.x,e.y,a+Math.PI/2,w,h);
    if(e.flash>0)glow(e.x,e.y,30,'#ffc68c',e.flash*.4);
    if(e.hp<e.max){const bw=e.heavy?80:50;ctx.fillStyle='#1d283aaa';ctx.fillRect(e.x-bw/2,e.y-h*.4,bw,2/v.cameraScale);ctx.fillStyle='#db6b50';ctx.fillRect(e.x-bw/2,e.y-h*.4,bw*Math.max(0,e.hp/e.max),2/v.cameraScale);}
  }
  function numbers(game){
    const v=view();ctx.textAlign='center';ctx.font=`500 ${Math.max(20,11/v.cameraScale)}px "Segoe UI",sans-serif`;
    for(const n of game.numbers||[]){ctx.globalAlpha=Math.min(1,n.life*2);ctx.fillStyle=n.player?'#ffc47e':'#a9e8f7';ctx.fillText(n.text,n.x,n.y-(1-n.life)*38);}
    ctx.globalAlpha=1;
  }
  return {background,planet,slots,turret,enemy,numbers};
}
