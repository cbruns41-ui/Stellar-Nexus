"use strict";

const { bag, emptyBag, RESOURCE_IDS } = require("./catalog");

const RELICS = {
  helion_core: {
    id: "helion_core",
    name: "Helion-Kern",
    blurb: "+10% Energie-Ertrag. Ein eingefangenes Sternenherz.",
    energy: 0.1,
  },
  furnace_glyph: {
    id: "furnace_glyph",
    name: "Ofen-Glyphe",
    blurb: "+10% Metall. Gebrannt in die erste Gießerei.",
    metal: 0.1,
  },
  isotope_urn: {
    id: "isotope_urn",
    name: "Isotop-Urne",
    blurb: "+10% Helium-3. Kalt und schwer.",
    helium: 0.1,
  },
  crystal_choir: {
    id: "crystal_choir",
    name: "Kristall-Chor",
    blurb: "+10% Kristalle. Sie singen auf Nexus-Frequenz.",
    crystal: 0.1,
  },
  titan_heart: {
    id: "titan_heart",
    name: "Titanherz",
    blurb: "+10% Schiffs-Hülle im Kampf.",
    hull: 0.1,
  },
  void_chart: {
    id: "void_chart",
    name: "Leerenkarte",
    blurb: "Reisen 12% schneller. Eine Karte, die sich selbst faltet.",
    travel: 0.12,
  },
  whisper_lens: {
    id: "whisper_lens",
    name: "Flüsterlinse",
    blurb: "Sonden werden seltener entdeckt.",
    spy: 0.35,
  },
  cargo_sigil: {
    id: "cargo_sigil",
    name: "Fracht-Siegel",
    blurb: "+25% Laderaum. Der Rumpf dehnt sich, ohne zu reißen.",
    cargo: 0.25,
  },
  rift_nail: {
    id: "rift_nail",
    name: "Rissnagel",
    blurb: "Expeditionen finden deutlich mehr.",
    expedition: 0.35,
  },
  crown_of_ash: {
    id: "crown_of_ash",
    name: "Aschekrone",
    blurb: "+5% alle Erträge. Eine Krone ohne König.",
    all: 0.05,
  },
};

const DIRECTIVES = {
  extract: { id: "extract", name: "Extraktion", blurb: "+18% Minen-Ertrag auf diesem Planeten." },
  forge: { id: "forge", name: "Schmiede", blurb: "Werft 20% schneller." },
  science: { id: "science", name: "Labor", blurb: "Forschung 15% schneller, wenn hier das Archiv steht." },
  fortress: { id: "fortress", name: "Festung", blurb: "+280 Orbit-HP und schnellere Batterien." },
};

const WARLORD_NAMES = ["Keth-Mor der Hohle", "Admiral Veyra-9", "Die Aschenwitwe", "Joran Splitter", "Nox der Sammler"];

function relicBonuses(equipped) {
  const ids = equipped || [];
  const b = { energy: 0, metal: 0, helium: 0, crystal: 0, titan: 0, diamond: 0, hull: 0, travel: 0, spy: 0, cargo: 0, expedition: 0, all: 0 };
  for (const id of ids) {
    const r = RELICS[id];
    if (!r) continue;
    for (const k of Object.keys(b)) if (r[k]) b[k] += r[k];
  }
  return b;
}

function equippedOf(db, empireId) {
  const row = db.prepare("SELECT equipped FROM empires WHERE id = ?").get(empireId);
  if (!row || !row.equipped) return [];
  try {
    const a = JSON.parse(row.equipped);
    return Array.isArray(a) ? a.slice(0, 3) : [];
  } catch {
    return [];
  }
}

function inventoryOf(db, empireId) {
  return db.prepare("SELECT relic_id, found_at FROM relics WHERE empire_id = ?").all(empireId).map((r) => r.relic_id);
}

function grantRelic(db, empireId, relicId) {
  if (!RELICS[relicId]) return false;
  const has = db.prepare("SELECT relic_id FROM relics WHERE empire_id = ? AND relic_id = ?").get(empireId, relicId);
  if (has) return false;
  db.prepare("INSERT INTO relics(empire_id, relic_id, found_at) VALUES(?, ?, ?)").run(empireId, relicId, Date.now());
  return true;
}

function randomUnownedRelic(db, empireId) {
  const have = new Set(inventoryOf(db, empireId));
  const pool = Object.keys(RELICS).filter((id) => !have.has(id));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function setDirective(db, planetId, dir) {
  if (dir && !DIRECTIVES[dir]) throw new Error("Unbekannte Direktive.");
  db.prepare("UPDATE planets SET directive = ? WHERE id = ?").run(dir || "", planetId);
}

function equipRelics(db, empireId, ids) {
  const have = new Set(inventoryOf(db, empireId));
  const next = (ids || []).filter((id) => have.has(id)).slice(0, 3);
  db.prepare("UPDATE empires SET equipped = ? WHERE id = ?").run(JSON.stringify(next), empireId);
  return next;
}

function getMarket(db) {
  const raw = db.prepare("SELECT value FROM world_meta WHERE key = 'market'").get();
  const now = Date.now();
  if (raw) {
    try {
      const m = JSON.parse(raw.value);
      if (m.until > now && m.offers?.length) return m;
    } catch {
      /* refresh */
    }
  }
  const pairs = [
    ["metal", "crystal"],
    ["helium", "titan"],
    ["energy", "helium"],
    ["crystal", "diamond"],
    ["titan", "metal"],
    ["metal", "helium"],
  ];
  const offers = [];
  const used = new Set();
  while (offers.length < 3) {
    const [a, b] = pairs[Math.floor(Math.random() * pairs.length)];
    const key = a + b;
    if (used.has(key)) continue;
    used.add(key);
    const giveAmt = a === "diamond" ? 4 : 200 + Math.floor(Math.random() * 250);
    const getAmt =
      b === "diamond" ? 2 + Math.floor(Math.random() * 3) : Math.floor(giveAmt * (0.55 + Math.random() * 0.5));
    offers.push({ give: a, get: b, giveAmt, getAmt });
  }
  const market = { offers, until: now + 12 * 60 * 1000 };
  db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES('market', ?)").run(JSON.stringify(market));
  return market;
}

function seedWarlords(db) {
  if (!hasCol(db, "systems", "warlord")) return;
  const existing = db.prepare("SELECT COUNT(*) AS n FROM systems WHERE IFNULL(warlord,'') != ''").get().n;
  if (existing > 0) return;
  const remnants = db.prepare("SELECT id FROM systems WHERE remnant = 1").all();
  const pick = remnants.sort(() => Math.random() - 0.5).slice(0, 3);
  pick.forEach((s, i) => {
    db.prepare("UPDATE systems SET warlord = ? WHERE id = ?").run(WARLORD_NAMES[i % WARLORD_NAMES.length], s.id);
  });
}

function hasCol(db, table, name) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name);
}

module.exports = {
  RELICS,
  DIRECTIVES,
  WARLORD_NAMES,
  relicBonuses,
  equippedOf,
  inventoryOf,
  grantRelic,
  randomUnownedRelic,
  setDirective,
  equipRelics,
  getMarket,
  seedWarlords,
};
