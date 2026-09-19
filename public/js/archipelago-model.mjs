// Presentation only. Never changes authoritative coordinates, ownership or travel times.
export const REGIONS = [
  {id:0,name:'AURELIA',x:-620,y:60,r:650,color:'#83dafa'},
  {id:1,name:'VESPER',x:620,y:-470,r:475,color:'#ceaeff'},
  {id:2,name:'SOLARA',x:750,y:650,r:500,color:'#efd199'},
  {id:3,name:'ELYRA',x:-1900,y:-640,r:560,color:'#acd6ff'},
  {id:4,name:'NOCTIS',x:-1900,y:780,r:550,color:'#c9b5f5'},
  {id:5,name:'CAELIS',x:-450,y:-1410,r:550,color:'#efc298'}];
export const MISSION_COLORS={attack:'#ff758c',spy:'#c4a0ff',transport:'#8bdec1',deploy:'#8bdec1',colonize:'#f4d47e',ally_colonize:'#f4d47e',expedition:'#81c7ff',salvage:'#ffbb85',intercept:'#ff9b79'};
export function categories(s,self={}) {
  const owners=s.owners||[],occupied=owners.reduce((n,o)=>n+(Number(o.planets)||0),0),hostile=!!(s.remnant||s.pirate||s.warlord);
  return {own:owners.some(o=>o.empireId===self.empireId),alliance:!!self.allianceId&&owners.some(o=>o.allianceId===self.allianceId&&o.empireId!==self.empireId),hostile,
    free:!hostile&&(Number.isFinite(s.planetCount)?occupied<s.planetCount:!owners.length),special:!!(s.isHub||s.rift||hostile),other:owners.some(o=>o.empireId!==self.empireId&&(!self.allianceId||o.allianceId!==self.allianceId))};
}
export function matchesFilter(s,self,filter={}) {
  const query=String(filter.query||'').trim().toLocaleLowerCase('de');
  if(query&&![s.name,...(s.planetNames||[])].some(n=>String(n).toLocaleLowerCase('de').includes(query)))return false;
  const c=categories(s,self),checked=Object.keys(c).filter(k=>filter[k]);
  return !filter.none&&(!checked.length||checked.some(k=>c[k]));
}
const LAYOUT_ORIGIN={x:1500,y:1500},LAYOUT_RADIUS=2100,CORE_KEEP_OUT=.28;
function regionIdOf(s,display){
  if(Number.isFinite(display?.regionId))return display.regionId;
  if(Number.isFinite(Number(s.galaxyId)))return Number(s.galaxyId);
  if(Number.isFinite(Number(s.galaxy_id)))return Number(s.galaxy_id);
  return 0;
}
function pushOutOfCore(dx,dy,id){
  const dist=Math.hypot(dx,dy),minR=CORE_KEEP_OUT*LAYOUT_RADIUS;
  if(dist>=minR)return{dx,dy};
  const ang=dist<1e-6?((Number(id)||0)*2.399963229728653)%(Math.PI*2):Math.atan2(dy,dx);
  const mapped=minR+(LAYOUT_RADIUS-minR)*(dist/LAYOUT_RADIUS);
  return{dx:Math.cos(ang)*mapped,dy:Math.sin(ang)*mapped};
}
function displayOf(s,region,display){
  if(Number.isFinite(display?.x)&&Number.isFinite(display?.y))return{x:display.x,y:display.y};
  const scale=region.r/LAYOUT_RADIUS,pushed=pushOutOfCore(s.x-LAYOUT_ORIGIN.x,s.y-LAYOUT_ORIGIN.y,s.id);
  return{x:region.x+pushed.dx*scale,y:region.y+pushed.dy*scale};
}
export function makeModel(payload={}) {
  const self=payload.self||{},regions=new Map(),byId=new Map(),systems=[];
  const catalog=payload.regions||REGIONS;
  for(const s of payload.systems||[]) {
    if(!Number.isFinite(Number(s.id))||!Number.isFinite(s.x)||!Number.isFinite(s.y)||byId.has(s.id))continue;
    // Explicit display coordinates are optional preview/layout metadata, never DB coordinates.
    const display=payload.layout?.[s.id],id=regionIdOf(s,display);
    const region=catalog.find(g=>g.id===id)||REGIONS[id]||REGIONS[0];
    const pos=displayOf(s,region,display);
    const node={source:s,id:s.id,name:s.name,regionId:region.id,x:pos.x,y:pos.y,categories:categories(s,self)};
    regions.set(region.id,region);byId.set(s.id,node);systems.push(node);
  }
  const links=(payload.links||[]).filter(l=>byId.has(l.a)&&byId.has(l.b));
  const flights=(payload.flights||[]).filter(f=>byId.has(f.originSystemId)&&byId.has(f.targetSystemId)&&Number.isFinite(f.departedAt)&&Number.isFinite(f.arrivesAt));
  return{source:payload,self,systems,byId,regions:[...regions.values()].sort((a,b)=>a.id-b.id),links,flights};
}
export function flightProgress(f,now){return Math.max(0,Math.min(1,(now-f.departedAt)/Math.max(1,f.arrivesAt-f.departedAt)));}
export function flightEta(f,now){const sec=Math.max(0,Math.ceil((f.arrivesAt-now)/1000));if(!sec)return'Ankunft';const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=String(sec%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${s}`:`${m}:${s}`;}
