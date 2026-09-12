"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { addShips, shipsMap, splitShipSurvivors } = require("../src/game");
const { orbitSiegeReward, capStats, lootForWave } = require("../src/orbitSiege");
const { withTx } = require("../src/tx");

test("returning ships are never discarded by a station capacity check", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ships (planet_id INTEGER, ship_id TEXT, count INTEGER, PRIMARY KEY (planet_id, ship_id))");
  db.exec(`CREATE TABLE planets(id INTEGER PRIMARY KEY,empire_id INTEGER,alliance_id INTEGER);
    CREATE TABLE buildings(planet_id INTEGER,building_id TEXT,level INTEGER);
    CREATE TABLE empires(id INTEGER PRIMARY KEY,ship_cap_boost_until INTEGER,ship_cap_bonus INTEGER);
    CREATE TABLE ship_reserves(planet_id INTEGER,ship_id TEXT,count INTEGER,PRIMARY KEY(planet_id,ship_id));
    INSERT INTO planets VALUES(1,1,NULL); INSERT INTO empires VALUES(1,0,0);`);
  db.prepare("INSERT INTO ships(planet_id, ship_id, count) VALUES(1, 'fighter', 20)").run();

  addShips(db, 1, { fighter: 7, bomber: 3 });

  assert.deepEqual(shipsMap(db, 1), { fighter: 20 });
  const { reserveMap, reconcile, shipCap } = require("../src/hangar");
  assert.deepEqual(reserveMap(db,1),{bomber:3,fighter:7});
  db.exec("INSERT INTO buildings VALUES(1,'shipyard',1)");
  assert.equal(shipCap(db,1),50);
  reconcile(db,1);
  assert.deepEqual(shipsMap(db,1),{bomber:3,fighter:27});
  assert.deepEqual(reserveMap(db,1),{});
  db.close();
});

test("intercept losses are shared without creating or deleting extra ships", () => {
  const stationed = { fighter: 10, bomber: 2 };
  const allyA = { fighter: 5, bomber: 3 };
  const allyB = { fighter: 5 };
  const split = splitShipSurvivors([stationed, allyA, allyB], { fighter: 8, bomber: 2 });

  assert.equal(split.reduce((n, group) => n + (group.fighter || 0), 0), 12);
  assert.equal(split.reduce((n, group) => n + (group.bomber || 0), 0), 3);
  split.forEach((group, i) => {
    const original = [stationed, allyA, allyB][i];
    assert.ok((group.fighter || 0) <= (original.fighter || 0));
    assert.ok((group.bomber || 0) <= (original.bomber || 0));
  });
});

test("world operations can safely join an existing transaction", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE events (id INTEGER PRIMARY KEY)");
  withTx(db, () => {
    db.prepare("INSERT INTO events DEFAULT VALUES").run();
    withTx(db, () => db.prepare("INSERT INTO events DEFAULT VALUES").run());
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events").get().n, 2);
});

test("orbit siege loot scales with held waves and caps instant claims", () => {
  const zero = orbitSiegeReward(0, 0, () => 0);
  assert.equal(zero.waves, 0);
  assert.ok(zero.loot.metal >= 12);
  const three = orbitSiegeReward(3, 10, () => 0);
  assert.equal(three.waves, 3);
  assert.equal(three.kills, 10);
  assert.ok(three.loot.metal > lootForWave(1).metal);
  const capped = capStats(4000, 99, 999);
  assert.equal(capped.waves, 0);
  const later = capStats(20000, 99, 999);
  assert.equal(later.waves, 4);
  assert.ok(later.kills <= later.waves * 24 + 8);
});
