import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

export async function verifyMobileInputs({base,headers,databasePath,send,evaluate,until,pause,shot}) {
  let touchId=1;
  const database=fn=>{const db=new DatabaseSync(databasePath);try{db.exec('PRAGMA busy_timeout=5000');return fn(db);}finally{db.close();}};
  const tap=async selector=>{
    await until(`document.querySelector(${JSON.stringify(selector)})`);
    const point=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()`);
    assert.ok(point.hit,`First touch reaches ${selector}`);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:touchId++}]});await pause(80);
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  const size=async(width,height)=>{await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await pause(180);};
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  if(!process.argv.includes('--boss-inputs-only')) {
  const ids=await evaluate(`[...document.querySelectorAll('[data-colony-focus]')].map(el=>el.dataset.colonyFocus)`);
  assert.equal(ids.length,22);
  for(const [width,height] of [[320,568],[390,844]]){
    await size(width,height);
    for(const id of ids){
      await tap('.colony-directory summary');
      const geometry=await evaluate(`(()=>{const b=document.querySelector('[data-colony-focus="${id}"]'),r=b.getBoundingClientRect(),s=b.querySelector('span').getBoundingClientRect();return {width:r.width,height:r.height,nameWidth:s.width,font:parseFloat(getComputedStyle(b).fontSize),nameInside:s.left>=r.left&&s.right<=r.right&&s.top>=r.top&&s.bottom<=r.bottom};})()`);
      assert.ok(geometry.width>=230&&geometry.height>=44&&geometry.nameWidth>140&&geometry.font>=14&&geometry.nameInside,JSON.stringify({id,width,...geometry}));
      if(id===ids[0])await shot(`mobile-directory-${width}`);
      await tap(`[data-colony-focus="${id}"]`);
      await until(`!document.querySelector('.colony-directory').open && !document.querySelector('#city-actions').hidden && !!document.querySelector('[data-colony-info="${id}"]')`,5000);
      await tap('.colony-card-close');
    }
  }
  console.log('Mobile: all 22 building names readable and first-touch selectable at 320 and 390px');

  const {home,target}=database(db=>{
    const home=db.prepare("SELECT p.* FROM planets p JOIN empires e ON e.id=p.empire_id JOIN users u ON u.id=e.user_id WHERE u.username='Admin' ORDER BY p.id LIMIT 1").get();
    const free=db.prepare('SELECT * FROM planets WHERE empire_id IS NULL LIMIT 6').all();
    for(const p of [home,...free]){
      db.prepare('UPDATE planets SET empire_id=?,system_id=?,helium=10000,metal=10000 WHERE id=?').run(home.empire_id,home.system_id,p.id);
      for(const [ship,n] of [['fighter',8],['probe',1],['frigate',1]])db.prepare('INSERT INTO ships VALUES(?,?,?) ON CONFLICT(planet_id,ship_id) DO UPDATE SET count=excluded.count').run(p.id,ship,n);
    }
    db.exec('DELETE FROM raids;DELETE FROM raid_engagements');db.prepare('UPDATE empires SET last_raid=? WHERE id=?').run(Date.now(),home.empire_id);
    db.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind,expires_at,level) VALUES(?,'{\"fighter\":1}',?,'pirates',?,1)").run(free[0].id,Date.now()-60000,Date.now()+7200000);
    return {home,target:free[0]};
  });
  // Load the fleet fixture once; all subsequent selections and combat run without reload.
  await send('Page.reload');await until(`document.querySelector('#planet-select')?.options.length===7`);
  await tap('#tabbar [data-tab="map"]');await until(`document.querySelector('[data-alert-defend]')`);
  for(const [width,height] of [[320,568],[390,844],[844,390]]){
    await size(width,height);await tap('[data-alert-defend]');await until(`document.querySelector('#group-launch')`);
    const bounds=()=>evaluate(`(()=>{const b=document.querySelector('#group-launch'),r=b.getBoundingClientRect(),f=document.querySelector('.group-footer').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),footer:f.toJSON()};})()`);
    const before=await bounds();assert.ok(before.hit&&before.top>=0&&before.bottom<=height&&before.height>=44,JSON.stringify(before));
    await evaluate(`document.querySelector('.group-body').scrollTop=100000`);
    const after=await bounds();assert.equal(after.top,before.top);assert.ok(after.hit);
    await shot(`mobile-raid-${width}`);await tap('#m-cancel');
  }
  await size(390,844);await tap('[data-alert-defend]');await until(`document.querySelector('#group-launch')`);
  await tap(`[data-group-max="${home.id}"]`);
  await evaluate(`{const e=document.querySelector('[data-group-origin="${home.id}"] [data-group-ship="fighter"]');e.value=99999;e.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await tap('#group-launch');await until(`!document.querySelector('#group-error').hidden`,8000);
  assert.match(await evaluate(`document.querySelector('#group-error').textContent`),/Schiffsauswahl/);
  assert.equal(database(db=>db.prepare('SELECT COUNT(*) AS n FROM raid_engagements').get().n),0);
  await tap(`[data-group-max="${home.id}"]`);
  await evaluate(`window.__mobileLaunch=document.querySelector('#group-launch')`);await pause(1200);
  assert.ok(await evaluate(`window.__mobileLaunch===document.querySelector('#group-launch')`));
  await tap('#group-launch');await until(`!document.querySelector('#group-launch')`,8000);
  assert.equal(database(db=>db.prepare('SELECT COUNT(*) AS n FROM raid_engagements').get().n),1);
  database(db=>db.exec('UPDATE raids SET arrives_at=1;UPDATE fleets SET arrives_at=1'));
  await evaluate(`window.__mobileNow=Date.now;Date.now=()=>window.__mobileNow()+86400000`);
  await until(`!document.querySelector('[data-alert-defend]')`,15000);await evaluate(`Date.now=window.__mobileNow`);
  assert.ok(database(db=>db.prepare("SELECT id FROM reports WHERE kind='combat' AND json_extract(body,'$.raid')=1 AND json_extract(body,'$.planetId')=?").get(target.id)));
  console.log('Mobile: seven-colony raid footer stays visible; invalid selection shows an inline error; retry commits defense and creates a report');
  }

  const created=await fetch(base+'/api/alliances',{method:'POST',headers,body:JSON.stringify({tag:'AIM',name:'Mobile Aim',color:'#00ffff'})});
  assert.ok(created.ok);const alliance=(await created.json()).alliance;
  const bossEvaluate=expression=>evaluate(`document.querySelector('#nemesis-encounter iframe').contentWindow.eval(${JSON.stringify(expression)})`);
  const bossUntil=async expression=>{const start=Date.now();while(Date.now()-start<15000){if(await bossEvaluate(expression))return;await pause(100);}throw Error('Boss condition: '+expression);};
  const bossTap=async selector=>{
    const point=await bossEvaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()`);
    assert.ok(point.hit,'Boss button hit: '+selector);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:touchId++,x:point.x,y:point.y}]});await pause(80);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  for(const [width,height] of [[844,390],[390,844]]){
    await size(width,height);
    await evaluate(`import('/js/alliance-boss-game.js').then(m=>m.startAllianceBossEncounter({detail:{id:${alliance.id}}}))`);
    await until(`document.querySelector('#nemesis-encounter iframe')?.contentWindow.nemesisDemo?.snapshot().ready`);
    await bossUntil(`window.nemesisDemo?.snapshot().ready && !document.querySelector('#start').disabled`);
    await send('Page.bringToFront');
    await send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await bossTap('#start');await bossUntil(`nemesisDemo.snapshot().mode==='playing'`);
    await bossEvaluate(`window.__bossEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(type,e=>window.__bossEvents.push({type,id:e.pointerId,target:e.target.id,x:e.clientX,y:e.clientY}),true);`);
    const snapshot=()=>bossEvaluate('nemesisDemo.snapshot()');
    const geometry=await bossEvaluate(`(()=>{const r=document.querySelector('#stage').getBoundingClientRect(),f=document.querySelector('#fire').getBoundingClientRect(),s=document.querySelector('#stick').getBoundingClientRect();return {r:r.toJSON(),hit:document.elementFromPoint(f.x+f.width/2,f.y+f.height/2)?.outerHTML.slice(0,180),fire:{x:f.x+f.width/2,y:f.y+f.height/2,id:7},stick:{x:s.x+s.width/2,y:s.y+s.height/2,id:8}};})()`);
    const initial=await snapshot();let finger={...geometry.fire};
    finger.id=touchId++;geometry.stick.id=touchId++;geometry.fire.id=touchId++;
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});await pause(70);
    assert.deepEqual((await snapshot()).aim,initial.aim,'Pressing fire does not teleport the reticle to the thumb');
    finger.x-=20;finger.y-=25;
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[finger]});await pause(70);
    const moved=await snapshot();await shot(`mobile-boss-drag-${width}`);assert.ok(moved.aim.x<initial.aim.x&&moved.aim.y<initial.aim.y&&moved.firing,JSON.stringify({width,initial,moved,geometry,events:await bossEvaluate('window.__bossEvents'),viewport:await bossEvaluate('({width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale,x:visualViewport.offsetLeft,y:visualViewport.offsetTop})')}));
    // Follow the actual visible target using only the thumb dragging the fire pad.
    const hits=moved.hits;
    for(let i=0;i<12;i++){
      const current=await snapshot(),goal=current.weakpoints[0];
      finger.x+=(goal.x-current.aim.x)*geometry.r.width/1000/1.6;
      finger.y+=(goal.y-current.aim.y)*geometry.r.height/1500/1.6;
      await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[finger]});await pause(65);
    }
    assert.ok((await snapshot()).hits>=hits+4,'Fire-pad aiming produces real boss hits');
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger,geometry.stick]});
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[finger,{...geometry.stick,x:geometry.stick.x+20}]});await pause(160);
    const dual=await snapshot();assert.ok(dual.firing&&dual.moving>0,'Both thumbs work independently');
    await shot(`mobile-boss-aim-${width}`);
    await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await pause(80);
    const stopped=await snapshot();assert.equal(stopped.firing,false);assert.equal(stopped.moving,0);
    const aim=stopped.aim;
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[geometry.fire]});await pause(70);
    assert.deepEqual((await snapshot()).aim,aim,'Re-gripping keeps the last aim');
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await bossTap('#exit-live');await until(`!document.querySelector('#nemesis-encounter')`,15000);
  }
  assert.equal(database(db=>db.prepare('SELECT COUNT(*) AS n FROM alliance_boss_hits').get().n),2,'Both mobile input replays accepted by the live server');
  console.log('Mobile: portrait and landscape fire-pad aiming, real hits, two-thumb input, cancellation and server-validated boss contributions passed');
}
