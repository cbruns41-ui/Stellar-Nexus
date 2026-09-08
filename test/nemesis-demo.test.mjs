import test from 'node:test';
import assert from 'node:assert/strict';
import {createCombat,startCombat,stepCombat,fire,weakpoints,dodge,bossPose,bodyPoint,targetAt,raidSnapshot,restoreRaid,RAID_HP,CORE_LAYOUT} from '../public/demos/nemesis/combat.mjs';
function shot(s,index){for(let n=0;n<3;n++)stepCombat(s,.04);return fire(s,weakpoints(s)[index]);}
test('Nemesis: misses do not damage armor; breaking both plates exposes higher damage and phases',()=>{
 const s=createCombat();startCombat(s);assert.equal(fire(s,{x:0,y:0}),false);assert.equal(s.hp,s.maxHp);assert.deepEqual(s.armor,[100,100]);assert.equal(s.misses,1);
 for(let n=0;n<12;n++)assert.equal(shot(s,1),true);assert.equal(s.phase,2);assert.deepEqual(s.armor,[100,0]);assert.equal(s.events.filter(e=>e.type==='break').length,1);
 let before=s.hp;shot(s,1);assert.equal(before-s.hp,24);
 for(let n=0;n<12;n++)shot(s,0);assert.equal(s.phase,3);assert.deepEqual(s.armor,[0,0]);assert.equal(s.events.filter(e=>e.type==='break').length,2);
});
test('Nemesis: warning attacks hit once, leaving the marked lane or dodging avoids damage',()=>{
 for(const method of ['stay','move','dodge']){const s=createCombat();startCombat(s);s.attack={kind:0,x:420,width:180,t:0,windup:.5,done:false};
  for(let i=0;i<11;i++){if(method==='dodge'&&i===8)dodge(s);stepCombat(s,.05,{move:method==='move'?1:0});}
  assert.equal(s.shield,method==='stay'?70:100,method);const hp=s.shield;for(let i=0;i<5;i++)stepCombat(s,.05);assert.equal(s.shield,hp,'Single impact only');
 }
});
test('Nemesis: rate limit, dodge cooldown, victory and restart preserve local round boundaries',()=>{
 const s=createCombat();startCombat(s);fire(s,weakpoints(s)[0]);const hp=s.hp;assert.equal(fire(s,weakpoints(s)[0]),false);assert.equal(s.hp,hp);assert.equal(dodge(s),true);assert.equal(dodge(s),false);
 s.hp=1;stepCombat(s,.05);stepCombat(s,.05);fire(s,weakpoints(s)[1]);assert.equal(s.mode,'won');const time=s.time;stepCombat(s,.05,{fire:true});assert.equal(s.time,time);
 assert.equal(startCombat(s),false,'A destroyed raid requires an explicit reset');startCombat(s,{resetBoss:true});assert.equal(s.mode,'playing');assert.equal(s.hp,s.maxHp);assert.equal(s.shield,100);assert.deepEqual(s.armor,[100,100]);assert.equal(s.events.length,0);assert.equal(s.hits,0);
});
test('Nemesis: smaller slender targets match their rotated visual on portrait and landscape screens',()=>{
 for(const ratio of [.8,1,1.5]){const s=createCombat();s.viewRatio=ratio;startCombat(s);s.time=1.4;assert.ok(bossPose(s).scale<.73);assert.ok(weakpoints(s)[1].r<34);
  const {x,y}=CORE_LAYOUT[1];assert.equal(targetAt(s,bodyPoint(s,x+59,y)),1);assert.equal(targetAt(s,bodyPoint(s,x+61,y)),-1);
  assert.equal(targetAt(s,bodyPoint(s,x,y+59)),1);assert.equal(targetAt(s,bodyPoint(s,x,y+61)),-1);
  fire(s,bodyPoint(s,400,0));assert.equal(s.hp,RAID_HP,'Old outer body silhouette is no longer hittable');
 }
});
test('Nemesis: an inactive player falls quickly; wounds and armor persist into the next pilot',()=>{
 const s=createCombat();startCombat(s);for(let i=0;i<12;i++)shot(s,1);const hp=s.hp,armor=[...s.armor];
 while(s.mode==='playing')stepCombat(s,.05);assert.equal(s.mode,'lost');assert.ok(s.time<8.5);
 startCombat(s);assert.equal(s.hp,hp);assert.deepEqual(s.armor,armor);assert.equal(s.attempt,2);assert.equal(s.shield,100);assert.equal(s.damage,0);
 const restored=createCombat();assert.equal(restoreRaid(restored,JSON.parse(JSON.stringify(raidSnapshot(s)))),true);assert.equal(restored.hp,hp);assert.deepEqual(restored.armor,armor);assert.equal(restoreRaid(restored,{version:2,hp:-1,armor:[0,0],attempt:1}),false);
});
test('Nemesis: even perfect uninterrupted reactor fire needs many successive attacks',()=>{
 const s=createCombat();let damage=0,firstHp;
 for(let attempt=0;attempt<20&&s.hp>0;attempt++){
  const remaining=s.hp;startCombat(s);assert.equal(s.hp,remaining,'Starting an attack never heals the raid');
  while(s.mode==='playing'){s.shield=100; // Upper bound: ignore incoming damage and aim perfectly.
   s.aim=weakpoints(s)[1];stepCombat(s,.02,{fire:true});s.events.length=0;
  }
  damage+=s.damage;if(attempt===0){firstHp=s.hp;assert.ok(firstHp>RAID_HP*.89);assert.equal(s.mode,'retreated');}
 }
 assert.equal(s.mode,'won');assert.ok(s.attempt>=10&&s.attempt<=16);assert.equal(damage,RAID_HP,'Contributions equal actual lost hull, including the finishing hit');
});
