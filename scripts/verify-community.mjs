import assert from 'node:assert/strict';
export async function verifyCommunity({db,snap,send,evaluate,until,click,shot}) {
  await evaluate(`document.querySelector('[data-view="community"]').click()`);
  await click('[data-view-jump="chat"]');await until(`document.querySelector('#chat-input')`);
  await click('[data-view-jump="community"]');await click('[data-view-jump="forum"]');
  await until(`document.querySelector('#forum-create')`);
  await evaluate(`(()=>{document.querySelector('#forum-create').parentElement.open=true;const f=document.querySelector('#forum-create');f.elements.title.value='Idee <img src=x onerror=alert(1)>';f.elements.body.value='Mehr Zusammenarbeit im Nexus';f.requestSubmit();})()`);
  await until(`document.querySelector('#forum-reply')`);
  assert.equal(await evaluate(`document.querySelector('#forum-root h2').textContent`),'Idee <img src=x onerror=alert(1)>');
  assert.equal(await evaluate(`!!document.querySelector('#forum-root h2 img')`),false,'User text escaped');
  const topic=db.prepare('SELECT * FROM forum_topics WHERE author_id=?').get(snap.user.id);
  assert.ok(topic);
  db.prepare('UPDATE forum_topics SET created_at=? WHERE id=?').run(Date.now()-11000,topic.id);
  await evaluate(`(()=>{const f=document.querySelector('#forum-reply');f.elements.body.value='Eine passende Antwort';f.requestSubmit();})()`);
  await until(`document.querySelector('#forum-root').textContent.includes('Eine passende Antwort')`);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM forum_replies WHERE topic_id=?').get(topic.id).n,1);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`document.querySelector('#forum-lock').scrollIntoView({block:'center'})`);await click('#forum-lock');
  await until(`document.querySelector('#forum-root').textContent.includes('Dieses Thema ist geschlossen')`);
  await shot('community-forum-mobile');
  await evaluate(`document.querySelector('#forum-back').scrollIntoView({block:'center'})`);await click('#forum-back');
  await until(`document.querySelector('[data-topic="${topic.id}"]')`);
  await click('[data-view-jump="community"]');await click('[data-view-jump="forum"]');
  await until(`document.querySelector('[data-topic="${topic.id}"]')`);
  const anonymous=await fetch('http://localhost:3137/api/forum');assert.equal(anonymous.status,401);
  console.log('Community browser passed: chat navigation, real thread/reply persistence, escaped text, mobile moderation and authenticated API');
}
