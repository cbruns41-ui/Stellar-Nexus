"use strict";

// One persisted encounter per system. API traffic never advances its difficulty.
const { remnantFleet, setRemnantFleet, remnantFleetForRing } = require('./galaxy');
const pirates = require('./pirates');
const HOUR = 3600000;
const RECOVERY_GRACE = 6 * HOUR;
const RECOVERY_DURATION = 18 * HOUR;
const LIBERATION = 72 * HOUR;
const WARLORD_ESCORT = { cruiser: 2, fighter: 8, frigate: 2 };

function merge(a, b) {
  const out = { ...a };
  for (const [id, n] of Object.entries(b)) out[id] = (out[id] || 0) + n;
  return out;
}

function adopt(db, sys) {
  let row = db.prepare('SELECT * FROM npc_sites WHERE system_id=?').get(sys.id);
  if (row || !sys.remnant) return row;
  let fleet = remnantFleet(db, sys.id);
  if (sys.warlord) fleet = merge(fleet, WARLORD_ESCORT);
  // Preserve existing survivors at upgrade; replenish missing ring ships only after grace.
  const base = sys.pirate ? pirates.garrisonFor(sys.pirate) : remnantFleetForRing(sys.ring);
  if (sys.warlord) Object.assign(base, merge(base, WARLORD_ESCORT));
  for (const [id, n] of Object.entries(fleet)) base[id] = Math.max(base[id] || 0, n);
  const damaged = Object.entries(base).some(([id, n]) => (fleet[id] || 0) < n);
  db.prepare(`INSERT INTO npc_sites(system_id,role,level,baseline,survivors,damaged_at)
    VALUES(?,?,?,?,?,?)`).run(sys.id, sys.pirate ? 'hold' : 'occupation', sys.pirate || pirates.levelForFleet(base), JSON.stringify(base), JSON.stringify(fleet), damaged ? Date.now() : 0);
  if (sys.warlord) setRemnantFleet(db, sys.id, fleet);
  return db.prepare('SELECT * FROM npc_sites WHERE system_id=?').get(sys.id);
}

function recordBattle(db, sys, survivors, won) {
  const row = adopt(db, sys);
  if (!row) return;
  db.prepare(`UPDATE npc_sites SET survivors=?, damaged_at=?, cleared_at=?, victories=victories+? WHERE system_id=?`)
    .run(JSON.stringify(survivors), won ? 0 : Date.now(), won ? Date.now() : 0, won ? 1 : 0, sys.id);
}

function protectedSystem(db, id) {
  return !!db.prepare(`SELECT 1 FROM planets WHERE system_id=? AND empire_id IS NOT NULL
    UNION ALL SELECT 1 FROM fleets f JOIN planets p ON p.id=f.target_planet_id
    WHERE p.system_id=? AND f.is_return=0 AND f.mission IN ('colonize','ally_colonize') LIMIT 1`).get(id, id);
}

function addWarlord(db, sys, name) {
  const row = adopt(db, sys);
  if (!row || row.damaged_at || row.cleared_at || sys.warlord) return false;
  if (protectedSystem(db, sys.id) || (sys.pirate ? sys.pirate <= 3 : sys.ring === 3)) return false;
  if (db.prepare("SELECT 1 FROM fleets f JOIN planets p ON p.id=f.target_planet_id WHERE p.system_id=? AND f.is_return=0 AND f.mission='attack' LIMIT 1").get(sys.id)) return false;
  const base = merge(JSON.parse(row.baseline), WARLORD_ESCORT);
  db.prepare('UPDATE systems SET warlord=? WHERE id=?').run(name, sys.id);
  db.prepare('UPDATE npc_sites SET baseline=?,survivors=? WHERE system_id=?').run(JSON.stringify(base), JSON.stringify(base), sys.id);
  setRemnantFleet(db, sys.id, base);
  return true;
}

function tick(db) {
  const at = Date.now();
  const last = Number(db.prepare("SELECT value FROM world_meta WHERE key='npc_sites_tick'").get()?.value || 0);
  if (at - last < 90000) return;
  db.prepare("INSERT OR REPLACE INTO world_meta(key,value) VALUES('npc_sites_tick',?)").run(String(at));
  restoreLiberatedSites(db, at);
  for (const sys of db.prepare('SELECT * FROM systems WHERE remnant=1').all()) adopt(db, sys);
  const rows = db.prepare('SELECT n.*,s.remnant,s.pirate,s.ring FROM npc_sites n JOIN systems s ON s.id=n.system_id').all();
  for (const row of rows) {
    if (protectedSystem(db, row.system_id)) continue;
    if (row.cleared_at) {
      if (at < row.cleared_at + LIBERATION) continue;
      const level = row.role === 'hold' && row.level > 3 ? Math.min(pirates.MAX_LEVEL, row.level + 1) : row.level;
      const base = row.role === 'hold' ? pirates.garrisonFor(level) : remnantFleetForRing(row.ring);
      db.prepare('UPDATE systems SET remnant=1,pirate=?,warlord=\'\' WHERE id=?').run(row.role === 'hold' ? level : 0, row.system_id);
      db.prepare('UPDATE npc_sites SET level=?,baseline=?,survivors=?,cleared_at=0,damaged_at=0 WHERE system_id=?')
        .run(row.role === 'hold' ? level : pirates.levelForFleet(base), JSON.stringify(base), JSON.stringify(base), row.system_id);
      setRemnantFleet(db, row.system_id, base);
    } else if (row.remnant && row.damaged_at && at > row.damaged_at + RECOVERY_GRACE) {
      // Do not change a target while an attack is already on its way.
      if (db.prepare(`SELECT 1 FROM fleets f JOIN planets p ON p.id=f.target_planet_id
        WHERE p.system_id=? AND f.is_return=0 AND f.mission='attack' LIMIT 1`).get(row.system_id)) continue;
      const fraction = Math.min(1, (at - row.damaged_at - RECOVERY_GRACE) / RECOVERY_DURATION);
      const base = JSON.parse(row.baseline), remaining = JSON.parse(row.survivors), rebuilt = {};
      for (const [id, n] of Object.entries(base)) {
        const count = (remaining[id] || 0) + Math.floor((n - (remaining[id] || 0)) * fraction);
        if (count) rebuilt[id] = count;
      }
      if (JSON.stringify(remnantFleet(db, row.system_id)) !== JSON.stringify(rebuilt)) setRemnantFleet(db, row.system_id, rebuilt);
      if (fraction === 1) db.prepare('UPDATE npc_sites SET damaged_at=0,survivors=baseline WHERE system_id=?').run(row.system_id);
    }
  }
}

function restoreLiberatedSites(db, at) {
  if (db.prepare("SELECT 1 FROM world_meta WHERE key='npc_liberation_migrated'").get()) return;
  // Previously cleared systems had no lifecycle at all. Recover their identity from real victories.
  // Grant a fresh 72h window at migration; never ambush a colony plan on deployment.
  const rows = db.prepare(`SELECT p.system_id,r.body FROM reports r
    JOIN planets p ON p.id=json_extract(r.body,'$.planetId') JOIN systems s ON s.id=p.system_id
    WHERE r.kind='combat' AND s.remnant=0 AND json_extract(r.body,'$.youWin')=1
      AND json_extract(r.body,'$.viewer')='attacker'
      AND (json_extract(r.body,'$.remnant')=1 OR json_extract(r.body,'$.pirate')>0)
    ORDER BY r.created_at DESC,r.id DESC`).all();
  const insert = db.prepare(`INSERT OR IGNORE INTO npc_sites(system_id,role,level,baseline,cleared_at,victories) VALUES(?,?,?,?,?,1)`);
  for (const r of rows) {
    const body = JSON.parse(r.body), sys = db.prepare('SELECT ring FROM systems WHERE id=?').get(r.system_id);
    const level = body.pirate ? Math.min(pirates.MAX_LEVEL,Math.max(1,Number(body.pirate))) : pirates.levelForFleet(remnantFleetForRing(sys.ring));
    const base = body.pirate ? pirates.garrisonFor(level) : remnantFleetForRing(sys.ring);
    insert.run(r.system_id,body.pirate ? 'hold' : 'occupation',level,JSON.stringify(base),at);
  }
  db.prepare("INSERT INTO world_meta(key,value) VALUES('npc_liberation_migrated',?)").run(String(at));
}

function status(db, systemId) {
  const row = db.prepare('SELECT * FROM npc_sites WHERE system_id=?').get(systemId);
  if (!row) return null;
  return { role: row.role, level: row.level, victories: row.victories,
    liberatedUntil: row.cleared_at ? row.cleared_at + LIBERATION : null,
    recoveryStartsAt: row.damaged_at ? row.damaged_at + RECOVERY_GRACE : null,
    recoveryEndsAt: row.damaged_at ? row.damaged_at + RECOVERY_GRACE + RECOVERY_DURATION : null,
    protected: protectedSystem(db, systemId) };
}

module.exports = { tick, adopt, recordBattle, addWarlord, status, protectedSystem, RECOVERY_GRACE, RECOVERY_DURATION, LIBERATION };
