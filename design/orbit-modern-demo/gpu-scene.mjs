import * as T from 'three';
import {RoomEnvironment} from './vendor/environments/RoomEnvironment.js';

const iconCache = new Map();
// Orthographic 3D scene: simulation coordinates map exactly to the existing touch camera.
export function createGpuScene(root, getView) {
  const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.domElement.className='orbit-gpu';renderer.domElement.setAttribute('aria-hidden','true');
  root.prepend(renderer.domElement);root.dataset.renderer='webgl2';root.dataset.renderPipeline='direct-v2';
  renderer.setClearColor(0x030815);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-500,500,500,-500,.1,16000);
  camera.position.set(0,0,3600);camera.lookAt(0,0,0);
  // Draw the complete scene into the browser framebuffer in one pass. Glow is
  // local geometry/sprites, with no floating-point ping-pong/bloom framebuffers.
  const envScene=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromScene(envScene,.04);
  scene.environment=env.texture;scene.environmentIntensity=.38;envScene.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xc9e9ff,0x10223d,.55));
  const sun=new T.DirectionalLight(0xd7edff,1.8);sun.position.set(-300,500,1000);scene.add(sun);
  const rim=new T.DirectionalLight(0x6cbfff,.9);rim.position.set(600,-200,400);scene.add(rim);
  const warm=new T.DirectionalLight(0xffbf85,.45);warm.position.set(-400,-700,300);scene.add(warm);
  const materials=new Set(),geometries=new Set(),textures=new Set();
  const geo=g=>(geometries.add(g),g);
  const metal=(color,roughness=.38,metalness=.7)=>{const m=new T.MeshStandardMaterial({color,roughness,metalness});materials.add(m);return m;};
  const emissive=(color,intensity=3)=>{const m=new T.MeshStandardMaterial({color:0x152432,emissive:color,emissiveIntensity:intensity,roughness:.25,metalness:.3});materials.add(m);return m;};
  const navy=metal(0x263a52),silver=metal(0x526a7d,.42),dark=metal(0x101b29),armor=metal(0x536979),red=metal(0x9e3932),copper=metal(0xad7352);
  const cyan=emissive(0x65dcff,4),orange=emissive(0xff692c,4),white=emissive(0xccfaff,4),glass=metal(0x1d829b,.24,.5);
  const guide=emissive(0x488aa7,.6);
  const cube=geo(new T.BoxGeometry(1,1,1)),sphere=geo(new T.SphereGeometry(1,12,8));
  function box(parent,w,h,d,x,y,z,mat=silver){const m=new T.Mesh(cube,mat);m.scale.set(w,h,d);m.position.set(x,y,z);parent.add(m);return m;}
  function cylinder(parent,r,h,x,y,z,mat=dark,sides=16){const m=new T.Mesh(geo(new T.CylinderGeometry(r,r,h,sides)),mat);m.rotation.x=Math.PI/2;m.position.set(x,y,z);parent.add(m);return m;}
  function plate(parent,points,depth,z,mat){const shape=new T.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const m=new T.Mesh(geo(new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:2.2,bevelThickness:2.2,bevelSegments:1,steps:1})),mat);m.position.z=z;parent.add(m);return m;}
  function ring(parent,r,t,z,mat){const m=new T.Mesh(geo(new T.TorusGeometry(r,t,6,48)),mat);m.position.z=z;parent.add(m);return m;}
  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=128;
  const gc=glowCanvas.getContext('2d'),gr=gc.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'#fff');gr.addColorStop(.08,'#fff');gr.addColorStop(.23,'#ffffff90');gr.addColorStop(.6,'#ffffff20');gr.addColorStop(1,'#ffffff00');gc.fillStyle=gr;gc.fillRect(0,0,128,128);
  const glowTex=new T.CanvasTexture(glowCanvas);textures.add(glowTex);
  function spriteMat(color,opacity=.65){const m=new T.SpriteMaterial({map:glowTex,color,opacity,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false});materials.add(m);return m;}
  const engineMat=spriteMat(0xff671d,.8),blueGlow=spriteMat(0x45cfff,.55),impactMat=spriteMat(0xff883b,.85);
  function glow(parent,x,y,z,size,mat){const s=new T.Sprite(mat);s.position.set(x,y,z);s.scale.set(size,size,1);parent.add(s);return s;}
  function engine(parent,x,y,z,r=7){const tube=new T.Mesh(geo(new T.CylinderGeometry(r*.75,r,20,12)),dark);tube.position.set(x,y,z);parent.add(tube);box(parent,r*1.2,3,5,x,y-11,z,orange);const flame=glow(parent,x,y-22,z,38,engineMat);flame.name='engine';return flame;}
  function fighter(){const g=new T.Group();
    plate(g,[[-10,-42],[-39,-32],[-32,-5],[-10,24],[0,60],[10,24],[32,-5],[39,-32],[10,-42]],8,0,navy);
    plate(g,[[-7,-32],[-10,13],[0,49],[10,13],[7,-32]],9,10,silver);
    for(const side of [-1,1]){plate(g,[[side*12,-20],[side*35,-25],[side*23,3],[side*12,16]],3,12,red);box(g,3,29,4,side*30,-15,16,dark);box(g,2,12,2,side*29,-8,19,orange);engine(g,side*14,-34,5,6);}
    box(g,10,21,6,0,12,23,glass);box(g,2,14,1,-3,15,27,cyan);box(g,7,14,4,0,-18,23,dark);
    for(const side of [-1,1]){for(let k=0;k<4;k++)box(g,7,1,1,side*16,k*4-22,17,dark);box(g,2,19,2,side*9,-19,23,copper);box(g,2,6,1,side*27,-22,17,silver);}
    return g;}
  function frigate(){const g=new T.Group();
    plate(g,[[-25,-62],[-40,-34],[-37,33],[-20,70],[20,70],[37,33],[40,-34],[25,-62]],15,0,navy);
    plate(g,[[-15,-40],[-22,25],[-12,59],[12,59],[22,25],[15,-40]],12,17,silver);
    for(const side of [-1,1]){box(g,20,72,20,side*36,-12,6,dark);box(g,15,44,7,side*37,0,20,armor);box(g,4,40,3,side*43,-2,25,red);for(let k=0;k<5;k++)box(g,7,2,2,side*35,k*8-20,25,orange);engine(g,side*25,-55,5,11);engine(g,side*42,-44,4,7);}
    box(g,17,18,8,0,28,33,glass);box(g,9,28,5,0,-20,32,navy);for(const y of [-23,8]){cylinder(g,9,7,0,y,37,dark);box(g,3,22,4,-4,y+11,43,silver);box(g,3,22,4,4,y+11,43,silver);}return g;}
  function tower(kind){const g=new T.Group();cylinder(g,31,9,0,0,0,dark,8);cylinder(g,27,5,0,0,6,silver,8);ring(g,26,.65,10,guide);
    for(let k=0;k<4;k++){const a=k*Math.PI/2;box(g,9,5,4,Math.cos(a)*28,Math.sin(a)*28,8,navy);}
    const gun=new T.Group();gun.name='gun';gun.position.z=12;g.add(gun);
    if(kind==='silo'){for(const x of [-12,12])for(const y of [-10,10]){box(gun,17,17,15,x,y,8,navy);box(gun,12,12,2,x,y,17,dark);box(gun,2,7,1,x-5,y,19,cyan);}}
    else if(kind==='tesla'){cylinder(gun,13,21,0,0,12,navy);for(let k=0;k<3;k++)ring(gun,15,2,k*7+7,silver);const ball=new T.Mesh(sphere,cyan);ball.position.z=31;ball.scale.setScalar(9);gun.add(ball);}
    else if(kind==='mine'){cylinder(gun,18,5,0,0,4,navy,8);ring(gun,15,2,9,orange);}
    else {box(gun,28,22,12,0,-3,5,navy);box(gun,19,15,4,0,-7,14,armor);const count=kind==='flak'?4:kind==='gauss'?1:2;for(let k=0;k<count;k++){const x=(k-(count-1)/2)*8,len=kind==='gauss'?52:36;box(gun,6,len,7,x,12,10,silver);box(gun,3,len*.8,2,x,12,15,navy);box(gun,4,3,5,x,12+len/2,11,cyan);}box(gun,4,9,2,-11,-5,15,cyan);}
    return g;}
  function missile(){const g=new T.Group();box(g,4,27,4,0,0,0,silver);plate(g,[[-5,-11],[0,-4],[5,-11]],2,1,navy);box(g,3,4,3,0,-15,0,orange);glow(g,0,-20,0,17,engineMat);return g;}
  const templates={fighter:fighter(),frigate:frigate(),missile:missile()};for(const k of ['laser','silo','flak','gauss','tesla','mine'])templates[k]=tower(k);
  function icon(kind){
    if(!templates[kind])return null;if(iconCache.has(kind))return iconCache.get(kind);
    const size=192,target=new T.WebGLRenderTarget(size,size);target.texture.colorSpace=T.SRGBColorSpace;
    const preview=new T.Scene();preview.background=new T.Color(0x0b1b29);preview.environment=env.texture;preview.environmentIntensity=.5;
    preview.add(templates[kind].clone(true),new T.HemisphereLight(0xd8edff,0x182639,1));
    const light=new T.DirectionalLight(0xd6edff,3);light.position.set(-50,70,120);preview.add(light);
    const cam=new T.OrthographicCamera(-48,48,48,-48,.1,1000);cam.position.set(60,-95,160);cam.up.set(0,0,1);cam.lookAt(0,5,8);
    const previous=renderer.getRenderTarget();renderer.setRenderTarget(target);renderer.render(preview,cam);
    const pixels=new Uint8Array(size*size*4);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);renderer.setRenderTarget(previous);target.dispose();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),data=ctx.createImageData(size,size);
    for(let y=0;y<size;y++)data.data.set(pixels.subarray((size-y-1)*size*4,(size-y)*size*4),y*size*4);
    ctx.putImageData(data,0,0);const url=canvas.toDataURL();iconCache.set(kind,url);return url;
  }
  const objects=new Map(),free=new Map();
  function object(key,type){if(objects.has(key))return objects.get(key);const list=free.get(type)||[],m=list.pop()||templates[type].clone(true);m.userData.kind=type;scene.add(m);objects.set(key,m);return m;}
  function cleanup(active){for(const [key,m] of objects)if(!active.has(key)){scene.remove(m);objects.delete(key);const list=free.get(m.userData.kind)||[];list.push(m);free.set(m.userData.kind,list);}}
  const noiseGL=`float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float fbm(vec3 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=a*noise(p);p=p*2.03+vec3(2.4,1.3,4.1);a*=.5;}return n;}`;
  const earthTex=new T.TextureLoader().load('./assets/planet.png');earthTex.colorSpace=T.SRGBColorSpace;textures.add(earthTex);
  const planetMat=new T.ShaderMaterial({uniforms:{time:{value:0},earth:{value:earthTex}},vertexShader:'varying vec3 p;varying vec3 n;void main(){p=position;n=normalMatrix*normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`precision highp float;varying vec3 p;varying vec3 n;uniform float time;uniform sampler2D earth;${noiseGL}
    void main(){vec3 v=normalize(p),normal=normalize(n);vec2 uv=vec2(.5)+v.xy*vec2(.36,.36);vec3 col=texture2D(earth,uv).rgb;float day=max(0.,dot(normal,normalize(vec3(-.7,.65,1.))));float cloud=smoothstep(.60,.73,fbm(v*9.+vec3(time*.008,0.,0.)));col=mix(col,vec3(.7,.78,.82),cloud*.35);col*=.15+day*1.25;float edge=pow(clamp(1.-normal.z,0.,1.),3.);col+=vec3(.008,.08,.17)*edge;gl_FragColor=vec4(col,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});materials.add(planetMat);
  const planet=new T.Mesh(geo(new T.SphereGeometry(62,64,32)),planetMat);planet.position.z=30;planet.rotation.x=.4;scene.add(planet);
  const atmosphereMat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,vertexShader:'varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 n;void main(){float f=pow(clamp(1.-abs(n.z),0.,1.),3.5);gl_FragColor=vec4(.10,.55,1.,f*.65);}'});materials.add(atmosphereMat);
  const atmosphere=new T.Mesh(geo(new T.SphereGeometry(66,48,24)),atmosphereMat);atmosphere.position.z=30;scene.add(atmosphere);
  const shield=ring(scene,71,1.1,30,cyan);shield.material=cyan;shield.visible=false;
  const orbitMat=new T.LineBasicMaterial({color:0x9fc9df,transparent:true,opacity:.3});materials.add(orbitMat);
  const ringPoints=Array.from({length:128},(_,i)=>new T.Vector3(Math.cos(i*Math.PI/64)*197.6,Math.sin(i*Math.PI/64)*197.6,-4));scene.add(new T.LineLoop(geo(new T.BufferGeometry().setFromPoints(ringPoints)),orbitMat));
  const pads=[];for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3;const g=new T.Group();g.position.set(Math.cos(a)*197.6,-Math.sin(a)*197.6,0);ring(g,23,1.2,0,silver);ring(g,19,.6,1,guide);pads.push(g);scene.add(g);}
  const skyTexture=new T.TextureLoader().load('./assets/deep-space.png');skyTexture.colorSpace=T.SRGBColorSpace;skyTexture.wrapS=skyTexture.wrapT=T.MirroredRepeatWrapping;textures.add(skyTexture);
  const skyMat=new T.ShaderMaterial({uniforms:{map:{value:skyTexture}},depthWrite:false,vertexShader:'varying vec2 pos;void main(){pos=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D map;varying vec2 pos;void main(){vec3 c=texture2D(map,pos/vec2(2800.,1866.)+.5).rgb;gl_FragColor=vec4(c*.65,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});materials.add(skyMat);
  const sky=new T.Mesh(geo(new T.PlaneGeometry(20000,20000)),skyMat);sky.position.z=-1200;scene.add(sky);
  let seed=4491;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const starPositions=new Float32Array(1600*3);for(let i=0;i<1600;i++){starPositions[i*3]=(rand()-.5)*7500;starPositions[i*3+1]=(rand()-.5)*9500;starPositions[i*3+2]=-500+rand()*200;}
  const starGeo=geo(new T.BufferGeometry());starGeo.setAttribute('position',new T.BufferAttribute(starPositions,3));const starMat=new T.PointsMaterial({color:0xb7dcff,size:1.5,transparent:true,opacity:.6,depthWrite:false});materials.add(starMat);scene.add(new T.Points(starGeo,starMat));
  const rockGeo=geo(new T.IcosahedronGeometry(1,1));const rp=rockGeo.attributes.position;for(let i=0;i<rp.count;i++){const f=.85+rand()*.3;rp.setXYZ(i,rp.getX(i)*f,rp.getY(i)*f,rp.getZ(i)*f);}rockGeo.computeVertexNormals();
  const rockMat=metal(0x252e3d,.95,.03),rocks=new T.InstancedMesh(rockGeo,rockMat,90),rockData=[],dummy=new T.Object3D();
  for(let i=0;i<90;i++){const side=i%2?1:-1;rockData.push({x:side*(520+rand()*520),y:(rand()-.5)*3200,z:rand()*100-60,r:8+rand()*31,rx:rand()*6,ry:rand()*6,speed:(rand()-.5)*.04});}scene.add(rocks);
  const particleGeo=geo(new T.BufferGeometry()),pp=new Float32Array(900*3),pc=new Float32Array(900*3);particleGeo.setAttribute('position',new T.BufferAttribute(pp,3).setUsage(T.DynamicDrawUsage));particleGeo.setAttribute('color',new T.BufferAttribute(pc,3).setUsage(T.DynamicDrawUsage));
  const particleMat=new T.PointsMaterial({map:glowTex,size:6,transparent:true,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false});materials.add(particleMat);const particles=new T.Points(particleGeo,particleMat);particles.frustumCulled=false;scene.add(particles);
  const boltMat=emissive(0x86eaff,5),missileGlow=spriteMat(0x69dfff,.9),boltPool=[],beamPool=[],flarePool=[];
  const hitPool=[],shockPool=[],smokePool=[];
  const smokeMat=spriteMat(0x647584,.2);smokeMat.blending=T.NormalBlending;
  const shockGeo=geo(new T.TorusGeometry(1,.014,4,64));
  function hitAt(i){if(!hitPool[i])hitPool.push(glow(scene,0,0,70,55,impactMat));return hitPool[i];}
  function shockAt(i){if(!shockPool[i]){const mat=new T.MeshBasicMaterial({color:0xffb56b,transparent:true,depthWrite:false,blending:T.AdditiveBlending});materials.add(mat);const mesh=new T.Mesh(shockGeo,mat);scene.add(mesh);shockPool.push(mesh);}return shockPool[i];}
  function smokeAt(i){if(!smokePool[i])smokePool.push(glow(scene,0,0,10,20,smokeMat));return smokePool[i];}
  function boltAt(i){if(!boltPool[i]){const m=new T.Mesh(cube,boltMat);scene.add(m);boltPool.push(m);}return boltPool[i];}
  function beamAt(i){if(!beamPool[i]){const m=new T.Mesh(cube,boltMat);scene.add(m);beamPool.push(m);}return beamPool[i];}
  function flareAt(i){if(!flarePool[i]){const s=glow(scene,0,0,40,60,impactMat);flarePool.push(s);}return flarePool[i];}
  const lights=Array.from({length:3},()=>{const l=new T.PointLight(0xff793c,0,550,2);scene.add(l);return l;});
  const color=new T.Color();let lastW=0,lastH=0,disposed=false,frameCount=0,frameTotal=0;
  const gl=renderer.getContext(),sample=new Uint8Array(8*8*4);
  let auditLeft=0,frameAudit={samples:0,blackFrames:0,glErrors:0,minBrightness:255};
  function sampleFrame(){
    const v=getView(),d=renderer.getPixelRatio();
    const x=Math.max(0,Math.min(gl.drawingBufferWidth-8,Math.round(v.screenCx*d)-4));
    const y=Math.max(0,Math.min(gl.drawingBufferHeight-8,Math.round((v.H-v.screenCy)*d)-4));
    gl.readPixels(x,y,8,8,gl.RGBA,gl.UNSIGNED_BYTE,sample);
    let total=0;for(let i=0;i<sample.length;i+=4)total+=sample[i]+sample[i+1]+sample[i+2];
    const brightness=total/(64*3),error=gl.getError();
    frameAudit.samples++;frameAudit.minBrightness=Math.min(frameAudit.minBrightness,brightness);
    if(brightness<5)frameAudit.blackFrames++;if(error!==gl.NO_ERROR||gl.isContextLost())frameAudit.glErrors++;
  }
  root.orbitStartFrameAudit=(frames=180)=>{auditLeft=frames;frameAudit={samples:0,blackFrames:0,glErrors:0,minBrightness:255};};
  function render(game){if(disposed)return;const v=getView(),start=performance.now();
    if(v.W!==lastW||v.H!==lastH){lastW=v.W;lastH=v.H;renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5,Math.sqrt(2000000/(v.W*v.H))));renderer.setSize(v.W,v.H);}
    camera.left=-v.screenCx/v.cameraScale;camera.right=(v.W-v.screenCx)/v.cameraScale;camera.top=v.screenCy/v.cameraScale;camera.bottom=-(v.H-v.screenCy)/v.cameraScale;camera.position.x=-v.shakeX/v.cameraScale;camera.position.y=v.shakeY/v.cameraScale;camera.updateProjectionMatrix();
    planet.rotation.y=game.time*.025;planetMat.uniforms.time.value=game.time;shield.visible=game.hitFlash>.1;shield.scale.setScalar(1+(1-game.hitFlash)*.2);
    pads.forEach((p,i)=>{p.visible=!game.towers.some(t=>t.slot===i);});
    for(let i=0;i<rockData.length;i++){const r=rockData[i];dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(r.rx+game.time*r.speed,r.ry,game.time*r.speed*.3);dummy.scale.set(r.r,r.r*.8,r.r*.65);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);}rocks.instanceMatrix.needsUpdate=true;
    const active=new Set();
    for(const e of game.enemies){const m=object(e,e.heavy?'frigate':'fighter');active.add(e);m.position.set(e.x,-e.y,20);m.rotation.set(Math.sin(e.wobble)*.07,Math.cos(e.wobble)*.09,-Math.atan2(-e.y,-e.x)-Math.PI/2);m.traverse(o=>{if(o.name==='engine')o.scale.setScalar(32+Math.sin(game.time*30+e.wobble)*4);});}
    for(const t of game.towers){const m=object(t,t.kind);active.add(t);const a=-Math.PI/2+t.slot*Math.PI/3,x=Math.cos(a)*v.ringR,y=Math.sin(a)*v.ringR;m.position.set(x,-y,0);const angle=t.lock?Math.atan2(t.lock.y-y,t.lock.x-x):a;m.getObjectByName('gun').rotation.z=-angle-Math.PI/2;m.scale.setScalar(t.buildLeft>0?.6+.4*(1-t.buildLeft/4):1);}
    const playerKey='player';const player=object(playerKey,'gauss');active.add(playerKey);player.position.set(Math.cos(game.aim)*v.shieldR,-Math.sin(game.aim)*v.shieldR,20);player.scale.setScalar(.48);player.getObjectByName('gun').rotation.z=-game.aim-Math.PI/2;
    for(const e of [...game.rockets,...game.interceptors]){const m=object(e,'missile');active.add(e);m.position.set(e.x,-e.y,20);m.rotation.z=-Math.atan2(e.vy,e.vx)-Math.PI/2;}
    cleanup(active);
    let bi=0;for(const s of game.shots){const m=boltAt(bi++);m.visible=true;m.position.set(s.x,-s.y,25);m.rotation.z=-Math.atan2(s.vy,s.vx)-Math.PI/2;m.scale.set(s.kind==='gauss'?3:2.2,s.kind==='gauss'?62:30,2);}for(let i=bi;i<boltPool.length;i++)boltPool[i].visible=false;
    let be=0;for(const t of game.towers){if(t.kind!=='laser'||!t.lock||t.flash<.1)continue;const a=-Math.PI/2+t.slot*Math.PI/3,x=Math.cos(a)*v.ringR,y=Math.sin(a)*v.ringR,dx=t.lock.x-x,dy=t.lock.y-y,m=beamAt(be++);m.visible=true;m.position.set(x+dx/2,-y-dy/2,25);m.rotation.z=-Math.atan2(dy,dx)-Math.PI/2;m.scale.set(1.7,Math.hypot(dx,dy),1.7);}for(let i=be;i<beamPool.length;i++)beamPool[i].visible=false;
    let pi=0;for(const p of game.sparks){if(pi>=900)break;pp[pi*3]=p.x;pp[pi*3+1]=-p.y;pp[pi*3+2]=35;color.set(p.color).multiplyScalar(Math.min(4,p.life*8));pc[pi*3]=color.r;pc[pi*3+1]=color.g;pc[pi*3+2]=color.b;pi++;}particleGeo.setDrawRange(0,pi);particleGeo.attributes.position.needsUpdate=true;particleGeo.attributes.color.needsUpdate=true;particleMat.size=Math.max(2,v.cameraScale*10);
    let fi=0;for(const f of game.flashes){const s=flareAt(fi++);s.visible=true;s.position.set(f.x,-f.y,60);s.scale.setScalar(f.radius*(1-f.life/.45+.2)*2.8);}for(let i=fi;i<flarePool.length;i++)flarePool[i].visible=false;
    let hi=0;for(const e of game.enemies){if(e.flash<=0)continue;const s=hitAt(hi++);s.visible=true;s.position.set(e.x,-e.y,70);s.scale.setScalar(30+e.flash*70);}for(let i=hi;i<hitPool.length;i++)hitPool[i].visible=false;
    let ri=0;for(const r of game.rings){const m=shockAt(ri++);m.visible=true;m.position.set(r.x,-r.y,65);m.scale.setScalar(Math.max(1,r.r));m.material.color.setStyle('rgb('+r.color+')');m.material.opacity=Math.min(.7,r.life*2);}for(let i=ri;i<shockPool.length;i++)shockPool[i].visible=false;
    let si=0;for(const p of game.smoke){const s=smokeAt(si++);s.visible=true;s.position.set(p.x,-p.y,10);s.scale.setScalar(p.r*4);}for(let i=si;i<smokePool.length;i++)smokePool[i].visible=false;
    lights.forEach((l,i)=>{const f=game.flashes[i];l.intensity=f?f.life*1200:0;if(f)l.position.set(f.x,-f.y,100);});
    renderer.setRenderTarget(null);renderer.render(scene,camera);
    if(auditLeft>0){sampleFrame();auditLeft--;}
    frameTotal+=performance.now()-start;frameCount++;root.dataset.renderMs=(frameTotal/frameCount).toFixed(1);root.dataset.drawCalls=String(renderer.info.render.calls);
  }
  function dispose(){if(disposed)return;disposed=true;for(const obj of [...Object.values(templates),scene])obj.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());env.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
  function audit(){return {...frameAudit,healthy:frameAudit.samples>0&&frameAudit.blackFrames===0&&frameAudit.glErrors===0,cpuMs:Number((frameTotal/Math.max(1,frameCount)).toFixed(2)),meshes:objects.size,frames:frameCount};}
  root.orbitGpuAudit=audit;
  return {render,dispose,icon};
}
