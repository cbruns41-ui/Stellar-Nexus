export const GALAXIES=[
 {id:0,name:'AURELIA',subtitle:'Die Heimatreiche',x:-620,y:60,r:650,hue:0,color:'#83dafa'},
 {id:1,name:'VESPER',subtitle:'Der violette Schleier',x:620,y:-470,r:475,hue:48,color:'#ceaeff'},
 {id:2,name:'SOLARA',subtitle:'Die goldene Grenze',x:750,y:650,r:500,hue:185,color:'#efd199'},
 {id:3,name:'ELYRA',subtitle:'Jenseits der bekannten Wege',x:-1900,y:-640,r:560,hue:320,color:'#acd6ff'},
 {id:4,name:'NOCTIS',subtitle:'Die stillen Tiefen',x:-1900,y:780,r:550,hue:65,color:'#c9b5f5'},
 {id:5,name:'CAELIS',subtitle:'Ein neuer Horizont',x:-450,y:-1410,r:550,hue:170,color:'#efc298'}];
export const STATUS={own:{label:'Eigen',color:'#8fe6ff'},ally:{label:'Allianz',color:'#8de0ba'},other:{label:'Andere Spieler',color:'#b6bacb'},free:{label:'Frei',color:'#e5d6b1'},pirate:{label:'Piraten',color:'#ff9b79'}};
export const TYPES=[['terran','Terranisch'],['ice','Eiswelt'],['desert','Wüstenwelt'],['lava','Vulkanwelt']];
export function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const names=['Helio','Nyx','Astra','Vela','Orion','Kepler','Lyra','Rhea','Voss','Kael','Pyre','Lumen','Umbra','Cinder','Nadir','Rune','Echo','Crown','Solace','Thal'];
const suffix=['Reach','Gate','Deep','Rim','Spire','Drift','Hollow','Fold','Veil','Crest'];
export function createWorld(count=3){
 const galaxies=GALAXIES.slice(0,count),systems=[];
 for(const g of galaxies){const random=rng(9091+g.id*177),placed=[];
  for(let i=0;i<800;i++){
   let x,y,r,a,attempt=0;
   do{r=g.r*(.17+.71*Math.sqrt(random()));a=i%4*Math.PI/2+Math.log(r/g.r)*2.8+(random()-.5)*.9;x=g.x+Math.cos(a)*r;y=g.y+Math.sin(a)*r;attempt++;}while(attempt<70&&placed.some(p=>(p.x-x)**2+(p.y-y)**2<11**2));
   const id=g.id*800+i,name=g.id===0&&i<4?['Neme','Kael Fold','Kepler Crest','Pyre Hollow'][i]:`${names[i%20]} ${suffix[Math.floor(i/20)%10]} ${g.id+1}-${Math.floor(i/200)+1}`;
   const category=i<5?'own':i%20<3?'pirate':i%9===0?'ally':i%3===0?'other':'free';
   const planets=Array.from({length:2+i%5},(_,j)=>({id:id*10+j,name:`${name} ${['I','II','III','IV','V','VI'][j]}`,roman:['I','II','III','IV','V','VI'][j],type:TYPES[(i+j)%4],status:category==='own'&&g.id>0?'ally':category,level:category==='pirate'?1+(i%35):0}));
   const s={id,name,galaxy:g.id,x,y,planets,gate:i===4,priority:i<5||i%45===0,seed:random()};systems.push(s);placed.push(s);
  }
 }
 return{galaxies,systems,planets:systems.reduce((n,s)=>n+s.planets.length,0)};
}
