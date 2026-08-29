const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db')).openDb(path.join(__dirname, '..', 'data', 'stellar-nexus.db'));

const users = db.prepare('SELECT id, username FROM users').all();
console.log('Vorhandene User:', users.map(u=>u.username).join(', ') || 'keine');

const u = db.prepare('SELECT id FROM users WHERE username IN (?,?,?)').all('testuser','testuser2','testuser3');
const ids = u.map(x=>x.id);
console.log('Zu loeschende IDs:', ids);

ids.forEach(uid => {
  const eid = db.prepare('SELECT id FROM empires WHERE user_id = ?').get(uid);
  if (!eid) return;
  const eidVal = eid.id;
  console.log('  Loesche Empire:', eidVal, 'fuer User', uid);
  
  db.prepare('DELETE FROM planet_bookmarks WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM reports WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM chat_messages WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM mail WHERE sender_id = ? OR receiver_id = ?').run(eidVal, eidVal);
  db.prepare('DELETE FROM chat_reads WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM alliance_members WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM alliance_research_contributions WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM alliance_apps WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM trade_orders WHERE seller_empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM attacks_log WHERE empire_id = ? OR target_id = ?').run(eidVal, eidVal);
  db.prepare('DELETE FROM fairplay_log WHERE empire_id = ? OR target_id = ?').run(eidVal, eidVal);
  db.prepare('DELETE FROM fleets WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM queue WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM ships WHERE planet_id IN (SELECT id FROM planets WHERE empire_id = ?)').run(eidVal);
  db.prepare('DELETE FROM defenses WHERE planet_id IN (SELECT id FROM planets WHERE empire_id = ?)').run(eidVal);
  db.prepare('DELETE FROM buildings WHERE planet_id IN (SELECT id FROM planets WHERE empire_id = ?)').run(eidVal);
  db.prepare('DELETE FROM research WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM quests WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM relics WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM medals WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM purchases WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM planets WHERE empire_id = ?').run(eidVal);
  db.prepare('DELETE FROM empires WHERE id = ?').run(eidVal);
});

// Sessions und Purchases nach User-ID loeschen
db.prepare('DELETE FROM sessions WHERE user_id IN (?,?,?)').run(...ids);
db.prepare('DELETE FROM purchases WHERE user_id IN (?,?,?)').run(...ids);

const del = db.prepare('DELETE FROM users WHERE id IN (?,?,?)').run(...ids);
console.log('Geloeschte User:', del.changes);

const remaining = db.prepare('SELECT username FROM users').all();
console.log('Verbleibende User:', remaining.map(u=>u.username).join(', ') || 'keine');
