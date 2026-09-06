import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

export async function verifyNavigation({base,databasePath,send,evaluate,until,pause}) {
  const db=new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA busy_timeout=5000");
    const planet=db.prepare("SELECT p.id FROM planets p JOIN empires e ON e.id=p.empire_id JOIN users u ON u.id=e.user_id WHERE u.username='Admin' ORDER BY p.id LIMIT 1").get();
    for(const id of ['archive','quantum_lab']) db.prepare("INSERT INTO buildings VALUES(?,?,1) ON CONFLICT(planet_id,building_id) DO UPDATE SET level=1").run(planet.id,id);
  } finally {db.close();}
  await send('Page.reload');await until(`document.querySelector('.living-colony.is-unity')`);
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`window.stellarNexusColony.onSelect('quantum_lab')`);
  await until(`document.querySelector('[data-colony-work="research"]')`);
  await evaluate(`document.querySelector('[data-colony-work="research"]').click()`);
  await until(`document.querySelector('#game[data-view="research"] [data-tech]')`);
  assert.equal(await evaluate(`document.querySelector('#game').dataset.view`),"research");
  for(let n=0;n<3;n++) {
    await evaluate(`document.querySelector('[data-view="defense"]').click()`);
    await until(`document.querySelector('#game').dataset.view==='defense'`);
    await pause(300);
    await evaluate(`document.querySelector('[data-view="command"]').click()`);
    await until(`document.querySelector('.living-colony.is-unity') && !document.querySelector('#colony-unity-layer').hidden && document.querySelectorAll('.colony-marker:not([hidden])').length>5`);
    const size=await evaluate(`(()=>{const c=document.querySelector('#colony-unity-canvas');return {width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight};})()`);
    assert.ok(size.width>100 && size.height>100 && size.cssWidth>100 && size.cssHeight>100,"Canvas restored after defense: "+JSON.stringify(size));
  }
  await send("Page.navigate",{url:base+"/help.html"});
  await until(`document.querySelector('.help-topbar > .btn')`);
  for(const [width,height] of [[320,568],[390,844],[844,390]]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:true});
    await evaluate(`document.body.style.setProperty('--safe-top','44px');window.scrollTo(0,400)`);
    await pause(200);
    const link=await evaluate(`(()=>{const b=document.querySelector('.help-topbar > .btn'),r=b.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),position:getComputedStyle(b.parentElement).position,padding:getComputedStyle(b.parentElement).paddingTop};})()`);
    assert.ok(link.top>=44 && link.left>=0 && link.right<=width && link.bottom<=height && link.hit,"Help return link visible and hittable at "+width+": "+JSON.stringify(link));
  }
  await evaluate(`document.querySelector('.help-topbar > .btn').click()`);
  await until(`document.querySelector('.living-colony.is-unity')`);
  console.log("Laboratory research, repeated defense-to-base navigation and mobile help return passed");
}
