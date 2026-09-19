import * as T from "/vendor/three.module.min.js";
import { TURRET_ART, TURRET_WORLD_SCALE } from "./orbit-turret-art.mjs";
import { createMissileVeil } from "./orbit-missile-veil.mjs";
const ASSET = "/assets/orbit-siege/";

const iconCache = new Map();
// Orthographic 3D scene: simulation coordinates map exactly to the existing touch camera.
export function createGpuScene(root, getView) {
  const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.domElement.className='orbit-gpu';renderer.domElement.setAttribute('aria-hidden','true');
  root.prepend(renderer.domElement);root.dataset.renderer='webgl2';root.dataset.renderPipeline='direct-v7';
  renderer.setClearColor(0x02040c);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-500,500,500,-500,.1,16000);
  camera.position.set(0,0,3600);camera.lookAt(0,0,0);
  scene.add(new T.HemisphereLight(0xc9e9ff,0x10223d,.85));
  const sun=new T.DirectionalLight(0xd7edff,2.6);sun.position.set(-300,500,1000);scene.add(sun);
  const rim=new T.DirectionalLight(0x6cbfff,.9);rim.position.set(600,-200,400);scene.add(rim);
  const warm=new T.DirectionalLight(0xffbf85,.45);warm.position.set(-400,-700,300);scene.add(warm);
  const materials=new Set(),geometries=new Set(),textures=new Set();
  const geo=g=>(geometries.add(g),g);
  const metal=(color,roughness=.38,metalness=.7)=>{const m=new T.MeshStandardMaterial({color,roughness,metalness});materials.add(m);return m;};
  const emissive=(color,intensity=3)=>{const m=new T.MeshStandardMaterial({color:0x152432,emissive:color,emissiveIntensity:intensity,roughness:.25,metalness:.3});materials.add(m);return m;};
  const navy=metal(0x263a52),silver=metal(0x526a7d,.42),dark=metal(0x101b29),armor=metal(0x536979),red=metal(0x9e3932),copper=metal(0xad7352);
  const hullSkin=metal(0xc5d2de,.28,.78),hostile=metal(0xe25a3c,.32,.42),wingSkin=metal(0x3d5870,.4,.55);
  const cyan=emissive(0x65dcff,4),orange=emissive(0xff692c,4),white=emissive(0xccfaff,4),glass=metal(0x1d829b,.24,.5);
  const guide=emissive(0x488aa7,.6);
  const cube=geo(new T.BoxGeometry(1,1,1)),sphere=geo(new T.SphereGeometry(1,12,8));
  const spritePlane=geo(new T.PlaneGeometry(1,1));
  function illustratedSprite(parent,file,w,h,pivotY=.5,keyed=false){
    const map=new T.TextureLoader().load(ASSET+file);map.colorSpace=T.SRGBColorSpace;
    map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.add(map);
    const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,uniforms:{map:{value:map},keyed:{value:keyed?1:0},heat:{value:0}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform sampler2D map;uniform float keyed;uniform float heat;varying vec2 vUv;
        void main(){vec4 c=texture2D(map,vUv);float green=max(0.,c.g-max(c.r,c.b));
          c.a*=1.-keyed*smoothstep(.05,.32,green);if(c.a<.02)discard;
          if(keyed>.5)c.g=min(c.g,max(c.r,c.b)+.02);
          float metal=max(c.r,max(c.g,c.b));
          c.rgb+=vec3(.24,.16,.09)*heat*metal*metal*smoothstep(.25,.85,vUv.y);
          gl_FragColor=c;
          #include <colorspace_fragment>
        }`});materials.add(mat);
    const mesh=new T.Mesh(spritePlane,mat);mesh.scale.set(w,h,1);mesh.position.set(0,(pivotY-.5)*h,24);parent.add(mesh);return mesh;
  }
  function box(parent,w,h,d,x,y,z,mat=silver){const m=new T.Mesh(cube,mat);m.scale.set(w,h,d);m.position.set(x,y,z);parent.add(m);return m;}
  function cylinder(parent,r,h,x,y,z,mat=dark,sides=16){const m=new T.Mesh(geo(new T.CylinderGeometry(r,r,h,sides)),mat);m.rotation.x=Math.PI/2;m.position.set(x,y,z);parent.add(m);return m;}
  function plate(parent,points,depth,z,mat){const shape=new T.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const m=new T.Mesh(geo(new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:2.2,bevelThickness:2.2,bevelSegments:1,steps:1})),mat);m.position.z=z;parent.add(m);return m;}
  function ring(parent,r,t,z,mat){const m=new T.Mesh(geo(new T.TorusGeometry(r,t,6,48)),mat);m.position.z=z;parent.add(m);return m;}
  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=128;
  const gc=glowCanvas.getContext('2d'),gr=gc.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'#fff');gr.addColorStop(.08,'#fff');gr.addColorStop(.23,'#ffffff90');gr.addColorStop(.6,'#ffffff20');gr.addColorStop(1,'#ffffff00');gc.fillStyle=gr;gc.fillRect(0,0,128,128);
  const glowTex=new T.CanvasTexture(glowCanvas);textures.add(glowTex);
  function spriteMat(color,opacity=.65){const m=new T.SpriteMaterial({map:glowTex,color,opacity,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false});materials.add(m);return m;}
  const engineMat=spriteMat(0xff671d,.8),blueGlow=spriteMat(0x45cfff,.55),impactMat=spriteMat(0xff883b,.85);
  const plumeMat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,uniforms:{time:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform float time;void main(){float y=vUv.y;
      float x=abs(vUv.x-.5+sin(y*32.-time*43.)*.025*(1.-y)),w=.03+y*.42;
      float a=(1.-smoothstep(w*.25,w,x))*smoothstep(0.,.2,y)*(.78+.22*sin(time*51.+y*12.));
      vec3 c=mix(vec3(1.,.16,.015),vec3(1.,.9,.65),smoothstep(.4,.95,y)*(1.-smoothstep(0.,w*.5,x)));
      gl_FragColor=vec4(c,a);
    }`});materials.add(plumeMat);
  function plume(parent,x,y,w=7,h=18){const m=new T.Mesh(spritePlane,plumeMat);m.scale.set(w,h,1);m.position.set(x,y-h*0.42,4);parent.add(m);}
  function glow(parent,x,y,z,size,mat){const s=new T.Sprite(mat);s.position.set(x,y,z);s.scale.set(size,size,1);parent.add(s);return s;}
  function engine(parent,x,y,z,r=1.15){const tube=new T.Mesh(geo(new T.CylinderGeometry(r*.7,r,3.6,10)),dark);tube.position.set(x,y,z);parent.add(tube);box(parent,r*1.35,1,1,x,y-2,z,orange);const flame=glow(parent,x,y-4.2,z+1,6.5,engineMat);flame.name='engine';flame.userData.glow=6.5;return flame;}
  const friendlyPlume=plumeMat.clone();friendlyPlume.uniforms=plumeMat.uniforms;
  friendlyPlume.fragmentShader=friendlyPlume.fragmentShader.replace('vec3(1.,.16,.015)','vec3(.04,.35,1.)').replace('vec3(1.,.9,.65)','vec3(.7,.95,1.)');materials.add(friendlyPlume);
  function missile(friendly=false){const g=new T.Group();
    const body=new T.Mesh(geo(new T.CylinderGeometry(1.05,1.25,11,10)),friendly?silver:armor);g.add(body);
    const nose=new T.Mesh(geo(new T.ConeGeometry(1.05,4.2,10)),friendly?cyan:red);nose.position.y=7.4;g.add(nose);
    plate(g,[[-3.2,-5.2],[-0.8,-1.2],[0.8,-1.2],[3.2,-5.2]],0.6,0.6,navy);
    box(g,2.2,1.1,1.3,0,-3.4,0.8,friendly?cyan:orange);
    const exhaust=new T.Mesh(spritePlane,friendly?friendlyPlume:plumeMat);exhaust.scale.set(5,16,1);exhaust.position.set(0,-12,2);g.add(exhaust);
    const flame=glow(g,0,-6,2,7,friendly?blueGlow:engineMat);flame.name='engine';flame.userData.glow=7;return g;}
  function paintedFighter(){const g=new T.Group();
    illustratedSprite(g,'fighter-v8.jpg',46,46,.5,true);
    for(const x of [-6.4,6.4]){const flame=glow(g,x,-18.4,27,9,engineMat);flame.name='engine';flame.userData.glow=9;}
    return g;}
  function paintedFrigate(){const g=new T.Group();
    illustratedSprite(g,'frigate-v8.jpg',42,64,.46,true);
    for(const x of [-7.4,0,7.4]){const flame=glow(g,x,-28,27,10,engineMat);flame.name='engine';flame.userData.glow=10;}
    return g;}
  function paintedRocket(){const g=new T.Group();
    illustratedSprite(g,'rocket-v8.jpg',13,30,.4,true);
    const flame=glow(g,0,-13.5,27,7,engineMat);flame.name='engine';flame.userData.glow=7;
    return g;}
  function illustratedTower(kind){const g=new T.Group(),gun=new T.Group();gun.name='gun';g.add(gun);
    ring(g,11,.9,-6,silver);ring(g,7.5,.45,-4,guide);
    const art=TURRET_ART[kind];
    const body=illustratedSprite(gun,art.file,art.size,art.size,art.pivot);body.name='turret-body';
    const flash=new T.Group();flash.position.set(0,art.muzzle,28);flash.name='muzzle';flash.visible=false;gun.add(flash);
    for(const x of art.ports||[0]){
      glow(flash,x,0,0,18,spriteMat(art.color,.9));
      if(kind!=='tesla'&&kind!=='mine'){const jet=new T.Mesh(spritePlane,kind==='flak'||kind==='silo'?plumeMat:friendlyPlume);
        jet.position.set(x,9,1);jet.scale.set(kind==='laser'?5:10,kind==='gauss'?28:16,1);jet.rotation.z=Math.PI;flash.add(jet);}
    }
    return g;}
  const templates={fighter:paintedFighter(),frigate:paintedFrigate(),missile:paintedRocket(),interceptor:missile(true)};for(const k of ['laser','silo','flak','gauss','tesla','mine','battery'])templates[k]=illustratedTower(k);
  function icon(kind){
    if(!templates[kind])return null;if(iconCache.has(kind))return iconCache.get(kind);
    const size=192,target=new T.WebGLRenderTarget(size,size);target.texture.colorSpace=T.SRGBColorSpace;
    const preview=new T.Scene();preview.background=new T.Color(0x0b1b29);
    preview.add(templates[kind].clone(true),new T.HemisphereLight(0xd8edff,0x182639,1));
    const light=new T.DirectionalLight(0xd6edff,3);light.position.set(-50,70,120);preview.add(light);
    const art=TURRET_ART[kind],extent=art?art.size*1.1:124,center=art?(art.pivot-.5)*art.size:8;
    const cam=new T.OrthographicCamera(-extent/2,extent/2,center+extent/2,center-extent/2,.1,1000);cam.position.set(0,0,200);cam.lookAt(0,0,0);
    const previous=renderer.getRenderTarget();renderer.setRenderTarget(target);renderer.render(preview,cam);
    const pixels=new Uint8Array(size*size*4);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);renderer.setRenderTarget(previous);target.dispose();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),data=ctx.createImageData(size,size);
    for(let y=0;y<size;y++)data.data.set(pixels.subarray((size-y-1)*size*4,(size-y)*size*4),y*size*4);
    ctx.putImageData(data,0,0);const url=canvas.toDataURL();iconCache.set(kind,url);return url;
  }
  const objects=new Map(),free=new Map();
  function object(key,type){if(objects.has(key))return objects.get(key);const list=free.get(type)||[];let m=list.pop();if(!m){m=templates[type].clone(true);const body=m.getObjectByName('turret-body');if(body){body.material=body.material.clone();materials.add(body.material);}}m.userData.kind=type;scene.add(m);objects.set(key,m);return m;}
  function cleanup(active){for(const [key,m] of objects)if(!active.has(key)){scene.remove(m);objects.delete(key);const list=free.get(m.userData.kind)||[];list.push(m);free.set(m.userData.kind,list);}}
  const noiseGL=`float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float fbm(vec3 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=a*noise(p);p=p*2.03+vec3(2.4,1.3,4.1);a*=.5;}return n;}`;
  const earthTex=new T.TextureLoader().load(ASSET+'earth-blue-marble-july.jpg');earthTex.colorSpace=T.SRGBColorSpace;textures.add(earthTex);
  earthTex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const cloudTex=new T.TextureLoader().load(ASSET+'earth-clouds.jpg');cloudTex.wrapS=T.RepeatWrapping;textures.add(cloudTex);
  const planetMat=new T.ShaderMaterial({uniforms:{time:{value:0},earth:{value:earthTex},clouds:{value:cloudTex}},vertexShader:'varying vec3 p;varying vec3 n;varying vec2 vUv;void main(){p=position;vUv=uv;n=normalMatrix*normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`precision highp float;varying vec3 p;varying vec3 n;varying vec2 vUv;uniform float time;uniform sampler2D earth;uniform sampler2D clouds;
    void main(){vec3 v=normalize(p),normal=normalize(n),sun=normalize(vec3(-.65,.5,.85));vec3 col=texture2D(earth,vUv).rgb;
      float day=max(0.,dot(normal,sun)),ocean=smoothstep(.005,.045,col.b-max(col.r,col.g));
      vec2 cloudUv=vUv+vec2(time*.0006,0.);
      float cloud=texture2D(clouds,cloudUv).r;
      float shadow=texture2D(clouds,cloudUv+vec2(.004,-.002)).r;
      col+=vec3(.002,.014,.04)*ocean;col*=(.06+day*1.3)*(1.-shadow*.24);
      col=mix(col,vec3(.76,.83,.93)*(.07+day),smoothstep(.09,.9,cloud)*.88);
      col+=vec3(.003,.01,.025)*(.3+day)+vec3(.004,.035,.12)*ocean*day;
      float spec=pow(max(0.,dot(normal,normalize(sun+vec3(0.,0.,1.)))),48.);col+=vec3(.6,.75,1.)*spec*ocean*.28;
      float edge=pow(clamp(1.-normal.z,0.,1.),3.);col+=vec3(.008,.09,.22)*edge*day;
      gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});materials.add(planetMat);
  const planet=new T.Mesh(geo(new T.SphereGeometry(62,96,48)),planetMat);planet.position.z=30;planet.rotation.x=.32;scene.add(planet);
  const atmosphereMat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,vertexShader:'varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 n;void main(){float f=pow(clamp(1.-abs(n.z),0.,1.),3.5);gl_FragColor=vec4(.10,.55,1.,f*.65);}'});materials.add(atmosphereMat);
  const atmosphere=new T.Mesh(geo(new T.SphereGeometry(66,48,24)),atmosphereMat);atmosphere.position.z=30;scene.add(atmosphere);
  const shield=ring(scene,71,1.1,30,cyan);shield.material=cyan;shield.visible=false;
  const orbitMat=new T.LineBasicMaterial({color:0x9fc9df,transparent:true,opacity:.3});materials.add(orbitMat);
  const ringPoints=Array.from({length:128},(_,i)=>new T.Vector3(Math.cos(i*Math.PI/64),Math.sin(i*Math.PI/64),-4/197.6));const orbitLine=new T.LineLoop(geo(new T.BufferGeometry().setFromPoints(ringPoints)),orbitMat);scene.add(orbitLine);
  const pads=[];for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3;const g=new T.Group();g.position.set(Math.cos(a)*197.6,-Math.sin(a)*197.6,0);ring(g,8.5,.7,0,silver);ring(g,6.2,.35,1,guide);pads.push(g);scene.add(g);}
  const skyTexture=new T.TextureLoader().load(ASSET+'deep-space.png');skyTexture.colorSpace=T.SRGBColorSpace;skyTexture.wrapS=skyTexture.wrapT=T.MirroredRepeatWrapping;textures.add(skyTexture);
  const skyMat=new T.ShaderMaterial({uniforms:{map:{value:skyTexture}},depthWrite:false,vertexShader:'varying vec2 pos;void main(){pos=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D map;varying vec2 pos;void main(){vec3 c=texture2D(map,pos/vec2(2800.,1866.)+.5).rgb;gl_FragColor=vec4(c*.92,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});materials.add(skyMat);
  const sky=new T.Mesh(geo(new T.PlaneGeometry(20000,20000)),skyMat);sky.position.z=-1200;scene.add(sky);
  let seed=4491;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const starPositions=new Float32Array(2800*3);for(let i=0;i<2800;i++){starPositions[i*3]=(rand()-.5)*7500;starPositions[i*3+1]=(rand()-.5)*9500;starPositions[i*3+2]=-500+rand()*200;}
  const starGeo=geo(new T.BufferGeometry());starGeo.setAttribute('position',new T.BufferAttribute(starPositions,3));const starMat=new T.PointsMaterial({color:0xd4ecff,size:2.1,transparent:true,opacity:.78,depthWrite:false});materials.add(starMat);scene.add(new T.Points(starGeo,starMat));
  const rockGeo=geo(new T.IcosahedronGeometry(1,2));const rp=rockGeo.attributes.position;for(let i=0;i<rp.count;i++){
    const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),f=.88+.1*Math.sin(x*8+y*5+z*11)+.06*Math.sin(x*21-z*17);
    rp.setXYZ(i,x*f,y*f,z*f);
  }rockGeo.computeVertexNormals();
  const rockMat=metal(0x42464d,.97,.03);
  rockMat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 rockPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nrockPoint=position;');
    shader.fragmentShader='varying vec3 rockPoint;\n'+noiseGL+'\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=.48+.7*fbm(rockPoint*19.);');
  };
  const rocks=new T.InstancedMesh(rockGeo,rockMat,90),rockData=[],dummy=new T.Object3D();
  for(let i=0;i<90;i++){const side=i%2?1:-1;rockData.push({x:side*(520+rand()*520),y:(rand()-.5)*3200,z:rand()*100-60,r:8+rand()*31,rx:rand()*6,ry:rand()*6,speed:(rand()-.5)*.04});}scene.add(rocks);
  const particleGeo=geo(new T.BufferGeometry()),pp=new Float32Array(900*3),pc=new Float32Array(900*3);particleGeo.setAttribute('position',new T.BufferAttribute(pp,3).setUsage(T.DynamicDrawUsage));particleGeo.setAttribute('color',new T.BufferAttribute(pc,3).setUsage(T.DynamicDrawUsage));
  const particleMat=new T.PointsMaterial({map:glowTex,size:6,transparent:true,vertexColors:true,blending:T.AdditiveBlending,depthWrite:false});materials.add(particleMat);const particles=new T.Points(particleGeo,particleMat);particles.frustumCulled=false;scene.add(particles);
  const boltMat=emissive(0x86eaff,5),missileGlow=spriteMat(0x69dfff,.9),boltPool=[],beamPool=[],flarePool=[];
  const hitPool=[],shockPool=[],smokePool=[];
  const smokeMat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{phase:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform float phase;${noiseGL}
      void main(){vec2 q=vUv*2.-1.;float n=fbm(vec3(q*4.,phase*.8));
        float a=(1.-smoothstep(.25,1.,length(q)))*smoothstep(.18,.65,n)*(1.-phase)*.4;
        gl_FragColor=vec4(mix(vec3(.07,.09,.12),vec3(.38,.42,.47),n),a);}`});materials.add(smokeMat);
  const shockGeo=geo(new T.TorusGeometry(1,.014,4,64));
  function hitAt(i){if(!hitPool[i])hitPool.push(glow(scene,0,0,70,55,impactMat));return hitPool[i];}
  function shockAt(i){if(!shockPool[i]){const mat=new T.MeshBasicMaterial({color:0xffb56b,transparent:true,depthWrite:false,blending:T.AdditiveBlending});materials.add(mat);const mesh=new T.Mesh(shockGeo,mat);scene.add(mesh);shockPool.push(mesh);}return shockPool[i];}
  function smokeAt(i){if(!smokePool[i]){const mat=smokeMat.clone();materials.add(mat);const m=new T.Mesh(spritePlane,mat);scene.add(m);smokePool.push(m);}return smokePool[i];}
  const shotPalettes={};for(const [kind,tint] of Object.entries({player:0x64dfff,flak:0xffa044,gauss:0xc5eaff,laser:0x46cfff})){
    const core=new T.MeshBasicMaterial({color:kind==='flak'?0xfff1cd:0xeaffff,toneMapped:false});
    const halo=new T.MeshBasicMaterial({map:glowTex,color:tint,transparent:true,opacity:.65,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
    materials.add(core);materials.add(halo);shotPalettes[kind]={core,halo};
  }
  function luminousBolt(){const g=new T.Group(),core=new T.Mesh(cube,shotPalettes.laser.core),halo=new T.Mesh(spritePlane,shotPalettes.laser.halo);halo.scale.set(7,1.8,1);halo.position.z=2;g.add(core,halo);return g;}
  function boltAt(i){if(!boltPool[i]){const m=luminousBolt();scene.add(m);boltPool.push(m);}return boltPool[i];}
  function beamAt(i){if(!beamPool[i]){const m=luminousBolt();scene.add(m);beamPool.push(m);}return beamPool[i];}
  function flareAt(i){if(!flarePool[i]){
    const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,uniforms:{phase:{value:0}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 vUv;uniform float phase;${noiseGL}
        void main(){vec2 q=vUv*2.-1.;float n=fbm(vec3(q*6.,phase*5.));float r=length(q)+(n-.5)*.38;
          float edge=1.-smoothstep(.12,.88,r);float core=1.-smoothstep(.02,.35,r);
          vec3 col=mix(vec3(1.,.08,.008),vec3(1.,.55,.055),n);col=mix(col,vec3(1.,.95,.72),core*(1.-phase));
          float a=edge*pow(clamp(1.-phase,0.,1.),.7);gl_FragColor=vec4(col,a);
        }`});materials.add(mat);const s=new T.Mesh(spritePlane,mat);scene.add(s);flarePool.push(s);
    }return flarePool[i];}
  const lights=Array.from({length:3},()=>{const l=new T.PointLight(0xff793c,0,550,2);scene.add(l);return l;});
  const missileVeil=createMissileVeil(scene);
  const upgradeHalo=ring(scene,26,.6,60,cyan);upgradeHalo.visible=false;
  const weaponCoils=new T.Group();scene.add(weaponCoils);
  for(const x of [-13,13]){const coil=glow(weaponCoils,x,0,40,10,blueGlow);coil.name='capacitor';}
  // Small armor fragments come from real explosions and expire by simulation time.
  const debrisMesh=new T.InstancedMesh(geo(new T.TetrahedronGeometry(1)),silver,120),debris=[],seenFlashes=new WeakSet();
  debrisMesh.count=0;debrisMesh.frustumCulled=false;scene.add(debrisMesh);
  function updateDebris(game){
    for(const f of game.flashes||[]){if(seenFlashes.has(f))continue;seenFlashes.add(f);
      for(let i=0;i<7&&debris.length<120;i++){const a=rand()*Math.PI*2,s=60+rand()*150;debris.push({x:f.x,y:-f.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,born:game.time,life:.55+rand()*.5,size:1.5+rand()*3,spin:rand()*8});}
    }
    for(let i=debris.length-1;i>=0;i--)if(game.time-debris[i].born>debris[i].life)debris.splice(i,1);
    for(let i=0;i<debris.length;i++){const d=debris[i],age=game.time-d.born,fade=1-age/d.life;
      dummy.position.set(d.x+d.vx*age,d.y+d.vy*age,46);dummy.rotation.set(age*d.spin,age*d.spin*.7,d.spin+age*3);
      dummy.scale.set(d.size*fade,d.size*.45*fade,d.size*.3*fade);dummy.updateMatrix();debrisMesh.setMatrixAt(i,dummy.matrix);
    }debrisMesh.count=debris.length;debrisMesh.instanceMatrix.needsUpdate=true;
  }
  function animateTurret(m,kind,flash,building=false){
    const art=TURRET_ART[kind],strength=building?0:Math.max(0,flash||0),body=m.getObjectByName('turret-body'),muzzle=m.getObjectByName('muzzle');
    const recoil=strength*strength*(kind==='gauss'?3.5:kind==='flak'?2.4:.6);
    body.position.y=(art.pivot-.5)*art.size-recoil;body.material.uniforms.heat.value=strength*.8;
    muzzle.position.y=art.muzzle-recoil;muzzle.visible=strength>.35;muzzle.scale.setScalar(.45+strength*.8);
  }
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
    const spin=v.planetSpin||game.time*.035,scale=Math.max(0.2,(v.planetR||52)/62);
    planet.scale.setScalar(scale);atmosphere.scale.setScalar(scale);
    planet.rotation.y=-1.55+spin;planet.rotation.z=spin*.12;
    orbitLine.scale.setScalar(v.ringR);
    planetMat.uniforms.time.value=game.time;plumeMat.uniforms.time.value=game.time;
    shield.visible=game.hitFlash>.1;shield.scale.setScalar((v.shieldR||71)/71*(1+(1-game.hitFlash)*.2));
    pads.forEach((p,i)=>{
      const a=-Math.PI/2+(i+0.5)*Math.PI*2/6+spin;
      p.position.set(Math.cos(a)*v.ringR,-Math.sin(a)*v.ringR,8);
      p.visible=!game.towers.some(t=>t.slot===i);
    });
    for(let i=0;i<rockData.length;i++){const r=rockData[i];dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(r.rx+game.time*r.speed,r.ry,game.time*r.speed*.3);dummy.scale.set(r.r,r.r*.8,r.r*.65);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);}rocks.instanceMatrix.needsUpdate=true;
    const active=new Set();
    for(const e of game.enemies){const m=object(e,e.heavy?'frigate':'fighter');active.add(e);m.position.set(e.x,-e.y,22);m.rotation.set(Math.sin(e.wobble)*.05,Math.cos(e.wobble)*.06,-Math.atan2(-e.y,-e.x)-Math.PI/2);const pulse=.72+.38*Math.sin(game.time*26+e.wobble);m.traverse(o=>{if(o.name==='engine')o.scale.setScalar((o.userData.glow||6.5)*pulse);});}
    for(const t of game.towers){const m=object(t,t.kind);active.add(t);const a=-Math.PI/2+(t.slot+0.5)*Math.PI*2/6+spin,x=Math.cos(a)*v.ringR,y=Math.sin(a)*v.ringR;m.position.set(x,-y,12);
      const shot=t.shotVisual,flash=shot?Math.max(0,1-(game.time-shot.at)*5):0;
      const angle=flash>.1?shot.angle:t.lock?Math.atan2(t.lock.y-y,t.lock.x-x):a;m.getObjectByName('gun').rotation.z=-angle-Math.PI/2;m.scale.setScalar(TURRET_WORLD_SCALE*(t.buildLeft>0?.6+.4*(1-t.buildLeft/4):1));
      animateTurret(m,t.kind,flash,t.buildLeft>0);
    }
    const playerKey='player',playerScale=.48*TURRET_WORLD_SCALE,playerRadius=v.shieldR+12-TURRET_ART.gauss.muzzle*playerScale;
    const player=object(playerKey,'battery');active.add(playerKey);player.position.set(Math.cos(game.aim)*playerRadius,-Math.sin(game.aim)*playerRadius,20);player.scale.setScalar(playerScale);player.getObjectByName('gun').rotation.z=-game.aim-Math.PI/2;
    animateTurret(player,'battery',game.flash);
    const power=game.weaponLevels?.dmg||0,rate=game.weaponLevels?.rate||0;
    weaponCoils.position.copy(player.position);weaponCoils.rotation.z=-game.aim-Math.PI/2;weaponCoils.visible=power+rate>0;
    weaponCoils.children.forEach((coil,i)=>coil.scale.setScalar(4+power*1.5+rate*.6+(game.flash||0)*5));
    upgradeHalo.visible=game.upgradePulse>0;upgradeHalo.position.set(player.position.x,player.position.y,60);upgradeHalo.scale.setScalar(1+(1-(game.upgradePulse||0))*1.4);
    for(const [entries,type] of [[game.rockets,'missile'],[game.interceptors,'interceptor']])for(const e of entries){const m=object(e,type);active.add(e);m.position.set(e.x,-e.y,20);m.rotation.z=-Math.atan2(e.vy,e.vx)-Math.PI/2;}
    cleanup(active);
    let bi=0;for(const s of game.shots){const m=boltAt(bi++),palette=shotPalettes[s.kind]||shotPalettes.player,boost=s.kind==='player'?Math.max(0,s.dmg-1):0;m.children[0].material=palette.core;m.children[1].material=palette.halo;m.visible=true;m.position.set(s.x,-s.y,28);m.rotation.z=-Math.atan2(s.vy,s.vx)-Math.PI/2;m.scale.set(s.kind==='gauss'?1.6:1.15+boost*.4,s.kind==='gauss'?36:s.kind==='flak'?12:22+boost*8,1);}for(let i=bi;i<boltPool.length;i++)boltPool[i].visible=false;
    let be=0;for(const t of game.towers){const shot=t.shotVisual,flash=shot?Math.max(0,1-(game.time-shot.at)*5):0;if(t.kind!=='laser'||flash<.1)continue;
      const a=-Math.PI/2+(t.slot+0.5)*Math.PI*2/6+spin,x=Math.cos(a)*v.ringR,y=Math.sin(a)*v.ringR,dx=shot.x-x,dy=shot.y-y,distance=Math.hypot(dx,dy),offset=Math.min((TURRET_ART.laser.muzzle-.6*flash*flash)*TURRET_WORLD_SCALE,distance),m=beamAt(be++);m.visible=true;const fraction=distance>0?offset/distance:0;m.position.set(x+dx*(1+fraction)/2,-y-dy*(1+fraction)/2,25);m.rotation.z=-Math.atan2(dy,dx)-Math.PI/2;m.scale.set(.6+flash,Math.max(.01,distance-offset),1.7);
    }for(let i=be;i<beamPool.length;i++)beamPool[i].visible=false;
    let pi=0;for(const p of game.sparks){if(pi>=900)break;pp[pi*3]=p.x;pp[pi*3+1]=-p.y;pp[pi*3+2]=35;color.set(p.color).multiplyScalar(Math.min(4,p.life*8));pc[pi*3]=color.r;pc[pi*3+1]=color.g;pc[pi*3+2]=color.b;pi++;}particleGeo.setDrawRange(0,pi);particleGeo.attributes.position.needsUpdate=true;particleGeo.attributes.color.needsUpdate=true;particleMat.size=Math.max(1.6,v.cameraScale*7);
    let fi=0;for(const f of game.flashes||[]){const s=flareAt(fi++);s.visible=true;s.position.set(f.x,-f.y,60);s.scale.setScalar(f.radius*(1-f.life/.45+.2)*2.8);s.material.uniforms.phase.value=1-f.life/.45;}for(let i=fi;i<flarePool.length;i++)flarePool[i].visible=false;
    let hi=0;for(const e of [...game.enemies,...game.rockets]){if(!(e.flash>0))continue;const s=hitAt(hi++);s.visible=true;s.position.set(e.x,-e.y,32);s.scale.setScalar(7+e.flash*16);}for(let i=hi;i<hitPool.length;i++)hitPool[i].visible=false;
    let ri=0;for(const r of game.rings){const m=shockAt(ri++);m.visible=true;m.position.set(r.x,-r.y,65);m.scale.setScalar(Math.max(1,r.r));m.material.color.setStyle('rgb('+r.color+')');m.material.opacity=Math.min(.7,r.life*2);}for(let i=ri;i<shockPool.length;i++)shockPool[i].visible=false;
    let si=0;for(const p of game.smoke){const s=smokeAt(si++);s.visible=true;s.position.set(p.x,-p.y,10);s.scale.setScalar(p.r*5);s.material.uniforms.phase.value=Math.max(0,Math.min(1,1-p.life/.8));}for(let i=si;i<smokePool.length;i++)smokePool[i].visible=false;
    lights.forEach((l,i)=>{const f=(game.flashes||[])[i];l.intensity=f?f.life*1200:0;if(f)l.position.set(f.x,-f.y,100);});
    updateDebris(game);missileVeil.update(game);renderer.setRenderTarget(null);renderer.render(scene,camera);
    if(auditLeft>0){sampleFrame();auditLeft--;}
    frameTotal+=performance.now()-start;frameCount++;root.dataset.renderMs=(frameTotal/frameCount).toFixed(1);root.dataset.drawCalls=String(renderer.info.render.calls);
  }
  function dispose(){if(disposed)return;disposed=true;missileVeil.dispose();for(const obj of [...Object.values(templates),scene])obj.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
  function audit(){return {...frameAudit,healthy:frameAudit.samples>0&&frameAudit.blackFrames===0&&frameAudit.glErrors===0,cpuMs:Number((frameTotal/Math.max(1,frameCount)).toFixed(2)),meshes:objects.size,frames:frameCount,veil:missileVeil.audit()};}
  root.orbitGpuAudit=audit;
  return {render,dispose,icon};
}
