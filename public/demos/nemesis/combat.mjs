// Shared deterministic simulation: standalone demo and server-verified alliance encounters.
export const RAID_HP=100000, ROUND_SECONDS=40, BODY_X=.76, BODY_Y=.90;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Centers in the body sprite's 620 x 465 local drawing coordinates.
export const CORE_LAYOUT=[{x:-267,y:-82,r:43},{x:235,y:-42,r:60}];
export function createCombat(){return {mode:'intro',time:0,left:ROUND_SECONDS,hp:RAID_HP,maxHp:RAID_HP,attempt:0,shield:100,damage:0,hits:0,misses:0,combo:0,comboTime:0,armor:[100,100],broken:0,phase:1,playerX:420,playerY:1130,velocity:0,dodgeLeft:0,dodgeCooldown:0,dodgeDirection:1,shotCooldown:0,recoil:0,hurt:0,attackClock:1.2,attack:null,attackIndex:0,attacksAvoided:0,events:[],aim:{x:660,y:555},viewRatio:1};}
export function raidSnapshot(s){return {version:2,hp:s.hp,armor:[...s.armor],attempt:s.attempt};}
export function restoreRaid(s,raid){
 if(!raid||raid.version!==2||!Number.isFinite(raid.hp)||raid.hp<0||raid.hp>RAID_HP||!Number.isSafeInteger(raid.attempt)||raid.attempt<0||!Array.isArray(raid.armor)||raid.armor.length!==2||!raid.armor.every(v=>Number.isFinite(v)&&v>=0&&v<=100))return false;
 s.hp=raid.hp;s.armor=[...raid.armor];s.attempt=raid.attempt;s.broken=s.armor.filter(v=>v===0).length;s.phase=1+s.broken;return true;
}
export function startCombat(s,{resetBoss=false}={}){
 const viewRatio=s.viewRatio||1,raid=resetBoss?null:raidSnapshot(s),config=s.config;
 if(!resetBoss&&s.hp<=0)return false;
 Object.assign(s,createCombat(),{mode:'playing',viewRatio});
 if(config)configureCombat(s,config);
 if(raid){s.hp=raid.hp;s.armor=raid.armor;s.attempt=raid.attempt;s.broken=s.armor.filter(v=>v===0).length;s.phase=1+s.broken;}s.attempt++;return true;
}
export function configureCombat(s,config){s.config=config;s.hp=config.hp;s.maxHp=config.maxHp;s.shield=config.playerHp;s.armor=[...config.armor];s.broken=s.armor.filter(v=>v<=0).length;s.phase=1+s.broken;}
export function bossPose(s){
 const speed=(s.phase===3?2.1:1.4)*(s.config?.speed||1),a=s.attack,charge=a&&!a.done?Math.sin(clamp(a.t/a.windup,0,1)*Math.PI*.5):0;
 return {x:500+Math.sin(s.time*speed)*140+Math.sin(s.time*2.5)*18,y:550+Math.sin(s.time*2.7)*15+s.recoil*10-charge*14,rotation:Math.sin(s.time*speed)*.075-s.recoil*.035+charge*(a?.kind===1?-.1:.08),scale:.70+Math.sin(s.time*.8)*.02,step:s.time*(s.phase===3?5.5:4)};
}
export function localPoint(s,x,y){const p=bossPose(s),c=Math.cos(p.rotation),d=Math.sin(p.rotation);return{x:p.x+(x*c-y*d)*p.scale,y:p.y+(x*d+y*c)*p.scale/(s.viewRatio||1)};}
export function bodyPoint(s,x,y){return localPoint(s,x*BODY_X,y*BODY_Y);}
export function toBodyLocal(s,point){const p=bossPose(s),dx=(point.x-p.x)/p.scale,dy=(point.y-p.y)*(s.viewRatio||1)/p.scale,c=Math.cos(p.rotation),d=Math.sin(p.rotation);return {x:(dx*c+dy*d)/BODY_X,y:(-dx*d+dy*c)/BODY_Y};}
export function weakpoints(s){const p=bossPose(s);return CORE_LAYOUT.map((c,i)=>({...bodyPoint(s,c.x,c.y),r:c.r*p.scale*BODY_X,index:i,open:s.armor[i]<=0}));}
export function targetAt(s,point=s.aim){const local=toBodyLocal(s,point);return CORE_LAYOUT.findIndex(c=>Math.hypot(local.x-c.x,local.y-c.y)<c.r);}
export function dodge(s,direction=0){if(s.mode!=='playing'||s.dodgeCooldown>0)return false;s.dodgeLeft=.38;s.dodgeCooldown=2;s.dodgeDirection=direction||(s.playerX>500?-1:1);s.events.push({type:'dodge',x:s.playerX,y:s.playerY});return true;}
export function fire(s,aim=s.aim){
 if(s.mode!=='playing'||s.shotCooldown>0)return false;s.shotCooldown=.095;
 const target=targetAt(s,aim),local=toBodyLocal(s,aim),bodyHit=(local.x**2/265**2+local.y**2/220**2<1);
 const critical=target>=0&&s.armor[target]<=0;const hit=target>=0||bodyHit;
 s.events.push({type:'shot',from:{x:s.playerX,y:s.playerY-168/(s.viewRatio||1)},to:{...aim},hit,critical});
 if(!hit){s.misses++;s.combo=0;return false;}
 s.hits++;s.combo=Math.min(40,s.combo+1);s.comboTime=1.3;s.recoil=critical?1:.4;
 const amount=Math.min(s.hp,Math.max(1,Math.round((critical?24:target>=0?5:3)*(s.config?.damageScale||1))));s.hp-=amount;s.damage+=amount;
 s.events.push({type:'hit',x:aim.x,y:aim.y,critical,amount});
 if(target>=0&&s.armor[target]>0){s.armor[target]=Math.max(0,s.armor[target]-9);if(!s.armor[target]){s.broken++;s.phase=1+s.broken;s.events.push({type:'break',...weakpoints(s)[target],index:target});}}
 if(s.hp<=0){s.mode='won';s.attack=null;s.events.push({type:'victory',...bossPose(s)});}return true;
}
export function stepCombat(s,dt,input={}){
 if(s.mode!=='playing')return;dt=clamp(dt,0,.05);s.time+=dt;s.left=Math.max(0,ROUND_SECONDS-s.time);
 s.shotCooldown=Math.max(0,s.shotCooldown-dt);s.dodgeCooldown=Math.max(0,s.dodgeCooldown-dt);s.dodgeLeft=Math.max(0,s.dodgeLeft-dt);s.hurt=Math.max(0,s.hurt-dt*3);s.recoil=Math.max(0,s.recoil-dt*6);s.comboTime-=dt;if(s.comboTime<=0)s.combo=0;
 const move=clamp(input.move||0,-1,1),desired=s.dodgeLeft>0?s.dodgeDirection*1100:move*320;s.velocity+=(desired-s.velocity)*Math.min(1,dt*13);s.playerX=clamp(s.playerX+s.velocity*dt,150,850);
 if(s.left<=0){s.mode='retreated';s.attack=null;s.events.push({type:'retreat'});return;}
 if(input.fire)fire(s);if(s.mode!=='playing')return;
 s.attackClock-=dt;
 if(!s.attack&&s.attackClock<=0){const kind=s.attackIndex++%3;s.attack={kind,x:kind===1?(s.playerX<500?330:670):s.playerX,width:kind===1?330:s.phase===3?230:200,t:0,windup:s.phase===3?.7:1,done:false};s.events.push({type:'warning',kind});}
 if(s.attack){const a=s.attack;a.t+=dt;
  if(a.t>=a.windup&&!a.done){a.done=true;const inDanger=Math.abs(s.playerX-a.x)<a.width*.5+45;
   if(inDanger&&s.dodgeLeft<=0){s.shield=Math.max(0,s.shield-Math.round([30,36,44][a.kind]*(s.config?.enemyDamage||1)));s.hurt=1;s.events.push({type:'hurt',x:s.playerX,y:s.playerY});}
   else{s.attacksAvoided++;s.events.push({type:'avoided'});}s.events.push({type:'impact',x:a.x,y:s.playerY,kind:a.kind});
  }if(a.t>a.windup+.4){s.attack=null;s.attackClock=s.phase===3?.4:.65;}
 }
 if(s.shield<=0){s.mode='lost';s.attack=null;s.events.push({type:'defeat'});}
}
