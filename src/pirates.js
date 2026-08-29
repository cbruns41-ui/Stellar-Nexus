"use strict";

const { bag, emptyBag, RESOURCE_IDS, SHIPS, DEFENSES } = require("./catalog");
const { setRemnantFleet } = require("./galaxy");
const nexus = require("./nexus");
const progress = require("./progress");

const MAX_LEVEL = 99;
const MAX_STACK = 8000;
const CLASS_ERA = {
  probe: 1,
  fighter: 1,
  interceptor: 2,
  cargo: 3,
  frigate: 3,
  colony: 3,
  bomber: 4,
  cruiser: 5,
  aeon: 6,
  carrier: 7,
  destroyer: 8,
  helix: 9,
  battleship: 9,
  dreadnought: 11,
};
const ERA_MIX = {
  1: { fighter: 4 },
  2: { fighter: 5, interceptor: 2 },
  3: { fighter: 6, interceptor: 2, frigate: 1, cargo: 1 },
  4: { fighter: 6, interceptor: 3, frigate: 2, bomber: 1, cargo: 1 },
  5: { fighter: 7, interceptor: 3, frigate: 2, bomber: 1, cruiser: 1 },
  6: { fighter: 8, interceptor: 4, frigate: 2, bomber: 2, cruiser: 1, cargo: 1 },
  7: { fighter: 8, interceptor: 4, bomber: 2, frigate: 2, cruiser: 1, carrier: 1 },
  8: { fighter: 9, interceptor: 4, bomber: 2, cruiser: 2, destroyer: 1, frigate: 2 },
  9: { fighter: 10, interceptor: 5, bomber: 3, cruiser: 2, destroyer: 1, battleship: 1 },
  10: { fighter: 10, interceptor: 5, bomber: 3, cruiser: 2, destroyer: 1, carrier: 1, battleship: 1 },
  11: { fighter: 12, interceptor: 6, bomber: 4, cruiser: 2, destroyer: 1, carrier: 1, battleship: 1, dreadnought: 1 },
};

function rand(n) {
  return Math.floor(Math.random() * n);
}

function clampLevel(n) {
  return Math.max(1, Math.min(MAX_LEVEL, n | 0));
}

function shipWeight(id) {
  const s = SHIPS[id];
  if (!s) return 1;
  return s.attack + (s.hull + s.shield) * 0.4;
}

function defWeight(id) {
  const d = DEFENSES[id];
  if (!d) return 8;
  return d.attack + (d.hull + d.shield) * 0.4;
}

function fleetPower(map) {
  let p = 0;
  for (const [id, n] of Object.entries(map || {})) {
    if (n > 0) p += n * shipWeight(id);
  }
  return p;
}

function eraFromShips(map) {
  let era = 1;
  for (const [id, n] of Object.entries(map || {})) {
    if (n > 0 && CLASS_ERA[id]) era = Math.max(era, CLASS_ERA[id]);
  }
  return era;
}

function eraForLevel(level) {
  const lv = clampLevel(level);
  if (lv <= 2) return 1;
  if (lv <= 4) return 2;
  if (lv <= 6) return 3;
  if (lv <= 8) return 4;
  if (lv <= 11) return 5;
  if (lv <= 14) return 6;
  if (lv <= 18) return 7;
  if (lv <= 24) return 8;
  if (lv <= 32) return 9;
  if (lv <= 42) return 10;
  return 11;
}

function powerForLevel(level) {
  const lv = clampLevel(level);
  return Math.floor(70 * Math.pow(1.3, lv - 1));
}

function displayLevelFromPower(power, era, cmd) {
  const fromPower = Math.max(1, Math.round(Math.log2(Math.max(1, power) / 55 + 1) * 3.1));
  let n = Math.max(era, Math.round(fromPower * 0.7 + era * 0.9 + cmd * 0.06));
  if (cmd <= 3 && era <= 1) n = 1;
  else if (cmd <= 5 && power < 420) n = Math.min(n, 2);
  return clampLevel(n);
}

function empireMilitary(db, empireId) {
  const rows = db
    .prepare(
      `SELECT s.ship_id, SUM(s.count) AS n
       FROM ships s JOIN planets p ON p.id = s.planet_id
       WHERE p.empire_id = ?
       GROUP BY s.ship_id`
    )
    .all(empireId);
  const map = {};
  for (const r of rows) map[r.ship_id] = r.n || 0;
  return { map, power: fleetPower(map), era: eraFromShips(map) };
}

function planetMilitary(db, planetId) {
  const ships = db.prepare("SELECT ship_id, count FROM ships WHERE planet_id = ?").all(planetId);
  const map = {};
  for (const r of ships) map[r.ship_id] = r.count || 0;
  let defP = 0;
  try {
    const defs = db.prepare("SELECT defense_id, count FROM defenses WHERE planet_id = ?").all(planetId);
    for (const d of defs) defP += (d.count || 0) * defWeight(d.defense_id);
  } catch {
    defP = 0;
  }
  const bld = db.prepare("SELECT building_id, level FROM buildings WHERE planet_id = ?").all(planetId);
  let plat = 0;
  for (const b of bld) {
    if (b.building_id === "shield") plat += (b.level || 0) * 70;
    if (b.building_id === "citadel") plat += (b.level || 0) * 140;
  }
  return { map, power: fleetPower(map) + defP + plat, era: eraFromShips(map) };
}

function mixForEra(era) {
  let e = Math.max(1, Math.min(11, era | 0));
  while (e > 1 && !ERA_MIX[e]) e--;
  return { ...(ERA_MIX[e] || ERA_MIX[1]) };
}

function heaviestIn(mix) {
  let best = "fighter";
  let w = 0;
  for (const id of Object.keys(mix)) {
    const wt = shipWeight(id);
    if (wt > w) {
      w = wt;
      best = id;
    }
  }
  return best;
}

function composeToPower(targetPower, era, role) {
  let e = Math.max(1, Math.min(11, era | 0));
  const want = Math.max(role === "raid" ? 48 : 72, targetPower);
  while (e > 1) {
    const probe = mixForEra(e);
    if (shipWeight(heaviestIn(probe)) <= want * 0.5) break;
    e -= 1;
  }
  const mix = mixForEra(e);
  if (role === "raid") delete mix.cargo;
  const base = Math.max(1, fleetPower(mix));
  const scale = want / base;
  const out = {};
  for (const [id, n] of Object.entries(mix)) {
    const c = Math.max(0, Math.min(MAX_STACK, Math.round(n * scale)));
    if (c > 0) out[id] = c;
  }
  if (!out.fighter && want >= 40) out.fighter = Math.min(MAX_STACK, Math.max(2, Math.round(want / shipWeight("fighter"))));
  return out;
}

function threatOf(db) {
  const row = db.prepare("SELECT value FROM world_meta WHERE key = 'pirate_threat'").get();
  if (!row) return { level: 1, wins: 0, losses: 0 };
  try {
    const t = JSON.parse(row.value);
    return { level: clampLevel(t.level || 1), wins: t.wins || 0, losses: t.losses || 0 };
  } catch {
    return { level: 1, wins: 0, losses: 0 };
  }
}

function saveThreat(db, t) {
  t.level = clampLevel(t.level | 0);
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
  if (!empire) return 1;
  const mil = empireMilitary(db, empire.id);
  const cmd = progress.commanderLevel(empire?.xp || 0);
  return displayLevelFromPower(mil.power, mil.era, cmd);
}

function raidFleetFor(db, empire, planet) {
  const emp = empireMilitary(db, empire.id);
  const loc = planet ? planetMilitary(db, planet.id) : { power: 0, era: 1, map: {} };
  const era = Math.max(1, emp.era, loc.era);
  const cmd = progress.commanderLevel(empire?.xp || 0);
  let target = loc.power * 0.88 + Math.min(emp.power * 0.1, loc.power * 0.45 + 110);
  if (cmd <= 3 && era <= 1) target = Math.min(target, 95);
  else if (cmd <= 5 && emp.power < 500) target = Math.min(target, 240);
  if (loc.power > 90) {
    target = Math.max(loc.power * 0.62, Math.min(loc.power * 1.02, target));
  }
  return composeToPower(Math.max(50, target), era, "raid");
}

function fleetFor(level, role) {
  const lv = clampLevel(level);
  return composeToPower(powerForLevel(lv), eraForLevel(lv), role || "garrison");
}

function garrisonFor(level) {
  return merge({ fighter: 3, frigate: level >= 3 ? 1 : 0 }, fleetFor(level, "garrison"));
}

function merge(a, b) {
  const o = { ...a };
  for (const [k, v] of Object.entries(b || {})) if (v) o[k] = (o[k] || 0) + v;
  return o;
}

function lootScale(level, mode) {
  const t = clampLevel(level);
  const modeMul = mode === "occupation" ? 1.45 : mode === "raid_defense" ? 1 : 1.2;
  return modeMul * Math.pow(1.11, Math.min(48, t) - 1);
}

function rollLoot(level, mode) {
  const t = clampLevel(level);
  const scale = lootScale(t, mode);
  const loot = emptyBag();
  const ships = {};
  const defenses = {};
  let xp = Math.floor((18 + t * 12) * scale);
  let relicId = null;
  const r = Math.random();
  let title = "Prise";
  let text = "";

  if (r < 0.22) {
    title = "Plünderkiste";
    text = "Der Schwarm hatte Frachträume voller Erz und Treibstoff.";
    Object.assign(loot, bag({
      metal: Math.floor((120 + rand(160) + t * 48) * scale),
      helium: Math.floor((60 + rand(80) + t * 24) * scale),
      energy: Math.floor((40 + rand(60) + t * 8) * scale),
    }));
  } else if (r < 0.4) {
    title = "Gekaperte Jäger";
    text = "Intakte Rümpfe, Markierungen übermalt. Bereit zum Umflaggen.";
    ships.fighter = 1 + rand(2) + (t >= 4 ? 1 : 0) + (t >= 20 ? rand(3) : 0);
    loot.helium = Math.floor((30 + t * 12) * Math.min(8, scale));
  } else if (r < 0.52) {
    title = "Frachtkahn";
    text = "Ein Transporter ergibt sich. Laderaum und Rumpf gehören dir.";
    ships.cargo = 1;
    for (const k of RESOURCE_IDS) loot[k] = Math.floor((20 + rand(40)) * (k === "diamond" ? 0.15 : 1) * scale);
    loot.diamond = rand(3) + (t >= 12 ? 1 : 0);
  } else if (r < 0.62) {
    title = "Eskorte genommen";
    text = t >= 4 ? "Eine Fregatte senkt die Waffen." : "Leichte Eskorte, aber flugfähig.";
    if (t >= 24) ships.cruiser = 1;
    else if (t >= 3) ships.frigate = 1;
    else ships.fighter = 2 + rand(2);
    loot.titan = Math.floor((20 + t * 14) * Math.min(6, scale));
  } else if (r < 0.72) {
    title = "Batterie-Bergung";
    text = "Demontierte Rohre, noch scharf. Die Werft setzt sie in deinen Orbit.";
    defenses.flak = 2 + rand(3) + (t >= 16 ? 2 : 0);
    if (t >= 5) defenses.missile = 1;
    if (t >= 22) defenses.plasma = 1;
    loot.metal = Math.floor(40 * scale);
  } else if (r < 0.82) {
    title = "Datenkern";
    text = "Navigationslogs und Feuerleit-Tabellen. Kristalle und Commander-XP.";
    loot.crystal = Math.floor((80 + rand(90) + t * 24) * scale);
    xp += Math.floor((25 + t * 10) * scale);
  } else if (r < 0.9) {
    title = "Schwarzmarkt-Beute";
    text = "Diamanten, in Ölpapier. Jemand wollte das nicht verlieren.";
    loot.diamond = 2 + rand(2 + Math.min(6, Math.floor(t / 4)));
    loot.crystal = Math.floor(40 * scale);
  } else if (r < 0.96 && mode !== "raid_defense") {
    title = "Kriegsbeute";
    text = "Schwere Prise: Schiffe und Erz.";
    ships.fighter = 2 + (t >= 18 ? 2 : 0);
    if (t >= 4) ships.frigate = 1;
    if (t >= 7 && Math.random() < 0.35) ships.cruiser = 1;
    if (t >= 28 && Math.random() < 0.2) ships.battleship = 1;
    Object.assign(loot, bag({
      metal: Math.floor((200 + t * 36) * scale),
      titan: Math.floor((40 + t * 12) * scale),
      helium: Math.floor(80 * scale),
    }));
  } else {
    title = "Relikt im Wrack";
    text = "Zwischen den Leichen ein Nexus-Stück.";
    loot.crystal = Math.floor(50 * scale);
    xp += Math.floor(40 * scale);
  }

  if (mode === "occupation") {
    loot.metal = (loot.metal || 0) + Math.floor((80 + t * 28) * scale);
    loot.helium = (loot.helium || 0) + Math.floor(40 * scale);
    xp += Math.floor(20 * scale);
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
  const tier = clampLevel(level);
  db.prepare("UPDATE systems SET remnant = 1, pirate = ? WHERE id = ?").run(tier, empty.id);
  setRemnantFleet(db, empty.id, garrisonFor(tier));
  return empty.id;
}

function galaxyPeak(db) {
  const empires = db.prepare("SELECT id, xp FROM empires").all();
  let peak = 1;
  for (const e of empires) peak = Math.max(peak, raidLevelFor(db, e));
  return clampLevel(peak);
}

function grow(db) {
  const peak = galaxyPeak(db);
  const t = threatOf(db);
  if (t.level < peak && Math.random() < 0.18) {
    t.level = Math.min(peak, t.level + 1);
    saveThreat(db, t);
  } else if (t.level > peak + 3 && Math.random() < 0.12) {
    t.level = Math.max(1, t.level - 1);
    saveThreat(db, t);
  }

  const held = db.prepare("SELECT COUNT(*) AS n FROM systems WHERE IFNULL(pirate,0) > 0").get().n;
  const want = Math.min(40, 3 + Math.floor(peak * 0.55));
  if (held < want) {
    const roll = Math.random();
    let spawnLv;
    if (roll < 0.42) spawnLv = 1 + rand(Math.min(3, Math.max(1, peak)));
    else if (roll < 0.78) spawnLv = Math.max(1, Math.round(peak * 0.4) + rand(3));
    else spawnLv = Math.max(1, peak - rand(Math.min(4, peak)));
    occupyEmpty(db, spawnLv);
  }

  const rows = db.prepare("SELECT id, pirate FROM systems WHERE IFNULL(pirate,0) > 0").all();
  for (const s of rows) {
    if (s.pirate <= 3 && Math.random() < 0.72) {
      setRemnantFleet(db, s.id, garrisonFor(s.pirate || 1));
      continue;
    }
    let next = s.pirate || 1;
    const r = Math.random();
    if (next < peak && r < 0.1) next += 1;
    else if (next > peak + 2 && r < 0.08) next -= 1;
    next = clampLevel(next);
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
  raidFleetFor,
  saveThreat,
  bump,
  fleetFor,
  garrisonFor,
  rollLoot,
  maybeGrantRelic,
  occupyEmpty,
  grow,
  clearHold,
  MAX_LEVEL,
};
