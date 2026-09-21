import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const {requiredLevel}=createRequire(import.meta.url)('../src/colonization');

export async function verifyProtection({db,snap,send,evaluate,until,shot}) {
  const eid=snap.empire.id,pid=snap.planet.id;
  db.prepare('UPDATE empires SET created_at=? WHERE id=?').run(Date.now()-86400000,eid);
  db.prepare("INSERT INTO raids(target_planet_id,ships,arrives_at,kind,expires_at) VALUES(?,'{\"fighter\":1000}',1,'pirates',?)").run(pid,Date.now()+7200000);
  await send('Page.reload');await until(`document.querySelector('#beginner-protection')?.dataset.active==='true'`);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM raids WHERE target_planet_id=?').get(pid).n,0);
  for(const width of [1440,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:960,deviceScaleFactor:1,mobile:width===390});
    await new Promise(r=>setTimeout(r,300));
    const badge=await evaluate(`(()=>{const b=document.querySelector('#beginner-protection'),r=b.getBoundingClientRect(),h=document.querySelector('.topbar').getBoundingClientRect();return {text:b.textContent,title:b.title,visible:r.width>0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=h.bottom,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()`);
    assert.match(badge.text,/Anfängerschutz/);assert.match(badge.title,/Aktiv bis/);assert.ok(badge.visible && badge.hit,'Countdown visible and not covered at '+width);
    await shot('protection-header-'+width);
  }
  await evaluate(`document.querySelector('[data-view="empire"]').click()`);
  await until(`document.querySelector('#beginner-protection-detail')?.textContent.includes('Aktiv bis')`);
  assert.match(await evaluate(`document.querySelector('#beginner-protection-detail').textContent`),/Spielerangriffen und Piraten-Raids/);
  // Live expiry uses the existing header; no reload is needed.
  const original=db.prepare('SELECT created_at FROM empires WHERE id=?').get(eid).created_at;
  await evaluate(`window.__protectionNow=Date.now;Date.now=()=>window.__protectionNow()+6*86400000`);
  await until(`document.querySelector('#beginner-protection').dataset.active==='false'`);
  assert.match(await evaluate(`document.querySelector('#beginner-protection').textContent`),/beendet/);
  await evaluate(`Date.now=window.__protectionNow`);
  assert.equal(db.prepare('SELECT created_at FROM empires WHERE id=?').get(eid).created_at,original);
  await send('Page.navigate',{url:'http://localhost:3137/help.html#planetplaetze'});
  await until(`document.querySelectorAll('[data-planet-slot]').length===36`);
  const rows=await evaluate(`[...document.querySelectorAll('[data-planet-slot]')].map(r=>[...r.cells].map(c=>Number(c.textContent)))`);
  for(const [n,colonies,level] of rows){assert.equal(colonies,n-1);assert.equal(level,requiredLevel(n));}
  assert.ok(await evaluate(`document.querySelector('#anfaengerschutz').textContent.includes('Piraten-Raids')`));
  await shot('protection-help');
  assert.ok(await evaluate(`document.querySelector('#planetplaetze').getBoundingClientRect().right <= innerWidth`),'Planet help fits mobile viewport');
  assert.ok(await evaluate(`[...document.querySelectorAll('#planetplaetze th')].filter(h=>h.getBoundingClientRect().width>0).every(h=>h.getBoundingClientRect().right<=innerWidth)`),'Research requirements remain visible on mobile');
  console.log('Protection browser passed: legacy raid removed, desktop/mobile visible countdown, exact expiry details, live expiry, all 36 help thresholds');
}
