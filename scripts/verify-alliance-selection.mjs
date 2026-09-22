import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export async function verifyAllianceSelection({db,snap,send,evaluate,until,click,shot}) {
  const social = require('../src/social');
  const {ensurePlayer} = require('../src/seed');
  const alliances = [];
  for (const [index, tag] of ['SEL1','SEL2','SEL3'].entries()) {
    ensurePlayer(db,tag,'local-test-password',tag,'#44aaff');
    const empire = db.prepare('SELECT e.* FROM empires e JOIN users u ON u.id=e.user_id WHERE u.username=?').get(tag);
    const a = social.createAlliance(db,empire,tag,'Selection '+tag,'','#44aaff');
    db.prepare('UPDATE alliances SET open_join=?,min_level=1 WHERE id=?').run(index===1?1:0,a.id);
    alliances.push(a);
  }
  const [first,open,closed] = alliances;
  const nav = async view => evaluate(`document.querySelector('[data-view="${view}"]').click()`);
  const selected = async id => until(`document.querySelector('#ally-detail')?.dataset.allianceId==='${id}' && document.querySelector('[data-ally-select="${id}"]')?.getAttribute('aria-pressed')==='true'`);
  const choose = async id => {
    const selector = `[data-ally-select="${id}"]`;
    await until(`document.querySelector('${selector}')`);
    await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'nearest',inline:'center'})`);
    await click(selector); await selected(id);
    assert.equal(await evaluate(`!!document.querySelector('.ally-sheet')`),false,'Selection does not open profile overlay');
  };
  await nav('alliance'); await choose(open.id);
  const profile = async (id, tag, prefix='.ally-list') => {
    const selector = `${prefix} [data-open-ally-profile="${id}"]`;
    await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'center',inline:'center'})`);
    await click(selector);
    await until(`document.querySelector('.ally-sheet h2')?.textContent.includes('[${tag}]')`);
    await evaluate(`document.querySelector('#ally-close').scrollIntoView({block:'center'})`);
    await click('#ally-close');
    await until(`!document.querySelector('.ally-sheet')`);
  };
  await profile(first.id, 'SEL1');
  await selected(open.id);
  await profile(open.id, 'SEL2', '#ally-detail');
  assert.match(await evaluate(`document.querySelector('#ally-apply').textContent`),/SEL2/);
  await nav('empire'); await nav('alliance'); await selected(open.id);
  // An older, slower response must not overwrite the most recent selection.
  await evaluate(`window.__allianceFetch=window.fetch;window.fetch=async (...args)=>{const response=await window.__allianceFetch(...args);if(String(args[0]).endsWith('/alliances/${first.id}'))await new Promise(r=>setTimeout(r,800));return response;};document.querySelector('[data-ally-select="${first.id}"]').click();document.querySelector('[data-ally-select="${closed.id}"]').click();`);
  await selected(closed.id); await new Promise(r=>setTimeout(r,1100)); await selected(closed.id);
  await evaluate(`window.fetch=window.__allianceFetch`);
  await evaluate(`document.querySelector('#ally-msg').value='Bitte aufnehmen';document.querySelector('#ally-apply').scrollIntoView({block:'center'})`);
  await click('#ally-apply');
  await until(`document.querySelector('#ally-detail')?.textContent.includes('Bewerbung gesendet')`);
  assert.equal(db.prepare('SELECT alliance_id FROM alliance_apps WHERE empire_id=?').get(snap.empire.id).alliance_id,closed.id);
  assert.equal(social.getAlliance(db,closed.id,snap.empire.id).applicationPending,true);
  assert.equal(social.getAlliance(db,closed.id,first.leaderId).applicationPending,false);
  await nav('empire'); await nav('alliance'); await selected(closed.id);
  assert.equal(await evaluate(`!!document.querySelector('#ally-apply')`),false,'Pending application cannot be sent twice');
  // Physical clicks on the horizontally scrolling mobile list and the chosen join button.
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await choose(open.id);
  await profile(closed.id, 'SEL3');
  await selected(open.id);
  await shot('alliance-mobile-profile-controls');
  db.prepare('UPDATE alliances SET min_level=60 WHERE id=?').run(open.id);
  await choose(first.id); await choose(open.id);
  assert.match(await evaluate(`document.querySelector('#ally-detail').textContent`),/Mindestlevel 60/);
  assert.equal(await evaluate(`!!document.querySelector('#ally-apply')`),false);
  db.prepare('UPDATE alliances SET min_level=1 WHERE id=?').run(open.id);
  await choose(first.id); await choose(open.id);
  await evaluate(`document.querySelector('#ally-apply').scrollIntoView({block:'center'})`);
  await shot('alliance-mobile-selection');
  await click('#ally-apply');
  await until(`document.querySelector('#ally-leave')`);
  assert.equal(db.prepare('SELECT alliance_id FROM alliance_members WHERE empire_id=?').get(snap.empire.id).alliance_id,open.id,'Joined selected alliance, not first ranked alliance');
  await choose(first.id);
  assert.match(await evaluate(`document.querySelector('#ally-detail').textContent`),/bereits in einer Allianz/);
  assert.equal(await evaluate(`!!document.querySelector('#ally-apply')`),false);
  await shot('alliance-existing-membership');
  console.log('Alliance selection passed: actual target, persistent selection, out-of-order responses, application status, level blocker, mobile join and existing membership');
}
