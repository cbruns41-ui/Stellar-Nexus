import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export async function verifyAdminFunctions({db,send,evaluate,until,click,shot}) {
  require('../src/seed').ensurePlayer(db,'AuditPilot','secret123','Audit Empire','#00ffff');
  const player=db.prepare("SELECT u.id userId,e.id empireId FROM users u JOIN empires e ON e.user_id=u.id WHERE u.username='AuditPilot'").get();
  await evaluate(`document.querySelector('[data-view="moderation"]').click()`);
  await until(`document.querySelector('#mod-search')`);
  assert.equal(await evaluate(`document.querySelector('#mod-search').compareDocumentPosition(document.querySelector('#admin-settings')) & Node.DOCUMENT_POSITION_FOLLOWING`),4,'Player search precedes settings');
  assert.equal(await evaluate(`document.querySelector('.admin-options').open`),false);
  await evaluate(`document.querySelector('#mod-q').value='AuditPilot';document.querySelector('#mod-search').requestSubmit()`);
  await until(`document.querySelector('#mod-results [data-grant="nex"]')`);
  const nexBefore=db.prepare('SELECT nex FROM empires WHERE id=?').get(player.empireId).nex;
  await evaluate(`{const b=document.querySelector('#mod-results [data-grant="nex"]');b.click();b.click();}`);
  await until(`!document.querySelector('#mod-results [data-grant="nex"]').disabled`);
  assert.equal(db.prepare('SELECT nex FROM empires WHERE id=?').get(player.empireId).nex,nexBefore+100);
  await evaluate(`document.querySelector('.admin-options').open=true;document.querySelector('#admin-settings input[name="announcement"]').value='Admin browser check';document.querySelector('#admin-settings').requestSubmit();`);
  await until(`document.querySelector('[data-settings-status]')?.textContent.includes('gespeichert')`);
  assert.equal(require('../src/settings').get(db).announcement,'Admin browser check');
  assert.ok(await evaluate(`document.querySelector('#mod-results [data-grant-ships]')`));
  const before=db.prepare("SELECT COUNT(*) n FROM mod_log WHERE action='world'").get().n;
  await evaluate(`{const b=document.querySelector('[data-world="pirate"]');b.click();b.click();}`);
  await until(`document.querySelector('#mod-results [data-grant-ships]') && !document.querySelector('[data-world="pirate"]').disabled`);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mod_log WHERE action='world'").get().n,before+1);
  assert.equal(await evaluate(`document.querySelector('#mod-q').value`),'AuditPilot','Selection survives action refresh');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`document.querySelector('#mod-search').scrollIntoView({block:'center'})`);
  assert.equal(await evaluate(`(()=>{const e=document.querySelector('#mod-results');return e.scrollWidth<=e.clientWidth+1;})()`),true,'Mobile player actions do not require horizontal scrolling');
  await shot('admin-player-actions-mobile');
  // A late search response must never replace the latest target.
  await evaluate(`window.__adminFetch=window.fetch;window.fetch=async(...args)=>{const r=await window.__adminFetch(...args);if(String(args[0]).includes('/mod/search?q=AuditPilot'))await new Promise(resolve=>setTimeout(resolve,600));return r;};document.querySelector('#mod-q').value='AuditPilot';document.querySelector('#mod-search').requestSubmit();document.querySelector('#mod-q').value='NoSuchPilot';document.querySelector('#mod-search').requestSubmit();`);
  await until(`document.querySelector('#mod-results').textContent.includes('Kein Treffer')`);
  await new Promise(resolve=>setTimeout(resolve,800));
  assert.equal(await evaluate(`document.querySelector('#mod-results').textContent`),'Kein Treffer.');
  await evaluate(`window.fetch=window.__adminFetch`);
  console.log('Admin functions passed: discoverable player actions, single grants/world actions, persistent search, settings and stale search protection');
}
