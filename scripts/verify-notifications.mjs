import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export async function verifyNotifications({db,snap,send,evaluate,until,click,shot}) {
  const empireId = snap.empire.id;
  require('../src/seed').ensurePlayer(db,'BadgePeer','testpassword','Badge Peer','#ff4400');
  const peer = db.prepare("SELECT id FROM empires WHERE name='Badge Peer'").get().id;
  db.prepare('UPDATE empires SET translate=0 WHERE id IN (?,?)').run(empireId,peer);
  db.prepare('DELETE FROM reports WHERE empire_id=?').run(empireId);
  const insert = db.prepare("INSERT INTO reports(empire_id,kind,title,body,created_at,seen) VALUES(?,?,?,'{}',?,0)");
  for (const kind of ['event','combat','spy']) insert.run(empireId,kind,'Badge check '+kind,Date.now());
  db.prepare("INSERT INTO mail(from_id,to_id,subject,body,lang,created_at,seen) VALUES(?,?,'Badge check','Private badge test','de',?,0)").run(peer,empireId,Date.now());
  const chat=db.prepare("INSERT INTO chat_messages(channel,empire_id,body,lang,created_at) VALUES(?,?,?,'de',?)");
  chat.run('global',peer,'Global badge check',Date.now());chat.run('trade',peer,'Trade badge check',Date.now());
  await send('Page.reload');
  await until(`document.querySelector('[data-badge="reports"]')?.textContent==='4'`);
  await evaluate(`document.querySelector('#nav [data-view="reports"]').click()`);
  await until(`document.querySelector('#report-list article')`);
  assert.equal(await evaluate(`document.querySelector('[data-badge="news-mail"]').textContent`),'1');
  await click('[data-news="spy"]');await until(`document.querySelector('#report-list details.spy')`);
  await click('#report-list details.spy > summary');
  await until(`document.querySelector('[data-badge="news-spy"]').hidden && document.querySelector('[data-badge="reports"]').textContent==='3'`);
  await click('[data-news="messages"]');await until(`document.querySelector('#report-list article')`);
  await click('#mark-read');
  await until(`document.querySelector('[data-badge="news-messages"]').hidden`);
  assert.equal(await evaluate(`document.querySelector('[data-badge="news-combat"]').textContent`),'1');
  assert.equal(await evaluate(`document.querySelector('[data-badge="reports"]').textContent`),'2');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await evaluate(`(() => {
    const badge = document.querySelector('.tabbar [data-badge="more"]');
    const rect = badge.getBoundingClientRect();
    return !badge.hidden && getComputedStyle(badge).display !== 'none' && rect.width > 0 && rect.height > 0;
  })()`), 'Mobile command badge is visible');
  await shot('badges-mobile-inbox');
  await click('[data-news="mail"]');await until(`document.querySelector('[data-mail-peer="${peer}"]')`);
  await click(`[data-mail-peer="${peer}"]`);
  await until(`document.querySelector('[data-badge="news-mail"]').hidden && !document.querySelector('.mail-unread')`);
  assert.equal(await evaluate(`document.querySelector('[data-badge="reports"]').textContent`),'1');
  await evaluate(`document.querySelector('#nav [data-view="community"]').click()`);
  await click('[data-view-jump="chat"]');
  await until(`document.querySelector('[data-chat-unread="trade"]')?.textContent==='1'`);
  assert.equal(await evaluate(`document.querySelector('[data-badge="chat"]').textContent`),'1');
  await click('[data-chat-ch="trade"]');await until(`document.querySelector('[data-badge="chat"]').hidden`);
  await shot('badges-chat-cleared');
  await evaluate(`document.querySelector('#nav [data-view="reports"]').click()`);
  await click('[data-news="combat"]');await until(`document.querySelector('#report-list details.battle.unread')`);
  // Fail one read request: the red count must survive and the next click must retry.
  await send('Network.setBlockedURLs',{urls:['*/api/reports/read']});
  await click('#report-list details.battle > summary');
  await until(`document.querySelector('#toasts')?.textContent.includes('fetch')`);
  assert.equal(await evaluate(`document.querySelector('[data-badge="reports"]').textContent`),'1');
  assert.ok(await evaluate(`!!document.querySelector('#report-list details.battle.unread')`));
  await send('Network.setBlockedURLs',{urls:[]});
  await click('#report-list details.battle > summary');
  await until(`document.querySelector('[data-badge="reports"]').hidden`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-badge="reports"]')).display`),'none');
  console.log('Notification badges: report read, channel isolation, private mail, chat, failed read retry and mobile passed');
}
