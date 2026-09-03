import { canRunAllianceBoss3D, startAllianceBoss3D } from "./alliance-boss-3d.js?v=12";

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const TAU = Math.PI * 2;

function image(src) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  return img;
}

function cover(ctx, img, x, y, w, h) {
  if (!img.complete || !img.naturalWidth) return;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale, sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function startAllianceBoss2D({ detail, playerScore = 0, api, fmt, toast, onDone }) {
  const maxPlayerHp = Math.min(6000, Math.round(600 + Math.sqrt(Math.max(0, Number(playerScore) || 0)) * 15));
  const bossDurability = 1 + (Math.max(1, Number(detail?.boss?.level) || 1) - 1) * .24;
  const wrap = document.createElement("section");
  wrap.className = "boss-game boss-game-v2";
  wrap.innerHTML = `<canvas aria-label="Allianz-Bosskampf"></canvas>
    <header class="boss-combat-top">
      <div class="boss-combat-level">ALLIANZ-OPERATION <b>LV. ${detail?.boss?.level || 1}</b></div>
      <div class="boss-combat-name"><small>ABYSSALER WELTENBRECHER</small><div><i><span></span></i><b data-boss-hp>100%</b></div></div>
      <button type="button" class="boss-game-exit" aria-label="Kampf verlassen">×</button>
    </header>
    <aside class="boss-combat-score"><small>SCHADEN</small><strong>0</strong><span data-combo>COMBO ×1</span><time data-boss-time>30.0</time></aside>
    <aside class="boss-combat-phase"><i></i><span>GEFECHTSBEREIT</span></aside>
    <div class="boss-combat-shield"><small>GEFECHTS-HÜLLE · ${fmt(Math.max(0, Number(playerScore) || 0))} SP</small><i><span></span></i><b>${maxPlayerHp}</b></div>
    <div class="boss-combat-reticle" aria-hidden="true"><i></i><span></span></div>
    <button type="button" class="boss-game-fire"><i></i><b>FEUER</b><small>HALTEN</small></button>
    <p class="boss-combat-help">Ziehen zum Zielen · Feuer halten · rote Schwachpunkte treffen</p>`;
  document.body.appendChild(wrap);

  const canvas = wrap.querySelector("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const fireButton = wrap.querySelector(".boss-game-fire");
  const scoreEl = wrap.querySelector(".boss-combat-score strong");
  const comboEl = wrap.querySelector("[data-combo]");
  const timerEl = wrap.querySelector("[data-boss-time]");
  const phaseEl = wrap.querySelector(".boss-combat-phase span");
  const phaseDot = wrap.querySelector(".boss-combat-phase i");
  const hpFill = wrap.querySelector(".boss-combat-name i span");
  const hpText = wrap.querySelector("[data-boss-hp]");
  const shieldFill = wrap.querySelector(".boss-combat-shield i span");
  const shieldText = wrap.querySelector(".boss-combat-shield b");
  const reticle = wrap.querySelector(".boss-combat-reticle");
  const bossArt = image("/assets/minigames/alliance-war-titan-v1.png");
  const cannonArt = image("/assets/minigames/alliance-autocannon-v1.png");
  const bgArt = image("/assets/minigames/alliance-battlefield-v1.png");

  let width = 0, height = 0, dpr = 1, raf = 0, closed = false, firing = false;
  let aimX = innerWidth * .5, aimY = innerHeight * .38, last = performance.now(), elapsed = 0;
  let shotClock = 0, enemyClock = 0, score = 0, combo = 1, comboLife = 0;
  let bossHp = 1, shield = maxPlayerHp, shake = 0, flash = 0, recoil = 0, heat = 0, phase = 0, intro = 1;
  const duration = 30;
  const stars = [], bolts = [], enemyBolts = [], particles = [], texts = [];
  const weakpoints = [
    { nx:.29, ny:.34, r:18, hp:1, seed:.2 },
    { nx:.52, ny:.37, r:22, hp:1, seed:1.8 },
    { nx:.76, ny:.37, r:18, hp:1, seed:3.4 },
  ];

  function resize() {
    width = innerWidth; height = innerHeight;
    const coarse = matchMedia?.("(pointer: coarse)")?.matches;
    dpr = Math.min(coarse ? 1.45 : 1.85, devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if (!stars.length) for (let i=0;i<(coarse?80:135);i++) stars.push({x:Math.random(),y:Math.random(),z:.2+Math.random()*.8,p:Math.random()*TAU});
  }

  function bossRect(now) {
    const bh = Math.min(height * .82, width * 1.28, 930);
    const bw = bh * (2 / 3);
    const entrance = 1 - Math.pow(clamp(intro,0,1), 3);
    return { x:width*.5-bw*.5 + Math.sin(now*.00065)*width*.012, y:height*.95-bh-(1-entrance)*height*.72, w:bw, h:bh };
  }

  function pointer(e) {
    aimX = clamp(e.clientX, 8, width-8); aimY = clamp(e.clientY, 70, height*.76);
    reticle.style.transform = `translate3d(${aimX}px,${aimY}px,0)`;
  }
  function burst(x,y,color,count=10,speed=130) {
    for(let i=0;i<count;i++){const a=Math.random()*TAU,s=(.25+Math.random()*.75)*speed;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.3+Math.random()*.45,max:.75,color,size:1+Math.random()*3});}
  }
  function floating(x,y,text,color="#ffe886",large=false){texts.push({x,y,text,color,life:.75,max:.75,large});}

  function fire(now) {
    if (!firing || intro > .05 || shotClock > 0) return;
    shotClock = .065;
    const muzzleY=height-Math.min(width*.62,410)*.63+recoil*13;
    const origins = [{x:width*.5-5,y:muzzleY},{x:width*.5+5,y:muzzleY}];
    for (const o of origins) bolts.push({x:o.x,y:o.y,tx:aimX+(Math.random()-.5)*5,ty:aimY+(Math.random()-.5)*5,life:.18,max:.18});
    recoil=Math.min(1,recoil+.48);heat=Math.min(1,heat+.028);shake=Math.max(shake,2.2);
    fireButton.classList.toggle("hot", Math.floor(now/90)%2===0);
  }

  function hitBoss(x,y,now) {
    const rect = bossRect(now);
    let hit = false, critical = false;
    for (const weak of weakpoints) {
      if (weak.hp <= 0) continue;
      const wx=rect.x+rect.w*weak.nx, wy=rect.y+rect.h*weak.ny;
      if (Math.hypot(x-wx,y-wy) < weak.r*1.75) {
        hit=true;critical=true;weak.hp=Math.max(0,weak.hp-.09);
        if(weak.hp===0){score+=10;combo=Math.min(8,combo+1.2);floating(wx,wy,"SYSTEM ZERSTÖRT","#fff0a0",true);burst(wx,wy,"#ffcb52",34,240);shake=13;}
        break;
      }
    }
    if (!hit && x>rect.x+rect.w*.08 && x<rect.x+rect.w*.94 && y>rect.y+rect.h*.16 && y<rect.y+rect.h*.84) hit=true;
    if (hit) {
      const gain=(critical?.62:.045)*Math.sqrt(combo);score=Math.min(250,score+gain);bossHp=Math.max(0,bossHp-(critical?.0022:.0008)/bossDurability);combo=Math.min(8,combo+(critical?.065:.012));comboLife=1.35;
      burst(x,y,critical?"#ffe35a":"#58dfff",critical?14:6,critical?175:100);
      if(critical && Math.random()<.34) floating(x,y,`KRIT +${gain}`,"#ffe46b");
      flash=Math.max(flash,critical?.16:.07);
    } else { combo=Math.max(1,combo-.18); }
  }

  function enemyFire(rect) {
    const phaseRate = phase===2 && Math.random() < .36 ? 2 : 1;
    for(let i=0;i<phaseRate;i++){
      const side=i?-.04:.04,x=rect.x+rect.w*(.52+side),y=rect.y+rect.h*.37;
      enemyBolts.push({x,y,tx:width*.5+(Math.random()-.5)*120,ty:height*.88,life:.72,max:.72,hit:false});
      burst(x,y,"#ff6a25",12,105);
    }
  }

  function update(dt,now) {
    elapsed += dt; intro=Math.max(0,intro-dt*.52); shotClock-=dt;enemyClock-=dt;comboLife-=dt;shake=Math.max(0,shake-dt*28);flash=Math.max(0,flash-dt);recoil=Math.max(0,recoil-dt*8);heat=Math.max(0,heat-dt*.12);
    if(comboLife<=0) combo=Math.max(1,combo-dt*1.8);
    const nextPhase=elapsed>20?2:elapsed>10?1:0;
    if(nextPhase!==phase){phase=nextPhase;phaseDot.classList.add("pulse");setTimeout(()=>phaseDot.classList.remove("pulse"),500);floating(width*.5,height*.24,`PHASE ${phase+1}`,"#ff7189",true);shake=9;}
    if(enemyClock<=0&&intro<=0){enemyClock=(phase===2?.48:phase===1?.7:.95);enemyFire(bossRect(now));}
    fire(now);
    for(let i=bolts.length-1;i>=0;i--){const b=bolts[i];b.life-=dt;if(b.life<=0){hitBoss(b.tx,b.ty,now);bolts.splice(i,1);}}
    for(let i=enemyBolts.length-1;i>=0;i--){const b=enemyBolts[i];b.life-=dt;if(b.life<=0){if(!b.hit){b.hit=true;const damage=Math.round(10+phase*4+(detail?.boss?.level||1)+Math.random()*4);shield=Math.max(0,shield-damage);floating(width*.5,height*.78,`−${damage} HÜLLE`,"#ff806e",true);shake=11;flash=.25;burst(b.tx,b.ty,"#ff5b45",25,230);wrap.classList.add("under-fire");setTimeout(()=>wrap.classList.remove("under-fire"),130);}enemyBolts.splice(i,1);}}
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;if(p.life<=0)particles.splice(i,1);}
    for(let i=texts.length-1;i>=0;i--){texts[i].life-=dt;texts[i].y-=26*dt;if(texts[i].life<=0)texts.splice(i,1);}
    scoreEl.textContent=Math.floor(score);timerEl.textContent=Math.max(0,duration-elapsed).toFixed(1);comboEl.textContent=`COMBO ×${Math.max(1,Math.floor(combo))}`;comboEl.classList.toggle("active",combo>=3);
    shieldFill.style.width=`${shield/maxPlayerHp*100}%`;shieldText.textContent=`${Math.ceil(shield)} / ${maxPlayerHp}`;hpFill.style.width=`${bossHp*100}%`;hpText.textContent=`${Math.ceil(bossHp*100)}%`;
    phaseEl.textContent=intro>.05?"FEINDKONTAKT":phase===0?"SCHILDPHASE":phase===1?"PLASMASALVEN":"KERN ÜBERLADEN";
  }

  function draw(now) {
    const sx=(Math.random()-.5)*shake, sy=(Math.random()-.5)*shake;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.save();ctx.translate(sx,sy);
    ctx.fillStyle="#27150f";ctx.fillRect(-20,-20,width+40,height+40);cover(ctx,bgArt,0,0,width,height);
    const dust=ctx.createLinearGradient(0,height*.35,0,height);dust.addColorStop(0,"rgba(118,54,21,0)");dust.addColorStop(1,"rgba(29,12,7,.58)");ctx.fillStyle=dust;ctx.fillRect(0,0,width,height);
    for(const s of stars){const lane=(s.x<.5?-1:1),x=width*.5+lane*(width*(.08+s.x*.44)),y=height*(.46+s.y*.34);ctx.globalAlpha=.24+s.z*.45;ctx.fillStyle=s.z>.62?"#43d9ff":"#17100c";ctx.fillRect(x,y,1+s.z*2,2+s.z*4);}
    ctx.globalAlpha=1;const rect=bossRect(now);ctx.save();ctx.globalAlpha=.42;ctx.fillStyle="#140804";ctx.beginPath();ctx.ellipse(rect.x+rect.w*.5,rect.y+rect.h*.965,rect.w*.38,rect.h*.035,0,0,TAU);ctx.fill();ctx.restore();ctx.save();ctx.globalAlpha=.99;ctx.drawImage(bossArt,rect.x,rect.y,rect.w,rect.h);ctx.restore();
    for(const weak of weakpoints){if(weak.hp<=0)continue;const x=rect.x+rect.w*weak.nx,y=rect.y+rect.h*weak.ny,pulse=1+Math.sin(now*.006+weak.seed)*.16;ctx.shadowColor="#ff344f";ctx.shadowBlur=18;ctx.strokeStyle="#ff5264";ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,weak.r*pulse,0,TAU);ctx.stroke();ctx.beginPath();ctx.arc(x,y,weak.r*.42,0,TAU);ctx.fillStyle=`rgba(255,54,77,${.55+.3*Math.sin(now*.01)})`;ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#330b14";ctx.fillRect(x-weak.r,y+weak.r+5,weak.r*2,3);ctx.fillStyle="#ff536a";ctx.fillRect(x-weak.r,y+weak.r+5,weak.r*2*weak.hp,3);}
    const cannonW=Math.min(width*.62,410),cannonH=cannonW*1.5,cx=width*.5-cannonW/2,cy=height-cannonH*.42+recoil*13;ctx.save();ctx.translate(width*.5,height*.96);ctx.rotate(clamp((aimX-width*.5)/width,-.18,.18));ctx.translate(-width*.5,-height*.96);ctx.drawImage(cannonArt,cx,cy,cannonW,cannonH);ctx.restore();
    if(firing&&intro<=.05){const mx=width*.5,my=cy+recoil*13,g=ctx.createRadialGradient(mx,my,2,mx,my,55+heat*25);g.addColorStop(0,"rgba(255,255,220,.98)");g.addColorStop(.18,"rgba(255,190,56,.92)");g.addColorStop(1,"rgba(255,77,18,0)");ctx.globalCompositeOperation="lighter";ctx.fillStyle=g;ctx.beginPath();ctx.arc(mx,my,58+heat*25,0,TAU);ctx.fill();}
    ctx.globalCompositeOperation="lighter";
    for(const b of bolts){const p=1-b.life/b.max,x=b.x+(b.tx-b.x)*p,y=b.y+(b.ty-b.y)*p,tail=Math.max(0,p-.18);ctx.strokeStyle="#56eaff";ctx.shadowColor="#28dfff";ctx.shadowBlur=16;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(b.x+(b.tx-b.x)*tail,b.y+(b.ty-b.y)*tail);ctx.lineTo(x,y);ctx.stroke();}
    for(const b of enemyBolts){const p=1-b.life/b.max,x=b.x+(b.tx-b.x)*p,y=b.y+(b.ty-b.y)*p,tail=Math.max(0,p-.15);ctx.strokeStyle="#ff493d";ctx.shadowColor="#ff271e";ctx.shadowBlur=18;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(b.x+(b.tx-b.x)*tail,b.y+(b.ty-b.y)*tail);ctx.lineTo(x,y);ctx.stroke();}
    for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=9;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,TAU);ctx.fill();}
    ctx.globalCompositeOperation="source-over";ctx.shadowBlur=0;ctx.globalAlpha=1;
    for(const t of texts){ctx.globalAlpha=clamp(t.life/t.max,0,1);ctx.fillStyle=t.color;ctx.font=`700 ${t.large?22:13}px Tektur, sans-serif`;ctx.textAlign="center";ctx.fillText(t.text,t.x,t.y);}
    ctx.globalAlpha=1;
    if(intro>.05){ctx.fillStyle=`rgba(0,0,0,${intro*.65})`;ctx.fillRect(0,0,width,height);ctx.globalAlpha=1-intro;ctx.fillStyle="#ff6075";ctx.font=`700 ${Math.min(32,width*.075)}px Tektur,sans-serif`;ctx.textAlign="center";ctx.fillText("FEINDKONTAKT",width*.5,height*.52);ctx.font="600 11px IBM Plex Mono,monospace";ctx.fillStyle="#b2c8d8";ctx.fillText("WAFFENSYSTEME ONLINE",width*.5,height*.52+24);}
    if(flash>0){ctx.fillStyle=`rgba(255,95,80,${flash*.45})`;ctx.fillRect(0,0,width,height);}
    ctx.restore();
  }

  function finish(cancel=false) {
    if(closed)return;closed=true;cancelAnimationFrame(raf);removeEventListener("resize",resize);document.removeEventListener("visibilitychange",visibility);
    if(cancel){wrap.remove();return;}
    firing=false;const finalScore=Math.max(0,Math.min(250,Math.floor(score)));wrap.classList.add("finished");wrap.insertAdjacentHTML("beforeend",`<div class="boss-game-result"><small>ALLIANZ-OPERATION BEENDET</small><em>${bossHp<.35?"VERNICHTENDER BESCHUSS":bossHp<.7?"SCHWERE TREFFER":"FEUERKONTAKT"}</em><strong>${finalScore}</strong><b>TAKTISCHE PUNKTE</b><span>Schadensdaten werden übertragen…</span><i></i></div>`);
    api("/alliances/boss/attack",{method:"POST",body:{score:finalScore}}).then(out=>{const result=wrap.querySelector(".boss-game-result");result.querySelector("span").textContent=`${fmt(out.result.damage)} Allianz-Schaden verursacht`;result.querySelector("i").textContent=out.result.defeated?"WELTENBRECHER VERNICHTET":"Nächster Angriff ist vorbereitet";setTimeout(()=>{wrap.remove();onDone?.();},2400);}).catch(err=>{toast(err.message,true);wrap.remove();});
  }
  function frame(now){if(closed)return;const dt=Math.min(.033,(now-last)/1000);last=now;update(dt,now);draw(now);if(elapsed>=duration||shield<=0||bossHp<=0)finish();else raf=requestAnimationFrame(frame);}
  function visibility(){if(document.hidden){firing=false;last=performance.now();}}
  wrap.addEventListener("pointermove",pointer);wrap.addEventListener("pointerdown",e=>{if(e.target.closest(".boss-game-exit"))return;pointer(e);firing=true;});wrap.addEventListener("pointerup",()=>firing=false);wrap.addEventListener("pointercancel",()=>firing=false);
  fireButton.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();firing=true;});fireButton.addEventListener("pointerup",e=>{e.preventDefault();e.stopPropagation();firing=false;});
  wrap.querySelector(".boss-game-exit").addEventListener("click",()=>finish(true));addEventListener("resize",resize);document.addEventListener("visibilitychange",visibility);resize();pointer({clientX:aimX,clientY:aimY});raf=requestAnimationFrame(frame);
}

export function startAllianceBossEncounter(options) {
  if (canRunAllianceBoss3D()) return startAllianceBoss3D(options);
  options.toast?.("WebGL nicht verfügbar – 2D-Kompatibilitätsmodus.");
  return startAllianceBoss2D(options);
}
