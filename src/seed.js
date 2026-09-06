"use strict";

const { hashPassword } = require("./auth");
const game = require("./game");
const { withTx } = require("./tx");

const ADMIN_USER = "Admin";
const ADMIN_PASS = "Wurm4444";
const ADMIN_EMPIRE = "Nexus Command";

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
    } else { return; }

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
    } else { return; }
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
