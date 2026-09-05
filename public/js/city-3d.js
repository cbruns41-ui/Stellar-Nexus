import * as THREE from "/vendor/three.module.min.js?v=1";

const WORLD_POSITIONS = Object.freeze({
  command: [0, 0], citadel: [-8.0, -5.8], archive: [7.8, -5.6], defense_hub: [-9.9, 1.2], shipyard: [9.7, 1.4],
  energy_array: [-5.2, -10.4], fusion: [0, -11.7], shield: [5.2, -10.3], quantum_lab: [-9.9, -5.1], jumpgate: [10.0, -5.0],
  robotics: [-6.2, 5.4], nanite: [6.2, 5.4], matter_mine: [-9.8, 8.7], helium_well: [-6.5, 10.6],
  titan_extractor: [-2.3, 10.8], uplink: [2.0, 10.9], diamond_forge: [6.1, 10.3], silo: [9.7, 8.4],
  spy_center: [-9.5, 13.8], beacon: [-4.0, 14.4], colony_dock: [3.2, 14.3], habitat: [9.3, 13.4],
});

const C = {
  steel: 0x152531, dark: 0x08131b, trim: 0x6f8795, cyan: 0x30d9ff, blue: 0x1475d1,
  green: 0x42ed9b, violet: 0xb96cff, amber: 0xffa33c, red: 0xff4b45, white: 0xdff8ff,
};

function mat(color, metalness = 0.72, roughness = 0.34, emissive = 0, intensity = 0) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity: intensity });
}

function mesh(geo, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const out = new THREE.Mesh(geo, material);
  out.position.set(...position);
  out.rotation.set(...rotation);
  out.castShadow = true;
  out.receiveShadow = true;
  return out;
}

function box(group, size, position, material, rotation) {
  const out = mesh(new THREE.BoxGeometry(...size), material, position, rotation);
  group.add(out);
  return out;
}

function cyl(group, radiusTop, radiusBottom, height, position, material, sides = 16, rotation) {
  const out = mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides), material, position, rotation);
  group.add(out);
  return out;
}

function sphere(group, radius, position, material, detail = 18) {
  const out = mesh(new THREE.SphereGeometry(radius, detail, Math.max(10, Math.floor(detail * 0.65))), material, position);
  group.add(out);
  return out;
}

function torus(group, radius, tube, position, material, rotation = [Math.PI / 2, 0, 0]) {
  const out = mesh(new THREE.TorusGeometry(radius, tube, 10, 32), material, position, rotation);
  group.add(out);
  return out;
}

function cone(group, radius, height, position, material, sides = 10, rotation) {
  const out = mesh(new THREE.ConeGeometry(radius, height, sides), material, position, rotation);
  group.add(out);
  return out;
}

function glow(group, position, color, intensity = 2.4, distance = 4) {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.position.set(...position);
  group.add(light);
  return light;
}

function antenna(group, x, z, height, materials, dish = false) {
  cyl(group, .055, .09, height, [x, height / 2 + .5, z], materials.trim, 8);
  sphere(group, .11, [x, height + .52, z], materials.cyan);
  if (dish) {
    const d = mesh(new THREE.SphereGeometry(.42, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), materials.trim, [x, height + .24, z], [-Math.PI / 3, 0, 0]);
    group.add(d);
    group.userData.animated = [...(group.userData.animated || []), { object: d, axis: "z", speed: .2 }];
  }
}

function tower(group, x, z, h, r, materials, accent = "cyan") {
  cyl(group, r * .82, r, h, [x, h / 2 + .18, z], materials.steel, 10);
  cyl(group, r * .92, r * .92, .12, [x, h * .62, z], materials[accent], 12);
  cyl(group, r * .55, r * .76, .48, [x, h + .4, z], materials.dark, 10);
  sphere(group, r * .18, [x, h + .72, z], materials[accent], 12);
}

function baseBlock(group, sx, sy, sz, materials, accent = "cyan") {
  cyl(group, Math.min(sx, sz) * .6, Math.min(sx, sz) * .72, .25, [0, .15, 0], materials.dark, 8);
  box(group, [sx, sy, sz], [0, sy / 2 + .25, 0], materials.steel);
  box(group, [sx * .84, .08, sz * 1.02], [0, sy + .24, 0], materials[accent]);
}

function makeBuilding(id, materials) {
  const g = new THREE.Group();
  const m = materials;
  switch (id) {
    case "command": {
      cyl(g, 2.05, 2.45, .5, [0, .32, 0], m.dark, 12);
      cyl(g, 1.72, 2.02, 1.05, [0, 1.05, 0], m.steel, 12);
      sphere(g, 1.25, [0, 2.03, 0], m.glass, 28);
      torus(g, 1.32, .11, [0, 2.0, 0], m.cyan);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        tower(g, Math.cos(a) * 1.72, Math.sin(a) * 1.72, 2.15, .3, m, "cyan");
      }
      antenna(g, 0, 0, 1.65, m);
      glow(g, [0, 2.4, .1], C.cyan, 4, 7);
      break;
    }
    case "citadel": {
      baseBlock(g, 3.35, .7, 2.7, m, "red");
      for (const [x, z] of [[-1.25,-.9],[1.25,-.9],[-1.25,.9],[1.25,.9]]) tower(g, x, z, 2.05, .48, m, "red");
      box(g, [1.6, 1.4, 1.45], [0, 1.35, 0], m.dark);
      cone(g, .7, .75, [0, 2.45, 0], m.red, 8);
      break;
    }
    case "archive": {
      baseBlock(g, 3, .65, 2.2, m, "blue");
      tower(g, -1, 0, 2.15, .54, m, "blue"); tower(g, 1, 0, 2.15, .54, m, "violet");
      sphere(g, .55, [0, 1.42, 0], m.glass, 22); torus(g, .72, .07, [0, 1.42, 0], m.cyan, [0, 0, Math.PI / 2]);
      antenna(g, 0, 0, 2.05, m, true);
      break;
    }
    case "defense_hub": {
      baseBlock(g, 3.4, .75, 2.45, m, "red");
      cyl(g, 1.05, 1.28, .8, [0, 1.12, 0], m.dark, 10);
      for (const x of [-.52,.52]) {
        const barrel = cyl(g, .13, .18, 1.55, [x, 2.0, -.25], m.trim, 10, [Math.PI / 2.8, 0, 0]);
        barrel.userData.turret = true;
      }
      torus(g, 1.12, .09, [0, 1.45, 0], m.red);
      break;
    }
    case "shipyard": {
      cyl(g, 2.25, 2.45, .25, [0, .13, 0], m.dark, 8);
      for (const x of [-1.65,1.65]) { box(g, [.36, 1.7, 3.2], [x, 1.04, 0], m.steel); box(g, [.48,.1,2.7],[x,1.65,0],m.cyan); }
      box(g, [3.65,.34,.42], [0, 1.78, 1.25], m.trim);
      const ship = new THREE.Group();
      cone(ship, .52, 2.5, [0, 1.25, 0], m.trim, 5, [Math.PI / 2, 0, 0]);
      box(ship, [2.05,.12,.5],[0,1.25,.1],m.steel);
      g.add(ship); g.userData.animated = [{ object: ship, axis: "y", speed: .12, bob: true }];
      break;
    }
    case "energy_array": {
      baseBlock(g, 3.1, .55, 2.5, m, "green");
      for (const [x,z] of [[-1,-.65],[1,-.65],[-1,.65],[1,.65]]) tower(g,x,z,1.8,.38,m,"green");
      sphere(g,.72,[0,1.7,0],m.green,22); torus(g,1.02,.09,[0,1.7,0],m.trim,[0,0,Math.PI/2]); torus(g,1.02,.07,[0,1.7,0],m.cyan,[Math.PI/2,0,0]);
      glow(g,[0,1.8,0],C.green,4,6);
      break;
    }
    case "fusion": {
      cyl(g, 1.9, 2.1, .48, [0,.25,0], m.dark, 16);
      cyl(g, .72, .98, 2.2, [0,1.48,0], m.steel, 14);
      for (let i=0;i<3;i++) { const r=torus(g,1.22,.11,[0,1.25+i*.52,0],i===1?m.green:m.cyan); g.userData.animated=[...(g.userData.animated||[]),{object:r,axis:"y",speed:(i%2?.45:-.35)}]; }
      sphere(g,.45,[0,1.75,0],m.green,18); glow(g,[0,1.75,0],C.green,4,6);
      break;
    }
    case "shield": {
      baseBlock(g, 2.8, .55, 2.4, m, "cyan");
      for (const [x,z] of [[-1,-.75],[1,-.75],[-1,.75],[1,.75]]) { tower(g,x,z,1.25,.28,m,"cyan"); cone(g,.28,.5,[x,1.9,z],m.cyan,8); }
      const dome = mesh(new THREE.SphereGeometry(1.65,24,12,0,Math.PI*2,0,Math.PI/2),m.shield,[0,.55,0]); g.add(dome);
      break;
    }
    case "quantum_lab": {
      baseBlock(g, 2.8, .6, 2.2, m, "violet");
      tower(g,-.85,0,2.4,.55,m,"violet"); tower(g,.85,0,1.8,.65,m,"cyan");
      const orb=sphere(g,.5,[.85,2.55,0],m.violet,20); glow(g,[.85,2.55,0],C.violet,3.4,5);
      g.userData.animated=[{object:orb,axis:"y",speed:.8,bob:true}];
      break;
    }
    case "jumpgate": {
      cyl(g, 2.0, 2.25, .25, [0,.13,0], m.dark, 10);
      const ring=torus(g,1.65,.25,[0,1.92,0],m.steel,[0,0,0]); torus(g,1.38,.07,[0,1.92,0],m.cyan,[0,0,0]);
      box(g,[.55,1.2,.8],[-1.65,.65,0],m.steel); box(g,[.55,1.2,.8],[1.65,.65,0],m.steel);
      const portal=mesh(new THREE.CircleGeometry(1.3,32),m.portal,[0,1.92,-.03]); g.add(portal);
      g.userData.animated=[{object:ring,axis:"z",speed:.12},{object:portal,axis:"z",speed:-.08}]; glow(g,[0,1.9,.2],C.cyan,4,7);
      break;
    }
    case "robotics": {
      baseBlock(g, 3.1, .8, 2.5, m, "amber");
      box(g,[1.15,1.3,1.25],[-.75,1.3,0],m.dark); tower(g,1,0,1.75,.48,m,"amber");
      for(const x of [-1.3,0,1.3]) { const arm=new THREE.Group(); cyl(arm,.12,.17,1.25,[x,1.65,.1],m.trim,8,[0,0,.6]); sphere(arm,.2,[x-.35,2.14,.1],m.amber); g.add(arm); g.userData.animated=[...(g.userData.animated||[]),{object:arm,axis:"z",speed:.14}]; }
      break;
    }
    case "nanite": {
      baseBlock(g, 2.9, .55, 2.3, m, "violet");
      for(let i=0;i<6;i++){const a=i*Math.PI/3; const cell=sphere(g,.48,[Math.cos(a)*1.05,1.18+Math.sin(a*2)*.15,Math.sin(a)*.82],i%2?m.violet:m.cyan,12); cell.scale.y=.7;}
      cyl(g,.55,.75,1.8,[0,1.3,0],m.glass,16); glow(g,[0,1.4,0],C.violet,3,5);
      break;
    }
    case "matter_mine": {
      cyl(g, 1.85, 2.1, .24, [0,.13,0], m.dark, 8);
      box(g,[1.65,.85,1.45],[-.55,.65,0],m.steel);
      const drill=cone(g,.42,2.2,[.85,1.05,-.15],m.trim,10,[0,0,-Math.PI/3]);
      g.userData.animated=[{object:drill,axis:"y",speed:1.8}];
      for(const [x,z] of [[-1.4,.8],[-1.05,1.1],[-1.5,-.75]]) sphere(g,.35,[x,.35,z],m.ore,8);
      box(g,[2.1,.18,.5],[.2,.48,1.1],m.amber,[0,.12,0]);
      break;
    }
    case "helium_well": {
      cyl(g, 1.75, 2.0, .22, [0,.12,0], m.dark, 10);
      for(const x of [-.72,.72]) { cyl(g,.5,.58,1.65,[x,1.02,0],m.steel,16); torus(g,.51,.06,[x,1.28,0],m.green); }
      const pump=new THREE.Group(); box(pump,[1.5,.16,.18],[0,1.85,.1],m.trim); cyl(pump,.18,.18,.8,[0,1.55,.1],m.trim,10); g.add(pump);
      g.userData.animated=[{object:pump,axis:"z",speed:.22}];
      break;
    }
    case "titan_extractor": {
      baseBlock(g, 2.8, .5, 2.25, m, "amber");
      tower(g,-.9,0,2.2,.35,m,"amber");
      const boom=new THREE.Group(); box(boom,[2.4,.24,.3],[.35,2.0,0],m.trim,[0,0,-.22]); box(boom,[.2,1.5,.2],[1.48,1.32,0],m.amber); g.add(boom);
      g.userData.animated=[{object:boom,axis:"y",speed:.1}];
      for(const z of [-.65,.65]) cyl(g,.32,.32,1.9,[0,.42,z],m.dark,10,[0,0,Math.PI/2]);
      break;
    }
    case "uplink": {
      cyl(g,1.75,2,.25,[0,.13,0],m.dark,10);
      for(const [x,z,h] of [[0,0,2.8],[-.8,.35,1.9],[.82,.42,2.15],[-.45,-.68,1.45],[.58,-.7,1.6]]) {
        const crystal=cone(g,.42,h,[x,h/2+.2,z],m.violet,6); crystal.rotation.y=.3; }
      torus(g,1.45,.08,[0,.45,0],m.cyan); glow(g,[0,1.6,0],C.violet,4,6);
      break;
    }
    case "diamond_forge": {
      baseBlock(g,2.9,.75,2.4,m,"amber");
      cyl(g,.95,1.2,1.55,[0,1.34,0],m.dark,8); torus(g,1.0,.12,[0,1.55,0],m.amber);
      const gem=mesh(new THREE.OctahedronGeometry(.62,0),m.violet,[0,2.5,0]); g.add(gem); glow(g,[0,2.35,0],C.amber,4,6);
      g.userData.animated=[{object:gem,axis:"y",speed:.8,bob:true}];
      break;
    }
    case "silo": {
      cyl(g,1.9,2.1,.22,[0,.12,0],m.dark,10);
      for(const [x,z,h] of [[-.8,-.55,1.9],[.8,-.55,2.25],[-.8,.65,1.5],[.8,.65,1.75]]) {
        cyl(g,.46,.55,h,[x,h/2+.22,z],m.steel,14); cone(g,.47,.55,[x,h+.5,z],m.trim,14); torus(g,.5,.05,[x,h*.65,z],m.cyan); }
      break;
    }
    case "spy_center": {
      baseBlock(g,2.65,.55,2.15,m,"violet");
      box(g,[1.2,1.35,1.1],[0,1.18,0],m.dark); antenna(g,0,0,2.15,m,true);
      for(const x of [-.82,.82]) cone(g,.26,1.2,[x,1.25,.2],m.violet,6);
      glow(g,[0,2.65,0],C.violet,2.4,5);
      break;
    }
    case "beacon": {
      cyl(g,1.25,1.6,.32,[0,.17,0],m.dark,10);
      for(let i=0;i<4;i++) cyl(g,.42-i*.07,.55-i*.06,.65,[0,.66+i*.55,0],i%2?m.trim:m.steel,10);
      torus(g,.72,.08,[0,2.38,0],m.cyan); sphere(g,.28,[0,2.72,0],m.cyan,16); antenna(g,0,0,2.75,m);
      glow(g,[0,2.8,0],C.cyan,5,8);
      break;
    }
    case "colony_dock": {
      cyl(g,2.05,2.3,.22,[0,.12,0],m.dark,8); torus(g,1.65,.08,[0,.27,0],m.cyan);
      for(const x of [-1.55,1.55]) { tower(g,x,.55,1.25,.3,m,"cyan"); box(g,[.22,1.15,.22],[x,.88,-.65],m.trim); }
      const shuttle=new THREE.Group(); cone(shuttle,.42,1.9,[0,.8,0],m.steel,6,[Math.PI/2,0,0]); box(shuttle,[1.35,.1,.35],[0,.8,.1],m.trim); g.add(shuttle);
      g.userData.animated=[{object:shuttle,axis:"y",speed:.15,bob:true}];
      break;
    }
    case "habitat": {
      cyl(g,1.9,2.15,.22,[0,.12,0],m.dark,12);
      for(const [x,z,r] of [[-.75,0,.8],[.72,.15,.7],[0,-.78,.55]]) {
        const dome=mesh(new THREE.SphereGeometry(r,20,10,0,Math.PI*2,0,Math.PI/2),m.glass,[x,.23,z]); g.add(dome); torus(g,r,.055,[x,.23,z],m.green); }
      box(g,[2.1,.16,.3],[0,.25,.5],m.trim); antenna(g,1.25,-.7,1.4,m);
      break;
    }
    default: baseBlock(g,2.5,.8,2,m,"cyan");
  }
  return g;
}

function labelTexture(title, level, empty, locked) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,512,128);
  ctx.fillStyle = locked ? "rgba(18,20,26,.9)" : "rgba(2,15,24,.9)";
  ctx.strokeStyle = locked ? "rgba(130,145,156,.72)" : empty ? "rgba(89,211,255,.76)" : "rgba(83,229,255,.92)";
  ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(8,8,496,112,22); ctx.fill(); ctx.stroke();
  ctx.textAlign="center"; ctx.fillStyle="#f1fbff"; ctx.font="700 34px system-ui,sans-serif"; ctx.fillText(title,256,55);
  ctx.fillStyle = locked ? "#8e9ca5" : empty ? "#73dfff" : "#48e6ff"; ctx.font="600 24px system-ui,sans-serif";
  ctx.fillText(locked ? "GESPERRT" : empty ? "BAUPLATZ" : `STUFE ${level}`,256,92);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; texture.minFilter=THREE.LinearFilter;
  return texture;
}

function groundTexture() {
  const canvas=document.createElement("canvas"); canvas.width=1024; canvas.height=1024; const ctx=canvas.getContext("2d");
  const grad=ctx.createLinearGradient(0,0,1024,1024); grad.addColorStop(0,"#142d35"); grad.addColorStop(.42,"#25362f"); grad.addColorStop(1,"#08151d"); ctx.fillStyle=grad; ctx.fillRect(0,0,1024,1024);
  let seed=1337; const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<17000;i++){const x=random()*1024,y=random()*1024,r=random()*2.8;ctx.fillStyle=`rgba(${45+random()*60},${55+random()*65},${52+random()*55},${.035+random()*.11})`;ctx.fillRect(x,y,r,r);}
  for(let i=0;i<90;i++){const x=random()*1024,y=random()*1024,r=8+random()*40;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,"rgba(72,95,82,.18)");g.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
  const texture=new THREE.CanvasTexture(canvas); texture.wrapS=texture.wrapT=THREE.RepeatWrapping; texture.repeat.set(2.4,2.4); texture.colorSpace=THREE.SRGBColorSpace; texture.anisotropy=4; return texture;
}

function addRoad(scene, a, b, materials) {
  const dx=b[0]-a[0], dz=b[1]-a[1], len=Math.hypot(dx,dz); const road=new THREE.Group();
  road.position.set((a[0]+b[0])/2,.08,(a[1]+b[1])/2); road.rotation.y=-Math.atan2(dz,dx);
  box(road,[len,.1,.72],[0,0,0],materials.road);
  box(road,[len,.035,.075],[0,.075,-.25],materials.cyan);
  box(road,[len,.035,.075],[0,.075,.25],materials.cyan);
  for(let x=-len/2+.55;x<len/2;x+=1.1) box(road,[.36,.035,.42],[x,.07,0],materials.trim);
  scene.add(road);
}

function makePad(plot, level, selected, materials) {
  const group=new THREE.Group(); group.userData.plotId=plot.id;
  const radius=plot.size==="capital"?2.55:plot.size==="large"?2.05:plot.size==="medium"?1.72:1.48;
  cyl(group,radius*.94,radius,.3,[0,.12,0],materials.dark,12);
  cyl(group,radius*.86,radius*.94,.16,[0,.29,0],materials.pad,12);
  group.userData.recommended=!!plot.recommended;
  const padAccent=selected?materials.selected:plot.recommended?materials.green:materials.cyan;
  const ring=torus(group,radius*.82,.07,[0,.24,0],padAccent); ring.userData.ring=true;
  for(let i=0;i<8;i++){const a=i*Math.PI/4; box(group,[.38,.06,.1],[Math.cos(a)*radius*.82,.27,Math.sin(a)*radius*.82],padAccent,[0,-a,0]);}
  if(level<=0){
    box(group,[1.25,.13,.28],[0,.48,0],materials.cyan); box(group,[.28,.13,1.25],[0,.48,0],materials.cyan);
    const beacon=cyl(group,.18,.42,1.2,[0,.85,0],materials.hologram,16); group.userData.animated=[{object:beacon,axis:"y",speed:.9,bob:true}];
  }
  return group;
}

export function createCity3D(canvas, options = {}) {
  if (!canvas || !window.WebGLRenderingContext) throw new Error("WebGL nicht verfuegbar");
  const renderer=new THREE.WebGLRenderer({canvas,antialias:!matchMedia("(max-width:760px)").matches,alpha:true,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,matchMedia("(max-width:760px)").matches?1.35:1.75));
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear=false;
  const backgroundScene=new THREE.Scene();
  const backgroundCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const backgroundUniforms={map:{value:null},imageAspect:{value:.5628},viewAspect:{value:1}};
  const backgroundTextures={portrait:null,landscape:null};
  const backgroundMaterial=new THREE.ShaderMaterial({
    uniforms:backgroundUniforms,depthTest:false,depthWrite:false,
    vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.999,1.0);}",
    fragmentShader:"uniform sampler2D map;uniform float imageAspect;uniform float viewAspect;varying vec2 vUv;void main(){vec2 p=vUv;if(viewAspect>imageAspect){float s=imageAspect/viewAspect;p.y=(p.y-.5)*s+.5;}else{float s=viewAspect/imageAspect;p.x=(p.x-.5)*s+.5;}vec4 color=texture2D(map,p);color.rgb=pow(max(color.rgb,vec3(0.0)),vec3(.82))*1.1;gl_FragColor=color;}",
  });
  const backgroundQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),backgroundMaterial);backgroundScene.add(backgroundQuad);
  const textureLoader=new THREE.TextureLoader();
  const selectBackground=()=>{
    const portrait=backgroundUniforms.viewAspect.value<.9;
    const texture=portrait?backgroundTextures.portrait:backgroundTextures.landscape;
    if(!texture)return;
    backgroundUniforms.map.value=texture;
    backgroundUniforms.imageAspect.value=(texture.image?.width||1)/(texture.image?.height||1);
  };
  textureLoader.load("/assets/colony/city-environment-v2.jpg?v=2",texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;backgroundTextures.portrait=texture;selectBackground();});
  textureLoader.load("/assets/colony/city-environment-desktop-v2.jpg?v=2",texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;backgroundTextures.landscape=texture;selectBackground();});
  const scene=new THREE.Scene(); scene.background=null; scene.fog=new THREE.FogExp2(0x07141c,.009);
  const camera=new THREE.PerspectiveCamera(38,1,.1,130); const mobile=matchMedia("(max-width:760px)").matches;
  const view={yaw:0,pitch:mobile?.84:.72,distance:mobile?72:41,targetX:mobile?1.55:0,targetZ:mobile?2.7:1.8};
  scene.add(new THREE.HemisphereLight(0xa6ddff,0x071013,1.55));
  const sun=new THREE.DirectionalLight(0xffe1bd,3.1); sun.position.set(-12,25,14); sun.castShadow=true; sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048); sun.shadow.camera.left=-25;sun.shadow.camera.right=25;sun.shadow.camera.top=28;sun.shadow.camera.bottom=-22; scene.add(sun);
  const rim=new THREE.DirectionalLight(0x1ebcff,2.2); rim.position.set(16,10,-18); scene.add(rim);
  const materials={
    steel:mat(C.steel,.86,.28),dark:mat(C.dark,.72,.42),trim:mat(C.trim,.9,.22),cyan:mat(0x14596e,.56,.25,C.cyan,2.2),blue:mat(0x123c75,.65,.3,C.blue,1.4),
    green:mat(0x155a42,.58,.25,C.green,2.1),violet:mat(0x4a2675,.5,.24,C.violet,2.3),amber:mat(0x6d4118,.66,.3,C.amber,1.8),red:mat(0x651c21,.7,.28,C.red,1.8),
    glass:new THREE.MeshPhysicalMaterial({color:0x3aa3c4,metalness:.18,roughness:.12,transmission:.22,transparent:true,opacity:.84,emissive:0x0a5c76,emissiveIntensity:.65}),
    shield:new THREE.MeshPhysicalMaterial({color:0x36ccff,transparent:true,opacity:.12,roughness:.08,metalness:.1,side:THREE.DoubleSide,emissive:0x1e8caf,emissiveIntensity:.55,depthWrite:false}),
    portal:new THREE.MeshBasicMaterial({color:0x50eaff,transparent:true,opacity:.4,side:THREE.DoubleSide,depthWrite:false}),
    hologram:new THREE.MeshBasicMaterial({color:0x55eaff,transparent:true,opacity:.32,depthWrite:false}),pad:mat(0x10232c,.78,.48),selected:mat(0x1d6c86,.5,.22,C.cyan,3),road:mat(0x071219,.62,.58),ore:mat(0x56636b,.25,.8),
  };
  const terrain=mesh(new THREE.PlaneGeometry(180,180,56,56),new THREE.MeshStandardMaterial({map:groundTexture(),color:0xa5ab94,roughness:.95,metalness:.02,transparent:true,opacity:.07}),[0,-.04,2],[-Math.PI/2,0,0]);
  const pos=terrain.geometry.attributes.position; for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);pos.setZ(i,Math.sin(x*.45)*.12+Math.cos(y*.39)*.1);} pos.needsUpdate=true;terrain.geometry.computeVertexNormals();terrain.receiveShadow=true;scene.add(terrain);
  for(let i=0;i<28;i++){const rock=mesh(new THREE.DodecahedronGeometry(.14+(i%7)*.045,0),materials.ore,[-27+(i*7.13)%54,.1,-18+(i*11.7)%43],[i*.2,i*.4,0]);rock.scale.y=.4;scene.add(rock);}
  const roots=new Map(), hitTargets=[], animated=[];
  let destroyed=false;
  const roadPairs=[["command","citadel"],["command","archive"],["command","defense_hub"],["command","shipyard"],["command","robotics"],["command","nanite"],["citadel","quantum_lab"],["archive","jumpgate"],["citadel","energy_array"],["command","fusion"],["archive","shield"],["defense_hub","matter_mine"],["defense_hub","helium_well"],["robotics","titan_extractor"],["nanite","uplink"],["nanite","diamond_forge"],["shipyard","silo"],["matter_mine","spy_center"],["titan_extractor","beacon"],["uplink","colony_dock"],["silo","habitat"]];
  for(const [a,b] of roadPairs) if(WORLD_POSITIONS[a]&&WORLD_POSITIONS[b]) addRoad(scene,WORLD_POSITIONS[a],WORLD_POSITIONS[b],materials);
  for(const plot of options.plots||[]){
    const [x,z]=WORLD_POSITIONS[plot.id]||[0,0]; const level=Number(options.buildings?.[plot.building]||0); const selected=options.selectedId===plot.id;
    const root=makePad(plot,level,selected,materials); root.position.set(x,0,z); root.userData.plotId=plot.id; root.userData.level=level;
    const hitRadius=plot.size==="capital"?3.1:plot.size==="large"?2.75:plot.size==="medium"?2.45:2.2;const hitMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});const hitTarget=mesh(new THREE.CylinderGeometry(hitRadius,hitRadius,.5,16),hitMaterial,[0,.65,0]);hitTarget.castShadow=false;hitTarget.receiveShadow=false;hitTarget.userData.plotId=plot.id;root.add(hitTarget);hitTargets.push(hitTarget);
    if(level>0){
      const model=makeBuilding(plot.id,materials);const fallbackSize=plot.size==="capital"?1.05:plot.size==="large"?.92:plot.size==="medium"?.78:.68;model.scale.setScalar(fallbackSize);root.add(model);if(model.userData.animated)animated.push(...model.userData.animated);
      const spriteMaterial=new THREE.SpriteMaterial({transparent:true,opacity:0,depthTest:true,depthWrite:false,alphaTest:.025,toneMapped:false});
      const sprite=new THREE.Sprite(spriteMaterial);const baseWidth=mobile?(plot.size==="capital"?7.7:plot.size==="large"?5.55:plot.size==="medium"?4.75:3.95):(plot.size==="capital"?8.35:plot.size==="large"?6.05:plot.size==="medium"?5.15:4.3);const levelScale=1+Math.min(level,20)*.005;
      sprite.scale.set(baseWidth*levelScale,baseWidth*(341/512)*levelScale,1);sprite.position.set(0,sprite.scale.y*.49+.18,.12);sprite.renderOrder=70-Math.round(z);root.add(sprite);root.userData.artSprite=sprite;
      textureLoader.load(`/assets/colony/buildings-hq/${plot.id}.png?v=2`,texture=>{if(destroyed){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());spriteMaterial.map=texture;spriteMaterial.opacity=1;spriteMaterial.needsUpdate=true;model.visible=false;});
    }
    const labelMat=new THREE.SpriteMaterial({map:labelTexture(plot.short,level,level<=0,!!plot.locked),transparent:true,depthTest:false,depthWrite:false});const label=new THREE.Sprite(labelMat);label.position.set(0,level > 0 ? .34 : 1.95,level > 0 ? 1.38 : 0);label.scale.set(plot.size==="capital"?4.8:3.7,plot.size==="capital"?1.2:.93,1);label.renderOrder=1000;root.userData.labelAlways=plot.id==="command";label.visible=!!(root.userData.labelAlways||selected||plot.recommended);root.userData.label=label;root.add(label);
    root.traverse(o=>{o.userData.plotId=plot.id;}); scene.add(root); roots.set(plot.id,root); if(root.userData.animated)animated.push(...root.userData.animated);
  }
  const updateCamera=()=>{const cp=Math.cos(view.pitch),sp=Math.sin(view.pitch);camera.position.set(view.targetX+Math.sin(view.yaw)*cp*view.distance,sp*view.distance,view.targetZ+Math.cos(view.yaw)*cp*view.distance);camera.lookAt(view.targetX,1.2,view.targetZ);}; updateCamera();
  const setSelected=(id)=>{for(const [plotId,root] of roots){root.traverse(o=>{if(o.userData.ring&&o.material){o.material=plotId===id?materials.selected:root.userData.recommended?materials.green:materials.cyan;}});if(root.userData.label)root.userData.label.visible=!!(root.userData.labelAlways||root.userData.recommended||plotId===id);}options.selectedId=id;};
  let raf=0,last=performance.now(),pressed=null,moved=false;const pointers=new Map();let pinch=0;
  const raycast=(event)=>{const rect=canvas.getBoundingClientRect();const mouse=new THREE.Vector2(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);const hits=ray.intersectObjects(hitTargets,false);return hits[0]?.object?.userData?.plotId||null;};
  const onDown=e=>{if(e.pointerType==="mouse"&&e.button!==0)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pressed={x:e.clientX,y:e.clientY,id:e.pointerId};moved=false;canvas.setPointerCapture?.(e.pointerId);};
  const onMove=e=>{const old=pointers.get(e.pointerId);if(!old)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const [a,b]=[...pointers.values()];const dist=Math.hypot(a.x-b.x,a.y-b.y);if(pinch)view.distance=THREE.MathUtils.clamp(view.distance*(pinch/dist),mobile?38:28,mobile?78:58);pinch=dist;moved=true;updateCamera();return;}const dx=e.clientX-old.x,dy=e.clientY-old.y;if(Math.abs(e.clientX-pressed.x)+Math.abs(e.clientY-pressed.y)>8)moved=true;if(moved){view.yaw=THREE.MathUtils.clamp(view.yaw-dx*.0035,-.34,.34);view.targetZ=THREE.MathUtils.clamp(view.targetZ+dy*.018,-2.2,7);updateCamera();options.onInteract?.();}};
  const onUp=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(pointers.size<2)pinch=0;if(!moved){const id=raycast(e);if(id){setSelected(options.selectedId===id?null:id);options.onSelect?.(options.selectedId);}}pressed=null;};
  const onWheel=e=>{e.preventDefault();view.distance=THREE.MathUtils.clamp(view.distance*(e.deltaY>0?1.08:.92),mobile?38:28,mobile?78:58);updateCamera();};
  canvas.addEventListener("pointerdown",onDown);canvas.addEventListener("pointermove",onMove);canvas.addEventListener("pointerup",onUp);canvas.addEventListener("pointercancel",onUp);canvas.addEventListener("wheel",onWheel,{passive:false});canvas.addEventListener("contextmenu",e=>e.preventDefault());
  const resize=()=>{const rect=canvas.getBoundingClientRect();const w=Math.max(1,Math.floor(rect.width)),h=Math.max(1,Math.floor(rect.height));renderer.setSize(w,h,false);camera.aspect=w/h;backgroundUniforms.viewAspect.value=w/h;selectBackground();camera.fov=h>w?44:38;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  const animate=now=>{if(destroyed)return;const dt=Math.min(.05,(now-last)/1000);last=now;for(const item of animated){item.object.rotation[item.axis||"y"]+=item.speed*dt;if(item.bob)item.object.position.y+=Math.sin(now*.002+item.object.id)*.0018;}renderer.clear();if(backgroundUniforms.map.value)renderer.render(backgroundScene,backgroundCamera);renderer.clearDepth();renderer.render(scene,camera);raf=requestAnimationFrame(animate);};raf=requestAnimationFrame(animate);
  options.onReady?.();
  return {setSelected,destroy(){destroyed=true;cancelAnimationFrame(raf);observer.disconnect();canvas.removeEventListener("pointerdown",onDown);canvas.removeEventListener("pointermove",onMove);canvas.removeEventListener("pointerup",onUp);canvas.removeEventListener("pointercancel",onUp);canvas.removeEventListener("wheel",onWheel);scene.traverse(o=>{o.geometry?.dispose?.();if(o.material){for(const material of Array.isArray(o.material)?o.material:[o.material]){material.map?.dispose?.();material.dispose?.();}}});backgroundQuad.geometry.dispose();backgroundTextures.portrait?.dispose();backgroundTextures.landscape?.dispose();backgroundMaterial.dispose();renderer.dispose();}};
}

export { WORLD_POSITIONS };
