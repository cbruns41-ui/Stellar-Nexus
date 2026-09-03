"use strict";

const { SHIPS } = require("./catalog");

function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - start) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}

function dayKey() { return new Date().toISOString().slice(0, 10); }

function nextUtcDay() {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function fleetPower(db, empireId) {
  const rows = db.prepare(`SELECT sh.ship_id, SUM(sh.count) AS n FROM ships sh JOIN planets p ON p.id = sh.planet_id WHERE p.empire_id = ? GROUP BY sh.ship_id`).all(empireId);
  return Math.floor(rows.reduce((sum, row) => sum + (SHIPS[row.ship_id]?.attack || 1) * Number(row.n || 0), 0));
}

function resetLocalBoss(db, boss, unlimited) {
  if (!unlimited || (!boss.defeated_at && boss.hp > 0)) return boss;
  db.prepare("UPDATE alliance_bosses SET hp=max_hp, defeated_at=0, available_at=0 WHERE alliance_id=? AND week=?").run(boss.alliance_id, boss.week);
  return db.prepare("SELECT * FROM alliance_bosses WHERE alliance_id=? AND week=?").get(boss.alliance_id, boss.week);
}

function ensure(db, allianceId) {
  const week = weekKey();
  let boss = db.prepare("SELECT * FROM alliance_bosses WHERE alliance_id = ? AND week = ?").get(allianceId, week);
  if (!boss) {
    const members = db.prepare("SELECT empire_id FROM alliance_members WHERE alliance_id = ?").all(allianceId);
    const power = members.reduce((sum, m) => sum + fleetPower(db, m.empire_id), 0);
    const previous = db.prepare("SELECT * FROM alliance_bosses WHERE alliance_id=? ORDER BY rowid DESC LIMIT 1").get(allianceId);
    const level = previous ? Number(previous.level || 1) + (previous.defeated_at ? 1 : 0) : 1;
    const levelFactor = Math.pow(1.5, Math.max(0, level - 1));
    const baseline = Math.max(15000, Math.floor((power * 24 + members.length * 6000) * levelFactor));
    const maxHp = Math.min(25000000, previous?.defeated_at ? Math.max(baseline, Math.floor(previous.max_hp * 1.7 + level * 5000)) : baseline);
    db.prepare("INSERT INTO alliance_bosses(alliance_id, week, hp, max_hp, defeated_at, level) VALUES(?,?,?,?,0,?)").run(allianceId, week, maxHp, maxHp, level);
    boss = db.prepare("SELECT * FROM alliance_bosses WHERE alliance_id = ? AND week = ?").get(allianceId, week);
  }
  const members = db.prepare("SELECT empire_id FROM alliance_members WHERE alliance_id = ?").all(allianceId);
  const currentPower = members.reduce((sum, m) => sum + fleetPower(db, m.empire_id), 0);
  const targetHp = Math.min(25000000, Math.max(15000, Math.floor((currentPower * 24 + members.length * 6000) * Math.pow(1.5, Math.max(0, Number(boss.level || 1) - 1)))));
  if (!boss.defeated_at && Number(boss.max_hp) < targetHp) {
    const extra = targetHp - Number(boss.max_hp);
    db.prepare("UPDATE alliance_bosses SET hp=hp+?, max_hp=? WHERE alliance_id=? AND week=?").run(extra, targetHp, allianceId, boss.week);
    boss = db.prepare("SELECT * FROM alliance_bosses WHERE alliance_id=? AND week=?").get(allianceId, boss.week);
  }
  if (boss.defeated_at && boss.available_at && Date.now() >= boss.available_at) {
    const level = Number(boss.level || 1) + 1;
    const maxHp = Math.min(25000000, Math.floor(Number(boss.max_hp) * 1.7 + level * 5000));
    db.prepare("UPDATE alliance_bosses SET level=?, hp=?, max_hp=?, defeated_at=0, available_at=0 WHERE alliance_id=? AND week=?").run(level, maxHp, maxHp, allianceId, week);
    boss = db.prepare("SELECT * FROM alliance_bosses WHERE alliance_id = ? AND week = ?").get(allianceId, week);
  }
  return boss;
}

function publicBoss(db, allianceId, empireId, options = {}) {
  const boss = resetLocalBoss(db, ensure(db, allianceId), options.unlimited);
  const attempts = db.prepare("SELECT COUNT(*) AS n FROM alliance_boss_hits WHERE alliance_id = ? AND week = ? AND boss_level=? AND empire_id = ? AND day = ?").get(allianceId, boss.week, boss.level || 1, empireId, dayKey()).n;
  const contributors = db.prepare(`SELECT h.empire_id AS empireId, e.name, SUM(h.damage) AS damage FROM alliance_boss_hits h JOIN empires e ON e.id = h.empire_id WHERE h.alliance_id = ? AND h.week = ? AND h.boss_level=? GROUP BY h.empire_id, e.name ORDER BY damage DESC LIMIT 8`).all(allianceId, boss.week, boss.level || 1);
  const mine = contributors.find((x) => x.empireId === empireId)?.damage || 0;
  return { week: boss.week, level: boss.level || 1, name: "Abyssaler Weltenbrecher", hp: boss.hp, maxHp: boss.max_hp, defeated: !!boss.defeated_at, defeatedAt: boss.defeated_at || 0, availableAt: boss.available_at || 0, attemptsLeft: options.unlimited ? null : Math.max(0, 3 - attempts), unlimited: !!options.unlimited, mine, contributors };
}

function rewardContributors(db, boss) {
  const ids = db.prepare("SELECT DISTINCT empire_id FROM alliance_boss_hits WHERE alliance_id = ? AND week = ? AND boss_level=?").all(boss.alliance_id, boss.week, boss.level || 1);
  for (const { empire_id: empireId } of ids) {
    const mul = 1 + Math.max(0, Number(boss.level || 1) - 1) * .15;
    const reward = { metal: Math.floor(1800 * mul), energy: Math.floor(1200 * mul), crystal: Math.floor(700 * mul), helium: Math.floor(500 * mul), titan: Math.floor(250 * mul), diamond: 12 + Math.floor((boss.level || 1) / 2) };
    const home = db.prepare("SELECT * FROM planets WHERE empire_id = ? AND IFNULL(alliance_id,0)=0 ORDER BY id LIMIT 1").get(empireId);
    if (home) db.prepare("UPDATE planets SET metal=metal+?, energy=energy+?, crystal=crystal+?, helium=helium+?, titan=titan+?, diamond=diamond+? WHERE id=?").run(reward.metal, reward.energy, reward.crystal, reward.helium, reward.titan, reward.diamond, home.id);
    db.prepare("UPDATE empires SET xp=IFNULL(xp,0)+180 WHERE id=?").run(empireId);
    db.prepare("INSERT INTO reports(empire_id,kind,title,body,created_at,seen) VALUES(?,?,?,?,?,0)").run(empireId, "alliance", `Allianz-Boss Stufe ${boss.level || 1} besiegt`, JSON.stringify({ text: "Der Weltenbrecher ist gefallen. Gemeinschaftsbelohnung gutgeschrieben.", loot: reward, xp: 180 }), Date.now());
  }
}

function attack(db, allianceId, empire, score = 0, options = {}) {
  const member = db.prepare("SELECT 1 FROM alliance_members WHERE alliance_id = ? AND empire_id = ?").get(allianceId, empire.id);
  if (!member) throw new Error("Du gehörst nicht zu dieser Allianz.");
  const boss = resetLocalBoss(db, ensure(db, allianceId), options.unlimited);
  if (boss.defeated_at || boss.hp <= 0) throw new Error("Der Allianz-Boss ist diese Woche bereits besiegt.");
  const used = db.prepare("SELECT COUNT(*) AS n FROM alliance_boss_hits WHERE alliance_id=? AND week=? AND boss_level=? AND empire_id=? AND day=?").get(allianceId, boss.week, boss.level || 1, empire.id, dayKey()).n;
  if (!options.unlimited && used >= 3) throw new Error("Heute sind bereits drei Angriffe geflogen.");
  const power = fleetPower(db, empire.id);
  if (power <= 0) throw new Error("Du brauchst stationierte Kampfschiffe.");
  const skill = Math.max(0, Math.min(250, Math.floor(Number(score) || 0)));
  const skillMul = .78 + skill / 500;
  const damage = Math.max(1, Math.min(Math.ceil(boss.max_hp * .1), Math.floor(power * (2.15 + Math.random() * 1.15) * skillMul)));
  const hp = Math.max(0, boss.hp - damage);
  const defeatedAt = hp === 0 ? Date.now() : 0;
  db.prepare("INSERT INTO alliance_boss_hits(alliance_id,week,boss_level,empire_id,day,damage,created_at) VALUES(?,?,?,?,?,?,?)").run(allianceId, boss.week, boss.level || 1, empire.id, dayKey(), damage, Date.now());
  db.prepare("UPDATE alliance_bosses SET hp=?, defeated_at=?, available_at=? WHERE alliance_id=? AND week=?").run(hp, defeatedAt, defeatedAt ? nextUtcDay() : 0, allianceId, boss.week);
  if (defeatedAt) rewardContributors(db, { ...boss, hp, defeated_at: defeatedAt });
  return { damage, defeated: !!defeatedAt, score: skill };
}

module.exports = { weekKey, publicBoss, attack };
