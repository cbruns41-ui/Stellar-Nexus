import * as THREE from "/vendor/three.module.min.js?v=1";

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch { return false; }
}

export function canRunAllianceBoss3D() { return webglAvailable(); }

export function startAllianceBoss3D({ detail, playerScore = 0, api, fmt, toast, onDone }) {
  const maxHp = Math.min(6000, Math.round(600 + Math.sqrt(Math.max(0, Number(playerScore) || 0)) * 15));
  const bossLevel = Math.max(1, Number(detail?.boss?.level) || 1), bossDurability = 1 + (bossLevel - 1) * .24;
  const layer = document.createElement("section");
  layer.className = "boss-game boss-game-v2 boss-game-3d";
  layer.innerHTML = `<canvas aria-label="3D Allianz-Bosskampf"></canvas>
    <header class="boss-combat-top"><div class="boss-combat-level">3D ALLIANZ-OPERATION <b>LV. ${detail?.boss?.level || 1}</b></div><div class="boss-combat-name"><small>ABYSSALER WELTENBRECHER</small><div><i><span></span></i><b data-boss-hp>100%</b></div></div><button type="button" class="boss-game-exit" aria-label="Kampf verlassen">×</button></header>
    <aside class="boss-combat-score"><small>SCHADEN</small><strong>0</strong><span data-combo>COMBO ×1</span><time data-boss-time>30.0</time></aside>
    <aside class="boss-combat-phase"><i></i><span>3D-SYSTEME ONLINE</span></aside>
    <div class="boss-combat-shield"><small>GEFECHTS-HÜLLE · ${fmt(Number(playerScore) || 0)} SP</small><i><span></span></i><b>${maxHp} / ${maxHp}</b></div>
    <div class="boss-combat-reticle" aria-hidden="true"><i></i><span></span></div>
    <button type="button" class="boss-game-fire"><i></i><b>FEUER</b><small>HALTEN</small></button>
    <p class="boss-combat-help">Ziehen zum Zielen · Feuer halten · glühende Kerne treffen</p>`;
  document.body.appendChild(layer);

  const canvas = layer.querySelector("canvas"), fireButton = layer.querySelector(".boss-game-fire"), reticle = layer.querySelector(".boss-combat-reticle");
  const scoreEl = layer.querySelector(".boss-combat-score strong"), comboEl = layer.querySelector("[data-combo]"), timerEl = layer.querySelector("[data-boss-time]");
  const phaseEl = layer.querySelector(".boss-combat-phase span"), bossBar = layer.querySelector(".boss-combat-name i span"), bossText = layer.querySelector("[data-boss-hp]");
  const hullBar = layer.querySelector(".boss-combat-shield i span"), hullText = layer.querySelector(".boss-combat-shield b");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !matchMedia("(pointer:coarse)").matches, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia("(pointer:coarse)").matches ? 1.35 : 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x6b321d, .018);
  const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, .1, 160); camera.position.set(0, 3.2, 11); camera.lookAt(0, 3, -15);
  const clock = new THREE.Clock(), raycaster = new THREE.Raycaster(), pointerNdc = new THREE.Vector2(0, -.05);

  scene.add(new THREE.HemisphereLight(0xffd0a0, 0x172332, 2.1));
  const sun = new THREE.DirectionalLight(0xffad69, 4.6); sun.position.set(-8, 15, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;scene.add(sun);
  const rim = new THREE.DirectionalLight(0x55dfff, 3.2); rim.position.set(9, 7, -14); scene.add(rim);
  const gunLight=new THREE.PointLight(0xbcefff,12,18,1.6);gunLight.position.set(0,7,10);scene.add(gunLight);

  function makeGroundTexture(){const c=document.createElement("canvas");c.width=c.height=512;const g=c.getContext("2d"),data=g.createImageData(512,512);for(let i=0;i<data.data.length;i+=4){const n=Math.random()*38|0;data.data[i]=68+n;data.data[i+1]=34+(n*.52|0);data.data[i+2]=22+(n*.3|0);data.data[i+3]=255;}g.putImageData(data,0,0);g.globalAlpha=.34;for(let i=0;i<420;i++){g.fillStyle=i%4?"#2b1710":"#b06935";const x=Math.random()*512,y=Math.random()*512,r=.5+Math.random()*4;g.beginPath();g.ellipse(x,y,r*2,r,Math.random()*Math.PI,0,Math.PI*2);g.fill();}g.globalAlpha=.46;g.strokeStyle="#1b0d09";g.lineWidth=2;for(let i=0;i<35;i++){let x=Math.random()*512,y=Math.random()*512;g.beginPath();g.moveTo(x,y);for(let k=0;k<5;k++){x+=(Math.random()-.5)*28;y+=8+Math.random()*18;g.lineTo(x,y);}g.stroke();}const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(8,12);texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return texture;}
  const groundMat = new THREE.MeshStandardMaterial({ color:0x9a6446, map:makeGroundTexture(), roughness:.96, metalness:.03, transparent:true, opacity:.46 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90,130,18,28),groundMat); ground.rotation.x=-Math.PI/2;ground.position.set(0,-.05,-35);ground.receiveShadow=true;
  const pos=ground.geometry.attributes.position;for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);pos.setZ(i,Math.sin(x*.55)*.18+Math.sin(y*.21)*.22+Math.random()*.12);}pos.needsUpdate=true;ground.geometry.computeVertexNormals();scene.add(ground);
  const rockMat = new THREE.MeshStandardMaterial({color:0x382018,roughness:1});
  for(let i=0;i<34;i++){const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.3+Math.random()*1.15,0),rockMat);const side=Math.random()<.5?-1:1;rock.position.set(side*(5+Math.random()*17),Math.random()*.45,-8-Math.random()*60);rock.scale.y=.5+Math.random()*1.4;rock.rotation.set(Math.random(),Math.random(),Math.random());rock.castShadow=true;scene.add(rock);}
  const trenchMat=new THREE.MeshStandardMaterial({color:0x292322,metalness:.56,roughness:.65});
  for(const side of [-1,1])for(let i=0;i<8;i++){const wall=new THREE.Mesh(new THREE.BoxGeometry(.34,.65,5.2),trenchMat);wall.position.set(side*(5.4+Math.sin(i)*.7),.24,-3-i*7.2);wall.rotation.y=side*(.08+Math.sin(i*.8)*.11);wall.castShadow=true;wall.receiveShadow=true;scene.add(wall);for(let j=0;j<3;j++){const brace=new THREE.Mesh(new THREE.BoxGeometry(.72,.18,.2),trenchMat);brace.position.set(wall.position.x-side*.25,.58,wall.position.z-1.7+j*1.7);brace.rotation.y=wall.rotation.y;scene.add(brace);}}
  const scorchMat=new THREE.MeshBasicMaterial({color:0x130806,transparent:true,opacity:.58,depthWrite:false});
  for(let i=0;i<18;i++){const mark=new THREE.Mesh(new THREE.CircleGeometry(.5+Math.random()*1.4,18),scorchMat);mark.rotation.x=-Math.PI/2;mark.position.set((Math.random()-.5)*19,.025,-4-Math.random()*48);mark.scale.y=.45+Math.random()*.55;scene.add(mark);}
  const debrisMat=new THREE.MeshStandardMaterial({color:0x31373a,metalness:.78,roughness:.48});
  for(let i=0;i<28;i++){const debris=new THREE.Mesh(i%3?new THREE.BoxGeometry(.18+Math.random()*.55,.1+Math.random()*.2,.5+Math.random()*1.3):new THREE.CylinderGeometry(.12,.16,.8+Math.random(),8),debrisMat);const side=Math.random()<.5?-1:1;debris.position.set(side*(2.8+Math.random()*7),.12,-3-Math.random()*45);debris.rotation.set(Math.random()*1.2,Math.random()*Math.PI,Math.random());debris.castShadow=true;scene.add(debris);}
  for(const [x,z] of [[-4,-12],[5,-22],[-7,-35]]){const coal=new THREE.Mesh(new THREE.IcosahedronGeometry(.28,1),new THREE.MeshBasicMaterial({color:0xff5a16}));coal.position.set(x,.22,z);scene.add(coal);const glow=new THREE.PointLight(0xff4818,8,7,2);glow.position.set(x,.8,z);scene.add(glow);}
  for(const child of scene.children)if(child.isMesh)child.visible=false;

  const boss = new THREE.Group(); boss.position.set(0,0,-20); scene.add(boss);
  const flesh = new THREE.MeshStandardMaterial({color:0x171922,roughness:.38,metalness:.58});
  const bone = new THREE.MeshStandardMaterial({color:0xc7b89b,roughness:.62,metalness:.12});
  const ember = new THREE.MeshStandardMaterial({color:0xff4a12,emissive:0xff2100,emissiveIntensity:5,roughness:.22});
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(3.15,2),flesh);body.scale.set(1,1.3,.68);body.position.y=7.1;body.castShadow=true;boss.add(body);
  const chest = new THREE.Mesh(new THREE.ConeGeometry(2.8,4.6,7,1,true),bone);chest.rotation.z=Math.PI;chest.position.set(0,8.2,1);chest.scale.z=.38;chest.castShadow=true;boss.add(chest);
  const head = new THREE.Mesh(new THREE.ConeGeometry(1.18,3.4,6),bone);head.position.set(0,11.35,.1);head.rotation.x=-.1;head.castShadow=true;boss.add(head);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(.35,18,12),ember);eye.position.set(0,11.35,1.18);boss.add(eye);
  const limbs=[];
  function limb(x, upperY, lowerY) { const group=new THREE.Group();const upper=new THREE.Mesh(new THREE.CapsuleGeometry(.62,3,8,12),flesh);upper.position.set(x,upperY,0);upper.rotation.z=x>0?-.28:.28;upper.castShadow=true;const lower=new THREE.Mesh(new THREE.CapsuleGeometry(.48,3.3,8,12),bone);lower.position.set(x*1.18,lowerY,.05);lower.rotation.z=x>0?.18:-.18;lower.castShadow=true;group.add(upper,lower);boss.add(group);limbs.push(group); }
  limb(-3.35,7.1,3.6);limb(3.35,7.1,3.6);
  for(const x of [-1.45,1.45]){const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.72,4.7,8,12),flesh);leg.position.set(x,2.55,0);leg.rotation.z=x*.035;leg.castShadow=true;boss.add(leg);const foot=new THREE.Mesh(new THREE.BoxGeometry(1.65,.55,2.6),bone);foot.position.set(x,.35,.55);foot.rotation.y=x*.08;foot.castShadow=true;boss.add(foot);}
  for(let i=0;i<7;i++){const spike=new THREE.Mesh(new THREE.ConeGeometry(.26,.9+i*.08,6),bone);spike.position.set((i-3)*.72,9.1-Math.abs(i-3)*.16,-1.35);spike.rotation.x=-1.2;boss.add(spike);}
  const weakpoints=[];
  for(const [x,y,s] of [[0,8.05,.78],[-2.55,8.5,.57],[2.55,8.5,.57]]){const w=new THREE.Mesh(new THREE.SphereGeometry(s,24,16),ember.clone());w.position.set(x,y,2.05);w.material.depthTest=false;w.renderOrder=5;w.userData={weak:true,hp:1};boss.add(w);weakpoints.push(w);const ring=new THREE.Mesh(new THREE.TorusGeometry(s*1.35,.08,10,32),new THREE.MeshBasicMaterial({color:0xffb12b,depthTest:false}));ring.position.copy(w.position);ring.renderOrder=5;boss.add(ring);w.userData.ring=ring;}
  const loader=new THREE.TextureLoader();
  const bossPortrait=new THREE.Mesh(new THREE.PlaneGeometry(10.4,15.6),new THREE.MeshBasicMaterial({transparent:true,alphaTest:.025,depthWrite:false,toneMapped:false}));bossPortrait.position.set(0,7.65,1.25);bossPortrait.renderOrder=2;boss.add(bossPortrait);
  const bossEffects=new Set([bossPortrait,...weakpoints,...weakpoints.map(w=>w.userData.ring)]);boss.traverse(child=>{if(child.isMesh&&!bossEffects.has(child)){child.material.colorWrite=false;child.material.depthWrite=false;}});
  loader.load("/assets/minigames/alliance-war-titan-v1.png",tex=>{tex.colorSpace=THREE.SRGBColorSpace;bossPortrait.material.map=tex;bossPortrait.material.needsUpdate=true;for(const mat of [flesh,bone]){mat.transparent=true;mat.opacity=0;mat.depthWrite=false;}});

  const cannon = new THREE.Group();cannon.position.set(0,.05,5.35);scene.add(cannon);
  const gunMetal=new THREE.MeshStandardMaterial({color:0x647780,metalness:.82,roughness:.26}),gunDark=new THREE.MeshStandardMaterial({color:0x202a30,metalness:.76,roughness:.36}),gunEdge=new THREE.MeshStandardMaterial({color:0x4f9fb4,emissive:0x0b9fc7,emissiveIntensity:1.8,metalness:.7,roughness:.2}),brass=new THREE.MeshStandardMaterial({color:0xc28a35,metalness:.82,roughness:.3});
  const base=new THREE.Mesh(new THREE.CylinderGeometry(1.55,1.82,.62,24),gunDark);base.position.y=.31;base.castShadow=true;cannon.add(base);
  const baseRing=new THREE.Mesh(new THREE.TorusGeometry(1.48,.13,10,32),gunEdge);baseRing.rotation.x=Math.PI/2;baseRing.position.y=.64;cannon.add(baseRing);
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(.92,1.22,.72,18),gunMetal);pedestal.position.y=.93;pedestal.castShadow=true;cannon.add(pedestal);
  const barrelPivot=new THREE.Group();barrelPivot.position.set(0,1.48,0);cannon.add(barrelPivot);
  const housing=new THREE.Mesh(new THREE.BoxGeometry(1.72,1.08,2.25),gunMetal);housing.position.z=-.25;housing.castShadow=true;barrelPivot.add(housing);
  const housingTop=new THREE.Mesh(new THREE.CylinderGeometry(.58,.72,1.75,8),gunDark);housingTop.rotation.x=Math.PI/2;housingTop.position.set(0,.48,-.72);housingTop.castShadow=true;barrelPivot.add(housingTop);
  const shieldPlate=new THREE.Mesh(new THREE.BoxGeometry(2.35,.92,.18),gunMetal);shieldPlate.position.set(0,.02,.94);shieldPlate.rotation.x=-.1;shieldPlate.castShadow=true;barrelPivot.add(shieldPlate);
  for(const x of [-1.03,1.03]){const hinge=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.24,16),gunEdge);hinge.rotation.z=Math.PI/2;hinge.position.set(x,0,.18);barrelPivot.add(hinge);const ram=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,2.7,10),gunEdge);ram.rotation.x=Math.PI/2;ram.position.set(x*.82,-.42,-1.7);ram.rotation.z=x>0?.08:-.08;barrelPivot.add(ram);}
  const recoilGroup=new THREE.Group();barrelPivot.add(recoilGroup);
  for(const x of [-.38,.38]){const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.115,.19,8.4,20),gunMetal);barrel.rotation.x=Math.PI/2;barrel.position.set(x,.2,-4.35);barrel.castShadow=true;recoilGroup.add(barrel);const sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.27,.27,2.05,20),gunDark);sleeve.rotation.x=Math.PI/2;sleeve.position.set(x,.2,-1.55);recoilGroup.add(sleeve);const collar=new THREE.Mesh(new THREE.TorusGeometry(.25,.055,8,18),gunEdge);collar.position.set(x,.2,-2.55);recoilGroup.add(collar);const brake=new THREE.Mesh(new THREE.CylinderGeometry(.29,.22,.78,12),gunEdge);brake.rotation.x=Math.PI/2;brake.position.set(x,.2,-8.42);recoilGroup.add(brake);}
  for(const x of [-.38,.38])for(const z of [-8.16,-8.4,-8.64]){const vent=new THREE.Mesh(new THREE.TorusGeometry(.23,.045,6,14),gunDark);vent.position.set(x,.2,z);recoilGroup.add(vent);}
  const ammo=new THREE.Group();ammo.position.set(-1.55,.55,.15);for(let i=0;i<10;i++){const round=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,.5,8),brass);round.rotation.z=Math.PI/2;round.position.set(-i*.16,-i*.09,i*.04);ammo.add(round);}cannon.add(ammo);
  for(const x of [-1.05,1.05]){const light=new THREE.Mesh(new THREE.BoxGeometry(.12,.2,.8),gunEdge);light.position.set(x,.62,.92);cannon.add(light);}
  cannon.traverse(child=>{if(child.isMesh)child.visible=false;});
  const cannonSpriteMat=new THREE.SpriteMaterial({transparent:true,alphaTest:.025,depthWrite:false,toneMapped:false});const cannonSprite=new THREE.Sprite(cannonSpriteMat);cannonSprite.position.set(0,1.08,5.46);cannonSprite.scale.set(4.35,3.83,1);cannonSprite.renderOrder=6;scene.add(cannonSprite);
  loader.load("/assets/minigames/alliance-cannon-housing-v2-web.png",tex=>{tex.colorSpace=THREE.SRGBColorSpace;cannonSpriteMat.map=tex;cannonSpriteMat.needsUpdate=true;base.visible=false;pedestal.visible=false;housing.visible=false;housingTop.visible=false;shieldPlate.visible=false;ammo.visible=false;});

  const projectileGeo=new THREE.SphereGeometry(.09,8,8), playerMat=new THREE.MeshBasicMaterial({color:0x8ef5ff}), enemyMat=new THREE.MeshBasicMaterial({color:0xff3d13});
  const shots=[], enemyShots=[], sparks=[]; let firing=false, closed=false, elapsed=0, shotClock=0, enemyClock=1.2, score=0, combo=1, comboLife=0, bossHp=1, hull=maxHp, phase=0, recoil=0, bossAttack=0, shake=0, intro=1, raf=0, aimClientX=innerWidth*.5, aimClientY=innerHeight*.38, barrelSide=1;
  const muzzle = new THREE.Vector3(), smoothedAim = new THREE.Vector3(0,7,-20);
  function sparkAt(point,color=0xff6a20,count=9){for(let i=0;i<count;i++){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.045+Math.random()*.07,6,6),new THREE.MeshBasicMaterial({color}));mesh.position.copy(point);scene.add(mesh);sparks.push({mesh,vel:new THREE.Vector3((Math.random()-.5)*5,Math.random()*4,(Math.random()-.5)*5),life:.35+Math.random()*.3});}}
  function aimTarget(){raycaster.setFromCamera(pointerNdc,camera);const hit=raycaster.intersectObjects([body,chest,head,...weakpoints],false)[0];return hit?.point.clone() || raycaster.ray.at(34,new THREE.Vector3());}
  function muzzleFromScreen(side){const ndc=new THREE.Vector3(pointerNdc.x*.018+side*.064,.035+pointerNdc.y*.008,.12).unproject(camera),dir=ndc.sub(camera.position).normalize();return camera.position.clone().add(dir.multiplyScalar(9.2));}
  function shoot(){const mesh=new THREE.Mesh(projectileGeo,playerMat);barrelSide*=-1;muzzle.copy(muzzleFromScreen(barrelSide));mesh.position.copy(muzzle);scene.add(mesh);shots.push({mesh,start:muzzle.clone(),end:aimTarget(),t:0});recoil=.65;shake=1.5;}
  function bossShoot(){bossAttack=1;shake=Math.max(shake,3);const count=phase===2&&Math.random()<.35?2:1;for(let i=0;i<count;i++){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.2,12,8),enemyMat);mesh.position.set((i?1:-1)*.45,8.1,2);boss.localToWorld(mesh.position);scene.add(mesh);const end=new THREE.Vector3((Math.random()-.5)*1.5,1.7,7.8);enemyShots.push({mesh,start:mesh.position.clone(),end,t:0});sparkAt(mesh.position,0xff4018,18);}}
  function hit(point,obj){if(!obj){combo=Math.max(1,combo-.3);return;}let critical=false;if(obj.userData?.weak&&obj.userData.hp>0){critical=true;obj.userData.hp=Math.max(0,obj.userData.hp-.075/bossDurability);obj.scale.setScalar(1+Math.random()*.18);if(!obj.userData.hp){obj.visible=false;obj.userData.ring.visible=false;score+=10;combo=Math.min(8,combo+1.2);sparkAt(point,0xffdf70,38);shake=12;}}
    const gain=(critical?.62:.045)*Math.sqrt(combo);score=Math.min(250,score+gain);bossHp=Math.max(0,bossHp-(critical?.0024:.00075)/bossDurability);combo=Math.min(8,combo+(critical?.065:.012));comboLife=1.3;sparkAt(point,critical?0xffb222:0x73eaff,critical?16:7);}
  function setPointer(e){const rect=canvas.getBoundingClientRect(),x=clamp(e.clientX-rect.left,8,rect.width-8),y=clamp(e.clientY-rect.top,72,rect.height*.74);aimClientX=rect.left+x;aimClientY=rect.top+y;pointerNdc.x=x/rect.width*2-1;pointerNdc.y=-(y/rect.height*2-1);reticle.style.transform=`translate3d(${aimClientX}px,${aimClientY}px,0)`;}
  function resize(){const w=innerWidth,h=innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);aimClientX=clamp(aimClientX,8,w-8);aimClientY=clamp(aimClientY,72,h*.74);reticle.style.transform=`translate3d(${aimClientX}px,${aimClientY}px,0)`;}
  function finish(cancel=false){if(closed)return;closed=true;cancelAnimationFrame(raf);removeEventListener("resize",resize);if(cancel){renderer.dispose();layer.remove();return;}const finalScore=Math.min(250,Math.floor(score));layer.insertAdjacentHTML("beforeend",`<div class="boss-game-result"><small>3D-OPERATION BEENDET</small><em>${hull<=0?"GESCHÜTZ ZERSTÖRT":bossHp<.5?"SCHWERE TREFFER":"FEUERKONTAKT"}</em><strong>${finalScore}</strong><b>TAKTISCHE PUNKTE</b><span>Schadensdaten werden übertragen…</span><i></i></div>`);api("/alliances/boss/attack",{method:"POST",body:{score:finalScore}}).then(out=>{const result=layer.querySelector(".boss-game-result");result.querySelector("span").textContent=`${fmt(out.result.damage)} Allianz-Schaden verursacht`;result.querySelector("i").textContent=out.result.defeated?"WELTENBRECHER VERNICHTET":out.boss?.unlimited?"LOKALER TEST · NÄCHSTER ANGRIFF BEREIT":"Angriff abgeschlossen";setTimeout(()=>{renderer.dispose();layer.remove();onDone?.();},2200);}).catch(err=>{toast(err.message,true);renderer.dispose();layer.remove();});}
  function frame(){if(closed)return;const dt=Math.min(.034,clock.getDelta());elapsed+=dt;intro=Math.max(0,intro-dt*.55);shotClock-=dt;enemyClock-=dt;comboLife-=dt;recoil=Math.max(0,recoil-dt*5);bossAttack=Math.max(0,bossAttack-dt*3.4);shake=Math.max(0,shake-dt*22);if(comboLife<=0)combo=Math.max(1,combo-dt*1.4);phase=elapsed>20?2:elapsed>10?1:0;
    const stride=elapsed*(phase===2?2.2:phase===1?1.65:1.15),range=phase===2?2.4:phase===1?1.75:1.15;boss.position.x=Math.sin(stride)*range;boss.position.y=Math.abs(Math.sin(stride*2))*.12;boss.position.z=-20+phase*1.15+Math.sin(elapsed*.43)*.28-bossAttack*.48;boss.rotation.y=Math.sin(stride)*.045;bossPortrait.rotation.z=Math.sin(stride)*.018+bossAttack*.025;body.rotation.z=Math.sin(elapsed*1.25)*.025;head.rotation.z=Math.sin(elapsed*.82)*.08;limbs[0].rotation.z=Math.sin(elapsed*.8)*.08;limbs[1].rotation.z=-Math.sin(elapsed*.8)*.08;for(const w of weakpoints){if(w.visible){w.material.emissiveIntensity=4+Math.sin(elapsed*7)*2;w.userData.ring.rotation.z+=dt*1.7;w.scale.lerp(new THREE.Vector3(1,1,1),dt*8);}}
    smoothedAim.lerp(aimTarget(),Math.min(1,dt*14));barrelPivot.lookAt(smoothedAim);barrelPivot.rotateY(Math.PI);recoilGroup.position.z=recoil*.42;ammo.rotation.z=-recoil*.08;baseRing.rotation.z+=dt*.18;cannonSprite.position.x=pointerNdc.x*.9;cannonSprite.position.y=1.08+pointerNdc.y*.1-recoil*.12;cannonSpriteMat.rotation=-pointerNdc.x*.09;
    if(firing&&intro<=0&&shotClock<=0){shotClock=.07;shoot();fireButton.classList.toggle("hot");}
    if(intro<=0&&enemyClock<=0){enemyClock=(phase===2?.62:phase===1?.86:1.18)/Math.min(1.75,1+(bossLevel-1)*.065);bossShoot();}
    for(let i=shots.length-1;i>=0;i--){const s=shots[i];s.t+=dt*7;s.mesh.position.lerpVectors(s.start,s.end,Math.min(1,s.t));s.mesh.scale.set(1,1,3);if(s.t>=1){raycaster.set(s.start.clone(),s.end.clone().sub(s.start).normalize());raycaster.far=s.start.distanceTo(s.end)+.2;const found=raycaster.intersectObjects([body,chest,head,...weakpoints].filter(x=>x.visible),false)[0];hit(s.end,found?.object);scene.remove(s.mesh);shots.splice(i,1);}}
    for(let i=enemyShots.length-1;i>=0;i--){const s=enemyShots[i];s.t+=dt*1.42;s.mesh.position.lerpVectors(s.start,s.end,Math.min(1,s.t));const k=1+s.t*2;s.mesh.scale.setScalar(k);if(s.t>=1){const damage=Math.round((10+phase*4+Math.random()*4)*(1+(bossLevel-1)*.14));hull=Math.max(0,hull-damage);sparkAt(s.end,0xff3817,28);shake=11;layer.classList.add("under-fire");setTimeout(()=>layer.classList.remove("under-fire"),130);scene.remove(s.mesh);enemyShots.splice(i,1);}}
    for(let i=sparks.length-1;i>=0;i--){const p=sparks[i];p.life-=dt;p.mesh.position.addScaledVector(p.vel,dt);p.vel.y-=7*dt;p.mesh.scale.multiplyScalar(.95);if(p.life<=0){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();sparks.splice(i,1);}}
    camera.position.x=(Math.random()-.5)*shake*.018;camera.position.y=3.2+(Math.random()-.5)*shake*.018;camera.lookAt(0,3,-15);scoreEl.textContent=Math.floor(score);comboEl.textContent=`COMBO ×${Math.max(1,Math.floor(combo))}`;timerEl.textContent=Math.max(0,30-elapsed).toFixed(1);bossBar.style.width=`${bossHp*100}%`;bossText.textContent=`${Math.ceil(bossHp*100)}%`;hullBar.style.width=`${hull/maxHp*100}%`;hullText.textContent=`${Math.ceil(hull)} / ${maxHp}`;phaseEl.textContent=intro>0?"FEINDKONTAKT":phase===0?"SCHILDPHASE":phase===1?"PLASMASALVEN":"KERN ÜBERLADEN";
    renderer.render(scene,camera);if(elapsed>=30||bossHp<=0||hull<=0)finish();else raf=requestAnimationFrame(frame);}
  layer.addEventListener("pointermove",setPointer);layer.addEventListener("pointerdown",e=>{if(e.target.closest(".boss-game-exit"))return;setPointer(e);firing=true;});layer.addEventListener("pointerup",()=>firing=false);layer.addEventListener("pointercancel",()=>firing=false);fireButton.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();firing=true;});fireButton.addEventListener("pointerup",e=>{e.preventDefault();e.stopPropagation();firing=false;});layer.querySelector(".boss-game-exit").onclick=()=>finish(true);addEventListener("resize",resize);resize();setPointer({clientX:aimClientX,clientY:aimClientY});raf=requestAnimationFrame(frame);
}
