"use strict";

const KEY = "admin_settings";

const SCHEMA = [
  { key: "announcement", type: "text", group: "Welt", label: "Ankündigung", hint: "Leiste oben für alle. Leer = aus." },
  { key: "registrationOpen", type: "bool", group: "Welt", label: "Registrierung offen", default: true },
  { key: "maintenance", type: "bool", group: "Welt", label: "Wartung (nur Admins im Spiel)", default: false },
  { key: "newbieDays", type: "int", group: "Kampf", label: "Anfängerschutz (Tage)", default: 5, min: 0, max: 60 },
  { key: "fairRatioPct", type: "int", group: "Kampf", label: "Fair-Play Mindest-%", default: 25, min: 5, max: 90 },
  { key: "fairMinScore", type: "int", group: "Kampf", label: "Fair-Play ab Punkte", default: 1500, min: 0, max: 500000 },
  { key: "bashLimit", type: "int", group: "Kampf", label: "Angriffe / 24h je Ziel", default: 5, min: 1, max: 30 },
  { key: "dailyNex", type: "int", group: "Premium", label: "Tages-Nex F2P", default: 10, min: 0, max: 200 },
  { key: "dailyNexVip", type: "int", group: "Premium", label: "Tages-Nex Pass", default: 16, min: 0, max: 400 },
  { key: "starterNex", type: "int", group: "Premium", label: "Starter-Nex", default: 40, min: 0, max: 2000 },
  { key: "bookmarkFree", type: "int", group: "Premium", label: "Lesezeichen F2P", default: 8, min: 2, max: 80 },
  { key: "bookmarkVip", type: "int", group: "Premium", label: "Lesezeichen Pass", default: 24, min: 4, max: 120 },
  { key: "allianceMembersBase", type: "int", group: "Allianz", label: "Mitglieder Startlimit", default: 15, min: 5, max: 30 },
  { key: "allianceMembersMax", type: "int", group: "Allianz", label: "Mitglieder Maximum (hart)", default: 30, min: 15, max: 30 },
  { key: "prodPct", type: "int", group: "Wirtschaft", label: "Globale Produktion %", hint: "100 = Katalog. Senken verknappt Erz und macht Nex-Konvois wertvoller.", default: 100, min: 40, max: 160 },
  { key: "fuelPct", type: "int", group: "Wirtschaft", label: "Treibstoffkosten %", hint: "Wirkt auf Helium-Verbrauch je Sprung.", default: 100, min: 50, max: 250 },
  { key: "activityLootPct", type: "int", group: "Wirtschaft", label: "Einsatz-Beute %", default: 80, min: 40, max: 160 },
  { key: "spyBasePct", type: "int", group: "Spionage", label: "Spionage Basis-Chance %", hint: "Vor Gebäude, Rasse und Gegner-Abwehr.", default: 52, min: 10, max: 90 },
  { key: "spyCenterBonusPct", type: "int", group: "Spionage", label: "+% je Spionagezentrum-Stufe", default: 6, min: 1, max: 12 },
  { key: "spyFloorPct", type: "int", group: "Spionage", label: "Mindest-Erfolg %", default: 8, min: 3, max: 40 },
  { key: "spyCapPct", type: "int", group: "Spionage", label: "Maximal-Erfolg %", default: 92, min: 50, max: 99 },
  { key: "betaEmail", type: "text", group: "Closed Beta", label: "Beta-Empfänger E-Mail", hint: "Registrierungen werden an diese Adresse gesendet.", default: "" },
  { key: "betaOpen", type: "bool", group: "Closed Beta", label: "Beta-Registrierung offen", default: true },
];

const DEFAULTS = Object.fromEntries(SCHEMA.map((s) => [s.key, s.default ?? (s.type === "text" ? "" : s.type === "bool" ? false : 0)]));

function readRaw(db) {
  const row = db.prepare("SELECT value FROM world_meta WHERE key = ?").get(KEY);
  if (!row) return {};
  try {
    const data = JSON.parse(row.value);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function coerce(spec, raw) {
  if (spec.type === "bool") return raw === true || raw === 1 || raw === "1" || raw === "on" || raw === "true";
  if (spec.type === "text") return String(raw ?? "").slice(0, 280);
  let n = Number(raw);
  if (!Number.isFinite(n)) n = spec.default ?? 0;
  n = Math.round(n);
  if (spec.min != null) n = Math.max(spec.min, n);
  if (spec.max != null) n = Math.min(spec.max, n);
  return n;
}

function get(db) {
  const raw = readRaw(db);
  const out = { ...DEFAULTS };
  for (const spec of SCHEMA) {
    if (raw[spec.key] !== undefined) out[spec.key] = coerce(spec, raw[spec.key]);
  }
  return out;
}

function set(db, patch) {
  const cur = { ...readRaw(db) };
  const applied = {};
  for (const spec of SCHEMA) {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, spec.key)) continue;
    const v = coerce(spec, patch[spec.key]);
    cur[spec.key] = v;
    applied[spec.key] = v;
  }
  db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES(?, ?)").run(KEY, JSON.stringify(cur));
  return { values: get(db), applied };
}

function schemaWithValues(db) {
  const values = get(db);
  const groups = [];
  const seen = new Map();
  for (const spec of SCHEMA) {
    if (!seen.has(spec.group)) {
      seen.set(spec.group, []);
      groups.push({ name: spec.group, fields: seen.get(spec.group) });
    }
    seen.get(spec.group).push({ ...spec, value: values[spec.key] });
  }
  return { values, groups };
}

module.exports = { SCHEMA, DEFAULTS, get, set, schemaWithValues };
