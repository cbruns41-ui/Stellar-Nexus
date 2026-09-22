"use strict";

const settings = require("./settings");
const premium = require("./premium");
const pirates = require("./pirates");
const { expandGalaxy } = require("./galaxy");
const { bag, RESOURCE_IDS, SHIPS } = require("./catalog");

function assertAdmin(user) {
  if (!user?.is_admin) throw new Error("Nur Admin.");
}

function integerValue(value, fallback, max, label) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error(`${label}: ganze Zahl von 1 bis ${max} erforderlich.`);
  return n;
}

function stats(db) {
  const now = Date.now();
  const online = db.prepare("SELECT COUNT(*) AS n FROM empires WHERE last_seen > ?").get(now - 15 * 60 * 1000).n;
  return {
    users: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
    empires: db.prepare("SELECT COUNT(*) AS n FROM empires").get().n,
    online,
    planets: db.prepare("SELECT COUNT(*) AS n FROM planets WHERE empire_id IS NOT NULL").get().n,
    systems: db.prepare("SELECT COUNT(*) AS n FROM systems").get().n,
    pirates: db.prepare("SELECT COUNT(*) AS n FROM systems WHERE IFNULL(pirate,0) > 0").get().n,
    remnants: db.prepare("SELECT COUNT(*) AS n FROM systems WHERE remnant = 1").get().n,
    fleets: db.prepare("SELECT COUNT(*) AS n FROM fleets").get().n,
    betaRegistrations: db.prepare("SELECT COUNT(*) AS n FROM registration_requests").get().n,
    threat: pirates.threatOf(db).level,
    rift: (() => {
      const row = db.prepare("SELECT value FROM world_meta WHERE key = 'rift'").get();
      if (!row) return null;
      try {
        const d = JSON.parse(row.value);
        if (!d || d.until < Date.now()) return null;
        const sys = db.prepare("SELECT name FROM systems WHERE id = ?").get(d.systemId);
        return { name: sys?.name || d.systemId, until: d.until };
      } catch {
        return null;
      }
    })(),
  };
}

function overview(db, user) {
  assertAdmin(user);
  return {
    stats: stats(db),
    settings: settings.schemaWithValues(db),
  };
}

function saveSettings(db, user, patch) {
  assertAdmin(user);
  const out = settings.set(db, patch);
  require("./moderation").log(db, user.id, null, "settings", Object.keys(out.applied).join(", ") || "keine Änderung");
  return out;
}

function playerAction(db, user, body) {
  assertAdmin(user);
  const moderation = require("./moderation");
  const game = require("./game");
  const target =
    Number(body?.userId) > 0 ? moderation.loadUser(db, Number(body.userId)) : moderation.loadUserByEmpire(db, Number(body.empireId));
  if (!target?.empire_id) throw new Error("Spieler oder Imperium unbekannt.");
  const empire = db.prepare("SELECT * FROM empires WHERE id = ?").get(target.empire_id);
  const action = String(body?.action || "");
  const amount = Number(body?.amount);
  let detail = action;
  let delivery;
  if (action === "nex") {
    const n = integerValue(body?.amount, 100, 5000, 'Nex');
    game.grantNex(db, empire, n);
    detail = `+${n} Nex`;
  } else if (action === "vip") {
    const d = integerValue(body?.amount, 30, 365, 'Pass-Tage');
    premium.grantVipDays(db, empire, d);
    detail = `+${d} Tage Pass`;
  } else if (action === "kit") {
    game.grantResources(db, empire, bag({ metal: 2500, helium: 1200, energy: 2500, titan: 400, crystal: 400, diamond: 8 }));
    detail = "Starterkit Ressourcen";
  } else if (action === "credit") {
    const res = String(body?.resource || "metal");
    if (!RESOURCE_IDS.includes(res)) throw new Error("Unbekannte Ressource.");
    const n = integerValue(body?.amount, 1000, 1000000, 'Ressourcen');
    game.grantResources(db, empire, bag({ [res]: n }));
    detail = `+${n} ${res}`;
  } else if (action === "ships") {
    const shipId = String(body?.shipId || '');
    if (!Object.hasOwn(SHIPS, shipId)) throw new Error('Unbekannter Schiffstyp.');
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 50) throw new Error('Bitte eine ganze Stückzahl von 1 bis 50 angeben.');
    const planet = game.homePlanetOf(db, empire.id);
    if (!planet) throw new Error('Kein Hauptplanet im Imperium.');
    const inventory = () => ({
      stationed: Number(db.prepare('SELECT count FROM ships WHERE planet_id=? AND ship_id=?').get(planet.id, shipId)?.count || 0),
      reserve: Number(db.prepare('SELECT count FROM ship_reserves WHERE planet_id=? AND ship_id=?').get(planet.id, shipId)?.count || 0),
    });
    const before = inventory();
    const planetName = game.grantShipsToHome(db, empire, { [shipId]: amount });
    const after = inventory();
    delivery = { planetId: planet.id, planetName, shipId, amount, stationed: after.stationed - before.stationed, reserve: after.reserve - before.reserve, stock: after };
    if (delivery.stationed + delivery.reserve !== amount) throw new Error('Schiffsgutschrift konnte nicht vollständig verbucht werden.');
    detail = `+${amount} ${SHIPS[shipId].name} auf ${planetName}: ${delivery.stationed} einsatzbereit, ${delivery.reserve} in Reserve`;
    game.addReport(db, empire.id, 'fleet', 'Schiffe vom Admin erhalten', {
      text: detail + (delivery.reserve ? '. Die Reserve wird bei freien Hangarplätzen automatisch übernommen.' : '.'),
      planetId: planet.id, shipsGain: { [shipId]: amount }, adminGrant: true, delivery,
      jumps: [{view:'yard',label:'Zum Hangar',planetId:planet.id}],
    });
  } else if (action === "fighters") {
    const n = integerValue(body?.amount, 5, 50, 'Schiffe');
    game.grantShipsToHome(db, empire, { fighter: n });
    detail = `+${n} Jäger`;
  } else {
    throw new Error("Unbekannte Aktion.");
  }
  require("./moderation").log(db, user.id, target.id, "grant", `${target.username}: ${detail}`);
  return { ok: true, username: target.username, detail, ...(delivery ? {delivery} : {}) };
}

function worldAction(db, user, body) {
  assertAdmin(user);
  const action = String(body?.action || "");
  let result = { ok: true, action };
  if (action === "rift") {
    const hours = integerValue(body?.hours, 3, 24, 'Riss-Dauer');
    const sys = db.prepare("SELECT id, name FROM systems WHERE is_hub = 0 ORDER BY RANDOM() LIMIT 1").get();
    if (!sys) throw new Error("Kein System.");
    db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES('rift', ?)").run(
      JSON.stringify({ systemId: sys.id, until: Date.now() + hours * 3600 * 1000 })
    );
    result.detail = `Riss über ${sys.name} (${hours} Std.)`;
  } else if (action === "expand") {
    const out = expandGalaxy(db);
    result.detail = out.added ? `+${out.added} Systeme (gesamt ${out.total})` : `Keine Erweiterung (bereits ${out.total} Systeme)`;
  } else if (action === "pirate") {
    const t = pirates.threatOf(db);
    if (body?.level !== undefined) t.level = integerValue(body.level, 1, 16, 'Piratenstufe');
    else t.level = Math.min(16, t.level + 1);
    pirates.saveThreat(db, t);
    result.detail = `Piratenstufe ${t.level}`;
  } else if (action === "broadcast") {
    const text = String(body?.body || "").trim().slice(0, 220);
    if (text.length < 2) throw new Error("Text zu kurz.");
    const chat = require("./chat");
    chat.postSystem(db, text);
    result.detail = "Funk gesendet";
  } else {
    throw new Error("Unbekannte Welt-Aktion.");
  }
  require("./moderation").log(db, user.id, null, "world", result.detail || action);
  return result;
}

module.exports = { overview, saveSettings, playerAction, worldAction, stats };
