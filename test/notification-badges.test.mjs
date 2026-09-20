import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationBadges } from '../public/js/notifications.mjs';
test('zero counts stay cleared, parent counts destinations and labels explain each number',()=>{
  const b=notificationBadges({hints:{reports:0,chat:0,infra:1,activity:6},unread:9,unreadChat:7});
  assert.equal(b.reports.count,0);assert.equal(b.chat.count,0);assert.equal(b.more.count,2);
  assert.match(b.activity.label,/startbare Einsatzarten/);assert.match(b.more.label,/Bereiche/);
  const inbox=notificationBadges({unreadCounts:{messages:2,spy:1,combat:3,mail:1},hints:{reports:0}});
  assert.equal(inbox.reports.count,7);assert.equal(inbox['news-mail'].count,1);assert.equal(inbox.more.count,1);
  assert.equal(notificationBadges({hints:{chat:150}}).chat.text,'99+');
});
