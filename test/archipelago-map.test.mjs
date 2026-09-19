import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {makeModel,categories,matchesFilter,flightProgress,flightEta} from '../public/js/archipelago-model.mjs';
const require=createRequire(import.meta.url);
const system=(id,extra={})=>({id,name:'System '+id,x:1500+id*31,y:1500-id*12,planetCount:4,planetNames:['Welt I','Welt II'],owners:[],...extra});
test('systems are never drawn inside the visual black-hole core',()=>{
 const m=makeModel({self:{empireId:1},systems:[system(1,{galaxyId:0,x:1500,y:1500}),system(2,{galaxyId:0,x:1520,y:1490}),system(9,{galaxyId:0,x:2040,y:1500})]});
 const g=m.regions[0];
 for(const n of m.systems){
  const d=Math.hypot(n.x-g.x,n.y-g.y);
  assert.ok(d>=g.r*.22-1e-6,`system ${n.id} sits in the hole at ${d}`);
  assert.equal(n.source.x,[1500,1520,2040][[1,2,9].indexOf(n.id)]);
 }
});
test('display layout is stable under reorder and never mutates world coordinates',()=>{
 const a=system(1,{galaxyId:0}),b=system(2,{galaxyId:0}),data={self:{empireId:1},systems:[a,b],links:[{a:1,b:2}],flights:[]},original=JSON.stringify(data),before=makeModel(data);
 const after=makeModel({...data,systems:[system(3,{galaxyId:1}),{...b,owners:[{empireId:1,planets:1}]},a]});
 for(const id of[1,2])assert.deepEqual([before.byId.get(id).x,before.byId.get(id).y,before.byId.get(id).regionId],[after.byId.get(id).x,after.byId.get(id).y,after.byId.get(id).regionId]);
 assert.equal(JSON.stringify(data),original);assert.equal(before.byId.get(1).source,a);
 assert.equal(before.byId.get(1).regionId,0);
 assert.notEqual(before.byId.get(1).x,a.x);
});
test('filters support partially occupied systems, alliance, NPC roles and exact planet-name queries',()=>{
 const self={empireId:7,allianceId:9},mixed=system(1,{owners:[{empireId:7,planets:1},{empireId:8,allianceId:9,planets:1}]});
 assert.deepEqual(categories(mixed,self),{own:true,alliance:true,free:true,hostile:false,special:false,other:false});
 assert.ok(matchesFilter(mixed,self,{query:'welt ii',free:true}));assert.ok(!matchesFilter(mixed,self,{query:'unbekannt'}));assert.ok(!matchesFilter(mixed,self,{none:true}));
 for(const flag of [{pirate:3},{remnant:true},{warlord:'Boss'}]){const npc=system(2,flag);assert.ok(matchesFilter(npc,self,{hostile:true}));assert.ok(matchesFilter(npc,self,{special:true}));assert.ok(!matchesFilter(npc,self,{free:true}));}
 assert.ok(matchesFilter(system(3,{rift:true}),self,{special:true}));assert.ok(!matchesFilter(system(4,{planetCount:0}),self,{free:true}));
});
test('flight progress clamps arrival, formats seconds correctly, and does not reverse already reversed API endpoints',()=>{
 const f={id:1,originSystemId:2,targetSystemId:1,returning:true,departedAt:1000,arrivesAt:62000};
 assert.equal(flightProgress(f,0),0);assert.equal(flightProgress(f,31500),.5);assert.equal(flightProgress(f,90000),1);
 assert.equal(flightEta(f,1000),'1:01');assert.equal(flightEta(f,3000),'0:59');assert.equal(flightEta(f,62000),'Ankunft');
 const m=makeModel({systems:[system(1),system(2)],flights:[f,{...f,id:2,targetSystemId:99}]});assert.deepEqual(m.flights,[f]);
});
test('renderer model consumes the real authenticated galaxy response and current system permissions',async t=>{
 const express=require('express'),{openDb}=require('../src/db'),{ensurePlayer}=require('../src/seed'),{attachRoutes}=require('../src/routes');
 const db=openDb(':memory:');t.after(()=>db.close());ensurePlayer(db,'MapFixture','demo12345','Map Fixture','#88ddff');
 const app=express();app.use(express.json());attachRoutes(app,db);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const base=`http://127.0.0.1:${server.address().port}/api`,login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'MapFixture',password:'demo12345'})});assert.equal(login.status,200);const headers={cookie:login.headers.get('set-cookie')};
 const response=await fetch(base+'/galaxy',{headers});assert.equal(response.status,200);const payload=await response.json(),original=JSON.stringify(payload),m=makeModel(payload);
 assert.equal(m.systems.length,payload.systems.length);assert.equal(m.byId.size,payload.systems.length);assert.ok(m.byId.get(payload.self.homeSystemId).categories.own);
 const detail=await fetch(base+'/system/'+payload.self.homeSystemId,{headers}).then(r=>r.json());assert.ok(detail.planets.some(p=>p.id===payload.self.homePlanetId&&p.canManage));
 assert.equal(JSON.stringify(payload),original);assert.ok(m.links.length);assert.ok(m.regions.length>=1);
 assert.equal(m.byId.get(payload.self.homeSystemId).regionId,0);
 assert.ok(payload.systems.every(s=>Number.isFinite(s.galaxyId)));
 assert.ok(payload.regions?.length>=1);
});
