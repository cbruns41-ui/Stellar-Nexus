import{createMap as createRenderer}from'./archipelago-map.mjs?v=7';
export{systemHtml}from'./map.js';

// Galaxy view factory: region chips plus the archipelago renderer.
export function createMap(canvas,onSelect,onViewChange,options={}){
 const host=canvas.closest('.map-wrap')||canvas.parentElement;
 const cssUrl=new URL('../css/archipelago-map.css',import.meta.url).href;
 if(!document.querySelector('link[data-archipelago-style]')){const css=document.createElement('link');css.rel='stylesheet';css.href=cssUrl+(cssUrl.includes('?')?'&':'?')+'v=2';css.dataset.archipelagoStyle='';document.head.append(css);}
 host.classList.add('archipelago-map');const abort=new AbortController(),bar=document.createElement('div');bar.className='archipelago-regions';bar.setAttribute('aria-label','Galaxien auswählen');host.append(bar);
 let map;
 const drawRegions=regions=>{bar.replaceChildren();for(const g of [{id:'all',name:'Alle'},...regions]){const b=document.createElement('button');b.type='button';b.textContent=g.name;b.dataset.region=g.id;b.addEventListener('click',()=>{if(g.id==='all'){map.overview();onSelect?.(null);}else{map.focusRegion(g.id);onSelect?.(null);}},{signal:abort.signal});bar.append(b);}};
 map=createRenderer(canvas,onSelect,onViewChange,{...options,onRegions:regions=>{drawRegions(regions);options.onRegions?.(regions);},onRegionChange:g=>{for(const b of bar.children){const active=b.dataset.region===String(g?.id??'all');b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}options.onRegionChange?.(g);}});
 // Bind inside this map only. First button tap after a touch drag/pinch must commit once.
 const taps=new Map();let last=null;
 host.addEventListener('pointerdown',e=>{const b=e.target.closest('button');if(e.pointerType==='touch'&&b&&!b.disabled)taps.set(e.pointerId,{b,x:e.clientX,y:e.clientY});},{capture:true,signal:abort.signal});
 host.addEventListener('pointercancel',e=>taps.delete(e.pointerId),{signal:abort.signal});
 host.addEventListener('pointerup',e=>{const t=taps.get(e.pointerId);taps.delete(e.pointerId);if(!t||t.b.disabled||!t.b.contains(e.target)||Math.hypot(e.clientX-t.x,e.clientY-t.y)>10)return;e.preventDefault();last={b:t.b,at:performance.now()};t.b.click();},{capture:true,signal:abort.signal});
 host.addEventListener('click',e=>{if(e.isTrusted&&e.detail>0&&last&&performance.now()-last.at<700&&last.b.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,signal:abort.signal});
 const destroy=map.destroy;map.destroy=()=>{destroy();abort.abort();bar.remove();host.classList.remove('archipelago-map');};return map;
}
