"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const commanders = require("../src/commanders");
const { windowAt, TIERS } = require("../src/sectorSeason");
const allianceBoss = require("../src/allianceBoss");
const { shipCap, allianceStorageCap, reportShipLosses, addReport } = require("../src/game");
const { openDb } = require("../src/db");
const { canDo } = require("../src/social");

test("commander unlocks and bonuses follow command level", () => {
  const low = commanders.list({ active_commander: "voss" }, 1);
  assert.equal(low.find((c) => c.id === "voss").unlocked, true);
  assert.equal(low.find((c) => c.id === "kael").unlocked, false);
  assert.equal(commanders.active({ active_commander: "nyra" }).loot, 0.12);
});

test("alliance ranks expose scoped leadership permissions", () => {
  assert.equal(canDo("leader", "rank"), true);
  assert.equal(canDo("coleader", "kick"), true);
  assert.equal(canDo("diplomat", "edit"), true);
  assert.equal(canDo("diplomat", "rank"), false);
  assert.equal(canDo("officer", "planet"), true);
  assert.equal(canDo("officer", "edit"), false);
  assert.equal(canDo("member", "planet"), false);
});

test("sector seasons are stable fourteen-day windows with increasing milestones", () => {
  const first = windowAt(Date.UTC(2026, 0, 5));
  const next = windowAt(first.end);
  assert.equal(first.end - first.start, 14 * 86400000);
  assert.equal(next.index, first.index + 1);
  assert.deepEqual(TIERS.map((tier) => tier.score), [100, 300, 700]);
});

test("alliance warehouse and station capacity exceed normal colony scale", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE planets(id INTEGER PRIMARY KEY, empire_id INTEGER, alliance_id INTEGER);
    CREATE TABLE alliance_members(alliance_id INTEGER, empire_id INTEGER);
    CREATE TABLE buildings(planet_id INTEGER, building_id TEXT, level INTEGER);
    CREATE TABLE empires(id INTEGER PRIMARY KEY, ship_cap_boost_until INTEGER, ship_cap_bonus INTEGER);
    INSERT INTO empires VALUES(1,0,0);
    INSERT INTO planets VALUES(1,1,7);
    INSERT INTO alliance_members VALUES(7,1),(7,2),(7,3);
    INSERT INTO buildings VALUES(1,'defense_hub',4);
  `);
  assert.equal(shipCap(db, 1), 1620);
  assert.equal(allianceStorageCap().metal, 500000);
  assert.equal(allianceStorageCap().diamond, 10000);
});

test("fleet audit selects the viewer's actual loss map", () => {
  assert.deepEqual(reportShipLosses({ viewer: "defender", defLost: { fighter: 3 }, atkLost: { fighter: 9 } }, 4), { fighter: 3 });
  assert.deepEqual(reportShipLosses({ viewer: "attacker", attackers: [{ empireId: 4, lost: { bomber: 2 } }], atkLost: { bomber: 8 } }, 4), { bomber: 2 });
  assert.deepEqual(reportShipLosses({ lost: { frigate: 1 } }, 4), { frigate: 1 });
});

test("database triggers journal every ship stock mutation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stellar-ledger-"));
  const db = openDb(path.join(dir, "test.db"));
  try {
    const stamp = Date.now();
    db.prepare("INSERT INTO users(username,password_hash,created_at) VALUES('ledger','x',?)").run(stamp);
    const userId = Number(db.prepare("SELECT id FROM users WHERE username='ledger'").get().id);
    db.prepare("INSERT INTO empires(user_id,name,color,created_at) VALUES(?,?,?,?)").run(userId,"Ledger","#00d9ff",stamp);
    const empireId = Number(db.prepare("SELECT id FROM empires WHERE user_id=?").get(userId).id);
    const planetId = Number(db.prepare("SELECT id FROM planets WHERE empire_id IS NULL LIMIT 1").get().id);
    db.prepare("UPDATE planets SET empire_id=? WHERE id=?").run(empireId,planetId);
    db.prepare("INSERT INTO ships(planet_id,ship_id,count) VALUES(?,?,?)").run(planetId,"fighter",8);
    const reportId = addReport(db, empireId, "build", "8 Jäger fertig", { planetId, text: "Werftauftrag abgeschlossen." });
    db.prepare("UPDATE ships SET count=5 WHERE planet_id=? AND ship_id='fighter'").run(planetId);
    db.prepare("DELETE FROM ships WHERE planet_id=? AND ship_id='fighter'").run(planetId);
    const rows = db.prepare("SELECT before_count AS beforeCount,after_count AS afterCount FROM fleet_ledger WHERE empire_id=? ORDER BY id").all(empireId);
    assert.deepEqual(rows.map((row) => ({ ...row })), [{ beforeCount: 0, afterCount: 8 }, { beforeCount: 8, afterCount: 5 }, { beforeCount: 5, afterCount: 0 }]);
    assert.equal(Number(db.prepare("SELECT report_id FROM fleet_ledger WHERE empire_id=? ORDER BY id LIMIT 1").get(empireId).report_id), reportId);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("defeated alliance boss returns at a stronger level", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE alliance_members(alliance_id INTEGER, empire_id INTEGER);
    CREATE TABLE empires(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE planets(id INTEGER PRIMARY KEY, empire_id INTEGER);
    CREATE TABLE ships(planet_id INTEGER, ship_id TEXT, count INTEGER);
    CREATE TABLE alliance_bosses(alliance_id INTEGER, week TEXT, hp INTEGER, max_hp INTEGER, defeated_at INTEGER DEFAULT 0, available_at INTEGER DEFAULT 0, level INTEGER DEFAULT 1, UNIQUE(alliance_id,week));
    CREATE TABLE alliance_boss_hits(alliance_id INTEGER, week TEXT, boss_level INTEGER, empire_id INTEGER, day TEXT, damage INTEGER, created_at INTEGER);
    INSERT INTO alliance_members VALUES(7,1);
    INSERT INTO empires VALUES(1,'Tester');
    INSERT INTO planets VALUES(1,1);
    INSERT INTO ships VALUES(1,'fighter',10);
  `);
  const first = allianceBoss.publicBoss(db, 7, 1);
  assert.ok(first.maxHp >= 15000);
  db.prepare("UPDATE alliance_bosses SET hp=0, defeated_at=1, available_at=1 WHERE alliance_id=7").run();
  const returned = allianceBoss.publicBoss(db, 7, 1);
  assert.equal(returned.level, 2);
  assert.ok(returned.maxHp > first.maxHp);
  assert.ok(returned.maxHp >= first.maxHp * 1.7);
  assert.equal(returned.defeated, false);
});

test("local boss test mode revives immediately and removes the attempt cap", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE alliance_members(alliance_id INTEGER, empire_id INTEGER);
    CREATE TABLE empires(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE planets(id INTEGER PRIMARY KEY, empire_id INTEGER);
    CREATE TABLE ships(planet_id INTEGER, ship_id TEXT, count INTEGER);
    CREATE TABLE alliance_bosses(alliance_id INTEGER, week TEXT, hp INTEGER, max_hp INTEGER, defeated_at INTEGER DEFAULT 0, available_at INTEGER DEFAULT 0, level INTEGER DEFAULT 1, UNIQUE(alliance_id,week));
    CREATE TABLE alliance_boss_hits(alliance_id INTEGER, week TEXT, boss_level INTEGER, empire_id INTEGER, day TEXT, damage INTEGER, created_at INTEGER);
    INSERT INTO alliance_members VALUES(7,1);
    INSERT INTO empires VALUES(1,'Tester');
    INSERT INTO planets VALUES(1,1);
    INSERT INTO ships VALUES(1,'fighter',10);
  `);
  const first = allianceBoss.publicBoss(db, 7, 1);
  db.prepare("UPDATE alliance_bosses SET hp=0, defeated_at=1, available_at=? WHERE alliance_id=7").run(Date.now() + 86400000);
  const local = allianceBoss.publicBoss(db, 7, 1, { unlimited: true });
  assert.equal(local.level, first.level);
  assert.equal(local.hp, local.maxHp);
  assert.equal(local.attemptsLeft, null);
  assert.equal(local.unlimited, true);
});
