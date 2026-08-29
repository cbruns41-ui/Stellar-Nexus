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
const ROMAN = ["I", "II", "III", "IV", "V"];
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

function insertSystemsAndWorld(db, rng, systems, allForLinks) {
  const insertSys = db.prepare(
    "INSERT INTO systems(id, name, x, y, star_type, is_hub, remnant) VALUES(?, ?, ?, ?, ?, ?, ?)"
  );
  const insertPlanet = db.prepare(
    "INSERT INTO planets(system_id, slot, name, type, size, empire_id, metal, helium, titan, energy, crystal, diamond, last_tick) VALUES(?, ?, ?, ?, ?, NULL, 0, 0, 0, 0, 0, 0, ?)"
  );
  const insertLink = db.prepare("INSERT OR IGNORE INTO links(a, b) VALUES(?, ?)");
  const now = Date.now();
  const pool = allForLinks || systems;

  withTx(db, () => {
    for (const s of systems) {
      insertSys.run(s.id, s.name, s.x, s.y, s.starType, s.isHub, s.remnant);
      const nPlanets = 2 + Math.floor(rng() * 4);
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
  insertSystemsAndWorld(db, rng, systems, systems);
  mergeRemnantMeta(db, systems);
  db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES(?, ?)").run("galaxy_scale", "v2");
}

function expandGalaxy(db) {
  const n = db.prepare("SELECT COUNT(*) AS n FROM systems").get().n;
  const scale = db.prepare("SELECT value FROM world_meta WHERE key = 'galaxy_scale'").get()?.value || "";
  if (n >= 900 || scale === "v3-outer") return { added: 0, total: n };
  if (n >= 450) return { added: 0, total: n };
  const existing = db.prepare("SELECT id, name, x, y, is_hub FROM systems").all();
  const usedNames = new Set(existing.map((s) => s.name));
  const maxId = existing.reduce((m, s) => Math.max(m, s.id), 0);
  const cx = existing.reduce((s, o) => s + o.x, 0) / Math.max(1, existing.length);
  const cy = existing.reduce((s, o) => s + o.y, 0) / Math.max(1, existing.length);
  const rings = n < 280 ? EXPAND_RINGS : LATE_RINGS;
  const tag = n < 280 ? "v2-expand" : "v3-outer";
  if (scale === tag) return { added: 0, total: n };
  const rng = makeRng(hashSeed(`${tag}-${maxId}-${n}`));
  const added = placeRingSystems(rng, usedNames, rings, maxId + 1, cx, cy);
  const pool = existing
    .map((s) => ({ id: s.id, x: s.x, y: s.y, isHub: s.is_hub }))
    .concat(added);
  insertSystemsAndWorld(db, rng, added, pool);
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

module.exports = { generateGalaxy, expandGalaxy, remnantFleet, setRemnantFleet, remnantFleetForRing, makeRng, hashSeed };
