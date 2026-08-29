"use strict";

const { bag, emptyBag, RESOURCE_IDS } = require("./catalog");
const { setRemnantFleet } = require("./galaxy");
const nexus = require("./nexus");
const progress = require("./progress");

function rand(n) {
  return Math.floor(Math.random() * n);
}

function threatOf(db) {
  const row = db.prepare("SELECT value FROM world_meta WHERE key = 'pirate_threat'").get();
  if (!row) return { level: 1, wins: 0, losses: 0 };
  try {
    const t = JSON.parse(row.value);
    return { level: Math.max(1, Math.min(16, t.level || 1)), wins: t.wins || 0, losses: t.losses || 0 };
  } catch {
    return { level: 1, wins: 0, losses: 0 };
  }
}

function saveThreat(db, t) {
  t.level = Math.max(1, Math.min(16, t.level | 0));
  db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES('pirate_threat', ?)").run(JSON.stringify(t));
  return t;
}

function bump(db, delta, field) {
  const t = threatOf(db);
  t.level += delta;
  if (field) t[field] = (t[field] || 0) + 1;
  return saveThreat(db, t);
}

function raidLevelFor(db, empire) {
  const lvl = progress.commanderLevel(empire?.xp || 0);
  let n = 1;
  if (lvl >= 4) n = 2;
  if (lvl >= 7) n = 3;
  if (lvl >= 11) n = 4;
  if (lvl >= 16) n = 5;
  if (lvl >= 22) n = 6;
  if (lvl >= 30) n = 7;
  if (lvl >= 40) n = 8;
  if (lvl >= 50) n = 10;
  if (lvl >= 62) n = 12;
  if (lvl >= 75) n = 14;
  if (lvl >= 88) n = 16;
  const rows = db
    .prepare(
      `SELECT s.ship_id, SUM(s.count) AS n
       FROM ships s JOIN planets p ON p.id = s.planet_id
       WHERE p.empire_id = ?
       GROUP BY s.ship_id`
    )
    .all(empire.id);
  const heavy = rows.some(
    (r) => ["cruiser", "destroyer", "battleship", "carrier", "dreadnought"].includes(r.ship_id) && r.n > 0
  );
  const light = rows.reduce((s, r) => s + (r.n || 0), 0);
  if (heavy) n = Math.min(16, n + 1);
  if (lvl <= 3) n = 1;
  else if (lvl <= 5 && light < 10) n = Math.min(n, 2);
  return Math.max(1, Math.min(16, n));
}

function fleetFor(level, role) {
  const lv = Math.max(1, level | 0);
  const raid = role === "raid";
  if (lv <= 1) return { fighter: 3 + rand(4), probe: raid ? 1 : 0 };
  if (lv === 2) return { fighter: 6 + rand(4), interceptor: raid ? 0 : 1, frigate: raid ? 0 : 1 };
  if (lv === 3) return { fighter: 8 + rand(4), interceptor: 2, frigate: 1 + rand(2), cargo: 1 };
  if (lv === 4) return { fighter: 10, interceptor: 3, frigate: 2, bomber: 1, cargo: 1, cruiser: raid ? 0 : 1 };
  if (lv === 5) return { fighter: 12, interceptor: 4, frigate: 3, bomber: 2, cruiser: 1 };
  if (lv === 6) return { fighter: 14, interceptor: 5, frigate: 4, bomber: 2, cruiser: 1, cargo: 2 };
  if (lv === 7) return { fighter: 16, interceptor: 6, bomber: 3, frigate: 5, cruiser: 2, carrier: 1 };
  if (lv === 8) return { fighter: 18, interceptor: 8, bomber: 4, frigate: 6, cruiser: 2, destroyer: 1, battleship: 1 };
  if (lv === 9) return { fighter: 22, interceptor: 10, bomber: 5, frigate: 7, cruiser: 3, destroyer: 1, carrier: 1, battleship: 1 };
  if (lv === 10) return { fighter: 26, interceptor: 12, bomber: 6, frigate: 8, cruiser: 3, destroyer: 2, carrier: 1, battleship: 1 };
  if (lv === 11) return { fighter: 30, interceptor: 14, bomber: 8, cruiser: 4, destroyer: 2, carrier: 2, battleship: 2 };
  if (lv === 12) return { fighter: 36, interceptor: 16, bomber: 10, cruiser: 5, destroyer: 3, carrier: 2, battleship: 2 };
  if (lv === 13) return { fighter: 42, interceptor: 18, bomber: 12, cruiser: 6, destroyer: 3, carrier: 2, battleship: 2, dreadnought: 1 };
  if (lv === 14) return { fighter: 50, interceptor: 22, bomber: 14, cruiser: 7, destroyer: 4, carrier: 3, battleship: 3, dreadnought: 1 };
  if (lv === 15) return { fighter: 60, interceptor: 26, bomber: 16, cruiser: 8, destroyer: 5, carrier: 3, battleship: 3, dreadnought: 2 };
  return { fighter: 72, interceptor: 32, bomber: 20, cruiser: 10, destroyer: 6, carrier: 4, battleship: 4, dreadnought: 2 };
}

function garrisonFor(level) {
  return merge({ fighter: 4, frigate: 1 }, fleetFor(level, "garrison"));
}

function merge(a, b) {
  const o = { ...a };
  for (const [k, v] of Object.entries(b || {})) if (v) o[k] = (o[k] || 0) + v;
  return o;
}

function rollLoot(level, mode) {
  const t = Math.max(1, level | 0);
  const scale = mode === "occupation" ? 1.45 : mode === "raid_defense" ? 1 : 1.2;
  const loot = emptyBag();
  const ships = {};
  const defenses = {};
  let xp = Math.floor((18 + t * 10) * scale);
  let relicId = null;
  const r = Math.random();
  let title = "Prise";
  let text = "";

  if (r < 0.22) {
    title = "Plünderkiste";
    text = "Der Schwarm hatte Frachträume voller Erz und Treibstoff.";
    Object.assign(loot, bag({
      metal: Math.floor((120 + rand(160) + t * 40) * scale),
      helium: Math.floor((60 + rand(80) + t * 20) * scale),
      energy: Math.floor((40 + rand(60)) * scale),
    }));
  } else if (r < 0.4) {
    title = "Gekaperte Jäger";
    text = "Intakte Rümpfe, Markierungen übermalt. Bereit zum Umflaggen.";
    ships.fighter = 1 + rand(2) + (t >= 4 ? 1 : 0);
    loot.helium = 30 + t * 10;
  } else if (r < 0.52) {
    title = "Frachtkahn";
    text = "Ein Transporter ergibt sich. Laderaum und Rumpf gehören dir.";
    ships.cargo = 1;
    for (const k of RESOURCE_IDS) loot[k] = Math.floor((20 + rand(40)) * (k === "diamond" ? 0.15 : 1) * scale);
    loot.diamond = rand(3);
  } else if (r < 0.62) {
    title = "Eskorte genommen";
    text = t >= 4 ? "Eine Fregatte senkt die Waffen." : "Leichte Eskorte, aber flugfähig.";
    if (t >= 3) ships.frigate = 1;
    else ships.fighter = 2 + rand(2);
    loot.titan = 20 + t * 12;
  } else if (r < 0.72) {
    title = "Batterie-Bergung";
    text = "Demontierte Rohre, noch scharf. Die Werft setzt sie in deinen Orbit.";
    defenses.flak = 2 + rand(3);
    if (t >= 5) defenses.missile = 1;
    loot.metal = 40;
  } else if (r < 0.82) {
    title = "Datenkern";
    text = "Navigationslogs und Feuerleit-Tabellen. Kristalle und Commander-XP.";
    loot.crystal = Math.floor((80 + rand(90) + t * 20) * scale);
    xp += 25 + t * 8;
  } else if (r < 0.9) {
    title = "Schwarzmarkt-Beute";
    text = "Diamanten, in Ölpapier. Jemand wollte das nicht verlieren.";
    loot.diamond = 2 + rand(2 + Math.min(4, t));
    loot.crystal = 40;
  } else if (r < 0.96 && mode !== "raid_defense") {
    title = "Kriegsbeute";
    text = "Schwere Prise: Schiffe und Erz.";
    ships.fighter = 2;
    if (t >= 4) ships.frigate = 1;
    if (t >= 7 && Math.random() < 0.35) ships.cruiser = 1;
    Object.assign(loot, bag({
      metal: 200 + t * 30,
      titan: 40 + t * 10,
      helium: 80,
    }));
  } else {
    title = "Relikt im Wrack";
    text = "Zwischen den Leichen ein Nexus-Stück.";
    loot.crystal = 50;
    xp += 40;
  }

  if (mode === "occupation") {
    loot.metal = (loot.metal || 0) + 80 + t * 25;
    loot.helium = (loot.helium || 0) + 40;
    xp += 20;
  }

  return { title, text, loot, ships, defenses, xp, relicId, kind: title };
}

function maybeGrantRelic(db, empireId, prize) {
  if (prize.relicId) return prize;
  if (Math.random() > 0.08) return prize;
  const rid = nexus.randomUnownedRelic(db, empireId);
  if (rid && nexus.grantRelic(db, empireId, rid)) {
    prize.relicId = rid;
    prize.text += ` Relikt: ${nexus.RELICS[rid].name}.`;
  }
  return prize;
}

function occupyEmpty(db, level) {
  const empty = db
    .prepare(
      `SELECT s.id FROM systems s
       WHERE s.remnant = 0 AND s.is_hub = 0 AND IFNULL(s.pirate,0) = 0
         AND NOT EXISTS (SELECT 1 FROM planets p WHERE p.system_id = s.id AND p.empire_id IS NOT NULL)
       ORDER BY RANDOM() LIMIT 1`
    )
    .get();
  if (!empty) return null;
  const tier = Math.max(1, level | 0);
  db.prepare("UPDATE systems SET remnant = 1, pirate = ? WHERE id = ?").run(tier, empty.id);
  setRemnantFleet(db, empty.id, garrisonFor(tier));
  return empty.id;
}

function grow(db) {
  const t = threatOf(db);
  if (Math.random() < 0.28) {
    t.level = Math.min(16, t.level + 1);
    saveThreat(db, t);
  }
  const held = db.prepare("SELECT COUNT(*) AS n FROM systems WHERE IFNULL(pirate,0) > 0").get().n;
  const want = Math.min(22, 2 + Math.floor(t.level * 1.1));
  if (held < want) occupyEmpty(db, t.level);
  const rows = db.prepare("SELECT id, pirate FROM systems WHERE IFNULL(pirate,0) > 0").all();
  for (const s of rows) {
    const next = Math.min(16, (s.pirate || 1) + (Math.random() < 0.35 ? 1 : 0));
    if (next !== s.pirate) db.prepare("UPDATE systems SET pirate = ? WHERE id = ?").run(next, s.id);
    setRemnantFleet(db, s.id, garrisonFor(next));
  }
  return threatOf(db);
}

function clearHold(db, systemId) {
  db.prepare("UPDATE systems SET pirate = 0 WHERE id = ?").run(systemId);
}

module.exports = {
  threatOf,
  raidLevelFor,
  saveThreat,
  bump,
  fleetFor,
  garrisonFor,
  rollLoot,
  maybeGrantRelic,
  occupyEmpty,
  grow,
  clearHold,
};
