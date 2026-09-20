"use strict";

// One authoritative count for the navigation and every tab in the inbox.
function unreadCounts(db, empireId) {
  const counts = { messages: 0, combat: 0, spy: 0, mail: 0 };
  for (const row of db.prepare("SELECT kind,COUNT(*) AS n FROM reports WHERE empire_id=? AND seen=0 GROUP BY kind").all(empireId)) {
    counts[row.kind === 'combat' || row.kind === 'spy' ? row.kind : 'messages'] += row.n;
  }
  counts.mail = db.prepare("SELECT COUNT(*) AS n FROM mail WHERE to_id=? AND seen=0").get(empireId).n;
  return counts;
}

module.exports = { unreadCounts };
