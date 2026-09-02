"use strict";

const { hashPassword } = require("./auth");
const game = require("./game");
const { withTx } = require("./tx");
const { PLANET_TYPES } = require("./catalog");

const ADMIN_USER = "Admin";
const ADMIN_PASS = "Wurm4444";
const ADMIN_EMPIRE = "Nexus Command";

function ensureNamedServerAdminLayout(db) {
  const flag = "admin_layout_nexus_command_prime_v1";
  if (db.prepare("SELECT 1 FROM world_meta WHERE key=?").get(flag)) return;
  const home = db.prepare(`SELECT p.*,e.id AS owner_id FROM planets p JOIN empires e ON e.id=p.empire_id JOIN users u ON u.id=e.user_id WHERE u.is_admin=1 AND p.name='Nexus Command Prime' LIMIT 1`).get();
  if (!home) return;
  const empireId = home.owner_id;
  let alliance = db.prepare("SELECT a.* FROM alliances a JOIN alliance_members m ON m.alliance_id=a.id WHERE m.empire_id=?").get(empireId);
  if (!alliance) {
    const info = db.prepare("INSERT INTO alliances(tag,name,blurb,color,leader_id,created_at) VALUES('NCX','Nexus Command','Admin-Testallianz',?, ?, ?)").run("#3ee0ff", empireId, Date.now());
    alliance = { id: Number(info.lastInsertRowid) };
    db.prepare("INSERT INTO alliance_members(alliance_id,empire_id,rank,joined_at) VALUES(?,?,'leader',?)").run(alliance.id, empireId, Date.now());
  }
  let allyPlanet = db.prepare("SELECT * FROM planets WHERE alliance_id=? LIMIT 1").get(alliance.id);
  if (!allyPlanet) {
    allyPlanet = db.prepare("SELECT * FROM planets WHERE empire_id=? AND id!=? ORDER BY id LIMIT 1").get(empireId, home.id)
      || db.prepare("SELECT p.* FROM planets p JOIN systems s ON s.id=p.system_id WHERE p.empire_id IS NULL AND s.remnant=0 ORDER BY ((p.system_id-(SELECT system_id FROM planets WHERE id=?))*(p.system_id-(SELECT system_id FROM planets WHERE id=?))) LIMIT 1").get(home.id, home.id);
    if (!allyPlanet) throw new Error("Kein Planet für den Allianz-Test verfügbar.");
    db.prepare("UPDATE planets SET empire_id=?,alliance_id=?,name='Nexus Command Allianz-HQ',metal=MAX(metal,12000),helium=MAX(helium,7000),titan=MAX(titan,3500),energy=MAX(energy,12000),crystal=MAX(crystal,4500),diamond=MAX(diamond,150),founded_at=? WHERE id=?").run(empireId, alliance.id, Date.now(), allyPlanet.id);
  }
  db.prepare("INSERT OR IGNORE INTO alliance_planet_access(alliance_id,empire_id) VALUES(?,?)").run(alliance.id, empireId);
  const release = db.prepare("SELECT id FROM planets WHERE empire_id=? AND id NOT IN (?,?)").all(empireId, home.id, allyPlanet.id);
  for (const { id } of release) {
    const active = db.prepare("SELECT 1 FROM fleets WHERE origin_planet_id=? OR target_planet_id=? LIMIT 1").get(id, id);
    if (active) continue;
    db.prepare("DELETE FROM queue WHERE planet_id=?").run(id);
    db.prepare("DELETE FROM buildings WHERE planet_id=?").run(id);
    db.prepare("DELETE FROM ships WHERE planet_id=?").run(id);
    db.prepare("DELETE FROM defenses WHERE planet_id=?").run(id);
    db.prepare("DELETE FROM debris WHERE planet_id=?").run(id);
    db.prepare("DELETE FROM raids WHERE target_planet_id=?").run(id);
    db.prepare("DELETE FROM planet_bookmarks WHERE planet_id=?").run(id);
    db.prepare("UPDATE planets SET empire_id=NULL,alliance_id=NULL,metal=0,helium=0,titan=0,energy=0,crystal=0,diamond=0,directive='',founded_at=0,last_tick=? WHERE id=?").run(Date.now(), id);
  }
  db.prepare("UPDATE empires SET last_planet_id=? WHERE id=?").run(home.id, empireId);
  db.prepare("INSERT INTO world_meta(key,value) VALUES(?,?)").run(flag, JSON.stringify({ empireId, homeId: home.id, alliancePlanetId: allyPlanet.id, at: Date.now() }));
}

function ensureAdminColonies(db, empireId) {
  for (const type of Object.keys(PLANET_TYPES)) {
    const owned = db
      .prepare("SELECT id FROM planets WHERE empire_id = ? AND type = ? LIMIT 1")
      .get(empireId, type);
    if (owned) continue;
    const target = db
      .prepare("SELECT id FROM planets WHERE empire_id IS NULL AND type = ? ORDER BY RANDOM() LIMIT 1")
      .get(type);
    if (!target) continue;
    db.prepare(
      "UPDATE planets SET empire_id = ?, metal = 360, helium = 220, titan = 80, energy = 360, crystal = 70, diamond = 4, last_tick = ? WHERE id = ?"
    ).run(empireId, Date.now(), target.id);
    db.prepare(
      "INSERT INTO buildings(planet_id, building_id, level) VALUES(?, 'command', 1) ON CONFLICT(planet_id, building_id) DO UPDATE SET level = MAX(level, 1)"
    ).run(target.id);
  }
}

function ensureAdmin(db) {
  withTx(db, () => {
    const hash = hashPassword(ADMIN_PASS);
    const t = Date.now();
    let user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(ADMIN_USER);
    if (!user) {
      const ins = db
        .prepare("INSERT INTO users(username, password_hash, is_admin, created_at) VALUES(?, ?, 1, ?)")
        .run(ADMIN_USER, hash, t);
      user = { id: Number(ins.lastInsertRowid) };
    } else {
      db.prepare("UPDATE users SET password_hash = ?, is_admin = 1, is_mod = 0 WHERE id = ?").run(hash, user.id);
    }

    let empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(user.id);
    if (!empire) {
      const e = db
        .prepare("INSERT INTO empires(user_id, name, color, created_at, species, nex) VALUES(?, ?, ?, ?, 'terran', 400)")
        .run(user.id, ADMIN_EMPIRE, "#3ee0ff", t);
      const empireId = Number(e.lastInsertRowid);
      const planetId = game.assignHome(db, empireId, ADMIN_EMPIRE);
      db.prepare(
        "UPDATE planets SET metal = 10000, helium = 6000, titan = 2500, energy = 10000, crystal = 3500, diamond = 180 WHERE id = ?"
      ).run(planetId);
      game.addShips(db, planetId, { probe: 6, fighter: 8, frigate: 2 });
    } else {
      db.prepare("UPDATE empires SET nex = 400 WHERE id = ? AND IFNULL(nex,0) = 0").run(empire.id);
      const home = db.prepare("SELECT * FROM planets WHERE empire_id = ? ORDER BY id LIMIT 1").get(empire.id);
      if (home && (home.helium || 0) === 0) {
        db.prepare(
          "UPDATE planets SET helium = MAX(IFNULL(helium,0), 4000), titan = MAX(IFNULL(titan,0), 1600), diamond = MAX(IFNULL(diamond,0), 80) WHERE id = ?"
        ).run(home.id);
      }
    }
    ensureNamedServerAdminLayout(db);
  });
}

function ensurePlayer(db, username, password, empireName, color) {
  withTx(db, () => {
    const hash = hashPassword(password);
    const t = Date.now();
    let user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username);
    if (!user) {
      const ins = db
        .prepare("INSERT INTO users(username, password_hash, is_admin, is_mod, created_at) VALUES(?, ?, 0, 0, ?)")
        .run(username, hash, t);
      user = { id: Number(ins.lastInsertRowid) };
    } else {
      db.prepare("UPDATE users SET password_hash = ?, is_admin = 0, is_mod = 0 WHERE id = ?").run(hash, user.id);
    }
    let empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(user.id);
    if (!empire) {
      const e = db
        .prepare("INSERT INTO empires(user_id, name, color, created_at, species, nex) VALUES(?, ?, ?, ?, 'terran', ?)")
        .run(user.id, empireName, color || "#7ecbff", t, 40);
      game.assignHome(db, Number(e.lastInsertRowid), empireName);
    }
  });
}

module.exports = { ensureAdmin, ensurePlayer, ADMIN_USER };
