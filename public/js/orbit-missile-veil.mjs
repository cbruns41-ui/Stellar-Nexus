import * as T from "/vendor/three.module.min.js";

// Cosmetic only: emissions and fading follow simulation time, including pause.
export function createMissileVeil(scene){
  const capacity=320,geometry=new T.PlaneGeometry(1,1);
  const phases=new T.InstancedBufferAttribute(new Float32Array(capacity*2),2).setUsage(T.DynamicDrawUsage);
  const tints=new T.InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('phaseSeed',phases);geometry.setAttribute('veilTint',tints);
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
    vertexShader:`attribute vec2 phaseSeed;attribute vec3 veilTint;varying vec2 vUv;varying vec2 state;varying vec3 tint;
      void main(){vUv=uv;state=phaseSeed;tint=veilTint;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;varying vec2 state;varying vec3 tint;
      void main(){vec2 q=vUv*2.-1.;float age=state.x,s=state.y;
        q.x+=sin(q.y*5.+s+age*2.)*.14;
        float curl=.58+.2*sin(q.x*7.+q.y*4.+s)+.12*sin(q.y*13.-q.x*6.+s*2.);
        float edge=1.-smoothstep(.18,1.,length(q));
        float alpha=edge*curl*smoothstep(0.,.10,age)*pow(1.-age,1.35)*.32;
        gl_FragColor=vec4(tint*(.72+curl*.28),alpha);
        #include <colorspace_fragment>
      }`});
  const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);
  const emitters=new WeakMap(),puffs=[],dummy=new T.Object3D();let cursor=0,seed=8191,lastTime=-1,peak=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function update(game){
    if(game.time!==lastTime){
      for(const [list,friendly] of [[game.rockets,false],[game.interceptors,true]])for(const rocket of list){
        let emitter=emitters.get(rocket);
        if(!emitter){emitter={next:game.time,x:rocket.x,y:rocket.y};emitters.set(rocket,emitter);}
        let count=0;
        while(emitter.next<=game.time&&count++<4){
          const speed=Math.hypot(rocket.vx,rocket.vy)||1,ux=rocket.vx/speed,uy=rocket.vy/speed;
          const fraction=count/4,x=emitter.x+(rocket.x-emitter.x)*fraction-ux*14,y=emitter.y+(rocket.y-emitter.y)*fraction-uy*14;
          puffs[cursor]={x,y,born:game.time,life:friendly?1.15:1.45,size:7+random()*5,
            vx:-ux*8+(random()-.5)*10,vy:-uy*8+(random()-.5)*10,rotation:random()*6.28,seed:random()*20,friendly};
          cursor=(cursor+1)%capacity;emitter.next+=.045;
        }
        if(emitter.next<=game.time)emitter.next=game.time+.045;
        emitter.x=rocket.x;emitter.y=rocket.y;
      }
      lastTime=game.time;
    }
    let n=0;
    for(const p of puffs){if(!p)continue;const elapsed=game.time-p.born,age=elapsed/p.life;if(age<0||age>=1)continue;
      const size=p.size+age*34;
      dummy.position.set(p.x+p.vx*elapsed,-p.y-p.vy*elapsed,13);dummy.rotation.set(0,0,p.rotation+age*.3);dummy.scale.set(size,size*.8,1);dummy.updateMatrix();mesh.setMatrixAt(n,dummy.matrix);
      phases.setXY(n,age,p.seed);tints.setXYZ(n,p.friendly?.38:.52,p.friendly?.57:.43,p.friendly?.68:.34);n++;
    }
    mesh.count=n;peak=Math.max(peak,n);mesh.instanceMatrix.needsUpdate=true;phases.needsUpdate=true;tints.needsUpdate=true;
  }
  return {update,audit:()=>({active:mesh.count,peak,capacity}),dispose(){scene.remove(mesh);geometry.dispose();material.dispose();mesh.dispose();}};
}
