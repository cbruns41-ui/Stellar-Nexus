"use strict";

const {
  BUILDINGS,
  TECHS,
  SHIPS,
  DEFENSES,
  PLANET_TYPES,
  EMPIRE_COLORS,
  RESOURCE_IDS,
  TECH_FOR_RESOURCE,
  emptyBag,
  bag,
  scaleBag,
  addBags,
  bagSum,
  scaledCost,
  scaledTime,
  meetsReq,
  maxPlanets,
  colonyShipCost,
  TIME_SPEED_CAP,
  TICK_MS,
} = require("./catalog");
const { remnantFleet, setRemnantFleet, remnantFleetForRing } = require("./galaxy");
const progress = require("./progress");
const nexus = require("./nexus");
const combat = require("./combat");
const economy = require("./economy");
const pirates = require("./pirates");
const social = require("./social");
const activity = require("./activity");
const chat = require("./chat");
const species = require("./species");
const fairplay = require("./fairplay");
const { withTx } = require("./tx");
const premium = require("./premium");
const commanders = require("./commanders");
const sectorSeason = require("./sectorSeason");

function now() {
  return Date.now();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function buildingsMap(db, planetId) {
  const rows = db.prepare("SELECT building_id, level FROM buildings WHERE planet_id = ?").all(planetId);
  const m = {};
  for (const r of rows) m[r.building_id] = r.level;
  return m;
}

function bestBuilding(db, empireId, buildingId) {
  const row = db
    .prepare(
      `SELECT MAX(b.level) AS n FROM buildings b JOIN planets p ON p.id = b.planet_id
       WHERE p.empire_id = ? AND b.building_id = ?`
    )
    .get(empireId, buildingId);
  return Number(row?.n || 0);
}

function shipsMap(db, planetId) {
  const rows = db.prepare("SELECT ship_id, count FROM ships WHERE planet_id = ?").all(planetId);
  const m = {};
  for (const r of rows) if (r.count > 0) m[r.ship_id] = r.count;
  return m;
}

function defensesMap(db, planetId) {
  const rows = db.prepare("SELECT defense_id, count FROM defenses WHERE planet_id = ?").all(planetId);
  const m = {};
  for (const r of rows) if (r.count > 0) m[r.defense_id] = r.count;
  return m;
}

function addDefenses(db, planetId, delta) {
  const stmt = db.prepare(
    `INSERT INTO defenses(planet_id, defense_id, count) VALUES(?, ?, ?)
     ON CONFLICT(planet_id, defense_id) DO UPDATE SET count = count + excluded.count`
  );
  for (const [id, n] of Object.entries(delta || {})) {
    if (!n) continue;
    stmt.run(planetId, id, n);
  }
  db.prepare("DELETE FROM defenses WHERE planet_id = ? AND count <= 0").run(planetId);
}

function techsMap(db, empireId) {
  const rows = db.prepare("SELECT tech_id, level FROM research WHERE empire_id = ?").all(empireId);
  const m = {};
  for (const id of Object.keys(TECHS)) m[id] = 0;
  for (const r of rows) m[r.tech_id] = r.level;
  return m;
}

function addShips(db, planetId, delta) {
  const stmt = db.prepare(
    `INSERT INTO ships(planet_id, ship_id, count) VALUES(?, ?, ?)
     ON CONFLICT(planet_id, ship_id) DO UPDATE SET count = count + excluded.count`
  );
  for (const [id, n] of Object.entries(delta || {})) {
    if (!n || n < 0) continue;
    stmt.run(planetId, id, n);
  }
  db.prepare("DELETE FROM ships WHERE planet_id = ? AND count <= 0").run(planetId);
}

function shipCap(db, planetId) {
  const planet = db.prepare("SELECT empire_id, alliance_id FROM planets WHERE id = ?").get(planetId);
  if (!planet?.empire_id) return 0;
  if (planet.alliance_id) {
    const members = db.prepare("SELECT COUNT(*) AS n FROM alliance_members WHERE alliance_id=?").get(planet.alliance_id).n;
    const defenseHub = db.prepare("SELECT level FROM buildings WHERE planet_id=? AND building_id='defense_hub'").get(planetId)?.level || 0;
    return Math.min(10000, 600 + members * 180 + defenseHub * 120);
  }
  const shipyard = db
    .prepare("SELECT level FROM buildings WHERE planet_id = ? AND building_id = 'shipyard'")
    .get(planetId);
  const level = shipyard?.level || 0;
  let cap = 20 + level * 20;
  const empire = db.prepare("SELECT ship_cap_boost_until, ship_cap_bonus FROM empires WHERE id = ?").get(planet.empire_id);
  const until = Number(empire?.ship_cap_boost_until || 0);
  if (until > Date.now()) cap = Math.floor(cap * 1.2);
  cap += Number(empire?.ship_cap_bonus || 0);
  return Math.min(2000, Math.max(0, cap));
}

function setBuilding(db, planetId, buildingId, level) {
  db.prepare(
    `INSERT INTO buildings(planet_id, building_id, level) VALUES(?, ?, ?)
     ON CONFLICT(planet_id, building_id) DO UPDATE SET level = excluded.level`
  ).run(planetId, buildingId, level);
}

function sizeMod(size) {
  return [0, 0.78, 1, 1.18, 1.38][size] || 1;
}

function hubBonus(db, empireId, techs) {
  const hubs = db
    .prepare(
      `SELECT s.id,
              (SELECT COUNT(*) FROM planets p WHERE p.system_id = s.id) AS total,
              (SELECT COUNT(*) FROM planets p WHERE p.system_id = s.id AND p.empire_id = ?) AS owned
       FROM systems s WHERE s.is_hub = 1`
    )
    .all(empireId);
  let controlled = 0;
  for (const h of hubs) if (h.owned > 0 && h.owned >= Math.ceil(h.total / 2)) controlled += 1;
  if (!controlled) return 0;
  return controlled * (0.12 + 0.03 * (techs.nexus_protocol || 0));
}

function calcStorage(siloLevel, habitatLevel = 0, storageMul = 0) {
  const bonus = !siloLevel ? 0 : Math.floor(11000 * siloLevel * 1.16 ** (siloLevel - 1));
  const hab = !habitatLevel ? 0 : Math.floor(9000 * habitatLevel * 1.14 ** (habitatLevel - 1));
  const extra = bonus + hab;
  const m = Math.max(0.5, 1 + (storageMul || 0));
  return {
    metal: Math.floor((9000 + extra) * m),
    helium: Math.floor((9000 + extra) * m),
    titan: Math.floor((5000 + Math.floor(extra * 0.7)) * m),
    energy: Math.floor((9000 + extra) * m),
    crystal: Math.floor((5000 + Math.floor(extra * 0.7)) * m),
    diamond: Math.floor((600 + Math.floor(extra * 0.12)) * m),
  };
}

function stockBag(planet) {
  return bag({
    metal: planet.metal ?? planet.matter ?? 0,
    helium: planet.helium || 0,
    titan: planet.titan || 0,
    energy: planet.energy || 0,
    crystal: planet.crystal ?? planet.data ?? 0,
    diamond: planet.diamond || 0,
  });
}

function calcProd(planet, buildings, techs, hub, cmdBonus = 0, mods = null) {
  const sm = sizeMod(planet.size);
  const type = PLANET_TYPES[planet.type] || PLANET_TYPES.terran;
  const out = emptyBag();
  for (const b of Object.values(BUILDINGS)) {
    if (!b.resource) continue;
    const lvl = buildings[b.id] || 0;
    if (lvl <= 0) continue;
    let v = b.baseProd * lvl * 1.13 ** (lvl - 1) * sm;
    const techId = TECH_FOR_RESOURCE[b.resource];
    if (techId) v *= 1 + 0.06 * (techs[techId] || 0);
    v *= 1 + cmdBonus;
    if (mods) {
      v *= 1 + (mods.rel?.[b.resource] || 0) + (mods.rel?.all || 0);
      if (mods.dir === "extract") v *= 1.18;
      const spec = mods.spec || {};
      v *= 1 + (spec.prod || 0);
      if (spec[b.resource]) v *= 1 + spec[b.resource];
      if (mods.ally?.prod) v *= 1 + mods.ally.prod;
    }
    const mul = type.multipliers?.[b.resource] ?? 1;
    v *= mul;
    if (type.focus && b.resource === type.focus && lvl >= 2) v *= 1.14;
    if (mods?.dir === "extract" && type.focus && b.resource === type.focus) v *= 1.1;
    if (b.resource === "crystal") v *= 1 + hub;
    if (mods?.worldProd) v *= mods.worldProd;
    out[b.resource] += v;
  }
  for (const k of RESOURCE_IDS) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}

function worldEconomy(db) {
  const s = require("./settings").get(db);
  return {
    prod: Math.max(0.4, Math.min(1.8, (Number(s.prodPct) || 100) / 100)),
    fuel: Math.max(0.5, Math.min(2.5, (Number(s.fuelPct) || 100) / 100)),
    activityLoot: Math.max(0.4, Math.min(1.6, (Number(s.activityLootPct) || 100) / 100)),
  };
}

function writeStock(db, planetId, stock) {
  db.prepare(
    "UPDATE planets SET metal = ?, helium = ?, titan = ?, energy = ?, crystal = ?, diamond = ? WHERE id = ?"
  ).run(stock.metal, stock.helium, stock.titan, stock.energy, stock.crystal, stock.diamond, planetId);
}

function applyStock(planet, stock) {
  for (const k of RESOURCE_IDS) planet[k] = stock[k];
  planet.matter = stock.metal;
  planet.data = stock.crystal;
}

function allianceStorageCap() {
  return bag({ metal: 500000, helium: 300000, titan: 200000, energy: 500000, crystal: 250000, diamond: 10000 });
}

function reportShipLosses(body, empireId) {
  if (!body || typeof body !== "object") return {};
  if (body.lost && typeof body.lost === "object") return body.lost;
  if (body.losses && typeof body.losses === "object") return body.losses;
  const side = body.viewer === "defender" ? body.defenders : body.attackers;
  const mine = Array.isArray(side) ? side.find((entry) => Number(entry.empireId) === Number(empireId)) : null;
  if (mine?.lost && typeof mine.lost === "object") return mine.lost;
  return body.viewer === "defender" ? body.defLost || {} : body.atkLost || {};
}

function accruePlanet(db, planet) {
  if (!planet || !planet.empire_id) {
    if (planet) {
      db.prepare("UPDATE planets SET last_tick = ? WHERE id = ?").run(now(), planet.id);
    }
    return planet;
  }
  const t = now();
  const dt = (t - planet.last_tick) / 3_600_000;
  if (dt <= 0) return planet;
  const buildings = buildingsMap(db, planet.id);
  const techs = techsMap(db, planet.empire_id);
  const hub = hubBonus(db, planet.empire_id, techs);
  const xp = db.prepare("SELECT xp FROM empires WHERE id = ?").get(planet.empire_id)?.xp || 0;
  const spec = species.bonusesOf(db, planet.empire_id);
  const mods = {
    rel: nexus.relicBonuses(nexus.equippedOf(db, planet.empire_id)),
    dir: planet.directive || "",
    spec,
    ally: social.allianceBonuses(db, planet.empire_id),
    worldProd: worldEconomy(db).prod,
  };
  const prod = planet.alliance_id ? emptyBag() : calcProd(planet, buildings, techs, hub, progress.productionBonus(xp), mods);
  const cap = planet.alliance_id ? allianceStorageCap() : calcStorage(buildings.silo || 0, buildings.habitat || 0, spec.storage);
  const cur = stockBag(planet);
  const next = emptyBag();
  for (const k of RESOURCE_IDS) next[k] = Math.min(cap[k], cur[k] + prod[k] * dt);
  writeStock(db, planet.id, next);
  db.prepare("UPDATE planets SET last_tick = ? WHERE id = ?").run(t, planet.id);
  applyStock(planet, next);
  planet.last_tick = t;
  return planet;
}

function canAfford(planet, cost) {
  const cur = stockBag(planet);
  return RESOURCE_IDS.every((k) => cur[k] >= (cost[k] || 0));
}

function spend(db, planet, cost) {
  const next = stockBag(planet);
  for (const k of RESOURCE_IDS) next[k] = Math.max(0, next[k] - (cost[k] || 0));
  writeStock(db, planet.id, next);
  applyStock(planet, next);
}

function credit(db, planet, amount) {
  const buildings = buildingsMap(db, planet.id);
  const cap = planet.alliance_id ? allianceStorageCap() : calcStorage(buildings.silo || 0, buildings.habitat || 0, planet.empire_id ? species.bonusesOf(db, planet.empire_id).storage : 0);
  const next = stockBag(planet);
  for (const k of RESOURCE_IDS) next[k] = Math.min(cap[k], next[k] + (amount[k] || 0));
  writeStock(db, planet.id, next);
  applyStock(planet, next);
}

function readCargo(fleet) {
  if (fleet.cargo) {
    try {
      const parsed = JSON.parse(fleet.cargo);
      if (parsed && typeof parsed === "object") return bag(parsed);
    } catch {
      /* fall through */
    }
  }
  return bag({
    metal: fleet.cargo_matter || 0,
    energy: fleet.cargo_energy || 0,
    crystal: fleet.cargo_data || 0,
  });
}

function researchSpeed(db, empireId) {
  const rows = db
    .prepare(
      `SELECT b.level FROM buildings b
       JOIN planets p ON p.id = b.planet_id
       WHERE p.empire_id = ? AND b.building_id = 'archive'`
    )
    .all(empireId);
  const best = rows.reduce((m, r) => Math.max(m, r.level), 0);
  const labs = db
    .prepare(
      `SELECT b.level FROM buildings b
       JOIN planets p ON p.id = b.planet_id
       WHERE p.empire_id = ? AND b.building_id = 'quantum_lab'`
    )
    .all(empireId);
  const lab = labs.reduce((m, r) => Math.max(m, r.level), 0);
  const sci = db.prepare("SELECT COUNT(*) AS n FROM planets WHERE empire_id = ? AND directive = 'science'").get(empireId).n;
  const spec = species.bonusesOf(db, empireId);
  const ally = social.allianceBonuses(db, empireId);
  return (0.12 * best + 0.1 * lab + (sci ? 0.15 : 0)) * (1 + (spec.research || 0)) * (1 + (ally.research || 0));
}

function buildSpeed(buildings, spec, ally) {
  const s = spec || {};
  const a = ally || {};
  return (0.1 * (buildings.command || 0) + 0.08 * (buildings.robotics || 0) + 0.06 * (buildings.nanite || 0)) * (1 + (s.build || 0)) * (1 + (a.build || 0));
}

function shipSpeed(buildings, spec, ally) {
  const s = spec || {};
  const a = ally || {};
  return (0.14 * (buildings.shipyard || 0) + 0.1 * (buildings.nanite || 0) + 0.05 * (buildings.robotics || 0)) * (1 + (s.shipBuild || 0) + (a.build || 0));
}

function defenseSpeed(buildings, spec, ally) {
  const s = spec || {};
  const a = ally || {};
  return (
    (0.14 * (buildings.defense_hub || 0) +
      0.08 * (buildings.citadel || 0) +
      0.05 * (buildings.nanite || 0) +
      0.04 * (buildings.shipyard || 0)) *
    (1 + (s.shipBuild || 0) + (a.build || 0))
  );
}

function techsWithSpecies(techs, spec, ally) {
  const s = spec || {};
  const a = ally || {};
  return { ...techs, specAtk: 1 + (s.combatAtk || 0), specHull: 1 + (s.hull || 0) + (a.hull || 0) };
}

function personalPlanetCount(db, empireId) {
  return db.prepare("SELECT COUNT(*) AS n FROM planets WHERE empire_id = ? AND IFNULL(alliance_id, 0) = 0").get(empireId).n;
}

const ACS_WINDOW_MS = TICK_MS;
const ACS_HOLD_MAX_MS = 12 * 60 * 60 * 1000;
const ACS_MAX_FLEETS = 8;

function tickStart(t) {
  return Math.floor(Number(t) / TICK_MS) * TICK_MS;
}

function alignToTick(t) {
  const n = Number(t) || 0;
  return Math.ceil(n / TICK_MS) * TICK_MS;
}

function msToTicks(ms) {
  return Math.max(0, Math.round(Number(ms) / TICK_MS));
}

function acsKey(db, empireId) {
  const a = social.myAlliance(db, empireId);
  return a ? "a" + a.id : "e" + empireId;
}

function tickWorld(db) {
  return withTx(db, () => {
    const t = now();
    const dueQ = db.prepare("SELECT * FROM queue WHERE completes_at <= ? ORDER BY completes_at ASC").all(t);
    for (const q of dueQ) completeQueue(db, q);
    activity.completeDue(db, credit, addShips, addReport);
    resolveDueFleets(db, t);
    resolveRaids(db);
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(t);
    maybePulse(db);
    tickGalaxy(db);
  });
}

function resolveDueFleets(db, t) {
  const dueF = db.prepare("SELECT * FROM fleets WHERE arrives_at <= ? ORDER BY arrives_at ASC").all(t);
  const done = new Set();
  for (const f of dueF) {
    if (done.has(f.id)) continue;
    if (f.is_return) {
      resolveFleet(db, f);
      done.add(f.id);
      continue;
    }
    if (f.mission === "attack") {
      const batch = collectAcsBatch(db, f, t);
      if (batch.defer) continue;
      for (const x of batch.fleets) done.add(x.id);
      if (batch.fleets.length > 1) resolveAcsAttack(db, batch.fleets);
      else resolveFleet(db, batch.fleets[0] || f);
      continue;
    }
    if (f.mission === "intercept") {
      const batch = collectInterceptBatch(db, f, t);
      if (batch.defer) continue;
      for (const x of batch.fleets) done.add(x.id);
      if (batch.fleets.length > 1) resolveIntercept(db, batch.fleets);
      else resolveIntercept(db, [batch.fleets[0] || f]);
      continue;
    }
    resolveFleet(db, f);
    done.add(f.id);
  }
}

function collectInterceptBatch(db, lead, t) {
  const inbound = db
    .prepare(
      `SELECT * FROM fleets
       WHERE target_planet_id = ? AND is_return = 0 AND mission = 'intercept'`
    )
    .all(lead.target_planet_id);
  const leadTick = tickStart(lead.arrives_at);
  const wave = inbound
    .filter((x) => tickStart(x.arrives_at) === leadTick)
    .sort((a, b) => a.arrives_at - b.arrives_at || a.id - b.id)
    .slice(0, ACS_MAX_FLEETS);
  if (wave.some((x) => x.arrives_at > t)) return { defer: true, fleets: [] };
  return { defer: false, fleets: wave.filter((x) => x.arrives_at <= t) };
}

function collectAcsBatch(db, lead, t) {
  const inbound = db
    .prepare(
      `SELECT * FROM fleets
       WHERE target_planet_id = ? AND is_return = 0 AND mission = 'attack'`
    )
    .all(lead.target_planet_id);
  const key = acsKey(db, lead.empire_id);
  const allies = inbound.filter((x) => acsKey(db, x.empire_id) === key);
  const leadTick = tickStart(lead.arrives_at);
  const wave = allies
    .filter((x) => tickStart(x.arrives_at) === leadTick)
    .sort((a, b) => a.arrives_at - b.arrives_at || a.id - b.id)
    .slice(0, ACS_MAX_FLEETS);
  if (wave.some((x) => x.arrives_at > t)) return { defer: true, fleets: [] };
  return { defer: false, fleets: wave.filter((x) => x.arrives_at <= t) };
}

function maybePulse(db) {
  const last = db.prepare("SELECT value FROM world_meta WHERE key = 'last_pulse'").get();
  if (last && Date.now() - Number(last.value) < 180000) return;
  if (Math.random() > 0.22) return;
  db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES('last_pulse', ?)").run(String(Date.now()));
  const p = db.prepare("SELECT * FROM planets WHERE empire_id IS NOT NULL ORDER BY RANDOM() LIMIT 1").get();
  if (!p) return;
  const kind = Math.random();
  if (kind < 0.5) {
    const boom = bag({ metal: 40 + Math.floor(Math.random() * 80), energy: 30, helium: 20 });
    credit(db, p, boom);
    addReport(db, p.empire_id, "event", `Sonnensturm über ${p.name}`, {
      text: "Ein Strahlungsmaximum treibt die Kollektoren. Kurzer Ressourcen-Schub.",
    });
  } else {
    addReport(db, p.empire_id, "event", `Piratenfunk bei ${p.name}`, {
      text: "Ein fremdes Echo im Orbit. Sende eine Sonde oder verstärke die Jäger.",
      planetId: p.id,
      jumps: [
        { view: "galaxy", label: "Sonde senden" },
        { view: "yard", label: "Jäger verstärken" },
        { view: "fleets", label: "Zur Flotte" },
      ],
    });
  }
}

function completeQueue(db, q) {
  db.prepare("DELETE FROM queue WHERE id = ?").run(q.id);
  if (q.kind === "building") {
    setBuilding(db, q.planet_id, q.item_id, q.level_to);
    addReport(db, q.empire_id, "build", `${BUILDINGS[q.item_id]?.name || q.item_id} Stufe ${q.level_to}`, {
      text: `Konstruktion abgeschlossen.`,
      itemKind: "building",
      planetId: q.planet_id,
      jumps: [{ view: "infra", label: "Zu den Gebäuden", planetId: q.planet_id }],
    });
  } else if (q.kind === "ship") {
    addShips(db, q.planet_id, { [q.item_id]: q.qty });
    addReport(db, q.empire_id, "build", `${q.qty}× ${SHIPS[q.item_id]?.name || q.item_id} fertig`, {
      text: `Werft-Auftrag abgeschlossen.`,
      itemKind: "ship",
      planetId: q.planet_id,
      jumps: [{ view: "yard", label: "Zur Werft", planetId: q.planet_id }],
    });
  } else if (q.kind === "research") {
    db.prepare(
      `INSERT INTO research(empire_id, tech_id, level) VALUES(?, ?, ?)
       ON CONFLICT(empire_id, tech_id) DO UPDATE SET level = excluded.level`
    ).run(q.empire_id, q.item_id, q.level_to);
    addReport(db, q.empire_id, "research", `${TECHS[q.item_id]?.name || q.item_id} Stufe ${q.level_to}`, {
      text: `Forschung abgeschlossen.`,
      jumps: [{ view: "research", label: "Zur Forschung" }],
    });
  } else if (q.kind === "defense") {
    addDefenses(db, q.planet_id, { [q.item_id]: q.qty });
    addReport(db, q.empire_id, "build", `${q.qty}× ${DEFENSES[q.item_id]?.name || q.item_id} online`, {
      text: `Orbitale Batterie scharf.`,
      itemKind: "defense",
      planetId: q.planet_id,
      jumps: [{ view: "defense", label: "Zur Verteidigung", planetId: q.planet_id }],
    });
  } else if (q.kind === "ally_research") {
    const planet = db.prepare("SELECT * FROM planets WHERE id = ?").get(q.planet_id);
    const def = social.ALLIANCE_RESEARCH[q.item_id];
    if (planet?.alliance_id && def) {
      db.prepare("INSERT OR IGNORE INTO alliance_research(alliance_id, research_id) VALUES(?, ?)").run(planet.alliance_id, def.id);
      db.prepare(
        "UPDATE alliance_research SET level = ?, metal = 0, helium = 0, titan = 0, energy = 0, crystal = 0 WHERE alliance_id = ? AND research_id = ?"
      ).run(q.level_to, planet.alliance_id, def.id);
      addReport(db, q.empire_id, "research", `Allianz: ${def.name} Stufe ${q.level_to}`, {
        text: `Allianzforschung abgeschlossen. Bonus gilt für alle Mitglieder.`,
        jumps: [{ view: "alliance", label: "Zur Allianz" }],
      });
    }
  }
}

function addReport(db, empireId, kind, title, body) {
  const createdAt = now();
  const inserted = db.prepare("INSERT INTO reports(empire_id, kind, title, body, created_at, seen) VALUES(?, ?, ?, ?, ?, 0)").run(
    empireId,
    kind,
    title,
    JSON.stringify(body),
    createdAt
  );
  const reportId = Number(inserted.lastInsertRowid);
  const linkedPlanetId = Number(body?.planetId || body?.originPlanetId || 0);
  if (linkedPlanetId) {
    db.prepare("UPDATE fleet_ledger SET cause=?, report_id=? WHERE empire_id=? AND planet_id=? AND report_id IS NULL AND created_at>=?")
      .run(title, reportId, empireId, linkedPlanetId, createdAt - 5000);
  } else {
    db.prepare("UPDATE fleet_ledger SET cause=?, report_id=? WHERE empire_id=? AND report_id IS NULL AND created_at>=?")
      .run(title, reportId, empireId, createdAt - 1500);
  }
  const owner = db.prepare("SELECT vip_until FROM empires WHERE id = ?").get(empireId);
  const cap = premium.reportCap(owner || {});
  const extra = db
    .prepare("SELECT id FROM reports WHERE empire_id = ? ORDER BY id DESC LIMIT -1 OFFSET ?")
    .all(empireId, cap);
  if (extra.length) {
    const ids = extra.map((r) => r.id);
    db.prepare(`DELETE FROM reports WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  }
  return reportId;
}

function queueBusy(db, kind, empireId, planetId) {
  if (kind === "research") {
    return db.prepare("SELECT * FROM queue WHERE empire_id = ? AND kind = 'research'").get(empireId);
  }
  if (kind === "ally_research") {
    return db.prepare("SELECT * FROM queue WHERE planet_id = ? AND kind = 'ally_research'").get(planetId);
  }
  return db.prepare("SELECT * FROM queue WHERE planet_id = ? AND kind = ?").get(planetId, kind);
}

function enqueueBuilding(db, empire, planet, buildingId) {
  if (planet?.alliance_id) throw new Error("Auf dem Allianzplaneten gibt es keinen normalen Kolonieausbau.");
  const spec = BUILDINGS[buildingId];
  if (!spec) throw new Error("Unbekanntes Gebäude.");
  const buildings = buildingsMap(db, planet.id);
  const techs = techsMap(db, empire.id);
  if (!meetsReq(spec.requires, buildings, techs)) throw new Error("Voraussetzungen nicht erfüllt.");
  if (queueBusy(db, "building", empire.id, planet.id)) throw new Error("Bauschleife belegt.");
  const level = buildings[buildingId] || 0;
  if (level >= spec.max) throw new Error("Maximalstufe erreicht.");
  const cost = scaledCost(spec.baseCost, spec.factor, level);
  planet = accruePlanet(db, planet);
  if (!canAfford(planet, cost)) throw new Error("Nicht genug Ressourcen.");
  spend(db, planet, cost);
  const t = now();
  const dur = scaledTime(spec.baseTime, spec.factor, level, buildSpeed(buildings, species.bonuses(empire.species), social.allianceBonuses(db, empire.id)));
  db.prepare(
    "INSERT INTO queue(empire_id, planet_id, kind, item_id, qty, level_to, started_at, completes_at) VALUES(?,?,?,?,?,?,?,?)"
  ).run(empire.id, planet.id, "building", buildingId, 1, level + 1, t, t + dur * 1000);
  return { completesAt: t + dur * 1000, cost, duration: dur };
}

function enqueueShip(db, empire, planet, shipId, qty) {
  if (planet?.alliance_id) throw new Error("Der Allianzplanet besitzt keine Werft. Schiffe werden dort stationiert.");
  qty = Math.max(1, Math.min(50, qty | 0));
  const spec = SHIPS[shipId];
  if (!spec) throw new Error("Unbekanntes Schiff.");
  const buildings = buildingsMap(db, planet.id);
  const techs = techsMap(db, empire.id);
  if (!meetsReq(spec.requires, buildings, techs)) throw new Error("Voraussetzungen nicht erfüllt.");
  if (spec.premium && !empire[spec.premium]) throw new Error("Erst im Nexus-Shop freischalten.");
  const queuedTotal = db.prepare("SELECT COALESCE(SUM(qty), 0) AS n FROM queue WHERE planet_id = ? AND kind = 'ship'").get(planet.id).n;
  const currentTotal = Object.values(shipsMap(db, planet.id)).reduce((s, n) => s + n, 0) + queuedTotal;
  const cap = shipCap(db, planet.id);
  if (currentTotal + qty > cap) throw new Error(`Schiffslimit erreicht (${currentTotal}/${cap}). Upgrade die Werft oder kaufe eine Werft-Turbine im Nex-Shop.`);
  let cost = scaleBag(spec.cost, qty);
  if (shipId === "colony") cost = scaleBag(colonyShipCost(personalPlanetCount(db, empire.id)), qty);
  planet = accruePlanet(db, planet);
  if (!canAfford(planet, cost)) throw new Error("Nicht genug Ressourcen.");
  spend(db, planet, cost);
  const t = now();
  const tail = db.prepare("SELECT MAX(completes_at) AS at FROM queue WHERE planet_id = ? AND kind = 'ship'").get(planet.id).at;
  const startsAt = Math.max(t, Number(tail) || 0);
  const forge = planet.directive === "forge" ? 0.2 : 0;
  const dock = shipId === "colony" ? 0.1 * (buildings.colony_dock || 0) : 0;
  const dur = Math.max(
    8,
    Math.floor(
      (spec.time * qty) /
        (1 + Math.min(TIME_SPEED_CAP, shipSpeed(buildings, species.bonuses(empire.species), social.allianceBonuses(db, empire.id)) + forge + dock))
    )
  );
  db.prepare(
    "INSERT INTO queue(empire_id, planet_id, kind, item_id, qty, level_to, started_at, completes_at) VALUES(?,?,?,?,?,?,?,?)"
  ).run(empire.id, planet.id, "ship", shipId, qty, null, startsAt, startsAt + dur * 1000);
  return { completesAt: startsAt + dur * 1000, cost, duration: dur };
}

function enqueueDefense(db, empire, planet, defenseId, qty) {
  qty = Math.max(1, Math.min(50, qty | 0));
  const spec = DEFENSES[defenseId];
  if (!spec) throw new Error("Unbekannte Verteidigung.");
  const buildings = buildingsMap(db, planet.id);
  const techs = techsMap(db, empire.id);
  if (!planet.alliance_id && !meetsReq(spec.requires, buildings, techs)) throw new Error("Voraussetzungen nicht erfüllt.");
  if (queueBusy(db, "defense", empire.id, planet.id)) throw new Error("Verteidigungszentrum belegt.");
  const cost = scaleBag(spec.cost, qty);
  planet = accruePlanet(db, planet);
  if (!canAfford(planet, cost)) throw new Error("Nicht genug Ressourcen.");
  spend(db, planet, cost);
  const t = now();
  const fortress = planet.directive === "fortress" ? 0.12 : 0;
  const dur = Math.max(
    8,
    Math.floor(
      (spec.time * qty) /
        (1 + Math.min(TIME_SPEED_CAP, defenseSpeed(buildings, species.bonuses(empire.species), social.allianceBonuses(db, empire.id)) + fortress))
    )
  );
  db.prepare(
    "INSERT INTO queue(empire_id, planet_id, kind, item_id, qty, level_to, started_at, completes_at) VALUES(?,?,?,?,?,?,?,?)"
  ).run(empire.id, planet.id, "defense", defenseId, qty, null, t, t + dur * 1000);
  return { completesAt: t + dur * 1000, cost, duration: dur };
}

function enqueueResearch(db, empire, planet, techId) {
  if (planet.alliance_id) throw new Error("Auf Allianz-Planeten läuft Allianzforschung, keine persönliche Forschung.");
  const spec = TECHS[techId];
  if (!spec) throw new Error("Unbekannte Forschung.");
  const buildings = buildingsMap(db, planet.id);
  if ((buildings.archive || 0) < 1) throw new Error("Kein Forschungsarchiv auf diesem Planeten.");
  const techs = techsMap(db, empire.id);
  if (!meetsReq(spec.requires, buildings, techs)) throw new Error("Voraussetzungen nicht erfüllt. Siehe Tech-Tree.");
  if (queueBusy(db, "research", empire.id, planet.id)) throw new Error("Forschungslabor belegt.");
  const level = techs[techId] || 0;
  if (level >= spec.max) throw new Error("Maximalstufe erreicht.");
  const cost = scaledCost(spec.baseCost, spec.factor, level);
  planet = accruePlanet(db, planet);
  if (!canAfford(planet, cost)) throw new Error("Nicht genug Ressourcen.");
  spend(db, planet, cost);
  const t = now();
  const dur = scaledTime(spec.baseTime, spec.factor, level, researchSpeed(db, empire.id));
  db.prepare(
    "INSERT INTO queue(empire_id, planet_id, kind, item_id, qty, level_to, started_at, completes_at) VALUES(?,?,?,?,?,?,?,?)"
  ).run(empire.id, planet.id, "research", techId, 1, level + 1, t, t + dur * 1000);
  return { completesAt: t + dur * 1000, cost, duration: dur };
}

function cancelQueue(db, empire, queueId) {
  const q = db.prepare("SELECT * FROM queue WHERE id = ? AND empire_id = ?").get(queueId, empire.id);
  if (!q) throw new Error("Auftrag nicht gefunden.");
  db.prepare("DELETE FROM queue WHERE id = ?").run(q.id);
  if (q.planet_id) {
    const planet = db.prepare("SELECT * FROM planets WHERE id = ?").get(q.planet_id);
    if (planet) {
      let cost;
      if (q.kind === "building") {
        const spec = BUILDINGS[q.item_id];
        cost = scaledCost(spec.baseCost, spec.factor, (q.level_to || 1) - 1);
      } else if (q.kind === "ship") {
        const spec = SHIPS[q.item_id];
        cost = q.item_id === "colony" ? scaleBag(colonyShipCost(personalPlanetCount(db, empire.id)), q.qty) : scaleBag(spec.cost, q.qty);
      } else if (q.kind === "defense") {
        const spec = DEFENSES[q.item_id];
        cost = scaleBag(spec.cost, q.qty);
      } else if (q.kind === "ally_research") {
        const def = social.ALLIANCE_RESEARCH[q.item_id];
        cost = emptyBag();
        if (def) {
          const mul = def.factor ** Math.max(0, (q.level_to || 1) - 1);
          for (const id of RESOURCE_IDS) cost[id] = Math.floor((def.cost[id] || 0) * mul);
        }
      } else {
        const spec = TECHS[q.item_id];
        cost = scaledCost(spec.baseCost, spec.factor, (q.level_to || 1) - 1);
      }
      credit(db, planet, scaleBag(cost, 0.5));
    }
  }
}

function hopsAllowed(techs, buildings = {}) {
  const warp = techs?.warp || 0;
  let hops = 3 + Math.floor(warp * 1.5);
  hops += (techs?.hyperspace || 0) * 2;
  hops += Math.floor((techs?.graviton || 0) * 0.75);
  hops += Math.floor((buildings.jumpgate || 0) * 1.2);
  hops += Math.floor((buildings.beacon || 0) * 0.35);
  if (warp >= 18) return 99;
  return Math.max(3, hops);
}

function shortestHops(db, fromSys, toSys) {
  if (fromSys === toSys) return 0;
  const links = db.prepare("SELECT a, b FROM links").all();
  const adj = {};
  for (const l of links) {
    (adj[l.a] ||= []).push(l.b);
    (adj[l.b] ||= []).push(l.a);
  }
  const q = [[fromSys, 0]];
  const seen = new Set([fromSys]);
  for (let i = 0; i < q.length; i++) {
    const [id, d] = q[i];
    for (const n of adj[id] || []) {
      if (seen.has(n)) continue;
      if (n === toSys) return d + 1;
      seen.add(n);
      q.push([n, d + 1]);
    }
  }
  return 99;
}

function fleetCargo(ships) {
  let c = 0;
  for (const [id, n] of Object.entries(ships)) c += (SHIPS[id]?.cargo || 0) * n;
  return c;
}

function fleetFuelCost(ships, hops, fuelMul = 1) {
  let c = 0;
  for (const [id, n] of Object.entries(ships)) c += (SHIPS[id]?.fuel || 0) * n;
  return Math.max(0, Math.round(c * Math.max(1, hops || 1) * Math.max(0.5, fuelMul)));
}

const newbieLeft = fairplay.newbieLeft;
const isNewbie = fairplay.isNewbie;

function fleetSpeed(ships) {
  let min = Infinity;
  for (const [id, n] of Object.entries(ships || {})) {
    if (n > 0) min = Math.min(min, SHIPS[id]?.speed || 1);
  }
  return Number.isFinite(min) ? min : 1;
}

function slowestShip(ships) {
  let best = null;
  for (const [id, n] of Object.entries(ships || {})) {
    if (n <= 0 || !SHIPS[id]) continue;
    const speed = SHIPS[id].speed || 1;
    if (!best || speed < best.speed) best = { id, name: SHIPS[id].name, speed, n };
  }
  return best;
}

function travelPlan(db, origin, target, ships, techs) {
  const os = db.prepare("SELECT * FROM systems WHERE id = ?").get(origin.system_id);
  const ts = db.prepare("SELECT * FROM systems WHERE id = ?").get(target.system_id);
  const hops = shortestHops(db, origin.system_id, target.system_id);
  const same = origin.system_id === target.system_id;
  const dist = same ? 36 : Math.max(48, Math.hypot(os.x - ts.x, os.y - ts.y));
  const slow = slowestShip(ships);
  const race = origin.empire_id ? species.bonusesOf(db, origin.empire_id) : {};
  const spd = (slow ? slow.speed : 1) * (1 + (race.travel || 0));
  const drive = 1 + 0.12 * (techs.warp || 0) + 0.08 * (techs.hyperspace || 0);
  const originBuildings = buildingsMap(db, origin.id);
  const beacon = 1 + 0.06 * (originBuildings.beacon || 0) + 0.08 * (originBuildings.jumpgate || 0);
  const rel = nexus.relicBonuses(nexus.equippedOf(db, origin.empire_id || origin.empireId));
  const hopMul = 1 + hops * 0.12;
  let sec = (dist / Math.max(0.4, spd)) * 9.2 * hopMul / Math.max(0.5, drive) / Math.max(0.5, beacon);
  const allyTravel = origin.empire_id ? social.allianceBonuses(db, origin.empire_id).travel || 0 : 0;
  const fleetCommander = origin.empire_id ? commanders.active(db.prepare("SELECT * FROM empires WHERE id = ?").get(origin.empire_id)) : null;
  sec *= Math.max(0.55, 1 - (rel.travel || 0) - allyTravel - (fleetCommander?.travel || 0));
  const rawMs = Math.max(1000, sec * 1000);
  const ticks = Math.max(1, Math.ceil(rawMs / TICK_MS));
  const kinds = Object.entries(ships || {}).filter(([, n]) => n > 0).length;
  return {
    ms: ticks * TICK_MS,
    rawMs,
    rawSeconds: Math.ceil(rawMs / 1000),
    ticks,
    seconds: ticks * (TICK_MS / 1000),
    tickMs: TICK_MS,
    dist: Math.round(dist),
    hops,
    sameSystem: same,
    fleetSpeed: spd,
    slowest: slow,
    mixed: kinds > 1,
    driveBonus: drive,
    beacon,
  };
}

function travelMs(db, origin, target, ships, techs) {
  return travelPlan(db, origin, target, ships, techs).ms;
}

function previewTravel(db, empire, origin, target, shipsWanted) {
  const stationed = shipsMap(db, origin.id);
  const ships = {};
  for (const [id, raw] of Object.entries(shipsWanted || {})) {
    const n = Math.max(0, Math.min(stationed[id] || 0, raw | 0));
    if (n) ships[id] = n;
  }
  const techs = techsMap(db, empire.id);
  const plan = travelPlan(db, origin, target, ships, techs);
  const hops = shortestHops(db, origin.system_id, target.system_id);
  const roster = Object.entries(ships).map(([id, n]) => ({
    id,
    name: SHIPS[id].name,
    speed: SHIPS[id].speed,
    n,
    bottleneck: plan.slowest && plan.slowest.id === id,
  }));
  const arrivesAt = alignToTick(now() + plan.ms);
  const strikes = [
    ...listAlliedStrikes(db, empire, target.id, arrivesAt),
    ...listInterceptStrikes(db, empire, target.id, arrivesAt),
  ];
  return {
    ...plan,
    ships: roster,
    empty: roster.length === 0,
    acsWindowMs: TICK_MS,
    holdMaxMs: ACS_HOLD_MAX_MS,
    tickMs: TICK_MS,
    arrivesAt,
    strikes,
    fuelNeeded: fleetFuelCost(ships, hops, worldEconomy(db).fuel),
    fuelAvailable: origin.helium || 0,
  };
}

function listAlliedStrikes(db, empire, targetId, natural) {
  const key = acsKey(db, empire.id);
  const rows = db
    .prepare(
      `SELECT f.*, e.name AS empireName
       FROM fleets f JOIN empires e ON e.id = f.empire_id
       WHERE f.target_planet_id = ? AND f.is_return = 0 AND f.mission = 'attack'
       ORDER BY f.arrives_at`
    )
    .all(targetId);
  return rows
    .filter((f) => acsKey(db, f.empire_id) === key)
    .map((f) => {
      const canJoin = tickStart(natural) <= tickStart(f.arrives_at);
      const hold = Math.max(0, f.arrives_at - natural);
      return {
        fleetId: f.id,
        name: f.empireName,
        own: f.empire_id === empire.id,
        arrivesAt: f.arrives_at,
        holdMs: hold,
        canJoin,
        ships: JSON.parse(f.ships || "{}"),
      };
    });
}

function listInterceptStrikes(db, empire, targetId, natural) {
  const rows = db
    .prepare(
      `SELECT f.*, e.name AS empireName
       FROM fleets f JOIN empires e ON e.id = f.empire_id
       WHERE f.target_planet_id = ? AND f.is_return = 0 AND f.mission = 'intercept'
       ORDER BY f.arrives_at`
    )
    .all(targetId);
  return rows
    .filter((f) => {
      const target = db.prepare("SELECT empire_id FROM planets WHERE id = ?").get(targetId);
      return target && acsKey(db, f.empire_id) === acsKey(db, target.empire_id);
    })
    .map((f) => {
      const canJoin = tickStart(natural) <= tickStart(f.arrives_at);
      const hold = Math.max(0, f.arrives_at - natural);
      return {
        fleetId: f.id,
        name: f.empireName,
        own: f.empire_id === empire.id,
        arrivesAt: f.arrives_at,
        holdMs: hold,
        canJoin,
        ships: JSON.parse(f.ships || "{}"),
      };
    });
}

function powerOf(ships, techs, extraShield = 0, hullBonus = 0) {
  let attack = 0;
  let hp = extraShield;
  let count = 0;
  for (const [id, n] of Object.entries(ships || {})) {
    if (n <= 0) continue;
    const s = SHIPS[id];
    if (!s) continue;
    count += n;
    attack += s.attack * n * (1 + 0.08 * (techs.weapons || 0)) * (1 + 0.04 * (techs.ai || 0));
    hp += (s.hull + s.shield) * n * (1 + 0.08 * (techs.armor || 0)) * (1 + 0.06 * (techs.shields || 0)) * (1 + hullBonus);
  }
  return { attack, hp, count };
}

function applyLosses(ships, ratio) {
  const out = {};
  const lost = {};
  for (const [id, n] of Object.entries(ships || {})) {
    const dead = Math.round(n * ratio);
    const left = Math.max(0, n - dead);
    if (left) out[id] = left;
    if (dead) lost[id] = dead;
  }
  return { survivors: out, lost };
}

function shipLabel(map) {
  const parts = [];
  for (const [id, n] of Object.entries(map || {})) {
    parts.push(`${n}× ${SHIPS[id]?.name || id}`);
  }
  return parts.join(", ") || "—";
}

function fight(atkShips, atkTechs, defShips, defTechs, platformHp, hullBonus = 0) {
  const atk = powerOf(atkShips, atkTechs, 0, hullBonus);
  const def = powerOf(defShips, defTechs, platformHp);
  if (atk.count === 0) {
    return { winner: "defender", atkLost: atkShips, defLost: {}, atkSurvivors: {}, defSurvivors: defShips };
  }
  if (def.count === 0 && platformHp <= 0) {
    return { winner: "attacker", atkLost: {}, defLost: {}, atkSurvivors: atkShips, defSurvivors: {} };
  }
  const atkRatio = clamp(def.attack / Math.max(1, atk.hp), 0, 1);
  const defRatio = clamp(atk.attack / Math.max(1, def.hp), 0, 1);
  const a = applyLosses(atkShips, atkRatio);
  const d = applyLosses(defShips, defRatio);
  const atkLeft = powerOf(a.survivors, atkTechs).hp;
  const defLeft = powerOf(d.survivors, defTechs).hp + platformHp * (1 - defRatio);
  const winner = atkLeft > defLeft ? "attacker" : defLeft > atkLeft ? "defender" : atk.attack >= def.attack ? "attacker" : "defender";
  return {
    winner,
    atkLost: a.lost,
    defLost: d.lost,
    atkSurvivors: a.survivors,
    defSurvivors: d.survivors,
  };
}

function launchReturn(db, fleet, ships, cargo) {
  if (!ships || Object.values(ships).every((n) => n <= 0)) {
    db.prepare("DELETE FROM fleets WHERE id = ?").run(fleet.id);
    return;
  }
  const t = now();
  const travel = Math.max(TICK_MS, fleet.arrives_at - fleet.departed_at - (fleet.hold_ms || 0));
  const bagCargo = bag(cargo || {});
  db.prepare(
    `UPDATE fleets SET origin_planet_id = ?, target_planet_id = ?, ships = ?,
      cargo = ?, cargo_matter = ?, cargo_energy = ?, cargo_data = ?,
      departed_at = ?, arrives_at = ?, is_return = 1, mission = ?
     WHERE id = ?`
  ).run(
    fleet.target_planet_id,
    fleet.origin_planet_id,
    JSON.stringify(ships),
    JSON.stringify(bagCargo),
    bagCargo.metal,
    bagCargo.energy,
    bagCargo.crystal,
    t,
    t + travel,
    fleet.mission,
    fleet.id
  );
}

function resolveFleet(db, fleet) {
  const ships = JSON.parse(fleet.ships || "{}");
  const origin = db.prepare("SELECT * FROM planets WHERE id = ?").get(fleet.origin_planet_id);
  const target = db.prepare("SELECT * FROM planets WHERE id = ?").get(fleet.target_planet_id);
  if (!target) {
    db.prepare("DELETE FROM fleets WHERE id = ?").run(fleet.id);
    return;
  }
  if (fleet.is_return) {
    const dest = db.prepare("SELECT * FROM planets WHERE id = ?").get(fleet.target_planet_id);
    if (dest && dest.empire_id === fleet.empire_id) {
      accruePlanet(db, dest);
      addShips(db, dest.id, ships);
      credit(db, dest, readCargo(fleet));
    } else if (origin && origin.empire_id === fleet.empire_id) {
      addShips(db, origin.id, ships);
    }
    db.prepare("DELETE FROM fleets WHERE id = ?").run(fleet.id);
    return;
  }

  const empire = db.prepare("SELECT * FROM empires WHERE id = ?").get(fleet.empire_id);
  const techs = techsMap(db, fleet.empire_id);
  const sys = db.prepare("SELECT * FROM systems WHERE id = ?").get(target.system_id);

  if (fleet.mission === "spy") {
    resolveSpy(db, fleet, ships, target, sys, techs, empire);
    return;
  }
  if (fleet.mission === "transport") {
    if (target.empire_id === fleet.empire_id) {
      accruePlanet(db, target);
      credit(db, target, readCargo(fleet));
      addReport(db, fleet.empire_id, "fleet", `Fracht gesendet: ${target.name}`, {
        text: `Fracht geliefert.`,
      });
      launchReturn(db, fleet, ships, emptyBag());
    } else {
      launchReturn(db, fleet, ships, readCargo(fleet));
    }
    return;
  }
  if (fleet.mission === "collect") {
    if (target.empire_id === fleet.empire_id) {
      accruePlanet(db, target);
      const wanted = readCargo(fleet);
      const available = stockBag(target);
      const haul = emptyBag();
      for (const k of RESOURCE_IDS) haul[k] = clamp(Number(wanted?.[k]) || 0, 0, available[k]);
      const cap = fleetCargo(ships);
      if (bagSum(haul) > cap) {
        const ratio = cap / Math.max(1, bagSum(haul));
        for (const k of RESOURCE_IDS) haul[k] = Math.floor(haul[k] * ratio);
      }
      spend(db, target, haul);
      const haulDesc = Object.entries(haul).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(", ");
      addReport(db, fleet.empire_id, "fleet", `Frachtabholung startet von ${target.name}`, {
        text: `Ladung: ${haulDesc || "nichts"}.`,
      });
      launchReturn(db, fleet, ships, haul);
    } else {
      launchReturn(db, fleet, ships, emptyBag());
    }
    return;
  }
  if (fleet.mission === "deploy") {
    if (target.empire_id === fleet.empire_id) {
      addShips(db, target.id, ships);
      addReport(db, fleet.empire_id, "fleet", `Stationiert über ${target.name}`, { text: shipLabel(ships) });
      db.prepare("DELETE FROM fleets WHERE id = ?").run(fleet.id);
    } else {
      launchReturn(db, fleet, ships, {});
    }
    return;
  }
  if (fleet.mission === "colonize" || fleet.mission === "ally_colonize") {
    resolveColonize(db, fleet, ships, target, sys, techs, empire);
    return;
  }
  if (fleet.mission === "attack") {
    resolveAcsAttack(db, [fleet]);
    return;
  }
  if (fleet.mission === "intercept") {
    resolveIntercept(db, fleet, ships, target);
    return;
  }
  if (fleet.mission === "expedition") {
    resolveExpedition(db, fleet, ships, origin || target, empire);
    return;
  }
  if (fleet.mission === "salvage") {
    resolveSalvage(db, fleet, ships, target, empire);
  }
}

function resolveExpedition(db, fleet, ships, home, empire) {
  const roll = progress.expeditionRoll(ships);
  const rel = nexus.relicBonuses(nexus.equippedOf(db, empire.id));
  if (roll.loot && rel.expedition) {
    for (const k of RESOURCE_IDS) roll.loot[k] = Math.floor((roll.loot[k] || 0) * (1 + rel.expedition));
  }
  const commander = commanders.active(empire);
  if (roll.loot && commander.loot) {
    for (const k of RESOURCE_IDS) roll.loot[k] = Math.floor((roll.loot[k] || 0) * (1 + commander.loot));
  }
  if ((roll.kind === "rare" || Math.random() < 0.14) && home) {
    const rid = nexus.randomUnownedRelic(db, empire.id);
    if (rid && nexus.grantRelic(db, empire.id, rid)) {
      roll.text += ` Relikt gefunden: ${nexus.RELICS[rid].name}.`;
      roll.relicId = rid;
    }
  }
  const left = { ...ships };
  if (roll.ships) {
    for (const [id, n] of Object.entries(roll.ships)) {
      left[id] = Math.max(0, (left[id] || 0) - n);
      if (!left[id]) delete left[id];
    }
  }
  if (roll.shipsGain) {
    for (const [id, n] of Object.entries(roll.shipsGain)) left[id] = (left[id] || 0) + n;
  }
  const rift = getRift(db);
  if (rift && home && rift.systemId === home.system_id && roll.loot) {
    for (const k of RESOURCE_IDS) roll.loot[k] = Math.floor((roll.loot[k] || 0) * 1.55);
    roll.text += " Der Nexus-Riss hat die Sensoren überladen.";
  }
  db.prepare("UPDATE empires SET xp = IFNULL(xp,0) + ? WHERE id = ?").run(15 + (roll.xp || 0), empire.id);
  addReport(db, empire.id, "expedition", `Expedition: ${roll.title}`, {
    text: roll.text,
    relicId: roll.relicId || null,
    loot: roll.loot,
    shipsGain: roll.shipsGain || {},
    lost: roll.ships || {},
    kind: roll.kind,
  });
  launchReturn(db, fleet, left, roll.loot || emptyBag());
}

function resolveSalvage(db, fleet, ships, target, empire) {
  const row = db.prepare("SELECT * FROM debris WHERE planet_id = ? ORDER BY id DESC LIMIT 1").get(target.id);
  let loot = emptyBag();
  if (row) {
    loot = bag(JSON.parse(row.resources || "{}"));
    db.prepare("DELETE FROM debris WHERE id = ?").run(row.id);
  }
  addReport(db, empire.id, "salvage", `Trümmerfeld ${target.name}`, {
    text: row ? "Wrackteile gesichert." : "Nichts mehr da. Ein anderer Verband war schneller.",
    loot,
  });
  launchReturn(db, fleet, ships, loot);
}

function spyOdds(db, empire, origin, target, probes) {
  const s = require("./settings").get(db);
  const base = (Number(s.spyBasePct) || 52) / 100;
  const per = (Number(s.spyCenterBonusPct) || 6) / 100;
  const floor = (Number(s.spyFloorPct) || 8) / 100;
  const cap = (Number(s.spyCapPct) || 92) / 100;
  const mySpy = Math.max(bestBuilding(db, empire.id, "spy_center"), origin ? buildingsMap(db, origin.id).spy_center || 0 : 0);
  const theirSpy = target?.empire_id ? buildingsMap(db, target.id).spy_center || 0 : 0;
  const techs = techsMap(db, empire.id);
  const rel = nexus.relicBonuses(nexus.equippedOf(db, empire.id));
  const race = species.bonuses(empire.species);
  const defs = target?.empire_id ? defensesMap(db, target.id) : {};
  const defN = Object.values(defs).reduce((n, v) => n + (v || 0), 0);
  const shipsN = target?.empire_id ? Object.values(shipsMap(db, target.id)).reduce((n, v) => n + (v || 0), 0) : 0;
  const shield = target ? buildingsMap(db, target.id).shield || 0 : 0;
  const citadel = target ? buildingsMap(db, target.id).citadel || 0 : 0;
  const probeN = Math.max(1, probes | 0);
  let p =
    base +
    mySpy * per +
    0.018 * (techs.ai || 0) +
    (race.spy || 0) +
    (rel.spy || 0) +
    Math.min(0.12, 0.022 * (probeN - 1)) -
    theirSpy * per * 0.75 -
    0.012 * shield -
    0.018 * citadel -
    Math.min(0.18, defN / 220) -
    Math.min(0.16, shipsN / 280);
  p = Math.max(floor, Math.min(cap, p));
  const detect =
    target?.empire_id &&
    Math.max(0.08, Math.min(0.85, 0.28 + theirSpy * 0.04 + Math.min(0.22, defN / 160) - mySpy * 0.02 - (race.spy || 0) * 0.4));
  return { chance: p, pct: Math.round(p * 100), detectPct: Math.round((detect || 0) * 100), mySpy, theirSpy };
}

function resolveSpy(db, fleet, ships, target, sys, techs, empire) {
  const origin = db.prepare("SELECT * FROM planets WHERE id = ?").get(fleet.origin_planet_id);
  const probes = ships.probe || 1;
  const odds = spyOdds(db, empire, origin, target, probes);
  const success = Math.random() < odds.chance;
  const detected = !!(target.empire_id && Math.random() * 100 < odds.detectPct);
  let survivors = ships;
  if (detected || !success) {
    const r = applyLosses(ships, success ? 0.55 : 0.82);
    survivors = r.survivors;
  }
  accruePlanet(db, target);
  const bmap = buildingsMap(db, target.id);
  const lost = {};
  for (const [id, n] of Object.entries(ships)) {
    const left = survivors[id] || 0;
    if (n - left > 0) lost[id] = n - left;
  }
  const merged = mergeShips(target.empire_id ? shipsMap(db, target.id) : {}, sys.remnant ? remnantFleet(db, sys.id) : {});
  const body = {
    text: success
      ? detected
        ? "Daten gesichert, aber die Sonden wurden teilweise abgefangen."
        : "Infiltration erfolgreich. Orbit ungehindert."
      : detected
        ? "Spionage gescheitert. Abwehr hat die Sonden zerschlagen, keine brauchbaren Daten."
        : "Spionage gescheitert. Das Netz blieb stumm.",
    success,
    chance: odds.pct,
    planet: target.name,
    planetId: target.id,
    systemId: sys.id,
    system: sys.name,
    typeName: PLANET_TYPES[target.type]?.name || target.type,
    owner: target.empire_id ? db.prepare("SELECT name FROM empires WHERE id = ?").get(target.empire_id)?.name : sys.remnant ? "Remnants" : "unbesetzt",
    resources: success ? stockBag(target) : null,
    buildings: success
      ? Object.entries(bmap).map(([id, level]) => ({ id, name: BUILDINGS[id]?.name || id, level }))
      : [],
    ships: success ? merged : {},
    defenses: success && target.empire_id ? defensesMap(db, target.id) : {},
    remnant: !!sys.remnant,
    detected,
    lost,
    size: success ? target.size : null,
  };
  addReport(db, fleet.empire_id, "spy", success ? `Spionage: ${target.name}` : `Spionage gescheitert: ${target.name}`, body);
  if (target.empire_id && target.empire_id !== fleet.empire_id && detected) {
    addReport(db, target.empire_id, "spy", `Sonden über ${target.name} entdeckt`, {
      text: success ? "Abwehr hat Sonden zerstört, der Feind hat trotzdem gelauscht." : "Abwehr hat die Sonden zerstört.",
    });
  }
  launchReturn(db, fleet, survivors, {});
}

function mergeShips(a, b) {
  const o = { ...a };
  for (const [k, v] of Object.entries(b || {})) o[k] = (o[k] || 0) + v;
  return o;
}

const ORBIT_FIRE_DURATION = 30_000;
const ORBIT_RESOURCE_SHORT = { metal: "MET", helium: "HEL", titan: "TIT", energy: "EN", crystal: "KRI", diamond: "DIA" };

function orbitFireReward(hits, random = Math.random) {
  const score = Math.max(0, Math.min(40, Math.floor(Number(hits) || 0)));
  const roll = (min, max) => Math.floor(min + Math.max(0, Math.min(0.999999, Number(random()) || 0)) * (max - min + 1));
  const loot = {
    metal: roll(70, 120) + score * 7,
    helium: roll(35, 70) + score * 4,
    titan: roll(25, 55) + score * 3,
    energy: roll(55, 100) + score * 5,
    crystal: roll(8, 18) + score * 2,
    diamond: score >= 8 ? roll(0, 1 + Math.floor(score / 14)) : 0,
  };
  return { hits: score, loot, ...loot };
}

function startOrbitFire(db, empire, planet) {
  if (!planet || Number(planet.empire_id) !== Number(empire.id)) {
    throw new Error("Orbit-Feuer ist nur über einer eigenen Kolonie verfügbar.");
  }
  const startedAt = now();
  const active = db.prepare(
    "SELECT id FROM orbit_fire_sessions WHERE empire_id = ? AND claimed_at = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1"
  ).get(empire.id, startedAt);
  if (active) db.prepare("UPDATE orbit_fire_sessions SET claimed_at = -1 WHERE id = ?").run(active.id);
  const expiresAt = startedAt + 75_000;
  const row = db.prepare(
    "INSERT INTO orbit_fire_sessions(empire_id, planet_id, started_at, expires_at, claimed_at) VALUES(?,?,?,?,0)"
  ).run(empire.id, planet.id, startedAt, expiresAt);
  return { id: Number(row.lastInsertRowid), durationMs: ORBIT_FIRE_DURATION, startedAt, expiresAt };
}

function claimOrbitFire(db, empire, sessionId, hits) {
  const session = db.prepare("SELECT * FROM orbit_fire_sessions WHERE id = ? AND empire_id = ?").get(Number(sessionId), empire.id);
  if (!session) throw new Error("Orbit-Feuer-Runde nicht gefunden.");
  if (session.claimed_at) throw new Error("Diese Belohnung wurde bereits abgeholt.");
  const claimedAt = now();
  if (claimedAt - session.started_at < ORBIT_FIRE_DURATION - 1_500) throw new Error("Die 30 Sekunden sind noch nicht vorbei.");
  if (claimedAt > session.expires_at) throw new Error("Die Orbit-Feuer-Runde ist abgelaufen.");
  const updated = db.prepare("UPDATE orbit_fire_sessions SET claimed_at = ? WHERE id = ? AND claimed_at = 0").run(claimedAt, session.id);
  if (!updated.changes) throw new Error("Diese Belohnung wurde bereits abgeholt.");
  const planet = db.prepare("SELECT * FROM planets WHERE id = ? AND empire_id = ?").get(session.planet_id, empire.id);
  if (!planet) throw new Error("Kolonie nicht mehr verfügbar.");
  const reward = orbitFireReward(hits);
  credit(db, accruePlanet(db, planet), bag(reward.loot));
  const lootText = Object.entries(reward.loot).filter(([, amount]) => amount > 0).map(([id, amount]) => `+${amount} ${ORBIT_RESOURCE_SHORT[id] || id.toUpperCase()}`).join(" · ");
  addReport(db, empire.id, "event", "Orbit-Feuer abgeschlossen", {
    text: `${reward.hits} Abschüsse · ${lootText}`,
    loot: reward.loot,
    jumps: [{ view: "command", planetId: planet.id, label: "Zum Planeten" }],
  });
  return { ...reward, planetId: planet.id };
}

function splitShipSurvivors(shipGroups, totalLost) {
  const source = shipGroups || [];
  const groups = source.map(() => ({}));
  const ids = new Set(source.flatMap((ships) => Object.keys(ships || {})));
  for (const id of ids) {
    const counts = source.map((ships) => Math.max(0, Number(ships?.[id]) || 0));
    const total = counts.reduce((sum, n) => sum + n, 0);
    const lost = Math.min(total, Math.max(0, Number(totalLost?.[id]) || 0));
    const survivors = total - lost;
    if (!total || !survivors) continue;
    const exact = counts.map((n) => (n * survivors) / total);
    const allocated = exact.map(Math.floor);
    let rest = survivors - allocated.reduce((sum, n) => sum + n, 0);
    const order = exact
      .map((n, i) => ({ i, fraction: n - allocated[i] }))
      .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
    for (const item of order) {
      if (rest <= 0) break;
      if (allocated[item.i] >= counts[item.i]) continue;
      allocated[item.i] += 1;
      rest -= 1;
    }
    allocated.forEach((n, i) => { if (n > 0) groups[i][id] = n; });
  }
  return groups;
}

function resolveAttack(db, fleet, ships, target, sys, techs, empire) {
  resolveAcsAttack(db, [fleet]);
}

function resolveAcsAttack(db, fleets) {
  if (!fleets || !fleets.length) return;
  const lead = fleets[0];
  const target = db.prepare("SELECT * FROM planets WHERE id = ?").get(lead.target_planet_id);
  if (!target) {
    for (const f of fleets) db.prepare("DELETE FROM fleets WHERE id = ?").run(f.id);
    return;
  }
  accruePlanet(db, target);
  const sys = db.prepare("SELECT * FROM systems WHERE id = ?").get(target.system_id);
  const groups = fleets.map((f) => {
    const empire = db.prepare("SELECT * FROM empires WHERE id = ?").get(f.empire_id);
    const techs = techsMap(db, f.empire_id);
    const rel = nexus.relicBonuses(nexus.equippedOf(db, f.empire_id));
    const commander = commanders.active(empire);
    const combatTechs = techsWithSpecies(techs, species.bonuses(empire.species), social.allianceBonuses(db, f.empire_id));
    combatTechs.specAtk = (combatTechs.specAtk || 1) * (1 + (commander.attack || 0));
    return {
      fleet: f,
      empire,
      ships: JSON.parse(f.ships || "{}"),
      techs: combatTechs,
      hullBonus: (rel.hull || 0) + (social.allianceBonuses(db, f.empire_id).hull || 0),
    };
  });
  const defShips = target.empire_id ? shipsMap(db, target.id) : {};
  const rem = sys.remnant ? remnantFleet(db, sys.id) : {};
  let merged = mergeShips(defShips, rem);
  if (sys.warlord) merged = mergeShips(merged, { cruiser: 2, fighter: 8, frigate: 2 });
  if (sys.pirate) merged = mergeShips(merged, pirates.garrisonFor(sys.pirate));
  const defTechs = target.empire_id ? techsMap(db, target.empire_id) : {};
  const tBuildings = target.empire_id ? buildingsMap(db, target.id) : {};
  const shieldLvl = tBuildings.shield || 0;
  const platform = (tBuildings.shield || 0) * 55 + (tBuildings.citadel || 0) * 110 + (target.directive === "fortress" ? 280 : 0);
  const defs = target.empire_id ? defensesMap(db, target.id) : {};
  const defRace = target.empire_id ? species.bonusesOf(db, target.empire_id) : {};
  const result = combat.simulateGroups(
    groups.map((g) => ({ ships: g.ships, techs: g.techs, hullBonus: g.hullBonus })),
    merged,
    techsWithSpecies(defTechs, defRace, target.empire_id ? social.allianceBonuses(db, target.empire_id) : null),
    defs,
    platform
  );
  groups.forEach((g, i) => {
    const split = result.groups[i] || { lost: {}, survivors: {} };
    g.lost = split.lost || {};
    g.survivors = split.survivors || {};
  });
  const ships = groups.reduce((m, g) => mergeShips(m, g.ships), {});
  const leadEmpire = groups[0].empire;

  if (target.empire_id) {
    const stationedLost = {};
    for (const [id, n] of Object.entries(result.defLost || {})) {
      const had = defShips[id] || 0;
      stationedLost[id] = Math.min(had, n);
    }
    const remaining = {};
    for (const [id, n] of Object.entries(defShips)) {
      const left = n - (stationedLost[id] || 0);
      if (left > 0) remaining[id] = left;
    }
    db.prepare("DELETE FROM ships WHERE planet_id = ?").run(target.id);
    addShips(db, target.id, remaining);
    db.prepare("DELETE FROM defenses WHERE planet_id = ?").run(target.id);
    addDefenses(db, target.id, result.defSurvivorsDefense || {});
  }
  if (sys.remnant) {
    if (result.winner === "attacker") {
      db.prepare("UPDATE systems SET remnant = 0 WHERE id = ?").run(sys.id);
      setRemnantFleet(db, sys.id, {});
      const scraps = bag({
        metal: 60 + Math.floor(Math.random() * 90),
        titan: 10 + Math.floor(Math.random() * 30),
        helium: 20,
      });
      db.prepare("INSERT INTO debris(planet_id, resources, created_at) VALUES(?, ?, ?)").run(
        target.id,
        JSON.stringify(scraps),
        now()
      );
      if (sys.warlord) {
        db.prepare("UPDATE systems SET warlord = '' WHERE id = ?").run(sys.id);
        const rid = nexus.randomUnownedRelic(db, leadEmpire.id);
        if (rid && nexus.grantRelic(db, leadEmpire.id, rid)) {
          addReport(db, leadEmpire.id, "relic", `Relikt geborgen: ${nexus.RELICS[rid].name}`, {
            text: `${sys.warlord} fällt. ${nexus.RELICS[rid].blurb}`,
            relicId: rid,
          });
        }
      }
      if (sys.pirate) pirates.clearHold(db, sys.id);
    } else {
      setRemnantFleet(db, sys.id, result.defSurvivors);
    }
  }
  const seenXp = new Set();
  if (result.winner === "attacker") {
    for (const g of groups) {
      if (seenXp.has(g.empire.id)) continue;
      seenXp.add(g.empire.id);
      db.prepare("UPDATE empires SET xp = IFNULL(xp,0) + 25 WHERE id = ?").run(g.empire.id);
    }
  }

  let loot = emptyBag();
  const ownerIds = new Set(groups.map((g) => g.empire.id));
  if (result.winner === "attacker" && target.empire_id && !ownerIds.has(target.empire_id)) {
    const cap = groups.reduce((s, g) => s + fleetCargo(g.survivors), 0);
    const share = cap / RESOURCE_IDS.length;
    const cur = stockBag(target);
    const taken = emptyBag();
    for (const k of RESOURCE_IDS) taken[k] = Math.floor(Math.min(cur[k] * 0.5, share));
    loot = taken;
    const left = emptyBag();
    for (const k of RESOURCE_IDS) left[k] = Math.max(0, cur[k] - taken[k]);
    writeStock(db, target.id, left);
  } else if (result.winner === "attacker" && !target.empire_id) {
    loot = bag({
      metal: 80 + Math.floor(Math.random() * 120),
      helium: 40 + Math.floor(Math.random() * 60),
      titan: 10 + Math.floor(Math.random() * 30),
      energy: 60 + Math.floor(Math.random() * 80),
      crystal: 12 + Math.floor(Math.random() * 24),
      diamond: Math.floor(Math.random() * 4),
    });
    if (sys.remnant || sys.pirate) {
      const threat = pirates.threatOf(db);
      let prize = pirates.rollLoot(sys.pirate || threat.level, sys.pirate ? "occupation" : "raid_attack");
      prize = pirates.maybeGrantRelic(db, leadEmpire.id, prize);
      loot = addBags(loot, prize.loot);
      if (prize.ships) {
        const host = groups.reduce((a, b) => (fleetCargo(b.survivors) > fleetCargo(a.survivors) ? b : a));
        for (const [id, n] of Object.entries(prize.ships)) {
          host.survivors[id] = (host.survivors[id] || 0) + n;
          result.atkSurvivors[id] = (result.atkSurvivors[id] || 0) + n;
        }
      }
      if (prize.defenses) addDefenses(db, groups[0].fleet.origin_planet_id, prize.defenses);
      if (prize.xp) {
        for (const id of seenXp) db.prepare("UPDATE empires SET xp = IFNULL(xp,0) + ? WHERE id = ?").run(prize.xp, id);
      }
      result.prize = prize;
    }
  }

  const caps = groups.map((g) => fleetCargo(g.survivors));
  const capSum = caps.reduce((s, n) => s + n, 0) || 1;
  groups.forEach((g, i) => {
    g.loot = emptyBag();
    if (result.winner !== "attacker") return;
    for (const k of RESOURCE_IDS) g.loot[k] = Math.floor((loot[k] || 0) * (caps[i] / capSum));
  });
  if (result.winner === "attacker") {
    for (const k of RESOURCE_IDS) {
      const given = groups.reduce((s, g) => s + (g.loot[k] || 0), 0);
      const rest = (loot[k] || 0) - given;
      if (rest > 0) groups[0].loot[k] = (groups[0].loot[k] || 0) + rest;
    }
  }

  const pirateWin = result.winner === "attacker" && (sys.pirate || sys.remnant);
  const atkWon = result.winner === "attacker";
  const attackers = groups.map((g) => ({
    empireId: g.empire.id,
    name: g.empire.name,
    ships: g.ships,
    lost: g.lost,
    left: g.survivors,
    loot: g.loot,
  }));
  const names = [...new Set(attackers.map((a) => a.name))];
  const acs = groups.length > 1;
  const body = {
    text: result.prize
      ? `Schlacht gewonnen. ${result.prize.title}: ${result.prize.text}`
      : atkWon
        ? acs
          ? `Verbundschlag gewonnen (${names.join(", ")}).`
          : "Schlacht gewonnen."
        : acs
          ? `Verbundschlag verloren (${names.join(", ")}).`
          : "Schlacht verloren.",
    winner: result.winner,
    viewer: "attacker",
    youWin: atkWon,
    acs,
    attackers,
    atkShips: ships,
    defShips: merged,
    atkLost: result.atkLost,
    defLost: result.defLost,
    defLostDefense: result.defLostDefense,
    defDefense: defs,
    defLeftDefense: result.defSurvivorsDefense,
    atkLeft: result.atkSurvivors,
    defLeft: result.defSurvivors,
    atkPower: result.atkPower,
    defPower: result.defPower,
    loot,
    planet: target.name,
    planetId: target.id,
    system: sys.name,
    remnant: !!sys.remnant,
    pirate: sys.pirate || 0,
    shipsGain: result.prize?.ships || {},
    defGain: result.prize?.defenses || {},
    prizeTitle: result.prize?.title || "",
    relicId: result.prize?.relicId || null,
    shield: shieldLvl,
    owner: target.empire_id
      ? db.prepare("SELECT name FROM empires WHERE id = ?").get(target.empire_id)?.name
      : sys.remnant
        ? "Remnants"
        : "unbesetzt",
  };
  const title = pirateWin && sys.pirate
    ? `Piratenhorst: ${target.name}`
    : acs
      ? `Verbundschlag: ${target.name}`
      : `Kampfbericht: ${target.name}`;
  const reported = new Set();
  for (const g of groups) {
    if (reported.has(g.empire.id)) continue;
    reported.add(g.empire.id);
    addReport(db, g.empire.id, "combat", title, {
      ...body,
      loot: g.loot,
      youWin: atkWon,
    });
  }
  if (target.empire_id && !ownerIds.has(target.empire_id)) {
    addReport(db, target.empire_id, "combat", acs ? `Verteidigung: ${target.name} (${groups.length} Flotten)` : `Verteidigung: ${target.name}`, {
      ...body,
      viewer: "defender",
      youWin: !atkWon,
      text: atkWon
        ? acs
          ? `Planet wurde von ${names.join(", ")} geplündert.`
          : "Planet wurde geplündert."
        : acs
          ? `Verbundschlag abgewehrt (${names.join(", ")}).`
          : "Angriff abgewehrt.",
    });
  }
  for (const g of groups) launchReturn(db, g.fleet, g.survivors, g.loot || emptyBag());
}

function resolveIntercept(db, fleets) {
  if (!fleets || !fleets.length) return;
  const lead = fleets[0];
  const target = db.prepare("SELECT * FROM planets WHERE id = ?").get(lead.target_planet_id);
  if (!target) {
    for (const f of fleets) db.prepare("DELETE FROM fleets WHERE id = ?").run(f.id);
    return;
  }
  accruePlanet(db, target);
  const sys = db.prepare("SELECT * FROM systems WHERE id = ?").get(target.system_id);
  const interceptGroups = fleets.map((f) => {
    const empire = db.prepare("SELECT * FROM empires WHERE id = ?").get(f.empire_id);
    const techs = techsMap(db, f.empire_id);
    const rel = nexus.relicBonuses(nexus.equippedOf(db, f.empire_id));
    return {
      fleet: f,
      empire,
      ships: JSON.parse(f.ships || "{}"),
      techs: techsWithSpecies(techs, species.bonuses(empire.species), social.allianceBonuses(db, f.empire_id)),
      hullBonus: (rel.hull || 0) + (social.allianceBonuses(db, f.empire_id).hull || 0),
    };
  });
  const now = Date.now();
  const attackFleets = db
    .prepare(
      `SELECT * FROM fleets WHERE target_planet_id = ? AND is_return = 0 AND mission = 'attack' AND arrives_at <= ? AND empire_id != ?`
    )
    .all(target.id, now, lead.empire_id)
    .filter((f) => acsKey(db, f.empire_id) !== acsKey(db, lead.empire_id));
  const attackGroups = attackFleets.map((f) => {
    const empire = db.prepare("SELECT * FROM empires WHERE id = ?").get(f.empire_id);
    const techs = techsMap(db, f.empire_id);
    const rel = nexus.relicBonuses(nexus.equippedOf(db, f.empire_id));
    return {
      fleet: f,
      empire,
      ships: JSON.parse(f.ships || "{}"),
      techs: techsWithSpecies(techs, species.bonuses(empire.species), social.allianceBonuses(db, f.empire_id)),
      hullBonus: (rel.hull || 0) + (social.allianceBonuses(db, f.empire_id).hull || 0),
    };
  });
  const defShips = target.empire_id ? shipsMap(db, target.id) : {};
  const rem = sys.remnant ? remnantFleet(db, sys.id) : {};
  let merged = mergeShips(defShips, rem);
  const defTechs = target.empire_id ? techsMap(db, target.empire_id) : {};
  const tBuildings = target.empire_id ? buildingsMap(db, target.id) : {};
  const shieldLvl = tBuildings.shield || 0;
  const platform = (tBuildings.shield || 0) * 55 + (tBuildings.citadel || 0) * 110 + (target.directive === "fortress" ? 280 : 0);
  const defs = target.empire_id ? defensesMap(db, target.id) : {};
  const defRace = target.empire_id ? species.bonusesOf(db, target.empire_id) : {};
  const atkShipsMerged = attackGroups.reduce((m, g) => mergeShips(m, g.ships), {});
  const defShipsMerged = mergeShips(merged, interceptGroups.reduce((m, g) => mergeShips(m, g.ships), {}));
  const atkTechsMerged = attackGroups.length ? techsMap(db, attackGroups[0].fleet.empire_id) : {};
  const result = combat.simulateGroups(
    attackGroups.map((g) => ({ ships: g.ships, techs: g.techs, hullBonus: g.hullBonus })),
    defShipsMerged,
    techsWithSpecies(defTechs, defRace, target.empire_id ? social.allianceBonuses(db, target.empire_id) : null),
    defs,
    platform
  );
  attackGroups.forEach((g, i) => {
    const split = result.groups[i] || { lost: {}, survivors: {} };
    g.lost = split.lost || {};
    g.survivors = split.survivors || {};
  });
  const defenderSplit = splitShipSurvivors([defShips, ...interceptGroups.map((g) => g.ships)], result.defLost || {});
  const stationedSurvivors = defenderSplit[0] || {};
  const defenderGroups = interceptGroups.map((g, i) => {
    const survivors = defenderSplit[i + 1] || {};
    const lost = {};
    for (const [id, n] of Object.entries(g.ships)) {
      const dead = n - (survivors[id] || 0);
      if (dead > 0) lost[id] = dead;
    }
    return {
      ...g,
      lost,
      survivors,
    };
  });
  if (target.empire_id) {
    db.prepare("DELETE FROM ships WHERE planet_id = ?").run(target.id);
    addShips(db, target.id, stationedSurvivors);
    db.prepare("DELETE FROM defenses WHERE planet_id = ?").run(target.id);
    addDefenses(db, target.id, result.defSurvivorsDefense || {});
  }
  const atkWon = result.winner === "attacker";
  const attackers = attackGroups.map((g) => ({
    empireId: g.empire.id,
    name: g.empire.name,
    ships: g.ships,
    lost: g.lost,
    left: g.survivors,
    loot: {},
  }));
  const defenders = defenderGroups.map((g) => ({
    empireId: g.empire.id,
    name: g.empire.name,
    ships: g.ships,
    lost: g.lost,
    left: g.survivors,
    loot: {},
  }));
  const names = [...new Set(attackers.map((a) => a.name))];
  const defNames = [...new Set(defenders.map((d) => d.name))];
  const acs = attackGroups.length + defenderGroups.length > 1;
  const body = {
    text: atkWon
      ? acs
        ? `Verteidigung gebrochen (${names.join(", ")}).`
        : "Verteidigung gebrochen."
      : acs
        ? `Verteidigung erfolgreich (${defNames.join(", ")}).`
        : "Verteidigung erfolgreich.",
    winner: result.winner,
    viewer: "defender",
    youWin: !atkWon,
    acs,
    attackers,
    atkShips: atkShipsMerged,
    defShips: defShipsMerged,
    atkLost: result.atkLost,
    defLost: result.defLost,
    defLostDefense: result.defLostDefense,
    defDefense: defs,
    defLeftDefense: result.defSurvivorsDefense,
    atkLeft: result.atkSurvivors,
    defLeft: result.defSurvivors,
    atkPower: result.atkPower,
    defPower: result.defPower,
    planet: target.name,
    planetId: target.id,
    system: sys.name,
    remnant: !!sys.remnant,
    pirate: sys.pirate || 0,
    defGain: {},
    prizeTitle: "",
    shield: shieldLvl,
    owner: target.empire_id
      ? db.prepare("SELECT name FROM empires WHERE id = ?").get(target.empire_id)?.name
      : sys.remnant
        ? "Remnants"
        : "unbesetzt",
  };
  const title = acs ? `Verteidigung: ${target.name}` : `Verteidigung: ${target.name}`;
  const reported = new Set();
  for (const g of attackGroups) {
    if (reported.has(g.empire.id)) continue;
    reported.add(g.empire.id);
    addReport(db, g.empire.id, "combat", `Abfangkampf: ${target.name}`, {
      ...body,
      viewer: "attacker",
      youWin: atkWon,
      text: atkWon ? "Abfangverband durchbrochen." : "Angriffsflotte wurde abgefangen.",
    });
  }
  reported.clear();
  for (const g of defenderGroups) {
    if (reported.has(g.empire.id)) continue;
    reported.add(g.empire.id);
    addReport(db, g.empire.id, "combat", title, {
      ...body,
      loot: {},
      youWin: !atkWon,
    });
  }
  if (target.empire_id) {
    addReport(db, target.empire_id, "combat", acs ? `Verteidigung: ${target.name} (${defenderGroups.length} Flotten)` : `Verteidigung: ${target.name}`, {
      ...body,
      viewer: "defender",
      youWin: !atkWon,
      text: atkWon
        ? acs
          ? `Orbit gebrochen (${names.join(", ")}).`
          : "Orbit gebrochen."
        : acs
          ? `Angriff abgewehrt (${defNames.join(", ")}).`
          : "Angriff abgewehrt.",
    });
  }
  for (const g of attackGroups) launchReturn(db, g.fleet, g.survivors, {});
  for (const g of defenderGroups) launchReturn(db, g.fleet, g.survivors, {});
}

function resolveColonize(db, fleet, ships, target, sys, techs, empire) {
  const colony = ships.colony || 0;
  if (target.empire_id) {
    addReport(db, fleet.empire_id, "fleet", `Kolonisation von ${target.name} gescheitert`, {
      text: "Planet bereits beansprucht.",
    });
    launchReturn(db, fleet, ships, {});
    return;
  }
  if (sys.remnant) {
    addReport(db, fleet.empire_id, "fleet", `Kolonisation von ${target.name} gescheitert`, {
      text: "Remnant-Wache blockiert das System. Erst angreifen.",
    });
    launchReturn(db, fleet, ships, {});
    return;
  }
  if (colony < 1) {
    launchReturn(db, fleet, ships, {});
    return;
  }
  const asAlliance = fleet.mission === "ally_colonize";
  const mine = asAlliance ? social.myAlliance(db, empire.id) : null;
  if (asAlliance) {
    if (!mine || !social.canDo(mine.myRank, "planet")) {
      addReport(db, fleet.empire_id, "fleet", `Allianz-Kolonisation abgebrochen`, {
        text: "Nur Anführer oder Co-Leader können einen Allianz-Planeten besiedeln.",
      });
      launchReturn(db, fleet, ships, {});
      return;
    }
    if (social.alliancePlanetRow(db, mine.id)) {
      addReport(db, fleet.empire_id, "fleet", `Allianz-Kolonisation abgebrochen`, {
        text: "Die Allianz hat bereits einen Planeten.",
      });
      launchReturn(db, fleet, ships, {});
      return;
    }
  } else {
    const owned = personalPlanetCount(db, empire.id);
    if (owned >= maxPlanets(techs.colonization, techs.astrophysics)) {
      addReport(db, fleet.empire_id, "fleet", `Kolonisation abgebrochen`, {
        text: "Planet-Limit erreicht. Erforsche Kolonisation weiter.",
      });
      launchReturn(db, fleet, ships, {});
      return;
    }
  }
  const left = { ...ships, colony: colony - 1 };
  if (left.colony <= 0) delete left.colony;
  if (asAlliance) {
    db.prepare(
      "UPDATE planets SET empire_id = ?, alliance_id = ?, metal = 520, helium = 320, titan = 120, energy = 520, crystal = 110, diamond = 6, last_tick = ?, founded_at = ? WHERE id = ?"
    ).run(mine.leader_id || empire.id, mine.id, now(), now(), target.id);
    setBuilding(db, target.id, "command", 1);
    addReport(db, fleet.empire_id, "colony", `${target.name} als Allianz-Planet kolonisiert`, {
      text: `Neue Welt für [${mine.tag}]. Führung und gewählte Mitglieder bauen über das Allianz-Menü.`,
    });
  } else {
    db.prepare(
      "UPDATE planets SET empire_id = ?, metal = 360, helium = 220, titan = 80, energy = 360, crystal = 70, diamond = 4, last_tick = ?, founded_at = ? WHERE id = ?"
    ).run(empire.id, now(), now(), target.id);
    setBuilding(db, target.id, "command", 1);
    addReport(db, fleet.empire_id, "colony", `${target.name} kolonisiert`, {
      text: "Neue Welt dem Imperium einverleibt.",
    });
  }
  if (Object.values(left).some((n) => n > 0)) launchReturn(db, fleet, left, {});
  else db.prepare("DELETE FROM fleets WHERE id = ?").run(fleet.id);
}

function sendFleet(db, empire, origin, target, mission, shipsWanted, cargo, opts = {}) {
  if (!MISSIONS_OK[mission]) throw new Error("Unbekannte Mission.");
  if (origin.id === target.id && mission !== "expedition") throw new Error("Ziel darf nicht der Startplanet sein.");
  origin = accruePlanet(db, origin);
  const stationed = shipsMap(db, origin.id);
  const ships = {};
  let any = false;
  for (const [id, raw] of Object.entries(shipsWanted || {})) {
    const n = Math.max(0, raw | 0);
    if (!n) continue;
    if (!SHIPS[id]) throw new Error("Unbekanntes Schiff.");
    if ((stationed[id] || 0) < n) throw new Error(`Nicht genug ${SHIPS[id].name}.`);
    ships[id] = n;
    any = true;
  }
  if (!any) throw new Error("Keine Schiffe ausgewählt.");
  const techs = techsMap(db, empire.id);
  const hops = shortestHops(db, origin.system_id, target.system_id);
  const originBuild = buildingsMap(db, origin.id);
  if (hops > hopsAllowed(techs, originBuild)) {
    throw new Error("Ziel außerhalb der Warp-Reichweite. Erforsche Warp/Hyperspace oder baue ein Sprungtor.");
  }
  if (mission === "attack" && target.empire_id === empire.id) throw new Error("Eigene Welten kann man nicht angreifen.");
  if (mission === "attack" && target.alliance_id) {
    const mine = social.myAlliance(db, empire.id);
    if (mine && mine.id === target.alliance_id) throw new Error("Allianz-Planeten der eigenen Allianz kann man nicht angreifen.");
  }
  if (mission === "attack" && target.empire_id && target.empire_id !== empire.id) {
    const victim = db.prepare("SELECT * FROM empires WHERE id = ?").get(target.empire_id);
    fairplay.assertCanAttack(db, empire, victim);
  }
  const targetAlly = target.alliance_id && social.canUseAlliancePlanet(db, empire.id, target);
  const targetAllyManage = target.alliance_id && social.canManageAlliancePlanet(db, empire.id, target);
  const ownTarget = target.empire_id === empire.id && !target.alliance_id;
  const ownOrAllyTarget = ownTarget || targetAlly;
  if (mission === "deploy" && !ownOrAllyTarget) throw new Error("Stationieren nur auf eigenen oder Allianz-Planeten.");
  if (mission === "deploy" && target.alliance_id) {
    const sent = Object.values(ships).reduce((sum, n) => sum + Number(n || 0), 0);
    const stationed = Object.values(shipsMap(db, target.id)).reduce((sum, n) => sum + Number(n || 0), 0);
    const cap = shipCap(db, target.id);
    if (stationed + sent > cap) throw new Error(`Allianz-Flottenlimit erreicht (${stationed}/${cap}).`);
  }
  if (mission === "transport" && !ownOrAllyTarget) throw new Error("Fracht senden nur zu eigenen oder Allianz-Planeten.");
  if (mission === "collect" && !(ownTarget || targetAllyManage)) throw new Error("Rücktransport aus dem Allianzlager ist nur mit Lagerzugang möglich.");
  if (mission === "colonize" || mission === "ally_colonize") {
    if ((ships.colony || 0) < 1) throw new Error("Kolonieschiff erforderlich.");
    if (target.empire_id) throw new Error("Planet ist bereits besetzt.");
    if ((originBuild.colony_dock || 0) < 1) throw new Error("Kolonialdock am Startplaneten nötig.");
  }
  if (mission === "ally_colonize") {
    const mine = social.myAlliance(db, empire.id);
    if (!mine) throw new Error("Du bist in keiner Allianz.");
    if (!social.canDo(mine.myRank, "planet")) throw new Error("Nur Anführer oder Co-Leader besiedeln Allianz-Planeten.");
    if (social.alliancePlanetRow(db, mine.id)) throw new Error("Die Allianz hat bereits einen Planeten.");
  }
  if (mission === "spy") {
    if ((ships.probe || 0) < 1) throw new Error("Mindestens eine Sonde nötig.");
    const spyLvl = bestBuilding(db, empire.id, "spy_center");
    if (spyLvl < 1) throw new Error("Spionagezentrum erforderlich, bevor Sonden fliegen.");
  }
  if (mission === "expedition") {
    const active = db.prepare("SELECT COUNT(*) AS n FROM fleets WHERE empire_id = ? AND mission = 'expedition'").get(empire.id).n;
    if (active >= 3) throw new Error("Maximal 3 Expeditionen gleichzeitig.");
  }
  if (mission === "salvage") {
    const d = db.prepare("SELECT id FROM debris WHERE planet_id = ?").get(target.id);
    if (!d) throw new Error("Kein Trümmerfeld an diesem Planeten.");
  }
  if (mission === "intercept") {
    const ownOrAlly = target.empire_id === empire.id || (target.empire_id && acsKey(db, empire.id) === acsKey(db, target.empire_id));
    if (!ownOrAlly) throw new Error("Verteidigung nur auf eigenen oder verbündeten Planeten.");
    const threats = db.prepare(
      `SELECT f.* FROM fleets f WHERE f.target_planet_id = ? AND f.is_return = 0 AND f.mission = 'attack' AND f.empire_id != ? AND f.arrives_at > ?`
    ).all(target.id, empire.id, now()).filter((f) => acsKey(db, empire.id) !== acsKey(db, f.empire_id));
    if (!threats.length) throw new Error("Keine feindliche Flotte im Anflug.");
  }
  const fuelNeeded = mission === "expedition" ? 0 : fleetFuelCost(ships, hops, worldEconomy(db).fuel);
  if (fuelNeeded > 0 && (origin.helium || 0) < fuelNeeded) {
    throw new Error(`Nicht genug Helium-3. Benötigt: ${fuelNeeded}.`);
  }
  if (fuelNeeded > 0) {
    db.prepare("UPDATE planets SET helium = helium - ? WHERE id = ?").run(fuelNeeded, origin.id);
    origin.helium = (origin.helium || 0) - fuelNeeded;
  }

  let haul = emptyBag();
  if (mission === "transport") {
    const cur = stockBag(origin);
    for (const k of RESOURCE_IDS) haul[k] = clamp(Number(cargo?.[k]) || 0, 0, cur[k]);
    const cap = fleetCargo(ships);
    if (bagSum(haul) > cap) throw new Error("Frachtkapazität überschritten.");
    spend(db, origin, haul);
  } else if (mission === "collect") {
    // Collect: fleet travels empty to target, loads cargo there, returns to origin
    haul = emptyBag();
  }

  for (const [id, n] of Object.entries(ships)) {
    db.prepare("UPDATE ships SET count = count - ? WHERE planet_id = ? AND ship_id = ?").run(n, origin.id, id);
  }
  db.prepare("DELETE FROM ships WHERE planet_id = ? AND count <= 0").run(origin.id);

  const t = now();
  const plan = mission === "expedition" ? null : travelPlan(db, origin, target, ships, techs);
  const flight = mission === "expedition" ? TICK_MS : plan.ms;
  let hold = Math.max(0, Math.min(ACS_HOLD_MAX_MS, Number(opts.holdMs) || 0));
  hold = msToTicks(hold) * TICK_MS;
  const joinId = Number(opts.joinFleetId) || 0;
  const natural = alignToTick(t + flight);
  if (mission === "attack" && joinId) {
    const mate = db.prepare("SELECT * FROM fleets WHERE id = ? AND is_return = 0 AND mission = 'attack'").get(joinId);
    if (!mate) throw new Error("Dieser Schlag existiert nicht mehr.");
    if (mate.target_planet_id !== target.id) throw new Error("Beitritt nur zum selben Ziel.");
    if (acsKey(db, mate.empire_id) !== acsKey(db, empire.id)) {
      throw new Error("Verbundschlag nur mit der eigenen Allianz (oder eigenen Flotten).");
    }
    const wave = db
      .prepare(
        `SELECT COUNT(*) AS n FROM fleets
         WHERE target_planet_id = ? AND is_return = 0 AND mission = 'attack' AND arrives_at BETWEEN ? AND ?`
      )
      .get(target.id, tickStart(mate.arrives_at), tickStart(mate.arrives_at) + TICK_MS - 1).n;
    if (wave >= ACS_MAX_FLEETS) throw new Error("Dieser Schlag ist voll (max. 8 Flotten).");
    if (tickStart(natural) > tickStart(mate.arrives_at)) {
      throw new Error("Deine Flotte kommt erst im nächsten Tick. Schnellere Schiffe, Warp oder näherer Planet.");
    }
    hold = Math.max(hold, Math.max(0, mate.arrives_at - natural));
  }
  if (mission !== "attack" && mission !== "intercept") hold = 0;
  const eta = natural + hold;
  if (mission === "attack" && target.empire_id && target.empire_id !== empire.id) {
    fairplay.logAttack(db, empire.id, target.empire_id);
  }
  const MISSION_LABELS = { attack: "Angriff", spy: "Spionage", transport: "Fracht senden", collect: "Fracht abholen", deploy: "Stationiert", colonize: "Kolonisation", ally_colonize: "Allianz-Kolonie", expedition: "Expedition", salvage: "Trümmerbergung", intercept: "Verteidigen" };
  const missionLabel = MISSION_LABELS[mission] || mission;
  const shipLabel = Object.entries(ships).map(([id, n]) => `${n}× ${SHIPS[id]?.name || id}`).join(", ");
  addReport(db, empire.id, "fleet", `${missionLabel} gestartet`, {
    text: `${shipLabel} · Treibstoff ${fuelNeeded} Helium-3 · Ankunft ${new Date(eta).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`,
    originPlanetId: origin.id,
    planetId: origin.id,
    jumps: [
      { view: "fleets", label: "Zur Flotte" },
      { view: "galaxy", label: "Zur Galaxie" },
    ],
  });
  const info = db
    .prepare(
      `INSERT INTO fleets(empire_id, origin_planet_id, target_planet_id, mission, ships, cargo, cargo_matter, cargo_energy, cargo_data, departed_at, arrives_at, is_return, hold_ms)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?)`
    )
    .run(
      empire.id,
      origin.id,
      target.id,
      mission,
      JSON.stringify(ships),
      JSON.stringify(haul),
      haul.metal,
      haul.energy,
      haul.crystal,
      t,
      eta,
      hold
    );
  return { fleetId: Number(info.lastInsertRowid), arrivesAt: eta, holdMs: hold, flightMs: flight };
}

const MISSIONS_OK = { attack: 1, spy: 1, transport: 1, collect: 1, deploy: 1, colonize: 1, ally_colonize: 1, expedition: 1, salvage: 1, intercept: 1 };

function claimQuest(db, empire, planet, questId) {
  const c = progress.claimContract(db, empire, planet, questId);
  if (planet) {
    credit(db, planet, c.reward);
    if (c.ships) addShips(db, planet.id, c.ships);
  }
  return c;
}

function runActivity(db, empire, planet, kind, durationId) {
  planet = accruePlanet(db, planet);
  const spec = activity.KINDS[kind];
  if (!spec) throw new Error("Unbekannter Einsatz.");
  const energy = activity.energyCost(kind, durationId);
  if (energy) {
    const cost = emptyBag();
    cost.energy = energy;
    if (!canAfford(planet, cost)) throw new Error(`${energy} Energie für diesen Einsatz.`);
    spend(db, planet, cost);
  }
  return activity.start(db, empire, planet, kind, durationId);
}

function enqueueAllianceResearch(db, empire, planet, researchId) {
  if (!planet?.alliance_id) throw new Error("Allianzforschung nur auf dem Allianz-Planeten.");
  if (!social.canManageAlliancePlanet(db, empire.id, planet)) throw new Error("Kein Zugang zum Allianz-Planeten.");
  const def = social.ALLIANCE_RESEARCH[researchId];
  if (!def) throw new Error("Allianzforschung unbekannt.");
  if (queueBusy(db, "ally_research", empire.id, planet.id)) throw new Error("Allianzforschung läuft bereits.");
  db.prepare("INSERT OR IGNORE INTO alliance_research(alliance_id, research_id) VALUES(?, ?)").run(planet.alliance_id, def.id);
  const row = db.prepare("SELECT * FROM alliance_research WHERE alliance_id = ? AND research_id = ?").get(planet.alliance_id, def.id);
  const level = row.level || 0;
  if (level >= def.max) throw new Error("Diese Allianzforschung ist bereits abgeschlossen.");
  const mul = def.factor ** Math.max(0, level);
  const remaining = emptyBag();
  for (const id of RESOURCE_IDS) {
    const need = Math.floor((def.cost[id] || 0) * mul);
    remaining[id] = Math.max(0, need - Number(row[id] || 0));
  }
  planet = accruePlanet(db, planet);
  if (!canAfford(planet, remaining)) throw new Error("Nicht genug Ressourcen auf dem Allianz-Planeten.");
  if (RESOURCE_IDS.every((id) => !remaining[id])) throw new Error("Bereits vollständig finanziert. Spenden schließen die Stufe ab.");
  spend(db, planet, remaining);
  const t = now();
  const dur = scaledTime(def.baseTime || 240, def.factor, level, researchSpeed(db, empire.id));
  db.prepare(
    "INSERT INTO queue(empire_id, planet_id, kind, item_id, qty, level_to, started_at, completes_at) VALUES(?,?,?,?,?,?,?,?)"
  ).run(empire.id, planet.id, "ally_research", def.id, 1, level + 1, t, t + dur * 1000);
  return { completesAt: t + dur * 1000, cost: remaining, duration: dur };
}

function claimDailyOp(db, empire, planet, opId) {
  const c = progress.claimOp(db, empire, planet, opId);
  if (planet) {
    credit(db, planet, c.reward);
    if (c.ships) addShips(db, planet.id, c.ships);
  }
  return c;
}

function claimWeeklyOp(db, empire, planet, opId) {
  const c = progress.claimWeekly(db, empire, planet, opId);
  if (planet) {
    credit(db, planet, c.reward);
    if (c.ships) addShips(db, planet.id, c.ships);
  }
  return c;
}

function exchangeMarket(db, planet, give, get, amount) {
  give = String(give || "");
  get = String(get || "");
  amount = Math.max(1, Math.floor(Number(amount) || 0));
  if (!RESOURCE_IDS.includes(give) || !RESOURCE_IDS.includes(get) || give === get) {
    throw new Error("Ungültiges Tauschpaar.");
  }
  planet = accruePlanet(db, planet);
  const rates = economy.getPrices(db).rates;
  const got = economy.quote(rates, give, get, amount);
  if (got < 1) throw new Error("Menge zu klein.");
  const cost = emptyBag();
  cost[give] = amount;
  if (!canAfford(planet, cost)) throw new Error("Nicht genug zum Tauschen.");
  spend(db, planet, cost);
  const gain = emptyBag();
  gain[get] = got;
  credit(db, planet, gain);
  economy.nudge(db, give, get);
  return { give, get, amount, got };
}

function pickColor(db) {
  const used = new Set(db.prepare("SELECT color FROM empires").all().map((r) => r.color));
  return EMPIRE_COLORS.find((c) => !used.has(c)) || EMPIRE_COLORS[Math.floor(Math.random() * EMPIRE_COLORS.length)];
}

function assignHome(db, empireId, empireName) {
  const candidates = db
    .prepare(
      `SELECT s.id FROM systems s
       WHERE s.remnant = 0 AND s.is_hub = 0 AND IFNULL(s.pirate,0) = 0
         AND NOT EXISTS (SELECT 1 FROM planets p WHERE p.system_id = s.id AND p.empire_id IS NOT NULL)
       ORDER BY (s.x-600)*(s.x-600)+(s.y-600)*(s.y-600) DESC`
    )
    .all();
  let sysId = candidates[0]?.id;
  if (!sysId) {
    const any = db
      .prepare(
        `SELECT s.id FROM systems s
         WHERE NOT EXISTS (SELECT 1 FROM planets p WHERE p.system_id = s.id AND p.empire_id IS NOT NULL)
         ORDER BY s.remnant ASC, (s.x-600)*(s.x-600)+(s.y-600)*(s.y-600) DESC`
      )
      .get();
    sysId = any?.id;
    if (sysId) {
      db.prepare("UPDATE systems SET remnant = 0 WHERE id = ?").run(sysId);
      setRemnantFleet(db, sysId, {});
    }
  }
  if (!sysId) throw new Error("Galaxie ist voll. Kein freies System.");
  const planet = db
    .prepare(
      `SELECT * FROM planets WHERE system_id = ? AND empire_id IS NULL
       ORDER BY CASE type WHEN 'terran' THEN 0 WHEN 'ocean' THEN 1 WHEN 'desert' THEN 2 ELSE 3 END, size DESC`
    )
    .get(sysId);
  const t = now();
  db.prepare(
    "UPDATE planets SET empire_id = ?, name = ?, metal = 1600, helium = 900, titan = 280, energy = 1600, crystal = 380, diamond = 18, last_tick = ? WHERE id = ?"
  ).run(empireId, `${empireName} Prime`, t, planet.id);
  setBuilding(db, planet.id, "command", 1);
  setBuilding(db, planet.id, "matter_mine", 1);
  setBuilding(db, planet.id, "energy_array", 1);
  setBuilding(db, planet.id, "helium_well", 1);
  setBuilding(db, planet.id, "shipyard", 1);
  setBuilding(db, planet.id, "spy_center", 1);
  addShips(db, planet.id, { probe: 2, fighter: 2 });
  addDefenses(db, planet.id, { flak: 4, missile: 1 });
  db.prepare("UPDATE empires SET last_planet_id = ? WHERE id = ?").run(planet.id, empireId);
  addReport(db, empireId, "lore", "Willkommen im Stellar Nexus", {
    text: "Dein Kommando-Nexus steht. Ein Spionagezentrum ist online — Sonden starten nur von dort. Baue Extraktoren aus, errichte Werft und Archiv, erforsche Warp und Kolonisation. Die erste Extra-Kolonie ist machbar, jede weitere wird deutlich teurer.",
  });
  return planet.id;
}

function countAffordable(kind, db, empire, planet, buildings, techs) {
  if (!planet) return 0;
  if (queueBusy(db, kind, empire.id, planet.id)) return 0;
  let n = 0;
  if (kind === "building") {
    for (const spec of Object.values(BUILDINGS)) {
      if (!meetsReq(spec.requires, buildings, techs)) continue;
      const level = buildings[spec.id] || 0;
      if (level >= spec.max) continue;
      if (canAfford(planet, scaledCost(spec.baseCost, spec.factor, level))) n += 1;
    }
  } else if (kind === "research") {
    if ((buildings.archive || 0) < 1) return 0;
    for (const spec of Object.values(TECHS)) {
      if (!meetsReq(spec.requires, buildings, techs)) continue;
      const level = techs[spec.id] || 0;
      if (level >= spec.max) continue;
      if (canAfford(planet, scaledCost(spec.baseCost, spec.factor, level))) n += 1;
    }
  } else if (kind === "ship") {
    for (const spec of Object.values(SHIPS)) {
      if (!meetsReq(spec.requires, buildings, techs)) continue;
      if (spec.premium && !empire[spec.premium]) continue;
      if (canAfford(planet, spec.cost)) n += 1;
    }
  } else if (kind === "defense") {
    for (const spec of Object.values(DEFENSES)) {
      if (!meetsReq(spec.requires, buildings, techs)) continue;
      if (canAfford(planet, spec.cost)) n += 1;
    }
  }
  return n;
}

function storageAlerts(planet) {
  if (!planet) return 0;
  let n = 0;
  const cap = planet.storage;
  for (const k of RESOURCE_IDS) {
    const c = typeof cap === "object" ? cap[k] : cap;
    const v = planet[k] || 0;
    if (c && v / Math.max(1, c) >= 0.92) n += 1;
  }
  return n;
}

function buildHints({
  planet,
  empire,
  db,
  techs,
  ops,
  weekly,
  contracts,
  activities,
  unread,
  unreadChat,
  incoming,
  debrisHere,
  allianceActivity,
}) {
  const buildings = planet?.buildings || {};
  const dailyOpen = (ops || []).filter((o) => !o.claimed).length;
  const dailyReady = (ops || []).filter((o) => o.complete && !o.claimed).length;
  const weeklyOpen = (weekly || []).filter((o) => !o.claimed).length;
  const weeklyReady = (weekly || []).filter((o) => o.complete && !o.claimed).length;
  const campaignReady = (contracts || []).filter((c) => c.complete && !c.claimed).length;
  const campaignOpen = (contracts || []).some((c) => !c.claimed && !c.locked) ? 1 : 0;
  const actReady = (activities || []).filter((a) => a.ready).length;
  const incomingN = (incoming || []).length;
  const infra = planet ? countAffordable("building", db, empire, planet, buildings, techs) : 0;
  const research = planet ? countAffordable("research", db, empire, planet, buildings, techs) : 0;
  const yard = planet ? countAffordable("ship", db, empire, planet, buildings, techs) : 0;
  const defense = planet ? countAffordable("defense", db, empire, planet, buildings, techs) : 0;
  const economy = storageAlerts(planet);
  const nexus = empire.nexDailyReady ? 1 : 0;
  const command = dailyOpen + weeklyOpen + campaignReady;
  const allianceN = (allianceActivity?.attacks?.length || 0) + (allianceActivity?.defenses?.length || 0);
  return {
    command,
    daily: dailyOpen,
    dailyReady,
    weekly: weeklyOpen,
    weeklyReady,
    campaign: campaignReady + (campaignReady ? 0 : campaignOpen),
    economy,
    infra: infra ? 1 : 0,
    infraN: infra,
    yard: yard ? 1 : 0,
    defense: defense ? 1 : 0,
    research: research ? 1 : 0,
    nexus,
    galaxy: incomingN + (debrisHere ? 1 : 0),
    fleets: incomingN,
    activity: actReady,
    reports: unread || 0,
    chat: unreadChat || 0,
    alliance: allianceN,
  };
}

function planetView(db, planet, empire) {
  const buildings = buildingsMap(db, planet.id);
  const techs = techsMap(db, empire.id);
  const hub = hubBonus(db, empire.id, techs);
  const race = species.bonuses(empire.species);
  const mods = {
    rel: nexus.relicBonuses(nexus.equippedOf(db, empire.id)),
    dir: planet.directive || "",
    spec: race,
    ally: social.allianceBonuses(db, empire.id),
    worldProd: worldEconomy(db).prod,
  };
  const prod = planet.alliance_id ? emptyBag() : calcProd(planet, buildings, techs, hub, progress.productionBonus(empire.xp || 0), mods);
  const cap = planet.alliance_id ? allianceStorageCap() : calcStorage(buildings.silo || 0, buildings.habitat || 0, race.storage);
  const sys = db.prepare("SELECT * FROM systems WHERE id = ?").get(planet.system_id);
  const stationed = shipsMap(db, planet.id);
  const shipCount = Object.values(stationed).reduce((s, n) => s + n, 0);
  return {
    id: planet.id,
    name: planet.name,
    type: planet.type,
    typeName: PLANET_TYPES[planet.type]?.name || planet.type,
    size: planet.size,
    systemId: sys.id,
    systemName: sys.name,
    starType: sys.star_type,
    isHub: !!sys.is_hub,
    remnant: !!sys.remnant,
    directive: planet.directive || "",
    focus: PLANET_TYPES[planet.type]?.focus || "",
    specActive: !!(PLANET_TYPES[planet.type]?.focus && buildings[Object.values(BUILDINGS).find((b) => b.resource === PLANET_TYPES[planet.type]?.focus)?.id] >= 2),
    ...stockBag(planet),
    lastTick: planet.last_tick,
    production: prod,
    storage: cap,
    buildings,
    ships: stationed,
    defenses: defensesMap(db, planet.id),
    hubBonus: hub,
    multipliers: PLANET_TYPES[planet.type]?.multipliers || {},
    shipCount,
    shipCap: shipCap(db, planet.id),
    shipCapBoostUntil: empire.ship_cap_boost_until || 0,
    pirateShieldUntil: planet.founded_at ? planet.founded_at + 3 * 60 * 60 * 1000 : 0,
    allianceId: planet.alliance_id || 0,
    isAlliance: !!planet.alliance_id,
    allianceTag: planet.alliance_id
      ? db.prepare("SELECT tag FROM alliances WHERE id = ?").get(planet.alliance_id)?.tag || ""
      : "",
  };
}

function snapshot(db, user, planetId) {
  tickWorld(db);
  const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(user.id);
  const personal = db.prepare("SELECT * FROM planets WHERE empire_id = ? AND IFNULL(alliance_id, 0) = 0 ORDER BY id").all(empire.id);
  const allyPlanets = social.accessibleAlliancePlanets(db, empire.id);
  const seen = new Set();
  const planets = [];
  for (const p of [...personal, ...allyPlanets]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    planets.push(p);
  }
  for (const p of planets) accruePlanet(db, p);
  const fresh = planets.map((p) => db.prepare("SELECT * FROM planets WHERE id = ?").get(p.id)).filter(Boolean);
  let focus = planetId || empire.last_planet_id || fresh[0]?.id;
  if (!fresh.some((p) => p.id === focus)) focus = fresh[0]?.id;
  if (focus && focus !== empire.last_planet_id) {
    db.prepare("UPDATE empires SET last_planet_id = ? WHERE id = ?").run(focus, empire.id);
  }
  const planet = fresh.find((p) => p.id === focus);
  const techs = techsMap(db, empire.id);
  const queue = db
    .prepare("SELECT q.*, p.name AS planet_name FROM queue q LEFT JOIN planets p ON p.id = q.planet_id WHERE q.empire_id = ? ORDER BY q.completes_at")
    .all(empire.id)
    .map((q) => ({
      id: q.id,
      kind: q.kind,
      itemId: q.item_id,
      name:
        q.kind === "building"
          ? BUILDINGS[q.item_id]?.name
          : q.kind === "ship"
            ? SHIPS[q.item_id]?.name
            : q.kind === "defense"
              ? DEFENSES[q.item_id]?.name
              : q.kind === "ally_research"
                ? social.ALLIANCE_RESEARCH[q.item_id]?.name
                : TECHS[q.item_id]?.name,
      qty: q.qty,
      levelTo: q.level_to,
      planetId: q.planet_id,
      planetName: q.planet_name || "Unbekannte Welt",
      startedAt: q.started_at,
      completesAt: q.completes_at,
    }));
  const fleets = db
    .prepare("SELECT * FROM fleets WHERE empire_id = ? ORDER BY arrives_at")
    .all(empire.id)
    .map((f) => {
      const tp = db.prepare("SELECT name FROM planets WHERE id = ?").get(f.target_planet_id);
      const op = db.prepare("SELECT name FROM planets WHERE id = ?").get(f.origin_planet_id);
      return {
        id: f.id,
        mission: f.mission,
        returning: !!f.is_return,
        ships: JSON.parse(f.ships),
        originName: op?.name,
        targetName: tp?.name,
        originPlanetId: f.origin_planet_id,
        targetPlanetId: f.target_planet_id,
        departedAt: f.departed_at,
        arrivesAt: f.arrives_at,
        holdMs: f.hold_ms || 0,
      };
    });
  const fleetColonies = fresh.map((p) => {
    const ships = shipsMap(db, p.id);
    return { id: p.id, name: p.name, ships, total: Object.values(ships).reduce((sum, n) => sum + Number(n || 0), 0) };
  });
  const fleetAudit = {
    stationed: fleetColonies.reduce((sum, p) => sum + p.total, 0),
    inTransit: fleets.reduce((sum, f) => sum + Object.values(f.ships || {}).reduce((n, count) => n + Number(count || 0), 0), 0),
    colonies: fleetColonies,
    ledger: db.prepare(`
      SELECT l.id,l.planet_id AS planetId,l.ship_id AS shipId,l.before_count AS beforeCount,
             l.after_count AS afterCount,l.cause,l.report_id AS reportId,l.created_at AS createdAt,
             COALESCE(p.name,'Unbekannter Planet') AS planetName
      FROM fleet_ledger l LEFT JOIN planets p ON p.id=l.planet_id
      WHERE l.empire_id=? ORDER BY l.id DESC LIMIT 60
    `).all(empire.id),
    recent: db.prepare("SELECT id, kind, title, body, created_at FROM reports WHERE empire_id = ? AND kind IN ('combat','expedition') ORDER BY id DESC LIMIT 8").all(empire.id).map((row) => {
      let body = {};
      try { body = JSON.parse(row.body || "{}"); } catch { body = {}; }
      const losses = reportShipLosses(body, empire.id);
      return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        text: body.text || "",
        createdAt: row.created_at,
        losses,
        totalLost: Object.values(losses).reduce((sum, count) => sum + Math.max(0, Number(count || 0)), 0),
      };
    }),
  };
  const unreadReports = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE empire_id = ? AND seen = 0").get(empire.id).n;
  const unreadMail = chat.unreadMail(db, empire.id);
  const unreadChat = chat.unreadChat(db, empire);
  const unread = unreadReports + unreadMail;
  const owned = personalPlanetCount(db, empire.id);
  const daily = progress.applyDaily(db, empire, planet);
  if (daily && planet) credit(db, planet, daily.reward);
  let empireFresh = db.prepare("SELECT * FROM empires WHERE id = ?").get(empire.id);
  const awarded = progress.awardMedals(db, empireFresh, planet);
  if (awarded.length) {
    empireFresh = db.prepare("SELECT * FROM empires WHERE id = ?").get(empire.id);
    for (const m of awarded) {
      addReport(db, empire.id, "medal", `Medaille: ${m.title}`, {
        text: `${m.tierName}-Medaille. ${m.blurb}`,
        medalId: m.id,
        image: m.image,
      });
    }
  }
  const contracts = progress.listContracts(db, empireFresh, planet);
  const ops = progress.listOps(db, empireFresh, planet);
  const weekly = progress.listWeekly(db, empireFresh, planet);
  const score = progress.empireScore(db, empire.id);
  const prog = progress.progressData(db, empireFresh, planet);
  const debrisHere = planet
    ? db.prepare("SELECT COUNT(*) AS n FROM debris WHERE planet_id = ?").get(planet.id).n
    : 0;
  db.prepare("UPDATE empires SET last_seen = ? WHERE id = ?").run(Date.now(), empire.id);
  const planetV = planet ? planetView(db, planet, empire) : null;
  const activitiesDesk = activity.desk(db, empireFresh);
  const incoming = incomingThreats(db, empire.id);
  const nexDailyReady = (empireFresh.last_nex || "") !== species.todayKey();
  const mine = social.myAlliance(db, empire.id);
  const allianceActivity = mine ? social.listAllianceActivity(db, mine.id) : { attacks: [], defenses: [] };
  const hints = buildHints({
    planet: planetV,
    empire: { ...empireFresh, nexDailyReady },
    db,
    techs,
    ops,
    weekly,
    contracts,
    activities: activitiesDesk,
    unread,
    unreadChat,
    incoming,
    debrisHere,
    allianceActivity,
  });
  return {
    now: now(),
    user: {
      id: user.id,
      username: user.username,
      isAdmin: !!user.is_admin,
      isMod: !!user.is_mod,
      canMod: !!(user.is_admin || user.is_mod),
    },
    empire: {
      id: empire.id,
      name: empire.name,
      color: empire.color,
      planetCount: owned,
      planetCap: maxPlanets(techs.colonization, techs.astrophysics),
      createdAt: empire.created_at,
      xp: empireFresh.xp || 0,
      level: progress.commanderLevel(empireFresh.xp || 0),
      prodBonus: progress.productionBonus(empireFresh.xp || 0),
      streak: empireFresh.streak || 0,
      score,
      avatar: social.avatarUrl(empireFresh),
      avatarKey: empireFresh.avatar || "a1",
      sound: empireFresh.sound !== 0,
      notify: !!empireFresh.notify,
      locale: empireFresh.locale || "de",
      translate: empireFresh.translate !== 0,
      newbie: isNewbie(empireFresh, db),
      newbieLeft: newbieLeft(empireFresh.created_at, db),
      species: empireFresh.species || "terran",
      nex: empireFresh.nex || 0,
      lastSpecies: empireFresh.last_species || 0,
      lastNex: empireFresh.last_nex || "",
      nexDailyReady,
      vip: premium.publicVip(empireFresh, db),
      signet: !!empireFresh.signet,
      aeonUnlock: !!empireFresh.aeon_unlock,
      helixUnlock: !!empireFresh.helix_unlock,
      shipCapBoostUntil: empireFresh.ship_cap_boost_until || 0,
      shipCapBonus: empireFresh.ship_cap_bonus || 0,
      raidLevel: pirates.raidLevelFor(db, empireFresh),
      title: prog.title,
    },
    species: species.of(empireFresh.species),
    speciesList: species.publicList(),
    nexShop: premium.publicShop(db),
    world: (() => {
      const w = require("./settings").get(db);
      return {
        announcement: w.announcement || "",
        maintenance: !!w.maintenance,
        registrationOpen: w.registrationOpen !== false,
      };
    })(),
    langs: chat.LANGS,
    unreadMail,
    unreadChat,
    alliance: (() => {
      const mine = social.myAlliance(db, empire.id);
      if (!mine) return null;
      const ap = social.alliancePlanetRow(db, mine.id);
      return {
        id: mine.id,
        tag: mine.tag,
        name: mine.name,
        color: mine.color,
        rank: mine.myRank,
        canColonizePlanet: social.canDo(mine.myRank, "planet") && !ap,
        canManagePlanet: !!(ap && social.canManageAlliancePlanet(db, empire.id, ap)),
        planet: ap ? { id: ap.id, name: ap.name, systemId: ap.system_id } : null,
        bonuses: social.allianceBonuses(db, empire.id),
        research: social.researchRows(db, mine.id, empire.id),
      };
    })(),
    avatars: social.AVATAR_PRESETS,
    activities: activitiesDesk,
    contracts,
    weekly,
    nextAction: progress.nextAction(contracts),
    progress: prog,
    bookmarks: db.prepare("SELECT planet_id AS planetId, system_id AS systemId, label, created_at AS createdAt FROM planet_bookmarks WHERE empire_id = ? ORDER BY created_at DESC").all(empire.id),
    daily,
    debrisHere,
    planet: planetV,
    planets: fresh.map((p) => {
      const b = buildingsMap(db, p.id);
      const prod = p.alliance_id ? emptyBag() : calcProd(
        p,
        b,
        techs,
        hubBonus(db, empire.id, techs),
        progress.productionBonus(empire.xp || 0),
        { rel: nexus.relicBonuses(nexus.equippedOf(db, empire.id)), dir: p.directive || "", spec: species.bonuses(empire.species), ally: social.allianceBonuses(db, empire.id), worldProd: worldEconomy(db).prod }
      );
      const sys = db.prepare("SELECT name FROM systems WHERE id = ?").get(p.system_id);
      const shipCount = Object.values(shipsMap(db, p.id)).reduce((s, n) => s + n, 0);
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        typeName: PLANET_TYPES[p.type]?.name || p.type,
        systemId: p.system_id,
        systemName: sys?.name || "",
        isAlliance: !!p.alliance_id,
        allianceId: p.alliance_id || 0,
        ...stockBag(p),
        production: prod,
        storage: calcStorage(b.silo || 0, b.habitat || 0, species.bonuses(empire.species).storage),
        extractors: Object.values(BUILDINGS)
          .filter((d) => d.resource)
          .map((d) => ({ id: d.id, name: d.name, resource: d.resource, level: b[d.id] || 0 })),
        shipCount,
        shipCap: shipCap(db, p.id),
        ships: shipsMap(db, p.id),
      };
    }),
    techs,
    queue,
    fleets,
    fleetAudit,
    commanders: commanders.list(empireFresh, progress.commanderLevel(empireFresh.xp || 0)),
    sectorSeason: sectorSeason.data(db, empireFresh),
    unread,
    relics: {
      catalog: nexus.RELICS,
      inventory: nexus.inventoryOf(db, empire.id),
      equipped: nexus.equippedOf(db, empire.id),
    },
    directives: nexus.DIRECTIVES,
    market: nexus.getMarket(db),
    prices: economy.getPrices(db),
    ops,
    pirates: pirates.threatOf(db),
    incoming,
    rift: getRift(db),
    hints,
    allianceActivity,
    newMedals: awarded,
  };
}

function getRift(db) {
  const row = db.prepare("SELECT value FROM world_meta WHERE key = 'rift'").get();
  if (!row) return null;
  try {
    const data = JSON.parse(row.value);
    if (!data || data.until < Date.now()) return null;
    const sys = db.prepare("SELECT id, name FROM systems WHERE id = ?").get(data.systemId);
    return sys ? { systemId: sys.id, name: sys.name, until: data.until } : null;
  } catch {
    return null;
  }
}

function incomingThreats(db, empireId) {
  const planetIds = db.prepare("SELECT id FROM planets WHERE empire_id = ? AND IFNULL(alliance_id, 0) = 0").all(empireId).map((p) => p.id);
  for (const p of social.accessibleAlliancePlanets(db, empireId)) {
    if (!planetIds.includes(p.id)) planetIds.push(p.id);
  }
  if (!planetIds.length) return [];
  const placeholders = planetIds.map(() => "?").join(",");
  const fleets = db
    .prepare(
      `SELECT f.*, tp.name AS targetName, e.name AS fromName
       FROM fleets f
       JOIN planets tp ON tp.id = f.target_planet_id
       JOIN empires e ON e.id = f.empire_id
       WHERE tp.id IN (${placeholders}) AND f.empire_id != ? AND f.is_return = 0
         AND f.mission IN ('attack', 'spy')
       ORDER BY f.arrives_at`
    )
    .all(...planetIds, empireId)
    .map((f) => ({
      id: "f" + f.id,
      kind: f.mission,
      from: f.fromName,
      planet: f.targetName,
      planetId: f.target_planet_id,
      ships: JSON.parse(f.ships || "{}"),
      arrivesAt: f.arrives_at,
    }));
  const raids = db
    .prepare(
      `SELECT r.*, p.name AS targetName FROM raids r
       JOIN planets p ON p.id = r.target_planet_id
       WHERE p.empire_id = ? ORDER BY r.arrives_at`
    )
    .all(empireId)
    .map((r) => ({
      id: "r" + r.id,
      kind: "raid",
      from: r.kind === "pirates" ? "Piraten" : "Nexus-Echo",
      planet: r.targetName,
      planetId: r.target_planet_id,
      ships: JSON.parse(r.ships || "{}"),
      arrivesAt: r.arrives_at,
    }));
  return [...fleets, ...raids].sort((a, b) => a.arrivesAt - b.arrivesAt);
}

function tickGalaxy(db) {
  const last = db.prepare("SELECT value FROM world_meta WHERE key = 'last_galaxy'").get();
  if (last && Date.now() - Number(last.value) < 90_000) return;
  db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES('last_galaxy', ?)").run(String(Date.now()));

  const remnantCount = db.prepare("SELECT COUNT(*) AS n FROM systems WHERE remnant = 1").get().n;
  if (remnantCount < 18) {
    const empty = db
      .prepare(
        `SELECT s.id FROM systems s
         WHERE s.remnant = 0 AND s.is_hub = 0
           AND NOT EXISTS (SELECT 1 FROM planets p WHERE p.system_id = s.id AND p.empire_id IS NOT NULL)
         ORDER BY RANDOM() LIMIT 1`
      )
      .get();
    if (empty) {
      db.prepare("UPDATE systems SET remnant = 1 WHERE id = ?").run(empty.id);
      setRemnantFleet(db, empty.id, remnantFleetForRing(2 + Math.floor(Math.random() * 2)));
    }
  }

  const warlords = db.prepare("SELECT COUNT(*) AS n FROM systems WHERE IFNULL(warlord,'') != ''").get().n;
  if (warlords < 4) {
    const rem = db
      .prepare("SELECT id FROM systems WHERE remnant = 1 AND IFNULL(warlord,'') = '' ORDER BY RANDOM() LIMIT 1")
      .get();
    if (rem) {
      const names = nexus.WARLORD_NAMES;
      const name = names[Math.floor(Math.random() * names.length)];
      db.prepare("UPDATE systems SET warlord = ? WHERE id = ?").run(name, rem.id);
    }
  }

  let rift = getRift(db);
  if (!rift && Math.random() < 0.28) {
    const sys = db.prepare("SELECT id FROM systems WHERE is_hub = 0 ORDER BY RANDOM() LIMIT 1").get();
    if (sys) {
      db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES('rift', ?)").run(
        JSON.stringify({ systemId: sys.id, until: Date.now() + 3 * 60 * 60 * 1000 })
      );
    }
  }

  pirates.grow(db);
  if (Math.random() < 0.12) spawnRaid(db);
}

function pirateShieldWindowMs() {
  return 3 * 60 * 60 * 1000;
}

function sendFleetGroup(db, empire, target, mission, deployments) {
  if (mission !== "attack" && mission !== "intercept") throw new Error("Gemeinsame Flotten sind nur für Angriff oder Verteidigung verfügbar.");
  const selected = (deployments || []).filter((entry) => entry && Object.values(entry.ships || {}).some((n) => Number(n) > 0));
  if (!selected.length) throw new Error("Keine Schiffe ausgewählt.");
  if (selected.length > ACS_MAX_FLEETS) throw new Error(`Maximal ${ACS_MAX_FLEETS} Planeten pro gemeinsamem Schlag.`);
  const prepared = selected.map((entry) => {
    const origin = db.prepare("SELECT * FROM planets WHERE id = ? AND empire_id = ? AND IFNULL(alliance_id,0) = 0").get(Number(entry.planetId), empire.id);
    if (!origin) throw new Error("Ungültiger Startplanet.");
    const preview = previewTravel(db, empire, origin, target, entry.ships || {});
    if (preview.empty) throw new Error(`Keine Schiffe auf ${origin.name} ausgewählt.`);
    return { origin, ships: entry.ships || {}, natural: preview.arrivesAt };
  });
  const pendingRaid = mission === "intercept" && db.prepare("SELECT id, arrives_at FROM raids WHERE target_planet_id = ? AND arrives_at > ?").get(target.id, now());
  if (pendingRaid && prepared.some((entry) => entry.natural >= pendingRaid.arrives_at)) {
    throw new Error("Mindestens eine gewählte Flotte erreicht die Kolonie erst nach dem Raid.");
  }
  const actualMission = pendingRaid ? "deploy" : mission;
  const commonArrival = Math.max(...prepared.map((entry) => entry.natural));
  const launched = prepared.map((entry) => sendFleet(db, empire, entry.origin, target, actualMission, entry.ships, {}, {
    holdMs: Math.max(0, commonArrival - entry.natural),
  }));
  return { commonArrival, launched, raidDefense: !!pendingRaid };
}

function spawnRaid(db) {
  const pending = db.prepare("SELECT COUNT(*) AS n FROM raids").get().n;
  if (pending >= 2) return;
  // NPC raids should create an anticipated return moment, not silently grind a
  // player's stationed fleet down during an ordinary play session.
  const cooldown = 6 * 60 * 60 * 1000;
  const shieldMs = pirateShieldWindowMs();
  const busy = new Set(
    db
      .prepare(
        `SELECT p.empire_id FROM raids r JOIN planets p ON p.id = r.target_planet_id WHERE p.empire_id IS NOT NULL`
      )
      .all()
      .map((r) => r.empire_id)
  );
  const target = db
    .prepare(
      `SELECT p.* FROM planets p
       JOIN empires e ON e.id = p.empire_id
       WHERE IFNULL(e.last_raid, 0) < ?
         AND (IFNULL(p.founded_at, 0) = 0 OR ? - IFNULL(p.founded_at, 0) > ?)
         AND e.id NOT IN (${busy.size ? [...busy].map(() => "?").join(",") : "0"})
       ORDER BY RANDOM() LIMIT 1`
    )
    .get(Date.now() - cooldown, Date.now(), shieldMs, ...busy);
  if (!target) return;
  const owner = db.prepare("SELECT * FROM empires WHERE id = ?").get(target.empire_id);
  const raidLv = pirates.raidLevelFor(db, owner);
  const ships = pirates.raidFleetFor(db, owner, target);
  const kind = raidLv >= 6 && Math.random() < 0.2 ? "echo" : "pirates";
  const arrives = Date.now() + 5 * 60_000 + Math.floor(Math.random() * 3 * 60_000);
  db.prepare("INSERT INTO raids(target_planet_id, ships, arrives_at, kind) VALUES(?,?,?,?)").run(
    target.id,
    JSON.stringify(ships),
    arrives,
    kind
  );
  db.prepare("UPDATE empires SET last_raid = ? WHERE id = ?").run(Date.now(), target.empire_id);
  addReport(db, target.empire_id, "alert", `Eingehender Raid: ${target.name}`, {
    text:
      kind === "echo"
        ? `Ein Nexus-Echo (Stufe ${raidLv}) bricht in den Orbit — Stärke an dein Imperium angepasst.`
        : `Piraten Stufe ${raidLv} auf Abfangkurs — Stärke und Technik an dein Imperium und diesen Orbit angepasst. Bei Abwehr gibt es Prisen.`,
    planetId: target.id,
    ships,
    arrivesAt: arrives,
    threat: raidLv,
    jumps: [
      { view: "galaxy", label: "Zur Galaxie", planetId: target.id },
      { view: "defense", label: "Orbit verstärken", planetId: target.id },
      { view: "fleets", label: "Zur Flotte", planetId: target.id },
    ],
  });
}

function resolveRaids(db) {
  const due = db.prepare("SELECT * FROM raids WHERE arrives_at <= ?").all(now());
  for (const r of due) {
    db.prepare("DELETE FROM raids WHERE id = ?").run(r.id);
    const target = db.prepare("SELECT * FROM planets WHERE id = ?").get(r.target_planet_id);
    if (!target || !target.empire_id) continue;
    accruePlanet(db, target);
    const atk = JSON.parse(r.ships || "{}");
    const defShips = shipsMap(db, target.id);
    const defs = defensesMap(db, target.id);
    const defTechs = techsMap(db, target.empire_id);
    const buildings = buildingsMap(db, target.id);
    const platform = (buildings.shield || 0) * 55 + (buildings.citadel || 0) * 110 + (target.directive === "fortress" ? 280 : 0);
    const defEmp = db.prepare("SELECT species FROM empires WHERE id = ?").get(target.empire_id);
    const result = combat.simulate(atk, {}, defShips, techsWithSpecies(defTechs, species.bonuses(defEmp?.species)), defs, platform, 0);
    db.prepare("DELETE FROM ships WHERE planet_id = ?").run(target.id);
    addShips(db, target.id, result.defSurvivors || {});
    db.prepare("DELETE FROM defenses WHERE planet_id = ?").run(target.id);
    addDefenses(db, target.id, result.defSurvivorsDefense || {});
    if (result.winner === "attacker") {
      pirates.bump(db, 1, "wins");
      const cur = stockBag(target);
      const taken = emptyBag();
      for (const k of RESOURCE_IDS) taken[k] = Math.floor(cur[k] * 0.18);
      const left = emptyBag();
      for (const k of RESOURCE_IDS) left[k] = Math.max(0, cur[k] - taken[k]);
      writeStock(db, target.id, left);
      addReport(db, target.empire_id, "combat", `Raid geplündert: ${target.name}`, {
        text: "Die Angreifer haben den Orbit gebrochen und Rohstoffe geraubt. Die Piraten werden kühner.",
        winner: "attacker",
        viewer: "defender",
        youWin: false,
        atkShips: atk,
        defShips,
        defDefense: defs,
        atkLost: result.atkLost,
        defLost: result.defLost,
        defLostDefense: result.defLostDefense,
        atkLeft: result.atkSurvivors,
        defLeft: result.defSurvivors,
        loot: taken,
        planet: target.name,
        raid: true,
      });
    } else {
      const owner = db.prepare("SELECT * FROM empires WHERE id = ?").get(target.empire_id);
      const raidLv = pirates.raidLevelFor(db, owner);
      pirates.bump(db, 0, "losses");
      let prize = pirates.rollLoot(raidLv, "raid_defense");
      prize = pirates.maybeGrantRelic(db, target.empire_id, prize);
      accruePlanet(db, target);
      credit(db, target, prize.loot);
      if (prize.ships) addShips(db, target.id, prize.ships);
      if (prize.defenses) addDefenses(db, target.id, prize.defenses);
      if (prize.xp) db.prepare("UPDATE empires SET xp = IFNULL(xp,0) + ? WHERE id = ?").run(prize.xp, target.empire_id);
      addReport(db, target.empire_id, "combat", `Raid abgewehrt: ${target.name}`, {
        text: `Orbit gehalten. Prise: ${prize.title}. ${prize.text}`,
        winner: "defender",
        viewer: "defender",
        youWin: true,
        atkShips: atk,
        defShips,
        defDefense: defs,
        atkLost: result.atkLost,
        defLost: result.defLost,
        defLostDefense: result.defLostDefense,
        atkLeft: result.atkSurvivors,
        defLeft: result.defSurvivors,
        loot: prize.loot,
        shipsGain: prize.ships,
        defGain: prize.defenses,
        prizeTitle: prize.title,
        relicId: prize.relicId || null,
        planet: target.name,
        raid: true,
      });
    }
  }
}

function previewCombat(db, empire, origin, target, shipsWanted) {
  if (target.empire_id && target.empire_id !== empire.id) {
    const victim = db.prepare("SELECT * FROM empires WHERE id = ?").get(target.empire_id);
    fairplay.assertCanAttack(db, empire, victim);
  }
  const ships = {};
  const stationed = shipsMap(db, origin.id);
  for (const [id, raw] of Object.entries(shipsWanted || {})) {
    const n = Math.max(0, Math.min(stationed[id] || 0, raw | 0));
    if (n) ships[id] = n;
  }
  const sys = db.prepare("SELECT * FROM systems WHERE id = ?").get(target.system_id);
  const defShips = target.empire_id ? shipsMap(db, target.id) : {};
  const rem = sys.remnant ? remnantFleet(db, sys.id) : {};
  let merged = mergeShips(defShips, rem);
  if (sys.warlord) merged = mergeShips(merged, { cruiser: 2, fighter: 8, frigate: 2 });
  if (sys.pirate) merged = mergeShips(merged, pirates.garrisonFor(sys.pirate));
  const defs = target.empire_id ? defensesMap(db, target.id) : {};
  const defTechs = target.empire_id ? techsMap(db, target.empire_id) : {};
  const atkTechs = techsMap(db, empire.id);
  const buildings = target.empire_id ? buildingsMap(db, target.id) : {};
  const platform = (buildings.shield || 0) * 55 + (buildings.citadel || 0) * 110 + (target.directive === "fortress" ? 280 : 0);
  const rel = nexus.relicBonuses(nexus.equippedOf(db, empire.id));
  const result = combat.preview(
    ships,
    merged,
    defs,
    techsWithSpecies(atkTechs, species.bonuses(empire.species), social.allianceBonuses(db, empire.id)),
    techsWithSpecies(defTechs, target.empire_id ? species.bonusesOf(db, target.empire_id) : {}, target.empire_id ? social.allianceBonuses(db, target.empire_id) : null),
    platform,
    (rel.hull || 0) + (social.allianceBonuses(db, empire.id).hull || 0)
  );
  return {
    winner: result.winner,
    atkPower: result.atkPower,
    defPower: result.defPower,
    atkLost: result.atkLost,
    defLost: result.defLost,
    defLostDefense: result.defLostDefense,
    defShips: merged,
    defenses: defs,
    own: target.empire_id === empire.id,
    remnant: !!sys.remnant,
    warlord: sys.warlord || "",
    pirate: sys.pirate || 0,
    matrix: combatMatrix(ships, merged, defs),
  };
}

function clampFleet(raw, catalog) {
  const out = {};
  for (const [id, n] of Object.entries(raw || {})) {
    if (!catalog[id]) continue;
    const v = Math.max(0, Math.min(99999, Number(n) | 0));
    if (v) out[id] = v;
  }
  return out;
}

function simulateWhatIf(db, empire, body) {
  const atk = clampFleet(body?.atk, SHIPS);
  const def = clampFleet(body?.def, SHIPS);
  const defs = clampFleet(body?.defenses, DEFENSES);
  const ownTechs = techsMap(db, empire.id);
  const withTech = body?.useOwnTechs === false ? {} : techsWithSpecies(ownTechs, species.bonuses(empire.species));
  const platform = Math.max(0, Math.min(50000, Number(body?.platformHp) || 0));
  const result = combat.simulate(atk, withTech, def, withTech, defs, platform, 0);
  return {
    winner: result.winner,
    atkPower: result.atkPower || 0,
    defPower: result.defPower || 0,
    atkLost: result.atkLost || {},
    defLost: result.defLost || {},
    defLostDefense: result.defLostDefense || {},
    atkSurvivors: result.atkSurvivors || {},
    defSurvivors: result.defSurvivors || {},
    defSurvivorsDefense: result.defSurvivorsDefense || {},
    atk,
    def,
    defenses: defs,
    platformHp: platform,
    techs: body?.useOwnTechs === false ? 0 : 1,
    matrix: combatMatrix(atk, def, defs),
  };
}

function combatMatrix(atkShips, defShips, defenses) {
  const rows = [];
  for (const [sid, n] of Object.entries(atkShips || {})) {
    if (!n || !SHIPS[sid]) continue;
    const vsShips = {};
    for (const [did, dn] of Object.entries(defShips || {})) {
      if (!dn) continue;
      vsShips[did] = { name: SHIPS[did]?.name || did, mul: combat.shipAdv(sid, did), n: dn };
    }
    const vsDef = {};
    for (const [did, dn] of Object.entries(defenses || {})) {
      if (!dn || !DEFENSES[did]) continue;
      vsDef[did] = { name: DEFENSES[did].name, mul: combat.defAdv(did, sid), n: dn };
    }
    rows.push({ id: sid, name: SHIPS[sid].name, n, vsShips, vsDef });
  }
  return rows;
}

function listRanks(db) {
  return social.listRanksFull(db);
}

function setPlanetDirective(db, planet, dir) {
  nexus.setDirective(db, planet.id, dir);
}

function equipRelicLoadout(db, empire, ids) {
  return nexus.equipRelics(db, empire.id, ids);
}

function tradeOffer(db, planet, index) {
  const m = nexus.getMarket(db);
  const o = m.offers[Number(index)];
  if (!o) throw new Error("Angebot ungültig oder abgelaufen.");
  const cost = emptyBag();
  cost[o.give] = o.giveAmt;
  planet = accruePlanet(db, planet);
  if (!canAfford(planet, cost)) throw new Error("Nicht genug zum Handeln.");
  spend(db, planet, cost);
  const gain = emptyBag();
  gain[o.get] = o.getAmt;
  credit(db, planet, gain);
  return o;
}

function rushQueue(db, empire, planet, pay) {
  if (Date.now() - (empire.last_rush || 0) < premium.RUSH_CD) throw new Error("Beschleunigung lädt noch auf (8 Minuten, Nex und Diamanten teilen sich die Pause).");
  const q = db.prepare("SELECT * FROM queue WHERE empire_id = ? ORDER BY completes_at LIMIT 1").get(empire.id);
  if (!q) throw new Error("Nichts in der Warteschlange.");
  if (pay === "nex") {
    const cost = premium.SHOP.chrono.cost;
    if ((empire.nex || 0) < cost) throw new Error(`Kostet ${cost} Nex (du hast ${empire.nex || 0}).`);
    db.prepare("UPDATE empires SET nex = nex - ? WHERE id = ?").run(cost, empire.id);
  } else {
    const cost = emptyBag();
    cost.diamond = 6;
    planet = accruePlanet(db, planet);
    if (!canAfford(planet, cost)) throw new Error("6 Diamanten für Sofort-Abschluss.");
    spend(db, planet, cost);
  }
  db.prepare("UPDATE queue SET completes_at = ? WHERE id = ?").run(now(), q.id);
  db.prepare("UPDATE empires SET last_rush = ? WHERE id = ?").run(Date.now(), empire.id);
  tickWorld(db);
}

function changeSpecies(db, empire, nextId) {
  return species.changeSpecies(db, empire, nextId);
}

function claimDailyNex(db, empire) {
  const amount = premium.claimDaily(db, empire);
  let loot = null;
  if (premium.isVip(empire)) {
    loot = premium.VIP_DAILY_LOOT;
    const home = db
      .prepare("SELECT * FROM planets WHERE empire_id = ? AND IFNULL(alliance_id,0) = 0 ORDER BY id LIMIT 1")
      .get(empire.id);
    if (home && loot) {
      credit(db, accruePlanet(db, home), bag(loot));
      addReport(db, empire.id, "event", "VIP-Versorger gelandet", {
        text: "Tägliches Ressourcen-Paket auf der Heimatwelt.",
        loot,
      });
    }
  }
  return { nex: amount, loot };
}

function grantNex(db, empire, amount) {
  return species.grantNex(db, empire, amount);
}

function grantResources(db, empire, amounts) {
  const planet = db.prepare("SELECT * FROM planets WHERE empire_id = ? ORDER BY id").get(empire.id);
  if (!planet) throw new Error("Kein Planet im Imperium.");
  accruePlanet(db, planet);
  credit(db, planet, bag(amounts || {}));
  return planet.name;
}

function grantShipsToHome(db, empire, ships) {
  const planet = db.prepare("SELECT * FROM planets WHERE empire_id = ? ORDER BY id").get(empire.id);
  if (!planet) throw new Error("Kein Planet im Imperium.");
  addShips(db, planet.id, ships);
  return planet.name;
}

function recallOwnFleets(db, empireId) {
  const fleets = db.prepare("SELECT * FROM fleets WHERE empire_id = ?").all(empireId);
  if (!fleets.length) throw new Error("Keine Flotten unterwegs.");
  const t = now();
  for (const f of fleets) {
    if (f.is_return) {
      db.prepare("UPDATE fleets SET arrives_at = ? WHERE id = ?").run(t, f.id);
      continue;
    }
    const elapsed = Math.max(0, t - f.departed_at);
    const total = Math.max(1, f.arrives_at - f.departed_at);
    const flown = Math.min(total, elapsed);
    db.prepare(
      `UPDATE fleets SET origin_planet_id = ?, target_planet_id = ?, departed_at = ?, arrives_at = ?, is_return = 1 WHERE id = ?`
    ).run(f.target_planet_id, f.origin_planet_id, t, t + Math.max(8000, flown), f.id);
  }
}

function recallFleet(db, empire, fleetId) {
  const fleet = db.prepare("SELECT * FROM fleets WHERE id = ? AND empire_id = ?").get(fleetId, empire.id);
  if (!fleet) throw new Error("Flotte nicht gefunden.");
  if (fleet.is_return) throw new Error("Diese Flotte ist bereits auf dem Rückflug.");

  const t = now();
  const outboundTravel = Math.max(TICK_MS, fleet.arrives_at - fleet.departed_at - (fleet.hold_ms || 0));
  const flown = Math.min(outboundTravel, Math.max(0, t - fleet.departed_at));
  const returnTravel = Math.max(TICK_MS, flown);
  const arrivesAt = t + returnTravel;
  const origin = db.prepare("SELECT name FROM planets WHERE id = ?").get(fleet.origin_planet_id);

  db.prepare(
    `UPDATE fleets SET origin_planet_id = ?, target_planet_id = ?, departed_at = ?, arrives_at = ?, is_return = 1, hold_ms = 0
     WHERE id = ?`
  ).run(fleet.target_planet_id, fleet.origin_planet_id, t, arrivesAt, fleet.id);
  addReport(db, empire.id, "fleet", `Flotte zurückgerufen${origin ? `: ${origin.name}` : ""}`, {
    text: `Rückflug eingeleitet. Ankunft im Welt-Tick um ${new Date(arrivesAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}.`,
  });
  return { fleetId: fleet.id, arrivesAt };
}

function buyNexItem(db, empire, planet, itemId, extra) {
  const item = premium.SHOP[itemId];
  if (!item) throw new Error("Unbekanntes Angebot.");
  if (itemId === "chrono") {
    rushQueue(db, empire, planet, "nex");
    return;
  }
  if (itemId === "recall" && premium.freeRecallReady(empire)) {
    recallOwnFleets(db, empire.id);
    premium.markVipRecall(db, empire);
    tickWorld(db);
    return;
  }
  if ((empire.nex || 0) < item.cost) throw new Error(`Kostet ${item.cost} Nex (ca. ${premium.nexToEurLabel(item.cost)}, du hast ${empire.nex || 0}).`);
  if (item.needUnlock && !empire[item.needUnlock]) throw new Error("Erst die zugehörige Nex-Einheit freischalten.");
  if (itemId === "recall") {
    recallOwnFleets(db, empire.id);
  } else if (itemId === "rename") {
    const name = String(extra?.name || "").trim();
    if (name.length < 3 || name.length > 24) throw new Error("Planetenname: 3–24 Zeichen.");
    if (!planet) throw new Error("Kein Fokus-Planet.");
    db.prepare("UPDATE planets SET name = ? WHERE id = ? AND empire_id = ?").run(name, planet.id, empire.id);
  } else if (itemId === "signet") {
    if (empire.signet) throw new Error("Signet bereits aktiv.");
    db.prepare("UPDATE empires SET signet = 1 WHERE id = ?").run(empire.id);
  } else if (item.loot) {
    if (!planet) throw new Error("Kein Fokus-Planet.");
    planet = accruePlanet(db, planet);
    credit(db, planet, bag(item.loot));
  } else if (item.ships) {
    if (!planet) throw new Error("Kein Fokus-Planet.");
    addShips(db, planet.id, item.ships);
  } else if (itemId === "ship_cap_boost") {
    if (Number(empire.ship_cap_bonus || 0) >= 10) throw new Error("Werft-Turbine ist bereits eingebaut.");
    db.prepare("UPDATE empires SET ship_cap_bonus = IFNULL(ship_cap_bonus,0) + 10 WHERE id = ?").run(empire.id);
  } else if (itemId === "alliance_expand") {
    const mine = social.myAlliance(db, empire.id);
    if (!mine) throw new Error("Du bist in keiner Allianz.");
    if (mine.myRank !== "leader" && mine.myRank !== "coleader") {
      throw new Error("Nur Führung kann das Mitgliederlimit ausbauen.");
    }
    const limits = social.memberLimits(db);
    const cur = social.effectiveMaxMembers(db, mine);
    if (cur >= limits.max) throw new Error(`Mitgliederlimit ausgereizt (${limits.max}).`);
    const next = Math.min(limits.max, cur + limits.step);
    db.prepare("UPDATE alliances SET max_members = ? WHERE id = ?").run(next, mine.id);
  } else {
    throw new Error("Unbekanntes Angebot.");
  }
  if (item.unlock === "aeon_unlock" || item.unlock === "helix_unlock") {
    db.prepare(`UPDATE empires SET ${item.unlock} = 1 WHERE id = ?`).run(empire.id);
  }
  db.prepare("UPDATE empires SET nex = nex - ? WHERE id = ?").run(item.cost, empire.id);
  tickWorld(db);
}

module.exports = {
  tickWorld,
  snapshot,
  accruePlanet,
  enqueueBuilding,
  enqueueShip,
  enqueueDefense,
  enqueueResearch,
  enqueueAllianceResearch,
  spyOdds,
  cancelQueue,
  sendFleet,
  sendFleetGroup,
  claimQuest,
  claimDailyOp,
  claimWeeklyOp,
  runActivity,
  exchangeMarket,
  setPlanetDirective,
  equipRelicLoadout,
  tradeOffer,
  rushQueue,
  changeSpecies,
  claimDailyNex,
  grantNex,
  grantResources,
  grantShipsToHome,
  startOrbitFire,
  claimOrbitFire,
  orbitFireReward,
  buyNexItem,
  recallFleet,
  assignHome,
  addShips,
  shipCap,
  allianceStorageCap,
  reportShipLosses,
  splitShipSurvivors,
  pickColor,
  buildingsMap,
  shipsMap,
  defensesMap,
  techsMap,
  previewCombat,
  simulateWhatIf,
  previewTravel,
  listRanks,
  calcProd,
  calcStorage,
  hubBonus,
  planetView,
  scaledCost: require("./catalog").scaledCost,
  scaledTime: require("./catalog").scaledTime,
  meetsReq: require("./catalog").meetsReq,
  now,
};
