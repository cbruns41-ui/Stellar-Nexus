"use strict";

const CHANGE_COST = 100;
const CHANGE_CD = 48 * 60 * 60 * 1000;
const STARTER_NEX = 40;
const DAILY_NEX = 5;

const SHOP = require("./premium").SHOP;
const PACKS = require("./premium").PACKS;

const SPECIES = {
  terran: {
    id: "terran",
    name: "Terraner",
    glyph: "☉",
    color: "#7ecbff",
    blurb: "Kolonisten aus dem Kern. Lernfähig, selten extrem.",
    perk: "+8% Forschung, +5% Produktion",
    flaw: "−8% Kampfangriff",
    bonuses: { research: 0.08, prod: 0.05, combatAtk: -0.08, hull: 0, travel: 0, build: 0, shipBuild: 0, energy: 0, metal: 0, helium: 0, titan: 0, crystal: 0, spy: 0, storage: 0 },
  },
  kryll: {
    id: "kryll",
    name: "Kryll",
    glyph: "※",
    color: "#f0a030",
    blurb: "Schwarminsektoide. Werften arbeiten wie ein Nest.",
    perk: "+20% Schiffsbau, +8% Angriff",
    flaw: "−12% Lager, −8% Titan",
    bonuses: { research: 0, prod: 0, combatAtk: 0.08, hull: 0, travel: 0, build: 0.04, shipBuild: 0.2, energy: 0, metal: 0, helium: 0, titan: -0.08, crystal: 0, spy: 0, storage: -0.12 },
  },
  veyari: {
    id: "veyari",
    name: "Veyari",
    glyph: "△",
    color: "#c084fc",
    blurb: "Plasma-Wesen. Reaktoren sind ihr Blut.",
    perk: "+22% Energie, +12% Schilde/Hülle",
    flaw: "−14% Metall",
    bonuses: { research: 0, prod: 0, combatAtk: 0, hull: 0.12, travel: 0, build: 0, shipBuild: 0, energy: 0.22, metal: -0.14, helium: 0, titan: 0, crystal: 0.04, spy: 0, storage: 0 },
  },
  draxen: {
    id: "draxen",
    name: "Draxen",
    glyph: "⚔",
    color: "#ff6b5a",
    blurb: "Kriegskaste. Jeder Rumpf ist eine Waffe.",
    perk: "+16% Angriff, +10% Hülle",
    flaw: "−12% Produktion, −10% Forschung",
    bonuses: { research: -0.1, prod: -0.12, combatAtk: 0.16, hull: 0.1, travel: 0, build: 0, shipBuild: 0, energy: 0, metal: 0, helium: 0, titan: 0.06, crystal: 0, spy: 0, storage: 0 },
  },
  helion: {
    id: "helion",
    name: "Helion",
    glyph: "⬡",
    color: "#ffe08a",
    blurb: "Händler der äußeren Ringstraßen. Treibstoff und Lager.",
    perk: "+14% Lager, +12% Helium, +10% Reisen",
    flaw: "−12% Kampfangriff",
    bonuses: { research: 0, prod: 0, combatAtk: -0.12, hull: 0, travel: 0.1, build: 0, shipBuild: 0, energy: 0, metal: 0, helium: 0.12, titan: 0, crystal: 0, spy: 0, storage: 0.14 },
  },
  nyxian: {
    id: "nyxian",
    name: "Nyxianer",
    glyph: "◈",
    color: "#60a5fa",
    blurb: "Schattenvolk aus dem Veil. Schnell, still, zerbrechlich.",
    perk: "+18% Reisen, +12% Kristall, +15% Spionage",
    flaw: "−10% Hülle, −8% Gebäudebau",
    bonuses: { research: 0.04, prod: 0, combatAtk: 0, hull: -0.1, travel: 0.18, build: -0.08, shipBuild: 0, energy: 0, metal: 0, helium: 0, titan: 0, crystal: 0.12, spy: 0.15, storage: 0 },
  },
};

function of(id) {
  return SPECIES[id] || SPECIES.terran;
}

function bonuses(id) {
  return of(id).bonuses;
}

function bonusesOf(db, empireId) {
  const row = db.prepare("SELECT species FROM empires WHERE id = ?").get(empireId);
  return bonuses(row?.species);
}

function publicList() {
  return Object.values(SPECIES).map((s) => ({
    id: s.id,
    name: s.name,
    glyph: s.glyph,
    color: s.color,
    blurb: s.blurb,
    perk: s.perk,
    flaw: s.flaw,
  }));
}

function changeSpecies(db, empire, nextId) {
  const spec = SPECIES[nextId];
  if (!spec) throw new Error("Unbekannte Spezies.");
  const cur = empire.species || "terran";
  if (cur === nextId) throw new Error("Das bist du bereits.");
  const now = Date.now();
  const cd = require("./premium").speciesCdMs(empire);
  if ((empire.last_species || 0) && now - empire.last_species < cd) {
    const h = Math.ceil((cd - (now - empire.last_species)) / 3600000);
    throw new Error(`Spezieswechsel erst in ${h} Std. wieder möglich.`);
  }
  const nex = empire.nex || 0;
  if (nex < CHANGE_COST) throw new Error(`Wechsel kostet ${CHANGE_COST} Nex (du hast ${nex}).`);
  db.prepare("UPDATE empires SET species = ?, nex = nex - ?, last_species = ? WHERE id = ?").run(
    nextId,
    CHANGE_COST,
    now,
    empire.id
  );
  return spec;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function claimDaily(db, empire) {
  return require("./premium").claimDaily(db, empire);
}

function grantNex(db, empire, amount) {
  const n = Math.max(1, Math.min(5000, amount | 0));
  db.prepare("UPDATE empires SET nex = IFNULL(nex,0) + ? WHERE id = ?").run(n, empire.id);
  return n;
}

function publicShop() {
  return require("./premium").publicShop();
}

module.exports = {
  SPECIES,
  CHANGE_COST,
  CHANGE_CD,
  STARTER_NEX,
  DAILY_NEX,
  SHOP,
  PACKS,
  of,
  bonuses,
  bonusesOf,
  publicList,
  changeSpecies,
  claimDaily,
  grantNex,
  publicShop,
  todayKey,
};
