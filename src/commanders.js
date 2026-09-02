"use strict";

const COMMANDERS = {
  voss: { id: "voss", name: "Mara Voss", role: "Taktikerin", level: 1, blurb: "Präzise Feuerleitung für Angriffsflotten.", attack: 0.08, travel: 0, loot: 0 },
  kael: { id: "kael", name: "Ilyan Kael", role: "Navigator", level: 4, blurb: "Kürzt Flugzeiten durch riskante Sprungfenster.", attack: 0, travel: 0.1, loot: 0 },
  nyra: { id: "nyra", name: "Nyra Sol", role: "Bergungsspezialistin", level: 8, blurb: "Sichert mehr verwertbare Beute nach Einsätzen.", attack: 0, travel: 0, loot: 0.12 },
};

function list(empire, commanderLevel) {
  const selected = empire.active_commander || "voss";
  return Object.values(COMMANDERS).map((item) => ({ ...item, unlocked: commanderLevel >= item.level, active: selected === item.id }));
}

function active(empire) { return COMMANDERS[empire?.active_commander] || COMMANDERS.voss; }

function activate(db, empire, id, commanderLevel) {
  const item = COMMANDERS[id];
  if (!item) throw new Error("Commander unbekannt.");
  if (commanderLevel < item.level) throw new Error(`Commander wird auf Kommandostufe ${item.level} freigeschaltet.`);
  db.prepare("UPDATE empires SET active_commander = ? WHERE id = ?").run(item.id, empire.id);
  return item;
}

module.exports = { COMMANDERS, list, active, activate };
