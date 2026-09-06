"use strict";

function shipCap(db, planetId) {
  const planet = db.prepare("SELECT empire_id, alliance_id FROM planets WHERE id=?").get(planetId);
  if (!planet?.empire_id) return 0;
  if (planet.alliance_id) {
    const members = db.prepare("SELECT COUNT(*) AS n FROM alliance_members WHERE alliance_id=?").get(planet.alliance_id).n;
    const level = db.prepare("SELECT level FROM buildings WHERE planet_id=? AND building_id='defense_hub'").get(planetId)?.level || 0;
    return Math.min(10000, 600 + members * 180 + level * 120);
  }
  const level = db.prepare("SELECT level FROM buildings WHERE planet_id=? AND building_id='shipyard'").get(planetId)?.level || 0;
  const empire = db.prepare("SELECT ship_cap_boost_until, ship_cap_bonus FROM empires WHERE id=?").get(planet.empire_id);
  const base = 20 + level * 30;
  return Math.min(2000, Math.floor(base * (Number(empire?.ship_cap_boost_until) > Date.now() ? 1.2 : 1)) + Number(empire?.ship_cap_bonus || 0));
}

function reserveMap(db, planetId) {
  return Object.fromEntries(db.prepare("SELECT ship_id,count FROM ship_reserves WHERE planet_id=? AND count>0").all(planetId).map(r => [r.ship_id,r.count]));
}

// Overflow is retained explicitly; it is never silently clamped or discarded.
function addShips(db, planetId, delta) {
  let room = Math.max(0, shipCap(db, planetId) - db.prepare("SELECT COALESCE(SUM(count),0) AS n FROM ships WHERE planet_id=?").get(planetId).n);
  const insert = db.prepare("INSERT INTO ships(planet_id,ship_id,count) VALUES(?,?,?) ON CONFLICT(planet_id,ship_id) DO UPDATE SET count=count+excluded.count");
  const reserve = db.prepare("INSERT INTO ship_reserves(planet_id,ship_id,count) VALUES(?,?,?) ON CONFLICT(planet_id,ship_id) DO UPDATE SET count=count+excluded.count");
  for (const [id,value] of Object.entries(delta || {})) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    if (!n) continue;
    const active = Math.min(room,n);
    if (active) insert.run(planetId,id,active);
    if (n>active) reserve.run(planetId,id,n-active);
    room -= active;
  }
}

function reconcile(db, planetId) {
  const rows = db.prepare("SELECT ship_id,count FROM ships WHERE planet_id=? ORDER BY ship_id").all(planetId);
  let excess = rows.reduce((n,r)=>n+r.count,0) - shipCap(db,planetId);
  for(const row of rows) {
    const n = Math.min(Math.max(0,excess),row.count);
    if(!n) continue;
    db.prepare("UPDATE ships SET count=count-? WHERE planet_id=? AND ship_id=?").run(n,planetId,row.ship_id);
    db.prepare("INSERT INTO ship_reserves(planet_id,ship_id,count) VALUES(?,?,?) ON CONFLICT(planet_id,ship_id) DO UPDATE SET count=count+excluded.count").run(planetId,row.ship_id,n);
    excess-=n;
  }
  let room=Math.max(0,shipCap(db,planetId)-db.prepare("SELECT COALESCE(SUM(count),0) AS n FROM ships WHERE planet_id=?").get(planetId).n);
  if (!room) return;
  for(const [id,count] of Object.entries(reserveMap(db,planetId))) {
    const n=Math.min(room,count);if(!n) break;
    db.prepare("UPDATE ship_reserves SET count=count-? WHERE planet_id=? AND ship_id=?").run(n,planetId,id);
    addShips(db,planetId,{[id]:n});room-=n;
  }
  db.prepare("DELETE FROM ship_reserves WHERE planet_id=? AND count=0").run(planetId);
}

module.exports = { shipCap, addShips, reserveMap, reconcile };
