"use strict";

const { STAR_TYPES, PLANET_TYPES } = require("./catalog");
const { withTx } = require("./tx");

const PREFIX = [
  "Helio", "Nyx", "Astra", "Vela", "Orion", "Kepler", "Lyra", "Rhea", "Voss", "Quar",
  "Zeta", "Ion", "Ner", "Tal", "Xer", "Pha", "Mir", "Kael", "Drav", "Syl",
  "Omen", "Vey", "Rix", "Thal", "Aegis", "Nox", "Pyre", "Lumen",
  "Keth", "Arx", "Solace", "Umbra", "Prism", "Cinder", "Halo", "Vortex",
  "Echelon", "Sable", "Quasar", "Nadir", "Apex", "Rune", "Forge", "Wisp",
  "Dusk", "Gleam", "Feral", "Titan", "Echo", "Pulse", "Crown", "Ashen",
];
const SUFFIX = [
  " Prime", " Reach", " Gate", " Deep", " Rim", " Spire", " Drift", " Hollow",
  " Veil", " Expanse", " Anchor", " Fold", "", " Verge", " Halo",
  " March", " Bastion", " Cross", " Well", " Ward", " Strand", " Cradle",
  " Watch", " Flare", " Span", " Crest", " Fall", " Rise",
];
const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
const LOCAL_ORIGIN = { x: 1500, y: 1500 };
const LAYOUT_RADIUS = 2100;
const GALAXY_REGIONS = [
  { id: 0, name: "AURELIA", subtitle: "Die Heimatreiche", x: -620, y: 60, r: 650, color: "#83dafa" },
  { id: 1, name: "VESPER", subtitle: "Der violette Schleier", x: 620, y: -470, r: 475, color: "#ceaeff" },
  { id: 2, name: "SOLARA", subtitle: "Die goldene Grenze", x: 750, y: 650, r: 500, color: "#efd199" },
  { id: 3, name: "ELYRA", subtitle: "Jenseits der bekannten Wege", x: -1900, y: -640, r: 560, color: "#acd6ff" },
  { id: 4, name: "NOCTIS", subtitle: "Die stillen Tiefen", x: -1900, y: 780, r: 550, color: "#c9b5f5" },
  { id: 5, name: "CAELIS", subtitle: "Ein neuer Horizont", x: -450, y: -1410, r: 550, color: "#efc298" },
];
const PTYPES = Object.keys(PLANET_TYPES);
const STYPES = Object.keys(STAR_TYPES).filter((s) => s !== "neutron");

function hashSeed(s) {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function remnantFleetForRing(ring) {
  if (ring === 0) return { destroyer: 2, cruiser: 4, fighter: 10, interceptor: 4 };
  if (ring === 1) return { cruiser: 1, frigate: 4, fighter: 8, interceptor: 2 };
  if (ring === 2) return { frigate: 2, fighter: 6, probe: 2, bomber: 1 };
  if (ring === 3) return { fighter: 4, probe: 2, interceptor: 1 };
  if (ring === 4) return { interceptor: 4, fighter: 8, frigate: 2, bomber: 1 };
  if (ring === 5) return { bomber: 3, cruiser: 2, interceptor: 6, fighter: 10 };
  if (ring === 6) return { battleship: 1, destroyer: 1, cruiser: 3, carrier: 1, interceptor: 8 };
  if (ring === 7) return { dreadnought: 1, battleship: 1, carrier: 1, bomber: 4, interceptor: 10 };
  if (ring === 8) return { dreadnought: 1, battleship: 2, destroyer: 2, carrier: 2, bomber: 6, interceptor: 14, cruiser: 4 };
  return { dreadnought: 2, battleship: 2, carrier: 2, destroyer: 3, bomber: 8, interceptor: 18, cruiser: 6 };
}

const CORE_RINGS = [
  { r: 0, count: 1, ring: 0, hub: true },
  { r: 180, count: 8, ring: 1, hubs: 1 },
  { r: 340, count: 16, ring: 2, hubs: 2 },
  { r: 520, count: 28, ring: 3, hubs: 2 },
  { r: 720, count: 40, ring: 4, hubs: 3 },
  { r: 940, count: 56, ring: 5, hubs: 3 },
  { r: 1180, count: 72, ring: 6, hubs: 4 },
  { r: 1440, count: 88, ring: 7, hubs: 4 },
  { r: 1720, count: 96, ring: 8, hubs: 5 },
  { r: 2040, count: 108, ring: 9, hubs: 5 },
];

const EXPAND_RINGS = [
  { r: 720, count: 36, ring: 4, hubs: 2 },
  { r: 940, count: 48, ring: 5, hubs: 2 },
  { r: 1180, count: 64, ring: 6, hubs: 3 },
  { r: 1440, count: 80, ring: 7, hubs: 3 },
];

const LATE_RINGS = [
  { r: 1720, count: 72, ring: 8, hubs: 4 },
  { r: 2040, count: 84, ring: 9, hubs: 4 },
];

function remnantChance(ring) {
  if (ring <= 1) return 0.42;
  if (ring === 2) return 0.36;
  if (ring === 3) return 0.32;
  if (ring === 4) return 0.38;
  if (ring === 5) return 0.42;
  if (ring === 6) return 0.46;
  return 0.5;
}

function placeRingSystems(rng, usedNames, rings, startId, cx, cy) {
  const systems = [];
  let id = startId;
  for (const ring of rings) {
    let hubLeft = ring.hub ? 1 : ring.hubs || 0;
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 + ring.ring * 0.31 + rng() * 0.1;
      const jitter = ring.r === 0 ? 0 : (rng() - 0.5) * 56;
      const rr = ring.r + jitter;
      let name;
      let guard = 0;
      do {
        name = pick(rng, PREFIX) + pick(rng, SUFFIX);
        guard += 1;
        if (guard > 80) name = `${pick(rng, PREFIX)}-${id}`;
      } while (usedNames.has(name));
      usedNames.add(name);
      const isHub = hubLeft > 0 && (ring.hub || rng() < 0.32 || i === ring.count - 1);
      if (isHub) hubLeft -= 1;
      const starType = isHub ? "neutron" : pick(rng, STYPES);
      const remnant = !isHub && rng() < remnantChance(ring.ring) ? 1 : 0;
      systems.push({
        id,
        name,
        x: cx + Math.cos(angle) * rr,
        y: cy + Math.sin(angle) * rr,
        starType,
        isHub: isHub ? 1 : 0,
        remnant,
        ring: ring.ring,
      });
      id += 1;
    }
  }
  return systems;
}

function insertSystemsAndWorld(db, rng, systems, allForLinks, opts = {}) {
  const insertSys = db.prepare(
    "INSERT INTO systems(id, name, x, y, star_type, is_hub, remnant, ring, galaxy_id) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertPlanet = db.prepare(
    "INSERT INTO planets(system_id, slot, name, type, size, empire_id, metal, helium, titan, energy, crystal, diamond, last_tick) VALUES(?, ?, ?, ?, ?, NULL, 0, 0, 0, 0, 0, 0, ?)"
  );
  const insertLink = db.prepare("INSERT OR IGNORE INTO links(a, b) VALUES(?, ?)");
  const now = Date.now();
  const pool = allForLinks || systems;
  const planetSpan = Number(opts.planetSpan) > 0 ? Number(opts.planetSpan) : 4;
  const defaultGalaxy = Number.isFinite(opts.galaxyId) ? opts.galaxyId : 0;

  withTx(db, () => {
    for (const s of systems) {
      const galaxyId = Number.isFinite(s.galaxyId) ? s.galaxyId : defaultGalaxy;
      insertSys.run(s.id, s.name, s.x, s.y, s.starType, s.isHub, s.remnant, s.ring, galaxyId);
      const nPlanets = 2 + Math.floor(rng() * planetSpan);
      for (let slot = 0; slot < nPlanets; slot++) {
        const type = pick(rng, PTYPES);
        const size = 1 + Math.floor(rng() * 4);
        insertPlanet.run(s.id, slot, `${s.name} ${ROMAN[slot] || slot + 1}`, type, size, now);
      }
    }
    for (const s of systems) {
      const others = pool
        .filter((o) => o.id !== s.id)
        .map((o) => ({ o, d: (o.x - s.x) ** 2 + (o.y - s.y) ** 2 }))
        .sort((a, b) => a.d - b.d);
      const k = s.isHub ? 5 : 4;
      for (let i = 0; i < k && i < others.length; i++) {
        const a = Math.min(s.id, others[i].o.id);
        const b = Math.max(s.id, others[i].o.id);
        insertLink.run(a, b);
      }
    }
    const extraN = Math.max(12, Math.floor(systems.length * 0.12));
    for (let extra = 0; extra < extraN; extra++) {
      const a = systems[Math.floor(rng() * systems.length)];
      const b = pool[Math.floor(rng() * pool.length)];
      if (!a || !b || a.id === b.id) continue;
      insertLink.run(Math.min(a.id, b.id), Math.max(a.id, b.id));
    }
  });
}

function mergeRemnantMeta(db, added) {
  const raw = db.prepare("SELECT value FROM world_meta WHERE key = ?").get("remnant_fleets");
  const map = raw ? JSON.parse(raw.value) : {};
  for (const s of added) {
    if (s.remnant) map[String(s.id)] = remnantFleetForRing(s.ring);
  }
  db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES(?, ?)").run("remnant_fleets", JSON.stringify(map));
}

function generateGalaxy(db, seedStr) {
  const rng = makeRng(hashSeed(seedStr));
  const usedNames = new Set();
  const cx = 1500;
  const cy = 1500;
  const systems = placeRingSystems(rng, usedNames, CORE_RINGS, 1, cx, cy);
  for (const s of systems) s.galaxyId = 0;
  insertSystemsAndWorld(db, rng, systems, systems, { galaxyId: 0, planetSpan: 4 });
  mergeRemnantMeta(db, systems);
  db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES(?, ?)").run("galaxy_scale", "v2");
}

function expandGalaxy(db) {
  const n = db.prepare("SELECT COUNT(*) AS n FROM systems WHERE IFNULL(galaxy_id,0)=0").get().n;
  const scale = db.prepare("SELECT value FROM world_meta WHERE key = 'galaxy_scale'").get()?.value || "";
  if (n >= 900 || scale === "v3-outer") return { added: 0, total: n };
  if (n >= 450) return { added: 0, total: n };
  const existing = db.prepare("SELECT id, name, x, y, is_hub FROM systems WHERE IFNULL(galaxy_id,0)=0").all();
  const usedNames = new Set(existing.map((s) => s.name));
  const maxId = existing.reduce((m, s) => Math.max(m, s.id), 0);
  const cx = existing.reduce((s, o) => s + o.x, 0) / Math.max(1, existing.length);
  const cy = existing.reduce((s, o) => s + o.y, 0) / Math.max(1, existing.length);
  const rings = n < 280 ? EXPAND_RINGS : LATE_RINGS;
  const tag = n < 280 ? "v2-expand" : "v3-outer";
  if (scale === tag) return { added: 0, total: n };
  const rng = makeRng(hashSeed(`${tag}-${maxId}-${n}`));
  const added = placeRingSystems(rng, usedNames, rings, maxId + 1, cx, cy);
  for (const s of added) s.galaxyId = 0;
  const pool = existing
    .map((s) => ({ id: s.id, x: s.x, y: s.y, isHub: s.is_hub }))
    .concat(added);
  insertSystemsAndWorld(db, rng, added, pool, { galaxyId: 0, planetSpan: 4 });
  mergeRemnantMeta(db, added);
  db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES(?, ?)").run("galaxy_scale", tag);
  return { added: added.length, total: n + added.length };
}

function remnantFleet(db, systemId) {
  const raw = db.prepare("SELECT value FROM world_meta WHERE key = ?").get("remnant_fleets");
  if (!raw) return {};
  const map = JSON.parse(raw.value);
  return map[String(systemId)] || map[systemId] || {};
}

function setRemnantFleet(db, systemId, ships) {
  const raw = db.prepare("SELECT value FROM world_meta WHERE key = ?").get("remnant_fleets");
  const map = raw ? JSON.parse(raw.value) : {};
  if (!ships || Object.values(ships).every((n) => n <= 0)) delete map[String(systemId)];
  else map[String(systemId)] = ships;
  db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES(?, ?)").run("remnant_fleets", JSON.stringify(map));
}

function galaxyLayout(system, region) {
  const scale = region.r / LAYOUT_RADIUS;
  return {
    regionId: region.id,
    x: region.x + (system.x - LOCAL_ORIGIN.x) * scale,
    y: region.y + (system.y - LOCAL_ORIGIN.y) * scale,
  };
}

function listOpenRegions(db) {
  const ids = new Set(
    db.prepare("SELECT DISTINCT IFNULL(galaxy_id,0) AS id FROM systems").all().map((row) => Number(row.id) || 0)
  );
  return GALAXY_REGIONS.filter((region) => ids.has(region.id));
}

function pickGalaxyGates(db, galaxyId) {
  const hubs = db
    .prepare(
      "SELECT id, x, y, ring, is_hub FROM systems WHERE IFNULL(galaxy_id,0)=? ORDER BY ring ASC, id ASC"
    )
    .all(galaxyId);
  if (!hubs.length) return [];
  const core =
    hubs.find((s) => s.ring === 0) ||
    hubs.reduce((best, s) => {
      const d = (s.x - LOCAL_ORIGIN.x) ** 2 + (s.y - LOCAL_ORIGIN.y) ** 2;
      const bd = (best.x - LOCAL_ORIGIN.x) ** 2 + (best.y - LOCAL_ORIGIN.y) ** 2;
      return d < bd ? s : best;
    });
  const outer = hubs.reduce((best, s) => (s.ring > best.ring ? s : best));
  const picked = [core];
  if (outer && outer.id !== core.id) picked.push(outer);
  return picked;
}

function ensureJumpNetwork(db) {
  const regions = listOpenRegions(db);
  const insertGate = db.prepare(
    "INSERT OR IGNORE INTO jump_gates(id, system_id, galaxy_id) VALUES(?, ?, ?)"
  );
  const insertLink = db.prepare(
    "INSERT OR IGNORE INTO jump_connections(id, a, b, base_ms, one_way, enabled) VALUES(?, ?, ?, 1800000, 0, 1)"
  );
  const gatesByGalaxy = new Map();
  withTx(db, () => {
    for (const region of regions) {
      const systems = pickGalaxyGates(db, region.id);
      const ids = [];
      systems.forEach((sys, index) => {
        const id = `g${region.id}-${index ? "outer" : "core"}`;
        insertGate.run(id, sys.id, region.id);
        ids.push(id);
      });
      gatesByGalaxy.set(region.id, ids);
    }
    const home = gatesByGalaxy.get(0) || [];
    for (const region of regions) {
      if (region.id === 0) continue;
      const remote = gatesByGalaxy.get(region.id) || [];
      for (const a of home) {
        for (const b of remote) {
          insertLink.run(`${a}__${b}`, a, b);
        }
      }
    }
  });
}

function openGalaxy(db, galaxyId, opts = {}) {
  const id = Number(galaxyId);
  if (!Number.isInteger(id) || id <= 0 || !GALAXY_REGIONS[id]) {
    throw new Error("Unbekannte Galaxie.");
  }
  if (db.prepare("SELECT 1 FROM systems WHERE IFNULL(galaxy_id,0)=? LIMIT 1").get(id)) {
    ensureJumpNetwork(db);
    return { added: 0, galaxyId: id };
  }
  const existing = db.prepare("SELECT id, name FROM systems").all();
  const usedNames = new Set(existing.map((s) => s.name));
  const maxId = existing.reduce((m, s) => Math.max(m, s.id), 0);
  const rng = makeRng(hashSeed(`archipelago-${id}-${maxId}`));
  const rings = opts.rings || CORE_RINGS;
  const added = placeRingSystems(rng, usedNames, rings, maxId + 1, LOCAL_ORIGIN.x, LOCAL_ORIGIN.y);
  for (const s of added) s.galaxyId = id;
  insertSystemsAndWorld(db, rng, added, added, { galaxyId: id, planetSpan: opts.planetSpan || 5 });
  mergeRemnantMeta(db, added);
  ensureJumpNetwork(db);
  return { added: added.length, galaxyId: id };
}

const COMPACT_RINGS = [
  { r: 0, count: 1, ring: 0, hub: true },
  { r: 220, count: 8, ring: 1, hubs: 1 },
  { r: 520, count: 10, ring: 3, hubs: 1 },
  { r: 940, count: 12, ring: 5, hubs: 2 },
];

function ensureOpenGalaxies(db, count = 3, opts = {}) {
  if (process.env.ARCHIPELAGO_COMPACT === "1" && !opts.rings) {
    opts = { ...opts, rings: COMPACT_RINGS, planetSpan: 2 };
  }
  const target = Math.max(1, Math.min(Number(count) || 1, GALAXY_REGIONS.length));
  const have = new Set(
    db.prepare("SELECT DISTINCT IFNULL(galaxy_id,0) AS id FROM systems").all().map((row) => Number(row.id) || 0)
  );
  const opened = [];
  for (let id = 1; id < target; id += 1) {
    if (have.has(id)) continue;
    opened.push(openGalaxy(db, id, opts));
  }
  ensureJumpNetwork(db);
  return opened;
}

function listJumpNetwork(db) {
  return {
    gates: db.prepare("SELECT id, system_id AS systemId, galaxy_id AS galaxyId FROM jump_gates").all(),
    connections: db
      .prepare("SELECT id, a, b, base_ms AS baseMs, one_way AS oneWay, enabled FROM jump_connections")
      .all()
      .map((row) => ({
        id: row.id,
        a: row.a,
        b: row.b,
        baseMs: row.baseMs,
        oneWay: !!row.oneWay,
        enabled: row.enabled !== 0,
      })),
  };
}

module.exports = {
  generateGalaxy,
  expandGalaxy,
  remnantFleet,
  setRemnantFleet,
  remnantFleetForRing,
  makeRng,
  hashSeed,
  GALAXY_REGIONS,
  LOCAL_ORIGIN,
  LAYOUT_RADIUS,
  galaxyLayout,
  listOpenRegions,
  openGalaxy,
  ensureOpenGalaxies,
  ensureJumpNetwork,
  listJumpNetwork,
};
